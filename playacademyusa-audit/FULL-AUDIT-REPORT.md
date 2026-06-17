# Full SEO Audit Report — playacademyusa.com
**Business:** Play Academy (Childcare / Daycare — Cleveland, OH — 3 Locations)
**Audit Date:** 2026-06-17
**Auditor:** Claude Code SEO Audit

---

## Executive Summary

### Overall SEO Health Score: 22 / 100

| Category | Weight | Score | Weighted |
|---|---|---|---|
| Technical SEO | 22% | 22/100 | 4.8 |
| Content Quality | 23% | 22/100 | 5.1 |
| On-Page SEO | 20% | 15/100 | 3.0 |
| Schema / Structured Data | 10% | 8/100 | 0.8 |
| Performance (CWV) | 10% | 48/100 | 4.8 |
| AI Search Readiness | 10% | 31/100 | 3.1 |
| Images | 5% | 15/100 | 0.8 |
| **TOTAL** | 100% | — | **22.4 / 100** |

### Business Type Detected
Local Service — Multi-location childcare/daycare center. YMYL-adjacent (child safety and care). High trust requirements. Strong local SEO dependency.

### Top 5 Critical Issues
1. **Zero canonical tags** across the entire site — Google guesses which URL is authoritative among dozens of near-duplicates
2. **Zero meta descriptions** — 0/17 pages have a meta description; Google writes all SERP snippets itself
3. **Zero structured data** — No LocalBusiness, no JobPosting, no schema of any kind — the site is invisible to Google's rich result systems
4. **Live test page indexed in sitemap** — `/test1/` is publicly indexable and actively submitted to Google
5. **12 Kiddino theme builder URLs in sitemaps** — 55% of submitted URLs are junk or duplicate demo content

### Top 5 Quick Wins
1. **Add `fetchpriority="high"` to hero image** — 30 min, direct LCP improvement
2. **Exclude Kiddino builder sitemaps in Yoast** — 30 min, removes 12 junk URLs from Google's index
3. **Enable Open Graph in Yoast → Social → Facebook** — 30 min, fixes all social sharing previews
4. **Enable Yoast breadcrumbs** — 15 min, auto-generates BreadcrumbList site-wide
5. **Create `/llms.txt`** — 30 min, AI search visibility signal

---

## Site Overview

| Property | Value |
|---|---|
| Domain | playacademyusa.com |
| Platform | WordPress + Kiddino theme |
| SEO Plugin | Yoast SEO |
| Cache | Flying Press |
| Pages in sitemap | ~58 (18 real; 40 junk/duplicate) |
| Locations | 3 (Wickliffe, Highland Heights, Parma Heights) |
| Primary programs | Infants, Toddlers, Preschool, UPK, School-Age, Summer Camp |
| Credentials | SUTQ Gold (all 3 locations), CACFP participant |
| Curriculum | High/Scope |
| Hours | Mon–Fri 6:30 AM – 6:00 PM |

---

## Technical SEO
**Score: 22/100** — [Full findings: findings/technical.md]

### robots.txt
Functional. Correctly blocks `/wp-admin/`, tracking params (?utm, ?gclid, etc.). Has one harmless Yandex-only `Host:` directive. Sitemap declaration points to correct `sitemap_index.xml`.

### Critical: Test Page Live and Indexed
`/test1/` has H1 "test1", is in the page sitemap (lastmod 2025-07-02), and has no noindex directive. Signals site neglect to Google.

### Critical: 12 Theme Builder URLs in Sitemaps
Kiddino's 4 builder-type custom post types (`kiddino_footer`, `kiddino_header`, `kiddino_tab_build`, `kiddino_off_build`) are all included in the sitemap index and generate soft-duplicate homepage content. Fix: Yoast → Search Appearance → Content Types → disable each type from sitemaps.

### Critical: Unremoved Demo Content Indexed
The Kiddino theme shipped with demo content that was never replaced:
- **11 teacher pages** — 3 are duplicates of "Katie Willmore" with content/title mismatches (one says "Jessica Levis" in title but shows "Katie Willmore" in content)
- **13 class pages** at `/all-classs/` (note URL typo) — 5 are "drawing-painting" variants with title/content mismatches
- **4 event pages** — 3 are duplicates of the same Father's Day event
- All have identical lastmod timestamps (2025-02-27) — bulk import signature

### Zero Canonical Tags
No `<link rel="canonical">` detected on any page audited. Given the volume of duplicate content (theme demo pages, builder preview URLs), this means Google is choosing canonical URLs arbitrarily.

