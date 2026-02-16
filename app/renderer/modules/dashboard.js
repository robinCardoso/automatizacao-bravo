// dashboard.js - Módulo de Dashboard e Visualização de Dados
import { Utils } from './utils.js';

export const Dashboard = {
    charts: {
        date: null,
        group: null,
        category: null
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
                tr.innerHTML = `
                    <td style="padding: 8px; border-bottom: 1px solid #eee;">${item.ref}</td>
                    <td style="padding: 8px; text-align: center; border-bottom: 1px solid #eee;">${item.count}</td>
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

            // Precisamos descobrir o diretório de destino a partir das configurações
            const config = await window.electronAPI.getConfig();
            const destinationDir = config.reportsDir || 'relatorios';

            Utils.log(`[Dashboard] Carregando dados de ${reportType} (Mês: ${month || 'Todos'})...`);

            const options = {};
            if (month) options.month = month;
            if (brand) options.brand = brand;
            if (customer) options.customer = customer;
            if (group) options.group = group;

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

            // Atualiza novos filtros dinâmicos
            this.updateDynamicFilter('dashBrandFilter', data.availableFilters?.brands, 'Todas as Marcas', brand);
            this.updateDynamicFilter('dashCustomerFilter', data.availableFilters?.customers, 'Todos os Clientes', customer);
            this.updateDynamicFilter('dashGroupFilter', data.availableFilters?.groups, 'Todos os Grupos', group);

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
        const select = document.getElementById(elementId);
        if (!select) return;

        const relevantItems = items || [];
        const oldValue = selectedValue || select.value;

        // Reconstrói sempre para garantir consistência
        select.innerHTML = `<option value="">${defaultText}</option>`;

        relevantItems.forEach(item => {
            const opt = document.createElement('option');
            opt.value = item;
            opt.textContent = item;
            select.appendChild(opt);
        });

        if (relevantItems.includes(oldValue)) {
            select.value = oldValue;
        } else {
            select.value = "";
        }
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
        this.renderLineChart('chartDate', chartsData.byDate, 'Evolução de Volume');
        this.renderBarChart('chartGroup', chartsData.byGroup, 'Volume por Grupo', 'rgba(54, 162, 235, 0.7)');
        this.renderHorizontalBarChart('chartCategory', chartsData.byCategory, `Top Categorias (${categoryLabel})`);
    },

    renderLineChart(canvasId, data, label) {
        const ctx = document.getElementById(canvasId).getContext('2d');
        if (this.charts.date) this.charts.date.destroy();

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

    renderBarChart(canvasId, data, label, color) {
        const ctx = document.getElementById(canvasId).getContext('2d');
        if (this.charts.group) this.charts.group.destroy();

        this.charts.group = new Chart(ctx, {
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
        const ctx = document.getElementById(canvasId).getContext('2d');
        if (this.charts.category) this.charts.category.destroy();

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
    }
};
