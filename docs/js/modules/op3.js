/* ============================================================
   G-FinanceSuite — Op3: Reconciliação SAP vs Rentway (RW)
   Módulo completamente isolado de Op1/Op2.
   ============================================================ */

import { AppState } from '../state.js';
import { Logger } from './logger.js';
import { listStoredFiles, loadStoredFile, deleteStoredFile } from './filestore.js';

// ── Constantes ─────────────────────────────────────────────────

const OP3_PAGE_SIZE = 50;

// Estado de navegação (module-level — efémero, não persiste em AppState)
const _nav = {
  list:     'rwNotSap', // 'rwNotSap' | 'sapNotRw' | 'matched'
  page:     1,
};

function resetNav() { _nav.list = 'rwNotSap'; _nav.page = 1; }

// Config das 3 listas
const LIST_CFG = {
  rwNotSap: { label: 'Em RW — não existe em SAP', short: 'Em RW',        color: '#b91c1c', bg: '#fee2e2', type: 'rw'      },
  sapNotRw: { label: 'Em SAP — não existe em RW', short: 'Em SAP',       color: '#92400e', bg: '#fef3c7', type: 'sap'     },
  matched:  { label: 'Reconciliações automáticas', short: 'Reconciliados', color: '#065f46', bg: '#d1fae5', type: 'matched' },
};

// ── Normalização de strings para matching ──────────────────────

const norm = s => (s ?? '').toString().trim().toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '');

// ── Deteção de colunas por padrão ─────────────────────────────

function detectCol(headers, patterns) {
  const normed = headers.map(h => norm(h));
  for (const p of patterns) {
    const i = normed.findIndex(h => p.test(h));
    if (i >= 0) return headers[i];
  }
  return null;
}

const COL_ATRIB    = [/atribu/, /assignment/, /reservation/];
const COL_DOC      = [/numero.?doc|invoice.?num|invoice.?nr|invoice.?id|nº|n[°º]|^documento$|^doc$|^num$/];
const COL_MONTANTE = [/^mont|montante|amount|valor|value/];
const COL_CLIENTE  = [/conta.?cliente|conta.?sap|client|^conta$|account/];
const COL_DATA     = [/^data$|^date$|dat[ae]/];
const COL_EMISSOR  = [/emissor/];
const COL_PAGADOR  = [/pagador/];
const COL_RW       = [/rw.?client|client.?rw|rentway|^rw$/];
const COL_SAP_MAP  = [/sap.?client|client.?s4|^sap$|^s4$/];

// ── Config de campos por tipo de ficheiro ──────────────────────

const FILE_FIELDS = {
  sap: [
    { key: 'atribuicao',    label: 'Atribuição',    required: true  },
    { key: 'documento',     label: 'Documento',     required: false },
    { key: 'montante',      label: 'Montante',      required: false },
    { key: 'conta_cliente', label: 'Conta Cliente', required: false },
    { key: 'data',          label: 'Data',          required: false },
  ],
  rw: [
    { key: 'atribuicao',    label: 'Atribuição',    required: true  },
    { key: 'documento',     label: 'Documento',     required: false },
    { key: 'montante',      label: 'Montante',      required: false },
    { key: 'conta_cliente', label: 'Conta Cliente', required: false },
    { key: 'data',          label: 'Data',          required: false },
  ],
  pagosPor: [
    { key: 'atribuicao',    label: 'Atribuição',    required: true  },
    { key: 'documento',     label: 'Documento',     required: false },
    { key: 'montante',      label: 'Montante',      required: false },
    { key: 'emissor',       label: 'Emissor',       required: false },
    { key: 'pagador',       label: 'Pagador',       required: false },
    { key: 'data',          label: 'Data',          required: false },
  ],
  mapeamento: [
    { key: 'rw_cliente',  label: 'Cliente RW',  required: true  },
    { key: 'sap_cliente', label: 'Cliente SAP', required: true  },
  ],
};

const FIELD_PATTERNS = {
  atribuicao:    COL_ATRIB,
  documento:     COL_DOC,
  montante:      COL_MONTANTE,
  conta_cliente: COL_CLIENTE,
  data:          COL_DATA,
  emissor:       COL_EMISSOR,
  pagador:       COL_PAGADOR,
  rw_cliente:    COL_RW,
  sap_cliente:   COL_SAP_MAP,
};

// ── Leitura de ficheiro ────────────────────────────────────────

function readAsArrayBuffer(file) {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload  = e => res(e.target.result);
    fr.onerror = () => rej(new Error(`Erro ao ler ${file.name}`));
    fr.readAsArrayBuffer(file);
  });
}

function readAsText(file) {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload  = e => res(e.target.result);
    fr.onerror = () => rej(new Error(`Erro ao ler ${file.name}`));
    fr.readAsText(file, 'UTF-8');
  });
}

function parseXlsx(buffer, filename) {
  if (!window.XLSX) throw new Error('SheetJS não está carregado');
  let wb     = window.XLSX.read(buffer, { type: 'array' });
  const ws   = wb.Sheets[wb.SheetNames[0]];
  const rows = window.XLSX.utils.sheet_to_json(ws, { defval: '' });
  wb = null; // libertar workbook — pode ser centenas de MB
  Logger.info(`Op3: ${filename} → ${rows.length} linhas (Excel)`);
  return rows;
}

function parseCsv(text, filename) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (!lines.length) return [];
  const sep     = lines[0].includes(';') ? ';' : ',';
  const headers = lines[0].split(sep).map(h => h.trim().replace(/^"|"$/g, ''));
  const rows    = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = lines[i].split(sep).map(v => v.trim().replace(/^"|"$/g, ''));
    if (vals.every(v => !v)) continue;
    const obj = {};
    headers.forEach((h, j) => { obj[h] = vals[j] ?? ''; });
    rows.push(obj);
  }
  Logger.info(`Op3: ${filename} → ${rows.length} linhas (CSV)`);
  return rows;
}

