export type MonitoringPriority =
  "P0_ACTIVE" | "P1_UPCOMING" | "P2_WATCH" | "P3_PASSIVE";

export type MonitoringDueState = "OVERDUE" | "DUE" | "UPCOMING" | "MANUAL";

export type MonitoringScheduleInput = Readonly<{
  now: Date;
  lastCheckedAt: Date | null;
  institutionDormant: boolean;
  monitorEnabled: boolean;
  manualOnly: boolean;
  currentBusinessState: string | null;
  upcomingAt: Date | null;
  customIntervalMinutes: number | null;
}>;

export type MonitoringSchedule = Readonly<{
  priority: MonitoringPriority;
  intervalMinutes: number | null;
  nextDueAt: Date | null;
  dueState: MonitoringDueState;
}>;

export type NativeOpportunityTruth = Readonly<{
  businessState:
    "UPCOMING" | "OPEN" | "CLOSED" | "COMPLETED" | "CANCELLED" | "UNKNOWN";
  title: string;
  summary: string | null;
  targetAudience: string | null;
  eventStartAt: Date | null;
  eventEndAt: Date | null;
  applicationOpenAt: Date | null;
  applicationCloseAt: Date | null;
  actionUrl: string | null;
  locationText: string | null;
  validFrom: Date | null;
  validUntil: Date | null;
}>;

export type FactTruth = Readonly<{
  valueJson: Readonly<Record<string, unknown>>;
  displayText: string | null;
  validFrom: Date | null;
  validUntil: Date | null;
}>;

export type OpportunitySignal = Readonly<{
  changeType:
    | "NEW_OPPORTUNITY"
    | "DATE_CHANGED"
    | "DEADLINE_CHANGED"
    | "STATUS_CHANGED"
    | "APPLICATION_OPENED"
    | "APPLICATION_CLOSED"
    | "CANCELLED"
    | "MATERIAL_INFO_CHANGED";
  materiality: "NOTIFIABLE" | "NON_NOTIFIABLE";
  changedFields: readonly string[];
}>;

export type LegacyOpportunityTruth = Readonly<{
  knowledgeState:
    "KNOWN" | "NOT_ANNOUNCED" | "NOT_FOUND" | "SOURCE_ERROR" | "NOT_APPLICABLE";
  eventStatus: "SCHEDULED" | "ACTIVE" | "CLOSED" | "COMPLETED" | "CANCELLED";
  displayTitle: string;
  eventStartDate: string | null;
  eventStartTime: string | null;
  eventEndDate: string | null;
  eventEndTime: string | null;
  registrationOpenDate: string | null;
  registrationOpenTime: string | null;
  registrationCloseDate: string | null;
  registrationCloseTime: string | null;
  timezone: string;
  venue: string | null;
  actionUrl: string | null;
  officialNotes: string | null;
}>;

export type LegacyOpportunitySignal = OpportunitySignal &
  Readonly<{
    legacyChangeType:
      | "EVENT_DATE_CHANGED"
      | "REGISTRATION_WINDOW_CHANGED"
      | "EVENT_CANCELLED"
      | "OTHER";
  }>;

const NATIVE_TRUTH_FIELDS = [
  "businessState",
  "title",
  "summary",
  "targetAudience",
  "eventStartAt",
  "eventEndAt",
  "applicationOpenAt",
  "applicationCloseAt",
  "actionUrl",
  "locationText",
  "validFrom",
  "validUntil",
] as const;

type NativeTruthField = (typeof NATIVE_TRUTH_FIELDS)[number];

function normalizeText(value: string | null): string | null {
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function sameDate(left: Date | null, right: Date | null): boolean {
  return left === null
    ? right === null
    : right !== null && left.getTime() === right.getTime();
}

function sameNativeField(
  field: NativeTruthField,
  left: NativeOpportunityTruth,
  right: NativeOpportunityTruth,
): boolean {
  if (
    field === "eventStartAt" ||
    field === "eventEndAt" ||
    field === "applicationOpenAt" ||
    field === "applicationCloseAt" ||
    field === "validFrom" ||
    field === "validUntil"
  ) {
    return sameDate(left[field], right[field]);
  }

  if (
    field === "summary" ||
    field === "targetAudience" ||
    field === "actionUrl" ||
    field === "locationText"
  ) {
    return normalizeText(left[field]) === normalizeText(right[field]);
  }

  return left[field].trim() === right[field].trim();
}

function changedNativeFields(
  current: NativeOpportunityTruth,
  proposed: NativeOpportunityTruth,
): NativeTruthField[] {
  return NATIVE_TRUTH_FIELDS.filter(
    (field) => !sameNativeField(field, current, proposed),
  );
}

function canonicalizeJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalizeJson);
  if (typeof value !== "object" || value === null) return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, candidate]) => [key, canonicalizeJson(candidate)]),
  );
}

export function createBindingKey(input: {
  targetType: "INSTITUTION" | "OPPORTUNITY";
  targetId: string;
  sourceId: string;
  role: string;
}): string {
  return [input.targetType, input.targetId, input.sourceId, input.role].join(
    ":",
  );
}

export function compareFactTruth(
  current: FactTruth,
  proposed: FactTruth,
): boolean {
  return !(
    JSON.stringify(canonicalizeJson(current.valueJson)) ===
      JSON.stringify(canonicalizeJson(proposed.valueJson)) &&
    normalizeText(current.displayText) ===
      normalizeText(proposed.displayText) &&
    sameDate(current.validFrom, proposed.validFrom) &&
    sameDate(current.validUntil, proposed.validUntil)
  );
}

