import test from "node:test";
import assert from "node:assert/strict";
import {
  signedArea, polyArea, orient, pointInPoly, clipHalf, clipRect, subtractRect, subtractRegion, intersectRegion,
  overlapsRegion, coveredRegion, solidArea, solidOutline, canExtend, type TPoly,
} from "../src/geom/poly.ts";
import { area, sameRegion, outline, type TRect } from "../src/geom/region.ts";
import { migrate } from "../src/model/doc.ts";

const P = (...xy: number[]): TPoly => {
  const out: TPoly = [];
  for (let i = 0; i < xy.length; i += 2) out.push({ x: xy[i], y: xy[i + 1] });
  return out;
};
const R = (x: number, y: number, w: number, h: number): TRect => ({ x, y, w, h });
const sum = (ps: TPoly[]) => ps.reduce((a, p) => a + polyArea(p), 0);
const close = (a: number, b: number, msg?: string) => assert.ok(Math.abs(a - b) < 1e-6, `${msg || ""} ${a} != ${b}`);

// a "U": two prongs joined at the bottom
const U = P(0, 0, 2, 0, 2, 4, 4, 4, 4, 0, 6, 0, 6, 6, 0, 6);

test("winding: positive area runs clockwise on screen (y down); orient flips the other way round", () => {
  assert.equal(signedArea(P(0, 0, 4, 0, 4, 2)), 4);
  assert.equal(signedArea(P(0, 0, 4, 2, 4, 0)), -4);
  assert.equal(signedArea(orient(P(0, 0, 4, 2, 4, 0))), 4);
  assert.equal(polyArea(U), 28);
});

test("clipHalf cuts a concave polygon into separate parts, no bridges", () => {
  const top = clipHalf(U, "y", 3, "lo"); // the two prongs
  assert.equal(top.length, 2);
  for (const p of top) close(polyArea(p), 6);
  const bottom = clipHalf(U, "y", 3, "hi");
  assert.equal(bottom.length, 1);
  close(polyArea(bottom[0]), 16);
  // the line through the U's inner corners (y = 4): parts meet the line at vertices
  const t4 = clipHalf(U, "y", 4, "lo");
  assert.equal(t4.length, 2);
  close(sum(t4), 16);
  close(sum(clipHalf(U, "y", 4, "hi")), 12);
  // winding is kept
  for (const p of [...top, ...bottom]) assert.ok(signedArea(p) > 0);
  // wholly on one side
  close(sum(clipHalf(U, "x", 10, "lo")), 28);
  assert.equal(clipHalf(U, "x", 10, "hi").length, 0);
});

test("clipHalf on lines through vertices and along edges", () => {
  const sq = P(0, 0, 4, 0, 4, 4, 0, 4);
  assert.equal(clipHalf(sq, "x", 0, "lo").length, 0); // only the edge touches: no area
  close(sum(clipHalf(sq, "x", 4, "lo")), 16);
  const diamond = P(2, 0, 4, 2, 2, 4, 0, 2);
  close(sum(clipHalf(diamond, "y", 2, "lo")), 4);
  close(sum(clipHalf(diamond, "x", 2, "hi")), 4);
  // a zig-zag whose dips touch the line exactly at vertices
  const zig = P(0, 0, 8, 0, 8, 4, 6, 2, 4, 4, 2, 2, 0, 4);
  const below = clipHalf(zig, "y", 2, "hi");
  assert.equal(below.length, 3);
  close(sum(below) + sum(clipHalf(zig, "y", 2, "lo")), polyArea(zig));
});

test("subtractRect + clipRect partition the polygon", () => {
  const tri = P(0, 0, 10, 0, 0, 10);
  for (const r of [R(2, 2, 3, 3), R(-5, 4, 30, 2), R(1, -1, 2, 20), R(20, 20, 2, 2), R(-1, -1, 30, 30)]) {
    const out = subtractRect(tri, r), inn = clipRect(tri, r);
    close(sum(out) + sum(inn), 50, JSON.stringify(r));
    for (const p of out) {
      // every outside part really is outside r (its centre of area isn't strictly inside)
      const c = p.reduce((a, v) => ({ x: a.x + v.x / p.length, y: a.y + v.y / p.length }), { x: 0, y: 0 });
      assert.ok(!(c.x > r.x && c.x < r.x + r.w && c.y > r.y && c.y < r.y + r.h) || !pointInPoly(p, c.x, c.y));
    }
  }
  // a hole punched in the middle: parts around it, area exact
  close(sum(subtractRegion([P(0, 0, 10, 0, 10, 10, 0, 10)], [R(3, 3, 4, 4)])), 84);
  // a region that doesn't touch hands the same polygon back
  const sq = P(0, 0, 1, 0, 1, 1, 0, 1);
  assert.equal(subtractRegion([sq], [R(5, 5, 1, 1)])[0], sq);
  close(sum(intersectRegion(tri, [R(0, 0, 5, 5), R(5, 0, 5, 5)])), 25 + 12.5);
});

test("overlapsRegion ignores touching", () => {
  const tri = P(0, 0, 4, 0, 0, 4);
  assert.ok(overlapsRegion(tri, [R(0, 0, 1, 1)]));
  assert.ok(!overlapsRegion(tri, [R(4, 0, 2, 2)])); // shares a corner
  assert.ok(!overlapsRegion(tri, [R(0, -2, 4, 2)])); // shares a side
  assert.ok(!overlapsRegion(tri, [R(2, 2, 2, 2)])); // the hypotenuse runs through the rect's corner
});

