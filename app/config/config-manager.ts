import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import logger from './logger';

/**
 * Gerenciador de Credenciais Seguras (Criptografia AES-256-GCM + Electron SafeStorage)
 */
class SecureCredentialManager {
  private static readonly algorithm = 'aes-256-gcm';
  private static readonly secret = Buffer.alloc(32, 'b4av0-s3cur3-p4ssw0rd-sm7p-k3y-24');

  static encrypt(text: string | undefined): string | undefined {
    if (!text) return text;

    try {
      // Tenta usar safeStorage se estiver disponível (Electron Main Process)
      try {
        const { safeStorage } = require('electron');
        if (safeStorage && safeStorage.isEncryptionAvailable()) {
          const encryptedBuffer = safeStorage.encryptString(text);
          return `ss:${encryptedBuffer.toString('hex')}`;
        }
      } catch (e) {
        // Fallback para AES interno se safeStorage não estiver disponível
      }

      // Fallback: AES-256-GCM
      if (text.startsWith('aes:') || text.startsWith('ss:')) return text;

      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv(this.algorithm, this.secret, iv);
      let encrypted = cipher.update(text, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      const authTag = cipher.getAuthTag().toString('hex');
      return `aes:${encrypted}.${iv.toString('hex')}.${authTag}`;
    } catch (e) {
      logger.error('[Crypto] Erro ao criptografar:', e);
      return text;
    }
  }

  static decrypt(encryptedData: string | undefined): string | undefined {
    if (!encryptedData) return encryptedData;

    try {
      // Decripta safeStorage
      if (encryptedData.startsWith('ss:')) {
        const { safeStorage } = require('electron');
        const hex = encryptedData.substring(3);
        const buffer = Buffer.from(hex, 'hex');
        return safeStorage.decryptString(buffer);
      }

      // Decripta AES interno
      const data = encryptedData.startsWith('aes:') ? encryptedData.substring(4) : encryptedData;
      const parts = data.split('.');
      if (parts.length !== 3) return encryptedData;

      const [encrypted, ivHex, authTagHex] = parts;
      const decipher = crypto.createDecipheriv(this.algorithm, this.secret, Buffer.from(ivHex, 'hex'));
      decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } catch (e) {
      return encryptedData;
    }
  }
}

// Schema de validação para configuração de sites
const SiteConfigSchema = z.object({
  id: z.string(),
  name: z.string(),
  url: z.string().url(),
  loginUrl: z.string().url(),
  usernameField: z.string(),
  passwordField: z.string(),
  loginButton: z.string(),
  steps: z.array(z.object({
    type: z.enum(['goto', 'click', 'hover', 'fill', 'fillDateRange', 'select', 'waitFor', 'download']),
    selector: z.union([z.string(), z.array(z.string())]),
    value: z.string().optional(),
    timeout: z.number().optional(),
    retries: z.number().optional(),
    continueOnError: z.boolean().default(false),
  })),
  downloadPath: z.string().optional(),
  renamePattern: z.string().optional(),
  reportType: z.string().optional(),
  primaryKeys: z.array(z.string()).optional(),
  uf: z.string().default('SC'),
  credentials: z.object({
    username: z.string(),
    password: z.string(),
  }).optional(),
});

// Schema de validação para Presets (ISOLADO)
const PresetSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, 'Nome do preset é obrigatório'),
  sites: z.array(SiteConfigSchema).default([]), // Sites completos isolados por preset
  login: z.string().min(1, 'Login é obrigatório'),
  password: z.string().min(1, 'Senha é obrigatória'),
  type: z.enum(['vendas', 'pedidos', 'fiscal', 'outros']).default('outros'),
  destination: z.string().optional(),

  // NOVO: Configurações de Auditoria e Dashboard no nível do Preset
  primaryKeys: z.array(z.string()).optional(),
  dashboardMapping: z.object({
    value: z.string().optional(),
    date: z.string().optional(),
    group: z.string().optional(),
    category: z.string().optional()
  }).optional(),

  createdAt: z.string().optional(),
  lastUsedAt: z.string().optional(),
  schedule: z.object({
    enabled: z.boolean().default(false),
    mode: z.enum(['interval', 'fixed']).default('interval'),
    intervalHours: z.number().min(1).max(24).default(3),
    fixedTimes: z.array(z.string()).default([]),
    nextRun: z.string().optional(),
    compensationPolicy: z.enum(['immediate', 'skip', 'delayed']).default('immediate'),
    maxCompensationDelay: z.number().min(0).max(168).default(24)
  }).optional()
});

