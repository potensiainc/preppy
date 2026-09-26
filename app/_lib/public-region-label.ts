/** Show familiar place names while preserving unknown public region values. */
export function publicRegionLabel(region: string): string {
  if (["11", "KR-11", "SEOUL"].includes(region)) return "서울";
  if (["41", "KR-41", "GYEONGGI"].includes(region)) return "경기";
  return region;
}
