import { describe, it, expect, beforeEach, vi } from "vitest";
import { TooltipComponent } from "./TooltipComponent.js";
import type { SiteConfig, SiteRecord, WaveState, EventConfigRegistry } from "@ingress-shards/ingress-events-core";

const createSiteConfig = (jumpGroupSize?: number): SiteConfig => ({
    seasonId: "2026-test",
    geocode: {
        id: "site-london",
        name: "London",
        eventType: "ANOMALY",
        latE6: 51500000,
        lngE6: -100000,
        startTime: "2026-06-01T12:00:00Z[UTC]",
        timeZone: "UTC",
        countryCode: "GB",
    },
    timeline: {
        start: 1777723200000,
        preEventCutoff: 1777716000000,
        end: 1777725900000,
        durationMinutes: 45,
        ...(jumpGroupSize !== undefined && { jumpGroupSize }),
        shards: [
            {
                waveNumber: 1,
                start: 1777723200000,
                end: 1777725900000,
                expectedShards: 5,
                shardsActions: []
            }
        ]
    }
});

/* eslint-disable @typescript-eslint/no-unsafe-return */
const createMockJQuery = (mockCardClasses: Set<string>, setHtml: (content: string) => void) => {
    const mockElement: any = {
        appendTo: () => mockElement,
        removeClass: (classes: string) => {
            for (const c of classes.split(" ")) {
                if (c) mockCardClasses.delete(c);
            }
            return mockElement;
        },
        addClass: (classes: string) => {
            for (const c of classes.split(" ")) {
                if (c) mockCardClasses.add(c);
            }
            return mockElement;
        },
        data: () => mockElement,
        html: (content: string) => {
            setHtml(content);
            return mockElement;
        },
        outerWidth: () => 200,
        outerHeight: () => 100,
        css: () => mockElement,
        hasClass: (c: string) => mockCardClasses.has(c),
        on: () => mockElement,
    };

    const jq: any = () => mockElement;
    return jq;
};
/* eslint-enable @typescript-eslint/no-unsafe-return */

