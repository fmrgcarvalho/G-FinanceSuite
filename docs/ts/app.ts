/* ============================================================
   G-FinanceSuite — Duplicate Detection & Reconciliation
   TypeScript Version
   ============================================================ */

/* --------------------------------------------------------------
   TIPOS E INTERFACES
   -------------------------------------------------------------- */

interface LogEntry {
  ts: string;
  level: 'INFO' | 'WARN' | 'ERROR';
  msg: string;
}

interface FileQueueItem {
  file: File;
  data: unknown | null;
  status: 'pending' | 'processing' | 'success' | 'error';
  mapping: Record<number, string> | null;
  progress: number;
  error: string | null;
}

interface FieldInfo {
  key: string;
  label: string;
  desc?: string;
}

interface Mapping {
  [filename: string]: Record<number, string>;
}

interface FileData {
  records: Record<string, unknown>[];
  mapping: Record<number, string>;
}

interface FileDataMap {
  [filename: string]: FileData;
}

interface FilterState {
  type: 'all' | 'duplicates' | 'unique';
  search: string;
  exactCount: number | null;
  minAmount: number | null;
  maxAmount: number | null;
}

interface SortState {
  field: string | null;
  direction: 'asc' | 'desc';
}

interface ExportState {
  dataType: 'all' | 'duplicates' | 'unique';
  format: 'csv' | 'json' | 'xml' | 'pdf';
}

interface DataRecord {
  [key: string]: unknown;
}

interface ConsolidatedFile {
  name: string;
  records: number;
  status: 'success' | 'error';
}

interface ExportData {
  data: DataRecord[];
  columns: string[];
}

/* --------------------------------------------------------------
   LOGGER
   -------------------------------------------------------------- */

interface ILogger {
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
  separator(lbl: string): void;
  all(): LogEntry[];
  clear(): void;
}

