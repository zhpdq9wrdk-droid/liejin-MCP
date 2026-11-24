#!/usr/bin/env node
// 猎金托管系统的 MCP 服务器（stdio 桥）。
//
// 它本身不含任何账号数据，只是一层转发：把 MCP 客户端的调用，用一把 API 密钥
// 转发到 https://liejin.top/mcp。所以这个仓库可以公开——真正管住数据的是密钥、
// 权限和 IP 白名单，不是代码。
//
// 用法（任意一台装了 Node 22+ 的电脑）：
//
//   npx -y github:zhpdq9wrdk-droid/liejin-MCP --token hk_xxx
//
//   npx -y github:zhpdq9wrdk-droid/liejin-MCP --url https://liejin.top --token hk_xxx
//
// 也可以用环境变量 HUNTER_API_URL / HUNTER_API_TOKEN。
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { createBridgeClient } from './bridge-client.mjs';

const DEFAULT_URL = 'https://liejin.top';
const VERSION = '2.1.0';

const ERROR_TEXT = Object.freeze({
  API_KEY_DENIED: '密钥无效、已过期、已吊销，或调用来源不在白名单里。请在后台「API 密钥」里核对。',
  API_KEY_FORBIDDEN: '这把密钥没有执行该操作的权限。需要的话请在后台重新签发一把带对应权限的。',
  MCP_INPUT_INVALID: '参数不合法，请检查后重试。',
  MCP_TOOL_NOT_FOUND: '后台没有这个工具，可能版本不匹配。',
  MCP_CUSTOMER_NOT_FOUND: '没有这个用户。',
  MCP_CONFIRM_MISMATCH: '确认账号与目标用户不一致，未执行。',
  MCP_TIMEOUT: '后台响应超时。',
  ONBOARDING_DISABLED: '后台未启用接入功能。',
  ONBOARDING_INPUT_INVALID: '接入参数不合法：账号或密码格式、数量（1–20）、备注长度都需要检查。',
  ONBOARDING_LIVE_CONFIRMATION_REQUIRED: '实盘服务器需要显式确认 liveTrading=true。',
  ONBOARDING_ACCOUNT_EXISTS: '这批账号里有已经接入过的。',
  CUSTOMER_INPUT_INVALID: '用户资料不合法。',
  CUSTOMER_DELETE_POSITIONS_OPEN: '该账号仍有持仓、挂单或未结束的订单，已拒绝删除。先平仓撤单再试。',
  CUSTOMER_DELETE_STATE_UNAVAILABLE: '读不到该 MT4 的最新状态，无法确认没有持仓，已拒绝删除。'
});

const explain = error => {
  const code = typeof error?.code === 'string' ? error.code : '';
  if (ERROR_TEXT[code]) return `${ERROR_TEXT[code]}（${code}）`;
  if (error?.status === 401) return ERROR_TEXT.API_KEY_DENIED;
  if (error?.status === 403) return ERROR_TEXT.API_KEY_FORBIDDEN;
  return `${error?.message || '调用失败'}${code ? `（${code}）` : ''}`;
};

// 命令行参数优先于环境变量。`--token` 这种形式是为了让 AI 拼一行命令就能跑，
// 不必先教它怎么设环境变量。
function parseArgs(argv) {
  const out = { url: '', token: '', help: false };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') { out.help = true; continue; }
    if (arg === '--url' || arg === '-u') { out.url = String(argv[++index] ?? '').trim(); continue; }
    if (arg === '--token' || arg === '-t' || arg === '--key') { out.token = String(argv[++index] ?? '').trim(); continue; }
    if (arg.startsWith('--url=')) { out.url = arg.slice(6).trim(); continue; }
    if (arg.startsWith('--token=')) { out.token = arg.slice(8).trim(); continue; }
    // 位置参数当作密钥处理，方便 `npx ... hk_xxx` 这种最短写法。
    if (!arg.startsWith('-') && !out.token) { out.token = arg.trim(); continue; }
    throw Error(`无法识别的参数：${arg}`);
  }
  return out;
}

function usage() {
  return [
    '猎金托管系统 MCP 服务器',
    '',
    '用法：',
    '  npx -y github:zhpdq9wrdk-droid/liejin-MCP --token hk_你的密钥',
    '  npx -y github:zhpdq9wrdk-droid/liejin-MCP --url https://liejin.top --token hk_你的密钥',
    '',
    '参数：',
    '  --token, -t   后台「API 密钥」里签发的密钥（必填，也可用 HUNTER_API_TOKEN）',
    '  --url, -u     后台地址，默认 ' + DEFAULT_URL + '（也可用 HUNTER_API_URL）',
    '  --help, -h    显示本说明',
    '',
    '这个服务器不含任何账号数据，只是一层转发；权限和数据范围由密钥决定。'
  ].join('\n');
}

let options;
try {
  options = parseArgs(process.argv.slice(2));
} catch (error) {
  console.error(String(error.message));
  process.exit(2);
}
if (options.help) {
  console.log(usage());
  process.exit(0);
}

const token = options.token || (process.env.HUNTER_API_TOKEN ?? '').trim();
const baseUrl = (options.url || process.env.HUNTER_API_URL || DEFAULT_URL).replace(/\/+$/, '');
if (!token) {
  console.error('缺少 API 密钥。\n\n' + usage());
  process.exit(2);
}

const client = createBridgeClient({ baseUrl, apiToken: token });

const server = new Server(
  { name: 'hunter-management', version: VERSION },
  { capabilities: { tools: {} } }
);

// 每次列工具都现取：后台可能换了这把密钥的权限，或者升级了工具集。
server.setRequestHandler(ListToolsRequestSchema, async () => {
  const { tools } = await client.tools();
  return {
    tools: tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema
    }))
  };
});

server.setRequestHandler(CallToolRequestSchema, async request => {
  const { name, arguments: args } = request.params ?? {};
  try {
    const result = await client.call(name, args ?? {});
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  } catch (error) {
    return {
      content: [{ type: 'text', text: `调用未完成：${explain(error)}` }],
      isError: true
    };
  }
});

async function main() {
  // 先确认密钥和后台都通，再接管 stdin：连不上时给一句能照着改的说明，
  // 而不是让客户端在第一次调用时才失败。
  try {
    const { tools, key } = await client.tools();
    console.error(`已连接 ${baseUrl}`);
    console.error(`密钥：${key?.name ?? '(未知)'}　可用工具：${tools.length} 个`);
  } catch (error) {
    console.error(`无法连接 ${baseUrl}：${explain(error)}`);
    process.exit(1);
  }
  await server.connect(new StdioServerTransport());
  console.error('就绪，等待客户端调用。');
}

main().catch(error => {
  console.error(`启动失败：${explain(error)}`);
  process.exit(1);
});
