import { Page } from '@playwright/test';
import { SelectorResolver } from './selector-resolver';
import { automationLogger } from '../../config/logger';
import { configManager } from '../../config/config-manager';
import * as fs from 'fs';
import * as path from 'path';
import { SiteConfig } from '../../config/config-manager';
import { resolveSnapshotFiles } from '../../policy/snapshot/FileNamingPolicy';
import { SnapshotIdentity } from '../../policy/snapshot/SnapshotContract';
import { snapshotPath } from '../../policy/snapshot/SnapshotPaths';
import { diffEngine, DiffResult } from '../../core/diff/DiffEngine';

// Tipos para os steps
export interface Step {
  type: 'goto' | 'click' | 'hover' | 'fill' | 'fillDateRange' | 'select' | 'waitFor' | 'download';
  selector?: string | string[];
  value?: string;
  timeout?: number;
  retries?: number;
  waitForNavigation?: boolean;
  downloadPath?: string;
  continueOnError?: boolean;
}

export class StepExecutor {
  private page: Page;
  private selectorResolver: SelectorResolver;
  private defaultTimeout: number;
  private defaultRetries: number;
  private actionDelay: number;
  private siteConfig: SiteConfig;
  private currentPeriod: string = 'GERAL'; // SSP: Período detectado durante a execução
  private customBasePath?: string;

  private lastDiffResult: (DiffResult & { currentFile: string, uf: string }) | null = null;

  constructor(page: Page, siteConfig: SiteConfig, defaultTimeout: number = 30000, defaultRetries: number = 3, actionDelay: number = 1000, customBasePath?: string) {
    this.page = page;
    this.siteConfig = siteConfig;
    this.defaultTimeout = defaultTimeout;
    this.defaultRetries = defaultRetries;
    this.actionDelay = actionDelay;
    this.customBasePath = configManager.resolvePath(customBasePath);
    this.selectorResolver = new SelectorResolver(page);

    // NOVO: Garante que a pasta base exista logo no início
    if (this.customBasePath) {
      const base = path.resolve(this.customBasePath);
      if (!fs.existsSync(base)) {
        automationLogger.debug(`[Auto-Folder] Criando pasta base: ${base}`);
        fs.mkdirSync(base, { recursive: true });
      }
    }
  }

