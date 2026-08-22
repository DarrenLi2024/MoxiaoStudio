import { resolve } from "node:path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: ["@moxiao/assistant", "@moxiao/domain", "@moxiao/editorial", "@moxiao/storage", "@moxiao/publication"] })]
  },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: ["@moxiao/editorial", "@moxiao/storage"] })],
    build: {
      rollupOptions: {
        output: { format: "cjs", entryFileNames: "index.cjs" }
      }
    }
  },
  renderer: {
    resolve: {
      alias: {
        "@renderer": resolve("src/renderer")
      }
    },
    plugins: [react()]
  }
});
