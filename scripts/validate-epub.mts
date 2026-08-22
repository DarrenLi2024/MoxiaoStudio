import { spawnSync } from "node:child_process";
import { statSync } from "node:fs";
import { resolve } from "node:path";

const input = process.argv[2];
if (!input) throw new Error("用法：pnpm validate:epub /绝对路径/书稿.epub");
const filePath = resolve(input);
if (!filePath.endsWith(".epub")) throw new Error("待验证文件必须使用 .epub 扩展名");
if (statSync(filePath).size > 500 * 1024 * 1024) throw new Error("EPUB 超过 500 MB 验证上限");

const result = spawnSync("epubcheck", [filePath], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
if (result.error?.message.includes("ENOENT")) throw new Error("找不到 epubcheck；macOS 可执行 brew install epubcheck");
if (output) console.log(output);
if (result.status !== 0) throw new Error(`EPUBCheck 验证失败，退出码 ${result.status ?? "未知"}`);
console.log(`EPUBCheck 验证通过：${filePath}`);
