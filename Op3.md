
# Nova funcionalidade


# 1. Reconciliação Clientes Faturação

## Objetivo

Comparar documentos entre Rentway e SAP utilizando:
- Código de Client
- Código de cliente SAP (ficheiro Mapeamento de Clientes)
- Campo "Atribuição"

A validação deverá utilizar o campo "Atribuição"

## Regras de Negócio

### Fluxo
1. Ler ficheiro RW Faturação
2. Ler ficheiro SAP
3. Ler ficheiro de mapeamento de contas
4. Associar clientes RW aos clientes SAP
5. Comparar documentos pelo campo:
   - `Atribuição`

---

## Validações Necessárias

### 1.1 Faturas em RW que não existem em SAP
Validar documentos presentes em RW mas inexistentes em SAP.

### 1.2 Documentos em SAP que já não existem em RW
Validar documentos presentes em SAP mas inexistentes em RW.

### 1.3 Reconciliação de partidas
Executar reconciliação automática pelo campo:
- `Atribuição`

---

## Regras Importantes

- A validação ocorre sempre dentro da mesma conta de cliente.
- A fatura e o pagamento ocorrem na mesma conta.
- O campo principal de comparação é:
  - `Atribuição`

---

## Retorno Esperado no Portal

### Dashboard/Listagem 1
Lista de:
- Faturas em RW
- Não existentes em SAP

Campos:
- Cliente RW
- Cliente SAP
- Documento
- Atribuição
- Valor
- Data

---

### Dashboard/Listagem 2
Lista de:
- Documentos existentes em SAP
- Não existentes em RW

Campos:
- Cliente SAP
- Documento
- Atribuição
- Valor
- Data

---

### Dashboard/Listagem 3
Lista de reconciliações efetuadas automaticamente:
- Documento SAP
- Documento RW
- Atribuição
- Estado da reconciliação

---

# 2. Reconciliação Clientes RMKT

## Objetivo

Executar exatamente a mesma lógica da análise de Faturação, mas para clientes RMKT.

---

## Fluxo

1. Ler ficheiro RW RMKT
2. Ler ficheiro SAP
3. Ler ficheiro de mapeamento
4. Associar clientes RW → SAP
5. Comparar pelo campo:
   - `Atribuição`

---

## Validações Necessárias

### 2.1 Faturas em RW que não existem em SAP
Identificar documentos em RW inexistentes em SAP.

### 2.2 Documentos em SAP que já não existem em RW
Identificar documentos em SAP inexistentes em RW.

### 2.3 Reconciliação de partidas
Reconciliação automática pelo campo:
- `Atribuição`e "Cliente"

---

## Retorno Esperado no Portal

### Dashboard/Listagem 1
Lista de:
- Faturas e/ou pagamentos RW não existentes em SAP

---

### Dashboard/Listagem 2
Lista de:
- Documentos SAP não existentes em RW

---

### Dashboard/Listagem 3
Lista de:
- Reconciliações automáticas efetuadas

---

# 3. Análise de "Pagos Por"

## Objetivo

Validar situações onde:
- Existe uma fatura emitida num cliente
- Mas o pagamento foi efetuado por outro cliente

---

## Conceito de "Pagos Por"

Os "Pagos Por" são:
- Faturas já mapeadas
- Com cliente emissor
- E cliente pagador diferente

O ficheiro RW contém:
- Cliente original
- Cliente de compensação

---

## Regra Principal

Se um "Pago Por" ainda existir em SAP:
- Significa que o reconciliador automático falhou
- Porque estes documentos deveriam já estar reconciliados

---

## Fluxo

1. Ler ficheiro "Pagos Por"
2. Ler SAP
3. Ler ficheiro de mapeamento
4. Identificar:
   - Faturas emitidas num cliente
   - Pagamentos reconciliados noutro cliente

---

## Validações Necessárias

### 3.1 Pagos Por não reconciliados em SAP
Validar:
- Faturas presentes em SAP
- Que ainda não estão conciliadas
- Apesar de existir informação de compensação no RW

