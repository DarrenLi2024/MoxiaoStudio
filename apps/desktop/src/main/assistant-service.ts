import { existsSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { safeStorage } from "electron";
import { createEntityId } from "@moxiao/domain";
import { digest, stableStringify, type EditorialRecord } from "@moxiao/editorial";
import { scanLocalEditorial, validateAssistantEndpoint, validateRemoteSuggestionPayload, type AssistantProviderSettings, type AssistantRun, type AssistantRunResult } from "@moxiao/assistant";

interface StoredSettings {
  readonly engine: AssistantProviderSettings["engine"];
  readonly endpoint: string;
  readonly model: string;
}

const defaultSettings: StoredSettings = { engine: "local-rules", endpoint: "https://api.openai.com/v1/chat/completions", model: "gpt-5-mini" };

function atomicWrite(path: string, bytes: string | Uint8Array): void {
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, bytes, { mode: 0o600 });
  renameSync(temporary, path);
}

export class AssistantService {
  private readonly settingsPath: string;
  private readonly credentialPath: string;

  constructor(userDataPath: string) {
    this.settingsPath = join(userDataPath, "assistant-settings.json");
    this.credentialPath = join(userDataPath, "assistant-credential.bin");
  }

  settings(): AssistantProviderSettings {
    let stored = defaultSettings;
    if (existsSync(this.settingsPath)) {
      try {
        const value = JSON.parse(readFileSync(this.settingsPath, "utf8")) as StoredSettings;
        if ((value.engine === "local-rules" || value.engine === "openai-compatible") && typeof value.endpoint === "string" && typeof value.model === "string") stored = value;
      } catch { /* 损坏设置安全降级到纯本地，不阻断工作区。 */ }
    }
    return { ...stored, hasCredential: existsSync(this.credentialPath) && statSync(this.credentialPath).size > 0 };
  }

  saveSettings(input: { engine: AssistantProviderSettings["engine"]; endpoint: string; model: string; apiKey?: string; clearCredential?: boolean }): AssistantProviderSettings {
    if (input.engine !== "local-rules" && input.engine !== "openai-compatible") throw new Error("智校引擎无效");
    const endpoint = validateAssistantEndpoint(input.endpoint || defaultSettings.endpoint);
    const model = input.model.trim();
    if (!model || model.length > 200) throw new Error("模型名称为空或过长");
    atomicWrite(this.settingsPath, `${stableStringify({ engine: input.engine, endpoint, model }, 2)}\n`);
    if (input.clearCredential) atomicWrite(this.credentialPath, new Uint8Array());
    if (input.apiKey?.trim()) {
      if (!safeStorage.isEncryptionAvailable()) throw new Error("当前系统安全存储不可用，拒绝保存模型密钥");
      atomicWrite(this.credentialPath, safeStorage.encryptString(input.apiKey.trim()));
    }
    return this.settings();
  }

  async run(records: readonly EditorialRecord[], scope: AssistantRun["scope"]): Promise<AssistantRunResult> {
    const settings = this.settings();
    if (settings.engine === "local-rules") return scanLocalEditorial(records, scope);
    if (!settings.hasCredential || !safeStorage.isEncryptionAvailable()) throw new Error("尚未安全保存模型密钥");
    const encrypted = readFileSync(this.credentialPath);
    if (!encrypted.byteLength) throw new Error("模型密钥已清除");
    const apiKey = safeStorage.decryptString(encrypted);
    const now = new Date().toISOString();
    const runId = createEntityId();
    const payload = records.map((record) => ({
      recordId: record.id,
      title: record.draft.work.editorialTitle || record.draft.work.title,
      form: record.draft.work.form,
      body: record.draft.work.prose || record.draft.work.lines.join("\n"),
      compositionNote: record.draft.work.compositionNote,
      chronology: record.draft.chronologyResearch,
      reading: record.draft.reading
    }));
    const response = await fetch(validateAssistantEndpoint(settings.endpoint), {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: settings.model,
        temperature: 0.1,
        messages: [
          { role: "system", content: "你是中文文学编校助手。只返回 JSON，不直接定稿。返回 {suggestions:[...]}。每项字段为 recordId, kind(metadata|chronology|reading-anchor|copyedit), summary, reason, confidence, evidence, patches。patches 只允许用户提供的 allowedPaths，且 before 必须与输入完全一致。没有可靠建议时返回空数组。" },
          { role: "user", content: JSON.stringify({ allowedPaths: ["draft.work.form", "draft.work.title", "draft.work.editorialTitle", "draft.work.compositionNote", "draft.chronologyResearch.display", "draft.chronologyResearch.startYear", "draft.chronologyResearch.endYear", "draft.chronologyResearch.precision", "draft.reading.translation", "draft.reading.appreciation"], records: payload }) }
        ]
      }),
      signal: AbortSignal.timeout(90_000)
    });
    if (!response.ok) throw new Error(`模型服务请求失败（HTTP ${response.status}）`);
    const responseText = await response.text();
    if (responseText.length > 5_000_000) throw new Error("模型响应超过 5 MB 安全上限");
    let envelope: { choices?: Array<{ message?: { content?: string } }> };
    try { envelope = JSON.parse(responseText) as typeof envelope; } catch { throw new Error("模型服务响应不是有效 JSON"); }
    const content = envelope.choices?.[0]?.message?.content;
    if (!content) throw new Error("模型服务没有返回可解析内容");
    let parsed: unknown;
    try { parsed = JSON.parse(content); } catch { throw new Error("模型返回的不是有效 JSON"); }
    const candidate = parsed && typeof parsed === "object" && "suggestions" in parsed ? (parsed as { suggestions: unknown }).suggestions : parsed;
    const suggestions = validateRemoteSuggestionPayload(candidate, records, runId, now);
    const inputHash = digest(payload);
    return {
      run: { id: runId, engine: "openai-compatible", model: settings.model, scope, recordIds: records.map((record) => record.id), inputHash, contentSummary: `${records.length} 篇；正文、题注、系年与笺读`, status: "completed", createdAt: now, completedAt: new Date().toISOString(), suggestionCount: suggestions.length },
      suggestions
    };
  }
}
