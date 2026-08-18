import type { PublicationProfile } from "./index";
import type { PublicationTarget, PublicationTheme } from "./project";

export const semanticStyleRoles = [
  "base", "book-title", "book-subtitle", "author-name", "chapter-title", "verse-body", "prose-body",
  "composition-note", "translation-title", "translation-body", "annotation-marker", "annotation-body",
  "appreciation-title", "appreciation-body", "caption", "toc-entry", "copyright", "foreword",
  "author-bio", "apparatus", "running-content"
] as const;

export type SemanticStyleRole = typeof semanticStyleRoles[number];
export type TextAlignment = "left" | "center" | "right" | "justify";

export interface StyleProperties {
  readonly fontFamily?: string;
  readonly fontSizePt?: number;
  readonly fontWeight?: 300 | 400 | 500 | 600 | 700;
  readonly lineHeight?: number;
  readonly letterSpacingEm?: number;
  readonly color?: string;
  readonly textAlign?: TextAlignment;
  readonly textIndentEm?: number;
  readonly spaceBeforeEm?: number;
  readonly spaceAfterEm?: number;
  readonly underline?: boolean;
  readonly ruleAbove?: boolean;
  readonly ruleBelow?: boolean;
  readonly border?: boolean;
  readonly backgroundColor?: string;
  readonly borderRadiusPt?: number;
  readonly paddingEm?: number;
}

export type StylePropertyKey = keyof StyleProperties;

export interface SemanticStyleDefinition {
  readonly basedOn?: SemanticStyleRole;
  readonly properties: StyleProperties;
  readonly locks: readonly StylePropertyKey[];
}

export interface PublicationStyleSheet {
  readonly version: "1.0";
  readonly roles: Readonly<Record<SemanticStyleRole, SemanticStyleDefinition>>;
  readonly targetOverrides: Partial<Record<PublicationTarget, Partial<Record<SemanticStyleRole, StyleProperties>>>>;
}

export type PagePresetId = "gbt-a4" | "gbt-a5" | "gbt-b5" | "custom";

export interface LayoutSpecification {
  readonly version: "1.0";
  readonly standardReference: Readonly<{ code: "GB/T 788-1999" | "custom"; edition: "1999" | "custom"; status: "current" | "custom" }>;
  readonly presetId: PagePresetId;
  readonly trimSizeMm: readonly [number, number];
  readonly facingPages: boolean;
  readonly marginsMm: Readonly<{ top: number; bottom: number; inside: number; outside: number }>;
  readonly columns: 1 | 2;
  readonly columnGapMm: number;
  readonly baselineGrid: Readonly<{ enabled: boolean; startMm: number; incrementPt: number }>;
}

export const semanticStyleRoleLabels: Readonly<Record<SemanticStyleRole, string>> = {
  base: "全书基准", "book-title": "书名", "book-subtitle": "副书名", "author-name": "作者署名",
  "chapter-title": "篇章标题", "verse-body": "诗词正文", "prose-body": "散文正文", "composition-note": "创作题注",
  "translation-title": "译文标题", "translation-body": "译文正文", "annotation-marker": "笺注词头", "annotation-body": "笺注正文",
  "appreciation-title": "赏析标题", "appreciation-body": "赏析正文", caption: "图注", "toc-entry": "目录条目",
  copyright: "版权信息", foreword: "前言", "author-bio": "作者简介", apparatus: "校勘附录", "running-content": "页眉页脚"
};

export const stylePropertyLabels: Readonly<Record<StylePropertyKey, string>> = {
  fontFamily: "字体", fontSizePt: "字号", fontWeight: "字重", lineHeight: "行距", letterSpacingEm: "字距", color: "文字颜色",
  textAlign: "对齐", textIndentEm: "首行缩进", spaceBeforeEm: "段前", spaceAfterEm: "段后", underline: "下划线",
  ruleAbove: "上装饰线", ruleBelow: "下装饰线", border: "边框", backgroundColor: "底色", borderRadiusPt: "圆角", paddingEm: "内边距"
};

const stylePropertyKeys = Object.keys(stylePropertyLabels) as StylePropertyKey[];

const definition = (basedOn: SemanticStyleRole | undefined, properties: StyleProperties): SemanticStyleDefinition => basedOn
  ? { basedOn, properties, locks: [] }
  : { properties, locks: [] };

