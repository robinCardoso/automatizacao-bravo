OBJETIVO

Implementar o motor central de comparação de snapshots:

O sistema deve comparar o arquivo CURRENT recém-baixado com o snapshot anterior do mesmo tipo/período/UF e gerar automaticamente:

Arquivo DELETED (linhas removidas)

Arquivo META (controle total)

Garantia SSP: nunca comparar coisas diferentes

✅ DEFINIÇÃO ABSOLUTA: IDENTIDADE SSP

Todo snapshot é identificado por:

SnapshotKey = {tipo} + {period} + {UF}


Exemplo:

VENDA + 1_TRIMESTRE_2025 + SC


Essa tríade é imutável.

✅ NAMING POLICY (OFICIAL)
Arquivo CURRENT
{tipo}_CURRENT_{period}_{UF}.xlsx


Exemplo:

VENDA_CURRENT_1_TRIMESTRE_2025_SC.xlsx

Arquivo DELETED
{tipo}_DELETED_{period}_{UF}.xlsx


Exemplo:

VENDA_DELETED_1_TRIMESTRE_2025_SC.xlsx

Arquivo META
{tipo}_META_{period}_{UF}.json


Exemplo:

VENDA_META_1_TRIMESTRE_2025_SC.json

✅ STORAGE STRUCTURE

O site não entra no nome.

Ele entra somente na pasta:

snapshots/{siteId}/


Exemplo real:

snapshots/bravo/
   VENDA_CURRENT_1_TRIMESTRE_2025_SC.xlsx
   VENDA_DELETED_1_TRIMESTRE_2025_SC.xlsx
   VENDA_META_1_TRIMESTRE_2025_SC.json

🧠 PRINCÍPIO SSP: SAFE SNAPSHOT GATE

O sistema nunca pode comparar snapshots diferentes.

Regra absoluta:

if (prev.tipo !== next.tipo) abort
if (prev.period !== next.period) abort
if (prev.uf !== next.uf) abort


Se falhar:

ERROR: SNAPSHOT_MISMATCH_ABORTED

✅ COMPONENTES OBRIGATÓRIOS
1. SnapshotIdentity.ts
export type SnapshotKey = {
  tipo: string;      // VENDA, PEDIDO...
  period: string;    // JAN2026, 1_TRIMESTRE_2025...
  uf: string;        // SC, RS, SP...
};

2. FileNamingPolicy.ts
export function buildSnapshotName(
  tipo: string,
  mode: "CURRENT" | "DELETED" | "META",
  period: string,
  uf: string
) {
  return `${tipo}_${mode}_${period}_${uf}`;
}

3. SnapshotPaths.ts
export function snapshotPath(siteId: string, file: string) {
  return `snapshots/${siteId}/${file}`;
}

✅ DIFF ENGINE — RESPONSABILIDADE

O Diff Engine deve:

Abrir o arquivo CURRENT recém baixado

Localizar o snapshot anterior válido

Normalizar linhas com SchemaMap

Gerar conjuntos determinísticos

Detectar removidos

Atualizar DELETED acumulativo

Atualizar META

✅ SCHEMAMAP FLEXÍVEL (CONFIGURÁVEL PELO USUÁRIO)

O usuário define no sistema quais colunas formam a identidade de cada tipo.

Arquivo:

/data/schemaMaps.json


Exemplo: Voce ja deixou configuravel pelo usuario

{
  "VENDA": ["ID", "PRODCOD", "NNF"],
  "PEDIDO": ["Doc", "Item", "ID"]
}

Regra obrigatória:

O Diff Engine nunca pode hardcode colunas.

Sempre usar SchemaMap:

const keys = schemaMaps[tipo];
if (!keys) throw new Error("SCHEMA_NOT_DEFINED");

✅ NORMALIZAÇÃO DE LINHA (ROW SIGNATURE)

Cada linha vira uma assinatura universal:

function buildRowSignature(row: any, schemaKeys: string[]) {
  return schemaKeys.map(k => String(row[k]).trim()).join("::");
}


Exemplo VENDA:

123::789::456


Exemplo PEDIDO:

DOC001::ITEM02::9911

✅ DIFF ALGORITHM (DETERMINÍSTICO)
Entrada

Previous CURRENT

New CURRENT

Saída

Removed Rows

Added Rows

Persistência correta

Implementação:
const prevSet = new Set(prevRows.map(sig));
const nextSet = new Set(nextRows.map(sig));

removed = [...prevSet].filter(x => !nextSet.has(x));
added   = [...nextSet].filter(x => !prevSet.has(x));

✅ ARQUIVO DELETED — ACUMULATIVO

O arquivo DELETED nunca é substituído.

Ele acumula histórico de remoções:

DELETED = DELETED_OLD + removed_now


Mas nunca duplica:

deletedSet = union(oldDeletedSet, removedNow)

✅ META FILE — CONTROLE TOTAL

Arquivo:

{tipo}_META_{period}_{UF}.json


Conteúdo obrigatório:

{
  "snapshotKey": {
    "tipo": "VENDA",
    "period": "1_TRIMESTRE_2025",
    "uf": "SC"
  },
  "lastRun": "2026-01-28T14:00:00Z",
  "currentRows": 9812,
  "removedRows": 10,
  "addedRows": 44,
  "schemaKeys": ["ID", "PRODCOD", "NNF"],
  "hash": "sha256...",
  "status": "OK"
}

✅ SnapshotGate发现错误时必须中止

Se tentar comparar:

VENDA vs PEDIDO

SC vs RS

JAN vs TRIMESTRE

Abortar:

throw new Error("SSP_ABORTED_SNAPSHOT_MISMATCH");

✅ IMPLEMENTAÇÃO DOS SERVIÇOS
DiffEngine.ts

Local:

src/core/diff/DiffEngine.ts


Interface:

class DiffEngine {
  async run(siteId: string, snapshotKey: SnapshotKey): Promise<DiffResult>
}

DiffResult obrigatório
type DiffResult = {
  removed: number;
  added: number;
  deletedFile: string;
  metaFile: string;
};

✅ EXECUTION FLOW (OBRIGATÓRIO)
Quando um download terminar:

Salvar CURRENT novo

Rodar DiffEngine

Atualizar DELETED

Atualizar META

Só então liberar ERP

✅ ERP OBSERVAÇÃO (IMPORTANTE)

O ERP deve observar:

CURRENT → dados ativos

DELETED → exclusões

O sistema nunca depende de "substituir arquivo".

Ele depende de:

snapshot determinístico

diff seguro

deletions explícitas

✅ CRITÉRIOS DE ACEITE (NÃO NEGOCIÁVEL)

O Diff Engine só está pronto quando:

✅ UF aparece sempre no nome
✅ Site nunca aparece no nome
✅ Comparação aborta se SnapshotKey divergir
✅ SchemaMap vem do usuário
✅ Removed detectado determinístico
✅ DELETED acumulativo sem duplicação
✅ META sempre atualizado
✅ Logs completos por execução