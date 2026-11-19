"use strict";
// Stamp categories stored in the document (mvmap-ue.js), shaped like UE's StampTypes: submenus (display only) and a flat
// list of types (typeId), each with its own tiers (optional). An element is complete, incomplete (shown red as
// "Box（未选Size）", exported without typeId but keeping what was picked) or unclassified. The import method comes from
// the default categories, never from the document.
const test = require("node:test");
const assert = require("node:assert/strict");
const UE = require("../mvmap-ue.js");

const STRENGTH = () => [{ id: "Weak", label: "weak" }, { id: "Strong", label: "strong" }];
const SIZE = () => [{ id: "S", label: "s" }, { id: "L", label: "l" }, { id: "Weak", label: "weak" }];
const CATEGORIES = {
  submenus: [
    { id: "Bat", label: "Bat" },
    { id: "Empty", label: "Empty" },
  ],
  types: [
    { id: "Save", label: "Save", color: "#222222", emoji: "S" },
    { id: "Box", label: "Box", color: "#333333", emoji: "B", tierLabel: "Size", tiers: SIZE() },
    { id: "BatA", label: "A", submenu: "Bat", color: "#666666", emoji: "a", anchor: "FloatInAir", anchorLocked: true, tierLabel: "Strength", tiers: STRENGTH() },
    { id: "Mech", label: "Mech", color: "#444444", emoji: "M" },
    { id: "BatB", label: "B", submenu: "Bat", color: "#777777", emoji: "c", anchor: "SnapToGround", anchorLocked: true, tierLabel: "Strength", tiers: STRENGTH() },
    { id: "Coin", label: "Coin", color: "#555555", emoji: "C", tierLabel: "Size", tiers: SIZE() }, // same tiers as Box
    { id: "BatC", label: "C", submenu: "Bat", color: "#888888", emoji: "d" }, // in the submenu, no tiers
    { id: "Lost", label: "Lost", submenu: "Gone", color: "#999999", emoji: "l" }, // its submenu is gone
  ],
};
// What UE imports: Save, Box and BatA are generated; a document saying otherwise doesn't matter.
const DEFAULTS = {
  submenus: [],
  types: [
    { id: "Save", importMethod: "auto" },
    { id: "Box", importMethod: "auto" },
    { id: "BatA", importMethod: "auto" },
    { id: "BatB", importMethod: "manual" },
  ],
};
const STRUCTURE_TYPES = [
  { id: "Wall", label: "Wall", layer: "structure", importMethod: "auto", color: "#111111", emoji: "W" },
  { id: "Door", label: "Door", layer: "structure", importMethod: "manual", color: "#111111", emoji: "D" },
];
const V = UE.vocabOf({ stampCategories: CATEGORIES }, STRUCTURE_TYPES, DEFAULTS);
const OLD_STAMP_IDS = [
  { id: "OldBatWeak", label: "old weak bat", type: "BatA", tier: "Weak" },
  { id: "OldStrongBat", label: "old strong bat" }, // no type: 未分类
  { id: "OldBox", type: "Box" },
];
const VOCABULARY = { types: STRUCTURE_TYPES, defaultStampCategories: CATEGORIES, oldStampIds: OLD_STAMP_IDS };

const status = (el) => [UE.elementStatusOf(el, "stamp", V), UE.statusLabelOf(el, "stamp", V)];

test("typePickerSections: types outside a submenu first, then each submenu in order; empty submenus left out", () => {
  const sections = (layer) => UE.typePickerSections(V, layer).map((s) => `${s.submenu ? s.submenu.id : "-"}:${s.types.map((t) => t.id).join(",")}`);
  assert.deepEqual(sections("stamp"), ["-:Save,Box,Mech,Coin,Lost", "Bat:BatA,BatB,BatC"]);
  assert.deepEqual(sections("structure"), ["-:Wall,Door"], "structure and edge layers have one section");
  assert.deepEqual(sections("edge"), []);
  const onlyInSubmenus = UE.vocabOf({ stampCategories: { submenus: CATEGORIES.submenus, types: CATEGORIES.types.filter((t) => t.submenu === "Bat") } }, []);
  assert.deepEqual(UE.typePickerSections(onlyInSubmenus, "stamp").map((s) => s.submenu && s.submenu.id), ["Bat"], "no empty first section");
});

