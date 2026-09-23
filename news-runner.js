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
const nodePath = process.execPath;
const ollamaHost = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';

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

async function run() {
    if (!existsSync(gatherScript)) throw new Error(`Gather script not found at ${gatherScript}`);

    const branch = (await git(['branch', '--show-current'])).stdout.trim();
    if (branch !== 'main') throw new Error(`Expected main branch, found ${branch || '(detached HEAD)'}`);

    const initialStatus = (await git(['status', '--porcelain'])).stdout.trim();
    if (initialStatus) throw new Error(`Refusing to run with a dirty checkout:\n${initialStatus}`);

    log('Updating checkout from origin/main');
    await git(['pull', '--ff-only', 'origin', 'main']);

    log(`Checking Ollama at ${ollamaHost}`);
    const response = await fetch(`${ollamaHost}/api/tags`, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error(`Ollama returned HTTP ${response.status}`);

    log('Gathering and scoring news');
    await runGatherNews();

    const changedFiles = (await git(['status', '--porcelain', '--untracked-files=no'])).stdout
        .split('\n').filter(Boolean);
    if (changedFiles.some(line => !line.endsWith('src/data.js'))) {
        throw new Error(`Unexpected modified files after gather:\n${changedFiles.join('\n')}`);
    }

    await git(['add', '--', 'src/data.js']);
    const staged = await git(['diff', '--cached', '--name-only']);
    if (!staged.stdout.trim()) {
        log('News data did not change; nothing to publish');
        return;
    }

    const identity = (await git(['config', '--local', 'user.name']).catch(() => ({ stdout: '' }))).stdout.trim();
    if (!identity) await git(['config', '--local', 'user.name', 'NewsBlocks Runner']);
    const email = (await git(['config', '--local', 'user.email']).catch(() => ({ stdout: '' }))).stdout.trim();
    if (!email) await git(['config', '--local', 'user.email', 'newsblocks-runner@users.noreply.github.com']);

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    await git(['commit', '-m', `chore: publish news data ${timestamp}`]);
    log('Pushing validated news data to GitHub');
    await git(['push', 'origin', 'main']);
    log('Update published; Cloudflare Pages will build the new release');
}

run().catch(error => {
    log(error.stack || error.message, 'ERROR');
    process.exitCode = 1;
});
