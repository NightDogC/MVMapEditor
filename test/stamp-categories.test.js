"use strict";
// Stamp categories stored in the document (mvmap-ue.js): group (optional) -> type (typeId) -> tier (optional, defined by
// the group or by a type without a group). An element is complete, incomplete (shown red as "钱盒（未选大小）", exported
// without typeId but keeping what was picked) or unclassified.
const test = require("node:test");
const assert = require("node:assert/strict");
const UE = require("../mvmap-ue.js");

const STRENGTH = { label: "Strength", values: [{ id: "Weak", label: "weak" }, { id: "Strong", label: "strong" }] };
const SIZE = () => ({ label: "Size", values: [{ id: "S", label: "s" }, { id: "L", label: "l" }] });
const CATEGORIES = {
  groups: [
    { id: "Bat", label: "Bat", tier: STRENGTH },
    { id: "Empty", label: "Empty" },
  ],
  types: [
    { id: "Save", label: "Save", generate: "auto", color: "#222222", emoji: "S" },
    { id: "Box", label: "Box", generate: "auto", color: "#333333", emoji: "B", tier: SIZE() },
    { id: "BatA", label: "A", group: "Bat", generate: "auto", color: "#666666", emoji: "a", anchor: "FloatInAir", anchorLocked: true },
    { id: "Mech", label: "Mech", generate: "manual", color: "#444444", emoji: "M" },
    { id: "BatB", label: "B", group: "Bat", generate: "manual", color: "#777777", emoji: "c", anchor: "SnapToGround", anchorLocked: true },
    { id: "Coin", label: "Coin", generate: "auto", color: "#555555", emoji: "C", tier: SIZE() }, // same values as Box, but its own tier
  ],
};
const STRUCTURE_TYPES = [{ id: "Wall", label: "Wall", layer: "structure", generate: "auto", color: "#111111", emoji: "W" }];
const V = UE.vocabOf({ stampCategories: CATEGORIES }, STRUCTURE_TYPES);
const OLD_STAMP_IDS = [
  { id: "OldBatWeak", label: "old weak bat", group: "Bat", type: "BatA", tier: "Weak" },
  { id: "OldStrongBat", group: "Bat", tier: "Strong" },
  { id: "OldBox", type: "Box" },
];
const VOCABULARY = { types: STRUCTURE_TYPES, defaultStampCategories: CATEGORIES, oldStampIds: OLD_STAMP_IDS };

const status = (el) => [UE.elementStatusOf(el, "stamp", V), UE.statusLabelOf(el, "stamp", V)];

test("typePickerEntries: types without a group stay single entries, a group appears once where its first type is, empty groups last", () => {
  const entries = UE.typePickerEntries(V, "stamp").map((e) => (e.group ? `${e.group.id}:${e.types.map((t) => t.id).join(",")}` : e.type.id));
  assert.deepEqual(entries, ["Save", "Box", "Bat:BatA,BatB", "Mech", "Coin", "Empty:"]);
  assert.deepEqual(UE.typePickerEntries(V, "structure").map((e) => e.type.id), ["Wall"], "structure and edge layers have one level");
});

test("tierOf: a grouped type and a group-only element pick from the group's tier, a type without a group from its own", () => {
  assert.equal(UE.tierOf({ typeId: "BatB" }, "stamp", V), STRENGTH);
  assert.equal(UE.tierOf({ typeId: null, typeGroup: "Bat" }, "stamp", V), STRENGTH);
  assert.equal(UE.tierOf({ typeId: "Box" }, "stamp", V).label, "Size");
  assert.equal(UE.tierOf({ typeId: "Save" }, "stamp", V), null);
  assert.equal(UE.tierOf({ typeId: null, typeGroup: "Empty" }, "stamp", V), null);
});

test("element status: complete once the type and, when it has a tier, a tier value are picked", () => {
  assert.deepEqual(status({ typeId: "Save" }), ["complete", ""]);
  assert.deepEqual(status({ typeId: "Box", tier: "L" }), ["complete", ""]);
  assert.deepEqual(status({ typeId: "BatA", tier: "Weak" }), ["complete", ""]);
  assert.deepEqual(status({ typeId: "Save", tier: "Weak" }), ["complete", ""], "a stray tier on a type without one doesn't matter");
});

test("element status: incomplete, with the steps still missing", () => {
  assert.deepEqual(status({ typeId: "Box" }), ["incomplete", "Box（未选Size）"]);
  assert.deepEqual(status({ typeId: "BatA" }), ["incomplete", "Bat·A（未选Strength）"]);
  assert.deepEqual(status({ typeId: null, typeGroup: "Bat" }), ["incomplete", "Bat（未选小类、Strength）"]);
  assert.deepEqual(status({ typeId: null, typeGroup: "Bat", tier: "Strong" }), ["incomplete", "Bat（未选小类）"]);
  assert.deepEqual(status({ typeId: null, typeGroup: "Empty" }), ["incomplete", "Empty（未选小类）"]);
});

