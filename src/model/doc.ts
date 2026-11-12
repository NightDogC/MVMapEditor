import { AREA_COLORS, NOTE_COLORS, PENCIL_COLORS, PENCIL_SIZE, STAMP_EMOJI, pickEmoji } from "./constants.ts";
import type { MapDoc, Structure, EdgeStruct, Stamp, Rect, Seg, Pt } from "./types.ts";
import { TICKS, toT, fromT, quantize } from "../geom/lattice.ts";
import { normalize, type TRect } from "../geom/region.ts";
import { normalizeSegs, type TSeg } from "../geom/segs.ts";
import { uid, unck } from "../util.ts";

export const DOC_VERSION = 2;

export function newDoc(name?: string): MapDoc {
  const a = { id: uid("area"), name: "Area 1", color: AREA_COLORS[0] };
  return {
    id: uid("map"),
    version: DOC_VERSION,
    name: name || "Untitled Map",
    updated: Date.now(),
    areas: [a],
    rooms: [],
    doors: [],
    locks: [],
    keys: [],
    structures: [],
    edgeStructs: [],
    stamps: [],
    notes: [],
    pencil: [],
  };
}

/* ── cell units <-> ticks ─────────────────────────────────────────── */
export const rectToT = (r: Rect): TRect => ({ x: toT(r.x), y: toT(r.y), w: toT(r.w), h: toT(r.h) });
export const rectFromT = (r: TRect): Rect => ({ x: fromT(r.x), y: fromT(r.y), w: fromT(r.w), h: fromT(r.h) });
export const segToT = (s: Seg): TSeg => ({ x1: toT(s.x1), y1: toT(s.y1), x2: toT(s.x2), y2: toT(s.y2) });
export const segFromT = (s: TSeg): Seg => ({ x1: fromT(s.x1), y1: fromT(s.y1), x2: fromT(s.x2), y2: fromT(s.y2) });
export const structT = (st: Structure): TRect[] => st.rects.map(rectToT);
export const setStructT = (st: Structure, rs: TRect[]): void => void (st.rects = normalize(rs).map(rectFromT));
export const edgeT = (es: EdgeStruct): TSeg[] => es.segs.map(segToT);
export const setEdgeT = (es: EdgeStruct, ss: TSeg[]): void => void (es.segs = normalizeSegs(ss).map(segFromT));

const fin = (...vs: unknown[]) => vs.every((v) => typeof v === "number" && Number.isFinite(v));
const asObj = (v: unknown): Record<string, any> => (v && typeof v === "object" ? (v as Record<string, any>) : {});

/** 1.x structure cells ("x,y") -> canonical rects. */
export function cellsToRects(cells: string[]): Rect[] {
  const rs: TRect[] = cells.map(unck).filter(([x, y]) => fin(x, y)).map(([x, y]) => ({ x: x * TICKS, y: y * TICKS, w: TICKS, h: TICKS }));
  return normalize(rs).map(rectFromT);
}
/** 1.x edge keys ("h:x,y" / "v:x,y") -> merged segments. */
export function edgesToSegs(edges: string[]): Seg[] {
  const ss: TSeg[] = [];
  for (const k of edges) {
    if (typeof k !== "string" || k[1] !== ":") continue;
    const [x, y] = unck(k.slice(2));
    if (!fin(x, y)) continue;
    const X = x * TICKS, Y = y * TICKS;
    if (k[0] === "h") ss.push({ x1: X, y1: Y, x2: X + TICKS, y2: Y });
    else if (k[0] === "v") ss.push({ x1: X, y1: Y, x2: X, y2: Y + TICKS });
  }
  return normalizeSegs(ss).map(segFromT);
}

function cleanRects(v: unknown): Rect[] {
  const rs = (Array.isArray(v) ? v : []).map(asObj).filter((r) => fin(r.x, r.y, r.w, r.h) && r.w > 0 && r.h > 0);
  return normalize(rs.map((r) => rectToT(r as Rect))).map(rectFromT);
}
function cleanSegs(v: unknown): Seg[] {
  const ss = (Array.isArray(v) ? v : []).map(asObj).filter((s) => fin(s.x1, s.y1, s.x2, s.y2));
  return normalizeSegs(ss.map((s) => segToT(s as Seg))).map(segFromT);
}
/** A stamp point's id as stored: kept when it is a non-empty string not used by an earlier point of the document. */
const usablePointId = (id: unknown, used: Set<string>): id is string => typeof id === "string" && id !== "" && !used.has(id);

/** Stamp points on the lattice, one per position. Points with no usable id (files from before point ids, or a
    duplicated id) get a new one; `usedIds` holds the ids of the whole document, so ids stay unique across stamps. */
function cleanPoints(v: unknown, usedIds: Set<string>): Pt[] {
  const seen = new Set<string>();
  const out: Pt[] = [];
  for (const p of (Array.isArray(v) ? v : []).map(asObj)) {
    if (!fin(p.x, p.y)) continue;
    const x = quantize(p.x), y = quantize(p.y);
    const k = x + "," + y;
    if (seen.has(k)) continue;
    seen.add(k);
    const id = usablePointId(p.id, usedIds) ? p.id : newPointId();
    usedIds.add(id);
    out.push({ id, x, y });
  }
  return out;
}

