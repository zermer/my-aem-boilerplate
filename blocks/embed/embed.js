/**
 * Embed block.
 *
 * Content in the block's first cell determines behaviour:
 *   - A URL (starts with http/https//)  → renders an <iframe>
 *   - marketo:MUNCHKIN_ID:FORM_ID       → loads Marketo Forms2 and renders the form
 *   - Any other text                    → treated as an HTML/script snippet injected via innerHTML
 */

function loadMarketo(block, munchkinId, formId) {
  const wrapper = document.createElement('div');
  wrapper.className = 'embed-marketo';

  const formEl = document.createElement('form');
  formEl.id = `mktoForm_${formId}`;
  wrapper.append(formEl);
  block.replaceChildren(wrapper);

  // Load Marketo Forms2 library once
  // James Hardie Marketo instance
  const instanceBase = '//lp-new.jameshardie.com';
  if (!document.querySelector('script[src*="forms2.min.js"]')) {
    const script = document.createElement('script');
    script.src = `${instanceBase}/js/forms2/js/forms2.min.js`;
    script.onload = () => {
      window.MktoForms2.loadForm(instanceBase, munchkinId, Number(formId));
    };
    document.head.append(script);
  } else if (window.MktoForms2) {
    window.MktoForms2.loadForm(instanceBase, munchkinId, Number(formId));
  }
}

function loadSnippet(block, snippet) {
  const wrapper = document.createElement('div');
  wrapper.className = 'embed-snippet';
  block.replaceChildren(wrapper);

  // Parse and re-execute any <script> tags (innerHTML doesn't execute them)
  const temp = document.createElement('div');
  temp.innerHTML = snippet;

  [...temp.childNodes].forEach((node) => {
    if (node.nodeName === 'SCRIPT') {
      const script = document.createElement('script');
      [...node.attributes].forEach((attr) => script.setAttribute(attr.name, attr.value));
      if (node.textContent) script.textContent = node.textContent;
      wrapper.append(script);
    } else {
      wrapper.append(node.cloneNode(true));
    }
  });
}

function loadIframe(block, url) {
  block.innerHTML = '';
  const iframe = document.createElement('iframe');
  iframe.src = url;
  iframe.title = 'Embedded content';
  iframe.setAttribute('loading', 'lazy');
  iframe.setAttribute('allowfullscreen', '');
  block.appendChild(iframe);
}

export default function decorate(block) {
  const raw = block.querySelector('div > div')?.innerHTML?.trim()
    || block.querySelector('div > div')?.textContent?.trim()
    || '';

  if (!raw) return;

  // marketo:MUNCHKIN_ID:FORM_ID shorthand
  const mktoMatch = raw.match(/^marketo:([^:]+):(\d+)$/i);
  if (mktoMatch) {
    loadMarketo(block, mktoMatch[1], mktoMatch[2]);
    return;
  }

  // Plain URL → iframe
  if (/^(https?:)?\/\//.test(raw) && !raw.includes('<')) {
    loadIframe(block, raw);
    return;
  }

  // HTML/script snippet → inject
  loadSnippet(block, raw);
}
