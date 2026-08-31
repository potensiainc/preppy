import Link from "next/link";
import type {
  OfficialSourceDTO,
  OpportunityKeyDatesDTO,
  PublicOpportunityDTO,
  ReviewedAdmissionDTO,
} from "@/src/modules/public/dto";
import {
  isProvisionalAdmissionGuidance,
  PROVISIONAL_ADMISSION_NOTICE,
} from "@/src/modules/live-admissions/guidance";
import {
  admissionClock,
  admissionNoticeText,
  admissionSections,
  admissionSourceType,
  admissionTimestamp,
  canCollapseAdmissionSection,
  type AdmissionSection,
} from "@/app/_lib/admissions-presentation";
import {
  formatPublicDate,
  formatPublicDateTime,
  opportunityKindLabel,
  safeExternalHref,
} from "@/app/_lib/presentation";
import { StateBadge } from "./public-cards";
import styles from "./admissions.module.css";

export function AdmissionNotice({
  text = PROVISIONAL_ADMISSION_NOTICE,
}: {
  text?: string;
}) {
  return (
    <p className={styles.notice}>
      <strong>{text}</strong>
    </p>
  );
}

function DateValue({ value }: { value: string }) {
  const clock = admissionClock(value);
  return (
    <time dateTime={value}>
      <span className={styles.date}>{formatPublicDate(value)}</span>
      {clock ? <strong className={styles.clock}>{clock}</strong> : null}
    </time>
  );
}

export function AdmissionDates({
  keyDates,
  kind,
  provisional = false,
}: {
  keyDates: OpportunityKeyDatesDTO;
  kind: PublicOpportunityDTO["kind"];
  provisional?: boolean;
}) {
  const application = [
    "RECRUITMENT",
    "ADDITIONAL_RECRUITMENT",
    "APPLICATION",
  ].includes(kind);
  const start = application
    ? keyDates.applicationOpensAt
    : keyDates.eventStartsAt;
  const end = application ? keyDates.applicationClosesAt : keyDates.eventEndsAt;
  const supplement = application
    ? [
        ["행사 시작", keyDates.eventStartsAt],
        ["행사 종료", keyDates.eventEndsAt],
      ]
    : [
        ["지원 시작", keyDates.applicationOpensAt],
        ["지원 마감", keyDates.applicationClosesAt],
      ];
  return (
    <div aria-label="주요 일정">
      <div className={styles.datePanel}>
        <p>
          {application ? "원서접수 일정" : `${opportunityKindLabel(kind)} 일정`}
          {provisional ? " (예정)" : ""}
        </p>
        <dl className={styles.dateWindow}>
          <div>
            <dt>
              {application ? "지원 시작" : "행사 시작"}
              {provisional ? " (예정)" : ""}
            </dt>
            <dd>{start ? <DateValue value={start} /> : "시작 일정 미확인"}</dd>
          </div>
          <div>
            <dt>
              {application ? "지원 마감" : "행사 종료"}
              {provisional ? " (예정)" : ""}
            </dt>
            <dd>
              {end ? (
                <DateValue value={end} />
              ) : application ? (
                "마감 일정 미확인"
              ) : (
                "종료 일정 미확인"
              )}
            </dd>
          </div>
        </dl>
      </div>
      {supplement.some(([, value]) => value) ? (
        <dl className={styles.supplement}>
          {supplement.map(([label, value]) =>
            value ? (
              <div key={label}>
                <dt>
                  {label}
                  {provisional ? " (예정)" : ""}
                </dt>
                <dd>
                  <time dateTime={value}>{formatPublicDateTime(value)}</time>
                </dd>
              </div>
            ) : null,
          )}
        </dl>
      ) : null}
    </div>
  );
}

