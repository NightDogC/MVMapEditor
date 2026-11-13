/* Off-grid layers: structures (rect regions), edge structures (segments), stamps (points), notes.
   Geometry operations run in ticks (geom/lattice.ts); documents keep cell units. */
import type { Structure, EdgeStruct, Stamp, Note, Room, Pt } from "../model/types.ts";
import { STRUCT_COLORS, STAMP_EMOJI, NOTE_COLORS } from "../model/constants.ts";
import { structT, setStructT, edgeT, setEdgeT, newPointId } from "../model/doc.ts";
import { TICKS, toT, fromT } from "../geom/lattice.ts";
import { normalize, union, subtract, intersect, isEmpty, components, containsPoint, translate, bbox, type TRect } from "../geom/region.ts";
import { normalizeSegs, subtractCollinear, eraseBox, segComponents, splitByCells, translateSegs, distToSeg2, type TSeg } from "../geom/segs.ts";
import { S, structById, edgeStructById } from "./store.ts";
import { markerCell } from "./rooms.ts";
import { UE } from "../ue.ts";
import { uid, ck, unck } from "../util.ts";

/* ── cached tick views (documents replace arrays on every change, so the array is the cache key) ── */
const rectsT = new WeakMap<object, TRect[]>();
const piecesT = new WeakMap<object, TRect[][]>();
const segsT = new WeakMap<object, TSeg[]>();
const segPiecesT = new WeakMap<object, TSeg[][]>();
export function sT(st: Structure): TRect[] {
  let v = rectsT.get(st.rects);
  if (!v) rectsT.set(st.rects, (v = structT(st)));
  return v;
}
export function sPieces(st: Structure): TRect[][] {
  let v = piecesT.get(st.rects);
  if (!v) piecesT.set(st.rects, (v = components(sT(st))));
  return v;
}
export function eT(es: EdgeStruct): TSeg[] {
  let v = segsT.get(es.segs);
  if (!v) segsT.set(es.segs, (v = edgeT(es)));
  return v;
}
export function ePieces(es: EdgeStruct): TSeg[][] {
  let v = segPiecesT.get(es.segs);
  if (!v) segPiecesT.set(es.segs, (v = segComponents(eT(es))));
  return v;
}

const boxesMeet = (a: { x0: number; y0: number; x1: number; y1: number } | null, b: { x0: number; y0: number; x1: number; y1: number } | null) =>
  !!a && !!b && a.x0 <= b.x1 && b.x0 <= a.x1 && a.y0 <= b.y1 && b.y0 <= a.y1;

/* ── structures ──────────────────────────────────────────────────── */
export function createStruct(): Structure {
  const n = S.doc.structures.length;
  const s: Structure = { id: uid("struct"), name: UE.defaultElementName("structure", n + 1), color: STRUCT_COLORS[n % STRUCT_COLORS.length], notes: "", rects: [], typeId: null };
  S.doc.structures.push(s);
  S.activeStructId = s.id;
  return s;
}
/** Take `region` away from every structure except `keep`. */
function clearStructArea(region: TRect[], keep: Structure | null): boolean {
  const rb = bbox(region);
  let changed = false;
  for (const o of S.doc.structures) {
    if (o === keep || !boxesMeet(bbox(sT(o)), rb)) continue;
    const rest = subtract(sT(o), region);
    if (rest.length === sT(o).length && rest.every((r, i) => sameRect(r, sT(o)[i]))) continue;
    setStructT(o, rest);
    changed = true;
  }
  return changed;
}
const sameRect = (a: TRect, b: TRect) => a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
const sameRects = (a: TRect[], b: TRect[]) => a.length === b.length && a.every((r, i) => sameRect(r, b[i]));

/** Paint `region` into `st`; the layer is exclusive, so it leaves whichever structure had it. */
export function paintStructArea(st: Structure, region: TRect[]): boolean {
  const changed = clearStructArea(region, st);
  const next = union(sT(st), region);
  if (sameRects(next, sT(st))) return changed;
  setStructT(st, next);
  return true;
}
/** Remove `region` from every structure. */
export const eraseStructArea = (region: TRect[]): boolean => clearStructArea(region, null);

