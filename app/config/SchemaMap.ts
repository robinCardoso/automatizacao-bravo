export interface SchemaMap {
  tipo: string;

  // Colunas que formam a chave única (triade)
  primaryKey: string[];

  // Coluna opcional de data
  dateField?: string;

  // Colunas relevantes para diff (opcional)
  compareFields?: string[];
}
