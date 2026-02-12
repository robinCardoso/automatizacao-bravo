import path from "path";
import { AppPaths } from "../../core/utils/AppPaths";

/**
 * SSP: Define a estrutura de pastas.
 * Se o usuário já definiu um caminho completo, usamos ele diretamente.
 */
export function snapshotPath(siteId: string, fileName: string, customBase?: string) {
  // Se houver customBase (definido no step ou preset), usa ele sem criar subpastas 'snapshots'
  const base = customBase || path.join(AppPaths.getSnapshotsPath(), siteId);
  return path.join(base, fileName);
}
