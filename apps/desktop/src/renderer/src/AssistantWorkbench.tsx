import { useEffect, useMemo, useState } from "react";
import { Check, ChevronRight, CircleAlert, Cloud, KeyRound, LoaderCircle, LockKeyhole, ScanSearch, ShieldCheck, Sparkles, X } from "lucide-react";
import type { AssistantFieldPath, AssistantProviderSettings, AssistantRun, AssistantSuggestion } from "@moxiao/assistant";
import type { EditorialRecord, EditorialWorkspace } from "@moxiao/editorial";

interface Props {
  readonly records: readonly EditorialRecord[];
  readonly selectedId: string | null;
  readonly filteredIds: readonly string[];
  readonly onWorkspace: (workspace: EditorialWorkspace) => void;
  readonly onClose: () => void;
}

const pathLabels: Record<AssistantFieldPath, string> = {
  "draft.work.form": "体裁",
  "draft.work.title": "作品题名",
  "draft.work.editorialTitle": "编校题名",
  "draft.work.compositionNote": "创作题注",
  "draft.chronologyResearch.display": "系年显示",
  "draft.chronologyResearch.startYear": "系年起始",
  "draft.chronologyResearch.endYear": "系年结束",
  "draft.chronologyResearch.precision": "系年精度",
  "draft.reading.translation": "今译",
  "draft.reading.appreciation": "赏析"
};

const kindLabels = { metadata: "元数据", chronology: "系年", "reading-anchor": "笺读锚点", copyedit: "文本建议" } as const;

function valueText(value: string | number | null): string {
  return value === null || value === "" ? "（空）" : String(value);
}

