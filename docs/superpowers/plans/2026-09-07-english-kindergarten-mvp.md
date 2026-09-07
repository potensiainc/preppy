# PREPPY English Kindergarten MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 영어유치원 25곳의 검증 가능한 스냅샷을 보존하고, 영어유치원 전용 정보 상태·후기 인사이트·비교형 UI를 구현한 뒤 프로덕션 DB에 25곳을 `DRAFT`로 멱등 반입한다.

**Architecture:** 기존 `institutions`, source/snapshot/observation, versioned fact/evidence, opportunity/evidence 구조를 유지한다. 영어유치원 사실값은 유형별 Zod 계약으로 제한하고, 항목별 조사 상태와 후기 요약은 별도 테이블에 둔다. 전용 공개 projection이 기존 기관 API에 영어유치원 요약을 합성하며, 검토된 체크섬 스냅샷만 무알림 트랜잭션으로 반입한다.

**Tech Stack:** Next.js 16.3 App Router, React 19.2, TypeScript 5.9, PostgreSQL 18, Drizzle ORM 0.45/Drizzle Kit 0.31, Zod 4.4, Vitest 4.1, Railway CLI.

**Spec:** [PREPPY 영어유치원 DB MVP 설계](../specs/2026-09-07-english-kindergarten-mvp-design.md)

## Global Constraints

- 사용자 노출 문구와 상태 변환은 `docs/PREPPY_UX_WRITING_POLICY.md`를 따른다.
- 데이터 단위는 25개의 독립 `institution`이며 브랜드–캠퍼스 계층을 추가하지 않는다.
- 초기 프로덕션 반입 상태는 전부 `DRAFT`; 반입 작업에서 `PUBLISHED`로 바꾸지 않는다.
- 미발표, 공식 안내에서 미발견, 접근 실패, 검수 필요, 조사 전을 서로 바꾸지 않는다.
- 비용은 학년도·납부 단위·별도 비용·변경 조건을 보존한다.
- 수집 시각과 운영자 검수 시각을 서로 복사하거나 하나의 날짜로 합치지 않는다.
- 외부 후기는 공식 사실과 분리하고 장문 원문·개인정보·별점·기관 순위를 저장하지 않는다.
- 기존 사립초 41곳과 관련 사실·일정·공개 화면을 수정하거나 재반입하지 않는다.
- 백필은 outbox, notification, delivery, meaningful change를 생성하지 않는다.
- 현재 사용자가 만든 미커밋 변경과 `.npm-cache/`, `.runtime-temp/`, `.superpowers/` 산출물을 커밋하지 않는다.
- 구현 전에 저장소의 `node_modules/next/dist/docs/`에서 App Router 페이지, search params와 Server Component 관련 문서를 읽고 현재 Next.js 16.3 계약을 따른다.

---

## File Structure

### Domain and persistence

- Modify: `src/db/schema/index.ts` — `MEALS`, coverage와 versioned review insight 테이블 및 제약
- Generate: `src/db/migrations/0013_english_kindergarten_profiles.sql` — additive production migration
- Generate: `src/db/migrations/meta/0013_snapshot.json` — Drizzle schema snapshot
- Modify: `src/db/migrations/meta/_journal.json` — migration journal
- Modify: `src/modules/production-safety/migration-manifest.ts` — migration checksum allowlist
- Create: `src/modules/english-kindergarten/fact-values.ts` — 사실 유형별 구조화 값 계약
- Create: `src/modules/english-kindergarten/coverage.ts` — coverage 상태와 공개 문구 변환
- Create: `src/modules/english-kindergarten/review-insight.ts` — 후기 인사이트 계약

### Public and Admin read paths

- Create: `src/modules/english-kindergarten/public-query.server.ts` — 영어유치원 카드·상세 projection
- Modify: `src/modules/public/dto.ts` — 영어유치원 summary/detail DTO
- Modify: `src/modules/public/input.ts` — 구조화 필터와 정렬 검증
- Modify: `src/modules/public/institution-query.server.ts` — category-safe projection 조합
- Modify: `app/_lib/institution-search.ts` — URL search params allowlist
- Create: `app/_components/english-kindergarten-pages.tsx` — 비교 카드와 상세 섹션
- Modify: `app/_components/institution-pages.tsx` — category 기반 전용 view 연결
- Modify: `app/globals.css` — 승인된 A안과 반응형 스타일
- Modify: `src/modules/admin/read-model/contracts.ts` — coverage/review 검수 DTO
- Modify: `src/modules/admin/read-model/institution-query.server.ts` — 관리자 상세 projection
- Modify: `app/admin/(protected)/institutions/[id]/page.tsx` — 영어유치원 조사 상태 표시

### Snapshot and import

- Create: `src/modules/english-kindergarten-import/artifact-schema.ts` — NDJSON/JSON 스냅샷 계약
- Create: `src/modules/english-kindergarten-import/validator.ts` — 행 수·참조·slug·근거·checksum 검증
- Create: `src/modules/english-kindergarten-import/planner.server.ts` — read-only import plan
- Create: `src/modules/english-kindergarten-import/importer.server.ts` — 무알림 트랜잭션 apply
- Create: `src/modules/english-kindergarten-import/cli.server.ts` — dry-run/apply CLI 경계
- Create: `scripts/data/import-english-kindergarten-mvp.ts` — CLI entry point
- Modify: `package.json` — `data:import-english-kindergarten-mvp` script
- Create: `data/snapshots/preppy/english-kindergarten/sg-ek-20260901-r01/campuses.ndjson`
- Create: `data/snapshots/preppy/english-kindergarten/sg-ek-20260901-r01/evidence.ndjson`
- Create: `data/snapshots/preppy/english-kindergarten/sg-ek-20260901-r01/progress.json`
- Create: `data/snapshots/preppy/english-kindergarten/sg-ek-20260901-r01/preppy-import.snapshot.json`
- Create: `data/snapshots/preppy/english-kindergarten/sg-ek-20260901-r01/manifest.json`
- Create: `data/snapshots/preppy/english-kindergarten/sg-ek-20260901-r01/verification.json`
- Create: `docs/data/PREPPY_ENGLISH_KINDERGARTEN_MVP_IMPORT_REPORT.md`

