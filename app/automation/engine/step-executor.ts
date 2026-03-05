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
  /** Se true, o passo não é executado (ignorado). */
  skipStep?: boolean;
}

import { Preset } from '../../config/config-manager';

export class StepExecutor {
  private page: Page;
  private selectorResolver: SelectorResolver;
  private defaultTimeout: number;
  private defaultRetries: number;
  private actionDelay: number;
  private siteConfig: SiteConfig;
  private currentPeriod: string = 'GERAL'; // SSP: Período detectado durante a execução
  private customBasePath?: string;
  private currentPreset?: Preset;
  private _pendingStartDate?: string; // Armazena data inicial para detecção de período manual

  private checkCancellation?: () => boolean;
  private lastDiffResult: (DiffResult & { currentFile: string, uf: string }) | null = null;

  constructor(page: Page, siteConfig: SiteConfig, defaultTimeout: number = 30000, defaultRetries: number = 3, actionDelay: number = 1000, customBasePath?: string, currentPreset?: Preset, checkCancellation?: () => boolean) {
    this.page = page;
    this.siteConfig = siteConfig;
    this.defaultTimeout = defaultTimeout;
    this.defaultRetries = defaultRetries;
    this.actionDelay = actionDelay;
    this.customBasePath = configManager.resolvePath(customBasePath);
    this.selectorResolver = new SelectorResolver(page);
    this.currentPreset = currentPreset;
    this.checkCancellation = checkCancellation;

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
    if (this.checkCancellation && this.checkCancellation()) {
      throw new Error('Execução cancelada pelo usuário');
    }

    // Verifica skipStep ANTES de aplicar delay (otimização de performance)
    if (step.skipStep) {
      automationLogger.info(`Step ${step.type} ignorado (marcado para não executar).`);
      return;
    }

    automationLogger.info(`Executando step: ${step.type}`);

    // Aplica delay entre ações se configurado (apenas para steps que serão executados)
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

    // Resolve tokens de data (pode retornar "inicio,fim" para tokens de período)
    const resolvedValue = this.resolveDateTokens(step.value);

    // [CORREÇÃO] Se o token gerou um par "inicio,fim" e estamos em um step fill individual,
    // extrai somente a data correta de acordo com o seletor (dataIni → início, dataFim → fim)
    let finalResolvedValue = resolvedValue;
    if (resolvedValue.includes(',') && !resolvedValue.startsWith('[')) {
      const [dateStart, dateEnd] = resolvedValue.split(',').map(s => s.trim());
      const selectorStr = Array.isArray(step.selector) ? step.selector.join(',') : (step.selector || '');
      // [MELHORIA] Regex mais genérico para capturar campos como "arrFilter[doc_data_proc_ini]"
      const isStartField = /data.*(ini|inicio|start)|date.*(ini|start)/i.test(selectorStr);
      const isEndField = /data.*(fim|final|end)|date.*(fim|end)/i.test(selectorStr);

      if (isStartField && dateStart) {
        finalResolvedValue = dateStart;
        automationLogger.info(`[executeFill] Token de período no campo de data inicial → usando "${finalResolvedValue}"`);
      } else if (isEndField && dateEnd) {
        finalResolvedValue = dateEnd;
        automationLogger.info(`[executeFill] Token de período no campo de data final → usando "${finalResolvedValue}"`);
      }
      // Também atualiza o período SSP com ambas as datas
      await this.tryUpdatePeriodFromDateField(step.selector, finalResolvedValue);
    }

    const element = await this.selectorResolver.resolveSelector(step.selector, retries);

    // Detecta o tipo do input para logging e formatação correta
    const inputType = await element.getAttribute('type');

    // Detecta se é campo de data e formata adequadamente
    const valueToFill = await this.formatDateForInput(element, finalResolvedValue);

    // [DEBUG] Log detalhado para diagnóstico de problemas com datas
    automationLogger.debug(`[executeFill] Step value: "${step.value}" | Resolved: "${finalResolvedValue}" | Input type: "${inputType}" | Value to fill: "${valueToFill}"`);

    // [SSP] Se for campo de data, tenta atualizar o período atual (para caso de datas brutas)
    if (!resolvedValue.includes(',')) {
      await this.tryUpdatePeriodFromDateField(step.selector, finalResolvedValue);
    }

    // [DEBUG] Log antes do preenchimento para diagnóstico
    automationLogger.info(`[executeFill] Preenchendo ${step.selector} com: "${valueToFill}" (original: "${step.value}")`);

    // Limpa o campo antes de preencher para garantir que não haja valores residuais
    await element.fill('', { timeout });
    await this.page.waitForTimeout(100);

    automationLogger.debug(`Preenchendo campo com: ${valueToFill}`);
    await element.fill(valueToFill, { timeout });

    // Verifica o valor após o preenchimento
    await this.page.waitForTimeout(200);
    const actualValue = await this.lerValorInput(element);
    automationLogger.info(`[executeFill] Valor no campo ${step.selector} após preenchimento: "${actualValue}"`);
  }

