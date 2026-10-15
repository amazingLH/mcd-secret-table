export interface McdEnvelope<T> {
  success: true;
  code: number;
  data: T;
  datetime?: string;
  traceId?: string;
}

interface ToolResponse {
  isError?: boolean;
  structuredContent?: unknown;
  content?: unknown;
}

export function readMcdResponse<T>(response: ToolResponse): McdEnvelope<T> {
  if (response.isError) throw new Error('MCP 工具返回错误，未获得有效业务结果。');
  let envelope = response.structuredContent;
  if (!envelope && Array.isArray(response.content)) {
    for (const block of response.content) {
      if (block?.type !== 'text' || typeof block.text !== 'string') continue;
      const text = block.text as string;
      // Support official explanatory wrappers without treating their prose as instructions.
      const position = text.indexOf('{"success":');
      const end = text.lastIndexOf('}');
      if (position < 0 || end < position) continue;
      try { envelope = JSON.parse(text.slice(position, end + 1)); break; } catch { /* next block */ }
    }
  }
  if (typeof envelope !== 'object' || envelope === null) {
    throw new Error('MCP 响应缺少可解析的业务数据。');
  }
  const value = envelope as Record<string, unknown>;
  if (value.success !== true || value.code !== 200 || !Object.hasOwn(value, 'data')) {
    throw new Error('麦当劳业务接口未成功返回数据。');
  }
  return value as unknown as McdEnvelope<T>;
}
