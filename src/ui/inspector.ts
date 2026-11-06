/* Inspector: edit whatever is selected. */
import type { Room, Door, Key, Lock, Structure, EdgeStruct, Stamp, Note, ElementLayer } from "../model/types.ts";
import { AREA_COLORS, LOCK_COLORS, STRUCT_COLORS, NOTE_COLORS, STAMP_EMOJI, pickEmoji } from "../model/constants.ts";
import {
  S, requestDraw, pushUndo, commit, selExists, activeRoom, areaById, lockById, keyById, roomById, structById, edgeStructById,
  stampById, noteById, roomColor, structColor, roomAtCell,
} from "../state/store.ts";
import { scheduleSave } from "../state/persist.ts";
import { roomBBox, edgeCells, markerCell, deleteRoom, deleteDoor, deleteKey, deleteLock, createLock } from "../state/rooms.ts";
import { sT, eT, selPiece, deleteSelPiece, deleteStruct, deleteEdgeStruct, deleteStamp, removeStampPoint, deleteNote } from "../state/layers.ts";
import { orderScope, reorderSel } from "../state/order.ts";
import { area, bbox } from "../geom/region.ts";
import { segLength } from "../geom/segs.ts";
import { TICKS, fromT } from "../geom/lattice.ts";
import { UE, REGIONS, ELEMENT_TYPES } from "../ue.ts";
import { setTool } from "../tools/tool.ts";
import { renderLists } from "./panels.ts";
import { $, esc } from "../util.ts";

type In = HTMLInputElement;
type Ta = HTMLTextAreaElement;
type Sl = HTMLSelectElement;
const q = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector(s) as T | null;
const n2 = (v: number) => String(Math.round(v * 100) / 100);

export function renderInspector(): void {
  const host = $("#inspector");
  const sel = S.sel;
  if (!sel || !selExists(sel)) {
    const r = activeRoom();
    const st = structById(S.activeStructId), es = edgeStructById(S.activeEdgeId);
    host.innerHTML = `<div class="meta">Nothing selected.${r ? ` Painting into <b style="color:${roomColor(r)}">${esc(r.name)}</b>.` : ""}${
      st ? ` Structure tools draw into <b style="color:${structColor(st)}">${esc(st.name)}</b>.` : ""
    }${
      es ? ` Edge tool draws into <b style="color:${structColor(es)}">${esc(es.name)}</b>.` : ""
    }<br /><br />Select a room to rename or recolour it. Select a door to lock it. Select a lock to see which keys open it. Select a structure or edge structure to rename or recolour it.</div>`;
    return;
  }
  const t = sel.type;
  if (t === "struct") inspectLayerItem(host, structById(sel.id)!, false);
  else if (t === "edge") inspectLayerItem(host, edgeStructById(sel.id)!, true);
  else if (t === "stamp") inspectStamp(host, stampById(sel.id)!);
  else if (t === "note") inspectNote(host, noteById(sel.id)!);
  else if (t === "room") inspectRoom(host, roomById(sel.id)!);
  else if (t === "door") inspectDoor(host, S.doc.doors.find((d) => d.id === sel.id)!);
  else if (t === "key") inspectKey(host, keyById(sel.id)!);
  else if (t === "lock") inspectLock(host, lockById(sel.id)!);
  decorateInspector(host);
}

