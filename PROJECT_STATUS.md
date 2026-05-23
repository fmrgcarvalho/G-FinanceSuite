# Status do Projeto — G-FinanceSuite

**Data**: 2026-05-23
**Versão**: 2.2.0
**Status**: Frontend funcional

---

## Estrutura

```
G-FinanceSuite/
├── docs/
│   ├── index.html              — Interface principal
│   ├── js/
│   │   ├── app.js              — Lógica (~2800 linhas)
│   │   ├── utils.js            — Utilitários
│   │   └── workers/
│   │       └── excel.worker.js — Web Worker para Excel
│   └── css/
│       └── style.css           — Estilos
├── README.md
└── .gitignore
```

---

## Funcionalidades

### Upload
- Drag-and-drop e seleção de ficheiros
- Excel (.xlsx, .xls), CSV, JSON
- Múltiplos ficheiros com fila e progresso
- Consolidação automática

### Mapeamento de Colunas
- Deteção dinâmica de cabeçalhos
- Auto-sugestão de campos por aliases
- Ignorar colunas individualmente

### Análise de Duplicados
- Seleção de campos para agrupamento
- Cálculo de grupos duplicados
- Soma de valores por grupo
- Cartões de resumo

### Reconciliação
- Comparação entre dois conjuntos de dados
- Tolerância configurável para valores numéricos

### Filtros e Navegação
- Filtro por texto, montante, contagem
- Ordenação por qualquer campo
- Paginação

### Exportação
- CSV, JSON, XML, PDF
- Log de operações em .txt

---

## Como Correr

A aplicação é **puramente frontend** — não precisa de servidor.

**Abrir diretamente:**
```
docs/index.html
```

**Ou com servidor estático:**
```bash
npx serve docs
```

Requer ligação à internet para SheetJS e jsPDF (carregados via CDN).

---

**Última atualização**: 2026-05-23
