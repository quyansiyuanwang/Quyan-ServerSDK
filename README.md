# Quyan Server SDK

面向第三方接入方的多语言 SDK 模板和可运行集成 Demo。该仓库独立版本化，并作为 AppServerMonorepo 的 `integrations/server-sdk` Git submodule 引入。

## 目录

```text
server-sdk/
├── sdks/                 # 可复用的服务端集成模板
│   └── oauth/
│       ├── node/
│       ├── go/
│       ├── python/
│       └── java/
└── demos/                # 完整可运行的集成示例
    └── oauth/node/       # OAuth 2.0 授权码 + PKCE 浏览器示例
```

## OAuth 2.0

当前模板覆盖授权码、PKCE、Token 刷新、撤销和获取当前用户。服务端 API 路由为：

- `GET /v1/oauth/authorize`
- `POST /v1/oauth/token`
- `POST /v1/oauth/revoke`
- `GET /v1/users/me`

开始前，先在 AppServer 中创建并审核 OAuth Client。将对应示例的 `.env.example` 复制为 `.env`，填写 `OAUTH_BASE_URL`、Client ID、Client Secret 和回调地址，然后按该目录内 README 的命令运行。

## 安全

- `OAUTH_CLIENT_SECRET` 仅可用于受信任的服务端，禁止放入浏览器代码、前端构建变量或版本控制。
- 回调地址必须与 OAuth Client 中登记的地址完全一致。
- Access Token 应作为不透明 Bearer Token 处理，不应在客户端解析或记录完整 Token。

## 在 AppServerMonorepo 中使用

克隆主仓时使用：

```bash
git clone --recurse-submodules https://github.com/quyansiyuanwang/Quyan-AppServer.git
```

已克隆主仓但未初始化该仓时运行：

```bash
git submodule update --init --recursive integrations/server-sdk
```

SDK、Demo 的依赖、构建和运行均在各自目录内执行，不属于主仓 pnpm workspace。
