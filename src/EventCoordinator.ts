import type { ShardJumpCapture, MapSnapshot } from "@ingress-shards/ingress-events-core";
import { ObserverCommand, ObserverResult } from "./types/ObserverEvents";
import type { ShardObserver } from "./observers/ShardObserver";
import type { IntelIngestionService } from "./IntelIngestionService";

export class EventCoordinator {
    private ingestionQueue: Promise<void> = Promise.resolve();

    constructor(
        private shardObserver: ShardObserver,
        private intelIngestionService: IntelIngestionService
    ) {}

    public bindEvents(): void {
        window.addEventListener(ObserverCommand.FETCH_SHARD_JUMPS, () => {
            this.shardObserver.observe();
        });

        window.addEventListener(ObserverResult.SHARD_JUMPS_OBSERVED, (event: Event) => {
            const customEvent = event as CustomEvent<ShardJumpCapture>;
            const task = async () => {
                await this.ingestionQueue;
                try {
                    const timestamp = customEvent.detail.timestamp ?? Date.now();
                    await this.intelIngestionService.ingest([{
                        filename: `shard-jump-times-${timestamp}.json`,
                        data: customEvent.detail,
                    }]);
                } catch (error) {
                    console.error("[Site Observer: EventCoordinator] Failed to ingest shard jumps:", error);
                }
            };
            this.ingestionQueue = task();
        });

        window.addEventListener(ObserverResult.PRE_EVENT_ORNAMENTS_OBSERVED, (event: Event) => {
            const customEvent = event as CustomEvent<MapSnapshot>;
            const task = async () => {
                await this.ingestionQueue;
                try {
                    const timestamp = customEvent.detail.timestamp ?? Date.now();
                    await this.intelIngestionService.ingest([{
                        filename: `map-snapshot-${timestamp}.json`,
                        data: customEvent.detail,
                    }]);
                } catch (error) {
                    console.error("[Site Observer: EventCoordinator] Failed to ingest pre-event ornaments:", error);
                }
            };
            this.ingestionQueue = task();
        });
    }
}