export function dropEmptyStructs(): void {
  const gone = new Set(S.doc.structures.filter((s) => !s.rects.length).map((s) => s.id));
  if (!gone.size) return;
  S.doc.structures = S.doc.structures.filter((s) => !gone.has(s.id));
  if (S.activeStructId && gone.has(S.activeStructId)) S.activeStructId = null;
  if (S.sel && S.sel.type === "struct" && gone.has(S.sel.id)) S.sel = null;
}
export function deleteStruct(id: string): void {
  S.doc.structures = S.doc.structures.filter((s) => s.id !== id);
  if (S.activeStructId === id) S.activeStructId = null;
  if (S.sel && S.sel.id === id) S.sel = null;
}
/** Structure and connected piece under a tick point (structures don't overlap, so there's at most one). */
export function structPieceAt(tx: number, ty: number): { st: Structure; piece: TRect[] } | null {
  for (let i = S.doc.structures.length - 1; i >= 0; i--) {
    const st = S.doc.structures[i];
    if (!containsPoint(sT(st), tx, ty)) continue;
    const piece = sPieces(st).find((p) => containsPoint(p, tx, ty));
    if (piece) return { st, piece };
  }
  return null;
}

/* ── edge structures ─────────────────────────────────────────────── */
export function createEdgeStruct(): EdgeStruct {
  const n = S.doc.edgeStructs.length;
  const s: EdgeStruct = { id: uid("edge"), name: UE.defaultElementName("edge", n + 1), color: STRUCT_COLORS[(n + 4) % STRUCT_COLORS.length], notes: "", segs: [], typeId: null };
  S.doc.edgeStructs.push(s);
  S.activeEdgeId = s.id;
  return s;
}
const sameSegs = (a: TSeg[], b: TSeg[]) =>
  a.length === b.length && a.every((s, i) => s.x1 === b[i].x1 && s.y1 === b[i].y1 && s.x2 === b[i].x2 && s.y2 === b[i].y2);
/** Add segments to `es`; collinear overlaps leave whichever other set had them. */
export function addEdgeSegs(es: EdgeStruct, segs: TSeg[]): boolean {
  let changed = false;
  for (const o of S.doc.edgeStructs) {
    if (o === es) continue;
    const rest = subtractCollinear(eT(o), segs);
    if (sameSegs(rest, eT(o))) continue;
    setEdgeT(o, rest);
    changed = true;
  }
  const next = normalizeSegs([...eT(es), ...segs]);
  if (sameSegs(next, eT(es))) return changed;
  setEdgeT(es, next);
  return true;
}
/** Cut every edge structure where it passes through the box. */
export function eraseEdgeBox(box: TRect): boolean {
  let changed = false;
  for (const es of S.doc.edgeStructs) {
    const rest = eraseBox(eT(es), box);
    if (sameSegs(rest, eT(es))) continue;
    setEdgeT(es, rest);
    changed = true;
  }
  return changed;
}
export function dropEmptyEdgeStructs(): void {
  const gone = new Set(S.doc.edgeStructs.filter((s) => !s.segs.length).map((s) => s.id));
  if (!gone.size) return;
  S.doc.edgeStructs = S.doc.edgeStructs.filter((s) => !gone.has(s.id));
  if (S.activeEdgeId && gone.has(S.activeEdgeId)) S.activeEdgeId = null;
  if (S.sel && S.sel.type === "edge" && gone.has(S.sel.id)) S.sel = null;
}
export function deleteEdgeStruct(id: string): void {
  S.doc.edgeStructs = S.doc.edgeStructs.filter((s) => s.id !== id);
  if (S.activeEdgeId === id) S.activeEdgeId = null;
  if (S.sel && S.sel.id === id) S.sel = null;
}
/** Nearest edge segment within `tol` ticks of a tick point, topmost set first on ties. */
export function edgeSegAt(tx: number, ty: number, tol: number): { es: EdgeStruct; seg: TSeg; piece: TSeg[] } | null {
  let best: { es: EdgeStruct; seg: TSeg; piece: TSeg[] } | null = null, bd = tol * tol;
  for (let i = S.doc.edgeStructs.length - 1; i >= 0; i--) {
    const es = S.doc.edgeStructs[i];
    for (const piece of ePieces(es))
      for (const seg of piece) {
        const d = distToSeg2(seg, tx, ty);
        if (d < bd) {
          bd = d;
          best = { es, seg, piece };
        }
      }
  }
  return best;
}

