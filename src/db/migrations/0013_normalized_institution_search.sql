CREATE EXTENSION IF NOT EXISTS "pg_trgm";
--> statement-breakpoint
CREATE INDEX "institutions_normalized_display_name_trgm_idx" ON "institutions" USING gin ((regexp_replace(lower(coalesce("display_name", '')), '[^0-9a-z가-힣]+', '', 'g')) gin_trgm_ops);
