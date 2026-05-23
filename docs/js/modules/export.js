/* ============================================================
   G-FinanceSuite — Módulo Export (Op1 + Op2)
   Exportação CSV/JSON/XML/XLSX/PDF para duplicados e reconciliação.
   Depende de: AppState, PDF_MAX_RECORDS (state.js), ui.js
   Logger acedido via window.Logger (shim temporário até Phase 7)
   ============================================================ */

import { AppState, PDF_MAX_RECORDS } from '../state.js';
import { fmt, fmtN } from './ui.js';

const L = () => window.Logger || console;

// ── IDs DOM necessários ────────────────────────────────────────
export const REQUIRED_IDS = [
  'export-modal', 'export-preview', 'export-fmt-pdf',
  'count-all', 'count-dups', 'count-unique',
];

// ── Modal Op1 ──────────────────────────────────────────────────
export function openExportModal() {
  const modal = document.getElementById('export-modal');
  if (!modal) return;
  modal.style.display = 'flex';
  AppState.exportState.dataType = 'all';
  AppState.exportState.format   = 'csv';
  updateExportCounts();
  setExportFormat('xlsx');
}

export function closeExportModal() {
  const modal = document.getElementById('export-modal');
  if (modal) modal.style.display = 'none';
}

export function setExportDataType(type) {
  AppState.exportState.dataType = type;
  updateExportCounts();
  updatePdfBtnState();
  updateExportPreview();
}

export function setExportFormat(format) {
  if (format === 'pdf' && document.getElementById('export-fmt-pdf')?.disabled) return;
  AppState.exportState.format = format;

  document.querySelectorAll('.export-fmt-btn').forEach(btn => {
    const sel = btn.getAttribute('data-format') === format;
    btn.style.borderColor = sel ? '#2563eb' : '#ddd';
    btn.style.background  = sel ? '#eff6ff' : 'white';
    btn.style.color       = sel ? '#2563eb' : '#999';
  });

  updateExportPreview();
}

export function updateExportCounts() {
  const countAll    = AppState.rawData.length;
  let   countDups   = 0;
  let   countUnique = AppState.rawData.length;

  if (AppState.dupGroups.length > 0) {
    countDups   = AppState.dupGroups.reduce((sum, g) => sum + g.length, 0);
    countUnique = countAll - countDups;
  }

  document.getElementById('count-all').textContent    = `${fmtN(countAll)} registos`;
  document.getElementById('count-dups').textContent   = `${fmtN(countDups)} registos`;
  document.getElementById('count-unique').textContent = `${fmtN(countUnique)} registos`;

  updatePdfBtnState({ countAll, countDups, countUnique });
}

export function updatePdfBtnState({ countAll, countDups, countUnique } = {}) {
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

  btn.disabled      = !allowed;
  btn.style.opacity = allowed ? '1' : '.38';
  btn.style.cursor  = allowed ? 'pointer' : 'not-allowed';
  btn.style.filter  = allowed ? 'none' : 'grayscale(1)';
  btn.title         = allowed ? '' : `PDF limitado a ${fmtN(PDF_MAX_RECORDS)} registos. Selecionados: ${fmtN(n)}. Use CSV ou XML para conjuntos maiores.`;
  if (!allowed && AppState.exportState.format === 'pdf') setExportFormat('xlsx');
}

export function updateExportPreview() {
  const preview = document.getElementById('export-preview');
  const format  = AppState.exportState.format;
  if (!preview) return;

  const texts = {
    csv:  '📊 CSV — Abrir em Excel ou Google Sheets',
    json: '📋 JSON — Para integração com outras ferramentas',
    xml:  '📁 XML — Formato estruturado para sistemas',
    xlsx: '📈 XLSX — Ficheiro Excel com formatação (sem limite)',
    pdf:  `📄 PDF — Relatório formatado (máx. ${fmtN(PDF_MAX_RECORDS)} registos)`,
  };
  preview.textContent = texts[format] || '';
}

