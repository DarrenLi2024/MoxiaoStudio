import { resolve } from "node:path";
import { inspectXianxinSource, verifySemanticRoundTrip } from "../packages/xianxinzimo-adapter/src/index";

const root = resolve(process.argv[2] ?? "../PoetryApp1.0");
const source = inspectXianxinSource(root);
const roundTrip = verifySemanticRoundTrip(source);
const counts = source.manifest.counts;

console.log(`格式\t${source.manifest.format} ${source.manifest.version}`);
console.log(`内容哈希\t${source.manifest.contentHash}`);
console.log(`作品\t${counts.works}`);
console.log(`笺读\t${counts.readings}`);
console.log(`校音\t${counts.pronunciations}`);
console.log(`朗读轨\t${counts.recitations}`);
console.log(`音频\t${counts.audio}`);
console.log(`插图\t${counts.artwork}`);
console.log(`语义往返\t${roundTrip.ok ? "通过" : `失败：${roundTrip.mismatches.join("、")}`}`);
if (!roundTrip.ok) process.exitCode = 1;
