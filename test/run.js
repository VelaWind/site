/**
 * The test harness: build, serve, launch a browser, run the suite, and take
 * everything down again.
 *
 * The teardown is the part worth reading. A run that fails and leaves a preview
 * server holding a port, or a headless Chrome holding a profile directory, is a
 * bug in this file and not an inconvenience: the next run then fails for a
 * reason that has nothing to do with the site. So the children are killed from
 * a `finally`, from the signal handlers, and from `process.on('exit')`, and on
 * Windows they are killed as a tree, because `npm.cmd` spawns node as a
 * grandchild and killing the parent would orphan it.
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findChrome } from '../scripts/chrome.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PREVIEW_PORT = 4380;
const CDP_PORT = 9333;
const BASE = `http://localhost:${PREVIEW_PORT}`;
const CDP = `http://127.0.0.1:${CDP_PORT}`;

const IS_WINDOWS = process.platform === 'win32';
const NPM = IS_WINDOWS ? 'npm.cmd' : 'npm';
/*
 * Node refuses to spawn a .cmd without a shell (EINVAL) since the argument
 * injection fix, and npm on Windows is a .cmd. Only npm needs this; Chrome is
 * a real executable and is spawned directly, which also keeps its arguments
 * out of a shell's hands.
 */
const NPM_OPTIONS = IS_WINDOWS ? { shell: true } : {};

const children = [];
let profileDir = null;
let cleanedUp = false;

function log(message) {
  process.stdout.write(`[test] ${message}\n`);
}

/**
 * Ask Chrome to exit rather than shooting it. A forced kill leaves file locks
 * inside the profile directory for long enough that removing it fails, and the
 * directories then pile up in the temp folder run after run.
 */
async function closeBrowser() {
  try {
    const version = await (await fetch(`${CDP}/json/version`)).json();
    const ws = new WebSocket(version.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
    ws.send(JSON.stringify({ id: 1, method: 'Browser.close' }));
    await new Promise((resolve) => { ws.onclose = resolve; setTimeout(resolve, 3000); });
  } catch {
    // Not running, or already gone. The kill below is the backstop.
  }
}

/**
 * Take down anything a previous run left holding our two ports.
 *
 * Ctrl-C and a failing test are handled by the exit hooks below, but a hard
 * kill of this process cannot be: no exit handler runs when the OS terminates
 * you. So rather than pretend otherwise, the next run cleans up after the last
 * one. Both ports are dedicated to this suite, and the browser is identified
 * before it is closed, so nothing else on the machine is at risk.
 */
async function sweepStalePorts() {
  await closeBrowser();

  try {
    const response = await fetch(BASE + '/', { signal: AbortSignal.timeout(1500) });
    if (!response.ok) return;
    log(`a preview server was already on ${PREVIEW_PORT}; taking it down`);
    if (IS_WINDOWS) {
      const netstat = spawnSync('netstat', ['-ano'], { encoding: 'utf8' }).stdout ?? '';
      for (const line of netstat.split('\n')) {
        if (!line.includes(`:${PREVIEW_PORT}`) || !line.includes('LISTENING')) continue;
        const pid = line.trim().split(/\s+/).pop();
        if (pid && pid !== '0') spawnSync('taskkill', ['/pid', pid, '/T', '/F'], { stdio: 'ignore' });
      }
    } else {
      const lsof = spawnSync('lsof', ['-ti', `tcp:${PREVIEW_PORT}`], { encoding: 'utf8' }).stdout ?? '';
      for (const pid of lsof.split('\n').filter(Boolean)) {
        try { process.kill(Number(pid), 'SIGKILL'); } catch {}
      }
    }
    await new Promise((r) => setTimeout(r, 500));
  } catch {
    // Nothing listening, which is the normal case.
  }
}

/** Anything a previous run could not remove, so they never accumulate. */
function sweepStaleProfiles() {
  const parent = tmpdir();
  for (const name of readdirSync(parent)) {
    if (!name.startsWith('velawind-test-')) continue;
    const path = join(parent, name);
    try {
      if (Date.now() - statSync(path).mtimeMs < 60_000) continue;
      rmSync(path, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    } catch {}
  }
}

function killTree(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  if (IS_WINDOWS) {
    // npm.cmd -> node -> astro: killing the .cmd would leave the rest running.
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    try { process.kill(-child.pid, 'SIGKILL'); } catch { try { child.kill('SIGKILL'); } catch {} }
  }
}

function cleanUp() {
  if (cleanedUp) return;
  cleanedUp = true;
  for (const child of children) killTree(child);
  if (profileDir) {
    // Chrome is still letting go of its profile when the kill returns, so the
    // first unlink loses a race with it. Synchronous retries, because this runs
    // from process.on('exit') where nothing can be awaited.
    try { rmSync(profileDir, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }); } catch {}
  }
}

process.on('exit', cleanUp);
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(signal, () => { cleanUp(); process.exit(130); });
}
process.on('uncaughtException', (error) => { cleanUp(); console.error(error); process.exit(1); });

