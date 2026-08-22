import { createEntityId } from "@moxiao/domain";
import { digest, type EditorialRecord, type EditorialWorkspace } from "@moxiao/editorial";

export const assistantContractVersion = "moxiao-assistant/1.0" as const;

export type AssistantEngine = "local-rules" | "openai-compatible";
export type AssistantRunStatus = "completed" | "failed";
export type AssistantSuggestionStatus = "pending" | "accepted" | "rejected" | "conflict";
export type AssistantSuggestionKind = "metadata" | "chronology" | "reading-anchor" | "copyedit";
export type AssistantFieldPath =
  | "draft.work.form"
  | "draft.work.title"
  | "draft.work.editorialTitle"
  | "draft.work.compositionNote"
  | "draft.chronologyResearch.display"
  | "draft.chronologyResearch.startYear"
  | "draft.chronologyResearch.endYear"
  | "draft.chronologyResearch.precision"
  | "draft.reading.translation"
  | "draft.reading.appreciation";

export type AssistantScalar = string | number | null;

export interface AssistantPatch {
  readonly path: AssistantFieldPath;
  readonly before: AssistantScalar;
  readonly after: AssistantScalar;
}

export interface AssistantSuggestion {
  readonly id: string;
  readonly runId: string;
  readonly recordId: string;
  readonly title: string;
  readonly kind: AssistantSuggestionKind;
  readonly summary: string;
  readonly reason: string;
  readonly confidence: number;
  readonly evidence: readonly string[];
  readonly patches: readonly AssistantPatch[];
  readonly status: AssistantSuggestionStatus;
  readonly createdAt: string;
  readonly decidedAt?: string;
}

export interface AssistantRun {
  readonly id: string;
  readonly engine: AssistantEngine;
  readonly model: string;
  readonly scope: "selected" | "filtered";
  readonly recordIds: readonly string[];
  readonly inputHash: string;
  readonly contentSummary: string;
  readonly status: AssistantRunStatus;
  readonly createdAt: string;
  readonly completedAt: string;
  readonly suggestionCount: number;
  readonly error?: string;
}

export interface AssistantRunResult {
  readonly run: AssistantRun;
  readonly suggestions: readonly AssistantSuggestion[];
}

export interface AssistantProviderSettings {
  readonly engine: AssistantEngine;
  readonly endpoint: string;
  readonly model: string;
  readonly hasCredential: boolean;
}

export interface RemoteSuggestionDraft {
  readonly recordId: string;
  readonly kind: AssistantSuggestionKind;
  readonly summary: string;
  readonly reason: string;
  readonly confidence: number;
  readonly evidence: readonly string[];
  readonly patches: readonly AssistantPatch[];
}

export const assistantFieldPaths: readonly AssistantFieldPath[] = [
  "draft.work.form", "draft.work.title", "draft.work.editorialTitle", "draft.work.compositionNote",
  "draft.chronologyResearch.display", "draft.chronologyResearch.startYear", "draft.chronologyResearch.endYear", "draft.chronologyResearch.precision",
  "draft.reading.translation", "draft.reading.appreciation"
];

const fieldPathSet = new Set<string>(assistantFieldPaths);
const formPrefixes = [
  ["七绝", "qijue"], ["五绝", "wujue"], ["七律", "qilv"], ["五律", "wulv"], ["新诗", "xinshi"], ["散文", "sanwen"], ["随笔", "suibi"]
] as const;

function titleOf(record: EditorialRecord): string {
  return record.draft.work.editorialTitle?.trim() || record.draft.work.title.trim() || "未题名";
}

function bodyOf(record: EditorialRecord): string {
  return record.draft.work.prose?.trim() || record.draft.work.lines.join("\n").trim();
}

function scalarAt(record: EditorialRecord, path: AssistantFieldPath): AssistantScalar {
  const parts = path.split(".");
  let current: unknown = record;
  for (const part of parts) current = current && typeof current === "object" ? (current as Record<string, unknown>)[part] : undefined;
  return current === undefined ? null : current as AssistantScalar;
}

function setScalarAt(record: EditorialRecord, path: AssistantFieldPath, value: AssistantScalar): void {
  const parts = path.split(".");
  let current = record as unknown as Record<string, unknown>;
  for (const part of parts.slice(0, -1)) {
    const next = current[part];
    if (!next || typeof next !== "object") current[part] = {};
    current = current[part] as Record<string, unknown>;
  }
  current[parts.at(-1)!] = value;
}

function suggestion(runId: string, record: EditorialRecord, kind: AssistantSuggestionKind, summary: string, reason: string, confidence: number, evidence: string[], patches: AssistantPatch[], now: string): AssistantSuggestion {
  return { id: createEntityId(), runId, recordId: record.id, title: titleOf(record), kind, summary, reason, confidence, evidence, patches, status: "pending", createdAt: now };
}

