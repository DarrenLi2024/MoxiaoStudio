import { useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  BookOpenText,
  Check,
  CircleAlert,
  Command,
  FileOutput,
  Filter,
  GripVertical,
  History,
  ImagePlus,
  LibraryBig,
  ListFilter,
  Lock,
  Unlock,
  LoaderCircle,
  PanelRightClose,
  Search,
  Settings,
  Sparkles,
  Undo2,
  Upload,
  X
} from "lucide-react";
import type { EditorialRecord, EditorialWorkspace, ReviewStatus } from "@moxiao/editorial";
import { ontologyVersion } from "@moxiao/ontology";
import { applyArrangementProposal, applyThemeToStyleSheet, compareLiteraryForms, createDefaultLayoutSpecification, createStyleSheetFromTheme, literaryFormLabel, literaryFormLabels, publicationThemes, renderPublicationHtml, resolveSemanticStyle, restoreArrangement, semanticStyleRoleLabels, semanticStyleRoles, setStyleProperty, stylePropertyLabels, toggleStylePropertyLock, type ArrangementProposal, type PreflightIssue, type PublicationAsset, type PublicationAssetDeclaration, type PublicationDocument, type PublicationProject, type SemanticStyleRole, type StyleProperties, type StylePropertyKey } from "@moxiao/publication";
import type { DuplicateView } from "../../preload";
import type { SemanticVersionReceipt } from "@moxiao/storage";
import { AssistantWorkbench } from "./AssistantWorkbench";

type SaveMode = "loading" | "saved" | "dirty" | "saving" | "error" | "conflict";
type DialogMode = "new" | "batch" | "duplicates" | "versions" | "assistant" | "publication" | null;
type EditorMode = "manuscript" | "reading";
type PublicationStep = "book" | "arrange" | "frontmatter" | "style" | "media" | "export";
type PreviewDevice = "page" | "tablet" | "phone";
type NumericStyleKey = "fontSizePt" | "lineHeight" | "letterSpacingEm" | "textIndentEm" | "spaceBeforeEm" | "spaceAfterEm" | "borderRadiusPt" | "paddingEm";

const railItems = [
  { label: "文库", icon: LibraryBig, active: true },
  { label: "智校", icon: Sparkles },
  { label: "版本", icon: History },
  { label: "出版", icon: FileOutput }
] as const;

const formLabels = literaryFormLabels;

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

