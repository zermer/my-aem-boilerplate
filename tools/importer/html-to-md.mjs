/**
 * Convert output-blocks/ HTML files to DA.Live Markdown format.
 *
 * EDS block tables in HTML are converted to Markdown pipe tables.
 * Table cells with HTML content use inline HTML within the cells,
 * since the AEM HTML→Markdown pipeline drops complex nested structures.
 * Plain divs are converted to Markdown paragraphs/headings.
 *
 * Usage:
 *   node tools/importer/html-to-md.mjs [input-dir] [output-dir]
 *
 * Defaults:
 *   input-dir  = tools/importer/output-blocks
 *   output-dir = tools/importer/output-md
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { JSDOM } from 'jsdom';

const __dirname = dirname(fileURLToPath(import.meta.url));
const inputDir = process.argv[2] || join(__dirname, 'output-blocks');
const outputDir = process.argv[3] || join(__dirname, 'output-md');
mkdirSync(outputDir, { recursive: true });

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Minimal img serializer — keeps only src and alt. */
function serializeImg(img) {
  const src = img.getAttribute('src') || '';
  const alt = (img.getAttribute('alt') || img.getAttribute('aria-label') || '').trim();
  return `<picture><img src="${src}" alt="${alt.replace(/"/g, '&quot;')}"></picture>`;
}

/** Serialize an element's inner HTML to a single line, escaping table pipes. */
function inlineHtml(el) {
  return el.outerHTML
    .replace(/\r?\n\s*/g, ' ') // collapse newlines + indentation
    .replace(/\s{2,}/g, ' ')   // collapse runs of spaces
    .trim();
}

/**
 * Convert a <td> to a Markdown-cell string.
 *
 * Pattern (from transform-to-blocks.mjs output):
 *   <td><div>[content children]</div></td>  — block data row
 *   <td>text</td>                             — metadata key/value row
 */
function cellToMd(td) {
  // Plain-text metadata cell
  const directChildren = [...td.children];
  if (directChildren.length === 0) {
    return escPipe(td.textContent.trim().replace(/\n/g, ' '));
  }

  // Unwrap the single-div wrapper (transform-to-blocks always adds one)
  const work = (directChildren.length === 1 && directChildren[0].tagName === 'DIV')
    ? directChildren[0]
    : td;

  const parts = [];

  for (const child of [...work.children]) {
    const tag = child.tagName.toLowerCase();

    // ── Image / picture ────────────────────────────────────────────────────
    if (tag === 'picture') {
      const img = child.querySelector('img');
      if (img) parts.push(serializeImg(img));
      continue;
    }
    if (tag === 'img') {
      parts.push(serializeImg(child));
      continue;
    }
    // div wrapping only an image (imgChild pattern from transform script)
    if (tag === 'div' && !child.querySelector('h1,h2,h3,h4,h5,h6')) {
      const img = child.querySelector('img');
      if (img) {
        parts.push(serializeImg(img));
        continue;
      }
    }

    // ── Headings ──────────────────────────────────────────────────────────
    if (/^h[1-6]$/.test(tag)) {
      parts.push(inlineHtml(child));
      continue;
    }

    // ── Paragraph ─────────────────────────────────────────────────────────
    if (tag === 'p') {
      const inner = child.innerHTML.replace(/\r?\n\s*/g, ' ').trim();
      if (inner) parts.push(`<p>${inner}</p>`);
      continue;
    }

    // ── Span (eyebrow label) → wrapped in p ───────────────────────────────
    if (tag === 'span') {
      const text = child.textContent.trim();
      if (text) parts.push(`<p>${escHtml(text)}</p>`);
      continue;
    }

    // ── Div wrapper around body content ───────────────────────────────────
    if (tag === 'div') {
      for (const inner of [...child.children]) {
        const itag = inner.tagName.toLowerCase();
        if (itag === 'p') {
          const html = inner.innerHTML.replace(/\r?\n\s*/g, ' ').trim();
          if (html) parts.push(`<p>${html}</p>`);
        } else {
          parts.push(inlineHtml(inner));
        }
      }
      if (child.children.length === 0 && child.textContent.trim()) {
        parts.push(`<p>${escHtml(child.textContent.trim())}</p>`);
      }
      continue;
    }

    // ── Link (secondary CTA) ──────────────────────────────────────────────
    if (tag === 'a') {
      parts.push(inlineHtml(child));
      continue;
    }

    // ── Fallback ──────────────────────────────────────────────────────────
    const html = inlineHtml(child);
    if (html) parts.push(html);
  }

  // If the wrapper itself is text-only (no element children matched)
  if (parts.length === 0 && work.textContent.trim()) {
    return escPipe(work.textContent.trim().replace(/\n/g, ' '));
  }

  return escPipe(parts.join('').replace(/\r?\n/g, ' '));
}

/** Escape Markdown table pipes inside cell content. */
function escPipe(str) {
  return str.replace(/\|/g, '\\|');
}

function escHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Block table → Markdown ────────────────────────────────────────────────────

