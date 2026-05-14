---
name: gargalos vendas 150k
overview: Identificar e mitigar os gargalos de performance da automação de VENDAS (arquivo master com ~150k linhas), priorizando redução de travamentos da UI e queda de consumo de memória/CPU no Electron.
todos:
  - id: baseline-metrics
    content: Mapear baseline atual (tempo e memória) para VENDAS 150k em dashboard, diff e consolidação.
    status: completed
  - id: replace-sync-io
    content: Trocar chamadas fs síncronas por assíncronas nos módulos main, consolidator e session-manager.
    status: completed
  - id: dashboard-throttle
    content: Adicionar debounce/cancelamento no carregamento de dashboard para evitar IPC concorrente.
    status: completed
  - id: batch-consolidation
    content: Mudar estratégia de consolidação incremental para fim de lote ou frequência configurável.
    status: completed
  - id: worker-offload
    content: Criar worker para processamento pesado de dashboard/consolidação e integrar IPC assíncrono com progresso.
    status: completed
  - id: chunked-pipeline
    content: Implementar processamento em chunks e deduplicação incremental para reduzir pico de memória.
    status: completed
  - id: perf-verify
    content: Executar benchmark comparativo pós-melhorias e validar critérios de sucesso.
    status: completed
isProject: false
---

# Plano de otimização VENDAS (150k linhas)

## Diagnóstico consolidado

- As imagens mostram instância do `Automatizador Bravo` com **~1 GB de RAM** e processo com estado **"Não responde"**, consistente com bloqueio do thread principal.
- O fluxo atual processa XLSX grande diretamente no processo Electron main e usa várias operações síncronas/estruturas intermediárias grandes.

## Gargalos prováveis (prioridade)

- **P1 - Trabalho pesado no processo principal (UI travando):** handlers IPC em `[C:/Users/Robson-PC/.antigravity/projetos/automatizador-bravo/app/electron/main.ts](C:/Users/Robson-PC/.antigravity/projetos/automatizador-bravo/app/electron/main.ts)` executam dashboard/consolidação que fazem parse e agregação intensivos.
- **P1 - Leitura e materialização total de XLSX em memória:** `[C:/Users/Robson-PC/.antigravity/projetos/automatizador-bravo/app/core/consolidation/DashboardService.ts](C:/Users/Robson-PC/.antigravity/projetos/automatizador-bravo/app/core/consolidation/DashboardService.ts)`, `[C:/Users/Robson-PC/.antigravity/projetos/automatizador-bravo/app/core/consolidation/Consolidator.ts](C:/Users/Robson-PC/.antigravity/projetos/automatizador-bravo/app/core/consolidation/Consolidator.ts)`, `[C:/Users/Robson-PC/.antigravity/projetos/automatizador-bravo/app/core/diff/DiffEngine.ts](C:/Users/Robson-PC/.antigravity/projetos/automatizador-bravo/app/core/diff/DiffEngine.ts)`.
- **P1 - I/O síncrono no caminho crítico:** `readdirSync/statSync/existsSync/rmSync` em `[C:/Users/Robson-PC/.antigravity/projetos/automatizador-bravo/app/core/consolidation/Consolidator.ts](C:/Users/Robson-PC/.antigravity/projetos/automatizador-bravo/app/core/consolidation/Consolidator.ts)`, `[C:/Users/Robson-PC/.antigravity/projetos/automatizador-bravo/app/automation/sessions/session-manager.ts](C:/Users/Robson-PC/.antigravity/projetos/automatizador-bravo/app/automation/sessions/session-manager.ts)`, `[C:/Users/Robson-PC/.antigravity/projetos/automatizador-bravo/app/electron/main.ts](C:/Users/Robson-PC/.antigravity/projetos/automatizador-bravo/app/electron/main.ts)`.
- **P2 - Custos de CPU por linha (assinatura/regex/normalização):** deduplicação e parsing repetitivos em loops longos.
- **P3 - Estratégia de execução:** consolidação incremental após cada site em `[C:/Users/Robson-PC/.antigravity/projetos/automatizador-bravo/app/automation/engine/automation-engine.ts](C:/Users/Robson-PC/.antigravity/projetos/automatizador-bravo/app/automation/engine/automation-engine.ts)` amplia tempo total.

## Estratégia técnica (em fases)

### Fase 1 - Quick wins (baixo risco, alto impacto)

- Migrar operações `fs.*Sync` para `fs.promises.`* nos pontos críticos do main/consolidação/sessões.
- Debounce e cancelamento de chamadas do dashboard no renderer para evitar IPC concorrente.
- Reduzir verbosidade de logs em produção (`debug` -> `info/warn`) para diminuir I/O.
- Alterar gatilho de consolidação: executar no fim do lote (ou a cada N sites), não após todo site.

### Fase 2 - Evitar travamento da UI

- Tirar parse/agregação pesada do processo main e mover para worker (`worker_threads` ou processo filho).
- IPC passa a iniciar job assíncrono e receber progresso/resultado por evento/polling, sem bloquear `ipcMain.handle` por longos períodos.

### Fase 3 - Escalabilidade para 150k+

- Reescrever pipeline para processamento em chunks (5k-10k linhas) com deduplicação incremental.
- Reduzir arrays intermediários (evitar `map` + `flat` gigantes; processar por lote e descartar memória).
- Otimizar assinatura/deduplicação: pré-resolver colunas/chaves uma vez por execução e minimizar `trim/stringify` repetido.

### Fase 4 - Medição e validação

- Instrumentar métricas por etapa (`read`, `preprocess`, `diff`, `consolidate`, `dashboard`) com tempo e pico de memória.
- Definir orçamento de performance para VENDAS 150k: tempo máximo por etapa e teto de memória.

## Fluxo-alvo (alto nível)

```mermaid
flowchart LR
rendererUI[RendererUI] -->|"requestJob"| mainIPC[MainIPC]
mainIPC --> workerJob[WorkerJob]
workerJob --> chunkReader[ChunkReader]
chunkReader --> dedupeEngine[DedupeEngine]
dedupeEngine --> aggregateStore[AggregateStore]
aggregateStore --> resultWriter[ResultWriter]
workerJob -->|"progress/result"| mainIPC
mainIPC --> rendererUI
```



## Critérios de sucesso

- Automação de VENDAS com 150k linhas sem status "Não responde".
- Queda perceptível de RAM do processo principal (meta inicial: < 600-700 MB durante pico).
- Redução do tempo total da rotina de consolidação/dashboard.
- Responsividade da UI preservada durante processamento pesado.

