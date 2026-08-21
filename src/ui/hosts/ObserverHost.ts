/**
 * Common presentation host interface for displaying the Site Observer view
 * across different platform containers (desktop floating dialog, mobile pane, etc.).
 */
export interface ObserverHost {
    show(): void;
    hide(): void;
    toggle(): void;
    isOpen(): boolean;
}
