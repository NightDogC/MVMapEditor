/* Snapping for the off-grid layers (structures, edge structures, stamps, notes, keys). Positions come in as world
   px and go out as ticks (geom/lattice.ts). Alt toggles snapping while held. */
import { S } from "./store.ts";
import { CELL } from "../model/constants.ts";
import { TICKS, FREE_BRUSH_TICKS, snapById, roundTo, floorTo } from "../geom/lattice.ts";
import { prefs } from "../util.ts";

/** The step in effect right now, in ticks (1 = free). */
export function snapTicks(): number {
  const free = S.snap === "free";
  if (S.altDown) return free ? snapById(S.lastFixedSnap).ticks : 1;
  return snapById(S.snap).ticks;
}
export const isFreeNow = (): boolean => snapTicks() === 1;
/** Brush square for structure paint / erase: the step, or 1/8 cell while free. */
export const brushTicks = (): number => (isFreeNow() ? FREE_BRUSH_TICKS : snapTicks());

export const pxToT = (px: number): number => (px / CELL) * TICKS;
export const tToPx = (t: number): number => (t / TICKS) * CELL;

/** Nearest lattice point (edge endpoints). */
export function snapPoint(wx: number, wy: number, step = snapTicks()) {
  return { x: roundTo(pxToT(wx), step), y: roundTo(pxToT(wy), step) };
}
/** Top-left of the step-sized square under the pointer (structure brush). */
export function snapSquare(wx: number, wy: number, step: number) {
  return { x: floorTo(pxToT(wx), step), y: floorTo(pxToT(wy), step) };
}
/** Top-left of a 1×1 marker box centred as close to the pointer as the step allows (stamps, notes, keys). */
export function snapBox(wx: number, wy: number, step = snapTicks()) {
  return { x: roundTo(pxToT(wx) - TICKS / 2, step), y: roundTo(pxToT(wy) - TICKS / 2, step) };
}
/** A drag offset rounded to the step, so moved geometry keeps its position relative to the lattice. */
export function snapDelta(dxT: number, dyT: number, step = snapTicks()) {
  return { x: roundTo(dxT, step), y: roundTo(dyT, step) };
}

export function setSnap(id: string): void {
  S.snap = snapById(id).id;
  if (S.snap !== "free") S.lastFixedSnap = S.snap;
  prefs.set("mvmap:snap", S.snap);
}
export function loadSnap(): void {
  const v = prefs.get("mvmap:snap");
  if (v) setSnap(v);
}
