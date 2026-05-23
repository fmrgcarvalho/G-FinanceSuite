/* ============================================================
   G-FinanceSuite — Orquestrador principal
   ============================================================ */

import { AppState, APP_VERSION, PAGE_SIZE, PDF_MAX_RECORDS } from './state.js';
import { Logger } from './modules/logger.js';
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
  initDuplicatesEvents,
} from './modules/duplicates.js';
import {
  runReconciliation, renderReconDashboard,
  renderReconPieChart, renderReconBarChart, renderReconStats, renderReconTable,
  applyReconFilters, clearReconFilters, toggleReconExpand, setReconFilterType, toggleReconCharts,
  openReconExportModal, closeReconExportModal, setReconExportDataType, setReconExportFormat,
  updateReconExportCounts, updateReconExportPreview, getReconDataToExport, executeReconExport,
  setReconSortField, initReconEvents,
} from './modules/reconciliation.js';
import {
  openExportModal, closeExportModal, setExportDataType, setExportFormat,
  updateExportCounts, updatePdfBtnState, updateExportPreview,
  getDataToExport, executeExport,
  exportToCSV, exportToJSON, exportToXML, exportToXLSX, exportToPDF, downloadFile,
} from './modules/export.js';

/* --------------------------------------------------------------
   LOG UI
   -------------------------------------------------------------- */
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
   SHOW CONTENT
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

/* --------------------------------------------------------------
   OP 2 — CONFIGURAÇÃO DINÂMICA
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

/* --------------------------------------------------------------
   FILTRO POR CARD
   -------------------------------------------------------------- */
function setFilterTypeFromCard(type) {
  if (AppState.selectedOp === 2 && AppState.reconDashboardState.allGroups.length > 0) {
    setReconFilterType(type);
    return;
  }
  setDupFilterTypeFromCard(type);
}

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

/* --------------------------------------------------------------
   VALIDAÇÃO DE DOM
   -------------------------------------------------------------- */
function validateDOM() {
  const allIds = [
    'import-section', 'file-input', 'files-queue', 'files-queue-list',
    'mapping-section', 'map-table-wrap', 'map-summary',
    'progress-section', 'prog-fill', 'prog-label', 'prog-sub',
    'content', 'results-section', 'recon-results-section',
    'fields-grid', 'sum-field-select', 'dup-list', 'filters-section',
    'group-field-select', 'value-field-select', 'tolerance-input',
    'recon-table-body', 'export-modal', 'recon-export-modal',
    'log-modal', 'log-body', 'log-dot', 'log-count',
  ];
  const missing = allIds.filter(id => !document.getElementById(id));
  if (missing.length) Logger.warn(`DOM incompleto — em falta: ${missing.join(', ')}`);
  return missing.length === 0;
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

  validateDOM();

  initImport({ onConsolidationComplete: showContent });
  initDuplicatesEvents();
  initReconEvents();

  Logger.info('Portal inicializado');

  // ── Log modal ──────────────────────────────────────────────────
  document.getElementById('log-btn')?.addEventListener('click', toggleLog);
  document.getElementById('log-modal-backdrop')?.addEventListener('click', toggleLog);
  document.getElementById('log-modal-close')?.addEventListener('click', toggleLog);
  document.getElementById('btn-export-log')?.addEventListener('click', exportLog);
  document.getElementById('btn-clear-log')?.addEventListener('click', clearLog);

  // ── Op selection ───────────────────────────────────────────────
  document.getElementById('op1-card')?.addEventListener('click', () => selectOp(1));
  document.getElementById('op2-card')?.addEventListener('click', () => selectOp(2));
  document.getElementById('is-op1')?.addEventListener('click', () => selectOp(1));
  document.getElementById('is-op2')?.addEventListener('click', () => selectOp(2));

  // ── Reset / nova análise ───────────────────────────────────────
  document.getElementById('btn-sticky-reset')?.addEventListener('click', resetAll);
  document.getElementById('btn-ctb-reset')?.addEventListener('click', resetAll);
  document.getElementById('btn-cancel-mapping')?.addEventListener('click', resetAll);

  // ── Mapeamento ─────────────────────────────────────────────────
  document.getElementById('btn-confirm-mapping')?.addEventListener('click', confirmMapping);

  // ── Seleção de campos Op1 ──────────────────────────────────────
  document.getElementById('btn-select-all-fields')?.addEventListener('click', selectAllFields);
  document.getElementById('btn-clear-all-fields')?.addEventListener('click', clearAllFields);

  // ── Executar análise ───────────────────────────────────────────
  document.getElementById('btn-run')?.addEventListener('click', runAnalysis);
  document.getElementById('btn-run-recon')?.addEventListener('click', runAnalysis);

  // ── Cards de sumário (delegação em ambos os containers) ────────
  document.getElementById('summary-cards')?.addEventListener('click', e => {
    const card = e.target.closest('[data-filter]');
    if (card) setFilterTypeFromCard(card.dataset.filter);
  });
  document.getElementById('recon-summary-cards')?.addEventListener('click', e => {
    const card = e.target.closest('[data-filter]');
    if (card) setFilterTypeFromCard(card.dataset.filter);
  });

  // ── Filtros Op1 ────────────────────────────────────────────────
  document.getElementById('search-field-btn')?.addEventListener('click', toggleSearchFieldPanel);
  document.getElementById('btn-clear-filters')?.addEventListener('click', clearFilters);

  // ── Filtros Op2 ────────────────────────────────────────────────
  document.getElementById('btn-apply-recon-filters')?.addEventListener('click', applyReconFilters);
  document.getElementById('btn-clear-recon-filters')?.addEventListener('click', clearReconFilters);
  document.getElementById('btn-open-recon-export')?.addEventListener('click', openReconExportModal);

  // ── Export modal Op1 ───────────────────────────────────────────
  document.getElementById('btn-close-export-modal')?.addEventListener('click', closeExportModal);
  document.getElementById('btn-execute-export')?.addEventListener('click', executeExport);

  document.getElementById('export-modal')?.addEventListener('change', e => {
    const radio = e.target.closest('input[name=export-type]');
    if (radio) setExportDataType(radio.value);
  });
  document.getElementById('export-modal')?.addEventListener('click', e => {
    const btn = e.target.closest('.export-fmt-btn[data-format]');
    if (btn) setExportFormat(btn.dataset.format);
  });

  // ── Export modal Op2 ───────────────────────────────────────────
  document.getElementById('btn-close-recon-export-modal')?.addEventListener('click', closeReconExportModal);
  document.getElementById('btn-execute-recon-export')?.addEventListener('click', executeReconExport);

  document.getElementById('recon-export-modal')?.addEventListener('change', e => {
    const radio = e.target.closest('input[name=recon-export-type]');
    if (radio) setReconExportDataType(radio.value);
  });
  document.getElementById('recon-export-modal')?.addEventListener('click', e => {
    const btn = e.target.closest('.recon-export-fmt-btn[data-format]');
    if (btn) setReconExportFormat(btn.dataset.format);
  });

  // ── Export button from dup-list (rendered dynamically) ────────
  document.getElementById('dup-list')?.addEventListener('click', e => {
    if (e.target.closest('[data-action="open-export"]')) openExportModal();
  });

  // ── Sticky bar scroll observer ─────────────────────────────────
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
