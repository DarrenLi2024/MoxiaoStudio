import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join, relative } from "node:path";
import { createWorkspace, digest, importLegacyWorkspace, stableStringify, type CuratedReading, type EditorialPayload, type EditorialRecord, type EditorialWorkspace, type LegacyWork } from "@moxiao/editorial";

export const xianxinContentFormat = "XZM-XIANXIN-CONTENT" as const;
export const xianxinContentVersion = "1.0" as const;

export interface ContentEntry {
  readonly path: string;
  readonly sha256: string;
  readonly byteLength: number;
  readonly mediaType: string;
  readonly recordCount: number | null;
}

export interface MediaEntry {
  readonly path: string;
  readonly sha256: string;
  readonly byteLength: number;
  readonly kind: "audio" | "artwork";
  readonly rights: "declared-in-source" | "requires-review";
}

export interface XianxinContentManifest {
  readonly format: typeof xianxinContentFormat;
  readonly version: typeof xianxinContentVersion;
  readonly sourceApplication: "闲心子墨";
  readonly createdAt: string;
  readonly contentHash: string;
  readonly counts: { works: number; readings: number; pronunciations: number; recitations: number; audio: number; artwork: number };
  readonly entries: readonly ContentEntry[];
  readonly media: readonly MediaEntry[];
}

export interface XianxinSourceSnapshot {
  readonly root: string;
  readonly resourcesDirectory: string;
  readonly files: ReadonlyMap<string, Uint8Array>;
  readonly manifest: XianxinContentManifest;
}

const resourceNames = ["works.json", "readings.json", "readings-deep.json", "readings-standard.json", "readings-light.json", "readings-special.json", "pronunciations.json", "natural-readings.json"] as const;

function hashBytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function json(bytes: Uint8Array): Record<string, unknown> {
  return JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
}

function recordCount(name: string, value: Record<string, unknown>): number | null {
  if (name === "works.json") return Array.isArray(value.works) ? value.works.length : 0;
  if (name.startsWith("readings")) return Object.keys((value.readings as Record<string, unknown> | undefined) ?? {}).length;
  if (name === "pronunciations.json") return Array.isArray(value.entries) ? value.entries.length : 0;
  if (name === "natural-readings.json") return Object.keys((value.tracks as Record<string, unknown> | undefined) ?? {}).length;
  return null;
}

function listFiles(directory: string, prefix: string): string[] {
  const result: string[] = [];
  for (const name of readdirSync(directory).sort()) {
    const fullPath = join(directory, name);
    const path = join(prefix, name);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) result.push(...listFiles(fullPath, path));
    else if (stat.isFile()) result.push(path);
  }
  return result;
}

export function inspectXianxinSource(root: string, now = new Date().toISOString()): XianxinSourceSnapshot {
  const resourcesDirectory = join(root, "PoetryApp", "Resources");
  const files = new Map<string, Uint8Array>();
  const entries: ContentEntry[] = [];
  for (const name of resourceNames) {
    const bytes = readFileSync(join(resourcesDirectory, name));
    const value = json(bytes);
    files.set(name, bytes);
    entries.push({ path: `resources/${name}`, sha256: hashBytes(bytes), byteLength: bytes.byteLength, mediaType: "application/json", recordCount: recordCount(name, value) });
  }

  const readingIds = new Set<string>();
  let readingCount = 0;
  for (const name of resourceNames.filter((item) => item.startsWith("readings"))) {
    const readings = (json(files.get(name)!).readings as Record<string, unknown> | undefined) ?? {};
    for (const id of Object.keys(readings)) {
      if (readingIds.has(id)) throw new Error(`笺读 ID 跨卷重复：${id}`);
      readingIds.add(id);
      readingCount += 1;
    }
  }
  const worksBundle = json(files.get("works.json")!);
  const works = (worksBundle.works as Array<{ id?: string }> | undefined) ?? [];
  const workIds = new Set<string>();
  for (const work of works) {
    if (!work.id || workIds.has(work.id)) throw new Error(`作品 ID 缺失或重复：${work.id ?? "空"}`);
    workIds.add(work.id);
  }
  for (const id of readingIds) if (!workIds.has(id)) throw new Error(`笺读没有对应作品：${id}`);

  const media: MediaEntry[] = [];
  const audioDirectory = join(resourcesDirectory, "Audio");
  if (existsSync(audioDirectory) && statSync(audioDirectory).isDirectory()) {
    for (const path of listFiles(audioDirectory, "Audio")) {
      const bytes = readFileSync(join(resourcesDirectory, path));
      media.push({ path: `media/${path}`, sha256: hashBytes(bytes), byteLength: bytes.byteLength, kind: "audio", rights: "requires-review" });
    }
  }
  const assetDirectory = join(root, "PoetryApp", "Assets.xcassets");
  for (const path of listFiles(assetDirectory, "Assets.xcassets").filter((item) => /\.(?:png|jpe?g|webp|heic)$/iu.test(item))) {
    const bytes = readFileSync(join(root, "PoetryApp", path));
    media.push({ path: `media/${path}`, sha256: hashBytes(bytes), byteLength: bytes.byteLength, kind: "artwork", rights: "requires-review" });
  }
  const pronunciations = json(files.get("pronunciations.json")!);
  const recitations = json(files.get("natural-readings.json")!);
  const counts = {
    works: works.length,
    readings: readingCount,
    pronunciations: Array.isArray(pronunciations.entries) ? pronunciations.entries.length : 0,
    recitations: Object.keys((recitations.tracks as Record<string, unknown> | undefined) ?? {}).length,
    audio: media.filter((item) => item.kind === "audio").length,
    artwork: media.filter((item) => item.kind === "artwork").length
  };
  const contentHash = hashBytes(new TextEncoder().encode(stableStringify({ entries, media, counts })));
  return { root, resourcesDirectory, files, manifest: { format: xianxinContentFormat, version: xianxinContentVersion, sourceApplication: "闲心子墨", createdAt: now, contentHash, counts, entries, media } };
}