const Logger = (() => {
  const entries: LogEntry[] = [];
  let hasError: boolean = false;

  const ts = (): string => new Date().toISOString().replace('T', ' ').substring(0, 23);

  function push(level: LogEntry['level'], msg: string): void {
    const entry: LogEntry = { ts: ts(), level, msg };
    entries.push(entry);
    render(entry);
    updateHeader();
    if (level === 'ERROR') {
      hasError = true;
      const logPanel = document.getElementById('log-panel');
      const logDot = document.getElementById('log-dot');
      if (logPanel) logPanel.classList.remove('collapsed');
      if (logDot) logDot.className = 'log-dot error';
    }
    const consoleMethod = level === 'ERROR' ? 'error' : level === 'WARN' ? 'warn' : 'log';
    console[consoleMethod as keyof typeof console](`[${level}] ${msg}`);
  }

  function render(entry: LogEntry): void {
    const body = document.getElementById('log-body');
    if (!body) return;

    const el = document.createElement('div');
    el.className = `log-entry ${entry.level}`;
    el.innerHTML = `<span class="log-ts">${entry.ts.substring(11)}</span><span class="log-msg">${esc(entry.msg)}</span>`;
    body.appendChild(el);
    body.scrollTop = body.scrollHeight;
  }

  function updateHeader(): void {
    const logCount = document.getElementById('log-count');
    const logDot = document.getElementById('log-dot');

    if (logCount) {
      logCount.textContent = `${entries.length} entrada${entries.length !== 1 ? 's' : ''}`;
    }
    if (!hasError && logDot) {
      logDot.className = entries.length ? 'log-dot' : 'log-dot idle';
    }
  }

  const esc = (s: string): string => String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  return {
    info: (msg: string) => push('INFO', msg),
    warn: (msg: string) => push('WARN', msg),
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
  const panel = document.getElementById('log-panel');
  const chevron = document.getElementById('log-chevron');
  panel.classList.toggle('collapsed');
  // Atualizar ícone: ⬇️ quando fechado, ⬆️ quando aberto
  chevron.textContent = panel.classList.contains('collapsed') ? '⬇️' : '⬆️';
}

function exportLog()  {
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
   SEM MODEL_FIELDS ESTÁTICOS
   Os campos são gerados dinamicamente a partir do ficheiro.
   COLUMN_ALIASES serve apenas para sugerir nomes normalizados.
   -------------------------------------------------------------- */

// Detecção dinâmica — sem lista fixa de DATE_FIELDS

/* --------------------------------------------------------------
   ALIASES PARA AUTO-SUGESTÃO DE MAPEAMENTO
   -------------------------------------------------------------- */
const COLUMN_ALIASES = {
  // numero_documento
  'numero documento':'numero_documento', 'n documento':'numero_documento',
  'nr documento':'numero_documento',     'no documento':'numero_documento',
  'num documento':'numero_documento',    'documento':'numero_documento',
  'ndoc':'numero_documento',             'nr doc':'numero_documento',
  'no doc':'numero_documento',           'n doc':'numero_documento',
  'num doc':'numero_documento',          'doc':'numero_documento',

  // tipo_documento
  'tipo documento':'tipo_documento',  'tipo de documento':'tipo_documento',
  'tipo doc':'tipo_documento',        'tp':'tipo_documento', 'tipo':'tipo_documento',

  // data_documento
  'data documento':'data_documento',  'data do documento':'data_documento',
  'data doc':'data_documento',        'dt documento':'data_documento', 'dt doc':'data_documento',

  // montante
  'montante':'montante',
  'montante em moeda interna':'montante',  'montante em moeda intern':'montante',
  'montante ml':'montante',
  'montante em moeda do documento':'montante', 'montante moeda doc':'montante',
  'montante doc':'montante',  'valor':'montante',  'importe':'montante',  'amount':'montante',

  // moeda
  'moeda':'moeda',  'moeda do documento':'moeda',
  'moeda do doc':'moeda',  'moeda doc':'moeda',  'currency':'moeda',

  // texto
  'texto':'texto',  'text':'texto',  'descricao':'texto',
  'descricao movimento':'texto',  'descr':'texto',

  // atribuicao
  'atribuicao':'atribuicao',  'atrib':'atribuicao',
  'assignment':'atribuicao',  'zuordnung':'atribuicao',

  // conta
  'conta':'conta',  'conta do razao':'conta',
  'conta razao':'conta',  'account':'conta',  'konto':'conta',

  // referencia
  'referencia':'referencia',  'referencia do documento':'referencia',
  'ref':'referencia',  'reference':'referencia',  'referenz':'referencia',

  // data_compensacao
  'data compensacao':'data_compensacao',  'data de compensacao':'data_compensacao',
  'data comp':'data_compensacao',  'dt compensacao':'data_compensacao',
  'clearing date':'data_compensacao',

  // data_pagamento
  'data pagamento':'data_pagamento',  'data de pagamento':'data_pagamento',
  'data de vencimento':'data_pagamento',  'vencimento':'data_pagamento',
  'data pag':'data_pagamento',  'dt vencimento':'data_pagamento',  'due date':'data_pagamento',

  // data_entrada
  'data entrada':'data_entrada',  'data de entrada':'data_entrada',
  'data de lancamento':'data_entrada',  'data lancamento':'data_entrada',
  'data lanc':'data_entrada',  'dt entrada':'data_entrada',
  'posting date':'data_entrada',  'entry date':'data_entrada',
};

function normalizeHeader(h) {
  if (h==null) return '';
  return String(h).toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ').trim();
}

/**
 * Sugere um nome de campo normalizado para um cabeçalho Excel.
 * Se não encontrar alias, usa o próprio cabeçalho normalizado (snake_case).
 */
function suggestField(header) {
  const norm = normalizeHeader(header);
  if (COLUMN_ALIASES[norm]) return COLUMN_ALIASES[norm];
  // Fallback: normalizar o nome da coluna para snake_case
  return norm.replace(/\s+/g, '_') || null;
}

/* --------------------------------------------------------------
   ESTADO DA APLICAÇÃO
   -------------------------------------------------------------- */

let rawData: DataRecord[] = [];
let fileName: string = '';
let selectedOp: number = 1;
let dupGroups: DataRecord[][] = [];
let currentPage: number = 1;
const PAGE_SIZE: number = 100;
let checkedFields: Set<string> = new Set();
let availableFields: FieldInfo[] = [];
let modelFields: string[] = [];
let selectedSumField: string = '';
let uniqueRecords: DataRecord[] = [];

// Filtros de resultados
let activeFilters: FilterState = {
  type: 'all',
  search: '',
  exactCount: null,
  minAmount: null,
  maxAmount: null
};
let filterDebounceTimer: number | null = null;

// Ordenaï¿½ï¿½o de tabela
let sortState: SortState = {
  field: null,
  direction: 'asc'
};

// Estado temporï¿½rio durante mapeamento Excel
let _excelRows: unknown[][] = [];
let _excelHeaders: string[] = [];
let _excelFile: File | null = null;

// Fila de processamento ï¿½ mï¿½ltiplos ficheiros
let fileQueue: FileQueueItem[] = [];
let processingQueue: boolean = false;
let isSequentialProcessing: boolean = false;
let consolidatedFiles: ConsolidatedFile[] = [];
let mappings: Mapping = {};
let fileDataMap: FileDataMap = {};

/* --------------------------------------------------------------
   DRAG & DROP / IMPORTAï¿½ï¿½O (Mï¿½LTIPLOS FICHEIROS)
   -------------------------------------------------------------- */
// Setup drop zone
const dropZone = document.getElementById('import-section');
if (dropZone) {
  dropZone.addEventListener('dragover', e => {
    e.preventDefault();
    dropZone.classList.add('dragover');
  });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
  dropZone.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    console.log('Drop detected:', e.dataTransfer.files.length, 'ficheiros');
    addFilesToQueue(e.dataTransfer.files);
  });
}

// Setup file input
const fileInput = document.getElementById('file-input');
if (fileInput) {
  fileInput.addEventListener('change', e => {
    console.log('File input change:', e.target.files.length, 'ficheiros');
    if (e.target.files && e.target.files.length > 0) {
      addFilesToQueue(e.target.files);
    }
  });
} else {
  console.warn('?? Elemento #file-input nï¿½o encontrado!');
}

function isExcel(name: string): boolean {
  return /\.(xlsx|xls)$/i.test(name);
}

function isCSV(name: string): boolean {
  return /\.csv$/i.test(name);
}

function isJSON(name: string): boolean {
  return /\.json$/i.test(name);
}

function isXML(name: string): boolean {
  return /\.xml$/i.test(name);
}

/**
 * Adiciona ficheiros ï¿½ fila de processamento
 * @param {FileList} files - Lista de ficheiros a processar
 */
function addFilesToQueue(files: FileList | File[]): void {
  console.log('addFilesToQueue chamado com:', files.length, 'ficheiros');

  if (!files || files.length === 0) {
    console.warn('?? Nenhum ficheiro recebido');
    return;
  }

  let validCount: number = 0;
  for (let file of files) {
    console.log('Validando ficheiro:', file.name, `(${(file.size / 1024 / 1024).toFixed(2)}MB)`);
    if (isValidFile(file)) {
      fileQueue.push({
        file,
        data: null,
        status: 'pending',
        mapping: null,
        progress: 0,
        error: null
      });
      validCount++;
      console.log(`? Adicionado ï¿½ fila: ${file.name}`);
    }
  }

  console.log(`Total de ficheiros vï¿½lidos: ${validCount}/${files.length}`);
  updateQueueUI();

  if (validCount === 0) {
    alert('?? Nenhum ficheiro vï¿½lido foi seleccionado.\n\nFormatos suportados: .xlsx, .xls, .csv, .json, .xml\nTamanho mï¿½ximo: 500MB');
  }
}

/**
 * Valida um ficheiro (tipo e tamanho)
 * @param {File} file - Ficheiro a validar
 * @returns {boolean} Verdadeiro se o ficheiro ï¿½ vï¿½lido
 */
function isValidFile(file: File): boolean {
  const valid: boolean = isExcel(file.name) || isCSV(file.name) || isJSON(file.name) || isXML(file.name);
  if (!valid) {
    Logger.warn(`Ficheiro ${file.name} nï¿½o suportado ï¿½ ignorado.`);
    return false;
  }

  const maxSize: number = 500 * 1024 * 1024; // 500 MB
  if (file.size > maxSize) {
    Logger.warn(`Ficheiro ${file.name} ï¿½ muito grande (${(file.size / 1024 / 1024).toFixed(0)}MB) ï¿½ limite: 500MB ï¿½ ignorado.`);
    return false;
  }

  return true;
}

function updateQueueUI() {
  const queueEl = document.getElementById('files-queue');
  const listEl = document.getElementById('files-queue-list');

  console.log('updateQueueUI: fileQueue tem', fileQueue.length, 'ficheiros');

  if (!queueEl || !listEl) {
    console.warn('?? Elementos de fila nï¿½o encontrados no DOM');
    return;
  }

  if (fileQueue.length === 0) {
    queueEl.style.display = 'none';
    console.log('Fila vazia, ocultando');
    return;
  }

  queueEl.style.display = 'block';
  console.log('Mostrando fila com', fileQueue.length, 'ficheiros');

  try {
    // Botï¿½o "Processar todos" se houver mï¿½ltiplos ficheiros pendentes
    const hasPending = fileQueue.some(f => f.status === 'pending');
    const processoBtn = fileQueue.length > 1 && hasPending ? `
      <div style="margin-bottom:16px;display:flex;gap:10px;">
        <button class="btn-run" onclick="startProcessing()" style="flex:1;padding:12px;font-size:13px">
          ? Processar todos (${fileQueue.length} ficheiro${fileQueue.length !== 1 ? 's' : ''})
        </button>
      </div>
    ` : '';

    listEl.innerHTML = processoBtn + fileQueue.map((item, i) => {
      const isProcessing = item.status === 'processing';
      const isSuccess = item.status === 'success';
      const isError = item.status === 'error';

      const statusIcon = item.status === 'pending' ? '?' :
                        item.status === 'processing' ? '??' :
                        item.status === 'mapping' ? '??' :
                        item.status === 'success' ? '?' :
                        '?';

      const itemData = fileDataMap[item.file.name];
      const statusText = item.status === 'pending' ? 'Pendente' :
                        item.status === 'processing' ? 'A processar...' :
                        item.status === 'mapping' ? 'A mapear colunas...' :
                        item.status === 'success' ? `${itemData?.records?.length || 0} registos` :
                        item.error || 'Erro';

      const progressPercent = item.progress || 0;
      const btnDisabled = isProcessing || isSuccess;
      const btnClass = isProcessing ? 'processing' : isSuccess ? 'success' : isError ? 'error' : '';

      let html = `
        <div class="queue-item ${isSuccess ? 'success' : isError ? 'error' : ''}">
          <div class="queue-item-icon">
            ${isProcessing ? '<div class="queue-item-spinner"></div>' : statusIcon}
          </div>
          <div class="queue-item-content">
            <div class="queue-item-name">
              <span>${item.file.name}</span>
              <span style="font-size:11px;color:var(--muted);font-weight:normal">(${(item.file.size/1024/1024).toFixed(1)}MB)</span>
            </div>
            <div class="queue-item-status ${isProcessing ? 'processing' : isSuccess ? 'success' : isError ? 'error' : ''}">
              ${statusIcon} ${statusText}
            </div>
            ${isProcessing ? `
              <div class="queue-item-progress">
                <div class="queue-item-progress-bar" style="width: ${progressPercent}%"></div>
              </div>
            ` : ''}
          </div>
          <div style="display:flex;gap:8px;align-items:center">
            <button
              class="queue-item-analyze-btn ${btnClass}"
              onclick="processSingleFile(${i})"
              ${btnDisabled || isError ? 'disabled' : ''}
              title="${isSuccess ? 'Ficheiro processado' : isError ? 'Ficheiro com erro' : 'Processar este ficheiro'}"
              style="display:flex;align-items:center;justify-content:center;gap:6px;min-height:36px">
              ${isProcessing ? `<div class="queue-item-spinner" style="width:14px;height:14px;border-width:1.5px"></div><span>Processando</span>` : isSuccess ? '? Pronto' : isError ? '? Erro' : '? Processar'}
            </button>
            <button
              class="queue-item-remove-btn"
              onclick="removeFileFromQueue(${i})"
              ${isProcessing ? 'disabled' : ''}
              title="Remover ficheiro"
              style="padding:8px 12px;background:#fff3cd;border:1px solid #ffc107;border-radius:6px;cursor:pointer;font-weight:600;color:#856404;font-size:14px;min-height:36px;transition:all 0.2s">
              ? Remover
            </button>
          </div>
        </div>
      `;

      return html;
    }).join('');

    // Mostrar botï¿½o "Analisar e Consolidar" se hï¿½ PELO MENOS 1 ficheiro pronto
    const successCount = getSuccessCount();

    if (successCount > 0) {
      listEl.innerHTML += `
        <div style="margin-top:20px;display:flex;gap:10px;justify-content:center;">
          <button class="btn-run" onclick="startAnalysis()" style="flex:1;max-width:600px">
            ? Analisar e Consolidar (${successCount} ficheiro${successCount !== 1 ? 's' : ''} pronto${successCount !== 1 ? 's' : ''})
          </button>
        </div>
      `;
    }
  } catch (err) {
    console.error('? Erro ao renderizar fila:', err);
    listEl.innerHTML = '<p style="color:red">Erro ao mostrar fila. Abre a consola (F12) para detalhes.</p>';
  }
}

/** Atualiza o progresso de um ficheiro na fila */
function updateFileProgress(queueItem, percent, status = null) {
  queueItem.progress = Math.min(100, Math.max(0, percent));
  if (status) queueItem.status = status;
  updateQueueUI();
}

/** Atualiza o erro de um ficheiro na fila */
function setFileError(queueItem, errorMsg) {
  queueItem.status = 'error';
  queueItem.error = errorMsg;
  updateQueueUI();
}

function removeFromQueue(index) {
  fileQueue.splice(index, 1);
  updateQueueUI();
  if (fileQueue.length === 0) document.getElementById('file-input').value = '';
}

function clearQueue() {
  fileQueue = [];
  consolidatedFiles = [];
  mappings = {};
  updateQueueUI();
  document.getElementById('file-input').value = '';
}

/** Processa um ficheiro individual (extrai dados, sem ir para anï¿½lise) */
function processSingleFile(queueIndex) {
  const item = fileQueue[queueIndex];
  if (!item) return;

  if (item.status === 'success') {
    alert('Este ficheiro jï¿½ foi processado.');
    return;
  }

  // Processar apenas este ficheiro
  // REMOVER progress-section ï¿½ usar log panel em vez disso
  // Abrir log panel automaticamente
  const logPanel = document.getElementById('log-panel');
  if (logPanel) {
    logPanel.classList.remove('collapsed');
    document.getElementById('log-chevron').textContent = '?';
  }

  Logger.separator(`PROCESSAMENTO - ${item.file.name}`);
  item.status = 'processing';
  item.progress = 5;
  isSequentialProcessing = false;  // Modo individual
  updateQueueUI();

  setTimeout(() => {
    if (isExcel(item.file.name)) {
      loadExcelFromQueue(item);
    } else if (isCSV(item.file.name)) {
      loadCSVFromQueue(item);
    } else if (isJSON(item.file.name)) {
      loadJSONFromQueue(item);
    } else if (isXML(item.file.name)) {
      loadXMLFromQueue(item);
    }
  }, 100);
}

/** Verifica se todos os ficheiros foram processados */
function allFilesProcessed() {
  return fileQueue.length > 0 && fileQueue.every(f => f.status === 'success' || f.status === 'error');
}

/** Conta ficheiros processados com sucesso */
function getSuccessCount() {
  return fileQueue.filter(f => f.status === 'success').length;
}

/** Consolida ficheiros processados com sucesso e salta para anï¿½lise */
function startAnalysis() {
  const successFiles = fileQueue.filter(f => f.status === 'success');

  if (successFiles.length === 0) {
    alert('Nenhum ficheiro foi processado com sucesso.');
    return;
  }

  Logger.separator(`Consolidaï¿½ï¿½o de ${successFiles.length} ficheiro(s) processado(s)`);

  // Consolidar dados de todos os ficheiros com sucesso
  consolidatedFiles = [];
  rawData = [];
  mappings = {};

  try {
    for (const file of successFiles) {
      const itemData = fileDataMap[file.file.name];

      if (itemData && itemData.records && itemData.records.length > 0) {
        consolidatedFiles.push({
          name: file.file.name,
          records: itemData.records,
          fields: itemData.fields || []
        });

        // Adicionar ao rawData
        if (rawData.length === 0) {
          rawData = [...itemData.records];
        } else {
          rawData = rawData.concat(itemData.records);
        }

        Logger.info(`? ${file.file.name}: ${itemData.records.length} registos consolidados`);
      }
    }

    if (rawData.length === 0) {
      alert('Nenhum dado para consolidar.');
      Logger.error('Consolidaï¿½ï¿½o: sem dados');
      return;
    }

    Logger.info(`Consolidaï¿½ï¿½o completa: ${rawData.length} registos totais`);

    // Extrair campos unificados
    const allFields = new Set();
    consolidatedFiles.forEach(file => {
      if (file.fields) {
        file.fields.forEach(f => allFields.add(f));
      }
    });

    modelFields = Array.from(allFields);

    // Nï¿½O salta para anï¿½lise ï¿½ fica na pï¿½gina de upload
    fileName = `${successFiles.length} ficheiro${successFiles.length !== 1 ? 's' : ''} consolidado${successFiles.length !== 1 ? 's' : ''}`;

    Logger.info('? Consolidaï¿½ï¿½o pronta! Os dados estï¿½o prontos para anï¿½lise.');
    Logger.info('Clique em uma operaï¿½ï¿½o (Duplicados ou Reconciliaï¿½ï¿½o) para comeï¿½ar.');

    // Preparar anï¿½lise - chamar showContent para renderizar campos
    showContent();
  } catch (err) {
    Logger.error(`Consolidaï¿½ï¿½o falhou: ${err.message}`);
    alert('Erro ao consolidar ficheiros. Abre a consola (F12) para detalhes.');
  }
}

/** Remove um ficheiro da fila antes de processar */
function removeFileFromQueue(index) {
  if (index < 0 || index >= fileQueue.length) return;

  const item = fileQueue[index];
  const fileName = item.file ? item.file.name : item.name;

  fileQueue.splice(index, 1);

  // Remover dados armazenados se existirem
  if (fileDataMap.has(fileName)) {
    fileDataMap.delete(fileName);
  }

  Logger.info(`? Ficheiro removido: ${fileName}`);
  updateQueueUI();
}

/** Inicia processamento sequencial de todos os ficheiros na fila */
function startProcessing() {
  if (fileQueue.length === 0) {
    alert('Adiciona pelo menos um ficheiro.');
    return;
  }

  processingQueue = true;
  isSequentialProcessing = true;  // Modo sequencial
  consolidatedFiles = [];
  rawData = [];

  // Nï¿½o sai da pï¿½gina de upload ï¿½ mantï¿½m visualizaï¿½ï¿½o da fila
  Logger.separator(`Processamento de ${fileQueue.length} ficheiro(s)`);
  Logger.info(`Iniciando processamento sequencialï¿½`);
  processNextFile();
}

/** Processa ficheiros sequencialmente */
function processNextFile() {
  const pending = fileQueue.find(f => f.status === 'pending');

  if (!pending) {
    // Todos processados ï¿½ consolidar
    finalizeConsolidation();
    return;
  }

  updateFileProgress(pending, 5, 'processing');

  const idx = fileQueue.indexOf(pending);
  const progress = Math.round((idx / fileQueue.length) * 90) + 5;
  setProgress(progress, `A processar ficheiro ${idx + 1}/${fileQueue.length}`, pending.file.name);

  Logger.info(`Ficheiro ${idx + 1}/${fileQueue.length}: ${pending.file.name}`);

  setTimeout(() => {
    if (isExcel(pending.file.name)) {
      loadExcelFromQueue(pending);
    } else if (isCSV(pending.file.name)) {
      loadCSVFromQueue(pending);
    } else if (isJSON(pending.file.name)) {
      loadJSONFromQueue(pending);
    } else if (isXML(pending.file.name)) {
      loadXMLFromQueue(pending);
    }
  }, 50);
}

/* --------------------------------------------------------------
   CARREGAR DE FILA ï¿½ FUNï¿½ï¿½ES PARA Mï¿½LTIPLOS FICHEIROS
   -------------------------------------------------------------- */

/** Carregar JSON da fila de processamento */
function loadJSONFromQueue(queueItem) {
  const reader = new FileReader();

  reader.onload = e => {
    try {
      const obj = JSON.parse(e.target.result);
      const data = obj.registos || obj.data || obj.records || (Array.isArray(obj) ? obj : []);

      if (!data.length) throw new Error('Nenhum registo encontrado.');

      // Adicionar campo de origem
      data.forEach(row => {
        row.ficheiro_origem = queueItem.file.name;
      });

      fileDataMap[queueItem.file.name] = { records: data, mapping: {} };
      queueItem.status = 'success';
      consolidatedFiles.push(queueItem.file.name);

      Logger.info(`? JSON: ${data.length.toLocaleString('pt-PT')} registos`);
      updateQueueUI();
      if (isSequentialProcessing) processNextFile();
      else {
        // Fechar log panel apï¿½s 5 segundos (tempo para ler resultado)
        setTimeout(() => {
          const logPanel = document.getElementById('log-panel');
          if (logPanel && !isSequentialProcessing) {
            logPanel.classList.add('collapsed');
            document.getElementById('log-chevron').textContent = '?';
          }
        }, 5000);
      }
    } catch (err) {
      queueItem.status = 'error';
      Logger.error(`JSON ${queueItem.file.name}: ${err.message}`);
      updateQueueUI();
      if (isSequentialProcessing) processNextFile();
      else {
        setTimeout(() => {
          const logPanel = document.getElementById('log-panel');
          if (logPanel && !isSequentialProcessing) {
            logPanel.classList.add('collapsed');
            document.getElementById('log-chevron').textContent = '?';
          }
        }, 5000);
      }
    }
  };

  reader.onerror = () => {
    queueItem.status = 'error';
    Logger.error(`JSON ${queueItem.file.name}: Erro ao ler ficheiro${isSequentialProcessing ? ' ï¿½ a continuar com os outros' : ''}`);
    updateQueueUI();
    if (isSequentialProcessing) processNextFile();
    else {
      setTimeout(() => {
        const logPanel = document.getElementById('log-panel');
        if (logPanel && !isSequentialProcessing) {
          logPanel.classList.add('collapsed');
          document.getElementById('log-chevron').textContent = '?';
        }
      }, 5000);
    }
  };

  reader.readAsText(queueItem.file, 'utf-8');
}

/** Carregar XML da fila de processamento */
function loadXMLFromQueue(queueItem) {
  const reader = new FileReader();

  reader.onload = e => {
    try {
      const xmlText = e.target.result;
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xmlText, 'application/xml');

      if (xmlDoc.getElementsByTagName('parsererror').length > 0) {
        throw new Error('XML invï¿½lido ï¿½ erro de parsing');
      }

      const data: DataRecord[] = [];
      const recordElements = xmlDoc.getElementsByTagName('record');

      if (recordElements.length === 0) {
        throw new Error('Nenhum elemento <record> encontrado no XML');
      }

      for (let i = 0; i < recordElements.length; i++) {
        const record: DataRecord = {};
        const element = recordElements[i];
        const children = element.children;

        for (let j = 0; j < children.length; j++) {
          const child = children[j];
          const key = child.tagName;
          let value: unknown = child.textContent;

          // Tentar converter para nï¿½mero
          if (value && !isNaN(Number(value)) && value.trim() !== '') {
            value = Number(value);
          }

          record[key] = value;
        }

        data.push(record);
      }

      if (data.length === 0) {
        throw new Error('Nenhum registo vï¿½lido extraï¿½do do XML');
      }

      // Adicionar campo de origem
      data.forEach(row => {
        row.ficheiro_origem = queueItem.file.name;
      });

      fileDataMap[queueItem.file.name] = { records: data, mapping: {} };
      queueItem.status = 'success';
      consolidatedFiles.push(queueItem.file.name);

      Logger.info(`? XML: ${data.length.toLocaleString('pt-PT')} registos`);
      updateQueueUI();
      if (isSequentialProcessing) processNextFile();
      else {
        setTimeout(() => {
          const logPanel = document.getElementById('log-panel');
          if (logPanel && !isSequentialProcessing) {
            logPanel.classList.add('collapsed');
            document.getElementById('log-chevron').textContent = '?';
          }
        }, 5000);
      }
    } catch (err) {
      queueItem.status = 'error';
      Logger.error(`XML ${queueItem.file.name}: ${(err as Error).message}`);
      updateQueueUI();
      if (isSequentialProcessing) processNextFile();
      else {
        setTimeout(() => {
          const logPanel = document.getElementById('log-panel');
          if (logPanel && !isSequentialProcessing) {
            logPanel.classList.add('collapsed');
            document.getElementById('log-chevron').textContent = '?';
          }
        }, 5000);
      }
    }
  };

  reader.onerror = () => {
    queueItem.status = 'error';
    Logger.error(`XML ${queueItem.file.name}: Erro ao ler ficheiro${isSequentialProcessing ? ' ï¿½ a continuar com os outros' : ''}`);
    updateQueueUI();
    if (isSequentialProcessing) processNextFile();
    else {
      setTimeout(() => {
        const logPanel = document.getElementById('log-panel');
        if (logPanel && !isSequentialProcessing) {
          logPanel.classList.add('collapsed');
          document.getElementById('log-chevron').textContent = '?';
        }
      }, 5000);
    }
  };

  reader.readAsText(queueItem.file, 'utf-8');
}

