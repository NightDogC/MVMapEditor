"use strict";
// Editing a document's stamp categories (mvmap-ue.js): every edit returns a new document and repairs the stamps that
// used what changed. Asserts on the resulting categories, stamps, their status and the red label.
const test = require("node:test");
const assert = require("node:assert/strict");
const UE = require("../mvmap-ue.js");

const CATEGORIES = () => ({
  groups: [
    { id: "Bat", label: "Bat", tier: { label: "Strength", values: [{ id: "Weak", label: "weak" }, { id: "Strong", label: "strong" }] } },
    { id: "Slime", label: "Slime", tier: { label: "Colour", values: [{ id: "Red", label: "red" }, { id: "Weak", label: "weak" }] } },
    { id: "Empty", label: "Empty" },
  ],
  types: [
    { id: "Save", label: "Save", generate: "auto", color: "#222222", emoji: "S" },
    { id: "Box", label: "Box", generate: "auto", color: "#333333", emoji: "B", tier: { label: "Size", values: [{ id: "S", label: "s" }, { id: "L", label: "l" }] } },
    { id: "BatA", label: "A", group: "Bat", generate: "auto", color: "#666666", emoji: "a", anchor: "FloatInAir", anchorLocked: true },
    { id: "BatB", label: "B", group: "Bat", generate: "manual", color: "#777777", emoji: "b" },
    { id: "SlimeA", label: "A", group: "Slime", generate: "auto", color: "#888888", emoji: "s" },
  ],
});
const stamp = (id, fields) => ({ id, name: id, color: "#000000", emoji: "?", notes: "", points: [], anchor: "SnapToGround", ...fields });
const DOC = () => ({
  stampCategories: CATEGORIES(),
  stamps: [
    stamp("box", { typeId: "Box", tier: "L", name: "Box·l" }),
    stamp("batA", { typeId: "BatA", tier: "Weak", anchor: "FloatInAir" }),
    stamp("batB", { typeId: "BatB", tier: "Strong" }),
    stamp("batOnly", { typeId: null, typeGroup: "Bat", tier: "Strong" }),
    stamp("save", { typeId: "Save" }),
    stamp("ghost", { typeId: "Gone", tier: "Weak" }), // already unknown before any edit
  ],
});
const byId = (doc, id) => doc.stamps.find((s) => s.id === id);
const status = (doc, id) => {
  const v = UE.vocabOf(doc, []);
  const st = byId(doc, id);
  return [UE.elementStatusOf(st, "stamp", v), UE.statusLabelOf(st, "stamp", v)];
};
const pick = (st) => ({ typeId: st.typeId, typeGroup: st.typeGroup, tier: st.tier });

test("every edit returns a new document and leaves the input as it was", () => {
  const doc = DOC();
  const before = JSON.stringify(doc);
  const out = UE.removeStampGroup(doc, "Bat");
  assert.notEqual(out, doc);
  assert.equal(JSON.stringify(doc), before);
});

test("usedCategoryIds: every group, type and tier value id, plus the stale ids stamps still hold", () => {
  const used = UE.usedCategoryIds(DOC());
  for (const id of ["Bat", "Slime", "Empty", "Save", "Box", "BatA", "BatB", "SlimeA", "Weak", "Strong", "Red", "S", "L"]) assert.ok(used.has(id), id);
  assert.ok(used.has("Gone"), "the ghost stamp's deleted type: a new type with that id would silently take the stamp over");
  const doc = UE.removeTierValue(DOC(), { group: "Bat" }, "Strong");
  assert.ok(!UE.usedCategoryIds(doc).has("Strong"), "repairStamps already cleared it from the stamps that had it");
  assert.equal(UE.usedCategoryIds({}).size, 0);
});

test("stampTierOwner: the group, or the group-less type, a tier hangs on", () => {
  const doc = DOC();
  assert.equal(UE.stampTierOwner(doc, { group: "Bat" }).id, "Bat");
  assert.equal(UE.stampTierOwner(doc, { type: "Box" }).id, "Box");
  assert.equal(UE.stampTierOwner(doc, { type: "BatA" }), null, "a type inside a group has no tier of its own");
  assert.equal(UE.stampTierOwner(doc, { group: "Nope" }), null);
});

