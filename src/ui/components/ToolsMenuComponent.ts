import { total } from "temporal-polyfill/fns/Duration";
import { diff as diffZonedDateTime } from "temporal-polyfill/fns/ZonedDateTime";
import { zonedDateTimeISO } from "temporal-polyfill/fns/Now";
import {
    EXPORT_ICON_SVG,
    getOrnamentSVG,
    getTargetOrnamentSVG,
    UI_COLORS,
    type IngestionItem,
} from "@ingress-shards/ingress-events-core";
import { ObserverCommand, UITrigger } from "../../types/ObserverEvents";
import type { SiteStateManager } from "../../db/SiteStateManager";
import type { IntelIngestionService } from "../../IntelIngestionService";
import { DataExporter } from "../../export/SiteDataExporter";
import { SiteStateStrategy } from "../../export/SiteStateExporter";
import { SiteDiscoveryStrategy } from "../../export/SiteDiscoveryExporter";
import { SiteTargetPortalStrategy } from "../../export/SiteTargetPortalExporter";

export class ToolsMenuComponent {
    private lastDownloadJumpsTimestamp?: ReturnType<typeof zonedDateTimeISO>;
    private dataExporter: DataExporter;

    constructor(
        private dataManager: SiteStateManager,
        private ingestionService: IntelIngestionService,
        private getSelectedSiteId: () => string | undefined
    ) {
        this.dataExporter = new DataExporter(this.dataManager);
    }

    public render(): string {
        return `
            <details class="tools-menu">
            <summary class="ui-label">Tools</summary>
                <div class="site-tools">
                    <span class="selected-site">Selected Site: <strong id="selected-site-name"></strong></span>
                    
                    <div class="export-tools-menu">
                        <button class="export-site-state-button" title="Export Site Data">
                            ${EXPORT_ICON_SVG}
                        </button>
                        <button class="export-ornaments-button" title="Export Pre-Event Ornaments">
                            ${getOrnamentSVG(UI_COLORS.SIGNAL)}
                        </button>
                        <button class="export-targets-button" title="Export Target Portals">
                            ${getTargetOrnamentSVG(UI_COLORS.SIGNAL)}
                        </button>
                        <button class="clear-site-data-button observer-button warning-button" title="Clear data for the selected site">
                            Clear Data
                        </button>
                    </div>
                </div>
                <div class="general-tools-menu">
                    <button id="manual-download-jumps-button" class="observer-button" title="Force Shard Jump Download from Intel site">Download Shard Jumps</button>
                    <button id="import-data-button" class="observer-button" title="Load Ornaments, Targets, or Shard Jumps from Local JSON or TXT files">Import from File</button>
                    <input type="file" id="import-data-file-input" style="display: none;" accept=".json,.txt,application/json,text/plain" multiple />
                    <button id="import-url-button" class="observer-button" title="Load Ornaments, Targets, or Shard Jumps from a URL">Import from URL</button>
                    <button id="clear-all-data-button" class="observer-button warning-button" title="Clear all site data from database">Clear All Site Data</button>
                </div>
            </details>
        `;
    }

