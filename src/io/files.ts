/* Documents: open, import / export JSON, export PNG. */
import type { MapDoc } from "../model/types.ts";
import { newDoc } from "../model/doc.ts";
import { CELL } from "../model/constants.ts";
import { S, undoStack, redoStack, migrateDoc, snapshot, commit } from "../state/store.ts";
import { docBBox } from "../state/layers.ts";
import { makeView, fitWorld } from "../render/view.ts";
import { drawWorld } from "../render/world.ts";
import { closeDetail } from "../ui/detail.ts";
import { renderUI } from "../ui/panels.ts";
import { UE, REGIONS, ELEMENT_TYPES } from "../ue.ts";
import { $, uid, clamp, saveBlob, slug } from "../util.ts";

const ueErrorText = (errs: string[]) => "Region / room number problems (the UE importer will reject these rooms):\n\n• " + errs.join("\n• ");

export function exportJSON(): void {
  const errs = UE.findUeFieldErrors(S.doc, REGIONS);
  if (errs.length && !confirm(ueErrorText(errs) + "\n\nExport anyway?")) return;
  S.doc.updated = Date.now();
  const blob = new Blob([JSON.stringify(UE.buildExportDoc(S.doc, REGIONS, ELEMENT_TYPES), null, 2)], { type: "application/json" });
  saveBlob(blob, slug(S.doc.name) + ".mvmap.json");
}

export function exportPNG(): void {
  const b = docBBox();
  if (!b) {
    alert("Nothing to export yet.");
    return;
  }
  const pad = 1;
  const x0 = Math.floor(b.x0) - pad, y0 = Math.floor(b.y0) - pad;
  const cols = Math.ceil(b.x1) + pad - x0, rows = Math.ceil(b.y1) + pad - y0;
  const scale = clamp(Math.floor(4096 / Math.max(cols, rows)), 8, 48);
  const w = cols * scale, h = rows * scale;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const cx = c.getContext("2d")!;
  const cam = { x: (x0 + cols / 2) * CELL, y: (y0 + rows / 2) * CELL, zoom: scale / CELL };
  drawWorld(cx, makeView(cam, w, h), { cursor: false, bg: "#12151b", labels: S.showLabels });
  c.toBlob((blob) => blob && saveBlob(blob, slug(S.doc.name) + ".png"), "image/png");
}

export function loadDoc(d: unknown): void {
  S.doc = migrateDoc(d);
  S.sel = null;
  S.activeRoomId = null;
  S.activeStructId = null;
  S.activeEdgeId = null;
  S.activeStampId = null;
  S.activeAreaId = S.doc.areas[0].id;
  undoStack.length = 0;
  redoStack.length = 0;
  closeDetail();
  $<HTMLInputElement>("#map-name").value = S.doc.name;
  commit();
  fitWorld();
  const errs = UE.findUeFieldErrors(S.doc, REGIONS);
  // after the map has had a chance to draw, so the user can see what the message is about
  if (errs.length) setTimeout(() => alert(ueErrorText(errs)), 50);
}

export function bindFiles(): void {
  $("#btn-export").onclick = exportJSON;
  $("#btn-png").onclick = exportPNG;
  $("#btn-import").onclick = () => $("#file-input").click();
  $<HTMLInputElement>("#file-input").onchange = (e) => {
    const inp = e.target as HTMLInputElement;
    const f = inp.files && inp.files[0];
    if (!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      try {
        const d: MapDoc = migrateDoc(JSON.parse(String(rd.result)));
        d.id = uid("map"); // import as a new map, never clobber
        // the map you had open becomes the newest undo step, on top of its own history
        const before = snapshot();
        const history = undoStack.slice();
        loadDoc(d);
        undoStack.push(...history, before);
        while (undoStack.length > 120) undoStack.shift();
        renderUI();
      } catch (err) {
        alert("Could not read that file: " + (err as Error).message);
      }
    };
    rd.readAsText(f);
    inp.value = "";
  };
  $("#btn-new").onclick = () => {
    if ((S.doc.rooms.length || S.doc.structures.length || S.doc.edgeStructs.length) && !confirm("Start a new map? The current one stays saved in your library.")) return;
    loadDoc(newDoc());
  };
}
