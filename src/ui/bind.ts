/* Panel event delegation: tool buttons, lists, add buttons, options. */
import type { Tool } from "../state/store.ts";
import { AREA_COLORS, CELL } from "../model/constants.ts";
import { S, requestDraw, pushUndo, commit, undo, redo, setActiveArea, activeArea, areaById, roomById, keyById, structById, edgeStructById, stampById } from "../state/store.ts";
import { scheduleSave } from "../state/persist.ts";
import { createRoom, createLock, roomBBox } from "../state/rooms.ts";
import { sT, eT, createStruct, createEdgeStruct, createStamp } from "../state/layers.ts";
import { bbox } from "../geom/region.ts";
import { TICKS } from "../geom/lattice.ts";
import { fitWorld } from "../render/view.ts";
import { setTool } from "../tools/tool.ts";
import { renderLists } from "./panels.ts";
import { $, uid, clamp, prefs } from "../util.ts";

type In = HTMLInputElement;
const closestData = (e: Event, attr: string) => (e.target as HTMLElement).closest<HTMLElement>(`[data-${attr}]`);

/** Centre the camera on a box given in cell units. */
function focusBox(b: { x0: number; y0: number; x1: number; y1: number } | null): void {
  if (!b) return;
  S.cam.x = ((b.x0 + b.x1) / 2) * CELL;
  S.cam.y = ((b.y0 + b.y1) / 2) * CELL;
  requestDraw();
}

/** Open a fresh, empty room in `areaId` and arm the Paint tool on it. */
function startNewRoom(areaId: string) {
  S.activeRoomId = null;
  S.sel = null;
  const r = createRoom(areaId);
  S.sel = { type: "room", id: r.id };
  setTool("paint");
  return r;
}

/** Per-browser preference: stamp names show above this zoom percentage. */
export function setStampZoom(v: number | string, save: boolean): void {
  let n = Math.round(+v);
  if (!Number.isFinite(n)) n = 60;
  S.stampZoom = clamp(n, 10, 800);
  $<In>("#num-stampzoom").value = String(S.stampZoom);
  if (save) prefs.set("mvmap:stampzoom", String(S.stampZoom));
  requestDraw();
}

