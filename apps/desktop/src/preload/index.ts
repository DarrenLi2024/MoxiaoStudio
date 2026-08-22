import { contextBridge, ipcRenderer } from "electron";
import type { EditorialWorkspace } from "@moxiao/editorial";
import type { AssistantProviderSettings, AssistantRun, AssistantRunResult, AssistantSuggestion } from "@moxiao/assistant";
import type { SemanticVersionReceipt } from "@moxiao/storage";
import type { ArrangementProposal, PreflightResult, PublicationAsset, PublicationDocument, PublicationProject, RendererCapabilities } from "@moxiao/publication";

export interface MoxiaoRuntimeInfo {
  readonly platform: NodeJS.Platform;
  readonly appVersion: string;
  readonly localFirst: boolean;
}

export interface DuplicateView {
  left: { id: string; title: string };
  right: { id: string; title: string };
  reasons: string[];
  comparison: Array<{ left: string | null; right: string | null; status: "same" | "left-only" | "right-only" }>;
}

export interface PublicationPreviewView {
  project: PublicationProject;
  document: PublicationDocument;
  html: string;
  preflight: PreflightResult;
  capabilities: RendererCapabilities;
}

export interface PublicationExportReceipt {
  canceled: boolean;
  filePath?: string;
  contentHash?: string;
  profile?: string;
  validation?: { ok: boolean; pageCount?: number; entryCount?: number; byteLength: number; issues: Array<{ severity: "error" | "warning"; code: string; message: string }> };
}

const api = {
  runtime: (): Promise<MoxiaoRuntimeInfo> => ipcRenderer.invoke("moxiao:runtime"),
  loadWorkspace: (): Promise<EditorialWorkspace> => ipcRenderer.invoke("moxiao:workspace:load"),
  saveWorkspace: (workspace: EditorialWorkspace): Promise<EditorialWorkspace> => ipcRenderer.invoke("moxiao:workspace:save", workspace),
  importWorkspace: (): Promise<unknown> => ipcRenderer.invoke("moxiao:workspace:import"),
  exportWorkspace: (): Promise<unknown> => ipcRenderer.invoke("moxiao:workspace:export"),
  clearWorkspace: (): Promise<unknown> => ipcRenderer.invoke("moxiao:workspace:clear"),
  addWork: (input: { title: string; form: string; body: string }): Promise<EditorialWorkspace> => ipcRenderer.invoke("moxiao:workspace:add", input),
  batchAdd: (input: { source: string; defaultForm: string }): Promise<EditorialWorkspace> => ipcRenderer.invoke("moxiao:workspace:batch-add", input),
  previewBatch: (input: { source: string; defaultForm: string }): Promise<Array<{ title: string; form: string; body: string }>> => ipcRenderer.invoke("moxiao:workspace:batch-preview", input),
  duplicates: (): Promise<DuplicateView[]> => ipcRenderer.invoke("moxiao:workspace:duplicates"),
  resolveDuplicate: (removeId: string | null): Promise<EditorialWorkspace> => ipcRenderer.invoke("moxiao:workspace:resolve-duplicate", { removeId }),
  createVersion: (label: string): Promise<unknown> => ipcRenderer.invoke("moxiao:workspace:create-version", label),
  listVersions: (): Promise<SemanticVersionReceipt[]> => ipcRenderer.invoke("moxiao:workspace:list-versions"),
  restoreVersion: (versionId: string): Promise<EditorialWorkspace> => ipcRenderer.invoke("moxiao:workspace:restore-version", versionId),
  assistantSettings: (): Promise<AssistantProviderSettings> => ipcRenderer.invoke("moxiao:assistant:settings"),
  saveAssistantSettings: (input: { engine: AssistantProviderSettings["engine"]; endpoint: string; model: string; apiKey?: string; clearCredential?: boolean }): Promise<AssistantProviderSettings> => ipcRenderer.invoke("moxiao:assistant:save-settings", input),
  assistantRuns: (): Promise<AssistantRun[]> => ipcRenderer.invoke("moxiao:assistant:runs"),
  assistantSuggestions: (): Promise<AssistantSuggestion[]> => ipcRenderer.invoke("moxiao:assistant:suggestions"),
  runAssistant: (input: { recordIds: string[]; scope: "selected" | "filtered" }): Promise<AssistantRunResult> => ipcRenderer.invoke("moxiao:assistant:run", input),
  decideAssistantSuggestion: (input: { suggestionId: string; decision: "accepted" | "rejected" }): Promise<{ suggestion: AssistantSuggestion; workspace: EditorialWorkspace }> => ipcRenderer.invoke("moxiao:assistant:decide", input),
  publicationProjects: (): Promise<PublicationProject[]> => ipcRenderer.invoke("moxiao:publication:projects"),
  publicationProject: (projectId?: string): Promise<PublicationProject> => ipcRenderer.invoke("moxiao:publication:project", projectId),
  createPublicationProject: (title: string): Promise<PublicationProject> => ipcRenderer.invoke("moxiao:publication:create-project", title),
  savePublicationProject: (project: PublicationProject): Promise<PublicationProject> => ipcRenderer.invoke("moxiao:publication:save-project", project),
  generatePublicationFrontMatter: (project: PublicationProject): Promise<PublicationProject> => ipcRenderer.invoke("moxiao:publication:generate-frontmatter", project),
  proposePublicationArrangement: (project: PublicationProject, strategy: ArrangementProposal["strategy"]): Promise<PublicationProject> => ipcRenderer.invoke("moxiao:publication:propose-arrangement", project, strategy),
  selectPublicationAsset: (input: { kind: PublicationAsset["kind"]; attachedRecordId?: string }): Promise<{ canceled: boolean; asset?: PublicationAsset }> => ipcRenderer.invoke("moxiao:publication:select-asset", input),
  publicationPreview: (project?: PublicationProject): Promise<PublicationPreviewView> => ipcRenderer.invoke("moxiao:publication:preview", project),
  exportPublication: (project: PublicationProject): Promise<PublicationExportReceipt> => ipcRenderer.invoke("moxiao:publication:export", project)
};

contextBridge.exposeInMainWorld("moxiao", api);
export type MoxiaoApi = typeof api;
