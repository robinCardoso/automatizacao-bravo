// main.js - Entry point (Modularized)
import { Utils } from './modules/utils.js';
import { State } from './modules/state.js';
import { UI } from './modules/ui.js';
import { Presets, setSitesModule } from './modules/presets.js';
import { Sites } from './modules/sites.js';
import { Sessions } from './modules/sessions.js';
import { Automation } from './modules/automation.js';
import { ConfigIO } from './modules/config-io.js';
import { Dashboard } from './modules/dashboard.js';

// Resolve depência circular (Sites precisa ser chamado por Presets)
setSitesModule(Sites);

// Inicialização
window.addEventListener('DOMContentLoaded', () => {
    Utils.log('🚀 Interface corporativa carregada (Modular)');
    Utils.log('💡 Dica: Selecione um preset e clique em INICIAR para começar.');

    // Inicia componentes
    Presets.loadPresets();
    Presets.loadPresetsToMain();
    Sessions.loadSessions();

    // Verificação de resoluções (mantido para compatibilidade)
    const screenWidth = screen.width;
    const screenHeight = screen.height;
    if (screenWidth >= 1366 && screenHeight >= 768) {
        if (screenWidth >= 1920 && screenHeight >= 1080) {
            Utils.log('🎯 Resolução ideal (Full HD) detectada');
        }
    } else {
        Utils.log('⚠️ Resolução abaixo do recomendado para ambiente corporativo');
    }

    // Listeners de Validação SMTP
    const smtpInputs = [
        { id: 'cfgSmtpHost', validate: validateSmtpHost },
        { id: 'cfgSmtpPort', validate: validateSmtpPort },
        { id: 'cfgSmtpUser', validate: validateSmtpUser },
        { id: 'cfgSmtpPass', validate: () => UI.updateSmtpStatus('idle') }
    ];

    smtpInputs.forEach(input => {
        const el = document.getElementById(input.id);
        if (el) {
            el.addEventListener('blur', input.validate);
        }
    });
});

function validateSmtpHost() {
    const host = document.getElementById('cfgSmtpHost').value;
    if (!host) return;
    const isValid = /^[a-zA-Z0-9][a-zA-Z0-9-]{1,61}[a-zA-Z0-9](\.[a-zA-Z0-9][a-zA-Z0-9-]{1,61}[a-zA-Z0-9])*$/g.test(host);
    if (!isValid) {
        UI.updateSmtpStatus('invalid', 'Host SMTP inválido');
    } else {
        UI.updateSmtpStatus('idle');
    }
}

function validateSmtpPort() {
    const port = parseInt(document.getElementById('cfgSmtpPort').value);
    if (isNaN(port)) return;
    const isValid = port >= 1 && port <= 65535;
    if (!isValid) {
        UI.updateSmtpStatus('invalid', 'Porta inválida (1-65535)');
    } else {
        UI.updateSmtpStatus('idle');
    }
}

function validateSmtpUser() {
    const user = document.getElementById('cfgSmtpUser').value;
    if (!user) return;
    const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user);
    if (!isValid) {
        UI.updateSmtpStatus('invalid', 'E-mail inválido');
    } else {
        UI.updateSmtpStatus('idle');
    }
}

// Expondo funções para o escopo global (para funcionar com onclick no HTML)
window.log = Utils.log;
window.updateStatus = Utils.updateStatus;
window.toggleButtons = UI.toggleButtons;
window.toggleSummary = UI.toggleSummary;
window.openModal = UI.openModal;
window.closeModal = UI.closeModal;
window.switchConfigTab = UI.switchConfigTab;

// Dashboard
window.switchView = Dashboard.switchView.bind(Dashboard);
window.Dashboard = Dashboard;

