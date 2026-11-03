/* Map keyboard: tool shortcuts, Space pans, Alt toggles snapping, selection commands. */
import { S, requestDraw, pushUndo, commit, undo, redo, noteById, stampById } from "../state/store.ts";
import { deleteRoom, deleteDoor, deleteKey, deleteLock } from "../state/rooms.ts";
import { deleteSelPiece, deleteNote, deleteStamp, removeStampPoint } from "../state/layers.ts";
import { reorderSel } from "../state/order.ts";
import { fitWorld } from "../render/view.ts";
import { exportJSON } from "../io/files.ts";
import { modalOpen, closeModal } from "../ui/modals.ts";
import { detailKey, openDetail } from "../ui/detail.ts";
import { renderSnapBar } from "../ui/snapbar.ts";
import { toolForKey } from "./keymap.ts";
import { setTool } from "./tool.ts";

function setAlt(down: boolean): void {
  if (S.altDown === down) return;
  S.altDown = down;
  renderSnapBar();
  requestDraw();
}

function deleteSelection(): void {
  const sel = S.sel;
  if (!sel) return;
  pushUndo();
  if (sel.type === "room") deleteRoom(sel.id);
  else if (sel.type === "door") deleteDoor(sel.id);
  else if (sel.type === "key") deleteKey(sel.id);
  else if (sel.type === "lock") deleteLock(sel.id);
  else if (sel.type === "struct" || sel.type === "edge") deleteSelPiece();
  else if (sel.type === "note") deleteNote(sel.id);
  else if (sel.type === "stamp") {
    // a stamp picked on the map removes just that copy; one picked from the list removes the stamp
    const st = stampById(sel.id);
    const pt = st && sel.pt ? st.points.find((p) => p.x === sel.pt!.x && p.y === sel.pt!.y) : null;
    if (st && pt) {
      removeStampPoint(st, pt);
      S.sel = { type: "stamp", id: st.id };
    } else deleteStamp(sel.id);
  }
  commit();
}

export function bindKeyboard(): void {
  window.addEventListener("keydown", (e) => {
    if (e.key === "Alt") {
      // keep the browser from moving focus to its menu bar when Alt is released
      e.preventDefault();
      setAlt(true);
      return;
    }
    const t = e.target as HTMLElement | null;
    const typing = !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);

    if (e.code === "Space" && !typing) {
      S.spaceDown = true;
      e.preventDefault();
      return;
    }
    if (typing) {
      if (e.key === "Escape") t!.blur();
      return;
    }

    const mod = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    if (mod && k === "z") {
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
      return;
    }
    if (mod && k === "y") {
      e.preventDefault();
      redo();
      return;
    }
    if (mod && k === "s") {
      e.preventDefault();
      exportJSON();
      return;
    }
    if (mod || e.altKey) return;

    if (modalOpen()) {
      if (e.key === "Escape") closeModal();
      return;
    }
    if (S.detailRoomId) return detailKey(e);

    const tk = toolForKey(k);
    if (tk) return setTool(tk);
    if (e.key === "f") return fitWorld();
    if (e.key === "Escape") {
      S.sel = null;
      commit(true);
      return;
    }
    if (e.code === "BracketLeft" || e.code === "BracketRight") {
      const up = e.code === "BracketLeft";
      reorderSel(e.shiftKey ? (up ? "top" : "bottom") : up ? "up" : "down");
      return;
    }
    if (e.key === "Enter" && S.sel && S.sel.type === "room") return openDetail(S.sel.id);
    if (e.key === "Enter" && S.sel && S.sel.type === "note") {
      const n = noteById(S.sel.id);
      if (n) {
        pushUndo();
        n.expanded = !n.expanded;
        commit();
      }
      return;
    }
    if (e.key === "Delete" || e.key === "Backspace") deleteSelection();
  });
  window.addEventListener("keyup", (e) => {
    if (e.code === "Space") S.spaceDown = false;
    if (e.key === "Alt") {
      e.preventDefault();
      setAlt(false);
    }
  });
  // Alt released while the window was in the background never sends keyup
  window.addEventListener("blur", () => setAlt(false));
  window.addEventListener("resize", requestDraw);
}
