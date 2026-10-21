# PREPPY 코드베이스 개선 기획 (P0~P2, 15개 항목)

- 작성일: 2026-10-19
- 기준 코드: `main` `202f5303e9` + 이름 변경 커밋 `76a519a` (`claude/tender-carson-00i47b`)
- 상태: **기획안**. 이 문서는 코드 수정·마이그레이션·배포·운영 설정 변경을 승인하지 않아요. 항목마다 Owner 승인 후 별도 브랜치·PR로 진행해요.
- 필수 기준: [AGENTS.md](../../AGENTS.md), [PREPPY UX Writing 정책](../PREPPY_UX_WRITING_POLICY.md), [Scoped English session migration](../SCOPED_ENGLISH_SESSION_MIGRATION.md)

## 0. 요약

### 0.1 우선순위와 추천 순서

판단 기준은 **매출 기반(관심기관 알림 → 재방문)을 지키는지, 고치는 비용이 얼마나 작은지**예요.

| 순서 | 항목 | 등급 | 규모 | 스키마 변경 | 매출 관점 이유 |
|---|---|---|---|---|---|
| 1 | 1. 메일 비활성 시 영구 억제 | P0 | S | 없음 | worker를 켜는 순간 알림 자산이 사라질 수 있어요 |
| 2 | 2. Healthcheck 경로 불일치 | P0 | S | 없음 | 잘못된 배포를 막는 장치가 IaC 기준으로 꺼져 있어요 |
| 3 | 4. worker 실패가 성공으로 보임 | P0 | S | 없음 | 알림이 멈춰도 아무도 모르게 돼요 |
| 4 | 5. 0017 미적용 방어 | P0 | S | 없음 | 플래그 하나로 탈퇴 API 장애가 나요 |
| 5 | 3. DB 테스트 고장 + CI 미검증 | P0 | M | 없음 | 위 수정들을 안전하게 배포하려면 먼저 필요해요 |
| 6 | 7. 통합 테스트 비결정성 | P1 | S | 없음 | 3번과 함께 처리해요 |
| 7 | 10. 설정 불일치 3건 | P1 | S | 없음 | 운영자 오조작을 막아요 |
| 8 | 6. 0018 snapshot 누락 | P1 | S | 없음 (메타 파일만) | 다음 마이그레이션 사고를 막아요 |
| 9 | 8. 트랜잭션 안의 외부 호출 | P1 | M | 없음 | 발송량이 늘 때 장애 요인이에요 |
| 10 | 9. 프로세스 메모리 상태 | P1 | M | 2단계에 필요 | web 확장 전 필수예요 |
| 11 | 15. 미사용 코드 정리 | P2 | S | 없음 | 혼란 비용을 줄여요 |
| 12 | 14. 관리자 권한 | P2 | M | 2단계에 필요 | 운영 인원이 늘 때 필요해요 |
| 13 | 13. raw SQL 타입 안전성 | P2 | M | 없음 | 점진 적용해요 |
| 14 | 12. 거대 파일 분리 | P2 | L | 없음 | 기능 개발 속도를 높여요 |
| 15 | 11. 레거시 모델 정리 | P2 | L | 마지막 단계에 필요 | 장기적으로 코드량을 크게 줄여요 |

규모: S = 1일 이하, M = 2~4일, L = 1주 이상 (테스트 포함 추정치예요).

### 0.2 공통 제약

1. **스키마 변경은 0017 결정 이후로 미뤄요.** 운영 ledger는 0017이 빠진 상태라, 새 마이그레이션(0019 이상)은 전체 실행기에서 `MIGRATION_GAP_REQUIRES_REVIEW`로 차단돼요. 0019를 위한 별도 scoped 실행기를 또 만드는 것은 위험이 커요. 그래서 P0·P1은 스키마 변경 없이 해결하도록 설계했고, DB 변경이 필요한 단계(9-2단계, 14-2단계, 11-4단계)는 **0017 적용 또는 영구 제외 결정**을 선행 조건으로 둬요.
2. **staging ledger의 미등록 해시(c157, `0018_article_tags`)도 별도 결정이 필요해요.** 스키마 변경이 필요한 작업은 staging에서도 이 문제를 먼저 정리해야 검증할 수 있어요.
3. 운영 플래그(`WORKER_ENABLED`, `EMAIL_SEND_ENABLED`, `CACHE_REVALIDATION_ENABLED`)는 이 기획의 코드가 배포된 뒤에도 Owner 승인 없이 바꾸지 않아요.
4. 모든 PR은 `npm run prebuild`, `npm run typecheck`, `npm run test:unit`, (3번 이후) DB 통합 테스트를 통과해야 해요. 배포는 AGENTS.md의 staging → production 동일 커밋 원칙을 따라요.

### 0.3 시나리오 테스트 표기

- ID: `T<항목>-H<번호>`는 해피 케이스, `T<항목>-U<번호>`는 언해피 케이스예요.
- 계층
  - `unit`: `tests/unit` (DB 없음)
  - `int`: `tests/integration` (전용 PostgreSQL)
  - `ci`: GitHub Actions에서 실행
  - `ops`: staging에서 사람이 수행하는 확인
- 형식: **전제 → 동작 → 기대 결과**

---

## P0 — 운영 장애·데이터 손실 위험

### 1. 메일 발송이 꺼져 있으면 대기 메일이 영구 억제돼요

**현재 문제 (코드 확인)**
- `src/modules/notification/send-delivery.server.ts:170`: `sendEnabled === false`이면 `notification_deliveries.status='SUPPRESSED'`, `suppress_reason='OTHER'`로 바꾸고 outbox 이벤트를 `PROCESSED`로 끝내요.
- `src/modules/worker/run-once.server.ts:103`: 캐시 이벤트는 플래그가 꺼지면 claim 대상에서 빠지지만, `DELIVERY_EMAIL_SEND`는 빠지지 않아요.
- 결과: `WORKER_ENABLED=true`, `EMAIL_SEND_ENABLED=false` 조합(예: 알림 생성만 먼저 검증하려는 경우)이면 보내야 할 메일이 복구 없이 사라져요.
- 반대 위험: worker가 오래 꺼져 있다가 켜지면, 몇 주 전 변경 알림이 한꺼번에 나갈 수 있어요. 이 경우 보호자는 이미 지난 정보를 새 소식처럼 받게 돼요.

**목표**
- 메일 발송이 꺼져 있으면 발송 이벤트를 **처리하지 않고 대기열에 남겨요.**
- 너무 오래된 알림은 보내지 않고, 이유를 기록해서 억제해요.

**개선안**
1. `run-once.server.ts`의 `enabledEventTypes`에서 `emailSendEnabled=false`이면 `DELIVERY_EMAIL_SEND`도 제외해요. 캐시 이벤트와 같은 방식이에요.
   - stale lease 회수도 같은 목록을 쓰므로, 이미 `PROCESSING`인 발송 이벤트는 메일이 다시 켜질 때까지 회수하지 않아요.
2. `processEmailDelivery`의 `sendEnabled === false` 분기는 방어 코드로 남겨요. 다만 억제 대신 `ConflictError`를 던지고 이벤트를 `PENDING`으로 되돌리는(reschedule) 방식으로 바꿔요. 1번 때문에 정상 경로에서는 도달하지 않아요.
3. **오래된 알림 차단.** `notifications.signal_published_at`이 기준 시간(`NOTIFICATION_MAX_SIGNAL_AGE_HOURS`, 기본 72시간)보다 오래됐으면:
   - 발송하지 않아요.
   - delivery를 `SUPPRESSED`(`suppress_reason='OTHER'`)로 바꾸고, outbox `last_error_code='STALE_SIGNAL_EXPIRED'`를 남긴 뒤 `PROCESSED`로 끝내요.
   - 두 컬럼 모두 기존 CHECK 제약 범위 안이라 마이그레이션이 필요 없어요.
4. worker 요약 출력에 `held: { emailDelivery: <PENDING 건수> }`와 `staleSuppressed` 건수를 추가해요.
5. 운영 사전 확인 SQL(읽기 전용)을 런북에 추가해요. 이미 `SUPPRESSED`+`OTHER`로 끝난 delivery 건수를 세어 과거 손실이 있었는지 확인하는 용도예요.

**변경 범위**
- `src/modules/worker/run-once.server.ts`
- `src/modules/notification/send-delivery.server.ts`
- `src/config/runtime-env.ts` (기준 시간 파싱, 범위 1~720)
- `tests/integration/wp12a-*`, 신규 단위 테스트

**완료 기준**
- 메일 비활성 상태에서 worker를 실행해도 `DELIVERY_EMAIL_SEND`의 상태·시도 횟수가 바뀌지 않아요.
- 메일을 켠 뒤 같은 이벤트가 정상 발송돼요.
- 오래된 알림은 보내지 않고, 이유를 운영 화면에서 확인할 수 있어요.