export function scanLocalEditorial(records: readonly EditorialRecord[], scope: AssistantRun["scope"] = "selected", now = new Date().toISOString()): AssistantRunResult {
  const active = records.filter((record) => record.operation !== "delete");
  const runId = createEntityId();
  const suggestions: AssistantSuggestion[] = [];
  for (const record of active) {
    const title = titleOf(record);
    const prefix = formPrefixes.find(([label]) => title.startsWith(label));
    if (prefix && record.draft.work.form !== prefix[1]) {
      suggestions.push(suggestion(runId, record, "metadata", "体裁与题名标识不一致", `题名以“${prefix[0]}”起首，当前体裁却不是${prefix[0]}。请结合作者原意复核。`, 0.94, [`题名：${title}`, `当前体裁：${record.draft.work.form}`], [{ path: "draft.work.form", before: record.draft.work.form, after: prefix[1] }], now));
    }
    const yearMatch = record.draft.chronologyResearch.display.match(/(?:19|20)\d{2}/u);
    if (yearMatch) {
      const year = Number(yearMatch[0]);
      if (record.draft.chronologyResearch.startYear !== year || record.draft.chronologyResearch.endYear !== year || record.draft.chronologyResearch.precision === "unknown") {
        suggestions.push(suggestion(runId, record, "chronology", "系年显示与结构字段未对齐", `显示系年包含 ${year} 年，但可排序的起止年份或精度尚未同步。`, 0.98, [`系年显示：${record.draft.chronologyResearch.display}`], [
          { path: "draft.chronologyResearch.startYear", before: record.draft.chronologyResearch.startYear, after: year },
          { path: "draft.chronologyResearch.endYear", before: record.draft.chronologyResearch.endYear, after: year },
          { path: "draft.chronologyResearch.precision", before: record.draft.chronologyResearch.precision, after: "year" }
        ], now));
      }
    }
    const body = bodyOf(record);
    for (const annotation of record.draft.reading?.annotations ?? []) {
      if (annotation.anchor.trim() && !body.includes(annotation.anchor.trim())) {
        suggestions.push(suggestion(runId, record, "reading-anchor", "笺注锚点已脱离正文", `“${annotation.anchor}”在当前正文中不存在，可能是正文修订后遗留的旧锚点。`, 0.99, [`锚点：${annotation.anchor}`], [], now));
      }
    }
  }
  const inputHash = digest(active.map((record) => ({ id: record.id, draft: record.draft })));
  return {
    run: { id: runId, engine: "local-rules", model: "moxiao-local-audit/1.0", scope, recordIds: active.map((record) => record.id), inputHash, contentSummary: `${active.length} 篇；题名、体裁、系年结构与笺注锚点`, status: "completed", createdAt: now, completedAt: now, suggestionCount: suggestions.length },
    suggestions
  };
}

function isScalar(value: unknown): value is AssistantScalar {
  return value === null || typeof value === "string" || typeof value === "number";
}

export function validateRemoteSuggestionPayload(value: unknown, records: readonly EditorialRecord[], runId: string, now = new Date().toISOString()): AssistantSuggestion[] {
  if (!Array.isArray(value) || value.length > 200) throw new Error("模型建议必须是最多 200 项的数组");
  const recordMap = new Map(records.map((record) => [record.id, record]));
  return value.map((item, index) => {
    if (!item || typeof item !== "object") throw new Error(`第 ${index + 1} 项建议不是对象`);
    const draft = item as Record<string, unknown>;
    const record = typeof draft.recordId === "string" ? recordMap.get(draft.recordId) : undefined;
    if (!record) throw new Error(`第 ${index + 1} 项建议指向未知作品`);
    if (!(draft.kind === "metadata" || draft.kind === "chronology" || draft.kind === "reading-anchor" || draft.kind === "copyedit")) throw new Error(`第 ${index + 1} 项建议类型无效`);
    if (typeof draft.summary !== "string" || !draft.summary.trim() || draft.summary.length > 300 || typeof draft.reason !== "string" || draft.reason.length > 2_000) throw new Error(`第 ${index + 1} 项建议文字无效`);
    if (typeof draft.confidence !== "number" || draft.confidence < 0 || draft.confidence > 1) throw new Error(`第 ${index + 1} 项置信度无效`);
    if (!Array.isArray(draft.patches) || draft.patches.length > 8) throw new Error(`第 ${index + 1} 项补丁无效`);
    const patches = draft.patches.map((patch, patchIndex) => {
      if (!patch || typeof patch !== "object") throw new Error(`第 ${index + 1} 项第 ${patchIndex + 1} 个补丁无效`);
      const candidate = patch as Record<string, unknown>;
      if (typeof candidate.path !== "string" || !fieldPathSet.has(candidate.path) || !isScalar(candidate.before) || !isScalar(candidate.after)) throw new Error(`第 ${index + 1} 项含越权或非法字段`);
      const path = candidate.path as AssistantFieldPath;
      if (scalarAt(record, path) !== candidate.before) throw new Error(`第 ${index + 1} 项建议基线与当前母本不一致`);
      return { path, before: candidate.before, after: candidate.after };
    });
    const evidence = Array.isArray(draft.evidence) && draft.evidence.every((entry) => typeof entry === "string") ? draft.evidence.slice(0, 8) as string[] : [];
    return suggestion(runId, record, draft.kind, draft.summary.trim(), draft.reason.trim(), draft.confidence, evidence, patches, now);
  });
}

export function applyAssistantSuggestion(workspace: EditorialWorkspace, value: AssistantSuggestion, now = new Date().toISOString()): EditorialWorkspace {
  if (value.status !== "pending" || !value.patches.length) throw new Error("只有含修改内容的待处理建议可以接受");
  const next = structuredClone(workspace);
  const record = next.records.find((item) => item.id === value.recordId && item.operation !== "delete");
  if (!record) throw new Error("建议指向的作品已不存在");
  for (const patch of value.patches) if (scalarAt(record, patch.path) !== patch.before) throw new Error("母本已变化，请重新运行智校后再接受建议");
  for (const patch of value.patches) setScalarAt(record, patch.path, patch.after);
  record.editorState = { status: "editing", updatedAt: now };
  return next;
}

export function decideAssistantSuggestion(value: AssistantSuggestion, status: Extract<AssistantSuggestionStatus, "accepted" | "rejected" | "conflict">, now = new Date().toISOString()): AssistantSuggestion {
  if (value.status !== "pending") throw new Error("建议已经处理");
  return { ...value, status, decidedAt: now };
}

