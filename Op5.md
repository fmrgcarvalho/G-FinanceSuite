# Op5 — AI Data Intelligence
## Análise de Viabilidade + Plano de Implementação

> Documento gerado com base na spec original, adaptado à arquitectura real da G-FinanceSuite.

---

## 1. Avaliação de Viabilidade

### 1.1 O que é compatível com a arquitectura actual

A G-FinanceSuite usa **ES6 modules nativos, sem bundler, com libs via CDN**. Não é React/TypeScript/Vite. A tabela abaixo avalia cada componente da spec:

| Componente | Spec original | Viável na arch. actual? | Alternativa |
|---|---|---|---|
| Upload CSV/XLSX/JSON | xlsx + papaparse | ✅ Já existe em `import.js` | Re-usar loaders existentes |
| Preview de dados / tabela | TanStack Table | ⚠️ Requer React | Virtual table vanilla JS |
| Motor estatístico | danfo.js / arquero | ✅ Arquero via CDN (sem React) | `arquero` ou stats puras |
| Deteção de anomalias | z-score, IQR | ✅ Pure JS | `simple-statistics` via CDN |
| Tendências / correlações | ml.js | ✅ Via CDN | `simple-statistics` |
| Charts automáticos | Recharts | ⚠️ Requer React | **ECharts** via CDN (já funciona standalone) |
| Chat interface | — | ✅ Vanilla JS | Módulo de chat puro |
| Query planner (intenção) | LLM | ✅ Rule-based (mais fiável para dados estruturados) | Keyword matching + JSON structured ops |
| LLM local (linguagem natural) | WebLLM / Transformers.js | ✅ Possível sem npm — 4 opções, todas via fetch ou CDN | Ver Fase 4 — avaliação detalhada |
| Context memory | Zustand | ✅ AppState já existe | Extensão de AppState |
| Persistência de histórico | IndexedDB | ✅ Já existe em `filestore.js` | Nova IDB store |
| Dark mode | Framer Motion | ✅ CSS vars já definidas | Toggle de `data-theme` |
| Estado global | Zustand | ✅ AppState | Extensão de AppState |
| UI/design | shadcn + Tailwind | ⚠️ Requer build | CSS classes custom (mesmo sistema das Fases 1–4) |

**Conclusão:** 100% da spec é implementável na arquitectura actual. O LLM local não requer nenhuma biblioteca npm — pode ser integrado via `fetch()` para Ollama (proxy no server.js existente) ou CDN `<script>` para WebLLM/Transformers.js. A abordagem preferida é Ollama como primário + Chrome window.ai como fallback automático.

---

### 1.2 Decisão de arquitectura: Rule-based AI vs LLM

Para **dados estruturados financeiros**, um query planner determinístico supera um LLM em:

- **Exactidão**: nunca alucina valores. O LLM pode inventar números.
- **Velocidade**: resposta instantânea vs 5–30s para inferência local.
- **Privacidade**: zero bytes saem do browser, zero downloads.
- **Custo de contexto**: não é necessário serializar o dataset para o modelo.

A abordagem correcta (igual ao que a spec descreve na secção "IMPORTANTÍSSIMO"):

```
User: "quais os top 5 clientes?"
       ↓
Intent Parser   → { intent: "top_n", field: "cliente", metric: "total", n: 5 }
       ↓
Data Engine     → GROUP BY cliente, SUM(montante), ORDER DESC, LIMIT 5
       ↓
Response Builder → texto natural em PT com os resultados reais
```

O LLM só seria necessário para queries abertas/ambíguas como "porque é que abril foi mau?" — isso fica para Fase 4.

---

## 2. Arquitectura de Módulos

