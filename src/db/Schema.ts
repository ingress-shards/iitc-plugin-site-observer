import type { DBSchema } from "idb";
import type { SiteState } from "@ingress-shards/ingress-events-core";
import { ACTIVE_STORES } from "./DataBaseManager";

export interface MyDatabaseSchema extends DBSchema {
    [ACTIVE_STORES.SITE_STATE]: {
        key: string;
        value: SiteState;
    };
    [ACTIVE_STORES.SHARD_JUMP_CAPTURE]: {
        key: string;
        value: any;
    };
}
