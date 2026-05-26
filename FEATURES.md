# FEATURES — G-FinanceSuite v3.0

Estado de implementação de todas as funcionalidades da plataforma.

**Legenda:** ✅ Implementado · 🔧 Parcial · 📋 Planeado · ❌ Não implementado

---

## Infraestrutura & Arquitectura

- [x] ✅ React 19 + TypeScript frontend (Vite)
- [x] ✅ Node.js + Express backend (TypeScript)
- [x] ✅ PostgreSQL 16 como base de dados
- [x] ✅ Processamento assíncrono via pg-boss (job queue)
- [x] ✅ Server-Sent Events (SSE) para progresso em tempo real
- [x] ✅ Docker Compose (4 serviços: frontend, backend, db, ollama)
- [x] ✅ Nginx reverse proxy com passthrough SSE
- [x] ✅ Scripts de deploy (`deploy/setup.sh`, `deploy/update.sh`)
- [x] ✅ Migrações SQL automáticas no arranque
- [ ] 📋 CI/CD pipeline (GitHub Actions)
- [ ] 📋 Testes E2E (Playwright)

---

## Autenticação & Controlo de Acesso

- [x] ✅ Login com username + password (bcrypt)
- [x] ✅ JWT com expiração configurável por utilizador (`session_hours`)
- [x] ✅ Persistência de sessão em `sessionStorage` (limpa ao fechar tab)
- [x] ✅ AuthGuard — redireciona para `/login` se token inválido/expirado
- [x] ✅ RBAC: perfis `admin` e `user`
- [x] ✅ Funcionalidades restritas por utilizador (`allowed_features[]`)
- [x] ✅ Rate limiting no login (10 req/min por IP)
- [x] ✅ Audit log de todas as operações (tabela `audit_log`)
- [x] ✅ Gestão de utilizadores (CRUD) — apenas admin

---

## Operação 1 — Duplicados

- [x] ✅ Upload de múltiplos ficheiros (CSV, XLSX, XLS, JSON)
- [x] ✅ Parsing assíncrono (worker pg-boss)
- [x] ✅ Mapeamento de colunas com auto-sugestão por aliases
- [x] ✅ Seleção de campos para agrupamento (chips interativos)
- [x] ✅ Campo opcional de soma
- [x] ✅ Deteção de grupos duplicados
- [x] ✅ Cards de resumo: Total / Únicos / Duplicados / Grupos
- [x] ✅ Filtros: texto, montante mín/máx, nº exato de duplicados
- [x] ✅ Ordenação por qualquer coluna
- [x] ✅ Paginação server-side
- [x] ✅ Exportação XLSX dos resultados
- [x] ✅ Expansão de grupos para ver registos individuais
- [ ] 📋 Exportação CSV/JSON/PDF dos resultados

---

## Operação 2 — Conciliação

- [x] ✅ Upload de múltiplos ficheiros
- [x] ✅ Configuração: campo de agrupamento + campo de valor + tolerância
- [x] ✅ Cálculo de saldos por grupo (débitos, créditos, saldo líquido)
- [x] ✅ Identificação de grupos reconciliados vs. por reconciliar
- [x] ✅ Cards de resumo: Total / Reconciliados / Por reconciliar / Tolerância
- [x] ✅ Dashboard com gráficos (Pie + Bar via Chart.js)
- [x] ✅ Filtro por saldo mínimo e máximo
- [x] ✅ Expansão de linhas para ver documentos do grupo
- [x] ✅ Paginação server-side
- [x] ✅ Exportação XLSX
- [ ] 📋 Exportação PDF com gráficos

---

## Operação 3 — SAP vs RW

- [x] ✅ Upload de 2–3 ficheiros (SAP, RW, e opcionalmente mapa de fornecedores)
- [x] ✅ Mapeamento de colunas por ficheiro
- [x] ✅ Extração de `docRef` e `lanc` da descrição RW via regex
- [x] ✅ Matching SAP ↔ RW por atribuição/referência/lançamento
- [x] ✅ 4 tabs de resultados: Conciliado / Só SAP / Só RW / Anomalias
- [x] ✅ Deteção de anomalias (diferenças de valor)
- [x] ✅ Exportação XLSX por tab
- [ ] 📋 Deteção de duplicados internos por ficheiro

---

## Operação 4 — Transformar

- [x] ✅ Tab "Converter": conversão individual de ficheiros (CSV/JSON/XLSX)
- [x] ✅ Tab "Mesclar": fusão de múltiplos ficheiros com mapeamento de campos
- [x] ✅ Deteção automática de campos compatíveis/divergentes
- [x] ✅ Mapeamento manual quando campos diferem entre ficheiros
- [x] ✅ Tab "RW Normalização": converte relatório hierárquico Rentway → tabela plana
  - [x] ✅ Deteção de linha de cabeçalho (co-presença "Data" + "Valor"/"Saldo")
  - [x] ✅ Extração de Código/Fornecedor de células adjacentes
  - [x] ✅ Atribuição: Lançamento se presente, senão referência "nº"
  - [x] ✅ Formatação de datas de serial Excel para pt-PT
  - [x] ✅ Output: Código | Fornecedor | Data | Data Vencimento | Descrição | Atribuição | Valor | Saldo
- [x] ✅ Exportação XLSX com larguras de coluna configuradas
- [ ] 📋 Preview dos dados antes de exportar
- [ ] 📋 Suporte a ficheiros maiores via streaming

