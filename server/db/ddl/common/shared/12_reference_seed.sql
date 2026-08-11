-- seed-contract-version: 1
-- seed-pack: common.shared.global-reference
-- seed-pack-version: 2.0.0
-- seed-dataset: shared.global-reference
-- seed-data-class: production_reference
-- seed-provenance: {"source":"ISO/IETF/IANA/UNECE/GS1/WCO/UNSD/US-Census","publisher":"multiple authorities","source_version":"reference-data/provenance.v1.json","retrieved_at":"2026-08-03","license":"see upstream terms"}
-- seed-plane: common
-- seed-tenant-scope: none
-- seed-natural-key: shared.classification_scheme(code)
-- seed-cross-file-ids: false
-- seed-id-strategy: database-generated
-- seed-expected-row-count: query:shared.validate_reference_seed
-- seed-assertions: expected-count,orphan,uniqueness,semantic
-- seed-demo-data: false
-- seed-assertion: expected-count
-- seed-assertion: orphan
-- seed-assertion: uniqueness
-- seed-assertion: semantic
-- Reviewed SQL reference seed entrypoint.
-- \ir paths are resolved relative to this file by psql. The foundation runner
-- expands them on the host before streaming SQL into Docker.

SET app.reference_seed_mode = 'on';

DO $$
BEGIN
    IF current_setting('app.database_plane', true) NOT IN ('studio', 'neon', 'mesh') THEN
        RAISE EXCEPTION 'common reference seed requires app.database_plane=studio|neon|mesh';
    END IF;
END $$;

INSERT INTO shared.classification_scheme (
    code, scheme_kind, name, publisher, edition, reference_uri, metadata, created_by
) VALUES
    (
        'unspsc', 'commodity',
        'United Nations Standard Products and Services Code',
        'GS1 US', '19.0501', 'https://www.unspsc.org/',
        '{"extracted_on":"2026-08-03","standard":"UNSPSC"}'::jsonb,
        '00000000-0000-0000-0000-000000000000'
    ),
    (
        'hs', 'commodity',
        'Harmonized Commodity Description and Coding System',
        'World Customs Organization', '2022', 'https://www.wcoomd.org/en/topics/nomenclature/instrument-and-tools/hs-nomenclature-2022-edition.aspx',
        '{"extracted_on":"2026-08-03","standard":"HS"}'::jsonb,
        '00000000-0000-0000-0000-000000000000'
    ),
    (
        'isic', 'industry',
        'International Standard Industrial Classification',
        'United Nations Statistics Division', 'Revision 4', 'https://unstats.un.org/unsd/classifications/Econ/isic',
        '{"extracted_on":"2026-08-03","standard":"ISIC"}'::jsonb,
        '00000000-0000-0000-0000-000000000000'
    ),
    (
        'naics', 'industry',
        'North American Industry Classification System',
        'United States Census Bureau', '2022', 'https://www.census.gov/naics/',
        '{"extracted_on":"2026-08-03","standard":"NAICS"}'::jsonb,
        '00000000-0000-0000-0000-000000000000'
    )
ON CONFLICT (code) DO UPDATE
SET name = excluded.name,
    publisher = excluded.publisher,
    edition = excluded.edition,
    reference_uri = excluded.reference_uri,
    metadata = excluded.metadata,
    status = 'active',
    updated_at = now(),
    updated_by = excluded.created_by
WHERE (shared.classification_scheme.name,
       shared.classification_scheme.publisher,
       shared.classification_scheme.edition,
       shared.classification_scheme.reference_uri,
       shared.classification_scheme.metadata,
       shared.classification_scheme.status)
  IS DISTINCT FROM
      (excluded.name, excluded.publisher, excluded.edition, excluded.reference_uri,
       excluded.metadata, 'active'::shared.ref_status_d);

\ir reference-data/001_country.sql
\ir reference-data/002_state_region.sql
\ir reference-data/003_currency.sql
\ir reference-data/004_language.sql
\ir reference-data/005_locale.sql
\ir reference-data/006_timezone.sql
\ir reference-data/007_uom.sql
\ir reference-data/008a_commodity_code_unspsc.sql
\ir reference-data/008b_commodity_code_hs.sql
\ir reference-data/008c_commodity_crosswalk.sql
\ir reference-data/008d_commodity_code_keywords.sql
\ir reference-data/009b_industry_code_isic_groups_classes.sql
\ir reference-data/009c_industry_code_naics_subsectors.sql
\ir reference-data/009d_industry_crosswalk.sql
\ir reference-data/009e_industry_code_keywords.sql

SELECT shared.validate_reference_seed();
SET CONSTRAINTS ALL IMMEDIATE;

RESET app.reference_seed_mode;
