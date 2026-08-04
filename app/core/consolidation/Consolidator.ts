import { app } from 'electron';
import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';
import { configManager } from '../../config/config-manager';
import { automationLogger } from '../../config/logger';
import { buildMasterSnapshotName } from '../../policy/snapshot/FileNamingPolicy';
import { AppPaths } from '../utils/AppPaths';
import { ExcelUtils } from '../utils/ExcelUtils';
import { PerformanceMonitor } from '../utils/PerformanceMonitor';

export interface SiteResult {
    success: boolean;
    siteId: string;
    siteName: string;
    uf?: string;
    currentFile?: string;
    identity?: {
        tipo: string;
        period: string;
    };
}

export class Consolidator {
    constructor() { }
    /**
     * Consolida múltiplos arquivos Excel em arquivos mestres (Snapshot e Deletados)
     * Agora agrupa por tipo de relatório através de todos os períodos e UFs.
     * @param results Lista de resultados da execução atual
     * @param destinationDir Diretório de saída
     */
    async consolidate(results: any[], destinationDir: string, tipoOverride?: string): Promise<{ current: string | null, deleted: string | null }> {
        const perf = new PerformanceMonitor(`consolidate:${tipoOverride || 'AUTO'}`);
        const resolvedDest = configManager.resolvePath(destinationDir) || destinationDir;

        // Identifica o tipo de relatório a partir dos resultados (ex: VENDA, PEDIDO)
        // Busca na raiz do resultado ou dentro de sspResult (caso de sucesso)
        const sampleResult = tipoOverride ? null : results.find(r => r.identity?.tipo || r.sspResult?.identity?.tipo);
        const rawTipo = tipoOverride || sampleResult?.identity?.tipo || sampleResult?.sspResult?.identity?.tipo || 'GERAL';
        const tipo = configManager.normalizeReportType(rawTipo);

        const statusLabel = tipoOverride ? `(Tipo Forçado: ${tipoOverride})` : `(Tipo Inferido: ${tipo})`;
        automationLogger.info(`[Consolidator] Iniciando VERDADEIRA consolidação master para: ${tipo} ${statusLabel} em ${resolvedDest}`);

        // 1. Consolida os Snapshots Atuais (independente de período definido nesta execução)
        const currentPath = await this.mergeFiles(
            tipo,
            'CURRENT',
            resolvedDest,
            buildMasterSnapshotName(tipo, "CURRENT"),
            'CONSOLIDADO_MASTER',
            results
        );

        // 2. Consolida os Registros Deletados
        const deletedPath = await this.mergeFiles(
            tipo,
            'DELETED',
            resolvedDest,
            buildMasterSnapshotName(tipo, "DELETED"),
            'CONSOLIDADO_EXCLUIDOS_MASTER',
            results
        );

        const output = {
            current: currentPath,
            deleted: deletedPath
        };
        perf.done({ current: Boolean(currentPath), deleted: Boolean(deletedPath) });
        return output;
    }

