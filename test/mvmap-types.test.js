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

test("every element type has a unique id, a known layer and generate mode, a colour and an emoji", () => {
  const types = TYPES.types;
  assert.ok(types.length > 0);
  assert.equal(new Set(types.map((t) => t.id)).size, types.length);
  for (const t of types) {
    assert.match(t.id, /^[A-Z][A-Za-z]*$/, t.id);
    assert.ok(typeof t.label === "string" && t.label.trim() === t.label && t.label !== "", t.id);
    assert.ok(["structure", "edge", "stamp"].includes(t.layer), t.id);
    assert.ok(["auto", "manual"].includes(t.generate), t.id);
    assert.match(t.color, /^#[0-9a-f]{6}$/i, t.id);
    assert.ok(typeof t.emoji === "string" && t.emoji !== "", t.id);
  }
});

test("labels, old labels included, are unique within a layer, so a name can only ever match one type", () => {
  for (const layer of ["structure", "edge", "stamp"]) {
    const labels = TYPES.types.filter((t) => t.layer === layer).flatMap((t) => [t.label, ...(t.oldLabels || [])]);
    assert.equal(new Set(labels).size, labels.length, layer);
  }
});

test("old ids never clash with a current id or another type's old id, so a renamed id migrates to exactly one type", () => {
  const ids = TYPES.types.flatMap((t) => [t.id, ...(t.oldIds || [])]);
  assert.equal(new Set(ids).size, ids.length);
});

test("the importer's auto types: Landscape, DamageTerrain, JumpOffPlatform, MapConnection, and the phase-four stamps", () => {
  const auto = TYPES.types.filter((t) => t.generate === "auto").map((t) => `${t.layer}:${t.id}`).sort();
  assert.deepEqual(auto, [
    "edge:JumpOffPlatform", "edge:MapConnection",
    "stamp:EnemyEliteFlying", "stamp:EnemyEliteGround", "stamp:EnemyWeakFlying", "stamp:EnemyWeakGround",
    "stamp:MoneyBoxLarge", "stamp:MoneyBoxMiddle", "stamp:MoneyBoxSmall", "stamp:SavePoint",
    "stamp:YinYangStatueYang", "stamp:YinYangStatueYin",
    "structure:DamageTerrain", "structure:Landscape",
  ]);
});

test("group data for the two-level type picker: every grouped type has a subLabel, unique within its group and layer", () => {
  for (const t of TYPES.types) {
    if (t.group === undefined) {
      assert.equal(t.subLabel, undefined, `${t.id}: subLabel without group`);
      continue;
    }
    assert.ok(typeof t.group === "string" && t.group.trim() === t.group && t.group !== "", t.id);
    assert.ok(typeof t.subLabel === "string" && t.subLabel.trim() === t.subLabel && t.subLabel !== "", t.id);
  }
  const keys = TYPES.types.filter((t) => t.group).map((t) => `${t.layer}:${t.group}:${t.subLabel}`);
  assert.equal(new Set(keys).size, keys.length);
  const groups = (g) => TYPES.types.filter((t) => t.group === g).map((t) => t.id);
  assert.deepEqual(groups("钱盒"), ["MoneyBoxSmall", "MoneyBoxMiddle", "MoneyBoxLarge"]);
  assert.deepEqual(groups("阴阳雕像"), ["YinYangStatueYin", "YinYangStatueYang"]);
  assert.deepEqual(groups("敌人"), ["EnemyWeakGround", "EnemyWeakFlying", "EnemyEliteGround", "EnemyEliteFlying"]);
});

test("anchors: only stamps have them, values are known, enemies lock ground / flying, everything else defaults to SnapToGround", () => {
  for (const t of TYPES.types) {
    if (t.layer !== "stamp") {
      assert.equal(t.anchor, undefined, t.id);
      assert.equal(t.anchorLocked, undefined, t.id);
      continue;
    }
    if (t.anchor !== undefined) assert.ok(UE.STAMP_ANCHORS.includes(t.anchor), t.id);
    if (t.anchorLocked) assert.ok(t.anchor !== undefined, `${t.id}: locked without an anchor`);
  }
  const locked = Object.fromEntries(TYPES.types.filter((t) => t.anchorLocked).map((t) => [t.id, t.anchor]));
  assert.deepEqual(locked, {
    EnemyWeakGround: "SnapToGround", EnemyWeakFlying: "FloatInAir", EnemyEliteGround: "SnapToGround", EnemyEliteFlying: "FloatInAir",
  });
  for (const t of TYPES.types.filter((x) => x.layer === "stamp" && !x.anchorLocked)) assert.equal(UE.defaultStampAnchor(t), "SnapToGround", t.id);
});

test("split stamp types: MoneyBox, YinYangStatue, MediumMeleeEnemy, EliteEnemy open unclassified with their group picked; weak enemies migrate", () => {
  const doc = {
    stamps: [
      { id: "a", name: "钱盒", typeId: "MoneyBox", points: [] },
      { id: "b", name: "阴阳雕像", typeId: "YinYangStatue", points: [] },
      { id: "c", name: "中等近战敌人", typeId: "MediumMeleeEnemy", points: [] },
      { id: "d", name: "精英怪", typeId: "EliteEnemy", points: [] },
      { id: "e", name: "弱小近战敌人", typeId: "WeakMeleeEnemy", points: [] },
      { id: "f", name: "弱小远程敌人", typeId: "WeakRangedEnemy", points: [] },
      { id: "g", name: "弱小飞行敌人", typeId: "WeakFlyingEnemy", points: [] },
      { id: "h", name: "钱盒", points: [] }, // untyped, named like the old type
    ],
  };
  const out = UE.migrateTypeIds(doc, TYPES.types, TYPES.groupOldIds);
  const typeOf = (el) => (UE.elementTypeOf(el, "stamp", TYPES.types) || { id: null }).id;
  assert.deepEqual(out.stamps.map(typeOf), [null, null, null, null, "EnemyWeakGround", "EnemyWeakGround", "EnemyWeakFlying", null]);
  const pending = out.stamps.map((el) => UE.pendingTypeGroupOf(el, "stamp", TYPES.types));
  assert.deepEqual(pending, ["钱盒", "阴阳雕像", "敌人", "敌人", null, null, null, null]);
  assert.equal(out.stamps[0].typeId, null);
  const exported = UE.buildExportDoc(out, TYPES.regions, TYPES.types);
  assert.ok(!("typeId" in exported.stamps[0]), "a stamp with only its group picked is exported without typeId");
});

test("groupOldIds: each old id names a group of its layer, and never clashes with a current id or any oldIds", () => {
  const all = TYPES.types.flatMap((t) => [t.id, ...(t.oldIds || [])]);
  const olds = TYPES.groupOldIds.map((g) => g.id);
  assert.equal(new Set(olds).size, olds.length);
  for (const g of TYPES.groupOldIds) {
    assert.ok(!all.includes(g.id), g.id);
    assert.ok(["structure", "edge", "stamp"].includes(g.layer), g.id);
    assert.ok(TYPES.types.some((t) => t.layer === g.layer && t.group === g.group), `${g.id}: no ${g.layer} group "${g.group}"`);
  }
});

test("the two-level picker's first level: stamps list each group once, structure and edge layers have only types", () => {
  const first = (layer) => UE.typePickerEntries(TYPES.types, layer).map((e) => e.group || e.type.id);
  assert.deepEqual(first("stamp"), ["PlayerStart", "SavePoint", "Mechanism", "钱盒", "Collectible", "JudgeMask", "Artifact", "阴阳雕像", "BaiLing", "敌人"]);
  for (const layer of ["structure", "edge"]) assert.ok(UE.typePickerEntries(TYPES.types, layer).every((e) => e.type), layer);
});

test("export writes the locked anchor of an enemy type, whatever the element stored; other types keep theirs", () => {
  const doc = {
    stamps: [
      { id: "a", name: "bat", typeId: "EnemyWeakFlying", anchor: "SnapToGround", points: [] },
      { id: "b", name: "ghoul", typeId: "EnemyEliteGround", anchor: "FloatInAir", points: [] },
      { id: "c", name: "box on a wall", typeId: "MoneyBoxSmall", anchor: "FloatInAir", points: [] },
      { id: "d", name: "box", typeId: "MoneyBoxSmall", points: [] },
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
  assert.equal(UE.manualMarkOf(out.edgeStructs[0], "edge", TYPES.types), null);
});
