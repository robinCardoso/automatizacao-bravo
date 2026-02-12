export type ReportTipo = "VENDA" | "PEDIDO" | string;

export type PeriodKey =
  | "MONTH"
  | "QUARTER"
  | "YEAR"
  | string;

export interface SnapshotIdentity {
  tipo: ReportTipo;
  period: string; // ex: Q1_2025
  uf: string;     // ex: SC, RS, SP
}

export interface SnapshotFiles {
  current: string;
  deleted: string;
  meta: string;
}
