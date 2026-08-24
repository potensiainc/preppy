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
  DELIVERY_EMAIL_SEND: {
    readonly deliveryId: string;
    readonly providerRequest?: Readonly<{
      provider: "RESEND";
      version: 1;
      idempotencyKey: string;
      payloadHash: string;
    }>;
  };
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

function parseDeliveryPayload(value: unknown) {
  if (!isRecord(value)) return null;
  const keys = Object.keys(value).sort().join("|");
  if (
    (keys !== "deliveryId" && keys !== "deliveryId|providerRequest") ||
    typeof value.deliveryId !== "string" ||
    !UUID_PATTERN.test(value.deliveryId)
  ) {
    return null;
  }
  if (keys === "deliveryId") return { deliveryId: value.deliveryId };
  const request = value.providerRequest;
  if (
    !isRecord(request) ||
    Object.keys(request).sort().join("|") !==
      "idempotencyKey|payloadHash|provider|version"
  ) {
    return null;
  }
  if (
    request.provider !== "RESEND" ||
    request.version !== 1 ||
    typeof request.idempotencyKey !== "string" ||
    request.idempotencyKey !== `preppy-delivery/${value.deliveryId}/v1` ||
    request.idempotencyKey.length > 256 ||
    typeof request.payloadHash !== "string" ||
    !/^sha256:[a-f0-9]{64}$/.test(request.payloadHash)
  ) {
    return null;
  }
  return {
    deliveryId: value.deliveryId,
    providerRequest: {
      provider: "RESEND" as const,
      version: 1 as const,
      idempotencyKey: request.idempotencyKey,
      payloadHash: request.payloadHash,
    },
  };
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
    return parseDeliveryPayload(value);
  }
  return null;
}
