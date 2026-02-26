import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';
import { automationLogger } from '../../config/logger';
import { configManager } from '../../config/config-manager';
import { buildMasterSnapshotName } from '../../policy/snapshot/FileNamingPolicy';
import { ExcelUtils } from '../utils/ExcelUtils';
import { catalogService } from '../services/CatalogService';

export interface DashboardData {
    type: string;
    summary: {
        totalValue: number;
        totalRecords: number;
        lastUpdate: string;
        valueGrowth: number; // % de crescimento vs mês anterior
        recordGrowth: number; // % de crescimento vs mês anterior
    };
    charts: {
        byDate: { label: string; value: number }[];
        byGroup: { label: string; value: number }[];
        byCategory: { label: string; value: number }[];
        byBrand: { label: string; value: number }[];
        byUF: { label: string; value: number }[];
        byAssociado: { label: string; value: number }[];
    };
    availableMonths: string[];
    availableFilters: {
        brands: string[];
        customers: string[];
        groups: string[];
        subGroups: string[];
    };
    mappingUsed: any;
    sourceFile: string;
    unknownRefs?: { ref: string; count: number }[]; // [NEW] Para relatório de erros
}

export class DashboardService {
    constructor() { }

    /**
     * Obtém os dados resumidos para o dashboard a partir do arquivo mestre
     * @param tipoReport 'VENDA' | 'PEDIDO'
     * @param destinationDir Diretório onde o master está salvo
     * @param options Filtros adicionais (mês, categoria dinâmica)
     */
    async getDashboardStats(
        tipoReport: string,
        destinationDir: string,
        options: { month?: string, categoryField?: string } = {}
    ): Promise<DashboardData | null> {
        try {
            const tipo = configManager.normalizeReportType(tipoReport);
            const fileName = buildMasterSnapshotName(tipo, "CURRENT");

            let resolvedDest = configManager.resolvePath(destinationDir) || destinationDir;
            let filePath = path.join(resolvedDest, fileName);

            const presets = configManager.getPresets();
            let currentPreset = presets.find(p => {
                const pDest = configManager.resolvePath(p.destination);
                return pDest && (pDest === resolvedDest || resolvedDest.startsWith(pDest + path.sep));
            });

            // Se não encontrou o arquivo no destino sugerido, busca em todos os Presets do mesmo tipo
            if (!fs.existsSync(filePath)) {
                automationLogger.debug(`[DashboardService] Arquivo não encontrado em ${resolvedDest}. Buscando em presets do tipo ${tipo}...`);

                const matchingPresets = presets.filter(p => configManager.normalizeReportType(p.type) === tipo);
                for (const p of matchingPresets) {
                    const pDest = configManager.resolvePath(p.destination);
                    if (pDest) {
                        const candidatePath = path.join(pDest, fileName);
                        if (fs.existsSync(candidatePath)) {
                            filePath = candidatePath;
                            resolvedDest = pDest;
                            currentPreset = p;
                            automationLogger.info(`[DashboardService] Master encontrado via Preset "${p.name}" em: ${filePath}`);
                            break;
                        }
                    }
                }
            }

            if (!fs.existsSync(filePath)) {
                automationLogger.warn(`[DashboardService] Arquivo master de ${tipo} não encontrado em nenhum local conhecido.`);
                return null;
            }

            let mapping = currentPreset?.dashboardMapping;

            // Se o Preset não tem mapeamento ou as chaves estão vazias, tenta o Global
            if (!mapping || (!mapping.value && !mapping.date)) {
                const schema = configManager.getSchemaByType(tipo);
                mapping = schema?.dashboardMapping;
            }

            if (!mapping) {
                automationLogger.warn(`[DashboardService] Nenhum mapeamento de dashboard definido para ${tipoReport} (Preset: ${currentPreset?.name || 'N/A'})`);
                return null;
            }

            // Fix for legacy presets showing UF instead of Product Group
            if (mapping.group === 'ORIGEM_SITE' || mapping.group === 'ORIGEM_UF') {
                mapping.group = 'Grupo';
            }

            const workbook = XLSX.readFile(filePath);
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const data: any[] = ExcelUtils.safeSheetToJson(sheet, { defval: "" });

            if (data.length === 0) return null;

            return this.processData(data, tipoReport, mapping, filePath, options);
        } catch (error: any) {
            automationLogger.error(`[DashboardService] Erro ao processar dashboard: ${error.message}`);
            return null;
        }
    }


    // ... (getDashboardStats remains the same)