```
docs/js/modules/
  ├── (existentes — não tocar)
  │
  ├── op5DataEngine.js      (~600 linhas) — motor analítico puro
  │     stats: sum/avg/median/stdev/min/max/count
  │     groupBy, topN, correlation, trend
  │     outliers: z-score, IQR
  │     duplicates, missing values
  │
  ├── op5Planner.js         (~300 linhas) — intent recognition
  │     parseIntent(text) → { intent, params }
  │     intents: top_n | aggregate | trend | anomaly |
  │              summary | filter | compare | distribution
  │     keyword matching + regex + synonym table
  │
  ├── op5Chat.js            (~400 linhas) — chat state + response
  │     ChatHistory (memory de contexto, max 20 turns)
  │     buildResponse(intentResult) → string PT
  │     suggestions automáticas baseadas no dataset
  │
  ├── op5Insights.js        (~300 linhas) — auto-insights
  │     runAutoInsights(data) → Insight[]
  │     detecta: nulos, duplicados, outliers, top concentração,
  │              tendência temporal, crescimento, distribuição
  │
  ├── op5Charts.js          (~400 linhas) — charts automáticos
  │     renderChart(container, type, data, options)
  │     auto-select tipo de chart por intent
  │     usa ECharts (CDN, sem React)
  │
  ├── op5Ui.js              (~700 linhas) — UI / DOM
  │     render da interface completa
  │     chat panel, insights panel, dataset overview
  │     virtual table (scroll infinito para 100k+ linhas)
  │
  └── op5Store.js           (~200 linhas) — persistência IDB
        salvar/restaurar datasets, histórico de chat, insights
```

**Regra respeitada**: nenhum módulo ultrapassa 800 linhas.

---

## 3. Libs externas necessárias (CDN)

| Lib | Peso | CDN | Para quê |
|---|---|---|---|
| `simple-statistics` | ~50 KB | cdnjs | média, mediana, desvio-padrão, correlação, regressão linear |
| `ECharts` | ~900 KB (já carrega em background) | cdnjs | charts automáticos (line, bar, pie, scatter, heatmap) |
| `arquero` (opcional) | ~200 KB | jsdelivr | agrupamentos/joins complexos; fallback: pure JS |

`xlsx` e `Chart.js` já estão carregados. ECharts pode substituir Chart.js progressivamente para Op5.

**Sem novos frameworks**. Sem React, sem Vite, sem TypeScript.

---

## 4. Plano de Implementação — 5 Fases

---

### Fase 1 — Dataset Engine + UI Base (MVP)
**Duração estimada:** 3–4 sessões  
**Resultado:** O utilizador carrega um ficheiro e vê análise estatística completa.

#### 4.1.1 Módulos novos
- `op5DataEngine.js` — implementar todas as funções estatísticas
- `op5Insights.js` — auto-insights após upload
- `op5Ui.js` (estrutura base) — layout da secção

#### 4.1.2 UI

```
┌─────────────────────────────────────────────────┐
│  ← Voltar    AI Data Intelligence               │
├─────────────────────────────────────────────────┤
│  📂 Upload (re-usa componente .upload-slot)     │
├─────────────────────────────────────────────────┤
│  DATASET OVERVIEW                               │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ │
│  │ 4823 │ │  12  │ │  3%  │ │  47  │ │ Fin. │ │
│  │Linhas│ │Camp.│ │Nulos │ │Dups  │ │Tipo  │ │
│  └──────┘ └──────┘ └──────┘ └──────┘ └──────┘ │
├─────────────────────────────────────────────────┤
│  AUTO-INSIGHTS                                  │
│  ⚠ 3 clientes representam 72% da faturação     │
│  📈 Crescimento médio mensal: +8.4%             │
│  🔴 14 outliers detectados (z-score > 3)        │
│  🔵 Campo 'data' detectado — análise temporal   │
├─────────────────────────────────────────────────┤
│  TABELA DE DADOS (virtual scroll — 100k linhas) │
│  com sorting, filtering, highlight de anomalias │
└─────────────────────────────────────────────────┘
```

#### 4.1.3 Auto-Insights gerados automaticamente
```
- % de valores nulos por campo
- Nº de duplicados
- Campo de data detectado (sim/não)
- Top campo numérico: média, stdev, min, max
- Concentração: top-3 valores de campo categórico = X% do total
- Outliers detectados (z-score > 2.5)
- Tipo de dataset inferido: Financeiro / RH / CRM / Logística / Outro
```

