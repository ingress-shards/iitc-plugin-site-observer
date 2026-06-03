import type { SiteRecord } from "@ingress-shards/ingress-events-core";
import { type ExportStrategy } from "./DataExporter";

/**
 * Strategy for exporting the full SiteRecord JSON.
 */
export const SiteRecordStrategy: ExportStrategy<SiteRecord> = {
    prefix: "site-record",

    getData: async (siteId, siteDataManager) => {
        try {
            const siteRecord = await siteDataManager.get(siteId);
            if (!siteRecord) {
                console.log(`[Site Observer: Site Record Strategy] No data found for site ${siteId}`);
                return;
            }

            return siteRecord;
        } catch (error) {
            console.error(`[Site Observer: Site Record Strategy] Failed to retrieve data for site ${siteId}:`, error);
            return;
        }
    },
};
