/* ============================================================
   G-FinanceSuite — Estado Centralizado da Aplicação
   Substitui as 21+ variáveis globais do app.js monolítico.
   Importado por todos os módulos que precisam de estado.
   ============================================================ */

export const APP_VERSION = '1.0.0';
export const PAGE_SIZE   = 100;
export const PDF_MAX_RECORDS = 2000;

export const AppState = {
  // ── Dados brutos ───────────────────────────────────────────
  rawData:        [],   // registos consolidados de todos os ficheiros
  fileName:       '',   // label para exibição (ex: "3 ficheiros consolidados")
  availableFields: [],  // [{key, label, desc}] — campos detetados no ficheiro
  modelFields:    [],   // campos unificados de todos os ficheiros consolidados

  // ── Seleção de operação ────────────────────────────────────
  selectedOp: 1,        // 1 = Duplicados, 2 = Reconciliação

  // ── Op1 — Duplicados ───────────────────────────────────────
  dupGroups:        [],       // grupos de registos duplicados
  uniqueRecords:    [],       // registos sem duplicados
  checkedFields:    new Set(), // campos selecionados pelo utilizador
  selectedSumField: '',       // campo numérico para somar por grupo

  activeFilters: {
    type:         'all',  // 'all' | 'duplicates' | 'unique'
    search:       '',
    searchFields: [],     // [] = todos os campos; [...keys] = apenas esses
    exactCount:   null,
    minAmount:    null,
    maxAmount:    null,
  },
  filterDebounceTimer: null,

  sortState: {
    field:     null,   // campo a ordenar (ex: 'numero_documento')
    direction: 'asc',  // 'asc' | 'desc'
  },

  // ── Op2 — Reconciliação ────────────────────────────────────
  reconDashboardState: {
    allGroups:     [],
    filteredGroups: [],
    minSaldo:      null,
    maxSaldo:      null,
    charts:        {},
    filterType:    'all',  // 'all' | 'reconciliados' | 'por_reconciliar'
    tolerance:     1,
    groupField:    '',
    valField:      '',
  },

  // ── Importação / Fila ──────────────────────────────────────
  fileQueue:             [],    // [{file, data:null, status:'pending'}]
  processingQueue:       false,
  isSequentialProcessing: false,
  consolidatedFiles:     [],    // ficheiros processados com sucesso
  mappings:              {},    // {filename: {colIdx: fieldKey}}
  fileDataMap:           {},    // {filename: {records, mapping}}

  // ── Estado temporário durante mapeamento Excel ─────────────
  _excelRows:    [],
  _excelHeaders: [],
  _excelFile:    null,

  // ── Paginação ──────────────────────────────────────────────
  currentPage: 1,

  // ── Exportação Op1 ─────────────────────────────────────────
  exportState: {
    dataType: 'all',   // 'all' | 'duplicates' | 'unique'
    format:   'xlsx',  // 'csv' | 'json' | 'xml' | 'xlsx' | 'pdf'
  },

  // ── Exportação Op2 ─────────────────────────────────────────
  reconExportState: {
    dataType: 'all',   // 'all' | 'reconciliados' | 'por_reconciliar'
    format:   'xlsx',
  },

  // ── Reset completo ─────────────────────────────────────────
  reset() {
    this.rawData        = [];
    this.fileName       = '';
    this.availableFields = [];
    this.modelFields    = [];
    this.selectedOp     = 1;

    this.dupGroups        = [];
    this.uniqueRecords    = [];
    this.checkedFields    = new Set();
    this.selectedSumField = '';
    this.activeFilters    = { type: 'all', search: '', searchFields: [], exactCount: null, minAmount: null, maxAmount: null };
    this.filterDebounceTimer = null;
    this.sortState        = { field: null, direction: 'asc' };

    this.reconDashboardState = { allGroups: [], filteredGroups: [], minSaldo: null, maxSaldo: null, charts: {}, filterType: 'all', tolerance: 1, groupField: '', valField: '' };

    this.fileQueue             = [];
    this.processingQueue       = false;
    this.isSequentialProcessing = false;
    this.consolidatedFiles     = [];
    this.mappings              = {};
    this.fileDataMap           = {};

    this._excelRows    = [];
    this._excelHeaders = [];
    this._excelFile    = null;

    this.currentPage = 1;

    this.exportState      = { dataType: 'all', format: 'xlsx' };
    this.reconExportState = { dataType: 'all', format: 'xlsx' };
  },
};
