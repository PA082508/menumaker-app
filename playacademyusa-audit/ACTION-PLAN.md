# SEO Action Plan — playacademyusa.com
**Audit Date:** 2026-06-17 | **Overall SEO Health Score: 22/100**

---

## Phase 1: Critical Fixes (Week 1)

*These block ranking, conversion, or signal active site neglect to Google.*

| # | Action | Page(s) | Category | Effort |
|---|---|---|---|---|
| 1 | **Noindex `/test1/`** and remove from sitemap | /test1/ | Technical | 15 min |
| 2 | **Fix broken contact form** ("Contact form not found" error) | /contact/ | Conversion | 1–2 hr |
| 3 | **Exclude Kiddino builder URLs from Yoast sitemaps** (Yoast → Search Appearance → Content Types → disable kiddino_footer, kiddino_header, kiddino_tab_build, kiddino_off_build post types) | Sitemaps | Technical | 30 min |
| 4 | **Delete or consolidate duplicate teacher pages** — keep one URL per teacher, 301 redirect duplicates | /all-teachers/ | Technical | 2 hr |
| 5 | **Delete or consolidate duplicate class pages** — 5 drawing-painting variants + other duplicates | /all-classs/ | Technical | 2 hr |
| 6 | **Delete or consolidate duplicate event pages** — 3 Father's Day duplicates | /all-events/ | Technical | 30 min |
| 7 | **Replace boilerplate "MS/Mphil degree, PhD degree" teacher credentials** — real data or remove the field | /all-teachers/ | Content/Trust | 1 hr |
| 8 | **Add `fetchpriority="high"` and `<link rel="preload">` to hero image** | / and location pages | Performance | 30 min |
| 9 | **301 redirect `/menu-for-chilgren/` → `/menu-for-children/`** | /menu-for-chilgren/ | Technical | 15 min |

---

## Phase 2: High-Impact Improvements (Weeks 2–3)

*Directly impact SERP visibility, click-through rate, and local pack ranking.*

| # | Action | Page(s) | Category | Effort |
|---|---|---|---|---|
| 10 | **Write meta descriptions for all 17 pages** (150–160 chars, unique, include location + service + CTA) | All pages | On-Page | 3–4 hr |
| 11 | **Write title tags for 5 pages missing them** (/, /curriculum/, /food-program-cacfp/, /meals/, /jobs/) | 5 pages | On-Page | 1 hr |
| 12 | **Enable Open Graph in Yoast** (Yoast → Social → Facebook → Add Open Graph metadata) | Site-wide | Technical | 30 min |
| 13 | **Enable canonical tags in Yoast** (should be default — verify Yoast schema settings are not suppressed) | Site-wide | Technical | 30 min |
| 14 | **Add ChildCare LocalBusiness JSON-LD** to each location page (see schema.md for complete code) | /wickliffe-3/, /highland-hts/, /parma-hts/ | Schema | 2 hr |
| 15 | **Add Organization + WebSite JSON-LD** to homepage (see schema.md for complete code) | / | Schema | 1 hr |
| 16 | **Add JobPosting JSON-LD** to /jobs/ for all 9 positions (3 roles × 3 locations) | /jobs/ | Schema | 2 hr |
| 17 | **Enable Yoast breadcrumbs** (Yoast → Search Appearance → Breadcrumbs) — auto-generates BreadcrumbList for all pages | Site-wide | Schema | 15 min |
| 18 | **Fix YouTube iframe** — add `loading="lazy"` or replace with lite-YouTube facade | / | Performance | 1 hr |
| 19 | **Add `width` and `height` to all images** — prevents CLS | All pages | Performance | 1–2 hr |
| 20 | **Add preconnect hints** for youtube.com, cdn.glitch.global, pub-files-live.illions.com | / (head) | Performance | 30 min |

---

## Phase 3: Content & Authority (Month 2)

*Build E-E-A-T, fill keyword gaps, differentiate location pages.*

