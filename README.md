# G-FinanceSuite — Plataforma de Análise Financeira

Aplicação web empresarial para análise, reconciliação e transformação de dados financeiros. Stack completo com React frontend, Node.js backend, PostgreSQL e processamento assíncrono via pg-boss.

---

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Frontend | React 19 + TypeScript + Zustand + TailwindCSS + Vite |
| Backend | Node.js + Express + TypeScript + JWT |
| Base de dados | PostgreSQL 16 + pg-boss (job queue) |
| IA Local | Ollama (LLM inference — opcional) |
| Infra | Docker Compose + Nginx reverse proxy |

---

## Operações Disponíveis

| # | Operação | Estado |
|---|----------|--------|
| 1 | **Duplicados** — Deteção de registos duplicados em múltiplos ficheiros | ✅ Implementado |
| 2 | **Conciliação** — Reconciliação de saldos por campo de agrupamento | ✅ Implementado |
| 3 | **SAP vs RW** — Conciliação de dados SAP com ficheiros Rentway | ✅ Implementado |
| 4 | **Transformar** — Conversão e combinação de ficheiros (CSV/JSON/XLSX) + RW Normalização | ✅ Implementado |
| 5 | **Rec. Fornecedores** — Reconciliação de partidas em aberto SAP vs RW com mapeamento | ✅ Implementado |
| 6 | **Analítica** — Insights automáticos e análise exploratória | ✅ Implementado |
| 7 | **IA** — Chat inteligente sobre os dados (Ollama local) | ✅ Implementado |
| 8 | **Biblioteca** — Sessões guardadas e resultados históricos | ✅ Implementado |

---

## Estrutura do Projeto

```
G-FinanceSuite/
├── frontend/                    # React + Vite SPA
│   ├── src/
│   │   ├── pages/               # 12 páginas (uma por funcionalidade)
│   │   ├── components/          # Logo, Header, FinanceBackground
│   │   ├── store/               # Zustand (auth + sessão + job)
│   │   ├── api/                 # Cliente HTTP com Bearer token
│   │   ├── hooks/               # useJobProgress (SSE)
│   │   └── types/               # Tipos TypeScript partilhados
│   └── package.json
│
├── backend/                     # Express API + workers
│   ├── src/
│   │   ├── routes/              # auth, sessions, users, upload, analyse, ai, events
│   │   ├── lib/                 # parser.ts, analysis.ts
│   │   ├── workers/             # parseFile, runAnalysis (pg-boss)
│   │   ├── db/                  # Pool PostgreSQL + migrações SQL
│   │   ├── middleware/          # JWT authenticate
│   │   └── types/               # Tipos TypeScript backend
│   └── package.json
│
├── docker-compose.yml           # 4 serviços: frontend, backend, db, ollama
├── nginx.conf                   # Reverse proxy + SSE passthrough
├── config/users.json            # Seed de utilizadores iniciais
└── deploy/                      # Scripts de deployment
```

---

## Arranque Rápido

### Docker (recomendado)

```bash
# 1. Copiar template de configuração
cp config/users.json.example config/users.json
cp .env.example .env

# 2. Editar .env com os secrets
#    POSTGRES_PASSWORD=<password-segura>
#    JWT_SECRET=<secret-forte>
#    ALLOWED_ORIGIN=http://localhost

# 3. Arrancar
docker compose up -d

# Aceder em http://localhost
# Login por omissão: admin / 123456 (alterar imediatamente)
```

### Desenvolvimento Local

```bash
# Backend
cd backend && npm install
npm run dev   # porta 3001

# Frontend
cd frontend && npm install
npm run dev   # porta 5173 (proxy para :3001)
```

---

## Segurança

- Autenticação JWT com expiração configurável por utilizador
- RBAC: perfis `admin` e `user` com funcionalidades restritas por utilizador
- Rate limiting no endpoint de login (10 req/min)
- Audit log de todas as operações
- Helmet + CORS configurados no backend
- Dados processados server-side — ficheiros nunca saem do servidor

---

## Testes

```bash
cd frontend
npm test          # vitest run (40 testes)
npm run test:ui   # interface visual Vitest UI
npm run test:watch # modo watch
```

Cobertura:
- Zustand store (auth, sessão, job)
- Cliente API (fetch mocks, headers, erros)
- Parser RW Normalização (deteção de cabeçalho, fornecedores, Atribuição)
- Componentes React (LoginPage, ModePage — render + interação)
- Hook useJobProgress (SSE — mount/unmount/erros)

---

## Fluxo de Uso Típico

1. Login → selecionar operação no painel inicial
2. Upload de ficheiro(s) → mapeamento de colunas
3. Configurar parâmetros da operação
4. Executar análise (processamento assíncrono com barra de progresso)
5. Explorar resultados em tabs
6. Exportar para XLSX

---

**Versão 3.0.0 · 2026-05-27**
