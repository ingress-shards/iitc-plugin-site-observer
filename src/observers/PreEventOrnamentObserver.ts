/**
 * PreEventOrnamentObserver handles the detection and storage of pre-event ornamented portals.
 */
import * as Instant from "temporal-polyfill/fns/instant";
import * as Now from "temporal-polyfill/fns/now";
import {
    isWithinSiteRange,
    type Ornament,
    type SeasonConfig,
    type SiteGeocode,
    Coordinates,
    MapPortalCapture,
    SiteObservation,
    Portal,
    PortalId,
    PreEventHistoryEntry,
} from "@ingress-shards/ingress-events-core";

import { IntelObserver } from "./IntelObserver";
import { ObserverEventInput, UITrigger } from "../types/ObserverEvents";
import { SiteRecordManager } from "../db/SiteRecordManager";

interface IITCMapData {
    addHook: (name: string, callback: (data: any) => void) => void;
    portals: Record<string, { options: { data: MapPortalCapture } }>;
}

export class PreEventOrnamentObserver implements IntelObserver<void> {
    private pendingScans = new Set<string>();
    private scanDebounceTimers = new Map<string, number>();
    private preEventOrnamentIds: string[];

    constructor(
        private blueprintOrnaments: Record<string, Ornament>,
        private seasonConfig: Record<string, SeasonConfig>,
        private dataManager: SiteRecordManager,
    ) {
        this.preEventOrnamentIds = Object.entries(this.blueprintOrnaments)
            .filter(([_, data]) => data.tags.includes("pre-event"))
            .map(([id]) => id);
        this.setupPassiveHooks();
    }

    /**
     * Triggered via UI or Scheduler when a site is to be observed.
     */
    async observe(input: ObserverEventInput<void>): Promise<void> {
        console.log(`[Site Observer: Pre-Event Ornaments] High-priority scan for site: ${input.siteId}`);
        await this.scanAndSync(input.siteId);
    }

    /**
     * Set up IITC hooks to catch new portals as they enter the map view.
     */
    private setupPassiveHooks(): void {
        const win = window as unknown as IITCMapData;
        if (win.addHook) {
            win.addHook("portalAdded", (data: { portal: any }) => {
                const portalData = data.portal?.options?.data;
                if (!portalData?.ornaments) return;

                const siteId = this.findSiteInRange({ latE6: portalData.latE6, lngE6: portalData.lngE6 });
                if (siteId) {
                    this.debouncedScan(siteId);
                }
            });
        }
    }

    private debouncedScan(siteId: string): void {
        if (this.pendingScans.has(siteId)) return;

        const existingTimer = this.scanDebounceTimers.get(siteId);
        if (existingTimer) {
            window.clearTimeout(existingTimer);
        }

        const newTimer = window.setTimeout(() => {
            this.scanDebounceTimers.delete(siteId);
            void this.scanAndSync(siteId);
        }, 500);

        this.scanDebounceTimers.set(siteId, newTimer);
    }

    private async scanAndSync(siteId: string): Promise<void> {
        if (this.pendingScans.has(siteId)) return;
        this.pendingScans.add(siteId);

        try {
            const site = this.getSiteConfig(siteId);
            if (!site) return;

            const detectedPortals = this.scanMapForSite(site.geocode);
            if (detectedPortals.length === 0) return;

            let existingRecord = await this.dataManager.get(siteId);
            existingRecord ??= {
                lastUpdated: Instant.epochSeconds(Now.instant()),
                metadata: {
                    geocode: site.geocode,
                    schedule: {},
                },
            };
            existingRecord.observations ??= {
                portals: {},
                shards: {},
            };

            const mergedObservations = this.mergeObservations(existingRecord.observations, detectedPortals);

            const hasPortalsChanged =
                Object.keys(mergedObservations.portals).length !==
                    Object.keys(existingRecord.observations.portals).length ||
                JSON.stringify(mergedObservations.portals) !== JSON.stringify(existingRecord.observations.portals);

            const hasShardsChanged =
                Object.keys(mergedObservations.shards).length !==
                Object.keys(existingRecord.observations.shards).length;

            if (hasPortalsChanged || hasShardsChanged) {
                console.log(`[Site Observer: Pre-Event Ornaments] Updating site: ${siteId}`);
                const updatedRecord = {
                    ...existingRecord,
                    observations: mergedObservations,
                    lastUpdated: Instant.epochSeconds(Now.instant()),
                };
                await this.dataManager.store(updatedRecord);

                window.dispatchEvent(new CustomEvent(UITrigger.SIGNAL_DATA_UPDATE));
            }
        } finally {
            this.pendingScans.delete(siteId);
        }
    }

