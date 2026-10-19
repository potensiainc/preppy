
CREATE TABLE english_campus_identities (
 namespace text NOT NULL, external_id text NOT NULL,
 institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
 PRIMARY KEY(namespace, external_id)
);
--> statement-breakpoint
CREATE TABLE english_campus_aliases (
 institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
 name text NOT NULL, PRIMARY KEY(institution_id, name)
);
--> statement-breakpoint
CREATE TABLE english_session_identities (
 opportunity_id uuid PRIMARY KEY REFERENCES opportunities(id) ON DELETE RESTRICT,
 fingerprint text NOT NULL
);
