import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createNewRecord, createWorkspace } from "@moxiao/editorial";
import { decideAssistantSuggestion, scanLocalEditorial } from "@moxiao/assistant";
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
    const changed = database.loadWorkspace("main")!;
    changed.records.push(createNewRecord({ title: "版本后新增", form: "sanwen", body: "正文", sequence: 1 }));
    database.saveWorkspace("main", changed, 0);
    expect(database.restoreSemanticVersion("main", receipt.id, 1).records).toHaveLength(0);
    database.close();
  });

  it("持久化智校运行与人工决定，不保存完整输入正文", () => {
    const database = store().store;
    const record = createNewRecord({ title: "七绝·试作", form: "sanwen", body: "正文", sequence: 1 });
    database.initializeWorkspace("main", createWorkspace("full", [record]));
    const result = scanLocalEditorial([record], "selected", "2026-08-22T12:00:00.000Z");
    database.saveAssistantRun("main", result.run, result.suggestions);
    expect(database.listAssistantRuns("main")[0]).toMatchObject({ suggestionCount: 1, inputHash: expect.any(String) });
    const accepted = decideAssistantSuggestion(result.suggestions[0]!, "accepted", "2026-08-22T12:01:00.000Z");
    database.updateAssistantSuggestion("main", accepted);
    expect(database.listAssistantSuggestions("main", "accepted")).toEqual([accepted]);
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

  it("出版项目独立于活母本保存", () => {
    const database = store().store;
    database.initializeWorkspace("main", createWorkspace("full"));
    const project = { id: "project-main", title: "自选集", entries: [] };
    database.savePublicationProject("main", project.id, project, "2026-08-17T12:00:00.000Z");
    expect(database.loadPublicationProject("main", project.id)).toEqual(project);
    expect(database.listPublicationProjects("main")).toEqual([project]);
    expect(database.loadWorkspace("main")?.records).toEqual([]);
    database.close();
  });
});
