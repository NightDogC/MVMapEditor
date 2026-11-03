/* Persistence — IndexedDB, falling back to localStorage (file://, Safari private mode). */
import type { MapDoc } from "../model/types.ts";
import { S } from "./store.ts";
import { $, prefs } from "../util.ts";

export const Store = (function () {
  const DB_NAME = "mvmap";
  const STORE = "maps";
  const LS_KEY = "mvmap:docs";
  let db: IDBDatabase | null = null;
  let mode: "idb" | "ls" = "idb";

  function openDB(): Promise<void> {
    return new Promise((res) => {
      let req: IDBOpenDBRequest;
      try {
        req = indexedDB.open(DB_NAME, 1);
      } catch {
        mode = "ls";
        return res();
      }
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE, { keyPath: "id" });
      };
      req.onsuccess = () => {
        db = req.result;
        mode = "idb";
        res();
      };
      req.onerror = req.onblocked = () => {
        mode = "ls";
        res();
      };
      // Safari/file:// can hang without firing either handler.
      setTimeout(() => {
        if (!db && mode === "idb") {
          mode = "ls";
          res();
        }
      }, 1500);
    });
  }
  const lsAll = (): Record<string, MapDoc> => {
    try {
      return JSON.parse(localStorage.getItem(LS_KEY) || "{}");
    } catch {
      return {};
    }
  };
  const lsWrite = (o: Record<string, MapDoc>) => prefs.set(LS_KEY, JSON.stringify(o));
  function tx(fn: (st: IDBObjectStore | null) => void): Promise<void> {
    return new Promise((res) => {
      if (mode !== "idb" || !db) return res(fn(null));
      try {
        res(fn(db.transaction(STORE, "readwrite").objectStore(STORE)));
      } catch {
        mode = "ls";
        res();
      }
    });
  }
  return {
    get mode() {
      return mode;
    },
    init: openDB,
    put(doc: MapDoc): Promise<void> {
      if (mode === "ls" || !db) {
        const all = lsAll();
        all[doc.id] = doc;
        lsWrite(all);
        return Promise.resolve();
      }
      return tx((st) => {
        if (st) st.put(JSON.parse(JSON.stringify(doc)));
      });
    },
    del(id: string): Promise<void> {
      if (mode === "ls" || !db) {
        const all = lsAll();
        delete all[id];
        lsWrite(all);
        return Promise.resolve();
      }
      return tx((st) => {
        if (st) st.delete(id);
      });
    },
    all(): Promise<MapDoc[]> {
      if (mode === "ls" || !db) return Promise.resolve(Object.values(lsAll()));
      const d = db;
      return new Promise((res) => {
        try {
          const r = d.transaction(STORE, "readonly").objectStore(STORE).getAll();
          r.onsuccess = () => res(r.result || []);
          r.onerror = () => res([]);
        } catch {
          res(Object.values(lsAll()));
        }
      });
    },
  };
})();

let saveTimer: ReturnType<typeof setTimeout> | undefined;
export function scheduleSave(): void {
  setStatus("dirty");
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    S.doc.updated = Date.now();
    await Store.put(S.doc);
    prefs.set("mvmap:last", S.doc.id);
    setStatus("saved");
  }, 600);
}
export function setStatus(kind: "dirty" | "saved"): void {
  const el = $("#save-status");
  if (kind === "dirty") {
    el.textContent = "saving…";
    el.classList.add("dirty");
  } else {
    el.textContent = "saved";
    el.classList.remove("dirty");
  }
}
