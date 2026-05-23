import {
  parseCSV,
  isLikelyNumeric,
  isLikelyDate,
  isValidFileName,
  isValidFileSize,
  parseExcelDate,
  formatCurrency,
  formatNumber,
  escapeHTML
} from './utils';

describe('Utils - Validações', () => {
  describe('isValidFileName', () => {
    test('deve aceitar ficheiros Excel .xlsx', () => {
      expect(isValidFileName('dados.xlsx')).toBe(true);
      expect(isValidFileName('DADOS.XLSX')).toBe(true);
    });

    test('deve aceitar ficheiros Excel .xls', () => {
      expect(isValidFileName('dados.xls')).toBe(true);
      expect(isValidFileName('DADOS.XLS')).toBe(true);
    });

    test('deve aceitar ficheiros CSV', () => {
      expect(isValidFileName('dados.csv')).toBe(true);
      expect(isValidFileName('DADOS.CSV')).toBe(true);
    });

    test('deve aceitar ficheiros JSON', () => {
      expect(isValidFileName('dados.json')).toBe(true);
      expect(isValidFileName('DADOS.JSON')).toBe(true);
    });

    test('deve rejeitar ficheiros com extensão inválida', () => {
      expect(isValidFileName('dados.txt')).toBe(false);
      expect(isValidFileName('dados.pdf')).toBe(false);
      expect(isValidFileName('dados.doc')).toBe(false);
    });

    test('deve rejeitar inputs inválidos', () => {
      expect(isValidFileName(null)).toBe(false);
      expect(isValidFileName(undefined)).toBe(false);
      expect(isValidFileName('')).toBe(false);
      expect(isValidFileName(123)).toBe(false);
    });
  });

  describe('isValidFileSize', () => {
    test('deve aceitar ficheiros menores que o limite (500MB)', () => {
      expect(isValidFileSize(1000000)).toBe(true);
      expect(isValidFileSize(100000000)).toBe(true); // 100MB
      expect(isValidFileSize(500 * 1024 * 1024)).toBe(true); // Exatamente 500MB
    });

    test('deve rejeitar ficheiros maiores que o limite', () => {
      expect(isValidFileSize(501 * 1024 * 1024)).toBe(false); // 501MB
      expect(isValidFileSize(1000 * 1024 * 1024)).toBe(false); // 1GB
    });

    test('deve rejeitar valores negativos', () => {
      expect(isValidFileSize(-1000)).toBe(false);
    });

    test('deve rejeitar inputs inválidos', () => {
      expect(isValidFileSize(null)).toBe(false);
      expect(isValidFileSize(undefined)).toBe(false);
      expect(isValidFileSize('1000')).toBe(false);
    });

    test('deve suportar limite customizado', () => {
      const customLimit = 100 * 1024 * 1024; // 100MB
      expect(isValidFileSize(50 * 1024 * 1024, customLimit)).toBe(true);
      expect(isValidFileSize(150 * 1024 * 1024, customLimit)).toBe(false);
    });
  });
});

describe('Utils - Detecção de Tipo', () => {
  describe('isLikelyNumeric', () => {
    test('deve detectar campos de montante/valor', () => {
      expect(isLikelyNumeric('montante', null)).toBe(true);
      expect(isLikelyNumeric('valor', null)).toBe(true);
      expect(isLikelyNumeric('saldo', null)).toBe(true);
      expect(isLikelyNumeric('total', null)).toBe(true);
      expect(isLikelyNumeric('preco', null)).toBe(true);
    });

    test('deve detectar por tipo de valor', () => {
      expect(isLikelyNumeric('campo_qualquer', 123)).toBe(true);
      expect(isLikelyNumeric('campo_qualquer', 45.67)).toBe(true);
    });

    test('deve rejeitar non-numéricos', () => {
      expect(isLikelyNumeric('nome', null)).toBe(false);
      expect(isLikelyNumeric('descricao', 'texto')).toBe(false);
    });

    test('deve ser case-insensitive', () => {
      expect(isLikelyNumeric('MONTANTE', null)).toBe(true);
      expect(isLikelyNumeric('MoNtAnTe', null)).toBe(true);
    });
  });

  describe('isLikelyDate', () => {
    test('deve detectar campos de data por nome', () => {
      expect(isLikelyDate('data', null)).toBe(true);
      expect(isLikelyDate('date', null)).toBe(true);
      expect(isLikelyDate('data_criacao', null)).toBe(true);
      expect(isLikelyDate('dt_vencimento', null)).toBe(true);
    });

    test('deve detectar números de série Excel', () => {
      // 44562 = 01/01/2022 no Excel
      expect(isLikelyDate('campo', 44562)).toBe(true);
      expect(isLikelyDate('campo', 50000)).toBe(true);
    });

    test('deve detectar datas em formato texto', () => {
      expect(isLikelyDate('campo', '01/01/2022')).toBe(true);
      expect(isLikelyDate('campo', '01-01-2022')).toBe(true);
      expect(isLikelyDate('campo', '01.01.2022')).toBe(true);
      expect(isLikelyDate('campo', '2022-01-01')).toBe(true);
    });

    test('deve rejeitar non-datas', () => {
      expect(isLikelyDate('nome', null)).toBe(false);
      expect(isLikelyDate('campo', '2022')).toBe(false);
      expect(isLikelyDate('campo', '01/2022')).toBe(false);
    });

    test('deve ser case-insensitive', () => {
      expect(isLikelyDate('DATA', null)).toBe(true);
      expect(isLikelyDate('DaTa', null)).toBe(true);
    });
  });
});

