import { defineConfig } from "vite";
import { copyFileSync, mkdirSync } from "node:fs";

// The pdf.js worker is shipped as a plain .js asset (the Anna bundle uploader
// only accepts standard web MIME types) and loaded lazily when a PDF is picked.
function copyPdfWorker() {
  return {
    name: "podcastit-copy-pdf-worker",
    buildStart() {
      mkdirSync("public/vendor", { recursive: true });
      copyFileSync(
        "node_modules/pdfjs-dist/build/pdf.worker.min.mjs",
        "public/vendor/pdf.worker.min.js",
      );
    },
  };
}

export default defineConfig(({ mode }) => ({
  // Relative asset paths: Anna serves the bundle under /anna-apps/<slug>/<version>/.
  base: "./",
  plugins: [copyPdfWorker()],
  oxc: { jsx: { runtime: "automatic", importSource: "preact" } },
  build: {
    outDir: mode === "mock" ? "dist-mock" : "bundle",
    emptyOutDir: true,
    target: "es2022",
    assetsDir: "assets",
    sourcemap: false,
  },
  server: { port: 5199, strictPort: true },
  preview: { port: 5198, strictPort: true },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
}));
