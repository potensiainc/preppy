import postgres from "postgres";

import {
  seedWp14AnalyticsFixture,
  WP14_BROWSER_FIXTURE,
} from "@/tests/browser/wp14/seed-analytics";

// Reuses the WP-14 followable institution and adds the ISI identity that
// public international-school pages require.
const databaseUrl = process.env.DATABASE_URL ?? "";
await seedWp14AnalyticsFixture(
  databaseUrl,
  process.env.USER_SESSION_SECRET ?? "",
);
const sql = postgres(databaseUrl, { max: 1 });
try {
  await sql`
    insert into institution_registry_identities (
      institution_id, registry_name, registry_external_id,
      registry_record_url, registry_locator, metadata_json
    ) values (
      ${WP14_BROWSER_FIXTURE.institutionId}, 'ISI', 'kakao-e2e-isi',
      'https://official.example/isi/kakao-e2e', 'kakao-e2e', '{}'::jsonb
    ) on conflict (registry_name, registry_external_id) do nothing
  `;
} finally {
  await sql.end({ timeout: 5 });
}
process.stdout.write(`${WP14_BROWSER_FIXTURE.institutionSlug}\n`);
