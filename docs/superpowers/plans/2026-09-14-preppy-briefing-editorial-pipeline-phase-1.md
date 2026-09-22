# PREPPY 교육시장 브리핑 편집 파이프라인 1단계 구현 계획

> **에이전트 작업자 필수 지침:** 이 계획은 작업별로 `superpowers:subagent-driven-development`(권장) 또는 `superpowers:executing-plans`를 사용해 실행해요. 진행 여부는 체크박스(`- [ ]`)로 기록해요.

**목표:** 매주 생성되는 ChatGPT 교육시장 브리핑을 추적 가능한 콘텐츠 후보로 가져오고, 공식 근거와 사람의 검수를 통과한 내용만 PREPPY 아티클 초안과 공개 콘텐츠로 이어지는 프로덕션 안전 파이프라인을 만들어요.

**구조:** 기존 Article CMS 옆에 경계가 분명한 `editorial-briefing` 도메인을 추가해요. 원본 브리핑 실행 기록, 후보 상태, 기존 Source·Observation·Evidence 연결, 기관·입학정보 연결, 검수와 재확인 작업을 저장해요. Article 변경은 기존 Article 명령만 사용하며, 브리핑에서 시작된 아티클에만 추가 발행 조건을 적용해 수동 작성 아티클의 기존 동작은 유지해요.

**기술 스택:** TypeScript 5.9, Node.js 22 이상, Next.js 16.3 App Router, React 19.2, PostgreSQL, Drizzle ORM 0.45, Zod 4.4, Vitest 4.1, 기존 Python 브라우저 검증 도구

**설계 문서:** `docs/superpowers/specs/2026-09-13-preppy-briefing-editorial-pipeline-design.md`

## 전체 제약 조건

- 1단계는 운영자 또는 Codex가 파일로 가져오고, 검증된 정보만 규칙 기반 초안 뼈대에 반영해요. ChatGPT 화면을 수집하거나 비공개 대화 ID에 의존하지 않아요.
- 공개 발행은 자동화하지 않아요. 인증된 Admin의 명시적 발행 명령만 허용해요.
- 브리핑의 문장은 탐색 단서이며 Institution·Opportunity의 확정 데이터가 아니에요.
- 기존 `sources`, `source_observations`, `source_snapshots`, Evidence 테이블, Article 명령, Audit, 캐시 Outbox를 재사용해요. 별도의 공식 출처 저장소를 만들지 않아요.
- 브리핑 원문은 변경 불가·Admin 전용으로 저장하고 UTF-8 기준 256 KiB 이하로 제한해요. SHA-256을 기록하며 인증된 후보 상세 화면 외 브라우저 속성에는 포함하지 않아요.
- 커뮤니티·블로그·SNS는 탐색 및 맥락 자료로 사용할 수 있어요. 날짜, 금액, 지원 자격, 법적 의무, 통학 노선, 급식 같은 필수 사실을 단독으로 확정하는 근거로 사용하지 않아요.
- 학년도, 실제 날짜, 시간대, 금액 단위, 포함·별도 비용, 의무, 금지, 예외, 불확실성, 출처, 자료 수집 시점, 내용 확인 시점을 보존해요.
- 미발표, 공식 안내에서 찾지 못함, 페이지 접근 실패, 예정, 정보 상충, 신청 마감, 지난 일정을 서로 구분해요.
- 사용자에게 보이는 본문은 자연스러운 해요체를 사용하고, 제목과 라벨은 짧은 명사형을 사용해요.
- 불안 조장, 과장된 긴급성, 합격 보장, 학교 인증 표현, 근거 없는 `최신`·`확정`·`평균 원비`를 사용하지 않아요.
- Next.js 페이지는 기본적으로 Server Component로 만들어요. Client Component는 폼과 상호작용에만 사용하고 직렬화 가능한 제한된 DTO만 전달해요.
- Route Handler는 Web `Request`·`Response`, 기존 Admin 인증 파이프라인, 엄격한 Zod 스키마, 캐시되지 않는 변경 요청을 사용해요.
- 재검증은 기존 Article 캐시 Outbox를 사용해요. 데이터 트랜잭션 안에서 되돌릴 수 없는 Next 캐시 API를 호출하지 않아요.
- 통합 테스트와 브라우저 테스트는 데이터베이스 이름이 `_test` 또는 `_verify`로 끝나는 전용 DB에서만 실행해요.
- 현재 작업 트리의 기존 변경은 사용자 소유예요. 각 작업은 명시된 파일만 스테이징하고 커밋해요.
- 2단계 AI 본문 생성과 3단계 출처 자동 감시는 4회 파일럿 결과를 확인한 뒤 별도 계획으로 진행해요.

---

## 파일 구성

### 새 도메인 파일

- `src/modules/editorial-briefing/contracts.ts` — 입력·출력, 열거값, 상태 변경, 크기 제한 계약
- `src/modules/editorial-briefing/parser.ts` — 선택적 구조화 JSON 추출과 `COMPLETE`·`PARTIAL` 판정
- `src/modules/editorial-briefing/scoring.ts` — 0~12점 후보 점수와 P0·P1·P2 분류
- `src/modules/editorial-briefing/repository.server.ts` — 트랜잭션 범위 저장과 발행 가능 여부 조회
- `src/modules/editorial-briefing/commands.server.ts` — 가져오기, 분류, 출처 확인, 검수, 제외, 승인 명령
- `src/modules/editorial-briefing/draft-bridge.server.ts` — 근거 기반 Article 초안 생성과 연결
- `src/modules/editorial-briefing/recheck.server.ts` — 재확인이 필요한 공개 글 조회와 중복 없는 작업 생성
- `src/modules/editorial-briefing/cli.server.ts` — 검증 전용, 미리보기, 제한된 실제 반영 흐름

### 새 Admin 파일

- `src/modules/admin/http/editorial-briefing.server.ts`
- `src/modules/admin/read-model/editorial-briefing-query.server.ts`
- `app/admin/(protected)/editorial-briefings/page.tsx`
- `app/admin/(protected)/editorial-briefings/[candidateId]/page.tsx`
- `app/admin/_components/editorial-briefing-import.tsx`
- `app/admin/_components/editorial-candidate-actions.tsx`
- `app/api/admin/editorial-briefings/import/route.ts`
- `app/api/admin/editorial-briefings/candidates/[candidateId]/triage/route.ts`
- `app/api/admin/editorial-briefings/candidates/[candidateId]/sources/route.ts`
- `app/api/admin/editorial-briefings/candidates/[candidateId]/reviews/route.ts`
- `app/api/admin/editorial-briefings/candidates/[candidateId]/draft/route.ts`

### 새 운영·검증 파일

- `scripts/data/import-editorial-briefing.ts`
- `scripts/data/plan-editorial-rechecks.ts`
- `tests/fixtures/editorial-briefing/2026-09-12.json`
- `tests/browser/editorial-briefing/seed.ts`
- `tests/browser/editorial-briefing/run.py`
- `tests/browser/editorial-briefing/scenarios.md`
- `docs/runbooks/PREPPY_BRIEFING_EDITORIAL_PIPELINE.md`
- `docs/data/PREPPY_BRIEFING_EDITORIAL_PIPELINE_PHASE1_REPORT.md`

