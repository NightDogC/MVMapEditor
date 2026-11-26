// Band edges while editing: they don't take segments from other edge structures or give theirs up, keep their
// thicknesses through room moves and export / import, and are picked by clicking inside the band.
import "./with-vocabulary.mts";
import test from "node:test";
import assert from "node:assert/strict";
import { newDoc } from "../src/model/doc.ts";
import type { EdgeStruct, Seg } from "../src/model/types.ts";
import { S, migrateDoc } from "../src/state/store.ts";
import { UE, REGIONS, FIXED_TYPES, TYPES_FILE } from "../src/ue.ts";
import { TICKS } from "../src/geom/lattice.ts";
import { addEdgeSegs, eraseEdgeBox, carryOffGrid, edgeSegAt, setSegThickness, bandLayoutOf, dropThickness, eT } from "../src/state/layers.ts";
import type { TSeg } from "../src/geom/segs.ts";

const K = TICKS;
const T = (x1: number, y1: number, x2: number, y2: number, t?: number): TSeg =>
  t === undefined ? { x1: x1 * K, y1: y1 * K, x2: x2 * K, y2: y2 * K } : { x1: x1 * K, y1: y1 * K, x2: x2 * K, y2: y2 * K, t };

function edge(id: string, typeId: string | null, segs: Seg[] = []): EdgeStruct {
  return { id, name: id, color: "#ffffff", notes: "", segs, typeId };
}
/** A fresh document with a spike edge, a platform and an untyped edge, over a block of ground (0,5)–(10,10). */
function setup() {
  S.doc = newDoc();
  S.doc.structures.push({ id: "g", name: "地形", color: "#7c879b", notes: "", typeId: "Landscape", rects: [{ x: 0, y: 5, w: 10, h: 5 }] });
  const spikes = edge("spikes", "DamageEdge"), platform = edge("platform", "JumpOffPlatform"), other = edge("other", null);
  S.doc.edgeStructs.push(spikes, platform, other);
  return { spikes, platform, other };
}

test("a band edge drawn over a platform leaves the platform whole, and the other way round", () => {
  const { spikes, platform } = setup();
  addEdgeSegs(platform, [T(0, 5, 4, 5)]);
  addEdgeSegs(spikes, [T(2, 5, 6, 5, 1)]);
  assert.deepEqual(platform.segs, [{ x1: 0, y1: 5, x2: 4, y2: 5 }]);
  addEdgeSegs(platform, [T(5, 5, 8, 5)]);
  assert.deepEqual(spikes.segs, [{ x1: 2, y1: 5, x2: 6, y2: 5, t: 1 }]);
});

test("edge structures that aren't band edges still take collinear segments from each other", () => {
  const { platform, other } = setup();
  addEdgeSegs(platform, [T(0, 5, 4, 5)]);
  addEdgeSegs(other, [T(2, 5, 6, 5)]);
  assert.deepEqual(platform.segs, [{ x1: 0, y1: 5, x2: 2, y2: 5 }]);
});

test("drawing over a band edge's own segment with another thickness replaces that part", () => {
  const { spikes } = setup();
  addEdgeSegs(spikes, [T(0, 5, 6, 5, 1)]);
  addEdgeSegs(spikes, [T(2, 5, 4, 5, 0.5)]);
  assert.deepEqual(spikes.segs, [
    { x1: 0, y1: 5, x2: 2, y2: 5, t: 1 },
    { x1: 2, y1: 5, x2: 4, y2: 5, t: 0.5 },
    { x1: 4, y1: 5, x2: 6, y2: 5, t: 1 },
  ]);
});

test("erasing cuts band edges like any other edge structure, keeping the thickness of what is left", () => {
  const { spikes, platform } = setup();
  addEdgeSegs(spikes, [T(0, 5, 6, 5, 2)]);
  addEdgeSegs(platform, [T(0, 5, 6, 5)]);
  eraseEdgeBox({ x: 2 * K, y: 4 * K, w: 2 * K, h: 2 * K });
  assert.deepEqual(spikes.segs, [{ x1: 0, y1: 5, x2: 2, y2: 5, t: 2 }, { x1: 4, y1: 5, x2: 6, y2: 5, t: 2 }]);
  assert.equal(platform.segs.length, 2);
});

