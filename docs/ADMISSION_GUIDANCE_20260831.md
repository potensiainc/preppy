# 모집 안내 정보 보존 수정 — 2026-08-31

요청: 공식 원문의 모집요강(예정)도 학부모에게 제공하고, 확정 여부를 명시하면서 확인 가능한 사실을 최대한 보존한다.

## 원인과 변경

- 추출기가 접수일·설명회·미발표 문장만 summary에 넣고 인원, 추첨, 등록, 서류, 비용을 제외했다. 모집요강 제목이 p 태그이면 제목의 예정 표기도 사라졌다.
- 2025학년도 기준 수업료 같은 참고값을 다른 모집 학년도로 오인해 2027학년도 요강에서 제외했다.
- 기존 운영 보정 데이터는 41개 학교 대부분을 접수일 확인 한 문장으로 요약했다. 기관 Fact와 별도 행사로 저장된 정보도 모집 상세페이지에는 표시되지 않았다.
- 상세 내용은 기존 summary에 문단 단위로 보존한다. 추가 schema migration은 없다. 예정·안은 별도 안내와 날짜 라벨로 표시한다. 출생·취학 예정 아동이라는 표현은 예정 요강으로 오인하지 않는다.
- 날짜가 없는 유효한 안내는 GUIDANCE_FOUND로 구별한다. 검증 상태 VERIFIED는 원문을 확인했다는 의미이며 미래 일정이 확정됐다는 뜻이 아니다.
- 원문에 있는 이전 연도 비용과 변동 가능 조건을 함께 유지한다. 누락값이나 날짜를 추정하지 않는다.
- 여러 출처의 사실을 합친 상세페이지에는 검수된 공식 출처 전체를 표시한다.

## 데이터 범위

`data/corrections/PREPPY_ADMISSION_GUIDANCE_20260831.json`은 기존 학교 41개와 모집·행사 67개를 유지한다. 학교·학년도·날짜 값은 변경하지 않고 공개된 세부 안내를 보완한다. 기준 학년도는 기존 2026학년도 34개, 2027학년도 5개, 미확인 2개 그대로다.

전 학교는 기존 검수 Fact와 같은 학년도의 행사 설명을 주 모집 안내에 포함한다. 리라·동광·화랑·광운·중앙기독 5개 학교의 2027학년도 원문을 추가로 검토해 인원·전형료·추첨·등록·서류·비용을 보완했다. 추가 검수 문장은 `admission-guidance-additions-20260831.json`에 기록한다.

리라 HTML은 새로 수집해 원문 해시·수집시각을 보존한다. 나머지 이미지/PDF는 앞서 확보한 공식 원본을 다시 읽었으며 최초 수집시각을 유지한다. 원문이 예정·안인 리라·동광·세종은 그 상태를 표시한다. 일반적인 미래 날짜만으로 초안이라고 판단하지 않는다.

중앙기독 PDF의 서류 방문 제출 안내와 온라인폼 접수 안내는 충돌을 숨기지 않고 서류별 방식을 입학처에 확인하도록 적었다. PDF에 없는 입학금·수업료 금액은 추가하지 않았다.

모든 학교의 모든 조항을 새로 전수조사했다는 의미는 아니다. 2026학년도 자료를 2027학년도 자료로 바꾸거나 미확인 값을 보충하지 않았다.

## 검증 및 운영 적용

- 원인 재현 테스트 실패를 확인한 뒤 수정했다. 단위 테스트 128 files / 1,244 tests 통과.
- 관련 통합 테스트 5 files / 31 tests 통과. TypeScript 포함 production build 통과.
- 새 보정 artifact의 학교 allowlist, 공식 출처 allowlist, 해시, 날짜, 증거 연결 검증 통과.
- 기존 correction CLI의 production 환경·checksum·명시적 쓰기 acknowledgement 검증을 그대로 사용한다. 운영 dry-run 뒤 apply하며 기존 이력은 삭제하지 않는다.
- Railway preppy-web 배포 `c3ff028c-4bc0-4275-a012-f77d50a3fd43`: SUCCESS. 작업 디렉터리에서 배포했으며 Git commit/push/merge는 실행하지 않았다.
- 보정 checksum: `da11481e61839cf855ce01fdafe5be97b49fdab27b0ed99168b9198caa4c5ab7`.
- Production dry-run: 41개 유효, 쓰기 0. Apply: 41개 성공, 실패 0. 기존 학교·기회 identity 유지, 모집 version 67개와 Fact version 66개 추가, 이전 이력 보존.
- Outbox/Notification/Delivery/DeliveryAttempt/MeaningfulChange/OpportunityChange delta 모두 0. 같은 artifact 재적용: 모든 row-count delta 0.
- 실제 공개 페이지 67/67에서 기대 문단 전체·제목·모든 공식 출처 href 일치, HTTP 200. Chrome의 리라 상세페이지 DOM과 화면에서도 인원·비용·추첨·등록·서류·예정 안내 표시 확인.
- 로컬 상세 실행 결과: `.preppy-bootstrap/guidance-20260831/production-dry-run.json`, `production-apply.json`, `production-replay.json`, `production-http-verification.json`.
