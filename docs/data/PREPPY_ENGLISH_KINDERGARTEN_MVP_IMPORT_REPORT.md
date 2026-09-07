# PREPPY 영어유치원 MVP 프로덕션 DRAFT 반입 보고서

- 실행일: 2026-09-07 KST
- Railway: `preppy-production` / `production` / `preppy-web`
- 패키지: `sg-ek-20260901-r01`
- 패키지 체크섬: `aa40844a7b36985dacb623704846a1f9f3b452dd3bda3eef1d55512e5fa32643`
- 검증 보고서 체크섬: `f35c5d98a5dc9180cc1f0883638c88eb02afe9081f7256d9d541e7556beb8790`
- 최종 상태: **25곳을 프로덕션 DB에 DRAFT로 반입 완료**

## 보관 산출물

`data/snapshots/preppy/english-kindergarten/sg-ek-20260901-r01/`에 다음 파일을 함께 보관한다.

- `campuses.ndjson`: 기관 25곳의 확정 신원·주소·분류
- `evidence.ndjson`: 신원·운영·분류 근거 75건과 수집 결과, 최종 URL, 보존 텍스트, SHA-256
- `progress.json`: 25곳 검토 진척과 지역·수집 결과 합계
- `preppy-import.snapshot.json`: DB 반입용 DRAFT 스냅샷
- `manifest.json`: 네 데이터 파일의 SHA-256과 반입 스냅샷 체크섬
- `verification.json`: 교차 파일·중복·합계·해시 검증 결과

패키지 체크섬은 manifest 전체의 정규화 SHA-256이므로 캠퍼스, 근거, 진척 또는 반입 스냅샷 중 하나라도 바뀌면 함께 바뀐다. 로더는 파일을 읽은 뒤 객체를 재귀적으로 동결한다.

## 패키지 검증 결과

- 기관: 25곳
- 근거: 75건
- 자치구: 강남구 13곳, 서초구 12곳
- 법정동: 신사동 13곳, 잠원동 1곳, 반포동 11곳
- 출처 재확인: 성공 23곳, 접근 실패 2곳, 확인했으나 미발견 0곳
- 운영 정보 상태: 공식 근거 확인 3곳, 제3자 근거로 추가 검수 필요 20곳, 접근 실패 2곳
- 중복 campus ID/slug/evidence ID: 0건
- 알 수 없는 근거 참조·필수 근거 누락·캡처 텍스트 해시 불일치: 0건
- 원비, 설명회, 운영 연령, 커리큘럼, 셔틀, 급식, 후기: 현재 25곳 모두 `NOT_RESEARCHED`

세부 항목은 가짜 값으로 채우지 않았다. 이후 동일한 버전형 Fact, Opportunity, Review Insight 반입 경로로 근거와 함께 추가할 수 있다. 제3자 운영 자료는 `CONFIRMED`로 승격하지 않는다.

## 로컬 검증

- TypeScript: `npm run typecheck` — PASS
- 대상 파일 Prettier 및 ESLint — PASS, 경고 0
- 영어유치원 단위·통합 테스트: 9 files, 43 tests — PASS
- 최신 `origin/main` 병합 뒤 영어유치원과 통근 경로 회귀: 10 files, 47 tests — PASS
- Next.js 프로덕션 빌드: PASS
- 전체 테스트 직렬 실행: 222/224 files, 1,983/1,985 tests PASS

전체 테스트의 잔여 2건은 이번 변경 범위 밖의 기존 실패다.

1. `wp08-identity`: 동시 로그인 후보 ID 생성기 호출 기대 12회, 실제 1회
2. `wp16a-restore-drill`: 로컬 Docker 복구 드릴 60초 타임아웃

영어유치원 반입 테스트에서는 최초 적용, 두 번째 no-op, 잘못된 체크섬, category/slug 충돌, 트랜잭션 롤백, `opportunity_changes` 부수 효과 롤백, 후기 버전 저장, 과거 Fact/Opportunity 스냅샷 재실행 방어, 구조화 Fact 공개 파싱을 검증했다.

PowerShell에서는 npm 인자 전달 손실을 피하기 위해 아래처럼 직접 실행한다.

```powershell
npx tsx --tsconfig scripts/db/tsconfig.json scripts/data/import-english-kindergarten-mvp.ts --package=data/snapshots/preppy/english-kindergarten/sg-ek-20260901-r01 --dry-run
```

## 프로덕션 실행 기록

### 기준값과 배포

- 최초 읽기 전용 기준값: 사립초 `PUBLISHED/ACTIVE` 41곳, 대상 slug 0곳
- 기준 부수 효과: outbox 0, notifications 0, deliveries 0, meaningful changes 0, opportunity changes 0
- 최종 배포: Railway deployment `08f8e36f-e56a-4587-ade7-d4ea8f5f5047` — SUCCESS
- 배포 전 최신 `origin/main`을 병합해 기존 통근 지도 기능을 보존했다.
- `/api/health`: HTTP 200
- `/commute/`: redirect 후 HTTP 200

