import type { SiteConfig, SiteRecord, WaveState } from "@ingress-shards/ingress-events-core";
import { parseZonedDateTime, roundToDecimalPlaces } from "@ingress-shards/ingress-events-core";

const pad = (num: number): string => String(num).padStart(2, "0");

const formatTickTime = (timestamp: number, siteConfig: SiteConfig): string => {
    try {
        const timeZone = siteConfig.geocode.startTime.split("[", 2)[1]?.split("]", 2)[0] ?? "UTC";
        const zdt = parseZonedDateTime(`${new Date(timestamp).toISOString()}[${timeZone}]`);
        return `${pad(zdt.hour)}:${pad(zdt.minute)}`;
    } catch {
        return new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
    }
};

export class TooltipComponent {
    private $jqCard: JQuery;

    constructor() {
        this.$jqCard = $('<div class="scoring-tooltip-popover"></div>').appendTo("body");
    }

    public bindEvents(
        getSiteConfig: (siteId: string) => SiteConfig | undefined,
        getSiteRecord: (siteId: string) => Promise<SiteRecord | undefined>
    ): void {
        const showTooltip = async (target: HTMLElement, eventJQuery: JQuery.TriggeredEvent) => {
            const $target = $(target);
            const siteId = $target.attr("data-site-id");
            const waveNum = Number($target.attr("data-wave"));

            if (!siteId || isNaN(waveNum)) return;

            const faction = $target.attr("data-faction") as "ENL" | "RES";
            const siteConfig = getSiteConfig(siteId);
            const siteRecord = await getSiteRecord(siteId);
            if (!siteConfig || !siteRecord?.analysis) return;

            const waveState = siteRecord.analysis.waves[waveNum];
            if (!waveState) return;

            if ($target.hasClass("tooltip-trigger-wave")) {
                this.showWaveTooltip(waveNum, waveState, siteConfig, siteRecord, target);
            } else if ($target.hasClass("tooltip-trigger-goals")) {
                this.showGoalTooltip(waveNum, waveState, faction, siteConfig, siteRecord, target);
            } else if ($target.hasClass("tooltip-trigger-links")) {
                this.showLinkTooltip(waveNum, waveState, faction, siteConfig, target);
            }

            this.positionTooltip(eventJQuery.pageX!, eventJQuery.pageY!);
        };

        $(document).on("mouseenter", ".tooltip-trigger-wave, .tooltip-trigger-goals, .tooltip-trigger-links", (eventJQuery) => {
            void showTooltip(eventJQuery.currentTarget as HTMLElement, eventJQuery);
        });

        $(document).on("mouseleave", ".tooltip-trigger-wave, .tooltip-trigger-goals, .tooltip-trigger-links", () => {
            this.hideTooltip();
        });

        $(document).on("click", ".tooltip-trigger-wave, .tooltip-trigger-goals, .tooltip-trigger-links", (eventJQuery) => {
            eventJQuery.stopPropagation();
            const target = eventJQuery.currentTarget as HTMLElement;
            const popover = $(".scoring-tooltip-popover");
            if (popover.hasClass("visible") && popover.data("trigger") === target) {
                this.hideTooltip();
            } else {
                void showTooltip(target, eventJQuery);
            }
        });

        $(document).on("click", (eventJQuery) => {
            if ($(eventJQuery.target).closest(".scoring-tooltip-popover").length === 0) {
                this.hideTooltip();
            }
        });
    }

    public positionTooltip(x: number, y: number): void {
        let left = x - this.$jqCard.outerWidth()! / 2;
        let top = y - this.$jqCard.outerHeight()! - 15;

        const viewportWidth = $(window).width()!;
        const scrollLeft = $(window).scrollLeft()!;
        const scrollTop = $(window).scrollTop()!;

        if (left + this.$jqCard.outerWidth()! > scrollLeft + viewportWidth) {
            left = scrollLeft + viewportWidth - this.$jqCard.outerWidth()! - 15;
        }
        if (left < scrollLeft) {
            left = scrollLeft + 15;
        }

        if (top < scrollTop) {
            top = y + 20; // Flip downwards below target point
        }

        this.$jqCard.css({ left, top });
    }

