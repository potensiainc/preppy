# PREPPY 서울·경기 국제학교 데이터 파이프라인 — 승인 설계

승인 근거: 2026-09-15 Owner가 공식 학교, 특수 접근 학교, 비인가·대안교육 후보를 분리하는 하이브리드 MVP 구조와 근거별 수집·프로덕션 DB 반입 준비 방향을 “승인”했어요.

## 1. 목표와 완료 상태

서울·경기권에서 국제학교로 검색되는 기관을 빠뜨리지 않고 조사하되, 법적 지위와 근거 수준을 섞지 않아요. 공식 자료와 공개 SNS·커뮤니티·카페·블로그의 접근 결과를 재현 가능한 데이터 파일로 남기고, 검증된 공식 외국인학교만 PREPPY 프로덕션 DB에 안전하게 반입할 수 있는 스냅샷을 준비해요.

이번 설계의 완료 범위는 다음과 같아요.

- 교육부·ISI 기준 운영 중인 서울·경기 외국인학교 22곳을 확정해요.
- 일반 공개 입학이 아닌 특수 접근 학교 7곳을 별도 관리해요.
- 국제학교 명칭을 쓰는 대안교육기관·학원·교육업체·미확인 후보를 조사 대상에 포함하되 공식 학교로 승격하지 않아요.
- 학비, 입학 자격과 절차, 교육과정, 통학, 급식, 입학설명회 정보를 필드별 공식 근거와 함께 저장해요.
- 공개 SNS·커뮤니티·카페·블로그는 접근 상태, 관점, 표본 수, 반복 주제와 한계를 저장해요.
- 해시로 고정된 반입 패키지, 검증 보고서, 로컬·테스트 DB dry-run 결과를 만들어요.
- 프로덕션에는 적용하지 않아요. 전용 읽기 전용 점검과 별도 Owner 승인 전까지 DB 쓰기를 금지해요.

설계 승인 시점의 읽기 전용 조사 기준선은 다음과 같아요.

- 공식 운영 22곳 모두의 정체성과 운영 근거를 대조했어요.
- 2026–27학년도 공식 학비는 13곳에서 확인했어요. 이전 학년도 자료만 있는 학교는 현행 학비로 계산하지 않아요.
- 공식 22곳 모두에서 공개 소셜·커뮤니티 채널의 접근 상태를 1차 점검했어요. 실질적인 독립 후기 표본이 없는 학교가 있으며, 네이버 블로그·카페는 수집 환경에서 robots 차단됐어요.
- 공개된 향후 입학설명회는 SFS에서 확인했어요. KIS 판교는 같은 행사 시간이 공식 출처끼리 달라 행사 레코드를 만들 수 없는 상태예요.
- 후보 60개 레코드는 법적 분류·운영·주소·캠퍼스 충돌을 1차 대조했어요. 교육청 첨부 원문 행을 직접 확인하지 못한 후보는 확정 분류나 DB 반입 대상으로 승격하지 않아요.

## 2. 조사 대상을 세 층으로 분리해요

### 2.1 공식 외국인학교

교육부 운영 현황과 ISI 등록 정보를 함께 확인한 운영 학교 22곳이에요.

- 서울 16곳
- 경기 6곳
- DB 분류: `category=INTERNATIONAL_SCHOOL`
- DB 세부 분류: `internationalSubtype=FOREIGN_SCHOOL`
- 최초 공개 상태: `publicationState=DRAFT`
- 운영 상태: 교육부의 최신 운영 현황을 우선해 `ACTIVE` 또는 확인된 상태를 저장해요.

ISI에 등록돼 있다는 이유만으로 운영 중이라고 판단하지 않아요. 예를 들어 지구촌기독외국인학교는 ISI 상세가 남아 있지만 교육부 2025-09-01 기준 자료에 `미운영`으로 표시돼 공식 운영 22곳에서 제외해요. `폐교`, `휴교`, `운영 중단`처럼 확인되지 않은 표현으로 바꾸지 않아요.

