/* Line segments in integer ticks, any angle (edge structures: platforms, breakable sides…).

   Collinear segments are compared on their supporting line: a reduced direction (a, b) and an offset c, so two
   segments lie on the same line exactly when their (a, b, c) match. Along that line a point's position is
   t = a·x + b·y, an integer that grows in the canonical direction. */

import { gcd } from "./lattice.ts";
import type { TRect } from "./region.ts";

export interface TSeg {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}
interface P {
  x: number;
  y: number;
}

const isZero = (s: TSeg) => s.x1 === s.x2 && s.y1 === s.y2;

/** Same segment pointing in the canonical direction (left to right; top to bottom when vertical). */
export function canon(s: TSeg): TSeg {
  if (s.x2 < s.x1 || (s.x2 === s.x1 && s.y2 < s.y1)) return { x1: s.x2, y1: s.y2, x2: s.x1, y2: s.y1 };
  return { x1: s.x1, y1: s.y1, x2: s.x2, y2: s.y2 };
}

interface Line {
  a: number;
  b: number;
  c: number;
  key: string;
}
function lineOf(s: TSeg): Line {
  const c0 = canon(s);
  const dx = c0.x2 - c0.x1, dy = c0.y2 - c0.y1;
  const g = gcd(dx, dy) || 1;
  const a = dx / g, b = dy / g;
  const c = b * c0.x1 - a * c0.y1;
  return { a, b, c, key: a + "," + b + "," + c };
}
const tOf = (l: Line, p: P) => l.a * p.x + l.b * p.y;

/** Lattice point on line l nearest to parameter t (points with integer coords repeat every a²+b² along t). */
function pointAt(l: Line, t: number): P {
  // solve a·x + b·y = t, b·x − a·y = c  →  x = (a t + b c)/(a²+b²), y = (b t − a c)/(a²+b²)
  const n = l.a * l.a + l.b * l.b;
  const k = Math.round((t - tOf(l, base(l))) / n);
  const p0 = base(l);
  return { x: p0.x + k * l.a, y: p0.y + k * l.b };
}
/** Some lattice point on the line (b·x − a·y = c has integer solutions because gcd(a, b) = 1). */
function base(l: Line): P {
  const [g, u, v] = egcd(l.b, -l.a); // b·u − a·v = g = ±1
  return { x: (u * l.c) / g, y: (v * l.c) / g };
}
function egcd(a: number, b: number): [number, number, number] {
  if (b === 0) return [a, 1, 0];
  const [g, x, y] = egcd(b, a % b);
  return [g, y, x - Math.trunc(a / b) * y];
}

interface Span {
  t1: number;
  t2: number;
  p1: P;
  p2: P;
}
function spanOf(l: Line, s: TSeg): Span {
  const c0 = canon(s);
  const p1 = { x: c0.x1, y: c0.y1 }, p2 = { x: c0.x2, y: c0.y2 };
  return { t1: tOf(l, p1), t2: tOf(l, p2), p1, p2 };
}
const segOf = (sp: Span): TSeg => ({ x1: sp.p1.x, y1: sp.p1.y, x2: sp.p2.x, y2: sp.p2.y });

function groupByLine(segs: readonly TSeg[]): Map<string, { line: Line; spans: Span[] }> {
  const m = new Map<string, { line: Line; spans: Span[] }>();
  for (const s of segs) {
    if (isZero(s)) continue;
    const line = lineOf(s);
    if (!m.has(line.key)) m.set(line.key, { line, spans: [] });
    m.get(line.key)!.spans.push(spanOf(line, s));
  }
  return m;
}

const sortSegs = (segs: TSeg[]) => segs.sort((a, b) => a.y1 - b.y1 || a.x1 - b.x1 || a.y2 - b.y2 || a.x2 - b.x2);

/** Canonical form: zero-length segments dropped, collinear segments that overlap or touch end to end merged. */
export function normalizeSegs(segs: readonly TSeg[]): TSeg[] {
  const out: TSeg[] = [];
  for (const { spans } of groupByLine(segs).values()) {
    spans.sort((a, b) => a.t1 - b.t1);
    let cur: Span | null = null;
    for (const sp of spans) {
      if (cur && sp.t1 <= cur.t2) {
        if (sp.t2 > cur.t2) cur = { t1: cur.t1, p1: cur.p1, t2: sp.t2, p2: sp.p2 };
      } else {
        if (cur) out.push(segOf(cur));
        cur = sp;
      }
    }
    if (cur) out.push(segOf(cur));
  }
  return sortSegs(out);
}

