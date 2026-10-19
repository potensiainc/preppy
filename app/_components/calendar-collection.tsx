import Link from "next/link";
import type { OpportunityCardDTO } from "@/src/modules/public/dto";
import {
  calendarCollection,
  calendarFilterHref,
  calendarInstitutionType,
  type CalendarFilter,
} from "@/app/_lib/calendar-institution-types";
import {
  formatPublicDateTime,
  opportunityKindLabel,
} from "@/app/_lib/presentation";
import { StateBadge, VerifiedAt } from "./public-cards";
import styles from "./calendar-collection.module.css";

export function CalendarCollection({
  items,
  filter,
}: {
  items: OpportunityCardDTO[];
  filter: CalendarFilter;
}) {
  const collection = calendarCollection(items, filter);
  const selected =
    filter === "ALL" ? "전체" : calendarInstitutionType(filter).label;
  return (
    <section
      className={styles.calendar}
      aria-label="기관 유형별 모집·입학 일정"
    >
      <div className={styles.filterHeading}>
        <h2>어떤 기관의 일정을 찾으세요?</h2>
        <p>기관 유형을 선택해 일정을 나눠 보세요.</p>
      </div>
      <nav className={styles.filters} aria-label="기관 유형 필터">
        <Link
          href={calendarFilterHref("ALL")}
          className={styles.filter}
          aria-current={filter === "ALL" ? "page" : undefined}
        >
          <span>전체</span>
          <span className={styles.count}>
            {collection.counts.ALL}
            <span className={styles.srOnly}>건</span>
          </span>
        </Link>
        {collection.types.map((type) => (
          <Link
            key={type.value}
            href={calendarFilterHref(type.value)}
            className={styles.filter}
            data-type={type.tone}
            aria-current={filter === type.value ? "page" : undefined}
          >
            <span className={styles.filterLabel}>
              <span aria-hidden="true">{type.marker}</span> {type.label}
            </span>
            <span className={styles.count}>
              {collection.counts[type.value]}
              <span className={styles.srOnly}>건</span>
            </span>
          </Link>
        ))}
      </nav>
      <p className={styles.scope}>
        홈에 소개된 {collection.counts.ALL}개 일정 안에서 나눠 보여드려요. 전체
        학교의 모든 일정은 아니에요.
      </p>
      <div className={styles.resultsHeading}>
        <h2>
          {selected} <span>{collection.items.length}건</span>
        </h2>
        <p>신청 기간과 행사 날짜는 상세 안내에서 각각 확인해 주세요.</p>
      </div>
      {collection.items.length === 0 ? (
        <div className={styles.empty}>
          <h3>
            이 목록에는{" "}
            {selected === "전체" ? "소개된 일정" : `${selected} 일정`}이 없어요
          </h3>
          <p>
            학교의 일정이 없다는 뜻은 아니에요. 다른 유형이나 학교·기관 안내를
            살펴보세요.
          </p>
          <div>
            <Link href={calendarFilterHref("ALL")}>전체 일정 보기</Link>
            <Link href="/institutions">학교·기관 살펴보기</Link>
          </div>
        </div>
      ) : (
        <ul className={styles.cards} aria-label={`${selected} 일정 목록`}>
          {collection.items.map((item) => {
            const type = calendarInstitutionType(item.institution.category);
            return (
              <li key={item.id}>
                <article className={styles.card} data-type={type.tone}>
                  <div className={styles.cardTop}>
                    <span className={styles.typeBadge}>
                      <span aria-hidden="true">{type.marker}</span> {type.label}
                      {type.note ? (
                        <span className={styles.typeNote}>({type.note})</span>
                      ) : null}
                    </span>
                    <span className={styles.kind}>
                      {opportunityKindLabel(item.kind)}
                    </span>
                  </div>
                  <p className={styles.date}>
                    <span>주요 일정</span>
                    {item.keyDate ? (
                      <time dateTime={item.keyDate}>
                        {formatPublicDateTime(item.keyDate)}
                      </time>
                    ) : (
                      <strong>날짜 미확인</strong>
                    )}
                  </p>
                  <p className={styles.school}>
                    <Link href={`/institutions/${item.institution.slug}`}>
                      {item.institution.name}
                    </Link>
                  </p>
                  <h3>
                    <Link href={`/opportunities/${item.slug}`}>
                      {item.title}
                    </Link>
                  </h3>
                  <div className={styles.cardBottom}>
                    <StateBadge state={item.businessState} />
                    <VerifiedAt verifiedAt={item.lastVerifiedAt} />
                  </div>
                </article>
              </li>
            );
          })}
        </ul>
      )}
      <Link className={styles.more} href="/curation/briefings">
        학교 설명회 목록도 살펴보기 <span aria-hidden="true">→</span>
      </Link>
    </section>
  );
}
