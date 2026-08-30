# PREPPY 41-SCHOOL BROWSER RE-AUDIT

## 결론 정정

2026-08-30 브라우저/Playwright 재조사 결과, 종전 `MVP PASS`를 **수집 완성도·데이터 정확성 판정으로 사용하지 않는다**. 41개 저장 성공과 공식 자료 조사 완료는 다른 조건이다.

- 41개 학교의 공식 진입 경로·입학 메뉴·관련 게시판·본문 이미지 또는 연결된 문서를 실제 브라우저로 조사했다.
- 입학 관련 공식 자료 발견: **41/41**.
- 원서접수 기간 직접 확인: **40/41**. 그중 모집학년도까지 대조한 학교 **38**, 접수일은 확인했으나 학년도 명시자료 추가 대조가 필요한 학교 **2(금성·성동)**.
- 소화초: **2026학년도 추첨 일정 확인**, 최초 원서접수 기간 미확인. 추첨일을 접수일·설명회로 바꾸지 않는다.
- 학년도 확인: 2027학년도 **5**, 2026학년도 **34**(소화의 추첨 공고 포함), 학년도 보류 **2**.
- 기존 Production audit에서 NOT_FOUND였던 **22개 모두** 이번 조사에서 입학 관련 공식 자료가 발견됐다. 이 비교는 기존 audit 시점 2026-08-30T13:13:28.644Z 기준이다.
- **모든 전형 조항·모든 게시글의 검수가 끝났다는 의미는 아니다.** 학교별 미검수 면·세부조건은 아래에 명시한다. 41/41 full-detail PASS 선언 금지.
- 이번 작업에서 Production 수정 **없음**. 동광 Production UI는 2026-08-30T14:03:18.872Z에도 학년도 미확인/입학 관련 정보 미발견이었다. 수집 누락 수정·재공개는 완료되지 않았다.

이 보고서는 진단 기록이며 Production apply용 artifact가 아니다. 브라우저 조사시각을 collector collectedAt 또는 operator verifiedAt으로 사용하지 않는다. 과거 DB UUID와 이번 브라우저 원문을 한 실행의 새 provenance chain처럼 연결하지 않는다.

## 실제 누락 원인

1. `discovery.server.ts`는 일부 후보 URL 실패를 warning으로 남기고, 확보한 페이지로 입학 후보 선택을 계속한다. 이는 registry baseline 보존에는 맞지만, 읽지 못한 입학 페이지의 내용을 확인했다는 뜻은 아니다.
2. `admission-extractor.ts:45`의 `selectCurrentAdmissionProposal`은 전달된 페이지를 ADMISSIONS/OPEN_HOUSE로 추출하고 연도·상태 점수로 선택한다. `live-admissions/extractor.ts`는 날짜나 명시적 미발표 문구를 못 찾으면 NOT_FOUND를 만든다. 메뉴/루트 텍스트만 읽었거나 관련 페이지가 차단된 경우도 여기에 들어간다.
3. 이미지 모집요강, 게시판 2페이지(우촌), 별도 공식 입학처(PDF: 중앙기독), 학교가 연결한 외부 접수 시스템(심석)을 충분히 검수하지 않았다.
4. 기존 artifact 승인 후 `persistence.server.ts`가 해당 후보를 PUBLISHED Opportunity + VERIFIED Version으로 저장했다. 체크섬과 DB chain의 일관성은 **내용의 충분한 검수**를 대신하지 못했다. 운영자 검수를 했다고 판정한 종전 보고가 부적절했다.
5. 일부 Fact는 실제 비용·노선이 아니라 메뉴 제목 모음이었다. 원문에 비용/자격이 있는데도 그 정보를 확보했다고 보기 어려웠다.

robots/2 MiB/인증 정책을 변경하거나 collector를 우회시키지 않았다. 이번 결과는 사용자가 요청한 공개 브라우저 화면 조사다. 이전 collector의 ROBOTS_BLOCKED/RESPONSE_TOO_LARGE/ROBOTS_UNAVAILABLE를 정보 부재로 재해석하지 않는다. 로그인·신청서 제출·학생 명단 조회는 수행하지 않았다.

## 동광초 반례

