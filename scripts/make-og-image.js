/**
 * Draws src/assets/og.png, the 1200x630 card every route unfurls with.
 *
 * It is rendered by the same browser the tests use, from the site's own
 * stylesheet, so the card is the site's colours and the site's type rather than
 * an approximation of them made in an image editor. Change a token and rerun
 * this: the card follows.
 *
 * The output is committed rather than generated during the build. A card is a
 * static asset that changes about once a year, and making every deploy depend
 * on a browser being installed would be a poor trade for that.
 *
 * It lives in src/assets rather than public so the asset pipeline gives it a
 * content-hashed filename: a changed card is a changed address, which is the
 * only thing that moves an image through HTTP caches that already hold the
 * old one. /og.png stays alive too - src/pages/og.png.ts serves these same
 * bytes at the old address, so links shared before the hashing do not 404.
 *
 * What is on it: the wordmark, the positioning line, and the address of the
 * site. No photograph, no stock art, and no real name — the same rule the rest
 * of the site keeps.
 *
 *   node scripts/make-og-image.js
 */
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findChrome } from './chrome.js';
import { OG_LEDE } from '../src/lib/og-card.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const WIDTH = 1200;
const HEIGHT = 630;
const PORT = 9444;

const tokens = readFileSync(join(ROOT, 'src/styles/global.css'), 'utf8');

// The positioning line. Imported, not copied: src/lib/og-card.js is the one
// home of this text, shared with the alt attributes in Base.astro, and it is
// what test/og-card.test.js compares the home lede and the committed PNG
// against. See the note in that file before changing it.
const LEDE = OG_LEDE;

/*
 * data-theme="dark" rather than a media query, so the card is dark whatever the
 * machine generating it prefers. The stylesheet is inlined whole: it is the
 * source of every colour, size and font below.
 */
const html = `<!doctype html>
<html lang="en" data-theme="dark">
  <head><meta charset="utf-8"><style>${tokens}</style><style>
    html, body { margin: 0; padding: 0; }
    body {
      width: ${WIDTH}px; height: ${HEIGHT}px;
      display: flex; flex-direction: column; justify-content: center;
      gap: var(--space-l);
      padding: var(--space-2xl);
      background: var(--bg);
      /* The card is one image; nothing in it needs to move or be clicked. */
      overflow: hidden;
    }
    .mark { display: flex; align-items: center; gap: var(--space-s); }
    .dot {
      width: var(--space-m); height: var(--space-m); border-radius: 50%;
      background: var(--accent);
      box-shadow: 0 0 0 var(--space-2xs) color-mix(in oklab, var(--accent) 22%, transparent);
    }
    .name {
      font-family: var(--font-system); font-weight: 660;
      font-size: calc(var(--text-3xl) * 1.6); letter-spacing: -0.03em;
      color: var(--text); line-height: 1;
    }
    .lede {
      font-family: var(--font-system); font-weight: 400;
      font-size: calc(var(--text-l) * 1.35); line-height: 1.45;
      /* Wider than the prose measure on the site: this is four lines read at a
         glance in a feed, not a page of body copy being read line after line. */
      color: var(--text-muted); max-width: 42ch; margin: 0;
    }
    .rule { height: 1px; background: var(--rule); }
    .foot {
      font-family: var(--font-mono); font-size: var(--text-l);
      color: var(--accent); margin: 0;
    }
  </style></head>
  <body>
    <div class="mark"><span class="dot"></span><span class="name">VelaWind</span></div>
    <p class="lede">${LEDE}</p>
    <div class="rule"></div>
    <p class="foot">velawind.dev</p>
  </body>
</html>`;

/* ------------------------------------------------------------- provenance --
 *
 * The line the card was drawn from is written into the PNG itself, as a
 * standard tEXt chunk with the registered "Description" keyword, so the
 * committed image carries the text it shows and test/og-card.test.js can fail
 * when that text is no longer the text in src/lib/og-card.js. A sidecar file
 * was considered and rejected: two committed files that must move together is
 * the same silent-divergence bug this exists to end.
 *
 * PNG chunks are length + type + data + CRC-32 over type-and-data, and the
 * new chunk goes immediately before IEND, which the spec requires to be last.
 * Hand-rolled because it is ~20 lines and a dependency would be the first one
 * in this repo.
 */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

function withDescription(png, text) {
  // tEXt data is keyword, a NUL, then Latin-1 text; the card line is ASCII.
  const data = Buffer.concat([Buffer.from('Description\0', 'latin1'), Buffer.from(text, 'latin1')]);
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  chunk.write('tEXt', 4, 'latin1');
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(chunk.subarray(4, 8 + data.length)), 8 + data.length);
  // IEND is always the final 12 bytes: zero length, type, CRC.
  const iend = png.length - 12;
  return Buffer.concat([png.subarray(0, iend), chunk, png.subarray(iend)]);
}

const profile = mkdtempSync(join(tmpdir(), 'velawind-og-'));
const pagePath = join(profile, 'card.html');
writeFileSync(pagePath, html);

const chrome = spawn(findChrome(), [
  '--headless=new',
  '--disable-gpu',
  '--no-first-run',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profile}`,
  'about:blank',
], { stdio: 'ignore' });

const clean = () => {
  try {
    if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(chrome.pid), '/T', '/F'], { stdio: 'ignore' });
    else chrome.kill('SIGKILL');
  } catch {}
  try { rmSync(profile, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }); } catch {}
};
process.on('exit', clean);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  let version;
  for (let i = 0; i < 80; i += 1) {
    try { version = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); break; } catch { await sleep(250); }
  }
  if (!version) throw new Error('headless Chrome did not come up');

  const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });

  let id = 0;
  const pending = new Map();
  ws.onmessage = (m) => {
    const frame = JSON.parse(m.data);
    if (frame.id && pending.has(frame.id)) { pending.get(frame.id)(frame.result); pending.delete(frame.id); }
  };
  const send = (method, params = {}) => new Promise((resolve) => {
    const n = ++id; pending.set(n, resolve);
    ws.send(JSON.stringify({ id: n, method, params }));
  });

  await send('Page.enable');
  /*
   * Rendered at twice the size and captured back down to it. The file has to be
   * exactly 1200x630, because that is what og:image:width and og:image:height
   * declare and a scraper is entitled to believe them; supersampling is just
   * how the type gets crisp at that size rather than merely correct.
   */
  await send('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: HEIGHT, deviceScaleFactor: 2, mobile: false });
  await send('Page.navigate', { url: `file:///${pagePath.replace(/\\/g, '/')}` });
  await sleep(1200);

  const shot = await send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: false,
    clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT, scale: 0.5 },
  });

  const out = join(ROOT, 'src/assets/og.png');
  const bytes = withDescription(Buffer.from(shot.data, 'base64'), LEDE);
  writeFileSync(out, bytes);
  ws.close();

  console.log(`wrote src/assets/og.png, ${Math.round(bytes.length / 1024)} KB`);
} finally {
  clean();
}
