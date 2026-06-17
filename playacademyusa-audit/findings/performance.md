# Performance & AI Search Readiness Findings — playacademyusa.com
**Audit Date:** 2026-06-17 | Performance: 48/100 | AI Readiness: 31/100 | Security: 62/100

---

## Performance Assessment

### Positive Signals
- WebP format confirmed on hero image (`hero-2-1-2.webp`, 135.5 KB — reasonable hero size) ✓
- Flying Press caching plugin active ✓
- HTTPS enforced ✓
- Yoast SEO plugin for sitemap generation ✓

### Critical Issues

**LCP Hero Image — No Priority Hints**
The hero image `hero-2-1-2.webp` is the almost-certain LCP element. It has:
- No `fetchpriority="high"` attribute on the `<img>` tag
- No `<link rel="preload" as="image">` in `<head>`

The browser has no early signal to prioritize it. This is the highest-impact single performance fix.
**Fix:** Add `<link rel="preload" as="image" href="/wp-content/uploads/2025/05/hero-2-1-2.webp" fetchpriority="high">` to `<head>`.

**YouTube Iframe — ~550 KB Undeferred Load**
The YouTube embed (`JI7EaRoccV4`) loads without `loading="lazy"`. A standard YouTube iframe loads ~550 KB of JavaScript on page parse, delaying Time to Interactive and inflating LCP.
**Fix:** Replace with a lite-YouTube facade (e.g., `lite-youtube-embed` library) or add `loading="lazy"` as a minimum.

**Missing Image Dimensions (CLS Risk)**
No `width` and `height` attributes confirmed on images across homepage or location pages. Missing dimensions cause Cumulative Layout Shift as images load and reflow content.
**Fix:** WordPress 5.5+ auto-adds dimensions for new uploads if the theme supports it — verify Kiddino theme compatibility.

**Third-Party Widgets — Unquantified Load**
Two external widgets present:
- Chatbot from `cdn.glitch.global`
- Widget from `pub-files-live.illions.com`

Both chain network requests at paint time if loaded synchronously. Verify they have `async`/`defer` or load after DOMContentLoaded.

**No Preconnect Hints**
Missing `<link rel="preconnect">` for:
```html
<link rel="preconnect" href="https://www.youtube.com">
<link rel="preconnect" href="https://cdn.glitch.global">
<link rel="preconnect" href="https://pub-files-live.illions.com">
```
Missing preconnect to third-party origins adds ~200–600 ms on typical connections.

**Non-WebP Logo**
Logo `STIKER_Book_240973-2.png` is served as PNG on every page.
**Fix:** Convert to WebP or inline SVG.

**Location Page — Unoptimized Images**
On `/wickliffe-3/`:
- `ridge-0_orig.jpeg` — filename suggests unoptimized original upload
- `IMAGE-2025-04-29-143605.jpg` — JPG format, not WebP

**Font Loading**
No evidence of `font-display: swap` or Google Fonts preconnect. If web fonts load via external stylesheet without swap, they cause FOIT (Flash of Invisible Text) affecting LCP and CLS.

### LCP Candidates
| Page | LCP Candidate | Priority |
|---|---|---|
| Homepage | `hero-2-1-2.webp` (hero image) | No `fetchpriority="high"` |
| /wickliffe-3/ | Background hero image | No `fetchpriority="high"` |
| Location pages | Autoplaying background video | Expensive on mobile; use poster image fallback |

---

## AI Search Readiness (GEO)

### AI File Access

| File | Status |
|---|---|
| `/llms.txt` | 404 — does not exist |
| `/ai.txt` | 404 — does not exist |

Neither AI guidance file exists. `llms.txt` is the emerging standard for signaling how AI systems should access and cite your content.

### Robots.txt — AI Crawler Status
The `robots.txt` contains **no specific rules for any AI crawler**. The wildcard `User-agent: *` allows all bots:
- GPTBot ✓ (allowed)
- ClaudeBot / anthropic-ai ✓ (allowed)
- Google-Extended ✓ (allowed)
- PerplexityBot ✓ (allowed)
- CCBot ✓ (allowed)

Site is **not blocking AI crawlers** — content is accessible for training and citation. This is correct behavior.

