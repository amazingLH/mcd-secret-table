import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { callCoordinator, modelAccessIssue, modelName, type ModelTool } from '../server/model';
import { prepareTable } from '../server/liveAgent';

const tool: ModelTool = { type: 'function', function: { name: 'test_proposal', description: 'test', parameters: {} } };
const messages = [{ role: 'user' as const, content: 'test' }];

beforeEach(() => {
  vi.stubEnv('DASHSCOPE_API_KEY', 'unit-test-not-a-real-key');
  vi.stubEnv('AGENT_MODEL', '');
  vi.stubEnv('QWEN_MODEL', 'qwen-plus');
  vi.stubEnv('DASHSCOPE_BILLING_CONFIRMED_MODEL', '');
  vi.stubEnv('DASHSCOPE_BASE_URL', 'https://dashscope.aliyuncs.com/compatible-mode/v1');
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('模型计费确认保护（不调用真实模型）', () => {
  it('通用模型配置优先，仍兼容原千问配置变量', () => {
    expect(modelName()).toBe('qwen-plus');
    vi.stubEnv('AGENT_MODEL', 'deepseek-v4.1-flash');
    expect(modelName()).toBe('deepseek-v4.1-flash');
    expect(modelAccessIssue()).toContain('真实模型调用已暂停');
  });

  it('非千问模型保持同样的工具调用和计费保护', async () => {
    vi.stubEnv('AGENT_MODEL', 'deepseek-v4.1-flash');
    vi.stubEnv('DASHSCOPE_BILLING_CONFIRMED_MODEL', 'deepseek-v4.1-flash');
    const request = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => new Response(JSON.stringify({ id: 'mock-deepseek', model: 'deepseek-v4.1-flash',
      choices: [{ message: { tool_calls: [{ function: { name: tool.function.name, arguments: '{}' } }] } }],
    }), { status: 200 }));
    vi.stubGlobal('fetch', request);
    expect((await callCoordinator(messages, tool)).model).toBe('deepseek-v4.1-flash');
    const body = JSON.parse(request.mock.calls[0]![1]!.body as string);
    expect(body.model).toBe('deepseek-v4.1-flash');
    expect(body.enable_thinking).toBe(false);
    expect(body.tool_choice.function.name).toBe(tool.function.name);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('只配置密钥不会发起模型请求', async () => {
    const request = vi.fn(); vi.stubGlobal('fetch', request);
    await expect(callCoordinator(messages, tool)).rejects.toThrow('真实模型调用已暂停');
    expect(request).not.toHaveBeenCalled();
  });

  it('建桌也先检查保护，不提前调用 MCP', async () => {
    const request = vi.fn(); vi.stubGlobal('fetch', request);
    const emit = vi.fn();
    await expect(prepareTable({ city: '上海', keyword: '人民广场', participants: ['a1', 'a2'], publicBudget: 90 }, emit))
      .rejects.toThrow('真实模型调用已暂停');
    expect(request).not.toHaveBeenCalled(); expect(emit).not.toHaveBeenCalled();
  });

  it('更换模型后旧的计费确认失效', () => {
    vi.stubEnv('DASHSCOPE_BILLING_CONFIRMED_MODEL', 'qwen-plus');
    vi.stubEnv('QWEN_MODEL', 'qwen-flash');
    expect(modelAccessIssue()).toContain('真实模型调用已暂停');
  });

  it('有免费额度的 embedding 模型也不能冒充对话模型', async () => {
    vi.stubEnv('QWEN_MODEL', 'qwen3.7-text-embedding-flash');
    vi.stubEnv('DASHSCOPE_BILLING_CONFIRMED_MODEL', 'qwen3.7-text-embedding-flash');
    const request = vi.fn(); vi.stubGlobal('fetch', request);
    await expect(callCoordinator(messages, tool)).rejects.toThrow('向量或重排序模型不能用于餐单协商');
    expect(request).not.toHaveBeenCalled();
  });

  it('确认后仅调用所配置模型一次（模拟响应）', async () => {
    vi.stubEnv('DASHSCOPE_BILLING_CONFIRMED_MODEL', 'qwen-plus');
    const request = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => new Response(JSON.stringify({ id: 'test-id', model: 'qwen-plus',
      choices: [{ message: { tool_calls: [{ function: { name: tool.function.name, arguments: '{}' } }] } }],
      usage: { total_tokens: 42 },
    }), { status: 200 }));
    vi.stubGlobal('fetch', request);
    const result = await callCoordinator(messages, tool);
    expect(result.usageTokens).toBe(42);
    expect(request).toHaveBeenCalledTimes(1);
    expect(JSON.parse(request.mock.calls[0]![1]!.body as string).model).toBe('qwen-plus');
  });

  it('免费额度用完即停时不切换模型或重试', async () => {
    vi.stubEnv('DASHSCOPE_BILLING_CONFIRMED_MODEL', 'qwen-plus');
    const request = vi.fn(async () => new Response(JSON.stringify({ error: { code: 'AllocationQuota.FreeTierOnly' } }), { status: 403 }));
    vi.stubGlobal('fetch', request);
    await expect(callCoordinator(messages, tool)).rejects.toThrow('百炼已触发免费额度用完即停');
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('未配置密钥时也不能解除保护', () => {
    vi.stubEnv('DASHSCOPE_API_KEY', '');
    vi.stubEnv('DASHSCOPE_BILLING_CONFIRMED_MODEL', 'qwen-plus');
    expect(modelAccessIssue()).toContain('未配置 DASHSCOPE_API_KEY');
  });
});
