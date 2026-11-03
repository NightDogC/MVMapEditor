/* Map input: pointer gestures for every tool. Ctrl (or right-click in "Remove" mode) erases / removes; Alt toggles
   snapping for the off-grid layers while held. */
import type { View } from "../render/view.ts";
import type { Door, Pt } from "../model/types.ts";
import { makeView, zoomAt } from "../render/view.ts";
import { worldCanvas, wctx, worldView } from "../render/world.ts";
import { noteHit } from "../render/notes.ts";
import { CELL } from "../model/constants.ts";
import { TICKS, toT, fromT, roundTo } from "../geom/lattice.ts";
import { normalize, bbox, type TRect } from "../geom/region.ts";
import { distToSeg2, type TSeg } from "../geom/segs.ts";
import {
  S, app, requestDraw, commit, flushUI, pushUndo, recordUndo, snapshot, reindex, selExists,
  roomById, keyById, noteById, stampById, structById, edgeStructById, roomAtCell, doorAtEdge,
  activeRoom, activeStruct, activeEdgeStruct, activeStamp,
} from "../state/store.ts";
import { scheduleSave } from "../state/persist.ts";
import {
  nearestEdge, createRoom, paintCell, eraseCell, dropEmptyRooms, pruneDoors, deleteDoor, deleteKey, createKeyAt, translateRoom,
} from "../state/rooms.ts";
import {
  sT, eT, createStruct, paintStructArea, eraseStructArea, dropEmptyStructs, structPieceAt,
  createEdgeStruct, addEdgeSegs, eraseEdgeBox, dropEmptyEdgeStructs, edgeSegAt,
  createStamp, placeStamp, removeStampPoint, stampAt, keyAt, createNoteAt, deleteNote,
  beginStructMove, beginEdgeMove,
} from "../state/layers.ts";
import { penBox, erasePencil, simplify, roundPt } from "../state/pencil.ts";
import { snapTicks, brushTicks, pxToT, tToPx, snapPoint, snapSquare, snapBox, isFreeNow } from "../state/snap.ts";
import { dragRect, lockAngle } from "./shapes.ts";
import { renderSnapBar } from "../ui/snapbar.ts";
import { openDetail } from "../ui/detail.ts";
import { $, uid } from "../util.ts";

interface SP {
  x: number;
  y: number;
}
export function evPos(e: MouseEvent): SP {
  const r = worldCanvas.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}
const cellAt = (V: View, p: SP) => ({ x: Math.floor(V.wx(p.x) / CELL), y: Math.floor(V.wy(p.y) / CELL) });
/** Raw (unsnapped) tick position under a screen point. */
const tickAt = (V: View, p: SP) => ({ x: pxToT(V.wx(p.x)), y: pxToT(V.wy(p.y)) });
/** Pick radius for edge segments, in ticks: a sixth of a cell, or 6 screen px when zoomed out. */
const edgeTol = (V: View) => Math.max(TICKS * 0.16, pxToT(6 / V.cam.zoom));

/** Closest point of segment s to (x, y). */
function closestOn(s: TSeg, x: number, y: number): SP {
  const dx = s.x2 - s.x1, dy = s.y2 - s.y1;
  const L = dx * dx + dy * dy;
  let u = L ? ((x - s.x1) * dx + (y - s.y1) * dy) / L : 0;
  u = u < 0 ? 0 : u > 1 ? 1 : u;
  return { x: s.x1 + u * dx, y: s.y1 + u * dy };
}
const tl = (b: { x0: number; y0: number }) => ({ x: b.x0, y: b.y0 });
const segsBBox = (segs: TSeg[]) => ({
  x0: Math.min(...segs.map((s) => Math.min(s.x1, s.x2))),
  y0: Math.min(...segs.map((s) => Math.min(s.y1, s.y2))),
});

type Hit =
  | { type: "note"; id: string; part: string }
  | { type: "stamp"; id: string; pt: Pt }
  | { type: "key"; id: string }
  | { type: "door"; id: string }
  | { type: "edge"; id: string; at: SP; piece: TSeg[] }
  | { type: "struct"; id: string; at: SP; piece: TRect[] }
  | { type: "room"; id: string };

