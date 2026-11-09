/* Shapes produced by drags on the off-grid layers, shared by the tools and the cursor preview. All in ticks. */
import { floorTo, roundTo } from "../geom/lattice.ts";
import type { TRect } from "../geom/region.ts";

interface P {
  x: number;
  y: number;
}

/** Structure rectangle from a drag between two raw tick points. Snapped: from the step square under the press to
    the one under the pointer, both included (whole cells at step 1, like rooms). Free: corner to corner. */
export function dragRect(a: P, b: P, step: number): TRect | null {
  if (step === 1) {
    const x0 = Math.round(Math.min(a.x, b.x)), y0 = Math.round(Math.min(a.y, b.y));
    const x1 = Math.round(Math.max(a.x, b.x)), y1 = Math.round(Math.max(a.y, b.y));
    return x1 > x0 && y1 > y0 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
  }
  const ax = floorTo(a.x, step), ay = floorTo(a.y, step), bx = floorTo(b.x, step), by = floorTo(b.y, step);
  const x0 = Math.min(ax, bx), y0 = Math.min(ay, by);
  return { x: x0, y: y0, w: Math.max(ax, bx) + step - x0, h: Math.max(ay, by) + step - y0 };
}

/** Endpoint for a segment from `a` towards the raw point `p`, locked to the nearest multiple of 45°. */
export function lockAngle(a: P, p: P, step: number): P {
  const dx = p.x - a.x, dy = p.y - a.y;
  const ang = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) & 7; // 0..7, 0 = east, counter-clockwise in y-down
  const dir = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]][ang];
  // distance along the locked direction, measured on one axis so diagonals keep dx = dy
  const len = dir[0] && dir[1] ? (Math.abs(dx) + Math.abs(dy)) / 2 : Math.abs(dir[0] ? dx : dy);
  const L = roundTo(len, step);
  return { x: a.x + dir[0] * L, y: a.y + dir[1] * L };
}
