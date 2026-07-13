import {
    ShardJumpCaptureAdapter,
    SiteRecordMerger,
    SiteRecordAnalyzer,
    type ShardJumpCapture,
    type SeasonConfig,
    type SiteGeocode
} from "@ingress-shards/ingress-events-core";
import { epochMilliseconds } from "temporal-polyfill/fns/instant";
import { instant } from "temporal-polyfill/fns/now";
import { IntelIngestionService } from "./IntelIngestionService";
import { SiteRecordManager } from "../db/SiteRecordManager";
import { UITrigger } from "../types/ObserverEvents";

export class ShardJumpIngestionService implements IntelIngestionService<ShardJumpCapture> {
    constructor(
        private seasonConfig: Record<string, SeasonConfig>,
        private siteRecordManager: SiteRecordManager,
    ) {}

    public async ingest(data: ShardJumpCapture): Promise<void> {
        if (!data?.artifact || data.artifact.length === 0) return;

        const activeSites: SiteGeocode[] = Object.values(this.seasonConfig)
            .flatMap(season => Object.values(season.sites).map(site => site.geocode));

        const adapter = new ShardJumpCaptureAdapter();
        const groupedObservations = adapter.parseAndGroup(data, activeSites);

        let hasAnyUpdate = false;

        for (const [siteId, incomingObs] of groupedObservations.entries()) {
            const site = this.getSiteConfig(siteId);
            if (!site) continue;

            let existingRecord = await this.siteRecordManager.get(siteId);
            existingRecord ??= {
                lastUpdated: epochMilliseconds(instant()),
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
                Object.keys(mergedShards).length !== Object.keys(existingShards).length ||
                JSON.stringify(mergedShards) !== JSON.stringify(existingShards);

            if (hasPortalsChanged || hasShardsChanged) {
                console.log(`[Site Observer: Shard Ingestion] Updating site: ${siteId} with new shard jumps.`);
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