기준 자료:

- 교육부 외국인학교 운영 현황: https://www.moe.go.kr/boardCnts/viewRenew.do?boardID=350&boardSeq=104371&lev=0&m=0309&opType=N&page=1&s=moe&searchType=null&statusYN=W
- ISI 서울 목록: https://isi.go.kr/EgovPageLink.do?link=isi%2Fkr%2FschoolSearch%2Fschool02&menuId=B002
- ISI 경기 목록: https://isi.go.kr/EgovPageLink.do?link=isi%2Fkr%2FschoolSearch%2Fschool03&menuId=B003
- 경기도교육청 외국인학교 현황: https://www.goe.go.kr/goe/na/ntt/selectNttInfo.do?nttSn=2344357

### 2.2 특수 접근 학교

일반 학부모가 같은 방식으로 지원할 수 없는 7곳이에요.

- DoDEA 6곳: 모두 경기 평택 소재
- 주한 러시아대사관 부속 학교 1곳: 서울 중구 소재
- 저장 위치: `special-access.ndjson`
- DB 기관 본체: 반입하지 않아요.
- 공개 상세 페이지: 만들지 않아요.

DoDEA 학교는 해외 DoDEA 입학 자격을 충족한 부양가족이 대상이며, 일부 범주는 잔여석과 유료 심사를 거쳐요. 이를 `누구나 지원 가능` 또는 `미군 자녀만 가능`으로 단순화하지 않아요. 러시아대사관학교도 외교공관 관계자 자녀와 대사관 결정에 따른 예외 입학을 일반 모집으로 표현하지 않아요.

시설 보안을 위해 정확한 건물 번호, 좌표, 게이트, 버스 노선·정류장·시간, 학생 이동 패턴은 수집·저장·공개하지 않아요.

### 2.3 대안교육·학원·교육업체·미확인 후보

국제학교로 검색되는 후보는 발견 단계에서 제외하지 않아요. 다만 다음 분류 중 하나로만 저장해요.

- `REGISTERED_ALTERNATIVE_INSTITUTION`
- `ACADEMY`
- `EDUCATION_BUSINESS`
- `UNACCREDITED_ALTERNATIVE`
- `HISTORICAL_ENTITY`
- `LEGAL_STATUS_UNCONFIRMED`
- `DUPLICATE_OR_COLLISION_REVIEW`

서울·경기 교육청의 등록 대안교육기관은 학력인정 학교가 아니므로 공식 외국인학교와 분리해요. 해외 인증, CEEB 코드, 외국 교육과정, 학교라는 브랜드명은 국내 법적 학교 지위를 증명하지 않아요.

기준 자료:

- 서울교육청 등록 대안교육기관: https://www.sen.go.kr/user/bbs/BD_selectBbsList.do?q_bbsSn=1524
- 경기도교육청 등록 대안교육기관: https://www.goe.go.kr/goe/na/ntt/selectNttInfo.do?mi=10961&nttSn=2337176

현재 후보 수는 조사 레코드 기준 60개예요. 같은 브랜드의 복수 캠퍼스와 동일 이름의 별개 법인을 정리하면서 최종 기관 수는 달라질 수 있어요. 이 변화는 누락이나 추가로 처리하지 않고 병합·분리 이력으로 남겨요.

## 3. 근거 우선순위와 판정 규칙

필드마다 가장 적합한 출처를 사용해요. 하나의 공식 페이지를 기관의 모든 사실에 대한 근거로 재사용하지 않아요.

1. 교육부·시도교육청·ISI 등록 자료
   - 기관 정체성, 법적 분류, 등록번호, 운영 상태의 근거로 사용해요.
2. 학교 공식 페이지·공식 문서·공식 지원 포털
   - 학비, 입학 자격, 입학 절차, 교육과정, 통학, 급식, 행사 일정의 근거로 사용해요.
