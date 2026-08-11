import type { MoxiaoApi } from "../../preload";

declare global {
  interface Window {
    moxiao?: MoxiaoApi;
  }
}

export {};
