/**
 * Post-processor: transform already-imported output-full/ HTML into proper EDS block tables.
 *
 * The original run-import.mjs stripped CSS classes before running transforms,
 * so class-based selectors all missed and content landed as raw divs. This
 * script operates on that already-stripped HTML using structure-based heuristics.
 *
 * Usage:
 *   node tools/importer/transform-to-blocks.mjs [input-dir] [output-dir]
 *
 * Defaults:
 *   input-dir  = tools/importer/output-full
 *   output-dir = tools/importer/output-blocks
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { JSDOM } from 'jsdom';

const __dirname = dirname(fileURLToPath(import.meta.url));
const inputDir = process.argv[2] || join(__dirname, 'output-full');
const outputDir = process.argv[3] || join(__dirname, 'output-blocks');
mkdirSync(outputDir, { recursive: true });

// ── EDS block table builder ───────────────────────────────────────────────────

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

// ── Helpers ───────────────────────────────────────────────────────────────────

/** True when el has a descendant img with meaningful dimensions (not tiny icons). */
function hasLargeImg(el) {
  return [...el.querySelectorAll('img')].some((img) => {
    const w = parseInt(img.getAttribute('width') || '0', 10);
    const h = parseInt(img.getAttribute('height') || '0', 10);
    return w >= 200 || h >= 150 || (!w && !h); // unknown size = assume large
  });
}

/** Wrap an img in a <picture> if it isn't already. */
function wrapPicture(doc, img) {
  if (img.parentElement?.tagName === 'PICTURE') return img.parentElement.cloneNode(true);
  const pic = doc.createElement('picture');
  pic.append(img.cloneNode(true));
  return pic;
}

/**
 * Given a div that is a media-with-text candidate, return { imgEl, textEl }
 * where imgEl is the div/picture side and textEl is the text content side.
 * Returns null if the pattern doesn't match.
 */
function splitMediaText(div) {
  const children = [...div.children].filter((c) => c.tagName === 'DIV');
  if (children.length < 2) return null;

  // Find the child that has img and the child that has heading
  let imgChild = null;
  let textChild = null;
  for (const child of children) {
    const imgs = child.querySelectorAll('img');
    const headings = child.querySelectorAll('h1,h2,h3,h4');
    if (imgs.length > 0 && headings.length === 0) imgChild = child;
    else if (headings.length > 0) textChild = child;
  }
  if (!imgChild || !textChild) return null;
  return { imgChild, textChild };
}

/** True when el looks like a CTA band section (heading + CTA button, no large img). */
function isCtaBand(el) {
  const ctaSpan = el.querySelector('a > span[id^="cta-"]');
  if (!ctaSpan) return false;
  const heading = el.querySelector('h2,h3');
  if (!heading) return false;
  if (hasLargeImg(el)) return false;
  return true;
}

/** Extract the CTA band content into a 1-cell block table. */
function buildCtaBandBlock(doc, el) {
  const cell = doc.createElement('div');
  const h = el.querySelector('h2,h3');
  const p = el.querySelector('p:not(:empty)');
  const ctaA = el.querySelector('a:has(span[id^="cta-"])') || el.querySelector('a[href]');

  if (h) cell.append(h.cloneNode(true));
  if (p) cell.append(p.cloneNode(true));
  if (ctaA) {
    const btnP = doc.createElement('p');
    const strong = doc.createElement('strong');
    const a = ctaA.cloneNode(true);
    // Simplify: keep just the text, strip nested divs/spans
    const text = ctaA.querySelector('span[id^="cta-"]')?.textContent || ctaA.textContent?.trim() || '';
    a.textContent = text;
    strong.append(a);
    btnP.append(strong);
    cell.append(btnP);
  }
  return buildBlock(doc, 'cta-band', [[cell]]);
}

/** True when el contains a blog-card list (ul with li[img + heading + a]). */
function isBlogCardList(el) {
  const ul = el.querySelector('ul');
  if (!ul) return false;
  const items = [...ul.querySelectorAll('li')];
  if (items.length < 2) return false;
  return items.filter((li) => li.querySelector('img') && li.querySelector('h2,h3')).length >= 2;
}

/** Build a blog-cards block table from a blog card list section. */
function buildBlogCardsBlock(doc, el) {
  const ul = el.querySelector('ul');
  const items = [...ul.querySelectorAll('li')].filter(
    (li) => li.querySelector('img') && li.querySelector('h2,h3'),
  ).slice(0, 9);

  const rows = items.map((li) => {
    const img = li.querySelector('img');
    const heading = li.querySelector('h2,h3');
    const link = li.querySelector('a[href]');

    const imgCell = doc.createElement('div');
    if (img) imgCell.append(wrapPicture(doc, img));

    const textCell = doc.createElement('div');
    if (heading) textCell.append(heading.cloneNode(true));
    if (link && link !== heading?.closest('a')) {
      const p = doc.createElement('p');
      p.append(link.cloneNode(true));
      textCell.append(p);
    }

    return [imgCell, textCell];
  });

  return buildBlock(doc, 'blog-cards', rows);
}

