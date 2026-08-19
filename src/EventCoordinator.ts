import type { ShardJumpCapture, MapSnapshot, SiteTargetPortals } from "@ingress-shards/ingress-events-core";
import { ObserverCommand, ObserverResult } from "./types/ObserverEvents";
import type { ShardObserver } from "./observers/ShardObserver";
import type { ShardJumpIngestionService } from "./services/ShardJumpIngestionService";
import type { PreEventOrnamentIngestionService } from "./services/PreEventOrnamentIngestionService";
import type { SiteTargetPortalIngestionService } from "./services/SiteTargetPortalIngestionService";

export class EventCoordinator {
    private ingestionQueue: Promise<void> = Promise.resolve();

    constructor(
        private shardObserver: ShardObserver,
        private shardJumpIngestionService: ShardJumpIngestionService,
        private preEventOrnamentIngestionService: PreEventOrnamentIngestionService,
        private siteTargetPortalIngestionService: SiteTargetPortalIngestionService
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
                    await this.shardJumpIngestionService.ingest(customEvent.detail);
                } catch (error) {
                    console.error(`[Site Observer: EventCoordinator] Failed to ingest shard jumps:`, error);
                }
            };
            this.ingestionQueue = task();
        });

        window.addEventListener(ObserverResult.PRE_EVENT_ORNAMENTS_OBSERVED, (event: Event) => {
            const customEvent = event as CustomEvent<MapSnapshot>;
            const task = async () => {
                await this.ingestionQueue;
                try {
                    await this.preEventOrnamentIngestionService.ingest(customEvent.detail);
                } catch (error) {
                    console.error(`[Site Observer: EventCoordinator] Failed to ingest pre-event ornaments:`, error);
                }
            };
            this.ingestionQueue = task();
        });

        window.addEventListener(ObserverResult.SITE_TARGETS_OBSERVED, (event: Event) => {
            const customEvent = event as CustomEvent<SiteTargetPortals>;
            const task = async () => {
                await this.ingestionQueue;
                try {
                    await this.siteTargetPortalIngestionService.ingest(customEvent.detail);
                } catch (error) {
                    console.error(`[Site Observer: EventCoordinator] Failed to ingest target portals:`, error);
                }
            };
            this.ingestionQueue = task();
        });
    }
}
