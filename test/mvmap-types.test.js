"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const TYPES = require("../mvmap-types.js");
const UE = require("../mvmap-ue.js");

test("every region has a unique enum name and letter, and the letter matches its label prefix", () => {
  const regions = TYPES.regions;
  assert.ok(regions.length > 0);
  assert.equal(new Set(regions.map((r) => r.region)).size, regions.length);
  assert.equal(new Set(regions.map((r) => r.letter)).size, regions.length);
  for (const r of regions) {
    assert.match(r.region, /^[A-Za-z]+$/, r.region);
    assert.match(r.letter, /^[A-Z]$/, r.region);
    assert.ok(r.label.startsWith(r.letter + "_"), r.label);
  }
});

const CATS = TYPES.defaultStampCategories;
const V = UE.vocabOf(UE.fillStampCategories({}, CATS), TYPES.types, CATS);
const isLabel = (v) => typeof v === "string" && v.trim() === v && v !== "";

test("every structure / edge type has a unique id, a known layer and import method, a colour and an emoji", () => {
  const types = TYPES.types;
  assert.ok(types.length > 0);
  assert.equal(new Set(types.map((t) => t.id)).size, types.length);
  for (const t of types) {
    assert.match(t.id, /^[A-Z][A-Za-z]*$/, t.id);
    assert.ok(isLabel(t.label), t.id);
    assert.ok(["structure", "edge"].includes(t.layer), `${t.id}: stamp types belong in defaultStampCategories`);
    assert.ok(["auto", "manual"].includes(t.importMethod), t.id);
    assert.equal(t.generate, undefined, `${t.id}: generate is now importMethod`);
    assert.match(t.color, /^#[0-9a-f]{6}$/i, t.id);
    assert.ok(typeof t.emoji === "string" && t.emoji !== "", t.id);
    assert.equal(t.anchor, undefined, t.id);
    assert.equal(t.anchorLocked, undefined, t.id);
  }
});

test("labels, old labels included, are unique within a layer, so a name can only ever match one type", () => {
  for (const layer of ["structure", "edge"]) {
    const labels = TYPES.types.filter((t) => t.layer === layer).flatMap((t) => [t.label, ...(t.oldLabels || [])]);
    assert.equal(new Set(labels).size, labels.length, layer);
  }
  const stampLabels = [...CATS.types.map((t) => t.label), ...TYPES.oldStampIds.filter((o) => o.label).map((o) => o.label)];
  assert.equal(new Set(stampLabels).size, stampLabels.length, "stamp");
});

test("old ids never clash with a current id or another type's old id, so a renamed id migrates to exactly one type", () => {
  const ids = [...TYPES.types.flatMap((t) => [t.id, ...(t.oldIds || [])]), ...CATS.types.map((t) => t.id), ...TYPES.oldStampIds.map((o) => o.id)];
  assert.equal(new Set(ids).size, ids.length);
});

test("the importer's auto types: Landscape, DamageTerrain, JumpOffPlatform, MapConnection, and the phase-four stamps", () => {
  const auto = [
    ...TYPES.types.filter((t) => UE.importMethodOf(t.id, t.layer, V) === "auto").map((t) => `${t.layer}:${t.id}`),
    ...CATS.types.filter((t) => UE.importMethodOf(t.id, "stamp", V) === "auto").map((t) => `stamp:${t.id}`),
  ].sort();
  assert.deepEqual(auto, [
    "edge:DamageEdge", "edge:JumpOffPlatform", "edge:MapConnection",
    "stamp:FlyingEnemy", "stamp:MeleeEnemy", "stamp:MoneyBox", "stamp:RangedEnemy", "stamp:SavePoint", "stamp:YinYangStatue",
    "structure:DamageTerrain", "structure:Landscape",
  ]);
});

test("default stamp categories: readable unique ids, labels, colours, emoji, an import method; submenus exist; tiers have a tier label and unique ids", () => {
  const ids = (list) => list.map((x) => x.id);
  assert.equal(new Set(ids(CATS.submenus)).size, CATS.submenus.length);
  assert.equal(new Set(ids(CATS.types)).size, CATS.types.length);
  for (const s of CATS.submenus) {
    assert.match(s.id, /^[A-Z][A-Za-z]*$/, s.id);
    assert.ok(isLabel(s.label), s.id);
    assert.deepEqual(Object.keys(s).sort(), ["id", "label"], `${s.id}: a submenu has no tiers`);
  }
  for (const t of CATS.types) {
    assert.match(t.id, /^[A-Z][A-Za-z]*$/, t.id);
    assert.ok(isLabel(t.label), t.id);
    assert.ok(["auto", "manual"].includes(t.importMethod), `${t.id}: no import method`);
    assert.match(t.color, /^#[0-9a-f]{6}$/i, t.id);
    assert.ok(typeof t.emoji === "string" && t.emoji !== "", t.id);
    assert.equal(t.layer, undefined, `${t.id}: stamp types have no layer field`);
    if (t.submenu !== undefined) assert.ok(CATS.submenus.some((s) => s.id === t.submenu), `${t.id}: no submenu "${t.submenu}"`);
    assert.equal(t.tiers === undefined, t.tierLabel === undefined, `${t.id}: tiers come with a tier label`);
    if (t.tiers) {
      assert.ok(isLabel(t.tierLabel), t.id);
      assert.ok(t.tiers.length > 0, `${t.id}: tier label without tiers`);
      assert.equal(new Set(ids(t.tiers)).size, t.tiers.length, t.id);
      for (const v of t.tiers) {
        assert.match(v.id, /^[A-Z][A-Za-z]*$/, `${t.id}: ${v.id}`);
        assert.ok(isLabel(v.label), `${t.id}: ${v.id}`);
      }
    }
  }
  const withoutImportMethod = { ...CATS, types: CATS.types.map(({ importMethod, ...t }) => t) };
  assert.deepEqual(UE.fillStampCategories({}, CATS).stampCategories, withoutImportMethod, "a new document gets them as they are, without importMethod");
  assert.deepEqual(UE.stampCategoryProblems({ stampCategories: CATS }), []);
});

test("default stamp categories: 钱盒 and 阴阳雕像 have their own tiers; 近战 / 远程 / 飞行 are in 敌人 with a 强弱 each", () => {
  const typeOf = (id) => V.stamp.types.find((t) => t.id === id);
  const tiers = (id) => UE.tiersOfType(typeOf(id)).map((v) => `${v.id}:${v.label}`);
  assert.equal(typeOf("MoneyBox").tierLabel, "大小");
  assert.deepEqual(tiers("MoneyBox"), ["Small:小", "Medium:中", "Large:大"]);
  assert.equal(typeOf("YinYangStatue").tierLabel, "阴阳");
  assert.deepEqual(tiers("YinYangStatue"), ["Yin:阴", "Yang:阳"]);
  for (const id of ["MeleeEnemy", "RangedEnemy", "FlyingEnemy"]) {
    assert.equal(UE.submenuOfType(V, typeOf(id)).label, "敌人", id);
    assert.equal(typeOf(id).tierLabel, "强弱", id);
    assert.deepEqual(tiers(id), ["Weak:弱小", "Medium:中等", "Elite:精英"], id);
  }
  assert.notEqual(typeOf("MeleeEnemy").tiers, typeOf("FlyingEnemy").tiers, "each type has its own list");
  assert.equal(UE.tiersOfType(typeOf("SavePoint")), null);
});

test("anchors: enemies lock ground / flying, everything else defaults to SnapToGround", () => {
  for (const t of CATS.types) {
    if (t.anchor !== undefined) assert.ok(UE.STAMP_ANCHORS.includes(t.anchor), t.id);
    if (t.anchorLocked) assert.ok(t.anchor !== undefined, `${t.id}: locked without an anchor`);
  }
  const locked = Object.fromEntries(CATS.types.filter((t) => t.anchorLocked).map((t) => [t.id, t.anchor]));
  assert.deepEqual(locked, { MeleeEnemy: "SnapToGround", RangedEnemy: "SnapToGround", FlyingEnemy: "FloatInAir" });
  for (const t of CATS.types.filter((x) => !x.anchorLocked)) assert.equal(UE.defaultStampAnchor(t), "SnapToGround", t.id);
});

test("oldStampIds: unique ids, and every target names a type of the default categories and one of its tiers", () => {
  const olds = TYPES.oldStampIds.map((o) => o.id);
  assert.equal(new Set(olds).size, olds.length);
  for (const o of TYPES.oldStampIds) {
    assert.deepEqual(Object.keys(o).filter((k) => !["id", "label", "type", "tier"].includes(k)), [], `${o.id}: unknown fields`);
    if (o.type === undefined) {
      assert.equal(o.tier, undefined, `${o.id}: a tier without a type`);
      continue;
    }
    const t = CATS.types.find((x) => x.id === o.type);
    assert.ok(t, `${o.id}: no type ${o.type}`);
    if (o.tier !== undefined) assert.ok((t.tiers || []).some((v) => v.id === o.tier), `${o.id}: ${o.type} has no tier ${o.tier}`);
  }
});

test("old stamp ids migrate: weak enemies to their type + 弱小, MediumMeleeEnemy to 近战 + 中等, EliteEnemy to 未分类; MoneyBox and YinYangStatue keep their type with no tier picked", () => {
  const ids = ["WeakMeleeEnemy", "WeakRangedEnemy", "WeakFlyingEnemy", "MediumMeleeEnemy", "EliteEnemy", "MoneyBox", "YinYangStatue"];
  const doc = { stamps: ids.map((typeId, i) => ({ id: "s" + i, name: "x" + i, typeId, points: [] })) };
  doc.stamps.push({ id: "byName", name: "弱小近战敌人", points: [] }, { id: "box", name: "钱盒", points: [] }, { id: "elite", name: "精英怪", points: [] });
  const out = UE.migrateTypeData(doc, TYPES);
  const ov = UE.vocabOf(out, TYPES.types, CATS);
  assert.deepEqual(out.stamps.map((s) => [s.name, s.typeId, s.tier, UE.statusLabelOf(s, "stamp", ov)]), [
    ["x0", "MeleeEnemy", "Weak", ""],
    ["x1", "RangedEnemy", "Weak", ""],
    ["x2", "FlyingEnemy", "Weak", ""],
    ["x3", "MeleeEnemy", "Medium", ""],
    ["x4", null, undefined, "未分类"],
    ["x5", "MoneyBox", undefined, "钱盒（未选大小）"],
    ["x6", "YinYangStatue", undefined, "阴阳雕像（未选阴阳）"],
    ["弱小近战敌人", "MeleeEnemy", "Weak", ""],
    ["钱盒", "MoneyBox", undefined, "钱盒（未选大小）"],
    ["精英怪", null, undefined, "未分类"],
  ]);
  assert.deepEqual(out.stamps.slice(0, 4).map((s) => s.anchor), ["SnapToGround", "SnapToGround", "FloatInAir", "SnapToGround"]);
  const exported = UE.buildExportDoc(out, TYPES.regions, TYPES.types, CATS);
  assert.deepEqual(exported.stamps.map((s) => s.typeId ?? null), ["MeleeEnemy", "RangedEnemy", "FlyingEnemy", "MeleeEnemy", null, null, null, "MeleeEnemy", null, null]);
});

test("the Type dropdown with the default categories: the types outside 敌人, then the 敌人 section; structure and edge layers have one section", () => {
  const sections = UE.typePickerSections(V, "stamp").map((s) => [s.submenu && s.submenu.label, s.types.map((t) => t.id)]);
  assert.deepEqual(sections, [
    [null, ["PlayerStart", "SavePoint", "Mechanism", "MoneyBox", "Collectible", "JudgeMask", "Artifact", "YinYangStatue", "BaiLing"]],
    ["敌人", ["MeleeEnemy", "RangedEnemy", "FlyingEnemy"]],
  ]);
  for (const layer of ["structure", "edge"]) assert.deepEqual(UE.typePickerSections(V, layer).map((s) => s.submenu), [null], layer);
});

test("export writes the locked anchor of an enemy type, whatever the element stored; other types keep theirs", () => {
  const doc = {
    stampCategories: CATS,
    stamps: [
      { id: "a", name: "bat", typeId: "FlyingEnemy", tier: "Weak", anchor: "SnapToGround", points: [] },
      { id: "b", name: "ghoul", typeId: "MeleeEnemy", tier: "Elite", anchor: "FloatInAir", points: [] },
      { id: "c", name: "box on a wall", typeId: "MoneyBox", tier: "Small", anchor: "FloatInAir", points: [] },
      { id: "d", name: "box", typeId: "MoneyBox", tier: "Small", points: [] },
    ],
  };
  const out = UE.buildExportDoc(doc, TYPES.regions, TYPES.types, CATS);
  assert.deepEqual(out.stamps.map((s) => s.anchor), ["FloatInAir", "SnapToGround", "FloatInAir", "SnapToGround"]);
});

test("an untyped edge named 地图联通 (as in maps drawn before the type existed) migrates to MapConnection; other layers don't", () => {
  const doc = {
    structures: [{ id: "s1", name: "地图联通", rects: [] }],
    edgeStructs: [
      { id: "e1", name: "地图联通", segs: [] },
      { id: "e2", name: "地图联通", typeId: null, segs: [] },
    ],
  };
  const out = UE.migrateTypeIds(doc, TYPES.types);
  assert.equal(out.edgeStructs[0].typeId, "MapConnection");
  assert.equal(out.edgeStructs[1].typeId, null, "picked 未分类 by hand: kept");
  assert.equal(out.structures[0].typeId, undefined);
  assert.equal(UE.manualMarkOf(out.edgeStructs[0], "edge", V), null);
});

test("band edge types: only edge types have `band`, with a positive default thickness; 刺边 is one, 暗箭机关 isn't", () => {
  for (const t of TYPES.types) {
    if (t.band === undefined) continue;
    assert.equal(t.layer, "edge", `${t.id}: only edge types can be band edges`);
    assert.deepEqual(Object.keys(t.band), ["thickness"], t.id);
    assert.ok(Number.isFinite(t.band.thickness) && t.band.thickness > 0, t.id);
  }
  const byId = (id) => TYPES.types.find((t) => t.id === id);
  assert.deepEqual(
    [byId("DamageEdge").label, byId("DamageEdge").importMethod, byId("DamageEdge").color],
    ["刺边", "auto", byId("DamageTerrain").color],
    "刺边 is auto, coloured like 刺"
  );
  assert.equal(UE.isBandType("DamageEdge", V), true);
  assert.equal(UE.bandThicknessOf("DamageEdge", V), 1);
  assert.deepEqual([byId("HiddenArrowTrap").label, byId("HiddenArrowTrap").layer, byId("HiddenArrowTrap").importMethod], ["暗箭机关", "edge", "manual"]);
  assert.equal(UE.isBandType("HiddenArrowTrap", V), false);
});
