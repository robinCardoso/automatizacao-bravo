---
name: Exportar Logs e pasta logs
overview: Implementar o botão "Exportar Logs" para abrir a pasta de logs no Explorer e garantir que a pasta seja criada no app instalado (incluindo quando ainda não existir).
todos: []
isProject: false
---

# Plano: Botão Exportar Logs e criação da pasta de logs

## Situação atual

- O botão **"Exportar Logs"** na interface apenas mostra a notificação *"Exportação de logs em desenvolvimento"* ([app/renderer/main.js](app/renderer/main.js) linha 291). Não há IPC nem lógica para abrir a pasta de logs.
- A pasta de logs é criada em **setImmediate** no logger ([app/config/logger.ts](app/config/logger.ts)), então só existe após o próximo tick do event loop. No app instalado, se o usuário abrir a tela e clicar em "Exportar Logs" antes de qualquer log ser escrito, a pasta pode ainda não existir.
- O caminho da pasta em produção é `AppPaths.getLogsPath()` → `%APPDATA%/Automatizador Bravo/logs` ([app/core/utils/AppPaths.ts](app/core/utils/AppPaths.ts)).

## Objetivo

1. Fazer o botão "Exportar Logs" abrir a pasta de logs no Explorador de Arquivos do Windows.
2. Garantir que a pasta exista no momento em que for aberta (criar se necessário).

## Alterações propostas

### 1. Main process – handler IPC e abertura da pasta

**Arquivo:** [app/electron/main.ts](app/electron/main.ts)

- Registrar um handler `open-logs-folder` que:
  - Obtenha o caminho da pasta de logs (ex.: importar/usar `AppPaths.getLogsPath()` ou obter o mesmo caminho via `app.getPath('userData')` + `'logs'`).
  - Garanta que a pasta exista: `if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true })`.
  - Abra a pasta no sistema (Windows: Explorer): `shell.openPath(logsDir)` (ou `shell.openExternal('file://' + logsDir)` se for necessário para pastas no seu ambiente).
  - Retorne `{ success: true }` ou `{ success: false, message: string }` para o renderer exibir feedback.
- Reutilizar o padrão já usado em `open-file` (checagem com `fs`, uso de `shell`).

### 2. Preload – expor o novo IPC

**Arquivo:** [app/electron/preload.ts](app/electron/preload.ts)

- Expor no `electronAPI` um método, por exemplo:  
`openLogsFolder: () => ipcRenderer.invoke('open-logs-folder')`.

### 3. Renderer – usar o IPC no botão Exportar Logs

**Arquivo:** [app/renderer/main.js](app/renderer/main.js)

- Em `window.exportLogs` (ou no handler do botão "Exportar Logs"):
  - Chamar `window.electronAPI.openLogsFolder()` (ou o nome exposto no preload).
  - Conforme a resposta:
    - Sucesso: notificação do tipo "Pasta de logs aberta" (ou similar).
    - Erro: notificação com a mensagem retornada (ex.: "Não foi possível abrir a pasta de logs").
  - Remover a notificação fixa "Exportação de logs em desenvolvimento".

### 4. Garantir criação da pasta ao abrir (opcional/reforço)

- No handler `open-logs-folder`, a criação da pasta com `fs.mkdirSync(..., { recursive: true })` já garante que, no app instalado, a pasta exista mesmo quando ainda não foi criada pelo logger (setImmediate ou primeiro write).
- Opcional: no `app.whenReady()` ou no início do main, chamar algo como `AppPaths.ensureDirectories()` (que já cria `getLogsPath()`), para que a pasta de logs exista o mais cedo possível. Isso é independente do botão e melhora a robustez no desktop instalado.

## Ordem sugerida

1. Implementar o handler `open-logs-folder` no main (com criação da pasta e `shell.openPath`).
2. Expor `openLogsFolder` no preload.
3. Atualizar `exportLogs` no renderer para usar o IPC e as notificações de sucesso/erro.
4. (Opcional) Chamar `ensureDirectories()` no startup do main para criar a pasta de logs logo na inicialização.

Com isso, após a instalação no desktop, a pasta de logs passará a existir (na primeira abertura ou ao clicar em Exportar Logs) e o botão "Exportar Logs" abrirá essa pasta no Explorer em vez de mostrar "em desenvolvimento".