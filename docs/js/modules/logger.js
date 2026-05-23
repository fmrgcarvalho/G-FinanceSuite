/* ============================================================
   G-FinanceSuite — Logger partilhado
   ============================================================ */

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
