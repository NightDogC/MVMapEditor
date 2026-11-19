"use strict";
// Migrates the real designer map (Export/nuosoul.mvmap.json, not tracked in git) with the real vocabulary.
// Skipped when that file isn't on this machine.
//
// The file keeps changing as designers draw, so nothing here depends on how many elements it has. The first test
// pins the 26 elements the file had on 2026-10-19 (Perforce revision #1) by id: a vocabulary change that would orphan
// them (like the Wall -> Landscape rename) fails it. Elements added later are not checked, and pinned ones that were
// deleted are skipped. If a designer deliberately gives a pinned element another type, update its entry below.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const UE = require("../mvmap-ue.js");
const TYPES = require("../mvmap-types.js");

const FILE = path.join(__dirname, "..", "Export", "nuosoul.mvmap.json");
const skip = fs.existsSync(FILE) ? false : "Export/nuosoul.mvmap.json not found";

// layer:element id -> expected type after migration (null = no type)
const EXPECTED = {
  "structure:struct_bp7tbjlxzv": "Landscape", // 墙体; exported as typeId "Wall" before the 2026-10-21 rename, migrated by oldIds
  "structure:struct_5sts10nge7": "OneWayDoor", // 单向门
  "structure:struct_yknrnzlva1": "HiddenArea", // 隐藏区域
  "structure:struct_dhgl5ch820": "DamageTerrain", // 刺
  "structure:struct_oa81lnlo6c": "MovableWallEnd", // 可移动墙体-终点
  "structure:struct_3h05qbhydy": "MovableWallStart", // 可移动墙体-起点
  "structure:struct_8jcfvwm1jb": "ArenaGate", // 战斗门
  "edge:edge_68ys8zzp06": "OneWayDoorBreakableSide", // 单向门可破坏侧
  "edge:edge_kp4p05hs3u": "JumpOffPlatform", // 可下落平台
  "edge:edge_vksb8vt3g9": "MapConnection", // 地图联通; unclassified until 2026-11-10, migrated by its label
  "edge:edge_omlrq7812m": "MovableJumpOffPlatformStart", // 可移动下落平台-起点
  "edge:edge_rav0bfxe5d": "MovableJumpOffPlatformEnd", // 可移动下落平台-终点
  "stamp:stamp_x3pdepqoz2": "JudgeMask", // 判官面具
  "stamp:stamp_eg93sf09st": "PlayerStart", // 出生点
  "stamp:stamp_n8derrft9k": "MeleeEnemy", // 弱小近战敌人; WeakMeleeEnemy until 2026-11-12, migrated by oldStampIds
  "stamp:stamp_fchrbmiwuv": "MoneyBox", // 钱盒; its size (tier) is left for the designer
  "stamp:stamp_68p6kkacbo": "Mechanism", // 机关
  "stamp:stamp_8rf13o0y61": "RangedEnemy", // 弱小远程敌人; WeakRangedEnemy until 2026-11-12, migrated by oldStampIds
  "stamp:stamp_c1ltxmjc8r": "Collectible", // 收集品
  "stamp:stamp_mhtvocjkdf": "FlyingEnemy", // 弱小飞行敌人; WeakFlyingEnemy until 2026-11-12, migrated by oldStampIds
  "stamp:stamp_j6qlyweyxk": "SavePoint", // 傩公傩母像
  "stamp:stamp_1jv47lsd5c": "MeleeEnemy", // 精英怪; EliteEnemy until 2026-11-12, then group 敌人 + 精英 until the designer picked 近战
  "stamp:stamp_1v066y5pnn": "Artifact", // 法器
  "stamp:stamp_q0vtpgzrky": "MeleeEnemy", // 中等近战敌人; MediumMeleeEnemy until 2026-11-12, migrated by oldStampIds
  "stamp:stamp_v4ca7wcnwq": "YinYangStatue", // 阴阳雕像; 阴 / 阳 (tier) is left for the designer
  "stamp:stamp_jxlxm355jp": "BaiLing", // 白灵
};

const LISTS = [
  ["structures", "structure"],
  ["edgeStructs", "edge"],
  ["stamps", "stamp"],
];

