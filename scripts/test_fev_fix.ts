
import * as path from 'path';
import * as fs from 'fs';
import * as XLSX from 'xlsx';

// Mock electron
const mockApp = {
    isPackaged: false,
    getPath: () => '/tmp',
};

// Mock the module before importing DiffEngine
const Module = require('module');
const originalRequire = Module.prototype.require;
Module.prototype.require = function (id: string) {
    if (id === 'electron') {
        return { app: mockApp };
    }
    return originalRequire.apply(this, arguments);
};

// Now import DiffEngine
// We need to use a relative path based on where this script is located (scripts/) to app/core/diff/DiffEngine.ts
// ../app/core/diff/DiffEngine.ts
import { DiffEngine } from '../app/core/diff/DiffEngine';
import { SnapshotIdentity } from '../app/policy/snapshot/SnapshotContract';

async function runTest() {
    console.log('Iniciando teste de validação da correção FEV...');

    // Setup directories
    const testDir = path.join(__dirname, '../temp_test_fev');
    if (!fs.existsSync(testDir)) {
        fs.mkdirSync(testDir, { recursive: true });
    }

    const identity: SnapshotIdentity = {
        tipo: 'VENDA', // Assuming 'VENDA' is a valid schema type in schemaMaps.json
        period: 'FEV2026',
        uf: 'SP'
    };

    // Mock schemaMaps.json if needed, or rely on the real one if it exists and VENDA is valid.
    // The DiffEngine constructor reads schemaMaps.json from process.cwd()/data/schemaMaps.json
    // checking if that exists
    const schemaPath = path.join(process.cwd(), 'data', 'schemaMaps.json');
    if (!fs.existsSync(schemaPath)) {
        console.error(`ERROR: schemaMaps.json not found at ${schemaPath}`);
        process.exit(1);
    }

    // Create dummy Excel files
    const prevRows = [
        { id: '1', prod: 'PROD-A', ref: 'FEV-REF-01', val: 100 },
        { id: '2', prod: 'PROD-B', ref: 'MAR-REF-02', val: 200 }
    ];
    const nextRows = [
        { id: '1', prod: 'PROD-A', ref: 'FEV-REF-01', val: 100 }, // Same row, should NOT be removed
        { id: '3', prod: 'PROD-C', ref: 'ABR-REF-03', val: 300 }  // New row
    ];

    // We need to know what the primary keys are for 'VENDA'. 
    // Let's assume we can pass customPrimaryKeys to run method to force usage of specific keys for testing.
    const customPrimaryKeys = ['id', 'ref'];

    const prevPath = path.join(testDir, 'prev.xlsx');
    const nextPath = path.join(testDir, 'next.xlsx');

    const wbPrev = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wbPrev, XLSX.utils.json_to_sheet(prevRows), 'Sheet1');
    XLSX.writeFile(wbPrev, prevPath);

    const wbNext = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wbNext, XLSX.utils.json_to_sheet(nextRows), 'Sheet1');
    XLSX.writeFile(wbNext, nextPath);

    // Initialize DiffEngine
    const engine = new DiffEngine();

    // Mock the file system state for DiffEngine to find 'prev' file
    // DiffEngine.run uses resolveSnapshotFiles to find paths.
    // We might need to override/mock resolveSnapshotFiles or just copy prevPath to where DiffEngine expects it.
    // But DiffEngine.run takes 'newDownloadPath'.
    // It looks for 'current' file using resolveSnapshotFiles(baseDir, identity).
    // basicDir defaults to snapshotPath(siteId, '') -> 'snapshots/{siteId}'

    // Let's use a custom base dir for testing to avoid messing with real snapshots
    const customBase = testDir;

    // We need to place 'prev.xlsx' where DiffEngine expects 'current.xlsx' to be.
    // resolveSnapshotFiles returns { current: path, ... }
    // We need to match the logic or just manually place it.
    // FileNamingPolicy: current -> {baseDir}/{tipo}_{period}_{uf}.xlsx (simplified assumption, need to check FileNamingPolicy later if this fails)
    // Actually, let's just look at what DiffEngine does.
    // It calls resolveSnapshotFiles.

    // Let's rely on the fact that we can pass 'customBase'.
    // And we need to know the expected filename for 'current'.
    // If we can't easily predict it, we might fail.
    // But wait, the previous row detection relies on `fs.existsSync(files.current)`.
    // `files` comes from `resolveSnapshotFiles(baseDir, identity)`.

    // Let's import resolveSnapshotFiles to see where it expects the file
    const { resolveSnapshotFiles } = require('../app/policy/snapshot/FileNamingPolicy');
    const expectedFiles = resolveSnapshotFiles(customBase, identity);

    // Move/Copy prev.xlsx to expectedFiles.current
    fs.copyFileSync(prevPath, expectedFiles.current);

    console.log(`Snapshot anterior simulado em: ${expectedFiles.current}`);

    // Run DiffEngine
    // run(siteId: string, identity: SnapshotIdentity, newDownloadPath: string, customBase?: string, customPrimaryKeys?: string[])
    const result = await engine.run('TEST-SITE', identity, nextPath, customBase, customPrimaryKeys);

    console.log('Resultado do DiffEngine:', result);

    // Verification
    let failed = false;

    // 1. Check removals
    // id:2 (MAR-REF-02) should be removed.
    // id:1 (FEV-REF-01) should NOT be removed.
    if (result.removed !== 1) {
        console.error(`ERRO: Esperado 1 removido, mas obteve ${result.removed}`);
        failed = true;
    }

    // Check the deleted file content
    if (result.deletedFile && fs.existsSync(result.deletedFile)) {
        const wbDel = XLSX.readFile(result.deletedFile);
        const delRows = XLSX.utils.sheet_to_json(wbDel.Sheets[wbDel.SheetNames[0]]) as any[];
        console.log('Linhas deletadas:', delRows);

        const fevRemoved = delRows.find((r: any) => r.id === '1');
        if (fevRemoved) {
            console.error('ERRO CRÍTICO: O registro com "FEV" (id:1) foi incorretamente removido!');
            failed = true;
        }

        const marRemoved = delRows.find((r: any) => r.id === '2');
        if (!marRemoved) {
            console.error('ERRO: O registro que deveria ser removido (id:2) não foi encontrado no arquivo de deletados.');
            failed = true;
        }
    } else {
        console.error('ERRO: Arquivo de deletados não foi gerado.');
        failed = true;
    }

    // 2. Check additions
    // id:3 (ABR-REF-03) should be added.
    if (result.added !== 1) {
        console.error(`ERRO: Esperado 1 adicionado, mas obteve ${result.added}`);
        failed = true;
    }

    // 3. Check current rows
    // Should have id:1 and id:3
    if (result.currentRows !== 2) {
        console.error(`ERRO: Esperado 2 linhas atuais, mas obteve ${result.currentRows}`);
        failed = true;
    }

    if (failed) {
        console.error('TESTE FALHOU');
        process.exit(1);
    } else {
        console.log('TESTE SUCESSO: A correção do bug FEV foi validada.');
    }
}

runTest().catch(err => {
    console.error('Erro na execução do teste:', err);
    process.exit(1);
});