### 수정할 기존 파일

- `src/db/schema/index.ts`
- `src/db/migrations/0014_briefing_editorial_pipeline.sql`
- `src/db/migrations/meta/0014_snapshot.json`
- `src/db/migrations/meta/_journal.json`
- `src/modules/production-safety/migration-manifest.ts`
- `src/modules/editorial/article-commands.server.ts`
- `src/modules/editorial/repository.server.ts`
- `src/modules/admin/read-model/contracts.ts`
- `src/modules/public/dto.ts`
- `src/modules/public/article-detail.server.ts`
- `src/modules/public/article-query.server.ts`
- `app/_lib/public-article.ts`
- `app/_components/opportunity-article-pages.tsx`
- `app/admin/_components/admin-nav.tsx`
- `app/admin/admin.css`
- `app/globals.css`
- `package.json`

### 작업 1: 편집 브리핑 스키마와 마이그레이션 원장 추가

**파일**

- 수정: `src/db/schema/index.ts`
- 생성: `src/db/migrations/0014_briefing_editorial_pipeline.sql`
- 생성: `src/db/migrations/meta/0014_snapshot.json`
- 수정: `src/db/migrations/meta/_journal.json`
- 수정: `src/modules/production-safety/migration-manifest.ts`
- 수정: `tests/unit/wp15a-migrations.test.ts`
- 수정: `tests/unit/wp16a-migration-manifest.test.ts`
- 생성: `tests/integration/editorial-briefing-schema.test.ts`

**인터페이스**

- 생성: `briefingRuns`, `editorialCandidates`, `editorialCandidateSources`, `editorialCandidateInstitutions`, `editorialCandidateOpportunities`, `editorialReviews`, `articleSourceLinks`, `editorialRechecks`
- 사용: 기존 `sources`, `sourceObservations`, `sourceSnapshots`, `institutions`, `opportunities`, `articles`, `adminUsers` 외래 키

- [ ] **1단계: 실패하는 DB 제약 테스트 작성**

```ts
it("브리핑 중복과 잘못된 후보·출처 연결을 DB가 거부한다", async () => {
  // 아래 네 도우미는 애플리케이션 명령을 거치지 않고 Drizzle로 직접 삽입해요.
  const run = await insertBriefingRun({
    sourceRunAt: new Date("2026-09-12T23:00:00.000Z"),
    rawBody: "fixture",
    rawSha256: "a".repeat(64),
  });
  await expect(insertSameRun(run)).rejects.toMatchObject({ code: "23505" });
  await expect(insertInvalidCandidateStatus(run.id)).rejects.toMatchObject({ code: "23514" });
  await expect(insertDanglingCandidateSource()).rejects.toMatchObject({ code: "23503" });
});
```

- [ ] **2단계: RED 확인**

실행: `npm test -- tests/integration/editorial-briefing-schema.test.ts --hookTimeout=60000 --no-file-parallelism`

예상: 새 테이블과 export가 없어서 실패해요.

- [ ] **3단계: 열거값과 테이블 구현**

```ts
export const editorialCandidateStatusValues = [
  "NEW", "NEEDS_VERIFICATION", "READY_FOR_DRAFT", "DRAFTED",
  "REVIEW_REQUIRED", "APPROVED", "PUBLISHED", "REJECTED", "EXPIRED",
] as const;

export const editorialReviewTypeValues = [
  "FACT", "UX_WRITING", "SEO", "LINK", "FINAL",
] as const;

export const editorialTruthSyncStateValues = [
  "NOT_REQUIRED", "REQUIRED", "COMPLETE",
] as const;
```

다음 제약을 DB에 구현해요.

- `briefing_runs`: `(source_kind, source_run_at, raw_sha256)` 고유, 소문자 64자리 SHA-256, 시간대 `Asia/Seoul`
- `editorial_candidates`: 0~12점, P0·P1·P2, 기존 Article 유형·카테고리, 선택적 초안·중복 후보 연결, `truth_sync_state`, 낙관적 잠금용 `updated_at`
- 후보 출처: 기존 `source_id` 필수, observation·snapshot 선택, 주장 범위, 발행 필수 여부, 확인 상태
- 후보 기관·입학정보: 중복 연결 방지와 대상 삭제 제한
- 검수: 후보·Article의 검수 당시 `updated_at`을 저장하는 추가 전용 행
- Article 출처: `(article_id, candidate_source_id, relation_type)` 고유
- 재확인: `(article_id, reason)`별 열린 작업 하나만 허용하는 부분 고유 인덱스

- [ ] **4단계: 마이그레이션 생성 및 파괴적 SQL 검사**

실행: `npm run db:generate -- --name=briefing_editorial_pipeline`

예상: `0014_briefing_editorial_pipeline.sql`, snapshot, journal 항목이 생성돼요. 번호가 다르면 적용 이력이 없는 새 파일만 `0014`로 맞춰요. 모든 `DROP`, `ALTER ... DROP`, 테이블 재작성을 검사하고 추가형 테이블·인덱스·제약·외래 키만 남겨요.

- [ ] **5단계: 정적 마이그레이션 목록 갱신**

생성된 SQL의 실제 SHA-256을 `EXPECTED_REPOSITORY_MIGRATIONS`에 추가하고 `wp15a-migrations.test.ts`의 순서를 갱신해요.

- [ ] **6단계: 테스트 실행**

실행: `npm test -- tests/unit/wp15a-migrations.test.ts tests/unit/wp16a-migration-manifest.test.ts tests/integration/editorial-briefing-schema.test.ts --hookTimeout=60000 --no-file-parallelism`

예상: 마이그레이션 순서, 해시, DB 제약 테스트가 모두 통과해요.

- [ ] **7단계: 파일 단위 커밋**

```bash
git add src/db/schema/index.ts src/db/migrations/0014_briefing_editorial_pipeline.sql src/db/migrations/meta/0014_snapshot.json src/db/migrations/meta/_journal.json src/modules/production-safety/migration-manifest.ts tests/unit/wp15a-migrations.test.ts tests/unit/wp16a-migration-manifest.test.ts tests/integration/editorial-briefing-schema.test.ts
git commit -m "feat: add editorial briefing schema"
```

### 작업 2: 엄격한 입력 계약, 구조화 파서, 후보 점수 구현

**파일**

- 생성: `src/modules/editorial-briefing/contracts.ts`
- 생성: `src/modules/editorial-briefing/parser.ts`
- 생성: `src/modules/editorial-briefing/scoring.ts`
- 생성: `tests/unit/editorial-briefing-contracts.test.ts`
- 생성: `tests/unit/editorial-briefing-parser.test.ts`
- 생성: `tests/unit/editorial-briefing-scoring.test.ts`
- 생성: `tests/fixtures/editorial-briefing/2026-09-12.json`

