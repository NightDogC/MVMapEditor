"use strict";
// Two-level type picker (mvmap-ue.js): a group (钱盒) first, then a type inside it (小). An element can stop at the group:
// it stays unclassified (no typeId, nothing exported for the importer) and remembers the group in `typeGroup`.
const test = require("node:test");
const assert = require("node:assert/strict");
const UE = require("../mvmap-ue.js");

const TYPES = [
  { id: "Wall", label: "Wall label", layer: "structure", generate: "auto", color: "#111111", emoji: "W" },
  { id: "Save", label: "Save label", layer: "stamp", generate: "auto", color: "#222222", emoji: "S" },
  { id: "BoxS", label: "Box·S", group: "Box", subLabel: "S", layer: "stamp", generate: "auto", color: "#333333", emoji: "B" },
  { id: "Mech", label: "Mech label", layer: "stamp", generate: "manual", color: "#444444", emoji: "M" },
  { id: "BoxL", label: "Box·L", group: "Box", subLabel: "L", layer: "stamp", generate: "auto", color: "#555555", emoji: "b" },
  { id: "BatA", label: "Bat·A", group: "Bat", subLabel: "A", layer: "stamp", generate: "auto", color: "#666666", emoji: "a", anchor: "FloatInAir", anchorLocked: true },
  { id: "BatB", label: "Bat·B", group: "Bat", subLabel: "B", layer: "stamp", generate: "auto", color: "#777777", emoji: "c", anchor: "SnapToGround", anchorLocked: true },
];
const GROUP_OLD_IDS = [
  { id: "OldBox", layer: "stamp", group: "Box" },
  { id: "OldBat", layer: "stamp", group: "Bat" },
  { id: "OldGone", layer: "stamp", group: "NoSuchGroup" },
  { id: "OldWall", layer: "structure", group: "Box" }, // Box is a stamp group, not a structure one
];

test("typePickerEntries: ungrouped types stay single entries, a group appears once where its first type is", () => {
  const entries = UE.typePickerEntries(TYPES, "stamp").map((e) => (e.group ? `${e.group}:${e.types.map((t) => t.id).join(",")}` : e.type.id));
  assert.deepEqual(entries, ["Save", "Box:BoxS,BoxL", "Mech", "Bat:BatA,BatB"]);
  assert.deepEqual(UE.typePickerEntries(TYPES, "structure").map((e) => e.type.id), ["Wall"], "a layer without groups has one level");
});

test("typeGroupOf: a typed element's group comes from its type; otherwise from typeGroup when the layer has that group", () => {
  assert.equal(UE.typeGroupOf({ typeId: "BoxL" }, "stamp", TYPES), "Box");
  assert.equal(UE.typeGroupOf({ typeId: "BoxL", typeGroup: "Bat" }, "stamp", TYPES), "Box", "the type wins over a stale typeGroup");
  assert.equal(UE.typeGroupOf({ typeId: "Save" }, "stamp", TYPES), null);
  assert.equal(UE.typeGroupOf({ typeId: null, typeGroup: "Bat" }, "stamp", TYPES), "Bat");
  assert.equal(UE.typeGroupOf({ typeId: null, typeGroup: "NoSuchGroup" }, "stamp", TYPES), null);
  assert.equal(UE.typeGroupOf({ typeId: null, typeGroup: "Box" }, "structure", TYPES), null);
});

test("pendingTypeGroupOf names the group only while no type inside it is picked", () => {
  assert.equal(UE.pendingTypeGroupOf({ typeId: null, typeGroup: "Box" }, "stamp", TYPES), "Box");
  assert.equal(UE.pendingTypeGroupOf({ typeGroup: "Box" }, "stamp", TYPES), "Box");
  assert.equal(UE.pendingTypeGroupOf({ typeId: "BoxS" }, "stamp", TYPES), null);
  assert.equal(UE.pendingTypeGroupOf({ typeId: null }, "stamp", TYPES), null);
  assert.equal(UE.pendingTypeGroupOf({ typeId: null, typeGroup: "NoSuchGroup" }, "stamp", TYPES), null);
  assert.equal(UE.manualMarkOf({ typeId: null, typeGroup: "Box" }, "stamp", TYPES), "unclassified", "group only = still unclassified on the map");
});

test("chooseTypeGroup stops at the group: typeId null, typeGroup set, name and colour untouched, input not mutated", () => {
  const el = { name: "Stamp 3", color: "#000000", emoji: "?", typeId: null, anchor: "SnapToGround" };
  const out = UE.chooseTypeGroup(el, "stamp", "Box", TYPES);
  assert.deepEqual(out, { name: "Stamp 3", color: "#000000", emoji: "?", typeId: null, typeGroup: "Box", anchor: "SnapToGround" });
  assert.equal(el.typeGroup, undefined);
  // then picking the type inside it: still a brand-new element, so it takes the type's name, colour and emoji, and drops typeGroup
  assert.deepEqual(UE.chooseType(out, "stamp", "BoxL", TYPES), { name: "Box·L", color: "#555555", emoji: "b", typeId: "BoxL", anchor: "SnapToGround" });
});

