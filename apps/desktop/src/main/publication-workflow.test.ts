import { describe, expect, it } from "vitest";
import { createNewRecord, createWorkspace } from "@moxiao/editorial";
import { createEntityId } from "@moxiao/domain";
import { applyProposedArrangement, createDefaultPublicationProject, generateFrontMatter, proposeArrangement, publicationDocument, publicationStatistics, selectedPublicationRecords, undoProposedArrangement } from "./publication-workflow";

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
    expect(publicationDocument(workspace, filtered).sections.filter((section) => section.semanticRole === "chapter").map((section) => section.title)).toEqual(["后作"]);
  });

  it("作者编定顺序只由出版条目的 manualOrder 决定", () => {
    const first = createNewRecord({ title: "甲", form: "xinshi", body: "甲", sequence: 1 });
    const second = createNewRecord({ title: "乙", form: "xinshi", body: "乙", sequence: 2 });
    const workspace = createWorkspace("full", [first, second]);
    const base = createDefaultPublicationProject(workspace);
    const project = { ...base, entries: base.entries.map((entry) => ({ ...entry, manualOrder: entry.recordId === first.id ? 2 : 1 })) };
    expect(selectedPublicationRecords(workspace, project).map(({ record }) => record.id)).toEqual([second.id, first.id]);
  });

  it("旧版字符串校勘记保留在母本但默认不进入逐篇成品", () => {
    const record = createNewRecord({ title: "旧笺读", form: "sanwen", body: "正文", sequence: 1 });
    record.draft.reading = { textualNotes: ["旧版校勘文字"] as unknown as Array<{ note: string }>, editionNote: "初稿曾作异文" };
    const workspace = createWorkspace("full", [record]);
    const project = createDefaultPublicationProject(workspace);
    const document = publicationDocument(workspace, project);
    expect(JSON.stringify(document.sections.find((section) => section.semanticRole === "chapter"))).not.toContain("旧版校勘文字");
    const scholarly = publicationDocument(workspace, { ...project, apparatusPolicy: "backmatter" });
    expect(scholarly.sections.at(-1)).toMatchObject({ role: "backmatter", semanticRole: "apparatus", title: "版本与校勘说明" });
    expect(JSON.stringify(scholarly.sections.at(-1))).toContain("旧版校勘文字");
  });

  it("生成版权、前言、作者简介、目录与确定口径统计", () => {
    const poem = createNewRecord({ title: "春山", form: "qijue", body: "春山入画", sequence: 1 });
    poem.draft.chronologyResearch.startYear = 2008;
    poem.draft.reading = { translation: "春日山景进入画卷", annotations: [{ anchor: "春山", note: "春日之山" }], appreciation: "以景入情。" };
    const workspace = createWorkspace("full", [poem]);
    const base = createDefaultPublicationProject(workspace);
    const project = generateFrontMatter(workspace, { ...base, creator: "闲心子" });
    const stats = publicationStatistics(workspace, project);
    const document = publicationDocument(workspace, project);
    expect(stats).toMatchObject({ workCount: 1, bodyCharacters: 4, chronologyRange: [2008, 2008] });
    expect(document.sections.map((section) => section.semanticRole)).toEqual(["title-page", "copyright", "foreword", "author-bio", "toc", "chapter"]);
    expect(project.frontMatter.preface.body).toContain("收录作品1篇");
    expect(project.frontMatter.author.biography.body).toContain("闲心子");
  });

  it("单篇多插图位置不污染作品母本", () => {
    const record = createNewRecord({ title: "有图篇", form: "sanwen", body: "山水正文", sequence: 1 });
    const workspace = createWorkspace("full", [record]);
    const base = createDefaultPublicationProject(workspace);
    const first = createEntityId();
    const second = createEntityId();
    const project = {
      ...base,
      assets: [
        { id: first, kind: "illustration" as const, fileName: "a.png", mediaType: "image/png", alt: "山图", rights: "owned" as const },
        { id: second, kind: "illustration" as const, fileName: "b.png", mediaType: "image/png", alt: "水图", rights: "owned" as const }
      ],
      placements: [
        { assetId: first, recordId: record.id, role: "chapter-opening" as const, alignment: "center" as const, size: "wide" as const, focalPoint: [0.5, 0.4] as const },
        { assetId: second, recordId: record.id, role: "endpiece" as const, alignment: "right" as const, size: "small" as const, focalPoint: [0.5, 0.5] as const }
      ]
    };
    const chapter = publicationDocument(workspace, project).sections.find((section) => section.semanticRole === "chapter")!;
    expect(chapter.blocks.filter((block) => block.type === "image")).toHaveLength(2);
    expect(record.draft.work.prose).toBe("山水正文");
  });

  it("随文插图按锚点进入正文，失配锚点确定性降级到正文后", () => {
    const record = createNewRecord({ title: "锚点篇", form: "sanwen", body: "山行至此。忽见清泉。归来记之。", sequence: 1 });
    const workspace = createWorkspace("full", [record]);
    const base = createDefaultPublicationProject(workspace);
    const matched = createEntityId();
    const missed = createEntityId();
    const project = {
      ...base,
      assets: [
        { id: matched, kind: "illustration" as const, fileName: "spring.png", mediaType: "image/png", alt: "清泉", rights: "owned" as const },
        { id: missed, kind: "illustration" as const, fileName: "return.png", mediaType: "image/png", alt: "归途", rights: "owned" as const }
      ],
      placements: [
        { assetId: matched, recordId: record.id, role: "inline" as const, anchorText: "忽见清泉", alignment: "center" as const, size: "medium" as const, focalPoint: [0.5, 0.5] as const },
        { assetId: missed, recordId: record.id, role: "inline" as const, anchorText: "不存在的句子", alignment: "center" as const, size: "small" as const, focalPoint: [0.5, 0.5] as const }
      ]
    };
    const blocks = publicationDocument(workspace, project).sections.find((section) => section.semanticRole === "chapter")!.blocks;
    expect(blocks.map((block) => block.type === "image" ? block.assetId : block.type === "paragraph" ? block.text : block.type)).toEqual(["山行至此。忽见清泉。", matched, "归来记之。", missed]);
  });

  it("智能编排给出理由、保持锁定位置并可撤销", () => {
    const first = createNewRecord({ title: "夜雨", form: "ci", body: "孤灯夜雨", sequence: 1 });
    const second = createNewRecord({ title: "春山", form: "qijue", body: "春山清风", sequence: 2 });
    const third = createNewRecord({ title: "江天", form: "sanwen", body: "万里江天", sequence: 3 });
    const workspace = createWorkspace("full", [first, second, third]);
    const base = createDefaultPublicationProject(workspace);
    const locked = { ...base, entries: base.entries.map((entry) => ({ ...entry, locked: entry.recordId === first.id })) };
    const proposed = proposeArrangement(workspace, locked, "mood", "2026-08-18T00:00:00.000Z");
    expect(proposed.arrangement.proposal?.items[0]?.recordId).toBe(first.id);
    expect(proposed.arrangement.proposal?.items.every((item) => item.reason.length > 0)).toBe(true);
    const applied = applyProposedArrangement(proposed);
    expect(applied.arrangement.previousManualOrder).toBeDefined();
    expect(undoProposedArrangement(applied).entries.map((entry) => entry.manualOrder)).toEqual(base.entries.map((entry) => entry.manualOrder));
  });
});
