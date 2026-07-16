import { epochMilliseconds } from "temporal-polyfill/fns/instant";
import { instant } from "temporal-polyfill/fns/now";
import type {
    Ornament,
    MapPortalCapture,
    MapSnapshot,
} from "@ingress-shards/ingress-events-core";

import { IntelObserver } from "./IntelObserver";
import { ObserverResult } from "../types/ObserverEvents";

interface IITCMapData {
    addHook: (name: string, callback: (data: any) => void) => void;
    portals: Record<string, { options: { data: MapPortalCapture } }>;
}

export class PreEventOrnamentObserver implements IntelObserver {
    private preEventOrnamentIds: string[];
    private isHooked = false;

    constructor(
        private blueprintOrnaments: Record<string, Ornament>,
    ) {
        this.preEventOrnamentIds = Object.entries(this.blueprintOrnaments)
            .filter(([_, data]) => data.tags.includes("pre-event"))
            .map(([id]) => id);
    }

    /**
     * Start the passive observation and run an initial viewport/cache scan.
     */
    observe(): void {
        console.log(`[Site Observer: Pre-Event Ornaments] Activating passive observation...`);
        this.setupPassiveHooks();
        this.scanAndSyncAll();
    }

    /**
     * Set up IITC hooks to catch map data updates.
     */
    private setupPassiveHooks(): void {
        if (this.isHooked) return;

        const win = window as unknown as IITCMapData;
        if (win.addHook) {
            win.addHook("mapDataRefreshEnd", () => {
                this.scanAndSyncAll();
            });
            this.isHooked = true;
        }
    }

    private scanAndSyncAll(): void {
        const win = window as unknown as IITCMapData;
        const portals = win.portals ?? {};
        const detectedPortals: MapPortalCapture[] = [];
        const totalPortals = Object.keys(portals).length;
        let portalsWithOrnaments = 0;

        console.log(`[Site Observer: Pre-Event Ornaments] Scanning viewport cache. Total portals: ${totalPortals}. Target pre-event ornament IDs: ${JSON.stringify(this.preEventOrnamentIds)}`);

        for (const [, portal] of Object.entries(portals)) {
            const portalData = portal.options?.data;
            if (!portalData?.ornaments || portalData.ornaments.length === 0) continue;

            portalsWithOrnaments++;
            const hasPreEventOrnament = portalData.ornaments.some((o: string) => this.preEventOrnamentIds.includes(o));
            
            if (hasPreEventOrnament) {
                detectedPortals.push({
                    guid: portalData.guid,
                    title: portalData.title,
                    latE6: portalData.latE6,
                    lngE6: portalData.lngE6,
                    ornaments: portalData.ornaments,
                });
            }
        }

        console.log(`[Site Observer: Pre-Event Ornaments] Viewport scan completed. Portals with ornaments: ${portalsWithOrnaments}. Matching portals found: ${detectedPortals.length}`);

        if (detectedPortals.length > 0) {
            const snapshot: MapSnapshot = {
                timestamp: epochMilliseconds(instant()),
                portals: detectedPortals,
            };

            console.log(`[Site Observer: Pre-Event Ornaments] Dispatched map snapshot with ${detectedPortals.length} portals.`);
            window.dispatchEvent(
                new CustomEvent<MapSnapshot>(ObserverResult.PRE_EVENT_ORNAMENTS_OBSERVED, {
                    detail: snapshot,
                }),
            );
        }
    }
}