export function getDataToExport() {
  const fields   = Array.from(AppState.checkedFields);
  const ctxKeys  = AppState.availableFields.map(f => f.key);
  const showCols = [...new Set([...fields, ...ctxKeys])].filter(k => k in (AppState.rawData[0] || {}));

  let data = [];
  if (AppState.exportState.dataType === 'all') {
    data = AppState.rawData;
  } else if (AppState.exportState.dataType === 'duplicates') {
    data = AppState.rawData.filter(r => AppState.dupGroups.some(g => g.some(gr => gr === r)));
  } else if (AppState.exportState.dataType === 'unique') {
    data = AppState.uniqueRecords;
  }

  return { data, columns: showCols };
}

export function executeExport() {
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
  L().info(`✅ Exportação em ${format.toUpperCase()} concluída: ${data.length} registos`);
}

// ── Formatos de exportação ─────────────────────────────────────
export function exportToCSV(data, columns, filename) {
  const header = columns.map(col => `"${col.replace(/"/g, '""')}"`).join(',');
  const rows = data.map(record =>
    columns.map(col => {
      const value = record[col];
      let s = '';
      if (value === null || value === undefined) s = '';
      else if (typeof value === 'number') s = String(value);
      else s = String(value).replace(/"/g, '""');
      if (s.includes(',') || s.includes('\n') || s.includes('"')) s = `"${s}"`;
      return s;
    }).join(',')
  ).join('\n');

  downloadFile(new Blob([header + '\n' + rows], { type: 'text/csv;charset=utf-8;' }), `${filename}.csv`);
}

export function exportToJSON(data, columns, filename) {
  const jsonData = data.map(record => {
    const obj = {};
    columns.forEach(col => { obj[col] = record[col] ?? null; });
    return obj;
  });
  downloadFile(new Blob([JSON.stringify(jsonData, null, 2)], { type: 'application/json;charset=utf-8;' }), `${filename}.json`);
}

export function exportToXML(data, columns, filename) {
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<G-FinanceSuite>\n';
  xml += `  <exported>${new Date().toISOString()}</exported>\n`;
  xml += `  <total>${data.length}</total>\n  <records>\n`;
  data.forEach(record => {
    xml += '    <record>\n';
    columns.forEach(col => {
      const v = String(record[col] ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
      xml += `      <${col}>${v}</${col}>\n`;
    });
    xml += '    </record>\n';
  });
  xml += '  </records>\n</G-FinanceSuite>';
  downloadFile(new Blob([xml], { type: 'application/xml;charset=utf-8;' }), `${filename}.xml`);
}

export function exportToXLSX(data, columns, filename) {
  try {
    if (typeof window.XLSX === 'undefined') {
      L().error('Biblioteca XLSX não carregou');
      alert('⚠️ Biblioteca XLSX ainda a carregar. Tenta novamente em alguns segundos.');
      return;
    }
    const XLSX   = window.XLSX;
    const wsData = [columns, ...data.map(r => columns.map(c => r[c] ?? ''))];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!cols'] = columns.map(() => ({ wch: 15 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Dados');
    wb.Props = { Title: 'G-FinanceSuite - Exportação de Dados', Author: 'G-FinanceSuite', CreatedDate: new Date() };
    XLSX.writeFile(wb, `${filename}.xlsx`);
    L().info(`✅ XLSX exportado com sucesso: ${data.length} registos`);
  } catch (err) {
    L().error(`Erro na exportação XLSX: ${err instanceof Error ? err.message : String(err)}`);
    alert('Erro ao exportar XLSX:\n' + (err instanceof Error ? err.message : String(err)));
  }
}

export function exportToPDF(data, columns, filename) {
  try {
    if (typeof window.jspdf === 'undefined') {
      alert('⚠️ Biblioteca PDF ainda a carregar. Tenta novamente em alguns segundos.');
      return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'landscape' });

    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 12, contW = pageW - margin * 2;
    const fSize = 8, rowH = 8, hdrH = 9, cellP = 2;

    doc.setFontSize(fSize);
    const charW = doc.getStringUnitWidth('W') * fSize / doc.internal.scaleFactor;

    const sampleSize = Math.min(data.length, 200);
    const maxLens = columns.map(col => {
      let max = col.length;
      for (let i = 0; i < sampleSize; i++) {
        const v = data[i][col];
        const len = v == null ? 1 : String(v).length;
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

    const footerY = pageH - 7, docHdrH = 20, tableTopY = margin + docHdrH;
    const usableH = footerY - tableTopY - hdrH - 2;
    const rowsPerPg = Math.max(1, Math.floor(usableH / rowH));
    const totalPages = Math.ceil(data.length / rowsPerPg);

    const drawDocHeader = () => {
      doc.setFontSize(13); doc.setFont(undefined, 'bold'); doc.setTextColor(28, 37, 38);
      doc.text('G-FinanceSuite — Relatório de Exportação', margin, margin + 7);
      doc.setFontSize(7.5); doc.setFont(undefined, 'normal'); doc.setTextColor(110);
      doc.text(`Gerado: ${new Date().toLocaleString('pt-PT')}   |   Registos: ${fmtN(data.length)}   |   Colunas: ${columns.length}`, margin, margin + 14);
      doc.setDrawColor(200); doc.line(margin, margin + 17, pageW - margin, margin + 17);
    };

    const drawTableHeader = (y) => {
      doc.setFontSize(fSize); doc.setFont(undefined, 'bold');
      doc.setFillColor(37, 99, 235); doc.setTextColor(255, 255, 255);
      let x = margin;
      columns.forEach((col, i) => {
        doc.rect(x, y, colW[i], hdrH, 'F');
        doc.text(trunc(col, colW[i]), x + cellP, y + hdrH - cellP - 1);
        x += colW[i];
      });
    };

    const drawFooter = (pg) => {
      doc.setFontSize(7); doc.setFont(undefined, 'normal'); doc.setTextColor(150);
      doc.text('© 2026 G-FinanceSuite', margin, footerY);
      const pgTxt = `${pg} / ${totalPages}`;
      const pgW = doc.getStringUnitWidth(pgTxt) * 7 / doc.internal.scaleFactor;
      doc.text(pgTxt, pageW - margin - pgW, footerY);
    };

    drawDocHeader();
    drawTableHeader(tableTopY);
    let rowY = tableTopY + hdrH, page = 1, rowCount = 0;

    data.forEach(record => {
      if (rowCount >= rowsPerPg) {
        drawFooter(page); doc.addPage(); page++; rowCount = 0;
        drawTableHeader(margin + 5); rowY = margin + 5 + hdrH;
      }

      doc.setFontSize(fSize); doc.setFont(undefined, 'normal');
      if (rowCount % 2 === 1) { doc.setFillColor(245, 247, 250); doc.rect(margin, rowY, contW, rowH, 'F'); }
      doc.setTextColor(40);
      let x = margin;
      columns.forEach((col, i) => {
        const val = record[col];
        const str = val == null ? '—' : typeof val === 'number' ? fmt(val) : String(val);
        doc.text(trunc(str, colW[i]), x + cellP, rowY + rowH - cellP - 1);
        x += colW[i];
      });
      doc.setDrawColor(220); doc.line(margin, rowY + rowH, pageW - margin, rowY + rowH);
      rowY += rowH; rowCount++;
    });

    drawFooter(page);
    doc.save(`${filename}.pdf`);
  } catch (error) {
    console.error('Erro ao gerar PDF:', error);
    alert('⚠️ Erro ao gerar PDF. Tenta novamente.');
  }
}

export function downloadFile(blob, filename) {
  const url  = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href     = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