    public showWaveTooltip(waveNum: number, waveState: WaveState, siteConfig: SiteConfig, siteRecord: SiteRecord, trigger: HTMLElement): void {
        this.$jqCard.removeClass("bg-res bg-enl width-goals width-links").addClass("width-wave visible").data("trigger", trigger);

        const shards = (waveState.statistics?.shards?.moving ?? 0) + (waveState.statistics?.shards?.nonMoving ?? 0);
        const targets = waveState.statistics?.targetsCount ?? 0;

        let tableRows = "";
        for (const window of waveState.shardActionWindows) {
            const timeStr = formatTickTime(window.timestamp, siteConfig);
            tableRows += `
                <tr>
                    <td>${window.actionLabel ?? "Jump"}<span class="inline-time">${timeStr}</span></td>
                    <td>${window.actionsCount}</td>
                </tr>
            `;
        }

        const waveConfig = siteConfig.timeline?.shards?.find((w) => w.waveNumber === waveNum);
        const startTimeStr = waveConfig ? formatTickTime(waveConfig.start, siteConfig) : "?";
        const endTimeStr = waveConfig ? formatTickTime(waveConfig.end, siteConfig) : "?";
        let waveItemsHtml = `Shards: ${shards}`;
        if (siteConfig.mechanics.shards?.targetMechanics) {
            waveItemsHtml += ` / Targets: ${targets}`;
        }

        const htmlContent = `
            <header class="popover-header">
                <strong>Wave ${waveNum} Summary</strong>
                <time>${startTimeStr} - ${endTimeStr}</time>
                <small>${waveItemsHtml}</small>
            </header>
            <table class="tooltip-table">
                <thead>
                    <tr>
                        <th style="text-align: center;">Jump</th>
                        <th style="text-align: center;">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${tableRows}
                </tbody>
            </table>
        `;
        this.$jqCard.html(htmlContent);
    }

    public showGoalTooltip(waveNum: number, waveState: WaveState, faction: "ENL" | "RES", siteConfig: SiteConfig, siteRecord: SiteRecord, trigger: HTMLElement): void {
        const factionClass = faction.toLowerCase();
        this.$jqCard.removeClass("bg-res bg-enl width-wave width-links").addClass(`width-goals bg-${factionClass} visible`).data("trigger", trigger);

        const windows = waveState.shardActionWindows.filter((w) => w.actionType === "jump");

        // 1. Gather all target portals that scored in this wave
        const scoredPortalsSet = new Set<string>();
        for (const w of windows) {
            const factionGoals = w.factionBreakdowns?.[faction]?.goals ?? [];
            for (const g of factionGoals) {
                scoredPortalsSet.add(g.portalId.toString());
            }
        }

        // 2. Build header jump columns
        const goalRules = Object.values(siteConfig.mechanics?.shards?.scoring?.goalScoringRules ?? {});
        let pointsLabel = "";
        if (goalRules.length === 1) {
            const rule = goalRules[0] as any;
            pointsLabel = ` (${rule.points}pt)`;
        }

        let headerCols = `<th class="portal-col">Target Portal${pointsLabel}</th>`;
        for (const w of windows) {
            const timeStr = formatTickTime(w.timestamp, siteConfig);
            headerCols += `<th>${w.actionLabel ?? "Jump"}<br><small>${timeStr}</small></th>`;
        }

        // 3. Build rows for each target portal
        let tableRows = "";
        for (const portalIdStr of scoredPortalsSet) {
            const portalId = Number(portalIdStr);
            const portalName = siteRecord.observations?.portals?.[portalId]?.title ?? `Portal ${portalId}`;

            let rowHtml = `<td class="portal-name ${factionClass}-text" title="${portalName}">${portalName}</td>`;
            for (const w of windows) {
                const goalDetail = w.factionBreakdowns?.[faction]?.goals?.find((g) => g.portalId === portalId);
                if (goalDetail) {
                    const scoredValue = goalDetail.scoredCount;
                    const unscoredValue = goalDetail.unscoredCount;
                    const displayValue = unscoredValue > 0 ? `${scoredValue} (${unscoredValue})` : String(scoredValue);
                    rowHtml += `<td>${displayValue}</td>`;
                } else {
                    rowHtml += `<td>-</td>`;
                }
            }
            tableRows += `<tr>${rowHtml}</tr>`;
        }

        const htmlContent = `
            <table class="tooltip-table">
                <thead>
                    <tr>
                        ${headerCols}
                    </tr>
                </thead>
                <tbody>
                    ${tableRows || `<tr><td colspan="${windows.length + 1}">No goals scored</td></tr>`}
                </tbody>
            </table>
        `;
        this.$jqCard.html(htmlContent);
    }

