# Migração: Isolamento Completo de Presets

## Objetivo
Isolar completamente os Sites dentro de cada Preset, eliminando a lista global compartilhada.

## Mudanças Necessárias

### 1. `app/config/config-manager.ts`

#### Linha 38 - Mudar o schema do Preset:
```typescript
// DE:
sites: z.array(z.string()), // IDs dos sites incluídos

// PARA:
sites: z.array(SiteConfigSchema).default([]), // Sites completos isolados
```

#### Linha 58 - Remover lista global de sites do AppConfig:
```typescript
// DE:
const AppConfigSchema = z.object({
  sites: z.array(SiteConfigSchema),
  credentials: z.record(z.string(), z.string()).optional(),
  // ...
});

// PARA:
const AppConfigSchema = z.object({
  // sites: REMOVIDO - agora cada preset tem os seus
  credentials: z.record(z.string(), z.string()).optional(),
  // ...
});
```

#### Linhas 140-176 - Remover métodos globais de Site:
Comentar ou remover:
- `getSiteById()`
- `getSites()`
- `addSite()`
- `removeSite()`
- `updateSite()`

#### Adicionar novos métodos context-aware (após linha 218):
```typescript
// Métodos de Site isolados por Preset
public getPresetSites(presetId: string): SiteConfig[] {
  const preset = this.config.presets?.find(p => p.id === presetId);
  return preset?.sites || [];
}

public addSiteToPreset(presetId: string, site: SiteConfig): void {
  const preset = this.config.presets?.find(p => p.id === presetId);
  if (!preset) throw new Error(`Preset não encontrado: ${presetId}`);
  
  const validatedSite = SiteConfigSchema.parse({
    ...site,
    id: site.id || require('crypto').randomUUID()
  });
  
  if (!preset.sites) preset.sites = [];
  preset.sites.push(validatedSite);
  this.saveConfig(this.config);
  logger.info(`Site adicionado ao preset ${preset.name}: ${site.name}`);
}

public removeSiteFromPreset(presetId: string, siteId: string): void {
  const preset = this.config.presets?.find(p => p.id === presetId);
  if (!preset) return;
  
  preset.sites = preset.sites?.filter(s => s.id !== siteId) || [];
  this.saveConfig(this.config);
  logger.info(`Site removido do preset: ${siteId}`);
}

public updateSiteInPreset(presetId: string, siteId: string, updatedSite: Partial<SiteConfig>): void {
  const preset = this.config.presets?.find(p => p.id === presetId);
  if (!preset || !preset.sites) throw new Error('Preset ou site não encontrado');
  
  const index = preset.sites.findIndex(s => s.id === siteId);
  if (index === -1) throw new Error(`Site não encontrado: ${siteId}`);
  
  preset.sites[index] = { ...preset.sites[index], ...updatedSite };
  this.saveConfig(this.config);
  logger.info(`Site atualizado no preset: ${siteId}`);
}
```

---

### 2. `app/automation/engine/automation-engine.ts`

#### Linha 80-86 - Simplificar busca de sites:
```typescript
// DE:
const allSites = configManager.getSites();
sitesToRun = allSites.filter(site => currentPreset?.sites.includes(site.id));

if (sitesToRun.length === 0) {
  sitesToRun = allSites;
}

// PARA:
sitesToRun = currentPreset.sites || []; // Sites já são objetos completos

if (sitesToRun.length === 0) {
  throw new Error('Nenhum site configurado neste Preset');
}
```

---

### 3. `app/renderer/main.js`

#### Adicionar estado global (após linha 3):
```javascript
let currentEditingPresetId = null; // Rastreia qual preset está sendo editado
```

#### Modificar `loadSites()` (linha ~195):
```javascript
async function loadSites() {
    if (!currentEditingPresetId) {
        console.warn('Nenhum preset selecionado para edição');
        document.getElementById('sitesList').innerHTML = '<p style="color: #95a5a6; padding: 15px;">Selecione um Preset para ver seus sites</p>';
        return;
    }
    
    try {
        const presets = await window.electronAPI.getPresets();
        const preset = presets.find(p => p.id === currentEditingPresetId);
        
        if (!preset) {
            console.warn('Preset não encontrado');
            return;
        }
        
        const sites = preset.sites || [];
        const list = document.getElementById('sitesList');
        list.innerHTML = '';
        
        if (sites.length === 0) {
            list.innerHTML = '<p style="color: #95a5a6; padding: 15px;">Nenhum site configurado neste preset</p>';
            return;
        }
        
        sites.forEach(site => {
            // ... código de renderização existente
        });
        
        updateStatus('sitesCount', sites.length);
    } catch (error) {
        log(`❌ Erro ao carregar sites: ${error}`);
    }
}
```

#### Modificar `handleSaveSite()` (linha ~301):
```javascript
async function handleSaveSite() {
    if (!currentEditingPresetId) {
        showNotification('Nenhum preset selecionado!', 'error');
        return;
    }
    
    // ... coleta de dados do formulário
    
    try {
        const presets = await window.electronAPI.getPresets();
        const presetIndex = presets.findIndex(p => p.id === currentEditingPresetId);
        
        if (presetIndex === -1) {
            throw new Error('Preset não encontrado');
        }
        
        const preset = presets[presetIndex];
        if (!preset.sites) preset.sites = [];
        
        const existingIndex = preset.sites.findIndex(s => s.id === id);
        
        if (existingIndex !== -1) {
            preset.sites[existingIndex] = siteConfig;
        } else {
            preset.sites.push(siteConfig);
        }
        
        await window.electronAPI.updatePreset(preset.id, { sites: preset.sites });
        showNotification('Site salvo com sucesso!', 'success');
        hideSiteForm();
        loadSites();
    } catch (error) {
        showNotification(`Erro ao salvar: ${error.message}`, 'error');
    }
}
```

#### Modificar `editPreset()` para definir contexto (linha ~588):
```javascript
async function editPreset(id) {
    currentEditingPresetId = id; // Define o contexto
    
    const presets = await window.electronAPI.getPresets();
    const preset = presets.find(p => p.id === id);
    
    if (preset) {
        showPresetForm();
        // ... resto do código
        
        // Atualiza a lista de sites para mostrar apenas os deste preset
        loadSites();
    }
}
```

---

### 4. `app/electron/main.ts`

#### Remover handlers IPC antigos (se existirem):
- `ipcMain.handle('get-sites', ...)`
- `ipcMain.handle('save-site', ...)`
- `ipcMain.handle('delete-site', ...)`

Esses handlers não são mais necessários porque os Sites agora são salvos diretamente dentro do Preset via `update-preset`.

---

## Benefícios da Migração

1. ✅ **Isolamento Total**: Cada preset tem seus próprios sites
2. ✅ **Sem Conflitos**: Sites de "Vendas" não aparecem em "Pedidos"
3. ✅ **Simplicidade**: Remove a complexidade de manter sincronizados IDs e objetos
4. ✅ **Escalabilidade**: Adicionar novos presets não polui a lista global
5. ✅ **Portabilidade**: Um preset pode ser exportado com todos os seus sites

## Próximos Passos

1. Aplicar as mudanças no `config-manager.ts`
2. Compilar: `npx tsc`
3. Testar criação de novo preset com sites isolados
4. Verificar que os presets antigos ainda funcionam (migração automática)
