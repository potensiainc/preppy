# PREPPY 개발·Staging / Production 동일성 및 양방향 콘텐츠 승격 설계

작성일: 2026-09-16 · 상태: Owner 승인 · 대상: PREPPY Railway 배포, Admin, PostgreSQL 정적 데이터 승격

## 1. 승인된 목표

PREPPY는 하나의 코드베이스로 다음 네 접점을 운영한다.

- 개발·Staging 공개 화면
- 개발·Staging Admin
- Production 공개 화면
- Production Admin

개발·Staging은 Production과 같은 코드, 서비스 구조, DB 스키마, 정적 콘텐츠 모델을 사용하는 영구 검수 환경이다. 릴리스가 끝난 시점에는 두 환경의 **코드 아티팩트, DB 마이그레이션, 기관·입학정보·아티클·출처·근거 데이터가 동일**해야 한다.

두 환경의 Admin은 모두 기관·입학정보·아티클·출처·근거를 작성하고 수정할 수 있다. 어느 환경에서 정적 데이터가 변경되든 승인된 릴리스로 반대 환경에 반영하여 동일성을 회복한다. 자동 last-write-wins 동기화나 전체 DB 복제는 사용하지 않는다.

사용자·팔로우·알림·감사·Worker·관리자·수집 실행 기록은 각 환경에서 독립적으로 발생하는 운영 데이터이며 동일성 대상에서 제외한다. Production Admin은 이 Production 운영 데이터를 조회하고 권한이 허용된 운영 명령을 실행할 수 있어야 한다.

## 2. 현재 코드베이스와 운영 상태

현재 Next.js 앱은 공개 화면과 `/admin`을 함께 제공하는 모듈형 모놀리스다. `app/_lib/public-page.server.ts`와 `app/admin/_lib/admin-page.server.ts`는 모두 `getRuntimeDatabase()`의 동일한 환경별 `DATABASE_URL`을 사용한다. 이 경계는 유지한다. 별도 Admin 서비스나 두 번째 백엔드는 만들지 않는다.

현재 운영 구성에는 다음 차이가 있다.

- Railway가 `preppy-ui-preview`와 `preppy-production` 두 프로젝트로 분리돼 있다.
- Preview 웹과 Production 웹의 최근 배포가 동일한 Git 기반 자동 승격 흐름으로 연결돼 있지 않다.
- GitHub Actions 워크플로가 없다.
- Production 웹에는 배포 전 마이그레이션 명령이 설정돼 있지 않다.
- Production 웹에는 Admin OIDC 및 Admin 세션 필수 환경변수가 없다.
- `.railway/railway.ts`는 Production의 web, worker, Postgres만 기술하며 실제 Preview 구성과 함께 관리되지 않는다.
- `scripts/seed-preview-demo.ts`는 `preppy-ui-preview / preview / preppy-web-preview`에만 실행되도록 하드코딩돼 있고 합성 기관·일정·아티클을 넣는다.
- 기관 Admin은 조회, 출처 연결, 검수 완료 정보 생성 중심이며 기관 루트의 일반 작성·수정 기능은 부족하다.
- 아티클 Admin은 초안 생성·수정·관계 설정·공개·공개 중단·보관 흐름을 이미 갖고 있다.
- 기관 seed 반입기는 체크섬, dry-run, advisory lock, 충돌 차단, 단일 트랜잭션, 감사 기록을 갖지만 특정 63개 데이터셋 계약에 고정돼 있어 범용 환경 승격기로 직접 사용할 수 없다.

## 3. 환경 토폴로지

기존 `preppy-production` Railway 프로젝트를 기준 프로젝트로 유지하고 `staging` 환경을 추가한다. 현재 Production 서비스를 다른 프로젝트로 이동하지 않는다.

```text
preppy-production
├─ staging
│  ├─ web
│  ├─ worker
│  └─ Postgres + 독립 volume
└─ production
   ├─ web
   ├─ worker
   └─ Postgres + 독립 volume
```

두 환경에는 같은 서비스 토폴로지와 배포 설정을 둔다. 다음 값만 환경별로 달라야 한다.

- 공개 도메인과 `APP_BASE_URL`
- `DATABASE_URL`과 연결 예산
- OAuth/OIDC callback과 비밀키
- 세션·서명·provider 비밀키
- 실제 발송·Worker·분석·캐시 부작용 활성화 여부
- Railway가 제공하는 환경·서비스 식별값

