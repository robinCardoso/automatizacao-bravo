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
  /** Regras globais de filtro (estão na raiz do schemaMaps.json, não dentro de VENDA/PEDIDO) */
  private globalFilteringRules: any[] = [];

  constructor() {
    // Carrega schemas do arquivo data/schemaMaps.json
    // Em produção (packaged), o 'data' está em resources/data via extraResources
    const basePath = app.isPackaged ? process.resourcesPath : process.cwd();
    const schemaPath = path.join(basePath, 'data', 'schemaMaps.json');

    try {
      if (fs.existsSync(schemaPath)) {
        const rawSchemas = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));
        this.globalFilteringRules = Array.isArray((rawSchemas as any).filteringRules) ? (rawSchemas as any).filteringRules : [];
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
   * Helper p/ resolver nome da coluna (Case Insensitive ou por Índice)
   */
  private getActualKey(row: any, targetKey: string): string {
    // Suporte para índice de coluna: "Col:3" ou "#3" retorna a 4ª coluna (índice 0-based + 1)
    if (targetKey.startsWith('Col:') || targetKey.startsWith('#')) {
      const colIndex = parseInt(targetKey.replace(/^(Col:|#)/, ''), 10);
      const keys = Object.keys(row);
      if (colIndex > 0 && colIndex <= keys.length) {
        return keys[colIndex - 1]; // Converte para 0-based
      }
      return targetKey;
    }

    // Suporte para nome.ocorrência: "id.1" retorna a 1ª ocorrência de "id"
    if (targetKey.includes('.')) {
      const [baseName, occurrence] = targetKey.split('.');
      const occurrenceNum = parseInt(occurrence, 10);
      if (!isNaN(occurrenceNum) && occurrenceNum > 0) {
        const keys = Object.keys(row);
        const matches = keys.filter(k => k.toLowerCase().trim() === baseName.toLowerCase().trim());
        if (matches.length >= occurrenceNum) {
          return matches[occurrenceNum - 1];
        }
      }
    }

    // Fallback: busca case-insensitive tradicional
    const keys = Object.keys(row);
    return keys.find(k => k.toLowerCase().trim() === targetKey.toLowerCase().trim()) || targetKey;
  }

  /**
   * Aplica o mesmo pré-processamento (filteringRules + PK vazia) a um conjunto de linhas.
   * Usado em NEXT e em PREV para evitar falsas "remoções" (comparar só linhas válidas).
   */
  private applyPreprocessing(rows: any[], schema: any, primaryKeys: string[]): any[] {
    const filteringRules = (schema as any).filteringRules || this.globalFilteringRules || [];

    let result = rows;

    if (filteringRules.length > 0) {
      result = result.filter(row => {
        for (const rule of filteringRules) {
          const field = rule.field;
          const operator = rule.operator;
          const value = rule.value ? String(rule.value).toLowerCase().trim() : '';

          if (field === '*') {
            const rowValues = Object.values(row).map(v => String(v || '').toLowerCase().trim());
            if (operator === 'contains' && rowValues.some(v => v.includes(value))) return false;
            if (operator === 'equals' && rowValues.some(v => v === value)) return false;
          } else {
            const actualKey = this.getActualKey(row, field);
            const val = row[actualKey];
            const rowVal = val !== undefined && val !== null ? String(val).toLowerCase().trim() : '';

            if (operator === 'equals' && rowVal === value) return false;
            if (operator === 'contains' && rowVal.includes(value)) return false;
            if (operator === 'startsWith' && rowVal.startsWith(value)) return false;
            if (operator === 'endsWith' && rowVal.endsWith(value)) return false;
            if (operator === 'empty' && rowVal === '') return false;
            if (operator === 'notEmpty' && rowVal !== '') return false;
          }
        }
        return true;
      });
    }

    if (primaryKeys.length > 0) {
      result = result.filter(row => {
        return primaryKeys.some(k => {
          const actualKey = this.getActualKey(row, k);
          const val = row[actualKey];
          return val !== undefined && val !== null && String(val).trim() !== '';
        });
      });
    }

    return result;
  }

  /**
   * Normaliza datas para formato consistente YYYY-MM-DD (ou YYYY-MM-DDTHH:mm:ss se houver hora).
   * Data brasileira é sempre DD/MM/YYYY (não MM/DD/YYYY).
   * Aceita: DD/MM/YYYY, DD/MM/YYYY HH:mm:ss, DD-MM-YYYY, serial Excel.
   */
  private normalizeDate(dateStr: string | number): string {
    if (dateStr === undefined || dateStr === null) return '';
    const s = String(dateStr).trim();
    if (!s) return '';
    // Já está em ISO (só data ou com T)
    if (/^\d{4}-\d{2}-\d{2}(T|$)/.test(s)) return s.split('T')[0];
    // DD/MM/YYYY (Brasil) com ou sem hora (ex.: 24/02/2026 14:15:38)
    const ddmmyyyy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
    if (ddmmyyyy) {
      const [, day, month, year, h, min, sec] = ddmmyyyy;
      const d = parseInt(day, 10);
      const m = parseInt(month, 10) - 1;
      const y = parseInt(year, 10);
      if (m >= 0 && m <= 11 && d >= 1 && d <= 31) {
        const date = new Date(y, m, d);
        if (!isNaN(date.getTime())) {
          const datePart = date.toISOString().split('T')[0];
          if (h !== undefined && min !== undefined) {
            const hour = parseInt(h, 10);
            const minute = parseInt(min, 10);
            const second = sec !== undefined ? parseInt(sec, 10) : 0;
            return `${datePart}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`;
          }
          return datePart;
        }
      }
    }
    // DD-MM-YYYY (Brasil com hífen), com ou sem hora
    const ddmmyyyy2 = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
    if (ddmmyyyy2) {
      const [, day, month, year, h, min, sec] = ddmmyyyy2;
      const d = parseInt(day, 10);
      const m = parseInt(month, 10) - 1;
      const y = parseInt(year, 10);
      if (m >= 0 && m <= 11 && d >= 1 && d <= 31) {
        const date = new Date(y, m, d);
        if (!isNaN(date.getTime())) {
          const datePart = date.toISOString().split('T')[0];
          if (h !== undefined && min !== undefined) {
            const hour = parseInt(h, 10);
            const minute = parseInt(min, 10);
            const second = sec !== undefined ? parseInt(sec, 10) : 0;
            return `${datePart}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`;
          }
          return datePart;
        }
      }
    }
    // Serial do Excel (número de dias desde 1900-01-01)
    const serial = parseInt(s, 10);
    if (/^\d{4,5}$/.test(s) && !isNaN(serial)) {
      const date = new Date((serial - 25569) * 86400 * 1000);
      if (!isNaN(date.getTime())) return date.toISOString().split('T')[0];
    }
    return s;
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
    const schema = this.policy.getSchema(identity.tipo);
    let primaryKeys: string[] = [];

    if (customPrimaryKeys && customPrimaryKeys.length > 0) {
      primaryKeys = customPrimaryKeys;
      automationLogger.info(`[DiffEngine] Usando chaves primárias customizadas: ${primaryKeys.join(', ')}`);
    } else {
      primaryKeys = schema.primaryKey;
    }

    // 3. Lê o novo download (NEXT)
    const nextWorkbook = XLSX.readFile(newDownloadPath);
    const nextSheet = nextWorkbook.Sheets[nextWorkbook.SheetNames[0]];
    let nextRows: any[] = ExcelUtils.safeSheetToJson(nextSheet, { defval: "" });

    if (nextRows.length === 0) {
      automationLogger.warn(`[DiffEngine] O arquivo baixado parece estar vazio.`);
    }
    automationLogger.info(`[DiffEngine] Arquivo novo (bruto): ${nextRows.length} linhas.`);

    const nextLenBeforePre = nextRows.length;
    nextRows = this.applyPreprocessing(nextRows, schema, primaryKeys);
    if (nextRows.length < nextLenBeforePre) {
      automationLogger.info(`[DiffEngine] Pré-processamento NEXT: ${nextLenBeforePre} -> ${nextRows.length} linhas (Totalizadores/PK vazia excluídos).`);
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

    const prevLenBeforePre = prevRows.length;
    prevRows = this.applyPreprocessing(prevRows, schema, primaryKeys);
    if (prevRows.length < prevLenBeforePre) {
      automationLogger.info(`[DiffEngine] Pré-processamento PREV: ${prevLenBeforePre} -> ${prevRows.length} linhas (mesmo critério do NEXT para evitar falsas remoções).`);
    }

    // 3.1 Proteção: novo download vazio com CURRENT existente = não sobrescrever (evita marcar tudo como "removido")
    if (nextRows.length === 0 && prevRows.length > 0) {
      automationLogger.error(`[DiffEngine] ABORTADO: arquivo novo está vazio (0 linhas) mas já existe snapshot anterior com ${prevRows.length} linhas. Possível falha no download. CURRENT e DELETED não foram alterados.`);
      throw new Error(
        `Download vazio para ${identity.tipo} (${identity.period}_${identity.uf}). O arquivo baixado tem 0 linhas; o snapshot anterior tem ${prevRows.length}. Não foi aplicada nenhuma alteração para evitar remoções incorretas. Verifique o download ou o relatório na origem.`
      );
    }

    // 3.2 Proteção: novo arquivo com muito menos linhas que o anterior = possível download incompleto/erro na origem
    const MIN_NEW_PREV_RATIO = 0.3; // se novo tiver menos de 30% das linhas do anterior, rejeitar
    if (prevRows.length > 0 && nextRows.length > 0 && nextRows.length < prevRows.length * MIN_NEW_PREV_RATIO) {
      const ratio = (nextRows.length / prevRows.length * 100).toFixed(0);
      automationLogger.error(`[DiffEngine] ABORTADO: novo arquivo tem ${nextRows.length} linhas (${ratio}% do anterior: ${prevRows.length}). Possível download incompleto ou falha na origem. CURRENT não foi alterado.`);
      throw new Error(
        `Download suspeito para ${identity.tipo} (${identity.period}_${identity.uf}): novo tem ${nextRows.length} linhas vs ${prevRows.length} no anterior (${ratio}%). Para evitar perda de dados, a atualização foi recusada. Verifique o relatório na origem ou execute novamente.`
      );
    }

    // 4.1 Valida identidade do snapshot anterior e log de períodos
    if (fs.existsSync(files.meta)) {
      try {
        const prevMeta: SnapshotMeta = JSON.parse(fs.readFileSync(files.meta, 'utf-8'));
        validateSnapshotIdentity(prevMeta, identity);
        const prevPeriod = prevMeta?.identity?.period ?? 'N/A';
        automationLogger.info(`[DiffEngine] Período snapshot anterior: ${prevPeriod}; Período novo run: ${identity.period}`);
      } catch (e: any) {
        if (e?.message?.includes('Snapshot mismatch')) throw e;
        // ignora se META corrompido ou inexistente
      }
    }

    const buildSignature = (row: any) => {
      // Cria uma assinatura mais robusta que não é afetada por coincidências acidentais com nomes de meses
      // ou outras strings que possam aparecer em diferentes contextos
      return primaryKeys.map(k => {
        const actualKey = this.getActualKey(row, k);
        const value = row[actualKey];
        if (value === undefined) {
          // automationLogger.warn(`[DiffEngine] Coluna identificadora '${k}' não encontrada...`);
        }
        // Escapa caracteres especiais que poderiam interferir na assinatura
        // e adiciona delimitadores para garantir unicidade
        // Também normaliza datas para evitar problemas com diferentes formatos
        let normalizedValue = String(value || '').trim();
        
        // Normaliza datas para evitar inconsistências (ex: 05/02/2026 vs 5/2/2026)
        if (k.toLowerCase().includes('data') || k.toLowerCase().includes('dt')) {
          normalizedValue = this.normalizeDate(normalizedValue);
        }
        
        return `|${normalizedValue}|`;
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

    // 7.1 Backup do CURRENT antes de sobrescrever (origem inconstante: permite restauração se o novo estiver errado)
    const MAX_BACKUPS_PER_IDENTITY = 2;
    if (fs.existsSync(files.current) && prevRows.length > 0) {
      const backupDir = path.join(path.dirname(files.current), 'backups');
      if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
      const baseName = path.basename(files.current, '.xlsx');
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const backupPath = path.join(backupDir, `${baseName}_${timestamp}.xlsx`);
      try {
        fs.copyFileSync(files.current, backupPath);
        automationLogger.info(`[DiffEngine] Backup do CURRENT salvo em: ${backupPath}`);
        const backups = fs.readdirSync(backupDir)
          .filter(f => f.startsWith(baseName) && f.endsWith('.xlsx'))
          .map(f => ({ name: f, path: path.join(backupDir, f), mtime: fs.statSync(path.join(backupDir, f)).mtime.getTime() }))
          .sort((a, b) => b.mtime - a.mtime);
        while (backups.length > MAX_BACKUPS_PER_IDENTITY) {
          const toRemove = backups.pop()!;
          fs.unlinkSync(toRemove.path);
          automationLogger.debug(`[DiffEngine] Backup antigo removido: ${toRemove.name}`);
        }
      } catch (e: any) {
        automationLogger.warn(`[DiffEngine] Não foi possível criar backup: ${e.message}`);
      }
    }

    // 8. Salva o novo CURRENT (LIMPO e REGENERADO)
    // Ao invés de salvar o workbook original (que pode ter lixo), salvamos os dados filtrados
    const newWs = XLSX.utils.json_to_sheet(nextRows);
    const newWb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(newWb, newWs, "Current_SSP");
    XLSX.writeFile(newWb, files.current);

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
