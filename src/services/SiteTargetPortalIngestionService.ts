import {
    SiteTargetPortalsAdapter,
    SiteRecordMerger,
    SiteDataProcessor,
    type SiteTargetPortals,
    EventConfigRegistry
} from "@ingress-shards/ingress-events-core";
import { IntelIngestionService } from "./IntelIngestionService";
import { SiteRecordManager } from "../db/SiteRecordManager";
import { UITrigger } from "../types/ObserverEvents";

export class SiteTargetPortalIngestionService implements IntelIngestionService<SiteTargetPortals> {
    constructor(
        private config: EventConfigRegistry,
        private siteRecordManager: SiteRecordManager,
    ) {}

    public async ingest(data: SiteTargetPortals): Promise<void> {
        if (!data?.artifact || data.artifact.length === 0) return;

        const adapter = new SiteTargetPortalsAdapter();
        const processor = new SiteDataProcessor(new SiteRecordMerger());

        const updatedRecords = await processor.process({
            input: data,
            adapter,
            config: this.config,
            resolveRecord: (siteId: string) => this.siteRecordManager.get(siteId)
        });

        let hasAnyUpdate = false;
        for (const record of updatedRecords) {
            console.log(`[Site Observer: Target Ingestion] Updating site: ${record.metadata.siteId} with target portals.`);
            await this.siteRecordManager.store(record);
            hasAnyUpdate = true;
        }

        if (hasAnyUpdate) {
            window.dispatchEvent(new CustomEvent(UITrigger.SIGNAL_DATA_UPDATE));
        }
    }
}