test("a moved room carries a band edge's segments with their thicknesses", () => {
  const { spikes } = setup();
  const room = { id: "r", name: "R", areaId: S.doc.areas[0].id, color: null, notes: "", cells: ["0,4", "1,4", "2,4"] };
  S.doc.rooms.push(room);
  addEdgeSegs(spikes, [T(0, 5, 2, 5, 0.5), T(2, 5, 3, 5, 1.5)]);
  carryOffGrid(room, new Set(room.cells), (e) => e.o === "h" && e.y === 5 && e.x <= 2)(0, -2); // the room owns the floor line
  assert.deepEqual(spikes.segs, [{ x1: 0, y1: 3, x2: 2, y2: 3, t: 0.5 }, { x1: 2, y1: 3, x2: 3, y2: 3, t: 1.5 }]);
});

test("export then import keeps every thickness", () => {
  const { spikes } = setup();
  addEdgeSegs(spikes, [T(0, 5, 2, 5, 0.5), T(2, 5, 3, 4, 1.5), T(5, 5, 7, 5)]);
  const exported = JSON.parse(JSON.stringify(UE.buildExportDoc(S.doc, REGIONS, FIXED_TYPES, TYPES_FILE.defaultStampCategories)));
  const back = migrateDoc(exported);
  assert.deepEqual(back.edgeStructs.find((e) => e.id === "spikes")!.segs, spikes.segs);
});

test("clicking inside a band picks its segment; outside it doesn't", () => {
  const { spikes } = setup();
  addEdgeSegs(spikes, [T(2, 5, 6, 5, 1)]);
  const tol = 2; // ticks: far less than the band
  const hit = edgeSegAt(4 * K, 4.5 * K, tol);
  assert.equal(hit && hit.es, spikes, "above the line, inside the band");
  assert.equal(edgeSegAt(4 * K, 5.5 * K, tol), null, "below the line, inside the ground");
  assert.equal(edgeSegAt(4 * K, 3.5 * K, tol), null, "above the band");
});

test("the band takes the type's default thickness where a segment has none, and grows into the empty side", () => {
  const { spikes } = setup();
  addEdgeSegs(spikes, [T(2, 5, 6, 5)]);
  const layout = bandLayoutOf(spikes)!;
  assert.equal(layout.segs[0].side, "one");
  const ys = layout.segs[0].poly.map((v) => v.y);
  assert.deepEqual([Math.min(...ys), Math.max(...ys)], [4, 5], "DamageEdge's default: 1 cell");
  assert.equal(bandLayoutOf(edge("x", "JumpOffPlatform", [{ x1: 0, y1: 0, x2: 1, y2: 0 }])), null, "not a band edge");
});

test("the band follows the ground when the ground changes", () => {
  const { spikes } = setup();
  addEdgeSegs(spikes, [T(2, 5, 6, 5)]);
  assert.equal(bandLayoutOf(spikes)!.segs[0].side, "one");
  S.doc.structures[0] = { ...S.doc.structures[0], rects: [{ x: 0, y: 0, w: 10, h: 10 }] };
  assert.equal(bandLayoutOf(spikes)!.segs[0].side, "blocked");
});

test("setSegThickness changes one straight segment; given the whole piece, every segment of it", () => {
  const { spikes } = setup();
  addEdgeSegs(spikes, [T(0, 5, 2, 5, 1), T(2, 5, 3, 4, 1), T(8, 5, 9, 5, 1)]);
  const [, b] = eT(spikes);
  setSegThickness(spikes, [b], 0.5);
  assert.deepEqual(spikes.segs.map((s) => s.t), [1, 0.5, 1]);
  setSegThickness(spikes, [eT(spikes)[0], eT(spikes)[1]], 2);
  assert.deepEqual(spikes.segs.map((s) => s.t), [2, 2, 1]);
});

test("dropThickness: an edge structure that stops being a band edge loses its thicknesses and merges back", () => {
  const { spikes } = setup();
  addEdgeSegs(spikes, [T(0, 5, 2, 5, 1), T(2, 5, 4, 5, 0.5)]);
  spikes.typeId = null;
  dropThickness(spikes);
  assert.deepEqual(spikes.segs, [{ x1: 0, y1: 5, x2: 4, y2: 5 }]);
});

test("dropThickness: once it stops being a band edge, a line it shared with a platform becomes its alone", () => {
  const { spikes, platform } = setup();
  addEdgeSegs(platform, [T(0, 5, 6, 5)]);
  addEdgeSegs(spikes, [T(2, 5, 4, 5, 1)]);
  spikes.typeId = null;
  dropThickness(spikes);
  assert.deepEqual(platform.segs, [{ x1: 0, y1: 5, x2: 2, y2: 5 }, { x1: 4, y1: 5, x2: 6, y2: 5 }]);
  assert.deepEqual(spikes.segs, [{ x1: 2, y1: 5, x2: 4, y2: 5 }]);
});
