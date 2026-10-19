# Independent review resolution

The original e2dc822 image run 39114955729 failed before publishing. It is superseded and is not a deployment candidate.

- R1: Docker excludes scripts/qa, preserving test-only imports outside production without copying tests.
- R2: Home/briefings use future event time for English sessions independently of booking status; official evidence, publication and verification gates remain. Other categories retain prior state rules.
- R3: Existing DRAFT/HIDDEN/ARCHIVED sessions reject before writes, with publicationState in before/readback. No automatic publish.
- R4: Dedicated cache-only command fixes event types for claim AND recovery. General worker email-off is explicitly prohibited during the correction window. Due and stale supported notification events remain byte-for-byte unchanged in the regression.
- R5/R8: Persisted reviewed campus aliases survive last-event expiry/cancellation; cards display the matched alias and link to full institution schedule without a mismatched event anchor.
- R6: Durable namespace/external-ID primary key across all campus publication states; renamed/moved/null-URL duplicate rejects. Unknown IDs on older production records still need explicit reconciliation.
- R7: Re-review removes mutable note/evidence from identity. Official IDs take precedence across rescheduled times; no-ID same-time rows use only explicit normalized audience/program. Package and DB use the same occurrence fingerprint; key-only clones reject before commit. Distinct explicit official IDs at the same time apply and replay consistently. Unidentified pre-existing time collisions require reconciliation.
- B1: International-school Fact correction requires official source plus matching observation-to-snapshot capture. Missing/mismatched capture rejects; accepted correction remains visible in public Fact readback. This base-related fix is included in PR41, without rewriting PR40 history.

Local evidence: full unit 169 files/1,621 tests; expanded integration 11 files/72 tests; isolated full-package first import 45 roots/1 address/213 sessions plus 34 identity links; exact replay zero writes to roots/versions/cache. No production DB dry-run/import/migration or Railway change was performed.

Canonical package checksum after additive nullable reviewed identity/program defaults: fb9140e21c285bf4c95a34c6806b0d103fdadbeb0ae26370868989d6de1b178d. The underlying 213 reviewed session records and stable keys are unchanged.

Production management remains blocked: no authorized DB administration execution path is connected; existing dry-run uses locks and is not a strictly read-only transaction. No tokens or credentials were extracted and privileges were not expanded.