export type Preset = z.infer<typeof PresetSchema>;

// Schema de validação para SMTP
const SmtpConfigSchema = z.object({
  host: z.string().default('smtp.gmail.com'),
  port: z.number().default(465),
  secure: z.boolean().default(true),
  user: z.string().optional(),
  pass: z.string().optional(),
  authType: z.enum(['login', 'oauth2']).default('login'),
  clientId: z.string().optional(),
  clientSecret: z.string().optional(),
  refreshToken: z.string().optional(),
});

// Schema de validação para configuração geral (SEM lista global de sites)
const AppConfigSchema = z.object({
  credentials: z.record(z.string(), z.string()).optional(),
  defaultTimeout: z.number().default(30000),
  defaultRetries: z.number().default(3),
  actionDelay: z.number().default(1000),
  headless: z.boolean().default(true),
  schedulerEnabled: z.boolean().default(true),
  googleDrivePath: z.string().optional(),
  presets: z.array(PresetSchema).default([]),
  notifications: z.object({
    enabled: z.boolean().default(false),
    smtp: SmtpConfigSchema.optional(),
    fallbackSmtp: SmtpConfigSchema.optional(),
    recipient: z.string().optional(),
    retryAttempts: z.number().default(3),
    showLogo: z.boolean().default(true),
    compactLayout: z.boolean().default(false),
  }).default({
    enabled: false,
    retryAttempts: 3,
    showLogo: true,
    compactLayout: false
  }),
});

export type SiteConfig = z.infer<typeof SiteConfigSchema>;
export type AppConfig = z.infer<typeof AppConfigSchema>;

import { AppPaths } from '../core/utils/AppPaths';
import { app } from 'electron';

export interface SchemaMap {
  primaryKey: string[];
  dashboardMapping: {
    value?: string;
    date?: string;
    group?: string;
    category?: string;
  };
}

export interface SchemaMaps {
  [key: string]: SchemaMap;
}

export class ConfigManager {
  private static instance: ConfigManager;
  private config: AppConfig;
  private configPath: string;
  private schemaMaps: SchemaMaps = {};

  private constructor() {
    this.configPath = AppPaths.getConfigPath();
    this.config = this.loadConfig();
    this.loadSchemaMaps();
  }

  /**
   * Resolve variáveis de ambiente e normaliza caminhos de usuário
   */
  public resolvePath(targetPath: string | undefined): string | undefined {
    if (!targetPath) return targetPath;

    let resolved = targetPath;

    // 1. Substitui variáveis de ambiente comuns (%NAME% ou ${NAME})
    resolved = resolved.replace(/%([^%]+)%|\${([^}]+)}/g, (_, p1, p2) => {
      const varName = p1 || p2;
      return process.env[varName] || varName;
    });

    // 2. Inteligência de Troca de Usuário (Fix EPERM após formatar/trocar PC)
    // Se o caminho começa com C:\Users\ALGUEM e o ALGUEM não existe ou não é o atual
    const usersMatch = resolved.match(/^([a-zA-Z]:\\Users\\)([^\\]+)(.*)$/i);
    if (usersMatch) {
      const currentUserName = os.userInfo().username;
      const pathUserName = usersMatch[2];

      if (pathUserName.toLowerCase() !== currentUserName.toLowerCase()) {
        const newPath = path.join(os.homedir(), usersMatch[3]);
        logger.info(`[PathResolver] Remapeando caminho de usuário antigo (${pathUserName}) para atual (${currentUserName}): ${newPath}`);
        return newPath;
      }
    }

