# iitc-plugin-site-observer

IITC userscript plugin observing and recording site data for Ingress Events (`@ingress-shards/iitc-plugin-site-observer`).

## Stack & Commands
- **Stack:** TypeScript + Webpack + Yarn 4 (`corepack yarn`). **Never** use `npm`.
- **Validate:** `yarn validate` (clean, typecheck, lint, vitest, dev + prod Webpack builds).

## Repo Conventions
- **Typing:** Strict TypeScript; avoid `any`.
- **Dates & time:** Use `temporal-polyfill/fns` functional imports (tree-shakeable); avoid native `Date`.
- **Naming:** `kebab-case` folders, `PascalCase` source files under `src/`, `index.ts` for barrels.
- **Releases:** `semantic-release` on `main` cuts releases from git tags; keep `package.json` version at `0.0.0-semantically-released`.
- **Dependencies:** Consumes `@ingress-shards/ingress-events-core` via strict SemVer from GitHub Packages (never `portal:` or local links).
- **Shared AI Kit (optional):** Organization-wide rules, skills, and command guardrails live in `https://github.com/ingress-shards/ingress-events-ai-kit` (see its README for Antigravity and Claude Code setup).
