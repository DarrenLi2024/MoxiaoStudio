import type { EntityId } from "@moxiao/domain";
import type { PublicationProfile } from "./index";

export type PublicationSortMode = "author-intent" | "chronology-asc" | "chronology-desc" | "genre" | "mood" | "hybrid";
export type PublicationTarget = "pdf" | "epub" | "xianxinzimo" | "webpub";
export type PublicationAssetKind = "cover" | "illustration" | "font" | "ornament" | "portrait";
export type AssetRights = "owned" | "licensed" | "public-domain" | "unknown";
export type ApparatusPolicy = "omit" | "backmatter" | "internal-proof";
export type DraftStatus = "draft" | "confirmed";
export type PublicationThemeId = "sujian" | "qingjian" | "contemporary" | "collector";
export type IllustrationRole = "chapter-opening" | "inline" | "plate" | "endpiece";

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
  readonly locked: boolean;
  readonly moodTags: readonly string[];
  readonly editorialRole: "normal" | "opening" | "closing";
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
  /** @deprecated 1.0 兼容字段；迁移后由 placements 承担出版位置。 */
  readonly attachedRecordId?: string;
}

export interface PublicationPlacement {
  readonly assetId: EntityId;
  readonly recordId: string;
  readonly role: IllustrationRole;
  readonly anchorText?: string;
  readonly alignment: "center" | "left" | "right";
  readonly size: "small" | "medium" | "wide" | "full-page";
  readonly focalPoint: readonly [number, number];
}

export interface ConfirmableText {
  readonly title: string;
  readonly body: string;
  readonly status: DraftStatus;
  readonly basis?: string;
}

export interface CopyrightInformation {
  readonly rightsHolder: string;
  readonly copyrightYear: string;
  readonly edition: string;
  readonly publicationType: "private" | "self-published" | "publisher";
  readonly publisher: string;
  readonly isbn: string;
  readonly contact: string;
  readonly statement: string;
}

export interface AuthorProfile {
  readonly displayName: string;
  readonly penName: string;
  readonly biography: ConfirmableText;
  readonly portraitAssetId?: EntityId;
}

export interface FrontMatterOptions {
  readonly includeTitlePage: boolean;
  readonly includeCopyright: boolean;
  readonly includePreface: boolean;
  readonly includeAuthorBio: boolean;
  readonly includeToc: boolean;
  readonly copyright: CopyrightInformation;
  readonly preface: ConfirmableText;
  readonly author: AuthorProfile;
}

export interface PublicationTheme {
  readonly id: PublicationThemeId;
  readonly bodyFont: string;
  readonly headingFont: string;
  readonly baseFontPt: number;
  readonly lineHeight: number;
  readonly accentColor: string;
  readonly ornament: "none" | "bamboo" | "cloud" | "rule";
  readonly density: "compact" | "balanced" | "relaxed";
  readonly titleStyle: "centered" | "left-modern" | "numbered";
  readonly translationStyle: "plain" | "rule" | "panel";
  readonly annotationStyle: "inline" | "list" | "panel";
  readonly appreciationStyle: "section" | "rule" | "panel";
}

export interface ArrangementItem {
  readonly recordId: string;
  readonly order: number;
  readonly reason: string;
  readonly moodTags: readonly string[];
}

export interface ArrangementProposal {
  readonly strategy: "genre" | "chronology-asc" | "chronology-desc" | "mood" | "hybrid";
  readonly createdAt: string;
  readonly items: readonly ArrangementItem[];
}

export interface ArrangementOptions {
  readonly genreWeight: number;
  readonly chronologyWeight: number;
  readonly moodWeight: number;
  readonly proposal?: ArrangementProposal;
  readonly previousManualOrder?: Readonly<Record<string, number>>;
}

export interface PublicationProject {
  readonly format: "MOXIAO-PUBLICATION";
  readonly version: "1.1";
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
  readonly placements: readonly PublicationPlacement[];
  readonly frontMatter: FrontMatterOptions;
  readonly apparatusPolicy: ApparatusPolicy;
  readonly arrangement: ArrangementOptions;
  readonly theme: PublicationTheme;
  readonly profile: PublicationProfile;
  readonly target: PublicationTarget;
  readonly updatedAt: string;
}

