export default function decorate(block) {
  const url = block.querySelector('div > div')?.textContent?.trim();
  if (url) window.location.replace(url);
}
