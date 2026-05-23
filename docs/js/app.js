/* ============================================================
   G-FinanceSuite — Orquestrador principal
   Migração gradual para ES6 modules.
   ============================================================ */

import { AppState, APP_VERSION, PAGE_SIZE, PDF_MAX_RECORDS } from './state.js';
import { show, hide, setProgress, fmt, fmtN, escHtml, setSummaryCards, guessFieldType } from './modules/ui.js';
import { setPagination, renderPagination } from './modules/pagination.js';
import {
  initImport, isLikelyNumeric,
  addFilesToQueue, removeFileFromQueue, startProcessing, processSingleFile,
  startAnalysis, confirmMapping, onMapInputChange, toggleIgnore, updateQueueUI,
} from './modules/import.js';
import {
  buildFieldSelector, buildSumFieldSelector, toggleField, selectAllFields, clearAllFields,
  runDuplicates, renderDuplicates,
  setFilterTypeFromCard as setDupFilterTypeFromCard, setupFilters,
  buildSearchFieldPanel, onSearchFieldChange, updateSearchFieldBtn, toggleSearchFieldPanel,
  clearFilters, sortRecords, setSortField, getSortIndicator, getFilteredGroups,
} from './modules/duplicates.js';

/* --------------------------------------------------------------
   LOGGER
   -------------------------------------------------------------- */
const Logger = (() => {
  const entries = [];
  let hasError  = false;

  const ts = () => new Date().toISOString().replace('T',' ').substring(0,23);

  function push(level, msg) {
    const entry = { ts: ts(), level, msg };
    entries.push(entry);
    render(entry);
    updateHeader();
    if (level === 'ERROR') {
      hasError = true;
      document.getElementById('log-panel').classList.remove('collapsed');
      document.getElementById('log-dot').className = 'log-dot error';
    }
    console[level==='ERROR'?'error':level==='WARN'?'warn':'log'](`[${level}] ${msg}`);
  }

  function render(entry) {
    const body = document.getElementById('log-body');
    const el   = document.createElement('div');
    el.className = `log-entry ${entry.level}`;
    el.innerHTML = `<span class="log-ts">${entry.ts.substring(11)}</span><span class="log-msg">${esc(entry.msg)}</span>`;
    body.appendChild(el);
    body.scrollTop = body.scrollHeight;
  }

  function updateHeader() {
    document.getElementById('log-count').textContent =
      `${entries.length} entrada${entries.length!==1?'s':''}`;
    if (!hasError)
      document.getElementById('log-dot').className = entries.length ? 'log-dot' : 'log-dot idle';
  }

  const esc = s => String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');

  return {
    info     : msg => push('INFO',  msg),
    warn     : msg => push('WARN',  msg),
    error    : msg => push('ERROR', msg),
    separator: lbl => push('INFO',  `---- ${lbl} ----`),
    all      : ()  => entries,
    clear    : ()  => {
      entries.length = 0; hasError = false;
      document.getElementById('log-body').innerHTML = '';
      document.getElementById('log-dot').className  = 'log-dot idle';
      updateHeader();
    },
  };
})();

function toggleLog() {
  const modal = document.getElementById('log-modal');
  if (!modal) return;
  modal.style.display = modal.style.display === 'none' || !modal.style.display ? 'flex' : 'none';
}