#### 4.1.4 Dataset type detection
```js
// Fingerprint por nome de colunas
FINANCIAL: ['montante','valor','saldo','debito','credito','fatura','invoice','amount']
HR:        ['nome','colaborador','salario','departamento','employee']
CRM:       ['cliente','customer','contacto','email','nif','crm']
LOGISTICS: ['produto','quantidade','stock','armazem','sku','shipment']
```

---

### Fase 2 — Query Planner + Chat UI
**Duração estimada:** 3–4 sessões  
**Resultado:** O utilizador conversa com os dados em português.

#### 4.2.1 Intent catalogue

| Intent | Exemplos de trigger | Parâmetros |
|---|---|---|
| `top_n` | "top clientes", "maiores", "melhores 10" | field, metric, n, sort |
| `aggregate` | "soma", "média", "total de", "quantos" | operation, field, groupBy |
| `anomaly` | "anomalias", "outliers", "suspeitos", "fora do normal" | field, method, threshold |
| `trend` | "tendência", "evolução", "ao longo do tempo", "crescimento" | field, dateField |
| `summary` | "resume", "resumo", "overview", "explica" | — |
| `filter` | "mostra", "lista", "where", "quando", "de [valor]" | field, value, operator |
| `compare` | "compara", "diferença entre", "vs" | fieldA, fieldB |
| `distribution` | "distribuição", "histograma", "como estão distribuídos" | field, buckets |
| `missing` | "nulos", "em falta", "incompletos" | field |
| `duplicates` | "duplicados", "repetidos" | fields |

#### 4.2.2 Chat UI

```
┌─────────────────────────────────────────────────┐
│  SUGESTÕES RÁPIDAS                              │
│  [📊 Top clientes] [⚠ Anomalias] [📈 Tendências]│
│  [🔍 Duplicados] [📋 Resumo] [📅 Por mês]       │
├─────────────────────────────────────────────────┤
│                                                 │
│  🤖 Dataset carregado: 4823 registos, 12        │
│     campos. Tipo detectado: Financeiro.         │
│     Detectei 3 campos numéricos e 1 de data.   │
│                                                 │
│     Pode perguntar: "quais os top clientes?",   │
│     "existem anomalias?", "resume os dados".    │
│                                                 │
│  👤 quais os top 5 clientes por faturação?      │
│                                                 │
│  🤖 Top 5 clientes por faturação total:         │
│     1. ACME Lda — €124.500 (23.1%)             │
│     2. Beta SA — €98.200 (18.2%)               │
│     (...) [📊 Ver gráfico]                      │
│                                                 │
├─────────────────────────────────────────────────┤
│  [  escreva uma pergunta...              ] [▶]  │
└─────────────────────────────────────────────────┘
```

#### 4.2.3 Context memory

```js
// ChatHistory — últimas 20 mensagens
// Resolve referências: "agora mostra o mesmo para porto"
// → repete último intent com filtro { cidade: 'porto' }

// Contexto activo: último intent executado + resultado resumido
// Permite: "e os bottom 5?" → top_n com sort ASC do mesmo intent
```

---

### Fase 3 — Charts Automáticos + Auto-Insights Avançados
**Duração estimada:** 2–3 sessões  
**Resultado:** Respostas com gráfico embutido. Insights de tendência e correlação.

#### 4.3.1 Chart auto-selection

| Intent | Chart recomendado |
|---|---|
| `top_n` | Bar horizontal |
| `trend` | Line chart (eixo X = data) |
| `distribution` | Histogram / Bar |
| `compare` | Bar agrupado |
| `aggregate` com groupBy | Bar vertical |
| `anomaly` | Scatter com outliers marcados |

ECharts via CDN: `https://cdnjs.cloudflare.com/ajax/libs/echarts/5.4.3/echarts.min.js`

#### 4.3.2 Insights avançados (Fase 3)