function suggestedAssetAlt(project: PublicationProject, asset: PublicationAsset, records: readonly EditorialRecord[]): string {
  if (asset.caption?.trim()) return asset.caption.trim();
  if (asset.kind === "cover") return `《${project.title || "文集"}》封面`;
  if (asset.kind === "portrait") return `${project.frontMatter.author.displayName || project.creator || "作者"}肖像`;
  const recordIds = [...new Set(project.placements.filter((placement) => placement.assetId === asset.id).map((placement) => placement.recordId))];
  const titles = recordIds.map((recordId) => records.find((record) => record.id === recordId)).filter((record): record is EditorialRecord => Boolean(record)).map(titleOf);
  if (titles.length === 1) return `《${titles[0]}》插图`;
  if (titles.length > 1) return `文集插图，关联《${titles.slice(0, 3).join("》《")}》${titles.length > 3 ? `等${titles.length}篇` : ""}`;
  return `${project.title || "文集"}${asset.kind === "ornament" ? "装饰图" : "插图"}`;
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
  const [batchPreview, setBatchPreview] = useState<Array<{ title: string; form: string; body: string }> | null>(null);
  const [versions, setVersions] = useState<SemanticVersionReceipt[]>([]);
  const [publicationProject, setPublicationProject] = useState<PublicationProject | null>(null);
  const [publicationProjects, setPublicationProjects] = useState<PublicationProject[]>([]);
  const [publicationHtml, setPublicationHtml] = useState("");
  const [publicationDocument, setPublicationDocument] = useState<PublicationDocument | null>(null);
  const [publicationIssues, setPublicationIssues] = useState<readonly PreflightIssue[]>([]);
  const [publicationBusy, setPublicationBusy] = useState(false);
  const [publicationReceipt, setPublicationReceipt] = useState("");
  const [publicationStep, setPublicationStep] = useState<PublicationStep>("book");
  const [publicationRecordId, setPublicationRecordId] = useState<string | null>(null);
  const [previewDevice, setPreviewDevice] = useState<PreviewDevice>("page");
  const [selectedStyleRole, setSelectedStyleRole] = useState<SemanticStyleRole>("verse-body");
  const editCounter = useRef(0);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchInput = useRef<HTMLInputElement | null>(null);

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
    const focusSearch = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === "k") {
        event.preventDefault();
        setDialogMode(null);
        searchInput.current?.focus();
      }
    };
    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
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
      setPublicationDocument(preview.document);
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

  async function openVersions(): Promise<void> {
    try {
      setVersions(await window.moxiao!.listVersions());
      setDialogMode("versions");
    } catch (error) {
      setSaveMode("error");
      setSaveError(error instanceof Error ? error.message : String(error));
    }
  }

  async function previewBatchImport(): Promise<void> {
    try {
      setBatchPreview(await window.moxiao!.previewBatch({ source: batchSource, defaultForm: newForm }));
    } catch (error) {
      setSaveMode("error");
      setSaveError(error instanceof Error ? error.message : String(error));
    }
  }

  useEffect(() => {
    if (dialogMode !== "publication" || !publicationProject) return;
    if (publicationDocument) {
      const profile = { ...publicationProject.profile, bodyFont: publicationProject.theme.bodyFont, headingFont: publicationProject.theme.headingFont, baseFontPt: publicationProject.theme.baseFontPt, lineHeight: publicationProject.theme.lineHeight, accentColor: publicationProject.theme.accentColor, ornament: publicationProject.theme.ornament };
      const assets: PublicationAssetDeclaration[] = publicationProject.assets.map((asset) => ({ id: asset.id, mediaType: asset.mediaType, rights: asset.rights, kind: asset.kind, fileName: asset.fileName, ...(asset.dataUri ? { dataUri: asset.dataUri } : {}), ...(asset.fontFamily ? { fontFamily: asset.fontFamily } : {}) }));
      setPublicationHtml(renderPublicationHtml(publicationDocument, profile, assets, publicationProject.theme, publicationProject.styleSheet, publicationProject.layoutSpecification));
    }
    let active = true;
    const timer = setTimeout(() => {
      void window.moxiao!.savePublicationProject(publicationProject).then((saved) => window.moxiao!.publicationPreview(saved)).then((preview) => {
        if (!active) return;
        setPublicationDocument(preview.document);
        setPublicationHtml(preview.html);
        setPublicationIssues(preview.preflight.issues);
      }).catch((error: unknown) => { if (active) setPublicationReceipt(error instanceof Error ? error.message : String(error)); });
    }, 360);
    return () => { active = false; clearTimeout(timer); };
  }, [dialogMode, publicationProject]);

  const publicationEntriesForView = useMemo(() => {
    if (!publicationProject) return [];
    const recordMap = new Map(records.map((record) => [record.id, record]));
    const chronologyYear = (record: EditorialRecord): number | null => record.draft.chronologyResearch.startYear ?? record.draft.chronologyResearch.endYear;
    const filtered = publicationProject.entries.filter((entry) => {
      const record = recordMap.get(entry.recordId);
      if (!record) return false;
      if (publicationProject.genreFilters.length && !publicationProject.genreFilters.includes(record.draft.work.form)) return false;
      const dated = chronologyYear(record) !== null;
      return publicationProject.chronologyFilter === "all" || (publicationProject.chronologyFilter === "dated" ? dated : !dated);
    });
    return [...filtered].sort((left, right) => {
      const leftRecord = recordMap.get(left.recordId)!;
      const rightRecord = recordMap.get(right.recordId)!;
      if (publicationProject.sortMode === "author-intent") return left.manualOrder - right.manualOrder;
      if (publicationProject.sortMode === "genre") return compareLiteraryForms(leftRecord.draft.work.form, rightRecord.draft.work.form) || left.manualOrder - right.manualOrder;
      if (publicationProject.sortMode === "mood" || publicationProject.sortMode === "hybrid") return (left.moodTags[0] ?? "末").localeCompare(right.moodTags[0] ?? "末", "zh-CN") || left.manualOrder - right.manualOrder;
      const leftYear = chronologyYear(leftRecord);
      const rightYear = chronologyYear(rightRecord);
      if (leftYear === null && rightYear === null) return left.manualOrder - right.manualOrder;
      if (leftYear === null) return 1;
      if (rightYear === null) return -1;
      return publicationProject.sortMode === "chronology-desc" ? rightYear - leftYear : leftYear - rightYear;
    });
  }, [publicationProject, records]);

  const publicationAssetTasks = useMemo(() => {
    if (!publicationProject) return [];
    const grouped = new Map<string, PreflightIssue[]>();
    for (const issue of publicationIssues) {
      if (!issue.assetId || !publicationProject.assets.some((asset) => asset.id === issue.assetId)) continue;
      grouped.set(issue.assetId, [...(grouped.get(issue.assetId) ?? []), issue]);
    }
    return [...grouped.entries()].map(([assetId, issues]) => {
      const asset = publicationProject.assets.find((item) => item.id === assetId)!;
      const recordIds = [...new Set(publicationProject.placements.filter((placement) => placement.assetId === assetId).map((placement) => placement.recordId))];
      const titles = recordIds.map((recordId) => records.find((record) => record.id === recordId)).filter((record): record is EditorialRecord => Boolean(record)).map(titleOf);
      return { asset, issues, recordIds, titles };
    });
  }, [publicationIssues, publicationProject, records]);

  const publicationOtherIssues = useMemo(() => publicationIssues.filter((issue) => !issue.assetId || !publicationProject?.assets.some((asset) => asset.id === issue.assetId)), [publicationIssues, publicationProject]);

  function generateMissingAltDrafts(): void {
    if (!publicationProject) return;
    const taskIds = new Set(publicationAssetTasks.filter((task) => task.issues.some((issue) => issue.code.startsWith("image.alt.required"))).map((task) => task.asset.id));
    updatePublication((project) => ({ ...project, assets: project.assets.map((asset) => taskIds.has(asset.id) && !asset.alt.trim() ? { ...asset, alt: suggestedAssetAlt(project, asset, records) } : asset) }));
    setPublicationReceipt(`已生成 ${taskIds.size} 条替代文字草稿，请在导出前复核语义是否准确`);
  }

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

  function updateSelectedStyle<K extends StylePropertyKey>(key: K, value: StyleProperties[K] | undefined): void {
    updatePublication((project) => ({ ...project, styleSheet: setStyleProperty(project.styleSheet, selectedStyleRole, key, value) }));
  }

  function toggleSelectedStyleLock(key: StylePropertyKey): void {
    updatePublication((project) => ({ ...project, styleSheet: toggleStylePropertyLock(project.styleSheet, selectedStyleRole, key) }));
  }

  function restoreSelectedStyleInheritance(): void {
    updatePublication((project) => {
      const definition = project.styleSheet.roles[selectedStyleRole];
      let styleSheet = project.styleSheet;
      const presetBase = createStyleSheetFromTheme(project.theme).roles.base.properties;
      for (const key of Object.keys(definition.properties) as StylePropertyKey[]) {
        if (definition.locks.includes(key)) continue;
        styleSheet = setStyleProperty(styleSheet, selectedStyleRole, key, selectedStyleRole === "base" ? presetBase[key] : undefined);
      }
      return { ...project, styleSheet };
    });
  }

  function lockAllSelectedStyleProperties(): void {
    updatePublication((project) => {
      let styleSheet = project.styleSheet;
      for (const key of Object.keys(stylePropertyLabels) as StylePropertyKey[]) if (!styleSheet.roles[selectedStyleRole].locks.includes(key)) styleSheet = toggleStylePropertyLock(styleSheet, selectedStyleRole, key);
      return { ...project, styleSheet };
    });
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

  function commitCurrentPublicationOrder(): void {
    if (!publicationProject || publicationProject.sortMode === "author-intent") return;
    const visibleIds = new Set(publicationEntriesForView.map((entry) => entry.recordId));
    updatePublication((project) => {
      const manual = [...project.entries].sort((left, right) => left.manualOrder - right.manualOrder);
      let cursor = 0;
      const merged = manual.map((entry) => visibleIds.has(entry.recordId) ? publicationEntriesForView[cursor++]! : entry);
      const order = new Map(merged.map((entry, index) => [entry.recordId, index]));
      return { ...project, sortMode: "author-intent", entries: project.entries.map((entry) => ({ ...entry, manualOrder: order.get(entry.recordId) ?? entry.manualOrder })) };
    });
    setPublicationReceipt("当前可见顺序已固化为作者编定顺序");
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
  const selectedStyleDefinition = publicationProject?.styleSheet.roles[selectedStyleRole];
  const selectedEffectiveStyle = publicationProject ? resolveSemanticStyle(publicationProject.styleSheet, selectedStyleRole, publicationProject.target) : {};

  function numericStyleControl(key: NumericStyleKey, min: number, max: number, step: number) {
    const locked = selectedStyleDefinition?.locks.includes(key) ?? false;
    const inherited = selectedStyleDefinition?.properties[key] === undefined;
    return <label className="style-property-row" key={key}><span>{stylePropertyLabels[key]}{inherited && <small>继承</small>}</span><input aria-label={`${semanticStyleRoleLabels[selectedStyleRole]}${stylePropertyLabels[key]}`} type="number" min={min} max={max} step={step} value={selectedEffectiveStyle[key] ?? ""} onChange={(event) => updateSelectedStyle(key, Number(event.target.value))} /><button type="button" className={locked ? "is-locked" : ""} onClick={() => toggleSelectedStyleLock(key)} aria-label={`${locked ? "解锁" : "锁定"}${stylePropertyLabels[key]}`}>{locked ? <Lock size={11} /> : <Unlock size={11} />}</button></label>;
  }

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
            <button className={`rail-button ${"active" in item && item.active ? "is-active" : ""}`} aria-label={item.label} key={item.label} onClick={item.label === "出版" ? () => void openPublication() : item.label === "智校" ? () => setDialogMode("assistant") : item.label === "版本" ? () => void openVersions() : undefined}>
              <Icon size={20} strokeWidth={1.7} /><span>{item.label}</span>
            </button>
          );})}
        </nav>
        <div className="rail-footer">
          <button className="icon-button" aria-label="设置" onClick={() => setDialogMode("assistant")}><Settings size={19} /></button>
        </div>
      </aside>

      <section className="library-panel" aria-label="作品目录">
        <header className="project-header">
          <div><span className="context-label">当前项目</span><span className="project-switcher">本地文学项目</span></div>
          <button className="icon-button bordered" aria-label="导入作品" onClick={() => void refreshWorkspace(() => window.moxiao!.importWorkspace())}><Upload size={17} /></button>
        </header>
        <div className="library-heading">
          <div><h1>一卷通校</h1><p>{records.length} 篇作品 · {records.filter((record) => record.editorState.status === "reviewed").length} 篇已复校</p></div>
          <button className="icon-button" aria-label="查重" onClick={() => void openDuplicateDialog()}><ListFilter size={18} /></button>
        </div>
        <label className="search-field"><Search size={16} aria-hidden="true" /><input ref={searchInput} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索题名、正文或系年" /><kbd>⌘K</kbd></label>
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
        <div className="library-actions"><button onClick={() => setDialogMode("new")}>＋ 新增作品</button><button onClick={() => { setBatchPreview(null); setDialogMode("batch"); }}>批量补录</button></div>
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
          <section className="inspector-section"><div className="section-title-row"><h3>证据与置信度</h3><span>随系年编校记录</span></div><div className="evidence-card"><span className="evidence-mark">据</span><div><strong>{selected.draft.chronologyResearch.basis.length} 条系年证据</strong><p>{selected.draft.chronologyResearch.editorialNote || "尚未记录编校说明"}</p></div><span className="confidence">{selected.draft.chronologyResearch.certainty === "authorConfirmed" ? "作者确认" : "待核"}</span></div></section>
          <section className="inspector-section"><h3>关系</h3><div className="relation-row"><span>内部实体</span><strong>{selected.entityId.slice(0, 8)}</strong></div><div className="relation-row"><span>操作状态</span><strong>{selected.operation ?? "update"}</strong></div><div className="relation-row"><span>人工变化</span><strong className={changed(selected) ? "warning-text" : ""}>{changed(selected) ? "有" : "无"}</strong></div></section>
          <section className="inspector-section danger-zone"><h3>作品治理</h3><button onClick={() => void refreshWorkspace(async () => { await window.moxiao!.resolveDuplicate(selected.id); })}>标记删除当前作品</button></section>
        </> : <div className="inspector-empty">导入或新增作品后显示语义属性。</div>}
        <footer className="ontology-footnote"><Command size={15} /> {ontologyVersion}</footer>
      </aside>

      <footer className="statusbar"><span><span className="online-dot" /> {runtimeLabel}</span><span>SQLite · WAL</span><span>修订 {workspace.revision}</span><span>{records.length} 篇 · 已删除 {workspace.records.length - records.length}</span><button onClick={() => searchInput.current?.focus()}><Command size={13} /> 搜索</button></footer>

      {dialogMode && <div className="dialog-backdrop" role="presentation">
        {dialogMode === "assistant" ? <AssistantWorkbench records={records} selectedId={selected?.id ?? null} filteredIds={filteredRecords.map((record) => record.id)} onWorkspace={(next) => { setWorkspace(next); setSaveMode("saved"); }} onClose={() => setDialogMode(null)} /> : <section className={`work-dialog ${dialogMode === "duplicates" ? "duplicate-dialog" : dialogMode === "versions" ? "version-dialog" : dialogMode === "publication" ? "publication-dialog" : ""}`} role="dialog" aria-modal="true" aria-label={{ new: "新增作品", batch: "批量补录", duplicates: "作品查重", versions: "版本中心", publication: "出版中心" }[dialogMode]}>
          <header><div><span className="context-label">本地工作区</span><h2>{{ new: "新增作品", batch: "批量补录", duplicates: "作品查重", versions: "版本中心", publication: "出版中心" }[dialogMode]}</h2></div><button className="icon-button" onClick={() => setDialogMode(null)} aria-label="关闭"><X size={18} /></button></header>
          {dialogMode === "new" && <form onSubmit={(event) => { event.preventDefault(); void refreshWorkspace(() => window.moxiao!.addWork({ title: newTitle, form: newForm, body: newBody })).then(() => { setDialogMode(null); setNewTitle(""); setNewBody(""); }); }}>
            <label>作品题名<input required value={newTitle} onChange={(event) => setNewTitle(event.target.value)} /></label>
            <label>体裁<select value={newForm} onChange={(event) => setNewForm(event.target.value)}>{Object.entries(formLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
            <label>正文<textarea required value={newBody} onChange={(event) => setNewBody(event.target.value)} /></label>
            <footer><button type="button" className="quiet-button" onClick={() => setDialogMode(null)}>取消</button><button className="primary-button">建立草稿</button></footer>
          </form>}
          {dialogMode === "batch" && <form onSubmit={(event) => { event.preventDefault(); if (!batchPreview) { void previewBatchImport(); return; } void refreshWorkspace(() => window.moxiao!.batchAdd({ source: batchSource, defaultForm: newForm })).then(() => { setDialogMode(null); setBatchSource(""); setBatchPreview(null); }); }}>
            <label>默认体裁<select value={newForm} onChange={(event) => { setNewForm(event.target.value); setBatchPreview(null); }}>{Object.entries(formLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
            <label>批量文本<textarea required className="batch-area" value={batchSource} onChange={(event) => { setBatchSource(event.target.value); setBatchPreview(null); }} placeholder={'《第一篇》\n体裁：七绝\n正文……\n---\n第二篇\n正文……'} /></label>
            <p className="dialog-help">使用单独一行 <code>---</code> 分隔作品；第一行作为题名，可用“体裁：七绝”覆盖默认体裁。</p>
            {batchPreview && <section className="batch-preview" aria-label="批量解析预览"><header><strong>解析暂存区</strong><span>{batchPreview.length} 篇 · 尚未写入母本</span></header>{batchPreview.map((item, index) => <div key={`${item.title}-${index}`}><b>{index + 1}</b><span><strong>{item.title}</strong><small>{formLabels[item.form] ?? item.form} · {item.body.length} 字</small></span><Check size={14} /></div>)}</section>}
            <footer><button type="button" className="quiet-button" onClick={() => setDialogMode(null)}>取消</button><button className="primary-button">{batchPreview ? `确认补录 ${batchPreview.length} 篇` : "解析并预览"}</button></footer>
          </form>}
          {dialogMode === "versions" && <div className="version-content"><div className="version-intro"><History size={22} /><div><strong>不可变语义版本</strong><p>版本保存完整母本快照。恢复会生成新的递增修订，不会删除历史记录。</p></div></div>{versions.length ? <div className="version-list">{versions.map((version) => <article key={version.id}><div><strong>{version.label}</strong><span>{new Date(version.createdAt).toLocaleString("zh-CN")}</span><code>{version.snapshotHash.slice(0, 16)}…</code></div><button onClick={() => { if (window.confirm(`恢复“${version.label}”并生成新的工作区修订？`)) void refreshWorkspace(() => window.moxiao!.restoreVersion(version.id)).then(() => setDialogMode(null)); }}>恢复为当前母本</button></article>)}</div> : <div className="version-empty"><Archive size={24} /><strong>尚未生成语义版本</strong><p>在顶部点击“生成版本”后，版本会出现在这里。</p></div>}</div>}
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
                <div className="arrangement-summary"><div><strong>{publicationEntriesForView.filter((entry) => entry.included).length}</strong><span>篇进入成书</span></div><p>筛选决定成书范围，呈现顺序同时作用于左侧清单、目录和最终导出。</p></div>
                <div className="genre-filter-heading"><strong>纳入体裁（可多选）</strong><button onClick={() => updatePublication((project) => ({ ...project, genreFilters: [] }))}>全选</button></div>
                <div className="genre-chip-grid" role="group" aria-label="出版按体裁多选">
                  {[...formCounts.entries()].sort(([left], [right]) => compareLiteraryForms(left, right)).map(([form, count]) => { const active = publicationProject.genreFilters.length === 0 || publicationProject.genreFilters.includes(form); return <button type="button" className={active ? "is-active" : ""} aria-pressed={active} key={form} onClick={() => updatePublication((project) => { const all = [...formCounts.keys()]; const current = project.genreFilters.length ? [...project.genreFilters] : all; const next = current.includes(form) ? current.filter((item) => item !== form) : [...current, form]; return { ...project, genreFilters: next.length === all.length ? [] : next }; })}><span>{literaryFormLabel(form)}</span><small>{count}</small></button>; })}
                </div>
                <div className="form-pair"><label>系年范围<select aria-label="出版按系年筛选" value={publicationProject.chronologyFilter} onChange={(event) => updatePublication((project) => ({ ...project, chronologyFilter: event.target.value as PublicationProject["chronologyFilter"] }))}><option value="all">全部系年</option><option value="dated">已有系年</option><option value="undated">尚未系年</option></select></label><label>预览与导出顺序<select aria-label="出版排序方式" value={publicationProject.sortMode} onChange={(event) => updatePublication((project) => ({ ...project, sortMode: event.target.value as PublicationProject["sortMode"] }))}><option value="author-intent">作者编定</option><option value="chronology-asc">系年由早到晚</option><option value="chronology-desc">系年由晚到早</option><option value="genre">按体裁</option><option value="mood">按意境</option><option value="hybrid">综合策展</option></select></label></div>
                {publicationProject.sortMode !== "author-intent" && <div className="sort-commit"><span>当前为动态排序；手动上移、下移暂不可用。</span><button onClick={commitCurrentPublicationOrder}>固化当前顺序</button></div>}
                <div className="arrangement-actions"><span>生成候选</span>{(["genre", "chronology-asc", "mood", "hybrid"] as const).map((strategy) => <button key={strategy} onClick={() => void proposePublicationArrangement(strategy)}>{{ genre: "体裁", "chronology-asc": "系年", mood: "意境", hybrid: "综合" }[strategy]}</button>)}</div>
                <div className="publication-selection-list">{publicationEntriesForView.map((entry, index) => { const record = records.find((item) => item.id === entry.recordId); if (!record) return null; return <div className={`publication-entry ${publicationRecordId === entry.recordId ? "is-focused" : ""}`} key={entry.recordId}><input aria-label={`收录${titleOf(record)}`} type="checkbox" checked={entry.included} onChange={(event) => updatePublication((project) => ({ ...project, entries: project.entries.map((item) => item.recordId === entry.recordId ? { ...item, included: event.target.checked } : item) }))} /><button className="entry-title" onClick={() => setPublicationRecordId(entry.recordId)}><strong><i>{index + 1}</i>{titleOf(record)}</strong><small>{literaryFormLabel(record.draft.work.form)} · {chronologyOf(record)}{entry.moodTags.length ? ` · ${entry.moodTags.join("、")}` : ""}</small></button><div><button className={entry.locked ? "is-locked" : ""} aria-label={`${entry.locked ? "解锁" : "锁定"}${titleOf(record)}`} onClick={() => updatePublication((project) => ({ ...project, entries: project.entries.map((item) => item.recordId === entry.recordId ? { ...item, locked: !item.locked } : item) }))}><Lock size={11} /></button><button aria-label={`上移${titleOf(record)}`} disabled={publicationProject.sortMode !== "author-intent" || index === 0 || entry.locked} onClick={() => movePublicationEntry(entry.recordId, -1)}>↑</button><button aria-label={`下移${titleOf(record)}`} disabled={publicationProject.sortMode !== "author-intent" || index === publicationEntriesForView.length - 1 || entry.locked} onClick={() => movePublicationEntry(entry.recordId, 1)}>↓</button></div></div>; })}{!publicationEntriesForView.length && <div className="publication-empty">当前筛选没有篇目，请调整体裁或系年范围。</div>}</div>
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
              <fieldset className="typesetting-workshop"><legend>版式工坊</legend>
                <div className="workshop-intro"><div><strong>语义样式矩阵</strong><span>先选版面元素，再独立定义；锁定项不随主题切换改变。</span></div><span>项目格式 1.3</span></div>
                <div className="theme-gallery">{Object.entries(publicationThemes).map(([id, theme]) => <button className={publicationProject.theme.id === id ? "is-active" : ""} key={id} onClick={() => updatePublication((project) => ({ ...project, theme, styleSheet: applyThemeToStyleSheet(project.styleSheet, theme) }))}><span style={{ background: theme.accentColor }} /><strong>{{ sujian: "素笺雅集", qingjian: "青简笺读", contemporary: "当代清集", collector: "典藏书稿" }[id as keyof typeof publicationThemes]}</strong><small>{theme.titleStyle === "left-modern" ? "现代左题" : theme.titleStyle === "numbered" ? "序号篇章" : "居中雅正"}</small></button>)}</div>
                <div className="style-matrix">
                  <nav className="style-role-list" aria-label="版面元素">{semanticStyleRoles.map((role) => <button type="button" className={selectedStyleRole === role ? "is-active" : ""} key={role} onClick={() => setSelectedStyleRole(role)}><span>{semanticStyleRoleLabels[role]}</span><small>{publicationProject.styleSheet.roles[role].locks.length ? `${publicationProject.styleSheet.roles[role].locks.length}项已锁` : publicationProject.styleSheet.roles[role].basedOn ? "继承基准" : "样式根"}</small></button>)}</nav>
                  <section className="style-inspector" aria-label={`${semanticStyleRoleLabels[selectedStyleRole]}属性`}>
                    <header><div><strong>{semanticStyleRoleLabels[selectedStyleRole]}</strong><span>{selectedStyleDefinition?.basedOn ? `基于：${semanticStyleRoleLabels[selectedStyleDefinition.basedOn]}` : "全书样式根"}</span></div><div><button type="button" onClick={restoreSelectedStyleInheritance}>恢复继承</button><button type="button" onClick={lockAllSelectedStyleProperties}><Lock size={10} />锁定全部</button></div></header>
                    <div className="style-property-group"><h4>文字</h4>
                      <label className="style-property-row"><span>字体{selectedStyleDefinition?.properties.fontFamily === undefined && <small>继承</small>}</span><select aria-label={`${semanticStyleRoleLabels[selectedStyleRole]}字体`} value={selectedEffectiveStyle.fontFamily ?? ""} onChange={(event) => updateSelectedStyle("fontFamily", event.target.value)}><option value={'"Songti SC", "STSong", serif'}>宋体</option><option value={'"Kaiti SC", "STKaiti", serif'}>楷体</option><option value={'"PingFang SC", sans-serif'}>苹方</option><option value={'"Noto Serif CJK SC", serif'}>思源宋体</option>{publicationProject.assets.filter((asset) => asset.kind === "font").map((asset) => <option key={asset.id} value={`"${asset.fontFamily}"`}>{asset.fontFamily}</option>)}</select><button type="button" className={selectedStyleDefinition?.locks.includes("fontFamily") ? "is-locked" : ""} onClick={() => toggleSelectedStyleLock("fontFamily")}>{selectedStyleDefinition?.locks.includes("fontFamily") ? <Lock size={11} /> : <Unlock size={11} />}</button></label>
                      {numericStyleControl("fontSizePt", 6, 72, 0.5)}
                      {numericStyleControl("lineHeight", 0.8, 4, 0.05)}
                      {numericStyleControl("letterSpacingEm", -1, 2, 0.01)}
                      <label className="style-property-row"><span>字重{selectedStyleDefinition?.properties.fontWeight === undefined && <small>继承</small>}</span><select value={selectedEffectiveStyle.fontWeight ?? 400} onChange={(event) => updateSelectedStyle("fontWeight", Number(event.target.value) as StyleProperties["fontWeight"])}>{[300, 400, 500, 600, 700].map((weight) => <option value={weight} key={weight}>{weight}</option>)}</select><button type="button" className={selectedStyleDefinition?.locks.includes("fontWeight") ? "is-locked" : ""} onClick={() => toggleSelectedStyleLock("fontWeight")}>{selectedStyleDefinition?.locks.includes("fontWeight") ? <Lock size={11} /> : <Unlock size={11} />}</button></label>
                      <label className="style-property-row"><span>对齐{selectedStyleDefinition?.properties.textAlign === undefined && <small>继承</small>}</span><select value={selectedEffectiveStyle.textAlign ?? "left"} onChange={(event) => updateSelectedStyle("textAlign", event.target.value as StyleProperties["textAlign"])}><option value="left">左齐</option><option value="center">居中</option><option value="right">右齐</option><option value="justify">两端对齐</option></select><button type="button" className={selectedStyleDefinition?.locks.includes("textAlign") ? "is-locked" : ""} onClick={() => toggleSelectedStyleLock("textAlign")}>{selectedStyleDefinition?.locks.includes("textAlign") ? <Lock size={11} /> : <Unlock size={11} />}</button></label>
                      <label className="style-property-row"><span>文字颜色{selectedStyleDefinition?.properties.color === undefined && <small>继承</small>}</span><input aria-label={`${semanticStyleRoleLabels[selectedStyleRole]}文字颜色`} type="color" value={selectedEffectiveStyle.color ?? "#20241f"} onChange={(event) => updateSelectedStyle("color", event.target.value)} /><button type="button" className={selectedStyleDefinition?.locks.includes("color") ? "is-locked" : ""} onClick={() => toggleSelectedStyleLock("color")}>{selectedStyleDefinition?.locks.includes("color") ? <Lock size={11} /> : <Unlock size={11} />}</button></label>
                    </div>
                    <div className="style-property-group"><h4>段落与留白</h4>{numericStyleControl("textIndentEm", 0, 8, 0.25)}{numericStyleControl("spaceBeforeEm", 0, 10, 0.1)}{numericStyleControl("spaceAfterEm", 0, 10, 0.1)}{numericStyleControl("paddingEm", 0, 8, 0.1)}</div>
                    <div className="style-property-group"><h4>装饰</h4><div className="decoration-grid">{(["underline", "ruleAbove", "ruleBelow", "border"] as const).map((key) => <label key={key}><input type="checkbox" checked={selectedEffectiveStyle[key] ?? false} onChange={(event) => updateSelectedStyle(key, event.target.checked)} /><span>{stylePropertyLabels[key]}</span><button type="button" className={selectedStyleDefinition?.locks.includes(key) ? "is-locked" : ""} onClick={(event) => { event.preventDefault(); toggleSelectedStyleLock(key); }}>{selectedStyleDefinition?.locks.includes(key) ? <Lock size={10} /> : <Unlock size={10} />}</button></label>)}</div>{numericStyleControl("borderRadiusPt", 0, 36, 0.5)}<label className="style-property-row"><span>底色{selectedStyleDefinition?.properties.backgroundColor === undefined && <small>继承</small>}</span><input aria-label={`${semanticStyleRoleLabels[selectedStyleRole]}底色`} type="color" value={selectedEffectiveStyle.backgroundColor ?? "#fffef9"} onChange={(event) => updateSelectedStyle("backgroundColor", event.target.value)} /><button type="button" className={selectedStyleDefinition?.locks.includes("backgroundColor") ? "is-locked" : ""} onClick={() => toggleSelectedStyleLock("backgroundColor")}>{selectedStyleDefinition?.locks.includes("backgroundColor") ? <Lock size={11} /> : <Unlock size={11} />}</button></label></div>
                  </section>
                </div>
                <div className="layout-panel"><div className="media-section-title"><strong>开本与版心</strong><span>{publicationProject.layoutSpecification.standardReference.code} · {publicationProject.layoutSpecification.trimSizeMm.join(" × ")} mm</span></div><div className="form-pair"><label>开本<select value={publicationProject.profile.pageSize} onChange={(event) => updatePublication((project) => { const pageSize = event.target.value as PublicationProject["profile"]["pageSize"]; const layoutSpecification = createDefaultLayoutSpecification(pageSize, project.profile.customPageSizeMm); return { ...project, profile: { ...project.profile, pageSize, marginsMm: { top: layoutSpecification.marginsMm.top, bottom: layoutSpecification.marginsMm.bottom, left: layoutSpecification.marginsMm.inside, right: layoutSpecification.marginsMm.outside } }, layoutSpecification }; })}><option value="A4">A4 · 210 × 297</option><option value="A5">A5 · 148 × 210</option><option value="B5">B5 · 176 × 250</option></select></label><label>分栏<select value={publicationProject.layoutSpecification.columns} onChange={(event) => updatePublication((project) => ({ ...project, layoutSpecification: { ...project.layoutSpecification, columns: Number(event.target.value) as 1 | 2 } }))}><option value="1">单栏</option><option value="2">双栏</option></select></label></div>
                  <div className="margin-grid">{(["top", "bottom", "inside", "outside"] as const).map((key) => <label key={key}>{{ top: "上边距", bottom: "下边距", inside: "内侧", outside: "外侧" }[key]}<input type="number" min="0" max="80" step="0.5" value={publicationProject.layoutSpecification.marginsMm[key]} onChange={(event) => updatePublication((project) => { const marginsMm = { ...project.layoutSpecification.marginsMm, [key]: Number(event.target.value) }; return { ...project, layoutSpecification: { ...project.layoutSpecification, marginsMm }, profile: { ...project.profile, marginsMm: { top: marginsMm.top, bottom: marginsMm.bottom, left: marginsMm.inside, right: marginsMm.outside } } }; })} /></label>)}</div>
                  <div className="form-pair"><label className="switch-label"><input type="checkbox" checked={publicationProject.layoutSpecification.facingPages} onChange={(event) => updatePublication((project) => ({ ...project, layoutSpecification: { ...project.layoutSpecification, facingPages: event.target.checked }, profile: { ...project.profile, mirrorMargins: event.target.checked } }))} />对页与镜像边距</label><label className="switch-label"><input type="checkbox" checked={publicationProject.layoutSpecification.baselineGrid.enabled} onChange={(event) => updatePublication((project) => ({ ...project, layoutSpecification: { ...project.layoutSpecification, baselineGrid: { ...project.layoutSpecification.baselineGrid, enabled: event.target.checked } } }))} />启用基线网格</label></div>
                  <div className="form-pair"><label>栏间距（mm）<input type="number" min="0" max="30" step="0.5" value={publicationProject.layoutSpecification.columnGapMm} onChange={(event) => updatePublication((project) => ({ ...project, layoutSpecification: { ...project.layoutSpecification, columnGapMm: Number(event.target.value) } }))} /></label><label>基线增量（pt）<input type="number" min="4" max="72" step="0.25" value={publicationProject.layoutSpecification.baselineGrid.incrementPt} onChange={(event) => updatePublication((project) => ({ ...project, layoutSpecification: { ...project.layoutSpecification, baselineGrid: { ...project.layoutSpecification.baselineGrid, incrementPt: Number(event.target.value) } } }))} /></label></div>
                </div>
                <div className="form-pair"><label>章首留白<select value={publicationProject.theme.chapterOpening} onChange={(event) => updatePublication((project) => ({ ...project, theme: { ...project.theme, chapterOpening: event.target.value as typeof project.theme.chapterOpening } }))}><option value="classic">经典章首</option><option value="compact">紧凑章首</option><option value="full-page">典藏大留白</option></select></label><label>版心宽度<input type="range" min="28" max="52" step="1" value={publicationProject.theme.contentWidthEm} onChange={(event) => updatePublication((project) => ({ ...project, theme: { ...project.theme, contentWidthEm: Number(event.target.value) } }))} /><small>{publicationProject.theme.contentWidthEm} 字宽</small></label></div>
                <button className="asset-button" onClick={() => void addPublicationAsset("font")}><Upload size={14} />导入授权字体</button>{publicationProject.assets.filter((asset) => asset.kind === "font").map((asset) => <div className="asset-editor asset-editor-row" key={asset.id}><span>{asset.fontFamily}</span><select aria-label={`${asset.fontFamily}使用权`} value={asset.rights} onChange={(event) => updatePublication((project) => ({ ...project, assets: project.assets.map((item) => item.id === asset.id ? { ...item, rights: event.target.value as PublicationAsset["rights"] } : item) }))}><option value="unknown">授权待确认</option><option value="owned">自有字体</option><option value="licensed">已获嵌入授权</option><option value="public-domain">开放许可</option></select><button onClick={() => updatePublication((project) => ({ ...project, assets: project.assets.filter((item) => item.id !== asset.id) }))}>移除</button></div>)}
                <label className="switch-label"><input type="checkbox" checked={publicationProject.profile.requireEmbeddedFonts} onChange={(event) => updatePublication((project) => ({ ...project, profile: { ...project.profile, requireEmbeddedFonts: event.target.checked } }))} />要求成品嵌入字体</label>
              </fieldset>
              <fieldset><legend>纸张与页眉</legend><label>纸张<select value={publicationProject.profile.pageSize} onChange={(event) => updatePublication((project) => ({ ...project, profile: { ...project.profile, pageSize: event.target.value as PublicationProject["profile"]["pageSize"] } }))}><option value="A4">A4</option><option value="A5">A5</option><option value="B5">B5</option></select></label><label className="switch-label"><input type="checkbox" checked={publicationProject.profile.runningContent.enabled} onChange={(event) => updatePublication((project) => ({ ...project, profile: { ...project.profile, runningContent: { ...project.profile.runningContent, enabled: event.target.checked } } }))} />启用页眉页脚</label><label>页眉<input value={publicationProject.profile.runningContent.headerTemplate} onChange={(event) => updatePublication((project) => ({ ...project, profile: { ...project.profile, runningContent: { ...project.profile.runningContent, headerTemplate: event.target.value } } }))} /></label><label>页脚<input value={publicationProject.profile.runningContent.footerTemplate} onChange={(event) => updatePublication((project) => ({ ...project, profile: { ...project.profile, runningContent: { ...project.profile.runningContent, footerTemplate: event.target.value } } }))} /></label></fieldset>
              <fieldset><legend>水印</legend><label className="switch-label"><input type="checkbox" checked={publicationProject.profile.watermark.enabled} onChange={(event) => updatePublication((project) => ({ ...project, profile: { ...project.profile, watermark: { ...project.profile.watermark, enabled: event.target.checked } } }))} />启用</label><label>文字<input value={publicationProject.profile.watermark.content} onChange={(event) => updatePublication((project) => ({ ...project, profile: { ...project.profile, watermark: { ...project.profile.watermark, content: event.target.value } } }))} /></label></fieldset>
              <fieldset><legend>交付目标</legend><label>格式<select aria-label="目标客户端" value={publicationProject.target} onChange={(event) => updatePublication((project) => ({ ...project, target: event.target.value as PublicationProject["target"] }))}><option value="pdf">通用屏幕 PDF</option><option value="epub">EPUB 3.3 可重排电子书</option><option value="xianxinzimo">闲心子墨暂存内容包</option><option value="webpub">通用 WebPub 内容包</option></select></label>{publicationProject.target === "pdf" && <label>PDF 规范<select value={publicationProject.profile.pdfProfile} onChange={(event) => updatePublication((project) => ({ ...project, profile: { ...project.profile, pdfProfile: event.target.value as PublicationProject["profile"]["pdfProfile"] } }))}><option value="screen">通用屏幕 PDF</option><option value="PDF/X-4">PDF/X-4 印刷</option><option value="PDF/A-2b">PDF/A-2b 归档</option><option value="PDF/UA-1">PDF/UA-1 无障碍</option></select></label>}{publicationProject.target === "epub" && <><label>阅读器兼容配置<select aria-label="电子书兼容配置" value={publicationProject.ebookProfile} onChange={(event) => updatePublication((project) => ({ ...project, ebookProfile: event.target.value as PublicationProject["ebookProfile"] }))}><option value="universal">通用 EPUB 3.3</option><option value="apple-books">Apple Books</option><option value="wechat-reading">中文阅读器兼容基线</option></select></label><div className="standards-note"><strong>可重排优先</strong><p>目录、阅读顺序、语义地标、替代文字和深浅色适配按 EPUB 3.3 封装。平台最终验收仍以其发行后台规则为准。</p></div></>}</fieldset>
              <div className={`preflight-card ${publicationIssues.some((issue) => issue.severity === "error") ? "has-errors" : "is-ready"}`}>
                <div className="preflight-heading"><div><strong>{publicationIssues.length ? `预检待处理 ${publicationAssetTasks.length + publicationOtherIssues.length} 项` : "预检通过，可安全导出"}</strong>{publicationIssues.length > publicationAssetTasks.length + publicationOtherIssues.length && <small>已将 {publicationIssues.length} 条检查结果按素材归并，避免重复修正</small>}</div>{publicationAssetTasks.some((task) => !task.asset.alt.trim()) && <button onClick={generateMissingAltDrafts}><Sparkles size={12} />生成替代文字草稿</button>}</div>
                {publicationIssues.length > 0 && <p className="preflight-guidance">可直接在此修正，不必返回各篇逐项查找。替代文字可生成草稿；使用权必须依据真实权属确认。</p>}
                <div className="preflight-task-list">
                  {publicationAssetTasks.map(({ asset, issues, recordIds, titles }) => <section className="preflight-asset-task" key={asset.id}>
                    {asset.dataUri && asset.kind !== "font" ? <img src={asset.dataUri} alt="待预检素材缩略图" /> : <span className="preflight-file-mark">{asset.kind === "font" ? "字" : "图"}</span>}
                    <div className="preflight-task-copy"><strong>{asset.fileName}</strong><small>{titles.length ? `用于：${titles.join("、")}` : issues.map((issue) => issue.message).join("；")}</small></div>
                    <label>替代文字<input aria-label={`${asset.fileName}替代文字`} value={asset.alt} placeholder="描述图像传达的信息，而非文件名" onChange={(event) => updatePublication((project) => ({ ...project, assets: project.assets.map((item) => item.id === asset.id ? { ...item, alt: event.target.value } : item) }))} /></label>
                    <label>使用权<select aria-label={`${asset.fileName}使用权`} value={asset.rights} onChange={(event) => updatePublication((project) => ({ ...project, assets: project.assets.map((item) => item.id === asset.id ? { ...item, rights: event.target.value as PublicationAsset["rights"] } : item) }))}><option value="unknown">待确认</option><option value="owned">作者自有</option><option value="licensed">已获授权</option><option value="public-domain">公版</option></select></label>
                    <button className="preflight-locate" onClick={() => { if (recordIds[0]) setPublicationRecordId(recordIds[0]); setPublicationStep("media"); }}>在插图页查看</button>
                  </section>)}
                  {publicationOtherIssues.map((issue) => <div className="preflight-other-task" key={issue.code}><span className={issue.severity === "error" ? "is-error" : "is-warning"}>{issue.severity === "error" ? "阻" : "提"}</span><p>{issue.message}</p>{issue.fixStep && issue.fixStep !== "export" && <button onClick={() => setPublicationStep(issue.fixStep!)}>去修正</button>}</div>)}
                </div>
              </div>
              <button className="primary-button export-pdf-button" disabled={publicationBusy || publicationIssues.some((issue) => issue.severity === "error")} onClick={() => void exportPublication()}>{publicationBusy ? <LoaderCircle size={15} className="spin" /> : publicationProject.target === "epub" ? <BookOpenText size={15} /> : <FileOutput size={15} />} 导出并验证{{ pdf: " PDF", epub: " EPUB", xianxinzimo: "闲心子墨包", webpub: " WebPub 包" }[publicationProject.target]}</button>
              {publicationReceipt && <p className="publication-receipt">{publicationReceipt}</p>}
            </aside>
            <div className={`publication-preview preview-${previewDevice}`}><div className="preview-toolbar"><span>实时成书预览</span><div className="preview-devices" role="group" aria-label="预览设备">{(["page", "tablet", "phone"] as const).map((device) => <button className={previewDevice === device ? "is-active" : ""} key={device} onClick={() => setPreviewDevice(device)}>{{ page: "书页", tablet: "平板", phone: "手机" }[device]}</button>)}</div><span>{publicationProject.profile.pageSize} · {publicationProject.target.toLocaleUpperCase()}</span></div><iframe title="出版分页预览" sandbox="" srcDoc={publicationHtml} /></div>
          </div>}
        </section>}
      </div>}
    </main>
  );
}
