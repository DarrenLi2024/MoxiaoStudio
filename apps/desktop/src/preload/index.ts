import { contextBridge, ipcRenderer } from "electron";

export interface MoxiaoRuntimeInfo {
  readonly platform: NodeJS.Platform;
  readonly appVersion: string;
  readonly localFirst: boolean;
}

contextBridge.exposeInMainWorld("moxiao", {
  runtime: (): Promise<MoxiaoRuntimeInfo> => ipcRenderer.invoke("moxiao:runtime")
});
