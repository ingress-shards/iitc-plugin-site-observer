import { zonedDateTimeISO } from "temporal-polyfill/fns/now";
import { total } from "temporal-polyfill/fns/duration";
import { since } from "temporal-polyfill/fns/zoneddatetime";
import {
    parseTimestampFromFilename,
    convertSiteDiscoveryToMapSnapshot,
    type SeasonConfig,
    type SiteConfig,
    type SiteDiscovery,
} from "@ingress-shards/ingress-events-core";
import { ObserverCommand, ObserverResult, UITrigger } from "../types/ObserverEvents";
import { SiteRecordManager } from "../db/SiteRecordManager";
import { SiteTableRenderer } from "./SiteTableRenderer";

interface SiteObserverWindow extends Window {
    dialog: (options: { title: string; html: string; id: string; width: number }) => JQuery;
    map: L.Map;
}

export class ObserverDialog {
    private siteConfigsByDate?: Record<string, SiteConfig[]>;
    private selectedDate?: string;
    private selectedSiteId?: string;

    private $dialog?: JQuery;
    private $tableContainer?: JQuery;
    private renderer: SiteTableRenderer;

    private lastDownloadJumpsTimestamp?: ReturnType<typeof zonedDateTimeISO>;
    private dataUpdateListener = () => { void this.updateSiteTable(); };

    constructor(
        private seasonConfig: Record<string, SeasonConfig>,
        private dataManager: SiteRecordManager,
    ) {
        this.renderer = new SiteTableRenderer(this.dataManager);
    }