function exportLog() {
  const lines = Logger.all().map(e=>`[${e.ts}] [${e.level}] ${e.msg}`).join('\n');
  const blob  = new Blob([lines], {type:'text/plain;charset=utf-8'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `G-FinanceSuite_log_${new Date().toISOString().replace(/[:.]/g,'-').substring(0,19)}.txt`;
  a.click();
  Logger.info('Log exportado para .txt');
}

function clearLog() { Logger.clear(); }

/* --------------------------------------------------------------
   SHOW CONTENT — constrói UI de análise a partir dos dados reais
   -------------------------------------------------------------- */
function showContent() {
  hide('import-section');
  hide('progress-section');
  hide('mapping-section');
  show('content');
  hide('results-section');

  document.getElementById('fi-name').textContent  = AppState.fileName;
  document.getElementById('fi-total').textContent = fmtN(AppState.rawData.length);
  const _isName = document.getElementById('is-name');
  const _isTotal = document.getElementById('is-total');
  if (_isName) _isName.textContent = AppState.fileName;
  if (_isTotal) _isTotal.textContent = fmtN(AppState.rawData.length);

  const sample = AppState.rawData[0] || {};
  AppState.availableFields = Object.keys(sample)
    .filter(k => {
      if (k === 'ficheiro_origem') return false;
      return AppState.rawData.some(r => r[k] != null);
    })
    .map(k => ({
      key:   k,
      label: k.replace(/_/g, ' '),
      desc:  guessFieldType(k, sample[k]),
    }));

  Logger.info(`Campos disponíveis: ${AppState.availableFields.map(f=>f.key).join(', ')}`);
  document.getElementById('fi-campos').textContent = AppState.availableFields.length;
  const _isCampos = document.getElementById('is-campos');
  if (_isCampos) _isCampos.textContent = AppState.availableFields.length;
  document.getElementById('fi-sub').textContent =
    /\.(xlsx|xls)$/i.test(AppState.fileName) ? 'Excel convertido com sucesso' : 'JSON carregado com sucesso';

  AppState.checkedFields = new Set();
  const defaults = ['numero_documento','atribuicao','montante'];
  AppState.availableFields.forEach(f => { if (defaults.includes(f.key)) AppState.checkedFields.add(f.key); });
  if (!AppState.checkedFields.size && AppState.availableFields.length) AppState.checkedFields.add(AppState.availableFields[0].key);

  buildFieldSelector();
  buildReconConfig();
  selectOp(1);
}

// buildFieldSelector, buildSumFieldSelector, toggleField,
// selectAllFields, clearAllFields → modules/duplicates.js

/* --------------------------------------------------------------
   OP 2 — CONFIGURAÇÃO DINÂMICA (agrupar por + campo de valor)
   -------------------------------------------------------------- */
function buildReconConfig() {
  const groupSel = document.getElementById('group-field-select');
  const valSel   = document.getElementById('value-field-select');

  const allOpts  = AppState.availableFields.map(f=>
    `<option value="${f.key}">${f.label} (${f.key})</option>`).join('');

  groupSel.innerHTML = allOpts;
  valSel.innerHTML   = allOpts;

  const defaultGroup = AppState.availableFields.find(f=>
    /atribuicao|conta|grupo|cliente|fornecedor|entidade|assignment/i.test(f.key)
  ) || AppState.availableFields[0];

  const defaultVal = AppState.availableFields.find(f=>isLikelyNumeric(f.key, null))
                  || AppState.availableFields.find(f=>f.key !== defaultGroup?.key)
                  || AppState.availableFields[0];

  if (defaultGroup) groupSel.value = defaultGroup.key;
  if (defaultVal)   valSel.value   = defaultVal.key;
}

/* --------------------------------------------------------------
   SELEÇÃO DE OPERAÇÃO
   -------------------------------------------------------------- */
function selectOp(n) {
  AppState.selectedOp = n;
  document.getElementById('op1-card').classList.toggle('active',      n===1);
  document.getElementById('op1-card').classList.remove('active-blue');
  document.getElementById('op2-card').classList.toggle('active-blue', n===2);
  document.getElementById('op2-card').classList.remove('active');

  if (n === 1) {
    show('field-selector');
    hide('recon-config');
    hide('recon-results-section');
    hide('pagination-recon-top');
    hide('pagination-recon-bottom');
  } else {
    hide('field-selector');
    show('recon-config');
  }

  hide('results-section');
  hide('recon-results-section');
  document.getElementById('is-op1')?.classList.toggle('is-active', n===1);
  document.getElementById('is-op2')?.classList.toggle('is-active', n===2);
}

/* --------------------------------------------------------------
   EXECUTAR ANÁLISE
   -------------------------------------------------------------- */
function runAnalysis() {
  if (AppState.selectedOp===1) runDuplicates(); else runReconciliation();
}

// runDuplicates → modules/duplicates.js

/* -- OP 2: RECONCILIAÇÃO (dinâmica) ------------------------- */
function runReconciliation() {
  const groupField = document.getElementById('group-field-select').value;
  const valField   = document.getElementById('value-field-select').value;
  const tolerance  = Math.abs(parseFloat(document.getElementById('tolerance-input').value)||1);

  if (!groupField) { alert('Escolhe o campo de agrupamento.'); return; }
  if (!valField)   { alert('Escolhe o campo de valor.'); return; }

  Logger.separator('Reconciliação');
  Logger.info(`Agrupar por: ${groupField} — Valor: ${valField} — Tolerância: €${tolerance.toFixed(2)}`);

  const groupMap = new Map();
  AppState.rawData.forEach(r => {
    const key = r[groupField]!=null ? String(r[groupField]).trim() : '(sem valor)';
    if (!groupMap.has(key)) groupMap.set(key,[]);
    groupMap.get(key).push(r);
  });

  const reconOk=[], reconNok=[];
  groupMap.forEach((records,grp) => {
    const saldo = records.reduce((s,r)=>s+(typeof r[valField]==='number'?r[valField]:0),0);
    (Math.abs(saldo)<=tolerance ? reconOk : reconNok).push({grp,records,saldo});
  });

  reconNok.sort((a,b)=>Math.abs(b.saldo)-Math.abs(a.saldo));
  reconOk.sort((a,b)=>Math.abs(a.saldo)-Math.abs(b.saldo));
  AppState.dupGroups=[...reconNok.map(e=>({...e,_recon:'nok'})),...reconOk.map(e=>({...e,_recon:'ok'}))];

  Logger.info(`Reconciliados: ${reconOk.length} — Por reconciliar: ${reconNok.length}`);
  if (reconNok.length) Logger.warn(`${reconNok.length} grupo(s) com saldo acima da tolerância.`);

  setSummaryCards([
    {id:'s-total',  val:fmtN(groupMap.size),  label:`Grupos (${groupField})`,  cls:'total'},
    {id:'s-dups',   val:fmtN(reconNok.length), label:'Por reconciliar',         cls:'dups'},
    {id:'s-unique', val:fmtN(reconOk.length),  label:'Reconciliados',           cls:'clean'},
    {id:'s-groups', val:`€ ${fmt(tolerance)}`, label:'Tolerância',              cls:'info'},
  ]);

  hide('results-section');
  show('recon-results-section');
  show('recon-config');
  show('pagination-recon-top');
  show('pagination-recon-bottom');

  const titleEl = document.getElementById('results-title');
  const metaEl = document.getElementById('results-meta');
  if (titleEl) titleEl.textContent = '';
  if (metaEl) metaEl.textContent = `${fmtN(reconNok.length)} por reconciliar — ${fmtN(reconOk.length)} reconciliados`;

  AppState.currentPage=1;
  show('results-section');
  renderReconciliation(reconOk,reconNok,tolerance,groupField,valField);
  document.getElementById('results-section').scrollIntoView({behavior:'smooth',block:'start'});
}

// renderDuplicates, filter/sort functions → modules/duplicates.js


/* --------------------------------------------------------------
   FILTRO POR CARD — orquestra entre Op1 e Op2
   -------------------------------------------------------------- */
function setFilterTypeFromCard(type) {
  if (AppState.selectedOp === 2 && AppState.reconDashboardState.allGroups.length > 0) {
    setReconFilterType(type);
    return;
  }
  setDupFilterTypeFromCard(type);
}

// setupFilters, buildSearchFieldPanel, onSearchFieldChange, updateSearchFieldBtn,
// toggleSearchFieldPanel, clearFilters, sortRecords, setSortField, getSortIndicator,
// getFilteredGroups → modules/duplicates.js

/* --------------------------------------------------------------
   RESET & ADICIONAR FICHEIROS
   -------------------------------------------------------------- */
function addMoreFiles() {
  const currentData  = [...AppState.rawData];
  const currentCount = AppState.rawData.length;
  Logger.info('📁 Modo: Adicionar Mais Ficheiros 📁');
  Logger.info(`Dados actuais: ${currentCount.toLocaleString('pt-PT')} registos`);
  Logger.info('A aguardar novos ficheiros para mesclar...');
  hide('content'); hide('results-section'); hide('progress-section');
  show('import-section');
  AppState.fileQueue        = [];
  AppState.consolidatedFiles = [];
  AppState.mappings          = {};
  AppState.processingQueue   = false;
  window._previousConsolidatedData  = currentData;
  window._previousConsolidatedCount = currentCount;
  document.getElementById('file-input').value = '';
  updateQueueUI();
  const hint = document.querySelector('.file-hint');
  if (hint) {
    hint.innerHTML = `Ou arrasta mais ficheiros aqui<br><small style="color:var(--muted)">Será mesclado com os ${currentCount.toLocaleString('pt-PT')} registos anteriores</small>`;
  }
}

function resetAll() {
  AppState.reset();
  window._previousConsolidatedData  = null;
  window._previousConsolidatedCount = 0;
  show('import-section');
  hide('progress-section'); hide('mapping-section'); hide('content'); hide('results-section');
  document.getElementById('file-input').value='';
  document.getElementById('info-sticky-bar')?.classList.remove('visible');
  updateQueueUI();
  const hint = document.querySelector('.file-hint');
  if (hint) hint.innerHTML = 'Ou arrasta vários ficheiros para aqui';
  Logger.info('Portal reiniciado.');
}

function renderReconciliation(reconOk, reconNok, tolerance, groupField, valField) {
  renderReconDashboard(reconOk, reconNok, tolerance, groupField, valField);
}

/* ---------------------------------------------------------------
   EXPORTAÇÃO DE DADOS
   --------------------------------------------------------------- */

function openExportModal() {
  const modal = document.getElementById('export-modal');
  if (!modal) return;
  modal.style.display = 'flex';

  AppState.exportState.dataType = 'all';
  AppState.exportState.format   = 'csv';

  updateExportCounts();
  setExportFormat('xlsx');
}

function closeExportModal() {
  const modal = document.getElementById('export-modal');
  if (modal) modal.style.display = 'none';
}

function setExportDataType(type) {
  AppState.exportState.dataType = type;
  updateExportCounts();
  updatePdfBtnState();
  updateExportPreview();
}

function setExportFormat(format) {
  if (format === 'pdf' && document.getElementById('export-fmt-pdf')?.disabled) return;
  AppState.exportState.format = format;

  document.querySelectorAll('.export-fmt-btn').forEach(btn => {
    const isSelected = btn.getAttribute('data-format') === format;
    if (isSelected) {
      btn.style.borderColor = '#2563eb';
      btn.style.background  = '#eff6ff';
      btn.style.color       = '#2563eb';
    } else {
      btn.style.borderColor = '#ddd';
      btn.style.background  = 'white';
      btn.style.color       = '#999';
    }
  });

  updateExportPreview();
}

function updateExportCounts() {
  let countAll    = AppState.rawData.length;
  let countDups   = 0;
  let countUnique = AppState.rawData.length;

  if (AppState.dupGroups.length > 0) {
    countDups   = AppState.dupGroups.reduce((sum, group) => sum + group.length, 0);
    countUnique = AppState.rawData.length - countDups;
  }

  document.getElementById('count-all').textContent    = `${fmtN(countAll)} registos`;
  document.getElementById('count-dups').textContent   = `${fmtN(countDups)} registos`;
  document.getElementById('count-unique').textContent = `${fmtN(countUnique)} registos`;

  updatePdfBtnState({ countAll, countDups, countUnique });
}

function updatePdfBtnState({ countAll, countDups, countUnique } = {}) {
  const btn = document.getElementById('export-fmt-pdf');
  if (!btn) return;

  const counts = { all: countAll ?? AppState.rawData.length };
  if (AppState.dupGroups.length > 0) {
    counts.duplicates = countDups   ?? AppState.dupGroups.reduce((s, g) => s + g.length, 0);
    counts.unique     = countUnique ?? (AppState.rawData.length - counts.duplicates);
  } else {
    counts.duplicates = 0;
    counts.unique     = AppState.rawData.length;
  }

  const n       = counts[AppState.exportState.dataType] ?? counts.all;
  const allowed = n < PDF_MAX_RECORDS;

  if (allowed) {
    btn.disabled      = false;
    btn.title         = '';
    btn.style.opacity = '1';
    btn.style.cursor  = 'pointer';
    btn.style.filter  = 'none';
  } else {
    btn.disabled      = true;
    btn.title         = `PDF limitado a ${fmtN(PDF_MAX_RECORDS)} registos. Selecionados: ${fmtN(n)}. Use CSV ou XML para conjuntos maiores.`;
    btn.style.opacity = '.38';
    btn.style.cursor  = 'not-allowed';
    btn.style.filter  = 'grayscale(1)';
    if (AppState.exportState.format === 'pdf') setExportFormat('xlsx');
  }
}

function updateExportPreview() {
  const preview  = document.getElementById('export-preview');
  const format   = AppState.exportState.format;

  let previewText = '';
  if      (format === 'csv')  previewText = '📊 CSV — Abrir em Excel ou Google Sheets';
  else if (format === 'json') previewText = '📋 JSON — Para integração com outras ferramentas';
  else if (format === 'xml')  previewText = '📁 XML — Formato estruturado para sistemas';
  else if (format === 'xlsx') previewText = '📈 XLSX — Ficheiro Excel com formatação (sem limite)';
  else if (format === 'pdf')  previewText = `📄 PDF — Relatório formatado (máx. ${fmtN(PDF_MAX_RECORDS)} registos)`;

  preview.textContent = previewText;
}

function getDataToExport() {
  const fields   = Array.from(AppState.checkedFields);
  const ctxKeys  = AppState.availableFields.map(f => f.key);
  const showCols = [...new Set([...fields, ...ctxKeys])].filter(k => k in (AppState.rawData[0] || {}));

  let dataToExport = [];

  if (AppState.exportState.dataType === 'all') {
    dataToExport = AppState.rawData;
  } else if (AppState.exportState.dataType === 'duplicates') {
    dataToExport = AppState.rawData.filter(r =>
      AppState.dupGroups.some(group => group.some(gr => gr === r))
    );
  } else if (AppState.exportState.dataType === 'unique') {
    dataToExport = AppState.uniqueRecords;
  }

  return { data: dataToExport, columns: showCols };
}

function executeExport() {
  const { data, columns } = getDataToExport();
  const format    = AppState.exportState.format;
  const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
  const filename  = `G-FinanceSuite-export-${timestamp}`;

  if      (format === 'csv')  exportToCSV(data, columns, filename);
  else if (format === 'json') exportToJSON(data, columns, filename);
  else if (format === 'xml')  exportToXML(data, columns, filename);
  else if (format === 'xlsx') exportToXLSX(data, columns, filename);
  else if (format === 'pdf')  exportToPDF(data, columns, filename);

  closeExportModal();
  Logger.info(`✅ Exportação em ${format.toUpperCase()} concluída: ${data.length} registos`);
}

function exportToCSV(data, columns, filename) {
  const header = columns.map(col => `"${col.replace(/"/g, '""')}"`).join(',');
  const rows = data.map(record => {
    return columns.map(col => {
      const value = record[col];
      let stringValue = '';
      if (value === null || value === undefined) {
        stringValue = '';
      } else if (typeof value === 'number') {
        stringValue = String(value);
      } else {
        stringValue = String(value).replace(/"/g, '""');
      }
      if (stringValue.includes(',') || stringValue.includes('\n') || stringValue.includes('"')) {
        stringValue = `"${stringValue}"`;
      }
      return stringValue;
    }).join(',');
  }).join('\n');

  const csv = header + '\n' + rows;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  downloadFile(blob, `${filename}.csv`);
}

function exportToJSON(data, columns, filename) {
  const jsonData = data.map(record => {
    const obj = {};
    columns.forEach(col => { obj[col] = record[col] ?? null; });
    return obj;
  });
  const json = JSON.stringify(jsonData, null, 2);
  const blob = new Blob([json], { type: 'application/json;charset=utf-8;' });
  downloadFile(blob, `${filename}.json`);
}

function exportToXML(data, columns, filename) {
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<G-FinanceSuite>\n';
  xml += `  <exported>${new Date().toISOString()}</exported>\n`;
  xml += `  <total>${data.length}</total>\n`;
  xml += '  <records>\n';
  data.forEach(record => {
    xml += '    <record>\n';
    columns.forEach(col => {
      const escapedValue = String(record[col] ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
      xml += `      <${col}>${escapedValue}</${col}>\n`;
    });
    xml += '    </record>\n';
  });
  xml += '  </records>\n';
  xml += '</G-FinanceSuite>';
  const blob = new Blob([xml], { type: 'application/xml;charset=utf-8;' });
  downloadFile(blob, `${filename}.xml`);
}

function exportToXLSX(data, columns, filename) {
  try {
    if (typeof window.XLSX === 'undefined') {
      Logger.error('Biblioteca XLSX não carregou');
      alert('⚠️ Biblioteca XLSX ainda a carregar. Tenta novamente em alguns segundos.');
      return;
    }

    const XLSX   = window.XLSX;
    const wsData = [columns];
    data.forEach(record => {
      wsData.push(columns.map(col => record[col] ?? ''));
    });

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!cols'] = columns.map(() => ({ wch: 15 }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Dados');
    wb.Props = { Title: 'G-FinanceSuite - Exportação de Dados', Author: 'G-FinanceSuite', CreatedDate: new Date() };

    XLSX.writeFile(wb, `${filename}.xlsx`);
    Logger.info(`✅ XLSX exportado com sucesso: ${data.length} registos`);
  } catch (err) {
    Logger.error(`Erro na exportação XLSX: ${err instanceof Error ? err.message : String(err)}`);
    alert('Erro ao exportar XLSX:\n' + (err instanceof Error ? err.message : String(err)));
  }
}

function exportToPDF(data, columns, filename) {
  try {
    if (typeof window.jspdf === 'undefined') {
      alert('⚠️ Biblioteca PDF ainda a carregar. Tenta novamente em alguns segundos.');
      return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'landscape' });

    const pageW  = doc.internal.pageSize.getWidth();
    const pageH  = doc.internal.pageSize.getHeight();
    const margin = 12;
    const contW  = pageW - margin * 2;
    const fSize  = 8;
    const rowH   = 8;
    const hdrH   = 9;
    const cellP  = 2;

    doc.setFontSize(fSize);
    const charW = doc.getStringUnitWidth('W') * fSize / doc.internal.scaleFactor;

    const sampleSize = Math.min(data.length, 200);
    const maxLens = columns.map(col => {
      let max = col.length;
      for (let i = 0; i < sampleSize; i++) {
        const v = data[i][col];
        const len = v === null || v === undefined ? 1 : String(v).length;
        if (len > max) max = len;
      }
      return Math.min(max, 32);
    });

    const totalLen = maxLens.reduce((a, b) => a + b, 0);
    let colW = maxLens.map(len => Math.max(14, Math.min(70, (len / totalLen) * contW)));
    const sumW = colW.reduce((a, b) => a + b, 0);
    if (sumW !== contW) colW = colW.map(w => w * (contW / sumW));

    const trunc = (str, w) => {
      const maxCh = Math.floor((w - cellP * 2) / charW);
      return str.length <= maxCh ? str : str.substring(0, Math.max(1, maxCh - 1)) + '…';
    };

    const footerY   = pageH - 7;
    const docHdrH   = 20;
    const tableTopY = margin + docHdrH;
    const usableH   = footerY - tableTopY - hdrH - 2;
    const rowsPerPg = Math.max(1, Math.floor(usableH / rowH));
    const totalPages = Math.ceil(data.length / rowsPerPg);

    const drawDocHeader = () => {
      doc.setFontSize(13);
      doc.setFont(undefined, 'bold');
      doc.setTextColor(28, 37, 38);
      doc.text('G-FinanceSuite — Relatório de Exportação', margin, margin + 7);
      doc.setFontSize(7.5);
      doc.setFont(undefined, 'normal');
      doc.setTextColor(110);
      doc.text(
        `Gerado: ${new Date().toLocaleString('pt-PT')}   |   Registos: ${fmtN(data.length)}   |   Colunas: ${columns.length}`,
        margin, margin + 14
      );
      doc.setDrawColor(200);
      doc.line(margin, margin + 17, pageW - margin, margin + 17);
    };

    const drawTableHeader = (y) => {
      doc.setFontSize(fSize);
      doc.setFont(undefined, 'bold');
      doc.setFillColor(37, 99, 235);
      doc.setTextColor(255, 255, 255);
      let x = margin;
      columns.forEach((col, i) => {
        doc.rect(x, y, colW[i], hdrH, 'F');
        doc.text(trunc(col, colW[i]), x + cellP, y + hdrH - cellP - 1);
        x += colW[i];
      });
    };

    const drawFooter = (pg) => {
      doc.setFontSize(7);
      doc.setFont(undefined, 'normal');
      doc.setTextColor(150);
      doc.text('© 2026 G-FinanceSuite', margin, footerY);
      const pgTxt = `${pg} / ${totalPages}`;
      const pgW = doc.getStringUnitWidth(pgTxt) * 7 / doc.internal.scaleFactor;
      doc.text(pgTxt, pageW - margin - pgW, footerY);
    };

    drawDocHeader();
    drawTableHeader(tableTopY);
    let rowY = tableTopY + hdrH;
    let page = 1;
    let rowCount = 0;

    data.forEach(record => {
      if (rowCount >= rowsPerPg) {
        drawFooter(page);
        doc.addPage();
        page++;
        rowCount = 0;
        drawTableHeader(margin + 5);
        rowY = margin + 5 + hdrH;
      }

      doc.setFontSize(fSize);
      doc.setFont(undefined, 'normal');

      if (rowCount % 2 === 1) {
        doc.setFillColor(245, 247, 250);
        doc.rect(margin, rowY, contW, rowH, 'F');
      }

      doc.setTextColor(40);
      let x = margin;
      columns.forEach((col, i) => {
        const val = record[col];
        const str = val === null || val === undefined ? '—' : typeof val === 'number' ? fmt(val) : String(val);
        doc.text(trunc(str, colW[i]), x + cellP, rowY + rowH - cellP - 1);
        x += colW[i];
      });

      doc.setDrawColor(220);
      doc.line(margin, rowY + rowH, pageW - margin, rowY + rowH);

      rowY += rowH;
      rowCount++;
    });

    drawFooter(page);
    doc.save(`${filename}.pdf`);
  } catch (error) {
    console.error('Erro ao gerar PDF:', error);
    alert('⚠️ Erro ao gerar PDF. Tenta novamente.');
  }
}

function downloadFile(blob, filename) {
  const url  = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href     = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/* --------------------------------------------------------------
   INICIALIZAÇÃO DA PÁGINA
   -------------------------------------------------------------- */
document.addEventListener('DOMContentLoaded', () => {
  const versionBadge = document.getElementById('version-badge');
  if (versionBadge) versionBadge.textContent = `v${APP_VERSION}`;

  hide('progress-section');
  hide('mapping-section');
  hide('content');
  hide('results-section');
  show('import-section');

  const logPanel = document.getElementById('log-panel');
  if (logPanel) {
    logPanel.classList.add('collapsed');
    const chevron = document.getElementById('log-chevron');
    if (chevron) chevron.textContent = '▼';
  }

  initImport({ onConsolidationComplete: showContent });

  Logger.info('Portal inicializado');

  const stickyBar   = document.getElementById('info-sticky-bar');
  const fileInfoBar = document.querySelector('.file-info-bar-v2');
  if (stickyBar && fileInfoBar) {
    const observer = new IntersectionObserver(([entry]) => {
      const contentVisible = document.getElementById('content')?.style.display !== 'none';
      if (!entry.isIntersecting && contentVisible) {
        stickyBar.classList.add('visible');
      } else {
        stickyBar.classList.remove('visible');
      }
    }, { threshold: 0, rootMargin: `-${58}px 0px 0px 0px` });
    observer.observe(fileInfoBar);
  }
});

/* ───────────────────────────────────────────────────────────────
   DASHBOARD DE RECONCILIAÇÃO
   ─────────────────────────────────────────────────────────────── */

function renderReconDashboard(reconOk, reconNok, tolerance, groupField, valField) {
  AppState.reconDashboardState.allGroups  = [...reconNok, ...reconOk];
  AppState.reconDashboardState.tolerance  = tolerance;
  AppState.reconDashboardState.groupField = groupField;
  AppState.reconDashboardState.valField   = valField;
  AppState.reconDashboardState.filterType = 'all';

  Logger.info(`renderReconDashboard: ${reconOk.length} reconciliados + ${reconNok.length} por reconciliar = ${AppState.reconDashboardState.allGroups.length} total`);

  show('reconciliation-dashboard');
  show('results-header-section');

  const cardAll    = document.getElementById('card-all');
  const cardDups   = document.getElementById('card-dups');
  const cardUnique = document.getElementById('card-unique');
  if (cardAll)    cardAll.onclick    = () => setFilterTypeFromCard('all');
  if (cardDups)   cardDups.onclick   = () => setFilterTypeFromCard('por_reconciliar');
  if (cardUnique) cardUnique.onclick = () => setFilterTypeFromCard('reconciliados');

  const slDups   = document.querySelector('#card-dups .sl');
  const slUnique = document.querySelector('#card-unique .sl');
  const slGroups = document.querySelector('#card-groups .sl');
  if (slDups)   slDups.textContent   = 'Por reconciliar';
  if (slUnique) slUnique.textContent = 'Reconciliados';
  if (slGroups) slGroups.textContent = 'Tolerância';

  renderReconPieChart(reconOk, reconNok);
  renderReconBarChart(reconNok, valField);
  renderReconStats(AppState.reconDashboardState.allGroups);

  setReconFilterType('all');
}

function renderReconPieChart(reconOk, reconNok) {
  const ctx = document.getElementById('recon-pie-chart');
  if (!ctx) return;

  if (AppState.reconDashboardState.charts.pie) {
    AppState.reconDashboardState.charts.pie.destroy();
  }

  AppState.reconDashboardState.charts.pie = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Reconciliados', 'Por reconciliar'],
      datasets: [{
        data: [reconOk.length, reconNok.length],
        backgroundColor: ['#4ade80', '#f87171'],
        borderColor: ['#22c55e', '#dc2626'],
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: { position: 'bottom', labels: { font: { size: 11 }, padding: 12 } }
      }
    }
  });
}

function renderReconBarChart(reconNok, valField) {
  const ctx = document.getElementById('recon-bar-chart');
  if (!ctx) return;

  if (AppState.reconDashboardState.charts.bar) {
    AppState.reconDashboardState.charts.bar.destroy();
  }

  const topGroups = reconNok.slice(0, 10).map(g => ({
    label: String(g.grp).substring(0, 20),
    value: Math.abs(g.saldo)
  }));

  AppState.reconDashboardState.charts.bar = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: topGroups.map(g => g.label),
      datasets: [{
        label: 'Saldo (€)',
        data: topGroups.map(g => g.value),
        backgroundColor: '#ef4444',
        borderColor: '#dc2626',
        borderWidth: 1
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: true,
      plugins: { legend: { display: false } },
      scales: { x: { beginAtZero: true, grid: { color: '#f0f0f0' } } }
    }
  });
}

