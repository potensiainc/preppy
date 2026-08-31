import Link from "next/link";
import type { PublicOpportunityDTO } from "@/src/modules/public/dto";
import { isProvisionalAdmissionGuidance } from "@/src/modules/live-admissions/guidance";
import {
  admissionNoticeText,
  admissionSections,
} from "@/app/_lib/admissions-presentation";
import {
  categoryLabel,
  formatPublicDate,
  opportunityKindLabel,
} from "@/app/_lib/presentation";
import { TrackedFollowCta as FollowCta } from "./tracked-follow-cta";
import { ArticleCard, StateBadge } from "./public-cards";
import { PageContainer } from "./ui-primitives";
import {
  AdmissionDates,
  AdmissionAudience,
  AdmissionNotice,
  AdmissionSections,
  AdmissionSessions,
  AdmissionSources,
} from "./admissions-content";
import styles from "./admissions.module.css";
import { publicAdmissionText } from "@/src/modules/public/admission-copy";
import { publicProse } from "@/src/modules/public/ux-writing";

export function OpportunityDetailView({
  opportunity,
}: {
  opportunity: PublicOpportunityDTO;
}) {
  const guide = opportunity.admissionGuide;
  const provisional = isProvisionalAdmissionGuidance(
    `${opportunity.title} ${opportunity.summary ?? ""}`,
  );
  const guideProvisional =
    !!guide &&
    isProvisionalAdmissionGuidance(`${guide.title} ${guide.summary ?? ""}`);
  const sections = admissionSections(
    opportunity.summary,
    "admission-guide",
    provisional,
  );
  const guideSections = admissionSections(
    guide?.summary ?? null,
    "parent-guide",
    guideProvisional,
  );
  const related = opportunity.relatedAdmissions ?? [];
  const sources =
    opportunity.officialSources ??
    (opportunity.officialSource ? [opportunity.officialSource] : []);
  return (
    <PageContainer>
      <article className={styles.admissions}>
        <nav className={styles.breadcrumbs} aria-label="현재 위치">
          <Link href="/institutions">기관 찾기</Link>
          <span aria-hidden="true">/</span>
          <Link href={`/institutions/${opportunity.institution.slug}`}>
            {opportunity.institution.name}
          </Link>
          <span aria-hidden="true">/</span>
          <span>{opportunityKindLabel(opportunity.kind)}</span>
        </nav>
        <header className={styles.hero}>
          <div className={styles.heroHeading}>
            <div>
              <p className={styles.kicker}>
                {opportunity.academicYearLabel ?? "학년도 미확인"} ·{" "}
                {categoryLabel(opportunity.institution.category)}
              </p>
              <Link
                className={styles.school}
                href={`/institutions/${opportunity.institution.slug}`}
              >
                {opportunity.institution.name}
              </Link>
              <h1>{opportunity.title}</h1>
            </div>
            <div className={styles.status}>
              <StateBadge state={opportunity.businessState} />
            </div>
          </div>
          {provisional ? (
            <AdmissionNotice text={admissionNoticeText(opportunity.summary)} />
          ) : null}
          <div className={styles.summaryGrid}>
            <AdmissionDates
              kind={opportunity.kind}
              keyDates={opportunity.keyDates}
              provisional={provisional}
            />
            {opportunity.targetAudience || opportunity.institution.region ? (
              <div className={styles.essentials}>
                {opportunity.targetAudience ? (
                  <AdmissionAudience value={opportunity.targetAudience} />
                ) : null}
                {opportunity.institution.region ? (
                  <dl className={styles.audienceRows}>
                    <div>
                      <dt>기관 소재 지역</dt>
                      <dd>{opportunity.institution.region}</dd>
                    </div>
                  </dl>
                ) : null}
              </div>
            ) : null}
          </div>
          {guide ? (
            <p className={styles.parentLink}>
              <Link href={`/opportunities/${guide.slug}`}>
                {guide.title} · 전체 모집요강 보기 →
              </Link>
            </p>
          ) : null}
        </header>
        <div className={styles.bodyGrid}>
          <div className={styles.content}>
            <AdmissionSessions
              items={related}
              currentSlug={opportunity.slug}
              commonSummary={guide?.summary ?? opportunity.summary}
              commonAudience={guide ? undefined : opportunity.targetAudience}
              commonActionUrl={guide ? undefined : opportunity.actionUrl}
            />
            {sections.length || guideSections.length ? (
              <section
                id="current-admission-guide"
                className={styles.section}
                aria-label="모집·입학 안내"
              >
                <h2>모집·입학 안내</h2>
                {guide &&
                guideProvisional &&
                (!provisional ||
                  admissionNoticeText(guide.summary) !==
                    admissionNoticeText(opportunity.summary)) ? (
                  <AdmissionNotice text={admissionNoticeText(guide.summary)} />
                ) : null}
                <AdmissionSections
                  sections={guide ? guideSections : sections}
                />
                {guide ? (
                  <>
                    {!related.some((item) => item.slug === opportunity.slug) ? (
                      <AdmissionSections
                        sections={sections
                          .map((section) => ({
                            ...section,
                            paragraphs: section.paragraphs.filter(
                              (text) =>
                                !guideSections.some(
                                  (shared) =>
                                    shared.heading === section.heading &&
                                    shared.paragraphs.includes(text),
                                ),
                            ),
                          }))
                          .filter((section) => section.paragraphs.length)}
                      />
                    ) : null}
                    <AdmissionSources
                      sources={guide.officialSources}
                      collectedAt={guide.lastCollectedAt}
                      verifiedAt={guide.lastVerifiedAt}
                    />
                  </>
                ) : null}
              </section>
            ) : null}
            {opportunity.recentMeaningfulChanges.length ? (
              <section className={styles.section} aria-label="최근 변경 사항">
                <h2>최근 변경 사항</h2>
                <ol className={styles.changes}>
                  {opportunity.recentMeaningfulChanges.map((change) => (
                    <li key={`${change.occurredAt}-${change.summary}`}>
                      <time dateTime={change.occurredAt}>
                        {formatPublicDate(change.occurredAt)}
                      </time>
                      <p>{publicProse(publicAdmissionText(change.summary))}</p>
                    </li>
                  ))}
                </ol>
              </section>
            ) : null}
            {opportunity.relatedArticles.length ? (
              <section className={styles.section} aria-label="관련 아티클">
                <h2>관련 아티클</h2>
                <div className="detail-card-grid">
                  {opportunity.relatedArticles.map((article) => (
                    <ArticleCard key={article.id} article={article} />
                  ))}
                </div>
              </section>
            ) : null}
            {opportunity.institution.followable ? (
              <section className={styles.section} aria-label="관심기관 등록">
                <FollowCta
                  context="OPPORTUNITY"
                  followable={opportunity.institution.followable}
                  institutionId={opportunity.institution.id}
                  opportunityId={opportunity.id}
                  returnPath={`/opportunities/${opportunity.slug}`}
                />
              </section>
            ) : null}
          </div>
          <aside
            id="admission-sources"
            className={styles.sourceAside}
            aria-label="공식 출처와 확인 정보"
          >
            <AdmissionSources
              sources={sources}
              collectedAt={opportunity.lastCollectedAt}
              verifiedAt={opportunity.lastVerifiedAt}
              actionUrl={opportunity.actionUrl}
            />
          </aside>
        </div>
      </article>
    </PageContainer>
  );
}
