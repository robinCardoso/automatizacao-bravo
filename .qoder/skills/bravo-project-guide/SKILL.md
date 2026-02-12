---
name: Guia do Projeto Bravo
description: Guia essencial sobre a arquitetura, quirks de build e padrões de desenvolvimento do Automatizador Bravo. LEIA ISTO ANTES DE CODAR.
---

# Guia de Desenvolvimento: Automatizador Bravo

Este skill contém informações críticas sobre a arquitetura e manutenção deste projeto.

## 🏗️ Arquitetura Modular

O projeto foi refatorado de um monolito para uma estrutura modular usando ES Modules.

- **Entry Point**: `app/renderer/main.js`
- **Módulos**: `app/renderer/modules/`

### Padrão de Injeção de Dependência
Para evitar dependências circulares (ex: `Presets` precisa de `Sites`, mas `Sites` precisa de `Utils`), usamos injeção via setters.
Exemplo em `presets.js`:
```javascript
export function setSitesModule(module) { SitesModule = module; }
```

### Contexto Global (`this` Binding)
Como o app expõe funções para o HTML globalmente (ex: `onclick="handleSavePreset()"`), as funções exportadas no `main.js` **DEVEM** ser amarradas ao seu contexto original usando `.bind()`.
**Errado:** `window.save = Modulo.save;` (Perde o `this`)
**Correto:** `window.save = Modulo.save.bind(Modulo);`

## 🖥️ UI e Reatividade

### Atualizações Instantâneas
Devido à latência do backend Electron/SQLite, a UI não deve esperar o retorno do `fetch` para atualizar listas críticas.
**Padrão:**
1. Atualize o objeto localmente (ex: `preset.sites.push(novoSite)`).
2. Chame a função de renderização (`this.renderSitesList(preset)`).
3. Salve no backend em background/await (`window.electronAPI.savePreset(...)`).

## 📦 Build e Deploy (Electron)

### Comando de Build
Use `npm run dist` para gerar o instalador `.exe`.

### Problema de File Lock (Windows)
O Windows frequentemente bloqueia a pasta `release/` ou o `.exe` antigo se o processo não morrer corretamente.
**Solução 1:**
```powershell
Stop-Process -Name "Automatizador*" -Force
npm run dist
```
**Solução 2 (Se persistir):**
Altere o `directories.output` no `package.json` para uma nova pasta (ex: `release_v2`) temporariamente.

### Caminhos de Arquivos (Data/Resources)
Em desenvolvimento (`dev`), arquivos estáticos estão em `process.cwd()`.
Em produção (empacotado), eles estão em `resources/`.
**Padrão para carregamento de arquivos (DiffEngine, etc):**
```typescript
const basePath = app.isPackaged ? process.resourcesPath : process.cwd();
```
Isso evita o crash `ENOENT` e problemas com o `schemaMaps.json`.

## 📂 Mapa de Arquivos Importantes
- `app/renderer/modules/state.js`: Estado global compartilhado.
- `app/core/diff/DiffEngine.ts`: Lógica crítica de comparação de snapshots (Safe Snapshot Policy).
- `app/electron/main.ts`: Processo principal do Electron.