function renderReconStats(groups) {
  if (!groups || groups.length === 0) {
    Logger.warn('renderReconStats: nenhum grupo recebido');
    ['stat-total-balance', 'stat-avg-balance', 'stat-median-balance', 'stat-max-balance'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = '—';
    });
    return;
  }

  const saldos       = groups.map(g => g.saldo);
  const totalBalance = saldos.reduce((s, v) => s + v, 0);
  const avgBalance   = saldos.length > 0 ? totalBalance / saldos.length : 0;
  const sortedSaldos = [...saldos].sort((a, b) => a - b);
  const medianBalance = sortedSaldos.length % 2 === 0
    ? (sortedSaldos[sortedSaldos.length / 2 - 1] + sortedSaldos[sortedSaldos.length / 2]) / 2
    : sortedSaldos[Math.floor(sortedSaldos.length / 2)];
  const maxBalance = saldos.reduce((max, s) => Math.max(max, Math.abs(s)), 0);

  const update = (id, val) => {
    const el = document.getElementById(id);
    Logger.info(`update(${id}, ${val}) - elemento ${el ? 'encontrado' : 'NÃO ENCONTRADO'}`);
    if (el) {
      el.textContent = fmt(val);
    } else {
      Logger.warn(`renderReconStats: elemento ${id} não encontrado`);
    }
  };

  Logger.info(`renderReconStats: iniciando com ${groups.length} grupos`);
  update('stat-total-balance', totalBalance);
  update('stat-avg-balance',   avgBalance);
  update('stat-median-balance', medianBalance);
  update('stat-max-balance',   maxBalance);
  Logger.info('renderReconStats: completado');
}

