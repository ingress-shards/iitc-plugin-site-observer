import type { ObserverView } from "../ObserverView.js";
import type { ObserverHost } from "./ObserverHost.js";

interface DialogPosition {
    left: number;
    top: number;
}

interface DialogState {
    position?: DialogPosition;
}

interface SiteObserverWindow {
    $?: JQueryStatic;
    jQuery?: JQueryStatic;
    dialog?: (options: {
        title: string;
        html: string;
        id: string;
        width: number;
        resizable?: boolean;
    }) => JQuery;
}

/**
 * Desktop host for rendering the Site Observer within an IITC floating jQuery UI dialog.
 */
export class DialogHost implements ObserverHost {
    private state: DialogState = {
        position: { left: 60, top: 40 },
    };

    constructor(private view: ObserverView) {}

    public show(): void {
        const win = window as unknown as SiteObserverWindow;
        const jq = win.$ ?? win.jQuery;
        if (!jq) return;

        let $dialog = jq("#dialog-site-observer");
        if ($dialog.length > 0 && $dialog.is(":visible")) {
            return;
        }

        if (typeof win.dialog === "function") {
            $dialog = win.dialog({
                html: '<div id="site-observer-content"></div>',
                id: "site-observer",
                title: "Site Observer",
                width: 500,
                resizable: false,
            });

            if (this.state.position) {
                $dialog.parent().offset(this.state.position);
            }

            $dialog.on("dialogclose", () => {
                this.view.unmount();
            });

            $dialog.on("dialogdragstop", () => {
                const offset = $dialog.parent().offset();
                if (offset) {
                    this.state.position = {
                        left: offset.left,
                        top: offset.top,
                    };
                }
            });

            this.view.mount($dialog);
        }
    }

    public hide(): void {
        const win = window as unknown as SiteObserverWindow;
        const jq = win.$ ?? win.jQuery;
        if (!jq) return;

        const $dialog = jq("#dialog-site-observer");
        if ($dialog.length > 0 && $dialog.is(":visible")) {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-call
            ($dialog as any).dialog("close");
        }
    }

    public toggle(): void {
        if (this.isOpen()) {
            this.hide();
        } else {
            this.show();
        }
    }

    public isOpen(): boolean {
        const win = window as unknown as SiteObserverWindow;
        const jq = win.$ ?? win.jQuery;
        if (!jq) return false;
        const $dialog = jq("#dialog-site-observer");
        return $dialog.length > 0 && $dialog.is(":visible");
    }
}
