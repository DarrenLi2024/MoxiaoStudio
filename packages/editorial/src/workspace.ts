import { createEntityId, isEntityId } from "@moxiao/domain";
import { digest, flattenDiff } from "./stable";
import type {
  AuditIssue,
  ChronologyResearch,
  CuratedReading,
  EditorialOperation,
  EditorialPayload,
  EditorialRecord,
  EditorialScope,
  EditorialWorkspace,
  LegacyWork,
  RecordAudit
} from "./types";

export function emptyChronology(): ChronologyResearch {
  return {
    display: "",
    startYear: null,
    endYear: null,
    precision: "unknown",
    certainty: "unreviewed",
    basis: [],
    alternatives: [],
    editorialNote: "待考。"
  };
}

function workTemplate(id: string, seq: number, title: string, form: string, body = ""): LegacyWork {
  const prose = form === "sanwen" ? body.trim() || null : null;
  const lines = form === "sanwen" ? [] : body.split("\n").map((line) => line.trimEnd()).filter((line) => line.trim());
  return {
    id,
    seq,
    title,
    editorialTitle: null,
    titleRole: "authorTitle",
    subtitle: null,
    cipai: null,
    form,
    themes: [],
    lines,
    bodyLineCount: null,
    prose,
    preface: null,
    editorialPreface: null,
    compositionNote: null,
    postscript: null,
    composedAt: null,
    era: "sangyu",
    place: null,
    dedicatee: null,
    allusions: [],
    pairedArt: null,
    siblingOf: [],
    excerpt: null,
    featured: false,
    tags: [],
    selfNote: null,
    entryType: "work",
    mergeInto: null
  };
}

export function slugifyTitle(title: string): string {
  return title.normalize("NFKC").replace(/[《》〈〉]/gu, "")
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-").replace(/^-+|-+$/gu, "").slice(0, 36) || "新作";
}

export function createNewRecord(input: {
  title: string;
  form: string;
  body?: string;
  sequence: number;
  now?: string;
}): EditorialRecord {
  const { title, form, body = "", sequence, now = new Date().toISOString() } = input;
  if (!Number.isInteger(sequence) || sequence < 1) throw new Error("新增作品缺少有效编次");
  const id = `w${String(sequence).padStart(3, "0")}-${slugifyTitle(title)}`;
  const baseline: EditorialPayload = {
    work: workTemplate(id, sequence, "", form),
    reading: null,
    readingSource: null,
    chronologyResearch: emptyChronology(),
    editorNotes: null
  };
  const draft = structuredClone(baseline);
  draft.work = workTemplate(id, sequence, title, form, body);
  return {
    id,
    entityId: createEntityId(),
    operation: "add",
    sourceHash: "NEW",
    baseline,
    draft,
    editorState: { status: "editing", updatedAt: now }
  };
}

export function createWorkspace(scope: EditorialScope, records: EditorialRecord[] = [], now = new Date().toISOString()): EditorialWorkspace {
  return { format: "XZM-EW", version: "0.1", scope, createdAt: now, savedAt: null, revision: 0, records };
}

export function importLegacyWorkspace(value: unknown): EditorialWorkspace {
  if (!value || typeof value !== "object") throw new Error("审校包不是对象");
  const source = structuredClone(value) as Partial<EditorialWorkspace> & { records?: Array<Partial<EditorialRecord>> };
  const records = (source.records ?? []).map((record) => ({ ...record, entityId: record.entityId && isEntityId(record.entityId) ? record.entityId : createEntityId() }));
  const workspace = {
    ...source,
    revision: Number.isInteger(source.revision) ? source.revision : 0,
    records
  } as EditorialWorkspace;
  return validateWorkspace(workspace);
}

export function validateWorkspace(workspace: EditorialWorkspace): EditorialWorkspace {
  if (workspace.format !== "XZM-EW" || workspace.version !== "0.1") throw new Error("审校包格式版本不受支持");
  if (!(["pilot", "full"] as const).includes(workspace.scope)) throw new Error("审校包范围无效");
  if (!Number.isInteger(workspace.revision) || workspace.revision < 0) throw new Error("工作区修订号无效");
  if (!Array.isArray(workspace.records) || workspace.records.length > 100_000) throw new Error("审校包作品数量无效");
  const ids = new Set<string>();
  const entityIds = new Set<string>();
  const sequences = new Set<number>();
  for (const record of workspace.records) {
    if (!record.id || ids.has(record.id)) throw new Error(`${record.id || "未知作品"}: 稳定 ID 为空或重复`);
    if (!isEntityId(record.entityId) || entityIds.has(record.entityId)) throw new Error(`${record.id}: 内部实体 ID 无效或重复`);
    ids.add(record.id);
    entityIds.add(record.entityId);
    const operation = record.operation ?? "update";
    if (!(["update", "add", "delete"] as const).includes(operation)) throw new Error(`${record.id}: 操作类型无效`);
    if (!record.baseline || !record.draft) throw new Error(`${record.id}: 缺少 baseline 或 draft`);
    if (record.baseline.work.id !== record.id || record.draft.work.id !== record.id) throw new Error(`${record.id}: 作品 ID 与记录不一致`);
    const sequence = record.draft.work.seq;
    if (!Number.isInteger(sequence) || sequence < 1 || sequences.has(sequence)) throw new Error(`${record.id}: 编次无效或重复`);
    sequences.add(sequence);
    if (operation === "add" && record.sourceHash !== "NEW") throw new Error(`${record.id}: 新增作品必须使用 NEW 基线标识`);
    if (operation !== "add" && digest(record.baseline) !== record.sourceHash) throw new Error(`${record.id}: 基线摘要不匹配`);
    if (!(["pending", "editing", "reviewed"] as const).includes(record.editorState.status)) throw new Error(`${record.id}: 审校状态无效`);
  }
  return workspace;
}

