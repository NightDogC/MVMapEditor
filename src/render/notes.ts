/* Notes: marker, expand/collapse button, the open text box; shared layout for drawing and hit-testing. */
import type { View } from "./view.ts";
import type { Note } from "../model/types.ts";
import { CELL, NOTE_BOX_W, NOTE_COLORS } from "../model/constants.ts";
import { S } from "../state/store.ts";
import { FONTF, roundRect } from "./common.ts";
import { clamp, hexA, shade } from "../util.ts";

/** Break `text` into lines no wider than `maxW` (ctx.font must be set); handles CJK and long words. */
export function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxW: number, maxLines: number): string[] {
  const out: string[] = [];
  for (const para of String(text).split("\n")) {
    let line = "", lastSpace = -1;
    for (const ch of Array.from(para)) {
      const next = line + ch;
      if (ctx.measureText(next).width <= maxW || !line) {
        line = next;
        if (/\s/.test(ch)) lastSpace = line.length;
        continue;
      }
      if (lastSpace > 0 && !/\s/.test(ch)) {
        out.push(line.slice(0, lastSpace).trimEnd());
        line = line.slice(lastSpace) + ch;
      } else {
        out.push(line.trimEnd());
        line = /\s/.test(ch) ? "" : ch;
      }
      lastSpace = -1;
      if (out.length >= maxLines) break;
    }
    if (out.length >= maxLines) break;
    out.push(line);
  }
  if (out.length > maxLines) out.length = maxLines;
  return out;
}

interface Circle {
  cx: number;
  cy: number;
  r: number;
}
interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
  headH: number;
  lh: number;
  padX: number;
  body: string[] | null;
  btn: Circle;
}
export interface NoteGeom {
  s: number;
  px: number;
  py: number;
  marker: { x: number; y: number; w: number; h: number };
  btn?: Circle;
  box?: Box;
}

/** Screen-space layout of a note: its marker, the expand button, and (when open) the text box. */
export function noteGeom(ctx: CanvasRenderingContext2D, V: View, n: Note): NoteGeom {
  const s = CELL * V.cam.zoom;
  const px = V.sx(n.x * CELL), py = V.sy(n.y * CELL);
  const pad = Math.max(1, s * 0.14);
  const g: NoteGeom = { s, px, py, marker: { x: px + pad, y: py + pad, w: s - pad * 2, h: s - pad * 2 } };
  if (s >= 12) {
    const r = clamp(s * 0.16, 5.5, 9);
    g.btn = { cx: px + s - r * 0.35, cy: py + r * 0.35, r };
  }
  if (n.expanded) {
    const W = NOTE_BOX_W, padX = 10, headH = 24, lh = 16;
    ctx.font = `12px ${FONTF}`;
    const body = n.text.trim() ? wrapLines(ctx, n.text, W - padX * 2, 40) : null;
    const h = headH + (body ? body.length * lh : lh) + 10;
    const off = n.box || { dx: 0, dy: 0 };
    const x = px + s + 8 + off.dx, y = py + off.dy;
    g.box = { x, y, w: W, h, headH, lh, padX, body, btn: { cx: x + W - 13, cy: y + headH / 2, r: 8 } };
  }
  return g;
}
const inCircle = (c: Circle | undefined, x: number, y: number) => !!c && Math.hypot(x - c.cx, y - c.cy) <= c.r + 2;
const inRect = (r: { x: number; y: number; w: number; h: number } | undefined, x: number, y: number) =>
  !!r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

/** The note part under a screen point: expand/collapse button, open text box, or marker. */
export function noteHit(ctx: CanvasRenderingContext2D, V: View, sx: number, sy: number): { note: Note; part: "toggle" | "box" | "cell" } | null {
  if (!S.showNotes) return null;
  const notes = S.doc.notes;
  const geoms = notes.map((n) => noteGeom(ctx, V, n));
  // later notes are drawn on top, so test them first; open boxes sit above every marker
  for (let i = notes.length - 1; i >= 0; i--) {
    const b = geoms[i].box;
    if (!b) continue;
    if (inCircle(b.btn, sx, sy)) return { note: notes[i], part: "toggle" };
    if (inRect(b, sx, sy)) return { note: notes[i], part: "box" };
  }
  for (let i = notes.length - 1; i >= 0; i--) if (inCircle(geoms[i].btn, sx, sy)) return { note: notes[i], part: "toggle" };
  for (let i = notes.length - 1; i >= 0; i--) {
    const g = geoms[i];
    if (sx >= g.px && sx < g.px + g.s && sy >= g.py && sy < g.py + g.s) return { note: notes[i], part: "cell" };
  }
  return null;
}

function drawToggle(ctx: CanvasRenderingContext2D, c: Circle, col: string, open: boolean): void {
  ctx.beginPath();
  ctx.arc(c.cx, c.cy, c.r, 0, Math.PI * 2);
  ctx.fillStyle = "#12151b";
  ctx.fill();
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = col;
  ctx.stroke();
  const a = c.r * 0.5;
  ctx.beginPath();
  ctx.moveTo(c.cx - a, c.cy);
  ctx.lineTo(c.cx + a, c.cy);
  if (!open) {
    ctx.moveTo(c.cx, c.cy - a);
    ctx.lineTo(c.cx, c.cy + a);
  }
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = "#e6ecf6";
  ctx.stroke();
}

