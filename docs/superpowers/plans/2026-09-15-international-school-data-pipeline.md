# International School Data Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 검증된 서울·경기 국제학교 22곳을 안전한 DRAFT 상태로 반입할 수 있는 근거 패키지와 전용 반입기를 만들고, 특수접근 7곳·후보 60곳·공개 소셜 근거는 프로덕션 공개 데이터와 분리해 보존한다.

**Architecture:** Zod 기반 국제학교 전용 아티팩트 계약이 원천 NDJSON 5종과 진행상태를 검증하고, 결정적 빌더가 체크섬이 고정된 22곳 반입 스냅샷을 만든다. 플래너는 `(ISI, externalId)`만 자동 연결 키로 사용하고, 트랜잭션 반입기는 DRAFT·ACTIVE·FOREIGN_SCHOOL만 쓰며 외부 부작용과 충돌을 차단한다. 공개 조회는 별도의 국제학교 공개 자격 정책과 공식 근거 존재 조건을 목록·상세·필터·팔로우·사이트맵에 동일하게 적용한다.

**Tech Stack:** Node.js 22, TypeScript 5.9, Zod 4, Next.js 16 App Router, React 19, Drizzle ORM 0.45, PostgreSQL 16, Vitest 4, SHA-256 NDJSON/JSON 아티팩트 검증.

**Spec:** `docs/superpowers/specs/2026-09-15-international-school-data-pipeline-design.md`

## Global Constraints

- 프로덕션 쓰기·배포·PUBLISHED 전환은 이 계획의 범위가 아니다. 결과는 “반입 준비 완료”까지다.
- DB 반입 대상은 ISI 공식 운영 상태가 ACTIVE인 22곳뿐이며 모두 `category=INTERNATIONAL_SCHOOL`, `internationalSubtype=FOREIGN_SCHOOL`, `publicationState=DRAFT`, `operationalState=ACTIVE`다.
- 특수접근 7곳과 후보 60곳은 아티팩트 전용이다. `institutions`, `institution_facts`, `opportunities`, `articles`에 쓰지 않는다.
- 자동 연결 키는 정확한 `(registryName='ISI', registryExternalId)`뿐이다. 이름·도메인·주소 유사도는 충돌 보고에만 사용한다.
- `VERIFIED`와 현재성·공식 출처·observation·snapshot을 모두 만족하는 근거만 현재 사실로 반입·노출한다. 경고·날짜 제한·검토 필요는 coverage에 남기고 현재 사실을 만들지 않는다.
- SNS·카페·블로그·커뮤니티 근거는 공개 접근 가능한 원문 URL과 짧은 발췌만 보존한다. 댓글 전문, 작성자 식별정보, 로그인 우회, robots 우회, 폐쇄 커뮤니티 재배포는 금지한다.
- 주소 충돌은 DB 주소를 `null`로 유지하고 양쪽 근거를 아티팩트에 남긴다. 통화는 환산하지 않고 원문 통화별 구성요소로 보존한다.
- 새 migration은 만들지 않는다. 기존 범용 기관·근거·coverage·review insight 스키마를 사용한다.
- 사용자 노출 문구는 `docs/PREPPY_UX_WRITING_POLICY.md`를 적용한다. “미발표”, “확인되지 않음”, “접근 실패”, “검토 필요”를 서로 바꾸지 않는다.
- Next.js 서버 조회를 수정하기 전 `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md`와 `06-fetching-data.md`를 다시 읽는다.
- 각 커밋은 해당 작업의 명시된 파일만 stage한다. 기존 worktree의 사용자 변경을 수정·포함·되돌리지 않는다.

---

## Task 1: 국제학교 사실 값과 아티팩트 상태 계약 고정

**Files:**

- Create: `src/modules/international-school/artifact-status.ts`
- Create: `src/modules/international-school/fact-values.ts`
- Create: `tests/unit/international-school-fact-values.test.ts`

**Interfaces:**

```ts
export const artifactEvidenceStatusValues = [
  "VERIFIED",
  "VERIFIED_WITH_WARNING",
  "VERIFIED_WITH_DATE_LIMIT",
  "NEEDS_REVIEW",
  "NOT_FOUND_IN_CHECKED_OFFICIAL_SOURCES",
  "ACCESS_FAILED",
  "LEAD_ONLY",
  "LOGIN_REQUIRED",
  "ROBOTS_BLOCKED",
  "NO_PUBLIC_RESULT",
] as const;

export type ArtifactEvidenceStatus =
  (typeof artifactEvidenceStatusValues)[number];

export function mapArtifactStatusToCoverage(
  status: ArtifactEvidenceStatus,
): CoverageStatus | null;

export const internationalSchoolFactTypeValues = [
  "TUITION",
  "TARGET_AGE_GRADE",
  "CURRICULUM",
  "ELIGIBILITY",
  "TRANSPORT",
  "MEALS",
  "ADMISSION_PROCESS",
  "OPERATING_INFO",
] as const satisfies readonly InstitutionFactType[];

export type InternationalSchoolFactType =
  (typeof internationalSchoolFactTypeValues)[number];

export type InternationalSchoolFactValue = {
  [FactType in InternationalSchoolFactType]: {
    factType: FactType;
  } & InternationalSchoolFactPayloads[FactType];
}[InternationalSchoolFactType];

export function parseInternationalSchoolFactValue(
  factType: InternationalSchoolFactType,
  value: unknown,
): InternationalSchoolFactValue;
```