export const publicationThemes: Readonly<Record<PublicationThemeId, PublicationTheme>> = {
  sujian: {
    id: "sujian", bodyFont: '"Songti SC", "STSong", serif', headingFont: '"Songti SC", "STSong", serif',
    baseFontPt: 11.5, lineHeight: 1.9, accentColor: "#315f4d", ornament: "rule", density: "balanced",
    titleStyle: "centered", translationStyle: "plain", annotationStyle: "list", appreciationStyle: "section"
  },
  qingjian: {
    id: "qingjian", bodyFont: '"Songti SC", "STSong", serif', headingFont: '"Kaiti SC", "STKaiti", serif',
    baseFontPt: 11.5, lineHeight: 1.95, accentColor: "#376b57", ornament: "bamboo", density: "relaxed",
    titleStyle: "centered", translationStyle: "rule", annotationStyle: "panel", appreciationStyle: "rule"
  },
  contemporary: {
    id: "contemporary", bodyFont: '"PingFang SC", "Microsoft YaHei", sans-serif', headingFont: '"Songti SC", "STSong", serif',
    baseFontPt: 11, lineHeight: 1.82, accentColor: "#42564d", ornament: "none", density: "balanced",
    titleStyle: "left-modern", translationStyle: "panel", annotationStyle: "list", appreciationStyle: "panel"
  },
  collector: {
    id: "collector", bodyFont: '"Songti SC", "STSong", serif', headingFont: '"Songti SC", "STSong", serif',
    baseFontPt: 11, lineHeight: 1.82, accentColor: "#6a4835", ornament: "cloud", density: "compact",
    titleStyle: "numbered", translationStyle: "rule", annotationStyle: "inline", appreciationStyle: "section"
  }
};

export const defaultTheme: PublicationTheme = publicationThemes.sujian;

export function createDefaultFrontMatter(creator: string, year: string): FrontMatterOptions {
  const displayName = creator.trim();
  return {
    includeTitlePage: true, includeCopyright: true, includePreface: true, includeAuthorBio: true, includeToc: true,
    copyright: {
      rightsHolder: displayName, copyrightYear: year, edition: "第一版", publicationType: "private", publisher: "", isbn: "", contact: "",
      statement: "本书文字与作者自有图像之著作权归署名作者所有。未经许可，不得以任何形式复制、传播或用于商业用途。"
    },
    preface: { title: "前言", body: "", status: "draft", basis: "根据当前出版项目的篇目、体裁与系年统计生成" },
    author: { displayName, penName: "", biography: { title: "作者简介", body: "", status: "draft", basis: "根据作者确认资料与本书创作概况生成" } }
  };
}

function migratedTheme(value: unknown): PublicationTheme {
  const theme = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const rawId = typeof theme.id === "string" ? theme.id : undefined;
  const legacyId = rawId === "plain" ? "sujian" : rawId === "modern" ? "contemporary" : rawId === "elegant" ? "qingjian" : rawId;
  const id: PublicationThemeId = legacyId && legacyId in publicationThemes ? legacyId as PublicationThemeId : "sujian";
  return { ...publicationThemes[id], ...theme, id } as PublicationTheme;
}

