# PREPPY — Agent Instructions

## 0. 현재 단계: MVP 출시 우선

PREPPY는 **MVP 출시 단계**예요. 에이전트의 역할은 출시를 막는 게 아니라 **출시 가능한 상태를 빠르게 만들고, 남은 위험을 Owner가 판단할 수 있게 정리하는 것**이에요.

### 출시 판정 권한은 Owner에게만 있어요

- 에이전트는 `출시 보류`, `출시 차단`, `공개 불가`, `launch blocked` 같은 **출시 여부 판정을 내리지 않아요.** 문서 상태값·결론·요약에도 쓰지 않아요.
- 대신 남은 항목을 아래 3단계로 분류해 보고하고, 출시 여부는 Owner가 결정해요.
  - `P0 — 출시 전 Owner 확인 권장`: 법적 의무 위반, 개인정보 유출, 결제·가입 불가, 공개 화면의 명백한 사실 오류(날짜·금액·대상 오기)
  - `P1 — 출시 후 1~2주 내 개선`: 자동화 미비, 실기기 추가 검증, 표본 외 원문 대조, 운영 백업 자동화 등
  - `P2 — 백로그`: 하드닝, 리팩터링, 문서 정리, 확장 기능
- 수동 절차로 대체 가능한 항목(예: 탈퇴 수동 처리, 수동 백업, 운영자 직접 확인)은 P0로 올리지 않아요. 절차 문서가 있으면 충분해요.
- "검증하지 못함"은 "실패"가 아니에요. 미검증 항목은 `미검증`으로 사실대로 적되 출시를 막는 근거로 쓰지 않아요.
- 보고는 **Owner가 오늘 할 일 → 에이전트가 처리한 일 → 남은 P1/P2** 순서로 짧게 써요. 장문 증빙 문서는 요청받았을 때만 만들어요.

### 속도 원칙

- 새 하드닝, 추가 증빙, 전수 감사, 신규 인프라는 Owner가 요청하지 않으면 시작하지 않아요.
- 같은 목적의 문서를 새로 만들지 말고 기존 문서(`docs/LAUNCH_RUNBOOK.md`)를 갱신해요.
- 정확성은 **공개 화면에 실제 노출되는 정보** 기준으로 관리해요. 노출되지 않는 데이터의 전수 대조를 출시 조건으로 삼지 않아요.

## 1. UX Writing 기준

사용자 노출 문구를 바꾸는 작업은 [PREPPY UX Writing 정책](docs/PREPPY_UX_WRITING_POLICY.md)을 따라요. 내부 코드·인프라·데이터 작업은 정책 전체를 읽지 않아도 돼요.

- 사용자 노출 문구는 자연스러운 해요체, 제목·라벨은 간결한 명사형이에요. 공식 인용·고유명·법정 용어는 정확히 보존해요.
- 우선순위는 **사실·조건 보존 → 이해하기 쉬움 → 간결함 → 친근함**이에요. 날짜·학년도·금액·의무·예외·불확실성·출처·확인 시점을 문체 때문에 바꾸거나 지우지 않아요.
- 미발표·미확인·예정·접수 마감·지난 일정을 구분하고, 가짜 데이터나 불안 조장 문구로 빈 상태를 채우지 않아요.
- 버튼은 실제 다음 행동과 일치해야 해요.

### 보고 형식 (한 줄)

- `UX Writing: OK` — 적용하고 확인했어요.
- `UX Writing: 개선 필요 — 항목` — 개선할 문구가 있어요. **사실 오류가 아니면 P1로 분류하고 작업 완료·출시를 막지 않아요.**
- `UX Writing: N/A` — 사용자 노출 문구에 영향이 없어요.

사실 오류(날짜·금액·대상·조건 오기)만 P0로 보고해요.

## 2. 권한

이 지침은 기존 보안·개인정보 규칙을 우회하지 않아요. 운영 DB 쓰기, 운영 배포, 외부 서비스 설정 변경, commit/push는 Owner가 요청한 범위에서만 해요. 사람이 수행하는 작업은 [기여 지침](CONTRIBUTING.md), PR은 [PR 템플릿](.github/pull_request_template.md)을 참고해요.

---

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
