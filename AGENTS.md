# PREPPY — Mandatory UX Writing Instructions

## 필수 사전 읽기 및 적용

모든 PREPPY 작업은 시작 전에 [PREPPY UX Writing 정책](docs/PREPPY_UX_WRITING_POLICY.md)을 **전체 읽고** 사용자 언어에 미치는 영향을 검토해야 한다. 기획, PRD, UX, 디자인, 프론트엔드, 백엔드, 수집·추출·표시 로직, QA, 마케팅, 콘텐츠, SEO 및 AI 생성 문구에 동일하게 적용한다. UX Writing은 선택적인 마무리 작업이 아니라 작업의 입력·설계·완료 기준이다.

- 정책의 단일 기준은 `docs/PREPPY_UX_WRITING_POLICY.md`다. 다른 skill, 디자인 가이드, 요약 지침으로 대체하거나 일부만 읽고 적용했다고 보고하지 않는다.
- 사용자 노출 문구는 자연스러운 해요체로 쓰고, 제목·라벨은 간결한 명사형을 사용한다. 공식 인용·고유명·법정 용어의 정확성은 보존한다.
- 우선순위는 **사실·조건 보존 → 이해하기 쉬움 → 간결함 → 친근함**이다. 날짜·학년도·금액·의무·금지·예외·불확실성·출처·수집/검수 시점을 문체 개선 때문에 바꾸거나 삭제하지 않는다.
- `원문`, `PDF`, `임의로` 등 특정 단어가 포함됐다는 이유로 문장·섹션 전체를 제거하지 않는다. 실제 신청 조건과 학교 확인 필요 경고를 보존한다.
- 미발표, 미발견, 수집 실패, 미확인, 예정, 접수 마감, 지난 일정을 구분한다. 가짜 데이터·확정되지 않은 정보·불안 조장·과장된 마케팅 문구로 빈 상태를 채우지 않는다.
- 한 학교의 공통 안내는 한 번, 서로 다른 일정·조건은 구분한다. 지원 대상·자격·인원·서류·접수·추첨·등록·비용 등을 세미콜론이나 복합 제목으로 몰아넣지 않는다.
- 버튼은 실제 다음 행동과 일치해야 한다. 미제공 기능의 빈 UI는 제거하되 실제 실패·마감·자격 제한은 숨기지 않는다.

## 모든 작업의 완료 기준

기획·디자인·구현·마케팅 산출물과 완료 보고에는 **UX Writing 검토 결과**를 포함한다. 사용자 언어에 영향이 있으면 변경 전후 또는 신규 문구, 영향을 받는 상태/채널, 근거와 조건 보존 여부, 실제 수행한 검증을 남긴다. 문구 필터·추출·표시 로직을 수정하면 전체 문장/요강의 정보 보존 회귀를 검증한다. 검증 수준은 작업에 비례해야 하며, 수행하지 않은 화면 검사나 테스트를 PASS로 기록하지 않는다.

- `UX Writing: PASS` — 정책을 적용하고 해당 범위의 근거·문구·동작을 검증했다.
- `UX Writing: FIX_REQUIRED` — 위반 또는 필수 검수 누락이 있다. 완료·공개 가능으로 보고하지 않는다.
- `UX Writing: N/A — 구체적 사유` — 사용자 노출 문구·상태·정보 의미에 영향이 없음을 확인했다. 내부 코드라는 이유만으로 생략하지 않는다.

위임 작업에도 정책 경로와 적용 범위를 전달한다. 계획·설계·리뷰에서도 이 기준을 누락하지 않는다. 사람이 수행하는 작업은 [기여 지침](CONTRIBUTING.md), PR은 [리뷰 템플릿](.github/pull_request_template.md)을 함께 따른다.

이 지침은 기존 승인·보안·공개 규칙을 우회하거나 DB 수정·수집·commit·push·배포·범위 밖 재작성 권한을 부여하지 않는다. 충돌/예외는 Owner의 명시적 결정을 기록한다. 체크리스트는 필수 준수 규칙이며 자동 CI 차단 기능을 뜻하지 않는다.

## 공개 헤더의 카카오 로그인 금지

Owner가 다시 노출하라고 명시적으로 지시하기 전까지 공개 사이트의 데스크톱·모바일 헤더에 카카오 로그인 링크나 로그인 상태 UI를 추가하지 않는다. 다른 기능을 배포할 때도 이 결정을 유지한다. 배포 전 `npm run prebuild`를 실행하고, 헤더 미노출 검사를 제거하거나 우회하지 않는다. 관심기관 등록 등 사용자가 직접 선택한 기능의 인증 동선은 별개로 유지한다.

## 운영 배포 기준

- staging/production 웹 업로드 직전 `npm run deploy:preflight`를 실행한다. 최신 원격 main 미포함, 미커밋 파일, 헤더 로그인 재노출이면 배포를 중단한다. 검사를 우회한 `railway up` 직접 실행은 금지한다.
- 작업 브랜치별로 운영을 덮어쓰지 않는다. 최신 main과 승인된 변경을 통합하고 단위 테스트·타입 검사를 통과한 깨끗한 동일 커밋을 staging에서 검증한 후 production에 배포한다.
- 두 환경 사이에 코드나 최신 main이 바뀌면 재통합·재검증한다. 배포 커밋과 환경별 배포 ID를 기록하고, 운영 헤더 미노출과 주요 메뉴를 확인한다.

---

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
