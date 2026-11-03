import { clamp } from "../util.ts";
import { CELL } from "../model/constants.ts";
import { S, app } from "../state/store.ts";
import { docBBox } from "../state/layers.ts";

export interface Cam {
  x: number;
  y: number;
  zoom: number;
}
export interface View {
  cam: Cam;
  w: number;
  h: number;
  sx(wx: number): number;
  sy(wy: number): number;
  wx(sx: number): number;
  wy(sy: number): number;
}

export function makeView(cam: Cam, w: number, h: number): View {
  return {
    cam,
    w,
    h,
    sx: (wx) => (wx - cam.x) * cam.zoom + w / 2,
    sy: (wy) => (wy - cam.y) * cam.zoom + h / 2,
    wx: (sx) => (sx - w / 2) / cam.zoom + cam.x,
    wy: (sy) => (sy - h / 2) / cam.zoom + cam.y,
  };
}
export function resizeCanvas(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D): [number, number] {
  const dpr = window.devicePixelRatio || 1;
  const r = canvas.getBoundingClientRect();
  const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return [w, h];
}
export function zoomAt(cam: Cam, sxPt: number, syPt: number, factor: number, view: View): void {
  const bx = view.wx(sxPt), by = view.wy(syPt);
  cam.zoom = clamp(cam.zoom * factor, 0.08, 8);
  const v2 = makeView(cam, view.w, view.h);
  cam.x += bx - v2.wx(sxPt);
  cam.y += by - v2.wy(syPt);
}
export function fitWorld(): void {
  const b = docBBox();
  if (!b) {
    S.cam.x = 0;
    S.cam.y = 0;
    S.cam.zoom = 1;
  } else {
    const pw = Math.max(1, b.x1 - b.x0) * CELL, ph = Math.max(1, b.y1 - b.y0) * CELL;
    S.cam.x = b.x0 * CELL + pw / 2;
    S.cam.y = b.y0 * CELL + ph / 2;
    S.cam.zoom = clamp(Math.min((app.VW - 80) / pw, (app.VH - 80) / ph), 0.08, 3);
  }
  app.needsDraw = true;
}
