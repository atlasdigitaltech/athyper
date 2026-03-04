/* ============================================================================
   Athyper — REF Schema
   Reference Data: Countries, Regions, Currencies, Languages, Locales,
   Timezones, Units of Measure, Commodity Codes, Industry Codes, Labels

   PostgreSQL 16+
   ============================================================================ */

-- ============================================================================
-- REF: Country (ISO 3166-1)
-- ============================================================================
create table if not exists ref.country (
  code2        char(2) primary key,
  code3        char(3) unique,
  numeric3     char(3) unique,
  name         text not null,
  official_name text,

  region       text,
  subregion    text,

  status       text not null default 'active',
  metadata     jsonb not null default '{}'::jsonb,

  created_at   timestamptz not null default now(),
  created_by   text not null default 'seed',
  updated_at   timestamptz,
  updated_by   text,

  constraint country_status_chk check (status in ('active','deprecated'))
);

comment on table ref.country is 'ISO 3166-1 country codes (alpha-2 PK).';

-- ============================================================================
-- REF: State/Region Codes (ISO 3166-2)
-- ============================================================================
create table if not exists ref.state_region (
  code          text primary key,
  country_code2 char(2) not null
               references ref.country(code2)
               on delete cascade,
  name          text not null,
  category      text,
  parent_code   text references ref.state_region(code),
  status        text not null default 'active',
  metadata      jsonb not null default '{}'::jsonb,

  created_at    timestamptz not null default now(),
  created_by    text not null default 'seed',
  updated_at    timestamptz,
  updated_by    text,

  constraint state_region_status_chk check (status in ('active','deprecated'))
);

comment on table ref.state_region is 'ISO 3166-2 subdivision codes.';
create index if not exists idx_state_region_country on ref.state_region(country_code2);
create index if not exists idx_state_region_parent on ref.state_region(parent_code);
create index if not exists idx_state_region_category on ref.state_region(category);

-- ============================================================================
-- REF: Currency (ISO 4217)
-- ============================================================================
create table if not exists ref.currency (
  code         char(3) primary key,
  name         text not null,
  symbol       text,
  minor_units  int,
  numeric3     char(3) unique,
  status       text not null default 'active',
  metadata     jsonb not null default '{}'::jsonb,

  created_at   timestamptz not null default now(),
  created_by   text not null default 'seed',
  updated_at   timestamptz,
  updated_by   text,

  constraint currency_status_chk check (status in ('active','deprecated'))
);

comment on table ref.currency is 'ISO 4217 currency codes.';

-- ============================================================================
-- REF: Language (ISO 639)
-- ============================================================================
create table if not exists ref.language (
  code         text primary key,
  name         text not null,
  native_name  text,
  iso639_2     text,
  direction    text not null default 'ltr',

  status       text not null default 'active',
  metadata     jsonb not null default '{}'::jsonb,

  created_at   timestamptz not null default now(),
  created_by   text not null default 'seed',
  updated_at   timestamptz,
  updated_by   text,

  constraint language_dir_chk check (direction in ('ltr','rtl')),
  constraint language_status_chk check (status in ('active','deprecated'))
);

comment on table ref.language is 'ISO 639 language codes (prefer ISO 639-1).';

-- ============================================================================
-- REF: Locale (BCP 47 recommended)
-- ============================================================================
create table if not exists ref.locale (
  code          text primary key,
  language_code text not null
                references ref.language(code),
  country_code2 char(2)
                references ref.country(code2),
  script        text,
  name          text not null,
  direction     text,
  status        text not null default 'active',
  metadata      jsonb not null default '{}'::jsonb,

  created_at    timestamptz not null default now(),
  created_by    text not null default 'seed',
  updated_at    timestamptz,
  updated_by    text,

  constraint locale_status_chk check (status in ('active','deprecated')),
  constraint locale_dir_chk check (direction is null or direction in ('ltr','rtl'))
);

comment on table ref.locale is 'Locales (BCP 47 tags) linked to language and optional country.';
create index if not exists idx_locale_language on ref.locale(language_code);
create index if not exists idx_locale_country on ref.locale(country_code2);

-- ============================================================================
-- REF: Time Zone (IANA tzdb)
-- ============================================================================
create table if not exists ref.timezone (
  tzid          text primary key,
  display_name  text,
  utc_offset    text,
  is_alias      boolean not null default false,
  canonical_tzid text references ref.timezone(tzid),

  status        text not null default 'active',
  metadata      jsonb not null default '{}'::jsonb,

  created_at    timestamptz not null default now(),
  created_by    text not null default 'seed',
  updated_at    timestamptz,
  updated_by    text,

  constraint timezone_status_chk check (status in ('active','deprecated'))
);

comment on table ref.timezone is 'IANA tzdb time zone identifiers.';
create index if not exists idx_timezone_canonical on ref.timezone(canonical_tzid);

-- ============================================================================
-- REF: Unit of Measure (UN/ECE Rec 20)
-- ============================================================================
create table if not exists ref.uom (
  code         text primary key,
  name         text not null,
  symbol       text,
  quantity_type text,
  status       text not null default 'active',
  metadata     jsonb not null default '{}'::jsonb,

  created_at   timestamptz not null default now(),
  created_by   text not null default 'seed',
  updated_at   timestamptz,
  updated_by   text,

  constraint uom_status_chk check (status in ('active','deprecated')),
  constraint uom_qty_type_chk check (
    quantity_type is null or quantity_type in (
      'mass','length','volume','area','time','temperature',
      'count','force','pressure','energy','data','speed',
      'density','frequency','electric','angle','currency'
    )
  )
);

comment on table ref.uom is 'UN/ECE Recommendation 20 units of measure.';

