#!/usr/bin/env node

/**
 * NewsBlocks Runner - Local news gather scheduler
 *
 * Runs gather-news.js on a schedule, commits results to GitHub.
 * Designed to run as a LaunchAgent on a Mac Mini (always-on).
 *
 * Usage:
 *   node news-runner.js
 *
 * Environment:
 *   GITHUB_TOKEN    - Personal Access Token for git push
 *   AI_PROVIDER     - "ollama" (default, free), "gemini", "minimax"
 *   RUN_INTERVAL_H  - Hours between runs (default: 4)
 */

import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load .env file
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, '.env') });

const CONFIG = {
    // How often to run (in hours)
    runIntervalHours: parseInt(process.env.RUN_INTERVAL_H || '4'),

    // Git config
    githubToken: process.env.GITHUB_TOKEN,
    repoUrl: process.env.REPO_URL || 'https://github.com/prasadabhishek/newsblocks.git',

    // Ollama settings (for local AI)
    ollamaHost: process.env.OLLAMA_HOST || 'http://localhost:11434',

    // Paths
    gatherScript: join(__dirname, 'scripts', 'gather-news.js'),
};

let lastRun = null;
let isRunning = false;
let runCount = 0;

/**
 * Log with timestamp
 */
function log(msg, type = 'INFO') {
    const ts = new Date().toISOString();
    console.log(`[${ts}] [${type}] ${msg}`);
}

/**
 * Check if Ollama is running
 */
async function checkOllama() {
    try {
        const response = await fetch(`${CONFIG.ollamaHost}/api/tags`);
        return response.ok;
    } catch {
        return false;
    }
}

/**
 * Run gather-news.js
 */
function runGatherNews() {
    return new Promise((resolve, reject) => {
        log('Starting gather-news.js...');

        const child = spawn('node', [CONFIG.gatherScript], {
            stdio: 'pipe',
            env: {
                ...process.env,
                AI_PROVIDER: 'ollama', // Force Ollama for local runs
            },
        });

        let stdout = '';
        let stderr = '';

        child.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        child.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        child.on('close', (code) => {
            if (code === 0) {
                log('gather-news.js completed successfully');
                resolve();
            } else {
                log(`gather-news.js exited with code ${code}`, 'ERROR');
                if (stderr) log(stderr.substring(0, 500), 'ERROR');
                reject(new Error(`Exit code: ${code}`));
            }
        });

        child.on('error', (err) => {
            log(`Failed to start gather-news.js: ${err.message}`, 'ERROR');
            reject(err);
        });
    });
}

/**
 * Commit and push changes to GitHub
 */
async function commitAndPush() {
    log('Committing and pushing to GitHub...');

    return new Promise((resolve, reject) => {
        // Build remote URL with token if available
        const remoteUrl = CONFIG.githubToken
            ? `https://x-access-token:${CONFIG.githubToken}@github.com/prasadabhishek/newsblocks.git`
            : 'origin';

        const gitArgs = ['push', remoteUrl, 'main'];

        const git = spawn('git', gitArgs, {
            cwd: __dirname,
            env: {
                ...process.env,
                GIT_TERMINAL_PROMPT: '0',
            },
        });

        git.on('close', (code) => {
            if (code === 0) {
                log('Successfully pushed to GitHub');
                resolve();
            } else {
                log(`Git push failed with code ${code}`, 'ERROR');
                log('Tip: Ensure SSH keys are set up or GITHUB_TOKEN is in .env', 'INFO');
                reject(new Error(`Git push exit code: ${code}`));
            }
        });

        git.on('error', (err) => {
            log(`Git push failed: ${err.message}`, 'ERROR');
            reject(err);
        });
    });
}

/**
 * Setup git config (one-time)
 */
function setupGit() {
    return new Promise((resolve) => {
        const gitConfig = spawn('git', ['config', '--global', 'user.name', 'news-runner'], {
            stdio: 'ignore',
        });
        gitConfig.on('close', () => {
            const gitEmail = spawn('git', ['config', '--global', 'user.email', 'news-runner@localhost'], {
                stdio: 'ignore',
            });
            gitEmail.on('close', resolve);
        });
    });
}

/**
 * Main run loop
 */
async function runCycle() {
    if (isRunning) {
        log('Already running, skipping this cycle', 'WARN');
        return;
    }

    isRunning = true;
    runCount++;
    lastRun = new Date();

    log(`=== Starting cycle #${runCount} ===`);

    try {
        // Check Ollama first
        log(`Checking Ollama at ${CONFIG.ollamaHost}...`);
        const ollamaReady = await checkOllama();
        if (!ollamaReady) {
            throw new Error('Ollama is not running. Start it with: ollama serve');
        }
        log('Ollama is ready');

        // Run the gather script
        await runGatherNews();

        // Commit and push
        await commitAndPush();

        log(`=== Cycle #${runCount} complete ===`);
    } catch (err) {
        log(`Cycle #${runCount} failed: ${err.message}`, 'ERROR');
    } finally {
        isRunning = false;
    }
}

/**
 * Main entry point
 */
async function main() {
    console.log(`
╔══════════════════════════════════════════════╗
║          NewsBlocks Runner v1.0              ║
║   Local news gather scheduler for Mac Mini    ║
╚══════════════════════════════════════════════╝
`);

    log(`Run interval: every ${CONFIG.runIntervalHours} hour(s)`);
    log(`Ollama host: ${CONFIG.ollamaHost}`);
    log(`GitHub push: ${CONFIG.githubToken ? 'using GITHUB_TOKEN' : 'using SSH keys (or git credentials)'}`);

    // One-time git setup
    await setupGit();

    // Check if gather-news.js exists
    if (!existsSync(CONFIG.gatherScript)) {
        log(`gather-news.js not found at ${CONFIG.gatherScript}`, 'ERROR');
        process.exit(1);
    }

    // Initial run after 10 seconds
    log('Initial run in 10 seconds...');
    setTimeout(() => {
        runCycle();

        // Then schedule
        const intervalMs = CONFIG.runIntervalHours * 60 * 60 * 1000;
        log(`Scheduling next run in ${CONFIG.runIntervalHours} hours`);

        setInterval(runCycle, intervalMs);
    }, 10000);
}

main().catch((err) => {
    log(`Fatal error: ${err.message}`, 'ERROR');
    process.exit(1);
});
