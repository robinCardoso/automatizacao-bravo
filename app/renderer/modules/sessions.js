// sessions.js - Gerenciamento de Sessões
import { Utils } from './utils.js';
import { UI } from './ui.js';

export const Sessions = {
    async manageSessions() {
        UI.openModal('sessionModal');
        this.loadSessions();
    },

    async loadSessions() {
        const list = document.getElementById('sessionsList');
        if (!list) return;

        list.innerHTML = '<div style="text-align: center; color: #7f8c8d; padding: 20px;">Carregando sessões...</div>';

        try {
            // Mapping: getAllSessions -> getSessionStatus (defined in preload.ts)
            const sessions = await window.electronAPI.getSessionStatus();
            list.innerHTML = '';

            if (!sessions || sessions.length === 0) {
                list.innerHTML = '<div style="text-align: center; color: #7f8c8d; padding: 20px;">Nenhuma sessão salva.</div>';
                return;
            }

            sessions.forEach(session => {
                const div = document.createElement('div');
                div.style.cssText = 'padding: 15px; background: #f8f9fa; border-radius: 4px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center; border: 1px solid #eee;';

                const lastUsed = session.lastUsed ? new Date(session.lastUsed).toLocaleString() : 'Desconhecido';

                div.innerHTML = `
                    <div>
                        <strong style="color: #2c3e50;">${session.siteName || 'Site Desconhecido'}</strong>
                        <div style="font-size: 11px; color: #7f8c8d;">Partition: ${session.partition || 'Padrão'}</div>
                        <small style="color: #95a5a6;">Último acesso: ${lastUsed}</small>
                    </div>
                    <div>
                        <button class="btn btn-success btn-use-session" data-id="${session.siteId}" style="padding: 5px 10px; font-size: 12px;">USAR</button>
                        <button class="btn btn-danger btn-del-session" data-id="${session.siteId}" style="padding: 5px 10px; font-size: 12px;">EXCLUIR</button>
                    </div>
                `;
                list.appendChild(div);
            });

            // Listeners
            list.querySelectorAll('.btn-use-session').forEach(btn =>
                btn.onclick = () => this.openSessionBrowser(btn.dataset.id));

            list.querySelectorAll('.btn-del-session').forEach(btn =>
                btn.onclick = () => this.deleteIndividualSession(btn.dataset.id));

        } catch (error) {
            list.innerHTML = `<div style="color: red; padding: 10px;">Erro ao carregar sessões: ${error.message}</div>`;
        }
    },

    async openSessionBrowser(siteId) {
        try {
            Utils.showNotification('Abrindo navegador da sessão...', 'info');
            // Como não temos o ID do site fácil aqui (apenas partition/siteId da sessão), 
            // assumimos que openBrowserForLogin aceita o siteId que veio da sessão
            await window.electronAPI.openBrowserForLogin(siteId);
            Utils.showNotification('Sessão atualizada.', 'success');
            this.loadSessions();
        } catch (error) {
            Utils.showNotification(`Erro: ${error.message}`, 'error');
        }
    },

    async deleteIndividualSession(siteId) {
        if (confirm('Deseja excluir os cookies/storage desta sessão?')) {
            try {
                // Mapping: clearSession -> deleteSession
                await window.electronAPI.deleteSession(siteId);
                Utils.showNotification('Sessão limpa com sucesso.', 'success');
                this.loadSessions();
            } catch (error) {
                Utils.showNotification(`Erro: ${error.message}`, 'error');
            }
        }
    },

    async clearAllSessions() {
        if (confirm('ATENÇÃO: Isso irá apagar TODOS os logins salvos de todos os sites. Continuar?')) {
            try {
                // Mapping: clearAllSessions -> clearSessions
                await window.electronAPI.clearSessions();
                Utils.showNotification('Todas as sessões foram limpas.', 'success');
                this.loadSessions();
            } catch (error) {
                Utils.showNotification(`Erro: ${error.message}`, 'error');
            }
        }
    },

    newSession() {
        UI.closeModal('sessionModal');
        UI.switchConfigTab('sitesTab');
        Utils.showNotification('Selecione um site e clique no ícone do globo 🌐 para criar uma sessão.', 'info');
    }
};
