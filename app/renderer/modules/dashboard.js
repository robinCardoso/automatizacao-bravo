// dashboard.js - Módulo de Dashboard e Visualização de Dados
import { Utils } from './utils.js';

export const Dashboard = {
    charts: {
        date: null,
        group: null,
        category: null,
        brand: null,
        uf: null,
        associado: null
    },

    activeChartSubmenu: 1,

    switchChartSubmenu(num) {
        this.activeChartSubmenu = num;
        document.querySelectorAll('.chart-submenu-btn').forEach(btn => {
            btn.classList.toggle('active', parseInt(btn.getAttribute('data-chart-submenu'), 10) === num);
        });
        document.querySelectorAll('.dashboard-chart-panel').forEach(panel => {
            panel.classList.toggle('active', parseInt(panel.getAttribute('data-chart-submenu'), 10) === num);
        });
    },

    /**
     * Alterna entre as visualizações da aplicação
     */
    switchView(viewId) {
        // Atualiza botões da sidebar
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.classList.remove('active');
            if (btn.getAttribute('onclick').includes(`'${viewId}'`)) {
                btn.classList.add('active');
            }
        });

        // Alterna containers principais
        document.querySelectorAll('.app-view').forEach(view => {
            view.classList.remove('active-view');
        });

        const targetView = document.getElementById(`view-${viewId}`);
        if (targetView) targetView.classList.add('active-view');

        if (viewId === 'dashboard') {
            this.loadDashboard();
        }
    },

    /**
     * Alterna entre as abas internas da visualização de automação
     */
    switchTab(tabId) {
        // Atualiza botões de tab
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        const activeTabBtn = document.getElementById(`tabBtn${tabId.charAt(0).toUpperCase() + tabId.slice(1)}`);
        if (activeTabBtn) activeTabBtn.classList.add('active');

        // Alterna conteúdos das tabs
        document.querySelectorAll('.internal-tab').forEach(tab => {
            tab.classList.remove('active');
            tab.style.display = 'none';
        });

        const targetTab = document.getElementById(`tab-${tabId}`);
        if (targetTab) {
            targetTab.classList.add('active');
            targetTab.style.display = 'flex';
        }
    },

    /**
     * Define o tipo de relatório e recarrega
     */
    setReportType(type) {
        const input = document.getElementById('dashReportType');
        if (input) input.value = type;

        // Atualiza visual dos botões
        document.querySelectorAll('.btn-toggle').forEach(btn => btn.classList.remove('active'));
        const activeBtn = document.getElementById(`btnType${type}`);
        if (activeBtn) activeBtn.classList.add('active');

        this.loadDashboard();
    },

    openUnknownRefsModal() {
        if (!this.currentData || !this.currentData.unknownRefs) return;

        const tbody = document.getElementById('unknownRefsTableBody');
        tbody.innerHTML = '';

        this.currentData.unknownRefs
            .sort((a, b) => b.count - a.count)
            .forEach(item => {
                const tr = document.createElement('tr');
                // Sanitize ref for use as ID (remove special characters)
                const safeId = item.ref.replace(/[^a-zA-Z0-9]/g, '_');

                tr.innerHTML = `
                    <td style="padding: 8px; border-bottom: 1px solid #eee; color: #fff; font-weight: 600;">${item.ref}</td>
                    <td style="padding: 8px; text-align: center; border-bottom: 1px solid #eee; color: #fff; font-weight: 600;">${item.count}</td>
                    <td style="padding: 8px; border-bottom: 1px solid #eee;">
                        <input type="text" class="form-control" id="brand_${safeId}" data-ref="${item.ref}" placeholder="Ex: EATON" 
                            style="font-size: 11px; padding: 4px; background: white; color: #333;">
                    </td>
                    <td style="padding: 8px; border-bottom: 1px solid #eee;">
                        <input type="text" class="form-control" id="group_${safeId}" data-ref="${item.ref}" placeholder="Ex: ELRING" 
                            style="font-size: 11px; padding: 4px; background: white; color: #333;">
                    </td>
                    <td style="padding: 8px; border-bottom: 1px solid #eee;">
                        <input type="text" class="form-control" id="subgroup_${safeId}" data-ref="${item.ref}" placeholder="Ex: TAKAO" 
                            style="font-size: 11px; padding: 4px; background: white; color: #333;">
                    </td>
                    <td style="padding: 8px; text-align: center; border-bottom: 1px solid #eee;">
                        <button class="premium-btn primary" onclick="Dashboard.saveCatalogItem('${safeId}')" 
                            style="padding: 4px 8px; font-size: 11px;">💾 Salvar</button>
                    </td>
                `;
                tbody.appendChild(tr);
            });

        document.getElementById('unknownRefsModal').style.display = 'flex';
    },

    /**
     * Carrega os dados do dashboard do backend
     */
    async loadDashboard() {
        try {
            const reportType = document.getElementById('dashReportType').value;
            const month = document.getElementById('dashMonthFilter')?.value || "";

            const brand = document.getElementById('dashBrandFilter')?.value || "";
            const customer = document.getElementById('dashCustomerFilter')?.value || "";
            const group = document.getElementById('dashGroupFilter')?.value || "";
            const subGroup = document.getElementById('dashSubGroupFilter')?.value || "";

            // Precisamos descobrir o diretório de destino a partir das configurações
            const config = await window.electronAPI.getConfig();
            const destinationDir = config.reportsDir || 'relatorios';

            Utils.log(`[Dashboard] Carregando dados de ${reportType} (Mês: ${month || 'Todos'})...`);

            const options = {};
            if (month) options.month = month;
            if (brand) options.brand = brand;
            if (customer) options.customer = customer;
            if (group) options.group = group;
            if (subGroup) options.subGroup = subGroup;

            const data = await window.electronAPI.getDashboardData(reportType, destinationDir, options);
            this.currentData = data;

            if (!data) {
                const msg = reportType === 'PEDIDO' ? 'Arquivo Master não encontrado. Execute a automação.' : 'Sem dados';
                this.showEmptyState(msg);
                return;
            }

            Utils.log(`[Dashboard] Dados carregados com sucesso de: ${data.sourceFile}`);

            // Atualiza o seletor de meses
            this.updateMonthFilter(data.availableMonths, month);

            // Atualiza comboboxes (Marcas, Clientes, Grupos, Sub-Grupos)
            this.updateDynamicFilter('dashBrandFilter', data.availableFilters?.brands, 'Todas as Marcas', brand);
            this.updateDynamicFilter('dashCustomerFilter', data.availableFilters?.customers, 'Todos os Clientes', customer);
            this.updateDynamicFilter('dashGroupFilter', data.availableFilters?.groups, 'Todos os Grupos', group);
            this.updateDynamicFilter('dashSubGroupFilter', data.availableFilters?.subGroups, 'Todos os Sub-Grupos', subGroup);

            this.initComboboxesOnce();
            this.updateFilterPills();

            // [NEW] Botão de Erros/Refs Desconhecidas
            const btnUnknown = document.getElementById('btnUnknownRefs');
            if (btnUnknown) {
                if (data.unknownRefs && data.unknownRefs.length > 0) {
                    btnUnknown.style.display = 'flex';
                    document.getElementById('btnUnknownRefsCount').textContent = data.unknownRefs.length;
                } else {
                    btnUnknown.style.display = 'none';
                }
            }

            this.updateSummary(data.summary);
            this.renderCharts(data.charts, data.mappingUsed.category);
        } catch (error) {
            Utils.log(`[Dashboard] Erro: ${error.message}`, 'error');
        }
    },

    updateMonthFilter(months, selected) {
        const select = document.getElementById('dashMonthFilter');
        if (!select) return;

        // Preserva a seleção se possível, mas reconstrói as opções se o número mudar ou for a primeira vez
        const currentOptions = Array.from(select.options).map(o => o.value);
        const newOptions = ["", ...months];

        if (JSON.stringify(currentOptions) !== JSON.stringify(newOptions)) {
            const oldValue = selected || select.value;
            select.innerHTML = '<option value="">Todos os Meses</option>';
            months.forEach(m => {
                const opt = document.createElement('option');
                opt.value = m;
                // Formata YYYY-MM para Mês/Ano amigável
                const [y, mm] = m.split('-');
                const monthNames = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
                opt.textContent = `${monthNames[parseInt(mm) - 1]} / ${y}`;
                select.appendChild(opt);
            });
            if (newOptions.includes(oldValue)) select.value = oldValue;
        }
    },

    updateDynamicFilter(elementId, items, defaultText, selectedValue) {
        const hidden = document.getElementById(elementId);
        if (!hidden) return;
        const container = hidden.closest('.dash-combobox');
        if (!container) return;
        const listEl = container.querySelector('.dash-combobox-list');
        const displayEl = document.getElementById(elementId + 'Display');
        if (!listEl || !displayEl) return;

        const relevantItems = items || [];
        const current = selectedValue != null ? selectedValue : (hidden.value || '');

        listEl.innerHTML = '';
        listEl.dataset.defaultText = defaultText;

        const addOption = (value, label) => {
            const opt = document.createElement('div');
            opt.className = 'dash-combobox-option';
            opt.dataset.value = value;
            opt.textContent = label;
            if (value === current) opt.classList.add('selected');
            listEl.appendChild(opt);
        };

        addOption('', defaultText);
        relevantItems.forEach(item => addOption(item, item));

        const valid = current === '' || relevantItems.includes(current);
        hidden.value = valid ? current : '';
        displayEl.value = valid && current ? current : '';
        displayEl.placeholder = defaultText;
    },

    _comboboxInited: false,
    initComboboxesOnce() {
        if (this._comboboxInited) return;
        this._comboboxInited = true;

        document.querySelectorAll('.dash-combobox').forEach(box => {
            const display = box.querySelector('.dash-combobox-input');
            const hidden = box.querySelector('input[type="hidden"]');
            const dropdown = box.querySelector('.dash-combobox-dropdown');
            const search = box.querySelector('.dash-combobox-search');
            const list = box.querySelector('.dash-combobox-list');

            const open = () => {
                document.querySelectorAll('.dash-combobox.open').forEach(b => b !== box && b.classList.remove('open'));
                box.classList.add('open');
                search.value = '';
                filterList('');
                search.focus();
            };
            const close = () => box.classList.remove('open');
            const filterList = (term) => {
                const t = term.toLowerCase();
                const defaultText = list.dataset.defaultText || '';
                list.querySelectorAll('.dash-combobox-option').forEach(opt => {
                    const val = opt.dataset.value;
                    const label = val === '' ? defaultText : opt.textContent;
                    const show = !t || label.toLowerCase().includes(t);
                    opt.style.display = show ? '' : 'none';
                });
            };

            display.addEventListener('click', open);
            search.addEventListener('input', (e) => filterList(e.target.value));
            search.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') { close(); display.focus(); }
            });
            list.addEventListener('click', (e) => {
                const opt = e.target.closest('.dash-combobox-option');
                if (!opt) return;
                const value = opt.dataset.value;
                const label = value === '' ? list.dataset.defaultText : opt.textContent;
                hidden.value = value;
                display.value = value ? label : '';
                display.placeholder = list.dataset.defaultText || '';
                list.querySelectorAll('.dash-combobox-option').forEach(o => o.classList.remove('selected'));
                opt.classList.add('selected');
                close();
                this.loadDashboard();
            });
        });

        document.addEventListener('click', (e) => {
            if (e.target.closest('.dash-combobox')) return;
            document.querySelectorAll('.dash-combobox.open').forEach(b => b.classList.remove('open'));
        });
    },

    updateFilterPills() {
        const container = document.getElementById('dashboard-filter-pills');
        if (!container) return;

        const monthSelect = document.getElementById('dashMonthFilter');
        const monthVal = monthSelect?.value || '';
        const monthLabel = monthVal ? (monthSelect?.options[monthSelect.selectedIndex]?.textContent || monthVal) : '';

        const filters = [
            { key: 'month', label: 'Mês', value: monthVal, display: monthLabel },
            { key: 'brand', label: 'Marca', value: (document.getElementById('dashBrandFilter')?.value || '').trim(), display: null },
            { key: 'customer', label: 'Cliente', value: (document.getElementById('dashCustomerFilter')?.value || '').trim(), display: null },
            { key: 'group', label: 'Grupo', value: (document.getElementById('dashGroupFilter')?.value || '').trim(), display: null },
            { key: 'subGroup', label: 'Sub-Grupo', value: (document.getElementById('dashSubGroupFilter')?.value || '').trim(), display: null }
        ];
        filters.forEach(f => { if (f.display === null) f.display = f.value; });

        container.innerHTML = '';
        filters.forEach(({ key, label, value, display }) => {
            if (!value) return;
            const pill = document.createElement('span');
            pill.className = 'dashboard-filter-pill';
            pill.innerHTML = `${label}: ${display}<button type="button" class="pill-clear" aria-label="Remover filtro">×</button>`;
            const clearBtn = pill.querySelector('.pill-clear');
            clearBtn.addEventListener('click', () => {
                if (key === 'month' && monthSelect) {
                    monthSelect.value = '';
                } else {
                    const id = { brand: 'dashBrandFilter', customer: 'dashCustomerFilter', group: 'dashGroupFilter', subGroup: 'dashSubGroupFilter' }[key];
                    const hid = document.getElementById(id);
                    const disp = document.getElementById(id + 'Display');
                    if (hid) hid.value = '';
                    if (disp) { disp.value = ''; disp.placeholder = disp.placeholder || ''; }
                }
                this.loadDashboard();
            });
            container.appendChild(pill);
        });
    },


    updateSummary(summary) {
        document.getElementById('dashTotalValue').textContent = Utils.formatCurrency(summary.totalValue);
        document.getElementById('dashTotalRecords').textContent = summary.totalRecords;
        document.getElementById('dashLastUpdate').textContent = new Date(summary.lastUpdate).toLocaleString();

        // Atualiza Cards de Crescimento
        const valGrowth = summary.valueGrowth || 0;
        const recGrowth = summary.recordGrowth || 0;

        const updateGrowthCard = (idPrefix, val) => {
            const elVal = document.getElementById(`${idPrefix}GrowthValue`);
            const elIcon = document.getElementById(`${idPrefix}GrowthIcon`);
            if (elVal && elIcon) {
                const signal = val >= 0 ? '+' : '';
                elVal.textContent = `${signal}${val.toFixed(1)}%`;
                // Remove classes antigas
                elVal.classList.remove('growth-positive', 'growth-negative');
                elIcon.classList.remove('positive', 'negative');

                // Adiciona novas
                elVal.classList.add(val >= 0 ? 'growth-positive' : 'growth-negative');
                elIcon.textContent = val >= 0 ? '▲' : '▼';
                elIcon.classList.add(val >= 0 ? 'positive' : 'negative');
            }
        };

        updateGrowthCard('dashValue', valGrowth);
        updateGrowthCard('dashRecord', recGrowth);
    },

    showEmptyState(msg = 'Sem dados') {
        document.getElementById('dashTotalValue').textContent = 'R$ 0,00';
        document.getElementById('dashTotalRecords').textContent = '0';
        document.getElementById('dashLastUpdate').textContent = msg;

        // Destrói gráficos se existirem
        Object.keys(this.charts).forEach(key => {
            if (this.charts[key]) {
                this.charts[key].destroy();
                this.charts[key] = null;
            }
        });
    },

    renderCharts(chartsData, categoryLabel) {
        const catLabel = categoryLabel || 'Categoria';
        this.renderLineChart('chartDate', chartsData.byDate || [], 'Evolução de Volume');
        this.renderBarChart('chartGroup', chartsData.byGroup || [], 'Volume por Grupo', 'rgba(54, 162, 235, 0.7)', 'group');
        this.renderHorizontalBarChart('chartCategory', chartsData.byCategory || [], `Top Categorias (${catLabel})`);
        this.renderBarChart('chartBrand', chartsData.byBrand || [], 'Volume por Marca', 'rgba(153, 102, 255, 0.7)', 'brand');
        this.renderBarChart('chartUF', chartsData.byUF || [], 'Volume por UF', 'rgba(255, 159, 64, 0.7)', 'uf');
        this.renderBarChart('chartAssociado', chartsData.byAssociado || [], 'Volume por Associado', 'rgba(75, 192, 192, 0.7)', 'associado');
    },

    renderLineChart(canvasId, data, label) {
        const el = document.getElementById(canvasId);
        if (!el) return;
        if (this.charts.date) this.charts.date.destroy();
        const ctx = el.getContext('2d');
        this.charts.date = new Chart(ctx, {
            type: 'line',
            data: {
                labels: data.map(d => d.label),
                datasets: [{
                    label: label,
                    data: data.map(d => d.value),
                    borderColor: '#3498db',
                    backgroundColor: 'rgba(52, 152, 219, 0.1)',
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } }
            }
        });
    },

    renderBarChart(canvasId, data, label, color, chartKey) {
        const el = document.getElementById(canvasId);
        if (!el) return;
        const key = chartKey || 'group';
        if (this.charts[key]) this.charts[key].destroy();
        const ctx = el.getContext('2d');
        this.charts[key] = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: data.map(d => d.label),
                datasets: [{
                    label: label,
                    data: data.map(d => d.value),
                    backgroundColor: color,
                    borderRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } }
            }
        });
    },

    renderHorizontalBarChart(canvasId, data, label) {
        const el = document.getElementById(canvasId);
        if (!el) return;
        if (this.charts.category) this.charts.category.destroy();
        const ctx = el.getContext('2d');
        this.charts.category = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: data.map(d => d.label),
                datasets: [{
                    label: label,
                    data: data.map(d => d.value),
                    backgroundColor: 'rgba(75, 192, 192, 0.7)',
                    borderRadius: 6
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } }
            }
        });
    },

    /**
     * Save a single catalog item (inline editing)
     */
    async saveCatalogItem(safeId) {
        // Get the original reference from data attribute
        const brandInput = document.getElementById(`brand_${safeId}`);
        const ref = brandInput?.getAttribute('data-ref');

        if (!ref) {
            alert('❌ Erro: Referência não encontrada.');
            return;
        }

        const brand = brandInput?.value.trim();
        const group = document.getElementById(`group_${safeId}`)?.value.trim();
        const subGroup = document.getElementById(`subgroup_${safeId}`)?.value.trim();

        if (!brand && !group && !subGroup) {
            alert('Por favor, preencha pelo menos um campo (Marca, Grupo ou Sub-Grupo).');
            return;
        }

        try {
            const result = await window.electronAPI.updateCatalogItem(ref, { brand, group, subGroup });

            if (result.success) {
                alert(`✅ Produto "${ref}" atualizado com sucesso!`);
                // Remove from unknown list
                this.currentData.unknownRefs = this.currentData.unknownRefs.filter(item => item.ref !== ref);
                this.openUnknownRefsModal(); // Refresh modal

                // Suggest reload
                if (confirm('Deseja recarregar o painel para refletir as mudanças?')) {
                    this.loadDashboard();
                }
            } else {
                alert(`❌ Erro ao salvar: ${result.error}`);
            }
        } catch (error) {
            alert(`❌ Erro ao salvar: ${error.message}`);
        }
    },

    /**
     * Export unknown refs to Excel
     */
    async exportUnknownRefsToExcel() {
        if (!this.currentData || !this.currentData.unknownRefs || this.currentData.unknownRefs.length === 0) {
            alert('Não há produtos não identificados para exportar.');
            return;
        }

        try {
            // Prepare data for Excel
            const data = [
                ['Referência', 'Quantidade', 'Marca', 'Grupo', 'Sub-Grupo'],
                ...this.currentData.unknownRefs.map(item => [item.ref, item.count, '', '', ''])
            ];

            // Create worksheet
            const ws = XLSX.utils.aoa_to_sheet(data);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Produtos Não Identificados');

            // Download
            XLSX.writeFile(wb, `produtos_nao_identificados_${new Date().toISOString().split('T')[0]}.xlsx`);

            alert('✅ Arquivo Excel exportado com sucesso! Preencha as colunas Marca/Grupo/Sub-Grupo e importe de volta.');
        } catch (error) {
            alert(`❌ Erro ao exportar: ${error.message}`);
        }
    },

    /**
     * Trigger file input for Excel import
     */
    importUnknownRefsFromExcel() {
        document.getElementById('unknownRefsFileInput').click();
    },

    /**
     * Handle Excel import
     */
    async handleExcelImport(event) {
        const file = event.target.files[0];
        if (!file) return;

        try {
            const reader = new FileReader();
            reader.onload = async (e) => {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

                // Skip header row
                const items = jsonData.slice(1).map(row => ({
                    ref: row[0],
                    brand: row[2],
                    group: row[3],
                    subGroup: row[4]
                })).filter(item => item.ref && (item.brand || item.group || item.subGroup));

                if (items.length === 0) {
                    alert('❌ Nenhum item válido encontrado no arquivo.');
                    return;
                }

                const result = await window.electronAPI.batchUpdateCatalog(items);

                if (result.success) {
                    alert(`✅ ${result.updated} produtos atualizados com sucesso!`);

                    // Remove updated items from unknown list
                    const updatedRefs = new Set(items.map(i => i.ref));
                    this.currentData.unknownRefs = this.currentData.unknownRefs.filter(
                        item => !updatedRefs.has(item.ref)
                    );

                    this.openUnknownRefsModal(); // Refresh modal

                    if (confirm('Deseja recarregar o painel para refletir as mudanças?')) {
                        this.loadDashboard();
                    }
                } else {
                    alert(`❌ Erro ao importar: ${result.error}`);
                }
            };
            reader.readAsArrayBuffer(file);
        } catch (error) {
            alert(`❌ Erro ao processar arquivo: ${error.message}`);
        } finally {
            // Reset file input
            event.target.value = '';
        }
    }
};