    public bindEvents($container: JQuery): void {
        $container.on("click", "#manual-download-jumps-button", () => {
            const now = zonedDateTimeISO("UTC");
            const timeSinceLastDownload =
                this.lastDownloadJumpsTimestamp &&
                total(diffZonedDateTime(this.lastDownloadJumpsTimestamp, now), {
                    unit: "second",
                });
            if (timeSinceLastDownload && timeSinceLastDownload < 60) {
                alert(
                    `Please wait ${60 - Math.abs(timeSinceLastDownload)} seconds before download the shard jumps again.`,
                );
                return;
            }
            this.lastDownloadJumpsTimestamp = now;
            window.dispatchEvent(
                new CustomEvent(ObserverCommand.FETCH_SHARD_JUMPS, {
                    detail: {
                        siteId: "manual",
                        timestamp: this.lastDownloadJumpsTimestamp,
                    },
                }),
            );
        });

        $container.on("click", "#import-data-button", () => {
            $container.find("#import-data-file-input").trigger("click");
        });

        $container.on("change", "#import-data-file-input", async (event) => {
            const input = event.target as HTMLInputElement;
            if (!input.files || input.files.length === 0) return;
            
            const files = [...input.files];
            input.value = ""; // Reset input so same files can be selected again if needed

            try {
                const items: IngestionItem[] = await Promise.all(
                    files.map(async (file) => ({
                        filename: file.name,
                        data: await file.text(),
                    }))
                );
                await this.ingestionService.ingest(items);
                console.log(`[Site Observer] Successfully imported ${items.length} file(s).`);
            } catch (error: unknown) {
                console.error("[Site Observer] Failed to process files:", error);
                alert(error instanceof Error ? error.message : "Failed to process files. Check console for details.");
            }
        });

        $container.on("click", "#import-url-button", async () => {
            const inputUrl = prompt("Enter JSON or Raw URL to import:");
            if (!inputUrl || inputUrl.trim() === "") return;

            const url = inputUrl.trim();
            try {
                const urlObject = new URL(url);
                const pathSegments = urlObject.pathname.split("/").filter(Boolean);
                const rawFilename = pathSegments.at(-1);

                if (!rawFilename) {
                    throw new Error("Could not determine filename from URL.");
                }

                const response = await fetch(url);
                if (!response.ok) {
                    throw new Error(`Failed to fetch URL: ${response.status} ${response.statusText}`);
                }

                const content = await response.text();
                await this.ingestionService.ingest([{
                    filename: rawFilename,
                    data: content,
                }]);
                console.log(`[Site Observer] Successfully imported from URL: ${rawFilename}`);
            } catch (error: unknown) {
                console.error("[Site Observer] Failed to import from URL:", error);
                alert(error instanceof Error ? error.message : "Failed to import from URL. Check console for details.");
            }
        });

        $container.on("click", "#clear-all-data-button", async () => {
            if (confirm("Are you sure you want to clear ALL site data from the local database?")) {
                try {
                    await this.dataManager.clearAll();
                    console.log("[Site Observer] All site states cleared from database.");
                    window.dispatchEvent(new CustomEvent(UITrigger.SIGNAL_DATA_UPDATE));
                } catch (error) {
                    console.error("[Site Observer] Failed to clear site states:", error);
                }
            }
        });

        $container.on("click", ".export-site-state-button", async () => {
            const selectedSiteId = this.getSelectedSiteId();
            if (!selectedSiteId) return;
            try {
                await this.dataExporter.run(selectedSiteId, SiteStateStrategy);
            } catch (error) {
                console.error(`[Site Observer: ActionMenu] Failed to export site state:`, error);
            }
        });

        $container.on("click", ".export-ornaments-button", async () => {
            const selectedSiteId = this.getSelectedSiteId();
            if (!selectedSiteId) return;
            try {
                await this.dataExporter.run(selectedSiteId, SiteDiscoveryStrategy);
            } catch (error) {
                console.error(`[Site Observer: ActionMenu] Failed to export site discovery:`, error);
            }
        });

        $container.on("click", ".export-targets-button", async () => {
            const selectedSiteId = this.getSelectedSiteId();
            if (!selectedSiteId) return;
            try {
                await this.dataExporter.run(selectedSiteId, SiteTargetPortalStrategy);
            } catch (error) {
                console.error(`[Site Observer: ActionMenu] Failed to export site target portals:`, error);
            }
        });

        $container.on("click", ".clear-site-data-button", async () => {
            const selectedSiteId = this.getSelectedSiteId();
            if (!selectedSiteId) return;
            if (confirm(`Are you sure you want to clear the site data for ${selectedSiteId}?`)) {
                try {
                    await this.dataManager.delete(selectedSiteId);
                    console.log(`[Site Observer] Site state for ${selectedSiteId} cleared.`);
                    window.dispatchEvent(new CustomEvent(UITrigger.SIGNAL_DATA_UPDATE));
                } catch (error) {
                    console.error(`[Site Observer] Failed to clear site data for ${selectedSiteId}:`, error);
                }
            }
        });
    }
}
