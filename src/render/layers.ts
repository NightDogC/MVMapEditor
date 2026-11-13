/* Off-grid layer drawing: structures, edge structures, their labels, stamps, and the hand-placed markers. */
import type { View } from "./view.ts";
import type { Structure, EdgeStruct } from "../model/types.ts";
import { CELL } from "../model/constants.ts";
import { TICKS } from "../geom/lattice.ts";
import { outline, bbox, type TRect, type TLine } from "../geom/region.ts";
import type { TSeg } from "../geom/segs.ts";
import { S, structColor } from "../state/store.ts";
import { sT, sPieces, eT, ePieces, selPiece } from "../state/layers.ts";
import { FONTF, roundRect, edgeThickness, hatchPattern, markOf, markAlpha, MARK_STYLE } from "./common.ts";
import { clamp, hexA, shade } from "../util.ts";

const tPx = TICKS / CELL;
/** Tick coordinate -> screen. */
const sx = (V: View, t: number) => V.sx(t / tPx);
const sy = (V: View, t: number) => V.sy(t / tPx);

const outlines = new WeakMap<object, TLine[]>();
function outlineOf(rects: TRect[]): TLine[] {
  let o = outlines.get(rects);
  if (!o) outlines.set(rects, (o = outline(rects)));
  return o;
}

function traceRects(ctx: CanvasRenderingContext2D, V: View, rects: TRect[]): void {
  ctx.beginPath();
  for (const r of rects) {
    const L = sx(V, r.x), T = sy(V, r.y), R = sx(V, r.x + r.w), B = sy(V, r.y + r.h);
    if (L > V.w || T > V.h || R < 0 || B < 0) continue;
    ctx.rect(L, T, R - L + 0.5, B - T + 0.5);
  }
}
/** Outline the outer boundary of a region (canonical rects). */
export function strokeRegion(ctx: CanvasRenderingContext2D, V: View, rects: TRect[]): void {
  ctx.beginPath();
  for (const l of outlineOf(rects)) {
    const ax = sx(V, l.x1), ay = sy(V, l.y1), bx = sx(V, l.x2), by = sy(V, l.y2);
    if (Math.max(ax, bx) < 0 || Math.max(ay, by) < 0 || Math.min(ax, bx) > V.w || Math.min(ay, by) > V.h) continue;
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
  }
  ctx.stroke();
}
export function strokeSegs(ctx: CanvasRenderingContext2D, V: View, segs: TSeg[]): void {
  ctx.beginPath();
  for (const s of segs) {
    const ax = sx(V, s.x1), ay = sy(V, s.y1), bx = sx(V, s.x2), by = sy(V, s.y2);
    if (Math.max(ax, bx) < -20 || Math.max(ay, by) < -20 || Math.min(ax, bx) > V.w + 20 || Math.min(ay, by) > V.h + 20) continue;
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
  }
  ctx.stroke();
}

export function drawStructures(ctx: CanvasRenderingContext2D, V: View): void {
  const s = CELL * V.cam.zoom;
  const pc = S.sel && S.sel.type === "struct" ? selPiece() : null;
  const lit = pc && pc.kind === "struct" ? pc : null;
  const hatch = hatchPattern(ctx);
  if (hatch && hatch.setTransform && typeof DOMMatrix !== "undefined") {
    // anchor the hatch to the world so it doesn't swim while panning
    try {
      hatch.setTransform(new DOMMatrix().translate(V.sx(0), V.sy(0)));
    } catch {
      /* old browsers */
    }
  }
  for (const st of S.doc.structures) {
    if (!st.rects.length) continue;
    ctx.globalAlpha = markAlpha(st, "structure");
    const col = structColor(st);
    const isActive = st.id === S.activeStructId;
    const hl = lit && lit.item === st ? lit.rects : null; // the selected piece, if it's in this structure
    const all = sT(st);
    const parts: [TRect[], boolean][] = hl ? [[all.filter((r) => !hl.includes(r)), false], [hl, true]] : [[all, false]];
    for (const [rects, on] of parts) {
      traceRects(ctx, V, rects);
      ctx.fillStyle = hexA(col, on ? 0.8 : 0.6);
      ctx.fill();
      if (hatch && s >= 6) {
        ctx.fillStyle = hatch;
        ctx.fill();
      }
    }
    ctx.lineCap = "square";
    ctx.strokeStyle = shade(col, 0.22);
    ctx.lineWidth = isActive || hl ? 1.8 : 1.2;
    strokeRegion(ctx, V, all);
    if (hl) {
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2.2;
      strokeRegion(ctx, V, hl);
    }
  }
  ctx.globalAlpha = 1;
}

