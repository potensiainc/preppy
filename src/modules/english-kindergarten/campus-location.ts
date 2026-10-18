import { seoulDistrictSet } from "@/src/modules/public/location";

/** Use official address/region text, never the campus name (e.g. Seongdong in Jung-gu). */
export function normalizeCampusLocation(
  officialAddress: string,
  officialRegion: string,
) {
  const text = `${officialRegion} ${officialAddress}`;
  const regionCode = /^(서울특별시|서울시|서울)(\s|$)/.test(text)
    ? "KR-11"
    : /^(경기도|경기)(\s|$)/.test(text)
      ? "KR-41"
      : /^(인천광역시|인천시|인천)(\s|$)/.test(text)
        ? "KR-28"
        : null;
  const district =
    regionCode === "KR-11"
      ? ([...seoulDistrictSet].find((d) =>
          new RegExp(`(^|\\s)${d}(\\s|$)`).test(text),
        ) ?? null)
      : null;
  return { regionCode, district };
}
