/* ============================================================
   G-FinanceSuite — Op4: Ferramentas de Documentos
   Converter formatos e mesclar ficheiros.
   ============================================================ */

import { AppState } from '../state.js';
import { escHtml, fmtN } from './ui.js';
import { Logger } from './logger.js';
import { parseCsv } from './loaders.js';
import { exportToCSV, exportToJSON, exportToXML, exportToXLSX, exportToPDF } from './export.js';

// ── Parsing ───────────────────────────────────────────────────

async function parseOp4File(file) {
  if (/\.csv$/i.test(file.name)) {
    return new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = e => {
        try {
          const records = parseCsv(e.target.result, file.name);
          const columns = records.length ? Object.keys(records[0]) : [];
          res({ name: file.name, records, columns, size: file.size });
        } catch (err) { rej(err); }
      };
      fr.onerror = () => rej(new Error(`Erro ao ler ${file.name}`));
      fr.readAsText(file, 'utf-8');
    });
  }

  if (/\.json$/i.test(file.name)) {
    return new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = e => {
        try {
          const obj = JSON.parse(e.target.result);
          const arr = obj.registos || obj.data || obj.records || (Array.isArray(obj) ? obj : []);
          if (!arr.length) throw new Error('Nenhum registo encontrado');
          const columns = Object.keys(arr[0]);
          res({ name: file.name, records: arr, columns, size: file.size });
        } catch (err) { rej(err); }
      };
      fr.onerror = () => rej(new Error(`Erro ao ler ${file.name}`));
      fr.readAsText(file, 'utf-8');
    });
  }

  if (/\.(xlsx|xls)$/i.test(file.name)) {
    return new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = e => {
        try {
          const XLSX = window.XLSX;
          if (!XLSX) throw new Error('Biblioteca XLSX não disponível. Aguarde e tente novamente.');
          const wb      = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
          const ws      = wb.Sheets[wb.SheetNames[0]];
          const records = XLSX.utils.sheet_to_json(ws, { defval: null });
          const columns = records.length ? Object.keys(records[0]) : [];
          res({ name: file.name, records, columns, size: file.size });
        } catch (err) { rej(err); }
      };
      fr.onerror = () => rej(new Error(`Erro ao ler ${file.name}`));
      fr.readAsArrayBuffer(file);
    });
  }

  throw new Error(`Formato não suportado: ${file.name}. Use CSV, JSON, XLSX ou XLS.`);
}

// ── Análise de campos ─────────────────────────────────────────

function analyseFields(files) {
  const sets   = files.map(f => new Set(f.columns));
  const all    = [...new Set(files.flatMap(f => f.columns))];
  const common = all.filter(c => sets.every(s => s.has(c)));
  return { compatible: all.length === common.length, all, common };
}

// ── Conversor ─────────────────────────────────────────────────

function runConvert() {
  const files = AppState.op4.files;
  if (!files.length) { alert('Adicione pelo menos um ficheiro.'); return; }
  const format = AppState.op4.format;
  const ts     = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
  files.forEach(f => {
    const name = f.name.replace(/\.[^.]+$/, '') + `_${ts}`;
    if      (format === 'csv')  exportToCSV(f.records, f.columns, name);
    else if (format === 'json') exportToJSON(f.records, f.columns, name);
    else if (format === 'xml')  exportToXML(f.records, f.columns, name);
    else if (format === 'xlsx') exportToXLSX(f.records, f.columns, name);
    else if (format === 'pdf')  exportToPDF(f.records, f.columns, name);
  });
  Logger.info(`Op4 Converter: ${files.length} ficheiro(s) → ${format.toUpperCase()}`);
}

// ── Merge directo ─────────────────────────────────────────────

function runMerge() {
  const files      = AppState.op4.files;
  const { common } = analyseFields(files);
  const merged     = files.flatMap(f => f.records);
  const ts         = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
  const name       = `merge_resultado_${ts}`;
  const format     = AppState.op4.format;
  if      (format === 'csv')  exportToCSV(merged, common, name);
  else if (format === 'json') exportToJSON(merged, common, name);
  else if (format === 'xml')  exportToXML(merged, common, name);
  else if (format === 'xlsx') exportToXLSX(merged, common, name);
  else if (format === 'pdf')  exportToPDF(merged, common, name);
  Logger.info(`Op4 Merge: ${merged.length} registos → ${format.toUpperCase()}`);
}