export function resolvedBody(work: LegacyWork): string {
  if (work.prose?.trim()) return work.prose.trim();
  let lines = [...(work.lines ?? [])];
  if (work.titleRole === "openingLine" && work.title.trim()) {
    const normalize = (value: string) => value.replace(/[\s，。！？；：、（）()《》〈〉—－-]/gu, "");
    if (!lines[0] || normalize(lines[0]) !== normalize(work.title)) lines.unshift(work.title);
  }
  if (Number.isInteger(work.bodyLineCount)) lines = lines.slice(0, work.bodyLineCount ?? undefined);
  return lines.join("\n");
}

export function auditPayload(payload: EditorialPayload, operation: EditorialOperation = "update"): AuditIssue[] {
  const issues: AuditIssue[] = [];
  const work = payload.work;
  if (!work.title.trim()) issues.push({ level: "error", message: "题名为空" });
  if (!work.form.trim()) issues.push({ level: "error", message: "体裁为空" });
  const body = resolvedBody(work);
  if (!body.trim()) issues.push({ level: operation === "add" ? "error" : "warning", message: operation === "add" ? "新增作品正文为空" : "正文为空" });
  if (Number.isInteger(work.bodyLineCount) && (work.bodyLineCount ?? 0) > work.lines.length) {
    issues.push({ level: "error", message: "正文边界超过当前诗行数量" });
  }
  const chronology = payload.chronologyResearch;
  if (chronology.startYear && chronology.endYear && chronology.startYear > chronology.endYear) issues.push({ level: "error", message: "系年起始年份晚于结束年份" });
  const authorConfirmed = chronology.certainty === "authorConfirmed"
    && chronology.basis.some((evidence) => evidence.type === "authorMemory" && evidence.note.trim());
  if (chronology.certainty === "authorConfirmed" && !authorConfirmed) issues.push({ level: "error", message: "作者确认缺少有效作者记忆证据" });
  if (["documented", "inferred", "disputed"].includes(chronology.certainty) && chronology.basis.length === 0) issues.push({ level: "warning", message: "系年结论缺少证据条目" });
  for (const [index, annotation] of (payload.reading?.annotations ?? []).entries()) {
    if (!annotation.anchor.trim()) issues.push({ level: "error", message: `第${index + 1}条笺注缺少锚点` });
    else if (!body.includes(annotation.anchor)) issues.push({ level: "error", message: `笺注锚点“${annotation.anchor}”不在正文中` });
    if (!annotation.note.trim()) issues.push({ level: "error", message: `第${index + 1}条笺注内容为空` });
  }
  for (const [index, note] of (payload.reading?.textualNotes ?? []).entries()) if (!note.note?.trim()) issues.push({ level: "error", message: `第${index + 1}条校勘记内容为空` });
  return issues;
}

export function auditRecord(record: EditorialRecord): RecordAudit {
  const operation = record.operation ?? "update";
  const paths = operation === "update" ? flattenDiff(record.baseline, record.draft) : ["record"];
  const issues = operation === "delete" ? [] : auditPayload(record.draft, operation);
  if ((operation === "add" || operation === "delete") && record.editorState.status !== "reviewed") {
    issues.unshift({ level: "error", message: operation === "add" ? "新增作品尚未完成审校" : "待删除作品尚未确认审校" });
  }
  return { id: record.id, operation, changed: paths.length > 0, paths, issues };
}

function cleanBatchTitle(value: string): string {
  const text = value.trim().replace(/^#{1,6}\s*/u, "");
  return text.match(/^《(.+)》$/u)?.[1]?.trim() || text;
}

export function parseBatchSource(source: string, defaultForm: string, formLabels: Readonly<Record<string, string>>): Array<{ title: string; form: string; body: string }> {
  const formByLabel = new Map(Object.entries(formLabels).flatMap(([key, label]) => [[key, key], [label, key]]));
  const blocks = source.split(/^\s*---+\s*$/gmu).map((block) => block.trim()).filter(Boolean);
  if (!blocks.length) throw new Error("没有识别到可补录的作品");
  return blocks.map((block, index) => {
    const lines = block.split("\n").map((line) => line.trimEnd());
    const title = cleanBatchTitle(lines.shift() ?? "");
    if (!title) throw new Error(`第 ${index + 1} 篇缺少题名`);
    let form = defaultForm;
    const formMatch = lines[0]?.match(/^\s*体裁\s*[:：]\s*(.+?)\s*$/u);
    if (formMatch?.[1]) {
      form = formByLabel.get(formMatch[1]) ?? "";
      if (!form) throw new Error(`《${title}》的体裁“${formMatch[1]}”无法识别`);
      lines.shift();
    }
    const body = lines.join("\n").trim();
    if (!body) throw new Error(`《${title}》缺少正文`);
    return { title, form, body };
  });
}

export function nextSequence(workspace: EditorialWorkspace): number {
  return Math.max(0, ...workspace.records.map((record) => record.draft.work.seq)) + 1;
}

export function markForDeletion(record: EditorialRecord, now = new Date().toISOString()): EditorialRecord | null {
  if ((record.operation ?? "update") === "add") return null;
  return { ...structuredClone(record), operation: "delete", editorState: { status: "reviewed", updatedAt: now } };
}

export function updateReading(record: EditorialRecord, reading: CuratedReading | null): EditorialRecord {
  const next = structuredClone(record);
  next.draft.reading = reading;
  next.editorState = { status: "editing", updatedAt: new Date().toISOString() };
  return next;
}
