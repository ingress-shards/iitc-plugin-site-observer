import { total } from "temporal-polyfill/fns/Duration";
import { diff as diffZonedDateTime } from "temporal-polyfill/fns/ZonedDateTime";
import { zonedDateTimeISO } from "temporal-polyfill/fns/Now";
import {
    parseTimestampFromFilename,
    convertSiteDiscoveryToMapSnapshot,
    type SiteDiscovery,
    EXPORT_ICON_SVG,
    getOrnamentSVG,
    getTargetOrnamentSVG,
    UI_COLORS,
} from "@ingress-shards/ingress-events-core";
import { ObserverCommand, ObserverResult, UITrigger } from "../../types/ObserverEvents";
import type { SiteRecordManager } from "../../db/SiteRecordManager";
import { DataExporter } from "../../export/SiteDataExporter";
import { SiteRecordStrategy } from "../../export/SiteRecordExporter";
import { SiteDiscoveryStrategy } from "../../export/SiteDiscoveryExporter";
import { SiteTargetPortalStrategy } from "../../export/SiteTargetPortalExporter";

export class ActionMenuComponent {
    private lastDownloadJumpsTimestamp?: ReturnType<typeof zonedDateTimeISO>;
    private dataExporter: DataExporter;

    constructor(
        private dataManager: SiteRecordManager,
        private getSelectedSiteId: () => string | undefined
    ) {
        this.dataExporter = new DataExporter(this.dataManager);
    }

    private ingestContent(rawFilename: string, content: string): void {
        let filename = rawFilename;
        if (filename.endsWith(".txt")) {
            filename = filename.slice(0, -4);
        }
        if (!filename.endsWith(".json") && !filename.includes(".")) {
            filename += ".json";
        }

        const data: unknown = JSON.parse(content);

        if (filename.startsWith("ornamented-portals")) {
            const parsedTimestamp = parseTimestampFromFilename(filename);
            if (parsedTimestamp === undefined) {
                throw new Error(`Could not parse timestamp from filename: ${filename}`);
            }
            const snapshot = convertSiteDiscoveryToMapSnapshot(data as SiteDiscovery, parsedTimestamp);
            window.dispatchEvent(
                new CustomEvent(ObserverResult.PRE_EVENT_ORNAMENTS_OBSERVED, {
                    detail: snapshot,
                }),
            );
            console.log(`[Site Observer] Ornaments loaded successfully from ${filename}.`);
        } else if (filename.startsWith("target-portals")) {
            window.dispatchEvent(
                new CustomEvent(ObserverResult.SITE_TARGETS_OBSERVED, {
                    detail: data,
                }),
            );
            console.log(`[Site Observer] Target portals loaded successfully from ${filename}.`);
        } else if (filename.startsWith("shard-jump-times")) {
            const parsedTimestamp = parseTimestampFromFilename(filename);
            if (parsedTimestamp === undefined) {
                throw new Error(`Could not parse timestamp from filename: ${filename}`);
            }
            const captureData = {
                ...(data as object),
                timestamp: parsedTimestamp,
            };
            window.dispatchEvent(
                new CustomEvent(ObserverResult.SHARD_JUMPS_OBSERVED, {
                    detail: captureData,
                }),
            );
            console.log(`[Site Observer] Shard jumps loaded successfully from ${filename}.`);
        } else {
            throw new Error(`Unrecognized filename prefix for import: ${filename}`);
        }
    }

    public render(): string {
        return `
            <details class="actions-menu">
            <summary class="ui-label">Actions</summary>
                <div class="site-actions">
                    <span class="selected-site">Selected Site: <strong id="selected-site-name"></strong></span>
                    
                    <div class="export-action-menu">
                        <button class="export-site-record-button" title="Export Site Record">
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
                <div class="general-action-menu">
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
            
            // eslint-disable-next-line unicorn/prefer-spread
            const files = Array.from(input.files);
            input.value = ""; // Reset input so same files can be selected again if needed

            for (const file of files) {
                try {
                    const content = await file.text();
                    this.ingestContent(file.name, content);
                } catch (error: unknown) {
                    console.error(`[Site Observer] Failed to process ${file.name}:`, error);
                    alert(error instanceof Error ? error.message : `Failed to process ${file.name}. Check console for details.`);
                }
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
                this.ingestContent(rawFilename, content);
            } catch (error: unknown) {
                console.error("[Site Observer] Failed to import from URL:", error);
                alert(error instanceof Error ? error.message : "Failed to import from URL. Check console for details.");
            }
        });

        $container.on("click", "#clear-all-data-button", async () => {
            if (confirm("Are you sure you want to clear ALL site records from the local database?")) {
                try {
                    await this.dataManager.clearAll();
                    console.log("[Site Observer] All site records cleared from database.");
                    window.dispatchEvent(new CustomEvent(UITrigger.SIGNAL_DATA_UPDATE));
                } catch (error) {
                    console.error("[Site Observer] Failed to clear site records:", error);
                }
            }
        });

        $container.on("click", ".export-site-record-button", async () => {
            const selectedSiteId = this.getSelectedSiteId();
            if (!selectedSiteId) return;
            try {
                await this.dataExporter.run(selectedSiteId, SiteRecordStrategy);
            } catch (error) {
                console.error(`[Site Observer: ActionMenu] Failed to export site data:`, error);
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
            if (confirm(`Are you sure you want to clear the site record for ${selectedSiteId}?`)) {
                try {
                    await this.dataManager.delete(selectedSiteId);
                    console.log(`[Site Observer] Site record for ${selectedSiteId} cleared.`);
                    window.dispatchEvent(new CustomEvent(UITrigger.SIGNAL_DATA_UPDATE));
                } catch (error) {
                    console.error(`[Site Observer] Failed to clear site data for ${selectedSiteId}:`, error);
                }
            }
        });
    }
}
