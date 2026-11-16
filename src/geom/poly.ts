/* Simple polygons in ticks, for structure cuts (negative space): a structure's solid area is its rects minus its cuts.

   A cut drawn by hand has its vertices on the tick lattice. Clipping one against rectangles (when area is painted back
   over it, or a piece of the structure moves away from it) puts new vertices on the rectangle's sides; those keep the
   side's exact coordinate on one axis and may be fractional on the other. Every clip here is against an axis-aligned
   line and returns proper separate polygons, never zero-width bridges between them. */
import { normalize, type TRect } from "./region.ts";

export interface XY {
  x: number;
  y: number;
}
export type TPoly = XY[];
type Box = { x0: number; y0: number; x1: number; y1: number };

/** Areas below this (ticks²) are slivers left by rounding, not shape. */
const AREA_EPS = 1e-3;

/** Signed area; positive when the vertices run clockwise on screen (x right, y down). */
export function signedArea(p: readonly XY[]): number {
  let a = 0;
  for (let i = 0, n = p.length; i < n; i++) {
    const q = p[i], r = p[(i + 1) % n];
    a += q.x * r.y - r.x * q.y;
  }
  return a / 2;
}
export const polyArea = (p: readonly XY[]): number => Math.abs(signedArea(p));
/** The same polygon with a positive signed area (clockwise on screen). */
export const orient = (p: TPoly): TPoly => (signedArea(p) < 0 ? [...p].reverse() : p);

export function polyBBox(p: readonly XY[]): Box {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const v of p) {
    x0 = Math.min(x0, v.x);
    y0 = Math.min(y0, v.y);
    x1 = Math.max(x1, v.x);
    y1 = Math.max(y1, v.y);
  }
  return { x0, y0, x1, y1 };
}
/** Boxes share some area (touching edges don't count). */
const boxesOverlap = (a: Box, r: TRect) => a.x0 < r.x + r.w && r.x < a.x1 && a.y0 < r.y + r.h && r.y < a.y1;
const boxInside = (a: Box, r: TRect) => a.x0 >= r.x && a.x1 <= r.x + r.w && a.y0 >= r.y && a.y1 <= r.y + r.h;