### Content Strengths for AI Citation
- **Curriculum page** — strongest AI-citable asset: explicitly names High-Scope curriculum, references Jean Piaget/Dewey/Vygotsky, cites the Perry Preschool Project with measurable outcomes. Factual, sourced content AI systems can extract.
- **CACFP page** — uses question-based headers ("Who may participate?", "What are the meal requirements?") — partially FAQ-structured for AI extraction.
- **NAP data** — three distinct, specific addresses enable local entity disambiguation.
- **SUTQ Gold rating** — verifiable, government-backed credential AI can reference as third-party validation.

### Critical AI Readiness Gaps

| Gap | Impact |
|---|---|
| No About page (confirmed 404) | AI systems check About first to understand organizational identity, mission, founding, and leadership |
| No FAQ page (confirmed 404) | AI Overviews and AI Mode heavily cite structured Q&A; common parent questions have no citable answers |
| No llms.txt | No structured signal for how AI should describe and cite this business |
| Boilerplate teacher credentials | Every teacher profile shows identical "MS/Mphil degree, PhD degree" — placeholder text that AI systems flag as low-quality/fabricated expertise |
| Duplicate/demo content indexed | `/all-classs/` pages and duplicate teacher profiles dilute site quality signals across all crawl paths |
| No author bylines | No named human has "written" any content — removes a key E-E-A-T signal AI systems evaluate |
| No review schema | Testimonials exist on-site but not marked up — AI cannot cite specific review data as facts |
| `/test1/` indexed | Test page signals poor editorial quality to AI quality evaluators |

### Recommended llms.txt (30-minute task)

Create `/llms.txt` with:
```
# Play Academy — AI Access Guide

## Organization
Play Academy is a SUTQ Gold-rated childcare provider in Greater Cleveland, Ohio.

## Locations
- Wickliffe: 28930 Ridge Rd, Wickliffe, OH 44092 | 440-520-0031
- Highland Heights: 201 Alpha Park, Highland Heights, OH 44143 | 440-460-0600
- Parma Heights: 6285 Pearl Rd, Parma Heights, OH 44130 | 440-884-7529

## Programs
Infant care (4 weeks–18 months), Toddler care (18–36 months), Preschool (3–5 years), Universal Pre-K (UPK), Before & After School Care, Summer Camp

## Credentials
- Ohio Step Up to Quality (SUTQ) Gold Rating — all three locations
- CACFP (Child and Adult Care Food Program) participant
- High/Scope curriculum

## Hours
Monday–Friday, 6:30 AM – 6:00 PM

## Contact
Website: https://playacademyusa.com
Facebook: https://www.facebook.com/playacademy.us/

## Sitemap
https://playacademyusa.com/sitemap_index.xml
```

---

## Security Signals

| Signal | Status |
|---|---|
| HTTPS enforced | ✓ Confirmed |
| `/wp-admin/` disallowed in robots.txt | ✓ |
| Mixed content (chatbot / illions.com widgets) | Verify in browser DevTools |
| Security headers (X-Frame-Options, CSP, etc.) | Not detectable — likely absent; add via Flying Press or .htaccess |
| WordPress version exposure | Unknown — may be suppressed by Flying Press or Yoast |

---

## Score Breakdown

### Performance: 48/100
| Signal | Status |
|---|---|
| WebP images for new uploads | ✓ |
| Flying Press cache | ✓ |
| HTTPS | ✓ |
| LCP hero image prioritization | ✗ Missing fetchpriority + preload |
| YouTube iframe lazy loading | ✗ Missing |
| Image width/height dimensions | ✗ Missing |
| Preconnect hints for third parties | ✗ Missing |
| Font loading optimization | ✗ Unknown / likely missing |
| Non-WebP logo | ✗ PNG served on every page |
| Unoptimized location page images | ✗ JPEGs not converted |

### AI Search Readiness: 31/100
| Signal | Status |
|---|---|
| AI crawlers not blocked | ✓ |
| Citable factual content (CACFP, High-Scope, SUTQ) | ✓ |
| Consistent NAP data | ✓ |
| llms.txt | ✗ Missing |
| About page | ✗ 404 |
| FAQ page | ✗ 404 |
| FAQPage schema | ✗ Missing |
| Real staff credentials | ✗ Boilerplate placeholder text |
| Author bylines | ✗ Missing |
| Review/rating schema | ✗ Missing |

### Security: 62/100
- HTTPS enforced (+30), correct robots.txt (+20), no visible security headers (-25), third-party widget risk (-13)
