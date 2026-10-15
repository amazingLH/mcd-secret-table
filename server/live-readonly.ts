import { connectMcdClient } from './mcdClient';
import { READ_ONLY_TOOLS, requireReadOnlyTool } from './readOnlyPolicy';
import { readMcdResponse } from './mcpResponse';

function parseArgs(argv: string[]) {
  const options = { list: false, tool: '', input: '{}' };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--list') options.list = true;
    if (argv[index] === '--tool') options.tool = argv[index + 1] ?? '';
    if (argv[index] === '--input') options.input = argv[index + 1] ?? '{}';
  }
  return options;
}

const options = parseArgs(process.argv.slice(2));
async function main() {
  // Validate before connecting, so denied actions never touch the service.
  if (!options.list) {
    if (!options.tool) throw new Error('请使用 --tool 指定一个只读工具，或使用 --list 查看工具。');
    requireReadOnlyTool(options.tool);
  }
  const args: unknown = options.list ? {} : JSON.parse(options.input);
  if (!args || typeof args !== 'object' || Array.isArray(args)) {
    throw new Error('--input 必须为 JSON 对象。');
  }
  const client = await connectMcdClient();
  try {
  if (options.list) {
    const response = await client.listTools();
    console.log(
      JSON.stringify(
        response.tools.map(({ name, description, inputSchema }) => ({
          name,
          description,
          inputSchema,
          allowedByReadOnlyClient: READ_ONLY_TOOLS.has(name),
        })),
        null,
        2,
      ),
    );
  } else {
    const response = await client.callTool({ name: options.tool, arguments: args as Record<string, unknown> });
    console.log(JSON.stringify(readMcdResponse(response), null, 2));
  }
  } finally {
    await client.close();
  }
}

main().catch(() => {
  console.error('只读联调未完成：请检查工具是否在允许列表、JSON 参数、Token 与网络。未输出底层错误以避免凭证泄漏。');
  process.exitCode = 1;
});
