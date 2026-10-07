import { describe, it, expect } from "vitest";
import { SiteTableComponent } from "./SiteTableComponent.js";
import type { SeasonConfig } from "@ingress-shards/ingress-events-core";

const createMockSeasonConfig = (): Record<string, SeasonConfig> => ({
    "2026-cygnus": {
        metadata: {
            id: "2026-cygnus",
            year: 2026,
            name: "Cygnus",
        },
        sites: {
            "site-1": {
                geocode: {
                    startTime: "2026-10-24T14:00:00Z[UTC]",
                },
            },
            "site-2": {
                // Same date as site-1 to test deduplication
                geocode: {
                    startTime: "2026-10-24T18:00:00Z[UTC]",
                },
            },
            "site-3": {
                geocode: {
                    startTime: "2026-11-01T12:00:00Z[UTC]",
                },
            },
        },
    } as unknown as SeasonConfig,
});

describe("SiteTableComponent.getDateOptionGroups", () => {
    it("deduplicates dates and builds correct option structure", () => {
        const config = createMockSeasonConfig();
        const groups = SiteTableComponent.getDateOptionGroups(config, "en-GB");

        expect(groups).toHaveLength(1);
        expect(groups[0]?.label).toBe("2026: Cygnus");
        expect(groups[0]?.seasonId).toBe("2026-cygnus");

        // site-1 and site-2 share 2026-10-24, so exactly 2 dates should be present
        expect(groups[0]?.dates).toHaveLength(2);
        expect(groups[0]?.dates[0]?.value).toBe("2026-10-24");
        expect(groups[0]?.dates[1]?.value).toBe("2026-11-01");
    });

    it("formats dates according to en-GB locale", () => {
        const config = createMockSeasonConfig();
        const groups = SiteTableComponent.getDateOptionGroups(config, "en-GB");

        expect(groups[0]?.dates[0]?.label).toBe("Sat 24 Oct");
        expect(groups[0]?.dates[1]?.label).toBe("Sun 1 Nov");
    });

    it("formats dates according to en-US locale", () => {
        const config = createMockSeasonConfig();
        const groups = SiteTableComponent.getDateOptionGroups(config, "en-US");

        expect(groups[0]?.dates[0]?.label).toBe("Sat, Oct 24");
        expect(groups[0]?.dates[1]?.label).toBe("Sun, Nov 1");
    });

    it("formats dates according to de-DE locale", () => {
        const config = createMockSeasonConfig();
        const groups = SiteTableComponent.getDateOptionGroups(config, "de-DE");

        expect(groups[0]?.dates[0]?.label).toBe("Sa., 24. Okt.");
        expect(groups[0]?.dates[1]?.label).toBe("So., 1. Nov.");
    });

    it("formats dates according to ja-JP locale", () => {
        const config = createMockSeasonConfig();
        const groups = SiteTableComponent.getDateOptionGroups(config, "ja-JP");

        expect(groups[0]?.dates[0]?.label).toBe("10月24日(土)");
        expect(groups[0]?.dates[1]?.label).toBe("11月1日(日)");
    });

    it("defaults to runtime environment locale when locale argument is omitted", () => {
        const config = createMockSeasonConfig();
        const groups = SiteTableComponent.getDateOptionGroups(config);

        expect(groups[0]?.dates).toHaveLength(2);
        expect(typeof groups[0]?.dates[0]?.label).toBe("string");
        expect(groups[0]?.dates[0]?.label.length).toBeGreaterThan(0);
    });
});