function tableToMd(table) {
  const allRows = [...table.querySelectorAll(':scope > tr, :scope > tbody > tr')];
  if (allRows.length === 0) return '';

  const headerTh = allRows[0].querySelector('th');
  if (!headerTh) return '';

  const blockName = headerTh.textContent.trim();
  const colCount = parseInt(headerTh.getAttribute('colspan') || '1', 10);

  // Header row: | blockName | | (pad to colCount)
  const headerCells = [blockName, ...Array(colCount - 1).fill('')];
  const sepCells = Array(colCount).fill('---');

  const lines = [
    '| ' + headerCells.join(' | ') + ' |',
    '| ' + sepCells.join(' | ') + ' |',
  ];

  for (const row of allRows.slice(1)) {
    const tds = [...row.querySelectorAll('td')];
    const cells = tds.map(cellToMd);
    while (cells.length < colCount) cells.push('');
    lines.push('| ' + cells.join(' | ') + ' |');
  }

  return lines.join('\n');
}

// ── Plain div → Markdown ──────────────────────────────────────────────────────

function nodeToMd(el) {
  const tag = el.tagName.toLowerCase();

  if (/^h[1-6]$/.test(tag)) {
    const level = parseInt(tag[1]);
    const text = el.textContent.trim().replace(/\n/g, ' ');
    return text ? '#'.repeat(level) + ' ' + text : '';
  }

  if (tag === 'p') {
    const text = el.textContent.trim().replace(/\n/g, ' ');
    return text || '';
  }

  if (tag === 'ul') {
    const items = [...el.querySelectorAll(':scope > li')].map((li) => {
      const a = li.querySelector('a');
      const h = li.querySelector('h2,h3,h4');
      if (h && a) return `- [${h.textContent.trim()}](${a.getAttribute('href') || '#'})`;
      return `- ${li.textContent.trim().replace(/\n/g, ' ')}`;
    });
    return items.join('\n');
  }

  if (tag === 'ol') {
    return [...el.querySelectorAll(':scope > li')]
      .map((li, i) => `${i + 1}. ${li.textContent.trim().replace(/\n/g, ' ')}`)
      .join('\n');
  }

  if (tag === 'div') {
    return divToMd(el);
  }

  if (tag === 'picture') {
    const img = el.querySelector('img');
    if (img) {
      const src = img.getAttribute('src') || '';
      const alt = (img.getAttribute('alt') || img.getAttribute('aria-label') || '').trim();
      return src ? `![${alt}](${src})` : '';
    }
    return '';
  }

  if (tag === 'img') {
    const src = el.getAttribute('src') || '';
    const alt = (el.getAttribute('alt') || el.getAttribute('aria-label') || '').trim();
    return src ? `![${alt}](${src})` : '';
  }

  if (tag === 'figure') {
    const img = el.querySelector('img');
    const caption = el.querySelector('figcaption')?.textContent?.trim();
    if (img) {
      const src = img.getAttribute('src') || '';
      const alt = (img.getAttribute('alt') || img.getAttribute('aria-label') || caption || '').trim();
      return src ? `![${alt}](${src})` : '';
    }
    return '';
  }

  const text = el.textContent.trim().replace(/\n/g, ' ');
  return text || '';
}

function divToMd(div) {
  const parts = [];
  for (const child of [...div.children]) {
    // A div that wraps only a figure: unwrap and emit the figure directly
    if (child.tagName.toLowerCase() === 'div' && child.children.length === 1) {
      const inner = child.children[0];
      if (/^(figure|picture|img)$/i.test(inner.tagName)) {
        const md = nodeToMd(inner);
        if (md) parts.push(md);
        continue;
      }
    }
    const md = nodeToMd(child);
    if (md) parts.push(md);
  }
  return parts.join('\n\n');
}

// ── Main conversion ───────────────────────────────────────────────────────────

function mainToMd(main) {
  const sections = [];

  for (const child of [...main.children]) {
    const tag = child.tagName.toLowerCase();

    if (tag === 'table') {
      const md = tableToMd(child);
      if (md) sections.push(md);
      continue;
    }

    if (tag === 'div') {
      const md = divToMd(child);
      if (md) sections.push(md);
      continue;
    }

    // Headings/paragraphs directly in <main>
    const md = nodeToMd(child);
    if (md) sections.push(md);
  }

  return sections.filter(Boolean).join('\n\n');
}

// ── File processing loop ──────────────────────────────────────────────────────

const files = readdirSync(inputDir).filter((f) => f.endsWith('.html'));
console.log(`\nConverting ${files.length} HTML files → Markdown`);
console.log(`${inputDir} → ${outputDir}\n`);

let converted = 0;
let skipped = 0;

for (const file of files) {
  const inPath = join(inputDir, file);
  const outPath = join(outputDir, file.replace(/\.html$/, '.md'));

  const html = readFileSync(inPath, 'utf-8');
  const { window: { document } } = new JSDOM(html);
  const main = document.querySelector('main');

  if (!main) {
    process.stdout.write('_');
    skipped++;
    continue;
  }

  const md = mainToMd(main);
  writeFileSync(outPath, md + '\n', 'utf-8');
  converted++;
  process.stdout.write('.');
}

console.log(`\n\nConverted: ${converted}  Skipped: ${skipped}`);
console.log(`Output: ${outputDir}\n`);