test("stampCategorySections: like the dropdown's sections, but every submenu is listed, empty ones included", () => {
  const sections = UE.stampCategorySections(V).map((s) => `${s.submenu ? s.submenu.id : "-"}:${s.types.map((t) => t.id).join(",")}`);
  assert.deepEqual(sections, ["-:Save,Box,Mech,Coin,Lost", "Bat:BatA,BatB,BatC", "Empty:"]);
  const none = UE.vocabOf({ stampCategories: { submenus: [], types: [] } }, []);
  assert.deepEqual(UE.stampCategorySections(none), [{ submenu: null, types: [] }], "the first section is always there");
});

test("importMethodOf: a stamp type is auto only when the default categories say so; structure / edge types say it themselves", () => {
  assert.equal(UE.importMethodOf("Save", "stamp", V), "auto");
  assert.equal(UE.importMethodOf("BatB", "stamp", V), "manual");
  assert.equal(UE.importMethodOf("Mech", "stamp", V), "manual", "a type the defaults don't have");
  assert.equal(UE.importMethodOf(null, "stamp", V), "manual");
  const claims = UE.vocabOf({ stampCategories: { submenus: [], types: [{ id: "Mech", label: "m", color: "#000000", emoji: "m", importMethod: "auto" }] } }, [], DEFAULTS);
  assert.equal(UE.importMethodOf("Mech", "stamp", claims), "manual", "what the document says is ignored");
  assert.equal(UE.importMethodOf("Wall", "structure", V), "auto");
  assert.equal(UE.importMethodOf("Door", "structure", V), "manual");
  assert.equal(UE.importMethodOf("Wall", "edge", V), "manual", "a type of another layer");
  assert.equal(UE.importMethodOf("Save", "stamp", UE.vocabOf({ stampCategories: CATEGORIES }, [])), "manual", "no defaults given: nothing is auto");
});

test("tierOf: one of the element's type's tiers, or null", () => {
  assert.deepEqual(UE.tierOf({ typeId: "BatB", tier: "Strong" }, "stamp", V), { id: "Strong", label: "strong" });
  assert.equal(UE.tierOf({ typeId: "Box", tier: "Strong" }, "stamp", V), null, "a tier of another type");
  assert.equal(UE.tierOf({ typeId: "Save", tier: "S" }, "stamp", V), null, "a type without tiers");
  assert.equal(UE.tierOf({ typeId: null, tier: "S" }, "stamp", V), null);
  assert.equal(UE.tiersOfType(null), null);
  assert.equal(UE.tiersOfType(CATEGORIES.types[0]), null);
  assert.deepEqual(UE.tiersOfType(CATEGORIES.types[1]).map((v) => v.id), ["S", "L", "Weak"]);
});

test("element status: complete once the type and, when it has tiers, one of them are picked", () => {
  assert.deepEqual(status({ typeId: "Save" }), ["complete", ""]);
  assert.deepEqual(status({ typeId: "Box", tier: "L" }), ["complete", ""]);
  assert.deepEqual(status({ typeId: "BatA", tier: "Weak" }), ["complete", ""]);
  assert.deepEqual(status({ typeId: "BatC" }), ["complete", ""], "a type in a submenu without tiers");
  assert.deepEqual(status({ typeId: "Save", tier: "Weak" }), ["complete", ""], "a stray tier on a type without tiers doesn't matter");
});

