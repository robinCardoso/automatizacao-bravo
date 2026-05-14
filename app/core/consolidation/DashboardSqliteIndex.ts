import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import { AppPaths } from '../utils/AppPaths';
import { automationLogger } from '../../config/logger';

type DashboardOptions = { month?: string; year?: string; brand?: string; customer?: string; group?: string; subGroup?: string };

export class DashboardSqliteIndex {
  private db: Database.Database;

  constructor() {
    const dbDir = path.join(AppPaths.getBaseDataPath(), 'storage');
    if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
    const dbPath = path.join(dbDir, 'dashboard-cache.db');
    this.db = new Database(dbPath);
    this.ensureSchema();
  }

  private ensureSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS dashboard_snapshot (
        tipo TEXT NOT NULL,
        file_path TEXT NOT NULL,
        mtime REAL NOT NULL,
        row_count INTEGER NOT NULL,
        updated_at TEXT NOT NULL,
        max_process_date TEXT,
        PRIMARY KEY (tipo, file_path)
      );
      CREATE TABLE IF NOT EXISTS dashboard_row (
        tipo TEXT NOT NULL,
        file_path TEXT NOT NULL,
        row_month TEXT,
        value REAL NOT NULL,
        group_name TEXT,
        brand TEXT,
        customer TEXT,
        sub_group TEXT,
        uf TEXT,
        associado TEXT,
        tipo_operacao TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_dash_row_main ON dashboard_row(tipo, file_path, row_month);
      CREATE INDEX IF NOT EXISTS idx_dash_row_filters ON dashboard_row(tipo, file_path, brand, customer, group_name, sub_group);
    `);
  }

  isFresh(tipo: string, filePath: string, mtime: number): boolean {
    const row = this.db
      .prepare('SELECT mtime FROM dashboard_snapshot WHERE tipo = ? AND file_path = ?')
      .get(tipo, filePath) as { mtime: number } | undefined;
    return Boolean(row && row.mtime === mtime);
  }

  rebuild(tipo: string, filePath: string, mtime: number, rows: any[], mapping: any): void {
    const allKeys = rows.length > 0 ? Object.keys(rows[0]) : [];
    const getActualKey = (fieldName: string | undefined | null) => {
      if (!fieldName) return null;
      const lowerField = fieldName.toLowerCase();
      return allKeys.find(k => k.toLowerCase() === lowerField) || null;
    };

    const resolved = {
      date: getActualKey(mapping.date),
      value: getActualKey(mapping.value),
      group: getActualKey(mapping.group),
      subGroup: getActualKey(mapping.subGroup),
      brand: getActualKey('Marca'),
      customer: getActualKey('Cliente') || getActualKey('Cliente / Nome Fantasia') || getActualKey('Nome Fantasia'),
      tipoOperacao: getActualKey('Tipo Operação'),
      uf: getActualKey('UF') || getActualKey('Estado') || getActualKey('Situação Tributária') || getActualKey('UF_DESTINO'),
      associado: getActualKey('Associado') || getActualKey('Vendedor') || getActualKey('Cliente')
    };

    const tx = this.db.transaction(() => {
      this.db.prepare('DELETE FROM dashboard_row WHERE tipo = ? AND file_path = ?').run(tipo, filePath);
      const ins = this.db.prepare(`
        INSERT INTO dashboard_row (tipo, file_path, row_month, value, group_name, brand, customer, sub_group, uf, associado, tipo_operacao)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const row of rows) {
        const rowMonth = this.toMonth(this.read(row, resolved.date));
        const value = this.toNumber(this.read(row, resolved.value));
        ins.run(
          tipo,
          filePath,
          rowMonth,
          value,
          this.toText(this.read(row, resolved.group)),
          this.toText(this.read(row, resolved.brand)),
          this.toText(this.read(row, resolved.customer)),
          this.toText(this.read(row, resolved.subGroup)),
          this.toText(this.read(row, resolved.uf)),
          this.toText(this.read(row, resolved.associado)),
          this.toText(this.read(row, resolved.tipoOperacao))
        );
      }

