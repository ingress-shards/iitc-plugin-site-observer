import { ObserverDialog } from "./ObserverDialog";

/**
 * Custom Leaflet control that provides a shortcut to the Site Observer dialog.
 * Uses lazy initialization to prevent "Class extends value undefined" errors on mobile.
 */
export class ShortcutControl {
    private controlInstance?: L.Control;
    private signalDot?: HTMLElement;

    constructor(private dialog: ObserverDialog) {}

    /**
     * Lazily creates the control and adds it to the map.
     */
    public addTo(map: L.Map) {
        if (!this.controlInstance) {
            this.initControl();
        }
        this.controlInstance!.addTo(map);
    }

    /**
     * Signals that new data has been observed by pulsing the signal dot.
     */
    public signalDataUpdate() {
        if (!this.signalDot) return;

        this.signalDot.classList.add("has-data");

        window.setTimeout(() => {
            this.signalDot?.classList.remove("has-data");
        }, 5000);
    }

    private initControl() {
        // Extend L.Control only when L is guaranteed to exist.
        // We use an arrow function for onAdd to preserve 'this' as the ShortcutControl instance.
        const ShortcutLeafletControl = L.Control.extend({
            options: {
                position: "topleft",
            },
            onAdd: () => this.createControlElement(),
        });

        const ControlClass = ShortcutLeafletControl as unknown as new () => L.Control;
        this.controlInstance = new ControlClass();
    }

    private createControlElement(): HTMLElement {
        const container = L.DomUtil.create("div", "leaflet-bar leaflet-control site-observer-map-control");
        const button = L.DomUtil.create("a", "leaflet-bar-part", container) as HTMLAnchorElement;
        button.href = "#";
        button.title = "Site Observer";
        button.setAttribute("role", "button");

        // Use the icon from plugin.json (shared via DefinePlugin)
        button.innerHTML = `
            <div class="site-observer-icon-wrapper">
                <img src="${process.env.PLUGIN_ICON}" class="site-observer-icon" alt="Site Observer">
                <div class="site-observer-signal-dot"></div>
            </div>
        `;

        this.signalDot = button.querySelector(".site-observer-signal-dot")!;

        L.DomEvent.on(button, "click", L.DomEvent.stop).on(button, "click", () => {
            this.dialog.show();
        });

        return container;
    }
}
