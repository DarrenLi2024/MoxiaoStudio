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

function blockXhtml(block: PublicationDocument["sections"][number]["blocks"][number], assets: ReadonlyMap<string, PublicationAssetDeclaration>): string {
  if (block.type === "heading") return `<h${block.level}>${xml(block.text)}</h${block.level}>`;
  if (block.type === "paragraph") return `<p>${xml(block.text).replaceAll("\n", "<br/>")}</p>`;
  if (block.type === "verse") return `<div class="verse">${block.lines.map((line) => `<p>${xml(line) || "&#160;"}</p>`).join("")}</div>`;
  if (block.type === "annotation") return `<aside epub:type="note"><b>${xml(block.marker)}</b> ${xml(block.text)}</aside>`;
  const asset = assets.get(block.assetId);
  return asset ? `<figure><img src="assets/${xml(asset.fileName ?? `${block.assetId}.bin`)}" alt="${xml(block.alt)}"/>${block.caption ? `<figcaption>${xml(block.caption)}</figcaption>` : ""}</figure>` : "";
}

export function renderEpub(document: PublicationDocument, project: PublicationProject, assets: readonly PublicationAssetDeclaration[] = []): Uint8Array {
  const assetMap = new Map(assets.map((asset) => [asset.id, asset]));
  const fontFaces = assets.filter((asset) => asset.kind === "font" && asset.fontFamily).map((asset) => `@font-face{font-family:"${asset.fontFamily}";src:url("assets/${asset.fileName}")}`).join("");
  const css = `${fontFaces}body{font-family:${project.theme.bodyFont};font-size:${project.theme.baseFontPt}pt;line-height:${project.theme.lineHeight};color:#20241f}h1,h2,h3{font-family:${project.theme.headingFont};color:${project.theme.accentColor}}.verse{text-align:center;line-height:2}aside{border-left:.15rem solid ${project.theme.accentColor};padding:.6rem 1rem}img{max-width:100%;height:auto}`;
  const chapters = document.sections.map((section, index) => ({
    id: `chapter-${index + 1}`,
    file: `chapter-${index + 1}.xhtml`,
    title: section.title || `第 ${index + 1} 篇`,
    text: `<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${xml(document.language)}"><head><title>${xml(section.title || document.title)}</title><link rel="stylesheet" href="styles.css" type="text/css"/></head><body><section epub:type="chapter">${section.title ? `<h1>${xml(section.title)}</h1>` : ""}${section.blocks.map((block) => blockXhtml(block, assetMap)).join("")}</section></body></html>`
  }));
  const assetItems = assets.filter((asset) => asset.dataUri).map((asset, index) => `<item id="asset-${index + 1}" href="assets/${xml(asset.fileName ?? `${asset.id}.bin`)}" media-type="${xml(asset.mediaType)}"${asset.kind === "cover" ? ' properties="cover-image"' : ""}/>`).join("");
  const nav = `<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${xml(document.language)}"><head><title>目录</title></head><body><nav epub:type="toc"><h1>目录</h1><ol>${chapters.map((chapter) => `<li><a href="${chapter.file}">${xml(chapter.title)}</a></li>`).join("")}</ol></nav></body></html>`;
  const description = project.description.trim() ? `<dc:description>${xml(project.description.trim())}</dc:description>` : "";
  const opf = `<?xml version="1.0" encoding="utf-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="pub-id" xml:lang="${xml(document.language)}"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="pub-id">urn:uuid:${project.id}</dc:identifier><dc:title>${xml(document.title)}</dc:title><dc:creator>${xml(project.creator || "未署名")}</dc:creator><dc:language>${xml(document.language)}</dc:language>${description}<meta property="dcterms:modified">${project.updatedAt.replace(/\.\d{3}Z$/u, "Z")}</meta></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="css" href="styles.css" media-type="text/css"/>${chapters.map((chapter) => `<item id="${chapter.id}" href="${chapter.file}" media-type="application/xhtml+xml"/>`).join("")}${assetItems}</manifest><spine>${chapters.map((chapter) => `<itemref idref="${chapter.id}"/>`).join("")}</spine></package>`;
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
