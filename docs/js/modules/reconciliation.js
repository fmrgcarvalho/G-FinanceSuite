/* ============================================================
   G-FinanceSuite — Módulo Reconciliação (Op2)
   Execução, dashboard, filtros e exportação de reconciliação.
   Depende de: AppState, PAGE_SIZE (state.js), ui.js, pagination.js, logger.js
   ============================================================ */

import { AppState, PAGE_SIZE } from '../state.js';
import { show, hide, fmt, fmtN, escHtml, setSummaryCards } from './ui.js';
import { setPagination, renderPagination } from './pagination.js';
import { exportToCSV, exportToJSON, exportToXML, exportToXLSX, exportToPDF } from './export.js';
import { Logger } from './logger.js';

// ── IDs DOM necessários ────────────────────────────────────────
export const REQUIRED_IDS = [
  'group-field-select', 'value-field-select', 'tolerance-input',
  'recon-results-section', 'recon-config',
  'reconciliation-dashboard', 'results-header-section',
  'recon-card-all', 'recon-card-nok', 'recon-card-ok',
  'recon-pie-chart', 'recon-bar-chart',
  'stat-total-balance', 'stat-avg-balance', 'stat-median-balance', 'stat-max-balance',
  'recon-table-body',
  'recon-min-saldo', 'recon-max-saldo',
  'recon-collapsible-content', 'recon-toggle-btn', 'recon-toggle-icon', 'recon-toggle-text',
];

// ── Inicialização de eventos ───────────────────────────────────
export function initReconEvents() {
  const tbody = document.getElementById('recon-table-body');
  if (tbody) tbody.addEventListener('click', e => {
    const tr = e.target.closest('[data-expand]');
    if (tr) toggleReconExpand(tr.dataset.expand);
  });
}

// ── Executar reconciliação ─────────────────────────────────────
export function runReconciliation() {
  const groupField = document.getElementById('group-field-select').value;
  const valField   = document.getElementById('value-field-select').value;
  const tolerance  = Math.abs(parseFloat(document.getElementById('tolerance-input').value) || 1);

  if (!groupField) { alert('Escolhe o campo de agrupamento.'); return; }
  if (!valField)   { alert('Escolhe o campo de valor.'); return; }

  Logger.separator('Reconciliação');
  Logger.info(`Agrupar por: ${groupField} — Valor: ${valField} — Tolerância: €${tolerance.toFixed(2)}`);

  const groupMap = new Map();
  AppState.rawData.forEach(r => {
    const key = r[groupField] != null ? String(r[groupField]).trim() : '(sem valor)';
    if (!groupMap.has(key)) groupMap.set(key, []);
    groupMap.get(key).push(r);
  });

  const reconOk = [], reconNok = [];
  groupMap.forEach((records, grp) => {
    const saldo = records.reduce((s, r) => s + (typeof r[valField] === 'number' ? r[valField] : 0), 0);
    (Math.abs(saldo) <= tolerance ? reconOk : reconNok).push({ grp, records, saldo });
  });

  reconNok.sort((a, b) => Math.abs(b.saldo) - Math.abs(a.saldo));
  reconOk.sort((a, b) => Math.abs(a.saldo) - Math.abs(b.saldo));
  AppState.dupGroups = [...reconNok.map(e => ({ ...e, _recon: 'nok' })), ...reconOk.map(e => ({ ...e, _recon: 'ok' }))];

  Logger.info(`Reconciliados: ${reconOk.length} — Por reconciliar: ${reconNok.length}`);
  if (reconNok.length) Logger.warn(`${reconNok.length} grupo(s) com saldo acima da tolerância.`);

  setSummaryCards([
    { id:'recon-s-total', val:fmtN(groupMap.size),   label:`Grupos (${groupField})`, cls:'total' },
    { id:'recon-s-nok',   val:fmtN(reconNok.length),  label:'Por reconciliar',        cls:'dups'  },
    { id:'recon-s-ok',    val:fmtN(reconOk.length),   label:'Reconciliados',          cls:'clean' },
    { id:'recon-s-tol',   val:`€ ${fmt(tolerance)}`,  label:'Tolerância',             cls:'info'  },
  ]);

  hide('results-section');
  show('recon-results-section');
  show('recon-config');
  show('pagination-recon-top');
  show('pagination-recon-bottom');

  const titleEl = document.getElementById('results-title');
  const metaEl  = document.getElementById('results-meta');
  if (titleEl) titleEl.textContent = '';
  if (metaEl)  metaEl.textContent  = `${fmtN(reconNok.length)} por reconciliar — ${fmtN(reconOk.length)} reconciliados`;

  AppState.currentPage = 1;
  renderReconDashboard(reconOk, reconNok, tolerance, groupField, valField);
  document.getElementById('recon-results-section').scrollIntoView({ behavior:'smooth', block:'start' });
}

