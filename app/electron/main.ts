import { app, BrowserWindow, ipcMain, shell, Menu, Tray, nativeImage } from 'electron';
import { autoUpdater } from 'electron-updater';
import * as path from 'path';
import * as fs from 'fs';
import { configManager } from '../config/config-manager';
import { presetRepository } from '../automation/engine/preset-repository';
import { automationEngine } from '../automation/engine/automation-engine';
import { sessionManager } from '../automation/sessions/session-manager';
import { schedulerService } from '../automation/engine/scheduler-service';
import { notificationService } from '../core/notifications/NotificationService';
import { dashboardService } from '../core/consolidation/DashboardService';
import { AppPaths } from '../core/utils/AppPaths';
import logger from '../config/logger';

// Mantém uma referência global da janela e da bandeja para evitar que sejam fechadas pelo garbage collector
let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;

// ===== CONFIGURAÇÃO DE INICIALIZAÇÃO AUTOMÁTICA =====
/**
 * Configura o aplicativo para iniciar automaticamente com o Windows
 * Funciona apenas em ambiente de produção (não em desenvolvimento)
 */
function setupAutoLaunch(): void {
  if (!app.isPackaged) {
    // Em desenvolvimento, não configura auto-launch
    return;
  }

  // Obtém o caminho do executável
  const exePath = process.execPath;

  // Configura para iniciar minimizado
  app.setLoginItemSettings({
    openAtLogin: true,
    openAsHidden: true, // Inicia minimizado na bandeja
    path: exePath,
    args: ['--hidden']
  });
}

// ===== CONFIGURAÇÃO DE TRAY (BANDEJA) =====
function setupTray(): void {
  // Ordem: produção (extraResources) primeiro, depois desenvolvimento
  const possiblePaths = [
    path.join(process.resourcesPath, 'build', 'icon.ico'), // Produção (copiado pelo electron-builder)
    path.join(__dirname, '..', '..', 'build', 'icon.ico'), // Desenvolvimento (dist/electron -> build/)
    path.join(app.getAppPath(), 'build', 'icon.ico'),
    path.join(process.cwd(), 'build', 'icon.ico')
  ];

  let iconPath = possiblePaths[0];
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      iconPath = p;
      break;
    }
  }

  let icon = nativeImage.createFromPath(iconPath);

  if (icon.isEmpty()) {
    logger.warn(`[Tray] Ícone não encontrado no caminho: ${iconPath}. Tentando ícone do executável.`);
    // Fallback: usa o ícone embutido no .exe (Windows)
    icon = nativeImage.createFromPath(process.execPath);
  }
  if (icon.isEmpty()) {
    logger.warn(`[Tray] Nenhum ícone disponível. Bandeja pode aparecer em branco.`);
  }

  tray = new Tray(icon.resize({ width: 16, height: 16 }));

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Abrir Automatizador Bravo',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.maximize();
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Sair Completamente',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setToolTip('Automatizador Bravo - Sistema Ativo');
  tray.setContextMenu(contextMenu);

  tray.on('double-click', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.maximize();
    }
  });
}

// ===== MONITOR DE MEMÓRIA (WATCHDOG) =====
function startMemoryWatchdog(): void {
  // Verifica a cada 1 hora
  setInterval(() => {
    const memoryUsage = process.memoryUsage();
    const rssMB = Math.round(memoryUsage.rss / 1024 / 1024);

    if (rssMB > 800) { // 800MB é o limite de alerta para 24/7
      logger.warn(`[Watchdog] Uso de memória elevado detectado: ${rssMB}MB. O sistema continua operando, mas recomenda-se monitoramento.`);
    } else {
      logger.info(`[Watchdog] Saúde do sistema: RAM em ${rssMB}MB`);
    }
  }, 1000 * 60 * 60);
}

