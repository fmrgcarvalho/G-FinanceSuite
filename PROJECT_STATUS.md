# Status do Projeto — G-FinanceSuite

**Data**: 2026-05-23
**Versão**: 2.3.0
**Status**: Frontend funcional com dashboard avançado

---

## Estrutura

```
G-FinanceSuite/
├── docs/
│   ├── index.html              — Interface principal
│   ├── js/
│   │   ├── app.js              — Lógica (~3200 linhas)
│   │   ├── utils.js            — Utilitários
│   │   └── workers/
│   │       └── excel.worker.js — Web Worker para Excel
│   └── css/
│       └── style.css           — Estilos (~1000 linhas)
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

### Opção 1: Análise de Duplicados
- Seleção de campos para agrupamento
- Cálculo de grupos duplicados
- Soma de valores por grupo
- Cartões de resumo clicáveis para filtrar
- Filtros por texto, montante, contagem
- Ordenação por qualquer campo
- Paginação (100 registos/página)

### Opção 2: Reconciliação ⭐ (Novo!)
#### Dashboard Visual
- **Gráfico Pie Chart**: Status reconciliação (Reconciliados vs Por reconciliar)
- **Gráfico Bar Chart**: Top 10 maiores saldos desalinhados
- **Gráficos colapsáveis**: Botão para minimizar/maximizar

#### Estatísticas
- Saldo total
- Saldo médio
- Mediana de saldos
- Maior saldo (valor absoluto)

#### Tabela de Grupos
- Coluna: Número do grupo
- Coluna: Quantidade de registos
- Coluna: Saldo líquido
- Coluna: Status (✅ Reconciliado / ❌ Por reconciliar)
- **Coluna: Documentos** (números dos documentos com pré-visualização)
- **Linhas expansíveis**: Click para ver detalhes dos documentos
- Paginação (100 grupos/página)

#### Filtros
- **Cards clicáveis**: Total, Reconciliados, Por reconciliar
  - Filtram dinâmicamente a tabela abaixo
  - Visual feedback (opacity + scale)
- **Filtro por saldo**: Mín e máximo em euros
- **Botão Limpar**: Reset de filtros

#### Configuração
- **Layout horizontal compacto**: Agrupar por, Campo de valor, Tolerância, Executar
- Design moderno com gradiente
- Apenas ~50px de altura (66% mais compacto que antes)

### Filtros e Navegação
- Filtro por texto, montante, contagem
- Ordenação por qualquer campo
- Paginação (100 itens/página)
- Cards interativos para filtrar resultados

### Exportação
- CSV, JSON, XML, PDF
- Log de operações em .txt

---

## Performance

- ✅ Suporta datasets de **344.000+ registos**
- ✅ Renderização rápida com paginação (100/página)
- ✅ Stack overflow corrigido (Math.max → reduce)
- ✅ Dashboard colapsável para economizar espaço

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

Requer ligação à internet para:
- SheetJS (Excel)
- jsPDF (Exportação PDF)
- Chart.js (Gráficos)

---

## Últimas Melhorias (v2.3.0)

✨ **Dashboard de reconciliação com visualizações avançadas**
- Gráficos interativos (Chart.js)
- Paginação eficiente (100 grupos/página)
- Filtros dinâmicos nos cards
- Tabela expansível com documentos
- Estatísticas detalhadas
- Gráficos colapsáveis
- Design moderno e responsivo

**Última atualização**: 2026-05-23