**시나리오 테스트**

| ID | 계층 | 전제 → 동작 → 기대 결과 |
|---|---|---|
| T1-H1 | int | 공개 모집 일정에 관심 사용자 2명, NOTIFIABLE 변경 → `WORKER_ENABLED=true`, `EMAIL_SEND_ENABLED=true`로 실행 → notification 1건, delivery 2건 `SENT`, outbox 전부 `PROCESSED` |
| T1-H2 | int | 같은 전제, `EMAIL_SEND_ENABLED=false` → worker 실행 → `OPPORTUNITY_CHANGE_PUBLISHED`는 처리돼 delivery 2건이 `QUEUED`, `DELIVERY_EMAIL_SEND` 2건은 `PENDING`이고 `attempt_count=0`, `notification_delivery_attempts` 0건 |
| T1-H3 | int | T1-H2 직후 `EMAIL_SEND_ENABLED=true`로 다시 실행 → 2건 모두 `SENT`, 시도 기록은 delivery당 1건 |
| T1-H4 | int | 72시간 이내 알림 → 발송 → 정상 `SENT` (경계값 71시간 59분) |
| T1-U1 | int | `signal_published_at`이 73시간 전 → 메일을 켜고 실행 → 발송 함수 호출 0회, delivery `SUPPRESSED`/`OTHER`, outbox `PROCESSED`, `last_error_code='STALE_SIGNAL_EXPIRED'` |
| T1-U2 | int | 메일 비활성 상태에서 `PROCESSING`으로 남은 발송 이벤트(lease 만료) → worker 실행 → 회수하지 않고 그대로 남아요. 메일을 켠 뒤에는 기존 규칙(STARTED 시도가 있으면 격리)대로 처리돼요 |
| T1-U3 | unit | `NOTIFICATION_MAX_SIGNAL_AGE_HOURS=0`, `abc`, `721` → 설정 파싱이 실패하고 worker가 exit 2로 끝나요 |
| T1-U4 | int | 방어 분기에 직접 도달(테스트 seam으로 `sendEnabled=false` 주입) → delivery는 `QUEUED`를 유지하고 이벤트는 `PENDING`으로 돌아가요. `SUPPRESSED`가 되지 않아요 |
| T1-U5 | int | 메일 비활성 상태에서 사용자가 대기 중 탈퇴하거나 관심기관을 해제 → 메일을 켠 뒤 실행 → 기존 자격 재검사로 `USER_INACTIVE`/`FOLLOW_INACTIVE` 억제돼요(회귀 확인) |
| T1-U6 | ops | staging에서 worker를 켜기 전에 사전 확인 SQL을 실행 → 대기·과거 억제 건수가 기록되고, Owner 확인 전에는 플래그를 바꾸지 않아요 |

**UX Writing 영향**: 이메일 본문은 바꾸지 않아요. 대신 지난 정보가 새 소식처럼 전달되는 상황을 막아요. 정책 4장(지난 일정과 현재 일정의 구분)을 보호하는 변경이에요. 관리자 화면의 억제 사유 표시가 추가되면 그 문구는 구현 PR에서 검수해요.

---

### 2. Healthcheck 경로가 운영 규칙과 달라요

**현재 문제 (코드 확인)**
- `.railway/railway.ts`의 web `healthcheck`는 `/api/health`예요. 이 경로(`app/api/health/route.ts`)는 아무것도 검사하지 않고 항상 200을 반환해요.
- AGENTS.md는 staging·production web의 Healthcheck Path를 `/api/release-integrity`로 유지하라고 해요.
- `tests/unit/wp15b-railway-production.test.ts:69`가 `/api/health`를 기대값으로 고정하고 있어요.
- **함께 고쳐야 하는 함정:** `/api/release-integrity`는 `hasDeploymentEnvironmentMismatch()`를 검사해요(`src/config/deployment-environment.ts`).
  - `RAILWAY_ENVIRONMENT_NAME`이 staging/production인데 `PREPPY_ENVIRONMENT`가 없거나 다르면 503이에요.
  - 그런데 `railway.ts`의 web env에는 `PREPPY_ENVIRONMENT`가 없어요.
  - 경로만 바꾸고 IaC를 적용하면 모든 배포가 실패할 수 있어요.

**목표**: IaC, 테스트, 운영 설정이 모두 `/api/release-integrity`를 쓰고, 이 경로가 실제 배포 환경에서 통과해요.

**개선안**
1. `railway.ts`: web `healthcheck: "/api/release-integrity"`로 바꾸고, web env에 `PREPPY_ENVIRONMENT: context.shared.PREPPY_ENVIRONMENT`를 추가해요. worker env에도 같은 값을 추가해 일관성을 맞춰요.
2. `wp15b-railway-production.test.ts`의 기대값을 바꾸고, 두 가지를 고정하는 단위 테스트를 추가해요.
   - web env에 `PREPPY_ENVIRONMENT`가 있는지
   - healthcheck가 `/api/health`로 되돌아가지 않는지
3. `/api/health`는 liveness 용도로 남기고 의미를 주석으로 명시해요. Railway healthcheck로는 쓰지 않아요.
4. 런북: 배포 전 staging·production의 Railway 대시보드에서 Healthcheck Path와 `PREPPY_ENVIRONMENT` 값을 확인하고, 배포 기록에 남겨요.

**변경 범위**: `.railway/railway.ts`, `tests/unit/wp15b-railway-production.test.ts`, `docs/15B_RAILWAY_PRODUCTION_CONFIGURATION.md` 해당 줄

**완료 기준**: 단위 테스트가 새 경로와 env를 고정하고, staging 배포에서 healthcheck가 통과하는 기록이 남아요.

**시나리오 테스트**

| ID | 계층 | 전제 → 동작 → 기대 결과 |
|---|---|---|
| T2-H1 | unit | `railway.ts`를 mock IaC로 평가 → web `healthcheck === "/api/release-integrity"`, `healthcheckTimeout === 120`, env에 `PREPPY_ENVIRONMENT` 포함 |
| T2-H2 | unit | `RAILWAY_ENVIRONMENT_NAME=production`, `PREPPY_ENVIRONMENT=production`, 승인 아이콘, 로그인 없는 헤더 → `GET /api/release-integrity` → 200 `{status:"ok"}` |
| T2-H3 | ci | 기존 `release-image.yml`의 runtime image 검사 → staging·production origin 모두 `"status":"ok"` (회귀) |
| T2-H4 | ops | staging 배포 → Railway 배포 상태가 healthy이고 Healthcheck Path가 `/api/release-integrity`로 표시돼요 |
| T2-U1 | unit | `RAILWAY_ENVIRONMENT_NAME=production`, `PREPPY_ENVIRONMENT` 없음 → 503 `{status:"unavailable"}` |
| T2-U2 | unit | `PREPPY_ENVIRONMENT=staging`인데 Railway 이름이 production → 503 |
| T2-U3 | unit | `site-header.tsx`에 `카카오 로그인` 문자열 주입(fixture) → 503 |
| T2-U4 | unit | `app/icon.png` 해시가 다른 fixture → 503 |
| T2-U5 | unit | 누군가 healthcheck를 `/api/health`로 되돌린 IaC → 단위 테스트가 실패해요 |
| T2-U6 | ops | staging에서 `PREPPY_ENVIRONMENT`를 빼고 배포(리허설 서비스에서만) → 배포가 healthy가 되지 않고 이전 배포가 유지돼요 |

**UX Writing 영향**: N/A — 내부 배포 경로와 환경변수만 바꿔요. 다만 이 경로가 헤더 로그인 미노출을 검사하므로, 공개 헤더 정책을 보호하는 장치가 강화돼요.

---

### 3. main의 DB 통합 테스트가 깨져 있는데 CI가 잡지 못해요

**현재 문제 (실측, 2026-10-19)**
- 임시 PostgreSQL 16에서 순차 실행한 결과, main은 661개 중 13개, 이번 브랜치는 11개가 실패했어요. 새로 생긴 실패는 없어요.
- 원인별 분류

| 원인 | 테스트 | 근거 |
|---|---|---|
| 마이그레이션 수 하드코딩 (0018 추가 후 미갱신) | `wp10a-source-binding-migration`(2), `wp12b-provider-event-migration`(2), `wp15a-rehearsal`(2), `wp15a-read-only-gate`(1) | "19 ≠ 18", "0018 ≠ 0017" |
| ledger/manifest 비교 기대값 미갱신 (추정, 원인 확인 필요) | `wp16a-operational-snapshot`, `wp16a-restore-drill`, `preppy-production-live-admission-rollout` | MATCH·drill 결과 객체 불일치 |
| 날짜 고정 픽스처 (시간이 지나면 깨짐) | `wpui01-preview-seed` | `closesAt: 2026-10-17` 등 고정 날짜가 오늘 기준으로 지나서 "6개 기대, 5개" |
| 실행 환경 가정 | `scoped-migration-guard` | `TEST_DATABASE_URL` host가 `127.0.0.1`이 아니면 `LOCAL_MIGRATION_TEST_ONLY`로 중단 (localhost로 실행해서 생긴 실패예요) |
| 실행마다 달라짐 | `wp11-admin-operations` 등 | 7번 항목 |

