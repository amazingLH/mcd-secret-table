import type { LiveTrace } from './liveTypes';

export async function liveRequest<T>(path: string, input: unknown, expected: string, onTrace: (trace: LiveTrace) => void): Promise<T> {
  const response = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || `本地服务返回 ${response.status}`);
  }
  if (!response.body) throw new Error('浏览器不支持读取实时响应。');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = ''; let result: T | undefined;
  const consume = (line: string) => {
    if (!line.trim()) return;
    const event = JSON.parse(line);
    if (event.type === 'error') throw new Error(event.data.message);
    if (event.type === 'trace') onTrace(event.data);
    if (event.type === expected) result = event.data as T;
  };
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) { buffer += decoder.decode(); break; }
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n'); buffer = lines.pop() ?? '';
      for (const line of lines) consume(line);
    }
    consume(buffer);
  } finally { reader.releaseLock(); }
  if (result === undefined) throw new Error('实时服务未返回完整结果，请重试。');
  return result;
}