Tuition은 환산 합계 대신 원문 구성요소를 보존한다.

```ts
type MoneyComponent = Readonly<{
  currency: "KRW" | "USD" | "EUR" | "CNY" | "JPY";
  amount: number;
  billingUnit: "MONTHLY" | "QUARTERLY" | "SEMESTER" | "ANNUAL" | "ONE_TIME";
  required: boolean | null;
}>;

type InternationalTuitionValue = Readonly<{
  academicYearLabel: string;
  gradeBands: readonly Readonly<{
    label: string;
    tuitionComponents: readonly MoneyComponent[];
    notes: readonly string[];
  }>[];
  extraFees: readonly Readonly<{
    feeType: "APPLICATION" | "ADMISSION" | "CAPITAL" | "TRANSPORT" | "MEAL" | "OTHER";
    label: string;
    components: readonly MoneyComponent[];
    refundable: boolean | null;
    note: string | null;
  }>[];
  paymentOptions: readonly string[];
  refundTerms: string | null;
  changeNote: string | null;
}>;
```

**Steps:**

- [ ] `tests/unit/international-school-fact-values.test.ts`에 상태 매핑 RED 테스트를 쓴다. `VERIFIED→CONFIRMED`, 경고·날짜 제한·검토 필요→`NEEDS_REVIEW`, `NOT_FOUND_IN_CHECKED_OFFICIAL_SOURCES→CHECKED_NOT_FOUND`, `ACCESS_FAILED→ACCESS_FAILED`, 나머지 네 소셜 상태→`null`을 정확히 단언한다.
- [ ] 동일 테스트에 5개 통화, 복수 학년군, 추가 비용, 환불 조건을 보존하는 tuition 성공 사례와 음수 금액·빈 학년도·지원하지 않는 통화 실패 사례를 추가한다.
- [ ] 나머지 7개 fact type별 최소 성공/실패 fixture를 추가하고 `ELIGIBILITY`가 `ADMISSION_PROCESS`와 합쳐지지 않는지 단언한다.
- [ ] RED 확인: `npm test -- tests/unit/international-school-fact-values.test.ts`를 실행해 모듈 부재로 실패하는지 확인한다.
- [ ] `artifact-status.ts`에 닫힌 상태 집합과 coverage 매핑을 구현한다. 소셜 전용 상태를 coverage로 억지 변환하지 않는다.
- [ ] `fact-values.ts`에 strict Zod discriminated parsing을 구현한다. 입력 객체의 알 수 없는 키, `NaN`, 무한대, 빈 문자열을 거부하고 금액 환산·합산 필드를 만들지 않는다.
- [ ] GREEN 확인: `npm test -- tests/unit/international-school-fact-values.test.ts`와 `npm run typecheck`를 실행한다.
- [ ] 커밋: `git add src/modules/international-school/artifact-status.ts src/modules/international-school/fact-values.ts tests/unit/international-school-fact-values.test.ts && git commit -m "feat: define international school fact contracts"`

---

## Task 2: 22·7·60을 강제하는 아티팩트 스키마와 검증기 구현

**Files:**

- Create: `src/modules/international-school-import/artifact-schema.ts`
- Create: `src/modules/international-school-import/validator.ts`
- Create: `tests/fixtures/international-school/minimal-valid-package/`
- Create: `tests/unit/international-school-artifact.test.ts`

**Interfaces:**

```ts
export const OFFICIAL_ACTIVE_COUNT = 22;
export const SPECIAL_ACCESS_COUNT = 7;
export const CANDIDATE_COUNT = 60;

export type InternationalSchoolImportPackage = Readonly<{
  directory: string;
  institutions: readonly InstitutionArtifactRecord[];
  evidence: readonly EvidenceArtifactRecord[];
  socialEvidence: readonly SocialEvidenceArtifactRecord[];
  specialAccess: readonly SpecialAccessArtifactRecord[];
  candidates: readonly CandidateArtifactRecord[];
  progress: InternationalSchoolProgress;
  snapshot: InternationalSchoolImportSnapshot;
  manifest: InternationalSchoolManifest;
}>;

export async function loadInternationalSchoolPackage(
  directory: string,
): Promise<InternationalSchoolImportPackage>;

export function validateInternationalSchoolPackage(
  packageValue: InternationalSchoolImportPackage,
): InternationalSchoolValidationReport;
```

`manifest.json`은 원천 파일 1–7의 raw-byte SHA-256과 canonical snapshot checksum을 담고, 자기 자신과 `verification.json`은 해시 대상에서 제외한다.

**Steps:**

