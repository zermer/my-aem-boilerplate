/**
 * Local James Hardie → EDS page importer
 * Fetches pages, applies import.js transform rules via jsdom, saves HTML output.
 *
 * Usage:
 *   node tools/importer/run-import.mjs [urls-file] [output-dir]
 *
 * Defaults:
 *   urls-file  = tools/importer/urls-test.txt
 *   output-dir = tools/importer/output
 */

import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { JSDOM } from 'jsdom';

const __dirname = dirname(fileURLToPath(import.meta.url));

const urlsFile = process.argv[2] || join(__dirname, 'urls-test.txt');
const outputDir = process.argv[3] || join(__dirname, 'output');

mkdirSync(outputDir, { recursive: true });

// ── Load our import.js transform rules ───────────────────────────────────────
// import.js uses browser globals (document, window) so we shim them via jsdom.
// We re-evaluate the transform functions here to avoid ESM/CJS issues.

function getPageType(url) {
  const path = new URL(url).pathname;
  if (path === '/' || path === '') return 'homepage';
  if (/^\/blog\/[^/]+\/[^/]/.test(path)) return 'blog-article';
  if (path.startsWith('/blog')) return 'blog-index';
  if (/^\/product-catalog\/.+/.test(path)) return 'product-detail';
  if (path.startsWith('/product-catalog')) return 'product-index';
  if (path.startsWith('/color-design-guidance')) return 'color-guidance';
  if (path.startsWith('/find-a-contractor') || path.startsWith('/find-dealer')) return 'find-contractor';
  if (path.startsWith('/hardie-designer')) return 'embedded-tool';
  return 'marketing';
}

