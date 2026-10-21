# PREPPY

PREPPY는 영어유치원·사립초등학교·외국인학교의 공식 입학 안내를 모아 보호자가 모집 일정과 조건을 확인하고, 관심기관의 변경 소식을 받아볼 수 있게 하는 서비스예요.

이 문서는 저장소 `main` 기준의 개발·운영 진입점이에요. 사용자 노출 문구는 반드시 [PREPPY UX Writing 정책](docs/PREPPY_UX_WRITING_POLICY.md)을 따르고, 작업 규칙은 [AGENTS.md](AGENTS.md)와 [CONTRIBUTING.md](CONTRIBUTING.md)를 함께 확인해요.

## 기술 구성

| 영역          | 구성                                                           |
| ------------- | -------------------------------------------------------------- |
| 런타임        | Node.js 22 이상                                                |
| 웹            | Next.js 16.3 App Router, React 19 (`proxy.ts`가 미들웨어 역할) |
| DB            | PostgreSQL, Drizzle ORM, `postgres` 드라이버                   |
| 검증          | Zod                                                            |
| 관리자 에디터 | TipTap, sanitize-html                                          |
| 수집          | cheerio, robots-parser, pdfjs-dist                             |
| 테스트        | Vitest (`tests/unit`, `tests/integration`)                     |
| 배포          | Railway (web · worker · PostgreSQL), GHCR 릴리스 이미지        |

> 이 저장소의 Next.js는 학습 데이터와 API가 다를 수 있어요. 코드를 쓰기 전에 `node_modules/next/dist/docs/`의 해당 가이드를 확인해요.

## 디렉터리 구조

```text
app/
  (public)/          사용자 화면: 홈, 기관, 모집 일정, 기사, 큐레이션, 마이 PREPPY, 가입
  admin/             관리자 화면 (OIDC 로그인, 기사·기관·출처·모니터링·운영)
  api/               사용자·관리자 API, webhook(Resend·카카오), health 계열 엔드포인트
  auth/kakao/        카카오 OAuth 시작·콜백
src/
  modules/           업무 로직 (public, auth, follow, monitoring, notification, outbox, worker, editorial ...)
  application/       명령 컨텍스트, 오류, OutboxWriter, AuditWriter
  infrastructure/db/ DB 런타임과 트랜잭션, backfill
  analytics/         GA4 연동과 개인정보 보호 가드
  config/            환경변수 파싱, 배포 환경 판별
  db/schema/         Drizzle 스키마 (단일 파일)
  db/migrations/     SQL 마이그레이션과 journal
scripts/             worker, DB, 데이터 import/수집, 배포 사전 점검 CLI
data/                시드·스냅샷·정정·검수 데이터 (운영 DB 전체가 아니에요)
public/commute/      /schoolmap 정적 지도 앱
docs/                기획·설계·운영 문서
tests/               단위·통합·브라우저 테스트
```

## 로컬 실행

필요 도구: Node.js 22 이상, Docker Compose

```sh
npm ci
docker compose up -d --wait postgres
cp .env.example .env.local   # 값은 로컬용으로 교체해요
```

Docker Compose는 `preppy` 데이터베이스와 테스트용 `preppy_test` 데이터베이스를 만들어요. 테스트 DB는 볼륨을 처음 만들 때만 생성되므로, 기존 볼륨이라면 직접 만들어요.

```sh
docker compose exec -T postgres psql -U preppy -d postgres -c "CREATE DATABASE preppy_test;"
```

> 이전 이름(`admissionradar`)으로 만든 로컬 볼륨은 새 설정과 사용자·DB 이름이 달라요. 로컬 데이터가 필요 없다면 `docker compose down -v`로 지우고 다시 만들어요.

로컬 DB에 마이그레이션을 적용하고 개발 서버를 실행해요.

```sh
export DATABASE_URL=postgres://preppy:preppy@localhost:55433/preppy
npm run db:migrate
npm run dev
```

## 주요 명령

| 명령                                 | 설명                                                                                            |
| ------------------------------------ | ----------------------------------------------------------------------------------------------- |
| `npm run dev`                        | 개발 서버                                                                                       |
| `npm run prebuild`                   | 헤더 로그인 미노출·브랜드 아이콘 검사 (빌드 전 자동 실행)                                       |
| `npm run build` / `npm run start`    | 프로덕션 빌드와 실행                                                                            |
| `npm run lint` / `npm run typecheck` | 린트와 타입 검사                                                                                |
| `npm run test:unit`                  | 단위 테스트                                                                                     |
| `npm run test:db`                    | DB 통합 테스트 (`TEST_DATABASE_URL` 필요, DB 이름은 `_test` 또는 `_verify<숫자>`로 끝나야 해요) |
| `npm run worker:once`                | outbox worker 1회 실행 후 종료                                                                  |
| `npm run db:migrate`                 | 전체 마이그레이션 실행 (아래 주의사항 확인)                                                     |
| `npm run deploy:preflight`           | 배포 직전 기준선 검사                                                                           |

DB 통합 테스트는 파일 단위로 순차 실행해요. 일부 테스트가 `127.0.0.1` 접속만 허용하므로 `localhost` 대신 IP를 써요.

```sh
export TEST_DATABASE_URL=postgres://preppy:preppy@127.0.0.1:55433/preppy_test
npm run test:db
```

데이터 import·수집·운영 점검 명령은 `package.json`의 `data:*`, `collector:*`, `db:*` 스크립트를 확인해요. 대부분 dry-run이 기본이고 적용에는 명시적인 플래그가 필요해요.