- CI(`public-release-guard.yml`, `release-image.yml`)는 `test:unit`과 `typecheck`만 실행해요. 그래서 DB 테스트가 언제 깨졌는지 아무도 모르는 상태예요.

**목표**: main의 DB 통합 테스트가 전부 통과하고, PR마다 CI가 이를 검증해요.

**개선안**
1. **하드코딩 제거**: 마이그레이션 수와 마지막 식별자를 `EXPECTED_REPOSITORY_MIGRATIONS`(`src/modules/production-safety/migration-manifest.ts`)에서 계산해요. 예: `migrationCount: EXPECTED_REPOSITORY_MIGRATIONS.length`, `.at(-1).identifier`.
2. **원인 미확인 3건**: 각각 실패 diff를 출력해 원인을 확정하고 같은 PR에서 고쳐요. 기대값을 맞추려고 검사 자체를 약하게 만들지 않아요.
3. **시간 의존 제거**: `seed-preview-demo.ts`와 테스트에 기준 시각(`now`)을 주입해요. 날짜는 `now` 기준 상대값(예: +7일, +14일)으로 만들어요. 홈 쿼리가 `now()`를 쓰면 executor에 고정 시각을 전달하는 테스트 seam을 둬요.
4. **실행 환경 문서화**: README와 `.env.example`에 `TEST_DATABASE_URL=postgres://...@127.0.0.1:55433/preppy_test`를 명시해요.
5. **CI 통합 테스트 job 추가**
   - `public-release-guard.yml`에 `services: postgres:16-alpine` job을 추가해요(포트 5432, `preppy_test` 생성).
   - `TEST_DATABASE_URL=postgres://preppy:preppy@127.0.0.1:5432/preppy_test npm run test:db`를 실행해요.
   - pg_dump·pg_restore가 필요한 테스트를 위해 `postgresql-client-16`을 설치해요.
   - 처음에는 필수 체크로 두되, 실행 시간(약 3분)을 기록해요.
6. 테스트를 건너뛰거나 비활성화해서 green을 만들지 않아요.

**변경 범위**: 위 테스트 파일, `scripts/seed-preview-demo.ts`, `.github/workflows/public-release-guard.yml`, README

**완료 기준**: 로컬과 CI에서 `test:db`가 0 failed로 끝나고, main 보호 규칙에 새 CI job이 필수 체크로 추가돼요(GitHub 설정은 Owner가 변경해요).

**시나리오 테스트**

| ID | 계층 | 전제 → 동작 → 기대 결과 |
|---|---|---|
| T3-H1 | int | 빈 DB → 전체 마이그레이션 → ledger 행 수 = manifest 길이, 마지막 식별자 = manifest 마지막 |
| T3-H2 | int | 고정 `now=2026-10-19`와 `now=2027-03-01` 두 기준 → preview seed 실행 → 두 경우 모두 홈 현재 일정 6건, 두 번 실행해도 결과 동일(idempotent) |
| T3-H3 | ci | PR 생성 → 새 job이 PostgreSQL을 띄우고 `test:db` 통과 |
| T3-H4 | int | manifest에 가상의 20번째 항목을 추가한 브랜치(실험용) → 하드코딩이 없으므로 카운트 테스트는 수정 없이 통과해요 |
| T3-U1 | ci | 마이그레이션 SQL 한 글자 변경 → `MIGRATION_SOURCE_CHECKSUM_MISMATCH`로 CI 실패 |
| T3-U2 | ci | 통합 테스트 하나를 일부러 깨뜨린 PR → 필수 체크 실패로 merge가 막혀요 |
| T3-U3 | int | `TEST_DATABASE_URL`이 `preppy`(테스트 전용 이름 아님) → `assertDedicatedTestDatabaseUrl`이 즉시 중단 |
| T3-U4 | int | `TEST_DATABASE_URL` host가 `localhost` → `scoped-migration-guard`가 명확한 오류로 중단하고, README 안내와 오류 메시지가 일치해요 |
| T3-U5 | ci | PostgreSQL 서비스가 뜨지 않음 → job이 healthcheck 단계에서 실패하고 원인이 로그에 남아요 (green으로 넘어가지 않아요) |

**UX Writing 영향**: N/A — 테스트와 CI만 바꿔요. preview seed의 사용자 노출 문구는 바꾸지 않고 날짜 계산만 바꿔요. seed 문구가 바뀌면 그 PR에서 따로 검수해요.

---

### 4. worker가 실패해도 성공으로 보여요

**현재 문제 (코드 확인)**
- `scripts/worker.ts:139`: 처리 중 이벤트가 실패해도(`failed > 0`) 항상 `exitCode: 0`이에요.
- worker는 1회 실행 후 종료하는 구조이고, 주기 실행은 Railway cron에 의존해요. 이 cron과 재시작 정책은 `.railway/railway.ts`로 표현할 수 없어서 수동 설정이에요(`docs/15B_RAILWAY_PRODUCTION_CONFIGURATION.md`).
- 결과: cron이 빠지거나, DB 오류로 이벤트가 계속 실패하거나, 대기열이 쌓여도 Railway에서는 "성공"으로 보여요.

**목표**: 실패와 정체를 Railway 실행 결과와 관리자 운영 화면에서 바로 알 수 있어요.

**개선안**
1. **종료 코드 정책**

| 코드 | 의미 |
|---|---|
| 0 | 정상 (재시도 예약은 정상으로 봐요) |
| 3 | 부분 실패: `failed > 0` 또는 이번 실행에서 `DEAD_LETTER`가 새로 생김 |
| 2 | 설정·인자 오류 (기존과 같아요) |
| 124 | 시간 초과 (기존과 같아요) |
| 1 | 처리되지 않은 예외 (기존과 같아요) |

2. 요약 JSON에 `exitReason`과 `oldestPendingAgeSeconds`를 추가해요(이벤트 종류별).
3. **정체 감지(스키마 변경 없음)**: 관리자 `/admin/operations/health`의 운영 스냅샷에 기준을 추가해요.
   - 가장 오래된 `PENDING`의 `available_at`이 15분을 넘으면 `ATTENTION`이에요.
   - 단, 해당 플래그가 꺼진 이벤트 종류는 "보류 중"으로 따로 표시하고 경보에서 빼요(1번 항목과 연계).
4. **cron 설정 고정 장치**: IaC로 표현할 수 없으므로 두 가지를 둬요.
   - 배포 체크리스트에 cron `*/5 * * * *`과 재시작 정책 `NEVER` 확인 항목을 추가해요.
   - `deploy:preflight` 출력에 "worker cron은 수동 확인 대상"이라는 경고를 넣어요.
5. Railway에서 exit 3을 실패 실행으로 표시하는지 staging에서 확인한 뒤 production에 적용해요.

**변경 범위**: `scripts/worker.ts`, `src/modules/worker/run-once.server.ts`, `src/modules/production-safety/operational-snapshot.server.ts`, 관리자 운영 화면, 런북

**완료 기준**
- 실패가 있으면 exit 3이 되고 Railway 실행 목록에 실패로 남아요.
- 대기열 정체가 관리자 화면에 `ATTENTION`으로 보여요.

**시나리오 테스트**

| ID | 계층 | 전제 → 동작 → 기대 결과 |
|---|---|---|
| T4-H1 | int | 대기 이벤트 3건, 모두 성공 → 실행 → exit 0, 요약 `failed: 0` |
| T4-H2 | int | 재시도 가능한 Resend 429 → 실행 → 이벤트 재예약, exit 0 (재시도는 실패로 보지 않아요) |
| T4-H3 | unit | `WORKER_ENABLED=false` → exit 0, `enabled:false` (CI 이미지 검사 회귀) |
| T4-H4 | int | 오래된 PENDING 없음 → 운영 스냅샷 `OK` |
| T4-U1 | int | 디스패처가 예외를 던지는 이벤트 1건 + 정상 1건 → exit 3, 요약 `failed: 1`, 정상 건은 `PROCESSED` |
| T4-U2 | int | 최대 시도 초과로 `DEAD_LETTER` 발생 → exit 3, `exitReason: "DEAD_LETTERED"` |
| T4-U3 | int | 20분 지난 `OPPORTUNITY_CHANGE_PUBLISHED` PENDING → 스냅샷 `ATTENTION`, 가장 오래된 대기 시간 표시 |
| T4-U4 | int | 캐시 플래그가 꺼진 상태의 20분 지난 캐시 이벤트 → 경보 없음, "보류 중" 건수만 표시 |
| T4-U5 | unit | DB 접속 실패 → 처리되지 않은 예외로 exit 1, stderr에 비밀값 없이 오류 코드만 남아요 |
| T4-U6 | unit | 처리 시간이 `--timeout-ms` 초과 → exit 124 (회귀) |
| T4-U7 | ops | staging에서 exit 3 실행을 일부러 발생 → Railway cron 실행 기록에 실패로 표시되는지 확인 |

