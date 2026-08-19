import * as Plugin from "iitcpluginkit";
import eventBlueprints from "@ingress-shards/ingress-events-core/conf/event_blueprints.json";
import seasonManifest from "@ingress-shards/ingress-events-core/conf/recent/season_manifest.json";
import seasonGeocode from "@ingress-shards/ingress-events-core/conf/recent/season_geocode.json";

import {
    EventConfigRegistry,
    type EventBlueprints,
    type Ornament,
    type SeasonGeocode,
    type SeasonManifest,
} from "@ingress-shards/ingress-events-core";

import { SiteRecordManager } from "./db/SiteRecordManager";
import { ShardJumpDataManager } from "./db/ShardJumpDataManager";
import { ObserverScheduler } from "./ObserverScheduler";
import { ShardObserver } from "./observers/ShardObserver";
import { PreEventOrnamentObserver } from "./observers/PreEventOrnamentObserver";
import { ObserverDialog } from "./ui/ObserverDialog";
import { TooltipComponent } from "./ui/components/TooltipComponent";
import { ShortcutControlComponent } from "./ui/components/ShortcutControlComponent";
import { EventCoordinator } from "./EventCoordinator";
import { UITrigger } from "./types/ObserverEvents";
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

    private eventCoordinator: EventCoordinator;
    private dialog: ObserverDialog;
    private tooltipComponent: TooltipComponent;
    private shortcutControl: ShortcutControlComponent;

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

        this.eventCoordinator = new EventCoordinator(
            this.shardObserver,
            this.shardJumpIngestionService,
            this.preEventOrnamentIngestionService,
            this.siteTargetPortalIngestionService
        );

        this.dialog = new ObserverDialog(this.eventConfigRegistry.seasons, this.siteRecordManager, this.observerScheduler);
        this.tooltipComponent = new TooltipComponent();
        this.shortcutControl = new ShortcutControlComponent(this.dialog);
    }

    /**
     * Adds a Leaflet control button to the map as a shortcut.
     */
    private addMapControl() {
        const win = window as any;
        if (win.map) {
            this.shortcutControl.addTo(win.map as L.Map);

            window.addEventListener(UITrigger.SIGNAL_DATA_UPDATE, () => {
                this.shortcutControl.signalDataUpdate();
            });
        }
    }

    init() {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require("./ui/styles.css");

        this.eventCoordinator.bindEvents();

        const timetable = this.observerScheduler.getTimetable();
        for (const [siteId, triggers] of Object.entries(timetable)) {
            console.log(`[Site Observer: Timetable] ${siteId}: ${triggers.length} triggers`);
        }

        this.addMapControl();

        this.tooltipComponent.bindEvents(
            (id) => this.dialog.getSiteConfig(id),
            (id) => this.dialog.getSiteRecord(id)
        );

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