// Presets
// Presets
window.loadPresetsToMain = Presets.loadPresetsToMain.bind(Presets);
window.loadPresets = Presets.loadPresets.bind(Presets);
window.handleSavePreset = Presets.handleSavePreset.bind(Presets);
window.showPresetForm = () => Presets.openNewPresetForm();
window.hidePresetForm = Presets.hidePresetForm.bind(Presets);
window.editPreset = Presets.fillPresetForm.bind(Presets);
window.deletePreset = Presets.deletePreset.bind(Presets);
window.toggleScheduleOptions = Presets.toggleScheduleOptions.bind(Presets);
window.toggleScheduleMode = Presets.toggleScheduleMode.bind(Presets);
window.addFixedTime = Presets.addFixedTime.bind(Presets);
window.removeFixedTime = Presets.removeFixedTime.bind(Presets);
window.renderTimeBadges = Presets.renderTimeBadges.bind(Presets);

// Sites
window.loadSites = Sites.loadSites.bind(Sites);
window.showSiteForm = Sites.showSiteForm.bind(Sites);
window.hideSiteForm = Sites.hideSiteForm.bind(Sites);
window.addStepRow = Sites.addStepRow.bind(Sites);
window.insertStepAbove = Sites.insertStepAbove.bind(Sites);
window.handleSaveSite = Sites.handleSaveSite.bind(Sites);
window.editSite = Sites.editSite.bind(Sites);
window.deleteSite = Sites.deleteSite.bind(Sites);
window.duplicateSite = Sites.duplicateSite.bind(Sites);
window.openBrowserForLogin = Sites.openBrowserForLogin.bind(Sites);

// Automation
window.startAutomation = Automation.startAutomation.bind(Automation);
window.stopAutomation = Automation.stopAutomation.bind(Automation);
window.toggleGlobalSchedule = async () => {
    const config = await window.electronAPI.getConfig();
    config.schedulerEnabled = !config.schedulerEnabled;
    await window.electronAPI.saveConfig(config);
    // Refresh presets to update icons
    Presets.loadPresets();
    Utils.showNotification(config.schedulerEnabled ? 'Agendamentos retomados' : 'Agendamentos pausados', 'info');
};

// Sessions
window.manageSessions = Sessions.manageSessions.bind(Sessions);
window.openSessionBrowser = Sessions.openSessionBrowser.bind(Sessions);
window.deleteIndividualSession = Sessions.deleteIndividualSession.bind(Sessions);
window.clearAllSessions = Sessions.clearAllSessions.bind(Sessions);
window.newSession = Sessions.newSession.bind(Sessions);

// Config IO (Recovered functionality)
window.exportAllConfigs = ConfigIO.exportAllConfigs.bind(ConfigIO);
window.importConfigs = ConfigIO.importConfigs.bind(ConfigIO);

window.toggleSmtpAuthDisplay = UI.toggleSmtpAuthDisplay.bind(UI);
window.openConfig = () => UI.openModal('configModal');

window.saveConfig = async () => {
    try {
        const config = await window.electronAPI.getConfig();
        const elHeadless = document.getElementById('cfgHeadless');
        const elDelay = document.getElementById('actionDelay');
        const elTimeout = document.getElementById('timeout');
        const elRetries = document.getElementById('maxRetries');

        if (elHeadless) config.headless = elHeadless.checked;
        if (elDelay) config.actionDelay = parseInt(elDelay.value);
        if (elTimeout) config.defaultTimeout = parseInt(elTimeout.value) * 1000;
        if (elRetries) config.defaultRetries = parseInt(elRetries.value);

        // Coleta Notificações
        const notifications = {
            enabled: document.getElementById('cfgEmailEnabled').checked,
            smtp: {
                host: document.getElementById('cfgSmtpHost').value,
                port: parseInt(document.getElementById('cfgSmtpPort').value),
                secure: document.getElementById('cfgSmtpPort').value === '465',
                user: document.getElementById('cfgSmtpUser').value,
                pass: document.getElementById('cfgSmtpPass').value,
                authType: document.getElementById('cfgSmtpAuthType').value,
                clientId: document.getElementById('cfgSmtpClientId').value,
                clientSecret: document.getElementById('cfgSmtpClientSecret').value,
                refreshToken: document.getElementById('cfgSmtpRefreshToken').value
            },
            fallbackSmtp: {
                host: document.getElementById('cfgSmtpFallbackHost').value,
                port: parseInt(document.getElementById('cfgSmtpFallbackPort').value) || 587,
                secure: document.getElementById('cfgSmtpFallbackPort').value === '465',
                user: document.getElementById('cfgSmtpFallbackUser').value,
                pass: document.getElementById('cfgSmtpFallbackPass').value
            },
            recipient: document.getElementById('cfgEmailRecipient').value,
            retryAttempts: parseInt(document.getElementById('cfgEmailRetry').value) || 3,
            showLogo: document.getElementById('cfgShowLogo').checked,
            compactLayout: document.getElementById('cfgCompactLayout').checked
        };

        config.notifications = notifications;

        await window.electronAPI.saveConfig(config);

        Utils.showNotification('Configurações salvas com sucesso!', 'success');
        UI.closeModal('configModal');
    } catch (error) {
        Utils.showNotification(`Erro ao salvar: ${error.message}`, 'error');
    }
};

