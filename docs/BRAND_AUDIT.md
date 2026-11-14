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

**Sweep (14 Nov 2026):** Settings Drive/HubSpot cards, toast/error stores, browser notifications, Dashboard hero (company label), Products/WorshipHub chrome, Customer Files / Delivery Panel copy, marketing site CRM links, and key i18n EN+AR strings now use `PRODUCT.name` / HighMast.

**Still may say RR Central (intentional or deferred):**

- Drive folder path **`RR Central / Customers`** (live Drive tree; rename later)
- Code comments / JSDoc / type docs
- Edge Function error strings that still say RR Central (repo/function names stay)
- Some guide pack prose and deep ops docs

**Rule for this rebrand:** HighMast surfaces (sign-in, PWA fallback name, sidebar footer, About, system emails) → `PRODUCT`. Tenant Red Reach keeps “Red Reach” in company docs and tenant kit.

## Logos

| Location | Current | Target |
|----------|---------|--------|
| Login | PNG stacked from seed | `A_stacked_reverse.svg` + separate endorsement text |
| Sidebar | `BrandLogo` → `logo.png` / tenant kit | Tenant kit; HighMast symbol only in footer |
| Favicon / PWA | Regenerated from seed PNG | `A_favicon_full.svg` / `A_app-icon_full.svg` (+ dark) as fallback |
| Documents PDF | Tenant / settings logo | Unchanged (tenant) |

**Asset intake note:** Chat upload provided **PNG/JPG renders** of route A (H-mast), not the `brand-assets.zip` SVG tree. Drive search found no zip. Classified lockups now live under `brand-assets/highmast/A-h-mast/` (dark reverse/white + light black/duo). Prefer official SVG masters when available. Never put charcoal/duo wordmarks on dark surfaces.

## Hardcoded colours

| Location | Status |
|----------|--------|
| `app/src/styles/tokens.css` | Source of truth (hex OK here only) |
| `uiStyles` / `pageStyles` | Token vars |
| Layout / Dashboard / CRM responsive chrome | Old `#e85d04` → tokens; badges `--primary` |
| Document letterhead / client report print CSS | May still hold print-specific oranges — review with PDF pass |
| Login / gates | Prefer `--primary` / `--on-primary` |

Target remains: components read tokens only. Semantic status colours stay separate.

## Fonts

| Location | Current | Spec |
|----------|---------|------|
| `index.css` / `index.html` | DM Sans (+ Montserrat/Sarabun links) | Tokens / brand fonts only via theme; no ad-hoc stacks in components |

## Modes

Light / dark / system via `themeMode` + `ThemeProvider`; applied before paint. Contrast unit tests exist (`tokenContrast.test.ts`).

## Accessibility gaps

- Broader axe suite still open (sign-in / Home / list / form / PDF, both modes)
- Pipeline stage colours may rely on hue alone
- Focus rings: improve coverage beyond login/shell

## Out of scope this step (per prompt)

- Full theme studio (§5.3)
- Renaming repo, tables, Edge Functions, `/RRCentral` routes
- Deleting features / touching real data
- Paid QTSP / demo env
