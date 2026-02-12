import { BrowserContext, chromium, firefox, webkit } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { sessionLogger } from '../../config/logger';

const execAsync = promisify(exec);

import { AppPaths } from '../../core/utils/AppPaths';

// Função para garantir que os browsers do Playwright estejam instalados
async function ensurePlaywrightBrowsers(): Promise<void> {
  // Define o caminho customizado para os browsers
  const browsersPath = AppPaths.getBrowsersPath();
  process.env.PLAYWRIGHT_BROWSERS_PATH = browsersPath;

  // MIGRACAO: Se o browser novo não existe mas o antigo existe, migra!
  const oldBrowsersPath = path.join(process.cwd(), 'app/storage/browsers');
  if (!fs.existsSync(browsersPath) && fs.existsSync(oldBrowsersPath)) {
    sessionLogger.info(`[MIGRAÇÃO] Detectado browsers no local antigo (${oldBrowsersPath}). Movendo para novo local...`);
    fs.mkdirSync(path.dirname(browsersPath), { recursive: true });
    fs.renameSync(oldBrowsersPath, browsersPath);
    sessionLogger.info('[MIGRAÇÃO] Browsers movidos com sucesso para AppData');
  }

  try {
    // Tenta lançar o Chromium para verificar se está instalado no caminho customizado
    const browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    await browser.close();
    sessionLogger.info('Playwright Chromium encontrado e funcional');
  } catch (error: any) {
    sessionLogger.warn('Playwright Chromium não encontrado ou corrompido. Iniciando auto-instalação...', error.message);

    try {
      // Cria a pasta de browsers se não existir
      if (!fs.existsSync(browsersPath)) {
        fs.mkdirSync(browsersPath, { recursive: true });
      }

      sessionLogger.info(`Instalando browsers em: ${browsersPath}`);

      // Comando para instalar apenas o chromium no caminho definido
      const installCmd = `npx playwright install chromium`;

      // Executa a instalação
      await execAsync(installCmd, {
        env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: browsersPath }
      });

      sessionLogger.info('Playwright Chromium instalado com sucesso via auto-instalação');
    } catch (installError: any) {
      sessionLogger.error('Falha crítica na auto-instalação do Playwright:', installError.message);

      if (process.resourcesPath) {
        sessionLogger.error('Ambiente empacotado detectado - falha ao instalar browsers dinamicamente.');
      }

      throw new Error(`Não foi possível inicializar o motor de navegação: ${installError.message}`);
    }
  }
}

export class SessionManager {
  private profilesDir: string;
  private activeSessions: Map<string, BrowserContext> = new Map();

  constructor() {
    // Garante que os browsers do Playwright estejam disponíveis
    ensurePlaywrightBrowsers().catch(error => {
      sessionLogger.error('Erro crítico ao verificar Playwright browsers:', error.message);
    });

    // Pasta onde os perfis reais (Chrome Profiles) serão salvos
    this.profilesDir = AppPaths.getProfilesPath();

    // MIGRACAO: Se os perfis novos não existem mas os antigos existem, migra!
    const oldProfilesDir = path.join(process.cwd(), 'app/storage/profiles');
    if (!fs.existsSync(this.profilesDir) && fs.existsSync(oldProfilesDir)) {
      sessionLogger.info(`[MIGRAÇÃO] Detectado perfis no local antigo (${oldProfilesDir}). Movendo para novo local...`);
      fs.mkdirSync(path.dirname(this.profilesDir), { recursive: true });
      fs.renameSync(oldProfilesDir, this.profilesDir);
      sessionLogger.info('[MIGRAÇÃO] Perfis movidos com sucesso para AppData');
    }

    this.ensureProfilesDir();
  }

  private ensureProfilesDir(): void {
    if (!fs.existsSync(this.profilesDir)) {
      fs.mkdirSync(this.profilesDir, { recursive: true });
      sessionLogger.info(`Diretório de perfis criado: ${this.profilesDir}`);
    }
  }

