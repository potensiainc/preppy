export function assertReleaseBaseline(input: {
  dirty: boolean;
  includesMain: boolean;
}): void;
export function checkReleaseBaseline(): { gitSha: string; mainSha: string };
