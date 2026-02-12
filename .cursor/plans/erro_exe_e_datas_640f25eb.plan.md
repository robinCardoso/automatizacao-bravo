---
name: Erro exe e datas
overview: Corrigir o erro "Cannot access 'fs' before initialization" no executável empacotado e verificar/normalizar a geração de datas (TRIM_ATUAL) para evitar que vendas de FEV sejam incorretamente tratadas como removidas na auditoria.
todos: []
isProject: false
---

# Plano: Erro do .exe e verificação de datas

## 1. Erro "Cannot access 'fs' before initialization" no processo principal

**Causa provável:** No app empacotado (`release/win-unpacked`), a ordem de carregamento dos módulos pode fazer com que o [logger](app/config/logger.ts) seja avaliado antes do `fs` estar disponível no escopo de algum módulo que o utiliza. O logger executa código no top-level (linhas 8–11) que usa `fs` e `AppPaths.getLogsPath()` logo ao ser carregado. Se houver dependência circular ou ordem de require diferente no bundle/asar, pode ocorrer TDZ (temporal dead zone) para `fs`.

**Arquivos envolvidos:**

- [app/config/logger.ts](app/config/logger.ts) – usa `fs` no top-level para criar a pasta de logs.
- [app/electron/main.ts](app/electron/main.ts) – ponto de entrada; importa `logger` junto com outros módulos.

**Ações recomendadas:**

- **Opção A (recomendada):** Remover a inicialização síncrona da pasta de logs do top-level do logger. Criar a pasta de logs de forma **lazy** (na primeira escrita) ou em um `setImmediate`/callback após o módulo carregar, para que nenhum código use `fs` antes de todos os imports do processo principal estarem resolvidos.
- **Opção B:** Em [main.ts](app/electron/main.ts), garantir que `fs` (e `path`) sejam os primeiros requires e que o `logger` só seja importado/used **depois** de `app.whenReady()` ou após qualquer outro módulo que dependa de `fs` estar inicializado (ex.: mover `setupTray()` para depois de ready e garantir que nenhum import de main chame o logger no top-level antes disso).
- **Opção C:** Verificar se [AppPaths](app/core/utils/AppPaths.ts) ou outro módulo importado pelo logger usa `fs` de forma que, no empacotado, o Node carregue um módulo que ainda não inicializou `fs` no escopo onde ele é referenciado; se for o caso, quebrar a dependência (ex.: lazy init em AppPaths para `ensureDirectories()`).

Implementar **Opção A** (lazy init da pasta de logs no logger) é a mudança mais local e segura: no logger, em vez de criar a pasta no top-level, criar na primeira vez que um transport de arquivo for usado ou em um `getLogsDir()` que cria a pasta na primeira chamada.

---

## 2. Verificação das datas e das 418 linhas removidas (FEV)

**Comportamento atual:**

- O token `[TRIM_ATUAL]` é resolvido em [step-executor.ts](app/automation/engine/step-executor.ts) em `resolveDateTokens()` (linhas 314–318). Para fevereiro (mês 1): trimestre atual = jan–mar; `currentTriStartMonth = 0`, `currentTriEndMonth = 3`, então as datas geradas são **01/01/YYYY** e **31/03/YYYY**. Ou seja, a **matemática do trimestre está correta** e inclui fevereiro.
- O step `fillDateRange` com `"selector": "#dataIni,#dataFim"` e `"value": "[TRIM_ATUAL]"` preenche `#dataIni` com a data inicial e `#dataFim` com a data final (linhas 243–256 do step-executor). Não há bug óbvio na divisão dos seletores.

**Por que a auditoria pode mostrar -418 (todas as vendas de FEV)?**

- O [DiffEngine](app/core/diff/DiffEngine.ts) compara o arquivo **CURRENT** (snapshot anterior) com o **novo download**. As “removals” são linhas que existiam no CURRENT e não existem no novo arquivo.
- Cenários plausíveis:
  1. **Snapshot anterior de outro período:** O CURRENT antigo era de outro período (ex.: outro trimestre ou período que incluía mais dados). Ao rodar de novo com TRIM_ATUAL (1º tri), o novo arquivo tem só o 1º tri; as 418 linhas que eram de FEV (ou de outro período) no arquivo antigo deixam de existir no novo → aparecem como “removidas”. Nesse caso o diff está correto; a “perda” é por troca de período.
  2. **Formato de data no formulário:** Se o ERP espera datas com zeros à esquerda (ex.: `01/01/2026`) e `toLocaleDateString('pt-BR')` em algum ambiente retorna `1/1/2026`, o filtro do ERP poderia interpretar mal e não retornar fevereiro. Vale normalizar para **DD/MM/YYYY** com zeros.
  3. **Bug ou regra no ERP:** O relatório do sistema externo pode estar excluindo FEV por configuração ou bug; isso só pode ser validado no próprio ERP.

**Ações recomendadas:**

- **Normalizar formato de data:** Em [step-executor.ts](app/automation/engine/step-executor.ts), garantir que `formatDate` (ou o valor passado ao formulário) produza sempre **DD/MM/YYYY** com dois dígitos (ex.: `padStart(2,'0')` para dia e mês). Isso evita que o ERP interprete mal o período.
- **Log explícito das datas enviadas:** No `executeFillDateRange`, logar em nível INFO as datas efetivamente preenchidas em `#dataIni` e `#dataFim` (já existe um debug com “Preenchendo data inicial/final”; garantir que fique visível em produção ou repetir em INFO para rastreio).
- **Documentar/validar período no diff:** Se o SnapshotGate já bloqueia uso de CURRENT de outro período, as -418 só podem ser “corretas” (mudança de período) ou “erro do ERP/formato”. Incluir no relatório de auditoria (ou em log) o `identity.period` do CURRENT e do novo run, para confirmar que são o mesmo período quando as remoções forem analisadas.

Resumo das alterações sugeridas para datas:

- Normalizar datas para DD/MM/YYYY com zeros em [step-executor.ts](app/automation/engine/step-executor.ts) (função de formatação usada por `resolveDateTokens` e pelo preenchimento).
- Reforçar log das datas enviadas ao formulário (dataIni/dataFim) para facilitar diagnóstico.
- Opcional: no DiffEngine ou no relatório de auditoria, deixar explícito o período do snapshot anterior e do novo para comparação.

---

## Ordem sugerida de implementação

1. **Primeiro:** Corrigir o erro do `fs` no processo principal (logger lazy init ou ordem de carregamento), testar o `.exe` em `release/win-unpacked` até o app abrir sem “Cannot access 'fs' before initialization”.
2. **Depois:** Ajustar formatação de datas e logs no step-executor; rodar um fluxo com TRIM_ATUAL e conferir nos logs as datas enviadas e, na auditoria, se o período do CURRENT e do novo run batem e se as -418 são esperadas ou indicam problema no ERP/formato.

