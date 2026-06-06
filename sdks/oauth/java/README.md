# OAuth SDK - Java

`ServerSDK/sdks/oauth/java` 提供 Java 17 + Maven 版本的 OAuth 集成示例。

## 功能

- 生成 PKCE 授权 URL
- 授权码换 token
- 刷新 token
- 访问 `GET /users/me`
- 正确处理 OAuth 风格错误响应

## 运行

1. 复制 `.env.example` 为 `.env`
2. 执行：

```bash
mvn compile exec:java -Dexec.mainClass=cn.qysyw.oauth.Main
```

如果你需要完整浏览器登录页，请使用 `demos/oauth/node/`。
