import * as ZonedDateTime from "temporal-polyfill/fns/ZonedDateTime";
import * as Duration from "temporal-polyfill/fns/Duration";
import * as Instant from "temporal-polyfill/fns/Instant";
import * as Now from "temporal-polyfill/fns/Now";
import { formatDuration, type SeasonConfig } from "@ingress-shards/ingress-events-core";
import { ObserverCommand } from "./types/ObserverEvents";

export interface ObserverAlarm {
    siteId: string;
    timestamp: number; // Epoch milliseconds
    timeZone: string;
    type: ObserverCommand;
}

const MAX_TIMEOUT_MS = 48 * 60 * 60 * 1000;

export class ObserverScheduler {
    private observerTimetable: Record<string, ObserverAlarm[]> = {};
    private runQueue: ObserverAlarm[] = [];
    private activeTimer?: NodeJS.Timeout;

    constructor(private seasonConfig: Record<string, SeasonConfig>) {
        this.buildTimetable();
        this.prepareRunQueue();
    }

    private buildTimetable(): void {
        for (const season of Object.values(this.seasonConfig)) {
            for (const [siteId, { geocode, timeline }] of Object.entries(season.sites)) {
                if (!timeline) continue;

                const { timeZone } = geocode;

                // 1. Fetch 5 minutes before the event starts
                this.pushAlarmToTimetable({
                    siteId,
                    timestamp: timeline.start - 5 * 60 * 1000,
                    timeZone,
                    type: ObserverCommand.FETCH_SHARD_JUMPS,
                });

                // 2. Fetch for each wave action (spawns, jumps, despawns) plus a 1-minute delay
                for (const wave of timeline.shards) {
                    if (!wave.shardsActions) continue;
                    for (const shardAction of wave.shardsActions) {
                        this.pushAlarmToTimetable({
                            siteId,
                            timestamp: shardAction.time + 1 * 60 * 1000,
                            timeZone,
                            type: ObserverCommand.FETCH_SHARD_JUMPS,
                        });
                    }
                }

                // 3. Fetch at the end of the event (1 minute after timeline.end)
                this.pushAlarmToTimetable({
                    siteId,
                    timestamp: timeline.end + 1 * 60 * 1000,
                    timeZone,
                    type: ObserverCommand.FETCH_SHARD_JUMPS,
                });
            }
        }
    }

    private pushAlarmToTimetable(trigger: ObserverAlarm) {
        const now = Now.instant().epochMilliseconds;
        const delay = trigger.timestamp - now;

        if (delay <= 0 || delay > MAX_TIMEOUT_MS) {
            return;
        }

        let list = this.observerTimetable[trigger.siteId];
        if (!list) {
            list = [];
            this.observerTimetable[trigger.siteId] = list;
        }

        list.push(trigger);
    }

    getTimetable(): Record<string, ObserverAlarm[]> {
        return this.observerTimetable;
    }

    private prepareRunQueue(): void {
        this.runQueue = Object.values(this.observerTimetable).flat();
        this.runQueue.sort((a, b) => a.timestamp - b.timestamp);
        this.scheduleNextEvent();
    }

    private scheduleNextEvent(): void {
        if (this.activeTimer) clearTimeout(this.activeTimer);

        const next = this.runQueue[0];
        if (!next) return;

        const delay = Math.max(0, next.timestamp - Now.instant().epochMilliseconds);
        const duration = Duration.fromFields({ milliseconds: delay });

        console.log(
            `[Site Observer: Scheduler] ${next.siteId} - Next (${next.type}) in ${formatDuration(duration)} (delay ${delay} ms)`,
        );

        this.activeTimer = setTimeout(() => {
            this.dispatchEvent(next);
            this.runQueue.shift();
            this.scheduleNextEvent();
        }, delay);
    }

    private dispatchEvent(alarm: ObserverAlarm): void {
        const localZdt = Instant.toZonedDateTimeISO(
            Instant.fromEpochMilliseconds(alarm.timestamp),
            alarm.timeZone,
        );

        console.log(
            `[Site Observer: Alarm] ${alarm.siteId} - ${alarm.type} at ${ZonedDateTime.toString(localZdt)}`,
        );

        const event = new CustomEvent<ObserverAlarm>(alarm.type, {
            detail: { ...alarm },
        });
        window.dispatchEvent(event);
    }

    public getNextAlarm(): ObserverAlarm | undefined {
        return this.runQueue[0];
    }
}
