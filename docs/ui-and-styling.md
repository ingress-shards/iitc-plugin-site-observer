# UI and Styling Standards

## Mobile Compatibility (IITC Mobile)

### CSS Injection
To ensure that styles are correctly applied in the IITC Mobile app's WebView, do not use top-level `import "./style.css"` statements. Instead, move the style registration into the plugin's `init()` method using a side-effect `require()`.

**Pattern:**
```typescript
class MyPlugin implements Plugin.Class {
    init() {
        // Load styles manually in init to ensure mobile WebView readiness
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require("./ui/styles.css");
        
        // ... rest of initialization
    }
}
```

**Rationale:**
Top-level imports are processed immediately upon script execution. In the IITC Mobile environment, the `document.head` may not be fully ready or the injection might be clobbered by the app's internal UI initialization. Moving the `require` into `init()` ensures injection happens at a stable point in the IITC lifecycle.

## Design Tokens
The project uses CSS variables for theming, falling back to Ingress-compatible defaults.
- `--shards-signal-color`: The color used for the data update indicator dot.
- `--shards-border-color`: Primary border color for tables and dialogs.