```
Tendência temporal:
  - regressão linear sobre campo numérico × campo data
  - "crescimento de +8.4% ao mês nos últimos 6 meses"
  - slope > 0 → crescimento | slope < 0 → queda

Correlação:
  - Pearson entre pares de campos numéricos
  - "campo 'desconto' tem correlação negativa com 'faturação' (r=-0.74)"

Concentração (Pareto):
  - top 20% de [campo] = X% de [métrica]
  - "20% dos clientes representam 78% da faturação"

Sazonalidade:
  - Agrupar por mês/trimestre, identificar picos/vales
  - "Março e Setembro são consistentemente os meses mais altos"
```

---

### Fase 4 — LLM Local
**Duração estimada:** 2–3 sessões  
**Pré-requisito:** nenhuma biblioteca npm — todos os métodos funcionam via `fetch()` ou CDN `<script>`

> Descoberta importante: **nenhuma das 4 opções requer npm ou bundler**. São todas compatíveis com a arquitectura actual.

---

#### 4.4.1 Avaliação das 4 opções

| | Ollama | Chrome window.ai | WebLLM CDN | Transformers.js CDN |
|---|---|---|---|---|
| **Como integrar** | `fetch('http://localhost:11434')` | `window.ai.languageModel` | `<script src="cdn">` | `import { pipeline } from 'cdn'` |
| **JS library** | ❌ nenhuma | ❌ nenhuma | ❌ CDN script tag | ❌ CDN ES module |
| **Qualidade do modelo** | ⭐⭐⭐⭐⭐ (7B–70B) | ⭐⭐⭐ (Gemini Nano) | ⭐⭐⭐⭐ (1B–8B quant.) | ⭐⭐ (modelos distilados) |
| **Hardware mínimo** | 8 GB RAM (CPU) | 16 GB RAM + GPU | 8 GB RAM + WebGPU | 4 GB RAM (WASM) |
| **Download** | 1× via `ollama pull` | 22 GB (automático Chrome) | 1–4 GB (1ª vez, cache browser) | 100–600 MB (cache browser) |
| **Compatibilidade browser** | Todos (fetch) | Chrome 148+ apenas | Chrome/Edge com WebGPU | Todos (WASM fallback) |
| **CORS** | Requer config ou proxy | N/A | N/A | N/A |
| **Dados saem da máquina** | ❌ nunca | ❌ nunca | ❌ nunca | ❌ nunca |
| **Status** | Maduro, produção | Estável Chrome 148 (Mai 2026) | Estável | Estável |

---

#### 4.4.2 Recomendação: Ollama como primário + window.ai como fallback

**Porquê Ollama é o melhor para este contexto:**
- Utilizadores enterprise (SAP, financeiro) têm perfil técnico — Ollama é uma instalação única simples
- Qualidade muito superior: acesso a Llama 3.2, Phi-4, Mistral, Gemma 3, Qwen 2.5
- Sem limite de tokens de contexto problemático
- CPU-only funciona bem com modelos 3B–7B
- API idêntica ao OpenAI — fácil de implementar

**window.ai como fallback silencioso:**
- Se `window.ai` disponível e Ollama não → usa Gemini Nano automaticamente
- Zero friction para utilizadores Chrome 148+

**Transformers.js como último fallback (opcional):**
- Se nenhum dos anteriores → oferecer download de modelo leve (200 MB)

---

#### 4.4.3 Integração Ollama — sem CORS via proxy server.js

O problema do CORS (Ollama bloqueia requests do browser por defeito) resolve-se **sem configurar o Ollama** — basta um endpoint proxy no `server.js` já existente:

```js
// server.js — adicionar endpoint proxy
app.post('/api/ai/chat', async (req, res) => {
  if (!_sessionValid(req)) return res.status(401).json({ error: 'unauthorized' });
  
  const resp = await fetch('http://localhost:11434/api/chat', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(req.body),
  });
  
  if (!resp.ok) return res.status(503).json({ error: 'ollama_unavailable' });
  
  // Streaming pass-through
  res.setHeader('Content-Type', 'application/x-ndjson');
  resp.body.pipeTo(new WritableStream({
    write(chunk) { res.write(chunk); },
    close()      { res.end(); }
  }));
});
```

