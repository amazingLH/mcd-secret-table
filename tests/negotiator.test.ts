import { describe, expect, it } from 'vitest';
import { authorizeAction } from '../src/agent/actionGate';
import { demoMenu, demoProfiles, demoProposals } from '../src/agent/fixtures';
import {
  createPrivatePreferenceAgent,
  rankProposals,
  redactForPublicTrace,
} from '../src/agent/negotiator';

const agents = demoProfiles.map((profile) =>
  createPrivatePreferenceAgent(profile, demoMenu),
);

describe('privacy-preserving negotiation', () => {
  it('selects a deterministic max-min result', () => {
    const first = rankProposals(demoProposals, agents);
    const second = rankProposals(demoProposals, agents);
    expect(first[0].proposal.id).toBe(second[0].proposal.id);
    expect(first[0].acceptedByAll).toBe(true);
    expect(first[0].fairness).toBeGreaterThanOrEqual(first.at(-1)!.fairness);
  });

  it('does not expose private profiles in the public trace', () => {
    const result = rankProposals(demoProposals, agents)[0];
    const serialized = JSON.stringify(redactForPublicTrace(result));
    for (const profile of demoProfiles) {
      expect(serialized).not.toContain(`\"budget\":${profile.budget}`);
      expect(serialized).not.toContain('blockedTags');
      expect(serialized).not.toContain('preferredTags');
    }
  });

  it('blocks order creation before explicit confirmation', () => {
    expect(authorizeAction('create-order', false).allowed).toBe(false);
    expect(authorizeAction('create-order', true).allowed).toBe(true);
    expect(authorizeAction('query-meals', false).allowed).toBe(true);
  });
});
