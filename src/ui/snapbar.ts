/* Snap step picker under the tool buttons. Alt flips snapping while held; the bar shows the step in effect. */
import { S, requestDraw } from "../state/store.ts";
import { setSnap, snapTicks } from "../state/snap.ts";
import { SNAP_STEPS } from "../geom/lattice.ts";
import { $ } from "../util.ts";

export function renderSnapBar(): void {
  const box = $("#snap-steps");
  if (!box.childElementCount)
    box.innerHTML = SNAP_STEPS.map(
      (s) => `<button class="seg-btn" data-snap="${s.id}" title="${s.id === "free" ? "No snapping" : "Snap to " + s.id + " cell"}">${s.label}</button>`
    ).join("");
  const live = snapTicks();
  box.querySelectorAll<HTMLElement>("[data-snap]").forEach((b) => {
    const step = SNAP_STEPS.find((s) => s.id === b.dataset.snap)!;
    b.classList.toggle("on", b.dataset.snap === S.snap);
    // while Alt is held, outline the step actually in effect
    b.classList.toggle("alt", S.altDown && step.ticks === live && b.dataset.snap !== S.snap);
  });
  $("#snap-alt").hidden = !S.altDown;
}
export function bindSnapBar(): void {
  $("#snap-steps").addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>("[data-snap]");
    if (!b) return;
    setSnap(b.dataset.snap!);
    renderSnapBar();
    requestDraw();
  });
}
