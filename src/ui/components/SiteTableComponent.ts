import { fromFields } from "temporal-polyfill/fns/Duration";
import { zonedDateTimeISO } from "temporal-polyfill/fns/Now";
import { diff as diffZonedDateTime, toPlainDate, add as addZoned } from "temporal-polyfill/fns/ZonedDateTime";
import { toString as dateToString } from "temporal-polyfill/fns/PlainDate";
import {
    SitePhase,
    SiteManager,
    TACTICAL_MARKER_SVG,
    UI_COLORS,
    calculateBoundingBoxDimensions,
    FACTION_COLORS,
    parseZonedDateTime,
    roundToDecimalPlaces
} from "@ingress-shards/ingress-events-core";
import type { SeasonConfig, SiteConfig, SiteRecord, SiteManifestMetadata } from "@ingress-shards/ingress-events-core";
import { SiteRecordManager } from "../../db/SiteRecordManager";
import { ScoringTableComponent } from "./ScoringTableComponent";
import type { DialogState } from "../ObserverDialog";
import type { Temporal } from "temporal-polyfill";
import { UITrigger } from "../../types/ObserverEvents";

const formatPoints = (value: number) => roundToDecimalPlaces(value, 1).toString();

export interface DateOptionGroup {
    label: string;
    seasonId: string;
    dates: {
        value: string;
        label: string;
    }[];
}

export class SiteTableComponent {
    public static getSiteConfigsByDate(seasonConfig: Record<string, SeasonConfig>): Record<string, SiteConfig[]> {
        const siteConfigs: Record<string, SiteConfig[]> = {};
        for (const season of Object.values(seasonConfig)) {
            for (const siteConfig of Object.values(season.sites)) {
                const startDate = parseZonedDateTime(siteConfig.geocode.startTime);
                const dateKey = dateToString(toPlainDate(startDate));
                const list = (siteConfigs[dateKey] ??= []);
                list.push(siteConfig);
            }
        }
        return siteConfigs;
    }