// ── Merge com mapeamento ──────────────────────────────────────

function runMergeWithMap() {
  const files   = AppState.op4.files;
  const map     = AppState.op4.fieldMap;
  const { all } = analyseFields(files);

  const merged = files.flatMap(f => {
    const fileMap = map[f.name] || {};
    return f.records.map(rec => {
      const out = {};
      all.forEach(canonical => { out[canonical] = null; });
      all.forEach(canonical => {
        const src = fileMap[canonical];
        if (src && src in rec) out[canonical] = rec[src];
      });
      return out;
    });
  });

  const ts     = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
  const name   = `merge_mapeado_${ts}`;
  const format = AppState.op4.format;
  if      (format === 'csv')  exportToCSV(merged, all, name);
  else if (format === 'json') exportToJSON(merged, all, name);
  else if (format === 'xml')  exportToXML(merged, all, name);
  else if (format === 'xlsx') exportToXLSX(merged, all, name);
  else if (format === 'pdf')  exportToPDF(merged, all, name);
  Logger.info(`Op4 Merge mapeado: ${merged.length} registos → ${format.toUpperCase()}`);
}

// ── UI: mapeamento de campos ──────────────────────────────────

function renderOp4FieldMap() {
  const container = document.getElementById('op4-field-map-table');
  if (!container) return;
  const files   = AppState.op4.files;
  const { all } = analyseFields(files);

  files.forEach(f => {
    if (!AppState.op4.fieldMap[f.name]) AppState.op4.fieldMap[f.name] = {};
    all.forEach(canonical => {
      if (!(canonical in AppState.op4.fieldMap[f.name]))
        AppState.op4.fieldMap[f.name][canonical] = f.columns.includes(canonical) ? canonical : '';
    });
  });

  let html = `<table style="width:100%;border-collapse:collapse;font-size:12px">
    <thead><tr style="background:#f3f4f6">
      <th style="text-align:left;padding:8px 12px;border-bottom:1px solid #e5e7eb;color:#374151;font-weight:600;white-space:nowrap">Ficheiro / Campo</th>`;
  all.forEach(c => {
    html += `<th style="padding:8px 8px;border-bottom:1px solid #e5e7eb;color:#374151;font-weight:600;min-width:120px;white-space:nowrap">${escHtml(c)}</th>`;
  });
  html += `</tr></thead><tbody>`;

  files.forEach((f, fi) => {
    html += `<tr style="border-bottom:1px solid #f3f4f6;background:${fi % 2 === 0 ? 'white' : '#fafafa'}">
      <td style="padding:8px 12px;font-weight:600;color:#1c2526;font-size:11px;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escHtml(f.name)}">${escHtml(f.name)}</td>`;
    all.forEach(canonical => {
      const cur = AppState.op4.fieldMap[f.name][canonical] ?? '';
      html += `<td style="padding:4px 6px">
        <select data-file="${escHtml(f.name)}" data-canonical="${escHtml(canonical)}"
          style="width:100%;font-size:11px;border:1px solid #d1d5db;border-radius:4px;padding:3px 4px;color:#374151;background:white">
          <option value="">(ignorar)</option>
          ${f.columns.map(col => `<option value="${escHtml(col)}"${cur === col ? ' selected' : ''}>${escHtml(col)}</option>`).join('')}
        </select>
      </td>`;
    });
    html += '</tr>';
  });
  html += '</tbody></table>';
  container.innerHTML = html;
}

// ── UI: lista de ficheiros ────────────────────────────────────

function renderOp4FileList() {
  const list = document.getElementById('op4-file-list');
  if (!list) return;
  const files = AppState.op4.files;
  if (!files.length) { list.innerHTML = ''; return; }
  list.innerHTML = files.map((f, i) =>
    `<div style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:white;border:1px solid #e5e7eb;border-radius:8px;margin-bottom:8px">
      <div style="width:32px;height:32px;background:#eff6ff;border-radius:7px;display:flex;align-items:center;justify-content:center;font-size:15px;flex-shrink:0">📄</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:600;color:#1c2526;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(f.name)}</div>
        <div style="font-size:11px;color:#6b7280;margin-top:2px">${fmtN(f.records.length)} registos · ${f.columns.length} campos</div>
      </div>
      <button data-action="op4-remove" data-idx="${i}"
        style="padding:5px 9px;background:white;border:1px solid #e5e7eb;border-radius:6px;cursor:pointer;font-size:12px;color:#9ca3af"
        title="Remover">✕</button>
    </div>`
  ).join('');
}