**UX Writing 영향**: 관리자 운영 화면에 상태 문구가 추가돼요(예: `오래 대기 중인 작업이 있어요`, `메일 발송이 꺼져 있어 보류 중이에요`). 구현 PR에서 정책 7장(무엇이 안 됐는지와 다음 행동)에 맞춰 검수해요. 일반 사용자 화면에는 영향이 없어요.

---

### 5. 0017 미적용 상태에서 탈퇴 기능을 막는 장치가 환경변수 두 개뿐이에요

**현재 문제 (코드 확인)**
- 탈퇴 API, 가입 취소, 카카오 연결 해제 webhook은 `isAccountDeletionEnabled()`만 확인해요(`src/modules/account-deletion/runtime.server.ts:11`). 조건은 `ACCOUNT_DELETION_ENABLED=true` + `ACCOUNT_DELETION_READINESS=verified`예요.
- 운영 DB에는 0017이 없어요. `account_deletion_jobs`, `kakao_unlink_inbox` 테이블과 `users.status='DELETION_PENDING'` 허용값이 없어요.
- 두 변수는 IaC에 정의되지 않아서 대시보드에서 누구나 켤 수 있어요. 켜면 사용자 요청이 DB 오류로 실패해요. 화면에 탈퇴 버튼도 노출돼요(`app/(public)/my-preppy/settings/page.tsx`, `app/(public)/onboarding/page.tsx`).
- 가입 취소(`/api/auth/onboarding/cancel`)도 같은 경로라 함께 영향을 받아요.

**목표**: DB가 준비되지 않았으면 플래그와 관계없이 기능이 꺼져 있고, 화면에 버튼이 보이지 않아요.

**개선안**
1. `isAccountDeletionEnabled()`를 비동기 `getAccountDeletionAvailability()`로 바꿔요. 조건은 플래그 + **스키마 준비 확인**이에요.
   - 스키마 확인: `to_regclass('public.account_deletion_jobs')`, `to_regclass('public.kakao_unlink_inbox')`, `users_status_check`에 `DELETION_PENDING` 포함 여부(`pg_get_constraintdef`), `block_deleting_kakao_identity_before_insert` 트리거 존재 여부
   - 결과는 프로세스에서 5분 캐시해요. 실패하면 "준비 안 됨"으로 봐요(fail closed).
2. 준비 안 됨이면 API는 기존과 같은 503 `DELETION_UNAVAILABLE`, 화면은 기존 비활성 분기를 그대로 써요.
3. 관리자 운영 스냅샷에 `accountDeletion: { flag: on/off, schemaReady: true/false }`를 표시해요. 플래그는 켜졌는데 스키마가 없으면 `ATTENTION`이에요.
4. railway.ts에 `ACCOUNT_DELETION_ENABLED: "false"`를 `sideEffectsOff`처럼 명시해서 기본값을 고정해요.
5. 탈퇴 worker 스크립트에도 같은 준비 확인을 넣어요(10번 항목과 연계).

**변경 범위**: `src/modules/account-deletion/runtime.server.ts`, 사용처 3곳, `scripts/account-deletion-worker.ts`, 운영 스냅샷, `.railway/railway.ts`, 단위·통합 테스트

**완료 기준**: 0017이 없는 DB에서 플래그를 켜도 API는 503, 화면에는 탈퇴 버튼이 없고, 관리자 화면에 경고가 보여요.

**시나리오 테스트**

| ID | 계층 | 전제 → 동작 → 기대 결과 |
|---|---|---|
| T5-H1 | int | 0017 적용 DB + 플래그 on + 비밀값 정상 → 최근 로그인 사용자 탈퇴 요청 → 202, 작업 1건 생성(기존 동작 회귀) |
| T5-H2 | int | 0017 적용 DB + 플래그 off → 503, 화면에 탈퇴 버튼 없음 |
| T5-H3 | int | 0017 적용 DB + 플래그 on → 가입 대기 사용자의 가입 취소 → 계정 삭제 완료(기존 동작 회귀) |
| T5-U1 | int | **0016까지 + 0018만 적용한 DB(운영과 같은 형태)** + 플래그 on → `POST /api/me/account/deletion` → 503 `DELETION_UNAVAILABLE`, DB 쓰기 0건 |
| T5-U2 | int | 같은 DB + 플래그 on → `/my-preppy/settings` 렌더링 → 탈퇴 버튼 미노출 |
| T5-U3 | int | 같은 DB + 플래그 on → 카카오 unlink webhook(정상 서명) → 503, 카카오가 재시도할 수 있게 200을 주지 않아요 |
| T5-U4 | int | 같은 DB + 플래그 on → `/api/auth/onboarding/cancel` → 503, 가입 대기 사용자는 그대로 남아요 |
| T5-U5 | int | 스키마 확인 쿼리 자체가 실패(권한 없음 시뮬레이션) → 준비 안 됨으로 판단 |
| T5-U6 | int | 0017 DB에서 `DELETION_PENDING` CHECK만 빠진 부분 적용 상태 → 준비 안 됨 |
| T5-U7 | int | 운영 스냅샷: 플래그 on + 스키마 없음 → `ATTENTION` |

**UX Writing 영향**: 사용자 화면 문구는 바꾸지 않아요. 기존 비활성 분기(버튼 미노출)를 그대로 써요. 정책 7장 "제공하지 않는 기능은 빈 버튼으로 채우지 않아요"를 지키는 방향이에요. 구현 PR에서 설정 화면과 가입 화면에 탈퇴·가입 취소 안내가 남는지, 남는다면 실제 가능한 행동과 맞는지 렌더링으로 확인해요.

---

## P1 — 구조적 위험

### 6. 0018에 drizzle snapshot이 없어요

**현재 문제**: `src/db/migrations/meta`에 `0017_snapshot.json`까지만 있어요. 0018 SQL은 손으로 쓴 마이그레이션이라 snapshot이 만들어지지 않았어요. 0017 snapshot의 테이블은 67개이고, 0018의 3개 테이블은 없어요. 다음 `npm run db:generate`가 0018 테이블을 다시 만드는 0019를 생성할 수 있어요.

**목표**: `db:generate`를 실행하면 "변경 없음"이 나와요.

**개선안**
1. `0018_snapshot.json`을 만들어요. 0017 snapshot을 바탕으로 `english_campus_identities`, `english_campus_aliases`, `english_session_identities`를 schema 정의와 같은 형태로 추가하고, `id`·`prevId` 체인을 연결해요.
2. 검증 방법: 임시 출력 폴더로 `drizzle-kit generate`를 실행해 diff가 없는지 확인해요(`DATABASE_URL`은 더미 값으로 충분해요).
3. 회귀 방지 단위 테스트를 추가해요.
   - journal 항목 수 = snapshot 파일 수
   - 마지막 snapshot의 테이블 집합 = schema의 테이블 집합
4. SQL 파일과 journal은 바꾸지 않아요. 해시와 ledger에는 영향이 없어요.

**변경 범위**: `src/db/migrations/meta/0018_snapshot.json`(신규), 단위 테스트 1개

**시나리오 테스트**

| ID | 계층 | 전제 → 동작 → 기대 결과 |
|---|---|---|
| T6-H1 | unit | snapshot 추가 후 → `drizzle-kit generate --out <임시폴더>` → "No schema changes" |
| T6-H2 | unit | journal 19개 = snapshot 19개, `prevId` 체인 끊김 없음 |
| T6-H3 | unit | 마지막 snapshot 테이블 70개 = `src/db/schema/index.ts`의 `pgTable` 70개 |
| T6-H4 | int | 전체 마이그레이션 실행 결과는 snapshot 추가 전과 같아요 (SQL 미변경 회귀) |
| T6-U1 | unit | 스키마에 테이블을 추가하고 snapshot을 갱신하지 않은 상태 → 회귀 테스트 실패 |
| T6-U2 | unit | snapshot 파일을 하나 지운 상태 → 개수 불일치로 실패 |
| T6-U3 | unit | migration-manifest 해시 검사 → 그대로 통과 (meta 파일은 해시 대상이 아니에요) |

**UX Writing 영향**: N/A — 마이그레이션 메타 파일과 테스트만 다뤄요.

---