test("addStampGroup / addStampType: added last; a new type is manual; an id in use changes nothing", () => {
  let doc = UE.addStampGroup(DOC(), "G1", "Ghost");
  assert.deepEqual(doc.stampCategories.groups.at(-1), { id: "G1", label: "Ghost" });
  doc = UE.addStampType(doc, "T1", { label: "Wisp", emoji: "w", color: "#123456", anchor: "FloatInAir", anchorLocked: true, group: "G1" });
  assert.deepEqual(doc.stampCategories.types.at(-1), {
    id: "T1", label: "Wisp", generate: "manual", color: "#123456", emoji: "w", group: "G1", anchor: "FloatInAir", anchorLocked: true,
  });
  doc = UE.addStampType(doc, "T2", { label: "Lost", emoji: "l", color: "#000000", group: "Nope" });
  assert.equal(doc.stampCategories.types.at(-1).group, undefined, "an unknown group is left out");
  assert.deepEqual(UE.addStampType(doc, "Save", { label: "dup" }).stampCategories, doc.stampCategories);
  assert.deepEqual(UE.addStampGroup(doc, "Bat", "dup").stampCategories, doc.stampCategories);
});

test("addTierValue: added last to the owner's tier; a type inside a group has no tier of its own", () => {
  let doc = UE.addTierValue(DOC(), { group: "Bat" }, "Boss", "boss");
  assert.deepEqual(doc.stampCategories.groups[0].tier.values.map((v) => v.id), ["Weak", "Strong", "Boss"]);
  doc = UE.addTierValue(doc, { type: "Box" }, "M", "m");
  assert.deepEqual(doc.stampCategories.types[1].tier.values.map((v) => v.id), ["S", "L", "M"]);
  assert.deepEqual(UE.addTierValue(doc, { type: "BatA" }, "X", "x").stampCategories, doc.stampCategories);
  assert.deepEqual(UE.addTierValue(doc, { group: "Bat" }, "Weak", "dup").stampCategories, doc.stampCategories);
});

test("renames change only the label: every stamp keeps its ids, status and name", () => {
  const doc = DOC();
  let out = UE.updateStampGroup(doc, "Bat", { label: "Bats" });
  out = UE.updateStampType(out, "Box", { label: "Crate" });
  out = UE.setStampTier(out, { group: "Bat" }, "Power");
  out = UE.renameTierValue(out, { group: "Bat" }, "Strong", "mighty");
  assert.deepEqual(out.stamps, doc.stamps);
  assert.equal(out.stampCategories.groups[0].label, "Bats");
  assert.equal(out.stampCategories.groups[0].tier.label, "Power");
  assert.deepEqual(out.stampCategories.groups[0].tier.values[1], { id: "Strong", label: "mighty" });
  assert.equal(out.stampCategories.types[1].label, "Crate");
  assert.deepEqual(status(out, "batOnly"), ["incomplete", "Bats（未选小类）"], "the red label follows the new names");
  assert.deepEqual(status(out, "box"), ["complete", ""]);
});

test("updateStampType: emoji and colour don't reach placed stamps; id, group, tier and generate aren't editable", () => {
  const doc = DOC();
  const out = UE.updateStampType(doc, "Box", { emoji: "X", color: "#ffffff", id: "Other", group: "Bat", generate: "manual", tier: null });
  assert.deepEqual(out.stamps, doc.stamps);
  assert.deepEqual(out.stampCategories.types[1], { ...CATEGORIES().types[1], emoji: "X", color: "#ffffff" });
});

test("updateStampType: a locked anchor reaches its stamps; unlocking keeps the anchor they have", () => {
  let out = UE.updateStampType(DOC(), "BatA", { anchor: "SnapToGround" });
  assert.equal(byId(out, "batA").anchor, "SnapToGround");
  out = UE.updateStampType(out, "BatA", { anchorLocked: false });
  assert.equal(out.stampCategories.types[2].anchorLocked, undefined);
  assert.equal(byId(out, "batA").anchor, "SnapToGround");
  out = UE.updateStampType(out, "Save", { anchor: "FloatInAir", anchorLocked: true });
  assert.equal(byId(out, "save").anchor, "FloatInAir");
});

test("removeStampType: its stamps keep the group and its tier value (未选小类); without a group they become 未分类", () => {
  let out = UE.removeStampType(DOC(), "BatA");
  assert.deepEqual(out.stampCategories.types.map((t) => t.id), ["Save", "Box", "BatB", "SlimeA"]);
  assert.deepEqual(pick(byId(out, "batA")), { typeId: null, typeGroup: "Bat", tier: "Weak" });
  assert.deepEqual(status(out, "batA"), ["incomplete", "Bat（未选小类）"]);
  assert.equal(byId(out, "batA").anchor, "SnapToGround", "the locked type's anchor goes with it");

  out = UE.removeStampType(out, "Box");
  assert.deepEqual(pick(byId(out, "box")), { typeId: null, typeGroup: undefined, tier: undefined });
  assert.deepEqual(status(out, "box"), ["unclassified", "未分类"]);
  assert.equal(byId(out, "box").name, "Box·l", "the name stays");
  assert.deepEqual(pick(byId(out, "ghost")), { typeId: "Gone", typeGroup: undefined, tier: "Weak" }, "an id unknown before stays");
});

