import "server-only";

import type { PublicArticleDTO } from "./dto";

/**
 * Server-only storage projection for opaque Article HTML. This is not
 * sanitized content and must not cross a client boundary or be rendered until
 * a future sanitizer/publish guarantee explicitly makes it safe.
 */
export type UnsafeStoredArticleDetailDTO = PublicArticleDTO & {
  unsafeStoredContentHtml: string;
};
