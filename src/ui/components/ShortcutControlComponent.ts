import type { ObserverHost } from "../hosts/ObserverHost.js";
import siteObserverIcon from "../../images/site-observer-icon.svg";

/**
 * Custom Leaflet control that provides a shortcut button to toggle the Site Observer view.
 * Uses lazy initialization to prevent "Class extends value undefined" errors on mobile.
 */
export class ShortcutControlComponent {
    private static readonly SIGNAL_ANIMATION_NAME = "site-signal-pulse";
    private static readonly SIGNAL_DURATION_MS = 5000;

    private controlInstance?: L.Control;
    private controlButton?: HTMLAnchorElement;
    private signalTimeout?: number;
    private signalStopListener?: (event: AnimationEvent) => void;

    constructor(private host: ObserverHost) {}

    private initControl() {
        // Extend L.Control only when L is guaranteed to exist.
        // We use arrow functions for onAdd/onRemove to preserve 'this' as the ShortcutControlComponent instance.
        const ShortcutLeafletControl = L.Control.extend({
            options: {
                position: "topleft",
            },
            onAdd: () => this.createControlElement(),
            onRemove: () => this.clearSignalState(),
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

        // Use the inlined vector icon for instant offline rendering
        button.innerHTML = `
            <div class="site-observer-icon-wrapper">
                <img src="${siteObserverIcon}" class="site-observer-icon" alt="Site Observer">
            </div>
        `;

        this.controlButton = button;

        L.DomEvent.on(button, "click", (event) => {
            L.DomEvent.stop(event);
            this.host.toggle();
        });

        return container;
    }

    private stopSignalAtIterationEnd() {
        const button = this.controlButton;
        if (!button?.classList.contains("has-data")) return;

        if (!button.isConnected) {
            button.classList.remove("has-data");
            return;
        }

        const activeAnimations = window
            .getComputedStyle(button)
            .animationName.split(",")
            .map((name) => name.trim());

        if (!activeAnimations.includes(ShortcutControlComponent.SIGNAL_ANIMATION_NAME)) {
            button.classList.remove("has-data");
            return;
        }

        const onAnimationIteration = (event: AnimationEvent) => {
            if (event.target !== button || event.animationName !== ShortcutControlComponent.SIGNAL_ANIMATION_NAME) {
                return;
            }
            this.clearPendingSignalStop();
            button.classList.remove("has-data");
        };

        this.signalStopListener = onAnimationIteration;
        button.addEventListener("animationiteration", onAnimationIteration);
    }

    private clearPendingSignalStop() {
        if (this.signalStopListener && this.controlButton) {
            this.controlButton.removeEventListener("animationiteration", this.signalStopListener);
        }
        this.signalStopListener = undefined;
    }

    private clearSignalState() {
        if (this.signalTimeout !== undefined) {
            window.clearTimeout(this.signalTimeout);
            this.signalTimeout = undefined;
        }
        this.clearPendingSignalStop();
        this.controlButton?.classList.remove("has-data");
        this.controlButton = undefined;
    }

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
     * Signals that new data has been observed by pulsing the shortcut button.
     * When the timeout expires mid-cycle, waits for the active animation iteration
     * to finish so the pulse stops cleanly at the end of its wave.
     */
    public signalDataUpdate() {
        if (!this.controlButton) return;

        if (this.signalTimeout !== undefined) {
            window.clearTimeout(this.signalTimeout);
        }
        this.clearPendingSignalStop();

        this.controlButton.classList.add("has-data");

        this.signalTimeout = window.setTimeout(() => {
            this.signalTimeout = undefined;
            this.stopSignalAtIterationEnd();
        }, ShortcutControlComponent.SIGNAL_DURATION_MS);
    }
}
