import { zonedDateTimeISO } from "temporal-polyfill/fns/Now";
import { getEpochSeconds } from "@ingress-shards/ingress-events-core";
import type {
    SiteTargetPortals,
    ObservedTargetPortalCapture,
    ObservedTargetArtifact,
    TargetHistoryEntry,
} from "@ingress-shards/ingress-events-core";
import { type ExportStrategy } from "./SiteDataExporter";

/**
 * Strategy for exporting SiteTargetPortals JSON.
 */
export const SiteTargetPortalStrategy: ExportStrategy<SiteTargetPortals> = {
    prefix: "target-portals",

    getData: async (siteId, siteRecordManager) => {
        try {
            const siteRecord = await siteRecordManager.get(siteId);
            if (!siteRecord?.observations) {
                console.log(`[Site Observer: Site Target Portal Strategy] No discovery data found for site ${siteId}`);
                return;
            }

            const portals = Object.values(siteRecord.observations.portals ?? {});
            const targetPortals = portals.filter((p) => p.history?.some((h) => h.type === "target"));

            if (targetPortals.length === 0) {
                console.log(`[Site Observer: Site Target Portal Strategy] No target portals found for site ${siteId}`);
                return;
            }

            const resistanceTargets: ObservedTargetPortalCapture[] = [];
            const enlightenedTargets: ObservedTargetPortalCapture[] = [];

            for (const p of targetPortals) {
                const targetHistory = (p.history ?? []).filter((h): h is TargetHistoryEntry => h.type === "target");
                for (const h of targetHistory) {
                    const targetPortal: ObservedTargetPortalCapture = {
                        portalInfo: {
                            title: p.title,
                            latE6: p.latE6,
                            lngE6: p.lngE6,
                        },
                        targetAlignment: h.ornId === "targetres" ? "RESISTANCE" : "ENLIGHTENED",
                        observedAt: h.timestamp,
                    };

                    if (h.ornId === "targetres") {
                        resistanceTargets.push(targetPortal);
                    } else if (h.ornId === "targetenl") {
                        enlightenedTargets.push(targetPortal);
                    }
                }
            }

            const artifacts: ObservedTargetArtifact[] = [];

            if (resistanceTargets.length > 0) {
                artifacts.push({
                    id: "targetres",
                    name: "Target RES",
                    target: resistanceTargets,
                });
            }

            if (enlightenedTargets.length > 0) {
                artifacts.push({
                    id: "targetenl",
                    name: "Target ENL",
                    target: enlightenedTargets,
                });
            }

            const result: SiteTargetPortals = {
                siteId,
                exportedAt: getEpochSeconds(zonedDateTimeISO()),
                artifact: artifacts,
            };

            return result;
        } catch (error) {
            console.error(
                `[Site Observer: Site Target Portal Strategy] Failed to retrieve data for site ${siteId}:`,
                error,
            );
            return;
        }
    },
};
