CREATE UNIQUE INDEX "event_versions_one_successor" ON "admission_event_versions" USING btree ("supersedes_version_id") WHERE "admission_event_versions"."supersedes_version_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "fact_versions_one_successor" ON "admission_fact_versions" USING btree ("supersedes_version_id") WHERE "admission_fact_versions"."supersedes_version_id" is not null;--> statement-breakpoint
CREATE FUNCTION "validate_event_version_lineage"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  predecessor_version_no integer;
BEGIN
  IF TG_OP = 'UPDATE' AND (
    NEW.id IS DISTINCT FROM OLD.id
    OR NEW.admission_event_id IS DISTINCT FROM OLD.admission_event_id
    OR NEW.version_no IS DISTINCT FROM OLD.version_no
    OR NEW.supersedes_version_id IS DISTINCT FROM OLD.supersedes_version_id
  ) THEN
    RAISE EXCEPTION 'event version identity and lineage are immutable'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.supersedes_version_id IS NOT NULL THEN
    SELECT version_no
    INTO predecessor_version_no
    FROM admission_event_versions
    WHERE id = NEW.supersedes_version_id
      AND admission_event_id = NEW.admission_event_id
    FOR SHARE;

    IF FOUND AND NEW.version_no <= predecessor_version_no THEN
      RAISE EXCEPTION 'event version number must increase along its lineage'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "validate_event_version_lineage_before_write"
BEFORE INSERT OR UPDATE
ON "admission_event_versions"
FOR EACH ROW
EXECUTE FUNCTION "validate_event_version_lineage"();--> statement-breakpoint
CREATE FUNCTION "validate_fact_version_lineage"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  predecessor_version_no integer;
BEGIN
  IF TG_OP = 'UPDATE' AND (
    NEW.id IS DISTINCT FROM OLD.id
    OR NEW.admission_fact_id IS DISTINCT FROM OLD.admission_fact_id
    OR NEW.version_no IS DISTINCT FROM OLD.version_no
    OR NEW.supersedes_version_id IS DISTINCT FROM OLD.supersedes_version_id
  ) THEN
    RAISE EXCEPTION 'fact version identity and lineage are immutable'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.supersedes_version_id IS NOT NULL THEN
    SELECT version_no
    INTO predecessor_version_no
    FROM admission_fact_versions
    WHERE id = NEW.supersedes_version_id
      AND admission_fact_id = NEW.admission_fact_id
    FOR SHARE;

    IF FOUND AND NEW.version_no <= predecessor_version_no THEN
      RAISE EXCEPTION 'fact version number must increase along its lineage'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "validate_fact_version_lineage_before_write"
BEFORE INSERT OR UPDATE
ON "admission_fact_versions"
FOR EACH ROW
EXECUTE FUNCTION "validate_fact_version_lineage"();
