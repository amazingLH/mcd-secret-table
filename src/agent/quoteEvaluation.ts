import { createPrivatePreferenceAgent } from './negotiator';
import type { OfficialQuote } from './liveTypes';
import type { MenuItem, NegotiationResult, PrivateProfile, Proposal } from './types';

/** Recheck private budgets against the final official cart, including quantity rounding. */
export function evaluateOfficialQuote(proposal: Proposal, profiles: PrivateProfile[], menu: MenuItem[], quote: OfficialQuote): NegotiationResult {
  if (quote.proposalId !== proposal.id) throw new Error('核价对应的方案不一致。');
  const lines = new Map(quote.items.map((item) => [item.id, item]));
  const sum = quote.items.reduce((amount, item) => amount + item.subtotalFen, 0);
  if (sum !== quote.amountFen) throw new Error('报价包含尚未分摊的费用或折扣，暂不能确认个人预算。');
  const expected = new Map<string, number>();
  for (const id of proposal.assignments.flatMap((a) => a.itemIds)) expected.set(id, (expected.get(id) ?? 0) + 1);
  if (lines.size !== expected.size || [...expected].some(([id, count]) => lines.get(id)?.quantity !== count)) throw new Error('报价商品与餐单不一致。');
  const used = new Map<string, number>();
  const evaluations = profiles.map((profile) => {
    const assignment = proposal.assignments.find((a) => a.agentId === profile.agentId);
    if (!assignment) throw new Error('餐单缺少参与者。');
    const allocatedMenu = menu.map((item) => {
      const line = lines.get(item.id);
      if (!line || !assignment.itemIds.includes(item.id)) return item;
      const index = used.get(item.id) ?? 0;
      used.set(item.id, index + 1);
      const unit = Math.floor(line.subtotalFen / line.quantity);
      const extra = index < line.subtotalFen % line.quantity ? 1 : 0;
      return { ...item, price: (unit + extra) / 100 };
    });
    return createPrivatePreferenceAgent(profile, allocatedMenu).evaluate(proposal);
  });
  return { proposal, evaluations,
    fairness: Math.min(...evaluations.map((e) => e.utility)),
    averageUtility: Math.round(evaluations.reduce((sum, e) => sum + e.utility, 0) / evaluations.length),
    acceptedByAll: evaluations.every((e) => e.accepted) };
}
