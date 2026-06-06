# OAuth SDK - Python

`ServerSDK/sdks/oauth/python` 提供 Python 版本的可运行 OAuth 集成模板，适合脚本、后端服务和自动化任务。

## 功能

- 生成授权 URL
- 生成 PKCE `S256`
- 交换授权码
- 刷新 token
- 调用 `GET /users/me`
- 区分 OAuth 协议错误与普通 HTTP 错误

## 运行

```bash
pip install -r requirements.txt
python app.py
```

如需完整浏览器登录页，请使用 `demos/oauth/node/`。
