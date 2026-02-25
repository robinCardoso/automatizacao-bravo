import * as path from 'path';
import { chromium, Browser, Page } from 'playwright';
import { BrowserWindow } from 'electron';
import { StepExecutor, Step } from './step-executor';
import { configManager, SiteConfig, Preset } from '../../config/config-manager';
import { notificationService } from '../../core/notifications/NotificationService';
import { automationLogger } from '../../config/logger';
import { sessionManager } from '../sessions/session-manager';
import { loginHandler, LoginResult } from '../sessions/login-handler';
import { presetRepository } from './preset-repository';
import { consolidator } from '../../core/consolidation/Consolidator';

export interface AutomationOptions {
  siteIds?: string[];
  presetId?: string;
}

export interface AutomationResult {
  success: boolean;
  siteId: string;
  siteName: string;
  presetName?: string;
  stepsExecuted: number;
  duration: number;
  errorMessage?: string;
  errorScreenshot?: string;
  downloads?: string[];
  identity?: { tipo: string; period: string };
  sspResult?: {
    added: number;
    removed: number;
    currentRows: number;
    currentFile: string;
    deletedFile: string;
    isValid: boolean;
    uf: string;
    primaryKeys?: string[];
  };
}

export interface AutomationProgress {
  siteId: string;
  siteName: string;
  currentStep: number;
  totalSteps: number;
  stepType: string;
  message: string;
  percentage: number;
}

export class AutomationEngine {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private stepExecutor: StepExecutor | null = null;
  private isRunning: boolean = false;
  private startTime: number = 0;

  constructor() { }

  /**
   * Inicia o processo de automação para um ou mais sites
   */
  async runAutomation(options: AutomationOptions = {}): Promise<AutomationResult[]> {
    if (this.isRunning) {
      throw new Error('Automação já está em execução');
    }

    this.isRunning = true;
    this.startTime = Date.now();
    const results: AutomationResult[] = [];
    let currentPreset: Preset | undefined;

    const GLOBAL_TIMEOUT = 2 * 60 * 60 * 1000;

    const timeoutHandle = setTimeout(async () => {
      if (this.isRunning) {
        automationLogger.error(`[CRÍTICO] Automação excedeu o tempo limite global de 2 horas. Forçando encerramento.`);
        await this.stopAutomation();
      }
    }, GLOBAL_TIMEOUT);

    try {
      automationLogger.info('Limpando sessões anteriores...');
      await sessionManager.closeActiveSessions();

      let sitesToRun: SiteConfig[] = [];

      if (options.presetId) {
        currentPreset = presetRepository.getById(options.presetId);
        if (!currentPreset) throw new Error(`Preset não encontrado: ${options.presetId}`);
        sitesToRun = currentPreset.sites || [];
        if (sitesToRun.length === 0) {
          throw new Error('Nenhum site configurado neste Preset');
        }
      } else {
        const allSites = configManager.getSites();
        sitesToRun = options.siteIds
          ? allSites.filter(site => options.siteIds?.includes(site.id))
          : allSites;
      }

      if (sitesToRun.length === 0) {
        throw new Error('Nenhum site encontrado para processar');
      }

      automationLogger.info(`Iniciando processamento de ${sitesToRun.length} sites`);

      for (const site of sitesToRun) {
        if (!this.isRunning) {
          automationLogger.info('Automação interrompida pelo usuário.');
          break;
        }

        try {
          const siteWithCredentials = { ...site };
          if (currentPreset) {
            siteWithCredentials.credentials = {
              username: currentPreset.login,
              password: currentPreset.password
            };
          }

          let targetPath = siteWithCredentials.downloadPath || currentPreset?.destination;

          // Auto-folder logic
          if (!siteWithCredentials.downloadPath && currentPreset?.destination && site.reportType) {
            const reportSuffix = site.reportType.charAt(0).toUpperCase() + site.reportType.slice(1).toLowerCase() + 's';
            const folderName = `${site.uf || 'XX'}-${reportSuffix}`;
            targetPath = path.join(currentPreset.destination, folderName);
          }

          const result = await this.processSite(siteWithCredentials, targetPath, currentPreset);

          if (currentPreset) {
            result.presetName = currentPreset.name;
          }

          results.push(result);

          // UI update
          const webContents = BrowserWindow.getAllWindows()[0]?.webContents;
          if (webContents) {
            webContents.send('site-complete', result);
          }
        } catch (error: any) {
          automationLogger.error(`Falha no site ${site.name}: ${error.message}`);

          let screenshotPath = '';
          try {
            if (this.stepExecutor) {
              screenshotPath = await this.stepExecutor.takeScreenshot(`error_${site.uf}`);
            }
          } catch (e) { }

          const result: AutomationResult = {
            success: false,
            siteId: site.id,
            siteName: site.name,
            presetName: currentPreset?.name,
            stepsExecuted: 0,
            duration: 0,
            errorMessage: error.message,
            errorScreenshot: screenshotPath
          };

          results.push(result);

          const webContents = BrowserWindow.getAllWindows()[0]?.webContents;
          if (webContents) {
            webContents.send('site-complete', result);
          }
        } finally {
          await sessionManager.closeSession(site.id);
          // Consolidação Incremental
          await this.triggerMasterConsolidation(results, currentPreset);
        }
      }

      if (currentPreset?.id) {
        presetRepository.markAsUsed(currentPreset.id);
      }

      return results;
    } finally {
      clearTimeout(timeoutHandle);
      await this.cleanup();
      this.isRunning = false;
      automationLogger.info('Motor de automação finalizado');

      if (currentPreset) {
        notificationService.sendAutomationSummary(currentPreset.name, results).catch((err: Error) => {
          automationLogger.error(`[Notification] Erro ao disparar resumo: ${err.message}`);
        });
      }
    }
  }

