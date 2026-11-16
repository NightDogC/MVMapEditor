/* S-Neg, the negative-structure tool: click the corners of a polygon (snapped like edge endpoints; Shift locks the
   side to 45° steps), then click the first corner again (or press Enter) to close it. The polygon is cut out of the
   active structure. Backspace / Ctrl-click / right-click takes the last corner back, Esc drops the polygon. */
import type { XY } from "../model/types.ts";
import { S, requestDraw, commit, recordUndo, snapshot, activeStruct } from "../state/store.ts";
import { cutStruct, dropEmptyStructs } from "../state/layers.ts";
import { canExtend } from "../geom/poly.ts";
import { snapPoint, snapTicks, pxToT, tToPx } from "../state/snap.ts";
import { lockAngle } from "./shapes.ts";
import { flashHint } from "./tool.ts";
import { esc } from "../util.ts";

/** Screen px around the first corner that count as clicking it. */
const CLOSE_PX = 8;
let shiftHeld = false;
export const setCutShift = (v: boolean): void => void (shiftHeld = v);

/** Where a click at world px (wx, wy) would put the next corner (ticks): whether that closes the polygon, and
    whether it's allowed (the outline may not cross or touch itself). */
export function cutTarget(wx: number, wy: number): { q: XY; closing: boolean; ok: boolean } {
  const pts = S.cutPoly || [];
  const last = pts[pts.length - 1], first = pts[0];
  const raw = { x: pxToT(wx), y: pxToT(wy) };
  let q = shiftHeld && last ? lockAngle(last, raw, snapTicks()) : snapPoint(wx, wy);
  if (pts.length >= 3 && Math.hypot(tToPx(raw.x - first.x), tToPx(raw.y - first.y)) * S.cam.zoom <= CLOSE_PX) q = { x: first.x, y: first.y };
  const closing = pts.length >= 3 && q.x === first.x && q.y === first.y;
  return { q, closing, ok: canExtend(pts, q) };
}

export function cutClick(wx: number, wy: number, back: boolean): void {
  if (back) {
    cutBack();
    return;
  }
  if (!activeStruct()) {
    flashHint("Pick the structure to cut first — click it with <b>Select</b> or in the Structures list");
    return;
  }
  const { q, closing, ok } = cutTarget(wx, wy);
  if (!ok) {
    flashHint("That corner would make the outline cross or touch itself");
    return;
  }
  if (closing) finishCut();
  else {
    S.cutPoly = [...(S.cutPoly || []), q];
    requestDraw();
  }
}

/** Close the polygon and cut it out of the active structure. */
export function finishCut(): void {
  const pts = S.cutPoly;
  const st = activeStruct();
  if (!pts || pts.length < 3 || !st) return;
  if (!canExtend(pts, pts[0])) {
    flashHint("Closing here would make the outline cross itself — take a corner back with <kbd>Backspace</kbd>");
    return;
  }
  S.cutPoly = null;
  const before = snapshot();
  if (cutStruct(st, pts)) {
    recordUndo(before);
    dropEmptyStructs();
    commit();
    flashHint(`Cut out of “${esc(st.name)}”`);
  } else {
    requestDraw();
    flashHint(`The polygon doesn't cover any of “${esc(st.name)}”`);
  }
}
/** Take the last corner back. */
export function cutBack(): boolean {
  if (!S.cutPoly) return false;
  S.cutPoly = S.cutPoly.length > 1 ? S.cutPoly.slice(0, -1) : null;
  requestDraw();
  return true;
}
export function cancelCut(): boolean {
  if (!S.cutPoly) return false;
  S.cutPoly = null;
  requestDraw();
  return true;
}
