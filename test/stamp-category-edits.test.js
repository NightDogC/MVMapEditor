"use strict";
// Editing a document's stamp categories (mvmap-ue.js): every edit returns a new document and repairs the stamps that
// used what changed. Submenu edits only arrange the Type dropdown and never change a stamp; tiers belong to one type.
// Asserts on the resulting categories, stamps, their status and the red label.
const test = require("node:test");
const assert = require("node:assert/strict");
const UE = require("../mvmap-ue.js");

const STRENGTH = () => [{ id: "Weak", label: "weak" }, { id: "Strong", label: "strong" }];
const CATEGORIES = () => ({
  submenus: [
    { id: "Bat", label: "Bat" },
    { id: "Slime", label: "Slime" },
    { id: "Empty", label: "Empty" },
  ],
  types: [
    { id: "Save", label: "Save", color: "#222222", emoji: "S" },
    { id: "Box", label: "Box", color: "#333333", emoji: "B", tierLabel: "Size", tiers: [{ id: "S", label: "s" }, { id: "L", label: "l" }] },
    { id: "BatA", label: "A", submenu: "Bat", color: "#666666", emoji: "a", anchor: "FloatInAir", anchorLocked: true, tierLabel: "Strength", tiers: STRENGTH() },
    { id: "BatB", label: "B", submenu: "Bat", color: "#777777", emoji: "b", tierLabel: "Strength", tiers: STRENGTH() },
    { id: "SlimeA", label: "A", submenu: "Slime", color: "#888888", emoji: "s", tierLabel: "Colour", tiers: [{ id: "Red", label: "red" }, { id: "Weak", label: "weak" }] },
  ],
});
const stamp = (id, fields) => ({ id, name: id, color: "#000000", emoji: "?", notes: "", points: [], anchor: "SnapToGround", ...fields });
const DOC = () => ({
  stampCategories: CATEGORIES(),
  stamps: [
    stamp("box", { typeId: "Box", tier: "L", name: "Box·l" }),
    stamp("batA", { typeId: "BatA", tier: "Weak", anchor: "FloatInAir" }),
    stamp("batB", { typeId: "BatB", tier: "Strong" }),
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
const pick = (st) => ({ typeId: st.typeId, tier: st.tier });
const typeIn = (doc, id) => doc.stampCategories.types.find((t) => t.id === id);

test("every edit returns a new document and leaves the input as it was", () => {
  const doc = DOC();
  const before = JSON.stringify(doc);
  const out = UE.removeStampType(UE.removeStampSubmenu(doc, "Bat"), "Box");
  assert.notEqual(out, doc);
  assert.equal(JSON.stringify(doc), before);
});

test("usedCategoryIds: every submenu, type and tier id, plus the stale ids stamps still hold", () => {
  const used = UE.usedCategoryIds(DOC());
  for (const id of ["Bat", "Slime", "Empty", "Save", "Box", "BatA", "BatB", "SlimeA", "Weak", "Strong", "Red", "S", "L"]) assert.ok(used.has(id), id);
  assert.ok(used.has("Gone"), "the ghost stamp's deleted type: a new type with that id would silently take the stamp over");
  const doc = UE.removeStampTier(UE.removeStampTier(DOC(), "BatA", "Strong"), "BatB", "Strong");
  assert.ok(!UE.usedCategoryIds(doc).has("Strong"), "repairStamps already cleared it from the stamps that had it");
  assert.equal(UE.usedCategoryIds({}).size, 0);
});

test("addStampSubmenu / addStampType: added last; a new type has no tiers and no import method; an id in use changes nothing", () => {
  let doc = UE.addStampSubmenu(DOC(), "G1", "Ghost");
  assert.deepEqual(doc.stampCategories.submenus.at(-1), { id: "G1", label: "Ghost" });
  doc = UE.addStampType(doc, "T1", { label: "Wisp", emoji: "w", color: "#123456", anchor: "FloatInAir", anchorLocked: true, submenu: "G1" });
  assert.deepEqual(doc.stampCategories.types.at(-1), { id: "T1", label: "Wisp", color: "#123456", emoji: "w", submenu: "G1", anchor: "FloatInAir", anchorLocked: true });
  assert.equal(UE.importMethodOf("T1", "stamp", UE.vocabOf(doc, [], { submenus: [], types: [] })), "manual");
  doc = UE.addStampType(doc, "T2", { label: "Lost", emoji: "l", color: "#000000", submenu: "Nope" });
  assert.equal(doc.stampCategories.types.at(-1).submenu, undefined, "an unknown submenu is left out");
  assert.deepEqual(UE.addStampType(doc, "Save", { label: "dup" }).stampCategories, doc.stampCategories);
  assert.deepEqual(UE.addStampSubmenu(doc, "Bat", "dup").stampCategories, doc.stampCategories);
});

test("updateStampSubmenu renames it; the incomplete label doesn't show submenus, the auto name of a new stamp does", () => {
  const out = UE.updateStampSubmenu(DOC(), "Bat", { label: "Bats" });
  assert.equal(out.stampCategories.submenus[0].label, "Bats");
  assert.deepEqual(out.stamps, DOC().stamps);
  const v = UE.vocabOf(out, []);
  assert.equal(UE.chooseType({ name: "Stamp 1", typeId: null }, "stamp", "BatB", v).name, "Bats·B");
});

test("moveStampType into, between and out of submenus changes only its submenu: tiers, order and stamps stay", () => {
  const doc = DOC();
  let out = UE.moveStampType(doc, "Box", "Empty");
  assert.deepEqual(typeIn(out, "Box"), { ...CATEGORIES().types[1], submenu: "Empty" });
  assert.deepEqual(out.stampCategories.types.map((t) => t.id), CATEGORIES().types.map((t) => t.id), "its place in the list stays");
  out = UE.moveStampType(out, "BatA", "Slime");
  out = UE.moveStampType(out, "BatB", "");
  assert.equal(typeIn(out, "BatA").submenu, "Slime");
  assert.ok(!("submenu" in typeIn(out, "BatB")));
  assert.deepEqual(typeIn(out, "BatA").tiers, STRENGTH(), "keeps its own tiers in another submenu");
  assert.deepEqual(out.stamps, doc.stamps, "no stamp changes");
  for (const id of ["box", "batA", "batB"]) assert.deepEqual(status(out, id), ["complete", ""], id);
  assert.deepEqual(UE.moveStampType(DOC(), "BatA", "Nope"), DOC(), "an unknown submenu changes nothing");
  assert.deepEqual(UE.moveStampType(DOC(), "BatA", "Bat"), DOC(), "its own submenu changes nothing");
});

test("removeStampSubmenu: its types stay, outside any submenu; no stamp changes", () => {
  const doc = DOC();
  const out = UE.removeStampSubmenu(doc, "Bat");
  assert.deepEqual(out.stampCategories.submenus.map((s) => s.id), ["Slime", "Empty"]);
  assert.deepEqual(out.stampCategories.types.map((t) => t.id), ["Save", "Box", "BatA", "BatB", "SlimeA"]);
  assert.ok(!("submenu" in typeIn(out, "BatA")) && !("submenu" in typeIn(out, "BatB")));
  assert.equal(typeIn(out, "SlimeA").submenu, "Slime");
  assert.deepEqual(out.stamps, doc.stamps);
  assert.deepEqual(UE.typePickerSections(UE.vocabOf(out, []), "stamp").map((s) => s.submenu && s.submenu.id), [null, "Slime"]);
});

test("renames change only the label: every stamp keeps its ids, status and name", () => {
  const doc = DOC();
  let out = UE.updateStampType(doc, "Box", { label: "Crate" });
  out = UE.setStampTierLabel(out, "BatA", "Power");
  out = UE.renameStampTier(out, "BatA", "Strong", "mighty");
  assert.deepEqual(out.stamps, doc.stamps);
  assert.equal(typeIn(out, "Box").label, "Crate");
  assert.equal(typeIn(out, "BatA").tierLabel, "Power");
  assert.deepEqual(typeIn(out, "BatA").tiers[1], { id: "Strong", label: "mighty" });
  assert.deepEqual(typeIn(out, "BatB").tiers[1], { id: "Strong", label: "strong" }, "another type's tiers are its own");
  const lost = UE.removeStampTier(out, "Box", "L");
  assert.deepEqual(status(lost, "box"), ["incomplete", "Crate（未选Size）"], "the red label follows the new names");
});

test("updateStampType: emoji and colour don't reach placed stamps; id, submenu, tiers and importMethod aren't editable", () => {
  const doc = DOC();
  const out = UE.updateStampType(doc, "Box", { emoji: "X", color: "#ffffff", id: "Other", submenu: "Bat", importMethod: "auto", tiers: [], tierLabel: "x" });
  assert.deepEqual(out.stamps, doc.stamps);
  assert.deepEqual(typeIn(out, "Box"), { ...CATEGORIES().types[1], emoji: "X", color: "#ffffff" });
});

test("updateStampType: a locked anchor reaches its stamps; unlocking keeps the anchor they have", () => {
  let out = UE.updateStampType(DOC(), "BatA", { anchor: "SnapToGround" });
  assert.equal(byId(out, "batA").anchor, "SnapToGround");
  out = UE.updateStampType(out, "BatA", { anchorLocked: false });
  assert.equal(typeIn(out, "BatA").anchorLocked, undefined);
  assert.equal(byId(out, "batA").anchor, "SnapToGround");
  out = UE.updateStampType(out, "Save", { anchor: "FloatInAir", anchorLocked: true });
  assert.equal(byId(out, "save").anchor, "FloatInAir");
});

test("removeStampType: its stamps become 未分类, names kept, a locked anchor reset", () => {
  let out = UE.removeStampType(DOC(), "BatA");
  assert.deepEqual(out.stampCategories.types.map((t) => t.id), ["Save", "Box", "BatB", "SlimeA"]);
  assert.deepEqual(pick(byId(out, "batA")), { typeId: null, tier: undefined });
  assert.deepEqual(status(out, "batA"), ["unclassified", "未分类"]);
  assert.equal(byId(out, "batA").anchor, "SnapToGround", "the locked type's anchor goes with it");
  out = UE.removeStampType(out, "Box");
  assert.deepEqual(pick(byId(out, "box")), { typeId: null, tier: undefined });
  assert.equal(byId(out, "box").name, "Box·l", "the name stays");
  assert.deepEqual(pick(byId(out, "ghost")), { typeId: "Gone", tier: "Weak" }, "an id unknown before stays");
});

test("addStampTier: added last to that type only; a type without tiers, or an id it has, changes nothing", () => {
  let doc = UE.addStampTier(DOC(), "BatA", "Boss", "boss");
  assert.deepEqual(typeIn(doc, "BatA").tiers.map((v) => v.id), ["Weak", "Strong", "Boss"]);
  assert.deepEqual(typeIn(doc, "BatB").tiers.map((v) => v.id), ["Weak", "Strong"], "the other type in the submenu is untouched");
  assert.deepEqual(UE.addStampTier(doc, "Save", "X", "x").stampCategories, doc.stampCategories);
  assert.deepEqual(UE.addStampTier(doc, "BatA", "Weak", "dup").stampCategories, doc.stampCategories);
  doc = UE.addStampTier(doc, "BatB", "Boss", "boss");
  const v = UE.vocabOf(doc, []);
  assert.equal(UE.chooseType(UE.chooseTier({ name: "x", typeId: "BatA" }, "stamp", "Boss", v), "stamp", "BatB", v).tier, "Boss", "kept across types with the same tier label");
});

test("removeStampTier: the stamps that had it become 未选<tier label>; stamps of other types keep the same id", () => {
  const doc = DOC();
  doc.stamps.push(stamp("slimeWeak", { typeId: "SlimeA", tier: "Weak" }));
  const out = UE.removeStampTier(doc, "BatA", "Weak");
  assert.deepEqual(typeIn(out, "BatA").tiers.map((v) => v.id), ["Strong"]);
  assert.equal(byId(out, "batA").tier, undefined);
  assert.deepEqual(status(out, "batA"), ["incomplete", "A（未选Strength）"]);
  assert.equal(byId(out, "slimeWeak").tier, "Weak");
  assert.equal(byId(out, "ghost").tier, "Weak", "a stamp whose type was already unknown keeps its tier id");
});

test("setStampTierLabel on a type without tiers: an empty list of tiers, its stamps become 未选<tier label>", () => {
  const out = UE.setStampTierLabel(DOC(), "Save", "Level");
  assert.deepEqual(typeIn(out, "Save"), { ...CATEGORIES().types[0], tierLabel: "Level", tiers: [] });
  assert.deepEqual(status(out, "save"), ["incomplete", "Save（未选Level）"]);
  assert.deepEqual(UE.setStampTierLabel(DOC(), "Nope", "x").stampCategories, CATEGORIES());
});

test("removeStampTiers: the type has no tier label or tiers; its stamps lose their tier and are complete again", () => {
  const out = UE.removeStampTiers(DOC(), "Box");
  assert.deepEqual(typeIn(out, "Box"), { id: "Box", label: "Box", color: "#333333", emoji: "B" });
  assert.equal(byId(out, "box").tier, undefined);
  assert.deepEqual(status(out, "box"), ["complete", ""]);
});

test("countStampsUsing: stamps of a type, with any of its tiers, and with one tier", () => {
  const doc = DOC();
  doc.stamps.push(stamp("batA2", { typeId: "BatA" }), stamp("slimeWeak", { typeId: "SlimeA", tier: "Weak" }));
  assert.equal(UE.countStampsUsing(doc, { type: "BatA" }), 2);
  assert.equal(UE.countStampsUsing(doc, { type: "BatA", tiers: true }), 1, "batA2 has no tier");
  assert.equal(UE.countStampsUsing(doc, { type: "BatA", tier: "Weak" }), 1, "the same id on SlimeA doesn't count");
  assert.equal(UE.countStampsUsing(doc, { type: "Nope" }), 0);
  // the count is exactly how many stamps the delete changes
  for (const [ref, edit] of [
    [{ type: "Box" }, (d) => UE.removeStampType(d, "Box")],
    [{ type: "BatA" }, (d) => UE.removeStampType(d, "BatA")],
    [{ type: "BatA", tier: "Weak" }, (d) => UE.removeStampTier(d, "BatA", "Weak")],
    [{ type: "BatA", tiers: true }, (d) => UE.removeStampTiers(d, "BatA")],
  ]) {
    const out = edit(doc);
    const changed = doc.stamps.filter((s, i) => JSON.stringify(pick(s)) !== JSON.stringify(pick(out.stamps[i]))).length;
    assert.equal(UE.countStampsUsing(doc, ref), changed, JSON.stringify(ref));
  }
});

test("an edited document still exports and loads back: incomplete stamps keep their type", () => {
  const out = UE.removeStampTier(DOC(), "BatB", "Strong");
  const exported = UE.buildExportDoc(out, [], [], CATEGORIES());
  const st = exported.stamps.find((s) => s.id === "batB");
  assert.deepEqual([st.typeId, st.pendingTypeId, st.tier], [undefined, "BatB", undefined]);
  const back = UE.migrateTypeData(exported, { types: [], defaultStampCategories: CATEGORIES(), oldStampIds: [] });
  assert.deepEqual(typeIn(back, "BatB").tiers.map((v) => v.id), ["Weak"], "the file's categories, not the defaults");
  assert.deepEqual(status(back, "batB"), ["incomplete", "B（未选Strength）"]);
});

// Ids of the default categories (mvmap-types.js defaultStampCategories) are locked: the UE side is configured for them.
const DEFAULTS = {
  submenus: [{ id: "Bat", label: "Bat" }],
  types: [
    { id: "Save", label: "Save" },
    { id: "Box", label: "Box", tierLabel: "Size", tiers: [{ id: "S", label: "s" }] },
    { id: "BatA", label: "A", submenu: "Bat", tierLabel: "Strength", tiers: [{ id: "Weak", label: "weak" }] },
  ],
};

test("isCategoryIdLocked: type ids and tier ids of the default categories, a tier under the same type", () => {
  const locked = (ref) => UE.isCategoryIdLocked(ref, DEFAULTS);
  for (const ref of [{ type: "Save" }, { type: "BatA" }, { type: "BatA", tier: "Weak" }, { type: "Box", tier: "S" }]) assert.ok(locked(ref), JSON.stringify(ref));
  assert.ok(!locked({ type: "BatB" }), "a type a designer added");
  assert.ok(!locked({ type: "BatA", tier: "Strong" }) && !locked({ type: "Box", tier: "L" }), "a tier added to a default type");
  assert.ok(!locked({ type: "BatB", tier: "Weak" }), "the same tier id under another type");
});

test("categoryIdProblem: locked, format, taken (in the same list, or a stale id a stamp holds there); unchanged is fine", () => {
  const doc = DOC();
  doc.stamps.push(stamp("slimeStale", { typeId: "SlimeA", tier: "Blue" })); // a tier SlimeA no longer has
  const problem = (ref, id) => UE.categoryIdProblem(doc, ref, id, DEFAULTS);
  assert.equal(problem({ type: "BatB" }, "BatBee"), null);
  assert.equal(problem({ type: "BatB" }, "BatB"), null, "unchanged");
  assert.equal(problem({ type: "Nope" }, "X"), "missing");
  assert.equal(problem({ type: "Save", tier: "X" }, "Y"), "missing", "a type without that tier");
  assert.equal(problem({ type: "Save" }, "SavePoint"), "locked");
  assert.equal(problem({ type: "BatA", tier: "Weak" }, "Feeble"), "locked");
  for (const bad of ["1Bat", "Bat-B", "蝙蝠", "_Bat", "Bat B", ""]) assert.equal(problem({ type: "BatB" }, bad), "format", bad);
  assert.equal(problem({ type: "BatB" }, "Box"), "taken");
  assert.equal(problem({ type: "BatB" }, "Gone"), "taken", "the ghost stamp still holds typeId Gone");
  assert.equal(problem({ type: "BatB" }, "Slime"), null, "a submenu's id: submenus and types are separate lists");
  assert.equal(problem({ type: "BatB", tier: "Strong" }, "Weak"), "taken");
  assert.equal(problem({ type: "SlimeA", tier: "Red" }, "Strong"), null, "another type's tier");
  assert.equal(problem({ type: "SlimeA", tier: "Red" }, "Blue"), "taken", "a SlimeA stamp still holds Blue");
  assert.equal(problem({ type: "Box", tier: "L" }, "Blue"), null, "Blue is stale only on SlimeA");
});

test("renameCategoryId: a type's stamps follow it", () => {
  const out = UE.renameCategoryId(DOC(), { type: "BatB" }, "BatBee", DEFAULTS);
  assert.equal(typeIn(out, "BatBee").submenu, "Bat");
  assert.equal(byId(out, "batB").typeId, "BatBee");
  assert.deepEqual(status(out, "batB"), ["complete", ""]);
});

test("renameCategoryId: a tier changes on the stamps of its type only", () => {
  const doc = DOC();
  doc.stamps.push(stamp("slimeWeak", { typeId: "SlimeA", tier: "Weak" }));
  const out = UE.renameCategoryId(doc, { type: "SlimeA", tier: "Weak" }, "Feeble", DEFAULTS);
  assert.deepEqual(typeIn(out, "SlimeA").tiers.map((v) => v.id), ["Red", "Feeble"]);
  assert.equal(byId(out, "slimeWeak").tier, "Feeble");
  assert.equal(byId(out, "batA").tier, "Weak", "BatA's Weak is another tier");
  assert.equal(byId(out, "ghost").tier, "Weak", "a stamp without a known type");
  assert.deepEqual(status(out, "slimeWeak"), ["complete", ""]);
});

test("renameCategoryId changes nothing when categoryIdProblem objects, and leaves the input as it was", () => {
  const doc = DOC();
  const before = JSON.stringify(doc);
  assert.deepEqual(UE.renameCategoryId(doc, { type: "BatB" }, "Box", DEFAULTS), doc);
  assert.deepEqual(UE.renameCategoryId(doc, { type: "Save" }, "SavePoint", DEFAULTS), doc);
  UE.renameCategoryId(doc, { type: "BatB" }, "BatBee", DEFAULTS);
  assert.equal(JSON.stringify(doc), before);
});