3. 학교 공식 SNS
   - 공식 행사와 운영 활동의 보조 근거로 사용할 수 있어요.
4. 공개 제3자 글과 커뮤니티
   - 후기 주제 발견에만 사용해요. 학교 사실의 근거로 승격하지 않아요.
5. 검색 결과 문구
   - 다음에 확인할 URL을 찾는 단서로만 사용해요.

출처 판정은 다음 값을 사용해요.

- `VERIFIED`: 직접 열린 공식 본문 또는 공식 문서에서 확인했어요.
- `VERIFIED_WITH_WARNING`: 공식 본문은 확인했지만 TLS 경고, 언어별 표기 충돌처럼 주의가 필요해요.
- `VERIFIED_WITH_DATE_LIMIT`: 공식 근거의 기준 학년도가 현재 목표보다 이전이에요.
- `NOT_FOUND_IN_CHECKED_OFFICIAL_SOURCES`: 확인한 공식 범위에서 해당 값을 찾지 못했어요.
- `ACCESS_FAILED`: 공식 페이지를 불러오지 못했어요.
- `NEEDS_REVIEW`: 공식 출처끼리 값이 다르거나 기관 정체성이 충돌해요.
- `LEAD_ONLY`: 검색 결과나 제3자 단서만 있고 본문을 확인하지 못했어요.
- `LOGIN_REQUIRED`: 공개 링크가 로그인을 요구해요.
- `ROBOTS_BLOCKED`: 수집 환경에서 robots 정책으로 본문을 열지 못했어요.
- `NO_PUBLIC_RESULT`: 지정 채널에서 공개 결과를 찾지 못했어요.

`ACCESS_FAILED`와 `NOT_FOUND_IN_CHECKED_OFFICIAL_SOURCES`를 합치지 않아요. 학교가 미발표라고 직접 안내한 경우가 아니면 `미발표`라고 쓰지 않아요.

artifact의 세부 판정을 현재 DB 범위 상태로 옮길 때는 다음처럼 고정해요.

- `VERIFIED` → `CONFIRMED`
- `VERIFIED_WITH_WARNING`, `VERIFIED_WITH_DATE_LIMIT`, `NEEDS_REVIEW` → 현재값으로 승격하지 않고 `NEEDS_REVIEW`
- `NOT_FOUND_IN_CHECKED_OFFICIAL_SOURCES` → `CHECKED_NOT_FOUND`
- `ACCESS_FAILED` → `ACCESS_FAILED`
- `LEAD_ONLY`, `LOGIN_REQUIRED`, `ROBOTS_BLOCKED`, `NO_PUBLIC_RESULT` → 소셜·후보 artifact에만 남기고 기관 사실을 만들지 않아요.

과거 학년도 자료 자체는 확인된 근거로 보존할 수 있지만, 현재 학년도 필드의 `CONFIRMED` 상태로 바꾸지 않아요.

## 4. 필드별 데이터 계약

### 4.1 기관 정체성

- `institutionId`: ISI 등록키에서 결정적으로 생성한 UUID
- `registryName`: `ISI`
- `registryExternalId`: `ST01:<schoolId>` 형식
- `canonicalNameKo`, `canonicalNameEn`, `aliases`
- `category`, `internationalSubtype`, `operationalState`, `publicationState`
- `regionCode`, `city`, `district`, `addressLine`, `websiteUrl`
- `registryRecordUrl`, `officialMainUrl`

자동 연결 키는 정확한 `(registryName, registryExternalId)` 하나만 사용해요. 이름·slug·주소 유사도로 기존 기관을 자동 병합하지 않아요. slug 충돌은 오류로 중단해요.

공식 등록 주소와 학교 홈페이지 주소가 다르면 두 값을 근거 파일에 모두 저장해요. DB의 `addressLine`은 확인 전 `null`로 두고 지역·구 정보만 반입할 수 있어요. 기존에 검수된 주소가 있으면 새 충돌값으로 덮어쓰지 않아요.

