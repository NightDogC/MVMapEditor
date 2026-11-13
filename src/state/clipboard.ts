/* Copy / paste of rooms, structures, edge structures, stamps and notes.

   The clipboard lives in memory for this tab, so it survives opening another map from the library. A copied piece is
   pasted back into the set it came from (the same structure, edge structure or stamp), so it keeps its name and type;
   when that set doesn't exist in the open map (deleted, or another map) a new set with the same properties is made.
   A note stands alone, so it is pasted as a new note with the same label, text and colour. A copied room brings the
   structure, edge-structure and stamp parts and the notes that would move with it, and is pasted as a new room; doors
   and keys stay behind. */
import type { Room, Structure, EdgeStruct, Stamp, Note } from "../model/types.ts";
import { TICKS, fromT, toT, roundTo } from "../geom/lattice.ts";
import { translate, bbox, type TRect } from "../geom/region.ts";
import { translateSegs, type TSeg } from "../geom/segs.ts";
import { S, reindex, roomById, structById, edgeStructById, stampById, noteById, activeArea, type Sel } from "./store.ts";
import { paintCell, dropEmptyRooms, pruneDoors, roomOwnsEdge } from "./rooms.ts";
import {
  selPiece, roomContents, paintStructArea, addEdgeSegs, placeStamp, dropEmptyStructs, dropEmptyEdgeStructs,
} from "./layers.ts";
import { snapTicks, pxToT } from "./snap.ts";
import { uid, unck } from "../util.ts";

type Props<T> = Omit<T, "rects" | "segs" | "points" | "cells">;
interface Clip {
  /** what was copied, for messages */
  label: string;
  /** whole-cell moves only (a room is in it) */
  whole: boolean;
  /** bounding box in ticks */
  box: { x0: number; y0: number; x1: number; y1: number };
  room?: { props: Props<Room>; cells: [number, number][] };
  structs: { props: Props<Structure>; rects: TRect[] }[];
  edges: { props: Props<EdgeStruct>; segs: TSeg[] }[];
  stamps: { props: Props<Stamp>; pts: { x: number; y: number }[] }[];
  /** whole notes, ids dropped (a pasted note is a new one) */
  notes: Omit<Note, "id">[];
}

let clip: Clip | null = null;
/** Top-left (ticks) of the last paste, so repeated pastes without the pointer on the map line up to the right. */
let lastTL: { x: number; y: number } | null = null;
/** Where the pointer was (world px) at the last copy / paste: a paste only follows the pointer once it has moved. */
let lastPointer: { x: number; y: number } | null = null;
const pointerMoved = () =>
  !!S.hoverPt && (!lastPointer || Math.hypot(S.hoverPt.x - lastPointer.x, S.hoverPt.y - lastPointer.y) * S.cam.zoom > 3);

const props = <T extends object>(it: T): Props<T> => {
  const o = JSON.parse(JSON.stringify(it));
  delete o.rects;
  delete o.segs;
  delete o.points;
  delete o.cells;
  return o;
};

function grow(b: Clip["box"] | null, x0: number, y0: number, x1: number, y1: number): Clip["box"] {
  if (!b) return { x0, y0, x1, y1 };
  return { x0: Math.min(b.x0, x0), y0: Math.min(b.y0, y0), x1: Math.max(b.x1, x1), y1: Math.max(b.y1, y1) };
}
function boxOf(c: Omit<Clip, "box" | "label" | "whole">): Clip["box"] | null {
  let b: Clip["box"] | null = null;
  if (c.room) for (const [x, y] of c.room.cells) b = grow(b, x * TICKS, y * TICKS, (x + 1) * TICKS, (y + 1) * TICKS);
  for (const s of c.structs) {
    const r = bbox(s.rects);
    if (r) b = grow(b, r.x0, r.y0, r.x1, r.y1);
  }
  for (const e of c.edges)
    for (const g of e.segs) b = grow(b, Math.min(g.x1, g.x2), Math.min(g.y1, g.y2), Math.max(g.x1, g.x2), Math.max(g.y1, g.y2));
  for (const s of c.stamps) for (const p of s.pts) b = grow(b, toT(p.x), toT(p.y), toT(p.x) + TICKS, toT(p.y) + TICKS);
  for (const n of c.notes) b = grow(b, toT(n.x), toT(n.y), toT(n.x) + TICKS, toT(n.y) + TICKS);
  return b;
}

