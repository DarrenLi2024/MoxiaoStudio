import { equalValue, stableStringify } from "./stable";
import type { EditorialRecord, EditorialWorkspace } from "./types";
import { importLegacyWorkspace, validateWorkspace } from "./workspace";

function compact(value: unknown): string {
  return String(value ?? "").normalize("NFKC").toLowerCase().replace(/[\s，。！？；：、（）()《》〈〉【】“”‘’—－·….,!?;:'"\-_]/gu, "");
}

export function titleOf(record: EditorialRecord): string {
  return record.draft.work.editorialTitle?.trim() || record.draft.work.title.trim() || "未题名";
}

export function bodyOf(record: EditorialRecord): string {
  return record.draft.work.prose?.trim() || record.draft.work.lines.join("\n").trim();
}

function bigrams(value: string): Set<string> {
  const normalized = compact(value);
  if (normalized.length < 2) return new Set(normalized ? [normalized] : []);
  return new Set(Array.from({ length: normalized.length - 1 }, (_, index) => normalized.slice(index, index + 2)));
}

function dice(left: string, right: string): number {
  const a = bigrams(left);
  const b = bigrams(right);
  if (!a.size || !b.size) return 0;
  let overlap = 0;
  for (const token of a) if (b.has(token)) overlap += 1;
  return (2 * overlap) / (a.size + b.size);
}

export interface DuplicateMatch {
  left: { id: string; title: string };
  right: { id: string; title: string };
  reasons: string[];
}

export function findDuplicates(records: readonly EditorialRecord[]): DuplicateMatch[] {
  const matches: DuplicateMatch[] = [];
  for (let leftIndex = 0; leftIndex < records.length; leftIndex += 1) {
    const left = records[leftIndex];
    if (!left) continue;
    for (let rightIndex = leftIndex + 1; rightIndex < records.length; rightIndex += 1) {
      const right = records[rightIndex];
      if (!right) continue;
      const reasons: string[] = [];
      const leftTitle = compact(titleOf(left));
      const rightTitle = compact(titleOf(right));
      const leftBody = compact(bodyOf(left));
      const rightBody = compact(bodyOf(right));
      if (left.id === right.id) reasons.push("稳定 ID 相同");
      if (leftTitle && leftTitle === rightTitle) reasons.push("题名相同");
      if (leftBody && leftBody === rightBody) reasons.push("正文相同");
      if (!reasons.length && leftBody.length >= 20 && rightBody.length >= 20) {
        const score = dice(leftBody, rightBody);
        if (score >= 0.9) reasons.push(`正文高度相似（${Math.round(score * 100)}%）`);
      }
      if (reasons.length) matches.push({ left: { id: left.id, title: titleOf(left) }, right: { id: right.id, title: titleOf(right) }, reasons });
    }
  }
  return matches;
}

export interface ComparisonRow {
  left: string | null;
  right: string | null;
  status: "same" | "left-only" | "right-only";
}

function starterRecordFingerprint(record: EditorialRecord): string {
  return stableStringify({
    id: record.id,
    operation: record.operation ?? "update",
    sourceHash: record.sourceHash,
    baseline: record.baseline,
    draft: record.draft,
    status: record.editorState.status
  });
}

export function matchesStarterWorkspace(currentValue: EditorialWorkspace, starterValue: EditorialWorkspace): boolean {
  const current = validateWorkspace(currentValue);
  const starter = validateWorkspace(starterValue);
  if (current.scope !== starter.scope || current.records.length !== starter.records.length || current.records.length === 0) return false;
  const expected = new Map(starter.records.map((record) => [record.id, starterRecordFingerprint(record)]));
  return current.records.every((record) => expected.get(record.id) === starterRecordFingerprint(record));
}

export function compareDuplicatePair(left: EditorialRecord, right: EditorialRecord): ComparisonRow[] {
  const a = bodyOf(left).split(/\n+/u).map((line) => line.trim()).filter(Boolean);
  const b = bodyOf(right).split(/\n+/u).map((line) => line.trim()).filter(Boolean);
  const matrix = Array.from({ length: a.length + 1 }, () => Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      const row = matrix[i];
      const nextRow = matrix[i + 1];
      if (!row || !nextRow) continue;
      row[j] = compact(a[i]) === compact(b[j]) ? (nextRow[j + 1] ?? 0) + 1 : Math.max(nextRow[j] ?? 0, row[j + 1] ?? 0);
    }
  }
  const rows: ComparisonRow[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && compact(a[i]) === compact(b[j])) {
      rows.push({ left: a[i] ?? null, right: b[j] ?? null, status: "same" }); i += 1; j += 1;
    } else if (j >= b.length || (i < a.length && (matrix[i + 1]?.[j] ?? 0) >= (matrix[i]?.[j + 1] ?? 0))) {
      rows.push({ left: a[i] ?? null, right: null, status: "left-only" }); i += 1;
    } else {
      rows.push({ left: null, right: b[j] ?? null, status: "right-only" }); j += 1;
    }
  }
  return rows;
}

export function mergeWorkspace(currentValue: EditorialWorkspace, incomingValue: unknown, options: { replaceStarterWorkspace?: boolean } = {}): {
  workspace: EditorialWorkspace;
  updated: number;
  added: number;
  unchanged: number;
  replacedEmpty: boolean;
} {
  const current = validateWorkspace(currentValue);
  const incoming = importLegacyWorkspace(incomingValue);
  if (incoming.scope !== current.scope) throw new Error(`审校包范围为 ${incoming.scope}，当前工作区范围为 ${current.scope}`);
  if (!incoming.records.length) throw new Error("审校包没有作品记录");
  const replacingStarterWorkspace = options.replaceStarterWorkspace === true;
  const replacingEmptyWorkspace = current.records.length === 0 || replacingStarterWorkspace;
  const records = replacingStarterWorkspace ? [] : structuredClone(current.records);
  const indexes = new Map(records.map((record, index) => [record.id, index]));
  let updated = 0;
  let added = 0;
  let unchanged = 0;
  for (const imported of incoming.records) {
    const index = indexes.get(imported.id);
    if (index === undefined) {
      if (!replacingEmptyWorkspace && imported.operation !== "add") throw new Error(`${imported.id}: 不是新增记录，无法并入当前工作区`);
      records.push(structuredClone(imported));
      indexes.set(imported.id, records.length - 1);
      if (imported.operation === "add") added += 1;
      else updated += 1;
      continue;
    }
    const existing = records[index];
    if (!existing) continue;
    if (existing.sourceHash !== imported.sourceHash || !equalValue(existing.baseline, imported.baseline)) {
      throw new Error(`${imported.id}: 基线与当前工作区不一致，已停止导入以免覆盖人工成果`);
    }
    const stableImported = { ...structuredClone(imported), entityId: existing.entityId };
    if (equalValue(existing, stableImported)) unchanged += 1;
    else { records[index] = stableImported; updated += 1; }
  }
  return { workspace: validateWorkspace({ ...structuredClone(current), records }), updated, added, unchanged, replacedEmpty: replacingEmptyWorkspace };
}
