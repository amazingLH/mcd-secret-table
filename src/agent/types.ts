export type TasteTag =
  | 'spicy'
  | 'sweet'
  | 'savory'
  | 'fresh'
  | 'beef'
  | 'chicken'
  | 'vegetable'
  | 'dessert'
  | 'zero-sugar';

export interface MenuItem {
  id: string;
  name: string;
  price: number;
  calories: number | null;
  protein: number | null;
  tags: TasteTag[];
}

export interface PrivateProfile {
  agentId: string;
  displayName: string;
  budget: number;
  requiredTags?: TasteTag[];
  preferredTags: TasteTag[];
  blockedTags: TasteTag[];
  maxCalories?: number;
  minProtein?: number;
}

export interface Assignment {
  agentId: string;
  itemIds: string[];
}

export interface Proposal {
  id: string;
  label: string;
  assignments: Assignment[];
}

export interface PrivateEvaluation {
  agentId: string;
  proposalId: string;
  accepted: boolean;
  utility: number;
  publicSignal: 'accept' | 'revise';
}

export interface NegotiationResult {
  proposal: Proposal;
  evaluations: PrivateEvaluation[];
  fairness: number;
  averageUtility: number;
  acceptedByAll: boolean;
}

export interface PublicTraceEvent {
  step: number;
  actor: string;
  action: string;
  detail: string;
  status: 'done' | 'active' | 'waiting';
}
