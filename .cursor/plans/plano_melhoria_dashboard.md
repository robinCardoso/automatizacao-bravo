# Plano de Melhoria: Dashboard de Resultados 2.0

Este plano visa tornar o painel de resultados mais preciso, performático e interativo.

## 1. Precisão da Data de Atualização
Atualmente, o dashboard utiliza a data de modificação do arquivo (mtime) para exibir a "Última Atualização". Isso pode ser impreciso se o arquivo for movido ou salvo sem novos dados.

### [MODIFY] [DashboardService.ts](file:///c:/Users/Robson-PC/.antigravity/projetos/automatizador-bravo/app/core/consolidation/DashboardService.ts)
- Implementar lógica para identificar a coluna `DATA_PROCESSAMENTO_ORIGINAL`.
- Extrair o valor máximo desta coluna para definir a data real de processamento.

---

## 2. Atualização em Tempo Real (Real-Time Signals)
Faremos com que o dashboard saiba quando uma automação acabou de atualizar os dados mestres.

### [MODIFY] [automation-engine.ts](file:///c:/Users/Robson-PC/.antigravity/projetos/automatizador-bravo/app/automation/engine/automation-engine.ts)
- No método `triggerMasterConsolidation`, após o sucesso, disparar um evento IPC `master-consolidated`.

### [MODIFY] [dashboard.js](file:///c:/Users/Robson-PC/.antigravity/projetos/automatizador-bravo/app/renderer/modules/dashboard.js)
- Ouvir o evento `master-consolidated`.
- Exibir uma notificação discreta ou atualizar os gráficos automaticamente se o painel estiver aberto.

---

## 3. Unificação de Performance (SQLite para Pedidos)
Expandir o uso do SQLite para o dashboard de Pedidos, garantindo a mesma velocidade de filtragem das Vendas.

### [MODIFY] [DashboardService.ts](file:///c:/Users/Robson-PC/.antigravity/projetos/automatizador-bravo/app/core/consolidation/DashboardService.ts)
- Remover a restrição `if (tipo === 'VENDA' && !includeBase)` para permitir que Pedidos também usem o índice SQLite.

---

## 4. Interface de Correção de Dados (Data Cleaning)
Aproveitar o "Auto-Learning" para permitir que o usuário corrija dados não identificados.

### [NEW] Módulo de Correção na UI
- Criar uma nova aba ou modal "Correção de Catálogo".
- Listar referências de produtos que o sistema não conseguiu associar a uma marca ou grupo.
- Permitir que o usuário defina a marca/grupo manualmente, salvando no `CatalogService`.

---

## Questões em Aberto
> [!IMPORTANT]
> 1. **Data de Atualização:** Se um arquivo Master tiver dados de várias datas, você prefere ver "Última Sincronização em [Data]" ou "Dados abrangem até [Data Máxima]"?
> 2. **Auto-Refresh:** Se o dashboard estiver aberto durante uma automação, você prefere que ele atualize os gráficos sozinho (pode causar um leve "pulo" na tela) ou que ele mostre um botão "Dados novos disponíveis. Clique para atualizar"?
