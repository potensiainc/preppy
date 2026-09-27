# PREPPY 출시 런북

출시 여부는 Owner가 결정해요. 이 문서는 **운영 공개까지 Owner가 할 일**을 순서대로 적은 체크리스트예요. 코드 변경은 필요 없어요.

- 기준 커밋: `main` 최신 (영유·사립초·국제학교 관심기관 저장 포함)
- 예상 소요: 반나절
- 권장 공개 시점: **10월 중순 이전** (사립초 원서접수가 11월 초에 시작돼요)

## 오늘 할 일 (P0)

### 1. 도메인 (30분)

- [ ] 도메인 구매 (예: `preppy.kr`)
- [ ] Railway PRODUCTION `web` 서비스 → Settings → Networking → Custom Domain 추가 → 안내된 CNAME을 DNS에 등록
- [ ] Railway 공유 변수 `APP_BASE_URL=https://<도메인>` 설정

### 2. 카카오 로그인 (20분)

- [ ] 카카오 개발자 콘솔 → 앱 → 플랫폼 → Web 사이트 도메인에 `https://<도메인>` 추가
- [ ] 카카오 로그인 → Redirect URI에 `https://<도메인>/auth/kakao/callback` 추가
- [ ] Railway 변수: `KAKAO_CLIENT_ID`, `KAKAO_CLIENT_SECRET`, `KAKAO_REDIRECT_URI=https://<도메인>/auth/kakao/callback`
- [ ] 비밀값 3개 생성 후 설정: `USER_SESSION_SECRET`, `OAUTH_STATE_SECRET`, `FOLLOW_INTENT_SECRET`

```bash
openssl rand -base64 48   # 각각 따로 생성
```

### 3. 관리자 로그인 (10분)

- [ ] Google Cloud 프로젝트 `preview-506711` → OAuth 클라이언트 → 승인된 리디렉션 URI에 추가
  - `https://<도메인>/admin/auth/callback`
  - `https://preppy-web-staging-staging.up.railway.app/admin/auth/callback` (STAGING)
- [ ] PRODUCTION 변수 `ADMIN_*` 5개 확인

### 4. 배포와 마이그레이션 (20분)

- [ ] 배포 전 운영 DB 백업 (아래 6번 명령)
- [ ] Railway PRODUCTION `web`·`worker`를 최신 `main`으로 수동 배포
- [ ] 마이그레이션 적용 (0018 아티클 태그까지). 마이그레이션 권한이 있는 URL로 실행해요.

```bash
DATABASE_URL='<운영 migration role URL>' npm run db:migrate
```

- [ ] 확인: `/api/health` 200, `/terms` 200, `/privacy` 200, `/institutions` 목록, 영유 상세에 하트 표시

### 5. 실기기 확인 (15분)

- [ ] iPhone Safari: 영유 상세 하트 → 카카오 로그인 → 가입 → 하트 채워짐 → 내 프레피에 표시
- [ ] Android Chrome: 같은 흐름 + 로그인 취소 후 다시 로그인
- [ ] 로그아웃 후 `/my-preppy` 접근 시 로그인으로 이동

### 6. 백업 1회 (10분)

```bash
pg_dump --format=custom --no-owner --no-acl "<운영 DB URL>" -f preppy-$(date +%Y%m%d).dump
sha256sum preppy-*.dump > preppy-backup.sha256
```

파일은 로컬 암호화 폴더에 보관해요. 복원 연습은 P1이에요 (`npm run db:restore-drill`).

### 7. 탈퇴 처리 준비 (5분)

- [ ] 카카오 콘솔에서 **Admin 키** 위치 확인
- [ ] [수동 탈퇴 절차](ACCOUNT_DELETION_MANUAL.md) 한 번 읽기. 자동 탈퇴(`ACCOUNT_DELETION_ENABLED`)는 켜지 않아도 돼요.

## 이메일 알림 켜기 (P0 권장 — 핵심 가치)