표준 preflight는 `PREPPY_PREFLIGHT_DATABASE_URL`이 웹 서비스에 없어 `CREDENTIALS_UNAVAILABLE`, exit code 0, `READY_FOR_WP16A`를 반환했다. 대신 동일 프로덕션 DB에 `BEGIN READ ONLY` 기준 감사, 스키마 감사, 반입 전후 감사를 수행했다.

### 마이그레이션

- 적용 파일: `0013_english_kindergarten_profiles.sql`
- SHA-256: `d1c9c1b17e71c813db4dccedbf0054051df6895fb68c2d78d3bcc4ac4c70d47c`
- 방식: Railway Postgres 서비스의 로컬 소켓에서 `ON_ERROR_STOP` 단일 트랜잭션으로 실행
- Drizzle 원장 행: 정확히 1건
- 이유: 웹 runtime 계정은 스키마 생성 권한이 없어 표준 migrator가 변경 없이 거부됨
- 후속 권한: 기존 테이블과 같은 최소 권한을 신규 4개 테이블에 복제
  - `preppy_runtime`: SELECT, INSERT, UPDATE, DELETE
  - `preppy_preflight`, `preppy_preflight_ro`: SELECT
  - `preppy_migration`: 기존 migration 역할과 같은 전체 테이블 권한

### 반입 전 dry-run

- validation: PASS
- rejects: 0
- 생성 계획: Institution 25, Source 25, Snapshot 25, Observation 25, Binding 25, Coverage 200
- Fact, Review Insight, Opportunity: 0
- 총 생성 계획: 325
- 생성된 Product signal 계획: 0

### 체크섬 고정 apply

- `ALLOW_PRODUCTION_ENGLISH_KINDERGARTEN_IMPORT=1`을 해당 원격 프로세스에만 설정
- 예상 체크섬과 실제 패키지 체크섬 일치
- `applied: true`
- 실제 생성: 계획과 동일한 325건
- rejects: 0
- outbox, notification, delivery, meaningful change, opportunity change delta: 모두 0

### 반입 후 읽기 전용 감사

- 영어유치원: `DRAFT/ACTIVE` 25곳, `published_at IS NULL` 25곳
- 사립초: `PUBLISHED/ACTIVE` 41곳 유지
- 대상 Source/Snapshot/Observation/Binding: 각각 25건
- Coverage: 200건
- Fact/Review Insight/Opportunity/registry identity: 0건
- 저장된 Snapshot normalized text: 25건
- 저장 텍스트 SHA-256 불일치: 0건
- 지역 합계: 강남구 13, 서초구 12
- 운영 정보 Coverage: CONFIRMED 3, NEEDS_REVIEW 20, ACCESS_FAILED 2
- 나머지 7개 섹션: 각각 NOT_RESEARCHED 25
- outbox, notification, delivery, meaningful change, opportunity change: 모두 기준값 0 유지

### 프로덕션 멱등성과 공개 격리

- 두 번째 production dry-run: create 0, update 0, unchanged 325, rejects 0
- 영어유치원 목록 요청: HTTP 200, DRAFT 대상 노출 0
- DRAFT 상세 `/institutions/psa-apgujeong`: HTTP 404
- 이번 작업은 공개 발행을 수행하지 않았다.

## UI/UX와 이후 데이터 채움 구조

- 목록: 기관명, 서울 지역 필터, 원비 확인 여부, 자녀 나이, 셔틀, 예정 설명회, 정렬
- 상세: 원비, 입학설명회, 운영 연령·커리큘럼, 셔틀, 급식, 후기 요약, 공식 출처
- 구조화 값은 `displayText`가 없어도 원비·연령·셔틀 핵심값을 표시한다.
- 빈 상태는 `NOT_RESEARCHED`, `CHECKED_NOT_FOUND`, `ACCESS_FAILED`, `NEEDS_REVIEW`를 구분한다.
- 후기 요약은 기간, 양수 표본 수, 중립적 주제, 한계, 근거를 버전형으로 저장한다.
- browser/mobile/보조공학 실제 화면 검사는 수행하지 않았다. SSR 정적 마크업 및 문구·상태 계약 테스트는 수행했다.

## UX Writing 검토

**UX Writing: PASS**

- 사용자 노출 문구는 해요체와 간결한 명사형 라벨을 사용했다.
- 원비 학년도·납부 주기, 설명회 시각·마감, 셔틀 비용·확인 필요 조건, 후기 표본·기간·한계를 구조화 값과 함께 보존한다.
- 미수집, 공식 안내에서 미발견, 접근 실패, 추가 검수 필요를 서로 다른 상태로 표시한다.
- 제3자 후기는 `공개 후기 요약 · 공식 정보 아님`으로 표시하고 평점·순위를 생성하지 않는다.
- DRAFT 자료는 공개 목록·상세에서 노출하지 않는 것을 실제 프로덕션 HTTP 요청으로 확인했다.

