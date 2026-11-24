// 与猎金后台通信的客户端。只有两件事：取工具清单、调工具。
//
// 用的是 API 密钥（Authorization: Bearer），不是浏览器会话：MCP 服务器是一个
// 长期运行的程序，没有登录页，也不需要参与 CSRF。后台对 /api/mcp/* 的校验
// 只看密钥，所以这里不需要也别去拿 cookie。
const TIMEOUT_MS = 120_000;

export function createBridgeClient({ baseUrl, apiToken }) {
  if (typeof baseUrl !== 'string' || !/^https?:\/\//.test(baseUrl)) throw Error('HUNTER_API_URL 不是有效的地址');
  if (typeof apiToken !== 'string' || !apiToken) throw Error('缺少 API 密钥');

  async function request(method, path, body) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(new URL(path, baseUrl), {
        method,
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${apiToken}`,
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' })
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: controller.signal
      });
      const text = await response.text();
      let payload = null;
      try { payload = text ? JSON.parse(text) : null; } catch { payload = null; }
      if (!response.ok) {
        // 后台只回一个错误码，不解释原因；原样抛上去，由工具层翻译成人话。
        throw Object.assign(Error(payload?.error ?? `HTTP ${response.status}`), {
          code: payload?.error ?? 'MCP_HTTP_FAILED',
          status: response.status
        });
      }
      if (payload === null) throw Object.assign(Error('后台返回的不是 JSON'), { code: 'MCP_BAD_RESPONSE', status: 502 });
      return payload;
    } catch (error) {
      if (error?.name === 'AbortError') throw Object.assign(Error('后台响应超时'), { code: 'MCP_TIMEOUT', status: 504 });
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async tools() {
      const payload = await request('GET', '/api/mcp/tools');
      return { tools: Array.isArray(payload.tools) ? payload.tools : [], key: payload.key ?? null };
    },
    async call(tool, args) {
      const payload = await request('POST', '/api/mcp/call', { tool, arguments: args ?? {} });
      return payload.result;
    }
  };
}
