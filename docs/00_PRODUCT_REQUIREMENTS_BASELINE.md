# 00_PRODUCT_REQUIREMENTS_BASELINE.md

> **Project:** PREPPY (프레피)  
> **Document Type:** Product Requirements Baseline / Product Contract  
> **Status:** Baseline v1.0  
> **Purpose:** One Pager와 MVP에 정의된 제품 방향, 검증 범위, 핵심 도메인, 제품 원칙과 확장 경계를 하나의 기준선으로 고정한다. 이후 Architecture Audit, Target Architecture, Domain Model, Data Model, PRD, Implementation Plan은 이 문서를 기준으로 정합성을 판단한다.

---

## 0. Document Role

이 문서는 상세 PRD가 아니다.

이 문서의 역할은 다음과 같다.

1. One Pager와 MVP에 정의된 **제품의 목적과 핵심 가설을 고정**한다.
2. MVP에서 반드시 구현해야 할 것과 구현하지 않을 것을 구분한다.
3. 장기 비전을 보존하되, MVP 단계에서 과도하게 구현하지 않도록 **확장 경계**를 정의한다.
4. 기존 Codex Architecture를 평가할 때 사용할 **제품 요구사항 기준선**을 제공한다.
5. 이후 작성될 Architecture, Domain Model, Data Model, PRD가 서로 다른 제품을 설계하는 것을 방지한다.

이 문서에서 명시한 제품 요구사항을 변경하려면 One Pager 또는 MVP 수준의 제품 결정이 먼저 변경되어야 한다.

---

# 1. Product Definition

## 1.1 Service Definition

프레피는 영유·사립초·국제학교를 현실적인 선택지로 고려하는 부모가 우리 아이에게 맞는 프리미엄 교육기관과 교육 기회를 발견하고, 비교하고, 중요한 입학정보를 놓치지 않도록 관리해주는 **Premium Education Discovery, Intelligence & Monitoring Platform**이다.

프레피는 대한민국 전체 학부모를 대상으로 한 범용 학교 검색 서비스가 아니다.

초기에는 다음 프리미엄 교육영역에 집중한다.

- 영유
- 서울 사립초
- 서울·경기 주요 국제학교

프레피는 단순한 기관 DB가 아니라 다음 두 기능의 결합을 지향한다.

- **Editorial / Discovery Layer:** 신뢰할 수 있는 교육정보를 구조화하고 발견·비교하게 한다.
- **Monitoring Layer:** 관심기관의 주요 모집·입학정보를 지속적으로 확인하고 변경사항을 알려준다.

## 1.2 Final Product Definition

> **프레피는 대한민국 프리미엄 교육시장의 Discovery, Intelligence & Monitoring Platform이다.**

사용자에게 궁극적으로 제공해야 하는 상태는 다음과 같다.

> **“우리 아이의 중요한 교육 선택을 제대로 관리하고 있다는 확신.”**

---

# 2. Target Customer

## 2.1 Primary User

**3~8세 자녀를 둔 30~40대 여성 부모**

## 2.2 Target Characteristics

핵심 타깃은 다음 특성을 가진다.

- 영유 입학 또는 재원을 고려한다.
- 서울 사립초를 현실적인 선택지로 고려한다.
- 국제학교 또는 해외교육 가능성도 열어두고 있다.
- 자녀 교육에 높은 재량지출 의향이 있다.
- 가격보다 교육의 질, 환경, 네트워크, 경험, 미래 선택지를 중요하게 생각한다.
- 다른 부모보다 중요한 교육정보를 늦게 아는 것을 싫어한다.
- 부모가 정보를 놓쳐 아이의 선택지가 사라지는 상황을 특히 싫어한다.
- 정보의 양보다 신뢰 가능한 정보와 비교 기준을 원한다.

프레피는 가입 단계에서 사용자의 소득·자산·직업·월 교육비를 직접 요구하지 않는다.

프리미엄 교육 카테고리와 실제 서비스 행동을 통해 사용자를 자연스럽게 선별한다.

---

# 3. Market Boundary

## 3.1 In Scope Market

프레피가 집중하는 시장은 **Premium Education Market**이다.

초기 핵심 카테고리는 다음과 같다.

| Category | Core Information |
|---|---|
| 영유 | 설명회, 상담, 레벨테스트, 신규모집, 추가모집, 학비, 교육방식, 위치 |
| 사립초 | 설명회, 모집요강, 원서접수, 추첨, 경쟁률, 학비, 통학 |
| 국제학교 | Eligibility, Open House, Application, Assessment, Interview, Tuition, Curriculum |

## 3.2 Out of Market Scope

프레피는 다음을 핵심 시장으로 삼지 않는다.

- 일반 공립학교
- 전국 초·중·고 학교정보
- 내신·수능 중심 입시
- 외고·과고·영재고 중심 탐색
- 일반 학교 랭킹
- 대중적인 사교육 정보

---

# 4. User Problem

프리미엄 교육시장은 소비 금액에 비해 정보 인프라가 파편화되어 있다.

부모는 다음 채널을 반복적으로 확인해야 한다.

