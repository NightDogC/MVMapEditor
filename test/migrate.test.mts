import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { migrate, cellsToRects, edgesToSegs } from "../src/model/doc.ts";

const require = createRequire(import.meta.url);
const UE = require("../mvmap-ue.js");
const TYPES = require("../mvmap-types.js");

const v1 = () => ({
  id: "map_1",
  version: 1,
  name: "Old",
  areas: [{ id: "a1", name: "A", color: "#fff" }],
  rooms: [{ id: "r1", name: "R", areaId: "a1", color: null, notes: "", cells: ["0,0", "1,0"] }],
  structures: [{ id: "s1", name: "墙体", color: "#888", notes: "", cells: ["0,0", "1,0", "0,1", "1,1", "5,5"] }],
  edgeStructs: [{ id: "e1", name: "Ledge", color: "#f00", notes: "", edges: ["h:3,5", "h:4,5", "h:5,5", "v:0,0"] }],
  stamps: [{ id: "m1", name: "Save", emoji: "💾", color: "#0af", notes: "", cells: ["6,4", "7,4"] }],
  notes: [{ id: "n1", name: "N", text: "", color: "#ff0", x: 2, y: 3, expanded: false }],
  keys: [{ id: "k1", name: "K", color: "#0f0", x: 9, y: 2 }],
});

test("1.x structure cells become canonical rects covering the same cells", () => {
  assert.deepEqual(cellsToRects(["0,0", "1,0", "0,1", "1,1", "5,5"]), [
    { x: 0, y: 0, w: 2, h: 2 },
    { x: 5, y: 5, w: 1, h: 1 },
  ]);
});

test("1.x edge keys become segments, consecutive edges on one grid line merged", () => {
  assert.deepEqual(edgesToSegs(["h:3,5", "h:4,5", "h:5,5", "v:0,0", "h:9,9"]), [
    { x1: 0, y1: 0, x2: 0, y2: 1 },
    { x1: 3, y1: 5, x2: 6, y2: 5 },
    { x1: 9, y1: 9, x2: 10, y2: 9 },
  ]);
});

test("migrate converts a 1.x file to version 2 and drops the old fields", () => {
  const d = migrate(v1());
  assert.equal(d.version, 2);
  assert.deepEqual(d.structures[0].rects, [{ x: 0, y: 0, w: 2, h: 2 }, { x: 5, y: 5, w: 1, h: 1 }]);
  assert.ok(!("cells" in d.structures[0]));
  assert.equal(d.edgeStructs[0].segs.length, 2);
  assert.ok(!("edges" in d.edgeStructs[0]));
  assert.deepEqual(d.stamps[0].points, [{ x: 6, y: 4 }, { x: 7, y: 4 }]);
  assert.ok(!("cells" in d.stamps[0]));
  assert.deepEqual([d.notes[0].x, d.keys[0].x], [2, 9]);
  assert.deepEqual(d.rooms[0].cells, ["0,0", "1,0"], "rooms stay on whole cells");
});

test("migrate is idempotent on version-2 documents and quantizes fractional geometry to the 1/96 lattice", () => {
  const once = migrate(v1());
  assert.deepEqual(migrate(JSON.parse(JSON.stringify(once))), once);
  const d = migrate({
    structures: [{ id: "s", name: "x", color: "#fff", notes: "", rects: [{ x: 0.33333, y: 0, w: 1, h: 0.5 }, { x: 0, y: 0, w: "bad", h: 1 }] }],
    stamps: [{ id: "m", name: "m", emoji: "⭐", color: "#fff", notes: "", points: [{ x: 1.5, y: 2 }, { x: 1.5, y: 2 }] }],
  });
  assert.deepEqual(d.structures[0].rects, [{ x: 0.3333, y: 0, w: 1, h: 0.5 }]);
  assert.equal(d.stamps[0].points.length, 1, "duplicate stamp positions collapse");
});

test("migrate with the vocabulary still classifies elements by name (墙体 -> Landscape)", () => {
  const d = migrate(v1(), (x) => UE.migrateTypeIds(x, TYPES.types));
  assert.equal(d.structures[0].typeId, "Landscape");
});

test("UE buildExportDoc keeps the version-2 geometry untouched", () => {
  const d = migrate(v1(), (x) => UE.migrateTypeIds(x, TYPES.types));
  const out = UE.buildExportDoc(d, TYPES.regions, TYPES.types);
  assert.deepEqual(out.structures[0].rects, d.structures[0].rects);
  assert.deepEqual(out.edgeStructs[0].segs, d.edgeStructs[0].segs);
  assert.deepEqual(out.stamps[0].points, d.stamps[0].points);
  assert.equal(out.version, 2);
});

test("grey-box data from older files is dropped on load", () => {
  const d = migrate({ ...v1(), detail: { r1: { sub: 8, boxes: [{ id: "b", x: 0, y: 0, w: 2, h: 2, type: "solid", label: "" }] } } });
  assert.ok(!("detail" in d));
});