- [ ] 테스트 fixture에 실제 학교명이 아닌 `Fixture International School 01` 형식의 22개 기관, 7개 특수접근, 60개 후보를 생성한다. fixture는 공개 근거·observation·snapshot 연결이 있는 `VERIFIED` 사실 1개와 artifact-only 소셜 1개만 포함한다.
- [ ] `tests/unit/international-school-artifact.test.ts`에 strict parse, 정확한 파일 집합, 22/7/60 count, 중복 ISI ID, 중복 record ID, snapshot 22개, DRAFT/ACTIVE/FOREIGN_SCHOOL 고정값을 검증하는 RED 테스트를 쓴다.
- [ ] `VERIFIED`가 아닌 evidence에서 snapshot fact가 만들어질 때, social evidence가 snapshot에 들어갈 때, observation 또는 snapshot ID가 없을 때, snapshot institution이 공식 22에 없을 때 실패하는 테스트를 추가한다.
- [ ] socialEvidence의 발췌 2,000자 초과, HTML 본문, 이메일·전화번호처럼 보이는 작성자 식별정보, 로그인/robots 우회 메모를 거부하는 privacy 테스트를 추가한다. 학교가 공식 페이지에 공개한 대표 연락처는 이 PII 규칙의 대상이 아니다.
- [ ] raw 파일 한 바이트 변경, canonical snapshot 변경, manifest 자기 해시 포함, `verification.json` 해시 포함이 각각 실패하는 checksum 테스트를 추가한다.
- [ ] RED 확인: `npm test -- tests/unit/international-school-artifact.test.ts`를 실행한다.
- [ ] `artifact-schema.ts`에 `.strict()` Zod 스키마와 discriminated union을 구현하고, URL·ISO datetime·지역·상태·ID 길이를 닫힌 계약으로 제한한다.
- [ ] `validator.ts`에 NDJSON 줄 번호 오류, 중복 검사, 참조 무결성, count, import 경계, 근거 자격, privacy, raw/canonical checksum 검증을 구현한다. 오류는 정렬된 `code/path/message` 목록으로 반환한다.
- [ ] GREEN 확인: `npm test -- tests/unit/international-school-artifact.test.ts`와 `npm run typecheck`를 실행한다.
- [ ] 커밋: `git add src/modules/international-school-import tests/fixtures/international-school/minimal-valid-package tests/unit/international-school-artifact.test.ts && git commit -m "feat: validate international school artifacts"`

---

## Task 3: ISI 전용 결정적 플래너와 충돌 차단 구현

**Files:**

- Create: `src/modules/international-school-import/planner.server.ts`
- Create: `tests/integration/international-school-import.test.ts`
- Reuse: `src/modules/institution-seed/planner.ts`

**Interfaces:**

```ts
export type InternationalSchoolImportRejectCode =
  | "ISI_IDENTITY_COLLISION"
  | "MATERIAL_FIELD_COLLISION"
  | "PUBLICATION_STATE_COLLISION"
  | "NON_ACTIVE_OFFICIAL_RECORD"
  | "UNQUALIFIED_CURRENT_FACT"
  | "ARTIFACT_ONLY_RECORD_IN_SNAPSHOT";

export async function planInternationalSchoolImport(
  executor: ReadOnlyDatabaseExecutor,
  packageValue: InternationalSchoolImportPackage,
): Promise<InternationalSchoolImportPlan>;
```

결정적 institution ID는 기존 `institutionIdForRegistryIdentity("ISI", externalId)`를 사용한다. source/snapshot/observation/fact/version/evidence ID도 canonical key를 namespace로 삼아 반복 계획에서 동일해야 한다.

**Steps:**

- [ ] 통합 테스트 DB fixture를 만들고 empty DB에서 22개 기관과 각 근거 행이 모두 `CREATE`로 계획되는 RED 테스트를 쓴다.
- [ ] 같은 패키지를 두 번 계획했을 때 모든 ID·정렬·checksum이 동일하고 두 번째 operation이 `NONE`이 되는 테스트를 쓴다.
- [ ] 기존 `(ISI, externalId)`가 같은 DRAFT 기관은 재사용하지만 표시명·지역·subtype 등 material field가 다르면 `MATERIAL_FIELD_COLLISION`으로 중단하는 테스트를 쓴다.
- [ ] 기존 `(ISI, externalId)`가 PUBLISHED/HIDDEN/ARCHIVED 기관에 연결되거나 서로 다른 기관 두 개에 연결되는 상태를 fixture로 만들어 각각 `PUBLICATION_STATE_COLLISION`/`ISI_IDENTITY_COLLISION`을 단언한다.
- [ ] 이름·웹사이트·주소만 비슷한 기관은 자동 병합하지 않고 충돌 경고만 남기는 테스트를 쓴다. `ST01:8` 비운영 레코드, 특수접근, 후보, 소셜이 plan action에 들어가면 실패하게 한다.
- [ ] current fact 계획은 `VERIFIED`, `verifiedAt`, 공식 source type, source observation, source snapshot이 모두 있을 때만 생성되는지 테스트한다. 주소 충돌 기관의 `addressLine`은 `null`인지 단언한다.
- [ ] RED 확인: `npm test -- tests/integration/international-school-import.test.ts`를 실행한다.
- [ ] `planner.server.ts`를 구현한다. 읽기 쿼리는 package의 22개 ISI external ID와 그에 연결된 기관/근거 행으로 제한하고, action/reject를 canonical key순으로 정렬한다.
- [ ] 계획 출력에 create/update/none count, artifact-only ignored count, reject 목록, 예상 side-effect zero를 포함한다.
- [ ] GREEN 확인: `npm test -- tests/integration/international-school-import.test.ts`와 `npm run typecheck`를 실행한다.
- [ ] 커밋: `git add src/modules/international-school-import/planner.server.ts tests/integration/international-school-import.test.ts && git commit -m "feat: plan international school imports"`