test("element status: an id the categories don't have counts as not picked", () => {
  assert.deepEqual(status({ typeId: "Box", tier: "Gone" }), ["incomplete", "Box（未选Size）"], "tier value removed");
  assert.deepEqual(status({ typeId: "Box", tier: "Weak" }), ["incomplete", "Box（未选Size）"], "a value of another tier");
  assert.deepEqual(status({ typeId: "Gone", typeGroup: "Bat", tier: "Weak" }), ["incomplete", "Bat（未选小类）"], "type removed, group kept");
  assert.deepEqual(status({ typeId: "Gone" }), ["unclassified", "未分类"], "nothing left that the categories know");
  assert.deepEqual(status({ typeId: null, typeGroup: "Gone" }), ["unclassified", "未分类"]);
  assert.deepEqual(status({ typeId: null }), ["unclassified", "未分类"]);
  assert.deepEqual(status({}), ["unclassified", "未分类"]);
});

test("manualMarkOf: only complete elements are generated; anything else gets the unclassified mark", () => {
  assert.equal(UE.manualMarkOf({ typeId: "Box", tier: "S" }, "stamp", V), null);
  assert.equal(UE.manualMarkOf({ typeId: "BatB", tier: "Weak" }, "stamp", V), "manual");
  assert.equal(UE.manualMarkOf({ typeId: "Box" }, "stamp", V), "unclassified");
  assert.equal(UE.manualMarkOf({ typeId: null, typeGroup: "Bat", tier: "Weak" }, "stamp", V), "unclassified");
});

test("chooseType keeps the tier value when the new type picks from the same tier, and drops it otherwise", () => {
  const strip = (el) => [el.typeId, el.tier];
  assert.deepEqual(strip(UE.chooseType({ name: "x", typeId: "BatA", tier: "Weak" }, "stamp", "BatB", V)), ["BatB", "Weak"], "same group");
  assert.deepEqual(strip(UE.chooseType({ name: "x", typeId: null, typeGroup: "Bat", tier: "Weak" }, "stamp", "BatA", V)), ["BatA", "Weak"], "group only -> type of it");
  assert.deepEqual(strip(UE.chooseType({ name: "x", typeId: "Box", tier: "S" }, "stamp", "Coin", V)), ["Coin", undefined], "another type's tier, even with the same values");
  assert.deepEqual(strip(UE.chooseType({ name: "x", typeId: "BatA", tier: "Weak" }, "stamp", "Save", V)), ["Save", undefined]);
  assert.deepEqual(strip(UE.chooseType({ name: "x", typeId: "Box", tier: "S" }, "stamp", "Box", V)), ["Box", "S"], "re-picking the same type");
  assert.deepEqual(UE.chooseType({ name: "x", typeId: "BatA", tier: "Weak", anchor: "FloatInAir" }, "stamp", "", V), { name: "x", typeId: null, anchor: "SnapToGround" }, "未分类 by hand drops everything");
});

test("chooseType on a brand-new element names it after the type, prefixed with its group", () => {
  const fresh = { name: "Stamp 4", color: "#000000", emoji: "?", typeId: null };
  assert.deepEqual(UE.chooseType(fresh, "stamp", "BatB", V), { name: "Bat·B", color: "#777777", emoji: "c", typeId: "BatB", anchor: "SnapToGround" });
  assert.equal(UE.chooseType(fresh, "stamp", "Box", V).name, "Box");
  const pending = UE.chooseTypeGroup(fresh, "stamp", "Bat", V);
  assert.equal(pending.name, "Stamp 4", "picking only the group keeps the default name");
  assert.equal(UE.chooseType(pending, "stamp", "BatA", V).name, "Bat·A");
});

test("picking a tier value adds it to a name the editor gave, and replaces the old one; names the user typed are kept", () => {
  const name = (el, v) => UE.chooseTier(el, "stamp", v, V).name;
  assert.equal(name({ name: "Box", typeId: "Box" }, "L"), "Box·l");
  assert.equal(name({ name: "Box·l", typeId: "Box", tier: "L" }, "S"), "Box·s");
  assert.equal(name({ name: "Box·l", typeId: "Box", tier: "L" }, ""), "Box", "clearing the value drops it from the name");
  assert.equal(name({ name: "Bat·A", typeId: "BatA" }, "Strong"), "Bat·A·strong");
  assert.equal(name({ name: "Gate box", typeId: "Box" }, "L"), "Gate box");
  assert.equal(name({ name: "Box·l", typeId: "Box", tier: "L" }, "Weak"), "Box·l", "a value of another tier changes nothing");
  assert.equal(name({ name: "Stamp 2", typeId: null, typeGroup: "Bat" }, "Weak"), "Stamp 2", "no type yet: the name waits for it");
  // the group's value picked first: the type, picked later, brings it into the new element's name
  const pending = UE.chooseTier(UE.chooseTypeGroup({ name: "Stamp 2", typeId: null }, "stamp", "Bat", V), "stamp", "Weak", V);
  assert.equal(UE.chooseType(pending, "stamp", "BatB", V).name, "Bat·B·weak");
});

