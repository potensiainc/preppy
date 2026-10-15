# Schoolmap evidence contract

`public/commute/provenance.json` is additive. It does not replace or silently correct `data.json`. The reviewed 2026-10-15 research import adds 61 exact clock-field matches; `research-sources.json` separately exposes the 38-school/163-source audit. Existing third-party attribution and collection date remain visible. All current-operation verification flags remain false.

```json
{
  "schemaVersion": 1,
  "records": [{
    "schoolId": "dataset-school-id",
    "routeId": "optional-exact-dataset-route-id",
    "direction": "하교",
    "sourceStopIndex": 0,
    "field": "정차 시각",
    "value": "source value, optional",
    "sourceUrl": "https://official-school.example/document",
    "sourceLabel": "학교 통학 안내",
    "documentDate": "2026-09-01",
    "sourcePublicationDate": "2026-09-02",
    "attachmentRevisionDate": "2026-09-15",
    "effectiveSchoolYear": "2027",
    "operatingStatus": "Preserve the stated current or planned status; unknown if not stated",
    "reviewedAt": "2026-10-15",
    "verificationStatus": "unverified",
    "conditions": ["Preserve the complete applicability, exception and uncertainty text"],
    "conflicts": ["Describe unresolved conflicts without selecting a preferred value"]
  }]
}
```

This is an illustrative schema, not factual evidence. Dates, URLs and values must come from reviewed research records. Optional fields must be omitted when unknown; the UI says 미확인. `documentDate` is the date on the source document; `effectiveSchoolYear` is its stated applicability, never inferred from document date. `reviewedAt` is actual content review, not collection time.

Allowed statuses: `unverified`, `document_reviewed`, `school_confirmed`, `conflicting`, `inaccessible`. A reachable official page alone does not prove a timetable current or school-confirmed. Record the specific field and conditions. Name/round/grade qualifiers must be preserved in the value and conditions. Publication date, document header date, attachment revision date, effective school year and operating/planned status are independent. Preserve conflicts (including an older document header inside a newer attachment) explicitly. Color-coded restrictions without an identified matching route/stop cannot mark individual records applicable or inapplicable. A future closure is not a present closure. The UI displays these separate fields and the complete conditions/conflicts, not a binary verified badge.

Route and stop scopes are exact; `sourceStopIndex` is the original zero-based index within `data.json`'s route, before splitting directions. Stop-level records require route ID. School-level records omit route, direction and stop; they must not claim field-level verification of all school routes. Unknown IDs, unsupported statuses and unsafe URL schemes are rejected. Selected-stop sources display only for that exact selection. No evidence record grants permission to rewrite the dataset or account state.

`scripts/data/build-commute-research-layer.mjs` is the deterministic adapter for the preserved Library archive. It matches only an exact unique original route name, direction, unique stop name, clock kind and exact clock text. No route/day/round aliases or coordinate correction are inferred. School sources retain original source status and plan/older/secondary distinctions. The importer and unit tests verify all archive manifest hashes; `.gitattributes` disables line-ending conversion for those byte-bound research files. `library-provenance.json` records the existing Library identity/version and archive hash without a signed URL or reupload.
