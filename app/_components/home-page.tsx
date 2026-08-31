import Link from "next/link";

import { AnalyticsLink } from "@/app/_components/analytics-link";
import type { HomePageDTO } from "@/src/modules/public/dto";

import {
  ArticleCard,
  InstitutionCard,
  OpportunityCard,
} from "@/app/_components/public-cards";
import {
  EmptyState,
  PageContainer,
  SectionHeader,
} from "@/app/_components/ui-primitives";
import { homeCategoryLabel } from "@/app/_lib/presentation";

function OpportunitySection({
  opportunities,
}: {
  opportunities: HomePageDTO["currentOpportunities"];
}) {
  return (
    <section id="current-opportunities" aria-label="현재 모집·입학정보">
      <SectionHeader
        eyebrow="모집·입학"
        title="현재 모집·입학정보"
        description="공식 안내에서 확인한 모집과 입학 일정을 모았어요."
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

function InstitutionSection({
  institutions,
}: {
  institutions: HomePageDTO["featuredInstitutions"];
}) {
  return (
    <section aria-label="살펴볼 기관">
      <SectionHeader
        eyebrow="기관"
        title="살펴볼 기관"
        description="각 기관의 기본 정보와 확인된 입학정보를 살펴볼 수 있어요."
        action={
          <Link className="text-link" href="/institutions">
            기관 전체 보기
          </Link>
        }
      />
      {institutions.length > 0 ? (
        <div className="home-card-grid">
          {institutions.map((institution) => (
            <InstitutionCard key={institution.id} institution={institution} />
          ))}
        </div>
      ) : (
        <EmptyState
          title="PREPPY에 공개된 기관 정보가 없어요"
          description="찾는 기관의 공식 홈페이지에서 정보를 확인해 주세요."
        />
      )}
    </section>
  );
}

function ArticleSection({
  articles,
}: {
  articles: HomePageDTO["latestArticles"];
}) {
  return (
    <section id="articles" aria-label="입학 준비 아티클">
      <SectionHeader
        eyebrow="입학 준비"
        title="입학 준비 아티클"
        description="기관을 비교하고 입학을 준비할 때 참고할 내용을 정리했어요."
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

export function HomePageView({ data }: { data: HomePageDTO }) {
  return (
    <div className="home-page">
      <section className="home-hero" aria-labelledby="home-title">
        <PageContainer>
          <p className="eyebrow">PREPPY 입학정보 가이드</p>
          <h1 id="home-title">입학 준비에 필요한 정보, 한곳에서</h1>
          <p className="home-hero__copy">
            영어유치원·사립초등학교·국제학교의 입학정보를 공식 출처와 함께
            살펴볼 수 있어요. 관심기관을 등록하면 내 프레피에서 모아 볼 수
            있어요.
          </p>
          <div className="home-hero__actions">
            <AnalyticsLink
              className="button-link button-link--primary"
              event={{
                name: "hero_primary_cta_click",
                properties: { cta: "INSTITUTIONS" },
              }}
              href="/institutions"
            >
              기관 둘러보기
            </AnalyticsLink>
            <AnalyticsLink
              className="button-link button-link--secondary"
              event={{
                name: "hero_secondary_cta_click",
                properties: { cta: "CURRENT_OPPORTUNITIES" },
              }}
              href="/#current-opportunities"
            >
              현재 모집·입학정보 보기
            </AnalyticsLink>
          </div>
        </PageContainer>
      </section>

      <PageContainer>
        <section className="home-categories" aria-label="유형별 기관 찾기">
          <SectionHeader
            eyebrow="탐색"
            title="유형별 기관 찾기"
            description="관심 있는 기관 유형을 선택해 주세요."
          />
          <ul className="category-list" aria-label="기관 유형">
            {data.categories.map((category) => (
              <li key={category.category}>
                <Link href={category.href}>
                  <span>{homeCategoryLabel(category.category)}</span>
                  <span aria-hidden="true">→</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <OpportunitySection opportunities={data.currentOpportunities} />
        <InstitutionSection institutions={data.featuredInstitutions} />
        <ArticleSection articles={data.latestArticles} />

        <section
          className="monitoring-value"
          aria-labelledby="monitoring-title"
        >
          <p className="eyebrow">관심기관</p>
          <h2 id="monitoring-title">관심기관의 입학정보 모아보기</h2>
          <p>
            관심기관을 등록하면 내 프레피에서 확인된 입학정보와 최근 변경 내용을
            함께 볼 수 있어요.
          </p>
          <Link
            className="button-link button-link--primary"
            href="/institutions"
          >
            관심기관 찾기
          </Link>
        </section>
      </PageContainer>
    </div>
  );
}
