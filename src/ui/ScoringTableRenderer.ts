import type { SiteConfig, SiteRecord } from "@ingress-shards/ingress-events-core";

const renderCell = (
    value: number,
    bgClass: string,
    faction: "ENL" | "RES",
    type: "goals" | "jumps" | "total",
    site: SiteConfig,
    waveState?: any
): string => {
    if (type === "total" || value <= 0) {
        return `<td class="${bgClass}">${value}</td>`;
    }

    // Build tooltip details
    let tooltip = "";
    if (type === "goals" && waveState?.points?.goals?.detail) {
        const details: string[] = [];
        const detailRecords = waveState.points.goals.detail as Record<string, unknown>;
        for (const [rule, points] of Object.entries(detailRecords)) {
            const p = (points as any)[faction] ?? 0;
            if (p > 0) {
                const ruleConfig = site.mechanics.shards?.scoring?.shardScoringRules?.[rule];
                const label = ruleConfig?.label ?? rule;
                const rulePoints = ruleConfig?.points ?? 1;
                const count = Math.round(p / rulePoints);
                details.push(`${count} x ${label}: ${p}pts`);
            }
        }
        tooltip = details.join("\n");
    } else if (type === "jumps" && waveState?.points?.jumps?.detail) {
        const details: string[] = [];
        const detailRecords = waveState.points.jumps.detail as Record<string, unknown>;
        for (const [rule, points] of Object.entries(detailRecords)) {
            const p = (points as any)[faction] ?? 0;
            if (p > 0) {
                const ruleConfig = site.mechanics.shards?.scoring?.shardScoringRules?.[rule];
                const label = ruleConfig?.label ?? rule;
                const rulePoints = ruleConfig?.points ?? 1;
                const count = Math.round(p / rulePoints);
                details.push(`${count} x ${label}: ${p}pts`);
            }
        }
        // Include mismatch count note if found in counters
        const mismatches = waveState.counters?.linkAlignmentMismatch ?? 0;
        if (mismatches > 0) {
            if (details.length > 0) {
                details.push("");
            }
            details.push(`⚠️ ${mismatches} link alignment mismatch${mismatches > 1 ? "es" : ""} detected`);
        }
        tooltip = details.join("\n");
    }

    const titleAttribute = tooltip ? ` title="${tooltip.replace(/"/g, "&quot;")}"` : "";
    const clickableClass = tooltip ? " scoring-value-clickable" : "";

    return `<td class="${bgClass}${clickableClass}"${titleAttribute}>${value}</td>`;
};

