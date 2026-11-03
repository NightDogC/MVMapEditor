/* Grey-box (room detail) editor: boxes on a sub-cell grid inside one room. */
import type { Detail, DetailBox } from "../model/types.ts";
import { DCELL, BOX_TYPES, boxType } from "../model/constants.ts";
import { TICKS } from "../geom/lattice.ts";
import { makeView, resizeCanvas, zoomAt } from "../render/view.ts";
import { FONTF, roundRect } from "../render/common.ts";
import { S, requestDraw, pushUndo, commit, flushUI, roomById, lockById, roomColor, structColor } from "../state/store.ts";
import { scheduleSave } from "../state/persist.ts";
import { roomBBox, edgeCells } from "../state/rooms.ts";
import { sT, eT } from "../state/layers.ts";
import { $, uid, clamp, hexA, shade, esc, ck, unck } from "../util.ts";

const dCanvas = $<HTMLCanvasElement>("#detail-canvas");
const dctx = dCanvas.getContext("2d")!;
let DW = 0, DH = 0;

function detailData(roomId: string): Detail {
  if (!S.doc.detail[roomId]) S.doc.detail[roomId] = { sub: 8, boxes: [] };
  const d = S.doc.detail[roomId];
  if (!Array.isArray(d.boxes)) d.boxes = [];
  if (!d.sub) d.sub = 8;
  return d;
}
export function openDetail(roomId: string): void {
  const room = roomById(roomId);
  if (!room || !room.cells.length) return;
  S.detailRoomId = roomId;
  S.dsel = null;
  const det = detailData(roomId);
  $<HTMLSelectElement>("#detail-sub").value = String(det.sub);
  $("#detail-title").textContent = room.name;
  $("#detail").hidden = false;
  setDTool(S.dtool);
  renderTypePalette();
  fitDetail();
  requestDraw();
}
export function closeDetail(): void {
  S.detailRoomId = null;
  S.dsel = null;
  $("#detail").hidden = true;
  $("#detail-inspector").hidden = true;
  requestDraw();
}
function fitDetail(): void {
  const room = roomById(S.detailRoomId);
  const det = detailData(S.detailRoomId!);
  const b = roomBBox(room);
  if (!b) return;
  const r = dCanvas.getBoundingClientRect();
  DW = Math.max(1, Math.round(r.width));
  DH = Math.max(1, Math.round(r.height));
  const pw = b.w * det.sub * DCELL, ph = b.h * det.sub * DCELL;
  S.dcam.x = (b.x0 * det.sub + (b.w * det.sub) / 2) * DCELL;
  S.dcam.y = (b.y0 * det.sub + (b.h * det.sub) / 2) * DCELL;
  S.dcam.zoom = clamp(Math.min((DW - 70) / pw, (DH - 70) / ph), 0.05, 4);
  requestDraw();
}
function setDTool(t: string): void {
  S.dtool = t;
  document.querySelectorAll<HTMLElement>("#detail-tools .tool").forEach((b) => b.classList.toggle("on", b.dataset.dtool === t));
  dCanvas.style.cursor = t === "pan" ? "grab" : t === "select" ? "default" : "crosshair";
  requestDraw();
}
function renderTypePalette(): void {
  $("#detail-types").innerHTML = BOX_TYPES.map(
    (t) => `<button class="ty ${t.id === S.dtype ? "on" : ""}" data-dtype="${t.id}">
        <span class="swatch" style="background:${t.color}"></span>${t.name}</button>`
  ).join("");
}

