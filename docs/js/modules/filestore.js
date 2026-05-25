/* ============================================================
   G-FinanceSuite — Persistência de ficheiros (IndexedDB)
   Guarda registos já parseados para reutilização entre sessões.
   ============================================================ */

const DB_NAME    = 'GFinanceDB';
const DB_VERSION = 1;
const STORE      = 'files';
let   _db        = null;

function _open() {
  if (_db) return Promise.resolve(_db);
  return new Promise((res, rej) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE))
        db.createObjectStore(STORE, { keyPath: 'name' });
    };
    req.onsuccess = e => { _db = e.target.result; res(_db); };
    req.onerror   = () => rej(req.error);
  });
}

async function _store(mode = 'readonly') {
  return (await _open()).transaction(STORE, mode).objectStore(STORE);
}

function _req(r) {
  return new Promise((res, rej) => {
    r.onsuccess = () => res(r.result);
    r.onerror   = () => rej(r.error);
  });
}

// ── API pública ───────────────────────────────────────────────

export async function initFileStore() {
  try { await _open(); return true; }
  catch (e) { console.warn('[filestore] IndexedDB indisponível:', e); return false; }
}

const MAX_FILES = 15;

// Upsert + LRU: guarda/actualiza e remove os mais antigos se > MAX_FILES.
// Usa uma única transacção para garantir atomicidade (sem await entre ops IDB).
export function saveFileToStore(name, records, columns, size, mapping = {}) {
  return new Promise(async (res, rej) => {
    const db = await _open();
    const tx = db.transaction(STORE, 'readwrite');
    const s  = tx.objectStore(STORE);
    s.put({ name, size, savedAt: new Date().toISOString(), recordCount: records.length, columns, records, mapping });
    const req = s.getAll();
    req.onsuccess = () => {
      const all = req.result;
      if (all.length > MAX_FILES) {
        all.sort((a, b) => a.savedAt.localeCompare(b.savedAt));
        all.slice(0, all.length - MAX_FILES).forEach(old => s.delete(old.name));
      }
    };
    tx.oncomplete = () => res();
    tx.onerror    = () => rej(tx.error);
  });
}

// Devolve só metadados (sem records) — rápido, para listar
export async function listStoredFiles() {
  const all = await _req((await _store()).getAll());
  return all.map(({ name, size, savedAt, recordCount, columns }) =>
    ({ name, size, savedAt, recordCount, columns })
  );
}

// Carrega ficheiro completo (com records)
export async function loadStoredFile(name) {
  return _req((await _store()).get(name));
}

export async function deleteStoredFile(name) {
  return _req((await _store('readwrite')).delete(name));
}

export async function clearAllStoredFiles() {
  return _req((await _store('readwrite')).clear());
}

export function fmtBytes(bytes = 0) {
  if (bytes < 1024)    return `${bytes} B`;
  if (bytes < 1048576) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}
