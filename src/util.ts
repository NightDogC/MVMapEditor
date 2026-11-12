export const $ = <T extends HTMLElement = HTMLElement>(s: string): T => document.querySelector(s) as T;
export const uid = (p: string): string => p + "_" + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);
/** A fresh id for a stamp group, type or tier value: `prefix_` + six random base-36 characters, none of `used`
    (mvmap-ue.js usedCategoryIds), so it is also safe as a UE typeId and an icon file name. */
export function newCategoryId(used: ReadonlySet<string>, prefix: string): string {
  for (;;) {
    const id = `${prefix}_${Math.random().toString(36).slice(2).padEnd(6, "0").slice(0, 6)}`;
    if (!used.has(id)) return id;
  }
}
export const clamp =(v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
export const ck = (x: number, y: number): string => x + "," + y;
export const unck = (s: string): [number, number] => {
  const i = s.indexOf(",");
  return [+s.slice(0, i), +s.slice(i + 1)];
};
export const esc = (s: unknown): string =>
  String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function hexInt(hex: string): number {
  const h = hex.replace("#", "");
  return parseInt(h.length === 3 ? h.replace(/./g, "$&$&") : h, 16);
}
export function hexA(hex: string, a: number): string {
  const n = hexInt(hex);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
export function shade(hex: string, amt: number): string {
  const n = hexInt(hex);
  const f = (v: number) => clamp(Math.round(v + 255 * amt), 0, 255);
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
export const slug = (s: string): string => (s || "map").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "map";

/** localStorage that never throws (private windows, blocked storage). */
export const prefs = {
  get(k: string): string | null {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k: string, v: string): void {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* storage blocked */
    }
  },
};
