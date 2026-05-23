# G-FinanceSuite — Análise de Duplicados e Reconciliação

Web application for **duplicate detection** and **advanced data reconciliation analysis**. Supports Excel, CSV, and JSON formats with visual dashboards, real-time filtering, and detailed reporting.

---

## 🎯 Funcionalidades

### 📦 Operação 1 — Identificar Duplicados
- ✅ Upload de múltiplos ficheiros (consolidação automática)
- ✅ Mapeamento de colunas com auto-sugestão
- ✅ Seleção de campos para agrupamento (chips interativos)
- ✅ Cálculo de grupos duplicados e registos únicos
- ✅ Soma de valores numéricos por grupo
- ✅ **Filtros dinâmicos**: texto, montante mín/máx, nº exato de duplicados
- ✅ **Cards clicáveis** para filtrar (Total, Duplicados, Únicos)
- ✅ Ordenação por qualquer campo
- ✅ Paginação (100 itens/página, topo e fundo)

### 💰 Operação 2 — Reconciliação Avançada ⭐ (v2.3.0)

#### 📊 Dashboard Visual
- **Gráfico Pie Chart**: Distribuição (Reconciliados vs Por reconciliar)
- **Gráfico Bar Chart**: Top 10 maiores saldos
- **Gráficos colapsáveis**: Botão para minimizar/maximizar
- **Responsivo**: Carrega dados até 344.000+ registos

#### 📈 Estatísticas Detalhadas
- Saldo total (soma líquida)
- Saldo médio por grupo
- Mediana de saldos
- Maior saldo (valor absoluto)

#### 📋 Tabela de Grupos Estruturada
- **Coluna Grupo**: ID do grupo de atribuição
- **Coluna Registos**: Quantidade de documentos por grupo
- **Coluna Saldo**: Montante líquido (com cor: vermelho=grande desvio)
- **Coluna Status**: ✅ Reconciliado | ❌ Por reconciliar
- **Coluna Documentos**: Prévia dos números de documentos
- **Linhas Expansíveis**: Click para ver documentos completos com montantes
- **Paginação**: 100 grupos/página (otimizado para performance)

#### 🎛️ Filtros Inteligentes
- **Cards Interativos**: 
  - Clique "Total" → mostra todos os grupos
  - Clique "Reconciliados" → apenas os dentro da tolerância
  - Clique "Por reconciliar" → apenas os acima da tolerância
  - Visual feedback com opacity e escala
- **Filtro por Saldo**: Mínimo e máximo em euros
- **Botão Limpar**: Reset de todos os filtros

#### ⚙️ Configuração Compacta
- Layout horizontal (apenas ~50px de altura)
- 4 campos em uma linha: Agrupar por, Montante, Tolerância, Executar
- Design moderno com gradiente
- Ícones informativos (📊 📊 💰 ✓)

### 📥 Exportação
- CSV, JSON, XML, **PDF** (até 2000 registos)
- Relatório formatado com data e estatísticas
- Log de operações em .txt

### 🛠️ Interface
- Log de operações em tempo real (exportável em .txt)
- Barra de info sticky ao fazer scroll
- Seleção de operação acessível na barra sticky
- Dark mode friendly
- Mobile responsive

---

## 📁 Estrutura

```
G-FinanceSuite/
├── docs/
│   ├── index.html              — Interface principal
│   ├── js/
│   │   ├── app.js              — Lógica (~3200 linhas, bem documentado)
│   │   ├── utils.js            — Utilitários
│   │   └── workers/
│   │       └── excel.worker.js — Web Worker para Excel (async)
│   └── css/
│       └── style.css           — Estilos (~1000 linhas)
├── PROJECT_STATUS.md           — Status detalhado do projeto
├── package.json
└── README.md
```

---

## 🚀 Como Correr

A aplicação é **puramente frontend** — não precisa de servidor ou instalação.

**Opção 1: Abrir diretamente**
```
docs/index.html
```

**Opção 2: Com servidor estático (recomendado)**
```bash
npx serve docs
# Acessa em: http://localhost:3000
```

**Requisitos:**
- Navegador moderno (Chrome, Firefox, Edge, Safari)
- Ligação à internet para carregar bibliotecas CDN

---

## 📚 Dependências CDN

| Biblioteca | Versão | Uso |
|-----------|--------|-----|
| **SheetJS** | 0.18.5 | Leitura de Excel, CSV |
| **jsPDF** | 2.5.1 | Exportação PDF |
| **Chart.js** | 3.9.1 | Gráficos (Pie, Bar) |

Todas carregam **automaticamente** — sem instalação local necessária.

---

## 📖 Fluxo de Uso

### Duplicados
1. 📁 Seleciona ficheiros (drag-and-drop ou botão)
2. ⚙️ Processa ficheiros (fila com progresso)
3. 🗺️ Mapeia colunas (auto-sugestão)
4. 🔍 Seleciona campos para agrupamento
5. 📊 Executa análise
6. 🎯 **Filtra por Cards** (Total, Duplicados, Únicos)
7. 📤 Exporta resultados

### Reconciliação
1. 📁 Seleciona ficheiros
2. ⚙️ Processa ficheiros
3. 🗺️ Mapeia colunas
4. ⚖️ Seleciona campo de agrupamento + campo de valor + tolerância
5. 📊 Executa análise
6. 👀 **Visualiza Dashboard** (gráficos + estatísticas)
7. 🎯 **Filtra por Cards** (Total, Reconciliados, Por reconciliar)
8. 📈 **Explora Tabela** (click nas linhas para ver documentos)
9. 📤 Exporta relatório detalhado

---

## ⚡ Performance

- ✅ Suporta datasets de **até 344.000+ registos**
- ✅ Renderização rápida com paginação (100 itens/página)
- ✅ Stack overflow corrigido (optimizações)
- ✅ Web Worker para Excel async
- ✅ Gráficos colapsáveis para economizar memória

---

## 🎨 Interface

- **Clean Design**: Cores consistentes, espaçamento bem pensado
- **Dark Borders**: Cards com bordas elegantes
- **Ícones Informativos**: Emoji para rápida identificação
- **Feedback Visual**: Hover effects, transitions smooth
- **Acessível**: Labels claros, contraste adequado

---

## 📝 Exemplos de Uso

### Encontrar Duplicados de Faturas
```
1. Upload: invoices.xlsx
2. Agrupar por: numero_fatura
3. Campo soma: montante
4. Resultado: 450 faturas duplicadas
```

### Reconciliar Contas
```
1. Upload: exports.csv + entries.json
2. Agrupar por: atribuicao
3. Montante: saldo
4. Tolerância: 1.00 €
5. Resultado: 5.049 contas reconciliadas
6. Dashboard: Visualizar top 10 desalinhados
7. Tabela: Expandir grupo para ver documentos individuais
```

---

## 🔄 Versão Atual

- **Versão**: 2.3.0
- **Data**: 2026-05-23
- **Status**: ✅ Completamente funcional
- **Commits recentes**: Dashboard visual, paginação, filtros inteligentes

---

## 🛡️ Segurança

- ✅ Sem servidor — dados nunca saem do browser
- ✅ Sem autenticação necessária
- ✅ Sem armazenamento remoto
- ✅ Pode usar offline (após carregar a página)

---

**Made with ❤️ for financial data analysis**
