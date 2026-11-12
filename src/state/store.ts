import type { MapDoc, Door, Pt } from "../model/types.ts";
import { newDoc, migrate } from "../model/doc.ts";
import { AREA_COLORS, PENCIL_COLORS, PENCIL_SIZE, ERASER_SIZE, STRUCT_COLORS } from "../model/constants.ts";
import { DEFAULT_SNAP } from "../geom/lattice.ts";
import { UE, TYPES_FILE } from "../ue.ts";
import { ck } from "../util.ts";
import { scheduleSave } from "./persist.ts";
import { renderUI } from "../ui/panels.ts";

export type Tool =
  | "select" | "paint" | "rect" | "erase" | "door" | "key" | "pan"
  | "spaint" | "srect" | "serase" | "edge" | "stamp" | "note" | "pencil" | "perase";

export type SelType = "room" | "door" | "key" | "lock" | "struct" | "edge" | "stamp" | "note";
/** What's selected. On the map, structure / edge selections carry `at` (a tick point inside the piece) and mean
    just that connected piece; stamp selections carry `pt`, the one placed copy. From a list they mean the whole set. */
export interface Sel {
  type: SelType;
  id: string;
  at?: { x: number; y: number };
  pt?: Pt;
}

export interface PencilPrefs {
  color: string;
  size: number;
  eraser: number;
}

export const S = {
  doc: newDoc() as MapDoc,
  cam: { x: 0, y: 0, zoom: 1 },
  tool: "paint" as Tool,
  sel: null as Sel | null,
  activeRoomId: null as string | null,
  activeAreaId: null as string | null,
  activeStructId: null as string | null,
  activeEdgeId: null as string | null,
  activeStampId: null as string | null,
  showFlow: false,
  showLabels: true,
  showStructs: true,
  showStructLabels: true,
  showNotes: true,
  showPencil: true,
  pencil: { color: PENCIL_COLORS[1], size: PENCIL_SIZE.def, eraser: ERASER_SIZE.def } as PencilPrefs, // per browser
  hoverPt: null as { x: number; y: number } | null, // pointer position in world px
  highlightManual: false, // fade everything but the elements the UE importer leaves for hand placement
  rclick: "remove" as "remove" | "pan", // right mouse button: "remove" (like Ctrl) | "pan" (hold and drag)
  stampZoom: 60, // stamp names show once the zoom is above this percentage
  snap: DEFAULT_SNAP, // snap step id for off-grid layers (geom/lattice.ts SNAP_STEPS)
  lastFixedSnap: DEFAULT_SNAP, // what Alt snaps to while the step is "free"
  altDown: false, // Alt held: snapping temporarily toggled
  hoverCell: null as { x: number; y: number } | null,
  hoverEdge: null as { o: "v" | "h"; x: number; y: number } | null,
  drag: null as any,
  spaceDown: false,
};

/** Indexes rebuilt by reindex(): whole-cell rooms and doors. */
export const idx = {
  cell: new Map<string, string>(), // "x,y" -> roomId
  door: new Map<string, Door>(), // "o:x,y" -> door
};
/** Render-loop flags and the world canvas size in CSS px. */
export const app = { needsDraw: true, VW: 0, VH: 0 };
export const requestDraw = (): void => void (app.needsDraw = true);

export const undoStack: string[] = [];
export const redoStack: string[] = [];

export const migrateDoc = (d: unknown): MapDoc =>
  migrate(d, (x) => UE.migrateTypeData(x, TYPES_FILE));

export function reindex(): void {
  idx.cell = new Map();
  for (const r of S.doc.rooms) for (const c of r.cells) idx.cell.set(c, r.id);
  idx.door = new Map();
  for (const d of S.doc.doors) idx.door.set(d.o + ":" + d.x + "," + d.y, d);
}