export function AssistantWorkbench({ records, selectedId, filteredIds, onWorkspace, onClose }: Props) {
  const [settings, setSettings] = useState<AssistantProviderSettings | null>(null);
  const [suggestions, setSuggestions] = useState<AssistantSuggestion[]>([]);
  const [runs, setRuns] = useState<AssistantRun[]>([]);
  const [scope, setScope] = useState<"selected" | "filtered">("selected");
  const [selectedSuggestionId, setSelectedSuggestionId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [endpoint, setEndpoint] = useState("");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [remoteConsent, setRemoteConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function refresh(): Promise<void> {
    const [nextSettings, nextSuggestions, nextRuns] = await Promise.all([window.moxiao!.assistantSettings(), window.moxiao!.assistantSuggestions(), window.moxiao!.assistantRuns()]);
    setSettings(nextSettings);
    setEndpoint(nextSettings.endpoint);
    setModel(nextSettings.model);
    setSuggestions(nextSuggestions);
    setRuns(nextRuns);
    setSelectedSuggestionId((current) => current && nextSuggestions.some((item) => item.id === current) ? current : nextSuggestions.find((item) => item.status === "pending")?.id ?? nextSuggestions[0]?.id ?? null);
  }

  useEffect(() => { void refresh().catch((error: unknown) => setMessage(error instanceof Error ? error.message : String(error))); }, []);

  const pending = suggestions.filter((item) => item.status === "pending");
  const selectedSuggestion = suggestions.find((item) => item.id === selectedSuggestionId) ?? null;
  const selectedRecord = records.find((record) => record.id === selectedId);
  const recordIds = scope === "selected" ? (selectedRecord ? [selectedRecord.id] : []) : [...filteredIds];
  const scopeSummary = scope === "selected" ? `当前作品《${selectedRecord?.draft.work.editorialTitle || selectedRecord?.draft.work.title || "未选择"}》` : `当前筛选范围 ${recordIds.length} 篇`;
  const statusCounts = useMemo(() => suggestions.reduce<Record<string, number>>((counts, item) => ({ ...counts, [item.status]: (counts[item.status] ?? 0) + 1 }), {}), [suggestions]);

  async function runAudit(): Promise<void> {
    if (!settings || !recordIds.length) return;
    if (settings.engine === "openai-compatible" && !remoteConsent) { setMessage("请先确认本次发送范围"); return; }
    setBusy(true); setMessage("");
    try {
      const result = await window.moxiao!.runAssistant({ recordIds, scope });
      await refresh();
      setSelectedSuggestionId(result.suggestions[0]?.id ?? null);
      setRemoteConsent(false);
      setMessage(result.suggestions.length ? `完成检查，形成 ${result.suggestions.length} 条待审建议` : "检查完成，未发现需要处理的问题");
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  }

  async function decide(decision: "accepted" | "rejected"): Promise<void> {
    if (!selectedSuggestion) return;
    setBusy(true); setMessage("");
    try {
      const result = await window.moxiao!.decideAssistantSuggestion({ suggestionId: selectedSuggestion.id, decision });
      onWorkspace(result.workspace);
      await refresh();
      setMessage(decision === "accepted" ? "建议已写入母本并记录为普通修订" : "建议已拒绝，母本未发生变化");
    } catch (error) { await refresh(); setMessage(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  }

  async function saveSettings(): Promise<void> {
    if (!settings) return;
    setBusy(true); setMessage("");
    try {
      const saved = await window.moxiao!.saveAssistantSettings({ engine: settings.engine, endpoint, model, ...(apiKey.trim() ? { apiKey } : {}) });
      setSettings(saved); setApiKey(""); setShowSettings(false);
      setMessage(saved.engine === "local-rules" ? "已切换为纯本地检查，不会发送正文" : `已保存 ${saved.model} 连接设置${saved.hasCredential ? "与加密凭据" : "；尚未保存密钥"}`);
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  }

  return <section className="assistant-workbench" role="dialog" aria-modal="true" aria-label="智校工作台">
    <header className="assistant-header">
      <div><span className="context-label">MVP2 · 人机协同案卷</span><h2>智校流</h2><p>模型只提交建议，作者决定何时进入母本。</p></div>
      <div className="assistant-header-actions"><button onClick={() => setShowSettings((value) => !value)}><KeyRound size={15} />连接设置</button><button className="icon-button" onClick={onClose} aria-label="关闭智校工作台"><X size={18} /></button></div>
    </header>
    <div className="assistant-grid">
      <aside className="assistant-run-panel">
        <div className="assistant-principle"><ShieldCheck size={18} /><div><strong>作者主权门禁</strong><span>无自动写回 · 有基线冲突保护 · 全程留痕</span></div></div>
        <section><span className="assistant-section-label">检查范围</span><div className="scope-switch"><button className={scope === "selected" ? "is-active" : ""} onClick={() => setScope("selected")}>当前单篇</button><button className={scope === "filtered" ? "is-active" : ""} onClick={() => setScope("filtered")}>筛选范围</button></div><p className="scope-summary">{scopeSummary}</p></section>
        <section><span className="assistant-section-label">运行引擎</span><div className="engine-card">{settings?.engine === "openai-compatible" ? <Cloud size={17} /> : <LockKeyhole size={17} />}<div><strong>{settings?.engine === "openai-compatible" ? settings.model : "墨校台本地检查器"}</strong><span>{settings?.engine === "openai-compatible" ? "用户自带密钥 · 主动发送" : "完全离线 · 不发送正文"}</span></div></div></section>
        {settings?.engine === "openai-compatible" && <label className="remote-consent"><input type="checkbox" checked={remoteConsent} onChange={(event) => setRemoteConsent(event.target.checked)} /><span>确认本次将发送：{scopeSummary}的正文、题注、系年与笺读。密钥和其他作品不会发送。</span></label>}
        <button className="assistant-run-button" disabled={busy || !recordIds.length} onClick={() => void runAudit()}>{busy ? <LoaderCircle className="spin" size={16} /> : <ScanSearch size={16} />}开始结构化智校</button>
        <div className="assistant-history"><span>最近运行</span>{runs.slice(0, 4).map((run) => <div key={run.id}><strong>{run.engine === "local-rules" ? "本地检查" : run.model}</strong><small>{run.contentSummary} · {run.suggestionCount} 条</small></div>)}{!runs.length && <p>尚无运行记录</p>}</div>
      </aside>
      <nav className="assistant-inbox" aria-label="智校建议收件箱">
        <header><div><span>建议收件箱</span><strong>{pending.length} 条待审</strong></div><small>已接受 {statusCounts.accepted ?? 0} · 已拒绝 {statusCounts.rejected ?? 0}</small></header>
        <div className="assistant-suggestion-list">{suggestions.map((item) => <button key={item.id} className={`${item.id === selectedSuggestionId ? "is-selected" : ""} status-${item.status}`} onClick={() => setSelectedSuggestionId(item.id)}><span className="suggestion-kind">{kindLabels[item.kind]}</span><strong>{item.summary}</strong><small>《{item.title}》 · 置信度 {Math.round(item.confidence * 100)}%</small><ChevronRight size={15} /></button>)}{!suggestions.length && <div className="assistant-empty"><Sparkles size={22} /><strong>等待第一次智校</strong><p>建议会在这里排队，不会自动进入作品。</p></div>}</div>
      </nav>
      <article className="assistant-detail">
        {selectedSuggestion ? <>
          <header><div><span className="suggestion-kind">{kindLabels[selectedSuggestion.kind]}</span><h3>{selectedSuggestion.summary}</h3><p>《{selectedSuggestion.title}》</p></div><span className={`suggestion-status status-${selectedSuggestion.status}`}>{{ pending: "待决定", accepted: "已接受", rejected: "已拒绝", conflict: "有冲突" }[selectedSuggestion.status]}</span></header>
          <section className="assistant-reason"><span>判断理由</span><p>{selectedSuggestion.reason}</p>{selectedSuggestion.evidence.map((item) => <blockquote key={item}>{item}</blockquote>)}</section>
          {selectedSuggestion.patches.length ? <section className="assistant-diff"><span>建议差异</span>{selectedSuggestion.patches.map((patch) => <div key={patch.path}><strong>{pathLabels[patch.path]}</strong><div><del>{valueText(patch.before)}</del><span>→</span><ins>{valueText(patch.after)}</ins></div></div>)}</section> : <section className="assistant-review-only"><CircleAlert size={17} /><div><strong>仅提示，不自动修复</strong><p>此项需要回到正文或笺读人工重新锚定，系统不会猜测替代文字。</p></div></section>}
          {selectedSuggestion.status === "pending" && <footer><button disabled={busy} onClick={() => void decide("rejected")}>{selectedSuggestion.patches.length ? "拒绝建议" : "归档提示"}</button>{selectedSuggestion.patches.length > 0 && <button className="primary-button" disabled={busy} onClick={() => void decide("accepted")}><Check size={14} />接受并写入母本</button>}</footer>}
        </> : <div className="assistant-detail-empty"><ScanSearch size={28} /><h3>选择一条建议查看差异</h3><p>置信度只是模型或规则的判断强度，不代表事实已经确认。</p></div>}
      </article>
    </div>
    {showSettings && settings && <div className="assistant-settings" role="group" aria-label="智校连接设置"><header><div><strong>模型连接</strong><span>密钥由系统安全存储加密，不进入项目数据库</span></div><button className="icon-button" onClick={() => setShowSettings(false)}><X size={15} /></button></header><label>运行方式<select value={settings.engine} onChange={(event) => setSettings({ ...settings, engine: event.target.value as AssistantProviderSettings["engine"] })}><option value="local-rules">纯本地检查（推荐起点）</option><option value="openai-compatible">OpenAI-compatible BYOK</option></select></label>{settings.engine === "openai-compatible" && <><label>HTTPS 端点<input value={endpoint} onChange={(event) => setEndpoint(event.target.value)} /></label><label>模型<input value={model} onChange={(event) => setModel(event.target.value)} /></label><label>专用 API 密钥<input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={settings.hasCredential ? "已安全保存；留空表示不更换" : "仅保存在本机系统安全存储"} /></label></>}<button className="primary-button" disabled={busy} onClick={() => void saveSettings()}>保存连接设置</button></div>}
    {message && <div className="assistant-toast" role="status">{message}</div>}
  </section>;
}
