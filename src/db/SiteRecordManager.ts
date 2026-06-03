import type { SiteRecord } from "@ingress-shards/ingress-events-core";
import { getDatabase, ACTIVE_STORES } from "./DataBaseManager";

/**
 * Manages site data stored locally in IndexedDB.
 */
export class SiteRecordManager {
    private readonly STORE_NAME = ACTIVE_STORES.SITE_RECORD;

    /**
     * Store site data.
     */
    public async store(data: SiteRecord): Promise<void> {
        const database = await getDatabase();
        await database.put(this.STORE_NAME, data, data.metadata.geocode.id);
    }

    /**
     * Retrieve site data for a specific site.
     */
    public async get(siteId: string): Promise<SiteRecord | undefined> {
        const database = await getDatabase();
        return database.get(this.STORE_NAME, siteId);
    }
}
