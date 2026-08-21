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
import { ObserverView } from "./ui/ObserverView";
import type { ObserverHost } from "./ui/hosts/ObserverHost";
import { DialogHost } from "./ui/hosts/DialogHost";
import { PaneHost } from "./ui/hosts/PaneHost";
import { TooltipComponent } from "./ui/components/TooltipComponent";
import { ShortcutControlComponent } from "./ui/components/ShortcutControlComponent";
import { EventCoordinator } from "./EventCoordinator";
import { UITrigger } from "./types/ObserverEvents";
import { ShardJumpIngestionService } from "./services/ShardJumpIngestionService";
import { PreEventOrnamentIngestionService } from "./services/PreEventOrnamentIngestionService";
import { SiteTargetPortalIngestionService } from "./services/SiteTargetPortalIngestionService";

interface AndroidBridge {
    addPane: (id: string, label: string, icon?: string) => void;
}

interface IITCWindow {
    isSmartphone?: () => boolean;
    useAndroidPanes?: () => boolean;
    map?: L.Map;
    android?: AndroidBridge;
    addHook?: (name: string, callback: (...args: unknown[]) => void) => void;
}

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
    private view: ObserverView;
    private host?: ObserverHost;
    private tooltipComponent: TooltipComponent;
    private shortcutControl?: ShortcutControlComponent;

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

        this.view = new ObserverView(this.eventConfigRegistry.seasons, this.siteRecordManager, this.observerScheduler);
        this.tooltipComponent = new TooltipComponent();
    }

    private isSmartphone(): boolean {
        const win = window as unknown as IITCWindow;
        return win.isSmartphone?.() ?? win.useAndroidPanes?.() ?? false;
    }

    /**
     * Adds a Leaflet control button to the map as a shortcut on desktop.
     */
    private addMapControl() {
        const win = window as unknown as IITCWindow;
        if (win.map && this.shortcutControl) {
            this.shortcutControl.addTo(win.map);

            window.addEventListener(UITrigger.SIGNAL_DATA_UPDATE, () => {
                this.shortcutControl?.signalDataUpdate();
            });
        }
    }

    /**
     * Sets up mobile pane integration on smartphones.
     */
    private addMobilePane() {
        const win = window as unknown as IITCWindow;
        if (win.android && typeof win.android.addPane === "function") {
            win.android.addPane("site-observer", "Site Observer", "ic_action_location_found");
        }

        if (typeof win.addHook === "function") {
            win.addHook("paneChanged", (pane: unknown) => {
                if (pane === "site-observer") {
                    this.host?.show();
                } else {
                    this.host?.hide();
                }
            });
        }
    }

    init() {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require("./ui/styles.css");

        this.host = this.isSmartphone()
            ? new PaneHost(this.view)
            : new DialogHost(this.view);

        this.shortcutControl = new ShortcutControlComponent(this.host);

        this.eventCoordinator.bindEvents();

        const timetable = this.observerScheduler.getTimetable();
        for (const [siteId, triggers] of Object.entries(timetable)) {
            console.log(`[Site Observer: Timetable] ${siteId}: ${triggers.length} triggers`);
        }

        if (this.isSmartphone()) {
            this.addMobilePane();
        } else {
            this.addMapControl();
        }

        this.tooltipComponent.bindEvents(
            (id) => this.view.getSiteConfig(id),
            (id) => this.view.getSiteRecord(id)
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
