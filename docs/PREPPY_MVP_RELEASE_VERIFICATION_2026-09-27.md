# PREPPY MVP 출시 전 6개 항목 검증 — 2026-09-27

상태: **출시 보류**. 사용자가 요청한 항목 1–6을 독립적인 STAGING/PRODUCTION/PREVIEW 환경과 격리 테스트 DB에서 확인했다. 운영 데이터는 읽기 전용으로만 조회했다.

## 환경과 관리자 회원 목록

| 환경 | 웹 | 실제 앱 DB | 회원 | 카카오 연동 회원 | 관리자 상태 |
|---|---|---|---:|---:|---|
| STAGING | preppy-web-staging-staging.up.railway.app | preppy_staging | 2 | 2 | Owner 관리자 1명 활성, `/admin/users` → `/admin/login`; Google callback 등록 대기 |
| PRODUCTION | preppy-web-production.up.railway.app | railway | 0 | 0 | `/admin/users` → `/admin/login`, 카카오 로그인 503 |
| PREVIEW | preppy-web-preview-preview.up.railway.app | 별도 프로젝트의 railway | 0 | 0 | `/admin/users` → `/admin/login` |

관리자 목록은 같은 앱의 `getRuntimeDatabase()`와 `users`를 읽는다. PREVIEW 주소는 별도 Railway 프로젝트와 별도 DB다. STAGING 가입 회원을 PREVIEW DB로 자동 복제하지 않는 설계다. 운영도 별도 회원 데이터이므로 STAGING 가입자는 운영에 나타나지 않는다. 실제 운영 카카오 Client ID/Secret/Redirect URI/회원 세션 비밀값이 설정되지 않아 운영 가입 자체가 현재 불가능하다. STAGING의 카카오 시작은 302로 Kakao authorize로 이동하고 callback 설정은 STAGING origin과 일치한다. STAGING 관리자 로그인 설정은 추가했으며 Google Cloud callback 허용 등록 및 실제 로그인 검증이 남았다.

### 2026-09-27 추가 확인: STAGING 회원 목록 접근

- STAGING DB 최초 확인 당시 `users` 2명, `admin_users` 0명이었다. 운영 DB에는 활성 `PREPPY Owner` 1명과 비활성 운영자 1명이 있으며, 활성 Owner의 이메일은 기존에 제공받은 사업자 문의 이메일과 일치한다.
- 운영 관리자 로그인 공급자는 Google이다. 기존 Google OAuth 클라이언트로 STAGING 관리자 callback `https://preppy-web-staging-staging.up.railway.app/admin/auth/callback`을 검사했을 때 `redirect_uri_mismatch`가 확인됐다. Google OAuth 클라이언트에 이 주소가 등록돼야 한다.
- 최초에는 STAGING 관리자 환경변수 5개(`ADMIN_AUTH_ISSUER`, `ADMIN_AUTH_CLIENT_ID`, `ADMIN_AUTH_CLIENT_SECRET`, `ADMIN_SESSION_SECRET`, `ADMIN_OIDC_FLOW_SECRET`)가 없었다. 코드상 관리자 계정은 `admin_users`의 활성 Google subject와 일치해야 로그인된다.
- 자동 승인 심사는 처음에 운영 Owner의 Google 신원과 이메일을 STAGING으로 복사하는 것을 명시적 승인 부족으로 거부했다. Owner가 이어서 재사용을 명시적으로 승인했고, 그 후 활성 Owner 1명만 STAGING에 등록했다. 운영의 Google OAuth 클라이언트를 STAGING에 연결하고 관리자 세션·OIDC flow용 무작위 비밀값은 새로 독립 생성했다. 서비스 배포 `8dfe4d41-0351-4bc9-a9d0-50e295105416` 성공.
- 재검증: STAGING `admin_users` 활성 1명, `users` 2명, Kakao identity 2개. `/admin/login` HTTP 200, `/admin/auth/start` → Google 302 및 STAGING callback 포함, `/admin/users` → `/admin/login` 307. Google OAuth 클라이언트는 Google Cloud 프로젝트 `preview-506711`에 있으며, callback URI 등록과 Owner 실제 로그인 후 회원 2명 표시 확인이 남았다. PREVIEW 사용자 DB로 회원을 복제하지 않는다.