    /**
     * Une diversos snapshots em um único arquivo mestre com deduplicação e metadados.
     */
    private async mergeFiles(
        tipo: string,
        mode: 'CURRENT' | 'DELETED',
        destinationDir: string,
        outputName: string,
        logLabel: string,
        currentResults: any[]
    ): Promise<string | null> {
        const perf = new PerformanceMonitor(`merge:${tipo}:${mode}`);
        const outputPath = path.join(destinationDir, outputName);
        let masterData: any[] = [];

        // Mapeamento de IDs para Nomes de Sites (para rastreabilidade amigável)
        const siteNames = new Map<string, string>();
        const config = configManager.getConfig();
        (config.presets || []).forEach((p: any) => {
            (p.sites || []).forEach((s: any) => siteNames.set(s.id, s.name));
        });
        currentResults.forEach(r => { if (r.siteId) siteNames.set(r.siteId, r.siteName); });

        // Identifica todos os arquivos físicos de snapshot relevantes
        const allSnapshots = await this.findAllSnapshots(tipo, mode, destinationDir);
        if (allSnapshots.length === 0) {
            automationLogger.info(`[Consolidator] Nenhum snapshot tipo ${tipo} encontrado para consolidar.`);
            perf.done({ snapshots: 0 });
            return null;
        }

        // Ordenamos por data de modificação descendente para que, ao deduplicar, mantenhamos o mais recente
        allSnapshots.sort((a, b) => b.mtime - a.mtime);

        automationLogger.info(`[Consolidator] Lendo ${allSnapshots.length} snapshots para inclusão no ${logLabel}`);

        // NOVO: Resolve chaves primárias a partir dos resultados da execução atual (se disponíveis)
        // Isso garante que se o usuário mudou a PK no Preset, o Consolidado Master respeite IMEDIATAMENTE.
        let customPKs: string[] | undefined;
        const resultWithPKs = currentResults.find(r => r.sspResult?.primaryKeys && r.sspResult.primaryKeys.length > 0);
        if (resultWithPKs) {
            customPKs = resultWithPKs.sspResult.primaryKeys;
            automationLogger.debug(`[Consolidator] Usando chaves primárias da execução atual: ${customPKs?.join(', ')}`);
        }

        try {
            const dedupeState = this.createDeduper(tipo, customPKs);
            let rowsRead = 0;
            for (const snap of allSnapshots) {
                if (!(await this.pathExists(snap.path))) continue;
                try {
                    automationLogger.debug(`[Consolidator] Lendo ${mode}: ${snap.path}`);
                    const workbook = XLSX.readFile(snap.path);
                    const sheet = workbook.Sheets[workbook.SheetNames[0]];
                    if (!sheet) continue;

                    const rows: any[] = ExcelUtils.safeSheetToJson(sheet, { defval: "" });
                    if (rows.length === 0) continue;
                    rowsRead += rows.length;

                    const meta = await this.getSnapshotMeta(snap.path);
                    const processedDate = meta?.lastUpdated || new Date(snap.mtime).toISOString();
                    const siteName = siteNames.get(snap.siteId) || snap.siteId;

                    // Processa em blocos para reduzir picos de memória e liberar event loop.
                    const chunkSize = 5000;
                    for (let i = 0; i < rows.length; i += chunkSize) {
                        const chunk = rows.slice(i, i + chunkSize);
                        for (const row of chunk) {
                            const enriched: any = {
                                PERIODO_ORIGINAL: snap.period,
                                ORIGEM_UF: snap.uf,
                                ORIGEM_SITE: siteName,
                                DATA_PROCESSAMENTO_ORIGINAL: row.ssp_data_processamento || row.DATA_PROCESSAMENTO_ORIGINAL || processedDate,
                                ORIGEM_SNAPSHOT: snap.filename,
                                ...row
                            };
                            const targetCol = tipo === 'VENDA' ? 'Referencia' : (tipo === 'PEDIDO' ? 'Ref' : null);
                            if (targetCol) {
                                const actualKey = Object.keys(enriched).find(k => k.toLowerCase().trim() === targetCol.toLowerCase());
                                if (actualKey && enriched[actualKey] !== undefined && enriched[actualKey] !== null) {
                                    enriched[actualKey] = String(enriched[actualKey]);
                                }
                            }
                            if (dedupeState.accept(enriched)) {
                                masterData.push(enriched);
                            }
                        }
                        await new Promise(resolve => setImmediate(resolve));
                    }
                } catch (error: any) {
                    automationLogger.error(`[Consolidator] Erro ao ler snapshot ${snap.path}: ${error.message}`);
                }
            }

            if (masterData.length === 0) {
                perf.done({ snapshots: allSnapshots.length, rowsRead: 0, rowsOut: 0 });
                return null;
            }

            const dedupCount = rowsRead - masterData.length;
            if (dedupCount > 0) {
                automationLogger.info(`[Consolidator] ${dedupCount} duplicatas removidas na deduplicação incremental.`);
            }

            const masterWs = XLSX.utils.json_to_sheet(masterData);
            const targetCol = tipo === 'VENDA' ? 'Referencia' : (tipo === 'PEDIDO' ? 'Ref' : null);
            if (targetCol) {
                ExcelUtils.forceColumnToText(masterWs, targetCol);
            }
            const masterWb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(masterWb, masterWs, 'Consolidado');

            await fs.promises.mkdir(destinationDir, { recursive: true });

            XLSX.writeFile(masterWb, outputPath, { compression: true });
            automationLogger.info(`[Consolidator] ${logLabel} concluído: ${masterData.length} registros em ${outputPath}`);
            perf.done({ snapshots: allSnapshots.length, rowsOut: masterData.length });
            return outputPath;

        } catch (error: any) {
            automationLogger.error(`[Consolidator] Falha fatal ao consolidar ${tipo}/${mode}: ${error.message}`);
            perf.done({ error: error.message });
            return null;
        }
    }