/** Carregar CSV da fila */
function loadCSVFromQueue(queueItem) {
  const reader = new FileReader();

  reader.onload = e => {
    try {
      const data = parseCSV(e.target.result);

      if (!data.length) throw new Error('Nenhum registo encontrado.');

      // Adicionar campo de origem
      data.forEach(row => {
        row.ficheiro_origem = queueItem.file.name;
      });

      fileDataMap[queueItem.file.name] = { records: data, mapping: {} };
      queueItem.status = 'success';
      consolidatedFiles.push(queueItem.file.name);

      Logger.info(`? CSV: ${data.length.toLocaleString('pt-PT')} registos`);
      updateQueueUI();
      if (isSequentialProcessing) processNextFile();
      else {
        setTimeout(() => {
          const logPanel = document.getElementById('log-panel');
          if (logPanel && !isSequentialProcessing) {
            logPanel.classList.add('collapsed');
            document.getElementById('log-chevron').textContent = '?';
          }
        }, 5000);
      }
    } catch (err) {
      queueItem.status = 'error';
      Logger.error(`CSV ${queueItem.file.name}: ${err.message}`);
      updateQueueUI();
      if (isSequentialProcessing) processNextFile();
      else {
        setTimeout(() => {
          const logPanel = document.getElementById('log-panel');
          if (logPanel && !isSequentialProcessing) {
            logPanel.classList.add('collapsed');
            document.getElementById('log-chevron').textContent = '?';
          }
        }, 5000);
      }
    }
  };

  reader.onerror = () => {
    queueItem.status = 'error';
    Logger.error(`CSV ${queueItem.file.name}: Erro ao ler ficheiro${isSequentialProcessing ? ' ï¿½ a continuar com os outros' : ''}`);
    updateQueueUI();
    if (isSequentialProcessing) processNextFile();
    else {
      setTimeout(() => {
        const logPanel = document.getElementById('log-panel');
        if (logPanel && !isSequentialProcessing) {
          logPanel.classList.add('collapsed');
          document.getElementById('log-chevron').textContent = '?';
        }
      }, 5000);
    }
  };

  reader.readAsText(queueItem.file, 'utf-8');
}

function parseCSV(csvText) {
  const lines = csvText.split('\n');
  const headers = lines[0].split(',').map(h => h.trim());
  const data = [];

  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '') continue;
    const values = lines[i].split(',').map(v => v.trim());
    const row = {};
    headers.forEach((h, j) => row[h] = values[j] || '');
    data.push(row);
  }
  return data;
}

/** Carregar Excel da fila */
function loadExcelFromQueue(queueItem) {
  const reader = new FileReader();

  reader.onload = e => {
    // Usar thread principal para Excel tambï¿½m
    processExcelFromQueueMainThread(e.target.result, queueItem);
  };

  reader.onerror = () => {
    queueItem.status = 'error';
    Logger.error(`Excel ${queueItem.file.name}: Erro ao ler ficheiro ï¿½ a continuar com os outros`);
    updateQueueUI();
    processNextFile();
  };

  reader.readAsArrayBuffer(queueItem.file);
}

async function processExcelFromQueueMainThread(buffer, queueItem) {
  if (typeof XLSX === 'undefined') {
    Logger.warn('SheetJS ainda nï¿½o carregado ï¿½ a aguardarï¿½');
    let tries = 0;
    const wait = setInterval(() => {
      tries++;
      if (typeof XLSX !== 'undefined') {
        clearInterval(wait);
        processExcelFromQueueMainThread(buffer, queueItem);
      } else if (tries >= 100) {
        clearInterval(wait);
        queueItem.status = 'error';
        Logger.error(`Excel ${queueItem.file.name}: SheetJS nï¿½o carregou${isSequentialProcessing ? ' ï¿½ a continuar com os outros' : ''}`);
        updateQueueUI();
        if (isSequentialProcessing) processNextFile();
        else {
          setTimeout(() => {
            const logPanel = document.getElementById('log-panel');
            if (logPanel && !isSequentialProcessing) {
              logPanel.classList.add('collapsed');
              document.getElementById('log-chevron').textContent = '?';
            }
          }, 5000);
        }
      }
    }, 100);
    return;
  }

  try {
    const data = new Uint8Array(buffer);
    const strategies = [
      { label: 'ultra-leve (sem fï¿½rmulas)', opts: { type: 'array', raw: true, cellDates: false, cellFormula: false, cellStyles: false, cellNF: false, sheetStubs: false } },
      { label: 'leve (sem valores)', opts: { type: 'array', raw: true, cellDates: false, cellFormula: false, cellStyles: false } },
      { label: 'sheetStubs', opts: { type: 'array', raw: true, cellDates: false, cellFormula: false, sheetStubs: true } },
      { label: 'raw:false', opts: { type: 'array', raw: false, cellDates: false, cellFormula: false, cellStyles: false } },
      { label: 'completo', opts: { type: 'array', raw: true, cellDates: false } },
    ];

    let ws = null, rows = [];
    let lastError = null;

    for (const strat of strategies) {
      try {
        Logger.info(`  A tentar estratï¿½gia: ${strat.label}ï¿½`);
        const wb = XLSX.read(data, strat.opts);
        const candidates = [...new Set([...wb.SheetNames, ...Object.keys(wb.Sheets)])];
        ws = null;

        for (const name of candidates) {
          const s = wb.Sheets[name];
          if (s) { ws = s; break; }
        }

        if (!ws) {
          Logger.warn(`Nenhuma folha acessï¿½vel com estratï¿½gia ${strat.label}`);
          continue;
        }

        rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });
        Logger.info(`Estratï¿½gia ${strat.label}: ${rows.length} linhas`);

        // IMPORTANTE: Nï¿½o usar readCellsDirect para ficheiros com >100k linhas
        if (rows.length < 2 && ws['!ref']) {
          try {
            const range = XLSX.utils.decode_range(ws['!ref']);
            const maxRows = range.e.r - range.s.r + 1;
            if (maxRows <= 100000) {
              rows = readCellsDirect(ws);
              Logger.info(`readCellsDirect: ${rows.length} linhas`);
            } else {
              Logger.warn(`Range muito grande (${maxRows} linhas) ï¿½ skipping readCellsDirect`);
            }
          } catch (cellErr) {
            Logger.warn(`readCellsDirect falhou: ${cellErr.message}`);
          }
        }

        if (rows.length >= 2) {
          Logger.info(`? Estratï¿½gia ${strat.label} funcionou!`);
          break;
        }
        Logger.warn(`Estratï¿½gia ${strat.label}: dados insuficientes`);
      } catch (stratErr) {
        lastError = stratErr;
        Logger.warn(`Estratï¿½gia ${strat.label} falhou: ${stratErr.message}`);
        continue;
      }
    }

    if (!ws || rows.length < 2) {
      throw new Error(`Ficheiro Excel sem dados legï¿½veis. ï¿½ltima estratï¿½gia erro: ${lastError?.message || 'desconhecido'}`);
    }

    // Avisar se ficheiro ï¿½ muito grande
    if (rows.length > 100000) {
      Logger.warn(`?? Ficheiro grande (${rows.length.toLocaleString('pt-PT')} linhas) ï¿½ pode ser lento`);
    }

    // Detetar cabeï¿½alho
    let hIdx = 0;
    for (let i = 0; i < Math.min(rows.length, 10); i++) {
      if (rows[i] && rows[i].some(v => v != null && String(v).trim() !== '')) {
        hIdx = i;
        break;
      }
    }

    const headers = rows[hIdx].map(h => h != null ? String(h).trim() : '');

    // Auto-sugerir mapeamento
    const mapping = {};
    headers.forEach((h, colIdx) => {
      if (!h) return;
      const suggested = suggestField(h);
      if (suggested) mapping[colIdx] = suggested;
    });

    // Converter registos (com processamento por chunks)
    const records = [];
    // Aumentar chunk size para ficheiros muito grandes
    const chunkSize = rows.length > 500000 ? 5000 : rows.length > 100000 ? 2000 : 1000;
    const t0 = performance.now();
    const maxTime = 120000; // 2 minutos mï¿½ximo

    Logger.info(`Iniciando conversï¿½o de registos (chunk size: ${chunkSize})ï¿½`);

    for (let i = hIdx + 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || !row.some(v => v != null && String(v).trim() !== '')) continue;

      try {
        const rec = buildRecord(row, mapping, queueItem.file.name);
        records.push(rec);
      } catch (recordErr) {
        Logger.warn(`Linha ${i + 1}: Erro ao converter (${recordErr.message})`);
        continue;
      }

      // Dar tempo ao browser a cada chunk e mostrar progresso
      if (records.length % chunkSize === 0) {
        const elapsed = performance.now() - t0;
        if (elapsed > maxTime) {
          throw new Error(`Processamento excedeu ${maxTime / 1000}s. Ficheiro muito grande.`);
        }
        const elapsedSec = (elapsed / 1000).toFixed(1);
        Logger.info(`  ${records.length.toLocaleString('pt-PT')} registos processados em ${elapsedSec}sï¿½`);
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }

    if (!records.length) {
      throw new Error('Nenhum registo apï¿½s o cabeï¿½alho.');
    }

    const conversionTime = ((performance.now() - t0) / 1000).toFixed(1);
    Logger.info(`? Conversï¿½o concluï¿½da: ${records.length.toLocaleString('pt-PT')} registos em ${conversionTime}s`);

    // Guardar dados num mapa separado para evitar stack overflow com arrays grandes
    fileDataMap[queueItem.file.name] = { records, mapping };
    queueItem.status = 'success';
    queueItem.progress = 100;
    mappings[queueItem.file.name] = mapping;
    consolidatedFiles.push(queueItem.file.name);

    Logger.info(`? Excel: ${records.length.toLocaleString('pt-PT')} registos processados`);
    updateQueueUI();
    if (isSequentialProcessing) processNextFile();
    else {
      setTimeout(() => {
        const logPanel = document.getElementById('log-panel');
        if (logPanel && !isSequentialProcessing) {
          logPanel.classList.add('collapsed');
          document.getElementById('log-chevron').textContent = '?';
        }
      }, 5000);
    }
  } catch (err) {
    let errorMsg = 'Erro desconhecido';
    if (err.message.includes('Maximum call stack') || err.message.includes('stack')) {
      errorMsg = 'Stack overflow (ficheiro corrompido)';
      Logger.error(`Excel ${queueItem.file.name}: Stack overflow ï¿½ ficheiro pode estar corrompido`);
      Logger.info(`?? Tenta: (1) Reabrir em Excel e guardar novamente, (2) Remover fï¿½rmulas complexas, (3) Converter para CSV`);
    } else {
      errorMsg = err.message.substring(0, 100); // Truncar mensagem longa
      Logger.error(`Excel ${queueItem.file.name}: ${err.message}`);
      Logger.error(`Stack trace: ${err.stack?.substring(0, 500) || 'N/A'}`);
    }
    setFileError(queueItem, errorMsg);
    if (isSequentialProcessing) processNextFile();
    else {
      setTimeout(() => {
        const logPanel = document.getElementById('log-panel');
        if (logPanel && !isSequentialProcessing) {
          logPanel.classList.add('collapsed');
          document.getElementById('log-chevron').textContent = '?';
        }
      }, 5000);
    }
  }
}

/** Finalizar consolidaï¿½ï¿½o ï¿½ mesclar todos os dados e avanï¿½ar */
function finalizeConsolidation() {
  // Contar sucessos e falhas
  const successCount = fileQueue.filter(f => f.status === 'success').length;
  const failCount = fileQueue.filter(f => f.status === 'error').length;
  const totalCount = fileQueue.length;

  // Mesclar todos os dados NOVOS
  let newData = [];
  let totalRecordsNew = 0;

  fileQueue.forEach(item => {
    if (item.status === 'success') {
      const itemData = fileDataMap[item.file.name];
      if (itemData && itemData.records) {
        // Usar concat() em vez de spread operator para evitar stack overflow com arrays grandes
        newData = newData.concat(itemData.records);
        totalRecordsNew += itemData.records.length;
      }
    }
  });

  // Verificar se hï¿½ dados anteriores (modo "Adicionar ficheiros")
  const hasPreviousData = window._previousConsolidatedData && window._previousConsolidatedData.length > 0;
  const previousCount = hasPreviousData ? window._previousConsolidatedData.length : 0;

  // Relatï¿½rio de processamento
  Logger.separator('RESUMO DO PROCESSAMENTO');
  Logger.info(`Ficheiros novos: ${totalCount}`);
  Logger.info(`? Sucesso: ${successCount}`);
  if (failCount > 0) {
    Logger.warn(`? Falha: ${failCount} (continuou com os que conseguiu)`);
  }

  if (hasPreviousData) {
    Logger.info(`\n? Dados anteriores: ${previousCount.toLocaleString('pt-PT')} registos`);
    Logger.info(`? Dados novos: ${totalRecordsNew.toLocaleString('pt-PT')} registos`);
  }

  // Se nï¿½o hï¿½ dados novos, verificar se hï¿½ dados anteriores
  if (newData.length === 0) {
    if (hasPreviousData) {
      Logger.warn('Nenhum registo encontrado nos ficheiros novos.');
      Logger.info('? Mantendo dados anteriores.');
      // Voltar aos dados anteriores
      rawData = [...window._previousConsolidatedData];
      // Nï¿½O salta para anï¿½lise ï¿½ fica na pï¿½gina de upload
      return;
    } else {
      if (failCount === totalCount) {
        Logger.error('Nenhum ficheiro foi processado com sucesso.');
        alert('? Erro Fatal: Nenhum ficheiro conseguiu ser processado.\n\nVerifica os ficheiros e tenta novamente.');
      } else {
        Logger.error('Nenhum registo encontrado nos ficheiros processados.');
        alert('?? Aviso: Os ficheiros foram lidos mas sem registos.');
      }
      resetAll();
      return;
    }
  }

  // Mesclar dados: anteriores + novos
  if (hasPreviousData) {
    rawData = [...window._previousConsolidatedData, ...newData];
    consolidatedFiles = [...consolidatedFiles]; // Adicionar aos anteriores
    Logger.separator('MESCLA DE DADOS');
    Logger.info(`Dados anteriores: ${previousCount.toLocaleString('pt-PT')} registos`);
    Logger.info(`Dados novos: ${totalRecordsNew.toLocaleString('pt-PT')} registos`);
    Logger.info(`Total mesclado: ${rawData.length.toLocaleString('pt-PT')} registos`);
  } else {
    rawData = newData;
  }

  // Normalizar dados ï¿½ garantir que todos tï¿½m os mesmos campos
  const allKeys = [...new Set(rawData.flatMap(r => Object.keys(r)))];
  rawData.forEach(r => {
    allKeys.forEach(k => {
      if (!(k in r)) r[k] = null;
    });
  });

  fileName = hasPreviousData
    ? `${rawData.length.toLocaleString('pt-PT')} registos mesclados`
    : consolidatedFiles.length === 1
    ? consolidatedFiles[0]
    : `${consolidatedFiles.length} ficheiros consolidados`;

  Logger.separator('CONSOLIDAï¿½ï¿½O CONCLUï¿½DA COM SUCESSO');
  Logger.info(`Ficheiros com dados: ${consolidatedFiles.join(', ')}`);
  Logger.info(`Total de registos: ${rawData.length.toLocaleString('pt-PT')}`);
  Logger.info(`Campos ï¿½nicos: ${allKeys.length}`);
  if (failCount > 0) {
    Logger.info(`?? ${failCount} ficheiro(s) falharam mas continuou com os ${successCount} vï¿½lidos`);
  }

  // Limpar referï¿½ncia aos dados anteriores
  window._previousConsolidatedData = null;
  window._previousConsolidatedCount = 0;

  setProgress(100, 'Pronto!', `${rawData.length.toLocaleString('pt-PT')} registos consolidados`);

  setTimeout(() => {
    hide('progress-section');
    showContent();
  }, 500);
}

/* --------------------------------------------------------------
   CARREGAR JSON (LEGACY ï¿½ um ficheiro)
   -------------------------------------------------------------- */