function renderReconTable(groups, groupField, valField, tolerance) {
  const tbody = document.getElementById('recon-table-body');
  if (!tbody) {
    Logger.warn('renderReconTable: elemento recon-table-body não encontrado');
    return;
  }

  if (!groups || groups.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="padding:20px;text-align:center;color:#999">Nenhum grupo encontrado</td></tr>';
    setPagination('none');
    Logger.warn('renderReconTable: nenhum grupo recebido');
    return;
  }

  const totalPages = Math.ceil(groups.length / PAGE_SIZE);
  const start = (AppState.currentPage - 1) * PAGE_SIZE;
  const slice = groups.slice(start, start + PAGE_SIZE);

  const rows = slice.map((g, idx) => {
    const status      = Math.abs(g.saldo) <= tolerance ? '✅ Reconciliado' : '❌ Por reconciliar';
    const statusColor = Math.abs(g.saldo) <= tolerance ? '#22c55e' : '#ef4444';
    const expandId    = `recon-expand-${start + idx}`;

    const docNumbers = g.records
      .map(r => r.numero_documento)
      .filter(n => n)
      .join(', ');

    return `
      <tr style="border-bottom:1px solid #f0f0f0;transition:all 0.2s;cursor:pointer" onclick="toggleReconExpand('${expandId}')" title="Clique para ver documentos">
        <td style="padding:10px 12px;color:#333">
          <span style="margin-right:8px;color:#999;font-weight:bold">▼</span>${escHtml(String(g.grp))}
        </td>
        <td style="padding:10px 12px;text-align:center;color:#666">${g.records.length}</td>
        <td style="padding:10px 12px;text-align:right;font-weight:bold;color:${Math.abs(g.saldo) > 10000 ? '#ef4444' : '#333'}">${fmt(g.saldo)}</td>
        <td style="padding:10px 12px;text-align:center;color:${statusColor};font-weight:600">${status}</td>
        <td style="padding:10px 12px;font-size:11px;color:#6b7280">${docNumbers.substring(0, 30)}${docNumbers.length > 30 ? '...' : ''}</td>
      </tr>
      <tr id="${expandId}" style="display:none;background:#f8f9fa">
        <td colspan="5" style="padding:12px 16px">
          <div style="background:white;border:1px solid #e5e7eb;border-radius:6px;padding:12px">
            <div style="font-size:11px;font-weight:600;color:#6b7280;margin-bottom:8px;text-transform:uppercase">Documentos neste grupo:</div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;font-size:12px">
              ${g.records.map(r => `
                <div style="padding:8px;background:#f3f4f6;border-radius:4px;border-left:3px solid #8ec73d">
                  <div style="font-weight:600;color:#1c2526">${escHtml(String(r.numero_documento || '—'))}</div>
                  <div style="font-size:11px;color:#6b7280">Montante: ${fmt(r[valField] || 0)}</div>
                </div>
              `).join('')}
            </div>
          </div>
        </td>
      </tr>
    `;
  });

  tbody.innerHTML = rows.join('');
  setPagination(groups.length > PAGE_SIZE ? 'flex' : 'none', `Grupos ${start+1}–${Math.min(start+PAGE_SIZE,groups.length)} de ${fmtN(groups.length)}`, true);
  renderPagination(totalPages, () => renderReconTable(AppState.reconDashboardState.filteredGroups, groupField, valField, tolerance), true);

  Logger.info(`renderReconTable: ${slice.length}/${groups.length} grupos renderizados (página ${AppState.currentPage}/${totalPages})`);
}

