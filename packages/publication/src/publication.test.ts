import { describe, expect, it } from "vitest";
import { createEntityId } from "@moxiao/domain";
import { chromiumRendererCapabilities, createDefaultFrontMatter, createDefaultPublicationProfile, defaultTheme, electronPrintOptions, literaryFormLabel, migratePublicationProject, preflightPublication, publicationThemes, renderEpub, renderPublicationHtml, validateEpubBytes, validatePdfBytes, validatePublication, validatePublicationProfile, validatePublicationProject, type PublicationDocument, type PublicationProfile, type PublicationProject, type RendererCapabilities } from "./index";

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
      sections: [{ id: createEntityId(), role: "body", title: "春日", blocks: [{ type: "verse", lines: ["春风入砚池"] }, { type: "paragraph", text: "春风吹入砚池", semanticRole: "translation" }] }]
    };
    const draft = { ...createDefaultPublicationProfile(createEntityId()), watermark: { ...createDefaultPublicationProfile(createEntityId()).watermark, enabled: true, content: "内部审校" } };
    const html = renderPublicationHtml(document, draft, [], publicationThemes.qingjian);
    expect(html).toContain("内部审校");
    expect(html).toContain("@top-center");
    expect(html).toContain('counter(page) " 页 · 共 " counter(pages)');
    expect(html).toContain("春风入砚池");
    expect(html).toContain("block-translation");
    expect(electronPrintOptions(draft).pageSize).toBe("A5");
    expect(preflightPublication(draft, chromiumRendererCapabilities).ok).toBe(true);
  });

  it("典藏编号只计算正文篇章，不受前置页数量影响", () => {
    const document: PublicationDocument = {
      id: createEntityId(), expressionId: createEntityId(), expressionHash: "sha256:numbered", title: "编号集", language: "zh-CN",
      sections: [
        { id: createEntityId(), role: "frontmatter", semanticRole: "copyright", title: "版权信息", blocks: [{ type: "paragraph", text: "版权" }] },
        { id: createEntityId(), role: "body", semanticRole: "chapter", title: "第一篇", blocks: [{ type: "paragraph", text: "正文" }] }
      ]
    };
    const html = renderPublicationHtml(document, createDefaultPublicationProfile(createEntityId()), [], publicationThemes.collector);
    expect(html).toContain('<span class="chapter-number">01</span>第一篇');
    expect(html).not.toContain('<span class="chapter-number">01</span>版权信息');
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

  it("拒绝来自渲染进程的畸形或超限出版配置", () => {
    const valid = createDefaultPublicationProfile(createEntityId());
    expect(validatePublicationProfile(valid)).toEqual(valid);
    expect(() => validatePublicationProfile({ ...valid, pageSize: "A0" })).toThrow("纸张");
    expect(() => validatePublicationProfile({ ...valid, watermark: { ...valid.watermark, content: "字".repeat(501) } })).toThrow("过长");
  });

  it("将 1.0 出版项目确定性迁移到 1.2 并迁移单体裁筛选", () => {
    const migrated = migratePublicationProject({
      format: "MOXIAO-PUBLICATION", version: "1.0", id: createEntityId(), title: "旧书稿", subtitle: "", creator: "作者", language: "zh-CN", description: "",
      sortMode: "author-intent", genreFilter: "ci", chronologyFilter: "all", entries: [], assets: [], theme: { ...defaultTheme, id: "elegant" },
      profile: createDefaultPublicationProfile(createEntityId()), target: "pdf", updatedAt: "2026-08-17T12:00:00.000Z"
    });
    expect(migrated).toMatchObject({ version: "1.2", genreFilters: ["ci"], ebookProfile: "universal", apparatusPolicy: "omit", placements: [], theme: { id: "qingjian" } });
    expect(migrated.frontMatter.includeCopyright).toBe(true);
  });

  it("拒绝可注入主题和声明不一致的媒体数据", () => {
    const base = validatePublicationProject({
      format: "MOXIAO-PUBLICATION", version: "1.0", id: createEntityId(), title: "安全书稿", subtitle: "", creator: "作者", language: "zh-CN", description: "",
      sortMode: "author-intent", genreFilter: "all", chronologyFilter: "all", entries: [], assets: [], theme: defaultTheme,
      profile: createDefaultPublicationProfile(createEntityId()), target: "pdf", updatedAt: "2026-08-18T00:00:00.000Z"
    });
    expect(() => validatePublicationProject({ ...base, theme: { ...base.theme, bodyFont: "serif;}body{display:none" } })).toThrow("字体或颜色");
    expect(() => validatePublicationProject({ ...base, assets: [{ id: createEntityId(), kind: "illustration", fileName: "x.png", mediaType: "image/png", dataUri: "data:text/html;base64,QQ==", alt: "图", rights: "owned" }] })).toThrow("媒体类型不一致");
  });

  it("生成具备导航、元数据和章节的 EPUB 3 容器", () => {
    const document: PublicationDocument = {
      id: createEntityId(), expressionId: createEntityId(), expressionHash: "sha256:epub", title: "自选集", language: "zh-CN", creator: "作者",
      sections: [{ id: createEntityId(), role: "body", title: "第一篇", blocks: [{ type: "verse", lines: ["山色入帘青"] }, { type: "annotation", marker: "山色", text: "远山之色" }] }]
    };
    const project: PublicationProject = validatePublicationProject({ format: "MOXIAO-PUBLICATION", version: "1.0", id: createEntityId(), title: "自选集", subtitle: "", creator: "作者", language: "zh-CN", description: "测试电子书", sortMode: "author-intent", genreFilter: "all", chronologyFilter: "all", entries: [], assets: [], theme: defaultTheme, profile: createDefaultPublicationProfile(createEntityId()), target: "epub", updatedAt: "2026-08-17T12:00:00.000Z" });
    expect(validatePublicationProject(project).target).toBe("epub");
    const bytes = renderEpub(document, project);
    expect(validateEpubBytes(bytes)).toMatchObject({ ok: true });
    const output = new TextDecoder("latin1").decode(bytes);
    expect(output).toContain("EPUB/nav.xhtml");
    expect(output).toContain('epub:type="bodymatter"');
    expect(output).toContain('property="rendition:layout">reflowable');
    expect(output).toContain('property="schema:accessMode">textual');
  });

  it("实际体裁代码全部显示中文且未知值不丢失", () => {
    expect(["dayou", "zayan", "siyan", "teshu", "saoti"].map(literaryFormLabel)).toEqual(["打油诗", "杂言", "四言", "特殊体裁", "骚体"]);
    expect(literaryFormLabel("custom-form")).toBe("custom-form");
  });

  it("简介为空时不生成违反 EPUB 3.3 约束的空 description", () => {
    const document: PublicationDocument = { id: createEntityId(), expressionId: createEntityId(), expressionHash: "sha256:empty", title: "无简介选集", language: "zh-CN", sections: [{ id: createEntityId(), role: "body", title: "篇一", blocks: [{ type: "paragraph", text: "正文" }] }] };
    const project: PublicationProject = { format: "MOXIAO-PUBLICATION", version: "1.2", id: createEntityId(), title: "无简介选集", subtitle: "", creator: "", language: "zh-CN", description: "", sortMode: "author-intent", genreFilters: [], chronologyFilter: "all", entries: [], assets: [], placements: [], frontMatter: createDefaultFrontMatter("", "2026"), apparatusPolicy: "omit", arrangement: { genreWeight: 1, chronologyWeight: 1, moodWeight: 1 }, theme: defaultTheme, profile: createDefaultPublicationProfile(createEntityId()), target: "epub", ebookProfile: "universal", updatedAt: "2026-08-17T12:00:00.000Z" };
    const text = new TextDecoder("latin1").decode(renderEpub(document, project));
    expect(text).not.toContain("<dc:description></dc:description>");
  });
});
