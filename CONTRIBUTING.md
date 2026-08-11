# 参与贡献

贡献必须先说明问题、事实来源、影响的领域契约和验证方式；不得提交私人作品、未授权媒体、字体文件或出版社私有模板。参与即表示同意 [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)。

代码提交前运行：

```bash
pnpm check
pnpm test:e2e
pnpm audit --audit-level high
```

改变领域不变量时必须新增 ADR，不允许仅用代码注释改变产品语义。
