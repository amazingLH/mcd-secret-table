export type AgentAction =
  | 'query-nearby-stores'
  | 'query-meals'
  | 'query-meal-detail'
  | 'query-store-coupons'
  | 'list-nutrition-foods'
  | 'calculate-price'
  | 'create-order'
  | 'cancel-order';

const WRITE_ACTIONS = new Set<AgentAction>(['create-order', 'cancel-order']);

export function authorizeAction(action: AgentAction, confirmed: boolean) {
  if (WRITE_ACTIONS.has(action) && !confirmed) {
    return {
      allowed: false,
      reason: '写操作需要用户在看到最终餐单与官方核价后明确确认。',
    } as const;
  }
  return { allowed: true, reason: '允许执行。' } as const;
}
