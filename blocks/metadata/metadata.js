export default function decorate(block) {
  block.querySelectorAll(':scope > div').forEach((row) => {
    const [keyEl, valEl] = row.querySelectorAll(':scope > div');
    if (!keyEl || !valEl) return;
    const key = keyEl.textContent.trim().toLowerCase().replace(/\s+/g, '-');
    const val = valEl.textContent.trim();
    if (key === 'title') document.title = val;
    if (key === 'html-lang') document.documentElement.lang = val;
  });
  block.closest('.section')?.remove();
}
