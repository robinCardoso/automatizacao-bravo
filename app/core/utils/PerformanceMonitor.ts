import { automationLogger } from '../../config/logger';

export class PerformanceMonitor {
  private readonly startedAt: number;
  private readonly rssStartMB: number;

  constructor(private readonly label: string) {
    this.startedAt = Date.now();
    this.rssStartMB = this.getRssMB();
    automationLogger.info(`[Perf] START ${this.label} | rss=${this.rssStartMB}MB`);
  }

  done(extra: Record<string, unknown> = {}): void {
    const elapsedMs = Date.now() - this.startedAt;
    const rssEndMB = this.getRssMB();
    const rssDeltaMB = rssEndMB - this.rssStartMB;
    const details = Object.entries(extra)
      .map(([k, v]) => `${k}=${String(v)}`)
      .join(' ');
    automationLogger.info(
      `[Perf] END ${this.label} | elapsed=${elapsedMs}ms rss=${rssEndMB}MB delta=${rssDeltaMB}MB${details ? ` ${details}` : ''}`
    );
  }

  private getRssMB(): number {
    return Math.round(process.memoryUsage().rss / 1024 / 1024);
  }
}
