# OAuth SDK - Go

`ServerSDK/sdks/oauth/go` 提供 Go 版本的可运行 OAuth 集成模板。

## 功能

- 生成 PKCE 授权 URL
- 交换授权码
- 刷新 token
- 调用 `GET /users/me`
- 识别 `/oauth/token` 的 OAuth 错误结构

## 运行

```bash
go run .
```

运行前请先复制 `.env.example` 为 `.env`。