- 공식 [신입생 모집 안내](https://donggwang.sen.es.kr/161542/subMenu.do)의 본문 이미지: **2027학년도 신입생 모집 전형 요강(안)**.
- 접수: **2026-11-06 09:00 ~ 2026-11-11 16:30 KST**.
- 대상: 2020년 출생 적령아동, 유예/조기입학 포함. 84명(3학급), 서울 및 통학 가능한 수도권.
- 설명회: 2026-10-31 10:00 / 14:00. 사전예약 2026-10-01 시작.
- 상단 포털 배너의 2025년 접수일은 이 모집요강의 접수일이 아니다. `(안)` 한정 표현도 보존해야 한다.
- 기존 적용 artifact는 /161542/subMenu.do에 대한 ROBOTS_BLOCKED warning을 가지고 있으며, 실제 입학 내용 대신 루트 페이지 기반 NOT_FOUND를 남겼다.
- 기존 DB 비교: Opportunity `a3ea08e5-dc3a-4376-95d9-fcc331e5a487`, Version `6acd14b0-74f5-43ee-839d-976c68758c1c`, Evidence `7e66e6b0-4e83-41fa-b2ba-e2a913e963fd`. 이 ID는 **기존 잘못된 NOT_FOUND의 이력**이며, 위 2027 원문의 신규 Evidence ID가 아니다.

## 41개 조사표

날짜는 원문 KST 기준. 2026학년도 자료의 2025년 접수일을 2026/2027년으로 변환하지 않는다. 과거 접수일 확인과 현재 접수중이라는 판단은 구분한다. 2027 자료 5개도 모든 학교의 최신 공고를 완전히 소진해 검색했다는 보장은 아니다.

| 학교/slug | 원문 학년도 | 실제 확인 일정 | 종전 Production audit | 공식 근거 |
| --- | --- | --- | --- | --- |
| 동광초등학교 (`donggwang`) | 2027 | 2026-11-06 09:00–2026-11-11 16:30 KST | NOT_FOUND | [공식 원문](<https://donggwang.sen.es.kr/161542/subMenu.do>) |
| 계성초등학교 (`gyeseong1882`) | 2026 | 2025-11-07 09:00–2025-11-12 16:30 KST | NOT_FOUND | [공식 원문](<https://www.gyeseong1882.es.kr/bbs/view.html?category=info_enter2&header=&seq=2729687&tpage=1>) |
| 중앙대학교사범대학부속초등학교 (`cau`) | 2026 | 2025-11-07 09:00–2025-11-12 16:30 KST | NOT_FOUND | [공식 원문](<https://cau.sen.es.kr/122768/subMenu.do>) |
| 청원초등학교 (`cheongwon`) | 2026 | 2025-11-07 09:00–2025-11-12 16:30 KST | NOT_FOUND | [공식 원문](<https://cheongwon.sen.es.kr/149044/subMenu.do>) |
| 충암초등학교 (`choongam`) | 2026 | 2025-11-07 09:00–2025-11-12 16:30 KST | 입학 레코드 없음 | [공식 원문](<https://choongam.sen.es.kr/184618/subMenu.do>) |
| 추계초등학교 (`chugye`) | 2026 | 2025-11-07 09:00–2025-11-12 16:30 KST | 입학 레코드 없음 | [공식 원문](<https://chugye.sen.es.kr/97974/subMenu.do>) |
| 대광초등학교 (`daegwang`) | 2026 | 2025-11-07 09:00–2025-11-12 16:30 KST | 입학 레코드 없음 | [공식 원문](<https://daegwang.sen.es.kr/207100/subMenu.do>) |
| 동북초등학교 (`dongbuk`) | 2026 | 2025-11-07 09:00–2025-11-12 16:30 KST | 입학 레코드 없음 | [공식 원문](<https://dongbuk.sen.es.kr/212562/subMenu.do>) |
| 은석초등학교 (`eunseok`) | 2026 | 2025-11-07 09:00–2025-11-12 16:30 KST | 입학 레코드 없음 | [공식 원문](<https://eunseok.sen.es.kr/135105/subMenu.do>) |
| 이화여자대학교사범대학부속초등학교 (`ewha`) | 2026 | 2025-11-07 09:00–2025-11-12 16:30 KST | NOT_FOUND | [공식 원문](<https://ewha.sen.es.kr/198674/subMenu.do>) |
| 홍익대학교사범대학부속초등학교 (`hongik`) | 2026 | 2025-11-07 09:00–2025-11-12 16:30 KST | NOT_FOUND | [공식 원문](<https://hongik.sen.es.kr/199027/subMenu.do>) |
| 화랑초등학교 (`hwarang-s`) | 2027 | 2026-11-06 09:00–2026-11-11 16:30 KST | NOT_FOUND | [공식 원문](<https://hwarang-s.sen.es.kr/206940/subMenu.do>) |
| 한양초등학교 (`hye`) | 2026 | 2025-11-07 09:00–2025-11-12 16:30 KST | 입학 레코드 없음 | [공식 원문](<https://www.hye.or.kr/?c=A1000/A2400/A2401>) |
| 한신초등학교 (`ihansin`) | 2026 | 2025-11-07 09:00–2025-11-12 16:30 KST | 입학 레코드 없음 | [공식 원문](<https://ihansin.sen.es.kr/190105/subMenu.do>) |
| 금성초등학교 (`kumsung`) | 미확인 | 2025-11-07 09:00–2025-11-12 16:30 KST | 입학 레코드 없음 | [공식 원문](<https://www.kumsung.net/bbs/content.php?co_id=1_11_4>) |
| 광운초등학교 (`kwangwoon`) | 2027 | 2026-11-06 09:00–2026-11-11 16:30 KST | NOT_FOUND | [공식 원문](<https://kwangwoon.sen.es.kr/209624/subMenu.do>) |
| 경기초등학교 (`kyonggi`) | 2026 | 2025-11-07 09:00–2025-11-12 16:30 KST | NOT_FOUND | [공식 원문](<https://kyonggi.sen.es.kr/212349/subMenu.do>) |
| 경희초등학교 (`kyunghee`) | 2026 | 2025-11-07 09:00–2025-11-12 16:30 KST | 입학 레코드 없음 | [공식 원문](<https://kyunghee.sen.es.kr/198502/subMenu.do>) |
| 매원초등학교 (`maewon`) | 2026 | 2025-11-07 09:00–2025-11-12 16:30 KST | 입학 레코드 없음 | [공식 원문](<https://maewon.sen.es.kr/153574/subMenu.do>) |
| 상명대학교사범대학부속초등학교 (`sangmyung-ae`) | 2026 | 2025-11-07 09:00–2025-11-12 16:30 KST | 입학 레코드 없음 | [공식 원문](<https://sangmyung-ae.sen.es.kr/207241/subMenu.do>) |
| 세종초등학교 (`sejong`) | 2026 | 2025-11-07 09:00–2025-11-12 16:30 KST | 입학 레코드 없음 | [공식 원문](<https://sejong.sen.es.kr/199575/subMenu.do>) |
| 동산초등학교 (`seoul-dongsan`) | 2026 | 2025-11-07 09:00–2025-11-12 16:30 KST | NOT_FOUND | [공식 원문](<https://seoul-dongsan.sen.es.kr/46786/subMenu.do>) |
| 서울삼육초등학교 (`seoul36`) | 2026 | 2025-11-07 09:00–2025-11-12 16:30 KST | 입학 레코드 없음 | [공식 원문](<https://seoul36.sen.es.kr/206924/subMenu.do>) |
| 심석초등학교 (`simseok-e`) | 2026 | 일반:2025-11-17 09:00–2025-11-25 17:00 KST;특별:11-10 09:00–11-12 17:00 | NOT_FOUND | [공식 원문](<http://mysimes.cafe24.com/mjon/newbie/index.php>) |
| 신광초등학교 (`skes`) | 2026 | 2025-11-07 09:00–2025-11-12 16:30 KST | NOT_FOUND | [공식 원문](<https://skes.sen.es.kr/214345/subMenu.do>) |
| 상명초등학교 (`smcho`) | 2026 | 2025-11-07 09:00–2025-11-12 16:30 KST | NOT_FOUND | [공식 원문](<https://smcho.sen.es.kr/84314/subMenu.do>) |
| 소화초등학교 (`sohwa-e`) | 2026 | 추첨: 2025-11-12 15:00 본교강당;결과17:00; 접수일 미확인 | NOT_FOUND | [공식 원문](<https://sohwa-e.goesw.kr/sohwa-e/na/ntt/selectNttInfo.do?mi=18035&bbsId=10521&nttSn=124421>) |
| 숭의초등학교 (`soongeui`) | 2026 | 2025-11-07 09:00–2025-11-12 16:30 KST | 입학 레코드 없음 | [공식 원문](<https://soongeui.sen.es.kr/176862/subMenu.do>) |
| 성동초등학교 (`sungdong`) | 미확인 | 2025-11-07 09:00–2025-11-12 16:30 KST | 입학 레코드 없음 | [공식 원문](<https://sungdong.sen.es.kr/162373/subMenu.do>) |
| 성신초등학교 (`sungshin`) | 2026 | 2025-11-07 09:00–2025-11-12 16:30 KST | NOT_FOUND | [공식 원문](<https://sungshin.sen.es.kr/198368/subMenu.do>) |
| 선일초등학교 (`sunil`) | 2026 | 2025-11-07 09:00–2025-11-12 16:30 KST | NOT_FOUND | [공식 원문](<https://sunil.sen.es.kr/183573/subMenu.do>) |
| 중앙기독초등학교 (`suwoncca`) | 2027 | 일반(추첨):2026-10-09–2026-10-21;09:00–17:00(수요일16:00마감) | NOT_FOUND | [공식 원문](<https://admission.suwoncca.org/content/es_infor>) |
| 태강삼육초등학교 (`taegang`) | 2026 | 2025-11-07 09:00–2025-11-12 16:30 KST | NOT_FOUND | [공식 원문](<https://taegang.sen.es.kr/175148/subMenu.do>) |
| 우촌초등학교 (`uchon`) | 2026 | 2025-11-07 09:00–2025-11-12 16:30 KST | NOT_FOUND | [공식 원문](<https://uchon.sen.es.kr/183353/subMenu.do>) |
| 운현초등학교 (`unhyun`) | 2026 | 2025-11-07 09:00–2025-11-12 16:30 KST | NOT_FOUND | [공식 원문](<https://unhyun.sen.es.kr/104922/subMenu.do>) |
| 예일초등학교 (`yale`) | 2026 | 2025-11-07 09:00–2025-11-12 16:30 KST | NOT_FOUND | [공식 원문](<https://yale.sen.es.kr/189272/subMenu.do>) |
| 유석초등학교 (`yooseok`) | 2026 | 2025-11-07 09:00–2025-11-12 16:30 KST | NOT_FOUND | [공식 원문](<https://yooseok.sen.es.kr/120146/subMenu.do>) |
| 리라초등학교 (`lila`) | 2027 | 2026-11-06 09:00–2026-11-11 16:30 KST | SCHEDULE_FOUND | [공식 원문](<https://www.lila.es.kr/kr/about/admission_guide.php>) |
| 경복초등학교 (`kbes`) | 2026 | 2025-11-07 09:00–2025-11-12 16:30 KST | SCHEDULE_FOUND | [공식 원문](<https://www.kbes.kr/bbs/content.php?co_id=1_3>) |
| 명지초등학교 (`myongji`) | 2026 | 2025-11-07 09:00–2025-11-12 16:30 KST | SCHEDULE_FOUND | [공식 원문](<http://www.myongji.net/subpage.php?p=m24>) |
| 영훈초등학교 (`younghoon`) | 2026 | 2025-11-07 09:00–2025-11-12 16:30 KST | SCHEDULE_FOUND | [공식 원문](<http://www.younghoon.es.kr/younghoon_e/admission/typical-syllabus.do>) |

## 학교별 근거와 검수 한계

표의 모집대상은 요약이다. 특별전형, 거주 기준일, 조기입학, 쌍둥이 등 예외 조건을 생략한 요약을 완전한 지원자격으로 게시해서는 안 된다. 링크된 모든 첨부파일을 읽었다는 의미는 아니며, 검수한 범위는 각 항목에 기록한다.

### 동광초등학교 — donggwang

- Institution ID (기존 inventory): `301c71ed-7d55-591a-9499-a66332a9a783`
- 조사 분류: `SCHEDULE_CONFIRMED_IMAGE`
- 공식 페이지: [원문](<https://donggwang.sen.es.kr/161542/subMenu.do>)
- 직접 확인한 이미지: [이미지 원문](<https://donggwang.sen.es.kr/crosseditor/binary/images/008169/donggwang_new_2026.png>)
- 모집대상 요약: 2020-01-01–2020-12-31 출생, 유예·조기입학 포함
- 설명회/예약: 2026-10-31 10:00 / 14:00; 예약 2026-10-01 시작
- 검수 범위 및 주의: 모집요강(안); 본문 PNG 직접 시각 확인. 상단 2025 포털 배너와 구분

### 계성초등학교 — gyeseong1882

- Institution ID (기존 inventory): `fe7b3e2f-e401-5ec8-9e97-c0d8182cfd53`
- 조사 분류: `SCHEDULE_CONFIRMED_IMAGE`
- 공식 페이지: [원문](<https://www.gyeseong1882.es.kr/bbs/view.html?category=info_enter2&header=&seq=2729687&tpage=1>)
- 연결된 문서: [공식 첨부/뷰어](<https://www.gyeseong1882.es.kr/bbs/download.html?seq=2699999>)
- 모집대상 요약: 2019년 출생; 2025-11-06 현재 서울 주민등록·실거주; 96명
- 검수 범위 및 주의: 본문 이미지 2면 확인; 별도 설명회 미실시. 2025년 기준 1기 수업료 2,488,000원, 2026 변동 가능

### 중앙대학교사범대학부속초등학교 — cau

- Institution ID (기존 inventory): `1968cc29-a427-54e6-9326-6750e711d27a`
- 조사 분류: `SCHEDULE_CONFIRMED_TEXT`
- 공식 페이지: [원문](<https://cau.sen.es.kr/122768/subMenu.do>)
- 모집대상 요약: 2019년 출생, 유예·조기입학 포함; 120명
- 검수 범위 및 주의: 별도 신입생 설명회 없음; 2025학년도 기준 분기 수업료 2,220,500원, 버스 학기 920,000원; 2026 변동 가능

### 청원초등학교 — cheongwon

- Institution ID (기존 inventory): `98064bab-136b-5320-b7a4-894ff3e767fc`
- 조사 분류: `SCHEDULE_CONFIRMED_IMAGE`
- 공식 페이지: [원문](<https://cheongwon.sen.es.kr/149044/subMenu.do>)
- 모집대상 요약: 2019년 출생;120명;서울·통학가능수도권
- 검수 범위 및 주의: 모집요강 3면 확인;2025기준 분기 수업료1,780,000원;2026변동가능

### 충암초등학교 — choongam

- Institution ID (기존 inventory): `6f6df02f-3bf9-5cdb-bf2d-80353a0ee646`
- 조사 분류: `SCHEDULE_CONFIRMED_IMAGE`
- 공식 페이지: [원문](<https://choongam.sen.es.kr/184618/subMenu.do>)
- 모집대상 요약: 2019년 출생;112명
- 검수 범위 및 주의: 이미지 모집요강; 작은 글씨 기타 세부사항 추가 원본 검수 필요

### 추계초등학교 — chugye

- Institution ID (기존 inventory): `7bd27832-3120-5335-acb1-b3ebc6c09707`
- 조사 분류: `SCHEDULE_CONFIRMED_IMAGE`
- 공식 페이지: [원문](<https://chugye.sen.es.kr/97974/subMenu.do>)
- 검수 범위 및 주의: 원본 확대 후 제목/접수일 실제 시각검수. 기타 전형 세부조건은 별도 검수 필요

### 대광초등학교 — daegwang

- Institution ID (기존 inventory): `4902ef41-0b2a-55f0-8e9b-2602e9fdd702`
- 조사 분류: `SCHEDULE_CONFIRMED_IMAGE`
- 공식 페이지: [원문](<https://daegwang.sen.es.kr/207100/subMenu.do>)
- 모집대상 요약: 2019년 출생;서울 거주;84명
- 검수 범위 및 주의: 본문 1면 날짜 확인;하단/2면 기타 조항 추가 확인 필요

### 동북초등학교 — dongbuk

- Institution ID (기존 inventory): `442d7449-7fbd-5f94-a3cf-68895897b1bd`
- 조사 분류: `SCHEDULE_CONFIRMED_IMAGE`
- 공식 페이지: [원문](<https://dongbuk.sen.es.kr/212562/subMenu.do>)
- 검수 범위 및 주의: 공식 이미지 제목2026 및 본문 접수일 확인;128명;기타 조항 확대 검수 필요

### 은석초등학교 — eunseok

- Institution ID (기존 inventory): `0af8b3c4-626f-55f5-81ee-ee36800d75d3`
- 조사 분류: `SCHEDULE_CONFIRMED_IMAGE`
- 공식 페이지: [원문](<https://eunseok.sen.es.kr/135105/subMenu.do>)
- 모집대상 요약: 2019년 출생;112명;서울·경기도 통학가능지역
- 검수 범위 및 주의: 본문 1면 시각 확인;2면 기타 조항 추가 확인 필요

### 이화여자대학교사범대학부속초등학교 — ewha

- Institution ID (기존 inventory): `3df6cf6c-2016-5626-83a4-3c78a87be1fb`
- 조사 분류: `SCHEDULE_CONFIRMED_IMAGE`
- 공식 페이지: [원문](<https://ewha.sen.es.kr/198674/subMenu.do>)
- 직접 확인한 이미지: [이미지 원문](<https://ewha.sen.es.kr/crosseditor/binary/images/006126/2026_신입생_모집_요강_(7).png>)
- 검수 범위 및 주의: 원본 확대 후 제목/접수일 실제 시각검수. 기타 전형 세부조건은 별도 검수 필요

### 홍익대학교사범대학부속초등학교 — hongik

- Institution ID (기존 inventory): `34c9f6bd-b46b-5fcc-aac8-a8cc77d3dc3e`
- 조사 분류: `SCHEDULE_CONFIRMED_TEXT`
- 공식 페이지: [원문](<https://hongik.sen.es.kr/199027/subMenu.do>)
- 모집대상 요약: 2019년 출생;72명;서울 및 근거리 통학가능지역
- 검수 범위 및 주의: 2025학년도 분기 수업료2,703,000원;2026변동가능

### 화랑초등학교 — hwarang-s

- Institution ID (기존 inventory): `bbad0468-6d31-5061-8a48-dcc9acb50167`
- 조사 분류: `SCHEDULE_CONFIRMED_IMAGE`
- 공식 페이지: [원문](<https://hwarang-s.sen.es.kr/206940/subMenu.do>)
- 모집대상 요약: 2020년 출생;96명;서울·경기
- 설명회/예약: 2026-10-22 09:30–11:00;10-24 10:00–11:30;10-28 09:30–11:00;예약10-01 10:00–10-27 16:00
- 검수 범위 및 주의: 모집요강1·2면 직접 시각검수;3면 추가 기타조항 확인 필요

### 한양초등학교 — hye

- Institution ID (기존 inventory): `9e2801d0-2a63-5ef6-8261-55e4cbf02237`
- 조사 분류: `SCHEDULE_CONFIRMED_IMAGE`
- 공식 페이지: [원문](<https://www.hye.or.kr/?c=A1000/A2400/A2401>)
- 모집대상 요약: 2019년 출생;112명;서울·경기
- 검수 범위 및 주의: 모집요강1면 시각검수;추가3면 기타조항 확인 필요. 이전 robots 차단은 정보부재 증거 아님

### 한신초등학교 — ihansin

- Institution ID (기존 inventory): `409f2fe0-f572-5c0f-89ab-9c11cd726424`
- 조사 분류: `SCHEDULE_CONFIRMED_TEXT_AND_IMAGE`
- 공식 페이지: [원문](<https://ihansin.sen.es.kr/190105/subMenu.do>)
- 모집대상 요약: 2019년 출생;112명;서울·경기
- 검수 범위 및 주의: 공식 리플렛 모집안내 2026학년도 제목과 접수일 원본 확대 대조 완료;2025학년도 분기 수업료1,830,000원 기준 보존

### 금성초등학교 — kumsung

- Institution ID (기존 inventory): `9550da3f-04eb-5eee-877d-877491461201`
- 조사 분류: `SCHEDULE_CONFIRMED_TEXT_YEAR_REVIEW_PENDING`
- 공식 페이지: [원문](<https://www.kumsung.net/bbs/content.php?co_id=1_11_4>)
- 교차 근거: [공식 보조자료](<https://www.kumsung.net/bbs/board.php?bo_table=1_11_3&wr_id=3156>)
- 모집대상 요약: 2019년 출생;112명;서울·경기
- 설명회/예약: 2025-10-18 10:00 온라인 설명회
- 검수 범위 및 주의: 접수일/대상 본문 확인. 2026학년도 후속 공고의 서류제출2025-12-10–12-12와 예비소집2026-01-21 14:00 별도 확인. 최초 모집요강의 학년도 제목 직접 확인은 미완료;임의 연도 부여하지 않음.

### 광운초등학교 — kwangwoon

- Institution ID (기존 inventory): `511a74d5-ed4f-5cf8-95c7-25477feffb2c`
- 조사 분류: `SCHEDULE_CONFIRMED_IMAGE`
- 공식 페이지: [원문](<https://kwangwoon.sen.es.kr/209624/subMenu.do>)
- 모집대상 요약: 2020년 출생;112명;취학유예 포함
- 설명회/예약: 2026-10-23 10:00–11:30;10-24 10:00–11:30;10-24 13:00–14:30
- 검수 범위 및 주의: 일정 이미지 확인; 전형요강(안) 별도 하위페이지 추가 검수 필요

### 경기초등학교 — kyonggi

- Institution ID (기존 inventory): `28f80b0a-1ae9-5e7b-81eb-6fd72486452c`
- 조사 분류: `SCHEDULE_CONFIRMED_IMAGE`
- 공식 페이지: [원문](<https://kyonggi.sen.es.kr/212349/subMenu.do>)
- 검수 범위 및 주의: 2025-11-06 수정후 원본 제목·접수일 검수;96명;원서접수일 서울 주민등록

### 경희초등학교 — kyunghee

- Institution ID (기존 inventory): `d4460d1b-cf80-5cb7-b49c-d13557060d1f`
- 조사 분류: `SCHEDULE_CONFIRMED_TEXT`
- 공식 페이지: [원문](<https://kyunghee.sen.es.kr/198502/subMenu.do>)
- 모집대상 요약: 2019년 출생;112명;서울 거주
- 검수 범위 및 주의: 재접속 후 공식 신입생 모집요강 본문 확인. 2026학년도 접수 링크와 공식 브로셔 공고 대조;2025년 분기등록금2,114,430원;2026변동가능. 최초 빈화면은 부재 근거 아님.

### 매원초등학교 — maewon

- Institution ID (기존 inventory): `a65efc5c-8ebc-5fc8-9d2b-88ed461d39a3`
- 조사 분류: `SCHEDULE_CONFIRMED_TEXT`
- 공식 페이지: [원문](<https://maewon.sen.es.kr/153574/subMenu.do>)
- 모집대상 요약: 2019년 출생;84명;서울·통학가능수도권
- 검수 범위 및 주의: 2025학년도 분기 수업료2,151,000원;2026변동가능

### 상명대학교사범대학부속초등학교 — sangmyung-ae

- Institution ID (기존 inventory): `1d459c6d-cd3d-5f2d-98e5-a41e60079404`
- 조사 분류: `SCHEDULE_CONFIRMED_IMAGE`
- 공식 페이지: [원문](<https://sangmyung-ae.sen.es.kr/207241/subMenu.do>)
- 모집대상 요약: 2019년 출생;56명;서울·경기
- 검수 범위 및 주의: 모집요강 이미지 직접 확인;작은 글씨 금액 상세 재확인 필요

### 세종초등학교 — sejong

- Institution ID (기존 inventory): `88f5b382-24e3-5758-bcb9-5f521867413c`
- 조사 분류: `SCHEDULE_CONFIRMED_IMAGE`
- 공식 페이지: [원문](<https://sejong.sen.es.kr/199575/subMenu.do>)
- 모집대상 요약: 2019년 출생;56명
- 검수 범위 및 주의: 전형요강(안) 첫면 실제 검수;56명;나머지 면 별도 검수 필요

### 동산초등학교 — seoul-dongsan

- Institution ID (기존 inventory): `261bd28b-6f4c-54f7-9950-2e7b78f8c291`
- 조사 분류: `SCHEDULE_CONFIRMED_TEXT`
- 공식 페이지: [원문](<https://seoul-dongsan.sen.es.kr/46786/subMenu.do>)
- 모집대상 요약: 2019년 출생;유예·조기입학 포함
- 검수 범위 및 주의: 2025학년도 분기 수업료2,280,000원;2026변동가능

### 서울삼육초등학교 — seoul36

- Institution ID (기존 inventory): `50ad011d-dac6-55a6-9c39-16615a495f9f`
- 조사 분류: `SCHEDULE_CONFIRMED_IMAGE`
- 공식 페이지: [원문](<https://seoul36.sen.es.kr/206924/subMenu.do>)
- 직접 확인한 이미지: [이미지 원문](<https://seoul36.sen.es.kr/crosseditor/binary/images/006047/2026_서울삼육초등학교_신입생_모집_안내.jpg>)
- 검수 범위 및 주의: 공식 모집요강 이미지 원본 확대에서 학년도·접수일을 직접 확인. 전체 조항 검수 완료를 의미하지 않음.

### 심석초등학교 — simseok-e

- Institution ID (기존 inventory): `00718d93-055d-5b90-af48-341166061258`
- 조사 분류: `SCHEDULE_CONFIRMED_TEXT`
- 공식 페이지: [원문](<http://mysimes.cafe24.com/mjon/newbie/index.php>)
- 모집대상 요약: 2019년 출생;90명;통학가능지역
- 검수 범위 및 주의: 본교 홈페이지가 직접 연결한 공식 접수시스템 공개화면. 내부 신입생 게시판0글과 정보부재는 다름. 신청/로그인 하지 않음. 2024부터 오남 버스운행안함 명시.

### 신광초등학교 — skes

- Institution ID (기존 inventory): `030ac9b0-b1f8-5307-9dca-e8fcb8945bb0`
- 조사 분류: `SCHEDULE_CONFIRMED_IMAGE`
- 공식 페이지: [원문](<https://skes.sen.es.kr/214345/subMenu.do>)
- 검수 범위 및 주의: 공식 모집요강 이미지 원본 확대에서 학년도·접수일을 직접 확인. 전체 조항 검수 완료를 의미하지 않음.

### 상명초등학교 — smcho

- Institution ID (기존 inventory): `445bcd41-2388-529a-a51b-74ddd99c7cb7`
- 조사 분류: `SCHEDULE_CONFIRMED_IMAGE`
- 공식 페이지: [원문](<https://smcho.sen.es.kr/84314/subMenu.do>)
- 모집대상 요약: 2019년 출생;120명;서울·경기
- 검수 범위 및 주의: 모집요강 원본 확대하여 제목/접수일/지원대상 직접 검수. 추가 조항 전체 검수를 의미하지 않음.

### 소화초등학교 — sohwa-e

- Institution ID (기존 inventory): `882945e4-f9a1-58a3-aef8-56a09118caab`
- 조사 분류: `LOTTERY_SCHEDULE_CONFIRMED_IMAGE_APPLICATION_UNCONFIRMED`
- 공식 페이지: [원문](<https://sohwa-e.goesw.kr/sohwa-e/na/ntt/selectNttInfo.do?mi=18035&bbsId=10521&nttSn=124421>)
- 검수 범위 및 주의: 2026 일반전형 추첨 공고 이미지 직접 검수. 최초 원서접수일은 미확인;이를 설명회나 원서접수로 변환 금지. 정적2025요강을 current로 사용금지.

### 숭의초등학교 — soongeui

- Institution ID (기존 inventory): `fa8c1bbf-4e79-500d-9109-dafa1a620df0`
- 조사 분류: `SCHEDULE_CONFIRMED_IMAGE`
- 공식 페이지: [원문](<https://soongeui.sen.es.kr/176862/subMenu.do>)
- 모집대상 요약: 2019년 출생;84명;서울 및 통학가능지역
- 검수 범위 및 주의: 최종모집요강 첫면 시각검수;2·3면 추가조항 미검수

### 성동초등학교 — sungdong

- Institution ID (기존 inventory): `10367b3a-a743-57df-9906-c4fb6bfe97d5`
- 조사 분류: `SCHEDULE_CONFIRMED_IMAGE_YEAR_REVIEW_PENDING`
- 공식 페이지: [원문](<https://sungdong.sen.es.kr/162373/subMenu.do>)
- 직접 확인한 이미지: [이미지 원문](<https://sungdong.sen.es.kr/crosseditor/binary/images/006136/1.jpg>)
- 교차 근거: [공식 보조자료](<https://sungdong.sen.es.kr/175401/subMenu.do>)
- 모집대상 요약: 2019년 출생;112명
- 설명회/예약: 2025-10-29 10:00–11:00;2025-11-01 10:00–11:30
- 검수 범위 및 주의: 모집 이미지의 접수일/2019출생 대상과 별도 설명회 이미지 직접 확인. 두 이미지에 모집학년도 제목 없음;학년도 단정 보류.

### 성신초등학교 — sungshin

- Institution ID (기존 inventory): `b7a5ec9e-3447-5822-af34-20f95290e0a8`
- 조사 분류: `SCHEDULE_CONFIRMED_IMAGE`
- 공식 페이지: [원문](<https://sungshin.sen.es.kr/198368/subMenu.do>)
- 모집대상 요약: 2019년 출생;84명;서울·통학가능수도권
- 검수 범위 및 주의: 모집요강1면 확인;나머지2면 기타조항 추가확인 필요

### 선일초등학교 — sunil

- Institution ID (기존 inventory): `3c0f61b7-d66b-56b6-be6e-ba33f99f03f5`
- 조사 분류: `SCHEDULE_CONFIRMED_IMAGE`
- 공식 페이지: [원문](<https://sunil.sen.es.kr/183573/subMenu.do>)
- 직접 확인한 이미지: [이미지 원문](<https://sunil.sen.es.kr/crosseditor/binary/images/006128/new신입생모집안내(2026학년도).jpg>)
- 모집대상 요약: 2019년 출생;84명;서울·경기
- 검수 범위 및 주의: 모집요강 원본 확대하여 제목/접수일/지원대상 직접 검수. 추가 조항 전체 검수를 의미하지 않음.

### 중앙기독초등학교 — suwoncca

- Institution ID (기존 inventory): `b1f15bd1-d338-5444-9e36-98e052fb129c`
- 조사 분류: `SCHEDULE_CONFIRMED_PDF`
- 공식 페이지: [원문](<https://admission.suwoncca.org/content/es_infor>)
- 연결된 문서: [공식 첨부/뷰어](<https://admission.suwoncca.org/plugin/pdf/web/viewer.html?file=/pdf/2027CCAES.pdf>)
- 모집대상 요약: 2020년 출생;우선/일반/특수 전형별 자격 구분;조기입학불가;일반 기독교인 가정 자격 원문 참조
- 설명회/예약: 일반 설명회2026-10-08;우선 설명회2026-03-19
- 검수 범위 및 주의: PDF6페이지 텍스트 직접 확인,5면 시각대조. 우선 서류접수3/19–3/27와 일반접수10/9–10/21 혼동금지;일반추첨10/28 15:00;일정변경가능.

### 태강삼육초등학교 — taegang

- Institution ID (기존 inventory): `dfb38543-f8b0-57df-915f-38e35da21b06`
- 조사 분류: `SCHEDULE_CONFIRMED_IMAGE`
- 공식 페이지: [원문](<https://taegang.sen.es.kr/175148/subMenu.do>)
- 모집대상 요약: 2019년 출생;112명;일반67·특별45;서울·경기
- 검수 범위 및 주의: 모집요강 이미지 확인;일반·특별전형 자격 분리

### 우촌초등학교 — uchon

- Institution ID (기존 inventory): `37de5a08-cbb8-5dec-95d1-faca0a5d8009`
- 조사 분류: `SCHEDULE_CONFIRMED_IMAGE`
- 공식 페이지: [원문](<https://uchon.sen.es.kr/183353/subMenu.do>)
- 직접 확인한 이미지: [이미지 원문](<https://uchon.sen.es.kr/crosseditor/binary/images/006071/모집요강_홈페이지용_2026.jpg>)
- 모집대상 요약: 112명;서울·통학가능경기
- 검수 범위 및 주의: 게시판2페이지 모집요강 원본 확대하여 접수 날짜 실제 확인. 기타면 추가 검수 필요

### 운현초등학교 — unhyun

- Institution ID (기존 inventory): `b1204d52-f578-5601-b066-543e15680e9a`
- 조사 분류: `SCHEDULE_CONFIRMED_IMAGE`
- 공식 페이지: [원문](<https://unhyun.sen.es.kr/104922/subMenu.do>)
- 모집대상 요약: 2019년 출생;28명;서울·경기인접
- 검수 범위 및 주의: 모집요강1면 확인;2면 기타조항 추가확인 필요

### 예일초등학교 — yale

- Institution ID (기존 inventory): `af494821-037e-5730-a54e-809cb7253e41`
- 조사 분류: `SCHEDULE_CONFIRMED_IMAGE`
- 공식 페이지: [원문](<https://yale.sen.es.kr/189272/subMenu.do>)
- 검수 범위 및 주의: 2026 모집요강 페이지의 수정10.23 두번째이미지 접수일 확인;모집대상·기타면 추가검수 필요

### 유석초등학교 — yooseok

- Institution ID (기존 inventory): `d8acf075-8300-516c-94b5-bc485c485b5e`
- 조사 분류: `SCHEDULE_CONFIRMED_IMAGE`
- 공식 페이지: [원문](<https://yooseok.sen.es.kr/120146/subMenu.do>)
- 직접 확인한 이미지: [이미지 원문](<https://yooseok.sen.es.kr/crosseditor/binary/images/006133/2026학년도_유석초등학교_신입생_모집요강001.jpg>)
- 검수 범위 및 주의: 공식 모집요강 이미지 원본 확대에서 학년도·접수일을 직접 확인. 전체 조항 검수 완료를 의미하지 않음.

### 리라초등학교 — lila

- Institution ID (기존 inventory): `9aa75c7b-e7de-55bc-ba67-03201af8cb6e`
- 조사 분류: `SCHEDULE_CONFIRMED_TEXT`
- 공식 페이지: [원문](<https://www.lila.es.kr/kr/about/admission_guide.php>)
- 모집대상 요약: 2020년 출생;서울 거주
- 검수 범위 및 주의: 원문 모집요강(예정) 보존 필요. 수업료2,312,100원=2025학년도1기분;2027변동가능

### 경복초등학교 — kbes

- Institution ID (기존 inventory): `abcb72f0-a6aa-53b1-9104-77d318660f8a`
- 조사 분류: `SCHEDULE_CONFIRMED_TEXT`
- 공식 페이지: [원문](<https://www.kbes.kr/bbs/content.php?co_id=1_3>)
- 모집대상 요약: 2019년 출생;120명;서울
- 검수 범위 및 주의: 2025학년도 기준 월 수업료905,030원;2026변동가능

### 명지초등학교 — myongji

- Institution ID (기존 inventory): `4b732452-6f4b-5f7e-9303-456667250a67`
- 조사 분류: `SCHEDULE_CONFIRMED_TEXT`
- 공식 페이지: [원문](<http://www.myongji.net/subpage.php?p=m24>)
- 모집대상 요약: 2019년 출생;120명
- 검수 범위 및 주의: 2025년 기준 분기 수업료2,085,000원;변동가능

### 영훈초등학교 — younghoon

- Institution ID (기존 inventory): `626f9b01-1855-536f-b7cc-1608ab65eb9b`
- 조사 분류: `SCHEDULE_CONFIRMED_TEXT`
- 공식 페이지: [원문](<http://www.younghoon.es.kr/younghoon_e/admission/typical-syllabus.do>)
- 모집대상 요약: 2019년 출생;유예·조기입학포함
- 검수 범위 및 주의: 2025기준 분기 수업료2,442,000원;2026변동가능

## 수정 시 반드시 보존할 사항

- 확인 실패와 공식 미발표/정보 부재를 구분한다. 읽지 못한 모집요강에 대해 VERIFIED NOT_FOUND를 다시 만들지 않는다.
- 동광·세종 `(안)`, 리라 `(예정)`, 학년도/과거 수업료 기준연도와 변동 가능 문구를 삭제하지 않는다.
- 중앙기독은 일반/우선 전형 날짜가 다르며, 심석은 서울 사립초 공통 접수일과 다르다. 학교별 원문을 따른다.
- 기존 artifact validator는 HTML/PDF evidence 및 실제 collection metadata를 요구한다. 스크린샷/OCR 결과를 HTTP 수집 성공으로 가장하거나 collectedAt/상태코드/content hash를 만들어 통과시키지 않는다.
- 현행 persistence identity는 `live-admissions-<institutionId>-<year|current>`다. 기존 `-current` NOT_FOUND에 2027 artifact만 추가하면 다른 Opportunity가 생기므로, 종전 잘못된 공개 레코드와 함께 남는 문제를 해결해야 한다. 이 보고서 작업에서 임의 삭제/수동 SQL 수정하지 않았다.

## 실행 범위

- Application/schema/migration/collector policy 변경: NO.
- Production DB write / deploy / commit / push: NO (이번 재조사).
- 테스트 재실행: 없음; 코드 변경 없는 진단이며 종전 tests PASS를 내용 검수 PASS로 재사용하지 않는다.
- 저장 내용: bounded 조사 요약, 공식 URL, 기존 공개 기관 ID 및 과거 audit 비교만. 원문 전체 HTML/학생 개인정보/credentials/DB URL 없음.
- Working result: **수집·검수 누락 확인. Production 데이터 수정 미완료.**
