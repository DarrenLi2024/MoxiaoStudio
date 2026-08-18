# 开发约定

## 环境

- Node.js 22+
- pnpm 10.33+
- macOS、Windows 或 Linux 桌面环境

## 常用命令

```bash
pnpm install
pnpm dev
pnpm typecheck
pnpm test
pnpm build
pnpm check
pnpm test:e2e
```

`pnpm dist:mac` 只用于正式 macOS 发布：它要求本机存在 Developer ID Application 证书和名为 `moxiao-notary` 的 notarytool 钥匙串凭据，并会依次执行签名、应用公证、DMG 公证、票据装订与 Gatekeeper 验收。完整流程见 [docs/MACOS_DISTRIBUTION.md](docs/MACOS_DISTRIBUTION.md)。

## 工作方式

1. 先确认修改属于领域规则、基础设施、界面还是适配器。
2. 领域规则先写失败测试，再实现最小代码。
3. UI 不直接依赖持久化实现，只消费用例或只读视图模型。
4. 新增渲染能力必须同时修改能力清单、预检规则和测试。
5. 新增出版文字类型必须先登记语义样式角色，再由 PDF/EPUB 适配器共同消费；不得在单一渲染器中写死字号、行距或装饰。
6. 新增 Ontology 关系必须说明主客体约束、证据来源和迁移策略。
7. 任何用户内容导入都先进入暂存区，检查完成后才进入活母本。

## 视觉方向

界面采用“书卷内核，现代工具外壳”。应用框架使用中性雾灰，文稿画布使用纸白，墨色承载正文，竹青用于主要操作，朱砂仅用于校改和风险状态。控制界面使用无衬线字体，题名和正文使用中文阅读字体。

避免满屏仿古纹理、卡片套卡片、无意义大圆角、装饰性印章和高频动画。所有状态必须支持键盘、深色模式、较大字号和减弱动态效果。

## 文档同步

架构、数据契约、测试门槛、发布边界或视觉令牌发生变化时，必须同步更新对应 Markdown 与 `CHANGELOG.md`。
