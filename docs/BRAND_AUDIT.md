# HighMast brand audit

**Date:** 14 November 2026 (Asia/Dubai)  
**Against:** HighMast Master Spec v1.2 §5.1–5.4 + Appendix C.1  
**Scope:** User-facing name, logo, colour, and font hardcodes. Repo/DB/Edge/route names stay RR Central.

## Already moved toward HighMast

| Area | Status |
|------|--------|
| `app/src/lib/product.ts` | `PRODUCT.name` / endorsement / colours exist (pure module) |
| Login title/i18n | Catalog uses HighMast; still needs SVG stacked reverse + tokenised chrome |
| PWA `index.html` / manifest | Name HighMast; icons are rasterised mark, not Appendix C app-icon masters |
| `app/public/brand/highmast/` | PNG symbol + stacked seed; **SVG kit not in repo yet** |
| Digest subjects / 2FA / access gate | Use `PRODUCT.name` |

## Product name hardcodes (user-facing)

Still say **RR Central** / **RED REACH Central** in chrome or copy (non-exhaustive; grep `RR Central`):

- Shell: `Layout.tsx` topbar eyebrow, `RouteAnnouncer.tsx` title fallback
- Guide / i18n bodies: many `page.*` and `guide.*` strings in `i18n.ts`
- Settings cards, Drive, HubSpot, digest docs, ProtectedRoute (partially fixed)
- Ops copy: Dashboard, CustomerFiles, Products (WorshipHub), ModuleAlerts, DeliveryPanel
- Edge-facing pure modules that surface the name in emails/toasts

**Rule for this rebrand:** HighMast surfaces (sign-in, PWA fallback name, sidebar footer, About, system emails) → `PRODUCT`. Tenant Red Reach keeps “Red Reach” in company docs and tenant kit.

## Logos

| Location | Current | Target |
|----------|---------|--------|
| Login | PNG stacked from seed | `A_stacked_reverse.svg` + separate endorsement text |
| Sidebar | `BrandLogo` → `logo.png` / tenant kit | Tenant kit; HighMast symbol only in footer |
| Favicon / PWA | Regenerated from seed PNG | `A_favicon_full.svg` / `A_app-icon_full.svg` (+ dark) as fallback |
| Documents PDF | Tenant / settings logo | Unchanged (tenant) |

**Asset intake note:** Chat upload provided **PNG/JPG renders** of route A (H-mast), not the `brand-assets.zip` SVG tree. Drive search found no zip. Audit treats PNGs as interim masters until SVGs land; prefer SVG when available.

## Hardcoded colours

| Location | Examples |
|----------|----------|
| `app/src/index.css` `:root` | `--bg #0b0c0e`, `--accent #e85d04` (old orange), not HighMast tokens |
| `app/src/lib/uiStyles.ts` `colors` | Raw hex `#e85d04`, `#0b0c0e`, … |
| `LoginPage.module.css` | `#c8321a` / `#e8872a` literals after PRODUCT PR |
| Module CSS | Dashboard, Document, Layout, CommandPalette, docsList, … |
| Inline styles | Settings, gates, many pages |

Target: CSS variables from §5 design tokens (light/dark). Components read `var(--primary)` etc. Semantic status colours stay separate.

## Fonts

| Location | Current | Spec |
|----------|---------|------|
| `index.css` / `index.html` | DM Sans (+ Montserrat/Sarabun links) | Tokens / brand fonts only via theme; no ad-hoc stacks in components |

## Modes

No light/dark/automatic preference yet. App is dark-only. Spec: light, dark, system; persist per user; apply before first paint.

## Accessibility gaps

- No automated contrast test on token pairs
- No axe (or similar) on sign-in / Home / list / form / PDF
- Pipeline stage colours may rely on hue alone
- Focus rings not consistently tokenised (`--focus-ring`)

## Out of scope this step (per prompt)

- Full theme studio (§5.3)
- Renaming repo, tables, Edge Functions, `/RRCentral` routes
- Deleting features / touching real data
- Paid QTSP / demo env