  /**
   * Gatilho de consolidação Master
   */
  private async triggerMasterConsolidation(results: AutomationResult[], currentPreset?: Preset) {
    const destinationDir = currentPreset?.destination || this.inferConsolidationDestination(results);

    if (!destinationDir) return;

    try {
      const siteSucceededCount = results.filter(r => r.success).length;
      automationLogger.info(`[Consolidator] Atualizando mestre (${results.length} processados, ${siteSucceededCount} sucessos)...`);

      const masterResults = await consolidator.consolidate(results, destinationDir, currentPreset?.type);

      if (masterResults.current) {
        automationLogger.debug(`[Consolidator] Master atualizado: ${path.basename(masterResults.current)}`);
      }
    } catch (consError: any) {
      automationLogger.error(`[Consolidator] Falha na consolidação incremental: ${consError.message}`);
    }
  }

  private inferConsolidationDestination(results: AutomationResult[]): string | null {
    const paths = results
      .filter((r): r is AutomationResult & { sspResult: NonNullable<AutomationResult['sspResult']> } =>
        r.success && !!r.sspResult?.currentFile)
      .map(r => path.normalize(r.sspResult!.currentFile));
    if (paths.length === 0) return null;
    const dirs = Array.from(new Set(paths.map(p => path.dirname(p))));
    if (dirs.length === 0) return null;

    const parts = dirs[0].split(path.sep).filter(Boolean);
    for (let i = parts.length; i >= 1; i--) {
      const candidate = parts.slice(0, i).join(path.sep);
      if (dirs.every(d => d === candidate || d.startsWith(candidate + path.sep))) {
        const isSiteFolder = /^[A-Z]{2}-/.test(path.basename(candidate));
        if (isSiteFolder && i > 1) {
          return parts.slice(0, i - 1).join(path.sep);
        }
        return candidate;
      }
    }
    return dirs[0];
  }

