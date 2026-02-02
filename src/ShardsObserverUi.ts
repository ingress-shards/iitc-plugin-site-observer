import "./styles.css";
import { Temporal } from "temporal-polyfill";
import { SeriesGeocodeSite, VersionConfig } from "@ingress-shards/shards-core";
import { ConfigManager } from "./ConfigManager";

/**
 * Manages the UI layer for the Shards Observer.
 */
export class ShardsObserverUI {
    constructor(private configManager: ConfigManager) {}

    /**
     * Constructs the HTML content for the dialog.
     */
    private getTemplate(applicableSites: SeriesGeocodeSite[], versionConfig?: VersionConfig): string {
        const configText = versionConfig ? `Config: v${versionConfig.version}` : "Config not found";

        return `
            <section>
                <main>
                    ${
                        applicableSites.length > 0
                            ? `Select Observation Site: <select id="site-select">
                                ${applicableSites
                                    .map((site) => `<option value="${site.id}">${site.location}</option>`)
                                    .join("")}
                            </select>
                            <input type="button" id="submit-site-select" value="Select" />`
                            : "<p>No current or recent shard sites found.</p>"
                    }
                </main>
                <footer>
                    Plugin version: ${VERSION}<br />
                    <div class="config-version">${configText}</div>
                </footer>
            </section>
        `;
    }

    public async show(): Promise<void> {
        const [versionConfig, seriesMetadataConfig, seriesGeocodeConfig] = await Promise.all([
            this.configManager.getVersion(),
            this.configManager.getMetadata(),
            this.configManager.getGeocode(),
        ]);

        if (versionConfig) {
            console.log(`Shards Observer: Loading UI with Config v${versionConfig.version}`);
        }

        const applicableSites: SeriesGeocodeSite[] = [];
        if (seriesMetadataConfig && seriesGeocodeConfig) {
            const now = Temporal.Now.zonedDateTimeISO();

            for (const sm of seriesMetadataConfig.series) {
                const geocode = seriesGeocodeConfig[sm.id];
                if (geocode?.sites) {
                    applicableSites.push(
                        ...geocode.sites.filter((site: SeriesGeocodeSite) => {
                            const siteDate = Temporal.ZonedDateTime.from(site.date).withTimeZone(now.timeZoneId);
                            const diff = now.since(siteDate, { largestUnit: "days" });
                            return Temporal.ZonedDateTime.compare(siteDate, now) >= 0 || Math.abs(diff.days) <= 5;
                        }),
                    );
                }
            }
        }

        const html = this.getTemplate(applicableSites, versionConfig);

        const win = window as Window & {
            dialog: (options: { title: string; html: string; id: string }) => JQuery;
            map: L.Map;
        };
        const dialog = win.dialog({
            title: "Shards Observer",
            html: html,
            id: "shards-observer",
        });

        dialog.find("#submit-site-select").on("click", () => {
            const selectedId = dialog.find("#site-select").val() as string;
            const selectedSite = applicableSites.find((site) => site.id === selectedId);
            if (selectedSite) {
                win.map.setView([selectedSite.lat, selectedSite.lng], 15);
                dialog.dialog("close");
            }
        });
    }
}
