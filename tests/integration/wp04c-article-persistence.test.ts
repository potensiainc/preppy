import { randomUUID } from "node:crypto";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { migrateDatabase } from "@/src/db/migrate";
import { assertDedicatedTestDatabaseUrl } from "@/tests/support/test-database";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("TEST_DATABASE_URL must be set");
assertDedicatedTestDatabaseUrl(databaseUrl);

const sql = postgres(databaseUrl, { max: 4 });
const schemaLockSql = postgres(databaseUrl, { max: 1 });
const prefix = `wp-04c-article-${randomUUID()}-`;
const primaryDatabaseName = new URL(databaseUrl).pathname.slice(1);
const upgradeDatabaseBase = primaryDatabaseName
  .replace(/(?:^|_)(?:test|verify\d*)$/, "")
  .replace(/[^a-zA-Z0-9_]/g, "_")
  .slice(0, 28);
const upgradeDatabaseName = `${upgradeDatabaseBase}_wp04c_verify${`${Date.now()}${randomUUID().replace(/\D/g, "")}`.slice(0, 20)}`;
if (!/^[A-Za-z0-9_]+_verify\d+$/.test(upgradeDatabaseName)) {
  throw new Error("WP-04C upgrade database name must be identifier-safe");
}
const upgradeDatabaseUrl = new URL(databaseUrl);
upgradeDatabaseUrl.pathname = `/${upgradeDatabaseName}`;
assertDedicatedTestDatabaseUrl(upgradeDatabaseUrl.toString());
const maintenanceDatabaseUrl = new URL(databaseUrl);
maintenanceDatabaseUrl.pathname = "/postgres";
const migrationDirectory = resolve(process.cwd(), "src/db/migrations");

async function currentMigrationJournal(): Promise<{
  entries: { idx: number; tag: string }[];
}> {
  return JSON.parse(
    await readFile(join(migrationDirectory, "meta", "_journal.json"), "utf8"),
  ) as { entries: { idx: number; tag: string }[] };
}

type Column = [string, string, string, "YES" | "NO", string | null];
type Constraint = { conname: string; contype: string; definition: string };

const fixtureIds = {
  articles: new Set<string>(),
  admins: new Set<string>(),
  institutions: new Set<string>(),
  opportunities: new Set<string>(),
};

async function article(
  input: {
    id?: string;
    slug?: string;
    status?: "DRAFT" | "PUBLISHED" | "UNPUBLISHED" | "ARCHIVED";
    title?: string;
    contentHtml?: string;
    publishedAt?: Date | null;
    authorAdminId?: string | null;
  } = {},
) {
  const id = input.id ?? randomUUID();
  await sql`insert into articles(
    id, slug, type, category, status, title, content_html, robots_index, robots_follow, published_at, author_admin_id
  ) values (
    ${id}, ${input.slug ?? `${prefix}article-${id}`}, 'GUIDE', 'ENGLISH_KINDERGARTEN',
    ${input.status ?? "DRAFT"}, ${input.title ?? "WP-04C Article"},
    ${input.contentHtml ?? "<p>Stored exactly; rendering belongs to a future boundary.</p>"}, true, true,
    ${input.publishedAt === undefined ? null : input.publishedAt},
    ${input.authorAdminId === undefined ? null : input.authorAdminId}
  )`;
  fixtureIds.articles.add(id);
  return id;
}

async function admin() {
  const id = randomUUID();
  await sql`insert into admin_users(id, external_auth_subject, email, display_name, status)
    values (${id}, ${`${prefix}admin-${id}`}, ${`${id}@example.test`}, 'WP-04C Admin', 'ACTIVE')`;
  fixtureIds.admins.add(id);
  return id;
}

async function institution() {
  const id = randomUUID();
  await sql`insert into institutions(id, slug, display_name, category)
    values (${id}, ${`${prefix}institution-${id}`}, 'WP-04C Native Kindergarten', 'ENGLISH_KINDERGARTEN')`;
  fixtureIds.institutions.add(id);
  return id;
}

async function opportunity() {
  const id = randomUUID();
  await sql`insert into opportunities(id, institution_id, slug, kind, truth_mode)
    values (${id}, ${await institution()}, ${`${prefix}opportunity-${id}`}, 'APPLICATION', 'NATIVE')`;
  fixtureIds.opportunities.add(id);
  return id;
}

