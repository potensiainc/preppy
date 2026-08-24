import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import postgres from "postgres";

import { assertDedicatedTestDatabaseUrl } from "../../support/test-database";
import {
  seedAdminConsole,
  WP11_BROWSER_FIXTURE,
} from "../wp11/seed-admin-console";

export const WP12B_BROWSER_FIXTURE = {
  userId: "12121212-1212-4121-8121-121212121212",
  notificationId: "13131313-1313-4131-8131-131313131313",
  deliveryId: "14141414-1414-4141-8141-141414141414",
  outboxId: "15151515-1515-4151-8151-151515151515",
  attemptId: "16161616-1616-4161-8161-161616161616",
} as const;

export async function seedWp12bOperations(databaseUrl: string) {
  assertDedicatedTestDatabaseUrl(databaseUrl);
  await seedAdminConsole(databaseUrl);
  const sql = postgres(databaseUrl, { max: 1 });
  try {
    await sql.begin(async (transaction) => {
      await transaction`
        insert into users(id, status, activated_at)
        values (${WP12B_BROWSER_FIXTURE.userId}, 'ACTIVE', now() - interval '1 day')`;
      await transaction`
        insert into notifications(
          id, opportunity_id, signal_type, policy_version, status,
          signal_published_at, title_snapshot, body_context_json,
          deep_link_path, dedupe_key, ready_at
        ) values (
          ${WP12B_BROWSER_FIXTURE.notificationId},
          ${WP11_BROWSER_FIXTURE.opportunityId}, 'OPPORTUNITY_PUBLISHED',
          'WP12B_BROWSER_V1', 'READY', now() - interval '2 hours',
          'WP-12B Browser Notification', '{}'::jsonb,
          '/opportunities/wp11-browser-opportunity',
          'wp12b-browser-notification', now() - interval '2 hours'
        )`;
      await transaction`
        insert into notification_deliveries(
          id, notification_id, user_id, channel, status, recipient_hash,
          queued_at
        ) values (
          ${WP12B_BROWSER_FIXTURE.deliveryId},
          ${WP12B_BROWSER_FIXTURE.notificationId},
          ${WP12B_BROWSER_FIXTURE.userId}, 'EMAIL', 'QUEUED',
          ${`sha256:${"a".repeat(64)}`}, now() - interval '1 hour'
        )`;
      await transaction`
        insert into outbox_events(
          id, event_type, aggregate_type, aggregate_id, payload, status,
          available_at, attempt_count, max_attempts, last_error_code,
          last_error_at, dedupe_key
        ) values (
          ${WP12B_BROWSER_FIXTURE.outboxId}, 'DELIVERY_EMAIL_SEND',
          'NOTIFICATION_DELIVERY', ${WP12B_BROWSER_FIXTURE.deliveryId},
          ${transaction.json({
            deliveryId: WP12B_BROWSER_FIXTURE.deliveryId,
            providerRequest: {
              provider: "RESEND",
              version: 1,
              idempotencyKey: `preppy-delivery/${WP12B_BROWSER_FIXTURE.deliveryId}/v1`,
              payloadHash: `sha256:${"b".repeat(64)}`,
            },
          })},
          'FAILED', now() - interval '1 hour', 1, 3,
          'PROVIDER_RESULT_UNKNOWN', now() - interval '59 minutes',
          'wp12b-browser-delivery-send'
        )`;
      await transaction`
        insert into notification_delivery_attempts(
          id, notification_delivery_id, attempt_number, provider,
          attempt_status, error_code, attempted_at
        ) values (
          ${WP12B_BROWSER_FIXTURE.attemptId},
          ${WP12B_BROWSER_FIXTURE.deliveryId}, 1, 'RESEND', 'STARTED',
          'PROVIDER_RESULT_UNKNOWN', now() - interval '59 minutes'
        )`;
    });
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL ?? process.env.TEST_DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  await seedWp12bOperations(databaseUrl);
  process.stdout.write(
    `${JSON.stringify({ type: "WP12B_OPERATIONS_SEEDED", ...WP12B_BROWSER_FIXTURE })}\n`,
  );
}

const isMain =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  main().catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : "WP-12B browser seed failed"}\n`,
    );
    process.exit(1);
  });
}
