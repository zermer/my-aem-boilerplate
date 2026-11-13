/*
 * James Hardie → AEM EDS Import Rules
 *
 * Transforms jameshardie.com (Next.js + Contentful) pages into EDS document format.
 * Key constraints discovered from DOM analysis:
 *  - All images are wrapped in /_next/image/?url=<ctfassets-url>&w=...&q=... — must unwrap
 *  - Product catalog cards are JS-rendered (empty in static HTML) — handled via JSON export path
 *  - Homepage has a video hero with Pause button
 *  - Two carousels on homepage; EDS needs a custom carousel block
 *  - Blog article bodies are clean document-style HTML — no block transform needed
 */

/* ─── Image URL normalization ────────────────────────────────────────────────── */

/**
 * Next.js wraps Contentful CDN images in its own optimization API.
 * Unwrap to get the original URL so EDS can re-optimize through its own CDN.
 */
function unwrapNextImage(src) {
  if (!src) return src;
  try {
    if (src.includes('/_next/image')) {
      const url = new URL(src, 'https://www.jameshardie.com');
      const encoded = url.searchParams.get('url');
      if (encoded) return decodeURIComponent(encoded);
    }
  } catch {
    // keep original on parse failure
  }
  return src;
}

function normalizeImages(root) {
  root.querySelectorAll('img').forEach((img) => {
    img.src = unwrapNextImage(img.src);
    img.removeAttribute('srcset'); // Next.js srcset is useless outside its CDN
  });
  root.querySelectorAll('source').forEach((source) => {
    if (source.srcset) source.srcset = unwrapNextImage(source.srcset.split(',')[0].trim().split(' ')[0]);
  });
}

/* ─── Block table builder ────────────────────────────────────────────────────── */

function buildBlock(blockName, rows) {
  const table = document.createElement('table');
  const thead = document.createElement('tr');
  const th = document.createElement('th');
  th.colSpan = Math.max(...rows.map((r) => r.length), 1);
  th.textContent = blockName;
  thead.append(th);
  table.append(thead);
  rows.forEach((row) => {
    const tr = document.createElement('tr');
    row.forEach((cell) => {
      const td = document.createElement('td');
      if (cell instanceof Element) td.append(cell);
      else if (cell !== null && cell !== undefined) td.innerHTML = String(cell);
      tr.append(td);
    });
    table.append(tr);
  });
  return table;
}

/* ─── Chrome removal ─────────────────────────────────────────────────────────── */

function removeChrome(doc) {
  [
    'header', 'footer', 'nav[aria-label="Main Navigation"]',
    '#onetrust-consent-sdk', '.onetrust-pc-dark-filter',
    '#hubspot-messages-iframe-container',
    '[class*="sticky"]', '[class*="Sticky"]',
    '[class*="skip"]', '[class*="Skip"]',
    '[class*="back-to-top"]', '[class*="BackToTop"]',
    '[class*="cookie"]', '[class*="Cookie"]',
  ].forEach((sel) => doc.querySelectorAll(sel).forEach((el) => el.remove()));
}

/* ─── Metadata block ─────────────────────────────────────────────────────────── */

function buildMetadata(doc, extra = {}) {
  const fields = {
    title: doc.querySelector('title')?.textContent?.replace(/\s*\|\s*James Hardie.*$/, '').trim() || '',
    description: doc.querySelector('meta[name="description"]')?.content || '',
    image: unwrapNextImage(doc.querySelector('meta[property="og:image"]')?.content || ''),
    ...extra,
  };
  const rows = Object.entries(fields).filter(([, v]) => v).map(([k, v]) => [k, v]);
  return rows.length ? buildBlock('metadata', rows) : null;
}

/* ─── Path computation ───────────────────────────────────────────────────────── */

function computePath(url) {
  const { pathname } = new URL(url);
  return pathname.endsWith('/') && pathname !== '/' ? pathname.slice(0, -1) : pathname;
}

function getPageType(url) {
  const path = new URL(url).pathname;
  if (path === '/' || path === '') return 'homepage';
  if (/^\/blog\/[^/]+\/[^/]/.test(path)) return 'blog-article';
  if (path.startsWith('/blog')) return 'blog-index';
  if (/^\/product-catalog\/.+/.test(path)) return 'product-detail';
  if (path.startsWith('/product-catalog')) return 'product-index';
  if (path.startsWith('/color-design-guidance')) return 'color-guidance';
  if (path.startsWith('/find-a-contractor') || path.startsWith('/find-dealer')) return 'find-contractor';
  if (path.startsWith('/hardie-designer')) return 'embedded-tool';
  return 'marketing';
}

