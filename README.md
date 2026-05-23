# G-FinanceSuite — Análise de Duplicados e Reconciliação

Web application for **duplicate detection** and **data reconciliation analysis**. Supports Excel, CSV, and JSON formats.

---

## Funcionalidades

### Operação 1 — Identificar Duplicados
- Upload de múltiplos ficheiros (consolidação automática)
- Mapeamento de colunas com auto-sugestão
- Seleção de campos para agrupamento (chips interativos)
- Cálculo de grupos duplicados e registos únicos
- Soma de valores numéricos por grupo
- Filtros: texto, montante mín/máx, nº exato de duplicados
- Ordenação por qualquer campo
- Paginação (topo e fundo)

### Operação 2 — Reconciliação
- Comparação entre dois conjuntos de dados
- Campo de agrupamento e campo de valor configuráveis
- Tolerância de saldo ajustável
- Vista de reconciliados vs por reconciliar

### Exportação
- CSV, JSON, XML

### Outros
- Log de operações em tempo real (exportável em .txt)
- Barra de info sticky ao fazer scroll
- Seleção de operação acessível na barra sticky

---

## Estrutura

```
G-FinanceSuite/
├── docs/
│   ├── index.html              — Main interface
│   ├── js/
│   │   ├── app.js              — Lógica (~2800 linhas)
│   │   ├── utils.js            — Utilitários
│   │   └── workers/
│   │       └── excel.worker.js — Web Worker para Excel
│   └── css/
│       └── style.css           — Estilos
├── package.json
└── README.md
```

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

Requer ligação à internet para carregar SheetJS via CDN.

---

## Dependências CDN

- **SheetJS 0.18.5** — leitura de Excel/CSV (carregado automaticamente)

---

## Fluxo de Uso

1. Seleciona ficheiros (Excel, CSV ou JSON) — drag-and-drop ou botão
2. Processa os ficheiros (fila com progresso individual)
3. Mapeia colunas (auto-sugestão por aliases)
4. Escolhe operação: Duplicados ou Reconciliação
5. Seleciona campos e executa análise
6. Filtra, ordena e exporta resultados

---

**Version**: 2.2.0  
**Last Updated**: 2026-05-23
