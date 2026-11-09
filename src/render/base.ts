/* Whole-cell layer drawing: grid, rooms and their labels, doors, keys, lock ↔ key links. */
import type { View } from "./view.ts";
import type { Room } from "../model/types.ts";
import { CELL, MAJOR } from "../model/constants.ts";
import { S, roomColor, lockById, keyById } from "../state/store.ts";
import { roomBBox, edgeMid } from "../state/rooms.ts";
import { snapTicks } from "../state/snap.ts";
import { TICKS } from "../geom/lattice.ts";
import { FONTF, roundRect } from "./common.ts";
import { clamp, hexA, shade, unck, ck } from "../util.ts";

/** Tools that place off-grid geometry; the grid shows the snap step's sub-lines while one is active. */
const OFF_GRID_TOOLS = new Set(["spaint", "srect", "serase", "edge", "stamp", "note", "key", "select"]);

export function drawGrid(ctx: CanvasRenderingContext2D, V: View, cellPx: number): void {
  const z = V.cam.zoom, step = cellPx * z;
  const left = V.wx(0), top = V.wy(0), right = V.wx(V.w), bottom = V.wy(V.h);
  const x0 = Math.floor(left / cellPx), x1 = Math.ceil(right / cellPx);
  const y0 = Math.floor(top / cellPx), y1 = Math.ceil(bottom / cellPx);

  // sub-cell lines of the snap step, faint, only where they'd be at least 7 px apart
  const sub = snapTicks();
  if (OFF_GRID_TOOLS.has(S.tool) && sub > 1 && sub < TICKS && (step * sub) / TICKS >= 7) {
    const n = TICKS / sub;
    ctx.lineWidth = 1;
    ctx.strokeStyle = "#181d26";
    ctx.beginPath();
    for (let x = x0; x <= x1; x++)
      for (let i = 1; i < n; i++) {
        const px = Math.round(V.sx((x + i / n) * cellPx)) + 0.5;
        ctx.moveTo(px, 0);
        ctx.lineTo(px, V.h);
      }
    for (let y = y0; y <= y1; y++)
      for (let i = 1; i < n; i++) {
        const py = Math.round(V.sy((y + i / n) * cellPx)) + 0.5;
        ctx.moveTo(0, py);
        ctx.lineTo(V.w, py);
      }
    ctx.stroke();
  }

  if (step >= 5) {
    ctx.lineWidth = 1;
    ctx.strokeStyle = "#1e2430";
    ctx.beginPath();
    for (let x = x0; x <= x1; x++) {
      if (x % MAJOR === 0) continue;
      const px = Math.round(V.sx(x * cellPx)) + 0.5;
      ctx.moveTo(px, 0);
      ctx.lineTo(px, V.h);
    }
    for (let y = y0; y <= y1; y++) {
      if (y % MAJOR === 0) continue;
      const py = Math.round(V.sy(y * cellPx)) + 0.5;
      ctx.moveTo(0, py);
      ctx.lineTo(V.w, py);
    }
    ctx.stroke();
  }
  ctx.lineWidth = 1;
  ctx.strokeStyle = "#2b3444";
  ctx.beginPath();
  for (let x = Math.ceil(x0 / MAJOR) * MAJOR; x <= x1; x += MAJOR) {
    const px = Math.round(V.sx(x * cellPx)) + 0.5;
    ctx.moveTo(px, 0);
    ctx.lineTo(px, V.h);
  }
  for (let y = Math.ceil(y0 / MAJOR) * MAJOR; y <= y1; y += MAJOR) {
    const py = Math.round(V.sy(y * cellPx)) + 0.5;
    ctx.moveTo(0, py);
    ctx.lineTo(V.w, py);
  }
  ctx.stroke();

  // origin cross
  ctx.strokeStyle = "#3a4658";
  ctx.beginPath();
  const ox = Math.round(V.sx(0)) + 0.5, oy = Math.round(V.sy(0)) + 0.5;
  ctx.moveTo(ox, 0);
  ctx.lineTo(ox, V.h);
  ctx.moveTo(0, oy);
  ctx.lineTo(V.w, oy);
  ctx.stroke();
}

export function drawRooms(ctx: CanvasRenderingContext2D, V: View): void {
  const z = V.cam.zoom;
  const selRoomId = S.sel && S.sel.type === "room" ? S.sel.id : null;

  for (const room of S.doc.rooms) {
    const col = roomColor(room);
    const cells = room.cells;
    if (!cells.length) continue;
    const set = new Set(cells);
    const isSel = room.id === selRoomId;
    const isActive = room.id === S.activeRoomId;

    ctx.fillStyle = hexA(col, isSel ? 0.4 : 0.26);
    for (const c of cells) {
      const [x, y] = unck(c);
      const px = V.sx(x * CELL), py = V.sy(y * CELL);
      const s = CELL * z;
      if (px > V.w || py > V.h || px + s < 0 || py + s < 0) continue;
      ctx.fillRect(px, py, s + 0.5, s + 0.5);
    }

    // outline only the silhouette edges
    ctx.strokeStyle = isSel ? shade(col, 0.3) : col;
    ctx.lineWidth = isSel ? 2.5 : isActive ? 2 : 1.6;
    ctx.lineCap = "square";
    ctx.beginPath();
    for (const c of cells) {
      const [x, y] = unck(c);
      const L = V.sx(x * CELL), T = V.sy(y * CELL);
      const R = V.sx((x + 1) * CELL), B = V.sy((y + 1) * CELL);
      if (R < 0 || B < 0 || L > V.w || T > V.h) continue;
      if (!set.has(ck(x, y - 1))) { ctx.moveTo(L, T); ctx.lineTo(R, T); }
      if (!set.has(ck(x, y + 1))) { ctx.moveTo(L, B); ctx.lineTo(R, B); }
      if (!set.has(ck(x - 1, y))) { ctx.moveTo(L, T); ctx.lineTo(L, B); }
      if (!set.has(ck(x + 1, y))) { ctx.moveTo(R, T); ctx.lineTo(R, B); }
    }
    ctx.stroke();
  }
}