/* ─── Shared extractors ──────────────────────────────────────────────────────── */

/**
 * Hero — JH uses a background video or image with H1 + body + CTA.
 * DOM: <section class="*Hero*"><video|img> + <div class="*content*"><h1>...</div>
 */
function extractHero(doc) {
  const heroSection = doc.querySelector(
    '[class*="Hero"], [class*="hero"], [class*="Banner"]:not([class*="cookie"]):not([class*="consent"])',
  );
  if (!heroSection) return null;

  const video = heroSection.querySelector('video source, video');
  const img = heroSection.querySelector('img');
  const h1 = heroSection.querySelector('h1');
  const sub = heroSection.querySelector('p');
  const cta = heroSection.querySelector('a');

  const mediaCell = document.createElement('div');
  if (video) {
    // Represent video as a link to the source — EDS hero CSS handles video via autoplay attr
    const videoSrc = video.src || video.querySelector('source')?.src || video.getAttribute('src') || '';
    if (videoSrc) {
      const a = document.createElement('a');
      a.href = videoSrc;
      a.textContent = videoSrc;
      mediaCell.append(a);
    }
  } else if (img) {
    normalizeImages(heroSection);
    const pic = document.createElement('picture');
    pic.append(img.cloneNode(true));
    mediaCell.append(pic);
  }

  const textCell = document.createElement('div');
  if (h1) textCell.append(h1.cloneNode(true));
  if (sub && sub.textContent.trim()) textCell.append(sub.cloneNode(true));
  if (cta) {
    const p = document.createElement('p');
    const strong = document.createElement('strong');
    strong.append(cta.cloneNode(true));
    p.append(strong);
    textCell.append(p);
  }

  heroSection.remove();
  // Use "hero (video)" variant name when video is present
  return buildBlock(video ? 'hero (video)' : 'hero', [[mediaCell, textCell]]);
}

/**
 * Carousels — JH homepage has two: product explore + feature highlights.
 * DOM: <section>heading + <div class="*carousel*|*Carousel*|*slider*">items</div>
 */
function extractCarousel(doc, containerSelector, blockName = 'carousel') {
  const container = doc.querySelector(containerSelector);
  if (!container) return null;

  normalizeImages(container);
  const items = [...container.querySelectorAll(
    '[class*="slide"], [class*="Slide"], [class*="item"]:not(li[class*="nav"]), [class*="card"]',
  )].filter((el) => el.children.length > 0);

  if (!items.length) return null;

  const rows = items.map((item) => {
    const img = item.querySelector('img');
    const title = item.querySelector('h2, h3, h4, [class*="title"], [class*="Title"]');
    const desc = item.querySelector('p:not(:empty)');
    const link = item.querySelector('a');

    const imgCell = document.createElement('div');
    if (img) {
      const pic = document.createElement('picture');
      pic.append(img.cloneNode(true));
      imgCell.append(pic);
    }

    const textCell = document.createElement('div');
    if (title) textCell.append(title.cloneNode(true));
    if (desc) textCell.append(desc.cloneNode(true));
    if (link) {
      const p = document.createElement('p');
      const a = link.cloneNode(true);
      p.append(a);
      textCell.append(p);
    }

    return [imgCell, textCell];
  });

  container.closest('section')?.remove() || container.remove();
  return buildBlock(blockName, rows);
}

/**
 * Media-with-text — alternating image + copy sections (Why JH, blog promo sections).
 * Returns an array of blocks (one per section pair found).
 */
function extractMediaWithText(doc) {
  const blocks = [];
  const sections = doc.querySelectorAll(
    '[class*="feature-block"], [class*="FeatureBlock"], [class*="media-text"], [class*="MediaText"], [class*="split-section"]',
  );
  sections.forEach((section) => {
    normalizeImages(section);
    const img = section.querySelector('img');
    const title = section.querySelector('h2, h3');
    const body = section.querySelector('p:not(:empty)');
    const cta = section.querySelector('a');
    const stat = section.querySelector('[class*="stat"], [class*="Stat"]');

    if (!title && !img) return;

    const imgCell = document.createElement('div');
    if (img) {
      const pic = document.createElement('picture');
      pic.append(img.cloneNode(true));
      imgCell.append(pic);
    }

    const textCell = document.createElement('div');
    if (title) textCell.append(title.cloneNode(true));
    if (stat) textCell.append(stat.cloneNode(true));
    if (body) textCell.append(body.cloneNode(true));
    if (cta) {
      const p = document.createElement('p');
      const em = document.createElement('em');
      em.append(cta.cloneNode(true));
      p.append(em);
      textCell.append(p);
    }

    // Detect image position from CSS class
    const isImageRight = /right/i.test(section.className);
    const row = isImageRight ? [textCell, imgCell] : [imgCell, textCell];
    blocks.push(buildBlock('media-with-text', [row]));
    section.remove();
  });
  return blocks;
}