test("element status: incomplete names the type and its tier label, without the submenu", () => {
  assert.deepEqual(status({ typeId: "Box" }), ["incomplete", "Box（未选Size）"]);
  assert.deepEqual(status({ typeId: "BatA" }), ["incomplete", "A（未选Strength）"]);
  assert.deepEqual(status({ typeId: "Box", tier: "Gone" }), ["incomplete", "Box（未选Size）"], "tier removed");
  assert.deepEqual(status({ typeId: "Box", tier: "Strong" }), ["incomplete", "Box（未选Size）"], "a tier of another type");
  const noTiersYet = UE.vocabOf({ stampCategories: { submenus: [], types: [{ id: "T", label: "t", color: "#000000", emoji: "t", tierLabel: "Level", tiers: [] }] } }, []);
  assert.equal(UE.statusLabelOf({ typeId: "T" }, "stamp", noTiersYet), "t（未选Level）", "a tier label with no tiers yet");
});

test("element status: unclassified without a type the categories know", () => {
  assert.deepEqual(status({ typeId: "Gone", tier: "Weak" }), ["unclassified", "未分类"]);
  assert.deepEqual(status({ typeId: null, tier: "Weak" }), ["unclassified", "未分类"]);
  assert.deepEqual(status({}), ["unclassified", "未分类"]);
});

test("manualMarkOf: complete auto types get no mark, complete manual types 'manual', anything else 'unclassified'", () => {
  assert.equal(UE.manualMarkOf({ typeId: "Box", tier: "S" }, "stamp", V), null);
  assert.equal(UE.manualMarkOf({ typeId: "BatB", tier: "Weak" }, "stamp", V), "manual");
  assert.equal(UE.manualMarkOf({ typeId: "Mech" }, "stamp", V), "manual", "not in the defaults");
  assert.equal(UE.manualMarkOf({ typeId: "Box" }, "stamp", V), "unclassified");
  assert.equal(UE.manualMarkOf({ typeId: null }, "stamp", V), "unclassified");
  assert.equal(UE.manualMarkOf({ typeId: "Wall" }, "structure", V), null);
  assert.equal(UE.manualMarkOf({ typeId: "Door" }, "structure", V), "manual");
});

test("chooseType keeps the tier only when the new type has it under the same tier label", () => {
  const strip = (el) => [el.typeId, el.tier];
  assert.deepEqual(strip(UE.chooseType({ name: "x", typeId: "BatA", tier: "Weak" }, "stamp", "BatB", V)), ["BatB", "Weak"], "both Strength");
  assert.deepEqual(strip(UE.chooseType({ name: "x", typeId: "Box", tier: "S" }, "stamp", "Coin", V)), ["Coin", "S"], "both Size");
  assert.deepEqual(strip(UE.chooseType({ name: "x", typeId: "Box", tier: "Weak" }, "stamp", "BatA", V)), ["BatA", undefined], "same id, another tier label");
  assert.deepEqual(strip(UE.chooseType({ name: "x", typeId: "BatA", tier: "Weak" }, "stamp", "Save", V)), ["Save", undefined], "the new type has no tiers");
  assert.deepEqual(strip(UE.chooseType({ name: "x", typeId: null, tier: "Weak" }, "stamp", "BatA", V)), ["BatA", undefined], "no type before");
  assert.deepEqual(strip(UE.chooseType({ name: "x", typeId: "BatA", tier: "Gone" }, "stamp", "BatB", V)), ["BatB", undefined], "a tier the old type didn't have");
  assert.deepEqual(strip(UE.chooseType({ name: "x", typeId: "Box", tier: "S" }, "stamp", "Box", V)), ["Box", "S"], "re-picking the same type");
  assert.deepEqual(UE.chooseType({ name: "x", typeId: "BatA", tier: "Weak", anchor: "FloatInAir" }, "stamp", "", V), { name: "x", typeId: null, anchor: "SnapToGround" }, "未分类 by hand drops everything");
  const gone = { name: "x", typeId: "BatA" };
  assert.deepEqual(UE.chooseType(gone, "stamp", "Nope", V), gone, "an id that isn't a type changes nothing");
});