test("chooseTypeGroup stops at the group: typeId null, typeGroup = its id, the tier value goes unless it is this group's", () => {
  const box = { name: "Wall box", typeId: "Box", tier: "S", anchor: "FloatInAir" };
  assert.deepEqual(UE.chooseTypeGroup(box, "stamp", "Bat", V), { name: "Wall box", typeId: null, typeGroup: "Bat", anchor: "FloatInAir" });
  assert.equal(box.typeGroup, undefined, "input untouched");
  const bat = { name: "Cave bat", typeId: "BatA", tier: "Weak", anchor: "FloatInAir" };
  assert.deepEqual(UE.chooseTypeGroup(bat, "stamp", "Empty", V), { name: "Cave bat", typeId: null, typeGroup: "Empty", anchor: "SnapToGround" }, "leaving a locked type resets its anchor");
  assert.deepEqual(UE.chooseTypeGroup(bat, "stamp", "Bat", V), bat, "its own group: keeps the type and the tier value");
  assert.deepEqual(UE.chooseTypeGroup(bat, "stamp", "Gone", V), bat, "a group the categories don't have");
  assert.deepEqual(UE.chooseTypeGroup(bat, "stamp", "", V), { name: "Cave bat", typeId: null, anchor: "SnapToGround" });
});

test("chooseTier sets a value of the element's tier, ignores other values, and clears with an empty id", () => {
  assert.equal(UE.chooseTier({ typeId: "Box" }, "stamp", "L", V).tier, "L");
  assert.equal(UE.chooseTier({ typeId: null, typeGroup: "Bat" }, "stamp", "Strong", V).tier, "Strong");
  assert.equal(UE.chooseTier({ typeId: "Box", tier: "S" }, "stamp", "Weak", V).tier, "S", "a value of another tier changes nothing");
  assert.equal(UE.chooseTier({ typeId: "Save" }, "stamp", "S", V).tier, undefined, "no tier to pick from");
  assert.ok(!("tier" in UE.chooseTier({ typeId: "Box", tier: "S" }, "stamp", "", V)));
});

test("fillStampCategories: a document without categories gets a copy of the defaults; one with categories keeps its own", () => {
  const filled = UE.fillStampCategories({ name: "old" }, CATEGORIES);
  assert.deepEqual(filled.stampCategories, CATEGORIES);
  filled.stampCategories.types[0].label = "changed";
  assert.equal(CATEGORIES.types[0].label, "Save", "a copy: editing one map's categories never touches the defaults");
  const own = { groups: [], types: [{ id: "Mine", label: "mine", generate: "manual", color: "#000000", emoji: "m" }] };
  assert.deepEqual(UE.fillStampCategories({ stampCategories: own }, CATEGORIES).stampCategories, own);
  assert.deepEqual(UE.fillStampCategories({ stampCategories: { groups: [], types: [] } }, CATEGORIES).stampCategories, { groups: [], types: [] }, "empty on purpose: not refilled");
});

test("fillStampCategories cleans hand-edited categories: drops entries without an id, repeated ids and broken tiers, fills missing fields", () => {
  const hand = {
    groups: [{ id: "G", tier: { label: "T", values: [{ id: "a" }, { label: "no id" }, { id: "a", label: "again" }] } }, { label: "no id" }],
    types: [{ id: "X", label: "x", tier: "big" }, { id: "X", label: "dup" }, "junk"],
  };
  assert.deepEqual(UE.fillStampCategories({ stampCategories: hand }, CATEGORIES).stampCategories, {
    groups: [{ id: "G", label: "G", tier: { label: "T", values: [{ id: "a", label: "a" }] } }],
    types: [{ id: "X", label: "x", emoji: "", color: "#888888", generate: "manual" }],
  });
});

test("migrateTypeIds moves an old stamp id to its group / type / tier", () => {
  const doc = UE.fillStampCategories({
    stamps: [
      { id: "a", name: "a", typeId: "OldBatWeak", points: [] },
      { id: "b", name: "b", typeId: "OldStrongBat", points: [] },
      { id: "c", name: "c", typeId: "OldBox", points: [] },
      { id: "d", name: "old weak bat", points: [] }, // no typeId, named with the entry's label
      { id: "e", name: "e", typeId: "Unknown", points: [] },
    ],
  }, CATEGORIES);
  const out = UE.migrateTypeIds(doc, STRUCTURE_TYPES, OLD_STAMP_IDS);
  assert.deepEqual(out.stamps.map((s) => [s.typeId, s.typeGroup, s.tier]), [
    ["BatA", undefined, "Weak"], [null, "Bat", "Strong"], ["Box", undefined, undefined], ["BatA", undefined, "Weak"], ["Unknown", undefined, undefined],
  ]);
  assert.deepEqual(UE.migrateTypeIds(out, STRUCTURE_TYPES, OLD_STAMP_IDS), out, "running it again changes nothing");
  assert.equal(doc.stamps[0].typeId, "OldBatWeak", "input untouched");
});

