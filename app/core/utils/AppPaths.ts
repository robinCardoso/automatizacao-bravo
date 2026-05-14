import * as path from 'path';
import * as fs from 'fs';

type ElectronAppLike = {
    isPackaged?: boolean;
    getPath?: (name: string) => string;
};

function resolveElectronApp(): ElectronAppLike | null {
    try {
        // Evita dependência hard de 'electron' em contextos de worker empacotado.
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const electron = require('electron');
        return electron?.app ?? null;
    } catch {
        return null;
    }
}

export class AppPaths {
    /**
     * Retorna o caminho base para dados persistentes.
     * Em produção: %APPDATA%/Automatizador Bravo/
     * Em desenvolvimento: ./app/ (relativo ao CWD)
     */
    public static getBaseDataPath(): string {
        const app = resolveElectronApp();
        // Em worker_threads, `electron.app` pode não estar disponível.
        if (app && typeof app.getPath === 'function') {
            if (app.isPackaged) {
                return app.getPath('userData');
            }
            return path.join(process.cwd(), 'app');
        }

        // Fallback seguro para contextos sem `app` (ex.: worker thread).
        if (process.env.APPDATA) {
            return path.join(process.env.APPDATA, 'Automatizador Bravo');
        }
        return path.join(process.cwd(), 'app');
    }

    public static getConfigPath(): string {
        return path.join(this.getBaseDataPath(), 'config/app-config.json');
    }

    public static getLogsPath(): string {
        return path.join(this.getBaseDataPath(), 'logs');
    }

    public static getProfilesPath(): string {
        return path.join(this.getBaseDataPath(), 'storage/profiles');
    }

    public static getBrowsersPath(): string {
        // Browsers são pesados, melhor manter fora da pasta de config se possível, 
        // mas no Electron 'userData' é o padrão seguro.
        return path.join(this.getBaseDataPath(), 'storage/browsers');
    }

    public static getSnapshotsPath(): string {
        return path.join(this.getBaseDataPath(), 'snapshots');
    }

    public static getCatalogPath(): string {
        return path.join(this.getBaseDataPath(), 'storage/catalog.json');
    }

    /**
     * Garante que todas as pastas essenciais existam
     */
    public static ensureDirectories(): void {
        const dirs = [
            path.dirname(this.getConfigPath()),
            this.getLogsPath(),
            this.getProfilesPath(),
            this.getBrowsersPath(),
            this.getSnapshotsPath()
        ];

        dirs.forEach(dir => {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
        });
    }
}