### 7. DB 통합 테스트 결과가 실행할 때마다 달라요

**현재 문제 (실측)**: 기본 병렬 실행에서 main과 이번 브랜치의 실패 목록이 서로 달랐어요(같은 코드에서도 바뀌어요). 테스트 파일들이 하나의 `preppy_test` DB와 advisory lock(`preppy-schema-tests`)을 공유해요. 잠금을 잡지 않는 파일이나 잠금 밖의 정리 코드가 서로 간섭하는 것으로 보여요. 순차 실행에서는 결과가 안정적이었어요(약 152초).

**목표**: 같은 코드는 항상 같은 결과를 내요.

**개선안**
1. **1단계 (바로 적용)**: `test:db`를 `vitest run tests/integration --no-file-parallelism`으로 바꿔요. 단위 테스트는 병렬을 유지해요.
2. **2단계 (선택)**: 실행 시간이 문제가 되면 파일마다 전용 DB(`preppy_test_<worker>`)를 쓰는 global setup을 도입해요. 이름 규칙은 기존 `_test` 접미 검사를 통과하도록 `preppy_w1_test` 형식으로 해요.
3. advisory lock을 잡는지 정적으로 검사하는 단위 테스트를 추가해요. `tests/integration/*.test.ts` 중 DB를 쓰는 파일이 `preppy-schema-tests` 잠금 또는 전용 DB를 쓰는지 확인해요.

**시나리오 테스트**

| ID | 계층 | 전제 → 동작 → 기대 결과 |
|---|---|---|
| T7-H1 | int | 같은 커밋에서 `test:db` 3회 연속 실행 → 실패 목록이 3회 모두 같아요 (3번 완료 후에는 0건) |
| T7-H2 | ci | CI에서 2회 재실행 → 결과 동일 |
| T7-H3 | int | (2단계) 전용 DB 모드로 병렬 실행 → 결과가 순차 실행과 같아요 |
| T7-U1 | unit | 잠금 없이 DB를 초기화하는 새 테스트 파일 추가 → 정적 검사 실패 |
| T7-U2 | int | 이전 실행이 남긴 rehearsal DB(예: `preppy_wp15a_*`)가 있는 상태 → 테스트가 스스로 정리하고 통과해요 |

**UX Writing 영향**: N/A — 테스트 실행 방식만 바꿔요.

---

### 8. 외부 메일 호출이 DB 트랜잭션과 행 잠금 안에서 실행돼요

**현재 문제 (코드 확인)**: `send-delivery.server.ts:300~350`의 두 번째 트랜잭션은 `users` 행을 `FOR UPDATE`로 잠근 뒤 Resend를 호출해요(timeout 10초). 탈퇴 처리와 동시에 일어나지 않게 하려는 의도적인 설계예요. 다만 다음 위험이 있어요.
- 메일 10건을 순차로 보내는 동안 커넥션 1개가 최대 100초 가까이 트랜잭션 안에 머물러요.
- Resend가 느려지면 해당 사용자의 가입·관심기관·탈퇴 요청이 잠금을 기다려요.

**목표**: 탈퇴와의 동시성 보장은 유지하면서 잠금 유지 시간에 상한을 둬요.

**선택지와 추천**

| 안 | 내용 | 장점 | 단점 |
|---|---|---|---|
| A (추천, 지금) | 구조는 유지하고 상한을 강화해요. 이 트랜잭션에만 `SET LOCAL lock_timeout='3s'`, `statement_timeout='15s'`, `idle_in_transaction_session_timeout='20s'`를 걸고 Resend timeout을 10초→5초로 줄여요. worker 1회 실행의 발송 건수 상한(`--batch`)을 문서화해요 | 변경이 작아요. 탈퇴 보장 유지 | 발송량이 많아지면 근본 해결은 아니에요 |
| B (발송량 증가 시) | 시도를 `STARTED`로 기록하고 커밋한 뒤, 트랜잭션 밖에서 호출해요. 탈퇴 처리는 `STARTED` 시도가 있는 사용자를 기다리거나 결과 확정 후 진행해요 | 잠금 시간이 0이에요 | 탈퇴 흐름 변경과 리뷰 범위가 커요 |

**개선안 (A)**
1. 두 번째 트랜잭션 시작부에 `SET LOCAL` 세 줄을 추가해요.
2. `ResendEmailSender` timeout을 설정값으로 빼요(기본 5초, 범위 1~10초).
3. 잠금 대기 timeout이 나면 결과를 "발송 안 됨, 재시도 가능"으로 분류해요. 이 시점에는 Resend 호출 전이기 때문이에요. 호출 후 timeout은 기존 `PROVIDER_RESULT_UNKNOWN` 규칙을 유지해요.

**시나리오 테스트**

| ID | 계층 | 전제 → 동작 → 기대 결과 |
|---|---|---|
| T8-H1 | int | 정상 응답 Resend fake(100ms) → 발송 → `SENT`, 트랜잭션 시간 < 1초 |
| T8-H2 | int | 발송 중이 아닌 다른 사용자의 탈퇴 요청 → 지연 없이 처리 |
| T8-H3 | int | 기존 `wp12a-worker-concurrency` 동시성 테스트 → 그대로 통과 (탈퇴와 발송 직렬화 회귀) |
| T8-U1 | int | 다른 세션이 해당 `users` 행을 잡고 있음 → 발송 시도 → 3초 후 lock timeout, Resend 호출 0회, 이벤트 재예약 |
| T8-U2 | int | Resend fake가 6초 지연(timeout 5초) → `PROVIDER_RESULT_UNKNOWN`, 이벤트 `FAILED`, 관리자 재대조 대상 (기존 규칙 회귀) |
| T8-U3 | int | 발송 중 같은 사용자의 탈퇴 요청 → 탈퇴가 발송 트랜잭션 종료까지 기다린 뒤 진행. 탈퇴 후에는 같은 사용자에게 추가 발송 0건 |
| T8-U4 | unit | timeout 설정 `0`, `11000` → 설정 오류 |

**UX Writing 영향**: N/A — 발송 내부 처리만 바꿔요. 이메일 문구와 수신 조건은 바꾸지 않아요.

---

### 9. 로그인 보안 상태가 프로세스 메모리에 있어요

**현재 문제 (코드 확인)**: 다음 5개가 모두 `new Map()` 기반이라 web replica가 2개 이상이면 프로세스마다 상태가 달라져요.
- `ProcessLocalOAuthReplayStore`(`src/modules/auth/oauth-replay.server.ts:20`)
- `ProcessLocalRateLimiter`(`src/modules/auth/rate-limit.server.ts:28`)
- 관리자 flow replay(`src/modules/admin/auth/replay.server.ts:24`)
- 관리자 rate limit(`src/modules/admin/auth/rate-limit.server.ts:7`)
- 캐시 갱신 replay(`src/modules/cache/replay.server.ts:17`)

예를 들어 rate limit은 replica 수만큼 느슨해지고, replay 저장소는 다른 프로세스가 처리한 요청을 `UNKNOWN`으로 받아들여요. 지금은 replica 1이라 안전하지만, 이 전제가 코드나 IaC로 고정돼 있지 않아요.

**목표**: 확장 전까지는 replica 1을 강제하고, 확장할 때는 DB 기반 저장소로 바꿀 수 있게 해요.

**개선안**
1. **1단계 (스키마 변경 없음)**
   - `wp15b-railway-production.test.ts`에 web·worker `replicas === 1` 고정 검사를 추가해요.
   - 각 Process-local 클래스 상단에 "replica 1 전제" 주석과 문서 링크를 달아요.
   - 운영 스냅샷에 `RAILWAY_REPLICA_ID` 등 replica 식별 정보가 여러 개 관측되면 경고하는 항목을 검토해요(Railway 제공 변수 확인 필요).
2. **2단계 (0017 결정 이후, 마이그레이션 필요)**
   - `auth_replay_tokens(purpose, token_hash, expires_at)`와 `rate_limit_buckets(key, window_start, count)` 테이블을 만들어요.
   - 기존 인터페이스(`OAuthReplayStore`, `RateLimiter`)에 Postgres 구현을 추가하고 환경변수로 선택해요.
   - 만료 행 정리는 worker의 부가 작업으로 처리해요.

**시나리오 테스트**

| ID | 계층 | 전제 → 동작 → 기대 결과 |
|---|---|---|
| T9-H1 | unit | IaC 평가 → web·worker replicas 1 |
| T9-H2 | int | (2단계) Postgres replay 저장소 → 같은 state를 두 "프로세스"(두 인스턴스)에서 소비 → 첫 번째 성공, 두 번째 `CONSUMED`로 400 |
| T9-H3 | int | (2단계) rate limit 120/분 → 두 인스턴스에 60건씩 → 121번째 요청은 어느 인스턴스든 429 |
| T9-U1 | unit | replicas를 2로 바꾼 IaC → 테스트 실패 |
| T9-U2 | int | (2단계) DB 장애 중 로그인 시작 → 503, 보안 검사를 건너뛰고 통과시키지 않아요 (fail closed) |
| T9-U3 | int | (2단계) 만료된 replay 행 → 정리 작업 후 삭제, 유효한 행은 유지 |

