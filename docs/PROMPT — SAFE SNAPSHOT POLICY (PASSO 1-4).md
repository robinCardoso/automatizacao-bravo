Você é uma IA engenheira responsável por implementar a política oficial de snapshots do sistema:

SAFE SNAPSHOT POLICY (SSP)

Este sistema baixa relatórios ERP (VENDAS, PEDIDOS etc) em Excel, compara snapshots e gera:

CURRENT (estado atual)
DELETED (linhas removidas)
META (controle interno)

A política SSP garante:
consistência
idempotência
rastreabilidade
flexibilidade via SchemaMap

segurança contra períodos errados

Objetivo: criar a fundação obrigatória antes de qualquer Diff Engine.

Regras críticas:
Nenhuma coluna pode ser hardcoded
SchemaMap é definido pelo usuário via JSON
Se SchemaMap não existir → abortar execução
META impede comparar snapshots errados
Nomeação de arquivos deve ser determinística

Crie exatamente os arquivos abaixo:
src/policy/snapshot/SnapshotContract.ts
src/config/SchemaMap.ts
data/schemaMaps.json
src/policy/snapshot/SafeSnapshotPolicy.ts
src/policy/snapshot/FileNamingPolicy.ts
src/policy/snapshot/SnapshotMeta.ts
src/policy/snapshot/SnapshotGate.ts

🎯 OBJETIVO DO PASSO 1

Implementar o núcleo da política:

Snapshot Identity + SchemaMap + File Contract
Nenhum diff ou delete será permitido sem isso.

✅ 1. DEFINIR CONTRATO UNIVERSAL DE SNAPSHOT

Criar o arquivo:
src/policy/snapshot/SnapshotContract.ts

Implementar:

export type ReportTipo = "VENDA" | "PEDIDO" | string;

export type PeriodKey =
  | "MONTH"
  | "QUARTER"
  | "YEAR"
  | string;

export interface SnapshotIdentity {
  tipo: ReportTipo;
  site: string;
  period: string; // ex: Q1_2025_SC
}

export interface SnapshotFiles {
  current: string;
  deleted: string;
  meta: string;
}

✅ 2. SCHEMAMAP TOTALMENTE CONFIGURÁVEL PELO USUÁRIO

O sistema NÃO pode hardcodear colunas.

Criar:
src/config/SchemaMap.ts


Implementar:

export interface SchemaMap {
  tipo: string;

  // Colunas que formam a chave única (triade)
  primaryKey: string[];

  // Coluna opcional de data
  dateField?: string;

  // Colunas relevantes para diff (opcional)
  compareFields?: string[];
}

✅ 3. CONFIG DO USUÁRIO (UI → JSON)

O usuário define isso via interface Electron.

Arquivo:
data/schemaMaps.json


Exemplo:

{
  "VENDA": {
    "primaryKey": ["ID", "PRODCOD", "NNF"]
  },
  "PEDIDO": {
    "primaryKey": ["Doc", "Item", "ID"]
  }
}


Regra crítica:

se SchemaMap não existir → abortar execução

nunca tentar adivinhar colunas

✅ 4. SNAPSHOT POLICY MANAGER

Criar:

src/policy/snapshot/SafeSnapshotPolicy.ts


Implementar:

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

✅ 5. FILE NAMING POLICY (NUNCA MUDA)

Criar:

src/policy/snapshot/FileNamingPolicy.ts


Implementar:

import path from "path";
import { SnapshotIdentity } from "./SnapshotContract";

export function resolveSnapshotFiles(
  baseDir: string,
  identity: SnapshotIdentity
) {
  const prefix = `${identity.tipo}_${identity.site}_${identity.period}`;

  return {
    current: path.join(baseDir, `${prefix}_CURRENT.xlsx`),
    deleted: path.join(baseDir, `${prefix}_DELETED.xlsx`),
    meta: path.join(baseDir, `${prefix}_META.json`)
  };
}

✅ 6. META FILE É O "GUARDIÃO"

Criar modelo:

src/policy/snapshot/SnapshotMeta.ts


Implementar:

export interface SnapshotMeta {
  identity: {
    tipo: string;
    site: string;
    period: string;
  };

  lastUpdated: string;

  schemaVersion: string;

  primaryKeyUsed: string[];

  rowCount: number;

  checksum: string;
}


Regra:

Toda execução atualiza META

META impede comparar arquivos errados

✅ 7. VALIDATION GATE (NÃO PROSSEGUE SEM ISSO)

Criar:

src/policy/snapshot/SnapshotGate.ts


Implementar função:

export function validateSnapshotIdentity(
  currentMeta: SnapshotMeta | null,
  newIdentity: SnapshotIdentity
) {
  if (!currentMeta) return;

  if (
    currentMeta.identity.tipo !== newIdentity.tipo ||
    currentMeta.identity.site !== newIdentity.site ||
    currentMeta.identity.period !== newIdentity.period
  ) {
    throw new Error(`
[SSP] Snapshot mismatch detectado.

Arquivo existente pertence a:
${JSON.stringify(currentMeta.identity)}

Novo snapshot pertence a:
${JSON.stringify(newIdentity)}

Abortando para evitar corrupção.
`);
  }
}

✅ PASSO 1 TERMINA AQUI

Neste momento o sistema tem:

✅ Identidade forte de snapshot
✅ SchemaMap configurável por tipo
✅ Nomeação determinística
✅ META guardião
✅ Gate de validação contra períodos errados
✅ Nenhum diff roda sem schema válido