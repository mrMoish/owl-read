import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        s1: resolve(__dirname, "s1/index.html"),
        s2: resolve(__dirname, "s2/index.html"),
        s3: resolve(__dirname, "s3/index.html"),
        s4: resolve(__dirname, "s4/index.html"),
        en: resolve(__dirname, "en/index.html"),
        es: resolve(__dirname, "es/index.html"),
        ru: resolve(__dirname, "ru/index.html"),
      },
    },
  },
  server: { port: 5173, proxy: { "/api": "http://127.0.0.1:8000" } },
  preview: { proxy: { "/api": "http://127.0.0.1:8000" } },
});