test("chooseType on a brand-new element names it after the type, prefixed with its submenu", () => {
  const fresh = { name: "Stamp 4", color: "#000000", emoji: "?", typeId: null };
  assert.deepEqual(UE.chooseType(fresh, "stamp", "BatB", V), { name: "Bat·B", color: "#777777", emoji: "c", typeId: "BatB", anchor: "SnapToGround" });
  assert.equal(UE.chooseType(fresh, "stamp", "Box", V).name, "Box");
  assert.equal(UE.chooseType(fresh, "stamp", "Lost", V).name, "Lost", "a submenu the categories don't have adds nothing");
  assert.equal(UE.chooseType({ ...fresh, name: "Gate" }, "stamp", "Box", V).name, "Gate", "a name the user typed");
});

test("picking a tier adds it to a name the editor gave, and replaces the old one; names the user typed are kept", () => {
  const name = (el, v) => UE.chooseTier(el, "stamp", v, V).name;
  assert.equal(name({ name: "Box", typeId: "Box" }, "L"), "Box·l");
  assert.equal(name({ name: "Box·l", typeId: "Box", tier: "L" }, "S"), "Box·s");
  assert.equal(name({ name: "Box·l", typeId: "Box", tier: "L" }, ""), "Box", "clearing the tier drops it from the name");
  assert.equal(name({ name: "Bat·A", typeId: "BatA" }, "Strong"), "Bat·A·strong");
  assert.equal(name({ name: "Gate box", typeId: "Box" }, "L"), "Gate box");
  assert.equal(name({ name: "Box·l", typeId: "Box", tier: "L" }, "Strong"), "Box·l", "a tier of another type changes nothing");
  // the tier is kept across a type change within the same tier label, and a name the editor gave follows the new type
  const weak = UE.chooseTier(UE.chooseType({ name: "Stamp 2", typeId: null }, "stamp", "BatA", V), "stamp", "Weak", V);
  assert.equal(weak.name, "Bat·A·weak");
  const moved = UE.chooseType(weak, "stamp", "BatB", V);
  assert.deepEqual([moved.name, moved.tier], ["Bat·B·weak", "Weak"]);
});

test("chooseType renames an element still named after its old type; a name the user typed is kept", () => {
  const name = (el, typeId) => UE.chooseType(el, "stamp", typeId, V).name;
  assert.equal(name({ name: "Bat·A", typeId: "BatA" }, "BatB"), "Bat·B", "editor name without a tier");
  assert.equal(name({ name: "Bat·A·weak", typeId: "BatA", tier: "Weak" }, "Box"), "Box", "the tier goes, and leaves the name");
  assert.equal(name({ name: "Box·s", typeId: "Box", tier: "S" }, "BatA"), "Bat·A", "same id, another tier label: cleared");
  assert.equal(name({ name: "Box·s", typeId: "Box", tier: "S" }, "Coin"), "Coin·s");
  assert.equal(name({ name: "Box", typeId: "Box", tier: "S" }, "Coin"), "Coin·s", "the editor's name before the tier was picked");
  assert.equal(name({ name: "Cave bat", typeId: "BatA", tier: "Weak" }, "BatB"), "Cave bat", "typed by hand");
  assert.equal(name({ name: "Bat·A·weak", typeId: "BatA", tier: "Weak" }, ""), "Bat·A·weak", "未分类 keeps the name");
  assert.equal(name({ name: "Bat·A", typeId: "Gone" }, "BatB"), "Bat·A", "no known old type: nothing to compare with");
  const wall = UE.chooseType({ name: "Wall", typeId: "Wall" }, "structure", "Door", V);
  assert.equal(wall.name, "Door", "structure / edge types too");
});

test("chooseTier sets one of the type's tiers, ignores other ids, and clears with an empty id", () => {
  assert.equal(UE.chooseTier({ typeId: "Box" }, "stamp", "L", V).tier, "L");
  assert.equal(UE.chooseTier({ typeId: "Box", tier: "S" }, "stamp", "Strong", V).tier, "S", "a tier of another type changes nothing");
  assert.equal(UE.chooseTier({ typeId: "Save" }, "stamp", "S", V).tier, undefined, "no tiers to pick from");
  assert.equal(UE.chooseTier({ typeId: null }, "stamp", "S", V).tier, undefined, "no type yet");
  assert.ok(!("tier" in UE.chooseTier({ typeId: "Box", tier: "S" }, "stamp", "", V)));
});

