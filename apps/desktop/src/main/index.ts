import { createHash } from "node:crypto";
import { readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { app, BrowserWindow, dialog, ipcMain, nativeImage, nativeTheme } from "electron";
import {
  compareDuplicatePair,
  createNewRecord,
  createWorkspace,
  findDuplicates,
  importLegacyWorkspace,
  markForDeletion,
  matchesStarterWorkspace,
  mergeWorkspace,
  nextSequence,
  parseBatchSource,
  stableStringify,
  type EditorialWorkspace
} from "@moxiao/editorial";
import { WorkspaceStore } from "@moxiao/storage";
import {
  chromiumRendererCapabilities,
  contentPackageRendererCapabilities,
  electronPrintOptions,
  epubRendererCapabilities,
  literaryFormLabels,
  renderEpub,
  renderPublicationHtml,
  validateEpubBytes,
  validatePdfBytes,
  validatePublication,
  validatePublicationProfile,
  validatePublicationProject,
  type ArrangementProposal,
  type PublicationAsset,
  type PublicationProject
} from "@moxiao/publication";
import { createEntityId } from "@moxiao/domain";
import {
  LOCAL_PUBLICATION_PROJECT_ID,
  createDefaultPublicationProject,
  generateFrontMatter,
  publicationAssets,
  publicationDocument,
  proposeArrangement,
  synchronizePublicationProject,
  targetPackage
} from "./publication-workflow";

const WORKSPACE_ID = "local-main";
const FORM_LABELS = literaryFormLabels;

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

function loadPublicationProject(projectId: string = LOCAL_PUBLICATION_PROJECT_ID): PublicationProject {
  const workspace = loadWorkspace();
  const stored = activeStore().loadPublicationProject<PublicationProject>(WORKSPACE_ID, projectId);
  const project = synchronizePublicationProject(stored ? validatePublicationProject(stored) : createDefaultPublicationProject(workspace), workspace);
  if (!stored || stableStringify(project) !== stableStringify(stored)) activeStore().savePublicationProject(WORKSPACE_ID, project.id, project);
  return project;
}

function savePublicationProject(value: unknown): PublicationProject {
  const project = synchronizePublicationProject(validatePublicationProject(value), loadWorkspace());
  validatePublicationProfile(project.profile);
  return activeStore().savePublicationProject(WORKSPACE_ID, project.id, { ...project, updatedAt: new Date().toISOString() });
}

function renderingProject(value?: unknown): PublicationProject {
  const project = synchronizePublicationProject(value ? validatePublicationProject(value) : loadPublicationProject(), loadWorkspace());
  const profile = validatePublicationProfile({
    ...project.profile,
    bodyFont: project.theme.bodyFont,
    headingFont: project.theme.headingFont,
    baseFontPt: project.theme.baseFontPt,
    lineHeight: project.theme.lineHeight,
    accentColor: project.theme.accentColor,
    ornament: project.theme.ornament
  });
  return { ...project, profile };
}

function publicationPreview(projectValue?: unknown): {
  project: PublicationProject;
  document: ReturnType<typeof publicationDocument>;
  html: string;
  preflight: ReturnType<typeof validatePublication>;
  capabilities: typeof chromiumRendererCapabilities;
} {
  const project = renderingProject(projectValue);
  const assets = publicationAssets(project);
  const document = publicationDocument(loadWorkspace(), project);
  const capabilities = project.target === "pdf" ? chromiumRendererCapabilities : project.target === "epub" ? epubRendererCapabilities : contentPackageRendererCapabilities;
  const validationProfile = project.target === "pdf" ? project.profile : {
    ...project.profile,
    bleedMm: 0,
    cropMarks: false,
    mirrorMargins: false,
    watermark: { ...project.profile.watermark, enabled: false },
    runningContent: { ...project.profile.runningContent, enabled: false, differentOddEven: false },
    pdfProfile: "screen" as const
  };
  const basePreflight = validatePublication(document, validationProfile, capabilities, assets);
  const issues = [...basePreflight.issues];
  if (!document.sections.some((section) => section.role === "body")) issues.push({ severity: "error" as const, code: "document.body.empty", message: "当前筛选条件下没有可出版篇目" });
  if (project.frontMatter.includeCopyright && !project.frontMatter.copyright.rightsHolder.trim()) issues.push({ severity: "error" as const, code: "copyright.holder.required", message: "版权页尚未填写版权所有者" });
  const publicRelease = project.frontMatter.copyright.publicationType !== "private";
  if (project.frontMatter.copyright.publicationType === "publisher" && !project.frontMatter.copyright.publisher.trim()) issues.push({ severity: "error" as const, code: "publisher.required", message: "出版社出版需填写出版社名称" });
  if (project.frontMatter.includePreface && project.frontMatter.preface.status === "draft") issues.push({ severity: publicRelease ? "error" as const : "warning" as const, code: "preface.unconfirmed", message: "前言仍为待确认草稿" });
  if (project.frontMatter.includeAuthorBio && project.frontMatter.author.biography.status === "draft") issues.push({ severity: publicRelease ? "error" as const : "warning" as const, code: "author-biography.unconfirmed", message: "作者简介仍为待确认草稿" });
  if (project.target === "epub") {
    const cover = project.assets.find((asset) => asset.kind === "cover");
    if (!cover) issues.push({ severity: "warning" as const, code: "epub.cover.recommended", message: "电子书尚未设置封面；发行平台通常要求独立封面" });
    if (project.ebookProfile === "apple-books" && cover?.pixelWidth && cover.pixelHeight && Math.min(cover.pixelWidth, cover.pixelHeight) < 1_400) issues.push({ severity: "warning" as const, code: "apple-books.cover.resolution", message: "Apple Books 封面短边建议至少 1400 像素" });
  }
  const records = new Map(loadWorkspace().records.map((record) => [record.id, record]));
  for (const placement of project.placements) {
    const anchor = placement.anchorText?.trim();
    if (placement.role !== "inline" || !anchor) continue;
    const record = records.get(placement.recordId);
    const body = record?.draft.work.prose?.trim() || record?.draft.work.lines.join("\n") || "";
    if (!body.includes(anchor)) issues.push({ severity: "warning" as const, code: `illustration.anchor.missing.${placement.assetId}`, message: `${record?.draft.work.editorialTitle || record?.draft.work.title || "篇目"}的插图锚点未命中，将置于正文后` });
  }
  const preflight = { ok: issues.every((issue) => issue.severity !== "error"), issues };
  return { project, document, html: renderPublicationHtml(document, project.profile, assets, project.theme), preflight, capabilities };
}

async function exportPublication(projectValue: unknown): Promise<unknown> {
  const project = savePublicationProject(projectValue);
  const preview = publicationPreview(project);
  if (!preview.document.sections.length) throw new Error("工作区没有可出版作品");
  if (!preview.preflight.ok) throw new Error(`出版预检未通过：${preview.preflight.issues.map((issue) => issue.message).join("；")}`);
  if (project.target === "epub") {
    let filePath = process.env.MOXIAO_E2E_EPUB_PATH;
    if (!filePath) {
      const selection = await dialog.showSaveDialog({ title: "导出 EPUB 3", defaultPath: `${project.title}.epub`, filters: [{ name: "EPUB", extensions: ["epub"] }] });
      if (selection.canceled || !selection.filePath) return { canceled: true };
      filePath = selection.filePath;
    }
    const bytes = renderEpub(preview.document, project, publicationAssets(project));
    const validation = validateEpubBytes(bytes);
    if (!validation.ok) throw new Error(`EPUB 导出验证失败：${validation.issues.map((issue) => issue.message).join("；")}`);
    atomicWrite(filePath, bytes);
    return { canceled: false, filePath, contentHash: `sha256:${createHash("sha256").update(bytes).digest("hex")}`, validation, profile: "EPUB 3" };
  }
  if (project.target === "xianxinzimo" || project.target === "webpub") {
    const selection = await dialog.showSaveDialog({ title: "导出目标客户端暂存包", defaultPath: `${project.title}-${project.target}.json`, filters: [{ name: "JSON", extensions: ["json"] }] });
    if (selection.canceled || !selection.filePath) return { canceled: true };
    const payload = targetPackage(loadWorkspace(), project, preview.document);
    atomicWrite(selection.filePath, payload);
    return { canceled: false, filePath: selection.filePath, contentHash: `sha256:${createHash("sha256").update(payload).digest("hex")}`, validation: { ok: true, entryCount: preview.document.sections.length, byteLength: Buffer.byteLength(payload), issues: [] }, profile: project.target };
  }
  let filePath = process.env.MOXIAO_E2E_PDF_PATH;
  if (!filePath) {
    const selection = await dialog.showSaveDialog({ title: "导出排印 PDF", defaultPath: "墨校台-排印稿.pdf", filters: [{ name: "PDF", extensions: ["pdf"] }] });
    if (selection.canceled || !selection.filePath) return { canceled: true };
    filePath = selection.filePath;
  }
  const printHtmlPath = join(tmpdir(), `moxiao-print-${process.pid}-${createEntityId()}.html`);
  writeFileSync(printHtmlPath, preview.html, { encoding: "utf8", flag: "wx", mode: 0o600 });
  let printWindow: BrowserWindow | undefined;
  try {
    printWindow = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
    printWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    await printWindow.loadFile(printHtmlPath);
    await printWindow.webContents.executeJavaScript("document.fonts.ready.then(() => true)");
    const bytes = await printWindow.webContents.printToPDF(electronPrintOptions(project.profile));
    const validation = validatePdfBytes(bytes);
    if (!validation.ok) throw new Error(`PDF 导出验证失败：${validation.issues.map((issue) => issue.message).join("；")}`);
    atomicWrite(filePath, bytes);
    const contentHash = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
    return { canceled: false, filePath, contentHash, validation, profile: project.profile.pdfProfile };
  } finally {
    if (printWindow && !printWindow.isDestroyed()) printWindow.destroy();
    unlinkSync(printHtmlPath);
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
  ipcMain.handle("moxiao:publication:projects", () => {
    loadPublicationProject();
    return activeStore().listPublicationProjects<PublicationProject>(WORKSPACE_ID).map((project) => synchronizePublicationProject(validatePublicationProject(project), loadWorkspace()));
  });
  ipcMain.handle("moxiao:publication:project", (_event, projectId?: string) => loadPublicationProject(projectId));
  ipcMain.handle("moxiao:publication:create-project", (_event, title: string) => {
    if (typeof title !== "string" || !title.trim() || title.length > 300) throw new Error("新出版项目书名无效");
    const project = { ...createDefaultPublicationProject(loadWorkspace(), new Date().toISOString(), createEntityId()), title: title.trim() };
    return activeStore().savePublicationProject(WORKSPACE_ID, project.id, project);
  });
  ipcMain.handle("moxiao:publication:save-project", (_event, value: unknown) => savePublicationProject(value));
  ipcMain.handle("moxiao:publication:generate-frontmatter", (_event, value: unknown) => savePublicationProject(generateFrontMatter(loadWorkspace(), validatePublicationProject(value))));
  ipcMain.handle("moxiao:publication:propose-arrangement", (_event, value: unknown, strategy: ArrangementProposal["strategy"]) => {
    if (!( ["genre", "chronology-asc", "chronology-desc", "mood", "hybrid"] as const).includes(strategy)) throw new Error("智能编排策略无效");
    return proposeArrangement(loadWorkspace(), validatePublicationProject(value), strategy);
  });
  ipcMain.handle("moxiao:publication:select-asset", async (_event, input: { kind: PublicationAsset["kind"]; attachedRecordId?: string }) => {
    if (!input || !(["cover", "illustration", "font", "ornament", "portrait"] as const).includes(input.kind)) throw new Error("资产类型无效");
    const filters = input.kind === "font" ? [{ name: "字体", extensions: ["otf", "ttf", "woff", "woff2"] }] : [{ name: "图像", extensions: ["png", "jpg", "jpeg", "webp"] }];
    let filePath = process.env.MOXIAO_E2E_ASSET_PATH;
    if (!filePath) {
      const selection = await dialog.showOpenDialog({ title: input.kind === "cover" ? "选择封面" : input.kind === "illustration" ? "选择插图" : "选择出版资产", properties: ["openFile"], filters });
      if (selection.canceled || !selection.filePaths[0]) return { canceled: true };
      filePath = selection.filePaths[0];
    }
    if (statSync(filePath).size > 12 * 1024 * 1024) throw new Error("单个出版资产超过 12 MB 安全上限");
    const extension = filePath.split(".").pop()?.toLocaleLowerCase() ?? "";
    const mediaType = ({ png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", otf: "font/otf", ttf: "font/ttf", woff: "font/woff", woff2: "font/woff2" } as Record<string, string>)[extension];
    if (!mediaType) throw new Error("不支持的出版资产格式");
    const bytes = readFileSync(filePath);
    const id = createEntityId();
    const dimensions = input.kind === "font" ? undefined : nativeImage.createFromBuffer(bytes).getSize();
    return { canceled: false, asset: { id, kind: input.kind, fileName: filePath.split("/").pop()!, mediaType, dataUri: `data:${mediaType};base64,${bytes.toString("base64")}`, alt: "", rights: "unknown", ...(dimensions?.width && dimensions.height ? { pixelWidth: dimensions.width, pixelHeight: dimensions.height } : {}), ...(input.kind === "font" ? { fontFamily: `墨校字体-${id.slice(0, 8)}` } : {}), ...(input.attachedRecordId ? { attachedRecordId: input.attachedRecordId } : {}) } satisfies PublicationAsset };
  });

  ipcMain.handle("moxiao:workspace:import", async () => {
    let filePath = process.env.MOXIAO_E2E_IMPORT_PATH;
    if (!filePath) {
      const selection = await dialog.showOpenDialog({
        title: "导入墨校台审校包",
        properties: ["openFile"],
        filters: [{ name: "墨校台审校包", extensions: ["json"] }]
      });
      if (selection.canceled || !selection.filePaths[0]) return { canceled: true };
      filePath = selection.filePaths[0];
    }
    if (statSync(filePath).size > 50 * 1024 * 1024) throw new Error("审校包超过 50 MB 安全上限");
    const incoming = JSON.parse(readFileSync(filePath, "utf8")) as unknown;
    const current = loadWorkspace();
    const result = mergeWorkspace(current, incoming, { replaceStarterWorkspace: matchesStarterWorkspace(current, createDemoWorkspace()) });
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
  ipcMain.handle("moxiao:publication:preview", (_event, project?: unknown) => publicationPreview(project));
  ipcMain.handle("moxiao:publication:export", (_event, project: unknown) => exportPublication(project));
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
