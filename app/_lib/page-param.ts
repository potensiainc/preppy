export function parsePageParam(
  value: string | string[] | undefined,
): number | null {
  if (value === undefined) return 1;
  if (Array.isArray(value) || !/^[1-9][0-9]{0,3}$/u.test(value)) return null;
  return Number(value);
}
