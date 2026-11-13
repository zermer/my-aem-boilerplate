export default function decorate(block) {
  const nav = document.createElement('nav');
  nav.setAttribute('aria-label', 'Breadcrumb');

  const ol = document.createElement('ol');
  const cell = block.firstElementChild?.firstElementChild;
  if (!cell) return;

  [...cell.children].forEach((child, i, arr) => {
    const li = document.createElement('li');
    if (child.tagName === 'A') {
      li.append(child.cloneNode(true));
    } else {
      li.textContent = child.textContent;
      li.setAttribute('aria-current', 'page');
    }
    if (i < arr.length - 1) {
      li.setAttribute('data-sep', '/');
    }
    ol.append(li);
  });

  nav.append(ol);
  block.replaceChildren(nav);
}
