import { readFileSync } from "node:fs";
import { defineConfig, type Plugin } from "vite";

/** The UE vocabulary and helpers stay plain classic scripts at the repo root (shared with node tests and the
    icon export script), so the build copies them next to index.html instead of bundling them. */
function copyClassicScripts(files: string[]): Plugin {
  return {
    name: "copy-classic-scripts",
    apply: "build",
    generateBundle() {
      for (const f of files) this.emitFile({ type: "asset", fileName: f, source: readFileSync(f, "utf8") });
    },
  };
}

export default defineConfig({
  base: "./", // relative URLs: the same build works at /MVMapEditor/ and /MVMapEditor/next/
  plugins: [copyClassicScripts(["mvmap-types.js", "mvmap-ue.js"])],
  build: { outDir: "dist", emptyOutDir: true },
});