function applyReconFilters() {
  const minVal = parseFloat(document.getElementById('recon-min-saldo').value);
  const maxVal = parseFloat(document.getElementById('recon-max-saldo').value);

  AppState.reconDashboardState.minSaldo = isNaN(minVal) ? null : minVal;
  AppState.reconDashboardState.maxSaldo = isNaN(maxVal) ? null : maxVal;

  AppState.reconDashboardState.filteredGroups = AppState.reconDashboardState.allGroups.filter(g => {
    const saldo = Math.abs(g.saldo);
    if (AppState.reconDashboardState.minSaldo !== null && saldo < AppState.reconDashboardState.minSaldo) return false;
    if (AppState.reconDashboardState.maxSaldo !== null && saldo > AppState.reconDashboardState.maxSaldo) return false;
    return true;
  });

  const groupField = document.getElementById('group-field-select').value;
  const valField   = document.getElementById('value-field-select').value;
  const tolerance  = parseFloat(document.getElementById('tolerance-input').value) || 1;

  renderReconTable(AppState.reconDashboardState.filteredGroups, groupField, valField, tolerance);
}

function clearReconFilters() {
  document.getElementById('recon-min-saldo').value = '';
  document.getElementById('recon-max-saldo').value = '';
  AppState.reconDashboardState.minSaldo        = null;
  AppState.reconDashboardState.maxSaldo        = null;
  AppState.reconDashboardState.filteredGroups  = [...AppState.reconDashboardState.allGroups];

  const groupField = document.getElementById('group-field-select').value;
  const valField   = document.getElementById('value-field-select').value;
  const tolerance  = parseFloat(document.getElementById('tolerance-input').value) || 1;

  renderReconTable(AppState.reconDashboardState.filteredGroups, groupField, valField, tolerance);
}

