import { createEntityId, type EntityId } from "@moxiao/domain";
import { digest, stableStringify, type EditorialRecord, type EditorialWorkspace } from "@moxiao/editorial";
import {
  createDefaultPublicationProfile,
  defaultTheme,
  type PublicationAssetDeclaration,
  type PublicationDocument,
  type PublicationEntry,
  type PublicationProject
} from "@moxiao/publication";

export const LOCAL_PUBLICATION_PROJECT_ID = "0198f4c0-0000-7000-8000-000000000001" as EntityId;

function entry(record: EditorialRecord, manualOrder: number): PublicationEntry {
  return {
    recordId: record.id,
    entityId: record.entityId,
    included: true,
    manualOrder,
    includeCompositionNote: true,
    includeTranslation: true,
    includeAnnotations: true,
    includeAppreciation: true
  };
}

export function createDefaultPublicationProject(workspace: EditorialWorkspace, now = new Date().toISOString(), id: EntityId = LOCAL_PUBLICATION_PROJECT_ID): PublicationProject {
  const profile = createDefaultPublicationProfile(createEntityId(), "雅正文稿");
  return {
    format: "MOXIAO-PUBLICATION",
    version: "1.0",
    id,
    title: "本地文学项目",
    subtitle: "",
    creator: "",
    language: "zh-CN",
    description: "",
    sortMode: "author-intent",
    genreFilter: "all",
    chronologyFilter: "all",
    entries: workspace.records.filter((record) => record.operation !== "delete").map(entry),
    assets: [],
    theme: defaultTheme,
    profile: { ...profile, ...defaultTheme, id: profile.id },
    target: "pdf",
    updatedAt: now
  };
}

export function synchronizePublicationProject(project: PublicationProject, workspace: EditorialWorkspace): PublicationProject {
  const active = workspace.records.filter((record) => record.operation !== "delete");
  const activeIds = new Set(active.map((record) => record.id));
  const existing = new Map(project.entries.map((item) => [item.recordId, item]));
  const maxOrder = Math.max(-1, ...project.entries.map((item) => item.manualOrder));
  let added = 0;
  const entries = [
    ...project.entries.filter((item) => activeIds.has(item.recordId)),
    ...active.filter((record) => !existing.has(record.id)).map((record) => entry(record, maxOrder + (++added)))
  ];
  return { ...project, entries };
}

function chronology(record: EditorialRecord): number | null {
  return record.draft.chronologyResearch.startYear ?? record.draft.chronologyResearch.endYear;
}

export function selectedPublicationRecords(workspace: EditorialWorkspace, project: PublicationProject): Array<{ record: EditorialRecord; entry: PublicationEntry }> {
  const entries = new Map(project.entries.map((item) => [item.recordId, item]));
  const selected = workspace.records.filter((record) => {
    const item = entries.get(record.id);
    if (record.operation === "delete" || !item?.included) return false;
    if (project.genreFilter !== "all" && record.draft.work.form !== project.genreFilter) return false;
    const dated = chronology(record) !== null;
    return project.chronologyFilter === "all" || (project.chronologyFilter === "dated" ? dated : !dated);
  }).map((record) => ({ record, entry: entries.get(record.id)! }));
  return selected.sort((left, right) => {
    if (project.sortMode === "author-intent") return left.entry.manualOrder - right.entry.manualOrder;
    if (project.sortMode === "genre") return left.record.draft.work.form.localeCompare(right.record.draft.work.form, "zh-CN") || left.entry.manualOrder - right.entry.manualOrder;
    const a = chronology(left.record);
    const b = chronology(right.record);
    if (a === null && b === null) return left.entry.manualOrder - right.entry.manualOrder;
    if (a === null) return 1;
    if (b === null) return -1;
    return project.sortMode === "chronology-desc" ? b - a : a - b;
  });
}

