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

// Import code after mock
import { DiffEngine } from '../app/core/diff/DiffEngine';
import { consolidator } from '../app/core/consolidation/Consolidator';
import { SnapshotIdentity } from '../app/policy/snapshot/SnapshotContract';
import { resolveSnapshotFiles } from '../app/policy/snapshot/FileNamingPolicy';

async function runTextColumnsFixTest() {
    console.log('Iniciando teste de validação das colunas como TEXTO...');

    const testDir = path.join(__dirname, '../temp_test_text_columns');
    if (fs.existsSync(testDir)) {
        fs.rmSync(testDir, { recursive: true, force: true });
    }
    fs.mkdirSync(testDir, { recursive: true });

    // 1. Testa o fluxo de VENDA (Coluna Referencia)
    console.log('\n--- Testando tipo VENDA (Referência) ---');
    const vendaIdentity: SnapshotIdentity = {
        tipo: 'VENDA',
        period: 'AGO2026',
        uf: 'SP'
    };

    // Dados de teste para VENDA - Referencia com zero à esquerda
    const prevVendaRows = [
        { ID: '1', PRODCOD: '101', NNF: '901', DataE: '2026-08-01', Referencia: 100200, "Total Liq": 150.50 }
    ];
    const nextVendaRows = [
        { ID: '1', PRODCOD: '101', NNF: '901', DataE: '2026-08-01', Referencia: 100200, "Total Liq": 150.50 }, // Existente
        { ID: '2', PRODCOD: '102', NNF: '902', DataE: '2026-08-02', Referencia: '003004', "Total Liq": 250.00 }  // Novo com zero à esquerda
    ];

    const prevVendaPath = path.join(testDir, 'venda_prev.xlsx');
    const nextVendaPath = path.join(testDir, 'venda_next.xlsx');

    const wbPrevVenda = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wbPrevVenda, XLSX.utils.json_to_sheet(prevVendaRows), 'Sheet1');
    XLSX.writeFile(wbPrevVenda, prevVendaPath);

    const wbNextVenda = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wbNextVenda, XLSX.utils.json_to_sheet(nextVendaRows), 'Sheet1');
    XLSX.writeFile(wbNextVenda, nextVendaPath);

    // Configura o DiffEngine
    const diffEngine = new DiffEngine();

    // Copia o prevVendaPath para o local esperado de snapshot para simular execução anterior
    const vendaFiles = resolveSnapshotFiles(testDir, vendaIdentity);
    fs.copyFileSync(prevVendaPath, vendaFiles.current);

    // Executa DiffEngine para gerar novo CURRENT e DELETED
    console.log('Rodando DiffEngine para VENDA...');
    await diffEngine.run('site_test_venda', vendaIdentity, nextVendaPath, testDir);

    // Valida se o snapshot gerado tem o campo Referencia como texto
    const vendaCurrentWb = XLSX.readFile(vendaFiles.current);
    const vendaCurrentWs = vendaCurrentWb.Sheets[vendaCurrentWb.SheetNames[0]];
    validateColumnIsText(vendaCurrentWs, 'Referencia');

    // 2. Testa o fluxo de PEDIDO (Coluna Ref)
    console.log('\n--- Testando tipo PEDIDO (Ref) ---');
    const pedidoIdentity: SnapshotIdentity = {
        tipo: 'PEDIDO',
        period: 'AGO2026',
        uf: 'RJ'
    };

    const prevPedidoRows = [
        { "Doc Item": '10', Doc: '5001', "Data Proc": '2026-08-01', Ref: 99990001, "Total Liq R$": 1200.00 }
    ];
    const nextPedidoRows = [
        { "Doc Item": '10', Doc: '5001', "Data Proc": '2026-08-01', Ref: 99990001, "Total Liq R$": 1200.00 },
        { "Doc Item": '20', Doc: '5002', "Data Proc": '2026-08-02', Ref: '00008888', "Total Liq R$": 3400.00 } // com zero à esquerda
    ];

    const prevPedidoPath = path.join(testDir, 'pedido_prev.xlsx');
    const nextPedidoPath = path.join(testDir, 'pedido_next.xlsx');

    const wbPrevPedido = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wbPrevPedido, XLSX.utils.json_to_sheet(prevPedidoRows), 'Sheet1');
    XLSX.writeFile(wbPrevPedido, prevPedidoPath);

    const wbNextPedido = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wbNextPedido, XLSX.utils.json_to_sheet(nextPedidoRows), 'Sheet1');
    XLSX.writeFile(wbNextPedido, nextPedidoPath);

    const pedidoFiles = resolveSnapshotFiles(testDir, pedidoIdentity);
    fs.copyFileSync(prevPedidoPath, pedidoFiles.current);

    console.log('Rodando DiffEngine para PEDIDO...');
    await diffEngine.run('site_test_pedido', pedidoIdentity, nextPedidoPath, testDir);

    const pedidoCurrentWb = XLSX.readFile(pedidoFiles.current);
    const pedidoCurrentWs = pedidoCurrentWb.Sheets[pedidoCurrentWb.SheetNames[0]];
    validateColumnIsText(pedidoCurrentWs, 'Ref');


    // 3. Testa a Consolidação Master
    console.log('\n--- Testando Consolidador Master ---');
    // Para consolidar, o Consolidator procura os arquivos na pasta temporária usando findAllSnapshots
    // Vamos garantir que ele encontre o VENDA_AGO2026_SP.xlsx e PEDIDO_AGO2026_RJ.xlsx
    // O Consolidator busca na pasta AppPaths.getSnapshotsPath() e também no destinationDir de destino.
    // Vamos consolidar vendas na pasta de teste
    console.log('Rodando Consolidator para Vendas...');
    const consolVendaResult = await consolidator.consolidate(
        [{ siteId: 'site_test_venda', siteName: 'Site Test Venda', sspResult: { primaryKeys: ['ID', 'PRODCOD', 'NNF', 'DataE', 'Referencia'] } }],
        testDir,
        'VENDA'
    );

    if (consolVendaResult.current) {
        console.log(`Arquivo Master de Vendas gerado em: ${consolVendaResult.current}`);
        const masterVendaWb = XLSX.readFile(consolVendaResult.current);
        const masterVendaWs = masterVendaWb.Sheets[masterVendaWb.SheetNames[0]];
        validateColumnIsText(masterVendaWs, 'Referencia');
    } else {
        throw new Error('Falha ao gerar o arquivo master de Vendas');
    }

    console.log('Rodando Consolidator para Pedidos...');
    const consolPedidoResult = await consolidator.consolidate(
        [{ siteId: 'site_test_pedido', siteName: 'Site Test Pedido', sspResult: { primaryKeys: ['Doc Item', 'Doc', 'Data Proc', 'Ref'] } }],
        testDir,
        'PEDIDO'
    );

    if (consolPedidoResult.current) {
        console.log(`Arquivo Master de Pedidos gerado em: ${consolPedidoResult.current}`);
        const masterPedidoWb = XLSX.readFile(consolPedidoResult.current);
        const masterPedidoWs = masterPedidoWb.Sheets[masterPedidoWb.SheetNames[0]];
        validateColumnIsText(masterPedidoWs, 'Ref');
    } else {
        throw new Error('Falha ao gerar o arquivo master de Pedidos');
    }

    console.log('\n=========================================');
    console.log('✅ TODOS OS TESTES PASSARAM COM SUCESSO!');
    console.log('=========================================');

    // Limpeza
    try {
        fs.rmSync(testDir, { recursive: true, force: true });
    } catch (e) {}
}