### URL Typos in Production
- `/menu-for-chilgren/` — "chilgren" misspelling (most recently updated page in sitemap: 2026-06-01)
- `/all-classs/` — triple-s typo inherited by all 13 class page URLs
- `/wickliffe-3/` — draft artifact suffix (-3)

### Broken Contact Form
The `/contact/` page displays "Contact form not found" — a broken CF7 or WPForms shortcode. This is a live conversion failure.

---

## Content Quality
**Score: 22/100** — [Full findings: findings/content.md]

### Meta Tags — Complete Failure
- **0 of 17 pages have a meta description** — the most widespread and impactful single gap on the site
- **5 of 17 pages have no title tag** at all: `/`, `/curriculum/`, `/food-program-cacfp/`, `/meals/`, `/jobs/`
- 3 pages use "Near Me" in their title tags — Google ignores this for ranking; looks spammy in SERPs
- Inconsistent separator usage (`//` vs `|` vs `-`) across title tags

### E-E-A-T Assessment: 27/100
The site handles children's wellbeing — a YMYL-adjacent category where Google's Quality Rater Guidelines set very high trust standards.

| Dimension | Score | Key Gap |
|---|---|---|
| Experience | 5/25 | No authentic classroom photos, no outcomes data, no documented first-hand experience |
| Expertise | 9/25 | Director names visible but no bios, credentials, or professional profiles |
| Authoritativeness | 5/25 | No external citations, no press mentions, no third-party review integration |
| Trustworthiness | 8/25 | Addresses and phones present; no privacy policy, no ODJFS license number, copyright shows 2025 |

### Keyword Cannibalization (4 Clusters)
Multiple pages target near-identical queries, suppressing each other in search:
- **"Childcare Cleveland OH"** — homepage + all 3 location pages
- **"Preschool near me Cleveland"** — /preschool/ + /upk-program/ + location pages
- **"Daycare Cleveland"** — homepage + all age-specific pages
- **CACFP/Food/Menu** — /food-program-cacfp/ + /meals/ + /menu-for-chilgren/ (3 overlapping pages)

### Content Duplication
- Same Erica Lograsso testimonial appears verbatim on 5+ pages
- "Why Choose Play Academy?" section copy-pasted across service pages
- Location pages (Wickliffe, Highland Heights, Parma Heights) are near-identical templates

### Thin Content Pages
- `/food-program-cacfp/` — ~500–600 words (below 800-word service page floor)
- `/menu-for-chilgren/` — page promises menus but shows none (zero actual menu content)
- `/curriculum/` — H1 is just "Curriculum" (strong thin-content signal)

### Keyword Gaps (No Coverage)
- "Daycare prices Cleveland OH" — highest-intent missing query; no pricing page exists
- "Licensed daycare Cleveland" — no Ohio ODJFS license numbers displayed
- "About Play Academy" — no About page (confirmed 404)
- "Infant daycare Wickliffe OH" — hyper-local missing for each location

---

## On-Page SEO
**Score: 15/100**

The meta tags section above covers title and description gaps. Additional on-page issues:

| Issue | Pages Affected |
|---|---|
| H1 "Curriculum" — no keyword | /curriculum/ |
| H1 "Contact" — no keyword | /contact/ |
| H1 "Jobs" — no keyword | /jobs/ |
| H1 "Infants near Cleveland" — awkward phrasing | /infants/ |
| H1 "Toddlers near Cleveland" — awkward phrasing | /toddlers/ |
| Most images use "icon", "teacher", "about" as alt text | Site-wide |
| Several images have empty alt attributes | Site-wide |
| Some images use keyword-stuffed alt text ("Best Daycares near me in Cleveland Ohio") | Site-wide |
| No internal linking strategy — most pages link to the nav menu only | Site-wide |
| No breadcrumb navigation visible to users | Site-wide |

---

## Schema / Structured Data
**Score: 8/100** — [Full findings: findings/schema.md]

**Zero structured data detected** on any page. The 8 points are awarded for internally consistent NAP data in HTML — the foundation is there; schema just needs to be implemented.

### Missing Schema (High-Priority)
1. **ChildCare LocalBusiness** — 3 instances needed (one per location); eligibility for local pack rich results
2. **Organization** — homepage entity anchor; Knowledge Panel eligibility
3. **JobPosting** — 9 positions eligible for Google Jobs (3 roles × 3 locations)
4. **BreadcrumbList** — enable via Yoast breadcrumbs setting (15 min)
5. **FAQPage** — AI Overviews citation value (FAQ rich results retired May 7, 2026)

