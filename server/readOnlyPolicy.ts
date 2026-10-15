// Explicitly allow known read operations; newly introduced tools stay blocked.
export const READ_ONLY_TOOLS = new Set([
  'now-time-info',
  'list-nutrition-foods',
  'query-nearby-stores',
  'query-meals',
  'query-meal-detail',
  'query-store-coupons',
  'calculate-price',
  'campaign-calendar',
]);

export function requireReadOnlyTool(name: string): void {
  if (!READ_ONLY_TOOLS.has(name)) {
    throw new Error(`只读客户端未允许此工具：${name}`);
  }
}
