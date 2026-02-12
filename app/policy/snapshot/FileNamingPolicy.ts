import path from "path";
import { SnapshotIdentity } from "./SnapshotContract";

export function buildSnapshotName(
  tipo: string,
  mode: "CURRENT" | "DELETED" | "META",
  period: string,
  uf: string
) {
  const extension = mode === "META" ? "json" : "xlsx";
  return `${tipo}_${mode}_${period}_${uf}.${extension}`;
}

export function buildMasterSnapshotName(
  tipo: string,
  mode: "CURRENT" | "DELETED"
) {
  const suffix = mode === "DELETED" ? "_EXCLUIDOS" : "";
  return `CONSOLIDADO${suffix}_${tipo}_MASTER.xlsx`;
}

export function resolveSnapshotFiles(
  baseDir: string,
  identity: SnapshotIdentity
) {
  const { tipo, period, uf } = identity;

  return {
    current: path.join(baseDir, buildSnapshotName(tipo, "CURRENT", period, uf)),
    deleted: path.join(baseDir, buildSnapshotName(tipo, "DELETED", period, uf)),
    meta: path.join(baseDir, buildSnapshotName(tipo, "META", period, uf))
  };
}
