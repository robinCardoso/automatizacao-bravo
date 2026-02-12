import { automationEngine } from './automation-engine';
import { configManager, Preset } from '../../config/config-manager';
import { automationLogger } from '../../config/logger';
import { presetRepository } from './preset-repository';

class SchedulerService {
  private timer: NodeJS.Timeout | null = null;
  private isProcessing: boolean = false;
  private lastRunStart: number | null = null;

  constructor() { }

  /**
   * Inicia o monitoramento de agendamentos
   */
  public start() {
    if (this.timer) return;

    automationLogger.info('Iniciando Serviço de Agendamento Bravo');
    // Verifica a cada 1 minuto
    this.timer = setInterval(() => this.checkSchedules(), 60 * 1000);
    this.checkSchedules(); // Execução inicial imediata
  }

  /**
   * Para o monitoramento
   */
  public stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Verifica se há presets que precisam ser executados agora
   */
  private async checkSchedules() {
    // Watchdog de Estado: Se estiver processando há mais de 3 horas, houve um travamento inesperado
    // que o timer interno do engine não pegou. Forçamos o reset.
    if (this.isProcessing && this.lastRunStart && (Date.now() - this.lastRunStart > 3 * 60 * 60 * 1000)) {
      automationLogger.error('[Scheduler] [CRÍTICO] Detectado estado de travamento (3h+ em execução). Forçando reinicialização do serviço.');
      this.isProcessing = false;
    }

    if (this.isProcessing) return;
    this.isProcessing = true;
    this.lastRunStart = Date.now();

    try {
      const config = configManager.getConfig();

      // NOVO: Pausa Global
      if (config.schedulerEnabled === false) {
        automationLogger.debug('[Scheduler] Pausado globalmente.');
        return;
      }

      const presets = config.presets || [];
      const now = new Date();

      for (const preset of presets) {
        if (!preset.schedule || !preset.schedule.enabled) continue;

        // Se não tem próxima execução calculada, calcula agora
        if (!preset.schedule.nextRun) {
          this.calculateNextRun(preset);
          continue;
        }

        const nextRun = new Date(preset.schedule.nextRun);
        const compensationPolicy = (preset.schedule as any).compensationPolicy || 'immediate';

        // Verifica se a execução está atrasada
        const isDelayedExecution = now >= nextRun;

        if (isDelayedExecution) {
          let shouldExecute = false;

          switch (compensationPolicy) {
            case 'immediate':
              // Política atual - executa imediatamente
              shouldExecute = true;
              break;

            case 'skip':
              // Pula execução se estiver muito atrasada
              const maxDelayHours = (preset.schedule as any).maxCompensationDelay || 24;
              const hoursSinceScheduled = (now.getTime() - nextRun.getTime()) / (1000 * 60 * 60);

              if (hoursSinceScheduled <= maxDelayHours || maxDelayHours === 0) {
                shouldExecute = true;
                automationLogger.info(`[Scheduler] Executando tarefa atrasada para: ${preset.name} (atraso: ${hoursSinceScheduled.toFixed(1)}h)`);
              } else {
                automationLogger.warn(`[Scheduler] Tarefa atrasada ignorada devido ao tempo excessivo: ${preset.name} (atraso: ${hoursSinceScheduled.toFixed(1)}h)`);
                // Calcula próximo horário sem executar
                this.calculateNextRun(preset);
                continue;
              }
              break;

            case 'delayed':
              // Executa apenas se o atraso for pequeno (ex: menos de 10 minutos)
              const maxImmediateDelayMinutes = 10;
              const minutesSinceScheduled = (now.getTime() - nextRun.getTime()) / (1000 * 60);

              if (minutesSinceScheduled <= maxImmediateDelayMinutes) {
                shouldExecute = true;
                automationLogger.info(`[Scheduler] Executando tarefa atrasada dentro do limite: ${preset.name}`);
              } else {
                automationLogger.info(`[Scheduler] Tarefa agendada para ${preset.name} está fora do limite de execução imediata, aguardando próximo ciclo.`);
                // Neste caso, recalculamos o próximo horário e pulamos esta execução
                this.calculateNextRun(preset);
                continue;
              }
              break;
          }

          if (shouldExecute) {
            automationLogger.info(`[Scheduler] Disparando execução agendada para: ${preset.name}`);

            try {
              // Tenta rodar. Se o engine estiver ocupado, ele vai disparar um erro que capturaremos.
              await automationEngine.runAutomation({ presetId: preset.id });

              // Após sucesso, calcula a próxima data
              this.calculateNextRun(preset);
            } catch (error: any) {
              if (error.message === 'Automação já está em execução') {
                automationLogger.warn(`[Scheduler] Adiado: Engine ocupado. Tentará novamente no próximo ciclo para ${preset.name}`);
              } else {
                automationLogger.error(`[Scheduler] Falha na execução agendada de ${preset.name}: ${error.message}`);
                // Mesmo com erro, reagendamos para não travar o loop infinito de erro
                this.calculateNextRun(preset);
              }
            }
          }
        }
      }
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Calcula a próxima execução baseada no modo (Intervalo ou Horário Fixo)
   */
  private calculateNextRun(preset: Preset) {
    if (!preset.id || !preset.schedule) return;

    const now = new Date();
    let nextRun = new Date();

    if (preset.schedule.mode === 'interval') {
      // Modo Intervalo: Agora + X horas
      nextRun.setHours(now.getHours() + (preset.schedule.intervalHours || 3));
    } else {
      // Modo Horário Fixo: Busca o próximo horário da lista
      const times = preset.schedule.fixedTimes || [];
      if (times.length === 0) {
        preset.schedule.enabled = false;
        automationLogger.warn(`[Scheduler] Preset ${preset.name} desativado: Nenhum horário fixo definido.`);
      } else {
        // Lógica simplificada: pega o primeiro horário do dia que seja maior que agora
        // Se não houver, pega o primeiro horário do dia seguinte
        const sortedTimes = [...times].sort();
        const currentTimeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

        const nextTime = sortedTimes.find(t => t > currentTimeStr) || sortedTimes[0];
        const [hours, minutes] = nextTime.split(':').map(Number);

        nextRun.setHours(hours, minutes, 0, 0);

        if (nextRun <= now) {
          nextRun.setDate(nextRun.getDate() + 1);
        }
      }
    }

    // Salva a nova data no preset
    presetRepository.update(preset.id, {
      schedule: {
        ...preset.schedule,
        nextRun: nextRun.toISOString()
      }
    });

    automationLogger.info(`[Scheduler] Próxima execução de ${preset.name} definida para: ${nextRun.toLocaleString()}`);
  }
}

export const schedulerService = new SchedulerService();