/* ============================================================================
   Athyper — DEMO SEED: Tenants, Users, Addresses
   Creates 9 demo tenants with profiles, subscriptions, principals, and addresses.
   DEMO DATA ONLY — not required for production deployments.

   PostgreSQL 16+
   Depends on: 200_seed_standard.sql (reference data, operations, personas, modules)
   ============================================================================ */

begin;

-- ============================================================================
-- §22  Demo Tenants, Users, Addresses
-- ============================================================================

-- ============================================================================
-- 1. TENANTS
-- ============================================================================
insert into core.tenant (code, name, display_name, realm_key, status, region, subscription, created_by)
values
  ('demo_my', 'Demo Malaysia',      'Demo Malaysia',      'athyper', 'active', 'APAC', 'enterprise', 'seed'),
  ('demo_in', 'Demo India',         'Demo India',         'athyper', 'active', 'APAC', 'enterprise', 'seed'),
  ('demo_sa', 'Demo Saudi Arabia',  'Demo Saudi Arabia',  'athyper', 'active', 'MEA',  'enterprise', 'seed'),
  ('demo_qa', 'Demo Qatar',         'Demo Qatar',         'athyper', 'active', 'MEA',  'enterprise', 'seed'),
  ('demo_fr', 'Demo France',        'Demo France',        'athyper', 'active', 'EMEA', 'enterprise', 'seed'),
  ('demo_de', 'Demo Germany',       'Demo Germany',       'athyper', 'active', 'EMEA', 'enterprise', 'seed'),
  ('demo_ch', 'Demo Switzerland',   'Demo Switzerland',   'athyper', 'active', 'EMEA', 'enterprise', 'seed'),
  ('demo_us', 'Demo USA',           'Demo USA',           'athyper', 'active', 'AMER', 'enterprise', 'seed'),
  ('demo_ca', 'Demo Canada',        'Demo Canada',        'athyper', 'active', 'AMER', 'enterprise', 'seed')
on conflict (code) do nothing;


-- ============================================================================
-- 2. TENANT PROFILES
-- ============================================================================
insert into core.tenant_profile (tenant_id, country, currency, locale, timezone, fiscal_year_start_month, created_by)
select t.id, v.country, v.currency, v.locale, v.timezone, v.fy_start, 'seed'
from (values
  ('demo_my', 'MY', 'MYR', 'ms',    'Asia/Kuala_Lumpur',  1),
  ('demo_in', 'IN', 'INR', 'hi',    'Asia/Kolkata',       4),
  ('demo_sa', 'SA', 'SAR', 'ar',    'Asia/Riyadh',        1),
  ('demo_qa', 'QA', 'QAR', 'ar',    'Asia/Qatar',         1),
  ('demo_fr', 'FR', 'EUR', 'fr',    'Europe/Paris',       1),
  ('demo_de', 'DE', 'EUR', 'de',    'Europe/Berlin',      1),
  ('demo_ch', 'CH', 'CHF', 'de',    'Europe/Zurich',      1),
  ('demo_us', 'US', 'USD', 'en',    'America/New_York',   1),
  ('demo_ca', 'CA', 'CAD', 'en',    'America/Toronto',    4)
) as v(tenant_code, country, currency, locale, timezone, fy_start)
join core.tenant t on t.code = v.tenant_code
on conflict (tenant_id) do nothing;


-- ============================================================================
-- 3. TENANT MODULE SUBSCRIPTIONS  (every demo tenant → every module)
-- ============================================================================
insert into core.tenant_module_subscription (tenant_id, module_id, is_active, created_by)
select t.id, m.id, true, 'seed'
from core.tenant t
cross join core.module m
where t.code like 'demo_%'
on conflict (tenant_id, module_id) do nothing;


-- ============================================================================
-- 4. PRINCIPALS  (9 tenants × 7 personas = 63 demo users)
--    principal_code uses short ISO-code prefix + snake_case persona suffix
--    to match Keycloak username convention (e.g. demoin_tenant_admin)
-- ============================================================================
insert into core.principal
  (tenant_id, realm_key, principal_type, principal_code, display_name, email, is_active, created_by)
select
  t.id,
  t.realm_key,
  'user',
  tm.prefix || '_' || case p.code
                         when 'tenantAdmin' then 'tenant_admin'
                         when 'moduleAdmin' then 'module_admin'
                         else p.code
                       end,
  p.name || ' (' || tm.country_abbr || ')',
  tm.prefix || '_' || case p.code
                         when 'tenantAdmin' then 'tenant_admin'
                         when 'moduleAdmin' then 'module_admin'
                         else p.code
                       end || '@demo.athyper.com',
  true,
  'seed'
from (values
  ('demo_my', 'demomy', 'MY'),
  ('demo_in', 'demoin', 'IN'),
  ('demo_sa', 'demosa', 'SA'),
  ('demo_qa', 'demoqa', 'QA'),
  ('demo_fr', 'demofr', 'FR'),
  ('demo_de', 'demode', 'DE'),
  ('demo_ch', 'democh', 'CH'),
  ('demo_us', 'demous', 'US'),
  ('demo_ca', 'democa', 'CA')
) as tm(tenant_code, prefix, country_abbr)
join core.tenant t on t.code = tm.tenant_code
cross join core.persona p
where p.is_system = true
on conflict (principal_code) do nothing;


