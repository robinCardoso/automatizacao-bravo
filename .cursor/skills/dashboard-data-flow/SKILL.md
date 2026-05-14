# Skill: Dashboard Data Flow & Results Update

Este documento detalha como funciona a atualização e o processamento dos dados do "Painel de Resultados" no Automatizador Bravo.

## 1. Arquitetura de Fluxo de Dados

O fluxo de dados do dashboard segue um modelo assíncrono para garantir que a interface permaneça responsiva mesmo ao processar arquivos Excel pesados (Master Files).

### Sequência de Chamada:
1.  **UI (Renderer):** O módulo `dashboard.js` solicita dados via IPC `get-dashboard-data`.
2.  **Main Process:** O `main.ts` recebe a requisição e dispara um **Node.js Worker** (`heavy-tasks.worker.ts`).
3.  **Worker:** Executa a lógica pesada no `DashboardService`.
4.  **Consolidação:** Os dados são lidos dos arquivos Excel consolidados pelo `Consolidator` após as automações.

## 2. Processamento e Enriquecimento (`DashboardService`)

O `DashboardService` é o coração do painel. Ele realiza as seguintes operações:

### A. Mapeamento de Colunas (Mapping)
O sistema não depende de nomes fixos de colunas. Ele usa o `dashboardMapping` definido no **Preset** ou no **Schema Global** para identificar:
-   `value`: Valor monetário.
-   `date`: Data da transação.
-   `group`: Grupo de produtos.
-   `category`: Categoria dinâmica.

### B. Enriquecimento e Precisão de Dados
O sistema prioriza a fidelidade dos dados em relação ao arquivo físico:
-   **Data de Atualização Real:** O `DashboardService` e o `DashboardSqliteIndex` escaneiam a coluna `DATA_PROCESSAMENTO_ORIGINAL` no Master Excel. O valor máximo encontrado define o campo `lastUpdate` no dashboard. Se a coluna não existir, o sistema usa a data de modificação do arquivo (`mtime`).
-   **VENDAS (Auto-Learning):** Sempre que uma planilha de Vendas é processada, o sistema "aprende" novas referências de produtos e as salva no `CatalogService`.
-   **PEDIDOS (Enrichment):** Busca no catálogo a **Marca** e o **Grupo** baseando-se na referência do produto, injetando esses dados virtualmente.

### C. Otimização de Performance
-   **Cache em Memória:** Armazena os dados brutos de até 2 arquivos Master.
-   **SQLite Indexing (Global):** Tanto `VENDA` quanto `PEDIDO` utilizam o `DashboardSqliteIndex`. Isso permite agregações instantâneas via SQL, mesmo em arquivos com dezenas de milhares de linhas.

## 3. Lógica de Atualização (Trigger)

A atualização do painel ocorre em três momentos principais:
1.  **Manual:** Quando o usuário clica no botão de atualizar ou altera um filtro no painel.
2.  **Pós-Automação (Background):** O `AutomationEngine` dispara a consolidação master incremental.
3.  **Sinalização em Tempo Real:** Após a consolidação bem-sucedida, o `AutomationEngine` emite um sinal IPC `master-consolidated`. O módulo `dashboard.js` ouve este sinal e exibe um banner visual de atualização se o usuário estiver com o painel aberto.

## 4. Regras para Desenvolvedores (Skills)

Ao dar manutenção no dashboard, observe:
-   **Nunca bloqueie a Main Thread:** Operações de leitura de Excel devem sempre ocorrer no Worker.
-   **Respeite o Mapeamento:** Use as chaves resolvidas (ex: `resolvedMapping.value`) em vez de strings fixas como `"Valor Total"`.
-   **Tratamento de Números:** Use o `ExcelUtils.toNumber` para lidar com a confusão brasileira de pontos e vírgulas em decimais.
-   **Tendência (Growth):** O cálculo de crescimento compara o período selecionado com o imediatamente anterior (mês vs mês ou ano vs ano).