test("removeStampGroup: its types go too; their stamps and the group-only ones become 未分类", () => {
  const out = UE.removeStampGroup(DOC(), "Bat");
  assert.deepEqual(out.stampCategories.groups.map((g) => g.id), ["Slime", "Empty"]);
  assert.deepEqual(out.stampCategories.types.map((t) => t.id), ["Save", "Box", "SlimeA"]);
  for (const id of ["batA", "batB", "batOnly"]) {
    assert.deepEqual(pick(byId(out, id)), { typeId: null, typeGroup: undefined, tier: undefined }, id);
    assert.deepEqual(status(out, id), ["unclassified", "未分类"], id);
  }
  assert.equal(byId(out, "batA").anchor, "SnapToGround");
  assert.deepEqual(pick(byId(out, "box")), { typeId: "Box", typeGroup: undefined, tier: "L" }, "other stamps are untouched");
});

test("removeTierValue: the stamps that had it become 未选<tier>; others keep theirs", () => {
  const out = UE.removeTierValue(DOC(), { group: "Bat" }, "Strong");
  assert.deepEqual(out.stampCategories.groups[0].tier.values.map((v) => v.id), ["Weak"]);
  assert.equal(byId(out, "batB").tier, undefined);
  assert.deepEqual(status(out, "batB"), ["incomplete", "Bat·B（未选Strength）"]);
  assert.deepEqual(status(out, "batOnly"), ["incomplete", "Bat（未选小类、Strength）"]);
  assert.equal(byId(out, "batA").tier, "Weak");
  assert.equal(byId(out, "ghost").tier, "Weak", "a stamp whose type was already unknown keeps its tier id");
});

test("setStampTier on an owner without one: a tier with no values, its stamps become 未选<tier>", () => {
  const out = UE.setStampTier(DOC(), { type: "Save" }, "Level");
  assert.deepEqual(out.stampCategories.types[0].tier, { label: "Level", values: [] });
  assert.deepEqual(status(out, "save"), ["incomplete", "Save（未选Level）"]);
  assert.deepEqual(UE.setStampTier(DOC(), { type: "BatA" }, "x").stampCategories, CATEGORIES(), "a type in a group has no own tier");
});

test("removeStampTier: the owner's stamps lose their value and are complete again", () => {
  const out = UE.removeStampTier(DOC(), { type: "Box" });
  assert.equal(out.stampCategories.types[1].tier, undefined);
  assert.equal(byId(out, "box").tier, undefined);
  assert.deepEqual(status(out, "box"), ["complete", ""]);
});

test("moveStampType: a tier value the new group doesn't have goes (未选<tier>); one it has stays", () => {
  const doc = DOC();
  doc.stamps.push(stamp("batA2", { typeId: "BatA", tier: "Strong", anchor: "FloatInAir" }));
  const out = UE.moveStampType(doc, "BatA", "Slime");
  assert.equal(out.stampCategories.types.at(-1).id, "BatA", "placed last, so it is last in its new group's Subtype list");
  assert.equal(out.stampCategories.types.at(-1).group, "Slime");
  assert.deepEqual(pick(byId(out, "batA")), { typeId: "BatA", typeGroup: undefined, tier: "Weak" }, "Slime has a value Weak too");
  assert.deepEqual(pick(byId(out, "batA2")), { typeId: "BatA", typeGroup: undefined, tier: undefined });
  assert.deepEqual(status(out, "batA2"), ["incomplete", "Slime·A（未选Colour）"]);
});

test("moveStampType out of a group: the type has no tier, its stamps drop the value and are complete", () => {
  const out = UE.moveStampType(DOC(), "BatB", "");
  assert.equal(out.stampCategories.types.at(-1).group, undefined);
  assert.deepEqual(pick(byId(out, "batB")), { typeId: "BatB", typeGroup: undefined, tier: undefined });
  assert.deepEqual(status(out, "batB"), ["complete", ""]);
});

