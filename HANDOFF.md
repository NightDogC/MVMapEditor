# HANDOFF：Structure 负空间（`structures[].cuts`）、Stamp 逐个实例的 Notes（`points[].notes`）

> 这份文件写给负责 NSProject「NS MVMap Import」导入器的同学。导入器能读 `cuts`、也处理好了下面第二部分的 stamp notes 以后，请删掉本文件，再向 `main` 提 Pull Request。

本文件有两部分：**一、Structure 负空间**；**二、Stamp 的 Notes 改为每个实例一份**。两处改动都向后兼容，文件版本仍是 `version: 2`。

---

# 一、Structure 负空间（`structures[].cuts`）

## 现状

- 编辑器新增了 **S-Neg（负空间）工具**，快捷键 `G`。用法是在网格上依次点出多边形的顶点，再点回第一个点，多边形就闭合了。闭合后，这个多边形覆盖到的部分会从**当前 active 的 Structure** 里挖掉，用来做斜坡、坡道这类矩形画不出来的形状。
- 这项功能已经在 `main` 上线（<https://nightdogc.github.io/MVMapEditor/>）。文件格式仍是 `version: 2`，只给 Structure 加了一个**可选字段** `cuts`。
- **旧导入器不会报错，但会导出错误的形状。** 它不认识 `cuts`，会直接忽略，于是导进 UE 的 Structure 是没挖过的完整矩形，斜坡的位置还是实心的。
- 完整的格式说明见 [README.md](README.md) 的 *File format → Structure cuts*。
- 示例文件 [docs/sample-v2.mvmap.json](docs/sample-v2.mvmap.json) 里的 `struct_ground`（地形）已经带了一个三角形 cut：底部长条的右端被切成了斜坡。

## 格式

```jsonc
{ "id": "struct_ground", "name": "地形", "typeId": "Landscape", "color": "#7c879b", "notes": "",
  "rects": [ { "x": 0, "y": 2.5, "w": 4, "h": 0.5 } ],
  "cuts":  [ [ { "x": 3, "y": 2.5 }, { "x": 4, "y": 2.5 }, { "x": 4, "y": 3 } ] ] }
```

**语义**：Structure 的实心区域 = 所有 `rects` 的并集 − 所有 `cuts` 的并集。

### 编辑器对 `cuts` 的保证

| 项 | 说明 |
|---|---|
| 字段 | 可选。没有 cut 的 Structure **不写**这个字段，1.x 和旧版 2.0 的文件都不受影响 |
| 形状 | 每个 cut 是一个**简单多边形**：不自交，也不自己碰到自己。至少 3 个顶点；首尾隐式相连，第一个点不会在末尾重复 |
| 顶点顺序 | 在 x 向右、y 向下的地图坐标里有向面积为正，也就是**屏幕上顺时针**。UE 里如果把 y 翻成向上，就变成逆时针 |
| 作用范围 | 只挖它所属的那个 Structure，不影响别的 Structure，也不影响 Room |
| 一定有斜边 | 多边形里沿网格的那部分，编辑器已经直接从 `rects` 里扣掉了。纯轴对齐的多边形（例如矩形缺口）不会出现在 `cuts` 里，只体现在 `rects` 上 |
| 一定有效 | 每个 cut 都和本 Structure 的 `rects` 有正面积的重叠。不再挖到任何东西的 cut 会被自动删掉 |
| 可能超出 | cut 可能伸到 `rects` 外面，超出的部分没有意义。用户画多边形时常会画得比结构大一圈 |
| 可能重叠 | 同一个 Structure 的多个 cut 之间可能互相重叠，也可能边贴边。后一种情况是补画或移动时一个 cut 被矩形边裁开留下的碎片。做"减去并集"就不会有问题 |
| 坐标 | 单位和 `rects` 一样，都是格。用户点出来的顶点在 1/96 格点上。被矩形边裁出来的顶点有一个坐标正好在那条边上，另一个坐标可能是任意值（保留 4 位小数），**不要假设所有顶点都在格点上** |
| 连通片 | 仍然只按 `rects` 计算。一个 cut 把一片斜着切成两块时，编辑器里还是算一片。manual 占位标记的规则不变 |

### 编辑器里会改变 `cuts` 的操作

下面这些操作的结果都满足上表的保证，导入器不需要关心。列出来只是方便你在编辑器里造测试数据。

- **S-Neg 闭合多边形**：多边形沿网格的部分从 `rects` 里扣掉；如果有斜边还挖到了东西，再把整个多边形追加到 `cuts`。
- **在 cut 区域上补画**（S-Paint / S-Rect / 粘贴）：被画到的地方恢复成实心，cut 会被矩形边裁开，变成一块或几块。
- **擦除，或被别的 Structure 占走面积**：不再挖到东西的 cut 会被删掉。
- **移动一片、复制粘贴、跟随 Room 移动**：cut 会跟着走。如果 cut 伸出了被移动的那部分，带走的是裁到那部分以内的碎片。

