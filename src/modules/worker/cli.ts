export const fakeWorkerOutcomeValues = [
  "ACCEPTED",
  "RETRYABLE_FAILURE",
  "TERMINAL_FAILURE",
  "RESULT_UNKNOWN",
] as const;

export const DEFAULT_WORKER_LEASE_DURATION_MS = 300_000;

export type FakeWorkerOutcome = (typeof fakeWorkerOutcomeValues)[number];

type WorkerCliBase = Readonly<{
  once: true;
  workerId: string;
  batchSize: number;
  leaseDurationMs: number;
  timeoutMs?: number;
}>;

export type WorkerCliArguments =
  | (WorkerCliBase & Readonly<{ fakeOutcome: FakeWorkerOutcome }>)
  | (WorkerCliBase & Readonly<{ provider: "RESEND" }>);

function integer(value: string | undefined) {
  if (!value || !/^[1-9]\d*$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export function parseWorkerCliArguments(
  arguments_: readonly string[],
): WorkerCliArguments | null {
  if (!arguments_.includes("--once") || arguments_.length > 6) return null;
  const values = new Map<string, string>();
  for (const argument of arguments_) {
    if (argument === "--once") continue;
    const separator = argument.indexOf("=");
    if (separator <= 2) return null;
    const key = argument.slice(0, separator);
    const value = argument.slice(separator + 1);
    if (
      ![
        "--fake-outcome",
        "--provider",
        "--worker-id",
        "--batch",
        "--lease-ms",
        "--timeout-ms",
      ].includes(key) ||
      values.has(key)
    ) {
      return null;
    }
    values.set(key, value);
  }
  const fakeOutcome = values.get("--fake-outcome");
  const provider = values.get("--provider");
  const fakeMode = fakeWorkerOutcomeValues.some(
    (candidate) => candidate === fakeOutcome,
  );
  const resendMode = provider === "resend";
  if (fakeMode === resendMode || (provider !== undefined && !resendMode)) {
    return null;
  }
  const batchSize = integer(values.get("--batch") ?? "10");
  const leaseDurationMs = integer(
    values.get("--lease-ms") ?? String(DEFAULT_WORKER_LEASE_DURATION_MS),
  );
  const timeoutValue = values.get("--timeout-ms");
  let timeoutMs: number | undefined;
  if (timeoutValue !== undefined) {
    const parsedTimeoutMs = integer(timeoutValue);
    if (
      parsedTimeoutMs === null ||
      parsedTimeoutMs < 1_000 ||
      parsedTimeoutMs > 240_000
    ) {
      return null;
    }
    timeoutMs = parsedTimeoutMs;
  }
  if (!batchSize || !leaseDurationMs) return null;
  const base = {
    once: true,
    workerId: values.get("--worker-id") ?? `worker-${process.pid}`,
    batchSize,
    leaseDurationMs,
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
  } as const;
  return resendMode
    ? { ...base, provider: "RESEND" }
    : { ...base, fakeOutcome: fakeOutcome as FakeWorkerOutcome };
}

export function scheduleWorkerHardTimeout(
  timeoutMs: number,
  dependencies: Readonly<{
    schedule: (callback: () => void, delayMs: number) => unknown;
    cancel: (handle: unknown) => void;
    hardExit: (exitCode: number) => never;
  }>,
): () => void {
  const handle = dependencies.schedule(
    () => dependencies.hardExit(124),
    timeoutMs,
  );
  return () => dependencies.cancel(handle);
}
