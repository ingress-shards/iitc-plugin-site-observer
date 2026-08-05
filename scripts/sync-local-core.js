import { existsSync, cpSync } from 'node:fs';
import { resolve } from 'node:path';

const corePath = resolve('../ingress-events-core');
const destPath = resolve('node_modules/@ingress-shards/ingress-events-core');

if (existsSync(corePath)) {
    console.log(`[Sync Core] Local core workspace found at: ${corePath}`);
    const coreDist = resolve(corePath, 'dist');
    const corePkg = resolve(corePath, 'package.json');
    
    if (existsSync(coreDist)) {
        // Copy the compiled build and package metadata directly into node_modules
        cpSync(coreDist, resolve(destPath, 'dist'), { recursive: true, force: true });
        cpSync(corePkg, resolve(destPath, 'package.json'), { force: true });
        console.log('[Sync Core] Successfully synced local core build.');
    } else {
        console.warn('[Sync Core] WARNING: Local core found but "dist/" does not exist. Run "yarn build" in ingress-events-core first.');
    }
} else {
    // Exits silently in CI / production environments
    console.log('[Sync Core] Local core workspace not found. Skipping local sync.');
}
