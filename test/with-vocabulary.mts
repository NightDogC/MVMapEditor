// Import first (before anything from src/): gives node the globals index.html sets up in the browser, the real
// vocabulary (mvmap-types.js) and helpers (mvmap-ue.js), so src/ue.ts and everything using it work as in the editor.
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
(globalThis as Record<string, unknown>).window = {
  MVMapTypes: require("../mvmap-types.js"),
  MVMapUE: require("../mvmap-ue.js"),
};
