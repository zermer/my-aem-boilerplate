# Data Standards — James Hardie EDS

## DA.Live Content Model
- All pages are HTML files stored in DA.Live at `https://da.live/zermer/my-aem-boilerplate`
- Files must be PUT with `.html` extension: `PUT /source/zermer/my-aem-boilerplate/{path}.html`
- Path separator in flat filenames: `--` maps to `/` (e.g., `why-james-hardie--overview.html` → `/why-james-hardie/overview`)

## Block Authoring Table Format (DA.Live → EDS)
```
| block-name        |            |
|-------------------|------------|
| cell content row 1| col 2 row 1|
| cell content row 2| col 2 row 2|
```
- First row: block name (and optional variant in parentheses, e.g., `hero (video)`)
- Remaining rows: content cells

## Query Index (`/products.json`)
- Required for `product-cards (auto)` variant
- Must be created as a Sheets file or `helix-query.yaml` in DA.Live
- Schema: `path`, `title`, `image`, `description`, `category` minimum fields
- Status: **not yet created** — this is a known gap

## Metadata Fields (page-level)
Standard EDS metadata block fields used in this project:
- `title` — page title (also sets `<title>` and OG title)
- `description` — meta description
- `image` — OG image
- `template` — page template variant (if any)
- `nav` — custom nav path (defaults to `/nav`)

## Image Conventions
- Always use `createOptimizedPicture()` from `scripts/aem.js` for block images
- Unwrap `/_next/image/` wrappers from Contentful URLs to direct `images.ctfassets.net` URLs
- Bynder `.tif` URLs are acceptable — EDS handles format conversion
- Responsive widths for hero: `[{ width: '1200' }, { width: '750' }]`
