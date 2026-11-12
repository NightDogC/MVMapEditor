import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { migrate, cellsToRects, edgesToSegs, hasStampPointWithoutId } from "../src/model/doc.ts";

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
  assert.deepEqual(d.stamps[0].points.map(({ x, y }) => ({ x, y })), [{ x: 6, y: 4 }, { x: 7, y: 4 }]);
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

const idsOf = (d: { stamps: { points: { id: string }[] }[] }) => d.stamps.flatMap((s) => s.points.map((p) => p.id));

test("migrate gives every stamp point without an id a new one, unique across the map, in the element-id format", () => {
  const d = migrate({
    stamps: [
      { id: "m1", name: "a", emoji: "⭐", color: "#fff", notes: "", points: [{ x: 1, y: 2 }, { x: 3, y: 4 }] },
      { id: "m2", name: "b", emoji: "⭐", color: "#fff", notes: "", points: [{ x: 5, y: 6 }] },
    ],
  });
  const ids = idsOf(d);
  assert.equal(ids.length, 3);
  assert.equal(new Set(ids).size, 3);
  for (const id of ids) assert.match(id, /^pt_[a-z0-9]+$/);
});

test("migrate keeps stored point ids, and replaces an empty, non-string or repeated one", () => {
  const d = migrate({
    stamps: [
      { id: "m1", name: "a", emoji: "⭐", color: "#fff", notes: "", points: [{ id: "pt_keep", x: 1, y: 2 }, { id: "", x: 3, y: 4 }, { id: 7, x: 5, y: 6 }] },
      { id: "m2", name: "b", emoji: "⭐", color: "#fff", notes: "", points: [{ id: "pt_keep", x: 9, y: 9 }] },
    ],
  });
  const ids = idsOf(d);
  assert.equal(ids[0], "pt_keep");
  assert.equal(new Set(ids).size, 4);
  assert.ok(ids.slice(1).every((id) => id !== "pt_keep" && /^pt_/.test(id)));
});

test("a 1.x file's stamp cells become points with ids; loading the result again keeps them", () => {
  const once = migrate(v1());
  assert.equal(new Set(idsOf(once)).size, 2);
  assert.deepEqual(idsOf(migrate(JSON.parse(JSON.stringify(once)))), idsOf(once));
});

test("hasStampPointWithoutId tells whether loading would hand out new point ids (so the editor saves them right away)", () => {
  assert.equal(hasStampPointWithoutId(v1()), true, "1.x stamp cells");
  const once = migrate(v1());
  assert.equal(hasStampPointWithoutId(once), false, "after migrate every point has a unique id");
  const st = (points: unknown[]) => ({ stamps: [{ id: "m", points }] });
  assert.equal(hasStampPointWithoutId(st([{ id: "pt_1", x: 0, y: 0 }, { x: 1, y: 0 }])), true, "one point without an id");
  assert.equal(hasStampPointWithoutId({ stamps: [{ id: "a", points: [{ id: "pt_1", x: 0, y: 0 }] }, { id: "b", points: [{ id: "pt_1", x: 1, y: 0 }] }] }), true, "repeated id");
  assert.equal(hasStampPointWithoutId({}), false);
});

/** The editor's load (state/store.ts migrateDoc). */
const load = (x: unknown) => migrate(x, (d) => UE.migrateTypeData(d, TYPES));

test("migrate with the vocabulary fills each stamp's anchor: the type's default, a locked type's anchor, SnapToGround when untyped", () => {
  const st = (id: string, typeId: string, anchor?: string) => ({ id, name: id, emoji: "⭐", color: "#fff", notes: "", typeId, anchor, points: [] });
  const d = load({
    stamps: [st("a", "SavePoint"), st("b", "WeakFlyingEnemy"), st("c", "MoneyBox", "FloatInAir"), st("d", "FlyingEnemy", "SnapToGround"), st("e", "Unknown", "FloatInAir")],
  });
  assert.deepEqual(d.stamps.map((s) => s.anchor), ["SnapToGround", "FloatInAir", "FloatInAir", "FloatInAir", "FloatInAir"]);
  assert.deepEqual([d.stamps[1].typeId, d.stamps[1].tier], ["FlyingEnemy", "Weak"], "old id migrated before the anchor is filled");
});

test("loading gives a document without stamp categories the defaults, keeps a document's own, and keeps the version", () => {
  const fresh = load(v1());
  assert.deepEqual(fresh.stampCategories, TYPES.defaultStampCategories);
  assert.equal(fresh.version, 2);
  const own = { groups: [], types: [{ id: "T_1", label: "Mine", generate: "manual", color: "#000000", emoji: "m" }] };
  const mine = load({ ...v1(), stampCategories: own, stamps: [{ id: "m", name: "x", emoji: "⭐", color: "#fff", notes: "", typeId: "T_1", points: [] }] });
  assert.deepEqual(mine.stampCategories, own);
  assert.equal(mine.stamps[0].typeId, "T_1");
  assert.deepEqual(load(JSON.parse(JSON.stringify(fresh))), fresh, "loading again changes nothing");
});

test("grey-box data from older files is dropped on load", () => {
  const d = migrate({ ...v1(), detail: { r1: { sub: 8, boxes: [{ id: "b", x: 0, y: 0, w: 2, h: 2, type: "solid", label: "" }] } } });
  assert.ok(!("detail" in d));
});
