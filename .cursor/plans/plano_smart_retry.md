# Plano de Implementação: Sistema de Re-tentativa Inteligente (Smart Retry)

Este documento detalha a estratégia para implementar a recuperação automática de falhas no motor de automação do Bravo. O objetivo é aumentar a taxa de sucesso das execuções 24/7, tratando instabilidades de rede e portais governamentais de forma autônoma.

## 1. Visão Geral da Arquitetura

O sistema deixará de ser uma execução linear única e passará a operar em **Fases de Execução**:

1.  **Fase Principal (Main Pass):** Execução normal de todos os sites.
2.  **Fase de Cooldown:** Intervalo de espera para estabilização de serviços externos.
3.  **Fase de Recuperação (Retry Pass):** Re-execução apenas dos sites que falharam por motivos técnicos.

---

## 2. Identificação e Classificação de Erros

Para evitar re-tentativas inúteis (como em casos de senha errada), criaremos um módulo de classificação de falhas.

### Categorias de Falha:
| Categoria | Identificação (Heurística) | Retry? |
| :--- | :--- | :--- |
| **NETWORK_ERROR** | Erros de DNS, conexão recusada, gateway timeout. | **SIM** |
| **PAGE_LOAD_ERROR** | Página em branco (DOM vazio) ou Timeout de navegação. | **SIM** |
| **UI_SELECTOR_MISSING** | Seletor não encontrado após login bem-sucedido. | **SIM** (1 vez) |
| **AUTH_INVALID** | Mensagem de "usuário/senha incorretos". | **NÃO** |
| **CAPTCHA_DETECTED** | Bloqueio por desafio visual/humano. | **NÃO** |
| **CRITICAL_SYSTEM** | Erro interno do motor (vazamento de memória/crash). | **NÃO** |

---

## 3. Detalhamento Técnico das Mudanças

### 3.1. Novo Módulo: `ErrorClassifier`
Criar `app/automation/engine/error-classifier.ts` para analisar o objeto `Error` do Playwright e o estado atual da `Page`.

### 3.2. Atualização no `AutomationResult`
Incluir campos para rastrear a tentativa:
```typescript
interface AutomationResult {
  // ... campos existentes
  failureCategory?: 'NETWORK' | 'TIMEOUT' | 'UI' | 'AUTH' | 'UNKNOWN';
  retryAttempt: number; // 0 para primeira execução
}
```

### 3.3. Reestruturação do `AutomationEngine.runAutomation`
O loop principal será envolvido por um controlador de tentativas:

```typescript
async runAutomation(options) {
  let sitesToProcess = initialList;
  let allResults = [];
  let currentAttempt = 0;
  const MAX_RETRIES = 1;

  while (sitesToProcess.length > 0 && currentAttempt <= MAX_RETRIES) {
    if (currentAttempt > 0) {
      await this.wait(delayConfig); // Cooldown entre fases
    }

    const results = await this.executeBatch(sitesToProcess);
    allResults.push(...results);

    // Filtra apenas o que falhou e é "re-tentável"
    sitesToProcess = results
      .filter(r => !r.success && this.isRetryable(r.failureCategory))
      .map(r => getSiteConfig(r.siteId));

    currentAttempt++;
  }
  return consolidateBestResults(allResults);
}
```

---

## 4. Configurações Necessárias

Adicionar ao `AppConfig` (via `config-manager.ts`):
*   `enableSmartRetry`: boolean (Default: true)
*   `maxRetryPasses`: number (Default: 1)
*   `retryDelayMinutes`: number (Default: 5 - Ideal para esperar portais voltarem ao ar)

---

## 5. Plano de Verificação

### Testes Automatizados
- Simular falha de rede (bloqueando URL via Playwright) e verificar se o motor dispara a segunda fase.
- Simular erro de senha e verificar se o motor **ignora** o site na segunda fase.

### Manual / Logs
- Validar no `automationLogger` se as mensagens de "Iniciando Fase de Recuperação" estão claras e identificando os sites corretos.

---

## 6. Open Questions (Dúvidas para o Usuário)

> [!IMPORTANT]
> 1. **Notificações:** Você prefere receber um e-mail a cada tentativa ou apenas um resumo final consolidado após todas as fases de retry?
> 2. **Consolidação Master:** Devemos atualizar o Excel Master a cada site que termina (mesmo na primeira fase) ou apenas ao final de tudo? (Atualmente o sistema já consolida incrementalmente).