// ── UI: estado do merge ───────────────────────────────────────

function _updateMergeStatus() {
  const statusEl = document.getElementById('op4-merge-status');
  const mapWrap  = document.getElementById('op4-field-map-wrap');
  const btnMerge = document.getElementById('btn-op4-merge');
  if (!statusEl) return;

  const files = AppState.op4.files;
  if (files.length < 2) {
    statusEl.innerHTML = '<span style="color:#9ca3af;font-size:13px">Adicione pelo menos 2 ficheiros para mesclar.</span>';
    if (mapWrap)  mapWrap.style.display = 'none';
    if (btnMerge) { btnMerge.disabled = true; btnMerge.style.opacity = '0.5'; btnMerge.style.cursor = 'not-allowed'; }
    return;
  }

  const { compatible, all, common } = analyseFields(files);
  if (compatible) {
    statusEl.innerHTML = `<span style="color:#16a34a;font-size:13px;font-weight:600">✓ Campos compatíveis (${all.length} campos)</span>`;
    if (mapWrap)  mapWrap.style.display = 'none';
    if (btnMerge) { btnMerge.disabled = false; btnMerge.style.opacity = '1'; btnMerge.style.cursor = 'pointer'; btnMerge.dataset.mode = 'direct'; }
  } else {
    const divergent = all.length - common.length;
    statusEl.innerHTML = `<span style="color:#d97706;font-size:13px;font-weight:600">⚠ ${divergent} campo(s) divergente(s) — defina o mapeamento abaixo</span>`;
    if (mapWrap)  { mapWrap.style.display = ''; renderOp4FieldMap(); }
    if (btnMerge) { btnMerge.disabled = false; btnMerge.style.opacity = '1'; btnMerge.style.cursor = 'pointer'; btnMerge.dataset.mode = 'mapped'; }
  }
}

// ── UI: tabs ──────────────────────────────────────────────────

function _setOp4Tab(tab) {
  AppState.op4.mode = tab;
  const convertPanel = document.getElementById('op4-convert-panel');
  const mergePanel   = document.getElementById('op4-merge-panel');
  if (convertPanel) convertPanel.style.display = tab === 'convert' ? '' : 'none';
  if (mergePanel)   mergePanel.style.display   = tab === 'merge'   ? '' : 'none';
  ['convert', 'merge'].forEach(t => {
    const btn = document.getElementById(`op4-tab-${t}`);
    if (!btn) return;
    const active = t === tab;
    btn.style.background  = active ? '#2563eb' : 'white';
    btn.style.color       = active ? 'white'   : '#374151';
    btn.style.borderColor = active ? '#2563eb' : '#d1d5db';
  });
}

// ── UI: formato ───────────────────────────────────────────────

function _setOp4Format(format) {
  AppState.op4.format = format;
  document.querySelectorAll('.op4-fmt-btn').forEach(btn => {
    const sel = btn.dataset.format === format;
    btn.style.borderColor = sel ? '#2563eb' : '#ddd';
    btn.style.background  = sel ? '#eff6ff' : 'white';
    btn.style.color       = sel ? '#2563eb' : '#6b7280';
    btn.style.fontWeight  = sel ? '700' : '500';
  });
}

// ── Exportados públicos ───────────────────────────────────────

export function clearOp4() {
  AppState.op4 = { files: [], mode: 'convert', format: 'xlsx', fieldMap: {} };
  renderOp4FileList();
  const fi = document.getElementById('op4-file-input');
  if (fi) fi.value = '';
  _setOp4Tab('convert');
  _setOp4Format('xlsx');
  const statusEl = document.getElementById('op4-merge-status');
  if (statusEl) statusEl.innerHTML = '<span style="color:#9ca3af;font-size:13px">Adicione pelo menos 2 ficheiros para mesclar.</span>';
  const mapWrap = document.getElementById('op4-field-map-wrap');
  if (mapWrap) mapWrap.style.display = 'none';
  const btnMerge = document.getElementById('btn-op4-merge');
  if (btnMerge) { btnMerge.disabled = true; btnMerge.style.opacity = '0.5'; btnMerge.style.cursor = 'not-allowed'; }
}

