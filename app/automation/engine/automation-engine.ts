import * as path from 'path';
import { consolidator } from '../../core/consolidation/Consolidator';
import { chromium, Browser, Page } from 'playwright';
import { BrowserWindow } from 'electron';
import { StepExecutor, Step } from './step-executor';
import { configManager, SiteConfig, Preset } from '../../config/config-manager';
import { notificationService } from '../../core/notifications/NotificationService';
import { automationLogger } from '../../config/logger';
import { sessionManager } from '../sessions/session-manager';
import { loginHandler, LoginResult } from '../sessions/login-handler';
import { presetRepository } from './preset-repository';
import { ErrorClassifier, FailureCategory } from './error-classifier';

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
  failureCategory?: FailureCategory;
  retryAttempt?: number;
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
  retryAttempt?: number;
}

export class AutomationEngine {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private stepExecutor: StepExecutor | null = null;
  private isRunning: boolean = false;
  private startTime: number = 0;

  constructor() { }

  /**
   * Abre o navegador em modo visível para login manual ou resolução de CAPTCHA
   */
  async openBrowserForLogin(siteId: string) {
    const site = configManager.getSites().find(s => s.id === siteId);
    if (!site) throw new Error('Site não encontrado');

    automationLogger.info(`Abrindo navegador para login manual: ${site.name}`);

    try {
      // Abre sessão em modo visível (headless: false)
      const context = await sessionManager.getSession(site.id, false);
      const page = context.pages()[0] || await context.newPage();

      await page.goto(site.loginUrl, { waitUntil: 'domcontentloaded' });

      // O loginHandler em modo não-headless tentará auto-login e depois cairá no manual se necessário
      return await loginHandler.performLogin(site, context, false);
    } catch (error: any) {
      automationLogger.error(`Erro ao abrir navegador para login: ${error.message}`);
      throw error;
    }
  }


  /**
   * Inicia o processo de automação para um ou mais sites com suporte a re-tentativa inteligente
   */
  async runAutomation(options: AutomationOptions = {}): Promise<AutomationResult[]> {
    if (this.isRunning) {
      throw new Error('Automação já está em execução');
    }

    this.isRunning = true;
    this.startTime = Date.now();
    const resultsMap = new Map<string, AutomationResult>();
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

        if (options.siteIds && options.siteIds.length > 0) {
          sitesToRun = sitesToRun.filter(site => options.siteIds?.includes(site.id));
        }

        if (sitesToRun.length === 0) {
          throw new Error('Nenhum site selecionado ou configurado neste Preset');
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

      // --- FASE 1: PASSADA PRINCIPAL ---
      automationLogger.info(`[Fase 1] Iniciando processamento principal de ${sitesToRun.length} sites`);
      await this.executePhase(sitesToRun, resultsMap, currentPreset, 0);

      // --- FASE 2: RE-TENTATIVA INTELIGENTE (DINÂMICO) ---
      const config = configManager.getConfig().automation || { enableSmartRetry: true, maxRetryPasses: 1, retryDelayMinutes: 5 };
      const maxRetries = config.enableSmartRetry ? config.maxRetryPasses : 0;
      const retryDelayMs = (config.retryDelayMinutes || 5) * 60 * 1000;

      let currentRetryPass = 1;
      while (this.isRunning && currentRetryPass <= maxRetries) {
        const failedRetryable = Array.from(resultsMap.values()).filter(r => 
          !r.success && ErrorClassifier.isRetryable(r.failureCategory!)
        );

        if (failedRetryable.length === 0) break;

        automationLogger.info(`[Fase de Recuperação] ${failedRetryable.length} sites falharam e são elegíveis para re-tentativa (Passada ${currentRetryPass}/${maxRetries}).`);
        automationLogger.info(`Aguardando cooldown de ${retryDelayMs / 1000}s antes da próxima tentativa...`);
        
        await this.wait(retryDelayMs);

        if (this.isRunning) {
          const sitesToRetry = sitesToRun.filter(s => failedRetryable.some(f => f.siteId === s.id));
          automationLogger.info(`[Fase de Recuperação] Iniciando re-tentativa de ${sitesToRetry.length} sites...`);
          await this.executePhase(sitesToRetry, resultsMap, currentPreset, currentRetryPass);
        }
        currentRetryPass++;
      }

      const finalResults = Array.from(resultsMap.values());

      if (currentPreset?.id) {
        presetRepository.markAsUsed(currentPreset.id);
      }

      return finalResults;
    } finally {
      clearTimeout(timeoutHandle);
      await this.cleanup();
      this.isRunning = false;
      automationLogger.info('Motor de automação finalizado');

      const finalResults = Array.from(resultsMap.values());
      if (currentPreset) {
        notificationService.sendAutomationSummary(currentPreset.name, finalResults).catch((err: Error) => {
          automationLogger.error(`[Notification] Erro ao disparar resumo: ${err.message}`);
        });
      }
    }
  }