/** Shared extras slotted in above the inspector's action buttons: name visibility and list order. */
function decorateInspector(host: HTMLElement): void {
  const sel = S.sel!;
  const sc = orderScope(sel);
  // notes stand alone: no list to order, but they still have a name to show or hide
  const item: { hideName?: boolean } | null = sc ? sc.item : sel.type === "note" ? noteById(sel.id) : null;
  if (!item) return;
  const named = ["room", "struct", "edge", "stamp", "key", "note"].includes(sel.type);
  let html = "";
  if (named)
    html += `<label class="check"><input type="checkbox" id="i-showname" ${item.hideName ? "" : "checked"} />
      <span>Show name on map</span></label>`;
  const n = sc ? sc.peers.length : 0, pos = sc ? sc.pos : 0;
  if (sc)
    html += `<div class="fld"><label>Order${sel.type === "room" ? " in area" : ""}</label>
    <div class="ord">
      <button data-ord="top" title="Move to top (Shift+[)" ${pos === 0 ? "disabled" : ""}>⤒</button>
      <button data-ord="up" title="Move up ([)" ${pos === 0 ? "disabled" : ""}>↑</button>
      <span class="pos">${pos + 1} / ${n}</span>
      <button data-ord="down" title="Move down (])" ${pos === n - 1 ? "disabled" : ""}>↓</button>
      <button data-ord="bottom" title="Move to bottom (Shift+])" ${pos === n - 1 ? "disabled" : ""}>⤓</button>
    </div></div>`;
  const wrap = document.createElement("div");
  wrap.className = "inspector";
  wrap.innerHTML = html;
  const actions = host.querySelector(".btn-row:last-child");
  host.insertBefore(wrap, actions || null);
  const sn = q<In>("#i-showname");
  if (sn)
    sn.onchange = () => {
      pushUndo();
      if (sn.checked) delete item.hideName;
      else item.hideName = true;
      commit();
    };
  wrap.querySelectorAll<HTMLElement>("[data-ord]").forEach((b) => (b.onclick = () => reorderSel(b.dataset.ord!)));
}

const colorChips = (colors: string[], current: string | null | undefined, attr: string) =>
  `<div class="chips">${colors.map((c) => `<button class="chip ${c === current ? "on" : ""}" style="background:${c}" data-${attr}="${c}"></button>`).join("")}</div>`;

/** Text fields mutate on every keystroke — take one undo snapshot per editing session. */
function undoOnFocus(...els: (HTMLElement | null)[]): void {
  for (const el of els) if (el) el.addEventListener("focus", () => pushUndo());
}

/** Inline warning under the room number: another room in the same area already uses it. */
function numberWarning(r: Room): string {
  if (r.number == null) return "";
  const twins = S.doc.rooms.filter((o) => o !== r && o.areaId === r.areaId && o.number === r.number);
  return twins.length ? `Also used by ${twins.map((o) => `“${esc(o.name)}”`).join(", ")} in this area` : "";
}