    /**
     * Analisa o nome do arquivo e extrai informações do snapshot
     * Retorna null se o arquivo não corresponder ao padrão esperado
     */
    private parseSnapshotFilename(filename: string, tipo: string, mode: 'CURRENT' | 'DELETED'): { period: string; uf: string } | null {
        // Formato esperado: TIPO_MODE_PERIOD_UF.xlsx
        if (!filename.toUpperCase().startsWith(`${tipo}_${mode}_`) || !filename.endsWith('.xlsx')) {
            return null;
        }

        const parts = filename.replace('.xlsx', '').split('_');
        if (parts.length < 4) {
            automationLogger.warn(`[Consolidator] Nome de arquivo inválido (formato incorreto): ${filename}`);
            return null;
        }

        const uf = parts.pop()!;
        const period = parts.slice(2).join('_');

        return { period, uf };
    }

    /**
     * Busca todos os snapshots físicos salvos no sistema para um determinado tipo e modo
     * Procura em dois locais: pasta interna do app E pasta de destino (onde os arquivos são salvos)
     */
    private async findAllSnapshots(tipo: string, mode: 'CURRENT' | 'DELETED', destinationDir?: string): Promise<any[]> {
        const found: any[] = [];

        // 1. Busca na pasta interna do app (AppPaths.getSnapshotsPath())
        const snapshotsBase = AppPaths.getSnapshotsPath();
        if (await this.pathExists(snapshotsBase)) {
            const siteDirs = await fs.promises.readdir(snapshotsBase);

            for (const siteId of siteDirs) {
                const sitePath = path.join(snapshotsBase, siteId);
                try {
                    const stats = await fs.promises.stat(sitePath);
                    if (!stats.isDirectory()) continue;

                    const files = await fs.promises.readdir(sitePath);
                    for (const file of files) {
                        // Formato esperado: TIPO_MODE_PERIOD_UF.xlsx (Normalizado para Uppercase no startWith)
                        if (file.toUpperCase().startsWith(`${tipo}_${mode}_`) && file.endsWith('.xlsx')) {
                            const parts = file.replace('.xlsx', '').split('_');
                            if (parts.length < 4) continue;

                            const uf = parts.pop()!;
                            const period = parts.slice(2).join('_');

                            const filePath = path.join(sitePath, file);
                            const fileStat = await fs.promises.stat(filePath);

                            found.push({
                                path: filePath,
                                filename: file,
                                siteId,
                                period,
                                uf,
                                mtime: fileStat.mtimeMs
                            });
                        }
                    }
                } catch (e) { /* ignore access errors */ }
            }
        }

        // 2. Busca na pasta de destino (ex: C:\Relatorios\Pedidos)
        // Procura em subpastas como UF-Pedidos, UF-Vendas, etc.
        if (destinationDir && await this.pathExists(destinationDir)) {
            try {
                const destDirs = await fs.promises.readdir(destinationDir);

                for (const subDir of destDirs) {
                    const subDirPath = path.join(destinationDir, subDir);
                    try {
                        const stats = await fs.promises.stat(subDirPath);
                        if (!stats.isDirectory()) continue;

                        const files = await fs.promises.readdir(subDirPath);
                        for (const file of files) {
                            if (file.toUpperCase().startsWith(`${tipo}_${mode}_`) && file.endsWith('.xlsx')) {
                                const parts = file.replace('.xlsx', '').split('_');
                                if (parts.length < 4) continue;

                                const uf = parts.pop()!;
                                const period = parts.slice(2).join('_');

                                const filePath = path.join(subDirPath, file);
                                const fileStat = await fs.promises.stat(filePath);

                                found.push({
                                    path: filePath,
                                    filename: file,
                                    siteId: subDir, // Usa o nome da subpasta como siteId
                                    period,
                                    uf,
                                    mtime: fileStat.mtimeMs
                                });
                            }
                        }
                    } catch (e) { /* ignore access errors */ }
                }
            } catch (e) {
                automationLogger.warn(`[Consolidator] Erro ao buscar snapshots em ${destinationDir}: ${(e as any).message}`);
            }
        }

        automationLogger.debug(`[Consolidator] Encontrados ${found.length} snapshots de ${tipo}/${mode}`);
        return found;
    }

