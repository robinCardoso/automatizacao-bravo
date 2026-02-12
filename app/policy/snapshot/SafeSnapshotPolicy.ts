import { SchemaMap } from "../../config/SchemaMap";

export class SafeSnapshotPolicy {
  constructor(
    private schemaMaps: Record<string, SchemaMap>
  ) {}

  getSchema(tipo: string): SchemaMap {
    const schema = this.schemaMaps[tipo];
    if (!schema) {
      throw new Error(
        `[SSP] SchemaMap não definido para tipo: ${tipo}`
      );
    }

    if (!schema.primaryKey || schema.primaryKey.length === 0) {
      throw new Error(
        `[SSP] primaryKey inválida para tipo: ${tipo}`
      );
    }

    return schema;
  }
}
