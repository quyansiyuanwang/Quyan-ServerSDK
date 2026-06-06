# OAuth Demo

`demos/oauth/node` 是 `Quyan-ServerSDK` 目录规范下的浏览器可运行 OAuth 示例，演示如何与本仓库后端现有 OAuth 能力完成完整授权码集成。

## 覆盖流程

- Authorization Code 登录
- PKCE（`S256`）
- 回调换 token
- Refresh Token 刷新
- 访问 `GET /users/me`
- Revoke + Logout

## 依赖接口

- `/oauth/authorize`
- `/oauth/token`
- `/oauth/revoke`
- `GET /users/me`

## 环境准备

先在主系统中创建并审批 OAuth Client，并确认：

1. client 已批准
2. 已包含 `profile` scope
3. `redirectUris` 精确包含回调地址
4. 已拿到 `client_id` 与 `client_secret`

推荐本地回调：`http://localhost:3200/oauth/callback`

## 配置

参考 `.env.example` 创建 `.env`：

```env
PORT=3200
SESSION_SECRET=replace-with-a-long-random-string
OAUTH_BASE_URL=http://localhost:10001
OAUTH_AUTHORIZE_BASE_URL=http://localhost:10001
OAUTH_CLIENT_ID=
OAUTH_CLIENT_SECRET=
OAUTH_REDIRECT_URI=http://localhost:3200/oauth/callback
OAUTH_SCOPE=profile
```

## 运行方式

在仓库根目录：

```bash
pnpm run demo:oauth
```

或在当前目录：

```bash
pnpm install
pnpm run dev
pnpm run start
```

访问：`http://localhost:3200`

## 常见问题

- `redirect_uri` 与后台配置不完全一致
- client 未批准
- `client_secret` 错误
- scope 未授权
- API host 与授权页 host 配置混淆

## 说明

- 该示例不走 `Auth Center`
- `/oauth/token` 返回的是 OAuth 风格错误对象，而不是主系统常规 `{ code, message, data }` 包装
- Access Token 应作为不透明 bearer token 使用，不做前端解析
- 如果你只需要多语言服务端接入模板，请改看 `ServerSDK/sdks/oauth/*`
