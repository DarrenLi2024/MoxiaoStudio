import { createHash } from "node:crypto";
import { readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { app, BrowserWindow, dialog, ipcMain, nativeTheme } from "electron";
import {
  compareDuplicatePair,
  createNewRecord,
  createWorkspace,
  digest,
  findDuplicates,
  importLegacyWorkspace,
  markForDeletion,
  mergeWorkspace,
  nextSequence,
  parseBatchSource,
  stableStringify,
  type EditorialWorkspace
} from "@moxiao/editorial";
import { WorkspaceStore } from "@moxiao/storage";
import {
  chromiumRendererCapabilities,
  createDefaultPublicationProfile,
  electronPrintOptions,
  renderPublicationHtml,
  validatePdfBytes,
  validatePublication,
  validatePublicationProfile,
  type PublicationDocument,
  type PublicationProfile
} from "@moxiao/publication";
import { createEntityId } from "@moxiao/domain";

const WORKSPACE_ID = "local-main";
const FORM_LABELS = {
  qijue: "七绝",
  wujue: "五绝",
  qilv: "七律",
  wulv: "五律",
  ci: "词",
  xinshi: "新诗",
  sanwen: "散文",
  suibi: "随笔",
  duilian: "对联"
} as const;

let store: WorkspaceStore | null = null;

if (process.env.MOXIAO_THEME === "dark" || process.env.MOXIAO_THEME === "light") {
  nativeTheme.themeSource = process.env.MOXIAO_THEME;
}

if (process.env.MOXIAO_PROFILE) {
  const profile = process.env.MOXIAO_PROFILE.replace(/[^a-zA-Z0-9_-]/gu, "-");
  app.setPath("userData", join(tmpdir(), `moxiao-${profile}`));
}

function createDemoWorkspace(): EditorialWorkspace {
  const samples = [
    ["春山小记", "sanwen", "雨后入山，石径新润。\n松风过处，远峰如在淡墨之间。\n行至溪桥，忽闻一声鸟鸣，才知春意已深。"],
    ["江城夜雨", "qijue", "灯影沿江细作鳞，\n雨声催客夜将深。\n隔窗未见归舟动，\n一片潮音到枕心。"],
    ["归途", "xinshi", "暮色把站台放远\n一盏灯替我记得\n那些尚未说完的话\n仍在风里缓慢返乡"],
    ["书房札记", "suibi", "旧书最可亲处，不只在字句，也在翻阅者留下的时间。\n一处折角，一点淡墨，往往比题记更早说出它的来历。"],
    ["临江仙·秋思", "ci", "雁影低回云外，\n晚风轻过汀洲。\n一江秋色入归舟。\n灯前人未语，月下水长流。"]
  ] as const;
  const records = samples.map(([title, form, body], index) => createNewRecord({ title, form, body, sequence: index + 1 }));
  for (const [index, record] of records.entries()) {
    record.draft.work.compositionNote = index === 0 ? "本篇为界面演示文本，用于验证段落、系年和笺读之间的结构关系。" : "演示数据，不进入用户正式母本。";
    record.draft.chronologyResearch.display = index === 3 ? "" : `${2020 + index}年`;
    record.draft.chronologyResearch.startYear = index === 3 ? null : 2020 + index;
    record.draft.chronologyResearch.endYear = index === 3 ? null : 2020 + index;
    record.draft.chronologyResearch.precision = index === 3 ? "unknown" : "year";
    record.editorState.status = index === 0 || index === 3 ? "editing" : "reviewed";
  }
  return createWorkspace("full", records);
}

function activeStore(): WorkspaceStore {
  if (!store) throw new Error("本地数据库尚未就绪");
  return store;
}

function loadWorkspace(): EditorialWorkspace {
  const workspace = activeStore().loadWorkspace(WORKSPACE_ID);
  if (!workspace) throw new Error("本地工作区不存在");
  return workspace;
}

function saveWorkspace(workspace: EditorialWorkspace): EditorialWorkspace {
  return activeStore().saveWorkspace(WORKSPACE_ID, workspace, workspace.revision);
}

function atomicWrite(filePath: string, value: string | Uint8Array): void {
  const temporary = `${filePath}.${process.pid}.tmp`;
  if (typeof value === "string") writeFileSync(temporary, value, { encoding: "utf8", mode: 0o600 });
  else writeFileSync(temporary, value, { mode: 0o600 });
  renameSync(temporary, filePath);
}

function publicationDocument(workspace: EditorialWorkspace): PublicationDocument {
  const activeRecords = workspace.records.filter((record) => record.operation !== "delete");
  return {
    id: createEntityId(),
    expressionId: createEntityId(),
    expressionHash: `sha256:${digest(workspace)}`,
    title: "本地文学项目",
    language: "zh-CN",
    sections: activeRecords.map((record) => {
      const work = record.draft.work;
      const reading = record.draft.reading;
      const blocks: PublicationDocument["sections"][number]["blocks"][number][] = [];
      if (work.prose?.trim()) blocks.push({ type: "paragraph", text: work.prose.trim() });
      else blocks.push({ type: "verse", lines: work.lines });
      if (work.compositionNote?.trim()) blocks.push({ type: "annotation", marker: "创作题注", text: work.compositionNote.trim() });
      if (reading?.translation?.trim()) blocks.push({ type: "heading", level: 2, text: "今译" }, { type: "paragraph", text: reading.translation.trim() });
      for (const annotation of reading?.annotations ?? []) blocks.push({ type: "annotation", marker: annotation.anchor, text: annotation.note });
      if (reading?.appreciation?.trim()) blocks.push({ type: "heading", level: 2, text: "赏析" }, { type: "paragraph", text: reading.appreciation.trim() });
      return { id: record.entityId, role: "body" as const, title: work.editorialTitle?.trim() || work.title.trim() || "未题名", blocks };
    })
  };
}

function publicationPreview(profileValue?: PublicationProfile): {
  profile: PublicationProfile;
  document: PublicationDocument;
  html: string;
  preflight: ReturnType<typeof validatePublication>;
  capabilities: typeof chromiumRendererCapabilities;
} {
  const profile = profileValue ? validatePublicationProfile(profileValue) : createDefaultPublicationProfile(createEntityId());
  const document = publicationDocument(loadWorkspace());
  return { profile, document, html: renderPublicationHtml(document, profile), preflight: validatePublication(document, profile, chromiumRendererCapabilities), capabilities: chromiumRendererCapabilities };
}

async function exportPublication(profile: PublicationProfile): Promise<unknown> {
  const preview = publicationPreview(profile);
  if (!preview.document.sections.length) throw new Error("工作区没有可出版作品");
  if (!preview.preflight.ok) throw new Error(`出版预检未通过：${preview.preflight.issues.map((issue) => issue.message).join("；")}`);
  let filePath = process.env.MOXIAO_E2E_PDF_PATH;
  if (!filePath) {
    const selection = await dialog.showSaveDialog({ title: "导出排印 PDF", defaultPath: "墨校台-排印稿.pdf", filters: [{ name: "PDF", extensions: ["pdf"] }] });
    if (selection.canceled || !selection.filePath) return { canceled: true };
    filePath = selection.filePath;
  }
  const printWindow = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
  printWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  try {
    await printWindow.loadURL(`data:text/html;base64,${Buffer.from(preview.html).toString("base64")}`);
    await printWindow.webContents.executeJavaScript("document.fonts.ready.then(() => true)");
    const bytes = await printWindow.webContents.printToPDF(electronPrintOptions(profile));
    const validation = validatePdfBytes(bytes);
    if (!validation.ok) throw new Error(`PDF 导出验证失败：${validation.issues.map((issue) => issue.message).join("；")}`);
    atomicWrite(filePath, bytes);
    const contentHash = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
    return { canceled: false, filePath, contentHash, validation, profile: profile.pdfProfile };
  } finally {
    printWindow.destroy();
  }
}

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1480,
    height: 940,
    minWidth: 960,
    minHeight: 680,
    show: false,
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#171917" : "#f3f4f0",
    webPreferences: {
      preload: join(__dirname, "../preload/index.cjs"),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  window.once("ready-to-show", () => window.show());
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event) => event.preventDefault());
  if (process.env.ELECTRON_RENDERER_URL) void window.loadURL(process.env.ELECTRON_RENDERER_URL);
  else void window.loadFile(join(__dirname, "../renderer/index.html"));
}

