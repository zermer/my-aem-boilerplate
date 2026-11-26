import { createOptimizedPicture } from '../../scripts/aem.js';

export default function decorate(block) {
  const swatches = [...block.children].map((row) => {
    const [nameCell, imgCell] = [...row.children];
    const name = nameCell?.textContent?.trim() || '';
    const img = imgCell?.querySelector('img');
    return { name, src: img?.src || '', alt: img?.alt || name };
  }).filter((s) => s.src);

  if (!swatches.length) return;

  const list = document.createElement('ul');
  list.className = 'color-swatches-list';

  swatches.forEach(({ name, src, alt }, i) => {
    const li = document.createElement('li');
    li.className = 'color-swatch';
    li.setAttribute('data-color', name);
    li.setAttribute('title', name);
    if (i === 0) li.classList.add('selected');

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute('aria-label', name);
    btn.append(createOptimizedPicture(src, alt, false, [{ width: '48' }]));

    li.append(btn);
    list.append(li);

    btn.addEventListener('click', () => {
      list.querySelectorAll('.color-swatch').forEach((s) => s.classList.remove('selected'));
      li.classList.add('selected');
      // Dispatch event so product-detail hero can update
      block.dispatchEvent(new CustomEvent('swatch-select', { bubbles: true, detail: { name, src } }));
    });
  });

  block.replaceChildren(list);
}