test("moveStampType into a group drops the type's own tier and its values on stamps", () => {
  const out = UE.moveStampType(DOC(), "Box", "Empty");
  assert.equal(out.stampCategories.types.at(-1).tier, undefined);
  assert.equal(byId(out, "box").tier, undefined);
  assert.deepEqual(status(out, "box"), ["complete", ""]);
  assert.deepEqual(UE.moveStampType(DOC(), "BatA", "Bat"), DOC(), "its own group changes nothing");
  assert.deepEqual(UE.moveStampType(DOC(), "BatA", "Nope"), DOC(), "an unknown group changes nothing");
});

test("countStampsUsing: stamps of a group, a type, a tier and a tier value", () => {
  const doc = DOC();
  assert.equal(UE.countStampsUsing(doc, { group: "Bat" }), 3, "batA, batB and the group-only batOnly");
  assert.equal(UE.countStampsUsing(doc, { group: "Empty" }), 0);
  assert.equal(UE.countStampsUsing(doc, { type: "BatA" }), 1);
  assert.equal(UE.countStampsUsing(doc, { group: "Bat", tier: true }), 3);
  assert.equal(UE.countStampsUsing(doc, { group: "Bat", value: "Strong" }), 2, "batB and batOnly");
  assert.equal(UE.countStampsUsing(doc, { group: "Slime", value: "Weak" }), 0, "same value id in another tier doesn't count");
  assert.equal(UE.countStampsUsing(doc, { type: "Box", value: "L" }), 1);
  // the count is exactly how many stamps the delete changes
  for (const [ref, edit] of [
    [{ group: "Bat" }, (d) => UE.removeStampGroup(d, "Bat")],
    [{ type: "Box" }, (d) => UE.removeStampType(d, "Box")],
    [{ group: "Bat", value: "Strong" }, (d) => UE.removeTierValue(d, { group: "Bat" }, "Strong")],
    [{ group: "Bat", tier: true }, (d) => UE.removeStampTier(d, { group: "Bat" })],
  ]) {
    const out = edit(doc);
    const changed = doc.stamps.filter((s, i) => JSON.stringify(pick(s)) !== JSON.stringify(pick(out.stamps[i]))).length;
    assert.equal(UE.countStampsUsing(doc, ref), changed, JSON.stringify(ref));
  }
});

test("an edited document still exports and loads back: incomplete stamps keep what is left", () => {
  const out = UE.removeStampType(DOC(), "BatB");
  const exported = UE.buildExportDoc(out, [], []);
  const st = exported.stamps.find((s) => s.id === "batB");
  assert.equal(st.typeId, undefined);
  assert.equal(st.typeGroup, "Bat");
  assert.equal(st.tier, "Strong");
  const back = UE.migrateTypeData(exported, { types: [], defaultStampCategories: CATEGORIES(), oldStampIds: [] });
  assert.deepEqual(back.stampCategories.types.map((t) => t.id), ["Save", "Box", "BatA", "SlimeA"], "the file's categories, not the defaults");
  assert.deepEqual(status(back, "batB"), ["incomplete", "Bat（未选小类）"]);
});

// Ids of the default categories (mvmap-types.js defaultStampCategories) are locked: the UE side is configured for them.
const DEFAULTS = {
  groups: [{ id: "Bat", label: "Bat", tier: { label: "Strength", values: [{ id: "Weak", label: "weak" }] } }],
  types: [
    { id: "Save", label: "Save" },
    { id: "Box", label: "Box", tier: { label: "Size", values: [{ id: "S", label: "s" }] } },
    { id: "BatA", label: "A", group: "Bat" },
  ],
};

test("isCategoryIdLocked: ids of the default categories, at the same place", () => {
  const locked = (ref) => UE.isCategoryIdLocked(ref, DEFAULTS);
  for (const ref of [{ type: "Save" }, { type: "BatA" }, { group: "Bat" }, { group: "Bat", value: "Weak" }, { type: "Box", value: "S" }]) {
    assert.ok(locked(ref), JSON.stringify(ref));
  }
  assert.ok(!locked({ type: "BatB" }) && !locked({ group: "Slime" }), "entries a designer added");
  assert.ok(!locked({ group: "Bat", value: "Strong" }) && !locked({ type: "Box", value: "L" }), "a value added to a default tier");
  assert.ok(!locked({ group: "Slime", value: "Weak" }), "the same id in another tier");
});

