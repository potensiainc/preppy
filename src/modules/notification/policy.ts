export const OPPORTUNITY_NOTIFICATION_POLICY_VERSION =
  "OPPORTUNITY_NOTIFICATION_V1" as const;

export const DELIVERY_SEND_GENERATION = "v1" as const;

export function opportunityChangeNotificationDedupeKey(changeId: string) {
  return `notification:opportunity-change:${changeId}:${OPPORTUNITY_NOTIFICATION_POLICY_VERSION}`;
}

export function deliverySendDedupeKey(deliveryId: string) {
  return `delivery-send:${deliveryId}:${DELIVERY_SEND_GENERATION}`;
}
