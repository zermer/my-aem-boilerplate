/**
 * Upload transformed HTML files to DA.Live and trigger AEM preview.
 *
 * Usage:
 *   node tools/importer/upload-to-da.mjs <token> [input-dir] [--preview]
 *
 * Arguments:
 *   token      IMS Bearer token (from da.live localStorage key adobeid_ims_access_token)
 *   input-dir  Directory of HTML files to upload (default: tools/importer/output-blocks)
 *   --preview  Also trigger AEM preview after each upload (default: true)
 *   --no-preview  Skip preview trigger
 *
 * The file name encodes the page path using '--' as a path separator:
 *   why-james-hardie.html          → /why-james-hardie
 *   blog--siding-types.html        → /blog/siding-types
 *   product-catalog--hardiesoffit.html → /product-catalog/hardiesoffit
 *   index.html                     → /
 */

import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const ORG = 'zermer';
const REPO = 'my-aem-boilerplate';
const BRANCH = 'main';

const DA_SOURCE = `https://admin.da.live/source/${ORG}/${REPO}`;
const AEM_PREVIEW = `https://admin.hlx.page/preview/${ORG}/${REPO}/${BRANCH}`;

const args = process.argv.slice(2);
const token = args.find((a) => !a.startsWith('--') && !a.includes('/') && !a.includes('\\') && a.length > 20);
const inputDir = args.find((a) => (a.includes('/') || a.includes('\\')) && !a.startsWith('--'))
  || join(__dirname, 'output-blocks');
const skipPreview = args.includes('--no-preview');

if (!token) {
  console.error('\nUsage: node tools/importer/upload-to-da.mjs <IMS_TOKEN> [input-dir] [--no-preview]');
  console.error('\nGet your token from da.live:');
  console.error('  1. Open https://da.live in your browser');
  console.error('  2. Open DevTools → Application → Local Storage → https://da.live');
  console.error('  3. Copy the value of adobeid_ims_access_token\n');
  process.exit(1);
}

/** Convert filename back to URL path: blog--siding-types.html → /blog/siding-types */
function fileToPath(filename) {
  const slug = filename.replace(/\.html$/, '');
  if (slug === 'index') return '/';
  return '/' + slug.replace(/--/g, '/');
}

async function uploadFile(filePath, daPath, retries = 3) {
  const content = readFileSync(filePath, 'utf-8');
  const url = `${DA_SOURCE}${daPath}.html`;

  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'text/html; charset=utf-8',
        },
        body: content,
      });
      if (res.status === 200 || res.status === 201) return { ok: true, status: res.status };
      if (res.status === 409) return { ok: false, status: 409, msg: 'conflict' };
      if (res.status === 401) return { ok: false, status: 401, msg: 'unauthorized — token expired?' };
      const text = await res.text().catch(() => '');
      return { ok: false, status: res.status, msg: text.slice(0, 120) };
    } catch (err) {
      if (i === retries - 1) return { ok: false, status: 0, msg: err.message };
      await new Promise((r) => setTimeout(r, 1200 * (i + 1)));
    }
  }
}

async function triggerPreview(daPath) {
  try {
    const res = await fetch(`${AEM_PREVIEW}${daPath}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.ok;
  } catch {
    return false;
  }
}

const files = readdirSync(inputDir).filter((f) => f.endsWith('.html'));
console.log(`\nUploading ${files.length} files from ${inputDir}`);
console.log(`Target: ${DA_SOURCE}\n`);

let uploaded = 0;
let failed = 0;
let skipped = 0;
const failures = [];

for (const file of files) {
  const daPath = fileToPath(file);
  const filePath = join(inputDir, file);

  process.stdout.write(`  ${daPath.padEnd(60)} `);

  const result = await uploadFile(filePath, daPath);

  if (result.ok) {
    uploaded++;
    if (!skipPreview) {
      const previewOk = await triggerPreview(daPath);
      console.log(previewOk ? '✓ uploaded + previewed' : '✓ uploaded (preview pending)');
    } else {
      console.log('✓ uploaded');
    }
  } else if (result.status === 409) {
    skipped++;
    process.stdout.write('⚠ 409 conflict — retrying with force... ');
    // On conflict, fetch the current etag and retry
    const retryRes = await fetch(`${DA_SOURCE}${daPath}.html`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'text/html; charset=utf-8',
        'x-da-force': 'true',
      },
      body: readFileSync(filePath, 'utf-8'),
    });
    if (retryRes.ok) {
      uploaded++;
      skipped--;
      if (!skipPreview) await triggerPreview(daPath);
      console.log('✓ forced');
    } else {
      console.log(`✗ still failed (${retryRes.status})`);
      failed++;
      failures.push({ path: daPath, status: retryRes.status });
    }
  } else {
    failed++;
    console.log(`✗ ${result.status} ${result.msg || ''}`);
    failures.push({ path: daPath, status: result.status, msg: result.msg });
    if (result.status === 401) {
      console.error('\n  Token expired or invalid. Stopping.\n');
      break;
    }
  }

  // Polite rate limit
  await new Promise((r) => setTimeout(r, 300));
}

console.log(`\n${'─'.repeat(60)}`);
console.log(`Uploaded: ${uploaded}  Failed: ${failed}  Skipped: ${skipped}`);

if (failures.length) {
  console.log('\nFailed pages:');
  failures.forEach(({ path, status, msg }) => console.log(`  ${status}  ${path}  ${msg || ''}`));
}

console.log('\nDone.\n');
