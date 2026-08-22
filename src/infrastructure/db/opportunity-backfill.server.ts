import "server-only";

import { createHash } from "node:crypto";

import { asc, sql } from "drizzle-orm";

import {
  admissionCycles,
  admissionEvents,
  institutionSchoolLinks,
  institutions,
  opportunities,
  opportunityAdmissionEventLinks,
  schools,
  type OpportunityKind,
} from "@/src/db/schema";
import type {
  DatabaseExecutor,
  TransactionManager,
} from "@/src/infrastructure/db/runtime.server";

const NAMESPACE = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";

export const MIGRATION_OPPORTUNITY_BACKFILL_CONTEXT = {
  source: "MIGRATION",
  emitProductSignals: false,
} as const;

const CANONICAL_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type OpportunityBackfillMapping = {
  id: string;
  institutionId: string;
  slug: string;
  kind: OpportunityKind;
  truthMode: "LEGACY_BACKED";
  publicationState: "DRAFT";
  admissionEventId: string;
  admissionCycleId: string;
  schoolId: string;
};

export type OpportunityBackfillIssue = {
  code: string;
  message: string;
  eventId?: string;
  opportunityId?: string;
  institutionId?: string;
  cycleId?: string;
  schoolId?: string;
  slug?: string;
};

export type OpportunityBackfillAction = {
  mapping: OpportunityBackfillMapping;
  createOpportunity: boolean;
  createLink: boolean;
};

export type OpportunityBackfillPreflight = {
  context: typeof MIGRATION_OPPORTUNITY_BACKFILL_CONTEXT;
  eventCount: number;
  typeDistribution: Record<string, number>;
  blockingIssues: OpportunityBackfillIssue[];
  warnings: OpportunityBackfillIssue[];
  planned: { create: number; link: number; skip: number };
  productionStateVerified: false;
  actions: OpportunityBackfillAction[];
};

export type OpportunityBackfillApplyResult = {
  context: typeof MIGRATION_OPPORTUNITY_BACKFILL_CONTEXT;
  created: number;
  linked: number;
  skipped: number;
};

