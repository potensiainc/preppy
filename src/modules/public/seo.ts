import "server-only";

import type { Metadata } from "next";
import { publicAdmissionText } from "./admission-copy";
import { publicProse } from "./ux-writing";
import { institutionSearchTitle } from "./social-labels";

import { sanitizeArticleHtmlV1 } from "@/src/modules/editorial/sanitizer.server";
import type {
  InstitutionDetailDTO,
  PublicArticleDTO,
  PublicOpportunityDTO,
} from "@/src/modules/public/dto";

export type ArticleJsonLd = Readonly<{
  "@context": "https://schema.org";
  "@type": "Article";
  headline: string;
  description: string;
  mainEntityOfPage: string;
  datePublished: string;
  dateModified: string;
  image?: string;
}>;

export type ArticleBreadcrumbJsonLd = Readonly<{
  "@context": "https://schema.org";
  "@type": "BreadcrumbList";
  itemListElement: readonly [
    Readonly<{
      "@type": "ListItem";
      position: 1;
      name: "홈";
      item: string;
    }>,
    Readonly<{
      "@type": "ListItem";
      position: 2;
      name: string;
      item: string;
    }>,
  ];
}>;

function origin(appBaseUrl: string): string {
  const url = new URL(appBaseUrl);
  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.username !== "" ||
    url.password !== "" ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    throw new TypeError("APP_BASE_URL must be a credential-free HTTP(S) URL");
  }
  return url.origin;
}

export function getSeoAppBaseUrl(
  environment: Record<string, string | undefined> = process.env,
): string {
  if (!environment.APP_BASE_URL) throw new Error("APP_BASE_URL is required");
  return origin(environment.APP_BASE_URL);
}

function canonical(appBaseUrl: string, path: string): string {
  return new URL(path, `${origin(appBaseUrl)}/`).toString();
}

function robots(
  indexability: "INDEX" | "NOINDEX" | "NOT_PUBLIC",
  follow = true,
) {
  return { index: indexability === "INDEX", follow };
}

