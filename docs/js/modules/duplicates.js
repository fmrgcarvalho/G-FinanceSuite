/* ============================================================
   G-FinanceSuite — Módulo Duplicados (Op1)
   Deteção, renderização e filtragem de duplicados.
   Depende de: AppState, PAGE_SIZE (state.js), ui.js, pagination.js
   ============================================================ */

import { AppState, PAGE_SIZE } from '../state.js';
import { show, hide, fmt, fmtN, escHtml, setSummaryCards, setupTableKeyNav, classifyValue } from './ui.js';
import { setPagination, renderPagination } from './pagination.js';

// ── IDs DOM necessários ────────────────────────────────────────
export const REQUIRED_IDS = [
  'fields-grid', 'sum-field-select',
  'results-section', 'dup-list', 'filters-section',
  'filter-search', 'filter-exactcount', 'filter-minamt', 'filter-maxamt',
  'filter-exactcount-wrapper', 'search-field-panel', 'search-field-wrapper',
  'search-field-btn', 'search-field-label',
  'card-all', 'card-dups', 'card-unique', 'card-suspicious',
];

// ── Seletor de campos Op1 ──────────────────────────────────────
export function initDuplicatesEvents() {
  const grid = document.getElementById('fields-grid');
  if (grid) grid.addEventListener('change', e => {
    const inp = e.target.closest('input[type=checkbox][data-field]');
    if (inp) toggleField(inp.dataset.field, inp);
  });

  const searchPanel = document.getElementById('search-field-panel');
  if (searchPanel) searchPanel.addEventListener('change', e => {
    if (e.target.type === 'checkbox') onSearchFieldChange();
  });

  const dupList = document.getElementById('dup-list');
  if (dupList) dupList.addEventListener('click', e => {
    const sortTh = e.target.closest('[data-sort]');
    if (sortTh) { setSortField(sortTh.dataset.sort); return; }
  });
}

export function buildFieldSelector() {
  const grid = document.getElementById('fields-grid');
  grid.innerHTML = AppState.availableFields.map(f => `
    <label class="field-chk ${AppState.checkedFields.has(f.key)?'checked':''}" id="lbl-${f.key}">
      <input type="checkbox" data-field="${f.key}" ${AppState.checkedFields.has(f.key)?'checked':''}
             >
      <span class="fname">${f.key}</span>
      <span class="fdesc">${f.desc}</span>
    </label>`).join('');

  buildSumFieldSelector();
}

export function buildSumFieldSelector() {
  const sel = document.getElementById('sum-field-select');
  if (!sel) return;

  const numericFields = AppState.availableFields.filter(f =>
    f.desc && (f.desc.includes('numérico') || f.desc.includes('número') || f.desc.includes('numeric'))
  );

  const opts = numericFields.map(f =>
    `<option value="${f.key}">${f.label || f.key}</option>`).join('');

  sel.innerHTML = '<option value="">— Nenhum (sem soma) —</option>' + opts;

  const autoDetect = ['montante','MONTANTE','Montante','valor','VALOR','Valor','amount','AMOUNT']
                     .find(fname => numericFields.some(f => f.key === fname));

  if (autoDetect) {
    sel.value = autoDetect;
    AppState.selectedSumField = autoDetect;
  }

  sel.onchange = (e) => { AppState.selectedSumField = e.target.value; };
}

export function toggleField(key, el) {
  if (el.checked) { AppState.checkedFields.add(key);    document.getElementById('lbl-'+key)?.classList.add('checked'); }
  else            { AppState.checkedFields.delete(key);  document.getElementById('lbl-'+key)?.classList.remove('checked'); }
}

export function selectAllFields() {
  AppState.availableFields.forEach(f => {
    AppState.checkedFields.add(f.key);
    const lbl = document.getElementById('lbl-'+f.key);
    if (lbl) { lbl.classList.add('checked'); lbl.querySelector('input').checked = true; }
  });
}

export function clearAllFields() {
  AppState.checkedFields.clear();
  document.querySelectorAll('.field-chk').forEach(lbl => {
    lbl.classList.remove('checked'); lbl.querySelector('input').checked = false;
  });
}

