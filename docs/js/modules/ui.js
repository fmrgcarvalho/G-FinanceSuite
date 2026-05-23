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
