/* ============================================================
   G-FinanceSuite — Módulo Importação
   Drag&drop, fila de ficheiros, carregamento, mapeamento Excel.
   Utilitários de parsing em loaders.js.
   ============================================================ */

import { AppState } from '../state.js';
import { show, hide, setProgress, fmtN, escHtml } from './ui.js';
import { Logger } from './logger.js';
import {
  YIELD, parseCsv, loadFileAsync,
  isLikelyNumeric, isLikelyDate, parseExcelDate,
  buildRecord, COLUMN_ALIASES, normalizeHeader, suggestField, guessFieldTypeLocal,
} from './loaders.js';
import { saveFileToStore } from './filestore.js';

// Re-exportar para app.js (que importa isLikelyNumeric daqui)
export { isLikelyNumeric } from './loaders.js';

// ── IDs DOM necessários ────────────────────────────────────────
export const REQUIRED_IDS = [
  'import-section', 'file-input',
  'files-queue', 'files-queue-list',
  'mapping-section', 'map-table-wrap', 'map-summary',
  'progress-section', 'prog-fill', 'prog-label', 'prog-sub',
];

let _onConsolidationComplete = null;

export function initImport(callbacks = {}) {
  _onConsolidationComplete = callbacks.onConsolidationComplete || null;
  _setupDropZone();
  _setupFileInput();
  _setupQueueDelegation();
  _setupMappingDelegation();
}

function _setupQueueDelegation() {
  const list = document.getElementById('files-queue-list');
  if (!list) return;
  list.addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const idx = btn.dataset.idx !== undefined ? +btn.dataset.idx : null;
    switch (btn.dataset.action) {
      case 'start-processing': startProcessing(); break;
      case 'process-file':     if (idx !== null) processSingleFile(idx); break;
      case 'remove-file':      if (idx !== null) removeFileFromQueue(idx); break;
      case 'start-analysis':   startAnalysis(); break;
    }
  });
}

function _setupMappingDelegation() {
  const wrap = document.getElementById('map-table-wrap');
  if (!wrap) return;
  wrap.addEventListener('change', e => {
    const cb = e.target.closest('[data-ignore-idx]');
    if (cb && e.target.type === 'checkbox') toggleIgnore(+cb.dataset.ignoreIdx, e.target);
  });
  wrap.addEventListener('input', e => {
    const inp = e.target.closest('.map-input');
    if (inp) onMapInputChange(inp);
  });
}

// ── Validação de tipos ─────────────────────────────────────────
export function isExcel(name) { return /\.(xlsx|xls)$/i.test(name); }
export function isCSV(name)   { return /\.csv$/i.test(name); }
export function isJSON(name)  { return /\.json$/i.test(name); }

export function isValidFile(file) {
  if (!isExcel(file.name) && !isCSV(file.name) && !isJSON(file.name)) {
    Logger.warn(`Ficheiro ${file.name} não suportado — ignorado.`);
    return false;
  }
  const maxSize = 500 * 1024 * 1024;
  if (file.size > maxSize) {
    Logger.warn(`Ficheiro ${file.name} é muito grande (${(file.size/1024/1024).toFixed(0)}MB) — ignorado.`);
    return false;
  }
  return true;
}

// ── Gestão de fila ─────────────────────────────────────────────
export function addFilesToQueue(files) {
  if (!files || files.length === 0) return;
  let validCount = 0;
  for (const file of files) {
    if (isValidFile(file)) {
      AppState.fileQueue.push({ file, data: null, status: 'pending', mapping: null, progress: 0, error: null });
      validCount++;
    }
  }
  updateQueueUI();
  if (validCount === 0)
    alert('⚠️ Nenhum ficheiro válido.\n\nFormatos: .xlsx, .xls, .csv, .json\nTamanho máximo: 500MB');
}

export function removeFileFromQueue(index) {
  if (index < 0 || index >= AppState.fileQueue.length) return;
  const item = AppState.fileQueue[index];
  const name = item.file ? item.file.name : item.name;
  AppState.fileQueue.splice(index, 1);
  if (AppState.fileDataMap[name]) delete AppState.fileDataMap[name];
  Logger.info(`Ficheiro removido: ${name}`);
  const fi = document.getElementById('file-input');
  if (fi) fi.value = '';
  updateQueueUI();
}

export function clearQueue() {
  AppState.fileQueue        = [];
  AppState.consolidatedFiles = [];
  AppState.mappings          = {};
  updateQueueUI();
  const fi = document.getElementById('file-input');
  if (fi) fi.value = '';
}