  private async processSite(site: SiteConfig, customBasePath?: string, currentPreset?: Preset): Promise<AutomationResult> {
    const siteStartTime = Date.now();

    // Resolve PKs: Prioridade Preset > Prioridade Global (schemaMaps)
    let resolvedPKs = currentPreset?.primaryKeys;

    if (!resolvedPKs || resolvedPKs.length === 0) {
      const globalSchema = configManager.getSchemaByType(currentPreset?.type || site.reportType || '');
      if (globalSchema && globalSchema.primaryKey) {
        resolvedPKs = globalSchema.primaryKey;
        automationLogger.debug(`[Engine] Usando chaves primárias globais para ${site.name}: ${resolvedPKs.join(', ')}`);
      }
    }

    if (site.reportType && (!resolvedPKs || resolvedPKs.length === 0)) {
      throw new Error(`Configuração Inválida: Colunas identificadoras não informadas para auditoria (Site/Preset/Global).`);
    }

    let stepsExecuted = 0;
    const downloads: string[] = [];

    try {
      const config = configManager.getConfig();
      const headless = config.headless !== undefined ? config.headless : true;

      this.emitProgress({
        siteId: site.id, siteName: site.name, currentStep: 0, totalSteps: site.steps.length,
        stepType: 'goto', message: `🌐 Abrindo navegador...`, percentage: 0
      });

      const context = await sessionManager.getSession(site.id, headless);
      let page = context.pages()[0] || await context.newPage();

      if (!(await this.isAlreadyLoggedIn(page, site))) {
        const loginResult = await loginHandler.performLogin(site, context, headless);
        if (!loginResult.success) throw new Error(`Falha no login: ${loginResult.errorMessage}`);
      }

      this.stepExecutor = new StepExecutor(
        page, site, Math.max(config.defaultTimeout || 30000, 60000),
        config.defaultRetries || 3, config.actionDelay || 1000,
        customBasePath, currentPreset,
        () => !this.isRunning // Função de cancelamento
      );

      for (let i = 0; i < site.steps.length; i++) {
        const step = site.steps[i];
        if (await loginHandler.checkSessionExpired(page, site)) {
          const reauthResult = await loginHandler.reauthenticate(site, context, headless);
          if (!reauthResult.success) throw new Error(`Sessão expirada e reautenticação falhou`);
          page = context.pages()[0];
        }

        this.emitProgress({
          siteId: site.id, siteName: site.name, currentStep: i + 1, totalSteps: site.steps.length,
          stepType: step.type, message: `Executando ${step.type}`,
          percentage: Math.round(((i + 1) / site.steps.length) * 100)
        });

        await this.stepExecutor.executeStep(step);
        stepsExecuted++;
      }

      const duration = Date.now() - siteStartTime;
      const sspData = this.stepExecutor.getLastDiffResult();

      return {
        success: true, siteId: site.id, siteName: site.name, stepsExecuted, duration, downloads,
        identity: site.reportType ? { tipo: site.reportType, period: this.stepExecutor.getCurrentPeriod() } : undefined,
        sspResult: sspData ? { ...sspData, isValid: true, primaryKeys: resolvedPKs } : undefined
      };
    } catch (error: any) {
      return {
        success: false, siteId: site.id, siteName: site.name, stepsExecuted,
        duration: Date.now() - siteStartTime, errorMessage: error.message
      };
    }
  }

  private async isAlreadyLoggedIn(page: Page, site: SiteConfig): Promise<boolean> {
    try {
      const logoutSelectors = ['a[href*="logout"]', 'button:has-text("Sair")', '.user-menu'];
      for (const selector of logoutSelectors) {
        if (await page.locator(selector).isVisible().catch(() => false)) return true;
      }
      return false;
    } catch { return false; }
  }

  async openBrowserForLogin(siteId: string): Promise<{ success: boolean }> {
    if (this.isRunning) throw new Error('Automação em execução');
    const site = configManager.getSiteById(siteId);
    if (!site) throw new Error(`Site não encontrado`);
    await sessionManager.closeActiveSessions();
    const context = await sessionManager.getSession(siteId, false);
    const page = context.pages()[0] || await context.newPage();
    await page.goto(site.loginUrl);
    return new Promise((resolve) => {
      context.on('close', () => resolve({ success: true }));
      page.on('close', async () => await context.close());
    });
  }

  private emitProgress(progress: AutomationProgress): void {
    const windows = BrowserWindow.getAllWindows();
    windows.forEach(win => win.webContents.send('automation-progress', progress));
  }

  async stopAutomation(): Promise<void> {
    if (!this.isRunning) return;
    this.isRunning = false;
    await this.cleanup();
  }

  private async cleanup(): Promise<void> {
    try {
      await sessionManager.closeActiveSessions();
      this.page = null;
      this.browser = null;
      this.stepExecutor = null;
    } catch { }
  }

  isAutomationRunning(): boolean { return this.isRunning; }

  getAutomationStatus(): { running: boolean; duration: number } {
    return { running: this.isRunning, duration: this.isRunning ? Date.now() - this.startTime : 0 };
  }
}

export const automationEngine = new AutomationEngine();