function computePath(url) {
  const { pathname } = new URL(url);
  return pathname.endsWith('/') && pathname !== '/' ? pathname.slice(0, -1) : pathname;
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

// ── Fetch with retry ──────────────────────────────────────────────────────────

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

// ── Build block table (server-side, using jsdom document) ────────────────────

function buildBlock(doc, blockName, rows) {
  const table = doc.createElement('table');
  const thead = doc.createElement('tr');
  const th = doc.createElement('th');
  th.colSpan = Math.max(...rows.map((r) => r.length), 1);
  th.textContent = blockName;
  thead.append(th);
  table.append(thead);
  rows.forEach((row) => {
    const tr = doc.createElement('tr');
    row.forEach((cell) => {
      const td = doc.createElement('td');
      if (cell && typeof cell === 'object' && cell.nodeType) td.append(cell);
      else if (cell !== null && cell !== undefined) td.innerHTML = String(cell);
      tr.append(td);
    });
    table.append(tr);
  });
  return table;
}

// ── Shared DOM helpers ────────────────────────────────────────────────────────

function normalizeImages(root) {
  root.querySelectorAll('img').forEach((img) => {
    img.src = unwrapNextImage(img.src || '');
    img.removeAttribute('srcset');
  });
}

function stripTailwindClasses(root) {
  root.querySelectorAll('[class]').forEach((el) => {
    // Keep block table cells — EDS uses classes on those
    if (el.tagName === 'TABLE' || el.tagName === 'TD' || el.tagName === 'TH') return;
    el.removeAttribute('class');
  });
  root.querySelectorAll('[style]').forEach((el) => el.removeAttribute('style'));
  root.querySelectorAll('[data-nimg], [fetchpriority], [decoding], [data-image]').forEach((el) => {
    el.removeAttribute('data-nimg');
    el.removeAttribute('fetchpriority');
    el.removeAttribute('decoding');
    el.removeAttribute('data-image');
  });
}

function removeChrome(doc) {
  [
    'header', 'footer', 'nav[aria-label="Main Navigation"]',
    '#onetrust-consent-sdk', '.onetrust-pc-dark-filter',
    '#hubspot-messages-iframe-container',
    '[class*="sticky"]', '[class*="Sticky"]',
    '[class*="skip"]', '[class*="Skip"]',
    '[class*="back-to-top"]', '[class*="cookie"]',
  ].forEach((sel) => {
    try { doc.querySelectorAll(sel).forEach((el) => el.remove()); } catch { /* skip */ }
  });
}

function buildMetadata(doc, extra = {}) {
  const fields = {
    title: doc.querySelector('title')?.textContent?.replace(/\s*\|\s*James Hardie.*$/, '').trim() || '',
    description: doc.querySelector('meta[name="description"]')?.content || '',
    image: unwrapNextImage(doc.querySelector('meta[property="og:image"]')?.content || ''),
    ...extra,
  };
  const rows = Object.entries(fields).filter(([, v]) => v).map(([k, v]) => [k, v]);
  return rows.length ? buildBlock(doc, 'metadata', rows) : null;
}

function extractHero(doc) {
  const heroSection = doc.querySelector('[class*="Hero"], [class*="hero"], [class*="Banner"]:not([class*="cookie"])');
  if (!heroSection) return null;
  normalizeImages(heroSection);

  const video = heroSection.querySelector('video source, video');
  const img = heroSection.querySelector('img');
  const h1 = heroSection.querySelector('h1');
  const sub = heroSection.querySelector('p');
  const cta = heroSection.querySelector('a');

  const mediaCell = doc.createElement('div');
  if (video) {
    const videoSrc = video.getAttribute('src') || '';
    if (videoSrc) {
      const a = doc.createElement('a');
      a.href = videoSrc; a.textContent = videoSrc;
      mediaCell.append(a);
    }
  } else if (img) {
    const pic = doc.createElement('picture');
    pic.append(img.cloneNode(true));
    mediaCell.append(pic);
  }

  const textCell = doc.createElement('div');
  if (h1) textCell.append(h1.cloneNode(true));
  if (sub?.textContent?.trim()) textCell.append(sub.cloneNode(true));
  if (cta) {
    const p = doc.createElement('p');
    const strong = doc.createElement('strong');
    strong.append(cta.cloneNode(true));
    p.append(strong); textCell.append(p);
  }

  heroSection.remove();
  return buildBlock(doc, video ? 'hero (video)' : 'hero', [[mediaCell, textCell]]);
}

function extractBlogCards(doc, containerSelector) {
  const container = doc.querySelector(containerSelector);
  if (!container) return null;
  normalizeImages(container);

  const articles = [...container.querySelectorAll(
    'article, [class*="article-card"], [class*="ArticleCard"], [class*="blog-card"], [class*="BlogCard"]',
  )].slice(0, 9);
  if (!articles.length) return null;

  const rows = articles.map((article) => {
    const img = article.querySelector('img');
    const title = article.querySelector('h2, h3, h4, [class*="title"]');
    const category = article.querySelector('[class*="category"], [class*="Category"]');
    const link = article.querySelector('a[href]');

    const imgCell = doc.createElement('div');
    if (img) { const pic = doc.createElement('picture'); pic.append(img.cloneNode(true)); imgCell.append(pic); }

    const textCell = doc.createElement('div');
    if (category) { const p = doc.createElement('p'); p.append(category.cloneNode(true)); textCell.append(p); }
    if (title) textCell.append(title.cloneNode(true));
    if (link) { const p = doc.createElement('p'); p.append(link.cloneNode(true)); textCell.append(p); }

    return [imgCell, textCell];
  });

  container.closest('section')?.remove() || container.remove();
  return buildBlock(doc, 'blog-cards', rows);
}

function extractCtaBanner(doc) {
  for (const sel of ['[class*="cta-banner"]', '[class*="CtaBanner"]', '[class*="cta-strip"]', '[class*="renovation-cta"]', '[class*="PromoBar"]']) {
    const el = doc.querySelector(sel);
    if (!el) continue;
    normalizeImages(el);
    const title = el.querySelector('h2, h3');
    const body = el.querySelector('p:not(:empty)');
    const cta = el.querySelector('a');
    const textCell = doc.createElement('div');
    if (title) textCell.append(title.cloneNode(true));
    if (body) textCell.append(body.cloneNode(true));
    if (cta) { const p = doc.createElement('p'); const s = doc.createElement('strong'); s.append(cta.cloneNode(true)); p.append(s); textCell.append(p); }
    el.remove();
    return buildBlock(doc, 'cta-banner', [[textCell]]);
  }
  return null;
}

function extractMediaWithText(doc) {
  const blocks = [];
  doc.querySelectorAll('[class*="feature-block"], [class*="FeatureBlock"], [class*="media-text"], [class*="MediaText"]').forEach((section) => {
    normalizeImages(section);
    const img = section.querySelector('img');
    const title = section.querySelector('h2, h3');
    const body = section.querySelector('p:not(:empty)');
    const cta = section.querySelector('a');
    if (!title && !img) return;

    const imgCell = doc.createElement('div');
    if (img) { const pic = doc.createElement('picture'); pic.append(img.cloneNode(true)); imgCell.append(pic); }

    const textCell = doc.createElement('div');
    if (title) textCell.append(title.cloneNode(true));
    if (body) textCell.append(body.cloneNode(true));
    if (cta) { const p = doc.createElement('p'); const em = doc.createElement('em'); em.append(cta.cloneNode(true)); p.append(em); textCell.append(p); }

    blocks.push(buildBlock(doc, 'media-with-text', [[imgCell, textCell]]));
    section.remove();
  });
  return blocks;
}

// ── Page transformers ─────────────────────────────────────────────────────────

function transformHomepage(doc) {
  const main = doc.createElement('main');
  const hero = extractHero(doc);
  if (hero) main.append(hero);
  const blogCards = extractBlogCards(doc, '[class*="blog-carousel"], [class*="BlogCarousel"], [class*="article-carousel"]');
  if (blogCards) main.append(blogCards);
  const cta = extractCtaBanner(doc);
  if (cta) main.append(cta);
  const meta = buildMetadata(doc, { template: 'homepage' });
  if (meta) main.append(meta);
  return main;
}

function transformBlogArticle(doc) {
  const main = doc.createElement('main');

  const breadcrumb = doc.querySelector('nav[aria-label*="breadcrumb"], ol[class*="breadcrumb"]');
  if (breadcrumb) {
    const links = [...breadcrumb.querySelectorAll('a, li:last-child')].map((el) => el.cloneNode(true));
    if (links.length) {
      const cell = doc.createElement('div');
      links.forEach((l) => cell.append(l));
      main.append(buildBlock(doc, 'breadcrumb', [[cell]]));
    }
    breadcrumb.remove();
  }

  const h1 = doc.querySelector('h1');
  const heroImg = doc.querySelector('[class*="hero"] img, [class*="featured"] img');
  const dateEl = doc.querySelector('time');
  const authorEl = doc.querySelector('h6, [class*="author"]');

  const imgCell = doc.createElement('div');
  if (heroImg) { normalizeImages(heroImg.parentElement); const pic = doc.createElement('picture'); pic.append(heroImg.cloneNode(true)); imgCell.append(pic); heroImg.closest('section, div[class*="hero"]')?.remove(); }

  const textCell = doc.createElement('div');
  if (h1) { textCell.append(h1.cloneNode(true)); h1.remove(); }
  if (dateEl) { const p = doc.createElement('p'); p.append(dateEl.cloneNode(true)); textCell.append(p); }
  if (authorEl) { textCell.append(authorEl.cloneNode(true)); authorEl.remove(); }

  main.append(buildBlock(doc, 'article-header', [[imgCell, textCell]]));

  const articleBody = doc.querySelector('article, [class*="article-body"], [class*="ArticleBody"]') || doc.querySelector('main');
  if (articleBody) {
    normalizeImages(articleBody);
    articleBody.querySelectorAll('[class*="share"], [class*="social-links"]').forEach((el) => el.remove());
    [...articleBody.children].forEach((child) => main.append(child.cloneNode(true)));
  }

  const publishDate = dateEl?.getAttribute('datetime') || dateEl?.textContent?.trim() || '';
  const category = doc.querySelector('[class*="category"]')?.textContent?.trim() || '';
  const meta = buildMetadata(doc, { template: 'blog-article', 'publish-date': publishDate, category });
  if (meta) main.append(meta);
  return main;
}

function transformBlogIndex(doc) {
  const main = doc.createElement('main');
  const hero = extractHero(doc);
  if (hero) main.append(hero);
  const cards = extractBlogCards(doc, '[class*="article-list"], [class*="ArticleList"], [class*="posts-grid"], [class*="blog-list"]');
  if (cards) main.append(cards);
  extractMediaWithText(doc).forEach((b) => main.append(b));
  const cta = extractCtaBanner(doc);
  if (cta) main.append(cta);
  const meta = buildMetadata(doc, { template: 'blog-index' });
  if (meta) main.append(meta);
  return main;
}

function transformProductIndex(doc) {
  const main = doc.createElement('main');
  const h1 = doc.querySelector('h1');
  if (h1) { const cell = doc.createElement('div'); cell.append(h1.cloneNode(true)); main.append(buildBlock(doc, 'hero', [[cell]])); h1.remove(); }
  main.append(buildBlock(doc, 'product-cards (auto)', [['']]));
  const cta = extractCtaBanner(doc);
  if (cta) main.append(cta);
  const meta = buildMetadata(doc, { template: 'product-index' });
  if (meta) main.append(meta);
  return main;
}

function transformProductDetail(doc) {
  const main = doc.createElement('main');
  const hero = extractHero(doc);
  if (hero) main.append(hero);
  extractMediaWithText(doc).forEach((b) => main.append(b));
  const cta = extractCtaBanner(doc);
  if (cta) main.append(cta);
  const meta = buildMetadata(doc, { template: 'product-detail' });
  if (meta) main.append(meta);
  return main;
}

function transformMarketing(doc) {
  const main = doc.createElement('main');
  const hero = extractHero(doc);
  if (hero) main.append(hero);
  extractMediaWithText(doc).forEach((b) => main.append(b));
  const body = doc.querySelector('[class*="page-content"], [class*="PageContent"]') || doc.querySelector('main');
  if (body) {
    normalizeImages(body);
    [...body.children].forEach((child) => { if (child.tagName !== 'TABLE') main.append(child.cloneNode(true)); });
  }
  const cta = extractCtaBanner(doc);
  if (cta) main.append(cta);
  const meta = buildMetadata(doc, { template: 'marketing' });
  if (meta) main.append(meta);
  return main;
}

function transformEmbeddedTool(doc, toolUrl) {
  const main = doc.createElement('main');
  const h1 = doc.querySelector('h1');
  if (h1) main.append(h1.cloneNode(true));
  main.append(buildBlock(doc, 'embed', [[toolUrl]]));
  const meta = buildMetadata(doc, { template: 'embedded-tool' });
  if (meta) main.append(meta);
  return main;
}

// ── Main loop ─────────────────────────────────────────────────────────────────

const urls = readFileSync(urlsFile, 'utf-8').split('\n').map((l) => l.trim()).filter(Boolean);
console.log(`\nImporting ${urls.length} pages → ${outputDir}\n`);

let success = 0;
let failed = 0;

for (const url of urls) {
  const pageType = getPageType(url);
  const pagePath = computePath(url);
  const slug = pagePath.replace(/^\//, '').replace(/\//g, '--') || 'index';
  const outFile = join(outputDir, `${slug}.html`);

  process.stdout.write(`  ${url.replace('https://www.jameshardie.com', '')} [${pageType}] ... `);

  try {
    const html = await fetchPage(url);
    const dom = new JSDOM(html, { url });
    const doc = dom.window.document;

    removeChrome(doc);
    normalizeImages(doc.body);
    // NOTE: stripTailwindClasses must run AFTER the transform so that
    // class-based selectors (e.g. [class*="Hero"]) can still find elements.

    const transformers = {
      homepage: transformHomepage,
      'blog-article': transformBlogArticle,
      'blog-index': transformBlogIndex,
      'product-index': transformProductIndex,
      'product-detail': transformProductDetail,
      'color-guidance': transformMarketing,
      'find-contractor': (d) => transformEmbeddedTool(d, url),
      'embedded-tool': (d) => transformEmbeddedTool(d, url),
      marketing: transformMarketing,
    };

    const main = (transformers[pageType] || transformMarketing)(doc);

    // Strip Tailwind / component classes from the TRANSFORMED output,
    // preserving block table th/td which EDS needs as-is.
    stripTailwindClasses(main);

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

    // Create subdirectory if path has nested segments
    const dir = dirname(outFile);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(outFile, output, 'utf-8');

    console.log('✓');
    success++;
  } catch (err) {
    console.log(`✗ ${err.message}`);
    failed++;
  }

  // Polite crawl delay — 500ms between requests
  await new Promise((r) => setTimeout(r, 500));
}

console.log(`\nDone: ${success} succeeded, ${failed} failed`);
console.log(`Output: ${outputDir}\n`);