    public showLinkTooltip(waveNum: number, waveState: WaveState, faction: "ENL" | "RES", siteConfig: SiteConfig, trigger: HTMLElement): void {
        const factionClass = faction.toLowerCase();
        this.$jqCard.removeClass("bg-res bg-enl width-wave width-goals").addClass(`width-links bg-${factionClass} visible`).data("trigger", trigger);

        const windows = waveState.shardActionWindows.filter((w) => w.actionType === "jump");
        const scoringRules = {
            ...siteConfig.mechanics?.shards?.scoring?.linkScoringRules,
            ...siteConfig.mechanics?.shards?.scoring?.goalScoringRules,
        };

        const linkRules: [string, any][] = [];
        const matchedRuleKeys = new Set<string>();
        for (const w of windows) {
            const factionData = w.factionBreakdowns?.[faction]?.links;
            if (factionData) {
                for (const [ruleKey, count] of Object.entries(factionData)) {
                    if (count > 0) {
                        matchedRuleKeys.add(ruleKey);
                    }
                }
            }
        }
        const linkScoringRules = siteConfig.mechanics?.shards?.scoring?.linkScoringRules ?? {};
        for (const key of matchedRuleKeys) {
            const rule = scoringRules[key];
            if (Object.hasOwn(linkScoringRules, key)) {
                linkRules.push([key, rule]);
            }
        }

        // 1. Build headers
        let headerCols = `<th>Rule</th>`;
        for (const w of windows) {
            const timeStr = formatTickTime(w.timestamp, siteConfig);
            headerCols += `<th>${w.actionLabel ?? "Jump"}<br><small>${timeStr}</small></th>`;
        }
        headerCols += `<th>Points</th>`;

        // 2. Build rows for each link rule
        let tableRows = "";
        for (const [ruleKey, rule] of linkRules) {
            const label = rule.label;
            const pointsPerJump = rule.points;

            let totalJumps = 0;
            let rowCellsHtml = "";

            for (const w of windows) {
                const count = w.factionBreakdowns?.[faction]?.links?.[ruleKey] ?? 0;
                totalJumps += count;
                rowCellsHtml += `<td>${count > 0 ? count : "-"}</td>`;
            }

            const pointsEarned = roundToDecimalPlaces(totalJumps * pointsPerJump, 2);
            tableRows += `
                <tr>
                    <td title="${rule.tooltip}">${label} (${pointsPerJump}pt)</td>
                    ${rowCellsHtml}
                    <td class="${factionClass}-text">${pointsEarned > 0 ? `${pointsEarned} pts` : "-"}</td>
                </tr>
            `;
        }

        const hasMismatches = windows.some((w) => (w.factionBreakdowns?.[faction]?.linkAlignmentMismatches ?? 0) > 0);
        if (hasMismatches) {
            let mismatchRowCells = "";
            for (const w of windows) {
                const count = w.factionBreakdowns?.[faction]?.linkAlignmentMismatches ?? 0;
                mismatchRowCells += `<td>${count > 0 ? count : "-"}</td>`;
            }

            tableRows += `
                <tr class="mismatch-row">
                    <td>Link Alignment Mismatch</td>
                    ${mismatchRowCells}
                    <td>-</td>
                </tr>
            `;
        }

        const htmlContent = `
            <table class="tooltip-table">
                <thead>
                    <tr>
                        ${headerCols}
                    </tr>
                </thead>
                <tbody>
                    ${tableRows}
                </tbody>
            </table>
        `;
        this.$jqCard.html(htmlContent);
    }

    public hideTooltip(): void {
        this.$jqCard.removeClass("visible").data("trigger", undefined);
    }
}
