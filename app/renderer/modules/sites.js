// sites.js - Gerenciamento de Sites e Ações
import { Utils } from './utils.js';
import { State } from './state.js';
import { SelectorUtils } from '../selector-utils.js'; // Importando do arquivo na raiz
import { UI } from './ui.js';

export const Sites = {
    async loadSites() {
        // Verifica se há um preset sendo editado
        Utils.log(`🔍 loadSites() chamado com currentEditingPresetId: ${State.editingPresetId}`);

        if (!State.editingPresetId) {
            this.renderEmptyState();
            return;
        }

        try {
            Utils.log(`🔍 Carregando sites para o preset ID: ${State.editingPresetId}`);

            // Tentar obter os presets com retry
            let presets;
            let retryCount = 0;
            const maxRetries = 3;

            while (retryCount < maxRetries) {
                try {
                    presets = await window.electronAPI.getPresets();
                    break;
                } catch (err) {
                    retryCount++;
                    Utils.log(`⚠️ Tentativa ${retryCount} de obter presets falhou: ${err.message}`);
                    if (retryCount >= maxRetries) throw err;
                    await new Promise(resolve => setTimeout(resolve, 200));
                }
            }

            const preset = presets.find(p => p.id === State.editingPresetId);

            if (!preset) {
                Utils.log('⚠️ Preset não encontrado');
                Utils.showNotification('Preset não encontrado!', 'error');
                return;
            }

            this.renderPresetView(preset);

        } catch (error) {
            Utils.log(`❌ Erro ao carregar sites: ${error}`);
        }
    },

    renderEmptyState() {
        const list = document.getElementById('sitesList');
        if (!list) return;

        list.innerHTML = `
            <div style="text-align: center; color: #2c3e50; padding: 30px; background: #ffffff; border-radius: 8px; border: 1px solid #e1e8ed; margin: 10px 0;">
                <div style="font-size: 48px; margin-bottom: 15px;">📋</div>
                <h3 style="margin: 0 0 15px 0; color: #2c3e50;">Gerenciar Sites e Ações</h3>
                <p style="color: #7f8c8d; margin-bottom: 20px; line-height: 1.5;">
                    Para gerenciar sites e ações, você precisa primeiro selecionar um preset para edição.
                </p>
                <button class="btn btn-primary" id="btnGoToPresets">
                    → IR PARA PREDEFINIÇÕES
                </button>
            </div>
        `;
        document.getElementById('btnGoToPresets').onclick = () => UI.switchConfigTab('presetsTab');
        Utils.updateStatus('sitesCount', 0);
    },

    renderPresetView(preset) {
        const list = document.getElementById('sitesList');
        if (!list) return;

        list.innerHTML = '';
        const sites = preset.sites || [];

        // Header do Preset
        const header = document.createElement('div');
        header.style.cssText = 'padding: 15px; background: #e8f8f5; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #27ae60; display: flex; justify-content: space-between; align-items: center;';
        header.innerHTML = `
            <div>
                <strong style="color: #27ae60; font-size: 16px;">✓ Editando: ${preset.name}</strong>
                <div style="color: #7f8c8d; margin-top: 4px;">Gerenciando ${sites.length} sites isolados deste preset</div>
            </div>
            <button class="btn btn-secondary" id="btnBackToPresets" style="padding: 8px 15px;">
                ← Voltar aos Presets
            </button>
        `;
        list.appendChild(header);

        // Seção: Passos pós-login do preset (compartilhados por todos os sites)
        const presetStepsSection = document.createElement('div');
        presetStepsSection.id = 'presetStepsSection';
        presetStepsSection.style.cssText = 'padding: 16px; background: #f8fafc; border-radius: 8px; margin-bottom: 20px; border: 1px solid #e2e8f0;';
        presetStepsSection.innerHTML = `
            <div class="config-section-title" style="margin-bottom: 8px;">📋 Passos pós-login do preset</div>
            <p style="color: #64748b; font-size: 11px; margin-bottom: 12px;">Altere aqui uma vez e vale para todos os ${sites.length} sites deste preset.</p>
            <p style="color: #0ea5e9; font-size: 10px; margin-bottom: 10px; background: #f0f9ff; padding: 6px 8px; border-radius: 4px;">💡 Para o sistema nomear os arquivos por período, use o passo <strong>Preencher Período</strong> com seletor <code>#dataIni,#dataFim</code> e valor <strong>[TRIM_ATUAL]</strong>, <strong>[MES_ATUAL]</strong> ou datas (ex: 01/01/2026,28/08/2026). Use o botão 📅 no valor para atalhos.</p>
            <div style="display: flex; gap: 5px; margin-bottom: 5px; padding: 0 5px;">
                <small style="width: 100px; color: #95a5a6; font-weight: 700; font-size: 9px; text-transform: uppercase;">Ação</small>
                <small style="flex: 1; color: #95a5a6; font-weight: 700; font-size: 9px; text-transform: uppercase;">Seletor CSS ou URL</small>
                <small style="width: 180px; color: #95a5a6; font-weight: 700; font-size: 9px; text-transform: uppercase;">Texto / Valor</small>
                <small style="width: 25px;"></small>
                <small style="width: 30px; color: #95a5a6; font-weight: 700; font-size: 9px; text-transform: uppercase;" title="Continuar em caso de erro">OPT</small>
            </div>
            <div id="presetStepsList" style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px;"></div>
            <div style="display: flex; gap: 8px; flex-wrap: wrap; align-items: center;">
                <button class="btn btn-secondary" id="btnAddPresetStep" style="font-size: 10px; padding: 6px 12px;">➕ Adicionar passo</button>
                <button class="btn btn-success" id="btnSavePresetSteps" style="font-size: 10px; padding: 6px 12px;">💾 Salvar passos do preset</button>
                ${(!preset.steps || preset.steps.length === 0) && sites.some(s => s.steps?.length) ? '<button class="btn btn-secondary" id="btnCopyStepsFromFirst" style="font-size: 10px; padding: 6px 12px;">📋 Copiar do primeiro site</button>' : ''}
            </div>
        `;
        list.appendChild(presetStepsSection);

        const presetStepsListEl = document.getElementById('presetStepsList');
        if (document.getElementById('btnCopyStepsFromFirst')) {
            document.getElementById('btnCopyStepsFromFirst').onclick = () => {
                const firstWithSteps = sites.find(s => s.steps?.length);
                if (!firstWithSteps) return;
                presetStepsListEl.innerHTML = '';
                (firstWithSteps.steps || []).forEach(step => {
                    const row = this.createStepRowElement(step.type, step.selector, step.value, step.continueOnError, step.skipStep);
                    presetStepsListEl.appendChild(row);
                });
                this.setupStepListDragDropIfNeeded(presetStepsListEl);
                Utils.showNotification('Passos do primeiro site carregados. Clique em "Salvar passos do preset" para aplicar a todos.', 'info');
            };
        }
        (preset.steps || []).forEach(step => {
            const row = this.createStepRowElement(step.type, step.selector, step.value, step.continueOnError, step.skipStep);
            presetStepsListEl.appendChild(row);
        });
        this.setupStepListDragDropIfNeeded(presetStepsListEl);
        presetStepsSection.querySelector('#btnAddPresetStep').onclick = () => {
            const row = this.createStepRowElement();
            presetStepsListEl.appendChild(row);
            this.setupStepListDragDropIfNeeded(presetStepsListEl);
        };
        presetStepsSection.querySelector('#btnSavePresetSteps').onclick = () => this.savePresetSteps();

        list.querySelector('#btnBackToPresets').onclick = () => UI.switchConfigTab('presetsTab');

        if (sites.length === 0) {
            const empty = document.createElement('div');
            empty.style.cssText = 'text-align: center; color: #7f8c8d; padding: 40px; background: #ffffff; border-radius: 8px; border: 1px dashed #dce4ec;';
            empty.innerHTML = `
                <div style="font-size: 48px; margin-bottom: 15px;">📭</div>
                <h3 style="color: #2c3e50; margin: 0 0 10px 0;">Nenhum site configurado</h3>
                <p style="margin-bottom: 20px;">Este preset ainda não tem sites configurados.</p>
                <button class="btn btn-primary" id="btnAddFirstSite" style="padding: 12px 24px;">
                    ➕ Adicionar Primeiro Site
                </button>
            `;
            list.appendChild(empty);
            list.querySelector('#btnAddFirstSite').onclick = () => this.showSiteForm();
        } else {
            const counter = document.createElement('div');
            counter.style.cssText = 'background: #ebf5fb; color: #3498db; padding: 10px 15px; border-radius: 6px; margin-bottom: 15px; font-weight: 600; display: flex; justify-content: space-between; align-items: center;';
            counter.innerHTML = `
                <span>Total de sites: ${sites.length}</span>
                <button class="btn btn-success" id="btnAddSite" style="padding: 6px 12px; font-size: 12px;">
                    ➕ Novo Site
                </button>
            `;
            list.appendChild(counter);
            list.querySelector('#btnAddSite').onclick = () => this.showSiteForm();

            sites.forEach((site) => {
                const div = document.createElement('div');
                div.style.cssText = 'padding: 15px; background: #ffffff; border-radius: 8px; border: 1px solid #e6e9ed; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center; transition: all 0.2s;';
                div.innerHTML = `
                    <div style="flex: 1;">
                        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 6px;">
                            <strong style="color: #2c3e50; font-size: 14px;">${site.name || 'Nome não definido'}</strong>
                            <span style="font-size: 10px; padding: 2px 6px; background: #f1f2f6; color: #7f8c8d; border-radius: 4px;">${site.uf || 'SC'}</span>
                        </div>
                        <div style="font-size: 11px; color: #95a5a6;">URL: ${site.url || site.loginUrl || 'Não definida'}</div>
                        <div style="font-size: 10px; color: #3498db; margin-top: 4px;">${(preset.steps && preset.steps.length > 0) ? `Passos do preset: ${preset.steps.length}` : `Ações configuradas: ${site.steps?.length || 0}`}</div>
                    </div>
                    <div style="display: flex; gap: 8px;">
                        <button class="btn btn-browser" data-id="${site.id}" style="padding: 6px 10px; min-width: 0; background: #e8f8f5; border-color: #a3e4d7;" title="Abrir Navegador para Login">🌐</button>
                        <button class="btn btn-dup" data-id="${site.id}" style="padding: 6px 10px; min-width: 0; background: #fef5e7; border-color: #f9e79f;" title="Duplicar Site/Ações">📋</button>
                        <button class="btn btn-edit" data-id="${site.id}" style="padding: 6px 10px; min-width: 0;" title="Editar Configurações">✏️</button>
                        <button class="btn btn-delete" data-id="${site.id}" style="padding: 6px 10px; min-width: 0;" title="Excluir Site" class="btn btn-danger">🗑️</button>
                    </div>
                `;
                list.appendChild(div);
            });

            // Listeners
            list.querySelectorAll('.btn-browser').forEach(btn => btn.onclick = () => this.openBrowserForLogin(btn.dataset.id));
            list.querySelectorAll('.btn-dup').forEach(btn => btn.onclick = () => this.duplicateSite(btn.dataset.id));
            list.querySelectorAll('.btn-edit').forEach(btn => btn.onclick = () => this.editSite(btn.dataset.id));
            list.querySelectorAll('.btn-delete').forEach(btn => btn.onclick = () => this.deleteSite(btn.dataset.id));
        }
        Utils.updateStatus('sitesCount', sites.length);
    },


    async showSiteForm() {
        const form = document.getElementById('siteForm');
        if (form) {
            form.style.display = 'block';
            setTimeout(() => form.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
        }
        const footer = document.getElementById('configModalFooter');
        if (footer) footer.style.display = 'none';

        document.getElementById('siteId').value = '';
        document.getElementById('sName').value = '';
        document.getElementById('sLoginUrl').value = '';
        document.getElementById('sUserField').value = '';
        document.getElementById('sPassField').value = '';
        document.getElementById('sLoginBtn').value = '';
        document.getElementById('sReportType').value = '';
        document.getElementById('sUF').value = 'SC';
        document.getElementById('sDest').value = '';
        document.getElementById('stepsList').innerHTML = '';
        document.getElementById('siteCopyFrom').value = '';

        const copySelect = document.getElementById('siteCopyFrom');
        let currentPreset = null;
        if (copySelect && State.editingPresetId) {
            try {
                const presets = await window.electronAPI.getPresets();
                currentPreset = presets.find(p => p.id === State.editingPresetId);
                const sites = currentPreset?.sites || [];
                copySelect.innerHTML = '<option value="">— Nenhum (formulário em branco) —</option>' +
                    sites.map(s => `<option value="${s.id}">${s.name || s.id} (${s.uf || '-'})</option>`).join('');
                if (!copySelect.dataset.bound) {
                    copySelect.dataset.bound = '1';
                    copySelect.onchange = () => this.applyCopyFromSite(copySelect.value);
                }
            } catch (e) {
                copySelect.innerHTML = '<option value="">— Nenhum —</option>';
            }
        }

        const siteStepsBlock = document.getElementById('siteStepsBlock');
        const presetStepsMessage = document.getElementById('presetStepsMessage');
        if (siteStepsBlock && presetStepsMessage && currentPreset?.steps?.length > 0) {
            siteStepsBlock.style.display = 'none';
            presetStepsMessage.style.display = 'block';
        } else if (siteStepsBlock && presetStepsMessage) {
            siteStepsBlock.style.display = 'block';
            presetStepsMessage.style.display = 'none';
        }

        if (SelectorUtils && SelectorUtils.setupAutoConvert) {
            SelectorUtils.setupAutoConvert(document.getElementById('sUserField'));
            SelectorUtils.setupAutoConvert(document.getElementById('sPassField'));
            SelectorUtils.setupAutoConvert(document.getElementById('sLoginBtn'));
        }
    },

    async applyCopyFromSite(siteId) {
        if (!siteId || !State.editingPresetId) return;
        const presets = await window.electronAPI.getPresets();
        const preset = presets.find(p => p.id === State.editingPresetId);
        const site = preset?.sites?.find(s => s.id === siteId);
        if (!site) return;
        const isNewSite = !document.getElementById('siteId').value;
        this.populateFormFromSite(site, isNewSite);
    },

    populateFormFromSite(site, clearIdAndName = false) {
        if (clearIdAndName) {
            document.getElementById('siteId').value = '';
            document.getElementById('sName').value = '';
        }
        document.getElementById('sLoginUrl').value = site.loginUrl || site.url || '';
        document.getElementById('sUserField').value = site.usernameField || '';
        document.getElementById('sPassField').value = site.passwordField || '';
        document.getElementById('sLoginBtn').value = site.loginButton || '';
        document.getElementById('sReportType').value = site.reportType || '';
        document.getElementById('sUF').value = site.uf || 'SC';
        document.getElementById('sDest').value = site.downloadPath || '';
        const list = document.getElementById('stepsList');
        if (list) {
            list.innerHTML = '';
            (site.steps || []).forEach(step => {
                const row = this.createStepRowElement(step.type, step.selector, step.value, step.continueOnError, step.skipStep);
                list.appendChild(row);
            });
            this.setupStepListDragDropIfNeeded(list);
        }
        if (SelectorUtils && SelectorUtils.setupAutoConvert) {
            SelectorUtils.setupAutoConvert(document.getElementById('sUserField'));
            SelectorUtils.setupAutoConvert(document.getElementById('sPassField'));
            SelectorUtils.setupAutoConvert(document.getElementById('sLoginBtn'));
        }
    },


    hideSiteForm() {
        const form = document.getElementById('siteForm');
        if (form) form.style.display = 'none';
        const footer = document.getElementById('configModalFooter');
        if (footer) footer.style.display = 'flex';
    },

    addStepRow(type = 'goto', selector = '', value = '', continueOnError = false) {
        const list = document.getElementById('stepsList');
        if (!list) return;
        const row = this.createStepRowElement(type, selector, value, continueOnError);
        list.appendChild(row);
        this.setupStepListDragDropIfNeeded(list);
    },

    insertStepAbove(currentRow) {
        const newRow = this.createStepRowElement();
        const list = currentRow.parentElement;
        if (list) list.insertBefore(newRow, currentRow);
    },

    moveStepUp(row) {
        const list = row.parentElement;
        if (!list) return;
        const prev = row.previousElementSibling;
        if (prev) list.insertBefore(row, prev);
    },

    moveStepDown(row) {
        const list = row.parentElement;
        if (!list) return;
        const next = row.nextElementSibling;
        if (next) list.insertBefore(next, row);
    },

    setupStepListDragDropIfNeeded(listEl) {
        if (!listEl || listEl.dataset.stepDragSetup === '1') return;
        listEl.dataset.stepDragSetup = '1';
        listEl.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
        });
        listEl.addEventListener('drop', (e) => {
            e.preventDefault();
            const row = this._draggedStepRow;
            if (!row || !row.parentElement) return;
            const target = e.target.closest('.step-row');
            if (target && target !== row) row.parentElement.insertBefore(row, target);
            this._draggedStepRow = null;
        });
    },

    createStepRowElement(type = 'goto', selector = '', value = '', continueOnError = false, skipStep = false) {
        const row = document.createElement('div');
        row.className = 'step-row';
        row.style.cssText = 'display: flex; flex-direction: column; gap: 2px; margin-bottom: 8px; padding: 8px; background: #fcfdfe; border-radius: 8px; border: 1px solid #f1f4f6;';

        let s1 = selector, s2 = '';
        if (type === 'fillDateRange' && selector.includes(',')) {
            [s1, s2] = selector.split(',').map(s => s.trim());
        }
        const escapeHtml = Utils.escapeHtml;

        row.innerHTML = `
            <div style="display: flex; gap: 5px; align-items: center;">
                <span class="step-drag-handle" draggable="true" style="cursor: grab; padding: 2px 4px; font-size: 12px; color: #95a5a6; user-select: none;" title="Arrastar para reordenar">⋮⋮</span>
                <button class="btn btn-up" style="padding: 2px 5px; font-size: 10px; min-width: 25px; background: #ecf0f1; border-color: #bdc3c7;" title="Subir">⬆️</button>
                <button class="btn btn-down" style="padding: 2px 5px; font-size: 10px; min-width: 25px; background: #ecf0f1; border-color: #bdc3c7;" title="Descer">⬇️</button>
                <select class="step-type" style="width: 100px; padding: 3px; font-size: 11px; border-radius: 4px; border: 1px solid #dce4ec;">
                    <option value="goto" ${type === 'goto' ? 'selected' : ''}>Ir para</option>
                    <option value="click" ${type === 'click' ? 'selected' : ''}>Clicar</option>
                    <option value="hover" ${type === 'hover' ? 'selected' : ''}>Passar Mouse</option>
                    <option value="fill" ${type === 'fill' ? 'selected' : ''}>Digitar</option>
                    <option value="fillDateRange" ${type === 'fillDateRange' ? 'selected' : ''}>Preencher Período</option>
                    <option value="select" ${type === 'select' ? 'selected' : ''}>Selecionar</option>
                    <option value="waitFor" ${type === 'waitFor' ? 'selected' : ''}>Esperar</option>
                    <option value="download" ${type === 'download' ? 'selected' : ''}>Download</option>
                </select>
                <input type="text" class="step-selector" placeholder="Seletor CSS..." value="${escapeHtml(s1)}" style="flex: 1; padding: 3px; font-size: 11px; border-radius: 4px; border: 1px solid #dce4ec;">
                <div style="position: relative; width: 180px; display: flex; gap: 2px;">
                    <input type="text" class="step-value" placeholder="Texto..." value="${escapeHtml(value)}" style="flex: 1; padding: 3px; font-size: 11px; border-radius: 4px; border: 1px solid #dce4ec;">
                    <button class="btn btn-date-presets" style="padding: 2px 4px; min-width: 0;" title="Datas Rápidas">📅</button>
                </div>
                <button class="btn btn-remove-step btn-danger" style="padding: 2px 5px; font-size: 10px; min-width: 25px;">×</button>
                <input type="checkbox" class="step-optional" ${continueOnError ? 'checked' : ''} title="Continuar mesmo se falhar" style="width: 20px; height: 20px; cursor: pointer; accent-color: #3498db;">
                <input type="checkbox" class="step-skip" ${skipStep ? 'checked' : ''} title="Ignorar este passo (não executar)" style="width: 20px; height: 20px; cursor: pointer; accent-color: #95a5a6;">
            </div>
             <div class="secondary-row" style="display: ${type === 'fillDateRange' ? 'flex' : 'none'}; gap: 5px; align-items: center; margin-top: 4px; padding-left: 105px;">
                <input type="text" class="step-selector-2" placeholder="Seletor Fim (Opcional)..." value="${escapeHtml(s2)}" style="flex: 1; padding: 3px; font-size: 11px; border-radius: 4px; border: 1px solid #dce4ec;">
                <div style="width: 180px;"></div>
                <div style="width: 25px;"></div>
            </div>
        `;

        // Listeners
        row.querySelector('.step-type').onchange = (e) => {
            row.querySelector('.secondary-row').style.display = e.target.value === 'fillDateRange' ? 'flex' : 'none';
        };
        row.querySelector('.btn-up').onclick = () => this.moveStepUp(row);
        row.querySelector('.btn-down').onclick = () => this.moveStepDown(row);
        row.querySelector('.btn-remove-step').onclick = () => row.remove();

        const dragHandle = row.querySelector('.step-drag-handle');
        if (dragHandle) {
            dragHandle.addEventListener('dragstart', (e) => {
                this._draggedStepRow = row;
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', 'step');
                row.style.opacity = '0.5';
            });
            dragHandle.addEventListener('dragend', () => {
                this._draggedStepRow = null;
                row.style.opacity = '';
            });
        }

        const valueInput = row.querySelector('.step-value');
        const datePresetBtn = row.querySelector('.btn-date-presets');
        if (datePresetBtn && valueInput) {
            datePresetBtn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.toggleDatePresetMenu(datePresetBtn, valueInput);
            };
        }

        if (SelectorUtils) {
            SelectorUtils.setupAutoConvert(row.querySelector('.step-selector'));
            SelectorUtils.setupAutoConvert(row.querySelector('.step-selector-2'));
        }

        return row;
    },

    /**
     * Abre/fecha menu de tokens de período para o passo "Preencher Período".
     * Inclui: tokens relativos + picker de período histórico (mês/ano ou trimestre/ano).
     */
    toggleDatePresetMenu(anchor, valueInput) {
        const existing = document.getElementById('date-preset-menu');
        if (existing) { existing.remove(); return; }

        const menu = document.createElement('div');
        menu.id = 'date-preset-menu';
        menu.style.cssText = `
            position: fixed; z-index: 10000; background: #fff;
            border: 1px solid #e2e8f0; border-radius: 10px;
            box-shadow: 0 8px 24px rgba(0,0,0,0.15); padding: 10px;
            min-width: 300px; font-family: inherit;
        `;
        const rect = anchor.getBoundingClientRect();
        menu.style.left = `${Math.min(rect.left, window.innerWidth - 320)}px`;
        menu.style.top = `${rect.bottom + 6}px`;

        const close = () => {
            const m = document.getElementById('date-preset-menu');
            if (m) m.remove();
            document.removeEventListener('click', close);
        };

        const setVal = (v) => {
            valueInput.value = v;
            valueInput.dispatchEvent(new Event('input', { bubbles: true }));
            close();
        };

        // --- Seção 1: Tokens relativos (dinâmicos) ---
        const relDiv = document.createElement('div');
        relDiv.innerHTML = `<div style="font-size:9px;font-weight:700;color:#64748b;text-transform:uppercase;margin-bottom:5px;padding:2px 4px;">⏰ Relativo (automático)</div>`;
        const relTokens = [
            { label: '📅 Mês Atual', value: '[MES_ATUAL]' },
            { label: '📅 Mês Anterior', value: '[MES_ANTERIOR]' },
            { label: '📊 Trimestre Atual', value: '[TRIM_ATUAL]' },
            { label: '📊 Trimestre Anterior', value: '[TRIM_ANTERIOR]' },
            { label: '📆 Ano Atual', value: '[ANO_ATUAL]' },
        ];
        relTokens.forEach(t => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.textContent = t.label;
            btn.style.cssText = 'display:block;width:100%;text-align:left;padding:6px 10px;border:none;background:none;font-size:12px;cursor:pointer;color:#334155;border-radius:5px;';
            btn.onmouseenter = () => btn.style.background = '#f1f5f9';
            btn.onmouseleave = () => btn.style.background = 'none';
            btn.onclick = (e) => { e.preventDefault(); e.stopPropagation(); setVal(t.value); };
            relDiv.appendChild(btn);
        });
        menu.appendChild(relDiv);

        // Separador
        const sep1 = document.createElement('hr');
        sep1.style.cssText = 'border:none;border-top:1px solid #e2e8f0;margin:6px 0;';
        menu.appendChild(sep1);

        // --- Seção 2: Período Histórico por Mês ---
        const histDiv = document.createElement('div');
        const currentYear = new Date().getFullYear();
        const years = [];
        for (let y = currentYear; y >= 2022; y--) years.push(y);

        const monthNames = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

        histDiv.innerHTML = `<div style="font-size:9px;font-weight:700;color:#64748b;text-transform:uppercase;margin-bottom:6px;padding:2px 4px;">📁 Período Específico → [PERIODO:YYYY-MM]</div>`;

        const pickerRow = document.createElement('div');
        pickerRow.style.cssText = 'display:flex;gap:6px;align-items:center;padding:4px;';

        const monthSel = document.createElement('select');
        monthSel.style.cssText = 'flex:1;padding:5px;border:1px solid #cbd5e1;border-radius:6px;font-size:12px;';
        monthNames.forEach((name, idx) => {
            const opt = document.createElement('option');
            const mm = String(idx + 1).padStart(2, '0');
            opt.value = mm;
            opt.textContent = name;
            if (idx + 1 === new Date().getMonth() + 1) opt.selected = true;
            monthSel.appendChild(opt);
        });

        const yearSel = document.createElement('select');
        yearSel.style.cssText = 'width:80px;padding:5px;border:1px solid #cbd5e1;border-radius:6px;font-size:12px;';
        years.forEach(y => {
            const opt = document.createElement('option');
            opt.value = y;
            opt.textContent = y;
            if (y === currentYear) opt.selected = true;
            yearSel.appendChild(opt);
        });

        const applyBtn = document.createElement('button');
        applyBtn.type = 'button';
        applyBtn.textContent = '✓ Usar';
        applyBtn.style.cssText = 'padding:5px 10px;background:#3b82f6;color:white;border:none;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer;white-space:nowrap;';
        applyBtn.onclick = (e) => {
            e.preventDefault(); e.stopPropagation();
            setVal(`[PERIODO:${yearSel.value}-${monthSel.value}]`);
        };

        pickerRow.appendChild(monthSel);
        pickerRow.appendChild(yearSel);
        pickerRow.appendChild(applyBtn);
        histDiv.appendChild(pickerRow);

        // Preview do token
        const preview = document.createElement('div');
        preview.style.cssText = 'font-size:10px;color:#3b82f6;padding:3px 8px;background:#eff6ff;border-radius:4px;margin:4px 4px 2px;font-family:monospace;';
        const updatePreview = () => {
            const mm = monthSel.value;
            const yy = yearSel.value;
            const mIdx = parseInt(mm, 10) - 1;
            const lastDay = new Date(parseInt(yy), mIdx + 1, 0).getDate();
            const mName = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'][mIdx];
            preview.textContent = `[PERIODO:${yy}-${mm}] → 01/${mm}/${yy} a ${String(lastDay).padStart(2, '0')}/${mm}/${yy} · Arquivo: ${mName}${yy}`;
        };
        monthSel.onchange = updatePreview;
        yearSel.onchange = updatePreview;
        updatePreview();
        histDiv.appendChild(preview);
        menu.appendChild(histDiv);

        // Separador
        const sep2 = document.createElement('hr');
        sep2.style.cssText = 'border:none;border-top:1px solid #e2e8f0;margin:6px 0;';
        menu.appendChild(sep2);

        // --- Seção 3: Trimestre Histórico ---
        const triDiv = document.createElement('div');
        triDiv.innerHTML = `<div style="font-size:9px;font-weight:700;color:#64748b;text-transform:uppercase;margin-bottom:6px;padding:2px 4px;">📊 Trimestre Específico → [PERIODO:YYYY-QN]</div>`;

        const triPickerRow = document.createElement('div');
        triPickerRow.style.cssText = 'display:flex;gap:6px;align-items:center;padding:4px;';

        const triSel = document.createElement('select');
        triSel.style.cssText = 'flex:1;padding:5px;border:1px solid #cbd5e1;border-radius:6px;font-size:12px;';
        [['Q1', 'Jan–Mar'], ['Q2', 'Abr–Jun'], ['Q3', 'Jul–Set'], ['Q4', 'Out–Dez']].forEach(([qv, ql]) => {
            const opt = document.createElement('option');
            opt.value = qv; opt.textContent = `${qv} (${ql})`;
            triSel.appendChild(opt);
        });

        const triYearSel = document.createElement('select');
        triYearSel.style.cssText = 'width:80px;padding:5px;border:1px solid #cbd5e1;border-radius:6px;font-size:12px;';
        years.forEach(y => {
            const opt = document.createElement('option');
            opt.value = y; opt.textContent = y;
            if (y === currentYear) opt.selected = true;
            triYearSel.appendChild(opt);
        });

        const triApplyBtn = document.createElement('button');
        triApplyBtn.type = 'button';
        triApplyBtn.textContent = '✓ Usar';
        triApplyBtn.style.cssText = 'padding:5px 10px;background:#8b5cf6;color:white;border:none;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer;white-space:nowrap;';
        triApplyBtn.onclick = (e) => {
            e.preventDefault(); e.stopPropagation();
            setVal(`[PERIODO:${triYearSel.value}-${triSel.value}]`);
        };

        triPickerRow.appendChild(triSel);
        triPickerRow.appendChild(triYearSel);
        triPickerRow.appendChild(triApplyBtn);
        triDiv.appendChild(triPickerRow);
        menu.appendChild(triDiv);

        document.body.appendChild(menu);

        // Impede que cliques DENTRO do menu se propaguem ao document
        // (caso contrário os <select> fecham o menu ao abrir)
        menu.addEventListener('click', (e) => e.stopPropagation());
        menu.addEventListener('mousedown', (e) => e.stopPropagation());

        setTimeout(() => document.addEventListener('click', close), 0);
    },

    async handleSaveSite() {
        if (!State.editingPresetId) {
            Utils.showNotification('Erro: Nenhum preset selecionado para edição!', 'error');
            return;
        }

        const id = document.getElementById('siteId').value || `site-${Date.now()}`;
        const name = document.getElementById('sName').value;
        const url = document.getElementById('sLoginUrl').value;

        // Coleta steps
        const stepRows = document.querySelectorAll('.step-row');
        const steps = Array.from(stepRows).map(row => {
            const type = row.querySelector('.step-type').value;
            let selector = row.querySelector('.step-selector').value;
            let value = row.querySelector('.step-value').value || '';

            if (type === 'fillDateRange') {
                const s2 = row.querySelector('.step-selector-2').value;
                if (s2) selector = `${selector},${s2}`;
            }

            return {
                type,
                selector,
                value: value || undefined,
                continueOnError: row.querySelector('.step-optional').checked,
                skipStep: row.querySelector('.step-skip')?.checked || false
            };
        });

        const reportType = document.getElementById('sReportType').value;

        try {
            const presets = await window.electronAPI.getPresets();
            const preset = presets.find(p => p.id === State.editingPresetId);

            if (!preset) throw new Error('Preset não encontrado');

            // Se o preset tem passos compartilhados, o site não armazena passos (engine usa preset.steps)
            const stepsToSave = (preset.steps && preset.steps.length > 0) ? [] : steps;

            const siteConfig = {
                id,
                name,
                url,
                loginUrl: url,
                usernameField: document.getElementById('sUserField').value,
                passwordField: document.getElementById('sPassField').value,
                loginButton: document.getElementById('sLoginBtn').value,
                reportType: document.getElementById('sReportType').value || undefined,
                uf: document.getElementById('sUF').value || 'SC',
                downloadPath: document.getElementById('sDest').value || undefined,
                steps: stepsToSave
            };

            if (!preset.sites) preset.sites = [];
            const existingIndex = preset.sites.findIndex(s => s.id === id);

            if (existingIndex !== -1) {
                preset.sites[existingIndex] = siteConfig;
            } else {
                preset.sites.push(siteConfig);
            }

            await window.electronAPI.savePreset(preset);
            Utils.showNotification('Site e Ações salvos com sucesso!', 'success');

            // Atualiza UI instantaneamente com os dados locais
            this.renderPresetView(preset);
            this.hideSiteForm();
            window.loadPresets(); // Atualiza a contagem na aba de Presets

        } catch (error) {
            Utils.showNotification(`Erro ao salvar: ${error.message}`, 'error');
        }
    },

    async savePresetSteps() {
        if (!State.editingPresetId) return;
        const container = document.getElementById('presetStepsList');
        if (!container) return;
        const stepRows = container.querySelectorAll('.step-row');
        const steps = Array.from(stepRows).map(row => {
            const type = row.querySelector('.step-type').value;
            let selector = row.querySelector('.step-selector').value;
            let value = (row.querySelector('.step-value') && row.querySelector('.step-value').value) || '';
            if (type === 'fillDateRange') {
                const s2 = row.querySelector('.step-selector-2')?.value;
                if (s2) selector = `${selector},${s2}`;
            }
            return {
                type,
                selector,
                value: value || undefined,
                continueOnError: row.querySelector('.step-optional')?.checked || false,
                skipStep: row.querySelector('.step-skip')?.checked || false
            };
        });
        try {
            const presets = await window.electronAPI.getPresets();
            const preset = presets.find(p => p.id === State.editingPresetId);
            if (!preset) throw new Error('Preset não encontrado');
            preset.steps = steps;
            await window.electronAPI.savePreset(preset);
            Utils.showNotification('Passos do preset salvos! Alteração vale para todos os sites.', 'success');
        } catch (error) {
            Utils.showNotification(`Erro ao salvar passos do preset: ${error.message}`, 'error');
        }
    },

    async editSite(id) {
        if (!State.editingPresetId) return;

        const presets = await window.electronAPI.getPresets();
        const preset = presets.find(p => p.id === State.editingPresetId);
        const site = preset?.sites?.find(s => s.id === id);

        if (site) {
            await this.showSiteForm();
            document.getElementById('siteCopyFrom').value = '';
            document.getElementById('siteId').value = site.id;
            document.getElementById('sName').value = site.name;
            document.getElementById('sLoginUrl').value = site.loginUrl || site.url || '';
            document.getElementById('sUserField').value = site.usernameField;
            document.getElementById('sPassField').value = site.passwordField;
            document.getElementById('sLoginBtn').value = site.loginButton;
            document.getElementById('sReportType').value = site.reportType || '';
            document.getElementById('sUF').value = site.uf || 'SC';
            document.getElementById('sDest').value = site.downloadPath || '';

            const list = document.getElementById('stepsList');
            if (list) {
                list.innerHTML = '';
                if (site.steps) {
                    site.steps.forEach(step => {
                        const row = this.createStepRowElement(step.type, step.selector, step.value, step.continueOnError, step.skipStep);
                        list.appendChild(row);
                    });
                }
                this.setupStepListDragDropIfNeeded(list);
            }
        }
    },

    async deleteSite(id) {
        if (!State.editingPresetId) return;

        if (confirm('Deseja excluir as configurações deste site?')) {
            const presets = await window.electronAPI.getPresets();
            const preset = presets.find(p => p.id === State.editingPresetId);

            if (preset && preset.sites) {
                // Check if the deleted site is currently open in the form
                const currentFormId = document.getElementById('siteId').value;
                if (currentFormId === id) {
                    this.hideSiteForm();
                }

                preset.sites = preset.sites.filter(s => s.id !== id);
                await window.electronAPI.savePreset(preset);
                Utils.showNotification('Site removido do preset', 'success');
                // Atualização instantânea local
                this.renderPresetView(preset);
                window.loadPresets(); // Atualiza a contagem na aba de Presets
            }
        }
    },

    async duplicateSite(id) {
        if (!State.editingPresetId) return;

        try {
            const presets = await window.electronAPI.getPresets();
            const preset = presets.find(p => p.id === State.editingPresetId);
            const originalSite = preset?.sites?.find(s => s.id === id);

            if (!originalSite) return;

            const duplicatedSite = JSON.parse(JSON.stringify(originalSite));
            duplicatedSite.id = `site-${Date.now()}`;
            duplicatedSite.name = `${originalSite.name} - Cópia`;

            if (!preset.sites) preset.sites = [];
            preset.sites.push(duplicatedSite);
            await window.electronAPI.savePreset(preset);

            Utils.showNotification('Site duplicado!', 'success');
            // Atualização instantânea local
            this.renderPresetView(preset);
            window.loadPresets(); // Atualiza a contagem na aba de Presets
        } catch (error) {
            Utils.showNotification('Erro ao duplicar site', 'error');
        }
    },

    async openBrowserForLogin(siteId) {
        try {
            Utils.log(`🌐 Abrindo navegador para login manual no site ID: ${siteId}`);
            Utils.showNotification('Abrindo navegador...', 'info');
            const result = await window.electronAPI.openBrowserForLogin(siteId);
            if (result.success) {
                Utils.log('✅ Navegador fechado. Sessão atualizada.');
                Utils.showNotification('Sessão atualizada!', 'success');
            }
        } catch (error) {
            Utils.log(`❌ Erro ao abrir navegador: ${error}`);
            Utils.showNotification('Erro ao abrir navegador', 'error');
        }
    }
};
