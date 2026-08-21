import type { ObserverView } from "../ObserverView.js";
import type { ObserverHost } from "./ObserverHost.js";

interface IITCWindow {
    $?: JQueryStatic;
    jQuery?: JQueryStatic;
    android?: {
        addPane?: (id: string, label: string, icon: string) => void;
        switchToPane?: (id: string) => void;
    };
    addHook?: (event: string, callback: (pane: unknown) => void) => void;
}

/**
 * Mobile host for rendering the Site Observer within an IITC Mobile full-screen pane.
 */
export class PaneHost implements ObserverHost {
    constructor(private view: ObserverView) {}

    public show(): void {
        const win = window as unknown as IITCWindow;
        const jq = win.$ ?? win.jQuery;
        if (!jq) return;

        let $pane = jq("#site-observer");
        if ($pane.length === 0) {
            $pane = jq('<div id="site-observer" class="mobile-pane"></div>').appendTo("body");
        }

        $pane.removeClass("is-hidden").addClass("mobile-pane").show();
        this.view.mount($pane);
    }

    public hide(): void {
        this.view.unmount();
        const win = window as unknown as IITCWindow;
        const jq = win.$ ?? win.jQuery;
        if (!jq) return;

        jq("#site-observer").addClass("is-hidden").hide().remove();
    }

    public toggle(): void {
        if (this.isOpen()) {
            this.hide();
        } else {
            this.show();
        }
    }

    public isOpen(): boolean {
        const win = window as unknown as IITCWindow;
        const jq = win.$ ?? win.jQuery;
        if (!jq) return false;
        const $pane = jq("#site-observer");
        return $pane.length > 0 && $pane.is(":visible") && !$pane.hasClass("is-hidden");
    }
}