O browser chama `/api/ai/chat` (mesmo origin — sem CORS). O server.js faz a chamada ao Ollama internamente. **Dados nunca saem da máquina.**

---

#### 4.4.4 Detecção automática de LLM disponível

```js
// op5Llm.js — auto-detect disponibilidade
export async function detectLlmBackend() {
  // 1. Testar Ollama via proxy
  try {
    const r = await fetch('/api/ai/ping', { signal: AbortSignal.timeout(1000) });
    if (r.ok) return { backend: 'ollama', model: (await r.json()).model };
  } catch {}
  
  // 2. Testar Chrome window.ai
  if ('ai' in window && 'languageModel' in window.ai) {
    const status = await window.ai.languageModel.availability();
    if (status === 'available') return { backend: 'chrome-ai', model: 'gemini-nano' };
  }
  
  // 3. Nenhum disponível → rule-based planner
  return { backend: 'planner', model: null };
}
```

A UI mostra o backend activo de forma transparente:
```
🟢 Ollama (llama3.2)          — qualidade máxima
🟡 Chrome AI (Gemini Nano)    — disponível
⚪ Modo analítico (sem LLM)   — sempre disponível
```

---

#### 4.4.5 Estratégia de contexto (crítica para não alucinar)

**Nunca enviar os dados raw ao LLM.** Enviar apenas:

```js
const llmContext = {
  schema: dataset.fields.map(f => ({ name: f.name, type: f.type, sample: f.samples })),
  stats:  {
    rowCount:    dataset.length,
    numericFields: dataset.numericFields.map(f => ({
      name: f.name, min: f.min, max: f.max, avg: f.avg, stdev: f.stdev
    })),
    categoricalFields: dataset.catFields.map(f => ({
      name: f.name, uniqueCount: f.uniqueCount, topValues: f.topValues
    })),
    insights: autoInsights.slice(0, 8),   // resumo dos insights já calculados
  },
  chatHistory: chatHistory.slice(-6),      // últimas 6 mensagens (contexto)
};
```

O LLM usa este contexto para **interpretar** a pergunta e devolver uma operação estruturada. O Data Engine executa o cálculo real.

```
Utilizador: "qual o cliente com maior crescimento este ano?"

LLM devolve:
{
  "op": "trend_by_group",
  "groupField": "cliente",
  "metricField": "faturacao",
  "dateField": "data",
  "timeframe": "current_year",
  "sort": "growth_desc",
  "limit": 1
}

Data Engine calcula → resposta real com valores correctos
LLM gera frase natural explicativa com os valores recebidos
```

---

#### 4.4.6 System prompt

```
És um analista de dados financeiros local e privado.

Dataset: {datasetType} | {rowCount} registos | {fieldCount} campos
Campos numéricos: {numericFieldNames}
Campos de data: {dateFieldNames}
Campos categóricos: {catFieldNames}

REGRAS CRÍTICAS:
- NUNCA inventes valores. NUNCA calcules — devolve sempre uma operação estruturada.
- Responde sempre em português de Portugal.
- Sê conciso e directo — máximo 3 frases.
- Se não souberes a resposta com os dados disponíveis, diz-o claramente.

Se a pergunta requer cálculo, devolve APENAS JSON:
{"op":"nome_da_op","field":"...","metric":"..."}

Operações disponíveis: top_n | aggregate | trend | anomaly | 
                        summary | filter | compare | distribution |
                        correlation | missing | duplicates
```

---

#### 4.4.7 Modelos Ollama recomendados por hardware

