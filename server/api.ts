import type { IncomingMessage, ServerResponse } from 'node:http';
import { prepareTable, proposeRound, quoteProposal } from './liveAgent';
import { PublicError, object, onlyKeys } from './validation';
import { modelName } from './model';
import type { LiveTrace } from '../src/agent/liveTypes';

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []; let length = 0;
  for await (const chunk of req) {
    length += chunk.length;
    if (length > 32_768) throw new PublicError('请求过大。', 413);
    chunks.push(Buffer.from(chunk));
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); }
  catch { throw new PublicError('请求须为有效 JSON。'); }
}

export async function handleApi(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
  const send = (type: string, data: unknown) => { if (!res.destroyed) res.write(JSON.stringify({ type, data }) + '\n'); };
  const emit = (trace: LiveTrace) => send('trace', trace);
  try {
    const host = req.headers.host;
    if (!host || !/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host)) throw new PublicError('仅允许本机访问。', 403);
    if (req.headers.origin && req.headers.origin !== `http://${host}`) throw new PublicError('不允许跨站调用本地 Agent。', 403);
    res.setHeader('cache-control', 'no-store');
    if (pathname === '/api/health' && req.method === 'GET') {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ status: 'ok', model: modelName(), modelConfigured: Boolean(process.env.DASHSCOPE_API_KEY), readOnly: true }));
      return;
    }
    if (req.method !== 'POST' || !String(req.headers['content-type']).startsWith('application/json')) throw new PublicError('请使用 JSON POST 请求。', 405);
    const input = await readBody(req);
    res.setHeader('content-type', 'application/x-ndjson; charset=utf-8');
    res.setHeader('x-content-type-options', 'nosniff');
    res.flushHeaders();
    if (pathname === '/api/tables') {
      send('table', await prepareTable(input, emit));
    } else {
      const match = pathname.match(/^\/api\/tables\/([a-z0-9-]{36})\/(proposals|quote)$/);
      if (!match) throw new PublicError('接口不存在。', 404);
      if (match[2] === 'proposals') send('round', await proposeRound(match[1], input, emit));
      else {
        const request = object(input); onlyKeys(request, ['proposalId']);
        if (typeof request.proposalId !== 'string') throw new PublicError('缺少候选方案编号。');
        send('quote', await quoteProposal(match[1], request.proposalId, emit));
      }
    }
    res.end();
  } catch (error) {
    const message = error instanceof PublicError ? error.message
      : error instanceof Error && /^MODEL_HTTP_\d+$/.test(error.message) ? `大模型服务返回 ${error.message.slice(11)}，请检查模型额度或区域配置。`
      : error instanceof Error && error.name === 'TimeoutError' ? '大模型或外部接口响应超时，请稍后重试。'
      : error instanceof Error && error.message === 'MODEL_INVALID_TOOL_CALL' ? '大模型未返回要求的工具调用格式。'
      : error instanceof SyntaxError ? '大模型返回的结构化内容不完整，请重试。'
      : '本次实时调用未完成，请检查网络、MCP Token 或模型配置后重试。';
    if (!res.headersSent) { res.statusCode = error instanceof PublicError ? error.status : 502; res.setHeader('content-type', 'application/json; charset=utf-8'); res.end(JSON.stringify({ error: message })); }
    else { send('error', { message }); res.end(); }
  }
}
