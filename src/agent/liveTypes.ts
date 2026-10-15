import type { MenuItem, PrivateEvaluation, Proposal } from './types';

export interface LiveTrace {
  id: string;
  actor: 'mcp' | 'model' | 'browser';
  action: string;
  message: string;
  at: string;
  traceId?: string;
  responseId?: string;
}

export interface LiveMenuItem extends MenuItem {
  kind: 'main' | 'side' | 'drink' | 'dessert';
  nutritionKnown: boolean;
}

export interface LiveTable {
  id: string;
  store: { code: string; name: string };
  menu: LiveMenuItem[];
  participants: string[];
  publicBudget: number;
  createdAt: string;
  model: string;
}

export interface LocalOffer {
  agentId: string;
  itemIds: string[];
  utility: number;
}

export interface Feedback {
  proposalId: string;
  signals: Pick<PrivateEvaluation, 'agentId' | 'accepted' | 'utility'>[];
}

export interface ProposalRound {
  round: number;
  explanation: string;
  proposals: Proposal[];
  responseId: string;
  model: string;
  usageTokens: number;
}

export interface OfficialQuote {
  proposalId: string;
  amountFen: number;
  amountYuan: number;
  quotedAt: string;
  traceId: string;
  items: { id: string; name: string; quantity: number; subtotalFen: number }[];
}