test("fillStampCategories: a document without categories gets a copy of the defaults without importMethod; one with categories keeps its own", () => {
  const defaults = { submenus: [{ id: "G", label: "g" }], types: [{ id: "A", label: "a", color: "#000000", emoji: "a", submenu: "G", importMethod: "auto" }] };
  const filled = UE.fillStampCategories({ name: "old" }, defaults);
  assert.deepEqual(filled.stampCategories, { submenus: [{ id: "G", label: "g" }], types: [{ id: "A", label: "a", color: "#000000", emoji: "a", submenu: "G" }] });
  filled.stampCategories.types[0].label = "changed";
  assert.equal(defaults.types[0].label, "a", "a copy: editing one map's categories never touches the defaults");
  assert.deepEqual(UE.fillStampCategories({ stampCategories: CATEGORIES }, defaults).stampCategories, CATEGORIES);
  assert.deepEqual(UE.fillStampCategories({ stampCategories: { submenus: [], types: [] } }, defaults).stampCategories, { submenus: [], types: [] }, "empty on purpose: not refilled");
});

// Categories as the editor wrote them before they matched UE: groups with a tier each, a type's own tier object,
// `group`, `generate`.
const OLD_SHAPE = () => ({
  groups: [
    { id: "Enemy", label: "敌人", tier: { label: "强弱", values: [{ id: "Weak", label: "弱小" }, { id: "Elite", label: "精英" }] } },
    { id: "Plain", label: "plain" },
  ],
  types: [
    { id: "Box", label: "钱盒", generate: "auto", color: "#000000", emoji: "b", tier: { label: "大小", values: [{ id: "Small", label: "小" }] } },
    { id: "Melee", label: "近战", group: "Enemy", generate: "auto", color: "#000000", emoji: "m", anchor: "SnapToGround", anchorLocked: true },
    { id: "Flying", label: "飞行", group: "Enemy", generate: "manual", color: "#000000", emoji: "f" },
    { id: "Odd", label: "odd", group: "Plain", generate: "manual", color: "#000000", emoji: "o", tier: { label: "x", values: [{ id: "X", label: "x" }] } }, // own tier, in a group without one
    { id: "Shadowed", label: "shadowed", group: "Enemy", color: "#000000", emoji: "h", tier: { label: "y", values: [] } }, // own tier, but its group's wins
    { id: "Save", label: "save", generate: "auto", color: "#000000", emoji: "s" },
  ],
});

test("loading upgrades old categories: groups become submenus, a group's tier is copied to each of its types, tier objects split, generate goes", () => {
  const c = UE.fillStampCategories({ stampCategories: OLD_SHAPE() }, CATEGORIES).stampCategories;
  const enemyTiers = [{ id: "Weak", label: "弱小" }, { id: "Elite", label: "精英" }];
  assert.deepEqual(c, {
    submenus: [{ id: "Enemy", label: "敌人" }, { id: "Plain", label: "plain" }],
    types: [
      { id: "Box", label: "钱盒", color: "#000000", emoji: "b", tierLabel: "大小", tiers: [{ id: "Small", label: "小" }] },
      { id: "Melee", label: "近战", submenu: "Enemy", color: "#000000", emoji: "m", anchor: "SnapToGround", anchorLocked: true, tierLabel: "强弱", tiers: enemyTiers },
      { id: "Flying", label: "飞行", submenu: "Enemy", color: "#000000", emoji: "f", tierLabel: "强弱", tiers: enemyTiers },
      { id: "Odd", label: "odd", submenu: "Plain", color: "#000000", emoji: "o", tierLabel: "x", tiers: [{ id: "X", label: "x" }] },
      { id: "Shadowed", label: "shadowed", submenu: "Enemy", color: "#000000", emoji: "h", tierLabel: "强弱", tiers: enemyTiers },
      { id: "Save", label: "save", color: "#000000", emoji: "s" },
    ],
  });
  assert.notEqual(c.types[1].tiers, c.types[2].tiers, "each type gets its own copy");
  assert.deepEqual(UE.stampCategoryProblems({ stampCategories: OLD_SHAPE() }), [], "a format upgrade, not a fault of the file: nothing to report");
  assert.deepEqual(UE.fillStampCategories({ stampCategories: c }, CATEGORIES).stampCategories, c, "the current shape stays as it is");
});

