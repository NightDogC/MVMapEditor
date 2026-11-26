import test from "node:test";
import assert from "node:assert/strict";
import { normalizeSegs, subtractCollinear, eraseBox, splitByCells, translateSegs, type TSeg } from "../src/geom/segs.ts";
import { migrate, segToT, segFromT } from "../src/model/doc.ts";

/* Band edges (spikes and the like): every segment may carry a thickness `t` in cells. Segment operations keep it on
   whatever they cut out of a segment, and only merge collinear segments of the same thickness. */

const S = (x1: number, y1: number, x2: number, y2: number, t?: number): TSeg => (t === undefined ? { x1, y1, x2, y2 } : { x1, y1, x2, y2, t });

test("normalizeSegs merges collinear segments only when their thickness matches", () => {
  assert.deepEqual(normalizeSegs([S(0, 0, 2, 0, 1), S(2, 0, 5, 0, 1)]), [S(0, 0, 5, 0, 1)]);
  assert.deepEqual(normalizeSegs([S(0, 0, 2, 0, 1), S(2, 0, 5, 0, 0.5)]), [S(0, 0, 2, 0, 1), S(2, 0, 5, 0, 0.5)]);
  assert.deepEqual(normalizeSegs([S(0, 0, 2, 0), S(2, 0, 5, 0, 1)]), [S(0, 0, 2, 0), S(2, 0, 5, 0, 1)], "no thickness is its own value");
  assert.deepEqual(normalizeSegs([S(4, 0, 0, 0, 2)]), [S(0, 0, 4, 0, 2)], "turned to the canonical direction, thickness kept");
});

test("subtractCollinear cuts whatever lies on the same line, whatever its thickness, and keeps the rest's thickness", () => {
  assert.deepEqual(subtractCollinear([S(0, 0, 10, 0, 2)], [S(3, 0, 5, 0)]), [S(0, 0, 3, 0, 2), S(5, 0, 10, 0, 2)]);
  assert.deepEqual(subtractCollinear([S(0, 0, 10, 0)], [S(3, 0, 5, 0, 2)]), [S(0, 0, 3, 0), S(5, 0, 10, 0)]);
});

test("eraseBox keeps the thickness of what is left, on straight and slanted segments", () => {
  assert.deepEqual(eraseBox([S(0, 0, 10, 0, 1.5)], { x: 4, y: -1, w: 2, h: 2 }), [S(0, 0, 4, 0, 1.5), S(6, 0, 10, 0, 1.5)]);
  for (const s of eraseBox([S(0, 0, 30, 10, 0.5)], { x: 10, y: 0, w: 5, h: 10 })) assert.equal(s.t, 0.5);
});

test("splitByCells and translateSegs keep the thickness", () => {
  const { in: inside, out } = splitByCells([S(0, 48, 288, 48, 3)], 96, (mx) => Math.floor(mx / 96) === 1);
  assert.deepEqual(inside, [S(96, 48, 192, 48, 3)]);
  assert.ok(out.every((s) => s.t === 3));
  assert.deepEqual(translateSegs([S(0, 0, 1, 0, 2)], 5, 5), [S(5, 5, 6, 5, 2)]);
});

test("cell units <-> ticks keep the thickness in cells, and leave it out when there is none", () => {
  assert.deepEqual(segToT({ x1: 0, y1: 0, x2: 1, y2: 0, t: 0.5 }), S(0, 0, 96, 0, 0.5));
  assert.deepEqual(segFromT(S(0, 0, 96, 0, 0.5)), { x1: 0, y1: 0, x2: 1, y2: 0, t: 0.5 });
  assert.deepEqual(segFromT(S(0, 0, 96, 0)), { x1: 0, y1: 0, x2: 1, y2: 0 });
});

test("loading keeps a positive thickness and drops one that isn't (the segment then shows its type's default)", () => {
  const d = migrate({
    edgeStructs: [
      {
        id: "e",
        name: "刺边",
        color: "#e0555f",
        notes: "",
        typeId: "DamageEdge",
        segs: [
          { x1: 0, y1: 0, x2: 2, y2: 0, t: 0.5 },
          { x1: 0, y1: 5, x2: 2, y2: 5, t: 0 },
          { x1: 0, y1: 9, x2: 2, y2: 9, t: "1" },
        ],
      },
    ],
  });
  assert.deepEqual(d.edgeStructs[0].segs, [
    { x1: 0, y1: 0, x2: 2, y2: 0, t: 0.5 },
    { x1: 0, y1: 5, x2: 2, y2: 5 },
    { x1: 0, y1: 9, x2: 2, y2: 9 },
  ]);
});