function toggleReconExpand(expandId) {
  const el = document.getElementById(expandId);
  if (el) {
    const isVisible = el.style.display !== 'none';
    el.style.display = isVisible ? 'none' : 'table-row';
  }
}

function setReconFilterType(type) {
  AppState.reconDashboardState.filterType = type;

  let filtered = AppState.reconDashboardState.allGroups;
  if (type === 'reconciliados') {
    filtered = AppState.reconDashboardState.allGroups.filter(g => Math.abs(g.saldo) <= AppState.reconDashboardState.tolerance);
  } else if (type === 'por_reconciliar') {
    filtered = AppState.reconDashboardState.allGroups.filter(g => Math.abs(g.saldo) > AppState.reconDashboardState.tolerance);
  }

  AppState.reconDashboardState.filteredGroups = filtered;
  AppState.currentPage = 1;

  ['card-all', 'card-dups', 'card-unique'].forEach(id => {
    const card = document.getElementById(id);
    if (card) {
      const cardType = id === 'card-all' ? 'all' : (id === 'card-unique' ? 'reconciliados' : 'por_reconciliar');
      card.style.opacity   = type === cardType ? '1' : '0.6';
      card.style.transform = type === cardType ? 'scale(1.02)' : 'scale(1)';
    }
  });

  renderReconTable(AppState.reconDashboardState.filteredGroups, AppState.reconDashboardState.groupField, AppState.reconDashboardState.valField, AppState.reconDashboardState.tolerance);
  Logger.info(`Filtro: ${type} | ${AppState.reconDashboardState.filteredGroups.length} grupos mostrados`);
}