## 导入器需要改的地方

1. **Landscape（BP_Ground）、DamageTerrain 等按 `rects` 生成的类型**：如果某个 Structure 有 `cuts`，生成出来的东西要扣掉这些多边形。以下几种做法都行，按你们的管线选：
   - **几何布尔**：先照旧按 `rects` 生成盒体，再把每个 cut 按厚度挤出成棱柱，做 Subtract。例如 Geometry Script 的 `ApplyMeshBoolean`，或 BSP 的 Subtractive Brush。cut 是简单多边形，挤出前可以直接三角化（ear clipping）。
   - **先算出最终的二维形状**：对每个 rect 依次减去和它相交的 cut，可以用 Clipper2 一类的多边形库，得到一组多边形后再挤出成网格。编辑器里有现成的思路可以参考：[src/geom/poly.ts](src/geom/poly.ts) 的 `clipRect`、`subtractRect`（沿轴对齐直线切开，输出互不相连的多个多边形，不会产生零宽桥）。
   - **只能放盒子的类型**：如果某类型在 UE 里只能用 Box Actor，可以先只为没有 cut 的 rect 照旧生成，被 cut 挖到的 rect 退化成阶梯近似或标成 manual。具体怎么处理由你决定，但别直接忽略 cut，否则斜坡会是实心的。
2. **JumpOffPlatform（EdgeStruct）、Stamp、Room、子关卡、MapVolume、门**：都不变。
3. 用 `docs/sample-v2.mvmap.json` 和一张实际画了斜坡的地图验证：斜坡处要是空的，其余部分和原来一样。

## 参考（第一部分）

- 数据结构：[src/model/types.ts](src/model/types.ts)（`Structure.cuts`）、[src/model/doc.ts](src/model/doc.ts)（`setCutsT`、加载时的 `cleanCuts`）
- 几何：[src/geom/poly.ts](src/geom/poly.ts)，测试在 [test/poly.test.mts](test/poly.test.mts)
- 编辑器里的面积已经扣掉了 cut（`solidArea`），可以拿来对照导入后的体积

---

# 二、Stamp 的 Notes 改为每个实例一份（`stamps[].points[].notes`）

## 现状

- 以前 Notes 是整个 Stamp（同一个名字、emoji、类型的那一组）共用的一段文字，存在 `stamps[].notes`。
- 现在 Notes 属于**每个放置出来的实例**，存在该点上：`stamps[].points[].notes`。在编辑器里用 Select 点中地图上的某一个实例，Inspector 里写的就是这一个实例的 Notes；有 Notes 的实例右上角会显示一个小黄点。
- `stamps[].notes` 字段**仍然存在，但编辑器不再写入**，正常情况下恒为 `""`。

```jsonc
{ "id": "stamp_m1", "name": "Save Point", "emoji": "💾", "color": "#5aa9f0",
  "notes": "", "typeId": "SavePoint", "anchor": "SnapToGround",
  "points": [ { "id": "pt_a1", "x": 6, "y": 4, "notes": "Before the boss" },
              { "id": "pt_a2", "x": 9.25, "y": 2.5 } ] }
```

## 编辑器的保证

| 项 | 说明 |
|---|---|
| 字段 | `points[].notes` 可选，字符串。空的不写，所以**没有这个字段 = 没有 Notes** |
| 跟随 | 拖动实例、跟随 Room 移动时 Notes 跟着走（点的 `id` 也不变）；复制粘贴出的新实例带着同样的 Notes，但 `id` 是新的 |
| 旧文件 | 加载旧文件时，`stamps[].notes` 非空的 Stamp 会把这段文字复制给它**每个还没有自己 Notes 的点**，然后把 `stamps[].notes` 清成 `""`。所以存过一次的文件里，Notes 只出现在点上 |
| 例外 | 一个点都没放的 Stamp 会保留旧的 `stamps[].notes`（没地方放），放下第一个点时这段文字会转到那个点上。导出文件里这种 Stamp 没有实例，可以忽略 |

## 导入器需要改的地方

- 如果导入器**用到了** Stamp 的 Notes（例如写进生成 Actor 的描述、Tag 或某个属性），请改为按点读取 `point.notes`（缺省视为空），写到这个点生成的那一个 Actor 上，而不是同一 Stamp 的所有 Actor 共用 `stamp.notes`。
- 如果导入器从没读过 Notes，这一部分**无需改动**。新字段是附加的，旧导入器读新文件不会出错。
- 示例文件 [docs/sample-v2.mvmap.json](docs/sample-v2.mvmap.json) 里 `stamp_start`（出生点）的那个点带了 `notes`，可以拿来测试。

---

## 完成后

1. 导入器能读 `cuts`，并用示例文件和实际地图验证通过。
2. 如果导入器用到了 Stamp 的 Notes，已改为按点读取 `points[].notes`。
3. 删除本文件 `HANDOFF.md`，向 `main` 提 PR。
