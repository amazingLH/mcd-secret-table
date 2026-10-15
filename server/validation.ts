import type { LiveTable, Feedback, LocalOffer } from '../src/agent/liveTypes';
import type { Proposal } from '../src/agent/types';

export class PublicError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new PublicError('请求格式必须是对象。');
  return value as Record<string, unknown>;
}

export function onlyKeys(value: Record<string, unknown>, keys: string[]) {
  if (Object.keys(value).some((key) => !keys.includes(key))) throw new PublicError('请求包含未允许的字段。私人条件不应发送到服务端。');
}

export function validateItemIds(value: unknown, table: LiveTable): string[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 3 || value.some((id) => typeof id !== 'string')) {
    throw new PublicError('每位参与者每份餐单须包含 1–3 个已核实餐品。');
  }
  const ids = value as string[];
  if (new Set(ids).size !== ids.length || ids.some((id) => !table.menu.some((item) => item.id === id))) {
    throw new PublicError('餐单包含未知或重复商品。');
  }
  if (!ids.some((id) => table.menu.find((item) => item.id === id)?.kind === 'main')) {
    throw new PublicError('每位参与者的餐单须包含一份主食。');
  }
  return ids;
}

export function validateProposals(value: unknown, table: LiveTable, round: number) {
  const payload = object(value);
  if (typeof payload.explanation !== 'string' || payload.explanation.length > 600) throw new PublicError('模型说明格式无效。');
  if (!Array.isArray(payload.proposals) || payload.proposals.length < 1 || payload.proposals.length > 4) {
    throw new PublicError('模型须提供 1–4 份候选方案。');
  }
  const proposals: Proposal[] = payload.proposals.map((value, index) => {
    const candidate = object(value);
    if (typeof candidate.label !== 'string' || candidate.label.length > 60 || !Array.isArray(candidate.assignments)) throw new PublicError('候选方案格式无效。');
    const assignments = candidate.assignments.map((value) => {
      const assignment = object(value);
      if (typeof assignment.agentId !== 'string' || !table.participants.includes(assignment.agentId)) throw new PublicError('未知参与者。');
      return { agentId: assignment.agentId, itemIds: validateItemIds(assignment.itemIds, table) };
    });
    if (assignments.length !== table.participants.length || new Set(assignments.map((assignment) => assignment.agentId)).size !== table.participants.length) {
      throw new PublicError('每个方案须且只能覆盖每位参与者一次。');
    }
    const totalFen = assignments.flatMap((a) => a.itemIds).reduce((sum, id) => sum + Math.round(table.menu.find((item) => item.id === id)!.price * 100), 0);
    if (totalFen > Math.round(table.publicBudget * 100)) throw new PublicError('候选方案超过共同公开预算，请减少加餐。');
    return { id: `r${round}-p${index + 1}`, label: candidate.label, assignments };
  });
  return { explanation: payload.explanation, proposals };
}

export function validateFeedback(value: unknown, last: Proposal[], table: LiveTable): Feedback[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 4) throw new PublicError('评估反馈格式无效。');
  const seen = new Set<string>();
  return value.map((entry) => {
    const feedback = object(entry);
    onlyKeys(feedback, ['proposalId', 'signals']);
    if (typeof feedback.proposalId !== 'string' || !last.some((p) => p.id === feedback.proposalId) || seen.has(feedback.proposalId)) throw new PublicError('反馈必须对应上一轮不重复的候选方案。');
    seen.add(feedback.proposalId);
    if (!Array.isArray(feedback.signals) || feedback.signals.length !== table.participants.length) throw new PublicError('反馈参与者数量不符。');
    const signals = feedback.signals.map((entry) => {
      const signal = object(entry);
      onlyKeys(signal, ['agentId', 'accepted', 'utility']);
      if (typeof signal.agentId !== 'string' || !table.participants.includes(signal.agentId) || typeof signal.accepted !== 'boolean' || !Number.isInteger(signal.utility) || Number(signal.utility) < 0 || Number(signal.utility) > 100) throw new PublicError('匿名反馈格式无效。');
      return { agentId: signal.agentId, accepted: signal.accepted, utility: Number(signal.utility) };
    });
    if (new Set(signals.map((signal) => signal.agentId)).size !== table.participants.length) throw new PublicError('反馈参与者不能重复。');
    return { proposalId: feedback.proposalId, signals };
  });
}

// Validate every candidate with the same hard rules. An invalid extra candidate
// must not discard a separately valid model-generated one or trigger paid retries.
export function selectValidProposals(value: unknown, table: LiveTable, round: number) {
  const payload = object(value);
  if (!Array.isArray(payload.proposals) || payload.proposals.length < 1 || payload.proposals.length > 4) {
    throw new PublicError('模型须提供 1–4 份候选方案。');
  }
  const proposals: Proposal[] = [];
  const rejected: string[] = [];
  for (const [index, candidate] of payload.proposals.entries()) {
    try {
      const result = validateProposals({ ...payload, proposals: [candidate] }, table, round);
      proposals.push({ ...result.proposals[0], id: `r${round}-p${index + 1}` });
    } catch (error) {
      if (!(error instanceof PublicError)) throw error;
      rejected.push(`候选 ${index + 1}：${error.message}`);
    }
  }
  if (!proposals.length) throw new PublicError(rejected.join('；'));
  return { explanation: payload.explanation as string, proposals, rejected };
}

export function validateOffers(value: unknown, table: LiveTable): LocalOffer[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 36) throw new PublicError('可接受报价过多。');
  return value.map((entry) => {
    const offer = object(entry);
    onlyKeys(offer, ['agentId', 'itemIds', 'utility']);
    if (typeof offer.agentId !== 'string' || !table.participants.includes(offer.agentId) || !Number.isInteger(offer.utility) || Number(offer.utility) < 55 || Number(offer.utility) > 100) throw new PublicError('可接受报价格式无效。');
    return { agentId: offer.agentId, itemIds: validateItemIds(offer.itemIds, table), utility: Number(offer.utility) };
  });
}