function safeAbsoluteImage(value: string | null): string | null {
  if (value === null) return null;
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") &&
      url.username === "" &&
      url.password === ""
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

const SOCIAL_IMAGE_ALT = "PREPPY: 입학 준비에 필요한 정보, 한곳에서";

export function buildSocialMetadata(
  appBaseUrl: string,
  path: string,
  title: string,
  description: string | undefined,
): Pick<Metadata, "openGraph" | "twitter"> {
  return {
    openGraph: {
      title,
      description,
      url: canonical(appBaseUrl, path),
      siteName: "PREPPY",
      locale: "ko_KR",
      type: "website",
      images: [
        {
          url: canonical(appBaseUrl, "/preppy-social-og.png"),
          width: 1200,
          height: 630,
          alt: SOCIAL_IMAGE_ALT,
          type: "image/png",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [
        {
          url: canonical(appBaseUrl, "/preppy-social-x.png"),
          alt: SOCIAL_IMAGE_ALT,
        },
      ],
    },
  };
}

export function buildHomeMetadata(appBaseUrl: string): Metadata {
  const title = "PREPPY | 입학정보를 더 차분하게";
  const description =
    "학교와 기관의 공식 안내를 바탕으로 입학 일정과 지원 조건을 한곳에서 확인해 보세요.";
  return {
    title,
    description,
    alternates: { canonical: canonical(appBaseUrl, "/") },
    robots: { index: true, follow: true },
    ...buildSocialMetadata(appBaseUrl, "/", title, description),
  };
}

export function buildInstitutionListMetadata(
  appBaseUrl: string,
  hasFilters: boolean,
): Metadata {
  const title = "기관 찾기 | PREPPY";
  const description =
    "관심 있는 학교와 기관을 찾고, 공개된 입학 일정과 지원 조건을 확인해 보세요.";
  return {
    title,
    description,
    alternates: { canonical: canonical(appBaseUrl, "/institutions") },
    robots: { index: !hasFilters, follow: true },
    ...buildSocialMetadata(appBaseUrl, "/institutions", title, description),
  };
}

function withPageImage(
  social: Pick<Metadata, "openGraph" | "twitter">,
  imageUrl: string,
  alt: string,
): Pick<Metadata, "openGraph" | "twitter"> {
  return {
    openGraph: {
      ...social.openGraph,
      images: [
        { url: imageUrl, width: 1200, height: 630, alt, type: "image/png" },
      ],
    },
    twitter: { ...social.twitter, images: [{ url: imageUrl, alt }] },
  };
}

function institutionDescription(dto: InstitutionDetailDTO): string {
  const { name, category, district } = dto.institution;
  const place = district ? `${district} ` : "";
  switch (category) {
    case "PRIVATE_ELEMENTARY":
      return `${place}${name}의 2027학년도 모집 일정, 원서접수·추첨·등록 기간, 학비와 지원 자격을 공식 안내 기준으로 정리했어요.`;
    case "ENGLISH_KINDERGARTEN":
      return `${place}${name}의 원비, 입학설명회, 모집 일정과 운영 정보를 공식 안내 기준으로 확인해 보세요.`;
    case "INTERNATIONAL_SCHOOL":
      return `${name}의 입학 조건, 학비, 입학 일정과 커리큘럼을 공식 안내 기준으로 확인해 보세요.`;
  }
}

export function buildInstitutionMetadata(
  dto: InstitutionDetailDTO,
  appBaseUrl: string,
): Metadata {
  const searchTitle = institutionSearchTitle(dto.institution);
  const title = `${searchTitle} | PREPPY`;
  const description = institutionDescription(dto);
  const path = `/institutions/${dto.institution.slug}`;
  const revision = encodeURIComponent(dto.institution.lastVerifiedAt ?? "0");
  return {
    title,
    description,
    alternates: {
      canonical: canonical(appBaseUrl, path),
    },
    robots: robots(dto.indexability),
    ...withPageImage(
      buildSocialMetadata(appBaseUrl, path, searchTitle, description),
      canonical(appBaseUrl, `${path}/og.png?v=${revision}`),
      `${searchTitle} | PREPPY`,
    ),
  };
}

export type InstitutionJsonLd = Readonly<Record<string, unknown>> & {
  "@context": "https://schema.org";
};

function institutionSchemaType(
  category: InstitutionDetailDTO["institution"]["category"],
): string {
  switch (category) {
    case "PRIVATE_ELEMENTARY":
      return "ElementarySchool";
    case "INTERNATIONAL_SCHOOL":
      return "School";
    case "ENGLISH_KINDERGARTEN":
      return "EducationalOrganization";
  }
}

function regionName(region: string | null): string | undefined {
  if (!region) return undefined;
  if (region === "KR-11") return "서울특별시";
  if (region === "KR-41") return "경기도";
  if (region === "KR-28") return "인천광역시";
  return /^[가-힣]+$/u.test(region) ? region : undefined;
}

/** Only for indexable pages; facts come from the same verified DTO the page renders. */
export function buildInstitutionJsonLd(
  dto: InstitutionDetailDTO,
  appBaseUrl: string,
): readonly InstitutionJsonLd[] {
  if (dto.indexability !== "INDEX") return [];
  const { institution } = dto;
  const url = canonical(appBaseUrl, `/institutions/${institution.slug}`);
  const officialUrl = dto.officialSources
    .map((source) => safeAbsoluteImage(source.url))
    .find((value): value is string => value !== null);
  const address =
    institution.address || institution.district || institution.region
      ? {
          "@type": "PostalAddress",
          addressCountry: "KR",
          ...(regionName(institution.region)
            ? { addressRegion: regionName(institution.region) }
            : {}),
          ...(institution.district
            ? { addressLocality: institution.district }
            : {}),
          ...(institution.address
            ? { streetAddress: institution.address }
            : {}),
        }
      : undefined;
  const organization: InstitutionJsonLd = {
    "@context": "https://schema.org",
    "@type": institutionSchemaType(institution.category),
    name: institution.name,
    url,
    description: institutionDescription(dto),
    ...(officialUrl ? { sameAs: [officialUrl] } : {}),
    ...(address ? { address } : {}),
  };
  const breadcrumb: InstitutionJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "홈",
        item: canonical(appBaseUrl, "/"),
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "학교·기관",
        item: canonical(appBaseUrl, "/institutions"),
      },
      { "@type": "ListItem", position: 3, name: institution.name, item: url },
    ],
  };
  return [organization, breadcrumb];
}

