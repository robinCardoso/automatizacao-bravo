import { Page, Locator } from '@playwright/test';
import { automationLogger } from '../../config/logger';

export class SelectorResolver {
  private page: Page;
  private timeout: number;

  constructor(page: Page, timeout: number = 30000) {
    this.page = page;
    this.timeout = timeout;
  }

  /**
   * Resolve um seletor (único ou array) e retorna o elemento correspondente
   * Tenta múltiplos seletores em sequência até encontrar um que funcione
   */
  async resolveSelector(selector: string | string[], retries: number = 3): Promise<Locator> {
    const selectors = Array.isArray(selector) ? selector : [selector];
    
    for (let attempt = 0; attempt < retries; attempt++) {
      for (const sel of selectors) {
        try {
          automationLogger.debug(`Tentando seletor: ${sel} (tentativa ${attempt + 1}/${retries})`);
          
          const locator = this.page.locator(sel);
          // Verifica se o elemento existe e é visível
          await locator.first().waitFor({ 
            state: 'visible', 
            timeout: this.timeout / selectors.length 
          });
          
          automationLogger.debug(`Seletor resolvido com sucesso: ${sel}`);
          return locator.first();
          
        } catch (error: any) {
          automationLogger.debug(`Seletor falhou: ${sel} - ${error.message}`);
          continue;
        }
      }
      
      if (attempt < retries - 1) {
        automationLogger.debug(`Todos os seletores falharam na tentativa ${attempt + 1}, tentando novamente...`);
        await this.page.waitForTimeout(1000); // Pequena espera antes de tentar novamente
      }
    }
    
    throw new Error(`Nenhum dos seletores funcionou após ${retries} tentativas: [${selectors.join(', ')}]`);
  }

  /**
   * Resolve múltiplos seletores e retorna todos os elementos encontrados
   */
  async resolveMultipleSelectors(selectors: string[], retries: number = 3): Promise<Locator[]> {
    const results: Locator[] = [];
    
    for (const selector of selectors) {
      try {
        const element = await this.resolveSelector(selector, retries);
        results.push(element);
      } catch (error) {
        automationLogger.warn(`Não foi possível resolver o seletor: ${selector}`);
      }
    }
    
    return results;
  }

  /**
   * Verifica se um elemento existe na página
   */
  async elementExists(selector: string | string[]): Promise<boolean> {
    try {
      await this.resolveSelector(selector, 1);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Espera por um elemento específico
   */
  async waitForElement(selector: string | string[], timeout?: number): Promise<Locator> {
    const originalTimeout = this.timeout;
    if (timeout) {
      this.timeout = timeout;
    }
    
    try {
      return await this.resolveSelector(selector);
    } finally {
      this.timeout = originalTimeout;
    }
  }

  /**
   * Obtém o texto de um elemento
   */
  async getElementText(selector: string | string[]): Promise<string> {
    const element = await this.resolveSelector(selector);
    return await element.textContent() || '';
  }

  /**
   * Obtém o valor de um atributo de um elemento
   */
  async getElementAttribute(selector: string | string[], attribute: string): Promise<string | null> {
    const element = await this.resolveSelector(selector);
    return await element.getAttribute(attribute);
  }

  /**
   * Verifica se um elemento está visível
   */
  async isElementVisible(selector: string | string[]): Promise<boolean> {
    try {
      const element = await this.resolveSelector(selector, 1);
      return await element.isVisible();
    } catch {
      return false;
    }
  }

  /**
   * Conta o número de elementos que correspondem a um seletor
   */
  async countElements(selector: string): Promise<number> {
    try {
      const elements = this.page.locator(selector);
      return await elements.count();
    } catch {
      return 0;
    }
  }
}