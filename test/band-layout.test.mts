import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { layoutBand, landscapeSolid, type BandLayout } from "../src/geom/band.ts";

/* The band edge rules shared with the UE importer: every case in band-edge-cases.json (ticket 38 tests the same file). */

interface Case {
  name: string;
  landscape: { rects: { x: number; y: number; w: number; h: number }[]; cuts?: { x: number; y: number }[][] }[];
  segs: { x1: number; y1: number; x2: number; y2: number; t: number }[];
  expect: {
    segs: { side: "one" | "both" | "blocked"; toward?: [number, number] }[];
    bevels: { at: [number, number] }[];
  };
}
const { cases } = JSON.parse(readFileSync(new URL("./band-edge-cases.json", import.meta.url), "utf8")) as { cases: Case[] };

const near = (a: number, b: number, what: string) => assert.ok(Math.abs(a - b) < 1e-3, `${what}: ${a} is not ${b}`);

for (const c of cases) {
  test(`band layout: ${c.name}`, () => {
    const out: BandLayout = layoutBand(c.segs, landscapeSolid(c.landscape));
    assert.equal(out.segs.length, c.segs.length);
    c.expect.segs.forEach((e, i) => {
      const got = out.segs[i];
      assert.equal(got.side, e.side, `seg ${i} side`);
      if (e.toward) {
        near(got.toward.x, e.toward[0], `seg ${i} toward x`);
        near(got.toward.y, e.toward[1], `seg ${i} toward y`);
      }
    });
    assert.equal(out.bevels.length, c.expect.bevels.length, "bevels");
    c.expect.bevels.forEach((e, i) => {
      near(out.bevels[i].at.x, e.at[0], `bevel ${i} x`);
      near(out.bevels[i].at.y, e.at[1], `bevel ${i} y`);
    });
  });
}

test("band layout: the band's outline grows t into the empty side and ends with its segment; a right angle gets a bevel", () => {
  const out = layoutBand(
    [
      { x1: 0, y1: 0, x2: 4, y2: 0, t: 1 },
      { x1: 4, y1: 0, x2: 4, y2: 4, t: 1 },
    ],
    landscapeSolid([{ rects: [{ x: 0, y: 0, w: 4, h: 4 }] }])
  );
  const box = (p: { x: number; y: number }[]) => [Math.min(...p.map((v) => v.x)), Math.min(...p.map((v) => v.y)), Math.max(...p.map((v) => v.x)), Math.max(...p.map((v) => v.y))];
  assert.deepEqual(box(out.segs[0].poly), [0, -1, 4, 0]);
  assert.deepEqual(box(out.segs[1].poly), [4, 0, 5, 4]);
  assert.deepEqual(out.bevels[0].poly.map((v) => `${v.x},${v.y}`).sort(), ["4,-1", "4,0", "5,0"]);
});

test("band layout: a bevel fills the triangle between the corner point and the two outer corners", () => {
  const out = layoutBand(
    [
      { x1: 0, y1: 0, x2: 4, y2: 0, t: 1 },
      { x1: 4, y1: 0, x2: 4, y2: 4, t: 2.5 },
    ],
    landscapeSolid([{ rects: [{ x: 0, y: 0, w: 4, h: 4 }] }])
  );
  const tri = out.bevels[0].poly.map((v) => `${v.x},${v.y}`).sort();
  assert.deepEqual(tri, ["4,-1", "4,0", "6.5,0"]);
});
