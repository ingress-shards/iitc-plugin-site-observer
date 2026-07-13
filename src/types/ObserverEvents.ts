// 1. Commands (The "Do This" triggers)
export enum ObserverCommand {
    FETCH_SHARD_JUMPS = "site-observer:command:fetch-shard-jumps",
    EXPORT_SITE_DATA = "site-observer:command:export-site-data",
    EXPORT_SITE_DISCOVERY = "site-observer:command:export-site-discovery",
    EXPORT_SITE_TARGET_PORTALS = "site-observer:command:export-site-target-portals",
}

// 2. Results (The "I Did This" notifications)
export enum ObserverResult {
    SHARD_JUMPS_OBSERVED = "site-observer:event:shard-jumps-observed",
    PRE_EVENT_ORNAMENTS_OBSERVED = "site-observer:event:pre-event-ornaments-observed",
    SITE_DATA_EXPORTED = "site-observer:event:site-data-exported",
}

// 3. UI Updates (The "Redraw This" broadcasts)
export enum UITrigger {
    UPDATE_SITE_STATUS = "site-observer:ui:update-site-status",
    UPDATE_SITE_OBSERVATIONS = "site-observer:ui:update-site-observations",
    SIGNAL_DATA_UPDATE = "site-observer:ui:signal-data-update",
}