**인터페이스**

- 생성: `parseBriefingImport(value): BriefingImport`
- 생성: `parseStructuredBriefing(rawBody): ParsedBriefing`
- 생성: `scoreEditorialCandidate(input): EditorialScore`
- 사용: `src/db/schema/index.ts`의 Article 유형·카테고리·편집 상태값

- [ ] **1단계: 실패하는 계약·파서 테스트 작성**

```ts
expect(parseStructuredBriefing(rawWithValidJson)).toMatchObject({
  parseStatus: "COMPLETE",
  candidates: [{ priority: "P0", recommendedAction: "VERIFY" }],
});
expect(parseStructuredBriefing("사람이 읽는 브리핑만 있어요.")).toEqual({
  parseStatus: "PARTIAL",
  candidates: [],
});
expect(() => parseBriefingImport({ rawBody: "x".repeat(262_145) })).toThrow();
```

- [ ] **2단계: RED 확인**

실행: `npm test -- tests/unit/editorial-briefing-contracts.test.ts tests/unit/editorial-briefing-parser.test.ts tests/unit/editorial-briefing-scoring.test.ts`

예상: 도메인 모듈이 없어서 실패해요.

- [ ] **3단계: 제한된 Zod 계약 구현**

```ts
export type BriefingImport = Readonly<{
  sourceRunAt: string;
  sourceTimezone: "Asia/Seoul";
  rawBody: string;
}>;

export type ParsedBriefing = Readonly<{
  parseStatus: "COMPLETE" | "PARTIAL";
  candidates: readonly ParsedEditorialCandidate[];
}>;
```

프로토타입 오염 키, 일반 객체가 아닌 트리, 알 수 없는 열거값, 절대 HTTP(S)가 아닌 URL, 후보 50개 초과, 후보별 출처 12개 초과, 필드별 최대 길이 초과를 거부해요. 선택적 JSON 블록이 없거나 깨졌다면 `PARTIAL`과 빈 후보 목록을 반환해요. 이를 `변경 없음`으로 해석하지 않아요.

- [ ] **4단계: 0~12점 계산 구현**

```ts
export function scoreEditorialCandidate(input: EditorialScoreInput): EditorialScore {
  const score = input.parentImpact + input.urgency + input.evidenceStrength
    + input.searchIntent + input.productConnection + input.enduringValue;
  return {
    score,
    priority: score >= 10 ? "P0" : score >= 7 ? "P1" : "P2",
    publishBlocked: input.hasMaterialConflict,
  };
}
```

각 항목은 0~2의 정수만 허용해요. `hasMaterialConflict=true`이면 점수와 관계없이 발행을 막아요.

- [ ] **5단계: GREEN 확인**

실행: `npm test -- tests/unit/editorial-briefing-contracts.test.ts tests/unit/editorial-briefing-parser.test.ts tests/unit/editorial-briefing-scoring.test.ts`

예상: 학년도·날짜 충돌 사례와 원문만 있는 `PARTIAL` 사례를 포함해 통과해요.

- [ ] **6단계: 파일 단위 커밋**

```bash
git add src/modules/editorial-briefing/contracts.ts src/modules/editorial-briefing/parser.ts src/modules/editorial-briefing/scoring.ts tests/unit/editorial-briefing-contracts.test.ts tests/unit/editorial-briefing-parser.test.ts tests/unit/editorial-briefing-scoring.test.ts tests/fixtures/editorial-briefing/2026-09-12.json
git commit -m "feat: parse and score briefing candidates"
```

### 작업 3: 변경 불가 실행 기록과 중복 없는 후보 가져오기

**파일**

- 생성: `src/modules/editorial-briefing/repository.server.ts`
- 생성: `src/modules/editorial-briefing/commands.server.ts`
- 생성: `tests/integration/editorial-briefing-import.test.ts`
- 생성: `tests/integration/editorial-briefing-rollback.test.ts`

**인터페이스**

- 사용: `BriefingImport`, `ParsedBriefing`, `AdminCommandContext`, `TransactionManager`, 기존 `AuditWriter`
- 생성: `importEditorialBriefing(context, input, deps): Promise<BriefingImportResult>`

- [ ] **1단계: 중복 반입·롤백 실패 테스트 작성**

```ts
const first = await importEditorialBriefing(context, fixture, dependencies);
const replay = await importEditorialBriefing(context, fixture, dependencies);
expect(replay.runId).toBe(first.runId);
expect(await counts()).toEqual({ runs: 1, candidates: first.candidateCount });
await expect(importWithInjectedCandidateFailure()).rejects.toThrow("injected");
expect(await countsAfterFailure()).toEqual({ runs: 1, candidates: first.candidateCount });
```

- [ ] **2단계: RED 확인**

실행: `npm test -- tests/integration/editorial-briefing-import.test.ts tests/integration/editorial-briefing-rollback.test.ts --hookTimeout=60000 --no-file-parallelism`

예상: 명령과 저장소가 없어서 실패해요.

- [ ] **3단계: 트랜잭션 전용 저장 함수 구현**

```ts
export async function findBriefingRunByIdentity(
  executor: DatabaseExecutor,
  identity: {
    sourceKind: "CHATGPT_SCHEDULED_TASK";
    sourceRunAt: Date;
    rawSha256: string;
  },
): Promise<typeof briefingRuns.$inferSelect | null>;

export async function insertEditorialCandidate(
  executor: TransactionExecutor,
  values: typeof editorialCandidates.$inferInsert,
): Promise<typeof editorialCandidates.$inferSelect>;
```

`findBriefingRunByIdentity`는 세 식별 필드를 모두 비교하고 ID 순으로 정렬한 뒤 1행만 조회하며, 없으면 `null`을 반환해요. 삽입 함수는 `.returning()` 결과가 정확히 1행인지 확인해요. 모든 쓰기 함수는 `TransactionExecutor`만 받아요.

- [ ] **4단계: 중복 없는 반입 명령 구현**

정규화된 UTF-8 바이트의 SHA-256을 계산하되 저장할 `rawBody`는 바꾸지 않아요. 식별 튜플을 잠그고 재실행이면 기존 결과를 반환해요. 최초 실행이면 원문·후보·관계를 한 트랜잭션에 저장하고 Audit 1건을 남겨요. Audit에는 원문과 비공개 식별자를 넣지 않고 실행 ID, 해시, 개수, 변경 필드명만 기록해요. `PARTIAL` 실행은 운영자가 후보를 직접 추가할 수 있도록 목록에 남겨요.

- [ ] **5단계: 반입·롤백·Audit 회귀 테스트**

실행: `npm test -- tests/integration/editorial-briefing-import.test.ts tests/integration/editorial-briefing-rollback.test.ts tests/integration/wp11-admin-operations.test.ts --hookTimeout=60000 --no-file-parallelism`

예상: 모두 통과하고 Article, Opportunity, 알림, 전달, 캐시 Outbox 부작용은 0건이에요.

- [ ] **6단계: 파일 단위 커밋**

