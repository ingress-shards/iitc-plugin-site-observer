import { SeriesGeocodeConfig, SeriesMetadataConfig, VersionConfig } from "@ingress-shards/shards-core";

export class ConfigManager {
    private readonly DB_NAME = process.env.DATABASE_NAME;
    private readonly STORE_NAME = "conf";
    private readonly VERSION_KEY = "version";
    private readonly METADATA_KEY = "series_metadata";
    private readonly GEOCODE_KEY = "series_geocode";

    private isSyncing = false;

    private baseUrl: string;

    constructor(baseUrl: string) {
        this.baseUrl = baseUrl.replace(/\/+$/, "");
    }

    public async syncConfig(): Promise<void> {
        if (this.isSyncing) {
            console.log("Shards Observer: Sync already in progress, skipping.");
            return;
        }

        this.isSyncing = true;
        try {
            console.log("Shards Observer: Checking for configuration updates...");
            const versionUrl = `${this.baseUrl}/public/conf/version.json`;
            const versionResp = await fetch(versionUrl);

            if (!versionResp.ok) {
                console.warn(`Shards Observer: Could not fetch version.json (${versionResp.status}).`);
                return;
            }

            const remoteInfo: VersionConfig = await versionResp.json();
            const localData: VersionConfig | undefined = await this.getVersion();

            if (!localData || localData?.version !== remoteInfo.version) {
                console.log(
                    `Shards Observer: Updating configuration (${localData?.version ?? "initial"} => ${
                        remoteInfo.version
                    }).`,
                );

                // Update version first to mark the intent
                await this.databaseOp("readwrite", (store) => store.put(remoteInfo, this.VERSION_KEY));

                // Clear existing data to ensure consistency on fresh fetch
                await Promise.all([
                    this.fetchAndStoreConfigData("/public/conf/series_metadata.json", this.METADATA_KEY),
                    this.fetchAndStoreConfigData("/public/conf/series_geocode.json", this.GEOCODE_KEY),
                ]);

                console.log(`Shards Observer: Configuration sync complete.`);
            } else {
                console.log(`Shards Observer: Configuration is up to date (v${localData?.version}).`);
            }
        } catch (error) {
            console.error("Shards Observer: Error during configuration sync", error);
        } finally {
            this.isSyncing = false;
        }
    }

    public getVersion(): Promise<VersionConfig | undefined> {
        return this.databaseOp("readonly", (store) => store.get(this.VERSION_KEY));
    }

    public getMetadata(): Promise<SeriesMetadataConfig | undefined> {
        return this.databaseOp("readonly", (store) => store.get(this.METADATA_KEY));
    }

    public getGeocode(): Promise<SeriesGeocodeConfig | undefined> {
        return this.databaseOp("readonly", (store) => store.get(this.GEOCODE_KEY));
    }

    private async fetchAndStoreConfigData(requestPath: string, storeKey: string): Promise<void> {
        const url = `${this.baseUrl}${requestPath}`;
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to fetch ${requestPath}: ${response.statusText}`);
        }
        const responseJson = await response.json();
        await this.databaseOp("readwrite", (store) => store.put(responseJson, storeKey));
        console.log(`Shards Observer: Updated ${storeKey}.`);
    }

    private handleUpgrade(event: IDBVersionChangeEvent) {
        const database = (event.target as IDBOpenDBRequest).result;
        if (!database.objectStoreNames.contains(this.STORE_NAME)) {
            database.createObjectStore(this.STORE_NAME);
        }
    }

    private async openDB(): Promise<IDBDatabase> {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.DB_NAME, 1);
            request.addEventListener("error", () =>
                reject(new Error(request.error?.message ?? "IndexedDB open error")),
            );
            request.addEventListener("success", () => resolve(request.result));
            request.addEventListener("upgradeneeded", (event) => this.handleUpgrade(event));
        });
    }

    private async databaseOp<T>(
        mode: IDBTransactionMode,
        callback: (store: IDBObjectStore) => IDBRequest | void,
    ): Promise<T> {
        const database = await this.openDB();
        return new Promise<T>((resolve, reject) => {
            try {
                const transaction = database.transaction(this.STORE_NAME, mode);
                const store = transaction.objectStore(this.STORE_NAME);

                transaction.addEventListener("error", () =>
                    reject(new Error(transaction.error?.message ?? "IndexedDB transaction error")),
                );

                const request = callback(store);

                if (request) {
                    request.addEventListener("error", () =>
                        reject(new Error(request.error?.message ?? "IndexedDB request error")),
                    );
                    request.addEventListener("success", () => resolve(request.result as T));
                } else {
                    transaction.addEventListener("complete", () => resolve("complete" as unknown as T));
                }
            } catch (error) {
                reject(error instanceof Error ? error : new Error(String(error)));
            } finally {
                // DB remains open, but transactions close automatically on success/error
            }
        });
    }
}