      this.db
        .prepare(`
          INSERT INTO dashboard_snapshot (tipo, file_path, mtime, row_count, updated_at, max_process_date)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(tipo, file_path) DO UPDATE SET
            mtime = excluded.mtime,
            row_count = excluded.row_count,
            updated_at = excluded.updated_at,
            max_process_date = excluded.max_process_date
        `)
        .run(tipo, filePath, mtime, rows.length, new Date().toISOString(), this.getMaxProcessDate(rows, allKeys));
    });

    tx();
    automationLogger.info(`[DashboardSqliteIndex] Índice reconstruído para ${tipo}: ${rows.length} linhas`);
  }

  buildDashboard(tipo: string, filePath: string, options: DashboardOptions, mapping: any, lastUpdateIso: string) {
    const whereBase = ['tipo = ?', 'file_path = ?'];
    const params: any[] = [tipo, filePath];

    // VENDA: mantém comportamento de considerar vazio como venda.
    if (tipo === 'VENDA') {
      whereBase.push("(tipo_operacao IS NULL OR TRIM(tipo_operacao) = '' OR LOWER(TRIM(tipo_operacao)) = 'venda')");
    }

    if (options.brand) { whereBase.push('brand = ?'); params.push(options.brand); }
    if (options.customer) { whereBase.push('customer = ?'); params.push(options.customer); }
    if (options.group) { whereBase.push('group_name = ?'); params.push(options.group); }
    if (options.subGroup) { whereBase.push('sub_group = ?'); params.push(options.subGroup); }

    const baseWhereSql = `WHERE ${whereBase.join(' AND ')}`;

    const monthlyRows = this.db
      .prepare(`SELECT row_month, SUM(value) AS total_value, COUNT(*) AS total_records FROM dashboard_row ${baseWhereSql} GROUP BY row_month ORDER BY row_month`)
      .all(...params) as Array<{ row_month: string; total_value: number; total_records: number }>;

    const monthlyMap = new Map(monthlyRows.map(r => [r.row_month, { value: Number(r.total_value || 0), records: Number(r.total_records || 0) }]));
    const sortedMonths = monthlyRows.map(r => r.row_month).filter(Boolean);

    const isTarget = (m: string) => {
      if (!m) return false;
      if (options.month) return m === options.month;
      if (options.year) return m.startsWith(`${options.year}-`);
      return true;
    };

    let totalValue = 0;
    let totalRecords = 0;
    for (const [m, agg] of monthlyMap) {
      if (isTarget(m)) {
        totalValue += agg.value;
        totalRecords += agg.records;
      }
    }

    const prevMonth = options.month ? this.previousMonth(options.month) : '';
    let currentPeriodVal = 0;
    let prevPeriodVal = 0;
    let currentPeriodRec = 0;
    let prevPeriodRec = 0;

    if (options.month) {
      const c = monthlyMap.get(options.month);
      const p = prevMonth ? monthlyMap.get(prevMonth) : undefined;
      currentPeriodVal = c?.value || 0; currentPeriodRec = c?.records || 0;
      prevPeriodVal = p?.value || 0; prevPeriodRec = p?.records || 0;
    } else if (options.year) {
      const selectedYear = Number(options.year);
      const prevYear = selectedYear - 1;
      for (const [m, agg] of monthlyMap) {
        const y = Number((m || '').split('-')[0]);
        if (y === selectedYear) { currentPeriodVal += agg.value; currentPeriodRec += agg.records; }
        if (y === prevYear) { prevPeriodVal += agg.value; prevPeriodRec += agg.records; }
      }
    } else if (sortedMonths.length >= 2) {
      const last = sortedMonths[sortedMonths.length - 1];
      const penult = sortedMonths[sortedMonths.length - 2];
      currentPeriodVal = monthlyMap.get(last)?.value || 0;
      currentPeriodRec = monthlyMap.get(last)?.records || 0;
      prevPeriodVal = monthlyMap.get(penult)?.value || 0;
      prevPeriodRec = monthlyMap.get(penult)?.records || 0;
    }

    const valueGrowth = prevPeriodVal > 0 ? ((currentPeriodVal - prevPeriodVal) / prevPeriodVal) * 100 : 0;
    const recordGrowth = prevPeriodRec > 0 ? ((currentPeriodRec - prevPeriodRec) / prevPeriodRec) * 100 : 0;

    const chartsByDate = monthlyRows
      .filter(r => isTarget(r.row_month))
      .map(r => ({ label: r.row_month, value: Number(r.total_value || 0) }));

    const chartsByGroup = this.aggregateChart(baseWhereSql, params, 'group_name', options).slice(0, 999);
    const chartsByBrand = this.aggregateChart(baseWhereSql, params, 'brand', options).slice(0, 20);
    const chartsByUF = this.aggregateChart(baseWhereSql, params, 'uf', options).slice(0, 20);
    const chartsByAssociado = this.aggregateChart(baseWhereSql, params, 'associado', options).slice(0, 20);

    const availableMonths = this.db
      .prepare(`SELECT DISTINCT row_month FROM dashboard_row WHERE tipo = ? AND file_path = ? AND row_month IS NOT NULL AND row_month <> '' ORDER BY row_month DESC`)
      .all(tipo, filePath)
      .map((r: any) => r.row_month);

    const availableFilters = {
      brands: this.distinctValues(tipo, filePath, 'brand'),
      customers: this.distinctValues(tipo, filePath, 'customer'),
      groups: this.distinctValues(tipo, filePath, 'group_name'),
      subGroups: this.distinctValues(tipo, filePath, 'sub_group')
    };

    // Busca a data real de processamento se disponível no snapshot
    const snapshot = this.db
      .prepare('SELECT max_process_date FROM dashboard_snapshot WHERE tipo = ? AND file_path = ?')
      .get(tipo, filePath) as { max_process_date: string } | undefined;

    return {
      type: tipo,
      summary: {
        totalValue,
        totalRecords,
        lastUpdate: snapshot?.max_process_date || lastUpdateIso,
        valueGrowth,
        recordGrowth
      },
      charts: {
        byDate: chartsByDate,
        byGroup: chartsByGroup,
        byCategory: chartsByGroup.slice(0, 15),
        byBrand: chartsByBrand,
        byUF: chartsByUF,
        byAssociado: chartsByAssociado
      },
      availableMonths,
      availableFilters,
      mappingUsed: mapping,
      sourceFile: filePath,
      unknownRefs: []
    };
  }

  private aggregateChart(baseWhereSql: string, params: any[], field: string, options: DashboardOptions) {
    const clauses = [baseWhereSql];
    const localParams = [...params];
    if (options.month) { clauses.push('AND row_month = ?'); localParams.push(options.month); }
    else if (options.year) { clauses.push('AND row_month LIKE ?'); localParams.push(`${options.year}-%`); }
    const sql = `
      SELECT ${field} AS label, SUM(value) AS value
      FROM dashboard_row
      ${clauses.join(' ')}
      AND ${field} IS NOT NULL AND TRIM(${field}) <> ''
      GROUP BY ${field}
      ORDER BY value DESC
    `;
    return this.db.prepare(sql).all(...localParams).map((r: any) => ({ label: String(r.label), value: Number(r.value || 0) }));
  }

  private distinctValues(tipo: string, filePath: string, field: string): string[] {
    const rows = this.db
      .prepare(`SELECT DISTINCT ${field} AS value FROM dashboard_row WHERE tipo = ? AND file_path = ? AND ${field} IS NOT NULL AND TRIM(${field}) <> '' ORDER BY ${field}`)
      .all(tipo, filePath);
    return rows.map((r: any) => String(r.value));
  }

  private read(row: any, key: string | null) {
    if (!key) return undefined;
    return row[key];
  }
  private toText(v: any): string | null {
    if (v === undefined || v === null) return null;
    const s = String(v).trim();
    return s === '' ? null : s;
  }
  private toNumber(v: any): number {
    if (typeof v === 'number') return v;
    if (v === undefined || v === null) return 0;
    const strVal = String(v).trim();
    const hasComma = strVal.includes(',');
    const hasDot = strVal.includes('.');
    let cleanVal = strVal;
    if (hasComma && hasDot) cleanVal = strVal.lastIndexOf(',') > strVal.lastIndexOf('.') ? strVal.replace(/\./g, '').replace(',', '.') : strVal.replace(/,/g, '');
    else if (hasComma) cleanVal = strVal.replace(',', '.');
    cleanVal = cleanVal.replace(/[^\d.-]/g, '');
    return parseFloat(cleanVal) || 0;
  }
  private toMonth(rawDate: any): string {
    if (!rawDate) return '';
    let d: Date | null = null;
    if (rawDate instanceof Date) d = rawDate;
    else if (typeof rawDate === 'number') d = new Date((rawDate - 25569) * 86400 * 1000);
    else {
      const s = String(rawDate);
      if (s.includes('-')) {
        const p = s.split('-');
        d = new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt((p[2] || '').substring(0, 2), 10));
      } else if (s.includes('/')) {
        const p = s.split('/');
        if (p.length === 3) d = new Date(parseInt(p[2], 10), parseInt(p[1], 10) - 1, parseInt(p[0], 10));
      }
    }
    if (!d || isNaN(d.getTime())) return '';
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }
  private previousMonth(month: string): string {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(y, m - 2, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  private getMaxProcessDate(rows: any[], allKeys: string[]): string | null {
    const key = allKeys.find(k => k.toLowerCase() === 'data_processamento_original');
    if (!key) return null;

    let maxDate: Date | null = null;
    for (const row of rows) {
      const val = row[key];
      if (!val) continue;
      
      let d: Date | null = null;
      if (val instanceof Date) d = val;
      else if (typeof val === 'number') d = new Date((val - 25569) * 86400 * 1000);
      else {
         const s = String(val);
         if (s.includes('-')) {
            const p = s.split('-');
            d = new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt((p[2] || '').substring(0, 2), 10));
         } else if (s.includes('/')) {
            const p = s.split('/');
            if (p.length === 3) d = new Date(parseInt(p[2], 10), parseInt(p[1], 10) - 1, parseInt(p[0], 10));
         }
      }

      if (d && !isNaN(d.getTime())) {
        if (!maxDate || d > maxDate) maxDate = d;
      }
    }

    return maxDate ? maxDate.toISOString() : null;
  }
}

export const dashboardSqliteIndex = new DashboardSqliteIndex();