/** Copy the selection. Returns what was copied ("Structure piece"…), or null when the selection can't be copied. */
export function copySelection(): string | null {
  const sel = S.sel;
  if (!sel) return null;
  const c: Omit<Clip, "box" | "label" | "whole"> = { structs: [], edges: [], stamps: [], notes: [] };
  const noteCopy = (n: Note): Omit<Note, "id"> => {
    const o = JSON.parse(JSON.stringify(n));
    delete o.id;
    return o;
  };
  let label: string;
  if (sel.type === "room") {
    const room = roomById(sel.id);
    if (!room || !room.cells.length) return null;
    const owned = new Set(room.cells);
    const inside = roomContents(room, owned, roomOwnsEdge(room, owned));
    c.room = { props: props(room), cells: room.cells.map(unck) };
    c.structs = inside.structs.map(({ st, rects }) => ({ props: props(st), rects }));
    c.edges = inside.edges.map(({ es, segs }) => ({ props: props(es), segs }));
    const byStamp = new Map<Stamp, { x: number; y: number }[]>();
    for (const [st, p] of inside.stamps) {
      if (!byStamp.has(st)) byStamp.set(st, []);
      byStamp.get(st)!.push({ x: p.x, y: p.y });
    }
    c.stamps = [...byStamp].map(([st, pts]) => ({ props: props(st), pts }));
    c.notes = inside.notes.map(noteCopy);
    label = `Room “${room.name}”`;
  } else if (sel.type === "struct" || sel.type === "edge") {
    const pc = selPiece();
    if (!pc) return null;
    if (pc.kind === "struct") c.structs = [{ props: props(pc.item), rects: pc.rects }];
    else c.edges = [{ props: props(pc.item), segs: pc.segs }];
    label = `${pc.kind === "struct" ? "Structure" : "Edge structure"} “${pc.item.name}”${pc.whole ? "" : " (one piece)"}`;
  } else if (sel.type === "stamp") {
    const st = stampById(sel.id);
    if (!st) return null;
    const one = sel.pt && st.points.find((p) => p.id === sel.pt!.id);
    const pts = (one ? [one] : st.points).map((p) => ({ x: p.x, y: p.y }));
    if (!pts.length) return null;
    c.stamps = [{ props: props(st), pts }];
    label = `Stamp “${st.name}”${one ? "" : ` (${pts.length} placed)`}`;
  } else if (sel.type === "note") {
    const n = noteById(sel.id);
    if (!n) return null;
    c.notes = [noteCopy(n)];
    label = `Note “${n.name}”`;
  } else return null;
  const box = boxOf(c);
  if (!box) return null;
  clip = { ...c, label, whole: !!c.room, box };
  lastTL = null;
  lastPointer = S.hoverPt && { ...S.hoverPt };
  return label;
}

/** The set a copied piece goes back into: the one it came from, or a new one with its properties. */
function targetSet<T extends { id: string }>(list: T[], find: (id: string) => T | null, p: Props<T>, geom: Partial<T>, prefix: string): T {
  const there = find((p as { id: string }).id);
  if (there) return there;
  const made = { ...(JSON.parse(JSON.stringify(p)) as T), ...geom, id: uid(prefix) };
  list.push(made);
  return made;
}

/** Paste the clipboard centred on the pointer (snapped) once the pointer has moved since the copy / last paste.
    Otherwise (pointer off the map, or still where it was, e.g. over the original), or when the pointer would put it
    exactly on the original, it goes one cell to the right of the last paste / the original, so a paste never lands on
    its source. Selects what was pasted. Returns what was pasted, or null with nothing to paste. */
