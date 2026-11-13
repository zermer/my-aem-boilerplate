import { createOptimizedPicture } from '../../scripts/aem.js';

export default function decorate(block) {
  block.querySelectorAll('picture > img').forEach((img) => {
    img.closest('picture').replaceWith(
      createOptimizedPicture(img.src, img.alt, false, [{ width: '750' }, { width: '1200' }]),
    );
  });

  // "reverse" variant flips image to the right
  if (block.classList.contains('reverse')) {
    const row = block.firstElementChild;
    if (row && row.children.length === 2) {
      row.append(row.firstElementChild);
    }
  }

  block.querySelectorAll('em a').forEach((a) => a.classList.add('button', 'secondary'));
  block.querySelectorAll('strong a').forEach((a) => a.classList.add('button', 'primary'));
}
