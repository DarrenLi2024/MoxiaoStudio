# 墨校台 Moxiao Studio

墨校台是一套面向中文文学创作者、编校者与出版协作者的本地优先开放出版工作台。项目以结构化母本为核心，贯通人工编校、版本溯源、媒体管理、语义组织与多平台出版。

当前处于 `0.1.0` 建设阶段，已经建立桌面工作台、文枢领域模型、Ontology v1、出版渲染契约，以及可实际读写的 SQLite 本地资料库。现有“闲心子墨”数据尚未迁入本仓库，避免建设期污染正式作品事实源。

桌面工作台已经具备 JSON 审校包导入导出、900ms 自动保存、体裁与状态筛选、新增、批量文本拆分、清空前强制备份、重复候选双栏对照和语义版本快照。导入兼容既有 `XZM-EW 0.1`，内部 UUIDv7 不写回覆盖旧稳定 ID。

闲心子墨通过独立内容适配器接入。适配器支持作品、笺读、校音、朗读和媒体清单的内容哈希审计及无损语义往返；默认不修改 iOS 仓库，也不把用户作品与媒体复制进开源代码仓库。

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
pnpm test:e2e
```

具体工程边界见 [ARCHITECTURE.md](ARCHITECTURE.md)，开发规则见 [DEVELOPMENT.md](DEVELOPMENT.md)，测试矩阵见 [TESTING.md](TESTING.md)。

## 开源状态

仓库当前标记为 `UNLICENSED`，原因是正式公开前仍需完成字体、模板、样例内容和第三方渲染器的许可证审计。完成审计后再落正式开源许可证，不能仅修改 `package.json` 字段冒充合规开放。
