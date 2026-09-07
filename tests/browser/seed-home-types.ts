/** Local-only synthetic data for home discovery browser checks. */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { migrateDatabase } from "../../src/db/migrate";
import { assertDedicatedTestDatabaseUrl } from "../support/test-database";

const databaseUrl = process.env.TEST_DATABASE_URL ?? "";
assertDedicatedTestDatabaseUrl(databaseUrl);
if (new URL(databaseUrl).hostname !== "127.0.0.1")
  throw new Error("Local test database required");
const mode = process.argv[2];
if (mode !== "seed" && mode !== "cleanup")
  throw new Error("Use seed or cleanup");
const sql = postgres(databaseUrl, { max: 1 });
const categories = [
  "ENGLISH_KINDERGARTEN",
  "PRIVATE_ELEMENTARY",
  "INTERNATIONAL_SCHOOL",
] as const;
const labels = ["영어유치원", "사립초등학교", "국제학교"];
const slugs = categories.flatMap((category) =>
  Array.from(
    { length: 5 },
    (_, index) => `home-types-browser-${category.toLowerCase()}-${index}`,
  ),
);
try {
  if (mode === "cleanup") {
    await sql`delete from institutions where slug in ${sql(slugs)}`;
  } else {
    await migrateDatabase(databaseUrl);
    for (const [categoryIndex, category] of categories.entries()) {
      for (let index = 0; index < 5; index++) {
        const slug = `home-types-browser-${category.toLowerCase()}-${index}`;
        const name =
          index === 0
            ? `데모 ${labels[categoryIndex]} 0 긴 기관명 줄바꿈 확인 캠퍼스`
            : `데모 ${labels[categoryIndex]} ${index}`;
        await sql`insert into institutions (id, slug, display_name, category, publication_state, region_code, district, address_line, short_description, published_at)
          values (${randomUUID()}, ${slug}, ${name}, ${category}, 'PUBLISHED', 'KR-11', '서초구', '서울 서초구 · 브라우저 테스트 전용', '로컬 화면 검증용 합성 기관이에요.', now())
          on conflict (slug) do update set display_name = excluded.display_name`;
      }
    }
  }
  console.log(
    `Home browser fixture ${mode} completed (local test database only)`,
  );
} finally {
  await sql.end();
}