export function drawNotes(ctx: CanvasRenderingContext2D, V: View): void {
  const selId = S.sel && S.sel.type === "note" ? S.sel.id : null;
  const geoms = S.doc.notes.map((n) => [n, noteGeom(ctx, V, n)] as const);
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  // markers and their labels
  for (const [n, g] of geoms) {
    const { s, px, py, marker: m } = g;
    if (px > V.w + 260 || py > V.h || px + s < 0 || py + s + 20 < 0) continue;
    const col = n.color || NOTE_COLORS[0];
    const fold = Math.min(m.w, m.h) * 0.3;
    ctx.beginPath();
    ctx.moveTo(m.x, m.y);
    ctx.lineTo(m.x + m.w, m.y);
    ctx.lineTo(m.x + m.w, m.y + m.h - fold);
    ctx.lineTo(m.x + m.w - fold, m.y + m.h);
    ctx.lineTo(m.x, m.y + m.h);
    ctx.closePath();
    ctx.fillStyle = hexA(col, 0.92);
    ctx.fill();
    ctx.lineWidth = n.id === selId ? 2.2 : 1;
    ctx.strokeStyle = n.id === selId ? "#ffffff" : "rgba(10,12,16,0.75)";
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(m.x + m.w, m.y + m.h - fold);
    ctx.lineTo(m.x + m.w - fold, m.y + m.h - fold);
    ctx.lineTo(m.x + m.w - fold, m.y + m.h);
    ctx.closePath();
    ctx.fillStyle = shade(col, -0.22);
    ctx.fill();
    if (s >= 14) {
      ctx.strokeStyle = "rgba(10,12,16,0.55)";
      ctx.lineWidth = Math.max(1, s * 0.035);
      ctx.beginPath();
      for (let i = 1; i <= 3; i++) {
        const ly = m.y + (m.h * i) / 4.4;
        ctx.moveTo(m.x + m.w * 0.18, ly);
        ctx.lineTo(m.x + m.w * (i === 3 ? 0.5 : 0.82), ly);
      }
      ctx.stroke();
    }
    if (g.btn) drawToggle(ctx, g.btn, col, n.expanded);
    if (!n.hideName && n.name && s > 12) {
      const fs = clamp(Math.round(9.5 * Math.min(1.3, V.cam.zoom)), 8, 12);
      ctx.font = `600 ${fs}px ${FONTF}`;
      const tw = ctx.measureText(n.name).width;
      ctx.fillStyle = "rgba(10,12,16,0.75)";
      ctx.fillRect(px + s / 2 - tw / 2 - 3, py + s + 1, tw + 6, fs + 3);
      ctx.fillStyle = shade(col, 0.2);
      ctx.fillText(n.name, px + s / 2, py + s + 1 + fs / 2 + 1.5);
    }
  }
  // open text boxes above everything else
  ctx.textAlign = "left";
  for (const [n, g] of geoms) {
    const b = g.box;
    if (!b || b.x > V.w || b.y > V.h || b.x + b.w < 0 || b.y + b.h < 0) continue;
    const col = n.color || NOTE_COLORS[0];
    const isSel = n.id === selId;
    // tail from the marker to the box
    ctx.strokeStyle = hexA(col, 0.7);
    ctx.lineWidth = 1.2;
    const mx = g.px + g.s / 2, my = g.py + g.s / 2;
    const tx = clamp(mx, b.x, b.x + b.w), ty = clamp(my, b.y, b.y + b.h);
    if (tx !== mx || ty !== my) {
      ctx.beginPath();
      ctx.moveTo(mx, my);
      ctx.lineTo(tx, ty);
      ctx.stroke();
    }
    roundRect(ctx, b.x, b.y, b.w, b.h, 7);
    ctx.fillStyle = "rgba(16,19,25,0.8)";
    ctx.fill();
    ctx.lineWidth = isSel ? 2 : 1.2;
    ctx.strokeStyle = isSel ? "#ffffff" : hexA(col, 0.85);
    ctx.stroke();
    ctx.fillStyle = hexA(col, 0.9);
    ctx.fillRect(b.x + 1, b.y + 4, 3, b.headH - 8);
    ctx.font = `600 12.5px ${FONTF}`;
    ctx.fillStyle = shade(col, 0.25);
    let title = n.name || "Note";
    const maxT = b.w - b.padX * 2 - 22;
    while (title.length > 1 && ctx.measureText(title).width > maxT) title = title.slice(0, -2) + "…";
    ctx.fillText(title, b.x + b.padX, b.y + b.headH / 2 + 0.5);
    ctx.font = `12px ${FONTF}`;
    if (b.body) {
      ctx.fillStyle = "#dfe5ef";
      b.body.forEach((ln, i) => ctx.fillText(ln, b.x + b.padX, b.y + b.headH + b.lh * i + b.lh / 2));
    } else {
      ctx.font = `italic 12px ${FONTF}`;
      ctx.fillStyle = "#7d8798";
      ctx.fillText("No details yet — add them in the Inspector.", b.x + b.padX, b.y + b.headH + b.lh / 2);
    }
    drawToggle(ctx, b.btn, col, true);
  }
  ctx.restore();
}
