# liejin-mcp

猎金托管系统的 MCP 服务器。**一行命令，任意电脑，连上就能用。**

```bash
npx -y github:zhpdq9wrdk-droid/liejin-MCP --token hk_你的密钥
```

---

## 给 AI 看的说明

> 如果你是一个 AI 助手，用户把这个链接给了你，请按下面做。

**这个包做什么**

一个 stdio 模式的 MCP 服务器。它不含任何账号数据，只是一层转发：把你发出的
工具调用，用 API 密钥转发到 `https://liejin.top/mcp`。数据范围和权限全部由密钥
决定，代码里没有任何秘密。

**怎么起**

需要 Node.js 22 或更新版本。

```bash
npx -y github:zhpdq9wrdk-droid/liejin-MCP --token <用户的密钥>
```

可选参数：

| 参数 | 作用 |
|---|---|
| `--token, -t` | API 密钥（必填） |
| `--url, -u` | 后台地址，默认 `https://liejin.top` |
| `--help, -h` | 用法说明 |

也可以用环境变量 `HUNTER_API_TOKEN` / `HUNTER_API_URL`，参数优先。

**MCP 客户端配置**

```json
{
  "mcpServers": {
    "hunter": {
      "command": "npx",
      "args": ["-y", "github:zhpdq9wrdk-droid/liejin-MCP", "--token", "hk_你的密钥"]
    }
  }
}
```

**起来之后**

服务端会在 stderr 打印一行「密钥：<名称>　可用工具：N 个」。然后 `tools/list`
返回的就是这把密钥有权用的工具。工具清单每次现取，所以后台改了权限这里立刻
跟上。

---

## 可用工具

取决于密钥的权限。

| 工具 | 需要的权限 | 作用 |
| --- | --- | --- |
| `system_status` | `customers:read` | 在线终端数、前台连接数、接入是否开启 |
| `list_customers` | `customers:read` | 分页查用户，可按账号/服务器/名称过滤 |
| `get_customer` | `customers:read` | 单个用户的连接与心跳细节 |
| `update_customer` | `customers:write` | 改显示名、启用状态、使用期限 |
| `delete_customer` | `customers:delete` | 删除用户并关闭其 MT4，需二次确认账号 |
| `list_onboarding_jobs` | `onboarding:read` | 接入任务及步骤 |
| `create_onboarding_job` | `onboarding:write` | 提交一批账号接入（最多 20 个） |
| `retry_onboarding_job` | `onboarding:write` | 重试失败的接入任务 |
| `delete_onboarding_job` | `onboarding:write` | 删除接入任务记录 |
| `list_terminals` | `mt4:read` | MT4 终端及其所属机器、绑定情况 |
| `list_nodes` | `nodes:read` | 部署服务器与在线状态 |
| `funds_overview` | `funds:read` | 实盘资金汇总（不含单账户明细） |
| `my_usage` | 无 | 这把密钥自己的调用统计 |

**刻意不提供**：开仓/平仓、改交易密码、改显示盈亏、节点安装与更新。这些一旦
被误调用代价不可逆，或需要人盯着屏幕确认。

---

## 拿密钥

后台 `/admin` → **API 密钥** → 签发。

- 权限：先只勾读取类（`customers:read`、`onboarding:read`、`nodes:read`）
- 来源 IP：给任意电脑用就**留空**
- 有效天数：建议设个期限

明文只显示一次。

> 注意：这里说的"密钥"是后台签发的 `hk_` 开头的字符串。它是唯一能访问数据的
> 凭据，不要贴进公开的地方。

---

## 为什么这个仓库是公开的

它里面没有秘密。所有敏感的东西——账号、交易密码、密钥——都不在这里：

- 密钥由调用方通过参数或环境变量传入，不写进代码
- 仓库里没有任何账号数据，也没有后台的凭据

真正的门在服务端：密钥校验、权限逐条放行、可选的 IP 白名单、随时吊销。
公开代码不会让任何人多看到一条数据。

---

## 自测

```bash
curl -s https://liejin.top/mcp \
  -H "Authorization: Bearer hk_你的密钥" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

能列出工具就说明密钥有效。

---

## 错误

| 现象 | 意思 |
| --- | --- |
| `缺少 API 密钥` | 没传 `--token`，也没设 `HUNTER_API_TOKEN` |
| `无法连接 ...：密钥无效…` | 密钥错了、过期了、被吊销了，或来源 IP 不在白名单 |
| `401 API key denied` | 同上，后台不会说明是哪一条，这是故意的 |
| `403` + 工具被拒 | 这把密钥没有该工具的权限 |
| 工具返回 `isError: true` | 工具执行失败，正文里有具体原因 |

---

## 许可

内部使用，未授权公开发布。
