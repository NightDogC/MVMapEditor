import "./styles/app.css";
import { S, app, reindex, migrateDoc } from "./state/store.ts";
import { Store, setStatus, scheduleSave, importV1Library, LAST_KEY } from "./state/persist.ts";
import { loadSnap } from "./state/snap.ts";
import { newDoc, hasStampPointWithoutId } from "./model/doc.ts";
import { resizeCanvas, fitWorld } from "./render/view.ts";
import { worldCanvas, wctx, frame } from "./render/world.ts";
import { docBBox } from "./state/layers.ts";
import { bindPointer } from "./tools/pointer.ts";
import { bindKeyboard } from "./tools/keyboard.ts";
import { loadToolKeys } from "./tools/keymap.ts";
import { setTool } from "./tools/tool.ts";
import { bindPanels, setStampZoom } from "./ui/bind.ts";
import { bindPencilBar, loadPencilPrefs } from "./ui/pencilbar.ts";
import { bindSnapBar } from "./ui/snapbar.ts";
import { bindModals } from "./ui/modals.ts";
import { bindFiles, loadDoc } from "./io/files.ts";
import { renderUI } from "./ui/panels.ts";
import { $, prefs } from "./util.ts";

async function boot(): Promise<void> {
  bindPointer();
  bindKeyboard();
  bindPanels();
  bindPencilBar();
  bindSnapBar();
  bindModals();
  bindFiles();

  await Store.init();
  if (Store.mode !== "idb") $("#file-note").classList.add("show");
  await importV1Library();

  let doc = null;
  const lastId = prefs.get(LAST_KEY);
  if (lastId) doc = (await Store.all()).find((d) => d.id === lastId) || null;

  S.doc = migrateDoc(doc || newDoc());
  // Point ids given on load are random: save them now, or the next reload (and export) would carry other ones.
  if (doc && hasStampPointWithoutId(doc)) scheduleSave();
  S.activeAreaId = S.doc.areas[0].id;
  $<HTMLInputElement>("#map-name").value = S.doc.name;
  const chk = (id: string, v: boolean) => ($<HTMLInputElement>(id).checked = v);
  chk("#chk-flow", S.showFlow);
  chk("#chk-labels", S.showLabels);
  chk("#chk-structs", S.showStructs);
  chk("#chk-slabels", S.showStructLabels);
  chk("#chk-notes", S.showNotes);
  chk("#chk-pencil", S.showPencil);
  chk("#chk-manual", S.highlightManual);
  loadPencilPrefs();
  loadSnap();
  if (prefs.get("mvmap:rclick") === "pan") S.rclick = "pan";
  $<HTMLSelectElement>("#sel-rclick").value = S.rclick;
  const sz = prefs.get("mvmap:stampzoom");
  setStampZoom(sz === null ? 60 : sz, false);
  loadToolKeys();
  setTool("paint");
  reindex();
  renderUI();
  setStatus("saved");

  const [w, h] = resizeCanvas(worldCanvas, wctx);
  app.VW = w;
  app.VH = h;
  if (docBBox()) fitWorld();
  app.needsDraw = true;
  requestAnimationFrame(frame);
}

void boot();

// dev server only: a handle for poking at the editor from the console
if (import.meta.env.DEV) Object.assign(window, { __mv: { S, app, loadDoc, migrateDoc } });