const load = () => UE.migrateTypeData(JSON.parse(fs.readFileSync(FILE, "utf8")), TYPES);

/** layer:id -> the element's type after migration (null = none), for every element of the document. */
function migratedTypes(out) {
  const vocab = UE.vocabOf(out, TYPES.types);
  const got = {};
  for (const [list, layer] of LISTS) {
    for (const el of out[list] || []) {
      const t = UE.elementTypeOf(el, layer, vocab);
      got[`${layer}:${el.id}`] = t ? t.id : null;
    }
  }
  return got;
}

test("nuosoul.mvmap.json: the elements it had on 2026-10-19 are still classified as expected", { skip }, (t) => {
  const got = migratedTypes(load());
  const present = Object.keys(EXPECTED).filter((key) => key in got);
  const missing = Object.keys(EXPECTED).filter((key) => !(key in got));
  if (missing.length) t.diagnostic(`deleted from the file since 2026-10-19, not checked: ${missing.join(", ")}`);
  assert.ok(present.length > 0, "none of the pinned elements is in the file any more; re-pin EXPECTED to the current file");
  for (const key of present) assert.equal(got[key], EXPECTED[key], key);
});

test("nuosoul.mvmap.json: enemies keep their type and 强弱 through the category upgrade; the statue still has its tier left to pick", { skip }, () => {
  const doc = load();
  const vocab = UE.vocabOf(doc, TYPES.types, TYPES.defaultStampCategories);
  const got = Object.fromEntries((doc.stamps || []).map((el) => [el.id, [el.typeId, el.tier, UE.statusLabelOf(el, "stamp", vocab)]]));
  // as picked in Perforce revision #6 (2026-11-17), when 强弱 still hung on the group 敌人
  const expected = {
    stamp_n8derrft9k: ["MeleeEnemy", "Weak", ""], // 敌人·近战·弱小
    stamp_8rf13o0y61: ["RangedEnemy", "Weak", ""], // 敌人·远程·弱小
    stamp_mhtvocjkdf: ["FlyingEnemy", "Weak", ""], // 敌人·飞行·弱小
    stamp_q0vtpgzrky: ["MeleeEnemy", "Medium", ""], // 敌人·近战··中等
    stamp_1jv47lsd5c: ["MeleeEnemy", "Elite", ""], // 敌人·近战·精英
    stamp_fchrbmiwuv: ["MoneyBox", "Medium", ""], // 钱盒·中
    stamp_v4ca7wcnwq: ["YinYangStatue", undefined, "阴阳雕像（未选阴阳）"], // 阴阳雕像, exported with pendingTypeId
  };
  for (const [id, want] of Object.entries(expected)) if (id in got) assert.deepEqual(got[id], want, id);
  assert.ok(doc.stamps.every((el) => !("typeGroup" in el)), "no group-only stamps are left");
  const defaults = { ...TYPES.defaultStampCategories, types: TYPES.defaultStampCategories.types.map(({ importMethod, ...t }) => t) };
  assert.deepEqual(doc.stampCategories, defaults, "the file's categories (the old defaults) upgrade to exactly the new defaults");
  assert.deepEqual(UE.stampCategoryProblems(JSON.parse(fs.readFileSync(FILE, "utf8"))), [], "the upgrade is not reported");
});

test("nuosoul.mvmap.json: the export carries typeId on exactly the complete elements", { skip }, () => {
  const doc = load();
  const vocab = UE.vocabOf(doc, TYPES.types);
  const got = migratedTypes(doc);
  const out = UE.buildExportDoc(doc, TYPES.regions, TYPES.types, TYPES.defaultStampCategories);
  for (const [list, layer] of LISTS) {
    for (const el of out[list] || []) {
      const key = `${layer}:${el.id}`;
      const src = doc[list].find((x) => x.id === el.id);
      const complete = UE.elementStatusOf(src, layer, vocab) === "complete";
      assert.equal("typeId" in el, complete, key);
      if (complete) assert.equal(el.typeId, got[key], key);
    }
  }
});