/* ── stamps ──────────────────────────────────────────────────────── */
export function createStamp(): Stamp {
  const n = S.doc.stamps.length;
  const s: Stamp = {
    id: uid("stamp"),
    name: UE.defaultElementName("stamp", n + 1),
    emoji: STAMP_EMOJI[n % STAMP_EMOJI.length],
    color: STRUCT_COLORS[(n + 5) % STRUCT_COLORS.length],
    notes: "",
    points: [],
    typeId: null,
    anchor: UE.defaultStampAnchor(null),
  };
  S.doc.stamps.push(s);
  S.activeStampId = s.id;
  return s;
}
const samePt = (a: Pt, b: Pt) => a.x === b.x && a.y === b.y;
/** Put a copy of `st` at (x, y) (cell units, top-left); a stamp already at exactly that spot gives way (that point is
    deleted, its id with it). The new point gets a new id, or `id` when an existing point is being put back (a room move). */
export function placeStamp(st: Stamp, x: number, y: number, id: string = newPointId()): boolean {
  const p = { id, x, y };
  if (st.points.some((q) => samePt(q, p))) return false;
  for (const o of S.doc.stamps) if (o.points.some((q) => samePt(q, p))) o.points = o.points.filter((q) => !samePt(q, p));
  st.points = [...st.points, p];
  return true;
}
/** Whether any stamp point (of any stamp) sits exactly at (x, y). */
export const stampSpotTaken = (x: number, y: number): boolean => S.doc.stamps.some((s) => s.points.some((o) => o.x === x && o.y === y));
/** Drag point `p` of `st` to (x, y), keeping its id. Never drops it exactly onto another point (its own old spot
    included): returns the moved point, or null when the spot is taken and nothing changed. */
export function moveStampPoint(st: Stamp, p: Pt, x: number, y: number): Pt | null {
  if (stampSpotTaken(x, y)) return null;
  const np = { id: p.id, x, y };
  st.points = st.points.map((o) => (o === p ? np : o));
  return np;
}
export function removeStampPoint(st: Stamp, p: Pt): void {
  st.points = st.points.filter((q) => !samePt(q, p));
}
export function deleteStamp(id: string): void {
  S.doc.stamps = S.doc.stamps.filter((s) => s.id !== id);
  if (S.activeStampId === id) S.activeStampId = null;
  if (S.sel && S.sel.id === id) S.sel = null;
}
/** Topmost stamp copy whose 1×1 box holds the tick point. */
export function stampAt(tx: number, ty: number): { st: Stamp; pt: Pt } | null {
  for (let i = S.doc.stamps.length - 1; i >= 0; i--) {
    const st = S.doc.stamps[i];
    for (let j = st.points.length - 1; j >= 0; j--) {
      const p = st.points[j], px = toT(p.x), py = toT(p.y);
      if (tx >= px && tx < px + TICKS && ty >= py && ty < py + TICKS) return { st, pt: p };
    }
  }
  return null;
}
/** Topmost key whose 1×1 box holds the tick point. */
export function keyAt(tx: number, ty: number) {
  for (let i = S.doc.keys.length - 1; i >= 0; i--) {
    const k = S.doc.keys[i], px = toT(k.x), py = toT(k.y);
    if (tx >= px && tx < px + TICKS && ty >= py && ty < py + TICKS) return k;
  }
  return null;
}

/* ── notes ───────────────────────────────────────────────────────── */
export function createNoteAt(x: number, y: number): Note {
  const n: Note = { id: uid("note"), name: "Note " + (S.doc.notes.length + 1), text: "", color: NOTE_COLORS[0], x, y, expanded: false };
  S.doc.notes.push(n);
  return n;
}
export function deleteNote(id: string): void {
  S.doc.notes = S.doc.notes.filter((n) => n.id !== id);
  if (S.sel && S.sel.id === id) S.sel = null;
}

/* ── selected pieces ─────────────────────────────────────────────── */
export type Piece =
  | { kind: "struct"; item: Structure; rects: TRect[]; whole: boolean }
  | { kind: "edge"; item: EdgeStruct; segs: TSeg[]; whole: boolean };

/** The selected structure / edge-structure piece: the connected piece holding the selection's anchor, or the whole
    set when selected from the list (or once the anchor is gone). */
