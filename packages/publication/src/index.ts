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
  readonly customPageSizeMm?: readonly [number, number];
  readonly marginsMm?: Readonly<{ top: number; right: number; bottom: number; left: number }>;
  readonly mirrorMargins?: boolean;
  readonly writingMode: "horizontal-tb" | "vertical-rl";
  readonly bleedMm: number;
  readonly cropMarks: boolean;
  readonly watermark: WatermarkOptions;
  readonly runningContent: RunningContentOptions;
  readonly pdfProfile: PdfProfile;
  readonly requireEmbeddedFonts: boolean;
  readonly requireGlyphCoverage: boolean;
}

export interface PdfValidationResult {
  readonly ok: boolean;
  readonly pageCount: number;
  readonly byteLength: number;
  readonly issues: readonly PreflightIssue[];
}

export const chromiumRendererCapabilities: RendererCapabilities = {
  adapterId: "electron-chromium",
  adapterVersion: "1.0.0",
  watermark: true,
  imageWatermark: false,
  watermarkLayers: true,
  runningHeaders: true,
  differentOddEven: false,
  pageCounters: true,
  verticalText: true,
  footnotes: false,
  bleedAndMarks: false,
  fontEmbedding: true,
  glyphPreflight: false,
  cmyk: false,
  pdfProfiles: ["screen"],
  taggedPdf: true
};