---

## Retorno Esperado no Portal

### Dashboard/Listagem
Lista de:
- Faturas "Pagos Por" não reconciliadas

Campos:
- Cliente original
- Cliente compensação
- Documento
- Atribuição
- Valor
- Estado SAP
- Data

---

# Funcionalidades da Aplicação

## Upload de Ficheiros
A aplicação deverá permitir upload de:
- Ficheiro SAP
- Ficheiro RW Faturação
- Ficheiro RW RMKT
- Ficheiro Pagos Por
- Ficheiro de mapeamento

Formatos:
- Excel (.xlsx)
- CSV

---

# Interface

## Dashboard Principal
Indicadores:
- Total documentos RW
- Total documentos SAP
- Divergências
- Reconciliações automáticas
- Pagos Por pendentes de reconciliar com pagamento em SAP

---

## Tabelas Avançadas
As tabelas devem permitir:
- Filtros
- Ordenação
- Pesquisa
- Exportação Excel
- Exportação CSV

---

# Motor de Reconciliação

## Regras Base

### Matching principal

Cliente SAP + Campo Atribuição


# Opção 3 — Reconciliação SAP vs Rentway (RW)

## Objetivo

Desenvolver uma funcionalidade no portal responsável pela reconciliação financeira entre o SAP e o Rentway (RW), permitindo validar se as contas correntes dos clientes estão alinhadas entre os dois sistemas.

O sistema deverá identificar automaticamente:
- diferenças de saldo;
- documentos em falta;
- pagamentos não reconciliados;
- movimentos migrados incorretamente;
- inconsistências entre SAP e RW.

O SAP deve refletir exatamente os movimentos existentes no RW, incluindo:
- faturas;
- pagamentos;
- compensações;
- reconciliações entre contas.

Sempre que forem identificadas divergências, deverão ser apresentados os documentos responsáveis pela diferença em ambos os sistemas.

---

# Estrutura da Reconciliação

## 1. Reconciliação “Pago Por”

### Descrição

Situações em que:
- a fatura foi emitida para um cliente;
- mas o pagamento foi efetuado por outro cliente/conta.

Existe sempre um pagamento associado.

### Regras de Reconciliação

- reconciliar entre contas diferentes;
- utilizar o campo `Atribuição` como chave principal;
- validar pela soma dos montantes.

### Validações

O sistema deverá:
- identificar documentos existentes no RW e não existentes no SAP;
- identificar documentos existentes no SAP e não existentes no RW;
- validar diferenças de valores;
- listar documentos sem correspondência;
- indicar os clientes envolvidos na compensação.

---

## 2. Clientes de Faturação

### Descrição

Clientes empresariais com faturação direta.

### Regras de Reconciliação

- reconciliar através do campo `Atribuição`;
- validar pela soma dos montantes associados.

### Validações

O sistema deverá identificar:
- clientes sem dívida no RW mas com saldo em aberto no SAP;
- diferenças de conta corrente;
- documentos não reconciliados;
- inconsistências de saldo entre sistemas.

---

## 3. Reconciliação RMKT

### Descrição

Casos em que:
- a fatura e o pagamento pertencem ao mesmo cliente/conta.

### Regras de Reconciliação

- reconciliar através do campo `Atribuição`.

### Validações

O sistema deverá validar:
- clientes sem dívida no RW mas com valores em aberto no SAP;
- diferenças entre documentos reconciliados;
- pagamentos não refletidos corretamente no SAP.

---

# Funcionalidades da Opção 3

A funcionalidade deverá permitir:

- upload dos ficheiros SAP e RW;
- execução automática da reconciliação;
- visualização das diferenças encontradas;
- pesquisa por:
  - cliente;
  - documento;
  - atribuição;
- exportação dos resultados;
- identificação clara do documento SAP e RW responsável pela divergência.

---

# Dashboard Resumo

O portal deverá apresentar um resumo com:
- total reconciliado;
- total divergente;
- clientes afetados;
- documentos em falta;
- diferenças de montante;
- movimentos não reconciliados.

