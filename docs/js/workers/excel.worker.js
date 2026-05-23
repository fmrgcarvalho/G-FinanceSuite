/* ============================================================
   G-FinanceSuite — Excel Web Worker
   Processa ficheiros Excel em thread separada para não bloquear o UI.
   ============================================================ */

try {
  importScripts('../lib/xlsx.full.min.js');
} catch (e) {
  importScripts('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js');
}

function log(level, msg) {
  self.postMessage({ type: 'log', level, msg });
}
function progress(pct, label, sub) {
  self.postMessage({ type: 'progress', pct, label, sub: sub || '' });
}

self.onmessage = function (e) {
  const { buffer } = e.data;

  try {
    progress(10, 'A descompactar workbook…', '');
    log('INFO', 'Worker iniciado — a processar ArrayBuffer…');

    const t0   = Date.now();
    const data = new Uint8Array(buffer);
    const wb   = XLSX.read(data, { type: 'array', cellDates: false, raw: true });
    log('INFO', `Workbook aberto em ${Date.now() - t0} ms — folhas: ${wb.SheetNames.join(', ')}`);

    // Obter folha
    const sheetName = wb.SheetNames[0];
    const sheetKeys = Object.keys(wb.Sheets);
    log('INFO', `SheetNames[0]: "${sheetName}" · chaves: ${sheetKeys.join(', ')}`);

    const ws = wb.Sheets[sheetName] || wb.Sheets[sheetKeys[0]];
    if (!ws) throw new Error(`Folha não encontrada. Chaves: ${sheetKeys.join(', ')}`);

    const ref = ws['!ref'] || 'NULO';
    log('INFO', `Folha: "${sheetName}" · ref: ${ref}`);
    progress(55, `A ler folha "${sheetName}"…`, `ref: ${ref}`);

    let rows = [];
    let t1;

    // Tentativa 1: raw:true
    t1 = Date.now();
    rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });
    log('INFO', `Tentativa 1 (raw:true): ${rows.length} linhas em ${Date.now() - t1} ms`);

    // Tentativa 2: raw:false
    if (rows.length < 2) {
      t1 = Date.now();
      rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: false });
      log('INFO', `Tentativa 2 (raw:false): ${rows.length} linhas em ${Date.now() - t1} ms`);
    }

    // Tentativa 3: leitura direta célula a célula
    if (rows.length < 2 && ws['!ref']) {
      log('WARN', 'sheet_to_json falhou — leitura direta de células…');
      t1 = Date.now();
      const range = XLSX.utils.decode_range(ws['!ref']);
      const nRows = range.e.r - range.s.r + 1;
      const nCols = range.e.c - range.s.c + 1;
      log('INFO', `Range: ${nRows} linhas × ${nCols} colunas`);
      rows = [];
      for (let R = range.s.r; R <= range.e.r; R++) {
        const row = [];
        for (let C = range.s.c; C <= range.e.c; C++) {
          const cell = ws[XLSX.utils.encode_cell({ r: R, c: C })];
          row.push(cell != null ? cell.v : null);
        }
        rows.push(row);
        if (R % 20000 === 0 && R > 0) {
          const pct = 55 + Math.round((R / range.e.r) * 35);
          progress(pct, 'Leitura direta…', `${R.toLocaleString()} de ${nRows.toLocaleString()} linhas`);
        }
      }
      log('INFO', `Tentativa 3 (direta): ${rows.length} linhas em ${Date.now() - t1} ms`);
    }

    // Tentativa 4: reler com sheetStubs
    if (rows.length < 2) {
      log('WARN', 'A reler workbook com sheetStubs:true…');
      t1 = Date.now();
      const wb2 = XLSX.read(data, { type: 'array', cellDates: false, cellFormula: false, sheetStubs: true });
      const ws2 = wb2.Sheets[wb2.SheetNames[0]];
      rows = XLSX.utils.sheet_to_json(ws2, { header: 1, defval: null, raw: true });
      log('INFO', `Tentativa 4 (sheetStubs): ${rows.length} linhas em ${Date.now() - t1} ms`);
    }

    if (rows.length < 2) {
      throw new Error(
        `Folha "${sheetName}" sem dados legíveis após 4 tentativas.\n` +
        `ref: ${ref} — verifica se o ficheiro não está protegido ou usa formato especial.`
      );
    }

    progress(95, 'A enviar dados…', `${rows.length.toLocaleString()} linhas`);
    log('INFO', `Worker concluído — a enviar ${rows.length} linhas para o UI thread.`);

    // Transferir o buffer de volta (mais eficiente que copiar)
    self.postMessage({ type: 'done', rows, sheetName }, []);

  } catch (err) {
    log('ERROR', `Worker error: ${err.message}`);
    if (err.stack) log('ERROR', err.stack.split('\n').slice(0, 3).join(' | '));
    self.postMessage({ type: 'error', msg: err.message });
  }
};
