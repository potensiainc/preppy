import { randomUUID } from "node:crypto";

import type postgres from "postgres";

type Sql = ReturnType<typeof postgres>;

export type Wp12aSignalFixture = {
  institutionId: string;
  opportunityId: string;
  versionId: string;
  changeId: string;
  outboxId: string;
  signalTime: Date;
};

export class Wp12aFixtures {
  readonly prefix = `wp12a-${randomUUID()}-`;
  private readonly ids = {
    institutions: new Set<string>(),
    opportunities: new Set<string>(),
    versions: new Set<string>(),
    sources: new Set<string>(),
    changes: new Set<string>(),
    users: new Set<string>(),
    follows: new Set<string>(),
    episodes: new Set<string>(),
    notifications: new Set<string>(),
    deliveries: new Set<string>(),
  };

  constructor(private readonly sql: Sql) {}

  async createSignal(
    input: {
      signalTime?: Date;
      workerId?: string;
      outboxStatus?: "PENDING" | "PROCESSING";
      attemptCount?: number;
    } = {},
  ): Promise<Wp12aSignalFixture> {
    const signalTime = input.signalTime ?? new Date("2026-08-24T01:00:00.000Z");
    const institutionId = randomUUID();
    const opportunityId = randomUUID();
    const versionId = randomUUID();
    const sourceId = randomUUID();
    const changeId = randomUUID();
    const outboxId = randomUUID();
    const outboxStatus = input.outboxStatus ?? "PROCESSING";
    const workerId = input.workerId ?? "worker-resolver";

    await this.sql.begin(async (transaction) => {
      await transaction`insert into institutions(
          id, slug, display_name, category, operational_state, publication_state,
          published_at
        ) values (
          ${institutionId}, ${`${this.prefix}institution-${institutionId}`},
          'WP12A Academy', 'ENGLISH_KINDERGARTEN', 'ACTIVE', 'PUBLISHED',
          ${signalTime}
        )`;
      await transaction`insert into sources(
          id, canonical_url, source_type, authority_level, lifecycle_status,
          source_name
        ) values (
          ${sourceId}, ${`https://official.example.test/${this.prefix}${sourceId}`},
          'OFFICIAL_ADMISSION_PAGE', 'PRIMARY', 'ACTIVE', 'WP12A Official'
        )`;
      await transaction`insert into opportunities(
          id, institution_id, slug, kind, truth_mode, publication_state,
          published_at
        ) values (
          ${opportunityId}, ${institutionId},
          ${`${this.prefix}opportunity-${opportunityId}`}, 'APPLICATION', 'NATIVE',
          'PUBLISHED', ${signalTime}
        )`;
      await transaction`insert into opportunity_versions(
          id, opportunity_id, truth_mode, version_number, verification_state,
          business_state, is_current, title, verified_at
        ) values (
          ${versionId}, ${opportunityId}, 'NATIVE', 1, 'VERIFIED', 'UPCOMING',
          true, '2027 Application', ${signalTime}
        )`;
      await transaction`insert into opportunity_version_evidence(
          opportunity_version_id, source_id, evidence_role
        ) values (${versionId}, ${sourceId}, 'PRIMARY')`;
      await transaction`insert into opportunity_changes(
          id, opportunity_id, truth_mode, change_type, materiality,
          to_native_version_id, summary, detected_at, verified_at, published_at,
          dedupe_key
        ) values (
          ${changeId}, ${opportunityId}, 'NATIVE', 'NEW_OPPORTUNITY',
          'NOTIFIABLE', ${versionId}, 'Application deadline changed.',
          ${signalTime}, ${signalTime}, ${signalTime},
          ${`${this.prefix}change-${changeId}`}
        )`;
      await transaction`insert into outbox_events(
          id, event_type, aggregate_type, aggregate_id, payload, status,
          available_at, attempt_count, dedupe_key, locked_at, locked_by
        ) values (
          ${outboxId}, 'OPPORTUNITY_CHANGE_PUBLISHED', 'OPPORTUNITY_CHANGE',
          ${changeId}, ${transaction.json({
            opportunityId,
            opportunityChangeId: changeId,
            policyVersion: "OPPORTUNITY_NOTIFICATION_V1",
            signalPublishedAt: signalTime.toISOString(),
          })}, ${outboxStatus}, ${signalTime}, ${input.attemptCount ?? 1},
          ${`${this.prefix}signal-${changeId}`},
          ${outboxStatus === "PROCESSING" ? signalTime : null},
          ${outboxStatus === "PROCESSING" ? workerId : null}
        )`;
    });

    this.ids.institutions.add(institutionId);
    this.ids.opportunities.add(opportunityId);
    this.ids.versions.add(versionId);
    this.ids.sources.add(sourceId);
    this.ids.changes.add(changeId);
    return {
      institutionId,
      opportunityId,
      versionId,
      changeId,
      outboxId,
      signalTime,
    };
  }

  async createFollow(input: {
    institutionId: string;
    activatedAt: Date;
    deactivatedAt?: Date | null;
    userStatus?: "PENDING" | "ACTIVE" | "SUSPENDED" | "DELETED";
    currentStatus?: "ACTIVE" | "INACTIVE";
  }) {
    const userId = randomUUID();
    const followId = randomUUID();
    const episodeId = randomUUID();
    const currentStatus =
      input.currentStatus ??
      (input.deactivatedAt === undefined || input.deactivatedAt === null
        ? "ACTIVE"
        : "INACTIVE");
    const deactivatedAt =
      currentStatus === "ACTIVE"
        ? null
        : (input.deactivatedAt ?? new Date(input.activatedAt.getTime() + 1));
    await this.sql`insert into users(id, status, activated_at)
      values (${userId}, ${input.userStatus ?? "ACTIVE"}, ${input.activatedAt})`;
    await this.sql`insert into follows(
        id, user_id, institution_id, status, first_activated_at,
        current_activated_at, deactivated_at
      ) values (
        ${followId}, ${userId}, ${input.institutionId}, ${currentStatus},
        ${input.activatedAt}, ${input.activatedAt}, ${deactivatedAt}
      )`;
    await this.sql`insert into follow_episodes(
        id, follow_id, activated_at, deactivated_at, reason
      ) values (
        ${episodeId}, ${followId}, ${input.activatedAt},
        ${input.deactivatedAt ?? null}, 'WP12A_TEST'
      )`;
    this.ids.users.add(userId);
    this.ids.follows.add(followId);
    this.ids.episodes.add(episodeId);
    return { userId, followId, episodeId };
  }

  rememberNotification(id: string) {
    this.ids.notifications.add(id);
  }

  rememberDelivery(id: string) {
    this.ids.deliveries.add(id);
  }

  async enableEmail(
    userId: string,
    input: {
      userStatus?: "ACTIVE" | "SUSPENDED" | "DELETED";
      verificationState?: "VERIFIED" | "UNVERIFIED";
      deliveryState?: "USABLE" | "BOUNCED" | "SUPPRESSED" | "REMOVED";
      removedAt?: Date | null;
      consent?: "GRANTED" | "REVOKED";
      preference?: "ENABLED" | "DISABLED";
      email?: string;
      decidedAt?: Date;
    } = {},
  ) {
    if (input.userStatus) {
      await this
        .sql`update users set status=${input.userStatus} where id=${userId}`;
    }
    const email = input.email ?? `${userId}@example.test`;
    await this.sql`insert into user_emails(
        user_id, email, email_normalized, source, verification_state,
        delivery_state, verified_at, removed_at
      ) values (
        ${userId}, ${email}, ${email.toLowerCase()}, 'USER_INPUT',
        ${input.verificationState ?? "VERIFIED"},
        ${input.deliveryState ?? "USABLE"}, now(), ${input.removedAt ?? null}
      ) on conflict (user_id) do update set
        email=excluded.email, email_normalized=excluded.email_normalized,
        verification_state=excluded.verification_state,
        delivery_state=excluded.delivery_state, removed_at=excluded.removed_at`;
    await this.sql`insert into consent_decisions(
        user_id, consent_type, policy_version, decision, source, decided_at
      ) values (
        ${userId}, 'SERVICE_EMAIL_UPDATES', 'wp12a-v1',
        ${input.consent ?? "GRANTED"}, 'WP12A_TEST',
        ${input.decidedAt ?? new Date("2026-08-24T02:00:00.000Z")}
      )`;
    await this.sql`insert into notification_preferences(user_id, channel, state)
      values (${userId}, 'EMAIL', ${input.preference ?? "ENABLED"})
      on conflict (user_id, channel) do update set state=excluded.state`;
    return email;
  }

  async discoverGeneratedIds(changeId: string) {
    const notifications = await this.sql<{ id: string }[]>`
      select id from notifications where opportunity_change_id=${changeId}`;
    for (const notification of notifications) {
      this.ids.notifications.add(notification.id);
      const deliveries = await this.sql<{ id: string }[]>`
        select id from notification_deliveries
        where notification_id=${notification.id}`;
      for (const delivery of deliveries) this.ids.deliveries.add(delivery.id);
    }
  }

  async cleanup() {
    await this.sql.begin(async (transaction) => {
      await transaction.unsafe("set local session_replication_role = replica");
      if (this.ids.deliveries.size > 0) {
        await transaction`delete from notification_delivery_attempts
          where notification_delivery_id in ${transaction([...this.ids.deliveries])}`;
      }
      await transaction`delete from outbox_events
        where dedupe_key like ${`${this.prefix}%`}`;
      if (this.ids.deliveries.size > 0) {
        await transaction`delete from outbox_events
          where dedupe_key like 'delivery-send:%:v1'
            and aggregate_id in ${transaction([...this.ids.deliveries])}`;
      }
      if (this.ids.deliveries.size > 0) {
        await transaction`delete from notification_deliveries
          where id in ${transaction([...this.ids.deliveries])}`;
      }
      if (this.ids.notifications.size > 0) {
        await transaction`delete from notifications where id in ${transaction([...this.ids.notifications])}`;
      }
      if (this.ids.users.size > 0) {
        await transaction`delete from notification_preferences
          where user_id in ${transaction([...this.ids.users])}`;
        await transaction`delete from consent_decisions
          where user_id in ${transaction([...this.ids.users])}`;
        await transaction`delete from user_emails
          where user_id in ${transaction([...this.ids.users])}`;
      }
      if (this.ids.episodes.size > 0) {
        await transaction`delete from follow_episodes where id in ${transaction([...this.ids.episodes])}`;
      }
      if (this.ids.follows.size > 0) {
        await transaction`delete from follows where id in ${transaction([...this.ids.follows])}`;
      }
      if (this.ids.users.size > 0) {
        await transaction`delete from users where id in ${transaction([...this.ids.users])}`;
      }
      if (this.ids.changes.size > 0) {
        await transaction`delete from opportunity_changes where id in ${transaction([...this.ids.changes])}`;
      }
      if (this.ids.versions.size > 0) {
        await transaction`delete from opportunity_version_evidence
          where opportunity_version_id in ${transaction([...this.ids.versions])}`;
        await transaction`delete from opportunity_versions where id in ${transaction([...this.ids.versions])}`;
      }
      if (this.ids.opportunities.size > 0) {
        await transaction`delete from opportunities where id in ${transaction([...this.ids.opportunities])}`;
      }
      if (this.ids.sources.size > 0) {
        await transaction`delete from sources where id in ${transaction([...this.ids.sources])}`;
      }
      if (this.ids.institutions.size > 0) {
        await transaction`delete from institutions where id in ${transaction([...this.ids.institutions])}`;
      }
    });
    for (const values of Object.values(this.ids)) values.clear();
  }
}
