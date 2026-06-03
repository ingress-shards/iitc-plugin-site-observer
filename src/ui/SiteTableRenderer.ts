import { fromFields } from "temporal-polyfill/fns/duration";
import { zonedDateTimeISO } from "temporal-polyfill/fns/now";
import { timeZoneId as timeZoneIdZoned } from "temporal-polyfill/fns/zoneddatetime";
import { fromString, until, toPlainDate, add as addZoned } from "temporal-polyfill/fns/zoneddatetime";
import { toString as dateToString } from "temporal-polyfill/fns/plaindate";
import {
    SitePhase,
    SiteManager,
    TACTICAL_MARKER_SVG,
    UI_COLORS,
    EXPORT_ICON_SVG,
    getOrnamentSVG,
    calculateBoundingBoxDimensions,
} from "@ingress-shards/ingress-events-core";
import type { SeasonConfig, SiteConfig } from "@ingress-shards/ingress-events-core";
import { SiteRecordManager } from "../db/SiteRecordManager";

export class SiteTableRenderer {
    constructor(private dataManager: SiteRecordManager) {}

    public static getSiteConfigsByDate(seasonConfig: Record<string, SeasonConfig>): Record<string, SiteConfig[]> {
        const siteConfigs: Record<string, SiteConfig[]> = {};
        for (const [, season] of Object.entries(seasonConfig)) {
            for (const [, siteConfig] of Object.entries(season.sites)) {
                const startDate = fromString(siteConfig.geocode.startTime);
                const dateKey = dateToString(toPlainDate(startDate));
                if (!siteConfigs[dateKey]) {
                    siteConfigs[dateKey] = [];
                }
                siteConfigs[dateKey].push(siteConfig);
            }
        }
        return siteConfigs;
    }

    public async generateSitesTableHtml(
        selectedDate: string,
        siteConfigsByDate: Record<string, SiteConfig[]>,
        selectedSiteId?: string,
    ): Promise<string> {
        const sites = selectedDate && siteConfigsByDate ? siteConfigsByDate[selectedDate] : [];
        if (!selectedDate || !sites || sites.length === 0) {
            return `
                    <div class="ornament-status-placeholder">
                        Select a date to observe sites for that day.
                    </div>
                `;
        }

        const rows = await Promise.all(
            sites.map(async (site) => {
                const isHighlighted = selectedSiteId === site.geocode.id;
                const status = this.getSiteStatus(site);

                let portalCount = 0;
                let dimensionsHtml = "";

                try {
                    const siteRecord = await this.dataManager.get(site.geocode.id);
                    const portals = siteRecord?.observations?.portals
                        ? Object.values(siteRecord.observations.portals)
                        : [];
                    const preEventPortals = portals.filter((p) => p.history.some((h) => h.type === "pre-event"));

                    portalCount = preEventPortals.length;
                    if (portalCount > 1) {
                        const dimensions = calculateBoundingBoxDimensions(preEventPortals);
                        dimensionsHtml = `<br/><span class="site-dimensions">Playbox: ${(dimensions.width / 1000).toFixed(1)}km x ${(dimensions.height / 1000).toFixed(1)}km</span>`;
                    }
                } catch (error) {
                    console.error(
                        `[Site Observer: Table Renderer] Failed to retrieve site record for ${site.geocode.id}:`,
                        error,
                    );
                }

                return `
            <tr class="shards-row-hover ${isHighlighted ? "shards-row-highlight" : ""}">
                <td>
                    <div class="site-cell">
                        <div class="site-info">
                            <span class="site-label">${site.geocode.label}</span><br />
                            <span class="site-status">${status}</span>
                        </div>
                        <button class="go-to-site-btn" data-site-id="${site.geocode.id}" title="Go to Site">
                            ${TACTICAL_MARKER_SVG.replace('class="marker-svg-pin"', `class="marker-svg-pin marker-site-inline" style="--pin-color: ${UI_COLORS.SIGNAL}"`)}
                        </button>
                        <button class="export-site-btn" data-site-id="${site.geocode.id}" title="Export JSON">
                            ${EXPORT_ICON_SVG}
                        </button>
                        ${
                            portalCount > 0
                                ? `
                        <button class="export-discovery-btn" data-site-id="${site.geocode.id}" title="Export Discovery JSON">
                            ${getOrnamentSVG(UI_COLORS.SIGNAL)}
                        </button>`
                                : ""
                        }
                    </div>
                </td>
                <td class="observations-cell">
                    <div class="observation-count ${portalCount > 0 ? "has-observations" : ""}">
                        Ornamented Portals: ${portalCount}
                        ${dimensionsHtml}
                    </div>
                </td>
            </tr>
            `;
            }),
        );

        return `
                <table class="sites-table">
                    <thead>
                        <tr>
                            <th>Site</th>
                            <th>Observations</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows.join("")}
                    </tbody>
                </table>
            `;
    }

    private getSiteStatus(siteConfig: SiteConfig): string {
        if (!siteConfig) return "Unknown";

        const startTimeZoned = fromString(siteConfig.geocode.startTime);
        const durationMins = siteConfig.shardMechanics ? SiteManager.getEventDuration(siteConfig.shardMechanics) : 0;
        const endTimeZoned = addZoned(startTimeZoned, fromFields({ minutes: durationMins }));
        const nowZoned = zonedDateTimeISO(timeZoneIdZoned(startTimeZoned));

        const phase = SiteManager.calculatePhase({
            startTime: startTimeZoned,
            eventDurationMins: durationMins,
            shards: { actual: 0, expected: 1 },
            hasOrnaments: false,
        });
        let timeRemaining: any; // Duration Record
        if (phase === SitePhase.Scheduled || phase === SitePhase.Discovery) {
            timeRemaining = until(nowZoned, startTimeZoned, {
                smallestUnit: "minutes",
                largestUnit: "days",
            });
        } else if (phase === SitePhase.Active) {
            timeRemaining = until(nowZoned, endTimeZoned, {
                smallestUnit: "minutes",
                largestUnit: "days",
            });
        }

        return SiteManager.formatStatus({ phase, timeRemaining });
    }
}