// ── UI da fila — throttled com requestAnimationFrame ──────────

let _queueRafPending = false;

export function updateQueueUI() {
  if (_queueRafPending) return;
  _queueRafPending = true;
  requestAnimationFrame(() => { _queueRafPending = false; _renderQueueUI(); });
}

function _renderQueueUI() {
  const queueEl = document.getElementById('files-queue');
  const listEl  = document.getElementById('files-queue-list');
  if (!queueEl || !listEl) { console.warn('⚠️ Elementos de fila não encontrados'); return; }

  if (AppState.fileQueue.length === 0) { queueEl.style.display = 'none'; return; }
  queueEl.style.display = 'block';

  try {
    const hasPending  = AppState.fileQueue.some(f => f.status === 'pending');
    const processoBtn = AppState.fileQueue.length > 1 && hasPending ? `
      <div style="margin-bottom:16px;display:flex;gap:10px;">
        <button class="btn-run" data-action="start-processing" style="flex:1;padding:12px;font-size:13px">
          ▶️ Processar todos (${AppState.fileQueue.length} ficheiro${AppState.fileQueue.length !== 1 ? 's' : ''})
        </button>
      </div>` : '';

    listEl.innerHTML = processoBtn + AppState.fileQueue.map((item, i) => {
      const isProcessing = item.status === 'processing';
      const isSuccess    = item.status === 'success';
      const isError      = item.status === 'error';
      const statusIcon   = { pending: '⏳', processing: '⚙️', mapping: '🔄', success: '✅', error: '❌' }[item.status] || '⏳';
      const itemData     = AppState.fileDataMap[item.file.name];
      const statusText   = item.status === 'pending'    ? 'Pendente'
                         : item.status === 'processing' ? 'A processar...'
                         : item.status === 'mapping'    ? 'A mapear colunas...'
                         : item.status === 'success'    ? `${itemData?.records?.length || 0} registos`
                         : item.error || 'Erro';
      const progressPct  = item.progress || 0;
      const btnDisabled  = isProcessing || isSuccess;
      return `
        <div class="queue-item ${isSuccess ? 'success' : isError ? 'error' : ''}">
          <div class="queue-item-icon">${isProcessing ? '<div class="queue-item-spinner"></div>' : statusIcon}</div>
          <div class="queue-item-content">
            <div class="queue-item-name">
              <span>${item.file.name}</span>
              <span style="font-size:11px;color:var(--muted);font-weight:normal">(${(item.file.size/1024/1024).toFixed(1)}MB)</span>
            </div>
            <div class="queue-item-status ${isProcessing ? 'processing' : isSuccess ? 'success' : isError ? 'error' : ''}">
              ${statusIcon} ${statusText}
            </div>
            ${isProcessing ? `<div class="queue-item-progress"><div class="queue-item-progress-bar" style="width:${progressPct}%"></div></div>` : ''}
          </div>
          <div style="display:flex;gap:8px;align-items:center">
            <button class="queue-item-analyze-btn ${isProcessing ? 'processing' : isSuccess ? 'success' : isError ? 'error' : ''}"
              data-action="process-file" data-idx="${i}" ${btnDisabled || isError ? 'disabled' : ''}
              title="${isSuccess ? 'Ficheiro processado' : isError ? 'Ficheiro com erro' : 'Processar este ficheiro'}"
              style="display:flex;align-items:center;justify-content:center;gap:6px;min-height:36px">
              ${isProcessing ? `<div class="queue-item-spinner" style="width:14px;height:14px;border-width:1.5px"></div><span>Processando</span>` : isSuccess ? '✅ Pronto' : isError ? '❌ Erro' : '▶️ Processar'}
            </button>
            <button class="queue-item-remove-btn" data-action="remove-file" data-idx="${i}"
              ${isProcessing ? 'disabled' : ''} title="Remover ficheiro"
              style="padding:8px 12px;background:#fff3cd;border:1px solid #ffc107;border-radius:6px;cursor:pointer;font-weight:600;color:#856404;font-size:14px;min-height:36px;transition:all 0.2s">
              🗑️ Remover
            </button>
          </div>
        </div>`;
    }).join('');

    const successCount = AppState.fileQueue.filter(f => f.status === 'success').length;
    if (successCount > 0) {
      listEl.innerHTML += `
        <div style="margin-top:20px;display:flex;gap:10px;justify-content:center;">
          <button class="btn-run" data-action="start-analysis" style="flex:1;max-width:600px">
            ✓ Analisar e Consolidar (${successCount} ficheiro${successCount !== 1 ? 's' : ''} pronto${successCount !== 1 ? 's' : ''})
          </button>
        </div>`;
    }
  } catch (err) {
    console.error('❌ Erro ao renderizar fila:', err);
    listEl.innerHTML = '<p style="color:red">Erro ao mostrar fila.</p>';
  }
}

