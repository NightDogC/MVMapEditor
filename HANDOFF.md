# HANDOFF：UE 白盒导入器适配 MVMap 2.0（导出格式 version 2）

> 给负责 NSProject「NS MVMap Import」导入器的同学。导入器适配完成后，**删除本文件**，从 `v2` 向 `main` 提 Pull Request；合并后 2.0 成为主线，由仓库主人打 `v2.0.0` tag。

## 现状

- 2.0 在 `v2` 分支开发，暂不并入 `main`。`main` 和 `v1` 分支仍是 1.x（v1.6.0）。
- 在线预览：<https://nightdogc.github.io/MVMapEditor/next/>（`v2` 每次 push 自动部署）。1.x 照旧在 <https://nightdogc.github.io/MVMapEditor/>。
- 设计决定见 [docs/2.0-design.md](docs/2.0-design.md)，完整格式说明见 [README.md](README.md) 的 *File format* 一节。
- 示例导出文件：[docs/sample-v2.mvmap.json](docs/sample-v2.mvmap.json)，包含小数矩形、斜线平台和非整格的图章。

## 变了什么

Room 和门仍按整格吸附，数据和 1.x 完全相同。Structure、EdgeStruct、Stamp、Note、Key 改为可以不对齐格子，按可调精度吸附：1、½、⅓、¼、⅙、⅛ 或自由。

| 字段 | 1.x（`version: 1`） | 2.0（`version: 2`） |
|---|---|---|
| `structures[].` | `cells: ["x,y", …]` | `rects: [{ x, y, w, h }, …]` |
| `edgeStructs[].` | `edges: ["h:x,y" / "v:x,y", …]` | `segs: [{ x1, y1, x2, y2 }, …]` |
| `stamps[].` | `cells: ["x,y", …]` | `points: [{ x, y }, …]` |
| `keys[]` / `notes[]` 的 `x, y` | 整数格 | 可以是小数 |
| `rooms`、`doors`、`areas`、`typeId`、`region`、`letter`、`number` 等 | — | 不变 |

`mvmap-types.js`、`mvmap-ue.js` 的 API 和行为都没变：`buildExportDoc` 照旧补齐 region、letter、number，并去掉无效的 typeId。

### 坐标

- 单位是**格**，原点和轴向与 Room 的 `"x,y"` 格子相同：x 向右，y 向下。例如 `x: 3.5` 就是第 3 列格子的正中间。
- 所有值都落在 **1/96 格**的格点上，写入文件时最多保留 4 位小数，⅓ 写成 `0.3333`。需要精确值时，用 `round(v * 96) / 96` 还原。首尾相接的两个矩形在文件里的坐标完全一致，不会出现缝隙或重叠。
- 换算到 UE：`UE 坐标 = 值 × 每格 UE 单位`，和 1.x 用格子编号乘格宽的方式一样，只是现在的值可能带小数。

### Structure：`rects`

- 都是轴对齐矩形，**互不重叠**，同一图层里不同 Structure 之间也不重叠。
- 编辑器已经整理成规范分解：先按 y 切成横带，每条横带里的 x 区间取最长连续段，再把上下相邻且 x 区间完全相同的段竖向合并。导入器**可以直接按矩形生成**，不用再自己合并格子。如果想要更少的 actor，也可以在这个基础上继续合并。
- 连通片的定义：两个矩形有一段正长度的公共边才算相连，只碰到角不算。编辑器里 Select 选中和移动的就是一片。

### EdgeStruct：`segs`

- 线段可以是**任意角度**。端点在吸附格点上，存储方向统一为从左到右；竖直线段从上到下。
- 同一个 EdgeStruct 内，共线并且相接或重叠的线段已经合并，相当于 1.x「连续的边合并」的结果。不同 EdgeStruct 之间不会共线重叠，但可以交叉。
- 连通片的定义：有公共点（相交或端点相接）就算相连。

### Stamp / Key / Note：`{ x, y }`

- 表示它所占的 1×1 格方框的**左上角**，**中心是 `(x + 0.5, y + 0.5)`**。1.x 的格子 `"6,4"` 对应 `{ x: 6, y: 4 }`，中心不变。
- 同一个精确位置最多只有一个 Stamp。

## 导入器需要改的地方

1. **识别版本**：读 `version`。是 2 就走新路径；是 1（或没有这个字段）的旧文件，可以继续走旧路径，也可以要求先用 2.0 编辑器打开再导出一次（2.0 会自动转换）。
2. **Landscape（BP_Ground）/ DamageTerrain**：直接读 `rects`，每个矩形对应一个体积，位置和尺寸可能是小数。原来"格子 → 矩形合并"那一步可以去掉或保留，结果都是正确的。
3. **JumpOffPlatform**：读 `segs`。每段的中点作为位置，`hypot(dx, dy)` 作为长度，`atan2(dy, dx)` 作为旋转角。注意地图的 y 向下，换算到 UE 时要按项目约定翻转。原来"连续格边合并"那一步已经由编辑器完成。
4. **manual 类型的占位标记**：
   - Structure 和 EdgeStruct 按**连通片**各放一个标记，规则同上。编辑器在地图上把徽章画在片的最左上角，导入器可以用片的包围盒中心或其他约定。
   - Stamp 每个 `points` 放一个，用中心点 `(x + 0.5, y + 0.5)`。
5. **Room / 子关卡 / MapVolume / 门**：不变。如果导入器读 `keys` 的位置，现在可能是小数，同样取中心 `(x + 0.5, y + 0.5)`。
6. 未知 `typeId` 的处理方式不变。

## 其他

- 工程现在是 Vite + TypeScript：`npm install`，`npm run dev` 启动，`npm test` 跑测试（需要 Node 22.18 或更高）。原有的词表和 UE 测试照常运行。
- `export_mvmap_stamp_icons.py` 原来从 `index.html` 读取 stamp 的字体写法，现在改为从 `src/` 下的 `.ts` 文件读取，写法本身没变。用法不变。
- 词表仍然只改根目录的 `mvmap-types.js`。

## 完成后

1. 导入器适配好，用 `docs/sample-v2.mvmap.json` 和实际地图验证通过。
2. 删除本文件 `HANDOFF.md`，提交到 `v2`。
3. 提 PR：`v2` → `main`。合并后 Pages 会自动把根地址部署成 2.0。
