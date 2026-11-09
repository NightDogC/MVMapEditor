/* Persistence — IndexedDB, falling back to localStorage (file://, Safari private mode).
   2.0 keeps its own library ("mvmap2"), apart from 1.x ("mvmap"), so a 1.x editor on the same origin can never load
   a version-2 map and save it back without its geometry. The first time 2.0 starts it copies the 1.x library over,
   converted; the 1.x data stays as it was. */
import type { MapDoc } from "../model/types.ts";
import { S, migrateDoc } from "./store.ts";
import { $, prefs } from "../util.ts";

export const LAST_KEY = "mvmap2:last";
const V1 = { db: "mvmap", ls: "mvmap:docs", last: "mvmap:last" };
const IMPORTED_KEY = "mvmap2:v1-imported";

/** Every map in the 1.x library (IndexedDB and the localStorage fallback), without creating anything. */
function readV1Library(): Promise<unknown[]> {
  let ls: unknown[] = [];
  try {
    ls = Object.values(JSON.parse(localStorage.getItem(V1.ls) || "{}"));
  } catch {
    /* none */
  }
  return new Promise((res) => {
    let req: IDBOpenDBRequest;
    try {
      req = indexedDB.open(V1.db);
    } catch {
      return res(ls);
    }
    // no 1.x database here: don't leave an empty one behind
    req.onupgradeneeded = () => req.transaction?.abort();
    req.onerror = req.onblocked = () => res(ls);
    req.onsuccess = () => {
      const d = req.result;
      try {
        const r = d.transaction("maps", "readonly").objectStore("maps").getAll();
        r.onsuccess = () => {
          d.close();
          res([...ls, ...(r.result || [])]);
        };
        r.onerror = () => (d.close(), res(ls));
      } catch {
        d.close();
        res(ls);
      }
    };
  });
}

export const Store = (function () {
  const DB_NAME = "mvmap2";
  const STORE = "maps";
  const LS_KEY = "mvmap2:docs";
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
    prefs.set(LAST_KEY, S.doc.id);
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

/** Copy the 1.x library into the 2.0 one, once. Maps already in 2.0 with the same id are left alone. */
export async function importV1Library(): Promise<void> {
  if (prefs.get(IMPORTED_KEY)) return;
  const have = new Set((await Store.all()).map((d) => d.id));
  for (const raw of await readV1Library()) {
    const d = migrateDoc(raw);
    if (!have.has(d.id)) await Store.put(d);
  }
  if (!prefs.get(LAST_KEY)) {
    const last = prefs.get(V1.last);
    if (last) prefs.set(LAST_KEY, last);
  }
  prefs.set(IMPORTED_KEY, "1");
}
