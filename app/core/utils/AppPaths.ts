import { app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

export class AppPaths {
    /**
     * Retorna o caminho base para dados persistentes.
     * Em produção: %APPDATA%/Automatizador Bravo/
     * Em desenvolvimento: ./app/ (relativo ao CWD)
     */
    public static getBaseDataPath(): string {
        if (app.isPackaged) {
            return app.getPath('userData');
        }
        // Em desenvolvimento, mantemos na pasta do projeto para facilitar inspect
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
