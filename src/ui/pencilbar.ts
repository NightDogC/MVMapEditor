/* Pencil brush bar (shown with the Pencil / P-Erase tools). */
import { S, requestDraw, pushUndo, commit } from "../state/store.ts";
import { PENCIL_COLORS, PENCIL_SIZE, ERASER_SIZE } from "../model/constants.ts";
import { $, clamp, prefs } from "../util.ts";

const savePencilPrefs = () => prefs.set("mvmap:pencil", JSON.stringify(S.pencil));
export function loadPencilPrefs(): void {
  try {
    const o = JSON.parse(prefs.get("mvmap:pencil") || "null");
    if (o && typeof o === "object") {
      if (/^#[0-9a-f]{6}$/i.test(o.color)) S.pencil.color = o.color;
      if (Number.isFinite(o.size)) S.pencil.size = clamp(Math.round(o.size), PENCIL_SIZE.min, PENCIL_SIZE.max);
      if (Number.isFinite(o.eraser)) S.pencil.eraser = clamp(Math.round(o.eraser), ERASER_SIZE.min, ERASER_SIZE.max);
    }
  } catch {
    /* defaults */
  }
}
export function renderPencilBar(): void {
  const bar = $("#pencil-bar");
  const on = S.tool === "pencil" || S.tool === "perase";
  bar.hidden = !on;
  if (!on) return;
  const erasing = S.tool === "perase";
  const lim = erasing ? ERASER_SIZE : PENCIL_SIZE;
  const val = erasing ? S.pencil.eraser : S.pencil.size;
  $("#pb-title").textContent = erasing ? "Pencil eraser" : "Pencil";
  $("#pb-size-label").textContent = erasing ? "Eraser" : "Size";
  $("#pb-colors").hidden = erasing;
  $("#pb-color").hidden = erasing;
  $("#pb-colors").innerHTML = PENCIL_COLORS.map(
    (c) => `<button class="chip ${c === S.pencil.color ? "on" : ""}" style="background:${c}" data-pcolor="${c}" title="${c}"></button>`
  ).join("");
  $<HTMLInputElement>("#pb-color").value = S.pencil.color;
  const r = $<HTMLInputElement>("#pb-size");
  r.min = String(lim.min);
  r.max = String(lim.max);
  r.value = String(val);
  $("#pb-size-val").textContent = val + " px";
}
export function bindPencilBar(): void {
  $("#pb-colors").addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>("[data-pcolor]");
    if (!b) return;
    S.pencil.color = b.dataset.pcolor!;
    savePencilPrefs();
    renderPencilBar();
    requestDraw();
  });
  $<HTMLInputElement>("#pb-color").oninput = (e) => {
    S.pencil.color = (e.target as HTMLInputElement).value;
    savePencilPrefs();
    $("#pb-colors").querySelectorAll<HTMLElement>(".chip").forEach((c) => c.classList.toggle("on", c.dataset.pcolor === S.pencil.color));
    requestDraw();
  };
  $<HTMLInputElement>("#pb-size").oninput = (e) => {
    const v = +(e.target as HTMLInputElement).value;
    if (S.tool === "perase") S.pencil.eraser = v;
    else S.pencil.size = v;
    $("#pb-size-val").textContent = v + " px";
    savePencilPrefs();
    requestDraw();
  };
  $("#pb-clear").onclick = () => {
    if (!S.doc.pencil.length) return;
    pushUndo();
    S.doc.pencil = [];
    commit();
  };
}