### 4.2 학비

학비는 학년도, 학년 범위, 통화, 납부 단위, 필수·선택 여부를 분리해요.

- `academicYearLabel`
- `gradeBand`
- `components[]`: `currency`, `amount`, `billingUnit`, `required`
- `applicationFee`, `admissionFee`, `capitalFee`, `transportFee`, `mealFee`
- `paymentOptions`, `refundConditions`, `notes`

KRW와 USD가 함께 있는 학비를 합산하거나 임의 환율로 환산하지 않아요. 이전 학년도 학비는 현행 학비로 이월하지 않아요.

### 4.3 입학 자격과 절차

- 법정 입학 자격
- 대상 학년과 연령
- 지원 가능 시점
- 제출 서류
- 평가·시험·면접
- 영어 지원 또는 영어 능력 조건
- 정원·대기·합격 통보 조건
- 등록 기한과 미등록 결과

자격, 절차, 모집 상태를 하나의 문장으로 합치지 않아요. 학교가 수시 모집이라고 명시한 경우와 단순히 마감일을 찾지 못한 경우를 구분해요.

### 4.4 교육과정·통학·급식

- 교육과정: 체계, 학년 범위, IB·AP·IGCSE 등 공식 프로그램
- 통학: 제공 지역, 학년도, 왕복·편도 여부, 비용, 좌석 보장 여부
- 급식: 제공 방식, 메뉴 선택, 알레르기·종교식 대응, 비용

버스 노선은 학교가 일반 공개한 권역 수준까지만 저장해요. 학생 안전에 영향을 줄 수 있는 상세 정류장과 운행 시간은 공개 필드로 만들지 않아요.

### 4.5 입학설명회와 방문

다음 유형을 구분해요.

- `INFORMATION_SESSION`
- `OPEN_HOUSE`
- `CAMPUS_TOUR`
- `APPLICATION`

개별 투어를 입학설명회로 바꾸지 않아요. 두 공식 출처의 시간이 다르면 행사 레코드를 만들지 않고 `NEEDS_REVIEW`로 남겨요. 지난 행사는 `지난 일정`, 신청만 끝난 행사는 `신청 마감`으로 표현해요.

## 5. 공개 SNS·커뮤니티·카페·블로그 수집

공개 후기의 목적은 학교를 평가하거나 순위를 매기는 것이 아니라, 학부모가 추가로 확인할 질문을 찾는 것이에요.

채널별 레코드는 다음을 저장해요.

- `institutionRegistryId`
- `channelType`: `OFFICIAL_SOCIAL`, `BLOG`, `CAFE`, `COMMUNITY`, `REVIEW_SITE`, `VIDEO`
- `url`, `accessStatus`, `accessedAt`
- `perspective`: `PARENT`, `STUDENT`, `TEACHER`, `ALUMNI`, `UNKNOWN`
- `reviewSampleCount`
- `themeSummary[]`
- `periodStart`, `periodEnd`, `recency`
- `promotionEligibility=DISCOVERY_ONLY`
- `limitation`

다음 원칙을 적용해요.

- 공개 본문을 직접 연 경우에만 내용 분석을 해요.
- 검색 결과 문구는 링크 단서로만 저장해요.
- 로그인·회원가입·카페 가입·결제가 필요한 글은 우회하지 않아요.
- 작성자 이름, 계정명, 프로필, 연락처, 자녀 신상 등 개인정보를 저장하지 않아요.
- 댓글 원문과 게시글 전체를 복제하지 않아요.
- 원문 발췌는 필요한 최소 범위로 제한하고 레코드당 2,000자를 넘지 않아요.
- 단일 익명 주장, 교직 지원자 대화, 상업 업체 후기는 그 관점과 이해관계를 표시해요.
- 반복 주제는 서로 독립적인 공개 표본이 충분할 때만 계산해요.
- 심각한 주장이나 민감한 사건은 사실 카드로 공개하지 않아요.