export function createDefaultPublicationProfile(id: EntityId, name = "雅正文稿 PDF"): PublicationProfile {
  return {
    id,
    name,
    pageSize: "A5",
    marginsMm: { top: 22, right: 19, bottom: 22, left: 19 },
    mirrorMargins: false,
    writingMode: "horizontal-tb",
    bleedMm: 0,
    cropMarks: false,
    watermark: {
      enabled: false,
      content: "内部审校",
      kind: "text",
      opacity: 0.1,
      rotation: -28,
      placement: "center",
      layer: "under-content",
      pageScope: "all"
    },
    runningContent: {
      enabled: true,
      differentOddEven: false,
      suppressOnFirstPage: true,
      headerTemplate: "{{bookTitle}}",
      footerTemplate: "第 {{page}} 页 · 共 {{pages}} 页",
      pageNumberStyle: "arabic"
    },
    pdfProfile: "screen",
    requireEmbeddedFonts: true,
    requireGlyphCoverage: false
  };
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function cssText(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"').replaceAll("\n", " ");
}

function runningTemplateCss(template: string, title: string): string {
  const resolved = template.replaceAll("{{bookTitle}}", title).replaceAll("{{chapterTitle}}", "");
  return resolved.split(/(\{\{page\}\}|\{\{pages\}\})/gu).filter(Boolean).map((part) => {
    if (part === "{{page}}") return "counter(page)";
    if (part === "{{pages}}") return "counter(pages)";
    return `"${cssText(part)}"`;
  }).join(" ") || '""';
}

function pageDimensions(profile: PublicationProfile): string {
  if (profile.pageSize !== "custom") return profile.pageSize;
  const [width, height] = profile.customPageSizeMm ?? [148, 210];
  return `${width}mm ${height}mm`;
}

function blockHtml(block: PublicationBlock): string {
  if (block.type === "heading") return `<h${block.level}>${escapeHtml(block.text)}</h${block.level}>`;
  if (block.type === "paragraph") return `<p>${escapeHtml(block.text).replaceAll("\n", "<br>")}</p>`;
  if (block.type === "verse") return `<div class="verse">${block.lines.map((line) => `<p>${escapeHtml(line) || "&nbsp;"}</p>`).join("")}</div>`;
  if (block.type === "annotation") return `<aside class="annotation"><b>${escapeHtml(block.marker)}</b>${escapeHtml(block.text)}</aside>`;
  return `<figure data-asset-id="${block.assetId}"><div class="missing-image">插图资源 ${escapeHtml(block.assetId)}</div>${block.caption ? `<figcaption>${escapeHtml(block.caption)}</figcaption>` : ""}</figure>`;
}

export function renderPublicationHtml(document: PublicationDocument, profile: PublicationProfile): string {
  const margins = profile.marginsMm ?? { top: 22, right: 19, bottom: 22, left: 19 };
  const watermark = profile.watermark.enabled && profile.watermark.kind === "text"
    ? `<div class="watermark watermark-${profile.watermark.placement}">${escapeHtml(profile.watermark.content)}</div>`
    : "";
  const header = profile.runningContent.enabled ? runningTemplateCss(profile.runningContent.headerTemplate, document.title) : "none";
  const footer = profile.runningContent.enabled ? runningTemplateCss(profile.runningContent.footerTemplate, document.title) : "none";
  const sections = document.sections.map((section) => `<section class="section section-${section.role}">${section.title ? `<h1>${escapeHtml(section.title)}</h1>` : ""}${section.blocks.map(blockHtml).join("")}</section>`).join("");
  const watermarkPosition = profile.watermark.placement === "corner" ? "right:12mm;bottom:12mm" : "left:50%;top:50%;transform:translate(-50%,-50%) rotate(var(--watermark-rotation))";
  return `<!doctype html>
<html lang="${escapeHtml(document.language)}"><head><meta charset="utf-8"><title>${escapeHtml(document.title)}</title>
<style>
:root{--watermark-opacity:${profile.watermark.opacity};--watermark-rotation:${profile.watermark.rotation}deg}
@page{size:${pageDimensions(profile)};margin:${margins.top}mm ${margins.right}mm ${margins.bottom}mm ${margins.left}mm;${profile.bleedMm ? `bleed:${profile.bleedMm}mm;` : ""}${profile.cropMarks ? "marks:crop cross;" : ""}@top-center{content:${header};font:9px system-ui;color:#7d837c}@bottom-center{content:${footer};font:9px system-ui;color:#7d837c}}
@page:first{@top-center{content:${profile.runningContent.suppressOnFirstPage ? "none" : header}}}
*{box-sizing:border-box}body{margin:0;color:#20241f;background:#fffef9;font-family:"Songti SC","STSong","Noto Serif CJK SC",serif;writing-mode:${profile.writingMode};font-size:11.5pt;line-height:1.9}.section{break-after:page}.section:last-child{break-after:auto}h1,h2,h3{break-after:avoid;font-weight:600;letter-spacing:.08em}h1{font-size:24pt;margin:0 0 18mm;text-align:center}h2{font-size:18pt}h3{font-size:14pt}p{margin:0 0 4mm}.verse{margin:8mm 0;text-align:center;font-size:13pt;line-height:2}.verse p{margin:0}.annotation{margin:5mm 0;padding:4mm;border-left:1.5px solid #759486;background:#f5f7f3;color:#505851}.annotation b{margin-right:2mm;color:#315f4d}.watermark{position:fixed;z-index:${profile.watermark.layer === "under-content" ? "-1" : "20"};${watermarkPosition};opacity:var(--watermark-opacity);color:#315f4d;font:600 25pt system-ui;white-space:nowrap;pointer-events:none}.watermark-tile{inset:0;transform:none;display:grid;place-items:center;background-image:repeating-linear-gradient(-28deg,transparent 0 46mm,rgba(49,95,77,.04) 46mm 48mm)}figure{text-align:center}.missing-image{display:grid;min-height:45mm;place-items:center;border:1px solid #dfe3dc;color:#969d96}figcaption{margin-top:2mm;font-size:9pt;color:#70776f}
</style></head><body>${watermark}<main>${sections}</main></body></html>`;
}

export function electronPrintOptions(profile: PublicationProfile): {
  pageSize: "A4" | "A5" | { width: number; height: number };
  margins: { top: number; right: number; bottom: number; left: number };
  printBackground: true;
  preferCSSPageSize: true;
  generateTaggedPDF: true;
} {
  const margins = profile.marginsMm ?? { top: 22, right: 19, bottom: 22, left: 19 };
  const pageSize = profile.pageSize === "custom"
    ? { width: (profile.customPageSizeMm?.[0] ?? 148) / 25.4, height: (profile.customPageSizeMm?.[1] ?? 210) / 25.4 }
    : profile.pageSize === "B5"
      ? { width: 176 / 25.4, height: 250 / 25.4 }
      : profile.pageSize;
  return {
    pageSize,
    margins: { top: margins.top / 25.4, right: margins.right / 25.4, bottom: margins.bottom / 25.4, left: margins.left / 25.4 },
    printBackground: true,
    preferCSSPageSize: true,
    generateTaggedPDF: true
  };
}

export function validatePdfBytes(bytes: Uint8Array): PdfValidationResult {
  const issues: PreflightIssue[] = [];
  const text = new TextDecoder("latin1").decode(bytes);
  if (!text.startsWith("%PDF-")) issues.push({ severity: "error", code: "pdf.signature.invalid", message: "导出文件缺少 PDF 文件头" });
  if (!text.includes("%%EOF")) issues.push({ severity: "error", code: "pdf.eof.missing", message: "导出文件缺少 PDF 结束标记" });
  const pageCount = [...text.matchAll(/\/Type\s*\/Page(?!s)\b/gu)].length;
  if (!pageCount) issues.push({ severity: "error", code: "pdf.pages.empty", message: "导出文件没有可识别页面" });
  if (bytes.byteLength < 1_024) issues.push({ severity: "error", code: "pdf.size.suspicious", message: "导出文件体积异常" });
  return { ok: !issues.some((issue) => issue.severity === "error"), pageCount, byteLength: bytes.byteLength, issues };
}

export interface PublicationAssetDeclaration {
  readonly id: EntityId;
  readonly mediaType: string;
  readonly rights: "owned" | "licensed" | "public-domain" | "unknown";
  readonly source?: string;
}

export interface RendererCapabilities {
  readonly adapterId: string;
  readonly adapterVersion: string;
  readonly watermark: boolean;
  readonly imageWatermark?: boolean;
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

export function validatePublication(
  document: PublicationDocument,
  profile: PublicationProfile,
  capabilities: RendererCapabilities,
  assets: readonly PublicationAssetDeclaration[] = []
): PreflightResult {
  const issues = [...preflightPublication(profile, capabilities).issues];
  if (!document.title.trim()) issues.push({ severity: "error", code: "document.title.required", message: "出版文档缺少书名" });
  if (!document.sections.length) issues.push({ severity: "error", code: "document.sections.empty", message: "出版文档没有可输出篇章" });
  const assetsById = new Map(assets.map((asset) => [asset.id, asset]));
  for (const section of document.sections) {
    if (!section.blocks.length) issues.push({ severity: "warning", code: "section.blocks.empty", message: `${section.title ?? section.id} 没有正文块` });
    for (const block of section.blocks) {
      const text = block.type === "verse" ? block.lines.join("\n") : block.type === "image" ? block.alt : block.text;
      if (text.includes("\uFFFD")) issues.push({ severity: "error", code: "text.replacement-character", message: `${section.title ?? section.id} 含有无法解码字符` });
      if (block.type !== "image") continue;
      if (!block.alt.trim()) issues.push({ severity: "error", code: "image.alt.required", message: `${section.title ?? section.id} 的插图缺少替代文字` });
      const asset = assetsById.get(block.assetId);
      if (!asset || asset.rights === "unknown") issues.push({ severity: "error", code: "asset.rights.unresolved", message: `${section.title ?? section.id} 的插图尚未确认使用权` });
    }
  }
  return { ok: issues.every((issue) => issue.severity !== "error"), issues };
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
  requireCapability(profile.watermark.enabled && profile.watermark.kind === "image", capabilities.imageWatermark === true, "watermark.image.unsupported", "当前渲染器不支持图片水印");
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
  requireCapability(profile.mirrorMargins === true, capabilities.differentOddEven, "page-margin.mirror.unsupported", "当前渲染器不支持左右页镜像页边距");
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
  if (profile.watermark.enabled && !profile.watermark.content.trim()) {
    issues.push({ severity: "error", code: "watermark.content.required", message: "启用文字水印时必须填写水印内容" });
  }
  if (profile.pageSize === "custom" && (!profile.customPageSizeMm || profile.customPageSizeMm.some((value) => value <= 0))) {
    issues.push({ severity: "error", code: "page-size.invalid", message: "自定义纸张必须填写有效宽度和高度" });
  }
  if ((profile.marginsMm && Object.values(profile.marginsMm).some((value) => value < 0))) {
    issues.push({ severity: "error", code: "page-margin.invalid", message: "页边距不能为负数" });
  }
  if (profile.watermark.pageScope === "range" && !profile.watermark.pageRange) {
    issues.push({ severity: "error", code: "watermark.range.required", message: "指定页码范围水印时必须填写起止页" });
  }

  return { ok: issues.every((issue) => issue.severity !== "error"), issues };
}