export function updateFileProgress(queueItem, percent, status = null) {
  queueItem.progress = Math.min(100, Math.max(0, percent));
  if (status) queueItem.status = status;
  updateQueueUI();
}

function setFileError(queueItem, errorMsg) {
  queueItem.status = 'error';
  queueItem.error  = errorMsg;
  updateQueueUI();
}

// ── Processamento — ficheiro único (botão "Processar" individual) ─

export function processSingleFile(queueIndex) {
  const item = AppState.fileQueue[queueIndex];
  if (!item) return;
  if (item.status === 'success') { alert('Este ficheiro já foi processado.'); return; }

  Logger.separator(`PROCESSAMENTO - ${item.file.name}`);
  item.status   = 'processing';
  item.progress = 5;
  AppState.isSequentialProcessing = false;
  updateQueueUI();

  setTimeout(() => {
    if (isExcel(item.file.name))     loadExcelFromQueue(item);
    else if (isCSV(item.file.name))  loadCSVFromQueue(item);
    else if (isJSON(item.file.name)) loadJSONFromQueue(item);
  }, 100);
}

// ── Processamento — "Processar todos" (paralelo CSV/JSON + série Excel) ─

export async function startProcessing() {
  if (AppState.fileQueue.length === 0) { alert('Adiciona pelo menos um ficheiro.'); return; }
  AppState.processingQueue        = true;
  AppState.isSequentialProcessing = true;
  AppState.consolidatedFiles      = [];
  AppState.rawData                = [];
  Logger.separator(`Processamento de ${AppState.fileQueue.length} ficheiro(s)`);
  show('progress-section');

  const textItems  = AppState.fileQueue.filter(i => isCSV(i.file.name) || isJSON(i.file.name));
  const excelItems = AppState.fileQueue.filter(i => isExcel(i.file.name));

  // Paralelo: CSV + JSON em simultâneo
  if (textItems.length) {
    setProgress(5, `A processar ${textItems.length} ficheiro(s) CSV/JSON em paralelo…`, '');
    await Promise.all(textItems.map(item => loadFileAsync(item)));
    updateQueueUI();
    Logger.info(`CSV/JSON concluídos: ${textItems.filter(i => i.status === 'success').length}/${textItems.length}`);
  }

  // Série: Excel (seguro em memória — um de cada vez)
  for (let idx = 0; idx < excelItems.length; idx++) {
    const item = excelItems[idx];
    const base = textItems.length ? 40 : 5;
    setProgress(base + Math.round((idx / excelItems.length) * (90 - base)),
      `Excel ${idx + 1}/${excelItems.length}: ${item.file.name}`, '');
    await _loadExcelAsync(item);
    updateQueueUI();
  }

  await finalizeConsolidation();
}

// Mantido para compatibilidade com loadCSVFromQueue / loadJSONFromQueue (processSingleFile)
export function processNextFile() {
  const pending = AppState.fileQueue.find(f => f.status === 'pending');
  if (!pending) { finalizeConsolidation(); return; }

  updateFileProgress(pending, 5, 'processing');
  const idx      = AppState.fileQueue.indexOf(pending);
  const progress = Math.round((idx / AppState.fileQueue.length) * 90) + 5;
  setProgress(progress, `A processar ficheiro ${idx + 1}/${AppState.fileQueue.length}`, pending.file.name);
  Logger.info(`Ficheiro ${idx + 1}/${AppState.fileQueue.length}: ${pending.file.name}`);

  setTimeout(() => {
    if (isExcel(pending.file.name))     loadExcelFromQueue(pending);
    else if (isCSV(pending.file.name))  loadCSVFromQueue(pending);
    else if (isJSON(pending.file.name)) loadJSONFromQueue(pending);
  }, 50);
}

