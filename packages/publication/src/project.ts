import type { EntityId } from "@moxiao/domain";
import type { PublicationProfile } from "./index";

export type PublicationSortMode = "author-intent" | "chronology-asc" | "chronology-desc" | "genre";
export type PublicationTarget = "pdf" | "epub" | "xianxinzimo" | "webpub";
export type PublicationAssetKind = "cover" | "illustration" | "font" | "ornament";
export type AssetRights = "owned" | "licensed" | "public-domain" | "unknown";

export interface PublicationEntry {
  readonly recordId: string;
  readonly entityId: EntityId;
  readonly included: boolean;
  readonly manualOrder: number;
  readonly partTitle?: string;
  readonly includeCompositionNote: boolean;
  readonly includeTranslation: boolean;
  readonly includeAnnotations: boolean;
  readonly includeAppreciation: boolean;
}

export interface PublicationAsset {
  readonly id: EntityId;
  readonly kind: PublicationAssetKind;
  readonly fileName: string;
  readonly mediaType: string;
  readonly dataUri?: string;
  readonly alt: string;
  readonly caption?: string;
  readonly fontFamily?: string;
  readonly rights: AssetRights;
  readonly rightsNote?: string;
  readonly attachedRecordId?: string;
}

export interface PublicationTheme {
  readonly id: "elegant" | "plain" | "modern";
  readonly bodyFont: string;
  readonly headingFont: string;
  readonly baseFontPt: number;
  readonly lineHeight: number;
  readonly accentColor: string;
  readonly ornament: "none" | "bamboo" | "cloud" | "rule";
}

export interface PublicationProject {
  readonly format: "MOXIAO-PUBLICATION";
  readonly version: "1.0";
  readonly id: EntityId;
  readonly title: string;
  readonly subtitle: string;
  readonly creator: string;
  readonly language: string;
  readonly description: string;
  readonly sortMode: PublicationSortMode;
  readonly genreFilter: string;
  readonly chronologyFilter: "all" | "dated" | "undated";
  readonly entries: readonly PublicationEntry[];
  readonly assets: readonly PublicationAsset[];
  readonly theme: PublicationTheme;
  readonly profile: PublicationProfile;
  readonly target: PublicationTarget;
  readonly updatedAt: string;
}

export const defaultTheme: PublicationTheme = {
  id: "elegant",
  bodyFont: '"Songti SC", "STSong", serif',
  headingFont: '"Songti SC", "STSong", serif',
  baseFontPt: 11.5,
  lineHeight: 1.9,
  accentColor: "#315f4d",
  ornament: "bamboo"
};

export function validatePublicationProject(value: unknown): PublicationProject {
  if (!value || typeof value !== "object") throw new Error("出版项目不是对象");
  const project = structuredClone(value) as PublicationProject;
  if (project.format !== "MOXIAO-PUBLICATION" || project.version !== "1.0") throw new Error("出版项目格式或版本不受支持");
  if (!project.title?.trim() || project.title.length > 300) throw new Error("出版项目必须有有效书名");
  if (!(["author-intent", "chronology-asc", "chronology-desc", "genre"] as const).includes(project.sortMode)) throw new Error("出版排序方式无效");
  if (!(["pdf", "epub", "xianxinzimo", "webpub"] as const).includes(project.target)) throw new Error("出版目标无效");
  if (!Array.isArray(project.entries) || !Array.isArray(project.assets)) throw new Error("出版项目缺少篇目或资产清单");
  const recordIds = new Set<string>();
  for (const entry of project.entries) {
    if (!entry.recordId || recordIds.has(entry.recordId)) throw new Error("出版篇目 ID 为空或重复");
    recordIds.add(entry.recordId);
    if (!Number.isInteger(entry.manualOrder) || entry.manualOrder < 0) throw new Error("作者编定顺序无效");
  }
  const assetIds = new Set<string>();
  for (const asset of project.assets) {
    if (assetIds.has(asset.id)) throw new Error("出版资产 ID 重复");
    assetIds.add(asset.id);
    if (!asset.fileName || asset.fileName.length > 300 || !asset.mediaType) throw new Error("出版资产信息无效");
    if (asset.kind === "font" && (!asset.fontFamily?.trim() || asset.fontFamily.length > 120)) throw new Error("字体资产缺少有效字体名称");
    if (asset.dataUri && asset.dataUri.length > 18_000_000) throw new Error("出版资产超过 12 MB 安全上限");
  }
  if (!project.theme || project.theme.baseFontPt < 7 || project.theme.baseFontPt > 36 || project.theme.lineHeight < 1 || project.theme.lineHeight > 3) throw new Error("出版主题参数无效");
  return project;
}
