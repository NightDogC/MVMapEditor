"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const UE = require("../mvmap-ue.js");

test("roomCode pads the number to two digits after the region letter", () => {
  assert.equal(UE.roomCode("B", 1), "B01");
  assert.equal(UE.roomCode("A", 12), "A12");
  assert.equal(UE.roomCode("C", 105), "C105");
});

test("roomCode is empty when the region letter or the number is missing", () => {
  assert.equal(UE.roomCode(null, 3), "");
  assert.equal(UE.roomCode("B", null), "");
  assert.equal(UE.roomCode(undefined, undefined), "");
});

test("parseRoomNumber accepts positive integers, ignoring surrounding spaces and leading zeros", () => {
  assert.deepEqual(UE.parseRoomNumber("3"), { value: 3, error: null });
  assert.deepEqual(UE.parseRoomNumber(" 07 "), { value: 7, error: null });
});

test("parseRoomNumber treats a blank field as unset, not as an error", () => {
  assert.deepEqual(UE.parseRoomNumber(""), { value: null, error: null });
  assert.deepEqual(UE.parseRoomNumber("   "), { value: null, error: null });
});

test("parseRoomNumber rejects zero, negatives, decimals and non-digits", () => {
  for (const bad of ["0", "00", "-1", "1.5", "abc", "1e2", "+2", "2a"]) {
    const r = UE.parseRoomNumber(bad);
    assert.equal(r.value, null, bad);
    assert.ok(r.error, "expected an error for " + JSON.stringify(bad));
  }
});

const REGIONS = [
  { label: "A_傩愿寨", region: "NuoYuanZhai", letter: "A" },
  { label: "B_先祖祠", region: "XianZuCi", letter: "B" },
];

function sampleDoc() {
  return {
    areas: [
      { id: "a1", name: "祠堂", color: "#fff", region: "XianZuCi" },
      { id: "a2", name: "寨子", color: "#000" },
    ],
    rooms: [
      { id: "r1", name: "中堂", areaId: "a1", cells: ["0,0"], number: 1 },
      { id: "r2", name: "左殿", areaId: "a1", cells: ["1,0"], number: 2 },
      { id: "r3", name: "山路", areaId: "a2", cells: ["5,5"], number: 1 },
      { id: "r4", name: "未编号", areaId: "a2", cells: ["6,5"] },
    ],
  };
}

test("findUeFieldErrors is empty when numbers are unique per area, even if areas reuse a number", () => {
  assert.deepEqual(UE.findUeFieldErrors(sampleDoc(), REGIONS), []);
});

test("findUeFieldErrors reports rooms sharing a number inside one area, naming the area and the rooms", () => {
  const d = sampleDoc();
  d.rooms[1].number = 1;
  const errs = UE.findUeFieldErrors(d, REGIONS);
  assert.equal(errs.length, 1);
  assert.match(errs[0], /祠堂/);
  assert.match(errs[0], /中堂/);
  assert.match(errs[0], /左殿/);
  assert.match(errs[0], /\b1\b/);
});

test("findUeFieldErrors reports a stored number that is not a positive integer", () => {
  const d = sampleDoc();
  d.rooms[0].number = 0;
  d.rooms[1].number = "2";
  const errs = UE.findUeFieldErrors(d, REGIONS);
  assert.equal(errs.length, 2);
  assert.match(errs[0], /中堂/);
  assert.match(errs[1], /左殿/);
});

test("findUeFieldErrors reports an area region that is not in the region list", () => {
  const d = sampleDoc();
  d.areas[1].region = "NoSuchRegion";
  const errs = UE.findUeFieldErrors(d, REGIONS);
  assert.equal(errs.length, 1);
  assert.match(errs[0], /寨子/);
  assert.match(errs[0], /NoSuchRegion/);
});

test("buildExportDoc adds region, letter and number, writing null for anything unset", () => {
  const out = UE.buildExportDoc(sampleDoc(), REGIONS);
  assert.equal(out.areas[0].region, "XianZuCi");
  assert.equal(out.areas[0].letter, "B");
  assert.equal(out.areas[1].region, null);
  assert.equal(out.areas[1].letter, null);
  assert.deepEqual(out.rooms.map((r) => r.number), [1, 2, 1, null]);
});

