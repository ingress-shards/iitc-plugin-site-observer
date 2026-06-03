import * as Plugin from "iitcpluginkit";
import eventBlueprints from "@ingress-shards/ingress-events-core/conf/event_blueprints.json";
import seasonManifest from "@ingress-shards/ingress-events-core/conf/recent/season_manifest.json";
import seasonGeocode from "@ingress-shards/ingress-events-core/conf/recent/season_geocode.json";

import {
    buildSeasonConfig,
    type EventBlueprints,
    type Ornament,
    type ShardJumpCapture,
    type SeasonConfig,
    type SeasonGeocode,
    type SeasonManifest,
} from "@ingress-shards/ingress-events-core";

import { SiteRecordManager } from "./db/SiteRecordManager";
import { ShardJumpDataManager } from "./db/ShardJumpDataManager";
import { ObserverScheduler } from "./ObserverScheduler";
import { ShardObserver } from "./observers/ShardObserver";
import { PreEventOrnamentObserver } from "./observers/PreEventOrnamentObserver";
import { ObserverDialog } from "./ui/ObserverDialog";
import { ShortcutControl } from "./ui/ShortcutControl";
import { DataExporter } from "./export/DataExporter";
import { SiteRecordStrategy } from "./export/SiteRecordExporter";
import { SiteDiscoveryStrategy } from "./export/SiteDiscoveryExporter";
import { ObserverCommand, ObserverEventInput, ObserverResult, UITrigger } from "./types/ObserverEvents";
import { ShardProcessor } from "./processors/ShardProcessor";

class SiteObserver implements Plugin.Class {
    private seasonConfigCache: Record<string, SeasonConfig>;

    private siteRecordManager: SiteRecordManager;
    private shardJumpDataManager: ShardJumpDataManager;

    private observerScheduler: ObserverScheduler;

    private shardObserver: ShardObserver;
    private preEventOrnamentObserver: PreEventOrnamentObserver;

    private shardProcessor: ShardProcessor;

    private dataExporter: DataExporter;

    private dialog: ObserverDialog;

    constructor() {
        this.seasonConfigCache = buildSeasonConfig({
            eventBlueprints: eventBlueprints as EventBlueprints,
            seasonManifest: seasonManifest as SeasonManifest,
            seasonGeocode: seasonGeocode as SeasonGeocode,
        });

        this.siteRecordManager = new SiteRecordManager();
        this.shardJumpDataManager = new ShardJumpDataManager();

        this.shardObserver = new ShardObserver(this.shardJumpDataManager);
        this.preEventOrnamentObserver = new PreEventOrnamentObserver(
            eventBlueprints.ornaments as Record<string, Ornament>,
            this.seasonConfigCache,
            this.siteRecordManager,
        );

        this.shardProcessor = new ShardProcessor();

        this.observerScheduler = new ObserverScheduler(this.seasonConfigCache);

        this.dataExporter = new DataExporter(this.siteRecordManager);

        this.dialog = new ObserverDialog(this.seasonConfigCache, this.siteRecordManager);
    }

    init() {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require("./ui/styles.css");

        window.addEventListener(ObserverCommand.FETCH_SHARD_JUMPS, (event: Event) => {
            const customEvent = event as CustomEvent<ObserverEventInput<void>>;
            this.shardObserver.observe(customEvent.detail);
        });

        window.addEventListener(ObserverCommand.FETCH_PRE_EVENT_ORNAMENTS, (event: Event) => {
            const customEvent = event as CustomEvent<ObserverEventInput<void>>;
            this.preEventOrnamentObserver.observe(customEvent.detail).catch((error) => {
                console.error(`[Site Observer: Main] Failed to fetch pre-event ornaments:`, error);
            });
        });

        window.addEventListener(ObserverResult.SHARD_JUMPS_OBSERVED, (event: Event) => {
            const customEvent = event as CustomEvent<ObserverEventInput<ShardJumpCapture>>;
            this.shardProcessor.process(customEvent.detail);
            window.dispatchEvent(new CustomEvent(UITrigger.SIGNAL_DATA_UPDATE));
        });

        window.addEventListener(ObserverCommand.EXPORT_SITE_DATA, (event: Event) => {
            const customEvent = event as CustomEvent<ObserverEventInput<any>>;
            this.dataExporter.run(customEvent.detail.siteId, SiteRecordStrategy).catch((error) => {
                console.error(`[Site Observer: Main] Failed to export site data:`, error);
            });
        });

        window.addEventListener(ObserverCommand.EXPORT_SITE_DISCOVERY, (event: Event) => {
            const customEvent = event as CustomEvent<ObserverEventInput<any>>;
            this.dataExporter.run(customEvent.detail.siteId, SiteDiscoveryStrategy).catch((error) => {
                console.error(`[Site Observer: Main] Failed to export site discovery:`, error);
            });
        });

        const timetable = this.observerScheduler.getTimetable();
        console.log(`[Site Observer: Timetable]`);
        for (const [siteId, triggers] of Object.entries(timetable)) {
            console.log(`[Site Observer: Timetable] ${siteId}: ${triggers.length} triggers`);
        }

        this.addMapControl();
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
}

/**
 * use "main" to access you main class from everywhere
 * (same as window.plugin.SiteObserver)
 */
export const main = new SiteObserver();
Plugin.Register(main, "SiteObserver");
