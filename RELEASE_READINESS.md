# 发布就绪检查

## 0.1.1 Gatekeeper 修复

- 原 0.1.0 DMG 使用 ad-hoc 临时签名，Gatekeeper 会以“已损坏”拒绝从互联网下载的应用。
- 0.1.1 发布链路已强制要求 Developer ID Application、Hardened Runtime、安全时间戳、应用与 DMG 双层公证及票据装订。
- 只有 `spctl`、`stapler`、包内签名验证和冷启动全部通过后，才允许替换公开下载资产。

## 0.1.0 已通过

- 类型检查、22 项单元/集成测试和生产构建。
- 两条真实 Electron 端到端链路：编校持久化与出版 PDF。
- SQLite WAL、修订冲突、恢复快照、墓碑与 Outbox。
- 闲心子墨 233 条作品记录只读摄取及零差异语义往返。
- npm 已知漏洞扫描为零；直接依赖和许可证族已审计。
- 常见密钥格式扫描无命中；仓库不含用户作品、音频、插图或生成内容包。
- Electron 渲染进程沙箱、上下文隔离、Node 禁用、CSP、窗口导航拦截和 IPC 输入上限。

## 本地首发包

`pnpm dist:mac` 已生成 Apple Silicon DMG：`Moxiao-Studio-0.1.0-arm64.dmg`（114 MB）。

- SHA-256：`d4aedc49a83a1a713b03704446b556bf6e571a37bdf6b4b77a7bec5a7318719e`
- DMG CRC32 校验、只读挂载和卸载成功。
- 已从 DMG 内的 `墨校台文枢.app` 冷启动；包内冒烟测试 1/1 通过。
- Bundle ID 为 `com.moxiaostudio.desktop`，最低系统版本为 macOS 12.0。
- 当前采用 ad-hoc 临时签名，只能标记为 0.1.0 未签名开发预览。

## 正式公开下载前仍需外部配置

- GitHub Actions 中的签名证书、notarytool 凭据和受保护环境。
- 公共域名、隐私联系邮箱和安全报告邮箱。

本地签名与公证凭据不得提交仓库。GitHub 自动签名未完成前，正式发行由受控本机生成并上传，CI 继续承担源码、测试和漏洞门禁。
