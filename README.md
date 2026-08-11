# 墨校台 Moxiao Studio

墨校台是一套面向中文文学创作者、编校者与出版协作者的本地优先开放出版工作台。项目以结构化母本为核心，贯通人工编校、版本溯源、媒体管理、语义组织与多平台出版。

当前处于 `0.1.0` 地基阶段，已经建立桌面工作台、文枢领域模型、Ontology v1 与出版渲染契约。现有“闲心子墨”数据尚未迁入本仓库，避免建设期污染正式作品事实源。

## 产品形态

- `Moxiao Studio`：Electron 桌面端主产品。
- `Moxiao Server`：后续提供的自托管 Web 协作服务。
- `Moxiao CLI`：批量摄取、检查、渲染和发布自动化入口。
- `Moxiao Core`：三种形态共享的领域、Ontology 与出版契约。

## 本地启动

```bash
pnpm install
pnpm dev
```

## 验证

```bash
pnpm check
```

具体工程边界见 [ARCHITECTURE.md](ARCHITECTURE.md)，开发规则见 [DEVELOPMENT.md](DEVELOPMENT.md)，测试矩阵见 [TESTING.md](TESTING.md)。

## 开源状态

仓库当前标记为 `UNLICENSED`，原因是正式公开前仍需完成字体、模板、样例内容和第三方渲染器的许可证审计。完成审计后再落正式开源许可证，不能仅修改 `package.json` 字段冒充合规开放。
