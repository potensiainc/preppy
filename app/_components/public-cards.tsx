import Link from "next/link";
import { publicAdmissionText } from "@/src/modules/public/admission-copy";
import { publicProse } from "@/src/modules/public/ux-writing";

import { AnalyticsLink } from "@/app/_components/analytics-link";
import type { CapturedAnalyticsEvent } from "@/src/analytics/events";
import type {
  ArticleCardDTO,
  InstitutionCardDTO,
  OfficialSourceDTO,
  OpportunityCardDTO,
} from "@/src/modules/public/dto";

import {
  articleTypeLabel,
  categoryLabel,
  formatPublicDate,
  opportunityKindLabel,
  opportunityStateLabel,
  safeExternalHref,
} from "@/app/_lib/presentation";

export function StateBadge({
  state,
}: {
  state: OpportunityCardDTO["businessState"];
}) {
  return (
    <span className={`state-badge state-badge--${state.toLowerCase()}`}>
      {opportunityStateLabel(state)}
    </span>
  );
}

export function VerifiedAt({
  verifiedAt,
  label = "내용 확인",
}: {
  verifiedAt: string | null | undefined;
  label?: string;
}) {
  if (!verifiedAt) return null;

  return (
    <p className="verified-at">
      {label} <time dateTime={verifiedAt}>{formatPublicDate(verifiedAt)}</time>
    </p>
  );
}

export function TrustSource({ source }: { source: OfficialSourceDTO }) {
  const href = safeExternalHref(source.url);
  const name = publicAdmissionText(source.name) || "학교 공식 안내";

  return (
    <p className="trust-source">
      <span>공식 출처</span>
      {href ? (
        <a href={href} target="_blank" rel="noopener noreferrer">
          {name}
        </a>
      ) : (
        <span>{name}</span>
      )}
    </p>
  );
}

export function InstitutionCard({
  institution,
  analyticsEvent,
}: {
  institution: InstitutionCardDTO;
  analyticsEvent?: CapturedAnalyticsEvent;
}) {
  return (
    <article className="public-card institution-card">
      <div className="card-kicker">
        <span>{categoryLabel(institution.category)}</span>
        {institution.currentAdmissionsState ? (
          <StateBadge state={institution.currentAdmissionsState} />
        ) : null}
      </div>
      <h3>
        {analyticsEvent ? (
          <AnalyticsLink
            event={analyticsEvent}
            href={`/institutions/${institution.slug}`}
          >
            {institution.name}
          </AnalyticsLink>
        ) : (
          <Link href={`/institutions/${institution.slug}`}>
            {institution.name}
          </Link>
        )}
      </h3>
      {institution.region ? (
        <p className="card-region">{institution.region}</p>
      ) : null}
      {institution.currentOpportunity ? (
        <p className="card-opportunity">
          <Link href={`/opportunities/${institution.currentOpportunity.slug}`}>
            {institution.currentOpportunity.title}
          </Link>
        </p>
      ) : null}
      <VerifiedAt verifiedAt={institution.lastVerifiedAt} />
    </article>
  );
}

export function OpportunityCard({
  opportunity,
}: {
  opportunity: OpportunityCardDTO;
}) {
  return (
    <article className="public-card opportunity-card">
      <div className="card-kicker">
        <span>{opportunityKindLabel(opportunity.kind)}</span>
        <StateBadge state={opportunity.businessState} />
      </div>
      <p className="card-parent">
        <Link href={`/institutions/${opportunity.institution.slug}`}>
          {opportunity.institution.name}
        </Link>
      </p>
      <h3>
        <Link href={`/opportunities/${opportunity.slug}`}>
          {opportunity.title}
        </Link>
      </h3>
      {opportunity.keyDate ? (
        <p className="card-date">
          일정{" "}
          <time dateTime={opportunity.keyDate}>
            {formatPublicDate(opportunity.keyDate)}
          </time>
        </p>
      ) : null}
      <VerifiedAt verifiedAt={opportunity.lastVerifiedAt} />
    </article>
  );
}

export function ArticleCard({ article }: { article: ArticleCardDTO }) {
  return (
    <article className="public-card article-card">
      <div className="card-kicker">
        <span>{articleTypeLabel(article.articleType)}</span>
        <span>{categoryLabel(article.category)}</span>
      </div>
      <h3>
        <Link href={`/articles/${article.slug}`}>{article.title}</Link>
      </h3>
      {article.excerpt ? <p>{publicProse(article.excerpt)}</p> : null}
      {article.publishedAt ? (
        <p className="article-card__date">
          <time dateTime={article.publishedAt}>
            {formatPublicDate(article.publishedAt)}
          </time>
        </p>
      ) : null}
    </article>
  );
}