- 학교/기관 홈페이지
- 기관 SNS
- 네이버 블로그
- 맘카페
- 학부모 단톡방
- 지인
- 설명회
- 학원 상담
- 국제학교 Admissions 페이지

핵심 문제는 다음 7가지다.

1. **Discovery** — 우리 아이에게 가능한 교육 선택지를 한눈에 알기 어렵다.
2. **Comparison** — 기관별 정보 구조가 달라 동일한 기준으로 비교하기 어렵다.
3. **Fragmentation** — 중요한 정보가 여러 채널에 흩어져 있다.
4. **Freshness** — 과거 정보와 현재 정보, 변경 전후 정보가 섞여 있다.
5. **Trust** — 커뮤니티·블로그 정보의 출처와 정확성을 판단하기 어렵다.
6. **Monitoring** — 여러 관심기관의 홈페이지와 공지를 부모가 직접 반복 확인해야 한다.
7. **Deadline Anxiety** — 설명회·레벨테스트·원서접수 등 놓치기 어려운 일정이 존재한다.

프레피가 해결하려는 핵심 문제는 단발성 검색이 아니라 **여러 관심기관을 지속적으로 탐색·비교·확인해야 하는 반복 업무**다.

---

# 5. Core User Job

사용자가 원하는 것은 단순 학교정보가 아니다.

> **우리 아이에게 맞는 좋은 교육 선택지를 충분히 알고, 중요한 기회를 몰라서 놓치지 않는 것**

프레피는 특정 기관을 추천하거나 순위를 매기는 서비스가 아니다.

프레피의 역할은 다음과 같다.

- 가능한 교육 선택지를 발견하게 한다.
- 비교 가능한 형태로 구조화한다.
- 공식 정보와 최신 확인 시점을 제시한다.
- 관심기관을 저장하게 한다.
- 중요한 모집·입학정보를 대신 확인한다.
- 새로운 정보나 변경사항이 생기면 사용자에게 알려준다.

최종 판단은 부모가 직접 한다.

---

# 6. Core Value Proposition

프레피의 기능적 가치 흐름은 다음과 같다.

**Discover → Compare → Follow → Monitor → Update**

MVP에서는 재방문까지 포함해 다음 Product Loop를 검증한다.

**Discover → Compare → Follow → Monitor → Update → Return**

사용자가 얻는 핵심 가치는 두 가지다.

## 6.1 Better Choice

흩어진 정보 속에서 우리 아이에게 의미 있는 교육 선택지를 더 쉽게 발견하고 비교할 수 있다.

## 6.2 Peace of Mind

중요한 입학정보를 부모가 몰라서 놓칠 가능성을 줄인다.

> **“우리 아이에게 좋은 교육 기회가 있었는데 내가 몰라서 놓치는 일은 없다.”**

---

# 7. Core Product Loop

## 7.1 Product Loop

```text
Discover
→ Compare
→ Follow
→ Monitor
→ Update
→ Return
```

### Discover

지역, 연령, 기관유형, 통학, 지원자격 등의 기준으로 기관과 입학정보를 탐색한다.

### Compare

위치, 학비, 교육방식, 모집연령/Grade, Curriculum, Eligibility, 입학절차 등을 가능한 한 동일한 기준으로 비교한다.

### Follow

사용자가 관심기관을 등록한다.

### Monitor

프레피가 관심기관의 주요 Source를 지속적으로 확인한다.

### Update

신규 모집·입학정보 또는 중요한 변경사항이 발생하면 정보를 업데이트하고 회원에게 이메일로 안내한다.

### Return

사용자가 이메일 또는 검색/직접 방문을 통해 다시 프레피로 돌아와 후속 정보를 확인한다.

## 7.2 Growth Loop

```text
Google / Naver / Community
→ Editorial Article
→ Institution / Opportunity
→ Follow
→ Kakao Signup
→ Monitoring
→ Email
→ Return
```

Growth의 목적은 Page View 자체가 아니라 **Active Monitoring Parents 증가**다.

---

# 8. MVP Product Goal

프레피 MVP의 목적은 다음 핵심 가설을 검증하는 것이다.

> **“부모가 관심 있는 교육기관의 중요한 정보를 직접 찾아다니는 대신 프레피가 계속 확인해주도록 맡길 것인가?”**

MVP가 검증해야 하는 것은 세 가지다.

## 8.1 Acquisition

검색과 콘텐츠를 통해 타깃 부모를 획득할 수 있는가.

## 8.2 Utility

흩어진 영유·사립초·국제학교 정보를 한곳에서 탐색하고 비교하는 것이 실제로 편리한가.

## 8.3 Delegation

부모가 반복적인 모집·입학정보 확인을 프레피에 맡기는가.

세 번째 가설인 **Delegation**이 가장 중요한 핵심 가설이다.

---

# 9. MVP Category Priority

## 9.1 P0 — 영유

연중 Monitoring 검증이 가능한 핵심 카테고리다.

주요 Monitoring 대상:

- 신규모집
- 추가모집
- 설명회
- 상담
- 레벨테스트

