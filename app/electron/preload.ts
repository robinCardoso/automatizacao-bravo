// preload.ts - Script de pré-carregamento para comunicação segura
import { contextBridge, ipcRenderer } from 'electron';

// APIs expostas ao renderer process de forma segura
contextBridge.exposeInMainWorld('electronAPI', {
  // Métodos de automação
  startAutomation: (config: any) => ipcRenderer.invoke('start-automation', config),
  stopAutomation: () => ipcRenderer.invoke('stop-automation'),
  getAutomationStatus: () => ipcRenderer.invoke('get-automation-status'),

  // Métodos de configuração
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (config: any) => ipcRenderer.invoke('save-config', config),

  // Métodos de sessão
  getSessionStatus: () => ipcRenderer.invoke('get-session-status'),
  deleteSession: (siteId: string) => ipcRenderer.invoke('delete-session', siteId),
  clearSessions: () => ipcRenderer.invoke('clear-sessions'),
  openBrowserForLogin: (siteId: string) => ipcRenderer.invoke('open-browser-for-login', siteId),
  openFile: (filePath: string) => ipcRenderer.invoke('open-file', filePath),
  openLogsFolder: () => ipcRenderer.invoke('open-logs-folder'),

  // Métodos de Preset (Fase 6)
  getPresets: () => ipcRenderer.invoke('get-presets'),
  savePreset: (preset: any) => ipcRenderer.invoke('save-preset', preset),
  deletePreset: (id: string) => ipcRenderer.invoke('delete-preset', id),

  // Métodos de Exportação/Importação
  exportConfig: () => ipcRenderer.invoke('export-config'),
  importConfig: (data: any) => ipcRenderer.invoke('import-config', data),

  // Métodos de inicialização automática
  getAutoLaunchStatus: () => ipcRenderer.invoke('get-auto-launch-status'),
  setAutoLaunch: (enabled: boolean) => ipcRenderer.invoke('set-auto-launch', enabled),

  // Métodos de E-mail/SMTP
  testSmtpConnection: (smtpConfig: any) => ipcRenderer.invoke('test-smtp-connection', smtpConfig),
  sendTestEmail: (options: any) => ipcRenderer.invoke('send-test-email', options),

  // Métodos de Dashboard
  getDashboardData: (type: string, dest: string, options: any) => ipcRenderer.invoke('get-dashboard-data', type, dest, options),
  getSchemaMaps: () => ipcRenderer.invoke('get-schema-maps'),
  saveSchemaMaps: (schemas: any) => ipcRenderer.invoke('save-schema-maps', schemas),

  // Métodos de Catálogo
  updateCatalogItem: (ref: string, info: any) => ipcRenderer.invoke('update-catalog-item', ref, info),
  batchUpdateCatalog: (items: any[]) => ipcRenderer.invoke('batch-update-catalog', items),

  // Atualização (electron-updater)
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  quitAndInstall: () => ipcRenderer.invoke('quit-and-install'),

  // Eventos
  onAutomationProgress: (callback: (data: any) => void) =>
    ipcRenderer.on('automation-progress', (_event, data) => callback(data)),
  onAutomationComplete: (callback: (data: any) => void) =>
    ipcRenderer.on('automation-complete', (_event, data) => callback(data)),
  onAutomationError: (callback: (error: string) => void) =>
    ipcRenderer.on('automation-error', (_event, error) => callback(error)),
  onSiteComplete: (callback: (result: any) => void) =>
    ipcRenderer.on('site-complete', (_event, result) => callback(result)),
  onUpdateAvailable: (callback: (info: { version: string }) => void) =>
    ipcRenderer.on('update-available', (_event, info) => callback(info)),
  onUpdateDownloaded: (callback: (info: { version: string }) => void) =>
    ipcRenderer.on('update-downloaded', (_event, info) => callback(info)),
  onUpdateError: (callback: (info: { message: string }) => void) =>
    ipcRenderer.on('update-error', (_event, info) => callback(info)),

  // Remover listeners
  removeAllListeners: (channel: string) => ipcRenderer.removeAllListeners(channel)
});