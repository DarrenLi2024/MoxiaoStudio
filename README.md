# 墨校台 Moxiao Studio

墨校台是一套面向中文文学创作者、编校者与出版协作者的本地优先开放出版工作台。项目以结构化母本为核心，贯通人工编校、版本溯源、媒体管理、语义组织与多平台出版。

当前版本为 `0.3.2`，已经建立桌面工作台、文枢领域模型、Ontology v1、语义成书系统与可实际读写的 SQLite 本地资料库。现有“闲心子墨”数据尚未迁入本仓库，避免建设期污染正式作品事实源。

桌面工作台已经具备 JSON 审校包导入导出、900ms 自动保存、体裁与状态筛选、新增、批量文本拆分、清空前强制备份、重复候选双栏对照和语义版本快照。导入兼容既有 `XZM-EW 0.1`，内部 UUIDv7 不写回覆盖旧稳定 ID。

笺读工作区支持今译、锚定笺注、赏析、校勘记和版本说明。出版中心采用“书稿—编排—前置页—样式—插图—导出”六步工作流：支持体裁多选、系年范围、动态阅读顺序与顺序固化，可按体裁、系年、意境或综合策略生成带理由的编排候选；样式修改以受控样式表实时呈现，并可用书页、平板和手机视口检查。导出预检按素材归并问题，可在导出页集中生成替代文字草稿、复核权属或定位其他修正步骤。成品从同一不可变出版快照输出 PDF、EPUB 3.3 或目标客户端暂存包。校勘记和版本说明默认不进入读者成品，只能显式汇总为书末附录或内部审校附录。

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

## 开源与隐私

源代码采用 [Mozilla Public License 2.0](LICENSE)，第三方声明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。桌面版不要求账号、不含遥测，文稿保存在本机；用户作品和媒体不随代码开源。详细边界见 [LICENSE_POLICY.md](LICENSE_POLICY.md)、[PRIVACY.md](PRIVACY.md) 与 [CONTENT_RIGHTS.md](CONTENT_RIGHTS.md)。

macOS Apple Silicon 公开发行包通过 `pnpm dist:mac` 构建。该命令强制执行 Developer ID 签名、Apple 公证、票据装订和 Gatekeeper 验收，缺少发行凭据时拒绝输出公开包。