## 9.2 P0 — 국제학교

연중 Monitoring 검증이 가능한 핵심 카테고리다.

주요 Monitoring 대상:

- Application
- Open House
- Assessment
- Interview
- Deadline

## 9.3 P1 — 사립초

MVP에서 다음은 제공한다.

- Institution DB
- SEO
- 비교
- 관심등록

다만 Monitoring PMF에 대한 본격적인 판단은 실제 입학 시즌에 진행한다.

---

# 10. MVP Data Coverage

초기 Coverage 목표는 다음과 같다.

- **영유:** 강남·서초·송파 중심 20~30개
- **국제학교:** 서울·경기 주요 10~15개
- **사립초:** 서울 주요 학교부터 시작해 확대

기관 수 자체보다 **정보 정확도, 최신성, 공식 출처, 검증 가능성**을 우선한다.

핵심 데이터는 다음을 포함한다.

- 위치
- 대상 연령 / Grade
- 학비
- 교육방식 / Curriculum
- Eligibility
- 모집·상담·설명회·Application·Assessment 등 Opportunity
- 공식 Source
- Last Verified

---

# 11. Core Domain Baseline

현재 MVP에서 명시적으로 정의된 핵심 Domain은 다음 7개다.

```text
Institution
Opportunity
Source
User
Follow
Notification
Article
```

## 11.1 Institution

영유, 사립초, 국제학교 등 사용자가 탐색하고 관심등록할 수 있는 교육기관이다.

## 11.2 Opportunity

현재 부모가 확인하거나 행동할 수 있는 모집·입학 기회를 의미한다.

예:

- `○○영유 5세 추가모집`
- `○○국제학교 Spring Application Open`
- 입학설명회
- 상담
- 레벨테스트
- Open House
- Assessment
- Interview
- 원서접수
- 추첨

Opportunity는 Institution의 단순 속성으로 취급하지 않고 별도의 핵심 도메인 개념으로 유지한다.

## 11.3 Source

기관 및 Opportunity 정보를 확인할 수 있는 공식 출처다.

프레피는 핵심 정보에 가능한 한 다음을 제공한다.

- 공식 Source
- 공식 링크
- Last Verified
- Updated 여부
- 일정 변경 여부

## 11.4 User

프레피 회원이다.

MVP 가입은 Kakao Login을 기본 방식으로 사용한다.

## 11.5 Follow

회원과 관심기관 사이의 관심등록 관계다.

Follow는 프레피의 Monitoring 위임을 발생시키는 핵심 행동이다.

## 11.6 Notification

관심기관의 새로운 모집·입학정보 및 변경사항을 회원에게 전달하는 기능이다.

MVP 전달 채널은 이메일이다.

## 11.7 Article

SEO Acquisition과 사용자의 판단을 돕는 Editorial Content다.

Article은 단순 블로그 콘텐츠가 아니라 **Organic Acquisition Engine**으로 취급한다.

---

# 12. Public Product Requirements

## 12.1 Home

Hero의 핵심 메시지는 다음 문제에서 시작한다.

> **입학정보, 아직도 일일이 찾아보고 계신가요?**

Subcopy:

> **영유·사립초·국제학교 정보를 한곳에서 확인하고, 관심기관의 새로운 모집·입학정보가 생기면 프레피가 알려드려요.**

CTA:

- Primary: `입학정보 찾아보기`
- Secondary: `관심기관 업데이트 받기`

Hero 아래에는 최소한 다음 정보영역을 제공한다.

1. 지금 확인할 모집·입학정보
2. 교육기관 찾아보기
3. 지역·연령별 탐색
4. 최신 입학정보
5. 프레피 가이드
6. Monitoring 가치 설명

## 12.2 Institution List

최소한 다음 탐색 기능을 제공한다.

- Category
- Region
- Age / Grade
- 모집상태
- 검색

MVP에서는 복잡한 추천보다 사용자가 원하는 기관을 빠르게 찾는 데 집중한다.

## 12.3 Institution Detail

기본 정보 구조는 다음 흐름을 따른다.

```text
현재 상태
→ Opportunity
→ 주요 일정
→ 핵심정보
→ 입학정보
→ 공식 Source
→ Last Verified
→ 이 기관 업데이트 받기
```

Follow 완료 후에는 사용자가 프레피에 Monitoring을 맡겼다는 상태를 명확하게 전달한다.

예:

> **이제 프레피가 이 기관의 새로운 입학정보를 확인합니다.**

이후 `다른 관심기관 추가하기`를 유도한다.

---

# 13. Account & My Preppy Requirements

## 13.1 Authentication

MVP 기본 가입 방식은 **Kakao Login**이다.

기본 전환 플로우:

```text
Institution Detail
→ 이 기관 업데이트 받기
→ Kakao Login
→ 가입
→ Follow 자동완료
```

## 13.2 Minimum User Information

초기 수집 대상은 다음과 같다.

- 카카오 계정 식별정보
- 이메일
- 자녀 출생연도
- 관심지역
- 관심 교육유형
- 약관 및 개인정보 관련 동의