    public show() {
        this.siteConfigsByDate ??= SiteTableRenderer.getSiteConfigsByDate(this.seasonConfig);

        const developmentMenuHtml = process.env.APP_ENV === "dev" ? `
            <details class="developer-menu">
                <summary class="ui-label">Developer Actions</summary>
                <div class="developer-actions-content">
                    <button id="manual-download-jumps-button" class="observer-button" title="Force Shard Jump Download">Download Jumps</button>
                    <button id="load-local-jumps-button" class="observer-button" title="Load Shard Jumps from Local JSON file">Load Local Jumps</button>
                    <input type="file" id="local-jumps-file-input" style="display: none;" accept=".json" />
                    <button id="load-local-ornaments-button" class="observer-button" title="Load Ornaments from Local JSON file">Load Ornaments</button>
                    <input type="file" id="local-ornaments-file-input" style="display: none;" accept=".json" />
                    <button id="clear-all-data-button" class="observer-button warning-button" title="Clear all site data from database">Clear All Site Data</button>
                </div>
            </details>
        ` : '';

        const html = `
            <section>
                <main>
                    <div class="site-controls">
                        <label class="ui-label" for="date-select">Date:</label>
                        <select id="date-select">
                            <option value="">-- Select Date --</option>
                            ${Object.keys(this.siteConfigsByDate)
                                .map(
                                    (date) =>
                                        `<option value="${date}" ${date === this.selectedDate ? "selected" : ""}>${date}</option>`,
                                )
                                .join("")}
                        </select>
                    </div>
                    <div id="sites-table-container"></div>
                </main>
                ${developmentMenuHtml ? `<footer class="observer-footer">${developmentMenuHtml}</footer>` : ''}
            </section>
        `;

        const win = window as unknown as SiteObserverWindow;
        this.$dialog = win.dialog({
            title: "Site Observer",
            html: html,
            id: "site-observer",
            width: 500,
        });
        this.$tableContainer = this.$dialog.find("#sites-table-container");

        window.addEventListener(UITrigger.SIGNAL_DATA_UPDATE, this.dataUpdateListener);

        this.$dialog.on("dialogclose", () => {
            window.removeEventListener(UITrigger.SIGNAL_DATA_UPDATE, this.dataUpdateListener);
        });

        this.$dialog.on("change", "#date-select", (event) => {
            this.selectedDate = $(event.target).val() as string;
            void this.updateSiteTable();
        });

        this.$dialog.on("click", "#manual-download-jumps-button", () => {
            const now = zonedDateTimeISO("UTC");
            const timeSinceLastDownload =
                this.lastDownloadJumpsTimestamp &&
                total(since(now, this.lastDownloadJumpsTimestamp), {
                    unit: "second",
                });
            if (timeSinceLastDownload && timeSinceLastDownload < 60) {
                console.log(
                    `[Site Observer] Too soon to download shard jumps, please wait ${60 - Math.abs(timeSinceLastDownload)} seconds`,
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

        if (process.env.APP_ENV === "dev") {
            this.$dialog.on("click", "#load-local-jumps-button", () => {
                this.$dialog?.find("#local-jumps-file-input").trigger("click");
            });

            this.$dialog.on("change", "#local-jumps-file-input", (event) => {
                const input = event.target as HTMLInputElement;
                if (!input.files || input.files.length === 0) return;
                const file = input.files[0];

                file.text()
                    .then((content) => {
                        const data = JSON.parse(content);
                        window.dispatchEvent(
                            new CustomEvent(ObserverResult.SHARD_JUMPS_OBSERVED, {
                                detail: data,
                            }),
                        );
                        console.log("[Site Observer] Local shard jumps loaded successfully.");
                        input.value = "";
                    })
                    .catch((error: unknown) => {
                        console.error("[Site Observer] Failed to read or parse local shard jumps JSON:", error);
                        alert("Failed to read or parse local shard jumps JSON. Check console for details.");
                    });
            });

            this.$dialog.on("click", "#load-local-ornaments-button", () => {
                this.$dialog?.find("#local-ornaments-file-input").trigger("click");
            });

            this.$dialog.on("change", "#local-ornaments-file-input", (event) => {
                const input = event.target as HTMLInputElement;
                if (!input.files || input.files.length === 0) return;
                const file = input.files[0];

                file.text()
                    .then((content) => {
                        const data = JSON.parse(content);

                        // Parse timestamp from filename if available
                        const parsedTimestamp = parseTimestampFromFilename(file.name);

                        // Determine final timestamp
                        const finalTimestamp = parsedTimestamp ?? (data && typeof data === "object" && "timestamp" in data ? (data.timestamp as number) : (data && typeof data === "object" && "exportedAt" in data ? (data.exportedAt as number) * 1000 : Date.now()));

                        let snapshot = data;
                        // Convert SiteDiscovery to MapSnapshot if detected
                        if (data && typeof data === "object" && "siteId" in data && Array.isArray(data.portals)) {
                            snapshot = convertSiteDiscoveryToMapSnapshot(data as SiteDiscovery, finalTimestamp);
                        } else if (snapshot && typeof snapshot === "object") {
                            snapshot.timestamp = finalTimestamp;
                        }

                        window.dispatchEvent(
                            new CustomEvent(ObserverResult.PRE_EVENT_ORNAMENTS_OBSERVED, {
                                detail: snapshot,
                            }),
                        );
                        input.value = "";
                    })
                    .catch((error: unknown) => {
                        console.error("[Site Observer] Failed to read or parse local ornaments JSON:", error);
                        alert("Failed to read or parse local ornaments JSON. Check console for details.");
                    });
            });

            this.$dialog.on("click", "#clear-all-data-button", async () => {
                if (confirm("Are you sure you want to clear ALL site records from IndexedDB?")) {
                    try {
                        await this.dataManager.clearAll();
                        console.log("[Site Observer] All site records cleared from database.");
                        window.dispatchEvent(new CustomEvent(UITrigger.SIGNAL_DATA_UPDATE));
                    } catch (error) {
                        console.error("[Site Observer] Failed to clear site records:", error);
                    }
                }
            });
        }

        this.$dialog.on("click", ".go-to-site-btn", async (event) => {
            const siteId = $(event.currentTarget).data("site-id") as string;
            this.selectedSiteId = siteId;
            const selectedSite: SiteConfig | undefined = Object.values(this.seasonConfig)
                .flatMap((season) => Object.values(season.sites))
                .find((site) => site.geocode.id === siteId);
            if (!selectedSite) return;

            let latE6 = selectedSite.geocode.latE6;
            let lngE6 = selectedSite.geocode.lngE6;

            try {
                const siteRecord = await this.dataManager.get(siteId);
                const centroid = siteRecord?.analysis?.centroid;
                if (centroid) {
                    latE6 = centroid.latE6;
                    lngE6 = centroid.lngE6;
                }
            } catch (error) {
                console.error(`[Site Observer: Dialog] Failed to retrieve site record for centroid:`, error);
            }

            win.map.setView([latE6 / 1e6, lngE6 / 1e6], 15);

            void this.updateSiteTable();
        });

        this.$dialog.on("click", ".export-site-btn", (event) => {
            const siteId = $(event.currentTarget).data("site-id") as string;
            window.dispatchEvent(
                new CustomEvent(ObserverCommand.EXPORT_SITE_DATA, {
                    detail: { siteId, timestamp: zonedDateTimeISO() },
                }),
            );
        });

        this.$dialog.on("click", ".export-discovery-btn", (event) => {
            const siteId = $(event.currentTarget).data("site-id") as string;
            window.dispatchEvent(
                new CustomEvent(ObserverCommand.EXPORT_SITE_DISCOVERY, {
                    detail: { siteId, timestamp: zonedDateTimeISO() },
                }),
            );
        });

        this.$dialog.on("click", ".export-targets-btn", (event) => {
            const siteId = $(event.currentTarget).data("site-id") as string;
            window.dispatchEvent(
                new CustomEvent(ObserverCommand.EXPORT_SITE_TARGET_PORTALS, {
                    detail: { siteId, timestamp: zonedDateTimeISO() },
                }),
            );
        });

        void this.updateSiteTable();
    }

    public async updateSiteTable() {
        if (!this.$tableContainer || !this.selectedDate || !this.siteConfigsByDate) return;

        try {
            const tableHtml = await this.renderer.generateSitesTableHtml(
                this.selectedDate,
                this.siteConfigsByDate,
                this.selectedSiteId,
            );
            this.$tableContainer.html(tableHtml);
        } catch (error) {
            console.error(`[Site Observer: Dialog] Failed to update site table:`, error);
        }
    }
}
