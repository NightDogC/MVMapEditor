import { clamp } from "../util.ts";
import { CELL } from "../model/constants.ts";
import { S } from "../state/store.ts";
import { UE, ELEMENT_TYPES } from "../ue.ts";
import type { ElementLayer } from "../model/types.ts";

// The stamp-icon export script (export_mvmap_stamp_icons.py) reads FONTF and the stamp font line in render/ from
// these sources — keep both spelled exactly like this.
export const FONTF = `ui-sans-serif, system-ui, "Segoe UI", Roboto, sans-serif`;

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  r = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export const edgeThickness = (z: number): number => clamp(CELL * z * 0.16, 2.5, 9);

/** Diagonal hatch laid over structure fills so they read differently from rooms. */
const hatchCache = new WeakMap<CanvasRenderingContext2D, CanvasPattern | null>();
export function hatchPattern(ctx: CanvasRenderingContext2D): CanvasPattern | null {
  if (hatchCache.has(ctx)) return hatchCache.get(ctx)!;
  const c = document.createElement("canvas");
  c.width = c.height = 8;
  const g = c.getContext("2d")!;
  g.strokeStyle = "rgba(8,10,14,0.38)";
  g.lineWidth = 1.6;
  g.beginPath();
  g.moveTo(-2, 10);
  g.lineTo(10, -2);
  g.moveTo(-2, 2);
  g.lineTo(2, -2);
  g.moveTo(6, 10);
  g.lineTo(10, 6);
  g.stroke();
  const p = ctx.createPattern(c, "repeat");
  hatchCache.set(ctx, p);
  return p;
}

/* Elements the UE importer won't generate (manual types, and 未分类 ones) get a dashed outline and a badge on each
   piece; "Highlight hand-placed only" fades everything else. */
export const MARK_STYLE = {
  manual: { color: "#ffb02e", glyph: "手", dash: [6, 4] },
  unclassified: { color: "#ff4d5e", glyph: "?", dash: [2, 3] },
};
export const MARK_FADE = 0.18;
export const markOf = (it: { typeId?: string | null; name: string }, layer: ElementLayer) => UE.manualMarkOf(it, layer, ELEMENT_TYPES);
/** Draw alpha for an element: faded when highlighting hand-placed elements and this one is generated. */
export const markAlpha = (it: { typeId?: string | null; name: string }, layer: ElementLayer): number =>
  S.highlightManual && !markOf(it, layer) ? MARK_FADE : 1;