-- ============================================================================
-- 5. PRINCIPAL PROFILES
-- ============================================================================
insert into core.principal_profile
  (tenant_id, principal_id, first_name, last_name, locale, timezone, created_by)
select
  pr.tenant_id,
  pr.id,
  p.name,
  tm.country_name,
  tm.locale,
  tm.tz,
  'seed'
from (values
  ('demo_my', 'demomy', 'Malaysia',      'ms', 'Asia/Kuala_Lumpur'),
  ('demo_in', 'demoin', 'India',         'hi', 'Asia/Kolkata'),
  ('demo_sa', 'demosa', 'Saudi Arabia',  'ar', 'Asia/Riyadh'),
  ('demo_qa', 'demoqa', 'Qatar',         'ar', 'Asia/Qatar'),
  ('demo_fr', 'demofr', 'France',        'fr', 'Europe/Paris'),
  ('demo_de', 'demode', 'Germany',       'de', 'Europe/Berlin'),
  ('demo_ch', 'democh', 'Switzerland',   'de', 'Europe/Zurich'),
  ('demo_us', 'demous', 'USA',           'en', 'America/New_York'),
  ('demo_ca', 'democa', 'Canada',        'en', 'America/Toronto')
) as tm(tenant_code, prefix, country_name, locale, tz)
join core.tenant t on t.code = tm.tenant_code
cross join core.persona p
join core.principal pr on pr.principal_code = tm.prefix || '_' || case p.code
                                                                     when 'tenantAdmin' then 'tenant_admin'
                                                                     when 'moduleAdmin' then 'module_admin'
                                                                     else p.code
                                                                   end
where p.is_system = true
on conflict (principal_id) do nothing;


-- ============================================================================
-- 6. ADDRESSES  (one HQ address per demo tenant)
-- ============================================================================
insert into core.address (tenant_id, country_code, line1, line2, city, region, postal_code, created_by)
select t.id, v.cc, v.line1, v.line2, v.city, v.region, v.postal, 'seed'
from (values
  ('demo_my', 'MY', 'Level 10, Menara KL',             'Jalan Sultan Ismail',           'Kuala Lumpur',  'WP Kuala Lumpur',  '50250'),
  ('demo_in', 'IN', '5th Floor, Bandra Kurla Complex',  'Bandra East',                  'Mumbai',        'Maharashtra',      '400051'),
  ('demo_sa', 'SA', 'King Fahd Road',                   'Al Olaya District',             'Riyadh',        'Riyadh',           '11564'),
  ('demo_qa', 'QA', 'Al Corniche Street',               'West Bay Tower, 15th Floor',    'Doha',          'Doha',             '23456'),
  ('demo_fr', 'FR', '25 Avenue des Champs-Élysées',     'Bâtiment A, 3e étage',          'Paris',         'Île-de-France',    '75008'),
  ('demo_de', 'DE', 'Friedrichstraße 123',              '4. Obergeschoss',               'Berlin',        'Berlin',           '10117'),
  ('demo_ch', 'CH', 'Bahnhofstrasse 42',                '2. Stock',                      'Zürich',        'Zürich',           '8001'),
  ('demo_us', 'US', '350 Fifth Avenue, Suite 2000',     'Empire State Building',         'New York',      'New York',         '10118'),
  ('demo_ca', 'CA', '100 King Street West, Suite 5700', 'First Canadian Place',          'Toronto',       'Ontario',          'M5X 1C7')
) as v(tenant_code, cc, line1, line2, city, region, postal)
join core.tenant t on t.code = v.tenant_code;


-- ============================================================================
-- 7. ADDRESS LINKS
-- ============================================================================

-- 7a. Link each address to its tenant as HQ (primary)
insert into core.address_link
  (tenant_id, address_id, owner_type, owner_id, purpose, is_primary, created_by)
select
  a.tenant_id,
  a.id,
  'tenant',
  a.tenant_id,
  'hq',
  true,
  'seed'
from core.address a
join core.tenant t on t.id = a.tenant_id
where t.code like 'demo_%'
on conflict (tenant_id, owner_type, owner_id, purpose, address_id) do nothing;

-- 7b. Link each address to its tenant as legal address (primary)
insert into core.address_link
  (tenant_id, address_id, owner_type, owner_id, purpose, is_primary, created_by)
select
  a.tenant_id,
  a.id,
  'tenant',
  a.tenant_id,
  'legal',
  true,
  'seed'
from core.address a
join core.tenant t on t.id = a.tenant_id
where t.code like 'demo_%'
on conflict (tenant_id, owner_type, owner_id, purpose, address_id) do nothing;

-- 7c. Link each address to all principals of that tenant as office address
insert into core.address_link
  (tenant_id, address_id, owner_type, owner_id, purpose, is_primary, created_by)
select
  a.tenant_id,
  a.id,
  'principal',
  pr.id,
  'office',
  true,
  'seed'
from core.address a
join core.tenant t on t.id = a.tenant_id
join core.principal pr on pr.tenant_id = t.id
where t.code like 'demo_%'
  and pr.principal_code like 'demo%'
on conflict (tenant_id, owner_type, owner_id, purpose, address_id) do nothing;

-- ============================================================================
commit;