/**
 * Blog cards — article card grids/carousels with image, title, category, link.
 */
function extractBlogCards(doc, containerSelector) {
  const container = doc.querySelector(containerSelector);
  if (!container) return null;

  normalizeImages(container);
  const articles = [...container.querySelectorAll(
    'article, [class*="article-card"], [class*="ArticleCard"], [class*="blog-card"], [class*="BlogCard"]',
  )].slice(0, 9);

  if (!articles.length) return null;

  const rows = articles.map((article) => {
    const img = article.querySelector('img');
    const title = article.querySelector('h2, h3, h4, [class*="title"]');
    const category = article.querySelector('[class*="category"], [class*="Category"]');
    const link = article.querySelector('a[href]');

    const imgCell = document.createElement('div');
    if (img) {
      const pic = document.createElement('picture');
      pic.append(img.cloneNode(true));
      imgCell.append(pic);
    }

    const textCell = document.createElement('div');
    if (category) {
      const p = document.createElement('p');
      p.append(category.cloneNode(true));
      textCell.append(p);
    }
    if (title) textCell.append(title.cloneNode(true));
    if (link) {
      const p = document.createElement('p');
      const a = link.cloneNode(true);
      a.textContent = a.textContent || 'Read more';
      p.append(a);
      textCell.append(p);
    }

    return [imgCell, textCell];
  });

  container.closest('section')?.remove() || container.remove();
  return buildBlock('blog-cards', rows);
}

/**
 * CTA banner — full-width accent strip with heading + button.
 */
function extractCtaBanner(doc) {
  const selectors = [
    '[class*="cta-banner"]', '[class*="CtaBanner"]', '[class*="cta-strip"]',
    '[class*="PromoBar"]', '[class*="CallToAction"]', '[class*="renovation-cta"]',
  ];
  for (const sel of selectors) {
    const el = doc.querySelector(sel);
    if (!el) continue;
    normalizeImages(el);
    const img = el.querySelector('img');
    const title = el.querySelector('h2, h3');
    const body = el.querySelector('p:not(:empty)');
    const cta = el.querySelector('a');

    const imgCell = document.createElement('div');
    if (img) {
      const pic = document.createElement('picture');
      pic.append(img.cloneNode(true));
      imgCell.append(pic);
    }

    const textCell = document.createElement('div');
    if (title) textCell.append(title.cloneNode(true));
    if (body) textCell.append(body.cloneNode(true));
    if (cta) {
      const p = document.createElement('p');
      const strong = document.createElement('strong');
      strong.append(cta.cloneNode(true));
      p.append(strong);
      textCell.append(p);
    }

    el.remove();
    return img ? buildBlock('cta-banner', [[imgCell, textCell]]) : buildBlock('cta-banner', [[textCell]]);
  }
  return null;
}

/**
 * Footnotes — small asterisked legal/source copy at page bottom.
 */
function extractFootnotes(doc) {
  const el = doc.querySelector('[class*="footnote"], [class*="Footnote"], [class*="legal-copy"], [class*="disclaimer"]');
  if (!el) return null;
  const cell = document.createElement('div');
  cell.append(el.cloneNode(true));
  el.remove();
  return buildBlock('footnotes', [[cell]]);
}

/* ─── Page-type transformers ─────────────────────────────────────────────────── */