**UX Writing 영향**: 1단계는 N/A예요. 2단계에서 로그인 실패·요청 과다 안내 문구가 바뀌거나 새로 생기면, 해당 PR에서 정책 7장(원인 단정 금지, 다음 행동 안내) 기준으로 검수해요.

---

### 10. 설정이 서로 어긋난 곳 3건

**현재 문제 (코드 확인)**
1. **관리자 메일 재대조**(`src/modules/notification/reconcile-resend.server.ts`): web에서 Resend를 직접 호출해요. `EMAIL_SEND_ENABLED`를 확인하지 않고, IaC 기준 web에는 `RESEND_API_KEY`·`EMAIL_FROM`이 없어요. 버튼을 누르면 설정 오류(500)가 날 것으로 보여요(추정).
2. **캐시 갱신 수신 엔드포인트**(`/api/internal/cache/revalidate`): `CACHE_REVALIDATION_ENABLED`를 확인하지 않고 HMAC만 확인해요. 보낼 쪽(worker)과 받을 쪽(web)의 스위치가 따로 놀아요.
3. **탈퇴 worker**(`scripts/account-deletion-worker.ts`): npm script와 Railway 서비스가 없어요. 실행하는 문서화된 방법도 없어요. worker용 tsconfig(`server-only` shim) 없이 실행하면 import 단계에서 실패할 것으로 보여요(추정).

**목표**: 운영자가 누르거나 실행하는 기능이 현재 설정에서 실제로 동작하는지 미리 알 수 있어요.

**개선안**
1. **재대조**
   - 서버: `EMAIL_SEND_ENABLED !== true`이거나 Resend 설정이 없으면, 외부 호출 전에 409 `EMAIL_SEND_DISABLED`를 반환하고 감사 기록에 `STILL_UNRESOLVED`를 남겨요.
   - 관리자 화면: 버튼을 비활성화하고 이유를 표시해요.
   - IaC: web에 Resend 비밀값을 줄지는 Owner 결정이에요. 기본안은 "재대조도 worker에서 처리"로 옮기는 것이지만, 범위가 커서 이번에는 막는 것까지만 해요.
2. **캐시 수신**: `CACHE_REVALIDATION_ENABLED !== true`이면 서명 검사 전에 503을 반환해요. 켤 때는 web과 worker를 함께 켜야 한다는 점을 런북에 명시해요.
3. **탈퇴 worker**
   - `package.json`에 `"account-deletion:once": "tsx --tsconfig scripts/worker-tsconfig.json scripts/account-deletion-worker.ts"`를 추가해요.
   - 5번의 스키마 준비 확인을 넣어요.
   - Railway 서비스 추가는 0017 결정 이후로 미뤄요.

**시나리오 테스트**

| ID | 계층 | 전제 → 동작 → 기대 결과 |
|---|---|---|
| T10-H1 | int | 메일 on + Resend fake + 재대조 조건 충족 → 재대조 → `RECONCILED`, delivery `SENT` (회귀) |
| T10-H2 | int | 캐시 플래그 on + 정상 HMAC → 200, 경로 갱신 호출 (회귀) |
| T10-H3 | unit | `npm run account-deletion:once`, 플래그 off → `ACCOUNT_DELETION_DISABLED`로 즉시 종료, DB 접속 없음 |
| T10-H4 | int | 0017 DB + 플래그 on → 탈퇴 worker 1회 → 대기 작업 1건 처리 |
| T10-U1 | int | 메일 off → 재대조 요청 → 409 `EMAIL_SEND_DISABLED`, Resend 호출 0회, 상태 변화 없음, 감사 기록 1건 |
| T10-U2 | int | 메일 on인데 `RESEND_API_KEY` 없음 → 409(또는 503), 500이 아니에요 |
| T10-U3 | int | 캐시 플래그 off + 정상 HMAC → 503, 경로 갱신 0회, replay 저장소에도 기록하지 않아요 |
| T10-U4 | int | 캐시 플래그 on + 잘못된 서명 → 401 (회귀) |
| T10-U5 | int | 0017 없는 DB + 탈퇴 플래그 on → 탈퇴 worker가 준비 안 됨으로 종료, 쓰기 0건 |
| T10-U6 | unit | 관리자 화면: 메일 off일 때 재대조 버튼 비활성, 이유 문구 표시 |

**UX Writing 영향**: 관리자 화면에 비활성 이유 문구가 추가돼요. 초안은 `메일 발송이 꺼져 있어 재대조할 수 없어요. 발송을 켠 뒤 다시 시도해 주세요.`이고, 구현 PR에서 정책 7장 기준으로 검수해요. 일반 사용자 화면에는 영향이 없어요.

---

## P2 — 리팩토링

### 11. 레거시 데이터 모델이 이중으로 남아 있어요

**현재 문제**: 모집 일정에 `truth_mode`(NATIVE / LEGACY_BACKED) 두 경로가 있어요. 레거시 경로(`schools`, `admission_cycles`, `admission_events/_versions`, `meaningful_changes`, `opportunity_admission_event_links`)가 다음 곳에서 분기를 만들어요.
- 일정 확인(`verify-opportunity.server.ts` 1,194줄)
- 공개 조회(`institution-query`, `opportunity-query`)
- 백필, 운영 점검

구독·알림 계열(`subscribers`, `subscriptions`, `alerts`, `alert_deliveries`, `updates`, `guides`, `expected_windows`)은 새 모델로 대체됐지만 테이블과 일부 참조가 남아 있어요.

**목표**: 새 기능은 NATIVE만 다루고, 레거시 경로는 단계적으로 읽기 전용 → 제거로 가요.

**단계**
1. **현황 조사 (읽기 전용)**: staging·production에서 `truth_mode`별 모집 일정 수, 레거시 테이블별 행 수, 최근 90일 쓰기 여부를 집계해요. 쿼리는 PR에 첨부하고 실행은 운영자가 해요.
2. **쓰기 동결**: LEGACY_BACKED 일정 확인을 막고 NATIVE 전환을 안내해요. 레거시 백필 CLI는 실행하면 중단되도록 바꿔요.
3. **데이터 전환**: LEGACY_BACKED 일정을 NATIVE 버전으로 복사하는 dry-run/apply CLI를 만들어요. 근거·이력은 보존하고, 변경 이력의 legacy 연결 컬럼은 유지해요.
4. **코드 제거**: 레거시 분기를 삭제해요.
5. **테이블 제거**: 0017 결정 이후 별도 마이그레이션으로 진행해요. 백업과 Owner 승인이 필요해요.

**시나리오 테스트**

| ID | 계층 | 전제 → 동작 → 기대 결과 |
|---|---|---|
| T11-H1 | int | LEGACY_BACKED 일정 3건 → 전환 dry-run → 변경 예정 3건 보고, DB 쓰기 0건 |
| T11-H2 | int | apply → NATIVE 버전 생성, 공개 상세의 날짜·상태·출처가 전환 전과 동일 (화면 데이터 스냅샷 비교) |
| T11-H3 | int | apply 2회 실행 → 두 번째는 NO_OP |
| T11-H4 | int | 전환 후 관심 사용자에게 알림이 다시 나가지 않아요 (`opportunity_changes`가 새로 생기지 않아요) |
| T11-U1 | int | 쓰기 동결 후 LEGACY_BACKED 일정 확인 요청 → 409와 안내 메시지, 쓰기 0건 |
| T11-U2 | int | 근거 snapshot이 없는 레거시 버전 → 전환 대상에서 제외하고 "검토 필요"로 보고, 임의로 근거를 채우지 않아요 |
| T11-U3 | int | 전환 중 오류(테스트 seam) → 전체 롤백, 부분 전환 0건 |
| T11-U4 | int | 학년도·날짜가 서로 다른 레거시 이벤트 → 값을 고치지 않고 그대로 옮기며, 충돌 표시를 유지해요 |

**UX Writing 영향**: 공개 화면의 날짜·상태·출처 의미가 바뀌면 안 되는 작업이에요. T11-H2에서 전환 전후 화면 데이터를 대조해요. 정책 4~6장(학년도·날짜 구분, 미발표·미확인 구분, 수집·확인 시점 분리)을 보존하는지 구현 PR에서 실제 데이터로 검증하고, 결과를 `PASS` 또는 `FIX_REQUIRED`로 남겨요.

---

### 12. 거대 파일 분리

**현재 문제**

