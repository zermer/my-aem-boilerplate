# Delivery Standards — James Hardie EDS

## Commit Convention
- Format: `<type>: <short imperative description>`
- Types: `feat` (new block/feature), `fix` (bug), `style` (CSS only), `refactor`, `chore` (tooling/config), `docs`
- Subject ≤ 72 characters, lowercase, no trailing period
- End every commit with: `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>`
- Never use `--no-verify` — fix the lint error instead

## Pre-Commit Gate
- Run `npm run lint` before every commit; fix all errors
- CSS changes: also run `npm run lint:css`
- Commits to `main` require CI to pass (GitHub Actions runs lint on push)

## Branch Strategy
- Feature work: `feat/<short-description>`
- Fixes: `fix/<short-description>`
- Never force-push to `main`

## EDS Preview → Publish Workflow
1. Edit content in DA.Live (`https://da.live/#/zermer/my-aem-boilerplate`)
2. Trigger preview: `POST https://admin.hlx.page/preview/zermer/my-aem-boilerplate/main/{path}`
3. Verify at: `https://main--my-aem-boilerplate--zermer.aem.page/{path}`
4. Publish to CDN: `POST https://admin.hlx.page/live/zermer/my-aem-boilerplate/main/{path}`
   - **Requires explicit approval before running publish**

## Code Review Checklist (before PR)
- [ ] CSS is mobile-first with correct breakpoints (600px, 900px)
- [ ] No hardcoded colors — only CSS custom properties
- [ ] All images have alt text
- [ ] Interactive elements are keyboard accessible
- [ ] `npm run lint` passes with zero errors
- [ ] Tested visually at 375px (mobile), 768px (tablet), 1280px (desktop)
