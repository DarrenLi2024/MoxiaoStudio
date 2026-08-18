import type { PublicationAssetDeclaration, PublicationDocument, PublicationProject } from "./index";

export interface EpubValidationResult {
  readonly ok: boolean;
  readonly byteLength: number;
  readonly entryCount: number;
  readonly issues: readonly { severity: "error" | "warning"; code: string; message: string }[];
}

interface ZipEntry { name: string; bytes: Uint8Array; }

const encoder = new TextEncoder();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function u16(value: number): Uint8Array { return Uint8Array.of(value & 255, (value >>> 8) & 255); }
function u32(value: number): Uint8Array { return Uint8Array.of(value & 255, (value >>> 8) & 255, (value >>> 16) & 255, (value >>> 24) & 255); }
function concat(parts: readonly Uint8Array[]): Uint8Array {
  const output = new Uint8Array(parts.reduce((size, part) => size + part.length, 0));
  let offset = 0;
  for (const part of parts) { output.set(part, offset); offset += part.length; }
  return output;
}

function zip(entries: readonly ZipEntry[]): Uint8Array {
  const local: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const checksum = crc32(entry.bytes);
    const localHeader = concat([u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0), u32(checksum), u32(entry.bytes.length), u32(entry.bytes.length), u16(name.length), u16(0), name]);
    local.push(localHeader, entry.bytes);
    central.push(concat([u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0), u32(checksum), u32(entry.bytes.length), u32(entry.bytes.length), u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), name]));
    offset += localHeader.length + entry.bytes.length;
  }
  const directory = concat(central);
  return concat([...local, directory, u32(0x06054b50), u16(0), u16(0), u16(entries.length), u16(entries.length), u32(directory.length), u32(offset), u16(0)]);
}

function xml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

function dataUriBytes(uri: string): Uint8Array | null {
  const match = uri.match(/^data:([^;,]+);base64,(.+)$/su);
  if (!match?.[2]) return null;
  return Uint8Array.from(atob(match[2]), (character) => character.charCodeAt(0));
}

function blockXhtml(block: PublicationDocument["sections"][number]["blocks"][number], assets: ReadonlyMap<string, PublicationAssetDeclaration>, targets: ReadonlyMap<string, string>): string {
  if (block.type === "heading") return `<h${block.level} class="block-${block.semanticRole ?? "heading"}">${xml(block.text)}</h${block.level}>`;
  if (block.type === "paragraph") return `<p class="block-${block.semanticRole ?? "body"}">${xml(block.text).replaceAll("\n", "<br/>")}</p>`;
  if (block.type === "verse") return `<div class="verse">${block.lines.map((line) => `<p>${xml(line) || "&#160;"}</p>`).join("")}</div>`;
  if (block.type === "annotation") return `<aside epub:type="note" class="annotation-${block.semanticRole ?? "annotation"}"><b>${xml(block.marker)}</b> ${xml(block.text)}</aside>`;
  if (block.type === "toc") return `<nav class="book-toc"><ol>${block.entries.map((entry) => `<li>${entry.group ? `<span>${xml(entry.group)}</span>` : ""}<a href="${targets.get(entry.targetId) ?? "nav.xhtml"}">${xml(entry.title)}</a></li>`).join("")}</ol></nav>`;
  const asset = assets.get(block.assetId);
  const focal = block.focalPoint ?? [0.5, 0.5];
  return asset ? `<figure class="image-${block.placement ?? "inline"} image-${block.size ?? "wide"} align-${block.alignment ?? "center"}"><img src="assets/${xml(asset.fileName ?? `${block.assetId}.bin`)}" alt="${xml(block.alt)}" style="object-position:${focal[0] * 100}% ${focal[1] * 100}%"/>${block.caption ? `<figcaption>${xml(block.caption)}</figcaption>` : ""}</figure>` : "";
}

