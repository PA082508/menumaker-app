# Technical SEO Findings — playacademyusa.com
**Audit Date:** 2026-06-17 | **Score: 22/100**

---

## Crawlability & Indexability

### robots.txt — Functional but Has Issues
```
User-agent: *
Disallow: /wp-admin/
Allow: /wp-admin/admin-ajax.php
Disallow: *?gtm / *?utm / *?gclid / *?from / *?gbraid / *?srsltid
Host: https://playacademyusa.com/
Sitemap: https://playacademyusa.com/sitemap_index.xml
```
- `Host:` is a Yandex-only directive — ignored by Google/Bing (harmless but remove)
- `?from` is an overly generic param block — could accidentally block legitimate navigation URLs
- Tracking param blocks (?utm, ?gclid, etc.) are well-considered ✓

### CRITICAL: Test Page Indexed (/test1/)
- H1: "test1", Title: "test1 - Play Academy"
- Listed in `page-sitemap.xml` (lastmod 2025-07-02)
- Listed in HTML sitemap at `/sitemap/`
- **No noindex meta tag** — fully indexable by Google
- Signals poor site hygiene to crawlers

### CRITICAL: 12 Kiddino Theme Builder URLs in Sitemaps
Theme editor preview URLs are submitted as real pages:
| Sitemap | URLs | Type |
|---|---|---|
| `kiddino_footer-sitemap.xml` | 5 | `/?kiddino_footer=footer-01` through `-05` |
| `kiddino_header-sitemap.xml` | 5 | `/?kiddino_header=header-01` through `-05` |
| `kiddino_tab_build-sitemap.xml` | 1 | `/?kiddino_tab_build=off-canvas-menu` |
| `kiddino_off_build-sitemap.xml` | 1 | `/?kiddino_off_build=off-canvas-biulder` (typo in URL) |

All render soft-duplicate homepage content. Must be excluded from sitemaps via Yoast → Search Appearance → Content Types.

### HIGH: Duplicate Kiddino Demo Content Still Indexed

**Teacher pages** (kiddino_teacher-sitemap.xml, 11 URLs):
- `/all-teachers/katie-willmore/`
- `/all-teachers/katie-willmore-2/`
- `/all-teachers/katie-willmore-2-2/` ← title says "Jessica Levis" but content shows "Katie Willmore"

**Class pages** (kiddino_class-sitemap.xml, 13 URLs with `/all-classs/` typo):
- `/all-classs/drawing-painting/`
- `/all-classs/drawing-painting-2/` ← title "Alphabet Matching", H1 "Drawing & Painting" (mismatch)
- `/all-classs/drawing-painting-2-2/`
- `/all-classs/drawing-painting-3/`
- `/all-classs/drawing-paintings/`

**Event pages** (kiddino_event-sitemap.xml, 4 URLs):
- `/all-events/fathers-day-sundaes-shaving/` (+ 2 duplicates)

These appear to be unremoved Kiddino theme demo content. All have identical lastmod timestamps (2025-02-27T12:51:35) — bulk import signature.

---

## URL Structure & Architecture

| URL | Problem |
|---|---|
| `/menu-for-chilgren/` | Typo "chilgren" vs "children" — in live sitemap, lastmod 2026-06-01 |
| `/wickliffe-3/` | `-3` suffix implies third draft; should be `/wickliffe/` |
| `/all-classs/` | Triple-s typo — all 13 class URLs inherit this |
| `/test1/` | Meaningless test slug in live production sitemap |
| `/?kiddino_footer=footer-01` etc. | Query-string builder preview URLs in sitemap |

Core service slugs are reasonable: `/upk-program/`, `/food-program-cacfp/`, `/preschool/`, `/toddlers/`, `/infants/`, `/school-age/`

---

## Technical Tags

**Confirmed ABSENT on all pages audited:**

| Tag | Status | Impact |
|---|---|---|
| `<link rel="canonical">` | ABSENT | Google guesses canonical among duplicates |
| `<meta name="robots">` | ABSENT | No control over index/noindex per page |
| Open Graph tags (og:*) | ABSENT | Social shares show no image/title/description |
| Twitter Card meta | ABSENT | Twitter/X shares broken |
| JSON-LD structured data | ABSENT | Zero rich result eligibility |
| Schema.org microdata | ABSENT | No local pack structured signals |
| `<meta name="description">` | ABSENT on most pages | Google writes its own SERP snippets |

**Note:** Yoast SEO is installed but appears unconfigured — canonical, OG, and structured data output requires manual setup in Yoast settings.

---

## Sitemap Quality

| Child Sitemap | URLs | Quality |
|---|---|---|
| `page-sitemap.xml` | 18 | Mixed — includes /test1/, /wickliffe-3/, /menu-for-chilgren/ |
| `kiddino_teacher-sitemap.xml` | 11 | Poor — duplicates, content/title mismatches |
| `kiddino_class-sitemap.xml` | 13 | Poor — 5 drawing-painting duplicates, /all-classs/ typo |
| `kiddino_event-sitemap.xml` | 4 | Poor — 3 duplicates of same Father's Day event |
| `kiddino_footer-sitemap.xml` | 5 | Junk — theme template builder URLs |
| `kiddino_header-sitemap.xml` | 5 | Junk — theme template builder URLs |
| `kiddino_tab_build-sitemap.xml` | 1 | Junk — theme builder URL |
| `kiddino_off_build-sitemap.xml` | 1 | Junk — theme builder URL with "biulder" typo |

**Total submitted URLs: ~58 | Estimated junk/duplicate: ~32 (55%)**

No `<priority>` values in page-sitemap.xml (acceptable — Google ignores them). Class/teacher/event lastmod dates all identical (2025-02-27) — bulk import signal.

---

## Security & HTTPS

- HTTPS enforced ✓
- `/wp-admin/` correctly disallowed in robots.txt ✓
- `Host:` directive references HTTPS version ✓
- Mixed content from `cdn.glitch.global` (chatbot) and `pub-files-live.illions.com` widgets — verify HTTPS sourcing in browser DevTools
- No security headers detectable (X-Frame-Options, CSP, X-Content-Type-Options) — add via Flying Press or .htaccess

---

## Score Breakdown

| Category | Score | Rationale |
|---|---|---|
| Crawlability & Indexability | 3/20 | Test page indexed, 12 junk sitemap URLs, mass duplicate demo content |
| URL Structure | 5/10 | Core pages OK; 3 typos in live production slugs |
| Technical Tags | 3/30 | Zero canonicals, zero OG, zero structured data |
| Sitemap Quality | 3/15 | 55% junk/duplicate; demo content timestamps |
| Security & HTTPS | 7/10 | HTTPS active; no security headers |
| Content/UX Signals | 1/15 | Broken contact form, placeholder emails, demo content live |

**Overall Technical Score: 22/100**