export function migratePublicationProject(value: unknown): PublicationProject {
  if (!value || typeof value !== "object") throw new Error("出版项目不是对象");
  const raw = structuredClone(value) as Record<string, unknown>;
  const source = raw as unknown as Partial<PublicationProject>;
  if (raw.format !== "MOXIAO-PUBLICATION" || (raw.version !== "1.0" && raw.version !== "1.1")) throw new Error("出版项目格式或版本不受支持");
  const creator = typeof source.creator === "string" ? source.creator : "";
  const updatedYear = typeof source.updatedAt === "string" ? source.updatedAt.slice(0, 4) : "";
  const defaults = createDefaultFrontMatter(creator, /^\d{4}$/u.test(updatedYear) ? updatedYear : String(new Date().getFullYear()));
  const assets = Array.isArray(source.assets) ? source.assets as PublicationAsset[] : [];
  const legacyPlacements: PublicationPlacement[] = assets.flatMap((asset) => asset.kind === "illustration" && asset.attachedRecordId ? [{
    assetId: asset.id, recordId: asset.attachedRecordId, role: "chapter-opening", alignment: "center", size: "wide", focalPoint: [0.5, 0.5]
  }] : []);
  const incomingFront = source.frontMatter as Partial<FrontMatterOptions> | undefined;
  const incomingCopyright = incomingFront?.copyright as Partial<CopyrightInformation> | undefined;
  const incomingAuthor = incomingFront?.author as Partial<AuthorProfile> | undefined;
  const incomingBiography = incomingAuthor?.biography as Partial<ConfirmableText> | undefined;
  const incomingPreface = incomingFront?.preface as Partial<ConfirmableText> | undefined;
  return {
    ...(source as unknown as PublicationProject), version: "1.1", creator,
    entries: (Array.isArray(source.entries) ? source.entries : []).map((item) => {
      const entry = item as Partial<PublicationEntry>;
      return { ...entry, includeCompositionNote: entry.includeCompositionNote ?? true, includeTranslation: entry.includeTranslation ?? true, includeAnnotations: entry.includeAnnotations ?? true, includeAppreciation: entry.includeAppreciation ?? true, locked: entry.locked ?? false, moodTags: entry.moodTags ?? [], editorialRole: entry.editorialRole ?? "normal" } as PublicationEntry;
    }),
    assets,
    placements: (Array.isArray(source.placements) ? source.placements : legacyPlacements) as PublicationPlacement[],
    apparatusPolicy: source.apparatusPolicy ?? "omit",
    frontMatter: {
      ...defaults, ...incomingFront,
      copyright: { ...defaults.copyright, ...incomingCopyright },
      preface: { ...defaults.preface, ...incomingPreface },
      author: { ...defaults.author, ...incomingAuthor, biography: { ...defaults.author.biography, ...incomingBiography } }
    },
    arrangement: { genreWeight: 1, chronologyWeight: 1, moodWeight: 1, ...(source.arrangement ?? {}) },
    theme: migratedTheme(source.theme)
  };
}

