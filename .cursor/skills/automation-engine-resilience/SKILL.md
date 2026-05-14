---
name: automation-engine-resilience
description: Documentação técnica sobre a arquitetura resiliente do motor de automação (loop de sites, tratamento de erros por filial e continuidade de fluxo). Use ao realizar melhorias no AutomationEngine ou depurar falhas de execução.
---

# Automation Engine Resilience

## Princípio Fundamental
O motor de automação do Bravo foi projetado para ser **tolerante a falhas parciais**. O sucesso ou falha de uma filial (site/UF) não deve afetar a execução das demais na mesma rodada.

## Arquitetura de Execução (Passo a Passo)

1.  **Loop Independente:** O processamento ocorre em um loop `for` iterando sobre `sitesToRun`.
2.  **Isolamento de Erro (Try/Catch):** Cada iteração é envolvida em um bloco `try/catch`. 
    - Se uma filial falhar (Timeout, erro de login, seletor não encontrado), a exceção é capturada.
    - O sistema registra o erro no `automationLogger`.
    - Uma captura de tela (screenshot) do erro é tentada.
3.  **Continuidade Garantida:** Após o `catch`, o loop prossegue para a próxima filial (`index++`).
4.  **Fechamento de Sessão:** O bloco `finally` dentro do loop garante que a sessão do Playwright seja fechada (`sessionManager.closeSession`) mesmo em caso de erro crítico, liberando recursos.
5.  **Consolidação Final:** A atualização dos arquivos mestre (`CONSOLIDADO_MASTER.xlsx`) ocorre após o término do loop, processando todos os resultados acumulados (sucessos e falhas).

## Diretrizes para Desenvolvedores/Agentes

- **NUNCA** remova o `try/catch` de dentro do loop principal em `AutomationEngine.runAutomation`.
- **Tratamento de Avisos:** Arquivos vazios ou períodos sem dados devem ser tratados como `AUTOMATION-WARN`, permitindo que o fluxo de passos do site termine sem lançar exceção.
- **Memória:** Após cada consolidação pesada, o `global.gc()` deve ser chamado se disponível para evitar vazamento de memória em execuções longas (24/7).
- **Notificações:** O resumo final enviado por e-mail deve incluir tanto as filiais que tiveram sucesso quanto as que falharam, para auditoria rápida do usuário.

## Localização de Código Chave
- Motor Principal: `app/automation/engine/automation-engine.ts`
- Executor de Passos: `app/automation/engine/step-executor.ts`
- Gestão de Sessões: `app/automation/sessions/session-manager.ts`
- Logs: `app/logs/automation-YYYY-MM-DD.log`
