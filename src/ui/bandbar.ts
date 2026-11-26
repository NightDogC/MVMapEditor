/* Edge tool bar for band edges (spikes…): the thickness new segments get. Shown with the Edge tool while the active
   edge structure is a band edge type; remembered per type for this session (S.bandDraw), starting at the type's
   default. */
import { S, activeEdgeStruct } from "../state/store.ts";
import { bandThickness, drawThicknessOf } from "../state/layers.ts";
import { quantizeThickness } from "../model/doc.ts";
import { UE, vocabOf } from "../ue.ts";
import { $ } from "../util.ts";

export function renderBandBar(): void {
  const bar = $("#band-bar");
  const es = S.tool === "edge" ? activeEdgeStruct() : null;
  const def = es ? bandThickness(es) : null;
  bar.hidden = def == null;
  if (!es || def == null) return;
  const t = UE.elementTypeOf(es, "edge", vocabOf(S.doc));
  $("#bb-title").textContent = `${t ? t.label : es.name} · Edge`;
  const input = $<HTMLInputElement>("#bb-thick");
  if (document.activeElement !== input) input.value = String(drawThicknessOf(es));
  $("#bb-default").textContent = `默认 default ${def}`;
}
export function bindBandBar(): void {
  const input = $<HTMLInputElement>("#bb-thick");
  input.onchange = () => {
    const es = activeEdgeStruct();
    const t = quantizeThickness(+input.value);
    if (es && es.typeId && bandThickness(es) != null && t !== undefined) S.bandDraw[es.typeId] = t;
    input.blur();
    renderBandBar();
  };
}
