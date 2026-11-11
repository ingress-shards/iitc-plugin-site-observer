import {
    DataIngestionPipeline,
    type IngestionItem,
    type ConfigRegistry,
} from "@ingress-shards/ingress-events-core";
import type { SiteStateManager } from "./db/SiteStateManager";
import { UITrigger } from "./types/ObserverEvents";

export class IntelIngestionService {
    private pipeline: DataIngestionPipeline;

    constructor(
        private registry: ConfigRegistry,
        private siteStateManager: SiteStateManager,
    ) {
        this.pipeline = new DataIngestionPipeline(
            this.registry,
            this.registry.getAllSites(),
            (siteId: string) => this.siteStateManager.get(siteId),
        );
    }

    public async ingest(items: IngestionItem[]): Promise<void> {
        try {
            const updatedStates = await this.pipeline.ingestBatch(items);
            let hasAnyUpdate = false;
            for (const state of updatedStates) {
                await this.siteStateManager.store(state);
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

