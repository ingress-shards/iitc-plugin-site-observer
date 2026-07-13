import * as Now from "temporal-polyfill/fns/now";
import * as Instant from "temporal-polyfill/fns/instant";
import { IntelObserver } from "./IntelObserver";
import { ShardJumpDataManager } from "../db/ShardJumpDataManager";
import { ObserverResult } from "../types/ObserverEvents";
import { type ShardJumpCapture } from "@ingress-shards/ingress-events-core";

export class ShardObserver implements IntelObserver {
    constructor(private dataManager: ShardJumpDataManager) {}

    observe(): void {
        console.log(`[Site Observer: Shard Jumps] Attempting to retrieve shard jumps`);
        window.postAjax(
            "getShardJumps",
            {},
            async ({ result }: { result: string }) => {
                try {
                    const rawData = JSON.parse(result);
                    const timestamp = Instant.epochMilliseconds(Now.instant());

                    if (process.env.APP_ENV === "dev") {
                        console.log("[Site Observer: Shard Jumps] Raw data", rawData);
                        await this.dataManager.store(timestamp, rawData);
                    }

                    window.dispatchEvent(
                        new CustomEvent<ShardJumpCapture>(ObserverResult.SHARD_JUMPS_OBSERVED, {
                            detail: rawData as ShardJumpCapture,
                        }),
                    );
                } catch (error) {
                    console.error("[Site Observer: Shard Jumps] Error parsing or storing shard jumps:", error);
                }
            },
            (_status, _result, error) => {
                console.log("[Site Observer: Shard Jumps] Failure to retrieve shard jumps", error);
            },
        );
    }
}