test("fillStampCategories cleans hand-edited categories: drops entries without an id, repeated ids and broken tiers, fills missing fields", () => {
  const hand = {
    submenus: [{ id: "G" }, { label: "no id" }],
    types: [
      { id: "X", label: "x", tiers: [{ id: "a" }, { label: "no id" }, { id: "a", label: "again" }] },
      { id: "X", label: "dup" },
      "junk",
      { id: "Y", label: "y", color: "#000000", emoji: "y", tierLabel: "lonely" },
      { id: "Z", label: "z", color: "#000000", emoji: "z", tierLabel: "T", tiers: "big", importMethod: "auto" },
    ],
  };
  assert.deepEqual(UE.fillStampCategories({ stampCategories: hand }, CATEGORIES).stampCategories, {
    submenus: [{ id: "G", label: "G" }],
    types: [
      { id: "X", label: "x", emoji: "", color: "#888888", tierLabel: "档位", tiers: [{ id: "a", label: "a" }] },
      { id: "Y", label: "y", color: "#000000", emoji: "y" },
      { id: "Z", label: "z", color: "#000000", emoji: "z" },
    ],
  });
});

test("stampCategoryProblems lists what loading changes in hand-edited categories, one line each", () => {
  const hand = {
    submenus: [{ id: "G" }, { label: "no id" }],
    types: [
      { id: "X", label: "x", tiers: [{ id: "a" }, { label: "no id" }, { id: "a", label: "again" }] },
      { id: "X", label: "dup" },
      { id: "Y", label: "y", color: "#000000", emoji: "y", tierLabel: "lonely" },
      { id: "Z", label: "z", color: "#000000", emoji: "z", tierLabel: "T", tiers: "big" },
    ],
  };
  assert.deepEqual(UE.stampCategoryProblems({ stampCategories: hand }), [
    'Submenu #2: no id, dropped',
    'Submenu "G": no name, named by its id',
    'Type "X": repeated, the later one dropped',
    'Type "X": emoji, color missing or invalid, default used',
    'Type "X" tier #2: no id, dropped',
    'Type "X" tier "a": repeated, the later one dropped',
    'Type "X" tier "a": no name, named by its id',
    'Type "X": tiers without a tier label, named "档位"',
    'Type "Y": tier label without tiers, dropped',
    'Type "Z": tiers is not a list, dropped',
    'Type "Z": tier label without tiers, dropped',
  ]);
  assert.deepEqual(UE.stampCategoryProblems({ stampCategories: { submenus: "x", types: [] } }), ["submenus: not a list, ignored"]);
  assert.deepEqual(UE.stampCategoryProblems({ stampCategories: [] }), ["stampCategories: not an object, the default categories used"]);
  assert.deepEqual(UE.stampCategoryProblems({ name: "old file" }), [], "no categories at all: an old file, nothing to report");
  assert.deepEqual(UE.stampCategoryProblems({ stampCategories: CATEGORIES }), [], "what the editor writes is clean");
  const exported = UE.buildExportDoc(UE.fillStampCategories({ stamps: [] }, CATEGORIES), [], STRUCTURE_TYPES, DEFAULTS);
  assert.deepEqual(UE.stampCategoryProblems(exported), [], "an exported file (importMethod on its types) loads back without a report");
});

