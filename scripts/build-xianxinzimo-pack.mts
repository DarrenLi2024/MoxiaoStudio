import { copyFileSync, existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { inspectXianxinSource } from "../packages/xianxinzimo-adapter/src/index";
import { stableStringify } from "../packages/editorial/src/index";

const sourceRoot = resolve(process.argv[2] ?? "../PoetryApp1.0");
const output = resolve(process.argv[3] ?? `artifacts/xianxinzimo-content-${new Date().toISOString().slice(0, 10)}`);
const includeMedia = process.argv.includes("--include-media");

if (existsSync(output) && readdirSync(output).length) throw new Error(`输出目录不是空目录：${output}`);
mkdirSync(join(output, "resources"), { recursive: true });
const source = inspectXianxinSource(sourceRoot);
for (const [name, bytes] of source.files) writeFileSync(join(output, "resources", name), bytes);
writeFileSync(join(output, "manifest.json"), `${stableStringify(source.manifest, 2)}\n`, { encoding: "utf8", mode: 0o600 });
writeFileSync(join(output, "media-manifest.json"), `${stableStringify({ media: source.manifest.media }, 2)}\n`, { encoding: "utf8", mode: 0o600 });

if (includeMedia) {
  for (const item of source.manifest.media) {
    const relativePath = item.path.replace(/^media\//u, "");
    const sourcePath = relativePath.startsWith("Audio/") ? join(source.resourcesDirectory, relativePath) : join(source.root, "PoetryApp", relativePath);
    const targetPath = join(output, "media", relativePath);
    mkdirSync(dirname(targetPath), { recursive: true });
    copyFileSync(sourcePath, targetPath);
  }
}

console.log(`内容包\t${output}`);
console.log(`内容哈希\t${source.manifest.contentHash}`);
console.log(`作品/笺读\t${source.manifest.counts.works}/${source.manifest.counts.readings}`);
console.log(`媒体\t${source.manifest.counts.audio + source.manifest.counts.artwork}${includeMedia ? "（已复制）" : "（仅清单）"}`);
