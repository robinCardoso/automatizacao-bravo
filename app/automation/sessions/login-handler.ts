import { Page, BrowserContext } from 'playwright';
import { sessionManager } from './session-manager';
import { configManager, SiteConfig } from '../../config/config-manager';
import { sessionLogger, automationLogger } from '../../config/logger';

export interface LoginResult {
  success: boolean;
  requiresManual: boolean;
  errorMessage?: string;
  sessionId?: string;
}

export class LoginHandler {
  private static instance: LoginHandler;

  private constructor() { }

  public static getInstance(): LoginHandler {
    if (!LoginHandler.instance) {
      LoginHandler.instance = new LoginHandler();
    }
    return LoginHandler.instance;
  }

  /**
   * Realiza login automático ou solicita login manual
   */
  async performLogin(site: SiteConfig, context: BrowserContext, headless: boolean = true): Promise<LoginResult> {
    sessionLogger.info(`Iniciando processo de login para: ${site.name}`);

    try {
      // Valida contexto antes de tentar criar página
      if (!context || context.pages().length === 0) {
        throw new Error('Contexto do navegador inválido ou fechado');
      }

      const page = context.pages()[0] || await context.newPage();

      // Navega para a página de login (Usa 'domcontentloaded' para evitar travamento)
      await page.goto(site.loginUrl, { waitUntil: 'domcontentloaded' });
      sessionLogger.debug(`Navegou para: ${site.loginUrl}`);

      // Verifica se já está logado
      if (await this.isAlreadyLoggedIn(page, site)) {
        sessionLogger.info(`Usuário já está logado em ${site.name}`);
        return { success: true, requiresManual: false };
      }

      // Tenta login automático
      const autoLoginResult = await this.attemptAutoLogin(page, site);
      if (autoLoginResult.success) {
        sessionLogger.info(`Login automático bem-sucedido para ${site.name}`);
        return autoLoginResult;
      }

      // Se login automático falhar, verifica se é por captcha
      if (await this.isCaptchaDetected(page)) {
        sessionLogger.warn(`Captcha ou desafio detectado para ${site.name}.`);
        if (headless) {
          throw new Error('CAPTCHA detectado em modo invisível. Por favor, execute uma vez em modo visível para resolver o desafio.');
        }
        return await this.performManualLogin(page, site);
      }

      // Outro tipo de falha no login automático
      sessionLogger.error(`Login automático falhou para ${site.name}: ${autoLoginResult.errorMessage}`);
      return autoLoginResult;

    } catch (error: any) {
      sessionLogger.error(`Erro no processo de login para ${site.name}: ${error.message}`);
      return {
        success: false,
        requiresManual: false,
        errorMessage: error.message
      };
    }
  }

  /**
   * Verifica se o usuário já está logado
   */
  private async isAlreadyLoggedIn(page: Page, site: SiteConfig): Promise<boolean> {
    try {
      // Verifica elementos que indicam estado de login
      // Isso pode variar por site - configurável
      const logoutSelectors = [
        'a[href*="logout"]',
        'button:has-text("Sair")',
        '.user-menu',
        '[data-testid="user-profile"]'
      ];

      for (const selector of logoutSelectors) {
        if (await page.isVisible(selector, { timeout: 5000 }).catch(() => false)) {
          return true;
        }
      }

      return false;
    } catch {
      return false;
    }
  }

  /**
   * Tenta realizar login automático
   */
  private async attemptAutoLogin(page: Page, site: SiteConfig): Promise<LoginResult> {
    try {
      // Obtém credenciais
      const credentials = await this.getCredentials(site);
      if (!credentials) {
        return {
          success: false,
          requiresManual: true,
          errorMessage: 'Credenciais não encontradas'
        };
      }

      sessionLogger.debug('Preenchendo formulário de login');
      const delay = configManager.getConfig().actionDelay || 1000;

      // Preenche campos de usuário e senha
      await page.fill(site.usernameField, credentials.username, { timeout: 10000 });
      await page.waitForTimeout(delay);

      await page.fill(site.passwordField, credentials.password, { timeout: 10000 });
      await page.waitForTimeout(delay);

      // Clica no botão de login
      await page.click(site.loginButton, { timeout: 10000 });

      // Aguarda redirecionamento ou carregamento básico
      // 'load' é mais resiliente que 'networkidle' para sites com analytics/background constante
      await page.waitForLoadState('load', { timeout: 20000 }).catch(() => {
        sessionLogger.warn(`Timeout aguardando 'load' completo em ${site.name}, tentando prosseguir...`);
      });

      // Verifica se o login foi bem-sucedido
      if (await this.isLoginSuccessful(page, site)) {
        sessionLogger.debug('Login automático validado com sucesso');
        return { success: true, requiresManual: false };
      } else {
        throw new Error('Login falhou - credenciais inválidas ou página de erro');
      }

    } catch (error: any) {
      return {
        success: false,
        requiresManual: false,
        errorMessage: error.message
      };
    }
  }

  /**
   * Verifica se o login foi bem-sucedido
   */
  private async isLoginSuccessful(page: Page, site: SiteConfig): Promise<boolean> {
    try {
      // Verifica URL após login
      const currentUrl = page.url();
      if (currentUrl.includes('login') || currentUrl.includes('signin')) {
        return false;
      }

      // Verifica elementos de sucesso
      const successIndicators = [
        'a[href*="logout"]',
        '.dashboard',
        '[data-testid="welcome"]',
        'h1:has-text("Bem-vindo")'
      ];

      for (const selector of successIndicators) {
        if (await page.isVisible(selector, { timeout: 5000 }).catch(() => false)) {
          return true;
        }
      }

      return false;
    } catch {
      return false;
    }
  }

