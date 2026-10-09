import type { InstitutionCardDTO, OpportunityCardDTO } from "./dto";

/** Only an explicit academic-year label is authoritative; dates and slugs are not. */
export function explicitAcademicYear(title: string): number | null {
  const years = [...title.matchAll(/\b(20\d{2})\s*학년도/gu)].map((m) =>
    Number(m[1]),
  );
  return years.length > 0 && new Set(years).size === 1 ? years[0]! : null;
}

export function isEarlierAcademicYear(
  title: string,
  contextYear: number | null,
): boolean {
  const year = explicitAcademicYear(title);
  return contextYear !== null && year !== null && year < contextYear;
}

/** Preserve editorial links; supplement only the same institution, year and kind. */
export function alignArticleAdmissions(
  institutions: InstitutionCardDTO[],
  opportunities: OpportunityCardDTO[],
  candidates: OpportunityCardDTO[],
  academicYear: number,
) {
  const current = candidates
    .filter((item) => explicitAcademicYear(item.title) === academicYear)
    .sort(
      (a, b) =>
        (b.lastVerifiedAt ?? "").localeCompare(a.lastVerifiedAt ?? "") ||
        a.id.localeCompare(b.id),
    );
  const pairs = new Set(
    opportunities.map((item) => `${item.institution.id}:${item.kind}`),
  );
  const seen = new Set(opportunities.map((item) => item.id));
  const additional = current.filter((item) => {
    if (!pairs.has(`${item.institution.id}:${item.kind}`) || seen.has(item.id))
      return false;
    seen.add(item.id);
    return true;
  });
  return {
    relatedOpportunities: [...opportunities, ...additional],
    relatedInstitutions: institutions.map((institution) => {
      const prior = institution.currentOpportunity;
      if (!prior || !isEarlierAcademicYear(prior.title, academicYear))
        return institution;
      const next = current.find(
        (item) =>
          item.institution.id === institution.id && item.kind === prior.kind,
      );
      if (!next) return institution;
      return {
        ...institution,
        currentAdmissionsState: next.businessState,
        lastVerifiedAt: next.lastVerifiedAt,
        currentOpportunity: {
          id: next.id,
          slug: next.slug,
          title: next.title,
          kind: next.kind,
          state: next.businessState,
          keyDate: next.keyDate,
        },
      };
    }),
  };
}