export function buildOpportunityMetadata(
  dto: PublicOpportunityDTO,
  appBaseUrl: string,
): Metadata {
  const title = `${dto.title} | PREPPY`;
  const description =
    publicProse(publicAdmissionText(dto.summary)) ??
    `${dto.institution.name}의 입학 안내를 확인해 보세요.`;
  const path = `/opportunities/${dto.slug}`;
  const revision = encodeURIComponent(dto.lastVerifiedAt ?? "0");
  return {
    title,
    description,
    alternates: {
      canonical: canonical(appBaseUrl, path),
    },
    robots: robots(dto.indexability),
    ...withPageImage(
      buildSocialMetadata(appBaseUrl, path, title, description),
      canonical(appBaseUrl, `${path}/og.png?v=${revision}`),
      title,
    ),
  };
}

export function buildArticleMetadata(
  dto: PublicArticleDTO,
  appBaseUrl: string,
): Metadata {
  const title = dto.seoTitle ?? dto.title;
  const description =
    publicProse(dto.seoDescription ?? dto.excerpt) ?? undefined;
  const path = `/articles/${dto.slug}`;
  const social = buildSocialMetadata(appBaseUrl, path, dto.title, description);
  const imageRevision = encodeURIComponent(dto.updatedAt);
  return {
    title,
    description,
    alternates: {
      canonical: canonical(appBaseUrl, path),
    },
    robots: robots(dto.indexability, dto.robotsFollow),
    ...social,
    openGraph: {
      ...social.openGraph,
      type: "article",
      images: [
        {
          url: canonical(appBaseUrl, `${path}/og.png?v=${imageRevision}`),
          width: 1200,
          height: 630,
          alt: `${dto.title} | PREPPY 입학 준비 아티클`,
          type: "image/png",
        },
      ],
    },
    twitter: {
      ...social.twitter,
      images: [
        {
          url: canonical(appBaseUrl, `${path}/x.png?v=${imageRevision}`),
          alt: `${dto.title} | PREPPY 입학 준비 아티클`,
        },
      ],
    },
  };
}

function articleStructuredDataEligibility(
  dto: PublicArticleDTO,
  appBaseUrl: string,
): Readonly<{ description: string; canonical: string }> | null {
  const description = dto.seoDescription ?? dto.excerpt;
  if (
    dto.indexability !== "INDEX" ||
    dto.publishedAt === null ||
    description === null ||
    description.trim() === ""
  ) {
    return null;
  }
  const sanitized = sanitizeArticleHtmlV1(dto.sanitizedContentHtml, {
    appBaseUrl,
  });
  if (sanitized.nonWhitespaceCodePoints < 40) return null;
  let canonicalUrl: string;
  try {
    canonicalUrl = canonical(appBaseUrl, `/articles/${dto.slug}`);
  } catch {
    return null;
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(dto.slug)) return null;
  return { description, canonical: canonicalUrl };
}

export function buildArticleJsonLd(
  dto: PublicArticleDTO,
  appBaseUrl: string,
): ArticleJsonLd | null {
  const eligible = articleStructuredDataEligibility(dto, appBaseUrl);
  if (!eligible) return null;
  const image = safeAbsoluteImage(dto.featuredImageUrl);
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: dto.title,
    description: publicProse(eligible.description),
    mainEntityOfPage: eligible.canonical,
    datePublished: dto.publishedAt!,
    dateModified: dto.updatedAt,
    ...(image === null ? {} : { image }),
  };
}

export function buildArticleBreadcrumbJsonLd(
  dto: PublicArticleDTO,
  appBaseUrl: string,
): ArticleBreadcrumbJsonLd | null {
  const eligible = articleStructuredDataEligibility(dto, appBaseUrl);
  if (!eligible) return null;
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "홈",
        item: canonical(appBaseUrl, "/"),
      },
      {
        "@type": "ListItem",
        position: 2,
        name: dto.title,
        item: eligible.canonical,
      },
    ],
  };
}

export function serializeJsonLd(
  value: ArticleJsonLd | ArticleBreadcrumbJsonLd | InstitutionJsonLd,
): string {
  return JSON.stringify(value).replace(/</gu, "\\u003c");
}