  /**
   * Tenta atualizar o período atual quando um campo de data é preenchido.
   * Útil quando o usuário usa preenchimento manual de datas em vez de fillDateRange.
   */
  private async tryUpdatePeriodFromDateField(selector: string | string[], dateValue: string): Promise<void> {
    try {
      // Verifica se o seletor parece ser um campo de data (dataIni, dataFim, etc.)
      const selectorStr = Array.isArray(selector) ? selector.join(',') : (selector || '');
      const isDateField = /data.*(ini|fim|inicio|final|start|end)?|date.*(ini|fim|start|end)?/i.test(selectorStr);

      if (!isDateField) return;

      // Verifica se o valor é uma data válida (DD/MM/YYYY)
      if (!dateValue || !dateValue.includes('/')) return;

      const parts = dateValue.split('/');
      if (parts.length !== 3) return;

      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10);
      const year = parseInt(parts[2], 10);

      if (isNaN(day) || isNaN(month) || isNaN(year)) return;

      // Se for data inicial, armazena para usar quando tiver a data final
      if (/data.*(ini|inicio|start)|date.*(ini|start)/i.test(selectorStr)) {
        this._pendingStartDate = dateValue;
        automationLogger.debug(`[SSP] Data inicial detectada: ${dateValue}`);
      }
      // Se for data final, atualiza o período
      else if (/data.*(fim|final|end)|date.*(fim|end)/i.test(selectorStr)) {
        const startDate = this._pendingStartDate || dateValue;

        // [VALIDAÇÃO] Verifica se o intervalo cruza meses diferentes
        if (startDate && startDate !== dateValue) {
          const startParts = startDate.split('/');
          const endParts = dateValue.split('/');
          if (startParts.length === 3 && endParts.length === 3) {
            const startMonth = parseInt(startParts[1], 10);
            const endMonth = parseInt(endParts[1], 10);
            const startYear = parseInt(startParts[2], 10);
            const endYear = parseInt(endParts[2], 10);

            if (startMonth !== endMonth || startYear !== endYear) {
              automationLogger.warn(`[SSP] ALERTA: Intervalo de datas cruza meses diferentes (${startDate} a ${dateValue}). ` +
                `O sistema usará o mês da data final (${endParts[1]}/${endParts[2]}) como período de referência. ` +
                `Para melhor consistência, use intervalos dentro do mesmo mês ou utilize tokens como [MES_ATUAL], [TRIM_ATUAL].`);
            }
          }
        }

        this.updateCurrentPeriod('MANUAL_FILL', startDate, dateValue);
        automationLogger.info(`[SSP] Período atualizado a partir de preenchimento manual: ${this.currentPeriod}`);

        // [CORREÇÃO] Limpa o _pendingStartDate após o uso para evitar persistência entre execuções
        this._pendingStartDate = undefined;
        automationLogger.debug(`[SSP] _pendingStartDate limpo após atualização do período`);
      }
    } catch (error) {
      // Não falha o step se a detecção de período falhar
      automationLogger.debug(`[SSP] Erro ao detectar período de campo de data: ${error}`);
    }
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

    // Preenche data inicial (com verificação e uma tentativa de reenvio se estiver errada)
    if (selectors[0]) {
      const startDateElement = await this.selectorResolver.resolveSelector(selectors[0].trim(), retries);
      const formattedStartDate = await this.formatDateForInput(startDateElement, startDate.trim());
      await this.fillDateFieldAndVerify(selectors[0].trim(), startDateElement, formattedStartDate, 'data inicial', timeout);
    }

