import {
  lockMigrationLedger,
  type MigrationSql,
  type MigrationTx,
} from "./migrate";
import {
  ACCOUNT_DELETION_MIGRATION,
  migrationStatements,
  planAccountDeletionMigration,
  stop,
  type MigrationSpec,
} from "./migration-plan";
import {
  verifyScopedBackup,
  type ScopedBackupReceipt,
} from "./scoped-migration-backup";
import {
  assertScopedEnvironment,
  type ScopedTarget,
} from "./scoped-english-identity-migration";

const tables = ["account_deletion_jobs", "kakao_unlink_inbox"];

export async function ledgerFingerprintWithout0017(
  tx: MigrationTx,
  exclude0017: boolean,
) {
  const [r] =
    await tx`select encode(sha256(convert_to(coalesce(jsonb_agg(jsonb_build_object('id',id,'hash',hash,'created_at',created_at) order by id),'[]'::jsonb)::text,'UTF8')),'hex') as hash from drizzle.__drizzle_migrations where not ${exclude0017} or hash<>${ACCOUNT_DELETION_MIGRATION.hash}`;
  return r!.hash as string;
}

// Reads every object 0017 creates or changes. Either none of them exist
// (ABSENT) or all of them match the migration exactly (EXACT); anything in
// between is drift that this command never repairs.
export async function inspectAccountDeletionSchema(tx: MigrationTx) {
  const [state] = await tx`
    select
      (select count(*)::int from pg_class c join pg_namespace n on n.oid=c.relnamespace
        where n.nspname='public' and c.relname=any(${tables})) as tables,
      (select count(*)::int from pg_class c join pg_namespace n on n.oid=c.relnamespace
        where n.nspname='public' and c.relname=any(${tables})
          and c.relkind='r' and pg_get_userbyid(c.relowner)='preppy_migration') as owned_tables,
      (select count(*)::int from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public' and p.proname='block_deleting_kakao_identity') as relink_function,
      (select count(*)::int from pg_trigger t
        where t.tgrelid='public.auth_identities'::regclass
          and t.tgname='block_deleting_kakao_identity_before_insert'
          and not t.tgisinternal and t.tgenabled='O') as relink_trigger,
      (select pg_get_constraintdef(oid) like '%DELETION_PENDING%' from pg_constraint
        where conrelid='public.users'::regclass and conname='users_status_check') as status_allows_deletion,
      (select pg_get_functiondef(p.oid) like '%DELETION_PENDING%' from pg_proc p
        join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public' and p.proname='prevent_consent_decision_mutation') as consent_allows_erasure
  `;
  const absent =
    state!.tables === 0 &&
    state!.relink_function === 0 &&
    state!.relink_trigger === 0 &&
    state!.status_allows_deletion === false &&
    state!.consent_allows_erasure === false;
  if (absent) return "ABSENT" as const;
  if (
    state!.tables !== 2 ||
    state!.owned_tables !== 2 ||
    state!.relink_function !== 1 ||
    state!.relink_trigger !== 1 ||
    state!.status_allows_deletion !== true ||
    state!.consent_allows_erasure !== true
  )
    stop("SCOPED_SCHEMA_DRIFT");
  const constraints = await tx`
    select co.conname from pg_constraint co join pg_class c on c.oid=co.conrelid
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname=any(${tables}) and co.contype<>'n'
    order by co.conname`;
  const expected = [
    "account_deletion_jobs_completion_check",
    "account_deletion_jobs_lease_check",
    "account_deletion_jobs_pkey",
    "account_deletion_jobs_status_check",
    "account_deletion_jobs_subject_fingerprint_unique",
    "account_deletion_jobs_user_id_unique",
    "account_deletion_jobs_user_id_users_id_fk",
    "account_deletion_review_reference_check",
    "kakao_unlink_inbox_pkey",
    "kakao_unlink_inbox_status_check",
  ];
  if (
    JSON.stringify(constraints.map((c) => c.conname)) !==
    JSON.stringify(expected)
  )
    stop("SCOPED_SCHEMA_DRIFT");
  const [index] =
    await tx`select count(*)::int as count from pg_indexes where schemaname='public' and tablename='account_deletion_jobs' and indexname='account_deletion_due_idx'`;
  if (index!.count !== 1) stop("SCOPED_SCHEMA_DRIFT");
  for (const table of tables) {
    const [acl] =
      await tx`select has_table_privilege('preppy_runtime',${"public." + table},'SELECT') as r,has_table_privilege('preppy_runtime',${"public." + table},'INSERT') as i,has_table_privilege('preppy_runtime',${"public." + table},'UPDATE') as u,has_table_privilege('preppy_runtime',${"public." + table},'DELETE') as d`;
    if (!acl!.r || !acl!.i || !acl!.u || !acl!.d)
      stop("SCOPED_EXISTING_DEFAULT_ACL_REQUIRED");
  }
  return "EXACT" as const;
}

async function assertDependencies(tx: MigrationTx) {
  const [r] = await tx`
    select
      to_regclass('public.users') is not null
      and to_regclass('public.auth_identities') is not null
      and to_regclass('public.consent_decisions') is not null
      and exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public' and p.proname='prevent_consent_decision_mutation')
      as ready`;
  if (r!.ready !== true) stop("SCOPED_SCHEMA_DEPENDENCY_MISSING");
}

export async function runScopedAccountDeletionMigration(
  client: MigrationSql,
  specs: readonly MigrationSpec[],
  options: {
    target: ScopedTarget;
    backupReceiptPath: string;
    apply: boolean;
    expectedSqlChecksum: string;
    environment?: Record<string, string | undefined>;
  },
) {
  assertScopedEnvironment(options.target, options.environment);
  if (options.expectedSqlChecksum !== ACCOUNT_DELETION_MIGRATION.hash)
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
    const plan = planAccountDeletionMigration(specs, ledger);
    const commands = migrationStatements(plan.migration);
    const before = JSON.stringify(ledger);
    const currentLedgerHash = await ledgerFingerprintWithout0017(tx, false);
    const originalLedgerHash = plan.applied
      ? await ledgerFingerprintWithout0017(tx, true)
      : currentLedgerHash;
    if (
      backup.ledgerSha256 !== currentLedgerHash &&
      backup.ledgerSha256 !== originalLedgerHash
    )
      stop("BACKUP_LEDGER_MISMATCH");
    await assertDependencies(tx);
    await tx`set local role preppy_migration`;
    const state = await inspectAccountDeletionSchema(tx);
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
        fullLedgerReady: plan.applied,
      };
    for (const statement of commands) await tx.unsafe(statement);
    if ((await inspectAccountDeletionSchema(tx)) !== "EXACT")
      stop("SCOPED_SCHEMA_READBACK_FAILED");
    await tx`insert into drizzle.__drizzle_migrations(hash,created_at) values(${plan.migration.hash},${plan.migration.when})`;
    const after =
      await tx`select id,hash,created_at from drizzle.__drizzle_migrations where hash<>${plan.migration.hash} order by id`;
    if (JSON.stringify(after) !== before) stop("EXISTING_LEDGER_CHANGED");
    if ((await ledgerFingerprintWithout0017(tx, true)) !== backup.ledgerSha256)
      stop("EXISTING_LEDGER_CHANGED");
    return {
      mode: "APPLIED",
      applied: true,
      migration: plan.migration.identifier,
      checksum: plan.migration.hash,
      fullLedgerReady: true,
    };
  });
}