다음 정보는 기본 가입 단계에서 요구하지 않는다.

- 소득
- 자산
- 직업
- 월 교육비

## 13.3 My Preppy

회원은 최소한 다음을 관리할 수 있어야 한다.

- 관심기관
- 현재 모집·입학정보
- 향후 일정
- 최근 변경정보
- Last Verified
- Monitoring 상태
- 이메일 수신 ON/OFF
- 자녀 정보
- 관심지역

My Preppy는 사용자가 프레피에 맡기고 있는 Monitoring 상태를 명확하게 보여줘야 한다.

예:

> **3개 기관 Monitoring 중**

---

# 14. Monitoring Requirements

Monitoring은 프레피 MVP의 핵심 Utility이자 Delegation 가설을 검증하는 기능이다.

## 14.1 Monitoring Targets

### 영유

- 신규모집
- 추가모집
- 설명회
- 상담
- 레벨테스트

### 국제학교

- Application
- Open House
- Assessment
- Interview
- Deadline

### 사립초

- 설명회
- 모집요강
- 원서접수
- 추첨

## 14.2 MVP Operating Model

MVP에서는 완전자동 Crawling을 구축하지 않는다.

기본 운영 흐름은 다음과 같다.

```text
공식 Source 확인
→ Admin 수정
→ Follow User 조회
→ Email 발송
```

검증 주기의 기준은 다음과 같다.

- 모집·지원 진행 중: 매일 확인
- 예정 Event 존재: 2~3일 단위 확인
- 현재 Signal 없음: 주 1회 확인

Manual로 검증 가능한 운영은 먼저 Manual로 처리하고, 실제 사용자 수요가 확인된 뒤 자동화를 확대한다.

---

# 15. Trust Requirements

프레피의 핵심 경쟁력은 기관 수보다 **정보의 신뢰도와 최신성**이다.

핵심 정보에는 가능한 한 다음을 표시한다.

- 공식 Source
- 공식 링크
- Last Verified
- Updated 여부
- 일정 변경 여부

Trust의 기본 원칙은 프레피가 단순히 정보를 주장하는 것이 아니라:

> **어디에서, 언제 확인한 정보인지 보여주는 것**

이다.

사용자가 프레피에서 확인한 내용을 다시 검색엔진이나 기관 홈페이지에서 재검증해야 하는 부담을 줄이는 것을 목표로 한다.

---

# 16. Editorial & SEO Requirements

Editorial CMS는 MVP P0이며 단순 블로그가 아니라 **SEO Acquisition Engine**이다.

## 16.1 Editorial Role

Editorial의 목적은 다음 Funnel을 만든다.

```text
Search
→ Article
→ Institution / Opportunity
→ Follow
→ Signup
```

콘텐츠 개수나 Indexed Page 수 자체보다 **Article → Institution → Follow 전환**을 중요하게 본다.

## 16.2 Article URL

기본 URL:

```text
/articles/{slug}
```

## 16.3 CMS Requirements

Admin에서 최소한 다음을 제공한다.

- Article CRUD
- Draft / Published
- Visual Editor
- HTML Source Editor
- Preview
- SEO 설정

Editor 기준:

- WYSIWYG: Tiptap
- HTML Source 직접 편집
- Desktop / Mobile Preview
- 저장 전 HTML Sanitizing
- 제목, 본문, 이미지, 링크, 표, 목록
- 위험한 script 및 inline JS 제거

## 16.4 Article Data

기본 데이터 필드는 다음과 같다.

```text
title
slug
excerpt
content_html
category
status
seo_title
seo_description
canonical_url
robots_index
robots_follow
featured_image_url
featured_image_alt
author_id
published_at
updated_at
```

## 16.5 Technical SEO

Article, Institution, Opportunity 페이지는 검색엔진이 최초 HTML에서 핵심 내용을 읽을 수 있도록 SSR / SSG / ISR 기반 제공을 전제로 한다.

자동 생성 또는 관리 대상:

- title
- Meta Description
- Canonical URL
- Robots
- Open Graph
- XML Sitemap
- Breadcrumb
- Article Structured Data
- Published Date
- Modified Date

Draft와 Preview는 `noindex`.

Sitemap에는 Published + Index 허용 URL만 포함한다.

Slug 변경 및 중복 URL 발생 시 Canonical / Redirect 정책을 적용한다.

## 16.6 Internal Linking

핵심 구조:

```text
Article
↔ Institution
↔ Opportunity
```

Institution에서는 관련 Article을 제공하고, Article에서는 관련 Institution과 Opportunity로 연결한다.

장기적으로 Article 내부 Institution Block에서 DB 정보가 자동 반영되는 구조를 고려한다.

---

# 17. Analytics Requirements

Analytics는 단순 Traffic 측정이 아니라 Product Loop와 Education Intent를 측정해야 한다.

## 17.1 Core Events

```text
home_view
article_view
search
filter
institution_view
opportunity_view
follow_click
signup_start
signup_complete
follow_created
additional_follow
my_preppy_view
notification_sent
notification_open
notification_click
article_to_institution
article_to_follow
hero_primary_cta_click
hero_secondary_cta_click
```