// Helper interno: carrega um Excel como Promise (para startProcessing)
async function _loadExcelAsync(item) {
  item.status = 'processing'; item.progress = 5;
  updateQueueUI();
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload  = async e => { await processExcelFromQueueMainThread(e.target.result, item); resolve(); };
    reader.onerror = () => { item.status = 'error'; item.error = 'Erro ao ler ficheiro'; updateQueueUI(); resolve(); };
    reader.readAsArrayBuffer(item.file);
  });
}

// ── Análise e consolidação ─────────────────────────────────────

export function startAnalysis() {
  const successFiles = AppState.fileQueue.filter(f => f.status === 'success');
  if (successFiles.length === 0) { alert('Nenhum ficheiro foi processado com sucesso.'); return; }

  Logger.separator(`Consolidação de ${successFiles.length} ficheiro(s) processado(s)`);
  AppState.consolidatedFiles = [];
  AppState.rawData           = [];
  AppState.mappings          = {};

  try {
    for (const file of successFiles) {
      const itemData = AppState.fileDataMap[file.file.name];
      if (itemData?.records?.length > 0) {
        AppState.consolidatedFiles.push({ name: file.file.name, records: itemData.records, fields: itemData.fields || [] });
        AppState.rawData = AppState.rawData.length === 0 ? [...itemData.records] : AppState.rawData.concat(itemData.records);
        Logger.info(`✓ ${file.file.name}: ${itemData.records.length} registos consolidados`);
      }
    }
    if (AppState.rawData.length === 0) { alert('Nenhum dado para consolidar.'); Logger.error('Consolidação: sem dados'); return; }
    Logger.info(`Consolidação completa: ${AppState.rawData.length} registos totais`);
    const allFields = new Set();
    AppState.consolidatedFiles.forEach(f => { if (f.fields) f.fields.forEach(k => allFields.add(k)); });
    AppState.modelFields = Array.from(allFields);
    AppState.fileName = `${successFiles.length} ficheiro${successFiles.length !== 1 ? 's' : ''} consolidado${successFiles.length !== 1 ? 's' : ''}`;
    Logger.info('✓ Consolidação pronta!');
    if (_onConsolidationComplete) _onConsolidationComplete();
  } catch (err) {
    Logger.error(`Consolidação falhou: ${err.message}`);
    alert('Erro ao consolidar ficheiros. Abre a consola (F12) para detalhes.');
  }
}

export async function finalizeConsolidation() {
  const successCount = AppState.fileQueue.filter(f => f.status === 'success').length;
  const failCount    = AppState.fileQueue.filter(f => f.status === 'error').length;
  const totalCount   = AppState.fileQueue.length;

  // flat() em vez de concat() em loop — evita cópias O(n²)
  const chunks = [];
  AppState.fileQueue.forEach(item => {
    if (item.status === 'success') {
      const itemData = AppState.fileDataMap[item.file.name];
      if (itemData?.records) chunks.push(itemData.records);
    }
  });
  let newData = chunks.flat();

  const prevData  = window._previousConsolidatedData;
  const hasPrev   = Array.isArray(prevData) && prevData.length > 0;
  const prevCount = hasPrev ? prevData.length : 0;

  Logger.separator('RESUMO DO PROCESSAMENTO');
  Logger.info(`Ficheiros: ${totalCount} | ✓ ${successCount}${failCount ? ` | ⚠️ ${failCount}` : ''}`);
  if (hasPrev) Logger.info(`Anteriores: ${prevCount.toLocaleString('pt-PT')} | Novos: ${newData.length.toLocaleString('pt-PT')}`);

  if (newData.length === 0) {
    if (hasPrev) {
      Logger.warn('Sem registos novos — a manter dados anteriores.');
      AppState.rawData = [...prevData];
      return;
    }
    Logger.error('Nenhum ficheiro foi processado com sucesso.');
    alert(failCount === totalCount
      ? '❌ Erro Fatal: Nenhum ficheiro conseguiu ser processado.'
      : '⚠️ Os ficheiros foram lidos mas sem registos.');
    return;
  }

  AppState.rawData = hasPrev ? [...prevData, ...newData] : newData;
  newData = []; // libertar referência

  // Normalização de campos — async com yield a cada 10k registos
  const allKeys = [...new Set(AppState.rawData.flatMap(r => Object.keys(r)))];
  for (let i = 0; i < AppState.rawData.length; i++) {
    const r = AppState.rawData[i];
    allKeys.forEach(k => { if (!(k in r)) r[k] = null; });
    if (i > 0 && i % 10000 === 0) await YIELD();
  }

  AppState.fileName = hasPrev
    ? `${AppState.rawData.length.toLocaleString('pt-PT')} registos mesclados`
    : AppState.consolidatedFiles.length === 1
      ? AppState.consolidatedFiles[0]
      : `${AppState.consolidatedFiles.length} ficheiros consolidados`;

  Logger.separator('CONSOLIDAÇÃO CONCLUÍDA');
  Logger.info(`Total: ${AppState.rawData.length.toLocaleString('pt-PT')} registos | Campos: ${allKeys.length}`);

  window._previousConsolidatedData  = null;
  window._previousConsolidatedCount = 0;

  // Auto-save para IndexedDB — upsert por nome de ficheiro
  for (const item of AppState.fileQueue) {
    if (item.status !== 'success') continue;
    const fd = AppState.fileDataMap[item.file.name];
    if (!fd?.records?.length) continue;
    // IDB desativado — para reativar:
    // const cols = Object.keys(fd.records[0] || {}).filter(k => k !== 'ficheiro_origem');
    // try {
    //   await saveFileToStore(item.file.name, fd.records, cols, item.file.size || 0, fd.mapping || {});
    //   Logger.info(`💾 Guardado: ${item.file.name}`);
    // } catch (e) {
    //   Logger.warn(`Biblioteca: não foi possível guardar ${item.file.name} — ${e.message}`);
    // }
  }
  // document.dispatchEvent(new CustomEvent('filestore:saved'));

  setProgress(100, 'Pronto!', `${AppState.rawData.length.toLocaleString('pt-PT')} registos consolidados`);
  setTimeout(() => { hide('progress-section'); updateQueueUI(); }, 500);
}

