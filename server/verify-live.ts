import { mkdir, writeFile } from 'node:fs/promises';
import { connectMcdClient } from './mcdClient';
import { readMcdResponse } from './mcpResponse';
import { requireReadOnlyTool } from './readOnlyPolicy';

interface Store { storeCode: string; storeName: string; businessStatus: boolean }
interface Category { meals: { code: string }[] }
interface MealDetail { code: string; name: string; rounds: unknown[] }
interface Quote {
  price: number;
  productList: { productCode: string; productName: string; quantity: number; subtotal: number }[];
}

async function main() {
  const client = await connectMcdClient();
  const calls: { tool: string; traceId: string | null; serverTime: string | null }[] = [];
  async function call<T>(name: string, args: Record<string, unknown> = {}) {
    requireReadOnlyTool(name);
    const envelope = readMcdResponse<T>(await client.callTool({ name, arguments: args }));
    calls.push({ tool: name, traceId: envelope.traceId ?? null, serverTime: envelope.datetime ?? null });
    return envelope.data;
  }
  try {
    const tools = await client.listTools();
    await call('now-time-info');
    const nutrition = await call<string>('list-nutrition-foods');
    const stores = await call<Store[]>('query-nearby-stores', {
      beType: 1, searchType: 2, city: '上海', keyword: '人民广场',
    });
    const store = stores.find((candidate) => candidate.businessStatus);
    if (!store) throw new Error('公共测试地点暂无营业门店。');
    const context = { storeCode: store.storeCode, orderType: 1, beType: 1 };
    const menu = await call<{ categories: Category[] }>('query-meals', context);
    const codes = new Set(menu.categories.flatMap((category) => category.meals.map((meal) => meal.code)));
    const preferredCodes = ['1440', '1406', '1450'].filter((code) => codes.has(code));
    if (preferredCodes.length !== 3) throw new Error('测试餐品供应变化，需更新测试组合。');
    const details: MealDetail[] = [];
    for (const code of preferredCodes) {
      const detail = await call<MealDetail>('query-meal-detail', { ...context, code });
      if (detail.code !== code || detail.rounds.length > 0) throw new Error('商品结构变化，停止核价。');
      details.push(detail);
    }
    const quote = await call<Quote>('calculate-price', {
      ...context, items: details.map((detail) => ({ productCode: detail.code, quantity: 1 })),
    });
    if (!Number.isInteger(quote.price) || quote.price < 0 || !Array.isArray(quote.productList)) {
      throw new Error('官方计价结果格式异常。');
    }
    const observed = new Set(quote.productList.map((item) => item.productCode));
    if (observed.size !== 3 || preferredCodes.some((code) => !observed.has(code))) {
      throw new Error('计价返回的商品与请求不一致。');
    }
    const report = {
      mode: 'live-readonly',
      verifiedAt: new Date().toISOString(),
      server: 'https://mcp.mcd.cn',
      scope: '公共测试地点的 MCP 接入与三份单品核价；不代表网页或 LLM Agent 已完成实时集成。',
      toolCount: tools.tools.length,
      testLocation: { city: '上海', keyword: '人民广场', source: '固定公共地点，非用户位置' },
      store: { code: store.storeCode, name: store.storeName },
      uniqueMenuItems: codes.size,
      nutritionRecords: typeof nutrition === 'string' ? Number(nutrition.match(/^\[(\d+)\]/)?.[1] ?? 0) : null,
      quote: {
        currency: 'CNY', amountFen: quote.price, amountYuan: (quote.price / 100).toFixed(2),
        items: quote.productList.map(({ productCode, productName, quantity, subtotal }) => ({
          productCode, productName, quantity, subtotalFen: subtotal,
        })),
      },
      calls,
      writeOperationsExecuted: 0,
      credentialsIncluded: false,
    };
    // Generate a report from an explicit public-field allowlist; never persist raw responses.
    await mkdir('evidence', { recursive: true });
    await writeFile('evidence/live-readonly.json', JSON.stringify(report, null, 2) + '\n', 'utf8');
    console.log(JSON.stringify(report, null, 2));
  } finally { await client.close(); }
}

main().catch(() => {
  console.error('真实联调失败，未保存本次报告。请检查 Token、网络、测试地点供应或响应结构。');
  process.exitCode = 1;
});