// ── Dashboard principal ────────────────────────────────────────
export function renderReconDashboard(reconOk, reconNok, tolerance, groupField, valField) {
  AppState.reconDashboardState.allGroups  = [...reconNok, ...reconOk];
  AppState.reconDashboardState.tolerance  = tolerance;
  AppState.reconDashboardState.groupField = groupField;
  AppState.reconDashboardState.valField   = valField;
  AppState.reconDashboardState.filterType = 'all';

  Logger.info(`renderReconDashboard: ${reconOk.length} reconciliados + ${reconNok.length} por reconciliar = ${AppState.reconDashboardState.allGroups.length} total`);

  show('reconciliation-dashboard');
  show('results-header-section');

  const slNok = document.querySelector('#recon-card-nok .sl');
  const slOk  = document.querySelector('#recon-card-ok .sl');
  const slTol = document.querySelector('#recon-card-tol .sl');
  if (slNok) slNok.textContent = 'Por reconciliar';
  if (slOk)  slOk.textContent  = 'Reconciliados';
  if (slTol) slTol.textContent = 'Tolerância';

  renderReconPieChart(reconOk, reconNok);
  renderReconBarChart(reconNok, valField);
  renderReconStats(AppState.reconDashboardState.allGroups);
  setReconFilterType('all');
}

export function renderReconPieChart(reconOk, reconNok) {
  const ctx = document.getElementById('recon-pie-chart');
  if (!ctx) return;
  if (AppState.reconDashboardState.charts.pie) AppState.reconDashboardState.charts.pie.destroy();

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
      responsive: true, maintainAspectRatio: true,
      plugins: { legend: { position: 'bottom', labels: { font: { size: 11 }, padding: 12 } } }
    }
  });
}

export function renderReconBarChart(reconNok, valField) {
  const ctx = document.getElementById('recon-bar-chart');
  if (!ctx) return;
  if (AppState.reconDashboardState.charts.bar) AppState.reconDashboardState.charts.bar.destroy();

  const topGroups = reconNok.slice(0, 10).map(g => ({
    label: String(g.grp).substring(0, 20),
    value: Math.abs(g.saldo)
  }));

  AppState.reconDashboardState.charts.bar = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: topGroups.map(g => g.label),
      datasets: [{ label: 'Saldo (€)', data: topGroups.map(g => g.value), backgroundColor: '#ef4444', borderColor: '#dc2626', borderWidth: 1 }]
    },
    options: {
      indexAxis: 'y', responsive: true, maintainAspectRatio: true,
      plugins: { legend: { display: false } },
      scales: { x: { beginAtZero: true, grid: { color: '#f0f0f0' } } }
    }
  });
}

export function renderReconStats(groups) {
  if (!groups || groups.length === 0) {
    Logger.warn('renderReconStats: nenhum grupo recebido');
    ['stat-total-balance', 'stat-avg-balance', 'stat-median-balance', 'stat-max-balance'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = '—';
    });
    return;
  }

  const saldos        = groups.map(g => g.saldo);
  const totalBalance  = saldos.reduce((s, v) => s + v, 0);
  const avgBalance    = saldos.length > 0 ? totalBalance / saldos.length : 0;
  const sortedSaldos  = [...saldos].sort((a, b) => a - b);
  const medianBalance = sortedSaldos.length % 2 === 0
    ? (sortedSaldos[sortedSaldos.length / 2 - 1] + sortedSaldos[sortedSaldos.length / 2]) / 2
    : sortedSaldos[Math.floor(sortedSaldos.length / 2)];
  const maxBalance    = saldos.reduce((max, s) => Math.max(max, Math.abs(s)), 0);

  Logger.info(`renderReconStats: iniciando com ${groups.length} grupos`);
  [
    ['stat-total-balance',  totalBalance],
    ['stat-avg-balance',    avgBalance],
    ['stat-median-balance', medianBalance],
    ['stat-max-balance',    maxBalance],
  ].forEach(([id, val]) => {
    const el = document.getElementById(id);
    if (el) el.textContent = fmt(val);
    else Logger.warn(`renderReconStats: elemento ${id} não encontrado`);
  });
  Logger.info('renderReconStats: completado');
}