---

## Task 4: 트랜잭션 반입기·기본 dry-run CLI·패키지 명령 구현

**Files:**

- Create: `src/modules/international-school-import/importer.server.ts`
- Create: `src/modules/international-school-import/cli.server.ts`
- Create: `scripts/data/import-international-school-mvp.ts`
- Create: `tests/unit/international-school-import-cli.test.ts`
- Modify: `tests/integration/international-school-import.test.ts`
- Modify: `package.json`

**Interfaces:**

```ts
export type InternationalSchoolImportMode = "dry-run" | "apply";

export function dryRunInternationalSchoolImport(
  input: InternationalSchoolImportInput,
  dependencies: InternationalSchoolImportDependencies,
): Promise<InternationalSchoolImportReport>;

export function applyInternationalSchoolImport(
  input: InternationalSchoolImportInput,
  dependencies: InternationalSchoolImportDependencies,
): Promise<InternationalSchoolImportReport>;

export type InternationalSchoolCliMode = "validate-only" | "dry-run" | "apply";

export async function runInternationalSchoolImportCli(
  argv: readonly string[],
  environment: NodeJS.ProcessEnv,
  dependencies: InternationalSchoolCliDependencies,
): Promise<InternationalSchoolCliResult>;
```

Apply 승인 조건은 둘 다 필요하다.

```text
--apply --checksum=<manifest.snapshotChecksum>
ALLOW_PRODUCTION_INTERNATIONAL_SCHOOL_IMPORT=1
```

**Steps:**

- [ ] CLI 단위 테스트에 인자 없음→dry-run, `--validate-only`→DB 미연결, checksum 누락/불일치→거부, 환경 게이트 누락→거부, 알 수 없는 인자→거부를 작성한다.
- [ ] importer 통합 테스트에 dry-run 무변경, apply 단일 트랜잭션, fault injection rollback, side-effect table zero, 2회 apply idempotency를 작성한다.
- [ ] side-effect 감시는 최소 `outbox_events`, `notifications`, `notification_deliveries`, `alerts`, `updates`, `detected_changes`, `meaningful_changes`의 전후 count를 비교하도록 테스트한다.
- [ ] 반입 후 22개가 모두 DRAFT/ACTIVE/FOREIGN_SCHOOL이고 ISI identity가 정확히 하나이며, 후보 60·특수접근 7·소셜 근거 0건이 도메인 테이블에 없는지 단언한다.
- [ ] RED 확인: `npm test -- tests/unit/international-school-import-cli.test.ts tests/integration/international-school-import.test.ts`를 실행한다.
- [ ] `importer.server.ts`에 validate→plan→reject guard→transaction persist→side-effect delta guard 흐름을 구현한다. apply 중 한 단계라도 실패하면 전체 rollback한다.
- [ ] `cli.server.ts`와 script entrypoint를 구현한다. 결과는 비밀값 없이 JSON으로 출력하고 validate-only에서는 runtime DB resource를 만들지 않는다.
- [ ] `package.json`에 `data:import-international-school-mvp` 명령을 추가한다. 기존 영유 명령은 변경하지 않는다.
- [ ] GREEN 확인: 위 focused tests, `npm run typecheck`, `npm run lint -- --quiet`를 실행한다.
- [ ] 커밋: `git add src/modules/international-school-import/importer.server.ts src/modules/international-school-import/cli.server.ts scripts/data/import-international-school-mvp.ts tests/unit/international-school-import-cli.test.ts tests/integration/international-school-import.test.ts package.json && git commit -m "feat: add international school import command"`

---

## Task 5: 국제학교 공개 자격과 공식 근거 게이트를 모든 읽기 경로에 적용

**Files:**

- Create: `src/modules/public/international-school-publication-policy.ts`
- Modify: `src/modules/public/institution-query.server.ts`
- Modify: `src/modules/public/opportunity-query.server.ts`
- Modify: `src/modules/public/sitemap-query.server.ts`
- Modify: `src/modules/follow/followability-policy.server.ts`
- Modify: `src/modules/follow/activate-follow.server.ts`
- Modify: `src/modules/auth/pending-follow-target.server.ts`
- Modify: `tests/integration/wp06a-institution-query.test.ts`
- Modify: `tests/integration/wp09-follow-commands.test.ts`
- Modify: `tests/integration/wp09-my-preppy-query.test.ts`
- Modify: `tests/integration/wp13-sitemap.test.ts`
- Create: `tests/unit/international-school-public-evidence-guard.test.ts`
- Create: `tests/integration/international-school-public-query.test.ts`
- Read before editing: `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md`
- Read before editing: `node_modules/next/dist/docs/01-app/01-getting-started/06-fetching-data.md`

**Interfaces:**

```ts
export type InternationalSchoolPublicEligibilityInput = Readonly<{
  category: InstitutionCategory;
  publicationState: InstitutionPublicationState;
  operationalState: InstitutionOperationalState;
  hasIsiIdentity: boolean;
}>;

export function isInternationalSchoolPubliclyEligible(
  input: InternationalSchoolPublicEligibilityInput,
): boolean;
```

