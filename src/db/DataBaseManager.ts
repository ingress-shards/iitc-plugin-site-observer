import { openDB, unwrap } from "idb";
import type { IDBPDatabase } from "idb";
import type { SiteState, SiteTelemetry } from "@ingress-shards/ingress-events-core";
import type { MyDatabaseSchema } from "./Schema";

const DB_NAME = process.env.DATABASE_NAME;
const DB_VERSION = 2;

const LEGACY_SITE_RECORD_STORE = "site-record";

export const ACTIVE_STORES = {
    SHARD_JUMP_CAPTURE: "shard-jump-capture",
    SITE_STATE: "site-state",
} as const;

export interface LegacySiteRecord extends Omit<SiteState, "telemetry"> {
    observations?: SiteTelemetry;
    telemetry?: SiteTelemetry;
}

/**
 * Normalizes a legacy v1 IndexedDB record (`observations`) into the v2 `SiteState` (`telemetry`) shape.
 */
export const migrateLegacySiteRecord = (record: LegacySiteRecord): SiteState => {
    const { observations, telemetry, ...rest } = record;
    const resolvedTelemetry = telemetry ?? observations;
    return {
        ...rest,
        ...(resolvedTelemetry !== undefined && { telemetry: resolvedTelemetry }),
    };
};

let databaseInstance: Promise<IDBPDatabase<MyDatabaseSchema>> | undefined;

export const getDatabase = async () => {
    if (!databaseInstance) {
        console.log(`[Site Observer: DB] Opening database: ${DB_NAME} (v${DB_VERSION})`);
        const openPromise = openDB<MyDatabaseSchema>(DB_NAME, DB_VERSION, {
            upgrade: (database, oldVersion, newVersion, transaction) => {
                console.log(`[Site Observer: DB] Upgrading database schema from v${oldVersion} to v${newVersion}...`);
                const rawDatabase = unwrap(database);
                const rawTransaction = unwrap(transaction);

                if (!rawDatabase.objectStoreNames.contains(ACTIVE_STORES.SITE_STATE)) {
                    rawDatabase.createObjectStore(ACTIVE_STORES.SITE_STATE);
                }

                if (rawDatabase.objectStoreNames.contains(LEGACY_SITE_RECORD_STORE)) {
                    const legacyStore = rawTransaction.objectStore(LEGACY_SITE_RECORD_STORE);
                    const targetStore = rawTransaction.objectStore(ACTIVE_STORES.SITE_STATE);
                    const cursorRequest = legacyStore.openCursor();
                    let migratedCount = 0;

                    cursorRequest.addEventListener("success", () => {
                        const cursor = cursorRequest.result;
                        if (cursor) {
                            const migratedState = migrateLegacySiteRecord(cursor.value as LegacySiteRecord);
                            targetStore.put(migratedState, cursor.key);
                            migratedCount++;
                            cursor.continue();
                        } else {
                            rawDatabase.deleteObjectStore(LEGACY_SITE_RECORD_STORE);
                            console.log(`[Site Observer: DB] Migrated ${migratedCount} legacy site record(s) to '${ACTIVE_STORES.SITE_STATE}'.`);
                        }
                    });
                }

                // Shard jump capture is a development-only tool for debugging and data collection
                if (process.env.APP_ENV === "dev") {
                    if (!rawDatabase.objectStoreNames.contains(ACTIVE_STORES.SHARD_JUMP_CAPTURE)) {
                        rawDatabase.createObjectStore(ACTIVE_STORES.SHARD_JUMP_CAPTURE);
                    }
                }
            },
        });

        databaseInstance = (async () => {
            try {
                const database = await openPromise;
                console.log(`[Site Observer: DB] Database connected successfully`);
                return database;
            } catch (error) {
                console.error(`[Site Observer: DB] Failed to open database:`, error);
                throw error;
            }
        })();
    }
    return databaseInstance;
};
