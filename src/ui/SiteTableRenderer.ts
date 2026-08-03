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
} from "@ingress-shards/ingress-events-core";
import type { SeasonConfig, SiteConfig, SiteRecord, SiteManifestMetadata } from "@ingress-shards/ingress-events-core";
import { SiteRecordManager } from "../db/SiteRecordManager";
import { renderScoringTable } from "./ScoringTableRenderer";
import type { DialogState } from "./ObserverDialog";
import type { Temporal } from "temporal-polyfill";

export class SiteTableRenderer {
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

    constructor(
        private dataManager: SiteRecordManager,
        private seasonConfig: Record<string, SeasonConfig>
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

    public async generateSitesTableHtml(
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

                let playboxHtml = "";

                let siteRecord: SiteRecord | undefined;
                try {
                    siteRecord = await this.dataManager.get(site.geocode.id);

                    const actualShards = siteRecord?.observations?.shards
                        ? Object.values(siteRecord.observations.shards).reduce((accumulator, shard) => 
                            accumulator + (shard.history?.filter((h) => h.action === "spawn").length || 0), 0
                          )
                        : 0;
                    const portals = siteRecord?.observations?.portals ? Object.values(siteRecord.observations.portals) : [];
                    const hasOrnaments = portals.some((p) => p.history?.some((h) => h.type === "pre-event"));

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
                    if(siteRecord?.analysis?.seasonPoints?.RES && siteRecord?.analysis?.seasonPoints?.ENL) {
                        scoreSummaryHtml = (
                            `<span style="color: ${FACTION_COLORS.RES};">RES: ${siteRecord.analysis.seasonPoints.RES}</span>` +
                            `&nbsp;` +
                            `<span style="color: ${FACTION_COLORS.ENL};">ENL: ${siteRecord.analysis.seasonPoints.ENL}</span>`
                        );
                    }
                }

                const isOpen = openSites[site.geocode.id] ?? false;
                return `
            <tr class="${isHighlighted ? "highlighted" : ""}">
                <td>
                    <details class="site-details" data-site-id="${site.geocode.id}" ${isOpen ? "open" : ""}>
                        <summary>
                            <div class="site-summary-left">
                                <span class="site-label" title="${site.geocode.name}">${site.geocode.name}</span>
                                <button class="go-to-site-btn" data-site-id="${site.geocode.id}" title="Go to Site">
                                    ${TACTICAL_MARKER_SVG.replace('class="marker-svg-pin"', `class="marker-svg-pin marker-site-inline" style="--pin-color: ${UI_COLORS.SIGNAL}"`)}
                                </button>
                            </div>
                            <span class="score-summary-block">${scoreSummaryHtml}</span>
                            <span class="site-status-inline">${SiteManager.formatStatus({ phase: sitePhase, timeRemaining })}</span>
                            </summary>
                        <div>
                            ${playboxHtml}
                            ${renderScoringTable(site, siteRecord)}
                        </div>
                    </details>
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
}
