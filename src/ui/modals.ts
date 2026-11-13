/* Modals: help (with the shortcut editor) and the saved-map library. The stamp category panel is in categories.ts. */
import { S } from "../state/store.ts";
import { Store } from "../state/persist.ts";
import { newDoc } from "../model/doc.ts";
import { loadDoc } from "../io/files.ts";
import { CATEGORY_PANEL_SHELL, renderCategoryPanel } from "./categories.ts";
import {
  TOOL_LIST, DEFAULT_TOOL_KEYS, applyToolKeys, saveToolKeys, readKeymap, keymapProblem, keyProblem, keyLabel, toolName, normKey,
  currentToolKeys, toolForKey,
} from "../tools/keymap.ts";
import { $, esc, saveBlob } from "../util.ts";

export const modalOpen = (): boolean => !$("#modal").hidden;
/** `cls`: an extra class for the box, e.g. "modal-wide". */
export function openModal(html: string, cls?: string): void {
  $("#modal-box").className = "modal" + (cls ? " " + cls : "");
  $("#modal-box").innerHTML = html;
  $("#modal").hidden = false;
}
export function closeModal(): void {
  $("#modal").hidden = true;
  rebinding = null;
}

const HELP = `
  <h2>MVMap — Metroidvania Map Editor</h2>
  <p>A tool for laying out metroidvania worlds: paint rooms onto grid paper, colour them by area,
     connect them with doors, and model progression with locks and keys.</p>
  <h3>Rooms</h3>
  <p>Press <b>+</b> above the room list to open a new room in the active area, then drag on the grid
     to paint its cells — a room is any set of whole cells, so L-shapes and corridors are fine.
     <b>Shift</b>+paint also starts a new room without leaving the canvas; <b>Ctrl</b>+paint erases. Adding an area opens a
     room in it automatically.</p>
  <h3>Locks &amp; keys</h3>
  <p>The core metroidvania principle is that the map is non-linear and gated. New areas are
     <em>locked</em>, and the player must find a <em>key</em> elsewhere to get through. A key is rarely a
     literal key — it's a movement ability, an item, or a story beat. One lock can have several keys,
     and one key can open many locks.</p>
  <p>Place a door on a cell edge, assign it a lock, then tick which keys open that lock. Selecting a
     lock or key draws the links between them, so you can read the progression flow at a glance.
     A lock with doors but no keys is flagged as a soft-lock.</p>
  <h3>Snapping</h3>
  <p>Rooms and doors always sit on whole cells. Everything drawn on top of them — structures, edge structures,
     stamps, notes and keys — snaps to the step picked under <b>Snap</b> on the left: 1, ½, ⅓, ¼, ⅙, ⅛ of a cell, or
     <b>Free</b>. Hold <b>Alt</b> to switch snapping off for a moment (or, when the step is Free, to snap to the
     last step you used). The grid shows the step's sub-lines while a tool that uses it is active.</p>
  <h3>Structures</h3>
  <p>A <b>structure</b> is a named, coloured area drawn on a layer above the rooms — walls,
     breakable or hidden walls, mechanisms, switches. It is made of rectangles at the snap step, so at ½ you can
     draw a ledge one cell wide and half a cell tall. Paint it with <b>S-Paint</b> (a step-sized square brush;
     ⅛ cell while snapping is free) or drag a box with <b>S-Rect</b>; <b>Shift</b> starts a new structure,
     <b>Ctrl</b> erases. <b>S-Erase</b> removes structure area and also cuts any edge structure it passes over.
     Structures never overlap: painting one over another takes the area away from the other. Painting never
     changes the room underneath, and moving a room carries the part of each structure inside it. Clicking with
     <b>Select</b> picks only the connected piece under the pointer — rectangles joined along a side (not just
     at a corner) — so dragging moves it and <b>Del</b> deletes it without touching the structure's other
     pieces. Picking the structure in its list selects every piece.</p>
  <p>An <b>edge structure</b> is made of line segments, drawn as thick bars — use it for platforms and ledges.
     With the <b>Edge</b> tool, drag from one snap point to another to lay a segment at any angle; hold
     <b>Shift</b> while dragging to lock it to 45° steps. Holding <b>Shift</b> as you press starts a new edge structure;
     clicking a segment selects it; <b>Ctrl</b>-drag erases. Segments on the same line that touch merge into one.
     Segments that share a point form one piece; <b>Select</b> picks, drags and deletes one piece at a time.</p>
  <h3>Stamps</h3>
  <p>A <b>stamp</b> drops an emoji marker the size of one cell, on the very top layer — save points, items,
     bosses, shops. Like structures, each stamp has a name, colour and notes, and can be placed as often as you
     like; pick the emoji from the inspector's palette or type one — the field holds exactly one emoji. Click with the <b>Stamp</b> tool
     to place the active one (it snaps like everything else), <b>Shift</b>-click to start a new stamp, <b>Ctrl</b>-click
     to remove one. Click a placed stamp to select just that copy (only it lights up) and drag to move it; picking the
     stamp in its list selects every copy. Name, emoji, colour and type belong to the stamp, so they are shared by all
     its copies.</p>
  <p>A stamp's <b>Type</b> comes from this map's stamp categories: groups (敌人 ▸), types and tiers (强弱, 大小).
     <b>Stamp 分类…</b> in the top bar edits them. Renaming never changes a stamp; deleting asks first, and the stamps
     using it stay, shown red until they are picked again. Emoji and colour changes apply to new stamps only. The id
     after each name is what UE configures by: click it to give an entry you added a readable English id
     (TreasureChest); the default categories' ids are locked.</p>
  <h3>Notes</h3>
  <p>A <b>note</b> is a standalone annotation the size of one cell, drawn above everything else. Click with the
     <b>Note</b> tool to add one, then write its details in the Inspector. The <b>+</b>
     button on the note (or <b>Enter</b> while it's selected) expands it into a translucent text box on
     the map; the box's <b>−</b> button collapses it again. Drag the open box anywhere — it remembers where you left
     it, even after collapsing; <b>Reset box position</b> in the Inspector puts it back. The label under the note can be hidden with
     <b>Show name on map</b>. Notes have no list of their own — <b>Ctrl</b>-click, right-click remove or
     <b>Del</b> deletes one, and <b>Show notes</b> (in <b>Options</b>) hides them all. They are separate from the notes field
     on rooms and structures.</p>
  <h3>Hand-placed markers</h3>
  <p>Structures, edge structures and stamps whose <b>Type</b> is <code>manual</code> are not generated by the
     UE importer — someone places them by hand. They get an orange dashed outline and a <b>手</b> badge.
     Elements with no usable type (<b>未分类</b>) get a red dotted outline and a <b>?</b> badge. Turn on
     <b>Highlight hand-placed only</b> in <b>Options</b> to fade everything else except rooms. Markers and
     fading show up in <b>PNG</b> exports exactly as on screen.</p>
  <h3>Pencil</h3>
  <p>The <b>Pencil</b> draws freely on the map, off the grid, in any colour and brush size — for sketches,
     arrows and quick annotations. Pencil strokes don't belong to any area, room or structure and don't
     move with them. <b>P-Erase</b> (or <b>Ctrl</b> / right-click with the pencil) rubs out pencil ink only,
     cutting through strokes. Colour and sizes are in the bar at the top of the map while either tool is
     active; <b>Clear all</b> there removes every stroke (undoable). <b>Show pencil drawings</b> in
     <b>Options</b> hides them. Strokes are saved with the map.</p>
  <h3>Right-click</h3>
  <p>Choose what the right mouse button does under <b>Right-click</b> in <b>Options</b>, at the bottom of the right panel.
     <b>Remove</b> works like holding <b>Ctrl</b> with the current tool — erase cells, clear structure
     area or edge segments, delete a door, key, note or stamp; with <b>Select</b> it removes the smallest thing under
     the pointer. <b>Hold &amp; drag to pan</b> turns it into a pan
     button instead. The choice is remembered in this browser.</p>
  <h3>Copy &amp; paste</h3>
  <p>Select a room, a structure or edge structure piece, a stamp or a note, press <b>Ctrl+C</b>, point at the map and press
     <b>Ctrl+V</b>: a copy lands centred on the pointer, snapped (rooms to whole cells), and is selected so you can drag
     it on. With the pointer off the map it goes just to the right of the original. A copied piece or stamp joins the
     structure, edge structure or stamp it came from, so it keeps the name and type; a pasted note is a new note with
     the same label, text and colour; a pasted room is a new room (“… copy”, without a number) and brings the
     structure, edge and stamp parts and the notes inside it — doors and keys stay behind. Like painting, a paste takes over whatever is underneath. The copy stays available after opening another
     map, and <b>Ctrl+Z</b> undoes a paste.</p>
  <h3>Names &amp; order</h3>
  <p>A room's <b>Name position</b> puts its label in the centre or in one of its four corners.
     Every inspector has <b>Show name on map</b> to hide one object's label, and <b>Order</b> buttons
     to move the selection up or down its list (rooms reorder within their area). Lists draw in order,
     so later entries paint over earlier ones.</p>
  <h3>Storage</h3>
  <p>Maps autosave to your browser (IndexedDB, or localStorage when that isn't available). Use
     <b>Export</b> for a portable <code>.json</code> file and <b>PNG</b> for an image of the whole map.
     <b>Import</b> opens a file as a new map; <b>Undo</b> right after takes you back to the map you had open.
     Maps from MVMap 1.x open as they are and are converted to the 2.0 format.</p>
  <h3>Tool shortcuts</h3>
  <p>Click a key, then press the new one. Taking a key another tool already uses swaps the two.
     Modifier combinations and the reserved keys — Space, F, Enter, Esc, Del, Backspace, [ ] and Tab —
     can't be bound. Holding <b>Space</b> always pans. Shortcuts are saved in this browser; use
     Export / Import to move them to another one.</p>
  <div class="keymap" id="keymap"></div>
  <div class="meta km-msg" id="km-msg"></div>
  <div class="btn-row" style="margin-top:4px">
    <button class="btn" id="km-import">Import…</button>
    <button class="btn" id="km-export">Export</button>
    <button class="btn" id="km-reset">Reset to defaults</button>
  </div>
  <h3>Map shortcuts</h3>
  <div class="kbd-grid">
    <b>Space (hold)</b><span>Pan</span>
    <b>Alt (hold)</b><span>Toggle snapping</span>
    <b>Shift + paint</b><span>Start a new room / structure / stamp</span>
    <b>Shift (while dragging an edge)</b><span>Lock to 45° steps</span>
    <b>Ctrl + paint / click</b><span>Erase / remove instead</span>
    <b>Right-click</b><span>Remove, or drag to pan (configurable)</span>
    <b>F</b><span>Zoom to fit</span>
    <b>Enter</b><span>Expand / collapse selected note</span>
    <b>Del</b><span>Delete selection</span>
    <b>[ / ]</b><span>Move selection up / down its list</span>
    <b>Shift + [ / ]</b><span>Move selection to top / bottom</span>
    <b>Ctrl + C / V</b><span>Copy selection / paste at the pointer</span>
    <b>Ctrl + Z / Y</b><span>Undo / redo</span>
    <b>Ctrl + S</b><span>Export JSON</span>
  </div>
  <div class="close-row"><button class="btn primary" data-close style="flex:0 0 auto;padding:6px 16px">Close</button></div>`;