export function AdmissionSections({
  sections,
  collapsible = false,
}: {
  sections: AdmissionSection[];
  collapsible?: boolean;
}) {
  return sections.map((section) => {
    const paragraphs = section.paragraphs.map((paragraph, index) => (
      <p key={index}>{paragraph}</p>
    ));
    if (collapsible && canCollapseAdmissionSection(section))
      return (
        <details className={styles.guideDetails} key={section.id}>
          <summary>{section.heading}</summary>
          {paragraphs}
        </details>
      );
    return (
      <section className={styles.guideSection} id={section.id} key={section.id}>
        {section.heading ? <h3>{section.heading}</h3> : null}
        {paragraphs}
      </section>
    );
  });
}

export function AdmissionSources({
  sources,
  collectedAt,
  verifiedAt,
  actionUrl,
}: {
  sources: OfficialSourceDTO[];
  collectedAt?: string | null;
  verifiedAt?: string | null;
  actionUrl?: string | null;
}) {
  const actionHref = actionUrl ? safeExternalHref(actionUrl) : null;
  return (
    <div className={styles.sourceCard}>
      <p className={styles.kicker}>OFFICIAL SOURCES</p>
      <h2>공식 원문과 확인 정보</h2>
      <p className={styles.helper}>
        지원 전 학교의 원문과 추가·정정 공지를 함께 확인하세요.
      </p>
      {sources.map((source, index) => {
        const href = safeExternalHref(source.url);
        const content = (
          <>
            <strong>{source.name}</strong>
            <span>
              {admissionSourceType(source.url)}
              {href ? " ↗" : " · 링크 확인 필요"}
            </span>
          </>
        );
        return href ? (
          <a
            key={`${source.url}-${index}`}
            className={styles.sourceLink}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
          >
            {content}
          </a>
        ) : (
          <div className={styles.sourceLink} key={`${source.url}-${index}`}>
            {content}
          </div>
        );
      })}
      {actionHref ? (
        <a
          className={styles.action}
          href={actionHref}
          target="_blank"
          rel="noopener noreferrer"
        >
          지원 페이지 확인 ↗
        </a>
      ) : null}
      {collectedAt || verifiedAt ? (
        <dl className={styles.timestamps}>
          {collectedAt ? (
            <div>
              <dt>자료 수집 · Last Collected</dt>
              <dd>
                <time dateTime={collectedAt}>
                  {admissionTimestamp(collectedAt)}
                </time>
              </dd>
            </div>
          ) : null}
          {verifiedAt ? (
            <div>
              <dt>내용 검수 · Last Verified</dt>
              <dd>
                <time dateTime={verifiedAt}>
                  {admissionTimestamp(verifiedAt)}
                </time>
              </dd>
            </div>
          ) : null}
        </dl>
      ) : null}
      <p className={styles.helper}>
        검수는 원문 대조를 뜻하며, 학교의 확정 발표를 뜻하지 않습니다.
      </p>
    </div>
  );
}