function inspectRoom(host: HTMLElement, r: Room): void {
  const b = roomBBox(r);
  const ar = areaById(r.areaId);
  const region = UE.findRegion(REGIONS, ar.region);
  host.innerHTML = `
    <div class="insp-title"><span class="swatch" style="background:${roomColor(r)}"></span>
      <span class="kind">Room</span></div>
    <div class="fld"><label>Name</label><input type="text" id="i-name" value="${esc(r.name)}" /></div>
    <div class="fld"><label>Name position</label>
      <div class="seg" id="i-lpos">${[
        ["center", "Center", "Centre of the room"],
        ["tl", "↖", "Top left"],
        ["tr", "↗", "Top right"],
        ["bl", "↙", "Bottom left"],
        ["br", "↘", "Bottom right"],
      ]
        .map(([v, t, tip]) => `<button data-lpos="${v}" title="${tip}" class="${(r.labelPos || "center") === v ? "on" : ""}">${t}</button>`)
        .join("")}</div>
    </div>
    <div class="fld"><label>Area</label><select id="i-area">${S.doc.areas
      .map((a) => `<option value="${a.id}" ${a.id === r.areaId ? "selected" : ""}>${esc(a.name)}</option>`)
      .join("")}</select></div>
    <div class="fld"><label>Region (whole area “${esc(ar.name)}”)</label><select id="i-region">
      <option value="">— not set —</option>
      ${ar.region != null && !region ? `<option value="${esc(ar.region)}" selected>unknown: ${esc(ar.region)}</option>` : ""}
      ${REGIONS.map((g) => `<option value="${g.region}" ${g.region === ar.region ? "selected" : ""}>${esc(g.label)}</option>`).join("")}
    </select></div>
    <div class="fld"><label>Number in area</label>
      <input type="text" id="i-number" inputmode="numeric" value="${r.number == null ? "" : esc(String(r.number))}" placeholder="1, 2, 3…" />
      <div class="meta err" id="i-number-err">${numberWarning(r)}</div>
      <div class="meta">Code: ${UE.roomCode(region && region.letter, r.number) || "—"}</div>
    </div>
    <div class="fld"><label>Colour override</label>
      ${colorChips(AREA_COLORS, r.color, "color")}
      <button class="btn" id="i-clear-color" style="margin-top:4px">Use area colour</button>
    </div>
    <div class="fld"><label>Notes</label><textarea id="i-notes" placeholder="Design notes, enemies, secrets…">${esc(r.notes)}</textarea></div>
    <div class="meta">${r.cells.length} cells · ${b ? b.w + "×" + b.h : "—"} at ${b ? b.x0 + "," + b.y0 : "—"}</div>
    <div class="btn-row">
      <button class="btn danger" id="i-del">Delete</button>
    </div>`;

  $<In>("#i-name").oninput = (e) => {
    r.name = (e.target as In).value;
    requestDraw();
    renderLists();
    scheduleSave();
  };
  undoOnFocus(q("#i-name"), q("#i-notes"));
  $<Sl>("#i-area").onchange = (e) => {
    pushUndo();
    r.areaId = (e.target as Sl).value;
    S.activeAreaId = r.areaId;
    commit();
  };
  $<Sl>("#i-region").onchange = (e) => {
    pushUndo();
    const v = (e.target as Sl).value;
    if (v) ar.region = v;
    else delete ar.region;
    commit();
  };
  // live parse error while typing; otherwise keep showing the stored number's duplicate warning
  $<In>("#i-number").oninput = (e) => {
    $("#i-number-err").innerHTML = esc(UE.parseRoomNumber((e.target as In).value).error || "") || numberWarning(r);
  };
  $<In>("#i-number").onchange = (e) => {
    const inp = e.target as In;
    const p = UE.parseRoomNumber(inp.value);
    if (p.error) {
      // keep the stored value; leave the message up so it's clear why the field snapped back
      inp.value = r.number == null ? "" : String(r.number);
      $("#i-number-err").textContent = p.error + " — kept the previous value";
      return;
    }
    pushUndo();
    if (p.value == null) delete r.number;
    else r.number = p.value;
    commit();
  };
  $<Ta>("#i-notes").oninput = (e) => {
    r.notes = (e.target as Ta).value;
    scheduleSave();
  };
  $("#i-clear-color").onclick = () => {
    pushUndo();
    r.color = null;
    commit();
  };
  host.querySelectorAll<HTMLElement>("[data-lpos]").forEach((b2) => {
    b2.onclick = () => {
      pushUndo();
      if (b2.dataset.lpos === "center") delete r.labelPos;
      else r.labelPos = b2.dataset.lpos as Room["labelPos"];
      commit();
    };
  });
  $("#i-del").onclick = () => {
    pushUndo();
    deleteRoom(r.id);
    commit();
  };
  host.querySelectorAll<HTMLElement>("[data-color]").forEach((b2) => {
    b2.onclick = () => {
      pushUndo();
      r.color = b2.dataset.color!;
      commit();
    };
  });
}

