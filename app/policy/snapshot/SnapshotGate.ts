import { SnapshotIdentity } from "./SnapshotContract";
import { SnapshotMeta } from "./SnapshotMeta";

export function validateSnapshotIdentity(
  currentMeta: SnapshotMeta | null,
  newIdentity: SnapshotIdentity
) {
  if (!currentMeta) return;

  if (
    currentMeta.identity.tipo !== newIdentity.tipo ||
    currentMeta.identity.uf !== newIdentity.uf ||
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