```bash
git add src/modules/editorial-briefing/repository.server.ts src/modules/editorial-briefing/commands.server.ts tests/integration/editorial-briefing-import.test.ts tests/integration/editorial-briefing-rollback.test.ts
git commit -m "feat: import editorial briefings idempotently"
```

### 작업 4: 후보 분류, 출처 확인, 검수, 승인 명령 구현

**파일**

- 수정: `src/modules/editorial-briefing/contracts.ts`
- 수정: `src/modules/editorial-briefing/repository.server.ts`
- 수정: `src/modules/editorial-briefing/commands.server.ts`
- 생성: `tests/unit/editorial-candidate-transitions.test.ts`
- 생성: `tests/integration/editorial-candidate-commands.test.ts`
- 생성: `tests/integration/editorial-candidate-concurrency.test.ts`

**인터페이스**

- 생성: `triageEditorialCandidate`, `setEditorialCandidateSource`, `recordEditorialReview`, `approveEditorialCandidate`, `rejectEditorialCandidate`
- 사용: `expectedUpdatedAt` 낙관적 잠금 값과 기존 Source·Observation ID

- [ ] **1단계: 상태 전이 테스트 작성**

```ts
expect(canTransition("NEW", "NEEDS_VERIFICATION")).toBe(true);
expect(canTransition("NEEDS_VERIFICATION", "READY_FOR_DRAFT")).toBe(true);
expect(canTransition("APPROVED", "NEW")).toBe(false);
expect(canTransition("PUBLISHED", "APPROVED")).toBe(false);
```

- [ ] **2단계: 승인 조건 실패 테스트 작성**

다음 사례를 각각 독립 테스트로 작성해요.

- 필수 출처가 `VERIFIED`가 아닌 `FOUND`이면 승인 거부
- `truthSyncState=REQUIRED`이면 승인 거부
- 중요한 출처 상태가 `CONFLICTING`이면 승인 거부
- FACT 검수 시각이 현재 후보 `updatedAt`과 다르면 승인 거부
- 커뮤니티 출처만으로 원비·날짜를 확정하려 하면 승인 거부
- 같은 `expectedUpdatedAt`으로 동시에 승인하면 한 요청만 성공하고 다른 요청은 충돌

- [ ] **3단계: RED 확인**

실행: `npm test -- tests/unit/editorial-candidate-transitions.test.ts tests/integration/editorial-candidate-commands.test.ts tests/integration/editorial-candidate-concurrency.test.ts --hookTimeout=60000 --no-file-parallelism`

예상: 상태 정책과 명령이 없어서 실패해요.

- [ ] **4단계: 명시적 상태 전이와 승인 정책 구현**

```ts
export function canTransition(
  from: EditorialCandidateStatus,
  to: EditorialCandidateStatus,
) {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export type CandidateApprovalSnapshot = Readonly<{
  candidateUpdatedAt: string;
  truthSyncState: "NOT_REQUIRED" | "REQUIRED" | "COMPLETE";
  requiredSourcesVerified: boolean;
  materialConflictCount: number;
  currentFactReviewPassed: boolean;
}>;
```

후보 행을 잠근 뒤 `expectedUpdatedAt`을 비교하고 상태 전이와 승인 스냅샷을 검증해요. 출처 확인 시 `verifiedAt`을 기존 자료 수집·관찰 시각과 별도로 기록해요. 변경과 Audit 기록은 한 트랜잭션에서 완료해요.

- [ ] **5단계: GREEN 확인**

실행: `npm test -- tests/unit/editorial-candidate-transitions.test.ts tests/integration/editorial-candidate-commands.test.ts tests/integration/editorial-candidate-concurrency.test.ts --hookTimeout=60000 --no-file-parallelism`

예상: 모든 전이·승인·동시성 사례가 통과해요.

- [ ] **6단계: 파일 단위 커밋**

```bash
git add src/modules/editorial-briefing/contracts.ts src/modules/editorial-briefing/repository.server.ts src/modules/editorial-briefing/commands.server.ts tests/unit/editorial-candidate-transitions.test.ts tests/integration/editorial-candidate-commands.test.ts tests/integration/editorial-candidate-concurrency.test.ts
git commit -m "feat: add editorial candidate review workflow"
```

### 작업 5: 인증된 Admin HTTP 명령 제공

**파일**

- 생성: `src/modules/admin/http/editorial-briefing.server.ts`
- 생성: `app/api/admin/editorial-briefings/import/route.ts`
- 생성: `app/api/admin/editorial-briefings/candidates/[candidateId]/triage/route.ts`
- 생성: `app/api/admin/editorial-briefings/candidates/[candidateId]/sources/route.ts`
- 생성: `app/api/admin/editorial-briefings/candidates/[candidateId]/reviews/route.ts`
- 생성: `app/api/admin/editorial-briefings/candidates/[candidateId]/draft/route.ts`
- 생성: `tests/unit/editorial-briefing-admin-http.test.ts`
- 생성: `tests/integration/editorial-briefing-admin-http.test.ts`

**인터페이스**

- 사용: 작업 3·4의 명령과 기존 `runAdminCommandRequest`
- 생성: 인증된 제한형 POST 어댑터. 공개 또는 비인증 엔드포인트는 만들지 않아요.

- [ ] **1단계: HTTP 경계 실패 테스트 작성**

```ts
const response = await handleImportBriefingRequest(request(validBody), {
  authenticate: async () => admin,
  importEditorialBriefing: command,
});
expect(response.status).toBe(200);
expect(command).toHaveBeenCalledWith(
  expect.objectContaining({ adminUserId }),
  validBody,
);
```

인증 실패 401, 출처·CSRF 실패 403, 원문 256 KiB 초과 413, 프로토타입 오염 입력 400, 오래된 후보 409, 내부 정보가 노출되지 않는 500을 각각 검증해요.

- [ ] **2단계: RED 확인**

실행: `npm test -- tests/unit/editorial-briefing-admin-http.test.ts tests/integration/editorial-briefing-admin-http.test.ts --hookTimeout=60000 --no-file-parallelism`

예상: 어댑터와 라우트가 없어서 실패해요.

- [ ] **3단계: 엄격한 HTTP 어댑터 구현**

```ts
export function handleEditorialCandidateReviewRequest(
  request: Request,
  rawPath: unknown,
  dependencies: EditorialBriefingHttpDependencies = defaultDependencies,
): Promise<Response> {
  return runAdminCommandRequest({
    request,
    rawPath,
    pathSchema: candidatePathSchema,
    bodySchema: reviewBodySchema,
    reason: "ADMIN_EDITORIAL_CANDIDATE_REVIEW",
    dependencies,
    execute: ({ context, path, body }) =>
      dependencies.recordEditorialReview(
        context,
        { candidateId: path.candidateId, ...body },
        dependencies.commandDependencies,
      ),
  });
}
```

`EditorialBriefingHttpDependencies`에는 실제 명령, 명령 의존성, 기존 인증·요청 의존성을 정의해요. 기본값은 프로덕션 구현을 연결하고 테스트에서는 명시적으로 대체해요. 각 Route Handler는 `params`를 await하고 하나의 어댑터에 위임해 `Response`를 반환해요.