### Tests

- Create: `tests/unit/english-kindergarten-fact-values.test.ts`
- Create: `tests/unit/english-kindergarten-coverage.test.ts`
- Create: `tests/unit/english-kindergarten-artifact.test.ts`
- Create: `tests/unit/english-kindergarten-public-ui.test.ts`
- Create: `tests/integration/english-kindergarten-schema.test.ts`
- Create: `tests/integration/english-kindergarten-import.test.ts`
- Create: `tests/integration/english-kindergarten-public-query.test.ts`
- Modify: `tests/unit/wp16a-migration-manifest.test.ts`

---

### Task 1: Typed English-kindergarten fact contracts

**Files:**
- Create: `src/modules/english-kindergarten/fact-values.ts`
- Create: `src/modules/english-kindergarten/coverage.ts`
- Create: `src/modules/english-kindergarten/review-insight.ts`
- Create: `tests/unit/english-kindergarten-fact-values.test.ts`
- Create: `tests/unit/english-kindergarten-coverage.test.ts`

**Interfaces:**
- Produces: `parseEnglishKindergartenFactValue(factType, value)` returning a discriminated `EnglishKindergartenFactValue`
- Produces: `parseReviewInsightValue(value)` returning `ReviewInsightValue`
- Produces: `coverageMessage(section, status)` returning the policy-approved Korean copy or `null`
- Consumes: `InstitutionFactType` from `src/db/schema/index.ts`

- [ ] **Step 1: Write failing fact contract tests**

```ts
import { describe, expect, it } from "vitest";
import { parseEnglishKindergartenFactValue } from "@/src/modules/english-kindergarten/fact-values";

describe("English-kindergarten fact values", () => {
  it("keeps tuition year, cadence, extras, and uncertainty together", () => {
    expect(
      parseEnglishKindergartenFactValue("TUITION", {
        academicYearLabel: "2026학년도",
        billingCadence: "MONTHLY",
        currency: "KRW",
        amountMin: 1850000,
        amountMax: 1850000,
        programFees: [],
        extraCosts: [{ label: "교재비", amount: null, cadence: null }],
        includedItems: [],
        refundTerms: null,
        changeNote: "반에 따라 달라질 수 있어요.",
      }),
    ).toMatchObject({ billingCadence: "MONTHLY", amountMin: 1850000 });
  });

  it("rejects a bare tuition amount without its basis", () => {
    expect(() =>
      parseEnglishKindergartenFactValue("TUITION", { amountMin: 1850000 }),
    ).toThrow();
  });
});
```

- [ ] **Step 2: Run the fact tests and verify the missing-module failure**

Run: `npx vitest run tests/unit/english-kindergarten-fact-values.test.ts`

Expected: FAIL because `fact-values.ts` does not exist.

- [ ] **Step 3: Implement explicit Zod schemas**

Implement these exact exported contracts:

```ts
export type EnglishKindergartenFactType =
  | "TUITION"
  | "TARGET_AGE_GRADE"
  | "CURRICULUM"
  | "TRANSPORT"
  | "MEALS"
  | "ADMISSION_PROCESS"
  | "OPERATING_INFO";

export function parseEnglishKindergartenFactValue(
  factType: EnglishKindergartenFactType,
  value: unknown,
): EnglishKindergartenFactValue;
```

Define strict schemas for the fields in spec section 5.2, require `academicYearLabel` or `validityNote` for tuition, reject negative KRW amounts, and reject `minAge > maxAge`.

- [ ] **Step 4: Write failing coverage copy tests**

```ts
expect(coverageMessage("TUITION", "NOT_RESEARCHED")).toBe(
  "원비 정보를 준비하고 있어요.",
);
expect(coverageMessage("TUITION", "CHECKED_NOT_FOUND")).toBe(
  "확인한 공식 안내에서 원비 정보를 찾지 못했어요.",
);
expect(coverageMessage("TUITION", "ACCESS_FAILED")).toBe(
  "기관 페이지를 불러오지 못해 원비를 확인하지 못했어요.",
);
expect(coverageMessage("TUITION", "CONFIRMED")).toBeNull();
```

- [ ] **Step 5: Implement coverage and review contracts**

Use section values `TUITION`, `INFORMATION_SESSION`, `TARGET_AGE_GRADE`, `CURRICULUM`, `TRANSPORT`, `MEALS`, `REVIEWS`, `OPERATING_INFO`; status values `NOT_RESEARCHED`, `CONFIRMED`, `CHECKED_NOT_FOUND`, `ACCESS_FAILED`, `NEEDS_REVIEW`. Review themes require a non-empty neutral `summary`, optional `mentionCount`, and no rating field.

- [ ] **Step 6: Run focused tests**

