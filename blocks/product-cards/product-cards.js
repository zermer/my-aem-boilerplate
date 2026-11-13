import { createOptimizedPicture } from '../../scripts/aem.js';

/**
 * Product cards block.
 *
 * Supports two data sources:
 *  1. Authored rows in the document (from the importer).
 *  2. Auto mode ("product-cards (auto)" variant) — fetches /products.json
 *     when the block has no authored content, for JS-rendered catalog pages.
 */

async function fetchProductData() {
  try {
    const resp = await fetch('/products.json');
    if (!resp.ok) return [];
    const { data } = await resp.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function renderCard(imgSrc, imgAlt, title, link) {
  const li = document.createElement('li');
  li.className = 'product-card';

  const figure = document.createElement('figure');
  figure.className = 'product-card-image';
  if (imgSrc) {
    figure.append(createOptimizedPicture(imgSrc, imgAlt || title, false, [{ width: '400' }]));
  }

  const body = document.createElement('div');
  body.className = 'product-card-body';

  const h3 = document.createElement('h3');
  if (link) {
    const a = document.createElement('a');
    a.href = link;
    a.textContent = title;
    h3.append(a);
  } else {
    h3.textContent = title;
  }
  body.append(h3);

  li.append(figure, body);
  return li;
}

export default async function decorate(block) {
  const isAuto = block.classList.contains('auto');
  const ul = document.createElement('ul');

  if (isAuto || !block.children.length) {
    block.classList.add('loading');
    const products = await fetchProductData();
    block.classList.remove('loading');

    if (products.length) {
      products.forEach(({ image, title, path }) => {
        ul.append(renderCard(image, title, title, path));
      });
    } else {
      block.textContent = 'Products unavailable — please try again later.';
      return;
    }
  } else {
    [...block.children].forEach((row) => {
      const [imgCell, textCell] = [...row.children];
      const img = imgCell?.querySelector('img');
      const title = textCell?.querySelector('h2, h3, h4')?.textContent || '';
      const link = textCell?.querySelector('a')?.href || '';
      ul.append(renderCard(img?.src, img?.alt, title, link));
    });
  }

  block.replaceChildren(ul);
}
