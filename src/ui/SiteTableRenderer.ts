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
import type { SeasonConfig, SiteConfig, SiteRecord } from "@ingress-shards/ingress-events-core";
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

                let totalPortalCount = 0;
                let portalCount = 0;
                let targetCount = 0;
                let shardCount = 0;
                let linkCount = 0;
                let dimensionsHtml = "";
                const waveLinksList: { wave: number; resistance: number; resistancePaths: number; enlightened: number; enlightenedPaths: number }[] = [];
                let totalResistanceLinks = 0;
                let totalEnlightenedLinks = 0;
                const overallResistancePaths = new Set<string>();
                const overallEnlightenedPaths = new Set<string>();

                let siteRecord: SiteRecord | undefined;
                try {
                    siteRecord = await this.dataManager.get(site.geocode.id);
                    const portals = siteRecord?.observations?.portals
                        ? Object.values(siteRecord.observations.portals)
                        : [];
                    const preEventPortals = portals.filter((p) => p.history?.some((h) => h.type === "pre-event"));
                    const targetPortals = portals.filter((p) => p.history?.some((h) => h.type === "target"));
                    const shards = siteRecord?.observations?.shards
                        ? Object.values(siteRecord.observations.shards)
                        : [];

                    totalPortalCount = portals.length;
                    portalCount = preEventPortals.length;
                    targetCount = targetPortals.length;
                    shardCount = shards.reduce((accumulator, shard) => accumulator + (shard.history?.filter((h) => h.action === "spawn").length || 0), 0);
                    linkCount = shards.reduce((accumulator, shard) => accumulator + (shard.history?.filter((h) => h.action === "link").length || 0), 0);

                    if (portalCount > 1) {
                        const dimensions = calculateBoundingBoxDimensions(preEventPortals);
                        dimensionsHtml = `<span class="site-dimensions">Playbox: ${(dimensions.width / 1000).toFixed(1)}km x ${(dimensions.height / 1000).toFixed(1)}km</span>`;
                    }

                    const waves = site.actionSchedule?.waves || [];
                    for (const [, wave] of waves.entries()) {
                        let resistanceLinks = 0;
                        let enlightenedLinks = 0;
                        const resistancePaths = new Set<string>();
                        const enlightenedPaths = new Set<string>();

                        for (const shard of shards) {
                            const history = shard.history || [];
                            const waveHistory = history.filter(
                                (h) => h.moveTime >= wave.start && h.moveTime <= wave.end && h.action === "link"
                            );
                            for (const h of waveHistory) {
                                const destination = h.dest;
                                if (destination === undefined) continue;
                                const p1 = Math.min(h.portalId, destination);
                                const p2 = Math.max(h.portalId, destination);
                                const pathKey = `${p1}-${p2}`;

                                if (h.team === "RES") {
                                    resistanceLinks++;
                                    resistancePaths.add(pathKey);
                                    overallResistancePaths.add(pathKey);
                                } else if (h.team === "ENL") {
                                    enlightenedLinks++;
                                    enlightenedPaths.add(pathKey);
                                    overallEnlightenedPaths.add(pathKey);
                                }
                            }
                        }
                        waveLinksList.push({
                            wave: wave.waveNumber,
                            resistance: resistanceLinks,
                            resistancePaths: resistancePaths.size,
                            enlightened: enlightenedLinks,
                            enlightenedPaths: enlightenedPaths.size,
                        });
                        totalResistanceLinks += resistanceLinks;
                        totalEnlightenedLinks += enlightenedLinks;
                    }
                } catch (error) {
                    console.error(
                        `[Site Observer: Table Renderer] Failed to retrieve site record for ${site.geocode.id}:`,
                        error,
                    );
                }

                const lines: string[] = [];
                if (totalPortalCount > 0) lines.push(`Total Portals: ${totalPortalCount}`);
                if (portalCount > 0) lines.push(`Ornamented Portals: ${portalCount}`);
                if (targetCount > 0) lines.push(`Target Portals: ${targetCount}`);
                if (shardCount > 0) lines.push(`Shards Observed: ${shardCount}`);
                if (linkCount > 0) {
                    lines.push(`Shard Links: ${linkCount}`);
                }
                if (dimensionsHtml) lines.push(dimensionsHtml);

                let linkTableHtml = "";
                if (waveLinksList.length > 0 && linkCount > 0) {
                    const rowsHtml = waveLinksList.map(wl => {
                        const resistanceText = wl.resistance > 0 ? `${wl.resistance}` : "0";
                        const enlightenedText = wl.enlightened > 0 ? `${wl.enlightened}` : "0";
                        return `
                            <tr>
                                <td>${wl.wave}</td>
                                <td class="faction-res">${resistanceText}</td>
                                <td class="faction-enl">${enlightenedText}</td>
                            </tr>
                        `;
                    }).join("");

                    const totalResistanceText = totalResistanceLinks > 0 ? `${totalResistanceLinks}` : "0";
                    const totalEnlightenedText = totalEnlightenedLinks > 0 ? `${totalEnlightenedLinks}` : "0";

                    linkTableHtml = `
                        <table class="links-table">
                            <thead>
                                <tr>
                                    <th>Wave</th>
                                    <th class="faction-res">RES</th>
                                    <th class="faction-enl">ENL</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${rowsHtml}
                                <tr class="links-total-row">
                                    <td>Total</td>
                                    <td class="faction-res">${totalResistanceText}</td>
                                    <td class="faction-enl">${totalEnlightenedText}</td>
                                </tr>
                            </tbody>
                        </table>
                    `;
                }

                const hasObservations = lines.length > 0 || linkTableHtml !== "";

                return `
            <tr class="shards-row-hover ${isHighlighted ? "shards-row-highlight" : ""}">
                <td>
                    <div class="site-cell">
                        <div class="site-info">
                            <span class="site-label">${site.geocode.name}</span><br />
                            <span class="site-status">${status}</span>
                        </div>
                        <div class="site-buttons">
                            <button class="go-to-site-btn" data-site-id="${site.geocode.id}" title="Go to Site">
                                ${TACTICAL_MARKER_SVG.replace('class="marker-svg-pin"', `class="marker-svg-pin marker-site-inline" style="--pin-color: ${UI_COLORS.SIGNAL}"`)}
                            </button>
                            <button class="export-site-btn" data-site-id="${site.geocode.id}" title="Export Site Record">
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
                            ${
                                targetCount > 0
                                    ? `
                            <button class="export-targets-btn" data-site-id="${site.geocode.id}" title="Export Targets JSON">
                                ${getOrnamentSVG(UI_COLORS.TIE)}
                            </button>`
                                    : ""
                            }
                        </div>
                    </div>
                </td>
                 <td class="observations-cell">
                    <div class="observation-count ${hasObservations ? "has-observations" : ""}">
                        ${lines.join("<br/>")}
                        ${linkTableHtml}
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
