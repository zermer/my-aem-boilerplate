/**
 * Product-specific re-importer for James Hardie product catalog pages.
 *
 * The original run-import.mjs failed on product pages because jameshardie.com
 * uses Tailwind utility classes (no semantic component names). This script uses
 * structure-based extraction instead.
 *
 * Usage:
 *   node tools/importer/import-products.mjs <token>
 *
 * Re-imports product catalog pages from live jameshardie.com and uploads directly
 * to DA.Live (combining import + upload in one step).
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { JSDOM } from 'jsdom';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TOKEN = process.argv[2];
if (!TOKEN) { console.error('Usage: node import-products.mjs <IMS_TOKEN>'); process.exit(1); }

const ORG = 'zermer';
const REPO = 'my-aem-boilerplate';
const DA_SOURCE = `https://admin.da.live/source/${ORG}/${REPO}`;
const AEM_PREVIEW = `https://admin.hlx.page/preview/${ORG}/${REPO}/main`;
const outputDir = join(__dirname, 'output-products');
mkdirSync(outputDir, { recursive: true });

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildBlock(doc, blockName, rows) {
  const table = doc.createElement('table');
  const colSpan = Math.max(...rows.map((r) => r.length), 1);
  const hRow = doc.createElement('tr');
  const th = doc.createElement('th');
  th.colSpan = colSpan;
  th.textContent = blockName;
  hRow.append(th);
  table.append(hRow);
  rows.forEach((row) => {
    const tr = doc.createElement('tr');
    row.forEach((cell) => {
      const td = doc.createElement('td');
      if (cell && typeof cell === 'object' && cell.nodeType) td.append(cell.cloneNode(true));
      else td.innerHTML = String(cell ?? '');
      tr.append(td);
    });
    table.append(tr);
  });
  return table;
}

function wrapDiv(doc, ...nodes) {
  const div = doc.createElement('div');
  nodes.forEach((n) => { if (n) div.append(typeof n === 'string' ? doc.createTextNode(n) : n.cloneNode(true)); });
  return div;
}

function unwrapNextImage(src) {
  if (!src) return src;
  try {
    if (src.includes('/_next/image')) {
      const u = new URL(src, 'https://www.jameshardie.com');
      const encoded = u.searchParams.get('url');
      if (encoded) return decodeURIComponent(encoded);
    }
  } catch { /* keep original */ }
  return src;
}

function normalizeImages(root) {
  root.querySelectorAll('img').forEach((img) => {
    const rawSrc = img.getAttribute('src') || '';
    img.src = unwrapNextImage(rawSrc);
    img.removeAttribute('srcset');
    img.removeAttribute('data-nimg');
    img.removeAttribute('fetchpriority');
    img.removeAttribute('decoding');
    img.removeAttribute('loading');
  });
}

function stripClasses(root) {
  root.querySelectorAll('[class]').forEach((el) => {
    if (el.tagName === 'TABLE' || el.tagName === 'TD' || el.tagName === 'TH') return;
    el.removeAttribute('class');
  });
  root.querySelectorAll('[style],[data-nimg],[data-image]').forEach((el) => {
    el.removeAttribute('style');
    el.removeAttribute('data-nimg');
    el.removeAttribute('data-image');
  });
}

function computePath(url) {
  const { pathname } = new URL(url);
  return pathname.endsWith('/') && pathname !== '/' ? pathname.slice(0, -1) : pathname;
}

// ── Product page detection ────────────────────────────────────────────────────

function getProductDepth(url) {
  // /product-catalog = 0
  // /product-catalog/exterior-siding-products = 1 (category)
  // /product-catalog/exterior-siding-products/hardie-plank-lap-siding = 2 (product)
  // /product-catalog/exterior-siding-products/hardie-plank-lap-siding/smooth = 3 (variant)
  const path = new URL(url).pathname.replace(/\/$/, '');
  const segments = path.split('/').filter(Boolean);
  return segments.length - 1; // subtract 'product-catalog'
}

// ── Transformers ──────────────────────────────────────────────────────────────

/**
 * Product category/index page: hero heading + product-cards (auto) block.
 */
function transformProductCategory(doc, url) {
  const main = doc.createElement('main');

  const h1 = doc.querySelector('h1');
  if (h1) {
    const cell = wrapDiv(doc, h1);
    main.append(wrapDiv(doc, buildBlock(doc, 'hero', [[cell]])));
  }

  // Product cards (auto) will fetch /products.json at runtime
  main.append(wrapDiv(doc, buildBlock(doc, 'product-cards (auto)', [[''], ['']])));

  const metaRows = buildMetadataRows(doc);
  main.append(wrapDiv(doc, buildBlock(doc, 'metadata', metaRows)));
  return main;
}

/**
 * Product detail page: hero (OG image + heading + intro) + features + CTA.
 * Uses structure-based extraction since the site uses only Tailwind utility classes.
 */