// Stubs/Ações Globais
window.testSmtpConnection = async () => {
    try {
        UI.updateSmtpStatus('checking', 'Testando conexão SMTP...');

        const authType = document.getElementById('cfgSmtpAuthType').value;
        const smtpConfig = {
            host: document.getElementById('cfgSmtpHost').value,
            port: parseInt(document.getElementById('cfgSmtpPort').value),
            secure: document.getElementById('cfgSmtpPort').value === '465',
            user: document.getElementById('cfgSmtpUser').value,
            pass: document.getElementById('cfgSmtpPass').value,
            authType: authType,
            clientId: document.getElementById('cfgSmtpClientId').value,
            clientSecret: document.getElementById('cfgSmtpClientSecret').value,
            refreshToken: document.getElementById('cfgSmtpRefreshToken').value
        };

        if (!smtpConfig.host || (!smtpConfig.user && authType !== 'oauth2')) {
            UI.updateSmtpStatus('invalid', 'Campos obrigatórios ausentes');
            Utils.showNotification('Preencha as configurações obrigatórias', 'warning');
            return;
        }

        const result = await window.electronAPI.testSmtpConnection(smtpConfig);

        if (result.success) {
            UI.updateSmtpStatus('valid', 'Conexão bem-sucedida!');
            Utils.showNotification('SMTP Conectado com sucesso!', 'success');
        } else {
            UI.updateSmtpStatus('invalid', `Erro: ${result.error}`);
            Utils.showNotification(`Falha na conexão: ${result.error}`, 'error');
        }
    } catch (error) {
        UI.updateSmtpStatus('invalid', 'Erro ao testar');
        Utils.showNotification(`Erro: ${error.message}`, 'error');
    }
};

window.sendTestEmail = async () => {
    const recipient = document.getElementById('cfgEmailRecipient').value;
    const smtpUser = document.getElementById('cfgSmtpUser').value;

    const targetRecipient = recipient || smtpUser;

    if (!targetRecipient) {
        Utils.showNotification('Informe o Destinatário ou Usuário SMTP primeiro', 'warning');
        return;
    }

    try {
        Utils.showNotification('Enviando e-mail de teste...', 'info');

        const authType = document.getElementById('cfgSmtpAuthType').value;
        const smtpConfig = {
            host: document.getElementById('cfgSmtpHost').value,
            port: parseInt(document.getElementById('cfgSmtpPort').value),
            secure: document.getElementById('cfgSmtpPort').value === '465',
            user: smtpUser,
            pass: document.getElementById('cfgSmtpPass').value,
            authType: authType,
            clientId: document.getElementById('cfgSmtpClientId').value,
            clientSecret: document.getElementById('cfgSmtpClientSecret').value,
            refreshToken: document.getElementById('cfgSmtpRefreshToken').value
        };

        const result = await window.electronAPI.sendTestEmail({
            emailOptions: {
                to: targetRecipient,
                subject: 'Teste de Notificação - Automatizador Bravo',
                body: `Se você recebeu este e-mail, as notificações do Automatizador Bravo estão funcionando corretamente!\n\nDestinatário: ${targetRecipient}\nEnviado em: ${new Date().toLocaleString()}`
            },
            smtpConfig: smtpConfig
        });

        if (result.success) {
            Utils.showNotification(`E-mail de teste enviado para ${targetRecipient}!`, 'success');
        } else {
            Utils.showNotification(`Falha no envio: ${result.error}`, 'error');
        }
    } catch (error) {
        Utils.showNotification(`Erro: ${error.message}`, 'error');
    }
};

