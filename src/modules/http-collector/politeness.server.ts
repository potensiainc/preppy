import type { HttpCollectorPolicy } from "./contracts";
import type { StaticHttpTransport } from "./http-transport.server";

class Semaphore {
  private active = 0;
  private readonly waiting: Array<() => void> = [];

  constructor(private readonly maximum: number) {}

  async acquire(): Promise<() => void> {
    if (this.active >= this.maximum) {
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    }
    this.active += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.active -= 1;
      this.waiting.shift()?.();
    };
  }
}

export function createPoliteHttpTransport(
  input: Readonly<{
    delegate: StaticHttpTransport;
    policy: HttpCollectorPolicy;
    clockMs?: () => number;
    sleep?: (milliseconds: number) => Promise<void>;
  }>,
): StaticHttpTransport {
  const clockMs = input.clockMs ?? Date.now;
  const sleep =
    input.sleep ??
    ((milliseconds: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  const global = new Semaphore(input.policy.globalConcurrency);
  const hostTails = new Map<string, Promise<void>>();
  const lastStartedAt = new Map<string, number>();

  return {
    async fetch(request) {
      const host = new URL(request.url).host.toLowerCase();
      const prior = hostTails.get(host) ?? Promise.resolve();
      let releaseHost!: () => void;
      const hostGate = new Promise<void>((resolve) => {
        releaseHost = resolve;
      });
      const tail = prior.then(() => hostGate);
      hostTails.set(host, tail);
      await prior;

      let releaseGlobal: (() => void) | undefined;
      try {
        const priorStart = lastStartedAt.get(host);
        if (priorStart !== undefined) {
          const remaining =
            priorStart + input.policy.minimumHostDelayMs - clockMs();
          if (remaining > 0) await sleep(remaining);
        }
        releaseGlobal = await global.acquire();
        lastStartedAt.set(host, clockMs());
        return await input.delegate.fetch(request);
      } finally {
        releaseGlobal?.();
        releaseHost();
        if (hostTails.get(host) === tail) hostTails.delete(host);
      }
    },
  };
}

export function createRequestPolitenessGate(
  input: Readonly<{
    policy: HttpCollectorPolicy;
    clockMs?: () => number;
    sleep?: (milliseconds: number) => Promise<void>;
  }>,
): (url: string) => Promise<void> {
  const clockMs = input.clockMs ?? Date.now;
  const sleep =
    input.sleep ??
    ((milliseconds: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  const hostTails = new Map<string, Promise<void>>();
  const lastStartedAt = new Map<string, number>();
  return async (url: string) => {
    const host = new URL(url).host.toLowerCase();
    const prior = hostTails.get(host) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = prior.then(() => gate);
    hostTails.set(host, tail);
    await prior;
    try {
      const priorStart = lastStartedAt.get(host);
      if (priorStart !== undefined) {
        const remaining =
          priorStart + input.policy.minimumHostDelayMs - clockMs();
        if (remaining > 0) await sleep(remaining);
      }
      lastStartedAt.set(host, clockMs());
    } finally {
      release();
      if (hostTails.get(host) === tail) hostTails.delete(host);
    }
  };
}
