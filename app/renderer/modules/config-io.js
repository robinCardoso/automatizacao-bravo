// config-io.js - Importação e Exportação de Configurações
import { Utils } from './utils.js';
import { Presets } from './presets.js'; // Para recarregar presets após import

export const ConfigIO = {
    /**
     * Exporta todas as configurações para um arquivo JSON
     */
    async exportAllConfigs() {
        try {
            Utils.log('📤 Iniciando exportação de configurações...');

            const result = await window.electronAPI.exportConfig();

            if (result.success) {
                // Cria blob com os dados exportados
                const jsonStr = JSON.stringify(result.data, null, 2);
                const blob = new Blob([jsonStr], { type: 'application/json' });

                // Cria elemento de download
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `automatizador-bravo-export-${new Date().toISOString().split('T')[0]}.json`;
                document.body.appendChild(a);
                a.click();

                // Limpa
                setTimeout(() => {
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                }, 100);

                Utils.showNotification('✅ Configurações exportadas com sucesso!', 'success');
                Utils.log(`📤 Exportação concluída: ${result.data.config.presets?.length || 0} presets`);
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            Utils.log(`❌ Erro na exportação: ${error}`);
            Utils.showNotification(`Erro na exportação: ${error.message}`, 'error');
        }
    },

    /**
     * Importa configurações de um arquivo JSON
     */
    async importConfigs() {
        const fileInput = document.getElementById('importConfigFile');
        const file = fileInput.files[0];

        if (!file) {
            Utils.showNotification('Por favor, selecione um arquivo JSON para importar', 'warning');
            return;
        }

        try {
            Utils.log('📥 Iniciando importação de configurações...');

            // Lê o arquivo
            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const importedData = JSON.parse(e.target.result);

                    // Confirmação do usuário
                    const confirmMsg = `Deseja realmente importar as configurações?\n\n` +
                        `Serão adicionados/atualizados ${importedData.config?.presets?.length || 0} presets.`;

                    if (!confirm(confirmMsg)) {
                        return;
                    }

                    // Realiza a importação
                    const result = await window.electronAPI.importConfig(importedData);

                    if (result.success) {
                        const { presetsAdded, presetsUpdated, warnings } = result.result;

                        Utils.showNotification(
                            `✅ Importação concluída!\n` +
                            `${presetsAdded} presets adicionados\n` +
                            `${presetsUpdated} presets atualizados`,
                            'success'
                        );

                        // Exibe avisos se houver
                        if (warnings.length > 0) {
                            Utils.log('⚠️ Avisos da importação:');
                            warnings.forEach(warning => Utils.log(`   • ${warning}`));
                        }

                        Utils.log(`📥 Importação concluída: ${presetsAdded} adicionados, ${presetsUpdated} atualizados`);

                        // Atualiza a interface
                        Presets.loadPresets();
                        Presets.loadPresetsToMain();
                        fileInput.value = ''; // Limpa o input
                    } else {
                        throw new Error(result.error);
                    }
                } catch (parseError) {
                    Utils.log(`❌ Erro ao processar arquivo: ${parseError}`);
                    Utils.showNotification(`Arquivo inválido: ${parseError.message}`, 'error');
                }
            };

            reader.readAsText(file);
        } catch (error) {
            Utils.log(`❌ Erro na importação: ${error}`);
            Utils.showNotification(`Erro na importação: ${error.message}`, 'error');
        }
    }
};