function inspectDoor(host: HTMLElement, d: Door): void {
  const lock = d.lockId ? lockById(d.lockId) : null;
  const cells = edgeCells(d).map(([x, y]) => roomAtCell(x, y));
  host.innerHTML = `
    <div class="insp-title"><span class="swatch" style="background:${lock ? lock.color : "#93a0b4"}"></span>
      <span class="kind">Door</span></div>
    <div class="fld"><label>Type</label>
      <div class="seg" id="i-kind">
        <button data-kind="passage" class="${d.kind === "passage" ? "on" : ""}">Passage</button>
        <button data-kind="door" class="${d.kind === "door" ? "on" : ""}">Door</button>
        <button data-kind="oneway" class="${d.kind === "oneway" ? "on" : ""}">One-way</button>
      </div>
    </div>
    ${
      d.kind === "oneway"
        ? `<div class="fld"><label>Direction</label><button class="btn" id="i-flip">Passable ${
            d.o === "v" ? (d.dir === 1 ? "→ east" : "← west") : d.dir === 1 ? "↓ south" : "↑ north"
          } — flip</button></div>`
        : ""
    }
    <div class="fld"><label>Lock</label>
      <select id="i-lock">
        <option value="">— unlocked —</option>
        ${S.doc.locks.map((l) => `<option value="${l.id}" ${l.id === d.lockId ? "selected" : ""}>${esc(l.name)}</option>`).join("")}
        <option value="__new">+ New lock…</option>
      </select>
    </div>
    ${
      lock
        ? `<div class="fld"><label>Opened by</label>${keyToggleList(lock)}</div>
           <button class="btn" id="i-sel-lock">Select lock “${esc(lock.name)}”</button>`
        : ""
    }
    <div class="meta">Between ${cells.map((c) => (c ? esc(c.name) : "void")).join(" ↔ ")}</div>
    <div class="btn-row"><button class="btn danger" id="i-del">Delete door</button></div>`;

  host.querySelectorAll<HTMLElement>("#i-kind button").forEach((b) => {
    b.onclick = () => {
      pushUndo();
      d.kind = b.dataset.kind as Door["kind"];
      commit();
    };
  });
  const flip = q("#i-flip");
  if (flip)
    flip.onclick = () => {
      pushUndo();
      d.dir = d.dir === 1 ? -1 : 1;
      commit();
    };
  $<Sl>("#i-lock").onchange = (e) => {
    pushUndo();
    const v = (e.target as Sl).value;
    if (v === "__new") d.lockId = createLock().id;
    else d.lockId = v || null;
    commit();
  };
  const sl = q("#i-sel-lock");
  if (sl && lock)
    sl.onclick = () => {
      S.sel = { type: "lock", id: lock.id };
      commit(true);
    };
  bindKeyToggles(host, lock);
  $("#i-del").onclick = () => {
    pushUndo();
    deleteDoor(d.id);
    commit();
  };
}

function keyToggleList(lock: Lock): string {
  if (!S.doc.keys.length) return `<div class="meta">No keys exist yet — place one with the Key tool.</div>`;
  return `<div class="link-list">${S.doc.keys
    .map(
      (k) => `<label class="check"><input type="checkbox" data-keytoggle="${k.id}" ${lock.keyIds.includes(k.id) ? "checked" : ""} /><span class="swatch rnd" style="background:${k.color}"></span><span>${esc(k.name)}</span></label>`
    )
    .join("")}</div>`;
}
function bindKeyToggles(host: HTMLElement, lock: Lock | null): void {
  if (!lock) return;
  host.querySelectorAll<In>("[data-keytoggle]").forEach((cb) => {
    cb.onchange = () => {
      pushUndo();
      const id = cb.dataset.keytoggle!;
      if (cb.checked) {
        if (!lock.keyIds.includes(id)) lock.keyIds.push(id);
      } else lock.keyIds = lock.keyIds.filter((x) => x !== id);
      commit();
    };
  });
}

function inspectKey(host: HTMLElement, k: Key): void {
  const room = roomAtCell(...markerCell(k.x, k.y));
  const opens = S.doc.locks.filter((l) => l.keyIds.includes(k.id));
  host.innerHTML = `
    <div class="insp-title"><span class="swatch rnd" style="background:${k.color}"></span>
      <span class="kind">Key</span></div>
    <div class="fld"><label>Name</label><input type="text" id="i-name" value="${esc(k.name)}" placeholder="Double Jump, Red Key…" /></div>
    <div class="fld"><label>Colour</label>${colorChips(LOCK_COLORS, k.color, "kcolor")}</div>
    <div class="fld"><label>Opens</label>
      ${
        S.doc.locks.length
          ? `<div class="link-list">${S.doc.locks
              .map(
                (l) => `<label class="check"><input type="checkbox" data-locktoggle="${l.id}" ${l.keyIds.includes(k.id) ? "checked" : ""} /><span class="swatch" style="background:${l.color}"></span><span>${esc(l.name)}</span></label>`
              )
              .join("")}</div>`
          : `<div class="meta">No locks yet.</div>`
      }
    </div>
    <div class="meta">At ${k.x}, ${k.y}${room ? " · in " + esc(room.name) : ""} · opens ${opens.length} lock(s)</div>
    <div class="btn-row"><button class="btn danger" id="i-del">Delete key</button></div>`;

  $<In>("#i-name").oninput = (e) => {
    k.name = (e.target as In).value;
    requestDraw();
    renderLists();
    scheduleSave();
  };
  undoOnFocus(q("#i-name"));
  host.querySelectorAll<HTMLElement>("[data-kcolor]").forEach((b) => {
    b.onclick = () => {
      pushUndo();
      k.color = b.dataset.kcolor!;
      commit();
    };
  });
  host.querySelectorAll<In>("[data-locktoggle]").forEach((cb) => {
    cb.onchange = () => {
      pushUndo();
      const l = lockById(cb.dataset.locktoggle)!;
      if (cb.checked) {
        if (!l.keyIds.includes(k.id)) l.keyIds.push(k.id);
      } else l.keyIds = l.keyIds.filter((x) => x !== k.id);
      commit();
    };
  });
  $("#i-del").onclick = () => {
    pushUndo();
    deleteKey(k.id);
    commit();
  };
}

