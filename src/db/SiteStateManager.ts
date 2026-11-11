import type { SiteState } from "@ingress-shards/ingress-events-core";
import { getDatabase, ACTIVE_STORES } from "./DataBaseManager";

/**
 * Manages site state data stored locally in IndexedDB.
 */
export class SiteStateManager {
    private readonly STORE_NAME = ACTIVE_STORES.SITE_STATE;

    /**
     * Store site state data.
     */
    public async store(data: SiteState): Promise<void> {
        const database = await getDatabase();
        await database.put(this.STORE_NAME, data, data.metadata.siteId);
    }

    /**
     * Retrieve site state data for a specific site.
     */
    public async get(siteId: string): Promise<SiteState | undefined> {
        const database = await getDatabase();
        return database.get(this.STORE_NAME, siteId);
    }

    /**
     * Clear all site states from IndexedDB.
     */
    public async clearAll(): Promise<void> {
        const database = await getDatabase();
        await database.clear(this.STORE_NAME);
    }

    /**
     * Delete data for a specific site.
     */
    public async delete(siteId: string): Promise<void> {
        const database = await getDatabase();
        await database.delete(this.STORE_NAME, siteId);
    }
}