export function drawDetail(): void {
  const room = roomById(S.detailRoomId);
  if (!room) return;
  const det = detailData(S.detailRoomId!);
  const [w, h] = resizeCanvas(dCanvas, dctx);
  DW = w;
  DH = h;
  const V = makeView(S.dcam, w, h);
  const sub = det.sub, U = DCELL; // one sub-cell = DCELL px at zoom 1
  const z = S.dcam.zoom;
  const cellPx = sub * U; // one world cell, detail px at zoom 1

  dctx.fillStyle = "#0e1116";
  dctx.fillRect(0, 0, w, h);

  // in-room floor
  dctx.fillStyle = "#181d26";
  for (const c of room.cells) {
    const [cx, cy] = unck(c);
    dctx.fillRect(V.sx(cx * cellPx), V.sy(cy * cellPx), cellPx * z + 0.5, cellPx * z + 0.5);
  }

  // sub-grid
  const step = U * z;
  const x0 = Math.floor(V.wx(0) / U), x1 = Math.ceil(V.wx(w) / U);
  const y0 = Math.floor(V.wy(0) / U), y1 = Math.ceil(V.wy(h) / U);
  if (step >= 4) {
    dctx.strokeStyle = "#1e2430";
    dctx.lineWidth = 1;
    dctx.beginPath();
    for (let x = x0; x <= x1; x++) {
      if (x % sub === 0) continue;
      const px = Math.round(V.sx(x * U)) + 0.5;
      dctx.moveTo(px, 0);
      dctx.lineTo(px, h);
    }
    for (let y = y0; y <= y1; y++) {
      if (y % sub === 0) continue;
      const py = Math.round(V.sy(y * U)) + 0.5;
      dctx.moveTo(0, py);
      dctx.lineTo(w, py);
    }
    dctx.stroke();
  }
  // world-cell grid
  dctx.strokeStyle = "#333e50";
  dctx.beginPath();
  for (let x = Math.ceil(x0 / sub) * sub; x <= x1; x += sub) {
    const px = Math.round(V.sx(x * U)) + 0.5;
    dctx.moveTo(px, 0);
    dctx.lineTo(px, h);
  }
  for (let y = Math.ceil(y0 / sub) * sub; y <= y1; y += sub) {
    const py = Math.round(V.sy(y * U)) + 0.5;
    dctx.moveTo(0, py);
    dctx.lineTo(w, py);
  }
  dctx.stroke();

  // room silhouette
  const set = new Set(room.cells);
  dctx.strokeStyle = roomColor(room);
  dctx.lineWidth = 2;
  dctx.beginPath();
  for (const c of room.cells) {
    const [cx, cy] = unck(c);
    const L = V.sx(cx * cellPx), T = V.sy(cy * cellPx);
    const R = V.sx((cx + 1) * cellPx), B = V.sy((cy + 1) * cellPx);
    if (!set.has(ck(cx, cy - 1))) { dctx.moveTo(L, T); dctx.lineTo(R, T); }
    if (!set.has(ck(cx, cy + 1))) { dctx.moveTo(L, B); dctx.lineTo(R, B); }
    if (!set.has(ck(cx - 1, cy))) { dctx.moveTo(L, T); dctx.lineTo(L, B); }
    if (!set.has(ck(cx + 1, cy))) { dctx.moveTo(R, T); dctx.lineTo(R, B); }
  }
  dctx.stroke();

  // doors on the room border, as anchors while greyboxing
  for (const d of S.doc.doors) {
    const cs = edgeCells(d);
    if (!cs.some(([x, y]) => set.has(ck(x, y)))) continue;
    const lock = d.lockId ? lockById(d.lockId) : null;
    const along = cellPx * z * 0.5, thick = clamp(cellPx * z * 0.12, 3, 14);
    const cx = V.sx(d.o === "v" ? d.x * cellPx : (d.x * sub + sub / 2) * U);
    const cy = V.sy(d.o === "v" ? (d.y * sub + sub / 2) * U : d.y * cellPx);
    dctx.fillStyle = lock ? lock.color : "#93a0b4";
    const bw = d.o === "v" ? thick : along, bh = d.o === "v" ? along : thick;
    roundRect(dctx, cx - bw / 2, cy - bh / 2, bw, bh, 2);
    dctx.fill();
  }

  // off-grid layers inside the room, as faint reference underlays clipped to the room's cells
  if (S.showStructs) {
    const tx = (t: number) => V.sx((t / TICKS) * cellPx), ty = (t: number) => V.sy((t / TICKS) * cellPx);
    dctx.save();
    dctx.beginPath();
    for (const c of room.cells) {
      const [cx, cy] = unck(c);
      dctx.rect(V.sx(cx * cellPx), V.sy(cy * cellPx), cellPx * z + 0.5, cellPx * z + 0.5);
    }
    dctx.clip();
    for (const st of S.doc.structures) {
      dctx.fillStyle = hexA(structColor(st), 0.16);
      for (const r of sT(st)) dctx.fillRect(tx(r.x), ty(r.y), tx(r.x + r.w) - tx(r.x), ty(r.y + r.h) - ty(r.y));
    }
    dctx.lineCap = "round";
    dctx.lineWidth = clamp(cellPx * z * 0.06, 2, 8);
    for (const es of S.doc.edgeStructs) {
      dctx.strokeStyle = hexA(structColor(es), 0.75);
      dctx.beginPath();
      for (const g of eT(es)) {
        dctx.moveTo(tx(g.x1), ty(g.y1));
        dctx.lineTo(tx(g.x2), ty(g.y2));
      }
      dctx.stroke();
    }
    const cs = cellPx * z;
    dctx.globalAlpha = 0.55;
    dctx.textAlign = "center";
    dctx.textBaseline = "middle";
    dctx.font = `${Math.max(8, Math.round(cs * 0.5))}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", ${FONTF}`;
    for (const st of S.doc.stamps)
      for (const p of st.points) dctx.fillText(st.emoji, V.sx((p.x + 0.5) * cellPx), V.sy((p.y + 0.5) * cellPx));
    dctx.restore();
  }

  // boxes
  dctx.textAlign = "center";
  dctx.textBaseline = "middle";
  for (const b of det.boxes) {
    const t = boxType(b.type);
    const px = V.sx(b.x * U), py = V.sy(b.y * U);
    const pw = b.w * U * z, ph = b.h * U * z;
    if (px > w || py > h || px + pw < 0 || py + ph < 0) continue;
    dctx.fillStyle = hexA(t.color, 0.32);
    dctx.fillRect(px, py, pw, ph);
    dctx.strokeStyle = t.color;
    dctx.lineWidth = b.id === S.dsel ? 2.5 : 1.4;
    dctx.strokeRect(px + 0.5, py + 0.5, pw - 1, ph - 1);
    if (b.label && pw > 26 && ph > 12) {
      const fs = clamp(Math.round(11 * Math.min(1.4, z * 1.4)), 9, 15);
      dctx.font = `500 ${fs}px ${FONTF}`;
      dctx.fillStyle = shade(t.color, 0.35);
      dctx.fillText(b.label, px + pw / 2, py + ph / 2);
    }
    if (b.id === S.dsel) {
      dctx.fillStyle = "#ffffff";
      dctx.fillRect(px + pw - 5, py + ph - 5, 9, 9);
      dctx.strokeStyle = "#0e1116";
      dctx.lineWidth = 1;
      dctx.strokeRect(px + pw - 5.5, py + ph - 5.5, 10, 10);
    }
  }

  // drag preview
  if (S.ddrag && S.ddrag.type === "box") {
    const r = normRect(S.ddrag.a, S.ddrag.b);
    const t = boxType(S.dtype);
    dctx.fillStyle = hexA(t.color, 0.22);
    dctx.strokeStyle = t.color;
    dctx.lineWidth = 1.5;
    dctx.fillRect(V.sx(r.x * U), V.sy(r.y * U), r.w * U * z, r.h * U * z);
    dctx.strokeRect(V.sx(r.x * U) + 0.5, V.sy(r.y * U) + 0.5, r.w * U * z - 1, r.h * U * z - 1);
  }
}

