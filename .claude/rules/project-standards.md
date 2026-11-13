# Project Standards — James Hardie EDS

## Architecture (Locked — do not change without Eduardo's approval)
- Standard AEM Boilerplate 1.3.0 — no Crosswalk, no Universal Editor, no XCom
- DA.Live as sole content source; fstab.yaml: `url: https://da.live/zermer/my-aem-boilerplate`
- Block naming: kebab-case matching import.js names exactly
- No new npm runtime dependencies without approval

## Priority Work Order
1. Block CSS — hero, header, carousel, product-cards, media-with-text, blog-cards, cta-band (all missing CSS)
2. Font loading — Montserrat + Open Sans must be loaded via `styles/fonts.css`
3. products.json query index — required for product catalog pages
4. Visual QA — compare EDS preview to jameshardie.com at mobile/tablet/desktop
5. Publish to live CDN — requires Eduardo's approval

## Repository
- GitHub: `zermer/my-aem-boilerplate` (public, main branch)
- Preview: `https://main--my-aem-boilerplate--zermer.aem.page/`
- 309 of 329 pages are previewed; 20 have pending 409 cache conflicts (retry with `retry-preview.mjs`)

## Team
- Eduardo: tech lead, approves architecture decisions and go-live
- Deloitte Digital team: EDS block development
- Client (James Hardie): content authors on DA.Live (access not yet provisioned)
