import { parentPort, workerData } from 'worker_threads';
import { dashboardService } from '../consolidation/DashboardService';
import { consolidator } from '../consolidation/Consolidator';

type DashboardPayload = {
  task: 'dashboard';
  type: string;
  destinationDir: string;
  options?: Record<string, any>;
};

type ConsolidationPayload = {
  task: 'consolidation';
  results: any[];
  destinationDir: string;
  tipoOverride?: string;
};

async function run(): Promise<void> {
  const payload = workerData as DashboardPayload | ConsolidationPayload;
  if (payload.task === 'dashboard') {
    const result = await dashboardService.getDashboardStats(payload.type, payload.destinationDir, payload.options || {});
    parentPort?.postMessage({ ok: true, result });
    return;
  }

  if (payload.task === 'consolidation') {
    const result = await consolidator.consolidate(payload.results || [], payload.destinationDir, payload.tipoOverride);
    parentPort?.postMessage({ ok: true, result });
    return;
  }

  parentPort?.postMessage({ ok: false, error: `Tarefa inválida: ${(payload as any)?.task}` });
}

run().catch((error: any) => {
  parentPort?.postMessage({ ok: false, error: error?.message || String(error) });
});
