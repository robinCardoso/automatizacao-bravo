---
name: automatizador-bravo
description: Arquitetura, padrões e correções críticas do Automatizador Bravo (Electron + Playwright): Panic Stop, controle de botões INICIAR/PARAR, salvamento de presets/passos, detecção de login no Bravo ERP, resolução de seletores visíveis e cliques/selects resilientes.
---

# Automatizador Bravo — Padrões e Regras de Manutenção

Use esta skill sempre que alterar o motor de automação (`app/automation/`), IPC (`app/electron/`) ou interface (`app/renderer/`) do Automatizador Bravo.

## 1. Controle de Execução e Panic Stop (`INICIAR` / `PARAR`)

* **Botão `PARAR` é Panic Stop imediato:**
  * Em `app/automation/engine/automation-engine.ts`, `stopAutomation()` define `isRunning = false`, `abortedByUser = true`, dispara `abortController.abort()`, fecha sessões e emite `automation-stopped` para todas as janelas.
  * `wait(ms)` usa `AbortSignal` para interromper imediatamente o cooldown entre re-tentativas (5 min).
  * `SessionManager.closeActiveSessions()` (`app/automation/sessions/session-manager.ts`) fecha contextos em paralelo com timeout de segurança de **2,5s** para nunca travar o IPC.
  * Quando abortado pelo usuário (`wasAborted()`), **não** executa consolidação master nem envia e-mail de resumo.
  * `executePhase` também ignora `triggerMasterConsolidation` quando nenhum site teve sucesso (`!phaseResults.some(r => r.success)`), evitando bloqueio do processo principal quando todos os sites falham.
* **Botão `INICIAR` inativo durante execução:**
  * `app/renderer/style.css` deve manter `.btn-start:disabled` (cinza e `cursor: not-allowed`).
  * `Automation.startAutomation()` (`app/renderer/modules/automation.js`) verifica `State.isRunning`, chama `UI.toggleButtons(true)` **antes** do `await window.electronAPI.startAutomation(...)` e reverte se `result?.success` for falso.
  * `app/electron/main.ts` (`get-automation-status`) retorna `automationEngine.getIsRunning() ? 'EXECUTANDO' : 'PARADA'`, sincronizado no `DOMContentLoaded` em `app/renderer/main.js` e pelos eventos `automation-started` / `automation-stopped` (incluindo execuções do `SchedulerService`).

## 2. Salvamento de Presets e Passos

* **Preservação de passos ao salvar preset:** Em `Presets.handleSavePreset()` (`app/renderer/modules/presets.js`), ao atualizar um preset existente, sempre preservar `existing.sites`, `existing.steps` e `existing.lastUsedAt`.
* **Botão "Aplicar Alterações" (`saveConfig`):** Em `app/renderer/main.js`, `window.saveConfig()` salva também `#presetStepsList` via `Sites.savePresetSteps(true)` quando `State.editingPresetId` estiver ativo.
* **Persistência da seleção principal:** `mainPresetSelector` e `mainUFSelector` persistem em `localStorage` (`bravo_selected_preset`, `bravo_selected_uf`), com fallback padrão para preset `vendas` e UF `SC`.

## 3. Motor Playwright no Bravo ERP

* **Detecção de login (`app/automation/sessions/login-handler.ts`):**
  * `isAlreadyLoggedIn` e `isLoginSuccessful` verificam seletores do Bravo ERP (`#menu__ferramentas`, `#menu__monitores`, `span:has-text("Ferramentas")`, `a[href*="sair"]`, `a:has-text("Sair")`) além dos genéricos, e consideram sessão autenticada quando os campos de login (`usernameField`/`passwordField`) não estão na página (fora da URL de login).
  * Após clicar em `loginButton`, `attemptAutoLogin` aguarda a transição real (`Promise.race` entre `networkidle`, ocultação de `usernameField` ou exibição do menu do ERP) antes de validar `isLoginSuccessful`.
* **Seletores visíveis (`app/automation/engine/selector-resolver.ts`):**
  * `resolveSelector` usa `this.page.locator(sel).filter({ visible: true }).first()` para não travar em elementos duplicados ocultos no DOM (ex.: menus laterais recolhidos) e checa `checkCancellation` entre seletores e tentativas.
* **Cliques, Hovers e Selects resilientes (`app/automation/engine/step-executor.ts`):**
  * `clickElementResilient` (usado em `click` e `download`): tenta clique padrão (máx. 8s); se houver sobreposição de modais/tooltips (ex.: popover *Novidades!*) ou timeout, faz clique direto via DOM (`el.click()`, priorizando `a, button` interno se o alvo for `<li>`).
  * `hoverElementResilient`: tenta hover padrão (máx. 8s) com fallback para `hover({ force: true })` + `mouseenter`/`mouseover`.
  * `executeSelect`: verifica primeiro as `<option>` do `<select>` (por `value` ou `text`, case-insensitive) para evitar espera de timeout quando o valor configurado é o `value` interno (ex.: `"nao"` para `"Não"`).

## 4. Feedback na Interface

* `Utils.showNotification()` (`app/renderer/modules/utils.js`) exibe toast flutuante visível em qualquer aba.
* O botão **Ver** na tabela de auditoria (`app/renderer/modules/ui.js`) abre `showExecutionDetailModal` com os detalhes completos do erro.

## 5. Compilação após alterações

* Sempre rodar `npm run build` (`tsc && xcopy app\renderer dist\renderer /E /I /Y`) após editar arquivos em `app/`.
* Para gerar o instalador Windows, seguir a skill `build-electron` (`npm run dist` ou `npm run dist:full`).
