/**
 * Utilitário para converter trechos de HTML em seletores CSS válidos
 */
export const SelectorUtils = {
    /**
     * Converte uma string HTML em um seletor CSS
     * @param {string} input 
     * @returns {string} Seletor formatado ou o próprio input se não for HTML
     */
    htmlToSelector(input) {
        input = input.trim();

        // Verifica se parece um elemento HTML (começa com < e termina com >)
        if (!input.startsWith('<') || !input.endsWith('>')) {
            return input;
        }

        try {
            // Usa um elemento temporário para parsear o HTML
            const template = document.createElement('div');
            template.innerHTML = input;
            const el = template.firstElementChild;

            if (!el) return input;

            const tag = el.tagName.toLowerCase();

            // 1. Prioridade para ID
            if (el.id) {
                // Se o ID contém caracteres especiais (como colchetes), usa seletor de atributo
                if (/[\[\](){}:;,.<>~+*^$|\\]/.test(el.id)) {
                    return `[id="${el.id}"]`;
                }
                return `#${el.id}`;
            }

            // 2. Prioridade para Name
            if (el.getAttribute('name')) {
                return `[name="${el.getAttribute('name')}"]`;
            }

            // 3. Prioridade para data-testid (comum em sites modernos)
            const testId = el.getAttribute('data-testid') || el.getAttribute('data-qa');
            if (testId) {
                return `[data-testid="${testId}"]`;
            }

            // 4. Prioridade para HREF (específico para links)
            if (tag === 'a' && el.getAttribute('href')) {
                const href = el.getAttribute('href');
                // Extrai parte significativa da URL (ignora parâmetros longos)
                const urlParts = href.split('?')[0].split('/');
                const significantPart = urlParts.slice(-3).join('/'); // Últimas 3 partes do caminho

                // Verifica se há texto no link
                const textContent = el.textContent.trim();
                if (textContent && textContent.length < 30) {
                    return `a:has-text("${textContent}")`;
                }

                // Senão, usa parte da URL
                if (significantPart) {
                    return `a[href*="${significantPart}"]`;
                }
            }

            // 5. Prioridade para Placeholder
            if (el.getAttribute('placeholder')) {
                return `[placeholder="${el.getAttribute('placeholder')}"]`;
            }

            // 6. Classes (ignora classes genéricas como 'required' ou 'form-control' se houver outras)
            if (el.className) {
                const classes = el.className.split(' ')
                    .filter(c => c && !['required', 'form-control', 'input-text'].includes(c))
                    .join('.');
                if (classes) return `${tag}.${classes}`;
            }

            // 7. Fallback para texto (se for curto e legível)
            const textContent = el.textContent.trim();
            if (textContent && textContent.length > 0 && textContent.length < 30) {
                return `${tag}:has-text("${textContent}")`;
            }

            // 8. Fallback para a TAG pura
            return tag;

        } catch (e) {
            console.error('Erro ao converter HTML para seletor:', e);
            return input;
        }
    },

    /**
     * Aplica o listener de conversão a um elemento de input
     * @param {HTMLInputElement} inputEl 
     */
    setupAutoConvert(inputEl) {
        if (!inputEl) return;

        const process = () => {
            const original = inputEl.value;
            const converted = this.htmlToSelector(original);
            if (original !== converted) {
                inputEl.value = converted;
                // Feedback visual rápido
                inputEl.style.backgroundColor = '#e8f5e9';
                setTimeout(() => inputEl.style.backgroundColor = '', 500);
            }
        };

        inputEl.addEventListener('paste', () => setTimeout(process, 10));
        inputEl.addEventListener('blur', process);
    }
};

// Mantemos compatibilidade com window para devtools, mas a aplicação deve usar import
window.SelectorUtils = SelectorUtils;