## 1. 실제 모바일 카카오 가입·로그인 — 부분 검증

STAGING 카카오 로그인 시작 302, 현재 실사용자 카카오 identity 2개를 DB 읽기 전용 집계로 확인했다. 코드의 콜백 중복 계정 방지/세션/가입 동의 검사를 통과했다. 테스트 전용 회원 세션으로 로그아웃 뒤 비로그인 복귀 확인. iPhone Safari 및 Android Chrome에서 실제 카카오 앱→브라우저 복귀, 로그인 취소와 재로그인은 이 실행 환경에 기기가 없어 직접 확인하지 못했다. 운영 카카오 시작은 503이다.

## 2. 관심기관 저장·회원 격리 — STAGING PASS, 실제 카카오 재로그인은 미검증

이전 STAGING 검증에서 영어유치원·사립초·국제학교 저장과 새로고침 후 유지, 해제와 실패 시 복구를 확인했다. 이번에는 별도 임시 회원 2명으로 재검증했다. 회원 A의 관심기관은 회원 B 목록에 나타나지 않았고, 회원 B의 해제 API 요청(멱등 204) 뒤에도 회원 A 목록에 남았다. 로그아웃 뒤 조회는 비로그인으로 전환됐다. 임시 회원 2명과 관심기관을 정확히 정리해 실사용자 2명만 유지했다.

## 3. 회원 탈퇴 — 출시 차단

로컬 격리 DB의 계정 탈퇴 통합 검사는 통과했으나 STAGING 실제 웹에서는 `/api/me/account/deletion`이 503이고 자동 탈퇴 기능이 비활성이다. 실제 STAGING 웹 DB 마이그레이션은 17개로 `0017_account_deletion`을 아직 포함하지 않는다. 카카오 어드민 연결 해제 키와 탈퇴 암호화 비밀값도 미설정이다. 화면은 직접 탈퇴 대신 이메일·전화 문의를 안내하지만 실제 접수→본인 확인→카카오 연결 해제→정보 삭제 사례의 완료 증빙은 없다. 운영에도 자동 탈퇴 설정은 없다. 공개 전 자동 탈퇴를 완성하거나, 안내한 수동 절차를 실제 사례로 검증하고 담당자·기한·처리 기록을 확정해야 한다.

## 4. 입학정보 정확성 — 표본 PASS, 전체 원문 대조 미완료

STAGING의 공개 입학정보 69개 모두 현재 검증 버전과 공식 출처 근거 연결이 있고, 30일 초과 확인 시점은 0개였다. 리라초 2027학년도 예정 요강은 학교 공식 페이지와 지원 대상(2020년생), 84명, 접수 2026-11-06~11, 전형료 3만 원 및 예정·변경 가능 안내를 대조했다. 중앙기독초 PDF와 화랑초 이미지 공식 링크는 HTTP 200이지만 원문 모든 조건 대조는 하지 않았다. 2026학년도 과거 정보는 홈 카드에서 `마감`으로 구분됐다. 영어유치원 라트는 원비·설명회 등 미확인 항목을 `확인하고 있어요`로 표시하며 근거 없는 금액을 채우지 않았다. 모든 69개 자료의 최신 공식 공고 재대조가 완료된 것은 아니다.

## 5. 운영 환경과 접근 제어 — 출시 차단

STAGING `/terms`, `/privacy`, 배포 health는 HTTP 200. 운영 `/terms`와 `/privacy`는 각각 HTTP 404여서 운영 공개가 불가능하다. 비로그인 `/my-preppy`는 카카오 로그인으로 이동하고, 타 출처의 관심기관 변경 요청은 403이었다. 계정 간 관심기관 조회 격리 확인. 관리자 목록의 사용자 정보는 각 환경 DB에만 존재한다. STAGING 관리자는 로그인 화면으로 이동하며 Google Cloud callback 등록과 실제 Owner 로그인 검증이 남았다. PREVIEW와 운영은 각자의 로그인으로 이동한다. 운영 회원 0명, 운영 카카오 시작 503. 운영 URL은 아직 최종 소유 도메인이 아니라 Railway 임시 도메인이다.