export function renderEpub(document: PublicationDocument, project: PublicationProject, assets: readonly PublicationAssetDeclaration[] = []): Uint8Array {
  const assetMap = new Map(assets.map((asset) => [asset.id, asset]));
  const sectionTargets = new Map(document.sections.map((section, index) => [section.id, `chapter-${index + 1}.xhtml`]));
  const fontFaces = assets.filter((asset) => asset.kind === "font" && asset.fontFamily).map((asset) => `@font-face{font-family:"${asset.fontFamily}";src:url("assets/${asset.fileName}")}`).join("");
  const paragraphMargin = project.theme.paragraphStyle === "first-line-indent" ? "0" : project.theme.density === "compact" ? ".72rem" : project.theme.density === "relaxed" ? "1.18rem" : ".92rem";
  const chapterPadding = project.theme.chapterOpening === "full-page" ? "24vh" : project.theme.chapterOpening === "compact" ? "4vh" : "12vh";
  const css = `${fontFaces}:root{--accent:${project.theme.accentColor}}html{-webkit-text-size-adjust:100%;text-size-adjust:100%}body{margin:0 5%;font-family:${project.theme.bodyFont};font-size:1em;line-height:${project.theme.lineHeight};color:inherit;background:transparent;hyphens:auto}section{max-width:${project.theme.contentWidthEm}em;margin-inline:auto}section[epub\\:type="chapter"]{padding-block-start:${chapterPadding}}h1,h2,h3{break-after:avoid;page-break-after:avoid;font-family:${project.theme.headingFont};color:var(--accent);font-weight:600;line-height:1.35}h1{margin-block:0 1.4em;text-align:${project.theme.titleStyle === "left-modern" ? "left" : "center"};font-size:1.7em}h2{margin-block:2em .8em;font-size:1.28em}p{margin-block:0 ${paragraphMargin};orphans:3;widows:3}.block-body{text-indent:${project.theme.paragraphStyle === "first-line-indent" ? "2em" : "0"}}.verse{margin-block:1.5em;text-align:${project.theme.verseAlignment};line-height:2;break-inside:avoid;page-break-inside:avoid}.verse p{margin:0;text-indent:0}aside{margin-block:1.2em;break-inside:avoid;page-break-inside:avoid;border-inline-start:.12rem solid var(--accent);padding:.6rem 1rem}.block-translation{${project.theme.translationStyle === "panel" ? "padding:1rem;border:.06rem solid currentColor" : project.theme.translationStyle === "rule" ? "padding-inline-start:1rem;border-inline-start:.08rem solid var(--accent)" : ""}}.block-appreciation{${project.theme.appreciationStyle === "panel" ? "padding:1rem;border:.06rem solid currentColor" : project.theme.appreciationStyle === "rule" ? "padding-block-start:1rem;border-block-start:.08rem solid currentColor" : ""}}.book-toc ol{padding:0;list-style:none}.book-toc li{display:flex;gap:1rem;padding:.45rem 0;border-block-end:1px dotted currentColor}.book-toc li span{opacity:.7}.book-toc a{color:inherit;text-decoration:none}figure{text-align:center;break-inside:avoid;page-break-inside:avoid}figure.align-left{text-align:left}figure.align-right{text-align:right}figure.image-small img{max-width:35%}figure.image-medium img{max-width:62%}figure.image-wide img{max-width:100%}figure.image-full-page{break-before:page;break-after:page;page-break-before:always;page-break-after:always}img{max-width:100%;height:auto;object-fit:contain}figcaption{font-size:.82em;opacity:.75}@media(prefers-color-scheme:dark){:root{--accent:#9bc4b1}}`;
  const chapters = document.sections.map((section, index) => ({
    id: `chapter-${index + 1}`,
    file: `chapter-${index + 1}.xhtml`,
    title: section.title || `第 ${index + 1} 篇`,
    semanticRole: section.semanticRole ?? "chapter",
    text: `<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${xml(document.language)}" lang="${xml(document.language)}" dir="ltr"><head><meta charset="utf-8"/><title>${xml(section.title || document.title)}</title><link rel="stylesheet" href="styles.css" type="text/css"/></head><body><section id="${section.id}" epub:type="${section.semanticRole === "copyright" ? "copyright-page" : section.semanticRole === "title-page" ? "titlepage" : section.semanticRole === "foreword" ? "foreword" : section.semanticRole === "toc" ? "toc" : section.semanticRole === "cover" ? "cover" : section.semanticRole === "author-bio" ? "contributors" : section.role === "backmatter" ? "appendix" : "chapter"}">${section.title ? `<h1>${xml(section.title)}</h1>` : ""}${section.blocks.map((block) => blockXhtml(block, assetMap, sectionTargets)).join("")}</section></body></html>`
  }));
  const assetItems = assets.filter((asset) => asset.dataUri).map((asset, index) => `<item id="asset-${index + 1}" href="assets/${xml(asset.fileName ?? `${asset.id}.bin`)}" media-type="${xml(asset.mediaType)}"${asset.kind === "cover" ? ' properties="cover-image"' : ""}/>`).join("");
  const bodyChapters = chapters.filter((chapter) => chapter.semanticRole === "chapter");
  const landmarks = chapters.filter((chapter) => ["cover", "title-page", "copyright", "foreword", "toc", "author-bio"].includes(chapter.semanticRole)).map((chapter) => `<li><a epub:type="${chapter.semanticRole === "copyright" ? "copyright-page" : chapter.semanticRole === "title-page" ? "titlepage" : chapter.semanticRole === "author-bio" ? "contributors" : chapter.semanticRole}" href="${chapter.file}">${xml(chapter.title)}</a></li>`).join("");
  const bodyLandmark = bodyChapters[0] ? `<li><a epub:type="bodymatter" href="${bodyChapters[0].file}">正文</a></li>` : "";
  const nav = `<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${xml(document.language)}" lang="${xml(document.language)}" dir="ltr"><head><meta charset="utf-8"/><title>目录</title></head><body><nav epub:type="toc" id="toc"><h1>目录</h1><ol>${bodyChapters.map((chapter) => `<li><a href="${chapter.file}">${xml(chapter.title)}</a></li>`).join("")}</ol></nav><nav epub:type="landmarks" hidden="hidden"><h2>指南</h2><ol>${landmarks}${bodyLandmark}</ol></nav></body></html>`;
  const description = project.description.trim() ? `<dc:description>${xml(project.description.trim())}</dc:description>` : "";
  const rights = project.frontMatter.copyright.statement.trim() ? `<dc:rights>${xml(project.frontMatter.copyright.statement.trim())}</dc:rights>` : "";
  const publisher = project.frontMatter.copyright.publisher.trim() ? `<dc:publisher>${xml(project.frontMatter.copyright.publisher.trim())}</dc:publisher>` : "";
  const hasImages = assets.some((asset) => asset.kind !== "font" && asset.dataUri);
  const accessibility = `<meta property="schema:accessMode">textual</meta>${hasImages ? '<meta property="schema:accessMode">visual</meta>' : ""}<meta property="schema:accessModeSufficient">textual${hasImages ? ",visual" : ""}</meta><meta property="schema:accessibilityFeature">tableOfContents</meta><meta property="schema:accessibilityFeature">structuralNavigation</meta>${hasImages ? '<meta property="schema:accessibilityFeature">alternativeText</meta>' : ""}<meta property="schema:accessibilityHazard">none</meta>`;
  const opf = `<?xml version="1.0" encoding="utf-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="pub-id" xml:lang="${xml(document.language)}" dir="ltr" prefix="schema: http://schema.org/"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="pub-id">urn:uuid:${project.id}</dc:identifier><dc:title>${xml(document.title)}</dc:title><dc:creator>${xml(project.creator || "未署名")}</dc:creator><dc:language>${xml(document.language)}</dc:language>${description}${rights}${publisher}<meta property="dcterms:modified">${project.updatedAt.replace(/\.\d{3}Z$/u, "Z")}</meta><meta property="rendition:layout">reflowable</meta><meta property="rendition:orientation">auto</meta><meta property="rendition:spread">auto</meta>${accessibility}</metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="css" href="styles.css" media-type="text/css"/>${chapters.map((chapter) => `<item id="${chapter.id}" href="${chapter.file}" media-type="application/xhtml+xml"/>`).join("")}${assetItems}</manifest><spine page-progression-direction="ltr">${chapters.map((chapter) => `<itemref idref="${chapter.id}"/>`).join("")}</spine></package>`;
  const entries: ZipEntry[] = [
    { name: "mimetype", bytes: encoder.encode("application/epub+zip") },
    { name: "META-INF/container.xml", bytes: encoder.encode('<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="EPUB/package.opf" media-type="application/oebps-package+xml"/></rootfiles></container>') },
    { name: "EPUB/package.opf", bytes: encoder.encode(opf) },
    { name: "EPUB/nav.xhtml", bytes: encoder.encode(nav) },
    { name: "EPUB/styles.css", bytes: encoder.encode(css) },
    ...chapters.map((chapter) => ({ name: `EPUB/${chapter.file}`, bytes: encoder.encode(chapter.text) }))
  ];
  for (const asset of assets) {
    const bytes = asset.dataUri ? dataUriBytes(asset.dataUri) : null;
    if (bytes) entries.push({ name: `EPUB/assets/${asset.fileName ?? `${asset.id}.bin`}`, bytes });
  }
  return zip(entries);
}