| # | Action | Page(s) | Category | Effort |
|---|---|---|---|---|
| 21 | **Create "Meet Our Team" / About page** with director bios, credentials, years of experience, Ohio childcare license number, SUTQ Gold detail | New page | E-E-A-T | 4–6 hr |
| 22 | **Create Pricing/Tuition page** — highest-intent missing query on the site | New page | Commercial | 3–4 hr |
| 23 | **Differentiate location pages** — add unique testimonials per location (not shared Erica Lograsso copy), local school district names served, neighborhood landmarks, specific classroom photos with descriptive captions | 3 location pages | Content | 4–6 hr |
| 24 | **Add actual menus to `/menu-for-children/`** — weekly/monthly meal tables, nutritional highlights, CACFP compliance info | /menu-for-children/ | Content | 2–3 hr |
| 25 | **Expand `/food-program-cacfp/` from ~500 to 1,200+ words** — what CACFP is, family reimbursement, meal patterns per age group, USDA requirements, link to USDA CACFP page | /food-program-cacfp/ | Content | 3 hr |
| 26 | **Create FAQ page** targeting common parent questions with FAQPage schema | New page | Content/AI | 3 hr |
| 27 | **Create `/llms.txt`** — structured AI guidance file (see performance.md for template) | / | AI/GEO | 30 min |
| 28 | **Consolidate `/meals/`, `/menu-for-children/`, `/food-program-cacfp/`** into hub-and-spoke — one parent page + subpages, or merge to one authoritative page | 3 pages | Architecture | 3 hr |
| 29 | **Fix title separators site-wide** — replace `//` with `|` or `-` across all pages | All pages | On-Page | 1 hr |
| 30 | **Remove "Near Me" from title tags** on /summer-camp/, /school-age/, /infants/ | 3 pages | On-Page | 30 min |

---

## Phase 4: Monitoring & Iteration (Ongoing)

| # | Action | Category |
|---|---|---|
| 31 | **Fix `/wickliffe-3/` slug → `/wickliffe/`** with 301 redirect and update all internal links and sitemap | Technical |
| 32 | **Verify Highland Heights ZIP** (44124 vs 44143 discrepancy on /jobs/ page) and standardize across all citations | Local SEO |
| 33 | **Add Google Maps embeds** to /contact/ page for all 3 locations | Local SEO |
| 34 | **Build directory citations** — submit to Yelp, Care.com, Daycare.com, GreatSchools, Bing Places, Apple Maps | Local SEO |
| 35 | **Convert PNG logo to WebP or SVG** — served on every page | Performance |
| 36 | **Add `font-display: swap`** to web font declarations | Performance |
| 37 | **Add security headers** via Flying Press or .htaccess: X-Content-Type-Options, X-Frame-Options, Referrer-Policy | Security |
| 38 | **Set up Google Search Console** and submit sitemap_index.xml | Monitoring |
| 39 | **Monitor Core Web Vitals** in GSC after LCP and CLS fixes | Performance |
| 40 | **Add review integration** — embed Google Reviews widget or Elfsight once GBP review count grows | Trust |
| 41 | **Update copyright year** in footer (2025 → 2026) | Trust |

---

## Quick Wins Summary (Under 30 Minutes Each)

1. Noindex /test1/ — immediate quality signal fix
2. Exclude Kiddino builder URLs from sitemaps — removes 12 junk URLs
3. Enable Yoast breadcrumbs — auto-generates BreadcrumbList site-wide
4. Enable Open Graph in Yoast — fixes all social sharing previews
5. Add hero image preload + fetchpriority — direct LCP improvement
6. Create /llms.txt — AI visibility with 30 minutes of work
7. Update footer copyright year 2025 → 2026
8. Add preconnect hints for YouTube, chatbot CDN, illions.com
9. Fix Highland Heights ZIP discrepancy on /jobs/
10. 301 redirect /menu-for-chilgren/ → /menu-for-children/

---

## Projected Impact by Phase

| Phase | Primary Impact |
|---|---|
| Phase 1 | Stop losing crawl budget to junk; fix conversion blocker (contact form); remove quality penalties |
| Phase 2 | Unlock SERP rich results (local pack); improve CTR (meta descriptions); fix social sharing |
| Phase 3 | Rank for "pricing" and "about" queries; improve E-E-A-T score; differentiate location pages; improve AI citability |
| Phase 4 | Compound authority gains; build citation network; establish monitoring baseline |
