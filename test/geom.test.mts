import test from "node:test";
import assert from "node:assert/strict";
import { normalize, union, subtract, intersect, area, components, outline, sameRegion, type TRect } from "../src/geom/region.ts";
import { normalizeSegs, subtractCollinear, eraseBox, segComponents, splitByCells, type TSeg } from "../src/geom/segs.ts";
import { toT, fromT, SNAP_STEPS, TICKS } from "../src/geom/lattice.ts";

const R = (x: number, y: number, w: number, h: number): TRect => ({ x, y, w, h });
const S = (x1: number, y1: number, x2: number, y2: number): TSeg => ({ x1, y1, x2, y2 });

test("every snap step is a whole number of ticks, and 4-decimal cell values round-trip through ticks", () => {
  for (const s of SNAP_STEPS) assert.ok(Number.isInteger(s.ticks) && s.ticks >= 1, s.id);
  for (let t = -500; t <= 500; t++) assert.equal(toT(fromT(t)), t);
  assert.equal(fromT(TICKS / 3), 0.3333);
});

test("normalize merges overlapping and touching rectangles into a canonical form independent of drawing order", () => {
  const a = normalize([R(0, 0, 2, 2), R(1, 1, 2, 2)]);
  const b = normalize([R(1, 1, 2, 2), R(0, 0, 1, 1), R(0, 0, 2, 2)]);
  assert.deepEqual(a, b);
  assert.equal(area(a), 7);
  assert.deepEqual(normalize([R(0, 0, 1, 1), R(1, 0, 1, 1), R(0, 1, 2, 1)]), [R(0, 0, 2, 2)]);
});

test("a piece's canonical rects don't depend on unrelated pieces next to it", () => {
  const tall = R(0, 0, 1, 4);
  const stairs = [R(5, 0, 1, 1), R(5, 1, 3, 1), R(5, 2, 2, 2)];
  const both = normalize([tall, ...stairs]);
  assert.ok(both.some((r) => r.x === 0 && r.h === 4), "the tall rect stays one rect");
});

test("subtract, union and intersect", () => {
  const big = [R(0, 0, 4, 4)];
  const hole = [R(1, 1, 2, 2)];
  const ring = subtract(big, hole);
  assert.equal(area(ring), 12);
  assert.ok(sameRegion(union(ring, hole), big));
  assert.deepEqual(intersect(big, [R(3, 3, 5, 5)]), [R(3, 3, 1, 1)]);
  assert.deepEqual(subtract(big, big), []);
});

test("components: edge contact connects, corner contact doesn't", () => {
  assert.equal(components(normalize([R(0, 0, 1, 1), R(1, 1, 1, 1)])).length, 2);
  assert.equal(components(normalize([R(0, 0, 1, 1), R(1, 0, 1, 1)])).length, 1);
  assert.equal(components(normalize([R(0, 0, 2, 1), R(1, 1, 2, 1)])).length, 1);
  assert.equal(components(normalize([R(0, 0, 1, 1), R(5, 5, 1, 1), R(0, 1, 1, 1)])).length, 2);
});

test("outline of a square is its four sides; an L shape has six boundary runs", () => {
  assert.equal(outline([R(0, 0, 2, 2)]).length, 4);
  const L = normalize([R(0, 0, 1, 2), R(1, 1, 1, 1)]);
  const len = outline(L).reduce((s, l) => s + Math.abs(l.x2 - l.x1) + Math.abs(l.y2 - l.y1), 0);
  assert.equal(len, 8);
});

test("normalizeSegs merges collinear overlapping or touching segments, keeps crossings apart", () => {
  assert.deepEqual(normalizeSegs([S(0, 0, 2, 0), S(2, 0, 5, 0), S(1, 0, 3, 0)]), [S(0, 0, 5, 0)]);
  assert.deepEqual(normalizeSegs([S(4, 4, 0, 0), S(2, 2, 6, 6)]), [S(0, 0, 6, 6)]);
  assert.equal(normalizeSegs([S(0, 0, 4, 0), S(2, -2, 2, 2)]).length, 2);
  assert.equal(normalizeSegs([S(0, 0, 2, 0), S(3, 0, 5, 0)]).length, 2, "a gap keeps them apart");
  assert.deepEqual(normalizeSegs([S(1, 1, 1, 1)]), []);
});

test("subtractCollinear cuts only collinear overlap", () => {
  assert.deepEqual(subtractCollinear([S(0, 0, 10, 0)], [S(3, 0, 5, 0)]), [S(0, 0, 3, 0), S(5, 0, 10, 0)]);
  assert.deepEqual(subtractCollinear([S(0, 0, 10, 0)], [S(3, -1, 3, 1)]), [S(0, 0, 10, 0)]);
  assert.deepEqual(subtractCollinear([S(0, 0, 9, 3)], [S(3, 1, 6, 2)]), [S(0, 0, 3, 1), S(6, 2, 9, 3)]);
});

test("eraseBox removes the part inside the box and keeps diagonal remains exactly collinear", () => {
  assert.deepEqual(eraseBox([S(0, 0, 10, 0)], R(4, -1, 2, 2)), [S(0, 0, 4, 0), S(6, 0, 10, 0)]);
  const out = eraseBox([S(0, 0, 30, 10)], R(10, 0, 5, 10));
  assert.equal(out.length, 2);
  for (const s of out) assert.equal((s.y2 - s.y1) * 3, s.x2 - s.x1, "still slope 1/3");
  assert.deepEqual(eraseBox([S(0, 0, 10, 0)], R(20, 20, 2, 2)), [S(0, 0, 10, 0)]);
});

test("segComponents joins segments sharing a point", () => {
  assert.equal(segComponents([S(0, 0, 2, 0), S(2, 0, 4, 2), S(10, 10, 12, 10)]).length, 2);
  assert.equal(segComponents([S(0, 0, 4, 4), S(0, 4, 4, 0)]).length, 1, "an X is one piece");
});

test("splitByCells separates the part of a segment inside the chosen cells", () => {
  const { in: inside, out } = splitByCells([S(0, 48, 288, 48)], 96, (mx) => Math.floor(mx / 96) === 1);
  assert.deepEqual(inside, [S(96, 48, 192, 48)]);
  assert.equal(out.length, 2);
});