function start(command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: ROOT,
    stdio: 'ignore',
    detached: !IS_WINDOWS,
    ...options,
  });
  children.push(child);
  return child;
}

async function waitFor(label, probe, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try { if (await probe()) return; } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`${label} did not come up within ${timeoutMs / 1000}s`);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: ROOT, stdio: 'inherit', ...options });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

async function main() {
  await sweepStalePorts();
  sweepStaleProfiles();

  log('building');
  const built = run(NPM, ['run', 'build'], NPM_OPTIONS);
  if (built !== 0) throw new Error(`build failed with exit code ${built}`);

  log(`serving the built output on ${BASE}`);
  start(NPM, ['run', 'preview', '--', '--port', String(PREVIEW_PORT)], NPM_OPTIONS);
  await waitFor('preview server', async () => (await fetch(BASE + '/')).ok);

  const chrome = findChrome();
  log(`launching ${chrome}`);
  profileDir = mkdtempSync(join(tmpdir(), 'velawind-test-'));
  start(chrome, [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${profileDir}`,
    'about:blank',
  ]);
  await waitFor('headless Chrome', async () => (await fetch(`${CDP}/json/version`)).ok);

  /*
   * An explicit, ordered list rather than a directory or a glob: `--test` reads
   * a bare directory as a module path and fails to resolve it. Serially,
   * because the files share one browser and a deterministic order makes a
   * failure reproducible rather than dependent on which finished first. Print
   * first, because it guards the one defect that was invisible in every other
   * check, so it should be the first thing to go red.
   */
  const files = readdirSync(join(ROOT, 'test')).filter((f) => f.endsWith('.test.js')).sort();
  const rest = files.filter((f) => f !== 'print.test.js').map((f) => join('test', f));
  const env = { ...process.env, TEST_BASE_URL: BASE, TEST_CDP_URL: CDP };
  const options = ['--test', '--test-concurrency=1'];

  /*
   * Two invocations rather than one list, because `node --test` sorts the files
   * it is handed and print would otherwise run fourth. It runs on its own and
   * first: it guards the one defect that was invisible in every other check, so
   * it should be the first thing to go red and it should not wait behind three
   * minutes of other work to do it.
   */
  log(`running the suite: ${files.length} files, print first\n`);
  const printStatus = run(process.execPath, [...options, join('test', 'print.test.js')], { env });
  const restStatus = run(process.execPath, [...options, ...rest], { env });
  // Let the browser shut itself down before the kill, so its profile unlocks.
  await closeBrowser();
  return printStatus || restStatus;
}

try {
  const status = await main();
  cleanUp();
  process.exit(status);
} catch (error) {
  cleanUp();
  console.error(`\n[test] ${error.message}`);
  process.exit(1);
}
