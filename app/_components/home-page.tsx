import Link from "next/link";
import { OpportunityCard } from "./public-cards";
import { EmptyState, SectionHeader } from "./ui-primitives";
import { AnalyticsLink } from "./analytics-link";
import type { HomePageDTO, OpportunityCardDTO } from "@/src/modules/public/dto";
import { ArticleCard, StateBadge, VerifiedAt } from "./public-cards";
import {
  formatPublicDate,
  opportunityKindLabel,
} from "@/app/_lib/presentation";
import styles from "./curation.module.css";
export function OpportunitySection({
  opportunities,
  standalone = false,
}: {
  opportunities: HomePageDTO["currentOpportunities"];
  standalone?: boolean;
}) {
  return (
    <section id="current-opportunities" aria-label="현재 모집·입학정보">
      <SectionHeader
        headingLevel={standalone ? 1 : 2}
        eyebrow="모집·입학"
        title="현재 모집·입학정보"
        description="공식 안내에서 확인한 모집과 입학 일정을 모았어요."
        action={
          <Link
            className="text-link"
            href={standalone ? "/institutions" : "/opportunities"}
          >
            {standalone ? "기관별 입학정보 찾기" : "입학정보 보기"}
          </Link>
        }
      />
      {opportunities.length > 0 ? (
        <div className="home-card-grid">
          {opportunities.map((opportunity) => (
            <OpportunityCard key={opportunity.id} opportunity={opportunity} />
          ))}
        </div>
      ) : (
        <EmptyState
          title="PREPPY에 공개된 모집·입학정보가 없어요"
          description="기관별 공식 안내에서 모집 일정을 확인해 주세요."
        />
      )}
    </section>
  );
}


export function ArticleSection({
  articles,
  standalone = false,
}: {
  articles: HomePageDTO["latestArticles"];
  standalone?: boolean;
}) {
  return (
    <section id="articles" aria-label="입학 준비 아티클">
      <SectionHeader
        eyebrow="입학 준비"
        headingLevel={standalone ? 1 : 2}
        title="입학 준비 아티클"
        description="기관을 비교하고 입학을 준비할 때 참고할 내용을 정리했어요."
        action={
          standalone ? undefined : (
            <Link className="text-link" href="/articles">
              아티클 전체 보기
            </Link>
          )
        }
      />
      {articles.length > 0 ? (
        <div className="home-card-grid">
          {articles.map((article) => (
            <ArticleCard key={article.id} article={article} />
          ))}
        </div>
      ) : (
        <EmptyState
          title="PREPPY에 공개된 아티클이 없어요"
          description="기관 찾기에서 기관별 입학정보를 살펴볼 수 있어요."
        />
      )}
    </section>
  );
}