두 환경 모두 최적화된 Next.js 실행을 위해 `NODE_ENV=production`을 사용한다. 환경 판별에는 `NODE_ENV`를 사용하지 않고 `PREPPY_ENVIRONMENT=STAGING|PRODUCTION`을 추가한다. 서버가 `RAILWAY_PROJECT_NAME`, `RAILWAY_ENVIRONMENT_NAME`, `RAILWAY_SERVICE_NAME`과 함께 이 값을 검증하여 잘못 연결된 DB나 승격 방향을 거부한다.

Staging에도 worker 서비스를 두어 구조를 동일하게 유지하되 `WORKER_ENABLED=false`, `EMAIL_SEND_ENABLED=false`, `ANALYTICS_ENABLED=false`, `CACHE_REVALIDATION_ENABLED=false`를 기본값으로 둔다. Production의 활성화 값은 별도 승인과 운영 설정을 따른다.

새 Staging 공개 화면과 Admin의 검증이 끝나면 기존 `preppy-ui-preview` 프로젝트를 중단한다. 더미 seed는 자동 배포 과정에서 제거하고 명시적인 UI fixture 테스트에만 사용한다.

## 4. 코드와 실행 아티팩트 승격

Staging과 Production을 각각 다시 빌드하지 않는다. CI가 릴리스 후보 커밋을 한 번 빌드하고 생성된 Docker 이미지 digest를 두 환경에 순서대로 배포한다.

```text
기능 브랜치
→ develop 통합
→ CI 검사
→ Docker 이미지 1회 빌드 및 digest 고정
→ Staging 배포
→ 검수·승인
→ 동일 digest Production 배포
→ main이 승인 커밋을 가리키도록 통합
```

릴리스는 다음 값을 기록한다.

- Git commit SHA
- Docker image digest
- repository migration manifest hash
- Staging schema ledger hash
- Production schema ledger hash
- 정적 데이터 기준 해시와 목표 해시

Production은 Staging에서 검수하지 않은 이미지 digest를 배포할 수 없다. Railway 서비스는 GitHub Actions 결과를 기다리고, 실패·취소·미완료 상태에서는 배포하지 않는다.

DB 변경은 expand-and-contract 규칙을 따른다. 릴리스에서 실행하는 마이그레이션은 기존 앱과 새 앱이 동시에 실행되는 동안 호환돼야 하며, 파괴적 삭제나 컬럼 의미 교체는 후속 릴리스로 분리한다. Staging에서 같은 migration ledger를 검증한 뒤 Production pre-deploy에서 `npm run db:migrate`를 실행한다. 실패하면 새 웹 배포와 정적 데이터 적용을 시작하지 않는다.

## 5. 동일성의 정확한 의미

두 PostgreSQL 인스턴스의 파일 또는 모든 행을 byte-for-byte 비교하지 않는다. 관리자 FK, 환경 URL, 운영 시각처럼 환경에 따라 달라야 하는 값을 제외하고 **정적 데이터의 의미와 관계를 canonical projection으로 비교**한다.

릴리스 완료 조건은 다음과 같다.

- 동일 Git SHA
- 동일 Docker image digest
- 동일 migration ledger와 migration 파일 해시
- 동일 정적 엔티티 ID, 상태, 비즈니스 값, 버전 계보
- 동일 출처 URL과 바인딩
- 동일 근거 snapshot content hash
- 동일 아티클 본문과 관계, redirect 의미
- 동일 전체 canonical SHA-256
- 동일 엔티티별 canonical SHA-256

릴리스 사이에는 Staging이 다음 릴리스 작업 때문에 Production보다 앞설 수 있다. 릴리스 완료 시에는 정적 데이터 parity가 복구돼야 한다.

```text
릴리스 직후: Staging 정적 데이터 = Production 정적 데이터
편집 중:     Staging 정적 데이터와 Production 정적 데이터가 다를 수 있음
승격 완료:   Staging 정적 데이터 = Production 정적 데이터
```

Production에서 직접 정적 데이터를 수정하면 Production이 먼저 앞선다. 해당 변경을 Staging으로 역반영하고 충돌을 해결한 뒤 동일성을 회복한다.

## 6. 정적 데이터 경계

### 6.1 동일성 및 승격 대상

현재 스키마에서 다음 데이터와 그 의존 관계를 정적 데이터로 취급한다.