    // Preenche data final (se houver segundo seletor)
    if (selectors[1]) {
      const endDateElement = await this.selectorResolver.resolveSelector(selectors[1].trim(), retries);
      const formattedEndDate = await this.formatDateForInput(endDateElement, endDate.trim());
      await this.fillDateFieldAndVerify(selectors[1].trim(), endDateElement, formattedEndDate, 'data final', timeout);
    }
  }

  private normalizarParaComparacao(s: string): string {
    return (s || '').replace(/\s/g, '').replace(/-/g, '/').trim();
  }

  /**
   * Preenche o campo de data, verifica o valor na página e, se estiver errado, tenta uma vez mais.
   * Se após a tentativa extra ainda estiver incorreto, interrompe a execução (throw).
   */
  private async fillDateFieldAndVerify(
    selectorLabel: string,
    element: any,
    expectedValue: string,
    label: string,
    timeout: number
  ): Promise<void> {
    automationLogger.info(`[fillDateRange] Preenchendo ${label}: ${expectedValue}`);
    const preencher = async () => {
      await element.fill('', { timeout });
      await this.page.waitForTimeout(300);
      await element.fill(expectedValue, { timeout });
      await this.page.waitForTimeout(1000);
      await this.waitForPageStability();
    };

    await preencher();
    let actualValue = await this.lerValorInput(element);
    automationLogger.info(`[fillDateRange] Valor no campo ${selectorLabel} após preenchimento (${label}): "${actualValue}"`);

    if (this.normalizarParaComparacao(actualValue) !== this.normalizarParaComparacao(expectedValue)) {
      automationLogger.warn(`[fillDateRange] Valor incorreto. Tentando preencher novamente...`);
      await preencher();
      actualValue = await this.lerValorInput(element);
      automationLogger.info(`[fillDateRange] Valor no campo ${selectorLabel} após nova tentativa: "${actualValue}"`);

      if (this.normalizarParaComparacao(actualValue) !== this.normalizarParaComparacao(expectedValue)) {
        throw new Error(
          `[fillDateRange] Data não conferida no site. Esperado: "${expectedValue}", no campo: "${actualValue}". Execução interrompida para evitar relatório com período errado.`
        );
      }
    }
  }

  private async lerValorInput(element: any): Promise<string> {
    try {
      return await element.inputValue();
    } catch {
      return '';
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
      // [SEGURANÇA] Se dateBR contiver vírgula, é um range. Extrai a primeira parte como fallback seguro.
      if (dateBR.includes(',')) {
        automationLogger.warn(`[formatDateForInput] Recebido range de datas onde se esperava valor único: "${dateBR}". Usando primeira data.`);
        dateBR = dateBR.split(',')[0].trim();
      }

      // Verifica se é input type="date"
      const inputType = await element.getAttribute('type');

      if (inputType === 'date') {
        // Converte DD/MM/YYYY → yyyy-mm-dd (com zeros para um dígito)
        const [day, month, year] = dateBR.split('/');
        const isoDate = `${year}-${(month || '').padStart(2, '0')}-${(day || '').padStart(2, '0')}`;
        automationLogger.debug(`[formatDateForInput] type="date" | Input: "${dateBR}" | Output ISO: "${isoDate}"`);
        return isoDate;
      }

      // Para outros tipos, mantém formato brasileiro
      automationLogger.debug(`[formatDateForInput] type="${inputType}" | Input: "${dateBR}" | Output: "${dateBR}" (sem conversão)`);
      return dateBR;
    } catch (error) {
      // Se falhar ao detectar tipo, mantém formato brasileiro
      automationLogger.debug(`[formatDateForInput] Erro ao detectar tipo: ${error} | Input: "${dateBR}" | Output: "${dateBR}"`);
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
   * Converte tokens como [MES_ATUAL] ou [PERIODO:YYYY-MM] em strings de data reais "inicio,fim"
   */
  private resolveDateTokens(value: string): string {
    if (!value.startsWith('[')) return value;

    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();

    const formatDate = (d: Date) => this.formatDateDDMMYYYY(d);

    // -----------------------------------------------------------------
    // Token [PERIODO:YYYY-MM] — mês específico, 100% determinístico
    // Ex: [PERIODO:2024-02] → "01/02/2024,29/02/2024" (bissexto OK)
    // -----------------------------------------------------------------
    const periodoMesMatch = value.match(/^\[PERIODO:(\d{4})-(\d{2})\]$/i);
    if (periodoMesMatch) {
      const pYear = parseInt(periodoMesMatch[1], 10);
      const pMonth = parseInt(periodoMesMatch[2], 10) - 1; // 0-indexed
      const start = new Date(pYear, pMonth, 1);
      const end = new Date(pYear, pMonth + 1, 0); // último dia do mês
      automationLogger.info(`[Token] ${value} → ${formatDate(start)} a ${formatDate(end)}`);
      return `${formatDate(start)},${formatDate(end)}`;
    }

    // -----------------------------------------------------------------
    // Token [PERIODO:YYYY-QN] — trimestre específico
    // Ex: [PERIODO:2023-Q1] → "01/01/2023,31/03/2023"
    // -----------------------------------------------------------------
    const periodoQuarterMatch = value.match(/^\[PERIODO:(\d{4})-Q([1-4])\]$/i);
    if (periodoQuarterMatch) {
      const pYear = parseInt(periodoQuarterMatch[1], 10);
      const pQuarter = parseInt(periodoQuarterMatch[2], 10); // 1-4
      const startMonth = (pQuarter - 1) * 3;       // Q1=0, Q2=3, Q3=6, Q4=9
      const endMonth = startMonth + 3;
      const start = new Date(pYear, startMonth, 1);
      const end = new Date(pYear, endMonth, 0);     // último dia do trimestre
      automationLogger.info(`[Token] ${value} → ${formatDate(start)} a ${formatDate(end)}`);
      return `${formatDate(start)},${formatDate(end)}`;
    }

    // -----------------------------------------------------------------
    // Token [PERIODO:YYYY] — ano completo
    // Ex: [PERIODO:2022] → "01/01/2022,31/12/2022"
    // -----------------------------------------------------------------
    const periodoAnoMatch = value.match(/^\[PERIODO:(\d{4})\]$/i);
    if (periodoAnoMatch) {
      const pYear = parseInt(periodoAnoMatch[1], 10);
      const start = new Date(pYear, 0, 1);
      const end = new Date(pYear, 11, 31);
      automationLogger.info(`[Token] ${value} → ${formatDate(start)} a ${formatDate(end)}`);
      return `${formatDate(start)},${formatDate(end)}`;
    }

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
    const monthNames = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];

    // -----------------------------------------------------------------
    // [PERIODO:YYYY-MM] → nome determinístico (ex: FEV2024)
    // O nome vem do TOKEN, não das datas — imune a qualquer erro externo
    // -----------------------------------------------------------------
    const periodoMesMatch = value.match(/^\[PERIODO:(\d{4})-(\d{2})\]$/i);
    if (periodoMesMatch) {
      const pYear = periodoMesMatch[1];
      const pMonth = parseInt(periodoMesMatch[2], 10);
      const monthName = monthNames[pMonth - 1] || 'MES';
      this.currentPeriod = `${monthName}${pYear}`;
      automationLogger.info(`[SSP] Período determinístico [PERIODO:MES]: ${this.currentPeriod}`);
      return;
    }

    // -----------------------------------------------------------------
    // [PERIODO:YYYY-QN] → nome determinístico (ex: 1_TRIMESTRE_2023)
    // -----------------------------------------------------------------
    const periodoQuarterMatch = value.match(/^\[PERIODO:(\d{4})-Q([1-4])\]$/i);
    if (periodoQuarterMatch) {
      const pYear = periodoQuarterMatch[1];
      const pQuarter = periodoQuarterMatch[2];
      this.currentPeriod = `${pQuarter}_TRIMESTRE_${pYear}`;
      automationLogger.info(`[SSP] Período determinístico [PERIODO:TRIMESTRE]: ${this.currentPeriod}`);
      return;
    }

    // -----------------------------------------------------------------
    // [PERIODO:YYYY] → nome determinístico (ex: ANO_2022)
    // -----------------------------------------------------------------
    const periodoAnoMatch = value.match(/^\[PERIODO:(\d{4})\]$/i);
    if (periodoAnoMatch) {
      const pYear = periodoAnoMatch[1];
      this.currentPeriod = `ANO_${pYear}`;
      automationLogger.info(`[SSP] Período determinístico [PERIODO:ANO]: ${this.currentPeriod}`);
      return;
    }

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

    // [MES_ATUAL] → nome curto no arquivo (ex: FEV2026)
    if (valUpper === '[MES_ATUAL]' && endDate && endDate.includes('/')) {
      const parts = endDate.trim().split('/');
      if (parts.length === 3) {
        const monthNames = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
        const month = monthNames[parseInt(parts[1], 10) - 1] || 'MES';
        const year = parts[2];
        this.currentPeriod = `${month}${year}`;
        automationLogger.info(`[SSP] Período [MES_ATUAL]: ${this.currentPeriod}`);
        return;
      }
    }

    try {
      // Fallback: datas explícitas (ex: 01/02/2026 a 28/02/2026)
      // Se o intervalo cabe em um único mês, usa nome curto (ex: FEV2026)
      // Se o intervalo cruza meses diferentes, usa formato de intervalo
      const norm = (s: string) => (s || '').trim().replace(/\//g, '_');
      const monthNames = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];

      if (startDate && endDate && startDate.includes('/') && endDate.includes('/')) {
        const startParts = startDate.trim().split('/');
        const endParts = endDate.trim().split('/');

        if (startParts.length === 3 && endParts.length === 3) {
          const startMonth = parseInt(startParts[1], 10);
          const endMonth = parseInt(endParts[1], 10);
          const startYear = parseInt(startParts[2], 10);
          const endYear = parseInt(endParts[2], 10);

          // Mesmo mês e ano → usa nome curto do mês (ex: FEV2026)
          if (startMonth === endMonth && startYear === endYear) {
            const monthName = monthNames[startMonth - 1] || 'MES';
            this.currentPeriod = `${monthName}${endYear}`;
            automationLogger.info(`[SSP] Período mensal por datas manuais: ${this.currentPeriod}`);
            return;
          }
        }

        // Intervalo cruza meses → usa formato completo (ex: 01_01_2026_a_31_03_2026)
        this.currentPeriod = `${norm(startDate)}_a_${norm(endDate)}`;
        automationLogger.info(`[SSP] Período por intervalo de datas: ${this.currentPeriod}`);
        return;
      }

      const parts = endDate.split('/');
      if (parts.length === 3) {
        const month = monthNames[parseInt(parts[1]) - 1];
        const year = parts[2];
        this.currentPeriod = `${month}${year}`;
        automationLogger.info(`[SSP] Período mensal detectado: ${this.currentPeriod}`);
      }
    } catch (e) {
      this.currentPeriod = 'GERAL';
    }
  }

  /**
   * Retorna os períodos menores que estão contidos em um período maior.
   * Ex: '1_TRIMESTRE_2026' → ['JAN2026', 'FEV2026', 'MAR2026']
   *     'ANO_2022' → ['JAN2022', ..., 'DEZ2022']
   */
  private getSubPeriodsFor(period: string): string[] {
    const MONTH_NAMES = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];

    // N_TRIMESTRE_YYYY → 3 meses
    const triMatch = period.match(/^(\d)_TRIMESTRE_(\d{4})$/i);
    if (triMatch) {
      const q = parseInt(triMatch[1], 10);
      const year = triMatch[2];
      const startIdx = (q - 1) * 3;
      return MONTH_NAMES.slice(startIdx, startIdx + 3).map(m => `${m}${year}`);
    }

    // ANO_YYYY → 12 meses + 4 trimestres
    const anoMatch = period.match(/^ANO_(\d{4})$/i);
    if (anoMatch) {
      const year = anoMatch[1];
      const months = MONTH_NAMES.map(m => `${m}${year}`);
      const quarters = [1, 2, 3, 4].map(q => `${q}_TRIMESTRE_${year}`);
      return [...months, ...quarters];
    }

    return [];
  }

  /**
   * Move snapshots de sub-períodos obsoletos para a pasta backups/.
   * Mantém o diretório limpo e o MASTER lê apenas dados não-redundantes.
   */
  private archiveOverlappingSnapshots(baseDir: string, identity: SnapshotIdentity): void {
    const subPeriods = this.getSubPeriodsFor(identity.period);
    if (subPeriods.length === 0) return; // período simples (mês), nada a arquivar

    const backupsDir = path.join(baseDir, 'backups');
    const modes: Array<{ mode: string; ext: string }> = [
      { mode: 'CURRENT', ext: 'xlsx' },
      { mode: 'DELETED', ext: 'xlsx' },
      { mode: 'META', ext: 'json' },
    ];
    let archivedCount = 0;

    for (const subPeriod of subPeriods) {
      for (const { mode, ext } of modes) {
        const filename = `${identity.tipo}_${mode}_${subPeriod}_${identity.uf}.${ext}`;
        const filePath = path.join(baseDir, filename);

        if (!fs.existsSync(filePath)) continue;

        if (!fs.existsSync(backupsDir)) {
          fs.mkdirSync(backupsDir, { recursive: true });
        }

        // Se já existir um backup com o mesmo nome, acrescenta timestamp
        let destPath = path.join(backupsDir, filename);
        if (fs.existsSync(destPath)) {
          const ts = Date.now();
          destPath = path.join(backupsDir, filename.replace(`.${ext}`, `_${ts}.${ext}`));
        }

        try {
          fs.renameSync(filePath, destPath);
          archivedCount++;
          automationLogger.info(`[Archive] Snapshot ${filename} movido para backups/ (substituído por ${identity.period})`);
        } catch (err: any) {
          automationLogger.warn(`[Archive] Não foi possível mover ${filename}: ${err.message}`);
        }
      }
    }

    if (archivedCount > 0) {
      automationLogger.info(`[Archive] ${archivedCount} arquivo(s) movido(s) para backups/ — período ${identity.period} é o autoritativo.`);
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
          this.currentPreset?.primaryKeys // Passa as chaves do preset
        );

        // Armazena o resultado para o AutomationEngine coletar
        this.lastDiffResult = {
          ...diffResult,
          currentFile: files.current,
          uf: identity.uf
        };

        automationLogger.info(`[SSP] Processamento Concluído: +${diffResult.added} novos, -${diffResult.removed} removidos.`);

        // [ARCHIVE] Move snapshots de sub-períodos obsoletos para backups/
        // Ex: importar 1_TRIMESTRE_2026 arquiva JAN2026, FEV2026, MAR2026
        this.archiveOverlappingSnapshots(sspBaseDir, identity);
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

    // [CORREÇÃO] Limpa estado pendente de datas para evitar persistência entre execuções
    if (this._pendingStartDate) {
      automationLogger.debug(`[SSP] Limpando _pendingStartDate residual: "${this._pendingStartDate}"`);
      this._pendingStartDate = undefined;
    }

    // [VALIDAÇÃO] Detecta conflitos entre steps de preenchimento de data
    this.validateDateSteps(steps);

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
   * Valida configuração de steps de data para evitar conflitos
   */
  private validateDateSteps(steps: Step[]): void {
    const dateFillSteps = steps.filter(s =>
      (s.type === 'fill' || s.type === 'fillDateRange') &&
      !s.skipStep &&
      (s.selector === '#dataIni' || s.selector === '#dataFim' ||
        s.selector === '#dataInicio' || s.selector === '#dataFim' ||
        (typeof s.selector === 'string' && /data(ini|fim|inicio|final)/i.test(s.selector)))
    );

    const hasFillDateRange = dateFillSteps.some(s => s.type === 'fillDateRange');
    const hasManualFill = dateFillSteps.some(s => s.type === 'fill');

    if (hasFillDateRange && hasManualFill) {
      automationLogger.warn(`[VALIDAÇÃO] Conflito detectado: Existem steps 'fill' manuais e 'fillDateRange' ativos simultaneamente. ` +
        `O fillDateRange sobrescreverá as datas manuais. ` +
        `Recomendação: Marque como "ignorado" (skipStep) o método que não deseja usar.`);
    }

    // Log dos steps de data que serão executados
    if (dateFillSteps.length > 0) {
      const stepsInfo = dateFillSteps.map(s => `${s.type}(${s.selector})`).join(', ');
      automationLogger.info(`[VALIDAÇÃO] Steps de data ativos: ${stepsInfo}`);
    }
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