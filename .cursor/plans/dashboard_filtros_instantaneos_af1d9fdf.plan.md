---
name: Dashboard filtros instantaneos
overview: Reduzir o tempo de resposta dos filtros do dashboard movendo o refinamento para o frontend e evitando chamadas IPC a cada alteração.
todos:
  - id: map-filter-triggers
    content: Mapear e separar gatilhos que devem recarregar backend versus aplicar filtro local
    status: completed
  - id: frontend-local-state
    content: Implementar estado local em dashboard.js com cache base por tipo e filtros ativos
    status: completed
  - id: local-filter-engine
    content: Criar engine de filtragem/agregação no frontend para summary, charts e filtros dinâmicos
    status: completed
  - id: ux-overlay-adjust
    content: Ajustar overlay para aparecer apenas em cargas-base e não em filtro local
    status: completed
  - id: bench-verify
    content: Validar performance e paridade de dados entre caminho antigo e novo
    status: completed
isProject: false
---

# Plano: Filtros instantâneos no dashboard

## Diagnóstico atual

- Em `app/renderer/modules/dashboard.js`, o método `loadDashboard()` sempre chama `window.electronAPI.getDashboardData(...)` para qualquer alteração de filtro.
- Ano, mês, marca, cliente, grupo e subgrupo acionam `scheduleLoadDashboard()`, que apenas debounceia, mas ainda consulta backend.
- No backend (`app/electron/main.ts`), cada requisição cria worker novo em `get-dashboard-data`, então mesmo troca simples de filtro custa IPC + worker + query.

## Estratégia proposta

- Manter uma carga-base em memória no frontend por `reportType` (ex.: VENDA/PEDIDO) e aplicar filtros localmente sem nova IPC.
- Separar filtros em dois grupos:
  - `filtrosEstruturais`: mudam o conjunto-base (ex.: troca de tipo, refresh manual, arquivo alterado).
  - `filtrosInterativos`: ano/mês/marca/cliente/grupo/subgrupo aplicados localmente.
- Criar pipeline no frontend:
  1. `loadDashboardBase(reportType)` busca backend uma vez e guarda snapshot local.
  2. `applyLocalFilters()` recalcula summary/charts/filtros disponíveis a partir do snapshot.
  3. `renderFromLocalState()` atualiza UI sem overlay bloqueante.

## Alterações de código (alvo)

- `app/renderer/modules/dashboard.js`
  - Introduzir estado local: `_baseDataByType`, `_activeFilters`, `_lastLoadedMeta`.
  - Trocar handlers de filtros para chamar `applyLocalFilters()` em vez de `loadDashboard()`.
  - Preservar `loadDashboard()` apenas para:
    - entrada inicial da tela,
    - troca VENDA/PEDIDO,
    - clique no botão refresh.
  - Adicionar cache por chave de consulta para evitar recomputar agregações repetidas.
- `app/core/consolidation/DashboardService.ts`
  - Opcional fase 2: expor payload base (linhas normalizadas mínimas) para frontend quando solicitado, para cálculo local consistente.
  - Manter caminho atual como fallback para segurança.
- `app/renderer/index.html`
  - Ajustar UX do overlay para não bloquear a tela em filtros locais (apenas em carga-base).

## Rollout seguro

- Fase 1: cache local + filtros locais para VENDA (onde volume é maior).
- Fase 2: aplicar o mesmo fluxo para PEDIDO.
- Fase 3: otimizar memória (limite de itens, descarte LRU por tipo) e benchmark comparativo.

## Validação

- Medir tempo médio por troca de filtro (meta: < 120ms após carga-base).
- Confirmar que `get-dashboard-data` não é chamado ao trocar filtro local.
- Garantir paridade visual dos números/gráficos antes e depois (mesmos filtros).

