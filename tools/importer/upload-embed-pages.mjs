/**
 * Upload /request-siding-quote and /find-a-contractor to DA.Live and trigger preview.
 *
 * Usage:
 *   node tools/importer/upload-embed-pages.mjs <TOKEN>
 *
 * TOKEN: DA.Live IMS bearer token from localStorage key `adobeid_ims_access_token`
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TOKEN = process.argv[2];
if (!TOKEN) {
  console.error('Usage: node upload-embed-pages.mjs <TOKEN>');
  process.exit(1);
}

const BASE_DA = 'https://admin.da.live/source/zermer/my-aem-boilerplate';
const BASE_PREVIEW = 'https://admin.hlx.page/preview/zermer/my-aem-boilerplate/main';

async function upload(daPath, localFile) {
  const html = readFileSync(join(__dirname, localFile), 'utf-8');
  const r = await fetch(`${BASE_DA}${daPath}.html`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'text/html; charset=utf-8',
      'x-da-force': 'true',
    },
    body: html,
  });
  console.log(`Upload ${daPath}: ${r.status} ${r.statusText}`);
  if (!r.ok) console.error(await r.text());
  return r.ok;
}

async function preview(previewPath) {
  const r = await fetch(`${BASE_PREVIEW}${previewPath}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  console.log(`Preview ${previewPath}: ${r.status} ${r.statusText}`);
}

console.log('Uploading embed pages...\n');

if (await upload('/request-siding-quote', 'request-siding-quote.html')) {
  await preview('/request-siding-quote');
}

if (await upload('/find-a-contractor', 'find-a-contractor.html')) {
  await preview('/find-a-contractor');
}

console.log('\nDone! Check:');
console.log('  https://main--my-aem-boilerplate--zermer.aem.page/request-siding-quote');
console.log('  https://main--my-aem-boilerplate--zermer.aem.page/find-a-contractor');