Run: `npx vitest run tests/unit/english-kindergarten-fact-values.test.ts tests/unit/english-kindergarten-coverage.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/modules/english-kindergarten tests/unit/english-kindergarten-fact-values.test.ts tests/unit/english-kindergarten-coverage.test.ts
git commit -m "feat: define english kindergarten information contracts"
```

---

### Task 2: Additive schema and migration

**Files:**
- Modify: `src/db/schema/index.ts`
- Generate: `src/db/migrations/0013_english_kindergarten_profiles.sql`
- Generate: `src/db/migrations/meta/0013_snapshot.json`
- Modify: `src/db/migrations/meta/_journal.json`
- Modify: `src/modules/production-safety/migration-manifest.ts`
- Create: `tests/integration/english-kindergarten-schema.test.ts`
- Modify: `tests/unit/wp16a-migration-manifest.test.ts`

**Interfaces:**
- Produces: schema exports `institutionSectionCoverages`, `institutionReviewInsights`, `institutionReviewInsightVersions`, `institutionReviewInsightVersionEvidence`
- Produces: fact type `MEALS`
- Consumes: Task 1 section/status/review value names

- [ ] **Step 1: Write failing schema invariant tests**

```ts
it("allows one current coverage state per institution and section", async () => {
  await insertCoverage({ institutionId, section: "TUITION", status: "NOT_RESEARCHED" });
  await expect(
    insertCoverage({ institutionId, section: "TUITION", status: "NEEDS_REVIEW" }),
  ).rejects.toThrow();
});

it("requires current review insight versions to be verified", async () => {
  await expect(
    insertReviewVersion({ insightId, verificationState: "UNVERIFIED", isCurrent: true }),
  ).rejects.toThrow();
});
```

Also assert that a coverage snapshot cannot reference a different source and that `MEALS` is accepted while an unknown fact type is rejected.

- [ ] **Step 2: Run the schema test and verify it fails**

Run: `npx vitest run tests/integration/english-kindergarten-schema.test.ts`

Expected: FAIL because the schema exports and database objects do not exist.

- [ ] **Step 3: Add the schema definitions**

Add `MEALS` to both `institutionFactTypeValues` and the matching SQL check. Define:

```ts
institution_section_coverages(
  institution_id,
  section,
  status,
  source_id nullable,
  source_snapshot_id nullable,
  academic_year_label nullable,
  public_note nullable,
  internal_note nullable,
  last_collected_at nullable,
  last_checked_at not null,
  created_at,
  updated_at
)
```

Use composite primary key `(institution_id, section)`, enum checks, non-blank optional notes/year, and a composite snapshot/source foreign key. Define a review root unique by institution, non-branching numbered versions, one current version, current-implies-verified, verified-implies-`verified_at`, strict positive sample size, JSON array themes, and evidence joins equivalent to fact evidence.

- [ ] **Step 4: Generate the named migration**

Run: `npm run db:generate -- --name english_kindergarten_profiles`

Expected: `src/db/migrations/0013_english_kindergarten_profiles.sql`, `meta/0013_snapshot.json`, and journal entry are created.

- [ ] **Step 5: Review the generated SQL before running it**

Verify the SQL only adds the new tables, indexes, checks and `MEALS` check replacement. It must not drop or rewrite institution, opportunity, fact, user, article, notification, or source data.

- [ ] **Step 6: Update the migration manifest**

Run `Get-FileHash -Algorithm SHA256 src/db/migrations/0013_english_kindergarten_profiles.sql` and add identifier `0013_english_kindergarten_profiles` with the lowercase hash to `EXPECTED_REPOSITORY_MIGRATIONS`.

- [ ] **Step 7: Run migration and schema checks against the test database**

Run: `npm run db:migrate`

Run: `npx vitest run tests/integration/english-kindergarten-schema.test.ts tests/unit/wp16a-migration-manifest.test.ts tests/integration/wp03-schema-invariants.test.ts`

Expected: PASS with no existing invariant regression.

- [ ] **Step 8: Commit**

```bash
git add src/db/schema/index.ts src/db/migrations src/modules/production-safety/migration-manifest.ts tests/integration/english-kindergarten-schema.test.ts tests/unit/wp16a-migration-manifest.test.ts
git commit -m "feat: add english kindergarten profile persistence"
```

---

### Task 3: English-kindergarten public projection and filters

**Files:**
- Create: `src/modules/english-kindergarten/public-query.server.ts`
- Modify: `src/modules/public/dto.ts`
- Modify: `src/modules/public/input.ts`
- Modify: `src/modules/public/institution-query.server.ts`
- Modify: `app/_lib/institution-search.ts`
- Create: `tests/integration/english-kindergarten-public-query.test.ts`
- Modify: `tests/unit/wp06a-public-contract.test.ts`

**Interfaces:**
- Produces: `EnglishKindergartenCardSummaryDTO`, `EnglishKindergartenDetailDTO`, `EnglishKindergartenSectionDTO`
- Produces: `loadEnglishKindergartenCardSummaries(executor, institutionIds)` and `loadEnglishKindergartenDetail(executor, institutionId)`
- Consumes: current verified fact versions, coverage rows, current verified review insight, published native opportunities

- [ ] **Step 1: Write failing query tests with two English-kindergarten fixtures and one private school**

```ts
const result = await listInstitutions(executor, {
  category: "ENGLISH_KINDERGARTEN",
  minAge: 4,
  transport: "AVAILABLE",
  sort: "NAME_ASC",
  page: 1,
  pageSize: 20,
});

expect(result.items.map((item) => item.category)).toEqual([
  "ENGLISH_KINDERGARTEN",
]);
expect(result.items[0]?.englishKindergarten).toMatchObject({
  ageRange: { min: 4, max: 6 },
  transport: { state: "AVAILABLE" },
});
```