test("buildExportDoc keeps every existing field and leaves the editor document untouched", () => {
  const doc = sampleDoc();
  doc.name = "Map";
  doc.doors = [{ id: "d1", x: 1, y: 0, o: "v" }];
  const before = JSON.parse(JSON.stringify(doc));
  const out = UE.buildExportDoc(doc, REGIONS);
  assert.deepEqual(doc, before);
  assert.equal(out.name, "Map");
  assert.deepEqual(out.doors, before.doors);
  assert.deepEqual(out.areas[1], { id: "a2", name: "寨子", color: "#000", region: null, letter: null });
  assert.deepEqual(out.rooms[3], { id: "r4", name: "未编号", areaId: "a2", cells: ["6,5"], number: null });
});

test("buildExportDoc exports an invalid stored number as null and an unknown region without a letter", () => {
  const d = sampleDoc();
  d.rooms[0].number = 0;
  d.areas[1].region = "NoSuchRegion";
  const out = UE.buildExportDoc(d, REGIONS);
  assert.equal(out.rooms[0].number, null);
  assert.equal(out.areas[1].region, "NoSuchRegion");
  assert.equal(out.areas[1].letter, null);
});

test("roomCode is empty for a stored number that is not a positive integer", () => {
  assert.equal(UE.roomCode("B", 0), "");
  assert.equal(UE.roomCode("B", "2"), "");
  assert.equal(UE.roomCode("B", 1.5), "");
});

const TYPES = [
  { id: "Wall", label: "Wall label", layer: "structure", generate: "auto", color: "#111111", emoji: "W" },
  { id: "Door", label: "Door label", layer: "structure", generate: "manual", color: "#222222", emoji: "D" },
  { id: "Ledge", label: "Ledge label", layer: "edge", generate: "auto", color: "#333333", emoji: "L" },
  { id: "Save", label: "Save label", layer: "stamp", generate: "manual", color: "#444444", emoji: "S" },
];

test("typesForLayer lists only the types for that layer, in vocabulary order", () => {
  assert.deepEqual(UE.typesForLayer(TYPES, "structure").map((t) => t.id), ["Wall", "Door"]);
  assert.deepEqual(UE.typesForLayer(TYPES, "edge").map((t) => t.id), ["Ledge"]);
  assert.deepEqual(UE.typesForLayer(TYPES, "stamp").map((t) => t.id), ["Save"]);
  assert.deepEqual(UE.typesForLayer(TYPES, "note"), []);
});

test("elementTypeOf returns the element's type when its typeId belongs to that layer", () => {
  assert.equal(UE.elementTypeOf({ typeId: "Door" }, "structure", TYPES).id, "Door");
  assert.equal(UE.elementTypeOf({ typeId: "Ledge" }, "edge", TYPES).id, "Ledge");
});

test("elementTypeOf is null for a missing typeId, an id not in the vocabulary, or a type from another layer", () => {
  assert.equal(UE.elementTypeOf({ name: "Wall label" }, "structure", TYPES), null);
  assert.equal(UE.elementTypeOf({ typeId: "Gone" }, "structure", TYPES), null);
  assert.equal(UE.elementTypeOf({ typeId: "Ledge" }, "structure", TYPES), null);
});

function typedDoc() {
  return {
    structures: [
      { id: "s1", name: "Wall label", cells: [] },
      { id: "s2", name: "Some wall", cells: [] },
      { id: "s3", name: "Ledge label", cells: [] },
    ],
    edgeStructs: [{ id: "e1", name: "Ledge label", edges: [] }],
    stamps: [
      { id: "p1", name: "Save label", cells: [] },
      { id: "p2", name: " Save label", cells: [] },
    ],
  };
}

test("migrateTypeIds classifies an element whose name exactly matches a type label of its own layer", () => {
  const out = UE.migrateTypeIds(typedDoc(), TYPES);
  assert.equal(out.structures[0].typeId, "Wall");
  assert.equal(out.edgeStructs[0].typeId, "Ledge");
  assert.equal(out.stamps[0].typeId, "Save");
});

test("migrateTypeIds leaves an element unclassified when the name only nearly matches or matches another layer's type", () => {
  const out = UE.migrateTypeIds(typedDoc(), TYPES);
  assert.equal("typeId" in out.structures[1], false);
  assert.equal("typeId" in out.structures[2], false); // "Ledge label" is an edge type, not a structure type
  assert.equal("typeId" in out.stamps[1], false); // leading space
});

test("migrateTypeIds keeps an element's existing typeId, even one the vocabulary no longer knows", () => {
  const d = typedDoc();
  d.structures[0].typeId = "Door";
  d.structures[1].typeId = "Gone";
  const out = UE.migrateTypeIds(d, TYPES);
  assert.equal(out.structures[0].typeId, "Door");
  assert.equal(out.structures[1].typeId, "Gone");
});

