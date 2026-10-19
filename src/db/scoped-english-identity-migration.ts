import {
  lockMigrationLedger,
  type MigrationSql,
  type MigrationTx,
} from "./migrate";
import {
  planEnglishIdentityMigration,
  migrationStatements,
  stop,
  ENGLISH_IDENTITY_MIGRATION,
  type MigrationSpec,
} from "./migration-plan";
import {
  verifyScopedBackup,
  type ScopedBackupReceipt,
} from "./scoped-migration-backup";
export const SCOPED_TARGETS = {
  production: {
    environmentId: "f3eb0933-6bef-4947-98f0-2b1bff9bea73",
    databaseServiceId: "781a0b16-5a2c-46ea-9ca4-6c975827971d",
    database: "railway",
  },
  staging: {
    environmentId: "94d9b877-5fb2-49f1-87d9-4e939a3db7d2",
    databaseServiceId: "6561a868-281c-42a6-ac52-b93de463fb66",
    database: "preppy_staging",
  },
} as const;
export type ScopedTarget = {
  environmentId: string;
  databaseServiceId: string;
  database: string;
};
export function assertScopedEnvironment(
  target: ScopedTarget,
  env: Record<string, string | undefined> = process.env,
) {
  if (
    env.RAILWAY_ENVIRONMENT_ID !== target.environmentId ||
    env.RAILWAY_SERVICE_ID !== target.databaseServiceId
  )
    stop("SCOPED_ENVIRONMENT_MISMATCH");
}
export async function ledgerFingerprint(
  tx: MigrationTx,
  excludeTarget = false,
) {
  const [r] =
    await tx`select encode(sha256(convert_to(coalesce(jsonb_agg(jsonb_build_object('id',id,'hash',hash,'created_at',created_at) order by id),'[]'::jsonb)::text,'UTF8')),'hex') as hash from drizzle.__drizzle_migrations where not ${excludeTarget} or hash<>${ENGLISH_IDENTITY_MIGRATION.hash}`;
  return r!.hash as string;
}
const tables = [
  "english_campus_identities",
  "english_campus_aliases",
  "english_session_identities",
];
const expectedColumns = [
  ["english_campus_identities", "namespace", "text"],
  ["english_campus_identities", "external_id", "text"],
  ["english_campus_identities", "institution_id", "uuid"],
  ["english_campus_aliases", "institution_id", "uuid"],
  ["english_campus_aliases", "name", "text"],
  ["english_session_identities", "opportunity_id", "uuid"],
  ["english_session_identities", "fingerprint", "text"],
];
export async function inspectEnglishIdentitySchema(tx: MigrationTx) {
  const relations =
    await tx`select c.relname,c.relkind,pg_get_userbyid(c.relowner) as owner from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=any(${tables}) order by c.relname`;
  if (!relations.length) return "ABSENT" as const;
  if (
    relations.length !== 3 ||
    relations.some((x) => x.relkind !== "r" || x.owner !== "preppy_migration")
  )
    stop("SCOPED_SCHEMA_DRIFT");
  const cols =
    await tx`select c.relname,a.attname,format_type(a.atttypid,a.atttypmod) as type,a.attnotnull,a.attidentity,a.attgenerated,pg_get_expr(d.adbin,d.adrelid) as default_value from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where n.nspname='public' and c.relname=any(${tables}) and a.attnum>0 and not a.attisdropped`;
  if (
    cols.length !== 7 ||
    expectedColumns.some(
      ([t, n, type]) =>
        !cols.some(
          (c) =>
            c.relname === t &&
            c.attname === n &&
            c.type === type &&
            c.attnotnull &&
            !c.attidentity &&
            !c.attgenerated &&
            c.default_value === null,
        ),
    )
  )
    stop("SCOPED_SCHEMA_DRIFT");
  const constraints =
    await tx`select c.relname,co.contype,co.condeferrable,co.convalidated,array(select a.attname::text from unnest(co.conkey) with ordinality k(num,ord) join pg_attribute a on a.attrelid=c.oid and a.attnum=k.num order by k.ord) as columns,co.confrelid::regclass::text as target,co.confdeltype,co.confupdtype,array(select a.attname::text from unnest(co.confkey) with ordinality k(num,ord) join pg_attribute a on a.attrelid=co.confrelid and a.attnum=k.num order by k.ord) as target_columns from pg_constraint co join pg_class c on c.oid=co.conrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=any(${tables}) and co.contype<>'n'`;
  const pks = [
    ["english_campus_identities", ["namespace", "external_id"]],
    ["english_campus_aliases", ["institution_id", "name"]],
    ["english_session_identities", ["opportunity_id"]],
  ] as const;
  if (
    constraints.length !== 6 ||
    pks.some(
      ([t, cols]) =>
        !constraints.some(
          (c) =>
            c.relname === t &&
            c.contype === "p" &&
            JSON.stringify(c.columns) === JSON.stringify(cols),
        ),
    )
  )
    stop("SCOPED_SCHEMA_DRIFT");
  for (const t of tables) {
    const col =
        t === "english_session_identities"
          ? "opportunity_id"
          : "institution_id",
      target =
        t === "english_session_identities" ? "opportunities" : "institutions";
    if (
      !constraints.some(
        (c) =>
          c.relname === t &&
          c.contype === "f" &&
          JSON.stringify(c.columns) === JSON.stringify([col]) &&
          c.target === target &&
          JSON.stringify(c.target_columns) === '["id"]' &&
          c.confdeltype === "r" &&
          c.confupdtype === "a" &&
          !c.condeferrable &&
          c.convalidated,
      )
    )
      stop("SCOPED_SCHEMA_DRIFT");
  }
  const [extras] =
    await tx`select (select count(*) from pg_trigger tr join pg_class c on c.oid=tr.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=any(${tables}) and not tr.tgisinternal)::int as triggers,(select count(*) from pg_indexes where schemaname='public' and tablename=any(${tables}))::int as indexes`;
  if (extras!.triggers !== 0 || extras!.indexes !== 3)
    stop("SCOPED_SCHEMA_DRIFT");
  for (const table of tables) {
    const [acl] =
      await tx`select has_table_privilege('preppy_runtime',${"public." + table},'SELECT') as r,has_table_privilege('preppy_runtime',${"public." + table},'INSERT') as i,has_table_privilege('preppy_runtime',${"public." + table},'UPDATE') as u,has_table_privilege('preppy_runtime',${"public." + table},'DELETE') as d`;
    if (!acl!.r || !acl!.i || !acl!.u || !acl!.d)
      stop("SCOPED_EXISTING_DEFAULT_ACL_REQUIRED");
  }
  return "EXACT" as const;
}
async function assertDependencies(tx: MigrationTx) {
  for (const name of ["institutions", "opportunities"]) {
    const [r] =
      await tx`select count(*)::int as count from pg_class c join pg_namespace n on n.oid=c.relnamespace join pg_attribute a on a.attrelid=c.oid join pg_constraint co on co.conrelid=c.oid and co.contype='p' and co.conkey=array[a.attnum] where n.nspname='public' and c.relname=${name} and c.relkind='r' and a.attname='id' and a.attnotnull and format_type(a.atttypid,a.atttypmod)='uuid'`;
    if (r!.count !== 1) stop("SCOPED_SCHEMA_DEPENDENCY_MISSING");
  }
}
export async function runScopedEnglishIdentityMigration(
  client: MigrationSql,
  specs: readonly MigrationSpec[],
  options: {
    target: ScopedTarget;
    backupReceiptPath: string;
    apply: boolean;
    expectedSqlChecksum: string;
    acknowledgeDeferred0017: boolean;
    environment?: Record<string, string | undefined>;
  },
) {
  assertScopedEnvironment(options.target, options.environment);
  if (options.expectedSqlChecksum !== ENGLISH_IDENTITY_MIGRATION.hash)
    stop("SCOPED_MIGRATION_CHECKSUM_MISMATCH");
  const backup: ScopedBackupReceipt = await verifyScopedBackup(
    options.backupReceiptPath,
  );
  if (
    backup.target.environmentId !== options.target.environmentId ||
    backup.target.databaseServiceId !== options.target.databaseServiceId ||
    backup.target.database !== options.target.database
  )
    stop("BACKUP_TARGET_MISMATCH");
  return client.begin(async (tx) => {
    const [identity] = await tx`select current_database() as database`;
    if (identity!.database !== options.target.database)
      stop("SCOPED_DATABASE_MISMATCH");
    const ledger = await lockMigrationLedger(tx);
    if (ledger === null) stop("SCOPED_PREDECESSOR_MISSING");
    const plan = planEnglishIdentityMigration(specs, ledger);
    if (plan.deferred0017 && !options.acknowledgeDeferred0017)
      stop("SCOPED_DEFERRED0017_ACK_REQUIRED");
    const commands = migrationStatements(plan.migration);
    const before = JSON.stringify(ledger);
    const currentLedgerHash = await ledgerFingerprint(tx);
    const originalLedgerHash = plan.applied
      ? await ledgerFingerprint(tx, true)
      : currentLedgerHash;
    if (
      backup.ledgerSha256 !== currentLedgerHash &&
      backup.ledgerSha256 !== originalLedgerHash
    )
      stop("BACKUP_LEDGER_MISMATCH");
    await assertDependencies(tx);
    await tx`set local role preppy_migration`;
    const state = await inspectEnglishIdentitySchema(tx);
    if (
      (plan.applied && state !== "EXACT") ||
      (!plan.applied && state !== "ABSENT")
    )
      stop("SCOPED_LEDGER_SCHEMA_MISMATCH");
    if (plan.applied || !options.apply)
      return {
        mode: plan.applied ? "NO_OP" : "DRY_RUN",
        applied: false,
        migration: plan.migration.identifier,
        deferred0017: plan.deferred0017,
        fullLedgerReady: plan.applied && !plan.deferred0017,
      };
    for (const statement of commands) await tx.unsafe(statement);
    if ((await inspectEnglishIdentitySchema(tx)) !== "EXACT")
      stop("SCOPED_SCHEMA_READBACK_FAILED");
    await tx`insert into drizzle.__drizzle_migrations(hash,created_at) values(${plan.migration.hash},${plan.migration.when})`;
    const after =
      await tx`select id,hash,created_at from drizzle.__drizzle_migrations where hash<>${plan.migration.hash} order by id`;
    if (JSON.stringify(after) !== before) stop("EXISTING_LEDGER_CHANGED");
    if ((await ledgerFingerprint(tx, true)) !== backup.ledgerSha256)
      stop("EXISTING_LEDGER_CHANGED");
    return {
      mode: "APPLIED",
      applied: true,
      migration: plan.migration.identifier,
      checksum: plan.migration.hash,
      deferred0017: plan.deferred0017,
      fullLedgerReady: !plan.deferred0017,
    };
  });
}