export function createStyleSheetFromTheme(theme: PublicationTheme): PublicationStyleSheet {
  const paragraphSpacing = theme.paragraphStyle === "first-line-indent" ? 0 : theme.density === "compact" ? 0.72 : theme.density === "relaxed" ? 1.18 : 0.92;
  const panel = (enabled: boolean, color: string): StyleProperties => enabled ? { border: true, backgroundColor: color, borderRadiusPt: 2, paddingEm: 1 } : {};
  const rule = (enabled: boolean): StyleProperties => enabled ? { ruleAbove: true, paddingEm: 0.75 } : {};
  return {
    version: "1.0",
    roles: {
      base: definition(undefined, { fontFamily: theme.bodyFont, fontSizePt: theme.baseFontPt, fontWeight: 400, lineHeight: theme.lineHeight, letterSpacingEm: 0, color: "#20241f", textAlign: "left", textIndentEm: 0, spaceBeforeEm: 0, spaceAfterEm: paragraphSpacing }),
      "book-title": definition("base", { fontFamily: theme.headingFont, fontSizePt: 28, fontWeight: 600, lineHeight: 1.35, letterSpacingEm: 0.12, color: theme.accentColor, textAlign: "center", spaceAfterEm: 1.4 }),
      "book-subtitle": definition("base", { fontFamily: theme.headingFont, fontSizePt: 14, fontWeight: 400, letterSpacingEm: 0.08, color: theme.accentColor, textAlign: "center" }),
      "author-name": definition("base", { fontFamily: theme.headingFont, fontSizePt: 12, letterSpacingEm: 0.16, textAlign: "center" }),
      "chapter-title": definition("base", { fontFamily: theme.headingFont, fontSizePt: 24, fontWeight: 600, lineHeight: 1.35, letterSpacingEm: 0.08, color: theme.accentColor, textAlign: theme.titleStyle === "left-modern" ? "left" : "center", spaceAfterEm: 1.4 }),
      "verse-body": definition("base", { fontSizePt: 13, lineHeight: 2, textAlign: theme.verseAlignment, textIndentEm: 0, spaceBeforeEm: 1.5, spaceAfterEm: 1.5 }),
      "prose-body": definition("base", { textAlign: "justify", textIndentEm: theme.paragraphStyle === "first-line-indent" ? 2 : 0, spaceAfterEm: paragraphSpacing }),
      "composition-note": definition("base", { fontSizePt: theme.baseFontPt - 0.5, color: "#505851", ruleAbove: theme.annotationStyle !== "inline", paddingEm: theme.annotationStyle === "inline" ? 0 : 0.8 }),
      "translation-title": definition("base", { fontFamily: theme.headingFont, fontSizePt: 15, fontWeight: 600, color: theme.accentColor, spaceBeforeEm: 1.8, spaceAfterEm: 0.7 }),
      "translation-body": definition("base", { textAlign: "justify", textIndentEm: theme.paragraphStyle === "first-line-indent" ? 2 : 0, ...panel(theme.translationStyle === "panel", "#f5f7f3"), ...rule(theme.translationStyle === "rule") }),
      "annotation-marker": definition("base", { fontWeight: 600, color: theme.accentColor }),
      "annotation-body": definition("base", { fontSizePt: theme.baseFontPt - 0.25, color: "#505851", ...panel(theme.annotationStyle === "panel", "#f5f7f3"), ruleAbove: theme.annotationStyle === "list", paddingEm: theme.annotationStyle === "inline" ? 0 : 0.8 }),
      "appreciation-title": definition("base", { fontFamily: theme.headingFont, fontSizePt: 15, fontWeight: 600, color: theme.accentColor, spaceBeforeEm: 1.8, spaceAfterEm: 0.7 }),
      "appreciation-body": definition("base", { textAlign: "justify", textIndentEm: theme.paragraphStyle === "first-line-indent" ? 2 : 0, ...panel(theme.appreciationStyle === "panel", "#f7f5ef"), ...rule(theme.appreciationStyle === "rule") }),
      caption: definition("base", { fontSizePt: 9, lineHeight: 1.55, color: "#70776f", textAlign: "center", spaceBeforeEm: 0.5 }),
      "toc-entry": definition("base", { fontSizePt: 10.5, lineHeight: 1.7, ruleBelow: true, paddingEm: 0.45 }),
      copyright: definition("base", { fontSizePt: 9.5, lineHeight: 1.7, color: "#505851" }),
      foreword: definition("base", { textAlign: "justify", textIndentEm: 2 }),
      "author-bio": definition("base", { textAlign: "justify", textIndentEm: 2 }),
      apparatus: definition("base", { fontSizePt: 9.5, lineHeight: 1.65, color: "#505851" }),
      "running-content": definition("base", { fontFamily: "system-ui", fontSizePt: 7, lineHeight: 1.2, color: "#7d837c", textAlign: "center" })
    },
    targetOverrides: {}
  };
}