// ── Core transform ────────────────────────────────────────────────────────────

/**
 * Walk <main> children and convert detected patterns to EDS block tables.
 * Returns a new <main> element.
 */
function transformMain(doc, originalMain) {
  const newMain = doc.createElement('main');
  let heroEmitted = false;

  for (const child of [...originalMain.children]) {
    // Keep existing block tables (metadata etc.) as-is
    if (child.tagName === 'TABLE') {
      const tbl = child.cloneNode(true);
      // Fix product titles that ended up as "Name - " due to missing subtitle
      const isMetadata = tbl.querySelector('th')?.textContent?.trim().toLowerCase() === 'metadata';
      if (isMetadata) {
        tbl.querySelectorAll('tr').forEach((row) => {
          const [keyTd, valTd] = [...row.querySelectorAll('td')];
          if (keyTd?.textContent?.trim().toLowerCase() === 'title' && valTd) {
            valTd.textContent = valTd.textContent.replace(/\s+-\s*$/, '').trim();
          }
        });
      }
      newMain.append(tbl);
      continue;
    }
    if (child.tagName !== 'DIV') {
      newMain.append(child.cloneNode(true));
      continue;
    }

    // ── Hero (image + h1) ─────────────────────────────────────────────────────
    if (!heroEmitted && child.querySelector('h1')) {
      const h1 = child.querySelector('h1');
      const img = child.querySelector('img');

      if (img && hasLargeImg(child)) {
        // Image hero: picture cell + text cell
        const imgCell = doc.createElement('div');
        imgCell.append(wrapPicture(doc, img));

        const textCell = doc.createElement('div');
        textCell.append(h1.cloneNode(true));

        // Collect body text — siblings of h1 (p, span with real text)
        const textParent = h1.parentElement;
        [...(textParent?.children || [])].forEach((el) => {
          if (el === h1) return;
          if (['P', 'SPAN', 'DIV'].includes(el.tagName) && el.textContent?.trim()) {
            // Convert span to p for cleaner EDS markup
            const clone = el.cloneNode(true);
            if (el.tagName === 'SPAN') {
              const p = doc.createElement('p');
              p.innerHTML = clone.innerHTML;
              textCell.append(p);
            } else {
              // Look for CTA link inside a nested div
              const ctaLink = clone.querySelector('a[href]');
              if (ctaLink && clone.tagName === 'DIV') {
                const p = doc.createElement('p');
                const strong = doc.createElement('strong');
                const a = doc.createElement('a');
                a.href = ctaLink.href || ctaLink.getAttribute('href') || '#';
                const ctaText = ctaLink.querySelector('span[id^="cta-"]')?.textContent
                  || ctaLink.textContent?.trim() || 'Learn more';
                a.textContent = ctaText;
                strong.append(a);
                p.append(strong);
                textCell.append(p);
              } else {
                textCell.append(clone);
              }
            }
          }
        });

        newMain.append(buildBlock(doc, 'hero', [[imgCell, textCell]]));
        heroEmitted = true;
        continue;
      }

      // Text-only hero (h1 with no large image)
      const textCell = doc.createElement('div');
      // Label (p before h1)
      const labelP = [...(h1.parentElement?.children || [])].find(
        (el) => el.tagName === 'P' && el.compareDocumentPosition(h1) & 4,
      );
      if (labelP) textCell.append(labelP.cloneNode(true));
      textCell.append(h1.cloneNode(true));
      // Body paragraphs after h1
      let sibling = h1.nextElementSibling;
      while (sibling) {
        if (['P', 'SPAN'].includes(sibling.tagName)) {
          const clone = sibling.cloneNode(true);
          if (sibling.tagName === 'SPAN') {
            const p = doc.createElement('p'); p.innerHTML = clone.innerHTML; textCell.append(p);
          } else textCell.append(clone);
        }
        sibling = sibling.nextElementSibling;
      }
      newMain.append(buildBlock(doc, 'hero', [[textCell]]));
      heroEmitted = true;
      continue;
    }

    // ── CTA band (heading + button CTA, no large img) ─────────────────────────
    if (isCtaBand(child)) {
      newMain.append(buildCtaBandBlock(doc, child));
      continue;
    }

    // ── Blog cards (ul of li[img + heading]) ─────────────────────────────────
    if (isBlogCardList(child)) {
      // Preserve any section heading before the list
      const sectionHeading = child.querySelector(':scope > div > h2, :scope > div > h3, :scope > h2, :scope > h3');
      if (sectionHeading) {
        const wrapper = doc.createElement('div');
        wrapper.append(sectionHeading.cloneNode(true));
        newMain.append(wrapper);
      }
      newMain.append(buildBlogCardsBlock(doc, child));
      continue;
    }

    // ── Media-with-text grid ──────────────────────────────────────────────────
    // Detect: a container div that holds multiple sub-divs each with [text]+[img]
    const subDivs = [...child.children].filter((c) => c.tagName === 'DIV');

    // Check if this div is itself a media-with-text candidate (direct 2-cell)
    const directSplit = splitMediaText(child);
    if (directSplit && hasLargeImg(directSplit.imgChild)) {
      const { imgChild, textChild } = directSplit;
      newMain.append(buildBlock(doc, 'media-with-text', [[imgChild, textChild]]));
      continue;
    }

    // Check if this div or its grandchildren are media-with-text pairs.
    // Pattern A: child itself has 2 divs (img+text) — already handled above.
    // Pattern B: child → gridDiv → featureDiv(textDiv, imgDiv)  (why-james-hardie style)
    const mwtPairs = [];
    const outerHeading = child.querySelector(':scope > h2, :scope > h3');

    for (const sub of subDivs) {
      // Try sub directly (Pattern A)
      const directSplitSub = splitMediaText(sub);
      if (directSplitSub && hasLargeImg(directSplitSub.imgChild)) {
        mwtPairs.push(directSplitSub);
      } else {
        // Try sub's direct div children (Pattern B — grid container)
        const grandChildren = [...sub.children].filter((c) => c.tagName === 'DIV');
        for (const gc of grandChildren) {
          const split = splitMediaText(gc);
          if (split && hasLargeImg(split.imgChild)) {
            mwtPairs.push(split);
          }
        }
      }
    }

    if (mwtPairs.length >= 2) {
      // Emit the section heading as plain content first
      if (outerHeading) {
        const hw = doc.createElement('div');
        hw.append(outerHeading.cloneNode(true));
        newMain.append(hw);
      }
      // Emit each pair as its own media-with-text block
      mwtPairs.forEach(({ imgChild, textChild }) => {
        newMain.append(buildBlock(doc, 'media-with-text', [[imgChild, textChild]]));
      });
      continue;
    }

    // ── Fallback: keep as-is ──────────────────────────────────────────────────
    newMain.append(child.cloneNode(true));
  }

  // Wrap every <table> that is a direct child of <main> in a <div>.
  // The AEM HTML→Markdown pipeline requires this to preserve block tables
  // (direct <table> children are silently dropped during HTML→Markdown conversion).
  [...newMain.querySelectorAll(':scope > table')].forEach((table) => {
    const wrapper = doc.createElement('div');
    newMain.insertBefore(wrapper, table);
    wrapper.append(table);
  });

  return newMain;
}

