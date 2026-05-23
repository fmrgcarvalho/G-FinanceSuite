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
import {
  runReconciliation, renderReconDashboard,
  renderReconPieChart, renderReconBarChart, renderReconStats, renderReconTable,
  applyReconFilters, clearReconFilters, toggleReconExpand, setReconFilterType, toggleReconCharts,
  openReconExportModal, closeReconExportModal, setReconExportDataType, setReconExportFormat,
  updateReconExportCounts, updateReconExportPreview, getReconDataToExport, executeReconExport,
} from './modules/reconciliation.js';

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

// runReconciliation → modules/reconciliation.js

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

// renderReconDashboard, renderReconPieChart, renderReconBarChart, renderReconStats,
// renderReconTable, applyReconFilters, clearReconFilters, toggleReconExpand,
// setReconFilterType, toggleReconCharts + recon export functions → modules/reconciliation.js


/* ============================================================
   SHIMS GLOBAIS — Expõe funções ao HTML via onclick/onchange
   Temporário durante migração para ES6 modules.
   Removidos na Fase 7 (substituídos por event listeners).
   ============================================================ */
window.Logger                 = Logger;
window._exportToCSV           = exportToCSV;
window._exportToJSON          = exportToJSON;
window._exportToXML           = exportToXML;
window._exportToXLSX          = exportToXLSX;
window._exportToPDF           = exportToPDF;
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