test("migrateTypeIds moves an old stamp id to its type and tier; an entry without a type makes it 未分类", () => {
  const doc = UE.fillStampCategories({
    stamps: [
      { id: "a", name: "a", typeId: "OldBatWeak", points: [] },
      { id: "b", name: "Elite one", typeId: "OldStrongBat", tier: "Strong", points: [] },
      { id: "c", name: "c", typeId: "OldBox", points: [] },
      { id: "d", name: "old weak bat", points: [] }, // no typeId, named with the entry's label
      { id: "e", name: "old strong bat", points: [] },
      { id: "f", name: "f", typeId: "Unknown", points: [] },
    ],
  }, CATEGORIES);
  const out = UE.migrateTypeIds(doc, STRUCTURE_TYPES, OLD_STAMP_IDS);
  assert.deepEqual(out.stamps.map((s) => [s.name, s.typeId, s.tier]), [
    ["a", "BatA", "Weak"], ["Elite one", null, undefined], ["c", "Box", undefined], ["old weak bat", "BatA", "Weak"], ["old strong bat", null, undefined], ["f", "Unknown", undefined],
  ]);
  assert.deepEqual(UE.migrateTypeIds(out, STRUCTURE_TYPES, OLD_STAMP_IDS), out, "running it again changes nothing");
  assert.equal(doc.stamps[0].typeId, "OldBatWeak", "input untouched");
});

test("migrateTypeIds falls back to what the document's categories still have", () => {
  const without = (edit) => {
    const c = JSON.parse(JSON.stringify(CATEGORIES));
    edit(c);
    const doc = { stampCategories: c, stamps: [{ id: "a", name: "a", typeId: "OldBatWeak", points: [] }] };
    const s = UE.migrateTypeIds(doc, STRUCTURE_TYPES, OLD_STAMP_IDS).stamps[0];
    return [s.typeId, s.tier];
  };
  assert.deepEqual(without((c) => (c.types[2].tiers = [{ id: "Strong", label: "strong" }])), ["BatA", undefined], "tier deleted");
  assert.deepEqual(without((c) => (c.types = c.types.filter((t) => t.id !== "BatA"))), ["OldBatWeak", undefined], "type deleted: old id kept");
  assert.deepEqual(without((c) => (c.submenus = [])), ["BatA", "Weak"], "submenus don't matter");
});

test("migrateTypeIds: a stamp that picked only a group becomes 未分类 with its name kept, and is never re-guessed from its name", () => {
  const doc = {
    stampCategories: CATEGORIES,
    stamps: [
      { id: "a", name: "阴甲刀卫", typeGroup: "Bat", tier: "Weak", points: [] }, // exported group-only: no typeId field
      { id: "b", name: "Box", typeGroup: "Bat", points: [] }, // its name is a type's label
      { id: "c", name: "c", typeId: null, typeGroup: "Bat", tier: "Strong", points: [] }, // as the editor kept it
      { id: "d", name: "d", typeId: "BatA", tier: "Weak", typeGroup: "Bat", points: [] }, // a stray group next to a type
    ],
  };
  const out = UE.migrateTypeIds(doc, STRUCTURE_TYPES, OLD_STAMP_IDS);
  assert.deepEqual(out.stamps.map((s) => [s.name, s.typeId, s.tier, "typeGroup" in s]), [
    ["阴甲刀卫", null, undefined, false], ["Box", null, undefined, false], ["c", null, undefined, false], ["d", "BatA", "Weak", false],
  ]);
});

