/* Whole-cell layer: rooms, doors, keys, locks; plus the room move that carries everything sitting on a room. */
import type { Room, Door } from "../model/types.ts";
import { CELL, LOCK_COLORS } from "../model/constants.ts";
import { S, idx, reindex, roomById, areaById, keyById } from "./store.ts";
import { carryOffGrid } from "./layers.ts";
import { closeDetail } from "../ui/detail.ts";
import { uid, ck, unck } from "../util.ts";

/* ── edges (doors) ───────────────────────────────────────────────── */
/** World-pixel endpoints of an edge. */
export function edgeEnds(e: { o: string; x: number; y: number }): [number, number, number, number] {
  return e.o === "v"
    ? [e.x * CELL, e.y * CELL, e.x * CELL, (e.y + 1) * CELL]
    : [e.x * CELL, e.y * CELL, (e.x + 1) * CELL, e.y * CELL];
}
/** Midpoint of a door edge, in world pixels. */
export function edgeMid(d: { o: string; x: number; y: number }) {
  return d.o === "v" ? { x: d.x * CELL, y: d.y * CELL + CELL / 2 } : { x: d.x * CELL + CELL / 2, y: d.y * CELL };
}
export function edgeCells(d: { o: string; x: number; y: number }): [number, number][] {
  return d.o === "v" ? [[d.x - 1, d.y], [d.x, d.y]] : [[d.x, d.y - 1], [d.x, d.y]];
}
/** Nearest cell edge to a world point, or null if the point is mid-cell. */
export function nearestEdge(wx: number, wy: number, tol = 0.28): { o: "v" | "h"; x: number; y: number } | null {
  const fx = wx / CELL, fy = wy / CELL;
  const cx = Math.floor(fx), cy = Math.floor(fy);
  const dx = fx - cx, dy = fy - cy;
  const cands = [
    { o: "v" as const, x: cx, y: cy, d: dx },
    { o: "v" as const, x: cx + 1, y: cy, d: 1 - dx },
    { o: "h" as const, x: cx, y: cy, d: dy },
    { o: "h" as const, x: cx, y: cy + 1, d: 1 - dy },
  ];
  cands.sort((a, b) => a.d - b.d);
  return cands[0].d <= tol ? { o: cands[0].o, x: cands[0].x, y: cands[0].y } : null;
}
/** Drop doors that no longer touch any room. */
export function pruneDoors(): void {
  S.doc.doors = S.doc.doors.filter((d) => edgeCells(d).some(([x, y]) => idx.cell.has(ck(x, y))));
}

/** Whole cell under the centre of a 1×1 marker at (x, y) (cell units, top-left). */
export const markerCell = (x: number, y: number): [number, number] => [Math.floor(x + 0.5), Math.floor(y + 0.5)];

