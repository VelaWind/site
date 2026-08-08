/**
 * A Chrome DevTools Protocol client with no dependencies, and the small set of
 * helpers the suite needs on top of it.
 *
 * Node has had a global WebSocket and a global fetch since 22, and CDP is a
 * JSON protocol over one socket, so driving a real browser needs nothing
 * installed. That is the whole reason this file exists rather than a
 * dependency: the tests assert things about a page as a browser actually lays
 * it out, and paying for that in node_modules would have been a worse trade.
 *
 * Every test file opens its own tab and closes it again, so the files cannot
 * interfere through emulation overrides left set by whichever ran first.
 */
import assert from 'node:assert/strict';

export const BASE = process.env.TEST_BASE_URL ?? 'http://localhost:4380';
const CDP = process.env.TEST_CDP_URL ?? 'http://127.0.0.1:9333';

export const PAGES = ['/', '/projects', '/projects/lodestar', '/projects/vela-sea'];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Open a fresh tab and return a driver for it. */
export async function openPage() {
  const target = await (await fetch(`${CDP}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = () => reject(new Error('could not open a CDP socket'));
  });

  let id = 0;
  let closed = false;
  const pending = new Map();
  const consoleLogs = [];
  ws.onmessage = (message) => {
    const frame = JSON.parse(message.data);
    if (frame.id && pending.has(frame.id)) {
      const { resolve, reject } = pending.get(frame.id);
      pending.delete(frame.id);
      frame.error ? reject(new Error(frame.error.message)) : resolve(frame.result);
    } else if (frame.method === 'Runtime.consoleAPICalled') {
      consoleLogs.push(frame.params);
    }
  };

  /*
   * A command that never gets an answer must fail, not hang. A socket closed
   * under an in-flight command, or a command the browser silently ignores,
   * would otherwise stall the whole file until the runner's own timeout, and a
   * suite that hangs tells you nothing about what broke.
   */
  ws.onclose = () => {
    closed = true;
    for (const { reject } of pending.values()) reject(new Error('the CDP socket closed with a command in flight'));
    pending.clear();
  };

  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      if (closed) { reject(new Error(`${method} was sent after the page was closed`)); return; }
      const n = ++id;
      const timer = setTimeout(() => {
        pending.delete(n);
        reject(new Error(`${method} got no answer within 30s`));
      }, 30_000);
      pending.set(n, {
        resolve: (value) => { clearTimeout(timer); resolve(value); },
        reject: (error) => { clearTimeout(timer); reject(error); },
      });
      ws.send(JSON.stringify({ id: n, method, params }));
    });

  await send('Page.enable');
  await send('Runtime.enable');

  const page = {
    send,
    consoleLogs,

    /** Evaluate an expression in the page and return its value. */
    async evaluate(expression) {
      const result = await send('Runtime.evaluate', {
        expression,
        returnByValue: true,
        awaitPromise: true,
      });
      if (result.exceptionDetails) {
        throw new Error(`page threw: ${result.exceptionDetails.exception?.description ?? result.exceptionDetails.text}`);
      }
      return result.result.value;
    },

    /** Evaluate an expression that returns JSON, and parse it. */
    async json(expression) {
      return JSON.parse(await page.evaluate(`JSON.stringify(${expression})`));
    },

    /**
     * Set the conditions a test is about. Everything is explicit: a test that
     * does not say which colour scheme it wants is a test that passes or fails
     * depending on which file ran before it.
     */
    async emulate({ scheme = 'dark', motion = 'no-preference', media = '', width = 1280, height = 900, touch = false } = {}) {
      await send('Emulation.setEmulatedMedia', {
        media,
        features: [
          { name: 'prefers-color-scheme', value: scheme },
          { name: 'prefers-reduced-motion', value: motion === 'reduce' ? 'reduce' : '' },
        ],
      });
      await send('Emulation.setDeviceMetricsOverride', {
        width,
        height,
        deviceScaleFactor: 1,
        mobile: touch,
      });
      // maxTouchPoints must be 1..16 when it is sent at all, so it is omitted
      // rather than set to zero when touch is off. Passing 0 makes the call
      // throw, which took most of the suite down with it the first time.
      await send('Emulation.setTouchEmulationEnabled', touch ? { enabled: true, maxTouchPoints: 5 } : { enabled: false });
    },

    async setScripts(enabled) {
      await send('Emulation.setScriptExecutionDisabled', { value: !enabled });
    },

    /** Navigate and wait for the page's own scripts to have run. */
    async goto(path, settle = 1100) {
      consoleLogs.length = 0;
      await send('Page.navigate', { url: BASE + path });
      await sleep(settle);
    },

    async key(key, { code, modifiers = 0, text } = {}) {
      const base = {
        key,
        code: code ?? (key.length === 1 ? `Key${key.toUpperCase()}` : key),
        windowsVirtualKeyCode: VK[key] ?? 0,
        modifiers,
      };
      await send('Input.dispatchKeyEvent', { type: 'keyDown', ...base, text });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
      await sleep(70);
    },

    /*
     * Activate a control the way a keyboard does. This is not the same as key():
     * Chrome only runs a button's default action when the key event carries a
     * char, so a bare keyDown/keyUp pair moves focus rings around but never
     * presses anything, which is a silent way for a keyboard test to pass.
     */
    async press(key) {
      const vk = VK[key] ?? 0;
      // Enter's character is a carriage return; anything else presses itself.
      const text = key === 'Enter' ? String.fromCharCode(13) : key;
      await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key, code: key, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
      await send('Input.dispatchKeyEvent', { type: 'char', key, text, unmodifiedText: text });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code: key, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
      await sleep(200);
    },

    async type(text) {
      for (const char of text) await page.key(char, { text: char });
    },

    async tab({ shift = false } = {}) {
      await page.key('Tab', { code: 'Tab', modifiers: shift ? 8 : 0 });
    },

    async clickSelector(selector, times = 1, gap = 90) {
      const box = await page.json(`(() => { const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return null; const r = el.getBoundingClientRect();
        return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; })()`);
      assert.ok(box, `clickSelector: no element matched ${selector}`);
      for (let i = 0; i < times; i += 1) {
        for (const type of ['mousePressed', 'mouseReleased']) {
          await send('Input.dispatchMouseEvent', { type, x: box.x, y: box.y, button: 'left', clickCount: 1 });
        }
        await sleep(gap);
      }
      return box;
    },

    /**
     * Reset where sequential focus navigation starts. blur() alone does not do
     * it, so a second tab walk resumes mid-list and appears to have lost the
     * first stop. Clicking empty background resets it properly.
     */
    async resetFocus() {
      await page.evaluate('scrollTo(0, 0); document.activeElement?.blur();');
      for (const type of ['mousePressed', 'mouseReleased']) {
        await send('Input.dispatchMouseEvent', { type, x: 2, y: 2, button: 'left', clickCount: 1 });
      }
      await sleep(120);
    },

    async screenshotHash() {
      const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      const { createHash } = await import('node:crypto');
      return createHash('sha1').update(shot.data).digest('hex');
    },

    sleep,

    async close() {
      closed = true;
      try { ws.close(); } catch {}
      try { await fetch(`${CDP}/json/close/${target.id}`); } catch {}
    },
  };

  return page;
}

const VK = { Tab: 9, Enter: 13, Escape: 27, ' ': 32, ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40 };

/* ------------------------------------------------------------- assertions --
 *
 * Every failure has to name the threshold it was defending and the number that
 * missed it. A test that says "expected true, got false" sends whoever reads it
 * back to the source to find out what was even being measured.
 */

export function atLeast(measured, threshold, subject, unit = '') {
  assert.ok(
    measured >= threshold,
    `expected at least ${threshold}${unit}, measured ${measured}${unit} for ${subject}`,
  );
}

export function atMost(measured, threshold, subject, unit = '') {
  assert.ok(
    measured <= threshold,
    `expected at most ${threshold}${unit}, measured ${measured}${unit} for ${subject}`,
  );
}

export function exactly(measured, expected, subject) {
  assert.ok(
    measured === expected,
    `expected ${JSON.stringify(expected)}, measured ${JSON.stringify(measured)} for ${subject}`,
  );
}

export function noneOf(list, subject, describe = (x) => String(x)) {
  assert.ok(
    list.length === 0,
    `expected none, found ${list.length} for ${subject}:\n    ${list.map(describe).join('\n    ')}`,
  );
}

/* ------------------------------------------------ colour, inside the page --
 *
 * Colours are rasterised by the browser rather than parsed here, because the
 * stylesheet is oklch and color-mix: what a test needs to know is the pixel
 * that gets painted, not the string that was authored.
 */
export const COLOUR_HELPERS = `
  const __c = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  const px = (value) => { __c.fillStyle = '#000'; __c.fillRect(0, 0, 1, 1);
    __c.fillStyle = value; __c.fillRect(0, 0, 1, 1);
    const d = __c.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2]]; };
  const hex = (rgb) => '#' + rgb.map((v) => v.toString(16).padStart(2, '0')).join('');
  const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const lum = (rgb) => 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
  const ratio = (a, b) => { const hi = Math.max(lum(a), lum(b)), lo = Math.min(lum(a), lum(b));
    return (hi + 0.05) / (lo + 0.05); };
  const bgOf = (el) => { let n = el; while (n && n !== document.documentElement) {
      const c = getComputedStyle(n).backgroundColor;
      if (c && c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent') return c;
      n = n.parentElement; }
    return getComputedStyle(document.body).backgroundColor; };
`;