function defaultChronology(work: LegacyWork): EditorialPayload["chronologyResearch"] {
  const existing = work.chronologyResearch;
  if (existing && typeof existing === "object") return structuredClone(existing) as EditorialPayload["chronologyResearch"];
  const display = work.composedAt?.trim() ?? "";
  const year = display.match(/(?:19|20)\d{2}/u)?.[0];
  return { display, startYear: year ? Number(year) : null, endYear: year ? Number(year) : null, precision: year ? "year" : "unknown", certainty: "unreviewed", basis: [], alternatives: [], editorialNote: display ? "沿用既有 composedAt，待补证据。" : "待考。" };
}

export function sourceToEditorialWorkspace(source: XianxinSourceSnapshot): EditorialWorkspace {
  const works = ((json(source.files.get("works.json")!).works as LegacyWork[] | undefined) ?? []);
  const readings = new Map<string, { reading: CuratedReading; source: string }>();
  for (const name of resourceNames.filter((item) => item.startsWith("readings"))) {
    const catalog = (json(source.files.get(name)!).readings as Record<string, CuratedReading> | undefined) ?? {};
    for (const [id, reading] of Object.entries(catalog)) readings.set(id, { reading, source: name });
  }
  const records: EditorialRecord[] = works.map((work) => {
    const external = readings.get(work.id);
    const inline = work.reading as CuratedReading | undefined;
    if (inline && external) throw new Error(`作品内联稿与外置笺读重复：${work.id}`);
    const payload: EditorialPayload = {
      work: structuredClone(work), reading: structuredClone(inline ?? external?.reading ?? null),
      readingSource: inline ? "works.json:inline" : external?.source ?? null,
      chronologyResearch: defaultChronology(work), editorNotes: typeof work.editorialReviewNote === "string" ? work.editorialReviewNote : null
    };
    const shell = importLegacyWorkspace({ format: "XZM-EW", version: "0.1", scope: "full", createdAt: source.manifest.createdAt, savedAt: null, revision: 0, records: [{ id: work.id, sourceHash: digest(payload), baseline: payload, draft: structuredClone(payload), editorState: { status: "pending", updatedAt: null } }] });
    return shell.records[0]!;
  });
  return createWorkspace("full", records, source.manifest.createdAt);
}

export function workspaceToResourceFiles(workspaceValue: EditorialWorkspace, source: XianxinSourceSnapshot): ReadonlyMap<string, string> {
  const workspace = importLegacyWorkspace(workspaceValue);
  const sourceWorks = json(source.files.get("works.json")!);
  const readingFiles = new Map<string, Record<string, CuratedReading>>();
  for (const name of resourceNames.filter((item) => item.startsWith("readings"))) readingFiles.set(name, {});
  const works: LegacyWork[] = [];
  for (const record of [...workspace.records].sort((left, right) => left.draft.work.seq - right.draft.work.seq)) {
    if (record.operation === "delete") continue;
    const work = structuredClone(record.draft.work);
    const baselineHadChronology = Boolean(record.baseline.work.chronologyResearch && typeof record.baseline.work.chronologyResearch === "object");
    const chronologyChanged = stableStringify(record.baseline.chronologyResearch) !== stableStringify(record.draft.chronologyResearch);
    if (baselineHadChronology || chronologyChanged) work.chronologyResearch = structuredClone(record.draft.chronologyResearch);
    else delete work.chronologyResearch;
    delete work.reading;
    if (record.draft.reading) {
      if (record.draft.readingSource === "works.json:inline") work.reading = structuredClone(record.draft.reading);
      else {
        const target = record.draft.readingSource && readingFiles.has(record.draft.readingSource) ? record.draft.readingSource : "readings.json";
        readingFiles.get(target)![work.id] = structuredClone(record.draft.reading);
      }
    }
    works.push(work);
  }
  const output = new Map<string, string>();
  output.set("works.json", `${stableStringify({ ...sourceWorks, works }, 2)}\n`);
  for (const [name, readings] of readingFiles) output.set(name, `${stableStringify({ readings }, 2)}\n`);
  for (const name of ["pronunciations.json", "natural-readings.json"] as const) output.set(name, new TextDecoder().decode(source.files.get(name)!));
  return output;
}

export function verifySemanticRoundTrip(source: XianxinSourceSnapshot): { ok: boolean; mismatches: string[]; workspace: EditorialWorkspace } {
  const workspace = sourceToEditorialWorkspace(source);
  const generated = workspaceToResourceFiles(workspace, source);
  const mismatches: string[] = [];
  for (const name of resourceNames) {
    const original = json(source.files.get(name)!);
    const restored = JSON.parse(generated.get(name)!) as unknown;
    if (stableStringify(original) !== stableStringify(restored)) mismatches.push(name);
  }
  return { ok: mismatches.length === 0, mismatches, workspace };
}

export function displaySourceName(source: XianxinSourceSnapshot): string {
  return basename(source.root) || relative(source.resourcesDirectory, source.root);
}
