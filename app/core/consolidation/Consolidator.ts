import { app } from 'electron';
import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';
import { configManager } from '../../config/config-manager';
import { automationLogger } from '../../config/logger';
import { buildMasterSnapshotName } from '../../policy/snapshot/FileNamingPolicy';
import { AppPaths } from '../utils/AppPaths';
import { ExcelUtils } from '../utils/ExcelUtils';

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

        return {
            current: currentPath,
            deleted: deletedPath
        };
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
        const allSnapshots = this.findAllSnapshots(tipo, mode, destinationDir);
        if (allSnapshots.length === 0) {
            automationLogger.info(`[Consolidator] Nenhum snapshot tipo ${tipo} encontrado para consolidar.`);
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
            // Leitura paralela de snapshots para melhor performance
            const snapshotDataPromises = allSnapshots.map(async (snap) => {
                if (!fs.existsSync(snap.path)) return null;

                try {
                    automationLogger.debug(`[Consolidator] Lendo ${mode}: ${snap.path}`);
                    const workbook = XLSX.readFile(snap.path);
                    const sheet = workbook.Sheets[workbook.SheetNames[0]];
                    if (!sheet) return null;

                    const rows: any[] = ExcelUtils.safeSheetToJson(sheet, { defval: "" });
                    if (rows.length === 0) return null;

                    const meta = this.getSnapshotMeta(snap.path);
                    const processedDate = meta?.lastUpdated || new Date(snap.mtime).toISOString();
                    const siteName = siteNames.get(snap.siteId) || snap.siteId;

                    // Injeta colunas de metadados para rastreabilidade master
                    return rows.map(row => ({
                        PERIODO_ORIGINAL: snap.period,
                        ORIGEM_UF: snap.uf,
                        ORIGEM_SITE: siteName,
                        DATA_PROCESSAMENTO_ORIGINAL: processedDate,
                        ORIGEM_SNAPSHOT: snap.filename,
                        ...row
                    }));
                } catch (error: any) {
                    automationLogger.error(`[Consolidator] Erro ao ler snapshot ${snap.path}: ${error.message}`);
                    return null;
                }
            });

            // Aguarda todas as leituras em paralelo
            const snapshotDataArrays = await Promise.all(snapshotDataPromises);

            // Filtra resultados nulos e concatena todos os dados
            masterData = snapshotDataArrays
                .filter((data): data is any[] => data !== null)
                .flat();

            if (masterData.length === 0) return null;

            // Detecção e remoção de duplicatas factuais entre diferentes períodos
            const initialCount = masterData.length;
            masterData = this.removeDuplicates(masterData, tipo, customPKs);
            const dedupCount = initialCount - masterData.length;

            if (dedupCount > 0) {
                automationLogger.info(`[Consolidator] ${dedupCount} duplicatas de períodos/execuções anteriores removidas.`);
            }

            const masterWs = XLSX.utils.json_to_sheet(masterData);
            const masterWb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(masterWb, masterWs, 'Consolidado');

            if (!fs.existsSync(destinationDir)) {
                fs.mkdirSync(destinationDir, { recursive: true });
            }

            XLSX.writeFile(masterWb, outputPath);
            automationLogger.info(`[Consolidator] ${logLabel} concluído: ${masterData.length} registros em ${outputPath}`);
            return outputPath;

        } catch (error: any) {
            automationLogger.error(`[Consolidator] Falha fatal ao consolidar ${tipo}/${mode}: ${error.message}`);
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
    private findAllSnapshots(tipo: string, mode: 'CURRENT' | 'DELETED', destinationDir?: string): any[] {
        const found: any[] = [];

        // 1. Busca na pasta interna do app (AppPaths.getSnapshotsPath())
        const snapshotsBase = AppPaths.getSnapshotsPath();
        if (fs.existsSync(snapshotsBase)) {
            const siteDirs = fs.readdirSync(snapshotsBase);

            for (const siteId of siteDirs) {
                const sitePath = path.join(snapshotsBase, siteId);
                try {
                    const stats = fs.statSync(sitePath);
                    if (!stats.isDirectory()) continue;

                    const files = fs.readdirSync(sitePath);
                    for (const file of files) {
                        // Formato esperado: TIPO_MODE_PERIOD_UF.xlsx (Normalizado para Uppercase no startWith)
                        if (file.toUpperCase().startsWith(`${tipo}_${mode}_`) && file.endsWith('.xlsx')) {
                            const parts = file.replace('.xlsx', '').split('_');
                            if (parts.length < 4) continue;

                            const uf = parts.pop()!;
                            const period = parts.slice(2).join('_');

                            const filePath = path.join(sitePath, file);
                            const fileStat = fs.statSync(filePath);

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
        if (destinationDir && fs.existsSync(destinationDir)) {
            try {
                const destDirs = fs.readdirSync(destinationDir);

                for (const subDir of destDirs) {
                    const subDirPath = path.join(destinationDir, subDir);
                    try {
                        const stats = fs.statSync(subDirPath);
                        if (!stats.isDirectory()) continue;

                        const files = fs.readdirSync(subDirPath);
                        for (const file of files) {
                            if (file.toUpperCase().startsWith(`${tipo}_${mode}_`) && file.endsWith('.xlsx')) {
                                const parts = file.replace('.xlsx', '').split('_');
                                if (parts.length < 4) continue;

                                const uf = parts.pop()!;
                                const period = parts.slice(2).join('_');

                                const filePath = path.join(subDirPath, file);
                                const fileStat = fs.statSync(filePath);

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

    /**
     * Tenta ler o metadata para obter a data de processamento original
     */
    private getSnapshotMeta(filePath: string): any {
        const metaPath = filePath.replace('_CURRENT_', '_META_').replace('_DELETED_', '_META_').replace('.xlsx', '.json');
        if (fs.existsSync(metaPath)) {
            try { return JSON.parse(fs.readFileSync(metaPath, 'utf8')); } catch { return null; }
        }
        return null;
    }

    /**
     * Remove registros duplicados mantendo apenas o registro vindo do snapshot mais recente (mtime)
     * Utiliza chaves primárias definidas no schemaMaps.json se disponíveis, caso contrário usa assinatura completa.
     */
    private removeDuplicates(data: any[], tipo: string, overridePKs?: string[]): any[] {
        const seen = new Set<string>();
        const metadataCols = ['PERIODO_ORIGINAL', 'ORIGEM_UF', 'ORIGEM_SITE', 'DATA_PROCESSAMENTO_ORIGINAL', 'ORIGEM_SNAPSHOT'];

        // Obtém chaves primárias: Prioridade 1 (Override da Execução) > Prioridade 2 (schemaMaps.json)
        const schema = configManager.getSchemaByType(tipo);
        const primaryKeys: string[] = overridePKs && overridePKs.length > 0 ? overridePKs : (schema?.primaryKey || []);

        if (primaryKeys.length > 0) {
            automationLogger.debug(`[Consolidator] Deduplicando ${tipo} usando chaves: ${primaryKeys.join(', ')}`);
        } else {
            automationLogger.debug(`[Consolidator] Deduplicando ${tipo} usando método completo (sem chaves definidas)`);
        }

        return data.filter(row => {
            let signature = "";

            if (primaryKeys.length > 0) {
                // Assinatura baseada nas chaves primárias
                signature = primaryKeys.map(k => {
                    const val = row[k];
                    return String(val ?? '').trim();
                }).join('::'); // Separador diferente para evitar colisão simples
            } else {
                // Fallback: Assinatura baseada em todos os dados factuais
                signature = Object.entries(row)
                    .filter(([k]) => !metadataCols.includes(k) && !k.startsWith('ssp_'))
                    .map(([_, v]) => String(v ?? '').trim())
                    .join('|');
            }

            if (seen.has(signature)) return false;
            seen.add(signature);
            return true;
        });
    }
}

export const consolidator = new Consolidator();
