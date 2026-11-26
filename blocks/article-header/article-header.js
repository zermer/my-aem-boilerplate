import { createOptimizedPicture } from '../../scripts/aem.js';

export default function decorate(block) {
  const [imgCell, textCell] = [...block.children[0]?.children || []];

  const wrapper = document.createElement('div');
  wrapper.className = 'article-header-inner';

  // Hero image (may be absent on older articles)
  const img = imgCell?.querySelector('img');
  if (img) {
    const figure = document.createElement('figure');
    figure.className = 'article-header-hero';
    figure.append(createOptimizedPicture(img.src, img.alt, true, [{ width: '1200' }]));
    wrapper.append(figure);
  }

  // Text content: h1, date, author
  const textDiv = document.createElement('div');
  textDiv.className = 'article-header-text';

  const h1 = textCell?.querySelector('h1');
  const time = textCell?.querySelector('time');
  const authorEl = textCell?.querySelector('h6');

  if (h1) textDiv.append(h1.cloneNode(true));

  if (time || authorEl) {
    const meta = document.createElement('p');
    meta.className = 'article-header-meta';
    if (time) {
      const t = document.createElement('time');
      t.textContent = time.textContent.trim();
      if (time.getAttribute('datetime')) t.setAttribute('datetime', time.getAttribute('datetime'));
      meta.append(t);
    }
    if (authorEl) {
      if (time) meta.append(document.createTextNode(' · '));
      const span = document.createElement('span');
      span.className = 'article-header-author';
      span.textContent = authorEl.textContent.trim();
      meta.append(span);
    }
    textDiv.append(meta);
  }

  wrapper.append(textDiv);
  block.replaceChildren(wrapper);
}