## 17.2 Core Properties

```text
institution_id
institution_type
region
opportunity_type
article_id
child_birth_year
utm_source
utm_medium
utm_campaign
landing_page
follow_count
```

## 17.3 Data Asset Direction

장기적으로 프레피가 확보하려는 핵심 데이터 자산은 단순 회원 DB가 아니라 **Parent Education Intent Data**다.

### Declared Data

- 자녀 연령
- 관심지역
- 관심 교육유형
- 관심기관
- 이메일 업데이트 설정

### Behavioral Data

- 조회한 기관
- 검색어
- 사용한 필터
- 비교한 기관
- 관심등록한 기관
- 반복 조회 기관
- 열람한 Article
- 이메일 열람 및 재방문
- 향후 교육기회 콘텐츠 반응
- 향후 광고/제휴 콘텐츠 반응

MVP에서는 필요한 Product Analytics를 우선 수집하되, 장기적인 Intent Asset 형성이 불가능해지는 구조를 만들지 않는다.

---

# 18. North Star Metric

## 18.1 North Star

**Active Monitoring Parents**

One Pager의 정의:

> 하나 이상의 관심 교육기관을 등록하고 프레피를 통해 해당 기관의 주요 정보와 변경사항을 지속적으로 관리받고 있는 활성 회원 수

MVP 측정 정의:

```text
회원가입 완료
+ 관심기관 1개 이상
+ 이메일 업데이트 ON
```

프레피는 단순 회원가입 수나 Page View보다 **얼마나 많은 부모가 반복적인 정보 확인을 프레피에 맡기고 있는가**를 중요하게 본다.

---

# 19. Validation Metrics

## 19.1 Core MVP Targets

- **Discovery:** Session당 기관 조회 2.5개+
- **Comparison:** Qualified User 중 2개 이상 기관 탐색 30%+
- **Monitoring:** Institution Detail → Follow 10%+, Strong 15%+
- **Signup:** Follow → Kakao 가입완료 60%+
- **Multi Follow:** 회원당 평균 Follow 2개+, 2개 이상 Follow 회원 40%+
- **Notification:** Email Open 45%+, CTR 10%+
- **Notification Return:** 알림 후 72시간 재방문 15%+
- **Retention:** Activated User 14-Day Returning 25%+

Editorial SEO는 단순 Indexed Article이나 Organic Traffic보다 **Organic Active Monitoring Parents 증가**를 최종 성과로 본다.

## 19.2 30-Day Validation Goal

```text
Qualified Visitors 500명
→ Active Monitoring Parents 50명 이상
```

MVP의 핵심 검증 지표가 통과하면 Coverage와 Acquisition을 확대한다.

---

# 20. Dashboard Metrics

매일 확인할 핵심 숫자는 다음으로 제한한다.

- Qualified Visitors
- Organic Visitors
- Indexed Articles
- Institutions per Session
- Detail → Follow
- Signup Completion
- Active Monitoring Parents
- Average Follow
- Email Open
- Email CTR
- 14-Day Returning

다음 숫자는 단독으로 핵심 KPI로 보지 않는다.

- 전체 Page View
- 콘텐츠 개수
- DB 기관 개수
- 총 가입자 수

---

# 21. Admin Requirements

MVP Admin은 다음 영역을 제공한다.

```text
Dashboard
Institutions
Opportunities
Sources
Articles
Notifications
Users
```

기능 범위:

### Institutions
기관 정보 관리

### Opportunities
모집·입학정보 관리

### Sources
공식 출처 및 Last Verified 관리

### Articles
Editorial CMS

### Notifications
이메일 발송 및 발송 이력 관리

### Users
회원과 Follow 상태 확인

MVP에서는 WordPress급 범용 CMS, 복잡한 권한 체계, 복잡한 승인 Workflow를 만들지 않는다.

---

# 22. MVP Scope

MVP에서 반드시 제공하는 기능은 다음과 같다.

- 영유 / 서울 사립초 / 주요 국제학교 DB
- 지역·연령·기관유형 검색 및 필터
- Institution List
- Institution Detail
- 학비·위치·지원자격 등 핵심 정보
- Opportunity
- 주요 입학 일정
- 공식 Source
- Last Verified
- Kakao Login
- 회원가입
- 관심기관 Follow
- My Preppy
- Monitoring
- 주요 일정 및 변경사항 Email Notification
- Admin 정보 수집·검증
- Editorial CMS
- Article
- SEO Metadata / Canonical / Sitemap / Structured Data / Internal Linking
- Analytics
- GA4
- Google Search Console 연동

---

# 23. Explicit MVP Non-Scope

다음 기능은 MVP에서 구현하지 않는다.

- 모바일 앱
- Push Notification
- AI 상담
- AI 추천
- 후기
- 별점
- 커뮤니티
- 학교 랭킹
- 결제
- Premium Subscription
- 입학 컨설팅
- 입학 대행
- 직접 상품 판매
- 자체 캠프 운영
- 자체 교육 프로그램 운영
- 광고주 Dashboard
- Lead Marketplace
- 캠프 DB
- 방과후 DB
- 전국 Coverage
- 완전자동 Crawling
- 복잡한 Admin 권한/승인 Workflow

