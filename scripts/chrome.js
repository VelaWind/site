/**
 * Finding the browser, in one place.
 *
 * Both the test runner and the Open Graph image generator need a headless
 * Chrome, and a second copy of this list is a second thing to forget when a
 * path changes. Chrome is a browser rather than a package: npm cannot install
 * it, so it is looked for where it usually lives and its absence is a sentence
 * somebody can act on.
 */
import { existsSync } from 'node:fs';

export function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter(Boolean);

  const found = candidates.find((path) => existsSync(path));
  if (!found) {
    throw new Error(
      'no Chrome found. This needs a real browser, so one has to be installed.\n' +
        'Set CHROME_PATH to its executable, or install Chrome or Chromium.',
    );
  }
  return found;
}
