import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ObserverScheduler } from "./ObserverScheduler.js";
import type { SiteConfig } from "@ingress-shards/ingress-events-core";
import { ObserverCommand } from "./types/ObserverEvents.js";

describe("ObserverScheduler", () => {
    const baseNow = 1777700000000;

    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(baseNow);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    const createSite = (startOffsetMs: number): SiteConfig => {
        const start = baseNow + startOffsetMs;
        return {
            seasonId: "season-test",
            geocode: {
                id: "site-alpha",
                name: "Site Alpha",
                eventType: "ANOMALY",
                latE6: 51500000,
                lngE6: -100000,
                startTime: "2026-06-01T12:00:00Z[UTC]",
                timeZone: "UTC",
                countryCode: "GB",
            },
            timeline: {
                start,
                preEventCutoff: start - 2 * 60 * 60 * 1000,
                end: start + 45 * 60 * 1000,
                durationMinutes: 45,
                jumpGroupSize: 3,
                shards: [
                    {
                        waveNumber: 1,
                        start: start + 10 * 60 * 1000,
                        end: start + 15 * 60 * 1000,
                        expectedShards: 5,
                        shardsActions: [
                            { action: "spawn", time: start + 10 * 60 * 1000 },
                            { action: "jump", time: start + 12 * 60 * 1000 }
                        ]
                    }
                ]
            }
        };
    };

    it("schedules alarms for upcoming events within the maximum window", () => {
        // Event starts in 1 hour
        const site = createSite(60 * 60 * 1000);
        const scheduler = new ObserverScheduler([site]);

        const timetable = scheduler.getTimetable();
        expect(timetable["site-alpha"]).toBeDefined();
        // 1 pre-event alarm (-5 mins) + 2 shard action alarms (+1 min delay) + 1 post-event alarm (+1 min delay)
        expect(timetable["site-alpha"]?.length).toBe(4);

        const nextAlarm = scheduler.getNextAlarm();
        expect(nextAlarm).toBeDefined();
        expect(nextAlarm?.siteId).toBe("site-alpha");
        expect(nextAlarm?.type).toBe(ObserverCommand.FETCH_SHARD_JUMPS);
        expect(nextAlarm?.timestamp).toBe(site.timeline.start - 5 * 60 * 1000);
    });

    it("ignores alarms for events that have already passed", () => {
        // Event started 2 hours ago
        const pastSite = createSite(-2 * 60 * 60 * 1000);
        const scheduler = new ObserverScheduler([pastSite]);

        const timetable = scheduler.getTimetable();
        expect(timetable["site-alpha"]).toBeUndefined();
        expect(scheduler.getNextAlarm()).toBeUndefined();
    });

    it("sorts multiple alarms chronologically in the run queue", () => {
        const site1 = createSite(2 * 60 * 60 * 1000); // 2 hours in future
        const site2: SiteConfig = {
            ...createSite(1 * 60 * 60 * 1000), // 1 hour in future
            geocode: {
                ...createSite(1 * 60 * 60 * 1000).geocode,
                id: "site-beta"
            }
        };

        const scheduler = new ObserverScheduler([site1, site2]);
        const nextAlarm = scheduler.getNextAlarm();
        expect(nextAlarm?.siteId).toBe("site-beta");
    });
});