- 기관·학교: `schools`, `school_aliases`, `institutions`, `institution_registry_identities`, `institution_school_links`
- 입학정보: `admission_cycles`, `admission_events`, `admission_event_versions`, `admission_facts`, `admission_fact_versions`, `expected_windows`, `opportunities`, `opportunity_admission_event_links`, `opportunity_versions`
- 출처·설정: `sources`, `source_bindings`, `source_monitor_configs`, `institution_source_bindings`, `opportunity_source_bindings`
- 근거: `source_snapshots`, `event_version_evidence`, `fact_version_evidence`, `opportunity_version_evidence`, `institution_fact_version_evidence`
- 기관 정보: `institution_facts`, `institution_fact_versions`
- 콘텐츠: `articles`, `article_institutions`, `article_opportunities`, `url_redirects`
- 기존 공개 조회가 아직 사용하는 동안의 `guides`, `updates`, `update_changes`

승격기는 단일 행 목록이 아니라 선택된 정적 엔티티의 외래키 의존 관계를 닫힌 그래프로 계산한다. 필요한 기관, 출처, snapshot, 근거, 관련 입학정보가 누락되면 릴리스를 만들거나 적용할 수 없다.

현재·공개 레코드만이 아니라 릴리스에 승인된 정적 초안과 비공개 상태도 포함할 수 있다. parity 검사는 릴리스가 선언한 정적 범위와 전체 canonical 정적 projection을 모두 확인한다.

### 6.2 환경별 운영 데이터

다음 데이터는 승격하거나 동일성 비교에 포함하지 않는다.

- 관리자: `admin_users`, Admin 인증·세션·로그인 replay 상태
- 사용자: `users`, `auth_identities`, `user_emails`, `user_profiles`, 관심 지역·카테고리, 동의 기록, 알림 설정
- 관심 기능: `follows`, `follow_episodes`
- 발송: `notifications`, `notification_deliveries`, `notification_delivery_attempts`, `email_provider_events`
- 운영: `audit_logs`, `outbox_events`, Worker claim·lease·실행 상태
- 수집 실행: `source_observations`, 수집 실행·시도·오류 기록
- 변경 대기열: `detected_changes`, `meaningful_changes`, `opportunity_changes`
- 구독·레거시 발송: `subscribers`, `subscriptions`, `subscription_action_tokens`, `alerts`, `alert_deliveries`
- 환경별 릴리스 수신·적용·재시도 기록

Production Admin은 이 Production 운영 데이터를 조회하고 권한에 따라 재처리·취소·중지 명령을 실행할 수 있다. Staging Admin은 Production 운영 DB에 직접 연결하지 않으며 Staging에서 발생한 운영 데이터만 본다.

### 6.3 근거와 수집 실행의 분리

`source_observations`는 환경별 수집 실행 기록이므로 복사하지 않는다. 검수 완료 정보의 근거는 `sources`와 content-addressed `source_snapshots`를 통해 승격한다.

- snapshot UUID, source UUID, content hash, text hash, normalized text, mime type, 검수에 필요한 원문을 보존한다.
- `raw_storage_key`는 환경 전용 경로가 아니라 content hash 기반 공유 또는 복제 가능한 키를 사용한다.
- evidence가 observation에만 의존하고 snapshot이 없다면 Production 승격을 차단한다.
- target evidence의 `source_observation_id`는 복사하지 않는다. 원래 관찰 시점과 수집 맥락은 snapshot metadata와 릴리스 provenance에 보존한다.
- 수집 시점과 운영자의 내용 확인 시점을 하나로 합치지 않는다.

## 7. 환경별 Admin 기능

공개 화면과 Admin은 각 환경의 동일한 `DATABASE_URL`을 사용한다.

| 기능 | Staging Admin | Production Admin |
| --- | --- | --- |
| 정적 데이터 조회 | Staging DB | Production DB |
| 기관·입학정보·아티클 작성·수정 | 가능 | 가능 |
| 출처·근거 검수 | 가능 | 가능 |
| 공개·비공개 전환 | Staging 공개 상태 | 실제 Production 공개 상태 |
| 사용자·팔로우·알림·감사 조회 | Staging 운영 데이터 | Production 운영 데이터 |
| Worker·수집 실행·Outbox 조회 | Staging 운영 데이터 | Production 운영 데이터 |
| 릴리스 생성·승인·적용 | Production 방향 | Staging 역반영 방향 |
| 충돌 해결 | 가능 | 가능 |
| 긴급 공개 중단 | 테스트 영향 | 실제 서비스 영향 |

