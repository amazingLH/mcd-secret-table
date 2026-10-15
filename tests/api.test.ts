import { createServer, type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { handleApi } from '../server/api';

let server: Server;
let base: string;
beforeAll(async () => {
  server = createServer((req, res) => { void handleApi(req,res); });
  await new Promise<void>((resolve)=>server.listen(0,'127.0.0.1',resolve));
  const address = server.address();
  if (!address || typeof address==='string') throw new Error('test listen failed');
  base = `http://127.0.0.1:${address.port}`;
});
afterAll(async () => { server.closeAllConnections(); await new Promise<void>((resolve)=>server.close(()=>resolve())); });

describe('本地 API 边界',()=>{
  it('跨源页面不能调用持有密钥的本地服务',async()=>{
    const response = await fetch(base+'/api/tables',{method:'POST',headers:{'content-type':'application/json',origin:'https://unrelated.example'},body:'{}'});
    expect(response.status).toBe(403);
  });
  it('原始私人条件被拒绝，不进入 MCP 或模型请求',async()=>{
    const response = await fetch(base+'/api/tables',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({city:'上海',keyword:'人民广场',participants:['a1','a2'],publicBudget:80,budget:20})});
    const stream = await response.text();
    expect(stream).toContain('"type":"error"');
    expect(stream).not.toContain('"type":"table"');
    expect(stream).not.toContain('"type":"trace"');
  });
});
