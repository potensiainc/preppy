import type {
  ArticleCategory,
  ArticleStatus,
  ArticleType,
  InstitutionCategory,
  InstitutionOperationalState,
  InstitutionPublicationState,
  NotificationSignalType,
  NotificationStatus,
  OpportunityBusinessState,
  OpportunityChangeMateriality,
  OpportunityChangeType,
  OpportunityKind,
  OpportunityPublicationState,
  OpportunityTruthMode,
  VersionVerificationState,
} from "@/src/db/schema";
import type { emailReadinessValues } from "./input";

export type AdminPaginationDTO = Readonly<{
  page: number;
  pageSize: number;
  total: number;
  hasNext: boolean;
}>;

export type AdminPageDTO<T> = Readonly<{
  items: readonly T[];
  pagination: AdminPaginationDTO;
}>;

export type AdminOpportunitySummaryDTO = Readonly<{
  id: string;
  slug: string;
  kind: OpportunityKind;
  truthMode: OpportunityTruthMode;
  publicationState: OpportunityPublicationState;
  title: string | null;
  businessState: OpportunityBusinessState | null;
  verifiedAt: string | null;
}>;

export type AdminInstitutionDTO = Readonly<{
  id: string;
  slug: string;
  displayName: string;
  category: InstitutionCategory;
  operationalState: InstitutionOperationalState;
  publicationState: InstitutionPublicationState;
  activeSourceBindingCount: number;
  opportunitySummary: Readonly<{
    total: number;
    items: readonly AdminOpportunitySummaryDTO[];
  }>;
}>;

export type AdminOpportunityVersionDTO = Readonly<{
  id: string;
  versionNumber: number;
  verificationState: VersionVerificationState;
  businessState: OpportunityBusinessState;
  title: string;
  verifiedAt: string | null;
}>;

export type AdminOpportunityChangeDTO = Readonly<{
  id: string;
  changeType: OpportunityChangeType;
  materiality: OpportunityChangeMateriality;
  summary: string;
  verifiedAt: string;
  publishedAt: string;
}>;

export type AdminOpportunityDTO = Readonly<{
  id: string;
  slug: string;
  kind: OpportunityKind;
  truthMode: OpportunityTruthMode;
  publicationState: OpportunityPublicationState;
  institution: Readonly<{ id: string; displayName: string }>;
  currentVersion: AdminOpportunityVersionDTO | null;
  activeSourceBindingCount: number;
  recentChange: AdminOpportunityChangeDTO | null;
}>;

export type AdminSourceMonitorConfigDTO = Readonly<{
  collectionStrategy: string;
  monitoringProfile: string;
  customIntervalMinutes: number | null;
  seasonalEnabled: boolean;
  browserRequired: boolean;
  maxAttempts: number;
  isEnabled: boolean;
}>;

export type AdminSourceObservationDTO = Readonly<{
  id: string;
  observedAt: string;
  outcome: string;
  httpStatus: number | null;
  durationMs: number | null;
  errorCode: string | null;
}>;

export type AdminSourceDTO = Readonly<{
  id: string;
  sourceName: string;
  canonicalUrl: string;
  safeUrl: string | null;
  sourceType: string;
  authorityLevel: string;
  lifecycleStatus: string;
  monitorConfig: AdminSourceMonitorConfigDTO | null;
  activeInstitutionBindingCount: number;
  activeOpportunityBindingCount: number;
  latestObservation: AdminSourceObservationDTO | null;
}>;

export type AdminArticleDTO = Readonly<{
  id: string;
  slug: string;
  title: string;
  type: ArticleType;
  category: ArticleCategory;
  status: ArticleStatus;
  publishedAt: string | null;
  institutionRelationCount: number;
  opportunityRelationCount: number;
}>;

export type ArticleRelationOptionDTO = Readonly<{
  id: string;
  slug: string;
  label: string;
}>;

export type AdminArticleDetailDTO = AdminArticleDTO &
  Readonly<{
    excerpt: string | null;
    sanitizedContentHtml: string;
    seoTitle: string | null;
    seoDescription: string | null;
    canonicalUrl: string | null;
    robotsIndex: boolean;
    robotsFollow: boolean;
    featuredImageUrl: string | null;
    featuredImageAlt: string | null;
    institutionIds: readonly string[];
    opportunityIds: readonly string[];
    updatedAt: string;
  }>;

export type AdminNotificationDTO = Readonly<{
  id: string;
  status: NotificationStatus;
  signalType: NotificationSignalType;
  opportunityId: string;
  opportunityChangeId: string | null;
  signalPublishedAt: string;
  deliveryCount: number;
  attemptCount: number;
}>;

export type EmailReadiness = (typeof emailReadinessValues)[number];

export type AdminUserDTO = Readonly<{
  id: string;
  status: "PENDING" | "ACTIVE" | "SUSPENDED" | "DELETED";
  createdAt: string;
  followCount: number;
  emailReadiness: EmailReadiness;
}>;