/** The room cell a corner label sits in: top/bottom-most row, then left/right-most cell of it. */
function roomCorner(room: Room, pos: string): [number, number] {
  let best: [number, number] | null = null;
  for (const c of room.cells) {
    const [x, y] = unck(c);
    if (!best) {
      best = [x, y];
      continue;
    }
    const dy = pos[0] === "t" ? best[1] - y : y - best[1];
    const dx = pos[1] === "l" ? best[0] - x : x - best[0];
    if (dy > 0 || (dy === 0 && dx > 0)) best = [x, y];
  }
  return best!;
}

export function drawRoomLabels(ctx: CanvasRenderingContext2D, V: View): void {
  const z = V.cam.zoom;
  if (z * CELL <= 16) return;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const room of S.doc.rooms) {
    if (room.hideName) continue;
    const b = roomBBox(room);
    if (!b) continue;
    const fs = clamp(Math.round(11 * Math.min(1.4, z)), 9, 15);
    ctx.font = `600 ${fs}px ${FONTF}`;
    const tw = ctx.measureText(room.name).width;
    const w = tw + 8, h = fs + 4, pad = 4;
    // box centre; corners hug a cell the room really owns, so L-shapes keep the label inside
    let bx: number, by: number;
    const pos = room.labelPos;
    if (pos === "tl" || pos === "tr" || pos === "bl" || pos === "br") {
      const [x, y] = roomCorner(room, pos);
      const L = V.sx(x * CELL), T = V.sy(y * CELL), R = V.sx((x + 1) * CELL), B = V.sy((y + 1) * CELL);
      bx = pos[1] === "l" ? L + pad + w / 2 : R - pad - w / 2;
      by = pos[0] === "t" ? T + pad + h / 2 : B - pad - h / 2;
    } else {
      bx = V.sx((b.x0 + b.w / 2) * CELL);
      by = V.sy((b.y0 + b.h / 2) * CELL);
    }
    if (bx < -80 || by < -20 || bx > V.w + 80 || by > V.h + 20) continue;
    ctx.fillStyle = "rgba(10,12,16,0.62)";
    ctx.fillRect(bx - w / 2, by - h / 2, w, h);
    ctx.fillStyle = "#e6ecf6";
    ctx.fillText(room.name, bx, by + 0.5);
  }
}

