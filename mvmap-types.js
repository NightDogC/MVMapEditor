/* Vocabulary shared with the UE whitebox importer. Edit this file, not index.html.
   Loaded by index.html as a classic <script> (exposes window.MVMapTypes) and by node tests via require().

   regions: must match ENSRegionList in NSProject Source/NSProject/Global/NSGlobal_Level.h
            (InvalidRegion is left out; an area with no region selected means "not set").
     label  - shown in the editor, same as the enum's DisplayName
     region - the enum value name, used for sub-level names (XianZuCi_Room_B01_LD)
     letter - used in room codes and FacilityID tags (B01) */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.MVMapTypes = api;
})(this, function () {
  "use strict";
  return {
    regions: [
      { label: "A_傩愿寨", region: "NuoYuanZhai", letter: "A" },
      { label: "B_先祖祠", region: "XianZuCi", letter: "B" },
      { label: "C_南野坪", region: "NanYePing", letter: "C" },
      { label: "D_悬净山山麓", region: "ShanLu", letter: "D" },
      { label: "E_息烽岗", region: "XiFengGang", letter: "E" },
      { label: "F_水甲寨", region: "ShuiJiaZhai", letter: "F" },
      { label: "G_止煞湖", region: "ZhiShaHu", letter: "G" },
      { label: "H_风雨桥", region: "FengYuQiao", letter: "H" },
      { label: "J_蛊寨", region: "GuZhai", letter: "J" },
      { label: "K_悬净山地缝", region: "DiFeng", letter: "K" },
      { label: "L_混沌", region: "HunDun", letter: "L" },
    ],

    /* 元素类型：structure / edgeStruct / stamp 在 Inspector 的"类型"下拉框里从这里选。
       元素的名字只用于显示，UE 导入工具只看 typeId。
         id       - 导出到 JSON 的 typeId，UE 设置里按它配置对应的类。改 id 时把旧 id 写进 oldIds，否则已有文件里的元素会变成"未分类"
         label    - 下拉框里显示的名字。旧文件里没有 typeId 的元素，名字和它完全一致时自动归为这个类型
         oldIds    - （可选）这个类型以前用过的 id。加载文件时，typeId 是旧 id 的元素自动改成新 id
         oldLabels - （可选）以前用过的显示名。没有 typeId 的旧元素，名字和它完全一致时也归为这个类型
         layer    - 适用图层：structure（格子）/ edge（格边）/ stamp（单格标记）。下拉框只列出当前图层的类型
         generate - auto：导入时生成对应的项目类；manual：只生成占位标记，由人工摆放
         color / emoji - 新建元素（名字还是 "Structure 1" 这类默认名、还没选过类型）选这个类型时，
                         名字换成 label，颜色和 emoji（emoji 只对 stamp 生效）换成这里的值；其他情况选类型只改类型
       不在这里的名字（如"地图联通"）加载后显示"未分类"，导出时不写 typeId。 */
    types: [
      // ── structure ──
      { id: "Landscape", label: "地形", layer: "structure", generate: "auto", color: "#7c879b", emoji: "🧱", oldIds: ["Wall"], oldLabels: ["墙体"] }, // 生成 BP_Ground，矩形合并（2026-10-21 由 Wall/墙体 改名）
      { id: "DamageTerrain", label: "刺", layer: "structure", generate: "auto", color: "#e0555f", emoji: "⚠️" }, // 生成 BP_Trap_DamageTerrainVolume
      { id: "OneWayDoor", label: "单向门", layer: "structure", generate: "manual", color: "#c9885a", emoji: "🚪" }, // 人工摆放
      { id: "HiddenArea", label: "隐藏区域", layer: "structure", generate: "manual", color: "#a97af0", emoji: "🕳️" }, // 人工摆放，对应的 MapVolume .01 也不自动生成
      { id: "MovableWallStart", label: "可移动墙体-起点", layer: "structure", generate: "manual", color: "#b5dedc", emoji: "⬅️" }, // 人工摆放
      { id: "MovableWallEnd", label: "可移动墙体-终点", layer: "structure", generate: "manual", color: "#567674", emoji: "➡️" }, // 人工摆放
      { id: "ArenaGate", label: "战斗门", layer: "structure", generate: "manual", color: "#ef6fb5", emoji: "⚔️" }, // 人工摆放
      // ── edge ──
      { id: "JumpOffPlatform", label: "可下落平台", layer: "edge", generate: "auto", color: "#f0dc3a", emoji: "⬇️" }, // 生成 BP_JumpOffPlatform，连续的边合并
      { id: "OneWayDoorBreakableSide", label: "单向门可破坏侧", layer: "edge", generate: "manual", color: "#e0555f", emoji: "💥" }, // 人工摆放
      { id: "MovableJumpOffPlatformStart", label: "可移动下落平台-起点", layer: "edge", generate: "manual", color: "#d5c972", emoji: "⬅️" }, // 人工摆放
      { id: "MovableJumpOffPlatformEnd", label: "可移动下落平台-终点", layer: "edge", generate: "manual", color: "#5a542a", emoji: "➡️" }, // 人工摆放
      // ── stamp（全部 manual）──
      { id: "PlayerStart", label: "出生点", layer: "stamp", generate: "manual", color: "#5ad07a", emoji: "❤️" }, // 玩家出生位置，人工摆放
      { id: "SavePoint", label: "傩公傩母像", layer: "stamp", generate: "manual", color: "#7c879b", emoji: "💾" }, // 存档点，人工摆放
      { id: "Mechanism", label: "机关", layer: "stamp", generate: "manual", color: "#a97af0", emoji: "⚙️" }, // 可交互的机关开关，人工摆放；控制哪个对象目前没有记录
      { id: "MoneyBox", label: "钱盒", layer: "stamp", generate: "manual", color: "#5aa9f0", emoji: "💰" }, // 钱盒，人工摆放
      { id: "Collectible", label: "收集品", layer: "stamp", generate: "manual", color: "#d84c7a", emoji: "🎁" }, // 收集品，人工摆放
      { id: "JudgeMask", label: "判官面具", layer: "stamp", generate: "manual", color: "#f0dc3a", emoji: "🏆" }, // 判官面具（获得位置），人工摆放
      { id: "Artifact", label: "法器", layer: "stamp", generate: "manual", color: "#e0555f", emoji: "🪄" }, // 法器（获得位置），人工摆放
      { id: "YinYangStatue", label: "阴阳雕像", layer: "stamp", generate: "manual", color: "#f0dc3a", emoji: "🗿" }, // 阴阳雕像，人工摆放
      { id: "BaiLing", label: "白灵", layer: "stamp", generate: "manual", color: "#5ad07a", emoji: "🗨️" }, // 白灵（可对话），人工摆放
      { id: "WeakMeleeEnemy", label: "弱小近战敌人", layer: "stamp", generate: "manual", color: "#5fd8cf", emoji: "👾" }, // 敌人刷新位置，人工摆放
      { id: "WeakRangedEnemy", label: "弱小远程敌人", layer: "stamp", generate: "manual", color: "#ef6fb5", emoji: "🏹" }, // 敌人刷新位置，人工摆放
      { id: "WeakFlyingEnemy", label: "弱小飞行敌人", layer: "stamp", generate: "manual", color: "#b8c0cc", emoji: "🦇" }, // 敌人刷新位置，人工摆放
      { id: "MediumMeleeEnemy", label: "中等近战敌人", layer: "stamp", generate: "manual", color: "#f0a13a", emoji: "🐺" }, // 敌人刷新位置，人工摆放
      { id: "EliteEnemy", label: "精英怪", layer: "stamp", generate: "manual", color: "#c9885a", emoji: "👻" }, // 敌人刷新位置，人工摆放
    ],
  };
});
