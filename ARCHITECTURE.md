# 架构说明

## 总体结构

墨校台采用“模块化单体 + 端口适配器”结构。P0 不拆微服务，但领域包不得依赖 Electron、数据库或具体渲染器。

```text
apps/desktop          Electron 主进程、预加载桥与 React 工作台
packages/domain       作品、表达、文稿树、版本、变更与合并规则
packages/ontology     实体类型、关系词表与语义约束
packages/publication  Publication IR、出版配置、渲染能力与预检
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

核心变更以节点为单位记录。三方合并比较 base/ours/theirs：单边变更直接接纳，两边相同变更直接合并，同节点不同变更产生人工冲突。P0 先固化数据契约，Outbox、远端同步和多人协作后续实现。

## Ontology

SQLite/PostgreSQL 将继续承担事务事实源。Ontology 是版本化语义控制层，不要求 P0 引入图数据库。稳定实体采用关系表，稀疏和可扩展关系采用带证据、置信度与有效期的关系记录；交换层预留 JSON-LD。

## 出版架构

所有导出先生成与界面无关的 `PublicationDocument`，再应用 `PublicationProfile`。每个渲染适配器声明 `RendererCapabilities`；预检不通过时不得静默导出。

默认开源渲染路径计划使用 Vivliostyle；专业印刷可选接入受许可的 Prince 或出版社指定引擎。PDF、EPUB、DOCX、Web 和闲心子墨内容包均消费同一 Publication IR。

## 安全边界

- Electron 渲染进程启用沙箱和上下文隔离，不直接获得 Node.js 能力。
- 文件、数据库和渲染任务通过窄化预加载 API 调用。
- 用户内容、媒体、字体和出版模板不进入代码仓库。
- 自托管 Web 版未来必须增加租户隔离、任务沙箱、资源配额与显式权限模型。
