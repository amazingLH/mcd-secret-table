import { describe, it, expect } from 'vitest';
import { readMcdResponse } from '../server/mcpResponse';
import { requireReadOnlyTool } from '../server/readOnlyPolicy';

describe('只读 MCP 边界', () => {
  it.each(['create-order', 'cancel-order', 'auto-bind-coupons', 'draw-lottery', 'new-unreviewed-tool'])(
    '在建立连接前拒绝 %s', (tool) => expect(() => requireReadOnlyTool(tool)).toThrow(),
  );
  it('允许官方试算，并保留 traceId', () => {
    expect(() => requireReadOnlyTool('calculate-price')).not.toThrow();
    const envelope = readMcdResponse<{ price: number }>({
      structuredContent: { success: true, code: 200, traceId: 'test-only', data: { price: 6300 } },
    });
    expect(envelope.data.price).toBe(6300);
    expect(envelope.traceId).toBe('test-only');
  });
  it('不能将 HTTP 成功误判为业务成功', () => {
    expect(() => readMcdResponse({ structuredContent: { success: false, code: 401, data: {} } })).toThrow();
    expect(() => readMcdResponse({ isError: true, structuredContent: { success: true, code: 200, data: {} } })).toThrow();
  });
  it('兼容官方文字包装，但只解析数据', () => {
    const result = readMcdResponse<{ price: number }>({ content: [{ type: 'text', text:
      'Response description\n{"success":true,"code":200,"data":{"price":6300}}\nEnd' }] });
    expect(result.data.price).toBe(6300);
    expect(() => readMcdResponse({ content: [{ type: 'text', text: 'not valid data' }] })).toThrow();
  });
});
