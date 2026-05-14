---
name: system-improvement-agent
description: Mapeia e acelera melhorias no Automatizador Bravo com contexto técnico do sistema (Electron, automação Playwright, dashboard, workers, SQLite e release). Use quando o usuário pedir otimizações, correções, análise de gargalos, troubleshooting do app instalado ou evolução de arquitetura.
---

# System Improvement Agent

## Objetivo

Aplicar melhorias com baixo risco no `automatizador-bravo`, mantendo compatibilidade com fluxo atual de automação e dashboard.

## Contexto do Sistema (resumo prático)

- Stack principal:
  - Electron (`app/electron/main.ts`) com IPC para renderer.
  - Renderer modular (`app/renderer/modules/*.js`).
  - Core em TypeScript para consolidação, diff e dashboard (`app/core/**`).
  - Automação web via Playwright (`app/automation/**`).
- Fluxos pesados:
  - Dashboard: `get-dashboard-data` -> worker (`heavy-tasks.worker.ts`) -> `DashboardService`.
  - Consolidação: processamento de snapshots e geração de master.
- Persistência/otimização:
  - Índice SQLite para dashboard (`DashboardSqliteIndex`) quando aplicável.
  - Cache local no renderer para filtros instantâneos.
- Build/release:
  - `npm run build` para compilar TS e copiar renderer.
  - `npm run dist:full` para gerar instalador em `release/`.

## Regras de Trabalho para este projeto

1. Não alterar estrutura de planilha master (restrição de integração externa).
2. Priorizar responsividade da UI: evitar bloquear main thread.
3. Em operações pesadas, preferir worker/thread e processamento incremental.
4. Ao mexer em dashboard, preservar:
   - filtros por ano/mês/marca/cliente/grupo/subgrupo;
   - consistência de métricas e gráficos;
   - fallback seguro quando arquivo/master não existir.
5. Sempre validar com build e checagem de lint após mudanças relevantes.

## Playbook de Melhoria (passo a passo)

1. Identificar impacto
   - O problema está em renderer, IPC/main, worker, serviço core ou build instalado?
2. Classificar operação
   - `interativa`: deve responder em tempo real (preferir cache/local).
   - `estrutural`: pode recarregar base (refresh manual, troca de tipo, arquivo atualizado).
3. Aplicar otimização mínima eficaz
   - Reduzir chamadas IPC repetidas.
   - Evitar parse XLSX completo em toda interação.
   - Reusar resultados com chave de cache.
4. Validar paridade funcional
   - Mesmos números e gráficos com mesmos filtros.
   - Sem regressão em PEDIDO/VENDA.
5. Validar release
   - Confirmar comportamento em app instalado (não só `npm run dev`).

## Troubleshooting Rápido (produção)

- Erro `Cannot find module 'electron'` em worker:
  - Evitar import estático de `electron` em módulos usados fora do main process.
  - Usar `require('electron')` protegido por `try/catch` quando necessário.
- Dashboard “recarrega” a cada filtro:
  - Verificar se filtros estão chamando backend em vez de aplicar localmente.
  - Overlay deve aparecer apenas em carga-base/refresh.
- Diferença entre dev e instalado:
  - Gerar novo setup com `npm run dist:full`.
  - Validar no executável recém-instalado.

## Checklist de Entrega

- [ ] Mudança localizada e sem quebra de contrato existente
- [ ] `npm run build` sem erro
- [ ] Lints dos arquivos alterados sem erro novo
- [ ] Fluxo principal testado (dashboard e/ou automação)
- [ ] Se aplicável, validar no setup gerado (`release/`)