export function deriveOpportunitySignal(
  current: NativeOpportunityTruth,
  proposed: NativeOpportunityTruth,
): OpportunitySignal | null {
  const changedFields = changedNativeFields(current, proposed);
  if (changedFields.length === 0) return null;

  if (
    changedFields.includes("businessState") &&
    proposed.businessState === "CANCELLED"
  ) {
    return {
      changeType: "CANCELLED",
      materiality: "NOTIFIABLE",
      changedFields,
    };
  }
  if (
    changedFields.includes("businessState") &&
    proposed.businessState === "OPEN"
  ) {
    return {
      changeType: "APPLICATION_OPENED",
      materiality: "NOTIFIABLE",
      changedFields,
    };
  }
  if (
    changedFields.includes("businessState") &&
    proposed.businessState === "CLOSED"
  ) {
    return {
      changeType: "APPLICATION_CLOSED",
      materiality: "NOTIFIABLE",
      changedFields,
    };
  }
  if (changedFields.includes("applicationCloseAt")) {
    return {
      changeType: "DEADLINE_CHANGED",
      materiality: "NOTIFIABLE",
      changedFields,
    };
  }
  if (
    changedFields.includes("eventStartAt") ||
    changedFields.includes("eventEndAt") ||
    changedFields.includes("applicationOpenAt")
  ) {
    return {
      changeType: "DATE_CHANGED",
      materiality: "NOTIFIABLE",
      changedFields,
    };
  }
  if (changedFields.includes("businessState")) {
    return {
      changeType: "STATUS_CHANGED",
      materiality: "NOTIFIABLE",
      changedFields,
    };
  }

  return {
    changeType: "MATERIAL_INFO_CHANGED",
    materiality: "NON_NOTIFIABLE",
    changedFields,
  };
}

const LEGACY_TRUTH_FIELDS = [
  "knowledgeState",
  "eventStatus",
  "displayTitle",
  "eventStartDate",
  "eventStartTime",
  "eventEndDate",
  "eventEndTime",
  "registrationOpenDate",
  "registrationOpenTime",
  "registrationCloseDate",
  "registrationCloseTime",
  "timezone",
  "venue",
  "actionUrl",
  "officialNotes",
] as const;

export function deriveLegacyOpportunitySignal(
  current: LegacyOpportunityTruth,
  proposed: LegacyOpportunityTruth,
): LegacyOpportunitySignal | null {
  const changedFields = LEGACY_TRUTH_FIELDS.filter(
    (field) => normalizeText(current[field]) !== normalizeText(proposed[field]),
  );
  if (changedFields.length === 0) return null;
  if (
    changedFields.includes("eventStatus") &&
    proposed.eventStatus === "CANCELLED"
  ) {
    return {
      changeType: "CANCELLED",
      materiality: "NOTIFIABLE",
      changedFields,
      legacyChangeType: "EVENT_CANCELLED",
    };
  }
  if (
    changedFields.includes("registrationCloseDate") ||
    changedFields.includes("registrationCloseTime")
  ) {
    return {
      changeType: "DEADLINE_CHANGED",
      materiality: "NOTIFIABLE",
      changedFields,
      legacyChangeType: "REGISTRATION_WINDOW_CHANGED",
    };
  }
  if (
    changedFields.includes("eventStartDate") ||
    changedFields.includes("eventStartTime") ||
    changedFields.includes("eventEndDate") ||
    changedFields.includes("eventEndTime") ||
    changedFields.includes("registrationOpenDate") ||
    changedFields.includes("registrationOpenTime")
  ) {
    return {
      changeType: "DATE_CHANGED",
      materiality: "NOTIFIABLE",
      changedFields,
      legacyChangeType: "EVENT_DATE_CHANGED",
    };
  }
  if (changedFields.includes("eventStatus")) {
    return {
      changeType:
        proposed.eventStatus === "ACTIVE"
          ? "APPLICATION_OPENED"
          : proposed.eventStatus === "CLOSED"
            ? "APPLICATION_CLOSED"
            : "STATUS_CHANGED",
      materiality: "NOTIFIABLE",
      changedFields,
      legacyChangeType: "OTHER",
    };
  }
  return {
    changeType: "MATERIAL_INFO_CHANGED",
    materiality: "NON_NOTIFIABLE",
    changedFields,
    legacyChangeType: "OTHER",
  };
}

export function deriveMonitoringSchedule(
  input: MonitoringScheduleInput,
): MonitoringSchedule {
  if (input.institutionDormant || !input.monitorEnabled || input.manualOnly) {
    return {
      priority: "P3_PASSIVE",
      intervalMinutes: null,
      nextDueAt: null,
      dueState: "MANUAL",
    };
  }

  const upcomingDelta = input.upcomingAt
    ? input.upcomingAt.getTime() - input.now.getTime()
    : null;
  const isUpcoming =
    upcomingDelta !== null &&
    upcomingDelta >= 0 &&
    upcomingDelta <= 30 * 24 * 60 * 60 * 1_000;
  const priority: MonitoringPriority =
    input.currentBusinessState === "OPEN"
      ? "P0_ACTIVE"
      : isUpcoming
        ? "P1_UPCOMING"
        : "P2_WATCH";
  const intervalMinutes =
    input.customIntervalMinutes ??
    (priority === "P0_ACTIVE"
      ? 1_440
      : priority === "P1_UPCOMING"
        ? 2_880
        : 10_080);

  if (!input.lastCheckedAt) {
    return { priority, intervalMinutes, nextDueAt: null, dueState: "DUE" };
  }

  const nextDueAt = new Date(
    input.lastCheckedAt.getTime() + intervalMinutes * 60_000,
  );
  const delta = nextDueAt.getTime() - input.now.getTime();

  return {
    priority,
    intervalMinutes,
    nextDueAt,
    dueState: delta < 0 ? "OVERDUE" : delta === 0 ? "DUE" : "UPCOMING",
  };
}