- [ ] **4단계: HTTP와 기존 Admin 회귀 테스트**

실행: `npm test -- tests/unit/editorial-briefing-admin-http.test.ts tests/integration/editorial-briefing-admin-http.test.ts tests/unit/wp13-admin-article-http.test.ts --hookTimeout=60000 --no-file-parallelism`

예상: 새 경계와 기존 Article 인증·크기 제한이 모두 통과해요.

- [ ] **5단계: 파일 단위 커밋**

```bash
git add src/modules/admin/http/editorial-briefing.server.ts app/api/admin/editorial-briefings/import/route.ts app/api/admin/editorial-briefings/candidates/[candidateId]/triage/route.ts app/api/admin/editorial-briefings/candidates/[candidateId]/sources/route.ts app/api/admin/editorial-briefings/candidates/[candidateId]/reviews/route.ts app/api/admin/editorial-briefings/candidates/[candidateId]/draft/route.ts tests/unit/editorial-briefing-admin-http.test.ts tests/integration/editorial-briefing-admin-http.test.ts
git commit -m "feat: add editorial briefing admin commands"
```

### 작업 6: Admin 후보 목록과 근거 비교 화면 구현

**파일**

- 수정: `src/modules/admin/read-model/contracts.ts`
- 생성: `src/modules/admin/read-model/editorial-briefing-query.server.ts`
- 생성: `app/admin/(protected)/editorial-briefings/page.tsx`
- 생성: `app/admin/(protected)/editorial-briefings/[candidateId]/page.tsx`
- 생성: `app/admin/_components/editorial-briefing-import.tsx`
- 생성: `app/admin/_components/editorial-candidate-actions.tsx`
- 수정: `app/admin/_components/admin-nav.tsx`
- 수정: `app/admin/admin.css`
- 생성: `tests/unit/editorial-briefing-admin-pages.test.ts`
- 생성: `tests/integration/editorial-briefing-admin-read.test.ts`

**인터페이스**

- 생성: `listAdminEditorialCandidates(executor, input)`
- 생성: `getAdminEditorialCandidateDetail(executor, candidateId)`
- 사용: 제한된 Admin DTO와 작업 5의 엔드포인트

- [ ] **1단계: 조회 범위와 개인정보 테스트 작성**

```ts
expect(list.items[0]).toMatchObject({
  priority: "P0",
  sourceSummary: { required: 1, verified: 0, conflicting: 1 },
});
expect(JSON.stringify(list)).not.toContain("rawBody");
expect(detail.rawBody.length).toBeLessThanOrEqual(262_144);
```

목록에는 브리핑 원문, 출처 스냅샷 본문, Admin 신원 세부 정보, 제한 없는 JSON을 포함하지 않아요. 상세 화면은 인증된 Server Component에만 제한된 원문을 전달해요.

- [ ] **2단계: 사용자 문구 테스트 작성**

다음 문구를 정확히 검증해요.

- `브리핑 후보`
- `출처 확인`
- `데이터 반영`
- `초안 만들기`
- `보류`
- `제외`
- `학교 페이지를 불러오지 못해 이번 변경을 확인하지 못했어요.`
- `안내에 적힌 날짜가 서로 달라요. 정확한 일정은 학교에 확인해 주세요.`

- [ ] **3단계: RED 확인**

실행: `npm test -- tests/unit/editorial-briefing-admin-pages.test.ts tests/integration/editorial-briefing-admin-read.test.ts --hookTimeout=60000 --no-file-parallelism`

예상: 조회 모델과 페이지가 없어서 실패해요.

- [ ] **4단계: Server Component와 최소 Client Component 구현**

목록은 상태, 우선순위, 카테고리, 충돌 여부로 필터링해요. 상세 화면은 다음 순서로 보여줘요.

1. 보호자가 궁금해하는 질문과 권장 작업
2. 날짜·금액·충돌 경고
3. 현재 PREPPY 기관·입학정보 값
4. 출처 링크, 자료 수집 시점, 내용 확인 시점
5. 브리핑 발췌와 접힌 원문
6. 명시적 작업 버튼

Client Component는 작업 요청과 `role="status"` 결과만 담당해요. 출처 스냅샷 본문이나 DB 실행기를 받지 않아요.

- [ ] **5단계: 반응형 스타일 구현**

좁은 화면에서는 우선순위, 충돌, 중요한 날짜·금액, 다음 작업을 원문보다 먼저 보여줘요. 기존 Admin 토큰을 재사용하고 별도 디자인 시스템은 만들지 않아요.

- [ ] **6단계: Admin 화면·조회 테스트**

실행: `npm test -- tests/unit/editorial-briefing-admin-pages.test.ts tests/integration/editorial-briefing-admin-read.test.ts tests/unit/wp13-admin-article-pages.test.ts tests/unit/wp13-admin-article-ui.test.ts --hookTimeout=60000 --no-file-parallelism`

예상: 새 화면과 기존 Article Admin 화면이 모두 통과해요.

- [ ] **7단계: 파일 단위 커밋**

```bash
git add src/modules/admin/read-model/contracts.ts src/modules/admin/read-model/editorial-briefing-query.server.ts 'app/admin/(protected)/editorial-briefings/page.tsx' 'app/admin/(protected)/editorial-briefings/[candidateId]/page.tsx' app/admin/_components/editorial-briefing-import.tsx app/admin/_components/editorial-candidate-actions.tsx app/admin/_components/admin-nav.tsx app/admin/admin.css tests/unit/editorial-briefing-admin-pages.test.ts tests/integration/editorial-briefing-admin-read.test.ts
git commit -m "feat: add editorial briefing review queue"
```

### 작업 7: 근거 기반 Article 초안과 브리핑 연계 발행 조건 구현

**파일**

- 생성: `src/modules/editorial-briefing/draft-bridge.server.ts`
- 수정: `src/modules/editorial-briefing/repository.server.ts`
- 수정: `src/modules/editorial/article-commands.server.ts`
- 수정: `src/modules/editorial/repository.server.ts`
- 수정: `src/modules/admin/http/editorial-briefing.server.ts`
- 생성: `tests/unit/editorial-briefing-draft-copy.test.ts`
- 생성: `tests/integration/editorial-briefing-draft.test.ts`
- 생성: `tests/integration/editorial-briefing-publish-guard.test.ts`

**인터페이스**

- 생성: `createEditorialArticleDraft(context, input, deps)`
- 생성: `loadBriefingPublishEligibility(executor, articleId)`
- 사용: 기존 `createArticleDraft`, 관계 저장소, Article sanitizer, Article 발행 루트 트랜잭션

- [ ] **1단계: 근거 기반 초안 문구 테스트 작성**

