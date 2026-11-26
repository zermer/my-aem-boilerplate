import { createOptimizedPicture } from '../../scripts/aem.js';

/**
 * Product detail template block.
 *
 * Authored row structure (from import-contentful.mjs output):
 *   Row type "hero"     : col 1 = "hero"      | col 2 = hero image | col 3 = h1 + description
 *   Row type "features" : col 1 = "features"  | col 2+ = icon img | heading | text
 *   Row type "downloads": col 1 = "downloads" | col 2+ = label | PDF link
 *   Row type "cta"      : col 1 = "cta"       | col 2 = heading + CTA link
 *
 * Falls back to basic rendering if first cell doesn't match a known type.
 */

function buildHero(cells) {
  const imgCell = cells[1];
  const textCell = cells[2] || cells[1];

  const section = document.createElement('div');
  section.className = 'product-hero';

  const img = imgCell?.querySelector('img');
  if (img) {
    const figure = document.createElement('figure');
    figure.className = 'product-hero-image';
    figure.append(createOptimizedPicture(img.src, img.alt, true, [{ width: '1200' }]));
    section.append(figure);
  }

  const textDiv = document.createElement('div');
  textDiv.className = 'product-hero-text';
  textDiv.innerHTML = textCell?.innerHTML || '';
  section.append(textDiv);

  return section;
}

function buildFeatures(cells) {
  const section = document.createElement('div');
  section.className = 'product-features';

  const heading = document.createElement('h2');
  heading.className = 'product-features-heading';
  heading.textContent = 'Key Features';
  section.append(heading);

  const grid = document.createElement('ul');
  grid.className = 'product-features-grid';

  // Each feature is in a separate column starting at index 1
  cells.slice(1).forEach((cell) => {
    if (!cell) return;
    const li = document.createElement('li');
    li.className = 'product-feature';

    const icon = cell.querySelector('img');
    if (icon) {
      const fig = document.createElement('figure');
      fig.className = 'product-feature-icon';
      fig.append(createOptimizedPicture(icon.src, icon.alt, false, [{ width: '64' }]));
      li.append(fig);
    }

    const h3 = cell.querySelector('h2, h3, h4, strong');
    if (h3) {
      const title = document.createElement('h3');
      title.textContent = h3.textContent.trim();
      li.append(title);
    }

    const desc = cell.querySelector('p');
    if (desc) {
      const p = document.createElement('p');
      p.textContent = desc.textContent.trim();
      li.append(p);
    }

    if (li.children.length) grid.append(li);
  });

  if (grid.children.length) section.append(grid);
  return section;
}

function buildDownloads(cells) {
  const section = document.createElement('div');
  section.className = 'product-downloads';

  const heading = document.createElement('h2');
  heading.className = 'product-downloads-heading';
  heading.textContent = 'Resources & Downloads';
  section.append(heading);

  const grid = document.createElement('ul');
  grid.className = 'product-downloads-grid';

  cells.slice(1).forEach((cell) => {
    if (!cell) return;
    const link = cell.querySelector('a');
    const label = cell.querySelector('h3, h4, strong, p')?.textContent?.trim()
      || link?.textContent?.trim()
      || '';
    if (!link || !label) return;

    const li = document.createElement('li');
    li.className = 'product-download-card';

    const a = document.createElement('a');
    a.href = link.href;
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = label;
    a.className = 'button secondary';

    li.append(a);
    grid.append(li);
  });

  if (grid.children.length) section.append(grid);
  return section;
}

function buildCta(cells) {
  const textCell = cells[1];
  if (!textCell) return null;

  const section = document.createElement('div');
  section.className = 'product-cta';

  const h = textCell.querySelector('h2, h3');
  if (h) {
    const heading = document.createElement('h2');
    heading.textContent = h.textContent.trim();
    section.append(heading);
  }

  const link = textCell.querySelector('a');
  if (link) {
    const a = document.createElement('a');
    a.href = link.href;
    a.textContent = link.textContent.trim();
    a.className = 'button primary';
    section.append(a);
  }

  return section;
}

export default function decorate(block) {
  const sections = [];

  [...block.children].forEach((row) => {
    const cells = [...row.children];
    const type = cells[0]?.textContent?.trim().toLowerCase();

    switch (type) {
      case 'hero':
        sections.push(buildHero(cells));
        break;
      case 'features':
        sections.push(buildFeatures(cells));
        break;
      case 'downloads':
        sections.push(buildDownloads(cells));
        break;
      case 'cta': {
        const cta = buildCta(cells);
        if (cta) sections.push(cta);
        break;
      }
      default:
        // Passthrough: render any unrecognized row as plain content
        if (cells.length >= 2) {
          const div = document.createElement('div');
          div.className = 'product-detail-section';
          cells.slice(1).forEach((c) => { div.innerHTML += c.innerHTML; });
          sections.push(div);
        }
    }
  });

  block.replaceChildren(...sections);
}