// ── Loaders legacy (processSingleFile) ────────────────────────

export function loadJSONFromQueue(queueItem) {
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const obj  = JSON.parse(e.target.result);
      const data = obj.registos || obj.data || obj.records || (Array.isArray(obj) ? obj : []);
      if (!data.length) throw new Error('Nenhum registo encontrado.');
      data.forEach(row => { row.ficheiro_origem = queueItem.file.name; });
      AppState.fileDataMap[queueItem.file.name] = { records: data, mapping: {} };
      queueItem.status = 'success';
      AppState.consolidatedFiles.push(queueItem.file.name);
      Logger.info(`✓ JSON: ${data.length.toLocaleString('pt-PT')} registos`);
    } catch (err) {
      queueItem.status = 'error';
      Logger.error(`JSON ${queueItem.file.name}: ${err.message}`);
    }
    updateQueueUI();
    if (AppState.isSequentialProcessing) processNextFile(); else _scheduleLogClose();
  };
  reader.onerror = () => {
    queueItem.status = 'error';
    Logger.error(`JSON ${queueItem.file.name}: Erro ao ler ficheiro`);
    updateQueueUI();
    if (AppState.isSequentialProcessing) processNextFile(); else _scheduleLogClose();
  };
  reader.readAsText(queueItem.file, 'utf-8');
}

export function loadCSVFromQueue(queueItem) {
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = parseCsv(e.target.result, queueItem.file.name);
      if (!data.length) throw new Error('Nenhum registo encontrado.');
      data.forEach(row => { row.ficheiro_origem = queueItem.file.name; });
      AppState.fileDataMap[queueItem.file.name] = { records: data, mapping: {} };
      queueItem.status = 'success';
      AppState.consolidatedFiles.push(queueItem.file.name);
    } catch (err) {
      queueItem.status = 'error';
      Logger.error(`CSV ${queueItem.file.name}: ${err.message}`);
    }
    updateQueueUI();
    if (AppState.isSequentialProcessing) processNextFile(); else _scheduleLogClose();
  };
  reader.onerror = () => {
    queueItem.status = 'error';
    Logger.error(`CSV ${queueItem.file.name}: Erro ao ler ficheiro`);
    updateQueueUI();
    if (AppState.isSequentialProcessing) processNextFile(); else _scheduleLogClose();
  };
  reader.readAsText(queueItem.file, 'utf-8');
}

export function loadExcelFromQueue(queueItem) {
  const reader = new FileReader();
  reader.onload = async e => {
    await processExcelFromQueueMainThread(e.target.result, queueItem);
    if (AppState.isSequentialProcessing) processNextFile(); else _scheduleLogClose();
  };
  reader.onerror = () => {
    queueItem.status = 'error';
    Logger.error(`Excel ${queueItem.file.name}: Erro ao ler ficheiro`);
    updateQueueUI();
    if (AppState.isSequentialProcessing) processNextFile();
  };
  reader.readAsArrayBuffer(queueItem.file);
}

