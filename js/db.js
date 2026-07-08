// IndexedDB — camada de persistência (eventos, gastos, imagens, settings)
const DB_NAME = 'gastos-viagem';
const DB_VERSION = 1;

let _db = null;

export function openDB() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('eventos')) {
        db.createObjectStore('eventos', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('gastos')) {
        const s = db.createObjectStore('gastos', { keyPath: 'id' });
        s.createIndex('eventoId', 'eventoId');
        s.createIndex('data', 'data');
      }
      if (!db.objectStoreNames.contains('imagens')) {
        db.createObjectStore('imagens', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }
    };
    req.onsuccess = () => { _db = req.result; resolve(_db); };
    req.onerror = () => reject(req.error);
  });
}

function tx(store, mode, fn) {
  return openDB().then(db => new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    const out = fn(s);
    t.oncomplete = () => resolve(out && 'result' in out ? out.result : undefined);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}

function reqToPromise(store, mode, fn) {
  return openDB().then(db => new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const req = fn(t.objectStore(store));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
}

export const put = (store, value) => tx(store, 'readwrite', s => s.put(value));
export const del = (store, key) => tx(store, 'readwrite', s => s.delete(key));
export const clear = (store) => tx(store, 'readwrite', s => s.clear());
export const get = (store, key) => reqToPromise(store, 'readonly', s => s.get(key));
export const getAll = (store) => reqToPromise(store, 'readonly', s => s.getAll());
export const getAllByIndex = (store, index, value) =>
  reqToPromise(store, 'readonly', s => s.index(index).getAll(value));

// settings (chave/valor)
export async function getSetting(key, fallback = null) {
  const row = await get('settings', key);
  return row ? row.value : fallback;
}
export const setSetting = (key, value) => put('settings', { key, value });

export async function putMany(store, values) {
  if (!values.length) return;
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, 'readwrite');
    const s = t.objectStore(store);
    values.forEach(v => s.put(v));
    t.oncomplete = resolve;
    t.onerror = () => reject(t.error);
  });
}
