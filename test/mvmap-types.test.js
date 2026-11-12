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
const V = UE.vocabOf({ stampCategories: CATS }, TYPES.types);
const isLabel = (v) => typeof v === "string" && v.trim() === v && v !== "";

test("every structure / edge type has a unique id, a known layer and generate mode, a colour and an emoji", () => {
  const types = TYPES.types;
  assert.ok(types.length > 0);
  assert.equal(new Set(types.map((t) => t.id)).size, types.length);
  for (const t of types) {
    assert.match(t.id, /^[A-Z][A-Za-z]*$/, t.id);
    assert.ok(isLabel(t.label), t.id);
    assert.ok(["structure", "edge"].includes(t.layer), `${t.id}: stamp types belong in defaultStampCategories`);
    assert.ok(["auto", "manual"].includes(t.generate), t.id);
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
  const all = [...TYPES.types, ...CATS.types.map((t) => ({ ...t, layer: "stamp" }))];
  const auto = all.filter((t) => t.generate === "auto").map((t) => `${t.layer}:${t.id}`).sort();
  assert.deepEqual(auto, [
    "edge:JumpOffPlatform", "edge:MapConnection",
    "stamp:FlyingEnemy", "stamp:MeleeEnemy", "stamp:MoneyBox", "stamp:RangedEnemy", "stamp:SavePoint", "stamp:YinYangStatue",
    "structure:DamageTerrain", "structure:Landscape",
  ]);
});

test("default stamp categories: readable unique ids, labels, colours, emoji; groups exist; tiers have values with unique ids", () => {
  const ids = (list) => list.map((x) => x.id);
  assert.equal(new Set(ids(CATS.groups)).size, CATS.groups.length);
  assert.equal(new Set(ids(CATS.types)).size, CATS.types.length);
  const tiers = [];
  for (const g of CATS.groups) {
    assert.match(g.id, /^[A-Z][A-Za-z]*$/, g.id);
    assert.ok(isLabel(g.label), g.id);
    if (g.tier) tiers.push([g.id, g.tier]);
  }
  for (const t of CATS.types) {
    assert.match(t.id, /^[A-Z][A-Za-z]*$/, t.id);
    assert.ok(isLabel(t.label), t.id);
    assert.ok(["auto", "manual"].includes(t.generate), t.id);
    assert.match(t.color, /^#[0-9a-f]{6}$/i, t.id);
    assert.ok(typeof t.emoji === "string" && t.emoji !== "", t.id);
    assert.equal(t.layer, undefined, `${t.id}: stamp types have no layer field`);
    if (t.group !== undefined) {
      assert.ok(CATS.groups.some((g) => g.id === t.group), `${t.id}: no group "${t.group}"`);
      assert.equal(t.tier, undefined, `${t.id}: a type in a group uses the group's tier`);
    }
    if (t.tier) tiers.push([t.id, t.tier]);
  }
  for (const [owner, tier] of tiers) {
    assert.ok(isLabel(tier.label), owner);
    assert.ok(tier.values.length > 0, `${owner}: tier without values`);
    assert.equal(new Set(ids(tier.values)).size, tier.values.length, owner);
    for (const v of tier.values) {
      assert.match(v.id, /^[A-Z][A-Za-z]*$/, `${owner}: ${v.id}`);
      assert.ok(isLabel(v.label), `${owner}: ${v.id}`);
    }
  }
  assert.deepEqual(UE.fillStampCategories({}, CATS).stampCategories, CATS, "already in the shape loading leaves it in");
});

test("default stamp categories: 钱盒 and 阴阳雕像 are one type each with a tier; 敌人 is a group of three types with 强弱", () => {
  const tierOf = (typeId) => UE.tierOf({ typeId }, "stamp", V);
  const values = (tier) => tier.values.map((v) => `${v.id}:${v.label}`);
  assert.equal(tierOf("MoneyBox").label, "大小");
  assert.deepEqual(values(tierOf("MoneyBox")), ["Small:小", "Medium:中", "Large:大"]);
  assert.equal(tierOf("YinYangStatue").label, "阴阳");
  assert.deepEqual(values(tierOf("YinYangStatue")), ["Yin:阴", "Yang:阳"]);
  assert.deepEqual(UE.groupMembers(V, "stamp", "Enemy").map((t) => `${t.id}:${t.label}`), ["MeleeEnemy:近战", "RangedEnemy:远程", "FlyingEnemy:飞行"]);
  for (const id of ["MeleeEnemy", "RangedEnemy", "FlyingEnemy"]) {
    assert.equal(tierOf(id).label, "强弱", id);
    assert.deepEqual(values(tierOf(id)), ["Weak:弱小", "Medium:中等", "Elite:精英"], id);
  }
  assert.equal(tierOf("SavePoint"), null);
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

test("oldStampIds: unique ids, and every target names a group, type and tier value of the default categories that fit together", () => {
  const olds = TYPES.oldStampIds.map((o) => o.id);
  assert.equal(new Set(olds).size, olds.length);
  for (const o of TYPES.oldStampIds) {
    assert.ok(o.group !== undefined || o.type !== undefined, `${o.id}: no target`);
    const g = o.group !== undefined ? CATS.groups.find((x) => x.id === o.group) : null;
    const t = o.type !== undefined ? CATS.types.find((x) => x.id === o.type) : null;
    if (o.group !== undefined) assert.ok(g, `${o.id}: no group ${o.group}`);
    if (o.type !== undefined) assert.ok(t, `${o.id}: no type ${o.type}`);
    if (g && t) assert.equal(t.group, g.id, `${o.id}: ${t.id} is not in ${g.id}`);
    if (o.tier !== undefined) {
      const tier = t ? UE.tierOf({ typeId: t.id }, "stamp", V) : g.tier;
      assert.ok(tier && tier.values.some((v) => v.id === o.tier), `${o.id}: no tier value ${o.tier}`);
    }
  }
});

test("old stamp ids migrate: weak enemies to their type + 弱小, MediumMeleeEnemy to 近战 + 中等, EliteEnemy to 敌人 + 精英; MoneyBox and YinYangStatue keep their type with no tier picked", () => {
  const ids = ["WeakMeleeEnemy", "WeakRangedEnemy", "WeakFlyingEnemy", "MediumMeleeEnemy", "EliteEnemy", "MoneyBox", "YinYangStatue"];
  const doc = { stamps: ids.map((typeId, i) => ({ id: "s" + i, name: "x", typeId, points: [] })) };
  doc.stamps.push({ id: "byName", name: "弱小近战敌人", points: [] }, { id: "box", name: "钱盒", points: [] });
  const out = UE.migrateTypeData(doc, TYPES);
  const ov = UE.vocabOf(out, TYPES.types);
  assert.deepEqual(out.stamps.map((s) => [s.typeId, s.typeGroup, s.tier, UE.statusLabelOf(s, "stamp", ov)]), [
    ["MeleeEnemy", undefined, "Weak", ""],
    ["RangedEnemy", undefined, "Weak", ""],
    ["FlyingEnemy", undefined, "Weak", ""],
    ["MeleeEnemy", undefined, "Medium", ""],
    [null, "Enemy", "Elite", "敌人（未选小类）"],
    ["MoneyBox", undefined, undefined, "钱盒（未选大小）"],
    ["YinYangStatue", undefined, undefined, "阴阳雕像（未选阴阳）"],
    ["MeleeEnemy", undefined, "Weak", ""],
    ["MoneyBox", undefined, undefined, "钱盒（未选大小）"],
  ]);
  assert.deepEqual(out.stamps.slice(0, 4).map((s) => s.anchor), ["SnapToGround", "SnapToGround", "FloatInAir", "SnapToGround"]);
  const exported = UE.buildExportDoc(out, TYPES.regions, TYPES.types);
  assert.deepEqual(exported.stamps.map((s) => s.typeId ?? null), ["MeleeEnemy", "RangedEnemy", "FlyingEnemy", "MeleeEnemy", null, null, null, "MeleeEnemy", null]);
});

test("the three-level picker's first level with the default categories: 敌人 once, structure and edge layers have only types", () => {
  const first = (layer) => UE.typePickerEntries(V, layer).map((e) => (e.group ? e.group.id : e.type.id));
  assert.deepEqual(first("stamp"), ["PlayerStart", "SavePoint", "Mechanism", "MoneyBox", "Collectible", "JudgeMask", "Artifact", "YinYangStatue", "BaiLing", "Enemy"]);
  for (const layer of ["structure", "edge"]) assert.ok(UE.typePickerEntries(V, layer).every((e) => e.type), layer);
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
  const out = UE.buildExportDoc(doc, TYPES.regions, TYPES.types);
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