두 Admin은 화면 상단에 각각 `개발·Staging 환경`, `Production 환경`을 항상 표시한다. Production에서 실제 공개 상태를 바꾸는 버튼은 결과를 구체적으로 설명한다. 환경만 다르게 보이도록 색에 의존하지 않고 텍스트와 접근성 이름을 함께 사용한다.

Production Admin의 기존 사용자, 알림, 운영 상태, 모니터링, 기관, 아티클 화면은 Production DB를 조회하도록 유지한다. Production Admin OIDC 필수 환경변수와 활성 관리자 계정을 별도로 구성한다.

## 8. 양방향 정적 데이터 승격

### 8.1 릴리스 상태

내부 상태 코드는 다음 의미를 갖는다.

```text
DRAFT
→ IN_REVIEW
→ APPROVED
→ RECEIVED
→ PREFLIGHT_PASSED
→ APPLIED
→ PARITY_VERIFIED
```

실패·예외 상태는 다음과 같다.

```text
CONFLICT
BLOCKED
FAILED
SUPERSEDED
```

Admin 사용자 문구는 각각 `작성 중`, `검토 요청`, `검토 완료`, `반영 대기`, `사전 확인 완료`, `반영됨`, `동일성 확인 완료`, `수정 내용 충돌`, `반영할 수 없음`, `반영 실패`, `새 릴리스로 교체됨`을 사용한다.

### 8.2 Staging에서 Production으로

1. Staging Admin에서 정적 데이터를 작성·수정·검수한다.
2. 릴리스 생성 시 Production의 마지막 확인된 정적 기준 해시와 Staging 목표 해시를 고정한다.
3. 의존 그래프, schema version, 정적 엔티티별 canonical payload, 전체 checksum을 포함한 immutable bundle을 만든다.
4. Admin은 변경 전후, 공개 영향, 출처·근거, 누락·상충 상태를 확인하고 승인한다.
5. 서명된 bundle을 Production 수신함에 전달한다. 수신은 domain table을 수정하지 않는다.
6. Production Admin 또는 승인된 배포 작업이 dry-run을 실행한다.
7. Production 현재 해시가 bundle의 기준 해시와 일치할 때만 단일 트랜잭션으로 적용한다.
8. 공개 smoke test와 정적 parity 검사를 모두 통과하면 완료 처리한다.

### 8.3 Production에서 Staging으로

Production Admin에서 정적 데이터를 작성·수정하면 같은 command transaction이 Production 변경 버전과 역반영 릴리스 초안을 함께 만든다.

1. Production 변경은 실제 서비스에 즉시 영향을 줄 수 있으므로 저장·공개 동작을 분리한다.
2. 변경된 엔티티와 의존 그래프를 기준으로 Staging 역반영 bundle을 만든다.
3. Staging에 같은 엔티티의 미승격 변경이 없으면 적용하고 parity를 확인한다.
4. Staging이 같은 엔티티를 별도로 수정했다면 자동 덮어쓰지 않고 `수정 내용 충돌`로 전환한다.
5. 운영자가 변경 전후와 근거를 비교하고 유지할 상태를 선택한 새 릴리스를 만든다.

Production 직접 편집은 금지하지 않는다. 다만 릴리스와 역반영 기록을 우회하는 SQL 수정이나 범용 테이블 editor는 제공하지 않는다.

## 9. 릴리스 번들과 적용 계약

릴리스 bundle에는 다음을 포함한다.

- release UUID, source environment, target environment
- source Git SHA와 image digest
- required migration manifest hash
- base aggregate hash와 desired aggregate hash
- entity type, stable entity UUID, operation, dependency UUID
- base entity hash와 desired entity hash
- canonical payload
- snapshot content hashes와 포함·참조 방식
- 검토자 외부 인증 subject, 검토 시각, 검토 사유
- bundle 전체 SHA-256과 HMAC 서명

관리자 DB ID는 환경마다 다를 수 있으므로 직접 복사하지 않는다. bundle은 관리자 external auth subject를 포함하고 target 환경의 활성 `admin_users`로 매핑한다. 매핑되지 않으면 적용을 차단한다. `author_admin_id`, `verified_by_admin_id` 같은 FK는 target 관리자 ID로 기록하되 canonical parity는 동일한 external subject를 비교한다.