window.showHelp = () => {
    Utils.log('❓ Ajuda: Consulte a documentação interna.');
};
window.exportLogs = async () => {
    try {
        const result = await window.electronAPI.openLogsFolder();
        if (result?.success) {
            Utils.showNotification('Pasta de logs aberta no Explorador de Arquivos.', 'success');
        } else {
            Utils.showNotification(result?.message || 'Não foi possível abrir a pasta de logs.', 'error');
        }
    } catch (error) {
        Utils.showNotification('Erro ao abrir pasta de logs.', 'error');
    }
};

// Atualização (electron-updater)
window.checkForUpdates = async () => {
    if (!window.electronAPI?.checkForUpdates) return;
    try {
        Utils.showNotification('Verificando atualizações...', 'info');
        const result = await window.electronAPI.checkForUpdates();
        if (result?.success === false) {
            Utils.showNotification(result?.message || 'Nenhuma atualização disponível.', result?.message?.includes('só estão disponíveis') ? 'info' : 'warning');
        } else if (result?.updateInfo) {
            Utils.showNotification(`Nova versão ${result.updateInfo.version} disponível. Baixando...`, 'info');
        } else {
            Utils.showNotification('Você está na versão mais recente.', 'success');
        }
    } catch (error) {
        Utils.showNotification('Erro ao verificar atualização.', 'error');
    }
};

window.closeUpdateReadyModal = () => {
    const el = document.getElementById('updateReadyModal');
    if (el) el.style.display = 'none';
};

window.quitAndInstall = () => {
    if (window.electronAPI?.quitAndInstall) {
        window.electronAPI.quitAndInstall();
    }
};

// Listeners do Electron (MIGRADOS DO ORIGINAL)
// Estes listeners são cruciais para que a UI responda aos eventos do backend (main process)
window.electronAPI.onAutomationProgress((data) => {
    Utils.log(`📊 [${data.siteName}] ${data.message}`);
    UI.updateWorkflowProgress(data);
});

window.electronAPI.onAutomationComplete((data) => {
    Utils.log(`🎉 Automação concluída.`);
    UI.toggleButtons(false);

    // Atualiza estatísticas do dashboard
    if (data.results) {
        UI.updateDashboardStats(data.results);
    }

    Utils.showNotification('Automação concluída!', 'success');
});

window.electronAPI.onAutomationError((error) => {
    Utils.log(`💥 Erro: ${error}`);
    UI.toggleButtons(false);
    Utils.showNotification(`Erro: ${error}`, 'error');
});

window.electronAPI.onSiteComplete((result) => {
    if (result.success) {
        Utils.log(`✅ ${result.siteName} finalizado.`);
        UI.addAuditRow(result);
    } else {
        Utils.log(`❌ ${result.siteName} falhou.`);
        UI.addAuditRow(result);
    }
});

// Listeners de atualização (electron-updater)
if (window.electronAPI.onUpdateAvailable) {
    window.electronAPI.onUpdateAvailable((info) => {
        Utils.showNotification(`Nova versão ${info.version} disponível. Baixando...`, 'info');
    });
}
if (window.electronAPI.onUpdateDownloaded) {
    window.electronAPI.onUpdateDownloaded((info) => {
        const msg = document.getElementById('updateReadyMessage');
        if (msg) msg.textContent = `A versão ${info.version} foi baixada. Reiniciar o aplicativo para instalar?`;
        const modal = document.getElementById('updateReadyModal');
        if (modal) modal.style.display = 'flex';
    });
}
if (window.electronAPI.onUpdateError) {
    window.electronAPI.onUpdateError((info) => {
        Utils.showNotification(info?.message || 'Falha ao verificar atualização.', 'error');
    });
}