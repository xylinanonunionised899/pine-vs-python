import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(rootDir, "./src"),
      "@shared": path.resolve(rootDir, "../shared/typescript"),
    },
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
  },
});
