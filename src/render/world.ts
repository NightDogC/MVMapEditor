/* World canvas: draw order, pencil ink, tool cursors, the render loop. */
import { makeView, resizeCanvas, type View } from "./view.ts";
import { drawGrid, drawRooms, drawRoomLabels, drawDoors, drawKeys, drawFlow } from "./base.ts";
import { drawStructures, drawEdgeStructs, drawStructLabels, drawStamps, drawManualMarks, strokeSegs, drawEmoji } from "./layers.ts";
import { drawNotes } from "./notes.ts";
import { MARK_FADE, roundRect, edgeThickness } from "./common.ts";
import { CELL, STRUCT_COLORS } from "../model/constants.ts";
import { TICKS } from "../geom/lattice.ts";
import { S, app, activeRoom, activeArea, activeStruct, activeEdgeStruct, activeStamp, roomColor, structColor } from "../state/store.ts";
import { edgeMid } from "../state/rooms.ts";
import { penBox } from "../state/pencil.ts";
import { snapTicks, brushTicks, snapPoint, snapSquare, snapBox } from "../state/snap.ts";
import { dragRect } from "../tools/shapes.ts";
import { drawDetail } from "../ui/detail.ts";
import { $, hexA, clamp } from "../util.ts";

export const worldCanvas = $<HTMLCanvasElement>("#world");
export const wctx = worldCanvas.getContext("2d")!;
export const worldView = (): View => makeView(S.cam, app.VW, app.VH);

function tracePencil(ctx: CanvasRenderingContext2D, V: View, pts: number[]): void {
  const n = pts.length / 2;
  ctx.beginPath();
  ctx.moveTo(V.sx(pts[0]), V.sy(pts[1]));
  // a single click leaves a dot: round caps on a hair-length segment
  if (n === 1) {
    ctx.lineTo(V.sx(pts[0]) + 0.01, V.sy(pts[1]));
    return;
  }
  for (let i = 1; i < n - 1; i++) {
    const x = V.sx(pts[2 * i]), y = V.sy(pts[2 * i + 1]);
    const nx = V.sx(pts[2 * i + 2]), ny = V.sy(pts[2 * i + 3]);
    ctx.quadraticCurveTo(x, y, (x + nx) / 2, (y + ny) / 2);
  }
  ctx.lineTo(V.sx(pts[2 * n - 2]), V.sy(pts[2 * n - 1]));
}
function drawPencil(ctx: CanvasRenderingContext2D, V: View): void {
  const z = V.cam.zoom;
  const left = V.wx(0), top = V.wy(0), right = V.wx(V.w), bottom = V.wy(V.h);
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const st of S.doc.pencil) {
    const b = penBox(st), m = st.size;
    if (b.x1 + m < left || b.x0 - m > right || b.y1 + m < top || b.y0 - m > bottom) continue;
    ctx.strokeStyle = st.color;
    ctx.lineWidth = Math.max(0.75, st.size * z);
    tracePencil(ctx, V, st.pts);
    ctx.stroke();
  }
  ctx.restore();
}

/** Tick point -> screen. */
const tsx = (V: View, t: number) => V.sx((t / TICKS) * CELL);
const tsy = (V: View, t: number) => V.sy((t / TICKS) * CELL);

function dashedBox(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, col: string, fill?: string): void {
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fillRect(x, y, w, h);
  }
  ctx.strokeStyle = col;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 3]);
  ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
  ctx.setLineDash([]);
}