function transformProductDetail(doc, url) {
  const main = doc.createElement('main');
  normalizeImages(doc.body);

  // ── Hero ──────────────────────────────────────────────────────────────────
  // Product name: prefer the h2 that's the full product name (e.g. "Hardie® Plank Lap Siding")
  // The h1 on JH pages is just the product family ("Hardie® Plank").
  // The h2 that immediately follows within the first section is the full name.
  const h1 = doc.querySelector('h1');
  const allH2s = [...doc.querySelectorAll('h2')];
  const introH2 = allH2s[0]; // First h2 = full product name
  const heading = introH2 || h1;

  // Intro paragraph: first <p> near the heading (product tagline/description)
  let introPara = null;
  if (heading) {
    let sib = heading.nextElementSibling;
    while (sib && !introPara) {
      if (sib.tagName === 'P' && sib.textContent.trim().length > 20) introPara = sib;
      sib = sib.nextElementSibling;
    }
    if (!introPara) {
      // Try parent's next sibling
      sib = heading.parentElement?.nextElementSibling;
      while (sib && !introPara) {
        const p = sib.querySelector('p');
        if (p && p.textContent.trim().length > 20) introPara = p;
        sib = sib.nextElementSibling;
      }
    }
  }

  // OG image for hero background
  const ogImgSrc = doc.querySelector('meta[property="og:image"]')?.content || '';
  const heroImgCell = doc.createElement('div');
  if (ogImgSrc) {
    const img = doc.createElement('img');
    img.src = ogImgSrc.startsWith('//') ? `https:${ogImgSrc}` : ogImgSrc;
    img.alt = heading?.textContent?.trim() || '';
    const pic = doc.createElement('picture');
    pic.append(img);
    heroImgCell.append(pic);
  }

  const heroTextCell = doc.createElement('div');
  if (heading) heroTextCell.append(heading.cloneNode(true));
  if (introPara) heroTextCell.append(introPara.cloneNode(true));

  main.append(wrapDiv(doc, buildBlock(doc, 'hero', [[heroImgCell, heroTextCell]])));

  // ── Why Choose / feature cards ─────────────────────────────────────────────
  // The "Why Choose" section uses class "card-item" for each feature.
  const cardItems = [...doc.querySelectorAll('.card-item')];
  if (cardItems.length >= 2) {
    // Find the section heading ("Why Choose...")
    const whyH2 = allH2s.find((h) => /why choose/i.test(h.textContent));
    if (whyH2) {
      const sectionHeadDiv = doc.createElement('div');
      sectionHeadDiv.append(whyH2.cloneNode(true));
      // Intro paragraph for the section
      let secIntro = whyH2.nextElementSibling;
      while (secIntro && secIntro.tagName !== 'P') secIntro = secIntro.nextElementSibling;
      if (secIntro) sectionHeadDiv.append(secIntro.cloneNode(true));
      main.append(wrapDiv(doc, sectionHeadDiv));
    }

    cardItems.forEach((card) => {
      // Each card has: optional img/icon, bold <p> heading, body <p>
      const boldP = card.querySelector('p.font-bold, p[class*="font-bold"]') || card.querySelector('p:first-of-type');
      const bodyP = card.querySelector('p:not(.font-bold):not([class*="font-bold"])') || card.querySelector('p:last-of-type');

      const textCell = doc.createElement('div');
      if (boldP) {
        const h3 = doc.createElement('h3');
        h3.textContent = boldP.textContent.trim();
        textCell.append(h3);
      }
      if (bodyP && bodyP !== boldP) textCell.append(bodyP.cloneNode(true));

      main.append(wrapDiv(doc, buildBlock(doc, 'media-with-text', [[textCell]])));
    });
  }

  // ── CTA: "Start your renovation" ──────────────────────────────────────────
  const renovationH2 = allH2s.find((h) => /start your renovation/i.test(h.textContent));
  if (renovationH2) {
    const ctaCell = doc.createElement('div');
    ctaCell.append(renovationH2.cloneNode(true));

    // Body paragraph after the heading
    let ctaP = renovationH2.nextElementSibling;
    while (ctaP && ctaP.tagName !== 'P') ctaP = ctaP.nextElementSibling;
    if (ctaP) ctaCell.append(ctaP.cloneNode(true));

    // CTA button link
    const ctaLink = renovationH2.closest('div')?.querySelector('a[href]')
      || renovationH2.parentElement?.querySelector('a[href]');
    if (ctaLink) {
      const p = doc.createElement('p');
      const strong = doc.createElement('strong');
      const a = doc.createElement('a');
      a.href = ctaLink.getAttribute('href') || ctaLink.href || '#';
      a.textContent = ctaLink.textContent.trim() || 'Find a local contractor';
      strong.append(a);
      p.append(strong);
      ctaCell.append(p);
    }

    main.append(wrapDiv(doc, buildBlock(doc, 'cta-band', [[ctaCell]])));
  }

  // ── Metadata ───────────────────────────────────────────────────────────────
  const metaRows = buildMetadataRows(doc, { template: 'product-detail' });
  main.append(wrapDiv(doc, buildBlock(doc, 'metadata', metaRows)));
  return main;
}