export function validatePublicationProject(value: unknown): PublicationProject {
  const project = migratePublicationProject(value);
  if (!project.title?.trim() || project.title.length > 300) throw new Error("出版项目必须有有效书名");
  if (!( ["author-intent", "chronology-asc", "chronology-desc", "genre", "mood", "hybrid"] as const).includes(project.sortMode)) throw new Error("出版排序方式无效");
  if (!( ["pdf", "epub", "xianxinzimo", "webpub"] as const).includes(project.target)) throw new Error("出版目标无效");
  if (!( ["omit", "backmatter", "internal-proof"] as const).includes(project.apparatusPolicy)) throw new Error("编校信息出版策略无效");
  if (!Array.isArray(project.entries) || !Array.isArray(project.assets) || !Array.isArray(project.placements)) throw new Error("出版项目缺少篇目或资产清单");
  const recordIds = new Set<string>();
  for (const entry of project.entries) {
    if (!entry.recordId || recordIds.has(entry.recordId)) throw new Error("出版篇目 ID 为空或重复");
    recordIds.add(entry.recordId);
    if (!Number.isInteger(entry.manualOrder) || entry.manualOrder < 0) throw new Error("作者编定顺序无效");
    if (!Array.isArray(entry.moodTags) || entry.moodTags.some((tag: string) => typeof tag !== "string" || tag.length > 40)) throw new Error("篇目意境标签无效");
  }
  const assetIds = new Set<string>();
  for (const asset of project.assets) {
    if (assetIds.has(asset.id)) throw new Error("出版资产 ID 重复");
    assetIds.add(asset.id);
    if (!( ["cover", "illustration", "font", "ornament", "portrait"] as const).includes(asset.kind) || !( ["owned", "licensed", "public-domain", "unknown"] as const).includes(asset.rights)) throw new Error("出版资产类型或权利状态无效");
    if (!asset.fileName || asset.fileName.length > 300 || !asset.mediaType) throw new Error("出版资产信息无效");
    const allowedMedia = asset.kind === "font" ? /^(font\/(otf|ttf|woff|woff2)|application\/font-woff)$/u : /^image\/(png|jpeg|webp)$/u;
    if (!allowedMedia.test(asset.mediaType)) throw new Error("出版资产媒体类型无效");
    if (asset.dataUri && !asset.dataUri.startsWith(`data:${asset.mediaType};base64,`)) throw new Error("出版资产数据与媒体类型不一致");
    if (asset.kind === "font" && (!asset.fontFamily?.trim() || asset.fontFamily.length > 120)) throw new Error("字体资产缺少有效字体名称");
    if (asset.dataUri && asset.dataUri.length > 18_000_000) throw new Error("出版资产超过 12 MB 安全上限");
  }
  const placementKeys = new Set<string>();
  for (const placement of project.placements) {
    if (!assetIds.has(placement.assetId) || !recordIds.has(placement.recordId)) throw new Error("插图位置引用不存在的资产或篇目");
    const placementKey = `${placement.assetId}\u0000${placement.recordId}`;
    if (placementKeys.has(placementKey)) throw new Error("同一图片在同一篇目中存在重复位置");
    placementKeys.add(placementKey);
    if (!( ["chapter-opening", "inline", "plate", "endpiece"] as const).includes(placement.role)) throw new Error("插图位置角色无效");
    if (!( ["center", "left", "right"] as const).includes(placement.alignment) || !( ["small", "medium", "wide", "full-page"] as const).includes(placement.size)) throw new Error("插图位置版式无效");
    if (placement.anchorText && placement.anchorText.length > 500) throw new Error("插图锚点文本过长");
    if (placement.focalPoint.some((point: number) => !Number.isFinite(point) || point < 0 || point > 1)) throw new Error("插图焦点无效");
  }
  if (!project.theme || !Object.hasOwn(publicationThemes, project.theme.id) || project.theme.baseFontPt < 7 || project.theme.baseFontPt > 36 || project.theme.lineHeight < 1 || project.theme.lineHeight > 3) throw new Error("出版主题参数无效");
  if (!/^#[0-9a-f]{6}$/iu.test(project.theme.accentColor) || [project.theme.bodyFont, project.theme.headingFont].some((font) => !font || font.length > 300 || /[{};]/u.test(font))) throw new Error("出版主题字体或颜色无效");
  if (!( ["compact", "balanced", "relaxed"] as const).includes(project.theme.density) || !( ["centered", "left-modern", "numbered"] as const).includes(project.theme.titleStyle) || !( ["plain", "rule", "panel"] as const).includes(project.theme.translationStyle) || !( ["inline", "list", "panel"] as const).includes(project.theme.annotationStyle) || !( ["section", "rule", "panel"] as const).includes(project.theme.appreciationStyle)) throw new Error("出版主题语义样式无效");
  if (!( ["private", "self-published", "publisher"] as const).includes(project.frontMatter.copyright.publicationType) || !( ["draft", "confirmed"] as const).includes(project.frontMatter.preface.status) || !( ["draft", "confirmed"] as const).includes(project.frontMatter.author.biography.status)) throw new Error("前置页状态无效");
  if (project.frontMatter.author.portraitAssetId && !project.assets.some((asset) => asset.id === project.frontMatter.author.portraitAssetId && asset.kind === "portrait")) throw new Error("作者照片引用无效");
  if ([project.arrangement.genreWeight, project.arrangement.chronologyWeight, project.arrangement.moodWeight].some((weight) => !Number.isFinite(weight) || weight < 0 || weight > 100)) throw new Error("智能编排权重无效");
  return project;
}
