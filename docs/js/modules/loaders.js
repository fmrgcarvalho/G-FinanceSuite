/* ============================================================
   G-FinanceSuite — Loaders e utilitários de parsing
   Extraído de import.js para respeitar o limite de 800 linhas.
   ============================================================ */

import { AppState } from '../state.js';
import { Logger } from './logger.js';

export const YIELD = () => new Promise(r => setTimeout(r, 0));

// ── CSV melhorado: suporte a ; e campos entre aspas ───────────

export function parseCsv(text, filename) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (!lines.length) return [];
  const sep     = lines[0].includes(';') ? ';' : ',';
  const headers = lines[0].split(sep).map(h => h.trim().replace(/^"|"$/g, ''));
  const data    = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = lines[i].split(sep).map(v => v.trim().replace(/^"|"$/g, ''));
    if (vals.every(v => !v)) continue;
    const row = {};
    headers.forEach((h, j) => { row[h] = vals[j] ?? ''; });
    data.push(row);
  }
  if (filename) Logger.info(`CSV: ${filename} → ${data.length.toLocaleString('pt-PT')} linhas`);
  return data;
}

// ── Loader assíncrono para CSV/JSON (processamento paralelo) ───

export async function loadFileAsync(queueItem) {
  const { file } = queueItem;
  queueItem.status = 'processing'; queueItem.progress = 5;
  try {
    const text = await new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload  = e => res(e.target.result);
      fr.onerror = () => rej(new Error(`Erro ao ler ${file.name}`));
      fr.readAsText(file, 'utf-8');
    });

    let records;
    if (/\.csv$/i.test(file.name)) {
      const lines = text.split(/\r?\n/).filter(l => l.trim());
      if (lines.length < 2) throw new Error('Nenhum registo encontrado.');
      const sep     = lines[0].includes(';') ? ';' : ',';
      const headers = lines[0].split(sep).map(h => h.trim().replace(/^"|"$/g, ''));
      records = [];
      for (let i = 1; i < lines.length; i++) {
        const vals = lines[i].split(sep).map(v => v.trim().replace(/^"|"$/g, ''));
        if (vals.every(v => !v)) continue;
        const row = {};
        headers.forEach((h, j) => { row[h] = vals[j] ?? ''; });
        row.ficheiro_origem = file.name;
        records.push(row);
        if (records.length % 5000 === 0) await YIELD();
      }
      Logger.info(`✓ CSV: ${records.length.toLocaleString('pt-PT')} registos`);
    } else {
      const obj  = JSON.parse(text);
      const data = obj.registos || obj.data || obj.records || (Array.isArray(obj) ? obj : []);
      if (!data.length) throw new Error('Nenhum registo encontrado.');
      data.forEach(row => { row.ficheiro_origem = file.name; });
      records = data;
      Logger.info(`✓ JSON: ${records.length.toLocaleString('pt-PT')} registos`);
    }

    AppState.fileDataMap[file.name] = { records, mapping: {} };
    AppState.consolidatedFiles.push(file.name);
    queueItem.status   = 'success';
    queueItem.progress = 100;
  } catch (err) {
    Logger.error(`${file.name}: ${err.message}`);
    queueItem.status = 'error';
    queueItem.error  = err.message.substring(0, 100);
  }
}

// ── Tipos e datas ──────────────────────────────────────────────

export function isLikelyNumeric(fieldName, sampleVal) {
  if (/montante|valor|amount|importe|saldo|price|preco|total|quantidade|qty|custo|cost/i.test(fieldName)) return true;
  if (typeof sampleVal === 'number' && !isLikelyDate(fieldName, sampleVal)) return true;
  return false;
}

export function isLikelyDate(fieldName, sampleVal) {
  if (sampleVal instanceof Date) return true;
  if (/data|date|datum|dt_/i.test(fieldName)) return true;
  // NOTE: number-range heuristic (32874–73051) intentionally removed.
  // With cellDates:true, Excel date cells arrive as Date objects (caught above).
  // The range heuristic caused false positives for numeric codes like SAP Atribuição.
  if (typeof sampleVal === 'string') {
    const s = sampleVal.trim();
    if (/^\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{4}$/.test(s)) return true;
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return true;
  }
  return false;
}

export function parseExcelDate(val) {
  if (val == null || val === '') return null;
  if (val instanceof Date) return isNaN(val) ? null : val.toISOString().split('T')[0];
  if (typeof val === 'number') {
    if (val <= 0 || val > 200000) return null;
    const d = new Date((val - 25569) * 86400000);
    return isNaN(d) ? null : d.toISOString().split('T')[0];
  }
  const s = String(val).trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0, 10);
  const pt = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (pt) return `${pt[3]}-${pt[2].padStart(2,'0')}-${pt[1].padStart(2,'0')}`;
  const dot = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (dot) return `${dot[3]}-${dot[2].padStart(2,'0')}-${dot[1].padStart(2,'0')}`;
  return s;
}

