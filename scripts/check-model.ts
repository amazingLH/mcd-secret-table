import { callCoordinator } from '../server/model';

try {
  const result = await callCoordinator([{ role: 'user', content: '请调用 check_connection，参数 ok 为 true。不需要其他内容。' }], {
    type: 'function', function: { name: 'check_connection', description: '核验工具调用连接',
      parameters: { type: 'object', additionalProperties: false, required: ['ok'], properties: { ok: { type: 'boolean' } } } },
  });
  if (!result.arguments || typeof result.arguments !== 'object' || !('ok' in result.arguments) || result.arguments.ok !== true) throw new Error('连接响应未通过校验');
  console.log(JSON.stringify({ success: true, model: result.model, responseId: result.responseId, usageTokens: result.usageTokens }));
} catch (error) {
  console.error(error instanceof Error && /^(MODEL_|真实模型调用已暂停|未配置|向量或重排序模型|百炼已触发|连接响应)/.test(error.message) ? error.message : '模型连接核验失败，请检查本地配置与网络。');
  process.exitCode = 1;
}