/** The topmost thing under a screen point: notes, stamps, keys, doors, edge structures, structures, rooms. */
function pickAt(V: View, p: SP): Hit | null {
  const wx = V.wx(p.x), wy = V.wy(p.y);
  const t = tickAt(V, p);
  const c = cellAt(V, p);
  const nh = noteHit(wctx, V, p.x, p.y);
  if (nh) return { type: "note", id: nh.note.id, part: nh.part };
  if (S.showStructs) {
    const sh = stampAt(t.x, t.y);
    if (sh) return { type: "stamp", id: sh.st.id, pt: sh.pt };
  }
  for (let i = S.doc.keys.length - 1; i >= 0; i--) {
    const k = S.doc.keys[i];
    if (Math.hypot(wx - (k.x * CELL + CELL / 2), wy - (k.y * CELL + CELL / 2)) <= CELL * 0.3) return { type: "key", id: k.id };
  }
  const e = nearestEdge(wx, wy, 0.2);
  if (e) {
    const d = doorAtEdge(e.o, e.x, e.y);
    if (d) return { type: "door", id: d.id };
  }
  if (S.showStructs) {
    const eh = edgeSegAt(t.x, t.y, edgeTol(V));
    if (eh) return { type: "edge", id: eh.es.id, at: closestOn(eh.seg, t.x, t.y), piece: eh.piece };
    const sh = structPieceAt(t.x, t.y);
    if (sh) return { type: "struct", id: sh.st.id, at: t, piece: sh.piece };
  }
  const r = roomAtCell(c.x, c.y);
  if (r) return { type: "room", id: r.id };
  return null;
}

/** Erase the structure brush squares swept from the last pointer position to (wx, wy); with d.edges also cut edge
    structures there (S-Erase). */
function applyStructBrush(d: any, wx: number, wy: number): boolean {
  const step = brushTicks();
  const from = d.last || { x: wx, y: wy };
  const stepPx = Math.max(1, tToPx(step) / 2);
  const n = Math.max(1, Math.ceil(Math.hypot(wx - from.x, wy - from.y) / stepPx));
  const squares: TRect[] = [];
  for (let i = d.last ? 1 : 0; i <= n; i++) {
    const sq = snapSquare(from.x + ((wx - from.x) * i) / n, from.y + ((wy - from.y) * i) / n, step);
    const k = sq.x + "," + sq.y + "," + step;
    if (d.seen.has(k)) continue;
    d.seen.add(k);
    squares.push({ x: sq.x, y: sq.y, w: step, h: step });
  }
  d.last = { x: wx, y: wy };
  if (!squares.length) return false;
  const region = normalize(squares);
  let changed: boolean;
  if (d.erase || !d.st) changed = eraseStructArea(region);
  else changed = paintStructArea(d.st, region);
  if (d.edges) for (const r of squares) changed = eraseEdgeBox(r) || changed;
  return changed;
}
/** Edge-tool eraser: cut every edge structure inside the brush square under the pointer. */
function applyEdgeEraser(d: any, wx: number, wy: number): void {
  const step = brushTicks();
  const sq = snapSquare(wx, wy, step);
  const before = d.undone ? null : snapshot();
  if (eraseEdgeBox({ x: sq.x, y: sq.y, w: step, h: step })) {
    if (!d.undone) {
      recordUndo(before!);
      d.undone = true;
    }
    commit();
  }
}

/** Room cells painted / erased by the whole-cell paint tools. */
function applyPaint(c: SP): void {
  const d = S.drag;
  const k = c.x + "," + c.y;
  if (d.seen.has(k)) return;
  d.seen.add(k);
  if (d.erase || !d.room) eraseCell(c.x, c.y);
  else paintCell(c.x, c.y, d.room);
}

/** Commit an Edge-tool gesture: a segment from press to release, or a click on an existing segment. */
function applyEdgeLine(d: any): void {
  if (d.a.x === d.b.x && d.a.y === d.b.y) {
    // plain click on an existing segment just selects its piece
    const hit = edgeSegAt(d.raw.x, d.raw.y, edgeTol(worldView()));
    if (hit && !d.fresh) {
      S.sel = { type: "edge", id: hit.es.id, at: closestOn(hit.seg, d.raw.x, d.raw.y) };
      S.activeEdgeId = hit.es.id;
    }
    return;
  }
  pushUndo();
  let es = d.fresh ? null : activeEdgeStruct();
  if (!es) es = createEdgeStruct();
  addEdgeSegs(es, [{ x1: d.a.x, y1: d.a.y, x2: d.b.x, y2: d.b.y }]);
  S.sel = { type: "edge", id: es.id };
  S.activeEdgeId = es.id;
  dropEmptyEdgeStructs();
}

