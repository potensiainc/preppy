export type RunByteBudgetLedger = Readonly<{
  maximumBytes: number;
  readonly consumedBytes: number;
  readonly remainingBytes: number;
  readonly exhausted: boolean;
  readonly exceeded: boolean;
  charge(decodedBytes: number): void;
}>;

export type RunByteBudgetEvidence = Readonly<{
  maximumBytes: number;
  consumedBytes: number;
  remainingBytes: number;
  exhausted: boolean;
  exceeded: boolean;
}>;

export function createRunByteBudgetLedger(
  maximumBytes: number,
): RunByteBudgetLedger {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes <= 0) {
    throw new RangeError("Run byte budget must be a positive safe integer");
  }
  let consumedBytes = 0;
  return {
    maximumBytes,
    get consumedBytes() {
      return consumedBytes;
    },
    get remainingBytes() {
      return Math.max(0, maximumBytes - consumedBytes);
    },
    get exhausted() {
      return consumedBytes >= maximumBytes;
    },
    get exceeded() {
      return consumedBytes > maximumBytes;
    },
    charge(decodedBytes) {
      if (!Number.isSafeInteger(decodedBytes) || decodedBytes < 0) {
        throw new RangeError(
          "Decoded byte charge must be a non-negative safe integer",
        );
      }
      consumedBytes += decodedBytes;
      if (!Number.isSafeInteger(consumedBytes)) {
        throw new RangeError("Run byte budget ledger overflowed");
      }
    },
  };
}

export function snapshotRunByteBudget(
  ledger: RunByteBudgetLedger,
): RunByteBudgetEvidence {
  return Object.freeze({
    maximumBytes: ledger.maximumBytes,
    consumedBytes: ledger.consumedBytes,
    remainingBytes: ledger.remainingBytes,
    exhausted: ledger.exhausted,
    exceeded: ledger.exceeded,
  });
}
