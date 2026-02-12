Crie o core de automação do sistema usando Playwright.

Requisitos:
- Engine genérica baseada em steps
- Nenhum site hardcoded
- Steps configuráveis via JSON
- Execução headless
- Suporte a fallback de seletores

Exemplos de steps suportados:
- goto
- click
- fill
- fillDateRange
- waitFor
- download

Crie:
- AutomationEngine
- StepExecutor
- SelectorResolver (array de seletores)
- Sistema de timeout e retry
- Logs por step

Não conecte ainda com Electron UI.
Crie apenas o core testável via Node.js.