async function catalog(tableName: string, executor: postgres.Sql = sql) {
  const [columns, constraints, indexes, triggers] = await Promise.all([
    executor<
      {
        column_name: string;
        data_type: string;
        udt_name: string;
        is_nullable: "YES" | "NO";
        column_default: string | null;
      }[]
    >`
      select column_name, data_type, udt_name, is_nullable, column_default
      from information_schema.columns where table_schema = 'public' and table_name = ${tableName}
      order by ordinal_position`,
    executor<Constraint[]>`
      select conname, contype, pg_get_constraintdef(oid) as definition from pg_constraint
      where conrelid = ${tableName}::regclass order by conname`,
    executor<{ indexname: string; indexdef: string }[]>`
      select indexname, indexdef from pg_indexes
      where schemaname = 'public' and tablename = ${tableName} order by indexname`,
    executor<{ trigger_name: string }[]>`
      select trigger.tgname as trigger_name from pg_trigger as trigger
      join pg_class as relation on relation.oid = trigger.tgrelid
      where relation.relname = ${tableName} and not trigger.tgisinternal order by trigger.tgname`,
  ]);
  return {
    columns: columns.map((column): Column => [
      column.column_name,
      column.data_type,
      column.udt_name,
      column.is_nullable,
      column.column_default,
    ]),
    constraints: Object.fromEntries(
      constraints.map((constraint) => [
        constraint.conname,
        [constraint.contype, constraint.definition],
      ]),
    ),
    indexes: Object.fromEntries(
      indexes.map((index) => [index.indexname, index.indexdef]),
    ),
    triggers,
  };
}

async function clearFixtures() {
  const ids = Object.fromEntries(
    Object.entries(fixtureIds).map(([key, values]) => [key, [...values]]),
  ) as Record<keyof typeof fixtureIds, string[]>;
  try {
    await sql.begin(async (transaction) => {
      if (ids.articles.length)
        await transaction`delete from articles where id in ${sql(ids.articles)}`;
      await transaction`delete from articles where slug like ${`${prefix}%`}`;
      await transaction`delete from url_redirects where source_path like ${`/${prefix}%`}`;
      if (ids.opportunities.length)
        await transaction`delete from opportunities where id in ${sql(ids.opportunities)}`;
      if (ids.institutions.length)
        await transaction`delete from institutions where id in ${sql(ids.institutions)}`;
      if (ids.admins.length)
        await transaction`delete from admin_users where id in ${sql(ids.admins)}`;
    });
  } finally {
    Object.values(fixtureIds).forEach((values) => values.clear());
  }
}

async function resetUpgradeDatabase() {
  const maintenance = postgres(maintenanceDatabaseUrl.toString(), { max: 1 });
  try {
    await maintenance`select pg_terminate_backend(pid) from pg_stat_activity
      where datname = ${upgradeDatabaseName} and pid <> pg_backend_pid()`;
    await maintenance`drop database if exists ${maintenance(upgradeDatabaseName)}`;
  } finally {
    await maintenance.end({ timeout: 5 });
  }
}

async function createPreWp04cMigrationFolder() {
  const folder = await mkdtemp(join(tmpdir(), "preppy-wp04c-upgrade-"));
  const meta = join(folder, "meta");
  await mkdir(meta);
  const journal = JSON.parse(
    await readFile(join(migrationDirectory, "meta", "_journal.json"), "utf8"),
  ) as { entries: unknown[] };
  journal.entries = journal.entries.slice(0, 8);
  await writeFile(
    join(meta, "_journal.json"),
    `${JSON.stringify(journal, null, 2)}\n`,
  );
  for (const filename of [
    "0000_absent_shen.sql",
    "0001_productive_morph.sql",
    "0002_spicy_starbolt.sql",
    "0003_stormy_mach_iv.sql",
    "0004_panoramic_vindicator.sql",
    "0005_canonical_identity_follow.sql",
    "0006_bright_garia.sql",
    "0007_unknown_morgan_stark.sql",
  ])
    await copyFile(join(migrationDirectory, filename), join(folder, filename));
  return folder;
}