export function renderReconTable(groups, groupField, valField, tolerance) {
  const tbody = document.getElementById('recon-table-body');
  if (!tbody) { Logger.warn('renderReconTable: recon-table-body não encontrado'); return; }

  if (!groups || groups.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="padding:20px;text-align:center;color:#999">Nenhum grupo encontrado</td></tr>';
    setPagination('none', undefined, true);
    Logger.warn('renderReconTable: nenhum grupo recebido');
    return;
  }

  const totalPages = Math.ceil(groups.length / PAGE_SIZE);
  const start = (AppState.currentPage - 1) * PAGE_SIZE;
  const slice = groups.slice(start, start + PAGE_SIZE);

  tbody.innerHTML = slice.map((g, idx) => {
    const status      = Math.abs(g.saldo) <= tolerance ? '✅ Reconciliado' : '❌ Por reconciliar';
    const statusColor = Math.abs(g.saldo) <= tolerance ? '#22c55e' : '#ef4444';
    const expandId    = `recon-expand-${start + idx}`;
    const docNumbers  = g.records.map(r => r.numero_documento).filter(n => n).join(', ');

    return `
      <tr style="border-bottom:1px solid #f0f0f0;transition:all 0.2s;cursor:pointer" data-expand="${expandId}" title="Clique para ver documentos">
        <td style="padding:10px 12px;color:#333"><span style="margin-right:8px;color:#999;font-weight:bold">▼</span>${escHtml(String(g.grp))}</td>
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
                </div>`).join('')}
            </div>
          </div>
        </td>
      </tr>`;
  }).join('');

  setPagination(groups.length > PAGE_SIZE ? 'flex' : 'none', `Grupos ${start+1}–${Math.min(start+PAGE_SIZE, groups.length)} de ${fmtN(groups.length)}`, true);
  renderPagination(totalPages, () => renderReconTable(AppState.reconDashboardState.filteredGroups, groupField, valField, tolerance), true);
  Logger.info(`renderReconTable: ${slice.length}/${groups.length} grupos renderizados (página ${AppState.currentPage}/${totalPages})`);
}

// ── Filtros ────────────────────────────────────────────────────
export function applyReconFilters() {
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

export function clearReconFilters() {
  document.getElementById('recon-min-saldo').value = '';
  document.getElementById('recon-max-saldo').value  = '';
  AppState.reconDashboardState.minSaldo       = null;
  AppState.reconDashboardState.maxSaldo       = null;
  AppState.reconDashboardState.filteredGroups = [...AppState.reconDashboardState.allGroups];

  const groupField = document.getElementById('group-field-select').value;
  const valField   = document.getElementById('value-field-select').value;
  const tolerance  = parseFloat(document.getElementById('tolerance-input').value) || 1;
  renderReconTable(AppState.reconDashboardState.filteredGroups, groupField, valField, tolerance);
}

export function toggleReconExpand(expandId) {
  const el = document.getElementById(expandId);
  if (el) el.style.display = el.style.display !== 'none' ? 'none' : 'table-row';
}

export function setReconFilterType(type) {
  AppState.reconDashboardState.filterType = type;

  let filtered = AppState.reconDashboardState.allGroups;
  if (type === 'reconciliados')   filtered = AppState.reconDashboardState.allGroups.filter(g => Math.abs(g.saldo) <= AppState.reconDashboardState.tolerance);
  else if (type === 'por_reconciliar') filtered = AppState.reconDashboardState.allGroups.filter(g => Math.abs(g.saldo) > AppState.reconDashboardState.tolerance);

  AppState.reconDashboardState.filteredGroups = filtered;
  AppState.currentPage = 1;

  ['recon-card-all', 'recon-card-nok', 'recon-card-ok'].forEach(id => {
    const card = document.getElementById(id);
    if (!card) return;
    const cardType = id === 'recon-card-all' ? 'all' : id === 'recon-card-ok' ? 'reconciliados' : 'por_reconciliar';
    card.style.opacity   = type === cardType ? '1' : '0.6';
    card.style.transform = type === cardType ? 'scale(1.02)' : 'scale(1)';
  });

  renderReconTable(AppState.reconDashboardState.filteredGroups, AppState.reconDashboardState.groupField, AppState.reconDashboardState.valField, AppState.reconDashboardState.tolerance);
  Logger.info(`Filtro: ${type} | ${AppState.reconDashboardState.filteredGroups.length} grupos mostrados`);
}

export function toggleReconCharts() {
  const content = document.getElementById('recon-collapsible-content');
  const btn  = document.getElementById('recon-toggle-btn');
  const icon = document.getElementById('recon-toggle-icon');
  const text = document.getElementById('recon-toggle-text');

  if (content && btn) {
    const isVisible = content.style.display !== 'none';
    content.style.display = isVisible ? 'none' : 'block';
    icon.textContent = isVisible ? '▶' : '▼';
    text.textContent = isVisible ? 'Expandir' : 'Colapsar';
    btn.style.background = isVisible ? '#f3f4f6' : 'white';
    Logger.info(`Dashboard ${isVisible ? 'colapsado' : 'expandido'}`);
  }
}

// ── Export de reconciliação ────────────────────────────────────
export function openReconExportModal() {
  const modal = document.getElementById('recon-export-modal');
  if (!modal) return;
  modal.style.display = 'flex';
  updateReconExportCounts();
  Logger.info('Modal de exportação de reconciliação aberto');
}

export function closeReconExportModal() {
  const modal = document.getElementById('recon-export-modal');
  if (modal) modal.style.display = 'none';
}

export function setReconExportDataType(type) {
  AppState.reconExportState.dataType = type;
  updateReconExportCounts();
  Logger.info(`Tipo de exportação: ${type}`);
}

export function setReconExportFormat(format) {
  AppState.reconExportState.format = format;
  updateReconExportPreview();

  document.querySelectorAll('.recon-export-fmt-btn').forEach(btn => {
    const sel = btn.dataset.format === format;
    btn.style.borderColor = sel ? '#8ec73d' : '#ddd';
    btn.style.background  = sel ? '#f0f8f4' : 'white';
    btn.style.color       = sel ? '#1f2937' : '#999';
  });
}

export function updateReconExportCounts() {
  const allGroups      = AppState.reconDashboardState.allGroups || [];
  const tolerance      = AppState.reconDashboardState.tolerance;
  const reconciliados  = allGroups.filter(g => Math.abs(g.saldo) <= tolerance);
  const porReconciliar = allGroups.filter(g => Math.abs(g.saldo) > tolerance);

  const countAll = document.getElementById('recon-count-all');
  const countRec = document.getElementById('recon-count-reconciliados');
  const countPor = document.getElementById('recon-count-por-reconciliar');

  if (countAll) countAll.textContent = `${fmtN(allGroups.length)} grupo${allGroups.length !== 1 ? 's' : ''}`;
  if (countRec) countRec.textContent = `${fmtN(reconciliados.length)} grupo${reconciliados.length !== 1 ? 's' : ''}`;
  if (countPor) countPor.textContent = `${fmtN(porReconciliar.length)} grupo${porReconciliar.length !== 1 ? 's' : ''}`;
}

export function updateReconExportPreview() {
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

export function getReconDataToExport() {
  const allGroups  = AppState.reconDashboardState.allGroups || [];
  const tolerance  = AppState.reconDashboardState.tolerance || 1;
  const valField   = AppState.reconDashboardState.valField   || 'saldo';

  let groupsToExport = allGroups;
  if (AppState.reconExportState.dataType === 'reconciliados')   groupsToExport = allGroups.filter(g => Math.abs(g.saldo) <= tolerance);
  else if (AppState.reconExportState.dataType === 'por_reconciliar') groupsToExport = allGroups.filter(g => Math.abs(g.saldo) > tolerance);

  const data = groupsToExport.map(g => ({
    'Grupo':      g.grp,
    'Registos':   g.records.length,
    'Saldo':      g.saldo,
    'Status':     Math.abs(g.saldo) <= tolerance ? 'Reconciliado' : 'Por reconciliar',
    'Documentos': g.records.map(r => r.numero_documento || '—').join('; ')
  }));

  return { data, columns: ['Grupo', 'Registos', 'Saldo', 'Status', 'Documentos'] };
}

export function executeReconExport() {
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
      const PDF_MAX = 2000;
      if (data.length > PDF_MAX) {
        alert(`⚠️ PDF limitado a ${PDF_MAX} registos. Tem ${data.length} registos. Exporte em CSV ou JSON para todos os dados.`);
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
