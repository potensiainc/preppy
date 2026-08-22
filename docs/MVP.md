# MVP

## 1. MVP 목적

프레피 MVP의 목적은 영유·국제학교·사립초 정보를 구조화하고, 부모가 관심기관을 등록하면 주요 모집·입학정보를 대신 확인해 알려주는 핵심 가설을 검증하는 것이다. 

핵심 Product Loop는 **Discover → Compare → Follow → Monitor → Update → Return**, 

Growth Loop는 **Google/Naver/Community → Editorial Article → Institution/Opportunity → Follow → Kakao Signup → Monitoring → Email → Return**이다.

## 2. MVP Target

- **영유:** 입학·이동·추가모집·상담·레벨테스트를 알아보는 3~6세 부모
- **국제학교:** Eligibility·Application·Open House 등을 알아보는 4~8세 부모
- **사립초:** 현재는 SEO·비교·관심등록·다음 입학시즌 선점용

소득·자산은 받지 않고 실제 조회·검색·관심등록 행동을 Premium Education Intent로 활용한다.

## 3. 카테고리 우선순위

- **P0 영유:** 신규모집, 추가모집, 설명회, 상담, 레벨테스트 등 연중 Monitoring 검증
- **P0 국제학교:** Application, Open House, Assessment, Interview 등 연중 Monitoring 검증
- **P1 사립초:** 정보 DB·SEO·관심등록은 제공하되 Monitoring PMF 판단은 입학 시즌에 진행

## 4. 핵심 가설 및 지표

- **Discovery:** Session당 기관 조회 2.5개+
- **Comparison:** Qualified User 중 2개 이상 기관 탐색 30%+
- **Monitoring:** Institution Detail → Follow 10%+, Strong 15%+
- **Signup:** Follow → Kakao 가입완료 60%+
- **Multi Follow:** 회원당 평균 Follow 2개+, 2개 이상 Follow 회원 40%+
- **Notification:** Email Open 45%+, CTR 10%+, 알림 후 72시간 재방문 15%+
- **Retention:** Activated User 14-Day Returning 25%+
- **Editorial SEO:** 단순 Indexed Article·Organic Traffic보다 **Organic Active Monitoring Parents** 증가 여부를 최종적으로 측정

## 5. North Star Metric

**Active Monitoring Parents:** 회원가입 완료 + 관심기관 1개 이상 + 이메일 업데이트 ON 상태인 부모.

## 6. 30일 Validation 목표

**Qualified Visitors 500명 → Active Monitoring Parents 50명 이상.** Detail→Follow 10%+, 평균 Follow 2개+, Email Open 45%+, Email CTR 10%+, 14-Day Return 25%+를 목표로 한다. 핵심 지표 대부분이 통과하면 Coverage와 Acquisition을 확대한다.

## 7. 초기 Data Coverage

- **영유:** 강남·서초·송파 중심 20~30개
- **국제학교:** 서울·경기 주요 10~15개
- **사립초:** 서울 주요 학교부터 시작해 확대

핵심 정보는 위치, 대상연령/Grade, 학비, 교육방식/Curriculum, Eligibility, 모집·상담·설명회·Application·Assessment 등의 Opportunity, 공식 Source, Last Verified다.

## 8. 핵심 Domain

`Institution / Opportunity / Source / User / Follow / Notification / Article`

**Opportunity**는 `○○영유 5세 추가모집`, `○○국제학교 Spring Application Open`처럼 지금 부모가 확인하거나 행동할 수 있는 모집·입학 기회를 의미한다.

## 9. Public UI

### Home Hero

**Headline**

> **입학정보, 아직도 일일이 찾아보고 계신가요?**
> 

**Subcopy**

> **영유·사립초·국제학교 정보를 한곳에서 확인하고, 관심기관의 새로운 모집·입학정보가 생기면 프레피가 알려드려요.**
> 

**Primary CTA:** `입학정보 찾아보기`

**Secondary CTA:** `관심기관 업데이트 받기`

Hero 아래에서는 사용자가 바로 실제 정보를 볼 수 있도록 다음 영역을 배치한다.