function inspectLock(host: HTMLElement, l: Lock): void {
  const doors = S.doc.doors.filter((d) => d.lockId === l.id);
  const keys = l.keyIds.map(keyById).filter((k) => !!k);
  host.innerHTML = `
    <div class="insp-title"><span class="swatch" style="background:${l.color}"></span>
      <span class="kind">Lock</span></div>
    <div class="fld"><label>Name</label><input type="text" id="i-name" value="${esc(l.name)}" placeholder="Grapple gate…" /></div>
    <div class="fld"><label>Colour</label>${colorChips(LOCK_COLORS, l.color, "lcolor")}</div>
    <div class="fld"><label>Opened by any of</label>${keyToggleList(l)}</div>
    <div class="meta">${doors.length} door(s) use this lock · ${keys.length} key(s) open it${
      doors.length && !keys.length ? ` · <span style="color:#e0a13a">soft-locked: no key assigned</span>` : ""
    }</div>
    <div class="btn-row"><button class="btn danger" id="i-del">Delete lock</button></div>`;

  $<In>("#i-name").oninput = (e) => {
    l.name = (e.target as In).value;
    renderLists();
    scheduleSave();
  };
  undoOnFocus(q("#i-name"));
  host.querySelectorAll<HTMLElement>("[data-lcolor]").forEach((b) => {
    b.onclick = () => {
      pushUndo();
      l.color = b.dataset.lcolor!;
      commit();
    };
  });
  bindKeyToggles(host, l);
  $("#i-del").onclick = () => {
    pushUndo();
    deleteLock(l.id);
    commit();
  };
}

/** "Type" dropdown for structures, edge structures and stamps; only the types of `layer` are offered. */
function typeField(it: { typeId?: string | null; name: string }, layer: ElementLayer): string {
  const cur = UE.elementTypeOf(it, layer, ELEMENT_TYPES);
  const unknown = it.typeId != null && !cur;
  const hint = cur
    ? cur.generate === "auto"
      ? "UE import generates this element"
      : "UE import leaves a placeholder — placed by hand"
    : unknown
      ? "Not a type of this layer in mvmap-types.js — counts as 未分类"
      : "未分类 — pick a type for the UE importer";
  return `<div class="fld"><label>Type</label><select id="i-type">
      <option value="" ${cur || unknown ? "" : "selected"}>— 未分类 —</option>
      ${unknown ? `<option value="${esc(it.typeId)}" selected>unknown: ${esc(it.typeId)}</option>` : ""}
      ${UE.typesForLayer(ELEMENT_TYPES, layer)
        .map((t) => `<option value="${esc(t.id)}" ${cur && cur.id === t.id ? "selected" : ""}>${esc(t.emoji)} ${esc(t.label)} · ${t.generate}</option>`)
        .join("")}
    </select>
    <div class="meta ${cur ? "" : "err"}">${hint}</div></div>`;
}
function bindTypeField(it: Structure | EdgeStruct | Stamp, layer: ElementLayer): void {
  $<Sl>("#i-type").onchange = (e) => {
    const next = UE.chooseType(it, layer, (e.target as Sl).value, ELEMENT_TYPES);
    if (next.typeId === it.typeId) return; // re-picked the current or the "unknown" entry
    pushUndo();
    Object.assign(it, next);
    commit();
  };
}