| RAM disponível | Modelo recomendado | Tamanho | Velocidade |
|---|---|---|---|
| 8 GB | `phi4-mini` | 2.5 GB | ⚡ Rápido |
| 8 GB | `llama3.2:3b` | 2.0 GB | ⚡ Rápido |
| 16 GB | `llama3.2` | 2.0 GB | ⚡⚡ |
| 16 GB | `qwen2.5:7b` | 4.7 GB | ⭐ Melhor qualidade/velocidade |
| 32 GB | `llama3.1:8b` | 4.9 GB | ⭐⭐ Excelente |

Comando de instalação: `ollama pull qwen2.5:7b`

---

### Fase 5 — Enterprise (Multi-Dataset + Exportação)
**Duração estimada:** 3–4 sessões  
**Resultado:** Comparar múltiplos datasets, exportar dashboards.

- Carregar 2 datasets e fazer JOIN por campo comum
- Identificar divergências entre datasets (complementa Op3)
- Dashboard exportável para PDF/XLSX com charts + insights
- Histórico de chats persistido em IndexedDB (por dataset)
- Agentes especializados: Financeiro, RH, CRM (system prompts diferentes)

---

## 5. Integração na App Existente

### 5.1 Mode card (já existe o selector)

```html
<!-- Novo card no #mode-section -->
<button id="mode-op5-card" class="mode-card mode-card--teal"
        aria-label="AI Data Intelligence: chat com dados, insights automáticos">
  <span class="mode-card__icon" aria-hidden="true">🧠</span>
  <h3 class="mode-card__title">AI Data Intelligence</h3>
  <p class="mode-card__desc">Converse com os seus dados. Insights automáticos, anomalias e tendências.</p>
  <div class="mode-card__tags">
    <span class="mode-tag mode-tag--teal">Chat IA</span>
    <span class="mode-tag mode-tag--teal">Auto-Insights</span>
    <span class="mode-tag mode-tag--teal">Charts</span>
  </div>
</button>
```

### 5.2 Novos IDs DOM (não colidem com existentes)

```
#op5-section          — container principal
#op5-upload-zone      — zona de upload
#op5-dataset-overview — cards de estatísticas
#op5-insights-panel   — lista de auto-insights
#op5-chat-container   — janela de chat
#op5-chat-input       — campo de texto
#op5-chart-container  — área de charts
```

### 5.3 AppState extensions

```js
// state.js — acrescentar ao AppState
op5: {
  dataset: null,          // registos carregados
  schema: null,           // { field, type, stats }[]
  datasetType: null,      // 'financial'|'hr'|'crm'|'logistics'|'unknown'
  insights: [],           // Insight[]
  chatHistory: [],        // { role, text, intent, result }[]
  activeChartData: null,  // dados do último chart
  llmEnabled: false,      // opt-in LLM
}
// + op5 limpo no reset()
```

### 5.4 Ficheiros a criar/modificar

| Ficheiro | Acção |
|---|---|
| `docs/js/modules/op5DataEngine.js` | Criar (Fase 1) |
| `docs/js/modules/op5Insights.js` | Criar (Fase 1) |
| `docs/js/modules/op5Planner.js` | Criar (Fase 2) |
| `docs/js/modules/op5Chat.js` | Criar (Fase 2) |
| `docs/js/modules/op5Charts.js` | Criar (Fase 3) |
| `docs/js/modules/op5Ui.js` | Criar (Fase 1, expandir) |
| `docs/js/modules/op5Store.js` | Criar (Fase 2) |
| `docs/js/app.js` | Adicionar import + init Op5 |
| `docs/js/state.js` | Adicionar `op5:{}` ao AppState |
| `docs/css/style.css` | Classes `.op5-*`, `.chat-*`, `.insight-*` |
| `docs/index.html` | Section `#op5-section` + mode card |
| `server.js` | Adicionar ECharts + simple-statistics ao CSP |

---

## 6. Decisões de Design

### 6.1 Sem LLM no MVP — e isso é uma vantagem

Um Data Engine determinístico para dados financeiros:
- **Nunca mente** sobre valores. O LLM alucina.
- **Resposta <50ms** vs 5–30s para inferência local.
- **Funciona offline** sem download de 2–8 GB.
- **Auditável**: cada resposta tem a operação que a gerou.

