# PREPPY 5-School Live Data Report

## Final Chromium UI acceptance — 2026-08-29

- Branch / HEAD: `feat/preppy-5-school-live-data-vertical-slice` / `4d5156099cb34c8720f69439a5bbd640f0d4a2c3`.
- Environment: fresh disposable local PostgreSQL 16.14 and localhost PREPPY application.
- Flow: canonical seed import → bounded official-source collection → DRAFT/UNVERIFIED extraction → five explicit single-record operator approvals → current VERIFIED versions → local-only publication → Chromium list/detail rendering.
- Production database, production credentials, production deployment, and production services were not used.
- This report records only the current VERIFIED evidence rows used by the final Chromium acceptance. UUIDs and timestamps from earlier disposable reruns and superseded preparation versions are intentionally excluded.

## Final canonical evidence and UI results

### 1. 경복초등학교 (`kbes`)

- Route: `http://127.0.0.1:3015/institutions/kbes` — HTTP 200 and rendered.
- Institution ID: `abcb72f0-a6aa-53b1-9104-77d318660f8a`
- Opportunity ID: `3db701fe-6685-448b-9632-c0d5600c2774`
- Current VERIFIED Version ID: `24e1a70e-8c16-4ef4-add8-0f28adc3736c`
- Opportunity Version Evidence ID: `f7fd96ff-ec1e-4bc3-985b-e0e87e9fbdc9`
- Source ID: `a05eb369-2706-4b0f-9899-ea5f30e3823d`
- Observation ID: `1`
- Snapshot ID: `6596e2cb-cb9c-4457-9bcd-b57a3f0fd6f4`
- Official Source: [https://www.kbes.kr/bbs/content.php?co_id=1_3](https://www.kbes.kr/bbs/content.php?co_id=1_3)
- Displayed admission data: `2026학년도 경복초등학교 신입생 모집 전형요강`; application period 2025-11-07 09:00 through 2025-11-12 16:30 KST; source-backed eligibility for deferred, previously unenrolled, and early-admission applicants.
- Knowledge state: `SCHEDULE_FOUND` / `공식 일정 확인됨`
- Last Collected: `2026-08-29T06:40:16.118Z`
- Last Verified: `2026-08-29T06:41:17.296Z`
- REAL_DATA_VISIBLE: **YES**

### 2. 명지초등학교 (`myongji`)

- Route: `http://127.0.0.1:3015/institutions/myongji` — HTTP 200 and rendered.
- Institution ID: `4b732452-6f4b-5f7e-9303-456667250a67`
- Opportunity ID: `f3a9b4be-e64a-4fa9-bc83-6a7caa80b9d3`
- Current VERIFIED Version ID: `6f17af09-b51c-4e11-9888-7b8b7106e486`
- Opportunity Version Evidence ID: `6c1380df-bceb-40a1-8a38-d03c343d54f5`
- Source ID: `cf4ce129-09f3-45dc-a510-82e6d06322c7`
- Observation ID: `2`
- Snapshot ID: `c74367d0-804d-4bb0-90ce-43b782f4b9d0`
- Official Source: [http://www.myongji.net/subpage.php?p=m24](http://www.myongji.net/subpage.php?p=m24)
- Displayed admission data: `2026학년도 명지초등학교 신입생 모집 전형 요강`; application period 2025-11-07 09:00 through 2025-11-12 16:30 KST; source-backed 2019 birth-year and exception eligibility.
- Knowledge state: `SCHEDULE_FOUND` / `공식 일정 확인됨`
- Last Collected: `2026-08-29T06:40:16.797Z`
- Last Verified: `2026-08-29T06:41:20.099Z`
- REAL_DATA_VISIBLE: **YES**

### 3. 영훈초등학교 (`younghoon`)

- Route: `http://127.0.0.1:3015/institutions/younghoon` — HTTP 200 and rendered.
- Institution ID: `626f9b01-1855-536f-b7cc-1608ab65eb9b`
- Opportunity ID: `0dc509cc-6693-4ceb-86a6-f20b9e89fefa`
- Current VERIFIED Version ID: `c63cac86-1d1a-44b5-a2ce-98c9eec5e6c8`
- Opportunity Version Evidence ID: `bcae5c12-1a6d-4592-82a5-b003e4c65808`
- Source ID: `2bbb7845-bf74-42a9-9e14-6f37f1d62d14`
- Observation ID: `3`
- Snapshot ID: `1822dd03-e6cf-40f6-ad38-0e0185213bcc`
- Official Source: [http://www.younghoon.es.kr/younghoon_e/admission/typical-syllabus.do](http://www.younghoon.es.kr/younghoon_e/admission/typical-syllabus.do)
- Displayed admission data: `2026학년도 영훈초등학교 신입생 모집 전형요강`; application period 2025-11-07 09:00 through 2025-11-12 16:30 KST; source-backed 2019 birth-year and exception eligibility.
- Knowledge state: `SCHEDULE_FOUND` / `공식 일정 확인됨`
- Last Collected: `2026-08-29T06:40:18.001Z`
- Last Verified: `2026-08-29T06:41:22.931Z`
- REAL_DATA_VISIBLE: **YES**

### 4. 우촌초등학교 (`uchon`)

- Route: `http://127.0.0.1:3015/institutions/uchon` — HTTP 200 and rendered.
- Institution ID: `37de5a08-cbb8-5dec-95d1-faca0a5d8009`
- Opportunity ID: `a96925df-5e7e-427a-a3b7-bb210b1dd784`
- Current VERIFIED Version ID: `f07070ba-28d9-4f1d-a856-0d37c40506ca`
- Opportunity Version Evidence ID: `727ea0f3-7334-43ce-9fff-58e166f6512e`
- Source ID: `86131158-997d-5246-b7cf-e793fd2a0e1f`
- Observation ID: `4`
- Snapshot ID: `efd591a9-74f1-4504-ac32-46f5e7f4480a`
- Official Source: [https://uchon.sen.es.kr](https://uchon.sen.es.kr)
- Displayed admission data: `2026학년도 입학 안내: 수집된 공식 홈페이지에서 일정 미확인`; no schedule, eligibility, or date is asserted.
- Knowledge state: `NOT_FOUND` / `관련 일정·지원 정보 미발견`
- Last Collected: `2026-08-29T06:40:19.167Z`
- Last Verified: `2026-08-29T06:41:25.911Z`
- REAL_DATA_VISIBLE: **YES**

### 5. 예일초등학교 (`yale`)

- Route: `http://127.0.0.1:3015/institutions/yale` — HTTP 200 and rendered.
- Institution ID: `af494821-037e-5730-a54e-809cb7253e41`
- Opportunity ID: `73983349-5b19-4aa7-b0ef-3a40fa066e9c`
- Current VERIFIED Version ID: `4a56e54a-218a-459e-bd76-484c5aec42ed`
- Opportunity Version Evidence ID: `72f2bf7f-a367-4b35-9771-8a0d505656d6`
- Source ID: `24da316b-eb5b-5b4f-934b-44e66c209871`
- Observation ID: `5`
- Snapshot ID: `4b4c8cc3-bc65-48bb-ba9b-06ba5c39a814`
- Official Source: [https://yale.sen.es.kr](https://yale.sen.es.kr)
- Displayed admission data: `2026학년도 신입생 모집요강: 수집된 공식 홈페이지에서 일정 미확인`; no schedule, eligibility, or date is asserted.
- Knowledge state: `NOT_FOUND` / `관련 일정·지원 정보 미발견`
- Last Collected: `2026-08-29T06:40:20.615Z`
- Last Verified: `2026-08-29T06:41:28.734Z`
- REAL_DATA_VISIBLE: **YES**

## Canonical chain and timestamp proof

The final local PostgreSQL query returned five complete current chains:

`Institution → PUBLISHED Opportunity → current VERIFIED Version → Opportunity Version Evidence → official Source → Source Observation → Source Snapshot → Official URL`

- Canonical chains valid: **5 / 5**
- Current VERIFIED Versions: **5**
- Current evidence rows recorded above: **5**
- In every chain, `Last Collected` is the Source Observation timestamp and `Last Verified` is the explicit operator approval timestamp.
- `Last Collected` and `Last Verified` are distinct for all five schools: **5 / 5 separated**.

## Chromium UI acceptance

- Browser: Chromium, headless, 1440 × 1100 viewport.
- Flow: Institution search list → school detail → `입학정보` section.
- Institution list/detail HTTP and render success: **5 / 5**
- Official Source URL matched the canonical DB/read-model value: **5 / 5**
- Last Collected and Last Verified DOM `datetime` values matched the canonical DB values: **5 / 5**
- Mock/placeholder data: **NO**
- Browser console errors: **0**
- Browser page errors: **0**
- Temporary screenshots were created for render proof and removed after validation.

## Product side effects

Counts were checked again after browser validation:

- Outbox: **0**
- Notification: **0**
- Delivery: **0**
- Delivery attempts: **0**
- MeaningfulChange: **0**
- OpportunityChange: **0**

## Environment and scope

- UI: **5 / 5 REAL_DATA_VISIBLE = YES**
- Production DB used: **NO**
- Production credentials used: **NO**
- Production deployed: **NO**
- Application code modified during UI acceptance: **NO**
- Schema or migration modified during UI acceptance: **NO**
- Live data was not hardcoded into the UI or public read model.
- The disposable PostgreSQL database/container, localhost application process, temporary manifests, validation script, and screenshots were removed after acceptance.
- No unit, integration, TypeScript, or build rerun was needed for this documentation-only reconciliation.

## FINAL VERDICT

**PASS — 5/5 REAL_DATA_VISIBLE.** Actual official-school data was rendered through the existing localhost PREPPY Institution detail UI for all five schools, with canonical provenance, separated collection/verification timestamps, no mock data, no production access, and zero product side effects.