/* ── Keymap editor (inside the help modal) ─────────────────────────── */
let rebinding: string | null = null; // tool id waiting for its new key
function renderKeymap(msg?: string, isErr?: boolean): void {
  const host = document.querySelector<HTMLElement>("#keymap");
  if (!host) return;
  const keys = currentToolKeys();
  host.innerHTML = TOOL_LIST.map(
    (t) => `<div class="km-row"><span>${esc(t.name)}${t.id === "pan" ? ' <span class="sub">(+ hold Space)</span>' : ""}</span>
        <button class="keycap ${rebinding === t.id ? "wait" : ""}" data-rebind="${t.id}">${
          rebinding === t.id ? "press a key…" : esc(keyLabel(keys[t.id]))
        }</button></div>`
  ).join("");
  host.querySelectorAll<HTMLElement>("[data-rebind]").forEach((b) => {
    b.onclick = () => {
      rebinding = rebinding === b.dataset.rebind ? null : b.dataset.rebind!;
      renderKeymap(rebinding ? `Press the new key for ${toolName(rebinding)} — Esc cancels.` : "");
      // keep Space/Enter from re-clicking the button while it waits for a key
      (document.activeElement as HTMLElement | null)?.blur();
    };
  });
  const m = document.querySelector<HTMLElement>("#km-msg");
  if (m && msg !== undefined) {
    m.textContent = msg;
    m.classList.toggle("err", !!isErr);
  }
}
function exportKeymap(): void {
  const out = { type: "mvmap-shortcuts", version: 1, keys: currentToolKeys() };
  saveBlob(new Blob([JSON.stringify(out, null, 2)], { type: "application/json" }), "mvmap-shortcuts.json");
  renderKeymap("Exported mvmap-shortcuts.json.");
}

