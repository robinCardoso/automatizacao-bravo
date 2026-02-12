# Plano para Comportamento de Agendamento Após Início Tardio do Aplicativo

## Análise do Comportamento Atual do Sistema

### 1. Arquitetura de Agendamento Atual
**Arquivo principal**: [app/automation/engine/scheduler-service.ts](file:///c:/Users/Robson-PC/.antigravity/projetos/automatizador-bravo/app/automation/engine/scheduler-service.ts)

O sistema atual opera com o seguinte comportamento:

- O serviço de agendamento é iniciado no início do aplicativo ([linha 372 em main.ts](file:///c:/Users/Robson-PC/.antigravity/projetos/automatizador-bravo/app/electron/main.ts#L372))
- Um timer verifica a cada 1 minuto se algum preset agendado precisa ser executado ([linha 21 em scheduler-service.ts](file:///c:/Users/Robson-PC/.antigravity/projetos/automatizador-bravo/app/automation/engine/scheduler-service.ts#L21))
- Na inicialização, o serviço executa imediatamente uma verificação ([linha 22 em scheduler-service.ts](file:///c:/Users/Robson-PC/.antigravity/projetos/automatizador-bravo/app/automation/engine/scheduler-service.ts#L22))

### 2. Lógica de Verificação de Agendamento
**Método**: [checkSchedules()](file:///c:/Users/Robson-PC/.antigravity/projetos/automatizador-bravo/app/automation/engine/scheduler-service.ts#L38-L96)

O sistema compara:
- Hora atual (now) com o próximo horário agendado (nextRun)
- Se `now >= nextRun`, o sistema executa imediatamente o preset agendado
- Após a execução, recalcula o próximo horário de execução

### 3. Tipos de Agendamento Suportados
1. **Intervalo**: Executa a cada X horas (ex: a cada 3 horas)
2. **Horários Fixos**: Executa em horários específicos do dia

## Comportamento Atual Quando o Aplicativo é Aberto Tardiamente

### Situação Exemplo:
- Preset agendado para executar diariamente às 13:00
- Aplicativo é aberto às 13:10 (10 minutos após o horário agendado)

### Comportamento Atual:
1. O serviço de agendamento inicia e executa imediatamente uma verificação
2. O sistema detecta que `13:10 >= 13:00` (now >= nextRun)
3. **RESULTADO**: O sistema executa imediatamente a tarefa agendada

## Recomendação de Melhor Prática

### Opção 1: Execução Imediata (Comportamento Atual)
**Vantagens:**
- Garante que tarefas agendadas sejam executadas mesmo após falhas de inicialização
- Mantém a frequência de execução conforme configurada
- Evita perda de execuções programadas

**Desvantagens:**
- Pode causar execuções inesperadas quando o usuário abre o aplicativo
- Pode sobrecarregar o sistema se muitos agendamentos forem perdidos
- Pode não ser o comportamento desejado em ambientes sensíveis a horários

### Opção 2: Aguardar Próximo Ciclo
**Vantagens:**
- Evita execuções inesperadas quando o aplicativo é aberto
- Maior previsibilidade para o usuário
- Menor carga imediata no sistema

**Desvantagens:**
- Pode perder execuções agendadas se o sistema ficar off-line por muito tempo
- Viola o princípio de "executar conforme agendado"

### Opção Recomendada: Estratégia Híbrida com Configuração de Política

## Solução Proposta: Política Configurável de Compensação de Agendamento

### 1. Modificação no Esquema de Configuração
**Arquivo**: [app/config/config-manager.ts](file:///c:/Users/Robson-PC/.antigravity/projetos/automatizador-bravo/app/config/config-manager.ts)

Adicionar política de compensação no esquema de agendamento:

```typescript
schedule: z.object({
  enabled: z.boolean().default(false),
  mode: z.enum(['interval', 'fixed']).default('interval'),
  intervalHours: z.number().min(1).max(24).default(3),
  fixedTimes: z.array(z.string()).default([]),
  nextRun: z.string().optional(),
  compensationPolicy: z.enum(['immediate', 'skip', 'delayed']).default('immediate'),
  maxCompensationDelay: z.number().min(0).max(168).default(24) // Horas máximas para compensar
}).optional()
```

### 2. Atualização da Lógica de Verificação de Agendamento
**Arquivo**: [app/automation/engine/scheduler-service.ts](file:///c:/Users/Robson-PC/.antigravity/projetos/automatizador-bravo/app/automation/engine/scheduler-service.ts)

Modificar o método [checkSchedules()](file:///c:/Users/Robson-PC/.antigravity/projetos/automatizador-bravo/app/automation/engine/scheduler-service.ts#L38-L96) para considerar a política de compensação:

```typescript
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
      const compensationPolicy = preset.schedule.compensationPolicy || 'immediate';

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
            const maxDelayHours = preset.schedule.maxCompensationDelay || 24;
            const hoursSinceScheduled = (now.getTime() - nextRun.getTime()) / (1000 * 60 * 60);
            
            if (hoursSinceScheduled <= maxDelayHours) {
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
              automationLogger.info(`[Scheduler] Tarefa agendada para ${preset.name} está fora do limite de execução imediata, aguardando próximo ciclo`);
              // Neste caso, recalculamos o próximo horário baseado no horário atual
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
```

### 3. Atualização da Interface de Configuração
**Arquivo**: [app/renderer/index.html](file:///c:/Users/Robson-PC/.antigravity/projetos/automatizador-bravo/app/renderer/index.html)

Adicionar opções de política de compensação na interface de agendamento:

```html
<!-- SEÇÃO DE AGENDAMENTO (COMPACTADO) - Atualização -->
<div class="config-section-title"
    style="display: flex; align-items: center; justify-content: space-between;">
    <span>Agendamento Automático</span>
    <label
        style="display: flex; align-items: center; gap: 8px; cursor: pointer; margin: 0; font-weight: normal; text-transform: none;">
        <input type="checkbox" id="pSchedEnabled"
            style="width: 14px; height: 14px; accent-color: #3498db;"
            onchange="toggleScheduleOptions()">
        <span style="font-size: 11px; color: #7f8c8d;">Ativar para este Preset</span>
    </label>
</div>

<div id="schedOptions"
    style="display: none; background: #f8f9fa; border: 1px solid #dce4ec; border-radius: 8px; padding: 12px; margin-bottom: 20px;">
    <!-- Opções existentes -->
    <div style="display: flex; gap: 15px; align-items: flex-end; flex-wrap: wrap;">
        <div style="flex: 1; min-width: 200px;">
            <label class="form-label">Modo de Repetição</label>
            <select id="pSchedMode" class="form-control" onchange="toggleScheduleMode()">
                <option value="interval">Por Intervalo (ex: cada 3h)</option>
                <option value="fixed">Horários Fixos (ex: 08:00)</option>
            </select>
        </div>
        
        <!-- Nova seção: Política de Compensação -->
        <div style="flex: 1; min-width: 200px;">
            <label class="form-label">Política de Compensação</label>
            <select id="pCompensationPolicy" class="form-control">
                <option value="immediate">Executar imediatamente</option>
                <option value="skip">Ignorar se atrasada demais</option>
                <option value="delayed">Apenas para pequenos atrasos</option>
            </select>
        </div>
    </div>

    <!-- Grupo de intervalo - existente -->
    <div id="intervalGroup" style="flex: 1; min-width: 150px;">
        <label class="form-label">Executar a cada (Horas)</label>
        <input type="number" id="pSchedInterval" class="form-control" min="1" max="24"
            value="3">
    </div>

    <!-- Nova configuração: Tempo máximo de compensação -->
    <div id="compensationDelayGroup" style="flex: 1; min-width: 150px; margin-top: 10px;">
        <label class="form-label">Tempo máx. compensação (horas)</label>
        <input type="number" id="pMaxCompensationDelay" class="form-control" min="0" max="168"
            value="24" placeholder="Ex: 24 para 1 dia">
        <small style="font-size: 10px; color: #7f8c8d; display: block; margin-top: 4px;">
            Tempo máximo para executar tarefas atrasadas (0 = ilimitado)
        </small>
    </div>

    <!-- Restante do HTML existente -->
    <div id="fixedGroup" style="display: none; flex: 1.5; min-width: 250px;">
        <label class="form-label">Gestão de Horários</label>
        <div style="display: flex; gap: 8px;">
            <input type="time" id="pSchedTimeInput" class="form-control">
            <button class="btn btn-primary" onclick="addFixedTime()"
                style="padding: 0 15px; height: 38px; white-space: nowrap;">ADICIONAR</button>
        </div>
    </div>

    <div id="fixedTimesBadges"
        style="display: none; flex-wrap: wrap; gap: 6px; margin-top: 10px; padding: 8px; background: #ffffff; border: 1px solid #dce4ec; border-radius: 8px; min-height: 40px;">
        <!-- Badges de horários aparecerão aqui -->
    </div>

    <div id="nextRunPreview"
        style="font-size: 10px; color: #3498db; margin-top: 8px; font-weight: 600;"></div>
</div>
```

### 4. Atualização da Lógica de UI para Gerenciamento de Presets
**Arquivo**: [app/renderer/modules/presets.js](file:///c:/Users/Robson-PC/.antigravity/projetos/automatizador-bravo/app/renderer/modules/presets.js)

Adaptar a lógica de salvamento e carregamento de presets para incluir as novas opções de política:

```javascript
// Atualizar o método handleSavePreset para incluir política de compensação
async handleSavePreset() {
    const id = document.getElementById('presetId').value;
    const name = document.getElementById('pName').value;
    const type = document.getElementById('pType').value;
    const login = document.getElementById('pLogin').value;
    const pass = document.getElementById('pPass').value;
    const destination = document.getElementById('pDestination').value;

    if (!name || !login) {
        Utils.showNotification('Preencha os campos obrigatórios!', 'warning');
        return;
    }

    // Dados de Agendamento - Atualizado
    const schedule = {
        enabled: document.getElementById('pSchedEnabled').checked,
        mode: document.getElementById('pSchedMode').value,
        intervalHours: parseInt(document.getElementById('pSchedInterval').value) || 3,
        fixedTimes: State.fixedTimes,
        compensationPolicy: document.getElementById('pCompensationPolicy').value || 'immediate',
        maxCompensationDelay: parseInt(document.getElementById('pMaxCompensationDelay').value) || 24
    };

    const presetData = {
        id: id || `preset-${Date.now()}`,
        name,
        type,
        login,
        pass,
        destination,
        schedule,
        sites: [] // Novos presets começam sem sites. Em edição, precisamos preservar.
    };

    // ... restante do código existente
}

// Atualizar o método para carregar os dados de agendamento
fillPresetForm(preset) {
    // ... código existente ...
    
    if (preset.schedule) {
        document.getElementById('pSchedEnabled').checked = preset.schedule.enabled;
        document.getElementById('pSchedMode').value = preset.schedule.mode || 'interval';
        document.getElementById('pSchedInterval').value = preset.schedule.intervalHours || 3;
        
        // Novos campos
        document.getElementById('pCompensationPolicy').value = preset.schedule.compensationPolicy || 'immediate';
        document.getElementById('pMaxCompensationDelay').value = preset.schedule.maxCompensationDelay || 24;

        State.fixedTimes = preset.schedule.fixedTimes || [];
        this.renderTimeBadges();
        this.toggleScheduleOptions();
        this.toggleScheduleMode();
    }

    // ... restante do código existente ...
}
```

## Comportamento Recomendado para o Caso de Uso

### Situação Exemplo:
- Preset agendado para executar diariamente às 13:00
- Aplicativo é aberto às 13:10 (10 minutos após o horário agendado)
- Política configurada como "Apenas para pequenos atrasos" com limite de 10 minutos

### Comportamento Resultante:
1. O sistema detecta que a tarefa está atrasada em 10 minutos
2. Como o atraso está dentro do limite de 10 minutos, a tarefa é executada imediatamente
3. O sistema calcula o próximo horário de execução (próxima data às 13:00)

### Se a política fosse "Ignorar se atrasada demais":
1. O sistema detecta o atraso de 10 minutos
2. Compara com o limite de compensação (ex: 24 horas)
3. Como 10 minutos < 24 horas, a tarefa é executada imediatamente
4. O sistema calcula o próximo horário de execução

### Se a política fosse "Executar imediatamente" (padrão):
1. O sistema ignora o tempo de atraso
2. A tarefa é executada imediatamente
3. O sistema calcula o próximo horário de execução

## Benefícios da Solução Proposta

1. **Flexibilidade**: Permite que o administrador escolha o comportamento mais apropriado para cada preset
2. **Controle de Qualidade**: Evita execuções inesperadas em ambientes sensíveis a horários
3. **Manutenção de SLA**: Garante que tarefas críticas sejam executadas mesmo após falhas
4. **Visibilidade**: O sistema registra claramente quando execuções são puladas devido a políticas
5. **Compatibilidade**: Mantém o comportamento padrão atual (execução imediata) para retrocompatibilidade

Esta abordagem oferece o melhor dos dois mundos: permite tanto a execução imediata quanto a política de pular execuções atrasadas, dependendo das necessidades específicas de cada ambiente.