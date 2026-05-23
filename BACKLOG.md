# Backlog — G-FinanceSuite

Ideias e funcionalidades para versões futuras. Ordenado por impacto estimado.
Editar livremente — este ficheiro não tem efeito no código.

---

## Alta prioridade

### Op1 — Exportar seleção de grupos
Permitir ao utilizador selecionar checkboxes em grupos de duplicados específicos e exportar apenas esses grupos.
- UI: checkbox por linha de grupo na dup-list
- Estado: `AppState.selectedGroups: Set<string>` (keys dos grupos selecionados)
- Exportação: filtrar `dupGroups` pelos selecionados

### Op2 — Filtro por campo de data
Adicionar inputs de data (mín/máx) nos filtros de reconciliação para restringir análise a um período.
- Campo: detetar automaticamente o campo de data disponível (guessFieldType já faz isto)
- Integrar no `applyReconFilters` existente

### Comparação de dois datasets (Op3)
Carregar dois ficheiros separados e identificar registos presentes num mas não no outro.
- Novo card "Op3" na toolbar
- Novo módulo `modules/comparison.js`
- Útil para auditorias: "o que está no sistema A mas não no sistema B?"

---

## Média prioridade

### Persistência de sessão (localStorage)
Guardar `AppState.rawData` em localStorage ao fazer análise. Ao reabrir o browser, oferecer restaurar a sessão anterior.
- Limite: só guardar se `rawData.length < 50000` (evitar OOM)
- UI: banner no topo da import-section se sessão disponível

### Modo escuro
Toggle dark/light mode. Preferência guardada em localStorage.
- CSS: variáveis CSS já usadas em style.css — basta sobrepor no `:root[data-theme=dark]`
- UI: ícone de lua/sol no canto superior

### Op1 — Agrupamento multi-nível
Permitir definir grupos primários e secundários para análise de duplicados hierárquica.
Exemplo: agrupar por `atribuicao` → dentro de cada grupo, identificar `numero_documento` duplicado.

### Op2 — Exportar por grupo selecionado
Semelhante ao Op1 — selecionar grupos de reconciliação específicos para exportar.

---

## Baixa prioridade / Ideias

### Análise de antiguidade (Aging)
Para cada grupo de reconciliação, calcular quantos dias têm os documentos por liquidar.
Requer campo de data. Output: tabela aging 0-30, 31-60, 61-90, >90 dias.

### Gráfico de barras por campo personalizado
No dashboard Op2, permitir escolher o eixo X do bar chart (atualmente é sempre o campo de grupo).

### Preview de dados antes de analisar
Após importar, mostrar uma pré-visualização dos primeiros 10 registos para confirmar o mapeamento antes de executar.

### Importação por URL (fetch)
Campo de URL para importar um JSON de um endpoint interno. Útil para integrações com ERPs.
Requer CORS — só viável se o servidor origem permitir.

### Atalhos de teclado
- `R` → executar análise
- `E` → abrir modal de exportação
- `1` / `2` → trocar entre Op1 e Op2
- `Esc` → fechar modal aberto

---

## Decisões técnicas a tomar antes de crescer muito

- **Split de import.js**: está em ~773 linhas. Se receber mais uma funcionalidade grande (ex: importação por URL, preview de dados), deve ser partido em `import-queue.js` + `import-loaders.js` + `import-mapping.js`.
- **CSS inline vs stylesheet**: Os botões dinâmicos em reconciliation.js têm estilos inline. Se o número de componentes dinâmicos crescer, considerar mover para classes em style.css com `data-*` selectors.
- **Testes unitários**: `duplicates.js` e `reconciliation.js` têm lógica pura que seria fácil de testar com Node.js + assert. Prioritário antes de adicionar Op3.