    public static getDateOptionGroups(seasonConfig: Record<string, SeasonConfig>): DateOptionGroup[] {
        const groups: DateOptionGroup[] = [];
        
        const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
        const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

        for (const season of Object.values(seasonConfig)) {
            const uniqueDatesMap = new Map<string, any>();
            for (const siteConfig of Object.values(season.sites)) {
                const startDate = parseZonedDateTime(siteConfig.geocode.startTime);
                const pd = toPlainDate(startDate);
                const dateKey = dateToString(pd);
                uniqueDatesMap.set(dateKey, pd);
            }

            if (uniqueDatesMap.size > 0) {
                // eslint-disable-next-line unicorn/no-array-sort, unicorn/prefer-iterator-to-array
                const sortedKeys = [...uniqueDatesMap.keys()].sort((a, b) => a.localeCompare(b));
                
                const formattedDates = sortedKeys.map((dateKey) => {
                    const pd = uniqueDatesMap.get(dateKey)!;
                    // Zeller's congruence for day of week (0 = Sunday, 6 = Saturday)
                    let y = Number(pd.year);
                    const m = Number(pd.month);
                    const d = Number(pd.day);
                    const t = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4];
                    y -= m < 3 ? 1 : 0;
                    const dow = (y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) + (t[m - 1] ?? 0) + d) % 7;

                    return {
                        value: dateKey,
                        label: `${days[dow] ?? ""} ${pd.day} ${months[pd.month - 1] ?? ""}`
                    };
                });

                groups.push({
                    label: `${season.metadata.year}: ${season.metadata.name}`,
                    seasonId: season.metadata.id,
                    dates: formattedDates
                });
            }
        }

        // Sort groups descending by the first date in the group (most recent season first)
        groups.sort((a, b) => {
            const aFirstDate = a.dates[0]?.value ?? "";
            const bFirstDate = b.dates[0]?.value ?? "";
            return bFirstDate.localeCompare(aFirstDate);
        });

        return groups;
    }

    private scoringTableComponent = new ScoringTableComponent();

    constructor(
        private dataManager: SiteRecordManager,
        private seasonConfig: Record<string, SeasonConfig>,
        private onSiteSelected: (siteId: string) => void,
        private onSiteToggled: (siteId: string, isOpen: boolean) => void
    ) {}

    private getSiteManifestMetadata(siteConfig: SiteConfig): SiteManifestMetadata | undefined {
        for (const season of Object.values(this.seasonConfig)) {
            for (const component of season.metadata.components) {
                if (component.eventType === siteConfig.geocode.eventType && component.schedule) {
                    for (const day of component.schedule) {
                        const match = day.sites.find(s => s.latE6 === siteConfig.geocode.latE6 && s.lngE6 === siteConfig.geocode.lngE6);
                        if (match) {
                            return match;
                        }
                    }
                }
            }
        }
        return undefined;
    }

    private getSiteStatus(siteConfig: SiteConfig, actualShards: number = 0, hasOrnaments: boolean = false): { sitePhase: SitePhase; timeRemaining: Temporal.DurationLikeObject | undefined } {
        if (!siteConfig) {
            return { sitePhase: SitePhase.NoData, timeRemaining: undefined };
        }

        const startTimeZoned = parseZonedDateTime(siteConfig.geocode.startTime);
        const shardMechanics = siteConfig.mechanics.shards?.shardMechanics;
        const durationMins = shardMechanics ? SiteManager.getEventDuration(shardMechanics) : 0;
        const endTimeZoned = addZoned(startTimeZoned, fromFields({ minutes: durationMins }));
        const nowZoned = zonedDateTimeISO(startTimeZoned.timeZoneId);

        const metadata = this.getSiteManifestMetadata(siteConfig);
        const expectedShards = shardMechanics 
            ? SiteManager.getExpectedShardCount(shardMechanics, metadata) 
            : 0;

        const sitePhase = SiteManager.calculatePhase({
            startTime: startTimeZoned,
            eventDurationMins: durationMins,
            shards: { actual: actualShards, expected: expectedShards },
            hasOrnaments,
        });

        let timeRemaining: Temporal.DurationLikeObject | undefined = undefined;
        if ([SitePhase.Scheduled, SitePhase.Discovery, SitePhase.StandBy].includes(sitePhase)) {
            timeRemaining = diffZonedDateTime(nowZoned, startTimeZoned, {
                smallestUnit: "minutes",
                largestUnit: "days",
            });
        } else if (sitePhase === SitePhase.Active) {
            timeRemaining = diffZonedDateTime(nowZoned, endTimeZoned, {
                smallestUnit: "minutes",
                largestUnit: "days",
            });
        }

        return { sitePhase, timeRemaining };
    }

    public async render(
        siteConfigsByDate: Record<string, SiteConfig[]>,
        dialogState: DialogState,
    ): Promise<string> {
        const selectedDate = dialogState.selectedDate;
        const selectedSiteId = dialogState.selectedSiteId;
        const openSites = dialogState.openSites ?? {};
        const sites = selectedDate && siteConfigsByDate ? siteConfigsByDate[selectedDate] : [];
        if (!selectedDate || !sites || sites.length === 0) {
            return `
                    <div class="site-status-placeholder">
                        Select a date to observe sites for that day.
                    </div>
                `;
        }

        const rows = await Promise.all(
            sites.map(async (site) => {
                const isHighlighted = selectedSiteId === site.geocode.id;
                let sitePhase: SitePhase;
                let timeRemaining: Temporal.DurationLike | undefined;

                let actualShards = 0;
                let hasOrnaments = false;
                let playboxHtml = "";

                let siteRecord: SiteRecord | undefined;
                try {
                    siteRecord = await this.dataManager.get(site.geocode.id);

                    actualShards = siteRecord?.observations?.shards
                        ? Object.values(siteRecord.observations.shards).reduce((accumulator, shard) => 
                            accumulator + (shard.history?.filter((h) => h.action === "spawn").length || 0), 0
                          )
                        : 0;
                    const portals = siteRecord?.observations?.portals ? Object.values(siteRecord.observations.portals) : [];
                    hasOrnaments = siteRecord?.analysis?.hasPreEventOrnaments ?? portals.some((p) => p.history?.some((h) => h.type === "pre-event"));

                    ({ sitePhase, timeRemaining } = this.getSiteStatus(site, actualShards, hasOrnaments));

                    const preEventPortals = portals.filter((p) => p.history?.some((h) => h.type === "pre-event"));

                    if (preEventPortals.length > 1) {
                        const dimensions = calculateBoundingBoxDimensions(preEventPortals);
                        playboxHtml = `<div class="site-dimensions">Playbox: ${preEventPortals.length} portals, ${(dimensions.width / 1000).toFixed(1)}km x ${(dimensions.height / 1000).toFixed(1)}km</div>`;
                    }
                } catch (error) {
                    console.error(
                        `[Site Observer: Table Renderer] Failed to retrieve site record for ${site.geocode.id}:`,
                        error,
                    );
                    ({ sitePhase, timeRemaining } = this.getSiteStatus(site));
                }

                let scoreSummaryHtml = '';
                if([SitePhase.Active, SitePhase.Processing, SitePhase.Complete].includes(sitePhase)) {
                    let ptsENL = 0;
                    let ptsRES = 0;
                    if (siteRecord?.analysis?.seasonPoints) {
                        ptsENL = siteRecord.analysis.seasonPoints.points?.ENL ?? 0;
                        ptsRES = siteRecord.analysis.seasonPoints.points?.RES ?? 0;
                    } else if (siteRecord?.analysis?.waves) {
                        for (const wave of Object.values(siteRecord.analysis.waves)) {
                            ptsENL += wave.points?.total?.ENL ?? 0;
                            ptsRES += wave.points?.total?.RES ?? 0;
                        }
                    }

                    scoreSummaryHtml = (
                        `<span style="color: ${FACTION_COLORS.ENL};">ENL: ${formatPoints(ptsENL)}</span>` +
                        ` / ` +
                        `<span style="color: ${FACTION_COLORS.RES};">RES: ${formatPoints(ptsRES)}</span>`
                    );
                }

                const isOpen = openSites[site.geocode.id] ?? false;
                return `
            <tr class="${isHighlighted ? "highlighted" : ""}">
                <td>
                    <div class="site-row ${isOpen ? "is-open" : ""}" data-site-id="${site.geocode.id}" data-actual-shards="${actualShards}" data-has-ornaments="${hasOrnaments}">
                        <div class="site-row-header">
                            <span class="site-row-arrow">▶</span>
                            <div class="site-summary-left">
                                <span class="site-label" title="${site.geocode.name}">${site.geocode.name}</span>
                                <button class="go-to-site-btn" data-site-id="${site.geocode.id}" title="Go to Site">
                                    ${TACTICAL_MARKER_SVG.replace('class="marker-svg-pin"', `class="marker-svg-pin marker-site-inline" style="--pin-color: ${UI_COLORS.SIGNAL}"`)}
                                </button>
                            </div>
                            <span class="score-summary-block">${scoreSummaryHtml}</span>
                            <span class="site-status-inline">${SiteManager.formatStatus({ phase: sitePhase, timeRemaining })}</span>
                        </div>
                        <div class="site-row-body">
                            <div class="site-row-body-inner">
                                ${playboxHtml}
                                ${this.scoringTableComponent.render(site, siteRecord)}
                            </div>
                        </div>
                    </div>
                </td>
            </tr>
            `;
            }),
        );

        return `
                <table class="sites-table">
                    <tbody>
                        ${rows.join("")}
                    </tbody>
                </table>
            `;
    }

    public bindEvents($container: JQuery): void {
        const win = window as any; // Re-use the existing map reference or pass it in

        window.addEventListener(UITrigger.UPDATE_SITE_STATUS, () => {
            $container.find(".site-row").each((_, element) => {
                const $row = $(element);
                const siteId = $row.data("site-id") as string;
                if (!siteId) return;

                const selectedSite: SiteConfig | undefined = Object.values(this.seasonConfig)
                    .flatMap((season) => Object.values(season.sites))
                    .find((site) => site.geocode.id === siteId);
                const actualShards = Number($row.attr("data-actual-shards") ?? "0");
                const hasOrnaments = $row.attr("data-has-ornaments") === "true";
                
                if (selectedSite) {
                    const { sitePhase, timeRemaining } = this.getSiteStatus(selectedSite, actualShards, hasOrnaments);
                    $row.find(".site-status-inline").html(SiteManager.formatStatus({ phase: sitePhase, timeRemaining }));
                }
            });
        });

        $container.on("click", ".site-row-header", (event) => {
            const $siteRow = $(event.currentTarget).closest(".site-row");
            const siteId = $siteRow.data("site-id") as string;
            if (siteId) {
                $siteRow.toggleClass("is-open");
                this.onSiteToggled(siteId, $siteRow.hasClass("is-open"));
            }
        });

        $container.on("click", ".site-row", (event) => {
            const siteId = $(event.currentTarget).closest(".site-row").data("site-id") as string;
            if (siteId) {
                this.onSiteSelected(siteId);
            }
        });

        $container.on("click", ".go-to-site-btn", async (event) => {
            const siteId = $(event.currentTarget).data("site-id") as string;
            if (siteId) {
                this.onSiteSelected(siteId);

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
                    console.error(`[Site Observer: SiteTableComponent] Failed to retrieve site record for centroid:`, error);
                }

                if (win.map) {
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
                    win.map.setView([latE6 / 1e6, lngE6 / 1e6], 15);
                }
            }
        });
    }
}