기관, 버전, 출처, snapshot, 아티클 등 도메인 UUID는 두 환경에서 동일하게 유지한다. identity bigint인 수집 실행 ID는 승격하지 않는다.

적용 규칙은 다음과 같다.

- target 현재 해시가 base hash와 같으면 적용한다.
- target 현재 해시가 desired hash와 같으면 이미 반영된 멱등 성공으로 처리한다.
- 둘 다 아니면 `수정 내용 충돌`로 처리하고 쓰지 않는다.
- bundle에 conflict, invalid dependency, demo identity, schema mismatch가 하나라도 있으면 전체 적용을 차단한다.
- apply는 advisory lock과 하나의 DB transaction 안에서 domain write, 릴리스 receipt, 적용 audit을 원자적으로 기록한다.
- 외부 네트워크 호출, Railway API, 이메일, 분석, 캐시 호출은 truth transaction 밖에서 수행한다.
- 삭제는 물리 삭제가 아니라 기존 도메인 상태의 숨김·보관 전이를 사용한다.

Preview 합성 데이터는 UUID allowlist, `preppy-demo-` slug, `.example` 출처, Preview fixture marker를 기준으로 승격을 차단한다.

## 10. 환경 의존 필드

정적 의미는 같지만 환경별 값이 필요한 필드는 canonical projection에서 명시적으로 다룬다.

- 아티클 canonical URL은 DB에 Staging origin을 복사하지 않는다. canonical path/slug를 저장하고 `APP_BASE_URL`에서 최종 URL을 생성하도록 전환한다.
- 환경 로컬 이미지 URL은 승격을 차단한다. MVP에서는 영구 공개 HTTPS URL 또는 content-addressed 공유 asset만 허용한다.
- 관리자 FK는 external subject 의미로 정규화한다.
- 적용 시각과 환경별 릴리스 receipt ID는 운영 데이터로 제외한다.
- 공개·검수 시각, 학년도, 날짜, 비용 기준, 유효기간은 비즈니스 정보이므로 그대로 보존한다.

## 11. 충돌과 동시 편집

마지막 저장이 이기는 방식은 사용하지 않는다. 모든 정적 command는 expected current version 또는 base fingerprint를 요구한다.

- 서로 다른 엔티티의 변경은 독립적으로 승격할 수 있다.
- 같은 기관 루트나 같은 아티클을 양쪽에서 수정하면 충돌이다.
- 같은 기관의 서로 다른 fact type은 의존 관계가 겹치지 않을 때 별도 항목으로 승격할 수 있다.
- 아티클이 관계를 맺은 기관·입학정보가 target에 없거나 목표 상태와 다르면 아티클 적용을 차단한다.
- 충돌 해결은 한쪽을 무조건 선택하는 버튼이 아니라 base, Staging, Production의 의미 있는 필드 차이를 보여주고 새 desired payload를 승인하는 방식으로 처리한다.
- 충돌 해결 결과도 새 release UUID와 checksum을 갖는다.

## 12. 보안과 권한

- Production Admin OIDC client, callback, session secret, flow secret을 별도로 구성한다.
- Staging과 Production의 session·OIDC·promotion 서명 비밀키는 서로 다르게 유지하고 sealed variable로 관리한다.
- promotion 수신 endpoint는 허용된 source environment, HTTPS origin, HMAC, timestamp, nonce, bundle hash를 모두 검증한다.
- nonce는 target의 운영 ledger에서 한 번만 소비한다.
- Production 운영 데이터 조회는 Admin 인증과 역할 권한을 요구한다.
- 최소 역할은 Owner, Editor, Operator, Viewer로 구분한다. 정적 편집, 릴리스 승인, Production 적용, 운영 재처리 권한을 별도로 부여한다.
- bundle과 로그에는 DB URL, 비밀키, 세션, 사용자 PII를 넣지 않는다.
- Production 적용 전 backup과 restore readiness를 확인한다.

## 13. 실패와 복구

- CI 실패: 이미지는 승격하지 않는다.
- Staging migration 실패: 릴리스 후보를 만들지 않는다.
- Production preflight 실패: 기존 Production 앱과 DB를 유지한다.
- 정적 data conflict: domain write 없이 conflict report만 남긴다.
- transaction 실패: bundle 적용 전체를 rollback한다.
- 웹 healthcheck 실패: 새 deployment를 활성화하지 않는다.
- 적용 후 parity 실패: 공개 완료로 표시하지 않고 운영자에게 불일치 엔티티와 다음 행동을 보여준다.
- 코드 rollback은 이전 image digest를 재배포한다.
- DB migration은 자동 downgrade하지 않는다. expand-and-contract 호환성을 유지한다.
- 정적 데이터 rollback은 이전 canonical snapshot을 목표로 하는 별도 승인 release로 수행한다. 전체 Production DB restore로 사용자·운영 데이터를 덮지 않는다.

