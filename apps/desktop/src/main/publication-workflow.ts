import { createEntityId, type EntityId } from "@moxiao/domain";
import { digest, stableStringify, type EditorialRecord, type EditorialWorkspace } from "@moxiao/editorial";
import {
  applyArrangementProposal,
  createArrangementProposal,
  createDefaultFrontMatter,
  createDefaultLayoutSpecification,
  createDefaultPublicationProfile,
  createStyleSheetFromTheme,
  compareLiteraryForms,
  defaultTheme,
  literaryFormLabel,
  restoreArrangement,
  type ArrangementProposal,
  type PublicationAssetDeclaration,
  type PublicationDocument,
  type PublicationEntry,
  type PublicationPlacement,
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
    includeAppreciation: true,
    locked: false,
    moodTags: [],
    editorialRole: "normal"
  };
}

function countText(value: string): number {
  const han = value.match(/\p{Script=Han}/gu)?.length ?? 0;
  const words = value.match(/[A-Za-z0-9]+(?:[-'][A-Za-z0-9]+)*/gu)?.length ?? 0;
  return han + words;
}

export function publicationStatistics(workspace: EditorialWorkspace, project: PublicationProject): NonNullable<PublicationDocument["statistics"]> {
  const selected = selectedPublicationRecords(workspace, project);
  const genreCounts: Record<string, number> = {};
  let bodyCharacters = 0;
  let translationCharacters = 0;
  let annotationCharacters = 0;
  let appreciationCharacters = 0;
  const years: number[] = [];
  for (const { record, entry: selection } of selected) {
    const work = record.draft.work;
    const reading = record.draft.reading;
    genreCounts[work.form] = (genreCounts[work.form] ?? 0) + 1;
    bodyCharacters += countText(work.prose?.trim() || work.lines.join("\n"));
    if (selection.includeTranslation) translationCharacters += countText(reading?.translation ?? "");
    if (selection.includeAnnotations) annotationCharacters += (reading?.annotations ?? []).reduce((total, annotation) => total + countText(annotation.note), 0);
    if (selection.includeAppreciation) appreciationCharacters += countText(reading?.appreciation ?? "");
    const year = chronology(record);
    if (year !== null) years.push(year);
  }
  return {
    workCount: selected.length,
    bodyCharacters,
    translationCharacters,
    annotationCharacters,
    appreciationCharacters,
    totalCharacters: bodyCharacters + translationCharacters + annotationCharacters + appreciationCharacters,
    genreCounts,
    ...(years.length ? { chronologyRange: [Math.min(...years), Math.max(...years)] as const } : {})
  };
}

export function generateFrontMatter(workspace: EditorialWorkspace, project: PublicationProject): PublicationProject {
  const statistics = publicationStatistics(workspace, project);
  const genres = Object.entries(statistics.genreCounts).sort((left, right) => right[1] - left[1]).map(([form, count]) => `${literaryFormLabel(form)}${count}篇`).join("、");
  const chronologyLabel = statistics.chronologyRange ? `创作时间自${statistics.chronologyRange[0]}年至${statistics.chronologyRange[1]}年` : "部分篇目尚待系年";
  const creator = project.creator.trim() || project.frontMatter.author.displayName.trim() || "作者";
  const preface = `本书收录作品${statistics.workCount}篇，正文约${statistics.bodyCharacters.toLocaleString("zh-CN")}字，体裁包括${genres || "多种文学样式"}。${chronologyLabel}。\n\n编选以作品本身的声息与作者确认的创作意图为中心，在体裁、系年与意境之间建立可阅读的次序。正文之外，酌收创作题注、今译、笺注与赏析，使写作现场、文本含义和后来的理解彼此照见。\n\n这是一本仍保留时间纹理的文集。愿读者循篇章而入，在山川、故园、行旅与人事之间，读见文字如何保存一段生命经验。`;
  const biography = `${creator}，本书作者。现收录其${statistics.workCount}篇作品，涵盖${genres || "诗歌、散文等体裁"}；${chronologyLabel}。其创作注重个人经验与传统文脉之间的回应，题材涉及自然观照、人生感怀与历史兴寄。本简介为依据本书文稿形成的创作概况，生平事实以作者最终确认为准。`;
  return {
    ...project,
    frontMatter: {
      ...project.frontMatter,
      copyright: { ...project.frontMatter.copyright, rightsHolder: project.frontMatter.copyright.rightsHolder || creator },
      preface: { ...project.frontMatter.preface, body: preface, status: "draft" },
      author: { ...project.frontMatter.author, displayName: project.frontMatter.author.displayName || creator, biography: { ...project.frontMatter.author.biography, body: biography, status: "draft" } }
    }
  };
}

export function createDefaultPublicationProject(workspace: EditorialWorkspace, now = new Date().toISOString(), id: EntityId = LOCAL_PUBLICATION_PROJECT_ID): PublicationProject {
  const profile = createDefaultPublicationProfile(createEntityId(), "雅正文稿");
  const project: PublicationProject = {
    format: "MOXIAO-PUBLICATION",
    version: "1.3",
    id,
    title: "本地文学项目",
    subtitle: "",
    creator: "",
    language: "zh-CN",
    description: "",
    sortMode: "author-intent",
    genreFilters: [],
    chronologyFilter: "all",
    entries: workspace.records.filter((record) => record.operation !== "delete").map(entry),
    assets: [],
    placements: [],
    frontMatter: createDefaultFrontMatter("", now.slice(0, 4)),
    apparatusPolicy: "omit",
    arrangement: { genreWeight: 1, chronologyWeight: 1, moodWeight: 1 },
    theme: defaultTheme,
    styleSheet: createStyleSheetFromTheme(defaultTheme),
    layoutSpecification: createDefaultLayoutSpecification(profile.pageSize, profile.customPageSizeMm),
    profile: { ...profile, ...defaultTheme, id: profile.id },
    target: "pdf",
    ebookProfile: "universal",
    updatedAt: now
  };
  return generateFrontMatter(workspace, project);
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
    if (project.genreFilters.length && !project.genreFilters.includes(record.draft.work.form)) return false;
    const dated = chronology(record) !== null;
    return project.chronologyFilter === "all" || (project.chronologyFilter === "dated" ? dated : !dated);
  }).map((record) => ({ record, entry: entries.get(record.id)! }));
  return selected.sort((left, right) => {
    if (project.sortMode === "author-intent") return left.entry.manualOrder - right.entry.manualOrder;
    if (project.sortMode === "genre") return compareLiteraryForms(left.record.draft.work.form, right.record.draft.work.form) || left.entry.manualOrder - right.entry.manualOrder;
    if (project.sortMode === "mood" || project.sortMode === "hybrid") return (left.entry.moodTags[0] ?? "末").localeCompare(right.entry.moodTags[0] ?? "末", "zh-CN") || left.entry.manualOrder - right.entry.manualOrder;
    const a = chronology(left.record);
    const b = chronology(right.record);
    if (a === null && b === null) return left.entry.manualOrder - right.entry.manualOrder;
    if (a === null) return 1;
    if (b === null) return -1;
    return project.sortMode === "chronology-desc" ? b - a : a - b;
  });
}

export function proposeArrangement(workspace: EditorialWorkspace, project: PublicationProject, strategy: ArrangementProposal["strategy"], now = new Date().toISOString()): PublicationProject {
  const selections = new Map(project.entries.map((item) => [item.recordId, item]));
  const sources = workspace.records.filter((record) => record.operation !== "delete" && selections.has(record.id)).map((record) => {
    const selection = selections.get(record.id)!;
    return {
      recordId: record.id,
      title: record.draft.work.editorialTitle?.trim() || record.draft.work.title.trim() || "未题名",
      form: record.draft.work.form,
      year: chronology(record),
      text: `${record.draft.work.prose ?? record.draft.work.lines.join("\n")}\n${record.draft.work.compositionNote ?? ""}\n${record.draft.reading?.appreciation ?? ""}`,
      manualOrder: selection.manualOrder,
      locked: selection.locked,
      moodTags: selection.moodTags,
      editorialRole: selection.editorialRole
    };
  });
  return { ...project, arrangement: { ...project.arrangement, proposal: createArrangementProposal(project, sources, strategy, now) } };
}

export function applyProposedArrangement(project: PublicationProject): PublicationProject {
  return project.arrangement.proposal ? applyArrangementProposal(project, project.arrangement.proposal) : project;
}

export function undoProposedArrangement(project: PublicationProject): PublicationProject {
  return restoreArrangement(project);
}

export function publicationAssets(project: PublicationProject): PublicationAssetDeclaration[] {
  return project.assets.map((asset) => ({
    id: asset.id,
    mediaType: asset.mediaType,
    rights: asset.rights,
    kind: asset.kind,
    fileName: `${asset.id}-${asset.fileName.replace(/[^\p{Letter}\p{Number}._-]+/gu, "-")}`,
    ...(asset.rightsNote ? { source: asset.rightsNote } : {}),
    ...(asset.dataUri ? { dataUri: asset.dataUri } : {}),
    ...(asset.fontFamily ? { fontFamily: asset.fontFamily } : {})
  }));
}

export function publicationDocument(workspace: EditorialWorkspace, project: PublicationProject): PublicationDocument {
  const selected = selectedPublicationRecords(workspace, project);
  const cover = project.assets.find((asset) => asset.kind === "cover");
  const statistics = publicationStatistics(workspace, project);
  const sections: PublicationDocument["sections"][number][] = [];
  if (cover) sections.push({ id: createEntityId(), role: "frontmatter", semanticRole: "cover", blocks: [{ type: "image", assetId: cover.id, alt: cover.alt, placement: "cover", size: "full-page", ...(cover.caption ? { caption: cover.caption } : {}) }] });
  if (project.frontMatter.includeTitlePage) sections.push({
    id: createEntityId(), role: "frontmatter", semanticRole: "title-page", title: project.title,
    blocks: [...(project.subtitle.trim() ? [{ type: "heading" as const, level: 2 as const, text: project.subtitle.trim() }] : []), { type: "paragraph", text: project.creator.trim() || project.frontMatter.author.displayName.trim() || "未署名" }]
  });
  if (project.frontMatter.includeCopyright) {
    const copyright = project.frontMatter.copyright;
    const lines = [
      `© ${copyright.copyrightYear || new Date().getFullYear()} ${copyright.rightsHolder || project.creator || "版权所有者待确认"}`,
      copyright.edition,
      copyright.statement,
      copyright.publisher ? `出版：${copyright.publisher}` : copyright.publicationType === "private" ? "内部审校稿 · 非公开发行" : "作者自版",
      copyright.isbn ? `ISBN：${copyright.isbn}` : "",
      copyright.contact ? `联系：${copyright.contact}` : "",
      `全书收录${statistics.workCount}篇，正文约${statistics.bodyCharacters.toLocaleString("zh-CN")}字。`
    ].filter(Boolean);
    sections.push({ id: createEntityId(), role: "frontmatter", semanticRole: "copyright", title: "版权信息", blocks: lines.map((text) => ({ type: "paragraph", text, semanticRole: "copyright" })) });
  }
  if (project.frontMatter.includePreface && project.frontMatter.preface.body.trim()) sections.push({ id: createEntityId(), role: "frontmatter", semanticRole: "foreword", title: project.frontMatter.preface.title || "前言", blocks: [{ type: "paragraph", text: project.frontMatter.preface.body.trim(), semanticRole: "foreword" }] });
  if (project.frontMatter.includeAuthorBio && project.frontMatter.author.biography.body.trim()) {
    const portrait = project.assets.find((asset) => asset.id === project.frontMatter.author.portraitAssetId);
    sections.push({ id: createEntityId(), role: "frontmatter", semanticRole: "author-bio", title: project.frontMatter.author.biography.title || "作者简介", blocks: [...(portrait ? [{ type: "image" as const, assetId: portrait.id, alt: portrait.alt, placement: "inline" as const, alignment: "center" as const, size: "small" as const, focalPoint: [0.5, 0.5] as const, ...(portrait.caption ? { caption: portrait.caption } : {}) }] : []), { type: "paragraph", text: project.frontMatter.author.biography.body.trim(), semanticRole: "author-bio" }] });
  }
  if (project.frontMatter.includeToc) sections.push({ id: createEntityId(), role: "frontmatter", semanticRole: "toc", title: "目录", blocks: [{ type: "toc", entries: selected.map(({ record, entry: item }) => ({ title: record.draft.work.editorialTitle?.trim() || record.draft.work.title.trim() || "未题名", targetId: record.entityId, ...(item.partTitle ? { group: item.partTitle } : {}) })) }] });
  const apparatus: Array<{ title: string; notes: string[] }> = [];
  for (const { record, entry: selection } of selected) {
    const work = record.draft.work;
    const reading = record.draft.reading;
    const blocks: PublicationDocument["sections"][number]["blocks"][number][] = [];
    const placements = project.placements.filter((placement) => placement.recordId === record.id);
    const appendImage = (placement: PublicationPlacement): void => {
      const asset = project.assets.find((item) => item.id === placement.assetId);
      if (asset) blocks.push({ type: "image", assetId: asset.id, alt: asset.alt, placement: placement.role, alignment: placement.alignment, size: placement.size, focalPoint: placement.focalPoint, ...(asset.caption ? { caption: asset.caption } : {}) });
    };
    placements.filter((item) => item.role === "chapter-opening" || item.role === "plate").forEach(appendImage);
    const inlinePlacements = placements.filter((item) => item.role === "inline");
    const unplacedInline = new Set(inlinePlacements);
    if (work.prose?.trim()) {
      const prose = work.prose.trim();
      const anchored = inlinePlacements.map((placement) => ({ placement, index: placement.anchorText?.trim() ? prose.indexOf(placement.anchorText.trim()) : -1 })).filter((item) => item.index >= 0).sort((left, right) => left.index - right.index);
      let cursor = 0;
      for (const item of anchored) {
        let anchorEnd = item.index + (item.placement.anchorText?.trim().length ?? 0);
        while (anchorEnd < prose.length && /[，。！？；：、,.!?;:]/u.test(prose[anchorEnd]!)) anchorEnd += 1;
        const text = prose.slice(cursor, anchorEnd).trim();
        if (text) blocks.push({ type: "paragraph", text });
        appendImage(item.placement);
        unplacedInline.delete(item.placement);
        cursor = anchorEnd;
      }
      const remainder = prose.slice(cursor).trim();
      if (remainder) blocks.push({ type: "paragraph", text: remainder });
    } else {
      let pendingLines: string[] = [];
      const flushLines = (): void => { if (pendingLines.length) blocks.push({ type: "verse", lines: pendingLines }); pendingLines = []; };
      for (const line of work.lines) {
        pendingLines.push(line);
        const matches = inlinePlacements.filter((placement) => placement.anchorText?.trim() && line.includes(placement.anchorText.trim()));
        if (matches.length) {
          flushLines();
          for (const placement of matches) { appendImage(placement); unplacedInline.delete(placement); }
        }
      }
      flushLines();
    }
    for (const placement of unplacedInline) appendImage(placement);
    if (selection.includeCompositionNote && work.compositionNote?.trim()) blocks.push({ type: "annotation", marker: "创作题注", text: work.compositionNote.trim(), semanticRole: "composition-note" });
    if (selection.includeTranslation && reading?.translation?.trim()) blocks.push({ type: "heading", level: 2, text: "今译", semanticRole: "translation" }, { type: "paragraph", text: reading.translation.trim(), semanticRole: "translation" });
    if (selection.includeAnnotations) for (const annotation of reading?.annotations ?? []) blocks.push({ type: "annotation", marker: annotation.anchor, text: annotation.note, semanticRole: "annotation" });
    if (selection.includeAppreciation && reading?.appreciation?.trim()) blocks.push({ type: "heading", level: 2, text: "赏析", semanticRole: "appreciation" }, { type: "paragraph", text: reading.appreciation.trim(), semanticRole: "appreciation" });
    placements.filter((item) => item.role === "endpiece").forEach(appendImage);
    const apparatusNotes: string[] = [];
    for (const value of (reading?.textualNotes ?? []) as unknown[]) {
      const note = typeof value === "string" ? { note: value } : value && typeof value === "object" ? value as Record<string, unknown> : { note: "" };
      const text = typeof note.note === "string" ? note.note.trim() : "";
      const title = typeof note.title === "string" ? note.title.trim() : "";
      if (text) apparatusNotes.push(`${title || "校勘记"}：${text}`);
    }
    if (reading?.editionNote?.trim()) apparatusNotes.push(`版本说明：${reading.editionNote.trim()}`);
    if (project.apparatusPolicy === "internal-proof" && reading?.reviewNote?.trim()) apparatusNotes.push(`审校说明：${reading.reviewNote.trim()}`);
    if (apparatusNotes.length) apparatus.push({ title: work.editorialTitle?.trim() || work.title.trim() || "未题名", notes: apparatusNotes });
    sections.push({ id: record.entityId, role: "body", semanticRole: "chapter", title: work.editorialTitle?.trim() || work.title.trim() || "未题名", blocks });
  }
  if (project.apparatusPolicy !== "omit" && apparatus.length) sections.push({
    id: createEntityId(), role: "backmatter", semanticRole: "apparatus", title: "版本与校勘说明",
    blocks: apparatus.flatMap((item) => [{ type: "heading" as const, level: 2 as const, text: item.title, semanticRole: "apparatus" as const }, ...item.notes.map((text) => ({ type: "paragraph" as const, text, semanticRole: "apparatus" as const }))])
  });
  return {
    id: createEntityId(),
    expressionId: createEntityId(),
    expressionHash: `sha256:${digest({ workspaceRevision: workspace.revision, project, selected: selected.map(({ record }) => record.draft) })}`,
    title: project.title,
    language: project.language,
    creator: project.creator,
    description: project.description,
    statistics,
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
