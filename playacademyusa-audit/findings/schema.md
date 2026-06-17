# Schema Markup & Local SEO Findings — playacademyusa.com
**Audit Date:** 2026-06-17 | **Score: 8/100**

---

## Schema Detection Results

| Page | JSON-LD | Microdata | RDFa | Verdict |
|------|---------|-----------|------|---------|
| `/` | None | None | None | ZERO structured data |
| `/wickliffe-3/` | None | None | None | ZERO structured data |
| `/contact/` | None | None | None | ZERO structured data |
| `/preschool/` | None | None | None | ZERO structured data |
| `/jobs/` | None | None | None | ZERO structured data |

**Confirmed: Zero structured data in any format across all audited pages.**

NAP data exists in raw HTML only — invisible to Google's Knowledge Graph and rich result systems.

---

## Gap Analysis

| Schema Type | Status | Impact |
|---|---|---|
| ChildCare (LocalBusiness subtype) | MISSING | Critical — no Knowledge Panel, no local pack entity signals |
| Organization (homepage) | MISSING | High — no brand entity, no sitelinks eligibility, no logo in SERP |
| BreadcrumbList | MISSING | Medium — no breadcrumb trails in SERPs |
| FAQPage | MISSING | Low — Google retired FAQ rich results May 7, 2026; value is AI Overviews only |
| JobPosting | MISSING | High — 9 open positions not eligible for Google Jobs |
| AggregateRating / Review | MISSING | High — testimonials invisible to Google |
| WebSite (Sitelinks Search Box) | MISSING | Medium — no sitelinks search box eligibility |

---

## Priority 1: ChildCare LocalBusiness Schema (Each Location Page)

`ChildCare` is a recognized `LocalBusiness` subtype in schema.org. Use it on each location page.

### Wickliffe (/wickliffe-3/) — Example Implementation

```json
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": ["ChildCare", "LocalBusiness"],
  "@id": "https://playacademyusa.com/wickliffe-3/#childcare",
  "name": "Play Academy - Wickliffe",
  "legalName": "Play Academy",
  "url": "https://playacademyusa.com/wickliffe-3/",
  "telephone": "+1-440-520-0031",
  "email": "playacademy3@gmail.com",
  "priceRange": "$$",
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "28930 Ridge Rd",
    "addressLocality": "Wickliffe",
    "addressRegion": "OH",
    "postalCode": "44092",
    "addressCountry": "US"
  },
  "geo": {
    "@type": "GeoCoordinates",
    "latitude": 41.6056,
    "longitude": -81.4715
  },
  "openingHoursSpecification": [
    {
      "@type": "OpeningHoursSpecification",
      "dayOfWeek": ["Monday","Tuesday","Wednesday","Thursday","Friday"],
      "opens": "06:30",
      "closes": "18:00"
    }
  ],
  "description": "Play Academy Wickliffe is a SUTQ Gold-rated childcare center offering infant, toddler, preschool, UPK, and school-age programs using the High/Scope curriculum. CACFP participant — nutritious meals included.",
  "hasMap": "https://maps.google.com/?q=28930+Ridge+Rd,+Wickliffe,+OH+44092",
  "areaServed": { "@type": "City", "name": "Wickliffe" },
  "parentOrganization": {
    "@type": "Organization",
    "@id": "https://playacademyusa.com/#organization",
    "name": "Play Academy"
  },
  "award": "Ohio Step Up to Quality (SUTQ) Gold Rating",
  "employee": {
    "@type": "Person",
    "name": "Sonia Texidor Rosa",
    "jobTitle": "Center Administrator"
  },
  "sameAs": [
    "https://www.facebook.com/playacademy.us/"
  ]
}
</script>
```

### Highland Heights variation — change these fields:
- `"@id"`: `"https://playacademyusa.com/highland-hts/#childcare"`
- `"name"`: `"Play Academy - Highland Heights"`
- `"telephone"`: `"+1-440-460-0600"`, `"email"`: `"playacademyinfo@gmail.com"`
- `"streetAddress"`: `"201 Alpha Park"`, `"addressLocality"`: `"Highland Heights"`, `"postalCode"`: `"44143"`
- `"geo"`: lat `41.5498`, lng `-81.4695`
- `"employee"` name: `"Theresa Rolf"`

### Parma Heights variation:
- `"@id"`: `"https://playacademyusa.com/parma-hts/#childcare"`
- `"name"`: `"Play Academy - Parma Heights"`
- `"telephone"`: `"+1-440-884-7529"`, `"email"`: `"playacademy2@gmail.com"`
- `"streetAddress"`: `"6285 Pearl Rd"`, `"addressLocality"`: `"Parma Heights"`, `"postalCode"`: `"44130"`
- `"geo"`: lat `41.3867`, lng `-81.7604`
- `"employee"` name: `"Carmen Santiago"`

---

## Priority 2: Organization + WebSite Schema (Homepage)

