import type { SiteConfig, SiteRecord, WaveState, ShardJumpGroup } from "@ingress-shards/ingress-events-core";
import { getShardJumpGroups, formatJumpGroupTime, roundToDecimalPlaces } from "@ingress-shards/ingress-events-core";
import { fromEpochMilliseconds, toZonedDateTimeISO } from "temporal-polyfill/fns/Instant";

const pad = (num: number): string => String(num).padStart(2, "0");

const formatTickTime = (timestamp: number, siteConfig: SiteConfig): string => {
    const timeZone = siteConfig.geocode.timeZone ?? "UTC";
    const zdt = toZonedDateTimeISO(fromEpochMilliseconds(timestamp), timeZone);
    return `${pad(zdt.hour)}:${pad(zdt.minute)}`;
};

const formatGroupTime = (group: ShardJumpGroup, siteConfig: SiteConfig): string => {
    return formatJumpGroupTime(group, siteConfig.geocode.timeZone ?? "UTC");
};

interface IITCWindow {
    $: JQueryStatic;
    jQuery: JQueryStatic;
}

const getJQuery = (): JQueryStatic => {
    const win = window as unknown as IITCWindow;
    return win.$ ?? win.jQuery;
};

export class TooltipComponent {
    private $jqCard?: JQuery;

    private getCard(): JQuery {
        if (!this.$jqCard) {
            const jq = getJQuery();
            this.$jqCard = jq('<div class="scoring-tooltip-popover"></div>').appendTo("body");
        }
        return this.$jqCard;
    }

    public bindEvents(
        getSiteConfig: (siteId: string) => SiteConfig | undefined,
        getSiteRecord: (siteId: string) => Promise<SiteRecord | undefined>
    ): void {
        const jq = getJQuery();
        const showTooltip = async (target: HTMLElement, eventJQuery: JQuery.TriggeredEvent) => {
            const $target = jq(target);
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

            let x = eventJQuery.pageX;
            let y = eventJQuery.pageY;

            if (x === undefined || y === undefined || (x === 0 && y === 0)) {
                const rect = target.getBoundingClientRect();
                x = rect.left + rect.width / 2 + (jq(window).scrollLeft() ?? 0);
                y = rect.top + (jq(window).scrollTop() ?? 0);
            }

            this.positionTooltip(x, y);
        };

        jq(document).on("mouseenter", ".tooltip-trigger-wave, .tooltip-trigger-goals, .tooltip-trigger-links", (eventJQuery) => {
            void showTooltip(eventJQuery.currentTarget as HTMLElement, eventJQuery);
        });

        jq(document).on("mouseleave", ".tooltip-trigger-wave, .tooltip-trigger-goals, .tooltip-trigger-links", () => {
            this.hideTooltip();
        });

        jq(document).on("click", ".tooltip-trigger-wave, .tooltip-trigger-goals, .tooltip-trigger-links", (eventJQuery) => {
            eventJQuery.stopPropagation();
            const target = eventJQuery.currentTarget as HTMLElement;
            const popover = jq(".scoring-tooltip-popover");
            if (popover.hasClass("visible") && popover.data("trigger") === target) {
                this.hideTooltip();
            } else {
                void showTooltip(target, eventJQuery);
            }
        });

        jq(document).on("click", (eventJQuery) => {
            if (jq(eventJQuery.target).closest(".scoring-tooltip-popover").length === 0) {
                this.hideTooltip();
            }
        });
    }

    public positionTooltip(x: number, y: number): void {
        const $card = this.getCard();
        const cardWidth = $card.outerWidth() ?? 200;
        const cardHeight = $card.outerHeight() ?? 100;

        let left = x - cardWidth / 2;
        let top = y - cardHeight - 15;

        const jq = getJQuery();
        const viewportWidth = jq(window).width() ?? window.innerWidth;
        const scrollLeft = jq(window).scrollLeft() ?? 0;
        const scrollTop = jq(window).scrollTop() ?? 0;

        const padding = 8;
        if (left + cardWidth > scrollLeft + viewportWidth - padding) {
            left = scrollLeft + viewportWidth - cardWidth - padding;
        }
        if (left < scrollLeft + padding) {
            left = scrollLeft + padding;
        }

        if (top < scrollTop + padding) {
            top = y + 20; // Flip downwards below target point
        }

        $card.css({ left, top });
    }