    return path.normalize(resolved);
  }

  public static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }

  private loadConfig(): AppConfig {
    try {
      // MIGRACAO AUTOMÁTICA: Se o config novo não existe mas o antigo existe, migra!
      const oldConfigPath = path.join(process.cwd(), 'app/config/app-config.json');
      if (!fs.existsSync(this.configPath) && fs.existsSync(oldConfigPath)) {
        logger.info(`[MIGRAÇÃO] Detectado config no local antigo (${oldConfigPath}). Migrando para novo local...`);
        const configDir = path.dirname(this.configPath);
        if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true });
        fs.copyFileSync(oldConfigPath, this.configPath);
        logger.info('[MIGRAÇÃO] Configuração migrada com sucesso para AppData');
      }

      if (fs.existsSync(this.configPath)) {
        const configFile = fs.readFileSync(this.configPath, 'utf-8');
        const rawConfig = JSON.parse(configFile);

        // Migração automática: move sites globais para presets existentes
        if (rawConfig.sites && Array.isArray(rawConfig.sites) && rawConfig.sites.length > 0) {
          logger.info('[MIGRAÇÃO] Detectado config.sites global. Migrando para presets...');

          if (rawConfig.presets && Array.isArray(rawConfig.presets)) {
            rawConfig.presets.forEach((preset: any) => {
              // Se o preset tem array de IDs, converte para objetos completos
              if (preset.sites && Array.isArray(preset.sites) && typeof preset.sites[0] === 'string') {
                const siteIds = preset.sites;
                preset.sites = rawConfig.sites.filter((s: any) => siteIds.includes(s.id));
                logger.info(`[MIGRAÇÃO] Preset "${preset.name}": migrados ${preset.sites.length} sites`);
              }
            });
          }

          // Remove a lista global
          delete rawConfig.sites;
          logger.info('[MIGRAÇÃO] Lista global de sites removida');
        }

        const parsedConfig = AppConfigSchema.parse(rawConfig);

        // DESCRIPTOGRAFIA de credenciais SMTP para uso em memória
        if (parsedConfig.notifications) {
          const n = parsedConfig.notifications;
          if (n.smtp) {
            n.smtp.user = SecureCredentialManager.decrypt(n.smtp.user);
            n.smtp.pass = SecureCredentialManager.decrypt(n.smtp.pass);
            n.smtp.clientSecret = SecureCredentialManager.decrypt(n.smtp.clientSecret);
            n.smtp.refreshToken = SecureCredentialManager.decrypt(n.smtp.refreshToken);
          }
          if (n.fallbackSmtp) {
            n.fallbackSmtp.user = SecureCredentialManager.decrypt(n.fallbackSmtp.user);
            n.fallbackSmtp.pass = SecureCredentialManager.decrypt(n.fallbackSmtp.pass);
            n.fallbackSmtp.clientSecret = SecureCredentialManager.decrypt(n.fallbackSmtp.clientSecret);
            n.fallbackSmtp.refreshToken = SecureCredentialManager.decrypt(n.fallbackSmtp.refreshToken);
          }
        }

        logger.info('Configuração carregada com sucesso');
        return parsedConfig;
      } else {
        const defaultConfig: AppConfig = {
          defaultTimeout: 30000,
          defaultRetries: 3,
          actionDelay: 1000,
          headless: false,
          schedulerEnabled: true,
          presets: [],
          notifications: {
            enabled: false,
            retryAttempts: 3,
            showLogo: true,
            compactLayout: false
          }
        };
        this.saveConfig(defaultConfig);
        logger.info('Configuração padrão criada');
        return defaultConfig;
      }
    } catch (error) {
      logger.error('Erro ao carregar configuração:', error);
      throw new Error(`Falha ao carregar configuração: ${error}`);
    }
  }

  public getConfig(): AppConfig {
    return { ...this.config };
  }

  public saveConfig(config: AppConfig): void {
    try {
      const validatedConfig = AppConfigSchema.parse(config);

      // CRIPTOGRAFIA de credenciais SMTP antes de salvar no disco
      const configToSave = JSON.parse(JSON.stringify(validatedConfig)); // Deep clone
      if (configToSave.notifications) {
        const n = configToSave.notifications;
        if (n.smtp) {
          n.smtp.user = SecureCredentialManager.encrypt(n.smtp.user);
          n.smtp.pass = SecureCredentialManager.encrypt(n.smtp.pass);
          n.smtp.clientSecret = SecureCredentialManager.encrypt(n.smtp.clientSecret);
          n.smtp.refreshToken = SecureCredentialManager.encrypt(n.smtp.refreshToken);
        }
        if (n.fallbackSmtp) {
          n.fallbackSmtp.user = SecureCredentialManager.encrypt(n.fallbackSmtp.user);
          n.fallbackSmtp.pass = SecureCredentialManager.encrypt(n.fallbackSmtp.pass);
          n.fallbackSmtp.clientSecret = SecureCredentialManager.encrypt(n.fallbackSmtp.clientSecret);
          n.fallbackSmtp.refreshToken = SecureCredentialManager.encrypt(n.fallbackSmtp.refreshToken);
        }
      }

      const configDir = path.dirname(this.configPath);
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }

      fs.writeFileSync(this.configPath, JSON.stringify(configToSave, null, 2));
      this.config = validatedConfig;
      logger.info('Configuração salva com sucesso');
    } catch (error) {
      logger.error('Erro ao salvar configuração:', error);
      throw new Error(`Falha ao salvar configuração: ${error}`);
    }
  }

  // ===== MÉTODOS DE PRESET =====

  public getPresets(): Preset[] {
    return [...(this.config.presets || [])];
  }

  public addPreset(preset: Preset): void {
    const validatedPreset = PresetSchema.parse({
      ...preset,
      id: preset.id || require('crypto').randomUUID(),
      createdAt: preset.createdAt || new Date().toISOString(),
      sites: preset.sites || []
    });

    if (!this.config.presets) this.config.presets = [];
    this.config.presets.push(validatedPreset);
    this.saveConfig(this.config);
    logger.info(`Preset adicionado: ${preset.name}`);
  }

  public removePreset(presetId: string): void {
    if (!this.config.presets) return;
    const initialLength = this.config.presets.length;
    this.config.presets = this.config.presets.filter(p => p.id !== presetId);

    if (this.config.presets.length < initialLength) {
      this.saveConfig(this.config);
      logger.info(`Preset removido: ${presetId}`);
    }
  }

  public updatePreset(presetId: string, updatedPreset: Partial<Preset>): void {
    if (!this.config.presets) return;
    const index = this.config.presets.findIndex(p => p.id === presetId);
    if (index !== -1) {
      this.config.presets[index] = PresetSchema.parse({
        ...this.config.presets[index],
        ...updatedPreset
      });
      this.saveConfig(this.config);
      logger.info(`Preset atualizado: ${presetId}`);
    }
  }

  // ===== MÉTODOS DE SITE ISOLADOS POR PRESET =====

  public getPresetSites(presetId: string): SiteConfig[] {
    const preset = this.config.presets?.find(p => p.id === presetId);
    return preset?.sites || [];
  }

  public addSiteToPreset(presetId: string, site: SiteConfig): void {
    const preset = this.config.presets?.find(p => p.id === presetId);
    if (!preset) throw new Error(`Preset não encontrado: ${presetId}`);

    const validatedSite = SiteConfigSchema.parse({
      ...site,
      id: site.id || require('crypto').randomUUID()
    });

    if (!preset.sites) preset.sites = [];
    preset.sites.push(validatedSite);
    this.saveConfig(this.config);
    logger.info(`Site "${site.name}" adicionado ao preset "${preset.name}"`);
  }

  public removeSiteFromPreset(presetId: string, siteId: string): void {
    const preset = this.config.presets?.find(p => p.id === presetId);
    if (!preset) return;

    const initialLength = preset.sites?.length || 0;
    preset.sites = preset.sites?.filter(s => s.id !== siteId) || [];

    if (preset.sites.length < initialLength) {
      this.saveConfig(this.config);
      logger.info(`Site removido do preset: ${siteId}`);
    }
  }

  public updateSiteInPreset(presetId: string, siteId: string, updatedSite: Partial<SiteConfig>): void {
    const preset = this.config.presets?.find(p => p.id === presetId);
    if (!preset || !preset.sites) throw new Error('Preset ou site não encontrado');

    const index = preset.sites.findIndex(s => s.id === siteId);
    if (index === -1) throw new Error(`Site não encontrado: ${siteId}`);

    preset.sites[index] = { ...preset.sites[index], ...updatedSite };
    this.saveConfig(this.config);
    logger.info(`Site atualizado no preset: ${siteId}`);
  }

  public getSiteFromPreset(presetId: string, siteId: string): SiteConfig | undefined {
    const preset = this.config.presets?.find(p => p.id === presetId);
    return preset?.sites?.find(s => s.id === siteId);
  }

  // ===== MÉTODOS LEGADOS (DEPRECADOS - mantidos por compatibilidade temporária) =====

  /** @deprecated Use getPresetSites(presetId) */
  public getSites(): SiteConfig[] {
    logger.warn('[DEPRECADO] getSites() chamado. Use getPresetSites(presetId)');
    // Retorna todos os sites de todos os presets (fallback)
    return this.config.presets?.flatMap(p => p.sites || []) || [];
  }

  /** @deprecated Use getSiteFromPreset(presetId, siteId) */
  public getSiteById(id: string): SiteConfig | undefined {
    logger.warn('[DEPRECADO] getSiteById() chamado. Use getSiteFromPreset()');
    for (const preset of this.config.presets || []) {
      const site = preset.sites?.find(s => s.id === id);
      if (site) return site;
    }
    return undefined;
  }

  // ===== FUNCIONALIDADES DE EXPORTAÇÃO/IMPORTAÇÃO =====

  /**
   * Exporta todas as configurações em um objeto serializável
   */
  public exportConfig(): any {
    try {
      const exportData = {
        version: '1.0',
        exportDate: new Date().toISOString(),
        config: this.getConfig()
      };

      logger.info('Configurações exportadas com sucesso');
      return exportData;
    } catch (error) {
      logger.error('Erro ao exportar configurações:', error);
      throw new Error(`Falha ao exportar configurações: ${error}`);
    }
  }

  /**
   * Importa configurações de um objeto exportado
   */
  public importConfig(importedData: any): { presetsAdded: number; presetsUpdated: number; warnings: string[] } {
    try {
      const warnings: string[] = [];
      let presetsAdded = 0;
      let presetsUpdated = 0;

      // Validação básica
      if (!importedData || !importedData.config) {
        throw new Error('Dados de importação inválidos');
      }

      const importedConfig = AppConfigSchema.parse(importedData.config);

      // Processa cada preset
      for (const importedPreset of importedConfig.presets || []) {
        const existingPreset = this.config.presets?.find(p => p.id === importedPreset.id);

        if (existingPreset) {
          // Atualiza preset existente
          this.updatePreset(importedPreset.id!, importedPreset);
          presetsUpdated++;
          warnings.push(`Preset "${importedPreset.name}" atualizado (ID: ${importedPreset.id})`);
        } else {
          // Adiciona novo preset
          this.addPreset(importedPreset);
          presetsAdded++;
          warnings.push(`Novo preset "${importedPreset.name}" adicionado (ID: ${importedPreset.id})`);
        }
      }

      logger.info(`Importação concluída: ${presetsAdded} adicionados, ${presetsUpdated} atualizados`);

      return {
        presetsAdded,
        presetsUpdated,
        warnings
      };
    } catch (error) {
      logger.error('Erro ao importar configurações:', error);
      throw new Error(`Falha ao importar configurações: ${error}`);
    }
  }

  // ===== MÉTODOS DE SCHEMA MAPS (Audit & Dashboard) =====

  private loadSchemaMaps() {
    try {
      const basePath = (app && app.isPackaged) ? process.resourcesPath : process.cwd();
      const schemaPath = path.join(basePath, 'data', 'schemaMaps.json');

      if (fs.existsSync(schemaPath)) {
        this.schemaMaps = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
        logger.info(`[Config] Schemas carregados: ${Object.keys(this.schemaMaps).join(', ')}`);
      }
    } catch (error: any) {
      logger.error(`[Config] Erro ao carregar schemaMaps.json: ${error.message}`);
    }
  }

  public getSchemaMaps(): SchemaMaps {
    return { ...this.schemaMaps };
  }

  /**
   * Normaliza o tipo de relatório para o padrão do sistema (Singular, Uppercase)
   */
  public normalizeReportType(rawType: string): string {
    if (!rawType) return 'GERAL';
    let type = rawType.toUpperCase().trim();
    if (type === 'VENDAS') type = 'VENDA';
    if (type === 'PEDIDOS') type = 'PEDIDO';
    return type;
  }

  /**
   * Retorna o schema padrão para um tipo, ou nulo se não existir
   */
  public getSchemaByType(rawType: string): SchemaMap | null {
    const type = this.normalizeReportType(rawType);
    return this.schemaMaps[type] || null;
  }
}

// Exporta instância singleton
export const configManager = ConfigManager.getInstance();

// Funções auxiliares
export function validateSiteConfig(site: any): SiteConfig {
  return SiteConfigSchema.parse(site);
}

export function validateAppConfig(config: any): AppConfig {
  return AppConfigSchema.parse(config);
}
