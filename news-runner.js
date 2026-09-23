#!/usr/bin/env node

/** One scheduled NewsBlocks update. launchd is responsible for the interval. */
import { spawn, execFile as execFileCallback } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';

const execFile = promisify(execFileCallback);
const repoDir = dirname(fileURLToPath(import.meta.url));
const gatherScript = join(repoDir, 'scripts', 'gather-news.js');
const validateScript = join(repoDir, 'scripts', 'validate-data.js');
const nodePath = process.execPath;
const ollamaHost = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

function log(message, type = 'INFO') {
    console.log(`[${new Date().toISOString()}] [${type}] ${message}`);
}

async function git(args) {
    return execFile('git', args, {
        cwd: repoDir,
        env: {
            ...process.env,
            GIT_TERMINAL_PROMPT: '0',
            GIT_SSH_COMMAND: process.env.GIT_SSH_COMMAND || 'ssh -i /Users/abhishekprasad/.ssh/newsblocks_runner -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new'
        }
    });
}

async function runGatherNews() {
    await new Promise((resolve, reject) => {
        const child = spawn(nodePath, [gatherScript], {
            cwd: repoDir,
            stdio: 'inherit',
            env: { ...process.env, AI_PROVIDER: 'ollama', OLLAMA_HOST: ollamaHost }
        });
        child.once('error', reject);
        child.once('close', code => code === 0 ? resolve() : reject(new Error(`gather-news.js exited with code ${code}`)));
    });
}

async function validateDataset() {
    await execFile(nodePath, [validateScript], { cwd: repoDir, env: process.env });
}

async function changedTrackedPaths() {
    const status = (await git(['status', '--porcelain', '--untracked-files=no'])).stdout;
    return status.split('\n').filter(Boolean).map(line => line.slice(3));
}

async function commitDataset(message) {
    await validateDataset();
    await git(['add', '--', 'src/data.js']);
    const staged = (await git(['diff', '--cached', '--name-only'])).stdout
        .split('\n').filter(Boolean);
    if (staged.some(file => file !== 'src/data.js')) {
        throw new Error(`Refusing to publish unexpected staged files:\n${staged.join('\n')}`);
    }
    if (staged.length === 0) return false;

    const identity = (await git(['config', '--local', 'user.name']).catch(() => ({ stdout: '' }))).stdout.trim();
    if (!identity) await git(['config', '--local', 'user.name', 'NewsBlocks Runner']);
    const email = (await git(['config', '--local', 'user.email']).catch(() => ({ stdout: '' }))).stdout.trim();
    if (!email) await git(['config', '--local', 'user.email', 'newsblocks-runner@users.noreply.github.com']);

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    await git(['commit', '-m', `${message} ${timestamp}`]);
    return true;
}

async function syncWithOrigin() {
    await git(['fetch', 'origin', 'main']);
    const { stdout: countsOutput } = await git(['rev-list', '--left-right', '--count', 'HEAD...origin/main']);
    const [ahead, behind] = countsOutput.trim().split(/\s+/).map(Number);
    if (!behind) return;
    if (!ahead) {
        await git(['merge', '--ff-only', 'origin/main']);
        return;
    }

    const localFiles = (await git(['diff', '--name-only', 'origin/main...HEAD'])).stdout
        .split('\n').filter(Boolean);
    const remoteFiles = (await git(['diff', '--name-only', 'HEAD...origin/main'])).stdout
        .split('\n').filter(Boolean);
    const sharedFiles = localFiles.filter(file => remoteFiles.includes(file));

    if (sharedFiles.includes('src/data.js')) {
        const { stdout: localTime } = await git(['log', '-1', '--format=%ct', 'HEAD', '--', 'src/data.js']);
        const { stdout: remoteTime } = await git(['log', '-1', '--format=%ct', 'origin/main', '--', 'src/data.js']);
        const strategy = Number(remoteTime) > Number(localTime) ? 'theirs' : 'ours';
        log(`Concurrent data publication detected; retaining the ${strategy === 'theirs' ? 'newer remote' : 'newer local'} validated dataset`, 'WARN');
        await git(['merge', '--no-edit', '--strategy-option', strategy, 'origin/main']);
        return;
    }

    log('Remote main advanced during the run; rebasing the local-only changes');
    await git(['rebase', 'origin/main']);
}

async function pushWithRecovery() {
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            await git(['push', 'origin', 'main']);
            log('Update published; Cloudflare Pages will build the new release');
            return;
        } catch (error) {
            log(`Git push attempt ${attempt}/3 failed: ${error.stderr?.trim() || error.message}`, 'WARN');
            if (attempt === 3) throw error;

            await delay(5000 * attempt);
            await syncWithOrigin();
        }
    }
}

async function run() {
    if (!existsSync(gatherScript) || !existsSync(validateScript)) {
        throw new Error(`Gather or validation script is missing from ${repoDir}`);
    }

    const branch = (await git(['branch', '--show-current'])).stdout.trim();
    if (branch !== 'main') throw new Error(`Expected main branch, found ${branch || '(detached HEAD)'}`);

    const dirtyPaths = await changedTrackedPaths();
    if (dirtyPaths.length > 0) {
        if (dirtyPaths.some(file => file !== 'src/data.js')) {
            throw new Error(`Refusing to run with unexpected checkout changes:\n${dirtyPaths.join('\n')}`);
        }

        // gather-news writes data atomically. If the process was interrupted after
        // rename but before commit, validate and resume publishing that exact dataset.
        log('Recovering an interrupted data publication');
        if (await commitDataset('chore: recover validated news data')) {
            await pushWithRecovery();
        }
    }

    log('Updating checkout from origin/main');
    await syncWithOrigin();

    log(`Checking Ollama at ${ollamaHost}`);
    const response = await fetch(`${ollamaHost}/api/tags`, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error(`Ollama returned HTTP ${response.status}`);

    log('Gathering and scoring news');
    await runGatherNews();

    await validateDataset();
    const changedFiles = await changedTrackedPaths();
    if (changedFiles.some(line => !line.endsWith('src/data.js'))) {
        throw new Error(`Unexpected modified files after gather:\n${changedFiles.join('\n')}`);
    }

    if (!await commitDataset('chore: publish news data')) {
        log('News data did not change; nothing to publish');
        return;
    }

    log('Pushing validated news data to GitHub');
    await pushWithRecovery();
}

run().catch(error => {
    log(error.stack || error.message, 'ERROR');
    process.exitCode = 1;
});
