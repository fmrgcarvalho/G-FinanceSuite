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
  format: 'csv' | 'json' | 'xml' | 'xlsx' | 'pdf';
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
    (console[consoleMethod as keyof typeof console] as Function)(`[${level}] ${msg}`);
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

// Ordenaão de tabela
let sortState: SortState = {
  field: null,
  direction: 'asc'
};

// Estado temporário durante mapeamento Excel
let _excelRows: unknown[][] = [];
let _excelHeaders: string[] = [];
let _excelFile: File | null = null;

// Fila de processamento ã mãltiplos ficheiros
let fileQueue: FileQueueItem[] = [];
let processingQueue: boolean = false;
let isSequentialProcessing: boolean = false;
let consolidatedFiles: ConsolidatedFile[] = [];
let mappings: Mapping = {};
let fileDataMap: FileDataMap = {};

/* --------------------------------------------------------------
   DRAG & DROP / IMPORTAÃO (MÚLTIPLOS FICHEIROS)
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
  console.warn('?? Elemento #file-input não encontrado!');
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
 * Adiciona ficheiros ã fila de processamento
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
      console.log(`? Adicionado ã fila: ${file.name}`);
    }
  }

  console.log(`Total de ficheiros vãlidos: ${validCount}/${files.length}`);
  updateQueueUI();

  if (validCount === 0) {
    alert('?? Nenhum ficheiro vãlido foi seleccionado.\n\nFormatos suportados: .xlsx, .xls, .csv, .json, .xml\nTamanho mãximo: 500MB');
  }
}

/**
 * Valida um ficheiro (tipo e tamanho)
 * @param {File} file - Ficheiro a validar
 * @returns {boolean} Verdadeiro se o ficheiro ã vãlido
 */
function isValidFile(file: File): boolean {
  const valid: boolean = isExcel(file.name) || isCSV(file.name) || isJSON(file.name) || isXML(file.name);
  if (!valid) {
    Logger.warn(`Ficheiro ${file.name} não suportado ã ignorado.`);
    return false;
  }

  const maxSize: number = 500 * 1024 * 1024; // 500 MB
  if (file.size > maxSize) {
    Logger.warn(`Ficheiro ${file.name} ã muito grande (${(file.size / 1024 / 1024).toFixed(0)}MB) ã limite: 500MB ã ignorado.`);
    return false;
  }

  return true;
}

