// 1. Commands (The "Do This" triggers)
export enum ObserverCommand {
    FETCH_SHARD_JUMPS = "site-observer:command:fetch-shard-jumps",
}

// 2. Results (The "I Did This" notifications)
export enum ObserverResult {
    SHARD_JUMPS_OBSERVED = "site-observer:event:shard-jumps-observed",
    PRE_EVENT_ORNAMENTS_OBSERVED = "site-observer:event:pre-event-ornaments-observed",
    SITE_DATA_EXPORTED = "site-observer:event:site-data-exported",
    SITE_TARGETS_OBSERVED = "site-observer:event:site-targets-observed",
}

// 3. UI Updates (The "Redraw This" broadcasts)
export enum UITrigger {
    UPDATE_SITE_STATUS = "site-observer:ui:update-site-status",
    SIGNAL_DATA_UPDATE = "site-observer:ui:signal-data-update",
}
