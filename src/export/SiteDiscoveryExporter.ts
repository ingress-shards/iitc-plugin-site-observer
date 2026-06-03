import { zonedDateTimeISO } from "temporal-polyfill/fns/now";
import { epochSeconds } from "temporal-polyfill/fns/zoneddatetime";
import type { SiteDiscovery, PortalDiscovery, PreEventHistoryEntry } from "@ingress-shards/ingress-events-core";
import { type ExportStrategy } from "./DataExporter";

/**
 * Strategy for exporting SiteDiscovery JSON (pre-event ornaments only).
 */
export const SiteDiscoveryStrategy: ExportStrategy<SiteDiscovery> = {
    prefix: "ornamented-portals",

    getData: async (siteId, siteDataManager) => {
        try {
            const siteRecord = await siteDataManager.get(siteId);
            if (!siteRecord?.observations) {
                console.log(`[Site Observer: Site Discovery Strategy] No discovery data found for site ${siteId}`);
                return;
            }

            const portals: PortalDiscovery[] = Object.values(siteRecord.observations.portals)
                .filter((p) => p.history.some((h) => h.type === "pre-event"))
                .map((p) => {
                    const preEventEntry = p.history.find((h): h is PreEventHistoryEntry => h.type === "pre-event")!;

                    return {
                        title: p.title,
                        lat: p.latE6 / 1e6,
                        lng: p.lngE6 / 1e6,
                        ornamentId: preEventEntry.ornId,
                    };
                });

            if (portals.length === 0) {
                console.log(`[Site Observer: Site Discovery Strategy] No pre-event ornaments found for site ${siteId}`);
                return;
            }

            const discovery: SiteDiscovery = {
                siteId,
                exportedAt: epochSeconds(zonedDateTimeISO()),
                portals,
            };

            return discovery;
        } catch (error) {
            console.error(
                `[Site Observer: Site Discovery Strategy] Failed to retrieve data for site ${siteId}:`,
                error,
            );
            return;
        }
    },
};
