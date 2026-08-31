import Link from "next/link";
import { Fragment } from "react";
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
import {
  admissionAudienceRows,
  admissionReadingGroups,
} from "@/app/_lib/admissions-readability";
import {
  admissionSessionAnchor,
  groupReviewedAdmissions,
  isPastAdmissionDate,
} from "@/app/_lib/admission-navigation";
import styles from "./admissions.module.css";
import { publicAdmissionText } from "@/src/modules/public/admission-copy";
import { publicProse } from "@/src/modules/public/ux-writing";

export function AdmissionNotice({
  text = PROVISIONAL_ADMISSION_NOTICE,
}: {
  text?: string;
}) {
  return (
    <p className={styles.notice}>
      <strong>
        {publicProse(publicAdmissionText(text) ?? PROVISIONAL_ADMISSION_NOTICE)}
      </strong>
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
    const groups = admissionReadingGroups(section);
    if (
      groups.length === 1 &&
      collapsible &&
      canCollapseAdmissionSection(section)
    )
      return (
        <details className={styles.guideDetails} key={section.id}>
          <summary>{section.heading}</summary>
          <ReadingItems items={groups[0]!.paragraphs} />
        </details>
      );
    return (
      <section className={styles.guideSection} id={section.id} key={section.id}>
        {groups.map((group, index) => (
          <section
            className={styles.readingGroup}
            data-admission-topic={group.heading ?? undefined}
            aria-labelledby={
              group.heading ? `${section.id}-topic-${index}` : undefined
            }
            key={index}
          >
            {group.heading ? (
              <h3 id={`${section.id}-topic-${index}`}>{group.heading}</h3>
            ) : null}
            <ReadingItems items={group.paragraphs} />
            {group.context.length ? (
              <aside
                className={styles.readingContext}
                aria-label="금액 기준·변동 안내"
              >
                {group.context.map((text, i) => (
                  <p key={i}>{publicProse(text)}</p>
                ))}
              </aside>
            ) : null}
          </section>
        ))}
      </section>
    );
  });
}

function ReadingItems({ items }: { items: string[] }) {
  const content = (text: string) =>
    publicProse(text)
      .split(
        /(https?:\/\/\S+|20\d{2}학년도|\d[\d,]*\s*원|\d+\s*(?:명|학급)|\d{1,2}:\d{2}|\d{1,2}월\s*\d{1,2}일)/gu,
      )
      .map((part, index) =>
        index % 2 && !/^https?:\/\//u.test(part) ? (
          <strong key={index}>{part}</strong>
        ) : (
          part
        ),
      );
  if (items.length < 2)
    return items.map((text, index) => <p key={index}>{content(text)}</p>);
  return (
    <ul className={styles.readingList}>
      {items.map((text, index) => (
        <li key={index}>
          <p>{content(text)}</p>
        </li>
      ))}
    </ul>
  );
}