export function drawEdgeStructs(ctx: CanvasRenderingContext2D, V: View): void {
  const pc = S.sel && S.sel.type === "edge" ? selPiece() : null;
  const sel = pc && pc.kind === "edge" ? pc : null;
  const t = edgeThickness(V.cam.zoom);
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const es of S.doc.edgeStructs) {
    if (!es.segs.length) continue;
    ctx.globalAlpha = markAlpha(es, "edge");
    const col = structColor(es);
    const segs = eT(es);
    const lit = sel && sel.item === es ? sel.segs : null; // just the selected piece glows
    if (lit) {
      ctx.strokeStyle = hexA(col, 0.4);
      ctx.lineWidth = t * 2.6;
      strokeSegs(ctx, V, lit);
    }
    ctx.strokeStyle = "rgba(8,10,14,0.85)";
    ctx.lineWidth = t + 2;
    strokeSegs(ctx, V, segs);
    ctx.strokeStyle = col;
    ctx.lineWidth = t;
    strokeSegs(ctx, V, segs);
    if (lit) {
      ctx.strokeStyle = shade(col, 0.3);
      strokeSegs(ctx, V, lit);
    }
  }
  ctx.restore();
}

export function drawStructLabels(ctx: CanvasRenderingContext2D, V: View): void {
  const z = V.cam.zoom;
  if (z * CELL <= 16) return;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const fs = clamp(Math.round(10 * Math.min(1.3, z)), 9, 13);
  ctx.font = `italic 600 ${fs}px ${FONTF}`;
  const label = (text: string, col: string, cx: number, cy: number) => {
    if (!text || cx < -80 || cy < -20 || cx > V.w + 80 || cy > V.h + 20) return;
    const tw = ctx.measureText(text).width;
    ctx.fillStyle = "rgba(10,12,16,0.72)";
    ctx.fillRect(cx - tw / 2 - 3, cy - fs / 2 - 2, tw + 6, fs + 4);
    ctx.fillStyle = shade(col, 0.3);
    ctx.fillText(text, cx, cy + 0.5);
  };
  for (const st of S.doc.structures) {
    if (st.hideName) continue;
    const b = bbox(sT(st));
    if (!b) continue;
    ctx.globalAlpha = markAlpha(st, "structure");
    label(st.name, structColor(st), sx(V, (b.x0 + b.x1) / 2), sy(V, (b.y0 + b.y1) / 2));
  }
  for (const es of S.doc.edgeStructs) {
    const segs = eT(es);
    if (!segs.length || es.hideName) continue;
    // anchor on the segment whose middle is nearest the middle of the set, just off the line
    const mids = segs.map((g) => ({ x: (g.x1 + g.x2) / 2, y: (g.y1 + g.y2) / 2 }));
    const ax = mids.reduce((a, m) => a + m.x, 0) / mids.length, ay = mids.reduce((a, m) => a + m.y, 0) / mids.length;
    let best = 0, bd = Infinity;
    mids.forEach((m, i) => {
      const d = Math.hypot(m.x - ax, m.y - ay);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    const g = segs[best], m = mids[best];
    const off = edgeThickness(z) / 2 + fs / 2 + 4;
    const flat = Math.abs(g.x2 - g.x1) >= Math.abs(g.y2 - g.y1);
    const cx = sx(V, m.x) + (flat ? 0 : off + ctx.measureText(es.name).width / 2);
    const cy = sy(V, m.y) - (flat ? off : 0);
    ctx.globalAlpha = markAlpha(es, "edge");
    label(es.name, structColor(es), cx, cy);
  }
  ctx.globalAlpha = 1;
}

// The stamp-icon export script reads the font line below — keep it spelled exactly like this.
function setStampFont(ctx: CanvasRenderingContext2D, s: number): void {
  ctx.font = `${Math.max(6, Math.round(s * 0.62))}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", ${FONTF}`;
}
/** Emoji glyph centred in a 1×1 box whose top-left is (px, py) on screen, box side s px. */
export function drawEmoji(ctx: CanvasRenderingContext2D, emoji: string, px: number, py: number, s: number): void {
  setStampFont(ctx, s);
  ctx.fillText(emoji, px + s / 2, py + s / 2 + s * 0.04);
}

export function drawStamps(ctx: CanvasRenderingContext2D, V: View): void {
  const z = V.cam.zoom, s = CELL * z;
  const selId = S.sel && S.sel.type === "stamp" ? S.sel.id : null;
  const selPt = selId ? S.sel!.pt : null;
  const showNames = S.showStructLabels && z * 100 > S.stampZoom;
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const fs = clamp(Math.round(9.5 * Math.min(1.3, z)), 8, 12);
  const labels: { text: string; col: string; alpha: number; cx: number; top: number; bottom: number }[] = [];
  for (const st of S.doc.stamps) {
    const col = structColor(st);
    const isSel = st.id === selId;
    const alpha = markAlpha(st, "stamp");
    ctx.globalAlpha = alpha;
    for (const p of st.points) {
      const px = V.sx(p.x * CELL), py = V.sy(p.y * CELL);
      if (px > V.w || py > V.h || px + s < 0 || py + s < 0) continue;
      const pad = Math.max(1, s * 0.08);
      // picked on the map: only that copy lights up; picked in the list: every copy does
      const lit = isSel && (!selPt || selPt.id === p.id);
      ctx.fillStyle = hexA(col, lit ? 0.5 : 0.32);
      roundRect(ctx, px + pad, py + pad, s - pad * 2, s - pad * 2, Math.min(6, s * 0.18));
      ctx.fill();
      if (lit) {
        ctx.lineWidth = selPt ? 2.2 : 1.4;
        ctx.strokeStyle = selPt ? "#ffffff" : shade(col, 0.3);
        ctx.stroke();
      }
      if (s >= 5) {
        ctx.fillStyle = "#ffffff";
        drawEmoji(ctx, st.emoji, px, py, s);
      }
      if (showNames && !st.hideName && st.name) labels.push({ text: st.name, col, alpha, cx: px + s / 2, top: py, bottom: py + s });
    }
  }

  // labels go on after every tile, so a tile drawn later can't cover one
  ctx.font = `500 ${fs}px ${FONTF}`;
  const placed: { x: number; y: number; w: number; h: number }[] = [];
  const hits = (box: { x: number; y: number; w: number; h: number }) =>
    placed.some((b) => box.x < b.x + b.w && b.x < box.x + box.w && box.y < b.y + b.h && b.y < box.y + box.h);
  for (const l of labels) {
    const w = ctx.measureText(l.text).width + 6, h = fs + 3;
    // below the stamp first; if a neighbour's label is in the way try above; failing both, hide it
    const below = { x: l.cx - w / 2, y: l.bottom + 1, w, h };
    const above = { x: l.cx - w / 2, y: l.top - h - 1, w, h };
    const box = !hits(below) ? below : !hits(above) ? above : null;
    if (!box) continue;
    placed.push(box);
    ctx.globalAlpha = l.alpha;
    ctx.fillStyle = "rgba(10,12,16,0.72)";
    ctx.fillRect(box.x, box.y, box.w, box.h);
    ctx.fillStyle = shade(l.col, 0.3);
    ctx.fillText(l.text, l.cx, box.y + h / 2 + 0.5);
  }
  ctx.restore();
}

function drawMarkBadge(ctx: CanvasRenderingContext2D, V: View, mark: keyof typeof MARK_STYLE, cx: number, cy: number, r: number): void {
  if (cx < -r || cy < -r || cx > V.w + r || cy > V.h + r) return;
  const m = MARK_STYLE[mark];
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = m.color;
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = "rgba(8,10,14,0.9)";
  ctx.stroke();
  ctx.fillStyle = "#12151b";
  ctx.font = `700 ${Math.round(r * 1.25)}px ${FONTF}`;
  ctx.fillText(m.glyph, cx, cy + 0.5);
}

/** Top-most, then left-most rectangle corner of a piece (ticks). */
function topLeftOf(rects: TRect[]): { x: number; y: number } {
  let b = rects[0];
  for (const r of rects) if (r.y < b.y || (r.y === b.y && r.x < b.x)) b = r;
  return { x: b.x, y: b.y };
}
/** Top-most, then left-most endpoint of a piece (ticks). */
function topEndOf(segs: TSeg[]): { x: number; y: number } {
  let bx = Infinity, by = Infinity;
  for (const g of segs)
    for (const [x, y] of [[g.x1, g.y1], [g.x2, g.y2]])
      if (y < by || (y === by && x < bx)) {
        bx = x;
        by = y;
      }
  return { x: bx, y: by };
}

export function drawManualMarks(ctx: CanvasRenderingContext2D, V: View): void {
  const z = V.cam.zoom, s = CELL * z;
  type Marked =
    | { layer: "structure"; it: Structure; mark: keyof typeof MARK_STYLE }
    | { layer: "edge"; it: EdgeStruct; mark: keyof typeof MARK_STYLE }
    | { layer: "stamp"; it: (typeof S.doc.stamps)[number]; mark: keyof typeof MARK_STYLE };
  const marked: Marked[] = []; // only the elements that get a marker
  for (const it of S.doc.structures) {
    const mark = it.rects.length ? markOf(it, "structure") : null;
    if (mark) marked.push({ layer: "structure", it, mark });
  }
  for (const it of S.doc.edgeStructs) {
    const mark = it.segs.length ? markOf(it, "edge") : null;
    if (mark) marked.push({ layer: "edge", it, mark });
  }
  for (const it of S.doc.stamps) {
    const mark = it.points.length ? markOf(it, "stamp") : null;
    if (mark) marked.push({ layer: "stamp", it, mark });
  }

  ctx.save();
  // outlines: a dark dashed underlay keeps the dashes readable over any fill colour
  ctx.lineCap = "butt";
  const lw = Math.max(2, edgeThickness(z) * 0.45);
  for (const m of marked) {
    const style = MARK_STYLE[m.mark];
    ctx.setLineDash(style.dash);
    for (const [col, w] of [["rgba(8,10,14,0.85)", lw + 2], [style.color, lw]] as const) {
      ctx.strokeStyle = col;
      ctx.lineWidth = w;
      if (m.layer === "structure") strokeRegion(ctx, V, sT(m.it));
      else if (m.layer === "edge") strokeSegs(ctx, V, eT(m.it));
      else {
        const pad = Math.max(1, s * 0.08);
        for (const p of m.it.points) {
          const px = V.sx(p.x * CELL), py = V.sy(p.y * CELL);
          if (px > V.w || py > V.h || px + s < 0 || py + s < 0) continue;
          roundRect(ctx, px + pad, py + pad, s - pad * 2, s - pad * 2, Math.min(6, s * 0.18));
          ctx.stroke();
        }
      }
    }
  }
  ctx.setLineDash([]);

  // badges on top of every outline: one per connected piece (the unit Select picks), one per stamp copy
  if (s >= 8) {
    const r = clamp(s * 0.22, 5, 9), inset = r * 0.35;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const m of marked) {
      if (m.layer === "edge") {
        for (const piece of ePieces(m.it)) {
          const p = topEndOf(piece);
          drawMarkBadge(ctx, V, m.mark, sx(V, p.x), sy(V, p.y), r);
        }
      } else if (m.layer === "structure") {
        for (const piece of sPieces(m.it)) {
          const p = topLeftOf(piece);
          drawMarkBadge(ctx, V, m.mark, sx(V, p.x) + inset, sy(V, p.y) + inset, r);
        }
      } else {
        for (const p of m.it.points) drawMarkBadge(ctx, V, m.mark, V.sx(p.x * CELL) + inset, V.sy(p.y * CELL) + inset, r);
      }
    }
  }
  ctx.restore();
}