export function buildRecord(row, mapping, srcFile) {
  const rec = {};
  Object.values(mapping).forEach(f => { rec[f] = null; });
  rec.ficheiro_origem = srcFile;
  Object.entries(mapping).forEach(([colIdx, field]) => {
    let val = row[parseInt(colIdx)];
    if (val === null || val === undefined || val === '') { rec[field] = null; return; }
    // Date objects come from cellDates:true — always convert directly, no heuristic needed
    if (val instanceof Date) { rec[field] = isNaN(val) ? null : val.toISOString().split('T')[0]; return; }
    // Field-name wins over value heuristic: a field named "montante" is NEVER a date
    // even if its value (e.g. 50000) falls in the Excel date serial range.
    const _numByName = /montante|valor|amount|importe|saldo|price|preco|total|quantidade|qty|custo|cost/i.test(field);
    const _datByName = /data|date|datum|dt_/i.test(field);
    if (_numByName && !_datByName)        rec[field] = typeof val === 'number' ? val : parseFloat(String(val).replace(/\s/g,'').replace(',','.')) || null;
    else if (isLikelyDate(field, val))    rec[field] = parseExcelDate(val);
    else if (isLikelyNumeric(field, val)) rec[field] = typeof val === 'number' ? val : parseFloat(String(val).replace(/\s/g,'').replace(',','.')) || null;
    else                                  rec[field] = String(val).trim() || null;
  });
  return rec;
}

// ── Aliases & Normalização ─────────────────────────────────────

export const COLUMN_ALIASES = {
  'numero documento':'numero_documento', 'n documento':'numero_documento',
  'nr documento':'numero_documento',     'no documento':'numero_documento',
  'num documento':'numero_documento',    'documento':'numero_documento',
  'ndoc':'numero_documento',             'nr doc':'numero_documento',
  'no doc':'numero_documento',           'n doc':'numero_documento',
  'num doc':'numero_documento',          'doc':'numero_documento',
  'tipo documento':'tipo_documento',  'tipo de documento':'tipo_documento',
  'tipo doc':'tipo_documento',        'tp':'tipo_documento', 'tipo':'tipo_documento',
  'data documento':'data_documento',  'data do documento':'data_documento',
  'data doc':'data_documento',        'dt documento':'data_documento', 'dt doc':'data_documento',
  'montante':'montante', 'montante em moeda interna':'montante', 'montante em moeda intern':'montante',
  'montante ml':'montante', 'montante em moeda do documento':'montante', 'montante moeda doc':'montante',
  'montante doc':'montante', 'valor':'montante', 'importe':'montante', 'amount':'montante',
  'moeda':'moeda', 'moeda do documento':'moeda', 'moeda do doc':'moeda', 'moeda doc':'moeda', 'currency':'moeda',
  'texto':'texto', 'text':'texto', 'descricao':'texto', 'descricao movimento':'texto', 'descr':'texto',
  'atribuicao':'atribuicao', 'atrib':'atribuicao', 'assignment':'atribuicao', 'zuordnung':'atribuicao',
  'conta':'conta', 'conta do razao':'conta', 'conta razao':'conta', 'account':'conta', 'konto':'conta',
  'referencia':'referencia', 'referencia do documento':'referencia', 'ref':'referencia', 'reference':'referencia', 'referenz':'referencia',
  'data compensacao':'data_compensacao', 'data de compensacao':'data_compensacao',
  'data comp':'data_compensacao', 'dt compensacao':'data_compensacao', 'clearing date':'data_compensacao',
  'data pagamento':'data_pagamento', 'data de pagamento':'data_pagamento',
  'data de vencimento':'data_pagamento', 'vencimento':'data_pagamento',
  'data pag':'data_pagamento', 'dt vencimento':'data_pagamento', 'due date':'data_pagamento',
  'data entrada':'data_entrada', 'data de entrada':'data_entrada',
  'data de lancamento':'data_entrada', 'data lancamento':'data_entrada',
  'data lanc':'data_entrada', 'dt entrada':'data_entrada', 'posting date':'data_entrada', 'entry date':'data_entrada',
};

export function normalizeHeader(h) {
  if (h == null) return '';
  return String(h).toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function suggestField(header) {
  const norm = normalizeHeader(header);
  if (COLUMN_ALIASES[norm]) return COLUMN_ALIASES[norm];
  return norm.replace(/\s+/g, '_') || null;
}

export function guessFieldTypeLocal(fieldName, sampleVal) {
  if (isLikelyDate(fieldName, sampleVal))    return '📅 data';
  if (isLikelyNumeric(fieldName, sampleVal)) return '🔢 numérico';
  if (sampleVal == null)                      return '— vazio';
  return '📝 texto';
}