export async function processExcelFromQueueMainThread(buffer, queueItem) {
  if (typeof XLSX === 'undefined') {
    Logger.warn('SheetJS ainda não carregado — a aguardar…');
    let tries = 0;
    await new Promise(resolve => {
      const wait = setInterval(() => {
        tries++;
        if (typeof XLSX !== 'undefined') { clearInterval(wait); resolve(); }
        else if (tries >= 100) {
          clearInterval(wait);
          setFileError(queueItem, 'SheetJS não carregou');
          Logger.error(`Excel ${queueItem.file.name}: SheetJS não carregou`);
          resolve();
        }
      }, 100);
    });
    if (typeof XLSX === 'undefined') return;
  }

  try {
    const data       = new Uint8Array(buffer);
    const strategies = [
      { label: 'ultra-leve', opts: { type: 'array', raw: true, cellDates: true, cellFormula: false, cellStyles: false, cellNF: false, sheetStubs: false } },
      { label: 'leve',       opts: { type: 'array', raw: true, cellDates: true, cellFormula: false, cellStyles: false } },
      { label: 'sheetStubs', opts: { type: 'array', raw: true, cellDates: true, cellFormula: false, sheetStubs: true } },
      { label: 'raw:false',  opts: { type: 'array', raw: false, cellDates: true, cellFormula: false, cellStyles: false } },
      { label: 'completo',   opts: { type: 'array', raw: true, cellDates: true } },
    ];

    let ws = null, rows = [], lastError = null;
    for (const strat of strategies) {
      try {
        Logger.info(`  A tentar estratégia: ${strat.label}…`);
        let wb = XLSX.read(data, strat.opts);
        ws = null;
        for (const name of [...new Set([...wb.SheetNames, ...Object.keys(wb.Sheets)])]) {
          const s = wb.Sheets[name];
          if (s) { ws = s; break; }
        }
        wb = null; // libertar workbook — folha já extraída
        if (!ws) { Logger.warn(`Nenhuma folha com estratégia ${strat.label}`); continue; }

        rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });
        if (rows.length < 2 && ws['!ref']) {
          const range = XLSX.utils.decode_range(ws['!ref']);
          const maxRows = range.e.r - range.s.r + 1;
          if (maxRows <= 100000) {
            try { rows = readCellsDirect(ws); } catch (e) { Logger.warn(`readCellsDirect falhou: ${e.message}`); }
          }
        }
        if (rows.length >= 2) { Logger.info(`✓ Estratégia ${strat.label} funcionou!`); break; }
        Logger.warn(`Estratégia ${strat.label}: dados insuficientes`);
      } catch (stratErr) { lastError = stratErr; Logger.warn(`Estratégia ${strat.label} falhou: ${stratErr.message}`); }
    }

    if (!ws || rows.length < 2) throw new Error(`Excel sem dados legíveis. Erro: ${lastError?.message || 'desconhecido'}`);
    if (rows.length > 100000) Logger.warn(`⚠️ Ficheiro grande (${rows.length.toLocaleString('pt-PT')} linhas)`);

    let hIdx = 0;
    for (let i = 0; i < Math.min(rows.length, 10); i++) {
      if (rows[i]?.some(v => v != null && String(v).trim() !== '')) { hIdx = i; break; }
    }

    const headers = rows[hIdx].map(h => h != null ? String(h).trim() : '');
    const mapping = {};
    headers.forEach((h, colIdx) => { if (h) { const s = suggestField(h); if (s) mapping[colIdx] = s; } });

    const records   = [];
    const chunkSize = rows.length > 500000 ? 5000 : rows.length > 100000 ? 2000 : 1000;
    const t0        = performance.now();

    for (let i = hIdx + 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row?.some(v => v != null && String(v).trim() !== '')) continue;
      try { records.push(buildRecord(row, mapping, queueItem.file.name)); }
      catch (e) { Logger.warn(`Linha ${i + 1}: ${e.message}`); continue; }
      if (records.length % chunkSize === 0) {
        const elapsed = performance.now() - t0;
        if (elapsed > 120000) throw new Error('Processamento excedeu 120s.');
        Logger.info(`  ${records.length.toLocaleString('pt-PT')} registos em ${(elapsed/1000).toFixed(1)}s…`);
        await YIELD();
      }
    }

    if (!records.length) throw new Error('Nenhum registo após o cabeçalho.');

    Logger.info(`✓ Excel: ${records.length.toLocaleString('pt-PT')} registos em ${((performance.now()-t0)/1000).toFixed(1)}s`);
    AppState.fileDataMap[queueItem.file.name] = { records, mapping };
    queueItem.status   = 'success';
    queueItem.progress = 100;
    AppState.mappings[queueItem.file.name] = mapping;
    AppState.consolidatedFiles.push(queueItem.file.name);
    updateQueueUI();
  } catch (err) {
    const msg = err.message.includes('stack') ? 'Stack overflow (ficheiro corrompido)' : err.message.substring(0, 100);
    Logger.error(`Excel ${queueItem.file.name}: ${err.message}`);
    setFileError(queueItem, msg);
  }
}

