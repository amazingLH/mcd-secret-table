import type { MenuItem, NegotiationResult, PrivateProfile } from './types';

type Participant = Pick<PrivateProfile, 'agentId' | 'displayName'>;
export type QuoteCheck = 'checking' | 'passed' | 'failed';

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Presentation only: never change IDs in model requests, feedback or quotes. */
export function explainIdentifiers(text: string, menu: MenuItem[], participants: Participant[] = []) {
  const labels = new Map([...menu.map((item) => [item.id, item.name] as const),
    ...participants.map((person) => [person.agentId, person.displayName] as const)]);
  const ids = [...labels.keys()].filter(Boolean).sort((a, b) => b.length - a.length);
  const readable = ids.length ? text.replace(
    new RegExp(`(?<![A-Za-z0-9_.-])(${ids.map(escapeRegex).join('|')})(?![A-Za-z0-9_.-]|元|分|克|千卡)`, 'g'),
    (id: string, _match: string, offset: number) => {
      const name = labels.get(id)!;
      const tail = text.slice(offset + id.length);
      return tail.startsWith(`（${name}）`) || tail.startsWith(`(${name})`) ? id : `${id}（${name}）`;
    },
  ) : text;
  const withRounds = readable.replace(/(?<![A-Za-z0-9_./:@-])r([1-3])(?:-p([1-4]))?(?![A-Za-z0-9_.-])/g,
    (id: string, round: string, proposal: string | undefined, offset: number) => {
      const label = `第${round}轮协商${proposal ? `·方案${proposal}` : ''}`;
      const tail = readable.slice(offset + id.length);
      return tail.startsWith(`（${label}）`) || tail.startsWith(`(${label})`) ? id : `${id}（${label}）`;
    });
  return withRounds.replace(/\butility\b/gi, '满意度');
}

export function mealWithCode(id: string, menu: MenuItem[]) {
  return `${id}（${menu.find((item) => item.id === id)?.name ?? '未核实餐品'}）`;
}

export function participantName(id: string, participants: Participant[]) {
  return participants.find((person) => person.agentId === id)?.displayName ?? id;
}

export function candidateBadge(result: NegotiationResult, selectedId: string | undefined, mode: 'live' | 'demo', check?: QuoteCheck) {
  if (result.proposal.id === selectedId) return mode === 'live' ? '最终采用' : '演示选中';
  if (check === 'checking') return '正在核价';
  if (check === 'failed') return '核价或复核未通过';
  return result.acceptedByAll ? mode === 'live' && !selectedId ? '全员接受 · 待核价' : '全员接受 · 未采用' : '尚未全员接受';
}