// ── Executar análise de duplicados ─────────────────────────────
export function runDuplicates() {
  const fields = [...AppState.checkedFields];
  if (!fields.length) { alert('Seleciona pelo menos um campo.'); return; }

  const groupMap = new Map();
  AppState.rawData.forEach(r => {
    const key = fields.map(f => {
      const v = r[f];
      if (v === null || v === undefined) return '';
      if (typeof v === 'number') return v.toFixed(4);
      return String(v).trim();
    }).join('||');
    if (!groupMap.has(key)) groupMap.set(key, []);
    groupMap.get(key).push(r);
  });

  AppState.dupGroups = [...groupMap.values()].filter(g => g.length > 1);
  AppState.dupGroups.sort((a, b) => b.length - a.length);
  const dupCount = AppState.dupGroups.reduce((s, g) => s + g.length, 0);

  AppState.uniqueRecords = [...groupMap.values()]
    .filter(g => g.length === 1)
    .map(g => g[0]);

  const allFields = AppState.availableFields.map(f => f.key);
  detectTypeAnomalies(AppState.rawData, allFields);

  setSummaryCards([
    { id:'s-total',      val:fmtN(AppState.rawData.length),              label:'Total de registos',   cls:'total' },
    { id:'s-dups',       val:fmtN(dupCount),                              label:'Registos duplicados', cls:'dups'  },
    { id:'s-unique',     val:fmtN(AppState.rawData.length - dupCount),    label:'Registos únicos',     cls:'clean' },
    { id:'s-groups',     val:fmtN(AppState.dupGroups.length),             label:'Grupos duplicados',   cls:'info'  },
    { id:'s-suspicious', val:fmtN(AppState.anomalyRecords.length),        label:'Suspeitos',           cls:'warn'  },
  ]);

  hide('reconciliation-dashboard');
  hide('results-header-section');
  hide('recon-config');
  hide('pagination-recon-top');
  hide('pagination-recon-bottom');
  show('filters-section');
  show('pagination');
  show('pagination-top');

  document.getElementById('results-title').textContent = '';
  AppState.currentPage = 1;
  AppState.activeFilters.type = 'all';
  show('results-section');

  _setFilterCards('all');
  renderDuplicates(fields);
  document.getElementById('results-section').scrollIntoView({ behavior:'smooth', block:'start' });
}