/** `segs` without the parts that lie on top of any of `cut` (collinear overlap only; crossings are kept). */
export function subtractCollinear(segs: readonly TSeg[], cut: readonly TSeg[]): TSeg[] {
  const cuts = groupByLine(cut);
  const out: TSeg[] = [];
  for (const { line, spans } of groupByLine(segs).values()) {
    const cs = (cuts.get(line.key)?.spans || []).slice().sort((a, b) => a.t1 - b.t1);
    for (const sp of spans) {
      let cur: Span | null = sp;
      for (const c of cs) {
        if (!cur || c.t2 <= cur.t1 || c.t1 >= cur.t2) continue;
        if (c.t1 > cur.t1) out.push(segOf({ t1: cur.t1, p1: cur.p1, t2: c.t1, p2: c.p1 }));
        cur = c.t2 < cur.t2 ? { t1: c.t2, p1: c.p2, t2: cur.t2, p2: cur.p2 } : null;
      }
      if (cur) out.push(segOf(cur));
    }
  }
  return normalizeSegs(out);
}

/** Parameter range (0..1) of segment s inside the half-open box [x0,x1)×[y0,y1), or null. */
function clipParams(s: TSeg, r: TRect): [number, number] | null {
  let lo = 0, hi = 1;
  const dx = s.x2 - s.x1, dy = s.y2 - s.y1;
  const edges: [number, number][] = [
    [-dx, s.x1 - r.x],
    [dx, r.x + r.w - s.x1],
    [-dy, s.y1 - r.y],
    [dy, r.y + r.h - s.y1],
  ];
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return null;
      continue;
    }
    const t = q / p;
    if (p < 0) lo = Math.max(lo, t);
    else hi = Math.min(hi, t);
    if (lo > hi) return null;
  }
  return hi > lo ? [lo, hi] : null;
}

/** Split s at the given parameters (0..1), snapping every cut to the nearest lattice point on its line so the
    pieces stay exactly collinear with the original. */
function splitAt(s: TSeg, params: number[]): TSeg[] {
  const l = lineOf(s);
  const c0 = canon(s);
  const flip = c0.x1 !== s.x1 || c0.y1 !== s.y1;
  const sp = spanOf(l, s);
  const ts = params.map((u) => (flip ? 1 - u : u)).map((u) => sp.t1 + u * (sp.t2 - sp.t1));
  const pts: P[] = [sp.p1, ...ts.sort((a, b) => a - b).map((t) => pointAt(l, t)), sp.p2];
  const out: TSeg[] = [];
  for (let i = 0; i + 1 < pts.length; i++) out.push({ x1: pts[i].x, y1: pts[i].y, x2: pts[i + 1].x, y2: pts[i + 1].y });
  return out.filter((q) => !isZero(q));
}

/** Parts of the segments outside the box. */
export function eraseBox(segs: readonly TSeg[], r: TRect): TSeg[] {
  const out: TSeg[] = [];
  for (const s of segs) {
    const c = clipParams(s, r);
    if (!c) {
      out.push(s);
      continue;
    }
    const pieces = splitAt(s, [c[0], c[1]]);
    // pieces: before / inside / after (some may be empty after snapping); keep the ones whose middle is outside
    for (const q of pieces) {
      const mx = (q.x1 + q.x2) / 2, my = (q.y1 + q.y2) / 2;
      if (!(mx >= r.x && mx < r.x + r.w && my >= r.y && my < r.y + r.h)) out.push(q);
    }
  }
  return normalizeSegs(out);
}

/** Split each segment where it crosses the unit-cell grid (cell = `cell` ticks) and sort the pieces by
    `inside(mx, my)`, called with each piece's midpoint in ticks (it may lie on a grid line when the segment runs
    along one). Used to carry the part of a platform inside a moved room. */