// ── Mapeamento Excel ───────────────────────────────────────────

export function showMappingStep(headers, rows, hIdx) {
  show('mapping-section');
  const previewRow       = rows[hIdx + 1] || [];
  const knownSuggestions = [...new Set(Object.values(COLUMN_ALIASES))].sort();
  const datalist         = `<datalist id="field-suggestions">${knownSuggestions.map(s => `<option value="${s}">`).join('')}</datalist>`;

  const rowsHtml = headers.map((h, i) => {
    if (!h) return '';
    const suggested = suggestField(h) || '';
    const preview   = previewRow[i] != null ? String(previewRow[i]).substring(0, 50) : '—';
    const typeHint  = guessFieldTypeLocal(suggested, previewRow[i]);
    return `<tr id="map-row-${i}">
      <td><span class="map-col-name">${escHtml(h)}</span></td>
      <td>
        <span class="map-preview" title="${escHtml(String(previewRow[i] ?? ''))}">${escHtml(preview)}</span>
        <span style="font-size:10px;color:var(--muted);display:block;margin-top:2px">${typeHint}</span>
      </td>
      <td class="map-arrow">➡️</td>
      <td class="map-input-cell">
        <input type="text" id="map-inp-${i}" data-col="${i}" value="${escHtml(suggested)}"
               list="field-suggestions" placeholder="nome_do_campo"
               class="map-input ${suggested ? 'mapped' : ''}">
        <label class="map-ignore-label"><input type="checkbox" data-ignore-idx="${i}"> Ignorar</label>
        <span class="map-dup-warn" id="dup-warn-${i}" style="display:none;font-size:10px;color:var(--red)">⚠️ duplicado</span>
      </td>
    </tr>`;
  }).filter(Boolean).join('');

  document.getElementById('map-table-wrap').innerHTML = datalist + `
    <table class="map-table">
      <thead><tr>
        <th>Coluna no ficheiro</th><th>Exemplo — tipo detectado</th><th></th><th>Nome do campo (editável)</th>
      </tr></thead>
      <tbody>${rowsHtml}</tbody>
    </table>`;

  updateMapSummary();
  Logger.info('Mapeamento dinâmico apresentado.');
}

export async function confirmMapping() {
  const mapping = {};
  document.querySelectorAll('.map-input').forEach(inp => {
    if (inp.disabled) return;
    const key = inp.value.trim().toLowerCase().replace(/\s+/g, '_');
    if (key) mapping[parseInt(inp.dataset.col)] = key;
  });
  if (!Object.keys(mapping).length) { alert('Define pelo menos um campo antes de continuar.'); return; }

  Logger.separator('Conversão Excel ➡️ Modelo');
  Object.entries(mapping).forEach(([ci, fk]) => Logger.info(`  Coluna "${AppState._excelHeaders[parseInt(ci)]}" ➡️ ${fk}`));

  hide('mapping-section');
  show('progress-section');
  setProgress(10, 'A converter registos…', '');

  try {
    let hIdx = 0;
    for (let i = 0; i < Math.min(AppState._excelRows.length, 10); i++) {
      if (AppState._excelRows[i].some(v => v != null && String(v).trim() !== '')) { hIdx = i; break; }
    }
    const t0      = performance.now();
    const records = [];
    const total   = AppState._excelRows.length;
    for (let i = hIdx + 1; i < total; i++) {
      const row = AppState._excelRows[i];
      if (!row || !row.some(v => v != null && String(v).trim() !== '')) continue;
      records.push(buildRecord(row, mapping, AppState.fileName));
      if (records.length % 5000 === 0) {
        setProgress(10 + Math.round((i / total) * 80), 'A converter…', `${fmtN(records.length)} de ${fmtN(total)} linhas`);
        await YIELD();
      }
    }
    if (!records.length) throw new Error('Nenhum registo encontrado após o cabeçalho.');
    Logger.info(`${records.length.toLocaleString('pt-PT')} registos em ${(performance.now()-t0).toFixed(0)} ms`);
    AppState.rawData = records;
    setProgress(100, 'Concluído!', `${fmtN(records.length)} registos`);
    setTimeout(() => { if (_onConsolidationComplete) _onConsolidationComplete(); }, 300);
  } catch (err) {
    Logger.error(`Erro na conversão: ${err.message}`);
    alert('Erro na conversão:\n' + err.message);
  }
}