interface P {
  x: number;
  y: number;
}
function normRect(a: P, b: P) {
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
  return { x, y, w: Math.abs(b.x - a.x) + 1, h: Math.abs(b.y - a.y) + 1 };
}
function dEvPos(e: MouseEvent): P {
  const r = dCanvas.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}
const dSubAt = (V: ReturnType<typeof makeView>, p: P): P => ({ x: Math.floor(V.wx(p.x) / DCELL), y: Math.floor(V.wy(p.y) / DCELL) });
function boxAt(det: Detail, sx: number, sy: number): DetailBox | null {
  for (let i = det.boxes.length - 1; i >= 0; i--) {
    const b = det.boxes[i];
    if (sx >= b.x && sx < b.x + b.w && sy >= b.y && sy < b.y + b.h) return b;
  }
  return null;
}

function endDDrag(): void {
  const d = S.ddrag;
  if (!d) return;
  if (d.type === "box") {
    const r = normRect(d.a, d.b);
    pushUndo();
    const box: DetailBox = { id: uid("box"), x: r.x, y: r.y, w: r.w, h: r.h, type: S.dtype, label: "" };
    detailData(S.detailRoomId!).boxes.push(box);
    S.dsel = box.id;
    commit();
    renderDetailInspector();
  }
  S.ddrag = null;
  requestDraw();
  flushUI();
}

