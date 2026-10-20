"use strict";
// Migrates the real designer map (Export/nuosoul.mvmap.json, not tracked in git) with the real vocabulary.
// Skipped when that file isn't on this machine.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const UE = require("../mvmap-ue.js");
const TYPES = require("../mvmap-types.js");

const FILE = path.join(__dirname, "..", "Export", "nuosoul.mvmap.json");
const skip = fs.existsSync(FILE) ? false : "Export/nuosoul.mvmap.json not found";

// layer:name -> expected typeId (null = stays unclassified)
const EXPECTED = {
  "structure:墙体": "Landscape", // exported as typeId "Wall" before the 2026-10-21 rename; migrated by oldIds
  "structure:单向门": "OneWayDoor",
  "structure:隐藏区域": "HiddenArea",
  "structure:刺": "DamageTerrain",
  "structure:可移动墙体-终点": "MovableWallEnd",
  "structure:可移动墙体-起点": "MovableWallStart",
  "structure:战斗门": "ArenaGate",
  "edge:单向门可破坏侧": "OneWayDoorBreakableSide",
  "edge:可下落平台": "JumpOffPlatform",
  "edge:地图联通": null, // not agreed with the designers yet
  "edge:可移动下落平台-起点": "MovableJumpOffPlatformStart",
  "edge:可移动下落平台-终点": "MovableJumpOffPlatformEnd",
  "stamp:判官面具": "JudgeMask",
  "stamp:出生点": "PlayerStart",
  "stamp:弱小近战敌人": "WeakMeleeEnemy",
  "stamp:钱盒": "MoneyBox",
  "stamp:机关": "Mechanism",
  "stamp:弱小远程敌人": "WeakRangedEnemy",
  "stamp:收集品": "Collectible",
  "stamp:弱小飞行敌人": "WeakFlyingEnemy",
  "stamp:傩公傩母像": "SavePoint",
  "stamp:精英怪": "EliteEnemy",
  "stamp:法器": "Artifact",
  "stamp:中等近战敌人": "MediumMeleeEnemy",
  "stamp:阴阳雕像": "YinYangStatue",
  "stamp:白灵": "BaiLing",
};

const LISTS = [
  ["structures", "structure"],
  ["edgeStructs", "edge"],
  ["stamps", "stamp"],
];

test("nuosoul.mvmap.json: each of its 26 elements is classified as expected", { skip }, () => {
  const doc = JSON.parse(fs.readFileSync(FILE, "utf8"));
  const out = UE.migrateTypeIds(doc, TYPES.types);
  const got = {};
  for (const [list, layer] of LISTS) {
    for (const el of out[list]) {
      const t = UE.elementTypeOf(el, layer, TYPES.types);
      got[`${layer}:${el.name}`] = t ? t.id : null;
    }
  }
  assert.deepEqual(got, EXPECTED);
});

test("nuosoul.mvmap.json: the export carries typeId on classified elements only", { skip }, () => {
  const doc = UE.migrateTypeIds(JSON.parse(fs.readFileSync(FILE, "utf8")), TYPES.types);
  const out = UE.buildExportDoc(doc, TYPES.regions, TYPES.types);
  const edge = (name) => out.edgeStructs.find((e) => e.name === name);
  assert.equal(edge("可下落平台").typeId, "JumpOffPlatform");
  assert.equal("typeId" in edge("地图联通"), false);
  const typed = [...out.structures, ...out.edgeStructs, ...out.stamps].filter((e) => "typeId" in e);
  assert.equal(typed.length, 25);
});