```ts
const html = buildGroundedEditorialDraftHtml(verifiedCandidate);
expect(html).toContain("<h2>핵심 변화</h2>");
expect(html).toContain("<h2>적용 대상</h2>");
expect(html).toContain("<h2>중요한 일정</h2>");
expect(html).toContain("<h2>확인되지 않은 내용</h2>");
expect(html).not.toContain("놓치면 늦어요");
expect(html).not.toContain("학교 인증");
```

`VERIFIED` 출처 또는 현재 검증된 PREPPY 데이터가 뒷받침하는 주장만 초안 뼈대에 넣어요. 알 수 없는 항목은 추정 문구로 채우지 않고 생략해요.

- [ ] **2단계: 발행 차단 테스트 작성**

다음 사례를 검증해요.

- 승인된 후보와 현재 Article 검수 전체 PASS이면 발행
- 필수 출처 미확인이면 `NOT_ELIGIBLE`이며 쓰기 0건
- FACT 검수가 오래되었으면 발행 거부
- UX_WRITING·SEO·LINK·FINAL 검수 뒤 Article이 수정되었으면 발행 거부
- `truthSyncState=REQUIRED`이면 발행 거부
- 브리핑 연결이 없는 일반 Article은 기존 WP-13 동작 유지

- [ ] **3단계: RED 확인**

실행: `npm test -- tests/unit/editorial-briefing-draft-copy.test.ts tests/integration/editorial-briefing-draft.test.ts tests/integration/editorial-briefing-publish-guard.test.ts --hookTimeout=60000 --no-file-parallelism`

예상: 초안 연결과 발행 조건이 없어서 실패해요.

- [ ] **4단계: 한 트랜잭션 초안 생성 구현**

```ts
export type CreateEditorialDraftInput = Readonly<{
  candidateIds: readonly string[];
  slug: string;
}>;

export async function createEditorialArticleDraft(
  context: AdminCommandContext,
  rawInput: unknown,
  dependencies: EditorialDraftDependencies,
): Promise<{ articleId: string; candidateIds: readonly string[] }>;
```

후보 ID를 정렬해 잠그고 상태가 `READY_FOR_DRAFT` 또는 `APPROVED`인지 확인해요. 검증된 값으로 sanitizer를 통과한 HTML을 만들고 같은 루트 트랜잭션에서 기존 Article 저장소를 호출해요. 제안된 기관·입학정보 관계와 검증된 출처를 연결하고 후보를 `DRAFTED`로 바꿔요. Audit 1건을 남기되 공개 캐시 이벤트는 만들지 않아요.

- [ ] **5단계: 조건부 발행 보호 장치 구현**

`publishArticle`에서 Article을 잠근 다음, 상태·관계 변경 전에 브리핑 연결을 조회해요. 연결이 없으면 기존 흐름을 유지해요. 연결이 있으면 다음 조건을 모두 확인해요.

- 연결된 유효 후보가 모두 `APPROVED`
- `required_for_publish` 출처가 모두 `VERIFIED`이고 탐색 전용 출처가 아님
- 중요한 출처에 `CONFLICTING`이 없음
- 데이터 반영 상태가 `NOT_REQUIRED` 또는 `COMPLETE`
- 현재 FACT 검수가 각 후보의 `updatedAt`과 일치
- 현재 UX_WRITING·SEO·LINK·FINAL 검수가 발행 요청의 Article `updatedAt`과 일치

조건이 맞지 않으면 Article, Audit, 관계, redirect, Outbox 쓰기 전에 기존 오류 매핑이 가능한 발행 불가 오류를 던져요.

- [ ] **6단계: 초안·발행·롤백·기존 Article 테스트**

실행: `npm test -- tests/unit/editorial-briefing-draft-copy.test.ts tests/integration/editorial-briefing-draft.test.ts tests/integration/editorial-briefing-publish-guard.test.ts tests/integration/wp13-article-publish.test.ts tests/integration/wp13-article-command-rollback.test.ts --hookTimeout=60000 --no-file-parallelism`

예상: 모든 테스트가 통과하고 일반 Article의 공개 동작은 기존과 같아요.

- [ ] **7단계: 파일 단위 커밋**

```bash
git add src/modules/editorial-briefing/draft-bridge.server.ts src/modules/editorial-briefing/repository.server.ts src/modules/editorial/article-commands.server.ts src/modules/editorial/repository.server.ts src/modules/admin/http/editorial-briefing.server.ts tests/unit/editorial-briefing-draft-copy.test.ts tests/integration/editorial-briefing-draft.test.ts tests/integration/editorial-briefing-publish-guard.test.ts
git commit -m "feat: gate briefing-backed article publication"
```

### 작업 8: 공개 Article에 검증된 출처와 두 확인 시점 표시

**파일**

- 수정: `src/modules/public/dto.ts`
- 수정: `src/modules/public/article-detail.server.ts`
- 수정: `src/modules/public/article-query.server.ts`
- 수정: `app/_lib/public-article.ts`
- 수정: `app/_components/opportunity-article-pages.tsx`
- 수정: `app/globals.css`
- 생성: `tests/unit/editorial-article-source-copy.test.ts`
- 생성: `tests/integration/editorial-article-public-sources.test.ts`
- 수정: `tests/unit/wp13-public-article.test.ts`
- 수정: `tests/integration/wp13-public-article.test.ts`

**인터페이스**

- 생성: `PublicArticleSourceDTO`, `PublicArticleDTO.sources`
- 사용: `articleSourceLinks`, 기존 `sources`, 후보 출처 확인 시각, 출처 관찰 수집 시각

- [ ] **1단계: 공개 출처 의미·개인정보 테스트 작성**

```ts
expect(article.sources[0]).toEqual({
  label: "학교 공식 안내",
  url: "https://school.example/admissions",
  collectedAt: "2026-09-12T23:00:00.000Z",
  verifiedAt: "2026-09-13T01:00:00.000Z",
  relationType: "PRIMARY",
});
expect(JSON.stringify(article)).not.toContain("rawBody");
expect(JSON.stringify(article)).not.toContain("adminUserId");
```

- [ ] **2단계: RED 확인**

실행: `npm test -- tests/unit/editorial-article-source-copy.test.ts tests/integration/editorial-article-public-sources.test.ts tests/unit/wp13-public-article.test.ts tests/integration/wp13-public-article.test.ts --hookTimeout=60000 --no-file-parallelism`

예상: 공개 출처 projection이 없어서 실패해요.

- [ ] **3단계: 제한된 검증 출처 projection 구현**

```ts
export type PublicArticleSourceDTO = Readonly<{
  label: "학교 공식 안내" | "공식 모집요강" | "공식 신청 페이지" | "참고 자료";
  url: string;
  collectedAt: string | null;
  verifiedAt: string;
  relationType: "PRIMARY" | "SUPPORTING" | "CONTEXT";
}>;
```

`status=VERIFIED`인 활성 HTTP(S) 출처만 최대 12개 반환해요. 출처 유형과 권위 수준에서 라벨을 만들고 커뮤니티·SNS·블로그를 공식 안내라고 표시하지 않아요. canonical URL로 중복을 제거하고 PRIMARY, 공식 권위, URL 순으로 안정 정렬해요.

