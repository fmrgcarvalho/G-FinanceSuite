/* ============================================================
   G-FinanceSuite — Op3 Engine: funções puras de parsing e
   reconciliação SAP vs Rentway (sem dependências de DOM).
   ============================================================ */

import { Logger } from './logger.js';

// ── Normalização de strings ────────────────────────────────────

export const norm = s => (s ?? '').toString().trim().toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '');

// ── Deteção de colunas por padrão ─────────────────────────────

export function detectCol(headers, patterns) {
  const normed = headers.map(h => norm(h));
  for (const p of patterns) {
    const i = normed.findIndex(h => p.test(h));
    if (i >= 0) return headers[i];
  }
  return null;
}

export const COL_ATRIB    = [/atribu/, /assignment/, /reservation/];
export const COL_DOC      = [/numero.?doc|invoice.?num|invoice.?nr|invoice.?id|nº|n[°º]|^documento$|^doc$|^num$/];
export const COL_MONTANTE = [/^mont|montante|amount|valor|value/];
export const COL_CLIENTE  = [/conta.?cliente|conta.?sap|client|^conta$|account/];
export const COL_DATA     = [/^data$|^date$|dat[ae]/];
export const COL_EMISSOR  = [/emissor/];
export const COL_PAGADOR  = [/pagador/];
export const COL_RW       = [/rw.?client|client.?rw|rentway|^rw$/];
export const COL_SAP_MAP  = [/sap.?client|client.?s4|^sap$|^s4$/];

// ── Config de campos por tipo de ficheiro ──────────────────────

export const FILE_FIELDS = {
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

export const FIELD_PATTERNS = {
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

export function readAsArrayBuffer(file) {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload  = e => res(e.target.result);
    fr.onerror = () => rej(new Error(`Erro ao ler ${file.name}`));
    fr.readAsArrayBuffer(file);
  });
}

export function readAsText(file) {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload  = e => res(e.target.result);
    fr.onerror = () => rej(new Error(`Erro ao ler ${file.name}`));
    fr.readAsText(file, 'UTF-8');
  });
}

export function parseXlsx(buffer, filename) {
  if (!window.XLSX) throw new Error('SheetJS não está carregado');
  let wb     = window.XLSX.read(buffer, { type: 'array' });
  const ws   = wb.Sheets[wb.SheetNames[0]];
  const rows = window.XLSX.utils.sheet_to_json(ws, { defval: '' });
  wb = null;
  Logger.info(`Op3: ${filename} → ${rows.length} linhas (Excel)`);
  return rows;
}

export function parseCsv(text, filename) {
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

export async function parseFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  if (ext === 'csv') { const text = await readAsText(file); return parseCsv(text, file.name); }
  if (ext === 'xlsx' || ext === 'xls') { const buf = await readAsArrayBuffer(file); return parseXlsx(buf, file.name); }
  throw new Error(`Formato não suportado: ${file.name}`);
}

export async function parseHeaders(file) {
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

export function normalizeSap(rows, filename, mapping) {
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

export function normalizeRw(rows, filename, mapping) {
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

export function normalizePagosPor(rows, filename, mapping) {
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

export function normalizeMapeamento(rows, mapping) {
  if (!rows.length) return {};
  const cRw = mapping.rw_cliente || null, cSap = mapping.sap_cliente || null;
  if (!cRw || !cSap) { Logger.warn('Op3 Mapeamento: colunas rw/sap não mapeadas — matching por atribuição pura'); return {}; }
  const map = {};
  for (const r of rows) { const k = norm(getVal(r, cRw)), v = norm(getVal(r, cSap)); if (k && v) map[k] = v; }
  Logger.info(`Op3 Mapeamento → ${Object.keys(map).length} entradas`);
  return map;
}

// ── Motor de reconciliação ─────────────────────────────────────

function mapCliente(c, mapeamento) { const k = norm(c); return mapeamento[k] ?? k; }
const YIELD = () => new Promise(r => setTimeout(r, 0));

export async function reconcile(rwRecords, sapRecords, mapeamento, isPagosPor = false) {
  const sapIdx = new Map();
  for (let i = 0; i < sapRecords.length; i++) {
    const r   = sapRecords[i];
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
