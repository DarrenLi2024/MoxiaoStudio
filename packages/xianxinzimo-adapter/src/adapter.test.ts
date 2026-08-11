import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { inspectXianxinSource, sourceToEditorialWorkspace, verifySemanticRoundTrip, workspaceToResourceFiles } from "./index";

const temporaryDirectories: string[] = [];

function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), "moxiao-xianxin-"));
  temporaryDirectories.push(root);
  const resources = join(root, "PoetryApp", "Resources");
  mkdirSync(join(resources, "Audio"), { recursive: true });
  mkdirSync(join(root, "PoetryApp", "Assets.xcassets"), { recursive: true });
  const work = { id: "w001-test", seq: 1, title: "试作", form: "qijue", lines: ["第一句"], composedAt: "2023年" };
  writeFileSync(join(resources, "works.json"), JSON.stringify({ meta: { title: "测试" }, works: [work], artworks: [] }));
  for (const name of ["readings", "readings-deep", "readings-standard", "readings-light", "readings-special"]) writeFileSync(join(resources, `${name}.json`), JSON.stringify({ readings: name === "readings" ? { "w001-test": { translation: "今译" } } : {} }));
  writeFileSync(join(resources, "pronunciations.json"), JSON.stringify({ schemaVersion: 1, entries: [{ target: "行" }] }));
  writeFileSync(join(resources, "natural-readings.json"), JSON.stringify({ schemaVersion: 1, tracks: { "w001-test": { file: "test.m4a" } } }));
  writeFileSync(join(resources, "Audio", "test.m4a"), "audio");
  return root;
}

afterEach(() => { for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true }); });

describe("闲心子墨内容适配器", () => {
  it("扫描内容、媒体与校音并完成无损语义往返", () => {
    const source = inspectXianxinSource(fixture(), "2026-08-11T12:00:00.000Z");
    expect(source.manifest.counts).toMatchObject({ works: 1, readings: 1, pronunciations: 1, recitations: 1, audio: 1 });
    const result = verifySemanticRoundTrip(source);
    expect(result).toMatchObject({ ok: true, mismatches: [] });
    expect(result.workspace.records[0]?.draft.reading?.translation).toBe("今译");
  });

  it("回写资源时保留笺读分卷，并落实作品修改与删除", () => {
    const source = inspectXianxinSource(fixture());
    const workspace = sourceToEditorialWorkspace(source);
    workspace.records[0]!.draft.work.title = "试作修订";
    const output = workspaceToResourceFiles(workspace, source);
    expect(JSON.parse(output.get("works.json")!).works[0].title).toBe("试作修订");
    expect(JSON.parse(output.get("readings.json")!).readings["w001-test"].translation).toBe("今译");
    workspace.records[0]!.operation = "delete";
    expect(JSON.parse(workspaceToResourceFiles(workspace, source).get("works.json")!).works).toEqual([]);
  });
});