function toggleReconCharts() {
  const content = document.getElementById('recon-collapsible-content');
  const btn  = document.getElementById('recon-toggle-btn');
  const icon = document.getElementById('recon-toggle-icon');
  const text = document.getElementById('recon-toggle-text');

  if (content && btn) {
    const isVisible = content.style.display !== 'none';
    content.style.display = isVisible ? 'none' : 'block';
    if (isVisible) {
      icon.textContent = '▶';
      text.textContent = 'Expandir';
      btn.style.background = '#f3f4f6';
    } else {
      icon.textContent = '▼';
      text.textContent = 'Colapsar';
      btn.style.background = 'white';
    }
    Logger.info(`Dashboard ${isVisible ? 'colapsado' : 'expandido'}`);
  }
}

/* ────────────────────────────────────────────────────────────────
   EXPORT PARA RECONCILIAÇÃO
   ──────────────────────────────────────────────────────────────── */

function openReconExportModal() {
  const modal = document.getElementById('recon-export-modal');
  if (!modal) return;
  modal.style.display = 'flex';
  updateReconExportCounts();
  Logger.info('Modal de exportação de reconciliação aberto');
}

function closeReconExportModal() {
  const modal = document.getElementById('recon-export-modal');
  if (modal) modal.style.display = 'none';
}

function setReconExportDataType(type) {
  AppState.reconExportState.dataType = type;
  updateReconExportCounts();
  Logger.info(`Tipo de exportação: ${type}`);
}

function setReconExportFormat(format) {
  AppState.reconExportState.format = format;
  updateReconExportPreview();

  document.querySelectorAll('.recon-export-fmt-btn').forEach(btn => {
    if (btn.dataset.format === format) {
      btn.style.borderColor = '#8ec73d';
      btn.style.background  = '#f0f8f4';
      btn.style.color       = '#1f2937';
    } else {
      btn.style.borderColor = '#ddd';
      btn.style.background  = 'white';
      btn.style.color       = '#999';
    }
  });
}

