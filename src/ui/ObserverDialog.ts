import { zonedDateTimeISO } from "temporal-polyfill/fns/now";
import { total } from "temporal-polyfill/fns/duration";
import { since } from "temporal-polyfill/fns/zoneddatetime";
import type { SeasonConfig, SiteConfig } from "@ingress-shards/ingress-events-core";
import { ObserverCommand } from "../types/ObserverEvents";
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

    constructor(
        private seasonConfig: Record<string, SeasonConfig>,
        private dataManager: SiteRecordManager,
    ) {
        this.renderer = new SiteTableRenderer(this.dataManager);
    }

    public show() {
        this.siteConfigsByDate ??= SiteTableRenderer.getSiteConfigsByDate(this.seasonConfig);

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
                        <button id="manual-download-jumps-button" class="observer-button" title="Force Shard Jump Download">Download Jumps</button>
                    </div>
                    <div id="sites-table-container"></div>
                </main>
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

        this.$dialog.on("click", ".go-to-site-btn", (event) => {
            const siteId = $(event.currentTarget).data("site-id") as string;
            this.selectedSiteId = siteId;
            const selectedSite: SiteConfig | undefined = Object.values(this.seasonConfig)
                .flatMap((season) => Object.values(season.sites))
                .find((site) => site.geocode.id === siteId);
            if (!selectedSite) return;
            win.map.setView([selectedSite.geocode.latE6 / 1e6, selectedSite.geocode.lngE6 / 1e6], 15);

            window.dispatchEvent(
                new CustomEvent(ObserverCommand.FETCH_PRE_EVENT_ORNAMENTS, {
                    detail: {
                        siteId,
                        timestamp: zonedDateTimeISO(),
                    },
                }),
            );

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
