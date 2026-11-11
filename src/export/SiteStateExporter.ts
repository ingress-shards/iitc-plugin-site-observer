import type { SiteState } from "@ingress-shards/ingress-events-core";
import { type ExportStrategy } from "./SiteDataExporter";

/**
 * Strategy for exporting the full SiteState JSON.
 */
export const SiteStateStrategy: ExportStrategy<SiteState> = {
    prefix: "site-state",

    getData: async (siteId, siteStateManager) => {
        try {
            const siteState = await siteStateManager.get(siteId);
            if (!siteState) {
                console.log(`[Site Observer: Site State Strategy] No data found for site ${siteId}`);
                return;
            }

            return siteState;
        } catch (error) {
            console.error(`[Site Observer: Site State Strategy] Failed to retrieve data for site ${siteId}:`, error);
            return;
        }
    },
};
