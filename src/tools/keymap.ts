/* Configurable tool shortcuts (stored per browser). Only the left-panel drawing tools can be rebound. */
import type { Tool } from "../state/store.ts";
import { prefs } from "../util.ts";

/** Tools on the left panel, in panel order. */
export const TOOL_LIST: { id: Tool; name: string }[] = [
  { id: "select", name: "Select / move" },
  { id: "paint", name: "Paint cells" },
  { id: "rect", name: "Rectangle fill" },
  { id: "erase", name: "Erase cells" },
  { id: "door", name: "Door" },
  { id: "key", name: "Key" },
  { id: "pan", name: "Pan" },
  { id: "spaint", name: "Structure paint" },
  { id: "srect", name: "Structure rectangle" },
  { id: "serase", name: "Structure erase" },
  { id: "edge", name: "Edge structure" },
  { id: "stamp", name: "Emoji stamp" },
  { id: "note", name: "Note" },
  { id: "pencil", name: "Pencil" },
  { id: "perase", name: "Pencil eraser" },
];
export const DEFAULT_TOOL_KEYS: Record<Tool, string> = {
  select: "v", paint: "b", rect: "r", erase: "e", door: "d", key: "k", pan: "h",
  spaint: "s", srect: "t", serase: "x", edge: "p", stamp: "m", note: "n", pencil: "l", perase: "q",
};
/** Keys the map view already uses for something else; a tool can't take them. */
export const RESERVED_KEYS: Record<string, string> = {
  " ": "Space — hold to pan",
  f: "F — zoom to fit",
  enter: "Enter — grey-box the selected room",
  escape: "Esc — deselect",
  delete: "Del — delete selection",
  backspace: "Backspace — delete selection",
  "[": "[ — move selection up",
  "]": "] — move selection down",
  tab: "Tab — keyboard focus",
};

let toolKeys: Record<string, string> = Object.assign({}, DEFAULT_TOOL_KEYS); // tool -> key
let keyTools: Record<string, Tool> = {}; // key -> tool
const KEYS_LS = "mvmap:keys";

export const toolForKey = (k: string): Tool | undefined => keyTools[k];
export const currentToolKeys = (): Record<string, string> => Object.assign({}, toolKeys);

/** A keydown's key as stored in the keymap: one lower-cased printable character, or a named key. */
export const normKey = (k: string): string => (k && Array.from(k).length === 1 ? k.toLowerCase() : String(k || "").toLowerCase());
export const keyLabel = (k: string): string =>
  k === " " ? "Space" : Array.from(k).length === 1 ? k.toUpperCase() : k.charAt(0).toUpperCase() + k.slice(1);
export const toolName = (id: string): string => (TOOL_LIST.find((t) => t.id === id) || { name: id }).name;

/** Why `k` can't be a tool shortcut, or null when it can. */
export function keyProblem(k: string): string | null {
  if (!k) return "That isn't a key.";
  if (RESERVED_KEYS[k]) return `${keyLabel(k)} is reserved (${RESERVED_KEYS[k]}).`;
  if (Array.from(k).length !== 1 || /\s/.test(k)) return `${keyLabel(k)} can't be used — pick a letter, digit or symbol key.`;
  return null;
}
/** Validate a full tool -> key map; returns an error message or null. */
export function keymapProblem(map: Record<string, unknown>): string | null {
  const seen: Record<string, string> = {};
  for (const t of TOOL_LIST) {
    const k = map[t.id];
    if (typeof k !== "string") return `No key for ${t.name}.`;
    const bad = keyProblem(k);
    if (bad) return `${t.name}: ${bad}`;
    if (seen[k]) return `${keyLabel(k)} is assigned to both ${toolName(seen[k])} and ${t.name}.`;
    seen[k] = t.id;
  }
  return null;
}
export function applyToolKeys(map: Record<string, string>): void {
  toolKeys = {};
  keyTools = {};
  for (const t of TOOL_LIST) {
    toolKeys[t.id] = map[t.id];
    keyTools[map[t.id]] = t.id;
  }
  document.querySelectorAll<HTMLElement>("#tools [data-tool]").forEach((b) => {
    const k = toolKeys[b.dataset.tool!];
    const kb = b.querySelector(".kb");
    if (kb) kb.textContent = keyLabel(k);
    b.title = `${toolName(b.dataset.tool!)} (${keyLabel(k)})${b.dataset.tool === "pan" ? " · or hold Space" : ""}`;
  });
}
export const saveToolKeys = (): void => prefs.set(KEYS_LS, JSON.stringify(toolKeys));
/** Read a stored or imported keymap: missing tools fall back to defaults, keys are normalised. */
export function readKeymap(obj: unknown): Record<string, string> {
  const o = obj && typeof obj === "object" ? (obj as Record<string, unknown>) : {};
  const src = (o.keys && typeof o.keys === "object" ? o.keys : o) as Record<string, unknown>;
  const map: Record<string, string> = {};
  for (const t of TOOL_LIST) if (typeof src[t.id] === "string") map[t.id] = normKey(src[t.id] as string);
  // tools the source doesn't mention (e.g. added in a later version) get their default, or the first free key if a
  // custom binding already took it
  const used = new Set(Object.values(map));
  for (const t of TOOL_LIST) {
    if (map[t.id] !== undefined) continue;
    let k = DEFAULT_TOOL_KEYS[t.id];
    if (used.has(k)) k = Array.from("abcdefghijklmnopqrstuvwxyz0123456789").find((c) => !used.has(c) && !RESERVED_KEYS[c])!;
    map[t.id] = k;
    used.add(k);
  }
  return map;
}
export function loadToolKeys(): void {
  let map: Record<string, string> = DEFAULT_TOOL_KEYS;
  try {
    const raw = prefs.get(KEYS_LS);
    if (raw) {
      const m = readKeymap(JSON.parse(raw));
      if (!keymapProblem(m)) map = m;
    }
  } catch {
    /* bad stored keymap: defaults */
  }
  applyToolKeys(map);
}
