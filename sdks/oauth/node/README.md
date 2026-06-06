# OAuth SDK - Node.js

`ServerSDK/sdks/oauth/node` 提供一个可直接运行的 Node.js 服务端 OAuth 示例，适合后端应用完成授权码换 token、刷新 token，并调用受保护资源。

## 功能

- 生成 OAuth authorize URL
- 使用 PKCE `S256`
- 交换授权码
- 刷新 access token
- 调用 `GET /users/me`
- 正确处理 `/oauth/token` 的 OAuth 错误格式

## 配置

复制 `.env.example` 为 `.env` 后填写：

```env
OAUTH_BASE_URL=http://localhost:10001
OAUTH_CLIENT_ID=...
OAUTH_CLIENT_SECRET=...
OAUTH_REDIRECT_URI=http://localhost:3300/oauth/callback
OAUTH_SCOPE=profile
```

## 运行

```bash
pnpm install
pnpm run dev
```

该示例不会启动 Web 服务器，而是输出：

- 授权 URL
- 回调示例说明
- 一组可复用的 SDK 方法

如果你需要完整浏览器登录体验，请改用 `demos/oauth/node/`。
