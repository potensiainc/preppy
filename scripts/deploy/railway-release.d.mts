export const RELEASE_TARGETS: Record<
  "staging" | "production",
  { tokenVariable: string; environmentId: string; web: string; worker: string }
>;
export function parseReleaseArgs(argv: string[]): {
  target: "staging" | "production";
  image: string;
  apply: boolean;
};
export function assertStagingVerified(
  stagingServices: { image: string | null; status: string | null }[],
  image: string,
): void;
export function assertImageBuiltFrom(
  image: string,
  publishedDigest: string,
): void;
