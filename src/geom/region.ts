/* Rectilinear regions: a set of axis-aligned rectangles in integer ticks.

   Every region the editor keeps is in canonical form: cut the plane into horizontal bands at every rectangle edge,
   take the maximal x-runs of each band, and stack a run onto the rectangle above it when that rectangle has exactly
   the same x-range and ends where the band starts. The result never overlaps, depends only on the covered area (not
   on how it was drawn), and a connected piece's rectangles are exactly the canonical form of that piece alone. */

export interface TRect {
  x: number;
  y: number;
  w: number;
  h: number;
}
type Iv = [number, number]; // half-open x-run [x0, x1)
interface Band {
  y0: number;
  y1: number;
  ivs: Iv[];
}

const sortedUnique = (vs: number[]): number[] => [...new Set(vs)].sort((a, b) => a - b);

/** Maximal runs covered by the rectangles crossing the band [y0, y1). */
function bandRuns(rects: readonly TRect[], y0: number, y1: number): Iv[] {
  const ivs: Iv[] = [];
  for (const r of rects) if (r.y <= y0 && r.y + r.h >= y1 && r.w > 0) ivs.push([r.x, r.x + r.w]);
  return mergeRuns(ivs);
}

function mergeRuns(ivs: Iv[]): Iv[] {
  ivs.sort((a, b) => a[0] - b[0]);
  const out: Iv[] = [];
  for (const [a, b] of ivs) {
    if (b <= a) continue;
    const last = out[out.length - 1];
    if (last && a <= last[1]) last[1] = Math.max(last[1], b);
    else out.push([a, b]);
  }
  return out;
}

function subtractRuns(a: Iv[], b: Iv[]): Iv[] {
  const out: Iv[] = [];
  for (const [x0, x1] of a) {
    let cur = x0;
    for (const [c0, c1] of b) {
      if (c1 <= cur || c0 >= x1) continue;
      if (c0 > cur) out.push([cur, c0]);
      cur = Math.max(cur, c1);
      if (cur >= x1) break;
    }
    if (cur < x1) out.push([cur, x1]);
  }
  return out;
}

function intersectRuns(a: Iv[], b: Iv[]): Iv[] {
  const out: Iv[] = [];
  for (const [x0, x1] of a)
    for (const [c0, c1] of b) {
      const lo = Math.max(x0, c0), hi = Math.min(x1, c1);
      if (hi > lo) out.push([lo, hi]);
    }
  return mergeRuns(out);
}

/** Stack band runs into canonical rectangles. Bands must be sorted by y and must not overlap. */
function fromBands(bands: Band[]): TRect[] {
  const done: TRect[] = [];
  let open = new Map<string, TRect>();
  for (const b of bands) {
    const next = new Map<string, TRect>();
    for (const [x0, x1] of b.ivs) {
      const k = x0 + "," + x1;
      const prev = open.get(k);
      if (prev && prev.y + prev.h === b.y0) {
        prev.h = b.y1 - prev.y;
        next.set(k, prev);
        open.delete(k);
      } else next.set(k, { x: x0, y: b.y0, w: x1 - x0, h: b.y1 - b.y0 });
    }
    for (const r of open.values()) done.push(r);
    open = next;
  }
  for (const r of open.values()) done.push(r);
  return done.sort((a, b) => a.y - b.y || a.x - b.x);
}

/** Combine two regions band by band. */
function bandOp(a: readonly TRect[], b: readonly TRect[], op: (ra: Iv[], rb: Iv[]) => Iv[]): TRect[] {
  const ys = sortedUnique([...a, ...b].flatMap((r) => (r.w > 0 && r.h > 0 ? [r.y, r.y + r.h] : [])));
  const bands: Band[] = [];
  for (let i = 0; i + 1 < ys.length; i++) {
    const ivs = op(bandRuns(a, ys[i], ys[i + 1]), bandRuns(b, ys[i], ys[i + 1]));
    if (ivs.length) bands.push({ y0: ys[i], y1: ys[i + 1], ivs });
  }
  return fromBands(bands);
}