function openHelp(): void {
  openModal(HELP);
  renderKeymap();
  $("#km-export").onclick = exportKeymap;
  $("#km-import").onclick = () => $("#keys-input").click();
  $("#km-reset").onclick = () => {
    rebinding = null;
    applyToolKeys(DEFAULT_TOOL_KEYS);
    saveToolKeys();
    renderKeymap("Shortcuts reset to defaults.");
  };
}

async function openLibrary(): Promise<void> {
  const all = (await Store.all()).sort((a, b) => (b.updated || 0) - (a.updated || 0));
  const rows = all.length
    ? all
        .map((d) => {
          const when = d.updated ? new Date(d.updated).toLocaleString() : "—";
          return `<div class="map-row">
              <span class="nm"><b>${esc(d.name || "Untitled")}</b>${d.id === S.doc.id ? ' <span class="sub">— open</span>' : ""}<br /><span class="sub">${
                (d.rooms || []).length
              } rooms · ${(d.structures || []).length + (d.edgeStructs || []).length} structures · ${(d.locks || []).length} locks · ${when}</span></span>
              <button class="btn" data-open="${d.id}" style="flex:0 0 auto;padding:4px 12px">Open</button>
              <button class="btn danger" data-delmap="${d.id}" style="flex:0 0 auto;padding:4px 12px">Delete</button>
            </div>`;
        })
        .join("")
    : `<p>No saved maps yet.</p>`;
  openModal(`<h2>Saved maps</h2><p class="sub">Stored via ${Store.mode === "idb" ? "IndexedDB" : "localStorage"}.</p>${rows}<div class="close-row"><button class="btn primary" data-close style="flex:0 0 auto;padding:6px 16px">Close</button></div>`);

  $("#modal-box").querySelectorAll<HTMLElement>("[data-open]").forEach((b) => {
    b.onclick = () => {
      const d = all.find((x) => x.id === b.dataset.open);
      if (d) {
        loadDoc(d);
        closeModal();
      }
    };
  });
  $("#modal-box").querySelectorAll<HTMLElement>("[data-delmap]").forEach((b) => {
    b.onclick = async () => {
      const id = b.dataset.delmap!;
      const d = all.find((x) => x.id === id);
      if (!confirm(`Delete “${d ? d.name : "this map"}” permanently?`)) return;
      await Store.del(id);
      closeModal();
      if (id === S.doc.id) loadDoc(newDoc());
    };
  });
}

