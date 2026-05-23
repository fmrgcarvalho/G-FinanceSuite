# G-FinanceSuite — Análise de Duplicados e Reconciliação

Aplicação web para **deteção de duplicados** e **reconciliação financeira** de dados contabilísticos. Suporta Excel, CSV e JSON com dashboards visuais, filtros em tempo real e exportação multi-formato.

---

## Funcionalidades

### Operação 1 — Identificar Duplicados
- Upload de múltiplos ficheiros com consolidação automática
- Mapeamento de colunas com auto-sugestão por aliases
- Seleção de campos para agrupamento (chips interativos)
- Cálculo de grupos duplicados + registos únicos + soma de valores
- Cards clicáveis para filtrar (Total / Únicos / Duplicados)
- Filtros: texto, montante mín/máx, nº exato de duplicados, campo de procura
- Ordenação por qualquer coluna
- Paginação (100/página) no topo e fundo da tabela

### Operação 2 — Reconciliação Avançada
- Dashboard visual: Pie Chart + Bar Chart (Chart.js)
- Estatísticas: saldo total, médio, mediana, máximo
- Cards clicáveis: Total / Reconciliados / Por reconciliar
- Tabela expansível — click numa linha para ver os documentos do grupo
- Filtro por saldo mínimo e máximo
- Paginação (100/página) no topo e fundo da tabela

### Exportação
- CSV, JSON, XML, XLSX (SheetJS), PDF (até 2000 registos)
- Seleção de dados: todos / duplicados / únicos (Op1) ou todos / reconciliados / por reconciliar (Op2)
- Log de operações exportável em .txt

---

## Estrutura

```
G-FinanceSuite/
├── docs/
│   ├── index.html
│   ├── js/
│   │   ├── app.js                  — Orquestrador (event listeners, init)
│   │   ├── state.js                — AppState centralizado
│   │   ├── modules/
│   │   │   ├── logger.js           — Logger partilhado
│   │   │   ├── ui.js               — Utilitários de DOM
│   │   │   ├── pagination.js       — Paginação Op1 + Op2
│   │   │   ├── import.js           — Upload, fila, mapeamento
│   │   │   ├── duplicates.js       — Op1: análise, filtros, ordenação
│   │   │   ├── reconciliation.js   — Op2: análise, dashboard, filtros
│   │   │   └── export.js           — Exportação multi-formato
│   │   └── workers/
│   │       └── excel.worker.js     — Web Worker para Excel
│   └── css/
│       └── style.css
├── server.js                       — Servidor Express estático
└── package.json
```

---

## Como Correr

A aplicação usa ES6 modules — requer servidor HTTP (não funciona com `file://`).

```bash
npm install
node server.js
# Aceder em http://localhost:3000
```

**Ou com serve:**
```bash
npx serve docs
```

**Dependências CDN (internet necessária):**

| Biblioteca | Versão | Uso |
|-----------|--------|-----|
| SheetJS | 0.18.5 | Leitura de Excel e CSV |
| jsPDF | 2.5.1 | Exportação PDF |
| Chart.js | 3.9.1 | Gráficos Pie e Bar |

---

## Fluxo de Uso

### Duplicados
1. Arrasta ou seleciona ficheiros (Excel / CSV / JSON)
2. Processa — barra de progresso por ficheiro
3. Mapeia colunas (auto-sugestão)
4. Seleciona campos que identificam um duplicado
5. Executa análise
6. Filtra e ordena os resultados
7. Exporta

### Reconciliação
1. Arrasta ou seleciona ficheiros
2. Processa e mapeia
3. Configura: campo de agrupamento + campo de valor + tolerância
4. Executa análise
5. Explora o dashboard (gráficos + estatísticas)
6. Filtra por cards e por saldo
7. Expande linhas da tabela para ver documentos
8. Exporta

---

## Performance

- Suporta datasets de 344.000+ registos
- Paginação de 100 itens/página para renderização rápida
- Web Worker para parsing de Excel sem bloquear a UI
- Gráficos colapsáveis para poupar memória

---

## Segurança

- Sem servidor — dados processados inteiramente no browser
- Sem envio de dados para servidores externos
- Pode funcionar offline após o carregamento inicial da página

---

**Versão 2.4.0 · 2026-05-24**
