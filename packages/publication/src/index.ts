import type { ContentHash, EntityId } from "@moxiao/domain";

export type PdfProfile = "screen" | "PDF/X-1a" | "PDF/X-4" | "PDF/A-2b" | "PDF/UA-1";

export interface PublicationDocument {
  readonly id: EntityId;
  readonly expressionId: EntityId;
  readonly expressionHash: ContentHash;
  readonly title: string;
  readonly language: string;
  readonly sections: readonly PublicationSection[];
}

export interface PublicationSection {
  readonly id: EntityId;
  readonly role: "frontmatter" | "body" | "backmatter";
  readonly title?: string;
  readonly blocks: readonly PublicationBlock[];
}

export type PublicationBlock =
  | { readonly type: "heading"; readonly text: string; readonly level: 1 | 2 | 3 }
  | { readonly type: "paragraph"; readonly text: string }
  | { readonly type: "verse"; readonly lines: readonly string[] }
  | { readonly type: "image"; readonly assetId: EntityId; readonly alt: string; readonly caption?: string }
  | { readonly type: "annotation"; readonly marker: string; readonly text: string };

export interface WatermarkOptions {
  readonly enabled: boolean;
  readonly content: string;
  readonly kind: "text" | "image";
  readonly opacity: number;
  readonly rotation: number;
  readonly placement: "center" | "corner" | "tile";
  readonly layer: "under-content" | "over-content";
  readonly pageScope: "all" | "body" | "range";
  readonly pageRange?: readonly [number, number];
}

export interface RunningContentOptions {
  readonly enabled: boolean;
  readonly differentOddEven: boolean;
  readonly suppressOnFirstPage: boolean;
  readonly headerTemplate: string;
  readonly footerTemplate: string;
  readonly pageNumberStyle: "arabic" | "lower-roman" | "upper-roman";
}

export interface PublicationProfile {
  readonly id: EntityId;
  readonly name: string;
  readonly pageSize: "A4" | "A5" | "B5" | "custom";
  readonly writingMode: "horizontal-tb" | "vertical-rl";
  readonly bleedMm: number;
  readonly cropMarks: boolean;
  readonly watermark: WatermarkOptions;
  readonly runningContent: RunningContentOptions;
  readonly pdfProfile: PdfProfile;
  readonly requireEmbeddedFonts: boolean;
  readonly requireGlyphCoverage: boolean;
}

export interface RendererCapabilities {
  readonly adapterId: string;
  readonly adapterVersion: string;
  readonly watermark: boolean;
  readonly watermarkLayers: boolean;
  readonly runningHeaders: boolean;
  readonly differentOddEven: boolean;
  readonly pageCounters: boolean;
  readonly verticalText: boolean;
  readonly footnotes: boolean;
  readonly bleedAndMarks: boolean;
  readonly fontEmbedding: boolean;
  readonly glyphPreflight: boolean;
  readonly cmyk: boolean;
  readonly pdfProfiles: readonly PdfProfile[];
  readonly taggedPdf: boolean;
}

export interface PreflightIssue {
  readonly severity: "error" | "warning";
  readonly code: string;
  readonly message: string;
}

export interface PreflightResult {
  readonly ok: boolean;
  readonly issues: readonly PreflightIssue[];
}

export function preflightPublication(
  profile: PublicationProfile,
  capabilities: RendererCapabilities
): PreflightResult {
  const issues: PreflightIssue[] = [];
  const requireCapability = (requested: boolean, supported: boolean, code: string, message: string) => {
    if (requested && !supported) issues.push({ severity: "error", code, message });
  };

  requireCapability(profile.watermark.enabled, capabilities.watermark, "watermark.unsupported", "当前渲染器不支持水印");
  requireCapability(
    profile.watermark.enabled && profile.watermark.layer === "under-content",
    capabilities.watermarkLayers,
    "watermark.layer.unsupported",
    "当前渲染器不能控制水印层级"
  );
  requireCapability(profile.runningContent.enabled, capabilities.runningHeaders, "running-content.unsupported", "当前渲染器不支持页眉页脚");
  requireCapability(
    profile.runningContent.enabled && profile.runningContent.differentOddEven,
    capabilities.differentOddEven,
    "running-content.odd-even.unsupported",
    "当前渲染器不支持左右页不同的页眉页脚"
  );
  requireCapability(profile.writingMode === "vertical-rl", capabilities.verticalText, "vertical-text.unsupported", "当前渲染器不支持竖排");
  requireCapability(profile.bleedMm > 0 || profile.cropMarks, capabilities.bleedAndMarks, "print-marks.unsupported", "当前渲染器不支持出血或裁切标记");
  requireCapability(profile.requireEmbeddedFonts, capabilities.fontEmbedding, "font-embedding.unsupported", "当前渲染器不能保证嵌入字体");
  requireCapability(profile.requireGlyphCoverage, capabilities.glyphPreflight, "glyph-preflight.unsupported", "当前渲染器不能执行字形覆盖检查");

  if (!capabilities.pdfProfiles.includes(profile.pdfProfile)) {
    issues.push({ severity: "error", code: "pdf-profile.unsupported", message: `当前渲染器不支持 ${profile.pdfProfile}` });
  }
  if (profile.watermark.opacity < 0 || profile.watermark.opacity > 1) {
    issues.push({ severity: "error", code: "watermark.opacity.invalid", message: "水印透明度必须位于 0 到 1 之间" });
  }
  if (profile.watermark.pageScope === "range" && !profile.watermark.pageRange) {
    issues.push({ severity: "error", code: "watermark.range.required", message: "指定页码范围水印时必须填写起止页" });
  }

  return { ok: issues.every((issue) => issue.severity !== "error"), issues };
}
