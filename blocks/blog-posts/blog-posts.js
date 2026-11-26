import { createOptimizedPicture } from '../../scripts/aem.js';

async function fetchBlogIndex() {
  try {
    const resp = await fetch('/blog-index.json');
    if (!resp.ok) return [];
    const json = await resp.json();
    return Array.isArray(json.data) ? json.data : [];
  } catch {
    return [];
  }
}

function renderCard(post) {
  const {
    image, title, description, path, category, date,
  } = post;
  const li = document.createElement('li');
  li.className = 'blog-post-card';

  if (image) {
    const fig = document.createElement('figure');
    fig.className = 'blog-post-image';
    fig.append(createOptimizedPicture(image, title, false, [{ width: '400' }]));
    li.append(fig);
  }

  const body = document.createElement('div');
  body.className = 'blog-post-body';

  if (category) {
    const tag = document.createElement('span');
    tag.className = 'blog-post-category';
    tag.textContent = category;
    body.append(tag);
  }

  const h3 = document.createElement('h3');
  if (path) {
    const a = document.createElement('a');
    a.href = path;
    a.textContent = title;
    h3.append(a);
  } else {
    h3.textContent = title;
  }
  body.append(h3);

  if (description) {
    const p = document.createElement('p');
    p.className = 'blog-post-excerpt';
    p.textContent = description;
    body.append(p);
  }

  if (date) {
    const time = document.createElement('time');
    time.className = 'blog-post-date';
    time.textContent = date;
    body.append(time);
  }

  li.append(body);
  return li;
}

export default async function decorate(block) {
  const isAuto = !block.children.length || block.classList.contains('auto');
  const ul = document.createElement('ul');
  ul.className = 'blog-posts-list';

  if (isAuto) {
    block.classList.add('loading');
    const posts = await fetchBlogIndex();
    block.classList.remove('loading');

    posts.slice(0, 9).forEach((post) => ul.append(renderCard(post)));
  } else {
    [...block.children].forEach((row) => {
      const [imgCell, textCell] = [...row.children];
      const img = imgCell?.querySelector('img');
      const title = textCell?.querySelector('h2, h3, h4')?.textContent?.trim() || '';
      const link = textCell?.querySelector('a')?.href || '';
      const excerpt = textCell?.querySelector('p')?.textContent?.trim() || '';
      const date = textCell?.querySelector('time')?.textContent?.trim() || '';
      ul.append(renderCard({
        image: img?.src, title, path: link, description: excerpt, date,
      }));
    });
  }

  block.replaceChildren(ul);
}
