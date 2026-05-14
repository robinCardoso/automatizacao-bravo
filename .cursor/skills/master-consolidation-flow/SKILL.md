# Skill: Master Consolidation Flow (Vendas & Pedidos)

Este documento detalha o processo de geração, atualização e deduplicação dos arquivos **MASTER** (Consolidados) no sistema.

## 1. Visão Geral
O sistema utiliza uma arquitetura de **Snapshots Incrementais**. Em vez de baixar o arquivo inteiro toda vez, o sistema baixa apenas o período necessário, gera um "Snapshot" e depois une todos os Snapshots em um único arquivo **MASTER**.

## 2. Componentes Principais
- **`Consolidator.ts`**: Motor principal responsável por ler os arquivos individuais e gerar o mestre.
- **`FileNamingPolicy.ts`**: Define o padrão de nomes (ex: `PEDIDO_CURRENT_2024-01_SP.xlsx`).
- **`automation-engine.ts`**: Dispara a consolidação ao final de cada execução de preset.

## 3. O Fluxo de Consolidação

### Passo 1: Coleta de Snapshots
O `Consolidator` busca arquivos `.xlsx` em dois locais:
1.  **Pasta Interna (`AppData/Snapshots`):** Onde ficam as cópias de segurança de cada site/período.
2.  **Pasta de Destino do Usuário:** Onde o Master será salvo. Ele vasculha subpastas (ex: `SP-Pedidos`) em busca de snapshots que possam ter sido movidos.

### Passo 2: Ordenação por Recência
Todos os snapshots encontrados são ordenados pelo **mtime** (data de modificação) do Windows.
- **Importante:** Isso garante que se houver dois arquivos para o mesmo período/UF, o sistema use o dado mais novo na deduplicação.

### Passo 3: Deduplicação e Imutabilidade de Datas
O sistema utiliza um "Deduper" para evitar registros repetidos e preservar o histórico:
-   **Chaves Primárias (PKs):** O sistema busca as PKs configuradas no Preset ou no `schemaMaps.json`.
-   **Memória por Registro (`ssp_data_processamento`):** Cada snapshot agora armazena internamente a data de processamento de cada linha. 
    -   Se um registro já existia no snapshot anterior, sua data original é preservada.
    -   Se for um registro novo, ele recebe o timestamp da execução atual.
-   **Otimização No-Op:** Se o `DiffEngine` detectar que os dados baixados são idênticos aos locais (mesmo conteúdo e assinaturas), o arquivo `.xlsx` **não é sobrescrito**. Isso preserva o `mtime` original do arquivo para fins de auditoria.
-   **Prioridade:** O registro lido do arquivo mais recente substitui qualquer registro antigo com a mesma chave, mas mantém sua data de criação original caso não tenha sofrido alteração de conteúdo.

### Passo 4: Enriquecimento de Metadados
Ao gerar o Master, o sistema injeta colunas extras para rastreabilidade, respeitando a imutabilidade:
- `PERIODO_ORIGINAL`: Mês/Ano de origem.
- `ORIGEM_UF`: Estado de origem.
- `ORIGEM_SITE`: Nome amigável do site configurado no preset.
- `DATA_PROCESSAMENTO_ORIGINAL`: Prioriza o valor individual da linha (`ssp_data_processamento`). Se ausente, usa a data do snapshot.
- `ORIGEM_SNAPSHOT`: Nome do arquivo físico original.

## 4. Tipos de Arquivos Gerados
Para cada tipo de relatório (Venda, Pedido, etc), são gerados dois arquivos mestres:
1.  **`CONSOLIDADO_[TIPO]_MASTER.xlsx`**: Contém todos os registros ativos e atuais.
2.  **`CONSOLIDADO_EXCLUIDOS_[TIPO]_MASTER.xlsx`**: Contém registros que foram detectados como "deletados" no portal durante a sincronização incremental.

## 5. Gatilhos de Atualização
- **Fim da Automação:** Sempre que um preset termina, o `triggerMasterConsolidation` é chamado.
- **Sinalização IPC:** Após salvar o arquivo, o sistema emite o evento `master-consolidated` para atualizar o Dashboard em tempo real.

---
**Regra para Desenvolvedores:** Qualquer alteração no processo de escrita de arquivos Excel deve respeitar a classe `ExcelUtils` para garantir que formatos de data e números sejam preservados corretamente entre Snapshots e Master.