## 14. Admin 정보 구조와 UX Writing

Admin 전역에는 다음 정보를 표시한다.

- `개발·Staging 환경` 또는 `Production 환경`
- 배포 Git SHA와 image digest 축약값
- DB migration 상태
- 정적 데이터 동일성 상태
- 마지막 송신·수신 릴리스

릴리스 화면의 주요 행동은 실제 동작과 일치해야 한다.

- `변경 내용 검토`
- `Production 반영 요청`
- `Staging으로 반영 요청`
- `사전 확인 실행`
- `Production에 반영`
- `Staging에 반영`
- `충돌 내용 비교`
- `새 릴리스로 저장`

`동기화` 하나로 작성, 승인, 수신, 적용을 뭉뚱그리지 않는다. Production 공개에 실제 영향을 주는 버튼은 대상 환경과 결과를 표시한다. `완료`는 apply와 parity 검증이 모두 끝난 경우에만 사용한다.

입학정보 승격에서 학년도, 실제 날짜, 금액과 단위, 의무·예외, 예정·변경 가능 조건, 공식 출처, 자료 수집 시점, 운영자 확인 시점을 보존한다. 미발표, 미발견, 접근 실패, 상충 상태를 승격 과정에서 하나의 빈 값으로 합치지 않는다.

## 15. 코드 구성

새 승격 기능은 기존 module boundary를 따라 다음 책임으로 나눈다.

```text
src/modules/content-release/
├─ scope-registry.ts          정적/운영 경계와 의존 규칙
├─ canonical-contract.ts      canonical payload와 schema version
├─ canonicalize.ts            안정적 정렬·환경값 정규화
├─ fingerprint.ts             엔티티·aggregate SHA-256
├─ graph-reader.server.ts     정적 의존 그래프 조회
├─ planner.ts                 create/update/state/conflict 순수 계획
├─ bundle.server.ts           immutable bundle 생성·검증
├─ receiver.server.ts         서명·nonce·source 검증과 수신함 저장
├─ applier.server.ts          advisory lock·transaction 적용
├─ parity.server.ts           환경별 canonical report
└─ contracts.ts               release/report DTO
```

Admin과 API는 다음 경계를 사용한다.

```text
app/admin/(protected)/releases/
app/api/admin/releases/
app/api/internal/content-releases/receive/
app/api/internal/content-releases/status/
```

릴리스 상태·항목·receipt·nonce·환경별 적용 결과를 저장하는 migration을 추가한다. 이 테이블은 운영 데이터이므로 Staging과 Production parity 대상이 아니다.

기존 기관 importer의 pure planner, checksum, advisory lock, dry-run, transactional audit 패턴은 재사용하되 특정 dataset count와 allowlist 계약은 공유하지 않는다. 기존 아티클 command와 기관 fact verification command는 직접 테이블 mutation 대신 release change capture hook을 호출하도록 확장한다.

## 16. 테스트와 완료 기준

### 단위 테스트

- canonical JSON key/array ordering과 timestamp·decimal 정규화
- 정적/운영 scope registry
- 환경 의존 필드 제외·변환
- entity/aggregate hash 안정성
- dependency closure와 cycle 처리
- base/desired/current conflict matrix
- demo fixture 차단
- 관리자 external subject 매핑
- HMAC, timestamp, nonce, replay 차단

### 통합 테스트

- 빈 target, 같은 target, 오래된 target, 충돌 target dry-run
- 기관·출처·snapshot·fact·opportunity 전체 그래프 apply
- 아티클·관계·redirect apply
- 동일 bundle 재적용 멱등성
- 중간 오류 전체 rollback
- 운영 테이블 행 개수·내용 무변경
- Production 수정 후 Staging 역반영
- 양쪽 동일 엔티티 수정 conflict
- migration ledger mismatch 차단
- parity report entity pinpoint

### 브라우저·배포 검증

