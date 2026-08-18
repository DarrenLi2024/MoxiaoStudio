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
同一套端到端测试还会走完出版中心六步流程，验证体裁多选、动态顺序、顺序固化、意境编排候选、前置页确认、语义样式实时渲染与锁定、单篇随文锚点插图和文字水印，导出真实 A5 Tagged PDF，并复核文件签名、页数和结束标记。
样式实时渲染必须断言预览子文档存在已挂载样式表，改变诗词正文字号后核验真实计算样式，同时确认篇章标题不受牵连；锁定诗词行距后切换主题，锁定值必须保持而未锁定标题对齐应随主题更新。只断言 HTML 中包含 CSS 不视为通过。插图回归先保留缺失替代文字和未知权属，再在导出页集中生成草稿、确认权属并验证门禁解除。
测试随后切换到 EPUB 3.3，生成真实 `.epub` 并复核 mimetype、container、OPF、`spine`、导航、正文地标、章节及无障碍发现元数据；发行候选继续以 EPUBCheck 3.3 规则要求零 fatal、零 error、零 warning。另用深色窄窗口、115% 缩放与减弱动态效果打开笺读和出版中心，验证控件不横向溢出并保留截图。

DMG 挂载后，使用包内可执行文件做冷启动冒烟测试：

```bash
MOXIAO_PACKAGED_APP="/Volumes/墨校台文枢/墨校台文枢.app/Contents/MacOS/墨校台文枢" \
MOXIAO_E2E_PDF_PATH="/private/tmp/moxiao-packaged-proof.pdf" \
pnpm test:package
```

该测试必须看到“一卷通校”、SQLite WAL 状态与可用的新增作品入口，并真实点击“出版”、打开出版中心、看到预检结果；提供 `MOXIAO_E2E_PDF_PATH` 时还会从包内应用真实导出 PDF 并验证文件结构，证明验收对象是安装包而非开发构建。

大体量书稿发行候选还须使用正式资料库的隔离副本导出一次完整 PDF，确认条目数、页数、文件字节数和 `validatePdfBytes` 结果。测试不得连接或改写用户正式资料库。

```bash
MOXIAO_LARGE_DB_COPY="/绝对路径/在线备份.sqlite" \
MOXIAO_E2E_PDF_PATH="/private/tmp/整卷验收.pdf" \
pnpm test:large-publication
```

`MOXIAO_LARGE_DB_COPY` 必须是通过 SQLite `.backup` 生成的独立快照，不能直接指向 `Application Support` 中的正式库。测试会再次复制到唯一临时 profile，并只修改该副本中的出版项目。

正式资料库预检和样式回归可单独运行：

```bash
MOXIAO_PRODUCTION_DB_COPY="/绝对路径/在线备份.sqlite" \
pnpm test:production-preflight
```

该门禁会在二次复制后的临时 profile 中复用一张缺少替代文字的插图，验证重复问题按素材归并为一张任务卡，同时检查预览无 CSP 样式错误；不得直接指向正式库。

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
