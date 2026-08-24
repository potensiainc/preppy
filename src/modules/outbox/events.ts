export const supportedOutboxEventTypes = [
  "OPPORTUNITY_CHANGE_PUBLISHED",
  "DELIVERY_EMAIL_SEND",
] as const;

export type SupportedOutboxEventType =
  (typeof supportedOutboxEventTypes)[number];

export type OutboxEventPayloadMap = {
  OPPORTUNITY_CHANGE_PUBLISHED: {
    readonly opportunityId: string;
    readonly opportunityChangeId: string;
    readonly policyVersion: string;
    readonly signalPublishedAt: string;
  };
  DELIVERY_EMAIL_SEND: { readonly deliveryId: string };
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactUuidKey(
  value: unknown,
  key: "opportunityChangeId" | "deliveryId",
): value is Record<typeof key, string> {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value);
  return (
    keys.length === 1 &&
    keys[0] === key &&
    typeof value[key] === "string" &&
    UUID_PATTERN.test(value[key])
  );
}

function parseOpportunityChangePayload(value: unknown) {
  if (!isRecord(value)) return null;
  const keys = Object.keys(value).sort();
  if (
    keys.join("|") !==
      "opportunityChangeId|opportunityId|policyVersion|signalPublishedAt" ||
    typeof value.opportunityId !== "string" ||
    !UUID_PATTERN.test(value.opportunityId) ||
    typeof value.opportunityChangeId !== "string" ||
    !UUID_PATTERN.test(value.opportunityChangeId) ||
    value.policyVersion !== "OPPORTUNITY_NOTIFICATION_V1" ||
    typeof value.signalPublishedAt !== "string"
  ) {
    return null;
  }
  const signalTime = new Date(value.signalPublishedAt);
  if (
    !Number.isFinite(signalTime.getTime()) ||
    signalTime.toISOString() !== value.signalPublishedAt
  ) {
    return null;
  }
  return {
    opportunityId: value.opportunityId,
    opportunityChangeId: value.opportunityChangeId,
    policyVersion: value.policyVersion,
    signalPublishedAt: value.signalPublishedAt,
  };
}

export function isSupportedOutboxEventType(
  value: unknown,
): value is SupportedOutboxEventType {
  return (
    typeof value === "string" &&
    supportedOutboxEventTypes.some((candidate) => candidate === value)
  );
}

export function parseOutboxPayload<Type extends SupportedOutboxEventType>(
  eventType: Type,
  value: unknown,
): OutboxEventPayloadMap[Type] | null;
export function parseOutboxPayload(
  eventType: unknown,
  value: unknown,
): OutboxEventPayloadMap[SupportedOutboxEventType] | null;
export function parseOutboxPayload(
  eventType: unknown,
  value: unknown,
): OutboxEventPayloadMap[SupportedOutboxEventType] | null {
  if (eventType === "OPPORTUNITY_CHANGE_PUBLISHED") {
    return parseOpportunityChangePayload(value);
  }
  if (eventType === "DELIVERY_EMAIL_SEND") {
    return hasExactUuidKey(value, "deliveryId")
      ? { deliveryId: value.deliveryId }
      : null;
  }
  return null;
}