- [ ] **4단계: 공개 출처 블록 구현**

공식 출처가 하나라도 있으면 제목은 `공식 안내`, 그렇지 않으면 `참고 자료`를 사용해요. `자료 수집`과 `내용 확인`을 별도 값으로 보여줘요. 링크 이름은 `학교 입학 안내 열기`처럼 목적지를 설명하고 `자세히 보기`를 사용하지 않아요.

- [ ] **5단계: 공개·메타데이터·사이트맵·sanitizer 회귀 테스트**

실행: `npm test -- tests/unit/editorial-article-source-copy.test.ts tests/integration/editorial-article-public-sources.test.ts tests/unit/wp13-public-article.test.ts tests/integration/wp13-public-article.test.ts tests/unit/wp13-metadata.test.ts tests/integration/wp13-sitemap.test.ts tests/unit/wp13-sanitizer.test.ts --hookTimeout=60000 --no-file-parallelism`

예상: 브리핑 원문, Admin 신원, 안전하지 않은 링크, 비공개 관계가 노출되지 않고 모두 통과해요.

- [ ] **6단계: 파일 단위 커밋**

```bash
git add src/modules/public/dto.ts src/modules/public/article-detail.server.ts src/modules/public/article-query.server.ts app/_lib/public-article.ts app/_components/opportunity-article-pages.tsx app/globals.css tests/unit/editorial-article-source-copy.test.ts tests/integration/editorial-article-public-sources.test.ts tests/unit/wp13-public-article.test.ts tests/integration/wp13-public-article.test.ts
git commit -m "feat: show verified sources on briefing articles"
```

### 작업 9: 안전한 CLI 반입과 규칙 기반 재확인 계획 구현

**파일**

- 생성: `src/modules/editorial-briefing/cli.server.ts`
- 생성: `src/modules/editorial-briefing/recheck.server.ts`
- 생성: `scripts/data/import-editorial-briefing.ts`
- 생성: `scripts/data/plan-editorial-rechecks.ts`
- 수정: `package.json`
- 생성: `tests/unit/editorial-briefing-cli.test.ts`
- 생성: `tests/unit/editorial-recheck-policy.test.ts`
- 생성: `tests/integration/editorial-rechecks.test.ts`

**인터페이스**

- 생성: `runEditorialBriefingCli(args, deps, env)`
- 생성: `planEditorialRechecks(now, executor)`
- 생성: `applyEditorialRechecks(context, plan, deps)`
- 사용: 작업 3의 반입 명령과 기존 런타임 DB 수명주기

- [ ] **1단계: CLI 안전 테스트 작성**

```ts
expect(parseEditorialBriefingCliArgs(["--file", "briefing.json"])).toMatchObject({
  mode: "dry-run",
});
expect(() => parseEditorialBriefingCliArgs([
  "--file", "briefing.json", "--apply",
])).toThrow(/expected-checksum/i);
```

`--validate-only`는 DB를 열지 않아야 해요. 프로덕션 실제 반영은 정확한 checksum과 `ALLOW_PRODUCTION_EDITORIAL_BRIEFING_IMPORT=1`을 모두 요구해야 해요.

- [ ] **2단계: 재확인 정책 테스트 작성**

신청 마감일 경과, 행사일 경과, 출처 교체, 연결된 Opportunity 변경, 기존 OPEN 작업 중복 방지, Article `updatedAt` 자동 변경 금지를 각각 검증해요.

- [ ] **3단계: RED 확인**

실행: `npm test -- tests/unit/editorial-briefing-cli.test.ts tests/unit/editorial-recheck-policy.test.ts tests/integration/editorial-rechecks.test.ts --hookTimeout=60000 --no-file-parallelism`

예상: CLI와 재확인 모듈이 없어서 실패해요.

- [ ] **4단계: 검증 전용·미리보기·제한된 실제 반영 구현**

```ts
export type EditorialBriefingCliMode = "validate-only" | "dry-run" | "apply";

export type EditorialBriefingCliResult = Readonly<{
  mode: EditorialBriefingCliMode;
  targetEnvironment: "PRODUCTION" | "TEST" | "LOCAL";
  checksum: string;
  validation: {
    status: "PASS" | "FAIL";
    candidateCount: number;
    errors: readonly string[];
  };
  applied: boolean;
  runId: string | null;
}>;
```

기본 모드는 `dry-run`이에요. 출력에는 개수, ID, 상태, checksum, 안전한 오류 코드만 포함해요. 브리핑 원문, 자격 증명, DB URL, 출처 스냅샷 본문은 출력하지 않아요.

- [ ] **5단계: 규칙 기반 재확인 계획 구현**

`planEditorialRechecks`는 읽기 전용이며 안정 정렬해요. `applyEditorialRechecks`는 중복 없는 OPEN 작업과 Audit 1건만 추가해요. Article 본문·시각, Opportunity 데이터, 알림, 공개 CTA는 자동 변경하지 않아요.

- [ ] **6단계: package script 추가**

```json
{
  "data:import-editorial-briefing": "tsx --tsconfig scripts/db/tsconfig.json scripts/data/import-editorial-briefing.ts",
  "data:plan-editorial-rechecks": "tsx --tsconfig scripts/db/tsconfig.json scripts/data/plan-editorial-rechecks.ts"
}
```

- [ ] **7단계: GREEN 확인**

실행: `npm test -- tests/unit/editorial-briefing-cli.test.ts tests/unit/editorial-recheck-policy.test.ts tests/integration/editorial-rechecks.test.ts --hookTimeout=60000 --no-file-parallelism`

예상: CLI 제한과 재확인 정책이 모두 통과해요.

- [ ] **8단계: 파일 단위 커밋**

```bash
git add src/modules/editorial-briefing/cli.server.ts src/modules/editorial-briefing/recheck.server.ts scripts/data/import-editorial-briefing.ts scripts/data/plan-editorial-rechecks.ts package.json tests/unit/editorial-briefing-cli.test.ts tests/unit/editorial-recheck-policy.test.ts tests/integration/editorial-rechecks.test.ts
git commit -m "feat: add safe briefing import and recheck tools"
```

### 작업 10: 전체 흐름 검증과 4회 파일럿 운영 문서 작성

**파일**

- 생성: `tests/browser/editorial-briefing/seed.ts`
- 생성: `tests/browser/editorial-briefing/run.py`
- 생성: `tests/browser/editorial-briefing/scenarios.md`
- 생성: `docs/runbooks/PREPPY_BRIEFING_EDITORIAL_PIPELINE.md`
- 생성: `docs/data/PREPPY_BRIEFING_EDITORIAL_PIPELINE_PHASE1_REPORT.md`

**인터페이스**

- 사용: 작업 1~9와 기존 Admin 로그인·브라우저 fixture
- 생성: 데스크탑·태블릿·모바일 검증 증거, 주간 운영·복구 절차, 프로덕션 진행 여부 보고서

- [ ] **1단계: 브라우저 시나리오를 먼저 작성**

