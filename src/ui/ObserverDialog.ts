import { zonedDateTimeISO, instant } from "temporal-polyfill/fns/Now";
import { total } from "temporal-polyfill/fns/Duration";
import { diff as diffZonedDateTime } from "temporal-polyfill/fns/ZonedDateTime";
import { fromEpochMilliseconds, toZonedDateTimeISO } from "temporal-polyfill/fns/Instant";
import {
    parseTimestampFromFilename,
    convertSiteDiscoveryToMapSnapshot,
    type SeasonConfig,
    type SiteConfig,
    type SiteDiscovery,
    formatDuration,
    EXPORT_ICON_SVG,
    getOrnamentSVG,
    UI_COLORS,
    getTargetOrnamentSVG,
} from "@ingress-shards/ingress-events-core";
import { ObserverCommand, ObserverResult, UITrigger } from "../types/ObserverEvents";
import { SiteRecordManager } from "../db/SiteRecordManager";
import { SiteTableRenderer } from "./SiteTableRenderer";
import { ObserverScheduler } from "../ObserverScheduler";

interface SiteObserverWindow extends Window {
    dialog: (options: { title: string; html: string; id: string; width: number; resizable?: boolean }) => JQuery;
    map: L.Map;
}

export interface DialogState {
    selectedDate?: string;
    selectedSiteId?: string;
    openSites: Record<string, boolean>;
    position: { left: number; top: number };
}

export class ObserverDialog {
    private siteConfigsByDate?: Record<string, SiteConfig[]>;
    private dialogState: DialogState;

    private $dialog?: JQuery;
    private $tableContainer?: JQuery;
    private renderer: SiteTableRenderer;

    private lastDownloadJumpsTimestamp?: ReturnType<typeof zonedDateTimeISO>;
    private activeTimer?: number;
    private dataUpdateListener = () => { void this.updateSiteTable(); };

    constructor(
        private seasonConfig: Record<string, SeasonConfig>,
        private dataManager: SiteRecordManager,
        private scheduler: ObserverScheduler,
    ) {
        this.renderer = new SiteTableRenderer(this.dataManager, this.seasonConfig);
        this.dialogState = {
            openSites: {},
            position: { left: 60, top: 40 }
        };
    }