function loadJSON(file) {
  Logger.separator('Importaï¿½ï¿½o JSON');
  Logger.info(`Ficheiro: ${file.name} (${(file.size/1024/1024).toFixed(2)} MB)`);

  const reader = new FileReader();
  reader.onprogress = e => {
    if (e.lengthComputable) {
      setProgress(Math.round(e.loaded/e.total*70), 'A ler ficheiroï¿½',
        `${Math.round(e.loaded/e.total*100)}% ï¿½ ${(e.loaded/1024/1024).toFixed(1)} MB`);
    }
  };
  reader.onload = e => {
    Logger.info('Ficheiro em memï¿½ria ï¿½ parse JSONï¿½');
    setProgress(80, 'A processar JSONï¿½', 'A converter estrutura de dadosï¿½');
    setTimeout(() => {
      try {
        const t0 = performance.now();
        const obj = JSON.parse(e.target.result);
        Logger.info(`Parse JSON: ${(performance.now()-t0).toFixed(0)} ms`);
        rawData = obj.registos || obj.data || obj.records || (Array.isArray(obj)?obj:[]);
        if (!rawData.length) throw new Error('Nenhum registo encontrado.');
        Logger.info(`${rawData.length.toLocaleString('pt-PT')} registos carregados`);
        setProgress(100,'Concluï¿½do!', `${fmtN(rawData.length)} registos`);
        setTimeout(() => showContent(), 300);
      } catch(err) {
        Logger.error(`Erro JSON: ${err.message}`);
        alert('Erro ao processar o ficheiro:\n'+err.message);
        resetAll();
      }
    }, 50);
  };
  reader.onerror = e => { Logger.error('Erro FileReader'); alert('Erro ao ler.'); resetAll(); };
  reader.readAsText(file,'utf-8');
}

/* --------------------------------------------------------------
   CARREGAR EXCEL ï¿½ via Web Worker (nï¿½o bloqueia o UI thread)
   -------------------------------------------------------------- */
function loadExcel(file) {
  Logger.separator('Importaï¿½ï¿½o Excel');
  Logger.info(`Ficheiro: ${file.name} (${(file.size/1024/1024).toFixed(2)} MB)`);

  const reader = new FileReader();
  reader.onprogress = e => {
    if (e.lengthComputable)
      setProgress(
        Math.round(e.loaded / e.total * 35),
        'A ler ficheiro Excelï¿½',
        `${Math.round(e.loaded/e.total*100)}% ï¿½ ${(e.loaded/1024/1024).toFixed(1)} MB`
      );
  };

  reader.onload = e => {
    // file:// nunca suporta Workers (origin 'null') ï¿½ ir direto ao thread principal
    if (window.location.protocol === 'file:') {
      Logger.info('Modo ficheiro local ï¿½ a processar no thread principalï¿½');
      setProgress(38, 'A iniciar processamentoï¿½', 'thread principal');
      processExcelMainThread(e.target.result, file);
      return;
    }

    setProgress(38, 'A iniciar processamentoï¿½', 'A enviar para worker threadï¿½');
    Logger.info('Ficheiro lido ï¿½ a lanï¿½ar Web Workerï¿½');

    let worker;
    try {
      worker = new Worker('js/excel.worker.js');
    } catch (err) {
      Logger.warn(`Web Worker falhou (${err.message}) ï¿½ a processar no thread principalï¿½`);
      processExcelMainThread(e.target.result, file);
      return;
    }

    // Mensagens do worker
    worker.onmessage = ev => {
      const msg = ev.data;
      if (msg.type === 'progress') {
        setProgress(38 + Math.round(msg.pct * 0.57), msg.label, msg.sub);
      } else if (msg.type === 'log') {
        if      (msg.level === 'ERROR') Logger.error(msg.msg);
        else if (msg.level === 'WARN')  Logger.warn(msg.msg);
        else                            Logger.info(msg.msg);
      } else if (msg.type === 'done') {
        worker.terminate();
        finishExcelLoad(msg.rows, file);
      } else if (msg.type === 'error') {
        worker.terminate();
        Logger.error(`Worker: ${msg.msg}`);
        alert('Erro ao processar o Excel:\n' + msg.msg);
        resetAll();
      }
    };

    worker.onerror = err => {
      worker.terminate();
      Logger.error(`Worker crash: ${err.message}`);
      Logger.warn('A tentar fallback no thread principalï¿½');
      processExcelMainThread(e.target.result, file);
    };

    // Transferir o ArrayBuffer para o worker (zero-copy)
    worker.postMessage({ buffer: e.target.result }, [e.target.result]);
  };

  reader.onerror = () => { Logger.error('Erro FileReader'); alert('Erro ao ler.'); resetAll(); };
  reader.readAsArrayBuffer(file);
}

/* Fallback: processar no thread principal se Worker nï¿½o estiver disponï¿½vel */
function processExcelMainThread(buffer, file) {
  // SheetJS pode estar ainda a carregar (injeï¿½ï¿½o dinï¿½mica) ï¿½ aguardar atï¿½ 10s
  if (typeof XLSX === 'undefined') {
    Logger.warn('SheetJS ainda nï¿½o carregado ï¿½ a aguardarï¿½');
    let tries = 0;
    const wait = setInterval(() => {
      tries++;
      if (typeof XLSX !== 'undefined') {
        clearInterval(wait);
        Logger.info('SheetJS carregado ï¿½ a retomar processamentoï¿½');
        processExcelMainThread(buffer, file);
      } else if (tries >= 100) {
        clearInterval(wait);
        const msg = 'SheetJS nï¿½o carregou apï¿½s 10s. Verifica a ligaï¿½ï¿½o ï¿½ internet.';
        Logger.error(msg); alert(msg); resetAll();
      }
    }, 100);
    return;
  }
  setProgress(50, 'A descompactar workbookï¿½', '(thread principal)');
  setTimeout(() => {
    try {
      const t0   = performance.now();
      const data = new Uint8Array(buffer);

      // Estratï¿½gias de leitura ï¿½ da mais leve para a mais completa
      const strategies = [
        { label:'leve (sem fï¿½rmulas/estilos)', opts:{ type:'array', raw:true,  cellDates:false, cellFormula:false, cellStyles:false, cellNF:false, sheetStubs:false } },
        { label:'sheetStubs',                  opts:{ type:'array', raw:true,  cellDates:false, cellFormula:false, sheetStubs:true  } },
        { label:'raw:false',                   opts:{ type:'array', raw:false, cellDates:false, cellFormula:false, cellStyles:false  } },
        { label:'completo',                    opts:{ type:'array', raw:true,  cellDates:false                                      } },
      ];

      let ws = null, rows = [];
      for (const strat of strategies) {
        try {
          Logger.info(`A tentar estratï¿½gia: ${strat.label}ï¿½`);
          setProgress(50, `A ler workbookï¿½`, strat.label);
          const wb = XLSX.read(data, strat.opts);
          Logger.info(`SheetNames: [${wb.SheetNames.join(', ')}] ï¿½ Sheets keys: [${Object.keys(wb.Sheets).join(', ')}]`);

          // Encontrar folha com dados
          const candidates = [...new Set([...wb.SheetNames, ...Object.keys(wb.Sheets)])];
          ws = null;
          for (const name of candidates) {
            const s = wb.Sheets[name];
            if (s) { ws = s; Logger.info(`Folha: "${name}" ï¿½ ref: ${s['!ref']||'sem ref'}`); break; }
          }
          if (!ws) { Logger.warn('Sem folha acessï¿½vel nesta estratï¿½gia ï¿½ a tentar prï¿½ximaï¿½'); continue; }

          setProgress(70, 'A extrair linhasï¿½', '');
          rows = XLSX.utils.sheet_to_json(ws, { header:1, defval:null, raw:true });
          Logger.info(`sheet_to_json: ${rows.length} linhas`);

          if (rows.length < 2 && ws['!ref']) {
            Logger.warn('sheet_to_json insuficiente ï¿½ leitura diretaï¿½');
            rows = readCellsDirect(ws);
            Logger.info(`Leitura direta: ${rows.length} linhas`);
          }

          if (rows.length >= 2) break; // sucesso
          Logger.warn(`Estratï¿½gia "${strat.label}" sem dados ï¿½ a tentar prï¿½ximaï¿½`);
        } catch (stratErr) {
          Logger.warn(`Estratï¿½gia "${strat.label}" falhou: ${stratErr.message}`);
        }
      }

      if (!ws)   throw new Error('Nenhuma estratï¿½gia conseguiu aceder ï¿½ folha.');
      if (rows.length < 2) throw new Error('Folha sem dados legï¿½veis apï¿½s todas as estratï¿½gias. ref: ' + (ws['!ref']||'nulo'));

      Logger.info(`${rows.length.toLocaleString('pt-PT')} linhas em ${(performance.now()-t0).toFixed(0)} ms`);
      finishExcelLoad(rows, file);
    } catch(err) {
      Logger.error(`Fallback error: ${err.message}`);
      alert('Erro ao processar o Excel:\n' + err.message);
      resetAll();
    }
  }, 60);
}

/* Passo final: detetar cabeï¿½alho e mostrar ecrï¿½ de mapeamento */
function finishExcelLoad(rows, file) {
  let hIdx = 0;
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    if (rows[i] && rows[i].some(v => v != null && String(v).trim() !== '')) {
      hIdx = i; break;
    }
  }
  const headers = rows[hIdx].map(h => h != null ? String(h).trim() : '');
  Logger.info(`Cabeï¿½alho linha ${hIdx+1}: ${headers.filter(Boolean).join(' | ')}`);
  Logger.info(`${(rows.length - hIdx - 1).toLocaleString('pt-PT')} linhas de dados`);

  _excelRows    = rows;
  _excelHeaders = headers;
  _excelFile    = file;

  setProgress(100, 'Pronto!', '');
  setTimeout(() => {
    hide('progress-section');
    showMappingStep(headers, rows, hIdx);
  }, 200);
}

/**
 * Fallback: lï¿½ uma folha SheetJS cï¿½lula a cï¿½lula via !ref.
 * ï¿½til quando sheet_to_json devolve 0 linhas em ficheiros complexos.
 * ?? LIMITE: Mï¿½ximo 100k linhas para evitar stack overflow
 */
function readCellsDirect(ws) {
  if (!ws['!ref']) return [];
  const range = XLSX.utils.decode_range(ws['!ref']);
  const maxRows = 100000;

  // Se o range ï¿½ muito grande, abort e deixar sheet_to_json resultado
  if ((range.e.r - range.s.r + 1) > maxRows) {
    Logger.warn(`  Range muito grande (${range.e.r - range.s.r + 1} linhas) ï¿½ abortando readCellsDirect para evitar stack overflow`);
    return [];
  }

  Logger.info(`  Range direto: R${range.s.r}C${range.s.c} ? R${range.e.r}C${range.e.c} (${range.e.r-range.s.r+1} linhas ï¿½ ${range.e.c-range.s.c+1} cols)`);

  const rows = [];
  try {
    for (let R = range.s.r; R <= range.e.r; R++) {
      const row = [];
      for (let C = range.s.c; C <= range.e.c; C++) {
        const addr = XLSX.utils.encode_cell({r: R, c: C});
        const cell = ws[addr];
        row.push(cell != null ? cell.v : null);
      }
      rows.push(row);
    }
  } catch (err) {
    Logger.warn(`  Erro em readCellsDirect (${err.message}) ï¿½ retornando ${rows.length} linhas jï¿½ lidas`);
    if (rows.length === 0) throw err; // Se nï¿½o conseguiu nada, propagar erro
  }

  return rows;
}

/* --------------------------------------------------------------
   MAPEAMENTO ï¿½ ecrï¿½ de confirmaï¿½ï¿½o
   -------------------------------------------------------------- */
function showMappingStep(headers, rows, hIdx) {
  show('mapping-section');

  const previewRow = rows[hIdx+1] || [];

  // Datalist com sugestï¿½es conhecidas (aliases ï¿½nicos)
  const knownSuggestions = [...new Set(Object.values(COLUMN_ALIASES))].sort();
  const datalist = `<datalist id="field-suggestions">
    ${knownSuggestions.map(s=>`<option value="${s}">`).join('')}
  </datalist>`;

  const rowsHtml = headers.map((h, i) => {
    if (!h) return '';
    const suggested = suggestField(h) || '';
    const preview   = previewRow[i]!=null ? String(previewRow[i]).substring(0,50) : 'ï¿½';
    const typeHint  = guessFieldType(suggested, previewRow[i]);

    return `<tr id="map-row-${i}">
      <td><span class="map-col-name">${escHtml(h)}</span></td>
      <td>
        <span class="map-preview" title="${escHtml(String(previewRow[i]??''))}">${escHtml(preview)}</span>
        <span style="font-size:10px;color:var(--muted);display:block;margin-top:2px">${typeHint}</span>
      </td>
      <td class="map-arrow">?</td>
      <td class="map-input-cell">
        <input type="text"
               id="map-inp-${i}"
               data-col="${i}"
               value="${escHtml(suggested)}"
               list="field-suggestions"
               placeholder="nome_do_campo"
               class="map-input ${suggested?'mapped':''}"
               oninput="onMapInputChange(this)">
        <label class="map-ignore-label">
          <input type="checkbox" onchange="toggleIgnore(${i},this)"> Ignorar
        </label>
        <span class="map-dup-warn" id="dup-warn-${i}"
              style="display:none;font-size:10px;color:var(--red)">? duplicado</span>
      </td>
    </tr>`;
  }).filter(Boolean).join('');

  document.getElementById('map-table-wrap').innerHTML = datalist + `
    <table class="map-table">
      <thead><tr>
        <th>Coluna no ficheiro</th>
        <th>Exemplo ï¿½ tipo detetado</th>
        <th></th>
        <th>Nome do campo (editï¿½vel)</th>
      </tr></thead>
      <tbody>${rowsHtml}</tbody>
    </table>`;

  updateMapSummary();
  Logger.info('Mapeamento dinï¿½mico apresentado ï¿½ campos livres, editï¿½veis pelo utilizador.');
}

/** Indica o tipo provï¿½vel de um campo para ajudar o utilizador */
function guessFieldType(fieldName, sampleVal) {
  if (isLikelyDate(fieldName, sampleVal))    return '?? data';
  if (isLikelyNumeric(fieldName, sampleVal)) return '?? numï¿½rico';
  if (sampleVal==null)                        return 'ï¿½ vazio';
  return '?? texto';
}

function onMapInputChange(inp) {
  const v = inp.value.trim();
  inp.className = 'map-input' + (v ? ' mapped' : '');
  checkDuplicateMappings();
  updateMapSummary();
}

function toggleIgnore(colIdx, chk) {
  const inp = document.getElementById(`map-inp-${colIdx}`);
  if (chk.checked) {
    inp.dataset.saved = inp.value;
    inp.value    = '';
    inp.disabled = true;
    inp.className = 'map-input';
  } else {
    inp.value    = inp.dataset.saved || '';
    inp.disabled = false;
    inp.className = 'map-input' + (inp.value ? ' mapped' : '');
  }
  checkDuplicateMappings();
  updateMapSummary();
}

function checkDuplicateMappings() {
  const inputs = [...document.querySelectorAll('.map-input:not(:disabled)')];
  const count  = {};
  inputs.forEach(inp => {
    const v = inp.value.trim();
    if (v) count[v] = (count[v]||0)+1;
  });
  inputs.forEach(inp => {
    const v      = inp.value.trim();
    const col    = inp.dataset.col;
    const warn   = document.getElementById(`dup-warn-${col}`);
    const isDup  = v && count[v] > 1;
    if (warn) warn.style.display = isDup ? 'inline' : 'none';
    inp.style.borderColor = isDup ? 'var(--red)' : '';
  });
  return Object.values(count).some(n=>n>1);
}

