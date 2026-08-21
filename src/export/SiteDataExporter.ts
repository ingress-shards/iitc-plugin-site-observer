import { zonedDateTimeISO } from "temporal-polyfill/fns/Now";
import { SiteRecordManager } from "../db/SiteRecordManager";
import { formatTimestamp } from "@ingress-shards/ingress-events-core";

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
    getData(siteId: string, siteRecordManager: SiteRecordManager): Promise<T | undefined>;
}

interface AndroidBridge {
    saveFile?: (filename: string, mime: string, content: string) => void;
}

interface IITCWindow {
    android?: AndroidBridge;
}

/**
 * Concrete class that orchestrates the export process using a provided strategy.
 */
export class DataExporter {
    constructor(private siteRecordManager: SiteRecordManager) {}

    private getTimestamp(): string {
        return formatTimestamp(zonedDateTimeISO());
    }

    private triggerDownload<T>(filename: string, data: T): void {
        const json = JSON.stringify(data, undefined, 2);
        const win = window as unknown as IITCWindow;

        if (win.android && typeof win.android.saveFile === "function") {
            win.android.saveFile(filename, "application/json", json);
            return;
        }

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

    /**
     * Entry point for the export process.
     */
    public async run<T>(siteId: string, strategy: ExportStrategy<T>): Promise<void> {
        try {
            const data = await strategy.getData(siteId, this.siteRecordManager);
            if (!data) return;

            const timestamp = this.getTimestamp();
            const filename = `${strategy.prefix}_${siteId}_${timestamp}.json`;

            this.triggerDownload(filename, data);
        } catch (error) {
            console.error(`[Site Observer: Data Exporter] Failed to run export for site ${siteId}:`, error);
        }
    }
}
