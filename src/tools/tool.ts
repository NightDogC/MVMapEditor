import { S, requestDraw, type Tool } from "../state/store.ts";
import { renderPencilBar } from "../ui/pencilbar.ts";
import { renderSnapBar } from "../ui/snapbar.ts";
import { $ } from "../util.ts";

const SNAP = "<kbd>Alt</kbd> toggles snapping";
export const HINTS: Record<Tool, string> = {
  select: `Click to select · drag to move · <kbd>Del</kbd> removes · ${SNAP}`,
  paint: "Drag to paint cells into the active room · <kbd>Ctrl</kbd> erases · <kbd>Shift</kbd> starts a new room",
  rect: "Drag a rectangle to fill cells into the active room · <kbd>Ctrl</kbd> clears the rectangle",
  erase: "Drag over cells to remove them from their room",
  door: "Click a cell edge to place a door · click an existing door to edit it · <kbd>Ctrl</kbd>-click removes",
  key: `Click to drop a key marker · <kbd>Ctrl</kbd>-click removes · ${SNAP}`,
  pan: "Drag to pan · scroll to zoom · <kbd>F</kbd> zooms to fit",
  spaint: `Drag to paint the active structure · <kbd>Ctrl</kbd> erases · <kbd>Shift</kbd> starts a new structure · ${SNAP}`,
  srect: `Drag a rectangle to fill the active structure · <kbd>Ctrl</kbd> clears it · <kbd>Shift</kbd> starts a new structure · ${SNAP}`,
  serase: `Drag to remove structure area and cut edge structures — rooms stay untouched · ${SNAP}`,
  pencil: "Draw freely, off the grid — sketches and annotations only, not part of any room or structure · <kbd>Ctrl</kbd> erases",
  perase: "Drag to erase pencil strokes only — rooms, structures and everything else stay untouched",
  note: `Click to add a note · drag a note to move it · its <kbd>+</kbd> button expands it · <kbd>Ctrl</kbd>-click removes · ${SNAP}`,
  stamp: `Click to drop the active stamp · drag a stamp to move it · <kbd>Ctrl</kbd>-click removes · <kbd>Shift</kbd> starts a new stamp · ${SNAP}`,
  edge: `Drag a segment, any angle · <kbd>Shift</kbd> while dragging locks 45° · <kbd>Shift</kbd> at the start begins a new one · <kbd>Ctrl</kbd> erases · ${SNAP}`,
};

/** Show a short message in the hint bar, then put the tool's hint back. */
let flashTimer: ReturnType<typeof setTimeout> | undefined;
export function flashHint(html: string): void {
  const el = $("#hint");
  el.innerHTML = html;
  el.classList.add("flash");
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => {
    el.classList.remove("flash");
    el.innerHTML = HINTS[S.tool] || "";
  }, 1800);
}

export function setTool(t: Tool): void {
  S.tool = t;
  document.querySelectorAll<HTMLElement>("#tools .tool").forEach((b) => b.classList.toggle("on", b.dataset.tool === t));
  $("#hint").innerHTML = HINTS[t] || "";
  $("#world").style.cursor = t === "pan" ? "grab" : t === "select" ? "default" : "crosshair";
  renderPencilBar();
  renderSnapBar();
  requestDraw();
}
