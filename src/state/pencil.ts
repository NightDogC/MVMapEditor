/* Pencil: freehand strokes in world px, off the grid, not part of any room or structure. */
import type { PencilStroke } from "../model/types.ts";
import { S } from "./store.ts";
import { uid } from "../util.ts";

const penBoxes = new WeakMap<number[], { x0: number; y0: number; x1: number; y1: number }>(); // pts array -> bbox
export function penBox(st: PencilStroke) {
  let b = penBoxes.get(st.pts);
  if (!b) {
    b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    for (let i = 0; i < st.pts.length; i += 2) {
      const x = st.pts[i], y = st.pts[i + 1];
      if (x < b.x0) b.x0 = x;
      if (x > b.x1) b.x1 = x;
      if (y < b.y0) b.y0 = y;
      if (y > b.y1) b.y1 = y;
    }
    penBoxes.set(st.pts, b);
  }
  return b;
}
/** Squared distance from (px,py) to segment a-b. */
export function segDist2(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay;
  const L = dx * dx + dy * dy;
  let t = L ? ((px - ax) * dx + (py - ay) * dy) / L : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const qx = ax + t * dx - px, qy = ay + t * dy - py;
  return qx * qx + qy * qy;
}
/** The stroke's points with extra ones inserted so no gap is longer than `step`. */
function resample(pts: number[], step: number): number[] {
  const out = [pts[0], pts[1]];
  for (let i = 2; i < pts.length; i += 2) {
    const ax = pts[i - 2], ay = pts[i - 1], bx = pts[i], by = pts[i + 1];
    const n = Math.ceil(Math.hypot(bx - ax, by - ay) / step);
    for (let k = 1; k <= n; k++) out.push(ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n);
  }
  return out;
}
/** Drop points that sit within `tol` of a straight line between their neighbours (Ramer–Douglas–Peucker). */
export function simplify(pts: number[], tol: number): number[] {
  const n = pts.length / 2;
  if (n < 3) return pts.slice();
  const keep = new Uint8Array(n);
  keep[0] = keep[n - 1] = 1;
  const stack: [number, number][] = [[0, n - 1]], t2 = tol * tol;
  while (stack.length) {
    const [a, b] = stack.pop()!;
    let far = -1, fd = t2;
    for (let i = a + 1; i < b; i++) {
      const d = segDist2(pts[2 * i], pts[2 * i + 1], pts[2 * a], pts[2 * a + 1], pts[2 * b], pts[2 * b + 1]);
      if (d > fd) {
        fd = d;
        far = i;
      }
    }
    if (far > 0) {
      keep[far] = 1;
      stack.push([a, far], [far, b]);
    }
  }
  const out: number[] = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(pts[2 * i], pts[2 * i + 1]);
  return out;
}
export const roundPt = (v: number): number => Math.round(v * 10) / 10;

/** Erase pencil ink under an eraser of radius R swept from a to b (world px). Strokes it touches are cut, leaving
    the pieces either side as separate strokes. Returns true when anything changed. */
export function erasePencil(ax: number, ay: number, bx: number, by: number, R: number): boolean {
  let changed = false;
  const out: PencilStroke[] = [];
  for (const st of S.doc.pencil) {
    const reach = R + st.size / 2; // a point closer than this would leave ink under the eraser
    const b = penBox(st);
    if (b.x1 < Math.min(ax, bx) - reach || b.x0 > Math.max(ax, bx) + reach || b.y1 < Math.min(ay, by) - reach || b.y0 > Math.max(ay, by) + reach) {
      out.push(st);
      continue;
    }
    const r2 = reach * reach;
    const pts = resample(st.pts, Math.max(0.5, Math.min(st.size, R) / 2));
    const pieces: number[][] = [];
    let cur: number[] = [], hit = false;
    for (let i = 0; i < pts.length; i += 2) {
      if (segDist2(pts[i], pts[i + 1], ax, ay, bx, by) < r2) {
        hit = true;
        if (cur.length) pieces.push(cur);
        cur = [];
      } else cur.push(pts[i], pts[i + 1]);
    }
    if (!hit) {
      out.push(st);
      continue;
    }
    if (cur.length) pieces.push(cur);
    changed = true;
    pieces.forEach((pc, i) => out.push({ id: i === 0 ? st.id : uid("pen"), color: st.color, size: st.size, pts: simplify(pc, 0.35).map(roundPt) }));
  }
  if (changed) S.doc.pencil = out;
  return changed;
}