describe("TooltipComponent", () => {
    let mockCardHtml = "";
    const mockCardClasses = new Set<string>();

    beforeEach(() => {
        mockCardHtml = "";
        mockCardClasses.clear();
        const jq = createMockJQuery(mockCardClasses, (content) => {
            mockCardHtml = content;
        });
        vi.stubGlobal("window", {
            $: jq,
            jQuery: jq,
            innerWidth: 1024,
            innerHeight: 768,
        });
        vi.stubGlobal("document", {
            body: {},
        });
    });

    const mockRegistry = {
        getSeasonMetadata: () => ({
            id: "2026-test",
            name: "Test Season",
            year: 2026,
            components: [
                {
                    eventType: "ANOMALY",
                    mechanics: {
                        shards: {
                            scoring: {
                                linkRules: ["default_jump"],
                                goalRules: ["target_goal"]
                            }
                        }
                    }
                }
            ]
        }),
        blueprints: {
            linkScoringRules: {
                default_jump: { label: "Jump", points: 1 }
            },
            goalScoringRules: {
                target_goal: { label: "Target Goal", points: 5 }
            }
        }
    } as unknown as EventConfigRegistry;

    const mockWaveState: WaveState = {
        points: {},
        shardJumpWindows: [
            {
                jumpNumber: 1,
                scheduledStart: 1777723200000,
                actualEnd: 1777723275000,
                actionCount: 6,
                points: { total: { RES: 2 } },
                linksBreakdown: {
                    RES: { default_jump: 2 }
                }
            },
            {
                jumpNumber: 2,
                scheduledStart: 1777723500000,
                actualEnd: 1777723525000,
                actionCount: 4
            },
            {
                jumpNumber: 3,
                scheduledStart: 1777723800000,
                actualEnd: 1777723800000,
                actionCount: 2
            }
        ],
        statistics: {
            shards: { moving: 5, nonMoving: 0 },
            links: 5,
            paths: 3,
            targets: 4
        }
    };

    const mockSiteRecord = {} as SiteRecord;
    const dummyTrigger = {} as HTMLElement;

    it("renders wave tooltip grouping jump windows by jumpGroupSize without Duration column when grouped", () => {
        const component = new TooltipComponent(mockRegistry);
        const configGroupSize3 = createSiteConfig(3);

        component.showWaveTooltip(1, mockWaveState, configGroupSize3, mockSiteRecord, dummyTrigger);

        // With jumpGroupSize = 3, windows 1-3 should be merged into "J1-3"
        expect(mockCardHtml).toContain("J1-3");
        expect(mockCardHtml).toContain("Wave 1 Summary");
        expect(mockCardHtml).toContain("Shards: 5");
        expect(mockCardHtml).not.toContain("<th>Duration</th>");
        expect(mockCardClasses.has("width-wave")).toBe(true);
    });

    it("renders wave tooltip with Duration column when individual window has > 3 actions and highlights duration > 1m", () => {
        const component = new TooltipComponent(mockRegistry);
        const configGroupSize1 = createSiteConfig(1);

        component.showWaveTooltip(1, mockWaveState, configGroupSize1, mockSiteRecord, dummyTrigger);

        expect(mockCardHtml).toContain("J1");
        expect(mockCardHtml).toContain("J2");
        expect(mockCardHtml).toContain("J3");

        // Verify column headers: Jump, Actions, Duration in order
        const jumpIndex = mockCardHtml.indexOf("<th>Jump</th>");
        const actionsIndex = mockCardHtml.indexOf("<th>Actions</th>");
        const durationIndex = mockCardHtml.indexOf("<th>Duration</th>");
        expect(jumpIndex).toBeGreaterThan(-1);
        expect(actionsIndex).toBeGreaterThan(jumpIndex);
        expect(durationIndex).toBeGreaterThan(actionsIndex);

        // Window 1 has 6 actions (> 3) and diff of 75s (> 1m), so it has mismatch-cell highlight
        expect(mockCardHtml).toContain('<td class="mismatch-cell">1m 15s</td>');
        // Window 2 has 4 actions (> 3) and diff of 25s (<= 1m), so normal cell
        expect(mockCardHtml).toContain("<td>25s</td>");
        // Window 3 has 2 actions (<= 3) so duration is "-"
        expect(mockCardHtml).toContain("<td>-</td>");
    });

    it("omits Duration column when all individual windows have 3 or fewer actions", () => {
        const component = new TooltipComponent(mockRegistry);
        const configGroupSize1 = createSiteConfig(1);

        const lowActionWaveState: WaveState = {
            ...mockWaveState,
            shardJumpWindows: [
                {
                    jumpNumber: 1,
                    scheduledStart: 1777723200000,
                    actualEnd: 1777723225000,
                    actionCount: 3
                },
                {
                    jumpNumber: 2,
                    scheduledStart: 1777723500000,
                    actualEnd: 1777723500000,
                    actionCount: 2
                }
            ]
        };

        component.showWaveTooltip(1, lowActionWaveState, configGroupSize1, mockSiteRecord, dummyTrigger);

        expect(mockCardHtml).toContain("<th>Jump</th>");
        expect(mockCardHtml).toContain("<th>Actions</th>");
        expect(mockCardHtml).not.toContain("<th>Duration</th>");
    });

    it("renders link tooltip correctly with faction colors and mismatched links row", () => {
        const component = new TooltipComponent(mockRegistry);
        const config = createSiteConfig(3);

        const waveWithMismatch: WaveState = {
            ...mockWaveState,
            shardJumpWindows: [
                {
                    ...mockWaveState.shardJumpWindows[0]!,
                    mismatchedScoringJumps: { RES: 1 }
                }
            ]
        };

        component.showLinkTooltip(1, waveWithMismatch, "RES", config, dummyTrigger);

        expect(mockCardClasses.has("width-links")).toBe(true);
        expect(mockCardClasses.has("bg-res")).toBe(true);
        expect(mockCardHtml).toContain("Jump");
        expect(mockCardHtml).toContain("Mismatched Jumps");
    });

    it("renders goal tooltip handling capped portals where scoredCount is omitted in later jump windows", () => {
        const component = new TooltipComponent(mockRegistry);
        const config = createSiteConfig(1);

        const goalWaveState: WaveState = {
            points: {
                total: { RES: 5 },
                goals: { RES: 5 }
            },
            shardJumpWindows: [
                {
                    jumpNumber: 1,
                    scheduledStart: 1777723200000,
                    actualEnd: 1777723200000,
                    actionCount: 1,
                    points: { total: { RES: 5 } },
                    goalsBreakdown: {
                        RES: [{ portalId: 10, scoredCount: 1 }]
                    }
                },
                {
                    jumpNumber: 2,
                    scheduledStart: 1777723500000,
                    actualEnd: 1777723500000,
                    actionCount: 1,
                    goalsBreakdown: {
                        RES: [{ portalId: 10, unscoredCount: 1 }]
                    }
                }
            ]
        };

        const recordWithPortal: SiteRecord = {
            metadata: { siteId: "site-london", seasonId: "2026-test", lastUpdated: 1000 },
            observations: {
                portals: {
                    10: { title: "Tower Bridge", latE6: 51500000, lngE6: -100000 }
                }
            }
        };

        component.showGoalTooltip(1, goalWaveState, "RES", config, recordWithPortal, dummyTrigger);

        expect(mockCardClasses.has("width-goals")).toBe(true);
        expect(mockCardClasses.has("bg-res")).toBe(true);
        expect(mockCardHtml).toContain("Tower Bridge");
        expect(mockCardHtml).toContain("<td>1</td>");
        expect(mockCardHtml).toContain("<td>0 (1)</td>");
    });
});
