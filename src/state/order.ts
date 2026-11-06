/* List order is array order, which is also draw order: later entries paint over earlier ones. */
import { S, pushUndo, commit, type Sel } from "./store.ts";
import { clamp } from "../util.ts";

interface Ordered {
  id: string;
  areaId?: string;
  hideName?: boolean;
}

/** The array a selection lives in, plus its peers (rooms only reorder within their area). */
export function orderScope(sel: Sel | null) {
  if (!sel) return null;
  const t = sel.type;
  const arr: Ordered[] | null =
    t === "room" ? S.doc.rooms : t === "struct" ? S.doc.structures : t === "edge" ? S.doc.edgeStructs :
    t === "stamp" ? S.doc.stamps : t === "lock" ? S.doc.locks : t === "key" ? S.doc.keys : null;
  if (!arr) return null;
  const item = arr.find((x) => x.id === sel.id);
  if (!item) return null;
  const peers = t === "room" ? arr.filter((x) => x.areaId === item.areaId) : arr;
  return { arr, item, peers, pos: peers.indexOf(item) };
}

/** Move the selection within its list: "top" | "up" | "down" | "bottom". */
export function reorderSel(how: string): boolean {
  const sc = orderScope(S.sel);
  if (!sc || sc.peers.length < 2) return false;
  const { arr, item, peers, pos } = sc;
  let to = how === "top" ? 0 : how === "bottom" ? peers.length - 1 : pos + (how === "up" ? -1 : 1);
  to = clamp(to, 0, peers.length - 1);
  if (to === pos) return false;
  pushUndo();
  const target = peers[to];
  arr.splice(arr.indexOf(item), 1);
  const ti = arr.indexOf(target);
  arr.splice(to > pos ? ti + 1 : ti, 0, item);
  commit();
  return true;
}
