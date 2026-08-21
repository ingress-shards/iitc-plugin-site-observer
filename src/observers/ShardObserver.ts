import * as Now from "temporal-polyfill/fns/Now";
import type { IntelObserver } from "./IntelObserver";
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
                    const timestamp = Now.instant().epochMilliseconds;

                    const captureData: ShardJumpCapture = {
                        ...rawData,
                        timestamp,
                    };

                    if (process.env.APP_ENV === "dev") {
                        await this.dataManager.store(timestamp, captureData);
                    }

                    window.dispatchEvent(
                        new CustomEvent<ShardJumpCapture>(ObserverResult.SHARD_JUMPS_OBSERVED, {
                            detail: captureData,
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