export function onMapInputChange(inp) {
  const v = inp.value.trim();
  inp.className = 'map-input' + (v ? ' mapped' : '');
  checkDuplicateMappings();
  updateMapSummary();
}

export function toggleIgnore(colIdx, chk) {
  const inp = document.getElementById(`map-inp-${colIdx}`);
  if (chk.checked) {
    inp.dataset.saved = inp.value;
    inp.value = ''; inp.disabled = true; inp.className = 'map-input';
  } else {
    inp.value = inp.dataset.saved || ''; inp.disabled = false;
    inp.className = 'map-input' + (inp.value ? ' mapped' : '');
  }
  checkDuplicateMappings();
  updateMapSummary();
}

export function checkDuplicateMappings() {
  const inputs = [...document.querySelectorAll('.map-input:not(:disabled)')];
  const count  = {};
  inputs.forEach(inp => { const v = inp.value.trim(); if (v) count[v] = (count[v] || 0) + 1; });
  inputs.forEach(inp => {
    const v   = inp.value.trim(), col = inp.dataset.col, warn = document.getElementById(`dup-warn-${col}`);
    const dup = v && count[v] > 1;
    if (warn) warn.style.display = dup ? 'inline' : 'none';
    inp.style.borderColor = dup ? 'var(--red)' : '';
  });
  return Object.values(count).some(n => n > 1);
}

export function updateMapSummary() {
  const inputs  = [...document.querySelectorAll('.map-input')];
  const mapped  = inputs.filter(i => !i.disabled && i.value.trim()).length;
  const ignored = inputs.filter(i => i.disabled || !i.value.trim()).length;
  const hasDups = checkDuplicateMappings();
  let html = `<strong>${mapped}</strong> campo(s) — <span style="color:var(--muted)">${ignored} ignorados</span>`;
  if (hasDups) html += ` — <span style="color:var(--red)">⚠️ nomes duplicados</span>`;
  const el = document.getElementById('map-summary');
  if (el) el.innerHTML = html;
}

// ── Biblioteca de ficheiros — carregar da memória persistente ──

export async function loadSavedFilesAndAnalyse(entries) {
  AppState.reset();
  for (const entry of entries) {
    AppState.fileDataMap[entry.name]    = { records: entry.records, mapping: entry.mapping || {} };
    AppState.consolidatedFiles.push(entry.name);
  }
  AppState.rawData  = entries.flatMap(e => e.records);
  AppState.fileName = entries.length === 1
    ? entries[0].name
    : `${entries.length} ficheiros (biblioteca)`;
  Logger.separator('BIBLIOTECA DE FICHEIROS');
  Logger.info(`${AppState.rawData.length.toLocaleString('pt-PT')} registos carregados (${entries.length} ficheiro${entries.length !== 1 ? 's' : ''})`);
  if (_onConsolidationComplete) _onConsolidationComplete();
}

// ── Helpers internos ───────────────────────────────────────────

function _setupDropZone() {
  const dz   = document.getElementById('import-section');
  const card = dz?.querySelector('.import-card');
  if (!dz) return;
  dz.addEventListener('dragover',  e => { e.preventDefault(); card?.classList.add('dragover'); });
  dz.addEventListener('dragleave', () => card?.classList.remove('dragover'));
  dz.addEventListener('drop', e => {
    e.preventDefault(); card?.classList.remove('dragover');
    addFilesToQueue(e.dataTransfer.files);
  });
}

function _setupFileInput() {
  const fi = document.getElementById('file-input');
  if (!fi) { console.warn('⚠️ #file-input não encontrado!'); return; }
  fi.addEventListener('change', e => {
    if (e.target.files?.length > 0) addFilesToQueue(e.target.files);
  });
}

function _scheduleLogClose() {
  // Log permanece visível após processamento individual
}
