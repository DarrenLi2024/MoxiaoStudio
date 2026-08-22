import { describe, expect, it } from "vitest";
import { createNewRecord, createWorkspace } from "@moxiao/editorial";
import { applyAssistantSuggestion, scanLocalEditorial, validateAssistantEndpoint, validateRemoteSuggestionPayload } from "./index";

describe("智校建议协议", () => {
  it("识别题名体裁、系年结构和失配笺注，但不直接修改母本", () => {
    const record = createNewRecord({ title: "七绝·试作", form: "sanwen", body: "江上清风。", sequence: 1 });
    record.draft.chronologyResearch.display = "创作于2023年12月";
    record.draft.chronologyResearch.startYear = null;
    record.draft.chronologyResearch.endYear = null;
    record.draft.chronologyResearch.precision = "unknown";
    record.draft.reading = { annotations: [{ id: "a", anchor: "旧句", note: "旧注" }] };
    const result = scanLocalEditorial([record]);
    expect(result.suggestions.map((item) => item.kind)).toEqual(["metadata", "chronology", "reading-anchor"]);
    expect(record.draft.work.form).toBe("sanwen");
    expect(record.draft.chronologyResearch.startYear).toBeNull();
  });

  it("接受建议前校验母本基线，避免覆盖人工新改动", () => {
    const record = createNewRecord({ title: "七绝·试作", form: "sanwen", body: "江上清风。", sequence: 1 });
    const workspace = createWorkspace("full", [record]);
    const suggestion = scanLocalEditorial([record]).suggestions[0]!;
    expect(applyAssistantSuggestion(workspace, suggestion).records[0]!.draft.work.form).toBe("qijue");
    workspace.records[0]!.draft.work.form = "qilv";
    expect(() => applyAssistantSuggestion(workspace, suggestion)).toThrow("母本已变化");
  });

  it("拒绝模型越权字段和不匹配基线", () => {
    const record = createNewRecord({ title: "试作", form: "sanwen", body: "正文", sequence: 1 });
    const base = { recordId: record.id, kind: "copyedit", summary: "修正", reason: "理由", confidence: 0.8, evidence: [], patches: [] };
    expect(() => validateRemoteSuggestionPayload([{ ...base, patches: [{ path: "operation", before: "add", after: "delete" }] }], [record], "run")).toThrow("越权");
    expect(() => validateRemoteSuggestionPayload([{ ...base, patches: [{ path: "draft.work.title", before: "错误基线", after: "新题" }] }], [record], "run")).toThrow("基线");
  });

  it("远端只允许 HTTPS，本机模型可显式使用 HTTP", () => {
    expect(validateAssistantEndpoint("https://api.example.com/v1/chat/completions")).toBe("https://api.example.com/v1/chat/completions");
    expect(validateAssistantEndpoint("http://localhost:11434/v1/chat/completions")).toBe("http://localhost:11434/v1/chat/completions");
    expect(() => validateAssistantEndpoint("http://example.com/v1")).toThrow("HTTPS");
    expect(() => validateAssistantEndpoint("https://secret@example.com/v1")).toThrow("凭据");
  });
});