const DTOOL_KEYS: Record<string, string> = { b: "box", v: "select", e: "erase", h: "pan" };
export function detailKey(e: KeyboardEvent): void {
  if (e.key === "Escape") {
    if (S.dsel) {
      S.dsel = null;
      renderDetailInspector();
      requestDraw();
    } else closeDetail();
    return;
  }
  if (e.key === "f") return fitDetail();
  const t = DTOOL_KEYS[e.key.toLowerCase()];
  if (t) return setDTool(t);
  const n = parseInt(e.key, 10);
  if (n >= 1 && n <= 9 && BOX_TYPES[n - 1]) {
    S.dtype = BOX_TYPES[n - 1].id;
    renderTypePalette();
    requestDraw();
    return;
  }
  if (e.key === "Delete" || e.key === "Backspace") {
    if (!S.dsel) return;
    pushUndo();
    const det = detailData(S.detailRoomId!);
    det.boxes = det.boxes.filter((b) => b.id !== S.dsel);
    S.dsel = null;
    commit();
    renderDetailInspector();
  }
}

export function renderDetailInspector(): void {
  const host = $("#detail-inspector");
  if (!S.dsel || !S.detailRoomId) {
    host.hidden = true;
    return;
  }
  const det = detailData(S.detailRoomId);
  const b = det.boxes.find((x) => x.id === S.dsel);
  if (!b) {
    host.hidden = true;
    return;
  }
  host.hidden = false;
  host.innerHTML = `
    <div class="insp-title"><span class="swatch" style="background:${boxType(b.type).color}"></span>
      <span class="kind">${esc(boxType(b.type).name)}</span></div>
    <div class="fld"><label>Type</label><select id="d-type">${BOX_TYPES.map(
      (t) => `<option value="${t.id}" ${t.id === b.type ? "selected" : ""}>${t.name}</option>`
    ).join("")}</select></div>
    <div class="fld"><label>Label</label><input type="text" id="d-label" value="${esc(b.label)}" placeholder="optional" /></div>
    <div class="meta">${b.w}×${b.h} sub-cells at ${b.x}, ${b.y}</div>
    <div class="btn-row"><button class="btn danger" id="d-del">Delete</button></div>`;
  $<HTMLSelectElement>("#d-type").onchange = (e) => {
    pushUndo();
    b.type = (e.target as HTMLSelectElement).value;
    S.dtype = b.type;
    renderTypePalette();
    commit();
    renderDetailInspector();
  };
  const label = $<HTMLInputElement>("#d-label");
  label.oninput = () => {
    b.label = label.value;
    requestDraw();
    scheduleSave();
  };
  label.addEventListener("focus", () => pushUndo());
  $("#d-del").onclick = () => {
    pushUndo();
    det.boxes = det.boxes.filter((x) => x.id !== b.id);
    S.dsel = null;
    commit();
    renderDetailInspector();
  };
}