export function resolveSemanticStyle(sheet: PublicationStyleSheet, role: SemanticStyleRole, target?: PublicationTarget): StyleProperties {
  const seen = new Set<SemanticStyleRole>();
  const resolve = (current: SemanticStyleRole): StyleProperties => {
    if (seen.has(current)) throw new Error("语义样式继承存在循环");
    seen.add(current);
    const item = sheet.roles[current];
    const inherited = item.basedOn ? resolve(item.basedOn) : {};
    seen.delete(current);
    return { ...inherited, ...item.properties, ...(target ? sheet.targetOverrides[target]?.[current] : {}) };
  };
  return resolve(role);
}

export function setStyleProperty<K extends StylePropertyKey>(sheet: PublicationStyleSheet, role: SemanticStyleRole, key: K, value: StyleProperties[K] | undefined): PublicationStyleSheet {
  const current = sheet.roles[role];
  const properties = { ...current.properties } as Record<StylePropertyKey, StyleProperties[StylePropertyKey] | undefined>;
  if (value === undefined) delete properties[key];
  else properties[key] = value;
  return { ...sheet, roles: { ...sheet.roles, [role]: { ...current, properties } } };
}

export function toggleStylePropertyLock(sheet: PublicationStyleSheet, role: SemanticStyleRole, key: StylePropertyKey): PublicationStyleSheet {
  const current = sheet.roles[role];
  const locked = current.locks.includes(key);
  const effectiveValue = resolveSemanticStyle(sheet, role)[key];
  const properties = locked || current.properties[key] !== undefined ? current.properties : { ...current.properties, [key]: effectiveValue };
  const locks = locked ? current.locks.filter((item) => item !== key) : [...current.locks, key];
  return { ...sheet, roles: { ...sheet.roles, [role]: { ...current, properties, locks } } };
}

export function applyThemeToStyleSheet(sheet: PublicationStyleSheet, theme: PublicationTheme): PublicationStyleSheet {
  const preset = createStyleSheetFromTheme(theme);
  const roles = Object.fromEntries(semanticStyleRoles.map((role) => {
    const current = sheet.roles[role];
    const next = preset.roles[role];
    const properties = { ...next.properties } as Record<string, unknown>;
    for (const key of current.locks) properties[key] = resolveSemanticStyle(sheet, role)[key];
    return [role, { ...next, properties, locks: [...current.locks] }];
  })) as unknown as Record<SemanticStyleRole, SemanticStyleDefinition>;
  return { ...preset, roles };
}

export function createDefaultLayoutSpecification(pageSize: PublicationProfile["pageSize"] = "A5", customSize?: readonly [number, number]): LayoutSpecification {
  const sizes = { A4: [210, 297], A5: [148, 210], B5: [176, 250] } as const;
  const isStandard = pageSize !== "custom";
  const trimSizeMm = isStandard ? sizes[pageSize] : customSize ?? [148, 210];
  return {
    version: "1.0",
    standardReference: isStandard ? { code: "GB/T 788-1999", edition: "1999", status: "current" } : { code: "custom", edition: "custom", status: "custom" },
    presetId: isStandard ? `gbt-${pageSize.toLowerCase()}` as PagePresetId : "custom",
    trimSizeMm,
    facingPages: false,
    marginsMm: { top: 22, bottom: 22, inside: 19, outside: 19 },
    columns: 1,
    columnGapMm: 6,
    baselineGrid: { enabled: false, startMm: 0, incrementPt: 11.5 * 1.9 }
  };
}

