import { describe, it, expect } from "vitest";
import { SiteTableComponent } from "./SiteTableComponent.js";
import {
    EventConfigRegistry,
    type EventBlueprints,
    type SeasonGeocode,
    type SeasonManifest,
} from "@ingress-shards/ingress-events-core";

const createMockRegistry = (): EventConfigRegistry => {
    return new EventConfigRegistry(
        {
            events: { ANOMALY: { label: "Anomaly" } },
            ornaments: {},
            shardMechanics: {},
            targetMechanics: {},
            linkScoringRules: {}
        } as unknown as EventBlueprints,
        {
            seasons: [
                {
                    id: "2026-cygnus",
                    year: 2026,
                    name: "Cygnus",
                    overviewUrl: "",
                    components: [
                        { eventType: "ANOMALY", startTime: "14:00", mechanics: {} }
                    ]
                }
            ]
        } as unknown as SeasonManifest,
        {
            seasons: [
                {
                    id: "2026-cygnus",
                    sites: [
                        {
                            id: "site-1",
                            name: "Site 1",
                            latE6: 0,
                            lngE6: 0,
                            eventType: "ANOMALY",
                            startTime: "2026-10-24T14:00:00Z[UTC]",
                            timeZone: "UTC",
                            countryCode: "GB"
                        },
                        {
                            id: "site-2",
                            name: "Site 2",
                            latE6: 0,
                            lngE6: 0,
                            eventType: "ANOMALY",
                            startTime: "2026-10-24T18:00:00Z[UTC]",
                            timeZone: "UTC",
                            countryCode: "GB"
                        },
                        {
                            id: "site-3",
                            name: "Site 3",
                            latE6: 0,
                            lngE6: 0,
                            eventType: "ANOMALY",
                            startTime: "2026-11-01T12:00:00Z[UTC]",
                            timeZone: "UTC",
                            countryCode: "GB"
                        }
                    ]
                }
            ]
        } as unknown as SeasonGeocode
    );
};

describe("SiteTableComponent.getDateOptionGroups", () => {
    it("deduplicates dates and builds correct option structure", () => {
        const registry = createMockRegistry();
        const groups = SiteTableComponent.getDateOptionGroups(registry, "en-GB");

        expect(groups).toHaveLength(1);
        expect(groups[0]?.label).toBe("2026: Cygnus");
        expect(groups[0]?.seasonId).toBe("2026-cygnus");

        // site-1 and site-2 share 2026-10-24, so exactly 2 dates should be present
        expect(groups[0]?.dates).toHaveLength(2);
        expect(groups[0]?.dates[0]?.value).toBe("2026-10-24");
        expect(groups[0]?.dates[1]?.value).toBe("2026-11-01");
    });

    it("formats dates according to en-GB locale", () => {
        const registry = createMockRegistry();
        const groups = SiteTableComponent.getDateOptionGroups(registry, "en-GB");

        expect(groups[0]?.dates[0]?.label).toBe("Sat 24 Oct");
        expect(groups[0]?.dates[1]?.label).toBe("Sun 1 Nov");
    });

    it("formats dates according to en-US locale", () => {
        const registry = createMockRegistry();
        const groups = SiteTableComponent.getDateOptionGroups(registry, "en-US");

        expect(groups[0]?.dates[0]?.label).toBe("Sat, Oct 24");
        expect(groups[0]?.dates[1]?.label).toBe("Sun, Nov 1");
    });

    it("formats dates according to de-DE locale", () => {
        const registry = createMockRegistry();
        const groups = SiteTableComponent.getDateOptionGroups(registry, "de-DE");

        expect(groups[0]?.dates[0]?.label).toBe("Sa., 24. Okt.");
        expect(groups[0]?.dates[1]?.label).toBe("So., 1. Nov.");
    });

    it("formats dates according to ja-JP locale", () => {
        const registry = createMockRegistry();
        const groups = SiteTableComponent.getDateOptionGroups(registry, "ja-JP");

        expect(groups[0]?.dates[0]?.label).toBe("10月24日(土)");
        expect(groups[0]?.dates[1]?.label).toBe("11月1日(日)");
    });

    it("defaults to runtime environment locale when locale argument is omitted", () => {
        const registry = createMockRegistry();
        const groups = SiteTableComponent.getDateOptionGroups(registry);

        expect(groups[0]?.dates).toHaveLength(2);
        expect(typeof groups[0]?.dates[0]?.label).toBe("string");
        expect(groups[0]?.dates[0]?.label.length).toBeGreaterThan(0);
    });
});

describe("SiteTableComponent.getSiteConfigsByDate", () => {
    it("groups site configs by plain date string", () => {
        const registry = createMockRegistry();
        const sites = registry.getAllSites();
        const grouped = SiteTableComponent.getSiteConfigsByDate(sites);

        expect(Object.keys(grouped)).toContain("2026-10-24");
        expect(Object.keys(grouped)).toContain("2026-11-01");
        expect(grouped["2026-10-24"]).toHaveLength(2);
        expect(grouped["2026-11-01"]).toHaveLength(1);
    });
});

