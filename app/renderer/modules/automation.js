// automation.js - Controle de Automação
import { Utils } from './utils.js';
import { State } from './state.js';
import { UI } from './ui.js';

export const Automation = {
    async startAutomation() {
        if (State.isRunning) {
            Utils.showNotification('Já existe uma automação em execução.', 'warning');
            return;
        }

        const selector = document.getElementById('mainPresetSelector');
        const presetId = selector ? selector.value : null;

        if (!presetId) {
            Utils.showNotification('Por favor, selecione um Preset antes de iniciar.', 'warning');
            return;
        }

        UI.toggleButtons(true);

        try {
            Utils.log(`🔄 Iniciando automação com o preset: ${selector.options[selector.selectedIndex].text}`);

            // Limpa o resumo visual e o dashboard antes de começar
            const summarySteps = document.getElementById('summarySteps');
            if (summarySteps) summarySteps.innerHTML = '';

            const auditTableBody = document.getElementById('auditTableBody');
            if (auditTableBody) auditTableBody.innerHTML = '';

            // No novo layout, o summary fica oculto por padrão
            const summary = document.getElementById('workflowSummary');
            if (summary) summary.style.display = 'none';

            // NOVO: Verifica se há um site/UF específico selecionado
            const ufSelector = document.getElementById('mainUFSelector');
            const siteId = ufSelector ? ufSelector.value : null;

            const automationOptions = { presetId };
            if (siteId) {
                automationOptions.siteIds = [siteId];
                Utils.log(`📍 Execução focada na filial selecionada: ${ufSelector.options[ufSelector.selectedIndex].text}`);
            }

            const result = await window.electronAPI.startAutomation(automationOptions);
            if (!result?.success) {
                Utils.log(`⚠️ ${result?.message || 'Não foi possível iniciar a automação.'}`);
                Utils.showNotification(result?.message || 'Não foi possível iniciar a automação.', 'warning');
                UI.toggleButtons(false);
                return;
            }

            Utils.log(`✅ ${result.message}`);
        } catch (error) {
            UI.toggleButtons(false);
            Utils.log(`❌ Erro ao iniciar automação: ${error}`);
            Utils.showNotification(`Erro: ${error}`, 'error');
        }
    },

    async stopAutomation() {
        const stopBtn = document.getElementById('stopBtn');
        if (stopBtn) stopBtn.disabled = true;

        try {
            Utils.log('🛑 [PANIC] Solicitando parada imediata da automação...');
            const result = await window.electronAPI.stopAutomation();
            Utils.log(`✅ ${result?.message || 'Automação parada.'}`);
            Utils.showNotification('Automação interrompida!', 'warning');
        } catch (error) {
            Utils.log(`❌ Erro ao parar automação: ${error}`);
            Utils.showNotification(`Erro: ${error}`, 'error');
        } finally {
            UI.toggleButtons(false);
        }
    }
};
