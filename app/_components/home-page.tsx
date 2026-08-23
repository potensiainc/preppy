import Link from "next/link";

import type { HomePageDTO } from "@/src/modules/public/dto";

import {
  ArticleCard,
  InstitutionCard,
  OpportunityCard,
} from "@/app/_components/public-cards";
import { FollowCtaPrototype } from "@/app/_components/follow-cta-prototype";
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
        eyebrow="Admissions"
        title="현재 모집·입학정보"
        description="공개된 공식 정보를 바탕으로 지금 확인할 수 있는 모집과 입학 일정을 모았습니다."
      />
      {opportunities.length > 0 ? (
        <div className="home-card-grid">
          {opportunities.map((opportunity) => (
            <OpportunityCard key={opportunity.id} opportunity={opportunity} />
          ))}
        </div>
      ) : (
        <EmptyState
          title="현재 공개된 모집·입학정보가 없습니다."
          description="새로운 공식 정보가 확인되면 이곳에 차분히 정리해 드립니다."
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
        eyebrow="Institutions"
        title="살펴볼 기관"
        description="각 기관의 공개 프로필과 확인 가능한 입학정보를 살펴보세요."
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
          title="현재 살펴볼 공개 기관이 없습니다."
          description="공개된 기관 정보가 준비되면 이곳에서 확인할 수 있습니다."
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
        eyebrow="Journal"
        title="입학 준비 아티클"
        description="기관을 비교하고 입학을 준비할 때 참고할 수 있는 내용을 정리합니다."
      />
      {articles.length > 0 ? (
        <div className="home-card-grid">
          {articles.map((article) => (
            <ArticleCard key={article.id} article={article} />
          ))}
        </div>
      ) : (
        <EmptyState
          title="현재 공개된 아티클이 없습니다."
          description="입학 준비에 도움이 되는 내용을 공개할 때 이곳에 안내합니다."
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
          <p className="eyebrow">PREPPY ADMISSIONS GUIDE</p>
          <h1 id="home-title">입학정보, 아직도 일일이 찾아보고 계신가요?</h1>
          <p className="home-hero__copy">
            영유·사립초·국제학교 정보를 한곳에서 확인하고, 관심기관의 새로운
            모집·입학정보가 생기면 프레피가 알려드려요.
          </p>
          <div className="home-hero__actions">
            <Link
              className="button-link button-link--primary"
              href="/institutions"
            >
              기관 둘러보기
            </Link>
            <Link
              className="button-link button-link--secondary"
              href="/#current-opportunities"
            >
              현재 모집·입학정보 보기
            </Link>
          </div>
        </PageContainer>
      </section>

      <PageContainer>
        <section
          className="home-categories"
          aria-label="우리 아이에게 맞는 기관 찾기"
        >
          <SectionHeader
            eyebrow="Discover"
            title="우리 아이에게 맞는 기관 찾기"
            description="관심 있는 교육 단계부터 천천히 살펴보세요."
          />
          <ul className="category-list" aria-label="기관 유형">
            {data.categories.map((category) => (
              <li key={category.category}>
                <Link href={category.href}>
                  {homeCategoryLabel(category.category)}
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
          <p className="eyebrow">PREPPY 알림</p>
          <h2 id="monitoring-title">관심기관의 변화도 놓치지 않도록</h2>
          <p>
            관심기관의 새로운 모집·입학정보를 놓치지 않도록 알려드릴 준비를 하고
            있습니다.
          </p>
          <FollowCtaPrototype />
        </section>
      </PageContainer>
    </div>
  );
}
