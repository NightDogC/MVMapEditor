/* Band edges: segments drawn along a terrain surface that grow a thickness into the empty side (spikes; mvmap-types.js
   `band`). The rules here are shared with the UE importer, which builds the same bands as boxes (ticket 38); both are
   tested against test/band-edge-cases.json. Everything is in cells, y down, like the document.

   - Empty side: from the segment's midpoint, step half a tick along each normal and ask whether that point is solid
     Landscape (all Landscape rects minus all Landscape cuts, the whole document, rooms ignored). Solid on one side:
     the band grows t into the other. Empty on both: t/2 each way. Solid on both: blocked (the editor draws it as a
     warning, the importer reports it and builds nothing).
   - Joins: where exactly two segments of the element end at the same point (nothing else touching it) and their bands
     form a convex corner there (each has a face on the outside of the corner), the corner gets a bevel: the triangle
     between the point and the two bands' outer corners is filled, whatever the angle and the thicknesses. Bands never
     extend past their segment (designers asked for right angles to be bevelled too, 2026-11-26). Concave corners,
     collinear segments, points where three or more segments meet, and corners with a blocked segment (it won't be
     imported) are left alone. */

import { TICKS } from "./lattice.ts";
import { pointInPoly, type XY } from "./poly.ts";

export interface BandSeg {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** thickness, the type's default filled in */
  t: number;
}
/** Whether a point (cells) is solid terrain. */
export type SolidAt = (x: number, y: number) => boolean;

export interface BandSegLayout {
  /** one: grows t toward `toward`; both: t/2 each way; blocked: solid on both sides (laid out like both) */
  side: "one" | "both" | "blocked";
  /** unit normal the band grows toward (side one); the segment's left normal otherwise */
  toward: XY;
  /** the band's outline: four corners */
  poly: XY[];
}
export interface BandBevel {
  at: XY;
  /** the two segments it joins (indexes into the input) */
  of: [number, number];
  /** the corner point and the two outer corners */
  poly: XY[];
}
export interface BandLayout {
  segs: BandSegLayout[];
  bevels: BandBevel[];
}

/** How far from the segment the empty side is probed: half a tick. */
const PROBE = 0.5 / TICKS;
const EPS = 1e-9;

interface Landscape {
  rects: readonly { x: number; y: number; w: number; h: number }[];
  cuts?: readonly (readonly XY[])[];
}
/** Solid Landscape: in any rect of any of the structures and in none of their cuts. */
export function landscapeSolid(structs: readonly Landscape[]): SolidAt {
  const rects = structs.flatMap((s) => s.rects);
  const cuts = structs.flatMap((s) => s.cuts || []);
  return (x, y) =>
    rects.some((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) && !cuts.some((c) => pointInPoly(c, x, y));
}

const cross = (a: XY, b: XY) => a.x * b.y - a.y * b.x;
const dot = (a: XY, b: XY) => a.x * b.x + a.y * b.y;
const add = (a: XY, b: XY, k = 1): XY => ({ x: a.x + b.x * k, y: a.y + b.y * k });
const neg = (a: XY): XY => ({ x: -a.x, y: -a.y });

/** Per segment: unit direction, left normal, and how far the band reaches along +normal / −normal. */
function sideOf(s: BandSeg, solid: SolidAt) {
  const L = Math.hypot(s.x2 - s.x1, s.y2 - s.y1) || 1;
  const dir = { x: (s.x2 - s.x1) / L, y: (s.y2 - s.y1) / L };
  const n = { x: dir.y, y: -dir.x };
  const mid = { x: (s.x1 + s.x2) / 2, y: (s.y1 + s.y2) / 2 };
  const plus = solid(mid.x + n.x * PROBE, mid.y + n.y * PROBE);
  const minus = solid(mid.x - n.x * PROBE, mid.y - n.y * PROBE);
  if (plus && !minus) return { dir, n, side: "one" as const, toward: neg(n), pos: 0, neg: s.t };
  if (minus && !plus) return { dir, n, side: "one" as const, toward: n, pos: s.t, neg: 0 };
  return { dir, n, side: plus ? ("blocked" as const) : ("both" as const), toward: n, pos: s.t / 2, neg: s.t / 2 };
}

const onSegment = (s: BandSeg, p: XY) => {
  const L2 = (s.x2 - s.x1) ** 2 + (s.y2 - s.y1) ** 2;
  if (!L2) return false;
  const u = ((p.x - s.x1) * (s.x2 - s.x1) + (p.y - s.y1) * (s.y2 - s.y1)) / L2;
  const q = { x: s.x1 + u * (s.x2 - s.x1), y: s.y1 + u * (s.y2 - s.y1) };
  return u >= -EPS && u <= 1 + EPS && Math.hypot(q.x - p.x, q.y - p.y) < 1e-6;
};

/** Lay out one band edge element: which way each segment grows, and how its corners join. */
export function layoutBand(segs: readonly BandSeg[], solid: SolidAt): BandLayout {
  const sides = segs.map((s) => sideOf(s, solid));
  const bevels: BandBevel[] = [];

  // segment ends grouped by point
  const ends = new Map<string, { i: number; end: 0 | 1; p: XY }[]>();
  segs.forEach((s, i) => {
    for (const end of [0, 1] as const) {
      const p = end ? { x: s.x2, y: s.y2 } : { x: s.x1, y: s.y1 };
      const k = p.x.toFixed(6) + "," + p.y.toFixed(6);
      if (!ends.has(k)) ends.set(k, []);
      ends.get(k)!.push({ i, end, p });
    }
  });
  for (const group of ends.values()) {
    if (group.length !== 2 || group[0].i === group[1].i) continue;
    const [a, b] = group;
    if (sides[a.i].side === "blocked" || sides[b.i].side === "blocked") continue;
    const P = a.p;
    // a third segment passing through the point
    if (segs.some((s, i) => i !== a.i && i !== b.i && onSegment(s, P))) continue;
    // directions from the point into each segment
    const u = a.end ? neg(sides[a.i].dir) : sides[a.i].dir;
    const v = b.end ? neg(sides[b.i].dir) : sides[b.i].dir;
    if (Math.abs(cross(u, v)) < 1e-9) continue; // collinear (or folded back)
    const w = add(u, v); // into the wedge between them, the inside of the corner
    // each band's face on the outside of the corner: the normal pointing away from w, and its reach that way
    const outer = (k: number) => {
      const sd = sides[k];
      return dot(sd.n, w) < 0 ? { n: sd.n, d: sd.pos } : { n: neg(sd.n), d: sd.neg };
    };
    const A = outer(a.i), B = outer(b.i);
    if (A.d <= EPS || B.d <= EPS) continue; // concave: the bands overlap there
    bevels.push({ at: P, of: [a.i, b.i], poly: [P, add(P, A.n, A.d), add(P, B.n, B.d)] });
  }

  return {
    segs: segs.map((s, i) => {
      const sd = sides[i];
      const e1 = { x: s.x1, y: s.y1 };
      const e2 = { x: s.x2, y: s.y2 };
      const poly = [add(e1, sd.n, sd.pos), add(e2, sd.n, sd.pos), add(e2, sd.n, -sd.neg), add(e1, sd.n, -sd.neg)];
      return { side: sd.side, toward: sd.toward, poly };
    }),
    bevels,
  };
}