  /**
   * Executa uma fase de automação (lote de sites)
   */
  private async executePhase(sites: SiteConfig[], resultsMap: Map<string, AutomationResult>, currentPreset: Preset | undefined, attempt: number) {
    const consolidationEvery = Number(process.env.CONSOLIDATION_EVERY_SITES || '0');

    for (let index = 0; index < sites.length; index++) {
      const site = sites[index];
      if (!this.isRunning) break;

      const prefix = attempt > 0 ? `[RETRY-Pass ${attempt}] ` : '';
      automationLogger.info(`${prefix}Processando site: ${site.name} (${index + 1}/${sites.length})`);

      try {
        const siteWithCredentials = { ...site };
        if (currentPreset) {
          siteWithCredentials.credentials = {
            username: currentPreset.login,
            password: currentPreset.password
          };
        }

        let targetPath = siteWithCredentials.downloadPath || currentPreset?.destination;

        if (!siteWithCredentials.downloadPath && currentPreset?.destination && site.reportType) {
          const reportSuffix = site.reportType.charAt(0).toUpperCase() + site.reportType.slice(1).toLowerCase() + 's';
          const folderName = `${site.uf || 'XX'}-${reportSuffix}`;
          targetPath = path.join(currentPreset.destination, folderName);
        }

        const result = await this.processSite(siteWithCredentials, targetPath, currentPreset, attempt);
        result.retryAttempt = attempt;
        if (currentPreset) result.presetName = currentPreset.name;

        // Atualiza ou insere o resultado no mapa (o sucesso de uma re-tentativa sobrescreve a falha anterior)
        resultsMap.set(site.id, result);

        const webContents = BrowserWindow.getAllWindows()[0]?.webContents;
        if (webContents) {
          webContents.send('site-complete', result);
        }
      } catch (error: any) {
        automationLogger.error(`${prefix}Falha crítica no site ${site.name}: ${error.message}`);

        let screenshotPath = '';
        try {
          if (this.stepExecutor) {
            screenshotPath = await this.stepExecutor.takeScreenshot(`error_${site.uf}`);
          }
        } catch (e) { }

        const failureCategory = await ErrorClassifier.classify(error, this.stepExecutor?.getPage());

        const result: AutomationResult = {
          success: false,
          siteId: site.id,
          siteName: site.name,
          presetName: currentPreset?.name,
          stepsExecuted: 0,
          duration: 0,
          errorMessage: error.message,
          errorScreenshot: screenshotPath,
          failureCategory,
          retryAttempt: attempt
        };

        resultsMap.set(site.id, result);

        const webContents = BrowserWindow.getAllWindows()[0]?.webContents;
        if (webContents) {
          webContents.send('site-complete', result);
        }
      } finally {
        await sessionManager.closeSession(site.id);
        
        // Consolidação incremental (usa o estado atual do resultsMap)
        if (consolidationEvery > 0 && (index + 1) % consolidationEvery === 0) {
          await this.triggerMasterConsolidation(Array.from(resultsMap.values()), currentPreset);
        }
      }
    }

    // Consolidação final da fase
    await this.triggerMasterConsolidation(Array.from(resultsMap.values()), currentPreset);
  }

