// presets.js - Gerenciamento de Presets
import { Utils } from './utils.js';
import { State } from './state.js';
import { UI } from './ui.js';


// Melhor abordagem: Sites.js exporta loadSites, mas loadSites precisa do State.editingPresetId.
// Vamos importar Sites apenas quando necessário ou usar injeção de dependência se for crítico.
// Por enquanto, assumimos que sites.js existe. Se falhar, ajustamos.

// Como 'loadSites' é chamado aqui, vamos definir uma interface para evitar erro de importação imediato
let SitesModule = null;
export function setSitesModule(module) {
    SitesModule = module;
}

export const Presets = {
    async loadPresetsToMain() {
        try {
            const presets = await window.electronAPI.getPresets();
            const selector = document.getElementById('mainPresetSelector');
            if (!selector) return;

            const currentValue = selector.value;

            // Limpa exceto a primeira opção
            selector.innerHTML = '<option value="">Selecione um Preset...</option>';

            presets.forEach(preset => {
                const option = document.createElement('option');
                option.value = preset.id;
                option.textContent = `${preset.name} (${preset.type})`;
                selector.appendChild(option);
            });

            // Tenta manter a seleção anterior
            if (currentValue) selector.value = currentValue;
        } catch (error) {
            console.error('Erro ao carregar presets no seletor principal:', error);
        }
    },

    async loadPresets() {
        try {
            const presets = await window.electronAPI.getPresets();
            const list = document.getElementById('presetsList');
            if (!list) return;

            list.innerHTML = '';

            if (presets.length === 0) {
                list.innerHTML = '<div style="text-align: center; color: #7f8c8d; padding: 30px; background: #f8f9fa; border-radius: 8px; border: 1px dashed #dce4ec;">Nenhum preset cadastrado.</div>';
                return;
            }

            presets.forEach(preset => {
                const div = document.createElement('div');
                div.style.cssText = 'padding: 15px; background: #ffffff; border-radius: 10px; border: 1px solid #dce4ec; display: flex; justify-content: space-between; align-items: center; transition: all 0.2s;';
                const schedInfo = preset.schedule && preset.schedule.enabled
                    ? `<div style="font-size: 10px; color: #27ae60; margin-top: 4px; font-weight: 700;">⏱️ Agendado: ${preset.schedule.mode === 'interval' ? `cada ${preset.schedule.intervalHours}h` : 'horários fixos'}</div>`
                    : '';

                div.innerHTML = `
                    <div style="flex: 1;">
                        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                            <strong style="color: #2c3e50; font-size: 13px;">${preset.name}</strong>
                            <span style="font-size: 9px; padding: 2px 6px; background: #ebf5fb; color: #3498db; border-radius: 4px; font-weight: 700; text-transform: uppercase;">${preset.type}</span>
                        </div>
                        <div style="font-size: 11px; color: #95a5a6;">👤 Login: ${preset.login}</div>
                        <div class="btn-view-sites" data-id="${preset.id}" style="font-size: 10px; color: #3498db; margin-top: 4px; font-weight: 600; cursor: pointer; display: inline-block; padding: 2px 4px; border-radius: 4px; background: #f0f8ff;">🔗 Sites vinculados: ${preset.sites ? preset.sites.length : 0} (Clique para gerenciar)</div>
                        ${schedInfo}
                    </div>
                    <div style="display: flex; gap: 10px;">
                        <button class="btn btn-edit-preset" data-id="${preset.id}" style="padding: 6px; min-width: 0; background: #f8f9fa;" title="Editar Dados do Preset">✏️</button>
                        <button class="btn btn-delete-preset" data-id="${preset.id}" style="padding: 6px; min-width: 0; border-color: #fadbd8;" title="Excluir Preset">🗑️</button>
                    </div>
                `;
                list.appendChild(div);
            });

            // Listeners
            // View Sites (clicar no contador vai para aba Sites)
            list.querySelectorAll('.btn-view-sites').forEach(btn =>
                btn.addEventListener('click', () => this.editPreset(btn.dataset.id))); // editPreset = vai para aba sites (nome legado)

            // Edit Data (clicar no lapis abre o form do preset)
            list.querySelectorAll('.btn-edit-preset').forEach(btn =>
                btn.addEventListener('click', () => this.fillPresetForm(btn.dataset.id)));

            list.querySelectorAll('.btn-delete-preset').forEach(btn =>
                btn.addEventListener('click', () => this.deletePreset(btn.dataset.id)));

            this.updateSidebarSchedules(presets); // Update sidebar schedules

        } catch (error) {
            Utils.log(`❌ Erro ao carregar presets: ${error}`);
        }
    },

    async updateSidebarSchedules(presets) {
        const container = document.getElementById('nextSchedulesList');
        const toggleBtn = document.getElementById('globalScheduleToggle');
        if (!container) return;

        const config = await window.electronAPI.getConfig();
        const globalEnabled = config.schedulerEnabled !== false;

        if (toggleBtn) {
            toggleBtn.innerHTML = globalEnabled ? '⏸️' : '▶️';
            toggleBtn.title = globalEnabled ? 'Pausar Agendamentos' : 'Retomar Agendamentos';
            toggleBtn.className = globalEnabled ? 'btn-toggle-small' : 'btn-toggle-small paused';
        }

        if (!globalEnabled) {
            container.innerHTML = `
                <div class="scheduler-paused-overlay">
                    ⚠️ AGENDAMENTOS PAUSADOS
                </div>
            `;
            return;
        }

        // Filter active schedules
        const scheduledPresets = presets.filter(p => p.schedule && p.schedule.enabled);

        if (scheduledPresets.length === 0) {
            container.innerHTML = '<div style="font-size: 10px; color: #95a5a6; text-align: center; padding: 10px;">Nenhum agendamento ativo</div>';
            return;
        }

        container.innerHTML = '';
        scheduledPresets.forEach(preset => {
            const div = document.createElement('div');
            div.style.cssText = 'padding: 8px; background: #ffffff; border-radius: 6px; border-left: 3px solid #3498db; font-size: 11px; margin-bottom: 4px; box-shadow: 0 1px 2px rgba(0,0,0,0.05);';

            let timeInfo = '';
            if (preset.schedule.mode === 'interval') {
                timeInfo = `A cada ${preset.schedule.intervalHours}h`;
            } else if (preset.schedule.mode === 'fixed') {
                const times = preset.schedule.fixedTimes || [];
                timeInfo = times.length > 0 ? times.join(', ') : 'Sem horários';
            }

            div.innerHTML = `
                <div style="font-weight: 700; color: #2c3e50; margin-bottom: 2px;">${preset.name}</div>
                <div style="color: #7f8c8d; display: flex; align-items: center; gap: 4px;">
                    <span>🕒</span> ${timeInfo}
                </div>
            `;
            container.appendChild(div);
        });
    },

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

        // Dados de Agendamento
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

        try {
            // Em caso de edição, recuperar sites existentes
            if (id) {
                const existingPresets = await window.electronAPI.getPresets();
                const existing = existingPresets.find(p => p.id === id);
                if (existing && existing.sites) {
                    presetData.sites = existing.sites;
                }
            }

            await window.electronAPI.savePreset(presetData);
            Utils.showNotification('Predefinição salva com sucesso!', 'success');

            this.hidePresetForm();
            this.loadPresets();
            this.loadPresetsToMain(); // Atualiza seletor da home
            // Sidebar update handles inside loadPresets (which calls getPresets again)
            // But to be instantaneous without fetch:
            // Actually loadPresets calls getPresets, so it will get the updated one.
        } catch (error) {
            Utils.showNotification(`Erro ao salvar: ${error.message}`, 'error');
        }
    },

    async editPreset(id) {
        try {
            const presets = await window.electronAPI.getPresets();
            const preset = presets.find(p => p.id === id);

            if (preset) {
                // Define globalmente qual preset estamos editando
                State.editingPresetId = id;
                Utils.log(`✏️ Editando preset: ${id}`);

                // Se já estivermos na aba Presets, mostra form.
                // Mas a UX original sugere ir para a aba Sites. 
                // O código antigo loadSites() mostrava header "Editando: ...".
                // Vamo manter o fluxo:
                // 1. Abre a aba Sites com contexto desse preset

                UI.switchConfigTab('sitesTab');
                // Dispara carregamento de sites
                if (SitesModule) {
                    SitesModule.loadSites();
                } else {
                    console.warn('Module Sites não carregado');
                    Utils.showNotification('Erro interno: Módulo de Sites não carregado. Recarregue a página.', 'error');
                }
            }
        } catch (e) {
            Utils.log(`Erro ao editar preset: ${e}`);
        }
    },

    // Função auxiliar chamada pelo botão "Editar" dentro do Form de Presets (casos raros ou edição direta)
    // Na verdade, o form de Preset é para editar DADOS do preset (nome, login).
    // O código original editPreset(id) fazia:
    // 1. Checkar se tem sites.js available?
    // Analisando o original: editPreset(id) chamava log e... wait.
    // Original editPreset(id) linha 985:
    // - Carrega dados no Form de Preset
    // - Mostra PresetForm.
    // - E TAMBÉM definia currentEditingPresetId?

    // CORREÇÃO: No original, editPreset(id) preenche o formulário de preset.
    // Ao clicar em SALVAR, salva.
    // Para ver SITES, o usuario clica em "Editar" e depois TEM que ir na aba SITES?
    // O original loadSites() verifica currentEditingPresetId.

    // Vamos re-implementar `editPreset` para PREENCHER O FORM.
    async fillPresetForm(id) {
        const presets = await window.electronAPI.getPresets();
        const preset = presets.find(p => p.id === id);

        if (preset) {
            State.editingPresetId = id; // Importante para loadSites saber quem é o pai

            this.showPresetForm(); // Mostra o form

            document.getElementById('presetId').value = preset.id;
            document.getElementById('pName').value = preset.name;
            document.getElementById('pType').value = preset.type || 'vendas';
            document.getElementById('pLogin').value = preset.login;
            document.getElementById('pPass').value = preset.pass;
            document.getElementById('pDestination').value = preset.destination || '';

            if (preset.schedule) {
                document.getElementById('pSchedEnabled').checked = preset.schedule.enabled;
                document.getElementById('pSchedMode').value = preset.schedule.mode || 'interval';
                document.getElementById('pSchedInterval').value = preset.schedule.intervalHours || 3;

                // Novos campos de política de compensação
                document.getElementById('pCompensationPolicy').value = preset.schedule.compensationPolicy || 'immediate';
                document.getElementById('pMaxCompensationDelay').value = preset.schedule.maxCompensationDelay || 24;

                State.fixedTimes = preset.schedule.fixedTimes || [];
                this.renderTimeBadges();
                this.toggleScheduleOptions();
                this.toggleScheduleMode();
            }

            // Atualiza link para sites
            const container = document.getElementById('presetSiteLinks');
            if (container) {
                container.innerHTML = `
                    <div style="display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 20px; background: #f8f9fa; border-radius: 8px; border: 1px dashed #dce4ec;">
                        <strong style="color: #2c3e50;">${preset.sites ? preset.sites.length : 0} sites vinculados</strong>
                        <button class="btn btn-primary" id="btnGoToSitesFromPreset">
                            Gerenciar Sites deste Preset →
                        </button>
                    </div>
                `;
                document.getElementById('btnGoToSitesFromPreset').onclick = () => {
                    UI.switchConfigTab('sitesTab');
                    if (SitesModule) SitesModule.loadSites();
                };
            }
        }
    },

    async deletePreset(id) {
        if (confirm('Tem certeza que deseja excluir esta predefinição?')) {
            try {
                await window.electronAPI.deletePreset(id);
                Utils.showNotification('Predefinição excluída.', 'success');
                this.loadPresets();
                this.loadPresetsToMain();
            } catch (error) {
                Utils.showNotification(`Erro ao excluir: ${error.message}`, 'error');
            }
        }
    },

    showPresetForm() {
        const form = document.getElementById('presetForm');
        const footer = document.getElementById('configModalFooter');

        if (form) form.style.display = 'block';
        if (footer) footer.style.display = 'none';

        // Limpa campos se não for edição (mas se chamou fillPresetForm antes, já ta preenchido)
        // Se chamado direto pelo botão "Criar Nova", limpamos.
        // Como distinguir? Vamos assumir que quem chama limpa ou preenche.
        // Vamos criar um `resetForm` separado ou limpar aqui se ID vazio?
        // Como o botão "Criar" chama showPresetForm(), vamos limpar aqui caso o ID hidden esteja vazio ou se quisermos resetar.
        // Melhor: Separar `openNewPresetForm`.
    },

    openNewPresetForm() {
        // Limpa estado
        State.editingPresetId = null;
        document.getElementById('presetId').value = '';
        document.getElementById('pName').value = '';
        document.getElementById('pLogin').value = '';
        document.getElementById('pPass').value = '';
        document.getElementById('pDestination').value = '';

        // Reset agendamento
        document.getElementById('pSchedEnabled').checked = false;
        document.getElementById('pSchedMode').value = 'interval';
        document.getElementById('pSchedInterval').value = 3;
        document.getElementById('pCompensationPolicy').value = 'immediate';
        document.getElementById('pMaxCompensationDelay').value = 24;
        State.fixedTimes = [];
        this.renderTimeBadges();
        this.toggleScheduleOptions();
        this.toggleScheduleMode();

        this.showPresetForm();
    },

    hidePresetForm() {
        document.getElementById('presetForm').style.display = 'none';
        const footer = document.getElementById('configModalFooter');
        if (footer) footer.style.display = 'flex';
    },

    // Scheduler Utils
    addFixedTime() {
        const input = document.getElementById('pSchedTimeInput');
        const time = input.value;
        const current = State.fixedTimes;

        if (time && !current.includes(time)) {
            current.push(time);
            current.sort();
            State.fixedTimes = current; // trigger update if needed
            this.renderTimeBadges();
            input.value = '';
        }
    },

    removeFixedTime(time) {
        let current = State.fixedTimes;
        current = current.filter(t => t !== time);
        State.fixedTimes = current;
        this.renderTimeBadges();
    },

    renderTimeBadges() {
        const container = document.getElementById('fixedTimesBadges');
        if (!container) return;

        container.innerHTML = '';
        State.fixedTimes.forEach(time => {
            const badge = document.createElement('div');
            badge.style.cssText = 'background: #3498db; color: white; padding: 4px 10px; border-radius: 20px; font-size: 11px; font-weight: 700; display: flex; align-items: center; gap: 8px;';
            badge.innerHTML = `
                <span>${time}</span>
                <span style="cursor: pointer; opacity: 0.7; font-size: 14px;" class="remove-time-btn" data-time="${time}">×</span>
            `;
            container.appendChild(badge);
        });

        container.querySelectorAll('.remove-time-btn').forEach(btn =>
            btn.addEventListener('click', () => this.removeFixedTime(btn.dataset.time)));
    },

    toggleScheduleOptions() {
        const enabled = document.getElementById('pSchedEnabled').checked;
        const options = document.getElementById('schedOptions');
        if (options) options.style.display = enabled ? 'block' : 'none';
    },

    toggleScheduleMode() {
        const mode = document.getElementById('pSchedMode').value;
        const intGroup = document.getElementById('intervalGroup');
        const fixGroup = document.getElementById('fixedGroup');
        const fixBadges = document.getElementById('fixedTimesBadges');
        if (intGroup) intGroup.style.display = mode === 'interval' ? 'block' : 'none';
        if (fixGroup) fixGroup.style.display = mode === 'fixed' ? 'block' : 'none';
        if (fixBadges) fixBadges.style.display = mode === 'fixed' ? 'flex' : 'none';
    }
};