export function CampusIllustration() {
  return (
    <div className={styles.campus} aria-hidden="true">
      <span className={styles.sun} />
      <span className={styles.hill} />
      <span className={styles.hall}>
        <i />
        <i />
        <i />
        <i />
        <i />
      </span>
      <span className={styles.tree} />
      <span className={styles.treeSmall} />
    </div>
  );
}
export function ScheduleRow({
  opportunity,
}: {
  opportunity: OpportunityCardDTO;
}) {
  const date = opportunity.keyDate ? new Date(opportunity.keyDate) : null;
  const parts =
    date && !Number.isNaN(date.getTime())
      ? new Intl.DateTimeFormat("ko-KR", {
          timeZone: "Asia/Seoul",
          year: "numeric",
          month: "numeric",
          day: "numeric",
        }).formatToParts(date)
      : [];
  const part = (type: string) =>
    parts.find((item) => item.type === type)?.value;
  return (
    <article className={styles.scheduleRow}>
      <div className={styles.scheduleDate} aria-hidden="true">
        {parts.length ? (
          <>
            {part("month")}월<strong>{part("day")}</strong>
          </>
        ) : (
          <span>
            날짜
            <br />
            미확인
          </span>
        )}
      </div>
      <div className={styles.scheduleContent}>
        <p className={styles.scheduleType}>{opportunity.institution.name}</p>
        <p className={styles.scheduleType}>
          {opportunityKindLabel(opportunity.kind)}
        </p>
        <h3>
          <Link href={`/opportunities/${opportunity.slug}`}>
            {opportunity.title}
          </Link>
        </h3>
        {opportunity.keyDate && (
          <p className={styles.date}>
            일정{" "}
            <time dateTime={opportunity.keyDate}>
              {formatPublicDate(opportunity.keyDate)}
            </time>
          </p>
        )}
        <VerifiedAt verifiedAt={opportunity.lastVerifiedAt} />
      </div>
      <StateBadge state={opportunity.businessState} />
    </article>
  );
}
export function HomePageView({ data }: { data: HomePageDTO }) {
  return (
    <div className={styles.home}>
      <div className={styles.welcome}>
        <div>
          <p className={styles.kicker}>PREPPY CURATION</p>
          <h1 id="home-title">지금, 알아두면 좋은 입학정보</h1>
        </div>
        <span className={styles.edition} aria-hidden="true">
          {new Intl.DateTimeFormat("en", {
            month: "2-digit",
            timeZone: "Asia/Seoul",
          }).format(new Date())}
        </span>
      </div>
      <div className={styles.homeGrid}>
        <div>
          <AnalyticsLink
            className={styles.hero}
            event={{
              name: "hero_primary_cta_click",
              properties: { cta: "INSTITUTIONS" },
            }}
            href="/institutions?category=INTERNATIONAL_SCHOOL"
          >
            <div className={styles.heroCopy}>
              <span className={styles.heroTag}>국제학교 · 입학 안내</span>
              <h2>
                우리 아이에게 맞는
                <br />
                국제학교 알아보기
              </h2>
              <p>학교별 입학 안내와 지원 조건을 살펴보세요.</p>
            </div>
            <CampusIllustration />
            <span className={styles.heroAction}>
              국제학교 살펴보기 <span aria-hidden="true">↗</span>
            </span>
          </AnalyticsLink>
          <div className={styles.storyGrid}>
            <Link className={styles.story} href="/curation/briefings">
              <span>학교를 직접 알아보는 시간</span>
              <h2>
                학교 설명회
                <br />
                일정과 참석 안내
              </h2>
              <p>
                설명회 살펴보기 <b aria-hidden="true">↗</b>
              </p>
            </Link>
            <Link
              className={`${styles.story} ${styles.storyGreen}`}
              href="/curation/guides"
            >
              <span>입학을 준비한다면</span>
              <h2>
                알아두면 좋은
                <br />
                입학 준비 아티클
              </h2>
              <p>
                아티클 살펴보기 <b aria-hidden="true">↗</b>
              </p>
            </Link>
          </div>
        </div>
        <aside
          className={styles.agenda}
          id="current-opportunities"
          aria-labelledby="agenda-title"
        >
          <div className={styles.sectionHeading}>
            <h2 id="agenda-title">모집·입학 일정</h2>
            <Link href="/curation/calendar">모음 보기 →</Link>
          </div>
          {data.currentOpportunities.length ? (
            data.currentOpportunities
              .slice(0, 3)
              .map((item) => <ScheduleRow key={item.id} opportunity={item} />)
          ) : (
            <p className={styles.empty}>
              현재 PREPPY에 공개된 모집·입학 일정이 없어요. 학교별 공식 안내를
              확인해 주세요.
            </p>
          )}
          <p className={styles.trust}>
            학교별 상세 안내에서 공식 출처와 내용 확인일을 살펴볼 수 있어요.
          </p>
        </aside>
      </div>
      <nav className={styles.categoryBar} aria-label="유형별 기관 찾기">
        <Link href="/institutions">학교·기관 전체 보기</Link>
        <Link href="/institutions?category=PRIVATE_ELEMENTARY">
          사립초등학교 ↗
        </Link>
        <Link href="/institutions?category=INTERNATIONAL_SCHOOL">
          국제학교 ↗
        </Link>
        <Link href="/institutions?category=ENGLISH_KINDERGARTEN">
          영어유치원 ↗
        </Link>
        <Link href="/commute">통학지도 ↗</Link>
      </nav>
      {data.latestArticles.length > 0 && (
        <section id="articles" className={styles.articles}>
          <div className={styles.sectionHeading}>
            <h2>입학 준비, 함께 읽어요</h2>
            <Link href="/curation/guides">모음 보기 →</Link>
          </div>
          <div className={styles.articleGrid}>
            {data.latestArticles.slice(0, 3).map((article) => (
              <ArticleCard key={article.id} article={article} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
