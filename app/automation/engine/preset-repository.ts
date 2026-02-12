import { configManager, Preset } from '../../config/config-manager';
import logger from '../../config/logger';

export class PresetRepository {
  public getAll(): Preset[] {
    return configManager.getPresets();
  }

  public getById(id: string): Preset | undefined {
    return this.getAll().find(p => p.id === id);
  }

  public create(preset: Preset): Preset {
    configManager.addPreset(preset);
    // Retorna o último adicionado (ou busca pelo ID se necessário)
    const presets = this.getAll();
    return presets[presets.length - 1];
  }

  public update(id: string, preset: Partial<Preset>): void {
    configManager.updatePreset(id, preset);
  }

  public delete(id: string): void {
    configManager.removePreset(id);
  }

  public markAsUsed(id: string): void {
    this.update(id, { lastUsedAt: new Date().toISOString() });
    logger.info(`Preset ${id} marcado como usado em ${new Date().toISOString()}`);
  }
}

export const presetRepository = new PresetRepository();