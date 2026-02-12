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
  presetName?: string; // NOVO: Nome do preset para auditoria
  stepsExecuted: number;
  duration: number;
  errorMessage?: string;
  errorScreenshot?: string;
  downloads?: string[];
  identity?: { tipo: string; period: string }; // SSP: Identidade do lote
  sspResult?: {
    added: number;
    removed: number;
    currentRows: number;
    currentFile: string;
    deletedFile: string;
    isValid: boolean;
    uf: string;
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

    // Timeout Global: 2 horas (em milisegundos)
    const GLOBAL_TIMEOUT = 2 * 60 * 60 * 1000;

    // Timer para forçar a parada se exceder o tempo limite
    const timeoutHandle = setTimeout(async () => {
      if (this.isRunning) {
        automationLogger.error(`[CRÍTICO] Automação excedeu o tempo limite global de 2 horas. Forçando encerramento para liberar recursos.`);
        await this.stopAutomation();
      }
    }, GLOBAL_TIMEOUT);

    try {
      automationLogger.info('Limpando sessões anteriores para garantir modo de visibilidade correto');
      await sessionManager.closeActiveSessions();

      automationLogger.info('Iniciando motor de automação');

      let sitesToRun: SiteConfig[] = [];

      // Se houver um preset, usa as configurações dele (ISOLADO)
      if (options.presetId) {
        currentPreset = presetRepository.getById(options.presetId);
        if (!currentPreset) throw new Error(`Preset não encontrado: ${options.presetId}`);

        automationLogger.info(`Usando preset: ${currentPreset.name}`);

        // Sites agora são diretamente do preset (isolamento completo)
        sitesToRun = currentPreset.sites || [];

        if (sitesToRun.length === 0) {
          automationLogger.warn(`Preset "${currentPreset.name}" não possui sites configurados`);
          throw new Error('Nenhum site configurado neste Preset. Configure sites na aba "Sites e Ações"');
        }
      } else {
        // Modo legado: execução sem preset (busca em todos os presets)
        const allSites = configManager.getSites();
        sitesToRun = options.siteIds
          ? allSites.filter(site => options.siteIds?.includes(site.id))
          : allSites;
      }

      if (sitesToRun.length === 0) {
        automationLogger.error('Nenhum site encontrado para os IDs/Presets fornecidos.');
        throw new Error('Nenhum site configurado ou vinculado para este Preset');
      }

      automationLogger.info(`Sites a serem processados: ${sitesToRun.map(s => s.name).join(', ')}`);

      const config = configManager.getConfig();
      const headless = config.headless !== undefined ? config.headless : true;

      // Processa cada site
      for (const site of sitesToRun) {
        try {
          // Se houver um preset, injeta as credenciais dele no site temporariamente
          const siteWithCredentials = { ...site };
          if (currentPreset) {
            siteWithCredentials.credentials = {
              username: currentPreset.login,
              password: currentPreset.password
            };
          }

          // Prioridade para a pasta de destino: Site Config > Preset
          let targetPath = siteWithCredentials.downloadPath || currentPreset?.destination;

          // CORREÇÃO AUTOMÁTICA DE PASTAS (Issue #RelatoriosPedidos)
          // Se estiver usando o destino do Preset (downloadPath vazio) E for um relatório tipado,
          // cria automaticamente a subpasta [UF]-[Tipo] (ex: SC-Pedidos)
          if (!siteWithCredentials.downloadPath && currentPreset?.destination && site.reportType) {
            const reportSuffix = site.reportType.charAt(0).toUpperCase() + site.reportType.slice(1).toLowerCase() + 's';
            const folderName = `${site.uf || 'XX'}-${reportSuffix}`;
            targetPath = path.join(currentPreset.destination, folderName);
            automationLogger.info(`[Auto-Folder] Redirecionando ${site.name} para subpasta gerada: ${targetPath}`);
          }

          const result = await this.processSite(siteWithCredentials, targetPath);

          // Injeta o nome do Preset no resultado (se disponível)
          if (currentPreset) {
            result.presetName = currentPreset.name;
          }

          results.push(result);

          // NOVO: Emite evento de site concluído individualmente para a UI atualizar a tabela em tempo real
          const webContents = BrowserWindow.getAllWindows()[0]?.webContents;
          if (webContents) {
            webContents.send('site-complete', result);
          }
        } catch (error: any) {
          automationLogger.error(`Falha ao processar site ${site.name}: ${error.message}`);

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
            presetName: currentPreset?.name, // Injeta também no erro
            stepsExecuted: 0,
            duration: 0,
            errorMessage: error.message,
            errorScreenshot: screenshotPath
          };

          results.push(result);

          // Avisa a UI sobre a falha para atualizar a tabela
          const webContents = BrowserWindow.getAllWindows()[0]?.webContents;
          if (webContents) {
            webContents.send('site-complete', result);
          }
        } finally {
          // NOVO: Limpeza individual de janela para não acumular processos
          // Agora fecha SEMPRE, mesmo em modo visível, para garantir a saúde do sistema 24/7
          await sessionManager.closeSession(site.id);
        }
      }

      // Consolidação: usa destino do preset ou infere pasta pai comum dos arquivos (ex.: Pedidos sem destination)
      const destinationDir = currentPreset?.destination || this.inferConsolidationDestination(results);
      if (destinationDir) {
        try {
          automationLogger.info(`[Consolidator] Iniciando consolidação mestre para o preset: ${currentPreset?.name ?? 'execução'} em ${destinationDir}`);
          const masterResults = await consolidator.consolidate(results, destinationDir, currentPreset?.type);
          if (masterResults.current) {
            automationLogger.info(`[Consolidator] Master Snapshots: ${masterResults.current}`);
          }
          if (masterResults.deleted) {
            automationLogger.info(`[Consolidator] Master Excluídos: ${masterResults.deleted}`);
          }
        } catch (consError: any) {
          automationLogger.error(`[Consolidator] Falha na consolidação: ${consError.message}`);
        }
      } else if (currentPreset && results.some(r => r.success && r.sspResult)) {
        automationLogger.warn(`[Consolidator] Preset "${currentPreset.name}" sem pasta de destino e não foi possível inferir. Defina "Destino" no preset para gerar o consolidado.`);
      }

      if (currentPreset?.id) {
        presetRepository.markAsUsed(currentPreset.id);
      }

      return results;
    } finally {
      // Limpa o timer global para não disparar após o término legítimo
      clearTimeout(timeoutHandle);

      // Limpeza final de recursos (Garanti que nada fique aberto)
      await this.cleanup();

      this.isRunning = false;
      automationLogger.info('Motor de automação finalizado');

      // NOVO: Envia resumo por e-mail ao final de tudo
      if (currentPreset) {
        notificationService.sendAutomationSummary(currentPreset.name, results).catch((err: Error) => {
          automationLogger.error(`[Notification] Erro ao disparar resumo: ${err.message}`);
        });
      }
    }
  }

  /**
   * Infere a pasta de consolidação quando o preset não tem destination (ex.: Pedidos).
   * Retorna a pasta pai comum dos currentFile dos resultados com sspResult.
   */
  private inferConsolidationDestination(results: AutomationResult[]): string | null {
    const paths = results
      .filter((r): r is AutomationResult & { sspResult: NonNullable<AutomationResult['sspResult']> } =>
        r.success && !!r.sspResult?.currentFile)
      .map(r => path.normalize(r.sspResult!.currentFile));
    if (paths.length === 0) return null;
    const dirs = Array.from(new Set(paths.map(p => path.dirname(p))));

    // Se todos os resultados estão em subpastas de um mesmo pai (ex: Pedidos/RO-Pedidos, Pedidos/BA-Pedidos)
    // a função deve retornar o pai comum (Pedidos).
    if (dirs.length > 0) {
      const parts = dirs[0].split(path.sep).filter(Boolean);
      for (let i = parts.length; i >= 1; i--) {
        const candidate = parts.slice(0, i).join(path.sep);
        // Verifica se todas as pastas de resultados começam com o candidato
        if (dirs.every(d => d === candidate || d.startsWith(candidate + path.sep))) {
          // Se o candidato termina em uma pasta de site (ex: RO-Pedidos), subimos mais um nível se possível
          const isSiteFolder = /^[A-Z]{2}-/.test(path.basename(candidate));
          if (isSiteFolder && i > 1) {
            return parts.slice(0, i - 1).join(path.sep);
          }
          return candidate;
        }
      }
    }
    return null;
  }

  /**
   * Processa um site específico
   */
  private async processSite(site: SiteConfig, customBasePath?: string): Promise<AutomationResult> {
    const siteStartTime = Date.now();

    // Validação de Segurança SSP: Se houver tipo de relatório, PRECISA de chaves primárias
    if (site.reportType && (!site.primaryKeys || site.primaryKeys.length === 0)) {
      throw new Error(`Configuração Inválida: O site "${site.name}" usa auditoria (SSP), mas as colunas identificadoras não foram informadas. A automação foi bloqueada por segurança.`);
    }

    let stepsExecuted = 0;
    const downloads: string[] = [];

    automationLogger.info(`Processando site: ${site.name} (${site.url})`);

    try {
      // Obtém configuração atual
      const config = configManager.getConfig();
      const headless = config.headless !== undefined ? config.headless : true;

      this.emitProgress({
        siteId: site.id,
        siteName: site.name,
        currentStep: 0,
        totalSteps: site.steps.length,
        stepType: 'goto',
        message: `🌐 Abrindo navegador (${headless ? 'Modo Invisível' : 'Modo Visível'})...`,
        percentage: 0
      });

      // Obtém ou cria sessão
      const context = await sessionManager.getSession(
        site.id,
        headless
      );

      // Força a criação de uma página e navegação inicial para garantir visibilidade
      let page = context.pages()[0];
      if (!page) {
        automationLogger.debug('Criando nova página no contexto');
        page = await context.newPage();
      }

      // Se estiver em modo visível, traz a janela para frente (implícito ao navegar)
      if (!headless) {
        await page.goto('about:blank');
      }

      // Realiza login se necessário
      const loginNeeded = !(await this.isAlreadyLoggedIn(page, site));
      if (loginNeeded) {
        automationLogger.info(`Login necessário para ${site.name}`);
        const loginResult = await loginHandler.performLogin(
          site,
          context,
          headless
        );

        if (!loginResult.success) {
          throw new Error(`Falha no login: ${loginResult.errorMessage}`);
        }
      }

      // Cria executor de steps (Mínimo de 60s de timeout para estabilidade em sites lentos)
      this.stepExecutor = new StepExecutor(
        page,
        site,
        Math.max(config.defaultTimeout || 30000, 60000),
        config.defaultRetries || 3,
        config.actionDelay || 1000,
        customBasePath
      );

      // Executa steps do site
      if (site.steps.length === 0) {
        automationLogger.warn(`O site ${site.name} não possui passos (Workflow) configurados.`);
        this.emitProgress({
          siteId: site.id,
          siteName: site.name,
          currentStep: 0,
          totalSteps: 0,
          stepType: 'waitFor',
          message: '⚠️ Nenhum passo configurado no Workflow',
          percentage: 100
        });
      }

      for (let i = 0; i < site.steps.length; i++) {
        const step = site.steps[i];

        // Verifica se sessão expirou durante a execução
        if (await loginHandler.checkSessionExpired(page, site)) {
          automationLogger.warn(`Sessão expirada durante execução em ${site.name}`);

          // Valida se o contexto ainda está aberto antes de tentar reautenticar
          if (!context || context.pages().length === 0) {
            automationLogger.error('Contexto do navegador foi fechado. Impossível continuar.');
            throw new Error('Contexto do navegador foi fechado durante a sessão. A automação precisa ser reiniciada.');
          }

          const reauthResult = await loginHandler.reauthenticate(
            site,
            context,
            headless
          );

          if (!reauthResult.success) {
            automationLogger.error(`Reautenticação falhou: ${reauthResult.errorMessage}`);
            throw new Error(`Falha na reautenticação: ${reauthResult.errorMessage}. Reinicie a automação em modo visível se necessário.`);
          }

          automationLogger.info('Reautenticação bem-sucedida. Continuando automação...');

          // Atualiza referência da página após reautenticação
          page = context.pages()[0];
        }

        // Emite progresso
        this.emitProgress({
          siteId: site.id,
          siteName: site.name,
          currentStep: i + 1,
          totalSteps: site.steps.length,
          stepType: step.type,
          message: `Executando ${step.type}`,
          percentage: Math.round(((i + 1) / site.steps.length) * 100)
        });

        await this.stepExecutor.executeStep(step);
        stepsExecuted++;
      }

      const duration = Date.now() - siteStartTime;
      const sspData = this.stepExecutor.getLastDiffResult();
      const currentPeriod = this.stepExecutor.getCurrentPeriod();

      automationLogger.info(`Site ${site.name} processado com sucesso em ${duration}ms`);

      return {
        success: true,
        siteId: site.id,
        siteName: site.name,
        stepsExecuted,
        duration,
        downloads,
        identity: site.reportType ? {
          tipo: site.reportType,
          period: currentPeriod
        } : undefined,
        sspResult: sspData ? {
          added: sspData.added,
          removed: sspData.removed,
          currentRows: sspData.currentRows,
          currentFile: sspData.currentFile,
          deletedFile: sspData.deletedFile,
          isValid: true,
          uf: sspData.uf
        } : undefined
      };

    } catch (error: any) {
      const duration = Date.now() - siteStartTime;

      automationLogger.error(`Falha no site ${site.name}: ${error.message}`);

      // Emite o erro para a UI aparecer no log
      this.emitProgress({
        siteId: site.id,
        siteName: site.name,
        currentStep: stepsExecuted,
        totalSteps: site.steps.length,
        stepType: 'waitFor',
        message: `❌ ERRO: ${error.message}`,
        percentage: 100
      });

      return {
        success: false,
        siteId: site.id,
        siteName: site.name,
        stepsExecuted,
        duration,
        errorMessage: error.message,
        downloads
      };
    }
  }

  /**
   * Verifica se já está logado em um site
   */
  private async isAlreadyLoggedIn(page: Page, site: SiteConfig): Promise<boolean> {
    try {
      // Verifica elementos que indicam estado de login
      const logoutSelectors = [
        'a[href*="logout"]',
        'button:has-text("Sair")',
        '.user-menu',
        '[data-testid="user-profile"]'
      ];

      for (const selector of logoutSelectors) {
        // isVisible não aceita timeout como segundo argumento no Playwright
        const isVisible = await page.locator(selector).isVisible().catch(() => false);
        if (isVisible) {
          return true;
        }
      }

      return false;
    } catch {
      return false;
    }
  }

  /**
   * Abre o navegador em modo visível para login manual ou resolução de captcha
   */
  async openBrowserForLogin(siteId: string): Promise<{ success: boolean }> {
    if (this.isRunning) {
      throw new Error('Não é possível abrir o navegador manual enquanto uma automação está rodando.');
    }

    const site = configManager.getSiteById(siteId);
    if (!site) throw new Error(`Site não encontrado: ${siteId}`);

    automationLogger.info(`Abrindo navegador manual para: ${site.name}`);

    try {
      // Fecha sessões anteriores para evitar conflito de trava de perfil (lock)
      await sessionManager.closeActiveSessions();

      // Abre em modo visível (headless: false)
      const context = await sessionManager.getSession(siteId, false);
      const page = context.pages()[0] || await context.newPage();

      await page.goto(site.loginUrl);

      // Aguarda o fechamento da janela ou do contexto pelo usuário
      return new Promise((resolve) => {
        context.on('close', () => {
          automationLogger.info(`Navegador manual fechado para: ${site.name}`);
          resolve({ success: true });
        });

        // Fallback caso a página seja fechada mas o contexto demore
        page.on('close', async () => {
          await context.close();
        });
      });

    } catch (error: any) {
      automationLogger.error(`Erro ao abrir navegador manual: ${error.message}`);
      throw error;
    }
  }

  /**
   * Inicializa o navegador
   */
  private async initializeBrowser(headless: boolean = true): Promise<void> {
    automationLogger.debug('Inicializando navegador');

    this.browser = await chromium.launch({
      headless,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu'
      ]
    });

    const context = await this.browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    });

    this.page = await context.newPage();
    automationLogger.debug('Navegador inicializado com sucesso');
  }

  /**
   * Emite evento de progresso (para integração com UI)
   */
  private emitProgress(progress: AutomationProgress): void {
    automationLogger.debug(`Progresso: ${progress.message} (${progress.percentage}%)`);

    // Envia o progresso para todas as janelas do Electron
    const windows = BrowserWindow.getAllWindows();
    windows.forEach(win => {
      win.webContents.send('automation-progress', progress);
    });
  }

  /**
   * Para a automação em execução
   */
  async stopAutomation(): Promise<void> {
    if (!this.isRunning) {
      automationLogger.warn('Automação não está em execução');
      return;
    }

    automationLogger.info('Parando automação...');
    this.isRunning = false;

    await this.cleanup();
  }

  /**
   * Limpa recursos
   */
  private async cleanup(): Promise<void> {
    try {
      await sessionManager.closeActiveSessions();

      this.page = null;
      this.browser = null;
      this.stepExecutor = null;
      automationLogger.debug('Recursos limpos');
    } catch (error: any) {
      automationLogger.error(`Erro na limpeza: ${error.message}`);
    }
  }

  /**
   * Verifica se a automação está em execução
   */
  isAutomationRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Obtém status da automação
   */
  getAutomationStatus(): {
    running: boolean;
    duration: number;
  } {
    return {
      running: this.isRunning,
      duration: this.isRunning ? Date.now() - this.startTime : 0
    };
  }
}

// Exporta instância singleton
export const automationEngine = new AutomationEngine();