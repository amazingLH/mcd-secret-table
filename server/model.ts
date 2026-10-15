export interface ModelTool { type: 'function'; function: { name: string; description: string; parameters: Record<string, unknown> } }
export interface ModelMessage { role: 'system' | 'user' | 'assistant' | 'tool'; content: string }

export const modelName = () => process.env.QWEN_MODEL || 'qwen-plus';

export function parseToolArguments(text: string): unknown {
  try { return JSON.parse(text); }
  catch (error) {
    // Some compatible gateways omit only the final root-object brace. Accept
    // that exact syntactic case; never invent a property, value, ID or number.
    const trimmed = text.trim();
    if (trimmed.startsWith('{') && trimmed.endsWith(']')) {
      try { return JSON.parse(trimmed + '}'); } catch { /* incomplete content: reject */ }
    }
    throw error;
  }
}

export async function callCoordinator(messages: ModelMessage[], tool: ModelTool) {
  const key = process.env.DASHSCOPE_API_KEY;
  if (!key) throw new Error('MODEL_NOT_CONFIGURED');
  const base = process.env.DASHSCOPE_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1';
  const url = new URL(base);
  if (url.protocol !== 'https:' || !/(^|\.)aliyuncs\.com$/.test(url.hostname)) {
    throw new Error('INVALID_MODEL_ENDPOINT');
  }
  const response = await fetch(base.replace(/\/$/, '') + '/chat/completions', {
    method: 'POST', signal: AbortSignal.timeout(50_000),
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: modelName(), enable_thinking: false, temperature: 0.3,
      max_tokens: 3500, messages, tools: [tool],
      tool_choice: { type: 'function', function: { name: tool.function.name } },
    }),
  });
  if (!response.ok) throw new Error(`MODEL_HTTP_${response.status}`);
  const payload = await response.json();
  const message = payload.choices?.[0]?.message;
  const toolCall = message?.tool_calls?.find((call: { function?: { name: string } }) => call.function?.name === tool.function.name);
  if (!toolCall || typeof toolCall.function.arguments !== 'string') throw new Error('MODEL_INVALID_TOOL_CALL');
  return {
    arguments: parseToolArguments(toolCall.function.arguments),
    responseId: String(payload.id), model: String(payload.model),
    usageTokens: Number(payload.usage?.total_tokens ?? 0),
  };
}
