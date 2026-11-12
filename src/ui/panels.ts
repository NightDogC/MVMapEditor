/* Left / right panel lists. */
import type { ElementLayer } from "../model/types.ts";
import { S, undoStack, redoStack, activeArea, roomColor, structColor, keyById } from "../state/store.ts";
import { markerCell } from "../state/rooms.ts";
import { roomAtCell } from "../state/store.ts";
import { sT, eT } from "../state/layers.ts";
import { area } from "../geom/region.ts";
import { segLength } from "../geom/segs.ts";
import { TICKS } from "../geom/lattice.ts";
import { UE, vocabOf, type Typed } from "../ue.ts";
import { renderInspector } from "./inspector.ts";
import { $, esc } from "../util.ts";

/** A count / size for list rows: whole numbers stay whole, fractions get up to two decimals. */
const num = (v: number) => String(Math.round(v * 100) / 100);

/** Every list, without the inspector (safe while an inspector field is being typed into). */
export function renderLists(): void {
  renderAreas();
  renderRooms();
  renderLocks();
  renderKeys();
  renderStructs();
  renderEdgeStructs();
  renderStamps();
}

export function renderUI(): void {
  renderLists();
  renderInspector();
  $<HTMLButtonElement>("#btn-undo").disabled = !undoStack.length;
  $<HTMLButtonElement>("#btn-redo").disabled = !redoStack.length;
  const nm = $<HTMLInputElement>("#map-name");
  if (nm.value !== S.doc.name && document.activeElement !== nm) nm.value = S.doc.name;
}

function renderAreas(): void {
  const host = $("#area-list");
  const active = activeArea();
  // Never blow away a name field that's mid-edit — just refresh the active highlight.
  const focused = document.activeElement;
  if (focused && focused.closest && focused.closest("#area-list [data-rename]")) {
    host.querySelectorAll<HTMLElement>("[data-area]").forEach((row) => row.classList.toggle("on", row.dataset.area === active.id));
    return;
  }
  host.innerHTML = S.doc.areas
    .map(
      (a) => `<div class="row ${a.id === active.id ? "on" : ""}" data-area="${a.id}">
         <button class="swatch" data-swatch="${a.id}" style="background:${a.color}" title="Change colour"></button>
         <input class="nm-edit" data-rename="${a.id}" value="${esc(a.name)}" spellcheck="false" />
         <span class="sub">${S.doc.rooms.filter((r) => r.areaId === a.id).length}</span>
         ${S.doc.areas.length > 1 ? `<button class="mini" data-delarea="${a.id}" title="Delete area">×</button>` : ""}
       </div>`
    )
    .join("");
}

function renderRooms(): void {
  const host = $("#room-list");
  $("#room-count").textContent = String(S.doc.rooms.length);
  $("#btn-add-room").title = "New room in " + activeArea().name;
  if (!S.doc.rooms.length) {
    host.innerHTML = `<div class="empty">Hit + to start a room, then drag on the grid to paint its cells.</div>`;
    return;
  }
  const selId = S.sel && S.sel.type === "room" ? S.sel.id : null;
  const byArea = new Map<string, typeof S.doc.rooms>();
  S.doc.rooms.forEach((r) => {
    if (!byArea.has(r.areaId)) byArea.set(r.areaId, []);
    byArea.get(r.areaId)!.push(r);
  });
  let html = "";
  for (const a of S.doc.areas) {
    const list = byArea.get(a.id);
    if (!list || !list.length) continue;
    html += `<div class="grp" style="color:${a.color}">${esc(a.name)}</div>`;
    html += list
      .map(
        (r) => `<div class="row ${r.id === selId ? "on" : ""}" data-room="${r.id}">
           <span class="swatch" style="background:${roomColor(r)}"></span>
           <span class="nm">${esc(r.name)}</span>
           <span class="sub">${r.cells.length}</span>
         </div>`
      )
      .join("");
  }
  host.innerHTML = html;
}

function renderLocks(): void {
  const host = $("#lock-list");
  if (!S.doc.locks.length) {
    host.innerHTML = `<div class="empty">No locks yet. Place a door, then give it a lock.</div>`;
    return;
  }
  const selId = S.sel && S.sel.type === "lock" ? S.sel.id : null;
  host.innerHTML = S.doc.locks
    .map((l) => {
      const doors = S.doc.doors.filter((d) => d.lockId === l.id).length;
      const keys = l.keyIds.filter((k) => keyById(k)).length;
      return `<div class="row ${l.id === selId ? "on" : ""}" data-lock="${l.id}">
          <span class="swatch" style="background:${l.color}"></span>
          <span class="nm">${esc(l.name)}</span>
          <span class="sub" title="${doors} door(s) · ${keys} key(s)">${doors}⌗ ${keys}✦</span>
        </div>`;
    })
    .join("");
}

