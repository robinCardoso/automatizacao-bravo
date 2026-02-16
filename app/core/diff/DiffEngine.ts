import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as XLSX from 'xlsx';
import { SnapshotIdentity } from '../../policy/snapshot/SnapshotContract';
import { resolveSnapshotFiles } from '../../policy/snapshot/FileNamingPolicy';
import { snapshotPath } from '../../policy/snapshot/SnapshotPaths';
import { SafeSnapshotPolicy } from '../../policy/snapshot/SafeSnapshotPolicy';
import { SnapshotMeta } from '../../policy/snapshot/SnapshotMeta';
import { validateSnapshotIdentity } from '../../policy/snapshot/SnapshotGate';
import { automationLogger } from '../../config/logger';
import { ExcelUtils } from '../utils/ExcelUtils';


export type DiffResult = {
  removed: number;
  added: number;
  currentRows: number;
  deletedFile: string;
  metaFile: string;
};

export class DiffEngine {
  private policy: SafeSnapshotPolicy;

  constructor() {
    // Carrega schemas do arquivo data/schemaMaps.json
    // Em produção (packaged), o 'data' está em resources/data via extraResources
    const basePath = app.isPackaged ? process.resourcesPath : process.cwd();
    const schemaPath = path.join(basePath, 'data', 'schemaMaps.json');

    try {
      if (fs.existsSync(schemaPath)) {
        const rawSchemas = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));
        this.policy = new SafeSnapshotPolicy(rawSchemas);
      } else {
        automationLogger.error(`[DiffEngine] Arquivo de schema não encontrado: ${schemaPath}`);
        // Fallback or throw to prevent silent failure usage
        throw new Error(`Schema file not found at ${schemaPath}`);
      }
    } catch (e: any) {
      automationLogger.error(`[DiffEngine] Erro ao carregar schemas: ${e.message}`);
      throw e;
    }
  }

  /**
   * Executa a comparação entre o novo download e o snapshot anterior
   * @param siteId Identificador do site
   * @param identity Identidade SSP
   * @param newDownloadPath Caminho do arquivo temporário recém baixado
   * @param customBase Caminho base customizado para os arquivos
   * @param customPrimaryKeys Colunas customizadas para comparação (opcional)
   */
  async run(siteId: string, identity: SnapshotIdentity, newDownloadPath: string, customBase?: string, customPrimaryKeys?: string[]): Promise<DiffResult> {
    automationLogger.info(`[DiffEngine] Analisando: ${identity.tipo} (${identity.period}_${identity.uf})`);

    const baseDir = customBase || snapshotPath(siteId, '');
    const files = resolveSnapshotFiles(baseDir, identity);
    const runId = `RUN-${Date.now()}`;

    if (!fs.existsSync(newDownloadPath)) {
      throw new Error(`Arquivo não encontrado para análise: ${newDownloadPath}`);
    }

    // 2. Carrega SchemaMap ou usa chaves customizadas
    let primaryKeys: string[] = [];
    if (customPrimaryKeys && customPrimaryKeys.length > 0) {
      primaryKeys = customPrimaryKeys;
      automationLogger.info(`[DiffEngine] Usando chaves primárias customizadas: ${primaryKeys.join(', ')}`);
    } else {
      const schema = this.policy.getSchema(identity.tipo);
      primaryKeys = schema.primaryKey;
    }

    // 3. Lê o novo download (NEXT)
    const nextWorkbook = XLSX.readFile(newDownloadPath);
    const nextSheet = nextWorkbook.Sheets[nextWorkbook.SheetNames[0]];
    const nextRows: any[] = ExcelUtils.safeSheetToJson(nextSheet, { defval: "" });

    if (nextRows.length === 0) {
      automationLogger.warn(`[DiffEngine] O arquivo baixado parece estar vazio.`);
    }

    // 4. Lê o CURRENT existente (PREV), se houver
    let prevRows: any[] = [];
    if (fs.existsSync(files.current)) {
      try {
        const prevWorkbook = XLSX.readFile(files.current);
        prevRows = ExcelUtils.safeSheetToJson(prevWorkbook.Sheets[prevWorkbook.SheetNames[0]], { defval: "" });
      } catch (e) {
        automationLogger.warn(`[DiffEngine] Falha ao ler arquivo anterior, tratando como nova execução.`);
      }
    }

    // 4.1 Log de períodos para auditoria (permite validar se remoções são do mesmo período)
    if (fs.existsSync(files.meta)) {
      try {
        const prevMeta = JSON.parse(fs.readFileSync(files.meta, 'utf-8'));
        const prevPeriod = prevMeta?.identity?.period ?? 'N/A';
        automationLogger.info(`[DiffEngine] Período snapshot anterior: ${prevPeriod}; Período novo run: ${identity.period}`);
      } catch {
        // ignora se META corrompido ou inexistente
      }
    }

    // 5. Gera assinaturas para detecção de diff (Melhoria: Case-Insensitive, índices e validação)
    const getActualKey = (row: any, targetKey: string) => {
      // Suporte para índice de coluna: "Col:3" ou "#3" retorna a 4ª coluna (índice 0-based + 1)
      if (targetKey.startsWith('Col:') || targetKey.startsWith('#')) {
        const colIndex = parseInt(targetKey.replace(/^(Col:|#)/, ''), 10);
        const keys = Object.keys(row);
        if (colIndex > 0 && colIndex <= keys.length) {
          return keys[colIndex - 1]; // Converte para 0-based
        }
        automationLogger.warn(`[DiffEngine] Índice de coluna inválido: ${targetKey}`);
        return targetKey;
      }

      // Suporte para nome.ocorrência: "id.1" retorna a 1ª ocorrência de "id", "id.2" a 2ª
      if (targetKey.includes('.')) {
        const [baseName, occurrence] = targetKey.split('.');
        const occurrenceNum = parseInt(occurrence, 10);
        if (!isNaN(occurrenceNum) && occurrenceNum > 0) {
          const keys = Object.keys(row);
          const matches = keys.filter(k => k.toLowerCase().trim() === baseName.toLowerCase().trim());
          if (matches.length >= occurrenceNum) {
            return matches[occurrenceNum - 1]; // 1-indexed para o usuário, 0-indexed internamente
          }
          automationLogger.warn(`[DiffEngine] Ocorrência ${occurrenceNum} de '${baseName}' não encontrada (total: ${matches.length})`);
        }
      }

      // Fallback: busca case-insensitive tradicional
      const keys = Object.keys(row);
      return keys.find(k => k.toLowerCase().trim() === targetKey.toLowerCase().trim()) || targetKey;
    };

    const buildSignature = (row: any) => {
      return primaryKeys.map(k => {
        const actualKey = getActualKey(row, k);
        const value = row[actualKey];
        if (value === undefined) {
          automationLogger.warn(`[DiffEngine] Coluna identificadora '${k}' não encontrada na linha! Verifique o Excel.`);
        }
        return String(value || '').trim();
      }).join('::');
    };

    const nextSignatures = nextRows.map(row => buildSignature(row));
    const nextSet = new Set(nextSignatures);

    const prevSignatures = prevRows.map(row => buildSignature(row));
    const prevSet = new Set(prevSignatures);

    // 6. Detecta Removidos e Adicionados
    const prevMap = new Map(prevRows.map(row => [buildSignature(row), row]));
    const removedSignatures = [...prevSet].filter(sig => !nextSet.has(sig));
    const removedRowsWithContext = removedSignatures.map(sig => {
      const originalRow = prevMap.get(sig);
      return {
        ...originalRow,
        ssp_signature: sig,
        ssp_removedAt: new Date().toISOString(),
        ssp_runId: runId
      };
    });

    const addedCount = [...nextSet].filter(sig => !prevSet.has(sig)).length;

    // 7. Gerencia o arquivo DELETED (acumulativo e contextual)
    let oldDeletedRows: any[] = [];
    if (fs.existsSync(files.deleted)) {
      try {
        const delWorkbook = XLSX.readFile(files.deleted);
        oldDeletedRows = XLSX.utils.sheet_to_json(delWorkbook.Sheets[delWorkbook.SheetNames[0]]);
      } catch (e) { }
    }

    const oldDeletedSigs = new Set(oldDeletedRows.map(row => row.ssp_signature));
    const newlyDeletedFiltered = removedRowsWithContext.filter(row => !oldDeletedSigs.has(row.ssp_signature));

    const totalDeletedRows = [...oldDeletedRows, ...newlyDeletedFiltered];

    if (totalDeletedRows.length > 0) {
      const delWs = XLSX.utils.json_to_sheet(totalDeletedRows);
      const delWb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(delWb, delWs, "Deletados_SSP");
      XLSX.writeFile(delWb, files.deleted);
    }

    // 8. Salva o novo CURRENT (Fazendo conversão de .xls para .xlsx se necessário)
    // Usamos XLSX.writeFile para garantir que o arquivo final seja um XLSX válido
    XLSX.writeFile(nextWorkbook, files.current);

    // 9. Gera META atualizado
    const meta: SnapshotMeta = {
      identity: {
        tipo: identity.tipo,
        period: identity.period,
        uf: identity.uf
      },
      lastUpdated: new Date().toISOString(),
      schemaVersion: "1.1 (Auto-Convert)",
      primaryKeyUsed: primaryKeys,
      rowCount: nextRows.length,
      checksum: this.calculateHash(files.current)
    };

    fs.writeFileSync(files.meta, JSON.stringify(meta, null, 2));

    return {
      removed: newlyDeletedFiltered.length,
      added: addedCount,
      currentRows: nextRows.length,
      deletedFile: files.deleted,
      metaFile: files.meta
    };
  }

  private calculateHash(filePath: string): string {
    const fileBuffer = fs.readFileSync(filePath);
    const hashSum = crypto.createHash('sha256');
    hashSum.update(fileBuffer);
    return hashSum.digest('hex');
  }
}

export const diffEngine = new DiffEngine();