- Staging 공개 화면과 Admin
- Production 공개 화면과 Admin
- 두 환경의 명확한 환경 표시와 접근성 이름
- Production 운영 데이터 조회
- 양쪽 기관·입학정보·아티클 작성·수정
- 릴리스 diff, 승인, dry-run, apply, parity 상태
- 데스크톱과 모바일 Admin 핵심 흐름
- 동일 Git SHA, image digest, migration hash, static aggregate hash

릴리스 성공은 테스트·build·healthcheck만으로 선언하지 않는다. Production apply와 정적 parity 검증까지 끝나야 한다.

## 17. 단계별 전환

1. 현재 기능 브랜치와 worktree 변경을 검토하여 `develop` 기준으로 통합한다.
2. GitHub Actions와 단일 Docker image build를 도입한다.
3. `preppy-production` 프로젝트에 Staging 환경과 동일 서비스 토폴로지를 만든다.
4. Production Admin OIDC 변수와 활성 관리자 계정을 구성한다.
5. `PREPPY_ENVIRONMENT` 검증, 환경 표시, 역할 권한을 구현한다.
6. 정적 scope, canonical exporter, fingerprint, parity report를 구현한다.
7. release ledger, bundle, receiver, planner, applier를 구현한다.
8. 양쪽 Admin의 기관 루트 편집과 release UI를 구현한다.
9. Production 정적 데이터를 Staging에 1회 기준선으로 반영한다. 운영 데이터는 복사하지 않는다.
10. 기관 1곳, 입학정보 1건, 아티클 1건으로 양방향 리허설을 수행한다.
11. 전체 정적 dataset parity와 네 접점 smoke test를 완료한다.
12. 승인 후 기존 `preppy-ui-preview` 프로젝트와 자동 더미 seed를 중단한다.

각 단계는 별도 검증과 Owner 승인 없이 Production DB 쓰기, 배포, 서비스 중단으로 넘어가지 않는다.

## 18. 제외 범위

- PostgreSQL 물리 복제 또는 양방향 logical replication
- 운영 데이터의 Staging 복사
- last-write-wins 자동 병합
- 범용 DB table editor
- Production DB 전체를 Staging DB로 덮어쓰기
- Staging DB 전체를 Production DB로 복원하기
- 사용자·알림·감사·Worker 데이터의 parity
- 마이그레이션 자동 downgrade
- 미검수 정보의 자동 공개

## 19. 승인된 의사결정 요약

- 개발 환경은 영구 Staging으로 운영한다.
- 공개 화면과 Admin은 같은 앱·같은 환경 DB를 사용한다.
- Staging과 Production은 같은 서비스 구조와 같은 릴리스 이미지를 사용한다.
- 릴리스 완료 시 정적 데이터 canonical hash가 같아야 한다.
- 운영 데이터는 환경별로 유지하며 Production Admin에서 Production 운영 데이터를 조회한다.
- 양쪽 Admin 모두 정적 데이터를 작성·수정할 수 있다.
- 정적 변경은 승인된 양방향 release로 반대 환경에 반영한다.
- 충돌은 자동 덮어쓰지 않고 새 승인 release로 해결한다.
- 전체 DB 복제 대신 정적 의존 그래프를 승격한다.

## 20. UX Writing 검토

**UX Writing: PASS — 개발·Staging과 Production의 환경, 작성·검토·승격·적용·동일성·충돌 상태를 분리했다.**

- 대상: 두 환경의 Admin 전역, 릴리스 목록·상세·diff·오류 상태, Production 실제 공개 동작
- 신규 문구: `개발·Staging 환경`, `Production 환경`, `작성 중`, `검토 요청`, `검토 완료`, `반영 대기`, `사전 확인 완료`, `반영됨`, `동일성 확인 완료`, `수정 내용 충돌`, `반영할 수 없음`, `반영 실패`
- 정보 보존: 학년도·날짜·시간·금액·단위·의무·예외·변경 가능성·출처·수집 시점·검수 시점을 canonical payload와 parity 검사에 포함한다.
- 오류·빈 상태: 충돌, schema mismatch, 근거 누락, target 변경, 인증 실패, parity 실패를 서로 다른 상태로 안내한다.
- 다음 행동: 환경과 실제 결과가 다른 `반영` 버튼을 구분하고, Production 공개 영향이 있는 행동에 대상 환경을 명시한다.
- 미검증 범위: 이 문서는 설계 검토만 수행했다. 실제 Admin 화면, 모바일 표시, 키보드 접근성, API 오류 렌더링, 배포 흐름은 구현 후 검증한다.