function updateMapSummary() {
  const inputs  = [...document.querySelectorAll('.map-input')];
  const mapped  = inputs.filter(i=>!i.disabled && i.value.trim()).length;
  const ignored = inputs.filter(i=>i.disabled || !i.value.trim()).length;
  const hasDups = checkDuplicateMappings();
  let html = `<strong>${mapped}</strong> campo(s) ï¿½ <span style="color:var(--muted)">${ignored} ignorados</span>`;
  if (hasDups) html += ` ï¿½ <span style="color:var(--red)">? nomes duplicados</span>`;
  document.getElementById('map-summary').innerHTML = html;
}

/* --------------------------------------------------------------
   CONFIRMAR MAPEAMENTO ï¿½ fase 2: converter e avanï¿½ar
   -------------------------------------------------------------- */
function confirmMapping() {
  // Ler mapeamento dos inputs de texto: colIdx ? fieldKey
  const mapping = {};
  document.querySelectorAll('.map-input').forEach(inp => {
    if (inp.disabled) return;
    const key = inp.value.trim().toLowerCase().replace(/\s+/g,'_');
    if (key) mapping[parseInt(inp.dataset.col)] = key;
  });

  if (!Object.keys(mapping).length) {
    alert('Define pelo menos um campo antes de continuar.');
    return;
  }

  Logger.separator('Conversï¿½o Excel ? Modelo');
  Object.entries(mapping).forEach(([ci, fk]) =>
    Logger.info(`  Coluna "${_excelHeaders[parseInt(ci)]}" ? ${fk}`)
  );

  hide('mapping-section');
  show('progress-section');
  setProgress(10,'A converter registosï¿½','');

  setTimeout(() => {
    try {
      // Encontrar hIdx novamente
      let hIdx = 0;
      for (let i=0;i<Math.min(_excelRows.length,10);i++) {
        if (_excelRows[i].some(v=>v!=null&&String(v).trim()!=='')) { hIdx=i; break; }
      }

      const t0 = performance.now();
      const records = [];
      for (let i=hIdx+1; i<_excelRows.length; i++) {
        const row = _excelRows[i];
        if (!row||!row.some(v=>v!=null&&String(v).trim()!=='')) continue;
        records.push(buildRecord(row, mapping, fileName));
        if (i%5000===0) setProgress(
          10+Math.round((i/_excelRows.length)*80),
          `A converterï¿½`,`${fmtN(i)} de ${fmtN(_excelRows.length)} linhas`
        );
      }

      if (!records.length) throw new Error('Nenhum registo encontrado apï¿½s o cabeï¿½alho.');
      Logger.info(`${records.length.toLocaleString('pt-PT')} registos convertidos em ${(performance.now()-t0).toFixed(0)} ms`);

      // Estatï¿½sticas rï¿½pidas
      const mappedFields = [...new Set(Object.values(mapping))];
      const numField = mappedFields.find(f=>f==='montante');
      if (numField) {
        const withVal = records.filter(r=>r[numField]!=null).length;
        Logger.info(`Campo "${numField}" preenchido: ${withVal}/${records.length}`);
      }

      rawData = records;
      setProgress(100,'Concluï¿½do!',`${fmtN(records.length)} registos`);
      setTimeout(() => showContent(), 300);

    } catch(err) {
      Logger.error(`Erro na conversï¿½o: ${err.message}`);
      alert('Erro na conversï¿½o:\n'+err.message);
      resetAll();
    }
  }, 60);
}

/* -- Construir um registo do modelo a partir de uma linha --- */
function buildRecord(row, mapping, srcFile) {
  const rec = {};
  // Inicializar todos os campos mapeados com null
  Object.values(mapping).forEach(f => { rec[f] = null; });
  rec.ficheiro_origem = srcFile;

  Object.entries(mapping).forEach(([colIdx, field]) => {
    let val = row[parseInt(colIdx)];
    if (val===null||val===undefined||val==='') { rec[field]=null; return; }

    if (isLikelyDate(field, val)) {
      rec[field] = parseExcelDate(val);
    } else if (isLikelyNumeric(field, val)) {
      rec[field] = typeof val==='number'
        ? val
        : parseFloat(String(val).replace(/\s/g,'').replace(',','.')) || null;
    } else {
      rec[field] = String(val).trim() || null;
    }
  });
  return rec;
}

/** Deteta se um campo ï¿½ provavelmente numï¿½rico pelo nome e/ou pelo valor */
function isLikelyNumeric(fieldName, sampleVal) {
  if (/montante|valor|amount|importe|saldo|price|preco|total|quantidade|qty|custo|cost/i.test(fieldName))
    return true;
  if (typeof sampleVal === 'number' && !isLikelyDate(fieldName, sampleVal))
    return true;
  return false;
}

/** Deteta se um campo ï¿½ provavelmente uma data pelo nome e/ou pelo valor */
function isLikelyDate(fieldName, sampleVal) {
  if (/data|date|datum|dt_/i.test(fieldName)) return true;
  // Nï¿½mero serial Excel em intervalo plausï¿½vel (1/1/1990 a 31/12/2100)
  if (typeof sampleVal === 'number' && sampleVal > 32874 && sampleVal < 73051) return true;
  if (typeof sampleVal === 'string') {
    const s = sampleVal.trim();
    if (/^\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{4}$/.test(s)) return true;
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return true;
  }
  return false;
}

function isNumericField(field) {
  return isLikelyNumeric(field, null);
}

/* -- Conversï¿½o de data Excel ------------------------------- */
function parseExcelDate(val) {
  if (val==null||val==='') return null;
  if (val instanceof Date) return isNaN(val)?null:val.toISOString().split('T')[0];
  if (typeof val==='number') {
    if (val<=0||val>200000) return null;
    const d = new Date((val-25569)*86400000);
    return isNaN(d)?null:d.toISOString().split('T')[0];
  }
  const s = String(val).trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0,10);
  const pt = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (pt) return `${pt[3]}-${pt[2].padStart(2,'0')}-${pt[1].padStart(2,'0')}`;
  const dot = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (dot) return `${dot[3]}-${dot[2].padStart(2,'0')}-${dot[1].padStart(2,'0')}`;
  return s;
}

/* --------------------------------------------------------------
   SHOW CONTENT ï¿½ constrï¿½i UI de anï¿½lise a partir dos dados reais
   -------------------------------------------------------------- */
function showContent() {
  hide('import-section');    // Esconder secï¿½ï¿½o de upload
  hide('progress-section');
  hide('mapping-section');
  show('content');
  hide('results-section');

  document.getElementById('fi-name').textContent  = fileName;
  document.getElementById('fi-total').textContent = fmtN(rawData.length);

  // Detetar campos disponï¿½veis dinamicamente
  const sample = rawData[0] || {};
  availableFields = Object.keys(sample)
    .filter(k => {
      if (k === 'ficheiro_origem') return false;
      return rawData.some(r => r[k] != null);
    })
    .map(k => ({
      key:   k,
      label: k.replace(/_/g, ' '),
      desc:  guessFieldType(k, sample[k]),
    }));

  Logger.info(`Campos disponï¿½veis: ${availableFields.map(f=>f.key).join(', ')}`);
  document.getElementById('fi-campos').textContent = availableFields.length;
  document.getElementById('fi-sub').textContent =
    isExcel(fileName) ? 'Excel convertido com sucesso' : 'JSON carregado com sucesso';

  // Reset campos selecionados ï¿½ escolher campos ï¿½teis por defeito
  checkedFields = new Set();
  const defaults = ['numero_documento','atribuicao','montante'];
  availableFields.forEach(f => { if (defaults.includes(f.key)) checkedFields.add(f.key); });
  if (!checkedFields.size && availableFields.length) checkedFields.add(availableFields[0].key);

  buildFieldSelector();
  buildReconConfig();
  selectOp(1);
}

/* --------------------------------------------------------------
   OP 1 ï¿½ SELETOR DE CAMPOS DINï¿½MICO
   -------------------------------------------------------------- */
function buildFieldSelector() {
  const grid = document.getElementById('fields-grid');
  grid.innerHTML = availableFields.map(f => `
    <label class="field-chk ${checkedFields.has(f.key)?'checked':''}" id="lbl-${f.key}">
      <input type="checkbox" ${checkedFields.has(f.key)?'checked':''}
             onchange="toggleField('${f.key}',this)">
      <span class="fname">${f.key}</span>
      <span class="fdesc">${f.desc}</span>
    </label>`).join('');

  // Preencher selector de campo para somar
  buildSumFieldSelector();
}

function buildSumFieldSelector() {
  const sel = document.getElementById('sum-field-select');
  if (!sel) return;

  // Mostrar campos numï¿½ricos (detectados por tipo)
  const numericFields = availableFields.filter(f =>
    f.desc && (f.desc.includes('numï¿½rico') || f.desc.includes('nï¿½mero') || f.desc.includes('numeric'))
  );

  const opts = numericFields.map(f =>
    `<option value="${f.key}">${f.label || f.key}</option>`).join('');

  sel.innerHTML = '<option value="">ï¿½ Nenhum (sem soma) ï¿½</option>' + opts;

  // Default: detectar campo de montante automaticamente
  const autoDetect = ['montante','MONTANTE','Montante','valor','VALOR','Valor','amount','AMOUNT']
                     .find(fname => numericFields.some(f => f.key === fname));

  if (autoDetect) {
    sel.value = autoDetect;
    selectedSumField = autoDetect;
    Logger.info(`Campo de soma automï¿½tico: ${autoDetect}`);
  }

  sel.onchange = (e) => {
    selectedSumField = e.target.value;
    Logger.info(`Campo de soma: ${selectedSumField || 'nenhum'}`);
  };
}

function toggleField(key, el) {
  if (el.checked) { checkedFields.add(key);    document.getElementById('lbl-'+key).classList.add('checked'); }
  else            { checkedFields.delete(key);  document.getElementById('lbl-'+key).classList.remove('checked'); }
}
function selectAllFields() {
  availableFields.forEach(f => {
    checkedFields.add(f.key);
    const lbl=document.getElementById('lbl-'+f.key);
    if(lbl){lbl.classList.add('checked');lbl.querySelector('input').checked=true;}
  });
}
function clearAllFields() {
  checkedFields.clear();
  document.querySelectorAll('.field-chk').forEach(lbl=>{
    lbl.classList.remove('checked'); lbl.querySelector('input').checked=false;
  });
}

/* --------------------------------------------------------------
   OP 2 ï¿½ CONFIGURAï¿½ï¿½O DINï¿½MICA (agrupar por + campo de valor)
   -------------------------------------------------------------- */
function buildReconConfig() {
  // Preencher Op 3 field selects (faz todo o trabalho automaticamente)
  populateOp3FieldSelects();

  // Preencher selector de campo para somar (Op 1)
  buildSumFieldSelector();
}

/* --------------------------------------------------------------
   SELEï¿½ï¿½O DE OPERAï¿½ï¿½O
   -------------------------------------------------------------- */
function selectOp(n) {
  selectedOp = n;
  document.getElementById('op1-card').classList.toggle('active',      n===1);
  document.getElementById('op1-card').classList.remove('active-blue');
  document.getElementById('op2-card').classList.toggle('active-blue', n===2);
  document.getElementById('op2-card').classList.remove('active');
  document.getElementById('field-selector').style.display = n===1?'block':'none';
  document.getElementById('recon-config').style.display   = n===2?'block':'none';
  hide('results-section');
}

/* --------------------------------------------------------------
   EXECUTAR ANï¿½LISE
   -------------------------------------------------------------- */
function runAnalysis() {
  if (selectedOp===1) runDuplicates(); else runReconciliation();
}

/* -- OP 1: DUPLICADOS ---------------------------------------- */
function runDuplicates() {
  const fields = [...checkedFields];
  if (!fields.length) { alert('Seleciona pelo menos um campo.'); return; }

  Logger.separator('Anï¿½lise de Duplicados');
  Logger.info(`Campos: ${fields.join(', ')} ï¿½ ${rawData.length.toLocaleString('pt-PT')} registos`);

  const groupMap = new Map();
  rawData.forEach(r => {
    const key = fields.map(f => {
      const v=r[f];
      if (v===null||v===undefined) return '';
      if (typeof v==='number') return v.toFixed(4);
      return String(v).trim();
    }).join('||');
    if (!groupMap.has(key)) groupMap.set(key,[]);
    groupMap.get(key).push(r);
  });

  dupGroups = [...groupMap.values()].filter(g=>g.length>1);
  dupGroups.sort((a,b)=>b.length-a.length);
  const dupCount = dupGroups.reduce((s,g)=>s+g.length,0);

  // Extrair registos ï¿½nicos (grupos com 1 registo)
  uniqueRecords = [...groupMap.values()]
    .filter(g=>g.length===1)
    .map(g=>g[0]);  // Converter de grupos para registos

  if (dupGroups.length===0) Logger.info('Nenhum duplicado encontrado.');
  else Logger.warn(`${dupCount} registos em ${dupGroups.length} grupo(s) de duplicados.`);

  setSummaryCards([
    {id:'s-total',  val:fmtN(rawData.length),          label:'Total de registos',   cls:'total'},
    {id:'s-dups',   val:fmtN(dupCount),                 label:'Registos duplicados', cls:'dups'},
    {id:'s-unique', val:fmtN(rawData.length-dupCount),  label:'Registos ï¿½nicos',     cls:'clean'},
    {id:'s-groups', val:fmtN(dupGroups.length),         label:'Grupos duplicados',   cls:'info'},
  ]);

  document.getElementById('results-title').textContent = '';
  currentPage=1;
  activeFilters.type = 'all';  // Comeï¿½ar com "Total registos"
  show('results-section');
  setFilterTypeFromCard('all');  // Isso chama renderDuplicates com tipo correto
  document.getElementById('results-section').scrollIntoView({behavior:'smooth',block:'start'});
}