    private scanMapForSite(siteCentroid: Coordinates): MapPortalCapture[] {
        const found: MapPortalCapture[] = [];
        const win = window as unknown as IITCMapData;
        const portals = win.portals ?? {};

        for (const [, portal] of Object.entries(portals)) {
            const portalData = portal.options?.data;
            if (!portalData?.ornaments) continue;

            if (isWithinSiteRange(siteCentroid, portalData)) {
                const eventOrnament = portalData.ornaments.find((o: string) => this.preEventOrnamentIds.includes(o));
                if (eventOrnament) {
                    found.push({
                        guid: portalData.guid,
                        title: portalData.title,
                        latE6: portalData.latE6,
                        lngE6: portalData.lngE6,
                        ornaments: portalData.ornaments,
                    });
                }
            }
        }
        return found;
    }

    private findSiteInRange(coords: Coordinates): string | undefined {
        for (const [siteId, site] of Object.entries(this.getFlatSites())) {
            if (isWithinSiteRange(site.geocode, coords)) return siteId;
        }
        return undefined;
    }

    private mergeObservations(
        existingObservations: SiteObservation,
        detectedPortals: MapPortalCapture[],
    ): SiteObservation {
        const identityToId = new Map<string, number>();
        let maxId = 0;

        for (const [idStr, portal] of Object.entries(existingObservations.portals)) {
            const id = Number(idStr);
            identityToId.set(this.getIdentityKey(portal), id);
            if (id > maxId) maxId = id;
        }

        const newPortals: Record<PortalId, Portal> = structuredClone(existingObservations.portals);
        const observedAt = Instant.epochSeconds(Now.instant());

        detectedPortals.forEach((p) => {
            const identityKey = this.getIdentityKey(p);

            let portalId = identityToId.get(identityKey);
            if (portalId === undefined) {
                maxId++;
                portalId = maxId;
                identityToId.set(identityKey, portalId);
            }

            if (newPortals[portalId]) {
                const existing = newPortals[portalId];
                existing.title = p.title;
                if (p.guid && !existing.guid) existing.guid = p.guid;
            } else {
                newPortals[portalId] = {
                    title: p.title,
                    latE6: p.latE6,
                    lngE6: p.lngE6,
                    guid: p.guid ?? undefined,
                    history: [],
                };
            }

            const portal = newPortals[portalId];

            if (p.ornaments) {
                p.ornaments.forEach((ornId) => {
                    // Only handle ornaments that qualify as pre-event
                    if (this.preEventOrnamentIds.includes(ornId)) {
                        const exists = portal.history.some(
                            (h) => h.type === "pre-event" && h.ornId === ornId,
                        );
                        if (!exists) {
                            const entry: PreEventHistoryEntry = {
                                type: "pre-event",
                                timestamp: observedAt,
                                ornId,
                            };
                            portal.history.push(entry);
                        }
                    }
                });
            }
        });

        return {
            ...existingObservations,
            portals: newPortals,
        };
    }

    private getIdentityKey(p: { latE6: number; lngE6: number }): string {
        return `${p.latE6}|${p.lngE6}`;
    }

    private getSiteConfig(siteId: string): { geocode: SiteGeocode } | undefined {
        return this.getFlatSites()[siteId];
    }

    private getFlatSites(): Record<string, { geocode: SiteGeocode }> {
        const flat: Record<string, { geocode: SiteGeocode }> = {};
        for (const season of Object.values(this.seasonConfig)) {
            for (const [siteId, site] of Object.entries(season.sites)) {
                flat[siteId] = site;
            }
        }
        return flat;
    }
}
