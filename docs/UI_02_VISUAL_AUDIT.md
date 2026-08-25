# WP-UI-02 Visual Audit

## Baseline debt

- The Preview used one cream tone across the page, headers, cards, and long-form content. Surfaces were difficult to distinguish without adding more rules.
- Serif headings, a serif wordmark, bronze uppercase English kickers, and very large display type made PREPPY feel like a generic editorial template rather than a precise admissions product.
- Public detail pages reserved full-height sections for absent upcoming and historical opportunities. The resulting whitespace suggested missing content rather than an intentional omission.
- Institution facts repeated their source next to each fact and again in a separate source section. Provenance stayed correct, but the interface gave it more visual weight than the verified fact itself.
- Next App Router navigation preserved the old scroll position when the next route was already visible in the viewport. Deep-page card navigation could therefore land midway down a detail route.
- Mobile did not overflow, but it was primarily a one-column collapse of desktop spacing. The hero and repeated card rows made the page longer than necessary.

## Locked correction

- IBM Plex Sans KR carries Korean text; DM Sans carries Latin text and numerals. Public typography uses weights 400, 500, and 600 only.
- The product uses a bright neutral page, white data surfaces, a quiet secondary surface, hairline rules, and one restrained green accent.
- Controls use 8–10px radii, data cards use 12px radii, shadows are omitted, and status remains the only pill treatment.
- Empty secondary detail groups are omitted. Source provenance is de-duplicated into one explicit source region without changing the underlying DTO or trust semantics.
- A pathname-only public route observer restores the top position after real route changes while preserving same-path query state and normal hash-anchor navigation.
- Mobile has its own spacing, type, button stacking, and single-column information hierarchy at 390px.

## Deliberately unchanged

- Public routes, canonical queries, SEO metadata, Article sanitizer boundaries, Follow/auth behavior, analytics event contracts, and business semantics are unchanged.
- The locked Home hero copy and CTA labels are unchanged.
