# 第三方软件声明

墨校台文枢本身采用 Mozilla Public License 2.0。第三方组件继续遵循各自许可证，本文件不改变其条款。

## 桌面运行时直接依赖

| 组件 | 用途 | 许可证 |
|---|---|---|
| Electron | 桌面运行时 | MIT |
| React / React DOM | 界面渲染 | MIT |
| Lucide React | 界面图标 | ISC |
| uuid | UUIDv7 实体标识 | MIT |

Electron 安装包保留自身及 Chromium 的许可证文件。构建与测试工具还包含 MIT、ISC、Apache-2.0、BSD-2-Clause、BSD-3-Clause、Python-2.0、CC-BY-4.0、BlueOak-1.0.0、0BSD 及带 OR 选择的兼容许可组件。

发布前执行以下命令生成当前锁文件对应的完整清单：

```bash
pnpm licenses list --json
```

2026-08-11 审计未发现 GPL、AGPL 或“许可证未知”的依赖，也未发现已知 npm 安全漏洞。构建工具链中的 WTFPL 组件均为间接依赖，不作为墨校台源代码重新授权。

如果本清单与包内许可证冲突，以第三方组件随附的原始许可证为准。
