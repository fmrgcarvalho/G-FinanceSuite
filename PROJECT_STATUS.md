# Status do Projeto — G-FinanceSuite

**Data**: 2026-05-24
**Versão**: 2.4.0
**Status**: ✅ Produção — arquitetura modular ES6 completa

---

## Estrutura

```
G-FinanceSuite/
├── docs/
│   ├── index.html              — Interface principal (sem inline handlers)
│   ├── js/
│   │   ├── app.js              — Orquestrador: imports, event listeners, init
│   │   ├── state.js            — AppState centralizado + constantes
│   │   ├── utils.js            — Utilitários partilhados (parseCSV, etc.)
│   │   ├── modules/
│   │   │   ├── logger.js       — Logger partilhado (ES module)
│   │   │   ├── ui.js           — show/hide, fmt, setSummaryCards, guessFieldType
│   │   │   ├── pagination.js   — setPagination, renderPagination (Op1 + Op2)
│   │   │   ├── import.js       — Drag&drop, queue, loaders, mapeamento
│   │   │   ├── duplicates.js   — Op1: runDuplicates, filtros, ordenação
│   │   │   ├── reconciliation.js — Op2: runReconciliation, dashboard, filtros
│   │   │   └── export.js       — Exportação CSV/JSON/XML/XLSX/PDF (Op1+Op2)
│   │   └── workers/
│   │       └── excel.worker.js — Web Worker para Excel (não é ES module)
│   └── css/
│       └── style.css           — Estilos
├── server.js                   — Express estático (porta 3000)
├── verify-phase7.mjs           — Script de verificação Playwright
├── PROJECT_STATUS.md
├── CLAUDE.md
├── package.json
└── README.md
```

---

## Arquitetura

### ES6 Modules (type="module")
- `app.js` é o orquestrador: importa todos os módulos, regista todos os `addEventListener` no `DOMContentLoaded`
- Nenhum `onclick`/`onchange`/`oninput` inline no HTML
- Nenhum `window.X` global — tudo via imports ES module
- Templates dinâmicos usam `data-*` + event delegation nos containers estáveis

### Fluxo de dados
```
AppState (state.js)
    ↑ lê/escreve
app.js → import.js → showContent() → duplicates.js / reconciliation.js
                                              ↓
                                         export.js
```

### Regras de dependência
```
app.js         → state, ui, pagination, import, duplicates, reconciliation, export
import.js      → state, ui, logger
duplicates.js  → state, pagination, ui, logger
reconciliation.js → state, pagination, ui, logger, export
export.js      → state, ui, logger
pagination.js  → state
ui.js          → (nada)
state.js       → (nada)
logger.js      → (nada)
```
Sem ciclos. Sem comunicação direta entre duplicates e reconciliation.

---

## Funcionalidades

### Upload / Importação
- Drag-and-drop e seleção de ficheiros
- Excel (.xlsx, .xls), CSV, JSON
- Múltiplos ficheiros com fila e progresso individual
- Consolidação automática + fusão com dados anteriores
- Mapeamento de colunas com auto-sugestão por aliases

### Op1 — Análise de Duplicados
- Seleção de campos para agrupamento (chips interativos)
- Cálculo de grupos duplicados + registos únicos
- Soma de valores numéricos por grupo
- Cards clicáveis para filtrar (Total, Únicos, Duplicados)
- Filtros: texto, montante mín/máx, nº exato de duplicados
- Campo de procura com seletor de campo
- Ordenação por qualquer coluna
- Paginação (100/página) topo e fundo dentro do `#results-section`
- Exportação CSV/JSON/XML/XLSX/PDF

### Op2 — Reconciliação
- Configuração compacta: campo de grupo, campo de valor, tolerância
- Dashboard visual: Pie Chart + Bar Chart (Chart.js)
- Estatísticas: saldo total, médio, mediana, máximo
- Cards clicáveis: Total, Por reconciliar, Reconciliados
- Filtro por saldo (mín/máx)
- Tabela expansível (click para ver documentos do grupo)
- Paginação (100/página) topo e fundo dentro do `#recon-results-section`
- Exportação CSV/JSON/XML/XLSX/PDF

### Exportação
- Modal com seleção de dados (todos / duplicados / únicos)
- Formatos: CSV, JSON, XML, XLSX (SheetJS), PDF (jsPDF, máx. 2000)
- Log de operações exportável em .txt

---

## DOM — Secções Principais

| ID | Visibilidade | Conteúdo |
|----|-------------|---------|
| `#import-section` | inicial | Upload, fila, mapeamento |
| `#content` | após importação | Toolbar + todas as secções de análise |
| `#field-selector` | Op1 ativo | Seletor de campos |
| `#recon-config` | Op2 ativo | Config reconciliação |
| `#results-section` | após Op1 run | Cards + filtros + paginação + dup-list |
| `#recon-results-section` | após Op2 run | Cards + dashboard + tabela |
| `#export-modal` | a pedido | Modal export Op1 (fixed) |
| `#recon-export-modal` | a pedido | Modal export Op2 (fixed) |
| `#log-modal` | a pedido | Log de operações (fixed) |

---

## Performance

- ✅ Suporta datasets de 344.000+ registos
- ✅ Paginação server-side (render só 100/página)
- ✅ Web Worker para parsing de Excel (não bloqueia UI)
- ✅ Gráficos Chart.js colapsáveis
- ✅ Zero erros JS (verificado via Playwright headless)

---

## Como Correr

**Modo servidor (obrigatório para ES modules):**
```bash
node server.js
# http://localhost:3000
```

**Verificação automatizada:**
```bash
node verify-phase7.mjs
# Abre Chromium headless, testa 12 fluxos, guarda screenshots em verify-shots/
```

**CDN necessários (internet):** SheetJS 0.18.5 · jsPDF 2.5.1 · Chart.js 3.9.1

---

## Histórico de Versões

| Versão | Data | Descrição |
|--------|------|-----------|
| 2.4.0 | 2026-05-24 | Migração ES modules completa (Fases 1–7), fix Op2 cards, paginação Op1 correcta |
| 2.3.0 | 2026-05-23 | Dashboard reconciliação, gráficos, filtros inteligentes |
| 2.2.0 | — | Op2 reconciliação base |
| 2.1.0 | — | Op1 duplicados |
| 2.0.0 | — | Versão inicial |
