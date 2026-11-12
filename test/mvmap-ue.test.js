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
];
// stamp types live in the document's stamp categories
const SAVE_CATEGORIES = { groups: [], types: [{ id: "Save", label: "Save label", generate: "manual", color: "#444444", emoji: "S" }] };
const V = UE.vocabOf({ stampCategories: SAVE_CATEGORIES }, TYPES);

test("typesForLayer lists only the types for that layer, in vocabulary order", () => {
  assert.deepEqual(UE.typesForLayer(V, "structure").map((t) => t.id), ["Wall", "Door"]);
  assert.deepEqual(UE.typesForLayer(V, "edge").map((t) => t.id), ["Ledge"]);
  assert.deepEqual(UE.typesForLayer(V, "stamp").map((t) => t.id), ["Save"]);
  assert.deepEqual(UE.typesForLayer(V, "note"), []);
});

test("elementTypeOf returns the element's type when its typeId belongs to that layer", () => {
  assert.equal(UE.elementTypeOf({ typeId: "Door" }, "structure", V).id, "Door");
  assert.equal(UE.elementTypeOf({ typeId: "Ledge" }, "edge", V).id, "Ledge");
});

test("elementTypeOf is null for a missing typeId, an id not in the vocabulary, or a type from another layer", () => {
  assert.equal(UE.elementTypeOf({ name: "Wall label" }, "structure", V), null);
  assert.equal(UE.elementTypeOf({ typeId: "Gone" }, "structure", V), null);
  assert.equal(UE.elementTypeOf({ typeId: "Ledge" }, "structure", V), null);
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
    stampCategories: SAVE_CATEGORIES,
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

const RENAMED_TYPES = [
  { id: "Landscape", label: "Landscape label", layer: "structure", generate: "auto", color: "#111111", emoji: "W", oldIds: ["Wall"], oldLabels: ["Wall label"] },
  { id: "Ledge", label: "Ledge label", layer: "edge", generate: "auto", color: "#333333", emoji: "L" },
];

test("migrateTypeIds moves a renamed type's old id to its current id, on that type's own layer only", () => {
  const d = {
    structures: [
      { id: "s1", name: "x", typeId: "Wall", cells: [] },
      { id: "s2", name: "x", typeId: "Gone", cells: [] },
      { id: "s3", name: "x", typeId: null, cells: [] },
    ],
    edgeStructs: [{ id: "e1", name: "x", typeId: "Wall", edges: [] }],
  };
  const out = UE.migrateTypeIds(d, RENAMED_TYPES);
  assert.equal(out.structures[0].typeId, "Landscape");
  assert.equal(out.structures[1].typeId, "Gone"); // unknown, not an old id
  assert.equal(out.structures[2].typeId, null); // 未分类 picked by hand stays
  assert.equal(out.edgeStructs[0].typeId, "Wall"); // no edge type was renamed from Wall
});

test("migrateTypeIds classifies an untyped element by a type's current or old label", () => {
  const d = { structures: [{ id: "s1", name: "Wall label", cells: [] }, { id: "s2", name: "Landscape label", cells: [] }] };
  const out = UE.migrateTypeIds(d, RENAMED_TYPES);
  assert.equal(out.structures[0].typeId, "Landscape");
  assert.equal(out.structures[1].typeId, "Landscape");
  assert.equal(out.structures[0].name, "Wall label"); // the name is display only and is kept
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
  assert.equal(UE.elementTypeOf(out.structures[0], "structure", V), null);
});

test("defaultElementName numbers new elements per layer", () => {
  assert.equal(UE.defaultElementName("structure", 3), "Structure 3");
  assert.equal(UE.defaultElementName("edge", 1), "Platform 1");
  assert.equal(UE.defaultElementName("stamp", 12), "Stamp 12");
});

test("chooseType on a brand-new element takes the type's name and colour, and its emoji on stamps only", () => {
  const s = UE.chooseType({ id: "s9", name: "Structure 8", color: "#000000", emoji: "?", typeId: null }, "structure", "Door", V);
  assert.deepEqual(s, { id: "s9", name: "Door label", color: "#222222", emoji: "?", typeId: "Door" });
  const e = UE.chooseType({ name: "Platform 2", color: "#000000" }, "edge", "Ledge", V);
  assert.deepEqual(e, { name: "Ledge label", color: "#333333", typeId: "Ledge" });
  const p = UE.chooseType({ name: "Stamp 5", color: "#000000", emoji: "?", typeId: null }, "stamp", "Save", V);
  assert.deepEqual(p, { name: "Save label", color: "#444444", emoji: "S", typeId: "Save", anchor: "SnapToGround" });
});

const ANCHOR_CATEGORIES = {
  groups: [],
  types: [
    { id: "Box", label: "Box", generate: "auto", color: "#111111", emoji: "B" },
    { id: "Lamp", label: "Lamp", generate: "auto", color: "#111111", emoji: "L", anchor: "FloatInAir" },
    { id: "Bat", label: "Bat", generate: "auto", color: "#111111", emoji: "b", anchor: "FloatInAir", anchorLocked: true },
    { id: "Rat", label: "Rat", generate: "auto", color: "#111111", emoji: "r", anchor: "SnapToGround", anchorLocked: true },
  ],
};
const ANCHOR_V = UE.vocabOf({ stampCategories: ANCHOR_CATEGORIES }, []);

test("stampAnchorOf: a locked type wins, then the element's own valid anchor, then the type's default, then SnapToGround", () => {
  assert.equal(UE.stampAnchorOf({ typeId: "Bat", anchor: "SnapToGround" }, ANCHOR_V), "FloatInAir");
  assert.equal(UE.stampAnchorOf({ typeId: "Box", anchor: "FloatInAir" }, ANCHOR_V), "FloatInAir");
  assert.equal(UE.stampAnchorOf({ typeId: "Lamp" }, ANCHOR_V), "FloatInAir");
  assert.equal(UE.stampAnchorOf({ typeId: "Lamp", anchor: "Sideways" }, ANCHOR_V), "FloatInAir");
  assert.equal(UE.stampAnchorOf({ typeId: "Box" }, ANCHOR_V), "SnapToGround");
  assert.equal(UE.stampAnchorOf({ typeId: null }, ANCHOR_V), "SnapToGround");
  assert.equal(UE.isStampAnchorLocked({ typeId: "Rat" }, ANCHOR_V), true);
  assert.equal(UE.isStampAnchorLocked({ typeId: "Lamp" }, ANCHOR_V), false);
  assert.equal(UE.isStampAnchorLocked({ typeId: "Gone" }, ANCHOR_V), false);
});

test("migrateStampAnchors fills a missing or unknown anchor from the type, keeps a valid one, forces locked ones, leaves the input alone", () => {
  const doc = {
    stamps: [
      { id: "a", typeId: "Lamp", points: [] },
      { id: "b", typeId: "Box", anchor: "FloatInAir", points: [] },
      { id: "c", typeId: "Rat", anchor: "FloatInAir", points: [] },
      { id: "d", typeId: null, anchor: "???", points: [] },
    ],
    stampCategories: ANCHOR_CATEGORIES,
  };
  const out = UE.migrateStampAnchors(doc, []);
  assert.deepEqual(out.stamps.map((s) => s.anchor), ["FloatInAir", "FloatInAir", "SnapToGround", "SnapToGround"]);
  assert.equal(doc.stamps[0].anchor, undefined);
  assert.deepEqual(UE.migrateStampAnchors({}, []), {});
});

test("chooseType on stamps: locked types set their anchor; leaving a locked type resets it; otherwise the anchor is kept", () => {
  const named = { name: "Wall box", typeId: "Box", anchor: "FloatInAir" };
  assert.equal(UE.chooseType(named, "stamp", "Lamp", ANCHOR_V).anchor, "FloatInAir", "kept: the user picked it");
  assert.equal(UE.chooseType({ ...named, anchor: "SnapToGround" }, "stamp", "Lamp", ANCHOR_V).anchor, "SnapToGround", "kept, even against the new default");
  assert.equal(UE.chooseType(named, "stamp", "Rat", ANCHOR_V).anchor, "SnapToGround", "locked type");
  const bat = { name: "Cave bat", typeId: "Bat", anchor: "FloatInAir" };
  assert.equal(UE.chooseType(bat, "stamp", "Box", ANCHOR_V).anchor, "SnapToGround", "the locked anchor was never the user's");
  assert.equal(UE.chooseType(bat, "stamp", "", ANCHOR_V).anchor, "SnapToGround", "unclassified by hand");
  assert.equal(UE.chooseType({ name: "Stamp 3", typeId: null, anchor: "SnapToGround" }, "stamp", "Lamp", ANCHOR_V).anchor, "FloatInAir", "new element: type default");
});

test("buildExportDoc writes every stamp's effective anchor and keeps point ids", () => {
  const doc = {
    stamps: [
      { id: "a", typeId: "Bat", anchor: "SnapToGround", points: [{ id: "pt_1", x: 1, y: 2 }] },
      { id: "b", typeId: "Box", points: [] },
    ],
    stampCategories: ANCHOR_CATEGORIES,
  };
  const out = UE.buildExportDoc(doc, [], []);
  assert.deepEqual(out.stamps.map((s) => s.anchor), ["FloatInAir", "SnapToGround"]);
  assert.deepEqual(out.stamps[0].points, [{ id: "pt_1", x: 1, y: 2 }]);
  assert.equal(doc.stamps[1].anchor, undefined, "the editor document is untouched");
});

test("chooseType changes only typeId once the element was renamed, already typed, or carries an unknown typeId", () => {
  const renamed = { name: "My door", color: "#000000", typeId: null };
  assert.deepEqual(UE.chooseType(renamed, "structure", "Door", V), { name: "My door", color: "#000000", typeId: "Door" });
  const typed = { name: "Structure 8", color: "#000000", typeId: "Wall" };
  assert.deepEqual(UE.chooseType(typed, "structure", "Door", V), { name: "Structure 8", color: "#000000", typeId: "Door" });
  const unknown = { name: "Structure 8", color: "#000000", typeId: "Foo" };
  assert.deepEqual(UE.chooseType(unknown, "structure", "Door", V), { name: "Structure 8", color: "#000000", typeId: "Door" });
  const otherLayerName = { name: "Platform 1", color: "#000000", typeId: null }; // an edge default name on a structure
  assert.deepEqual(UE.chooseType(otherLayerName, "structure", "Door", V), { name: "Platform 1", color: "#000000", typeId: "Door" });
});

test("chooseType with an empty id marks the element unclassified by hand (typeId: null)", () => {
  assert.deepEqual(UE.chooseType({ name: "Wall label", typeId: "Wall" }, "structure", "", V), { name: "Wall label", typeId: null });
});

test("chooseType ignores an id that is not a type of the layer, and never mutates its input", () => {
  const el = { name: "Structure 1", color: "#000000", typeId: "Foo" };
  assert.deepEqual(UE.chooseType(el, "structure", "Foo", V), el);
  assert.deepEqual(UE.chooseType(el, "structure", "Ledge", V), el);
  UE.chooseType(el, "structure", "Door", V);
  assert.deepEqual(el, { name: "Structure 1", color: "#000000", typeId: "Foo" });
});

test("manualMarkOf marks manual-type elements and leaves auto-type elements unmarked", () => {
  assert.equal(UE.manualMarkOf({ typeId: "Door" }, "structure", V), "manual");
  assert.equal(UE.manualMarkOf({ typeId: "Save" }, "stamp", V), "manual");
  assert.equal(UE.manualMarkOf({ typeId: "Wall" }, "structure", V), null);
  assert.equal(UE.manualMarkOf({ typeId: "Ledge" }, "edge", V), null);
});

test("manualMarkOf marks elements with no usable type as unclassified: missing, null, unknown, or another layer's type", () => {
  assert.equal(UE.manualMarkOf({ name: "Some edge" }, "edge", V), "unclassified");
  assert.equal(UE.manualMarkOf({ typeId: null }, "structure", V), "unclassified");
  assert.equal(UE.manualMarkOf({ typeId: "Foo" }, "stamp", V), "unclassified");
  assert.equal(UE.manualMarkOf({ typeId: "Ledge" }, "structure", V), "unclassified");
});
