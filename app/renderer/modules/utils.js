// utils.js - Funções utilitárias

const logArea = document.getElementById('logArea');

export const Utils = {
    log(message) {
        const timestamp = new Date().toLocaleTimeString();
        const logEntry = `[${timestamp}] ${message}`;

        if (logArea) {
            // Adiciona ao log com quebra de linha
            logArea.textContent += `\n${logEntry}`;

            // Auto-scroll para o final
            logArea.scrollTop = logArea.scrollHeight;

            // Limita o tamanho do log para performance
            const lines = logArea.textContent.split('\n');
            if (lines.length > 500) {
                logArea.textContent = lines.slice(-300).join('\n');
            }
        }
        console.log(logEntry); // Também loga no console do DevTools
    },

    updateStatus(elementId, value) {
        const element = document.getElementById(elementId);
        if (element) {
            element.textContent = value;
        }
    },

    showNotification(message, type = 'info') {
        this.log(`🔔 [${type.toUpperCase()}] ${message}`);

        if (window.showNotification) {
            window.showNotification(message, type);
            return;
        }

        let container = document.getElementById('bravo-toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'bravo-toast-container';
            container.style.cssText = 'position: fixed; top: 18px; right: 18px; z-index: 99999; display: flex; flex-direction: column; gap: 8px; max-width: 380px; pointer-events: none;';
            document.body.appendChild(container);
        }

        const colors = {
            success: { bg: '#ecfdf5', border: '#10b981', text: '#065f46', icon: '✅' },
            error:   { bg: '#fef2f2', border: '#ef4444', text: '#991b1b', icon: '❌' },
            warning: { bg: '#fffbeb', border: '#f59e0b', text: '#92400e', icon: '⚠️' },
            info:    { bg: '#eff6ff', border: '#3b82f6', text: '#1e40af', icon: 'ℹ️' }
        };
        const style = colors[type] || colors.info;

        const toast = document.createElement('div');
        toast.style.cssText = `background: ${style.bg}; color: ${style.text}; border: 1px solid ${style.border}; border-left: 4px solid ${style.border}; padding: 10px 14px; border-radius: 8px; box-shadow: 0 8px 20px rgba(0,0,0,0.12); font-size: 12px; font-weight: 500; display: flex; align-items: flex-start; gap: 8px; pointer-events: auto; cursor: pointer; word-break: break-word;`;
        toast.innerHTML = `<span>${style.icon}</span><span style="flex:1;"></span>`;
        toast.querySelector('span:last-child').textContent = String(message || '');
        toast.onclick = () => toast.remove();

        container.appendChild(toast);
        setTimeout(() => {
            if (toast.parentNode) toast.remove();
        }, 5000);
    },

    // Escapa aspas para HTML
    escapeHtml(str) {
        return String(str).replace(/"/g, '&quot;');
    },

    formatCurrency(value) {
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
    }
};