test("export: complete stamps get typeId and tier; incomplete ones pendingTypeId; every type its importMethod; loading the file back restores it", () => {
  const doc = {
    stampCategories: CATEGORIES,
    stamps: [
      { id: "a", name: "a", typeId: "Box", tier: "L", points: [] },
      { id: "b", name: "b", typeId: "Box", points: [] },
      { id: "c", name: "c", typeId: "BatA", tier: "Gone", points: [] },
      { id: "d", name: "d", typeId: null, tier: "Strong", points: [] },
      { id: "e", name: "e", typeId: "Save", tier: "S", points: [] },
      { id: "f", name: "f", typeId: "Gone", points: [] },
    ],
  };
  const out = UE.buildExportDoc(doc, [], STRUCTURE_TYPES, DEFAULTS);
  const fields = (s) => Object.fromEntries(["typeId", "pendingTypeId", "tier", "typeGroup"].filter((k) => k in s).map((k) => [k, s[k]]));
  assert.deepEqual(out.stamps.map(fields), [{ typeId: "Box", tier: "L" }, { pendingTypeId: "Box" }, { pendingTypeId: "BatA" }, {}, { typeId: "Save" }, {}]);
  assert.deepEqual(out.stampCategories.types.map((t) => `${t.id}:${t.importMethod}`), [
    "Save:auto", "Box:auto", "BatA:auto", "Mech:manual", "BatB:manual", "Coin:manual", "BatC:manual", "Lost:manual",
  ]);
  assert.deepEqual(out.stampCategories.types.map(({ importMethod, ...t }) => t), CATEGORIES.types, "otherwise the categories go as they are");
  assert.equal(doc.stamps[1].pendingTypeId, undefined, "the editor document is untouched");
  assert.equal(doc.stampCategories.types[0].importMethod, undefined);

  const back = UE.migrateTypeData(JSON.parse(JSON.stringify(out)), VOCABULARY);
  assert.deepEqual(back.stampCategories, CATEGORIES, "importMethod is dropped on load");
  const bv = UE.vocabOf(back, STRUCTURE_TYPES, DEFAULTS);
  assert.deepEqual(back.stamps.map((s) => UE.statusLabelOf(s, "stamp", bv)), ["", "Box（未选Size）", "A（未选Strength）", "未分类", "", "未分类"]);
  assert.deepEqual(back.stamps.map(fields).slice(0, 3), [{ typeId: "Box", tier: "L" }, { typeId: "Box" }, { typeId: "BatA" }]);
  const again = UE.buildExportDoc(back, [], STRUCTURE_TYPES, DEFAULTS);
  assert.deepEqual(again.stamps.map(fields), out.stamps.map(fields), "exporting the loaded file gives the same stamps");
  assert.deepEqual(again.stampCategories, out.stampCategories);
});

test("migrateTypeData runs categories -> old ids -> anchors, and a pendingTypeId never overrides a typeId", () => {
  const out = UE.migrateTypeData({
    stamps: [
      { id: "a", name: "a", typeId: "OldBatWeak", anchor: "SnapToGround", points: [] },
      { id: "b", name: "b", typeId: "Save", pendingTypeId: "Box", points: [] },
    ],
  }, VOCABULARY);
  assert.deepEqual(out.stampCategories, CATEGORIES);
  assert.deepEqual([out.stamps[0].typeId, out.stamps[0].tier, out.stamps[0].anchor], ["BatA", "Weak", "FloatInAir"], "anchor from the migrated, locked type");
  assert.deepEqual([out.stamps[1].typeId, "pendingTypeId" in out.stamps[1]], ["Save", false]);
});

test("migrateTypeData on a document with old categories: tiers picked from a group's tier stay on every type", () => {
  const out = UE.migrateTypeData({
    stampCategories: OLD_SHAPE(),
    stamps: [
      { id: "a", name: "a", typeId: "Melee", tier: "Elite", points: [] },
      { id: "b", name: "b", typeId: "Flying", tier: "Weak", points: [] },
      { id: "c", name: "c", typeId: "Box", tier: "Small", points: [] },
      { id: "d", name: "d", typeId: null, typeGroup: "Enemy", tier: "Elite", points: [] },
    ],
  }, VOCABULARY);
  const v = UE.vocabOf(out, STRUCTURE_TYPES);
  assert.deepEqual(out.stamps.map((s) => [s.typeId, s.tier, UE.elementStatusOf(s, "stamp", v)]), [
    ["Melee", "Elite", "complete"], ["Flying", "Weak", "complete"], ["Box", "Small", "complete"], [null, undefined, "unclassified"],
  ]);
});