export function AdmissionAudience({ value }: { value: string | null }) {
  const rows = admissionAudienceRows(value);
  return (
    <dl className={styles.audienceRows}>
      {rows.length ? (
        rows.map((row, index) => (
          <div key={index}>
            <dt>{row.label}</dt>
            <dd>{publicProse(row.value)}</dd>
          </div>
        ))
      ) : (
        <div>
          <dt>지원 대상</dt>
          <dd>학교에 문의해 주세요</dd>
        </div>
      )}
    </dl>
  );
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
  if (!sources.length && !collectedAt && !verifiedAt && !actionHref)
    return null;
  return (
    <div className={styles.sourceCard}>
      <p className={styles.kicker}>공식 출처</p>
      <h2>학교 공식 안내</h2>
      <p className={styles.helper}>
        지원 전 학교에서 새로 알린 내용이 있는지 확인해 주세요.
      </p>
      {sources.map((source, index) => {
        const href = safeExternalHref(source.url);
        const content = (
          <>
            <strong>{publicAdmissionText(source.name) || "입학 안내"}</strong>
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
          공식 지원 페이지로 이동 ↗
        </a>
      ) : null}
      {collectedAt || verifiedAt ? (
        <dl className={styles.timestamps}>
          {collectedAt ? (
            <div>
              <dt>자료 수집</dt>
              <dd>
                <time dateTime={collectedAt}>
                  {admissionTimestamp(collectedAt)}
                </time>
              </dd>
            </div>
          ) : null}
          {verifiedAt ? (
            <div>
              <dt>내용 확인</dt>
              <dd>
                <time dateTime={verifiedAt}>
                  {admissionTimestamp(verifiedAt)}
                </time>
              </dd>
            </div>
          ) : null}
        </dl>
      ) : null}
    </div>
  );
}

export function AdmissionSessions({
  items,
  currentSlug,
  commonSummary,
  commonAudience,
  commonActionUrl,
  id = "admission-sessions",
}: {
  items: NonNullable<PublicOpportunityDTO["relatedAdmissions"]>;
  currentSlug: string;
  commonSummary?: string | null;
  commonAudience?: string | null;
  commonActionUrl?: string | null;
  id?: string;
}) {
  if (!items.length) return null;
  const common = admissionSections(commonSummary ?? null, "common");
  const commonNotice = isProvisionalAdmissionGuidance(commonSummary ?? "")
    ? admissionNoticeText(commonSummary ?? null)
    : null;
  const now = new Date();
  const ordered = [...items].sort((a, b) => {
    const chronology =
      Number(isPastAdmissionDate(a.keyDates, now)) -
      Number(isPastAdmissionDate(b.keyDates, now));
    if (chronology) return chronology;
    const left = a.keyDates.eventStartsAt;
    const right = b.keyDates.eventStartsAt;
    if (!left) return right ? 1 : 0;
    if (!right) return -1;
    return left.localeCompare(right);
  });
  return (
    <section id={id} className={styles.section} aria-label="같은 학년도 일정">
      <div className={styles.sessionHeading}>
        <h2>설명회 및 주요 일정</h2>
        <span>{items.length}개 일정</span>
      </div>
      <p className={styles.helper}>
        날짜별 참석 대상과 접수 조건을 한곳에서 비교해 보세요.
      </p>
      <div className={styles.sessions}>
        {ordered.map((item, index) => {
          const anchor = admissionSessionAnchor(item.slug);
          const provisional = isProvisionalAdmissionGuidance(
            `${item.title} ${item.summary ?? ""}`,
          );
          // Only remove exact repeated paragraphs under the same heading.
          // Similar wording or conditions in another context remain visible.
          const sections = admissionSections(
            item.summary ?? null,
            anchor,
            provisional,
          )
            .map((section) => ({
              ...section,
              paragraphs: section.paragraphs.filter(
                (text) =>
                  !common.some(
                    (shared) =>
                      shared.heading === section.heading &&
                      shared.paragraphs.includes(text),
                  ),
              ),
            }))
            .filter((section) => section.paragraphs.length);
          const action = item.actionUrl
            ? safeExternalHref(item.actionUrl)
            : null;
          const past = isPastAdmissionDate(item.keyDates, now);
          return (
            <Fragment key={item.slug}>
              {past &&
              (index === 0 ||
                !isPastAdmissionDate(ordered[index - 1]!.keyDates, now)) ? (
                <h3 className={styles.pastHeading}>지난 날짜의 일정</h3>
              ) : null}
              <article
                id={anchor}
                data-admission-session={item.slug}
                data-current-session={item.slug === currentSlug || undefined}
                data-past-sessions={past || undefined}
                className={styles.session}
                aria-labelledby={`${anchor}-title`}
              >
                <div className={styles.sessionWhen}>
                  <p>
                    {opportunityKindLabel(item.kind)}
                    {provisional ? " · 예정" : ""}
                  </p>
                  {item.keyDates.eventStartsAt ? (
                    <DateValue value={item.keyDates.eventStartsAt} />
                  ) : (
                    <strong>시작 일정 미확인</strong>
                  )}
                  <p className={styles.sessionEnd}>
                    종료{" "}
                    {item.keyDates.eventEndsAt ? (
                      <time dateTime={item.keyDates.eventEndsAt}>
                        {formatPublicDateTime(item.keyDates.eventEndsAt)}
                      </time>
                    ) : (
                      "시각 미확인"
                    )}
                  </p>
                  <StateBadge state={item.businessState} />
                </div>
                <div className={styles.sessionBody}>
                  <h3 id={`${anchor}-title`}>{item.title}</h3>
                  {provisional &&
                  admissionNoticeText(item.summary ?? null) !== commonNotice ? (
                    <AdmissionNotice
                      text={admissionNoticeText(item.summary ?? null)}
                    />
                  ) : null}
                  {item.targetAudience &&
                  item.targetAudience !== commonAudience ? (
                    <AdmissionAudience value={item.targetAudience} />
                  ) : null}
                  {item.keyDates.applicationOpensAt ||
                  item.keyDates.applicationClosesAt ? (
                    <dl className={styles.sessionRegistration}>
                      {(
                        [
                          ["예약·접수 시작", item.keyDates.applicationOpensAt],
                          ["예약·접수 마감", item.keyDates.applicationClosesAt],
                        ] as const
                      ).map(([label, value]) =>
                        value ? (
                          <div key={label}>
                            <dt>{label}</dt>
                            <dd>
                              <time dateTime={value}>
                                {formatPublicDateTime(value)}
                              </time>
                            </dd>
                          </div>
                        ) : null,
                      )}
                    </dl>
                  ) : null}
                  <AdmissionSections sections={sections} />
                  {action && action !== commonActionUrl ? (
                    <a
                      className={styles.action}
                      href={action}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      공식 예약·접수 페이지로 이동 ↗
                    </a>
                  ) : null}
                  {item.officialSources?.length ||
                  item.lastCollectedAt ||
                  item.lastVerifiedAt ? (
                    <details className={styles.sessionSources}>
                      <summary>이 일정의 출처와 확인일 보기</summary>
                      <AdmissionSources
                        sources={item.officialSources ?? []}
                        collectedAt={item.lastCollectedAt}
                        verifiedAt={item.lastVerifiedAt}
                      />
                    </details>
                  ) : null}
                </div>
              </article>
            </Fragment>
          );
        })}
      </div>
    </section>
  );
}

function knowledgeLabel(state: ReviewedAdmissionDTO["knowledgeState"]): string {
  if (state === "SCHEDULE_FOUND") return "공식 일정 확인";
  if (state === "GUIDANCE_FOUND") return "모집 안내 확인 · 일정 미확인";
  if (state === "NOT_ANNOUNCED") return "일정 미발표";
  return "확인한 안내에서 일정·지원 정보를 찾지 못했어요";
}

export function ReviewedAdmissions({
  admissions,
}: {
  admissions: ReviewedAdmissionDTO[];
}) {
  if (!admissions.length) return null;
  const groups = groupReviewedAdmissions(admissions);
  return (
    <section className="institution-detail__section" aria-label="입학정보">
      <h2>입학정보</h2>
      <p className={styles.helper}>
        지원 일정과 입학 조건을 함께 확인해 보세요.
      </p>
      <div className={styles.reviewedList}>
        {groups.map(({ guide: admission, sessions }, index) => {
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
                  <AdmissionAudience value={admission.targetAudience} />
                  <Link
                    className={styles.action}
                    href={`/opportunities/${admission.slug}`}
                  >
                    전체 모집·입학 안내 보기 →
                  </Link>
                </div>
              </div>
              <AdmissionSessions
                id={`reviewed-${index}-sessions`}
                currentSlug={admission.slug}
                commonSummary={admission.summary}
                commonAudience={admission.targetAudience}
                commonActionUrl={admission.actionUrl}
                items={sessions.map((session) => ({
                  ...session,
                  officialSources: session.officialSources ?? [
                    session.officialSource,
                  ],
                }))}
              />
              <div className={styles.reviewedGuide}>
                <AdmissionSections sections={sections} collapsible />
              </div>
              <AdmissionSources
                sources={
                  admission.officialSources ?? [admission.officialSource]
                }
                collectedAt={admission.lastCollectedAt}
                verifiedAt={admission.lastVerifiedAt}
                actionUrl={admission.actionUrl}
              />
            </article>
          );
        })}
      </div>
    </section>
  );
}