## 6. 장애·복구 — 격리 복원 PASS, 운영 백업 주기 미증명

로컬 PostgreSQL 17에서 논리 백업→SHA-256 확인→별도 DB 복원→마이그레이션 장부·핵심 테이블 건수·불변식·읽기 경로 검사가 PASS였다. 마지막 격리 훈련: 백업 약 259 ms, 복원 약 1071 ms, 검증 약 665 ms. 이 시간은 운영 장애 RTO 증빙이 아니다. Railway Hobby의 네이티브 PITR은 미사용, 일간/주간 운영 백업 자동화와 최근 운영 백업의 격리 복원은 확인하지 못했다. STAGING 이전 배포는 Railway 목록에서 `REMOVED` 상태여서 원클릭 복귀를 전제할 수 없다. 공개 전에 현재 운영 DB의 새 백업과 독립 복원, 되돌릴 배포 이미지/소스 지점을 기록해야 한다.

## 검사 실행 결과

- 단위: 156개 파일, 1,535개 통과.
- DB 통합: 87개 파일, 627개 통과. 현재 마이그레이션과 관심기관 정책에 맞춰 오래된 테스트 기대값을 정리하고 격리 PostgreSQL 복구 훈련을 실제 실행했다.
- Next.js 프로덕션 빌드/TypeScript: 통과.
- 이번 검사에서 발견한 숫자 지역 코드 노출을 기관 카드·상세·입학정보·내 프레피에 수정. STAGING 수정 배포 `116b1a6c-005f-4381-acf1-784f7dd9ee53` 성공. 390px 실제 화면에서 `국제학교 · 서울`, 영어유치원 상세 주소 유지, 가로 넘침 없음을 확인했다.
- 운영 배포와 운영 DB 쓰기는 하지 않았다. 실사용자 데이터는 수정하지 않았다.

## 출시까지 남은 순서

1. STAGING 관리자 Google OAuth callback을 `https://preppy-web-staging-staging.up.railway.app/admin/auth/callback`으로 등록하고 독립 관리자 비밀값을 설정한다. `/admin/users`에서 두 회원이 조회되는지 검증한다. PREVIEW 회원 DB와 동기화하지 않는다.
2. STAGING 실제 웹 DB `preppy_staging`에 0017을 적용하고 자동 탈퇴의 카카오 연결 해제 키/비밀값/Worker를 준비해 별도 QA 카카오 계정으로 전 과정을 검사하거나, 수동 탈퇴 운영 절차의 완료 증빙을 남긴다.
3. 최종 운영 도메인을 정하고 카카오 운영 callback·웹 도메인을 등록한 뒤 동일 검증 빌드를 운영에 배포한다. 실제 iPhone/Android 신규 가입·취소·재로그인을 수행한다.
4. 운영 DB 백업을 새로 만들고 격리 복원·배포 되돌리기 절차를 실행해 기록한다.
5. 최초 공개 범위의 공식 공고를 표본보다 넓게 검수한다. 예정·마감·미확인 구분과 실제 공식 링크를 재확인한다.

## UX Writing: FIX_REQUIRED

숫자 지역 코드 `11/41`은 사용자 화면에서 서울/경기로 수정했고, 기존 상세 주소·학년도·예정·마감·비용·출처·확인 시점을 보존했다. 관련 단위 검사와 빌드는 통과했다. 이번 지역 표시 수정 범위는 실제 STAGING 모바일 화면에서 확인했다. 전체 MVP 공개 기준에서는 운영 약관·처리방침 404, 실제 모바일 카카오 복귀 및 전체 공식 공고 대조 미완료가 남아 있다. 수행하지 않은 검사를 PASS로 기록하지 않는다.
