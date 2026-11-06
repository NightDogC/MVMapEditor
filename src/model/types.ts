/* Document model, format version 2. Everything is in grid cells; off-grid geometry (structures, edge structures,
   stamps, notes, keys) may be fractional, kept on the 1/96-cell lattice (see geom/lattice.ts). Rooms and doors
   stay on whole cells / cell edges. */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface Seg {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}
export interface Pt {
  x: number;
  y: number;
}

export interface Area {
  id: string;
  name: string;
  color: string;
  /** ENSRegionList enum name from mvmap-types.js */
  region?: string | null;
  letter?: string | null;
}

export type LabelPos = "tl" | "tr" | "bl" | "br";

export interface Room {
  id: string;
  name: string;
  areaId: string;
  /** null = inherit the area colour */
  color: string | null;
  notes: string;
  /** "x,y" whole cells */
  cells: string[];
  /** positive integer, unique within the area */
  number?: number | null;
  labelPos?: LabelPos;
  hideName?: boolean;
}

/** A "v" edge at (x,y) divides cells (x-1,y) | (x,y); an "h" edge at (x,y) divides (x,y-1) / (x,y). */
export interface Door {
  id: string;
  x: number;
  y: number;
  o: "v" | "h";
  kind: "passage" | "door" | "oneway" | "locked";
  dir: 1 | -1;
  lockId: string | null;
}

export interface Lock {
  id: string;
  name: string;
  color: string;
  keyIds: string[];
  hideName?: boolean;
}

/** x, y: top-left of the 1×1 marker box (centre at +0.5). */
export interface Key {
  id: string;
  name: string;
  color: string;
  x: number;
  y: number;
  hideName?: boolean;
}

interface Element {
  id: string;
  name: string;
  color: string;
  notes: string;
  /** element type from mvmap-types.js; null = unclassified */
  typeId?: string | null;
  hideName?: boolean;
}
/** Axis-aligned rectangles, canonical (non-overlapping, see geom/region.ts); the layer is exclusive. */
export interface Structure extends Element {
  rects: Rect[];
}
/** Line segments, any angle; collinear overlaps are merged within a set and exclusive across sets. */
export interface EdgeStruct extends Element {
  segs: Seg[];
}
/** Emoji markers; each point is the top-left of a 1×1 box. */
export interface Stamp extends Element {
  emoji: string;
  points: Pt[];
}

export interface Note {
  id: string;
  name: string;
  text: string;
  color: string;
  /** top-left of the 1×1 note box */
  x: number;
  y: number;
  expanded: boolean;
  /** open box offset from its default spot, screen px */
  box?: { dx: number; dy: number };
  hideName?: boolean;
}

/** Freehand stroke in world px (one cell = 32 px), flat [x0,y0,x1,y1,…]. */
export interface PencilStroke {
  id: string;
  color: string;
  size: number;
  pts: number[];
}

export interface MapDoc {
  id: string;
  version: number;
  name: string;
  updated: number;
  areas: Area[];
  rooms: Room[];
  doors: Door[];
  locks: Lock[];
  keys: Key[];
  structures: Structure[];
  edgeStructs: EdgeStruct[];
  stamps: Stamp[];
  notes: Note[];
  pencil: PencilStroke[];
}

export type ElementLayer = "structure" | "edge" | "stamp";