A IA do MVP não é "menos inteligente" — é mais adequada ao domínio.

### 6.2 Reutilização de componentes existentes

- Upload → re-usar `loaders.js` + `filestore.js` (já testados)
- Charts → ECharts para Op5 (mais potente); Chart.js mantém-se para Op2
- Anomalias → a lógica de duplicados de `duplicates.js` pode ser chamada directamente
- Exportação → `export.js` já suporta XLSX/PDF, extensível para Op5

### 6.3 Virtual table para datasets grandes

Para ficheiros SAP com 100k+ linhas, a tabela usa renderização virtual:
- Render apenas as linhas visíveis na viewport
- `IntersectionObserver` ou scroll event para cálculo de offset
- Máximo 50 linhas no DOM em qualquer momento

---

## 7. Backlog de Insights a Implementar (Fase 1–3)

| # | Insight | Método | Fase |
|---|---|---|---|
| I01 | % valores nulos por campo | count null / total | 1 |
| I02 | Nº registos duplicados (todos os campos) | hash comparison | 1 |
| I03 | Tipo de dataset inferido | keyword fingerprint | 1 |
| I04 | Campo de data detectado | guessFieldType() | 1 |
| I05 | Distribuição de campo numérico principal | histogram buckets | 1 |
| I06 | Top 3 valores de campo categórico e % do total | groupBy + sort | 1 |
| I07 | Outliers por z-score (> 2.5σ) | simple-statistics | 1 |
| I08 | Outliers por IQR (fora de 1.5× quartil) | Q1, Q3, IQR | 2 |
| I09 | Tendência temporal (slope de regressão linear) | simple-statistics | 3 |
| I10 | Crescimento médio mensal (% MoM) | groupBy mês | 3 |
| I11 | Concentração Pareto (top 20% = X% do valor) | cumulative sort | 3 |
| I12 | Correlação entre campos numéricos (Pearson > 0.7) | simple-statistics | 3 |
| I13 | Sazonalidade — meses consistentemente altos/baixos | groupBy mês multi-ano | 3 |
| I14 | Campos com entropia baixa (quase constantes) | unique count ratio | 2 |

---

## 8. Sequência de Implementação Recomendada

```
Fase 1 (MVP funcional):
  state.js        → adicionar op5 ao AppState
  op5DataEngine   → funções stats base
  op5Insights     → I01–I07
  op5Ui           → layout base + dataset overview + virtual table
  index.html      → #op5-section + mode card
  style.css       → classes .op5-*
  server.js       → CSP para ECharts + simple-statistics

Fase 2 (Chat):
  op5Planner      → intent recognition PT
  op5Chat         → state + response builder + sugestões
  op5Store        → IDB persist
  op5Ui           → chat panel + context display
  Insights I08, I14

Fase 3 (Charts + Insights avançados):
  op5Charts       → ECharts auto-select
  Insights I09–I13
  op5Ui           → chart embed no chat

Fase 4 (LLM, opt-in):
  op5Llm.js       → WebLLM loader + prompt engine
  op5Ui           → toggle LLM mode + download progress

Fase 5 (Enterprise):
  op5Compare.js   → multi-dataset join/diff
  export.js       → exportar chat + charts como PDF
```

---

## 9. Não Implementar (fora de scope desta arquitectura)

| Item | Razão |
|---|---|
| React / TypeScript / Vite | Requer bundler — nova app separada |
| shadcn/ui + TailwindCSS build | Requer build step |
| TanStack Table | Só funciona com React |
| Framer Motion | Só funciona com React/JSX |
| Zustand | Substituído por AppState (já existe) |
| Recharts | Substituído por ECharts (standalone) |
| danfo.js | Substituído por arquero ou pure JS |

Se o futuro da suite evoluir para uma reescrita completa (v3.0), React + Vite + TypeScript + shadcn seria o stack adequado. Para esta versão (v2.x), mantemos consistência com o que existe.