export function splitByCells(segs: readonly TSeg[], cell: number, inside: (mx: number, my: number) => boolean): { in: TSeg[]; out: TSeg[] } {
  const res = { in: [] as TSeg[], out: [] as TSeg[] };
  for (const s of segs) {
    const params = new Set<number>();
    const dx = s.x2 - s.x1, dy = s.y2 - s.y1;
    if (dx) for (let g = Math.ceil(Math.min(s.x1, s.x2) / cell) * cell; g <= Math.max(s.x1, s.x2); g += cell) params.add((g - s.x1) / dx);
    if (dy) for (let g = Math.ceil(Math.min(s.y1, s.y2) / cell) * cell; g <= Math.max(s.y1, s.y2); g += cell) params.add((g - s.y1) / dy);
    const ps = [...params].filter((u) => u > 0 && u < 1).sort((a, b) => a - b);
    // group consecutive pieces with the same inside/outside status before snapping, so straight runs stay whole
    const bounds = [0, ...ps, 1];
    const runs: { from: number; to: number; inside: boolean }[] = [];
    for (let i = 0; i + 1 < bounds.length; i++) {
      const u = (bounds[i] + bounds[i + 1]) / 2;
      const ins = inside(s.x1 + dx * u, s.y1 + dy * u);
      const last = runs[runs.length - 1];
      if (last && last.inside === ins) last.to = bounds[i + 1];
      else runs.push({ from: bounds[i], to: bounds[i + 1], inside: ins });
    }
    if (runs.length === 1) {
      (runs[0].inside ? res.in : res.out).push(s);
      continue;
    }
    const pieces = splitAt(s, runs.slice(1).map((r) => r.from));
    // splitAt orders pieces from the canonical start; map them back to runs in that order
    const c0 = canon(s);
    const flip = c0.x1 !== s.x1 || c0.y1 !== s.y1;
    const ordered = flip ? runs.slice().reverse() : runs;
    pieces.forEach((q, i) => (ordered[Math.min(i, ordered.length - 1)].inside ? res.in : res.out).push(q));
  }
  return res;
}

export const translateSegs = (segs: readonly TSeg[], dx: number, dy: number): TSeg[] =>
  segs.map((s) => ({ x1: s.x1 + dx, y1: s.y1 + dy, x2: s.x2 + dx, y2: s.y2 + dy }));

const orient = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number) =>
  Math.sign((bx - ax) * (cy - ay) - (by - ay) * (cx - ax));
const onSeg = (s: TSeg, x: number, y: number) =>
  Math.min(s.x1, s.x2) <= x && x <= Math.max(s.x1, s.x2) && Math.min(s.y1, s.y2) <= y && y <= Math.max(s.y1, s.y2);

/** The two closed segments share at least one point. */
export function touches(p: TSeg, q: TSeg): boolean {
  const o1 = orient(p.x1, p.y1, p.x2, p.y2, q.x1, q.y1);
  const o2 = orient(p.x1, p.y1, p.x2, p.y2, q.x2, q.y2);
  const o3 = orient(q.x1, q.y1, q.x2, q.y2, p.x1, p.y1);
  const o4 = orient(q.x1, q.y1, q.x2, q.y2, p.x2, p.y2);
  if (o1 !== o2 && o3 !== o4 && o1 * o2 <= 0 && o3 * o4 <= 0 && (o1 || o2 || o3 || o4)) return true;
  return (
    (o1 === 0 && onSeg(p, q.x1, q.y1)) ||
    (o2 === 0 && onSeg(p, q.x2, q.y2)) ||
    (o3 === 0 && onSeg(q, p.x1, p.y1)) ||
    (o4 === 0 && onSeg(q, p.x2, p.y2))
  );
}

/** Connected pieces: segments sharing any point belong together. */
export function segComponents(segs: readonly TSeg[]): TSeg[][] {
  const parent = segs.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < segs.length; i++)
    for (let j = i + 1; j < segs.length; j++) if (touches(segs[i], segs[j])) parent[find(i)] = find(j);
  const groups = new Map<number, TSeg[]>();
  segs.forEach((s, i) => {
    const k = find(i);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(s);
  });
  return [...groups.values()];
}

/** Squared distance from point (x, y) to segment s. */
export function distToSeg2(s: TSeg, x: number, y: number): number {
  const dx = s.x2 - s.x1, dy = s.y2 - s.y1;
  const L = dx * dx + dy * dy;
  let u = L ? ((x - s.x1) * dx + (y - s.y1) * dy) / L : 0;
  u = u < 0 ? 0 : u > 1 ? 1 : u;
  const px = s.x1 + u * dx - x, py = s.y1 + u * dy - y;
  return px * px + py * py;
}

export const segLength = (s: TSeg): number => Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