async function parseFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  if (ext === 'csv') { const text = await readAsText(file); return parseCsv(text, file.name); }
  if (ext === 'xlsx' || ext === 'xls') { const buf = await readAsArrayBuffer(file); return parseXlsx(buf, file.name); }
  throw new Error(`Formato não suportado: ${file.name}`);
}

async function parseHeaders(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  if (ext === 'csv') {
    const text  = await readAsText(file);
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (!lines.length) return [];
    const sep = lines[0].includes(';') ? ';' : ',';
    return lines[0].split(sep).map(h => h.trim().replace(/^"|"$/g, ''));
  }
  if (ext === 'xlsx' || ext === 'xls') {
    const buf = await readAsArrayBuffer(file);
    let wb = window.XLSX.read(buf, { type: 'array', sheetRows: 1 });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = window.XLSX.utils.sheet_to_json(ws, { header: 1 });
    wb = null;
    return (rows[0] || []).map(h => (h ?? '').toString().trim());
  }
  return [];
}

// ── Normalização de registos ───────────────────────────────────

function getVal(row, col) { return col ? (row[col] ?? '') : ''; }

function toNum(v) {
  if (typeof v === 'number') return v;
  const s = (v ?? '').toString().replace(',', '.').replace(/[^\d.-]/g, '');
  return parseFloat(s) || 0;
}

function normalizeSap(rows, filename, mapping) {
  if (!rows.length) return [];
  const cDoc = mapping.documento || null, cAtr = mapping.atribuicao || null;
  const cMon = mapping.montante || null, cCli = mapping.conta_cliente || null, cDat = mapping.data || null;
  Logger.info(`Op3 SAP [${filename}] → doc:${cDoc} atrib:${cAtr} mont:${cMon} cli:${cCli}`);
  const out = [];
  for (const r of rows) {
    const atr = norm(getVal(r, cAtr));
    if (!atr) continue;
    out.push({ documento: getVal(r, cDoc), atribuicao: atr, montante: toNum(getVal(r, cMon)), conta_cliente: norm(getVal(r, cCli)), data: getVal(r, cDat), ficheiro_origem: filename });
  }
  return out;
}

function normalizeRw(rows, filename, mapping) {
  if (!rows.length) return [];
  const cDoc = mapping.documento || null, cAtr = mapping.atribuicao || null;
  const cMon = mapping.montante || null, cCli = mapping.conta_cliente || null, cDat = mapping.data || null;
  Logger.info(`Op3 RW [${filename}] → doc:${cDoc} atrib:${cAtr} mont:${cMon} cli:${cCli}`);
  const out = [];
  for (const r of rows) {
    const atr = norm(getVal(r, cAtr));
    if (!atr) continue;
    out.push({ documento: getVal(r, cDoc), atribuicao: atr, montante: toNum(getVal(r, cMon)), conta_cliente: norm(getVal(r, cCli)), data: getVal(r, cDat), ficheiro_origem: filename });
  }
  return out;
}

function normalizePagosPor(rows, filename, mapping) {
  if (!rows.length) return [];
  const cDoc = mapping.documento || null, cAtr = mapping.atribuicao || null, cMon = mapping.montante || null;
  const cEmi = mapping.emissor || null, cPag = mapping.pagador || null, cDat = mapping.data || null;
  const out = [];
  for (const r of rows) {
    const atr = norm(getVal(r, cAtr));
    if (!atr) continue;
    const emiss = norm(getVal(r, cEmi));
    out.push({ documento: getVal(r, cDoc), atribuicao: atr, montante: toNum(getVal(r, cMon)), emissor: emiss, pagador: norm(getVal(r, cPag)), conta_cliente: emiss, data: getVal(r, cDat), ficheiro_origem: filename });
  }
  return out;
}

function normalizeMapeamento(rows, mapping) {
  if (!rows.length) return {};
  const cRw = mapping.rw_cliente || null, cSap = mapping.sap_cliente || null;
  if (!cRw || !cSap) { Logger.warn('Op3 Mapeamento: colunas rw/sap não mapeadas — matching por atribuição pura'); return {}; }
  const map = {};
  for (const r of rows) { const k = norm(getVal(r, cRw)), v = norm(getVal(r, cSap)); if (k && v) map[k] = v; }
  Logger.info(`Op3 Mapeamento → ${Object.keys(map).length} entradas`);
  return map;
}

// ── Motor de reconciliação (async com yields) ──────────────────

function mapCliente(c, mapeamento) { const k = norm(c); return mapeamento[k] ?? k; }
const YIELD = () => new Promise(r => setTimeout(r, 0));

async function reconcile(rwRecords, sapRecords, mapeamento, isPagosPor = false) {
  const sapIdx = new Map();
  for (let i = 0; i < sapRecords.length; i++) {
    const r = sapRecords[i];
    const key = `${r.conta_cliente}|${r.atribuicao}`;
    if (!sapIdx.has(key)) sapIdx.set(key, r.documento);
    if (i > 0 && i % 10000 === 0) await YIELD();
  }
  const matched = [], somenteRw = [];
  const usedKeys = new Set();
  for (let i = 0; i < rwRecords.length; i++) {
    const rw = rwRecords[i];
    const clienteSap = isPagosPor
      ? (mapCliente(rw.emissor, mapeamento) || mapCliente(rw.pagador, mapeamento))
      : mapCliente(rw.conta_cliente, mapeamento);
    const key = `${clienteSap}|${rw.atribuicao}`;
    if (sapIdx.has(key)) { matched.push({ rw, sapDoc: sapIdx.get(key), key }); usedKeys.add(key); }
    else somenteRw.push(rw);
    if (i > 0 && i % 10000 === 0) await YIELD();
  }
  const somenteSap = sapRecords.filter(r => !usedKeys.has(`${r.conta_cliente}|${r.atribuicao}`));
  return { somenteRw, somenteSap, matched };
}