/** Right-click remove with the Select tool: delete the smallest thing under the pointer. */
function removeAt(V: View, p: SP): void {
  const hit = pickAt(V, p);
  if (!hit) return;
  const c = cellAt(V, p);
  const t = tickAt(V, p);
  pushUndo();
  if (hit.type === "note") deleteNote(hit.id);
  else if (hit.type === "stamp") removeStampPoint(stampById(hit.id)!, hit.pt);
  else if (hit.type === "key") deleteKey(hit.id);
  else if (hit.type === "door") deleteDoor(hit.id);
  else if (hit.type === "edge") {
    const step = brushTicks();
    const sq = snapSquare(V.wx(p.x), V.wy(p.y), step);
    eraseEdgeBox({ x: sq.x, y: sq.y, w: step, h: step });
    dropEmptyEdgeStructs();
  } else if (hit.type === "struct") {
    const step = brushTicks();
    const sq = snapSquare(V.wx(p.x), V.wy(p.y), step);
    void t;
    eraseStructArea([{ x: sq.x, y: sq.y, w: step, h: step }]);
    dropEmptyStructs();
  } else if (hit.type === "room") {
    eraseCell(c.x, c.y);
    dropEmptyRooms();
    reindex();
    pruneDoors();
  }
  if (S.sel && !selExists(S.sel)) S.sel = null;
  commit();
}

/** Toggle a note open / closed from its button (works in every tool, Pan included). */
function toggleNote(note: { id: string; expanded: boolean }): void {
  pushUndo();
  note.expanded = !note.expanded;
  S.sel = { type: "note", id: note.id };
  commit();
}