// ── File processing loop ──────────────────────────────────────────────────────

const files = readdirSync(inputDir).filter((f) => f.endsWith('.html'));
console.log(`\nTransforming ${files.length} files: ${inputDir} → ${outputDir}\n`);

let transformed = 0;
let unchanged = 0;

for (const file of files) {
  const inPath = join(inputDir, file);
  const outPath = join(outputDir, file);

  const html = readFileSync(inPath, 'utf-8');
  const dom = new JSDOM(html);
  const doc = dom.window.document;
  const originalMain = doc.querySelector('main');

  if (!originalMain) {
    writeFileSync(outPath, html, 'utf-8');
    unchanged++;
    continue;
  }

  const newMain = transformMain(doc, originalMain);

  // Count block tables (excluding metadata) to know if we improved anything
  const blocksBefore = [...originalMain.querySelectorAll('table th')].filter(
    (th) => th.textContent.trim() !== 'metadata',
  ).length;
  const blocksAfter = [...newMain.querySelectorAll('table th')].filter(
    (th) => th.textContent.trim() !== 'metadata',
  ).length;

  const output = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${doc.querySelector('title')?.textContent || file.replace('.html', '')}</title>
</head>
<body>
${newMain.outerHTML}
</body>
</html>`;

  writeFileSync(outPath, output, 'utf-8');

  if (blocksAfter > blocksBefore) {
    console.log(`  ✓ ${file}  (${blocksBefore}→${blocksAfter} blocks)`);
    transformed++;
  } else {
    process.stdout.write('.');
    unchanged++;
  }
}

console.log(`\n\nDone: ${transformed} files improved, ${unchanged} unchanged`);
console.log(`Output: ${outputDir}\n`);
