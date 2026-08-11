import type { MoxiaoRuntimeInfo } from "../../preload";

declare global {
  interface Window {
    moxiao?: {
      runtime(): Promise<MoxiaoRuntimeInfo>;
    };
  }
}

export {};