async function migrateFolder(url: string, folder: string) {
  const client = postgres(url, { max: 1 });
  try {
    await migrate(drizzle(client), { migrationsFolder: folder });
  } finally {
    await client.end({ timeout: 5 });
  }
}

describe("WP-04C canonical Article, relation, and redirect persistence", () => {
  beforeAll(async () => {
    await schemaLockSql`select pg_advisory_lock(hashtext('admissionradar-schema-tests'))`;
    await migrateDatabase(databaseUrl);
  });
  afterEach(clearFixtures);
  afterAll(async () => {
    await schemaLockSql`select pg_advisory_unlock(hashtext('admissionradar-schema-tests'))`;
    await schemaLockSql.end({ timeout: 5 });
    await sql.end({ timeout: 5 });
  });

  it("exposes the exact four-table catalog, canonical FKs, indexes, and no runtime triggers", async () => {
    const articles = await catalog("articles");
    const articleInstitutions = await catalog("article_institutions");
    const articleOpportunities = await catalog("article_opportunities");
    const redirects = await catalog("url_redirects");
    expect(articles.columns).toEqual([
      ["id", "uuid", "uuid", "NO", "gen_random_uuid()"],
      ["slug", "text", "text", "NO", null],
      ["type", "text", "text", "NO", null],
      ["category", "text", "text", "NO", null],
      ["status", "text", "text", "NO", null],
      ["title", "text", "text", "NO", null],
      ["excerpt", "text", "text", "YES", null],
      ["content_html", "text", "text", "NO", null],
      ["seo_title", "text", "text", "YES", null],
      ["seo_description", "text", "text", "YES", null],
      ["canonical_url", "text", "text", "YES", null],
      ["robots_index", "boolean", "bool", "NO", null],
      ["robots_follow", "boolean", "bool", "NO", null],
      ["featured_image_url", "text", "text", "YES", null],
      ["featured_image_alt", "text", "text", "YES", null],
      ["author_admin_id", "uuid", "uuid", "YES", null],
      ["published_at", "timestamp with time zone", "timestamptz", "YES", null],
      [
        "unpublished_at",
        "timestamp with time zone",
        "timestamptz",
        "YES",
        null,
      ],
      ["archived_at", "timestamp with time zone", "timestamptz", "YES", null],
      ["created_at", "timestamp with time zone", "timestamptz", "NO", "now()"],
      ["updated_at", "timestamp with time zone", "timestamptz", "NO", "now()"],
    ]);
    expect(articleInstitutions.columns).toEqual([
      ["article_id", "uuid", "uuid", "NO", null],
      ["institution_id", "uuid", "uuid", "NO", null],
      ["relation_type", "text", "text", "NO", "'RELATED'::text"],
      ["sort_order", "integer", "int4", "YES", null],
      ["created_at", "timestamp with time zone", "timestamptz", "NO", "now()"],
    ]);
    expect(articleOpportunities.columns).toEqual([
      ["article_id", "uuid", "uuid", "NO", null],
      ["opportunity_id", "uuid", "uuid", "NO", null],
      ["relation_type", "text", "text", "NO", "'RELATED'::text"],
      ["sort_order", "integer", "int4", "YES", null],
      ["created_at", "timestamp with time zone", "timestamptz", "NO", "now()"],
    ]);
    expect(redirects.columns).toEqual([
      ["source_path", "text", "text", "NO", null],
      ["target_path", "text", "text", "NO", null],
      ["status_code", "integer", "int4", "NO", null],
      ["created_at", "timestamp with time zone", "timestamptz", "NO", "now()"],
      ["disabled_at", "timestamp with time zone", "timestamptz", "YES", null],
      ["reason", "text", "text", "YES", null],
    ]);
    expect(articles.constraints).toMatchObject({
      articles_pkey: ["p", "PRIMARY KEY (id)"],
      articles_slug_unique: ["u", "UNIQUE (slug)"],
      articles_type_check: [
        "c",
        "CHECK ((type = ANY (ARRAY['GUIDE'::text, 'UPDATE'::text, 'ROUNDUP'::text])))",
      ],
      articles_category_check: [
        "c",
        "CHECK ((category = ANY (ARRAY['ENGLISH_KINDERGARTEN'::text, 'PRIVATE_ELEMENTARY'::text, 'INTERNATIONAL_SCHOOL'::text, 'ADMISSIONS_GENERAL'::text])))",
      ],
      articles_status_check: [
        "c",
        "CHECK ((status = ANY (ARRAY['DRAFT'::text, 'PUBLISHED'::text, 'UNPUBLISHED'::text, 'ARCHIVED'::text])))",
      ],
      articles_author_admin_id_admin_users_id_fk: [
        "f",
        "FOREIGN KEY (author_admin_id) REFERENCES admin_users(id) ON DELETE RESTRICT",
      ],
    });
    expect(Object.values(articles.constraints).join(" ")).toContain(
      "^[a-z0-9]+(?:-[a-z0-9]+)*$",
    );
    expect(articleInstitutions.constraints).toMatchObject({
      article_institutions_article_id_articles_id_fk: [
        "f",
        "FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE",
      ],
      article_institutions_institution_id_institutions_id_fk: [
        "f",
        "FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE RESTRICT",
      ],
      article_institutions_article_institution_relation_unique: [
        "u",
        "UNIQUE (article_id, institution_id, relation_type)",
      ],
    });
    expect(articleOpportunities.constraints).toMatchObject({
      article_opportunities_article_id_articles_id_fk: [
        "f",
        "FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE",
      ],
      article_opportunities_opportunity_id_opportunities_id_fk: [
        "f",
        "FOREIGN KEY (opportunity_id) REFERENCES opportunities(id) ON DELETE RESTRICT",
      ],
      article_opportunities_article_opportunity_relation_unique: [
        "u",
        "UNIQUE (article_id, opportunity_id, relation_type)",
      ],
    });
    expect(Object.values(articleInstitutions.constraints).join(" ")).toContain(
      "RELATED",
    );
    expect(Object.values(articleOpportunities.constraints).join(" ")).toContain(
      "RELATED",
    );
    expect(redirects.constraints).toMatchObject({
      url_redirects_pkey: ["p", "PRIMARY KEY (source_path)"],
      url_redirects_status_code_check: [
        "c",
        "CHECK ((status_code = ANY (ARRAY[301, 308])))",
      ],
      url_redirects_not_self_check: [
        "c",
        "CHECK ((source_path <> target_path))",
      ],
    });
    expect(articles.indexes).toMatchObject({
      articles_slug_unique: expect.any(String),
      articles_status_published_idx:
        "CREATE INDEX articles_status_published_idx ON public.articles USING btree (status, published_at DESC NULLS LAST)",
    });
    expect(articleInstitutions.indexes).toMatchObject({
      article_institutions_target_article_idx:
        "CREATE INDEX article_institutions_target_article_idx ON public.article_institutions USING btree (institution_id, article_id)",
    });
    expect(articleOpportunities.indexes).toMatchObject({
      article_opportunities_target_article_idx:
        "CREATE INDEX article_opportunities_target_article_idx ON public.article_opportunities USING btree (opportunity_id, article_id)",
    });
    expect(
      [articles, articleInstitutions, articleOpportunities, redirects].flatMap(
        (entry) => entry.triggers,
      ),
    ).toEqual([]);
  });

  it("stores DRAFT and complete PUBLISHED Articles while rejecting invalid editorial state", async () => {
    const draft = await article();
    const published = await article({
      slug: `${prefix}published-${randomUUID()}`,
      status: "PUBLISHED",
      title: "Published",
      contentHtml: "<p>published</p>",
      publishedAt: new Date("2026-08-23T00:00:00Z"),
    });
    expect(
      await sql<
        { id: string; status: string }[]
      >`select id, status from articles where id in (${draft}, ${published}) order by status`,
    ).toEqual([
      { id: draft, status: "DRAFT" },
      { id: published, status: "PUBLISHED" },
    ]);
    const invalid = (values: {
      slug?: string;
      type?: string;
      category?: string;
      status?: string;
      title?: string;
      content?: string;
      publishedAt?: Date | null;
    }) =>
      sql`insert into articles(slug, type, category, status, title, content_html, robots_index, robots_follow, published_at) values (${values.slug ?? `${prefix}${randomUUID()}`}, ${values.type ?? "GUIDE"}, ${values.category ?? "ENGLISH_KINDERGARTEN"}, ${values.status ?? "DRAFT"}, ${values.title ?? "title"}, ${values.content ?? "content"}, true, true, ${values.publishedAt ?? null})`;
    await expect(invalid({ slug: "Unsafe Slug" })).rejects.toMatchObject({
      code: "23514",
    });
    await expect(invalid({ slug: "unsafe_slug" })).rejects.toMatchObject({
      code: "23514",
    });
    await expect(invalid({ type: "POST" })).rejects.toMatchObject({
      code: "23514",
    });
    await expect(invalid({ category: "OTHER" })).rejects.toMatchObject({
      code: "23514",
    });
    await expect(invalid({ status: "REVIEW" })).rejects.toMatchObject({
      code: "23514",
    });
    await expect(
      invalid({ status: "PUBLISHED", title: "   ", publishedAt: new Date() }),
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      invalid({ status: "PUBLISHED", content: "\n", publishedAt: new Date() }),
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      invalid({ status: "PUBLISHED", publishedAt: null }),
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("keeps HTML as opaque text and permits only nullable or valid canonical Admin authors", async () => {
    const unsafeHtml =
      "<script>untrusted()</script><p>Stored, never sanitized here.</p>";
    const anonymous = await article({ contentHtml: unsafeHtml });
    expect(
      await sql<
        { content_html: string; author_admin_id: string | null }[]
      >`select content_html, author_admin_id from articles where id = ${anonymous}`,
    ).toEqual([{ content_html: unsafeHtml, author_admin_id: null }]);
    const authorId = await admin();
    const authored = await article({ authorAdminId: authorId });
    expect(
      await sql<
        { author_admin_id: string }[]
      >`select author_admin_id from articles where id = ${authored}`,
    ).toEqual([{ author_admin_id: authorId }]);
    await expect(
      article({ authorAdminId: randomUUID() }),
    ).rejects.toMatchObject({ code: "23503" });
    await expect(
      sql`delete from admin_users where id = ${authorId}`,
    ).rejects.toMatchObject({ code: "23503" });
  });

  it("enforces canonical native many-to-many Article relations, both FK directions, and cascade direction", async () => {
    const articleId = await article();
    const secondArticleId = await article();
    const institutionId = await institution();
    const secondInstitutionId = await institution();
    const opportunityId = await opportunity();
    const secondOpportunityId = await opportunity();
    await sql`insert into article_institutions(article_id, institution_id, sort_order) values (${articleId}, ${institutionId}, 1), (${articleId}, ${secondInstitutionId}, 2), (${secondArticleId}, ${institutionId}, 3)`;
    await sql`insert into article_opportunities(article_id, opportunity_id, sort_order) values (${articleId}, ${opportunityId}, 1), (${articleId}, ${secondOpportunityId}, 2), (${secondArticleId}, ${opportunityId}, 3)`;
    expect(
      await sql<{ institution_count: number; opportunity_count: number }[]>`
        select (select count(*)::int from article_institutions where article_id = ${articleId}) as institution_count,
          (select count(*)::int from article_opportunities where article_id = ${articleId}) as opportunity_count`,
    ).toEqual([{ institution_count: 2, opportunity_count: 2 }]);
    expect(
      await sql<
        {
          institution_article_count: number;
          opportunity_article_count: number;
        }[]
      >`
        select (select count(*)::int from article_institutions where institution_id = ${institutionId}) as institution_article_count,
          (select count(*)::int from article_opportunities where opportunity_id = ${opportunityId}) as opportunity_article_count`,
    ).toEqual([{ institution_article_count: 2, opportunity_article_count: 2 }]);
    await expect(
      sql`insert into article_institutions(article_id, institution_id) values (${articleId}, ${institutionId})`,
    ).rejects.toMatchObject({ code: "23505" });
    await expect(
      sql`insert into article_opportunities(article_id, opportunity_id) values (${articleId}, ${opportunityId})`,
    ).rejects.toMatchObject({ code: "23505" });
    await expect(
      sql`insert into article_institutions(article_id, institution_id) values (${randomUUID()}, ${institutionId})`,
    ).rejects.toMatchObject({ code: "23503" });
    await expect(
      sql`insert into article_institutions(article_id, institution_id) values (${articleId}, ${randomUUID()})`,
    ).rejects.toMatchObject({ code: "23503" });
    await expect(
      sql`insert into article_opportunities(article_id, opportunity_id) values (${randomUUID()}, ${opportunityId})`,
    ).rejects.toMatchObject({ code: "23503" });
    await expect(
      sql`insert into article_opportunities(article_id, opportunity_id) values (${articleId}, ${randomUUID()})`,
    ).rejects.toMatchObject({ code: "23503" });
    await expect(
      sql`insert into article_institutions(article_id, institution_id, relation_type) values (${articleId}, ${institutionId}, 'FEATURED')`,
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      sql`delete from institutions where id = ${institutionId}`,
    ).rejects.toMatchObject({ code: "23503" });
    await expect(
      sql`delete from opportunities where id = ${opportunityId}`,
    ).rejects.toMatchObject({ code: "23503" });
    await sql`delete from articles where id = ${articleId}`;
    fixtureIds.articles.delete(articleId);
    expect(
      await sql<
        { count: number }[]
      >`select count(*)::int as count from article_institutions where institution_id = ${secondInstitutionId}`,
    ).toEqual([{ count: 0 }]);
    expect(
      await sql<
        { count: number }[]
      >`select count(*)::int as count from article_opportunities where opportunity_id = ${secondOpportunityId}`,
    ).toEqual([{ count: 0 }]);
  });

  it("accepts safe internal 301/308 redirects and rejects unsafe graph input without graph triggers", async () => {
    await sql`insert into url_redirects(source_path, target_path, status_code) values (${`/${prefix}old`}, '/articles/current', 301), (${`/${prefix}older`}, '/articles/current', 308)`;
    await expect(
      sql`insert into url_redirects(source_path, target_path, status_code) values (${`/${prefix}old`}, '/other', 301)`,
    ).rejects.toMatchObject({ code: "23505" });
    await expect(
      sql`insert into url_redirects(source_path, target_path, status_code) values ('/same', '/same', 301)`,
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      sql`insert into url_redirects(source_path, target_path, status_code) values (${`/${prefix}temporary`}, '/articles/current', 302)`,
    ).rejects.toMatchObject({ code: "23514" });
    for (const [source, target] of [
      ["relative", "/x"],
      ["//protocol", "/x"],
      ["/space path", "/x"],
      ["/back\\slash", "/x"],
      ["/query?x=1", "/x"],
      ["/fragment#x", "/x"],
      ["/colon:x", "/x"],
      ["/safe", "https://example.test"],
      ["/safe2", "//example.test"],
      ["/safe3", "javascript:alert(1)"],
    ] as const) {
      await expect(
        sql`insert into url_redirects(source_path, target_path, status_code) values (${source}, ${target}, 301)`,
      ).rejects.toMatchObject({ code: "23514" });
    }
    await sql`insert into url_redirects(source_path, target_path, status_code) values (${`/${prefix}chain-a`}, ${`/${prefix}chain-b`}, 301), (${`/${prefix}chain-b`}, ${`/${prefix}chain-a`}, 308)`;
  });

  it("serializes duplicate Article identities and relation/redirect keys across independent clients", async () => {
    const articleId = randomUUID();
    const institutionId = await institution();
    const opportunityId = await opportunity();
    const a = postgres(databaseUrl, { max: 1 });
    const b = postgres(databaseUrl, { max: 1 });
    const race = async (
      insert: (executor: postgres.ISql) => Promise<unknown>,
    ) => {
      let arrived = 0;
      let releaseBarrier: () => void;
      const barrier = new Promise<void>((resolveBarrier) => {
        releaseBarrier = resolveBarrier;
      });
      const contender = (executor: postgres.Sql) =>
        executor.begin(async (transaction) => {
          arrived += 1;
          if (arrived === 2) releaseBarrier!();
          await barrier;
          return insert(transaction);
        });
      const results = await Promise.allSettled([contender(a), contender(b)]);
      expect(
        results.filter((result) => result.status === "fulfilled"),
      ).toHaveLength(1);
      expect(
        results.find((result) => result.status === "rejected"),
      ).toMatchObject({ reason: { code: "23505" } });
    };
    try {
      const slug = `${prefix}race-slug-${randomUUID()}`;
      await race(
        (executor) =>
          executor`insert into articles(slug, type, category, status, title, content_html, robots_index, robots_follow) values (${slug}, 'GUIDE', 'ENGLISH_KINDERGARTEN', 'DRAFT', 'title', 'content', true, true)`,
      );
      await article({ id: articleId });
      await race(
        (executor) =>
          executor`insert into article_institutions(article_id, institution_id) values (${articleId}, ${institutionId})`,
      );
      await race(
        (executor) =>
          executor`insert into article_opportunities(article_id, opportunity_id) values (${articleId}, ${opportunityId})`,
      );
      const source = `/${prefix}race-redirect-${randomUUID()}`;
      await race(
        (executor) =>
          executor`insert into url_redirects(source_path, target_path, status_code) values (${source}, '/target', 301)`,
      );
    } finally {
      await a.end({ timeout: 5 });
      await b.end({ timeout: 5 });
    }
  });

  it("preserves legacy Guide/Update and Outbox/Notification state and upgrades an actual 0000-0007 ledger exactly once", async () => {
    const legacyGuide = randomUUID();
    const legacyUpdate = randomUUID();
    await sql`insert into guides(id, slug, status, title, summary, body_markdown) values (${legacyGuide}, ${`${prefix}guide`}, 'DRAFT', 'Guide', 'Summary', 'Body')`;
    await sql`insert into updates(id, slug, status, title, summary, body_markdown) values (${legacyUpdate}, ${`${prefix}update`}, 'DRAFT', 'Update', 'Summary', 'Body')`;
    const beforeLegacy = await sql<
      { row: Record<string, unknown> }[]
    >`select to_jsonb(guide) as row from guides as guide where id = ${legacyGuide} union all select to_jsonb(update) from updates as update where id = ${legacyUpdate}`;
    const beforeSideEffects = await sql<
      { outbox_count: number; notification_count: number }[]
    >`
      select (select count(*)::int from outbox_events) as outbox_count,
        (select count(*)::int from notifications) as notification_count`;
    await article();
    expect(
      await sql<
        { row: Record<string, unknown> }[]
      >`select to_jsonb(guide) as row from guides as guide where id = ${legacyGuide} union all select to_jsonb(update) from updates as update where id = ${legacyUpdate}`,
    ).toEqual(beforeLegacy);
    expect(
      await sql<{ outbox_count: number; notification_count: number }[]>`
      select (select count(*)::int from outbox_events) as outbox_count,
        (select count(*)::int from notifications) as notification_count`,
    ).toEqual(beforeSideEffects);
    expect(
      await sql<{ source: string; target: string }[]>`
      select source.relname as source, target.relname as target
      from pg_constraint as foreign_key
      join pg_class as source on source.oid = foreign_key.conrelid
      join pg_class as target on target.oid = foreign_key.confrelid
      where source.relname in ('article_institutions', 'article_opportunities')
        and target.relname in ('schools', 'admission_events', 'guides', 'updates')`,
    ).toEqual([]);
    await sql`delete from guides where id = ${legacyGuide}`;
    await sql`delete from updates where id = ${legacyUpdate}`;
    await resetUpgradeDatabase();
    const maintenance = postgres(maintenanceDatabaseUrl.toString(), { max: 1 });
    const folder = await createPreWp04cMigrationFolder();
    let upgrade: postgres.Sql | undefined;
    try {
      await maintenance`create database ${maintenance(upgradeDatabaseName)}`;
      await migrateFolder(upgradeDatabaseUrl.toString(), folder);
      upgrade = postgres(upgradeDatabaseUrl.toString(), { max: 1 });
      const ledgerBefore = await upgrade<
        { id: number; hash: string; created_at: Date }[]
      >`select id, hash, created_at from drizzle.__drizzle_migrations order by id`;
      expect(ledgerBefore).toHaveLength(8);
      const currentJournal = await currentMigrationJournal();
      expect(
        currentJournal.entries.find((entry) => entry.idx === 8),
      ).toMatchObject({ tag: "0008_short_toxin" });
      const frozenGuide = randomUUID();
      const frozenUpdate = randomUUID();
      const frozenInstitution = randomUUID();
      const frozenOpportunity = randomUUID();
      await upgrade`insert into institutions(id, slug, display_name, category) values (${frozenInstitution}, 'frozen-institution', 'Frozen Institution', 'ENGLISH_KINDERGARTEN')`;
      await upgrade`insert into opportunities(id, institution_id, slug, kind, truth_mode) values (${frozenOpportunity}, ${frozenInstitution}, 'frozen-opportunity', 'APPLICATION', 'NATIVE')`;
      await upgrade`insert into guides(id, slug, status, title, summary, body_markdown) values (${frozenGuide}, 'frozen-guide', 'DRAFT', 'Guide', 'Summary', 'Body')`;
      await upgrade`insert into updates(id, slug, status, title, summary, body_markdown) values (${frozenUpdate}, 'frozen-update', 'DRAFT', 'Update', 'Summary', 'Body')`;
      await upgrade`insert into outbox_events(event_type, aggregate_type, aggregate_id, payload) values ('WP04C_UPGRADE', 'ARTICLE', ${randomUUID()}, '{"scope":"frozen"}'::jsonb)`;
      await upgrade`insert into notifications(id, opportunity_id, signal_type, policy_version, status, signal_published_at, title_snapshot, body_context_json, deep_link_path, dedupe_key) values (${randomUUID()}, ${frozenOpportunity}, 'OPPORTUNITY_PUBLISHED', 'frozen-v1', 'PENDING', now(), 'Frozen notification', '{"scope":"frozen"}'::jsonb, '/frozen', 'frozen-notification')`;
      const snapshotLegacyAndOperational = async () => ({
        guides: {
          catalog: await catalog("guides", upgrade!),
          rows: await upgrade!<
            { row: Record<string, unknown> }[]
          >`select to_jsonb(guide) as row from guides as guide order by guide.id`,
        },
        updates: {
          catalog: await catalog("updates", upgrade!),
          rows: await upgrade!<
            { row: Record<string, unknown> }[]
          >`select to_jsonb(update) as row from updates as update order by update.id`,
        },
        outbox: {
          catalog: await catalog("outbox_events", upgrade!),
          rows: await upgrade!<
            { row: Record<string, unknown> }[]
          >`select to_jsonb(event) as row from outbox_events as event order by event.id`,
        },
        notifications: {
          catalog: await catalog("notifications", upgrade!),
          rows: await upgrade!<
            { row: Record<string, unknown> }[]
          >`select to_jsonb(notification) as row from notifications as notification order by notification.id`,
        },
      });
      const frozen = await snapshotLegacyAndOperational();
      await migrateDatabase(upgradeDatabaseUrl.toString());
      const ledgerAfter = await upgrade<
        { id: number; hash: string; created_at: Date }[]
      >`select id, hash, created_at from drizzle.__drizzle_migrations order by id`;
      expect(ledgerAfter).toHaveLength(currentJournal.entries.length);
      expect(ledgerAfter.slice(0, 8)).toEqual(ledgerBefore);
      expect(await snapshotLegacyAndOperational()).toEqual(frozen);
      expect(
        await upgrade<{ relname: string }[]>`
          select relname from pg_class
          where relnamespace = 'public'::regnamespace
            and relname in ('articles', 'article_institutions', 'article_opportunities', 'url_redirects')
          order by relname`,
      ).toEqual([
        { relname: "article_institutions" },
        { relname: "article_opportunities" },
        { relname: "articles" },
        { relname: "url_redirects" },
      ]);
      await migrateDatabase(upgradeDatabaseUrl.toString());
      expect(
        await upgrade<
          { id: number; hash: string; created_at: Date }[]
        >`select id, hash, created_at from drizzle.__drizzle_migrations order by id`,
      ).toEqual(ledgerAfter);
      expect(await snapshotLegacyAndOperational()).toEqual(frozen);
    } finally {
      await upgrade?.end({ timeout: 5 });
      await maintenance.end({ timeout: 5 });
      await rm(folder, { recursive: true, force: true });
      await resetUpgradeDatabase();
    }
  });
});