function updateReconExportCounts() {
  const allGroups    = AppState.reconDashboardState.allGroups || [];
  const tolerance    = AppState.reconDashboardState.tolerance;
  const reconciliados   = allGroups.filter(g => Math.abs(g.saldo) <= tolerance);
  const porReconciliar  = allGroups.filter(g => Math.abs(g.saldo) > tolerance);

  const countAll = document.getElementById('recon-count-all');
  const countRec = document.getElementById('recon-count-reconciliados');
  const countPor = document.getElementById('recon-count-por-reconciliar');

  if (countAll) countAll.textContent = `${fmtN(allGroups.length)} grupo${allGroups.length !== 1 ? 's' : ''}`;
  if (countRec) countRec.textContent = `${fmtN(reconciliados.length)} grupo${reconciliados.length !== 1 ? 's' : ''}`;
  if (countPor) countPor.textContent = `${fmtN(porReconciliar.length)} grupo${porReconciliar.length !== 1 ? 's' : ''}`;
}

function updateReconExportPreview() {
  const format  = AppState.reconExportState.format;
  const preview = document.getElementById('recon-export-preview');
  if (!preview) return;

  const formats = {
    csv:  '📊 CSV — Compatível com Excel e cálculos',
    json: '{ } JSON — Dados estruturados, ideal para integração',
    xml:  '&lt;/&gt; XML — Formato universal, fácil de processar',
    xlsx: '📈 XLSX — Excel com formatação avançada',
    pdf:  '📄 PDF — Relatório pronto para impressão (até 2000 registos)'
  };

  preview.innerHTML = formats[format] || 'Selecione formato';
}

function getReconDataToExport() {
  const allGroups  = AppState.reconDashboardState.allGroups || [];
  const tolerance  = AppState.reconDashboardState.tolerance || 1;
  const groupField = AppState.reconDashboardState.groupField || 'grupo';
  const valField   = AppState.reconDashboardState.valField   || 'saldo';

  let groupsToExport = allGroups;

  if (AppState.reconExportState.dataType === 'reconciliados') {
    groupsToExport = allGroups.filter(g => Math.abs(g.saldo) <= tolerance);
  } else if (AppState.reconExportState.dataType === 'por_reconciliar') {
    groupsToExport = allGroups.filter(g => Math.abs(g.saldo) > tolerance);
  }

  const data    = groupsToExport.map(g => ({
    'Grupo':     g.grp,
    'Registos':  g.records.length,
    'Saldo':     g.saldo,
    'Status':    Math.abs(g.saldo) <= tolerance ? 'Reconciliado' : 'Por reconciliar',
    'Documentos': g.records.map(r => r.numero_documento || '—').join('; ')
  }));
  const columns = ['Grupo', 'Registos', 'Saldo', 'Status', 'Documentos'];

  return { data, columns };
}

function executeReconExport() {
  const { data, columns } = getReconDataToExport();
  const format    = AppState.reconExportState.format;
  const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
  const typeLabel = AppState.reconExportState.dataType === 'all' ? 'todos' : AppState.reconExportState.dataType;
  const filename  = `G-FinanceSuite_reconciliacao_${typeLabel}_${timestamp}`;

  try {
    if      (format === 'csv')  exportToCSV(data, columns, filename);
    else if (format === 'json') exportToJSON(data, columns, filename);
    else if (format === 'xml')  exportToXML(data, columns, filename);
    else if (format === 'xlsx') exportToXLSX(data, columns, filename);
    else if (format === 'pdf') {
      if (data.length > PDF_MAX_RECORDS) {
        alert(`⚠️ PDF limitado a ${PDF_MAX_RECORDS} registos. Tem ${data.length} registos. Exporte em CSV ou JSON para todos os dados.`);
        return;
      }
      exportToPDF(data, columns, filename);
    }
    Logger.info(`✅ Reconciliação exportada em ${format.toUpperCase()}: ${filename}`);
    closeReconExportModal();
  } catch (err) {
    Logger.error(`Erro ao exportar reconciliação: ${err.message}`);
    alert('Erro ao exportar:\n' + err.message);
  }
}

/* ============================================================
   SHIMS GLOBAIS — Expõe funções ao HTML via onclick/onchange
   Temporário durante migração para ES6 modules.
   Removidos na Fase 7 (substituídos por event listeners).
   ============================================================ */
window.toggleLog              = toggleLog;
window.exportLog              = exportLog;
window.clearLog               = clearLog;
window.selectOp               = selectOp;
window.runAnalysis            = runAnalysis;
window.resetAll               = resetAll;
window.clearAllFields         = clearAllFields;
window.selectAllFields        = selectAllFields;
window.toggleField            = toggleField;
window.clearFilters           = clearFilters;
window.toggleSearchFieldPanel = toggleSearchFieldPanel;
window.onSearchFieldChange    = onSearchFieldChange;
window.setFilterTypeFromCard  = setFilterTypeFromCard;
window.setSortField           = setSortField;
window.confirmMapping         = confirmMapping;
window.onMapInputChange       = onMapInputChange;
window.toggleIgnore           = toggleIgnore;
window.addMoreFiles           = addMoreFiles;
window.removeFileFromQueue    = removeFileFromQueue;
window.startAnalysis          = startAnalysis;
window.startProcessing        = startProcessing;
window.processSingleFile      = processSingleFile;
window.applyReconFilters      = applyReconFilters;
window.clearReconFilters      = clearReconFilters;
window.toggleReconCharts      = toggleReconCharts;
window.toggleReconExpand      = toggleReconExpand;
window.openExportModal        = openExportModal;
window.closeExportModal       = closeExportModal;
window.setExportDataType      = setExportDataType;
window.setExportFormat        = setExportFormat;
window.executeExport          = executeExport;
window.openReconExportModal   = openReconExportModal;
window.closeReconExportModal  = closeReconExportModal;
window.setReconExportDataType = setReconExportDataType;
window.setReconExportFormat   = setReconExportFormat;
window.executeReconExport     = executeReconExport;
