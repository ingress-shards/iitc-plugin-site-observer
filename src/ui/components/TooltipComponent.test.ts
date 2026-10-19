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
                                linkRules: ["default_jump"]
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
            goalScoringRules: {}
        }
    } as unknown as EventConfigRegistry;

    const mockWaveState: WaveState = {
        points: { total: {}, links: {} },
        statistics: {
            shards: { moving: 2, nonMoving: 0 },
            targetsCount: 1,
            paths: 1,
            links: 2,
            linkAlignmentMismatch: 0
        },
        shardJumpWindows: [
            {
                jumpNumber: 1,
                timestamp: 1777723200000,
                historyCount: 3,
                points: { RES: 0, ENL: 0 },
                factionBreakdowns: {
                    RES: {
                        goals: [],
                        links: { default_jump: 2 }
                    }
                }
            },
            {
                jumpNumber: 2,
                timestamp: 1777723500000,
                historyCount: 4,
                points: { RES: 0, ENL: 0 },
                factionBreakdowns: {}
            },
            {
                jumpNumber: 3,
                timestamp: 1777723800000,
                historyCount: 2,
                points: { RES: 0, ENL: 0 },
                factionBreakdowns: {}
            }
        ]
    };

    const mockSiteRecord = {} as SiteRecord;
    const dummyTrigger = {} as HTMLElement;

    it("renders wave tooltip grouping jump windows by jumpGroupSize", () => {
        const component = new TooltipComponent(mockRegistry);
        const configGroupSize3 = createSiteConfig(3);

        component.showWaveTooltip(1, mockWaveState, configGroupSize3, mockSiteRecord, dummyTrigger);

        // With jumpGroupSize = 3, windows 1-3 should be merged into "J1-3"
        expect(mockCardHtml).toContain("J1-3");
        expect(mockCardHtml).toContain("Wave 1 Summary");
        expect(mockCardHtml).toContain("Shards: 2");
        expect(mockCardClasses.has("width-wave")).toBe(true);
    });

    it("renders wave tooltip with individual windows when jumpGroupSize is 1", () => {
        const component = new TooltipComponent(mockRegistry);
        const configGroupSize1 = createSiteConfig(1);

        component.showWaveTooltip(1, mockWaveState, configGroupSize1, mockSiteRecord, dummyTrigger);

        expect(mockCardHtml).toContain("J1");
        expect(mockCardHtml).toContain("J2");
        expect(mockCardHtml).toContain("J3");
    });

    it("renders link tooltip correctly with faction colors", () => {
        const component = new TooltipComponent(mockRegistry);
        const config = createSiteConfig(3);

        component.showLinkTooltip(1, mockWaveState, "RES", config, dummyTrigger);

        expect(mockCardClasses.has("width-links")).toBe(true);
        expect(mockCardClasses.has("bg-res")).toBe(true);
        expect(mockCardHtml).toContain("Jump");
    });
});