다음 흐름을 문서화하고 자동 검증해요.

1. 비공개 식별자를 제거한 첫 실행 형태의 브리핑 반입
2. P0 후보, 학년도·날짜 충돌, 이미 끝난 데이터 전용 행사, 원문만 있는 `PARTIAL` 표시
3. 출처 확인과 서로 다른 자료 수집·내용 확인 시점 표시
4. PREPPY 데이터 반영과 FACT 검수 완료
5. 근거 기반 초안 생성
6. UX_WRITING·SEO·LINK·FINAL 검수가 최신이 아니면 발행 실패
7. 모든 검수를 통과한 뒤 Admin의 명시적 발행 성공
8. 올바른 아티클 카테고리, 관련 기관·입학정보, 출처 블록 표시
9. 정확한 접근성 이름으로 공식 외부 페이지 열기
10. 연결된 마감일이 지나면 본문을 자동 변경하지 않고 재확인 작업 생성

- [ ] **2단계: 전용 seed와 브라우저 도구 구현**

`tests/browser/wp13/run-article-browser.py` 패턴을 따라요. 전용 DB 접미사를 확인하고, 시작한 프로세스 ID만 기록하며, 결정적인 fixture ID를 사용해요. 데스크탑·태블릿·모바일 화면을 캡처하고 기록된 프로세스만 종료해요.

- [ ] **3단계: 기능 단위 테스트 전체 실행**

```bash
npm test -- tests/unit/editorial-briefing-contracts.test.ts tests/unit/editorial-briefing-parser.test.ts tests/unit/editorial-briefing-scoring.test.ts tests/unit/editorial-candidate-transitions.test.ts tests/unit/editorial-briefing-admin-http.test.ts tests/unit/editorial-briefing-admin-pages.test.ts tests/unit/editorial-briefing-draft-copy.test.ts tests/unit/editorial-article-source-copy.test.ts tests/unit/editorial-briefing-cli.test.ts tests/unit/editorial-recheck-policy.test.ts tests/integration/editorial-briefing-schema.test.ts tests/integration/editorial-briefing-import.test.ts tests/integration/editorial-briefing-rollback.test.ts tests/integration/editorial-candidate-commands.test.ts tests/integration/editorial-candidate-concurrency.test.ts tests/integration/editorial-briefing-admin-http.test.ts tests/integration/editorial-briefing-admin-read.test.ts tests/integration/editorial-briefing-draft.test.ts tests/integration/editorial-briefing-publish-guard.test.ts tests/integration/editorial-article-public-sources.test.ts tests/integration/editorial-rechecks.test.ts --hookTimeout=60000 --no-file-parallelism
```

예상: 실패 0건이에요.

- [ ] **4단계: 전체 정적·애플리케이션 검증**

```bash
npm run format:check
npm run lint
npm run typecheck
npm test -- --hookTimeout=60000 --no-file-parallelism
npm run build
```

예상: 모든 명령이 종료 코드 0으로 끝나요. 테스트 성공만으로 빌드 성공을 추정하지 않아요.

- [ ] **5단계: 세 화면 크기 브라우저 검증**

실행: `python tests/browser/editorial-briefing/run.py`

예상: Admin과 공개 시나리오가 세 화면 크기에서 통과하고, 외부 링크·접근성 이름이 일치해요. 공개 응답에 원문과 Admin 신원이 포함되지 않아요.

- [ ] **6단계: 주간 운영 문서 작성**

운영 문서에는 다음 명령과 판단 기준을 정확히 적어요.

- 매주 월요일 오전 8시(KST) 최신 결과 확보
- 비공개 식별자 없는 로컬 JSON 작성
- 검증 전용과 dry-run 실행
- SHA-256 비교와 환경 제한을 통과한 실제 반영
- P0·P1·P2 및 중요한 충돌 분류
- Source·Observation·Evidence와 PREPPY 데이터 선확인
- 초안 생성, 편집, 미리보기, 검수, 명시적 발행
- 접근 실패, 충돌, 중복 실행, 오래된 편집, 지난 행사, 정정 처리
- 재확인 계획 실행
- `UX Writing: PASS` 또는 `UX Writing: FIX_REQUIRED` 기록

- [ ] **7단계: 프로덕션 밖에서 마이그레이션·반입 예행연습**

기존 프로덕션 사전 점검과 rehearsal 흐름을 전용 검증 DB에서 실행한 다음 아래 명령을 실행해요.

```bash
npm run data:import-editorial-briefing -- --file tests/fixtures/editorial-briefing/2026-09-12.json --validate-only
npm run data:import-editorial-briefing -- --file tests/fixtures/editorial-briefing/2026-09-12.json --dry-run
```

예상: 검증은 PASS이고 dry-run은 예상 개수를 보여주며 영구 저장과 부작용은 0건이에요.

- [ ] **8단계: 프로덕션 진행 여부 승인 지점에서 중단**

`PREPPY_BRIEFING_EDITORIAL_PIPELINE_PHASE1_REPORT.md`에 마이그레이션 해시, 백업·사전 점검 상태, 기능·전체·브라우저·빌드 결과, 반입 예정 개수, 부작용 변화량, 문구 검수, 되돌리기 절차를 기록해요.

Owner가 이 보고서를 명시적으로 승인하기 전에는 프로덕션 마이그레이션, 실제 브리핑 반입, 프로덕션 초안 생성, 발행, push, merge, 배포를 하지 않아요.

- [ ] **9단계: 검증 자료와 운영 문서 커밋**

```bash
git add tests/browser/editorial-briefing/seed.ts tests/browser/editorial-briefing/run.py tests/browser/editorial-briefing/scenarios.md docs/runbooks/PREPPY_BRIEFING_EDITORIAL_PIPELINE.md docs/data/PREPPY_BRIEFING_EDITORIAL_PIPELINE_PHASE1_REPORT.md
git commit -m "test: verify briefing editorial workflow"
```

---

## 계획 자체 검토

- 요구사항 범위: 1단계 반입, 후보 분류, 근거 연결, 데이터 우선 반영, 근거 기반 초안, 사람의 발행, 공개 출처, 실패·충돌 상태, 재확인, 반응형 검증, 운영 문서를 작업 1~10에 배정했어요.
- 의도적 제외: AI 본문 생성과 출처 자동 감시는 4회 파일럿의 승인율·충돌률·정정률·처리시간을 확인한 뒤 별도 계획으로 작성해요.
- 타입 일관성: 후보, 출처, 검수, 초안, Article 관계, 재확인 인터페이스는 작업 1~4에서 정의하고 이후 작업에서 같은 이름으로 사용해요.
- 안전성: 공개 발행은 인증된 Admin의 명시적 작업으로 유지하고, 프로덕션 변경은 최종 Owner 승인 지점과 분리해요.
- UX Writing: 사용자에게 보이는 모든 상태를 계약·문구 테스트·브라우저 시나리오에 배정했어요. 실제 화면 검증을 실행하기 전에는 구현 결과를 PASS로 보고하지 않아요.
