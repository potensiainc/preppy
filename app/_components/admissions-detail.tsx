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
  AdmissionNotice,
  AdmissionSections,
  AdmissionSessions,
  AdmissionSources,
} from "./admissions-content";
import styles from "./admissions.module.css";

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
  const caveat = [...sections, ...guideSections].find((section) =>
    /유의|주의|확인 필요|확인 범위|경고|충돌/u.test(section.heading ?? ""),
  );
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
              <dl className={styles.essentials}>
                {opportunity.targetAudience ? (
                  <div>
                    <dt>지원 대상 / 자격</dt>
                    <dd>{opportunity.targetAudience}</dd>
                  </div>
                ) : null}
                {opportunity.institution.region ? (
                  <div>
                    <dt>기관 소재 지역</dt>
                    <dd>{opportunity.institution.region}</dd>
                  </div>
                ) : null}
              </dl>
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
        <nav className={styles.sectionNav} aria-label="이 페이지 안내">
          {related.length ? (
            <a href="#admission-sessions">같은 학년도 일정</a>
          ) : null}
          {sections.length ? (
            <a href="#current-admission-guide">모집 안내</a>
          ) : null}
          {guide ? <a href="#full-admission-guide">전체 모집요강</a> : null}
          {caveat ? <a href={`#${caveat.id}`}>확인·유의사항</a> : null}
          <a href="#admission-sources">공식 원문</a>
        </nav>
        <div className={styles.bodyGrid}>
          <div className={styles.content}>
            <AdmissionSessions items={related} currentSlug={opportunity.slug} />
            {sections.length ? (
              <section
                id="current-admission-guide"
                className={styles.section}
                aria-label="모집 안내"
              >
                <p className={styles.kicker}>ADMISSION GUIDE</p>
                <h2>모집 안내</h2>
                <AdmissionSections sections={sections} />
              </section>
            ) : null}
            {guide ? (
              <section
                id="full-admission-guide"
                className={styles.section}
                aria-label="공식 모집요강"
              >
                <p className={styles.kicker}>FULL ADMISSION GUIDE</p>
                <h2>공식 모집요강</h2>
                <p>
                  <Link href={`/opportunities/${guide.slug}`}>
                    {guide.title}
                  </Link>
                </p>
                {guideProvisional &&
                (!provisional ||
                  admissionNoticeText(guide.summary) !==
                    admissionNoticeText(opportunity.summary)) ? (
                  <AdmissionNotice text={admissionNoticeText(guide.summary)} />
                ) : null}
                <AdmissionSections sections={guideSections} />
                <AdmissionSources
                  sources={guide.officialSources}
                  collectedAt={guide.lastCollectedAt}
                  verifiedAt={guide.lastVerifiedAt}
                />
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
                      <p>{change.summary}</p>
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
            <section className={styles.section} aria-label="관심기관 알림">
              <FollowCta
                context="OPPORTUNITY"
                followable={opportunity.institution.followable}
                institutionId={opportunity.institution.id}
                opportunityId={opportunity.id}
                returnPath={`/opportunities/${opportunity.slug}`}
              />
            </section>
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
