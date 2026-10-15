import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { readMcdToken } from './token';

const MCD_MCP_URL = 'https://mcp.mcd.cn';

export async function connectMcdClient(token = readMcdToken()) {
  if (!token) {
    throw new Error(
      '缺少 MCD_MCP_TOKEN。请只在本机环境变量中设置，不要写入仓库或聊天记录。',
    );
  }

  const client = new Client(
    { name: 'secret-table-readonly-client', version: '0.1.0' },
    { versionNegotiation: { mode: 'auto' } },
  );
  const transport = new StreamableHTTPClientTransport(new URL(MCD_MCP_URL), {
    requestInit: {
      headers: { Authorization: `Bearer ${token}` },
    },
  });
  try {
    await client.connect(transport);
  } catch {
    await client.close().catch(() => undefined);
    throw new Error('麦当劳 MCP 连接失败，请检查网络、Token 是否有效，以及官方服务状态。');
  }
  return client;
}