function transformHomepage(doc) {
  const main = document.createElement('main');

  const hero = extractHero(doc);
  if (hero) main.append(hero);

  // Product explore carousel
  const productCarousel = extractCarousel(
    doc,
    '[class*="product-carousel"], [class*="ProductCarousel"], [class*="explore"]',
    'carousel',
  );
  if (productCarousel) main.append(productCarousel);

  // "What sets us apart" feature carousel
  const featureCarousel = extractCarousel(
    doc,
    '[class*="feature-carousel"], [class*="FeatureCarousel"], [class*="sets-apart"], [class*="SetsApart"]',
    'feature-carousel',
  );
  if (featureCarousel) main.append(featureCarousel);

  // Hardie Designer feature steps
  const designerSection = doc.querySelector('[class*="designer"], [class*="Designer"]:not([class*="Hardie"]~*)');
  if (designerSection) {
    const steps = [...designerSection.querySelectorAll('[class*="step"], [class*="Step"]')];
    if (steps.length) {
      const rows = steps.map((step) => {
        normalizeImages(step);
        const img = step.querySelector('img');
        const title = step.querySelector('h3, h4, [class*="title"]');
        const desc = step.querySelector('p');
        const imgCell = document.createElement('div');
        if (img) { const pic = document.createElement('picture'); pic.append(img.cloneNode(true)); imgCell.append(pic); }
        const textCell = document.createElement('div');
        if (title) textCell.append(title.cloneNode(true));
        if (desc) textCell.append(desc.cloneNode(true));
        return [imgCell, textCell];
      });
      main.append(buildBlock('feature-steps', rows));
    }
    designerSection.remove();
  }

  // Social proof / stats
  const stats = doc.querySelector('[class*="social-proof"], [class*="SocialProof"], [class*="stat-band"]');
  if (stats) {
    const statText = document.createElement('div');
    statText.append(stats.cloneNode(true));
    main.append(buildBlock('stats', [[statText]]));
    stats.remove();
  }

  // Blog cards carousel
  const blogCards = extractBlogCards(doc,
    '[class*="blog-carousel"], [class*="BlogCarousel"], [class*="article-carousel"], [class*="resources-section"]');
  if (blogCards) main.append(blogCards);

  const footnotes = extractFootnotes(doc);
  if (footnotes) main.append(footnotes);

  const metadata = buildMetadata(doc, { template: 'homepage' });
  if (metadata) main.append(metadata);

  return main;
}

function transformBlogArticle(doc) {
  const main = document.createElement('main');

  // Breadcrumb
  const breadcrumb = doc.querySelector('nav[aria-label*="breadcrumb"], nav[aria-label*="Breadcrumb"], ol[class*="breadcrumb"]');
  if (breadcrumb) {
    const links = [...breadcrumb.querySelectorAll('a, li:last-child')].map((el) => el.cloneNode(true));
    if (links.length) {
      const cell = document.createElement('div');
      links.forEach((l) => cell.append(l));
      main.append(buildBlock('breadcrumb', [[cell]]));
    }
    breadcrumb.remove();
  }

  // Article header: hero image + H1 + date + author
  const h1 = doc.querySelector('h1');
  const heroImg = doc.querySelector('[class*="hero"] img, [class*="featured"] img');
  const dateEl = doc.querySelector('time');
  const authorEl = doc.querySelector('h6, [class*="author"], [class*="Author"]');

  const headerMediaCell = document.createElement('div');
  if (heroImg) {
    normalizeImages(heroImg.closest('picture') || heroImg.parentElement);
    const pic = document.createElement('picture');
    pic.append(heroImg.cloneNode(true));
    headerMediaCell.append(pic);
    heroImg.closest('section, div[class*="hero"], figure')?.remove();
  }

  const headerTextCell = document.createElement('div');
  if (h1) { headerTextCell.append(h1.cloneNode(true)); h1.remove(); }
  if (dateEl) { const p = document.createElement('p'); p.append(dateEl.cloneNode(true)); headerTextCell.append(p); }
  if (authorEl) { headerTextCell.append(authorEl.cloneNode(true)); authorEl.remove(); }

  main.append(buildBlock('article-header', [[headerMediaCell, headerTextCell]]));

  // Article body — EDS renders this as native rich text, no block needed
  const articleBody = doc.querySelector('article, [class*="article-body"], [class*="ArticleBody"]')
    || doc.querySelector('main');
  if (articleBody) {
    normalizeImages(articleBody);
    // Remove share / social elements embedded in body
    articleBody.querySelectorAll('[class*="share"], [class*="Share"], [class*="social-links"]').forEach((el) => el.remove());
    [...articleBody.children].forEach((child) => main.append(child.cloneNode(true)));
  }

  const footnotes = extractFootnotes(doc);
  if (footnotes) main.append(footnotes);

  const publishDate = dateEl?.getAttribute('datetime') || dateEl?.textContent?.trim() || '';
  const category = doc.querySelector('[class*="category"], [class*="Category"]')?.textContent?.trim() || '';
  const metadata = buildMetadata(doc, { template: 'blog-article', 'publish-date': publishDate, category });
  if (metadata) main.append(metadata);

  return main;
}