현재 개인정보 처리방침에 "이메일을 발송하지 않아요"라고 적혀 있어요. 발송 전에 처리방침을 갱신해야 해요.

1. Resend 가입 → Domains → `<도메인>` 추가 → DNS(SPF/DKIM) 등록 → Verified 확인
2. Webhook: `https://<도메인>/api/webhooks/resend` 등록 → signing secret 복사
3. Railway 변수: `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `EMAIL_FROM=PREPPY <notice@<도메인>>`
4. 처리방침 개정 (`src/modules/legal/content.ts` 3·5절 + `src/application/legal-policies.server.ts`의 버전·시행일 갱신). 3절 "현재는 이메일 수신 설정만 저장하며 이메일을 발송하지 않아요." 문장을 대체할 초안이에요.

   > 관심기관의 새 입학정보를 확인하면 등록한 이메일로 알려드려요. 발송을 위해 이메일 주소와 발송 결과(전달·열람·반송 여부)를 처리해요.

   5절 국외 이전 항목 추가 초안이에요.

   > - 이전받는 자: Resend, Inc. (연락처는 Resend DPA에서 확인 후 기재)
   > - 위탁 업무와 목적: 관심기관 소식 이메일 발송과 발송 결과 확인
   > - 이전 국가: 미국
   > - 이전 항목: 이메일 주소, 이메일 본문에 포함된 관심기관 정보, 발송 결과 기록
   > - 이전 시기와 방법: 이메일 발송 시 네트워크를 통한 전송
   > - 보유·이용 기간: 발송 목적 달성 또는 위탁 계약 종료 시까지

   마지막 문장 "이메일 발송업체로의 회원 정보 이전은 현재 시행하지 않아요."는 삭제해요.
5. 배포 후 `EMAIL_SEND_ENABLED=true`, `WORKER_ENABLED=true`
6. Admin에서 본인 계정이 관심등록한 기관의 입학정보를 검증 → 이메일 수신 확인

## 검색·공유 등록 (P0, 20분)

- [ ] Google Search Console → URL 접두어 `https://<도메인>` → HTML 태그 방식 → content 값을 Railway `GOOGLE_SITE_VERIFICATION`에 넣고 재배포 → 확인
- [ ] 네이버 서치어드바이저 → 사이트 등록 → HTML 태그 방식 → content 값을 `NAVER_SITE_VERIFICATION`에 넣고 재배포 → 확인
- [ ] 두 곳 모두 사이트맵 `https://<도메인>/sitemap.xml` 제출
- [ ] 공유 이미지 확인: `https://<도메인>/og/default`가 1200×630 이미지로 보이는지 확인
- [ ] 글을 고친 뒤 카톡 미리보기가 안 바뀌면 [카카오 공유 디버거](https://developers.kakao.com/tool/debugger/sharing)에서 해당 글 주소 캐시를 초기화해요

## 출시 후 1~2주 (P1)

- 영유 관심기관의 공식 출처 모니터링 설정 (Admin → 출처). 저장은 이미 되지만, 이메일 알림은 운영자가 변경을 검증해야 나가요. 강남·서초 상위 20곳부터 시작해요.
- Google Search Console·네이버 서치어드바이저에 `https://<도메인>/sitemap.xml` 제출
- GA4 연결 (`GA4_MEASUREMENT_ID`, `GA4_API_SECRET`, `ANALYTICS_ENABLED=true`) — 처리방침 6절 갱신이 필요해요
- 사립초 공개 일정 20~30개 원문 재대조 (이번 시즌 노출분만)
- 에디토리얼 3~5개 발행: "2027 사립초 설명회·원서접수 일정 총정리" 등
- 백업 복원 연습 1회

## 백로그 (P2)

- 자동 탈퇴 활성화 (0017 적용 + 카카오 Admin 키 + 영수증 비밀값 + Worker)
- Railway Pro PITR, 배포 롤백 절차
- 두 번째 Web 인스턴스 (분산 rate limit 필요)