  /**
   * Executa um único step
   */
  async executeStep(step: Step): Promise<void> {
    automationLogger.info(`Executando step: ${step.type}`);

    // Aplica delay entre ações se configurado
    if (this.actionDelay > 0) {
      automationLogger.debug(`Aguardando delay de ação: ${this.actionDelay}ms`);
      await this.page.waitForTimeout(this.actionDelay);
    }

    const timeout = step.timeout || this.defaultTimeout;
    const retries = step.retries || this.defaultRetries;

    try {
      switch (step.type) {
        case 'goto':
          await this.executeGoto(step, timeout);
          break;
        case 'click':
          await this.executeClick(step, timeout, retries);
          break;
        case 'hover':
          await this.executeHover(step, timeout, retries);
          break;
        case 'fill':
          await this.executeFill(step, timeout, retries);
          break;
        case 'fillDateRange':
          await this.executeFillDateRange(step, timeout, retries);
          break;
        case 'select':
          await this.executeSelect(step, timeout, retries);
          break;
        case 'waitFor':
          await this.executeWaitFor(step, timeout, retries);
          break;
        case 'download':
          await this.executeDownload(step, timeout, retries);
          break;
        default:
          throw new Error(`Tipo de step não suportado: ${step.type}`);
      }

      automationLogger.info(`Step executado com sucesso: ${step.type}`);
    } catch (error: any) {
      if (step.continueOnError) {
        automationLogger.warn(`[Soft-Fail] Step ${step.type} falhou, mas continueOnError=true. Ignorando erro: ${error.message}`);
        return;
      }
      automationLogger.error(`Falha no step ${step.type}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Retorna o último resultado de diff processado (usado pelo Engine)
   */
  getLastDiffResult() {
    return this.lastDiffResult;
  }

  /**
   * Retorna o período detectado (SSP)
   */
  getCurrentPeriod() {
    return this.currentPeriod;
  }

  async takeScreenshot(name: string): Promise<string> {
    const screenshotDir = path.join(process.cwd(), 'app', 'storage', 'screenshots');
    if (!fs.existsSync(screenshotDir)) {
      fs.mkdirSync(screenshotDir, { recursive: true });
    }
    const fileName = `${name}_${Date.now()}.png`;
    const filePath = path.join(screenshotDir, fileName);
    await this.page.screenshot({ path: filePath });
    return filePath;
  }

  private async executeGoto(step: Step, timeout: number): Promise<void> {
    if (!step.value) {
      throw new Error('Valor obrigatório para step goto');
    }

    automationLogger.debug(`Navegando para: ${step.value}`);
    await this.page.goto(step.value, {
      timeout,
      waitUntil: 'networkidle' // Alterado de 'domcontentloaded' para 'networkidle' para maior estabilidade
    });

    // Aguarda um pequeno tempo adicional para garantir que scripts de carregamento inicial rodem
    await this.page.waitForTimeout(2000);
  }

  private async executeClick(step: Step, timeout: number, retries: number): Promise<void> {
    if (!step.selector) {
      throw new Error('Seletor obrigatório para step click');
    }

    const element = await this.selectorResolver.resolveSelector(step.selector, retries);
    automationLogger.debug('Clicando no elemento');
    await element.click({ timeout });

    // Aguarda 200ms para garantir que eventos JS sejam processados
    await this.page.waitForTimeout(200);
  }

  private async executeHover(step: Step, timeout: number, retries: number): Promise<void> {
    if (!step.selector) {
      throw new Error('Seletor obrigatório para step hover');
    }

    const element = await this.selectorResolver.resolveSelector(step.selector, retries);
    automationLogger.debug('Passando o mouse no elemento');
    await element.hover({ timeout });
  }

  private async executeFill(step: Step, timeout: number, retries: number): Promise<void> {
    if (!step.selector) {
      throw new Error('Seletor obrigatório para step fill');
    }
    if (!step.value) {
      throw new Error('Valor obrigatório para step fill');
    }

    // Agora resolve tokens também no preenchimento comum
    const resolvedValue = this.resolveDateTokens(step.value);

    const element = await this.selectorResolver.resolveSelector(step.selector, retries);
    automationLogger.debug(`Preenchendo campo com: ${resolvedValue}`);
    await element.fill(resolvedValue, { timeout });
  }

  /**
   * Seleciona uma opção em um <select> dropdown
   */
  private async executeSelect(step: Step, timeout: number, retries: number): Promise<void> {
    if (!step.selector) {
      throw new Error('Seletor obrigatório para step select');
    }
    if (!step.value) {
      throw new Error('Valor obrigatório para step select (texto ou value da opção)');
    }

    const element = await this.selectorResolver.resolveSelector(step.selector, retries);
    automationLogger.debug(`Selecionando opção: ${step.value}`);

    // Tenta selecionar por texto (label) primeiro, depois por value
    try {
      await element.selectOption({ label: step.value }, { timeout });
    } catch {
      // Se falhar, tenta por value
      await element.selectOption({ value: step.value }, { timeout });
    }
  }


  private async executeFillDateRange(step: Step, timeout: number, retries: number): Promise<void> {
    if (!step.selector) {
      throw new Error('Seletor obrigatório para step fillDateRange');
    }
    if (!step.value) {
      throw new Error('Valor obrigatório para step fillDateRange (Ex: [MES_ATUAL] ou inicio,fim)');
    }

    // Resolve tokens dinâmicos de data (pode ser um range token como [MES_ATUAL] ou tokens individuais)
    const resolvedValue = this.resolveDateTokens(step.value);

    // Parse das datas
    let [startDate, endDate] = resolvedValue.split(',');

    // Se ainda houver tokens individuais (ex: "[INICIO_MES],[HOJE]"), resolve cada um
    if (startDate && startDate.startsWith('[')) startDate = this.resolveDateTokens(startDate.trim());
    if (endDate && endDate.startsWith('[')) endDate = this.resolveDateTokens(endDate.trim());

    // SSP: Atualiza o período atual baseado no valor original (token) ou datas resultantes
    this.updateCurrentPeriod(step.value, startDate, endDate);

    if (!startDate || !endDate) {
      throw new Error(`Formato de data inválido após resolução: ${resolvedValue}. Use: "inicio,fim"`);
    }

    const rawSelectors = Array.isArray(step.selector) ? step.selector : [step.selector];
    // Suporte a seletores separados por vírgula no campo único da UI
    const selectors = rawSelectors.length === 1 && typeof rawSelectors[0] === 'string'
      ? (rawSelectors[0] as string).split(',')
      : rawSelectors;

    // Preenche data inicial
    if (selectors[0]) {
      const startDateElement = await this.selectorResolver.resolveSelector(selectors[0].trim(), retries);
      const formattedStartDate = await this.formatDateForInput(startDateElement, startDate.trim());
      automationLogger.info(`[fillDateRange] Preenchendo data inicial: ${formattedStartDate}`);
      await startDateElement.fill(formattedStartDate, { timeout });

      // Delay de estabilidade entre campos para evitar congelamento da página
      await this.page.waitForTimeout(1000);
      await this.waitForPageStability();
    }

    // Preenche data final (se houver segundo seletor)
    if (selectors[1]) {
      const endDateElement = await this.selectorResolver.resolveSelector(selectors[1].trim(), retries);
      const formattedEndDate = await this.formatDateForInput(endDateElement, endDate.trim());
      automationLogger.info(`[fillDateRange] Preenchendo data final: ${formattedEndDate}`);
      await endDateElement.fill(formattedEndDate, { timeout });

      // Delay final pós preenchimento
      await this.page.waitForTimeout(1000);
      await this.waitForPageStability();
    }
  }

  /**
   * Aguarda a estabilidade da página após alterações de campo ou navegação
   */
  private async waitForPageStability(): Promise<void> {
    try {
      // Aguarda até que não haja mais requisições de rede por 1 segundo
      await this.page.waitForLoadState('networkidle', { timeout: 5000 });
    } catch {
      // Se o estado de rede não estabilizar, aguarda um tempo fixo como fallback
      await this.page.waitForTimeout(2000);
    }
  }

  /**
   * Verifica se a página está responsiva e não mostra indicadores de carregamento
   */
  private async verifyPageResponsiveness(timeout: number = 10000): Promise<boolean> {
    try {
      // Tenta verificar via JS se a página está pronta
      await this.page.waitForFunction(() => document.readyState === 'complete', { timeout });

      // Verifica por overlays de loading comuns que bloqueiam cliques
      const isLoading = await this.page.evaluate(() => {
        const loadingIndicators = [
          '.loading', '.spinner', '.progress', '[aria-busy="true"]',
          '.ui-loader', '.modal-backdrop', '.overlay', '.blocking-loader'
        ];
        return loadingIndicators.some(selector => {
          const el = document.querySelector(selector);
          if (!el) return false;
          const style = window.getComputedStyle(el);
          return style.display !== 'none' && style.visibility !== 'hidden' && parseFloat(style.opacity) > 0;
        });
      });

      return !isLoading;
    } catch {
      return false;
    }
  }

  /**
   * Formata data de acordo com o tipo de input
   * - type="date" → formato ISO (yyyy-mm-dd)
   * - type="text" ou outros → formato brasileiro (dd/mm/yyyy)
   */
  private async formatDateForInput(element: any, dateBR: string): Promise<string> {
    try {
      // Verifica se é input type="date"
      const inputType = await element.getAttribute('type');

      if (inputType === 'date') {
        // Converte DD/MM/YYYY → yyyy-mm-dd (com zeros para um dígito)
        const [day, month, year] = dateBR.split('/');
        return `${year}-${(month || '').padStart(2, '0')}-${(day || '').padStart(2, '0')}`;
      }

      // Para outros tipos, mantém formato brasileiro
      return dateBR;
    } catch {
      // Se falhar ao detectar tipo, mantém formato brasileiro
      return dateBR;
    }
  }

  /**
   * Formata data em DD/MM/YYYY com zeros à esquerda (evita interpretação errada no ERP).
   */
  private formatDateDDMMYYYY(d: Date): string {
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  }

  /**
   * Converte tokens como [MES_ATUAL] em strings de data reais "inicio,fim"
   */
  private resolveDateTokens(value: string): string {
    if (!value.startsWith('[')) return value;

    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();

    const formatDate = (d: Date) => this.formatDateDDMMYYYY(d);

    switch (value.toUpperCase()) {
      case '[HOJE]':
        return formatDate(now);

      case '[INICIO_MES]':
        return formatDate(new Date(year, month, 1));

      case '[INICIO_ANO]':
        return formatDate(new Date(year, 0, 1));

      case '[MES_ATUAL]':
        return `${formatDate(new Date(year, month, 1))},${formatDate(now)}`;

      case '[MES_ANTERIOR]':
        const firstDayPrev = new Date(year, month - 1, 1);
        const lastDayPrev = new Date(year, month, 0);
        return `${formatDate(firstDayPrev)},${formatDate(lastDayPrev)}`;

      case '[TRIM_ATUAL]':
        const currentTriStartMonth = Math.floor(month / 3) * 3;
        const currentTriEndMonth = currentTriStartMonth + 3;
        const currentTriStart = new Date(year, currentTriStartMonth, 1);
        const currentTriEnd = new Date(year, currentTriEndMonth, 0); // Último dia do tri atual
        automationLogger.debug(`[TRIM_ATUAL] Calculado: ${formatDate(currentTriStart)} até ${formatDate(currentTriEnd)}`);
        return `${formatDate(currentTriStart)},${formatDate(currentTriEnd)}`;

      case '[TRIM_ANTERIOR]':
        const prevTriStartMonth = (Math.floor(month / 3) * 3) - 3;
        const prevTriStart = new Date(year, prevTriStartMonth, 1); // JS trata mês negativo voltando ano automaticamente
        const prevTriEnd = new Date(year, prevTriStartMonth + 3, 0);
        automationLogger.debug(`[TRIM_ANTERIOR] Calculado: ${formatDate(prevTriStart)} até ${formatDate(prevTriEnd)}`);
        return `${formatDate(prevTriStart)},${formatDate(prevTriEnd)}`;

      case '[TRIM_1]': return `${formatDate(new Date(year, 0, 1))},${formatDate(new Date(year, 2, 31))}`;
      case '[TRIM_2]': return `${formatDate(new Date(year, 3, 1))},${formatDate(new Date(year, 5, 30))}`;
      case '[TRIM_3]': return `${formatDate(new Date(year, 6, 1))},${formatDate(new Date(year, 8, 30))}`;
      case '[TRIM_4]': return `${formatDate(new Date(year, 9, 1))},${formatDate(new Date(year, 11, 31))}`;

      case '[ANO_ATUAL]':
        return `${formatDate(new Date(year, 0, 1))},${formatDate(now)}`;

      default:
        automationLogger.warn(`Token de data desconhecido: ${value}`);
        return value;
    }
  }

  /**
   * SSP: Gera uma chave de período determinística a partir das datas ou tokens
   */
  private updateCurrentPeriod(value: string, startDate: string, endDate: string): void {
    const valUpper = value.toUpperCase();

    // Se for um token de trimestre, usa o nome do trimestre diretamente
    if (valUpper.includes('TRIM')) {
      const year = new Date().getFullYear();
      if (valUpper === '[TRIM_ATUAL]') {
        const currentMonth = new Date().getMonth();
        const tri = Math.floor(currentMonth / 3) + 1;
        this.currentPeriod = `${tri}_TRIMESTRE_${year}`;
      } else if (valUpper === '[TRIM_ANTERIOR]') {
        const currentMonth = new Date().getMonth();
        const currentQuarter = Math.floor(currentMonth / 3);
        const prevQuarter = (currentQuarter - 1 + 4) % 4;
        const actualYear = currentQuarter === 0 ? year - 1 : year;
        this.currentPeriod = `${prevQuarter + 1}_TRIMESTRE_${actualYear}`;
      } else {
        const match = valUpper.match(/TRIM[_\s]*(\d)/);
        const tri = match ? match[1] : 'X';
        this.currentPeriod = `${tri}_TRIMESTRE_${year}`;
      }
      automationLogger.info(`[SSP] Período Trimestral detectado: ${this.currentPeriod}`);
      return;
    }

    try {
      // Fallback para detecção por data (DD/MM/YYYY)
      const parts = endDate.split('/');
      if (parts.length === 3) {
        const monthNames = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];
        const month = monthNames[parseInt(parts[1]) - 1];
        const year = parts[2];
        this.currentPeriod = `${month}${year}`;
        automationLogger.info(`[SSP] Período mensal detectado: ${this.currentPeriod}`);
      }
    } catch (e) {
      this.currentPeriod = 'GERAL';
    }
  }

  private async executeWaitFor(step: Step, timeout: number, retries: number): Promise<void> {
    if (!step.selector) {
      throw new Error('Seletor obrigatório para step waitFor');
    }

    automationLogger.debug('Aguardando elemento');
    await this.selectorResolver.waitForElement(step.selector, timeout);

    // Após encontrar, verifica se a página está realmente pronta/responsiva
    const isResponsive = await this.verifyPageResponsiveness(timeout);
    if (!isResponsive) {
      automationLogger.warn('Página não está totalmente responsiva após encontrar elemento. Aguardando estabilidade...');
      await this.page.waitForTimeout(2000);
    }
  }

  private async executeDownload(step: Step, timeout: number, retries: number): Promise<void> {
    if (!step.selector) {
      throw new Error('Seletor obrigatório para step download');
    }

    // NOVO: Garante que a pasta de destino exista ANTES de clicar (Prevenção de Erros)
    const possiblePath = configManager.resolvePath(step.value || this.customBasePath);
    if (possiblePath) {
      const dirToCreate = (possiblePath.endsWith('/') || possiblePath.endsWith('\\'))
        ? path.resolve(possiblePath)
        : path.dirname(path.resolve(possiblePath));

      if (!fs.existsSync(dirToCreate)) {
        automationLogger.debug(`[Auto-Folder] Criando pasta antes do clique: ${dirToCreate}`);
        fs.mkdirSync(dirToCreate, { recursive: true });
      }
    }

    // Configura listener para download
    const downloadPromise = this.page.waitForEvent('download', { timeout });

    // Detecta e remove target="_blank" para evitar nova aba
    const element = await this.selectorResolver.resolveSelector(step.selector, retries);
    const targetAttr = await element.getAttribute('target');

    if (targetAttr === '_blank') {
      automationLogger.warn('Link com target="_blank" detectado. Removendo para evitar nova aba.');
      // Remove o atributo target para forçar download na mesma aba
      await element.evaluate((el: any) => el.removeAttribute('target'));
    }

    // Clica no elemento que inicia o download
    automationLogger.debug('Iniciando download');
    await element.click({ timeout });

    // Aguarda o download
    const download = await downloadPromise;

    // Salva o arquivo (Usa o campo 'value' do step como caminho ou nome se fornecido)
    const suggestedFilename = download.suggestedFilename();
    let downloadPath = step.value || `./downloads/${suggestedFilename}`;

    // SSP: Se o site tiver reportType, aplica a Safe Snapshot Policy para nomeação
    if (this.siteConfig.reportType) {
      const identity: SnapshotIdentity = {
        tipo: this.siteConfig.reportType,
        period: this.currentPeriod,
        uf: this.siteConfig.uf || 'SC'
      };

      // Prioriza o caminho definido no Passo (step.value), se não houver usa o do Preset
      const sspBaseDir = step.value ? path.resolve(step.value) : (this.customBasePath || path.join(process.cwd(), 'snapshots', this.siteConfig.id));
      const files = resolveSnapshotFiles(sspBaseDir, identity);

      // SSP: Download primeiro para um arquivo temporário para não corromper o atual
      const tempPath = path.join(path.dirname(files.current), `TEMP_${Date.now()}.xls`);

      // Garante que a pasta de destino existe
      const targetDir = path.dirname(files.current);
      if (!fs.existsSync(targetDir)) {
        automationLogger.debug(`[SSP] Criando pasta de destino: ${targetDir}`);
        fs.mkdirSync(targetDir, { recursive: true });
      }

      automationLogger.info(`[SSP] Iniciando download inteligente para: ${targetDir}`);
      await download.saveAs(tempPath);

      // SSP: Executa DiffEngine (Lê o antigo, compara com o novo e gera o novo .xlsx)
      try {
        const diffResult = await diffEngine.run(
          this.siteConfig.id,
          identity,
          tempPath,
          sspBaseDir,
          this.siteConfig.primaryKeys // Passa as chaves customizadas se houver
        );

        // Armazena o resultado para o AutomationEngine coletar
        this.lastDiffResult = {
          ...diffResult,
          currentFile: files.current,
          uf: identity.uf
        };

        automationLogger.info(`[SSP] Processamento Concluído: +${diffResult.added} novos, -${diffResult.removed} removidos.`);
      } catch (err: any) {
        automationLogger.error(`[SSP] Falha ao processar Diff: ${err.message}`);
        // Em caso de erro no Diff, salvamos o arquivo original para não perder o download
        if (fs.existsSync(tempPath)) fs.copyFileSync(tempPath, files.current.replace('.xlsx', '.xls'));
      } finally {
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      }
    } else {
      // Normaliza o caminho para o padrão do SO
      downloadPath = path.resolve(downloadPath);

      // Se o valor termina com barra ou já existe como diretório, anexa o nome original
      const isDirectory = (step.value && (step.value.endsWith('/') || step.value.endsWith('\\'))) ||
        (fs.existsSync(downloadPath) && fs.lstatSync(downloadPath).isDirectory());

      if (isDirectory) {
        downloadPath = path.join(downloadPath, suggestedFilename);
      }

      // Garante que as pastas de destino existam (Cria recursivamente se necessário)
      const targetDir = path.dirname(downloadPath);
      if (!fs.existsSync(targetDir)) {
        automationLogger.debug(`Criando diretórios: ${targetDir}`);
        fs.mkdirSync(targetDir, { recursive: true });
      }

      automationLogger.debug(`Salvando download em: ${downloadPath}`);
      await download.saveAs(downloadPath);
    }
  }

  /**
   * Executa uma sequência de steps
   */
  async executeSteps(steps: Step[]): Promise<void> {
    automationLogger.info(`Iniciando execução de ${steps.length} steps`);

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      automationLogger.info(`Step ${i + 1}/${steps.length}: ${step.type}`);

      try {
        await this.executeStep(step);
        automationLogger.debug(`Step ${i + 1} concluído`);
      } catch (error: any) {
        automationLogger.error(`Step ${i + 1} falhou: ${error.message}`);
        throw new Error(`Falha no step ${i + 1} (${step.type}): ${error.message}`);
      }
    }

    automationLogger.info('Todos os steps executados com sucesso');
  }

  /**
   * Define timeout padrão
   */
  setDefaultTimeout(timeout: number): void {
    this.defaultTimeout = timeout;
    this.selectorResolver = new SelectorResolver(this.page, timeout);
  }

  /**
   * Define número padrão de retries
   */
  setDefaultRetries(retries: number): void {
    this.defaultRetries = retries;
  }
}