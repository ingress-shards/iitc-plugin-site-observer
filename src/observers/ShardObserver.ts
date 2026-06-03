import * as ZonedDateTime from "temporal-polyfill/fns/zoneddatetime";
import { IntelObserver } from "./IntelObserver";
import { ShardJumpDataManager } from "../db/ShardJumpDataManager";
import { ObserverEventInput, ObserverResult } from "../types/ObserverEvents";
import { type ShardJumpCapture } from "@ingress-shards/ingress-events-core";

export class ShardObserver implements IntelObserver<void> {
    constructor(private dataManager: ShardJumpDataManager) {}

    observe(input: ObserverEventInput<void>) {
        console.log(`[Site Observer: Shard Jumps] Observing for site ${input.siteId}`);
        window.postAjax(
            "getShardJumps",
            {},
            async ({ result }: { result: string }) => {
                const rawData = JSON.parse(result);
                if (process.env.APP_ENV === "dev") {
                    console.log("[Site Observer: Shard Jumps] Raw data", rawData);
                    await this.dataManager.store(ZonedDateTime.epochMilliseconds(input.timestamp), rawData);
                }

                // Cast to ShardJumpCapture directly to avoid pulling in the heavy zod library.
                // If you need to project or strip keys specifically for memory usage,
                // you can add a manual mapping function here.
                const shardJumps = rawData as ShardJumpCapture;
                window.dispatchEvent(
                    new CustomEvent<ObserverEventInput<ShardJumpCapture>>(ObserverResult.SHARD_JUMPS_OBSERVED, {
                        detail: { ...input, data: shardJumps },
                    }),
                );
            },
            (_status, _result, error) => {
                console.log("[Site Observer: Shard Jumps] Scheduled download failed", error);
            },
        );
    }
}