function onPointerDown(e: PointerEvent): void {
  if (S.altDown !== e.altKey) {
    S.altDown = e.altKey;
    renderSnapBar();
  }
  const rmb = e.button === 2;
  // with the Pan tool, a note's expand/collapse button and open box still respond
  if (e.button === 0 && S.tool === "pan" && !S.spaceDown && S.showNotes) {
    const ep = evPos(e);
    const nh = noteHit(wctx, worldView(), ep.x, ep.y);
    if (nh && nh.part === "toggle") return toggleNote(nh.note);
    if (nh && nh.part === "box") {
      worldCanvas.setPointerCapture(e.pointerId);
      S.sel = { type: "note", id: nh.note.id };
      S.drag = { type: "movebox", note: nh.note, last: ep, undone: false };
      commit(true);
      return;
    }
  }
  if (e.button === 1 || S.spaceDown || S.tool === "pan" || (rmb && S.rclick === "pan")) {
    e.preventDefault();
    worldCanvas.setPointerCapture(e.pointerId);
    S.drag = { type: "pan", last: evPos(e) };
    return;
  }
  if (e.button > 2) return;
  worldCanvas.setPointerCapture(e.pointerId);
  const V = makeView(S.cam, app.VW, app.VH);
  const p = evPos(e);
  const c = cellAt(V, p);
  const t = tickAt(V, p);
  const wx = V.wx(p.x), wy = V.wy(p.y);
  // right-click in "remove" mode behaves like holding Ctrl with the current tool
  const erase = e.ctrlKey || e.metaKey || rmb;
  const shift = e.shiftKey && !rmb;

  // a note's expand/collapse button works as a button whatever tool is active
  if (!erase && S.showNotes) {
    const nh = noteHit(wctx, V, p.x, p.y);
    if (nh && nh.part === "toggle") return toggleNote(nh.note);
    if (nh && nh.part === "box") {
      // dragging the open box moves the box, not the note
      S.sel = { type: "note", id: nh.note.id };
      S.drag = { type: "movebox", note: nh.note, last: p, undone: false };
      commit(true);
      return;
    }
    if (nh && S.tool === "note") {
      S.sel = { type: "note", id: nh.note.id };
      S.drag = { type: "movenote", note: nh.note, grab: { x: t.x - toT(nh.note.x), y: t.y - toT(nh.note.y) }, undone: false };
      commit(true);
      return;
    }
  }

  if (S.tool === "pencil" || S.tool === "perase") {
    S.hoverPt = { x: wx, y: wy };
    if (S.tool === "perase" || erase) {
      // Ctrl / right-click with the pencil erases, like every other drawing tool
      S.drag = { type: "perase", last: { x: wx, y: wy }, undone: false };
      const before = snapshot();
      if (erasePencil(wx, wy, wx, wy, S.pencil.eraser / 2)) {
        recordUndo(before);
        S.drag.undone = true;
        scheduleSave();
      }
      requestDraw();
      return;
    }
    pushUndo();
    const stroke = { id: uid("pen"), color: S.pencil.color, size: S.pencil.size, pts: [roundPt(wx), roundPt(wy)] };
    S.doc.pencil.push(stroke);
    S.drag = { type: "pencil", stroke, last: p };
    requestDraw();
    return;
  }

  if (S.tool === "note") {
    if (erase) {
      const nh = noteHit(wctx, V, p.x, p.y);
      if (nh) {
        pushUndo();
        deleteNote(nh.note.id);
        commit();
      }
      return;
    }
    const b = snapBox(wx, wy);
    const x = fromT(b.x), y = fromT(b.y);
    const there = S.doc.notes.find((n) => n.x === x && n.y === y);
    if (there) {
      S.sel = { type: "note", id: there.id };
      commit(true);
      return;
    }
    pushUndo();
    const n = createNoteAt(x, y);
    S.sel = { type: "note", id: n.id };
    commit();
    // jump straight into writing it (after the click's own focus change has happened)
    setTimeout(() => document.querySelector<HTMLTextAreaElement>("#i-ntext")?.focus());
    return;
  }

  if (rmb && S.tool === "select") return removeAt(V, p);

  if (S.tool === "select") {
    const hit = pickAt(V, p);
    const step = snapTicks();
    void step;
    S.sel = null;
    if (hit && hit.type === "room") {
      S.sel = { type: "room", id: hit.id };
      S.activeRoomId = hit.id;
      const room = roomById(hit.id)!;
      S.activeAreaId = room.areaId;
      S.drag = { type: "move", room, startCell: c, dx: 0, dy: 0, undone: false };
    } else if (hit && hit.type === "key") {
      S.sel = { type: "key", id: hit.id };
      const key = keyById(hit.id)!;
      S.drag = { type: "movekey", key, grab: { x: t.x - toT(key.x), y: t.y - toT(key.y) }, undone: false };
    } else if (hit && hit.type === "note") {
      S.sel = { type: "note", id: hit.id };
      const note = noteById(hit.id)!;
      S.drag = { type: "movenote", note, grab: { x: t.x - toT(note.x), y: t.y - toT(note.y) }, undone: false };
    } else if (hit && hit.type === "stamp") {
      S.sel = { type: "stamp", id: hit.id, pt: hit.pt };
      S.activeStampId = hit.id;
      S.drag = { type: "movestamp", st: stampById(hit.id), pt: hit.pt, grab: { x: t.x - toT(hit.pt.x), y: t.y - toT(hit.pt.y) }, undone: false };
    } else if (hit && hit.type === "struct") {
      S.sel = { type: "struct", id: hit.id, at: hit.at };
      S.activeStructId = hit.id;
      const o = tl(bbox(hit.piece)!);
      S.drag = { type: "movestruct", st: structById(hit.id), piece: hit.piece, at0: hit.at, tl0: o, grab: { x: t.x - o.x, y: t.y - o.y }, dx: 0, dy: 0, mover: null };
    } else if (hit && hit.type === "edge") {
      S.sel = { type: "edge", id: hit.id, at: hit.at };
      S.activeEdgeId = hit.id;
      const o = tl(segsBBox(hit.piece));
      S.drag = { type: "moveedge", es: edgeStructById(hit.id), piece: hit.piece, at0: hit.at, tl0: o, grab: { x: t.x - o.x, y: t.y - o.y }, dx: 0, dy: 0, mover: null };
    } else if (hit) S.sel = { type: hit.type, id: hit.id };
    commit(true);
    return;
  }

  if (S.tool === "spaint" || S.tool === "srect") {
    let st = erase ? null : activeStruct();
    pushUndo();
    if (!erase && (shift || !st)) {
      st = createStruct();
      S.sel = { type: "struct", id: st.id };
    }
    if (S.tool === "srect") S.drag = { type: "srect", a: t, b: t, step: snapTicks(), st, erase };
    else {
      S.drag = { type: "spaint", st, erase, seen: new Set(), last: null };
      applyStructBrush(S.drag, wx, wy);
    }
    commit();
    return;
  }

  if (S.tool === "serase") {
    pushUndo();
    S.drag = { type: "spaint", st: null, erase: true, edges: true, seen: new Set(), last: null };
    applyStructBrush(S.drag, wx, wy);
    commit();
    return;
  }

  if (S.tool === "stamp") {
    const hit = stampAt(t.x, t.y);
    if (erase) {
      if (hit) {
        pushUndo();
        removeStampPoint(hit.st, hit.pt);
        if (S.sel && S.sel.type === "stamp" && S.sel.pt === hit.pt) S.sel = { type: "stamp", id: hit.st.id };
        commit();
      }
      return;
    }
    let st = activeStamp();
    // plain click on an existing stamp selects it (and can drag it) instead of stacking another on top
    if (hit && !shift && (!st || hit.st === st)) {
      S.sel = { type: "stamp", id: hit.st.id, pt: hit.pt };
      S.activeStampId = hit.st.id;
      S.drag = { type: "movestamp", st: hit.st, pt: hit.pt, grab: { x: t.x - toT(hit.pt.x), y: t.y - toT(hit.pt.y) }, undone: false };
      commit(true);
      return;
    }
    pushUndo();
    if (shift || !st) st = createStamp();
    const b = snapBox(wx, wy);
    placeStamp(st, fromT(b.x), fromT(b.y));
    S.sel = { type: "stamp", id: st.id, pt: st.points[st.points.length - 1] };
    commit();
    return;
  }

  if (S.tool === "edge") {
    if (erase) {
      S.drag = { type: "eerase", undone: false };
      applyEdgeEraser(S.drag, wx, wy);
      return;
    }
    const a = snapPoint(wx, wy);
    S.drag = { type: "edgeline", a, b: a, raw: t, fresh: shift };
    requestDraw();
    return;
  }

  if (S.tool === "paint" || S.tool === "rect") {
    let room = activeRoom();
    pushUndo();
    if (!erase && (shift || !room)) {
      room = createRoom();
      S.sel = { type: "room", id: room.id };
    }
    if (S.tool === "rect") S.drag = { type: "rect", a: c, b: c, room, erase };
    else {
      S.drag = { type: "paint", room, erase, seen: new Set() };
      applyPaint(c);
    }
    commit();
    return;
  }

  if (S.tool === "erase") {
    pushUndo();
    S.drag = { type: "paint", room: null, erase: true, seen: new Set() };
    applyPaint(c);
    commit();
    return;
  }

  if (S.tool === "door") {
    const edge = nearestEdge(wx, wy, 0.5);
    if (!edge) return;
    const existing = doorAtEdge(edge.o, edge.x, edge.y);
    pushUndo();
    if (existing) {
      if (erase) deleteDoor(existing.id);
      else S.sel = { type: "door", id: existing.id };
    } else if (!erase) {
      const d: Door = { id: uid("door"), x: edge.x, y: edge.y, o: edge.o, kind: "door", dir: 1, lockId: null };
      S.doc.doors.push(d);
      S.sel = { type: "door", id: d.id };
    }
    commit();
    return;
  }

  if (S.tool === "key") {
    if (erase) {
      const victim = keyAt(t.x, t.y);
      if (victim) {
        pushUndo();
        deleteKey(victim.id);
        commit();
      }
      return;
    }
    pushUndo();
    const b = snapBox(wx, wy);
    const k = createKeyAt(fromT(b.x), fromT(b.y));
    S.sel = { type: "key", id: k.id };
    commit();
  }
}