export function opportunityIdForAdmissionEvent(eventId: string): string {
  const hash = createHash("sha1")
    .update(
      Buffer.concat([
        Buffer.from(NAMESPACE.replaceAll("-", ""), "hex"),
        Buffer.from(`preppy:legacy-admission-event:${eventId}`),
      ]),
    )
    .digest()
    .subarray(0, 16);

  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;

  const hex = hash.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function mapLegacyEventTypeToOpportunityKind(
  eventType: string,
): OpportunityKind {
  switch (eventType) {
    case "BRIEFING":
      return "INFORMATION_SESSION";
    case "OPEN_HOUSE":
    case "APPLICATION":
    case "DOCUMENT_SUBMISSION":
    case "ASSESSMENT":
    case "INTERVIEW":
    case "LOTTERY":
    case "RESULT_ANNOUNCEMENT":
    case "REGISTRATION":
    case "ADDITIONAL_RECRUITMENT":
      return eventType;
    default:
      throw new Error(`UNMAPPABLE_EVENT_TYPE: ${eventType}`);
  }
}

const issue = (
  code: string,
  message: string,
  details: Omit<OpportunityBackfillIssue, "code" | "message"> = {},
): OpportunityBackfillIssue => ({ code, message, ...details });

const normalizedTitle = (value: string) =>
  value.trim().replace(/\s+/g, " ").toLowerCase();

export async function preflightOpportunityBackfill(
  executor: DatabaseExecutor,
): Promise<OpportunityBackfillPreflight> {
  const [
    eventRows,
    cycleRows,
    schoolRows,
    institutionLinkRows,
    institutionRows,
    opportunityRows,
    opportunityLinkRows,
  ] = await Promise.all([
    executor.drizzle
      .select({
        id: admissionEvents.id,
        admissionCycleId: admissionEvents.admissionCycleId,
        eventKey: admissionEvents.eventKey,
        eventType: admissionEvents.eventType,
        canonicalTitle: admissionEvents.canonicalTitle,
        audienceSummary: admissionEvents.audienceSummary,
        audienceData: admissionEvents.audienceData,
      })
      .from(admissionEvents)
      .orderBy(asc(admissionEvents.id)),
    executor.drizzle
      .select({ id: admissionCycles.id, schoolId: admissionCycles.schoolId })
      .from(admissionCycles),
    executor.drizzle.select({ id: schools.id }).from(schools),
    executor.drizzle
      .select({
        institutionId: institutionSchoolLinks.institutionId,
        schoolId: institutionSchoolLinks.schoolId,
      })
      .from(institutionSchoolLinks),
    executor.drizzle
      .select({ id: institutions.id, slug: institutions.slug })
      .from(institutions),
    executor.drizzle
      .select({
        id: opportunities.id,
        institutionId: opportunities.institutionId,
        slug: opportunities.slug,
        kind: opportunities.kind,
        truthMode: opportunities.truthMode,
        publicationState: opportunities.publicationState,
      })
      .from(opportunities),
    executor.drizzle
      .select({
        opportunityId: opportunityAdmissionEventLinks.opportunityId,
        institutionId: opportunityAdmissionEventLinks.institutionId,
        truthMode: opportunityAdmissionEventLinks.truthMode,
        admissionEventId: opportunityAdmissionEventLinks.admissionEventId,
        admissionCycleId: opportunityAdmissionEventLinks.admissionCycleId,
        schoolId: opportunityAdmissionEventLinks.schoolId,
      })
      .from(opportunityAdmissionEventLinks),
  ]);

  const blockingIssues: OpportunityBackfillIssue[] = [];
  const warnings: OpportunityBackfillIssue[] = [];
  const typeDistribution: Record<string, number> = {};
  const cyclesById = new Map(cycleRows.map((row) => [row.id, row]));
  const schoolIds = new Set(schoolRows.map((row) => row.id));
  const institutionLinkBySchool = new Map(
    institutionLinkRows.map((row) => [row.schoolId, row]),
  );
  const institutionsById = new Map(institutionRows.map((row) => [row.id, row]));
  const opportunitiesById = new Map(
    opportunityRows.map((row) => [row.id, row]),
  );
  const opportunitiesBySlug = new Map(
    opportunityRows.map((row) => [row.slug, row]),
  );
  const linksByEvent = new Map(
    opportunityLinkRows.map((row) => [row.admissionEventId, row]),
  );
  const linksByOpportunity = new Map(
    opportunityLinkRows.map((row) => [row.opportunityId, row]),
  );
  const eventIds = new Set(eventRows.map((row) => row.id));
  const titleGroups = new Map<string, typeof eventRows>();
  const candidateMappings: OpportunityBackfillMapping[] = [];

  for (const event of eventRows) {
    typeDistribution[event.eventType] =
      (typeDistribution[event.eventType] ?? 0) + 1;
    const titleKey = normalizedTitle(event.canonicalTitle);
    const titleGroup = titleGroups.get(titleKey) ?? [];
    titleGroup.push(event);
    titleGroups.set(titleKey, titleGroup);

    if (!event.audienceSummary?.trim() && event.audienceData == null) {
      warnings.push(
        issue(
          "MISSING_OPTIONAL_LEGACY_METADATA",
          "AdmissionEvent audience metadata is absent.",
          { eventId: event.id },
        ),
      );
    }

    let kind: OpportunityKind;
    try {
      kind = mapLegacyEventTypeToOpportunityKind(event.eventType);
    } catch {
      blockingIssues.push(
        issue(
          "UNMAPPABLE_EVENT_TYPE",
          "AdmissionEvent type cannot be mapped to an Opportunity kind.",
          { eventId: event.id },
        ),
      );
      continue;
    }

    const cycle = cyclesById.get(event.admissionCycleId);
    if (!cycle) {
      blockingIssues.push(
        issue(
          "EVENT_MISSING_CYCLE",
          "AdmissionEvent cycle cannot be resolved.",
          {
            eventId: event.id,
            cycleId: event.admissionCycleId,
          },
        ),
      );
      continue;
    }
    if (!schoolIds.has(cycle.schoolId)) {
      blockingIssues.push(
        issue(
          "CYCLE_MISSING_SCHOOL",
          "AdmissionCycle School cannot be resolved.",
          {
            eventId: event.id,
            cycleId: cycle.id,
            schoolId: cycle.schoolId,
          },
        ),
      );
      continue;
    }
    const institutionLink = institutionLinkBySchool.get(cycle.schoolId);
    if (!institutionLink) {
      blockingIssues.push(
        issue(
          "SCHOOL_MISSING_INSTITUTION_BRIDGE",
          "AdmissionEvent School has no canonical Institution bridge.",
          { eventId: event.id, cycleId: cycle.id, schoolId: cycle.schoolId },
        ),
      );
      continue;
    }
    const institution = institutionsById.get(institutionLink.institutionId);
    if (!institution) {
      blockingIssues.push(
        issue(
          "INSTITUTION_BRIDGE_ORPHAN",
          "School bridge Institution cannot be resolved.",
          {
            eventId: event.id,
            schoolId: cycle.schoolId,
            institutionId: institutionLink.institutionId,
          },
        ),
      );
      continue;
    }
    const slug = `${institution.slug}-${event.eventKey}`;
    if (!CANONICAL_SLUG.test(slug)) {
      blockingIssues.push(
        issue(
          "INVALID_CANONICAL_SLUG_SOURCE",
          "Institution slug and Event key do not form a canonical URL-safe slug.",
          { eventId: event.id, institutionId: institution.id, slug },
        ),
      );
      continue;
    }
    candidateMappings.push({
      id: opportunityIdForAdmissionEvent(event.id),
      institutionId: institution.id,
      slug,
      kind,
      truthMode: "LEGACY_BACKED",
      publicationState: "DRAFT",
      admissionEventId: event.id,
      admissionCycleId: cycle.id,
      schoolId: cycle.schoolId,
    });
  }

  for (const events of titleGroups.values()) {
    if (events.length < 2) continue;
    for (const event of events) {
      warnings.push(
        issue(
          "MULTIPLE_SIMILAR_EVENT_TITLES",
          "Multiple AdmissionEvents share the same normalized title.",
          { eventId: event.id },
        ),
      );
    }
  }

  const mappingsBySlug = new Map<string, OpportunityBackfillMapping[]>();
  for (const mapping of candidateMappings) {
    const group = mappingsBySlug.get(mapping.slug) ?? [];
    group.push(mapping);
    mappingsBySlug.set(mapping.slug, group);
  }
  const duplicateSlugs = new Set<string>();
  for (const [slug, mappings] of mappingsBySlug) {
    if (mappings.length < 2) continue;
    duplicateSlugs.add(slug);
    blockingIssues.push(
      issue(
        "DUPLICATE_TARGET_SLUG",
        "Multiple AdmissionEvents resolve to the same canonical slug.",
        { slug },
      ),
    );
  }

  for (const link of opportunityLinkRows) {
    if (!eventIds.has(link.admissionEventId)) {
      blockingIssues.push(
        issue(
          "ORPHAN_EVENT_BRIDGE",
          "Opportunity bridge references a missing AdmissionEvent.",
          {
            eventId: link.admissionEventId,
            opportunityId: link.opportunityId,
          },
        ),
      );
    }
    if (!opportunitiesById.has(link.opportunityId)) {
      blockingIssues.push(
        issue(
          "ORPHAN_OPPORTUNITY_BRIDGE",
          "Opportunity bridge references a missing Opportunity.",
          {
            eventId: link.admissionEventId,
            opportunityId: link.opportunityId,
          },
        ),
      );
    }
  }

  const actions: OpportunityBackfillAction[] = [];
  for (const mapping of candidateMappings) {
    if (duplicateSlugs.has(mapping.slug)) continue;

    const expectedOpportunity = opportunitiesById.get(mapping.id);
    const occupiedSlug = opportunitiesBySlug.get(mapping.slug);
    const eventLink = linksByEvent.get(mapping.admissionEventId);
    const opportunityLink = linksByOpportunity.get(mapping.id);
    let blocked = false;

    if (occupiedSlug && occupiedSlug.id !== mapping.id) {
      blockingIssues.push(
        issue(
          "TARGET_SLUG_OCCUPIED",
          "Canonical slug is occupied by another Opportunity.",
          {
            eventId: mapping.admissionEventId,
            opportunityId: occupiedSlug.id,
            slug: mapping.slug,
          },
        ),
      );
      blocked = true;
    }
    if (eventLink && eventLink.opportunityId !== mapping.id) {
      blockingIssues.push(
        issue(
          "EVENT_LINKED_TO_UNEXPECTED_OPPORTUNITY",
          "AdmissionEvent is linked to a non-deterministic Opportunity.",
          {
            eventId: mapping.admissionEventId,
            opportunityId: eventLink.opportunityId,
          },
        ),
      );
      blocked = true;
    }
    if (
      opportunityLink &&
      opportunityLink.admissionEventId !== mapping.admissionEventId
    ) {
      blockingIssues.push(
        issue(
          "EXPECTED_OPPORTUNITY_LINKED_TO_ANOTHER_EVENT",
          "Expected Opportunity is linked to another AdmissionEvent.",
          {
            eventId: mapping.admissionEventId,
            opportunityId: mapping.id,
          },
        ),
      );
      blocked = true;
    }
    if (expectedOpportunity) {
      if (expectedOpportunity.institutionId !== mapping.institutionId) {
        blockingIssues.push(
          issue(
            "EXPECTED_OPPORTUNITY_INSTITUTION_MISMATCH",
            "Expected Opportunity belongs to a different Institution.",
            {
              eventId: mapping.admissionEventId,
              opportunityId: mapping.id,
              institutionId: expectedOpportunity.institutionId,
            },
          ),
        );
        blocked = true;
      }
      if (expectedOpportunity.truthMode !== mapping.truthMode) {
        blockingIssues.push(
          issue(
            "EXPECTED_OPPORTUNITY_TRUTH_MODE_MISMATCH",
            "Expected Opportunity has a different truth mode.",
            { eventId: mapping.admissionEventId, opportunityId: mapping.id },
          ),
        );
        blocked = true;
      }
      if (expectedOpportunity.slug !== mapping.slug) {
        blockingIssues.push(
          issue(
            "EXPECTED_OPPORTUNITY_SLUG_MISMATCH",
            "Expected Opportunity has a different slug.",
            {
              eventId: mapping.admissionEventId,
              opportunityId: mapping.id,
              slug: expectedOpportunity.slug,
            },
          ),
        );
        blocked = true;
      }
      if (expectedOpportunity.kind !== mapping.kind) {
        blockingIssues.push(
          issue(
            "EXPECTED_OPPORTUNITY_KIND_MISMATCH",
            "Expected Opportunity has a different kind.",
            { eventId: mapping.admissionEventId, opportunityId: mapping.id },
          ),
        );
        blocked = true;
      }
    }
    if (
      eventLink?.opportunityId === mapping.id &&
      (eventLink.institutionId !== mapping.institutionId ||
        eventLink.truthMode !== mapping.truthMode ||
        eventLink.admissionCycleId !== mapping.admissionCycleId ||
        eventLink.schoolId !== mapping.schoolId)
    ) {
      blockingIssues.push(
        issue(
          "EXISTING_BRIDGE_AGGREGATE_MISMATCH",
          "Existing Opportunity bridge has inconsistent aggregate keys.",
          { eventId: mapping.admissionEventId, opportunityId: mapping.id },
        ),
      );
      blocked = true;
    }
    if (blocked) continue;

    if (expectedOpportunity && eventLink?.opportunityId === mapping.id) {
      actions.push({
        mapping,
        createOpportunity: false,
        createLink: false,
      });
    } else if (expectedOpportunity) {
      actions.push({ mapping, createOpportunity: false, createLink: true });
    } else {
      actions.push({ mapping, createOpportunity: true, createLink: true });
    }
  }

  return {
    context: MIGRATION_OPPORTUNITY_BACKFILL_CONTEXT,
    eventCount: eventRows.length,
    typeDistribution,
    blockingIssues,
    warnings,
    planned: {
      create: actions.filter((action) => action.createOpportunity).length,
      link: actions.filter((action) => action.createLink).length,
      skip: actions.filter(
        (action) => !action.createOpportunity && !action.createLink,
      ).length,
    },
    productionStateVerified: false,
    actions,
  };
}

export async function applyOpportunityBackfill({
  transactionManager,
}: {
  transactionManager: TransactionManager;
}): Promise<OpportunityBackfillApplyResult> {
  return transactionManager.run(async (executor) => {
    await executor.raw(
      sql`select pg_advisory_xact_lock(hashtext('preppy-opportunity-backfill'))`,
    );
    const report = await preflightOpportunityBackfill(executor);
    if (report.blockingIssues.length > 0) {
      throw new Error(
        "Opportunity backfill preflight failed; no rows were written.",
      );
    }

    for (const action of report.actions) {
      if (action.createOpportunity) {
        await executor.drizzle.insert(opportunities).values({
          id: action.mapping.id,
          institutionId: action.mapping.institutionId,
          slug: action.mapping.slug,
          kind: action.mapping.kind,
          truthMode: action.mapping.truthMode,
          publicationState: action.mapping.publicationState,
        });
      }
      if (action.createLink) {
        await executor.drizzle.insert(opportunityAdmissionEventLinks).values({
          opportunityId: action.mapping.id,
          institutionId: action.mapping.institutionId,
          truthMode: action.mapping.truthMode,
          admissionEventId: action.mapping.admissionEventId,
          admissionCycleId: action.mapping.admissionCycleId,
          schoolId: action.mapping.schoolId,
        });
      }
    }

    return {
      context: MIGRATION_OPPORTUNITY_BACKFILL_CONTEXT,
      created: report.planned.create,
      linked: report.planned.link,
      skipped: report.planned.skip,
    };
  });
}
