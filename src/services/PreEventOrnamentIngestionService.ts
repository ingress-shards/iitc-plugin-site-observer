import {
    MapSnapshotAdapter,
    SiteRecordMerger,
    SiteDataProcessor,
    type Ornament,
    type MapSnapshot,
    EventConfigRegistry
} from "@ingress-shards/ingress-events-core";
import type { IntelIngestionService } from "./IntelIngestionService";
import { SiteRecordManager } from "../db/SiteRecordManager";
import { UITrigger } from "../types/ObserverEvents";

export class PreEventOrnamentIngestionService implements IntelIngestionService<MapSnapshot> {
    constructor(
        private blueprintOrnaments: Record<string, Ornament>,
        private config: EventConfigRegistry,
        private siteRecordManager: SiteRecordManager,
    ) {}

    public async ingest(snapshot: MapSnapshot): Promise<void> {
        const portalCount = snapshot.portals?.length ?? 0;
        console.log(`[Site Observer: Pre-Event Ingestion] Ingesting snapshot containing ${portalCount} portals.`);
        if (portalCount === 0) return;

        const adapter = new MapSnapshotAdapter(this.blueprintOrnaments, snapshot.timestamp);
        const processor = new SiteDataProcessor(new SiteRecordMerger());

        const updatedRecords = await processor.process({
            input: snapshot,
            adapter,
            config: this.config,
            resolveRecord: (siteId: string) => this.siteRecordManager.get(siteId)
        });

        let hasAnyUpdate = false;
        for (const record of updatedRecords) {
            console.log(`[Site Observer: Pre-Event Ingestion] Updating site: ${record.metadata.siteId}`);
            await this.siteRecordManager.store(record);
            hasAnyUpdate = true;
        }

        if (hasAnyUpdate) {
            window.dispatchEvent(new CustomEvent(UITrigger.SIGNAL_DATA_UPDATE));
        }
    }
}
