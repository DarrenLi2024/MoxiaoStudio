import { useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  BookOpenText,
  Check,
  ChevronDown,
  CircleAlert,
  CircleHelp,
  Command,
  FileOutput,
  Filter,
  GalleryVerticalEnd,
  History,
  LibraryBig,
  ListFilter,
  LoaderCircle,
  PanelRightClose,
  Search,
  Settings,
  Sparkles,
  Upload,
  UsersRound,
  X
} from "lucide-react";
import type { EditorialRecord, EditorialWorkspace, ReviewStatus } from "@moxiao/editorial";
import { ontologyVersion } from "@moxiao/ontology";
import type { PreflightIssue, PublicationProfile } from "@moxiao/publication";
import type { DuplicateView } from "../../preload";

type SaveMode = "loading" | "saved" | "dirty" | "saving" | "error" | "conflict";
type DialogMode = "new" | "batch" | "duplicates" | "publication" | null;

const railItems = [
  { label: "文库", icon: LibraryBig, active: true },
  { label: "版本", icon: History },
  { label: "出版", icon: FileOutput },
  { label: "资源", icon: GalleryVerticalEnd },
  { label: "协作", icon: UsersRound }
] as const;

const formLabels: Readonly<Record<string, string>> = {
  qijue: "七绝", wujue: "五绝", qilv: "七律", wulv: "五律", ci: "词",
  xinshi: "新诗", sanwen: "散文", suibi: "随笔", duilian: "对联"
};

function titleOf(record: EditorialRecord): string {
  return record.draft.work.editorialTitle?.trim() || record.draft.work.title.trim() || "未题名";
}

function bodyOf(record: EditorialRecord): string {
  return record.draft.work.prose?.trim() || record.draft.work.lines.join("\n");
}

function chronologyOf(record: EditorialRecord): string {
  return record.draft.chronologyResearch.display.trim() || "未系年";
}

function statusLabel(status: ReviewStatus): string {
  return { pending: "待审校", editing: "编校中", reviewed: "已复校" }[status];
}

function changed(record: EditorialRecord): boolean {
  return record.operation === "add" || record.operation === "delete" || JSON.stringify(record.baseline) !== JSON.stringify(record.draft);
}