/** Shared inspector for structures and edge structures — both are a named, coloured set. */
function inspectLayerItem(host: HTMLElement, it: Structure | EdgeStruct, isEdge: boolean): void {
  const col = structColor(it);
  const pc = selPiece();
  const piece = pc && pc.item === it && !pc.whole ? pc : null; // only worth a separate button when it isn't everything
  let size: string;
  let pieceSize = "";
  if (isEdge) {
    const segs = eT(it as EdgeStruct);
    size = `${segs.length} segment(s) · length ${n2(segs.reduce((a, g) => a + segLength(g), 0) / TICKS)}`;
    if (piece && piece.kind === "edge") pieceSize = `${piece.segs.length} segment(s), length ${n2(piece.segs.reduce((a, g) => a + segLength(g), 0) / TICKS)}`;
  } else {
    const rects = sT(it as Structure);
    const b = bbox(rects);
    size = `area ${n2(area(rects) / (TICKS * TICKS))} · ${rects.length} rect(s)${
      b ? ` · ${n2(fromT(b.x1 - b.x0))}×${n2(fromT(b.y1 - b.y0))} at ${fromT(b.x0)},${fromT(b.y0)}` : ""
    }`;
    if (piece && piece.kind === "struct") pieceSize = `area ${n2(area(piece.rects) / (TICKS * TICKS))}`;
  }
  host.innerHTML = `
    <div class="insp-title"><span class="swatch" style="background:${col}${isEdge ? ";height:4px;border-radius:2px" : ""}"></span>
      <span class="kind">${isEdge ? "Edge structure" : "Structure"}</span></div>
    <div class="fld"><label>Name</label><input type="text" id="i-name" value="${esc(it.name)}" placeholder="${
      isEdge ? "One-way platform, ledge…" : "Breakable wall, hidden wall, lever…"
    }" /></div>
    ${typeField(it, isEdge ? "edge" : "structure")}
    <div class="fld"><label>Colour</label>${colorChips(STRUCT_COLORS, it.color, "scolor")}
      <div class="color-row"><input type="color" id="i-ccolor" value="${/^#[0-9a-f]{6}$/i.test(col) ? col : "#b8c0cc"}" /><span>Custom colour</span></div>
    </div>
    <div class="fld"><label>Notes</label><textarea id="i-notes" placeholder="Behaviour, trigger, what opens it…">${esc(it.notes)}</textarea></div>
    <div class="meta">${size}${(isEdge ? S.activeEdgeId : S.activeStructId) === it.id ? " · active drawing target" : ""}${
      piece ? `<br />Selected piece: ${pieceSize} — <kbd>Del</kbd> removes just this piece. Pick it in the list to select every piece.` : ""
    }</div>
    <div class="btn-row">
      <button class="btn primary" id="i-draw">${isEdge ? "Draw edges" : "Paint into"}</button>
      ${piece ? `<button class="btn danger" id="i-del-piece">Delete piece</button>` : ""}
      <button class="btn danger" id="i-del">${piece ? "Delete all" : "Delete"}</button>
    </div>`;

  $<In>("#i-name").oninput = (e) => {
    it.name = (e.target as In).value;
    requestDraw();
    renderLists();
    scheduleSave();
  };
  $<Ta>("#i-notes").oninput = (e) => {
    it.notes = (e.target as Ta).value;
    scheduleSave();
  };
  bindTypeField(it, isEdge ? "edge" : "structure");
  undoOnFocus(q("#i-name"), q("#i-notes"), q("#i-ccolor"));
  host.querySelectorAll<HTMLElement>("[data-scolor]").forEach((b2) => {
    b2.onclick = () => {
      pushUndo();
      it.color = b2.dataset.scolor!;
      commit();
    };
  });
  // live preview while the picker is open; rebuild the panel once it closes
  $<In>("#i-ccolor").oninput = (e) => {
    it.color = (e.target as In).value;
    requestDraw();
    renderLists();
    scheduleSave();
  };
  $<In>("#i-ccolor").onchange = () => commit();
  $("#i-draw").onclick = () => {
    if (isEdge) {
      S.activeEdgeId = it.id;
      setTool("edge");
    } else {
      S.activeStructId = it.id;
      setTool(S.tool === "srect" ? "srect" : "spaint");
    }
    commit(true);
  };
  $("#i-del").onclick = () => {
    pushUndo();
    if (isEdge) deleteEdgeStruct(it.id);
    else deleteStruct(it.id);
    commit();
  };
  const dp = q("#i-del-piece");
  if (dp)
    dp.onclick = () => {
      pushUndo();
      deleteSelPiece();
      commit();
    };
}