function registerIpc(): void {
  ipcMain.handle("moxiao:runtime", () => ({ platform: process.platform, appVersion: app.getVersion(), localFirst: true }));
  ipcMain.handle("moxiao:workspace:load", () => loadWorkspace());
  ipcMain.handle("moxiao:workspace:save", (_event, value: unknown) => saveWorkspace(importLegacyWorkspace(value)));
  ipcMain.handle("moxiao:workspace:create-version", (_event, label: string) => activeStore().createSemanticVersion(WORKSPACE_ID, label));
  ipcMain.handle("moxiao:workspace:list-versions", () => activeStore().listSemanticVersions(WORKSPACE_ID));

  ipcMain.handle("moxiao:workspace:import", async () => {
    const selection = await dialog.showOpenDialog({
      title: "导入墨校台审校包",
      properties: ["openFile"],
      filters: [{ name: "墨校台审校包", extensions: ["json"] }]
    });
    if (selection.canceled || !selection.filePaths[0]) return { canceled: true };
    if (statSync(selection.filePaths[0]).size > 50 * 1024 * 1024) throw new Error("审校包超过 50 MB 安全上限");
    const incoming = JSON.parse(readFileSync(selection.filePaths[0], "utf8")) as unknown;
    const result = mergeWorkspace(loadWorkspace(), incoming);
    const workspace = saveWorkspace(result.workspace);
    return { canceled: false, ...result, workspace };
  });

  ipcMain.handle("moxiao:workspace:export", async () => {
    const selection = await dialog.showSaveDialog({
      title: "导出墨校台审校包",
      defaultPath: `墨校台-审校包-${new Date().toISOString().slice(0, 10)}.json`,
      filters: [{ name: "JSON", extensions: ["json"] }]
    });
    if (selection.canceled || !selection.filePath) return { canceled: true };
    atomicWrite(selection.filePath, `${stableStringify(loadWorkspace(), 2)}\n`);
    return { canceled: false, filePath: selection.filePath };
  });

  ipcMain.handle("moxiao:workspace:clear", async () => {
    const current = loadWorkspace();
    const selection = await dialog.showSaveDialog({
      title: "备份后清空工作区",
      defaultPath: `墨校台-清空前备份-${new Date().toISOString().replace(/[:.]/gu, "-")}.json`,
      filters: [{ name: "JSON", extensions: ["json"] }]
    });
    if (selection.canceled || !selection.filePath) return { canceled: true };
    atomicWrite(selection.filePath, `${stableStringify(current, 2)}\n`);
    const workspace = saveWorkspace({ ...structuredClone(current), records: [] });
    return { canceled: false, backupPath: selection.filePath, workspace };
  });

  ipcMain.handle("moxiao:workspace:add", (_event, input: { title: string; form: string; body: string }) => {
    if (!input || typeof input.title !== "string" || typeof input.body !== "string" || typeof input.form !== "string") throw new Error("新增作品参数无效");
    if (!FORM_LABELS[input.form as keyof typeof FORM_LABELS] || !input.title.trim() || input.title.length > 300 || !input.body.trim() || input.body.length > 2_000_000) throw new Error("新增作品内容为空或超过安全上限");
    const workspace = loadWorkspace();
    workspace.records.push(createNewRecord({ ...input, sequence: nextSequence(workspace) }));
    return saveWorkspace(workspace);
  });

  ipcMain.handle("moxiao:workspace:batch-add", (_event, input: { source: string; defaultForm: string }) => {
    if (!input || typeof input.source !== "string" || typeof input.defaultForm !== "string" || input.source.length > 10_000_000 || !FORM_LABELS[input.defaultForm as keyof typeof FORM_LABELS]) throw new Error("批量补录参数无效或超过 10 MB 安全上限");
    const workspace = loadWorkspace();
    const parsed = parseBatchSource(input.source, input.defaultForm, FORM_LABELS);
    const first = nextSequence(workspace);
    workspace.records.push(...parsed.map((entry, index) => createNewRecord({ ...entry, sequence: first + index })));
    return saveWorkspace(workspace);
  });

  ipcMain.handle("moxiao:workspace:duplicates", () => {
    const workspace = loadWorkspace();
    const records = workspace.records.filter((record) => record.operation !== "delete");
    const matches = findDuplicates(records);
    return matches.map((match) => {
      const left = records.find((record) => record.id === match.left.id)!;
      const right = records.find((record) => record.id === match.right.id)!;
      return { ...match, comparison: compareDuplicatePair(left, right) };
    });
  });

  ipcMain.handle("moxiao:workspace:resolve-duplicate", (_event, input: { removeId: string | null }) => {
    const workspace = loadWorkspace();
    if (!input.removeId) return workspace;
    const index = workspace.records.findIndex((record) => record.id === input.removeId);
    if (index < 0) throw new Error(`查重记录不存在：${input.removeId}`);
    const record = workspace.records[index]!;
    const marked = markForDeletion(record);
    if (marked) workspace.records[index] = marked;
    else workspace.records.splice(index, 1);
    return saveWorkspace(workspace);
  });
  ipcMain.handle("moxiao:publication:preview", (_event, profile?: PublicationProfile) => publicationPreview(profile));
  ipcMain.handle("moxiao:publication:export", (_event, profile: PublicationProfile) => exportPublication(profile));
}

app.whenReady().then(() => {
  store = new WorkspaceStore(join(app.getPath("userData"), "moxiao.sqlite"));
  if (!store.hasWorkspace(WORKSPACE_ID)) store.initializeWorkspace(WORKSPACE_ID, createDemoWorkspace());
  registerIpc();
  createWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
app.on("before-quit", () => { store?.close(); store = null; });