/**
 * Product variant page (deepest level): simpler — just heading + image + back link.
 */
function transformProductVariant(doc, url) {
  const main = doc.createElement('main');
  normalizeImages(doc.body);

  const h1 = doc.querySelector('h1');
  const h2 = doc.querySelector('h2');
  const heading = h2 || h1;

  const ogImgSrc = doc.querySelector('meta[property="og:image"]')?.content || '';
  const heroImgCell = doc.createElement('div');
  if (ogImgSrc) {
    const img = doc.createElement('img');
    img.src = ogImgSrc.startsWith('//') ? `https:${ogImgSrc}` : ogImgSrc;
    img.alt = heading?.textContent?.trim() || '';
    const pic = doc.createElement('picture');
    pic.append(img);
    heroImgCell.append(pic);
  }

  const heroTextCell = doc.createElement('div');
  if (heading) heroTextCell.append(heading.cloneNode(true));

  main.append(wrapDiv(doc, buildBlock(doc, 'hero', [[heroImgCell, heroTextCell]])));

  const metaRows = buildMetadataRows(doc, { template: 'product-variant' });
  main.append(wrapDiv(doc, buildBlock(doc, 'metadata', metaRows)));
  return main;
}

function buildMetadataRows(doc, extra = {}) {
  const title = doc.querySelector('title')?.textContent?.replace(/\s*\|\s*James Hardie.*$/, '').trim() || '';
  const description = doc.querySelector('meta[name="description"]')?.content || '';
  const ogImg = doc.querySelector('meta[property="og:image"]')?.content || '';
  const image = ogImg.startsWith('//') ? `https:${ogImg}` : ogImg;
  const rows = Object.entries({ title, description, image, ...extra }).filter(([, v]) => v);
  return rows;
}

// ── Fetch ─────────────────────────────────────────────────────────────────────

async function fetchPage(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; AEM-Importer/1.0)',
          'Accept': 'text/html,application/xhtml+xml',
        },
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (err) {
      if (i === retries - 1) throw err;
      await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
    }
  }
}

// ── Upload ────────────────────────────────────────────────────────────────────

async function uploadAndPreview(path, html) {
  const r1 = await fetch(`${DA_SOURCE}${path}.html`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'text/html; charset=utf-8' },
    body: html,
  });
  if (!r1.ok) return { uploaded: false, status: r1.status };

  const r2 = await fetch(`${AEM_PREVIEW}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  return { uploaded: true, previewed: r2.ok, uploadStatus: r1.status, previewStatus: r2.status };
}

// ── Main ──────────────────────────────────────────────────────────────────────

const urls = readFileSync(join(__dirname, 'urls-all.txt'), 'utf-8')
  .split('\n').map((l) => l.trim())
  .filter((l) => l && l.includes('/product-catalog/') && l !== 'https://www.jameshardie.com/product-catalog');

console.log(`\nRe-importing ${urls.length} product pages\n`);

let success = 0;
let failed = 0;

for (const url of urls) {
  const path = computePath(url);
  const depth = getProductDepth(url);
  const slug = path.replace(/^\//, '').replace(/\//g, '--') || 'product-catalog';

  process.stdout.write(`  ${path.padEnd(70)} `);

  try {
    const html = await fetchPage(url);
    const dom = new JSDOM(html, { url });
    const doc = dom.window.document;

    // Remove nav/header/footer chrome
    ['header', 'footer', 'nav', '#onetrust-consent-sdk', '[class*="sticky"]'].forEach((sel) => {
      try { doc.querySelectorAll(sel).forEach((el) => el.remove()); } catch { /* skip */ }
    });

    let main;
    if (depth <= 1) {
      main = transformProductCategory(doc, url);
    } else if (depth === 2) {
      main = transformProductDetail(doc, url);
    } else {
      main = transformProductVariant(doc, url);
    }

    stripClasses(main);

    const output = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${doc.querySelector('title')?.textContent || slug}</title>
</head>
<body>
${main.outerHTML}
</body>
</html>`;

    // Save locally
    writeFileSync(join(outputDir, `${slug}.html`), output, 'utf-8');

    // Upload to DA.Live
    const result = await uploadAndPreview(path, output);
    if (result.uploaded) {
      console.log(result.previewed ? '✓ uploaded + previewed' : '✓ uploaded (preview pending)');
      success++;
    } else {
      console.log(`✗ upload failed (${result.status})`);
      failed++;
    }
  } catch (err) {
    console.log(`✗ ${err.message}`);
    failed++;
  }

  await new Promise((r) => setTimeout(r, 600));
}

console.log(`\n${'─'.repeat(60)}`);
console.log(`Uploaded: ${success}  Failed: ${failed}`);
console.log(`Output: ${outputDir}\n`);
