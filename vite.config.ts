import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const host = process.env.TAURI_DEV_HOST;

export default defineConfig(async () => ({
  plugins: [vue()],

  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },

  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
  optimizeDeps: {
    exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util', '@ffmpeg/core'],
  },
}));