/** New top-left (ticks) for a dragged point object: the pointer minus where it was grabbed, snapped. */
const snappedTL = (t: SP, grab: SP) => {
  const step = snapTicks();
  return { x: roundTo(t.x - grab.x, step), y: roundTo(t.y - grab.y, step) };
};

function hudCoord(V: View, wx: number, wy: number, c: SP): string {
  const f = (v: number) => String(fromT(v));
  if (S.tool === "edge") {
    const q = snapPoint(wx, wy);
    return f(q.x) + ", " + f(q.y);
  }
  if (S.tool === "stamp" || S.tool === "note" || S.tool === "key") {
    const q = snapBox(wx, wy);
    return f(q.x) + ", " + f(q.y);
  }
  if (S.tool === "spaint" || S.tool === "serase" || S.tool === "srect") {
    const q = snapSquare(wx, wy, S.tool === "srect" && isFreeNow() ? 1 : brushTicks());
    return f(q.x) + ", " + f(q.y);
  }
  void V;
  return c.x + ", " + c.y;
}

function onPointerMove(e: PointerEvent): void {
  if (S.altDown !== e.altKey) {
    S.altDown = e.altKey;
    renderSnapBar();
  }
  const V = makeView(S.cam, app.VW, app.VH);
  const p = evPos(e);
  const wx = V.wx(p.x), wy = V.wy(p.y);
  const c = { x: Math.floor(wx / CELL), y: Math.floor(wy / CELL) };
  const t = { x: pxToT(wx), y: pxToT(wy) };
  $("#hud-coord").textContent = hudCoord(V, wx, wy, c);

  const prev = S.hoverCell;
  S.hoverCell = c;
  S.hoverPt = { x: wx, y: wy };
  S.hoverEdge = S.tool === "door" ? nearestEdge(wx, wy, 0.5) : null;
  if (!S.drag) {
    const nh = noteHit(wctx, V, p.x, p.y);
    const idle = S.tool === "pan" ? "grab" : S.tool === "select" ? "default" : "crosshair";
    worldCanvas.style.cursor = !nh || S.spaceDown ? idle : nh.part === "toggle" ? "pointer" : nh.part === "box" ? "move" : idle;
  }
  const whole = S.tool === "paint" || S.tool === "rect" || S.tool === "erase" || S.tool === "select" || S.tool === "pan";
  if (!whole || !prev || prev.x !== c.x || prev.y !== c.y) requestDraw();

  const d = S.drag;
  if (!d) return;

  if (d.type === "pan") {
    S.cam.x -= (p.x - d.last.x) / S.cam.zoom;
    S.cam.y -= (p.y - d.last.y) / S.cam.zoom;
    d.last = p;
    requestDraw();
  } else if (d.type === "pencil") {
    // a new point every couple of screen pixels keeps strokes smooth without bloating the file
    if (Math.hypot(p.x - d.last.x, p.y - d.last.y) >= 2) {
      d.stroke.pts = [...d.stroke.pts, roundPt(wx), roundPt(wy)];
      d.last = p;
      requestDraw();
    }
  } else if (d.type === "perase") {
    const R = S.pencil.eraser / 2;
    // one undo step per sweep, recorded as the doc stood before its first bite
    const before = d.undone ? null : snapshot();
    if (erasePencil(d.last.x, d.last.y, wx, wy, R)) {
      if (!d.undone) {
        recordUndo(before!);
        d.undone = true;
      }
      scheduleSave();
    }
    d.last = { x: wx, y: wy };
    requestDraw();
  } else if (d.type === "paint") {
    applyPaint(c);
    commit();
  } else if (d.type === "rect") {
    d.b = c;
    requestDraw();
  } else if (d.type === "spaint") {
    if (applyStructBrush(d, wx, wy)) commit();
  } else if (d.type === "srect") {
    d.b = t;
    d.step = snapTicks();
    requestDraw();
  } else if (d.type === "eerase") {
    applyEdgeEraser(d, wx, wy);
  } else if (d.type === "edgeline") {
    d.b = e.shiftKey ? lockAngle(d.a, t, snapTicks()) : snapPoint(wx, wy);
    d.raw = d.a.x === d.b.x && d.a.y === d.b.y ? t : d.raw;
    requestDraw();
  } else if (d.type === "move") {
    const dx = c.x - d.startCell.x, dy = c.y - d.startCell.y;
    if (dx !== d.dx || dy !== d.dy) {
      if (!d.undone) {
        pushUndo();
        d.undone = true;
      }
      translateRoom(d.room, dx - d.dx, dy - d.dy);
      d.dx = dx;
      d.dy = dy;
      commit();
    }
  } else if (d.type === "movekey" || d.type === "movenote") {
    const it = d.type === "movekey" ? d.key : d.note;
    const q = snappedTL(t, d.grab);
    const x = fromT(q.x), y = fromT(q.y);
    const taken = d.type === "movenote" && S.doc.notes.some((n) => n !== it && n.x === x && n.y === y);
    if ((x !== it.x || y !== it.y) && !taken) {
      if (!d.undone) {
        pushUndo();
        d.undone = true;
      }
      it.x = x;
      it.y = y;
      commit();
    }
  } else if (d.type === "movestamp") {
    const q = snappedTL(t, d.grab);
    const np = { x: fromT(q.x), y: fromT(q.y) };
    // never drop a stamp exactly onto another one while dragging
    const taken = S.doc.stamps.some((s) => s.points.some((o) => o.x === np.x && o.y === np.y));
    if (!taken) {
      if (!d.undone) {
        pushUndo();
        d.undone = true;
      }
      d.st.points = d.st.points.map((o: Pt) => (o === d.pt ? np : o));
      d.pt = np;
      if (S.sel && S.sel.type === "stamp") S.sel.pt = np;
      commit();
    }
  } else if (d.type === "movestruct" || d.type === "moveedge") {
    const q = snappedTL(t, d.grab);
    const dx = q.x - d.tl0.x, dy = q.y - d.tl0.y;
    if (dx !== d.dx || dy !== d.dy) {
      // only the connected piece that was grabbed moves; the rest of the set stays put
      if (!d.mover) {
        pushUndo();
        d.mover = d.type === "movestruct" ? beginStructMove(d.st, d.piece) : beginEdgeMove(d.es, d.piece);
      }
      d.mover(dx, dy);
      d.dx = dx;
      d.dy = dy;
      if (S.sel) S.sel.at = { x: d.at0.x + dx, y: d.at0.y + dy };
      commit();
    }
  } else if (d.type === "movebox") {
    const ddx = p.x - d.last.x, ddy = p.y - d.last.y;
    if (ddx || ddy) {
      if (!d.undone) {
        pushUndo();
        d.undone = true;
      }
      const o = d.note.box || { dx: 0, dy: 0 };
      d.note.box = { dx: o.dx + ddx, dy: o.dy + ddy };
      d.last = p;
      requestDraw();
      scheduleSave();
    }
  }
}