정책 결과는 국제학교일 때만 `PUBLISHED && ACTIVE && hasIsiIdentity`를 요구하고, 비국제학교의 기존 공개 의미를 바꾸지 않는다. SQL 경로에서는 아래 동등 조건을 사용한다.

```sql
institutions.category <> 'INTERNATIONAL_SCHOOL'
or (
  institutions.operational_state = 'ACTIVE'
  and exists (
    select 1 from institution_registry_identities isi
    where isi.institution_id = institutions.id
      and isi.registry_name = 'ISI'
  )
)
```

공개 fact/opportunity 근거는 source type과 authority뿐 아니라 evidence row의 `source_observation_id is not null`과 `source_snapshot_id is not null`을 동시에 요구한다.

**Steps:**

- [ ] Next.js 로컬 문서 두 파일을 끝까지 읽고, 이 작업이 Server Component가 아닌 server query 모듈 변경이며 request memoization/caching을 새로 추가하지 않는다고 작업 노트에 기록한다.
- [ ] pure policy 단위 테스트에 국제학교 `PUBLISHED+ACTIVE+ISI`만 true이고, ISI 없음·UNKNOWN·INACTIVE·CLOSED·DRAFT는 false인 표를 작성한다. 비국제학교는 기존 publication/follow 정책과 동일한지 회귀 테스트한다.
- [ ] 국제학교 공개 조회 통합 테스트에 목록·slug 상세·category facet에서 자격 미달 기관이 사라지고 적격 기관만 나오는 fixture를 작성한다.
- [ ] `VERIFIED+verifiedAt` fact라도 discovery-only source, 공식 source인데 observation 없음, 공식 source인데 snapshot 없음인 세 경우가 상세 facts와 `hasConfirmedTuition`/age/transport 필터에서 제외되는 RED 테스트를 쓴다. 네 조건을 모두 만족할 때만 포함되는 대조군을 둔다.
- [ ] native opportunity와 legacy-backed admission event 각각에 대해 observation/snapshot 누락 및 discovery-only source가 카드·recruitment filter·상세에 나오지 않는 RED 테스트를 추가한다.
- [ ] sitemap 테스트에 자격 미달 국제학교/그 기회가 모두 제외되는지, follow 테스트에 같은 기관이 pending/activate/my-preppy에서 followable로 보이지 않는지 추가한다.
- [ ] RED 확인: `npm test -- tests/unit/international-school-public-evidence-guard.test.ts tests/integration/international-school-public-query.test.ts tests/integration/wp06a-institution-query.test.ts tests/integration/wp09-follow-commands.test.ts tests/integration/wp09-my-preppy-query.test.ts tests/integration/wp13-sitemap.test.ts`를 실행한다.
- [ ] `international-school-publication-policy.ts`에 pure 정책을 구현한다. 사용자 노출 문구는 추가하지 않는다.
- [ ] `institution-query.server.ts`의 list/detail/facet/count/order/filter fact subquery와 opportunity truth 근거 조회에 동일 자격 조건을 적용한다. official source가 없는 fact를 `officialSource:null`인 채 반환하지 말고 fact 자체를 제외한다.
- [ ] `opportunity-query.server.ts`의 단독 opportunity 상세과 followable 계산에도 기관 자격과 완전한 근거 조건을 적용한다.
- [ ] `sitemap-query.server.ts`의 institution/opportunity 후보 쿼리에서 먼저 자격 미달 국제학교를 제거하고, detail/indexability의 2차 방어를 유지한다.
- [ ] `FollowabilityInstitution`에 `category`와 `hasIsiIdentity`를 추가하고 `activate-follow`, pending target, opportunity/institution card 호출부가 실제 ISI 존재 여부를 전달하도록 수정한다. monitorable fact/opportunity union에도 observation/snapshot not-null을 요구한다.
- [ ] 비국제학교의 기관 공개 자격·follow·sitemap fixture 결과가 바뀌지 않았는지 회귀 테스트를 확인한다. 다만 공식 observation+snapshot이 없는 fact/opportunity는 카테고리와 무관하게 의도적으로 제외한다.
- [ ] GREEN 확인: 위 focused tests, `npm run typecheck`, `npm run lint -- --quiet`를 실행한다.
- [ ] UX Writing 검토: 미확인 값을 빈 문자열이나 “없음”으로 바꾸지 않았고, 자격 미달은 공개 제외되며 기존 사용자 문구 의미가 보존되는지 기록한다.
- [ ] 커밋: `git add src/modules/public/international-school-publication-policy.ts src/modules/public/institution-query.server.ts src/modules/public/opportunity-query.server.ts src/modules/public/sitemap-query.server.ts src/modules/follow/followability-policy.server.ts src/modules/follow/activate-follow.server.ts src/modules/auth/pending-follow-target.server.ts tests/unit/international-school-public-evidence-guard.test.ts tests/integration/international-school-public-query.test.ts tests/integration/wp06a-institution-query.test.ts tests/integration/wp09-follow-commands.test.ts tests/integration/wp09-my-preppy-query.test.ts tests/integration/wp13-sitemap.test.ts && git commit -m "fix: gate international school public data"`

---

## Task 6: 프로덕션 읽기 전용 사전점검과 국제학교 감사 명령 구현

