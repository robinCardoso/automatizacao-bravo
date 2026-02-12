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
        // Implementação simplificada baseada no original (se houver, ou fallback para log/alert)
        // No código original, showNotification era usada em startAutomation mas não definida explicitamente no snippet visible
        // Assumindo que possa ser um simple log ou alert customizado.
        // Vamos usar o log por enquanto se não houver UI de toast.
        this.log(`🔔 [${type.toUpperCase()}] ${message}`);

        // Se houver um sistema de notificação global (window.showNotification), usamos
        if (window.showNotification) {
            window.showNotification(message, type);
        }
    },

    // Escapa aspas para HTML
    escapeHtml(str) {
        return String(str).replace(/"/g, '&quot;');
    }
};