function endDrag(): void {
  const d = S.drag;
  if (!d) return;
  if (d.type === "rect") {
    const x0 = Math.min(d.a.x, d.b.x), y0 = Math.min(d.a.y, d.b.y);
    const x1 = Math.max(d.a.x, d.b.x), y1 = Math.max(d.a.y, d.b.y);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) d.erase ? eraseCell(x, y) : paintCell(x, y, d.room);
  }
  if (d.type === "srect") {
    const r = dragRect(d.a, d.b, d.step);
    if (r) {
      if (d.erase || !d.st) eraseStructArea([r]);
      else paintStructArea(d.st, [r]);
    }
  }
  if (d.type === "edgeline") applyEdgeLine(d);
  if (d.type === "pencil") d.stroke.pts = simplify(d.stroke.pts, 0.25).map(roundPt);
  if (d.type === "spaint" || d.type === "srect" || d.type === "movestruct" || d.type === "move") dropEmptyStructs();
  if (d.type === "eerase" || d.type === "moveedge" || d.type === "move" || (d.type === "spaint" && d.edges)) dropEmptyEdgeStructs();
  if (d.type === "paint" || d.type === "rect" || d.type === "move") {
    dropEmptyRooms();
    reindex();
    pruneDoors();
  }
  S.drag = null;
  commit();
  flushUI();
}