**Files:**

- Modify: `src/modules/production-preflight/read-only-database.server.ts`
- Create: `src/modules/international-school-import/production-audit.server.ts`
- Create: `scripts/data/audit-international-school-production.ts`
- Create: `tests/integration/international-school-production-audit.test.ts`
- Modify: `tests/unit/wp15a-read-only-boundary.test.ts`
- Modify: `tests/integration/wp15a-read-only-gate.test.ts`
- Modify: `package.json`

**Interfaces:**

```ts
export type InternationalSchoolProductionAuditResult = Readonly<{
  executed: boolean;
  reason: "COMPLETED" | "CREDENTIALS_UNAVAILABLE" | "UNSAFE_CONNECTION";
  expectedIsiIds: readonly string[];
  counts: Readonly<{
    existingIsiIdentities: number;
    exactDraftMatches: number;
    publicCollisions: number;
    materialCollisions: number;
    artifactOnlyDomainRows: number;
  }>;
  blockers: readonly Readonly<{ code: string; key: string; message: string }>[];
}>;

export async function runInternationalSchoolProductionAudit(
  packageDirectory: string,
  environment: NodeJS.ProcessEnv,
): Promise<InternationalSchoolProductionAuditResult>;
```

**Steps:**

- [ ] `PREFLIGHT_TABLES` 누락을 재현하는 RED 테스트를 추가한다. 최소 `institution_registry_identities`, `institution_section_coverages`, `institution_review_insights`, `institution_review_insight_versions`, `institution_review_insight_version_evidence`가 포함되어야 한다.
- [ ] 감사 통합 테스트에 `PRODUCTION_DATABASE_URL` 없음→`executed:false/reason:CREDENTIALS_UNAVAILABLE`와 DB factory 미호출을 단언한다. 일반 `DATABASE_URL`만 있을 때도 절대 대체 사용하지 않는 테스트를 둔다.
- [ ] read-only transaction/session 증명이 실패하면 `UNSAFE_CONNECTION`으로 중단하고 어떤 mutation SQL도 실행하지 않는 테스트를 쓴다.
- [ ] 정상 read-only fixture에서 expected 22 ISI ID, 기존 exact DRAFT, PUBLISHED/HIDDEN/ARCHIVED 충돌, material mismatch, 후보/특수접근 오염 수를 정렬된 보고서로 반환하는 테스트를 쓴다.
- [ ] RED 확인: `npm test -- tests/integration/international-school-production-audit.test.ts tests/unit/wp15a-read-only-boundary.test.ts tests/integration/wp15a-read-only-gate.test.ts`를 실행한다.
- [ ] `PREFLIGHT_TABLES`에 누락된 기존 테이블만 추가한다. schema/migration은 변경하지 않는다.
- [ ] `production-audit.server.ts`는 `runWithProductionReadOnlyDatabase`만 사용하고 package의 22 ISI ID로 쿼리 범위를 제한한다. URL·비밀번호·원문 발췌를 로그/결과에 포함하지 않는다.
- [ ] script는 `PRODUCTION_DATABASE_URL`만 읽고 구조화 JSON을 출력한다. credential이 없으면 안전한 미실행 결과를 출력하며 `DATABASE_URL` fallback을 구현하지 않는다.
- [ ] `package.json`에 `data:audit-international-school-mvp` 명령을 추가한다.
- [ ] GREEN 확인: 위 focused tests, `npm run typecheck`, `npm run lint -- --quiet`를 실행한다.
- [ ] 커밋: `git add src/modules/production-preflight/read-only-database.server.ts src/modules/international-school-import/production-audit.server.ts scripts/data/audit-international-school-production.ts tests/integration/international-school-production-audit.test.ts tests/unit/wp15a-read-only-boundary.test.ts tests/integration/wp15a-read-only-gate.test.ts package.json && git commit -m "feat: audit international school production readiness"`

---

## Task 7: 조사 결과를 원천 데이터로 고정하고 9파일 스냅샷 생성

**Files:**

- Create: `scripts/data/international-school-source-data.ts`
- Create: `scripts/data/build-international-school-snapshot.ts`
- Create: `scripts/data/verify-international-school-snapshot.ts`
- Create: `tests/unit/international-school-source-data.test.ts`
- Create: `data/snapshots/preppy/international-school/sg-is-20260915-r01/institutions.ndjson`
- Create: `data/snapshots/preppy/international-school/sg-is-20260915-r01/evidence.ndjson`
- Create: `data/snapshots/preppy/international-school/sg-is-20260915-r01/social-evidence.ndjson`
- Create: `data/snapshots/preppy/international-school/sg-is-20260915-r01/special-access.ndjson`
- Create: `data/snapshots/preppy/international-school/sg-is-20260915-r01/candidates.ndjson`
- Create: `data/snapshots/preppy/international-school/sg-is-20260915-r01/progress.json`
- Create: `data/snapshots/preppy/international-school/sg-is-20260915-r01/preppy-import.snapshot.json`
- Create: `data/snapshots/preppy/international-school/sg-is-20260915-r01/manifest.json`
- Create: `data/snapshots/preppy/international-school/sg-is-20260915-r01/verification.json`
- Modify: `package.json`

**Interfaces:**