export function AdmissionSessions({
  items,
  currentSlug,
}: {
  items: NonNullable<PublicOpportunityDTO["relatedAdmissions"]>;
  currentSlug: string;
}) {
  if (!items.length) return null;
  return (
    <section
      id="admission-sessions"
      className={styles.section}
      aria-label="같은 학년도 일정"
    >
      <p className={styles.kicker}>RELATED ADMISSION DATES</p>
      <h2>같은 학년도 일정</h2>
      <p className={styles.helper}>
        회차별 날짜와 시각을 확인하고 상세 안내로 이동하세요.
      </p>
      <div className={styles.sessions}>
        {items.map((item) => (
          <Link
            href={`/opportunities/${item.slug}`}
            key={item.slug}
            className={styles.session}
            aria-current={item.slug === currentSlug ? "page" : undefined}
          >
            <span>
              {opportunityKindLabel(item.kind)} ·{" "}
              <StateBadge state={item.businessState} />
            </span>
            <strong>{item.title}</strong>
            {item.keyDates.eventStartsAt ? (
              <DateValue value={item.keyDates.eventStartsAt} />
            ) : (
              <span>시작 일정 미확인</span>
            )}
            {item.keyDates.eventEndsAt ? (
              <span>
                종료{" "}
                <time dateTime={item.keyDates.eventEndsAt}>
                  {formatPublicDateTime(item.keyDates.eventEndsAt)}
                </time>
              </span>
            ) : null}
            <span>
              {item.slug === currentSlug
                ? "현재 보고 있는 일정"
                : "상세 안내 →"}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function knowledgeLabel(state: ReviewedAdmissionDTO["knowledgeState"]): string {
  if (state === "SCHEDULE_FOUND") return "공식 일정 확인됨";
  if (state === "GUIDANCE_FOUND") return "모집 안내 확인 · 날짜 미확인";
  if (state === "NOT_ANNOUNCED") return "일정 미발표";
  return "관련 일정·지원 정보 미발견";
}

function isPrimaryAdmissionGuide(admission: ReviewedAdmissionDTO): boolean {
  return (
    admission.kind === "RECRUITMENT" ||
    admission.kind === "ADDITIONAL_RECRUITMENT" ||
    /^live-admissions-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-(20\d{2}|current)$/u.test(
      admission.slug,
    )
  );
}

export function ReviewedAdmissions({
  admissions,
}: {
  admissions: ReviewedAdmissionDTO[];
}) {
  if (!admissions.length) return null;
  // Presentation only: preserve source order within guide and event groups,
  // including canonical main guides whose admission kind is LOTTERY.
  const orderedAdmissions = [
    ...admissions.filter(isPrimaryAdmissionGuide),
    ...admissions.filter((admission) => !isPrimaryAdmissionGuide(admission)),
  ];
  return (
    <section className="institution-detail__section" aria-label="입학정보">
      <h2>입학정보</h2>
      <p className={styles.helper}>공식 자료와 검수를 거친 입학 안내입니다.</p>
      <div className={styles.reviewedList}>
        {orderedAdmissions.map((admission, index) => {
          const provisional = isProvisionalAdmissionGuidance(
            `${admission.title} ${admission.summary ?? ""}`,
          );
          const sections = admissionSections(
            admission.summary,
            `reviewed-${index}`,
            provisional,
          );
          return (
            <article className={styles.reviewedCard} key={admission.id}>
              <div className={styles.heroHeading}>
                <div>
                  <p className={styles.kicker}>
                    {admission.academicYearLabel ?? "학년도 미확인"} ·{" "}
                    {provisional &&
                    admission.knowledgeState === "SCHEDULE_FOUND"
                      ? "공식 예정 일정 확인"
                      : knowledgeLabel(admission.knowledgeState)}
                  </p>
                  <h3>
                    <Link href={`/opportunities/${admission.slug}`}>
                      {admission.title}
                    </Link>
                  </h3>
                </div>
                <StateBadge state={admission.businessState} />
              </div>
              {provisional ? (
                <AdmissionNotice
                  text={admissionNoticeText(admission.summary)}
                />
              ) : null}
              <div className={styles.summaryGrid}>
                <AdmissionDates
                  keyDates={admission.keyDates}
                  kind={admission.kind}
                  provisional={provisional}
                />
                <div className={styles.essentials}>
                  <span>지원 대상 / 자격</span>
                  <p>
                    {admission.targetAudience ?? "공식 자료에서 확인된 값 없음"}
                  </p>
                  <Link
                    className={styles.action}
                    href={`/opportunities/${admission.slug}`}
                  >
                    전체 모집·입학 안내 보기 →
                  </Link>
                </div>
              </div>
              <div className={styles.reviewedGuide}>
                <AdmissionSections sections={sections} collapsible />
              </div>
              <AdmissionSources
                sources={
                  admission.officialSources ?? [admission.officialSource]
                }
                collectedAt={admission.lastCollectedAt}
                verifiedAt={admission.lastVerifiedAt}
              />
            </article>
          );
        })}
      </div>
    </section>
  );
}