function drawCursor(ctx: CanvasRenderingContext2D, V: View): void {
  const z = V.cam.zoom, s = CELL * z;
  const hp = S.hoverPt;
  const d = S.drag;
  if ((S.tool === "pencil" || S.tool === "perase") && hp && !S.spaceDown) {
    const erasing = S.tool === "perase" || (d && d.type === "perase");
    const cx = V.sx(hp.x), cy = V.sy(hp.y);
    ctx.save();
    ctx.beginPath();
    if (erasing) {
      ctx.arc(cx, cy, Math.max(2, (S.pencil.eraser / 2) * z), 0, Math.PI * 2);
      ctx.fillStyle = "rgba(224,85,95,0.12)";
      ctx.fill();
      ctx.setLineDash([3, 3]);
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = "#ffd7d9";
      ctx.stroke();
    } else {
      ctx.arc(cx, cy, Math.max(1.5, (S.pencil.size / 2) * z), 0, Math.PI * 2);
      ctx.fillStyle = hexA(S.pencil.color, 0.55);
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = "rgba(255,255,255,0.7)";
      ctx.stroke();
    }
    ctx.restore();
    return;
  }
  if (S.spaceDown || S.tool === "pan") return;

  // edge segment being drawn
  if (d && d.type === "edgeline") {
    const es = d.fresh ? null : activeEdgeStruct();
    ctx.save();
    ctx.lineCap = "round";
    ctx.strokeStyle = hexA(es ? structColor(es) : "#5aa9f0", 0.75);
    ctx.lineWidth = edgeThickness(z) + 2;
    strokeSegs(ctx, V, [{ x1: d.a.x, y1: d.a.y, x2: d.b.x, y2: d.b.y }]);
    ctx.fillStyle = "#ffffff";
    for (const p of [d.a, d.b]) {
      ctx.beginPath();
      ctx.arc(tsx(V, p.x), tsy(V, p.y), 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    return;
  }
  // structure rectangle being dragged
  if (d && d.type === "srect") {
    const r = dragRect(d.a, d.b, d.step);
    if (!r) return;
    const col = d.erase ? "#e0555f" : structColor(d.st);
    const x = tsx(V, r.x), y = tsy(V, r.y), w = tsx(V, r.x + r.w) - x, h = tsy(V, r.y + r.h) - y;
    ctx.fillStyle = hexA(col, 0.22);
    ctx.strokeStyle = col;
    ctx.lineWidth = 1.5;
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    return;
  }
  // room rectangle being dragged (whole cells)
  if (d && d.type === "rect") {
    const a = d.a, b = d.b;
    const x0 = Math.min(a.x, b.x), y0 = Math.min(a.y, b.y);
    const x1 = Math.max(a.x, b.x), y1 = Math.max(a.y, b.y);
    const px = V.sx(x0 * CELL), py = V.sy(y0 * CELL);
    const room = activeRoom();
    const col = d.erase ? "#e0555f" : room ? roomColor(room) : activeArea().color;
    ctx.fillStyle = hexA(col, 0.22);
    ctx.strokeStyle = col;
    ctx.lineWidth = 1.5;
    ctx.fillRect(px, py, (x1 - x0 + 1) * s, (y1 - y0 + 1) * s);
    ctx.strokeRect(px + 0.5, py + 0.5, (x1 - x0 + 1) * s - 1, (y1 - y0 + 1) * s - 1);
    return;
  }
  if (S.tool === "door" && S.hoverEdge) {
    const e = S.hoverEdge;
    const m = edgeMid(e);
    const cx = V.sx(m.x), cy = V.sy(m.y);
    const along = s * 0.52, thick = clamp(s * 0.2, 3, 12);
    ctx.fillStyle = "rgba(90,169,240,0.55)";
    const w = e.o === "v" ? thick : along, h = e.o === "v" ? along : thick;
    roundRect(ctx, cx - w / 2, cy - h / 2, w, h, 2);
    ctx.fill();
    return;
  }
  if (!hp || S.tool === "select") return;

  // off-grid tools: show where the click would land
  if (S.tool === "edge") {
    const p = snapPoint(hp.x, hp.y);
    const es = activeEdgeStruct();
    ctx.beginPath();
    ctx.arc(tsx(V, p.x), tsy(V, p.y), clamp(edgeThickness(z) * 0.7, 3, 6), 0, Math.PI * 2);
    ctx.fillStyle = hexA(es ? structColor(es) : "#5aa9f0", 0.85);
    ctx.fill();
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = "#ffffff";
    ctx.stroke();
    return;
  }
  if (S.tool === "spaint" || S.tool === "serase" || S.tool === "srect") {
    const step = S.tool === "srect" ? snapTicks() : brushTicks();
    const sq = snapSquare(hp.x, hp.y, step === 1 ? 1 : step);
    const st = activeStruct();
    const col = S.tool === "serase" ? "#e0555f" : st ? structColor(st) : STRUCT_COLORS[S.doc.structures.length % STRUCT_COLORS.length];
    if (step === 1) {
      // free rectangle: a crosshair at the exact corner
      const x = tsx(V, sq.x), y = tsy(V, sq.y);
      ctx.strokeStyle = col;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(x - 6, y);
      ctx.lineTo(x + 6, y);
      ctx.moveTo(x, y - 6);
      ctx.lineTo(x, y + 6);
      ctx.stroke();
      return;
    }
    const x = tsx(V, sq.x), y = tsy(V, sq.y);
    dashedBox(ctx, x, y, tsx(V, sq.x + step) - x, tsy(V, sq.y + step) - y, col);
    return;
  }
  if (S.tool === "stamp" || S.tool === "note" || S.tool === "key") {
    const b = snapBox(hp.x, hp.y);
    const x = tsx(V, b.x), y = tsy(V, b.y);
    let col = S.tool === "key" ? "#f0dc3a" : "#f0dc3a";
    if (S.tool === "stamp") {
      const st = activeStamp();
      col = st ? structColor(st) : "#f0dc3a";
      if (st && s >= 5) {
        ctx.save();
        ctx.globalAlpha = 0.45;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "#ffffff";
        drawEmoji(ctx, st.emoji, x, y, s);
        ctx.restore();
      }
    }
    dashedBox(ctx, x, y, s, s, col);
    return;
  }
  // whole-cell tools
  if (!S.hoverCell) return;
  const px = V.sx(S.hoverCell.x * CELL), py = V.sy(S.hoverCell.y * CELL);
  const room = activeRoom();
  const col = S.tool === "erase" ? "#e0555f" : room ? roomColor(room) : activeArea().color;
  dashedBox(ctx, px, py, s, s, col);
}

export interface DrawOpts {
  bg?: string;
  grid?: boolean;
  labels?: boolean;
  cursor?: boolean;
}
export function drawWorld(ctx: CanvasRenderingContext2D, V: View, opts: DrawOpts = {}): void {
  ctx.save();
  ctx.fillStyle = opts.bg || "#12151b";
  ctx.fillRect(0, 0, V.w, V.h);
  if (opts.grid !== false) drawGrid(ctx, V, CELL);
  drawRooms(ctx, V);
  if (S.showStructs) {
    drawStructures(ctx, V);
    drawEdgeStructs(ctx, V);
  }
  if (opts.labels !== undefined ? opts.labels : S.showLabels) drawRoomLabels(ctx, V);
  if (S.showStructs && S.showStructLabels) drawStructLabels(ctx, V);
  // rooms stay at full strength as the frame of reference; locks, keys and notes fade with generated elements
  const fade = S.highlightManual ? MARK_FADE : 1;
  ctx.globalAlpha = fade;
  drawFlow(ctx, V);
  drawDoors(ctx, V);
  drawKeys(ctx, V);
  ctx.globalAlpha = 1;
  if (S.showStructs) {
    drawStamps(ctx, V);
    drawManualMarks(ctx, V);
  }
  ctx.globalAlpha = fade;
  if (S.showPencil) drawPencil(ctx, V);
  if (S.showNotes) drawNotes(ctx, V);
  ctx.globalAlpha = 1;
  if (opts.cursor !== false) drawCursor(ctx, V);
  ctx.restore();
}

export function frame(): void {
  if (app.needsDraw) {
    app.needsDraw = false;
    if (!S.detailRoomId) {
      const [w, h] = resizeCanvas(worldCanvas, wctx);
      app.VW = w;
      app.VH = h;
      drawWorld(wctx, makeView(S.cam, w, h), {});
      $("#hud-zoom").textContent = Math.round(S.cam.zoom * 100) + "%";
    } else {
      drawDetail();
    }
  }
  requestAnimationFrame(frame);
}
