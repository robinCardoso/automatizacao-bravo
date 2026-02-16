import * as XLSX from 'xlsx';

export class ExcelUtils {
    /**
     * Lê uma planilha pulando linhas vazias no início para encontrar o cabeçalho.
     * @param sheet A planilha do XLSX
     * @param options Opções do sheet_to_json
     */
    static safeSheetToJson(sheet: XLSX.WorkSheet, options: XLSX.Sheet2JSONOpts = {}): any[] {
        if (!sheet || !sheet['!ref']) return [];

        // Se o range já foi especificado, respeita
        if (options.range !== undefined) {
            return XLSX.utils.sheet_to_json(sheet, options);
        }

        const range = XLSX.utils.decode_range(sheet['!ref']);
        let headerRow = range.s.r;

        // Procura a primeira linha que contém algum dado
        for (let r = range.s.r; r <= range.e.r; r++) {
            let hasData = false;
            for (let c = range.s.c; c <= range.e.c; c++) {
                const cell = sheet[XLSX.utils.encode_cell({ r, c })];
                if (cell && cell.v !== undefined && cell.v !== null && String(cell.v).trim() !== "") {
                    hasData = true;
                    break;
                }
            }
            if (hasData) {
                headerRow = r;
                break;
            }
        }

        // Retorna o JSON começando da linha detectada
        // [MELHORIA] Inspeção da linha de cabeçalho encontrada
        // Se a linha detectada tiver apenas 1 coluna preenchida e a próxima tiver mais,
        // ou se as células parecerem dados (números/datas), pulamos.
        let potentialHeader = headerRow;

        try {
            // Verifica quantas células tem na linha detectada
            let cellsInRow = 0;
            let seemsLikeData = false;

            for (let c = range.s.c; c <= range.e.c; c++) {
                const cell = sheet[XLSX.utils.encode_cell({ r: potentialHeader, c })];
                if (cell && cell.v !== undefined && String(cell.v).trim() !== "") {
                    cellsInRow++;
                    // Se o cabeçalho for um número ou data, provavelmente não é cabeçalho
                    if (typeof cell.v === 'number' || cell.t === 'n' || cell.t === 'd') {
                        seemsLikeData = true;
                    }
                }
            }

            // Heurística:
            // 1. Se tem só 1 coluna preenchida, mas o arquivo é largo, deve ser Título.
            // 2. Se parece dado (número/data), deve ser a linha de dados e o cabeçalho tá em cima (ou não tem).
            //    Mas aqui estamos procurando o PRIMEIRO dado, então se achamos número, talvez não tenha cabeçalho? 
            //    Ou talvez o título seja um número (ex: "2024").
            // 3. Vamos olhar a PRÓXIMA linha. Se ela tiver MAIS colunas, ela é o cabeçalho real.

            if (potentialHeader < range.e.r) {
                let nextRowCells = 0;
                const nextRow = potentialHeader + 1;
                for (let c = range.s.c; c <= range.e.c; c++) {
                    const cell = sheet[XLSX.utils.encode_cell({ r: nextRow, c })];
                    if (cell && cell.v !== undefined && String(cell.v).trim() !== "") {
                        nextRowCells++;
                    }
                }

                if (nextRowCells > cellsInRow) {
                    // A próxima linha tem mais colunas, então a atual é provavelmente um Título
                    headerRow = nextRow;
                }
            }
        } catch (e) {
            // Falha silenciosa, usa o que achou
        }

        return XLSX.utils.sheet_to_json(sheet, { ...options, range: headerRow });
    }
}
