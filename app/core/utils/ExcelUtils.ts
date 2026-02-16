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
        return XLSX.utils.sheet_to_json(sheet, { ...options, range: headerRow });
    }
}