export function initOp4Events() {
  // File input
  document.getElementById('op4-file-input')?.addEventListener('change', async e => {
    const files = [...e.target.files];
    e.target.value = '';
    for (const f of files) {
      try {
        const parsed = await parseOp4File(f);
        const idx = AppState.op4.files.findIndex(x => x.name === parsed.name);
        if (idx >= 0) AppState.op4.files[idx] = parsed;
        else AppState.op4.files.push(parsed);
        Logger.info(`Op4: ${parsed.name} → ${parsed.records.length} registos`);
      } catch (err) {
        Logger.error(`Op4: ${err.message}`);
        alert(`Erro ao ler ${f.name}:\n${err.message}`);
      }
    }
    renderOp4FileList();
    if (AppState.op4.mode === 'merge') _updateMergeStatus();
  });

  // Drop zone
  const dz = document.getElementById('op4-dropzone');
  if (dz) {
    dz.addEventListener('dragover', e => {
      e.preventDefault();
      dz.style.borderColor = '#2563eb';
      dz.style.background  = '#eff6ff';
    });
    dz.addEventListener('dragleave', () => {
      dz.style.borderColor = '#d1d5db';
      dz.style.background  = '#f9fafb';
    });
    dz.addEventListener('drop', async e => {
      e.preventDefault();
      dz.style.borderColor = '#d1d5db';
      dz.style.background  = '#f9fafb';
      const files = [...e.dataTransfer.files].filter(f => /\.(csv|json|xlsx|xls)$/i.test(f.name));
      for (const f of files) {
        try {
          const parsed = await parseOp4File(f);
          const idx = AppState.op4.files.findIndex(x => x.name === parsed.name);
          if (idx >= 0) AppState.op4.files[idx] = parsed;
          else AppState.op4.files.push(parsed);
          Logger.info(`Op4 drop: ${parsed.name} → ${parsed.records.length} registos`);
        } catch (err) {
          Logger.error(`Op4: ${err.message}`);
        }
      }
      renderOp4FileList();
      if (AppState.op4.mode === 'merge') _updateMergeStatus();
    });
  }

  // File list: remove button delegation
  document.getElementById('op4-file-list')?.addEventListener('click', e => {
    const btn = e.target.closest('[data-action="op4-remove"]');
    if (!btn) return;
    AppState.op4.files.splice(parseInt(btn.dataset.idx, 10), 1);
    AppState.op4.fieldMap = {};
    renderOp4FileList();
    if (AppState.op4.mode === 'merge') _updateMergeStatus();
  });

  // Tabs
  document.getElementById('op4-tab-convert')?.addEventListener('click', () => _setOp4Tab('convert'));
  document.getElementById('op4-tab-merge')?.addEventListener('click',   () => { _setOp4Tab('merge'); _updateMergeStatus(); });

  // Format buttons — section-level delegation
  document.getElementById('op4-section')?.addEventListener('click', e => {
    const btn = e.target.closest('.op4-fmt-btn[data-format]');
    if (btn) _setOp4Format(btn.dataset.format);
  });

  // Convert
  document.getElementById('btn-op4-convert')?.addEventListener('click', runConvert);

  // Merge
  document.getElementById('btn-op4-merge')?.addEventListener('click', () => {
    const mode = document.getElementById('btn-op4-merge')?.dataset.mode;
    if (mode === 'mapped') runMergeWithMap(); else runMerge();
  });

  // Field map selects — delegation
  document.getElementById('op4-field-map-table')?.addEventListener('change', e => {
    const sel = e.target.closest('select[data-file][data-canonical]');
    if (!sel) return;
    const { file, canonical } = sel.dataset;
    if (!AppState.op4.fieldMap[file]) AppState.op4.fieldMap[file] = {};
    AppState.op4.fieldMap[file][canonical] = sel.value || null;
  });
}