export function validatePublicationStyleSheet(value: unknown): PublicationStyleSheet {
  if (!value || typeof value !== "object") throw new Error("出版语义样式表无效");
  const sheet = structuredClone(value) as PublicationStyleSheet;
  if (sheet.version !== "1.0" || !sheet.roles || !sheet.targetOverrides) throw new Error("出版语义样式表版本无效");
  for (const role of semanticStyleRoles) {
    const item = sheet.roles[role];
    if (!item || !item.properties || !Array.isArray(item.locks)) throw new Error(`语义样式“${semanticStyleRoleLabels[role]}”缺失`);
    if (item.basedOn && !semanticStyleRoles.includes(item.basedOn)) throw new Error("语义样式继承目标无效");
    if (new Set(item.locks).size !== item.locks.length || item.locks.some((key) => !stylePropertyKeys.includes(key))) throw new Error("语义样式锁定项无效");
    validateStyleProperties(item.properties);
    resolveSemanticStyle(sheet, role);
  }
  for (const [target, overrides] of Object.entries(sheet.targetOverrides)) {
    if (!( ["pdf", "epub", "xianxinzimo", "webpub"] as const).includes(target as PublicationTarget) || !overrides || typeof overrides !== "object") throw new Error("目标格式样式覆盖无效");
    for (const [role, properties] of Object.entries(overrides)) {
      if (!semanticStyleRoles.includes(role as SemanticStyleRole)) throw new Error("目标格式样式角色无效");
      validateStyleProperties(properties);
    }
  }
  return sheet;
}

function validateStyleProperties(properties: unknown): asserts properties is StyleProperties {
  if (!properties || typeof properties !== "object" || Object.keys(properties).some((key) => !stylePropertyKeys.includes(key as StylePropertyKey))) throw new Error("语义样式属性无效");
  const p = properties as StyleProperties;
  if (p.fontFamily !== undefined && (!p.fontFamily.trim() || p.fontFamily.length > 300 || /[{};]/u.test(p.fontFamily))) throw new Error("语义样式字体无效");
  if (p.fontSizePt !== undefined && (!Number.isFinite(p.fontSizePt) || p.fontSizePt < 6 || p.fontSizePt > 72)) throw new Error("语义样式字号无效");
  if (p.lineHeight !== undefined && (!Number.isFinite(p.lineHeight) || p.lineHeight < 0.8 || p.lineHeight > 4)) throw new Error("语义样式行距无效");
  if (p.fontWeight !== undefined && !([300, 400, 500, 600, 700] as const).includes(p.fontWeight)) throw new Error("语义样式字重无效");
  if (p.textAlign !== undefined && !( ["left", "center", "right", "justify"] as const).includes(p.textAlign)) throw new Error("语义样式对齐无效");
  for (const key of ["letterSpacingEm", "textIndentEm", "spaceBeforeEm", "spaceAfterEm", "borderRadiusPt", "paddingEm"] as const) if (p[key] !== undefined && (!Number.isFinite(p[key]) || Math.abs(p[key]) > 20)) throw new Error("语义样式尺寸无效");
  for (const color of [p.color, p.backgroundColor]) if (color !== undefined && !/^#[0-9a-f]{6}$/iu.test(color)) throw new Error("语义样式颜色无效");
  for (const key of ["underline", "ruleAbove", "ruleBelow", "border"] as const) if (p[key] !== undefined && typeof p[key] !== "boolean") throw new Error("语义样式装饰值无效");
}

export function validateLayoutSpecification(value: unknown): LayoutSpecification {
  if (!value || typeof value !== "object") throw new Error("版心规格无效");
  const layout = structuredClone(value) as LayoutSpecification;
  if (layout.version !== "1.0" || !(["gbt-a4", "gbt-a5", "gbt-b5", "custom"] as const).includes(layout.presetId)) throw new Error("开本规格无效");
  if (!Array.isArray(layout.trimSizeMm) || layout.trimSizeMm.length !== 2 || layout.trimSizeMm.some((value) => !Number.isFinite(value) || value <= 0 || value > 2_000)) throw new Error("成品尺寸无效");
  if (!layout.marginsMm || Object.values(layout.marginsMm).some((value) => !Number.isFinite(value) || value < 0 || value > 500)) throw new Error("版心边距无效");
  if (![1, 2].includes(layout.columns) || !Number.isFinite(layout.columnGapMm) || layout.columnGapMm < 0 || layout.columnGapMm > 100) throw new Error("分栏设置无效");
  if (!layout.baselineGrid || !Number.isFinite(layout.baselineGrid.startMm) || !Number.isFinite(layout.baselineGrid.incrementPt) || layout.baselineGrid.incrementPt <= 0) throw new Error("基线网格无效");
  return layout;
}
