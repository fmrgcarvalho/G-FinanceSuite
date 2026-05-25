/* ============================================================
   G-FinanceSuite — Logger partilhado
   Escreve cada entrada em IndexedDB (best-effort) para
   persistência entre sessões.
   ============================================================ */

const _DB_NAME  = 'GFinanceAudit';
const _DB_STORE = 'log';
let   _db       = null;

function _openAudit() {
  if (_db) return Promise.resolve(_db);
  return new Promise((res, rej) => {
    const req = indexedDB.open(_DB_NAME, 1);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(_DB_STORE))
        db.createObjectStore(_DB_STORE, { keyPath: 'id', autoIncrement: true });
    };
    req.onsuccess = e => { _db = e.target.result; res(_db); };
    req.onerror   = () => rej(req.error);
  });
}

function _persist(entry) {
  _openAudit()
    .then(db => db.transaction(_DB_STORE, 'readwrite').objectStore(_DB_STORE).add(entry))
    .catch(() => {}); // audit log é best-effort
}

export async function loadAuditLog(limit = 500) {
  try {
    const db = await _openAudit();
    return new Promise((res) => {
      const all = [];
      const req = db.transaction(_DB_STORE, 'readonly')
                    .objectStore(_DB_STORE)
                    .openCursor(null, 'prev'); // mais recente primeiro
      req.onsuccess = e => {
        const c = e.target.result;
        if (c && all.length < limit) { all.push(c.value); c.continue(); }
        else res(all.reverse()); // devolver em ordem cronológica
      };
      req.onerror = () => res([]);
    });
  } catch { return []; }
}

export async function clearAuditLog() {
  try {
    const db = await _openAudit();
    await new Promise((res, rej) => {
      const tx = db.transaction(_DB_STORE, 'readwrite');
      tx.objectStore(_DB_STORE).clear();
      tx.oncomplete = () => res();
      tx.onerror    = () => rej(tx.error);
    });
  } catch {} // fail silently
}

export const Logger = (() => {
  const entries = [];
  let hasError  = false;

  const ts  = () => new Date().toISOString().replace('T',' ').substring(0,23);
  const esc = s  => String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');

  function push(level, msg) {
    const entry = { ts: ts(), level, msg };
    entries.push(entry);
    _persist(entry);
    render(entry);
    updateHeader();
    if (level === 'ERROR') {
      hasError = true;
      document.getElementById('log-dot')?.setAttribute('class', 'log-dot error');
    }
    console[level==='ERROR'?'error':level==='WARN'?'warn':'log'](`[${level}] ${msg}`);
  }

  function render(entry) {
    const body = document.getElementById('log-body');
    if (!body) return;
    const el = document.createElement('div');
    el.className = `log-entry ${entry.level}`;
    el.innerHTML = `<span class="log-ts">${entry.ts.substring(11)}</span><span class="log-msg">${esc(entry.msg)}</span>`;
    body.appendChild(el);
    body.scrollTop = body.scrollHeight;
  }

  function updateHeader() {
    const countEl = document.getElementById('log-count');
    if (countEl) countEl.textContent = `${entries.length} entrada${entries.length!==1?'s':''}`;
    if (!hasError) {
      const dot = document.getElementById('log-dot');
      if (dot) dot.className = entries.length ? 'log-dot' : 'log-dot idle';
    }
  }

  return {
    info     : msg => push('INFO',  msg),
    warn     : msg => push('WARN',  msg),
    error    : msg => push('ERROR', msg),
    separator: lbl => push('INFO',  `---- ${lbl} ----`),
    all      : ()  => entries,
    clear    : ()  => {
      entries.length = 0; hasError = false;
      const body = document.getElementById('log-body');
      if (body) body.innerHTML = '';
      const dot  = document.getElementById('log-dot');
      if (dot)  dot.className  = 'log-dot idle';
      updateHeader();
    },
  };
})();