test("migrateTypeIds leaves the input untouched and copes with documents that lack element lists", () => {
  const d = typedDoc();
  const before = JSON.parse(JSON.stringify(d));
  UE.migrateTypeIds(d, TYPES);
  assert.deepEqual(d, before);
  assert.deepEqual(UE.migrateTypeIds({ name: "Empty" }, TYPES), { name: "Empty" });
});

test("buildExportDoc writes typeId only when it is a type of the element's own layer", () => {
  const d = typedDoc();
  d.structures[0].typeId = "Wall";
  d.structures[1].typeId = "Gone"; // not in the vocabulary
  d.structures[2].typeId = "Ledge"; // an edge type on a structure
  d.edgeStructs[0].typeId = "Ledge";
  d.stamps[0].typeId = null;
  const out = UE.buildExportDoc(d, REGIONS, TYPES);
  assert.equal(out.structures[0].typeId, "Wall");
  assert.equal("typeId" in out.structures[1], false);
  assert.equal("typeId" in out.structures[2], false);
  assert.equal(out.edgeStructs[0].typeId, "Ledge");
  assert.equal("typeId" in out.stamps[0], false);
  assert.equal("typeId" in out.stamps[1], false);
  assert.equal(d.structures[1].typeId, "Gone"); // the editor document keeps it
});

test("migrateTypeIds leaves typeId: null alone — the user picked 'unclassified' on purpose", () => {
  const d = typedDoc();
  d.structures[0].typeId = null;
  const out = UE.migrateTypeIds(d, TYPES);
  assert.equal(out.structures[0].typeId, null);
  assert.equal(UE.elementTypeOf(out.structures[0], "structure", TYPES), null);
});

test("defaultElementName numbers new elements per layer", () => {
  assert.equal(UE.defaultElementName("structure", 3), "Structure 3");
  assert.equal(UE.defaultElementName("edge", 1), "Platform 1");
  assert.equal(UE.defaultElementName("stamp", 12), "Stamp 12");
});

test("chooseType on a brand-new element takes the type's name and colour, and its emoji on stamps only", () => {
  const s = UE.chooseType({ id: "s9", name: "Structure 8", color: "#000000", emoji: "?", typeId: null }, "structure", "Door", TYPES);
  assert.deepEqual(s, { id: "s9", name: "Door label", color: "#222222", emoji: "?", typeId: "Door" });
  const e = UE.chooseType({ name: "Platform 2", color: "#000000" }, "edge", "Ledge", TYPES);
  assert.deepEqual(e, { name: "Ledge label", color: "#333333", typeId: "Ledge" });
  const p = UE.chooseType({ name: "Stamp 5", color: "#000000", emoji: "?", typeId: null }, "stamp", "Save", TYPES);
  assert.deepEqual(p, { name: "Save label", color: "#444444", emoji: "S", typeId: "Save" });
});

test("chooseType changes only typeId once the element was renamed, already typed, or carries an unknown typeId", () => {
  const renamed = { name: "My door", color: "#000000", typeId: null };
  assert.deepEqual(UE.chooseType(renamed, "structure", "Door", TYPES), { name: "My door", color: "#000000", typeId: "Door" });
  const typed = { name: "Structure 8", color: "#000000", typeId: "Wall" };
  assert.deepEqual(UE.chooseType(typed, "structure", "Door", TYPES), { name: "Structure 8", color: "#000000", typeId: "Door" });
  const unknown = { name: "Structure 8", color: "#000000", typeId: "Foo" };
  assert.deepEqual(UE.chooseType(unknown, "structure", "Door", TYPES), { name: "Structure 8", color: "#000000", typeId: "Door" });
  const otherLayerName = { name: "Platform 1", color: "#000000", typeId: null }; // an edge default name on a structure
  assert.deepEqual(UE.chooseType(otherLayerName, "structure", "Door", TYPES), { name: "Platform 1", color: "#000000", typeId: "Door" });
});

test("chooseType with an empty id marks the element unclassified by hand (typeId: null)", () => {
  assert.deepEqual(UE.chooseType({ name: "Wall label", typeId: "Wall" }, "structure", "", TYPES), { name: "Wall label", typeId: null });
});

test("chooseType ignores an id that is not a type of the layer, and never mutates its input", () => {
  const el = { name: "Structure 1", color: "#000000", typeId: "Foo" };
  assert.deepEqual(UE.chooseType(el, "structure", "Foo", TYPES), el);
  assert.deepEqual(UE.chooseType(el, "structure", "Ledge", TYPES), el);
  UE.chooseType(el, "structure", "Door", TYPES);
  assert.deepEqual(el, { name: "Structure 1", color: "#000000", typeId: "Foo" });
});
