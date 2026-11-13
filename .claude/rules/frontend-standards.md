# Frontend Standards — James Hardie EDS

## Block Structure
- Every block lives in `blocks/<name>/<name>.js` and `blocks/<name>/<name>.css`
- CSS is loaded automatically by EDS when the file exists — no import needed
- JS exports a single `default function decorate(block)` — no other exports
- Block variants use `block.classList.contains('<variant>')` — never check `block.dataset`

## CSS Conventions
- Write mobile-first: base styles target mobile, then `@media (width >= 600px)` for tablet, `@media (width >= 900px)` for desktop
- Use CSS custom properties from `styles/styles.css` — never hardcode brand colors or fonts
  - JH Red: `var(--accent-color)` (#d50f27)
  - Headings: `var(--heading-font-family)` (Montserrat)
  - Body: `var(--body-font-family)` (Open Sans)
  - Nav height offset: `var(--nav-height)` (64px)
- Scope all block selectors to `.block-name { }` — never use global selectors inside a block CSS file
- Use `max-width: 1200px; margin: auto; padding: 0 24px` for content containers (matches EDS section wrapper)
- Avoid `!important` — fix specificity instead

## Responsive Breakpoints
- Mobile: `< 600px` — single column, touch targets ≥ 44px, hamburger nav visible
- Tablet: `600px – 900px` — 2-column layouts where appropriate
- Desktop: `≥ 900px` — full multi-column layouts, mega-menu visible

## Accessibility
- Every `<img>` needs a non-empty `alt` attribute (or `alt=""` for decorative images)
- Interactive elements need visible focus styles — do not remove `outline`
- Buttons need `aria-label` when text is not descriptive (e.g., prev/next carousel buttons)
- Use semantic HTML: `<nav>`, `<main>`, `<section>`, `<article>`, `<button>` — not `<div>` for interactive elements
- Color contrast: text on JH Red background must be white (`#fff`); do not use light gray

## JavaScript Conventions
- ES modules only — `import` / `export`, no CommonJS
- File extensions required in imports: `import x from './x.js'`
- No `var` — use `const` and `let`
- Airbnb-base ESLint rules apply; run `npm run lint:js` before committing
- Do not modify `scripts/aem.js` — it is the upstream EDS runtime

## Block-Specific Notes
- `hero`: two-column table in DA.Live (image/video | text). Video variant: `<video autoplay muted loop playsinline>`. Always optimize images with `createOptimizedPicture`.
- `header`: reads `/nav` fragment from DA.Live. Desktop breakpoint: 900px. Mobile: hamburger with `aria-expanded`.
- `product-cards (auto)`: fetches `/products.json` at runtime — this endpoint must exist as a query index.
- `carousel`: must be keyboard-navigable (arrow keys) and have `aria-live="polite"` on the active slide region.
- `media-with-text`: stacks vertically on mobile; side-by-side on desktop. Reversed variant: `block.classList.contains('reversed')`.
