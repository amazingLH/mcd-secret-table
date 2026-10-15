import { createPrivatePreferenceAgent } from './negotiator';
import type { PrivateProfile, Proposal } from './types';
import type { LiveMenuItem, LocalOffer } from './liveTypes';

/** Raw profiles never leave the caller. Return a few voluntarily acceptable offers. */
export function buildLocalOffers(profiles: PrivateProfile[], menu: LiveMenuItem[]): LocalOffer[] {
  const mains = menu.filter((item) => item.kind === 'main');
  const extras = menu.filter((item) => item.kind !== 'main');
  return profiles.flatMap((profile) => {
    const evaluator = createPrivatePreferenceAgent(profile, menu);
    const accepted: LocalOffer[] = [];
    for (const main of mains) {
      const bundles = [[main.id], ...extras.map((extra) => [main.id, extra.id])];
      for (let i = 0; i < extras.length; i++) {
        for (let j = i + 1; j < extras.length; j++) {
          bundles.push([main.id, extras[i].id, extras[j].id]);
        }
      }
      for (const itemIds of bundles) {
        const proposal: Proposal = { id: 'local-only', label: '', assignments: [{ agentId: profile.agentId, itemIds }] };
        const evaluation = evaluator.evaluate(proposal);
        if (evaluation.accepted) accepted.push({ agentId: profile.agentId, itemIds, utility: evaluation.utility });
      }
    }
    const prices = new Map(menu.map((item) => [item.id, Math.round(item.price * 100)]));
    const amount = (offer: LocalOffer) => offer.itemIds.reduce((sum, id) => sum + prices.get(id)!, 0);
    accepted.sort((a, b) => b.utility - a.utility || amount(a) - amount(b));
    // Include cheaper acceptable options, so the shared public budget can be met.
    const selected = [...accepted.slice(0, 4), ...[...accepted].sort((a, b) => amount(a) - amount(b)).slice(0, 2)];
    const seen = new Set<string>();
    return selected.filter((offer) => {
      const key = offer.itemIds.join(',');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  });
}