export const renderScoringTable = (site: SiteConfig, siteRecord?: SiteRecord): string => {
    const analysis = siteRecord?.analysis;
    if (!analysis) {
        return "";
    }

    const waves = site.timeline?.shards || [];
    
    // If the first wave has no shards yet, do not render the table
    if (waves.length > 0) {
        const firstWave = waves[0];
        if (firstWave) {
            const firstWaveState = analysis.waves[firstWave.waveNumber];
            const firstWaveShards = (firstWaveState?.counters?.shards?.moving ?? 0) + (firstWaveState?.counters?.shards?.nonMoving ?? 0);
            if (firstWaveShards === 0) {
                return "";
            }
        }
    }

    const wavePointsList: {
        wave: number;
        goalsEnlightened: number;
        goalsResistance: number;
        jumpsEnlightened: number;
        jumpsResistance: number;
        totalEnlightened: number;
        totalResistance: number;
        shardCount: number;
        targetCount: number;
        waveState?: any;
    }[] = [];

    const seasonPointsEnlightened = analysis.seasonPoints?.ENL ?? 0;
    const seasonPointsResistance = analysis.seasonPoints?.RES ?? 0;
    const targetTimeline = site.timeline?.targets ?? [];

    for (const wave of waves) {
        const waveState = analysis.waves[wave.waveNumber];
        
        // If the total number of shards for a wave (both moving and non moving) is 0, do not render the wave
        const shardCount = (waveState?.counters?.shards?.moving ?? 0) + (waveState?.counters?.shards?.nonMoving ?? 0);
        if (shardCount === 0) {
            continue;
        }

        const targetWave = targetTimeline.find(tw => tw.waveNumber === wave.waveNumber);
        let targetCount = 0;
        if (targetWave && siteRecord?.observations?.portals) {
            for (const portal of Object.values(siteRecord.observations.portals)) {
                const isTargetInWave = portal.history?.some(h => 
                    h.type === "target" && 
                    h.timestamp >= targetWave.start && 
                    h.timestamp <= targetWave.end + 59999
                );
                if (isTargetInWave) {
                    targetCount++;
                }
            }
        }

        const waveGoalsResistance = waveState?.points?.goals?.summary?.RES ?? 0;
        const waveGoalsEnlightened = waveState?.points?.goals?.summary?.ENL ?? 0;
        const waveJumpsResistance = waveState?.points?.jumps?.summary?.RES ?? 0;
        const waveJumpsEnlightened = waveState?.points?.jumps?.summary?.ENL ?? 0;
        const waveTotalResistance = waveState?.points?.total?.RES ?? 0;
        const waveTotalEnlightened = waveState?.points?.total?.ENL ?? 0;

        wavePointsList.push({
            wave: wave.waveNumber,
            goalsEnlightened: waveGoalsEnlightened,
            goalsResistance: waveGoalsResistance,
            jumpsEnlightened: waveJumpsEnlightened,
            jumpsResistance: waveJumpsResistance,
            totalEnlightened: waveTotalEnlightened,
            totalResistance: waveTotalResistance,
            shardCount,
            targetCount,
            waveState
        });
    }

    if (wavePointsList.length === 0) {
        return "";
    }

    const rowsHtml = wavePointsList.map(wl => {
        const waveTooltip = `Shards: ${wl.shardCount}\nTargets: ${wl.targetCount}`;
        return `
            <tr>
                <td class="scoring-value-clickable" title="${waveTooltip}">${wl.wave}</td>
                ${renderCell(wl.goalsEnlightened, "faction-enl-bg", "ENL", "goals", site, wl.waveState)}
                ${renderCell(wl.goalsResistance, "faction-res-bg", "RES", "goals", site, wl.waveState)}
                ${renderCell(wl.jumpsEnlightened, "faction-enl-bg", "ENL", "jumps", site, wl.waveState)}
                ${renderCell(wl.jumpsResistance, "faction-res-bg", "RES", "jumps", site, wl.waveState)}
                ${renderCell(wl.totalEnlightened, "faction-enl-bg", "ENL", "total", site, wl.waveState)}
                ${renderCell(wl.totalResistance, "faction-res-bg", "RES", "total", site, wl.waveState)}
            </tr>
        `;
    }).join("");

    return `
        <table class="scoring-table">
            <colgroup>
                <col style="width: 16%;" />
                <col style="width: 14%;" />
                <col style="width: 14%;" />
                <col style="width: 14%;" />
                <col style="width: 14%;" />
                <col style="width: 14%;" />
                <col style="width: 14%;" />
            </colgroup>
            <thead>
                <tr>
                    <th rowspan="2">Wave</th>
                    <th colspan="2" class="points-header-goals">Goal</th>
                    <th colspan="2" class="points-header-jumps">Jumps</th>
                    <th colspan="2" class="points-header-total">Points</th>
                </tr>
                <tr>
                    <th class="faction-enl faction-enl-bg">ENL</th>
                    <th class="faction-res faction-res-bg">RES</th>
                    <th class="faction-enl faction-enl-bg">ENL</th>
                    <th class="faction-res faction-res-bg">RES</th>
                    <th class="faction-enl faction-enl-bg">ENL</th>
                    <th class="faction-res faction-res-bg">RES</th>
                </tr>
            </thead>
            <tbody>
                ${rowsHtml}
                <tr class="links-total-row">
                    <td colspan="5">SEASON POINTS</td>
                    <td class="faction-enl-bg faction-enl font-bold">${seasonPointsEnlightened.toFixed(1)}</td>
                    <td class="faction-res-bg faction-res font-bold">${seasonPointsResistance.toFixed(1)}</td>
                </tr>
            </tbody>
        </table>
    `;
};
