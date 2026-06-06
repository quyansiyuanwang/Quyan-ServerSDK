# AppServer Demos

`demos/` 用于存放独立、可运行的集成示例，方便验证主仓库后端能力或给第三方接入方提供参考。

## 当前示例

| 示例 | 目录 | 说明 | 默认端口 |
| --- | --- | --- | --- |
| OAuth Demo | `oauth-demo/` | 传统 OAuth 2.0 集成示例，覆盖授权、换 token、刷新与用户信息获取 | `3200` |

## 使用方式

不同示例通常有各自的依赖、环境变量与启动命令。

当前可直接从仓库根目录启动的示例：

```bash
pnpm run demo:oauth
```

也可以进入具体示例目录后单独安装和运行。

## 目录约定

- 每个示例应保持独立的 `package.json`
- 每个示例应提供自己的 `README.md`
- 示例优先关注“最小可运行”和“对接流程清晰”，不承担主业务功能

## 相关文档

- `demos/oauth-demo/README.md`
- 仓库总览：`../README.md`
- 后端接口服务：`../NodeBackend/README.md`