  /**
   * Detecta presença de captcha
   */
  private async isCaptchaDetected(page: Page): Promise<boolean> {
    const captchaSelectors = [
      '[id*="captcha"]',
      '[class*="captcha"]',
      'iframe[src*="captcha"]',
      '[data-testid*="captcha"]',
      'img[alt*="captcha"]'
    ];

    for (const selector of captchaSelectors) {
      if (await page.isVisible(selector, { timeout: 3000 }).catch(() => false)) {
        return true;
      }
    }

    // Verifica texto relacionado a captcha
    const pageContent = await page.content();
    const captchaKeywords = ['captcha', 'não sou um robô', 'prova de humano'];

    return captchaKeywords.some(keyword =>
      pageContent.toLowerCase().includes(keyword)
    );
  }

  /**
   * Realiza login manual (com navegador visível)
   */
  private async performManualLogin(page: Page, site: SiteConfig): Promise<LoginResult> {
    try {
      sessionLogger.info('Aguardando intervenção manual do usuário para login/captcha...');

      // Mostra instruções no console/log
      automationLogger.info(`⚠️ AÇÃO REQUERIDA: Realize o login manualmente na janela do navegador para o site: ${site.name}`);

      // Aguarda o usuário logar (detectamos o sucesso via pooling de elementos indicadores)
      const maxWaitTime = 5 * 60 * 1000; // 5 minutos de espera máxima
      const startTime = Date.now();

      while (Date.now() - startTime < maxWaitTime) {
        if (await this.isLoginSuccessful(page, site)) {
          sessionLogger.info('Login manual detectado com sucesso!');
          return {
            success: true,
            requiresManual: true,
            sessionId: site.id
          };
        }
        await page.waitForTimeout(2000); // Verifica a cada 2 segundos
      }

      throw new Error('Tempo limite para login manual atingido (5 min).');

    } catch (error: any) {
      return {
        success: false,
        requiresManual: true,
        errorMessage: error.message
      };
    }
  }

  /**
   * Simula espera por confirmação do usuário
   * Em produção, isso seria substituído por IPC com Electron
   */
  private async waitForUserLoginConfirmation(): Promise<void> {
    // Em ambiente de teste, aguarda 30 segundos
    // Em produção, aguardaria sinal do usuário via UI
    return new Promise(resolve => {
      setTimeout(() => {
        sessionLogger.debug('Tempo limite de login manual atingido');
        resolve();
      }, 30000);
    });
  }

  /**
   * Obtém credenciais do keytar ou configuração
   * TODO: Implementar keytar para armazenamento seguro
   */
  private async getCredentials(site: SiteConfig): Promise<{ username: string; password: string } | null> {
    // 1. Prioridade para credenciais injetadas via Preset (Fase 6)
    if (site.credentials) {
      sessionLogger.debug(`Usando credenciais injetadas do Preset para ${site.name}`);
      return {
        username: site.credentials.username,
        password: site.credentials.password
      };
    }

    // 2. Fallback para credenciais dummy (em produção buscaria do keytar)
    sessionLogger.debug(`Usando credenciais padrão para ${site.name}`);
    return {
      username: 'usuario@teste.com',
      password: 'senha123'
    };
  }

  /**
   * Verifica se a sessão expirou durante a automação
   */
  async checkSessionExpired(page: Page, site: SiteConfig): Promise<boolean> {
    try {
      // Verifica redirecionamentos para PÁGINA de login (não apenas parâmetro)
      const currentUrl = page.url();
      const urlPath = new URL(currentUrl).pathname.toLowerCase();

      // Detecta se está em uma PÁGINA de login (não apenas parâmetro na query string)
      const isLoginPage = (
        urlPath.includes('/login') ||
        urlPath.includes('/signin') ||
        urlPath.includes('/authenticate') ||
        urlPath.endsWith('/login.php') ||
        urlPath.endsWith('/signin.php')
      );

      if (isLoginPage) {
        sessionLogger.debug(`Sessão expirada detectada - redirecionado para: ${currentUrl}`);
        return true;
      }

      // Verifica elementos que indicam sessão expirada
      const expiredIndicators = [
        ':has-text("sessão expirada")',
        ':has-text("faça login novamente")',
        ':has-text("sua sessão foi encerrada")',
        ':has-text("por favor, faça login")',
        '[data-testid="session-expired"]'
      ];

      for (const selector of expiredIndicators) {
        if (await page.isVisible(selector, { timeout: 3000 }).catch(() => false)) {
          sessionLogger.debug(`Sessão expirada detectada - indicador visível: ${selector}`);
          return true;
        }
      }

      return false;
    } catch {
      return false;
    }
  }

  /**
   * Reautentica quando a sessão expira
   */
  async reauthenticate(site: SiteConfig, context: BrowserContext, headless: boolean = true): Promise<LoginResult> {
    sessionLogger.info(`Reautenticando para site: ${site.name}`);

    try {
      // Valida se o contexto ainda está aberto
      const isContextClosed = context.pages().length === 0;
      if (isContextClosed) {
        sessionLogger.error('Contexto do navegador foi fechado. Impossível reautenticar.');
        return {
          success: false,
          requiresManual: false,
          errorMessage: 'Contexto do navegador foi fechado. Reinicie a automação.'
        };
      }

      // Remove sessão expirada
      await sessionManager.deleteSession(site.id);

      // Realiza novo login
      return await this.performLogin(site, context, headless);
    } catch (error: any) {
      return {
        success: false,
        requiresManual: false,
        errorMessage: `Falha na reautenticação: ${error.message}`
      };
    }
  }
}

// Exporta instância singleton
export const loginHandler = LoginHandler.getInstance();