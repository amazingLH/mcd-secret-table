import type {
  MenuItem,
  NegotiationResult,
  PrivateEvaluation,
  PrivateProfile,
  Proposal,
} from './types';

const clamp = (value: number, min = 0, max = 100) =>
  Math.min(max, Math.max(min, value));

const total = (items: MenuItem[], field: 'price' | 'calories' | 'protein') =>
  items.reduce((sum, item) => sum + (item[field] ?? 0), 0);

/**
 * The private profile stays captured inside this closure. The coordinator only
 * receives a small verdict object and cannot inspect the original constraints.
 */
export function createPrivatePreferenceAgent(
  profile: PrivateProfile,
  menu: MenuItem[],
) {
  const menuById = new Map(menu.map((item) => [item.id, item]));

  return {
    id: profile.agentId,
    displayName: profile.displayName,
    evaluate(proposal: Proposal): PrivateEvaluation {
      const assignment = proposal.assignments.find(
        (candidate) => candidate.agentId === profile.agentId,
      );
      const items = (assignment?.itemIds ?? [])
        .map((id) => menuById.get(id))
        .filter((item): item is MenuItem => Boolean(item));
      const hasUnknownItem = items.length !== (assignment?.itemIds.length ?? 0);
      const tags = new Set(items.flatMap((item) => item.tags));
      const price = total(items, 'price');
      const calories = total(items, 'calories');
      const protein = total(items, 'protein');

      const violatesBlocked = profile.blockedTags.some((tag) => tags.has(tag));
      const missesRequired = (profile.requiredTags ?? []).some(
        (tag) => !tags.has(tag),
      );
      const violatesBudget = price > profile.budget;
      const violatesCalories =
        profile.maxCalories !== undefined &&
        (items.some((item) => item.calories === null) || calories > profile.maxCalories);
      const violatesProtein =
        profile.minProtein !== undefined &&
        (items.some((item) => item.protein === null) || protein < profile.minProtein);
      const hardFailure =
        items.length === 0 ||
        hasUnknownItem ||
        violatesBlocked ||
        missesRequired ||
        violatesBudget ||
        violatesCalories ||
        violatesProtein;

      const preferenceHits = profile.preferredTags.filter((tag) => tags.has(tag)).length;
      const preferenceScore = profile.preferredTags.length
        ? (preferenceHits / profile.preferredTags.length) * 38
        : 25;
      const budgetScore = clamp((1 - price / profile.budget) * 28 + 18, 0, 32);
      const varietyScore = clamp(new Set(items.flatMap((item) => item.tags)).size * 4, 0, 18);
      const proteinBonus = profile.minProtein
        ? clamp((protein / profile.minProtein) * 12, 0, 12)
        : 8;
      const utility = hardFailure
        ? 0
        : Math.round(clamp(18 + preferenceScore + budgetScore + varietyScore + proteinBonus));

      return {
        agentId: profile.agentId,
        proposalId: proposal.id,
        accepted: !hardFailure && utility >= 55,
        utility,
        publicSignal: !hardFailure && utility >= 55 ? 'accept' : 'revise',
      };
    },
  };
}

export type PreferenceAgent = ReturnType<typeof createPrivatePreferenceAgent>;

export function rankProposals(
  proposals: Proposal[],
  agents: PreferenceAgent[],
): NegotiationResult[] {
  if (agents.length === 0) throw new Error('至少需要一位参与者。');
  return proposals
    .map((proposal) => {
      const evaluations = agents.map((agent) => agent.evaluate(proposal));
      const fairness = Math.min(...evaluations.map((evaluation) => evaluation.utility));
      const averageUtility = Math.round(
        evaluations.reduce((sum, evaluation) => sum + evaluation.utility, 0) /
          evaluations.length,
      );
      return {
        proposal,
        evaluations,
        fairness,
        averageUtility,
        acceptedByAll: evaluations.every((evaluation) => evaluation.accepted),
      };
    })
    .sort((left, right) => {
      if (left.acceptedByAll !== right.acceptedByAll) {
        return Number(right.acceptedByAll) - Number(left.acceptedByAll);
      }
      if (left.fairness !== right.fairness) return right.fairness - left.fairness;
      if (left.averageUtility !== right.averageUtility) {
        return right.averageUtility - left.averageUtility;
      }
      return left.proposal.id.localeCompare(right.proposal.id);
    });
}

export function redactForPublicTrace(result: NegotiationResult) {
  return {
    proposalId: result.proposal.id,
    acceptedByAll: result.acceptedByAll,
    fairness: result.fairness,
    averageUtility: result.averageUtility,
    signals: result.evaluations.map(({ agentId, publicSignal, utility }) => ({
      agentId,
      publicSignal,
      utility,
    })),
  };
}
