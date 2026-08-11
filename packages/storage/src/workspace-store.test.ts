import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createNewRecord, createWorkspace } from "@moxiao/editorial";
import { RevisionConflictError, WorkspaceStore } from "./index";

const temporaryDirectories: string[] = [];

function store(): { store: WorkspaceStore; directory: string } {
  const directory = mkdtempSync(join(tmpdir(), "moxiao-storage-"));
  temporaryDirectories.push(directory);
  return { store: new WorkspaceStore(join(directory, "moxiao.sqlite")), directory };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("SQLite 工作区仓储", () => {
  it("原子保存并以修订号防止覆盖新输入", () => {
    const database = store().store;
    const initial = createWorkspace("full", [createNewRecord({ title: "新作", form: "xinshi", body: "正文", sequence: 1 })]);
    database.initializeWorkspace("main", initial);
    const loaded = database.loadWorkspace("main");
    expect(loaded?.records[0]?.draft.work.title).toBe("新作");

    loaded!.records[0]!.draft.work.title = "新作修订";
    const saved = database.saveWorkspace("main", loaded!, 0, "2026-08-11T12:00:00.000Z");
    expect(saved.revision).toBe(1);
    expect(() => database.saveWorkspace("main", saved, 0)).toThrow(RevisionConflictError);
    database.close();
  });

  it("可从恢复日志恢复旧修订且生成新的递增修订", () => {
    const database = store().store;
    const initial = createWorkspace("full", [createNewRecord({ title: "第一稿", form: "xinshi", body: "正文", sequence: 1 })]);
    database.initializeWorkspace("main", initial);
    const changed = structuredClone(initial);
    changed.records[0]!.draft.work.title = "第二稿";
    database.saveWorkspace("main", changed, 0, "2026-08-11T12:00:00.000Z");
    const restored = database.restoreRevision("main", 0, 1, "2026-08-11T12:01:00.000Z");
    expect(restored.revision).toBe(2);
    expect(restored.records[0]?.draft.work.title).toBe("第一稿");
    database.close();
  });

  it("语义版本为独立不可变快照", () => {
    const database = store().store;
    database.initializeWorkspace("main", createWorkspace("full"));
    const receipt = database.createSemanticVersion("main", "首次定稿", "2026-08-11T12:00:00.000Z");
    expect(receipt.snapshotHash).toHaveLength(64);
    expect(database.listSemanticVersions("main")).toEqual([receipt]);
    database.close();
  });

  it("保存变更写入 Outbox，清空文稿保留墓碑", () => {
    const database = store().store;
    const initial = createWorkspace("full", [createNewRecord({ title: "待清理", form: "xinshi", body: "正文", sequence: 1 })]);
    database.initializeWorkspace("main", initial);
    expect(database.pendingOutboxCount("main")).toBe(1);
    const cleared = database.saveWorkspace("main", { ...structuredClone(initial), records: [] }, 0, "2026-08-11T12:00:00.000Z");
    expect(cleared.records).toHaveLength(0);
    expect(database.pendingOutboxCount("main")).toBe(2);
    expect(database.tombstoneCount("main")).toBe(1);
    database.close();
  });
});
