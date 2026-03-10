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

// [CACHE] Armazena os dados brutos carregados dos arquivos Excel para evitar leituras lentas
interface CacheEntry {
    data: any[];
    mtime: number;
}

export class DashboardService {
    private static dataCache = new Map<string, CacheEntry>();

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
        options: { month?: string, year?: string, categoryField?: string } = {}
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


            // [CACHE] Verifica se o arquivo já está no cache e se não foi modificado
            const stats = fs.statSync(filePath);
            const mtime = stats.mtimeMs;
            const cacheKey = `${tipo}_${filePath}`;
            const cached = DashboardService.dataCache.get(cacheKey);

            let data: any[];

            if (cached && cached.mtime === mtime) {
                automationLogger.debug(`[DashboardService] Usando dados em cache para: ${filePath}`);
                data = cached.data;
            } else {
                automationLogger.info(`[DashboardService] Lendo arquivo Excel (pode levar alguns segundos): ${filePath}`);
                const workbook = XLSX.readFile(filePath);
                const sheet = workbook.Sheets[workbook.SheetNames[0]];
                data = ExcelUtils.safeSheetToJson(sheet, { defval: "" });

                // Atualiza o cache
                DashboardService.dataCache.set(cacheKey, { data, mtime });
            }

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

        if (data.length > 0) {
            const allKeys = Object.keys(data[0]);
            const getActualKey = (possibleKeys: string[]) => {
                for (const pk of possibleKeys) {
                    const lowerPK = pk.toLowerCase();
                    const found = allKeys.find(ak => ak.toLowerCase() === lowerPK);
                    if (found) return found;
                }
                return null;
            };

            if (type === 'PEDIDO') {
                // Ref keys patterns
                const refKeys = ['Ref', 'Referencia', 'Produto', 'Cod. Produto'];
                const actualRefKey = getActualKey(refKeys);

                if (actualRefKey) {
                    data.forEach(row => {
                        const refValue = row[actualRefKey];
                        if (refValue) {
                            const ref = String(refValue).trim();
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
            }
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

        // [OPTIMIZATION] Pre-resolve mapping keys from data headers
        const allKeys = data.length > 0 ? Object.keys(data[0]) : [];
        const getActualKey = (fieldName: string) => {
            if (!fieldName) return null;
            const lowerField = fieldName.toLowerCase();
            return allKeys.find(k => k.toLowerCase() === lowerField) || null;
        };

        const resolvedMapping = {
            date: getActualKey(mapping.date),
            value: getActualKey(mapping.value),
            group: getActualKey(mapping.group),
            subGroup: mapping.subGroup ? getActualKey(mapping.subGroup) : null,
            brand: getActualKey('Marca'),
            customer: getActualKey('Cliente') || getActualKey('Cliente / Nome Fantasia') || getActualKey('Nome Fantasia'),
            tipoOperacao: getActualKey('Tipo Operação'),
            uf: getActualKey('UF') || getActualKey('Estado') || getActualKey('Situação Tributária') || getActualKey('UF_DESTINO'),
            associado: getActualKey('Associado') || getActualKey('Vendedor') || getActualKey('Cliente')
        };

        const finalCategoryFieldKey = getActualKey(options.categoryField || mapping.category);

        // Helper to get value from row using resolved keys
        const getRowValue = (row: any, key: string | null) => (key ? row[key] : undefined);

        // [FILTRO TIPO OPERAÇÃO] Se for VENDA, filtra apenas registros com 'Tipo Operação' = 'Venda'
        const filteredData = type === 'VENDA'
            ? data.filter(row => {
                const tipoOp = getRowValue(row, resolvedMapping.tipoOperacao);
                if (tipoOp === undefined || tipoOp === null || String(tipoOp).trim() === '') return true;
                return String(tipoOp).trim().toLowerCase() === 'venda';
            })
            : data;

        // Log para debug
        if (type === 'VENDA' && filteredData.length !== data.length) {
            automationLogger.info(`[DashboardService] Filtro 'Tipo Operação': ${data.length} registros → ${filteredData.length} registros (Venda)`);
        }

        filteredData.forEach(row => {
            // 1. Extração de Metadados Globais (para preencher os filtros da UI)
            const rawDate = getRowValue(row, resolvedMapping.date);
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
            const bVal = getRowValue(row, resolvedMapping.brand);
            if (bVal) brandsSet.add(String(bVal));

            const cVal = getRowValue(row, resolvedMapping.customer);
            if (cVal) customersSet.add(String(cVal));

            const gVal = getRowValue(row, resolvedMapping.group);
            if (gVal) groupsSet.add(String(gVal));

            const actualSubGroupKey = getActualKey('Sub-Group') || getActualKey('SUB-GRUPO') || getActualKey('SubGrupo') || resolvedMapping.subGroup;
            const sgVal = getRowValue(row, actualSubGroupKey);
            if (sgVal) subGroupsSet.add(String(sgVal));

            // 2. Lógica de Filtragem Dinâmica
            const isCurrentMonth = options.month && rowMonth === options.month;
            const isCurrentYear = options.year && rowMonth?.startsWith(options.year + '-');
            const isPrevMonth = prevMonth && rowMonth === prevMonth;

            let matchesCustomFilters = true;
            for (const [key, val] of Object.entries(options)) {
                if (key === 'month' || key === 'year' || key === 'categoryField' || !val) continue;

                let rowVal;
                if (key === 'brand') rowVal = getRowValue(row, resolvedMapping.brand);
                else if (key === 'customer') rowVal = getRowValue(row, resolvedMapping.customer);
                else if (key === 'group') rowVal = getRowValue(row, resolvedMapping.group);
                else if (key === 'subGroup') rowVal = getRowValue(row, actualSubGroupKey);
                else rowVal = row[key]; // Fallback for specific keys

                if (rowVal === undefined || String(rowVal) !== String(val)) {
                    matchesCustomFilters = false;
                    break;
                }
            }

            if (!matchesCustomFilters) return;

            // 3. Processamento de Valores
            let val = 0;
            const rawVal = getRowValue(row, resolvedMapping.value);

            if (rawVal !== undefined && rawVal !== null) {
                if (typeof rawVal === 'number') {
                    val = rawVal;
                } else {
                    const strVal = String(rawVal).trim();
                    const hasComma = strVal.includes(',');
                    const hasDot = strVal.includes('.');
                    let cleanVal = strVal;

                    if (hasComma && hasDot) {
                        if (strVal.lastIndexOf(',') > strVal.lastIndexOf('.')) {
                            cleanVal = strVal.replace(/\./g, '').replace(',', '.');
                        } else {
                            cleanVal = strVal.replace(/,/g, '');
                        }
                    } else if (hasComma) {
                        cleanVal = strVal.replace(',', '.');
                    }
                    cleanVal = cleanVal.replace(/[^\d.-]/g, '');
                    val = parseFloat(cleanVal) || 0;
                }
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

            // Acumula para o período selecionado (Display Principal e Gráficos)
            // Deve bater com o Mês AND Ano se ambos estiverem definidos
            const matchesTimeFilters = (!options.month || isCurrentMonth) && (!options.year || isCurrentYear);

            // 4. Agregação de Resultados (Filtrados por Mês/Ano/Geral)
            // Lógica: Se Mês selecionado → apenas Mês. Senão, se Ano selecionado → apenas Ano. Senão → Tudo.
            const isTarget = options.month ? isCurrentMonth : (options.year ? isCurrentYear : true);

            if (isTarget) {
                stats.summary.totalValue += val;
                stats.summary.totalRecords++;

                // Agregação para Gráficos
                if (rowMonth) {
                    const count = dateMap.get(rowMonth) || 0;
                    dateMap.set(rowMonth, count + val);
                }

                const gVal2 = getRowValue(row, resolvedMapping.group);
                if (gVal2) {
                    const count = groupMap.get(String(gVal2)) || 0;
                    groupMap.set(String(gVal2), count + val);
                }

                const bVal2 = getRowValue(row, resolvedMapping.brand);
                if (bVal2) {
                    const count = brandMap.get(String(bVal2)) || 0;
                    brandMap.set(String(bVal2), count + val);
                }

                const ufVal = getRowValue(row, resolvedMapping.uf);
                if (ufVal) {
                    const count = ufMap.get(String(ufVal)) || 0;
                    ufMap.set(String(ufVal), count + val);
                }

                const assocVal = getRowValue(row, resolvedMapping.associado);
                if (assocVal) {
                    const count = associadoMap.get(String(assocVal)) || 0;
                    associadoMap.set(String(assocVal), count + val);
                }

                // Categoria Dinâmica para o terceiro gráfico
                const cVal2 = getRowValue(row, finalCategoryFieldKey);
                if (cVal2) {
                    const count = categoryMap.get(String(cVal2)) || 0;
                    categoryMap.set(String(cVal2), count + val);
                }
            }
        });

        // 4. Cálculos de Crescimento (Revisado para suportar "Todos os Meses" e "Ano vs Ano Anterior")
        let currentPeriodVal = 0;
        let prevPeriodVal = 0;
        let currentPeriodRec = 0;
        let prevPeriodRec = 0;

        if (options.month) {
            // Se um mês específico foi selecionado, usamos a lógica mensal tradicional
            if (monthlyTotals.has(options.month)) {
                currentPeriodVal = monthlyTotals.get(options.month)!.value;
                currentPeriodRec = monthlyTotals.get(options.month)!.records;
            }
            if (prevMonth && monthlyTotals.has(prevMonth)) {
                prevPeriodVal = monthlyTotals.get(prevMonth)!.value;
                prevPeriodRec = monthlyTotals.get(prevMonth)!.records;
            }
        } else if (options.year) {
            // Se apenas o ANO foi selecionado, comparamos o Ano Inteiro vs Ano Anterior
            const selectedYear = parseInt(options.year);
            const prevYear = selectedYear - 1;

            monthlyTotals.forEach((v, k) => {
                const year = parseInt(k.split('-')[0]);
                if (year === selectedYear) {
                    currentPeriodVal += v.value;
                    currentPeriodRec += v.records;
                } else if (year === prevYear) {
                    prevPeriodVal += v.value;
                    prevPeriodRec += v.records;
                }
            });
        } else {
            // Se "TUDO" (sem ano e sem mês), pegamos os 2 últimos meses disponíveis para tendência
            const sortedMonths = Array.from(monthlyTotals.keys()).sort();
            if (sortedMonths.length >= 2) {
                const lastMonth = sortedMonths[sortedMonths.length - 1];
                const penultMonth = sortedMonths[sortedMonths.length - 2];

                currentPeriodVal = monthlyTotals.get(lastMonth)!.value;
                currentPeriodRec = monthlyTotals.get(lastMonth)!.records;
                prevPeriodVal = monthlyTotals.get(penultMonth)!.value;
                prevPeriodRec = monthlyTotals.get(penultMonth)!.records;
            }
        }

        // Calcula Delta
        if (prevPeriodVal > 0) {
            stats.summary.valueGrowth = ((currentPeriodVal - prevPeriodVal) / prevPeriodVal) * 100;
        }
        if (prevPeriodRec > 0) {
            stats.summary.recordGrowth = ((currentPeriodRec - prevPeriodRec) / prevPeriodRec) * 100;
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
