import * as ZonedDateTime from "temporal-polyfill/fns/zoneddatetime";
import * as Now from "temporal-polyfill/fns/now";
import * as Duration from "temporal-polyfill/fns/duration";
import { formatDuration, SiteManager, type SeasonConfig } from "@ingress-shards/ingress-events-core";
import { ObserverEventInput, ObserverCommand } from "./types/ObserverEvents";

export interface ObserverAlarm extends ObserverEventInput<void> {
    type: ObserverCommand;
}

const MAX_TIMEOUT_MS = 2147483647;

export class ObserverScheduler {
    private observerTimetable: Record<string, ObserverAlarm[]> = {};
    private runQueue: ObserverAlarm[] = [];
    private activeTimer: NodeJS.Timeout;

    constructor(private seasonConfig: Record<string, SeasonConfig>) {
        this.buildTimetable();
        this.prepareRunQueue();
    }

    /**
     * Builds a sorted timetable of absolute timestamps for observation from loaded site configs.
     */
    private buildTimetable(): void {
        for (const season of Object.values(this.seasonConfig)) {
            for (const [siteId, { geocode, shardMechanics }] of Object.entries(season.sites)) {
                if (!shardMechanics) continue;

                const startTimeZoned = ZonedDateTime.fromString(geocode.startTime);

                const beforeStartTimeZoned = ZonedDateTime.add(startTimeZoned, Duration.fromFields({ minutes: -5 }));
                this.pushAlarmToTimetable({
                    siteId,
                    timestamp: beforeStartTimeZoned,
                    type: ObserverCommand.FETCH_SHARD_JUMPS,
                });

                for (const wave of shardMechanics.waves) {
                    const waveStartTimeZoned = ZonedDateTime.add(
                        startTimeZoned,
                        Duration.fromFields({ minutes: wave.startOffset }),
                    );

                    // Trigger a download for every waveAction that isn't a "no move"
                    for (const waveAction of shardMechanics.waveActions.filter((a) =>
                        ["spawn", "jump", "despawn"].includes(a.action),
                    )) {
                        const waveActionTimeZoned = ZonedDateTime.add(
                            waveStartTimeZoned,
                            Duration.fromFields({ minutes: waveAction.time + 1 }),
                        );
                        this.pushAlarmToTimetable({
                            siteId,
                            timestamp: waveActionTimeZoned,
                            type: ObserverCommand.FETCH_SHARD_JUMPS,
                        });
                    }
                }

                // add a trigger for the end of the event
                const endOfEventTimeZoned = ZonedDateTime.add(
                    startTimeZoned,
                    Duration.fromFields({ minutes: SiteManager.getEventDuration(shardMechanics) }),
                );
                this.pushAlarmToTimetable({
                    siteId,
                    timestamp: endOfEventTimeZoned,
                    type: ObserverCommand.FETCH_SHARD_JUMPS,
                });
            }
        }
    }

    pushAlarmToTimetable(trigger: ObserverAlarm) {
        const now = Now.zonedDateTimeISO(ZonedDateTime.timeZoneId(trigger.timestamp));
        if (
            ZonedDateTime.compare(trigger.timestamp, now) <= 0 ||
            Duration.total(ZonedDateTime.until(now, trigger.timestamp, { largestUnit: "days" }), {
                unit: "milliseconds",
            }) > MAX_TIMEOUT_MS
        ) {
            return;
        }

        if (!this.observerTimetable[trigger.siteId]) this.observerTimetable[trigger.siteId] = [];

        this.observerTimetable[trigger.siteId].push(trigger);
    }

    getTimetable(): Record<string, ObserverAlarm[]> {
        return this.observerTimetable;
    }

    private prepareRunQueue(): void {
        this.runQueue = Object.values(this.observerTimetable).flat();

        this.runQueue.sort((a, b) => ZonedDateTime.compare(a.timestamp, b.timestamp));

        this.scheduleNextEvent();
    }

    private scheduleNextEvent(): void {
        if (this.activeTimer) clearTimeout(this.activeTimer);

        const next = this.runQueue[0];
        if (!next) return;

        const now = Now.zonedDateTimeISO(ZonedDateTime.timeZoneId(next.timestamp));
        const duration = ZonedDateTime.until(now, next.timestamp, { largestUnit: "days" });
        const delay = Math.max(0, Duration.total(duration, { unit: "milliseconds" }));

        console.log(
            `[Site Observer: Scheduler] Next alarm in ${formatDuration(duration)} for ${next.siteId} (delay ${delay} ms)`,
        );

        this.activeTimer = setTimeout(() => {
            this.dispatchEvent(next);
            this.runQueue.shift();
            this.scheduleNextEvent();
        }, delay);
    }

    private dispatchEvent(alarm: ObserverAlarm): void {
        console.log(
            `[Site Observer: Alarm] Dispatching ${alarm.type} for ${alarm.siteId} at ${ZonedDateTime.toString(alarm.timestamp)}`,
        );

        const event = new CustomEvent<ObserverEventInput<void>>(alarm.type, {
            detail: {
                ...alarm,
            },
        });
        window.dispatchEvent(event);
    }
}