export function bindModals(): void {
  $("#modal").addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    if (t.id === "modal" || t.dataset.close != null) closeModal();
  });
  $("#btn-help").onclick = openHelp;
  $("#btn-maps").onclick = () => void openLibrary();
  $("#btn-categories").onclick = () => {
    openModal(CATEGORY_PANEL_SHELL, "modal-wide");
    renderCategoryPanel();
  };

  // capture phase, so a key being bound never reaches the editor's own shortcuts
  window.addEventListener(
    "keydown",
    (e) => {
      if (!rebinding || $("#modal").hidden) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (["Shift", "Control", "Alt", "Meta", "CapsLock", "AltGraph"].includes(e.key)) return;
      if (e.key === "Escape") {
        rebinding = null;
        renderKeymap("Cancelled.");
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) {
        renderKeymap("Modifier combinations aren't supported — press a single key.", true);
        return;
      }
      const k = normKey(e.key);
      const bad = keyProblem(k);
      if (bad) {
        renderKeymap(bad + " Try another key, or Esc to cancel.", true);
        return;
      }
      const tool = rebinding;
      const keys = currentToolKeys();
      const old = keys[tool];
      const other = toolForKey(k);
      const next = Object.assign({}, keys, { [tool]: k });
      let msg = `${toolName(tool)} is now ${keyLabel(k)}.`;
      if (other && other !== tool) {
        next[other] = old;
        msg = `${toolName(tool)} is now ${keyLabel(k)}; ${toolName(other)} took ${keyLabel(old)} (swapped).`;
      }
      rebinding = null;
      applyToolKeys(next);
      saveToolKeys();
      renderKeymap(msg);
      document.querySelector(`#keymap [data-rebind="${tool}"]`)?.classList.add("flash");
    },
    true
  );

  $<HTMLInputElement>("#keys-input").onchange = (e) => {
    const inp = e.target as HTMLInputElement;
    const f = inp.files && inp.files[0];
    inp.value = "";
    if (!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      let map: Record<string, string>;
      try {
        map = readKeymap(JSON.parse(String(rd.result)));
      } catch (err) {
        renderKeymap("Could not read that file: " + (err as Error).message, true);
        return;
      }
      const bad = keymapProblem(map);
      if (bad) {
        renderKeymap("Not imported — " + bad, true);
        return;
      }
      rebinding = null;
      applyToolKeys(map);
      saveToolKeys();
      renderKeymap("Shortcuts imported from " + f.name + ".");
    };
    rd.readAsText(f);
  };
}