function transformBlogIndex(doc) {
  const main = document.createElement('main');

  const hero = extractHero(doc);
  if (hero) main.append(hero);

  // Topic filter links
  const filterNav = doc.querySelector('[class*="topic-filter"], [class*="TopicFilter"], [class*="category-nav"]');
  if (filterNav) {
    const links = [...filterNav.querySelectorAll('a')].map((a) => {
      const p = document.createElement('p');
      p.append(a.cloneNode(true));
      return p;
    });
    if (links.length) {
      const cell = document.createElement('div');
      links.forEach((l) => cell.append(l));
      main.append(buildBlock('topic-filter', [[cell]]));
    }
    filterNav.remove();
  }

  // Article cards
  const cards = extractBlogCards(doc,
    '[class*="article-list"], [class*="ArticleList"], [class*="posts-grid"], [class*="blog-list"]');
  if (cards) main.append(cards);

  // Media-with-text promo sections (Color & Design, Re-side guide)
  extractMediaWithText(doc).forEach((block) => main.append(block));

  // Featured project carousel
  const featured = extractCarousel(doc, '[class*="featured-project"], [class*="FeaturedProject"]', 'carousel');
  if (featured) main.append(featured);

  const cta = extractCtaBanner(doc);
  if (cta) main.append(cta);

  const metadata = buildMetadata(doc, { template: 'blog-index' });
  if (metadata) main.append(metadata);

  return main;
}

function transformProductIndex(doc) {
  const main = document.createElement('main');

  // Text-only hero (no image on product index)
  const h1 = doc.querySelector('h1');
  const intro = doc.querySelector('h1 + p, h1 ~ p');
  if (h1) {
    const cell = document.createElement('div');
    cell.append(h1.cloneNode(true));
    if (intro) cell.append(intro.cloneNode(true));
    main.append(buildBlock('hero', [[cell]]));
    h1.remove();
    intro?.remove();
  }

  // Product filter
  const filterEl = doc.querySelector('[class*="filter"], [class*="Filter"]');
  if (filterEl) {
    const cell = document.createElement('div');
    cell.append(filterEl.cloneNode(true));
    main.append(buildBlock('product-filter', [[cell]]));
    filterEl.remove();
  }

  // Product cards — NOTE: these are JS-rendered and may be empty.
  // If empty, the block is a placeholder; actual content comes from the
  // product JSON feed (/products.json) generated by AEM content fragments.
  const productGrid = doc.querySelector('[class*="product-grid"], [class*="ProductGrid"], [class*="catalog-grid"]');
  if (productGrid && productGrid.querySelectorAll('[class*="card"], [class*="Card"]').length) {
    normalizeImages(productGrid);
    const items = [...productGrid.querySelectorAll('[class*="card"], [class*="Card"]')].slice(0, 24);
    const rows = items.map((item) => {
      const img = item.querySelector('img');
      const title = item.querySelector('h2, h3, h4, [class*="title"]');
      const link = item.querySelector('a');
      const imgCell = document.createElement('div');
      if (img) { const pic = document.createElement('picture'); pic.append(img.cloneNode(true)); imgCell.append(pic); }
      const textCell = document.createElement('div');
      if (title) textCell.append(title.cloneNode(true));
      if (link) { const p = document.createElement('p'); p.append(link.cloneNode(true)); textCell.append(p); }
      return [imgCell, textCell];
    });
    main.append(buildBlock('product-cards', rows));
    productGrid.remove();
  } else {
    // JS-rendered empty — emit placeholder block; content populated post-import via JSON
    main.append(buildBlock('product-cards (auto)', [['']]));
  }

  const cta = extractCtaBanner(doc);
  if (cta) main.append(cta);

  const footnotes = extractFootnotes(doc);
  if (footnotes) main.append(footnotes);

  const metadata = buildMetadata(doc, { template: 'product-index' });
  if (metadata) main.append(metadata);

  return main;
}

