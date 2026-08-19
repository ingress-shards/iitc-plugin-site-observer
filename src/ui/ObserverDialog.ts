import { zonedDateTimeISO, instant } from "temporal-polyfill/fns/Now";
import { diff as diffZonedDateTime } from "temporal-polyfill/fns/ZonedDateTime";
import { fromEpochMilliseconds, toZonedDateTimeISO } from "temporal-polyfill/fns/Instant";
import {
    type SeasonConfig,
    type SiteConfig,
    type SiteRecord,
    formatDuration,
} from "@ingress-shards/ingress-events-core";
import { UITrigger } from "../types/ObserverEvents";
import { SiteRecordManager } from "../db/SiteRecordManager";
import { SiteTableComponent, type DateOptionGroup } from "./components/SiteTableComponent";
import { ActionMenuComponent } from "./components/ActionMenuComponent";
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
    private dateOptionGroups?: DateOptionGroup[];
    private dialogState: DialogState;

    private $dialog?: JQuery;
    private $tableContainer?: JQuery;
    private siteTableComponent: SiteTableComponent;
    private actionMenuComponent: ActionMenuComponent;

    private activeTimer?: number;
    private dataUpdateListener = () => { void this.updateSiteTable(); };

    constructor(
        private seasonConfig: Record<string, SeasonConfig>,
        private dataManager: SiteRecordManager,
        private scheduler: ObserverScheduler,
    ) {
        this.siteTableComponent = new SiteTableComponent(
            this.dataManager,
            this.seasonConfig,
            this.handleSiteSelected.bind(this),
            this.handleSiteToggled.bind(this)
        );
        this.actionMenuComponent = new ActionMenuComponent(this.dataManager, () => this.dialogState.selectedSiteId);
        this.dialogState = {
            openSites: {},
            position: { left: 60, top: 40 }
        };
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

    private handleSiteSelected(siteId: string) {
        this.dialogState.selectedSiteId = siteId;
        void this.updateSiteTable();
        this.updateSelectedSiteText();
    }

    private handleSiteToggled(siteId: string, isOpen: boolean) {
        this.dialogState.openSites[siteId] = isOpen;
    }

    private scheduleNextUpdate() {
        const msToNextSecond = 1000 - (instant().epochMilliseconds % 1000);
        this.activeTimer = window.setTimeout(() => {
            this.updateAlarmCountdown();
            
            const nowMs = instant().epochMilliseconds;
            if (Math.floor(nowMs / 1000) % 60 === 0) {
                window.dispatchEvent(new CustomEvent(UITrigger.UPDATE_SITE_STATUS));
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

    public show() {
        this.siteConfigsByDate ??= SiteTableComponent.getSiteConfigsByDate(this.seasonConfig);
        this.dateOptionGroups ??= SiteTableComponent.getDateOptionGroups(this.seasonConfig);

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

        const actionMenuHtml = this.actionMenuComponent.render();

        const shouldShowFooter = !!(nextAlarmHtml || actionMenuHtml);

        const html = `
            <section>
                <main>
                    <div class="site-controls">
                        <label class="ui-label" for="date-select">Date:</label>
                        <select id="date-select">
                            <option value="">-- Select Date --</option>
                            ${this.dateOptionGroups.map((group) => `
                                <optgroup label="${group.label}">
                                    ${group.dates.map((date) => `
                                        <option value="${date.value}" ${date.value === this.dialogState.selectedDate ? "selected" : ""}>${date.label}</option>
                                    `).join("")}
                                </optgroup>
                            `).join("")}
                        </select>
                    </div>
                    <div id="sites-table-container"></div>
                </main>
                ${shouldShowFooter ? `
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

        // Delegate component event bindings
        this.actionMenuComponent.bindEvents(this.$dialog);
        this.siteTableComponent.bindEvents(this.$dialog);

        void this.updateSiteTable();
        this.updateSelectedSiteText();
        this.scheduleNextUpdate();
    }

    public getSiteConfig(siteId: string): SiteConfig | undefined {
        if (!this.siteConfigsByDate) return undefined;
        for (const list of Object.values(this.siteConfigsByDate)) {
            const found = list.find(c => c.geocode.id === siteId);
            if (found) return found;
        }
        return undefined;
    }

    public async getSiteRecord(siteId: string): Promise<SiteRecord | undefined> {
        return this.dataManager.get(siteId);
    }

    public async updateSiteTable() {
        if (!this.$tableContainer || !this.siteConfigsByDate || !this.dialogState) return;

        try {
            const tableHtml = await this.siteTableComponent.render(
                this.siteConfigsByDate,
                this.dialogState,
            );
            this.$tableContainer.html(tableHtml);
        } catch (error) {
            console.error(`[Site Observer: Dialog] Failed to update site table:`, error);
        }
    }
}
