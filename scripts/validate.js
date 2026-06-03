import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const SECRETS_FILE = '.secrets';
const TMP_TOKEN_FILE = '.tmp_token';

// Extract token from secrets
let githubToken = null;
if (existsSync(SECRETS_FILE)) {
    const match = readFileSync(SECRETS_FILE, 'utf-8').match(/^GITHUB_TOKEN=(.*)$/m);
    if (match) githubToken = match[1].trim();
}
if (!githubToken) {
    githubToken = process.env.GITHUB_TOKEN;
}

if (!githubToken) {
    console.error('ERROR: GITHUB_TOKEN not found in environment or .secrets file.');
    process.exit(1);
}

// Write to temp file for Docker build secret mounting
writeFileSync(TMP_TOKEN_FILE, githubToken.replace(/\r/g, ''));

try {
    console.log('--- Step 1: Building Docker Validation Image ---');
    if (spawnSync('docker', ['build', '--secret', `id=github_token,src=${TMP_TOKEN_FILE}`, '-f', 'Dockerfile.validate', '-t', 'iitc-plugin-site-observer-validate', '.'], { stdio: 'inherit', shell: true }).status !== 0) process.exit(1);

    console.log('\n--- Step 2: Running Validation suite ---');
    if (spawnSync('docker', ['run', '--rm', 'iitc-plugin-site-observer-validate'], { stdio: 'inherit', shell: true }).status !== 0) process.exit(1);

    console.log('\n--- SUCCESS: Validation passed ---');
} finally {
    if (existsSync(TMP_TOKEN_FILE)) unlinkSync(TMP_TOKEN_FILE);
}