export function roomBBox(room: { cells: string[] } | null) {
  if (!room || !room.cells.length) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const c of room.cells) {
    const [x, y] = unck(c);
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  }
  return { x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/* ── mutations ───────────────────────────────────────────────────── */
export function createRoom(areaId?: string | null): Room {
  const area = areaById(areaId || S.activeAreaId);
  const n = S.doc.rooms.length + 1;
  const r: Room = { id: uid("room"), name: "Room " + n, areaId: area.id, color: null, notes: "", cells: [] };
  S.doc.rooms.push(r);
  S.activeRoomId = r.id;
  return r;
}
export function paintCell(x: number, y: number, room: Room): boolean {
  const k = ck(x, y);
  const ownerId = idx.cell.get(k);
  if (ownerId === room.id) return false;
  if (ownerId) {
    const owner = roomById(ownerId)!;
    owner.cells = owner.cells.filter((c) => c !== k);
  }
  room.cells.push(k);
  idx.cell.set(k, room.id);
  return true;
}
export function eraseCell(x: number, y: number): boolean {
  const k = ck(x, y);
  const ownerId = idx.cell.get(k);
  if (!ownerId) return false;
  const owner = roomById(ownerId)!;
  owner.cells = owner.cells.filter((c) => c !== k);
  idx.cell.delete(k);
  return true;
}
/** Remove rooms left with no cells (plus their greybox data). */
export function dropEmptyRooms(): void {
  const gone = S.doc.rooms.filter((r) => !r.cells.length).map((r) => r.id);
  if (!gone.length) return;
  S.doc.rooms = S.doc.rooms.filter((r) => r.cells.length);
  gone.forEach((id) => {
    delete S.doc.detail[id];
    if (S.activeRoomId === id) S.activeRoomId = null;
    if (S.sel && S.sel.type === "room" && S.sel.id === id) S.sel = null;
    if (S.detailRoomId === id) closeDetail();
  });
}
export function deleteRoom(id: string): void {
  const r = roomById(id);
  if (!r) return;
  const cells = new Set(r.cells);
  S.doc.rooms = S.doc.rooms.filter((x) => x.id !== id);
  delete S.doc.detail[id];
  reindex();
  pruneDoors();
  S.doc.keys = S.doc.keys.filter((k) => !cells.has(ck(...markerCell(k.x, k.y))));
  S.doc.locks.forEach((l) => (l.keyIds = l.keyIds.filter((kid) => keyById(kid))));
  if (S.activeRoomId === id) S.activeRoomId = null;
  if (S.sel && S.sel.id === id) S.sel = null;
  if (S.detailRoomId === id) closeDetail();
}
export function deleteDoor(id: string): void {
  S.doc.doors = S.doc.doors.filter((d) => d.id !== id);
  if (S.sel && S.sel.id === id) S.sel = null;
}
export function deleteKey(id: string): void {
  S.doc.keys = S.doc.keys.filter((k) => k.id !== id);
  S.doc.locks.forEach((l) => (l.keyIds = l.keyIds.filter((k) => k !== id)));
  if (S.sel && S.sel.id === id) S.sel = null;
}
export function deleteLock(id: string): void {
  S.doc.locks = S.doc.locks.filter((l) => l.id !== id);
  S.doc.doors.forEach((d) => {
    if (d.lockId === id) {
      d.lockId = null;
      if (d.kind === "locked") d.kind = "door";
    }
  });
  if (S.sel && S.sel.id === id) S.sel = null;
}
export function createLock() {
  const l = {
    id: uid("lock"),
    name: "Lock " + (S.doc.locks.length + 1),
    color: LOCK_COLORS[S.doc.locks.length % LOCK_COLORS.length],
    keyIds: [] as string[],
  };
  S.doc.locks.push(l);
  return l;
}
/** x, y: top-left of the key marker, cell units. */
export function createKeyAt(x: number, y: number) {
  const k = {
    id: uid("key"),
    name: "Key " + (S.doc.keys.length + 1),
    color: LOCK_COLORS[S.doc.keys.length % LOCK_COLORS.length],
    x,
    y,
  };
  S.doc.keys.push(k);
  return k;
}

/** Move a room's cells, the doors it solely owns, its grey-box geometry and everything off-grid sitting on it. */
export function translateRoom(room: Room, dx: number, dy: number): void {
  if (!dx && !dy) return;
  const owned = new Set(room.cells);
  // an edge rides along when it touches the room and isn't shared with a *different* room
  const ownsEdge = (d: { o: string; x: number; y: number }) => {
    const cs = edgeCells(d);
    if (!cs.some(([x, y]) => owned.has(ck(x, y)))) return false;
    return cs.every(([x, y]) => {
      const o = idx.cell.get(ck(x, y));
      return !o || o === room.id;
    });
  };
  const movingDoors: Door[] = S.doc.doors.filter(ownsEdge);
  const carry = carryOffGrid(room, owned, ownsEdge);

  room.cells.forEach((c) => idx.cell.delete(c));
  room.cells = room.cells.map((c) => {
    const [x, y] = unck(c);
    return ck(x + dx, y + dy);
  });
  // displace anything already sitting in the destination
  for (const c of room.cells) {
    const ownerId = idx.cell.get(c);
    if (ownerId && ownerId !== room.id) {
      const o = roomById(ownerId)!;
      o.cells = o.cells.filter((z) => z !== c);
    }
  }
  movingDoors.forEach((d) => {
    d.x += dx;
    d.y += dy;
  });
  reindex();
  carry(dx, dy);
  // shift greybox geometry with the room
  const det = S.doc.detail[room.id];
  if (det)
    det.boxes.forEach((b) => {
      b.x += dx * det.sub;
      b.y += dy * det.sub;
    });
  dropEmptyRooms();
}