    private processData(
        data: any[],
        type: string,
        mapping: any,
        filePath: string,
        options: { month?: string, categoryField?: string, [key: string]: any } = {}
    ): DashboardData {
        // [NEW] 1. Auto-Learning: Se for VENDAS, atualiza o catálogo
        if (type === 'VENDA') {
            catalogService.updateFromSales(data);
        }

        // [NEW] 2. Enrichment: Se for PEDIDOS, enriquece com dados do catálogo
        let unknownRefsMap = new Map<string, number>();

        if (type === 'PEDIDO') {
            // Ref keys patterns
            const refKeys = ['Ref', 'Referencia', 'Produto', 'Cod. Produto'];

            data.forEach(row => {
                // Tenta achar a referência
                let ref = "";
                for (const k of refKeys) {
                    const key = Object.keys(row).find(rk => rk.toLowerCase() === k.toLowerCase());
                    if (key && row[key]) {
                        ref = String(row[key]).trim();
                        break;
                    }
                }

                if (ref) {
                    const details = catalogService.getProduct(ref);
                    if (details) {
                        // Injeta virtualmente as colunas se não existirem
                        if (!row['Marca'] && details.brand) row['Marca'] = details.brand;
                        if (!row['Grupo'] && details.group) row['Grupo'] = details.group;
                        if (!row['Sub-Grupo'] && details.subGroup) row['Sub-Grupo'] = details.subGroup;
                    } else {
                        // Coleta para relatório
                        const count = unknownRefsMap.get(ref) || 0;
                        unknownRefsMap.set(ref, count + 1);

                        // Marca como Desconhecido para filtros
                        if (!row['Marca']) row['Marca'] = "NÃO IDENTIFICADO";
                        if (!row['Grupo']) row['Grupo'] = "NÃO IDENTIFICADO";
                    }
                }
            });
        }

        // ... (rest of processData remains logic, but now operates on enriched data)

        const stats: DashboardData = {
            type,
            summary: {
                totalValue: 0,
                totalRecords: 0,
                lastUpdate: fs.statSync(filePath).mtime.toISOString(),
                valueGrowth: 0,
                recordGrowth: 0
            },
            charts: {
                byDate: [],
                byGroup: [],
                byCategory: [],
                byBrand: [],
                byUF: [],
                byAssociado: []
            },
            availableMonths: [],
            availableFilters: {
                brands: [],
                customers: [],
                groups: [],
                subGroups: []
            },
            mappingUsed: mapping,
            sourceFile: filePath,
            unknownRefs: []
        };

        const dateMap = new Map<string, number>();
        const groupMap = new Map<string, number>();
        const categoryMap = new Map<string, number>();
        const brandMap = new Map<string, number>();
        const ufMap = new Map<string, number>();
        const associadoMap = new Map<string, number>();

        const monthsSet = new Set<string>();
        const brandsSet = new Set<string>();
        const customersSet = new Set<string>();
        const groupsSet = new Set<string>();
        const subGroupsSet = new Set<string>();
        // [NEW] Mapa para armazenar totais por mês (para cálculo de tendência)
        const monthlyTotals = new Map<string, { value: number, records: number }>();

        // Constantes para comparação temporal
        let prevMonth = "";
        if (options.month) {
            const [y, m] = options.month.split('-').map(Number);
            const d = new Date(y, m - 2, 1); // Subtrai 1 mês (m-1 seria o atual, m-2 é o anterior)
            prevMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        }

        let totalValuePrev = 0;
        let totalRecordsPrev = 0;

        // Função utilitária para buscar campo case-insensitive
        const findValue = (row: any, fieldName: string) => {
            if (!fieldName) return undefined;
            if (row[fieldName] !== undefined) return row[fieldName];
            const lowerField = fieldName.toLowerCase();
            const actualKey = Object.keys(row).find(k => k.toLowerCase() === lowerField);
            return actualKey ? row[actualKey] : undefined;
        };

        const finalCategoryField = options.categoryField || mapping.category;

        data.forEach(row => {
            // 1. Extração de Metadados Globais (para preencher os filtros da UI)
            const rawDate = findValue(row, mapping.date);
            let dateObj: Date | null = null;
            let rowMonth = "";

            if (rawDate) {
                if (rawDate instanceof Date) dateObj = rawDate;
                else if (typeof rawDate === 'number') dateObj = new Date((rawDate - 25569) * 86400 * 1000);
                else {
                    const dateStr = String(rawDate);
                    if (dateStr.includes('-')) {
                        const parts = dateStr.split('-');
                        dateObj = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2].substring(0, 2)));
                    } else if (dateStr.includes('/')) {
                        const parts = dateStr.split('/');
                        if (parts.length === 3) dateObj = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
                    }
                }

                if (dateObj && !isNaN(dateObj.getTime())) {
                    rowMonth = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}`;
                    monthsSet.add(rowMonth);
                }
            }

            // Coleta valores para filtros (ignora nulos)
            const bVal = findValue(row, 'Marca') || findValue(row, 'MARCA');
            if (bVal) brandsSet.add(String(bVal));

            const cVal = findValue(row, 'Cliente') || findValue(row, 'Cliente / Nome Fantasia') || findValue(row, 'Nome Fantasia');
            if (cVal) customersSet.add(String(cVal));

            const gVal = findValue(row, mapping.group);
            if (gVal) groupsSet.add(String(gVal));

            const sgVal = findValue(row, 'Sub-Group') || findValue(row, 'SUB-GRUPO') || findValue(row, 'SubGrupo') || (mapping.subGroup ? findValue(row, mapping.subGroup) : undefined);
            if (sgVal) subGroupsSet.add(String(sgVal));

            // 2. Lógica de Filtragem Dinâmica
            // Condição 1: Filtro de Mês
            const isCurrentMonth = options.month && rowMonth === options.month;
            const isPrevMonth = prevMonth && rowMonth === prevMonth;

            // Se o usuário selecionou filtros específicos (Marca, Cliente, etc), eles devem ser aplicados
            // Observação: Para a soma do dashboard, consideramos apenas o que batem com TODOS os filtros ativos
            let matchesCustomFilters = true;
            Object.entries(options).forEach(([key, val]) => {
                if (key === 'month' || key === 'categoryField' || !val) return;

                // Busca o valor na linha para o campo de filtro
                let rowVal = findValue(row, key);
                // Casos especiais de nomes de colunas que o usuário pode selecionar
                if (rowVal === undefined && key === 'brand') rowVal = findValue(row, 'Marca') || findValue(row, 'MARCA');
                if (rowVal === undefined && key === 'customer') rowVal = findValue(row, 'Cliente') || findValue(row, 'Cliente / Nome Fantasia') || findValue(row, 'Nome Fantasia');

                if (rowVal === undefined || String(rowVal) !== String(val)) {
                    matchesCustomFilters = false;
                }
            });

            if (!matchesCustomFilters) return;

            // 3. Processamento de Valores (Soma para o Período Selecionado)
            let val = 0;
            const rawVal = findValue(row, mapping.value);

            if (rawVal !== undefined && rawVal !== null) {
                if (typeof rawVal === 'number') {
                    val = rawVal;
                } else {
                    const strVal = String(rawVal).trim();
                    // Heurística para formato PT-BR (ex: 1.000,00 ou 1000,00) vs EN-US (1,000.00)
                    // Se tiver vírgula no final (ex: ,50) ou tiver pontos antes da vírgula (1.234,56)
                    const hasComma = strVal.includes(',');
                    const hasDot = strVal.includes('.');

                    let cleanVal = strVal;

                    if (hasComma && hasDot) {
                        // Ambíguo, mas no Brasil: Ponto = Milhar, Vírgula = Decimal
                        // Vamos assumir PT-BR se a última ocorrência for vírgula
                        if (strVal.lastIndexOf(',') > strVal.lastIndexOf('.')) {
                            // Formato 1.234,56 -> Remove pontos, troca vírgula por ponto
                            cleanVal = strVal.replace(/\./g, '').replace(',', '.');
                        } else {
                            // Formato 1,234.56 -> Remove vírgulas
                            cleanVal = strVal.replace(/,/g, '');
                        }
                    } else if (hasComma) {
                        // Só vírgula (1000,50) -> Troca por ponto
                        cleanVal = strVal.replace(',', '.');
                    }
                    // Se só tem ponto (1000.50), deixa como está (JS aceita)

                    // Remove caracteres não numéricos exceto ponto e sinal negativo
                    cleanVal = cleanVal.replace(/[^\d.-]/g, '');
                    val = parseFloat(cleanVal) || 0;
                }
            } else {
                val = 0;
            }

            // [NEW] Agregação Mensal para Cálculo de Tendência (Trend)
            // Se rowMonth existe e passa nos filtros customizados (Marca, etc)
            // A validação matchesCustomFilters já garantiu que a linha é válida para o escopo atual
            if (rowMonth) {
                if (!monthlyTotals.has(rowMonth)) {
                    monthlyTotals.set(rowMonth, { value: 0, records: 0 });
                }
                const m = monthlyTotals.get(rowMonth)!;
                m.value += val;
                m.records++;
            }

            // Acumula para o mês atual selecionado (Display Principal)
            if (!options.month || isCurrentMonth) {
                stats.summary.totalValue += val;
                stats.summary.totalRecords++; // Contagem de registros sempre incrementa 1 por linha

                // Agrupamentos dos Gráficos
                if (dateObj) {
                    const dateKey = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;
                    dateMap.set(dateKey, (dateMap.get(dateKey) || 0) + val);
                }

                if (gVal) {
                    groupMap.set(String(gVal), (groupMap.get(String(gVal)) || 0) + val);
                }

                const catVal = findValue(row, finalCategoryField);
                if (catVal) {
                    categoryMap.set(String(catVal), (categoryMap.get(String(catVal)) || 0) + val);
                }

                if (bVal) {
                    brandMap.set(String(bVal), (brandMap.get(String(bVal)) || 0) + val);
                }
                const ufVal = findValue(row, 'UF') || findValue(row, 'ORIGEM_UF');
                if (ufVal) {
                    ufMap.set(String(ufVal), (ufMap.get(String(ufVal)) || 0) + val);
                }
                // Volume por Cliente: colunas existentes nos Excel (não existe coluna "Associado")
                const clienteVal = findValue(row, 'Cliente') || findValue(row, 'Cliente / Nome Fantasia') || findValue(row, 'Nome Fantasia');
                if (clienteVal) {
                    associadoMap.set(String(clienteVal), (associadoMap.get(String(clienteVal)) || 0) + val);
                }
            }
        });

        // 4. Cálculos de Crescimento (Revisado para suportar "Todos os Meses")
        let currentMonthVal = 0;
        let prevMonthVal = 0;
        let currentMonthRec = 0;
        let prevMonthRec = 0;

        if (options.month) {
            // Se um mês específico foi selecionado, usamos a lógica direta
            // O loop já filtrou e somou stats.summary.totalValue (Current)
            // Precisamos do PrevMonth (que pode não ter sido somado em stats se o filtro 'isCurrentMonth' excluiu)
            // Mas espere! O loop tinha 'if (isPrevMonth) totalValuePrev += val'.
            // Vamos usar o mapa monthlyTotals que é mais seguro e completo
            if (monthlyTotals.has(options.month)) {
                currentMonthVal = monthlyTotals.get(options.month)!.value;
                currentMonthRec = monthlyTotals.get(options.month)!.records;
            }
            if (prevMonth && monthlyTotals.has(prevMonth)) {
                prevMonthVal = monthlyTotals.get(prevMonth)!.value;
                prevMonthRec = monthlyTotals.get(prevMonth)!.records;
            }
        } else {
            // Se "Todos os Meses", pegamos os 2 últimos meses disponíveis para indicar Tendência Recente
            const sortedMonths = Array.from(monthlyTotals.keys()).sort(); // YYYY-MM sorteia corretamente
            if (sortedMonths.length >= 2) {
                const lastMonth = sortedMonths[sortedMonths.length - 1]; // Atual
                const penultMonth = sortedMonths[sortedMonths.length - 2]; // Anterior

                currentMonthVal = monthlyTotals.get(lastMonth)!.value;
                currentMonthRec = monthlyTotals.get(lastMonth)!.records;
                prevMonthVal = monthlyTotals.get(penultMonth)!.value;
                prevMonthRec = monthlyTotals.get(penultMonth)!.records;
            }
        }

        // Calcula Delta
        if (prevMonthVal > 0) {
            stats.summary.valueGrowth = ((currentMonthVal - prevMonthVal) / prevMonthVal) * 100;
        }
        if (prevMonthRec > 0) {
            stats.summary.recordGrowth = ((currentMonthRec - prevMonthRec) / prevMonthRec) * 100;
        }

        // 5. Formatação Final
        stats.availableMonths = Array.from(monthsSet).sort().reverse();
        stats.availableFilters = {
            brands: Array.from(brandsSet).sort(),
            customers: Array.from(customersSet).sort(),
            groups: Array.from(groupsSet).sort(),
            subGroups: Array.from(subGroupsSet).sort()
        };

        stats.charts.byDate = Array.from(dateMap.entries())
            .map(([label, value]) => ({ label, value }))
            .sort((a, b) => a.label.localeCompare(b.label));

        stats.charts.byGroup = Array.from(groupMap.entries())
            .map(([label, value]) => ({ label, value }))
            .sort((a, b) => b.value - a.value);

        stats.charts.byCategory = Array.from(categoryMap.entries())
            .map(([label, value]) => ({ label, value }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 15);

        stats.charts.byBrand = Array.from(brandMap.entries())
            .map(([label, value]) => ({ label, value }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 20);

        stats.charts.byUF = Array.from(ufMap.entries())
            .map(([label, value]) => ({ label, value }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 20);

        stats.charts.byAssociado = Array.from(associadoMap.entries())
            .map(([label, value]) => ({ label, value }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 20);

        // Convert unknownRefsMap to array for frontend
        if (unknownRefsMap.size > 0) {
            stats.unknownRefs = Array.from(unknownRefsMap.entries())
                .map(([ref, count]) => ({ ref, count }))
                .sort((a, b) => b.count - a.count);
        }

        return stats;
    }
}

export const dashboardService = new DashboardService();