/** Canonical form of any set of rectangles (overlaps allowed). */
export const normalize = (rects: readonly TRect[]): TRect[] => bandOp(rects, [], (ra) => ra);
export const union = (a: readonly TRect[], b: readonly TRect[]): TRect[] => bandOp(a, b, (ra, rb) => mergeRuns([...ra, ...rb]));
export const subtract = (a: readonly TRect[], b: readonly TRect[]): TRect[] => bandOp(a, b, subtractRuns);
export const intersect = (a: readonly TRect[], b: readonly TRect[]): TRect[] => bandOp(a, b, intersectRuns);

export const area = (rects: readonly TRect[]): number => rects.reduce((s, r) => s + r.w * r.h, 0);
export const isEmpty = (rects: readonly TRect[]): boolean => !rects.some((r) => r.w > 0 && r.h > 0);
export const sameRegion = (a: readonly TRect[], b: readonly TRect[]): boolean =>
  area(subtract(a, b)) === 0 && area(subtract(b, a)) === 0;

export const containsPoint = (rects: readonly TRect[], x: number, y: number): boolean =>
  rects.some((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);

export const translate = (rects: readonly TRect[], dx: number, dy: number): TRect[] =>
  rects.map((r) => ({ x: r.x + dx, y: r.y + dy, w: r.w, h: r.h }));

export function bbox(rects: readonly TRect[]): { x0: number; y0: number; x1: number; y1: number } | null {
  if (!rects.length) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const r of rects) {
    x0 = Math.min(x0, r.x);
    y0 = Math.min(y0, r.y);
    x1 = Math.max(x1, r.x + r.w);
    y1 = Math.max(y1, r.y + r.h);
  }
  return { x0, y0, x1, y1 };
}

/** Two non-overlapping rectangles touch along an edge of positive length (corner contact doesn't count). */
export function edgeAdjacent(a: TRect, b: TRect): boolean {
  const yOverlap = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  const xOverlap = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  if ((a.x + a.w === b.x || b.x + b.w === a.x) && yOverlap > 0) return true;
  if ((a.y + a.h === b.y || b.y + b.h === a.y) && xOverlap > 0) return true;
  return xOverlap > 0 && yOverlap > 0;
}

/** Connected pieces of a canonical region, each a canonical region itself, in reading order of their first rect. */
export function components(rects: readonly TRect[]): TRect[][] {
  const n = rects.length;
  const parent = rects.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) if (edgeAdjacent(rects[i], rects[j])) parent[find(i)] = find(j);
  const groups = new Map<number, TRect[]>();
  for (let i = 0; i < n; i++) {
    const k = find(i);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(rects[i]);
  }
  return [...groups.values()];
}

/** The piece of `rects` containing the point, or null. */
export function componentAt(rects: readonly TRect[], x: number, y: number): TRect[] | null {
  return components(rects).find((c) => containsPoint(c, x, y)) || null;
}

export interface TLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** Boundary of a canonical region as horizontal and vertical segments (for stroking its silhouette). */
export function outline(rects: readonly TRect[]): TLine[] {
  const out: TLine[] = [];
  // a point on line y is boundary when exactly one of "a rect starts here" / "a rect ends here" covers it
  const sweep = (horizontal: boolean) => {
    const starts = new Map<number, Iv[]>();
    const ends = new Map<number, Iv[]>();
    const add = (m: Map<number, Iv[]>, k: number, iv: Iv) => {
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(iv);
    };
    for (const r of rects) {
      if (horizontal) {
        add(starts, r.y, [r.x, r.x + r.w]);
        add(ends, r.y + r.h, [r.x, r.x + r.w]);
      } else {
        add(starts, r.x, [r.y, r.y + r.h]);
        add(ends, r.x + r.w, [r.y, r.y + r.h]);
      }
    }
    for (const k of new Set([...starts.keys(), ...ends.keys()])) {
      const s = mergeRuns(starts.get(k) || []);
      const e = mergeRuns(ends.get(k) || []);
      for (const [a, b] of [...subtractRuns(s, e), ...subtractRuns(e, s)])
        out.push(horizontal ? { x1: a, y1: k, x2: b, y2: k } : { x1: k, y1: a, x2: k, y2: b });
    }
  };
  sweep(true);
  sweep(false);
  return out;
}