| 파일 | 줄 수 |
|---|---|
| `src/db/schema/index.ts` | 3,419 |
| `src/modules/public/institution-query.server.ts` | 1,547 |
| `app/_components/english-kindergarten-pages.tsx` | 1,288 |
| `app/admin/_components/monitoring-actions.tsx` | 1,239 |
| `src/modules/monitoring/source-commands.server.ts` | 1,233 |
| `src/modules/monitoring/verify-opportunity.server.ts` | 1,194 |
| `src/modules/monitoring/repository.server.ts` | 1,176 |

리뷰 범위가 넓어지고 충돌이 잦아요.

**개선안 (동작 변경 없는 이동만)**
1. 스키마: `src/db/schema/{legacy,institution,opportunity,identity,notification,editorial,ops}.ts`로 나누고, `index.ts`는 re-export만 해요. drizzle config의 schema 경로는 그대로 유지해요.
2. `institution-query`: 목록·상세·검색·카드 매퍼로 나눠요.
3. `verify-opportunity`: NATIVE·LEGACY 경로와 공통 검증으로 나눠요(11번과 연계).
4. 관리자 `monitoring-actions.tsx`: 액션별 컴포넌트로 나눠요.
5. 한 PR에 한 파일만 다뤄요. 이동과 로직 변경을 같은 PR에 섞지 않아요.

**시나리오 테스트**

| ID | 계층 | 전제 → 동작 → 기대 결과 |
|---|---|---|
| T12-H1 | unit | 스키마 분리 후 `drizzle-kit generate` → 변경 없음 (6번 완료가 전제) |
| T12-H2 | unit | 분리 전후 `src/db/schema` export 이름 집합이 동일 |
| T12-H3 | int | 전체 단위·통합 테스트 결과가 분리 전과 같아요 |
| T12-H4 | ci | `next build` 성공, 번들 경고 증가 없음 |
| T12-U1 | unit | 순환 import 검사(`madge` 또는 eslint `import/no-cycle`) → 새 순환 0건 |
| T12-U2 | unit | 분리 PR에 동작 변경이 섞이면(테스트 기대값 변경) 리뷰에서 반려하는 규칙을 PR 템플릿 체크 항목에 추가해요 |

**UX Writing 영향**: N/A — 파일 이동만 해요. 단, 컴포넌트 분리(4번)에서 문구가 바뀌면 안 되므로 렌더링 결과 비교를 T12-H3에 포함해요.

---

### 13. raw SQL과 타입 강제 변환이 많아요

**현재 문제**: `src`에 `sql` 템플릿이 약 595개 있어요. 결과는 `as unknown as Array<...>`로 형변환해요(예: `send-delivery.server.ts:305`). 컬럼 이름이나 타입이 바뀌어도 컴파일러가 잡지 못해요.

**개선안**
1. `src/infrastructure/db/typed-query.ts`에 `queryRows(executor, query, zodSchema)`와 `queryOne(...)`을 추가해요. 결과를 Zod로 검증하고 실패하면 `DATABASE_CONTRACT_VIOLATION` 오류를 던져요.
2. 적용 순서: outbox 전이 → 알림 발송 → 관리자 명령 → 공개 조회. 돈과 알림에 가까운 곳부터 해요.
3. ESLint 규칙으로 새 코드의 `as unknown as`를 금지해요(기존 코드는 허용 목록으로 관리).
4. 성능: Zod 검증 비용을 공개 조회 hot path에서 측정하고, 문제가 되면 개발·테스트 환경에서만 검증하는 옵션을 둬요.

**시나리오 테스트**

| ID | 계층 | 전제 → 동작 → 기대 결과 |
|---|---|---|
| T13-H1 | int | outbox claim 쿼리를 `queryRows`로 전환 → 기존 outbox 테스트 전부 통과 |
| T13-H2 | unit | 정상 행 → 타입이 지정된 결과 반환 |
| T13-H3 | int | 공개 홈 조회 p95 시간 변화가 10% 이내 |
| T13-U1 | unit | 컬럼 누락 행 → `DATABASE_CONTRACT_VIOLATION`, 원본 값(개인정보 가능)은 오류 메시지에 넣지 않아요 |
| T13-U2 | unit | 새 파일에 `as unknown as` 추가 → lint 실패 |
| T13-U3 | int | 숫자 컬럼이 문자열로 오는 경우(`bigint`) → 스키마에서 명시적으로 변환하거나 실패하고, 조용히 잘못된 값을 쓰지 않아요 |

**UX Writing 영향**: N/A — 내부 쿼리 계층만 바꿔요. 공개 조회 결과가 같다는 것은 T13-H1·H3 회귀로 확인해요.

---

### 14. 관리자 권한 구분이 없어요

**현재 문제 (코드 확인)**: `admin_users`에는 `status`(ACTIVE/DISABLED)만 있고 역할이 없어요. ACTIVE 관리자는 기사 발행, 일정 확인(알림 발생), 출처 교체, outbox 재시도·취소를 모두 할 수 있어요. 관리자 추가는 코드 경로가 없어 수동 SQL로 하는 것으로 보여요(추정).

**목표**: 알림을 발생시키거나 운영 상태를 바꾸는 작업을 권한 있는 사람만 할 수 있어요. 관리자 추가와 비활성화가 감사 기록으로 남아요.

**단계**
1. **1단계 (스키마 변경 없음)**: `npm run admin:provision -- --subject <OIDC sub> --display-name <이름> [--disable]` CLI를 만들어요. dry-run이 기본이고, 실행 결과는 `audit_logs`에 시스템 컨텍스트로 남겨요. 수동 SQL은 금지해요.
2. **2단계 (0017 결정 이후, 마이그레이션 필요)**
   - `admin_users.role`을 추가해요: `OWNER`, `OPERATOR`, `EDITOR`. 기존 행은 `OWNER`로 채워요.
   - 권한표

| 작업 | EDITOR | OPERATOR | OWNER |
|---|---|---|---|
| 기사 초안·관계 | ✅ | ✅ | ✅ |
| 기사 발행·발행 취소·보관·slug 변경 | ✅ | ✅ | ✅ |
| 기관 사실·모집 일정 확인 | ❌ | ✅ | ✅ |
| 출처 연결·이동·접근 불가 | ❌ | ✅ | ✅ |
| outbox 재시도·취소, 메일 재대조 | ❌ | ❌ | ✅ |
| 관리자 추가·비활성화 | ❌ | ❌ | ✅ (CLI) |

   - `runAdminCommandRequest`에 `requiredRole`을 추가하고, 권한이 부족하면 403 `ADMIN_ROLE_REQUIRED`를 반환해요.
   - 화면에서는 권한이 없는 버튼을 숨겨요. 서버 검사가 기준이에요.

**시나리오 테스트**

| ID | 계층 | 전제 → 동작 → 기대 결과 |
|---|---|---|
| T14-H1 | int | (1단계) provision dry-run → 변경 예정만 출력, 쓰기 0건 |
| T14-H2 | int | (1단계) apply → `admin_users` 1건, 감사 기록 1건. 해당 sub로 OIDC 로그인 성공 |
| T14-H3 | int | (2단계) OPERATOR가 일정 확인 → 성공, 감사 기록에 역할 포함 |
| T14-H4 | int | (2단계) 마이그레이션 후 기존 관리자 전원 OWNER, 기존 기능 회귀 통과 |
| T14-U1 | int | (1단계) `--disable` 적용 → 다음 요청부터 해당 관리자 403/로그인 화면으로 이동 (세션이 남아 있어도 차단) |
| T14-U2 | int | (1단계) 이미 있는 sub로 생성 → 충돌 오류, 변경 0건 |
| T14-U3 | int | (2단계) EDITOR가 outbox 재시도 API 직접 호출 → 403 `ADMIN_ROLE_REQUIRED`, 상태 변화 0건, 거부도 감사 기록 |
| T14-U4 | int | (2단계) EDITOR 화면 → 재시도·확인 버튼 미노출 |
| T14-U5 | int | (2단계) 마지막 OWNER를 비활성화하려는 시도 → 거부 |

**UX Writing 영향**: 관리자 화면에 권한 안내 문구가 생겨요. 초안은 `이 작업은 운영 담당자만 할 수 있어요. 권한이 필요하면 관리자에게 요청해 주세요.`이고, 2단계 PR에서 검수해요. 일반 사용자 화면에는 영향이 없어요.

---

### 15. 쓰이지 않는 코드와 설정 정리

**현재 문제 (코드 확인)**
- `app/_components/auth-control.tsx`(`AuthControl`): 어디서도 import하지 않아요. 헤더 로그인을 의도적으로 뺀 뒤 남은 코드로 보여요.
- `.env.example`의 `OBJECT_STORAGE_*`, `LLM_API_KEY`: 코드에서 쓰지 않아요("Future integrations; unused").
- `complete-signup.server.ts`의 `upsertUserProfile`: persistence 객체에 있지만 가입 흐름에서 호출하지 않아요(자녀 출생연도 입력은 거부하는 정책).

