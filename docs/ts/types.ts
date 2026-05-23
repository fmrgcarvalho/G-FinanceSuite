/**
 * Ficheiro de Tipos TypeScript — G-FinanceSuite
 * Contém todas as interfaces e tipos reutilizáveis
 */

/* ══════════════════════════════════════════════════════════════
   LOG
   ══════════════════════════════════════════════════════════════ */

export interface LogEntry {
  ts: string;
  level: 'INFO' | 'WARN' | 'ERROR';
  msg: string;
}

export interface ILogger {
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
  separator(lbl: string): void;
  all(): LogEntry[];
  clear(): void;
}

/* ══════════════════════════════════════════════════════════════
   FICHEIROS
   ══════════════════════════════════════════════════════════════ */

export interface FileQueueItem {
  file: File;
  data: unknown | null;
  status: 'pending' | 'processing' | 'success' | 'error';
  mapping: Record<number, string> | null;
  progress: number;
  error: string | null;
}

export interface ConsolidatedFile {
  name: string;
  records: number;
  status: 'success' | 'error';
}

export type Mapping = Record<string, Record<number, string>>;

export interface FileData {
  records: DataRecord[];
  mapping: Record<number, string>;
}

export type FileDataMap = Record<string, FileData>;

/* ══════════════════════════════════════════════════════════════
   CAMPOS E DADOS
   ══════════════════════════════════════════════════════════════ */

export interface FieldInfo {
  key: string;
  label: string;
  desc?: string;
}

export interface DataRecord {
  [key: string]: unknown;
}

/* ══════════════════════════════════════════════════════════════
   FILTROS E ORDENAÇÃO
   ══════════════════════════════════════════════════════════════ */

export interface FilterState {
  type: 'all' | 'duplicates' | 'unique';
  search: string;
  exactCount: number | null;
  minAmount: number | null;
  maxAmount: number | null;
}

export interface SortState {
  field: string | null;
  direction: 'asc' | 'desc';
}

/* ══════════════════════════════════════════════════════════════
   EXPORTAÇÃO
   ══════════════════════════════════════════════════════════════ */

export interface ExportState {
  dataType: 'all' | 'duplicates' | 'unique';
  format: 'csv' | 'json' | 'xml' | 'pdf';
}

export interface ExportData {
  data: DataRecord[];
  columns: string[];
}

export const VALID_EXPORT_FORMATS: ReadonlyArray<ExportState['format']> = ['csv', 'json', 'xml', 'pdf'];
export const VALID_DATA_TYPES: ReadonlyArray<ExportState['dataType']> = ['all', 'duplicates', 'unique'];

/* ══════════════════════════════════════════════════════════════
   CONSTANTES
   ══════════════════════════════════════════════════════════════ */

export const PAGE_SIZE = 100;
export const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500 MB
export const FILTER_DEBOUNCE_MS = 400;