### NAP Consistency
Internally consistent across the site. One discrepancy: Highland Heights ZIP shown as `44124` on /jobs/ vs `44143` elsewhere — verify and standardize.

### Local Signals Missing
- No Google Business Profile URLs in schema `sameAs` fields
- No Google Maps embeds on /contact/
- No review schema despite testimonials appearing on multiple pages
- No directory citations visible (Yelp, Care.com, Daycare.com, GreatSchools)

---

## Performance (Core Web Vitals)
**Score: 48/100** — [Full findings: findings/performance.md]

### Positives
- WebP images for recent uploads ✓
- Flying Press caching active ✓
- HTTPS enforced ✓

### LCP Issue (Highest Impact Fix)
Hero image `hero-2-1-2.webp` is the LCP candidate. No `fetchpriority="high"` or `<link rel="preload">` hint present. Fix:
```html
<link rel="preload" as="image" href="/wp-content/uploads/2025/05/hero-2-1-2.webp" fetchpriority="high">
```

### YouTube Embed (~550 KB Undeferred)
Standard YouTube iframe loads ~550 KB of JavaScript on page parse without `loading="lazy"`. Use `lite-youtube-embed` or add lazy loading.

### Other Performance Gaps
- No `width`/`height` on images → CLS risk
- No preconnect hints for YouTube, chatbot CDN, illions.com widget
- PNG logo (not WebP) served on every page
- JPG images on location pages (`ridge-0_orig.jpeg`) not converted to WebP
- Font loading strategy unclear (FOIT risk if no `font-display: swap`)

---

## AI Search Readiness
**Score: 31/100** — [Full findings: findings/performance.md]

### AI Crawler Access
Not blocking any AI crawlers — GPTBot, ClaudeBot, Google-Extended, PerplexityBot all allowed. ✓

### AI Files
- `/llms.txt` — 404 (missing)
- `/ai.txt` — 404 (missing)

### Citable Content Strengths
- Curriculum page cites High-Scope, Piaget, Dewey, Vygotsky, Perry Preschool Project — strong factual depth
- SUTQ Gold rating is a verifiable, government-backed credential
- CACFP participation is a citable program affiliation

### AI Readiness Gaps
- No About page (404) — first stop for AI systems learning about an organization
- No FAQ page (404) — AI Overviews and AI Mode cite Q&A content heavily
- Boilerplate teacher credentials — identical "MS/Mphil degree, PhD degree" on every profile signals placeholder text
- No `llms.txt` for structured AI guidance
- Demo class/teacher content dilutes site quality signals
- No author bylines on any content

---

## Images
**Score: 15/100**

| Issue | Count | Impact |
|---|---|---|
| Images with empty alt text | Multiple | Accessibility (ADA) + image search |
| Images with generic alt ("icon", "teacher", "about") | Majority | No informational value |
| Images with keyword-stuffed alt | Several | Unnatural; potential spam signal |
| Non-WebP images on location pages | Multiple | Performance |
| PNG logo served on every page | 1 (repeated) | Performance |
| No width/height attributes | Most images | CLS |

---

## Detailed Findings Files

- `findings/technical.md` — Technical SEO (crawlability, tags, sitemaps, URLs)
- `findings/content.md` — Content quality, E-E-A-T, cannibalization, duplication
- `findings/schema.md` — Schema markup gaps + complete JSON-LD implementation code
- `findings/performance.md` — Performance signals + AI search readiness + security

---

## Prioritized Action Plan

See `ACTION-PLAN.md` for the complete 41-item prioritized plan organized into 4 phases.

### Phase 1 — Critical (Week 1)
Noindex /test1/, fix contact form, exclude builder sitemaps, delete demo content, replace boilerplate credentials, add hero fetchpriority, fix menu URL typo.

### Phase 2 — High-Impact (Weeks 2–3)
Write all meta descriptions, fix title tags, enable OG + canonicals in Yoast, implement ChildCare + Organization + JobPosting schema, enable breadcrumbs, lazy-load YouTube, fix image dimensions.

### Phase 3 — Content & Authority (Month 2)
Create About/Team page, create Pricing page, differentiate location pages, expand thin CACFP content, add actual menus, create FAQ page, create llms.txt, consolidate food/nutrition pages.

### Phase 4 — Monitoring & Iteration (Ongoing)
Fix Wickliffe slug, build directory citations, add Google Maps embeds, set up GSC, add security headers, build review integration.