**개선안**
1. **`AuthControl` 삭제**
   - `/api/auth/session`과 `/api/auth/logout`의 다른 사용처를 먼저 확인해요. 사용처가 없으면 라우트는 남기되 "헤더 로그인 재노출 시 사용" 주석을 달아요. 삭제 여부는 Owner가 결정해요.
   - 헤더 미노출 검사(`assert-header-auth-absence.mjs`)는 그대로 유지해요. 검사 대상을 `site-menu.tsx`, `site-footer.tsx`로 넓혀요.
2. `.env.example`의 미사용 변수를 지워요.
3. `upsertUserProfile`은 사용처가 없음을 확인한 뒤 삭제해요. `user_profiles` 테이블은 탈퇴 삭제 경로에서 쓰므로 유지해요.
4. 정적 분석 도구(예: `knip`)로 미사용 export 목록을 만들어 별도 PR로 정리해요.

**시나리오 테스트**

| ID | 계층 | 전제 → 동작 → 기대 결과 |
|---|---|---|
| T15-H1 | ci | 삭제 후 `prebuild`, `typecheck`, `next build`, 단위 테스트 통과 |
| T15-H2 | unit | 확장된 헤더 검사 → 현재 `site-header`, `site-menu`, `site-footer`, `commute/index.html` 통과 |
| T15-H3 | int | 가입 완료 흐름 회귀 → 동의 3건, 관심 지역·분야 저장, ACTIVE 전환 |
| T15-U1 | unit | `site-menu.tsx`에 `/auth/kakao/start` 링크를 넣은 fixture → 검사 실패 ("Owner approval is required…") |
| T15-U2 | unit | 관심기관 등록 버튼(`follow-cta.tsx`)의 카카오 로그인 이동은 검사 대상이 아니에요 → 통과 (사용자가 직접 선택한 인증 동선 보존) |
| T15-U3 | unit | 미사용 env를 다시 참조하는 코드 추가 → 환경변수 문서화 검사에서 경고 |

**UX Writing 영향**: 화면에 보이는 문구는 바뀌지 않아요. 헤더 로그인 미노출 정책(AGENTS.md)을 메뉴·푸터까지 넓혀 보호해요. 관심기관 등록의 로그인 이동 문구는 정책 7장 "로그인 화면으로 이동한다면 신청이 바로 완료되는 것처럼 표현하지 않아요"를 계속 따르는지 T15-U2와 함께 확인해요.

---

## 16. 실행 계획

### 16.1 PR 묶음 (추천)

| PR | 포함 항목 | 선행 조건 | 배포 영향 |
|---|---|---|---|
| A | 3, 7 (테스트·CI 정상화) | 없음 | 없음 (테스트·CI만) |
| B | 1, 4 (worker 안전장치) | A | worker 이미지 변경. 플래그는 그대로 off |
| C | 2, 5, 10 (설정·방어) | A | web 변경, IaC 변경 → staging에서 Healthcheck·`PREPPY_ENVIRONMENT` 확인 필수 |
| D | 6 (snapshot) | A | 없음 |
| E | 8 (트랜잭션 상한) | B | worker 변경 |
| F | 9-1, 15 | A | 없음 |
| G~ | 11, 12, 13, 14, 9-2 | 0017 결정(스키마 변경이 필요한 단계) | 단계별 |

### 16.2 Owner 결정이 필요한 사항

1. 0017을 운영에 적용할지, 영구 제외할지 (스키마 변경이 필요한 모든 단계의 선행 조건)
2. staging ledger의 c157(`0018_article_tags`)을 어떻게 정리할지
3. 오래된 알림 기준 시간(기본 72시간)
4. 메일 재대조를 web에서 계속 할지, worker로 옮길지
5. 새 CI job을 main 필수 체크로 지정할지 (GitHub 설정 변경)
6. `/api/auth/session`, `/api/auth/logout` 라우트를 유지할지

### 16.3 이 기획에서 하지 않는 것

- 운영 DB 접속, 마이그레이션 실행, Railway 설정 변경, 운영 플래그 변경
- 공개 헤더에 로그인 UI 추가
- 이미 억제된 과거 메일을 재발송하는 작업 (필요하면 별도 기획)

## 17. UX Writing 검토 결과

- **이 문서의 결과: `UX Writing: N/A`** — 기획 문서이고, 사용자 노출 문구를 아직 바꾸지 않아요.
- 사용자에게 영향이 있는 항목은 구현 PR에서 문구를 검수해요.
  - 1번: 지난 알림 차단
  - 5번: 탈퇴 버튼 노출 조건
  - 11번: 공개 데이터 의미 보존
  - 15번: 로그인 동선
- 관리자 문구가 추가되는 항목(4, 10, 14)은 정책 7장 기준으로 검수해요.
- 각 PR은 `UX Writing: PASS`, `FIX_REQUIRED`, `N/A — 사유` 중 하나를 실제 검증과 함께 기록해요. 수행하지 않은 화면 검사를 PASS로 기록하지 않아요.
- 근거 정책: [docs/PREPPY_UX_WRITING_POLICY.md](../PREPPY_UX_WRITING_POLICY.md) (전체 확인)

## 18. 진행 기록 (2026-10-21)

Owner 결정(2026-10-21)을 반영했어요.
- 0017은 운영에 적용해요.
- staging c157은 staging 기록으로만 인정해요.
- 오래된 알림 기준은 72시간으로 유지해요.
- 새 CI job을 main 필수 체크로 지정해요.
- `/api/auth/session`, `/api/auth/logout`은 유지해요.

메일 재대조 위치는 담당자 판단으로 정했어요. 지금은 web에 두고, 메일 발송이 꺼져 있거나 Resend 설정이 없으면 외부 호출 전에 막아요. worker로 옮기려면 새 outbox 이벤트 종류(스키마 변경)가 필요해서 다음 스키마 변경 묶음으로 넘겨요.

| 묶음 | 항목 | 결과 | 커밋 |
|---|---|---|---|
| A | 3, 7 | 완료. 하드코딩 제거, 공용 DB를 지우던 테스트 격리, 스냅샷 int 범위 초과 수정, 시드 시간 의존 제거, CI `db-integration` | `77aba68`, `1981a70` |
| B | 1, 4 | 완료 | `a9c8f62` |
| C | 2, 5, 10 | 완료 | `f62a09a` |
| D | 6 | 완료 | `d3ccad6` |
| E | 8 | 완료(안 A) | `eca5b36` |
| F | 9-1, 15 | 완료. AuthControl은 Owner의 라우트 유지 결정에 맞춰 "보류" 주석만 달았어요 | `b1f11e2` |
| Owner 결정 | 0017 적용 명령, c157 인정 | 완료(코드). 운영 실행은 운영자 작업이에요 | `79da6b3` |
| G | 14-1 | 완료(`admin:provision`) | `79e47ac` |
| G | 13 | 1단계 완료. outbox·worker 경로부터 적용했고, lint 규칙은 기존 595곳 때문에 보류해요 | `5043fdc` |
| G | 12 | 스키마 분리 완료. 나머지 대형 파일은 기능 작업과 함께 나눠요 | `d2dd90d` |
| G | 11-1 | 완료(`data:audit-legacy-model`). 11-2~5는 운영 집계 결과를 보고 결정해요 | `d1462d3` |
| 보류 | 9-2, 14-2 | 스키마 변경(0019)이 필요해요. 운영 0017 적용 전에 0019를 추가하면 관리자 스냅샷 MISMATCH와 실시간 모집 반영 차단이 생기고, 지금은 이득이 없어요(replica 1, 관리자 소수). 0017 운영 적용 이후 필요할 때 진행해요 | — |

### 운영자 작업 (이 세션에서 할 수 없어요)

1. Railway staging·production에 shared variable `PREPPY_ENVIRONMENT`(`staging`/`production`)를 설정한 뒤 IaC를 적용하고, 헬스체크 `/api/release-integrity`가 통과하는지 확인해요.
2. 운영 백업과 복원 검증 영수증을 만든 뒤 `npm run db:migrate:account-deletion -- --target production …` dry-run 결과를 검토하고 `--apply`로 적용해요([런북](../SCOPED_ACCOUNT_DELETION_MIGRATION.md)).
3. GitHub main 보호 규칙에서 `db-integration`을 필수 체크로 지정해요.
4. `npm run data:audit-legacy-model`을 staging·production 읽기 전용 계정으로 실행하고, 결과로 11-2 이후 범위를 정해요.
5. 운영 cron(`*/5 * * * *`, 재시작 `NEVER`)이 worker exit 3을 실패로 표시하는지 staging에서 확인해요.
