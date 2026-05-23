/**
 * Utilitários do G-FinanceSuite - Funções puras testáveis
 * Estas funções não dependem de DOM ou estado global
 */

/**
 * Parse CSV text into array of objects
 * @param {string} csvText - CSV content
 * @returns {Array} Array of objects with key-value pairs
 */
export function parseCSV(csvText) {
  if (!csvText || typeof csvText !== 'string') {
    return [];
  }

  const lines = csvText.trim().split('\n');
  if (lines.length < 2) return []; // Sem cabeçalho + dados

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/\s+/g, '_'));
  const data = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim());
    const row = {};
    headers.forEach((header, idx) => {
      row[header] = values[idx] || null;
    });
    data.push(row);
  }

  return data;
}

/**
 * Detecta se um campo é provavelmente numérico
 * @param {string} fieldName - Nome do campo
 * @param {*} sampleVal - Valor de amostra
 * @returns {boolean}
 */
export function isLikelyNumeric(fieldName, sampleVal) {
  if (!fieldName) return false;

  if (/montante|valor|amount|importe|saldo|price|preco|total|quantidade|qty|custo|cost/i.test(fieldName)) {
    return true;
  }

  if (typeof sampleVal === 'number' && !isLikelyDate(fieldName, sampleVal)) {
    return true;
  }

  return false;
}

/**
 * Detecta se um campo é provavelmente uma data
 * @param {string} fieldName - Nome do campo
 * @param {*} sampleVal - Valor de amostra
 * @returns {boolean}
 */
export function isLikelyDate(fieldName, sampleVal) {
  if (!fieldName) return false;

  if (/data|date|datum|dt_/i.test(fieldName)) {
    return true;
  }

  // Número serial Excel em intervalo plausível (1/1/1900 a 31/12/2100)
  if (typeof sampleVal === 'number' && sampleVal > 0 && sampleVal < 100000) {
    if (sampleVal > 32874 && sampleVal < 73051) {
      return true;
    }
  }

  if (typeof sampleVal === 'string') {
    const s = sampleVal.trim();
    // DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY
    if (/^\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{4}$/.test(s)) {
      return true;
    }
    // YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
      return true;
    }
  }

  return false;
}

/**
 * Valida se um ficheiro é aceito
 * @param {string} filename - Nome do ficheiro
 * @returns {boolean}
 */
export function isValidFileName(filename) {
  if (!filename || typeof filename !== 'string') {
    return false;
  }

  const isExcel = /\.(xlsx|xls)$/i.test(filename);
  const isCSV = /\.csv$/i.test(filename);
  const isJSON = /\.json$/i.test(filename);

  return isExcel || isCSV || isJSON;
}

/**
 * Valida tamanho de ficheiro (em bytes)
 * @param {number} fileSizeBytes - Tamanho em bytes
 * @param {number} maxSizeBytes - Tamanho máximo em bytes (padrão 500MB)
 * @returns {boolean}
 */
export function isValidFileSize(fileSizeBytes, maxSizeBytes = 500 * 1024 * 1024) {
  if (typeof fileSizeBytes !== 'number' || fileSizeBytes < 0) {
    return false;
  }

  return fileSizeBytes <= maxSizeBytes;
}

/**
 * Converte número Excel serial para data
 * @param {number} excelDate - Data serial do Excel
 * @returns {string} Data em formato YYYY-MM-DD
 */
export function parseExcelDate(excelDate) {
  if (typeof excelDate !== 'number' || excelDate < 0) {
    return null;
  }

  // Número serial do Excel: dias desde 1/1/1900
  const baseDate = new Date(1900, 0, 1);
  const date = new Date(baseDate.getTime() + (excelDate - 2) * 24 * 60 * 60 * 1000);

  return date.toISOString().split('T')[0]; // YYYY-MM-DD
}

/**
 * Formata número para moeda EUR
 * @param {number} value - Valor numérico
 * @returns {string} Valor formatado
 */
export function formatCurrency(value) {
  if (typeof value !== 'number') return '—';

  return new Intl.NumberFormat('pt-PT', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

/**
 * Formata número com separadores de milhares
 * @param {number} value - Valor numérico
 * @returns {string} Valor formatado
 */
export function formatNumber(value) {
  if (typeof value !== 'number') return '—';

  return new Intl.NumberFormat('pt-PT').format(value);
}

/**
 * Escapa HTML para prevenir XSS
 * @param {string} s - String para escapar
 * @returns {string} String escapada
 */
export function escapeHTML(s) {
  if (typeof s !== 'string') return '';

  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
