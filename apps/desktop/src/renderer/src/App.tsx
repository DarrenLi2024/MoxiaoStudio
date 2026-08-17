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
  GripVertical,
  History,
  ImagePlus,
  LibraryBig,
  ListFilter,
  Lock,
  LoaderCircle,
  PanelRightClose,
  Search,
  Settings,
  Sparkles,
  Undo2,
  Upload,
  UsersRound,
  X
} from "lucide-react";
import type { EditorialRecord, EditorialWorkspace, ReviewStatus } from "@moxiao/editorial";
import { ontologyVersion } from "@moxiao/ontology";
import { applyArrangementProposal, publicationThemes, restoreArrangement, type ArrangementProposal, type PreflightIssue, type PublicationAsset, type PublicationProject } from "@moxiao/publication";
import type { DuplicateView } from "../../preload";

type SaveMode = "loading" | "saved" | "dirty" | "saving" | "error" | "conflict";
type DialogMode = "new" | "batch" | "duplicates" | "publication" | null;
type EditorMode = "manuscript" | "reading";
type PublicationStep = "book" | "arrange" | "frontmatter" | "style" | "media" | "export";

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
  const [inspectorOpen, setInspectorOpen] = useState(() => !window.matchMedia("(max-width: 1240px)").matches);
  const [runtimeLabel, setRuntimeLabel] = useState("本地模式");
  const [saveMode, setSaveMode] = useState<SaveMode>("loading");
  const [saveError, setSaveError] = useState("");
  const [dialogMode, setDialogMode] = useState<DialogMode>(null);
  const [editorMode, setEditorMode] = useState<EditorMode>("manuscript");
  const [duplicates, setDuplicates] = useState<DuplicateView[]>([]);
  const [duplicateIndex, setDuplicateIndex] = useState(0);
  const [newTitle, setNewTitle] = useState("");
  const [newForm, setNewForm] = useState("xinshi");
  const [newBody, setNewBody] = useState("");
  const [batchSource, setBatchSource] = useState("");
  const [publicationProject, setPublicationProject] = useState<PublicationProject | null>(null);
  const [publicationProjects, setPublicationProjects] = useState<PublicationProject[]>([]);
  const [publicationHtml, setPublicationHtml] = useState("");
  const [publicationIssues, setPublicationIssues] = useState<readonly PreflightIssue[]>([]);
  const [publicationBusy, setPublicationBusy] = useState(false);
  const [publicationReceipt, setPublicationReceipt] = useState("");
  const [publicationStep, setPublicationStep] = useState<PublicationStep>("book");
  const [publicationRecordId, setPublicationRecordId] = useState<string | null>(null);
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

  useEffect(() => {
    const narrowLayout = window.matchMedia("(max-width: 1240px)");
    const collapseInspector = (event: MediaQueryListEvent) => {
      if (event.matches) setInspectorOpen(false);
    };
    narrowLayout.addEventListener("change", collapseInspector);
    return () => narrowLayout.removeEventListener("change", collapseInspector);
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
      const projects = await window.moxiao!.publicationProjects();
      const project = projects[0] ?? await window.moxiao!.publicationProject();
      const preview = await window.moxiao!.publicationPreview(project);
      setPublicationProjects(projects.length ? projects : [project]);
      setPublicationProject(preview.project);
      setPublicationRecordId(preview.project.entries.find((entry) => entry.included)?.recordId ?? null);
      setPublicationHtml(preview.html);
      setPublicationIssues(preview.preflight.issues);
      setDialogMode("publication");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setPublicationProject(null);
      setPublicationReceipt(`出版中心无法打开：${message}`);
      setDialogMode("publication");
    } finally {
      setPublicationBusy(false);
    }
  }

  useEffect(() => {
    if (dialogMode !== "publication" || !publicationProject) return;
    const timer = setTimeout(() => {
      void window.moxiao!.savePublicationProject(publicationProject).then((saved) => window.moxiao!.publicationPreview(saved)).then((preview) => {
        setPublicationHtml(preview.html);
        setPublicationIssues(preview.preflight.issues);
      }).catch((error: unknown) => setPublicationReceipt(error instanceof Error ? error.message : String(error)));
    }, 420);
    return () => clearTimeout(timer);
  }, [dialogMode, publicationProject]);

  async function exportPublication(): Promise<void> {
    if (!publicationProject) return;
    try {
      setPublicationBusy(true);
      setPublicationReceipt("");
      const receipt = await window.moxiao!.exportPublication(publicationProject);
      if (!receipt.canceled) setPublicationReceipt(`已导出 ${receipt.validation?.pageCount ? `${receipt.validation.pageCount} 页` : `${receipt.validation?.entryCount ?? 0} 个条目`} · ${Math.round((receipt.validation?.byteLength ?? 0) / 1024)} KB · ${receipt.contentHash?.slice(0, 19)}…`);
    } catch (error) {
      setPublicationReceipt(error instanceof Error ? error.message : String(error));
    } finally {
      setPublicationBusy(false);
    }
  }

  function updatePublication(mutator: (project: PublicationProject) => PublicationProject): void {
    if (!publicationProject) return;
    const next = mutator(structuredClone(publicationProject));
    setPublicationProject(next);
    setPublicationProjects((projects) => projects.map((project) => project.id === next.id ? next : project));
    setPublicationReceipt("");
  }

  function movePublicationEntry(recordId: string, direction: -1 | 1): void {
    updatePublication((project) => {
      const ordered = [...project.entries].sort((a, b) => a.manualOrder - b.manualOrder);
      const index = ordered.findIndex((entry) => entry.recordId === recordId);
      const swap = index + direction;
      if (index < 0 || swap < 0 || swap >= ordered.length) return project;
      const currentOrder = ordered[index]!.manualOrder;
      ordered[index] = { ...ordered[index]!, manualOrder: ordered[swap]!.manualOrder };
      ordered[swap] = { ...ordered[swap]!, manualOrder: currentOrder };
      return { ...project, entries: ordered };
    });
  }

  async function addPublicationAsset(kind: PublicationAsset["kind"], attachedRecordId?: string): Promise<void> {
    try {
      const result = await window.moxiao!.selectPublicationAsset({ kind, ...(attachedRecordId ? { attachedRecordId } : {}) });
      if (result.canceled || !result.asset) return;
      updatePublication((project) => ({
        ...project,
        assets: [...project.assets.filter((asset) => (kind !== "cover" || asset.kind !== "cover") && (kind !== "portrait" || asset.kind !== "portrait")), result.asset!],
        frontMatter: kind === "portrait" ? { ...project.frontMatter, author: { ...project.frontMatter.author, portraitAssetId: result.asset!.id } } : project.frontMatter,
        placements: kind === "illustration" && attachedRecordId ? [...project.placements, { assetId: result.asset!.id, recordId: attachedRecordId, role: "chapter-opening", alignment: "center", size: "wide", focalPoint: [0.5, 0.5] }] : project.placements
      }));
    } catch (error) {
      setPublicationReceipt(error instanceof Error ? error.message : String(error));
    }
  }

  async function regenerateFrontMatter(): Promise<void> {
    if (!publicationProject) return;
    try {
      const generated = await window.moxiao!.generatePublicationFrontMatter(publicationProject);
      setPublicationProject(generated);
      setPublicationProjects((projects) => projects.map((project) => project.id === generated.id ? generated : project));
      setPublicationReceipt("已根据当前篇目、体裁与系年重新生成前言和作者简介草稿");
    } catch (error) {
      setPublicationReceipt(error instanceof Error ? error.message : String(error));
    }
  }

  async function proposePublicationArrangement(strategy: ArrangementProposal["strategy"]): Promise<void> {
    if (!publicationProject) return;
    try {
      const proposed = await window.moxiao!.proposePublicationArrangement(publicationProject, strategy);
      setPublicationProject(proposed);
      setPublicationProjects((projects) => projects.map((project) => project.id === proposed.id ? proposed : project));
      setPublicationReceipt(`已生成${{ genre: "体裁", "chronology-asc": "系年正序", "chronology-desc": "系年倒序", mood: "意境", hybrid: "综合" }[strategy]}编排候选，确认后才会应用`);
    } catch (error) {
      setPublicationReceipt(error instanceof Error ? error.message : String(error));
    }
  }

  async function createPublicationProject(): Promise<void> {
    const title = window.prompt("请输入新书稿项目名称", "新的文学选集")?.trim();
    if (!title) return;
    try {
      const project = await window.moxiao!.createPublicationProject(title);
      setPublicationProjects((projects) => [project, ...projects]);
      setPublicationProject(project);
    } catch (error) {
      setPublicationReceipt(error instanceof Error ? error.message : String(error));
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
            <div className="editor-mode-switch" role="tablist" aria-label="编校内容"><button role="tab" aria-selected={editorMode === "manuscript"} className={editorMode === "manuscript" ? "is-active" : ""} onClick={() => setEditorMode("manuscript")}>正文与题注</button><button role="tab" aria-selected={editorMode === "reading"} className={editorMode === "reading" ? "is-active" : ""} onClick={() => {
              if (!selected.draft.reading) mutateSelected((record) => { record.draft.reading = { translation: "", annotations: [], appreciation: "", textualNotes: [], editionNote: "", reviewNote: "" }; record.draft.readingSource ??= "readings.json"; });
              setEditorMode("reading");
            }}><BookOpenText size={14} />笺读编校</button></div>
            {editorMode === "manuscript" ? <>
              <div className="section-rule"><span>正文</span></div>
              <textarea className="body-editor" value={bodyOf(selected)} onChange={(event) => mutateSelected((record) => {
                if (record.draft.work.prose != null) record.draft.work.prose = event.target.value;
                else record.draft.work.lines = event.target.value.split("\n");
              })} aria-label="作品正文" />
              <aside className="composition-note"><span>创作题注</span><textarea value={selected.draft.work.compositionNote ?? ""} onChange={(event) => mutateSelected((record) => { record.draft.work.compositionNote = event.target.value || null; })} placeholder="记录创作缘起、题记或作者自释" /></aside>
              <div className="section-rule"><span>笺读</span></div>
              <div className="reading-placeholder"><BookOpenText size={20} /><div><strong>{selected.draft.reading ? "笺读已经接入母本" : "尚未建立笺读"}</strong><p>{selected.draft.reading?.appreciation?.slice(0, 70) || "可编写今译、锚定笺注、赏析、校勘记和版本说明。"}</p></div><button onClick={() => setEditorMode("reading")}>进入笺读</button></div>
            </> : <div className="reading-editor">
              <section className="reading-source"><header><span>正文参照</span><small>选择原文片段后，可复制到笺注锚点</small></header><pre>{bodyOf(selected)}</pre></section>
              <section className="reading-field"><label htmlFor="reading-translation">今译</label><textarea id="reading-translation" value={selected.draft.reading?.translation ?? ""} onChange={(event) => mutateSelected((record) => { record.draft.reading ??= {}; record.draft.reading.translation = event.target.value; })} placeholder="用当代汉语疏通文意；没有必要时可以留空。" /></section>
              <section className="reading-field annotations-editor"><header><div><strong>锚定笺注</strong><small>锚点必须是正文中实际存在的词句</small></div><button onClick={() => mutateSelected((record) => { record.draft.reading ??= {}; record.draft.reading.annotations ??= []; record.draft.reading.annotations.push({ id: crypto.randomUUID(), anchor: record.draft.work.lines.find((line) => line.trim())?.trim() || record.draft.work.prose?.split("\n").find((line) => line.trim())?.trim() || "", note: "", source: "" }); })}>＋ 添加笺注</button></header>
                {(selected.draft.reading?.annotations ?? []).map((annotation, index) => <div className="annotation-editor-row" key={annotation.id ?? `${annotation.anchor}-${index}`}><GripVertical size={15} aria-hidden="true" /><label>原文锚点<input aria-label={`第${index + 1}条笺注锚点`} value={annotation.anchor} onChange={(event) => mutateSelected((record) => { record.draft.reading!.annotations![index]!.anchor = event.target.value; })} /></label><label>笺注<textarea aria-label={`第${index + 1}条笺注内容`} value={annotation.note} onChange={(event) => mutateSelected((record) => { record.draft.reading!.annotations![index]!.note = event.target.value; })} /></label><label>出处<input aria-label={`第${index + 1}条笺注出处`} value={annotation.source ?? ""} onChange={(event) => mutateSelected((record) => { record.draft.reading!.annotations![index]!.source = event.target.value || null; })} /></label><button className="remove-reading-item" aria-label={`删除第${index + 1}条笺注`} onClick={() => mutateSelected((record) => { record.draft.reading!.annotations!.splice(index, 1); })}>删除</button></div>)}
                {!(selected.draft.reading?.annotations?.length) && <p className="reading-empty">尚无逐词笺注。可直接完成今译与赏析，也可以按需建立原文锚点。</p>}
              </section>
              <section className="reading-field"><label htmlFor="reading-appreciation">赏析</label><textarea id="reading-appreciation" className="reading-long" value={selected.draft.reading?.appreciation ?? ""} onChange={(event) => mutateSelected((record) => { record.draft.reading ??= {}; record.draft.reading.appreciation = event.target.value; })} placeholder="结合语境、章法、意象、典故和作者创作意图展开赏析。" /></section>
              <section className="reading-field textual-notes"><header><div><strong>校勘记</strong><small>记录异文、误读修正和考据依据</small></div><button onClick={() => mutateSelected((record) => { record.draft.reading ??= {}; record.draft.reading.textualNotes ??= []; record.draft.reading.textualNotes.push({ id: crypto.randomUUID(), title: "校勘记", note: "", source: "" }); })}>＋ 添加校勘记</button></header>{(selected.draft.reading?.textualNotes ?? []).map((note, index) => <div className="textual-note-row" key={note.id ?? index}><input aria-label={`第${index + 1}条校勘记题名`} value={note.title ?? ""} onChange={(event) => mutateSelected((record) => { record.draft.reading!.textualNotes![index]!.title = event.target.value; })} /><textarea aria-label={`第${index + 1}条校勘记内容`} value={note.note} onChange={(event) => mutateSelected((record) => { record.draft.reading!.textualNotes![index]!.note = event.target.value; })} /><button className="remove-reading-item" onClick={() => mutateSelected((record) => { record.draft.reading!.textualNotes!.splice(index, 1); })}>删除</button></div>)}</section>
              <div className="reading-two-column"><section className="reading-field"><label htmlFor="edition-note">版本说明</label><textarea id="edition-note" value={selected.draft.reading?.editionNote ?? ""} onChange={(event) => mutateSelected((record) => { record.draft.reading ??= {}; record.draft.reading.editionNote = event.target.value; })} /></section><section className="reading-field"><label htmlFor="review-note">审校说明</label><textarea id="review-note" value={selected.draft.reading?.reviewNote ?? ""} onChange={(event) => mutateSelected((record) => { record.draft.reading ??= {}; record.draft.reading.reviewNote = event.target.value; })} /></section></div>
            </div>}
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
          {dialogMode === "publication" && !publicationProject && <div className="publication-load-error" role="alert"><CircleAlert size={24} /><div><strong>出版中心暂时无法打开</strong><p>{publicationReceipt || "请关闭后重试；若问题持续，请导出备份并联系维护者。"}</p></div></div>}
          {dialogMode === "publication" && publicationProject && <div className="publication-content">
            <aside className={`publication-controls step-${publicationStep}`}>
              <nav className="publication-steps" aria-label="出版步骤">
                {(["book", "arrange", "frontmatter", "style", "media", "export"] as const).map((step, index) => <button className={publicationStep === step ? "is-active" : ""} key={step} onClick={() => setPublicationStep(step)}><span>{index + 1}</span>{{ book: "书稿", arrange: "编排", frontmatter: "前置页", style: "样式", media: "插图", export: "导出" }[step]}</button>)}
              </nav>
              <fieldset className="frontmatter-editor"><legend>前置页与出版事实</legend>
                <button className="smart-action" onClick={() => void regenerateFrontMatter()}><Sparkles size={14} />根据当前文稿重新生成</button>
                <div className="switch-grid">
                  {(["includeTitlePage", "includeCopyright", "includePreface", "includeAuthorBio", "includeToc"] as const).map((key) => <label className="switch-label" key={key}><input type="checkbox" checked={publicationProject.frontMatter[key]} onChange={(event) => updatePublication((project) => ({ ...project, frontMatter: { ...project.frontMatter, [key]: event.target.checked } }))} />{{ includeTitlePage: "书名页", includeCopyright: "版权页", includePreface: "前言", includeAuthorBio: "作者简介", includeToc: "目录" }[key]}</label>)}
                </div>
                <label>版权所有者<input aria-label="版权所有者" value={publicationProject.frontMatter.copyright.rightsHolder} onChange={(event) => updatePublication((project) => ({ ...project, frontMatter: { ...project.frontMatter, copyright: { ...project.frontMatter.copyright, rightsHolder: event.target.value } } }))} /></label>
                <div className="form-pair"><label>版权年份<input value={publicationProject.frontMatter.copyright.copyrightYear} onChange={(event) => updatePublication((project) => ({ ...project, frontMatter: { ...project.frontMatter, copyright: { ...project.frontMatter.copyright, copyrightYear: event.target.value } } }))} /></label><label>版本<input value={publicationProject.frontMatter.copyright.edition} onChange={(event) => updatePublication((project) => ({ ...project, frontMatter: { ...project.frontMatter, copyright: { ...project.frontMatter.copyright, edition: event.target.value } } }))} /></label></div>
                <label>出版类型<select value={publicationProject.frontMatter.copyright.publicationType} onChange={(event) => updatePublication((project) => ({ ...project, frontMatter: { ...project.frontMatter, copyright: { ...project.frontMatter.copyright, publicationType: event.target.value as PublicationProject["frontMatter"]["copyright"]["publicationType"] } } }))}><option value="private">内部审校稿</option><option value="self-published">作者自版</option><option value="publisher">出版社出版</option></select></label>
                {publicationProject.frontMatter.copyright.publicationType === "publisher" && <label>出版社<input value={publicationProject.frontMatter.copyright.publisher} onChange={(event) => updatePublication((project) => ({ ...project, frontMatter: { ...project.frontMatter, copyright: { ...project.frontMatter.copyright, publisher: event.target.value } } }))} /></label>}
                <label>版权声明<textarea value={publicationProject.frontMatter.copyright.statement} onChange={(event) => updatePublication((project) => ({ ...project, frontMatter: { ...project.frontMatter, copyright: { ...project.frontMatter.copyright, statement: event.target.value } } }))} /></label>
                <div className="draft-heading"><strong>前言</strong><label>状态<select aria-label="前言确认状态" value={publicationProject.frontMatter.preface.status} onChange={(event) => updatePublication((project) => ({ ...project, frontMatter: { ...project.frontMatter, preface: { ...project.frontMatter.preface, status: event.target.value as "draft" | "confirmed" } } }))}><option value="draft">待确认草稿</option><option value="confirmed">已确认</option></select></label></div>
                <textarea aria-label="前言正文" className="long-copy" value={publicationProject.frontMatter.preface.body} onChange={(event) => updatePublication((project) => ({ ...project, frontMatter: { ...project.frontMatter, preface: { ...project.frontMatter.preface, body: event.target.value } } }))} />
                <label>作者署名<input value={publicationProject.frontMatter.author.displayName} onChange={(event) => updatePublication((project) => ({ ...project, frontMatter: { ...project.frontMatter, author: { ...project.frontMatter.author, displayName: event.target.value } } }))} /></label>
                <div className="media-section-title"><strong>作者照片（可选）</strong><button onClick={() => void addPublicationAsset("portrait")}><ImagePlus size={13} />选择</button></div>
                {publicationProject.assets.filter((asset) => asset.id === publicationProject.frontMatter.author.portraitAssetId).map((asset) => <div className="asset-editor" key={asset.id}>{asset.dataUri && <img src={asset.dataUri} alt={asset.alt || "作者照片预览"} />}<label>替代文字<input value={asset.alt} onChange={(event) => updatePublication((project) => ({ ...project, assets: project.assets.map((item) => item.id === asset.id ? { ...item, alt: event.target.value } : item) }))} /></label><label>使用权<select value={asset.rights} onChange={(event) => updatePublication((project) => ({ ...project, assets: project.assets.map((item) => item.id === asset.id ? { ...item, rights: event.target.value as PublicationAsset["rights"] } : item) }))}><option value="unknown">待确认</option><option value="owned">作者自有</option><option value="licensed">已获授权</option><option value="public-domain">公版</option></select></label></div>)}
                <div className="draft-heading"><strong>作者简介</strong><label>状态<select aria-label="作者简介确认状态" value={publicationProject.frontMatter.author.biography.status} onChange={(event) => updatePublication((project) => ({ ...project, frontMatter: { ...project.frontMatter, author: { ...project.frontMatter.author, biography: { ...project.frontMatter.author.biography, status: event.target.value as "draft" | "confirmed" } } } }))}><option value="draft">待确认草稿</option><option value="confirmed">已确认</option></select></label></div>
                <textarea aria-label="作者简介正文" className="long-copy" value={publicationProject.frontMatter.author.biography.body} onChange={(event) => updatePublication((project) => ({ ...project, frontMatter: { ...project.frontMatter, author: { ...project.frontMatter.author, biography: { ...project.frontMatter.author.biography, body: event.target.value } } } }))} />
              </fieldset>
              <fieldset><legend>书稿项目</legend><label>当前项目<select aria-label="当前出版项目" value={publicationProject.id} onChange={(event) => { const project = publicationProjects.find((item) => item.id === event.target.value); if (project) setPublicationProject(project); }}>{publicationProjects.map((project) => <option value={project.id} key={project.id}>{project.title}</option>)}</select></label><button className="asset-button" onClick={() => void createPublicationProject()}>＋ 新建另一部书稿</button><label>书名<input value={publicationProject.title} onChange={(event) => updatePublication((project) => ({ ...project, title: event.target.value }))} /></label><label>副题<input value={publicationProject.subtitle} onChange={(event) => updatePublication((project) => ({ ...project, subtitle: event.target.value }))} /></label><label>作者<input value={publicationProject.creator} onChange={(event) => updatePublication((project) => ({ ...project, creator: event.target.value }))} /></label><label>简介<textarea value={publicationProject.description} onChange={(event) => updatePublication((project) => ({ ...project, description: event.target.value }))} /></label></fieldset>
              <fieldset><legend>编选与智能编排</legend>
                <div className="form-pair"><label>体裁<select aria-label="出版按体裁筛选" value={publicationProject.genreFilter} onChange={(event) => updatePublication((project) => ({ ...project, genreFilter: event.target.value }))}><option value="all">全部体裁</option>{[...formCounts.keys()].map((form) => <option value={form} key={form}>{formLabels[form] ?? form}</option>)}</select></label><label>系年<select aria-label="出版按系年筛选" value={publicationProject.chronologyFilter} onChange={(event) => updatePublication((project) => ({ ...project, chronologyFilter: event.target.value as PublicationProject["chronologyFilter"] }))}><option value="all">全部系年</option><option value="dated">已有系年</option><option value="undated">尚未系年</option></select></label></div>
                <label>当前呈现顺序<select aria-label="出版排序方式" value={publicationProject.sortMode} onChange={(event) => updatePublication((project) => ({ ...project, sortMode: event.target.value as PublicationProject["sortMode"] }))}><option value="author-intent">作者编定</option><option value="chronology-asc">系年由早到晚</option><option value="chronology-desc">系年由晚到早</option><option value="genre">按体裁</option><option value="mood">按意境</option><option value="hybrid">综合策展</option></select></label>
                <div className="arrangement-actions"><span>生成候选</span>{(["genre", "chronology-asc", "mood", "hybrid"] as const).map((strategy) => <button key={strategy} onClick={() => void proposePublicationArrangement(strategy)}>{{ genre: "体裁", "chronology-asc": "系年", mood: "意境", hybrid: "综合" }[strategy]}</button>)}</div>
                <div className="publication-selection-list">{[...publicationProject.entries].sort((a, b) => a.manualOrder - b.manualOrder).map((entry, index) => { const record = records.find((item) => item.id === entry.recordId); if (!record) return null; return <div className={`publication-entry ${publicationRecordId === entry.recordId ? "is-focused" : ""}`} key={entry.recordId}><input aria-label={`收录${titleOf(record)}`} type="checkbox" checked={entry.included} onChange={(event) => updatePublication((project) => ({ ...project, entries: project.entries.map((item) => item.recordId === entry.recordId ? { ...item, included: event.target.checked } : item) }))} /><button className="entry-title" onClick={() => setPublicationRecordId(entry.recordId)}><strong>{titleOf(record)}</strong><small>{formLabels[record.draft.work.form] ?? record.draft.work.form} · {chronologyOf(record)}{entry.moodTags.length ? ` · ${entry.moodTags.join("、")}` : ""}</small></button><div><button className={entry.locked ? "is-locked" : ""} aria-label={`${entry.locked ? "解锁" : "锁定"}${titleOf(record)}`} onClick={() => updatePublication((project) => ({ ...project, entries: project.entries.map((item) => item.recordId === entry.recordId ? { ...item, locked: !item.locked } : item) }))}><Lock size={11} /></button><button aria-label={`上移${titleOf(record)}`} disabled={index === 0 || entry.locked} onClick={() => movePublicationEntry(entry.recordId, -1)}>↑</button><button aria-label={`下移${titleOf(record)}`} disabled={index === publicationProject.entries.length - 1 || entry.locked} onClick={() => movePublicationEntry(entry.recordId, 1)}>↓</button></div></div>; })}</div>
                {publicationProject.arrangement.proposal && <div className="arrangement-proposal"><header><strong>候选方案 · {publicationProject.arrangement.proposal.strategy}</strong><span>{publicationProject.arrangement.proposal.items.length}篇</span></header>{publicationProject.arrangement.proposal.items.slice(0, 8).map((item) => <p key={item.recordId}><b>{item.order + 1}</b>{records.find((record) => record.id === item.recordId) ? titleOf(records.find((record) => record.id === item.recordId)!) : item.recordId}<small>{item.reason}</small></p>)}<footer><button onClick={() => updatePublication((project) => applyArrangementProposal(project, project.arrangement.proposal!))}>应用此顺序</button><button onClick={() => updatePublication((project) => { const { proposal: _proposal, ...arrangement } = project.arrangement; return { ...project, arrangement }; })}>暂不应用</button></footer></div>}
                {publicationProject.arrangement.previousManualOrder && <button className="quiet-action" onClick={() => updatePublication((project) => restoreArrangement(project))}><Undo2 size={13} />恢复应用前顺序</button>}
                <label>编校信息<select value={publicationProject.apparatusPolicy} onChange={(event) => updatePublication((project) => ({ ...project, apparatusPolicy: event.target.value as PublicationProject["apparatusPolicy"] }))}><option value="omit">成书不收录</option><option value="backmatter">汇总为书末附录</option><option value="internal-proof">内部审校附录</option></select></label>
              </fieldset>
              <fieldset><legend>封面与单篇插图</legend>
                <div className="media-section-title"><strong>全书封面</strong><button onClick={() => void addPublicationAsset("cover")}><ImagePlus size={13} />{publicationProject.assets.some((asset) => asset.kind === "cover") ? "更换" : "选择"}</button></div>
                {publicationProject.assets.filter((asset) => asset.kind === "cover").map((asset) => <div className="asset-editor" key={asset.id}>{asset.dataUri && <img src={asset.dataUri} alt="封面预览" />}<label>替代文字<input value={asset.alt} onChange={(event) => updatePublication((project) => ({ ...project, assets: project.assets.map((item) => item.id === asset.id ? { ...item, alt: event.target.value } : item) }))} /></label><label>使用权<select value={asset.rights} onChange={(event) => updatePublication((project) => ({ ...project, assets: project.assets.map((item) => item.id === asset.id ? { ...item, rights: event.target.value as PublicationAsset["rights"] } : item) }))}><option value="unknown">待确认</option><option value="owned">作者自有</option><option value="licensed">已获授权</option><option value="public-domain">公版</option></select></label></div>)}
                <div className="media-section-title"><strong>篇目插图</strong><span>{publicationProject.placements.length}个位置</span></div>
                <label>当前篇目<select aria-label="插图所属篇目" value={publicationRecordId ?? ""} onChange={(event) => setPublicationRecordId(event.target.value)}>{[...publicationProject.entries].sort((a, b) => a.manualOrder - b.manualOrder).map((entry) => { const record = records.find((item) => item.id === entry.recordId); return record ? <option key={entry.recordId} value={entry.recordId}>{titleOf(record)}</option> : null; })}</select></label>
                <button className="asset-button" disabled={!publicationRecordId} onClick={() => publicationRecordId && void addPublicationAsset("illustration", publicationRecordId)}><ImagePlus size={14} />为本篇添加插图</button>
                {publicationRecordId && publicationProject.assets.some((asset) => asset.kind === "illustration" && !publicationProject.placements.some((placement) => placement.recordId === publicationRecordId && placement.assetId === asset.id)) && <div className="reusable-assets"><span>从项目图库复用</span>{publicationProject.assets.filter((asset) => asset.kind === "illustration" && !publicationProject.placements.some((placement) => placement.recordId === publicationRecordId && placement.assetId === asset.id)).map((asset) => <button key={asset.id} onClick={() => updatePublication((project) => ({ ...project, placements: [...project.placements, { assetId: asset.id, recordId: publicationRecordId, role: "chapter-opening", alignment: "center", size: "wide", focalPoint: [0.5, 0.5] }] }))}>{asset.fileName}</button>)}</div>}
                {publicationProject.placements.filter((placement) => placement.recordId === publicationRecordId).map((placement) => { const asset = publicationProject.assets.find((item) => item.id === placement.assetId); if (!asset) return null; return <div className="asset-editor placement-editor" key={`${asset.id}-${placement.recordId}`}>{asset.dataUri && <img src={asset.dataUri} alt={asset.alt || "插图预览"} />}<strong>{asset.fileName}</strong><div className="form-pair"><label>位置<select value={placement.role} onChange={(event) => updatePublication((project) => ({ ...project, placements: project.placements.map((item) => item.assetId === asset.id && item.recordId === placement.recordId ? { ...item, role: event.target.value as typeof item.role } : item) }))}><option value="chapter-opening">篇章题图</option><option value="inline">随文插图</option><option value="plate">独立插页</option><option value="endpiece">篇末尾花</option></select></label><label>尺寸<select value={placement.size} onChange={(event) => updatePublication((project) => ({ ...project, placements: project.placements.map((item) => item.assetId === asset.id && item.recordId === placement.recordId ? { ...item, size: event.target.value as typeof item.size } : item) }))}><option value="small">小幅</option><option value="medium">半幅</option><option value="wide">通栏</option><option value="full-page">整页</option></select></label></div><label>对齐<select value={placement.alignment} onChange={(event) => updatePublication((project) => ({ ...project, placements: project.placements.map((item) => item.assetId === asset.id && item.recordId === placement.recordId ? { ...item, alignment: event.target.value as typeof item.alignment } : item) }))}><option value="center">居中</option><option value="left">左对齐</option><option value="right">右对齐</option></select></label>{placement.role === "inline" && <label>插入锚点<input placeholder="留空则置于正文后；填写正文中的短句" value={placement.anchorText ?? ""} onChange={(event) => updatePublication((project) => ({ ...project, placements: project.placements.map((item) => item.assetId === asset.id && item.recordId === placement.recordId ? { ...item, anchorText: event.target.value } : item) }))} /></label>}<label>替代文字<input value={asset.alt} onChange={(event) => updatePublication((project) => ({ ...project, assets: project.assets.map((item) => item.id === asset.id ? { ...item, alt: event.target.value } : item) }))} /></label><label>图注<input value={asset.caption ?? ""} onChange={(event) => updatePublication((project) => ({ ...project, assets: project.assets.map((item) => item.id === asset.id ? { ...item, caption: event.target.value } : item) }))} /></label><label>使用权<select value={asset.rights} onChange={(event) => updatePublication((project) => ({ ...project, assets: project.assets.map((item) => item.id === asset.id ? { ...item, rights: event.target.value as PublicationAsset["rights"] } : item) }))}><option value="unknown">权利待确认</option><option value="owned">作者自有</option><option value="licensed">已获授权</option><option value="public-domain">公版</option></select></label><button className="remove-asset" onClick={() => updatePublication((project) => ({ ...project, placements: project.placements.filter((item) => !(item.assetId === asset.id && item.recordId === placement.recordId)) }))}>移除本篇位置（保留图库原图）</button></div>; })}
              </fieldset>
              <fieldset><legend>语义样式系统</legend>
                <div className="theme-gallery">{Object.entries(publicationThemes).map(([id, theme]) => <button className={publicationProject.theme.id === id ? "is-active" : ""} key={id} onClick={() => updatePublication((project) => ({ ...project, theme }))}><span style={{ background: theme.accentColor }} /><strong>{{ sujian: "素笺雅集", qingjian: "青简笺读", contemporary: "当代清集", collector: "典藏书稿" }[id as keyof typeof publicationThemes]}</strong><small>{theme.titleStyle === "left-modern" ? "现代左题" : theme.titleStyle === "numbered" ? "序号篇章" : "居中雅正"}</small></button>)}</div>
                <div className="form-pair"><label>标题<select value={publicationProject.theme.titleStyle} onChange={(event) => updatePublication((project) => ({ ...project, theme: { ...project.theme, titleStyle: event.target.value as typeof project.theme.titleStyle } }))}><option value="centered">居中雅正</option><option value="left-modern">左起现代</option><option value="numbered">序号篇章</option></select></label><label>阅读密度<select value={publicationProject.theme.density} onChange={(event) => updatePublication((project) => ({ ...project, theme: { ...project.theme, density: event.target.value as typeof project.theme.density } }))}><option value="compact">凝练</option><option value="balanced">雅正</option><option value="relaxed">舒朗</option></select></label></div>
                <div className="form-pair"><label>译文<select value={publicationProject.theme.translationStyle} onChange={(event) => updatePublication((project) => ({ ...project, theme: { ...project.theme, translationStyle: event.target.value as typeof project.theme.translationStyle } }))}><option value="plain">素底正文</option><option value="rule">左侧细线</option><option value="panel">淡色阅读区</option></select></label><label>笺注<select value={publicationProject.theme.annotationStyle} onChange={(event) => updatePublication((project) => ({ ...project, theme: { ...project.theme, annotationStyle: event.target.value as typeof project.theme.annotationStyle } }))}><option value="inline">紧凑随文</option><option value="list">篇后列表</option><option value="panel">笺注面板</option></select></label></div>
                <label>赏析<select value={publicationProject.theme.appreciationStyle} onChange={(event) => updatePublication((project) => ({ ...project, theme: { ...project.theme, appreciationStyle: event.target.value as typeof project.theme.appreciationStyle } }))}><option value="section">独立小节</option><option value="rule">分隔线引导</option><option value="panel">淡色阅读区</option></select></label>
                <div className="form-pair"><label>正文字号<input type="number" min="7" max="36" step="0.5" value={publicationProject.theme.baseFontPt} onChange={(event) => updatePublication((project) => ({ ...project, theme: { ...project.theme, baseFontPt: Number(event.target.value) } }))} /></label><label>行距<input type="number" min="1" max="3" step="0.05" value={publicationProject.theme.lineHeight} onChange={(event) => updatePublication((project) => ({ ...project, theme: { ...project.theme, lineHeight: Number(event.target.value) } }))} /></label></div>
                <label>正文字体<select value={publicationProject.theme.bodyFont} onChange={(event) => updatePublication((project) => ({ ...project, theme: { ...project.theme, bodyFont: event.target.value } }))}><option value={'"Songti SC", "STSong", serif'}>宋体</option><option value={'"Kaiti SC", "STKaiti", serif'}>楷体</option><option value={'"PingFang SC", sans-serif'}>苹方</option><option value={'"Noto Serif CJK SC", serif'}>思源宋体</option>{publicationProject.assets.filter((asset) => asset.kind === "font").map((asset) => <option key={asset.id} value={`"${asset.fontFamily}"`}>{asset.fontFamily}</option>)}</select></label>
                <label>标题字体<select value={publicationProject.theme.headingFont} onChange={(event) => updatePublication((project) => ({ ...project, theme: { ...project.theme, headingFont: event.target.value } }))}><option value={'"Songti SC", "STSong", serif'}>宋体</option><option value={'"Kaiti SC", "STKaiti", serif'}>楷体</option><option value={'"PingFang SC", sans-serif'}>苹方</option>{publicationProject.assets.filter((asset) => asset.kind === "font").map((asset) => <option key={asset.id} value={`"${asset.fontFamily}"`}>{asset.fontFamily}</option>)}</select></label>
                <button className="asset-button" onClick={() => void addPublicationAsset("font")}><Upload size={14} />导入授权字体</button>{publicationProject.assets.filter((asset) => asset.kind === "font").map((asset) => <div className="asset-editor asset-editor-row" key={asset.id}><span>{asset.fontFamily}</span><select aria-label={`${asset.fontFamily}使用权`} value={asset.rights} onChange={(event) => updatePublication((project) => ({ ...project, assets: project.assets.map((item) => item.id === asset.id ? { ...item, rights: event.target.value as PublicationAsset["rights"] } : item) }))}><option value="unknown">授权待确认</option><option value="owned">自有字体</option><option value="licensed">已获嵌入授权</option><option value="public-domain">开放许可</option></select><button onClick={() => updatePublication((project) => ({ ...project, assets: project.assets.filter((item) => item.id !== asset.id) }))}>移除</button></div>)}
                <label className="switch-label"><input type="checkbox" checked={publicationProject.profile.requireEmbeddedFonts} onChange={(event) => updatePublication((project) => ({ ...project, profile: { ...project.profile, requireEmbeddedFonts: event.target.checked } }))} />要求成品嵌入字体</label><label>章饰<select value={publicationProject.theme.ornament} onChange={(event) => updatePublication((project) => ({ ...project, theme: { ...project.theme, ornament: event.target.value as PublicationProject["theme"]["ornament"] } }))}><option value="none">无</option><option value="bamboo">竹叶雅饰</option><option value="cloud">云纹</option><option value="rule">几何分隔</option></select></label><label>主题色<input type="color" value={publicationProject.theme.accentColor} onChange={(event) => updatePublication((project) => ({ ...project, theme: { ...project.theme, accentColor: event.target.value } }))} /></label>
              </fieldset>
              <fieldset><legend>纸张与页眉</legend><label>纸张<select value={publicationProject.profile.pageSize} onChange={(event) => updatePublication((project) => ({ ...project, profile: { ...project.profile, pageSize: event.target.value as PublicationProject["profile"]["pageSize"] } }))}><option value="A4">A4</option><option value="A5">A5</option><option value="B5">B5</option></select></label><label className="switch-label"><input type="checkbox" checked={publicationProject.profile.runningContent.enabled} onChange={(event) => updatePublication((project) => ({ ...project, profile: { ...project.profile, runningContent: { ...project.profile.runningContent, enabled: event.target.checked } } }))} />启用页眉页脚</label><label>页眉<input value={publicationProject.profile.runningContent.headerTemplate} onChange={(event) => updatePublication((project) => ({ ...project, profile: { ...project.profile, runningContent: { ...project.profile.runningContent, headerTemplate: event.target.value } } }))} /></label><label>页脚<input value={publicationProject.profile.runningContent.footerTemplate} onChange={(event) => updatePublication((project) => ({ ...project, profile: { ...project.profile, runningContent: { ...project.profile.runningContent, footerTemplate: event.target.value } } }))} /></label></fieldset>
              <fieldset><legend>水印</legend><label className="switch-label"><input type="checkbox" checked={publicationProject.profile.watermark.enabled} onChange={(event) => updatePublication((project) => ({ ...project, profile: { ...project.profile, watermark: { ...project.profile.watermark, enabled: event.target.checked } } }))} />启用</label><label>文字<input value={publicationProject.profile.watermark.content} onChange={(event) => updatePublication((project) => ({ ...project, profile: { ...project.profile, watermark: { ...project.profile.watermark, content: event.target.value } } }))} /></label></fieldset>
              <fieldset><legend>交付目标</legend><label>格式<select aria-label="目标客户端" value={publicationProject.target} onChange={(event) => updatePublication((project) => ({ ...project, target: event.target.value as PublicationProject["target"] }))}><option value="pdf">通用屏幕 PDF</option><option value="epub">EPUB 3 可重排电子书</option><option value="xianxinzimo">闲心子墨暂存内容包</option><option value="webpub">通用 WebPub 内容包</option></select></label>{publicationProject.target === "pdf" && <label>PDF 规范<select value={publicationProject.profile.pdfProfile} onChange={(event) => updatePublication((project) => ({ ...project, profile: { ...project.profile, pdfProfile: event.target.value as PublicationProject["profile"]["pdfProfile"] } }))}><option value="screen">通用屏幕 PDF</option><option value="PDF/X-4">PDF/X-4 印刷</option><option value="PDF/A-2b">PDF/A-2b 归档</option><option value="PDF/UA-1">PDF/UA-1 无障碍</option></select></label>}</fieldset>
              <div className={`preflight-card ${publicationIssues.some((issue) => issue.severity === "error") ? "has-errors" : "is-ready"}`}><strong>{publicationIssues.length ? `预检发现 ${publicationIssues.length} 项` : "预检通过，可安全导出"}</strong>{publicationIssues.map((issue) => <p key={issue.code}>{issue.message}</p>)}</div>
              <button className="primary-button export-pdf-button" disabled={publicationBusy || publicationIssues.some((issue) => issue.severity === "error")} onClick={() => void exportPublication()}>{publicationBusy ? <LoaderCircle size={15} className="spin" /> : publicationProject.target === "epub" ? <BookOpenText size={15} /> : <FileOutput size={15} />} 导出并验证{{ pdf: " PDF", epub: " EPUB", xianxinzimo: "闲心子墨包", webpub: " WebPub 包" }[publicationProject.target]}</button>
              {publicationReceipt && <p className="publication-receipt">{publicationReceipt}</p>}
            </aside>
            <div className="publication-preview"><div className="preview-toolbar"><span>统一出版快照预览</span><span>{publicationProject.profile.pageSize} · {publicationProject.target.toLocaleUpperCase()}</span></div><iframe title="出版分页预览" sandbox="" srcDoc={publicationHtml} /></div>
          </div>}
        </section>
      </div>}
    </main>
  );
}