Add cases for DRAFT exclusion, no fallback to private schools, tuition sorting only when `billingCadence` and academic year are comparable, next `INFORMATION_SESSION`, coverage message, official facts vs review insight separation, and collection/verification timestamps.

- [ ] **Step 2: Run the query tests and verify the contract failure**

Run: `npx vitest run tests/integration/english-kindergarten-public-query.test.ts tests/unit/wp06a-public-contract.test.ts`

Expected: FAIL because the new DTOs and query module do not exist.

- [ ] **Step 3: Extend the public input contract**

Add optional fields only for explicit English-kindergarten searches:

```ts
type EnglishKindergartenSort = "NAME_ASC" | "INFO_SESSION_ASC" | "TUITION_ASC";
type TransportFilter = "AVAILABLE";

type InstitutionListQuery = {
  category?: InstitutionCategory;
  region?: string;
  recruitmentState?: OpportunityBusinessState;
  query?: string;
  minAge?: number;
  transport?: TransportFilter;
  hasUpcomingInfoSession?: boolean;
  sort?: EnglishKindergartenSort;
  page: number;
  pageSize: number;
};
```

Reject or ignore English-kindergarten-only values unless `category === "ENGLISH_KINDERGARTEN"`; never broaden invalid category input to a private-school query.

- [ ] **Step 4: Implement the English-kindergarten projection**

Load only current `VERIFIED` fact/review versions. Restrict public institution roots to `PUBLISHED`. Derive public coverage copy with Task 1’s `coverageMessage`; do not expose `internal_note`. Select the nearest non-cancelled `INFORMATION_SESSION` by event start and keep application close separate.

- [ ] **Step 5: Integrate projection into the existing institution query**

Add optional `englishKindergarten` fields to card/detail DTOs. Preserve the existing generic result for private elementary and international school categories. Change no private-school fact or opportunity ordering.

- [ ] **Step 6: Run focused and regression tests**

Run: `npx vitest run tests/integration/english-kindergarten-public-query.test.ts tests/integration/wp06a-institution-query.test.ts tests/unit/wp06a-public-contract.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/modules/english-kindergarten/public-query.server.ts src/modules/public/dto.ts src/modules/public/input.ts src/modules/public/institution-query.server.ts app/_lib/institution-search.ts tests/integration/english-kindergarten-public-query.test.ts tests/unit/wp06a-public-contract.test.ts
git commit -m "feat: project english kindergarten comparison data"
```

---

### Task 4: Comparison-first list and answer-first detail UI

**Files:**
- Create: `app/_components/english-kindergarten-pages.tsx`
- Modify: `app/_components/institution-pages.tsx`
- Modify: `app/globals.css`
- Create: `tests/unit/english-kindergarten-public-ui.test.ts`
- Modify: `tests/unit/wp07-institution-pages.test.ts`

**Interfaces:**
- Consumes: Task 3 DTOs and URL filters
- Produces: `EnglishKindergartenListContent` and `EnglishKindergartenDetailContent`
- Preserves: `InstitutionListView` and `InstitutionDetailView` generic/private-school behavior

- [ ] **Step 1: Read the current Next.js 16.3 local docs**

Run:

```powershell
rg -n "searchParams|Server Component|Page Props" node_modules/next/dist/docs
```

Read the matching App Router page and search-params documents completely before changing the route-facing components.

- [ ] **Step 2: Write failing render-contract tests**

```ts
expect(source).toContain("조건에 맞는 곳을 바로 비교해 보세요");
expect(source).toContain("월 원비");
expect(source).toContain("운영 연령");
expect(source).toContain("셔틀");
expect(source).toContain("다음 설명회");
expect(source).toContain("공개 후기 요약 · 공식 정보 아님");
expect(source).toContain("기관 공식 홈페이지 열기");
```

Also assert that `Evidence`, `VERIFIED`, `Snapshot`, `정보 없음`, fake amounts, fake dates and disabled empty action buttons are absent.

- [ ] **Step 3: Run the UI tests and verify they fail**

Run: `npx vitest run tests/unit/english-kindergarten-public-ui.test.ts tests/unit/wp07-institution-pages.test.ts`

Expected: FAIL because the English-kindergarten component is missing.

- [ ] **Step 4: Implement the approved comparison-first list**

Render the search field, region, confirmed tuition, age, shuttle and upcoming information-session filters only when the selected category is English kindergarten. Default to 가나다순. Card order is institution name/address, then monthly tuition with year/cadence, age, shuttle, next information session and per-field coverage copy.

- [ ] **Step 5: Implement the approved detail layout**

Render the four-part decision summary followed by anchor links and sections: 원비, 입학설명회, 연령·커리큘럼, 셔틀, 급식, 후기 요약, 공식 출처. Omit unsupported action buttons. Keep application close text beside its information session, and show collection and verification dates with separate labels.

- [ ] **Step 6: Add responsive and accessibility styles**

At `max-width: 800px`, collapse summary cards to two columns; at `max-width: 640px`, use one column where text would overflow and horizontal scrolling for the anchor row. Preserve 44px interactive targets, visible focus, 200% zoom usability and `prefers-reduced-motion` behavior.

- [ ] **Step 7: Run UI regression checks**

