import * as Plugin from "iitcpluginkit";
import eventBlueprints from "@ingress-shards/ingress-events-core/conf/event_blueprints.json";
import seasonManifest from "@ingress-shards/ingress-events-core/conf/recent/season_manifest.json";
import seasonGeocode from "@ingress-shards/ingress-events-core/conf/recent/season_geocode.json";

import {
    EventConfigRegistry,
    type EventBlueprints,
    type Ornament,
    type ShardJumpCapture,
    type SeasonGeocode,
    type SeasonManifest,
    type MapSnapshot,
    type SiteTargetPortals,
} from "@ingress-shards/ingress-events-core";

import { SiteRecordManager } from "./db/SiteRecordManager";
import { ShardJumpDataManager } from "./db/ShardJumpDataManager";
import { ObserverScheduler } from "./ObserverScheduler";
import { ShardObserver } from "./observers/ShardObserver";
import { PreEventOrnamentObserver } from "./observers/PreEventOrnamentObserver";
import { ObserverDialog } from "./ui/ObserverDialog";
import { ShortcutControl } from "./ui/ShortcutControl";
import { DataExporter } from "./export/SiteDataExporter";
import { SiteRecordStrategy } from "./export/SiteRecordExporter";
import { SiteDiscoveryStrategy } from "./export/SiteDiscoveryExporter";
import { SiteTargetPortalStrategy } from "./export/SiteTargetPortalExporter";
import { ObserverCommand, ObserverResult, UITrigger } from "./types/ObserverEvents";
import { ShardJumpIngestionService } from "./services/ShardJumpIngestionService";
import { PreEventOrnamentIngestionService } from "./services/PreEventOrnamentIngestionService";
import { SiteTargetPortalIngestionService } from "./services/SiteTargetPortalIngestionService";

class SiteObserver implements Plugin.Class {
    private eventConfigRegistry: EventConfigRegistry;

    private siteRecordManager: SiteRecordManager;
    private shardJumpDataManager: ShardJumpDataManager;

    private observerScheduler: ObserverScheduler;

    private shardObserver: ShardObserver;
    private preEventOrnamentObserver: PreEventOrnamentObserver;

    private shardJumpIngestionService: ShardJumpIngestionService;
    private preEventOrnamentIngestionService: PreEventOrnamentIngestionService;
    private siteTargetPortalIngestionService: SiteTargetPortalIngestionService;

    private dataExporter: DataExporter;

    private dialog: ObserverDialog;

    constructor() {
        this.eventConfigRegistry = new EventConfigRegistry({
            eventBlueprints: eventBlueprints as EventBlueprints,
            seasonManifest: seasonManifest as SeasonManifest,
            seasonGeocode: seasonGeocode as SeasonGeocode,
        });

        this.siteRecordManager = new SiteRecordManager();
        this.shardJumpDataManager = new ShardJumpDataManager();

        this.shardObserver = new ShardObserver(this.shardJumpDataManager);
        this.preEventOrnamentObserver = new PreEventOrnamentObserver(
            eventBlueprints.ornaments as Record<string, Ornament>,
        );

        this.shardJumpIngestionService = new ShardJumpIngestionService(
            this.eventConfigRegistry,
            this.siteRecordManager,
        );
        this.preEventOrnamentIngestionService = new PreEventOrnamentIngestionService(
            eventBlueprints.ornaments as Record<string, Ornament>,
            this.eventConfigRegistry,
            this.siteRecordManager,
        );
        this.siteTargetPortalIngestionService = new SiteTargetPortalIngestionService(
            this.eventConfigRegistry,
            this.siteRecordManager,
        );

        this.observerScheduler = new ObserverScheduler(this.eventConfigRegistry.seasons);

        this.dataExporter = new DataExporter(this.siteRecordManager);

        this.dialog = new ObserverDialog(this.eventConfigRegistry.seasons, this.siteRecordManager, this.observerScheduler);
    }

    /**
     * Adds a Leaflet control button to the map as a shortcut.
     */
    private addMapControl() {
        const win = window as any;
        if (win.map) {
            const control = new ShortcutControl(this.dialog);
            control.addTo(win.map as L.Map);

            window.addEventListener(UITrigger.SIGNAL_DATA_UPDATE, () => {
                control.signalDataUpdate();
            });
        }
    }

    init() {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require("./ui/styles.css");

        window.addEventListener(ObserverCommand.FETCH_SHARD_JUMPS, () => {
            this.shardObserver.observe();
        });

        window.addEventListener(ObserverResult.SHARD_JUMPS_OBSERVED, async (event: Event) => {
            const customEvent = event as CustomEvent<ShardJumpCapture>;
            try {
                await this.shardJumpIngestionService.ingest(customEvent.detail);
            } catch (error) {
                console.error(`[Site Observer: Main] Failed to ingest shard jumps:`, error);
            }
        });

        window.addEventListener(ObserverResult.PRE_EVENT_ORNAMENTS_OBSERVED, async (event: Event) => {
            const customEvent = event as CustomEvent<MapSnapshot>;
            try {
                await this.preEventOrnamentIngestionService.ingest(customEvent.detail);
            } catch (error) {
                console.error(`[Site Observer: Main] Failed to ingest pre-event ornaments:`, error);
            }
        });

        window.addEventListener(ObserverResult.SITE_TARGETS_OBSERVED, async (event: Event) => {
            const customEvent = event as CustomEvent<SiteTargetPortals>;
            try {
                await this.siteTargetPortalIngestionService.ingest(customEvent.detail);
            } catch (error) {
                console.error(`[Site Observer: Main] Failed to ingest target portals:`, error);
            }
        });

        window.addEventListener(ObserverCommand.EXPORT_SITE_DATA, async (event: Event) => {
            const customEvent = event as CustomEvent<{ siteId: string }>;
            try {
                await this.dataExporter.run(customEvent.detail.siteId, SiteRecordStrategy);
            } catch (error) {
                console.error(`[Site Observer: Main] Failed to export site data:`, error);
            }
        });

        window.addEventListener(ObserverCommand.EXPORT_SITE_DISCOVERY, async (event: Event) => {
            const customEvent = event as CustomEvent<{ siteId: string }>;
            try {
                await this.dataExporter.run(customEvent.detail.siteId, SiteDiscoveryStrategy);
            } catch (error) {
                console.error(`[Site Observer: Main] Failed to export site discovery:`, error);
            }
        });

        window.addEventListener(ObserverCommand.EXPORT_SITE_TARGET_PORTALS, async (event: Event) => {
            const customEvent = event as CustomEvent<{ siteId: string }>;
            try {
                await this.dataExporter.run(customEvent.detail.siteId, SiteTargetPortalStrategy);
            } catch (error) {
                console.error(`[Site Observer: Main] Failed to export site target portals:`, error);
            }
        });

        const timetable = this.observerScheduler.getTimetable();
        for (const [siteId, triggers] of Object.entries(timetable)) {
            console.log(`[Site Observer: Timetable] ${siteId}: ${triggers.length} triggers`);
        }

        this.addMapControl();

        // Start passive ornament observation
        this.preEventOrnamentObserver.observe();
    }
}

/**
 * use "main" to access you main class from everywhere
 * (same as window.plugin.SiteObserver)
 */
export const main = new SiteObserver();
Plugin.Register(main, "SiteObserver");
