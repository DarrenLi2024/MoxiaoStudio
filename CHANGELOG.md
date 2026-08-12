# 更新日志

## 0.1.2 - 2026-08-12

- 修复首次安装后内置演示文稿阻止全量审校备份导入的问题；仅允许完整备份替换内容未被修改的初始演示区，自动保存产生的修订号不影响判断，真实用户记录继续受冲突门禁保护。

## 0.1.1 - 2026-08-11

- 修复互联网下载后 Gatekeeper 报告“应用已损坏”的发行缺陷。
- 公开包强制使用 Developer ID Application 签名、Hardened Runtime 和安全时间戳。
- 建立应用与 DMG 双层公证、票据装订、Gatekeeper 验收和 SHA-256 清单链路。
- 修正 DMG 容器签名顺序，确保公证票据之外还具备可供 Gatekeeper 验证的 Developer ID 签名。
- 缺少签名或公证凭据时失败关闭，避免再次误发布临时签名包。

## 0.1.0 - 2026-08-11

- 建立独立墨校台 monorepo 与中文工程文档体系。
- 建立 Work、Expression、Manifestation、Item 四层领域语义。
- 建立 UUIDv7 文稿节点、墓碑和节点级三方合并契约。
- 建立 Ontology v1 与 Publication IR、渲染能力预检。
- 建立 Electron + React 桌面工作台地基与首版视觉系统。
- 接入 SQLite WAL、乐观修订锁、恢复日志、不可变语义版本、墓碑与 Outbox。
- 迁移 XZM-EW JSON 导入导出、体裁与状态筛选、新增、批量补录、备份后清空及双栏查重治理。
- 建立真实 Electron 端到端回归，覆盖编辑自动保存、重启持久化、筛选与查重。
- 建立出版中心，落实纸张、水印、页眉页脚、页码与 PDF 规范配置。
- 接入分页 HTML 与真实 Tagged PDF 导出，增加资源权利、乱码及 PDF 成品验证门禁。
- 建立闲心子墨内容适配器和 `XZM-XIANXIN-CONTENT 1.0` 内容包，覆盖作品、笺读、校音、朗读及媒体清单。
- 用真实闲心子墨工作树完成 233 条作品记录的无损语义往返，并保持源仓库只读。
- 开放 MPL-2.0 许可证，补齐隐私、内容权利、AIGC、第三方声明、社区规范与发布门禁。
- 升级 Electron 41.10.3，修复已公开高危漏洞，并增加 CSP、导航拦截与 IPC 输入边界。
- 建立 macOS Apple Silicon DMG 构建配置和 GitHub CI/Dependabot 基线。
- 生成并挂载验收首个 Apple Silicon DMG，从安装包内完成冷启动冒烟测试。
- 稳定云端窄屏下的出版主入口定位，并放宽 PDF 成品验收等待窗口。
- GitHub Actions 升级到 Node 24 运行时的官方主版本，消除旧运行时弃用隐患。