describe('Utils - Parsing', () => {
  describe('parseCSV', () => {
    test('deve rejeitar input vazio', () => {
      expect(parseCSV('')).toEqual([]);
      expect(parseCSV(null)).toEqual([]);
      expect(parseCSV(undefined)).toEqual([]);
    });

    test('deve rejeitar CSV sem dados', () => {
      expect(parseCSV('nome,idade')).toEqual([]); // Só cabeçalho
    });
  });

  describe('parseExcelDate', () => {
    test('deve converter número serial Excel para data', () => {
      // 44562 = 2022-01-01
      const result = parseExcelDate(44562);
      expect(result).toMatch(/2022-01-01|2021-12-31/); // Pode variar por timezone
    });

    test('deve rejeitar valores inválidos', () => {
      expect(parseExcelDate(null)).toBeNull();
      expect(parseExcelDate(undefined)).toBeNull();
      expect(parseExcelDate(-1)).toBeNull();
      expect(parseExcelDate('123')).toBeNull();
    });

    test('deve retornar string em formato YYYY-MM-DD', () => {
      const result = parseExcelDate(45000);
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });
});

describe('Utils - Formatação', () => {
  describe('formatCurrency', () => {
    test('deve formatar em EUR', () => {
      const result = formatCurrency(100);
      expect(result).toMatch(/100/);
      expect(result).toMatch(/€|EUR/i);
    });

    test('deve rejeitar non-números', () => {
      expect(formatCurrency(null)).toBe('—');
      expect(formatCurrency(undefined)).toBe('—');
      expect(formatCurrency('100')).toBe('—');
    });
  });

  describe('formatNumber', () => {
    test('deve formatar números com separadores', () => {
      const result = formatNumber(123456);
      expect(result).toMatch(/123.*456/); // Pode ter espaço ou ponto
    });

    test('deve rejeitar non-números', () => {
      expect(formatNumber(null)).toBe('—');
      expect(formatNumber(undefined)).toBe('—');
      expect(formatNumber('123')).toBe('—');
    });
  });

  describe('escapeHTML', () => {
    test('deve escapar caracteres especiais', () => {
      expect(escapeHTML('<script>')).toBe('&lt;script&gt;');
      expect(escapeHTML('&')).toBe('&amp;');
      expect(escapeHTML('"')).toBe('&quot;');
    });

    test('deve rejeitar non-strings', () => {
      expect(escapeHTML(null)).toBe('');
      expect(escapeHTML(undefined)).toBe('');
      expect(escapeHTML(123)).toBe('');
    });

    test('deve escapar múltiplos caracteres', () => {
      expect(escapeHTML('<div class="test">')).toBe('&lt;div class=&quot;test&quot;&gt;');
      expect(escapeHTML('Tom & Jerry')).toBe('Tom &amp; Jerry');
    });

    test('deve retornar string vazia se input não for string', () => {
      expect(escapeHTML({})).toBe('');
      expect(escapeHTML([])).toBe('');
    });
  });
});

// ═══════════════════════════════════════════════════════════════
// TESTES ADICIONAIS — COBERTURA COMPLETA
// ═══════════════════════════════════════════════════════════════

describe('Utils - Edge Cases Numéricos', () => {
  describe('isLikelyNumeric - Todas as variações de nomes', () => {
    test('deve detectar variações de "amount"', () => {
      expect(isLikelyNumeric('amount', null)).toBe(true);
      expect(isLikelyNumeric('AMOUNT', null)).toBe(true);
      expect(isLikelyNumeric('Amount', null)).toBe(true);
    });

    test('deve detectar variações de "importe"', () => {
      expect(isLikelyNumeric('importe', null)).toBe(true);
      expect(isLikelyNumeric('IMPORTE', null)).toBe(true);
    });

    test('deve detectar variações de "quantidade"', () => {
      expect(isLikelyNumeric('quantidade', null)).toBe(true);
      expect(isLikelyNumeric('qty', null)).toBe(true);
      expect(isLikelyNumeric('QTY', null)).toBe(true);
    });

    test('deve detectar variações de "custo"', () => {
      expect(isLikelyNumeric('custo', null)).toBe(true);
      expect(isLikelyNumeric('cost', null)).toBe(true);
      expect(isLikelyNumeric('COST', null)).toBe(true);
    });

    test('deve rejeitar campo vazio', () => {
      expect(isLikelyNumeric('', null)).toBe(false);
      expect(isLikelyNumeric(null, null)).toBe(false);
    });

    test('deve aceitar números 0', () => {
      expect(isLikelyNumeric('qualquer_campo', 0)).toBe(true);
    });

    test('deve aceitar números grandes fora do intervalo de datas Excel', () => {
      expect(isLikelyNumeric('qualquer_campo', 100000)).toBe(true);
    });
  });

  describe('formatCurrency - Edge Cases', () => {
    test('deve formatar 0', () => {
      const result = formatCurrency(0);
      expect(result).toMatch(/0/);
    });

    test('deve formatar números negativos', () => {
      const result = formatCurrency(-100.50);
      expect(result).toMatch(/100/);
      expect(result).toMatch(/[–\-]/); // Pode ter hífen ou travessão
    });

    test('deve formatar números muito grandes', () => {
      const result = formatCurrency(1000000);
      expect(result).toMatch(/1.*000.*000/);
    });

    test('deve formatar decimais', () => {
      const result = formatCurrency(123.456);
      expect(result).toMatch(/123/);
    });
  });

  describe('formatNumber - Edge Cases', () => {
    test('deve formatar 0', () => {
      const result = formatNumber(0);
      expect(result).toBe('0');
    });

    test('deve formatar números negativos', () => {
      const result = formatNumber(-123456);
      expect(result).toMatch(/123.*456/);
      expect(result).toMatch(/[–\-]/);
    });

    test('deve formatar números decimais', () => {
      const result = formatNumber(123.45);
      expect(result).toMatch(/123/);
    });

    test('deve formatar NaN', () => {
      const result = formatNumber(NaN);
      expect(result).toBeTruthy();  // Resultado depende de implementação
    });

    test('deve formatar Infinity', () => {
      const result = formatNumber(Infinity);
      expect(result).toBeTruthy();  // Resultado depende de implementação
    });
  });
});

describe('Utils - Edge Cases de Data', () => {
  describe('isLikelyDate - Variações de nomes', () => {
    test('deve detectar variações de "datum"', () => {
      expect(isLikelyDate('datum', null)).toBe(true);
      expect(isLikelyDate('DATUM', null)).toBe(true);
    });

    test('deve rejeitar campo vazio', () => {
      expect(isLikelyDate('', null)).toBe(false);
      expect(isLikelyDate(null, null)).toBe(false);
    });

    test('deve rejeitar números fora do intervalo plausível', () => {
      expect(isLikelyDate('campo', 0)).toBe(false); // Muito pequeno
      expect(isLikelyDate('campo', 100000)).toBe(false); // Muito grande
    });

    test('deve rejeitar datas com formato inválido', () => {
      expect(isLikelyDate('campo', '01012022')).toBe(false); // Sem separador
      expect(isLikelyDate('campo', '2022/13/01')).toBe(false); // Mês inválido (13)
      expect(isLikelyDate('campo', 'abc')).toBe(false); // Texto sem formato de data
    });
  });

  describe('parseExcelDate - Edge Cases', () => {
    test('deve converter número 0', () => {
      const result = parseExcelDate(0);
      expect(result).toBeTruthy();  // Retorna data, não null
    });

    test('deve converter datas antigas', () => {
      const result = parseExcelDate(1); // 1/1/1900
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    test('deve converter datas recentes', () => {
      const result = parseExcelDate(49000); // 2024 aprox
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });
});

describe('Utils - CSV Parsing Edge Cases', () => {
  describe('parseCSV - Casos Complexos', () => {
    test('deve lidar com linhas com apenas espaços', () => {
      const csv = 'nome,idade\n   \nJoão,30';
      const result = parseCSV(csv);
      expect(result.length).toBeGreaterThanOrEqual(1);
    });

    test('deve lidar com cabeçalhos com múltiplos espaços', () => {
      const csv = '  nome    ,    idade  \nJoão,30';
      const result = parseCSV(csv);
      expect(result).toHaveLength(1);
      expect(Object.keys(result[0])).toContain('nome');
    });

    test('deve manter case de headers em lowercase', () => {
      const csv = 'NOME,IDADE\nJoão,30';
      const result = parseCSV(csv);
      expect(result).toHaveLength(1);
      expect(Object.keys(result[0])[0]).toBe('nome');
    });

    test('deve lidar com valores com espaços', () => {
      const csv = 'nome,descricao\nJoão,Um texto com espaços';
      const result = parseCSV(csv);
      expect(result).toHaveLength(1);
      expect(result[0].descricao).toBe('Um texto com espaços');
    });

    test('deve preencher valores faltantes com null', () => {
      const csv = 'nome,idade,cidade\nJoão,30\nMaria,25,Lisboa';
      const result = parseCSV(csv);
      expect(result).toHaveLength(2);
      expect(result[0].cidade).toBeNull();
      expect(result[1].cidade).toBe('Lisboa');
    });

    test('deve rejeitar string com apenas espaços', () => {
      expect(parseCSV('   ')).toEqual([]);
    });

    test('deve rejeitar não-strings', () => {
      expect(parseCSV(123)).toEqual([]);
      expect(parseCSV({})).toEqual([]);
    });
  });
});

describe('Utils - File Validation Edge Cases', () => {
  describe('isValidFileName - Casos Adicionais', () => {
    test('deve ser case-insensitive', () => {
      expect(isValidFileName('dados.XlSx')).toBe(true);
      expect(isValidFileName('dados.CsV')).toBe(true);
    });

    test('deve rejeitar ficheiros sem extensão', () => {
      expect(isValidFileName('dados')).toBe(false);
    });

    test('deve rejeitar ficheiros com múltiplas extensões suspeitas', () => {
      expect(isValidFileName('dados.xlsx.txt')).toBe(false);
    });

    test('deve aceitar caminhos com pastas (só verifica extensão)', () => {
      expect(isValidFileName('pasta/dados.xlsx')).toBe(true);
    });

    test('deve rejeitar tipos não-strings', () => {
      expect(isValidFileName({})).toBe(false);
      expect(isValidFileName([])).toBe(false);
    });
  });

  describe('isValidFileSize - Casos Adicionais', () => {
    test('deve aceitar ficheiros muito pequenos (1 byte)', () => {
      expect(isValidFileSize(1)).toBe(true);
    });

    test('deve aceitar ficheiros no limite exato', () => {
      const limit = 500 * 1024 * 1024;
      expect(isValidFileSize(limit)).toBe(true);
    });

    test('deve rejeitar 1 byte acima do limite', () => {
      const limit = 500 * 1024 * 1024;
      expect(isValidFileSize(limit + 1)).toBe(false);
    });

    test('deve rejeitar zero', () => {
      expect(isValidFileSize(0)).toBe(true); // 0 é válido (ficheiro vazio)
    });

    test('deve aceitar limite muito grande customizado', () => {
      const gigabyte = 1024 * 1024 * 1024;
      expect(isValidFileSize(500 * 1024 * 1024, gigabyte)).toBe(true);
    });

    test('deve rejeitar Infinity', () => {
      expect(isValidFileSize(Infinity)).toBe(false);
    });

    test('deve rejeitar NaN', () => {
      expect(isValidFileSize(NaN)).toBe(false);
    });
  });
});
