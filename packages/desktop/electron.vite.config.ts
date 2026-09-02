import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "electron-vite";
import solid from "vite-plugin-solid";

export default defineConfig({
  main: {
    build: { rollupOptions: { input: resolve(__dirname, "src/main/index.ts") } },
  },
  preload: {
    build: { rollupOptions: { input: resolve(__dirname, "src/preload/index.ts") } },
  },
  renderer: {
    root: resolve(__dirname, "src/renderer"),
    plugins: [solid(), tailwindcss()],
    build: { rollupOptions: { input: resolve(__dirname, "src/renderer/index.html") } },
    resolve: { alias: { "@": resolve(__dirname, "src/renderer") } },
  },
});