/** Id for a newly placed stamp point; same format as element ids. */
export const newPointId = (): string => uid("pt");

/** Whether a stored document has a stamp point that migrate() will give a new id (none, or not a usable one). Those
    ids are random, so a document loaded without being saved afterwards would get different ones on every load. */
export function hasStampPointWithoutId(input: unknown): boolean {
  const used = new Set<string>();
  for (const s of (Array.isArray(asObj(input).stamps) ? asObj(input).stamps : []).map(asObj)) {
    if (!Array.isArray(s.points) && Array.isArray(s.cells) && s.cells.length) return true; // 1.x stamp cells
    for (const p of (Array.isArray(s.points) ? s.points : []).map(asObj)) {
      if (!usablePointId(p.id, used)) return true;
      used.add(p.id);
    }
  }
  return false;
}

/** Normalise anything loaded from disk/db so missing fields can't crash the editor, converting 1.x grid-cell
    structures / edge structures / stamps to version-2 geometry on the way, and giving stamp points without an id one. `migrateTypes` is
    UE.migrateTypeData bound to the vocabulary: stamp categories, old type ids, stamp anchors (left out by tests that
    don't load it). */
export function migrate(input: unknown, migrateTypes?: (d: MapDoc) => MapDoc): MapDoc {
  const base = newDoc();
  const d = Object.assign({}, base, asObj(input)) as MapDoc & Record<string, any>;
  d.areas = Array.isArray(d.areas) && d.areas.length ? d.areas : base.areas;
  d.rooms = Array.isArray(d.rooms) ? d.rooms : [];
  d.doors = Array.isArray(d.doors) ? d.doors : [];
  d.locks = Array.isArray(d.locks) ? d.locks : [];
  d.keys = (Array.isArray(d.keys) ? d.keys : []).filter((k) => k && fin(k.x, k.y));
  d.keys.forEach((k) => ((k.x = quantize(k.x)), (k.y = quantize(k.y))));
  delete (d as Record<string, unknown>).detail; // 1.x grey-box data; the grey-box editor is gone
  d.rooms.forEach((r) => {
    r.cells = Array.isArray(r.cells) ? r.cells : [];
    if (!d.areas.some((a) => a.id === r.areaId)) r.areaId = d.areas[0].id;
  });
  d.locks.forEach((l) => (l.keyIds = Array.isArray(l.keyIds) ? l.keyIds : []));

  d.structures = Array.isArray(d.structures) ? d.structures : [];
  d.structures.forEach((s: Structure & { cells?: string[] }) => {
    s.rects = Array.isArray(s.rects) ? cleanRects(s.rects) : cellsToRects(Array.isArray(s.cells) ? s.cells : []);
    delete s.cells;
    if (typeof s.notes !== "string") s.notes = "";
  });
  d.edgeStructs = Array.isArray(d.edgeStructs) ? d.edgeStructs : [];
  d.edgeStructs.forEach((s: EdgeStruct & { edges?: string[] }) => {
    s.segs = Array.isArray(s.segs) ? cleanSegs(s.segs) : edgesToSegs(Array.isArray(s.edges) ? s.edges : []);
    delete s.edges;
    if (typeof s.notes !== "string") s.notes = "";
  });
  d.stamps = Array.isArray(d.stamps) ? d.stamps : [];
  const pointIds = new Set<string>();
  d.stamps.forEach((s: Stamp & { cells?: string[] }) => {
    s.points = Array.isArray(s.points)
      ? cleanPoints(s.points, pointIds)
      : cleanPoints((Array.isArray(s.cells) ? s.cells : []).map(unck).map(([x, y]) => ({ x, y })), pointIds);
    delete s.cells;
    if (typeof s.notes !== "string") s.notes = "";
    s.emoji = pickEmoji(String(s.emoji || "")) || STAMP_EMOJI[0];
  });

  d.pencil = (Array.isArray(d.pencil) ? d.pencil : []).filter(
    (st) => st && Array.isArray(st.pts) && st.pts.length >= 2 && st.pts.length % 2 === 0 && st.pts.every(Number.isFinite)
  );
  d.pencil.forEach((st) => {
    if (!st.id) st.id = uid("pen");
    if (typeof st.color !== "string") st.color = PENCIL_COLORS[0];
    st.size = Number.isFinite(st.size) && st.size > 0 ? st.size : PENCIL_SIZE.def;
  });
  d.notes = (Array.isArray(d.notes) ? d.notes : []).filter((n) => n && fin(n.x, n.y));
  d.notes.forEach((n) => {
    n.x = quantize(n.x);
    n.y = quantize(n.y);
    if (typeof n.name !== "string") n.name = "Note";
    if (typeof n.text !== "string") n.text = "";
    if (!n.color) n.color = NOTE_COLORS[0];
    n.expanded = !!n.expanded;
    if (!(n.box && fin(n.box.dx, n.box.dy))) delete n.box;
  });
  d.version = DOC_VERSION;
  return migrateTypes ? migrateTypes(d) : d;
}