// Handlers de IPC
function registerIpcHandlers(): void {
  // Configurações
  ipcMain.handle('get-config', async () => {
    return configManager.getConfig();
  });

  ipcMain.handle('save-config', async (event, config) => {
    configManager.saveConfig(config);
    return { success: true };
  });

  // Presets (Fase 6)
  ipcMain.handle('get-presets', async () => {
    return presetRepository.getAll();
  });

  ipcMain.handle('save-preset', async (event, preset) => {
    if (preset.id) {
      presetRepository.update(preset.id, preset);
    } else {
      presetRepository.create(preset);
    }
    return { success: true };
  });

  ipcMain.handle('delete-preset', async (event, id) => {
    presetRepository.delete(id);
    return { success: true };
  });

  // Exportação/Importação de Configurações
  ipcMain.handle('export-config', async () => {
    try {
      const exportedData = configManager.exportConfig();
      return { success: true, data: exportedData };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('import-config', async (event, importedData) => {
    try {
      const result = configManager.importConfig(importedData);
      return { success: true, result };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Outros status (ATUALIZADO: busca sites de todos os presets)
  ipcMain.handle('get-session-status', async () => {
    const allSites = configManager.getSites(); // Método legado que agrega sites de todos presets
    const userDataPath = path.join(app.getPath('userData'), 'automation-sessions');

    return allSites.map((site: any) => {
      const sessionPath = path.join(userDataPath, site.id);
      return {
        siteId: site.id,
        siteName: site.name,
        uf: site.uf,
        hasSession: fs.existsSync(sessionPath),
        path: sessionPath
      };
    });
  });

  ipcMain.handle('delete-session', async (event, siteId) => {
    const userDataPath = path.join(app.getPath('userData'), 'automation-sessions');
    const sessionPath = path.join(userDataPath, siteId);
    if (fs.existsSync(sessionPath)) {
      fs.rmSync(sessionPath, { recursive: true, force: true });
      return { success: true };
    }
    return { success: false };
  });

  ipcMain.handle('clear-sessions', async () => {
    await sessionManager.clearAllSessions();
    return { success: true };
  });

  ipcMain.handle('open-browser-for-login', async (event, siteId) => {
    return automationEngine.openBrowserForLogin(siteId);
  });

  ipcMain.handle('open-file', async (event, filePath) => {
    if (fs.existsSync(filePath)) {
      shell.openPath(filePath);
      return { success: true };
    }
    return { success: false, message: 'Arquivo não encontrado' };
  });

  ipcMain.handle('open-logs-folder', async () => {
    try {
      const logsDir = AppPaths.getLogsPath();
      if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true });
      }
      shell.openPath(logsDir);
      return { success: true };
    } catch (err: any) {
      logger.warn(`[open-logs-folder] Erro ao abrir pasta de logs: ${err?.message ?? err}`);
      return { success: false, message: err?.message ?? 'Não foi possível abrir a pasta de logs.' };
    }
  });

  ipcMain.handle('get-automation-status', async () => {
    return 'PARADA';
  });

  ipcMain.handle('start-automation', async (event, config) => {
    try {
      const webContents = event.sender;

      // Rodar em modo visível para que o usuário possa ver o login acontecendo
      // Futuramente isso pode ser uma configuração
      automationEngine.runAutomation({
        presetId: config.presetId
      }).then((results: any) => {
        webContents.send('automation-complete', { results });
      }).catch((error: any) => {
        webContents.send('automation-error', error.message);
      });

      return { success: true, message: 'Motor de automação iniciado' };
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  });

  ipcMain.handle('stop-automation', async () => {
    try {
      await automationEngine.stopAutomation();
      return { success: true, message: 'Automação parada com sucesso' };
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  });

  // ===== CONTROLE DE INICIALIZAÇÃO AUTOMÁTICA =====
  ipcMain.handle('get-auto-launch-status', async () => {
    if (!app.isPackaged) {
      return { enabled: false, available: false };
    }
    const settings = app.getLoginItemSettings();
    return {
      enabled: settings.openAtLogin,
      available: true
    };
  });

  ipcMain.handle('set-auto-launch', async (event, enabled: boolean) => {
    if (!app.isPackaged) {
      return {
        success: false,
        message: 'Auto-launch só funciona em versão instalada'
      };
    }

    try {
      app.setLoginItemSettings({
        openAtLogin: enabled,
        openAsHidden: enabled, // Se ativado, inicia minimizado
        path: process.execPath,
        args: enabled ? ['--hidden'] : []
      });

      return {
        success: true,
        message: enabled
          ? 'Aplicativo configurado para iniciar com o Windows'
          : 'Inicialização automática desativada'
      };
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  });

  // e-mail/SMTP
  ipcMain.handle('test-smtp-connection', async (event, smtpConfig) => {
    try {
      return await notificationService.testConnection(smtpConfig);
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('send-test-email', async (event, data) => {
    try {
      const { emailOptions, smtpConfig } = data;
      return await notificationService.sendTestEmail(emailOptions, smtpConfig);
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('get-dashboard-data', async (event, type, dest, options) => {
    return await dashboardService.getDashboardStats(type, dest, options);
  });

  ipcMain.handle('get-schema-maps', async () => {
    return configManager.getSchemaMaps();
  });

  // Catalog correction handlers
  ipcMain.handle('update-catalog-item', async (event, ref: string, info: any) => {
    try {
      const { catalogService } = await import('../core/services/CatalogService');
      catalogService.updateProduct(ref, info);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('batch-update-catalog', async (event, items: any[]) => {
    try {
      const { catalogService } = await import('../core/services/CatalogService');
      const updated = catalogService.batchUpdateProducts(items);
      return { success: true, updated };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // ===== ATUALIZAÇÃO (electron-updater) =====
  ipcMain.handle('check-for-updates', async () => {
    if (!app.isPackaged) {
      return { success: false, message: 'Atualizações só estão disponíveis na versão instalada.' };
    }
    try {
      const result = await autoUpdater.checkForUpdates();
      return { success: true, updateInfo: result?.updateInfo ?? null };
    } catch (err: any) {
      logger.warn(`[AutoUpdater] checkForUpdates: ${err?.message ?? err}`);
      return { success: false, message: err?.message ?? 'Falha ao verificar atualização.' };
    }
  });

  ipcMain.handle('quit-and-install', () => {
    if (app.isPackaged) {
      autoUpdater.quitAndInstall(false, true);
    }
  });
}

function createWindow(): void {
  // Verifica se foi iniciado com argumento --hidden (auto-start)
  const startHidden = process.argv.includes('--hidden');

  // Cria a janela do navegador
  mainWindow = new BrowserWindow({
    width: 1366,
    height: 768,
    minWidth: 1024,
    minHeight: 720,
    show: !startHidden, // Não mostra a janela se iniciado pelo auto-start
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    icon: path.join(__dirname, '../../assets/icon.png')
  });

  // Remove o menu da aplicação (manter comentado para permitir menu de desenvolvedor)
  // Menu.setApplicationMenu(null);

  // Maximiza para ocupar a tela corretamente sem ultrapassar limites
  if (!startHidden) {
    mainWindow.maximize();
  }

  // Carrega o arquivo HTML
  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  // Abre DevTools em ambiente de desenvolvimento
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }

  // Habilitar atalhos de teclado para desenvolvedor
  mainWindow.webContents.on('before-input-event', (event, input) => {
    // Atalho Ctrl+Shift+I para abrir DevTools
    if (input.key === 'I' && input.control && input.shift) {
      if (mainWindow) {
        mainWindow.webContents.openDevTools();
      }
      event.preventDefault();
    }
    // Atalho F12 para abrir DevTools
    if (input.key === 'F12') {
      if (mainWindow) {
        mainWindow.webContents.toggleDevTools();
      }
      event.preventDefault();
    }
  });

  // Trata o evento de fechamento da janela
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      if (mainWindow) {
        mainWindow.hide();
      }
      return false;
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ===== ATUALIZAÇÃO AUTOMÁTICA (electron-updater) =====
function setupAutoUpdater(): void {
  if (!app.isPackaged) {
    return;
  }
  autoUpdater.logger = logger;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-available', (info: { version: string }) => {
    logger.info(`[AutoUpdater] Nova versão disponível: ${info.version}`);
    mainWindow?.webContents?.send('update-available', { version: info.version });
  });

  autoUpdater.on('update-downloaded', (info: { version: string }) => {
    logger.info(`[AutoUpdater] Atualização baixada: ${info.version}`);
    mainWindow?.webContents?.send('update-downloaded', { version: info.version });
  });

  autoUpdater.on('error', (err: Error) => {
    logger.warn(`[AutoUpdater] Erro: ${err.message}`);
    mainWindow?.webContents?.send('update-error', { message: err.message });
  });

  // Checagem em background após 8 segundos (opcional)
  setTimeout(() => {
    if (app.isPackaged && mainWindow) {
      autoUpdater.checkForUpdates().catch(() => {});
    }
  }, 8000);
}

// Este método será chamado quando o Electron terminar a inicialização
app.whenReady().then(() => {
  // Garante que as pastas de dados existam antes de qualquer serviço carregar
  AppPaths.ensureDirectories();

  registerIpcHandlers();
  createWindow();

  // Configura inicialização automática com o Windows
  setupAutoLaunch();

  // Configura a bandeja (Tray) para rodar 24/7
  setupTray();

  // Inicia o monitor de recursos
  startMemoryWatchdog();

  // Inicia o agendador automático
  schedulerService.start();

  setupAutoUpdater();

  app.on('activate', () => {
    // No macOS é comum recriar uma janela quando o ícone do dock é clicado
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Fecha a aplicação quando todas as janelas forem fechadas
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});