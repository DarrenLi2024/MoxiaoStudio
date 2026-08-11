#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { auditRecord, findDuplicates, importLegacyWorkspace } from "../packages/editorial/src/index";

const packagePath = process.argv[2];
if (!packagePath) {
  console.error("用法：pnpm exec tsx scripts/audit-legacy-workspace.mts <审校包.json>");
  process.exit(2);
}

const workspace = importLegacyWorkspace(JSON.parse(readFileSync(resolve(packagePath), "utf8")));
const audits = workspace.records.map(auditRecord);
const changed = audits.filter((item) => item.changed);
const errors = audits.flatMap((item) => item.issues).filter((issue) => issue.level === "error");
const warnings = audits.flatMap((item) => item.issues).filter((issue) => issue.level === "warning");
const duplicates = findDuplicates(workspace.records.filter((record) => record.operation !== "delete"));

console.log(`格式\t${workspace.format} ${workspace.version}`);
console.log(`范围\t${workspace.scope}`);
console.log(`作品\t${workspace.records.length}`);
console.log(`人工变化\t${changed.length}`);
console.log(`结构错误\t${errors.length}`);
console.log(`结构警告\t${warnings.length}`);
console.log(`查重候选\t${duplicates.length}`);
