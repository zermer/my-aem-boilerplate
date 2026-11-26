export default function decorate(block) {
  const url = block.querySelector('div > div')?.textContent?.trim();
  if (!url) return;

  block.innerHTML = '';

  const iframe = document.createElement('iframe');
  iframe.src = url;
  iframe.title = 'Embedded content';
  iframe.setAttribute('loading', 'lazy');
  iframe.setAttribute('allowfullscreen', '');
  block.appendChild(iframe);
}
