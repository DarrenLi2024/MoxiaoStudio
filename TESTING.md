# 测试与验收

## 自动化门禁

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

EPUB 发行候选必须再使用官方 EPUBCheck 验证：

```bash
pnpm validate:epub "/绝对路径/书稿.epub"
```

`pnpm check` 必须顺序执行上述三项并返回退出码 0。

桌面关键链路在构建后运行 `pnpm test:e2e`。测试使用独立临时资料库，启动真实 Electron 窗口，验证新增、编辑自动保存、重载持久化、体裁筛选和查重入口；截图保存到 `artifacts/e2e/`，不得连接用户正式资料库。
同一套端到端测试还会打开出版中心、启用文字水印、验证分页预览、导出真实 A5 Tagged PDF，并复核文件签名、页数和结束标记。
测试随后切换到 EPUB 3，显式关闭 EPUB 不支持的水印和页眉页脚，生成真实 `.epub` 并复核 mimetype、container、OPF、导航和章节条目；另用深色窄窗口与减弱动态效果打开笺读编辑器，验证语义检查器自动收起且不遮挡编辑区，并保留截图。

DMG 挂载后，使用包内可执行文件做冷启动冒烟测试：

```bash
MOXIAO_PACKAGED_APP="/Volumes/墨校台文枢/墨校台文枢.app/Contents/MacOS/墨校台文枢" pnpm test:package
```

该测试必须看到“一卷通校”、SQLite WAL 状态与可用的新增作品入口，证明验收对象是安装包而非开发构建。

兼容旧审校包可执行：

```bash
pnpm audit:workspace "/绝对路径/墨校台-审校包.json"
```

完整备份导入还必须覆盖首次安装场景：内容指纹保持不变的内置演示文稿可被全量备份安全替换，自动保存产生的修订号不影响判定；只要任一演示记录被实际修改或工作区包含真实用户记录，就继续执行稳定 ID、基线哈希和操作类型门禁，不得静默覆盖。

闲心子墨适配器使用真实项目快照做只读往返：

```bash
pnpm audit:xianxinzimo "/绝对路径/PoetryApp1.0"
```

输出必须报告零语义差异。适配器通过后仍要在闲心子墨仓库运行该项目自身的 `audit-editorial-structure.mjs`、`audit-pronunciations.mjs` 和 `audit-natural-readings.mjs`，两边门禁不能互相替代。

## 领域测试

- UUIDv7 格式与时间排序性质。
- 节点删除生成墓碑，ID 不复用。
- base/ours/theirs 单边修改、相同修改和冲突修改。
- Ontology 关系主客体类型约束。
- Publication Profile 对水印、页眉页脚、出血、PDF Profile 等能力做确定性预检。
- 母本到交换包再回灌的语义往返不变性。

## UI 回归

开发环境可使用 `MOXIAO_THEME=dark pnpm dev` 强制验证深色外观，避免依赖测试机当前系统主题。

- 1440px 以上显示项目栏、文库、编辑区和检查器。
- 窄窗口收纳检查器，文稿编辑区保持可用。
- 浅色和深色模式文字对比清晰。
- 减弱动态效果时不出现位移和缩放动画。
- 键盘焦点可见，图标按钮有可访问名称。
- 空项目、加载、保存失败和后台任务状态具有明确反馈。

## 发布验收

桌面安装包公开为稳定版前还必须完成 Apple Developer ID 签名、公证与自动更新来源。第三方许可证、字体与样例内容边界、仓库秘密扫描已纳入 0.1.0 开发预览门禁；不把未执行的签名和公证写成通过。