    public show() {
        this.siteConfigsByDate ??= SiteTableRenderer.getSiteConfigsByDate(this.seasonConfig);

        const nextAlarm = this.scheduler.getNextAlarm();
        let nextAlarmHtml = "";
        if (nextAlarm) {
            const nowZoned = zonedDateTimeISO(nextAlarm.timeZone);
            const alarmZoned = toZonedDateTimeISO(
                fromEpochMilliseconds(nextAlarm.timestamp),
                nextAlarm.timeZone,
            );
            const duration = diffZonedDateTime(nowZoned, alarmZoned, {
                largestUnit: "day",
            });
            nextAlarmHtml = `<div class="next-alarm-label">next data update in ${formatDuration(duration, true)}</div>`;
        }

        const actionMenuHtml = `
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
                    <button id="load-local-ornaments-button" class="observer-button" title="Load Ornaments from Local JSON file">Load Ornaments</button>
                    <input type="file" id="local-ornaments-file-input" style="display: none;" accept=".json" />
                    <button id="load-local-targets-button" class="observer-button" title="Load Target Portals from Local JSON file">Load Targets</button>
                    <input type="file" id="local-targets-file-input" style="display: none;" accept=".json" />
                    <button id="load-local-jumps-button" class="observer-button" title="Load Shard Jumps from Local JSON file">Load Shard Jumps</button>
                    <input type="file" id="local-jumps-file-input" style="display: none;" accept=".json" />
                    <button id="clear-all-data-button" class="observer-button warning-button" title="Clear all site data from database">Clear All Site Data</button>
                </div>
            </details>
        `;

        const showFooter = !!(nextAlarmHtml || actionMenuHtml);

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
                                        `<option value="${date}" ${date === this.dialogState.selectedDate ? "selected" : ""}>${date}</option>`,
                                )
                                .join("")}
                        </select>
                    </div>
                    <div id="sites-table-container"></div>
                </main>
                ${showFooter ? `
                <footer class="observer-footer">
                    <div class="observer-footer-content">
                        ${nextAlarmHtml}
                        ${actionMenuHtml}
                    </div>
                </footer>
                ` : ''}
            </section>
        `;

        const win = window as unknown as SiteObserverWindow;
        this.$dialog = win.dialog({
            title: "Site Observer",
            html: html,
            id: "site-observer",
            width: 500,
            resizable: false,
        });
        this.$tableContainer = this.$dialog.find("#sites-table-container");

        if (this.dialogState.position) {
            this.$dialog.parent().offset(this.dialogState.position);
        }

        window.addEventListener(UITrigger.SIGNAL_DATA_UPDATE, this.dataUpdateListener);
        
        this.$dialog.on("dialogclose", () => {
            window.removeEventListener(UITrigger.SIGNAL_DATA_UPDATE, this.dataUpdateListener);
            if (this.activeTimer) {
                clearTimeout(this.activeTimer);
            }
        });

        this.$dialog.on("dialogdragstop", () => {
            const offset = this.$dialog?.parent().offset();
            if (offset) {
                this.dialogState.position = {
                    left: offset.left,
                    top: offset.top,
                };
            }
        });

        this.$dialog.on("change", "#date-select", (event) => {
            this.dialogState.selectedDate = $(event.target).val() as string;
            void this.updateSiteTable();
        });

        this.$dialog.on("click", "summary", (event) => {
            if ($(event.target).closest("button").length > 0) {
                return;
            }
            const $details = $(event.currentTarget).closest("details");
            const siteId = $details.data("site-id") as string;
            if (siteId) {
                this.dialogState.openSites[siteId] = !$details.prop("open");
            }
        });

        this.$dialog.on("click", "#manual-download-jumps-button", () => {
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

        this.$dialog.on("click", "#load-local-jumps-button", () => {
            this.$dialog?.find("#local-jumps-file-input").trigger("click");
        });

        this.$dialog.on("change", "#local-jumps-file-input", (event) => {
            const input = event.target as HTMLInputElement;
            if (!input.files || input.files.length === 0) return;
            const file = input.files[0];
            if (!file) return;

            file.text()
                .then((content) => {
                    const data = JSON.parse(content);
                    const parsedTimestamp = parseTimestampFromFilename(file.name);
                    if (parsedTimestamp === undefined) {
                        throw new Error(`Could not parse timestamp from filename: ${file.name}`);
                    }

                    const captureData = {
                        ...data,
                        timestamp: parsedTimestamp,
                    };

                    window.dispatchEvent(
                        new CustomEvent(ObserverResult.SHARD_JUMPS_OBSERVED, {
                            detail: captureData,
                        }),
                    );
                    console.log("[Site Observer] Local shard jumps loaded successfully.");
                    input.value = "";
                })
                .catch((error: unknown) => {
                    console.error("[Site Observer] Failed to read or parse local shard jumps JSON:", error);
                    alert(error instanceof Error ? error.message : "Failed to read or parse local shard jumps JSON. Check console for details.");
                });
        });

        this.$dialog.on("click", "#load-local-targets-button", () => {
            this.$dialog?.find("#local-targets-file-input").trigger("click");
        });

        this.$dialog.on("change", "#local-targets-file-input", (event) => {
            const input = event.target as HTMLInputElement;
            if (!input.files || input.files.length === 0) return;
            const file = input.files[0];
            if (!file) return;

            file.text()
                .then((content) => {
                    const data = JSON.parse(content);
                    window.dispatchEvent(
                        new CustomEvent(ObserverResult.SITE_TARGETS_OBSERVED, {
                            detail: data,
                        }),
                    );
                    console.log("[Site Observer] Local target portals loaded successfully.");
                    input.value = "";
                })
                .catch((error: unknown) => {
                    console.error("[Site Observer] Failed to read or parse local target portals JSON:", error);
                    alert("Failed to read or parse local target portals JSON. Check console for details.");
                });
        });

        this.$dialog.on("click", "#load-local-ornaments-button", () => {
            this.$dialog?.find("#local-ornaments-file-input").trigger("click");
        });

        this.$dialog.on("change", "#local-ornaments-file-input", (event) => {
            const input = event.target as HTMLInputElement;
            if (!input.files || input.files.length === 0) return;
            const file = input.files[0];
            if (!file) return;

            file.text()
                .then((content) => {
                    const data = JSON.parse(content);

                    // Parse timestamp from filename if available
                    const parsedTimestamp = parseTimestampFromFilename(file.name);
                    if (parsedTimestamp === undefined) {
                        throw new Error(`Could not parse timestamp from filename: ${file.name}`);
                    }

                    const finalTimestamp = parsedTimestamp;

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
                    alert(error instanceof Error ? error.message : "Failed to read or parse local ornaments JSON. Check console for details.");
                });
        });

        this.$dialog.on("click", "#clear-all-data-button", async () => {
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

        this.$dialog.on("click", "details.site-details", (event) => {
            const siteId = $(event.currentTarget).data("site-id") as string;
            this.dialogState.selectedSiteId = siteId;
            void this.updateSiteTable();
            this.updateSelectedSiteText();
        })

        this.$dialog.on("click", ".go-to-site-btn", async (event) => {
            const siteId = $(event.currentTarget).data("site-id") as string;
            this.dialogState.selectedSiteId = siteId;
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

        this.$dialog.on("click", ".export-site-record-button", () => {
            window.dispatchEvent(
                new CustomEvent(ObserverCommand.EXPORT_SITE_DATA, {
                    detail: { siteId: this.dialogState.selectedSiteId },
                }),
            );
        });

        this.$dialog.on("click", ".export-ornaments-button", () => {
            window.dispatchEvent(
                new CustomEvent(ObserverCommand.EXPORT_SITE_DISCOVERY, {
                    detail: { siteId: this.dialogState.selectedSiteId },
                }),
            );
        });

        this.$dialog.on("click", ".export-targets-button", () => {
            window.dispatchEvent(
                new CustomEvent(ObserverCommand.EXPORT_SITE_TARGET_PORTALS, {
                    detail: { siteId: this.dialogState.selectedSiteId },
                }),
            );
        });

        this.$dialog.on("click", ".clear-site-data-button", async () => {
            const siteId = this.dialogState.selectedSiteId;
            if (!siteId) return;

            const { selectedDate } = this.dialogState;
            const site = selectedDate ? this.siteConfigsByDate?.[selectedDate]?.find(
                (s) => s.geocode.id === siteId,
            ) : undefined;
            const siteName = site?.geocode.name ?? siteId;

            if (confirm(`Are you sure you want to clear site data for ${siteName}?`)) {
                try {
                    await this.dataManager.delete(siteId);
                    console.log(`[Site Observer] Site record for ${siteId} cleared.`);
                    window.dispatchEvent(new CustomEvent(UITrigger.SIGNAL_DATA_UPDATE));
                } catch (error) {
                    console.error(`[Site Observer] Failed to clear site data for ${siteId}:`, error);
                }
            }
        });

        void this.updateSiteTable();
        this.updateSelectedSiteText();
        this.scheduleNextUpdate();
    }

    private updateSelectedSiteText() {
        const {selectedSiteId, selectedDate} = this.dialogState;
        if (selectedSiteId && selectedDate) {
            const configs = this.siteConfigsByDate?.[selectedDate];
            if (configs) {
                const site = configs.find(
                    (site) => site.geocode.id === selectedSiteId,
                );
                if (site) {
                    this.$dialog?.find("#selected-site-name").text(`${site.geocode.name} (${selectedDate})`);
                }
            }
        }
    }

    private scheduleNextUpdate() {
        const msToNextSecond = 1000 - (instant().epochMilliseconds % 1000);
        this.activeTimer = window.setTimeout(() => {
            this.updateAlarmCountdown();
            
            const nowMs = instant().epochMilliseconds;
            if (Math.floor(nowMs / 1000) % 60 === 0) {
                void this.updateSiteTable();
            }
            
            this.scheduleNextUpdate();
        }, msToNextSecond);
    }

    private updateAlarmCountdown() {
        const nextAlarm = this.scheduler.getNextAlarm();
        const $label = this.$dialog?.find(".next-alarm-label");
        if (!$label || $label.length === 0) return;

        if (nextAlarm) {
            const nowZoned = zonedDateTimeISO(nextAlarm.timeZone);
            const alarmZoned = toZonedDateTimeISO(
                fromEpochMilliseconds(nextAlarm.timestamp),
                nextAlarm.timeZone,
            );
            const duration = diffZonedDateTime(nowZoned, alarmZoned, {
                largestUnit: "day",
            });
            $label.text(`next data update in ${formatDuration(duration, true)}`);
        } else {
            $label.text("");
        }
    }

    public async updateSiteTable() {
        if (!this.$tableContainer || !this.siteConfigsByDate || !this.dialogState) return;

        try {
            const tableHtml = await this.renderer.generateSitesTableHtml(
                this.siteConfigsByDate,
                this.dialogState,
            );
            this.$tableContainer.html(tableHtml);
        } catch (error) {
            console.error(`[Site Observer: Dialog] Failed to update site table:`, error);
        }
    }
}