이 기능들은 제품 방향에서 영구 제외된 것이 아니라 **MVP Validation 이전에는 구현하지 않는 항목**이다. 단, One Pager에서 명시적으로 프레피의 역할과 맞지 않는 추천·랭킹·입학 대행 등은 장기적으로도 제품 원칙과 충돌할 수 있으므로 별도 제품 결정 없이는 자동으로 확장 범위에 포함하지 않는다.

---

# 24. Expansion Gate

다음 조건을 넘기기 전 캠프·방과후·AI·광고 플랫폼 등으로 기능 범위를 확장하지 않는다.

```text
Active Monitoring Parents ≥ 100
Detail → Follow ≥ 10%
Average Follow ≥ 2
Email Open ≥ 45%
14-Day Returning ≥ 25%
Organic AMP 지속 증가
```

확장 전 기본 원칙은 **신규 기능 추가보다 Traffic → Institution → Follow → Monitoring → Email → Return Funnel 최적화**다.

---

# 25. Long-term Product Direction

프레피는 모든 프리미엄 교육영역을 한 번에 구현하지 않는다.

## Phase 1 — Admissions

영유·사립초·국제학교 중심:

- 기관 탐색
- 비교
- 입학 일정
- Follow
- Monitoring
- Email Update

현재 MVP는 Phase 1에 해당한다.

## Phase 2 — School Intelligence

교육기관 판단에 필요한 정보를 강화한다.

예:

- 학비
- 통학
- Eligibility
- Curriculum
- 입학절차
- 비교정보

## Phase 3 — Education Opportunities

학교 정보와 별개의 병렬 영역으로 다음 교육기회를 확장한다.

- 방과후
- 캠프
- 예체능
- 체험
- 해외 교육 프로그램

중요한 원칙:

**Education Opportunities는 영유·사립초·국제학교 이후에 오는 순차 단계가 아니다.**

아이의 현재 교육환경과 병행해 선택하는 별도 교육기회다.

## Phase 4 — Personal Education Intelligence

회원의:

- 자녀 연령
- 지역
- 관심기관
- 관심 교육유형
- 행동 데이터

를 기반으로 현재 관심을 가질 만한 교육기관과 교육기회를 더 쉽게 발견하도록 개인화한다.

---

# 26. Long-term Business Asset Requirements

One Pager에서 정의된 장기 Moat는 다음과 같다.

## 26.1 Structured Premium Education Database

영유·사립초·국제학교 정보를 동일한 기준으로 구조화한다.

## 26.2 Historical Admission Data

설명회, 모집, 원서접수, 학비, 변경 이력이 매년 축적된다.

## 26.3 Parent Education Intent Data

자녀 연령, 지역, 관심기관, 이용 행동을 통해 실제 교육 수요가 축적된다.

## 26.4 Trust & Editorial Authority

정보 정확성, 최신성, 구조화 방식 자체가 반복 방문 이유가 된다.

## 26.5 Monitoring Relationship

사용자가 정보 확인 업무를 프레피에 맡기면서 일회성 검색보다 지속적인 관계가 형성된다.

## 26.6 Audience Quality

영유·사립초·국제학교 카테고리 자체가 프리미엄 교육 소비층을 자연스럽게 선별한다.

Architecture와 Data Model은 MVP를 작게 구현하더라도 위 자산을 나중에 형성할 수 없게 만드는 구조를 피해야 한다.

---

# 27. Long-term Monetization Direction

MVP의 핵심 목표는 수익화가 아니라 Product Validation이다.

One Pager에서 정의된 장기 수익모델은 다음과 같다.

1. Premium Contextual Advertising
2. Intent-based Advertising
3. Lead Generation
4. Sponsored Advertising Content
5. Partner / Affiliate Referral
6. Premium Education Market Intelligence

기본 원칙:

- 핵심 정보와 회원 기능은 무료 제공
- 회원 개인정보 자체를 광고주에게 판매하지 않음
- Intent-based 광고는 프레피 내부 타기팅으로 운영
- Lead Generation은 사용자 명시적 동의를 전제로 함
- Sponsored Content는 광고 관계를 명확하게 표시
- 프레피가 광고주를 추천하거나 품질을 보증하는 방식으로 운영하지 않음

MVP Architecture에서 이 수익모델 전체를 구현할 필요는 없다.

다만 핵심 Product Analytics와 Intent Data를 나중에 활용할 수 없도록 구조를 막아서는 안 된다.

---

# 28. Brand & Product Principles

프레피는 다음 이미지와 경험을 지향한다.

**Premium · Editorial · Calm · Trustworthy · Intelligent · Selective · Modern**

제품 원칙:

1. 정보가 많기 때문에 가치 있는 서비스가 되어서는 안 된다.
2. 중요한 정보를 정확하고 최신 상태로 정리하기 때문에 가치 있어야 한다.
3. 특정 학교나 업체를 임의로 추천하지 않는다.
4. 학교 랭킹을 핵심 가치로 만들지 않는다.
5. 정보와 비교 기준을 제공하고 최종 판단은 부모가 한다.
6. 사용자의 경제력을 제품 카피에서 직접 강조하지 않는다.
7. 프리미엄 교육 카테고리 자체로 타깃을 자연스럽게 선별한다.
8. 공식 Source와 Last Verified를 통해 신뢰를 구축한다.
9. 사용자에게 Monitoring을 맡겼다는 상태를 명확하게 보여준다.
10. 정보 탐색보다 반복적인 정보 확인 업무를 위임하는 경험을 핵심 차별점으로 만든다.

---

# 29. Current Technical Baseline

MVP 문서에 현재 기술 원칙으로 정의된 구성은 다음과 같다.

```text
Next.js
PostgreSQL
Kakao OAuth
Email
Tiptap / HTML Editor
GA4
Google Search Console
```

추가 기술 원칙:

- Manual로 검증 가능한 운영은 먼저 Manual로 처리한다.
- 수요가 확인된 후 자동화한다.
- SSR / SSG / ISR 기반으로 검색엔진이 최초 HTML에서 핵심 콘텐츠를 읽을 수 있게 한다.
- Editorial HTML은 저장 전 Sanitizing한다.
- Draft / Preview는 noindex 처리한다.

### Architecture Audit 시 해석 원칙

이 섹션은 **현재 MVP의 구현 선호 및 기술 기준**을 기록한 것이다.

`Next.js + PostgreSQL` 등 특정 구현 선택은 Product Definition, Product Loop, Domain, Trust, Monitoring, SEO, Analytics 요구사항보다 상위의 제품 불변조건으로 취급하지 않는다.

기존 Codex Architecture Audit에서 다음을 구분한다.

- 제품 요구사항상 반드시 유지해야 하는 조건
- 현재 기술선택이라 유지 가치가 높은 조건
- 기존 설계와 새 요구사항의 충돌로 재검토가 필요한 조건

단, 기술 변경이 발생하더라도 MVP Scope와 Validation Goal을 훼손해서는 안 된다.

---

# 30. Architecture Constraints Derived from Product Requirements

> **주의:** 이 섹션은 One Pager와 MVP에 정의된 요구사항으로부터 도출한 Architecture-facing constraints다. 새로운 사용자 기능을 추가하는 요구사항이 아니라, 이후 Architecture 설계 시 지켜야 할 제품 정합성 조건이다.

## 30.1 MVP First

확장 가능성을 이유로 MVP Non-Scope 기능을 선행 구현하지 않는다.

## 30.2 Domain Preservation

다음 핵심 개념은 Architecture에서 소실되거나 하나의 범용 테이블/필드로 뭉개져 제품 의미가 사라지지 않아야 한다.

```text
Institution
Opportunity
Source
User
Follow
Notification
Article
```

특히 `Opportunity`는 핵심 도메인이다.

## 30.3 Monitoring Must Remain Replaceable

MVP Monitoring은 Manual 운영이지만, 사용자 관점의 Product Flow는 운영방식과 분리되어야 한다.

즉 사용자는:

```text
Follow
→ Monitoring
→ Update
→ Notification
```

을 경험해야 하며, 내부 확인 방식이 Manual인지 향후 자동화인지에 따라 Product Contract가 깨져서는 안 된다.

## 30.4 Trust Must Be First-class

공식 Source와 Last Verified는 부가 메모가 아니라 제품 가치의 핵심이다.

Architecture와 Data Model은 해당 정보를 일관되게 저장하고 사용자에게 노출할 수 있어야 한다.

## 30.5 Historical Asset Must Not Be Blocked

장기 Moat로 Historical Admission Data가 명시되어 있으므로, MVP 구현이 향후 모집·입학정보와 변경 이력을 축적하는 것을 구조적으로 불가능하게 만들어서는 안 된다.

MVP에서 완전한 History System을 구현해야 한다는 의미는 아니다.

## 30.6 Intent Asset Must Not Be Blocked

MVP Analytics는 Funnel 검증이 우선이다.

다만 장기적으로 Parent Education Intent Data를 형성할 수 있도록 핵심 행동과 객체 식별자가 추적 가능해야 한다.

## 30.7 Education Opportunities Are Parallel Future Domain

향후 캠프·방과후·예체능·체험·해외 프로그램을 현재 Institution 입학 과정의 하위 단계로 모델링해서는 안 된다.

One Pager에서 이 영역은 학교 선택과 병렬적으로 확장되는 별도 교육기회 영역으로 정의되어 있다.

## 30.8 Channel-specific MVP, Product-level Flexibility

MVP Notification 채널은 Email이고 Authentication 방식은 Kakao다.

Architecture는 MVP에서 다른 채널이나 로그인 방식을 구현할 필요가 없지만, 제품 핵심 개념 자체를 `Email` 또는 `Kakao`와 동일시하여 향후 제품확장을 막는 구조는 피한다.

## 30.9 SEO Is a Product Capability

Article / Institution / Opportunity는 단순 Client UI가 아니라 검색 유입 가능한 Public Content Asset이다.