export function bindPointer(): void {
  worldCanvas.addEventListener("pointerdown", onPointerDown);
  worldCanvas.addEventListener("pointermove", onPointerMove);
  worldCanvas.addEventListener("pointerup", endDrag);
  worldCanvas.addEventListener("pointercancel", endDrag);
  worldCanvas.addEventListener("pointerleave", () => {
    S.hoverCell = null;
    S.hoverPt = null;
    S.hoverEdge = null;
    requestDraw();
  });
  worldCanvas.addEventListener("dblclick", (e) => {
    const V = worldView();
    const p = evPos(e);
    const hit = pickAt(V, p);
    if (hit && hit.type === "room") openDetail(hit.id);
    else if (hit && (hit.type === "struct" || hit.type === "edge" || hit.type === "stamp")) {
      // off-grid elements sit on top of rooms — open the room underneath
      const c = cellAt(V, p);
      const r = roomAtCell(c.x, c.y);
      if (r) openDetail(r.id);
    }
  });
  worldCanvas.addEventListener("contextmenu", (e) => e.preventDefault());
  worldCanvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const p = evPos(e);
      zoomAt(S.cam, p.x, p.y, Math.pow(0.999, e.deltaY), worldView());
      requestDraw();
    },
    { passive: false }
  );
}

export { penBox, sT, eT, distToSeg2 };