export function selPiece(): Piece | null {
  const sel = S.sel;
  if (!sel) return null;
  if (sel.type === "struct") {
    const st = structById(sel.id);
    if (!st) return null;
    const all = sT(st);
    const part = sel.at ? sPieces(st).find((p) => containsPoint(p, sel.at!.x, sel.at!.y)) : null;
    return part && part.length !== all.length ? { kind: "struct", item: st, rects: part, whole: false } : { kind: "struct", item: st, rects: all, whole: true };
  }
  if (sel.type === "edge") {
    const es = edgeStructById(sel.id);
    if (!es) return null;
    const all = eT(es);
    const part = sel.at ? ePieces(es).find((p) => p.some((s) => distToSeg2(s, sel.at!.x, sel.at!.y) < 1)) : null;
    return part && part.length !== all.length ? { kind: "edge", item: es, segs: part, whole: false } : { kind: "edge", item: es, segs: all, whole: true };
  }
  return null;
}
/** Delete the selected piece; the set itself goes once it has nothing left. */
export function deleteSelPiece(): void {
  const pc = selPiece();
  if (!pc) return;
  if (pc.kind === "struct") {
    setStructT(pc.item, subtract(sT(pc.item), pc.rects));
    if (!pc.item.rects.length) deleteStruct(pc.item.id);
  } else {
    const gone = new Set(pc.segs);
    setEdgeT(pc.item, eT(pc.item).filter((s) => !gone.has(s)));
    if (!pc.item.segs.length) deleteEdgeStruct(pc.item.id);
  }
  S.sel = null;
}

/** Drag a structure piece. Every step recomputes from the layer as it was when the drag began, so passing over
    other geometry never eats it; only the final position displaces what's underneath. */
export function beginStructMove(st: Structure, piece: TRect[]) {
  const base = new Map(S.doc.structures.map((o) => [o, { rects: o.rects, t: sT(o) }] as const));
  const own = subtract(sT(st), piece);
  return (dx: number, dy: number) => {
    const moved = translate(piece, dx, dy);
    const mb = bbox(moved);
    for (const [o, b] of base) {
      if (o === st) setStructT(o, union(own, moved));
      else if (boxesMeet(bbox(b.t), mb)) setStructT(o, subtract(b.t, moved));
      else o.rects = b.rects;
    }
  };
}
export function beginEdgeMove(es: EdgeStruct, piece: TSeg[]) {
  const base = new Map(S.doc.edgeStructs.map((o) => [o, { segs: o.segs, t: eT(o) }] as const));
  const inPiece = new Set(piece);
  const own = eT(es).filter((s) => !inPiece.has(s));
  return (dx: number, dy: number) => {
    const moved = translateSegs(piece, dx, dy);
    for (const [o, b] of base) {
      if (o === es) setEdgeT(o, [...own, ...moved]);
      else {
        const rest = subtractCollinear(b.t, moved);
        if (sameSegs(rest, b.t)) o.segs = b.segs;
        else setEdgeT(o, rest);
      }
    }
  };
}

type OwnsEdge = (e: { o: string; x: number; y: number }) => boolean;

/** Everything off-grid that sits on a room, without changing anything: the parts of structures inside its cells
    (ticks), the parts of edge structures inside it or on edges it owns (ticks), and the stamp points, notes and keys
    centred in it. */
export function roomContents(room: Room, owned: Set<string>, ownsEdge: OwnsEdge) {
  const roomRegion = normalize(room.cells.map(unck).map(([x, y]) => ({ x: x * TICKS, y: y * TICKS, w: TICKS, h: TICKS })));
  const inRoom = (x: number, y: number) => owned.has(ck(...markerCell(x, y)));
  const insideMid = (mx: number, my: number) => {
    const onV = mx % TICKS === 0 && my % TICKS !== 0, onH = my % TICKS === 0 && mx % TICKS !== 0;
    if (onV) return ownsEdge({ o: "v", x: mx / TICKS, y: Math.floor(my / TICKS) });
    if (onH) return ownsEdge({ o: "h", x: Math.floor(mx / TICKS), y: my / TICKS });
    return owned.has(ck(Math.floor(mx / TICKS), Math.floor(my / TICKS)));
  };

  const structs: { st: Structure; rects: TRect[]; rest: TRect[] }[] = [];
  for (const st of S.doc.structures) {
    const rects = intersect(sT(st), roomRegion);
    if (!isEmpty(rects)) structs.push({ st, rects, rest: subtract(sT(st), roomRegion) });
  }
  const edges: { es: EdgeStruct; segs: TSeg[]; rest: TSeg[] }[] = [];
  for (const es of S.doc.edgeStructs) {
    const split = splitByCells(eT(es), TICKS, insideMid);
    if (split.in.length) edges.push({ es, segs: split.in, rest: split.out });
  }
  const stamps: [Stamp, Pt][] = [];
  for (const st of S.doc.stamps)
    for (const p of st.points) if (inRoom(p.x, p.y)) stamps.push([st, p]);
  const notes = S.doc.notes.filter((n) => inRoom(n.x, n.y));
  const keys = S.doc.keys.filter((k) => inRoom(k.x, k.y));
  return { structs, edges, stamps, notes, keys };
}