네이버 블로그·카페가 `ROBOTS_BLOCKED`이면 댓글까지 확인했다고 기록하지 않아요. 향후 정상 브라우저에서 로그인 없이 공개 본문을 확인하는 수동 절차를 별도 운영할 수 있지만, 회원 전용 공간은 수집 대상이 아니에요.

MVP에서는 제3자 후기와 요약을 DB에 반입하지 않아요. `social-evidence.ndjson`에만 보관하고 공개 페이지에 노출하지 않아요.

## 6. 데이터 패키지

패키지 경로는 다음 형식을 사용해요.

`data/snapshots/preppy/international-school/sg-is-20260915-r01/`

패키지는 아래 파일로 구성해요.

1. `institutions.ndjson`
   - 공식 운영 22곳의 정체성·공식 채널·주소 충돌 상태
2. `evidence.ndjson`
   - 공식 등록부, 공식 학교 페이지, 공식 PDF의 필드별 근거
3. `social-evidence.ndjson`
   - 공식 소셜과 공개 제3자 채널의 접근·분석 상태
4. `special-access.ndjson`
   - DoDEA 6곳과 러시아대사관학교 1곳의 제한된 공개 정보
5. `candidates.ndjson`
   - 대안교육·학원·교육업체·미확인·충돌 후보와 법적 분류 근거
6. `progress.json`
   - 모집단 수, 필드별 완료율, 접근 결과, 미해결 충돌, 기준일
7. `preppy-import.snapshot.json`
   - DB 반입 대상인 공식 운영 22곳만 포함한 정규화 스냅샷
8. `manifest.json`
   - 1–7번 파일의 원시 바이트 SHA-256과 정규화 스냅샷 체크섬
9. `verification.json`
   - 스키마·참조·중복·근거·반입 dry-run 검증 결과

`manifest.json`은 자신의 해시와 `verification.json`의 해시를 포함하지 않아요. 검증 보고서는 검사 결과이므로 검증 대상 입력과 분리해요.

## 7. DB 반입 매핑

현재 스키마의 `institutions`, `institution_registry_identities`, `sources`, `source_snapshots`, `source_observations`, `institution_source_bindings`, `institution_facts`, `institution_fact_versions`, `institution_fact_version_evidence`, `institution_section_coverages`, `opportunities`를 사용해요. MVP를 위해 DB 마이그레이션을 추가하지 않아요.

기존 영어유치원 반입기는 25곳, 강남·서초, KRW 단일 통화, 영어유치원 전용 조건이 고정돼 있어 재사용하지 않아요. 국제학교 전용 스키마·검증기·계획기·반입기를 별도 모듈로 만들어요.

반입 규칙은 다음과 같아요.

- 공식 운영 22곳만 기관 본체로 반입해요.
- 모든 기관은 `DRAFT`로 반입해요.
- 현재 학년도와 공식 근거가 확인된 사실만 `VERIFIED` 현재 버전으로 만들어요.
- `NEEDS_REVIEW`, `ACCESS_FAILED`, `CHECKED_NOT_FOUND`는 사실 버전을 만들지 않고 범위 상태만 저장해요.
- 제3자 발견용 출처는 기관 사실 근거로 연결하지 않아요.
- 정보가 충돌하는 필드는 기존 값을 덮어쓰지 않아요.
- 기존 `PUBLISHED`, `HIDDEN`, `ARCHIVED` 기관과 충돌하면 자동 변경하지 않고 반입을 중단해요.
- 기존 레코드는 정확한 ISI 등록키로만 재사용해요.
- 실패 시 하나의 최상위 트랜잭션 전체를 롤백해요.
- 동일 체크섬을 두 번째 반입하면 변경 건수가 0이어야 해요.