  /**
   * Obtém ou cria uma sessão persistente para um site específico.
   * Utiliza 'launchPersistentContext' para manter cookies, cache e IndexedDB.
   */
  async getSession(siteId: string, headless: boolean = true): Promise<BrowserContext> {
    // 1. Verifica se já existe uma sessão ativa em memória
    if (this.activeSessions.has(siteId)) {
      sessionLogger.debug(`Reutilizando contexto ativo em memória para: ${siteId}`);
      return this.activeSessions.get(siteId)!;
    }

    // 2. Define o caminho do perfil para este site
    const userDataDir = path.join(this.profilesDir, siteId);

    sessionLogger.info(`Iniciando contexto persistente para ${siteId} em: ${userDataDir}`);

    // 3. Lança o navegador com o perfil persistente
    // Nota: PersistentContext já gerencia o Browser internamente
    const context = await chromium.launchPersistentContext(userDataDir, {
      headless,
      viewport: null, // Deixa o site ser responsivo à janela
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--start-maximized',
        '--disable-blink-features=AutomationControlled', // Ajuda a evitar detecção de robô
        '--disable-features=VizDisplayCompositor', // Ajuda a evitar problemas com CEF
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-zygote',
        '--disable-gpu'
      ]
    });

    this.activeSessions.set(siteId, context);
    return context;
  }

  /**
   * Fecha uma sessão ativa e a remove da memória (o perfil em disco continua salvo)
   */
  async closeSession(siteId: string): Promise<void> {
    const context = this.activeSessions.get(siteId);
    if (context) {
      sessionLogger.info(`Fechando sessão ativa de: ${siteId}`);
      await context.close();
      this.activeSessions.delete(siteId);
    }
  }

  /**
   * Fecha todas as sessões ativas
   */
  async closeActiveSessions(): Promise<void> {
    sessionLogger.info('Encerrando todos os contextos de navegador ativos...');

    for (const [siteId, context] of this.activeSessions) {
      try {
        await context.close();
      } catch (e) { }
    }

    this.activeSessions.clear();
  }

  /**
   * Remove completamente o perfil de um site do disco
   */
  async deleteSession(siteId: string): Promise<void> {
    await this.closeSession(siteId);

    const userDataDir = path.join(this.profilesDir, siteId);
    if (fs.existsSync(userDataDir)) {
      try {
        // Remove recursivamente a pasta do perfil
        fs.rmSync(userDataDir, { recursive: true, force: true });
        sessionLogger.info(`Perfil em disco removido para: ${siteId}`);
      } catch (error: any) {
        sessionLogger.error(`Erro ao remover perfil físico de ${siteId}: ${error.message}`);
      }
    }
  }

  /**
   * Limpa todos os perfis do sistema
   */
  async clearAllSessions(): Promise<void> {
    await this.closeActiveSessions();

    if (fs.existsSync(this.profilesDir)) {
      try {
        fs.rmSync(this.profilesDir, { recursive: true, force: true });
        this.ensureProfilesDir();
        sessionLogger.info('Todos os perfis de navegação foram limpos');
      } catch (error: any) {
        sessionLogger.error(`Erro ao limpar pasta de perfis: ${error.message}`);
      }
    }
  }

  /**
   * Obtém status simplificado dos perfis
   */
  getSessionStatus(): { active: number; persisted: number } {
    const persistedCount = fs.existsSync(this.profilesDir)
      ? fs.readdirSync(this.profilesDir).length
      : 0;

    return {
      active: this.activeSessions.size,
      persisted: persistedCount
    };
  }

  /**
   * Método legado mantido para compatibilidade, mas agora desnecessário
   * pois o persistentContext salva automaticamente no disco.
   */
  async saveSession(siteId: string, context: BrowserContext): Promise<void> {
    sessionLogger.debug(`PersistentContext gerencia o salvamento automático para ${siteId}`);
  }
}

export const sessionManager = new SessionManager();