export function validateEpubBytes(bytes: Uint8Array): EpubValidationResult {
  const text = new TextDecoder("latin1").decode(bytes);
  const issues: Array<{ severity: "error" | "warning"; code: string; message: string }> = [];
  const firstNameLength = (bytes[26] ?? 0) | ((bytes[27] ?? 0) << 8);
  const firstExtraLength = (bytes[28] ?? 0) | ((bytes[29] ?? 0) << 8);
  const mimetypeOffset = 30 + firstNameLength + firstExtraLength;
  if (text.slice(mimetypeOffset, mimetypeOffset + 20) !== "application/epub+zip") issues.push({ severity: "error", code: "epub.mimetype.invalid", message: "EPUB 的首个无压缩条目不是标准 mimetype" });
  for (const required of ["META-INF/container.xml", "EPUB/package.opf", "EPUB/nav.xhtml"]) if (!text.includes(required)) issues.push({ severity: "error", code: "epub.entry.missing", message: `EPUB 缺少 ${required}` });
  const entryCount = [...text.matchAll(/PK\x03\x04/gu)].length;
  if (entryCount < 5) issues.push({ severity: "error", code: "epub.entries.insufficient", message: "EPUB 条目数量异常" });
  return { ok: issues.every((issue) => issue.severity !== "error"), byteLength: bytes.length, entryCount, issues };
}
