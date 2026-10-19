# Source lifecycle recovery review

All ten staging rows are OFFICIAL_SCHOOL_PAGE / PRIMARY / DISCOVERED, created and last updated 2026-09-10 13:00:13.308 UTC. Each has exactly one active primary OFFICIAL_MAIN binding to its expected published English campus. Monitor configs, opportunity bindings, legacy bindings and observations are absent. No source lifecycle or monitoring setting was changed.

The user explicitly approved accepting DISCOVERED alongside ACTIVE for this reviewed explanation-session import. No activation command, bulk state rewrite, new monitor configuration, credential or notification-setting change is included.

| Campus | Exact reviewed source URL | Identity/proof | Recheck |
|---|---|---|---|
| RISE 라이즈 성북캠퍼스 | [https://blog.naver.com/seongbukrise/224385907808](https://blog.naver.com/seongbukrise/224385907808) | Reviewed official blog/form chain; campus name/address/1688-4607 | RISE corporate campus page confirms name/phone; direct blog body unavailable in web tool. Prior reviewed blog/form capture retained; no fresh HTTP-success claim. |
| POLY 관악 | [https://www.poly-english.com/campus/campusMain.do?searchClientCode=0601006](https://www.poly-english.com/campus/campusMain.do?searchClientCode=0601006) | poly.searchClientCode:0601006 | Official campus directory and its branch link read successfully; code/name/address/phone agree |
| POLY 대치폴리매그넷 | [https://www.poly-english.com/campus/campusMain.do?searchClientCode=2210003](https://www.poly-english.com/campus/campusMain.do?searchClientCode=2210003) | poly.searchClientCode:2210003 | Official campus directory and its branch link read successfully; code/name/address/phone agree |
| YBM ECC 대치 | [https://www.ybmecc.com/daechi](https://www.ybmecc.com/daechi) | ybmecc.sCode:105 | Official branch page read successfully; branch identity agrees with reviewed package |
| YBM ECC 강동 | [https://www.ybmecc.com/gangdong](https://www.ybmecc.com/gangdong) | ybmecc.sCode:101 | Official branch page read successfully; branch identity agrees with reviewed package |
| YBM ECC 노원 | [https://www.ybmecc.com/nowon](https://www.ybmecc.com/nowon) | ybmecc.sCode:120 | Official branch page read successfully; branch identity agrees with reviewed package |
| YBM ECC 석계 | [https://www.ybmecc.com/seokgye](https://www.ybmecc.com/seokgye) | ybmecc.sCode:123 | Official branch page read successfully; branch identity agrees with reviewed package |
| YBM ECC 성북 | [https://www.ybmecc.com/seongbuk](https://www.ybmecc.com/seongbuk) | ybmecc.sCode:114 | Official branch page read successfully; branch identity agrees with reviewed package |
| YBM ECC 송파잠실 | [https://www.ybmecc.com/songpa](https://www.ybmecc.com/songpa) | ybmecc.sCode:115 | Official branch page read successfully; branch identity agrees with reviewed package |
| YBM ECC 쌍문 | [https://www.ybmecc.com/ssangmun](https://www.ybmecc.com/ssangmun) | ybmecc.sCode:116 | Official branch page read successfully; branch identity agrees with reviewed package |

POLY official directory: https://www.poly-english.com/aboutpoly/campusList.do . RISE corporate campus: https://risekorea.com/seongbuk . The latter road-address text and the reviewed blog jibun address are not used to infer a relocation or new identity. The source URL and original campus mapping remain unchanged.

## Effects and remaining gate

- Source capture adds reviewed snapshot/observation/evidence only; it preserves original source rows. Public verification remains tied to official source types/authority and exact capture links.
- Monitoring candidate queries and followability require ACTIVE plus an enabled source_monitor_configs row. These queries are unchanged. DISCOVERED with an existing enabled monitor config remains non-monitorable, covered by regression.
- General native/legacy verification and international Fact verification remain ACTIVE-only. The exception is an explicit internal reviewed English-session entry point, inaccessible through an HTTP input flag.
- Dry-run and apply use the identical pure predicate, including official authority checks, and lock current source rows. Paused/retired/unofficial rows produce the same pre-write reject.
- Original staging apply was rolled back with zero new roots/identities/sessions/audits/cache events and unchanged notification/delivery/non-cache outbox hashes. Source inspection and this patch performed no staging data writes.
- Before staging retry, deploy this new exact image, rerun source/identity dry-run, backup/claim/fingerprint gates, and retain all 213 reviewed records and the existing canonical package checksum. No production execution is authorized by this review.

## Validation checkpoint

- Full unit suite: 170 files / 1,630 passed.
- Related integration: 12 files / 105 passed, including ordinary canonical opportunity verification.
- Focused allowlist/transaction/source preservation: 30 passed.
- Full reviewed-package local rehearsal seeded with the exact ten DISCOVERED URLs: 45 new roots,34 identity links,1 address correction,213 sessions; all unchanged on readback,10 sources remain DISCOVERED,notifications/deliveries/non-cache outbox additions0,cache events213.
- Typecheck and changed-file ESLint pass. No source activation, monitoring configuration, notification setting, reviewed data package, unrelated UI, production DB or staging import was changed by this patch.
