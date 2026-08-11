import { describe, expect, it } from "vitest";
import { createEntityId } from "@moxiao/domain";
import { chromiumRendererCapabilities, createDefaultPublicationProfile, electronPrintOptions, preflightPublication, renderPublicationHtml, validatePdfBytes, validatePublication, type PublicationDocument, type PublicationProfile, type RendererCapabilities } from "./index";

const profile: PublicationProfile = {
  id: createEntityId(),
  name: "出版社送审样书",
  pageSize: "A5",
  marginsMm: { top: 22, right: 19, bottom: 22, left: 19 },
  writingMode: "horizontal-tb",
  bleedMm: 3,
  cropMarks: true,
  watermark: {
    enabled: true,
    content: "内部审校 · {{proofId}}",
    kind: "text",
    opacity: 0.14,
    rotation: -28,
    placement: "tile",
    layer: "under-content",
    pageScope: "all"
  },
  runningContent: {
    enabled: true,
    differentOddEven: true,
    suppressOnFirstPage: true,
    headerTemplate: "{{bookTitle}} · {{chapterTitle}}",
    footerTemplate: "{{page}} / {{pages}}",
    pageNumberStyle: "arabic"
  },
  pdfProfile: "PDF/X-4",
  requireEmbeddedFonts: true,
  requireGlyphCoverage: true
};

const professionalRenderer: RendererCapabilities = {
  adapterId: "professional-test",
  adapterVersion: "1.0.0",
  watermark: true,
  imageWatermark: true,
  watermarkLayers: true,
  runningHeaders: true,
  differentOddEven: true,
  pageCounters: true,
  verticalText: true,
  footnotes: true,
  bleedAndMarks: true,
  fontEmbedding: true,
  glyphPreflight: true,
  cmyk: true,
  pdfProfiles: ["screen", "PDF/X-4"],
  taggedPdf: true
};

describe("出版能力预检", () => {
  it("专业渲染器完整满足送审配置", () => {
    expect(preflightPublication(profile, professionalRenderer)).toEqual({ ok: true, issues: [] });
  });

  it("基础渲染器不会静默忽略水印、页眉页脚和印刷规格", () => {
    const basic = {
      ...professionalRenderer,
      watermark: false,
      runningHeaders: false,
      bleedAndMarks: false,
      pdfProfiles: ["screen"] as const
    };
    const result = preflightPublication(profile, basic);

    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      "watermark.unsupported",
      "running-content.unsupported",
      "print-marks.unsupported",
      "pdf-profile.unsupported"
    ]));
  });

  it("同一配置生成分页 HTML、Electron 打印参数与显式水印页眉页脚", () => {
    const document: PublicationDocument = {
      id: createEntityId(), expressionId: createEntityId(), expressionHash: "sha256:test", title: "闲心子墨", language: "zh-CN",
      sections: [{ id: createEntityId(), role: "body", title: "春日", blocks: [{ type: "verse", lines: ["春风入砚池"] }] }]
    };
    const draft = { ...createDefaultPublicationProfile(createEntityId()), watermark: { ...createDefaultPublicationProfile(createEntityId()).watermark, enabled: true, content: "内部审校" } };
    const html = renderPublicationHtml(document, draft);
    expect(html).toContain("内部审校");
    expect(html).toContain("@top-center");
    expect(html).toContain('counter(page) " 页 · 共 " counter(pages)');
    expect(html).toContain("春风入砚池");
    expect(electronPrintOptions(draft).pageSize).toBe("A5");
    expect(preflightPublication(draft, chromiumRendererCapabilities).ok).toBe(true);
  });

  it("验证 PDF 签名、页面与结束标记", () => {
    const valid = new TextEncoder().encode(`%PDF-1.7\n${"x".repeat(1100)}\n/Type /Page\n%%EOF`);
    expect(validatePdfBytes(valid)).toMatchObject({ ok: true, pageCount: 1 });
    expect(validatePdfBytes(new TextEncoder().encode("not-pdf")).ok).toBe(false);
  });

  it("导出验证器阻止版权未确认的插图和乱码进入成品", () => {
    const assetId = createEntityId();
    const document: PublicationDocument = {
      id: createEntityId(), expressionId: createEntityId(), expressionHash: "sha256:test", title: "插图册", language: "zh-CN",
      sections: [{ id: createEntityId(), role: "body", title: "篇一", blocks: [{ type: "image", assetId, alt: "" }, { type: "paragraph", text: "乱码�" }] }]
    };
    const result = validatePublication(document, createDefaultPublicationProfile(createEntityId()), chromiumRendererCapabilities);
    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining(["image.alt.required", "asset.rights.unresolved", "text.replacement-character"]));
  });
});
