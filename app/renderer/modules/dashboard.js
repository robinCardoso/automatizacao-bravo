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
    _loadDebounceTimer: null,
    _loadSeq: 0,
    _defaultYearApplied: false,
    _baseDataByType: {},
    _localResultCache: new Map(),

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
            this.scheduleLoadDashboard();
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

        this.scheduleLoadDashboard();
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
    scheduleLoadDashboard(delay = 350) {
        if (this._loadDebounceTimer) clearTimeout(this._loadDebounceTimer);
        this._loadDebounceTimer = setTimeout(() => this.loadDashboard(), delay);
    },

    async loadDashboard(forceBaseReload = false) {
        const loadingOverlay = document.getElementById('dashLoadingOverlay');
        const requestSeq = ++this._loadSeq;
        try {
            const reportType = document.getElementById('dashReportType').value;
            const yearEl = document.getElementById('dashYearFilter');
            let year = yearEl?.value || "";
            const month = document.getElementById('dashMonthFilter')?.value || "";
            const config = await window.electronAPI.getConfig();
            const dashboardYearMode = config.dashboardDefaultYearMode || 'current';

            // Primeira carga: por configuracao, inicia no ano atual (rapido) ou em todos.
            if (!year && !this._defaultYearApplied && dashboardYearMode === 'current') {
                year = String(new Date().getFullYear());
                this._defaultYearApplied = true;
            }

            const brand = document.getElementById('dashBrandFilter')?.value || "";
            const customer = document.getElementById('dashCustomerFilter')?.value || "";
            const group = document.getElementById('dashGroupFilter')?.value || "";
            const subGroup = document.getElementById('dashSubGroupFilter')?.value || "";
            const filters = { year, month, brand, customer, group, subGroup };

            // Precisamos descobrir o diretório de destino a partir das configurações
            const destinationDir = config.reportsDir || 'relatorios';
            const hasBase = !!this._baseDataByType[reportType];
            const canUseLocal = hasBase && !forceBaseReload;
            let data;

            if (canUseLocal) {
                data = this.applyLocalFilters(reportType, filters);
                if (requestSeq !== this._loadSeq) return;
                this.currentData = data;
            } else {
                if (loadingOverlay) loadingOverlay.style.display = 'flex';
                // Permite que o DOM seja atualizado com o loading antes do backend pesado
                await new Promise(resolve => setTimeout(resolve, 50));
                Utils.log(`[Dashboard] Carregando dados-base de ${reportType} (Ano: ${year || 'Todos'}, Mês: ${month || 'Todos'})...`);
                const options = { __includeBase: true };
                const base = await window.electronAPI.getDashboardData(reportType, destinationDir, options);
                if (requestSeq !== this._loadSeq) return;
                if (base?.baseRows?.length) {
                    this._baseDataByType[reportType] = {
                        rows: base.baseRows,
                        mappingUsed: base.mappingUsed || {},
                        sourceFile: base.sourceFile || '',
                        unknownRefs: base.unknownRefs || [],
                        lastUpdate: base.summary?.lastUpdate || new Date().toISOString()
                    };
                    this._localResultCache.clear();
                    data = this.applyLocalFilters(reportType, filters);
                } else {
                    data = base;
                }
                this.currentData = data;
            }

            if (!data) {
                const msg = reportType === 'PEDIDO' ? 'Arquivo Master não encontrado. Execute a automação.' : 'Sem dados';
                this.showEmptyState(msg);
                return;
            }

            Utils.log(`[Dashboard] Dados carregados com sucesso de: ${data.sourceFile || this._baseDataByType[reportType]?.sourceFile || '-'}`);
            if (data.indexRebuilt) {
                Utils.log('[Dashboard] Reindexacao concluida. As proximas cargas ficarao mais rapidas.');
                Utils.showNotification('Indice do dashboard atualizado. Proximas consultas mais rapidas.', 'info');
            }

            // Atualiza o seletor de Anos e Meses
            this.updateYearFilter(data.availableMonths, year);
            this.updateMonthFilter(data.availableMonths, month, year);

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
        } finally {
            if (loadingOverlay) loadingOverlay.style.display = 'none';
        }
    },

    applyLocalFilters(reportType, filters) {
        const base = this._baseDataByType[reportType];
        if (!base || !Array.isArray(base.rows)) return null;

        const cacheKey = `${reportType}:${JSON.stringify(filters || {})}`;
        if (this._localResultCache.has(cacheKey)) {
            return this._localResultCache.get(cacheKey);
        }

        const rows = base.rows;
        const monthsSet = new Set();
        const brandsSet = new Set();
        const customersSet = new Set();
        const groupsSet = new Set();
        const subGroupsSet = new Set();

        const dateMap = new Map();
        const groupMap = new Map();
        const categoryMap = new Map();
        const brandMap = new Map();
        const ufMap = new Map();
        const associadoMap = new Map();
        const monthlyTotals = new Map();

        const selectedYear = filters?.year || '';
        const selectedMonth = filters?.month || '';

        for (const row of rows) {
            const rowMonth = row.month || '';
            if (rowMonth) monthsSet.add(rowMonth);
            if (row.brand) brandsSet.add(String(row.brand));
            if (row.customer) customersSet.add(String(row.customer));
            if (row.group) groupsSet.add(String(row.group));
            if (row.subGroup) subGroupsSet.add(String(row.subGroup));

            if (filters?.brand && String(row.brand) !== String(filters.brand)) continue;
            if (filters?.customer && String(row.customer) !== String(filters.customer)) continue;
            if (filters?.group && String(row.group) !== String(filters.group)) continue;
            if (filters?.subGroup && String(row.subGroup) !== String(filters.subGroup)) continue;

            if (rowMonth) {
                if (!monthlyTotals.has(rowMonth)) monthlyTotals.set(rowMonth, { value: 0, records: 0 });
                const m = monthlyTotals.get(rowMonth);
                m.value += Number(row.value) || 0;
                m.records += 1;
            }

            const isCurrentMonth = selectedMonth && rowMonth === selectedMonth;
            const isCurrentYear = selectedYear && rowMonth?.startsWith(selectedYear + '-');
            const isTarget = selectedMonth ? isCurrentMonth : (selectedYear ? isCurrentYear : true);
            if (!isTarget) continue;

            const val = Number(row.value) || 0;
            if (rowMonth) dateMap.set(rowMonth, (dateMap.get(rowMonth) || 0) + val);
            if (row.group) groupMap.set(row.group, (groupMap.get(row.group) || 0) + val);
            if (row.category) categoryMap.set(row.category, (categoryMap.get(row.category) || 0) + val);
            if (row.brand) brandMap.set(row.brand, (brandMap.get(row.brand) || 0) + val);
            if (row.uf) ufMap.set(row.uf, (ufMap.get(row.uf) || 0) + val);
            if (row.associado) associadoMap.set(row.associado, (associadoMap.get(row.associado) || 0) + val);
        }

        let currentPeriodVal = 0;
        let prevPeriodVal = 0;
        let currentPeriodRec = 0;
        let prevPeriodRec = 0;

        if (selectedMonth) {
            const [y, m] = selectedMonth.split('-').map(Number);
            const d = new Date(y, m - 2, 1);
            const prevMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            const cur = monthlyTotals.get(selectedMonth);
            const prev = monthlyTotals.get(prevMonth);
            currentPeriodVal = cur?.value || 0;
            currentPeriodRec = cur?.records || 0;
            prevPeriodVal = prev?.value || 0;
            prevPeriodRec = prev?.records || 0;
        } else if (selectedYear) {
            const y = parseInt(selectedYear, 10);
            const py = y - 1;
            monthlyTotals.forEach((v, k) => {
                const yr = parseInt(String(k).split('-')[0], 10);
                if (yr === y) {
                    currentPeriodVal += v.value;
                    currentPeriodRec += v.records;
                } else if (yr === py) {
                    prevPeriodVal += v.value;
                    prevPeriodRec += v.records;
                }
            });
        } else {
            const sortedMonths = Array.from(monthlyTotals.keys()).sort();
            if (sortedMonths.length >= 2) {
                const lastMonth = sortedMonths[sortedMonths.length - 1];
                const penultMonth = sortedMonths[sortedMonths.length - 2];
                currentPeriodVal = monthlyTotals.get(lastMonth)?.value || 0;
                currentPeriodRec = monthlyTotals.get(lastMonth)?.records || 0;
                prevPeriodVal = monthlyTotals.get(penultMonth)?.value || 0;
                prevPeriodRec = monthlyTotals.get(penultMonth)?.records || 0;
            }
        }

        const byValueDesc = (a, b) => b.value - a.value;
        const totalValue = Array.from(dateMap.values()).reduce((acc, n) => acc + n, 0);
        const totalRecords = Array.from(monthlyTotals.entries()).reduce((acc, [month, v]) => {
            const inTarget = selectedMonth ? month === selectedMonth : (selectedYear ? String(month).startsWith(selectedYear + '-') : true);
            return acc + (inTarget ? v.records : 0);
        }, 0);

        const result = {
            type: reportType,
            summary: {
                totalValue,
                totalRecords,
                lastUpdate: base.lastUpdate || new Date().toISOString(),
                valueGrowth: prevPeriodVal > 0 ? ((currentPeriodVal - prevPeriodVal) / prevPeriodVal) * 100 : 0,
                recordGrowth: prevPeriodRec > 0 ? ((currentPeriodRec - prevPeriodRec) / prevPeriodRec) * 100 : 0
            },
            charts: {
                byDate: Array.from(dateMap.entries()).map(([label, value]) => ({ label, value })).sort((a, b) => a.label.localeCompare(b.label)),
                byGroup: Array.from(groupMap.entries()).map(([label, value]) => ({ label, value })).sort(byValueDesc),
                byCategory: Array.from(categoryMap.entries()).map(([label, value]) => ({ label, value })).sort(byValueDesc).slice(0, 15),
                byBrand: Array.from(brandMap.entries()).map(([label, value]) => ({ label, value })).sort(byValueDesc).slice(0, 20),
                byUF: Array.from(ufMap.entries()).map(([label, value]) => ({ label, value })).sort(byValueDesc).slice(0, 20),
                byAssociado: Array.from(associadoMap.entries()).map(([label, value]) => ({ label, value })).sort(byValueDesc).slice(0, 20)
            },
            availableMonths: Array.from(monthsSet).sort().reverse(),
            availableFilters: {
                brands: Array.from(brandsSet).sort(),
                customers: Array.from(customersSet).sort(),
                groups: Array.from(groupsSet).sort(),
                subGroups: Array.from(subGroupsSet).sort()
            },
            mappingUsed: base.mappingUsed || {},
            sourceFile: base.sourceFile || '',
            unknownRefs: base.unknownRefs || []
        };

        this._localResultCache.set(cacheKey, result);
        if (this._localResultCache.size > 100) {
            const firstKey = this._localResultCache.keys().next().value;
            if (firstKey) this._localResultCache.delete(firstKey);
        }
        return result;
    },

    updateYearFilter(availableMonths, selectedYear) {
        const select = document.getElementById('dashYearFilter');
        if (!select) return;

        const years = [...new Set(availableMonths.map(m => m.split('-')[0]))].sort().reverse();
        const currentOptions = Array.from(select.options).map(o => o.value);
        const newOptions = ["", ...years];

        if (JSON.stringify(currentOptions) !== JSON.stringify(newOptions)) {
            const oldValue = selectedYear || select.value;
            select.innerHTML = '<option value="">Todos os Anos</option>';
            years.forEach(y => {
                const opt = document.createElement('option');
                opt.value = y;
                opt.textContent = y;
                select.appendChild(opt);
            });
            if (newOptions.includes(oldValue)) select.value = oldValue;
        }
    },

    updateMonthFilter(availableMonths, selectedMonth, selectedYear) {
        const select = document.getElementById('dashMonthFilter');
        if (!select) return;

        // Filtra os meses disponíveis com base no ano selecionado
        let filteredMonths = availableMonths;
        if (selectedYear) {
            filteredMonths = availableMonths.filter(m => m.startsWith(selectedYear + '-'));
        }

        // Mapeia para apenas o número do mês "MM" ou mantém "YYYY-MM" dependendo da preferência?
        // Vamos manter YYYY-MM como valor mas mostrar apenas o nome do mês se o ano estiver selecionado
        const currentOptions = Array.from(select.options).map(o => o.value);
        const newOptions = ["", ...filteredMonths];

        if (JSON.stringify(currentOptions) !== JSON.stringify(newOptions)) {
            const oldValue = selectedMonth || select.value;
            select.innerHTML = '<option value="">Todos os Meses</option>';

            filteredMonths.forEach(m => {
                const opt = document.createElement('option');
                opt.value = m;
                const [y, mm] = m.split('-');
                const monthNames = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
                // Se o ano estiver selecionado, mostra apenas o mês. Se não, mostra Mês/Ano.
                opt.textContent = selectedYear ? monthNames[parseInt(mm) - 1] : `${monthNames[parseInt(mm) - 1].substring(0, 3)} / ${y}`;
                select.appendChild(opt);
            });

            if (newOptions.includes(oldValue)) select.value = oldValue;
            else select.value = ""; // Reseta mês se não existir mais no ano novo
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
                this.scheduleLoadDashboard();
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

        const yearSelect = document.getElementById('dashYearFilter');
        const yearVal = yearSelect?.value || '';

        const monthSelect = document.getElementById('dashMonthFilter');
        const monthVal = monthSelect?.value || '';
        const monthLabel = monthVal ? (monthSelect?.options[monthSelect.selectedIndex]?.textContent || monthVal) : '';

        const filters = [
            { key: 'year', label: 'Ano', value: yearVal, display: yearVal },
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
                if (key === 'year' && yearSelect) {
                    yearSelect.value = '';
                } else if (key === 'month' && monthSelect) {
                    monthSelect.value = '';
                } else {
                    const id = { brand: 'dashBrandFilter', customer: 'dashCustomerFilter', group: 'dashGroupFilter', subGroup: 'dashSubGroupFilter' }[key];
                    const hid = document.getElementById(id);
                    const disp = document.getElementById(id + 'Display');
                    if (hid) hid.value = '';
                    if (disp) {
                        disp.value = '';
                        disp.placeholder = disp.getAttribute('data-placeholder') || 'Buscar...';
                    }
                }
                this.scheduleLoadDashboard();
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
        const tbody = document.getElementById('chartAssociadoTableBody');
        if (tbody) tbody.innerHTML = '';
        const searchInput = document.getElementById('clientTableSearch');
        if (searchInput) searchInput.value = '';
    },

    renderCharts(chartsData, categoryLabel) {
        const catLabel = categoryLabel || 'Categoria';
        
        // Configuração global de fontes para o Chart.js
        Chart.defaults.font.family = "'Inter', 'Segoe UI', sans-serif";
        Chart.defaults.color = '#64748b';
        Chart.defaults.plugins.tooltip.backgroundColor = 'rgba(15, 23, 42, 0.9)';
        Chart.defaults.plugins.tooltip.padding = 12;
        Chart.defaults.plugins.tooltip.cornerRadius = 8;
        Chart.defaults.plugins.tooltip.titleFont = { size: 13, weight: 'bold' };
        Chart.defaults.plugins.tooltip.bodyFont = { size: 12 };

        this.renderLineChart('chartDate', chartsData.byDate || [], 'Evolução de Volume');
        this.renderBarChart('chartGroup', chartsData.byGroup || [], 'Volume por Grupo', ['#3b82f6', '#2563eb'], 'group', { indexAxis: 'y', wrapperId: 'chartGroupWrap', visibleBars: 4 });
        this.renderHorizontalBarChart('chartCategory', chartsData.byCategory || [], `Top Categorias (${catLabel})`);
        this.renderBarChart('chartBrand', chartsData.byBrand || [], 'Volume por Marca', ['#8b5cf6', '#6d28d9'], 'brand');
        this.renderBarChart('chartUF', chartsData.byUF || [], 'Volume por UF', ['#f59e0b', '#d97706'], 'uf', { indexAxis: 'y', wrapperId: 'chartUFWrap', visibleBars: 4 });
        this.renderClientChartAndTable(chartsData.byAssociado || []);
    },

    _createGradient(ctx, colors, vertical = true) {
        const chartArea = ctx.canvas.getBoundingClientRect();
        const gradient = ctx.createLinearGradient(0, 0, vertical ? 0 : chartArea.width, vertical ? chartArea.height : 0);
        gradient.addColorStop(0, colors[0]);
        gradient.addColorStop(1, colors[1]);
        return gradient;
    },

    renderLineChart(canvasId, data, label) {
        const el = document.getElementById(canvasId);
        if (!el) return;
        if (this.charts.date) this.charts.date.destroy();
        const ctx = el.getContext('2d');
        
        const gradient = ctx.createLinearGradient(0, 0, 0, 400);
        gradient.addColorStop(0, 'rgba(59, 130, 246, 0.5)');
        gradient.addColorStop(1, 'rgba(59, 130, 246, 0.0)');

        this.charts.date = new Chart(ctx, {
            type: 'line',
            data: {
                labels: data.map(d => d.label),
                datasets: [{
                    label: label,
                    data: data.map(d => d.value),
                    borderColor: '#3b82f6',
                    borderWidth: 3,
                    pointBackgroundColor: '#ffffff',
                    pointBorderColor: '#3b82f6',
                    pointBorderWidth: 2,
                    pointRadius: 4,
                    pointHoverRadius: 6,
                    backgroundColor: gradient,
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (context) => this.formatVolume(context.raw)
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: { font: { size: 10, weight: '500' } }
                    },
                    y: {
                        border: { dash: [4, 4] },
                        grid: { color: 'rgba(226, 232, 240, 0.8)' },
                        ticks: {
                            font: { size: 10 },
                            callback: (value) => 'R$ ' + value.toLocaleString('pt-BR', { notation: 'compact' })
                        }
                    }
                }
            }
        });
    },

    renderBarChart(canvasId, data, label, colors, chartKey, opts = {}) {
        const el = document.getElementById(canvasId);
        if (!el) return;
        const key = chartKey || 'group';
        if (this.charts[key]) this.charts[key].destroy();
        const horizontal = opts.indexAxis === 'y';
        const barHeightPx = 32;
        const visibleBars = opts.visibleBars != null ? opts.visibleBars : 0;
        const wrapId = opts.wrapperId;

        if (horizontal && wrapId && visibleBars > 0) {
            const wrap = document.getElementById(wrapId);
            const minHeight = 150;
            const chartHeight = data.length > 0 ? Math.max(minHeight, data.length * barHeightPx + 60) : minHeight;
            if (wrap) wrap.style.height = `${chartHeight}px`;
        }

        const ctx = el.getContext('2d');
        const gradient = ctx.createLinearGradient(0, 0, horizontal ? 400 : 0, horizontal ? 0 : 400);
        gradient.addColorStop(0, colors[0]);
        gradient.addColorStop(1, colors[1]);

        this.charts[key] = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: data.map(d => d.label),
                datasets: [{
                    label: label,
                    data: data.map(d => d.value),
                    backgroundColor: gradient,
                    hoverBackgroundColor: colors[1],
                    borderRadius: 8,
                    borderSkipped: false,
                    barThickness: horizontal ? 18 : 'flex',
                    maxBarThickness: 30
                }]
            },
            options: {
                indexAxis: horizontal ? 'y' : 'x',
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (context) => this.formatVolume(context.raw)
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: { font: { size: 10, weight: '500' } }
                    },
                    y: {
                        grid: { display: false },
                        ticks: { font: { size: 10 }, autoSkip: false }
                    }
                }
            }
        });
    },

    renderHorizontalBarChart(canvasId, data, label) {
        const el = document.getElementById(canvasId);
        if (!el) return;
        if (this.charts.category) this.charts.category.destroy();
        const ctx = el.getContext('2d');
        const gradient = ctx.createLinearGradient(0, 0, 400, 0);
        gradient.addColorStop(0, '#06b6d4');
        gradient.addColorStop(1, '#0891b2');

        this.charts.category = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: data.map(d => d.label),
                datasets: [{
                    label: label,
                    data: data.map(d => d.value),
                    backgroundColor: gradient,
                    borderRadius: 6,
                    barThickness: 16
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (context) => this.formatVolume(context.raw)
                        }
                    }
                },
                scales: {
                    x: { grid: { display: false }, ticks: { font: { size: 10 } } },
                    y: { grid: { display: false }, ticks: { font: { size: 10 } } }
                }
            }
        });
    },

    /** Gráfico horizontal com todas as empresas + scroll; tabela rolável com todos os clientes */
    renderClientChartAndTable(clientData) {
        const chartData = clientData.slice();
        const wrap = document.getElementById('chartAssociadoWrap');
        const el = document.getElementById('chartAssociado');
        if (this.charts.associado) this.charts.associado.destroy();
        
        // Altura dinâmica baseada na quantidade de clientes para o scroll
        const barHeightPx = 30;
        const paddingBottom = 40;
        const chartHeight = chartData.length > 0 ? (chartData.length * barHeightPx + paddingBottom) : 240;
        
        if (wrap) wrap.style.height = `${chartHeight}px`;
        
        if (el) {
            const ctx = el.getContext('2d');
            const gradient = ctx.createLinearGradient(0, 0, 400, 0);
            gradient.addColorStop(0, '#10b981');
            gradient.addColorStop(1, '#059669');

            this.charts.associado = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: chartData.map(d => d.label),
                    datasets: [{
                        label: 'Volume por Cliente',
                        data: chartData.map(d => d.value),
                        backgroundColor: gradient,
                        hoverBackgroundColor: '#059669',
                        borderRadius: 6,
                        barThickness: 18,
                        maxBarThickness: 24
                    }]
                },
                options: {
                    indexAxis: 'y',
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            callbacks: {
                                label: (context) => this.formatVolume(context.raw)
                            }
                        }
                    },
                    scales: {
                        x: { grid: { display: false }, ticks: { font: { size: 10 } } },
                        y: { grid: { display: false }, ticks: { font: { size: 10 }, autoSkip: false } }
                    }
                }
            });
        }
        this._clientTableData = clientData.slice();
        this._clientTableSort = { key: 'value', asc: false };
        this.renderClientTable(clientData);
        this.bindClientTableSearch();
        this.bindClientTableSort();
    },

    formatVolume(val) {
        if (val == null || isNaN(val)) return 'R$ 0,00';
        return 'R$ ' + Number(val).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    },

    renderClientTable(data) {
        const tbody = document.getElementById('chartAssociadoTableBody');
        if (!tbody) return;
        tbody.innerHTML = '';
        (data || []).forEach(row => {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td>${Utils.escapeHtml(String(row.label))}</td><td class="num">${this.formatVolume(row.value)}</td>`;
            tbody.appendChild(tr);
        });
    },

    bindClientTableSearch() {
        const input = document.getElementById('clientTableSearch');
        const self = this;
        if (!input) return;
        input.value = '';
        input.oninput = function () {
            const q = (this.value || '').trim().toLowerCase();
            const data = (self._clientTableData || []).filter(d => !q || String(d.label).toLowerCase().includes(q));
            self.renderClientTable(data);
        };
    },

    bindClientTableSort() {
        const table = document.getElementById('chartAssociadoTable');
        const searchInput = document.getElementById('clientTableSearch');
        const self = this;
        if (!table) return;
        table.querySelectorAll('thead th[data-sort]').forEach(th => {
            th.addEventListener('click', function () {
                const key = this.getAttribute('data-sort');
                const asc = self._clientTableSort.key === key ? !self._clientTableSort.asc : key === 'value';
                self._clientTableSort = { key, asc };
                const q = (searchInput && searchInput.value || '').trim().toLowerCase();
                let data = (self._clientTableData || []).slice();
                if (q) data = data.filter(d => String(d.label).toLowerCase().includes(q));
                data.sort((a, b) => {
                    if (key === 'value') return asc ? a.value - b.value : b.value - a.value;
                    const sa = String(a.label), sb = String(b.label);
                    return asc ? sa.localeCompare(sb) : sb.localeCompare(sa);
                });
                self.renderClientTable(data);
            });
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
                    this.scheduleLoadDashboard();
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
                        this.scheduleLoadDashboard();
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

// Listener para atualização em tempo real
if (window.electronAPI && window.electronAPI.onMasterConsolidated) {
    window.electronAPI.onMasterConsolidated((data) => {
        const reportType = document.getElementById('dashReportType')?.value;
        if (data.type === reportType) {
            // Se estiver no dashboard e o tipo for o mesmo, mostra aviso ou recarrega
            Utils.log(`[Dashboard] Novos dados de ${data.type} detectados em: ${data.file}`);
            
            // Adiciona um botão/banner temporário se o usuário estiver na aba do dashboard
            const dashboardView = document.getElementById('view-dashboard');
            if (dashboardView && dashboardView.classList.contains('active-view')) {
                const bannerId = 'dashUpdateBanner';
                if (!document.getElementById(bannerId)) {
                    const banner = document.createElement('div');
                    banner.id = bannerId;
                    banner.style = "position: absolute; top: 10px; left: 50%; transform: translateX(-50%); background: #3498db; color: white; padding: 12px 24px; border-radius: 50px; box-shadow: 0 4px 20px rgba(0,0,0,0.4); z-index: 10000; display: flex; align-items: center; gap: 15px; font-weight: 600; font-size: 13px; border: 2px solid rgba(255,255,255,0.2);";
                    banner.innerHTML = `
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <span style="font-size: 18px;">🔄</span>
                            <span>Dados atualizados disponíveis!</span>
                        </div>
                        <div style="display: flex; gap: 10px;">
                            <button class="premium-btn primary" onclick="Dashboard.loadDashboard(true); this.closest('#dashUpdateBanner').remove();" 
                                style="padding: 6px 16px; font-size: 11px; margin: 0; background: #fff; color: #3498db; border: none;">ATUALIZAR AGORA</button>
                            <button onclick="this.closest('#dashUpdateBanner').remove()" 
                                style="background: none; border: none; color: white; cursor: pointer; font-size: 20px; padding: 0 5px;">&times;</button>
                        </div>
                    `;
                    dashboardView.appendChild(banner);
                    
                    // Auto-remove após 1 minuto para não poluir
                    setTimeout(() => {
                        if (banner.parentElement) banner.remove();
                    }, 60000);
                }
            } else {
                // Se não estiver no dashboard, apenas limpa o cache local para a próxima vez que ele entrar
                Dashboard._baseDataByType[data.type] = null;
                Dashboard._localResultCache.clear();
            }
        } else {
            // Limpa o cache de outros tipos se forem atualizados
            Dashboard._baseDataByType[data.type] = null;
        }
    });
}