test("chooseTypeGroup from a typed element of another group clears the type; a locked anchor is reset like leaving the type", () => {
  const bat = { name: "Cave bat", typeId: "BatA", anchor: "FloatInAir" };
  assert.deepEqual(UE.chooseTypeGroup(bat, "stamp", "Box", TYPES), { name: "Cave bat", typeId: null, typeGroup: "Box", anchor: "SnapToGround" });
  const box = { name: "Wall box", typeId: "BoxS", anchor: "FloatInAir" };
  assert.deepEqual(UE.chooseTypeGroup(box, "stamp", "Bat", TYPES), { name: "Wall box", typeId: null, typeGroup: "Bat", anchor: "FloatInAir" });
  const unknown = { name: "Hook", typeId: "Hook" };
  assert.deepEqual(UE.chooseTypeGroup(unknown, "stamp", "Box", TYPES), { name: "Hook", typeId: null, typeGroup: "Box" });
});

test("chooseTypeGroup changes nothing for the element's own group, or a group the layer doesn't have", () => {
  const typed = { name: "Wall box", typeId: "BoxS", anchor: "SnapToGround" };
  assert.deepEqual(UE.chooseTypeGroup(typed, "stamp", "Box", TYPES), typed, "keeps the type already picked inside the group");
  const pending = { name: "Stamp 1", typeId: null, typeGroup: "Box" };
  assert.deepEqual(UE.chooseTypeGroup(pending, "stamp", "Box", TYPES), pending);
  assert.deepEqual(UE.chooseTypeGroup(typed, "stamp", "NoSuchGroup", TYPES), typed);
  assert.deepEqual(UE.chooseTypeGroup({ name: "s", typeId: "Wall" }, "structure", "Box", TYPES), { name: "s", typeId: "Wall" });
});

test("chooseTypeGroup with an empty group, and chooseType with an empty id, are 未分类 by hand and forget the group", () => {
  const pending = { name: "Gate box", typeId: null, typeGroup: "Box" };
  assert.deepEqual(UE.chooseTypeGroup(pending, "stamp", "", TYPES), { name: "Gate box", typeId: null });
  assert.deepEqual(UE.chooseType(pending, "stamp", "", TYPES), { name: "Gate box", typeId: null });
  assert.deepEqual(UE.chooseType(pending, "stamp", "Save", TYPES), { name: "Gate box", typeId: "Save", anchor: "SnapToGround" }, "an ungrouped type too");
  assert.deepEqual(UE.chooseType(pending, "stamp", "Gone", TYPES), pending, "an unknown id still changes nothing");
});

test("migrateTypeIds turns an old id listed in groupOldIds into its group, on that layer only, if the group exists", () => {
  const doc = {
    structures: [{ id: "s1", name: "w", typeId: "OldWall", rects: [] }],
    stamps: [
      { id: "a", name: "box", typeId: "OldBox", points: [] },
      { id: "b", name: "bat", typeId: "OldBat", points: [] },
      { id: "c", name: "gone", typeId: "OldGone", points: [] },
      { id: "d", name: "typed", typeId: "BoxS", points: [] },
      { id: "e", name: "pending", typeId: null, typeGroup: "Bat", points: [] },
    ],
  };
  const out = UE.migrateTypeIds(doc, TYPES, GROUP_OLD_IDS);
  assert.deepEqual(out.stamps.map((s) => [s.typeId, s.typeGroup]), [
    [null, "Box"], [null, "Bat"], ["OldGone", undefined], ["BoxS", undefined], [null, "Bat"],
  ]);
  assert.equal(out.structures[0].typeId, "OldWall", "Box is not a structure group");
  assert.equal(out.structures[0].typeGroup, undefined);
  assert.equal(doc.stamps[0].typeId, "OldBox", "input untouched");
  assert.deepEqual(UE.migrateTypeIds(out, TYPES, GROUP_OLD_IDS), out, "running it again changes nothing");
  assert.equal(UE.migrateTypeIds(doc, TYPES).stamps[0].typeId, "OldBox", "without groupOldIds the old id is kept, as before");
});

test("buildExportDoc: a group-only element has no typeId (the importer sees it as unclassified) and keeps typeGroup", () => {
  const doc = { stamps: [{ id: "a", name: "Stamp 1", typeId: null, typeGroup: "Box", points: [] }] };
  const out = UE.buildExportDoc(doc, [], TYPES);
  assert.ok(!("typeId" in out.stamps[0]));
  assert.equal(out.stamps[0].typeGroup, "Box", "kept, so importing the file back into the editor restores the group");
  assert.equal(UE.migrateTypeIds(out, TYPES, GROUP_OLD_IDS).stamps[0].typeGroup, "Box");
});

test("migrateTypeIds doesn't guess a type from the name of a group-only element exported without typeId", () => {
  // e.g. a stamp that got the name Box·S when its type was picked, then moved to group Bat only
  const exported = { stamps: [{ id: "a", name: "Box·S", typeGroup: "Bat", points: [] }] };
  const out = UE.migrateTypeIds(exported, TYPES, GROUP_OLD_IDS);
  assert.equal(out.stamps[0].typeId, undefined);
  assert.equal(UE.pendingTypeGroupOf(out.stamps[0], "stamp", TYPES), "Bat");
});