function transformProductDetail(doc) {
  const main = document.createElement('main');

  const hero = extractHero(doc);
  if (hero) main.append(hero);

  // Product specs / details
  const specs = doc.querySelector('[class*="spec"], [class*="Spec"], [class*="detail-section"]');
  if (specs) {
    normalizeImages(specs);
    const cell = document.createElement('div');
    cell.append(specs.cloneNode(true));
    main.append(buildBlock('columns', [[cell]]));
    specs.remove();
  }

  // Color swatches
  const swatchContainer = doc.querySelector('[class*="color-selector"], [class*="ColorSelector"], [class*="swatch"]');
  if (swatchContainer) {
    normalizeImages(swatchContainer);
    const swatches = [...swatchContainer.querySelectorAll('[class*="color-item"], [class*="ColorItem"], button[aria-label]')].slice(0, 24);
    const rows = swatches.map((s) => {
      const img = s.querySelector('img');
      const name = s.getAttribute('aria-label') || s.querySelector('span')?.textContent || '';
      const imgCell = document.createElement('div');
      if (img) { const pic = document.createElement('picture'); pic.append(img.cloneNode(true)); imgCell.append(pic); }
      return [imgCell, name];
    });
    if (rows.length) main.append(buildBlock('color-swatches', rows));
    swatchContainer.remove();
  }

  extractMediaWithText(doc).forEach((block) => main.append(block));

  const cta = extractCtaBanner(doc);
  if (cta) main.append(cta);

  const footnotes = extractFootnotes(doc);
  if (footnotes) main.append(footnotes);

  const metadata = buildMetadata(doc, { template: 'product-detail' });
  if (metadata) main.append(metadata);

  return main;
}

function transformColorGuidance(doc) {
  const main = document.createElement('main');

  const hero = extractHero(doc);
  if (hero) main.append(hero);

  extractMediaWithText(doc).forEach((block) => main.append(block));

  const colorCards = extractBlogCards(doc, '[class*="color-collection"], [class*="ColorCollection"], [class*="palette-grid"]');
  if (colorCards) main.append(colorCards);

  const cta = extractCtaBanner(doc);
  if (cta) main.append(cta);

  const metadata = buildMetadata(doc, { template: 'color-guidance' });
  if (metadata) main.append(metadata);

  return main;
}

function transformEmbeddedTool(doc, toolUrl) {
  const main = document.createElement('main');
  const h1 = doc.querySelector('h1');
  if (h1) { main.append(h1.cloneNode(true)); }
  main.append(buildBlock('embed', [[toolUrl]]));
  const metadata = buildMetadata(doc, { template: 'embedded-tool' });
  if (metadata) main.append(metadata);
  return main;
}

function transformMarketing(doc) {
  const main = document.createElement('main');

  const hero = extractHero(doc);
  if (hero) main.append(hero);

  extractMediaWithText(doc).forEach((block) => main.append(block));

  // Remaining body content
  const body = doc.querySelector('[class*="page-content"], [class*="PageContent"], [class*="content-area"]')
    || doc.querySelector('main');
  if (body) {
    normalizeImages(body);
    body.querySelectorAll('[class*="share"], [class*="social"], [class*="sticky"]').forEach((el) => el.remove());
    [...body.children].forEach((child) => {
      if (child.tagName !== 'TABLE') main.append(child.cloneNode(true)); // avoid re-importing our own tables
    });
  }

  const cta = extractCtaBanner(doc);
  if (cta) main.append(cta);

  const footnotes = extractFootnotes(doc);
  if (footnotes) main.append(footnotes);

  const metadata = buildMetadata(doc, { template: 'marketing' });
  if (metadata) main.append(metadata);

  return main;
}

/* ─── Main export ────────────────────────────────────────────────────────────── */

export default {
  preprocess: ({ document: doc }) => {
    // Extract Next.js data bundle for potential downstream use
    const nextDataEl = doc.querySelector('script#__NEXT_DATA__');
    if (nextDataEl) {
      try {
        window.__JH_NEXT__ = JSON.parse(nextDataEl.textContent);
      } catch { /* non-critical */ }
    }
  },

  transform: ({ document: doc, url }) => {
    removeChrome(doc);
    normalizeImages(doc.body);

    const pageType = getPageType(url);
    const path = computePath(url);

    const result = (() => {
      switch (pageType) {
        case 'homepage': return transformHomepage(doc);
        case 'blog-article': return transformBlogArticle(doc);
        case 'blog-index': return transformBlogIndex(doc);
        case 'product-index': return transformProductIndex(doc);
        case 'product-detail': return transformProductDetail(doc);
        case 'color-guidance': return transformColorGuidance(doc);
        case 'find-contractor': return transformEmbeddedTool(doc, 'https://www.jameshardie.com/find-a-contractor');
        case 'embedded-tool': return transformEmbeddedTool(doc, url);
        default: return transformMarketing(doc);
      }
    })();

    return [{ element: result, path }];
  },
};