## 8. 공개 차단 조건

데이터를 DB에 넣는 것과 사용자에게 공개하는 것은 별도 결정이에요.

국제학교 기관은 아래 조건을 모두 충족해야 목록·상세·검색·사이트맵·팔로우 대상이 될 수 있어요.

- `publicationState=PUBLISHED`
- `operationalState=ACTIVE`
- `category=INTERNATIONAL_SCHOOL`
- `institution_registry_identities`에 `registryName=ISI`가 존재해요.

학비·입학·통학·급식·행사 사실은 다음 조건을 모두 충족해야 공개해요.

- 현재 `VERIFIED` 버전이에요.
- `verifiedAt`이 있어요.
- 해당 사실을 지지하는 공식 출처가 있어요.
- 공식 출처의 snapshot과 observation이 모두 있어요.

`OFFICIAL_REGISTRY`는 정체성·법적 분류·운영 상태에는 사용할 수 있지만 학비·입학 절차·통학·급식·행사 사실의 단독 근거로 사용할 수 없어요.

현재 공개 조회는 일부 `VERIFIED` 사실에 공식 근거를 강제하지 않고, 기관 상세도 `PUBLISHED`만 확인하며, 팔로우도 `CLOSED`가 아니면 허용할 수 있어요. 국제학교 공개 전에 조회·사이트맵·팔로우 조건을 위 기준으로 고쳐야 해요. 이 수정이 완료되지 않으면 국제학교 기관은 계속 `DRAFT`로 유지해요.

## 9. 사용자 문구

사용자 화면에는 내부 상태 코드를 노출하지 않아요.

- `NOT_FOUND_IN_CHECKED_OFFICIAL_SOURCES` → `확인한 학교 공식 안내에서 학비 정보를 찾지 못했어요.`
- `ACCESS_FAILED` → `학교 페이지를 불러오지 못해 학비를 확인하지 못했어요.`
- `VERIFIED_WITH_DATE_LIMIT` → `이 정보는 2025–26학년도 안내예요. 2026–27학년도에는 달라질 수 있어요.`
- `NEEDS_REVIEW` → `학교 안내에 적힌 시간이 서로 달라요. 정확한 시간은 학교에 확인해 주세요.`
- `LOGIN_REQUIRED` → `로그인이 필요한 글이라 내용을 확인하지 못했어요.`
- `ROBOTS_BLOCKED` → 일반 사용자 화면에는 노출하지 않고 내부 수집 상태로만 보관해요.

국제학교·외국인학교·등록 대안교육기관·학원을 같은 의미로 쓰지 않아요. PREPPY의 검수를 `학교 인증` 또는 `입학 가능 보장`이라고 표현하지 않아요.

## 10. 주요 충돌 처리

- KIS 서울과 KIS 판교는 등록키와 캠퍼스를 분리해요.
- GCF는 `미운영` 상태와 기준일을 보존해요.
- Korea Foreign School 주소 충돌은 주소 필드 반입을 보류해요.
- KIS 판교 오픈하우스 시간 충돌은 행사 생성 대신 `NEEDS_REVIEW`로 남겨요.
- APIS의 TLS 인증서 경고는 성공으로 숨기지 않고 `VERIFIED_WITH_WARNING`을 남겨요.
- ICSU의 G4–12와 G5–12 충돌은 확인 전 운영 학년 사실을 만들지 않아요.
- Suwon Chinese의 주소 충돌과 공식 페이지 접근 실패를 분리해요.
- DSSI의 영문·독문 통학비 학년도 표기 충돌을 보존해요.
- Seoul Academy의 역사적 외국인학교와 현재 학원 후보를 절대 병합하지 않아요.
- Saint Paul 계열 기관과 다중 캠퍼스를 이름 유사성으로 병합하지 않아요.
- Lighthouse, Gangnam International School, FIS 등 동일·유사 브랜드의 기관과 캠퍼스는 공식 주소·운영 주체 확인 전 분리해요.