export function bindPanels(): void {
  $("#tools").addEventListener("click", (e) => {
    const b = closestData(e, "tool");
    if (b) setTool(b.dataset.tool as Tool);
  });

  $("#area-list").addEventListener("click", (e) => {
    const sw = closestData(e, "swatch");
    if (sw) {
      const a = areaById(sw.dataset.swatch);
      pushUndo();
      a.color = AREA_COLORS[(AREA_COLORS.indexOf(a.color) + 1) % AREA_COLORS.length];
      commit();
      return;
    }
    const del = closestData(e, "delarea");
    if (del) {
      const id = del.dataset.delarea!;
      if (S.doc.areas.length < 2) return;
      pushUndo();
      S.doc.areas = S.doc.areas.filter((a) => a.id !== id);
      const fallback = S.doc.areas[0].id;
      S.doc.rooms.forEach((r) => {
        if (r.areaId === id) r.areaId = fallback;
      });
      if (S.activeAreaId === id) S.activeAreaId = fallback;
      commit();
      return;
    }
    const row = closestData(e, "area");
    if (row) {
      setActiveArea(row.dataset.area!);
      commit(true);
    }
  });
  $("#area-list").addEventListener("input", (e) => {
    const inp = (e.target as HTMLElement).closest<In>("[data-rename]");
    if (!inp) return;
    areaById(inp.dataset.rename).name = inp.value;
    requestDraw();
    renderLists();
    scheduleSave();
  });
  $("#area-list").addEventListener("focusin", (e) => {
    if ((e.target as HTMLElement).matches("[data-rename]")) pushUndo();
  });

  $("#room-list").addEventListener("click", (e) => {
    const row = closestData(e, "room");
    const r = row && roomById(row.dataset.room);
    if (!r) return;
    S.sel = { type: "room", id: r.id };
    S.activeRoomId = r.id;
    S.activeAreaId = r.areaId;
    commit(true);
  });
  $("#room-list").addEventListener("dblclick", (e) => {
    const row = closestData(e, "room");
    const b = row && roomBBox(roomById(row.dataset.room));
    if (b) focusBox({ x0: b.x0, y0: b.y0, x1: b.x1 + 1, y1: b.y1 + 1 });
  });
  $("#lock-list").addEventListener("click", (e) => {
    const row = closestData(e, "lock");
    if (row) {
      S.sel = { type: "lock", id: row.dataset.lock! };
      commit(true);
    }
  });
  $("#key-list").addEventListener("click", (e) => {
    const row = closestData(e, "key");
    if (!row) return;
    S.sel = { type: "key", id: row.dataset.key! };
    const k = keyById(row.dataset.key);
    if (k) focusBox({ x0: k.x, y0: k.y, x1: k.x + 1, y1: k.y + 1 });
    commit(true);
  });

  $("#struct-list").addEventListener("click", (e) => {
    const row = closestData(e, "struct");
    if (!row) return;
    S.sel = { type: "struct", id: row.dataset.struct! };
    S.activeStructId = row.dataset.struct!;
    commit(true);
  });
  $("#struct-list").addEventListener("dblclick", (e) => {
    const row = closestData(e, "struct");
    const st = row && structById(row.dataset.struct);
    const b = st && bbox(sT(st));
    if (b) focusBox({ x0: b.x0 / TICKS, y0: b.y0 / TICKS, x1: b.x1 / TICKS, y1: b.y1 / TICKS });
  });
  $("#edge-list").addEventListener("click", (e) => {
    const row = closestData(e, "edge");
    if (!row) return;
    S.sel = { type: "edge", id: row.dataset.edge! };
    S.activeEdgeId = row.dataset.edge!;
    commit(true);
  });
  $("#edge-list").addEventListener("dblclick", (e) => {
    const row = closestData(e, "edge");
    const es = row && edgeStructById(row.dataset.edge);
    if (!es || !es.segs.length) return;
    const segs = eT(es);
    focusBox({
      x0: Math.min(...segs.map((g) => Math.min(g.x1, g.x2))) / TICKS,
      y0: Math.min(...segs.map((g) => Math.min(g.y1, g.y2))) / TICKS,
      x1: Math.max(...segs.map((g) => Math.max(g.x1, g.x2))) / TICKS,
      y1: Math.max(...segs.map((g) => Math.max(g.y1, g.y2))) / TICKS,
    });
  });
  $("#stamp-list").addEventListener("click", (e) => {
    const row = closestData(e, "stamp");
    if (!row) return;
    S.sel = { type: "stamp", id: row.dataset.stamp! };
    S.activeStampId = row.dataset.stamp!;
    commit(true);
  });
  $("#stamp-list").addEventListener("dblclick", (e) => {
    const row = closestData(e, "stamp");
    const st = row && stampById(row.dataset.stamp);
    if (!st || !st.points.length) return;
    focusBox({
      x0: Math.min(...st.points.map((p) => p.x)),
      y0: Math.min(...st.points.map((p) => p.y)),
      x1: Math.max(...st.points.map((p) => p.x)) + 1,
      y1: Math.max(...st.points.map((p) => p.y)) + 1,
    });
  });

  $("#btn-add-stamp").onclick = () => {
    pushUndo();
    const st = createStamp();
    S.sel = { type: "stamp", id: st.id };
    setTool("stamp");
    commit();
  };
  $("#btn-add-struct").onclick = () => {
    pushUndo();
    const st = createStruct();
    S.sel = { type: "struct", id: st.id };
    if (S.tool !== "spaint" && S.tool !== "srect") setTool("spaint");
    commit();
  };
  $("#btn-add-edge").onclick = () => {
    pushUndo();
    const es = createEdgeStruct();
    S.sel = { type: "edge", id: es.id };
    setTool("edge");
    commit();
  };
  $("#btn-add-area").onclick = () => {
    pushUndo();
    const a = { id: uid("area"), name: "Area " + (S.doc.areas.length + 1), color: AREA_COLORS[S.doc.areas.length % AREA_COLORS.length] };
    S.doc.areas.push(a);
    S.activeAreaId = a.id;
    startNewRoom(a.id);
    commit();
  };
  $("#btn-add-room").onclick = () => {
    pushUndo();
    startNewRoom(activeArea().id);
    commit();
  };
  $("#btn-add-lock").onclick = () => {
    pushUndo();
    const l = createLock();
    S.sel = { type: "lock", id: l.id };
    commit();
  };

  const check = (id: string, set: (v: boolean) => void) => ($<In>(id).onchange = (e) => (set((e.target as In).checked), requestDraw()));
  check("#chk-flow", (v) => (S.showFlow = v));
  check("#chk-labels", (v) => (S.showLabels = v));
  check("#chk-structs", (v) => (S.showStructs = v));
  check("#chk-slabels", (v) => (S.showStructLabels = v));
  check("#chk-notes", (v) => (S.showNotes = v));
  check("#chk-pencil", (v) => (S.showPencil = v));
  check("#chk-manual", (v) => (S.highlightManual = v));
  // per-browser preferences, not part of the map document
  $<In>("#num-stampzoom").oninput = (e) => {
    const inp = e.target as In;
    const v = +inp.value;
    if (inp.value !== "" && Number.isFinite(v)) {
      S.stampZoom = clamp(v, 10, 800);
      requestDraw();
    }
  };
  $<In>("#num-stampzoom").onchange = (e) => setStampZoom((e.target as In).value, true);
  $<HTMLSelectElement>("#sel-rclick").onchange = (e) => {
    S.rclick = (e.target as HTMLSelectElement).value === "pan" ? "pan" : "remove";
    prefs.set("mvmap:rclick", S.rclick);
  };

  $("#btn-fit").onclick = fitWorld;
  $("#btn-undo").onclick = undo;
  $("#btn-redo").onclick = redo;
  $<In>("#map-name").oninput = (e) => {
    S.doc.name = (e.target as In).value;
    scheduleSave();
  };
  $("#map-name").addEventListener("focus", () => pushUndo());
}
