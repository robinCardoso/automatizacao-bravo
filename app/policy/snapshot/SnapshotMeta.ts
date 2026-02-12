export interface SnapshotMeta {
  identity: {
    tipo: string;
    period: string;
    uf: string;
  };

  lastUpdated: string;

  schemaVersion: string;

  primaryKeyUsed: string[];

  rowCount: number;

  checksum: string;
}
