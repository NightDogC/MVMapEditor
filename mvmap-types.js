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

    /* structure / edge 的元素类型：Inspector 的"类型"下拉框从这里选，策划不能编辑。stamp 的类型不在这里，见下面的 defaultStampCategories。
       元素的名字只用于显示，UE 导入工具只看 typeId。
         id       - 导出到 JSON 的 typeId，UE 设置里按它配置对应的类。改 id 时把旧 id 写进 oldIds，否则已有文件里的元素会变成"未分类"
         label    - 下拉框里显示的名字。旧文件里没有 typeId 的元素，名字和它完全一致时自动归为这个类型
         oldIds    - （可选）这个类型以前用过的 id。加载文件时，typeId 是旧 id 的元素自动改成新 id
         oldLabels - （可选）以前用过的显示名。没有 typeId 的旧元素，名字和它完全一致时也归为这个类型
         layer    - 适用图层：structure（格子）/ edge（格边）。下拉框只列出当前图层的类型
         importMethod - 导入方式。auto（自动生成）：导入工具按它生成东西（项目类，或像地图联通那样用来算 Volume）；
                    manual（只放占位）：只生成占位标记，由人工摆放
         color / emoji - 新建元素（名字还是 "Structure 1" 这类默认名、还没选过类型）选这个类型时，
                         名字换成 label，颜色换成这里的值；其他情况选类型只改类型
       不在这里的名字加载后显示"未分类"，导出时不写 typeId。 */
    types: [
      // ── structure ──
      { id: "Landscape", label: "地形", layer: "structure", importMethod: "auto", color: "#7c879b", emoji: "🧱", oldIds: ["Wall"], oldLabels: ["墙体"] }, // 生成 BP_Ground，矩形合并（2026-10-21 由 Wall/墙体 改名）
      { id: "DamageTerrain", label: "刺", layer: "structure", importMethod: "auto", color: "#e0555f", emoji: "⚠️" }, // 生成 BP_Trap_DamageTerrainVolume
      { id: "OneWayDoor", label: "单向门", layer: "structure", importMethod: "manual", color: "#c9885a", emoji: "🚪" }, // 人工摆放
      { id: "HiddenArea", label: "隐藏区域", layer: "structure", importMethod: "manual", color: "#a97af0", emoji: "🕳️" }, // 人工摆放，对应的 MapVolume .01 也不自动生成
      { id: "MovableWallStart", label: "可移动墙体-起点", layer: "structure", importMethod: "manual", color: "#b5dedc", emoji: "⬅️" }, // 人工摆放
      { id: "MovableWallEnd", label: "可移动墙体-终点", layer: "structure", importMethod: "manual", color: "#567674", emoji: "➡️" }, // 人工摆放
      { id: "ArenaGate", label: "战斗门", layer: "structure", importMethod: "manual", color: "#ef6fb5", emoji: "⚔️" }, // 人工摆放
      // ── edge ──
      { id: "JumpOffPlatform", label: "可下落平台", layer: "edge", importMethod: "auto", color: "#f0dc3a", emoji: "⬇️" }, // 生成 BP_JumpOffPlatform，连续的边合并
      { id: "MapConnection", label: "地图联通", layer: "edge", importMethod: "auto", color: "#5ad07a", emoji: "🔀" }, // 房间出入口，UE 导入时用作相机 Volume 的边界；水平、竖直都可以，斜线不用
      { id: "OneWayDoorBreakableSide", label: "单向门可破坏侧", layer: "edge", importMethod: "manual", color: "#e0555f", emoji: "💥" }, // 人工摆放
      { id: "MovableJumpOffPlatformStart", label: "可移动下落平台-起点", layer: "edge", importMethod: "manual", color: "#d5c972", emoji: "⬅️" }, // 人工摆放
      { id: "MovableJumpOffPlatformEnd", label: "可移动下落平台-终点", layer: "edge", importMethod: "manual", color: "#5a542a", emoji: "➡️" }, // 人工摆放
    ],

    /* stamp 分类的默认值，和 UE 的 StampTypes 一一对应：types[id].tiers[tier] ↔ StampTypes[id].Tiers[tier]。
       stamp 分类存在每个地图文件的 stampCategories 里，由策划编辑；这里的内容只在加载时补给还没有 stampCategories 的文档
       （新建的地图、五期之前的旧文件），补进去的副本不带 importMethod。已经有分类的文档不受这里的修改影响，importMethod 除外（见下）。

       叫法（界面、README、帮助弹窗、UE 侧注释都用这一套）：
         子菜单 Submenu        submenus[]、types[].submenu   UE 不读
         类型 Type             types[]、元素的 typeId         StampTypes 的 key
         档位名 Tier label     types[].tierLabel             UE 没有对应
         档位 Tier             types[].tiers[]、元素的 tier   StampTypes[id].Tiers 的 key、生成物的 MVMapTier: Tag
         导入方式 Import       importMethod：auto（自动生成）/ manual（只放占位）   StampTypes 里有没有这个 key

         submenus - 子菜单：几个类型在 Inspector 类型下拉里的分段（<optgroup>），只用于显示，不导出给 UE，没有档位
           id    - 类型的 submenu 指向它
           label - 分段标题
         types    - 类型（列表平铺，id 在整份分类里唯一）：
           id       - 导出到 JSON 的 typeId，UE 设置里按它配置
           label    - 下拉框里显示的名字。没有 typeId 的旧元素，名字和它完全一致时自动归为这个类型
           submenu  - （可选）所在子菜单的 id
           tierLabel - （有 tiers 时必填）档位名，Inspector 档位下拉的标题（"档位 Tier · 强弱"）
           tiers    - （可选）档位 [{ id, label }]，id 存进元素的 tier，在同一个类型里不重复。有档位的类型，元素选了档位才算选完
           importMethod - 导入方式，只写在这里，不存进地图文件：编辑器按类型 id 查这里（mvmap-ue.js importMethodOf），
                      不在这里的类型（策划新建的）一律是 manual；导出时写进 stampCategories.types[].importMethod 给 UE 的汇总用
           color / emoji - 新建元素（名字还是 "Stamp 1"、还没选过类型）选这个类型时，名字、颜色、emoji 换成这里的值；
                         在子菜单里的类型，名字是"子菜单·类型"（敌人·近战）。之后选档位时，档位也接到名字后面（敌人·近战·精英），策划改过的名字不变
           anchor   - （可选）摆放方式：SnapToGround（贴地）/ FloatInAir（悬空），缺省为 SnapToGround。
                      新建元素、旧文件里没有 anchor 的元素按它填默认值，之后策划可以在 Inspector 里改
           anchorLocked - （可选）true 时 anchor 由类型决定：Inspector 不显示 anchor 下拉，导出时一律写这个类型的 anchor
       默认分类的类型 id、档位 id 用可读的英文，UE 侧按它们配置，分类面板里锁定、不能改。策划在编辑器里新建的先用生成的 id，
       在面板里可以改成可读的英文。
       维护规则：UE 侧开始自动生成一个类型（在 StampTypes 里加了它）时，同时给 MVMapEditor 提 PR，把它连同 id 加进这里、
       importMethod 设成 auto。所有地图打开后它就是 auto，id 也锁定了，不用改任何地图文件；忘了提 PR 时，UE 导入汇总会报一行提醒。
       UE 侧按 typeId 读配置的地方：NSProject/Config/DefaultEditor.ini 的 [/Script/NSProjectEditor.NSMVMapImportSettings]，
       ClassByTypeId（structure / edge 生成的类）、StampTypes（stamp 按类型、档位生成的东西）、PlaceholderIconByTypeId（占位图标）。
       manual 类型在 PlaceholderIconByTypeId 里也有图标，所以改 id、删类型之前，不能只看 importMethod。 */
    defaultStampCategories: {
      submenus: [
        { id: "Enemy", label: "敌人" },
      ],
      types: [
        { id: "PlayerStart", label: "出生点", importMethod: "manual", color: "#5ad07a", emoji: "❤️" }, // 玩家出生位置，人工摆放
        { id: "SavePoint", label: "傩公傩母像", importMethod: "auto", color: "#7c879b", emoji: "💾" }, // 存档点，生成 BP_SavePoint
        { id: "Mechanism", label: "机关", importMethod: "manual", color: "#a97af0", emoji: "⚙️" }, // 可交互的机关开关，人工摆放；控制哪个对象目前没有记录
        { id: "MoneyBox", label: "钱盒", importMethod: "auto", color: "#5aa9f0", emoji: "💰",
          tierLabel: "大小", tiers: [{ id: "Small", label: "小" }, { id: "Medium", label: "中" }, { id: "Large", label: "大" }] }, // 生成 BP_LevelFacility_MoneyTree_Small / _Middle / _Large
        { id: "Collectible", label: "收集品", importMethod: "manual", color: "#d84c7a", emoji: "🎁" }, // 收集品，人工摆放
        { id: "JudgeMask", label: "判官面具", importMethod: "manual", color: "#f0dc3a", emoji: "🏆" }, // 判官面具（获得位置），人工摆放
        { id: "Artifact", label: "法器", importMethod: "manual", color: "#e0555f", emoji: "🪄" }, // 法器（获得位置），人工摆放
        { id: "YinYangStatue", label: "阴阳雕像", importMethod: "auto", color: "#f0dc3a", emoji: "🗿",
          tierLabel: "阴阳", tiers: [{ id: "Yin", label: "阴" }, { id: "Yang", label: "阳" }] }, // 生成 BP_LevelFacility_Statue_YinXi / _YangXi
        { id: "BaiLing", label: "白灵", importMethod: "manual", color: "#5ad07a", emoji: "🗨️" }, // 白灵（可对话），人工摆放
        // 敌人：生成刷怪点，房间里另生成一个道中 Arena。anchor 由类型锁定。三个类型各有一份"强弱"（UE 侧各配一份 Tiers）
        { id: "MeleeEnemy", label: "近战", submenu: "Enemy", importMethod: "auto", color: "#5fd8cf", emoji: "👾", anchor: "SnapToGround", anchorLocked: true,
          tierLabel: "强弱", tiers: [{ id: "Weak", label: "弱小" }, { id: "Medium", label: "中等" }, { id: "Elite", label: "精英" }] },
        { id: "RangedEnemy", label: "远程", submenu: "Enemy", importMethod: "auto", color: "#c9885a", emoji: "🏹", anchor: "SnapToGround", anchorLocked: true,
          tierLabel: "强弱", tiers: [{ id: "Weak", label: "弱小" }, { id: "Medium", label: "中等" }, { id: "Elite", label: "精英" }] },
        { id: "FlyingEnemy", label: "飞行", submenu: "Enemy", importMethod: "auto", color: "#b8c0cc", emoji: "🦇", anchor: "FloatInAir", anchorLocked: true,
          tierLabel: "强弱", tiers: [{ id: "Weak", label: "弱小" }, { id: "Medium", label: "中等" }, { id: "Elite", label: "精英" }] },
      ],
    },

    /* stamp 的旧 typeId：加载文件时，typeId 不是这份文档 stampCategories 里的类型、但在这里的元素，按 type / tier 改成对应的
       类型、档位（都是默认分类里的 id）。档位在这份文档的类型里不存在时（比如策划删掉了"中等"），只迁类型、档位留空；
       类型不存在时，元素保留原来的 typeId（显示"未分类"）。没写 type 的项，元素迁成未分类（typeId 为 null），名字保留。
         id    - 旧 typeId，不能和默认分类里的类型 id 重复
         label - （可选）没有 typeId 的旧元素，名字和它完全一致时也这样迁移
       structure / edge 的旧 id 照旧写在上面类型的 oldIds / oldLabels 里。 */
    oldStampIds: [
      { id: "WeakMeleeEnemy", label: "弱小近战敌人", type: "MeleeEnemy", tier: "Weak" },
      { id: "WeakRangedEnemy", label: "弱小远程敌人", type: "RangedEnemy", tier: "Weak" },
      { id: "WeakFlyingEnemy", label: "弱小飞行敌人", type: "FlyingEnemy", tier: "Weak" },
      { id: "MediumMeleeEnemy", label: "中等近战敌人", type: "MeleeEnemy", tier: "Medium" },
      { id: "EliteEnemy", label: "精英怪" }, // 地面还是飞行不知道：迁成未分类，策划看名字选类型和档位
      // MoneyBox、YinYangStatue 的 typeId 没变，不用写：打开后类型不变，档位没选
    ],
  };
});
