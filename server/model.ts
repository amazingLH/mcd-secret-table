import { PublicError } from './validation';

export interface ModelTool { type: 'function'; function: { name: string; description: string; parameters: Record<string, unknown> } }
export interface ModelMessage { role: 'system' | 'user' | 'assistant' | 'tool'; content: string }

export const modelName = () => process.env.AGENT_MODEL || process.env.QWEN_MODEL || 'deepseek-v4.1-flash';

// This gate records an explicit review, NOT an assertion that free quota remains.
// Free-quota deduction and paid billing are controlled by the provider account.
export function modelAccessIssue(): string | null {
  if (!process.env.DASHSCOPE_API_KEY) return '未配置 DASHSCOPE_API_KEY，暂不能运行大模型协商。';
  if (/embedding|rerank/i.test(modelName())) return '向量或重排序模型不能用于餐单协商，请选择支持工具调用的对话模型。';
  if (process.env.DASHSCOPE_BILLING_CONFIRMED_MODEL !== modelName()) {
    return '真实模型调用已暂停：请先在百炼核实当前对话模型的免费额度、有效期和地域，再明确确认该模型的计费设置。离线演示不消耗额度。';
  }
  return null;
}

export function requireModelAccess() {
  const issue = modelAccessIssue();
  if (issue) throw new PublicError(issue, 403);
}

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
  requireModelAccess();
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
  if (!response.ok) {
    const failure = await response.json().catch(() => null);
    if (failure?.error?.code === 'AllocationQuota.FreeTierOnly' || failure?.code === 'AllocationQuota.FreeTierOnly') {
      throw new PublicError('百炼已触发免费额度用完即停。本项目不会自动更换模型、关闭保护或重试付费调用，请先在百炼核对额度。', 403);
    }
    throw new Error(`MODEL_HTTP_${response.status}`);
  }
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
