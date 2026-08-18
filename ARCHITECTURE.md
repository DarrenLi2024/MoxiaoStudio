# 架构说明

## 总体结构

墨校台采用“模块化单体 + 端口适配器”结构。P0 不拆微服务，但领域包不得依赖 Electron、数据库或具体渲染器。

```text
apps/desktop          Electron 主进程、预加载桥与 React 工作台
packages/domain       作品、表达、文稿树、版本、变更与合并规则
packages/ontology     实体类型、关系词表与语义约束
packages/publication  Publication IR、出版配置、渲染能力与预检
packages/editorial    XZM-EW 兼容摄取、人工编校工作区、查重与安全合并
packages/storage      SQLite 事务仓储、恢复日志、语义版本、墓碑与 Outbox
packages/xianxinzimo-adapter  闲心子墨资源与文枢工作区之间的只读防腐层
```

## 四层出版实体

- `Work`：抽象的思想或艺术作品。
- `Expression`：作品的一次具体文本表达，可形成连续语义版本。
- `Manifestation`：引用确定版本与哈希的不可变出版快照。
- `Item`：某次导出生成的 PDF、EPUB、DOCX、WebPub 或 App 内容包文件。

活母本继续修改不会改变既有 `Manifestation`。重新出版必须生成新快照和新 `Item`。

## 文稿树

文稿使用泛化类型节点树，首批节点类型包括作品、部分、阕、节、段、句、行、对联、题注、引用、跋文和附录。节点创建时分配 UUIDv7；删除只产生墓碑。拼音、批注、音频时间轴和证据通过节点 ID 锚定，不写入字符内容。

## 合并与同步预留

核心变更以节点为单位记录。三方合并比较 base/ours/theirs：单边变更直接接纳，两边相同变更直接合并，同节点不同变更产生人工冲突。SQLite 已落 Outbox 与墓碑，当前只负责可靠记录本地变更；远端投递和多人协作仍是后续适配器，不得反向侵入母本事务。

桌面端不再依赖本地 HTTP 保存服务。渲染进程通过窄化 IPC 交给主进程事务写入 SQLite；每次保存使用修订号乐观锁，并同时写恢复快照。旧审校包导入按范围、稳定 ID、基线哈希三重核验，命中已有记录时保留内部实体 UUID，避免重复导入造成身份漂移。

## Ontology

SQLite/PostgreSQL 将继续承担事务事实源。Ontology 是版本化语义控制层，不要求 P0 引入图数据库。稳定实体采用关系表，稀疏和可扩展关系采用带证据、置信度与有效期的关系记录；交换层预留 JSON-LD。

## 出版架构

所有导出先生成与界面无关的 `PublicationDocument`，再应用 `PublicationProfile`。每个渲染适配器声明 `RendererCapabilities`；预检不通过时不得静默导出。

桌面实时预览使用沙箱 `iframe srcDoc`，出版样式表以固定受控 nonce 同时通过父页面与子文档 CSP；不允许用全局 `unsafe-inline` 绕过安全边界，图片焦点等动态样式必须汇总为样式类。端到端门禁须断言 `document.styleSheets` 已挂载并核对计算样式，不能只检查生成 HTML 字符串。

`PublicationProject` 位于活母本与 `PublicationDocument` 之间，当前格式为 1.2，独立保存书名、篇目收录、作者编定顺序、多体裁/系年筛选、电子书兼容配置、前置页事实、编校信息策略、媒体位置、字体和语义主题。空 `genreFilters` 表示全部体裁；1.0/1.1 的单体裁字段在读取时确定性迁移。出版项目不得改写作品 `seq`；多部书稿可以引用同一作品表达。生成成品时锁定项目、母本修订和表达哈希，形成新的 `Manifestation`。

智能编排只生成可解释候选，篇目可以锁定位置，应用前保存旧顺序并可撤销。意境标签由当前正文、题注和赏析确定性推断，不写回作品事实层。媒体资产与摆放位置分离，同一图片可以在多个篇目复用；移除篇目位置不删除图库原图。`PublicationDocument` 使用 `cover`、`copyright`、`foreword`、`toc`、`chapter`、`author-bio`、`apparatus` 等语义角色，PDF、EPUB 和内容包不得各自重新推导成书内容。

预检问题携带素材、篇章与修正步骤定位；界面按素材 ID 归并同图多处引用，只修改一次即可覆盖全部摆放。系统可以基于题名和图注生成替代文字草稿，但不得推断图片使用权，权属仍须由用户明确选择。

默认开源渲染路径计划使用 Vivliostyle；专业印刷可选接入受许可的 Prince 或出版社指定引擎。PDF、EPUB、DOCX、Web 和闲心子墨内容包均消费同一 Publication IR。

桌面端首个内置适配器使用 Electron Chromium 生成通用 Tagged PDF，实际支持文字水印、页眉页脚、页码、A4/A5/B5 和自定义尺寸。PDF/X、PDF/A、PDF/UA、CMYK、出血裁切和左右页镜像边距只有在适配器明确声明能力时才能启用；内置适配器不会虚报。详细边界见 [docs/PUBLICATION.md](docs/PUBLICATION.md)。

内置 EPUB 3.3 适配器生成可重排电子书，包含 OPF、清单、`spine`、导航与正文地标、XHTML 章节、保守响应式 CSS、版权和基础无障碍发现元数据，以及经权利确认的图片/字体。PDF 专属的页眉页脚、水印、固定页码和印刷参数不会写入 EPUB，也不会误阻断电子书导出。Apple Books 与中文阅读器兼容配置仍共享标准 EPUB 基线，平台差异通过预检和后续适配器扩展。闲心子墨和 WebPub 先输出结构化暂存包，保留快照哈希与能力声明，不直接覆盖目标客户端。

闲心子墨适配器按文件哈希摄取作品、笺读、语境校音、朗读轨与媒体清单，并提供从 App 资源到文枢工作区再回到原资源结构的语义往返。适配器不直接写 iOS 仓库；交付包、媒体权利与验证流程见 [docs/XIANXINZIMO_ADAPTER.md](docs/XIANXINZIMO_ADAPTER.md)。

## 安全边界

- Electron 渲染进程启用沙箱和上下文隔离，不直接获得 Node.js 能力。
- 文件、数据库和渲染任务通过窄化预加载 API 调用。
- 用户内容、媒体、字体和出版模板不进入代码仓库。
- 自托管 Web 版未来必须增加租户隔离、任务沙箱、资源配额与显式权限模型。
