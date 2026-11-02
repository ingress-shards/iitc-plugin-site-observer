import {
    DataIngestionPipeline,
    type IngestionItem,
    type EventConfigRegistry,
} from "@ingress-shards/ingress-events-core";
import type { SiteRecordManager } from "./db/SiteRecordManager";
import { UITrigger } from "./types/ObserverEvents";

export class IntelIngestionService {
    private pipeline: DataIngestionPipeline;

    constructor(
        private registry: EventConfigRegistry,
        private siteRecordManager: SiteRecordManager,
    ) {
        this.pipeline = new DataIngestionPipeline(
            this.registry,
            this.registry.getAllSites(),
            (siteId: string) => this.siteRecordManager.get(siteId),
        );
    }

    public async ingest(items: IngestionItem[]): Promise<void> {
        try {
            const updatedRecords = await this.pipeline.ingestBatch(items);
            let hasAnyUpdate = false;
            for (const record of updatedRecords) {
                await this.siteRecordManager.store(record);
                hasAnyUpdate = true;
            }
            if (hasAnyUpdate) {
                window.dispatchEvent(new CustomEvent(UITrigger.SIGNAL_DATA_UPDATE));
            }
        } catch (error) {
            console.error("[Site Observer: IntelIngestionService] Ingestion failed:", error);
            throw error;
        }
    }
}

