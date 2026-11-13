import { createOptimizedPicture } from '../../scripts/aem.js';

export default function decorate(block) {
  const ul = document.createElement('ul');

  [...block.children].forEach((row) => {
    const li = document.createElement('li');
    li.className = 'blog-card';

    const [imgCell, textCell] = [...row.children];

    if (imgCell) {
      const figure = document.createElement('figure');
      figure.className = 'blog-card-image';
      imgCell.querySelectorAll('picture > img').forEach((img) => {
        imgCell.querySelector('picture').replaceWith(
          createOptimizedPicture(img.src, img.alt, false, [{ width: '750' }]),
        );
      });
      figure.append(...imgCell.children);
      li.append(figure);
    }

    if (textCell) {
      const body = document.createElement('div');
      body.className = 'blog-card-body';
      body.append(...textCell.children);
      li.append(body);
    }

    ul.append(li);
  });

  block.replaceChildren(ul);
}