  private async wait(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
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
        
        // Emite sinal para o dashboard atualizar em tempo real
        const webContents = BrowserWindow.getAllWindows()[0]?.webContents;
        if (webContents) {
          webContents.send('master-consolidated', { 
            type: currentPreset?.type, 
            file: masterResults.current 
          });
        }
      }

      if (global.gc) {
        automationLogger.debug('[Engine] Acionando Garbage Collector após consolidação...');
        global.gc();
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
    if (dirs.length > 0) return path.dirname(dirs[0]);
    return dirs[0];
  }

  private async processSite(site: SiteConfig, customBasePath?: string, currentPreset?: Preset, attempt: number = 0): Promise<AutomationResult> {
    const siteStartTime = Date.now();

    let resolvedPKs = currentPreset?.primaryKeys;

    if (!resolvedPKs || resolvedPKs.length === 0) {
      const globalSchema = configManager.getSchemaByType(currentPreset?.type || site.reportType || '');
      if (globalSchema && globalSchema.primaryKey) {
        resolvedPKs = globalSchema.primaryKey;
      }
    }

    if (site.reportType && (!resolvedPKs || resolvedPKs.length === 0)) {
      throw new Error(`Configuração Inválida: Colunas identificadoras não informadas para auditoria (Site/Preset/Global).`);
    }

    const stepsToRun = (currentPreset?.steps?.length)
      ? currentPreset.steps!
      : (site.steps || []);

    let stepsExecuted = 0;
    const downloads: string[] = [];

    try {
      const config = configManager.getConfig();
      const headless = config.headless !== undefined ? config.headless : true;

      this.emitProgress({
        siteId: site.id, siteName: site.name, currentStep: 0, totalSteps: stepsToRun.length,
        stepType: 'goto', message: `🌐 Abrindo navegador...`, percentage: 0
      }, attempt);

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
        () => !this.isRunning
      );

      for (let i = 0; i < stepsToRun.length; i++) {
        const step = stepsToRun[i];
        if (await loginHandler.checkSessionExpired(page, site)) {
          const reauthResult = await loginHandler.reauthenticate(site, context, headless);
          if (!reauthResult.success) throw new Error(`Sessão expirada e reautenticação falhou`);
          page = context.pages()[0];
        }

        this.emitProgress({
          siteId: site.id, siteName: site.name, currentStep: i + 1, totalSteps: stepsToRun.length,
          stepType: step.type, message: `Executando ${step.type}`,
          percentage: Math.round(((i + 1) / stepsToRun.length) * 100)
        }, attempt);

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
      const page = this.stepExecutor?.getPage();
      const failureCategory = await ErrorClassifier.classify(error, page);

      return {
        success: false, siteId: site.id, siteName: site.name, stepsExecuted,
        duration: Date.now() - siteStartTime,
        errorMessage: error.message,
        failureCategory
      };
    }
  }

  private async isAlreadyLoggedIn(page: Page, site: SiteConfig): Promise<boolean> {
    try {
      const logoutSelectors = ['a[href*="logout"]', 'button:has-text("Sair")', '.user-menu'];
      for (const selector of logoutSelectors) {
        if (await page.isVisible(selector, { timeout: 2000 }).catch(() => false)) return true;
      }
      return false;
    } catch { return false; }
  }

  private emitProgress(progress: AutomationProgress, attempt: number = 0) {
    const webContents = BrowserWindow.getAllWindows()[0]?.webContents;
    if (webContents) {
      if (attempt > 0) {
        progress.message = `[RE-TENTATIVA] ${progress.message}`;
        progress.retryAttempt = attempt;
      }
      webContents.send('automation-progress', progress);
    }
  }

  async stopAutomation() {
    this.isRunning = false;
    await this.cleanup();
  }

  private async cleanup() {
    await sessionManager.closeActiveSessions();
    this.browser = null;
    this.page = null;
    this.stepExecutor = null;
  }
}

export const automationEngine = new AutomationEngine();