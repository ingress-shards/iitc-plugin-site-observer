import { getDatabase, ACTIVE_STORES } from "./DataBaseManager";

/**
 * Manages raw jump history data stored locally in IndexedDB.
 */
export class ShardJumpDataManager {
    private readonly STORE_NAME = ACTIVE_STORES.SHARD_JUMP_CAPTURE;

    /**
     * Store raw jump data using a timestamp key.
     */
    public async store(timestampMs: number, rawData: any): Promise<void> {
        if (process.env.APP_ENV !== "dev") return;

        try {
            const database = await getDatabase();
            await database.put(this.STORE_NAME, rawData, timestampMs.toString());
        } catch (error) {
            console.error("Shards Observer: Failed to store raw shard jumps", error);
        }
    }
}
