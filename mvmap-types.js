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
         generate - auto：导入工具按它生成东西（项目类，或像地图联通那样用来算 Volume）；manual：只生成占位标记，由人工摆放
         color / emoji - 新建元素（名字还是 "Structure 1" 这类默认名、还没选过类型）选这个类型时，
                         名字换成 label，颜色和 emoji（emoji 只对 stamp 生效）换成这里的值；其他情况选类型只改类型
         group / subLabel - （可选）两级类型下拉用：group 是大类名（如"钱盒"），subLabel 是这个类型在大类里的小类名（如"小"）。
                         同一个 group 的类型放在一起；有 group 的类型必须有 subLabel。没有 group 的类型只有一级。
                         group 名也是存进文件的值（只选了大类的元素记 typeGroup）：改 group 名后，这类元素会变回"未分类"
         anchor   - （只用于 stamp，可选）摆放方式：SnapToGround（贴地）/ FloatInAir（悬空），缺省为 SnapToGround。
                    新建元素、旧文件里没有 anchor 的元素按它填默认值，之后策划可以在 Inspector 里改
         anchorLocked - （只用于 stamp，可选）true 时 anchor 由类型决定：Inspector 不显示 anchor 下拉，导出时一律写这个类型的 anchor
       不在这里的名字加载后显示"未分类"，导出时不写 typeId。
       拆分一个类型（如"钱盒"拆成三档）时，旧 id 不要写进 oldIds：旧元素打开后变成未分类，由策划自己选，不会被悄悄归到某一档。
       拆分后的类型有 group 的话，把旧 id 写进下面的 groupOldIds：旧元素打开后自动选上大类，小类仍由策划选。 */
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
      { id: "MapConnection", label: "地图联通", layer: "edge", generate: "auto", color: "#5ad07a", emoji: "🔀" }, // 房间出入口，UE 导入时用作相机 Volume 的边界；水平、竖直都可以，斜线不用
      { id: "OneWayDoorBreakableSide", label: "单向门可破坏侧", layer: "edge", generate: "manual", color: "#e0555f", emoji: "💥" }, // 人工摆放
      { id: "MovableJumpOffPlatformStart", label: "可移动下落平台-起点", layer: "edge", generate: "manual", color: "#d5c972", emoji: "⬅️" }, // 人工摆放
      { id: "MovableJumpOffPlatformEnd", label: "可移动下落平台-终点", layer: "edge", generate: "manual", color: "#5a542a", emoji: "➡️" }, // 人工摆放
      // ── stamp ──
      { id: "PlayerStart", label: "出生点", layer: "stamp", generate: "manual", color: "#5ad07a", emoji: "❤️" }, // 玩家出生位置，人工摆放
      { id: "SavePoint", label: "傩公傩母像", layer: "stamp", generate: "auto", color: "#7c879b", emoji: "💾" }, // 存档点，生成 BP_SavePoint
      { id: "Mechanism", label: "机关", layer: "stamp", generate: "manual", color: "#a97af0", emoji: "⚙️" }, // 可交互的机关开关，人工摆放；控制哪个对象目前没有记录
      // 钱盒、阴阳雕像按档位 / 阴阳拆开（2026-11-12）。旧 id MoneyBox、YinYangStatue 故意不写进 oldIds，写在 groupOldIds 里
      { id: "MoneyBoxSmall", label: "钱盒·小", group: "钱盒", subLabel: "小", layer: "stamp", generate: "auto", color: "#5aa9f0", emoji: "💰" }, // 生成 BP_LevelFacility_MoneyTree_Small
      { id: "MoneyBoxMiddle", label: "钱盒·中", group: "钱盒", subLabel: "中", layer: "stamp", generate: "auto", color: "#5aa9f0", emoji: "💰" }, // 生成 BP_LevelFacility_MoneyTree_Middle
      { id: "MoneyBoxLarge", label: "钱盒·大", group: "钱盒", subLabel: "大", layer: "stamp", generate: "auto", color: "#5aa9f0", emoji: "💰" }, // 生成 BP_LevelFacility_MoneyTree_Large
      { id: "Collectible", label: "收集品", layer: "stamp", generate: "manual", color: "#d84c7a", emoji: "🎁" }, // 收集品，人工摆放
      { id: "JudgeMask", label: "判官面具", layer: "stamp", generate: "manual", color: "#f0dc3a", emoji: "🏆" }, // 判官面具（获得位置），人工摆放
      { id: "Artifact", label: "法器", layer: "stamp", generate: "manual", color: "#e0555f", emoji: "🪄" }, // 法器（获得位置），人工摆放
      { id: "YinYangStatueYin", label: "阴阳雕像·阴", group: "阴阳雕像", subLabel: "阴", layer: "stamp", generate: "auto", color: "#f0dc3a", emoji: "🗿" }, // 生成 BP_LevelFacility_Statue_YinXi
      { id: "YinYangStatueYang", label: "阴阳雕像·阳", group: "阴阳雕像", subLabel: "阳", layer: "stamp", generate: "auto", color: "#f0dc3a", emoji: "🗿" }, // 生成 BP_LevelFacility_Statue_YangXi
      { id: "BaiLing", label: "白灵", layer: "stamp", generate: "manual", color: "#5ad07a", emoji: "🗨️" }, // 白灵（可对话），人工摆放
      // 敌人：等级 × 地面 / 飞行，anchor 由类型锁定（2026-11-12）。生成刷怪点，房间里另生成一个道中 Arena。
      // 中等近战敌人（MediumMeleeEnemy）、精英怪（EliteEnemy）故意不归类：打开旧文件后只选上大类"敌人"，由策划重选小类
      { id: "EnemyWeakGround", label: "敌人·弱小·地面", group: "敌人", subLabel: "弱小·地面", layer: "stamp", generate: "auto", color: "#5fd8cf", emoji: "👾", anchor: "SnapToGround", anchorLocked: true, oldIds: ["WeakMeleeEnemy", "WeakRangedEnemy"], oldLabels: ["弱小近战敌人", "弱小远程敌人"] },
      { id: "EnemyWeakFlying", label: "敌人·弱小·飞行", group: "敌人", subLabel: "弱小·飞行", layer: "stamp", generate: "auto", color: "#b8c0cc", emoji: "🦇", anchor: "FloatInAir", anchorLocked: true, oldIds: ["WeakFlyingEnemy"], oldLabels: ["弱小飞行敌人"] },
      { id: "EnemyEliteGround", label: "敌人·精英·地面", group: "敌人", subLabel: "精英·地面", layer: "stamp", generate: "auto", color: "#c9885a", emoji: "👹", anchor: "SnapToGround", anchorLocked: true },
      { id: "EnemyEliteFlying", label: "敌人·精英·飞行", group: "敌人", subLabel: "精英·飞行", layer: "stamp", generate: "auto", color: "#f0a13a", emoji: "🐉", anchor: "FloatInAir", anchorLocked: true },
    ],

    /* 拆分前的旧 typeId -> 大类（两级下拉）。加载文件时，typeId 是这里的旧 id 的元素：typeId 清空（仍算未分类、导出时不写），
       Inspector 里自动选上大类，小类留给策划选。和 oldIds 的区别：oldIds 直接归到一个类型，这里只归到大类。
         id    - 旧 typeId，不能和任何类型的 id、oldIds 重复
         layer - 适用图层
         group - 大类名，必须是这个图层里某些类型的 group */
    groupOldIds: [
      { id: "MoneyBox", layer: "stamp", group: "钱盒" }, // 2026-11-12 拆成大 / 中 / 小
      { id: "YinYangStatue", layer: "stamp", group: "阴阳雕像" }, // 2026-11-12 拆成阴 / 阳
      { id: "MediumMeleeEnemy", layer: "stamp", group: "敌人" }, // 中等近战敌人，2026-11-12 敌人改分类
      { id: "EliteEnemy", layer: "stamp", group: "敌人" }, // 精英怪，2026-11-12 敌人改分类
    ],
  };
});