test("categoryIdProblem: locked, format, taken (in the same list, or a stale id a stamp holds there); unchanged is fine", () => {
  const doc = DOC();
  doc.stamps.push(stamp("slimeStale", { typeId: "SlimeA", tier: "Blue" })); // a value no longer in Slime's tier
  const problem = (ref, id) => UE.categoryIdProblem(doc, ref, id, DEFAULTS);
  assert.equal(problem({ type: "BatB" }, "BatBee"), null);
  assert.equal(problem({ type: "BatB" }, "BatB"), null, "unchanged");
  assert.equal(problem({ type: "Nope" }, "X"), "missing");
  assert.equal(problem({ type: "Save" }, "SavePoint"), "locked");
  assert.equal(problem({ group: "Bat", value: "Weak" }, "Feeble"), "locked");
  for (const bad of ["1Bat", "Bat-B", "蝙蝠", "_Bat", "Bat B", ""]) assert.equal(problem({ type: "BatB" }, bad), "format", bad);
  assert.equal(problem({ type: "BatB" }, "Box"), "taken");
  assert.equal(problem({ type: "BatB" }, "Gone"), "taken", "the ghost stamp still holds typeId Gone");
  assert.equal(problem({ type: "BatB" }, "Slime"), null, "a group's id: groups and types are separate lists");
  assert.equal(problem({ group: "Slime" }, "Bat"), "taken");
  assert.equal(problem({ group: "Bat", value: "Strong" }, "Weak"), "taken");
  assert.equal(problem({ group: "Slime", value: "Red" }, "Strong"), null, "another tier's value");
  assert.equal(problem({ group: "Slime", value: "Red" }, "Blue"), "taken", "a Slime stamp still holds Blue");
  assert.equal(problem({ type: "Box", value: "L" }, "Blue"), null, "Blue is stale only in Slime's tier");
});

test("renameCategoryId: a type's stamps follow it", () => {
  const out = UE.renameCategoryId(DOC(), { type: "BatB" }, "BatBee", DEFAULTS);
  assert.deepEqual(out.stampCategories.types.find((t) => t.id === "BatBee")?.group, "Bat");
  assert.equal(byId(out, "batB").typeId, "BatBee");
  assert.deepEqual(status(out, "batB"), ["complete", ""]);
});

test("renameCategoryId: a group's types and its group-only stamps follow it", () => {
  const doc = DOC();
  doc.stamps.push(stamp("slimeOnly", { typeId: null, typeGroup: "Slime" }));
  const out = UE.renameCategoryId(doc, { group: "Slime" }, "Ooze", DEFAULTS);
  assert.equal(out.stampCategories.types.find((t) => t.id === "SlimeA").group, "Ooze");
  assert.equal(byId(out, "slimeOnly").typeGroup, "Ooze");
  assert.deepEqual(status(out, "slimeOnly"), status(doc, "slimeOnly"));
});

test("renameCategoryId: a tier value changes on the stamps of that tier only", () => {
  const doc = DOC();
  doc.stamps.push(stamp("slimeWeak", { typeId: "SlimeA", tier: "Weak" }));
  const out = UE.renameCategoryId(doc, { group: "Slime", value: "Weak" }, "Feeble", DEFAULTS);
  assert.deepEqual(out.stampCategories.groups.find((g) => g.id === "Slime").tier.values.map((v) => v.id), ["Red", "Feeble"]);
  assert.equal(byId(out, "slimeWeak").tier, "Feeble");
  assert.equal(byId(out, "batA").tier, "Weak", "Bat's Weak is another value");
  assert.equal(byId(out, "ghost").tier, "Weak", "a stamp without a known type picks from no tier");
  assert.deepEqual(status(out, "slimeWeak"), ["complete", ""]);
  const bat = UE.renameCategoryId(DOC(), { group: "Bat", value: "Strong" }, "Mighty", DEFAULTS);
  assert.deepEqual([byId(bat, "batB").tier, byId(bat, "batOnly").tier], ["Mighty", "Mighty"]);
});

test("renameCategoryId changes nothing when categoryIdProblem objects, and leaves the input as it was", () => {
  const doc = DOC();
  const before = JSON.stringify(doc);
  assert.deepEqual(UE.renameCategoryId(doc, { type: "BatB" }, "Box", DEFAULTS), doc);
  assert.deepEqual(UE.renameCategoryId(doc, { type: "Save" }, "SavePoint", DEFAULTS), doc);
  UE.renameCategoryId(doc, { type: "BatB" }, "BatBee", DEFAULTS);
  assert.equal(JSON.stringify(doc), before);
});