// ── Utilitários UI ─────────────────────────────────────────────

function escHtml(s) { return (s ?? '').toString().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function fmtEur(v) { return typeof v === 'number' ? v.toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €' : (v ?? '—'); }
function show(id) { const el = document.getElementById(id); if (el) el.style.display = ''; }
function hide(id) { const el = document.getElementById(id); if (el) el.style.display = 'none'; }

// ── Mapeamento de campos ───────────────────────────────────────

const FILE_META_MAP = {
  sap:         { label: 'SAP',          icon: '🏦', fields: () => FILE_FIELDS.sap       },
  rwFaturacao: { label: 'RW Faturação', icon: '🧾', fields: () => FILE_FIELDS.rw        },
  rwRmkt:      { label: 'RW RMKT',      icon: '🔄', fields: () => FILE_FIELDS.rw        },
  rwPagosPor:  { label: 'RW Pagos Por', icon: '💸', fields: () => FILE_FIELDS.pagosPor  },
  mapeamento:  { label: 'Mapeamento',   icon: '🗺️', fields: () => FILE_FIELDS.mapeamento },
};

function renderMappingSection(headersMap) {
  const container = document.getElementById('op3-mapping-section');
  if (!container) return;

  const cards = Object.entries(headersMap).map(([fileKey, headers]) => {
    const meta = FILE_META_MAP[fileKey];
    if (!meta) return '';
    const m = AppState.op3.mappings[fileKey] || {};
    const rowsHtml = meta.fields().map(f => {
      const cur  = m[f.key] || '';
      const star = f.required ? '<span style="color:#dc2626;margin-right:3px">★</span>' : '';
      const opts = `<option value="">— Não mapeado —</option>` +
        headers.map(h => `<option value="${escHtml(h)}"${h === cur ? ' selected' : ''}>${escHtml(h)}</option>`).join('');
      return `<div style="display:grid;grid-template-columns:160px 1fr;align-items:center;gap:10px;padding:5px 0;border-bottom:1px solid #f3f4f6">
        <label style="font-size:12px;color:#374151;font-weight:${f.required ? '600' : '400'}">${star}${f.label}</label>
        <select data-file="${fileKey}" data-field="${f.key}" style="padding:4px 8px;border:1px solid #d1d5db;border-radius:6px;font-size:12px;color:#374151;background:white;width:100%">${opts}</select>
      </div>`;
    }).join('');
    return `<div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:9px;padding:14px">
      <div style="font-size:13px;font-weight:700;color:#1c2526;margin-bottom:10px">${meta.icon} ${meta.label}</div>
      ${rowsHtml}
    </div>`;
  }).join('');

  container.innerHTML = `<div style="background:white;border:1px solid #e5e7eb;border-radius:12px;padding:24px;margin-bottom:20px">
    <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:20px">
      <div>
        <h3 style="font-size:15px;font-weight:700;color:#1c2526;margin:0 0 4px">Mapeamento de Campos</h3>
        <p style="font-size:12px;color:#6b7280;margin:0">Associe as colunas dos seus ficheiros aos campos internos. <span style="color:#dc2626">★</span> são obrigatórios.</p>
      </div>
      <button id="btn-op3-mapping-back" style="padding:7px 14px;background:white;border:1px solid #d1d5db;border-radius:7px;cursor:pointer;font-size:13px;font-weight:600;color:#374151;flex-shrink:0;margin-left:16px">← Voltar</button>
    </div>
    <div style="display:grid;gap:14px">${cards}</div>
    <div id="op3-mapping-warning" style="display:none;margin-top:14px;padding:10px 14px;background:#fef3c7;border:1px solid #fcd34d;border-radius:7px;font-size:12px;color:#92400e"></div>
    <div style="margin-top:20px;text-align:right">
      <button id="btn-op3-confirm-mapping" style="padding:11px 28px;background:#2563eb;color:white;border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;transition:all 0.2s">✓ Confirmar e Analisar</button>
    </div>
  </div>`;

  container.querySelectorAll('select[data-file][data-field]').forEach(sel => {
    sel.addEventListener('change', () => {
      const fk = sel.dataset.file, fld = sel.dataset.field;
      if (!AppState.op3.mappings[fk]) AppState.op3.mappings[fk] = {};
      AppState.op3.mappings[fk][fld] = sel.value;
      validateMappings();
    });
  });

  document.getElementById('btn-op3-mapping-back')?.addEventListener('click', () => {
    hide('op3-mapping-section');
    show('op3-upload-card');
  });
  document.getElementById('btn-op3-confirm-mapping')?.addEventListener('click', runOp3Phase2);

  validateMappings();
}

function validateMappings() {
  const missing = [];
  Object.entries(AppState.op3.mappings).forEach(([fk, m]) => {
    const meta = FILE_META_MAP[fk]; if (!meta) return;
    meta.fields().filter(f => f.required).forEach(f => {
      if (!m[f.key]) missing.push(`${meta.label} → ${f.label}`);
    });
  });
  const warn = document.getElementById('op3-mapping-warning');
  const btn  = document.getElementById('btn-op3-confirm-mapping');
  if (missing.length) {
    if (warn) { warn.style.display = ''; warn.textContent = `Campos obrigatórios em falta: ${missing.join(', ')}`; }
    if (btn)  { btn.disabled = true; btn.style.opacity = '0.5'; btn.style.cursor = 'not-allowed'; }
  } else {
    if (warn) warn.style.display = 'none';
    if (btn)  { btn.disabled = false; btn.style.opacity = '1'; btn.style.cursor = 'pointer'; }
  }
}

// ── Dashboard cards ────────────────────────────────────────────

function renderDashboard() {
  const r = AppState.op3.results;
  let rw = 0, sap = 0, matched = 0;
  ['faturacao', 'rmkt', 'pagosPor'].forEach(t => {
    if (!r[t]) return;
    rw      += r[t].somenteRw.length;
    sap     += r[t].somenteSap.length;
    matched += r[t].matched.length;
  });
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v.toLocaleString('pt-PT'); };
  set('op3-s-rw', rw); set('op3-s-sap', sap); set('op3-s-matched', matched); set('op3-s-div', rw + sap);
}

// ── Sub-tabs de lista ──────────────────────────────────────────

function renderListTabs(r) {
  const container = document.getElementById('op3-list-tabs');
  if (!container) return;
  container.innerHTML = '';
  const counts = r
    ? { rwNotSap: r.somenteRw.length, sapNotRw: r.somenteSap.length, matched: r.matched.length }
    : { rwNotSap: null, sapNotRw: null, matched: null };

  Object.entries(LIST_CFG).forEach(([key, cfg]) => {
    const isActive = key === _nav.list;
    const count    = counts[key];
    const btn      = document.createElement('button');
    btn.style.cssText = [
      'flex:1;padding:11px 12px;border:none;border-bottom:2px solid transparent',
      `background:${isActive ? 'white' : 'transparent'}`,
      `color:${isActive ? cfg.color : '#6b7280'}`,
      `border-bottom-color:${isActive ? cfg.color : 'transparent'}`,
      'cursor:pointer;font-size:12px;font-weight:600;transition:all 0.15s',
      'display:flex;align-items:center;justify-content:center;gap:8px;white-space:nowrap',
    ].join(';');
    const badge = count != null
      ? `<span style="background:${cfg.bg};color:${cfg.color};font-size:11px;font-weight:700;padding:1px 8px;border-radius:9999px;flex-shrink:0">${count.toLocaleString('pt-PT')}</span>`
      : '';
    btn.innerHTML = `<span>${cfg.short}</span>${badge}`;
    btn.title = cfg.label;
    btn.addEventListener('click', () => selectList(key));
    container.appendChild(btn);
  });

  // Actualizar label e handler do botão de exportação
  const exportBtn = document.getElementById('btn-op3-export-active');
  if (exportBtn) {
    const cfg = LIST_CFG[_nav.list];
    exportBtn.textContent = `⬇ CSV — ${cfg.short}`;
    exportBtn.style.borderColor = cfg.color;
    exportBtn.style.color       = cfg.color;
  }
}

// ── Paginação ──────────────────────────────────────────────────

const BTN_ON  = 'padding:6px 14px;border:1px solid #d1d5db;border-radius:6px;background:white;cursor:pointer;font-size:12px;font-weight:600;color:#374151';
const BTN_OFF = 'padding:6px 14px;border:1px solid #e5e7eb;border-radius:6px;background:#f9fafb;font-size:12px;font-weight:600;color:#d1d5db;cursor:default';

function renderPag(records, type) {
  const el = document.getElementById('op3-active-table-pag');
  if (!el) return;
  const total = records.length;
  const totalPages = Math.ceil(total / OP3_PAGE_SIZE) || 1;
  if (totalPages <= 1) { el.innerHTML = ''; return; }
  const page  = _nav.page;
  const start = (page - 1) * OP3_PAGE_SIZE + 1;
  const end   = Math.min(page * OP3_PAGE_SIZE, total);
  el.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 4px;gap:10px">
      <button id="op3-pag-prev" ${page <= 1 ? `disabled style="${BTN_OFF}"` : `style="${BTN_ON}"`}>← Anterior</button>
      <span style="font-size:12px;color:#6b7280">${start.toLocaleString('pt-PT')}–${end.toLocaleString('pt-PT')} de <strong>${total.toLocaleString('pt-PT')}</strong></span>
      <button id="op3-pag-next" ${page >= totalPages ? `disabled style="${BTN_OFF}"` : `style="${BTN_ON}"`}>Seguinte →</button>
    </div>`;
  el.querySelector('#op3-pag-prev')?.addEventListener('click', () => { _nav.page = Math.max(1, page - 1); renderActiveTable(records, type); });
  el.querySelector('#op3-pag-next')?.addEventListener('click', () => { _nav.page = Math.min(totalPages, page + 1); renderActiveTable(records, type); });
}

// ── Headers de tabela ──────────────────────────────────────────

const TH_STD = `<tr style="background:#f8f9fa;border-bottom:2px solid #e5e7eb">
  <th style="padding:9px 10px;text-align:left;font-size:11px;color:#6b7280;font-weight:600">Origem</th>
  <th style="padding:9px 10px;text-align:left;font-size:11px;color:#6b7280;font-weight:600">Documento</th>
  <th style="padding:9px 10px;text-align:left;font-size:11px;color:#6b7280;font-weight:600">Atribuição</th>
  <th style="padding:9px 10px;text-align:right;font-size:11px;color:#6b7280;font-weight:600">Montante</th>
  <th style="padding:9px 10px;text-align:left;font-size:11px;color:#6b7280;font-weight:600">Cliente</th>
  <th style="padding:9px 10px;text-align:left;font-size:11px;color:#6b7280;font-weight:600">Data</th>
</tr>`;

const TH_MATCH = `<tr style="background:#f8f9fa;border-bottom:2px solid #e5e7eb">
  <th style="padding:9px 10px;text-align:left;font-size:11px;color:#6b7280;font-weight:600">Origem RW</th>
  <th style="padding:9px 10px;text-align:left;font-size:11px;color:#6b7280;font-weight:600">Doc RW</th>
  <th style="padding:9px 10px;text-align:left;font-size:11px;color:#6b7280;font-weight:600">Doc SAP</th>
  <th style="padding:9px 10px;text-align:left;font-size:11px;color:#6b7280;font-weight:600">Atribuição</th>
  <th style="padding:9px 10px;text-align:right;font-size:11px;color:#6b7280;font-weight:600">Montante</th>
  <th style="padding:9px 10px;text-align:center;font-size:11px;color:#6b7280;font-weight:600">Estado</th>
</tr>`;

function renderActiveTable(records, type) {
  const table = document.getElementById('op3-active-table');
  if (!table) return;
  const total      = records.length;
  const page       = _nav.page;
  const slice      = records.slice((page - 1) * OP3_PAGE_SIZE, page * OP3_PAGE_SIZE);
  const th         = type === 'matched' ? TH_MATCH : TH_STD;

  if (!total) {
    table.innerHTML = th + '<tr><td colspan="6" style="text-align:center;padding:28px;color:#9ca3af;font-size:13px">Sem registos</td></tr>';
    renderPag(records, type);
    return;
  }

  const rowsHtml = type === 'matched'
    ? slice.map(m => `<tr style="border-bottom:1px solid #f3f4f6">
        <td style="padding:8px 10px;font-size:12px;color:#6b7280">${escHtml(m.rw.ficheiro_origem)}</td>
        <td style="padding:8px 10px;font-size:12px">${escHtml(m.rw.documento)}</td>
        <td style="padding:8px 10px;font-size:12px">${escHtml(m.sapDoc)}</td>
        <td style="padding:8px 10px;font-size:12px;font-weight:600">${escHtml(m.rw.atribuicao)}</td>
        <td style="padding:8px 10px;font-size:12px;text-align:right">${fmtEur(m.rw.montante)}</td>
        <td style="padding:8px 10px;text-align:center"><span style="background:#d1fae5;color:#065f46;padding:2px 8px;border-radius:9999px;font-size:11px;font-weight:600">✓ OK</span></td>
      </tr>`).join('')
    : slice.map(r => `<tr style="border-bottom:1px solid #f3f4f6">
        <td style="padding:8px 10px;font-size:12px;color:#6b7280">${escHtml(r.ficheiro_origem)}</td>
        <td style="padding:8px 10px;font-size:12px">${escHtml(r.documento || r.atribuicao)}</td>
        <td style="padding:8px 10px;font-size:12px;font-weight:600">${escHtml(r.atribuicao)}</td>
        <td style="padding:8px 10px;font-size:12px;text-align:right">${fmtEur(r.montante)}</td>
        <td style="padding:8px 10px;font-size:12px">${escHtml(r.conta_cliente || r.emissor || '')}</td>
        <td style="padding:8px 10px;font-size:12px;color:#6b7280">${escHtml(r.data)}</td>
      </tr>`).join('');

  requestAnimationFrame(() => {
    table.innerHTML = th + rowsHtml;
    renderPag(records, type);
  });
}

// ── Render tab activa ──────────────────────────────────────────

function getActiveRecords(r) {
  if (!r) return { records: [], type: 'rw' };
  const cfg = LIST_CFG[_nav.list];
  const records = _nav.list === 'rwNotSap' ? r.somenteRw
                : _nav.list === 'sapNotRw' ? r.somenteSap
                : r.matched;
  return { records, type: cfg.type };
}

function renderActiveTab() {
  const tab = AppState.op3.activeTab;
  const r   = AppState.op3.results[tab];

  renderListTabs(r);

  const table = document.getElementById('op3-active-table');
  const pagEl = document.getElementById('op3-active-table-pag');
  if (!r) {
    if (table) table.innerHTML = TH_STD + '<tr><td colspan="6" style="text-align:center;padding:28px;color:#9ca3af;font-size:13px">Sem dados para esta análise</td></tr>';
    if (pagEl) pagEl.innerHTML = '';
    return;
  }

  const { records, type } = getActiveRecords(r);
  renderActiveTable(records, type);
}

// ── Selecionar lista (sub-tab) ─────────────────────────────────

function selectList(list) {
  _nav.list = list;
  _nav.page = 1;
  renderActiveTab();
}

// ── Tabs de análise ────────────────────────────────────────────

function updateTabBtns() {
  ['faturacao', 'rmkt', 'pagosPor'].forEach(tab => {
    const btn = document.getElementById(`op3-tab-${tab}`);
    if (!btn) return;
    const hasData = !!AppState.op3.results[tab];
    btn.disabled = !hasData;
    btn.classList.toggle('op3-tab-active', tab === AppState.op3.activeTab);
    btn.style.opacity = hasData ? '1' : '0.4';
  });
}

function selectTab(tab) {
  AppState.op3.activeTab = tab;
  resetNav();
  updateTabBtns();
  renderActiveTab();
}

// ── Badges de ficheiros ────────────────────────────────────────

function updateBadge(id, label) {
  const el = document.getElementById(id);
  if (!el) return;
  const ok = label && label !== 'Nenhum ficheiro';
  el.textContent      = label;
  el.style.color      = ok ? '#065f46' : '#6b7280';
  el.style.background = ok ? '#d1fae5' : '#f3f4f6';
}

function updateRunBtn() {
  const f   = AppState.op3.files;
  const lib = AppState.op3.libFiles;
  const btn = document.getElementById('btn-op3-run');
  if (!btn) return;
  const hasSap = f.sap.length > 0 || lib.sap.length > 0;
  const hasMap = !!f.mapeamento  || !!lib.mapeamento;
  const hasRw  = !!(f.rwFaturacao || lib.rwFaturacao)
              || !!(f.rwRmkt      || lib.rwRmkt)
              || !!(f.rwPagosPor  || lib.rwPagosPor);
  const ok = hasSap && hasMap && hasRw;
  btn.disabled      = !ok;
  btn.style.opacity = ok ? '1' : '0.5';
  btn.style.cursor  = ok ? 'pointer' : 'not-allowed';
}

// ── Executar Op3 — Fase 1: ler cabeçalhos e mostrar mapeamento ─

async function runOp3Phase1() {
  const f   = AppState.op3.files;
  const lib = AppState.op3.libFiles;
  const hasSap = f.sap.length > 0 || lib.sap.length > 0;
  const hasMap = !!f.mapeamento  || !!lib.mapeamento;
  const hasRw  = !!(f.rwFaturacao || lib.rwFaturacao) || !!(f.rwRmkt || lib.rwRmkt) || !!(f.rwPagosPor || lib.rwPagosPor);
  if (!hasSap) { alert('Carrega pelo menos um ficheiro SAP.'); return; }
  if (!hasMap) { alert('Carrega o ficheiro de Mapeamento.'); return; }
  if (!hasRw)  { alert('Carrega pelo menos um ficheiro RW.'); return; }

  const btn = document.getElementById('btn-op3-run');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ A ler colunas...'; }

  // Helper: headers de ficheiro ou de entrada da biblioteca
  const hdrs = async (file, libEntry) =>
    libEntry ? Object.keys(libEntry.records?.[0] || {})
             : (file ? await parseHeaders(file) : null);

  try {
    const headersMap = {};
    headersMap.sap = lib.sap.length
      ? Object.keys(lib.sap[0]?.records?.[0] || {})
      : await parseHeaders(f.sap[0]);
    const hMap  = await hdrs(f.mapeamento,  lib.mapeamento);  if (hMap)  headersMap.mapeamento  = hMap;
    const hFat  = await hdrs(f.rwFaturacao, lib.rwFaturacao); if (hFat)  headersMap.rwFaturacao  = hFat;
    const hRmkt = await hdrs(f.rwRmkt,      lib.rwRmkt);      if (hRmkt) headersMap.rwRmkt       = hRmkt;
    const hPag  = await hdrs(f.rwPagosPor,  lib.rwPagosPor);  if (hPag)  headersMap.rwPagosPor   = hPag;

    const FILE_CFG = {
      sap: FILE_FIELDS.sap, mapeamento: FILE_FIELDS.mapeamento,
      rwFaturacao: FILE_FIELDS.rw, rwRmkt: FILE_FIELDS.rw, rwPagosPor: FILE_FIELDS.pagosPor,
    };
    AppState.op3.mappings = {};
    for (const [fk, headers] of Object.entries(headersMap)) {
      AppState.op3.mappings[fk] = {};
      (FILE_CFG[fk] || []).forEach(fd => {
        AppState.op3.mappings[fk][fd.key] = detectCol(headers, FIELD_PATTERNS[fd.key] || []) || '';
      });
    }

    hide('op3-upload-card');
    show('op3-mapping-section');
    renderMappingSection(headersMap);

  } catch (err) {
    Logger.warn(`Op3 erro ao ler cabeçalhos: ${err.message}`);
    alert(`Erro: ${err.message}`);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '▶ Executar Reconciliação'; updateRunBtn(); }
  }
}

// ── Executar Op3 — Fase 2: análise completa com mapeamento ─────

async function runOp3Phase2() {
  const f   = AppState.op3.files;
  const lib = AppState.op3.libFiles;
  const mps = AppState.op3.mappings;
  const btn = document.getElementById('btn-op3-confirm-mapping');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ A processar...'; }

  // Helper: records da biblioteca (I/O zero) ou do ficheiro
  const getRows = async (file, libEntry) =>
    libEntry ? libEntry.records : parseFile(file);

  try {
    const sapParsed = lib.sap.length
      ? lib.sap.map(e => normalizeSap(e.records, e.name, mps.sap || {}))
      : await Promise.all(f.sap.map(async file => {
          const rows = await parseFile(file);
          const recs = normalizeSap(rows, file.name, mps.sap || {});
          rows.length = 0;
          return recs;
        }));
    const sapRecs = sapParsed.flat();
    Logger.info(`Op3: SAP total → ${sapRecs.length} registos`);

    const mapRows    = await getRows(f.mapeamento, lib.mapeamento);
    const mapeamento = normalizeMapeamento(mapRows, mps.mapeamento || {});

    const results = { faturacao: null, rmkt: null, pagosPor: null };

    if (f.rwFaturacao || lib.rwFaturacao) {
      const rows = await getRows(f.rwFaturacao, lib.rwFaturacao);
      const name = lib.rwFaturacao ? lib.rwFaturacao.name : f.rwFaturacao.name;
      const recs = normalizeRw(rows, name, mps.rwFaturacao || {});
      results.faturacao = await reconcile(recs, sapRecs, mapeamento);
      Logger.info(`Op3 Faturação → RW-only:${results.faturacao.somenteRw.length} SAP-only:${results.faturacao.somenteSap.length} matched:${results.faturacao.matched.length}`);
    }
    if (f.rwRmkt || lib.rwRmkt) {
      const rows = await getRows(f.rwRmkt, lib.rwRmkt);
      const name = lib.rwRmkt ? lib.rwRmkt.name : f.rwRmkt.name;
      const recs = normalizeRw(rows, name, mps.rwRmkt || {});
      results.rmkt = await reconcile(recs, sapRecs, mapeamento);
      Logger.info(`Op3 RMKT → RW-only:${results.rmkt.somenteRw.length} SAP-only:${results.rmkt.somenteSap.length} matched:${results.rmkt.matched.length}`);
    }
    if (f.rwPagosPor || lib.rwPagosPor) {
      const rows = await getRows(f.rwPagosPor, lib.rwPagosPor);
      const name = lib.rwPagosPor ? lib.rwPagosPor.name : f.rwPagosPor.name;
      const recs = normalizePagosPor(rows, name, mps.rwPagosPor || {});
      results.pagosPor = await reconcile(recs, sapRecs, mapeamento, true);
      Logger.info(`Op3 PagosPor → RW-only:${results.pagosPor.somenteRw.length} SAP-only:${results.pagosPor.somenteSap.length} matched:${results.pagosPor.matched.length}`);
    }

    AppState.op3.results = results;
    if (results.faturacao)     AppState.op3.activeTab = 'faturacao';
    else if (results.rmkt)     AppState.op3.activeTab = 'rmkt';
    else if (results.pagosPor) AppState.op3.activeTab = 'pagosPor';

    resetNav();
    hide('op3-mapping-section');
    show('op3-results-section');
    renderDashboard();
    updateTabBtns();
    renderActiveTab();

  } catch (err) {
    Logger.warn(`Op3 erro: ${err.message}`);
    alert(`Erro ao processar: ${err.message}`);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '✓ Confirmar e Analisar'; validateMappings(); }
  }
}

// ── Exportação ─────────────────────────────────────────────────

function exportCsv(records, filename) {
  if (!records.length) { alert('Sem registos para exportar.'); return; }
  const keys   = Object.keys(records[0]).filter(k => k !== 'key');
  const header = keys.join(',');
  const body   = records.map(r => keys.map(k => {
    const v = r[k] ?? '';
    return typeof v === 'object' ? '""' : `"${v.toString().replace(/"/g, '""')}"`;
  }).join(','));
  const blob = new Blob(['﻿' + [header, ...body].join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; a.click();
}

function exportMatchedCsv(matched, filename) {
  if (!matched.length) { alert('Sem registos para exportar.'); return; }
  const keys   = ['ficheiro_origem', 'documento', 'atribuicao', 'montante', 'conta_cliente', 'data', 'doc_sap'];
  const header = keys.join(',');
  const body   = matched.map(m => { const r = { ...m.rw, doc_sap: m.sapDoc }; return keys.map(k => `"${(r[k] ?? '').toString().replace(/"/g, '""')}"`).join(','); });
  const blob = new Blob(['﻿' + [header, ...body].join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; a.click();
}

// ── Picker da biblioteca ───────────────────────────────────────

let _pickerSlot = null; // slot activo no picker

export async function openOp3LibPicker(slot) {
  _pickerSlot = slot;
  const list = document.getElementById('op3-lib-list');
  const confirm = document.getElementById('op3-lib-confirm');
  if (!list || !confirm) return;

  const files = await listStoredFiles();
  if (!files.length) {
    alert('A biblioteca está vazia. Processa primeiro ficheiros na Análise de Dados.');
    return;
  }

  const _renderPickerList = (fileList) => {
    list.innerHTML = fileList.map((f, i) => {
      const date = new Date(f.savedAt).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short', year: '2-digit' });
      const id   = `op3-pick-${i}`;
      return `<div class="fs-item" style="align-items:center">
        <input type="checkbox" class="op3-lib-pick" id="${id}" value="${escHtml(f.name)}" style="width:15px;height:15px;accent-color:#2563eb;flex-shrink:0;cursor:pointer">
        <label for="${id}" style="flex:1;min-width:0;cursor:pointer;margin:0">
          <div class="fs-item-name" title="${escHtml(f.name)}">${escHtml(f.name)}</div>
          <div class="fs-item-meta">${(f.recordCount || 0).toLocaleString('pt-PT')} registos · ${date}</div>
        </label>
        <button class="op3-lib-del" data-name="${escHtml(f.name)}" style="padding:4px 8px;background:none;border:none;cursor:pointer;font-size:14px;color:#9ca3af;flex-shrink:0" title="Remover da biblioteca">🗑</button>
      </div>`;
    }).join('');
    const hasChecked      = list.querySelectorAll('.op3-lib-pick:checked').length > 0;
    confirm.disabled      = !hasChecked;
    confirm.style.opacity = hasChecked ? '1' : '0.5';
    confirm.style.cursor  = hasChecked ? 'pointer' : 'not-allowed';
  };

  _renderPickerList(files);

  list.onchange = () => {
    const hasChecked      = list.querySelectorAll('.op3-lib-pick:checked').length > 0;
    confirm.disabled      = !hasChecked;
    confirm.style.opacity = hasChecked ? '1' : '0.5';
    confirm.style.cursor  = hasChecked ? 'pointer' : 'not-allowed';
  };

  list.onclick = async e => {
    const btn = e.target.closest('.op3-lib-del');
    if (!btn) return;
    await deleteStoredFile(btn.dataset.name);
    document.dispatchEvent(new CustomEvent('filestore:saved'));
    const updated = await listStoredFiles();
    if (!updated.length) {
      closeOp3LibPicker();
    } else {
      _renderPickerList(updated);
    }
  };

  const modal = document.getElementById('op3-lib-modal');
  if (modal) modal.style.display = 'flex';
}

export async function confirmOp3LibPicker() {
  const modal   = document.getElementById('op3-lib-modal');
  const checked = [...document.querySelectorAll('#op3-lib-list .op3-lib-pick:checked')];
  if (!checked.length || !_pickerSlot) { if (modal) modal.style.display = 'none'; return; }

  const entries = (await Promise.all(checked.map(c => loadStoredFile(c.value)))).filter(Boolean);
  if (!entries.length) { alert('Ficheiros não encontrados na biblioteca.'); return; }

  const lib     = AppState.op3.libFiles;
  const badgeId = {
    sap: 'op3-badge-sap', mapeamento: 'op3-badge-mapeamento',
    rwFaturacao: 'op3-badge-faturacao', rwRmkt: 'op3-badge-rmkt', rwPagosPor: 'op3-badge-pagospor',
  }[_pickerSlot];

  const totalRec = entries.reduce((s, e) => s + (e.recordCount || 0), 0);

  if (_pickerSlot === 'sap') {
    lib.sap = entries;
  } else {
    const merged = entries.flatMap(e => e.records || []);
    lib[_pickerSlot] = { name: entries.map(e => e.name).join(', '), records: merged, recordCount: merged.length };
  }

  const label = entries.length === 1
    ? `📂 ${entries[0].name} (${totalRec.toLocaleString('pt-PT')} reg.)`
    : `📂 ${entries.length} ficheiros (${totalRec.toLocaleString('pt-PT')} reg.)`;
  updateBadge(badgeId, label);
  _showClearBtn(_pickerSlot, true);
  updateRunBtn();
  if (modal) modal.style.display = 'none';
  Logger.info(`Op3 biblioteca: ${_pickerSlot} → ${entries.map(e => e.name).join(', ')}`);
}

export function closeOp3LibPicker() {
  const modal = document.getElementById('op3-lib-modal');
  if (modal) modal.style.display = 'none';
}

function _showClearBtn(slot, visible) {
  const btn = document.querySelector(`.btn-op3-clear[data-slot="${slot}"]`);
  if (btn) btn.style.display = visible ? '' : 'none';
}

export function clearOp3Slot(slot) {
  const inputId = {
    sap: 'op3-input-sap', mapeamento: 'op3-input-mapeamento',
    rwFaturacao: 'op3-input-faturacao', rwRmkt: 'op3-input-rmkt', rwPagosPor: 'op3-input-pagospor',
  }[slot];
  const badgeId = {
    sap: 'op3-badge-sap', mapeamento: 'op3-badge-mapeamento',
    rwFaturacao: 'op3-badge-faturacao', rwRmkt: 'op3-badge-rmkt', rwPagosPor: 'op3-badge-pagospor',
  }[slot];

  if (slot === 'sap') { AppState.op3.files.sap = []; AppState.op3.libFiles.sap = []; }
  else                { AppState.op3.files[slot] = null; AppState.op3.libFiles[slot] = null; }

  const inp = document.getElementById(inputId);
  if (inp) inp.value = '';

  updateBadge(badgeId, 'Nenhum ficheiro');
  _showClearBtn(slot, false);
  updateRunBtn();
}

// ── Inicialização de eventos ────────────────────────────────────

export function initOp3Events() {

  document.getElementById('op3-input-sap')?.addEventListener('change', e => {
    AppState.op3.files.sap = Array.from(e.target.files);
    const n = AppState.op3.files.sap.length;
    updateBadge('op3-badge-sap', n ? `${n} ficheiro${n > 1 ? 's' : ''} selecionado${n > 1 ? 's' : ''}` : 'Nenhum ficheiro');
    _showClearBtn('sap', n > 0);
    updateRunBtn();
  });
  document.getElementById('op3-input-mapeamento')?.addEventListener('change', e => {
    AppState.op3.files.mapeamento = e.target.files[0] || null;
    updateBadge('op3-badge-mapeamento', AppState.op3.files.mapeamento?.name || 'Nenhum ficheiro');
    _showClearBtn('mapeamento', !!AppState.op3.files.mapeamento);
    updateRunBtn();
  });
  document.getElementById('op3-input-faturacao')?.addEventListener('change', e => {
    AppState.op3.files.rwFaturacao = e.target.files[0] || null;
    updateBadge('op3-badge-faturacao', AppState.op3.files.rwFaturacao?.name || 'Nenhum ficheiro');
    _showClearBtn('rwFaturacao', !!AppState.op3.files.rwFaturacao);
    updateRunBtn();
  });
  document.getElementById('op3-input-rmkt')?.addEventListener('change', e => {
    AppState.op3.files.rwRmkt = e.target.files[0] || null;
    updateBadge('op3-badge-rmkt', AppState.op3.files.rwRmkt?.name || 'Nenhum ficheiro');
    _showClearBtn('rwRmkt', !!AppState.op3.files.rwRmkt);
    updateRunBtn();
  });
  document.getElementById('op3-input-pagospor')?.addEventListener('change', e => {
    AppState.op3.files.rwPagosPor = e.target.files[0] || null;
    updateBadge('op3-badge-pagospor', AppState.op3.files.rwPagosPor?.name || 'Nenhum ficheiro');
    _showClearBtn('rwPagosPor', !!AppState.op3.files.rwPagosPor);
    updateRunBtn();
  });

  document.getElementById('btn-op3-run')?.addEventListener('click', runOp3Phase1);

  document.getElementById('op3-tab-faturacao')?.addEventListener('click', () => selectTab('faturacao'));
  document.getElementById('op3-tab-rmkt')?.addEventListener('click',      () => selectTab('rmkt'));
  document.getElementById('op3-tab-pagosPor')?.addEventListener('click',  () => selectTab('pagosPor'));

  document.getElementById('btn-op3-export-active')?.addEventListener('click', () => {
    const r = AppState.op3.results[AppState.op3.activeTab];
    if (!r) return;
    const tab = AppState.op3.activeTab;
    if (_nav.list === 'rwNotSap') exportCsv(r.somenteRw,  `op3_rw_nao_sap_${tab}.csv`);
    if (_nav.list === 'sapNotRw') exportCsv(r.somenteSap, `op3_sap_nao_rw_${tab}.csv`);
    if (_nav.list === 'matched')  exportMatchedCsv(r.matched, `op3_reconciliados_${tab}.csv`);
  });

  document.getElementById('btn-op3-back')?.addEventListener('click', () => {
    hide('op3-section');
    show('mode-section');
    AppState.op3.results  = { faturacao: null, rmkt: null, pagosPor: null };
    AppState.op3.mappings = {};
    hide('op3-results-section');
    hide('op3-mapping-section');
    show('op3-upload-card');
    resetNav();
  });

  Logger.info('Op3 inicializado');
}