test("migrateTypeIds falls back to the layer the document's categories still have", () => {
  const without = (edit) => {
    const c = JSON.parse(JSON.stringify(CATEGORIES));
    edit(c);
    const doc = { stampCategories: c, stamps: [{ id: "a", name: "a", typeId: "OldBatWeak", points: [] }] };
    const s = UE.migrateTypeIds(doc, STRUCTURE_TYPES, OLD_STAMP_IDS).stamps[0];
    return [s.typeId, s.typeGroup, s.tier];
  };
  assert.deepEqual(without((c) => (c.groups[0].tier.values = [{ id: "Strong", label: "strong" }])), ["BatA", undefined, undefined], "tier value deleted");
  assert.deepEqual(without((c) => (c.types = c.types.filter((t) => t.id !== "BatA"))), [null, "Bat", "Weak"], "type deleted: group and tier");
  assert.deepEqual(without((c) => ((c.groups = c.groups.slice(1)), (c.types = c.types.filter((t) => t.group !== "Bat")))), ["OldBatWeak", undefined, undefined], "group and its types deleted: old id kept");
  assert.deepEqual(without((c) => (c.groups = c.groups.slice(1))), ["BatA", undefined, undefined], "type left without its group: the type, no tier");
});

test("export: complete stamps get typeId and tier; incomplete ones no typeId but everything picked so far; loading the file back restores it", () => {
  const doc = {
    stampCategories: CATEGORIES,
    stamps: [
      { id: "a", name: "a", typeId: "Box", tier: "L", points: [] },
      { id: "b", name: "b", typeId: "Box", points: [] },
      { id: "c", name: "c", typeId: "BatA", tier: "Gone", points: [] },
      { id: "d", name: "d", typeId: null, typeGroup: "Bat", tier: "Strong", points: [] },
      { id: "e", name: "e", typeId: null, points: [] },
      { id: "f", name: "f", typeId: "Gone", typeGroup: "Bat", points: [] },
    ],
  };
  const out = UE.buildExportDoc(doc, [], STRUCTURE_TYPES);
  const fields = (s) => Object.fromEntries(["typeId", "pendingTypeId", "typeGroup", "tier"].filter((k) => k in s).map((k) => [k, s[k]]));
  assert.deepEqual(out.stamps.map(fields), [
    { typeId: "Box", tier: "L" },
    { pendingTypeId: "Box" },
    { pendingTypeId: "BatA" },
    { typeGroup: "Bat", tier: "Strong" },
    {},
    { typeGroup: "Bat" },
  ]);
  assert.deepEqual(out.stampCategories, CATEGORIES, "the categories go with the file");
  assert.equal(doc.stamps[1].pendingTypeId, undefined, "the editor document is untouched");

  const back = UE.migrateTypeData(JSON.parse(JSON.stringify(out)), VOCABULARY);
  const bv = UE.vocabOf(back, STRUCTURE_TYPES);
  assert.deepEqual(back.stamps.map((s) => UE.statusLabelOf(s, "stamp", bv)), [
    "", "Box（未选Size）", "Bat·A（未选Strength）", "Bat（未选小类）", "未分类", "Bat（未选小类、Strength）",
  ]);
  assert.deepEqual(back.stamps.map(fields).slice(0, 4), [{ typeId: "Box", tier: "L" }, { typeId: "Box" }, { typeId: "BatA" }, { typeGroup: "Bat", tier: "Strong" }]);
});

test("migrateTypeData runs categories -> old ids -> anchors, and a pendingTypeId never overrides a typeId", () => {
  const out = UE.migrateTypeData({
    stamps: [
      { id: "a", name: "a", typeId: "OldBatWeak", anchor: "SnapToGround", points: [] },
      { id: "b", name: "b", typeId: "Save", pendingTypeId: "Box", points: [] },
    ],
  }, VOCABULARY);
  assert.deepEqual(out.stampCategories, CATEGORIES);
  assert.deepEqual([out.stamps[0].typeId, out.stamps[0].anchor], ["BatA", "FloatInAir"], "anchor from the migrated, locked type");
  assert.deepEqual([out.stamps[1].typeId, "pendingTypeId" in out.stamps[1]], ["Save", false]);
});
