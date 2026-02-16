import * as fs from 'fs';
import * as path from 'path';
import { AppPaths } from '../utils/AppPaths';
import { automationLogger } from '../../config/logger';

export interface ProductInfo {
    brand?: string;
    group?: string;
    subGroup?: string;
    description?: string;
    lastUpdated: string;
}

export interface CatalogStore {
    [reference: string]: ProductInfo;
}

export class CatalogService {
    private catalog: CatalogStore = {};
    private filePath: string;
    private isDirty: boolean = false;

    constructor() {
        this.filePath = AppPaths.getCatalogPath();
        this.loadCatalog();
    }

    private loadCatalog() {
        try {
            if (fs.existsSync(this.filePath)) {
                const raw = fs.readFileSync(this.filePath, 'utf-8');
                this.catalog = JSON.parse(raw);
            } else {
                this.catalog = {};
            }
        } catch (error) {
            automationLogger.error(`[CatalogService] Error loading catalog: ${error}`);
            this.catalog = {};
        }
    }

    private saveCatalog() {
        if (!this.isDirty) return;
        try {
            const dir = path.dirname(this.filePath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(this.filePath, JSON.stringify(this.catalog, null, 2), 'utf-8');
            this.isDirty = false;
            automationLogger.info(`[CatalogService] Catalog saved with ${Object.keys(this.catalog).length} items.`);
        } catch (error) {
            automationLogger.error(`[CatalogService] Error saving catalog: ${error}`);
        }
    }

    /**
     * Updates the catalog based on Sales data.
     * Extracts Reference, Brand, Group from each row.
     */
    public async updateFromSales(salesData: any[]) {
        let updates = 0;
        const now = new Date().toISOString();

        // Common column names to look for
        const refKeys = ['Referencia', 'Ref', 'Cod. Produto', 'Produto'];
        const brandKeys = ['Marca', 'Brand', 'Fabricante'];
        const groupKeys = ['Grupo', 'Group', 'Categoria'];
        const subGroupKeys = ['Sub-Grupo', 'SubGrupo', 'Sub Grupo', 'SubCategory'];
        const descKeys = ['Descricao', 'Description', 'Nome Produto', 'Produto Nome'];

        const findValue = (row: any, keys: string[]) => {
            for (const k of keys) {
                // Case insensitive search
                const rowKey = Object.keys(row).find(rk => rk.toLowerCase() === k.toLowerCase());
                if (rowKey && row[rowKey]) return String(row[rowKey]).trim();
            }
            return null;
        };

        for (const row of salesData) {
            const ref = findValue(row, refKeys);
            if (!ref) continue;

            const brand = findValue(row, brandKeys);
            const group = findValue(row, groupKeys);
            const subGroup = findValue(row, subGroupKeys);
            const description = findValue(row, descKeys);

            // Only update if we have at least Brand or Group
            if (brand || group) {
                const existing = this.catalog[ref];

                // Logic: Upsert. If existing, update missing fields or overwrite if new data is "better"?
                // For now, we overwrite if we have values, assuming Sales data is authoritative and recent.

                const newValue: ProductInfo = {
                    brand: brand || existing?.brand,
                    group: group || existing?.group,
                    subGroup: subGroup || existing?.subGroup,
                    description: description || existing?.description,
                    lastUpdated: now
                };

                // Check if changed
                if (!existing ||
                    existing.brand !== newValue.brand ||
                    existing.group !== newValue.group ||
                    existing.subGroup !== newValue.subGroup) {

                    this.catalog[ref] = newValue;
                    this.isDirty = true;
                    updates++;
                }
            }
        }

        if (updates > 0) {
            automationLogger.info(`[CatalogService] Updated ${updates} products from Sales data.`);
            this.saveCatalog();
        }
    }

    /**
     * Retrieves product info for a given reference.
     */
    public getProduct(reference: string): ProductInfo | undefined {
        if (!reference) return undefined;
        return this.catalog[reference] || this.catalog[reference.trim()];
    }

    public getCatalogSize(): number {
        return Object.keys(this.catalog).length;
    }
}

export const catalogService = new CatalogService();