    public showWaveTooltip(waveNum: number, waveState: WaveState, siteConfig: SiteConfig, siteRecord: SiteRecord, trigger: HTMLElement): void {
        const $card = this.getCard();
        $card.removeClass("bg-res bg-enl width-goals width-links").addClass("width-wave visible").data("trigger", trigger);

        const shards = (waveState.statistics?.shards?.moving ?? 0) + (waveState.statistics?.shards?.nonMoving ?? 0);
        const targets = waveState.statistics?.targetsCount ?? 0;

        const jumpGroupSize = siteConfig.display?.shards?.jumpGroupSize ?? 1;
        const groups = getShardJumpGroups(waveState.shardJumpWindows, jumpGroupSize);

        let tableRows = "";
        for (const group of groups) {
            const timeStr = formatGroupTime(group, siteConfig);
            const totalActions = group.windows.reduce((sum, w) => sum + w.historyCount, 0);
            tableRows += `
                <tr>
                    <td>${group.label}<span class="inline-time">${timeStr}</span></td>
                    <td>${totalActions}</td>
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
                        <th>Jump</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${tableRows}
                </tbody>
            </table>
        `;
        $card.html(htmlContent);
    }

    public showGoalTooltip(waveNum: number, waveState: WaveState, faction: "ENL" | "RES", siteConfig: SiteConfig, siteRecord: SiteRecord, trigger: HTMLElement): void {
        const $card = this.getCard();
        const factionClass = faction.toLowerCase();
        $card.removeClass("bg-res bg-enl width-wave width-links").addClass(`width-goals bg-${factionClass} visible`).data("trigger", trigger);

        const jumpGroupSize = siteConfig.display?.shards?.jumpGroupSize ?? 1;
        const groups = getShardJumpGroups(waveState.shardJumpWindows, jumpGroupSize);

        // 1. Gather all target portals that scored in this wave
        const scoredPortalsSet = new Set<number>();
        for (const w of waveState.shardJumpWindows) {
            const factionGoals = w.factionBreakdowns?.[faction]?.goals ?? [];
            for (const g of factionGoals) {
                scoredPortalsSet.add(g.portalId);
            }
        }

        // 2. Build header jump group columns
        const goalRules = Object.values(siteConfig.mechanics?.shards?.scoring?.goalScoringRules ?? {});
        let pointsLabel = "";
        if (goalRules.length === 1) {
            const rule = goalRules[0] as { points: number };
            pointsLabel = ` (${rule.points}pt)`;
        }

        let headerCols = `<th class="portal-col">Target Portal${pointsLabel}</th>`;
        for (const group of groups) {
            const timeStr = formatGroupTime(group, siteConfig);
            headerCols += `<th>${group.label}<br><small>${timeStr}</small></th>`;
        }

        // 3. Build rows for each target portal
        let tableRows = "";
        for (const portalId of scoredPortalsSet) {
            const portalName = siteRecord.observations?.portals?.[portalId]?.title ?? `Portal ${portalId}`;

            let rowHtml = `<td class="portal-name ${factionClass}-text" title="${portalName}">${portalName}</td>`;
            for (const group of groups) {
                const groupGoals = group.windows
                    .flatMap((w) => w.factionBreakdowns?.[faction]?.goals ?? [])
                    .filter((g) => g.portalId === portalId);
                const scoredValue = groupGoals.reduce((sum, g) => sum + g.scoredCount, 0);
                const unscoredValue = groupGoals.reduce((sum, g) => sum + g.unscoredCount, 0);
                const displayValue = scoredValue > 0 || unscoredValue > 0
                    ? (unscoredValue > 0 ? `${scoredValue} (${unscoredValue})` : String(scoredValue))
                    : "-";
                rowHtml += `<td>${displayValue}</td>`;
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
                    ${tableRows || `<tr><td colspan="${groups.length + 1}">No goals scored</td></tr>`}
                </tbody>
            </table>
        `;
        $card.html(htmlContent);
    }

    public showLinkTooltip(waveNum: number, waveState: WaveState, faction: "ENL" | "RES", siteConfig: SiteConfig, trigger: HTMLElement): void {
        const $card = this.getCard();
        const factionClass = faction.toLowerCase();
        $card.removeClass("bg-res bg-enl width-wave width-goals").addClass(`width-links bg-${factionClass} visible`).data("trigger", trigger);

        const jumpGroupSize = siteConfig.display?.shards?.jumpGroupSize ?? 1;
        const groups = getShardJumpGroups(waveState.shardJumpWindows, jumpGroupSize);

        const scoringRules = {
            ...siteConfig.mechanics?.shards?.scoring?.linkScoringRules,
            ...siteConfig.mechanics?.shards?.scoring?.goalScoringRules,
        };

        const linkRules: [string, { label: string; points: number; tooltip?: string }][] = [];
        const matchedRuleKeys = new Set<string>();
        for (const w of waveState.shardJumpWindows) {
            const factionData = w.factionBreakdowns?.[faction]?.links;
            if (factionData) {
                for (const [ruleKey, count] of Object.entries(factionData)) {
                    if (count && count > 0) {
                        matchedRuleKeys.add(ruleKey);
                    }
                }
            }
        }
        const linkScoringRules = siteConfig.mechanics?.shards?.scoring?.linkScoringRules ?? {};
        for (const key of matchedRuleKeys) {
            const rule = scoringRules[key];
            if (rule && Object.hasOwn(linkScoringRules, key)) {
                linkRules.push([key, rule]);
            }
        }

        // 1. Build headers
        let headerCols = `<th>Rule</th>`;
        for (const group of groups) {
            const timeStr = formatGroupTime(group, siteConfig);
            headerCols += `<th>${group.label}<br><small>${timeStr}</small></th>`;
        }
        headerCols += `<th>Points</th>`;

        // 2. Build rows for each link rule
        let tableRows = "";
        for (const [ruleKey, rule] of linkRules) {
            const label = rule.label;
            const pointsPerJump = rule.points;

            let totalJumps = 0;
            let rowCellsHtml = "";

            for (const group of groups) {
                const count = group.windows.reduce((sum, w) => sum + (w.factionBreakdowns?.[faction]?.links?.[ruleKey] ?? 0), 0);
                totalJumps += count;
                rowCellsHtml += `<td>${count > 0 ? count : "-"}</td>`;
            }

            const pointsEarned = roundToDecimalPlaces(totalJumps * pointsPerJump, 2);
            tableRows += `
                <tr>
                    <td title="${rule.tooltip ?? ""}">${label} (${pointsPerJump}pt)</td>
                    ${rowCellsHtml}
                    <td class="${factionClass}-text">${pointsEarned > 0 ? `${pointsEarned} pts` : "-"}</td>
                </tr>
            `;
        }

        const hasMismatches = waveState.shardJumpWindows.some((w) => (w.factionBreakdowns?.[faction]?.linkAlignmentMismatches ?? 0) > 0);
        if (hasMismatches) {
            let mismatchRowCells = "";
            for (const group of groups) {
                const count = group.windows.reduce((sum, w) => sum + (w.factionBreakdowns?.[faction]?.linkAlignmentMismatches ?? 0), 0);
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
                    ${tableRows || `<tr><td colspan="${groups.length + 2}">No links scored</td></tr>`}
                </tbody>
            </table>
        `;
        $card.html(htmlContent);
    }

    public hideTooltip(): void {
        this.$jqCard?.removeClass("visible").data("trigger", undefined);
    }
}