1. **지금 확인할 모집·입학정보:** 추가모집, 상담, 설명회, Open House, Application 등 최신 Opportunity
2. **교육기관 찾아보기:** 영유 / 사립초 / 국제학교
3. **지역·연령별 탐색:** 주요 지역과 자녀 연령 기준 탐색
4. **최신 입학정보:** 최근 새로 등록되거나 변경된 정보
5. **프레피 가이드:** Editorial CMS에서 발행한 최신 콘텐츠
6. **Monitoring 가치 설명:** 관심기관 등록 → 프레피 확인 → 새로운 정보 이메일 안내

홈 첫 화면은 프레피의 브랜드 설명보다 **“부모가 입학정보를 일일이 찾아다니는 문제를 해결한다”**는 가치를 가장 먼저 전달한다.

### Institution List

Category, Region, Age/Grade, 모집상태, 검색을 제공한다. 초기에는 복잡한 추천보다 빠르게 원하는 기관을 찾는 데 집중한다.

### Institution Detail

**현재 상태 → Opportunity → 주요 일정 → 핵심정보 → 입학정보 → 공식 Source → Last Verified → [이 기관 업데이트 받기]**

Follow 완료 시:

> **이제 프레피가 이 기관의 새로운 입학정보를 확인합니다.**
> 

를 표시하고 `다른 관심기관 추가하기`를 노출한다.

## 10. Account & My Preppy

기관 상세에서 **이 기관 업데이트 받기 → Kakao Login → 가입 → Follow 자동완료** 구조로 만든다. 최소 정보는 이메일, 자녀 출생연도, 관심지역, 관심 교육유형만 받는다.

My Preppy에서는:

- 관심기관
- 현재 모집·입학정보
- 향후 일정
- 최근 변경정보
- Last Verified
- Monitoring 상태
- 이메일 수신 ON/OFF
    
    를 관리한다.
    

My Preppy 상단에는 **“3개 기관 Monitoring 중”**처럼 사용자가 프레피에 맡기고 있는 기관 수를 명확하게 보여준다.

## 11. Monitoring

영유는 신규·추가모집, 설명회, 상담, 레벨테스트를, 국제학교는 Application, Open House, Assessment, Interview, Deadline을, 사립초는 설명회·모집요강·원서접수·추첨을 모니터링한다.

MVP에서는 완전자동 크롤러를 만들지 않고 **공식 Source 확인 → Admin 수정 → Follow User 조회 → Email 발송**으로 운영한다.

- 모집·지원 진행 중: 매일 확인
- 예정 Event 존재: 2~3일 단위
- 현재 Signal 없음: 주 1회

## 12. Trust Layer

모든 핵심 정보에 **공식 Source / Last Verified / Updated / 공식 링크**를 표시한다. 프레피가 정보를 주장하기보다 **어디에서 언제 확인했는지** 보여주는 방식으로 신뢰를 만든다. 기관 수보다 정보 정확도와 최신성을 우선한다.

## 13. Editorial CMS

Editorial CMS는 MVP P0이며 단순 블로그가 아니라 **SEO Acquisition Engine**이다. URL은 `/articles/{slug}`를 기본으로 하고 Admin에서 Article CRUD, Draft/Published, Visual Editor, HTML Source Editor, Preview, SEO 설정을 제공한다.

### Editor

- WYSIWYG: Tiptap
- HTML Source 직접 편집
- Desktop/Mobile Preview
- HTML 저장 전 Sanitizing
- 제목, 본문, 이미지, 링크, 표, 목록 등 기본 콘텐츠 작성
- 위험한 script·inline JS 등 제거

### Article Data

`title, slug, excerpt, content_html, category, status, seo_title, seo_description, canonical_url, robots_index, robots_follow, featured_image_url, featured_image_alt, author_id, published_at, updated_at`

## 14. Technical SEO

모든 Article·Institution·Opportunity 페이지는 검색엔진이 최초 HTML에서 핵심 콘텐츠를 읽을 수 있도록 SSR/SSG/ISR 기반으로 제공한다.

자동 생성:

- `<title>`
- Meta Description
- Canonical URL
- Robots
- Open Graph
- XML Sitemap
- Breadcrumb
- Article Structured Data
- Published/Modified Date

Draft와 Preview는 `noindex`, Sitemap에는 Published + Index 허용 URL만 포함한다. Slug 변경이나 중복 페이지 발생 시 Canonical 및 Redirect 정책을 적용한다.

## 15. 내부링크 구조

프레피 SEO는 **Article ↔ Institution ↔ Opportunity** 구조로 설계한다.

예:

`강남 영유 추가모집 총정리 → 해당 영유 상세 → 현재 추가모집 Opportunity → 관심등록`

Institution에서는 관련 Article을, Article에서는 관련 Institution과 Opportunity를 연결한다. 장기적으로 Article에 Institution Block을 삽입해 DB 정보가 자동 반영되도록 한다.

## 16. 초기 콘텐츠

출시 시 10개 내외로 시작한다.

- 강남 영유 모집 현황
- 강남 영유 추가모집 정보
- 영유 중간입학 알아보기
- 영유 레벨테스트 전 확인할 정보
- 국제학교 Eligibility
- 국제학교 Open House 일정
- 국제학교 Application 과정
- 서울·경기 국제학교 입학정보
- 서울 사립초 학비 비교
- 2027 사립초 입학 준비 일정

콘텐츠 개수가 아니라 **Article → Institution → Follow 전환**을 본다.

## 17. Marketing

초기 목표는 브랜드 인지도보다 **30일 내 Qualified Visitors 500명 확보**다.

- **Google SEO:** 기관명+학비/모집/레벨테스트/입학/Open House/Eligibility 등 Long-tail 공략
- **Naver:** 네이버 블로그·검색·맘카페에 Useful Information 배포 후 프레피 상세페이지 연결
- **Community:** “이번 달 강남 영유 추가모집 현황”처럼 정보 자체를 먼저 제공
- **Kakao Referral:** Opportunity 단위 카카오톡 공유
- **Editorial SEO:** 검색수요가 있는 입학·모집 질문을 Article로 지속 축적

대표 Acquisition Asset은 **PREPPY Admissions Radar — 이번 달 확인할 영유·국제학교·사립초 모집·입학정보**로 한다.

광고 메시지도 Hero와 동일한 문제에서 출발한다.

> **입학정보, 아직도 일일이 찾아보고 계신가요?**
> 

그 뒤에 프레피의 해결책을 연결한다.

> **영유·사립초·국제학교 정보를 한곳에서 확인하고, 관심기관의 새로운 모집·입학정보가 생기면 프레피가 알려드려요.**
> 

## 18. Analytics

핵심 Event:

`home_view, article_view, search, filter, institution_view, opportunity_view, follow_click, signup_start, signup_complete, follow_created, additional_follow, my_preppy_view, notification_sent, notification_open, notification_click, article_to_institution, article_to_follow`

주요 Property:

`institution_id, institution_type, region, opportunity_type, article_id, child_birth_year, utm_source, utm_medium, utm_campaign, landing_page, follow_count`

Hero 효과도 측정하기 위해 `hero_primary_cta_click`, `hero_secondary_cta_click`을 수집한다.

## 19. Dashboard

매일 확인할 숫자는 **Qualified Visitors / Organic Visitors / Indexed Articles / Institutions per Session / Detail→Follow / Signup Completion / Active Monitoring Parents / Average Follow / Email Open / Email CTR / 14-Day Returning**으로 제한한다. 전체 PV, 콘텐츠 개수, DB 개수, 가입자 수 자체는 핵심 KPI로 보지 않는다.

## 20. Admin

`Dashboard / Institutions / Opportunities / Sources / Articles / Notifications / Users`

- **Institutions:** 기관 정보 관리
- **Opportunities:** 모집·입학정보 관리
- **Sources:** 공식 출처·Last Verified 관리
- **Articles:** Editorial CMS
- **Notifications:** 이메일 발송 및 이력
- **Users:** 회원·Follow 상태 확인

WordPress급 CMS와 복잡한 권한·승인 Workflow는 MVP에서 제외한다.

