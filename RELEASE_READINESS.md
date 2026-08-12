# 发布就绪检查

## 0.1.2 全量备份恢复修复

- 已复核 `XZM-EW 0.1` 清空前备份：2,347,402 字节、230 篇作品，远低于 50 MB 导入上限；文件可解析并可在临时 SQLite 中完整保存。
- 失败根因是安装版内置 5 篇演示文稿令工作区非空，旧合并器因此拒绝备份中的既有 `update` 记录；并非备份文件损坏。
- 新逻辑只在当前五篇记录与内置演示模板语义指纹完全一致时允许全量备份替换；自动保存的修订号和 JSON 键顺序不影响判断，任何实际内容修改仍会阻止覆盖。
- Electron 回归已验证演示区自动保存后导入完整备份、SQLite 落盘和应用重启后恢复；通用新增、自动保存、查重及出版 PDF 回归继续通过。
- 该备份另有 7 项内容审计错误和 1 组查重候选，导入后仍需在工作台内复核，但不构成本次保存失败原因。

## 0.1.1 Gatekeeper 修复

- 原 0.1.0 DMG 使用 ad-hoc 临时签名，Gatekeeper 会以“已损坏”拒绝从互联网下载的应用。
- 0.1.1 发布链路已强制要求 Developer ID Application、Hardened Runtime、安全时间戳、应用与 DMG 双层公证及票据装订。
- 最终 DMG 公证提交 `664accd9-34d9-40df-bcd4-01e5aaae11fd` 已由 Apple 接受；应用公证提交为 `6d6b301c-da86-4ef3-b18b-2f2d101de11d`。
- DMG 与包内应用的 `spctl` 均返回 `source=Notarized Developer ID`，`stapler` 和深层签名验证通过。
- 已给 DMG 副本添加 `com.apple.quarantine` 模拟浏览器下载，完成只读挂载及包内真实冷启动，冒烟测试 1/1 通过。
- 最终 Apple Silicon DMG 为 `Moxiao-Studio-0.1.1-arm64.dmg`（119,230,995 字节），SHA-256：`93b7484afc54d6089eb32cc2b4f45b36731430c062b38569a4ced301fd849342`。

## 0.1.0 已通过

- 类型检查、22 项单元/集成测试和生产构建。
- 两条真实 Electron 端到端链路：编校持久化与出版 PDF。
- SQLite WAL、修订冲突、恢复快照、墓碑与 Outbox。
- 闲心子墨 233 条作品记录只读摄取及零差异语义往返。
- npm 已知漏洞扫描为零；直接依赖和许可证族已审计。
- 常见密钥格式扫描无命中；仓库不含用户作品、音频、插图或生成内容包。
- Electron 渲染进程沙箱、上下文隔离、Node 禁用、CSP、窗口导航拦截和 IPC 输入上限。

## 0.1.0 已撤回包

`pnpm dist:mac` 已生成 Apple Silicon DMG：`Moxiao-Studio-0.1.0-arm64.dmg`（114 MB）。

- SHA-256：`d4aedc49a83a1a713b03704446b556bf6e571a37bdf6b4b77a7bec5a7318719e`
- DMG CRC32 校验、只读挂载和卸载成功。
- 已从 DMG 内的 `墨校台文枢.app` 冷启动；包内冒烟测试 1/1 通过。
- Bundle ID 为 `com.moxiaostudio.desktop`，最低系统版本为 macOS 12.0。
- 当前采用 ad-hoc 临时签名，只能标记为 0.1.0 未签名开发预览。

## 后续外部配置

- GitHub Actions 中的签名证书、notarytool 凭据和受保护环境。
- 公共域名、隐私联系邮箱和安全报告邮箱。

本地签名与公证凭据不得提交仓库。GitHub 自动签名未完成前，macOS 发行由受控本机生成并上传，CI 继续承担源码、测试和漏洞门禁。
