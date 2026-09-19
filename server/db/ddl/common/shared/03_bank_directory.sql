-- Canonical identities are global. Published attributes are immutable per release.
CREATE TABLE shared.bank_directory_release (
 id uuid PRIMARY KEY,
 version bigint NOT NULL UNIQUE CHECK (version > 0),
 published_at timestamptz NOT NULL,
 source_manifest jsonb NOT NULL CHECK (jsonb_typeof(source_manifest) = 'array'),
 payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
 content_hash text NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK (content_hash = encode(public.digest(payload::text, 'sha256'), 'hex'))
);
CREATE TABLE shared.bank_institution (
 id uuid PRIMARY KEY,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE shared.bank_branch (
 id uuid PRIMARY KEY,
 institution_id uuid NOT NULL REFERENCES shared.bank_institution(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (institution_id,id)
);
CREATE TABLE shared.bank_institution_version (
 release_id uuid NOT NULL REFERENCES shared.bank_directory_release(id),
 institution_id uuid NOT NULL REFERENCES shared.bank_institution(id),
 name text NOT NULL CHECK (btrim(name) <> ''),
 country_code character(2) NOT NULL REFERENCES shared.country(code),
 institution_type text NOT NULL CHECK (institution_type IN ('bank','credit_union','payment_institution','other')),
 status text NOT NULL CHECK (status IN ('active','retired')),
 effective_from date NOT NULL,
 effective_until date CHECK (effective_until > effective_from),
 PRIMARY KEY (release_id,institution_id)
);
CREATE TABLE shared.bank_branch_version (
 release_id uuid NOT NULL,
 branch_id uuid NOT NULL,
 institution_id uuid NOT NULL,
 name text NOT NULL CHECK (btrim(name) <> ''),
 country_code character(2) NOT NULL REFERENCES shared.country(code),
 location jsonb NOT NULL CHECK (jsonb_typeof(location)='object'),
 status text NOT NULL CHECK (status IN ('active','retired')),
 effective_from date NOT NULL,
 effective_until date CHECK (effective_until > effective_from),
 PRIMARY KEY (release_id,branch_id),
 UNIQUE (release_id,institution_id,branch_id),
 FOREIGN KEY (institution_id,branch_id) REFERENCES shared.bank_branch(institution_id,id),
 FOREIGN KEY (release_id,institution_id) REFERENCES shared.bank_institution_version(release_id,institution_id)
);
CREATE TABLE shared.bank_identifier (
 release_id uuid NOT NULL,
 id uuid NOT NULL,
 institution_id uuid NOT NULL,
 branch_id uuid,
 scheme text NOT NULL CHECK (scheme IN ('bic','national_bank_code','national_branch_code','clearing_member_id')),
 scheme_namespace text NOT NULL CHECK (btrim(scheme_namespace) <> ''),
 jurisdiction character(2) NOT NULL REFERENCES shared.country(code),
 value text NOT NULL CHECK (btrim(value)=value AND value <> ''),
 effective_from date NOT NULL,
 effective_until date CHECK (effective_until > effective_from),
 PRIMARY KEY (release_id,id),
 FOREIGN KEY (release_id,institution_id) REFERENCES shared.bank_institution_version(release_id,institution_id),
 FOREIGN KEY (release_id,institution_id,branch_id) REFERENCES shared.bank_branch_version(release_id,institution_id,branch_id),
 CHECK (scheme <> 'bic' OR (scheme_namespace='iso9362' AND value ~ '^[A-Z0-9]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$' AND substring(value,5,2)=jurisdiction)),
 EXCLUDE USING gist (release_id WITH =, scheme WITH =, scheme_namespace WITH =, jurisdiction WITH =, value WITH =, daterange(effective_from,effective_until,'[)') WITH &&)
);
CREATE TABLE shared.bank_directory_source_record (
 release_id uuid NOT NULL REFERENCES shared.bank_directory_release(id),
 source text NOT NULL CHECK (btrim(source) <> ''),
 source_record_id text NOT NULL CHECK (btrim(source_record_id) <> ''),
 institution_id uuid NOT NULL,
 branch_id uuid,
 PRIMARY KEY (release_id,source,source_record_id),
 FOREIGN KEY (release_id,institution_id) REFERENCES shared.bank_institution_version(release_id,institution_id),
 FOREIGN KEY (release_id,institution_id,branch_id) REFERENCES shared.bank_branch_version(release_id,institution_id,branch_id)
);
CREATE TABLE shared.bank_directory_activation (
 singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
 release_id uuid NOT NULL REFERENCES shared.bank_directory_release(id),
 activated_at timestamptz NOT NULL DEFAULT now()
);