SEO 요구사항은 출시 직전 부가기능이 아니라 Public Architecture의 일부로 취급한다.

## 30.10 Admin Is Core MVP Infrastructure

MVP가 Manual Verification을 사용하므로 Admin은 부가 Backoffice가 아니라 Monitoring Product Loop를 실제로 작동시키는 핵심 운영 인프라다.

---

# 31. MVP Definition of Done

다음 End-to-End Loop가 처음부터 끝까지 실제로 작동하면 MVP 개발이 완료된 것으로 본다.

```text
Google / Naver 검색
→ Article / Institution 유입
→ Institution / Opportunity 탐색
→ Follow
→ Kakao 가입
→ My Preppy
→ 프레피 Monitoring
→ 모집·입학정보 Update
→ Email
→ Return
```

개별 화면이 모두 만들어졌는지가 아니라 **이 Loop가 실제 사용자 기준으로 끊김 없이 작동하는지**가 Definition of Done이다.

---

# 32. Architecture Audit Decision Framework

기존 Codex Architecture는 이 Baseline을 기준으로 각 설계 항목을 다음 세 가지로 판정한다.

## KEEP

현재 One Pager, MVP, 장기 확장 방향과 정합하며 재설계 이득이 적다.

## MODIFY

핵심 구조는 활용할 수 있으나 현재 제품 Requirement 또는 확장 방향을 충족하기 위해 수정이 필요하다.

## REPLACE

이전 AdmissionRadar 가정 또는 현재 프레피의 Product Contract와 충돌하여 유지 비용보다 재설계 가치가 높다.

Architecture Audit 시 최소한 다음 질문에 답해야 한다.

1. Product Loop를 지원하는가?
2. Opportunity가 독립적인 핵심 Domain으로 표현되는가?
3. Source / Last Verified / 변경정보를 제품 수준에서 지원할 수 있는가?
4. Manual Monitoring MVP를 복잡하지 않게 구현할 수 있는가?
5. 향후 Monitoring 자동화가 현재 Product Flow를 깨지 않고 가능할 수 있는가?
6. Follow가 User와 Institution의 핵심 관계로 표현되는가?
7. Notification이 MVP Email Flow를 안정적으로 지원하는가?
8. Editorial CMS와 SEO가 Acquisition Engine으로 동작할 수 있는가?
9. Product Analytics와 Active Monitoring Parents를 정확히 측정할 수 있는가?
10. Historical Admission Data 축적 가능성을 막고 있지 않은가?
11. Parent Education Intent Data 형성 가능성을 막고 있지 않은가?
12. 향후 Education Opportunities가 학교의 순차 하위단계로 강제되지 않는가?
13. MVP Non-Scope를 불필요하게 선행 구현하고 있지 않은가?
14. Admin Manual Operation을 실제 운영 가능한 수준으로 지원하는가?
15. MVP Definition of Done의 End-to-End Loop를 구현할 수 있는가?

---

# 33. Source of Truth Priority

향후 문서 간 해석이 충돌할 경우 다음 기준을 사용한다.

1. 최신의 명시적 Product Decision
2. One Pager의 Product Definition / Market / Long-term Direction
3. MVP의 Scope / Validation / Definition of Done
4. 이 Product Requirements Baseline
5. 상세 PRD
6. Target Architecture
7. 기존 Architecture
8. 기존 구현 코드

단, 이 Baseline은 One Pager와 MVP를 대체하지 않는다.

One Pager와 MVP의 제품결정을 Architecture와 PRD가 일관되게 참조할 수 있도록 정규화한 문서다.

---

# 34. Baseline Summary

프레피 MVP의 핵심은 학교 DB를 많이 만드는 것이 아니다.

핵심 시스템은 다음 세 Engine이 하나의 Loop로 연결되는 것이다.

```text
Editorial CMS
= Organic Acquisition Engine

Institution + Opportunity + Source
= Discovery / Comparison / Trust Engine

Follow + Monitoring + Notification
= Activation / Retention Engine
```

그리고 전체 Product Loop는 다음과 같다.

```text
Traffic
→ Discover
→ Compare
→ Follow
→ Monitor
→ Update
→ Return
```

MVP의 최우선 검증 대상은:

> **부모가 중요한 입학정보를 직접 찾아다니는 대신 프레피에게 지속적인 확인을 맡기는가**

이다.

장기적으로 프레피는 Admissions를 시작점으로 School Intelligence, Education Opportunities, Personal Education Intelligence까지 확장한다.

Architecture의 목표는 이 장기 방향을 막지 않는 것이다.

그러나 Implementation의 목표는 **현재 MVP Validation에 필요한 최소 범위를 가장 빠르게 완성하는 것**이다.

따라서 이후 모든 설계에서 다음 원칙을 유지한다.

> **Architecture for Extension. Implementation for Validation.**

확장 기능을 지금 만드는 것이 아니라, 검증된 기능을 나중에 확장할 때 핵심 Product Domain을 불필요하게 다시 뜯어고치지 않는 구조를 만든다.
