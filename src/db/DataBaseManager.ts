import { openDB, IDBPDatabase } from "idb";
import { MyDatabaseSchema } from "./Schema";

const DB_NAME = process.env.DATABASE_NAME;
const DB_VERSION = 1;

export const ACTIVE_STORES = {
    SHARD_JUMP_CAPTURE: "shard-jump-capture",
    SITE_RECORD: "site-record",
} as const;

let databaseInstance: Promise<IDBPDatabase<MyDatabaseSchema>> | undefined;
export const getDatabase = () => {
    if (!databaseInstance) {
        console.log(`[Site Observer: DB] Opening database: ${DB_NAME} (v${DB_VERSION})`);
        databaseInstance = openDB<MyDatabaseSchema>(DB_NAME, DB_VERSION, {
            upgrade: (database) => {
                console.log(`[Site Observer: DB] Upgrading database scheme...`);
                if (!database.objectStoreNames.contains(ACTIVE_STORES.SITE_RECORD)) {
                    database.createObjectStore(ACTIVE_STORES.SITE_RECORD);
                }

                // Shard jump capture is a development-only tool for debugging and data collection
                if (process.env.APP_ENV === "dev") {
                    if (!database.objectStoreNames.contains(ACTIVE_STORES.SHARD_JUMP_CAPTURE)) {
                        database.createObjectStore(ACTIVE_STORES.SHARD_JUMP_CAPTURE);
                    }
                }
            },
        })
            .then((database) => {
                console.log(`[Site Observer: DB] Database connected successfully`);
                return database;
            })
            .catch((error) => {
                console.error(`[Site Observer: DB] Failed to open database:`, error);
                throw error;
            });
    }
    return databaseInstance;
};