/** Point strictly inside (crossing number; points on the boundary may go either way). */
export function pointInPoly(p: readonly XY[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const a = p[i], b = p[j];
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

export const translatePoly = (p: readonly XY[], dx: number, dy: number): TPoly => p.map((v) => ({ x: v.x + dx, y: v.y + dy }));

/** Drop repeated and collinear vertices; null when nothing with area is left. */
export function cleanPoly(p: readonly XY[]): TPoly | null {
  let out: TPoly = [];
  for (const v of p) {
    const last = out[out.length - 1];
    if (!last || Math.abs(last.x - v.x) > 1e-9 || Math.abs(last.y - v.y) > 1e-9) out.push(v);
  }
  while (out.length > 1 && Math.abs(out[0].x - out[out.length - 1].x) <= 1e-9 && Math.abs(out[0].y - out[out.length - 1].y) <= 1e-9) out.pop();
  // collinear points (a straight run through a vertex, or a spike folding back on itself)
  let changed = true;
  while (changed && out.length >= 3) {
    changed = false;
    for (let i = 0; i < out.length; i++) {
      const a = out[(i + out.length - 1) % out.length], b = out[i], c = out[(i + 1) % out.length];
      const cr = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
      const scale = Math.hypot(b.x - a.x, b.y - a.y) * Math.hypot(c.x - b.x, c.y - b.y);
      if (Math.abs(cr) <= 1e-9 * Math.max(1, scale)) {
        out = out.filter((_, k) => k !== i);
        changed = true;
        break;
      }
    }
  }
  return out.length >= 3 && polyArea(out) > AREA_EPS ? out : null;
}

/** The parts of `p` on one side of an axis-aligned line: axis "x" is the line x = c, axis "y" the line y = c;
    keep "lo" keeps the side below c, "hi" the side above. The polygon is cut along the line and every part that is
    left becomes a polygon of its own. Winding is kept. */
export function clipHalf(p: readonly XY[], axis: "x" | "y", c: number, keep: "lo" | "hi"): TPoly[] {
  const s = keep === "lo" ? 1 : -1;
  // f < 0: on the kept side. The line itself counts as cut away, as if it sat a hair further in, so parts that only
  // touch along the line come out separate.
  const f = (v: XY) => s * ((axis === "x" ? v.x : v.y) - c);
  const u = (v: XY) => (axis === "x" ? v.y : v.x);
  const n = p.length;
  const fs = p.map(f);
  if (fs.every((v) => v < 0)) return [p.slice()];
  if (fs.every((v) => v >= 0)) return [];
  const onLine = (a: XY, b: XY, fa: number, fb: number): XY => {
    if (fa === 0) return a;
    if (fb === 0) return b;
    const t = fa / (fa - fb);
    return axis === "x" ? { x: c, y: a.y + t * (b.y - a.y) } : { x: a.x + t * (b.x - a.x), y: c };
  };
  const same = (a: XY, b: XY) => a.x === b.x && a.y === b.y;

  interface Cross {
    key: number;
    slope: number;
    chain: number;
    entry: boolean;
  }
  const crosses: Cross[] = [];
  const chains: TPoly[] = [];
  let cur: TPoly = [];
  const start = fs.findIndex((v) => v >= 0);
  for (let k = 0; k < n; k++) {
    const i = (start + k) % n, j = (i + 1) % n;
    const a = p[i], b = p[j], fa = fs[i], fb = fs[j];
    if (fa >= 0 && fb >= 0) continue;
    if (fa < 0 && fb < 0) {
      cur.push(b);
      continue;
    }
    const X = onLine(a, b, fa, fb);
    // how the crossing moves along the line as the line moves: orders crossings that share a point
    const slope = (u(b) - u(a)) / (fb - fa);
    if (fa >= 0) {
      cur = [X];
      if (!same(X, b)) cur.push(b);
      crosses.push({ key: u(X), slope, chain: chains.length, entry: true });
    } else {
      if (!same(X, a)) cur.push(X);
      crosses.push({ key: u(X), slope, chain: chains.length, entry: false });
      chains.push(cur);
      cur = [];
    }
  }
  // along the line, the polygon's inside runs between crossings 0–1, 2–3, …; each run joins an exit to an entry
  crosses.sort((a, b) => a.key - b.key || b.slope - a.slope);
  const next = new Array<number>(chains.length).fill(-1);
  for (let i = 0; i + 1 < crosses.length; i += 2) {
    const a = crosses[i], b = crosses[i + 1];
    if (a.entry === b.entry) return fallbackClip(p, onLine, fs); // not a simple polygon
    if (a.entry) next[b.chain] = a.chain;
    else next[a.chain] = b.chain;
  }
  const out: TPoly[] = [];
  const seen = new Array<boolean>(chains.length).fill(false);
  for (let i = 0; i < chains.length; i++) {
    if (seen[i]) continue;
    const poly: TPoly = [];
    for (let k = i; k >= 0 && !seen[k]; k = next[k]) {
      seen[k] = true;
      poly.push(...chains[k]);
    }
    const cl = cleanPoly(poly);
    if (cl) out.push(cl);
  }
  return out;
}
/** Sutherland–Hodgman, for input that isn't a simple polygon: one polygon, possibly with zero-width bridges. */
function fallbackClip(p: readonly XY[], onLine: (a: XY, b: XY, fa: number, fb: number) => XY, fs: number[]): TPoly[] {
  const out: TPoly = [];
  for (let i = 0; i < p.length; i++) {
    const j = (i + 1) % p.length;
    if (fs[i] < 0) out.push(p[i]);
    if (fs[i] < 0 !== fs[j] < 0) out.push(onLine(p[i], p[j], fs[i], fs[j]));
  }
  const cl = cleanPoly(out);
  return cl ? [cl] : [];
}

/** The parts of `p` inside rectangle r. */
export function clipRect(p: readonly XY[], r: TRect): TPoly[] {
  const b = polyBBox(p);
  if (!boxesOverlap(b, r)) return [];
  if (boxInside(b, r)) return [p.slice()];
  let parts: TPoly[] = [p.slice()];
  parts = parts.flatMap((q) => clipHalf(q, "x", r.x, "hi"));
  parts = parts.flatMap((q) => clipHalf(q, "x", r.x + r.w, "lo"));
  parts = parts.flatMap((q) => clipHalf(q, "y", r.y, "hi"));
  parts = parts.flatMap((q) => clipHalf(q, "y", r.y + r.h, "lo"));
  return parts;
}
/** The parts of `p` outside rectangle r. */
export function subtractRect(p: readonly XY[], r: TRect): TPoly[] {
  if (!boxesOverlap(polyBBox(p), r)) return [p.slice()];
  const out: TPoly[] = [...clipHalf(p, "x", r.x, "lo")];
  for (const q of clipHalf(p, "x", r.x, "hi")) {
    out.push(...clipHalf(q, "x", r.x + r.w, "hi"));
    for (const m of clipHalf(q, "x", r.x + r.w, "lo")) {
      out.push(...clipHalf(m, "y", r.y, "lo"));
      for (const m2 of clipHalf(m, "y", r.y, "hi")) out.push(...clipHalf(m2, "y", r.y + r.h, "hi"));
    }
  }
  return out;
}

/** Polygons minus a region. A polygon the region doesn't touch comes back as the same object. */
export function subtractRegion(polys: readonly TPoly[], rects: readonly TRect[]): TPoly[] {
  let out = polys.slice();
  for (const r of rects) out = out.flatMap((p) => (boxesOverlap(polyBBox(p), r) ? subtractRect(p, r) : [p]));
  return out;
}
/** The parts of `p` inside a region (one or more polygons per rectangle it crosses). */
export const intersectRegion = (p: readonly XY[], rects: readonly TRect[]): TPoly[] => rects.flatMap((r) => clipRect(p, r));

/** Whether `p` covers some area of the region. */
export function overlapsRegion(p: readonly XY[], rects: readonly TRect[]): boolean {
  const b = polyBBox(p);
  return rects.some((r) => boxesOverlap(b, r) && clipRect(p, r).some((q) => polyArea(q) > AREA_EPS));
}

type Seg = [XY, XY];
const edgesOf = (p: readonly XY[]): Seg[] => p.map((v, i) => [v, p[(i + 1) % p.length]] as Seg);

/** Whether segment ab passes through the open rectangle (more than touching its border). */
function segCrossesOpenRect(a: XY, b: XY, x0: number, y0: number, x1: number, y1: number): boolean {
  let t0 = 0, t1 = 1;
  const dx = b.x - a.x, dy = b.y - a.y;
  for (const [pp, q] of [[-dx, a.x - x0], [dx, x1 - a.x], [-dy, a.y - y0], [dy, y1 - a.y]] as const) {
    if (pp === 0) {
      if (q <= 0) return false; // parallel to this side, on or outside it
      continue;
    }
    const t = q / pp;
    if (pp < 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
    if (t0 >= t1) return false;
  }
  return t1 - t0 > 1e-12;
}

/** The rectilinear part of a polygon with vertices on the tick lattice: every cell of the grid through its vertex
    coordinates that lies wholly inside it. What's left of the polygon outside this region is only the strips along
    its slanted edges; for a polygon with no slanted edge it is nothing. */
export function coveredRegion(p: readonly XY[]): TRect[] {
  const xs = [...new Set(p.map((v) => v.x))].sort((a, b) => a - b);
  const ys = [...new Set(p.map((v) => v.y))].sort((a, b) => a - b);
  const slanted = edgesOf(p).filter(([a, b]) => a.x !== b.x && a.y !== b.y);
  const cells: TRect[] = [];
  for (let i = 0; i + 1 < xs.length; i++)
    for (let j = 0; j + 1 < ys.length; j++) {
      const x0 = xs[i], x1 = xs[i + 1], y0 = ys[j], y1 = ys[j + 1];
      if (!pointInPoly(p, (x0 + x1) / 2, (y0 + y1) / 2)) continue;
      if (slanted.some(([a, b]) => segCrossesOpenRect(a, b, x0, y0, x1, y1))) continue;
      cells.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
    }
  return normalize(cells);
}

/** Area of a region minus polygons (overlapping polygons are counted once). */
export function solidArea(rects: readonly TRect[], polys: readonly TPoly[]): number {
  let total = 0;
  for (const r of rects) {
    total += r.w * r.h;
    const parts = polys.flatMap((p) => clipRect(p, r));
    if (parts.length === 1) total -= polyArea(parts[0]);
    else if (parts.length) total -= unionArea(parts);
  }
  return total;
}
/** Area of a union of polygons: the length of a vertical line inside the union is linear in x between vertices and
    edge crossings, so summing slab width × length at the slab's middle is exact. */
function unionArea(polys: readonly TPoly[]): number {
  const edges = polys.flatMap(edgesOf);
  const xs = new Set<number>(polys.flatMap((p) => p.map((v) => v.x)));
  for (let i = 0; i < edges.length; i++)
    for (let j = i + 1; j < edges.length; j++) {
      const x = crossX(edges[i], edges[j]);
      if (x !== null) xs.add(x);
    }
  const sx = [...xs].sort((a, b) => a - b);
  let total = 0;
  for (let i = 0; i + 1 < sx.length; i++) {
    const w = sx[i + 1] - sx[i];
    if (w <= 0) continue;
    const xm = (sx[i] + sx[i + 1]) / 2;
    const ivs: [number, number][] = [];
    for (const p of polys) {
      const ys: number[] = [];
      for (const [a, b] of edgesOf(p)) if (a.x < xm !== b.x < xm) ys.push(a.y + ((xm - a.x) * (b.y - a.y)) / (b.x - a.x));
      ys.sort((a, b) => a - b);
      for (let k = 0; k + 1 < ys.length; k += 2) ivs.push([ys[k], ys[k + 1]]);
    }
    ivs.sort((a, b) => a[0] - b[0]);
    let len = 0, lo = 0, hi = -Infinity;
    for (const [a, b] of ivs) {
      if (a > hi) {
        if (hi > lo) len += hi - lo;
        lo = a;
        hi = b;
      } else hi = Math.max(hi, b);
    }
    if (hi > lo) len += hi - lo;
    total += w * len;
  }
  return total;
}
function crossX([a, b]: Seg, [c, d]: Seg): number | null {
  const r = { x: b.x - a.x, y: b.y - a.y }, s = { x: d.x - c.x, y: d.y - c.y };
  const den = r.x * s.y - r.y * s.x;
  if (den === 0) return null;
  const t = ((c.x - a.x) * s.y - (c.y - a.y) * s.x) / den;
  const v = ((c.x - a.x) * r.y - (c.y - a.y) * r.x) / den;
  return t > 0 && t < 1 && v > 0 && v < 1 ? a.x + t * r.x : null;
}

/* ── drawing a polygon by hand ─────────────────────────────────── */
const orientation = (a: XY, b: XY, c: XY) => Math.sign((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
const onSeg = (a: XY, b: XY, q: XY) =>
  Math.min(a.x, b.x) <= q.x && q.x <= Math.max(a.x, b.x) && Math.min(a.y, b.y) <= q.y && q.y <= Math.max(a.y, b.y);
/** Closed segments ab and cd share at least one point. */
function segsMeet(a: XY, b: XY, c: XY, d: XY): boolean {
  const o1 = orientation(a, b, c), o2 = orientation(a, b, d), o3 = orientation(c, d, a), o4 = orientation(c, d, b);
  if (o1 !== o2 && o3 !== o4 && o1 * o2 <= 0 && o3 * o4 <= 0) return true;
  return (o1 === 0 && onSeg(a, b, c)) || (o2 === 0 && onSeg(a, b, d)) || (o3 === 0 && onSeg(c, d, a)) || (o4 === 0 && onSeg(c, d, b));
}
/** Two segments joined at `at` overlap beyond it (the second doubles back along the first). */
const foldsBack = (at: XY, p: XY, q: XY) => orientation(at, p, q) === 0 && (p.x - at.x) * (q.x - at.x) + (p.y - at.y) * (q.y - at.y) > 0;

/** Whether the open path `pts` can go on to `q` (q equal to pts[0] closes it) and stay a simple polygon. */
export function canExtend(pts: readonly XY[], q: XY): boolean {
  const n = pts.length;
  if (!n) return true;
  const last = pts[n - 1];
  if (last.x === q.x && last.y === q.y) return false;
  const closing = n >= 3 && pts[0].x === q.x && pts[0].y === q.y;
  if (!closing && pts.some((v) => v.x === q.x && v.y === q.y)) return false;
  for (let i = 0; i + 1 < n; i++) {
    const a = pts[i], b = pts[i + 1];
    if (i === n - 2) {
      if (foldsBack(last, a, q)) return false; // the previous edge, joined at `last`
      continue;
    }
    if (closing && i === 0) {
      if (foldsBack(a, b, last)) return false; // the first edge, joined at the start
      continue;
    }
    if (segsMeet(a, b, last, q)) return false;
  }
  return !closing || polyArea([...pts]) > 0;
}

/* ── outline of rects minus cuts ───────────────────────────────── */
/** Parameters along ab (0..1) where segment cd meets it, collinear overlaps included. */
function meetParams(a: XY, b: XY, c: XY, d: XY): number[] {
  const r = { x: b.x - a.x, y: b.y - a.y }, s = { x: d.x - c.x, y: d.y - c.y };
  const den = r.x * s.y - r.y * s.x;
  const L2 = r.x * r.x + r.y * r.y;
  if (!L2) return [];
  if (Math.abs(den) < 1e-12 * L2) {
    // parallel: only collinear segments meet, at the other's endpoints
    if (Math.abs((c.x - a.x) * r.y - (c.y - a.y) * r.x) > 1e-9 * Math.sqrt(L2)) return [];
    return [c, d].map((p) => ((p.x - a.x) * r.x + (p.y - a.y) * r.y) / L2).filter((t) => t > 0 && t < 1);
  }
  const t = ((c.x - a.x) * s.y - (c.y - a.y) * s.x) / den;
  const u = ((c.x - a.x) * r.y - (c.y - a.y) * r.x) / den;
  return t > 0 && t < 1 && u >= -1e-12 && u <= 1 + 1e-12 ? [t] : [];
}

/** The boundary of a region minus polygons, as segments: the region's outline where no cut covers it, and the
    cuts' sides where they run through the region. `lines` is the region's outline (geom/region.ts outline). A
    stretch is kept when there is solid on exactly one side of it. */
export function solidOutline(
  rects: readonly TRect[],
  lines: readonly { x1: number; y1: number; x2: number; y2: number }[],
  cuts: readonly TPoly[],
): [XY, XY][] {
  const boxes = cuts.map(polyBBox);
  const solid = (x: number, y: number) =>
    rects.some((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) &&
    !cuts.some((c, i) => x >= boxes[i].x0 && x <= boxes[i].x1 && y >= boxes[i].y0 && y <= boxes[i].y1 && pointInPoly(c, x, y));
  const cands: [XY, XY][] = [...lines.map((l) => [{ x: l.x1, y: l.y1 }, { x: l.x2, y: l.y2 }] as [XY, XY]), ...cuts.flatMap(edgesOf)];
  const out: [XY, XY][] = [];
  for (const [a, b] of cands) {
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (!len) continue;
    const ts = [0, 1];
    for (const [c, d] of cands) if (c !== a || d !== b) ts.push(...meetParams(a, b, c, d));
    ts.sort((p, q) => p - q);
    const nx = -(b.y - a.y) / len, ny = (b.x - a.x) / len, e = 0.05;
    let run: number | null = null; // start of the stretch being kept
    for (let i = 0; i + 1 < ts.length; i++) {
      const t0 = ts[i], t1 = ts[i + 1];
      if (t1 - t0 < 1e-9) continue;
      const tm = (t0 + t1) / 2, mx = a.x + (b.x - a.x) * tm, my = a.y + (b.y - a.y) * tm;
      const keep = solid(mx + nx * e, my + ny * e) !== solid(mx - nx * e, my - ny * e);
      if (keep && run === null) run = t0;
      if (!keep && run !== null) {
        out.push([lerp(a, b, run), lerp(a, b, t0)]);
        run = null;
      }
    }
    if (run !== null) out.push([lerp(a, b, run), b]);
  }
  return out;
}
const lerp = (a: XY, b: XY, t: number): XY => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
