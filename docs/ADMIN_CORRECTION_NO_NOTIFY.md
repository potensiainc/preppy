# Admin correction without customer notifications

The monitoring verification forms now retain complete current Fact `valueJson` and legacy `officialNotes`. A small date correction must not silently replace unrelated structured conditions or notes with empty defaults.

## Explicit correction mode

The existing authenticated admin verify endpoints accept optional `correction` with mode `ADMIN_CORRECTION_NO_NOTIFY` and a required allowlisted reason (dates, status, or content). The checkbox is off by default. Existing authentication, Origin checks, source binding/provenance validation, optimistic version checks and transactional row locks still apply. This option cannot be combined with a materiality override.

Correction still creates the normal verified version, evidence and canonical change. Materiality stays server-derived, including NOTIFIABLE where appropriate. Audit records contain the correction reason; canonical changes use action `ADMIN_CORRECTION_NO_NOTIFY`. Only customer notification outbox enqueue is skipped. Already-enqueued normal updates cannot be retroactively silenced by replaying as a correction.

A changed correction atomically enqueues a cache-only event. Failed cache enqueue rolls back the content transaction. Source/evidence-only correction is unsupported: the source reason is rejected and a correction without a content change is rejected before writing an observation/audit. Idempotent replay does not enqueue duplicate cache work. V2 cache payloads contain only validated IDs and a fixed reason; the authenticated cache handler derives related public paths/tags from the database. Existing article V1 events remain supported.

## Captured evidence and international public reads

The admin observation DTO and form preserve the snapshot ID alongside the observation ID. For international-school corrections the command requires both IDs, an official source of PRIMARY/SECONDARY_OFFICIAL authority, and an observation linked to that exact snapshot. Existing source/binding checks also verify both records belong to the submitted source. Missing or mismatched capture is rejected before any new current version is written. The public projection gate remains unchanged. Evidence is explicitly submitted and validated; older evidence is not silently copied.

## Release and operation boundaries

This patch does not migrate schemas, create institutions/opportunities, change admin roles, add public navigation, update production content, or authorize deployment.

When separately authorized to release, deploy the V1+V2-compatible worker/cache consumer before enabling the web correction producer. Check release integrity and cache event delivery before using correction. Do not roll a consumer back to V1-only while V2 events remain queued; drain/retry through a compatible consumer first. Existing normal notification behavior is unchanged.

Before a production correction, save the full current readback and expected version, preserve fields outside the intended edit, record official evidence/check time, submit through the existing admin form, then verify saved version/evidence/audit/cache and public output. Restore mistaken content with another verified version, preserving audit history. This PR does not perform those production actions.
