/* Typing a note's details straight into its open box: double-click the box to edit, click anywhere else (or Esc) to
   finish. A textarea is laid over the box's body and follows it while the map pans or zooms; the canvas leaves the body
   text out meanwhile. The whole edit is one undo step. */
import { S, requestDraw, commit, recordUndo, snapshot, noteById } from "../state/store.ts";
import { scheduleSave } from "../state/persist.ts";
import { noteGeom } from "../render/notes.ts";
import { wctx, worldView } from "../render/world.ts";
import { $ } from "../util.ts";

const ta = $<HTMLTextAreaElement>("#note-edit");
/** the document before the edit, and the note's text then, to record one undo step if it changed */
let before: { doc: string; text: string } | null = null;

export function startNoteEdit(id: string): void {
  const n = noteById(id);
  if (!n || !n.expanded || S.editingNoteId === id) return;
  finishNoteEdit();
  before = { doc: snapshot(), text: n.text };
  S.editingNoteId = id;
  S.sel = { type: "note", id };
  ta.value = n.text;
  ta.hidden = false;
  commit(true);
  positionNoteEditor();
  ta.focus();
  ta.setSelectionRange(ta.value.length, ta.value.length);
}

export function finishNoteEdit(): void {
  if (!S.editingNoteId) return;
  const n = noteById(S.editingNoteId);
  S.editingNoteId = null;
  ta.hidden = true;
  if (document.activeElement === ta) ta.blur();
  const changed = !!before && !!n && n.text !== before.text;
  if (changed) recordUndo(before!.doc);
  before = null;
  commit(!changed);
}

/** Keep the editor over its note's box; called after every map redraw. Ends the edit when the box is gone. */
export function positionNoteEditor(): void {
  if (!S.editingNoteId) return;
  const n = noteById(S.editingNoteId);
  const box = n && n.expanded && S.showNotes ? noteGeom(wctx, worldView(), n).box : null;
  if (!box) return finishNoteEdit();
  ta.style.left = box.x + 1 + "px";
  ta.style.top = box.y + box.headH + "px";
  ta.style.width = box.w - 2 + "px";
  // the box grows with the text on the next redraw; never let the editor be shorter than what's typed
  ta.style.height = "0px";
  ta.style.height = Math.max(box.h - box.headH - 1, ta.scrollHeight) + "px";
}

export function bindNoteEdit(): void {
  ta.addEventListener("input", () => {
    const n = noteById(S.editingNoteId);
    if (!n) return;
    n.text = ta.value;
    const field = document.querySelector<HTMLTextAreaElement>("#i-ntext");
    if (field) field.value = n.text;
    requestDraw();
    scheduleSave();
  });
  ta.addEventListener("blur", () => finishNoteEdit());
  // keep map shortcuts (tool keys, Delete, Ctrl+C…) away from the text; Esc still ends the edit
  ta.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Escape") finishNoteEdit();
  });
}
