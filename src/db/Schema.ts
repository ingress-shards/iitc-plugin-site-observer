import { DBSchema } from "idb";
import type { SiteRecord } from "@ingress-shards/ingress-events-core";
import { ACTIVE_STORES } from "./DataBaseManager";

export interface MyDatabaseSchema extends DBSchema {
    [ACTIVE_STORES.SITE_RECORD]: {
        key: string;
        value: SiteRecord;
    };
    [ACTIVE_STORES.SHARD_JUMP_CAPTURE]: {
        key: string;
        value: any;
    };
}