```ts
export const OFFICIAL_ACTIVE_INTERNATIONAL_SCHOOLS = [
  // Seoul 16: ST01:1,3,4,5,6,10,13,14,15,16,17,18,19,20,56,76
  // Gyeonggi 6: ST01:32,33,34,36,38,57
] as const satisfies readonly InstitutionArtifactRecord[];

export const SPECIAL_ACCESS_SCHOOLS = [
  "Humphreys Central Elementary School",
  "Humphreys West Elementary School",
  "Humphreys Middle School",
  "Humphreys High School",
  "Osan Elementary School",
  "Osan Middle High School",
  "Russian Embassy School in Seoul",
] as const;

export async function buildInternationalSchoolSnapshot(
  outputDirectory: string,
): Promise<InternationalSchoolManifest>;

export async function verifyInternationalSchoolSnapshot(
  directory: string,
): Promise<InternationalSchoolVerification>;
```

후보 60곳은 spec 11.3절의 이름과 순서를 canonical source로 옮기되, 모든 row에 `disposition`과 `legalStatus`를 명시한다. Lighthouse, Seoul Academy, GIS Jukjeon, Gen.G, Saint Paul, SIE, FIS, BEK 충돌군은 `collisionGroup`으로 분리한다.

**Steps:**

- [ ] `tests/unit/international-school-source-data.test.ts`에 공식 ID exact set, Seoul 16/Gyeonggi 6, `ST01:8` 제외, 외국인유치원 `ST01:11/12` 제외를 단언한다.
- [ ] 공식 22 이름·지역·ISI URL이 모두 있고, 주소 충돌 기관은 import address가 null이며 conflicting evidence 2개를 가지는지 테스트한다.
- [ ] 검증된 2026–27 tuition coverage가 현재 조사 기준 13/22인지, YISS 미확인, ICSP 2025–26 날짜 제한, Suwon Chinese 접근 실패, KIS Pangyo 일정 시간 충돌이 각각 올바른 상태이며 current fact/event를 만들지 않는지 단언한다.
- [ ] APIS TLS 경고, Korea Foreign 주소 충돌, ICSU 학년 충돌, DSSI 버스 학년도 충돌이 경고 근거로 보존되는지 테스트한다.
- [ ] 공개 note fixture가 정책 문구를 그대로 보존하는지 검사한다. 학비 미발견, 학교 페이지 접근 실패, 2025–26학년도 날짜 제한, KIS 판교 시간 충돌, 로그인 필요는 승인 spec 9절 문구와 일치하고 `ROBOTS_BLOCKED`에는 public note가 없어야 한다.
- [ ] 소셜 inventory가 22기관 모두를 포함하고 Naver robots 차단, 로그인 필요, 공개 결과 없음이 서로 다른 상태인지 검사한다. public URL·짧은 발췌만 존재하고 PII/댓글 전문/HTML이 없는지 검사한다.
- [ ] 특수접근 exact 7과 후보 exact 60, 등록대안·학원·미인가/비국제·법적 미확인 disposition을 검사한다. 특수접근에는 건물·통학경로·보안 상세가 없어야 한다.
- [ ] RED 확인: `npm test -- tests/unit/international-school-source-data.test.ts tests/unit/international-school-artifact.test.ts`를 실행한다.
- [ ] `international-school-source-data.ts`에 승인된 조사 결과를 typed constants로 옮긴다. 공식/공개 URL과 확인 시각을 보존하고, 확인되지 않은 값은 `null` 또는 해당 evidence status로 남긴다.
- [ ] 빌더는 record를 canonical key순으로 정렬하고 UTF-8 LF NDJSON/JSON을 생성한다. 파일 1–7 raw-byte 해시, canonical snapshot checksum을 계산한 뒤 manifest를 마지막에 쓴다.
- [ ] verifier는 builder와 독립적으로 디스크를 다시 읽어 schema/count/reference/checksum/import-boundary를 검사하고 `verification.json`에 검사 시각, 검사 항목별 PASS/FAIL, 전체 `readyForDryRun`을 쓴다. FAIL이면 exit code 1이다.
- [ ] `package.json`에 `data:build-international-school-mvp`와 `data:verify-international-school-mvp`를 추가한다.
- [ ] 생성: `npm run data:build-international-school-mvp -- --output=data/snapshots/preppy/international-school/sg-is-20260915-r01`을 실행한다.
- [ ] 독립 검증: `npm run data:verify-international-school-mvp -- --dir=data/snapshots/preppy/international-school/sg-is-20260915-r01`을 실행해 9개 파일과 전체 PASS를 확인한다.
- [ ] 동일 빌드를 임시 디렉터리에도 실행하고 `manifest.json`의 raw/canonical hashes가 동일한지 비교해 결정성을 확인한다. `verification.json.checkedAt`만 비교 대상에서 제외한다.
- [ ] 커밋: `git add scripts/data/international-school-source-data.ts scripts/data/build-international-school-snapshot.ts scripts/data/verify-international-school-snapshot.ts tests/unit/international-school-source-data.test.ts data/snapshots/preppy/international-school/sg-is-20260915-r01 package.json && git commit -m "data: prepare international school mvp snapshot"`

---

## Task 8: 전체 회귀·테스트 DB 리허설·프로덕션 반입 준비 보고 완료

