import { Page } from '@playwright/test';
import { automationLogger } from '../../config/logger';

export enum FailureCategory {
  NETWORK = 'NETWORK',           // Problemas de conexão, DNS, Site fora do ar
  PAGE_LOAD = 'PAGE_LOAD',       // Página carregou mas está em branco ou timeout de navegação
  UI_SELECTOR = 'UI_SELECTOR',   // Elemento não encontrado (possível mudança de site)
  AUTH = 'AUTH',                 // Login falhou ou sessão expirada
  CAPTCHA = 'CAPTCHA',           // Desafio de bot detectado
  DOWNLOAD = 'DOWNLOAD',         // Falha ao baixar ou arquivo vazio
  UNKNOWN = 'UNKNOWN'            // Erro não categorizado
}

export class ErrorClassifier {
  /**
   * Analisa um erro e o estado da página para determinar a categoria da falha
   */
  static async classify(error: any, page?: Page): Promise<FailureCategory> {
    const message = (error.message || '').toLowerCase();
    const name = (error.name || '').toLowerCase();

    // 1. Verificações de Rede (Network)
    if (
      message.includes('net::err_') ||
      message.includes('dns_probe_') ||
      message.includes('connection refused') ||
      message.includes('connection reset') ||
      message.includes('network error')
    ) {
      return FailureCategory.NETWORK;
    }

    // 2. Verificações de Timeout / Carga de Página
    if (name === 'timeouterror' || message.includes('timeout exceeded')) {
      // Se temos a página, verificamos se ela está em branco
      if (page) {
        try {
          const content = await page.content();
          if (content.length < 500) { // Página suspeitamente pequena/vazia
             return FailureCategory.PAGE_LOAD;
          }
        } catch (e) {
          return FailureCategory.NETWORK; // Se nem o content() funciona, é rede/navegador
        }
      }
      return FailureCategory.PAGE_LOAD;
    }

    // 3. Verificações de Autenticação (baseado em mensagens comuns do LoginHandler)
    if (
      message.includes('login falhou') ||
      message.includes('credenciais inválidas') ||
      message.includes('usuário ou senha') ||
      message.includes('sessão expirada')
    ) {
      return FailureCategory.AUTH;
    }

    // 4. Verificações de Captcha
    if (
      message.includes('captcha') ||
      message.includes('não sou um robô') ||
      message.includes('prova de humano')
    ) {
      return FailureCategory.CAPTCHA;
    }

    // 5. Verificações de UI / Seletores
    if (
      message.includes('selector') ||
      message.includes('não encontrado') ||
      message.includes('waiting for locator') ||
      message.includes('no element found')
    ) {
      return FailureCategory.UI_SELECTOR;
    }

    // 6. Verificações de Download
    if (
      message.includes('download') ||
      message.includes('arquivo vazio')
    ) {
      return FailureCategory.DOWNLOAD;
    }

    return FailureCategory.UNKNOWN;
  }

  /**
   * Define se uma categoria de erro é elegível para re-tentativa automática
   */
  static isRetryable(category: FailureCategory): boolean {
    const retryable = [
      FailureCategory.NETWORK,
      FailureCategory.PAGE_LOAD,
      FailureCategory.UI_SELECTOR, // Tentamos uma vez mais pois pode ser lentidão do DOM
      FailureCategory.DOWNLOAD,
      FailureCategory.UNKNOWN
    ];
    return retryable.includes(category);
  }
}
