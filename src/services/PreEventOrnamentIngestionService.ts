import {
    MapSnapshotAdapter,
    SiteRecordMerger,
    SiteRecordAnalyzer,
    type Ornament,
    type MapSnapshot,
    type SeasonConfig,
    type SiteGeocode
} from "@ingress-shards/ingress-events-core";
import { IntelIngestionService } from "./IntelIngestionService";
import { SiteRecordManager } from "../db/SiteRecordManager";
import { UITrigger } from "../types/ObserverEvents";

export class PreEventOrnamentIngestionService implements IntelIngestionService<MapSnapshot> {
    constructor(
        private blueprintOrnaments: Record<string, Ornament>,
        private seasonConfig: Record<string, SeasonConfig>,
        private siteRecordManager: SiteRecordManager,
    ) {}

    public async ingest(snapshot: MapSnapshot): Promise<void> {
        if (!snapshot.portals || snapshot.portals.length === 0) return;

        const activeSites: SiteGeocode[] = Object.values(this.seasonConfig)
            .flatMap(season => Object.values(season.sites).map(site => site.geocode));

        const adapter = new MapSnapshotAdapter(this.blueprintOrnaments, snapshot.timestamp);
        const groupedObservations = adapter.parseAndGroup(snapshot, activeSites);

        let hasAnyUpdate = false;

        for (const [siteId, incomingObs] of groupedObservations.entries()) {
            const site = this.getSiteConfig(siteId);
            if (!site) continue;

            let existingRecord = await this.siteRecordManager.get(siteId);
            existingRecord ??= {
                lastUpdated: snapshot.timestamp,
                metadata: {
                    geocode: site.geocode,
                    schedule: {},
                },
                observations: {
                    portals: {},
                    shards: {},
                }
            };

            const merger = new SiteRecordMerger();
            const updatedRecord = merger.merge(existingRecord, incomingObs);

            // Wipe and replace the analysis
            updatedRecord.analysis = SiteRecordAnalyzer.analyze(updatedRecord);

            // Compare observations to see if anything changed
            const existingPortals = existingRecord.observations?.portals ?? {};
            const mergedPortals = updatedRecord.observations?.portals ?? {};
            const existingShards = existingRecord.observations?.shards ?? {};
            const mergedShards = updatedRecord.observations?.shards ?? {};

            const hasPortalsChanged =
                Object.keys(mergedPortals).length !== Object.keys(existingPortals).length ||
                JSON.stringify(mergedPortals) !== JSON.stringify(existingPortals);

            const hasShardsChanged =
                Object.keys(mergedShards).length !== Object.keys(existingShards).length;

            if (hasPortalsChanged || hasShardsChanged) {
                console.log(`[Site Observer: Pre-Event Ingestion] Updating site: ${siteId}`);
                await this.siteRecordManager.store(updatedRecord);
                hasAnyUpdate = true;
            }
        }

        if (hasAnyUpdate) {
            window.dispatchEvent(new CustomEvent(UITrigger.SIGNAL_DATA_UPDATE));
        }
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