function renderKeys(): void {
  const host = $("#key-list");
  $("#key-count").textContent = String(S.doc.keys.length);
  if (!S.doc.keys.length) {
    host.innerHTML = `<div class="empty">No keys yet. Use the Key tool on the map.</div>`;
    return;
  }
  const selId = S.sel && S.sel.type === "key" ? S.sel.id : null;
  host.innerHTML = S.doc.keys
    .map((k) => {
      const r = roomAtCell(...markerCell(k.x, k.y));
      return `<div class="row ${k.id === selId ? "on" : ""}" data-key="${k.id}">
          <span class="swatch rnd" style="background:${k.color}"></span>
          <span class="nm">${esc(k.name)}</span>
          <span class="sub">${r ? esc(r.name) : k.x + "," + k.y}</span>
        </div>`;
    })
    .join("");
}

/** List row extras for an element the UE importer can't generate yet: a class that turns its name red, and a tag
    saying why ("未分类", "钱盒（未选大小）"). */
const untyped = (it: Typed, layer: ElementLayer) => UE.elementStatusOf(it, layer, vocabOf(S.doc)) !== "complete";
const untypedTag = (it: Typed, layer: ElementLayer) => {
  const label = UE.statusLabelOf(it, layer, vocabOf(S.doc));
  return label ? `<span class="untyped-tag">${esc(label)}</span>` : "";
};

function renderStructs(): void {
  const host = $("#struct-list");
  $("#struct-count").textContent = String(S.doc.structures.length);
  if (!S.doc.structures.length) {
    host.innerHTML = `<div class="empty">Walls, hidden walls, mechanisms… Hit + or use S-Paint / S-Rect on the map.</div>`;
    return;
  }
  const selId = S.sel && S.sel.type === "struct" ? S.sel.id : null;
  host.innerHTML = S.doc.structures
    .map(
      (s) => `<div class="row ${s.id === selId ? "on" : ""} ${untyped(s, "structure") ? "untyped" : ""}" data-struct="${s.id}">
          <span class="swatch" style="background:${structColor(s)}"></span>
          <span class="nm">${esc(s.name)}${s.id === S.activeStructId && s.id !== selId ? ' <span class="sub">· active</span>' : ""}</span>
          ${untypedTag(s, "structure")}
          <span class="sub" title="Area in cells">${num(area(sT(s)) / (TICKS * TICKS))}</span>
        </div>`
    )
    .join("");
}

function renderEdgeStructs(): void {
  const host = $("#edge-list");
  $("#edge-count").textContent = String(S.doc.edgeStructs.length);
  if (!S.doc.edgeStructs.length) {
    host.innerHTML = `<div class="empty">Platforms and ledges. Hit + or use the Edge tool and drag a segment.</div>`;
    return;
  }
  const selId = S.sel && S.sel.type === "edge" ? S.sel.id : null;
  host.innerHTML = S.doc.edgeStructs
    .map(
      (s) => `<div class="row ${s.id === selId ? "on" : ""} ${untyped(s, "edge") ? "untyped" : ""}" data-edge="${s.id}">
          <span class="swatch" style="background:${structColor(s)};height:4px;border-radius:2px"></span>
          <span class="nm">${esc(s.name)}${s.id === S.activeEdgeId && s.id !== selId ? ' <span class="sub">· active</span>' : ""}</span>
          ${untypedTag(s, "edge")}
          <span class="sub" title="Total length in cells">${num(eT(s).reduce((a, g) => a + segLength(g), 0) / TICKS)}</span>
        </div>`
    )
    .join("");
}

function renderStamps(): void {
  const host = $("#stamp-list");
  $("#stamp-count").textContent = String(S.doc.stamps.length);
  if (!S.doc.stamps.length) {
    host.innerHTML = `<div class="empty">Emoji markers — save points, items, bosses… Hit + or use the Stamp tool.</div>`;
    return;
  }
  const selId = S.sel && S.sel.type === "stamp" ? S.sel.id : null;
  host.innerHTML = S.doc.stamps
    .map(
      (s) => `<div class="row ${s.id === selId ? "on" : ""} ${untyped(s, "stamp") ? "untyped" : ""}" data-stamp="${s.id}">
          <span class="emo">${esc(s.emoji)}</span>
          <span class="nm">${esc(s.name)}${s.id === S.activeStampId && s.id !== selId ? ' <span class="sub">· active</span>' : ""}</span>
          ${untypedTag(s, "stamp")}
          <span class="sub" title="Placed copies">${s.points.length}</span>
        </div>`
    )
    .join("");
}
