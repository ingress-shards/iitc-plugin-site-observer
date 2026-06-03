import * as ZonedDateTime from "temporal-polyfill/fns/zoneddatetime";
import { IntelProcessor } from "./IntelProcessor";
import type { ShardJumpCapture, FragmentArtifact, TargetArtifact } from "@ingress-shards/ingress-events-core";
import { ObserverEventInput, UITrigger } from "../types/ObserverEvents";
export class ShardProcessor implements IntelProcessor<ShardJumpCapture> {
    process({ siteId, timestamp, data }: ObserverEventInput<ShardJumpCapture>): void {
        const artifacts = data?.artifact ?? [];
        const artifactsWithData = artifacts.filter((a) => (a as FragmentArtifact).fragment ?? (a as TargetArtifact).target ?? false);

        console.log(
            `[Site Observer: Shard Processor] Processing site ${siteId} at ${ZonedDateTime.toString(timestamp)}`,
            artifactsWithData,
        );

        window.dispatchEvent(new CustomEvent(UITrigger.SIGNAL_DATA_UPDATE));
    }
}