**Files:**

- Create: `docs/data/international-school/sg-is-20260915-r01-readiness.md`
- Modify only generated verification results: `data/snapshots/preppy/international-school/sg-is-20260915-r01/verification.json`
- Review: all files changed by Tasks 1–7

**Steps:**

- [ ] 전용 test DB의 migration ledger가 현재 repository migration과 일치하는지 기존 DB check/preflight 명령으로 확인하고 baseline row count를 저장한다.
- [ ] 전용 unit suite 실행: `npm test -- tests/unit/international-school-fact-values.test.ts tests/unit/international-school-artifact.test.ts tests/unit/international-school-import-cli.test.ts tests/unit/international-school-public-evidence-guard.test.ts tests/unit/international-school-source-data.test.ts`.
- [ ] 전용 integration suite 실행: `npm test -- tests/integration/international-school-import.test.ts tests/integration/international-school-public-query.test.ts tests/integration/international-school-production-audit.test.ts -- --no-file-parallelism`.
- [ ] 관련 회귀 실행: `npm test -- tests/integration/wp06a-institution-query.test.ts tests/integration/wp09-follow-commands.test.ts tests/integration/wp09-my-preppy-query.test.ts tests/integration/wp13-sitemap.test.ts tests/unit/wp15a-read-only-boundary.test.ts tests/integration/wp15a-read-only-gate.test.ts -- --no-file-parallelism`.
- [ ] 전용 test DB에서 `npm run data:import-international-school-mvp -- --dir=data/snapshots/preppy/international-school/sg-is-20260915-r01`을 실행해 기본 dry-run 보고서의 reject 0, mutation 0, side-effect 0을 확인한다.
- [ ] 같은 test DB에서 정확한 checksum과 test-only gate로 apply 1회를 실행하고, 재실행에서 create/update 0과 side-effect 0을 확인한다. 트랜잭션 전후 row count와 22 DRAFT identity exact set을 readiness 문서에 기록한다.
- [ ] `PRODUCTION_DATABASE_URL`이 실제로 제공된 경우에만 `npm run data:audit-international-school-mvp -- --dir=data/snapshots/preppy/international-school/sg-is-20260915-r01`을 실행한다. 없으면 `CREDENTIALS_UNAVAILABLE`을 기록하고 다른 URL로 대체하지 않는다.
- [ ] `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run test:unit`, `npm run test:db -- --no-file-parallelism`, `npm run build`를 순서대로 실행한다. 기존 unrelated failure가 있으면 명령·오류·관련 여부를 그대로 기록하고 PASS로 바꾸지 않는다.
- [ ] `git diff --check`와 `git status --short`를 확인하고 migration/schema/lockfile/사용자 기존 변경이 의도치 않게 포함되지 않았는지 검사한다.
- [ ] readiness 문서에 공식 22·특수접근 7·후보 60 count, fact coverage, unresolved conflicts, import checksum, dry-run/apply/idempotency 결과, 공개 게이트 회귀, 프로덕션 audit 실행 여부, rollback 절차를 기록한다.
- [ ] UX Writing 검토 결과를 `UX Writing: PASS` 또는 실제 누락이 있으면 `FIX_REQUIRED`로 기록한다. 상태 문구가 근거의 불확실성과 날짜 제한을 보존했는지 표본과 전체 schema 검증 결과를 함께 남긴다.
- [ ] verification을 마지막으로 다시 실행해 `readyForDryRun=true`를 확인한다. 한 항목이라도 FAIL이면 완료·프로덕션 반입 가능으로 보고하지 않는다.
- [ ] 최종 커밋: `git add docs/data/international-school/sg-is-20260915-r01-readiness.md data/snapshots/preppy/international-school/sg-is-20260915-r01/verification.json && git commit -m "docs: verify international school import readiness"`.
- [ ] 최종 보고에는 프로덕션에 실제 쓰지 않았음을 명시하고, Owner가 별도로 승인해야 할 다음 단계로 “read-only audit blocker 0 확인 → 정확한 checksum apply 승인 → DRAFT QA → 별도 PUBLISHED 승인”을 제시한다.

---

## Definition of Done

- [ ] 원천 패키지는 정확히 공식 22, 특수접근 7, 후보 60을 담고 모든 참조·해시·privacy 검증을 통과한다.
- [ ] 스냅샷은 공식 22 DRAFT만 담고 social/special/candidate를 전혀 담지 않는다.
- [ ] dry-run은 기본값이며 apply는 checksum+환경 게이트 없이는 불가능하다.
- [ ] test DB apply가 atomic, rollback-safe, side-effect zero, second-pass zero임이 증명된다.
- [ ] 국제학교는 PUBLISHED+ACTIVE+ISI일 때만 목록·상세·팔로우·사이트맵 후보가 된다.
- [ ] fact/opportunity는 VERIFIED+verifiedAt+official source+observation+snapshot일 때만 공개된다.
- [ ] 프로덕션 감사는 전용 read-only 자격 증명만 사용하며 실제 프로덕션 mutation은 수행하지 않는다.
- [ ] 전체 검증과 UX Writing 검토가 PASS이고, 미해결 충돌은 사실로 승격되지 않은 채 readiness 문서에 남는다.