/* -- OP 2: RECONCILIAï¿½ï¿½O (dinï¿½mica) ------------------------- */
function runReconciliation() {
  const groupField = document.getElementById('op3-group-field-select').value;
  const valField   = document.getElementById('op3-value-field-select').value;
  const tolerance  = Math.abs(parseFloat(document.getElementById('op3-tolerance-input').value)||1);

  if (!groupField) { alert('Escolhe o campo de agrupamento.'); return; }
  if (!valField)   { alert('Escolhe o campo de valor.'); return; }

  Logger.separator('Reconciliaï¿½ï¿½o');
  Logger.info(`Agrupar por: ${groupField} ï¿½ Valor: ${valField} ï¿½ Tolerï¿½ncia: ï¿½${tolerance.toFixed(2)}`);

  const groupMap = new Map();
  rawData.forEach(r => {
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
  dupGroups=[...reconNok.map(e=>({...e,_recon:'nok'})),...reconOk.map(e=>({...e,_recon:'ok'}))];

  Logger.info(`Reconciliados: ${reconOk.length} ï¿½ Por reconciliar: ${reconNok.length}`);
  if (reconNok.length) Logger.warn(`${reconNok.length} grupo(s) com saldo acima da tolerï¿½ncia.`);

  setSummaryCards([
    {id:'s-total',  val:fmtN(groupMap.size),  label:`Grupos (${groupField})`,  cls:'total'},
    {id:'s-dups',   val:fmtN(reconNok.length), label:'Por reconciliar',         cls:'dups'},
    {id:'s-unique', val:fmtN(reconOk.length),  label:'Reconciliados',           cls:'clean'},
    {id:'s-groups', val:`ï¿½ ${fmt(tolerance)}`, label:'Tolerï¿½ncia',              cls:'info'},
  ]);

  document.getElementById('results-title').textContent = '';
  document.getElementById('results-meta').textContent  =
    `${fmtN(reconNok.length)} por reconciliar ï¿½ ${fmtN(reconOk.length)} reconciliados`;

  currentPage=1;
  show('results-section');
  renderReconciliation(reconOk,reconNok,tolerance,groupField,valField);
  document.getElementById('results-section').scrollIntoView({behavior:'smooth',block:'start'});
}

/* --------------------------------------------------------------
   RENDER: DUPLICADOS
   -------------------------------------------------------------- */
function renderDuplicates(fields) {
  const el = document.getElementById('dup-list');

  // MODO "TOTAL" - LISTA SIMPLES SEM AGRUPAMENTO
  if (activeFilters.type === 'all') {
    const allRecords = [...rawData];
    if (!allRecords.length) {
      el.innerHTML=`<div class="no-dups"><p>Nenhum registo.</p></div>`;
      hide('pagination'); return;
    }

    // Aplicar ordenaï¿½ï¿½o
    const sortedRecords = sortState.field ? sortRecords(allRecords, sortState.field, sortState.direction) : allRecords;

    const totalPages = Math.ceil(sortedRecords.length/PAGE_SIZE);
    const start = (currentPage-1)*PAGE_SIZE;
    const slice = sortedRecords.slice(start, start+PAGE_SIZE);
    const ctxKeys = availableFields.map(f=>f.key);
    const showCols = [...new Set([...fields,...ctxKeys])].filter(k=>k in (rawData[0]||{}));

    const rows = slice.map(r=>`<tr>${showCols.map(f=>{
      const v=r[f];
      if (typeof v==='number') return `<td class="${v<0?'amount-neg':'amount-pos'}">${fmt(v)}</td>`;
      return `<td class="${['numero_documento','atribuicao','conta','referencia'].includes(f)?'mono':''}">${v??'ï¿½'}</td>`;
    }).join('')}</tr>`).join('');

    const headerCells = showCols.map(f=>
      `<th style="cursor:pointer;user-select:none;padding:8px;background:#f5f5f5;border-bottom:2px solid #ddd;" onclick="setSortField('${f}')">${f.replace(/_/g,' ')}${getSortIndicator(f)}</th>`
    ).join('');

    // Calcular somatï¿½rio total de todos os registos
    const totalAll = selectedSumField
      ? sortedRecords.reduce((s,r)=>s+(typeof r[selectedSumField]==='number'?r[selectedSumField]:0),0)
      : 0;

    el.innerHTML=`
      <div style="display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:16px;padding:12px;background:#e3f2fd;border-radius:8px;border:1px solid #90caf9;">
        <div style="display:flex;align-items:center;gap:16px">
          <span style="display:inline-block;background:#1976d2;color:white;padding:6px 14px;border-radius:20px;font-size:12px;font-weight:600;">Total de registos</span>
          <span style="font-size:14px;color:#555;font-weight:500;">S montante: ${fmt(totalAll)}</span>
        </div>
        <div style="display:flex;align-items:center;gap:10px">
          <div style="display:flex;flex-direction:column;gap:2px;text-align:right">
            <div style="font-weight:600;color:#1e40af;font-size:12px">?? Exportar dados</div>
            <div style="font-size:10px;color:#6b7280">CSV, JSON, XML, PDF</div>
          </div>
          <button onclick="openExportModal()" style="padding:8px 14px;background:#2563eb;color:white;border:none;border-radius:6px;cursor:pointer;font-weight:600;white-space:nowrap;transition:all 0.2s;font-size:12px">? Exportar</button>
        </div>
      </div>
      <div style="overflow-x:auto"><table>
        <thead><tr>${headerCells}</tr></thead>
        <tbody>${rows}</tbody>
      </table></div>`;
    document.getElementById('pag-info').textContent = `Registos ${start+1}ï¿½${Math.min(start+PAGE_SIZE,sortedRecords.length)} de ${fmtN(sortedRecords.length)}`;
    renderPagination(totalPages,()=>renderDuplicates(fields));
    document.getElementById('pagination').style.display = sortedRecords.length > PAGE_SIZE ? 'flex' : 'none';
    setupFilters(() => renderDuplicates(fields));
    return;
  }

  // MODO "DUPLICADOS" e "ï¿½NICOS" - COM AGRUPAMENTO
  let dataToShow = dupGroups;
  if (activeFilters.type === 'unique') {
    dataToShow = uniqueRecords.map(r => [r]);
  }

  if (!dataToShow.length) {
    let msg = '? Nenhum duplicado encontrado.';
    if (activeFilters.type === 'unique') msg = '? Nenhum registo ï¿½nico encontrado.';
    el.innerHTML=`<div class="no-dups"><div class="big">?</div><p>${msg}</p></div>`;
    hide('pagination'); return;
  }

  // Aplicar filtros
  let filteredGroups = getFilteredGroups(dataToShow);

  if (!filteredGroups.length) {
    el.innerHTML='<div class="no-dups"><div class="big">??</div><p>Nenhum grupo corresponde aos filtros.</p></div>';
    hide('pagination'); return;
  }

  // Aplicar ordenaï¿½ï¿½o aos grupos (ordena pelo primeiro registo do grupo)
  if (sortState.field) {
    filteredGroups = [...filteredGroups].sort((groupA, groupB) => {
      const valA = groupA[0]?.[sortState.field];
      const valB = groupB[0]?.[sortState.field];

      if (valA == null && valB == null) return 0;
      if (valA == null) return 1;
      if (valB == null) return -1;

      if (typeof valA === 'number' && typeof valB === 'number') {
        return sortState.direction === 'asc' ? valA - valB : valB - valA;
      }

      const strA = String(valA).toLowerCase();
      const strB = String(valB).toLowerCase();
      const cmp = strA.localeCompare(strB, 'pt-PT');
      return sortState.direction === 'asc' ? cmp : -cmp;
    });
  }

  const totalPages = Math.ceil(filteredGroups.length/PAGE_SIZE);
  const start      = (currentPage-1)*PAGE_SIZE;
  const slice      = filteredGroups.slice(start,start+PAGE_SIZE);

  // Colunas de contexto: campos selecionados + campos ï¿½teis disponï¿½veis
  const ctxKeys  = availableFields.map(f=>f.key);
  const showCols = [...new Set([...fields,...ctxKeys])].filter(k=>k in (rawData[0]||{}));

  // MODO "UNIQUE" - TABELA SIMPLIFICADA
  if (activeFilters.type === 'unique') {
    // Flatten para lista simples (cada grupo tem 1 registo)
    const allRecords = slice.flatMap(group => group);

    // Calcular somatï¿½rio total dos registos ï¿½nicos
    const totalUnique = selectedSumField
      ? allRecords.reduce((s,r)=>s+(typeof r[selectedSumField]==='number'?r[selectedSumField]:0),0)
      : 0;

    const rows = allRecords.map(r=>`<tr>
      <td style="padding:8px;text-align:center;"><span style="cursor:help;font-size:20px;" title="Registo ï¿½nico">??</span></td>
      ${showCols.map(f=>{
        const v=r[f];
        if (typeof v==='number')
          return `<td class="${v<0?'amount-neg':'amount-pos'}">${fmt(v)}</td>`;
        return `<td class="${['numero_documento','atribuicao','conta','referencia'].includes(f)?'mono':''}">${v??'ï¿½'}</td>`;
      }).join('')}
    </tr>`).join('');

    const headerCells = `<th style="padding:8px;width:40px;text-align:center;"></th>${showCols.map(f=>
      `<th style="cursor:pointer;user-select:none;padding:8px;background:#f5f5f5;border-bottom:2px solid #ddd;" onclick="setSortField('${f}')">${f.replace(/_/g,' ')}${getSortIndicator(f)}</th>`
    ).join('')}`;

    el.innerHTML=`
      <div style="display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:16px;padding:12px;background:#f0f8f4;border-radius:8px;border:1px solid #c5e8a0;">
        <div style="display:flex;align-items:center;gap:16px">
          <span style="display:inline-block;background:#4caf50;color:white;padding:6px 14px;border-radius:20px;font-size:12px;font-weight:600;">Registos ï¿½nicos</span>
          <span style="font-size:14px;color:#555;font-weight:500;">S montante: ${fmt(totalUnique)}</span>
        </div>
        <div style="display:flex;align-items:center;gap:10px">
          <div style="display:flex;flex-direction:column;gap:2px;text-align:right">
            <div style="font-weight:600;color:#1e40af;font-size:12px">?? Exportar dados</div>
            <div style="font-size:10px;color:#6b7280">CSV, JSON, XML, PDF</div>
          </div>
          <button onclick="openExportModal()" style="padding:8px 14px;background:#2563eb;color:white;border:none;border-radius:6px;cursor:pointer;font-weight:600;white-space:nowrap;transition:all 0.2s;font-size:12px">? Exportar</button>
        </div>
      </div>
      <div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;">
        <thead><tr>${headerCells}</tr></thead>
        <tbody>${rows}</tbody>
      </table></div>`;

    document.getElementById('pag-info').textContent = `Registos ${start+1}ï¿½${Math.min(start+PAGE_SIZE,filteredGroups.length)} de ${fmtN(filteredGroups.length)}`;
    renderPagination(totalPages,()=>renderDuplicates(fields));
    document.getElementById('pagination').style.display=filteredGroups.length>PAGE_SIZE?'flex':'none';
    setupFilters(() => renderDuplicates(fields));
    return;
  }

  // MODO "DUPLICADOS" - COM GRUPOS
  // Calcular somatï¿½rio total de todos os duplicados (nï¿½o apenas da pï¿½gina)
  const totalDuplicates = selectedSumField
    ? filteredGroups.reduce((sum, group) =>
        sum + group.reduce((s,r)=>s+(typeof r[selectedSumField]==='number'?r[selectedSumField]:0),0), 0)
    : 0;

  const groupsHtml = slice.map(group => {
    const keyParts = fields.map(f=>{
      const v=group[0][f];
      return typeof v==='number'?`${f}: ${fmt(v)}`:`${f}: ${v??'ï¿½'}`;
    }).join(' ï¿½ ');

    // Usar o campo selecionado pelo utilizador
    const total = selectedSumField && group.length > 0
                ? group.reduce((s,r)=>s+(typeof r[selectedSumField]==='number'?r[selectedSumField]:0),0)
                : 0;

    // Ordenar registos dentro do grupo tambï¿½m
    let groupRecords = [...group];
    if (sortState.field) {
      groupRecords = sortRecords(groupRecords, sortState.field, sortState.direction);
    }

    const rows  = groupRecords.map(r=>`<tr>${showCols.map(f=>{
      const v=r[f];
      if (typeof v==='number')
        return `<td class="${v<0?'amount-neg':'amount-pos'}">${fmt(v)}</td>`;
      return `<td class="${['numero_documento','atribuicao','conta','referencia'].includes(f)?'mono':''}">${v??'ï¿½'}</td>`;
    }).join('')}</tr>`).join('');

    const headerCells = showCols.map(f=>
      `<th style="cursor:pointer;user-select:none;padding:8px;background:#f5f5f5;border-bottom:2px solid #ddd;" onclick="setSortField('${f}')">${f.replace(/_/g,' ')}${getSortIndicator(f)}</th>`
    ).join('');

    return `<div class="group-block">
      <div class="group-header">
        <span class="group-count">${group.length}ï¿½ duplicado</span>
        <span class="group-total">S montante: ${fmt(total)}</span>
      </div>
      <div style="overflow-x:auto"><table>
        <thead><tr>${headerCells}</tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
    </div>`;
  }).join('');

  el.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:16px;padding:12px;background:#ffe8e8;border-radius:8px;border:1px solid #ffb3b3;">
      <div style="display:flex;align-items:center;gap:16px">
        <span style="display:inline-block;background:#d32f2f;color:white;padding:6px 14px;border-radius:20px;font-size:12px;font-weight:600;">Registos duplicados</span>
        <span style="font-size:14px;color:#555;font-weight:500;">S montante: ${fmt(totalDuplicates)}</span>
      </div>
      <div style="display:flex;align-items:center;gap:10px">
        <div style="display:flex;flex-direction:column;gap:2px;text-align:right">
          <div style="font-weight:600;color:#1e40af;font-size:12px">?? Exportar dados</div>
          <div style="font-size:10px;color:#6b7280">CSV, JSON, XML, PDF</div>
        </div>
        <button onclick="openExportModal()" style="padding:8px 14px;background:#2563eb;color:white;border:none;border-radius:6px;cursor:pointer;font-weight:600;white-space:nowrap;transition:all 0.2s;font-size:12px">? Exportar</button>
      </div>
    </div>
    ${groupsHtml}`;

  document.getElementById('pag-info').textContent =
    `Grupos ${start+1}ï¿½${Math.min(start+PAGE_SIZE,filteredGroups.length)} de ${fmtN(filteredGroups.length)}`;
  renderPagination(totalPages,()=>renderDuplicates(fields));
  document.getElementById('pagination').style.display=filteredGroups.length>PAGE_SIZE?'flex':'none';

  // Setup de filtros
  setupFilters(() => renderDuplicates(fields));
}

/** Muda o tipo de filtro via cards e aplica imediatamente */
function setFilterTypeFromCard(type) {
  activeFilters.type = type;
  currentPage = 1;

  // Atualizar cards visualmente
  document.getElementById('card-all').classList.toggle('selected', type === 'all');
  document.getElementById('card-dups').classList.toggle('selected', type === 'duplicates');
  document.getElementById('card-unique').classList.toggle('selected', type === 'unique');

  const fields = Array.from(checkedFields);
  renderDuplicates(fields);
}

/** Configura os event listeners dos filtros com debounce */
function setupFilters(callback) {
  const filterSection = document.getElementById('filters-section');
  if (!filterSection) return;

  show('filters-section');

  // Mostrar/esconder filtro de "Nï¿½ duplicados" baseado na vista
  const exactCountWrapper = document.getElementById('filter-exactcount-wrapper');
  if (activeFilters.type === 'duplicates') {
    exactCountWrapper.style.display = 'block';
  } else {
    exactCountWrapper.style.display = 'none';
  }

  const searchInput = document.getElementById('filter-search');
  const exactCountInput = document.getElementById('filter-exactcount');
  const minAmtInput = document.getElementById('filter-minamt');
  const maxAmtInput = document.getElementById('filter-maxamt');

  const applyFilters = () => {
    // activeFilters.type jï¿½ ï¿½ set por setFilterType()
    activeFilters.search = (searchInput?.value || '').toLowerCase();
    activeFilters.exactCount = exactCountInput?.value ? parseInt(exactCountInput.value) : null;
    activeFilters.minAmount = minAmtInput?.value ? parseFloat(minAmtInput.value) : null;
    activeFilters.maxAmount = maxAmtInput?.value ? parseFloat(maxAmtInput.value) : null;
    currentPage = 1; // Reset para pï¿½gina 1
    callback();
  };

  // Outros inputs: com debounce de 400ms
  [searchInput, exactCountInput, minAmtInput, maxAmtInput].forEach(input => {
    if (!input) return;
    input.addEventListener('input', () => {
      clearTimeout(filterDebounceTimer);
      filterDebounceTimer = setTimeout(applyFilters, 400);
    });
  });
}

/** Limpa todos os filtros */
function clearFilters() {
  activeFilters = { type: 'all', search: '', exactCount: null, minAmount: null, maxAmount: null };

  // Reset cards
  document.getElementById('card-all').classList.add('selected');
  document.getElementById('card-dups').classList.remove('selected');
  document.getElementById('card-unique').classList.remove('selected');

  document.getElementById('filter-search').value = '';
  document.getElementById('filter-exactcount').value = '';
  document.getElementById('filter-minamt').value = '';
  document.getElementById('filter-maxamt').value = '';
  currentPage = 1;

  const fields = Array.from(checkedFields);
  renderDuplicates(fields);
  Logger.info('Filtros limpos');
}

/* --------------------------------------------------------------
   RESET & ADICIONAR FICHEIROS
   -------------------------------------------------------------- */

/** Voltar ï¿½ importaï¿½ï¿½o para adicionar mais ficheiros (mantï¿½m dados consolidados) */
function addMoreFiles() {
  const currentData = [...rawData];
  const currentCount = rawData.length;
  Logger.info('ï¿½ï¿½ Modo: Adicionar Mais Ficheiros ï¿½ï¿½');
  Logger.info(`Dados actuais: ${currentCount.toLocaleString('pt-PT')} registos`);
  Logger.info('A aguardar novos ficheiros para mesclar...');
  hide('content'); hide('results-section'); hide('progress-section');
  show('import-section');
  fileQueue = [];
  consolidatedFiles = [];
  mappings = {};
  processingQueue = false;
  window._previousConsolidatedData = currentData;
  window._previousConsolidatedCount = currentCount;
  document.getElementById('file-input').value = '';
  updateQueueUI();
  const hint = document.querySelector('.file-hint');
  if (hint) {
    hint.innerHTML = `Ou arrasta mais ficheiros aqui<br><small style="color:var(--muted)">Serï¿½ mesclado com os ${currentCount.toLocaleString('pt-PT')} registos anteriores</small>`;
  }
}

function resetAll() {
  rawData=[]; dupGroups=[]; currentPage=1; availableFields=[];
  _excelRows=[]; _excelHeaders=[]; _excelFile=null; checkedFields=new Set();
  fileQueue=[]; consolidatedFiles=[]; mappings={}; fileDataMap={};
  window._previousConsolidatedData = null;
  window._previousConsolidatedCount = 0;
  show('import-section');
  hide('progress-section'); hide('mapping-section'); hide('content'); hide('results-section');
  document.getElementById('file-input').value='';
  const hint = document.querySelector('.file-hint');
  if (hint) hint.innerHTML = 'Ou arrasta vï¿½rios ficheiros para aqui';
  Logger.info('Portal reiniciado.');
}

/* --------------------------------------------------------------
   UTILITï¿½RIOS
   -------------------------------------------------------------- */
function show(id){ const el=document.getElementById(id); if(el) el.style.display='block'; }
function hide(id){ const el=document.getElementById(id); if(el) el.style.display='none';  }

function setProgress(pct,label,sub){
  document.getElementById('prog-fill').style.width  = pct+'%';
  document.getElementById('prog-label').textContent = label;
  document.getElementById('prog-sub').textContent   = sub||'';
}

function setSummaryCards(defs){
  const clsMap={total:'sum-card total',dups:'sum-card dups',clean:'sum-card clean',info:'sum-card info'};
  defs.forEach((d)=>{
    const valEl = document.getElementById(d.id);
    if(!valEl) return;
    valEl.textContent=d.val;

    // Encontrar o card pai e atualizar a classe e label
    const card = valEl.closest('.sum-card');
    if(card) {
      card.className=clsMap[d.cls]||'sum-card total';
      const labelEl = card.querySelector('.sl');
      if(labelEl) labelEl.textContent=d.label;
    }
  });
}

function fmt(n){
  if(n==null) return 'ï¿½';
  return new Intl.NumberFormat('pt-PT',{style:'currency',currency:'EUR',minimumFractionDigits:2,maximumFractionDigits:2}).format(n);
}
function fmtN(n){ return new Intl.NumberFormat('pt-PT').format(n); }

function escHtml(s){
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* --------------------------------------------------------------
   ORDENAï¿½ï¿½O DE DADOS
   -------------------------------------------------------------- */
function sortRecords(records, field, direction) {
  if (!field) return records;

  const sorted = [...records].sort((a, b) => {
    const valA = a[field];
    const valB = b[field];

    // Tratar valores null/undefined
    if (valA == null && valB == null) return 0;
    if (valA == null) return 1;
    if (valB == null) return -1;

    // Ordenar nï¿½meros
    if (typeof valA === 'number' && typeof valB === 'number') {
      return direction === 'asc' ? valA - valB : valB - valA;
    }

    // Ordenar strings
    const strA = String(valA).toLowerCase();
    const strB = String(valB).toLowerCase();
    const cmp = strA.localeCompare(strB, 'pt-PT');
    return direction === 'asc' ? cmp : -cmp;
  });

  return sorted;
}

function setSortField(field) {
  // Se clica no mesmo campo, inverte direï¿½ï¿½o
  if (sortState.field === field) {
    sortState.direction = sortState.direction === 'asc' ? 'desc' : 'asc';
  } else {
    // Campo novo: ordena ascendente
    sortState.field = field;
    sortState.direction = 'asc';
  }
  currentPage = 1;  // Reset ï¿½ pï¿½gina 1
  renderDuplicates(Array.from(checkedFields));
}

function getSortIndicator(field) {
  if (sortState.field !== field) return '';
  return sortState.direction === 'asc' ? ' ?' : ' ?';
}

/* --------------------------------------------------------------
   FILTROS E RENDERIZAï¿½ï¿½O
   -------------------------------------------------------------- */
function getFilteredGroups(groups) {
  return groups.filter(group => {
    if (activeFilters.exactCount !== null && group.length !== activeFilters.exactCount) return false;
    if (activeFilters.search) {
      const hasMatch = group.some(record =>
        Object.values(record).some(val =>
          String(val).toLowerCase().includes(activeFilters.search)
        )
      );
      if (!hasMatch) return false;
    }
    if (selectedSumField && (activeFilters.minAmount !== null || activeFilters.maxAmount !== null)) {
      const total = group.reduce((s, r) =>
        s + (typeof r[selectedSumField] === 'number' ? r[selectedSumField] : 0), 0);
      if (activeFilters.minAmount !== null && total < activeFilters.minAmount) return false;
      if (activeFilters.maxAmount !== null && total > activeFilters.maxAmount) return false;
    }
    return true;
  });
}

function renderReconciliation(reconOk, reconNok, tolerance, groupField, valField) {
  const el = document.getElementById('dup-list');
  if (!dupGroups.length) {
    el.innerHTML='<div class="no-dups"><p>?? Nenhum resultado.</p></div>';
    hide('pagination');
    return;
  }
  const totalPages = Math.ceil(dupGroups.length/PAGE_SIZE);
  const start = (currentPage-1)*PAGE_SIZE;
  const slice = dupGroups.slice(start,start+PAGE_SIZE);
  el.innerHTML = slice.map(e => `
    <div class="group-block">
      <div class="group-header">
        <span class="group-count">${e.records.length} reg.</span>
        <span class="group-key">${groupField}: ${escHtml(String(e.grp))}</span>
      </div>
      <div>Saldo: ${fmt(e.saldo)}</div>
    </div>
  `).join('');
  hide('pagination');
}


/* ---------------------------------------------------------------
   EXPORTAï¿½ï¿½O DE DADOS
   -------------------------------------------------------------- */

let exportState: ExportState = {
  dataType: 'all',
  format: 'csv'
};

/**
 * Abre o modal de exportaï¿½ï¿½o
 */
function openExportModal(): void {
  const modal = document.getElementById('export-modal') as HTMLElement | null;
  if (!modal) return;
  modal.style.display = 'flex';

  exportState.dataType = 'all';
  exportState.format = 'csv';

  // Validar limite de PDF (>5000 registos)
  const pdfBtn = document.getElementById('export-pdf-btn') as HTMLButtonElement | null;
  const pdfWarning = document.getElementById('pdf-limit-warning') as HTMLElement | null;
  const totalRecords = rawData.length;
  const MAX_PDF = 5000;

  if (totalRecords > MAX_PDF && pdfBtn && pdfWarning) {
    pdfBtn.disabled = true;
    pdfBtn.style.opacity = '0.5';
    pdfBtn.style.cursor = 'not-allowed';
    pdfBtn.style.color = '#ccc';
    pdfWarning.style.display = 'block';
  } else if (pdfBtn && pdfWarning) {
    pdfBtn.disabled = false;
    pdfBtn.style.opacity = '1';
    pdfBtn.style.cursor = 'pointer';
    pdfBtn.style.color = '#999';
    pdfWarning.style.display = 'none';
  }

  updateExportCounts();
  setExportFormat('csv');
}

/**
 * Fecha o modal de exportaï¿½ï¿½o
 */
function closeExportModal(): void {
  const modal = document.getElementById('export-modal') as HTMLElement | null;
  if (modal) modal.style.display = 'none';
}

/**
 * Define o tipo de dados a exportar
 * @param {ExportState['dataType']} type - Tipo: 'all', 'duplicates' ou 'unique'
 */
function setExportDataType(type: ExportState['dataType']): void {
  exportState.dataType = type;
  updateExportCounts();
  updateExportPreview();
}

/**
 * Define o formato de exportaï¿½ï¿½o
 * @param {ExportState['format']} format - Formato: 'csv', 'json', 'xml' ou 'pdf'
 */
function setExportFormat(format: ExportState['format']): void {
  // Validar formato (Priority 1)
  const VALID_FORMATS: ReadonlyArray<ExportState['format']> = ['csv', 'json', 'xml', 'pdf'];
  if (!VALID_FORMATS.includes(format)) {
    Logger.error(`Formato de export invï¿½lido: ${format}. Usando CSV como padrï¿½o.`);
    exportState.format = 'csv';
    return;
  }

  exportState.format = format;

  document.querySelectorAll('.export-fmt-btn').forEach((btn: Element) => {
    const htmlBtn = btn as HTMLElement;
    const isSelected = htmlBtn.getAttribute('data-format') === format;
    if (isSelected) {
      htmlBtn.style.borderColor = '#2563eb';
      htmlBtn.style.background = '#eff6ff';
      htmlBtn.style.color = '#2563eb';
    } else {
      htmlBtn.style.borderColor = '#ddd';
      htmlBtn.style.background = 'white';
      htmlBtn.style.color = '#999';
    }
  });

  updateExportPreview();
}

/**
 * Atualiza as contagens de registos no modal de exportaï¿½ï¿½o
 */
function updateExportCounts(): void {
  let countAll: number = rawData.length;
  let countDups: number = 0;
  let countUnique: number = rawData.length;

  if (dupGroups.length > 0) {
    countDups = dupGroups.reduce((sum, group) => sum + group.length, 0);
    countUnique = rawData.length - countDups;
  }

  const countAllEl = document.getElementById('count-all');
  const countDupsEl = document.getElementById('count-dups');
  const countUniqueEl = document.getElementById('count-unique');

  if (countAllEl) countAllEl.textContent = `${fmtN(countAll)} registos`;
  if (countDupsEl) countDupsEl.textContent = `${fmtN(countDups)} registos`;
  if (countUniqueEl) countUniqueEl.textContent = `${fmtN(countUnique)} registos`;
}

/**
 * Atualiza a preview de exportaï¿½ï¿½o com descriï¿½ï¿½o do formato
 */
function updateExportPreview(): void {
  const preview = document.getElementById('export-preview') as HTMLElement | null;
  if (!preview) return;

  const format = exportState.format;
  let previewText: string = '';

  if (format === 'csv') {
    previewText = '?? CSV ï¿½ Abrir em Excel ou Google Sheets';
  } else if (format === 'json') {
    previewText = '{ } JSON ï¿½ Para integraï¿½ï¿½o com outras ferramentas';
  } else if (format === 'xml') {
    previewText = '< > XML ï¿½ Formato estruturado para sistemas';
  } else if (format === 'pdf') {
    previewText = '?? PDF ï¿½ Relatï¿½rio formatado e imprimï¿½vel';
  }

  preview.textContent = previewText;
}

/**
 * Obtï¿½m as colunas visï¿½veis para exportaï¿½ï¿½o
 * @returns {string[]} Array de nomes de colunas
 */
function getVisibleColumns(): string[] {
  const fields = Array.from(checkedFields);
  const ctxKeys = availableFields.map(f => f.key);
  return [...new Set([...fields, ...ctxKeys])].filter(k => k in (rawData[0] || {})) as string[];
}

/**
 * Obtï¿½m dados para exportaï¿½ï¿½o baseado no tipo selecionado
 * Priority 2: Melhorar performance de O(n*m) para O(n)
 * @returns {ExportData} Objeto com dados e colunas
 */
function getDataToExport(): ExportData {
  const columns = getVisibleColumns();

  // Priority 2: Usar Set para O(1) lookup em vez de nested loops O(n*m)
  let dataToExport: DataRecord[] = [];

  if (exportState.dataType === 'all') {
    dataToExport = rawData;
  } else if (exportState.dataType === 'duplicates') {
    // Criar Set de ï¿½ndices duplicados ï¿½ O(n) em vez de O(n*m)
    const duplicateRecords = new Set<DataRecord>();
    dupGroups.forEach(group => {
      group.forEach(record => {
        duplicateRecords.add(record);
      });
    });

    // Filtrar registos que estï¿½o no Set ï¿½ O(n)
    dataToExport = rawData.filter(r => duplicateRecords.has(r));

    if (dataToExport.length === 0) {
      Logger.warn('Nenhum registo duplicado encontrado para exportaï¿½ï¿½o');
    }
  } else if (exportState.dataType === 'unique') {
    dataToExport = uniqueRecords;
  } else {
    Logger.error(`Tipo de export invï¿½lido: ${exportState.dataType}`);
    return { data: [], columns: [] };
  }

  return { data: dataToExport, columns };
}

/**
 * Executa a exportaï¿½ï¿½o de dados no formato selecionado
 */
function executeExport(): void {
  const { data, columns } = getDataToExport();
  const format = exportState.format;
  const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
  const filename = `G-FinanceSuite-export-${timestamp}`;

  if (format === 'csv') {
    exportToCSV(data, columns, filename);
  } else if (format === 'json') {
    exportToJSON(data, columns, filename);
  } else if (format === 'xml') {
    exportToXML(data, columns, filename);
  } else if (format === 'pdf') {
    exportToPDF(data, columns, filename);
  }

  closeExportModal();
  Logger.info(`? Exportaï¿½ï¿½o em ${format.toUpperCase()} concluï¿½da: ${data.length} registos`);
}

/**
 * Exporta dados para CSV
 * @param {DataRecord[]} data - Array de registos
 * @param {string[]} columns - Nomes das colunas
 * @param {string} filename - Nome do ficheiro (sem extensï¿½o)
 */
function exportToCSV(data: DataRecord[], columns: string[], filename: string): void {
  const header = columns.map(col => `"${col.replace(/"/g, '""')}"`).join(',');

  const rows = data.map(record => {
    return columns.map(col => {
      const value = record[col];
      let stringValue: string = '';

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

/**
 * Exporta dados para JSON
 * @param {DataRecord[]} data - Array de registos
 * @param {string[]} columns - Nomes das colunas
 * @param {string} filename - Nome do ficheiro (sem extensï¿½o)
 */
function exportToJSON(data: DataRecord[], columns: string[], filename: string): void {
  const jsonData = data.map(record => {
    const obj: DataRecord = {};
    columns.forEach(col => {
      obj[col] = record[col] ?? null;
    });
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
      const value = record[col];
      const escapedValue = String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');

      xml += `      <${col}>${escapedValue}</${col}>\n`;
    });
    xml += '    </record>\n';
  });

  xml += '  </records>\n';
  xml += '</G-FinanceSuite>';

  const blob = new Blob([xml], { type: 'application/xml;charset=utf-8;' });
  downloadFile(blob, `${filename}.xml`);
}

/**
 * Exporta dados para PDF com relatï¿½rio formatado
 * @param {DataRecord[]} data - Array de registos
 * @param {string[]} columns - Nomes das colunas
 * @param {string} filename - Nome do ficheiro (sem extensï¿½o)
 */
function exportToPDF(data: DataRecord[], columns: string[], filename: string): void {
  // Priority 1: Validar biblioteca jsPDF antes de comeï¿½ar
  if (typeof (window as any).jspdf === 'undefined') {
    Logger.error('Biblioteca jsPDF nï¿½o carregou');
    alert('?? Biblioteca PDF ainda a carregar. Tenta novamente em alguns segundos.');
    return;
  }

  try {
    const { jsPDF } = (window as any).jspdf;
    let doc: any;

    // Limite de registos para PDF (evitar RangeError com datasets muito grandes)
    const MAX_PDF_ROWS = 5000;
    let pdfData = data;
    if (data.length > MAX_PDF_ROWS) {
      Logger.warn(`?? PDF limitado a ${fmtN(MAX_PDF_ROWS)} registos (total: ${fmtN(data.length)})`);
      alert(`?? PDF contï¿½m muitos registos (${fmtN(data.length)}).\nSendo exportados apenas os primeiros ${fmtN(MAX_PDF_ROWS)} registos.`);
      pdfData = data.slice(0, MAX_PDF_ROWS);
    }

    // Try/catch granular ï¿½ Priority 1
    try {
      doc = new jsPDF();
    } catch (e) {
      Logger.error(`Erro ao criar documento PDF: ${(e as Error).message}`);
      throw e;
    }

    // Configuraï¿½ï¿½es
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 10;
    const contentWidth = pageWidth - (margin * 2);
    const rowHeight = 6;
    const cellPadding = 2;
    const tableMargin = margin;
    const dataStartY = 50; // Espaï¿½o para cabeï¿½alho na primeira pï¿½gina

    // Calcular larguras das colunas
    let columnWidths = [];
    const numCols = columns.length;
    const availableWidth = contentWidth - (cellPadding * 2 * numCols);
    columns.forEach(() => {
      columnWidths.push(availableWidth / numCols);
    });

    // Calcular nï¿½mero de pï¿½ginas
    const rowsPerPage = Math.floor((pageHeight - dataStartY - 15) / rowHeight); // 15 para rodapï¿½
    const totalPages = Math.ceil(pdfData.length / rowsPerPage);

    // Funï¿½ï¿½o para desenhar cabeï¿½alho de pï¿½gina
    const drawPageHeader = (pageNum) => {
      const y = margin;
      doc.setFontSize(16);
      doc.setTextColor(0);
      doc.text('G-FinanceSuite ï¿½ Relatï¿½rio de Exportaï¿½ï¿½o', margin, y);

      doc.setFontSize(9);
      doc.setTextColor(100);
      doc.text(`Gerado: ${new Date().toLocaleString('pt-PT')}`, margin, y + 8);
      doc.text(`Registos: ${fmtN(pdfData.length)} | Colunas: ${columns.length}`, margin, y + 14);

      // Separador
      doc.setDrawColor(200);
      doc.line(margin, y + 18, pageWidth - margin, y + 18);
    };

    // Funï¿½ï¿½o para desenhar cabeï¿½alho da tabela
    const drawTableHeader = (startY) => {
      doc.setFont(undefined, 'bold');
      doc.setFontSize(9);
      doc.setTextColor(255);
      doc.setFillColor(37, 99, 235); // Azul G-FinanceSuite

      let xPos = tableMargin;
      columns.forEach((col, idx) => {
        doc.rect(xPos, startY, columnWidths[idx], rowHeight, 'F');
        doc.text(
          col.substring(0, 12),
          xPos + cellPadding,
          startY + rowHeight - cellPadding,
          { maxWidth: columnWidths[idx] - (cellPadding * 2), align: 'left' }
        );
        xPos += columnWidths[idx];
      });
    };

    // Funï¿½ï¿½o para desenhar rodapï¿½ com paginaï¿½ï¿½o
    const drawPageFooter = (currentPageNum) => {
      const footerY = pageHeight - 6;
      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.text('ï¿½ 2026 G-FinanceSuite', margin, footerY);

      // Paginaï¿½ï¿½o
      const pageText = `${currentPageNum}/${totalPages}`;
      const pageTextWidth = doc.getStringUnitWidth(pageText) * doc.internal.getFontSize() / doc.internal.scaleFactor;
      doc.text(pageText, pageWidth - margin - pageTextWidth, footerY);
    };

    // Primeira pï¿½gina - cabeï¿½alho
    let currentY = dataStartY;
    drawPageHeader(1);
    drawTableHeader(currentY);
    currentY += rowHeight;

    // Desenhar dados
    doc.setFont(undefined, 'normal');
    doc.setFontSize(8);
    doc.setTextColor(50);

    let currentPage = 1;
    let rowsInPage = 0;

    pdfData.forEach((record, dataIdx) => {
      // Verificar se precisa nova pï¿½gina
      if (rowsInPage >= rowsPerPage && currentY + rowHeight > pageHeight - 15) {
        // Desenhar rodapï¿½ da pï¿½gina atual
        drawPageFooter(currentPage);

        // Nova pï¿½gina
        doc.addPage();
        currentPage++;
        currentY = margin + 8; // Espaï¿½o pequeno no topo
        rowsInPage = 0;

        // Desenhar cabeï¿½alho da tabela na nova pï¿½gina
        drawTableHeader(currentY);
        currentY += rowHeight;
      }

      // Desenhar linha de dados
      let xPos = tableMargin;
      columns.forEach((col, colIdx) => {
        let cellValue = record[col];
        let displayValue = '';

        if (cellValue === null || cellValue === undefined) {
          displayValue = 'ï¿½';
        } else if (typeof cellValue === 'number') {
          displayValue = fmt(cellValue);
        } else {
          displayValue = String(cellValue).substring(0, 20);
        }

        doc.text(
          displayValue,
          xPos + cellPadding,
          currentY + rowHeight - cellPadding,
          { maxWidth: columnWidths[colIdx] - (cellPadding * 2) }
        );
        xPos += columnWidths[colIdx];
      });

      // Desenhar linha (sem preenchimento de cor)
      doc.setDrawColor(230);
      doc.line(tableMargin, currentY + rowHeight, pageWidth - margin, currentY + rowHeight);

      currentY += rowHeight;
      rowsInPage++;
    });

    // Rodapï¿½ da ï¿½ltima pï¿½gina
    drawPageFooter(currentPage);

    // Salvar (Priority 1: Try/catch granular)
    try {
      doc.save(`${filename}.pdf`);
      Logger.info(`? PDF exportado com sucesso: ${filename}.pdf`);
    } catch (e) {
      Logger.error(`Erro ao salvar PDF: ${(e as Error).message}`);
      throw e;
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    Logger.error(`Erro ao gerar PDF: ${errorMsg}`);
    alert(`? Erro ao gerar PDF: ${errorMsg}\n\nVerifica a consola para detalhes.`);
  }
}

/**
 * Descarrega um ficheiro criando um blob e link de download
 * @param {Blob} blob - Dados a descarregar
 * @param {string} filename - Nome do ficheiro a descarregar
 */
function downloadFile(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
      // Verificar se precisa nova pï¿½gina
      if (rowsInPage >= rowsPerPage && currentY + rowHeight > pageHeight - 15) {
        // Desenhar rodapï¿½ da pï¿½gina atual
        drawPageFooter(currentPage);

        // Nova pï¿½gina
        doc.addPage();
        currentPage++;
        currentY = margin + 8; // Espaï¿½o pequeno no topo
        rowsInPage = 0;

        // Desenhar cabeï¿½alho da tabela na nova pï¿½gina
        drawTableHeader(currentY);
        currentY += rowHeight;
      }

      // Desenhar linha de dados
      let xPos = tableMargin;
      columns.forEach((col, colIdx) => {
        let cellValue = record[col];
        let displayValue = '';

        if (cellValue === null || cellValue === undefined) {
          displayValue = 'ï¿½';
        } else if (typeof cellValue === 'number') {
          displayValue = fmt(cellValue);
        } else {
          displayValue = String(cellValue).substring(0, 20);
        }

        doc.text(
          displayValue,
          xPos + cellPadding,
          currentY + rowHeight - cellPadding,
          { maxWidth: columnWidths[colIdx] - (cellPadding * 2) }
        );
        xPos += columnWidths[colIdx];
      });

      // Desenhar linha (sem preenchimento de cor)
      doc.setDrawColor(230);
      doc.line(tableMargin, currentY + rowHeight, pageWidth - margin, currentY + rowHeight);

      currentY += rowHeight;
      rowsInPage++;
    });

    // Rodapï¿½ da ï¿½ltima pï¿½gina
    drawPageFooter(currentPage);

    // Salvar (Priority 1: Try/catch granular)
    try {
      doc.save(`${filename}.pdf`);
      Logger.info(`? PDF exportado com sucesso: ${filename}.pdf`);
    } catch (e) {
      Logger.error(`Erro ao salvar PDF: ${(e as Error).message}`);
      throw e;
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    Logger.error(`Erro ao gerar PDF: ${errorMsg}`);
    alert(`? Erro ao gerar PDF: ${errorMsg}\n\nVerifica a consola para detalhes.`);
  }
}

/**
 * Descarrega um ficheiro criando um blob e link de download
 * @param {Blob} blob - Dados a descarregar
 * @param {string} filename - Nome do ficheiro a descarregar
 */
function downloadFile(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function renderPagination(totalPages, callback) {
  const pagBtns = document.getElementById('pag-btns');
  if (!pagBtns) return;

  pagBtns.innerHTML = '';
  if (totalPages <= 1) return;

  const addBtn = (num, label) => {
    const btn = document.createElement('button');
    btn.textContent = label || num;
    btn.style.cssText = `padding:6px 10px;border:1px solid #ddd;background:${currentPage===num?'#8ec73d':'#fff'};color:${currentPage===num?'#fff':'#333'};border-radius:4px;cursor:pointer;`;
    if (currentPage !== num) btn.onclick = () => { currentPage=num; callback(); };
    pagBtns.appendChild(btn);
  };

  if (currentPage > 1) addBtn(currentPage-1, '? Anterior');
  for (let i=1; i<=totalPages; i++) {
    if (i===1 || i===totalPages || Math.abs(i-currentPage)<=1) addBtn(i);
    else if (i===2 || i===totalPages-1) pagBtns.appendChild(document.createTextNode('...'));
  }
  if (currentPage < totalPages) addBtn(currentPage+1, 'Prï¿½xima ?');
}

/* --------------------------------------------------------------
   INICIALIZAï¿½ï¿½O DA Pï¿½GINA
   -------------------------------------------------------------- */
document.addEventListener('DOMContentLoaded', () => {
  hide('progress-section');
  hide('mapping-section');
  hide('content');
  hide('results-section');
  show('import-section');
  const logPanel = document.getElementById('log-panel');
  if (logPanel) {
    logPanel.classList.add('collapsed');
    const chevron = document.getElementById('log-chevron');
    if (chevron) chevron.textContent = '?';
  }
  Logger.info('Portal inicializado');
});
{ maxWidth: columnWidths[idx] - (cellPadding * 2), align: 'left' }
        );
        xPos += columnWidths[idx];
      });
    };

    // Funï¿½ï¿½o para desenhar rodapï¿½ com paginaï¿½ï¿½o
    const drawPageFooter = (currentPageNum) => {
      const footerY = pageHeight - 6;
      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.text('ï¿½ 2026 G-FinanceSuite', margin, footerY);

      // Paginaï¿½ï¿½o
      const pageText = `${currentPageNum}/${totalPages}`;
      const pageTextWidth = doc.getStringUnitWidth(pageText) * doc.internal.getFontSize() / doc.internal.scaleFactor;
      doc.text(pageText, pageWidth - margin - pageTextWidth, footerY);
    };

    // Primeira pï¿½gina - cabeï¿½alho
    let currentY = dataStartY;
    drawPageHeader(1);
    drawTableHeader(currentY);
    currentY += rowHeight;

    // Desenhar dados
    doc.setFont(undefined, 'normal');
    doc.setFontSize(8);
    doc.setTextColor(50);

    let currentPage = 1;
    let rowsInPage = 0;

    pdfData.forEach((record, dataIdx) => {
      // Verificar se precisa nova pï¿½gina
      if (rowsInPage >= rowsPerPage && currentY + rowHeight > pageHeight - 15) {
        // Desenhar rodapï¿½ da pï¿½gina atual
        drawPageFooter(currentPage);

        // Nova pï¿½gina
        doc.addPage();
        currentPage++;
        currentY = margin + 8; // Espaï¿½o pequeno no topo
        rowsInPage = 0;

        // Desenhar cabeï¿½alho da tabela na nova pï¿½gina
        drawTableHeader(currentY);
        currentY += rowHeight;
      }

      // Desenhar linha de dados
      let xPos = tableMargin;
      columns.forEach((col, colIdx) => {
        let cellValue = record[col];
        let displayValue = '';

        if (cellValue === null || cellValue === undefined) {
          displayValue = 'ï¿½';
        } else if (typeof cellValue === 'number') {
          displayValue = fmt(cellValue);
        } else {
          displayValue = String(cellValue).substring(0, 20);
        }

        doc.text(
          displayValue,
          xPos + cellPadding,
          currentY + rowHeight - cellPadding,
          { maxWidth: columnWidths[colIdx] - (cellPadding * 2) }
        );
        xPos += columnWidths[colIdx];
      });

      // Desenhar linha (sem preenchimento de cor)
      doc.setDrawColor(230);
      doc.line(tableMargin, currentY + rowHeight, pageWidth - margin, currentY + rowHeight);

      currentY += rowHeight;
      rowsInPage++;
    });

    // Rodapï¿½ da ï¿½ltima pï¿½gina
    drawPageFooter(currentPage);

    // Salvar (Priority 1: Try/catch granular)
    try {
      doc.save(`${filename}.pdf`);
      Logger.info(`? PDF exportado com sucesso: ${filename}.pdf`);
    } catch (e) {
      Logger.error(`Erro ao salvar PDF: ${(e as Error).message}`);
      throw e;
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    Logger.error(`Erro ao gerar PDF: ${errorMsg}`);
    alert(`? Erro ao gerar PDF: ${errorMsg}\n\nVerifica a consola para detalhes.`);
  }
}

/**
 * Descarrega um ficheiro criando um blob e link de download
 * @param {Blob} blob - Dados a descarregar
 * @param {string} filename - Nome do ficheiro a descarregar
 */
function downloadFile(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}