export function App() {
  const [workspace, setWorkspace] = useState<EditorialWorkspace | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [formFilter, setFormFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [changedOnly, setChangedOnly] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [runtimeLabel, setRuntimeLabel] = useState("本地模式");
  const [saveMode, setSaveMode] = useState<SaveMode>("loading");
  const [saveError, setSaveError] = useState("");
  const [dialogMode, setDialogMode] = useState<DialogMode>(null);
  const [duplicates, setDuplicates] = useState<DuplicateView[]>([]);
  const [duplicateIndex, setDuplicateIndex] = useState(0);
  const [newTitle, setNewTitle] = useState("");
  const [newForm, setNewForm] = useState("xinshi");
  const [newBody, setNewBody] = useState("");
  const [batchSource, setBatchSource] = useState("");
  const [publicationProfile, setPublicationProfile] = useState<PublicationProfile | null>(null);
  const [publicationHtml, setPublicationHtml] = useState("");
  const [publicationIssues, setPublicationIssues] = useState<readonly PreflightIssue[]>([]);
  const [publicationBusy, setPublicationBusy] = useState(false);
  const [publicationReceipt, setPublicationReceipt] = useState("");
  const editCounter = useRef(0);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let active = true;
    void Promise.all([window.moxiao?.runtime(), window.moxiao?.loadWorkspace()]).then(([runtime, loaded]) => {
      if (!active || !loaded) return;
      setWorkspace(loaded);
      setSelectedId(loaded.records.find((record) => record.operation !== "delete")?.id ?? null);
      setRuntimeLabel(runtime ? `${runtime.platform} · 本地优先` : "本地优先");
      setSaveMode("saved");
    }).catch((error: unknown) => {
      if (!active) return;
      setSaveMode("error");
      setSaveError(error instanceof Error ? error.message : String(error));
    });
    return () => { active = false; };
  }, []);

  const records = useMemo(() => workspace?.records.filter((record) => record.operation !== "delete") ?? [], [workspace]);
  const selected = records.find((record) => record.id === selectedId) ?? records[0] ?? null;
  const filteredRecords = useMemo(() => records.filter((record) => {
    const haystack = `${titleOf(record)}${bodyOf(record)}${formLabels[record.draft.work.form] ?? record.draft.work.form}${chronologyOf(record)}`;
    return haystack.toLocaleLowerCase("zh-CN").includes(query.trim().toLocaleLowerCase("zh-CN"))
      && (formFilter === "all" || record.draft.work.form === formFilter)
      && (statusFilter === "all" || record.editorState.status === statusFilter)
      && (!changedOnly || changed(record));
  }), [records, query, formFilter, statusFilter, changedOnly]);
  const formCounts = useMemo(() => records.reduce<Map<string, number>>((counts, record) => {
    counts.set(record.draft.work.form, (counts.get(record.draft.work.form) ?? 0) + 1);
    return counts;
  }, new Map()), [records]);

  function mutateSelected(mutator: (record: EditorialRecord) => void): void {
    if (!workspace || !selected) return;
    const next = structuredClone(workspace);
    const target = next.records.find((record) => record.id === selected.id);
    if (!target) return;
    mutator(target);
    target.editorState = { status: "editing", updatedAt: new Date().toISOString() };
    editCounter.current += 1;
    setWorkspace(next);
    setSaveMode("dirty");
  }

  async function saveSnapshot(snapshot: EditorialWorkspace, counter: number): Promise<void> {
    if (!window.moxiao) return;
    setSaveMode("saving");
    try {
      const saved = await window.moxiao.saveWorkspace(snapshot);
      setWorkspace((current) => current ? { ...current, revision: saved.revision, savedAt: saved.savedAt } : saved);
      setSaveMode(editCounter.current === counter ? "saved" : "dirty");
      setSaveError("");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setSaveMode(message.includes("修订冲突") ? "conflict" : "error");
      setSaveError(message);
    }
  }

  useEffect(() => {
    if (!workspace || saveMode !== "dirty") return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    const snapshot = structuredClone(workspace);
    const counter = editCounter.current;
    saveTimer.current = setTimeout(() => { void saveSnapshot(snapshot, counter); }, 900);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [workspace, saveMode]);

  async function refreshWorkspace(action: () => Promise<unknown>): Promise<void> {
    try {
      setSaveMode("saving");
      await action();
      const loaded = await window.moxiao!.loadWorkspace();
      setWorkspace(loaded);
      setSelectedId(loaded.records.find((record) => record.operation !== "delete")?.id ?? null);
      setSaveMode("saved");
      setSaveError("");
    } catch (error) {
      setSaveMode("error");
      setSaveError(error instanceof Error ? error.message : String(error));
    }
  }

  async function openDuplicateDialog(): Promise<void> {
    try {
      const result = await window.moxiao!.duplicates();
      setDuplicates(result);
      setDuplicateIndex(0);
      setDialogMode("duplicates");
    } catch (error) {
      setSaveMode("error");
      setSaveError(error instanceof Error ? error.message : String(error));
    }
  }

  async function openPublication(): Promise<void> {
    try {
      setPublicationBusy(true);
      setPublicationReceipt("");
      const preview = await window.moxiao!.publicationPreview();
      setPublicationProfile(preview.profile);
      setPublicationHtml(preview.html);
      setPublicationIssues(preview.preflight.issues);
      setDialogMode("publication");
    } catch (error) {
      setSaveMode("error");
      setSaveError(error instanceof Error ? error.message : String(error));
    } finally {
      setPublicationBusy(false);
    }
  }

  useEffect(() => {
    if (dialogMode !== "publication" || !publicationProfile) return;
    const timer = setTimeout(() => {
      void window.moxiao!.publicationPreview(publicationProfile).then((preview) => {
        setPublicationHtml(preview.html);
        setPublicationIssues(preview.preflight.issues);
      }).catch((error: unknown) => setPublicationReceipt(error instanceof Error ? error.message : String(error)));
    }, 260);
    return () => clearTimeout(timer);
  }, [dialogMode, publicationProfile]);

  async function exportPublication(): Promise<void> {
    if (!publicationProfile) return;
    try {
      setPublicationBusy(true);
      setPublicationReceipt("");
      const receipt = await window.moxiao!.exportPublication(publicationProfile);
      if (!receipt.canceled) setPublicationReceipt(`已导出 ${receipt.validation?.pageCount ?? 0} 页 · ${Math.round((receipt.validation?.byteLength ?? 0) / 1024)} KB · ${receipt.contentHash?.slice(0, 19)}…`);
    } catch (error) {
      setPublicationReceipt(error instanceof Error ? error.message : String(error));
    } finally {
      setPublicationBusy(false);
    }
  }

  async function resolveDuplicate(removeId: string | null): Promise<void> {
    const updated = await window.moxiao!.resolveDuplicate(removeId);
    setWorkspace(updated);
    const remaining = await window.moxiao!.duplicates();
    setDuplicates(remaining);
    setDuplicateIndex((index) => Math.min(index, Math.max(0, remaining.length - 1)));
    setSaveMode("saved");
    if (!remaining.length) setDialogMode(null);
  }

  const currentDuplicate = duplicates[duplicateIndex];

  if (!workspace) {
    return (
      <main className="loading-screen">
        <div className="brand-mark">墨</div>
        {saveMode === "error" ? <><CircleAlert /><strong>本地工作区启动失败</strong><p>{saveError}</p></> : <><LoaderCircle className="spin" /><strong>正在打开文枢工作区</strong></>}
      </main>
    );
  }

  return (
    <main className={`app-shell ${inspectorOpen ? "" : "inspector-collapsed"}`}>
      <aside className="rail" aria-label="工作区导航">
        <div className="brand-mark" aria-label="墨校台">墨</div>
        <nav className="rail-nav">
          {railItems.map((item) => {
            const Icon = item.icon;
            return (
            <button className={`rail-button ${"active" in item && item.active ? "is-active" : ""}`} aria-label={item.label} key={item.label} onClick={item.label === "出版" ? () => void openPublication() : undefined}>
              <Icon size={20} strokeWidth={1.7} /><span>{item.label}</span>
            </button>
          );})}
        </nav>
        <div className="rail-footer">
          <button className="icon-button" aria-label="帮助"><CircleHelp size={19} /></button>
          <button className="icon-button" aria-label="设置"><Settings size={19} /></button>
        </div>
      </aside>

      <section className="library-panel" aria-label="作品目录">
        <header className="project-header">
          <div><span className="context-label">当前项目</span><button className="project-switcher">本地文学项目 <ChevronDown size={14} /></button></div>
          <button className="icon-button bordered" aria-label="导入作品" onClick={() => void refreshWorkspace(() => window.moxiao!.importWorkspace())}><Upload size={17} /></button>
        </header>
        <div className="library-heading">
          <div><h1>一卷通校</h1><p>{records.length} 篇作品 · {records.filter((record) => record.editorState.status === "reviewed").length} 篇已复校</p></div>
          <button className="icon-button" aria-label="查重" onClick={() => void openDuplicateDialog()}><ListFilter size={18} /></button>
        </div>
        <label className="search-field"><Search size={16} aria-hidden="true" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索题名、正文或系年" /><kbd>⌘K</kbd></label>
        <div className="filter-row filter-row-wrap">
          <select aria-label="按体裁筛选" value={formFilter} onChange={(event) => setFormFilter(event.target.value)}>
            <option value="all">全部体裁（{records.length}）</option>
            {[...formCounts.entries()].sort((a, b) => b[1] - a[1]).map(([form, count]) => <option value={form} key={form}>{formLabels[form] ?? form}（{count}）</option>)}
          </select>
          <select aria-label="按审校状态筛选" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="all">全部状态</option><option value="pending">待审校</option><option value="editing">编校中</option><option value="reviewed">已复校</option>
          </select>
          <button className={`filter-button ${changedOnly ? "is-selected" : ""}`} onClick={() => setChangedOnly((value) => !value)}><Filter size={14} /> 有修改</button>
        </div>
        <div className="work-list" role="listbox" aria-label="作品列表">
          {filteredRecords.map((record) => (
            <button key={record.id} className={`work-row ${record.id === selected?.id ? "is-selected" : ""}`} onClick={() => setSelectedId(record.id)} role="option" aria-selected={record.id === selected?.id}>
              <span className="work-row-main"><strong>{titleOf(record)}</strong><span>{formLabels[record.draft.work.form] ?? record.draft.work.form} · {chronologyOf(record)}</span></span>
              <span className={`status-dot status-${statusLabel(record.editorState.status)}`} aria-label={statusLabel(record.editorState.status)} />
            </button>
          ))}
          {!filteredRecords.length && <div className="empty-list"><strong>没有匹配作品</strong><button onClick={() => { setQuery(""); setFormFilter("all"); setStatusFilter("all"); setChangedOnly(false); }}>清除筛选</button></div>}
        </div>
        <div className="library-actions"><button onClick={() => setDialogMode("new")}>＋ 新增作品</button><button onClick={() => setDialogMode("batch")}>批量补录</button></div>
        <button className="clear-workspace-button" onClick={() => {
          if (window.confirm("将先要求保存完整 JSON 备份，再清空当前文稿。是否继续？")) {
            void refreshWorkspace(() => window.moxiao!.clearWorkspace());
          }
        }}>备份并清空文稿</button>
      </section>

      <section className="workspace">
        <header className="topbar">
          <div className="breadcrumb"><span>本地文学项目</span><span>/</span><strong>{selected ? titleOf(selected) : "空工作区"}</strong></div>
          <div className="topbar-actions">
            <button className={`save-state save-${saveMode}`} title={saveError} onClick={() => workspace && void saveSnapshot(structuredClone(workspace), editCounter.current)}>
              {saveMode === "saving" ? <LoaderCircle size={14} className="spin" /> : saveMode === "error" || saveMode === "conflict" ? <CircleAlert size={14} /> : <Check size={14} />}
              {{ loading: "正在打开", saved: "所有更改已保存", dirty: "等待保存", saving: "正在保存", error: "保存失败，点击重试", conflict: "发现修订冲突" }[saveMode]}
            </button>
            <button className="quiet-button" onClick={() => void refreshWorkspace(async () => { await window.moxiao!.createVersion(`定稿 ${workspace.revision}`); })}><Archive size={16} /> 生成版本</button>
            <button className="quiet-button" onClick={() => void refreshWorkspace(() => window.moxiao!.exportWorkspace())}><Upload size={16} /> 导出</button>
            <button className="primary-button" onClick={() => void openPublication()} disabled={publicationBusy}><FileOutput size={16} /> 出版</button>
            <button className="icon-button bordered inspector-toggle" onClick={() => setInspectorOpen((value) => !value)} aria-label="切换语义检查器"><PanelRightClose size={17} /></button>
          </div>
        </header>

        <div className="editor-scroll">
          {selected ? <article className="manuscript-page">
            <div className="document-kicker">{formLabels[selected.draft.work.form] ?? selected.draft.work.form} · {selected.operation === "add" ? "新增草稿" : "母本编校"}</div>
            <input className="title-editor" value={selected.draft.work.title} onChange={(event) => mutateSelected((record) => { record.draft.work.title = event.target.value; })} aria-label="作品题名" />
            <p className="document-meta">本地母本 · {chronologyOf(selected)} · 修订 {workspace.revision}</p>
            <div className="section-rule"><span>正文</span></div>
            <textarea className="body-editor" value={bodyOf(selected)} onChange={(event) => mutateSelected((record) => {
              if (record.draft.work.prose != null) record.draft.work.prose = event.target.value;
              else record.draft.work.lines = event.target.value.split("\n");
            })} aria-label="作品正文" />
            <aside className="composition-note"><span>创作题注</span><textarea value={selected.draft.work.compositionNote ?? ""} onChange={(event) => mutateSelected((record) => { record.draft.work.compositionNote = event.target.value || null; })} placeholder="记录创作缘起、题记或作者自释" /></aside>
            <div className="section-rule"><span>笺读</span></div>
            <div className="reading-placeholder"><BookOpenText size={20} /><div><strong>{selected.draft.reading ? "笺读已经接入母本" : "尚未建立笺读"}</strong><p>{selected.draft.reading?.appreciation?.slice(0, 70) || "可在后续笺读面板编写今译、锚定笺注和赏析。"}</p></div><button>进入笺读</button></div>
          </article> : <div className="empty-workspace"><LibraryBig size={34} /><h2>工作区没有文稿</h2><p>可导入 XZM-EW 审校包，或新增第一篇作品。</p><button className="primary-button" onClick={() => setDialogMode("new")}>新增作品</button></div>}
        </div>
      </section>

      <aside className={`inspector ${inspectorOpen ? "is-open" : ""}`} aria-label="语义检查器">
        <header className="inspector-header"><div><span className="context-label">语义检查器</span><h2>作品属性</h2></div><Sparkles size={18} /></header>
        {selected ? <>
          <section className="inspector-section"><h3>基础信息</h3>
            <label>体裁<select value={selected.draft.work.form} onChange={(event) => mutateSelected((record) => { record.draft.work.form = event.target.value; })}>{Object.entries(formLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
            <label>创作时间<input value={selected.draft.chronologyResearch.display} onChange={(event) => mutateSelected((record) => { record.draft.chronologyResearch.display = event.target.value; })} placeholder="未系年" /></label>
            <label>审校状态<select value={selected.editorState.status} onChange={(event) => mutateSelected((record) => { record.editorState.status = event.target.value as ReviewStatus; })}><option value="pending">待审校</option><option value="editing">编校中</option><option value="reviewed">已复校</option></select></label>
          </section>
          <section className="inspector-section"><div className="section-title-row"><h3>证据与置信度</h3><button>添加</button></div><div className="evidence-card"><span className="evidence-mark">据</span><div><strong>{selected.draft.chronologyResearch.basis.length} 条系年证据</strong><p>{selected.draft.chronologyResearch.editorialNote || "尚未记录编校说明"}</p></div><span className="confidence">{selected.draft.chronologyResearch.certainty === "authorConfirmed" ? "作者确认" : "待核"}</span></div></section>
          <section className="inspector-section"><h3>关系</h3><div className="relation-row"><span>内部实体</span><strong>{selected.entityId.slice(0, 8)}</strong></div><div className="relation-row"><span>操作状态</span><strong>{selected.operation ?? "update"}</strong></div><div className="relation-row"><span>人工变化</span><strong className={changed(selected) ? "warning-text" : ""}>{changed(selected) ? "有" : "无"}</strong></div></section>
          <section className="inspector-section danger-zone"><h3>作品治理</h3><button onClick={() => void refreshWorkspace(async () => { await window.moxiao!.resolveDuplicate(selected.id); })}>标记删除当前作品</button></section>
        </> : <div className="inspector-empty">导入或新增作品后显示语义属性。</div>}
        <footer className="ontology-footnote"><Command size={15} /> {ontologyVersion}</footer>
      </aside>

      <footer className="statusbar"><span><span className="online-dot" /> {runtimeLabel}</span><span>SQLite · WAL</span><span>修订 {workspace.revision}</span><span>{records.length} 篇 · 已删除 {workspace.records.length - records.length}</span><button><Command size={13} /> 命令</button></footer>

      {dialogMode && <div className="dialog-backdrop" role="presentation">
        <section className={`work-dialog ${dialogMode === "duplicates" ? "duplicate-dialog" : dialogMode === "publication" ? "publication-dialog" : ""}`} role="dialog" aria-modal="true" aria-label={{ new: "新增作品", batch: "批量补录", duplicates: "作品查重", publication: "出版中心" }[dialogMode]}>
          <header><div><span className="context-label">本地工作区</span><h2>{{ new: "新增作品", batch: "批量补录", duplicates: "作品查重", publication: "出版中心" }[dialogMode]}</h2></div><button className="icon-button" onClick={() => setDialogMode(null)} aria-label="关闭"><X size={18} /></button></header>
          {dialogMode === "new" && <form onSubmit={(event) => { event.preventDefault(); void refreshWorkspace(() => window.moxiao!.addWork({ title: newTitle, form: newForm, body: newBody })).then(() => { setDialogMode(null); setNewTitle(""); setNewBody(""); }); }}>
            <label>作品题名<input required value={newTitle} onChange={(event) => setNewTitle(event.target.value)} /></label>
            <label>体裁<select value={newForm} onChange={(event) => setNewForm(event.target.value)}>{Object.entries(formLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
            <label>正文<textarea required value={newBody} onChange={(event) => setNewBody(event.target.value)} /></label>
            <footer><button type="button" className="quiet-button" onClick={() => setDialogMode(null)}>取消</button><button className="primary-button">建立草稿</button></footer>
          </form>}
          {dialogMode === "batch" && <form onSubmit={(event) => { event.preventDefault(); void refreshWorkspace(() => window.moxiao!.batchAdd({ source: batchSource, defaultForm: newForm })).then(() => { setDialogMode(null); setBatchSource(""); }); }}>
            <label>默认体裁<select value={newForm} onChange={(event) => setNewForm(event.target.value)}>{Object.entries(formLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
            <label>批量文本<textarea required className="batch-area" value={batchSource} onChange={(event) => setBatchSource(event.target.value)} placeholder={'《第一篇》\n体裁：七绝\n正文……\n---\n第二篇\n正文……'} /></label>
            <p className="dialog-help">使用单独一行 <code>---</code> 分隔作品；第一行作为题名，可用“体裁：七绝”覆盖默认体裁。</p>
            <footer><button type="button" className="quiet-button" onClick={() => setDialogMode(null)}>取消</button><button className="primary-button">智能拆分并补录</button></footer>
          </form>}
          {dialogMode === "duplicates" && <div className="duplicate-content">
            {!currentDuplicate ? <div className="duplicate-empty"><Check size={28} /><h3>没有发现重复候选</h3></div> : <>
              <div className="duplicate-nav"><span>候选 {duplicateIndex + 1} / {duplicates.length}</span><strong>{currentDuplicate.reasons.join(" · ")}</strong><div><button disabled={duplicateIndex === 0} onClick={() => setDuplicateIndex((value) => value - 1)}>上一组</button><button disabled={duplicateIndex === duplicates.length - 1} onClick={() => setDuplicateIndex((value) => value + 1)}>下一组</button></div></div>
              <div className="duplicate-titles"><strong>{currentDuplicate.left.title}</strong><strong>{currentDuplicate.right.title}</strong></div>
              <div className="comparison-grid">{currentDuplicate.comparison.map((row, index) => <div className={`comparison-row ${row.status}`} key={index}><span>{row.left || "∅"}</span><span>{row.right || "∅"}</span></div>)}</div>
              <footer><button className="quiet-button" onClick={() => void resolveDuplicate(null)}>两篇均保留</button><button className="danger-button" onClick={() => void resolveDuplicate(currentDuplicate.right.id)}>保留左篇，删除右篇</button><button className="danger-button" onClick={() => void resolveDuplicate(currentDuplicate.left.id)}>删除左篇，保留右篇</button></footer>
            </>}
          </div>}
          {dialogMode === "publication" && publicationProfile && <div className="publication-content">
            <aside className="publication-controls">
              <label>纸张<select value={publicationProfile.pageSize} onChange={(event) => setPublicationProfile({ ...publicationProfile, pageSize: event.target.value as PublicationProfile["pageSize"] })}><option value="A4">A4</option><option value="A5">A5</option><option value="B5">B5</option></select></label>
              <fieldset><legend>页眉页脚</legend><label className="switch-label"><input type="checkbox" checked={publicationProfile.runningContent.enabled} onChange={(event) => setPublicationProfile({ ...publicationProfile, runningContent: { ...publicationProfile.runningContent, enabled: event.target.checked } })} />启用</label><label>页眉<input value={publicationProfile.runningContent.headerTemplate} onChange={(event) => setPublicationProfile({ ...publicationProfile, runningContent: { ...publicationProfile.runningContent, headerTemplate: event.target.value } })} /></label><label>页脚<input value={publicationProfile.runningContent.footerTemplate} onChange={(event) => setPublicationProfile({ ...publicationProfile, runningContent: { ...publicationProfile.runningContent, footerTemplate: event.target.value } })} /></label></fieldset>
              <fieldset><legend>水印</legend><label className="switch-label"><input type="checkbox" checked={publicationProfile.watermark.enabled} onChange={(event) => setPublicationProfile({ ...publicationProfile, watermark: { ...publicationProfile.watermark, enabled: event.target.checked } })} />启用</label><label>文字<input value={publicationProfile.watermark.content} onChange={(event) => setPublicationProfile({ ...publicationProfile, watermark: { ...publicationProfile.watermark, content: event.target.value } })} /></label><label>位置<select value={publicationProfile.watermark.placement} onChange={(event) => setPublicationProfile({ ...publicationProfile, watermark: { ...publicationProfile.watermark, placement: event.target.value as PublicationProfile["watermark"]["placement"] } })}><option value="center">居中</option><option value="corner">页角</option><option value="tile">平铺</option></select></label><label>透明度<input type="range" min="0.03" max="0.35" step="0.01" value={publicationProfile.watermark.opacity} onChange={(event) => setPublicationProfile({ ...publicationProfile, watermark: { ...publicationProfile.watermark, opacity: Number(event.target.value) } })} /></label></fieldset>
              <label>PDF 规范<select value={publicationProfile.pdfProfile} onChange={(event) => setPublicationProfile({ ...publicationProfile, pdfProfile: event.target.value as PublicationProfile["pdfProfile"] })}><option value="screen">通用屏幕 PDF</option><option value="PDF/X-4">PDF/X-4 印刷</option><option value="PDF/A-2b">PDF/A-2b 归档</option><option value="PDF/UA-1">PDF/UA-1 无障碍</option></select></label>
              <div className={`preflight-card ${publicationIssues.some((issue) => issue.severity === "error") ? "has-errors" : "is-ready"}`}><strong>{publicationIssues.length ? `预检发现 ${publicationIssues.length} 项` : "预检通过，可安全导出"}</strong>{publicationIssues.map((issue) => <p key={issue.code}>{issue.message}</p>)}</div>
              <button className="primary-button export-pdf-button" disabled={publicationBusy || publicationIssues.some((issue) => issue.severity === "error")} onClick={() => void exportPublication()}>{publicationBusy ? <LoaderCircle size={15} className="spin" /> : <FileOutput size={15} />} 导出并验证 PDF</button>
              {publicationReceipt && <p className="publication-receipt">{publicationReceipt}</p>}
            </aside>
            <div className="publication-preview"><div className="preview-toolbar"><span>分页预览</span><span>{publicationProfile.pageSize} · {publicationProfile.pdfProfile}</span></div><iframe title="出版分页预览" sandbox="" srcDoc={publicationHtml} /></div>
          </div>}
        </section>
      </div>}
    </main>
  );
}
