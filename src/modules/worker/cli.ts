export const fakeWorkerOutcomeValues = [
  "ACCEPTED",
  "RETRYABLE_FAILURE",
  "TERMINAL_FAILURE",
  "RESULT_UNKNOWN",
] as const;

export type FakeWorkerOutcome = (typeof fakeWorkerOutcomeValues)[number];

export type WorkerCliArguments = Readonly<{
  once: true;
  fakeOutcome: FakeWorkerOutcome;
  workerId: string;
  batchSize: number;
  leaseDurationMs: number;
}>;

function integer(value: string | undefined) {
  if (!value || !/^[1-9]\d*$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export function parseWorkerCliArguments(
  arguments_: readonly string[],
): WorkerCliArguments | null {
  if (!arguments_.includes("--once") || arguments_.length > 5) return null;
  const values = new Map<string, string>();
  for (const argument of arguments_) {
    if (argument === "--once") continue;
    const separator = argument.indexOf("=");
    if (separator <= 2) return null;
    const key = argument.slice(0, separator);
    const value = argument.slice(separator + 1);
    if (
      !["--fake-outcome", "--worker-id", "--batch", "--lease-ms"].includes(
        key,
      ) ||
      values.has(key)
    ) {
      return null;
    }
    values.set(key, value);
  }
  const fakeOutcome = values.get("--fake-outcome");
  if (!fakeWorkerOutcomeValues.some((candidate) => candidate === fakeOutcome)) {
    return null;
  }
  const batchSize = integer(values.get("--batch") ?? "10");
  const leaseDurationMs = integer(values.get("--lease-ms") ?? "300000");
  if (!batchSize || !leaseDurationMs) return null;
  return {
    once: true,
    fakeOutcome: fakeOutcome as FakeWorkerOutcome,
    workerId: values.get("--worker-id") ?? `worker-${process.pid}`,
    batchSize,
    leaseDurationMs,
  };
}
