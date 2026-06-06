# Quyan-ServerSDK

`sdks/` 用于存放面向接入方的 SDK 风格示例工程。与 `demos/` 的区别是：

- `demos/` 更偏完整可运行流程与页面交互
- `sdks/` 更偏服务端集成模板与可复用调用方式

## 当前目录约定

```text
sdks/
└─ oauth/
   ├─ node/
   ├─ python/
   ├─ java/
   └─ go/
```

## 使用建议

- 想快速跑通浏览器授权流程：看 `demos/oauth/node/`
- 想从后端服务发起 OAuth 换 token / 刷新 / 调资源：看 `ServerSDK/sdks/oauth/<language>/`
- 如果只需要普通业务 API 调用，可继续参考文档站中的 `Node SDK` 与 `Python SDK`