/** Lift everything off-grid that sits on a room about to move (roomContents). Returns the function that puts it
    down again shifted by (dx, dy) whole cells. */
export function carryOffGrid(room: Room, owned: Set<string>, ownsEdge: OwnsEdge) {
  const lifted = roomContents(room, owned, ownsEdge);
  const structs = lifted.structs.map(({ st, rects, rest }) => (setStructT(st, rest), [st, rects] as const));
  const edges = lifted.edges.map(({ es, segs, rest }) => (setEdgeT(es, rest), [es, segs] as const));
  const { stamps, notes, keys } = lifted;
  for (const [st, p] of stamps) removeStampPoint(st, p);

  return (dx: number, dy: number) => {
    const DX = dx * TICKS, DY = dy * TICKS;
    for (const [st, m] of structs) paintStructArea(st, translate(m, DX, DY));
    for (const [es, segs] of edges) addEdgeSegs(es, translateSegs(segs, DX, DY));
    for (const [st, p] of stamps) placeStamp(st, p.x + dx, p.y + dy, p.id);
    // notes ride along; one already sitting exactly at the destination gives way
    const moving = new Set(notes);
    const landing = new Set(notes.map((n) => ck(n.x + dx, n.y + dy)));
    S.doc.notes = S.doc.notes.filter((n) => moving.has(n) || !landing.has(ck(n.x, n.y)));
    notes.forEach((n) => ((n.x += dx), (n.y += dy)));
    keys.forEach((k) => ((k.x += dx), (k.y += dy)));
    dropEmptyStructs();
    dropEmptyEdgeStructs();
  };
}

/** Bounding box of the whole document in cell units (fractional), or null when empty. */
export function docBBox(): { x0: number; y0: number; x1: number; y1: number } | null {
  let b: { x0: number; y0: number; x1: number; y1: number } | null = null;
  const grow = (x0: number, y0: number, x1: number, y1: number) => {
    if (!b) b = { x0, y0, x1, y1 };
    else {
      b.x0 = Math.min(b.x0, x0);
      b.y0 = Math.min(b.y0, y0);
      b.x1 = Math.max(b.x1, x1);
      b.y1 = Math.max(b.y1, y1);
    }
  };
  for (const r of S.doc.rooms) for (const c of r.cells) {
    const [x, y] = unck(c);
    grow(x, y, x + 1, y + 1);
  }
  for (const k of S.doc.keys) grow(k.x, k.y, k.x + 1, k.y + 1);
  for (const n of S.doc.notes) grow(n.x, n.y, n.x + 1, n.y + 1);
  for (const s of S.doc.stamps) for (const p of s.points) grow(p.x, p.y, p.x + 1, p.y + 1);
  for (const s of S.doc.structures) {
    const bb = bbox(sT(s));
    if (bb) grow(fromT(bb.x0), fromT(bb.y0), fromT(bb.x1), fromT(bb.y1));
  }
  for (const s of S.doc.edgeStructs) for (const g of s.segs) grow(Math.min(g.x1, g.x2), Math.min(g.y1, g.y2), Math.max(g.x1, g.x2), Math.max(g.y1, g.y2));
  for (const st of S.doc.pencil)
    for (let i = 0; i < st.pts.length; i += 2) grow(st.pts[i] / 32, st.pts[i + 1] / 32, st.pts[i] / 32, st.pts[i + 1] / 32);
  return b;
}