// ── Render principal ───────────────────────────────────────────
export function renderDuplicates(fields) {
  const el = document.getElementById('dup-list');

  if (AppState.activeFilters.type === 'all') {
    if (!AppState.rawData.length) {
      el.innerHTML = `<div class="no-dups"><p>Nenhum registo.</p></div>`;
      setPagination('none'); return;
    }

    let allRecords = AppState.rawData.filter(r => {
      if (AppState.activeFilters.search) {
        const vals = AppState.activeFilters.searchFields.length
          ? AppState.activeFilters.searchFields.map(k => r[k])
          : Object.values(r);
        if (!vals.some(v => String(v ?? '').toLowerCase().includes(AppState.activeFilters.search))) return false;
      }
      if (AppState.selectedSumField && AppState.activeFilters.minAmount !== null && (r[AppState.selectedSumField] ?? 0) < AppState.activeFilters.minAmount) return false;
      if (AppState.selectedSumField && AppState.activeFilters.maxAmount !== null && (r[AppState.selectedSumField] ?? 0) > AppState.activeFilters.maxAmount) return false;
      return true;
    });

    if (!allRecords.length) {
      el.innerHTML = `<div class="no-dups"><div class="big">🔍</div><p>Nenhum registo corresponde aos filtros.</p></div>`;
      setPagination('none'); return;
    }

    const sorted     = AppState.sortState.field ? sortRecords(allRecords, AppState.sortState.field, AppState.sortState.direction) : allRecords;
    const totalPages = Math.ceil(sorted.length / PAGE_SIZE);
    const start      = (AppState.currentPage - 1) * PAGE_SIZE;
    const slice      = sorted.slice(start, start + PAGE_SIZE);
    const showCols   = _visibleCols(fields);
    const totalAll   = AppState.selectedSumField
      ? sorted.reduce((s, r) => s + (typeof r[AppState.selectedSumField] === 'number' ? r[AppState.selectedSumField] : 0), 0)
      : 0;

    el.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:16px;padding:12px;background:#e3f2fd;border-radius:8px;border:1px solid #90caf9;">
        <div style="display:flex;align-items:center;gap:16px">
          <span style="display:inline-block;background:#1976d2;color:white;padding:6px 14px;border-radius:20px;font-size:12px;font-weight:600;">Total de registos</span>
          <span style="font-size:14px;color:#555;font-weight:500;">∑ montante: ${fmt(totalAll)}</span>
        </div>
        <div style="display:flex;align-items:center;gap:10px">
          <div style="display:flex;flex-direction:column;gap:2px;text-align:right">
            <div style="font-weight:600;color:#1e40af;font-size:12px">📊 Exportar dados</div>
            <div style="font-size:10px;color:#6b7280">CSV, JSON, XML, XLSX, PDF</div>
          </div>
          <button data-action="open-export" style="padding:8px 14px;background:#2563eb;color:white;border:none;border-radius:6px;cursor:pointer;font-weight:600;white-space:nowrap;transition:all 0.2s;font-size:12px">⬇️ Exportar</button>
        </div>
      </div>
      <div style="overflow-x:auto"><table>
        <thead><tr>${_headerCells(showCols)}</tr></thead>
        <tbody>${_rows(slice, showCols)}</tbody>
      </table></div>`;

    setPagination(sorted.length > PAGE_SIZE ? 'flex' : 'none', `Registos ${start+1}–${Math.min(start+PAGE_SIZE, sorted.length)} de ${fmtN(sorted.length)}`);
    renderPagination(totalPages, () => renderDuplicates(fields));
    setupFilters(() => renderDuplicates(fields));
    return;
  }

  if (AppState.activeFilters.type === 'suspicious') {
    let suspiciousRecs = AppState.anomalyRecords;

    if (!suspiciousRecs.length) {
      el.innerHTML = `<div class="no-dups"><div class="big">✅</div><p>Nenhum dado suspeito detetado.</p></div>`;
      setPagination('none'); return;
    }

    if (AppState.activeFilters.search) {
      suspiciousRecs = suspiciousRecs.filter(({ record }) => {
        const vals = AppState.activeFilters.searchFields.length
          ? AppState.activeFilters.searchFields.map(k => record[k])
          : Object.values(record);
        return vals.some(v => String(v ?? '').toLowerCase().includes(AppState.activeFilters.search));
      });
    }

    if (!suspiciousRecs.length) {
      el.innerHTML = `<div class="no-dups"><div class="big">🔍</div><p>Nenhum registo corresponde aos filtros.</p></div>`;
      setPagination('none'); return;
    }

    const totalPages = Math.ceil(suspiciousRecs.length / PAGE_SIZE);
    const start      = (AppState.currentPage - 1) * PAGE_SIZE;
    const slice      = suspiciousRecs.slice(start, start + PAGE_SIZE);
    const showCols   = _visibleCols(fields);

    el.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:16px;padding:12px;background:#fff7ed;border-radius:8px;border:1px solid #fed7aa;">
        <div style="display:flex;align-items:center;gap:16px">
          <span style="display:inline-block;background:#ea580c;color:white;padding:6px 14px;border-radius:20px;font-size:12px;font-weight:600;">⚠ Dados suspeitos</span>
          <span style="font-size:14px;color:#555;font-weight:500;">${fmtN(suspiciousRecs.length)} registo(s) com anomalias de tipo</span>
        </div>
      </div>
      <div style="overflow-x:auto"><table>
        <thead><tr>${_headerCells(showCols)}</tr></thead>
        <tbody>${slice.map(({ record, fields: anomFields }) => {
          const anomalyMap = Object.fromEntries(anomFields.map(a => [a.field, a.reason]));
          return `<tr>${_rowCellsWithAnomalies(record, showCols, anomalyMap)}</tr>`;
        }).join('')}</tbody>
      </table></div>`;

    setPagination(suspiciousRecs.length > PAGE_SIZE ? 'flex' : 'none', `Registos ${start+1}–${Math.min(start+PAGE_SIZE, suspiciousRecs.length)} de ${fmtN(suspiciousRecs.length)}`);
    renderPagination(totalPages, () => renderDuplicates(fields));
    setupFilters(() => renderDuplicates(fields));
    return;
  }

  let dataToShow = AppState.activeFilters.type === 'unique'
    ? AppState.uniqueRecords.map(r => [r])
    : AppState.dupGroups;

  if (!dataToShow.length) {
    const msg = AppState.activeFilters.type === 'unique'
      ? '✓ Nenhum registo único encontrado.'
      : '✓ Nenhum duplicado encontrado.';
    el.innerHTML = `<div class="no-dups"><div class="big">👍</div><p>${msg}</p></div>`;
    setPagination('none'); return;
  }

  let filteredGroups = getFilteredGroups(dataToShow);
  if (!filteredGroups.length) {
    el.innerHTML = '<div class="no-dups"><div class="big">🔍</div><p>Nenhum grupo corresponde aos filtros.</p></div>';
    setPagination('none'); return;
  }

  if (AppState.sortState.field) {
    filteredGroups = [...filteredGroups].sort((a, b) => {
      const vA = a[0]?.[AppState.sortState.field];
      const vB = b[0]?.[AppState.sortState.field];
      if (vA == null && vB == null) return 0;
      if (vA == null) return 1;
      if (vB == null) return -1;
      if (typeof vA === 'number' && typeof vB === 'number')
        return AppState.sortState.direction === 'asc' ? vA - vB : vB - vA;
      const cmp = String(vA).toLowerCase().localeCompare(String(vB).toLowerCase(), 'pt-PT');
      return AppState.sortState.direction === 'asc' ? cmp : -cmp;
    });
  }

  const totalPages = Math.ceil(filteredGroups.length / PAGE_SIZE);
  const start      = (AppState.currentPage - 1) * PAGE_SIZE;
  const slice      = filteredGroups.slice(start, start + PAGE_SIZE);
  const showCols   = _visibleCols(fields);

  if (AppState.activeFilters.type === 'unique') {
    const allRecs     = slice.flatMap(g => g);
    const totalUnique = AppState.selectedSumField
      ? filteredGroups.flatMap(g => g).reduce((s, r) => s + (typeof r[AppState.selectedSumField] === 'number' ? r[AppState.selectedSumField] : 0), 0)
      : 0;

    el.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:16px;padding:12px;background:#f0f8f4;border-radius:8px;border:1px solid #c5e8a0;">
        <div style="display:flex;align-items:center;gap:16px">
          <span style="display:inline-block;background:#4caf50;color:white;padding:6px 14px;border-radius:20px;font-size:12px;font-weight:600;">Registos únicos</span>
          <span style="font-size:14px;color:#555;font-weight:500;">∑ montante: ${fmt(totalUnique)}</span>
        </div>
        <div style="display:flex;align-items:center;gap:10px">
          <div style="display:flex;flex-direction:column;gap:2px;text-align:right">
            <div style="font-weight:600;color:#1e40af;font-size:12px">📊 Exportar dados</div>
            <div style="font-size:10px;color:#6b7280">CSV, JSON, XML, XLSX, PDF</div>
          </div>
          <button data-action="open-export" style="padding:8px 14px;background:#2563eb;color:white;border:none;border-radius:6px;cursor:pointer;font-weight:600;white-space:nowrap;transition:all 0.2s;font-size:12px">⬇️ Exportar</button>
        </div>
      </div>
      <div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;">
        <thead><tr><th style="padding:8px;width:40px;text-align:center;"></th>${_headerCells(showCols)}</tr></thead>
        <tbody>${allRecs.map(r => `<tr>
          <td style="padding:8px;text-align:center;"><span style="cursor:help;font-size:20px;" title="Registo único">✓</span></td>
          ${_rowCells(r, showCols)}
        </tr>`).join('')}</tbody>
      </table></div>`;

    setPagination(filteredGroups.length > PAGE_SIZE ? 'flex' : 'none', `Registos ${start+1}–${Math.min(start+PAGE_SIZE, filteredGroups.length)} de ${fmtN(filteredGroups.length)}`);
    renderPagination(totalPages, () => renderDuplicates(fields));
    setupFilters(() => renderDuplicates(fields));
    return;
  }

  const totalDuplicates = AppState.selectedSumField
    ? filteredGroups.reduce((sum, g) => sum + g.reduce((s, r) => s + (typeof r[AppState.selectedSumField] === 'number' ? r[AppState.selectedSumField] : 0), 0), 0)
    : 0;

  const groupsHtml = slice.map(group => {
    const total = AppState.selectedSumField
      ? group.reduce((s, r) => s + (typeof r[AppState.selectedSumField] === 'number' ? r[AppState.selectedSumField] : 0), 0)
      : 0;
    const groupRecs = AppState.sortState.field ? sortRecords([...group], AppState.sortState.field, AppState.sortState.direction) : group;
    return `<div class="group-block">
      <div class="group-header">
        <span class="group-count">${group.length} duplicado</span>
        <span class="group-total">💰 Montante: ${fmt(total)}</span>
      </div>
      <div style="overflow-x:auto"><table>
        <thead><tr>${_headerCells(showCols)}</tr></thead>
        <tbody>${_rows(groupRecs, showCols)}</tbody>
      </table></div>
    </div>`;
  }).join('');

  el.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:16px;padding:12px;background:#ffe8e8;border-radius:8px;border:1px solid #ffb3b3;">
      <div style="display:flex;align-items:center;gap:16px">
        <span style="display:inline-block;background:#d32f2f;color:white;padding:6px 14px;border-radius:20px;font-size:12px;font-weight:600;">Registos duplicados</span>
        <span style="font-size:14px;color:#555;font-weight:500;">💰 Montante: ${fmt(totalDuplicates)}</span>
      </div>
      <div style="display:flex;align-items:center;gap:10px">
        <div style="display:flex;flex-direction:column;gap:2px;text-align:right">
          <div style="font-weight:600;color:#1e40af;font-size:12px">📤 Exportar dados</div>
          <div style="font-size:10px;color:#6b7280">CSV, JSON, XML, XLSX, PDF</div>
        </div>
        <button data-action="open-export" style="padding:8px 14px;background:#2563eb;color:white;border:none;border-radius:6px;cursor:pointer;font-weight:600;white-space:nowrap;transition:all 0.2s;font-size:12px">⬇ Exportar</button>
      </div>
    </div>
    ${groupsHtml}`;

  setPagination(filteredGroups.length > PAGE_SIZE ? 'flex' : 'none', `Grupos ${start+1}–${Math.min(start+PAGE_SIZE, filteredGroups.length)} de ${fmtN(filteredGroups.length)}`);
  renderPagination(totalPages, () => renderDuplicates(fields));
  setupFilters(() => renderDuplicates(fields));
  setupTableKeyNav(el);
}

// ── Filtros ────────────────────────────────────────────────────
export function setFilterTypeFromCard(type) {
  AppState.activeFilters.type = type;
  AppState.currentPage = 1;
  _setFilterCards(type);
  renderDuplicates(Array.from(AppState.checkedFields));
}

export function setupFilters(callback) {
  const filterSection = document.getElementById('filters-section');
  if (!filterSection) return;

  show('filters-section');

  const wrapper = document.getElementById('filter-exactcount-wrapper');
  if (wrapper) wrapper.style.display = AppState.activeFilters.type === 'duplicates' ? 'block' : 'none';

  const searchInput     = document.getElementById('filter-search');
  const exactCountInput = document.getElementById('filter-exactcount');
  const minAmtInput     = document.getElementById('filter-minamt');
  const maxAmtInput     = document.getElementById('filter-maxamt');

  buildSearchFieldPanel();

  const applyFilters = () => {
    AppState.activeFilters.search     = (searchInput?.value || '').toLowerCase();
    AppState.activeFilters.exactCount = exactCountInput?.value ? parseInt(exactCountInput.value) : null;
    AppState.activeFilters.minAmount  = minAmtInput?.value ? parseFloat(minAmtInput.value) : null;
    AppState.activeFilters.maxAmount  = maxAmtInput?.value ? parseFloat(maxAmtInput.value) : null;
    AppState.currentPage = 1;
    callback();
  };

  [searchInput, exactCountInput, minAmtInput, maxAmtInput].forEach(input => {
    if (!input) return;
    input.addEventListener('input', () => {
      clearTimeout(AppState.filterDebounceTimer);
      AppState.filterDebounceTimer = setTimeout(applyFilters, 400);
    });
  });
}

export function buildSearchFieldPanel() {
  const panel = document.getElementById('search-field-panel');
  if (!panel || !AppState.availableFields.length) return;

  panel.innerHTML = `
    <div style="padding:6px 12px 4px;font-size:10px;color:var(--muted);font-weight:700;text-transform:uppercase;letter-spacing:.06em;border-bottom:1px solid #f0f0f0;margin-bottom:4px">Pesquisar em:</div>
    ${AppState.availableFields.map(f => {
      const checked = AppState.activeFilters.searchFields.includes(f.key);
      const icon = f.desc ? f.desc.split(' ')[0] : '❓';
      return `<label title="${f.desc || f.key}" style="display:flex;align-items:center;gap:9px;padding:7px 12px;cursor:pointer;font-size:12px;color:var(--dark);user-select:none;transition:background .12s${checked ? ';background:#f2f9e8' : ''}" onmouseenter="this.style.background='${checked ? '#eaf5d6' : '#f7f8f6'}'" onmouseleave="this.style.background='${checked ? '#f2f9e8' : 'transparent'}'">
        <input type="checkbox" value="${f.key}"
               style="accent-color:var(--green);width:13px;height:13px;cursor:pointer;flex-shrink:0"
               ${checked ? 'checked' : ''}>
        <span style="font-family:monospace;font-size:12px;font-weight:${checked ? '700' : '500'};color:${checked ? 'var(--green-dark)' : 'var(--dark)'};flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${f.key}</span>
        <span style="font-size:13px;opacity:.5;flex-shrink:0">${icon}</span>
      </label>`;
    }).join('')}`;
}

export function onSearchFieldChange() {
  const panel = document.getElementById('search-field-panel');
  const checked = [...panel.querySelectorAll('input[type=checkbox]:checked')].map(c => c.value);
  AppState.activeFilters.searchFields = checked;
  updateSearchFieldBtn();
  AppState.currentPage = 1;
  AppState.activeFilters.search = (document.getElementById('filter-search')?.value || '').toLowerCase();
  renderDuplicates(Array.from(AppState.checkedFields));
}

export function updateSearchFieldBtn() {
  const label = document.getElementById('search-field-label');
  if (!label) return;
  const n = AppState.activeFilters.searchFields.length;
  label.textContent = n === 0 ? 'Todos os campos' : n === 1 ? '1 campo' : `${n} campos`;
  const btn = document.getElementById('search-field-btn');
  if (btn) {
    btn.style.borderColor = n > 0 ? 'var(--green)' : 'var(--gray-border)';
    btn.style.color       = n > 0 ? 'var(--green-dark)' : 'var(--muted)';
  }
}

export function toggleSearchFieldPanel() {
  const panel = document.getElementById('search-field-panel');
  if (!panel) return;
  const isOpen = panel.style.display !== 'none';
  panel.style.display = isOpen ? 'none' : 'block';
  if (!isOpen) {
    buildSearchFieldPanel();
    setTimeout(() => {
      document.addEventListener('click', function closePanel(e) {
        if (!document.getElementById('search-field-wrapper')?.contains(e.target)) {
          panel.style.display = 'none';
          document.removeEventListener('click', closePanel);
        }
      });
    }, 0);
  }
}

export function clearFilters() {
  AppState.activeFilters = { type: 'all', search: '', searchFields: [], exactCount: null, minAmount: null, maxAmount: null };
  _setFilterCards('all');
  document.getElementById('filter-search').value      = '';
  document.getElementById('filter-exactcount').value  = '';
  document.getElementById('filter-minamt').value      = '';
  document.getElementById('filter-maxamt').value      = '';
  updateSearchFieldBtn();
  AppState.currentPage = 1;
  renderDuplicates(Array.from(AppState.checkedFields));
}

// ── Ordenação ──────────────────────────────────────────────────
export function sortRecords(records, field, direction) {
  if (!field) return records;
  return [...records].sort((a, b) => {
    const vA = a[field], vB = b[field];
    if (vA == null && vB == null) return 0;
    if (vA == null) return 1;
    if (vB == null) return -1;
    if (typeof vA === 'number' && typeof vB === 'number')
      return direction === 'asc' ? vA - vB : vB - vA;
    const cmp = String(vA).toLowerCase().localeCompare(String(vB).toLowerCase(), 'pt-PT');
    return direction === 'asc' ? cmp : -cmp;
  });
}

export function setSortField(field) {
  if (AppState.sortState.field === field) {
    AppState.sortState.direction = AppState.sortState.direction === 'asc' ? 'desc' : 'asc';
  } else {
    AppState.sortState.field     = field;
    AppState.sortState.direction = 'asc';
  }
  AppState.currentPage = 1;
  renderDuplicates(Array.from(AppState.checkedFields));
}

export function getSortIndicator(field) {
  if (AppState.sortState.field !== field) return '';
  return AppState.sortState.direction === 'asc' ? ' 🔼' : ' 🔽';
}

// ── Filtros de grupos ──────────────────────────────────────────
export function getFilteredGroups(groups) {
  return groups.filter(group => {
    if (AppState.activeFilters.exactCount !== null && group.length !== AppState.activeFilters.exactCount) return false;
    if (AppState.activeFilters.search) {
      const hasMatch = group.some(record => {
        const vals = AppState.activeFilters.searchFields.length
          ? AppState.activeFilters.searchFields.map(k => record[k])
          : Object.values(record);
        return vals.some(val => String(val ?? '').toLowerCase().includes(AppState.activeFilters.search));
      });
      if (!hasMatch) return false;
    }
    if (AppState.selectedSumField && (AppState.activeFilters.minAmount !== null || AppState.activeFilters.maxAmount !== null)) {
      const total = group.reduce((s, r) =>
        s + (typeof r[AppState.selectedSumField] === 'number' ? r[AppState.selectedSumField] : 0), 0);
      if (AppState.activeFilters.minAmount !== null && total < AppState.activeFilters.minAmount) return false;
      if (AppState.activeFilters.maxAmount !== null && total > AppState.activeFilters.maxAmount) return false;
    }
    return true;
  });
}

// ── Helpers privados ───────────────────────────────────────────
function _visibleCols(fields) {
  const ctxKeys = AppState.availableFields.map(f => f.key);
  return [...new Set([...fields, ...ctxKeys])].filter(k => k in (AppState.rawData[0] || {}));
}

function _headerCells(cols) {
  return cols.map(f =>
    `<th style="cursor:pointer;user-select:none;padding:8px;background:#f5f5f5;border-bottom:2px solid #ddd;" data-sort="${f}">${f.replace(/_/g,' ')}${getSortIndicator(f)}</th>`
  ).join('');
}

function _rows(records, cols) {
  return records.map(r => `<tr>${_rowCells(r, cols)}</tr>`).join('');
}

function _rowCells(r, cols) {
  return cols.map(f => {
    const v = r[f];
    if (typeof v === 'number')
      return `<td class="${v < 0 ? 'amount-neg' : 'amount-pos'}">${fmt(v)}</td>`;
    return `<td class="${['numero_documento','atribuicao','conta','referencia'].includes(f) ? 'mono' : ''}">${v ?? '—'}</td>`;
  }).join('');
}

function _rowCellsWithAnomalies(r, cols, anomalyMap) {
  return cols.map(f => {
    const v = r[f];
    const reason = anomalyMap[f];
    if (reason) {
      const display = typeof v === 'number' ? fmt(v) : escHtml(String(v ?? '—'));
      return `<td class="cell-anomaly" title="${escHtml(reason)}">${display}</td>`;
    }
    if (typeof v === 'number')
      return `<td class="${v < 0 ? 'amount-neg' : 'amount-pos'}">${fmt(v)}</td>`;
    return `<td class="${['numero_documento','atribuicao','conta','referencia'].includes(f) ? 'mono' : ''}">${v ?? '—'}</td>`;
  }).join('');
}

function detectTypeAnomalies(records, fields) {
  if (!records.length || !fields.length) { AppState.anomalyRecords = []; return; }
  const currentYear = new Date().getFullYear();

  // Build dominant-type profile per field
  const profiles = {};
  for (const field of fields) {
    const counts = { numeric: 0, date: 0, text: 0 };
    let allPositive = true;
    let nonEmpty = 0;
    for (const r of records) {
      const t = classifyValue(r[field]);
      if (t === 'empty') continue;
      nonEmpty++;
      if (t in counts) counts[t]++;
      if (t === 'numeric' && typeof r[field] === 'number' && r[field] < 0) allPositive = false;
    }
    if (nonEmpty === 0) { profiles[field] = { dominant: null }; continue; }
    const [topType, topCount] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    profiles[field] = {
      dominant:    topCount / nonEmpty >= 0.6 ? topType : null,
      allPositive: allPositive && counts.numeric > 0,
    };
  }

  const TYPE_MISMATCH_REASON = {
    date:    { numeric: 'Data em coluna numérica',   text: 'Data em coluna de texto'    },
    numeric: { date:    'Número em coluna de datas', text: 'Número em coluna de texto'   },
    text:    { numeric: 'Texto em coluna numérica',  date:  'Texto em coluna de datas'  },
  };

  const result = [];
  for (const record of records) {
    const anomFields = [];
    for (const field of fields) {
      const prof = profiles[field];
      if (!prof || !prof.dominant) continue;
      const v = record[field];
      const t = classifyValue(v);
      if (t === 'empty') continue;

      if (t !== prof.dominant) {
        const reason = TYPE_MISMATCH_REASON[t]?.[prof.dominant] ?? `Tipo inesperado (${t} em coluna ${prof.dominant})`;
        anomFields.push({ field, value: v, dominantType: prof.dominant, actualType: t, reason });
      } else if (t === 'date') {
        const yearMatch = String(v).match(/(\d{4})/);
        if (yearMatch) {
          const year = parseInt(yearMatch[1]);
          if (year > currentYear + 5)
            anomFields.push({ field, value: v, dominantType: 'date', actualType: 'date', reason: `Data futura implausível (${year})` });
          else if (year < 1900)
            anomFields.push({ field, value: v, dominantType: 'date', actualType: 'date', reason: `Data histórica implausível (${year})` });
        }
      } else if (t === 'numeric' && prof.allPositive) {
        const num = typeof v === 'number' ? v : parseFloat(String(v).replace(/[€$£\s]/g, '').replace(',', '.'));
        if (!isNaN(num) && num < 0)
          anomFields.push({ field, value: v, dominantType: 'numeric', actualType: 'numeric', reason: 'Valor negativo em coluna sempre positiva' });
      }
    }
    if (anomFields.length) result.push({ record, fields: anomFields });
  }
  AppState.anomalyRecords = result;
}

function _setFilterCards(type) {
  document.getElementById('card-all')?.classList.toggle('selected',       type === 'all');
  document.getElementById('card-dups')?.classList.toggle('selected',      type === 'duplicates');
  document.getElementById('card-unique')?.classList.toggle('selected',    type === 'unique');
  document.getElementById('card-suspicious')?.classList.toggle('selected', type === 'suspicious');
}