export function drawDoors(ctx: CanvasRenderingContext2D, V: View): void {
  const z = V.cam.zoom;
  const selId = S.sel && S.sel.type === "door" ? S.sel.id : null;
  const selLock = S.sel && S.sel.type === "lock" ? S.sel.id : null;

  for (const d of S.doc.doors) {
    const m = edgeMid(d);
    const cx = V.sx(m.x), cy = V.sy(m.y);
    if (cx < -30 || cy < -30 || cx > V.w + 30 || cy > V.h + 30) continue;
    const lock = d.lockId ? lockById(d.lockId) : null;
    const along = CELL * z * 0.52; // length along the wall
    const thick = clamp(CELL * z * 0.2, 3, 12); // thickness across the wall

    let fill = "#93a0b4";
    const stroke = "#0e1116";
    if (d.kind === "passage") fill = "#5b6779";
    if (lock) fill = lock.color;
    if (d.kind === "oneway") fill = lock ? lock.color : "#f0a13a";

    const w = d.o === "v" ? thick : along;
    const h = d.o === "v" ? along : thick;
    const highlight = d.id === selId || (selLock && d.lockId === selLock);

    if (highlight) {
      ctx.fillStyle = hexA(lock ? lock.color : "#5aa9f0", 0.3);
      ctx.beginPath();
      ctx.arc(cx, cy, Math.max(w, h) * 0.95, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = fill;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    roundRect(ctx, cx - w / 2, cy - h / 2, w, h, Math.min(3, thick / 2));
    ctx.fill();
    if (z > 0.4) ctx.stroke();

    if (d.kind === "oneway" && z > 0.35) {
      // arrow pointing in the traversable direction
      ctx.fillStyle = "#15181f";
      const s = Math.max(2.5, thick * 0.42);
      ctx.beginPath();
      if (d.o === "v") {
        const dx = d.dir * s;
        ctx.moveTo(cx + dx, cy);
        ctx.lineTo(cx - dx * 0.5, cy - s);
        ctx.lineTo(cx - dx * 0.5, cy + s);
      } else {
        const dy = d.dir * s;
        ctx.moveTo(cx, cy + dy);
        ctx.lineTo(cx - s, cy - dy * 0.5);
        ctx.lineTo(cx + s, cy - dy * 0.5);
      }
      ctx.closePath();
      ctx.fill();
    } else if (lock && z > 0.5) {
      ctx.fillStyle = "rgba(12,14,19,0.85)";
      ctx.beginPath();
      ctx.arc(cx, cy, Math.max(1.5, thick * 0.22), 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

export function drawKeys(ctx: CanvasRenderingContext2D, V: View): void {
  const z = V.cam.zoom;
  const selId = S.sel && S.sel.type === "key" ? S.sel.id : null;
  const selLock = S.sel && S.sel.type === "lock" ? lockById(S.sel.id) : null;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  for (const k of S.doc.keys) {
    const cx = V.sx(k.x * CELL + CELL / 2), cy = V.sy(k.y * CELL + CELL / 2);
    if (cx < -40 || cy < -40 || cx > V.w + 40 || cy > V.h + 40) continue;
    const r = clamp(CELL * z * 0.26, 3, 22);
    const on = k.id === selId || (selLock && selLock.keyIds.includes(k.id));

    if (on) {
      ctx.fillStyle = hexA(k.color, 0.28);
      ctx.beginPath();
      ctx.arc(cx, cy, r * 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = k.color;
    ctx.fill();
    ctx.lineWidth = on ? 2 : 1.2;
    ctx.strokeStyle = on ? "#ffffff" : "rgba(10,12,16,0.8)";
    ctx.stroke();

    if (z > 0.55) {
      ctx.fillStyle = "rgba(10,12,16,0.85)";
      ctx.font = `${Math.round(r * 1.25)}px ${FONTF}`;
      ctx.fillText("✦", cx, cy + r * 0.06);
    }
    if (z > 0.75 && !k.hideName) {
      const fs = clamp(Math.round(10 * Math.min(1.3, z)), 9, 13);
      ctx.font = `500 ${fs}px ${FONTF}`;
      const tw = ctx.measureText(k.name).width;
      ctx.fillStyle = "rgba(10,12,16,0.66)";
      ctx.fillRect(cx - tw / 2 - 3, cy + r + 2, tw + 6, fs + 3);
      ctx.fillStyle = shade(k.color, 0.25);
      ctx.fillText(k.name, cx, cy + r + 2 + fs / 2 + 2);
    }
  }
}

/** Curved dashed links from every key to the doors its lock guards. */
export function drawFlow(ctx: CanvasRenderingContext2D, V: View): void {
  const showAll = S.showFlow;
  let locks = S.doc.locks;
  if (!showAll) {
    const sel = S.sel;
    if (!sel) return;
    if (sel.type === "lock") locks = [lockById(sel.id)].filter((l) => !!l);
    else if (sel.type === "key") locks = S.doc.locks.filter((l) => l.keyIds.includes(sel.id));
    else if (sel.type === "door") {
      const d = S.doc.doors.find((x) => x.id === sel.id);
      locks = d && d.lockId ? [lockById(d.lockId)].filter((l) => !!l) : [];
    } else return;
  }
  if (!locks.length) return;

  ctx.save();
  ctx.lineWidth = clamp(1.6 * V.cam.zoom, 1.1, 3);
  ctx.setLineDash([7, 5]);
  for (const lock of locks) {
    const doors = S.doc.doors.filter((d) => d.lockId === lock.id);
    if (!doors.length) continue;
    ctx.strokeStyle = hexA(lock.color, showAll ? 0.42 : 0.8);
    ctx.fillStyle = hexA(lock.color, showAll ? 0.5 : 0.9);
    for (const kid of lock.keyIds) {
      const k = keyById(kid);
      if (!k) continue;
      const ax = V.sx(k.x * CELL + CELL / 2), ay = V.sy(k.y * CELL + CELL / 2);
      for (const d of doors) {
        const m = edgeMid(d);
        const bx = V.sx(m.x), by = V.sy(m.y);
        const mx = (ax + bx) / 2, my = (ay + by) / 2;
        const nx = -(by - ay), ny = bx - ax;
        const len = Math.hypot(nx, ny) || 1;
        const bow = clamp(len * 0.14, 8, 70);
        const qx = mx + (nx / len) * bow, qy = my + (ny / len) * bow;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.quadraticCurveTo(qx, qy, bx, by);
        ctx.stroke();
        // arrowhead at the door end
        const a = Math.atan2(by - qy, bx - qx);
        const s = 6;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(bx - s * Math.cos(a - 0.42), by - s * Math.sin(a - 0.42));
        ctx.lineTo(bx - s * Math.cos(a + 0.42), by - s * Math.sin(a + 0.42));
        ctx.closePath();
        ctx.fill();
        ctx.setLineDash([7, 5]);
      }
    }
  }
  ctx.restore();
}