/* ── lookups ─────────────────────────────────────────────────────── */
export const roomById = (id: string | null | undefined) => S.doc.rooms.find((r) => r.id === id) || null;
export const areaById = (id: string | null | undefined) => S.doc.areas.find((a) => a.id === id) || S.doc.areas[0];
export const lockById = (id: string | null | undefined) => S.doc.locks.find((l) => l.id === id) || null;
export const keyById = (id: string | null | undefined) => S.doc.keys.find((k) => k.id === id) || null;
export const structById = (id: string | null | undefined) => S.doc.structures.find((s) => s.id === id) || null;
export const edgeStructById = (id: string | null | undefined) => S.doc.edgeStructs.find((s) => s.id === id) || null;
export const stampById = (id: string | null | undefined) => S.doc.stamps.find((s) => s.id === id) || null;
export const noteById = (id: string | null | undefined) => S.doc.notes.find((n) => n.id === id) || null;
export const roomAtCell = (x: number, y: number) => roomById(idx.cell.get(ck(x, y)));
export const doorAtEdge = (o: string, x: number, y: number) => idx.door.get(o + ":" + x + "," + y) || null;
export const roomColor = (r: { color: string | null; areaId: string } | null) => (r && (r.color || areaById(r.areaId).color)) || AREA_COLORS[0];
export const structColor = (s: { color?: string } | null) => (s && s.color) || STRUCT_COLORS[0];

export function activeRoom() {
  let r = roomById(S.activeRoomId);
  if (!r && S.sel && S.sel.type === "room") r = roomById(S.sel.id);
  return r;
}
export function activeArea() {
  return areaById(S.activeAreaId) || S.doc.areas[0];
}
export function activeStruct() {
  let s = structById(S.activeStructId);
  if (!s && S.sel && S.sel.type === "struct") s = structById(S.sel.id);
  return s;
}
export function activeEdgeStruct() {
  let s = edgeStructById(S.activeEdgeId);
  if (!s && S.sel && S.sel.type === "edge") s = edgeStructById(S.sel.id);
  return s;
}
export function activeStamp() {
  let s = stampById(S.activeStampId);
  if (!s && S.sel && S.sel.type === "stamp") s = stampById(S.sel.id);
  return s;
}
/** Switching area drops the paint target if it belongs elsewhere, so the next stroke starts a fresh room in the
    area you just picked. */
export function setActiveArea(id: string): void {
  S.activeAreaId = id;
  const r = activeRoom();
  if (r && r.areaId !== id) {
    S.activeRoomId = null;
    if (S.sel && S.sel.type === "room") S.sel = null;
  }
}

export function selExists(sel: Sel | null): boolean {
  if (!sel) return false;
  switch (sel.type) {
    case "room": return !!roomById(sel.id);
    case "lock": return !!lockById(sel.id);
    case "key": return !!keyById(sel.id);
    case "door": return S.doc.doors.some((d) => d.id === sel.id);
    case "struct": return !!structById(sel.id);
    case "edge": return !!edgeStructById(sel.id);
    case "stamp": return !!stampById(sel.id);
    case "note": return !!noteById(sel.id);
  }
  return false;
}

/* ── undo ────────────────────────────────────────────────────────── */
const UNDO_MAX = 120;
export const snapshot = (): string => JSON.stringify(S.doc);
export function pushUndo(): void {
  recordUndo(snapshot());
}
/** pushUndo for a snapshot taken earlier — some edits only know they changed something after the fact. */
export function recordUndo(json: string): void {
  undoStack.push(json);
  if (undoStack.length > UNDO_MAX) undoStack.shift();
  redoStack.length = 0;
}
function restore(json: string): void {
  S.doc = migrateDoc(JSON.parse(json));
  if (S.sel && !selExists(S.sel)) S.sel = null;
  if (!roomById(S.activeRoomId)) S.activeRoomId = null;
  if (!structById(S.activeStructId)) S.activeStructId = null;
  if (!edgeStructById(S.activeEdgeId)) S.activeEdgeId = null;
  if (!stampById(S.activeStampId)) S.activeStampId = null;
  commit();
}
export function undo(): void {
  if (!undoStack.length) return;
  redoStack.push(snapshot());
  restore(undoStack.pop()!);
}
export function redo(): void {
  if (!redoStack.length) return;
  undoStack.push(snapshot());
  restore(redoStack.pop()!);
}

/** Call after every mutation: reindex, redraw, refresh panels, autosave. Pass true for selection-only changes that
    don't touch the document. */
let uiDirty = false;
export function commit(skipSave?: boolean): void {
  reindex();
  app.needsDraw = true;
  // Rebuilding every panel on each step of a paint drag is wasteful — defer to drag end.
  if (S.drag) uiDirty = true;
  else renderUI();
  if (!skipSave) scheduleSave();
}
export function flushUI(): void {
  if (!uiDirty) return;
  uiDirty = false;
  renderUI();
}