---

# Resultado Final Esperado

O sistema deverá gerar uma listagem consolidada contendo:
- clientes divergentes;
- documentos em falta;
- diferenças de montante;
- movimentos não reconciliados;
- detalhe completo das divergências entre SAP e RW.

A reconciliação deverá permitir:
- auditoria rápida;
- validação da integridade da migração financeira;
- identificação imediata de inconsistências entre sistemas.

---

## Especificação de ficheiros (schemas e exemplos)

Para reduzir ambiguidade durante a implementação do módulo RW↔SAP, abaixo estão os schemas mínimos recomendados e exemplos de cada ficheiro. Formatos aceites: Excel (.xlsx/.xls) ou CSV.

1) RW — Faturação (Rentway)
- Cabeçalho recomendado (colunas):
   - Reserva (opcional)
   - Contrato (opcional)
   - Montante (obrigatório)         — numérico (ex.: 1500.00)
   - ContaCliente (obrigatório)     — ID/string cliente RW
   - InvoiceNumber (opcional)
   - Data (opcional)               — formato preferencial: YYYY-MM-DD
   - Atribuição (obrigatório)      — chave de matching (string)

Exemplo CSV:

Reserva,Contrato,Montante,ContaCliente,InvoiceNumber,Data,Atribuição
RES-001,CTR-123,1500.00,RW-CLI-001,INV-2026-001,2026-01-10,ATR-0001

2) RW — RMKT
- Mesmo esquema que RW-Faturação; aceitar as mesmas colunas para normalização.

3) Pagos Por (RW)
- Cabeçalho recomendado:
   - Documento (obrigatório)
   - Emissor (obrigatório)   — cliente emissor (RW)
   - Pagador (obrigatório)   — cliente que efetuou o pagamento
   - Montante (obrigatório)
   - Data (opcional)
   - Atribuição (obrigatório)

Exemplo CSV:

Documento,Emissor,Pagador,Montante,Data,Atribuição
INV-2026-001,RW-CLI-001,RW-CLI-999,1500.00,2026-01-12,ATR-0001

4) SAP — movimentos (export do SAP)
- Cabeçalho recomendado:
   - NumeroDocumento (obrigatório)
   - Data (opcional)
   - Texto (opcional)
   - Atribuicao (obrigatório)   — corresponde a `Atribuição` do RW
   - Montante (obrigatório)      — numérico (pode ser positivo/negativo)
   - ContaCliente (opcional)    — código cliente SAP

Exemplo CSV:

NumeroDocumento,Data,Texto,Atribuicao,Montante,ContaCliente
100000123,2026-01-10,Factura INV-2026-001,ATR-0001,1500.00,SAP-CLI-321

5) Ficheiro de Mapeamento (RW → SAP)
- Cabeçalho obrigatório:
   - rw_cliente (chave RW)
   - sap_cliente (chave SAP)

Exemplo CSV:

rw_cliente,sap_cliente
RW-CLI-001,SAP-CLI-321

6) JSON normalizado (interno)
- Após parsing, cada registo deverá ser normalizado para este formato mínimo:

{
   "documento": "INV-2026-001",
   "atribuicao": "ATR-0001",
   "montante": 1500.00,
   "data": "2026-01-10",
   "cliente_rw": "RW-CLI-001",
   "cliente_sap": "SAP-CLI-321",
   "ficheiro_origem": "rw_faturacao.xlsx"
}

Notas operacionais:
- Valores numéricos: preferir ponto decimal (`1500.00`). O parser trata vírgulas quando possível.
- Datas: preferir `YYYY-MM-DD`. O parser aceita `dd/mm/YYYY` e `dd.mm.YYYY`.
- Tolerância: configurar em euros (ex.: `tolerance = 1.00`) em `AppState.op3.settings` ou na UI.
- Casos de múltiplas ocorrências da mesma `Atribuição`: marcar para revisão manual quando o motor não conseguir reconciliar automaticamente.
