import { describe, expect, it } from "vitest";
import {
  auditRecord,
  compareDuplicatePair,
  createNewRecord,
  createWorkspace,
  digest,
  findDuplicates,
  importLegacyWorkspace,
  markForDeletion,
  matchesStarterWorkspace,
  mergeWorkspace,
  parseBatchSource
} from "./index";

const forms = { qijue: "七绝", xinshi: "新诗", sanwen: "散文" };

describe("XZM-EW 摄取与治理", () => {
  it("兼容导入没有内部 UUID 和修订号的 0.1 审校包", () => {
    const record = createNewRecord({ title: "春日", form: "qijue", body: "一二三四五六七，\n七六五四三二一。", sequence: 1 });
    const legacy = structuredClone(createWorkspace("full", [record]));
    delete (legacy as Partial<typeof legacy>).revision;
    delete (legacy.records[0] as Partial<typeof record>).entityId;
    const imported = importLegacyWorkspace(legacy);
    expect(imported.revision).toBe(0);
    expect(imported.records[0]?.entityId[14]).toBe("7");
  });

  it("解析多体裁批量文本并拒绝空正文", () => {
    expect(parseBatchSource("《第一篇》\n体裁：七绝\n第一句\n---\n# 第二篇\n第二篇正文", "xinshi", forms)).toEqual([
      { title: "第一篇", form: "qijue", body: "第一句" },
      { title: "第二篇", form: "xinshi", body: "第二篇正文" }
    ]);
    expect(() => parseBatchSource("《无正文》", "xinshi", forms)).toThrow("缺少正文");
  });

  it("查重、双栏逐行比较和删除语义保持可撤销", () => {
    const left = createNewRecord({ title: "春日", form: "xinshi", body: "同句\n左篇独有的长长正文内容用于查重", sequence: 1 });
    const right = createNewRecord({ title: "春日", form: "xinshi", body: "同句\n右篇独有的长长正文内容用于查重", sequence: 2 });
    expect(findDuplicates([left, right])[0]?.reasons).toContain("题名相同");
    expect(compareDuplicatePair(left, right).map((row) => row.status)).toEqual(["same", "left-only", "right-only"]);
    expect(markForDeletion(left)).toBeNull();
    const existing = { ...left, operation: undefined, sourceHash: digest(left.baseline) };
    expect(markForDeletion(existing)?.operation).toBe("delete");
  });

  it("同范围同基线才能安全合并", () => {
    const record = createNewRecord({ title: "春日", form: "qijue", body: "旧稿", sequence: 1 });
    const current = createWorkspace("full", [record]);
    const incoming = structuredClone(current);
    incoming.records[0]!.draft.work.lines = ["新稿"];
    const result = mergeWorkspace(current, incoming);
    expect(result.updated).toBe(1);
    expect(result.workspace.records[0]?.draft.work.lines).toEqual(["新稿"]);
    expect(result.workspace.records[0]?.entityId).toBe(current.records[0]?.entityId);
    delete (incoming.records[0] as Partial<typeof record>).entityId;
    expect(mergeWorkspace(current, incoming).workspace.records[0]?.entityId).toBe(current.records[0]?.entityId);
    expect(() => mergeWorkspace(createWorkspace("pilot", [record]), incoming)).toThrow("范围");
  });

  it("全量备份可替换未保存的初始演示区，但不能覆盖已保存的新作", () => {
    const demo = createWorkspace("full", [createNewRecord({ title: "演示文稿", form: "xinshi", body: "演示正文", sequence: 1 })]);
    const restoredRecord = createNewRecord({ title: "既有作品", form: "qijue", body: "旧作正文", sequence: 8 });
    restoredRecord.operation = "update";
    restoredRecord.sourceHash = digest(restoredRecord.baseline);
    const backup = createWorkspace("full", [restoredRecord]);

    const restored = mergeWorkspace(demo, backup, { replaceStarterWorkspace: true });
    expect(restored.replacedEmpty).toBe(true);
    expect(restored.workspace.records.map((record) => record.id)).toEqual([restoredRecord.id]);

    const autosavedDemo = { ...structuredClone(demo), revision: 3, savedAt: "2026-08-12T00:00:00.000Z" };
    expect(matchesStarterWorkspace(autosavedDemo, demo)).toBe(true);
    expect(mergeWorkspace(autosavedDemo, backup, { replaceStarterWorkspace: matchesStarterWorkspace(autosavedDemo, demo) }).workspace.records[0]?.id).toBe(restoredRecord.id);

    const editedDemo = structuredClone(autosavedDemo);
    editedDemo.records[0]!.draft.work.lines = ["用户已经修改的正文"];
    expect(matchesStarterWorkspace(editedDemo, demo)).toBe(false);
    expect(() => mergeWorkspace(editedDemo, backup, { replaceStarterWorkspace: matchesStarterWorkspace(editedDemo, demo) })).toThrow("不是新增记录");
  });

  it("新增和作者确认均受审计门禁", () => {
    const record = createNewRecord({ title: "待审新作", form: "xinshi", body: "正文", sequence: 3 });
    expect(auditRecord(record).issues.some((issue) => issue.message.includes("尚未完成审校"))).toBe(true);
    record.editorState.status = "reviewed";
    record.draft.chronologyResearch.certainty = "authorConfirmed";
    expect(auditRecord(record).issues.some((issue) => issue.message.includes("作者记忆证据"))).toBe(true);
  });
});