export type AdminDashboardDTO = Readonly<{
  monitoring: Readonly<{ due: number; overdue: number }>;
  recentVerifiedChanges: Readonly<{
    count: number;
    items: readonly AdminOpportunityChangeDTO[];
  }>;
  unavailableSources: number;
  outbox: Readonly<{ pending: number; deadLetter: number }>;
}>;

export type AdminOutboxStatus =
  | "PENDING"
  | "PROCESSING"
  | "PROCESSED"
  | "FAILED"
  | "CANCELLED"
  | "DEAD_LETTER";

export type AdminOutboxDTO = Readonly<{
  id: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  status: AdminOutboxStatus;
  availableAt: string;
  processedAt: string | null;
  attemptCount: number;
  maxAttempts: number | null;
  errorCode: string | null;
  lastErrorAt: string | null;
  deadLetteredAt: string | null;
  createdAt: string;
  deliveryId: string | null;
  latestAttempt: Readonly<{
    id: string;
    provider: string;
    providerMessageId: string | null;
    status: "STARTED" | "ACCEPTED" | "FAILED_RETRYABLE" | "FAILED_TERMINAL";
    errorCode: string | null;
    attemptedAt: string;
  }> | null;
  actions: Readonly<{
    canRetry: boolean;
    canCancel: boolean;
    canReconcileResend: boolean;
  }>;
}>;

export type AdminDeliveryAttemptDTO = Readonly<{
  id: string;
  attemptNumber: number;
  status: "STARTED" | "ACCEPTED" | "FAILED_RETRYABLE" | "FAILED_TERMINAL";
  errorCategory: "NONE" | "RETRYABLE" | "TERMINAL";
  errorCode: string | null;
  attemptedAt: string;
  completedAt: string | null;
}>;

export type AdminDeliveryDTO = Readonly<{
  deliveryId: string;
  notificationId: string;
  channel: "EMAIL";
  status:
    | "PENDING"
    | "QUEUED"
    | "SENT"
    | "DELIVERED"
    | "OPENED"
    | "CLICKED"
    | "FAILED"
    | "SUPPRESSED";
  suppressReason: string | null;
  createdAt: string;
  terminalAt: string | null;
  attemptCount: number;
  latestAttempt: AdminDeliveryAttemptDTO | null;
}>;

export type AdminAuditMetadataDTO = Readonly<{
  expectedVersion?: number;
  actualVersion?: number;
  sourceId?: string;
  observationId?: string;
  changedFields?: readonly string[];
  outcomeCode?: string;
  moveMode?: string;
  targetId?: string;
  versionId?: string;
  changeId?: string;
  contentFingerprint?: `sha256:${string}`;
}>;

export type AdminAuditDTO = Readonly<{
  id: string;
  actor: Readonly<{ adminUserId: string | null }>;
  action: string;
  entityType: string;
  entityId: string | null;
  reason: string | null;
  correlationId: string | null;
  metadata: AdminAuditMetadataDTO;
  createdAt: string;
}>;

export type AdminDataQualityWarningCode =
  | "MULTIPLE_CURRENT_VERSIONS"
  | "ACTIVE_PRIMARY_MULTIPLICITY"
  | "ORPHANED_CANONICAL_LINKS"
  | "OVERDUE_CRITICAL_MONITORING";

export type AdminDataQualityDetailDTO = Readonly<{
  targetType:
    | "OPPORTUNITY"
    | "INSTITUTION_FACT"
    | "INSTITUTION"
    | "INSTITUTION_SOURCE_BINDING"
    | "OPPORTUNITY_SOURCE_BINDING";
  targetId: string;
  relatedId: string | null;
  observedCount: number;
}>;

export type AdminDataQualityWarningDTO = Readonly<{
  code: AdminDataQualityWarningCode;
  severity: "CRITICAL";
  evaluationStatus: "AVAILABLE" | "UNAVAILABLE";
  errorCategory: "EVALUATION_FAILED" | null;
  count: number | null;
  details: readonly AdminDataQualityDetailDTO[];
}>;

export type AdminDataQualityDTO = Readonly<{
  status: "AVAILABLE" | "PARTIAL" | "UNAVAILABLE";
  checkedAt: string;
  warnings: readonly AdminDataQualityWarningDTO[];
}>;

export type AdminHealthDTO = Readonly<{
  status: "HEALTHY" | "ATTENTION" | "UNAVAILABLE";
  checkedAt: string;
  database: Readonly<{ status: "AVAILABLE" | "UNAVAILABLE" }>;
  outbox: Readonly<{
    status: "AVAILABLE" | "UNAVAILABLE";
    pending: number | null;
    processing: number | null;
    failed: number | null;
    deadLetter: number | null;
  }>;
  dataQuality: Readonly<{
    status: "AVAILABLE" | "PARTIAL" | "UNAVAILABLE";
    warningCount: number;
    affectedRecordCount: number;
    unavailableCheckCount: number;
  }>;
}>;

export type AdminHealthBundleDTO = Readonly<{
  health: AdminHealthDTO;
  dataQuality: AdminDataQualityDTO;
}>;