---

## Operação 5 — Rec. Fornecedores

- [x] ✅ Upload de 3 ficheiros (SAP, Mapa de fornecedores, RW)
- [x] ✅ Mapeamento de colunas independente por ficheiro
- [x] ✅ Resolução de códigos de fornecedor via mapa
- [x] ✅ Matching SAP ↔ RW com prioridade Lançamento → Referência → Nº
- [x] ✅ 4 tabs: Conciliado / Só SAP / Só RW / Anomalias
- [x] ✅ Filtragem de colunas internas (`ficheiro_origem`, `_*`)
- [x] ✅ Exportação XLSX com todas as tabs
- [ ] 📋 Filtros por fornecedor/código dentro dos tabs

---

## Operação 6 — Analítica

- [x] ✅ Análise exploratória automática dos dados importados
- [x] ✅ Deteção de anomalias (valores atípicos)
- [x] ✅ Gráficos automáticos por tipo de campo
- [x] ✅ Estatísticas descritivas (média, mediana, desvio padrão)
- [ ] 📋 Exportação do relatório analítico
- [ ] 📋 Análise de tendências temporais

---

## Operação 7 — IA (Chat)

- [x] ✅ Integração com Ollama (LLM local)
- [x] ✅ Chat em linguagem natural sobre os dados da sessão
- [x] ✅ Contexto dos registos injetado no prompt
- [x] ✅ Historial de conversa na sessão
- [ ] 📋 Seleção de modelo Ollama
- [ ] 📋 Suporte a múltiplos modelos (OpenAI API compatível)

---

## Operação 8 — Biblioteca

- [x] ✅ Listagem de todas as sessões do utilizador
- [x] ✅ Retoma de sessão (reimporta ficheiros e resultados)
- [x] ✅ Eliminação de sessão
- [x] ✅ Eliminação de registos de uma sessão (sem eliminar sessão)
- [ ] 📋 Exportação de sessão completa
- [ ] 📋 Partilha de sessão entre utilizadores
- [ ] 📋 Pesquisa/filtro de sessões

---

## Importação de Ficheiros

- [x] ✅ CSV (com separador `;` ou `,`, auto-detecção)
- [x] ✅ XLSX / XLS (SheetJS)
- [x] ✅ JSON (arrays ou objetos com chave `registos`/`data`/`records`)
- [x] ✅ Drag & drop
- [x] ✅ Múltiplos ficheiros em simultâneo
- [x] ✅ Auto-sugestão de mapeamento por aliases (ex: `doc` → `numero_documento`)
- [x] ✅ Processamento assíncrono (pg-boss worker, equipa: 2)
- [ ] 📋 Suporte a ficheiros > 100 MB (streaming)
- [ ] 📋 Preview dos primeiros N registos antes de confirmar

---

## UX & Interface

- [x] ✅ Design responsivo (mobile + desktop)
- [x] ✅ Tailwind CSS com paleta consistente
- [x] ✅ Animação de fundo financeiro (canvas — tickers, CSV rows, candlesticks)
- [x] ✅ Logo animado X-Finance
- [x] ✅ Barra de progresso SSE em tempo real durante processamento
- [x] ✅ Paginação server-side em todas as tabelas de resultados
- [x] ✅ Estado vazio (empty states) em todas as páginas
- [x] ✅ Tratamento de erros com mensagens em português
- [x] ✅ Acessibilidade: `htmlFor`/`id` em formulários, `role="alert"` em erros
- [ ] 📋 Modo escuro (dark mode)
- [ ] 📋 Suporte a teclado nas tabelas (keyboard navigation)
- [ ] 📋 Virtualização de tabelas grandes (>10.000 linhas)

---

## Testes

- [x] ✅ Vitest configurado com jsdom
- [x] ✅ Testing Library (React + jest-dom + user-event)
- [x] ✅ Testes do store Zustand (auth, sessão, job)
- [x] ✅ Testes do cliente API (fetch mocks, headers, erros HTTP)
- [x] ✅ Testes do parser RW Normalização (6 cenários)
- [x] ✅ Testes do componente LoginPage (render, erro, login com sucesso)
- [x] ✅ Testes do componente ModePage (greeting, RBAC, biblioteca)
- [x] ✅ Testes do hook useJobProgress (SSE, mount/unmount, erros)
- [ ] 📋 Testes dos restantes componentes (DuplicadosPage, ConciliacaoPage, etc.)
- [ ] 📋 Testes de integração backend (supertest)
- [ ] 📋 Testes E2E com Playwright

---

## Backend & API

- [x] ✅ 7 grupos de rotas REST (auth, sessions, users, upload, analyse, ai, events)
- [x] ✅ Autenticação JWT em todas as rotas (excepto login)
- [x] ✅ Validação de input com Zod
- [x] ✅ Job queue pg-boss (parse-file: 2 workers, run-analysis: 4 workers)
- [x] ✅ Motor de análise: duplicados, conciliação, SAP/RW, rec-fornecedores
- [x] ✅ Seed automático de utilizadores no arranque
- [x] ✅ Helmet + CORS + rate limiting
- [ ] 📋 Refresh tokens
- [ ] 📋 WebSockets para múltiplos jobs em paralelo
- [ ] 📋 API paginada para datasets > 1M registos

---

*Última actualização: 2026-05-27*