    private async getSnapshotMeta(filePath: string): Promise<any> {
        const metaPath = filePath.replace('_CURRENT_', '_META_').replace('_DELETED_', '_META_').replace('.xlsx', '.json');
        if (!(await this.pathExists(metaPath))) return null;
        try {
            const raw = await fs.promises.readFile(metaPath, 'utf8');
            return JSON.parse(raw);
        } catch {
            return null;
        }
    }

    /**
     * Remove registros duplicados mantendo apenas o registro vindo do snapshot mais recente (mtime)
     * Utiliza chaves primárias definidas no schemaMaps.json se disponíveis, caso contrário usa assinatura completa.
     */
    private createDeduper(tipo: string, overridePKs?: string[]) {
        const seen = new Set<string>();
        const metadataCols = ['PERIODO_ORIGINAL', 'ORIGEM_UF', 'ORIGEM_SITE', 'DATA_PROCESSAMENTO_ORIGINAL', 'ORIGEM_SNAPSHOT'];
        const schema = configManager.getSchemaByType(tipo);
        const configPKs: string[] = overridePKs && overridePKs.length > 0 ? overridePKs : (schema?.primaryKey || []);
        let resolvedPKs: string[] | null = null;
        if (configPKs.length > 0) automationLogger.debug(`[Consolidator] Deduplicando ${tipo} com PK configurada.`);
        else automationLogger.debug(`[Consolidator] Deduplicando ${tipo} sem PK configurada (fallback completo).`);
        return {
            accept: (row: any) => {
                if (!resolvedPKs) {
                    const allRowKeys = Object.keys(row);
                    resolvedPKs = configPKs.map(cpk => {
                        const lowerCPK = cpk.toLowerCase();
                        return allRowKeys.find(rk => rk.toLowerCase() === lowerCPK) || cpk;
                    });
                }
                if (resolvedPKs.length > 0) {
                    const hasAtLeastOnePK = resolvedPKs.some(k => {
                        const val = row[k];
                        return val !== undefined && val !== null && String(val).trim() !== '';
                    });
                    if (!hasAtLeastOnePK) return false;
                }
                const signature = resolvedPKs.length > 0
                    ? resolvedPKs.map(k => `|${String(row[k] ?? '').trim()}|`).join('::')
                    : Object.entries(row)
                        .filter(([k]) => !metadataCols.includes(k) && !k.startsWith('ssp_'))
                        .map(([_, v]) => `|${String(v ?? '').trim()}|`)
                        .join('::');
                if (seen.has(signature)) return false;
                seen.add(signature);
                return true;
            }
        };
    }

    private async pathExists(targetPath: string): Promise<boolean> {
        try {
            await fs.promises.access(targetPath, fs.constants.F_OK);
            return true;
        } catch {
            return false;
        }
    }
}

export const consolidator = new Consolidator();
