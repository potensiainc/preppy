# PREPPY Seed Dataset — Seoul/Gyeonggi v1.0.0

## Purpose

This package is an **automation bootstrap**, not a publication-ready school database. It creates canonical Institution candidates and two initial Source bindings per institution so Codex can import them idempotently and start bounded official-site discovery.

## Scope as of 2026-08-27

- 41 private elementary schools: Seoul 38, Gyeonggi 3
- 22 official foreign schools in Seoul/Gyeonggi that offer an elementary course: Seoul 16, Gyeonggi 6
- 63 Institution seed rows total
- 126 Source seed rows: official registry identity + official website root
- 3 ISI records excluded because they are kindergarten-only or do not offer an elementary course

## Official source roots

- NEIS school basic information dataset: https://open.neis.go.kr/portal/data/service/selectServicePage.do?infId=OPEN17020190531110010104913&infSeq=1&page=1&rows=10&sortColumn=&sortDirection=
- SchoolInfo: https://www.schoolinfo.go.kr/
- ISI Seoul official list: https://www.isi.go.kr/EgovPageLink.do?link=isi/kr/schoolSearch/school02&menuId=B002
- ISI Gyeonggi official list: https://www.isi.go.kr/EgovPageLink.do?link=isi/kr/schoolSearch/school03&menuId=B003

## Important status semantics

- `publication_status=INTERNAL_ONLY`: importing the seed must not publish a page.
- `crawl_status=NOT_STARTED`: a registry-listed website has not yet been fetched by PREPPY.
- `url_http_status=NOT_CHECKED`: reachability, redirects, content type, and crawlability remain collector work.
- `slug_status=PROVISIONAL`: slugs are import candidates, not approved public SEO slugs.
- `registry_record_id_status=PENDING`: identity was confirmed in the official SchoolInfo registry context, but the exact SchoolInfo UUID deep link was not safely resolved and must not be guessed.

## Pending SchoolInfo record IDs (6)

- 유석초등학교
- 상명초등학교
- 청원초등학교
- 중앙대학교사범대학부속초등학교
- 신광초등학교
- 리라초등학교

Codex must reconcile these through official NEIS/SchoolInfo identity data before production import. Matching may use only official name + province + district/address; zero or multiple exact matches must remain unresolved.

## Files

- `preppy_seed_institutions_seoul_gyeonggi_v1.xlsx`: review workbook with Summary, Institutions, Sources, Excluded, QA, and Enums sheets.
- `preppy_seed_institutions_seoul_gyeonggi_v1.csv`: Institution import rows only.
- `preppy_seed_institutions_seoul_gyeonggi_v1.json`: full machine-readable package.
- `PREPPY_CODEX_SEED_DATASET_PROMPT.md`: repository audit + idempotent import prompt.

## Non-goals

This seed does not contain verified tuition, eligibility, curriculum, admission process, Opportunities, or publication-grade Last Verified facts. These must be created through collector → snapshot → extraction candidate → verification/review and tied to official evidence.

## QA rules

1. Exact counts: total 63; private elementary 41; international school 22; Seoul 54; Gyeonggi 9.
2. Every Institution has raw and normalized official website values.
3. `seed_id` and `slug` are unique.
4. Every Institution has one `REGISTRY_IDENTITY` and one `OFFICIAL_WEBSITE_ROOT` Source.
5. No Institution is automatically published.
6. No seed row creates verified Fact or Opportunity records.
7. Missing IDs and uncertain values remain pending/unknown.
8. URL changes, redirects, shared domains, and campuses are reviewable evidence, never silent overwrites.
