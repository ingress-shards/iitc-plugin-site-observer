import * as Plugin from "iitcpluginkit";
import { ShardsObserverUI } from "./ShardsObserverUi";
import { ConfigManager } from "./ConfigManager";

// This should be configured via your webpack config (e.g., DefinePlugin)
// It will default to a local server for development.
const BASE_URL: string = process.env.CONFIG_BASE_URL;

class Shards_Observer implements Plugin.Class {
    private ui: ShardsObserverUI;
    private configManager: ConfigManager;

    constructor() {
        this.configManager = new ConfigManager(BASE_URL);
        this.ui = new ShardsObserverUI(this.configManager);
    }

    init() {
        this.configManager.syncConfig().catch((error) => {
            console.error("Shards Observer: Failed to sync configuration", error);
        });

        IITC.toolbox.addButton({
            label: "Shards Observer",
            action: () => this.ui.show(),
        });
    }
}

/**
 * use "main" to access you main class from everywhere
 * (same as window.plugin.Shards_Observer)
 */
export const main = new Shards_Observer();
Plugin.Register(main, "Shards_Observer");