-- ============================================================================
-- REF: Commodity Domains (UNSPSC, HS, and custom)
-- ============================================================================
create table if not exists ref.commodity_domain (
  code         text primary key,
  name         text not null,
  standard     text,
  version      text,
  hierarchy_depth smallint,                              -- number of levels: UNSPSC=4, HS=6
  code_pattern    text,                                  -- validation regex, e.g. '^\d{2,8}$'
  status       text not null default 'active',
  metadata     jsonb not null default '{}'::jsonb,

  created_at   timestamptz not null default now(),
  created_by   text not null default 'seed',
  updated_at   timestamptz,
  updated_by   text,

  constraint commodity_domain_status_chk check (status in ('active','deprecated'))
);

comment on table ref.commodity_domain is 'Commodity code domains (UNSPSC, HS, custom).';

-- Migration: add columns to existing tables
alter table ref.commodity_domain add column if not exists hierarchy_depth smallint;
alter table ref.commodity_domain add column if not exists code_pattern text;

create table if not exists ref.commodity_code (
  domain_code  text not null
               references ref.commodity_domain(code)
               on delete cascade,
  code         text not null,
  name         text not null,
  description  text,
  parent_code  text,
  level_no     int,
  keywords     text[],                                   -- type-ahead search: {'laptop','notebook','portable computer'}
  is_leaf      boolean not null default false,            -- true = finest-grain postable level
  status       text not null default 'active',
  metadata     jsonb not null default '{}'::jsonb,

  created_at   timestamptz not null default now(),
  created_by   text not null default 'seed',
  updated_at   timestamptz,
  updated_by   text,

  primary key (domain_code, code),

  constraint commodity_code_status_chk check (status in ('active','deprecated')),
  constraint commodity_code_parent_fk
    foreign key (domain_code, parent_code)
    references ref.commodity_code(domain_code, code)
);

comment on table ref.commodity_code is 'Commodity classification codes per domain (UNSPSC/HS/custom).';

-- Migration: add columns to existing tables
alter table ref.commodity_code add column if not exists keywords text[];
alter table ref.commodity_code add column if not exists is_leaf boolean not null default false;

create index if not exists idx_commodity_code_parent
  on ref.commodity_code(domain_code, parent_code);
create index if not exists idx_commodity_code_level
  on ref.commodity_code(domain_code, level_no);
create index if not exists idx_commodity_code_keywords
  on ref.commodity_code using gin(keywords);

-- ============================================================================
-- REF: Industry Domains (ISIC, NAICS, and custom)
-- ============================================================================
create table if not exists ref.industry_domain (
  code         text primary key,
  name         text not null,
  standard     text,
  version      text,
  hierarchy_depth smallint,                              -- number of levels: ISIC=4, NAICS=5
  code_pattern    text,                                  -- validation regex
  status       text not null default 'active',
  metadata     jsonb not null default '{}'::jsonb,

  created_at   timestamptz not null default now(),
  created_by   text not null default 'seed',
  updated_at   timestamptz,
  updated_by   text,

  constraint industry_domain_status_chk check (status in ('active','deprecated'))
);

comment on table ref.industry_domain is 'Industry code domains (ISIC, NAICS, custom).';

-- Migration: add columns to existing tables
alter table ref.industry_domain add column if not exists hierarchy_depth smallint;
alter table ref.industry_domain add column if not exists code_pattern text;

create table if not exists ref.industry_code (
  domain_code  text not null
               references ref.industry_domain(code)
               on delete cascade,
  code         text not null,
  name         text not null,
  description  text,
  parent_code  text,
  level_no     int,
  keywords     text[],                                   -- type-ahead search
  is_leaf      boolean not null default false,            -- true = finest-grain postable level
  status       text not null default 'active',
  metadata     jsonb not null default '{}'::jsonb,

  created_at   timestamptz not null default now(),
  created_by   text not null default 'seed',
  updated_at   timestamptz,
  updated_by   text,

  primary key (domain_code, code),

  constraint industry_code_status_chk check (status in ('active','deprecated')),
  constraint industry_code_parent_fk
    foreign key (domain_code, parent_code)
    references ref.industry_code(domain_code, code)
);

comment on table ref.industry_code is 'Industry classification codes per domain (ISIC/NAICS/custom).';

-- Migration: add columns to existing tables
alter table ref.industry_code add column if not exists keywords text[];
alter table ref.industry_code add column if not exists is_leaf boolean not null default false;

create index if not exists idx_industry_code_parent
  on ref.industry_code(domain_code, parent_code);
create index if not exists idx_industry_code_level
  on ref.industry_code(domain_code, level_no);
create index if not exists idx_industry_code_keywords
  on ref.industry_code using gin(keywords);

-- ============================================================================
-- REF: Label (i18n translations for reference data)
-- ============================================================================
create table if not exists ref.label (
  entity      text    not null,
  code        text    not null,
  locale_code text    not null
              references ref.locale(code),
  name        text    not null,
  description text,

  created_at  timestamptz not null default now(),
  created_by  text not null default 'seed',
  updated_at  timestamptz,
  updated_by  text,

  primary key (entity, code, locale_code)
);

comment on table ref.label is 'i18n translations for ref entity names. English canonical stays on source table.';

create index if not exists idx_label_locale on ref.label(locale_code);
create index if not exists idx_label_entity_locale on ref.label(entity, locale_code);

-- ============================================================================
-- Helper: resolve a localized name with fallback
-- ============================================================================
create or replace function ref.localized_name(
  p_entity text,
  p_code   text,
  p_locale text
) returns text
language sql stable
as $$
  select coalesce(
    (select name from ref.label
     where entity = p_entity and code = p_code and locale_code = p_locale),
    (select name from ref.label
     where entity = p_entity and code = p_code and locale_code = split_part(p_locale, '-', 1))
  );
$$;