## 11. 검증과 반입 안전선

### 11.1 파일 검증

- NDJSON 각 행의 엄격한 스키마 검증
- 모든 ID와 evidence 참조 무결성
- 공식 운영 22곳과 ISI 등록키의 1:1 대응
- 특수 접근 7곳이 DB 스냅샷에 들어가지 않았는지 확인
- 후보 레코드가 DB 스냅샷에 들어가지 않았는지 확인
- 중복 이름·slug·등록키·공식 URL 검사
- 학년도, 통화, 납부 단위, 시간대 보존 검사
- `SUCCESS`가 아닌 근거로 사실이 생성되지 않는지 확인
- 발췌문 2,000자 제한, HTML 전체·댓글 원문·개인정보 금지 검사
- 원시 파일 해시와 정규화 체크섬 검사

### 11.2 코드 검증

- 국제학교 사실 값 단위 테스트
- artifact 스키마와 잘못된 패키지 거부 테스트
- 충돌 주소·학년·시간의 사실 생성 차단 테스트
- ISI 등록키 기반 idempotent 계획 테스트
- rollback과 두 번째 적용 0건 테스트
- 공식 근거 없는 사실·행사의 공개 차단 테스트
- `ACTIVE + PUBLISHED + ISI` 기관 공개 조건 테스트
- 사이트맵·검색·팔로우의 동일 공개 조건 테스트

### 11.3 DB 준비 검증

- 전용 테스트 DB에서 migration ledger 확인
- 반입 전 row-count와 충돌 기준선 저장
- validate-only 실행
- dry-run 실행
- 테스트 DB apply 후 전체 참조·건수 검사
- 동일 패키지 재실행 시 변경 0건 검사
- 프로덕션 전용 읽기 계정으로 충돌·기존 데이터 감사

프로덕션 적용은 이번 단계의 완료 기준이 아니에요. 추후 적용 요청을 받더라도 전용 읽기 계정, 최신 백업과 복구 준비, 검토한 체크섬, 명시적 적용 승인, 적용 후 읽기 전용 감사가 모두 있어야 해요. 일반 런타임 쓰기 계정을 사전 점검용 읽기 계정으로 대체하지 않아요.

## 12. 산출물과 구현 경계

구현 계획은 다음 네 묶음으로 작성해요.

1. 국제학교 artifact 계약과 사실 값 파서
2. 검증기·계획기·트랜잭션 반입기·CLI
3. 공식 근거 및 국제학교 공개 차단 로직
4. 데이터 수집 산출물, manifest, verification, dry-run 감사

후기 공개 UI, 학교 순위·평점, 회원 전용 커뮤니티 수집, 자동 감성분석, 환율 환산, 특수 접근 학교 공개 페이지, 후보 60곳의 프로덕션 기관 생성은 MVP 범위에 포함하지 않아요.

## 13. 설계 완료 기준

- 공식 22곳, 특수 접근 7곳, 후보군이 서로 분리돼 있어요.
- 모든 공식 사실은 필드별 공식 근거와 확인 시점을 가져요.
- 미발견·접근 실패·이전 학년도·출처 충돌을 구분해요.
- 공개 후기와 댓글은 개인정보 없이 발견용 근거로만 남아요.
- 반입 스냅샷은 공식 22곳만 포함하고 최초 상태가 `DRAFT`예요.
- 해시 검증, dry-run, rollback, idempotency가 증명돼요.
- 공개 차단 로직이 검증되기 전에는 국제학교가 프로덕션 화면에 나타나지 않아요.

UX Writing: PASS — 학년도·날짜·금액·통화·입학 자격·예외·확인 한계를 보존하고, 미발표·미발견·접근 실패·이전 자료·상충 상태를 분리했어요. 구현과 실제 화면 검증 결과는 별도 완료 기록에서 다시 판정해요.
