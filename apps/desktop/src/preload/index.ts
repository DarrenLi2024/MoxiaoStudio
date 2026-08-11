import { contextBridge, ipcRenderer } from "electron";
import type { EditorialWorkspace } from "@moxiao/editorial";
import type { PreflightResult, PublicationDocument, PublicationProfile, RendererCapabilities } from "@moxiao/publication";

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
  profile: PublicationProfile;
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
  validation?: { ok: boolean; pageCount: number; byteLength: number; issues: Array<{ severity: "error" | "warning"; code: string; message: string }> };
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
  duplicates: (): Promise<DuplicateView[]> => ipcRenderer.invoke("moxiao:workspace:duplicates"),
  resolveDuplicate: (removeId: string | null): Promise<EditorialWorkspace> => ipcRenderer.invoke("moxiao:workspace:resolve-duplicate", { removeId }),
  createVersion: (label: string): Promise<unknown> => ipcRenderer.invoke("moxiao:workspace:create-version", label),
  listVersions: (): Promise<unknown> => ipcRenderer.invoke("moxiao:workspace:list-versions"),
  publicationPreview: (profile?: PublicationProfile): Promise<PublicationPreviewView> => ipcRenderer.invoke("moxiao:publication:preview", profile),
  exportPublication: (profile: PublicationProfile): Promise<PublicationExportReceipt> => ipcRenderer.invoke("moxiao:publication:export", profile)
};

contextBridge.exposeInMainWorld("moxiao", api);
export type MoxiaoApi = typeof api;