Run: `npx vitest run tests/unit/english-kindergarten-public-ui.test.ts tests/unit/wp07-institution-pages.test.ts tests/unit/preppy-ux-writing.test.ts`

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add app/_components/english-kindergarten-pages.tsx app/_components/institution-pages.tsx app/globals.css tests/unit/english-kindergarten-public-ui.test.ts tests/unit/wp07-institution-pages.test.ts
git commit -m "feat: add english kindergarten comparison experience"
```

---

### Task 5: Admin coverage and review visibility

**Files:**
- Modify: `src/modules/admin/read-model/contracts.ts`
- Modify: `src/modules/admin/read-model/institution-query.server.ts`
- Modify: `app/admin/(protected)/institutions/[id]/page.tsx`
- Create: `tests/integration/english-kindergarten-admin-read.test.ts`
- Modify: `tests/unit/wp11-admin-read-ui.test.ts`

**Interfaces:**
- Produces: `AdminEnglishKindergartenCoverageDTO` and `AdminReviewInsightSummaryDTO`
- Consumes: Task 2 tables
- Exposes no mutation route; this task is review visibility only

- [ ] **Step 1: Write failing Admin projection tests**

Assert that an English-kindergarten admin detail returns all eight coverage sections, source/snapshot reference, separate collection/check dates and review verification state. Assert that private-school DTOs do not receive an English-kindergarten block.

- [ ] **Step 2: Run the tests and verify they fail**

Run: `npx vitest run tests/integration/english-kindergarten-admin-read.test.ts tests/unit/wp11-admin-read-ui.test.ts`

Expected: FAIL on missing contracts.

- [ ] **Step 3: Implement read-model composition**

Add `englishKindergarten: { coverages, reviewInsight } | null` to `AdminInstitutionDTO`. Query only when category matches. Return `internalNote` only in Admin; do not pass it to public DTOs.

- [ ] **Step 4: Add the read-only Admin sections**

Show `정보 확인 상태` with eight rows and `후기 요약 검수` separately. Use `자료 수집`, `내용 확인`, `공식 안내에서 미발견`, `페이지 접근 실패`, `검수 필요` labels rather than raw enum labels.

- [ ] **Step 5: Run Admin tests**

Run: `npx vitest run tests/integration/english-kindergarten-admin-read.test.ts tests/unit/wp11-admin-read-ui.test.ts tests/unit/wp11-admin-route-layout.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/modules/admin/read-model/contracts.ts src/modules/admin/read-model/institution-query.server.ts app/admin/(protected)/institutions/[id]/page.tsx tests/integration/english-kindergarten-admin-read.test.ts tests/unit/wp11-admin-read-ui.test.ts
git commit -m "feat: show english kindergarten research coverage in admin"
```

---

### Task 6: Snapshot contracts and validator

**Files:**
- Create: `src/modules/english-kindergarten-import/artifact-schema.ts`
- Create: `src/modules/english-kindergarten-import/validator.ts`
- Create: `tests/unit/english-kindergarten-artifact.test.ts`

**Interfaces:**
- Produces: `loadEnglishKindergartenPackage(directory)` returning `EnglishKindergartenImportPackage`
- Produces: `validateEnglishKindergartenPackage(package)` returning a frozen `ValidationReport`
- Consumes: Task 1 fact/coverage contracts

- [ ] **Step 1: Write failing artifact validation tests**

```ts
expect(report.counts).toEqual({
  campuses: 25,
  evidence: expectedEvidenceCount,
  districts: { 강남구: 13, 서초구: 12 },
  legalDongs: { 신사동: 13, 잠원동: 1, 반포동: 11 },
});
expect(report.duplicateSlugs).toEqual([]);
expect(report.missingEvidenceCampusIds).toEqual([]);
expect(report.checksumsValid).toBe(true);
```

Build fixture values inside the test so `expectedEvidenceCount` is calculated from the fixture evidence array, not a hard-coded unexplained number. Add rejection cases for malformed NDJSON, duplicate slug, unknown campus reference, missing operation/classification evidence, full HTML excerpts, invalid URL, inconsistent progress count and checksum mismatch.

- [ ] **Step 2: Run and verify the missing-module failure**

Run: `npx vitest run tests/unit/english-kindergarten-artifact.test.ts`

Expected: FAIL because the artifact module is missing.

- [ ] **Step 3: Implement strict file contracts**

Use these top-level contracts:

```ts
type CampusRecord = {
  campusId: string;
  displayName: string;
  slug: string;
  addressLine: string;
  district: "강남구" | "서초구";
  legalDong: "신사동" | "잠원동" | "반포동";
  operationalState: "ACTIVE" | "UNKNOWN";
  classificationState: "CONFIRMED";
  officialChannels: Array<{ kind: "WEBSITE" | "BLOG" | "SOCIAL" | "PHONE"; value: string }>;
  collectedAt: string;
};

