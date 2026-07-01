# safe-npm-sdk

[English](./README.md) | 简体中文

> 一个用于 npm registry API 的 TypeScript SDK,基于**从
> [api-docs.npmjs.com](https://api-docs.npmjs.com) 抓取的官方 OpenAPI 规范**构建。

本仓库用正确的方式逆向 npm registry API:权威来源不是手写的猜测,而是**内嵌在
npm 官方文档站点里的实时 OpenAPI 3.0.3 文档**。该规范被检入此仓库,渲染成可读
的参考文档,并用于校验 SDK 的请求与响应结构。SDK 中的每个端点都与该规范中的某个
操作一一对应(10 个 tag,共 32 个操作)。

## API 的来源

npm registry API 文档位于
[api-docs.npmjs.com](https://api-docs.npmjs.com),使用
[Redoc](https://redocly.com/redoc) 渲染一份 OpenAPI 规范。该规范是内联嵌在页面
HTML 里的,而非作为独立文件发布,因此本仓库将其提取出来并保留一份冻结副本:

| 文件                                                   | 说明                                                                                         | 如何重新生成                                |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------- | ------------------------------------------- |
| [`api-docs.npmjs.com.html`](./api-docs.npmjs.com.html) | 抓取的文档页面(事实来源)。                                                                   | 从 api-docs.npmjs.com 下载                  |
| [`openapi.json`](./openapi.json)                       | 提取出的 OpenAPI 3.0.3 规范——32 个操作、11 个 schema,基础 URL `https://registry.npmjs.org`。 | 从上面的 HTML 中解析 `__redoc_state` 数据块 |
| [`api-docs.npmjs.com.md`](./api-docs.npmjs.com.md)     | 由规范生成的人类可读参考文档。**这就是 API 文档。**                                          | `node scripts/gen-docs.mjs`                 |

👉 **阅读 [`api-docs.npmjs.com.md`](./api-docs.npmjs.com.md) 获取完整 API 参考**
——每个端点的方法、路径、参数、请求体、响应字段及示例,按 tag 分组(Tokens、
OIDC、Trust、Access、Audit、Org、Team、Publish、Search、Stage)。

## 仓库里有什么

一个 pnpm/Vite+ monorepo,包含两个包:

```
.
├── api-docs.npmjs.com.html   # 抓取的文档(事实来源)
├── openapi.json              # 提取出的 OpenAPI 规范
├── api-docs.npmjs.com.md     # 生成的人类可读 API 参考文档
├── scripts/                  # 规范提取 + markdown 生成
└── packages/
    ├── safe-npm-sdk/         # 发布的 SDK(ESM + fetch + zod)
    └── web-example/          # 私有的只读浏览器示例
```

- **[`packages/safe-npm-sdk`](./packages/safe-npm-sdk)** —— SDK 本体。基于可配置
  client 的纯函数,zod 校验响应,一等公民地处理 2FA / `npm-notice` / WebAuthn。
  用法见其 [README](./packages/safe-npm-sdk/README.md)。
- **[`packages/web-example`](./packages/web-example)** —— 一个浏览器示例,通过同源
  代理(绕过 CORS 并拒绝非 GET 请求)对线上 registry 调用安全的 GET 端点。

## 为什么抓取规范而不是手写?

npm 发布的 registry 文档是对端点、其请求头(2FA、`npm-otp`、`npm-notice`)及响应
结构唯一权威的描述——包括只有打线上服务才会暴露的怪癖。通过从该规范派生 SDK 并在
运行时校验响应,本项目忠于真实 API,并能发现漂移(例如某字段规范里标为 number
但 registry 返回数字字符串),而不是静默失败。

## 开发

本仓库使用 [Vite+](https://viteplus.dev/)(`vp`)作为统一工具链。

```bash
vp install        # 安装依赖
vp check          # 格式化 + lint + 类型检查
vp test           # vitest + msw(无需真实 token)
vp build          # 打包 SDK(js + d.ts), vp run --filter safe-npm-sdk build
vp dev            # 运行浏览器示例, vp dev packages/web-example
```

## 许可证

MIT —— 与上游 npm registry API 文档相同。
