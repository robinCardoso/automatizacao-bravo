// automation.js - Controle de Automação
import { Utils } from './utils.js';
import { State } from './state.js';
import { UI } from './ui.js';

export const Automation = {
    async startAutomation() {
        const selector = document.getElementById('mainPresetSelector');
        const presetId = selector ? selector.value : null;

        if (!presetId) {
            Utils.showNotification('Por favor, selecione um Preset antes de iniciar.', 'warning');
            return;
        }

        try {
            Utils.log(`🔄 Iniciando automação com o preset: ${selector.options[selector.selectedIndex].text}`);

            // Atualiza UI para modo execução
            const auditStatus = document.getElementById('auditStatus');
            if (auditStatus) {
                auditStatus.textContent = 'Executando...';
                auditStatus.className = 'status-badge badge-running';
            }

            // Limpa o resumo visual e o dashboard antes de começar
            const summarySteps = document.getElementById('summarySteps');
            if (summarySteps) summarySteps.innerHTML = '';

            const auditTableBody = document.getElementById('auditTableBody');
            if (auditTableBody) auditTableBody.innerHTML = '';

            // No novo layout, o summary fica oculto por padrão
            const summary = document.getElementById('workflowSummary');
            if (summary) summary.style.display = 'none';

            const result = await window.electronAPI.startAutomation({ presetId });
            Utils.log(`✅ ${result.message}`);

            UI.toggleButtons(true);
        } catch (error) {
            Utils.log(`❌ Erro ao iniciar automação: ${error}`);
            Utils.showNotification(`Erro: ${error}`, 'error');
        }
    },

    async stopAutomation() {
        try {
            Utils.log('🛑 Solicitando parada da automação...');
            const result = await window.electronAPI.stopAutomation();
            Utils.log(`✅ ${result.message}`);
            UI.toggleButtons(false);
        } catch (error) {
            Utils.log(`❌ Erro ao parar automação: ${error}`);
            Utils.showNotification(`Erro: ${error}`, 'error');
        }
    }
};
