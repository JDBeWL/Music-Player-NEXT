import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const host = process.env.TAURI_DEV_HOST;

export default defineConfig(async ({ command }) => ({
  plugins: [vue()],

  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },

  css: {
    devSourcemap: command === 'serve',
  },

  build: {
    target: ["es2022", "chrome100", "safari15"],
    minify: "esbuild",
    cssMinify: "esbuild",
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes('node_modules')) {
            if (/vue|vue-router|pinia/.test(id)) return 'vue';
            if (/@ffmpeg/.test(id)) return 'ffmpeg';
            if (/@material\/material-color-utilities/.test(id)) return 'material';
            if (/lucide-vue-next/.test(id)) return 'icons';
            if (/@vueuse/.test(id)) return 'vueuse';
            if (/radix-vue/.test(id)) return 'radix';
            if (/@tauri-apps/.test(id)) return 'tauri';
            return 'vendor';
          }
        },
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: (assetInfo) => {
          const info = assetInfo.name || '';
          if (info.endsWith('.css')) return 'assets/[name]-[hash][extname]';
          if (/\.(png|jpe?g|gif|svg|webp|ico)$/.test(info)) return 'assets/images/[name]-[hash][extname]';
          if (/\.(woff2?|ttf|otf|eot)$/.test(info)) return 'assets/fonts/[name]-[hash][extname]';
          return 'assets/[name]-[hash][extname]';
        },
      },
    },
    sourcemap: false,
    reportCompressedSize: false,
    chunkSizeWarningLimit: 600,
    emptyOutDir: true,
  },

  esbuild: {
    drop: command === 'build' ? ['console', 'debugger'] : [],
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
      "Cross-Origin-Embedder-Policy": "credentialless",
    },
  },
  optimizeDeps: {
    exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util', '@ffmpeg/core'],
    include: ['vue', 'vue-router', 'pinia', '@vueuse/core'],
  },
}));