export function bindDetail(): void {
  setDTool(S.dtool);
  renderTypePalette();
  $("#detail-types").addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>("[data-dtype]");
    if (!b) return;
    S.dtype = b.dataset.dtype!;
    if (S.dsel) {
      const box = detailData(S.detailRoomId!).boxes.find((x) => x.id === S.dsel);
      if (box) {
        pushUndo();
        box.type = S.dtype;
        commit();
      }
    }
    renderTypePalette();
    renderDetailInspector();
    requestDraw();
  });
  $("#detail-tools").addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>("[data-dtool]");
    if (b) setDTool(b.dataset.dtool!);
  });
  $("#detail-close").onclick = closeDetail;
  $("#detail-fit").onclick = fitDetail;
  $<HTMLSelectElement>("#detail-sub").onchange = (e) => {
    const det = detailData(S.detailRoomId!);
    const next = +(e.target as HTMLSelectElement).value;
    if (next === det.sub) return;
    pushUndo();
    const f = next / det.sub;
    det.boxes.forEach((b) => {
      b.x = Math.round(b.x * f);
      b.y = Math.round(b.y * f);
      b.w = Math.max(1, Math.round(b.w * f));
      b.h = Math.max(1, Math.round(b.h * f));
    });
    det.sub = next;
    commit();
    fitDetail();
  };

  dCanvas.addEventListener("pointerdown", (e) => {
    const V = makeView(S.dcam, DW, DH);
    const p = dEvPos(e);
    const s = dSubAt(V, p);
    const det = detailData(S.detailRoomId!);
    const rmb = e.button === 2;
    if (e.button === 1 || S.spaceDown || S.dtool === "pan" || (rmb && S.rclick === "pan")) {
      dCanvas.setPointerCapture(e.pointerId);
      S.ddrag = { type: "pan", last: p };
      return;
    }
    if (e.button > 2) return;
    dCanvas.setPointerCapture(e.pointerId);

    if (S.dtool === "box" && !rmb) {
      S.ddrag = { type: "box", a: s, b: s };
      requestDraw();
      return;
    }
    if (S.dtool === "erase" || rmb) {
      const b = boxAt(det, s.x, s.y);
      if (b) {
        pushUndo();
        det.boxes = det.boxes.filter((x) => x !== b);
        if (S.dsel === b.id) S.dsel = null;
        commit();
        renderDetailInspector();
      }
      S.ddrag = { type: "erase" };
      return;
    }
    if (S.dtool === "select") {
      const sel = det.boxes.find((x) => x.id === S.dsel);
      if (sel) {
        // bottom-right resize handle, in screen space
        const hx = V.sx((sel.x + sel.w) * DCELL), hy = V.sy((sel.y + sel.h) * DCELL);
        if (Math.abs(p.x - hx) < 9 && Math.abs(p.y - hy) < 9) {
          S.ddrag = { type: "resize", box: sel, undone: false };
          return;
        }
      }
      const b = boxAt(det, s.x, s.y);
      S.dsel = b ? b.id : null;
      if (b) S.ddrag = { type: "movebox", box: b, start: s, ox: b.x, oy: b.y, undone: false };
      renderDetailInspector();
      requestDraw();
    }
  });

  dCanvas.addEventListener("pointermove", (e) => {
    const V = makeView(S.dcam, DW, DH);
    const p = dEvPos(e);
    const s = dSubAt(V, p);
    const d = S.ddrag;
    if (!d) return;
    const det = detailData(S.detailRoomId!);
    if (d.type === "pan") {
      S.dcam.x -= (p.x - d.last.x) / S.dcam.zoom;
      S.dcam.y -= (p.y - d.last.y) / S.dcam.zoom;
      d.last = p;
      requestDraw();
    } else if (d.type === "box") {
      d.b = s;
      requestDraw();
    } else if (d.type === "erase") {
      const b = boxAt(det, s.x, s.y);
      if (b) {
        if (!d.undone) {
          pushUndo();
          d.undone = true;
        }
        det.boxes = det.boxes.filter((x) => x !== b);
        commit();
      }
    } else if (d.type === "movebox") {
      const nx = d.ox + (s.x - d.start.x), ny = d.oy + (s.y - d.start.y);
      if (nx !== d.box.x || ny !== d.box.y) {
        if (!d.undone) {
          pushUndo();
          d.undone = true;
        }
        d.box.x = nx;
        d.box.y = ny;
        requestDraw();
        scheduleSave();
      }
    } else if (d.type === "resize") {
      const nw = Math.max(1, s.x - d.box.x + 1), nh = Math.max(1, s.y - d.box.y + 1);
      if (nw !== d.box.w || nh !== d.box.h) {
        if (!d.undone) {
          pushUndo();
          d.undone = true;
        }
        d.box.w = nw;
        d.box.h = nh;
        requestDraw();
        scheduleSave();
      }
    }
  });
  dCanvas.addEventListener("pointerup", endDDrag);
  dCanvas.addEventListener("pointercancel", endDDrag);
  dCanvas.addEventListener("contextmenu", (e) => e.preventDefault());
  dCanvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const V = makeView(S.dcam, DW, DH);
      const p = dEvPos(e);
      zoomAt(S.dcam, p.x, p.y, Math.pow(0.999, e.deltaY), V);
      requestDraw();
    },
    { passive: false }
  );
}
