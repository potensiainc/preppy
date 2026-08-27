import type { MigrationCommandContext } from "@/src/application/context";
import type { SeedImportPlan } from "@/src/modules/institution-seed/planner";

export type SeedImportMode = "dry-run" | "apply";

export type SeedProductSideEffectCounts = {
  institutionFacts: number;
  opportunities: number;
  sourceObservations: number;
  sourceSnapshots: number;
  sourceMonitorConfigs: number;
  detectedChanges: number;
  meaningfulChanges: number;
  outboxEvents: number;
  notifications: number;
  notificationDeliveries: number;
  notificationDeliveryAttempts: number;
  emailProviderEvents: number;
};

export type SeedImportReport = {
  mode: SeedImportMode;
  applied: boolean;
  context: MigrationCommandContext;
  plan: SeedImportPlan;
  audit: {
    actionType: "SEED_BOOTSTRAP_IMPORT";
    written: boolean;
  };
  productSideEffects: {
    before: SeedProductSideEffectCounts;
    after: SeedProductSideEffectCounts;
    delta: SeedProductSideEffectCounts;
  };
};

export function productSideEffectDelta(
  before: SeedProductSideEffectCounts,
  after: SeedProductSideEffectCounts,
): SeedProductSideEffectCounts {
  return Object.fromEntries(
    Object.entries(before).map(([key, value]) => [
      key,
      after[key as keyof SeedProductSideEffectCounts] - value,
    ]),
  ) as SeedProductSideEffectCounts;
}
