/* ============================================================
   G-FinanceSuite — Módulo UI
   Funções genéricas de manipulação DOM, formatação e utilitários.
   Sem dependências de outros módulos.
   ============================================================ */

// ── IDs DOM necessários ────────────────────────────────────────
export const REQUIRED_IDS = [
  'prog-fill', 'prog-label', 'prog-sub',
];

// ── Visibilidade ───────────────────────────────────────────────
export function show(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = 'block';
}

export function hide(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = 'none';
}

// ── Barra de progresso ─────────────────────────────────────────
export function setProgress(pct, label, sub) {
  document.getElementById('prog-fill').style.width  = pct + '%';
  document.getElementById('prog-label').textContent = label;
  document.getElementById('prog-sub').textContent   = sub || '';
}

// ── Cards de resumo ────────────────────────────────────────────
export function setSummaryCards(defs) {
  const clsMap = {
    total: 'sum-card total',
    dups:  'sum-card dups',
    clean: 'sum-card clean',
    info:  'sum-card info',
    warn:  'sum-card warn',
  };
  defs.forEach(d => {
    const valEl = document.getElementById(d.id);
    if (!valEl) return;
    valEl.textContent = d.val;
    const card = valEl.closest('.sum-card');
    if (card) {
      card.className = clsMap[d.cls] || 'sum-card total';
      const labelEl = card.querySelector('.sl');
      if (labelEl) labelEl.textContent = d.label;
    }
  });
}

// ── Formatação ─────────────────────────────────────────────────
export function fmt(n) {
  if (n == null) return '—';
  return new Intl.NumberFormat('pt-PT', {
    style: 'currency', currency: 'EUR',
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(n);
}

export function fmtN(n) {
  return new Intl.NumberFormat('pt-PT').format(n);
}

export function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Focus trap para modais ─────────────────────────────────────
export function trapFocus(el) {
  const sel = 'button:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';
  el._trapHandler = e => {
    if (e.key !== 'Tab') return;
    const nodes = [...el.querySelectorAll(sel)].filter(n => n.offsetParent !== null);
    if (!nodes.length) return;
    const first = nodes[0], last = nodes[nodes.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };
  el.addEventListener('keydown', el._trapHandler);
}

export function releaseFocus(el) {
  if (el._trapHandler) el.removeEventListener('keydown', el._trapHandler);
}

// ── Navegação por teclado em tabelas ──────────────────────────
export function setupTableKeyNav(el) {
  if (!el) return;
  const sel = el.tagName === 'TBODY' ? 'tr' : 'tbody tr';
  el.querySelectorAll(sel).forEach(tr => { tr.tabIndex = 0; });
  el.removeEventListener('keydown', el._keyNavHandler);
  el._keyNavHandler = e => {
    const rows = [...el.querySelectorAll(`${sel}[tabindex="0"]`)];
    const idx  = rows.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); rows[Math.min(idx + 1, rows.length - 1)]?.focus(); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); rows[Math.max(idx - 1, 0)]?.focus(); }
    if (e.key === 'Enter' && idx >= 0) { e.preventDefault(); document.activeElement.click(); }
  };
  el.addEventListener('keydown', el._keyNavHandler);
}

// ── Detecção de tipo de campo ──────────────────────────────────
// Usada no mapeamento Excel para sugerir o tipo de cada coluna
export function guessFieldType(fieldName, sampleVal) {
  if (_isLikelyDate(fieldName, sampleVal))    return '📅 data';
  if (_isLikelyNumeric(fieldName, sampleVal)) return '🔢 numérico';
  if (sampleVal == null)                       return '— vazio';
  return '📝 texto';
}

// helpers internos (não exportados — usados apenas pelo guessFieldType)
function _isLikelyDate(field, val) {
  const dateFieldNames = ['data', 'date', 'dt', 'datum'];
  const f = String(field || '').toLowerCase();
  if (dateFieldNames.some(k => f.includes(k))) return true;
  if (val instanceof Date) return true;
  if (typeof val === 'number' && val > 40000 && val < 60000) return true;
  if (typeof val === 'string') {
    return /^\d{4}-\d{2}-\d{2}/.test(val) ||
           /^\d{2}[\/\-.]\d{2}[\/\-.]\d{4}/.test(val);
  }
  return false;
}

function _isLikelyNumeric(field, val) {
  const numFieldNames = ['montante', 'amount', 'valor', 'saldo', 'total', 'preco', 'price', 'importe'];
  const f = String(field || '').toLowerCase();
  if (numFieldNames.some(k => f.includes(k))) return true;
  if (typeof val === 'number') return true;
  if (typeof val === 'string' && val.trim() !== '') {
    const cleaned = val.replace(/[€$£\s.,]/g, '').replace(',', '.');
    return !isNaN(Number(cleaned)) && cleaned !== '';
  }
  return false;
}

// ── Classificação de valor individual (para deteção de anomalias) ──
// Retorna: 'empty' | 'numeric' | 'date' | 'text'
export function classifyValue(v) {
  if (v == null || v === '' || v === '—' || v === '-') return 'empty';
  if (typeof v === 'number') return 'numeric';
  const s = String(v).trim();
  if (s === '') return 'empty';
  // numeric: remove currency symbols, spaces, thousands sep; try parseFloat
  const cleaned = s.replace(/[€$£\s]/g, '').replace(/\.(?=\d{3})/g, '').replace(',', '.');
  if (cleaned !== '' && !isNaN(parseFloat(cleaned)) && isFinite(Number(cleaned))) return 'numeric';
  // date: ISO YYYY-MM-DD or DD/MM/YYYY or DD-MM-YYYY patterns
  if (/^\d{4}-\d{2}-\d{2}(T.*)?$/.test(s)) return 'date';
  if (/^\d{2}[\/\-\.]\d{2}[\/\-\.]\d{4}$/.test(s)) return 'date';
  return 'text';
}