function inspectNote(host: HTMLElement, n: Note): void {
  const col = n.color || NOTE_COLORS[0];
  const room = roomAtCell(...markerCell(n.x, n.y));
  host.innerHTML = `
    <div class="insp-title"><span class="swatch" style="background:${col}"></span><span class="kind">Note</span></div>
    <div class="fld"><label>Label</label><input type="text" id="i-name" value="${esc(n.name)}" placeholder="Shown under the note" /></div>
    <div class="fld"><label>Details</label><textarea id="i-ntext" placeholder="What the expanded note says…">${esc(n.text)}</textarea></div>
    <div class="fld"><label>Colour</label>${colorChips(NOTE_COLORS, n.color, "ncolor")}
      <div class="color-row"><input type="color" id="i-ccolor" value="${/^#[0-9a-f]{6}$/i.test(col) ? col : "#f0dc3a"}" /><span>Custom colour</span></div>
    </div>
    <div class="btn-row">
      <button class="btn" id="i-expand">${n.expanded ? "▴ Collapse" : "▾ Expand"} on map</button>
      ${n.box ? `<button class="btn" id="i-boxreset" title="Put the open box back beside the note">Reset box position</button>` : ""}
    </div>
    <div class="meta">At ${n.x}, ${n.y}${room ? " · in " + esc(room.name) : ""} · <kbd>Enter</kbd> expands / collapses</div>
    <div class="btn-row"><button class="btn danger" id="i-del">Delete note</button></div>`;

  $<In>("#i-name").oninput = (e) => {
    n.name = (e.target as In).value;
    requestDraw();
    scheduleSave();
  };
  $<Ta>("#i-ntext").oninput = (e) => {
    n.text = (e.target as Ta).value;
    requestDraw();
    scheduleSave();
  };
  undoOnFocus(q("#i-name"), q("#i-ntext"), q("#i-ccolor"));
  host.querySelectorAll<HTMLElement>("[data-ncolor]").forEach((b) => {
    b.onclick = () => {
      pushUndo();
      n.color = b.dataset.ncolor!;
      commit();
    };
  });
  $<In>("#i-ccolor").oninput = (e) => {
    n.color = (e.target as In).value;
    requestDraw();
    scheduleSave();
  };
  $<In>("#i-ccolor").onchange = () => commit();
  $("#i-expand").onclick = () => {
    pushUndo();
    n.expanded = !n.expanded;
    commit();
  };
  const br = q("#i-boxreset");
  if (br)
    br.onclick = () => {
      pushUndo();
      delete n.box;
      commit();
    };
  $("#i-del").onclick = () => {
    pushUndo();
    deleteNote(n.id);
    commit();
  };
}