## 환경변수

전체 목록은 [.env.example](.env.example)에 있어요.

- 필수: `DATABASE_URL`, `APP_BASE_URL`, 카카오 OAuth(`KAKAO_*`), 사용자 세션 비밀값(`USER_SESSION_SECRET`, `OAUTH_STATE_SECRET`, `FOLLOW_INTENT_SECRET`), 관리자 OIDC(`ADMIN_AUTH_*`, `ADMIN_SESSION_SECRET`, `ADMIN_OIDC_FLOW_SECRET`)
- 프로덕션에서는 `DATABASE_MAX_CONNECTIONS`도 필요해요.
- 비밀값은 서로 달라야 하고, 대부분 32자 이상이어야 해요.

부수 효과 플래그는 기본값이 모두 `false`예요.

| 플래그                       | 켜면 일어나는 일                                                                                                            |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `WORKER_ENABLED`             | worker가 outbox 이벤트를 처리해요. `false`면 DB에 접속하지 않고 종료해요                                                    |
| `EMAIL_SEND_ENABLED`         | Resend로 알림 메일을 보내요. **worker가 켜진 상태에서 `false`면 대기 중인 메일은 보내지 않고 영구히 `SUPPRESSED` 처리돼요** |
| `CACHE_REVALIDATION_ENABLED` | worker가 캐시 갱신 이벤트를 처리해요. `false`면 해당 이벤트는 `PENDING`으로 남아요                                          |
| `ANALYTICS_ENABLED`          | 프로덕션에서 GA4 이벤트를 보내요                                                                                            |

탈퇴 기능은 `ACCOUNT_DELETION_ENABLED=true`와 `ACCOUNT_DELETION_READINESS=verified`가 모두 설정됐을 때만 동작해요. 이 기능은 마이그레이션 `0017`이 적용된 DB가 필요해요.

## 데이터베이스와 마이그레이션

- 스키마는 [src/db/schema/index.ts](src/db/schema/index.ts) 하나에 있어요.
- 테이블 구성
  - 레거시 계열: `schools`, `admission_*`, `sources`, `source_*`
  - PREPPY 계열: `institutions`, `opportunities`, `users`, `follows`, `notifications`, `articles` 등
- 버전 데이터는 `is_current` 한 개, 후속 버전 한 개만 허용하는 unique 인덱스와 lineage 트리거로 이력을 보호해요.
- `npm run db:migrate`는 SQL 해시, journal 시각, 적용 순서를 검증해요. 중간에 빠진 마이그레이션이 있으면 DDL 실행 전에 `MIGRATION_GAP_REQUIRES_REVIEW`로 멈춰요.
- 이미 기록된 마이그레이션 SQL은 해시로 검증되므로 수정하지 않아요.

> **운영 DB에 전체 마이그레이션을 실행하지 않아요.** 운영 환경은 `0018`만 별도로 적용했고 `0017`은 보류 상태예요. 마이그레이션 작업 전에는 [docs/SCOPED_ENGLISH_SESSION_MIGRATION.md](docs/SCOPED_ENGLISH_SESSION_MIGRATION.md)를 먼저 읽고, 운영 변경은 별도 승인을 받아요.

`0018`에는 drizzle snapshot(`meta/0018_snapshot.json`)이 없어요. `npm run db:generate` 결과는 반드시 검토하고 그대로 적용하지 않아요.

## 비동기 처리 (worker)

```text
관리자 확인·기사 발행 → outbox_events (같은 트랜잭션)
worker:once → OPPORTUNITY_CHANGE_PUBLISHED → notifications · notification_deliveries
            → DELIVERY_EMAIL_SEND → Resend 발송
            → CACHE_REVALIDATION_REQUESTED → POST /api/internal/cache/revalidate
Resend webhook → POST /api/webhooks/resend → 발송 상태 갱신
```

worker는 한 번 처리하고 종료해요. 주기 실행은 Railway cron 설정에 의존하고, cron 설정은 IaC 파일에 포함돼 있지 않아요.

## 배포

[AGENTS.md](AGENTS.md)의 운영 배포 기준을 따라요.

1. 최신 `main`을 통합하고 단위 테스트와 타입 검사를 통과시켜요.
2. 업로드 직전에 `npm run deploy:preflight`를 실행해요. 최신 원격 main 미포함, 미커밋 파일, 헤더 로그인 재노출이 있으면 배포를 중단해요.
3. 같은 커밋을 staging에서 검증한 뒤 production에 배포해요.
4. 배포 커밋과 환경별 배포 ID를 기록해요.

- staging/production web의 Railway Healthcheck Path는 `/api/release-integrity`로 유지해요. 이 경로는 배포 환경 일치, 브랜드 아이콘, 헤더 로그인 미노출을 검사해요. `/api/health`는 항상 200을 반환하는 liveness 확인용이에요.
- Owner가 지시하기 전까지 공개 헤더에 카카오 로그인 UI를 추가하지 않아요.
- 빌드·시작 과정에서는 마이그레이션이 실행되지 않아요.

## 문서

- 제품·설계: `docs/00_*` ~ `docs/12_*` (초기 문서의 "PREPPY Legacy"는 PREPPY 이전의 입학 일정 시스템을 뜻해요)
- 운영·배포: `docs/15*`, `docs/16A_*`, `docs/SCOPED_ENGLISH_SESSION_MIGRATION.md`
- UX Writing: [docs/PREPPY_UX_WRITING_POLICY.md](docs/PREPPY_UX_WRITING_POLICY.md)
