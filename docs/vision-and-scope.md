# Vision and Scope

## 1. Core Purpose

The core purpose of the Site Observer plugin is to observe and record the state of Ingress anomaly sites across all of their phases, and to generate accurate, timely data files representing the state of the site.

## 2. Target Audience & Primary Goal

- **Primary Goal:** The primary function of this plugin is to act as the data exporter for the Ingress Shard Map, providing the foundational data that powers the broader visualization ecosystem.
- **Secondary Goal:** To provide a live, in-browser view of the state of Ingress sites, for the operator or interested parties.

## 3. Phase Observation & Automation

The plugin operates on a **State-Driven Polling Architecture** that adjusts its behavior based on the current `SitePhase` of any active sites.

### Polling Behaviors by Phase:

- **`Scheduled` & `Discovery`:** Low-frequency, location-based polling to check for the presence and updates of ornaments. Ornaments can be dynamically added, removed, or changed by Niantic based on agent feedback up until roughly two hours before the event.
- **`Active`:** High-frequency, precision polling. The engine evaluates the exact `jump_times` for the event and triggers downloads strictly around those windows (e.g., 5 minutes before, during the window, and 5 minutes after).
- **`Processing` / `Complete` / `NoData`:** Polling is suspended for the site.

### The "Wake-Up" Mechanism

A schedule is created to determine when to poll the sites based on their current phase and the current time. This schedule is stored in the `Scheduler` class. Only the next poll action is scheduled using `setTimeout`. When the scheduled poll action is executed, the scheduler is updated to determine the next poll action.

### Manual Override & Development

During development (and as an emergency fallback in production), the UI must provide a persistent **"Manual Download"** button to force an immediate capture of the current shard jump state, bypassing the phase schedules.

## 4. Data Rules & Conflicts

### Ornament Volatility

Because Niantic can add, remove, or modify ornaments (portals and target zones) up until roughly two hours before an event begins, the plugin must handle data diffs carefully.

- **Default Behavior (Append-Only):** The plugin prefers to _not_ overwrite existing stored data to prevent accidental loss of manually verified portals. It will naturally discover and append new ornaments during polling.
- **Manual "Reset" Requirement:** Because the plugin is append-only by default, the UI must provide a **"Reset Ornaments"** function. This function clears the locally stored ornament data for a site and forces a fresh scan, essentially allowing the operator to true-up the dataset if Niantic performs a massive reshuffle. This action is explicitly destructive and relies on operator intervention.

## 5. State Management

The plugin should act as a **Stateless Data Conduit** rather than attempting to build and maintain a complex, ongoing local database of historical state to prevent data loss.

- **Primary Data Retrieval:** Instead of attempting to piece together the history of a shard's path by frequently polling `getArtifacts` (a pure snapshot) and computing the diffs locally, the plugin should rely primarily on retrieving the comprehensive jump history via the `getShardJumps` facility.
- **Resiliency:** This "fetch everything" approach ensures that even if the observer misses a jump window or the browser crashes mid-event, it won't permanently lose context. When the plugin restarts, it simply re-requests the entire set of available shard jumps, inherently re-syncing its state.
- **Role of Local Storage:** The existing `RawJumpsDataManager` and its IndexedDB backend should be treated primarily as a **development and validation tool**. It allows for verifying that the exact shape and completeness of the data being retrieved from the Intel map is accurate before generating the final JSON artifact for the downstream processor.

## Areas to Define

_(We will flesh these out one at a time focusing on business logic first)_

- **Data Processing Rules:** How do we handle conflicting information, data transformation from Niantic's format to our format, and validation before saving?
- **Site & Shard Lifecycle Logic:** What defines when a shard is considered "scored"? How do we track target movement or changes?
- **UI/UX Scope:** What specific features does the "live view" need to provide to be considered a success?
- **Edge Cases & Mitigations:** What happens during intel outages, schedule changes, or plugin crashes?

---

## 6. Data Export Architecture

The plugin implements a **Strategy Pattern** for data exports to ensure flexibility and type safety.

### Exporter Framework:

- **`DataExporter`**: An orchestration class that handles the browser download process, filename generation (timestamped), and async error management.
- **`ExportStrategy<T>`**: An interface for defining different export formats.
- **Implementations**:
    - **`SiteRecordStrategy`**: Exports the raw, comprehensive `SiteRecord` for debugging and full-state archival.
    - **`SiteDiscoveryStrategy`**: Exports a curated `SiteDiscovery` object containing only pre-event portal locations and ornament IDs, optimized for the initial discovery phase of the Shard Map.

### Standard Compliance:

- All exports use the **Temporal API** for precise timestamping.
- Async retrieval is wrapped in strict `try/catch` blocks to prevent silent failures during batch processing.

---

_This document is a living artifact and will be updated as the architecture and scope of the plugin evolve._
