// ui.js - Gerenciamento da Interface
import { Utils } from './utils.js';
import { State } from './state.js';
import { Dashboard } from './dashboard.js';

export const UI = {
    toggleButtons(running) {
        const startBtn = document.getElementById('startBtn');
        const stopBtn = document.getElementById('stopBtn');
        const auditStatus = document.getElementById('auditStatus');

        State.isRunning = running;

        if (running) {
            if (startBtn) startBtn.disabled = true;
            if (stopBtn) stopBtn.disabled = false;
            Utils.updateStatus('automationStatus', 'EXECUTANDO');
            if (auditStatus) {
                auditStatus.textContent = 'Executando...';
                auditStatus.className = 'status-badge badge-running';
            }
            Utils.log('▶ Automação iniciada');
        } else {
            if (startBtn) startBtn.disabled = false;
            if (stopBtn) stopBtn.disabled = true;
            Utils.updateStatus('automationStatus', 'PARADA');
            if (auditStatus) {
                auditStatus.textContent = 'Aguardando Início';
                auditStatus.className = 'status-badge badge-waiting';
            }
            Utils.log('⏹ Automação finalizada');
        }
    },

    openModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.style.display = 'flex';
            Utils.log(`✅ Modal ${modalId} aberto`);
            if (modalId === 'configModal') {
                this.switchConfigTab('presetsTab');
                // Popula configurações
                this.loadConfigToUI();
            }
        }
    },

    closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.style.display = 'none';
            Utils.log(`❌ Modal ${modalId} fechado`);
        }
    },

    switchConfigTab(tabId) {
        // Esconde todas as abas
        document.querySelectorAll('.config-tab').forEach(tab => {
            tab.style.display = 'none';
        });

        // Mostra a aba selecionada
        const targetTab = document.getElementById(tabId);
        if (targetTab) targetTab.style.display = 'block';

        // Atualiza estilo dos botões da tab
        const btnPresets = document.getElementById('tabBtnPresets');
        const btnSites = document.getElementById('tabBtnSites');
        const btnExportImport = document.getElementById('tabBtnExportImport');

        // Remove classe active de todos os botões
        if (btnPresets) btnPresets.classList.remove('active');
        if (btnSites) btnSites.classList.remove('active');
        if (btnExportImport) btnExportImport.classList.remove('active');

        // Adiciona active no botão correto
        if (tabId === 'presetsTab' && btnPresets) {
            btnPresets.classList.add('active');
            // Nota: Os módulos principais devem escutar mudanças ou chamadas explicitas. 
            // Como este módulo é apenas UI, quem chama switchConfigTab geralmente dispara o carregamento de dados se necessário,
            // ou podemos disparar um evento customizado se precisarmos desacoplar 100%.
            // Por enquanto, vamos retornar qual tab foi ativada para quem chamou decidir o que fazer.
        } else if (tabId === 'sitesTab' && btnSites) {
            btnSites.classList.add('active');
        } else if (tabId === 'exportImportTab' && btnExportImport) {
            btnExportImport.classList.add('active');
        }

        return tabId;
    },

    toggleSummary() {
        const summary = document.getElementById('workflowSummary');
        if (summary) {
            summary.style.display = summary.style.display === 'none' ? 'block' : 'none';
        }
    },

    // Atualiza a visualização do painel de auditoria (exemplo)
    clearAuditTable() {
        const auditTableBody = document.getElementById('auditTableBody');
        if (auditTableBody) auditTableBody.innerHTML = '';
    },

    addAuditRow(result) {
        const tbody = document.getElementById('auditTableBody');
        if (!tbody) return;

        const row = document.createElement('tr');
        const statusClass = result.success ? 'status-success' : 'status-error';
        const statusText = result.success ? 'SUCESSO' : 'ERRO';

        // Mapeamento correto dos dados do AutomationResult
        const ssp = result.sspResult || {};
        const lines = ssp.currentRows !== undefined ? ssp.currentRows : '-';

        let changesDisplay = '-';
        if (ssp.added !== undefined || ssp.removed !== undefined) {
            const added = ssp.added || 0;
            const removed = ssp.removed || 0;
            changesDisplay = `<span style="color: green;">+${added}</span> / <span style="color: red;">-${removed}</span>`;
        }

        const uf = ssp.uf || 'N/A';
        const presetBadge = result.presetName
            ? `<div style="font-size: 9px; color: #3498db; margin-top: 2px; font-weight: 500;"><i class="fas fa-tag"></i> ${result.presetName}</div>`
            : '';

        row.innerHTML = `
            <td><span class="uf-badge">${uf}</span></td>
            <td>
                <div style="font-weight: 600; color: #2c3e50;">${result.siteName}</div>
                ${presetBadge}
                <div style="font-size: 10px; color: #95a5a6;">${result.message || (result.success ? 'Finalizado' : 'Falha')}</div>
            </td>
            <td style="text-align: center; font-family: monospace;">${lines}</td>
            <td style="text-align: center; font-family: monospace;">${changesDisplay}</td>
            <td style="text-align: center;">
                <span class="status-badge ${statusClass}">${statusText}</span>
            </td>
            <td style="text-align: right;">
                <button class="btn btn-secondary" style="padding: 2px 6px; font-size: 10px;" onclick="Utils.log('Detalhes: ' + '${result.errorMessage || 'Sem erros'}')">Ver</button>
            </td>
        `;
        tbody.appendChild(row);
    },

    // Estado interno para rastrear o site atual no workflow
    _currentWorkflowSite: null,

    updateWorkflowProgress(data) {
        // Exibir o painel se estiver oculto
        const summary = document.getElementById('workflowSummary');
        if (summary && summary.style.display === 'none') {
            summary.style.display = 'block';
        }

        const container = document.getElementById('summarySteps');
        if (!container) return;

        // Se mudou de site, limpa e recria a estrutura
        if (this._currentWorkflowSite !== data.siteName) {
            this._currentWorkflowSite = data.siteName;
            container.innerHTML = '';

            const header = document.createElement('div');
            header.style.cssText = 'padding: 10px; background: #f8f9fa; border-bottom: 2px solid #e9ecef; margin-bottom: 5px; font-weight: bold; color: #2c3e50;';
            header.innerText = `Processando: ${data.siteName}`;
            container.appendChild(header);
        }

        // Se for passo 0 (Inicialização), reseta ou cria placeholders se tiver totalSteps
        if (data.currentStep === 0) {
            // Apenas log de inicialização
            const initDiv = document.createElement('div');
            initDiv.style.cssText = 'padding: 8px; font-size: 11px; color: #3498db; font-style: italic; border-bottom: 1px solid #eee;';
            initDiv.innerText = `🚀 ${data.message}`;
            container.appendChild(initDiv);
            return;
        }

        // Identificador único do passo para atualização
        const stepId = `step-${data.siteName.replace(/\s+/g, '-')}-${data.currentStep}`;
        let stepEl = document.getElementById(stepId);

        if (!stepEl) {
            // Se não existe, cria (pode ser executado fora de ordem ou incremental)
            stepEl = document.createElement('div');
            stepEl.id = stepId;
            stepEl.className = 'workflow-step-item';
            stepEl.style.cssText = 'padding: 8px; border-bottom: 1px solid #eee; display: flex; align-items: center; gap: 10px; font-size: 11px; transition: all 0.3s ease;';
            container.appendChild(stepEl);
        }

        // Atualiza conteúdo do passo
        const isLast = data.currentStep === data.totalSteps; // Logica simples
        // Ícone baseado no tipo ou progresso
        let icon = '⏳';
        if (data.percentage === 100) icon = '✅';
        else icon = '⚡';

        stepEl.innerHTML = `
            <div style="width: 24px; text-align: center; font-weight: bold; color: #bdc3c7;">${data.currentStep}/${data.totalSteps}</div>
            <div style="flex: 1;">
                <div style="font-weight: 600; color: #34495e;">${data.stepType.toUpperCase()}</div>
                <div style="color: #7f8c8d;">${data.message}</div>
            </div>
            <div style="font-size: 14px;">${icon}</div>
        `;

        // Marca passos anteriores como concluídos visualmente (opcional, mas bom pra UX)
        // Auto-scroll
        container.scrollTop = container.scrollHeight;
    },

    updateDashboardStats(results) {
        if (!results || results.length === 0) return;

        const totalSites = results.length;
        const successCount = results.filter(r => r.success).length;
        const successRate = Math.round((successCount / totalSites) * 100);

        const totalTime = results.reduce((acc, r) => acc + (r.duration || 0), 0);
        const avgTimeMs = totalTime / totalSites;
        const avgTimeSec = (avgTimeMs / 1000).toFixed(1);

        // Atualiza DOM
        Utils.updateStatus('sitesCount', totalSites);
        Utils.updateStatus('successRate', `${successRate}%`);
        Utils.updateStatus('avgTime', `${avgTimeSec}s`);
        Utils.updateStatus('lastRun', new Date().toLocaleTimeString());

        // Atualiza Status Geral
        const auditStatus = document.getElementById('auditStatus');
        if (auditStatus) {
            auditStatus.textContent = 'Finalizado';
            auditStatus.className = 'status-badge badge-waiting';
        }

        const systemStatus = document.getElementById('automationStatus');
        if (systemStatus) {
            systemStatus.textContent = 'AGUARDANDO';
            systemStatus.style.color = '#7f8c8d';
        }

        // Gatilho para atualizar o Dashboard real se estiver visível
        if (Dashboard && document.getElementById('view-dashboard').classList.contains('active-view')) {
            Dashboard.loadDashboard();
        }
    },
    async loadConfigToUI() {
        try {
            const config = await window.electronAPI.getConfig();
            const elHeadless = document.getElementById('cfgHeadless');
            const elDelay = document.getElementById('actionDelay');
            const elTimeout = document.getElementById('timeout');
            const elRetries = document.getElementById('maxRetries');

            if (elHeadless) elHeadless.checked = config.headless !== false;
            if (elDelay) elDelay.value = config.actionDelay || 1000;
            if (elTimeout) elTimeout.value = (config.defaultTimeout || 30000) / 1000;
            if (elRetries) elRetries.value = config.defaultRetries || 3;

            // Popula Alertas/SMTP
            const n = config.notifications || { enabled: false };
            const smtp = n.smtp || {};
            const fallback = n.fallbackSmtp || {};

            // Primário
            const elEmailEnabled = document.getElementById('cfgEmailEnabled');
            const elSmtpHost = document.getElementById('cfgSmtpHost');
            const elSmtpPort = document.getElementById('cfgSmtpPort');
            const elSmtpUser = document.getElementById('cfgSmtpUser');
            const elSmtpPass = document.getElementById('cfgSmtpPass');
            const elAuthType = document.getElementById('cfgSmtpAuthType');

            // OAuth2
            const elClientId = document.getElementById('cfgSmtpClientId');
            const elClientSecret = document.getElementById('cfgSmtpClientSecret');
            const elRefreshToken = document.getElementById('cfgSmtpRefreshToken');

            // Fallback & Advanced
            const elRecipient = document.getElementById('cfgEmailRecipient');
            const elRetry = document.getElementById('cfgEmailRetry');
            const elShowLogo = document.getElementById('cfgShowLogo');
            const elCompact = document.getElementById('cfgCompactLayout');

            const elFbackHost = document.getElementById('cfgSmtpFallbackHost');
            const elFbackPort = document.getElementById('cfgSmtpFallbackPort');
            const elFbackUser = document.getElementById('cfgSmtpFallbackUser');
            const elFbackPass = document.getElementById('cfgSmtpFallbackPass');

            if (elEmailEnabled) elEmailEnabled.checked = !!n.enabled;
            if (elSmtpHost) elSmtpHost.value = smtp.host || 'smtp.gmail.com';
            if (elSmtpPort) elSmtpPort.value = smtp.port || 465;
            if (elSmtpUser) elSmtpUser.value = smtp.user || '';
            if (elSmtpPass) elSmtpPass.value = smtp.pass || '';
            if (elAuthType) elAuthType.value = smtp.authType || 'login';

            if (elClientId) elClientId.value = smtp.clientId || '';
            if (elClientSecret) elClientSecret.value = smtp.clientSecret || '';
            if (elRefreshToken) elRefreshToken.value = smtp.refreshToken || '';

            if (elRecipient) elRecipient.value = n.recipient || '';
            if (elRetry) elRetry.value = n.retryAttempts || 3;
            if (elShowLogo) elShowLogo.checked = n.showLogo !== false;
            if (elCompact) elCompact.checked = !!n.compactLayout;

            if (elFbackHost) elFbackHost.value = fallback.host || '';
            if (elFbackPort) elFbackPort.value = fallback.port || '';
            if (elFbackUser) elFbackUser.value = fallback.user || '';
            if (elFbackPass) elFbackPass.value = fallback.pass || '';

            this.toggleSmtpAuthDisplay();

            Utils.log('⚙️ Configurações carregadas na UI');
        } catch (error) {
            Utils.log(`❌ Erro ao carregar config na UI: ${error.message}`);
        }
    },

    toggleSmtpAuthDisplay() {
        const authType = document.getElementById('cfgSmtpAuthType').value;
        const loginSection = document.getElementById('smtpAuthLogin');
        const oauthSection = document.getElementById('smtpAuthOAuth2');

        if (loginSection) loginSection.style.display = authType === 'login' ? 'block' : 'none';
        if (oauthSection) oauthSection.style.display = authType === 'oauth2' ? 'block' : 'none';
    },

    updateSmtpStatus(status, message) {
        const indicator = document.getElementById('smtp-status-indicator');
        const icon = document.getElementById('smtp-status-icon');
        const text = document.getElementById('smtp-status-text');

        if (!indicator || !icon || !text) return;

        switch (status) {
            case 'valid':
                indicator.style.display = 'block';
                indicator.style.background = '#e8f5e9';
                indicator.style.border = '1px solid #48c774';
                indicator.style.color = '#1e4620';
                icon.textContent = '✅';
                text.textContent = message;
                break;
            case 'invalid':
                indicator.style.display = 'block';
                indicator.style.background = '#ffebee';
                indicator.style.border = '1px solid #f14668';
                indicator.style.color = '#611a27';
                icon.textContent = '❌';
                text.textContent = message;
                break;
            case 'checking':
                indicator.style.display = 'block';
                indicator.style.background = '#fff3e0';
                indicator.style.border = '1px solid #ffdd57';
                indicator.style.color = '#4a3a06';
                icon.textContent = '⏳';
                text.textContent = message;
                break;
            default:
                indicator.style.display = 'none';
        }
    }
};
