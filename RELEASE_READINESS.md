# 发布就绪检查

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

## 正式公开下载前仍需外部凭据

- Apple Developer ID 签名和 Apple 公证；当前本地验收包明确为未签名开发预览。
- GitHub Actions 中的签名证书、notarytool 凭据和受保护环境。
- 公共域名、隐私联系邮箱和安全报告邮箱。

缺少上述凭据不影响源代码开源，但不得把未签名包描述为面向普通用户的正式 macOS 稳定版。
