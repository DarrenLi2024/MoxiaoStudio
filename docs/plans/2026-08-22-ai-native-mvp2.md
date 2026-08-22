# 墨校台 MVP2「智校流」Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 建立本地优先、可选 BYOK、永不直接改写母本的结构化智校建议闭环，并补齐批量暂存、版本入口和真实导航。

**Architecture:** 新增纯 TypeScript `packages/assistant` 定义建议协议、本地检查器与远端响应校验；SQLite 保存运行和建议审计，Electron 主进程持有网络与凭据能力，React 只通过窄化 IPC 操作建议。现有 `EditorialWorkspace` 仍是母本事实源。

**Tech Stack:** TypeScript、React 19、Electron、SQLite、Vitest、Playwright。

---

### Task 1：建议领域协议与本地检查器

- 创建 `packages/assistant/src/index.ts`、`assistant.test.ts`、`package.json`、`tsconfig.json`。
- 先写体裁提示、系年结构补全、笺注锚点失配、字段白名单和远端 JSON 校验测试。
- 实现 `AssistantRun`、`AssistantSuggestion`、本地扫描和状态决策纯函数。
- 运行 `pnpm --filter @moxiao/assistant test` 与类型检查。

### Task 2：审计存储与安全凭据边界

- 修改 `packages/storage/src/workspace-store.ts` 与测试，增加运行/建议表和读写方法。
- 新建 `apps/desktop/src/main/assistant-service.ts`，实现本地扫描、OpenAI-compatible 显式调用、端点校验和 `safeStorage` 凭据文件。
- 不在任何日志或返回值暴露密钥。

### Task 3：IPC 与智校工作台

- 修改 preload 和主进程注册窄化 API。
- 新建 `AssistantWorkbench.tsx`；显示内容范围、联网状态、建议差异、理由、证据、置信度和接受/拒绝操作。
- 接受时校验原值，冲突则要求重新扫描。

### Task 4：批量暂存与版本治理

- 新增批量解析预览 IPC；现有批量对话框先预览，确认后才写入母本。
- 增加版本列表与恢复 IPC/UI；恢复前二次确认。
- 实现 `⌘K` 搜索聚焦，收敛无行为导航。

### Task 5：文档和验收

- 更新 README、ARCHITECTURE、DEVELOPMENT、TESTING、PRIVACY、AIGC_PROVENANCE、ROADMAP 与 CHANGELOG。
- 扩展 E2E 覆盖智校建议、接受后持久化、批量预览、版本入口、深色窄屏。
- 运行相关单测、`pnpm check`、`pnpm test:e2e`，检查截图、秘密与工作树差异。

