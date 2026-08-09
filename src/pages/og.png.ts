/**
 * The card at its old address.
 *
 * The unfurl tags point at the content-hashed asset the pipeline emits, so a
 * new card gets a new URL and no cache can serve the old picture against it.
 * But /og.png was the address before the hashing, and links already shared
 * carry it; an address once published does not get to 404. This endpoint
 * serves the current card's bytes there — same committed file, provenance
 * chunk and all — emitted as a static dist/og.png at build time.
 *
 * The file is read with fs rather than imported, because importing an image
 * yields metadata (a URL and dimensions), not bytes. The path is resolved
 * from the working directory, which is the project root for every way this
 * site is built; the read throws and stops the build if the file is missing,
 * which is the correct failure for a published address with nothing behind it.
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { APIRoute } from 'astro';

export const GET: APIRoute = async () =>
  new Response(await readFile(resolve('src/assets/og.png')), {
    headers: { 'Content-Type': 'image/png' },
  });
