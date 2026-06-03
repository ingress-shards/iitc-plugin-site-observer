import { zonedDateTimeISO } from "temporal-polyfill/fns/now";
import { getFields } from "temporal-polyfill/fns/zoneddatetime";
import { SiteRecordManager } from "../db/SiteRecordManager";

const pad = (num: number): string => num.toString().padStart(2, "0");

/**
 * Abstract base class for exporting site data.
 */
/**
 * Interface for data export strategies.
 */
export interface ExportStrategy<T> {
    /**
     * Filename prefix for the export.
     */
    readonly prefix: string;

    /**
     * Logic to retrieve and format the data for export.
     */
    getData(siteId: string, siteDataManager: SiteRecordManager): Promise<T | undefined>;
}

/**
 * Concrete class that orchestrates the export process using a provided strategy.
 */
export class DataExporter {
    constructor(private siteDataManager: SiteRecordManager) {}

    /**
     * Entry point for the export process.
     */
    public async run<T>(siteId: string, strategy: ExportStrategy<T>): Promise<void> {
        try {
            const data = await strategy.getData(siteId, this.siteDataManager);
            if (!data) return;

            const timestamp = this.getTimestamp();
            const filename = `${strategy.prefix}_${siteId}_${timestamp}.json`;

            this.triggerDownload(filename, data);
        } catch (error) {
            console.error(`[Site Observer: Data Exporter] Failed to run export for site ${siteId}:`, error);
        }
    }

    /**
     * Generate a timestamp string in the format YYYY.MM.DD.HH.mm.ss
     */
    private getTimestamp(): string {
        const now = zonedDateTimeISO();
        const fields = getFields(now);
        return `${fields.year}.${pad(fields.month)}.${pad(fields.day)}.${pad(fields.hour)}.${pad(fields.minute)}.${pad(fields.second)}`;
    }

    /**
     * Trigger a browser download for the provided JSON data.
     */
    private triggerDownload<T>(filename: string, data: T): void {
        const json = JSON.stringify(data, undefined, 2);
        const blob = new Blob([json], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
}