## 21. MVP 제외 기능

모바일 앱, Push, AI 상담·추천, 후기·별점·커뮤니티, 학교 랭킹, 결제, Premium Subscription, 광고주 Dashboard, Lead Marketplace, 캠프·방과후 DB, 전국 Coverage, 완전자동 Crawling은 제외한다.

## 22. 기술 원칙

기존 Architecture를 최대한 유지하고 **Next.js + PostgreSQL + Kakao OAuth + Email + Tiptap/HTML Editor + GA4 + Google Search Console**로 구성한다. Manual로 검증 가능한 운영은 먼저 Manual로 처리하고 사용자 수요가 확인된 뒤 자동화한다.

## 23. Build Plan

**Day 1~2:** Schema·Institution·Opportunity·Source·User·Follow·Article 및 초기 데이터

**Day 3~4:** Home Hero·List·Search/Filter·Detail·Opportunity

**Day 5:** Source·Last Verified·Admin Verification

**Day 6:** Kakao Login·Signup·Follow

**Day 7:** My Preppy

**Day 8:** Email Notification

**Day 9~10:** Editorial CMS·Visual/HTML Editor·Preview·SEO Fields

**Day 11:** SSR/SSG·Metadata·Canonical·Robots·Sitemap·Structured Data·Internal Linking

**Day 12:** Analytics·GA4·Search Console

**Day 13:** 데이터 QA·초기 Article 10개·Admissions Radar

**Day 14:** Mobile/SEO/Login/Follow/Email QA 후 Launch

## 24. 출시 후 Validation

출시 이후에는 신규 기능 개발보다 **Traffic → Institution → Follow → Monitoring → Email → Return** Funnel 최적화에 집중한다. SEO·Naver·Community Distribution, Opportunity Update, Notification 발송, Hero/CTA 개선, 사용자 인터뷰를 진행한다.

특히 첫 500명에서 다음을 확인한다.

- Hero 메시지를 이해하고 CTA를 누르는가
- Institution을 2개 이상 탐색하는가
- 실제 Follow하는가
- Kakao 가입까지 완료하는가
- 여러 기관을 맡기는가
- 이메일을 열고 다시 돌아오는가

## 25. Expansion Gate

`Active Monitoring Parents ≥ 100 / Detail→Follow ≥ 10% / Average Follow ≥ 2 / Email Open ≥ 45% / 14-Day Returning ≥ 25% / Organic AMP 지속 증가`를 넘기기 전 캠프·방과후·AI·광고 플랫폼으로 확장하지 않는다.

## 26. MVP Definition of Done

**Google/Naver 검색 → Article/Institution 유입 → 기관·Opportunity 탐색 → 관심등록 → Kakao 가입 → My Preppy → 프레피 Monitoring → 모집·입학정보 Update → 이메일 → 재방문**이 처음부터 끝까지 작동하면 MVP 개발은 완료다. 이후 목표는 기능 추가가 아니라 이 Loop를 더 많은 사용자에게 반복시키는 것이다.

## 27. 최종 판단

프레피 MVP가 증명해야 할 것은 세 가지다.

**Acquisition:** 검색으로 타깃 부모를 획득할 수 있는가.

**Utility:** 흩어진 영유·사립초·국제학교 정보를 한곳에서 보는 것이 실제로 편리한가.

**Delegation:** 부모가 반복적인 입학정보 확인을 프레피에게 맡기는가.

프레피의 홈에서 가장 먼저 전달해야 할 문제와 해결책도 이 세 번째 가설에 맞춘다.

> **입학정보, 아직도 일일이 찾아보고 계신가요?**
> 

> **영유·사립초·국제학교 정보를 한곳에서 확인하고, 관심기관의 새로운 모집·입학정보가 생기면 프레피가 알려드려요.**
> 

Editorial CMS는 **Organic Acquisition Engine**, Institution DB는 **Discovery/Comparison Engine**, Follow+Monitoring은 **Activation/Retention Engine**이다. 최초 목표는 **30일 내 Qualified Visitor 500명 → Active Monitoring Parent 50명 이상**이다.