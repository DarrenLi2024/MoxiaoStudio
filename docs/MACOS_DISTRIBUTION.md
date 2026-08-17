# macOS 直接发行

## 发布原则

面向 GitHub 或官网直接下载的 macOS 应用必须同时满足：Developer ID Application 签名、Hardened Runtime、安全时间戳、Apple 公证、应用与 DMG 票据装订、Gatekeeper 验收。临时签名、Apple Development 签名和仅移除隔离属性都不属于公开发行方案。

官方命令 `pnpm dist:mac` 采用失败关闭策略：缺少 Developer ID 或 notarytool 凭据时立即退出，不生成可误传的公开包。
封装直接复用 pnpm 已安装并锁定版本的 `electron/dist`，避免 electron-builder 在发行阶段再次访问不稳定的远程 Electron 分发源；依赖目录缺失时仍会失败关闭。

## 一次性配置

1. 在 Xcode 的“设置 → Apple Accounts → 团队 → Manage Certificates”创建 `Developer ID Application`。
2. 为 Apple ID 创建仅用于公证的 App 专用密码，随后存入本机登录钥匙串：

```bash
xcrun notarytool store-credentials "moxiao-notary" \
  --apple-id "你的 Apple ID" \
  --team-id "你的 Team ID"
```

密码只进入系统钥匙串，不写入仓库、脚本、终端历史或 CI 日志。

## 本地发布

```bash
pnpm check
pnpm test:e2e
pnpm dist:mac
```

当钥匙串里有多枚有效 Developer ID 证书时，可显式指定 SHA-1：

```bash
MOXIAO_SIGNING_IDENTITY="证书 SHA-1" pnpm dist:mac
```

发布脚本会验证应用签名、团队 ID、安全时间戳和应用票据；随后使用同一 Developer ID 对 DMG 容器签名，再把签名后的最终字节提交公证、装订票据并执行 Gatekeeper 验收，最后生成独立 SHA-256 文件。DMG 必须遵循“签名 → 公证 → 装订”顺序，任一步失败都不得上传资产。

## 成品复验

把 DMG 放入带 `com.apple.quarantine` 的下载场景后执行：

```bash
spctl --assess --type open --context context:primary-signature -vv "发布包.dmg"
codesign --verify --verbose=2 "发布包.dmg"
xcrun stapler validate "发布包.dmg"
```

挂载后还要对包内应用执行 `codesign --verify --deep --strict`、`spctl --assess --type exec` 和真实冷启动测试。
