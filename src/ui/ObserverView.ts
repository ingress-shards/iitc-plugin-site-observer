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

export interface ViewState {
    selectedDate?: string;
    selectedSiteId?: string;
    openSites: Record<string, boolean>;
}

/**
 * Presentation-agnostic view component for the Site Observer.
 * Handles markup generation, user interaction, state, and periodic countdowns.
 */
export class ObserverView {
    private siteConfigsByDate?: Record<string, SiteConfig[]>;
    private dateOptionGroups?: DateOptionGroup[];
    private viewState: ViewState;

    private $root?: JQuery;
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
        this.actionMenuComponent = new ActionMenuComponent(this.dataManager, () => this.viewState.selectedSiteId);
        this.viewState = {
            openSites: {},
        };
    }

    private updateSelectedSiteText() {
        const { selectedSiteId, selectedDate } = this.viewState;
        if (selectedSiteId && selectedDate) {
            const configs = this.siteConfigsByDate?.[selectedDate];
            if (configs) {
                const site = configs.find(
                    (site) => site.geocode.id === selectedSiteId,
                );
                if (site) {
                    this.$root?.find("#selected-site-name").text(`${site.geocode.name} (${selectedDate})`);
                }
            }
        }
    }

    private handleSiteSelected(siteId: string) {
        this.viewState.selectedSiteId = siteId;
        void this.updateSiteTable();
        this.updateSelectedSiteText();
    }

    private handleSiteToggled(siteId: string, isOpen: boolean) {
        this.viewState.openSites[siteId] = isOpen;
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
        const $label = this.$root?.find(".next-alarm-label");
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

    private buildHtml(): string {
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

        return `
            <section>
                <main>
                    <div class="site-controls">
                        <label class="ui-label" for="date-select">Date:</label>
                        <select id="date-select">
                            <option value="">-- Select Date --</option>
                            ${this.dateOptionGroups.map((group) => `
                                <optgroup label="${group.label}">
                                    ${group.dates.map((date) => `
                                        <option value="${date.value}" ${date.value === this.viewState.selectedDate ? "selected" : ""}>${date.label}</option>
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
                ` : ""}
            </section>
        `;
    }

    /**
     * Mounts the view into a given container element.
     */
    public mount($container: JQuery): void {
        this.$root = $container;
        $container.html(this.buildHtml());
        this.$tableContainer = $container.find("#sites-table-container");

        window.addEventListener(UITrigger.SIGNAL_DATA_UPDATE, this.dataUpdateListener);

        $container.off("change", "#date-select").on("change", "#date-select", (event) => {
            this.viewState.selectedDate = (event.target as HTMLSelectElement).value;
            void this.updateSiteTable();
        });

        this.actionMenuComponent.bindEvents($container);
        this.siteTableComponent.bindEvents($container);

        void this.updateSiteTable();
        this.updateSelectedSiteText();
        this.scheduleNextUpdate();
    }

    /**
     * Unmounts the view and cleans up active timers and event listeners.
     */
    public unmount(): void {
        window.removeEventListener(UITrigger.SIGNAL_DATA_UPDATE, this.dataUpdateListener);
        if (this.activeTimer) {
            clearTimeout(this.activeTimer);
            this.activeTimer = undefined;
        }
        this.$root = undefined;
        this.$tableContainer = undefined;
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

    public async updateSiteTable(): Promise<void> {
        if (!this.$tableContainer || !this.siteConfigsByDate || !this.viewState) return;

        try {
            const tableHtml = await this.siteTableComponent.render(
                this.siteConfigsByDate,
                this.viewState,
            );
            this.$tableContainer.html(tableHtml);
        } catch (error) {
            console.error(`[Site Observer: View] Failed to update site table:`, error);
        }
    }
}
