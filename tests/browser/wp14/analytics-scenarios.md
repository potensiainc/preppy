# WP-14 Analytics Browser Scenarios

The runner uses one dedicated migrated test database and an injected canonical
Test capture. It must make zero requests to Google.

1. Home success emits `home_view`; the primary hero action emits
   `hero_primary_cta_click`.
2. Institution search emits a length bucket and result count, never the raw
   query. The detail success emits `institution_view` once.
3. A PUBLIC Article emits `article_view`. Its structured Institution card emits
   `article_to_institution`.
4. The Article Follow CTA emits `follow_click` plus `article_to_follow`. The
   runner intercepts only the external IdP boundary, installs a signed PENDING
   fixture session, completes real onboarding, and verifies one committed
   Follow. The user-entered email remains canonically UNVERIFIED until a
   separate verification flow; it must not qualify as AMP merely because its
   delivery state is USABLE.
5. Successful My Preppy emits `my_preppy_view` with safe state only.
6. A public 404 emits zero consumer events.
7. The separate Admin shell emits zero consumer events and never loads Google.
8. Captured payloads are scanned for the fixture email, raw query, URL fields,
   child data, provider/Kakao subjects, free text, and legacy IDs.