export function publicationAssets(project: PublicationProject): PublicationAssetDeclaration[] {
  return project.assets.map((asset) => ({
    id: asset.id,
    mediaType: asset.mediaType,
    rights: asset.rights,
    kind: asset.kind,
    fileName: asset.fileName,
    ...(asset.rightsNote ? { source: asset.rightsNote } : {}),
    ...(asset.dataUri ? { dataUri: asset.dataUri } : {}),
    ...(asset.fontFamily ? { fontFamily: asset.fontFamily } : {})
  }));
}

export function publicationDocument(workspace: EditorialWorkspace, project: PublicationProject): PublicationDocument {
  const selected = selectedPublicationRecords(workspace, project);
  const cover = project.assets.find((asset) => asset.kind === "cover");
  const sections: PublicationDocument["sections"][number][] = [];
  if (cover) sections.push({ id: createEntityId(), role: "frontmatter", title: project.title, blocks: [{ type: "image", assetId: cover.id, alt: cover.alt, ...(cover.caption ? { caption: cover.caption } : {}) }] });
  for (const { record, entry: selection } of selected) {
    const work = record.draft.work;
    const reading = record.draft.reading;
    const blocks: PublicationDocument["sections"][number]["blocks"][number][] = [];
    if (work.prose?.trim()) blocks.push({ type: "paragraph", text: work.prose.trim() });
    else blocks.push({ type: "verse", lines: work.lines });
    if (selection.includeCompositionNote && work.compositionNote?.trim()) blocks.push({ type: "annotation", marker: "创作题注", text: work.compositionNote.trim() });
    for (const asset of project.assets.filter((asset) => asset.kind === "illustration" && asset.attachedRecordId === record.id)) blocks.push({ type: "image", assetId: asset.id, alt: asset.alt, ...(asset.caption ? { caption: asset.caption } : {}) });
    if (selection.includeTranslation && reading?.translation?.trim()) blocks.push({ type: "heading", level: 2, text: "今译" }, { type: "paragraph", text: reading.translation.trim() });
    if (selection.includeAnnotations) for (const annotation of reading?.annotations ?? []) blocks.push({ type: "annotation", marker: annotation.anchor, text: annotation.note });
    if (selection.includeAppreciation && reading?.appreciation?.trim()) blocks.push({ type: "heading", level: 2, text: "赏析" }, { type: "paragraph", text: reading.appreciation.trim() });
    for (const note of reading?.textualNotes ?? []) if (note.note.trim()) blocks.push({ type: "heading", level: 3, text: note.title?.trim() || "校勘记" }, { type: "paragraph", text: note.note.trim() });
    if (reading?.editionNote?.trim()) blocks.push({ type: "heading", level: 3, text: "版本说明" }, { type: "paragraph", text: reading.editionNote.trim() });
    sections.push({ id: record.entityId, role: "body", title: work.editorialTitle?.trim() || work.title.trim() || "未题名", blocks });
  }
  return {
    id: createEntityId(),
    expressionId: createEntityId(),
    expressionHash: `sha256:${digest({ workspaceRevision: workspace.revision, project, selected: selected.map(({ record }) => record.draft) })}`,
    title: project.title,
    language: project.language,
    creator: project.creator,
    description: project.description,
    sections
  };
}

export function targetPackage(workspace: EditorialWorkspace, project: PublicationProject, document: PublicationDocument): string {
  const target = project.target;
  const payload = {
    format: target === "xianxinzimo" ? "XZM-XIANXIN-CONTENT" : "MOXIAO-DELIVERY",
    version: "1.0",
    target,
    createdAt: new Date().toISOString(),
    project: { id: project.id, title: project.title, creator: project.creator, sortMode: project.sortMode },
    source: { workspaceRevision: workspace.revision, expressionHash: document.expressionHash },
    capabilities: { text: true, readings: true, images: true, fonts: false, audio: false },
    document,
    assets: project.assets.map(({ dataUri: _dataUri, ...asset }) => asset)
  };
  return `${stableStringify(payload, 2)}\n`;
}