function updateQueueUI() {
  const queueEl = document.getElementById('files-queue');
  const listEl = document.getElementById('files-queue-list');

  console.log('updateQueueUI: fileQueue tem', fileQueue.length, 'ficheiros');

  if (!queueEl || !listEl) {
    console.warn('?? Elementos de fila não encontrados no DOM');
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
    // Botão "Processar todos" se houver mãltiplos ficheiros pendentes
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

    // Mostrar botão "Analisar e Consolidar" se hã PELO MENOS 1 ficheiro pronto
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

/** Processa um ficheiro individual (extrai dados, sem ir para anãlise) */
function processSingleFile(queueIndex) {
  const item = fileQueue[queueIndex];
  if (!item) return;

  if (item.status === 'success') {
    alert('Este ficheiro jã foi processado.');
    return;
  }

  // Processar apenas este ficheiro
  // REMOVER progress-section ã usar log panel em vez disso
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

/** Consolida ficheiros processados com sucesso e salta para anãlise */
function startAnalysis() {
  const successFiles = fileQueue.filter(f => f.status === 'success');

  if (successFiles.length === 0) {
    alert('Nenhum ficheiro foi processado com sucesso.');
    return;
  }

  Logger.separator(`Consolidaão de ${successFiles.length} ficheiro(s) processado(s)`);

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
      Logger.error('Consolidaão: sem dados');
      return;
    }

    Logger.info(`Consolidaão completa: ${rawData.length} registos totais`);

    // Extrair campos unificados
    const allFields = new Set();
    consolidatedFiles.forEach(file => {
      if (file.fields) {
        file.fields.forEach(f => allFields.add(f));
      }
    });

    modelFields = Array.from(allFields);

    // NãO salta para anãlise ã fica na pãgina de upload
    fileName = `${successFiles.length} ficheiro${successFiles.length !== 1 ? 's' : ''} consolidado${successFiles.length !== 1 ? 's' : ''}`;

    Logger.info('? Consolidaão pronta! Os dados estão prontos para anãlise.');
    Logger.info('Clique em uma operaão (Duplicados ou Reconciliaão) para comeãar.');

    // Preparar anãlise - chamar showContent para renderizar campos
    showContent();
  } catch (err) {
    Logger.error(`Consolidação falhou: ${err instanceof Error ? err.message : String(err)}`);
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

  // Não sai da pãgina de upload ã mantãm visualizaão da fila
  Logger.separator(`Processamento de ${fileQueue.length} ficheiro(s)`);
  Logger.info(`Iniciando processamento sequencialã`);
  processNextFile();
}

/** Processa ficheiros sequencialmente */
function processNextFile() {
  const pending = fileQueue.find(f => f.status === 'pending');

  if (!pending) {
    // Todos processados ã consolidar
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
   CARREGAR DE FILA ã FUNããES PARA MãLTIPLOS FICHEIROS
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
        // Fechar log panel apãs 5 segundos (tempo para ler resultado)
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
      Logger.error(`JSON ${queueItem.file.name}: ${err instanceof Error ? err.message : String(err)}`);
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
    Logger.error(`JSON ${queueItem.file.name}: Erro ao ler ficheiro${isSequentialProcessing ? ' ã a continuar com os outros' : ''}`);
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
        throw new Error('XML invãlido ã erro de parsing');
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

          // Tentar converter para nãmero
          if (value && !isNaN(Number(value)) && value.trim() !== '') {
            value = Number(value);
          }

          record[key] = value;
        }

        data.push(record);
      }

      if (data.length === 0) {
        throw new Error('Nenhum registo vãlido extraãdo do XML');
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
    Logger.error(`XML ${queueItem.file.name}: Erro ao ler ficheiro${isSequentialProcessing ? ' ã a continuar com os outros' : ''}`);
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
      Logger.error(`CSV ${queueItem.file.name}: ${err instanceof Error ? err.message : String(err)}`);
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
    Logger.error(`CSV ${queueItem.file.name}: Erro ao ler ficheiro${isSequentialProcessing ? ' ã a continuar com os outros' : ''}`);
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
    // Usar thread principal para Excel tambãm
    processExcelFromQueueMainThread(e.target.result, queueItem);
  };

  reader.onerror = () => {
    queueItem.status = 'error';
    Logger.error(`Excel ${queueItem.file.name}: Erro ao ler ficheiro ã a continuar com os outros`);
    updateQueueUI();
    processNextFile();
  };

  reader.readAsArrayBuffer(queueItem.file);
}

async function processExcelFromQueueMainThread(buffer, queueItem) {
  if (typeof XLSX === 'undefined') {
    Logger.warn('SheetJS ainda não carregado ã a aguardarã');
    let tries = 0;
    const wait = setInterval(() => {
      tries++;
      if (typeof XLSX !== 'undefined') {
        clearInterval(wait);
        processExcelFromQueueMainThread(buffer, queueItem);
      } else if (tries >= 100) {
        clearInterval(wait);
        queueItem.status = 'error';
        Logger.error(`Excel ${queueItem.file.name}: SheetJS não carregou${isSequentialProcessing ? ' ã a continuar com os outros' : ''}`);
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
      { label: 'ultra-leve (sem fãrmulas)', opts: { type: 'array', raw: true, cellDates: false, cellFormula: false, cellStyles: false, cellNF: false, sheetStubs: false } },
      { label: 'leve (sem valores)', opts: { type: 'array', raw: true, cellDates: false, cellFormula: false, cellStyles: false } },
      { label: 'sheetStubs', opts: { type: 'array', raw: true, cellDates: false, cellFormula: false, sheetStubs: true } },
      { label: 'raw:false', opts: { type: 'array', raw: false, cellDates: false, cellFormula: false, cellStyles: false } },
      { label: 'completo', opts: { type: 'array', raw: true, cellDates: false } },
    ];

    let ws = null, rows = [];
    let lastError = null;

    for (const strat of strategies) {
      try {
        Logger.info(`  A tentar estratãgia: ${strat.label}ã`);
        const wb = XLSX.read(data, strat.opts);
        const candidates = [...new Set([...wb.SheetNames, ...Object.keys(wb.Sheets)])];
        ws = null;

        for (const name of candidates) {
          const s = wb.Sheets[name];
          if (s) { ws = s; break; }
        }

        if (!ws) {
          Logger.warn(`Nenhuma folha acessãvel com estratãgia ${strat.label}`);
          continue;
        }

        rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });
        Logger.info(`Estratãgia ${strat.label}: ${rows.length} linhas`);

        // IMPORTANTE: Não usar readCellsDirect para ficheiros com >100k linhas
        if (rows.length < 2 && ws['!ref']) {
          try {
            const range = XLSX.utils.decode_range(ws['!ref']);
            const maxRows = range.e.r - range.s.r + 1;
            if (maxRows <= 100000) {
              rows = readCellsDirect(ws);
              Logger.info(`readCellsDirect: ${rows.length} linhas`);
            } else {
              Logger.warn(`Range muito grande (${maxRows} linhas) ã skipping readCellsDirect`);
            }
          } catch (cellErr) {
            Logger.warn(`readCellsDirect falhou: ${cellErr instanceof Error ? cellErr.message : String(cellErr)}`);
          }
        }

        if (rows.length >= 2) {
          Logger.info(`? Estratãgia ${strat.label} funcionou!`);
          break;
        }
        Logger.warn(`Estratãgia ${strat.label}: dados insuficientes`);
      } catch (stratErr) {
        lastError = stratErr;
        Logger.warn(`Estratégia ${strat.label} falhou: ${stratErr instanceof Error ? stratErr.message : String(stratErr)}`);
        continue;
      }
    }

    if (!ws || rows.length < 2) {
      throw new Error(`Ficheiro Excel sem dados legãveis. ãltima estratãgia erro: ${lastError?.message || 'desconhecido'}`);
    }

    // Avisar se ficheiro ã muito grande
    if (rows.length > 100000) {
      Logger.warn(`?? Ficheiro grande (${rows.length.toLocaleString('pt-PT')} linhas) ã pode ser lento`);
    }

    // Detetar cabeãalho
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
    const maxTime = 120000; // 2 minutos mãximo

    Logger.info(`Iniciando conversão de registos (chunk size: ${chunkSize})ã`);

    for (let i = hIdx + 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || !row.some(v => v != null && String(v).trim() !== '')) continue;

      try {
        const rec = buildRecord(row, mapping, queueItem.file.name);
        records.push(rec);
      } catch (recordErr) {
        Logger.warn(`Linha ${i + 1}: Erro ao converter (${recordErr instanceof Error ? recordErr.message : String(recordErr)})`);
        continue;
      }

      // Dar tempo ao browser a cada chunk e mostrar progresso
      if (records.length % chunkSize === 0) {
        const elapsed = performance.now() - t0;
        if (elapsed > maxTime) {
          throw new Error(`Processamento excedeu ${maxTime / 1000}s. Ficheiro muito grande.`);
        }
        const elapsedSec = (elapsed / 1000).toFixed(1);
        Logger.info(`  ${records.length.toLocaleString('pt-PT')} registos processados em ${elapsedSec}sã`);
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }

    if (!records.length) {
      throw new Error('Nenhum registo apãs o cabeãalho.');
    }

    const conversionTime = ((performance.now() - t0) / 1000).toFixed(1);
    Logger.info(`? Conversão concluãda: ${records.length.toLocaleString('pt-PT')} registos em ${conversionTime}s`);

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
      Logger.error(`Excel ${queueItem.file.name}: Stack overflow ã ficheiro pode estar corrompido`);
      Logger.info(`?? Tenta: (1) Reabrir em Excel e guardar novamente, (2) Remover fãrmulas complexas, (3) Converter para CSV`);
    } else {
      errorMsg = err.message.substring(0, 100); // Truncar mensagem longa
      Logger.error(`Excel ${queueItem.file.name}: ${err instanceof Error ? err.message : String(err)}`);
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

/** Finalizar consolidaão ã mesclar todos os dados e avanãar */
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

  // Verificar se hã dados anteriores (modo "Adicionar ficheiros")
  const hasPreviousData = window._previousConsolidatedData && window._previousConsolidatedData.length > 0;
  const previousCount = hasPreviousData ? window._previousConsolidatedData.length : 0;

  // Relatãrio de processamento
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

  // Se não hã dados novos, verificar se hã dados anteriores
  if (newData.length === 0) {
    if (hasPreviousData) {
      Logger.warn('Nenhum registo encontrado nos ficheiros novos.');
      Logger.info('? Mantendo dados anteriores.');
      // Voltar aos dados anteriores
      rawData = [...window._previousConsolidatedData];
      // NãO salta para anãlise ã fica na pãgina de upload
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

  // Normalizar dados ã garantir que todos tãm os mesmos campos
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

  Logger.separator('CONSOLIDAããO CONCLUãDA COM SUCESSO');
  Logger.info(`Ficheiros com dados: ${consolidatedFiles.join(', ')}`);
  Logger.info(`Total de registos: ${rawData.length.toLocaleString('pt-PT')}`);
  Logger.info(`Campos ãnicos: ${allKeys.length}`);
  if (failCount > 0) {
    Logger.info(`?? ${failCount} ficheiro(s) falharam mas continuou com os ${successCount} vãlidos`);
  }

  // Limpar referãncia aos dados anteriores
  window._previousConsolidatedData = null;
  window._previousConsolidatedCount = 0;

  setProgress(100, 'Pronto!', `${rawData.length.toLocaleString('pt-PT')} registos consolidados`);

  setTimeout(() => {
    hide('progress-section');
    showContent();
  }, 500);
}

/* --------------------------------------------------------------
   CARREGAR JSON (LEGACY ã um ficheiro)
   -------------------------------------------------------------- */
function loadJSON(file) {
  Logger.separator('Importaão JSON');
  Logger.info(`Ficheiro: ${file.name} (${(file.size/1024/1024).toFixed(2)} MB)`);

  const reader = new FileReader();
  reader.onprogress = e => {
    if (e.lengthComputable) {
      setProgress(Math.round(e.loaded/e.total*70), 'A ler ficheiroã',
        `${Math.round(e.loaded/e.total*100)}% ã ${(e.loaded/1024/1024).toFixed(1)} MB`);
    }
  };
  reader.onload = e => {
    Logger.info('Ficheiro em memãria ã parse JSONã');
    setProgress(80, 'A processar JSONã', 'A converter estrutura de dadosã');
    setTimeout(() => {
      try {
        const t0 = performance.now();
        const obj = JSON.parse(e.target.result);
        Logger.info(`Parse JSON: ${(performance.now()-t0).toFixed(0)} ms`);
        rawData = obj.registos || obj.data || obj.records || (Array.isArray(obj)?obj:[]);
        if (!rawData.length) throw new Error('Nenhum registo encontrado.');
        Logger.info(`${rawData.length.toLocaleString('pt-PT')} registos carregados`);
        setProgress(100,'Concluãdo!', `${fmtN(rawData.length)} registos`);
        setTimeout(() => showContent(), 300);
      } catch(err) {
        Logger.error(`Erro JSON: ${err instanceof Error ? err.message : String(err)}`);
        alert('Erro ao processar o ficheiro:\n'+(err instanceof Error ? err.message : String(err)));
        resetAll();
      }
    }, 50);
  };
  reader.onerror = e => { Logger.error('Erro FileReader'); alert('Erro ao ler.'); resetAll(); };
  reader.readAsText(file,'utf-8');
}

/* --------------------------------------------------------------
   CARREGAR EXCEL ã via Web Worker (não bloqueia o UI thread)
   -------------------------------------------------------------- */
function loadExcel(file) {
  Logger.separator('Importaão Excel');
  Logger.info(`Ficheiro: ${file.name} (${(file.size/1024/1024).toFixed(2)} MB)`);

  const reader = new FileReader();
  reader.onprogress = e => {
    if (e.lengthComputable)
      setProgress(
        Math.round(e.loaded / e.total * 35),
        'A ler ficheiro Excelã',
        `${Math.round(e.loaded/e.total*100)}% ã ${(e.loaded/1024/1024).toFixed(1)} MB`
      );
  };

  reader.onload = e => {
    // file:// nunca suporta Workers (origin 'null') ã ir direto ao thread principal
    if (window.location.protocol === 'file:') {
      Logger.info('Modo ficheiro local ã a processar no thread principalã');
      setProgress(38, 'A iniciar processamentoã', 'thread principal');
      processExcelMainThread(e.target.result, file);
      return;
    }

    setProgress(38, 'A iniciar processamentoã', 'A enviar para worker threadã');
    Logger.info('Ficheiro lido ã a lanãar Web Workerã');

    let worker;
    try {
      worker = new Worker('js/excel.worker.js');
    } catch (err) {
      Logger.warn(`Web Worker falhou (${err.message}) ã a processar no thread principalã`);
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
      Logger.warn('A tentar fallback no thread principalã');
      processExcelMainThread(e.target.result, file);
    };

    // Transferir o ArrayBuffer para o worker (zero-copy)
    worker.postMessage({ buffer: e.target.result }, [e.target.result]);
  };

  reader.onerror = () => { Logger.error('Erro FileReader'); alert('Erro ao ler.'); resetAll(); };
  reader.readAsArrayBuffer(file);
}

/* Fallback: processar no thread principal se Worker não estiver disponãvel */
function processExcelMainThread(buffer, file) {
  // SheetJS pode estar ainda a carregar (injeão dinãmica) ã aguardar atã 10s
  if (typeof XLSX === 'undefined') {
    Logger.warn('SheetJS ainda não carregado ã a aguardarã');
    let tries = 0;
    const wait = setInterval(() => {
      tries++;
      if (typeof XLSX !== 'undefined') {
        clearInterval(wait);
        Logger.info('SheetJS carregado ã a retomar processamentoã');
        processExcelMainThread(buffer, file);
      } else if (tries >= 100) {
        clearInterval(wait);
        const msg = 'SheetJS não carregou apãs 10s. Verifica a ligaão ã internet.';
        Logger.error(msg); alert(msg); resetAll();
      }
    }, 100);
    return;
  }
  setProgress(50, 'A descompactar workbookã', '(thread principal)');
  setTimeout(() => {
    try {
      const t0   = performance.now();
      const data = new Uint8Array(buffer);

      // Estratãgias de leitura ã da mais leve para a mais completa
      const strategies = [
        { label:'leve (sem fãrmulas/estilos)', opts:{ type:'array', raw:true,  cellDates:false, cellFormula:false, cellStyles:false, cellNF:false, sheetStubs:false } },
        { label:'sheetStubs',                  opts:{ type:'array', raw:true,  cellDates:false, cellFormula:false, sheetStubs:true  } },
        { label:'raw:false',                   opts:{ type:'array', raw:false, cellDates:false, cellFormula:false, cellStyles:false  } },
        { label:'completo',                    opts:{ type:'array', raw:true,  cellDates:false                                      } },
      ];

      let ws = null, rows = [];
      for (const strat of strategies) {
        try {
          Logger.info(`A tentar estratãgia: ${strat.label}ã`);
          setProgress(50, `A ler workbookã`, strat.label);
          const wb = XLSX.read(data, strat.opts);
          Logger.info(`SheetNames: [${wb.SheetNames.join(', ')}] ã Sheets keys: [${Object.keys(wb.Sheets).join(', ')}]`);

          // Encontrar folha com dados
          const candidates = [...new Set([...wb.SheetNames, ...Object.keys(wb.Sheets)])];
          ws = null;
          for (const name of candidates) {
            const s = wb.Sheets[name];
            if (s) { ws = s; Logger.info(`Folha: "${name}" ã ref: ${s['!ref']||'sem ref'}`); break; }
          }
          if (!ws) { Logger.warn('Sem folha acessãvel nesta estratãgia ã a tentar prãximaã'); continue; }

          setProgress(70, 'A extrair linhasã', '');
          rows = XLSX.utils.sheet_to_json(ws, { header:1, defval:null, raw:true });
          Logger.info(`sheet_to_json: ${rows.length} linhas`);

          if (rows.length < 2 && ws['!ref']) {
            Logger.warn('sheet_to_json insuficiente ã leitura diretaã');
            rows = readCellsDirect(ws);
            Logger.info(`Leitura direta: ${rows.length} linhas`);
          }

          if (rows.length >= 2) break; // sucesso
          Logger.warn(`Estratãgia "${strat.label}" sem dados ã a tentar prãximaã`);
        } catch (stratErr) {
          Logger.warn(`Estratãgia "${strat.label}" falhou: ${stratErr.message}`);
        }
      }

      if (!ws)   throw new Error('Nenhuma estratãgia conseguiu aceder ã folha.');
      if (rows.length < 2) throw new Error('Folha sem dados legãveis apãs todas as estratãgias. ref: ' + (ws['!ref']||'nulo'));

      Logger.info(`${rows.length.toLocaleString('pt-PT')} linhas em ${(performance.now()-t0).toFixed(0)} ms`);
      finishExcelLoad(rows, file);
    } catch(err) {
      Logger.error(`Fallback error: ${err instanceof Error ? err.message : String(err)}`);
      alert('Erro ao processar o Excel:\n' + (err instanceof Error ? err.message : String(err)));
      resetAll();
    }
  }, 60);
}

/* Passo final: detetar cabeãalho e mostrar ecrã de mapeamento */
function finishExcelLoad(rows, file) {
  let hIdx = 0;
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    if (rows[i] && rows[i].some(v => v != null && String(v).trim() !== '')) {
      hIdx = i; break;
    }
  }
  const headers = rows[hIdx].map(h => h != null ? String(h).trim() : '');
  Logger.info(`Cabeãalho linha ${hIdx+1}: ${headers.filter(Boolean).join(' | ')}`);
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
 * Fallback: lã uma folha SheetJS cãlula a cãlula via !ref.
 * ãtil quando sheet_to_json devolve 0 linhas em ficheiros complexos.
 * ?? LIMITE: Mãximo 100k linhas para evitar stack overflow
 */
function readCellsDirect(ws) {
  if (!ws['!ref']) return [];
  const range = XLSX.utils.decode_range(ws['!ref']);
  const maxRows = 100000;

  // Se o range ã muito grande, abort e deixar sheet_to_json resultado
  if ((range.e.r - range.s.r + 1) > maxRows) {
    Logger.warn(`  Range muito grande (${range.e.r - range.s.r + 1} linhas) ã abortando readCellsDirect para evitar stack overflow`);
    return [];
  }

  Logger.info(`  Range direto: R${range.s.r}C${range.s.c} ? R${range.e.r}C${range.e.c} (${range.e.r-range.s.r+1} linhas ã ${range.e.c-range.s.c+1} cols)`);

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
    Logger.warn(`  Erro em readCellsDirect (${err.message}) ã retornando ${rows.length} linhas jã lidas`);
    if (rows.length === 0) throw err; // Se não conseguiu nada, propagar erro
  }

  return rows;
}

/* --------------------------------------------------------------
   MAPEAMENTO ã ecrã de confirmaão
   -------------------------------------------------------------- */
function showMappingStep(headers, rows, hIdx) {
  show('mapping-section');

  const previewRow = rows[hIdx+1] || [];

  // Datalist com sugestães conhecidas (aliases ãnicos)
  const knownSuggestions = [...new Set(Object.values(COLUMN_ALIASES))].sort();
  const datalist = `<datalist id="field-suggestions">
    ${knownSuggestions.map(s=>`<option value="${s}">`).join('')}
  </datalist>`;

  const rowsHtml = headers.map((h, i) => {
    if (!h) return '';
    const suggested = suggestField(h) || '';
    const preview   = previewRow[i]!=null ? String(previewRow[i]).substring(0,50) : 'ã';
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
        <th>Exemplo ã tipo detetado</th>
        <th></th>
        <th>Nome do campo (editãvel)</th>
      </tr></thead>
      <tbody>${rowsHtml}</tbody>
    </table>`;

  updateMapSummary();
  Logger.info('Mapeamento dinãmico apresentado ã campos livres, editãveis pelo utilizador.');
}

/** Indica o tipo provãvel de um campo para ajudar o utilizador */
function guessFieldType(fieldName, sampleVal) {
  if (isLikelyDate(fieldName, sampleVal))    return '?? data';
  if (isLikelyNumeric(fieldName, sampleVal)) return '?? numãrico';
  if (sampleVal==null)                        return 'ã vazio';
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
  let html = `<strong>${mapped}</strong> campo(s) ã <span style="color:var(--muted)">${ignored} ignorados</span>`;
  if (hasDups) html += ` ã <span style="color:var(--red)">? nomes duplicados</span>`;
  document.getElementById('map-summary').innerHTML = html;
}

/* --------------------------------------------------------------
   CONFIRMAR MAPEAMENTO ã fase 2: converter e avanãar
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

  Logger.separator('Conversão Excel ? Modelo');
  Object.entries(mapping).forEach(([ci, fk]) =>
    Logger.info(`  Coluna "${_excelHeaders[parseInt(ci)]}" ? ${fk}`)
  );

  hide('mapping-section');
  show('progress-section');
  setProgress(10,'A converter registosã','');

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
          `A converterã`,`${fmtN(i)} de ${fmtN(_excelRows.length)} linhas`
        );
      }

      if (!records.length) throw new Error('Nenhum registo encontrado apãs o cabeãalho.');
      Logger.info(`${records.length.toLocaleString('pt-PT')} registos convertidos em ${(performance.now()-t0).toFixed(0)} ms`);

      // Estatãsticas rãpidas
      const mappedFields = [...new Set(Object.values(mapping))];
      const numField = mappedFields.find(f=>f==='montante');
      if (numField) {
        const withVal = records.filter(r=>r[numField]!=null).length;
        Logger.info(`Campo "${numField}" preenchido: ${withVal}/${records.length}`);
      }

      rawData = records;
      setProgress(100,'Concluãdo!',`${fmtN(records.length)} registos`);
      setTimeout(() => showContent(), 300);

    } catch(err) {
      Logger.error(`Erro na conversão: ${err.message}`);
      alert('Erro na conversão:\n'+(err instanceof Error ? err.message : String(err)));
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

/** Deteta se um campo ã provavelmente numãrico pelo nome e/ou pelo valor */
function isLikelyNumeric(fieldName, sampleVal) {
  if (/montante|valor|amount|importe|saldo|price|preco|total|quantidade|qty|custo|cost/i.test(fieldName))
    return true;
  if (typeof sampleVal === 'number' && !isLikelyDate(fieldName, sampleVal))
    return true;
  return false;
}

/** Deteta se um campo ã provavelmente uma data pelo nome e/ou pelo valor */
function isLikelyDate(fieldName, sampleVal) {
  if (/data|date|datum|dt_/i.test(fieldName)) return true;
  // Nãmero serial Excel em intervalo plausãvel (1/1/1990 a 31/12/2100)
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

/* -- Conversão de data Excel ------------------------------- */
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
   SHOW CONTENT ã constrãi UI de anãlise a partir dos dados reais
   -------------------------------------------------------------- */
function showContent() {
  hide('import-section');    // Esconder secão de upload
  hide('progress-section');
  hide('mapping-section');
  show('content');
  hide('results-section');

  document.getElementById('fi-name').textContent  = fileName;
  document.getElementById('fi-total').textContent = fmtN(rawData.length);

  // Detetar campos disponãveis dinamicamente
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

  Logger.info(`Campos disponãveis: ${availableFields.map(f=>f.key).join(', ')}`);
  document.getElementById('fi-campos').textContent = availableFields.length;
  document.getElementById('fi-sub').textContent =
    isExcel(fileName) ? 'Excel convertido com sucesso' : 'JSON carregado com sucesso';

  // Reset campos selecionados ã escolher campos ãteis por defeito
  checkedFields = new Set();
  const defaults = ['numero_documento','atribuicao','montante'];
  availableFields.forEach(f => { if (defaults.includes(f.key)) checkedFields.add(f.key); });
  if (!checkedFields.size && availableFields.length) checkedFields.add(availableFields[0].key);

  buildFieldSelector();
  buildReconConfig();
  selectOp(1);
}

/* --------------------------------------------------------------
   OP 1 ã SELETOR DE CAMPOS DINãMICO
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

  // Mostrar campos numãricos (detectados por tipo)
  const numericFields = availableFields.filter(f =>
    f.desc && (f.desc.includes('numãrico') || f.desc.includes('nãmero') || f.desc.includes('numeric'))
  );

  const opts = numericFields.map(f =>
    `<option value="${f.key}">${f.label || f.key}</option>`).join('');

  sel.innerHTML = '<option value="">ã Nenhum (sem soma) ã</option>' + opts;

  // Default: detectar campo de montante automaticamente
  const autoDetect = ['montante','MONTANTE','Montante','valor','VALOR','Valor','amount','AMOUNT']
                     .find(fname => numericFields.some(f => f.key === fname));

  if (autoDetect) {
    sel.value = autoDetect;
    selectedSumField = autoDetect;
    Logger.info(`Campo de soma automãtico: ${autoDetect}`);
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
   OP 2 ã CONFIGURAããO DINãMICA (agrupar por + campo de valor)
   -------------------------------------------------------------- */
function buildReconConfig() {
  // Preencher Op 3 field selects (faz todo o trabalho automaticamente)
  populateOp3FieldSelects();

  // Preencher selector de campo para somar (Op 1)
  buildSumFieldSelector();
}

/* --------------------------------------------------------------
   SELEããO DE OPERAããO
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
   EXECUTAR ANãLISE
   -------------------------------------------------------------- */
function runAnalysis() {
  if (selectedOp===1) runDuplicates(); else runReconciliation();
}

/* -- OP 1: DUPLICADOS ---------------------------------------- */
function runDuplicates() {
  const fields = [...checkedFields];
  if (!fields.length) { alert('Seleciona pelo menos um campo.'); return; }

  Logger.separator('Anãlise de Duplicados');
  Logger.info(`Campos: ${fields.join(', ')} ã ${rawData.length.toLocaleString('pt-PT')} registos`);

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

  // Extrair registos ãnicos (grupos com 1 registo)
  uniqueRecords = [...groupMap.values()]
    .filter(g=>g.length===1)
    .map(g=>g[0]);  // Converter de grupos para registos

  if (dupGroups.length===0) Logger.info('Nenhum duplicado encontrado.');
  else Logger.warn(`${dupCount} registos em ${dupGroups.length} grupo(s) de duplicados.`);

  setSummaryCards([
    {id:'s-total',  val:fmtN(rawData.length),          label:'Total de registos',   cls:'total'},
    {id:'s-dups',   val:fmtN(dupCount),                 label:'Registos duplicados', cls:'dups'},
    {id:'s-unique', val:fmtN(rawData.length-dupCount),  label:'Registos ãnicos',     cls:'clean'},
    {id:'s-groups', val:fmtN(dupGroups.length),         label:'Grupos duplicados',   cls:'info'},
  ]);

  document.getElementById('results-title').textContent = '';
  currentPage=1;
  activeFilters.type = 'all';  // Comeãar com "Total registos"
  show('results-section');
  setFilterTypeFromCard('all');  // Isso chama renderDuplicates com tipo correto
  document.getElementById('results-section').scrollIntoView({behavior:'smooth',block:'start'});
}

/* -- OP 2: RECONCILIAããO (dinãmica) ------------------------- */
function runReconciliation() {
  const groupField = document.getElementById('op3-group-field-select').value;
  const valField   = document.getElementById('op3-value-field-select').value;
  const tolerance  = Math.abs(parseFloat(document.getElementById('op3-tolerance-input').value)||1);

  if (!groupField) { alert('Escolhe o campo de agrupamento.'); return; }
  if (!valField)   { alert('Escolhe o campo de valor.'); return; }

  Logger.separator('Reconciliaão');
  Logger.info(`Agrupar por: ${groupField} ã Valor: ${valField} ã Tolerãncia: ã${tolerance.toFixed(2)}`);

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

  Logger.info(`Reconciliados: ${reconOk.length} ã Por reconciliar: ${reconNok.length}`);
  if (reconNok.length) Logger.warn(`${reconNok.length} grupo(s) com saldo acima da tolerãncia.`);

  setSummaryCards([
    {id:'s-total',  val:fmtN(groupMap.size),  label:`Grupos (${groupField})`,  cls:'total'},
    {id:'s-dups',   val:fmtN(reconNok.length), label:'Por reconciliar',         cls:'dups'},
    {id:'s-unique', val:fmtN(reconOk.length),  label:'Reconciliados',           cls:'clean'},
    {id:'s-groups', val:`ã ${fmt(tolerance)}`, label:'Tolerãncia',              cls:'info'},
  ]);

  document.getElementById('results-title').textContent = '';
  document.getElementById('results-meta').textContent  =
    `${fmtN(reconNok.length)} por reconciliar ã ${fmtN(reconOk.length)} reconciliados`;

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

    // Aplicar ordenaão
    const sortedRecords = sortState.field ? sortRecords(allRecords, sortState.field, sortState.direction) : allRecords;

    const totalPages = Math.ceil(sortedRecords.length/PAGE_SIZE);
    const start = (currentPage-1)*PAGE_SIZE;
    const slice = sortedRecords.slice(start, start+PAGE_SIZE);
    const ctxKeys = availableFields.map(f=>f.key);
    const showCols = [...new Set([...fields,...ctxKeys])].filter(k=>k in (rawData[0]||{}));

    const rows = slice.map(r=>`<tr>${showCols.map(f=>{
      const v=r[f];
      if (typeof v==='number') return `<td class="${v<0?'amount-neg':'amount-pos'}">${fmt(v)}</td>`;
      return `<td class="${['numero_documento','atribuicao','conta','referencia'].includes(f)?'mono':''}">${v??'ã'}</td>`;
    }).join('')}</tr>`).join('');

    const headerCells = showCols.map(f=>
      `<th style="cursor:pointer;user-select:none;padding:8px;background:#f5f5f5;border-bottom:2px solid #ddd;" onclick="setSortField('${f}')">${f.replace(/_/g,' ')}${getSortIndicator(f)}</th>`
    ).join('');

    // Calcular somatãrio total de todos os registos
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
    document.getElementById('pag-info').textContent = `Registos ${start+1}ã${Math.min(start+PAGE_SIZE,sortedRecords.length)} de ${fmtN(sortedRecords.length)}`;
    renderPagination(totalPages,()=>renderDuplicates(fields));
    document.getElementById('pagination').style.display = sortedRecords.length > PAGE_SIZE ? 'flex' : 'none';
    setupFilters(() => renderDuplicates(fields));
    return;
  }

  // MODO "DUPLICADOS" e "ãNICOS" - COM AGRUPAMENTO
  let dataToShow = dupGroups;
  if (activeFilters.type === 'unique') {
    dataToShow = uniqueRecords.map(r => [r]);
  }

  if (!dataToShow.length) {
    let msg = '? Nenhum duplicado encontrado.';
    if (activeFilters.type === 'unique') msg = '? Nenhum registo ãnico encontrado.';
    el.innerHTML=`<div class="no-dups"><div class="big">?</div><p>${msg}</p></div>`;
    hide('pagination'); return;
  }

  // Aplicar filtros
  let filteredGroups = getFilteredGroups(dataToShow);

  if (!filteredGroups.length) {
    el.innerHTML='<div class="no-dups"><div class="big">??</div><p>Nenhum grupo corresponde aos filtros.</p></div>';
    hide('pagination'); return;
  }

  // Aplicar ordenaão aos grupos (ordena pelo primeiro registo do grupo)
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

  // Colunas de contexto: campos selecionados + campos ãteis disponãveis
  const ctxKeys  = availableFields.map(f=>f.key);
  const showCols = [...new Set([...fields,...ctxKeys])].filter(k=>k in (rawData[0]||{}));

  // MODO "UNIQUE" - TABELA SIMPLIFICADA
  if (activeFilters.type === 'unique') {
    // Flatten para lista simples (cada grupo tem 1 registo)
    const allRecords = slice.flatMap(group => group);

    // Calcular somatãrio total dos registos ãnicos
    const totalUnique = selectedSumField
      ? allRecords.reduce((s,r)=>s+(typeof r[selectedSumField]==='number'?r[selectedSumField]:0),0)
      : 0;

    const rows = allRecords.map(r=>`<tr>
      <td style="padding:8px;text-align:center;"><span style="cursor:help;font-size:20px;" title="Registo ãnico">??</span></td>
      ${showCols.map(f=>{
        const v=r[f];
        if (typeof v==='number')
          return `<td class="${v<0?'amount-neg':'amount-pos'}">${fmt(v)}</td>`;
        return `<td class="${['numero_documento','atribuicao','conta','referencia'].includes(f)?'mono':''}">${v??'ã'}</td>`;
      }).join('')}
    </tr>`).join('');

    const headerCells = `<th style="padding:8px;width:40px;text-align:center;"></th>${showCols.map(f=>
      `<th style="cursor:pointer;user-select:none;padding:8px;background:#f5f5f5;border-bottom:2px solid #ddd;" onclick="setSortField('${f}')">${f.replace(/_/g,' ')}${getSortIndicator(f)}</th>`
    ).join('')}`;

    el.innerHTML=`
      <div style="display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:16px;padding:12px;background:#f0f8f4;border-radius:8px;border:1px solid #c5e8a0;">
        <div style="display:flex;align-items:center;gap:16px">
          <span style="display:inline-block;background:#4caf50;color:white;padding:6px 14px;border-radius:20px;font-size:12px;font-weight:600;">Registos ãnicos</span>
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

    document.getElementById('pag-info').textContent = `Registos ${start+1}ã${Math.min(start+PAGE_SIZE,filteredGroups.length)} de ${fmtN(filteredGroups.length)}`;
    renderPagination(totalPages,()=>renderDuplicates(fields));
    document.getElementById('pagination').style.display=filteredGroups.length>PAGE_SIZE?'flex':'none';
    setupFilters(() => renderDuplicates(fields));
    return;
  }

  // MODO "DUPLICADOS" - COM GRUPOS
  // Calcular somatãrio total de todos os duplicados (não apenas da pãgina)
  const totalDuplicates = selectedSumField
    ? filteredGroups.reduce((sum, group) =>
        sum + group.reduce((s,r)=>s+(typeof r[selectedSumField]==='number'?r[selectedSumField]:0),0), 0)
    : 0;

  const groupsHtml = slice.map(group => {
    const keyParts = fields.map(f=>{
      const v=group[0][f];
      return typeof v==='number'?`${f}: ${fmt(v)}`:`${f}: ${v??'ã'}`;
    }).join(' ã ');

    // Usar o campo selecionado pelo utilizador
    const total = selectedSumField && group.length > 0
                ? group.reduce((s,r)=>s+(typeof r[selectedSumField]==='number'?r[selectedSumField]:0),0)
                : 0;

    // Ordenar registos dentro do grupo tambãm
    let groupRecords = [...group];
    if (sortState.field) {
      groupRecords = sortRecords(groupRecords, sortState.field, sortState.direction);
    }

    const rows  = groupRecords.map(r=>`<tr>${showCols.map(f=>{
      const v=r[f];
      if (typeof v==='number')
        return `<td class="${v<0?'amount-neg':'amount-pos'}">${fmt(v)}</td>`;
      return `<td class="${['numero_documento','atribuicao','conta','referencia'].includes(f)?'mono':''}">${v??'ã'}</td>`;
    }).join('')}</tr>`).join('');

    const headerCells = showCols.map(f=>
      `<th style="cursor:pointer;user-select:none;padding:8px;background:#f5f5f5;border-bottom:2px solid #ddd;" onclick="setSortField('${f}')">${f.replace(/_/g,' ')}${getSortIndicator(f)}</th>`
    ).join('');

    return `<div class="group-block">
      <div class="group-header">
        <span class="group-count">${group.length}ã duplicado</span>
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
    `Grupos ${start+1}ã${Math.min(start+PAGE_SIZE,filteredGroups.length)} de ${fmtN(filteredGroups.length)}`;
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

  // Mostrar/esconder filtro de "Nã duplicados" baseado na vista
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
    // activeFilters.type jã ã set por setFilterType()
    activeFilters.search = (searchInput?.value || '').toLowerCase();
    activeFilters.exactCount = exactCountInput?.value ? parseInt(exactCountInput.value) : null;
    activeFilters.minAmount = minAmtInput?.value ? parseFloat(minAmtInput.value) : null;
    activeFilters.maxAmount = maxAmtInput?.value ? parseFloat(maxAmtInput.value) : null;
    currentPage = 1; // Reset para pãgina 1
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

/** Voltar ã importaão para adicionar mais ficheiros (mantãm dados consolidados) */
function addMoreFiles() {
  const currentData = [...rawData];
  const currentCount = rawData.length;
  Logger.info('ãã Modo: Adicionar Mais Ficheiros ãã');
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
    hint.innerHTML = `Ou arrasta mais ficheiros aqui<br><small style="color:var(--muted)">Serã mesclado com os ${currentCount.toLocaleString('pt-PT')} registos anteriores</small>`;
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
  if (hint) hint.innerHTML = 'Ou arrasta vãrios ficheiros para aqui';
  Logger.info('Portal reiniciado.');
}

/* --------------------------------------------------------------
   UTILITãRIOS
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
  if(n==null) return 'ã';
  return new Intl.NumberFormat('pt-PT',{style:'currency',currency:'EUR',minimumFractionDigits:2,maximumFractionDigits:2}).format(n);
}
function fmtN(n){ return new Intl.NumberFormat('pt-PT').format(n); }

function escHtml(s){
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* --------------------------------------------------------------
   ORDENAããO DE DADOS
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

    // Ordenar nãmeros
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
  // Se clica no mesmo campo, inverte direão
  if (sortState.field === field) {
    sortState.direction = sortState.direction === 'asc' ? 'desc' : 'asc';
  } else {
    // Campo novo: ordena ascendente
    sortState.field = field;
    sortState.direction = 'asc';
  }
  currentPage = 1;  // Reset ã pãgina 1
  renderDuplicates(Array.from(checkedFields));
}

function getSortIndicator(field) {
  if (sortState.field !== field) return '';
  return sortState.direction === 'asc' ? ' ?' : ' ?';
}

/* --------------------------------------------------------------
   FILTROS E RENDERIZAããO
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
   EXPORTAÇÃO DE DADOS
   -------------------------------------------------------------- */

let exportState: ExportState = {
  dataType: 'all',
  format: 'csv'
};

/**
 * Abre o modal de exportaão
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
 * Fecha o modal de exportaão
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
 * Define o formato de exportaão
 * @param {ExportState['format']} format - Formato: 'csv', 'json', 'xml', 'xlsx' ou 'pdf'
 */
function setExportFormat(format: ExportState['format']): void {
  // Validar formato (Priority 1)
  const VALID_FORMATS: ReadonlyArray<ExportState['format']> = ['csv', 'json', 'xml', 'xlsx', 'pdf'];
  if (!VALID_FORMATS.includes(format)) {
    Logger.error(`Formato de export inválido: ${format}. Usando CSV como padrão.`);
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
 * Atualiza as contagens de registos no modal de exportaão
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
 * Atualiza a preview de exportação com descrição do formato
 */
function updateExportPreview(): void {
  const preview = document.getElementById('export-preview') as HTMLElement | null;
  if (!preview) return;

  const format = exportState.format;
  let previewText: string = '';

  if (format === 'csv') {
    previewText = '📊 CSV — Abrir em Excel ou Google Sheets';
  } else if (format === 'json') {
    previewText = '📋 JSON — Para integração com outras ferramentas';
  } else if (format === 'xml') {
    previewText = '📁 XML — Formato estruturado para sistemas';
  } else if (format === 'xlsx') {
    previewText = '📈 XLSX — Ficheiro Excel com formatação';
  } else if (format === 'pdf') {
    previewText = '📄 PDF — Relatório formatado e imprimível';
  }

  preview.textContent = previewText;
}

/**
 * Obtém as colunas visãveis para exportaão
 * @returns {string[]} Array de nomes de colunas
 */
function getVisibleColumns(): string[] {
  const fields = Array.from(checkedFields);
  const ctxKeys = availableFields.map(f => f.key);
  return [...new Set([...fields, ...ctxKeys])].filter(k => k in (rawData[0] || {})) as string[];
}

/**
 * Obtém dados para exportação baseado no tipo selecionado
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
    // Criar Set de índices duplicados — O(n) em vez de O(n*m)
    const duplicateRecords = new Set<DataRecord>();
    dupGroups.forEach(group => {
      group.forEach(record => {
        duplicateRecords.add(record);
      });
    });

    // Filtrar registos que estão no Set — O(n)
    dataToExport = rawData.filter(r => duplicateRecords.has(r));

    if (dataToExport.length === 0) {
      Logger.warn('Nenhum registo duplicado encontrado para exportação');
    }
  } else if (exportState.dataType === 'unique') {
    dataToExport = uniqueRecords;
  } else {
    Logger.error(`Tipo de export inválido: ${exportState.dataType}`);
    return { data: [], columns: [] };
  }

  return { data: dataToExport, columns };
}

/**
 * Executa a exportação de dados no formato selecionado
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
  } else if (format === 'xlsx') {
    exportToXLSX(data, columns, filename);
  } else if (format === 'pdf') {
    exportToPDF(data, columns, filename);
  }

  closeExportModal();
  Logger.info(`✅ Exportação em ${format.toUpperCase()} concluída: ${data.length} registos`);
}

/**
 * Exporta dados para CSV
 * @param {DataRecord[]} data - Array de registos
 * @param {string[]} columns - Nomes das colunas
 * @param {string} filename - Nome do ficheiro (sem extensão)
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
 * @param {string} filename - Nome do ficheiro (sem extensão)
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
 * Exporta dados para XLSX (Excel)
 * @param {DataRecord[]} data - Array de registos
 * @param {string[]} columns - Nomes das colunas
 * @param {string} filename - Nome do ficheiro (sem extensão)
 */
function exportToXLSX(data: DataRecord[], columns: string[], filename: string): void {
  if (typeof (window as any).XLSX === 'undefined') {
    Logger.error('Biblioteca XLSX não carregou');
    alert('⚠️ Biblioteca XLSX ainda a carregar. Tenta novamente em alguns segundos.');
    return;
  }

  try {
    const XLSX = (window as any).XLSX;

    // Converter dados para array de arrays (formato compatível com XLSX)
    const wsData: any[][] = [];

    // Adicionar cabeçalho
    wsData.push(columns);

    // Adicionar dados
    data.forEach(record => {
      const row: any[] = columns.map(col => {
        const value = record[col];
        return value ?? '';
      });
      wsData.push(row);
    });

    // Criar worksheet
    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // Aplicar formatação ao cabeçalho (negrito)
    const wscols = columns.map(() => ({ wch: 15 }));
    ws['!cols'] = wscols;

    // Criar workbook
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Dados');

    // Adicionar metadados
    wb.Props = {
      Title: 'G-FinanceSuite - Exportação de Dados',
      Author: 'G-FinanceSuite',
      CreatedDate: new Date()
    };

    // Escrever ficheiro
    XLSX.writeFile(wb, `${filename}.xlsx`);
    Logger.info(`✅ XLSX exportado com sucesso: ${data.length} registos`);
  } catch (err) {
    Logger.error(`Erro na exportação XLSX: ${err instanceof Error ? err.message : String(err)}`);
    alert('Erro ao exportar XLSX:\n' + (err instanceof Error ? err.message : String(err)));
  }
}

/**
 * Exporta dados para PDF com relatório formatado
 * @param {DataRecord[]} data - Array de registos
 * @param {string[]} columns - Nomes das colunas
 * @param {string} filename - Nome do ficheiro (sem extensão)
 */
function exportToPDF(data: DataRecord[], columns: string[], filename: string): void {
  // Priority 1: Validar biblioteca jsPDF antes de comeãar
  if (typeof (window as any).jspdf === 'undefined') {
    Logger.error('Biblioteca jsPDF não carregou');
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
      alert(`?? PDF contãm muitos registos (${fmtN(data.length)}).\nSendo exportados apenas os primeiros ${fmtN(MAX_PDF_ROWS)} registos.`);
      pdfData = data.slice(0, MAX_PDF_ROWS);
    }

    // Try/catch granular ã Priority 1
    try {
      doc = new jsPDF();
    } catch (e) {
      Logger.error(`Erro ao criar documento PDF: ${(e as Error).message}`);
      throw e;
    }

    // Configuraãães
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 10;
    const contentWidth = pageWidth - (margin * 2);
    const rowHeight = 6;
    const cellPadding = 2;
    const tableMargin = margin;
    const dataStartY = 50; // Espaão para cabeãalho na primeira pãgina

    // Calcular larguras das colunas
    let columnWidths = [];
    const numCols = columns.length;
    const availableWidth = contentWidth - (cellPadding * 2 * numCols);
    columns.forEach(() => {
      columnWidths.push(availableWidth / numCols);
    });

    // Calcular nãmero de pãginas
    const rowsPerPage = Math.floor((pageHeight - dataStartY - 15) / rowHeight); // 15 para rodapã
    const totalPages = Math.ceil(pdfData.length / rowsPerPage);

    // Funão para desenhar cabeãalho de pãgina
    const drawPageHeader = (pageNum) => {
      const y = margin;
      doc.setFontSize(16);
      doc.setTextColor(0);
      doc.text('G-FinanceSuite ã Relatãrio de Exportaão', margin, y);

      doc.setFontSize(9);
      doc.setTextColor(100);
      doc.text(`Gerado: ${new Date().toLocaleString('pt-PT')}`, margin, y + 8);
      doc.text(`Registos: ${fmtN(pdfData.length)} | Colunas: ${columns.length}`, margin, y + 14);

      // Separador
      doc.setDrawColor(200);
      doc.line(margin, y + 18, pageWidth - margin, y + 18);
    };

    // Funão para desenhar cabeãalho da tabela
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

    // Funão para desenhar rodapã com paginaão
    const drawPageFooter = (currentPageNum) => {
      const footerY = pageHeight - 6;
      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.text('ã 2026 G-FinanceSuite', margin, footerY);

      // Paginaão
      const pageText = `${currentPageNum}/${totalPages}`;
      const pageTextWidth = doc.getStringUnitWidth(pageText) * doc.internal.getFontSize() / doc.internal.scaleFactor;
      doc.text(pageText, pageWidth - margin - pageTextWidth, footerY);
    };

    // Primeira pãgina - cabeãalho
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
      // Verificar se precisa nova pãgina
      if (rowsInPage >= rowsPerPage && currentY + rowHeight > pageHeight - 15) {
        // Desenhar rodapã da pãgina atual
        drawPageFooter(currentPage);

        // Nova pãgina
        doc.addPage();
        currentPage++;
        currentY = margin + 8; // Espaão pequeno no topo
        rowsInPage = 0;

        // Desenhar cabeãalho da tabela na nova pãgina
        drawTableHeader(currentY);
        currentY += rowHeight;
      }

      // Desenhar linha de dados
      let xPos = tableMargin;
      columns.forEach((col, colIdx) => {
        let cellValue = record[col];
        let displayValue = '';

        if (cellValue === null || cellValue === undefined) {
          displayValue = 'ã';
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

    // Rodapã da ãltima pãgina
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
      // Verificar se precisa nova pãgina
      if (rowsInPage >= rowsPerPage && currentY + rowHeight > pageHeight - 15) {
        // Desenhar rodapã da pãgina atual
        drawPageFooter(currentPage);

        // Nova pãgina
        doc.addPage();
        currentPage++;
        currentY = margin + 8; // Espaão pequeno no topo
        rowsInPage = 0;

        // Desenhar cabeãalho da tabela na nova pãgina
        drawTableHeader(currentY);
        currentY += rowHeight;
      }

      // Desenhar linha de dados
      let xPos = tableMargin;
      columns.forEach((col, colIdx) => {
        let cellValue = record[col];
        let displayValue = '';

        if (cellValue === null || cellValue === undefined) {
          displayValue = 'ã';
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

    // Rodapã da ãltima pãgina
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
  if (currentPage < totalPages) addBtn(currentPage+1, 'Prãxima ?');
}

/* --------------------------------------------------------------
   INICIALIZAããO DA PãGINA
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

    // Funão para desenhar rodapã com paginaão
    const drawPageFooter = (currentPageNum) => {
      const footerY = pageHeight - 6;
      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.text('ã 2026 G-FinanceSuite', margin, footerY);

      // Paginaão
      const pageText = `${currentPageNum}/${totalPages}`;
      const pageTextWidth = doc.getStringUnitWidth(pageText) * doc.internal.getFontSize() / doc.internal.scaleFactor;
      doc.text(pageText, pageWidth - margin - pageTextWidth, footerY);
    };

    // Primeira pãgina - cabeãalho
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
      // Verificar se precisa nova pãgina
      if (rowsInPage >= rowsPerPage && currentY + rowHeight > pageHeight - 15) {
        // Desenhar rodapã da pãgina atual
        drawPageFooter(currentPage);

        // Nova pãgina
        doc.addPage();
        currentPage++;
        currentY = margin + 8; // Espaão pequeno no topo
        rowsInPage = 0;

        // Desenhar cabeãalho da tabela na nova pãgina
        drawTableHeader(currentY);
        currentY += rowHeight;
      }

      // Desenhar linha de dados
      let xPos = tableMargin;
      columns.forEach((col, colIdx) => {
        let cellValue = record[col];
        let displayValue = '';

        if (cellValue === null || cellValue === undefined) {
          displayValue = 'ã';
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

    // Rodapã da ãltima pãgina
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