function validateColumnIsText(sheet: XLSX.WorkSheet, columnName: string) {
    if (!sheet || !sheet['!ref']) throw new Error('Planilha vazia ou sem referência!');
    const range = XLSX.utils.decode_range(sheet['!ref']);
    
    let colIdx = -1;
    // Encontra coluna do cabeçalho
    for (let c = range.s.c; c <= range.e.c; c++) {
        const cell = sheet[XLSX.utils.encode_cell({ r: range.s.r, c })];
        if (cell && String(cell.v).toLowerCase().trim() === columnName.toLowerCase().trim()) {
            colIdx = c;
            break;
        }
    }

    if (colIdx === -1) {
        throw new Error(`Coluna ${columnName} não encontrada na planilha!`);
    }

    console.log(`Validando coluna "${columnName}" (Índice: ${colIdx})...`);

    // Valida todas as células abaixo do cabeçalho
    for (let r = range.s.r + 1; r <= range.e.r; r++) {
        const cellRef = XLSX.utils.encode_cell({ r, c: colIdx });
        const cell = sheet[cellRef];
        if (cell) {
            // Se a célula existe, tipo DEVE ser 's' (string)
            if (cell.t !== 's') {
                throw new Error(`ERRO: Célula ${cellRef} possui tipo '${cell.t}' em vez de 's' (string)! Valor: ${cell.v}`);
            }
            console.log(`- Célula ${cellRef} OK (Tipo: 's', Valor: "${cell.v}")`);
        }
    }
}

runTextColumnsFixTest().catch(err => {
    console.error('❌ O TESTE FALHOU:', err);
    process.exit(1);
});