type EvidenceRecord = {
  evidenceId: string;
  campusId: string;
  claimType: "IDENTITY" | "OPERATION" | "CLASSIFICATION" | "ADMISSION" | "FACT";
  sourceUrl: string;
  sourceType: SourceType;
  authorityLevel: "PRIMARY" | "SECONDARY_OFFICIAL" | "THIRD_PARTY";
  boundedExcerpt: string;
  collectedAt: string;
  sourceContentSha256: string;
};
```

Limit excerpts to 2,000 characters, packages to 2 MiB, and accept only HTTPS source URLs except a source proven to redirect from HTTP and recorded with its final HTTPS URL.

- [ ] **Step 4: Implement cross-file and checksum validation**

Require exactly 25 campus lines, unique `campusId` and slug, exact regional totals, at least identity+operation+classification evidence for every campus, exact manifest file hashes, and a `preppy-import.snapshot.json` checksum over canonical JSON. `progress.json` totals must equal the NDJSON-derived totals.

- [ ] **Step 5: Run the artifact tests**

Run: `npx vitest run tests/unit/english-kindergarten-artifact.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/modules/english-kindergarten-import/artifact-schema.ts src/modules/english-kindergarten-import/validator.ts tests/unit/english-kindergarten-artifact.test.ts
git commit -m "feat: validate english kindergarten snapshot packages"
```

---

### Task 7: Restore and verify the 25-campus snapshot

**Files:**
- Create: `data/snapshots/preppy/english-kindergarten/sg-ek-20260901-r01/campuses.ndjson`
- Create: `data/snapshots/preppy/english-kindergarten/sg-ek-20260901-r01/evidence.ndjson`
- Create: `data/snapshots/preppy/english-kindergarten/sg-ek-20260901-r01/progress.json`
- Create: `data/snapshots/preppy/english-kindergarten/sg-ek-20260901-r01/preppy-import.snapshot.json`
- Create: `data/snapshots/preppy/english-kindergarten/sg-ek-20260901-r01/manifest.json`
- Create: `data/snapshots/preppy/english-kindergarten/sg-ek-20260901-r01/verification.json`

**Interfaces:**
- Produces: immutable reviewed package `sg-ek-20260901-r01`
- Consumes: Task 6 loader/validator
- Historical evidence source: Codex task `영유 전수조사(서울경기)`, id `01a058cd-300b-7fd0-8b46-8e65731d8936`

The package must contain these exact 25 independent institution records:

| 법정동 | 기관명 | 주소 |
| --- | --- | --- |
| 신사동 | GEA 강남잉글리쉬아카데미 | 강남구 언주로164길 12 |
| 신사동 | 몬테키즈 | 강남구 논현로152길 30 |
| 신사동 | LS 압구정 | 강남구 압구정로30길 62, 1~2층 |
| 신사동 | Gate 압구정 | 강남구 압구정로 206 |
| 신사동 | AppleTree 압구정 | 강남구 압구정로 206 |
| 신사동 | DEP 도산·대치잉글리쉬파크 압구정 | 강남구 언주로164길 16 |
| 신사동 | 프뢰벨영어은물 | 강남구 압구정로32길 11 |
| 신사동 | 설리번 프렙·SPS | 강남구 도산대로17길 21 |
| 신사동 | ANKids | 강남구 압구정로18길 25, 2층 |
| 신사동 | Revere | 강남구 도산대로23길 42 |
| 신사동 | C-Gate | 강남구 압구정로18길 25, 3~4층 |
| 신사동 | PSA 압구정 | 강남구 압구정로 206, 2~3층 |
| 신사동 | PODO Club | 강남구 논현로153길 45 |
| 잠원동 | 플럼어학원 | 서초구 잠원로8길 13, 4층 |
| 반포동 | RISE 서초 | 서초구 고무래로10길 26, 2층 |
| 반포동 | i-Garten 반포 | 서초구 고무래로10길 27, 5~6층 |
| 반포동 | 서강SLP 서초 | 서초구 고무래로 6-10 |
| 반포동 | 서초SCE | 서초구 서초중앙로 225, 3층 |
| 반포동 | BIS | 서초구 고무래로10길 27, 2층 |
| 반포동 | SOT | 서초구 서초중앙로31길 14-4 |
| 반포동 | Wyatt | 서초구 동광로33길 10-6 |
| 반포동 | EELC Kinder | 서초구 고무래로10-5, 5~6층 |
| 반포동 | Little Learners | 서초구 서래로5길 61 |
| 반포동 | Stella K 서초 | 서초구 신반포로 23, 3층 |
| 반포동 | 비탑키즈학원 | 서초구 고무래로10길 42, 2층 |

- [ ] **Step 1: Reconstruct records from the historical task without inventing values**

Use the task id above and its completed child results. If a phone, official URL, fee, age or schedule was not in the record, leave the structured value absent and set the corresponding coverage state; do not infer it from marketing copy or a search snippet.

- [ ] **Step 2: Re-open every cited source and record the current fetch result**

For each evidence URL, store final URL, source type, collected timestamp, bounded excerpt and content hash. A failed page becomes `ACCESS_FAILED`; a missing statement after a successful official-page check becomes `CHECKED_NOT_FOUND`. Third-party academy directories or recruitment sites remain `THIRD_PARTY` and cannot satisfy the official-source publication gate.

- [ ] **Step 3: Resolve the two known identity hazards explicitly**

Store Revere only at `도산대로23길 42`; preserve `언주로153길 10-8` only as rejected historical-address evidence. Store only `LS 압구정` at 1~2층 in the approved 25; keep the separately registered GLS 3~4층 record outside this snapshot because it remained a phone-verification candidate. Do not create a twenty-sixth row or a brand hierarchy.

- [ ] **Step 4: Write the three requested source files**

Write one JSON object per line to `campuses.ndjson` and `evidence.ndjson`. Write `progress.json` with `confirmed=25`, `excluded=0`, `held=0`, `recordsReviewed=25`, district totals `강남구=13`, `서초구=12`, and legal-dong totals `신사동=13`, `잠원동=1`, `반포동=11` only after Task 6 validation derives the same values. Store current source fetch success, access failure and checked-not-found counts separately rather than calling every source current.

- [ ] **Step 5: Build the DB import snapshot**

Map all 25 roots to category `ENGLISH_KINDERGARTEN`, publication `DRAFT`, their evidence sources, initial coverage states, and only evidence-backed facts/opportunities. Do not emit `institution_registry_identities` with `SCHOOLINFO` or `ISI` for these institutions.

- [ ] **Step 6: Generate manifest and verification report**

Hash the four source/import files with SHA-256, store the hashes in `manifest.json`, run `validateEnglishKindergartenPackage`, and write its exact result to `verification.json`. The report status is `PASS` only when all validation error arrays are empty.

- [ ] **Step 7: Run snapshot validation twice**

Run: `npm run data:import-english-kindergarten-mvp -- --package data/snapshots/preppy/english-kindergarten/sg-ek-20260901-r01 --validate-only`

Repeat the same command and compare the canonical report checksum.

Expected: both runs report 25 campuses, `PASS`, identical package checksum, zero duplicate slugs, zero missing required evidence and exact region totals.

- [ ] **Step 8: Commit**

```bash
git add data/snapshots/preppy/english-kindergarten/sg-ek-20260901-r01
git commit -m "data: preserve reviewed english kindergarten snapshot"
```

---

### Task 8: Idempotent DRAFT importer and CLI

**Files:**
- Create: `src/modules/english-kindergarten-import/planner.server.ts`
- Create: `src/modules/english-kindergarten-import/importer.server.ts`
- Create: `src/modules/english-kindergarten-import/cli.server.ts`
- Create: `scripts/data/import-english-kindergarten-mvp.ts`
- Modify: `package.json`
- Create: `tests/integration/english-kindergarten-import.test.ts`

**Interfaces:**
- Produces: `planEnglishKindergartenImport(executor, package)` with no writes
- Produces: `applyEnglishKindergartenImport(transactionManager, package, expectedChecksum)`
- Produces CLI modes: `--validate-only`, `--dry-run`, and `--apply` combined with a required 64-character `--expected-checksum` value
- Consumes: Task 6 validated package and Task 2 schema

- [ ] **Step 1: Write failing planner/importer tests**

Test a clean 25-campus plan, exact second-run no-op, checksum mismatch rejection, wrong category collision rejection, same slug/different identity rejection, rollback on evidence failure, DRAFT-only roots and zero side-effect deltas.

```ts
expect(first.created.institutions).toBe(25);
expect(first.created.outboxEvents).toBe(0);
expect(second.created.total).toBe(0);
expect(second.unchanged.institutions).toBe(25);
expect(second.sideEffects).toEqual({
  outboxEvents: 0,
  notifications: 0,
  deliveries: 0,
  meaningfulChanges: 0,
});
```

- [ ] **Step 2: Run and verify the missing-module failure**

Run: `npx vitest run tests/integration/english-kindergarten-import.test.ts`

Expected: FAIL because planner/importer modules do not exist.

- [ ] **Step 3: Implement the read-only planner**

Plan `CREATE`, `UPDATE`, `UNCHANGED`, `REJECT` per institution, source, binding, coverage, fact/version/evidence, opportunity/version/evidence and review insight. Any `REJECT` makes the package ineligible for apply. Planner must never call `insert`, `update`, `delete`, raw DDL or mutation services.

- [ ] **Step 4: Implement the transaction importer**

Acquire a PostgreSQL advisory transaction lock scoped to `sg-ek-20260901-r01`, re-check checksum inside the operation, and apply the accepted plan. Create DRAFT institutions, sources/snapshots/observations, coverage rows and evidence-backed versions. Backfill must not call live verification services or emit outbox events.

- [ ] **Step 5: Implement strict CLI modes**

`--apply` must require both the exact checksum and `ALLOW_PRODUCTION_ENGLISH_KINDERGARTEN_IMPORT=1`. Default invocation is read-only dry-run. Print JSON containing package checksum, target environment classification, planned counts, applied counts, rejects and side-effect deltas. Never print database credentials.

- [ ] **Step 6: Add the package script**

```json
"data:import-english-kindergarten-mvp": "tsx --tsconfig scripts/db/tsconfig.json scripts/data/import-english-kindergarten-mvp.ts"
```

- [ ] **Step 7: Run importer tests and local two-run proof**

Run: `npx vitest run tests/integration/english-kindergarten-import.test.ts`

Run the snapshot CLI once with `--dry-run`, once with `--apply` against the disposable integration database, and again with `--dry-run`.

Expected: first plan creates 25; apply creates 25 DRAFT institutions with zero side effects; second plan is a no-op.

- [ ] **Step 8: Commit**

```bash
git add src/modules/english-kindergarten-import scripts/data/import-english-kindergarten-mvp.ts package.json tests/integration/english-kindergarten-import.test.ts
git commit -m "feat: import reviewed english kindergarten snapshots"
```

---

### Task 9: Full local verification and import report

**Files:**
- Create: `docs/data/PREPPY_ENGLISH_KINDERGARTEN_MVP_IMPORT_REPORT.md`

**Interfaces:**
- Consumes: Tasks 1–8
- Produces: reproducible pre-production verification evidence

- [ ] **Step 1: Run formatting and static checks**

Run:

```powershell
npm run format:check
npm run lint
npm run typecheck
```

Expected: all exit 0.

- [ ] **Step 2: Run focused data and product tests**

Run:

```powershell
npx vitest run tests/unit/english-kindergarten-fact-values.test.ts tests/unit/english-kindergarten-coverage.test.ts tests/unit/english-kindergarten-artifact.test.ts tests/unit/english-kindergarten-public-ui.test.ts tests/integration/english-kindergarten-schema.test.ts tests/integration/english-kindergarten-import.test.ts tests/integration/english-kindergarten-public-query.test.ts tests/integration/english-kindergarten-admin-read.test.ts
```

Expected: all PASS.

- [ ] **Step 3: Run the full suite and production build**

Run:

```powershell
npm test
npm run build
```

Expected: all tests PASS and Next production build exits 0.

- [ ] **Step 4: Verify the reviewed package once more**

Run the Task 7 `--validate-only` command and compare the printed checksum to `manifest.json` and `verification.json`.

- [ ] **Step 5: Write the pre-production report**

Record commands, timestamps, exact test counts, package checksum, campus/evidence counts, district totals, DRAFT-only assertion, side-effect delta and remaining coverage gaps. Record browser/mobile/assistive-technology checks as not performed unless they were actually executed.

- [ ] **Step 6: Commit**

```bash
git add docs/data/PREPPY_ENGLISH_KINDERGARTEN_MVP_IMPORT_REPORT.md
git commit -m "docs: record english kindergarten preproduction verification"
```

---

### Task 10: Production migration and DRAFT import

**Files:**
- Modify after execution: `docs/data/PREPPY_ENGLISH_KINDERGARTEN_MVP_IMPORT_REPORT.md`

**Interfaces:**
- Consumes: the committed migration, importer and immutable package checksum
- Produces: 25 snapshot institutions present as `DRAFT` in Railway production
- Must not produce: published English-kindergarten pages, notifications or changes to private elementary data

- [ ] **Step 1: Capture a read-only production baseline**

Run a Railway production query through the `preppy-web` service and record counts for all institutions by category/publication/operational state, the 25 target slugs, sources, facts, opportunities, outbox events, notifications and deliveries. Confirm the linked Railway project is `preppy-production`, environment `production`, service `preppy-web`.

- [ ] **Step 2: Run production preflight**

Run:

```powershell
railway ssh --service preppy-web --environment production 'npm run db:preflight:production'
```

Expected: migration inventory is valid and no production-safety blocker is reported.

- [ ] **Step 3: Run a production read-only import plan**

Run:

```powershell
railway ssh --service preppy-web --environment production './node_modules/.bin/tsx --tsconfig scripts/db/tsconfig.json scripts/data/import-english-kindergarten-mvp.ts --package=data/snapshots/preppy/english-kindergarten/sg-ek-20260901-r01 --dry-run'
```

Expected: checksum matches the reviewed manifest; no rejects; target roots plan as DRAFT; no write count changes after rerunning the baseline query.

- [ ] **Step 4: Apply the additive migration**

Run:

```powershell
railway ssh --service preppy-web --environment production 'npm run db:migrate'
```

Expected: migration `0013_english_kindergarten_profiles` is applied once; existing schema invariant checks remain valid.

- [ ] **Step 5: Apply the immutable snapshot once**

Read `preppyImportChecksum` from the committed `manifest.json`, set it as a PowerShell variable named `$englishKindergartenChecksum`, then run:

```powershell
railway ssh --service preppy-web --environment production "ALLOW_PRODUCTION_ENGLISH_KINDERGARTEN_IMPORT=1 ./node_modules/.bin/tsx --tsconfig scripts/db/tsconfig.json scripts/data/import-english-kindergarten-mvp.ts --package=data/snapshots/preppy/english-kindergarten/sg-ek-20260901-r01 --apply --expected-checksum=$englishKindergartenChecksum"
```

Expected: transaction commits with no rejects and zero notification/outbox/change side effects.

- [ ] **Step 6: Run read-only post-import verification**

Verify all 25 target slugs exist exactly once with category `ENGLISH_KINDERGARTEN` and publication `DRAFT`; all snapshot sources, coverage, facts and opportunities match the apply report; all target `published_at` values are null; no private elementary row or count changed; side-effect counts equal the baseline.

- [ ] **Step 7: Prove idempotency in production**

Repeat Task 10 Step 3.

Expected: 25 institutions and all package children report `UNCHANGED`; planned create/update counts are zero.

- [ ] **Step 8: Verify public isolation**

Request `/institutions?category=ENGLISH_KINDERGARTEN` and each target slug. Because all targets are DRAFT, the list must not show private elementary fallback data and target detail routes must not become public. Do not mark browser rendering PASS if only HTTP status or source text was checked.

- [ ] **Step 9: Finalize the import report**

Append the production baseline, migration result, dry-run JSON, apply JSON, post-import counts, idempotency result, public isolation result and timestamp. Set `UX Writing: PASS` only if the rendered/contract tests preserve all designed states; otherwise record `UX Writing: FIX_REQUIRED` and do not claim public readiness.

- [ ] **Step 10: Commit the evidence report**

```bash
git add docs/data/PREPPY_ENGLISH_KINDERGARTEN_MVP_IMPORT_REPORT.md
git commit -m "docs: record production english kindergarten draft import"
```

---

## Completion Gate

The implementation is complete only when all of the following are evidenced:

- reviewed files `campuses.ndjson`, `evidence.ndjson`, `progress.json`, import snapshot, manifest and verification report exist;
- validation reports exactly 25 independent records and legal-dong totals 13/1/11;
- the additive migration, typed fact contracts, coverage and review persistence pass tests;
- the specialized list/detail read model never substitutes private-school results;
- the approved A list and answer-first detail UI pass focused and regression tests;
- Railway production contains the 25 target records as DRAFT exactly once;
- a second production dry run is a no-op;
- private elementary counts/data and all notification side-effect counts are unchanged;
- production import evidence is written to the report;
- no institution is reported as publicly released by this plan.
