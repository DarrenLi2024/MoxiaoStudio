import { describe, expect, it } from "vitest";
import { createNewRecord, createWorkspace } from "@moxiao/editorial";
import { createDefaultPublicationProject, publicationDocument, selectedPublicationRecords } from "./publication-workflow";

describe("出版项目编选", () => {
  it("按纪年排序与体裁筛选不改写母本编次", () => {
    const later = createNewRecord({ title: "后作", form: "ci", body: "后作正文", sequence: 1 });
    later.draft.chronologyResearch.startYear = 2023;
    const earlier = createNewRecord({ title: "前作", form: "qijue", body: "前作正文", sequence: 2 });
    earlier.draft.chronologyResearch.startYear = 2008;
    const workspace = createWorkspace("full", [later, earlier]);
    const project = { ...createDefaultPublicationProject(workspace), sortMode: "chronology-asc" as const };
    expect(selectedPublicationRecords(workspace, project).map(({ record }) => record.id)).toEqual([earlier.id, later.id]);
    expect(workspace.records.map((record) => record.draft.work.seq)).toEqual([1, 2]);
    const filtered = { ...project, genreFilter: "ci" };
    expect(publicationDocument(workspace, filtered).sections.map((section) => section.title)).toEqual(["后作"]);
  });

  it("作者编定顺序只由出版条目的 manualOrder 决定", () => {
    const first = createNewRecord({ title: "甲", form: "xinshi", body: "甲", sequence: 1 });
    const second = createNewRecord({ title: "乙", form: "xinshi", body: "乙", sequence: 2 });
    const workspace = createWorkspace("full", [first, second]);
    const base = createDefaultPublicationProject(workspace);
    const project = { ...base, entries: base.entries.map((entry) => ({ ...entry, manualOrder: entry.recordId === first.id ? 2 : 1 })) };
    expect(selectedPublicationRecords(workspace, project).map(({ record }) => record.id)).toEqual([second.id, first.id]);
  });

  it("旧版字符串校勘记不会阻断出版文档生成", () => {
    const record = createNewRecord({ title: "旧笺读", form: "sanwen", body: "正文", sequence: 1 });
    record.draft.reading = { textualNotes: ["旧版校勘文字"] as unknown as Array<{ note: string }> };
    const workspace = createWorkspace("full", [record]);
    const document = publicationDocument(workspace, createDefaultPublicationProject(workspace));
    expect(document.sections[0]?.blocks).toContainEqual({ type: "paragraph", text: "旧版校勘文字" });
  });
});