test("coveredRegion: the grid-aligned part of a polygon", () => {
  // a rectilinear polygon is covered completely
  const L = P(0, 0, 4, 0, 4, 2, 2, 2, 2, 4, 0, 4);
  assert.ok(sameRegion(coveredRegion(L), [R(0, 0, 4, 2), R(0, 2, 2, 2)]));
  // a right triangle: only the cells its slanted side doesn't cross (none: its vertex grid is one cell)
  assert.equal(area(coveredRegion(P(0, 0, 4, 0, 0, 4))), 0);
  // a trapezoid with a slanted side: the rectangle left of where the slope starts
  const trap = P(0, 0, 8, 0, 12, 4, 0, 4);
  assert.ok(sameRegion(coveredRegion(trap), [R(0, 0, 8, 4)]));
});

test("solidArea counts overlapping cuts once", () => {
  const box = [R(0, 0, 10, 10)];
  close(solidArea(box, [P(0, 0, 10, 0, 0, 10)]), 50);
  close(solidArea(box, [P(0, 0, 10, 0, 0, 10), P(0, 0, 10, 0, 0, 10)]), 50);
  close(solidArea(box, [P(0, 0, 6, 0, 6, 6, 0, 6), P(4, 4, 10, 4, 10, 10, 4, 10)]), 100 - 36 - 36 + 4);
  close(solidArea(box, [P(-5, -5, 20, -5, 20, 2, -5, 2)]), 80); // reaching past the rects
});

test("solidOutline: the region's outline where no cut covers it, plus the cuts' sides inside it", () => {
  const len = (segs: [{ x: number; y: number }, { x: number; y: number }][]) => segs.reduce((a, [p, q]) => a + Math.hypot(q.x - p.x, q.y - p.y), 0);
  const box = [R(0, 0, 4, 4)];
  // a corner cut off: the top and right sides shrink, the slope joins them
  close(len(solidOutline(box, outline(box), [P(2, 0, 4, 0, 4, 2)])), 4 + 4 + 2 + 2 + 2 * Math.SQRT2);
  // a cut reaching past the box: only its part inside counts
  close(len(solidOutline(box, outline(box), [P(0, -2, 6, -2, 6, 4)])), 4 + 4 + 2 + 2 + 2 * Math.SQRT2);
  // two corners off, the cuts meeting at a point: the whole top side goes
  close(len(solidOutline(box, outline(box), [P(0, 0, 2, 0, 0, 2), P(2, 0, 4, 0, 4, 2)])), 2 + 4 + 2 + 2 * 2 * Math.SQRT2);
  // two cuts sharing a side: the shared side isn't drawn
  close(len(solidOutline(box, outline(box), [P(0, 0, 4, 0, 2, 2), P(0, 0, 2, 2, 0, 4)])), 4 + 4 + 2 * 2 * Math.SQRT2);
});

test("canExtend: the outline may not cross or touch itself", () => {
  const pts = P(0, 0, 10, 0, 10, 10);
  assert.ok(canExtend(pts, { x: 0, y: 10 }));
  assert.ok(canExtend(pts, { x: 0, y: 0 })); // closes
  assert.ok(!canExtend(pts, { x: 10, y: 10 })); // same as the last corner
  assert.ok(!canExtend(pts, { x: 10, y: 0 })); // an earlier corner
  assert.ok(!canExtend(pts, { x: 10, y: 5 })); // doubles back along the last side
  assert.ok(!canExtend(P(0, 0, 10, 0, 10, 10, 0, 10), { x: 12, y: 5 })); // crosses the right side
  assert.ok(!canExtend(P(0, 0, 10, 0, 10, 10, 5, 10), { x: 5, y: -3 })); // crosses the first side
  assert.ok(!canExtend(P(0, 0, 10, 0, 20, 0), { x: 0, y: 0 })); // closing a polygon with no area
});

test("migrate keeps cuts that bite into the structure, oriented and rounded; drops the rest", () => {
  const d = migrate({
    structures: [
      {
        id: "s", name: "x", color: "#fff", notes: "", rects: [{ x: 0, y: 0, w: 4, h: 4 }],
        cuts: [
          [{ x: 0, y: 4 }, { x: 4, y: 4 }, { x: 4, y: 2 }], // anticlockwise on screen
          [{ x: 10, y: 10 }, { x: 11, y: 10 }, { x: 10, y: 11 }], // nowhere near
          [{ x: 0, y: 0 }, { x: "a", y: 0 }],
          "junk",
        ],
      },
      { id: "t", name: "y", color: "#fff", notes: "", rects: [{ x: 0, y: 0, w: 1, h: 1 }], cuts: [] },
    ],
  });
  const s = d.structures[0];
  assert.equal(s.cuts!.length, 1);
  assert.ok(signedArea(s.cuts![0]) > 0);
  assert.deepEqual(new Set(s.cuts![0].map((v) => v.x + "," + v.y)), new Set(["0,4", "4,4", "4,2"]));
  assert.equal("cuts" in d.structures[1], false);
});