function inspectStamp(host: HTMLElement, st: Stamp): void {
  const col = structColor(st);
  const selPt = S.sel && S.sel.pt;
  const pt = selPt ? st.points.find((p) => p.x === selPt.x && p.y === selPt.y) || null : null;
  const room = pt ? roomAtCell(...markerCell(pt.x, pt.y)) : null;
  host.innerHTML = `
    <div class="insp-title"><span class="emo">${esc(st.emoji)}</span><span class="kind">Stamp</span></div>
    <div class="fld"><label>Name</label><input type="text" id="i-name" value="${esc(st.name)}" placeholder="Save point, boss, chest…" /></div>
    ${typeField(st, "stamp")}
    <div class="fld"><label>Emoji</label>
      <input type="text" id="i-emoji" value="${esc(st.emoji)}" placeholder="One emoji (Win + .)" autocomplete="off" spellcheck="false" />
      <div class="emoji-grid" style="margin-top:4px">${STAMP_EMOJI.map((e) => `<button data-emoji="${esc(e)}" class="${e === st.emoji ? "on" : ""}">${e}</button>`).join("")}</div>
    </div>
    <div class="fld"><label>Tile colour</label>${colorChips(STRUCT_COLORS, st.color, "scolor")}
      <div class="color-row"><input type="color" id="i-ccolor" value="${/^#[0-9a-f]{6}$/i.test(col) ? col : "#b8c0cc"}" /><span>Custom colour</span></div>
    </div>
    <div class="fld"><label>Notes</label><textarea id="i-notes" placeholder="What is here, when it appears…">${esc(st.notes)}</textarea></div>
    <div class="meta">Placed ${st.points.length} time(s)${pt ? ` · this one at ${pt.x}, ${pt.y}${room ? " in " + esc(room.name) : ""}` : ""}${
      S.activeStampId === st.id ? " · active stamp" : ""
    }</div>
    <div class="btn-row">
      <button class="btn primary" id="i-draw">Stamp with it</button>
      ${pt ? `<button class="btn" id="i-del-one">Remove this</button>` : ""}
      <button class="btn danger" id="i-del">Delete</button>
    </div>`;

  $<In>("#i-name").oninput = (e) => {
    st.name = (e.target as In).value;
    requestDraw();
    renderLists();
    scheduleSave();
  };
  $<Ta>("#i-notes").oninput = (e) => {
    st.notes = (e.target as Ta).value;
    scheduleSave();
  };
  bindTypeField(st, "stamp");
  // exactly one emoji: typing or pasting replaces the current one, anything else is dropped
  const emo = $<In>("#i-emoji");
  emo.addEventListener("focus", () => emo.select());
  const takeEmoji = () => {
    const g = pickEmoji(emo.value);
    if (g) st.emoji = g;
    if (emo.value !== st.emoji) emo.value = st.emoji;
    emo.select();
    const t = host.querySelector(".insp-title .emo");
    if (t) t.textContent = st.emoji;
    host.querySelectorAll<HTMLElement>("[data-emoji]").forEach((b) => b.classList.toggle("on", b.dataset.emoji === st.emoji));
    requestDraw();
    renderLists();
    scheduleSave();
  };
  emo.oninput = (e) => {
    if (!(e as InputEvent).isComposing) takeEmoji();
  };
  emo.addEventListener("compositionend", takeEmoji);
  emo.addEventListener("blur", () => {
    if (emo.value !== st.emoji) emo.value = st.emoji;
  });
  undoOnFocus(q("#i-name"), q("#i-notes"), q("#i-emoji"), q("#i-ccolor"));
  host.querySelectorAll<HTMLElement>("[data-emoji]").forEach((b) => {
    b.onclick = () => {
      pushUndo();
      st.emoji = b.dataset.emoji!;
      commit();
    };
  });
  host.querySelectorAll<HTMLElement>("[data-scolor]").forEach((b) => {
    b.onclick = () => {
      pushUndo();
      st.color = b.dataset.scolor!;
      commit();
    };
  });
  $<In>("#i-ccolor").oninput = (e) => {
    st.color = (e.target as In).value;
    requestDraw();
    scheduleSave();
  };
  $<In>("#i-ccolor").onchange = () => commit();
  $("#i-draw").onclick = () => {
    S.activeStampId = st.id;
    setTool("stamp");
    commit(true);
  };
  const one = q("#i-del-one");
  if (one && pt)
    one.onclick = () => {
      pushUndo();
      removeStampPoint(st, pt);
      S.sel = { type: "stamp", id: st.id };
      commit();
    };
  $("#i-del").onclick = () => {
    pushUndo();
    deleteStamp(st.id);
    commit();
  };
}
