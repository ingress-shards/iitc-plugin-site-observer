import { roundToDecimalPlaces, type SiteConfig, type SiteRecord } from "@ingress-shards/ingress-events-core";

const formatPoints = (value: number) => roundToDecimalPlaces(value, 1).toString();

const renderCell = (
    value: number,
    bgClass: string,
    faction: "ENL" | "RES",
    type: "goals" | "links" | "total",
    waveNum: number,
    siteId: string
): string => {
    if (type === "total" || value <= 0) {
        return `<td class="${bgClass}">${value}</td>`;
    }

    const triggerClass = type === "goals" ? "tooltip-trigger-goals" : "tooltip-trigger-links";
    return `<td class="${bgClass} ${triggerClass}" data-site-id="${siteId}" data-wave="${waveNum}" data-faction="${faction}"><span class="scoring-value-clickable">${value}</span></td>`;
};

export class ScoringTableComponent {
    public render(siteConfig: SiteConfig, siteRecord?: SiteRecord): string {
        const analysis = siteRecord?.analysis;
        if (!analysis) {
            return "";
        }

        const waves = siteConfig.timeline?.shards || [];
        
        // If the first wave has no shards yet, do not render the table
        if (waves.length > 0) {
            const firstWave = waves[0];
            if (firstWave) {
                const firstWaveState = analysis.waves[firstWave.waveNumber];
                const firstWaveShards = (firstWaveState?.statistics?.shards?.moving ?? 0) + (firstWaveState?.statistics?.shards?.nonMoving ?? 0);
                if (firstWaveShards === 0) {
                    return "";
                }
            }
        }

        const wavePointsList: {
            wave: number;
            goalsEnlightened: number;
            goalsResistance: number;
            linksEnlightened: number;
            linksResistance: number;
            totalEnlightened: number;
            totalResistance: number;
            waveState?: any;
        }[] = [];

        for (const wave of waves) {
            const waveState = analysis.waves[wave.waveNumber];
            
            // If the total number of shards for a wave (both moving and non moving) is 0, do not render the wave
            const shardCount = (waveState?.statistics?.shards?.moving ?? 0) + (waveState?.statistics?.shards?.nonMoving ?? 0);
            if (shardCount === 0) {
                continue;
            }

            const waveGoalsResistance = waveState?.points?.goals?.RES ?? 0;
            const waveGoalsEnlightened = waveState?.points?.goals?.ENL ?? 0;
            const waveLinksResistance = waveState?.points?.links?.RES ?? 0;
            const waveLinksEnlightened = waveState?.points?.links?.ENL ?? 0;
            const waveTotalResistance = waveState?.points?.total?.RES ?? 0;
            const waveTotalEnlightened = waveState?.points?.total?.ENL ?? 0;

            wavePointsList.push({
                wave: wave.waveNumber,
                goalsEnlightened: waveGoalsEnlightened,
                goalsResistance: waveGoalsResistance,
                linksEnlightened: waveLinksEnlightened,
                linksResistance: waveLinksResistance,
                totalEnlightened: waveTotalEnlightened,
                totalResistance: waveTotalResistance,
                waveState
            });
        }

        if (wavePointsList.length === 0) {
            return "";
        }

        let totalPointsEnlightened: number;
        let totalPointsResistance: number;
        let pointsLabel = "SEASON POINTS";

        if (analysis.seasonPoints) {
            totalPointsEnlightened = analysis.seasonPoints.points?.ENL ?? 0;
            totalPointsResistance = analysis.seasonPoints.points?.RES ?? 0;
        } else {
            pointsLabel = "POINTS";
            totalPointsEnlightened = wavePointsList.reduce((sum, w) => sum + w.totalEnlightened, 0);
            totalPointsResistance = wavePointsList.reduce((sum, w) => sum + w.totalResistance, 0);
        }

        const hasGoals = siteConfig.mechanics?.shards?.targetMechanics !== undefined;
        const contributingResistanceWaves = analysis.seasonPoints?.contributingWaves?.RES ?? [];
        const contributingEnlightenedWaves = analysis.seasonPoints?.contributingWaves?.ENL ?? [];

        const rowsHtml = wavePointsList.map(wl => {
            const isResistanceContributor = contributingResistanceWaves.includes(wl.wave);
            const isEnlightenedContributor = contributingEnlightenedWaves.includes(wl.wave);

            const resistanceBg = "faction-res-bg";
            const enlightenedBg = "faction-enl-bg";
            const resistanceTotalBg = `faction-res-bg${isResistanceContributor ? " scoring-contributor-res" : ""}`;
            const enlightenedTotalBg = `faction-enl-bg${isEnlightenedContributor ? " scoring-contributor-enl" : ""}`;

            const goalsHtml = hasGoals ? `
                    ${renderCell(wl.goalsEnlightened, enlightenedBg, "ENL", "goals", wl.wave, siteConfig.geocode.id)}
                    ${renderCell(wl.goalsResistance, resistanceBg, "RES", "goals", wl.wave, siteConfig.geocode.id)}` : "";

            return `
                <tr>
                    <td class="tooltip-trigger-wave" data-site-id="${siteConfig.geocode.id}" data-wave="${wl.wave}"><span class="scoring-value-clickable">${wl.wave}</span></td>${goalsHtml}
                    ${renderCell(wl.linksEnlightened, enlightenedBg, "ENL", "links", wl.wave, siteConfig.geocode.id)}
                    ${renderCell(wl.linksResistance, resistanceBg, "RES", "links", wl.wave, siteConfig.geocode.id)}
                    ${renderCell(wl.totalEnlightened, enlightenedTotalBg, "ENL", "total", wl.wave, siteConfig.geocode.id)}
                    ${renderCell(wl.totalResistance, resistanceTotalBg, "RES", "total", wl.wave, siteConfig.geocode.id)}
                </tr>
            `;
        }).join("");

        const colGroupHtml = hasGoals 
            ? `<col style="width: 16%;" /><col style="width: 14%;" /><col style="width: 14%;" /><col style="width: 14%;" /><col style="width: 14%;" /><col style="width: 14%;" /><col style="width: 14%;" />`
            : `<col style="width: 20%;" /><col style="width: 20%;" /><col style="width: 20%;" /><col style="width: 20%;" /><col style="width: 20%;" />`;

        const theadGoalsRow1 = hasGoals ? `<th colspan="2" class="points-header-goals">Goal</th>` : "";
        const theadGoalsRow2 = hasGoals ? `<th class="faction-enl faction-enl-bg">ENL</th><th class="faction-res faction-res-bg">RES</th>` : "";

        return `
            <table class="scoring-table">
                <colgroup>
                    ${colGroupHtml}
                </colgroup>
                <thead>
                    <tr>
                        <th rowspan="2">Wave</th>
                        ${theadGoalsRow1}
                        <th colspan="2" class="points-header-jumps">Jumps</th>
                        <th colspan="2" class="points-header-total">Points</th>
                    </tr>
                    <tr>
                        ${theadGoalsRow2}
                        <th class="faction-enl faction-enl-bg">ENL</th>
                        <th class="faction-res faction-res-bg">RES</th>
                        <th class="faction-enl faction-enl-bg">ENL</th>
                        <th class="faction-res faction-res-bg">RES</th>
                    </tr>
                </thead>
                <tbody>
                    ${rowsHtml}
                    <tr class="links-total-row">
                        <td colspan="${hasGoals ? 5 : 3}">${pointsLabel}</td>
                        <td class="faction-enl-bg faction-enl font-bold">${formatPoints(totalPointsEnlightened)}</td>
                        <td class="faction-res-bg faction-res font-bold">${formatPoints(totalPointsResistance)}</td>
                    </tr>
                </tbody>
            </table>
        `;
    }

    public bindEvents(_$container: JQuery): void {
        // Scoring table events (e.g. tooltip triggers) can be bound here
        // Currently handled elsewhere (e.g. TooltipComponent), but ready for local component events
    }
}