```json
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "@id": "https://playacademyusa.com/#organization",
  "name": "Play Academy",
  "alternateName": "Play Academy USA",
  "url": "https://playacademyusa.com",
  "description": "Play Academy is a SUTQ Gold-rated childcare provider operating three centers in Greater Cleveland, OH (Wickliffe, Highland Heights, Parma Heights). Programs range from infant care to school-age using the High/Scope curriculum.",
  "areaServed": ["Wickliffe, OH", "Highland Heights, OH", "Parma Heights, OH", "Lake County, OH", "Cuyahoga County, OH"],
  "contactPoint": [
    { "@type": "ContactPoint", "telephone": "+1-440-520-0031", "contactType": "Admissions", "name": "Wickliffe" },
    { "@type": "ContactPoint", "telephone": "+1-440-460-0600", "contactType": "Admissions", "name": "Highland Heights" },
    { "@type": "ContactPoint", "telephone": "+1-440-884-7529", "contactType": "Admissions", "name": "Parma Heights" }
  ],
  "location": [
    { "@id": "https://playacademyusa.com/wickliffe-3/#childcare" },
    { "@id": "https://playacademyusa.com/highland-hts/#childcare" },
    { "@id": "https://playacademyusa.com/parma-hts/#childcare" }
  ],
  "award": "Ohio Step Up to Quality (SUTQ) Gold Rating — All Three Locations",
  "sameAs": [
    "https://www.facebook.com/playacademy.us/",
    "https://www.instagram.com/playacademywickliffe"
  ]
}
</script>
```

---

## Priority 3: BreadcrumbList

Enable via Yoast SEO → Search Appearance → Breadcrumbs (5-minute task). Yoast auto-generates BreadcrumbList for all pages. No manual JSON-LD needed.

---

## Priority 4: FAQPage Schema (/preschool/)

**Note:** Google retired FAQ rich results May 7, 2026. This schema now primarily helps AI Overviews entity resolution.

```json
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "What age does Play Academy's preschool program accept?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Play Academy's preschool program is for children ages 3 to 5. We also offer infant care (4 weeks–18 months), toddler care (18–36 months), and Universal Pre-K (UPK) programs."
      }
    },
    {
      "@type": "Question",
      "name": "What curriculum does Play Academy use?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Play Academy uses the High/Scope curriculum, a research-based approach emphasizing active participatory learning through STEM exploration, arts and crafts, literacy games, and social-emotional development."
      }
    },
    {
      "@type": "Question",
      "name": "Does Play Academy provide meals?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Yes. Play Academy participates in the CACFP (Child and Adult Care Food Program), a federally funded program. Nutritious breakfast, lunch, and snacks are prepared on-site and included in enrollment."
      }
    },
    {
      "@type": "Question",
      "name": "Is Play Academy accredited by the state of Ohio?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Yes. All three Play Academy locations have earned the SUTQ Gold Rating (Ohio Step Up to Quality), the highest quality rating from the Ohio Department of Job and Family Services."
      }
    }
  ]
}
</script>
```

---

## Priority 5: JobPosting Schema (/jobs/)

9 positions eligible for Google Jobs (3 roles × 3 locations). Add 3 JSON-LD blocks to /jobs/ — one per location, each containing a `@graph` array of 3 `JobPosting` entries.

Key required fields for Google Jobs visibility:
- `title`, `description`, `datePosted`, `hiringOrganization`, `jobLocation`
- `baseSalary` (site lists no salary — add realistic ranges or Google ranks these lower)
- `employmentType`: `["FULL_TIME", "PART_TIME"]`
- `validThrough`: set an expiry date or Google may suppress after 30 days

See the schema agent report for complete JSON-LD examples for Wickliffe (replicate pattern for Highland Heights and Parma Heights).

---

## Local SEO Assessment

### NAP Consistency
| Location | Address | Phone | Status |
|---|---|---|---|
| Wickliffe | 28930 Ridge Rd, Wickliffe, OH 44092 | 440-520-0031 | Consistent ✓ |
| Highland Heights | 201 Alpha Park, Highland Heights, OH 44143 | 440-460-0600 | Minor discrepancy* |
| Parma Heights | 6285 Pearl Rd, Parma Heights, OH 44130 | 440-884-7529 | Consistent ✓ |

*Jobs page shows Highland Heights ZIP as `44124` vs `44143` — verify which is correct and standardize.

### Missing Local Signals
1. **No Google Business Profile URLs** in `sameAs` fields — add GBP links to schema
2. **No map embeds** on /contact/ page — add Google Maps embeds for all 3 locations
3. **Contact form broken** ("Contact form not found") — immediate fix required
4. **No review schema** despite having testimonials on multiple pages
5. **No directory citations** visible (Yelp, Care.com, Daycare.com, GreatSchools, Bing Places)

### Multi-Location Entity Architecture

```
Organization @id: https://playacademyusa.com/#organization
  └── ChildCare @id: https://playacademyusa.com/wickliffe-3/#childcare
  └── ChildCare @id: https://playacademyusa.com/highland-hts/#childcare
  └── ChildCare @id: https://playacademyusa.com/parma-hts/#childcare
```

Each location's `parentOrganization` points to the Organization `@id`. The Organization's `location` array points back to each location `@id`. This linked-entity structure is how Google builds multi-location Knowledge Panels.

---

## Score Breakdown

| Category | Score | Rationale |
|---|---|---|
| Structured Data Presence | 0/25 | Zero JSON-LD, microdata, or RDFa on any page |
| Local Business Signals | 5/20 | NAP in HTML consistent; not in schema; no GBP links |
| Rich Result Eligibility | 0/25 | No JobPosting, no ChildCare, no BreadcrumbList |
| Entity Architecture | 3/15 | Multi-location structure exists in HTML; no schema graph |
| Technical Implementation | 0/15 | Yoast installed but schema output not configured |

**Overall Schema Score: 8/100**
