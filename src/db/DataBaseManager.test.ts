import { describe, it, expect } from "vitest";
import { migrateLegacySiteRecord, type LegacySiteRecord } from "./DataBaseManager";

describe("migrateLegacySiteRecord", () => {
    it("moves observations to telemetry while preserving metadata and analysis", () => {
        const legacyRecord: LegacySiteRecord = {
            metadata: { siteId: "site-alpha", seasonId: "2026-test", lastUpdated: 1000 },
            observations: {
                portals: {
                    1: { title: "Portal A", latE6: 10000000, lngE6: 20000000 },
                },
            },
            analysis: {
                waves: {},
            },
        };

        const migrated = migrateLegacySiteRecord(legacyRecord);

        expect(migrated).toEqual({
            metadata: { siteId: "site-alpha", seasonId: "2026-test", lastUpdated: 1000 },
            telemetry: {
                portals: {
                    1: { title: "Portal A", latE6: 10000000, lngE6: 20000000 },
                },
            },
            analysis: {
                waves: {},
            },
        });
        expect("observations" in migrated).toBe(false);
    });

    it("preserves existing telemetry if both fields exist", () => {
        const record: LegacySiteRecord = {
            metadata: { siteId: "site-beta", seasonId: "2026-test", lastUpdated: 2000 },
            observations: { portals: {} },
            telemetry: {
                shards: {
                    1: { history: [{ action: "spawn", moveTime: 2000, portalId: 1 }] },
                },
            },
        };

        const migrated = migrateLegacySiteRecord(record);

        expect(migrated.telemetry).toEqual({
            shards: {
                1: { history: [{ action: "spawn", moveTime: 2000, portalId: 1 }] },
            },
        });
        expect("observations" in migrated).toBe(false);
    });

    it("omits telemetry when neither observations nor telemetry existed", () => {
        const record: LegacySiteRecord = {
            metadata: { siteId: "site-empty", seasonId: "2026-test", lastUpdated: 3000 },
        };

        const migrated = migrateLegacySiteRecord(record);

        expect(migrated).toEqual({
            metadata: { siteId: "site-empty", seasonId: "2026-test", lastUpdated: 3000 },
        });
        expect("telemetry" in migrated).toBe(false);
    });
});
