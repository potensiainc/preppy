import { z } from "zod";

export const monitoringPriorityValues = [
  "P0_ACTIVE",
  "P1_UPCOMING",
  "P2_WATCH",
  "P3_PASSIVE",
] as const;

export const monitoringDueStateValues = [
  "OVERDUE",
  "DUE",
  "UPCOMING",
  "MANUAL",
] as const;

export const monitoringTargetTypeValues = [
  "INSTITUTION",
  "OPPORTUNITY",
] as const;

export type SourceMoveMode = "URL_CORRECTION" | "SOURCE_REPLACEMENT";
export type MonitoringPriority = (typeof monitoringPriorityValues)[number];
export type MonitoringDueState = (typeof monitoringDueStateValues)[number];
export type MonitoringTargetType = (typeof monitoringTargetTypeValues)[number];

export const monitoringQueueFilterSchema = z
  .object({
    dueState: z.array(z.enum(monitoringDueStateValues)).max(4).optional(),
    priority: z.array(z.enum(monitoringPriorityValues)).max(4).optional(),
    targetType: z.array(z.enum(monitoringTargetTypeValues)).max(2).optional(),
    role: z
      .array(
        z.enum([
          "OFFICIAL_MAIN",
          "ADMISSIONS",
          "TUITION",
          "CURRICULUM",
          "APPLICATION",
          "PRIMARY_NOTICE",
          "DETAILS",
          "SUPPORTING",
          "OTHER",
        ]),
      )
      .max(9)
      .optional(),
    sourceLifecycle: z
      .array(z.enum(["DISCOVERED", "ACTIVE", "PAUSED", "RETIRED"]))
      .max(4)
      .optional(),
  })
  .strict();

export type MonitoringQueueFilter = z.output<
  typeof monitoringQueueFilterSchema
>;

export type MonitoringInstitutionIdentity = Readonly<{
  id: string;
  slug: string;
  displayName: string;
  category: string;
  operationalState: string;
  publicationState: string;
}>;

export type MonitoringOpportunityIdentity = Readonly<{
  id: string;
  slug: string;
  kind: string;
  truthMode: "NATIVE" | "LEGACY_BACKED";
  publicationState: string;
}>;

export type MonitoringSourceIdentity = Readonly<{
  id: string;
  canonicalUrl: string;
  sourceType: string;
  authorityLevel: string;
  lifecycleStatus: string;
  sourceName: string;
}>;

export type MonitoringTruthSummary =
  | Readonly<{
      kind: "INSTITUTION";
      operationalState: string;
      publicationState: string;
    }>
  | Readonly<{
      kind: "OPPORTUNITY";
      businessState: string | null;
      title: string | null;
      relevantAt: string | null;
    }>;

export type MonitoringQueueRow = Readonly<{
  bindingId: string;
  targetType: MonitoringTargetType;
  targetId: string;
  institution: MonitoringInstitutionIdentity;
  opportunity: MonitoringOpportunityIdentity | null;
  source: MonitoringSourceIdentity;
  role: string;
  isPrimary: boolean;
  priority: MonitoringPriority;
  lastCheckedAt: string | null;
  nextDueAt: string | null;
  dueState: MonitoringDueState;
  dueReason: string;
  currentTruthSummary: MonitoringTruthSummary;
}>;