export function pasteClipboard(): string | null {
  const c = clip;
  if (!c) return null;
  const w = c.box.x1 - c.box.x0, h = c.box.y1 - c.box.y0;
  const step = c.whole ? TICKS : snapTicks();
  let tl: { x: number; y: number } | null = null;
  if (pointerMoved()) {
    tl = { x: roundTo(pxToT(S.hoverPt!.x) - w / 2, step), y: roundTo(pxToT(S.hoverPt!.y) - h / 2, step) };
    if (tl.x === c.box.x0 && tl.y === c.box.y0) tl = null;
  }
  if (!tl) {
    const from = lastTL || { x: c.box.x0, y: c.box.y0 };
    tl = { x: from.x + w + TICKS, y: from.y };
  }
  lastTL = tl;
  lastPointer = S.hoverPt && { ...S.hoverPt };
  const dx = tl.x - c.box.x0, dy = tl.y - c.box.y0;
  let sel: Sel | null = null;

  if (c.room) {
    const area = S.doc.areas.some((a) => a.id === c.room!.props.areaId) ? c.room.props.areaId : activeArea().id;
    const room: Room = { ...JSON.parse(JSON.stringify(c.room.props)), id: uid("room"), name: c.room.props.name + " copy", areaId: area, cells: [] };
    delete room.number; // room numbers are unique within an area
    S.doc.rooms.push(room);
    for (const [x, y] of c.room.cells) paintCell(x + dx / TICKS, y + dy / TICKS, room);
    S.activeRoomId = room.id;
    S.activeAreaId = room.areaId;
    sel = { type: "room", id: room.id };
  }
  for (const s of c.structs) {
    const st = targetSet(S.doc.structures, structById, s.props, { rects: [] } as Partial<Structure>, "struct");
    const rects = translate(s.rects, dx, dy);
    paintStructArea(st, rects);
    const r = rects[0];
    sel ??= { type: "struct", id: st.id, at: { x: r.x + r.w / 2, y: r.y + r.h / 2 } };
  }
  for (const e of c.edges) {
    const es = targetSet(S.doc.edgeStructs, edgeStructById, e.props, { segs: [] } as Partial<EdgeStruct>, "edge");
    const segs = translateSegs(e.segs, dx, dy);
    addEdgeSegs(es, segs);
    const g = segs[0];
    sel ??= { type: "edge", id: es.id, at: { x: (g.x1 + g.x2) / 2, y: (g.y1 + g.y2) / 2 } };
  }
  for (const s of c.stamps) {
    const st = targetSet(S.doc.stamps, stampById, s.props, { points: [] } as Partial<Stamp>, "stamp");
    let placed = 0;
    for (const p of s.pts) if (placeStamp(st, fromT(toT(p.x) + dx), fromT(toT(p.y) + dy))) placed++;
    // a single pasted copy is selected on its own (unless it landed exactly on a copy of the same stamp)
    sel ??= s.pts.length === 1 && placed ? { type: "stamp", id: st.id, pt: st.points[st.points.length - 1] } : { type: "stamp", id: st.id };
  }
  if (c.notes.length) {
    const pasted = c.notes.map((n): Note => ({ ...JSON.parse(JSON.stringify(n)), id: uid("note"), x: fromT(toT(n.x) + dx), y: fromT(toT(n.y) + dy) }));
    // at most one note at any exact spot: one already there gives way, as when a room carries its notes
    const landing = new Set(pasted.map((n) => n.x + "," + n.y));
    S.doc.notes = S.doc.notes.filter((n) => !landing.has(n.x + "," + n.y)).concat(pasted);
    sel ??= { type: "note", id: pasted[0].id };
  }
  dropEmptyRooms();
  dropEmptyStructs();
  dropEmptyEdgeStructs();
  reindex();
  pruneDoors();
  S.sel = sel;
  return c.label;
}

export const hasClipboard = (): boolean => !!clip;

