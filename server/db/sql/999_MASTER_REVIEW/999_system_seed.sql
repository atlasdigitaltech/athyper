-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/010_system/000_public/000_bootstrap.sql
-- 900_seed_data/000_public/000_bootstrap.sql
-- Bootstrap: system tenant + system principal (self-referential)
-- Must execute FIRST — before all other seeds.
-- Uses session_replication_role = replica to bypass FK/CHECK triggers during bootstrap.

BEGIN;

SET LOCAL session_replication_role = replica;

-- §1  System Tenant — well-known UUID, required by principal FK
INSERT INTO master.tenant (
    id, code, name, display_name, realm_key, region, subscription,
    status, created_by
)
VALUES (
    '00000000-0000-0000-0000-000000000000'::uuid,
    'system',
    'System Tenant',
    'System',
    'athyper',
    NULL,
    'base',
    'active',
    '00000000-0000-0000-0000-000000000000'::uuid   -- self-ref bootstrap
)
ON CONFLICT (id) DO NOTHING;

-- §2  System Principal — self-referential created_by
INSERT INTO master.principal (
    id, tenant_id, code, name, principal_type,
    is_service_account,
    status, created_by
)
VALUES (
    '00000000-0000-0000-0000-000000000000'::uuid,
    '00000000-0000-0000-0000-000000000000'::uuid,   -- system tenant
    'systemadmin',
    'System Administrator',
    'SYSTEM',
    true,
    'active',
    '00000000-0000-0000-0000-000000000000'::uuid    -- self-referential bootstrap
)
ON CONFLICT (id) DO NOTHING;

COMMIT;
-- session_replication_role resets automatically at transaction end (SET LOCAL).

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/010_system/001_shared/001_country.sql
-- 900_seed_data/001_shared/001_country.sql
-- Seed: ISO 3166-1 countries + phone/postal/address rendering profiles
-- Schema: shared | Table: country
-- Idempotent: ON CONFLICT (code) DO UPDATE throughout
--
-- Countries with phone/postal/address profiles are in §2 (full column list).
-- All other countries are in §1 (base columns — new columns use table defaults).

-- ============================================================================
-- §1  BASE COUNTRIES (ISO columns only — defaults apply for phone/postal)
-- ============================================================================

-- ── AFRICA ──
insert into shared.country (code, code3, numeric3, name, official_name, region, subregion, created_by)
values
  ('DZ','DZA','012','Algeria','People''s Democratic Republic of Algeria','Africa','Northern Africa','00000000-0000-0000-0000-000000000000'),
  ('AO','AGO','024','Angola','Republic of Angola','Africa','Sub-Saharan Africa','00000000-0000-0000-0000-000000000000'),
  ('BJ','BEN','204','Benin','Republic of Benin','Africa','Sub-Saharan Africa','00000000-0000-0000-0000-000000000000'),
  ('BW','BWA','072','Botswana','Republic of Botswana','Africa','Sub-Saharan Africa','00000000-0000-0000-0000-000000000000'),
  ('BF','BFA','854','Burkina Faso','Burkina Faso','Africa','Sub-Saharan Africa','00000000-0000-0000-0000-000000000000'),
  ('BI','BDI','108','Burundi','Republic of Burundi','Africa','Sub-Saharan Africa','00000000-0000-0000-0000-000000000000'),
  ('CV','CPV','132','Cabo Verde','Republic of Cabo Verde','Africa','Sub-Saharan Africa','00000000-0000-0000-0000-000000000000'),
  ('CM','CMR','120','Cameroon','Republic of Cameroon','Africa','Sub-Saharan Africa','00000000-0000-0000-0000-000000000000'),
  ('CF','CAF','140','Central African Republic','Central African Republic','Africa','Sub-Saharan Africa','00000000-0000-0000-0000-000000000000'),
  ('TD','TCD','148','Chad','Republic of Chad','Africa','Sub-Saharan Africa','00000000-0000-0000-0000-000000000000'),
  ('KM','COM','174','Comoros','Union of the Comoros','Africa','Sub-Saharan Africa','00000000-0000-0000-0000-000000000000'),
  ('CG','COG','178','Congo','Republic of the Congo','Africa','Sub-Saharan Africa','00000000-0000-0000-0000-000000000000'),
  ('CD','COD','180','Congo (Democratic Republic)','Democratic Republic of the Congo','Africa','Sub-Saharan Africa','00000000-0000-0000-0000-000000000000'),
  ('CI','CIV','384','Côte d''Ivoire','Republic of Côte d''Ivoire','Africa','Sub-Saharan Africa','00000000-0000-0000-0000-000000000000'),
  ('DJ','DJI','262','Djibouti','Republic of Djibouti','Africa','Sub-Saharan Africa','00000000-0000-0000-0000-000000000000'),
  ('EG','EGY','818','Egypt','Arab Republic of Egypt','Africa','Northern Africa','00000000-0000-0000-0000-000000000000'),
  ('GQ','GNQ','226','Equatorial Guinea','Republic of Equatorial Guinea','Africa','Sub-Saharan Africa','00000000-0000-0000-0000-000000000000'),
  ('ER','ERI','232','Eritrea','State of Eritrea','Africa','Sub-Saharan Africa','00000000-0000-0000-0000-000000000000'),
  ('SZ','SWZ','748','Eswatini','Kingdom of Eswatini','Africa','Sub-Saharan Africa','00000000-0000-0000-0000-000000000000'),
  ('ET','ETH','231','Ethiopia','Federal Democratic Republic of Ethiopia','Africa','Sub-Saharan Africa','00000000-0000-0000-0000-000000000000'),
  ('GA','GAB','266','Gabon','Gabonese Republic','Africa','Sub-Saharan Africa','00000000-0000-0000-0000-000000000000'),
  ('GM','GMB','270','Gambia','Republic of the Gambia','Africa','Sub-Saharan Africa','00000000-0000-0000-0000-000000000000'),
  ('GH','GHA','288','Ghana','Republic of Ghana','Africa','Sub-Saharan Africa','00000000-0000-0000-0000-000000000000'),
  ('GN','GIN','324','Guinea','Republic of Guinea','Africa','Sub-Saharan Africa','00000000-0000-0000-0000-000000000000'),
  ('GW','GNB','624','Guinea-Bissau','Republic of Guinea-Bissau','Africa','Sub-Saharan Africa','00000000-0000-0000-0000-000000000000'),
  ('KE','KEN','404','Kenya','Republic of Kenya','Africa','Sub-Saharan Africa','00000000-0000-0000-0000-000000000000'),
  ('LS','LSO','426','Lesotho','Kingdom of Lesotho','Africa','Sub-Saharan Africa','00000000-0000-0000-0000-000000000000'),
  ('LR','LBR','430','Liberia','Republic of Liberia','Africa','Sub-Saharan Africa','00000000-0000-0000-0000-000000000000'),
  ('LY','LBY','434','Libya','State of Libya','Africa','Northern Africa','00000000-0000-0000-0000-000000000000'),
  ('MG','MDG','450','Madagascar','Republic of Madagascar','Africa','Sub-Saharan Africa','00000000-0000-0000-0000-000000000000'),
  ('MW','MWI','454','Malawi','Republic of Malawi','Africa','Sub-Saharan Africa','00000000-0000-0000-0000-000000000000'),
  ('ML','MLI','466','Mali','Republic of Mali','Africa','Sub-Saharan Africa','00000000-0000-0000-0000-000000000000'),
  ('MR','MRT','478','Mauritania','Islamic Republic of Mauritania','Africa','Sub-Saharan Africa','00000000-0000-0000-0000-000000000000'),
  ('MU','MUS','480','Mauritius','Republic of Mauritius','Africa','Sub-Saharan Africa','00000000-0000-0000-0000-000000000000'),
  ('YT','MYT','175','Mayotte',null,'Africa','Sub-Saharan Africa','00000000-0000-0000-0000-000000000000'),
  ('MA','MAR','504','Morocco','Kingdom of Morocco','Africa','Northern Africa','00000000-0000-0000-0000-000000000000'),
  ('MZ','MOZ','508','Mozambique','Republic of Mozambique','Africa','Sub-Saharan Africa','00000000-0000-0000-0000-000000000000'),
  ('NA','NAM','516','Namibia','Republic of Namibia','Africa','Sub-Saharan Africa','00000000-0000-0000-0000-000000000000'),
  ('NE','NER','562','Niger','Republic of the Niger','Africa','Sub-Saharan Africa','00000000-0000-0000-0000-000000000000'),
  ('NG','NGA','566','Nigeria','Federal Republic of Nigeria','Africa','Sub-Saharan Africa','00000000-0000-0000-0000-000000000000'),
  ('RE','REU','638','Réunion',null,'Africa','Sub-Saharan Africa','00000000-0000-0000-0000-000000000000'),
  ('RW','RWA','646','Rwanda','Republic of Rwanda','Africa','Sub-Saharan Africa','00000000-0000-0000-0000-000000000000'),
  ('ST','STP','678','São Tomé and Príncipe','Democratic Republic of São Tomé and Príncipe','Africa','Sub-Saharan Africa','00000000-0000-0000-0000-000000000000'),
  ('SN','SEN','686','Senegal','Republic of Senegal','Africa','Sub-Saharan Africa','00000000-0000-0000-0000-000000000000'),
  ('SC','SYC','690','Seychelles','Republic of Seychelles','Africa','Sub-Saharan Africa','00000000-0000-0000-0000-000000000000'),
  ('SL','SLE','694','Sierra Leone','Republic of Sierra Leone','Africa','Sub-Saharan Africa','00000000-0000-0000-0000-000000000000'),
  ('SO','SOM','706','Somalia','Federal Republic of Somalia','Africa','Sub-Saharan Africa','00000000-0000-0000-0000-000000000000'),
  ('ZA','ZAF','710','South Africa','Republic of South Africa','Africa','Sub-Saharan Africa','00000000-0000-0000-0000-000000000000'),
  ('SS','SSD','728','South Sudan','Republic of South Sudan','Africa','Sub-Saharan Africa','00000000-0000-0000-0000-000000000000'),
  ('SD','SDN','729','Sudan','Republic of the Sudan','Africa','Northern Africa','00000000-0000-0000-0000-000000000000'),
  ('TZ','TZA','834','Tanzania','United Republic of Tanzania','Africa','Sub-Saharan Africa','00000000-0000-0000-0000-000000000000'),
  ('TG','TGO','768','Togo','Togolese Republic','Africa','Sub-Saharan Africa','00000000-0000-0000-0000-000000000000'),
  ('TN','TUN','788','Tunisia','Republic of Tunisia','Africa','Northern Africa','00000000-0000-0000-0000-000000000000'),
  ('UG','UGA','800','Uganda','Republic of Uganda','Africa','Sub-Saharan Africa','00000000-0000-0000-0000-000000000000'),
  ('EH','ESH','732','Western Sahara',null,'Africa','Northern Africa','00000000-0000-0000-0000-000000000000'),
  ('ZM','ZMB','894','Zambia','Republic of Zambia','Africa','Sub-Saharan Africa','00000000-0000-0000-0000-000000000000'),
  ('ZW','ZWE','716','Zimbabwe','Republic of Zimbabwe','Africa','Sub-Saharan Africa','00000000-0000-0000-0000-000000000000')
on conflict (code) do update set
    name          = excluded.name,
    official_name = excluded.official_name,
    region        = excluded.region,
    subregion     = excluded.subregion,
    updated_at    = now(),
    updated_by    = excluded.created_by;

-- ── AMERICAS ──
insert into shared.country (code, code3, numeric3, name, official_name, region, subregion, created_by)
values
  -- Caribbean
  ('AI','AIA','660','Anguilla',null,'Americas','Caribbean','00000000-0000-0000-0000-000000000000'),
  ('AG','ATG','028','Antigua and Barbuda',null,'Americas','Caribbean','00000000-0000-0000-0000-000000000000'),
  ('AW','ABW','533','Aruba',null,'Americas','Caribbean','00000000-0000-0000-0000-000000000000'),
  ('BS','BHS','044','Bahamas','Commonwealth of the Bahamas','Americas','Caribbean','00000000-0000-0000-0000-000000000000'),
  ('BB','BRB','052','Barbados',null,'Americas','Caribbean','00000000-0000-0000-0000-000000000000'),
  ('BQ','BES','535','Bonaire, Sint Eustatius and Saba',null,'Americas','Caribbean','00000000-0000-0000-0000-000000000000'),
  ('VG','VGB','092','British Virgin Islands',null,'Americas','Caribbean','00000000-0000-0000-0000-000000000000'),
  ('KY','CYM','136','Cayman Islands',null,'Americas','Caribbean','00000000-0000-0000-0000-000000000000'),
  ('CU','CUB','192','Cuba','Republic of Cuba','Americas','Caribbean','00000000-0000-0000-0000-000000000000'),
  ('CW','CUW','531','Curaçao',null,'Americas','Caribbean','00000000-0000-0000-0000-000000000000'),
  ('DM','DMA','212','Dominica','Commonwealth of Dominica','Americas','Caribbean','00000000-0000-0000-0000-000000000000'),
  ('DO','DOM','214','Dominican Republic',null,'Americas','Caribbean','00000000-0000-0000-0000-000000000000'),
  ('GD','GRD','308','Grenada',null,'Americas','Caribbean','00000000-0000-0000-0000-000000000000'),
  ('GP','GLP','312','Guadeloupe',null,'Americas','Caribbean','00000000-0000-0000-0000-000000000000'),
  ('HT','HTI','332','Haiti','Republic of Haiti','Americas','Caribbean','00000000-0000-0000-0000-000000000000'),
  ('JM','JAM','388','Jamaica',null,'Americas','Caribbean','00000000-0000-0000-0000-000000000000'),
  ('MQ','MTQ','474','Martinique',null,'Americas','Caribbean','00000000-0000-0000-0000-000000000000'),
  ('MS','MSR','500','Montserrat',null,'Americas','Caribbean','00000000-0000-0000-0000-000000000000'),
  ('PR','PRI','630','Puerto Rico',null,'Americas','Caribbean','00000000-0000-0000-0000-000000000000'),
  ('BL','BLM','652','Saint Barthélemy',null,'Americas','Caribbean','00000000-0000-0000-0000-000000000000'),
  ('KN','KNA','659','Saint Kitts and Nevis',null,'Americas','Caribbean','00000000-0000-0000-0000-000000000000'),
  ('LC','LCA','662','Saint Lucia',null,'Americas','Caribbean','00000000-0000-0000-0000-000000000000'),
  ('MF','MAF','663','Saint Martin (French part)',null,'Americas','Caribbean','00000000-0000-0000-0000-000000000000'),
  ('VC','VCT','670','Saint Vincent and the Grenadines',null,'Americas','Caribbean','00000000-0000-0000-0000-000000000000'),
  ('SX','SXM','534','Sint Maarten (Dutch part)',null,'Americas','Caribbean','00000000-0000-0000-0000-000000000000'),
  ('TT','TTO','780','Trinidad and Tobago','Republic of Trinidad and Tobago','Americas','Caribbean','00000000-0000-0000-0000-000000000000'),
  ('TC','TCA','796','Turks and Caicos Islands',null,'Americas','Caribbean','00000000-0000-0000-0000-000000000000'),
  ('VI','VIR','850','United States Virgin Islands',null,'Americas','Caribbean','00000000-0000-0000-0000-000000000000'),
  -- Central America
  ('BZ','BLZ','084','Belize',null,'Americas','Central America','00000000-0000-0000-0000-000000000000'),
  ('CR','CRI','188','Costa Rica','Republic of Costa Rica','Americas','Central America','00000000-0000-0000-0000-000000000000'),
  ('SV','SLV','222','El Salvador','Republic of El Salvador','Americas','Central America','00000000-0000-0000-0000-000000000000'),
  ('GT','GTM','320','Guatemala','Republic of Guatemala','Americas','Central America','00000000-0000-0000-0000-000000000000'),
  ('HN','HND','340','Honduras','Republic of Honduras','Americas','Central America','00000000-0000-0000-0000-000000000000'),
  ('MX','MEX','484','Mexico','United Mexican States','Americas','Central America','00000000-0000-0000-0000-000000000000'),
  ('NI','NIC','558','Nicaragua','Republic of Nicaragua','Americas','Central America','00000000-0000-0000-0000-000000000000'),
  ('PA','PAN','591','Panama','Republic of Panama','Americas','Central America','00000000-0000-0000-0000-000000000000'),
  -- South America
  ('AR','ARG','032','Argentina','Argentine Republic','Americas','South America','00000000-0000-0000-0000-000000000000'),
  ('BO','BOL','068','Bolivia','Plurinational State of Bolivia','Americas','South America','00000000-0000-0000-0000-000000000000'),
  ('BR','BRA','076','Brazil','Federative Republic of Brazil','Americas','South America','00000000-0000-0000-0000-000000000000'),
  ('CL','CHL','152','Chile','Republic of Chile','Americas','South America','00000000-0000-0000-0000-000000000000'),
  ('CO','COL','170','Colombia','Republic of Colombia','Americas','South America','00000000-0000-0000-0000-000000000000'),
  ('EC','ECU','218','Ecuador','Republic of Ecuador','Americas','South America','00000000-0000-0000-0000-000000000000'),
  ('FK','FLK','238','Falkland Islands (Malvinas)',null,'Americas','South America','00000000-0000-0000-0000-000000000000'),
  ('GF','GUF','254','French Guiana',null,'Americas','South America','00000000-0000-0000-0000-000000000000'),
  ('GY','GUY','328','Guyana','Co-operative Republic of Guyana','Americas','South America','00000000-0000-0000-0000-000000000000'),
  ('PY','PRY','600','Paraguay','Republic of Paraguay','Americas','South America','00000000-0000-0000-0000-000000000000'),
  ('PE','PER','604','Peru','Republic of Peru','Americas','South America','00000000-0000-0000-0000-000000000000'),
  ('SR','SUR','740','Suriname','Republic of Suriname','Americas','South America','00000000-0000-0000-0000-000000000000'),
  ('UY','URY','858','Uruguay','Eastern Republic of Uruguay','Americas','South America','00000000-0000-0000-0000-000000000000'),
  ('VE','VEN','862','Venezuela','Bolivarian Republic of Venezuela','Americas','South America','00000000-0000-0000-0000-000000000000'),
  -- Northern America
  ('BM','BMU','060','Bermuda',null,'Americas','Northern America','00000000-0000-0000-0000-000000000000'),
  ('CA','CAN','124','Canada',null,'Americas','Northern America','00000000-0000-0000-0000-000000000000'),
  ('GL','GRL','304','Greenland',null,'Americas','Northern America','00000000-0000-0000-0000-000000000000'),
  ('PM','SPM','666','Saint Pierre and Miquelon',null,'Americas','Northern America','00000000-0000-0000-0000-000000000000')
on conflict (code) do update set
    name          = excluded.name,
    official_name = excluded.official_name,
    region        = excluded.region,
    subregion     = excluded.subregion,
    updated_at    = now(),
    updated_by    = excluded.created_by;

-- ── ASIA (base — countries without extended profile) ──
insert into shared.country (code, code3, numeric3, name, official_name, region, subregion, created_by)
values
  -- Central Asia
  ('KZ','KAZ','398','Kazakhstan','Republic of Kazakhstan','Asia','Central Asia','00000000-0000-0000-0000-000000000000'),
  ('KG','KGZ','417','Kyrgyzstan','Kyrgyz Republic','Asia','Central Asia','00000000-0000-0000-0000-000000000000'),
  ('TJ','TJK','762','Tajikistan','Republic of Tajikistan','Asia','Central Asia','00000000-0000-0000-0000-000000000000'),
  ('TM','TKM','795','Turkmenistan',null,'Asia','Central Asia','00000000-0000-0000-0000-000000000000'),
  ('UZ','UZB','860','Uzbekistan','Republic of Uzbekistan','Asia','Central Asia','00000000-0000-0000-0000-000000000000'),
  -- Eastern Asia (without CN, HK, JP, MO, which are in §2)
  ('KP','PRK','408','Korea (Democratic People''s Republic)','Democratic People''s Republic of Korea','Asia','Eastern Asia','00000000-0000-0000-0000-000000000000'),
  ('KR','KOR','410','Korea (Republic of)','Republic of Korea','Asia','Eastern Asia','00000000-0000-0000-0000-000000000000'),
  ('MN','MNG','496','Mongolia',null,'Asia','Eastern Asia','00000000-0000-0000-0000-000000000000'),
  ('TW','TWN','158','Taiwan','Taiwan, Province of China','Asia','Eastern Asia','00000000-0000-0000-0000-000000000000'),
  -- South-eastern Asia (without BN, ID, MY, SG, which are in §2)
  ('BN','BRN','096','Brunei Darussalam',null,'Asia','South-eastern Asia','00000000-0000-0000-0000-000000000000'),
  ('KH','KHM','116','Cambodia','Kingdom of Cambodia','Asia','South-eastern Asia','00000000-0000-0000-0000-000000000000'),
  ('LA','LAO','418','Lao People''s Democratic Republic',null,'Asia','South-eastern Asia','00000000-0000-0000-0000-000000000000'),
  ('MM','MMR','104','Myanmar','Republic of the Union of Myanmar','Asia','South-eastern Asia','00000000-0000-0000-0000-000000000000'),
  ('PH','PHL','608','Philippines','Republic of the Philippines','Asia','South-eastern Asia','00000000-0000-0000-0000-000000000000'),
  ('TH','THA','764','Thailand','Kingdom of Thailand','Asia','South-eastern Asia','00000000-0000-0000-0000-000000000000'),
  ('TL','TLS','626','Timor-Leste','Democratic Republic of Timor-Leste','Asia','South-eastern Asia','00000000-0000-0000-0000-000000000000'),
  ('VN','VNM','704','Viet Nam','Socialist Republic of Viet Nam','Asia','South-eastern Asia','00000000-0000-0000-0000-000000000000'),
  -- Southern Asia (without IN, which is in §2)
  ('AF','AFG','004','Afghanistan','Islamic Republic of Afghanistan','Asia','Southern Asia','00000000-0000-0000-0000-000000000000'),
  ('BD','BGD','050','Bangladesh','People''s Republic of Bangladesh','Asia','Southern Asia','00000000-0000-0000-0000-000000000000'),
  ('BT','BTN','064','Bhutan','Kingdom of Bhutan','Asia','Southern Asia','00000000-0000-0000-0000-000000000000'),
  ('IR','IRN','364','Iran','Islamic Republic of Iran','Asia','Southern Asia','00000000-0000-0000-0000-000000000000'),
  ('MV','MDV','462','Maldives','Republic of Maldives','Asia','Southern Asia','00000000-0000-0000-0000-000000000000'),
  ('NP','NPL','524','Nepal','Federal Democratic Republic of Nepal','Asia','Southern Asia','00000000-0000-0000-0000-000000000000'),
  ('PK','PAK','586','Pakistan','Islamic Republic of Pakistan','Asia','Southern Asia','00000000-0000-0000-0000-000000000000'),
  ('LK','LKA','144','Sri Lanka','Democratic Socialist Republic of Sri Lanka','Asia','Southern Asia','00000000-0000-0000-0000-000000000000'),
  -- Western Asia (without AE, which is in §2)
  ('AM','ARM','051','Armenia','Republic of Armenia','Asia','Western Asia','00000000-0000-0000-0000-000000000000'),
  ('AZ','AZE','031','Azerbaijan','Republic of Azerbaijan','Asia','Western Asia','00000000-0000-0000-0000-000000000000'),
  ('BH','BHR','048','Bahrain','Kingdom of Bahrain','Asia','Western Asia','00000000-0000-0000-0000-000000000000'),
  ('CY','CYP','196','Cyprus','Republic of Cyprus','Asia','Western Asia','00000000-0000-0000-0000-000000000000'),
  ('GE','GEO','268','Georgia',null,'Asia','Western Asia','00000000-0000-0000-0000-000000000000'),
  ('IQ','IRQ','368','Iraq','Republic of Iraq','Asia','Western Asia','00000000-0000-0000-0000-000000000000'),
  ('IL','ISR','376','Israel','State of Israel','Asia','Western Asia','00000000-0000-0000-0000-000000000000'),
  ('JO','JOR','400','Jordan','Hashemite Kingdom of Jordan','Asia','Western Asia','00000000-0000-0000-0000-000000000000'),
  ('KW','KWT','414','Kuwait','State of Kuwait','Asia','Western Asia','00000000-0000-0000-0000-000000000000'),
  ('LB','LBN','422','Lebanon','Lebanese Republic','Asia','Western Asia','00000000-0000-0000-0000-000000000000'),
  ('OM','OMN','512','Oman','Sultanate of Oman','Asia','Western Asia','00000000-0000-0000-0000-000000000000'),
  ('PS','PSE','275','Palestine, State of',null,'Asia','Western Asia','00000000-0000-0000-0000-000000000000'),
  ('QA','QAT','634','Qatar','State of Qatar','Asia','Western Asia','00000000-0000-0000-0000-000000000000'),
  ('SA','SAU','682','Saudi Arabia','Kingdom of Saudi Arabia','Asia','Western Asia','00000000-0000-0000-0000-000000000000'),
  ('SY','SYR','760','Syrian Arab Republic',null,'Asia','Western Asia','00000000-0000-0000-0000-000000000000'),
  ('TR','TUR','792','Türkiye','Republic of Türkiye','Asia','Western Asia','00000000-0000-0000-0000-000000000000'),
  ('YE','YEM','887','Yemen','Republic of Yemen','Asia','Western Asia','00000000-0000-0000-0000-000000000000')
on conflict (code) do update set
    name          = excluded.name,
    official_name = excluded.official_name,
    region        = excluded.region,
    subregion     = excluded.subregion,
    updated_at    = now(),
    updated_by    = excluded.created_by;

-- ── EUROPE ──
insert into shared.country (code, code3, numeric3, name, official_name, region, subregion, created_by)
values
  -- Eastern Europe
  ('BY','BLR','112','Belarus','Republic of Belarus','Europe','Eastern Europe','00000000-0000-0000-0000-000000000000'),
  ('BG','BGR','100','Bulgaria','Republic of Bulgaria','Europe','Eastern Europe','00000000-0000-0000-0000-000000000000'),
  ('CZ','CZE','203','Czechia','Czech Republic','Europe','Eastern Europe','00000000-0000-0000-0000-000000000000'),
  ('HU','HUN','348','Hungary',null,'Europe','Eastern Europe','00000000-0000-0000-0000-000000000000'),
  ('MD','MDA','498','Moldova','Republic of Moldova','Europe','Eastern Europe','00000000-0000-0000-0000-000000000000'),
  ('PL','POL','616','Poland','Republic of Poland','Europe','Eastern Europe','00000000-0000-0000-0000-000000000000'),
  ('RO','ROU','642','Romania',null,'Europe','Eastern Europe','00000000-0000-0000-0000-000000000000'),
  ('RU','RUS','643','Russian Federation',null,'Europe','Eastern Europe','00000000-0000-0000-0000-000000000000'),
  ('SK','SVK','703','Slovakia','Slovak Republic','Europe','Eastern Europe','00000000-0000-0000-0000-000000000000'),
  ('UA','UKR','804','Ukraine',null,'Europe','Eastern Europe','00000000-0000-0000-0000-000000000000'),
  -- Northern Europe (without GB, which is in §2)
  ('AX','ALA','248','Åland Islands',null,'Europe','Northern Europe','00000000-0000-0000-0000-000000000000'),
  ('DK','DNK','208','Denmark','Kingdom of Denmark','Europe','Northern Europe','00000000-0000-0000-0000-000000000000'),
  ('EE','EST','233','Estonia','Republic of Estonia','Europe','Northern Europe','00000000-0000-0000-0000-000000000000'),
  ('FO','FRO','234','Faroe Islands',null,'Europe','Northern Europe','00000000-0000-0000-0000-000000000000'),
  ('FI','FIN','246','Finland','Republic of Finland','Europe','Northern Europe','00000000-0000-0000-0000-000000000000'),
  ('GG','GGY','831','Guernsey',null,'Europe','Northern Europe','00000000-0000-0000-0000-000000000000'),
  ('IS','ISL','352','Iceland','Republic of Iceland','Europe','Northern Europe','00000000-0000-0000-0000-000000000000'),
  ('IE','IRL','372','Ireland',null,'Europe','Northern Europe','00000000-0000-0000-0000-000000000000'),
  ('IM','IMN','833','Isle of Man',null,'Europe','Northern Europe','00000000-0000-0000-0000-000000000000'),
  ('JE','JEY','832','Jersey',null,'Europe','Northern Europe','00000000-0000-0000-0000-000000000000'),
  ('LV','LVA','428','Latvia','Republic of Latvia','Europe','Northern Europe','00000000-0000-0000-0000-000000000000'),
  ('LT','LTU','440','Lithuania','Republic of Lithuania','Europe','Northern Europe','00000000-0000-0000-0000-000000000000'),
  ('NO','NOR','578','Norway','Kingdom of Norway','Europe','Northern Europe','00000000-0000-0000-0000-000000000000'),
  ('SJ','SJM','744','Svalbard and Jan Mayen',null,'Europe','Northern Europe','00000000-0000-0000-0000-000000000000'),
  ('SE','SWE','752','Sweden','Kingdom of Sweden','Europe','Northern Europe','00000000-0000-0000-0000-000000000000'),
  -- Southern Europe
  ('AL','ALB','008','Albania','Republic of Albania','Europe','Southern Europe','00000000-0000-0000-0000-000000000000'),
  ('AD','AND','020','Andorra','Principality of Andorra','Europe','Southern Europe','00000000-0000-0000-0000-000000000000'),
  ('BA','BIH','070','Bosnia and Herzegovina',null,'Europe','Southern Europe','00000000-0000-0000-0000-000000000000'),
  ('HR','HRV','191','Croatia','Republic of Croatia','Europe','Southern Europe','00000000-0000-0000-0000-000000000000'),
  ('GI','GIB','292','Gibraltar',null,'Europe','Southern Europe','00000000-0000-0000-0000-000000000000'),
  ('GR','GRC','300','Greece','Hellenic Republic','Europe','Southern Europe','00000000-0000-0000-0000-000000000000'),
  ('VA','VAT','336','Holy See',null,'Europe','Southern Europe','00000000-0000-0000-0000-000000000000'),
  ('IT','ITA','380','Italy','Italian Republic','Europe','Southern Europe','00000000-0000-0000-0000-000000000000'),
  ('XK','XKX','983','Kosovo','Republic of Kosovo','Europe','Southern Europe','00000000-0000-0000-0000-000000000000'),
  ('MT','MLT','470','Malta','Republic of Malta','Europe','Southern Europe','00000000-0000-0000-0000-000000000000'),
  ('ME','MNE','499','Montenegro',null,'Europe','Southern Europe','00000000-0000-0000-0000-000000000000'),
  ('MK','MKD','807','North Macedonia','Republic of North Macedonia','Europe','Southern Europe','00000000-0000-0000-0000-000000000000'),
  ('PT','PRT','620','Portugal','Portuguese Republic','Europe','Southern Europe','00000000-0000-0000-0000-000000000000'),
  ('SM','SMR','674','San Marino','Republic of San Marino','Europe','Southern Europe','00000000-0000-0000-0000-000000000000'),
  ('RS','SRB','688','Serbia','Republic of Serbia','Europe','Southern Europe','00000000-0000-0000-0000-000000000000'),
  ('SI','SVN','705','Slovenia','Republic of Slovenia','Europe','Southern Europe','00000000-0000-0000-0000-000000000000'),
  ('ES','ESP','724','Spain','Kingdom of Spain','Europe','Southern Europe','00000000-0000-0000-0000-000000000000'),
  -- Western Europe (without DE, which is in §2)
  ('AT','AUT','040','Austria','Republic of Austria','Europe','Western Europe','00000000-0000-0000-0000-000000000000'),
  ('BE','BEL','056','Belgium','Kingdom of Belgium','Europe','Western Europe','00000000-0000-0000-0000-000000000000'),
  ('FR','FRA','250','France','French Republic','Europe','Western Europe','00000000-0000-0000-0000-000000000000'),
  ('LI','LIE','438','Liechtenstein','Principality of Liechtenstein','Europe','Western Europe','00000000-0000-0000-0000-000000000000'),
  ('LU','LUX','442','Luxembourg','Grand Duchy of Luxembourg','Europe','Western Europe','00000000-0000-0000-0000-000000000000'),
  ('MC','MCO','492','Monaco','Principality of Monaco','Europe','Western Europe','00000000-0000-0000-0000-000000000000'),
  ('NL','NLD','528','Netherlands','Kingdom of the Netherlands','Europe','Western Europe','00000000-0000-0000-0000-000000000000'),
  ('CH','CHE','756','Switzerland','Swiss Confederation','Europe','Western Europe','00000000-0000-0000-0000-000000000000')
on conflict (code) do update set
    name          = excluded.name,
    official_name = excluded.official_name,
    region        = excluded.region,
    subregion     = excluded.subregion,
    updated_at    = now(),
    updated_by    = excluded.created_by;

-- ── OCEANIA (without AU, which is in §2) ──
insert into shared.country (code, code3, numeric3, name, official_name, region, subregion, created_by)
values
  ('CX','CXR','162','Christmas Island',null,'Oceania','Australia and New Zealand','00000000-0000-0000-0000-000000000000'),
  ('CC','CCK','166','Cocos (Keeling) Islands',null,'Oceania','Australia and New Zealand','00000000-0000-0000-0000-000000000000'),
  ('HM','HMD','334','Heard Island and McDonald Islands',null,'Oceania','Australia and New Zealand','00000000-0000-0000-0000-000000000000'),
  ('NF','NFK','574','Norfolk Island',null,'Oceania','Australia and New Zealand','00000000-0000-0000-0000-000000000000'),
  ('NZ','NZL','554','New Zealand',null,'Oceania','Australia and New Zealand','00000000-0000-0000-0000-000000000000'),
  -- Melanesia
  ('FJ','FJI','242','Fiji','Republic of Fiji','Oceania','Melanesia','00000000-0000-0000-0000-000000000000'),
  ('NC','NCL','540','New Caledonia',null,'Oceania','Melanesia','00000000-0000-0000-0000-000000000000'),
  ('PG','PNG','598','Papua New Guinea','Independent State of Papua New Guinea','Oceania','Melanesia','00000000-0000-0000-0000-000000000000'),
  ('SB','SLB','090','Solomon Islands',null,'Oceania','Melanesia','00000000-0000-0000-0000-000000000000'),
  ('VU','VUT','548','Vanuatu','Republic of Vanuatu','Oceania','Melanesia','00000000-0000-0000-0000-000000000000'),
  -- Micronesia
  ('GU','GUM','316','Guam',null,'Oceania','Micronesia','00000000-0000-0000-0000-000000000000'),
  ('KI','KIR','296','Kiribati','Republic of Kiribati','Oceania','Micronesia','00000000-0000-0000-0000-000000000000'),
  ('MH','MHL','584','Marshall Islands','Republic of the Marshall Islands','Oceania','Micronesia','00000000-0000-0000-0000-000000000000'),
  ('FM','FSM','583','Micronesia (Federated States of)',null,'Oceania','Micronesia','00000000-0000-0000-0000-000000000000'),
  ('NR','NRU','520','Nauru','Republic of Nauru','Oceania','Micronesia','00000000-0000-0000-0000-000000000000'),
  ('MP','MNP','580','Northern Mariana Islands','Commonwealth of the Northern Mariana Islands','Oceania','Micronesia','00000000-0000-0000-0000-000000000000'),
  ('PW','PLW','585','Palau','Republic of Palau','Oceania','Micronesia','00000000-0000-0000-0000-000000000000'),
  -- Polynesia
  ('AS','ASM','016','American Samoa',null,'Oceania','Polynesia','00000000-0000-0000-0000-000000000000'),
  ('CK','COK','184','Cook Islands',null,'Oceania','Polynesia','00000000-0000-0000-0000-000000000000'),
  ('PF','PYF','258','French Polynesia',null,'Oceania','Polynesia','00000000-0000-0000-0000-000000000000'),
  ('NU','NIU','570','Niue',null,'Oceania','Polynesia','00000000-0000-0000-0000-000000000000'),
  ('PN','PCN','612','Pitcairn',null,'Oceania','Polynesia','00000000-0000-0000-0000-000000000000'),
  ('WS','WSM','882','Samoa','Independent State of Samoa','Oceania','Polynesia','00000000-0000-0000-0000-000000000000'),
  ('TK','TKL','772','Tokelau',null,'Oceania','Polynesia','00000000-0000-0000-0000-000000000000'),
  ('TO','TON','776','Tonga','Kingdom of Tonga','Oceania','Polynesia','00000000-0000-0000-0000-000000000000'),
  ('TV','TUV','798','Tuvalu',null,'Oceania','Polynesia','00000000-0000-0000-0000-000000000000'),
  ('WF','WLF','876','Wallis and Futuna',null,'Oceania','Polynesia','00000000-0000-0000-0000-000000000000')
on conflict (code) do update set
    name          = excluded.name,
    official_name = excluded.official_name,
    region        = excluded.region,
    subregion     = excluded.subregion,
    updated_at    = now(),
    updated_by    = excluded.created_by;

-- ── ANTARCTICA ──
insert into shared.country (code, code3, numeric3, name, official_name, region, subregion, created_by)
values
  ('AQ','ATA','010','Antarctica',null,'Antarctica',null,'00000000-0000-0000-0000-000000000000'),
  ('BV','BVT','074','Bouvet Island',null,'Antarctica',null,'00000000-0000-0000-0000-000000000000'),
  ('TF','ATF','260','French Southern Territories',null,'Antarctica',null,'00000000-0000-0000-0000-000000000000'),
  ('GS','SGS','239','South Georgia and the South Sandwich Islands',null,'Antarctica',null,'00000000-0000-0000-0000-000000000000')
on conflict (code) do update set
    name          = excluded.name,
    official_name = excluded.official_name,
    region        = excluded.region,
    subregion     = excluded.subregion,
    updated_at    = now(),
    updated_by    = excluded.created_by;


-- ============================================================================
-- §2  COUNTRIES WITH EXTENDED PROFILE (phone + postal + address rendering)
-- ============================================================================
-- These 13 countries include full phone dialing, postal validation, and
-- address rendering metadata. Each appears only here — not in §1.
-- ============================================================================

insert into shared.country (
    code, code3, numeric3, name, official_name, region, subregion,
    calling_code, phone_trunk_prefix, phone_national_pattern, phone_example,
    has_postal_codes, postal_code_pattern, postal_code_label, postal_code_example,
    region_label, postal_position, address_format,
    created_by
)
values
  -- Malaysia
  ('MY','MYS','458','Malaysia',null,'Asia','South-eastern Asia',
   '60','0','^[1-9]\d{7,8}$','+60 12-345 6789',
   true,'^\d{5}$','Postcode','50450',
   'State','after_city','line1,line2,line3,city,postal_code,region,country',
   '00000000-0000-0000-0000-000000000000'),

  -- Singapore
  ('SG','SGP','702','Singapore','Republic of Singapore','Asia','South-eastern Asia',
   '65',null,'^[689]\d{7}$','+65 9123 4567',
   true,'^\d{6}$','Postal code','018956',
   'District','after_city','line1,line2,city,postal_code,country',
   '00000000-0000-0000-0000-000000000000'),

  -- Indonesia
  ('ID','IDN','360','Indonesia','Republic of Indonesia','Asia','South-eastern Asia',
   '62','0','^[2-9]\d{6,9}$','+62 21-1234 5678',
   true,'^\d{5}$','Kode Pos','10110',
   'Province','after_city','line1,line2,city,postal_code,region,country',
   '00000000-0000-0000-0000-000000000000'),

  -- United States
  ('US','USA','840','United States of America',null,'Americas','Northern America',
   '1','1','^\d{10}$','+1 (555) 234-5678',
   true,'^\d{5}(-\d{4})?$','ZIP code','90210',
   'State','after_region','line1,line2,city,region,postal_code,country',
   '00000000-0000-0000-0000-000000000000'),

  -- United Kingdom
  ('GB','GBR','826','United Kingdom','United Kingdom of Great Britain and Northern Ireland','Europe','Northern Europe',
   '44','0','^[1-9]\d{9}$','+44 20 7946 0958',
   true,'^[A-Z]{1,2}\d{1,2}[A-Z]?\s?\d[A-Z]{2}$','Postcode','SW1A 1AA',
   'County','after_city','line1,line2,city,postal_code,country',
   '00000000-0000-0000-0000-000000000000'),

  -- Germany
  ('DE','DEU','276','Germany','Federal Republic of Germany','Europe','Western Europe',
   '49','0','^[1-9]\d{9,11}$','+49 30 12345678',
   true,'^\d{5}$','PLZ','10115',
   'State','before_city','line1,line2,postal_code,city,country',
   '00000000-0000-0000-0000-000000000000'),

  -- Japan
  ('JP','JPN','392','Japan',null,'Asia','Eastern Asia',
   '81','0','^[789]0\d{8}$','+81 90-1234-5678',
   true,'^\d{3}-\d{4}$','郵便番号','100-0001',
   'Prefecture','before_city','postal_code,region,city,line2,line1,country',
   '00000000-0000-0000-0000-000000000000'),

  -- China
  ('CN','CHN','156','China','People''s Republic of China','Asia','Eastern Asia',
   '86','0','^1[3-9]\d{9}$','+86 138 0013 8000',
   true,'^\d{6}$','邮政编码','100000',
   'Province','before_city','country,region,city,line2,line1,postal_code',
   '00000000-0000-0000-0000-000000000000'),

  -- India
  ('IN','IND','356','India','Republic of India','Asia','Southern Asia',
   '91','0','^[6-9]\d{9}$','+91 98765 43210',
   true,'^\d{6}$','PIN','110001',
   'State','after_city','line1,line2,city,postal_code,region,country',
   '00000000-0000-0000-0000-000000000000'),

  -- Australia
  ('AU','AUS','036','Australia','Commonwealth of Australia','Oceania','Australia and New Zealand',
   '61','0','^[24789]\d{8}$','+61 2 1234 5678',
   true,'^\d{4}$','Postcode','2000',
   'State','after_region','line1,line2,city,region,postal_code,country',
   '00000000-0000-0000-0000-000000000000'),

  -- Hong Kong (no postal codes)
  ('HK','HKG','344','Hong Kong','Hong Kong Special Administrative Region of China','Asia','Eastern Asia',
   '852',null,'^[2-9]\d{7}$','+852 9123 4567',
   false,null,'Postal code',null,
   'District','none','line1,line2,city,region,country',
   '00000000-0000-0000-0000-000000000000'),

  -- United Arab Emirates (no postal codes)
  ('AE','ARE','784','United Arab Emirates',null,'Asia','Western Asia',
   '971','0','^[0-9]\d{8}$','+971 50 123 4567',
   false,null,'Postal code',null,
   'Emirate','none','line1,line2,city,region,country',
   '00000000-0000-0000-0000-000000000000'),

  -- Macao (no postal codes)
  ('MO','MAC','446','Macao','Macao Special Administrative Region of China','Asia','Eastern Asia',
   '853',null,'^[6]\d{7}$','+853 6123 4567',
   false,null,'Postal code',null,
   'Region','none','line1,line2,city,country',
   '00000000-0000-0000-0000-000000000000')

on conflict (code) do update set
    name                   = excluded.name,
    official_name          = excluded.official_name,
    region                 = excluded.region,
    subregion              = excluded.subregion,
    calling_code           = excluded.calling_code,
    phone_trunk_prefix     = excluded.phone_trunk_prefix,
    phone_national_pattern = excluded.phone_national_pattern,
    phone_example          = excluded.phone_example,
    has_postal_codes       = excluded.has_postal_codes,
    postal_code_pattern    = excluded.postal_code_pattern,
    postal_code_label      = excluded.postal_code_label,
    postal_code_example    = excluded.postal_code_example,
    region_label           = excluded.region_label,
    postal_position        = excluded.postal_position,
    address_format         = excluded.address_format,
    updated_at             = now(),
    updated_by             = excluded.created_by;


-- ============================================================================
-- §3  EXTENDED PROFILES — all remaining countries (§1 base rows)
-- UPDATE only; base INSERT from §1 already set the ISO columns.
-- Idempotent: always runs; re-running propagates any corrections.
-- §2 countries (MY, SG, ID, US, GB, DE, JP, CN, IN, AU, HK, AE, MO) are
-- included in the VALUES list but will simply overwrite with identical data
-- on re-runs — harmless, keeps this list as the single source of truth.
-- ============================================================================

UPDATE shared.country SET
    calling_code            = v.calling_code,
    phone_trunk_prefix      = v.phone_trunk_prefix,
    phone_national_pattern  = v.phone_national_pattern,
    phone_example           = v.phone_example,
    has_postal_codes        = v.has_postal_codes,
    postal_code_pattern     = v.postal_code_pattern,
    postal_code_label       = v.postal_code_label,
    postal_code_example     = v.postal_code_example,
    region_label            = v.region_label,
    postal_position         = v.postal_position,
    address_format          = v.address_format
FROM ( VALUES
  ('AD', '376', null, '^[36]\d{5}$', '+376 312 345', true, '^AD\d{3}$', 'Codi postal', 'AD500', 'Parish', 'after_city', 'line1,line2,postal_code,city,parish,country'),
  ('AF', '93', '0', '^[7]\d{8}$', '+93 70 123 4567', true, '^\d{4}$', 'Postal code', '1001', 'Province', 'after_city', 'line1,line2,city,postal_code,province,country'),
  ('AG', '1268', null, '^268[0-9]{7}$', '+1 268 464 1234', false, null, 'Postal code', null, 'Parish', 'none', 'line1,line2,city,parish,country'),
  ('AI', '1264', null, '^264[0-9]{7}$', '+1 264 235 1234', true, '^AI\-2640$', 'Postal code', 'AI-2640', 'District', 'after_city', 'line1,line2,city,postal_code,country'),
  ('AL', '355', '0', '^6[78]\d{7}$', '+355 67 212 3456', true, '^\d{4}$', 'Postal code', '1001', 'County', 'after_city', 'line1,line2,city,postal_code,county,country'),
  ('AM', '374', '0', '^[59]\d{7}$', '+374 91 234 567', true, '^\d{4}$', 'Postal code', '0010', 'Region', 'after_city', 'line1,line2,city,postal_code,region,country'),
  ('AO', '244', null, '^[9]\d{8}$', '+244 923 123 456', false, null, 'Postal code', null, 'Province', 'none', 'line1,line2,city,region,country'),
  ('AQ', '672', null, null, null, false, null, 'Postal code', null, 'Territory', 'none', 'line1,line2,city,country'),
  ('AR', '54', '0', '^[1-9]\d{9}$', '+54 11 1234 5678', true, '^[A-Z]\d{4}[A-Z]{3}$', 'Código postal', 'C1002AAB', 'Province', 'after_city', 'line1,line2,postal_code,city,province,country'),
  ('AS', '1684', null, '^684[0-9]{7}$', '+1 684 633 1234', true, '^\d{5}(-\d{4})?$', 'ZIP code', '96799', 'Territory', 'after_city', 'line1,line2,city,state,postal_code,country'),
  ('AT', '43', '0', '^6[5-9]\d{7}$', '+43 664 123 4567', true, '^\d{4}$', 'Postleitzahl', '1010', 'State', 'before_city', 'line1,line2,postal_code,city,state,country'),
  ('AW', '297', null, '^[569]\d{6}$', '+297 560 1234', false, null, 'Postal code', null, 'District', 'none', 'line1,line2,city,district,country'),
  ('AX', '358', '0', '^[45]\d{8}$', '+358 40 123 4567', true, '^\d{5}$', 'Postnummer', '22100', 'Municipality', 'after_city', 'line1,line2,postal_code,city,country'),
  ('AZ', '994', '0', '^[5]\d{8}$', '+994 50 123 45 67', true, '^AZ\s?\d{4}$', 'Postal code', 'AZ 1000', 'Region', 'after_city', 'line1,line2,city,postal_code,region,country'),
  ('BA', '387', '0', '^[6]\d{7}$', '+387 61 234 567', true, '^\d{5}$', 'Poštanski broj', '71000', 'Entity', 'after_city', 'line1,line2,city,postal_code,entity,country'),
  ('BB', '1246', null, '^246[0-9]{7}$', '+1 246 230 1234', true, '^BB\d{5}$', 'Postal code', 'BB15156', 'Parish', 'after_city', 'line1,line2,city,postal_code,parish,country'),
  ('BD', '880', '0', '^1[3-9]\d{8}$', '+880 1312 345678', true, '^\d{4}$', 'Postal code', '1000', 'Division', 'after_city', 'line1,line2,city,postal_code,division,country'),
  ('BE', '32', '0', '^4[5-9]\d{7}$', '+32 470 12 34 56', true, '^\d{4}$', 'Postcode / Code postal', '1000', 'Province', 'after_city', 'line1,line2,postal_code,city,province,country'),
  ('BF', '226', null, '^[6-7]\d{7}$', '+226 70 12 34 56', false, null, 'Postal code', null, 'Region', 'none', 'line1,line2,city,region,country'),
  ('BG', '359', '0', '^[89]\d{8}$', '+359 87 123 4567', true, '^\d{4}$', 'Postal code', '1000', 'Province', 'after_city', 'line1,line2,city,postal_code,province,country'),
  ('BH', '973', null, '^[3]\d{7}$', '+973 3600 1234', true, '^\d{3,4}$', 'Postal code', '316', 'Governorate', 'after_city', 'line1,line2,city,postal_code,governorate,country'),
  ('BI', '257', null, '^[7]\d{7}$', '+257 79 123 456', false, null, 'Postal code', null, 'Province', 'none', 'line1,line2,city,region,country'),
  ('BJ', '229', null, '^[4-9]\d{7}$', '+229 96 12 34 56', false, null, 'Postal code', null, 'Department', 'none', 'line1,line2,city,region,country'),
  ('BL', '590', null, '^590\d{6}$', '+590 690 12 34 56', true, '^\d{5}$', 'Code postal', '97133', 'Collectivity', 'after_city', 'line1,line2,postal_code,city,country'),
  ('BM', '1441', null, '^441[0-9]{7}$', '+1 441 292 1234', true, '^[A-Z]{2}\s\d{2}$', 'Postal code', 'HM 12', 'Parish', 'after_city', 'line1,line2,city,postal_code,country'),
  ('BN', '673', null, '^[278]\d{6}$', '+673 712 3456', true, '^[A-Z]{2}\d{4}$', 'Postcode', 'BU1234', 'District', 'after_city', 'line1,line2,city,postal_code,district,country'),
  ('BO', '591', null, '^[67]\d{7}$', '+591 71 234 567', true, '^\d{4}$', 'Código postal', '0200', 'Department', 'after_city', 'line1,line2,city,postal_code,department,country'),
  ('BQ', '599', null, '^[0-9]{7}$', '+599 318 1234', true, '^\d{4}[A-Z]{2}$', 'Postcode', '1234AB', 'Island', 'after_city', 'line1,line2,postal_code,city,island,country'),
  ('BR', '55', '0', '^[1-9]\d{10}$', '+55 11 91234 5678', true, '^\d{5}-?\d{3}$', 'CEP', '01310-100', 'State', 'after_city', 'line1,line2,city,state,postal_code,country'),
  ('BS', '1242', null, '^242[0-9]{7}$', '+1 242 359 1234', false, null, 'Postal code', null, 'Island', 'none', 'line1,line2,city,island,country'),
  ('BT', '975', null, '^[1-8]\d{6}$', '+975 17 123 456', true, '^\d{5}$', 'Postal code', '11001', 'Dzongkhag', 'after_city', 'line1,line2,city,postal_code,dzongkhag,country'),
  ('BV', '47', null, null, null, false, null, 'Postal code', null, 'Territory', 'none', 'line1,line2,city,country'),
  ('BW', '267', null, '^[7]\d{7}$', '+267 71 123 456', false, null, 'Postal code', null, 'District', 'none', 'line1,line2,city,region,country'),
  ('BY', '375', '80', '^[2-9]\d{8}$', '+375 29 123 45 67', true, '^\d{6}$', 'Postal code', '220000', 'Region', 'after_city', 'line1,line2,city,postal_code,region,country'),
  ('BZ', '501', null, '^[6]\d{7}$', '+501 622 1234', false, null, 'Postal code', null, 'District', 'none', 'line1,line2,city,district,country'),
  ('CA', '1', '1', '^[2-9]\d{9}$', '+1 416 123 4567', true, '^[A-Z]\d[A-Z]\s?\d[A-Z]\d$', 'Postal code', 'K1A 0A6', 'Province', 'after_region', 'line1,line2,city,province,postal_code,country'),
  ('CC', '61', '0', '^[24789]\d{8}$', '+61 8 9162 6649', true, '^6799$', 'Postal code', '6799', 'Territory', 'after_city', 'line1,line2,city,postal_code,country'),
  ('CD', '243', null, '^[89]\d{8}$', '+243 81 234 5678', false, null, 'Postal code', null, 'Province', 'none', 'line1,line2,city,region,country'),
  ('CF', '236', null, '^[7]\d{7}$', '+236 72 12 34 56', false, null, 'Postal code', null, 'Prefecture', 'none', 'line1,line2,city,region,country'),
  ('CG', '242', null, '^[0]\d{8}$', '+242 06 612 34 56', false, null, 'Postal code', null, 'Department', 'none', 'line1,line2,city,region,country'),
  ('CH', '41', '0', '^7[5-9]\d{7}$', '+41 76 123 45 67', true, '^\d{4}$', 'PLZ / NPA / CAP', '8001', 'Canton', 'before_city', 'line1,line2,postal_code,city,canton,country'),
  ('CI', '225', null, '^[0][1-9]\d{7}$', '+225 07 12 34 56 78', false, null, 'Postal code', null, 'District', 'none', 'line1,line2,city,district,country'),
  ('CK', '682', null, '^[2-8]\d{4}$', '+682 55890', false, null, 'Postal code', null, 'Island', 'none', 'line1,line2,city,island,country'),
  ('CL', '56', '0', '^9\d{8}$', '+56 9 1234 5678', true, '^\d{7}$', 'Código postal', '7500000', 'Region', 'after_city', 'line1,line2,city,postal_code,region,country'),
  ('CM', '237', null, '^[6]\d{8}$', '+237 6 71 23 45 67', false, null, 'Postal code', null, 'Region', 'none', 'line1,line2,city,region,country'),
  ('CO', '57', '0', '^3\d{9}$', '+57 312 345 6789', true, '^\d{6}$', 'Código postal', '110111', 'Department', 'after_city', 'line1,line2,city,postal_code,department,country'),
  ('CR', '506', null, '^[68]\d{7}$', '+506 6123 4567', true, '^\d{5}$', 'Código postal', '10101', 'Province', 'after_city', 'line1,line2,city,postal_code,province,country'),
  ('CU', '53', null, '^[5]\d{7}$', '+53 5 123 4567', true, '^\d{5}$', 'Código postal', '10400', 'Province', 'after_city', 'line1,line2,city,postal_code,province,country'),
  ('CV', '238', null, '^[59]\d{6}$', '+238 991 12 34', true, '^\d{4}$', 'Código Postal', '7600', 'Island', 'after_city', 'line1,line2,city,postal_code,island,country'),
  ('CW', '599', null, '^[0-9]{7}$', '+599 9 518 1234', false, null, 'Postal code', null, 'District', 'none', 'line1,line2,city,district,country'),
  ('CX', '61', '0', '^[24789]\d{8}$', '+61 8 9164 8300', true, '^6798$', 'Postal code', '6798', 'Territory', 'after_city', 'line1,line2,city,postal_code,country'),
  ('CY', '357', null, '^9[5-9]\d{6}$', '+357 96 123 456', true, '^\d{4}$', 'Postal code', '1011', 'District', 'after_city', 'line1,line2,city,postal_code,district,country'),
  ('CZ', '420', null, '^[67]\d{8}$', '+420 601 234 567', true, '^\d{3}\s?\d{2}$', 'PSČ', '110 00', 'Region', 'before_city', 'line1,line2,postal_code,city,region,country'),
  ('DJ', '253', null, '^[7]\d{7}$', '+253 77 12 34 56', false, null, 'Postal code', null, 'Region', 'none', 'line1,line2,city,region,country'),
  ('DK', '45', null, '^[2-9]\d{7}$', '+45 20 12 34 56', true, '^\d{4}$', 'Postnummer', '1050', 'Region', 'after_city', 'line1,line2,postal_code,city,region,country'),
  ('DM', '1767', null, '^767[0-9]{7}$', '+1 767 448 1234', false, null, 'Postal code', null, 'Parish', 'none', 'line1,line2,city,parish,country'),
  ('DO', '1809', null, '^[0-9]{10}$', '+1 809 234 5678', true, '^\d{5}$', 'Código postal', '10101', 'Province', 'after_city', 'line1,line2,city,postal_code,province,country'),
  ('DZ', '213', '0', '^[5-7]\d{8}$', '+213 5 55 12 34 56', true, '^\d{5}$', 'Code postal', '16000', 'Province', 'after_city', 'line1,line2,city,postal_code,region,country'),
  ('EC', '593', '0', '^9\d{8}$', '+593 99 123 4567', true, '^\d{6}$', 'Código postal', '170517', 'Province', 'after_city', 'line1,line2,city,postal_code,province,country'),
  ('EE', '372', null, '^[5]\d{6,7}$', '+372 5123 4567', true, '^\d{5}$', 'Postiindeks', '10111', 'County', 'after_city', 'line1,line2,city,postal_code,county,country'),
  ('EG', '20', '0', '^1[0125]\d{8}$', '+20 10 0123 4567', true, '^\d{5}$', 'Postal code', '11511', 'Governorate', 'after_city', 'line1,line2,city,postal_code,governorate,country'),
  ('EH', '212', null, null, null, false, null, 'Postal code', null, 'Region', 'none', 'line1,line2,city,region,country'),
  ('ER', '291', null, '^[7]\d{6}$', '+291 7 123 456', false, null, 'Postal code', null, 'Region', 'none', 'line1,line2,city,region,country'),
  ('ES', '34', null, '^[67]\d{8}$', '+34 612 345 678', true, '^\d{5}$', 'Código postal', '28001', 'Province', 'after_city', 'line1,line2,city,postal_code,province,country'),
  ('ET', '251', '0', '^[79]\d{8}$', '+251 91 123 4567', true, '^\d{4}$', 'Postal code', '1000', 'Region', 'after_city', 'line1,line2,city,postal_code,region,country'),
  ('FI', '358', '0', '^[45]\d{8}$', '+358 40 123 4567', true, '^\d{5}$', 'Postinumero', '00100', 'Region', 'after_city', 'line1,line2,postal_code,city,region,country'),
  ('FJ', '679', null, '^[89]\d{6}$', '+679 912 3456', false, null, 'Postal code', null, 'Division', 'none', 'line1,line2,city,division,country'),
  ('FK', '500', null, '^[56]\d{4}$', '+500 52000', true, '^FIQQ\s1ZZ$', 'Postal code', 'FIQQ 1ZZ', 'Settlement', 'after_city', 'line1,line2,city,postal_code,country'),
  ('FM', '691', null, '^[349]\d{6}$', '+691 320 2228', true, '^\d{5}$', 'ZIP code', '96941', 'State', 'after_city', 'line1,line2,city,state,postal_code,country'),
  ('FO', '298', null, '^[2-9]\d{5}$', '+298 212 345', true, '^\d{3}$', 'Postnr.', '100', 'Municipality', 'after_city', 'line1,line2,postal_code,city,country'),
  ('FR', '33', '0', '^[67]\d{8}$', '+33 6 12 34 56 78', true, '^\d{5}$', 'Code postal', '75001', 'Region', 'before_city', 'line1,line2,postal_code,city,region,country'),
  ('GA', '241', null, '^[06]\d{7}$', '+241 06 12 34 56', false, null, 'Postal code', null, 'Province', 'none', 'line1,line2,city,province,country'),
  ('GD', '1473', null, '^473[0-9]{7}$', '+1 473 440 1234', false, null, 'Postal code', null, 'Parish', 'none', 'line1,line2,city,parish,country'),
  ('GE', '995', '0', '^5[5-9]\d{7}$', '+995 555 01 23 45', true, '^\d{4}$', 'Postal code', '0100', 'Region', 'after_city', 'line1,line2,city,postal_code,region,country'),
  ('GF', '594', '0', '^694\d{6}$', '+594 694 12 34 56', true, '^\d{5}$', 'Code postal', '97300', 'Department', 'after_city', 'line1,line2,postal_code,city,country'),
  ('GG', '44', null, '^1481\d{6}$', '+44 1481 256789', true, '^GY\d{1,2}\s\d[A-Z]{2}$', 'Postcode', 'GY1 1AA', 'Parish', 'after_city', 'line1,line2,city,postal_code,country'),
  ('GH', '233', '0', '^[2-5]\d{8}$', '+233 24 123 4567', true, '^[A-Z]{2}\d{4}$', 'Digital address', 'GA184', 'Region', 'after_city', 'line1,line2,city,digital_address,region,country'),
  ('GI', '350', null, '^[5]\d{7}$', '+350 57123456', true, '^GX11\s1AA$', 'Postcode', 'GX11 1AA', 'District', 'after_city', 'line1,line2,city,postal_code,country'),
  ('GL', '299', null, '^[2-9]\d{5}$', '+299 321 234', true, '^\d{4}$', 'Postnummer', '3900', 'Municipality', 'after_city', 'line1,line2,city,postal_code,country'),
  ('GM', '220', null, '^[23]\d{6}$', '+220 301 2345', false, null, 'Postal code', null, 'Division', 'none', 'line1,line2,city,division,country'),
  ('GN', '224', null, '^[6]\d{8}$', '+224 62 12 34 567', false, null, 'Postal code', null, 'Region', 'none', 'line1,line2,city,region,country'),
  ('GP', '590', '0', '^590\d{6}$', '+590 690 12 34 56', true, '^\d{5}$', 'Code postal', '97100', 'Department', 'after_city', 'line1,line2,postal_code,city,country'),
  ('GQ', '240', null, '^[23]\d{8}$', '+240 222 123 456', false, null, 'Postal code', null, 'Province', 'none', 'line1,line2,city,province,country'),
  ('GR', '30', null, '^6[89]\d{8}$', '+30 697 123 4567', true, '^\d{3}\s?\d{2}$', 'Ταχυδρομικός κώδικας', '105 57', 'Region', 'after_city', 'line1,line2,postal_code,city,region,country'),
  ('GS', '500', null, null, null, true, '^SIQQ\s1ZZ$', 'Postal code', 'SIQQ 1ZZ', 'Territory', 'after_city', 'line1,line2,city,postal_code,country'),
  ('GT', '502', null, '^[345]\d{7}$', '+502 5123 4567', true, '^\d{5}$', 'Código postal', '01001', 'Department', 'after_city', 'line1,line2,city,postal_code,department,country'),
  ('GU', '1671', null, '^671[0-9]{7}$', '+1 671 632 1234', true, '^\d{5}(-\d{4})?$', 'ZIP code', '96910', 'Territory', 'after_city', 'line1,line2,city,state,postal_code,country'),
  ('GW', '245', null, '^[9]\d{7}$', '+245 955 123 456', false, null, 'Postal code', null, 'Region', 'none', 'line1,line2,city,region,country'),
  ('GY', '592', null, '^6\d{6}$', '+592 612 3456', false, null, 'Postal code', null, 'Region', 'none', 'line1,line2,city,region,country'),
  ('HM', '672', null, null, null, false, null, 'Postal code', null, 'Territory', 'none', 'line1,line2,city,country'),
  ('HN', '504', null, '^[89]\d{7}$', '+504 9123 4567', true, '^\d{5}$', 'Código postal', '11101', 'Department', 'after_city', 'line1,line2,city,postal_code,department,country'),
  ('HR', '385', '0', '^9[1-9]\d{7}$', '+385 91 234 5678', true, '^HR-\d{5}$', 'Poštanski broj', 'HR-10000', 'County', 'after_city', 'line1,line2,postal_code,city,county,country'),
  ('HT', '509', null, '^[34]\d{7}$', '+509 34 12 3456', true, '^\d{4}$', 'Code postal', 'HT6120', 'Department', 'after_city', 'line1,line2,city,postal_code,department,country'),
  ('HU', '36', '06', '^[27]\d{8}$', '+36 20 123 4567', true, '^\d{4}$', 'Irányítószám', '1011', 'County', 'before_city', 'line1,line2,postal_code,city,county,country'),
  ('IE', '353', '0', '^8[3-9]\d{7}$', '+353 87 123 4567', true, '^[A-Z]\d{2}\s?[A-Z0-9]{4}$', 'Eircode', 'D01 W5Y6', 'County', 'after_city', 'line1,line2,city,county,eircode,country'),
  ('IL', '972', '0', '^5[02-9]\d{7}$', '+972 50 123 4567', true, '^\d{7}$', 'Postal code', '9100101', 'District', 'after_city', 'line1,line2,city,postal_code,district,country'),
  ('IM', '44', null, '^1624\d{6}$', '+44 1624 696300', true, '^IM\d{1,2}\s\d[A-Z]{2}$', 'Postcode', 'IM1 1AA', 'Sheading', 'after_city', 'line1,line2,city,postal_code,country'),
  ('IQ', '964', '0', '^7[5789]\d{8}$', '+964 750 123 4567', true, '^\d{5}$', 'Postal code', '10011', 'Governorate', 'after_city', 'line1,line2,city,postal_code,governorate,country'),
  ('IR', '98', '0', '^9[0-39]\d{8}$', '+98 912 345 6789', true, '^\d{5}-\d{5}$', 'کد پستی', '11359-36411', 'Province', 'after_city', 'line1,line2,city,postal_code,province,country'),
  ('IS', '354', null, '^[5-9]\d{6}$', '+354 611 1234', true, '^\d{3}$', 'Póstnúmer', '101', 'Region', 'after_city', 'line1,line2,postal_code,city,region,country'),
  ('IT', '39', '0', '^3\d{9}$', '+39 312 345 6789', true, '^\d{5}$', 'CAP', '00100', 'Region', 'after_city', 'line1,line2,postal_code,city,region,country'),
  ('JE', '44', null, '^1534\d{6}$', '+44 1534 123456', true, '^JE\d{1,2}\s\d[A-Z]{2}$', 'Postcode', 'JE1 1AA', 'Parish', 'after_city', 'line1,line2,city,postal_code,country'),
  ('JM', '1876', null, '^876[0-9]{7}$', '+1 876 612 1234', true, '^JM[A-Z]{3}\d{2}$', 'Postal code', 'JMAAW01', 'Parish', 'after_city', 'line1,line2,city,postal_code,parish,country'),
  ('JO', '962', '0', '^7[789]\d{7}$', '+962 79 123 4567', true, '^\d{5}$', 'Postal code', '11118', 'Governorate', 'after_city', 'line1,line2,city,postal_code,governorate,country'),
  ('KE', '254', '0', '^[17]\d{8}$', '+254 712 345 678', true, '^\d{5}$', 'Postal code', '00100', 'County', 'after_city', 'line1,line2,city,postal_code,county,country'),
  ('KG', '996', '0', '^[57]\d{8}$', '+996 700 123 456', true, '^\d{6}$', 'Postal code', '720000', 'Oblast', 'after_city', 'line1,line2,city,postal_code,oblast,country'),
  ('KH', '855', '0', '^[1-9]\d{7,8}$', '+855 12 345 678', true, '^\d{5}$', 'Postal code', '12201', 'Province', 'after_city', 'line1,line2,city,postal_code,province,country'),
  ('KI', '686', null, '^[2-8]\d{4}$', '+686 72012', false, null, 'Postal code', null, 'Island', 'none', 'line1,line2,city,island,country'),
  ('KM', '269', null, '^[3]\d{6}$', '+269 321 23 45', false, null, 'Postal code', null, 'Island', 'none', 'line1,line2,city,island,country'),
  ('KN', '1869', null, '^869[0-9]{7}$', '+1 869 465 1234', true, '^KN\d{4}$', 'Postal code', 'KN0101', 'Island', 'after_city', 'line1,line2,city,postal_code,island,country'),
  ('KP', '850', null, null, null, true, '^\d{6}$', 'Postal code', '950003', 'Province', 'after_city', 'line1,line2,city,postal_code,province,country'),
  ('KR', '82', '0', '^1[0-9]\d{7,8}$', '+82 10 1234 5678', true, '^\d{5}$', '우편번호', '03051', 'Province', 'before_city', 'postal_code,province,city,line2,line1,country'),
  ('KW', '965', null, '^[569]\d{7}$', '+965 5000 1234', true, '^\d{5}$', 'Postal code', '13001', 'Governorate', 'after_city', 'line1,line2,city,postal_code,governorate,country'),
  ('KY', '1345', null, '^345[0-9]{7}$', '+1 345 949 1234', true, '^KY[1-3]-[0-9]{4}$', 'Postal code', 'KY1-1100', 'District', 'after_city', 'line1,line2,city,postal_code,country'),
  ('KZ', '7', '8', '^[67]\d{9}$', '+7 701 234 5678', true, '^\d{6}$', 'Postal code', '050000', 'Region', 'after_city', 'line1,line2,city,postal_code,region,country'),
  ('LA', '856', '0', '^[2]\d{7}$', '+856 20 23 456 789', true, '^\d{5}$', 'Postal code', '01000', 'Province', 'after_city', 'line1,line2,city,postal_code,province,country'),
  ('LB', '961', '0', '^[37]\d{7}$', '+961 71 123 456', true, '^\d{4,5}$', 'Postal code', '1107 2810', 'Governorate', 'after_city', 'line1,line2,city,postal_code,governorate,country'),
  ('LC', '1758', null, '^758[0-9]{7}$', '+1 758 450 1234', true, '^LC\d{2}\s\d{3}$', 'Postal code', 'LC04 201', 'Quarter', 'after_city', 'line1,line2,city,postal_code,country'),
  ('LI', '423', null, '^[67]\d{6}$', '+423 660 1234', true, '^\d{4}$', 'Postleitzahl', '9490', 'Municipality', 'before_city', 'line1,line2,postal_code,city,municipality,country'),
  ('LK', '94', '0', '^7[1-8]\d{7}$', '+94 71 234 5678', true, '^\d{5}$', 'Postal code', '00100', 'Province', 'after_city', 'line1,line2,city,postal_code,province,country'),
  ('LR', '231', null, '^[07]\d{8}$', '+231 770 12 3456', false, null, 'Postal code', null, 'County', 'none', 'line1,line2,city,county,country'),
  ('LS', '266', null, '^[5-8]\d{7}$', '+266 5812 3456', true, '^\d{3}$', 'Postal code', '100', 'District', 'after_city', 'line1,line2,city,postal_code,district,country'),
  ('LT', '370', '8', '^6\d{7}$', '+370 612 34567', true, '^LT-\d{5}$', 'Pašto kodas', 'LT-01100', 'County', 'after_city', 'line1,line2,city,postal_code,county,country'),
  ('LU', '352', null, '^6[2-9]\d{6}$', '+352 621 123 456', true, '^L-\d{4}$', 'Code postal', 'L-1011', 'Canton', 'after_city', 'line1,line2,postal_code,city,canton,country'),
  ('LV', '371', null, '^2\d{7}$', '+371 21 234 567', true, '^LV-\d{4}$', 'Pasta indekss', 'LV-1001', 'Region', 'after_city', 'line1,line2,city,postal_code,region,country'),
  ('LY', '218', null, '^9[12]\d{7}$', '+218 91 234 5678', true, '^\d{5}$', 'Postal code', '21131', 'District', 'after_city', 'line1,line2,city,postal_code,district,country'),
  ('MA', '212', '0', '^[67]\d{8}$', '+212 6 12 34 56 78', true, '^\d{5}$', 'Code postal', '20000', 'Region', 'after_city', 'line1,line2,city,postal_code,region,country'),
  ('MC', '377', null, '^6\d{8}$', '+377 6 12 34 56 78', true, '^980\d{2}$', 'Code postal', '98000', 'Ward', 'after_city', 'line1,line2,postal_code,city,country'),
  ('MD', '373', '0', '^[567]\d{7}$', '+373 601 23 456', true, '^MD-\d{4}$', 'Postal code', 'MD-2001', 'District', 'after_city', 'line1,line2,city,postal_code,district,country'),
  ('ME', '382', '0', '^6[7-9]\d{6}$', '+382 67 123 456', true, '^\d{5}$', 'Postal code', '81000', 'Municipality', 'after_city', 'line1,line2,city,postal_code,municipality,country'),
  ('MF', '590', null, '^590\d{6}$', '+590 690 12 34 56', true, '^\d{5}$', 'Code postal', '97150', 'Collectivity', 'after_city', 'line1,line2,postal_code,city,country'),
  ('MG', '261', '0', '^3[2-9]\d{7}$', '+261 32 12 345 67', true, '^\d{3}$', 'Code postal', '101', 'Province', 'after_city', 'line1,line2,city,postal_code,province,country'),
  ('MH', '692', null, '^[247]\d{6}$', '+692 455 1234', true, '^\d{5}$', 'ZIP code', '96960', 'Atoll', 'after_city', 'line1,line2,city,postal_code,country'),
  ('MK', '389', '0', '^7[0-9]\d{6}$', '+389 70 123 456', true, '^\d{4}$', 'Поштенски број', '1000', 'Municipality', 'after_city', 'line1,line2,city,postal_code,municipality,country'),
  ('ML', '223', null, '^[567]\d{7}$', '+223 65 12 34 56', false, null, 'Postal code', null, 'Region', 'none', 'line1,line2,city,region,country'),
  ('MM', '95', '0', '^[9]\d{9}$', '+95 9 123 456 789', true, '^\d{5}$', 'Postal code', '11041', 'Region', 'after_city', 'line1,line2,city,postal_code,region,country'),
  ('MN', '976', null, '^[89]\d{7}$', '+976 8812 3456', true, '^\d{5}$', 'Postal code', '14200', 'Province', 'after_city', 'line1,line2,city,postal_code,province,country'),
  ('MP', '1670', null, '^670[0-9]{7}$', '+1 670 664 1234', true, '^\d{5}$', 'ZIP code', '96950', 'Municipality', 'after_city', 'line1,line2,city,state,postal_code,country'),
  ('MQ', '596', '0', '^596\d{6}$', '+596 696 12 34 56', true, '^\d{5}$', 'Code postal', '97200', 'Department', 'after_city', 'line1,line2,postal_code,city,country'),
  ('MR', '222', null, '^[2-4]\d{7}$', '+222 22 12 34 56', true, '^\d{4}$', 'Code postal', '18011', 'Region', 'after_city', 'line1,line2,city,postal_code,region,country'),
  ('MS', '1664', null, '^664[0-9]{7}$', '+1 664 491 1234', true, '^MSR\d{4}$', 'Postal code', 'MSR1120', 'District', 'after_city', 'line1,line2,city,postal_code,country'),
  ('MT', '356', null, '^[79]\d{7}$', '+356 7912 3456', true, '^[A-Z]{3}\s?\d{4}$', 'Postal code', 'VLT 1117', 'Region', 'after_city', 'line1,line2,city,postal_code,region,country'),
  ('MU', '230', null, '^[25]\d{7}$', '+230 5 123 4567', true, '^\d{5}$', 'Postal code', '20101', 'District', 'after_city', 'line1,line2,city,postal_code,district,country'),
  ('MV', '960', null, '^[7-9]\d{6}$', '+960 777 1234', true, '^\d{5}$', 'Postal code', '20026', 'Atoll', 'after_city', 'line1,line2,city,postal_code,atoll,country'),
  ('MW', '265', '0', '^[89]\d{8}$', '+265 881 234 567', false, null, 'Postal code', null, 'Region', 'none', 'line1,line2,city,region,country'),
  ('MX', '52', '1', '^1?\d{10}$', '+52 55 1234 5678', true, '^\d{5}$', 'Código postal', '06600', 'State', 'before_city', 'line1,line2,city,postal_code,state,country'),
  ('MZ', '258', null, '^[8]\d{8}$', '+258 82 123 4567', true, '^\d{4}$', 'Código Postal', '1100', 'Province', 'after_city', 'line1,line2,city,postal_code,province,country'),
  ('NA', '264', '0', '^[68]\d{8}$', '+264 81 123 4567', false, null, 'Postal code', null, 'Region', 'none', 'line1,line2,city,region,country'),
  ('NC', '687', null, '^[689]\d{5}$', '+687 91 23 45', true, '^\d{5}$', 'Code postal', '98800', 'Province', 'after_city', 'line1,line2,postal_code,city,province,country'),
  ('NE', '227', null, '^[89]\d{7}$', '+227 90 12 34 56', false, null, 'Postal code', null, 'Region', 'none', 'line1,line2,city,region,country'),
  ('NF', '672', '1', '^3\d{4}$', '+672 13230', true, '^2899$', 'Postal code', '2899', 'Territory', 'after_city', 'line1,line2,city,postal_code,country'),
  ('NG', '234', '0', '^[789]\d{9}$', '+234 802 123 4567', true, '^\d{6}$', 'Postal code', '100001', 'State', 'after_city', 'line1,line2,city,postal_code,state,country'),
  ('NI', '505', null, '^[58]\d{7}$', '+505 8123 4567', true, '^\d{5}$', 'Código postal', '11001', 'Department', 'after_city', 'line1,line2,city,postal_code,department,country'),
  ('NL', '31', '0', '^6\d{8}$', '+31 6 12345678', true, '^\d{4}\s?[A-Z]{2}$', 'Postcode', '1011 AB', 'Province', 'after_city', 'line1,line2,postal_code,city,province,country'),
  ('NO', '47', null, '^[49]\d{7}$', '+47 400 12 345', true, '^\d{4}$', 'Postnummer', '0101', 'County', 'after_city', 'line1,line2,postal_code,city,county,country'),
  ('NP', '977', '0', '^9[78]\d{8}$', '+977 984 123 4567', true, '^\d{5}$', 'Postal code', '44600', 'Province', 'after_city', 'line1,line2,city,postal_code,province,country'),
  ('NR', '674', null, '^[4-9]\d{6}$', '+674 444 1234', true, '^NRU68$', 'Postal code', 'NRU68', 'District', 'after_city', 'line1,line2,city,district,country'),
  ('NU', '683', null, '^[1-9]\d{3}$', '+683 4002', false, null, 'Postal code', null, 'Village', 'none', 'line1,line2,city,village,country'),
  ('NZ', '64', '0', '^[2][0-9]\d{7,8}$', '+64 21 234 5678', true, '^\d{4}$', 'Postcode', '1010', 'Region', 'after_city', 'line1,line2,city,region,postal_code,country'),
  ('OM', '968', null, '^[79]\d{7}$', '+968 9212 3456', true, '^\d{3}$', 'Postal code', '100', 'Governorate', 'after_city', 'line1,line2,city,postal_code,governorate,country'),
  ('PA', '507', null, '^[6]\d{7}$', '+507 6123 4567', true, '^\d{4}$', 'Código postal', '0801', 'Province', 'after_city', 'line1,line2,city,postal_code,province,country'),
  ('PE', '51', '0', '^9\d{8}$', '+51 912 345 678', true, '^\d{5}$', 'Código postal', '15001', 'Region', 'after_city', 'line1,line2,city,postal_code,region,country'),
  ('PF', '689', null, '^[89]\d{7}$', '+689 87 12 34 56', true, '^\d{5}$', 'Code postal', '98714', 'Island', 'after_city', 'line1,line2,postal_code,city,island,country'),
  ('PG', '675', null, '^[57]\d{7}$', '+675 7123 4567', true, '^\d{3}$', 'Postal code', '111', 'Province', 'after_city', 'line1,line2,city,postal_code,province,country'),
  ('PH', '63', '0', '^[9]\d{9}$', '+63 917 123 4567', true, '^\d{4}$', 'Postal code', '1000', 'Province', 'after_city', 'line1,line2,city,postal_code,province,country'),
  ('PK', '92', '0', '^3[0-4]\d{9}$', '+92 301 234 5678', true, '^\d{5}$', 'Postal code', '75500', 'Province', 'after_city', 'line1,line2,city,postal_code,province,country'),
  ('PL', '48', '0', '^[4-9]\d{8}$', '+48 512 345 678', true, '^\d{2}-\d{3}$', 'Kod pocztowy', '00-001', 'Voivodeship', 'after_city', 'line1,line2,postal_code,city,voivodeship,country'),
  ('PM', '508', null, '^508\d{6}$', '+508 41 12 34', true, '^\d{5}$', 'Code postal', '97500', 'Collectivity', 'after_city', 'line1,line2,postal_code,city,country'),
  ('PN', '64', null, null, null, true, '^PCRN\s1ZZ$', 'Postal code', 'PCRN 1ZZ', 'Island', 'after_city', 'line1,line2,city,postal_code,country'),
  ('PR', '1787', null, '^787[0-9]{7}$', '+1 787 234 5678', true, '^\d{5}(-\d{4})?$', 'ZIP code', '00901', 'Municipality', 'after_city', 'line1,line2,city,state,postal_code,country'),
  ('PS', '970', null, '^5[69]\d{7}$', '+970 56 123 4567', true, '^\d{3}$', 'Postal code', '600', 'Governorate', 'after_city', 'line1,line2,city,postal_code,governorate,country'),
  ('PT', '351', null, '^9[1236]\d{7}$', '+351 912 345 678', true, '^\d{4}-\d{3}$', 'Código Postal', '1000-001', 'District', 'after_city', 'line1,line2,city,postal_code,district,country'),
  ('PW', '680', null, '^[7-9]\d{6}$', '+680 775 1234', true, '^\d{5}$', 'ZIP code', '96940', 'State', 'after_city', 'line1,line2,city,state,postal_code,country'),
  ('PY', '595', '0', '^9\d{8}$', '+595 981 234 567', true, '^\d{4}$', 'Código postal', '1209', 'Department', 'after_city', 'line1,line2,city,postal_code,department,country'),
  ('QA', '974', null, '^[3-7]\d{7}$', '+974 3312 3456', true, '^\d{4,5}$', 'Postal code', '12345', 'Municipality', 'after_city', 'line1,line2,city,postal_code,municipality,country'),
  ('RE', '262', '0', '^692\d{6}$', '+262 692 12 34 56', true, '^\d{5}$', 'Code postal', '97400', 'Department', 'after_city', 'line1,line2,postal_code,city,country'),
  ('RO', '40', '0', '^[67]\d{8}$', '+40 712 345 678', true, '^\d{6}$', 'Cod poștal', '010011', 'County', 'after_city', 'line1,line2,city,postal_code,county,country'),
  ('RS', '381', '0', '^6[0-9]\d{6,7}$', '+381 60 1234567', true, '^\d{5}$', 'Поштански број', '11000', 'District', 'after_city', 'line1,line2,city,postal_code,district,country'),
  ('RU', '7', '8', '^9\d{9}$', '+7 916 123 45 67', true, '^\d{6}$', 'Почтовый индекс', '101000', 'Region', 'after_city', 'line1,line2,city,postal_code,region,country'),
  ('RW', '250', null, '^7[238]\d{7}$', '+250 788 123 456', false, null, 'Postal code', null, 'Province', 'none', 'line1,line2,city,province,country'),
  ('SA', '966', '0', '^5[0-9]\d{8}$', '+966 50 123 4567', true, '^\d{5}(-\d{4})?$', 'Postal code', '11564', 'Region', 'after_city', 'line1,line2,city,postal_code,region,country'),
  ('SB', '677', null, '^[78]\d{4}$', '+677 74123', false, null, 'Postal code', null, 'Province', 'none', 'line1,line2,city,province,country'),
  ('SC', '248', null, '^[2-4]\d{6}$', '+248 2 712 345', true, '^\d{5}$', 'Postal code', '10002', 'Island', 'after_city', 'line1,line2,city,postal_code,island,country'),
  ('SD', '249', '0', '^[19]\d{8}$', '+249 91 234 5678', true, '^\d{5}$', 'Postal code', '11111', 'State', 'after_city', 'line1,line2,city,postal_code,state,country'),
  ('SE', '46', '0', '^7[02369]\d{7}$', '+46 70 123 45 67', true, '^\d{3}\s?\d{2}$', 'Postnummer', '111 21', 'County', 'after_city', 'line1,line2,postal_code,city,county,country'),
  ('SI', '386', '0', '^[3-7]\d{7}$', '+386 31 234 567', true, '^SI-\d{4}$', 'Poštna številka', 'SI-1000', 'Region', 'after_city', 'line1,line2,postal_code,city,region,country'),
  ('SJ', '47', null, null, null, true, '^\d{4}$', 'Postnummer', '9170', 'Territory', 'after_city', 'line1,line2,postal_code,city,country'),
  ('SK', '421', '0', '^9[0-9]\d{7}$', '+421 912 345 678', true, '^\d{3}\s?\d{2}$', 'PSČ', '811 01', 'Region', 'before_city', 'line1,line2,postal_code,city,region,country'),
  ('SL', '232', null, '^[37]\d{7}$', '+232 30 123 456', false, null, 'Postal code', null, 'Province', 'none', 'line1,line2,city,province,country'),
  ('SM', '378', null, '^6\d{9}$', '+378 0549 123456', true, '^4789\d{1}$', 'Codice postale', '47890', 'Municipality', 'after_city', 'line1,line2,postal_code,city,municipality,country'),
  ('SN', '221', null, '^7[5678]\d{7}$', '+221 77 123 45 67', true, '^\d{5}$', 'Code postal', '10700', 'Region', 'after_city', 'line1,line2,city,postal_code,region,country'),
  ('SO', '252', null, '^[67]\d{8}$', '+252 61 2345678', false, null, 'Postal code', null, 'Region', 'none', 'line1,line2,city,region,country'),
  ('SR', '597', null, '^[7-8]\d{6}$', '+597 712 3456', true, '^\d{4}[A-Z]{2}$', 'Postcode', '1234AB', 'District', 'after_city', 'line1,line2,city,postal_code,district,country'),
  ('SS', '211', null, '^[09]\d{8}$', '+211 91 234 5678', false, null, 'Postal code', null, 'State', 'none', 'line1,line2,city,state,country'),
  ('ST', '239', null, '^[9]\d{6}$', '+239 981 2345', false, null, 'Postal code', null, 'District', 'none', 'line1,line2,city,district,country'),
  ('SV', '503', null, '^[267]\d{7}$', '+503 7123 4567', true, '^\d{4}$', 'Código postal', '1101', 'Department', 'after_city', 'line1,line2,city,postal_code,department,country'),
  ('SX', '1721', null, '^721[0-9]{7}$', '+1 721 520 1234', false, null, 'Postal code', null, 'District', 'none', 'line1,line2,city,country'),
  ('SY', '963', '0', '^9[456]\d{7}$', '+963 944 567 890', true, '^\d{4,5}$', 'Postal code', '11515', 'Governorate', 'after_city', 'line1,line2,city,postal_code,governorate,country'),
  ('SZ', '268', null, '^[7]\d{7}$', '+268 7612 3456', true, '^[HLMS]\d{3}$', 'Postal code', 'H100', 'Region', 'after_city', 'line1,line2,city,postal_code,region,country'),
  ('TC', '1649', null, '^649[0-9]{7}$', '+1 649 946 1234', true, '^TKCA\s1ZZ$', 'Postal code', 'TKCA 1ZZ', 'Island', 'after_city', 'line1,line2,city,postal_code,country'),
  ('TD', '235', null, '^[6]\d{7}$', '+235 63 12 34 56', false, null, 'Postal code', null, 'Region', 'none', 'line1,line2,city,region,country'),
  ('TF', '262', null, null, null, true, '^\d{5}$', 'Code postal', '97498', 'Territory', 'after_city', 'line1,line2,postal_code,city,country'),
  ('TG', '228', null, '^[9]\d{7}$', '+228 90 12 34 56', false, null, 'Postal code', null, 'Region', 'none', 'line1,line2,city,region,country'),
  ('TH', '66', '0', '^[689]\d{8}$', '+66 81 234 5678', true, '^\d{5}$', 'รหัสไปรษณีย์', '10110', 'Province', 'after_city', 'line1,line2,city,postal_code,province,country'),
  ('TJ', '992', '0', '^[9]\d{8}$', '+992 917 12 34 56', true, '^\d{6}$', 'Postal code', '734000', 'Region', 'after_city', 'line1,line2,city,postal_code,region,country'),
  ('TK', '690', null, null, null, false, null, 'Postal code', null, 'Atoll', 'none', 'line1,line2,atoll,country'),
  ('TL', '670', null, '^7\d{7}$', '+670 7721 2345', false, null, 'Postal code', null, 'Municipality', 'none', 'line1,line2,city,municipality,country'),
  ('TM', '993', '8', '^[6]\d{7}$', '+993 62 12 34 56', true, '^\d{6}$', 'Postal code', '744000', 'Province', 'after_city', 'line1,line2,city,postal_code,province,country'),
  ('TN', '216', null, '^[2-9]\d{7}$', '+216 20 123 456', true, '^\d{4}$', 'Code postal', '1001', 'Governorate', 'after_city', 'line1,line2,city,postal_code,governorate,country'),
  ('TO', '676', null, '^[78]\d{4}$', '+676 8715 0', true, '^\d{4,5}$', 'Postal code', '23407', 'Island', 'after_city', 'line1,line2,city,postal_code,island,country'),
  ('TR', '90', '0', '^5[0-9]\d{8}$', '+90 532 123 45 67', true, '^\d{5}$', 'Posta kodu', '34000', 'Province', 'after_city', 'line1,line2,city,postal_code,province,country'),
  ('TT', '1868', null, '^868[0-9]{7}$', '+1 868 625 1234', true, '^\d{6}$', 'Postal code', '100101', 'County', 'after_city', 'line1,line2,city,postal_code,county,country'),
  ('TV', '688', null, '^[79]\d{4}$', '+688 90123', false, null, 'Postal code', null, 'Island', 'none', 'line1,line2,city,island,country'),
  ('TW', '886', '0', '^9\d{8}$', '+886 912 345 678', true, '^\d{5}(-\d{2})?$', '郵遞區號', '10001', 'County', 'before_city', 'postal_code,county,city,line2,line1,country'),
  ('TZ', '255', '0', '^[67]\d{8}$', '+255 621 234 567', true, '^\d{5}$', 'Postal code', '11101', 'Region', 'after_city', 'line1,line2,city,postal_code,region,country'),
  ('UA', '380', '0', '^[3-9]\d{8}$', '+380 67 123 45 67', true, '^\d{5}$', 'Поштовий індекс', '01001', 'Oblast', 'after_city', 'line1,line2,city,postal_code,oblast,country'),
  ('UG', '256', '0', '^[37]\d{8}$', '+256 712 345 678', false, null, 'Postal code', null, 'Region', 'none', 'line1,line2,city,region,country'),
  ('US', '1', '1', '^\d{10}$', '+1 (555) 234-5678', true, '^\d{5}(-\d{4})?$', 'ZIP code', '90210', 'State', 'after_region', 'line1,line2,city,region,postal_code,country'),
  ('UY', '598', null, '^9\d{7}$', '+598 91 234 567', true, '^\d{5}$', 'Código postal', '11000', 'Department', 'after_city', 'line1,line2,city,postal_code,department,country'),
  ('UZ', '998', '8', '^[69]\d{8}$', '+998 90 123 45 67', true, '^\d{6}$', 'Postal code', '100000', 'Region', 'after_city', 'line1,line2,city,postal_code,region,country'),
  ('VA', '39', '0', '^6\d{9}$', '+39 06 698 81', true, '^00120$', 'Postal code', '00120', 'City State', 'after_city', 'line1,line2,postal_code,city,country'),
  ('VC', '1784', null, '^784[0-9]{7}$', '+1 784 456 1234', true, '^VC\d{4}$', 'Postal code', 'VC0100', 'Parish', 'after_city', 'line1,line2,city,postal_code,country'),
  ('VE', '58', null, '^4(1[24]|2[46])\d{7}$', '+58 412 123 4567', true, '^\d{4}$', 'Código postal', '1010', 'State', 'after_city', 'line1,line2,city,postal_code,state,country'),
  ('VG', '1284', null, '^284[0-9]{7}$', '+1 284 494 1234', true, '^VG11\d{2}$', 'Postal code', 'VG1110', 'District', 'after_city', 'line1,line2,city,postal_code,country'),
  ('VI', '1340', null, '^340[0-9]{7}$', '+1 340 774 1234', true, '^\d{5}(-\d{4})?$', 'ZIP code', '00801', 'Island', 'after_city', 'line1,line2,city,state,postal_code,country'),
  ('VN', '84', '0', '^[3-9]\d{8}$', '+84 912 345 678', true, '^\d{6}$', 'Mã bưu chính', '100000', 'Province', 'after_city', 'line1,line2,city,postal_code,province,country'),
  ('VU', '678', null, '^[57]\d{6}$', '+678 591 2345', false, null, 'Postal code', null, 'Province', 'none', 'line1,line2,city,province,country'),
  ('WF', '681', null, '^[5-9]\d{5}$', '+681 82 12 34', true, '^\d{5}$', 'Code postal', '98600', 'Territory', 'after_city', 'line1,line2,postal_code,city,country'),
  ('WS', '685', null, '^[7]\d{6}$', '+685 712 3456', false, null, 'Postal code', null, 'District', 'none', 'line1,line2,city,district,country'),
  ('XK', '383', null, '^4[3-5]\d{6}$', '+383 44 123 456', true, '^\d{5}$', 'Postal code', '10000', 'Municipality', 'after_city', 'line1,line2,city,postal_code,municipality,country'),
  ('YE', '967', '0', '^7[1-8]\d{7}$', '+967 71 234 5678', false, null, 'Postal code', null, 'Governorate', 'none', 'line1,line2,city,governorate,country'),
  ('YT', '262', '0', '^639\d{6}$', '+262 639 12 34 56', true, '^\d{5}$', 'Code postal', '97600', 'Collectivity', 'after_city', 'line1,line2,postal_code,city,country'),
  ('ZA', '27', '0', '^[678]\d{8}$', '+27 71 123 4567', true, '^\d{4}$', 'Postal code', '0001', 'Province', 'after_city', 'line1,line2,city,postal_code,province,country'),
  ('ZM', '260', '0', '^[79]\d{8}$', '+260 97 1234567', true, '^\d{5}$', 'Postal code', '10101', 'Province', 'after_city', 'line1,line2,city,postal_code,province,country'),
  ('ZW', '263', '0', '^[7]\d{8}$', '+263 71 234 5678', true, '^\d{4}$', 'Postal code', '00263', 'Province', 'after_city', 'line1,line2,city,postal_code,province,country')
) AS v(
    country_code, calling_code, phone_trunk_prefix, phone_national_pattern, phone_example,
    has_postal_codes, postal_code_pattern, postal_code_label, postal_code_example,
    region_label, postal_position, address_format)
WHERE shared.country.code = v.country_code::character(2);

-- Report
DO $$ DECLARE n int; BEGIN
  SELECT count(*) INTO n FROM shared.country WHERE calling_code IS NOT NULL;
  RAISE NOTICE 'shared.country: % rows now have extended profiles', n;
END $$;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/010_system/001_shared/002_state_region.sql
-- 900_seed_data/001_shared/002_state_region.sql
-- Seed: ISO 3166-2 subdivisions
-- Schema: shared | Table: state_region
-- Source: 200_seed_standard.sql (backup)

-- ============================================================================
-- §2  SUBDIVISIONS (ISO 3166-2)
-- ============================================================================

/* ============================================================================
   Athyper — REF Seed: Subdivisions (ISO 3166-2)
   PostgreSQL 16+

   Key countries: SA, AE, US, GB, IN, DE, FR, EG, JP, CA, AU, CN, BR
   Depends on: 020_ref_seed_countries.sql
   ============================================================================ */

-- ============================================================================
-- Saudi Arabia (SA) — 13 regions
-- ============================================================================
insert into shared.state_region (code, country_code, name, category, created_by)
values
  ('SA-01','SA','Riyadh','region','00000000-0000-0000-0000-000000000000'),
  ('SA-02','SA','Makkah','region','00000000-0000-0000-0000-000000000000'),
  ('SA-03','SA','Al Madinah','region','00000000-0000-0000-0000-000000000000'),
  ('SA-04','SA','Eastern','region','00000000-0000-0000-0000-000000000000'),
  ('SA-05','SA','Al-Qassim','region','00000000-0000-0000-0000-000000000000'),
  ('SA-06','SA','Ha''il','region','00000000-0000-0000-0000-000000000000'),
  ('SA-07','SA','Tabuk','region','00000000-0000-0000-0000-000000000000'),
  ('SA-08','SA','Northern Borders','region','00000000-0000-0000-0000-000000000000'),
  ('SA-09','SA','Jazan','region','00000000-0000-0000-0000-000000000000'),
  ('SA-10','SA','Najran','region','00000000-0000-0000-0000-000000000000'),
  ('SA-11','SA','Al Bahah','region','00000000-0000-0000-0000-000000000000'),
  ('SA-12','SA','Al Jawf','region','00000000-0000-0000-0000-000000000000'),
  ('SA-14','SA','Asir','region','00000000-0000-0000-0000-000000000000')
on conflict (code, country_code) do nothing;

-- ============================================================================
-- United Arab Emirates (AE) — 7 emirates
-- ============================================================================
insert into shared.state_region (code, country_code, name, category, created_by)
values
  ('AE-AZ','AE','Abu Dhabi','emirate','00000000-0000-0000-0000-000000000000'),
  ('AE-DU','AE','Dubai','emirate','00000000-0000-0000-0000-000000000000'),
  ('AE-SH','AE','Sharjah','emirate','00000000-0000-0000-0000-000000000000'),
  ('AE-AJ','AE','Ajman','emirate','00000000-0000-0000-0000-000000000000'),
  ('AE-UQ','AE','Umm al-Quwain','emirate','00000000-0000-0000-0000-000000000000'),
  ('AE-RK','AE','Ras al-Khaimah','emirate','00000000-0000-0000-0000-000000000000'),
  ('AE-FU','AE','Fujairah','emirate','00000000-0000-0000-0000-000000000000')
on conflict (code, country_code) do nothing;

-- ============================================================================
-- United States (US) — 50 states + DC
-- ============================================================================
insert into shared.state_region (code, country_code, name, category, created_by)
values
  ('US-AL','US','Alabama','state','00000000-0000-0000-0000-000000000000'),
  ('US-AK','US','Alaska','state','00000000-0000-0000-0000-000000000000'),
  ('US-AZ','US','Arizona','state','00000000-0000-0000-0000-000000000000'),
  ('US-AR','US','Arkansas','state','00000000-0000-0000-0000-000000000000'),
  ('US-CA','US','California','state','00000000-0000-0000-0000-000000000000'),
  ('US-CO','US','Colorado','state','00000000-0000-0000-0000-000000000000'),
  ('US-CT','US','Connecticut','state','00000000-0000-0000-0000-000000000000'),
  ('US-DE','US','Delaware','state','00000000-0000-0000-0000-000000000000'),
  ('US-FL','US','Florida','state','00000000-0000-0000-0000-000000000000'),
  ('US-GA','US','Georgia','state','00000000-0000-0000-0000-000000000000'),
  ('US-HI','US','Hawaii','state','00000000-0000-0000-0000-000000000000'),
  ('US-ID','US','Idaho','state','00000000-0000-0000-0000-000000000000'),
  ('US-IL','US','Illinois','state','00000000-0000-0000-0000-000000000000'),
  ('US-IN','US','Indiana','state','00000000-0000-0000-0000-000000000000'),
  ('US-IA','US','Iowa','state','00000000-0000-0000-0000-000000000000'),
  ('US-KS','US','Kansas','state','00000000-0000-0000-0000-000000000000'),
  ('US-KY','US','Kentucky','state','00000000-0000-0000-0000-000000000000'),
  ('US-LA','US','Louisiana','state','00000000-0000-0000-0000-000000000000'),
  ('US-ME','US','Maine','state','00000000-0000-0000-0000-000000000000'),
  ('US-MD','US','Maryland','state','00000000-0000-0000-0000-000000000000'),
  ('US-MA','US','Massachusetts','state','00000000-0000-0000-0000-000000000000'),
  ('US-MI','US','Michigan','state','00000000-0000-0000-0000-000000000000'),
  ('US-MN','US','Minnesota','state','00000000-0000-0000-0000-000000000000'),
  ('US-MS','US','Mississippi','state','00000000-0000-0000-0000-000000000000'),
  ('US-MO','US','Missouri','state','00000000-0000-0000-0000-000000000000'),
  ('US-MT','US','Montana','state','00000000-0000-0000-0000-000000000000'),
  ('US-NE','US','Nebraska','state','00000000-0000-0000-0000-000000000000'),
  ('US-NV','US','Nevada','state','00000000-0000-0000-0000-000000000000'),
  ('US-NH','US','New Hampshire','state','00000000-0000-0000-0000-000000000000'),
  ('US-NJ','US','New Jersey','state','00000000-0000-0000-0000-000000000000'),
  ('US-NM','US','New Mexico','state','00000000-0000-0000-0000-000000000000'),
  ('US-NY','US','New York','state','00000000-0000-0000-0000-000000000000'),
  ('US-NC','US','North Carolina','state','00000000-0000-0000-0000-000000000000'),
  ('US-ND','US','North Dakota','state','00000000-0000-0000-0000-000000000000'),
  ('US-OH','US','Ohio','state','00000000-0000-0000-0000-000000000000'),
  ('US-OK','US','Oklahoma','state','00000000-0000-0000-0000-000000000000'),
  ('US-OR','US','Oregon','state','00000000-0000-0000-0000-000000000000'),
  ('US-PA','US','Pennsylvania','state','00000000-0000-0000-0000-000000000000'),
  ('US-RI','US','Rhode Island','state','00000000-0000-0000-0000-000000000000'),
  ('US-SC','US','South Carolina','state','00000000-0000-0000-0000-000000000000'),
  ('US-SD','US','South Dakota','state','00000000-0000-0000-0000-000000000000'),
  ('US-TN','US','Tennessee','state','00000000-0000-0000-0000-000000000000'),
  ('US-TX','US','Texas','state','00000000-0000-0000-0000-000000000000'),
  ('US-UT','US','Utah','state','00000000-0000-0000-0000-000000000000'),
  ('US-VT','US','Vermont','state','00000000-0000-0000-0000-000000000000'),
  ('US-VA','US','Virginia','state','00000000-0000-0000-0000-000000000000'),
  ('US-WA','US','Washington','state','00000000-0000-0000-0000-000000000000'),
  ('US-WV','US','West Virginia','state','00000000-0000-0000-0000-000000000000'),
  ('US-WI','US','Wisconsin','state','00000000-0000-0000-0000-000000000000'),
  ('US-WY','US','Wyoming','state','00000000-0000-0000-0000-000000000000'),
  ('US-DC','US','District of Columbia','district','00000000-0000-0000-0000-000000000000')
on conflict (code, country_code) do nothing;

-- ============================================================================
-- United Kingdom (GB) — 4 countries
-- ============================================================================
insert into shared.state_region (code, country_code, name, category, created_by)
values
  ('GB-ENG','GB','England','country','00000000-0000-0000-0000-000000000000'),
  ('GB-SCT','GB','Scotland','country','00000000-0000-0000-0000-000000000000'),
  ('GB-WLS','GB','Wales','country','00000000-0000-0000-0000-000000000000'),
  ('GB-NIR','GB','Northern Ireland','country','00000000-0000-0000-0000-000000000000')
on conflict (code, country_code) do nothing;

-- ============================================================================
-- India (IN) — 28 states + 8 union territories
-- ============================================================================
insert into shared.state_region (code, country_code, name, category, created_by)
values
  ('IN-AP','IN','Andhra Pradesh','state','00000000-0000-0000-0000-000000000000'),
  ('IN-AR','IN','Arunachal Pradesh','state','00000000-0000-0000-0000-000000000000'),
  ('IN-AS','IN','Assam','state','00000000-0000-0000-0000-000000000000'),
  ('IN-BR','IN','Bihar','state','00000000-0000-0000-0000-000000000000'),
  ('IN-CT','IN','Chhattisgarh','state','00000000-0000-0000-0000-000000000000'),
  ('IN-GA','IN','Goa','state','00000000-0000-0000-0000-000000000000'),
  ('IN-GJ','IN','Gujarat','state','00000000-0000-0000-0000-000000000000'),
  ('IN-HR','IN','Haryana','state','00000000-0000-0000-0000-000000000000'),
  ('IN-HP','IN','Himachal Pradesh','state','00000000-0000-0000-0000-000000000000'),
  ('IN-JH','IN','Jharkhand','state','00000000-0000-0000-0000-000000000000'),
  ('IN-KA','IN','Karnataka','state','00000000-0000-0000-0000-000000000000'),
  ('IN-KL','IN','Kerala','state','00000000-0000-0000-0000-000000000000'),
  ('IN-MP','IN','Madhya Pradesh','state','00000000-0000-0000-0000-000000000000'),
  ('IN-MH','IN','Maharashtra','state','00000000-0000-0000-0000-000000000000'),
  ('IN-MN','IN','Manipur','state','00000000-0000-0000-0000-000000000000'),
  ('IN-ML','IN','Meghalaya','state','00000000-0000-0000-0000-000000000000'),
  ('IN-MZ','IN','Mizoram','state','00000000-0000-0000-0000-000000000000'),
  ('IN-NL','IN','Nagaland','state','00000000-0000-0000-0000-000000000000'),
  ('IN-OR','IN','Odisha','state','00000000-0000-0000-0000-000000000000'),
  ('IN-PB','IN','Punjab','state','00000000-0000-0000-0000-000000000000'),
  ('IN-RJ','IN','Rajasthan','state','00000000-0000-0000-0000-000000000000'),
  ('IN-SK','IN','Sikkim','state','00000000-0000-0000-0000-000000000000'),
  ('IN-TN','IN','Tamil Nadu','state','00000000-0000-0000-0000-000000000000'),
  ('IN-TG','IN','Telangana','state','00000000-0000-0000-0000-000000000000'),
  ('IN-TR','IN','Tripura','state','00000000-0000-0000-0000-000000000000'),
  ('IN-UP','IN','Uttar Pradesh','state','00000000-0000-0000-0000-000000000000'),
  ('IN-UT','IN','Uttarakhand','state','00000000-0000-0000-0000-000000000000'),
  ('IN-WB','IN','West Bengal','state','00000000-0000-0000-0000-000000000000'),
  -- Union Territories
  ('IN-AN','IN','Andaman and Nicobar Islands','union territory','00000000-0000-0000-0000-000000000000'),
  ('IN-CH','IN','Chandigarh','union territory','00000000-0000-0000-0000-000000000000'),
  ('IN-DH','IN','Dadra and Nagar Haveli and Daman and Diu','union territory','00000000-0000-0000-0000-000000000000'),
  ('IN-DL','IN','Delhi','union territory','00000000-0000-0000-0000-000000000000'),
  ('IN-JK','IN','Jammu and Kashmir','union territory','00000000-0000-0000-0000-000000000000'),
  ('IN-LA','IN','Ladakh','union territory','00000000-0000-0000-0000-000000000000'),
  ('IN-LD','IN','Lakshadweep','union territory','00000000-0000-0000-0000-000000000000'),
  ('IN-PY','IN','Puducherry','union territory','00000000-0000-0000-0000-000000000000')
on conflict (code, country_code) do nothing;

-- ============================================================================
-- Germany (DE) — 16 states
-- ============================================================================
insert into shared.state_region (code, country_code, name, category, created_by)
values
  ('DE-BW','DE','Baden-Württemberg','state','00000000-0000-0000-0000-000000000000'),
  ('DE-BY','DE','Bavaria','state','00000000-0000-0000-0000-000000000000'),
  ('DE-BE','DE','Berlin','state','00000000-0000-0000-0000-000000000000'),
  ('DE-BB','DE','Brandenburg','state','00000000-0000-0000-0000-000000000000'),
  ('DE-HB','DE','Bremen','state','00000000-0000-0000-0000-000000000000'),
  ('DE-HH','DE','Hamburg','state','00000000-0000-0000-0000-000000000000'),
  ('DE-HE','DE','Hesse','state','00000000-0000-0000-0000-000000000000'),
  ('DE-MV','DE','Mecklenburg-Vorpommern','state','00000000-0000-0000-0000-000000000000'),
  ('DE-NI','DE','Lower Saxony','state','00000000-0000-0000-0000-000000000000'),
  ('DE-NW','DE','North Rhine-Westphalia','state','00000000-0000-0000-0000-000000000000'),
  ('DE-RP','DE','Rhineland-Palatinate','state','00000000-0000-0000-0000-000000000000'),
  ('DE-SL','DE','Saarland','state','00000000-0000-0000-0000-000000000000'),
  ('DE-SN','DE','Saxony','state','00000000-0000-0000-0000-000000000000'),
  ('DE-ST','DE','Saxony-Anhalt','state','00000000-0000-0000-0000-000000000000'),
  ('DE-SH','DE','Schleswig-Holstein','state','00000000-0000-0000-0000-000000000000'),
  ('DE-TH','DE','Thuringia','state','00000000-0000-0000-0000-000000000000')
on conflict (code, country_code) do nothing;

-- ============================================================================
-- France (FR) — 13 metropolitan + 5 overseas regions
-- ============================================================================
insert into shared.state_region (code, country_code, name, category, created_by)
values
  ('FR-ARA','FR','Auvergne-Rhône-Alpes','region','00000000-0000-0000-0000-000000000000'),
  ('FR-BFC','FR','Bourgogne-Franche-Comté','region','00000000-0000-0000-0000-000000000000'),
  ('FR-BRE','FR','Bretagne','region','00000000-0000-0000-0000-000000000000'),
  ('FR-CVL','FR','Centre-Val de Loire','region','00000000-0000-0000-0000-000000000000'),
  ('FR-COR','FR','Corse','region','00000000-0000-0000-0000-000000000000'),
  ('FR-GES','FR','Grand Est','region','00000000-0000-0000-0000-000000000000'),
  ('FR-HDF','FR','Hauts-de-France','region','00000000-0000-0000-0000-000000000000'),
  ('FR-IDF','FR','Île-de-France','region','00000000-0000-0000-0000-000000000000'),
  ('FR-NOR','FR','Normandie','region','00000000-0000-0000-0000-000000000000'),
  ('FR-NAQ','FR','Nouvelle-Aquitaine','region','00000000-0000-0000-0000-000000000000'),
  ('FR-OCC','FR','Occitanie','region','00000000-0000-0000-0000-000000000000'),
  ('FR-PDL','FR','Pays de la Loire','region','00000000-0000-0000-0000-000000000000'),
  ('FR-PAC','FR','Provence-Alpes-Côte d''Azur','region','00000000-0000-0000-0000-000000000000'),
  ('FR-GUA','FR','Guadeloupe','region','00000000-0000-0000-0000-000000000000'),
  ('FR-GUF','FR','Guyane','region','00000000-0000-0000-0000-000000000000'),
  ('FR-MTQ','FR','Martinique','region','00000000-0000-0000-0000-000000000000'),
  ('FR-LRE','FR','La Réunion','region','00000000-0000-0000-0000-000000000000'),
  ('FR-MAY','FR','Mayotte','region','00000000-0000-0000-0000-000000000000')
on conflict (code, country_code) do nothing;

-- ============================================================================
-- Egypt (EG) — 27 governorates
-- ============================================================================
insert into shared.state_region (code, country_code, name, category, created_by)
values
  ('EG-ALX','EG','Alexandria','governorate','00000000-0000-0000-0000-000000000000'),
  ('EG-ASN','EG','Aswan','governorate','00000000-0000-0000-0000-000000000000'),
  ('EG-AST','EG','Asyut','governorate','00000000-0000-0000-0000-000000000000'),
  ('EG-BH','EG','Beheira','governorate','00000000-0000-0000-0000-000000000000'),
  ('EG-BNS','EG','Beni Suef','governorate','00000000-0000-0000-0000-000000000000'),
  ('EG-C','EG','Cairo','governorate','00000000-0000-0000-0000-000000000000'),
  ('EG-DK','EG','Dakahlia','governorate','00000000-0000-0000-0000-000000000000'),
  ('EG-DT','EG','Damietta','governorate','00000000-0000-0000-0000-000000000000'),
  ('EG-FYM','EG','Faiyum','governorate','00000000-0000-0000-0000-000000000000'),
  ('EG-GH','EG','Gharbia','governorate','00000000-0000-0000-0000-000000000000'),
  ('EG-GZ','EG','Giza','governorate','00000000-0000-0000-0000-000000000000'),
  ('EG-IS','EG','Ismailia','governorate','00000000-0000-0000-0000-000000000000'),
  ('EG-KFS','EG','Kafr el-Sheikh','governorate','00000000-0000-0000-0000-000000000000'),
  ('EG-LX','EG','Luxor','governorate','00000000-0000-0000-0000-000000000000'),
  ('EG-MN','EG','Minya','governorate','00000000-0000-0000-0000-000000000000'),
  ('EG-MNF','EG','Monufia','governorate','00000000-0000-0000-0000-000000000000'),
  ('EG-MT','EG','Matrouh','governorate','00000000-0000-0000-0000-000000000000'),
  ('EG-PTS','EG','Port Said','governorate','00000000-0000-0000-0000-000000000000'),
  ('EG-KB','EG','Qalyubia','governorate','00000000-0000-0000-0000-000000000000'),
  ('EG-KN','EG','Qena','governorate','00000000-0000-0000-0000-000000000000'),
  ('EG-WAD','EG','New Valley','governorate','00000000-0000-0000-0000-000000000000'),
  ('EG-SIN','EG','North Sinai','governorate','00000000-0000-0000-0000-000000000000'),
  ('EG-SHR','EG','Red Sea','governorate','00000000-0000-0000-0000-000000000000'),
  ('EG-SHG','EG','Sohag','governorate','00000000-0000-0000-0000-000000000000'),
  ('EG-JS','EG','South Sinai','governorate','00000000-0000-0000-0000-000000000000'),
  ('EG-SUZ','EG','Suez','governorate','00000000-0000-0000-0000-000000000000'),
  ('EG-HU','EG','Helwan','governorate','00000000-0000-0000-0000-000000000000')
on conflict (code, country_code) do nothing;

-- ============================================================================
-- Japan (JP) — 47 prefectures
-- ============================================================================
insert into shared.state_region (code, country_code, name, category, created_by)
values
  ('JP-01','JP','Hokkaido','prefecture','00000000-0000-0000-0000-000000000000'),
  ('JP-02','JP','Aomori','prefecture','00000000-0000-0000-0000-000000000000'),
  ('JP-03','JP','Iwate','prefecture','00000000-0000-0000-0000-000000000000'),
  ('JP-04','JP','Miyagi','prefecture','00000000-0000-0000-0000-000000000000'),
  ('JP-05','JP','Akita','prefecture','00000000-0000-0000-0000-000000000000'),
  ('JP-06','JP','Yamagata','prefecture','00000000-0000-0000-0000-000000000000'),
  ('JP-07','JP','Fukushima','prefecture','00000000-0000-0000-0000-000000000000'),
  ('JP-08','JP','Ibaraki','prefecture','00000000-0000-0000-0000-000000000000'),
  ('JP-09','JP','Tochigi','prefecture','00000000-0000-0000-0000-000000000000'),
  ('JP-10','JP','Gunma','prefecture','00000000-0000-0000-0000-000000000000'),
  ('JP-11','JP','Saitama','prefecture','00000000-0000-0000-0000-000000000000'),
  ('JP-12','JP','Chiba','prefecture','00000000-0000-0000-0000-000000000000'),
  ('JP-13','JP','Tokyo','prefecture','00000000-0000-0000-0000-000000000000'),
  ('JP-14','JP','Kanagawa','prefecture','00000000-0000-0000-0000-000000000000'),
  ('JP-15','JP','Niigata','prefecture','00000000-0000-0000-0000-000000000000'),
  ('JP-16','JP','Toyama','prefecture','00000000-0000-0000-0000-000000000000'),
  ('JP-17','JP','Ishikawa','prefecture','00000000-0000-0000-0000-000000000000'),
  ('JP-18','JP','Fukui','prefecture','00000000-0000-0000-0000-000000000000'),
  ('JP-19','JP','Yamanashi','prefecture','00000000-0000-0000-0000-000000000000'),
  ('JP-20','JP','Nagano','prefecture','00000000-0000-0000-0000-000000000000'),
  ('JP-21','JP','Gifu','prefecture','00000000-0000-0000-0000-000000000000'),
  ('JP-22','JP','Shizuoka','prefecture','00000000-0000-0000-0000-000000000000'),
  ('JP-23','JP','Aichi','prefecture','00000000-0000-0000-0000-000000000000'),
  ('JP-24','JP','Mie','prefecture','00000000-0000-0000-0000-000000000000'),
  ('JP-25','JP','Shiga','prefecture','00000000-0000-0000-0000-000000000000'),
  ('JP-26','JP','Kyoto','prefecture','00000000-0000-0000-0000-000000000000'),
  ('JP-27','JP','Osaka','prefecture','00000000-0000-0000-0000-000000000000'),
  ('JP-28','JP','Hyogo','prefecture','00000000-0000-0000-0000-000000000000'),
  ('JP-29','JP','Nara','prefecture','00000000-0000-0000-0000-000000000000'),
  ('JP-30','JP','Wakayama','prefecture','00000000-0000-0000-0000-000000000000'),
  ('JP-31','JP','Tottori','prefecture','00000000-0000-0000-0000-000000000000'),
  ('JP-32','JP','Shimane','prefecture','00000000-0000-0000-0000-000000000000'),
  ('JP-33','JP','Okayama','prefecture','00000000-0000-0000-0000-000000000000'),
  ('JP-34','JP','Hiroshima','prefecture','00000000-0000-0000-0000-000000000000'),
  ('JP-35','JP','Yamaguchi','prefecture','00000000-0000-0000-0000-000000000000'),
  ('JP-36','JP','Tokushima','prefecture','00000000-0000-0000-0000-000000000000'),
  ('JP-37','JP','Kagawa','prefecture','00000000-0000-0000-0000-000000000000'),
  ('JP-38','JP','Ehime','prefecture','00000000-0000-0000-0000-000000000000'),
  ('JP-39','JP','Kochi','prefecture','00000000-0000-0000-0000-000000000000'),
  ('JP-40','JP','Fukuoka','prefecture','00000000-0000-0000-0000-000000000000'),
  ('JP-41','JP','Saga','prefecture','00000000-0000-0000-0000-000000000000'),
  ('JP-42','JP','Nagasaki','prefecture','00000000-0000-0000-0000-000000000000'),
  ('JP-43','JP','Kumamoto','prefecture','00000000-0000-0000-0000-000000000000'),
  ('JP-44','JP','Oita','prefecture','00000000-0000-0000-0000-000000000000'),
  ('JP-45','JP','Miyazaki','prefecture','00000000-0000-0000-0000-000000000000'),
  ('JP-46','JP','Kagoshima','prefecture','00000000-0000-0000-0000-000000000000'),
  ('JP-47','JP','Okinawa','prefecture','00000000-0000-0000-0000-000000000000')
on conflict (code, country_code) do nothing;

-- ============================================================================
-- Canada (CA) — 10 provinces + 3 territories
-- ============================================================================
insert into shared.state_region (code, country_code, name, category, created_by)
values
  ('CA-AB','CA','Alberta','province','00000000-0000-0000-0000-000000000000'),
  ('CA-BC','CA','British Columbia','province','00000000-0000-0000-0000-000000000000'),
  ('CA-MB','CA','Manitoba','province','00000000-0000-0000-0000-000000000000'),
  ('CA-NB','CA','New Brunswick','province','00000000-0000-0000-0000-000000000000'),
  ('CA-NL','CA','Newfoundland and Labrador','province','00000000-0000-0000-0000-000000000000'),
  ('CA-NS','CA','Nova Scotia','province','00000000-0000-0000-0000-000000000000'),
  ('CA-ON','CA','Ontario','province','00000000-0000-0000-0000-000000000000'),
  ('CA-PE','CA','Prince Edward Island','province','00000000-0000-0000-0000-000000000000'),
  ('CA-QC','CA','Quebec','province','00000000-0000-0000-0000-000000000000'),
  ('CA-SK','CA','Saskatchewan','province','00000000-0000-0000-0000-000000000000'),
  ('CA-NT','CA','Northwest Territories','territory','00000000-0000-0000-0000-000000000000'),
  ('CA-NU','CA','Nunavut','territory','00000000-0000-0000-0000-000000000000'),
  ('CA-YT','CA','Yukon','territory','00000000-0000-0000-0000-000000000000')
on conflict (code, country_code) do nothing;

-- ============================================================================
-- Australia (AU) — 6 states + 2 territories
-- ============================================================================
insert into shared.state_region (code, country_code, name, category, created_by)
values
  ('AU-NSW','AU','New South Wales','state','00000000-0000-0000-0000-000000000000'),
  ('AU-QLD','AU','Queensland','state','00000000-0000-0000-0000-000000000000'),
  ('AU-SA','AU','South Australia','state','00000000-0000-0000-0000-000000000000'),
  ('AU-TAS','AU','Tasmania','state','00000000-0000-0000-0000-000000000000'),
  ('AU-VIC','AU','Victoria','state','00000000-0000-0000-0000-000000000000'),
  ('AU-WA','AU','Western Australia','state','00000000-0000-0000-0000-000000000000'),
  ('AU-ACT','AU','Australian Capital Territory','territory','00000000-0000-0000-0000-000000000000'),
  ('AU-NT','AU','Northern Territory','territory','00000000-0000-0000-0000-000000000000')
on conflict (code, country_code) do nothing;

-- ============================================================================
-- China (CN) — 23 provinces + 4 municipalities + 5 autonomous regions + 2 SARs
-- ============================================================================
insert into shared.state_region (code, country_code, name, category, created_by)
values
  -- Provinces
  ('CN-AH','CN','Anhui','province','00000000-0000-0000-0000-000000000000'),
  ('CN-FJ','CN','Fujian','province','00000000-0000-0000-0000-000000000000'),
  ('CN-GD','CN','Guangdong','province','00000000-0000-0000-0000-000000000000'),
  ('CN-GS','CN','Gansu','province','00000000-0000-0000-0000-000000000000'),
  ('CN-GZ','CN','Guizhou','province','00000000-0000-0000-0000-000000000000'),
  ('CN-HA','CN','Henan','province','00000000-0000-0000-0000-000000000000'),
  ('CN-HB','CN','Hubei','province','00000000-0000-0000-0000-000000000000'),
  ('CN-HE','CN','Hebei','province','00000000-0000-0000-0000-000000000000'),
  ('CN-HI','CN','Hainan','province','00000000-0000-0000-0000-000000000000'),
  ('CN-HL','CN','Heilongjiang','province','00000000-0000-0000-0000-000000000000'),
  ('CN-HN','CN','Hunan','province','00000000-0000-0000-0000-000000000000'),
  ('CN-JL','CN','Jilin','province','00000000-0000-0000-0000-000000000000'),
  ('CN-JS','CN','Jiangsu','province','00000000-0000-0000-0000-000000000000'),
  ('CN-JX','CN','Jiangxi','province','00000000-0000-0000-0000-000000000000'),
  ('CN-LN','CN','Liaoning','province','00000000-0000-0000-0000-000000000000'),
  ('CN-QH','CN','Qinghai','province','00000000-0000-0000-0000-000000000000'),
  ('CN-SC','CN','Sichuan','province','00000000-0000-0000-0000-000000000000'),
  ('CN-SD','CN','Shandong','province','00000000-0000-0000-0000-000000000000'),
  ('CN-SN','CN','Shaanxi','province','00000000-0000-0000-0000-000000000000'),
  ('CN-SX','CN','Shanxi','province','00000000-0000-0000-0000-000000000000'),
  ('CN-TW','CN','Taiwan','province','00000000-0000-0000-0000-000000000000'),
  ('CN-YN','CN','Yunnan','province','00000000-0000-0000-0000-000000000000'),
  ('CN-ZJ','CN','Zhejiang','province','00000000-0000-0000-0000-000000000000'),
  -- Municipalities
  ('CN-BJ','CN','Beijing','municipality','00000000-0000-0000-0000-000000000000'),
  ('CN-CQ','CN','Chongqing','municipality','00000000-0000-0000-0000-000000000000'),
  ('CN-SH','CN','Shanghai','municipality','00000000-0000-0000-0000-000000000000'),
  ('CN-TJ','CN','Tianjin','municipality','00000000-0000-0000-0000-000000000000'),
  -- Autonomous regions
  ('CN-GX','CN','Guangxi','autonomous region','00000000-0000-0000-0000-000000000000'),
  ('CN-NM','CN','Inner Mongolia','autonomous region','00000000-0000-0000-0000-000000000000'),
  ('CN-NX','CN','Ningxia','autonomous region','00000000-0000-0000-0000-000000000000'),
  ('CN-XJ','CN','Xinjiang','autonomous region','00000000-0000-0000-0000-000000000000'),
  ('CN-XZ','CN','Tibet','autonomous region','00000000-0000-0000-0000-000000000000'),
  -- SARs
  ('CN-HK','CN','Hong Kong','special administrative region','00000000-0000-0000-0000-000000000000'),
  ('CN-MO','CN','Macao','special administrative region','00000000-0000-0000-0000-000000000000')
on conflict (code, country_code) do nothing;

-- ============================================================================
-- Brazil (BR) — 26 states + 1 federal district
-- ============================================================================
insert into shared.state_region (code, country_code, name, category, created_by)
values
  ('BR-AC','BR','Acre','state','00000000-0000-0000-0000-000000000000'),
  ('BR-AL','BR','Alagoas','state','00000000-0000-0000-0000-000000000000'),
  ('BR-AM','BR','Amazonas','state','00000000-0000-0000-0000-000000000000'),
  ('BR-AP','BR','Amapá','state','00000000-0000-0000-0000-000000000000'),
  ('BR-BA','BR','Bahia','state','00000000-0000-0000-0000-000000000000'),
  ('BR-CE','BR','Ceará','state','00000000-0000-0000-0000-000000000000'),
  ('BR-DF','BR','Distrito Federal','federal district','00000000-0000-0000-0000-000000000000'),
  ('BR-ES','BR','Espírito Santo','state','00000000-0000-0000-0000-000000000000'),
  ('BR-GO','BR','Goiás','state','00000000-0000-0000-0000-000000000000'),
  ('BR-MA','BR','Maranhão','state','00000000-0000-0000-0000-000000000000'),
  ('BR-MG','BR','Minas Gerais','state','00000000-0000-0000-0000-000000000000'),
  ('BR-MS','BR','Mato Grosso do Sul','state','00000000-0000-0000-0000-000000000000'),
  ('BR-MT','BR','Mato Grosso','state','00000000-0000-0000-0000-000000000000'),
  ('BR-PA','BR','Pará','state','00000000-0000-0000-0000-000000000000'),
  ('BR-PB','BR','Paraíba','state','00000000-0000-0000-0000-000000000000'),
  ('BR-PE','BR','Pernambuco','state','00000000-0000-0000-0000-000000000000'),
  ('BR-PI','BR','Piauí','state','00000000-0000-0000-0000-000000000000'),
  ('BR-PR','BR','Paraná','state','00000000-0000-0000-0000-000000000000'),
  ('BR-RJ','BR','Rio de Janeiro','state','00000000-0000-0000-0000-000000000000'),
  ('BR-RN','BR','Rio Grande do Norte','state','00000000-0000-0000-0000-000000000000'),
  ('BR-RO','BR','Rondônia','state','00000000-0000-0000-0000-000000000000'),
  ('BR-RR','BR','Roraima','state','00000000-0000-0000-0000-000000000000'),
  ('BR-RS','BR','Rio Grande do Sul','state','00000000-0000-0000-0000-000000000000'),
  ('BR-SC','BR','Santa Catarina','state','00000000-0000-0000-0000-000000000000'),
  ('BR-SE','BR','Sergipe','state','00000000-0000-0000-0000-000000000000'),
  ('BR-SP','BR','São Paulo','state','00000000-0000-0000-0000-000000000000'),
  ('BR-TO','BR','Tocantins','state','00000000-0000-0000-0000-000000000000')
on conflict (code, country_code) do nothing;


-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/010_system/001_shared/003_currency.sql
-- 900_seed_data/001_shared/003_currency.sql
-- Seed: ISO 4217 currencies
-- Schema: shared | Table: currency
--
-- Best-practice notes
-- ───────────────────
-- on conflict (code) do update   → re-running this seed propagates corrections
--                                  (name typos, symbol fixes, minor_units changes)
-- minor_units                    → ISO 4217 authoritative exponent (decimal places)
-- metadata rounding_increment    → actual smallest commercial unit where it differs
--                                  from 10^-minor_units (e.g. CHF rounds to 0.05 cash)
-- PSE omitted                    → not an ISO 4217 currency code (PSE is ISO 3166 country)
-- Precious metals (XAU …)        → minor_units NULL per ISO 4217 (no subunit defined)

-- ============================================================================
-- Major World Currencies
-- ============================================================================
insert into shared.currency (code, name, symbol, minor_units, numeric3, created_by)
values
  ('USD','US Dollar','$',2,'840','00000000-0000-0000-0000-000000000000'),
  ('EUR','Euro','€',2,'978','00000000-0000-0000-0000-000000000000'),
  ('GBP','Pound Sterling','£',2,'826','00000000-0000-0000-0000-000000000000'),
  ('JPY','Yen','¥',0,'392','00000000-0000-0000-0000-000000000000'),
  ('CNY','Yuan Renminbi','¥',2,'156','00000000-0000-0000-0000-000000000000'),
  ('CHF','Swiss Franc','CHF',2,'756','00000000-0000-0000-0000-000000000000'),
  ('CAD','Canadian Dollar','CA$',2,'124','00000000-0000-0000-0000-000000000000'),
  ('AUD','Australian Dollar','A$',2,'036','00000000-0000-0000-0000-000000000000'),
  ('NZD','New Zealand Dollar','NZ$',2,'554','00000000-0000-0000-0000-000000000000'),
  ('HKD','Hong Kong Dollar','HK$',2,'344','00000000-0000-0000-0000-000000000000'),
  ('SGD','Singapore Dollar','S$',2,'702','00000000-0000-0000-0000-000000000000')
on conflict (code) do update set
  name        = excluded.name,
  symbol      = excluded.symbol,
  minor_units = excluded.minor_units,
  numeric3    = excluded.numeric3,
  updated_at  = now(),
  updated_by  = excluded.created_by;

-- ============================================================================
-- Middle East & North Africa
-- ============================================================================
insert into shared.currency (code, name, symbol, minor_units, numeric3, created_by)
values
  ('SAR','Saudi Riyal','﷼',2,'682','00000000-0000-0000-0000-000000000000'),
  ('AED','UAE Dirham','د.إ',2,'784','00000000-0000-0000-0000-000000000000'),
  ('BHD','Bahraini Dinar','BD',3,'048','00000000-0000-0000-0000-000000000000'),
  ('KWD','Kuwaiti Dinar','KD',3,'414','00000000-0000-0000-0000-000000000000'),
  ('OMR','Rial Omani','﷼',3,'512','00000000-0000-0000-0000-000000000000'),
  ('QAR','Qatari Rial','QR',2,'634','00000000-0000-0000-0000-000000000000'),
  ('JOD','Jordanian Dinar','JD',3,'400','00000000-0000-0000-0000-000000000000'),
  ('IQD','Iraqi Dinar','ع.د',3,'368','00000000-0000-0000-0000-000000000000'),
  ('LBP','Lebanese Pound','ل.ل',2,'422','00000000-0000-0000-0000-000000000000'),
  ('SYP','Syrian Pound','£S',2,'760','00000000-0000-0000-0000-000000000000'),
  ('YER','Yemeni Rial','﷼',2,'886','00000000-0000-0000-0000-000000000000'),
  ('EGP','Egyptian Pound','E£',2,'818','00000000-0000-0000-0000-000000000000'),
  ('LYD','Libyan Dinar','LD',3,'434','00000000-0000-0000-0000-000000000000'),
  ('TND','Tunisian Dinar','DT',3,'788','00000000-0000-0000-0000-000000000000'),
  ('DZD','Algerian Dinar','د.ج',2,'012','00000000-0000-0000-0000-000000000000'),
  ('MAD','Moroccan Dirham','MAD',2,'504','00000000-0000-0000-0000-000000000000'),
  ('SDG','Sudanese Pound','SDG',2,'938','00000000-0000-0000-0000-000000000000'),
  ('ILS','New Israeli Sheqel','₪',2,'376','00000000-0000-0000-0000-000000000000'),
  ('IRR','Iranian Rial','﷼',2,'364','00000000-0000-0000-0000-000000000000')
on conflict (code) do update set
  name        = excluded.name,
  symbol      = excluded.symbol,
  minor_units = excluded.minor_units,
  numeric3    = excluded.numeric3,
  updated_at  = now(),
  updated_by  = excluded.created_by;

-- ============================================================================
-- Europe (non-EUR)
-- ============================================================================
insert into shared.currency (code, name, symbol, minor_units, numeric3, created_by)
values
  ('ALL','Albanian Lek','L',2,'008','00000000-0000-0000-0000-000000000000'),
  ('BAM','Convertible Mark','KM',2,'977','00000000-0000-0000-0000-000000000000'),
  ('BGN','Bulgarian Lev','лв',2,'975','00000000-0000-0000-0000-000000000000'),
  ('BYN','Belarusian Ruble','Br',2,'933','00000000-0000-0000-0000-000000000000'),
  ('CZK','Czech Koruna','Kč',2,'203','00000000-0000-0000-0000-000000000000'),
  ('DKK','Danish Krone','kr',2,'208','00000000-0000-0000-0000-000000000000'),
  ('GEL','Georgian Lari','₾',2,'981','00000000-0000-0000-0000-000000000000'),
  ('HRK','Croatian Kuna','kn',2,'191','00000000-0000-0000-0000-000000000000'),
  ('HUF','Hungarian Forint','Ft',2,'348','00000000-0000-0000-0000-000000000000'),
  ('ISK','Iceland Krona','kr',0,'352','00000000-0000-0000-0000-000000000000'),
  ('MDL','Moldovan Leu','L',2,'498','00000000-0000-0000-0000-000000000000'),
  ('MKD','Macedonian Denar','ден',2,'807','00000000-0000-0000-0000-000000000000'),
  ('NOK','Norwegian Krone','kr',2,'578','00000000-0000-0000-0000-000000000000'),
  ('PLN','Polish Zloty','zł',2,'985','00000000-0000-0000-0000-000000000000'),
  ('RON','Romanian Leu','lei',2,'946','00000000-0000-0000-0000-000000000000'),
  ('RSD','Serbian Dinar','din.',2,'941','00000000-0000-0000-0000-000000000000'),
  ('RUB','Russian Ruble','₽',2,'643','00000000-0000-0000-0000-000000000000'),
  ('SEK','Swedish Krona','kr',2,'752','00000000-0000-0000-0000-000000000000'),
  ('TRY','Turkish Lira','₺',2,'949','00000000-0000-0000-0000-000000000000'),
  ('UAH','Ukrainian Hryvnia','₴',2,'980','00000000-0000-0000-0000-000000000000')
on conflict (code) do update set
  name        = excluded.name,
  symbol      = excluded.symbol,
  minor_units = excluded.minor_units,
  numeric3    = excluded.numeric3,
  updated_at  = now(),
  updated_by  = excluded.created_by;

-- ============================================================================
-- Asia & Pacific
-- ============================================================================
insert into shared.currency (code, name, symbol, minor_units, numeric3, created_by)
values
  ('AFN','Afghan Afghani','؋',2,'971','00000000-0000-0000-0000-000000000000'),
  ('AMD','Armenian Dram','֏',2,'051','00000000-0000-0000-0000-000000000000'),
  ('AZN','Azerbaijan Manat','₼',2,'944','00000000-0000-0000-0000-000000000000'),
  ('BDT','Bangladeshi Taka','৳',2,'050','00000000-0000-0000-0000-000000000000'),
  ('BND','Brunei Dollar','B$',2,'096','00000000-0000-0000-0000-000000000000'),
  ('BTN','Bhutanese Ngultrum','Nu.',2,'064','00000000-0000-0000-0000-000000000000'),
  ('FJD','Fiji Dollar','FJ$',2,'242','00000000-0000-0000-0000-000000000000'),
  ('IDR','Indonesian Rupiah','Rp',2,'360','00000000-0000-0000-0000-000000000000'),
  ('INR','Indian Rupee','₹',2,'356','00000000-0000-0000-0000-000000000000'),
  ('KGS','Kyrgyzstani Som','сом',2,'417','00000000-0000-0000-0000-000000000000'),
  ('KHR','Cambodian Riel','៛',2,'116','00000000-0000-0000-0000-000000000000'),
  ('KPW','North Korean Won','₩',2,'408','00000000-0000-0000-0000-000000000000'),
  ('KRW','South Korean Won','₩',0,'410','00000000-0000-0000-0000-000000000000'),
  ('KZT','Kazakhstani Tenge','₸',2,'398','00000000-0000-0000-0000-000000000000'),
  ('LAK','Lao Kip','₭',2,'418','00000000-0000-0000-0000-000000000000'),
  ('LKR','Sri Lanka Rupee','Rs',2,'144','00000000-0000-0000-0000-000000000000'),
  ('MMK','Myanmar Kyat','K',2,'104','00000000-0000-0000-0000-000000000000'),
  ('MNT','Mongolian Tugrik','₮',2,'496','00000000-0000-0000-0000-000000000000'),
  ('MOP','Macau Pataca','MOP$',2,'446','00000000-0000-0000-0000-000000000000'),
  ('MVR','Maldivian Rufiyaa','Rf',2,'462','00000000-0000-0000-0000-000000000000'),
  ('MYR','Malaysian Ringgit','RM',2,'458','00000000-0000-0000-0000-000000000000'),
  ('NPR','Nepalese Rupee','Rs',2,'524','00000000-0000-0000-0000-000000000000'),
  ('PGK','Papua New Guinean Kina','K',2,'598','00000000-0000-0000-0000-000000000000'),
  ('PHP','Philippine Peso','₱',2,'608','00000000-0000-0000-0000-000000000000'),
  ('PKR','Pakistan Rupee','Rs',2,'586','00000000-0000-0000-0000-000000000000'),
  ('SBD','Solomon Islands Dollar','SI$',2,'090','00000000-0000-0000-0000-000000000000'),
  ('THB','Thai Baht','฿',2,'764','00000000-0000-0000-0000-000000000000'),
  ('TJS','Tajikistani Somoni','SM',2,'972','00000000-0000-0000-0000-000000000000'),
  ('TMT','Turkmenistani Manat','T',2,'934','00000000-0000-0000-0000-000000000000'),
  ('TOP','Tongan Paʻanga','T$',2,'776','00000000-0000-0000-0000-000000000000'),
  ('TWD','New Taiwan Dollar','NT$',2,'901','00000000-0000-0000-0000-000000000000'),
  ('UZS','Uzbekistani Som','сўм',2,'860','00000000-0000-0000-0000-000000000000'),
  ('VND','Vietnamese Dong','₫',0,'704','00000000-0000-0000-0000-000000000000'),
  ('VUV','Vanuatu Vatu','VT',0,'548','00000000-0000-0000-0000-000000000000'),
  ('WST','Samoan Tala','WS$',2,'882','00000000-0000-0000-0000-000000000000')
on conflict (code) do update set
  name        = excluded.name,
  symbol      = excluded.symbol,
  minor_units = excluded.minor_units,
  numeric3    = excluded.numeric3,
  updated_at  = now(),
  updated_by  = excluded.created_by;

-- ============================================================================
-- Africa
-- ============================================================================
insert into shared.currency (code, name, symbol, minor_units, numeric3, created_by)
values
  ('AOA','Angolan Kwanza','Kz',2,'973','00000000-0000-0000-0000-000000000000'),
  ('BIF','Burundian Franc','FBu',0,'108','00000000-0000-0000-0000-000000000000'),
  ('BWP','Botswana Pula','P',2,'072','00000000-0000-0000-0000-000000000000'),
  ('CDF','Congolese Franc','FC',2,'976','00000000-0000-0000-0000-000000000000'),
  ('CVE','Cabo Verde Escudo','$',2,'132','00000000-0000-0000-0000-000000000000'),
  ('DJF','Djibouti Franc','Fdj',0,'262','00000000-0000-0000-0000-000000000000'),
  ('ERN','Eritrean Nakfa','Nfk',2,'232','00000000-0000-0000-0000-000000000000'),
  ('ETB','Ethiopian Birr','Br',2,'230','00000000-0000-0000-0000-000000000000'),
  ('GHS','Ghana Cedi','GH₵',2,'936','00000000-0000-0000-0000-000000000000'),
  ('GMD','Gambian Dalasi','D',2,'270','00000000-0000-0000-0000-000000000000'),
  ('GNF','Guinean Franc','FG',0,'324','00000000-0000-0000-0000-000000000000'),
  ('KES','Kenyan Shilling','KSh',2,'404','00000000-0000-0000-0000-000000000000'),
  ('KMF','Comorian Franc','CF',0,'174','00000000-0000-0000-0000-000000000000'),
  ('LRD','Liberian Dollar','L$',2,'430','00000000-0000-0000-0000-000000000000'),
  ('LSL','Lesotho Loti','L',2,'426','00000000-0000-0000-0000-000000000000'),
  ('MGA','Malagasy Ariary','Ar',2,'969','00000000-0000-0000-0000-000000000000'),
  ('MRU','Mauritanian Ouguiya','UM',2,'929','00000000-0000-0000-0000-000000000000'),
  ('MUR','Mauritian Rupee','Rs',2,'480','00000000-0000-0000-0000-000000000000'),
  ('MWK','Malawian Kwacha','MK',2,'454','00000000-0000-0000-0000-000000000000'),
  ('MZN','Mozambican Metical','MT',2,'943','00000000-0000-0000-0000-000000000000'),
  ('NAD','Namibia Dollar','N$',2,'516','00000000-0000-0000-0000-000000000000'),
  ('NGN','Nigerian Naira','₦',2,'566','00000000-0000-0000-0000-000000000000'),
  ('RWF','Rwanda Franc','RF',0,'646','00000000-0000-0000-0000-000000000000'),
  ('SCR','Seychelles Rupee','Rs',2,'690','00000000-0000-0000-0000-000000000000'),
  ('SLE','Sierra Leonean Leone','Le',2,'925','00000000-0000-0000-0000-000000000000'),
  ('SOS','Somali Shilling','Sh',2,'706','00000000-0000-0000-0000-000000000000'),
  ('SSP','South Sudanese Pound','£',2,'728','00000000-0000-0000-0000-000000000000'),
  ('STN','São Tomé and Príncipe Dobra','Db',2,'930','00000000-0000-0000-0000-000000000000'),
  ('SZL','Eswatini Lilangeni','E',2,'748','00000000-0000-0000-0000-000000000000'),
  ('TZS','Tanzanian Shilling','TSh',2,'834','00000000-0000-0000-0000-000000000000'),
  ('UGX','Uganda Shilling','USh',0,'800','00000000-0000-0000-0000-000000000000'),
  ('ZAR','South African Rand','R',2,'710','00000000-0000-0000-0000-000000000000'),
  ('ZMW','Zambian Kwacha','ZK',2,'967','00000000-0000-0000-0000-000000000000'),
  ('ZWL','Zimbabwe Dollar','Z$',2,'932','00000000-0000-0000-0000-000000000000'),
  -- ZWG: Zimbabwe Gold — replaced ZWL on 2024-04-05 (ISO 4217 numeric 924)
  ('ZWG','Zimbabwe Gold','ZiG',2,'924','00000000-0000-0000-0000-000000000000')
on conflict (code) do update set
  name        = excluded.name,
  symbol      = excluded.symbol,
  minor_units = excluded.minor_units,
  numeric3    = excluded.numeric3,
  updated_at  = now(),
  updated_by  = excluded.created_by;

-- HRK: Croatia adopted EUR on 2023-01-01; HRK withdrawn from ISO 4217.
update shared.currency
set status = 'deprecated', updated_at = now(), updated_by = '00000000-0000-0000-0000-000000000000'
where code = 'HRK';

-- ZWL: Zimbabwe replaced ZWL with ZWG on 2024-04-05; ZWL withdrawn from ISO 4217.
update shared.currency
set status = 'deprecated', updated_at = now(), updated_by = '00000000-0000-0000-0000-000000000000'
where code = 'ZWL';

-- ============================================================================
-- CFA Franc Zones & Supranational
-- ============================================================================
insert into shared.currency (code, name, symbol, minor_units, numeric3, created_by)
values
  ('XAF','CFA Franc BEAC','FCFA',0,'950','00000000-0000-0000-0000-000000000000'),
  ('XOF','CFA Franc BCEAO','CFA',0,'952','00000000-0000-0000-0000-000000000000'),
  ('XCD','East Caribbean Dollar','EC$',2,'951','00000000-0000-0000-0000-000000000000'),
  ('XPF','CFP Franc','₣',0,'953','00000000-0000-0000-0000-000000000000')
on conflict (code) do update set
  name        = excluded.name,
  symbol      = excluded.symbol,
  minor_units = excluded.minor_units,
  numeric3    = excluded.numeric3,
  updated_at  = now(),
  updated_by  = excluded.created_by;

-- ============================================================================
-- Americas (non-USD)
-- ============================================================================
insert into shared.currency (code, name, symbol, minor_units, numeric3, created_by)
values
  ('ARS','Argentine Peso','$',2,'032','00000000-0000-0000-0000-000000000000'),
  ('BBD','Barbados Dollar','Bds$',2,'052','00000000-0000-0000-0000-000000000000'),
  ('BMD','Bermudian Dollar','BD$',2,'060','00000000-0000-0000-0000-000000000000'),
  ('BOB','Bolivian Boliviano','Bs.',2,'068','00000000-0000-0000-0000-000000000000'),
  ('BRL','Brazilian Real','R$',2,'986','00000000-0000-0000-0000-000000000000'),
  ('BSD','Bahamian Dollar','B$',2,'044','00000000-0000-0000-0000-000000000000'),
  ('BZD','Belize Dollar','BZ$',2,'084','00000000-0000-0000-0000-000000000000'),
  ('CLP','Chilean Peso','$',0,'152','00000000-0000-0000-0000-000000000000'),
  ('COP','Colombian Peso','$',2,'170','00000000-0000-0000-0000-000000000000'),
  ('CRC','Costa Rican Colon','₡',2,'188','00000000-0000-0000-0000-000000000000'),
  ('CUP','Cuban Peso','$',2,'192','00000000-0000-0000-0000-000000000000'),
  ('DOP','Dominican Peso','RD$',2,'214','00000000-0000-0000-0000-000000000000'),
  ('GTQ','Guatemalan Quetzal','Q',2,'320','00000000-0000-0000-0000-000000000000'),
  ('GYD','Guyana Dollar','GY$',2,'328','00000000-0000-0000-0000-000000000000'),
  ('HNL','Honduran Lempira','L',2,'340','00000000-0000-0000-0000-000000000000'),
  ('HTG','Haiti Gourde','G',2,'332','00000000-0000-0000-0000-000000000000'),
  ('JMD','Jamaican Dollar','J$',2,'388','00000000-0000-0000-0000-000000000000'),
  ('KYD','Cayman Islands Dollar','CI$',2,'136','00000000-0000-0000-0000-000000000000'),
  ('MXN','Mexican Peso','Mex$',2,'484','00000000-0000-0000-0000-000000000000'),
  ('NIO','Nicaraguan Cordoba Oro','C$',2,'558','00000000-0000-0000-0000-000000000000'),
  ('PAB','Panamanian Balboa','B/.',2,'590','00000000-0000-0000-0000-000000000000'),
  ('PEN','Peruvian Sol','S/.',2,'604','00000000-0000-0000-0000-000000000000'),
  ('PYG','Paraguayan Guarani','₲',0,'600','00000000-0000-0000-0000-000000000000'),
  ('SRD','Surinam Dollar','$',2,'968','00000000-0000-0000-0000-000000000000'),
  ('TTD','Trinidad and Tobago Dollar','TT$',2,'780','00000000-0000-0000-0000-000000000000'),
  ('UYU','Uruguayan Peso','$U',2,'858','00000000-0000-0000-0000-000000000000'),
  ('VES','Venezuelan Bolívar Soberano','Bs.S',2,'928','00000000-0000-0000-0000-000000000000'),
  ('AWG','Aruban Florin','ƒ',2,'533','00000000-0000-0000-0000-000000000000'),
  ('ANG','Netherlands Antillean Guilder','ƒ',2,'532','00000000-0000-0000-0000-000000000000')
on conflict (code) do update set
  name        = excluded.name,
  symbol      = excluded.symbol,
  minor_units = excluded.minor_units,
  numeric3    = excluded.numeric3,
  updated_at  = now(),
  updated_by  = excluded.created_by;

-- ============================================================================
-- Special / Precious Metals (valid ISO 4217)
-- minor_units intentionally NULL — ISO 4217 defines no subunit for metals/SDR
-- ============================================================================
insert into shared.currency (code, name, symbol, minor_units, numeric3, status, created_by)
values
  ('XAU','Gold (troy ounce)',null,null,'959','active','00000000-0000-0000-0000-000000000000'),
  ('XAG','Silver (troy ounce)',null,null,'961','active','00000000-0000-0000-0000-000000000000'),
  ('XPT','Platinum (troy ounce)',null,null,'962','active','00000000-0000-0000-0000-000000000000'),
  ('XPD','Palladium (troy ounce)',null,null,'964','active','00000000-0000-0000-0000-000000000000'),
  ('XDR','Special Drawing Rights (SDR)',null,null,'960','active','00000000-0000-0000-0000-000000000000')
on conflict (code) do update set
  name        = excluded.name,
  symbol      = excluded.symbol,
  minor_units = excluded.minor_units,
  numeric3    = excluded.numeric3,
  updated_at  = now(),
  updated_by  = excluded.created_by;

-- ============================================================================
-- Financial Rounding Metadata
-- ============================================================================
-- Applied after inserts so they do not interfere with the idempotent upsert above.
-- Only currencies where the commercial rounding increment differs from
-- the ISO 4217 implied value (10^-minor_units) receive an explicit entry.
-- merge into existing metadata so other keys are preserved.

-- CHF: Swiss National Bank mandates cash rounding to 0.05 (5 Rappen).
-- Electronic / interbank transactions still settle at 0.01.
update shared.currency
set metadata = metadata || '{"rounding_increment": "0.05", "cash_rounding": "0.05", "electronic_rounding": "0.01"}'::jsonb
where code = 'CHF';

-- HUF: ISO 4217 minor_units=2 but the fillér has not been in circulation since 1999.
-- All retail and B2B transactions round to the nearest whole forint (1 HUF).
update shared.currency
set metadata = metadata || '{"rounding_increment": "1", "practical_minor_units": 0, "note": "fillér not in circulation; round to whole HUF"}'::jsonb
where code = 'HUF';

-- IDR: ISO 4217 minor_units=2 but the sen subunit is obsolete.
-- Transactions are routinely expressed in whole rupiah; amounts < 1 IDR do not occur.
update shared.currency
set metadata = metadata || '{"rounding_increment": "1", "practical_minor_units": 0, "note": "sen subunit obsolete; round to whole IDR"}'::jsonb
where code = 'IDR';

-- TWD: ISO 4217 minor_units=2; in practice the jiao/fen are not used commercially.
-- Most POS systems and invoices display whole New Taiwan Dollar amounts.
update shared.currency
set metadata = metadata || '{"rounding_increment": "1", "practical_minor_units": 0, "note": "fen subunit not used commercially"}'::jsonb
where code = 'TWD';

-- COP: ISO 4217 minor_units=2; since 2018 Colombia rounds retail transactions to 50 pesos.
-- The centavo has been effectively out of use since the 1990s.
update shared.currency
set metadata = metadata || '{"rounding_increment": "50", "practical_minor_units": 0, "note": "centavo obsolete; retail rounds to 50 COP"}'::jsonb
where code = 'COP';

-- MGA: ISO 4217 minor_units=2; 1 Ariary = 5 iraimbilanja (not 100).
-- The subunit does not follow a decimal scale — store whole Ariary in practice.
update shared.currency
set metadata = metadata || '{"rounding_increment": "1", "practical_minor_units": 0, "note": "1 Ariary = 5 iraimbilanja (non-decimal subunit)"}'::jsonb
where code = 'MGA';

-- MRU: ISO 4217 minor_units=2; 1 Ouguiya = 5 khoums (not 100).
-- Same non-decimal subunit pattern as MGA.
update shared.currency
set metadata = metadata || '{"rounding_increment": "1", "practical_minor_units": 0, "note": "1 Ouguiya = 5 khoums (non-decimal subunit)"}'::jsonb
where code = 'MRU';

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/010_system/001_shared/004_language.sql
-- 900_seed_data/001_shared/004_language.sql
-- Seed: ISO 639-1 languages
-- Schema: shared | Table: language
-- Source: 200_seed_standard.sql (backup)

-- ============================================================================
-- §4  LANGUAGES (ISO 639)
-- ============================================================================

/* ============================================================================
   Athyper — REF Seed: Languages (ISO 639-1)
   PostgreSQL 16+

   ISO 639-1 two-letter language codes with native names and script direction.
   Depends on: 010_ref_master_tables.sql
   ============================================================================ */

insert into shared.language (code, name, native_name, iso639_2, direction, created_by)
values
  ('aa','Afar','Afaraf','aar','ltr','00000000-0000-0000-0000-000000000000'),
  ('ab','Abkhazian','Аҧсуа','abk','ltr','00000000-0000-0000-0000-000000000000'),
  ('af','Afrikaans','Afrikaans','afr','ltr','00000000-0000-0000-0000-000000000000'),
  ('ak','Akan','Akan','aka','ltr','00000000-0000-0000-0000-000000000000'),
  ('am','Amharic','አማርኛ','amh','ltr','00000000-0000-0000-0000-000000000000'),
  ('an','Aragonese','Aragonés','arg','ltr','00000000-0000-0000-0000-000000000000'),
  ('ar','Arabic','العربية','ara','rtl','00000000-0000-0000-0000-000000000000'),
  ('as','Assamese','অসমীয়া','asm','ltr','00000000-0000-0000-0000-000000000000'),
  ('av','Avaric','Авар','ava','ltr','00000000-0000-0000-0000-000000000000'),
  ('ay','Aymara','Aymar aru','aym','ltr','00000000-0000-0000-0000-000000000000'),
  ('az','Azerbaijani','Azərbaycan dili','aze','ltr','00000000-0000-0000-0000-000000000000'),
  ('ba','Bashkir','Башҡорт теле','bak','ltr','00000000-0000-0000-0000-000000000000'),
  ('be','Belarusian','Беларуская','bel','ltr','00000000-0000-0000-0000-000000000000'),
  ('bg','Bulgarian','Български','bul','ltr','00000000-0000-0000-0000-000000000000'),
  ('bh','Bihari languages','भोजपुरी','bih','ltr','00000000-0000-0000-0000-000000000000'),
  ('bi','Bislama','Bislama','bis','ltr','00000000-0000-0000-0000-000000000000'),
  ('bm','Bambara','Bamanankan','bam','ltr','00000000-0000-0000-0000-000000000000'),
  ('bn','Bengali','বাংলা','ben','ltr','00000000-0000-0000-0000-000000000000'),
  ('bo','Tibetan','བོད་ཡིག','bod','ltr','00000000-0000-0000-0000-000000000000'),
  ('br','Breton','Brezhoneg','bre','ltr','00000000-0000-0000-0000-000000000000'),
  ('bs','Bosnian','Bosanski','bos','ltr','00000000-0000-0000-0000-000000000000'),
  ('ca','Catalan','Català','cat','ltr','00000000-0000-0000-0000-000000000000'),
  ('ce','Chechen','Нохчийн мотт','che','ltr','00000000-0000-0000-0000-000000000000'),
  ('ch','Chamorro','Chamoru','cha','ltr','00000000-0000-0000-0000-000000000000'),
  ('co','Corsican','Corsu','cos','ltr','00000000-0000-0000-0000-000000000000'),
  ('cr','Cree','ᓀᐦᐃᔭᐍᐏᐣ','cre','ltr','00000000-0000-0000-0000-000000000000'),
  ('cs','Czech','Čeština','ces','ltr','00000000-0000-0000-0000-000000000000'),
  ('cu','Church Slavic','Словѣньскъ','chu','ltr','00000000-0000-0000-0000-000000000000'),
  ('cv','Chuvash','Чӑвашла','chv','ltr','00000000-0000-0000-0000-000000000000'),
  ('cy','Welsh','Cymraeg','cym','ltr','00000000-0000-0000-0000-000000000000'),
  ('da','Danish','Dansk','dan','ltr','00000000-0000-0000-0000-000000000000'),
  ('de','German','Deutsch','deu','ltr','00000000-0000-0000-0000-000000000000'),
  ('dv','Divehi','ދިވެހި','div','rtl','00000000-0000-0000-0000-000000000000'),
  ('dz','Dzongkha','རྫོང་ཁ','dzo','ltr','00000000-0000-0000-0000-000000000000'),
  ('ee','Ewe','Eʋegbe','ewe','ltr','00000000-0000-0000-0000-000000000000'),
  ('el','Greek','Ελληνικά','ell','ltr','00000000-0000-0000-0000-000000000000'),
  ('en','English','English','eng','ltr','00000000-0000-0000-0000-000000000000'),
  ('eo','Esperanto','Esperanto','epo','ltr','00000000-0000-0000-0000-000000000000'),
  ('es','Spanish','Español','spa','ltr','00000000-0000-0000-0000-000000000000'),
  ('et','Estonian','Eesti','est','ltr','00000000-0000-0000-0000-000000000000'),
  ('eu','Basque','Euskara','eus','ltr','00000000-0000-0000-0000-000000000000'),
  ('fa','Persian','فارسی','fas','rtl','00000000-0000-0000-0000-000000000000'),
  ('ff','Fulah','Fulfulde','ful','ltr','00000000-0000-0000-0000-000000000000'),
  ('fi','Finnish','Suomi','fin','ltr','00000000-0000-0000-0000-000000000000'),
  ('fj','Fijian','Vosa Vakaviti','fij','ltr','00000000-0000-0000-0000-000000000000'),
  ('fo','Faroese','Føroyskt','fao','ltr','00000000-0000-0000-0000-000000000000'),
  ('fr','French','Français','fra','ltr','00000000-0000-0000-0000-000000000000'),
  ('fy','Western Frisian','Frysk','fry','ltr','00000000-0000-0000-0000-000000000000'),
  ('ga','Irish','Gaeilge','gle','ltr','00000000-0000-0000-0000-000000000000'),
  ('gd','Scottish Gaelic','Gàidhlig','gla','ltr','00000000-0000-0000-0000-000000000000'),
  ('gl','Galician','Galego','glg','ltr','00000000-0000-0000-0000-000000000000'),
  ('gn','Guarani','Avañe''ẽ','grn','ltr','00000000-0000-0000-0000-000000000000'),
  ('gu','Gujarati','ગુજરાતી','guj','ltr','00000000-0000-0000-0000-000000000000'),
  ('gv','Manx','Gaelg','glv','ltr','00000000-0000-0000-0000-000000000000'),
  ('ha','Hausa','Hausa','hau','ltr','00000000-0000-0000-0000-000000000000'),
  ('he','Hebrew','עברית','heb','rtl','00000000-0000-0000-0000-000000000000'),
  ('hi','Hindi','हिन्दी','hin','ltr','00000000-0000-0000-0000-000000000000'),
  ('ho','Hiri Motu','Hiri Motu','hmo','ltr','00000000-0000-0000-0000-000000000000'),
  ('hr','Croatian','Hrvatski','hrv','ltr','00000000-0000-0000-0000-000000000000'),
  ('ht','Haitian Creole','Kreyòl ayisyen','hat','ltr','00000000-0000-0000-0000-000000000000'),
  ('hu','Hungarian','Magyar','hun','ltr','00000000-0000-0000-0000-000000000000'),
  ('hy','Armenian','Հայերեն','hye','ltr','00000000-0000-0000-0000-000000000000'),
  ('hz','Herero','Otjiherero','her','ltr','00000000-0000-0000-0000-000000000000'),
  ('ia','Interlingua','Interlingua','ina','ltr','00000000-0000-0000-0000-000000000000'),
  ('id','Indonesian','Bahasa Indonesia','ind','ltr','00000000-0000-0000-0000-000000000000'),
  ('ie','Interlingue','Interlingue','ile','ltr','00000000-0000-0000-0000-000000000000'),
  ('ig','Igbo','Igbo','ibo','ltr','00000000-0000-0000-0000-000000000000'),
  ('ii','Sichuan Yi','ꆈꌠꉙ','iii','ltr','00000000-0000-0000-0000-000000000000'),
  ('ik','Inupiaq','Iñupiaq','ipk','ltr','00000000-0000-0000-0000-000000000000'),
  ('io','Ido','Ido','ido','ltr','00000000-0000-0000-0000-000000000000'),
  ('is','Icelandic','Íslenska','isl','ltr','00000000-0000-0000-0000-000000000000'),
  ('it','Italian','Italiano','ita','ltr','00000000-0000-0000-0000-000000000000'),
  ('iu','Inuktitut','ᐃᓄᒃᑎᑐᑦ','iku','ltr','00000000-0000-0000-0000-000000000000'),
  ('ja','Japanese','日本語','jpn','ltr','00000000-0000-0000-0000-000000000000'),
  ('jv','Javanese','Basa Jawa','jav','ltr','00000000-0000-0000-0000-000000000000'),
  ('ka','Georgian','ქართული','kat','ltr','00000000-0000-0000-0000-000000000000'),
  ('kg','Kongo','KiKongo','kon','ltr','00000000-0000-0000-0000-000000000000'),
  ('ki','Kikuyu','Gĩkũyũ','kik','ltr','00000000-0000-0000-0000-000000000000'),
  ('kj','Kuanyama','Kuanyama','kua','ltr','00000000-0000-0000-0000-000000000000'),
  ('kk','Kazakh','Қазақша','kaz','ltr','00000000-0000-0000-0000-000000000000'),
  ('kl','Kalaallisut','Kalaallisut','kal','ltr','00000000-0000-0000-0000-000000000000'),
  ('km','Khmer','ភាសាខ្មែរ','khm','ltr','00000000-0000-0000-0000-000000000000'),
  ('kn','Kannada','ಕನ್ನಡ','kan','ltr','00000000-0000-0000-0000-000000000000'),
  ('ko','Korean','한국어','kor','ltr','00000000-0000-0000-0000-000000000000'),
  ('kr','Kanuri','Kanuri','kau','ltr','00000000-0000-0000-0000-000000000000'),
  ('ks','Kashmiri','कश्मीरी','kas','rtl','00000000-0000-0000-0000-000000000000'),
  ('ku','Kurdish','Kurdî','kur','rtl','00000000-0000-0000-0000-000000000000'),
  ('kv','Komi','Коми кыв','kom','ltr','00000000-0000-0000-0000-000000000000'),
  ('kw','Cornish','Kernewek','cor','ltr','00000000-0000-0000-0000-000000000000'),
  ('ky','Kirghiz','Кыргызча','kir','ltr','00000000-0000-0000-0000-000000000000'),
  ('la','Latin','Latina','lat','ltr','00000000-0000-0000-0000-000000000000'),
  ('lb','Luxembourgish','Lëtzebuergesch','ltz','ltr','00000000-0000-0000-0000-000000000000'),
  ('lg','Ganda','Luganda','lug','ltr','00000000-0000-0000-0000-000000000000'),
  ('li','Limburgish','Limburgs','lim','ltr','00000000-0000-0000-0000-000000000000'),
  ('ln','Lingala','Lingála','lin','ltr','00000000-0000-0000-0000-000000000000'),
  ('lo','Lao','ພາສາລາວ','lao','ltr','00000000-0000-0000-0000-000000000000'),
  ('lt','Lithuanian','Lietuvių','lit','ltr','00000000-0000-0000-0000-000000000000'),
  ('lu','Luba-Katanga','Tshiluba','lub','ltr','00000000-0000-0000-0000-000000000000'),
  ('lv','Latvian','Latviešu','lav','ltr','00000000-0000-0000-0000-000000000000'),
  ('mg','Malagasy','Malagasy','mlg','ltr','00000000-0000-0000-0000-000000000000'),
  ('mh','Marshallese','Kajin M̧ajeļ','mah','ltr','00000000-0000-0000-0000-000000000000'),
  ('mi','Maori','Te Reo Māori','mri','ltr','00000000-0000-0000-0000-000000000000'),
  ('mk','Macedonian','Македонски','mkd','ltr','00000000-0000-0000-0000-000000000000'),
  ('ml','Malayalam','മലയാളം','mal','ltr','00000000-0000-0000-0000-000000000000'),
  ('mn','Mongolian','Монгол','mon','ltr','00000000-0000-0000-0000-000000000000'),
  ('mr','Marathi','मराठी','mar','ltr','00000000-0000-0000-0000-000000000000'),
  ('ms','Malay','Bahasa Melayu','msa','ltr','00000000-0000-0000-0000-000000000000'),
  ('mt','Maltese','Malti','mlt','ltr','00000000-0000-0000-0000-000000000000'),
  ('my','Burmese','ဗမာစာ','mya','ltr','00000000-0000-0000-0000-000000000000'),
  ('na','Nauru','Ekakairũ Naoero','nau','ltr','00000000-0000-0000-0000-000000000000'),
  ('nb','Norwegian Bokmål','Norsk bokmål','nob','ltr','00000000-0000-0000-0000-000000000000'),
  ('nd','North Ndebele','isiNdebele','nde','ltr','00000000-0000-0000-0000-000000000000'),
  ('ne','Nepali','नेपाली','nep','ltr','00000000-0000-0000-0000-000000000000'),
  ('ng','Ndonga','Owambo','ndo','ltr','00000000-0000-0000-0000-000000000000'),
  ('nl','Dutch','Nederlands','nld','ltr','00000000-0000-0000-0000-000000000000'),
  ('nn','Norwegian Nynorsk','Norsk nynorsk','nno','ltr','00000000-0000-0000-0000-000000000000'),
  ('no','Norwegian','Norsk','nor','ltr','00000000-0000-0000-0000-000000000000'),
  ('nr','South Ndebele','isiNdebele','nbl','ltr','00000000-0000-0000-0000-000000000000'),
  ('nv','Navajo','Diné bizaad','nav','ltr','00000000-0000-0000-0000-000000000000'),
  ('ny','Chichewa','ChiCheŵa','nya','ltr','00000000-0000-0000-0000-000000000000'),
  ('oc','Occitan','Occitan','oci','ltr','00000000-0000-0000-0000-000000000000'),
  ('oj','Ojibwa','ᐊᓂᔑᓈᐯᒧᐎᓐ','oji','ltr','00000000-0000-0000-0000-000000000000'),
  ('om','Oromo','Afaan Oromoo','orm','ltr','00000000-0000-0000-0000-000000000000'),
  ('or','Oriya','ଓଡ଼ିଆ','ori','ltr','00000000-0000-0000-0000-000000000000'),
  ('os','Ossetian','Ирон æвзаг','oss','ltr','00000000-0000-0000-0000-000000000000'),
  ('pa','Punjabi','ਪੰਜਾਬੀ','pan','ltr','00000000-0000-0000-0000-000000000000'),
  ('pi','Pali','पालि','pli','ltr','00000000-0000-0000-0000-000000000000'),
  ('pl','Polish','Polski','pol','ltr','00000000-0000-0000-0000-000000000000'),
  ('ps','Pashto','پښتو','pus','rtl','00000000-0000-0000-0000-000000000000'),
  ('pt','Portuguese','Português','por','ltr','00000000-0000-0000-0000-000000000000'),
  ('qu','Quechua','Runa Simi','que','ltr','00000000-0000-0000-0000-000000000000'),
  ('rm','Romansh','Rumantsch','roh','ltr','00000000-0000-0000-0000-000000000000'),
  ('rn','Rundi','Ikirundi','run','ltr','00000000-0000-0000-0000-000000000000'),
  ('ro','Romanian','Română','ron','ltr','00000000-0000-0000-0000-000000000000'),
  ('ru','Russian','Русский','rus','ltr','00000000-0000-0000-0000-000000000000'),
  ('rw','Kinyarwanda','Ikinyarwanda','kin','ltr','00000000-0000-0000-0000-000000000000'),
  ('sa','Sanskrit','संस्कृतम्','san','ltr','00000000-0000-0000-0000-000000000000'),
  ('sc','Sardinian','Sardu','srd','ltr','00000000-0000-0000-0000-000000000000'),
  ('sd','Sindhi','سنڌي','snd','rtl','00000000-0000-0000-0000-000000000000'),
  ('se','Northern Sami','Davvisámegiella','sme','ltr','00000000-0000-0000-0000-000000000000'),
  ('sg','Sango','Yângâ tî sängö','sag','ltr','00000000-0000-0000-0000-000000000000'),
  ('si','Sinhala','සිංහල','sin','ltr','00000000-0000-0000-0000-000000000000'),
  ('sk','Slovak','Slovenčina','slk','ltr','00000000-0000-0000-0000-000000000000'),
  ('sl','Slovenian','Slovenščina','slv','ltr','00000000-0000-0000-0000-000000000000'),
  ('sm','Samoan','Gagana Samoa','smo','ltr','00000000-0000-0000-0000-000000000000'),
  ('sn','Shona','chiShona','sna','ltr','00000000-0000-0000-0000-000000000000'),
  ('so','Somali','Soomaali','som','ltr','00000000-0000-0000-0000-000000000000'),
  ('sq','Albanian','Shqip','sqi','ltr','00000000-0000-0000-0000-000000000000'),
  ('sr','Serbian','Српски','srp','ltr','00000000-0000-0000-0000-000000000000'),
  ('ss','Swati','SiSwati','ssw','ltr','00000000-0000-0000-0000-000000000000'),
  ('st','Southern Sotho','Sesotho','sot','ltr','00000000-0000-0000-0000-000000000000'),
  ('su','Sundanese','Basa Sunda','sun','ltr','00000000-0000-0000-0000-000000000000'),
  ('sv','Swedish','Svenska','swe','ltr','00000000-0000-0000-0000-000000000000'),
  ('sw','Swahili','Kiswahili','swa','ltr','00000000-0000-0000-0000-000000000000'),
  ('ta','Tamil','தமிழ்','tam','ltr','00000000-0000-0000-0000-000000000000'),
  ('te','Telugu','తెలుగు','tel','ltr','00000000-0000-0000-0000-000000000000'),
  ('tg','Tajik','Тоҷикӣ','tgk','ltr','00000000-0000-0000-0000-000000000000'),
  ('th','Thai','ไทย','tha','ltr','00000000-0000-0000-0000-000000000000'),
  ('ti','Tigrinya','ትግርኛ','tir','ltr','00000000-0000-0000-0000-000000000000'),
  ('tk','Turkmen','Türkmen','tuk','ltr','00000000-0000-0000-0000-000000000000'),
  ('tl','Tagalog','Wikang Tagalog','tgl','ltr','00000000-0000-0000-0000-000000000000'),
  ('tn','Tswana','Setswana','tsn','ltr','00000000-0000-0000-0000-000000000000'),
  ('to','Tonga','Faka Tonga','ton','ltr','00000000-0000-0000-0000-000000000000'),
  ('tr','Turkish','Türkçe','tur','ltr','00000000-0000-0000-0000-000000000000'),
  ('ts','Tsonga','Xitsonga','tso','ltr','00000000-0000-0000-0000-000000000000'),
  ('tt','Tatar','Татарча','tat','ltr','00000000-0000-0000-0000-000000000000'),
  ('tw','Twi','Twi','twi','ltr','00000000-0000-0000-0000-000000000000'),
  ('ty','Tahitian','Reo Tahiti','tah','ltr','00000000-0000-0000-0000-000000000000'),
  ('ug','Uyghur','ئۇيغۇرچە','uig','rtl','00000000-0000-0000-0000-000000000000'),
  ('uk','Ukrainian','Українська','ukr','ltr','00000000-0000-0000-0000-000000000000'),
  ('ur','Urdu','اردو','urd','rtl','00000000-0000-0000-0000-000000000000'),
  ('uz','Uzbek','O''zbek','uzb','ltr','00000000-0000-0000-0000-000000000000'),
  ('ve','Venda','Tshivenḓa','ven','ltr','00000000-0000-0000-0000-000000000000'),
  ('vi','Vietnamese','Tiếng Việt','vie','ltr','00000000-0000-0000-0000-000000000000'),
  ('vo','Volapük','Volapük','vol','ltr','00000000-0000-0000-0000-000000000000'),
  ('wa','Walloon','Walon','wln','ltr','00000000-0000-0000-0000-000000000000'),
  ('wo','Wolof','Wollof','wol','ltr','00000000-0000-0000-0000-000000000000'),
  ('xh','Xhosa','isiXhosa','xho','ltr','00000000-0000-0000-0000-000000000000'),
  ('yi','Yiddish','ייִדיש','yid','rtl','00000000-0000-0000-0000-000000000000'),
  ('yo','Yoruba','Yorùbá','yor','ltr','00000000-0000-0000-0000-000000000000'),
  ('za','Zhuang','Saɯ cueŋƅ','zha','ltr','00000000-0000-0000-0000-000000000000'),
  ('zh','Chinese','中文','zho','ltr','00000000-0000-0000-0000-000000000000'),
  ('zu','Zulu','isiZulu','zul','ltr','00000000-0000-0000-0000-000000000000')
on conflict (code) do update set
  name        = excluded.name,
  native_name = excluded.native_name,
  iso639_2    = excluded.iso639_2,
  direction   = excluded.direction,
  updated_at  = now(),
  updated_by  = excluded.created_by;


-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/010_system/001_shared/005_locale.sql
-- 900_seed_data/001_shared/005_locale.sql
-- Seed: BCP 47 locales
-- Schema: shared | Table: locale
--
-- Best-practice notes
-- ───────────────────
-- direction is always set explicitly ('ltr' or 'rtl') — never null — so the
--   application never needs to guess or derive it from the language record.
-- script uses ISO 15924 four-letter codes (e.g. Latn, Arab, Hebr, Deva).
-- on conflict do update → re-running propagates corrections.
-- RTL locales covered: Arabic (all country variants), Hebrew, Persian/Dari,
--   Pashto, Urdu, Kurdish Sorani, Sindhi, Uyghur, Yiddish.

-- ============================================================================
-- Language-only locales (no country qualifier)
-- ============================================================================
insert into shared.locale (code, language_code, country_code, script, name, direction, created_by)
values
  -- Major world languages (base locales)
  ('af',    'af', null, 'Latn', 'Afrikaans',              'ltr', '00000000-0000-0000-0000-000000000000'),
  ('am',    'am', null, 'Ethi', 'Amharic',                'ltr', '00000000-0000-0000-0000-000000000000'),
  ('ar',    'ar', null, 'Arab', 'Arabic',                  'rtl', '00000000-0000-0000-0000-000000000000'),
  ('az',    'az', null, 'Latn', 'Azerbaijani',             'ltr', '00000000-0000-0000-0000-000000000000'),
  ('be',    'be', null, 'Cyrl', 'Belarusian',              'ltr', '00000000-0000-0000-0000-000000000000'),
  ('bg',    'bg', null, 'Cyrl', 'Bulgarian',               'ltr', '00000000-0000-0000-0000-000000000000'),
  ('bn',    'bn', null, 'Beng', 'Bengali',                 'ltr', '00000000-0000-0000-0000-000000000000'),
  ('bs',    'bs', null, 'Latn', 'Bosnian',                 'ltr', '00000000-0000-0000-0000-000000000000'),
  ('ca',    'ca', null, 'Latn', 'Catalan',                 'ltr', '00000000-0000-0000-0000-000000000000'),
  ('cs',    'cs', null, 'Latn', 'Czech',                   'ltr', '00000000-0000-0000-0000-000000000000'),
  ('cy',    'cy', null, 'Latn', 'Welsh',                   'ltr', '00000000-0000-0000-0000-000000000000'),
  ('da',    'da', null, 'Latn', 'Danish',                  'ltr', '00000000-0000-0000-0000-000000000000'),
  ('de',    'de', null, 'Latn', 'German',                  'ltr', '00000000-0000-0000-0000-000000000000'),
  ('el',    'el', null, 'Grek', 'Greek',                   'ltr', '00000000-0000-0000-0000-000000000000'),
  ('en',    'en', null, 'Latn', 'English',                 'ltr', '00000000-0000-0000-0000-000000000000'),
  ('es',    'es', null, 'Latn', 'Spanish',                 'ltr', '00000000-0000-0000-0000-000000000000'),
  ('et',    'et', null, 'Latn', 'Estonian',                'ltr', '00000000-0000-0000-0000-000000000000'),
  ('eu',    'eu', null, 'Latn', 'Basque',                  'ltr', '00000000-0000-0000-0000-000000000000'),
  ('fa',    'fa', null, 'Arab', 'Persian',                 'rtl', '00000000-0000-0000-0000-000000000000'),
  ('fi',    'fi', null, 'Latn', 'Finnish',                 'ltr', '00000000-0000-0000-0000-000000000000'),
  ('fr',    'fr', null, 'Latn', 'French',                  'ltr', '00000000-0000-0000-0000-000000000000'),
  ('ga',    'ga', null, 'Latn', 'Irish',                   'ltr', '00000000-0000-0000-0000-000000000000'),
  ('gl',    'gl', null, 'Latn', 'Galician',                'ltr', '00000000-0000-0000-0000-000000000000'),
  ('gu',    'gu', null, 'Gujr', 'Gujarati',                'ltr', '00000000-0000-0000-0000-000000000000'),
  ('he',    'he', null, 'Hebr', 'Hebrew',                  'rtl', '00000000-0000-0000-0000-000000000000'),
  ('hi',    'hi', null, 'Deva', 'Hindi',                   'ltr', '00000000-0000-0000-0000-000000000000'),
  ('hr',    'hr', null, 'Latn', 'Croatian',                'ltr', '00000000-0000-0000-0000-000000000000'),
  ('hu',    'hu', null, 'Latn', 'Hungarian',               'ltr', '00000000-0000-0000-0000-000000000000'),
  ('hy',    'hy', null, 'Armn', 'Armenian',                'ltr', '00000000-0000-0000-0000-000000000000'),
  ('id',    'id', null, 'Latn', 'Indonesian',              'ltr', '00000000-0000-0000-0000-000000000000'),
  ('is',    'is', null, 'Latn', 'Icelandic',               'ltr', '00000000-0000-0000-0000-000000000000'),
  ('it',    'it', null, 'Latn', 'Italian',                 'ltr', '00000000-0000-0000-0000-000000000000'),
  ('ja',    'ja', null, 'Jpan', 'Japanese',                'ltr', '00000000-0000-0000-0000-000000000000'),
  ('ka',    'ka', null, 'Geor', 'Georgian',                'ltr', '00000000-0000-0000-0000-000000000000'),
  ('kk',    'kk', null, 'Cyrl', 'Kazakh',                  'ltr', '00000000-0000-0000-0000-000000000000'),
  ('km',    'km', null, 'Khmr', 'Khmer',                   'ltr', '00000000-0000-0000-0000-000000000000'),
  ('kn',    'kn', null, 'Knda', 'Kannada',                 'ltr', '00000000-0000-0000-0000-000000000000'),
  ('ko',    'ko', null, 'Kore', 'Korean',                  'ltr', '00000000-0000-0000-0000-000000000000'),
  -- Kurdish base locale uses Latin script (Kurmanji default); Sorani/Arabic-script
  -- variants are added as country-qualified locales below (ku-IQ, ku-IR)
  ('ku',    'ku', null, 'Latn', 'Kurdish',                 'ltr', '00000000-0000-0000-0000-000000000000'),
  ('lo',    'lo', null, 'Laoo', 'Lao',                     'ltr', '00000000-0000-0000-0000-000000000000'),
  ('lt',    'lt', null, 'Latn', 'Lithuanian',              'ltr', '00000000-0000-0000-0000-000000000000'),
  ('lv',    'lv', null, 'Latn', 'Latvian',                 'ltr', '00000000-0000-0000-0000-000000000000'),
  ('mk',    'mk', null, 'Cyrl', 'Macedonian',              'ltr', '00000000-0000-0000-0000-000000000000'),
  ('ml',    'ml', null, 'Mlym', 'Malayalam',               'ltr', '00000000-0000-0000-0000-000000000000'),
  ('mn',    'mn', null, 'Cyrl', 'Mongolian',               'ltr', '00000000-0000-0000-0000-000000000000'),
  ('mr',    'mr', null, 'Deva', 'Marathi',                 'ltr', '00000000-0000-0000-0000-000000000000'),
  ('ms',    'ms', null, 'Latn', 'Malay',                   'ltr', '00000000-0000-0000-0000-000000000000'),
  ('mt',    'mt', null, 'Latn', 'Maltese',                 'ltr', '00000000-0000-0000-0000-000000000000'),
  ('my',    'my', null, 'Mymr', 'Burmese',                 'ltr', '00000000-0000-0000-0000-000000000000'),
  ('nb',    'nb', null, 'Latn', 'Norwegian Bokmål',       'ltr', '00000000-0000-0000-0000-000000000000'),
  ('ne',    'ne', null, 'Deva', 'Nepali',                  'ltr', '00000000-0000-0000-0000-000000000000'),
  ('nl',    'nl', null, 'Latn', 'Dutch',                   'ltr', '00000000-0000-0000-0000-000000000000'),
  ('nn',    'nn', null, 'Latn', 'Norwegian Nynorsk',       'ltr', '00000000-0000-0000-0000-000000000000'),
  ('pa',    'pa', null, 'Guru', 'Punjabi',                 'ltr', '00000000-0000-0000-0000-000000000000'),
  ('pl',    'pl', null, 'Latn', 'Polish',                  'ltr', '00000000-0000-0000-0000-000000000000'),
  ('ps',    'ps', null, 'Arab', 'Pashto',                  'rtl', '00000000-0000-0000-0000-000000000000'),
  ('pt',    'pt', null, 'Latn', 'Portuguese',              'ltr', '00000000-0000-0000-0000-000000000000'),
  ('ro',    'ro', null, 'Latn', 'Romanian',                'ltr', '00000000-0000-0000-0000-000000000000'),
  ('ru',    'ru', null, 'Cyrl', 'Russian',                 'ltr', '00000000-0000-0000-0000-000000000000'),
  -- Sindhi base locale: Arabic script used in Pakistan (primary population).
  -- Devanagari-script variant (India) added as sd-IN below.
  ('sd',    'sd', null, 'Arab', 'Sindhi',                  'rtl', '00000000-0000-0000-0000-000000000000'),
  ('si',    'si', null, 'Sinh', 'Sinhala',                 'ltr', '00000000-0000-0000-0000-000000000000'),
  ('sk',    'sk', null, 'Latn', 'Slovak',                  'ltr', '00000000-0000-0000-0000-000000000000'),
  ('sl',    'sl', null, 'Latn', 'Slovenian',               'ltr', '00000000-0000-0000-0000-000000000000'),
  ('so',    'so', null, 'Latn', 'Somali',                  'ltr', '00000000-0000-0000-0000-000000000000'),
  ('sq',    'sq', null, 'Latn', 'Albanian',                'ltr', '00000000-0000-0000-0000-000000000000'),
  ('sr',    'sr', null, 'Cyrl', 'Serbian',                 'ltr', '00000000-0000-0000-0000-000000000000'),
  ('sv',    'sv', null, 'Latn', 'Swedish',                 'ltr', '00000000-0000-0000-0000-000000000000'),
  ('sw',    'sw', null, 'Latn', 'Swahili',                 'ltr', '00000000-0000-0000-0000-000000000000'),
  ('ta',    'ta', null, 'Taml', 'Tamil',                   'ltr', '00000000-0000-0000-0000-000000000000'),
  ('te',    'te', null, 'Telu', 'Telugu',                  'ltr', '00000000-0000-0000-0000-000000000000'),
  ('th',    'th', null, 'Thai', 'Thai',                    'ltr', '00000000-0000-0000-0000-000000000000'),
  ('tl',    'tl', null, 'Latn', 'Filipino',                'ltr', '00000000-0000-0000-0000-000000000000'),
  ('tr',    'tr', null, 'Latn', 'Turkish',                 'ltr', '00000000-0000-0000-0000-000000000000'),
  -- Uyghur: Arabic Perso-Arabic script (dominant in Xinjiang); Latin and Cyrillic
  -- variants are not widely used but added below as ug-Latn if needed.
  ('ug',    'ug', null, 'Arab', 'Uyghur',                  'rtl', '00000000-0000-0000-0000-000000000000'),
  ('uk',    'uk', null, 'Cyrl', 'Ukrainian',               'ltr', '00000000-0000-0000-0000-000000000000'),
  ('ur',    'ur', null, 'Arab', 'Urdu',                    'rtl', '00000000-0000-0000-0000-000000000000'),
  ('uz',    'uz', null, 'Latn', 'Uzbek',                   'ltr', '00000000-0000-0000-0000-000000000000'),
  ('vi',    'vi', null, 'Latn', 'Vietnamese',              'ltr', '00000000-0000-0000-0000-000000000000'),
  -- Yiddish: Hebrew script, right-to-left. Primarily Ashkenazi Jewish communities.
  ('yi',    'yi', null, 'Hebr', 'Yiddish',                 'rtl', '00000000-0000-0000-0000-000000000000'),
  ('zh',    'zh', null, 'Hans', 'Chinese',                 'ltr', '00000000-0000-0000-0000-000000000000'),
  ('zu',    'zu', null, 'Latn', 'Zulu',                    'ltr', '00000000-0000-0000-0000-000000000000')
on conflict (code) do update set
  name          = excluded.name,
  language_code = excluded.language_code,
  country_code  = excluded.country_code,
  script        = excluded.script,
  direction     = excluded.direction,
  updated_at    = now(),
  updated_by    = excluded.created_by;

-- ----------------------------------------------------------------------------
-- Country-qualified locales (language-COUNTRY)
-- ----------------------------------------------------------------------------

-- Arabic variants (all RTL, Arab script)
insert into shared.locale (code, language_code, country_code, script, name, direction, created_by)
values
  ('ar-SA', 'ar', 'SA', 'Arab', 'Arabic (Saudi Arabia)',            'rtl', '00000000-0000-0000-0000-000000000000'),
  ('ar-AE', 'ar', 'AE', 'Arab', 'Arabic (United Arab Emirates)',    'rtl', '00000000-0000-0000-0000-000000000000'),
  ('ar-BH', 'ar', 'BH', 'Arab', 'Arabic (Bahrain)',                 'rtl', '00000000-0000-0000-0000-000000000000'),
  ('ar-DZ', 'ar', 'DZ', 'Arab', 'Arabic (Algeria)',                 'rtl', '00000000-0000-0000-0000-000000000000'),
  ('ar-EG', 'ar', 'EG', 'Arab', 'Arabic (Egypt)',                   'rtl', '00000000-0000-0000-0000-000000000000'),
  ('ar-IQ', 'ar', 'IQ', 'Arab', 'Arabic (Iraq)',                    'rtl', '00000000-0000-0000-0000-000000000000'),
  ('ar-JO', 'ar', 'JO', 'Arab', 'Arabic (Jordan)',                  'rtl', '00000000-0000-0000-0000-000000000000'),
  ('ar-KW', 'ar', 'KW', 'Arab', 'Arabic (Kuwait)',                  'rtl', '00000000-0000-0000-0000-000000000000'),
  ('ar-LB', 'ar', 'LB', 'Arab', 'Arabic (Lebanon)',                 'rtl', '00000000-0000-0000-0000-000000000000'),
  ('ar-LY', 'ar', 'LY', 'Arab', 'Arabic (Libya)',                   'rtl', '00000000-0000-0000-0000-000000000000'),
  ('ar-MA', 'ar', 'MA', 'Arab', 'Arabic (Morocco)',                 'rtl', '00000000-0000-0000-0000-000000000000'),
  ('ar-OM', 'ar', 'OM', 'Arab', 'Arabic (Oman)',                    'rtl', '00000000-0000-0000-0000-000000000000'),
  ('ar-QA', 'ar', 'QA', 'Arab', 'Arabic (Qatar)',                   'rtl', '00000000-0000-0000-0000-000000000000'),
  ('ar-SD', 'ar', 'SD', 'Arab', 'Arabic (Sudan)',                   'rtl', '00000000-0000-0000-0000-000000000000'),
  ('ar-SY', 'ar', 'SY', 'Arab', 'Arabic (Syria)',                   'rtl', '00000000-0000-0000-0000-000000000000'),
  ('ar-TN', 'ar', 'TN', 'Arab', 'Arabic (Tunisia)',                 'rtl', '00000000-0000-0000-0000-000000000000'),
  ('ar-YE', 'ar', 'YE', 'Arab', 'Arabic (Yemen)',                   'rtl', '00000000-0000-0000-0000-000000000000')
on conflict (code) do update set
  name          = excluded.name,
  language_code = excluded.language_code,
  country_code  = excluded.country_code,
  script        = excluded.script,
  direction     = excluded.direction,
  updated_at    = now(),
  updated_by    = excluded.created_by;

-- English variants
insert into shared.locale (code, language_code, country_code, script, name, direction, created_by)
values
  ('en-US', 'en', 'US', 'Latn', 'English (United States)',          'ltr', '00000000-0000-0000-0000-000000000000'),
  ('en-GB', 'en', 'GB', 'Latn', 'English (United Kingdom)',         'ltr', '00000000-0000-0000-0000-000000000000'),
  ('en-AU', 'en', 'AU', 'Latn', 'English (Australia)',              'ltr', '00000000-0000-0000-0000-000000000000'),
  ('en-CA', 'en', 'CA', 'Latn', 'English (Canada)',                 'ltr', '00000000-0000-0000-0000-000000000000'),
  ('en-IE', 'en', 'IE', 'Latn', 'English (Ireland)',                'ltr', '00000000-0000-0000-0000-000000000000'),
  ('en-IN', 'en', 'IN', 'Latn', 'English (India)',                  'ltr', '00000000-0000-0000-0000-000000000000'),
  ('en-NZ', 'en', 'NZ', 'Latn', 'English (New Zealand)',            'ltr', '00000000-0000-0000-0000-000000000000'),
  ('en-PH', 'en', 'PH', 'Latn', 'English (Philippines)',            'ltr', '00000000-0000-0000-0000-000000000000'),
  ('en-SG', 'en', 'SG', 'Latn', 'English (Singapore)',              'ltr', '00000000-0000-0000-0000-000000000000'),
  ('en-ZA', 'en', 'ZA', 'Latn', 'English (South Africa)',           'ltr', '00000000-0000-0000-0000-000000000000'),
  ('en-HK', 'en', 'HK', 'Latn', 'English (Hong Kong)',              'ltr', '00000000-0000-0000-0000-000000000000'),
  ('en-KE', 'en', 'KE', 'Latn', 'English (Kenya)',                  'ltr', '00000000-0000-0000-0000-000000000000'),
  ('en-NG', 'en', 'NG', 'Latn', 'English (Nigeria)',                'ltr', '00000000-0000-0000-0000-000000000000')
on conflict (code) do update set
  name          = excluded.name,
  language_code = excluded.language_code,
  country_code  = excluded.country_code,
  script        = excluded.script,
  direction     = excluded.direction,
  updated_at    = now(),
  updated_by    = excluded.created_by;

-- Spanish variants
insert into shared.locale (code, language_code, country_code, script, name, direction, created_by)
values
  ('es-ES', 'es', 'ES', 'Latn', 'Spanish (Spain)',                  'ltr', '00000000-0000-0000-0000-000000000000'),
  ('es-MX', 'es', 'MX', 'Latn', 'Spanish (Mexico)',                 'ltr', '00000000-0000-0000-0000-000000000000'),
  ('es-AR', 'es', 'AR', 'Latn', 'Spanish (Argentina)',              'ltr', '00000000-0000-0000-0000-000000000000'),
  ('es-CL', 'es', 'CL', 'Latn', 'Spanish (Chile)',                  'ltr', '00000000-0000-0000-0000-000000000000'),
  ('es-CO', 'es', 'CO', 'Latn', 'Spanish (Colombia)',               'ltr', '00000000-0000-0000-0000-000000000000'),
  ('es-PE', 'es', 'PE', 'Latn', 'Spanish (Peru)',                   'ltr', '00000000-0000-0000-0000-000000000000'),
  ('es-VE', 'es', 'VE', 'Latn', 'Spanish (Venezuela)',              'ltr', '00000000-0000-0000-0000-000000000000'),
  ('es-EC', 'es', 'EC', 'Latn', 'Spanish (Ecuador)',                'ltr', '00000000-0000-0000-0000-000000000000'),
  ('es-UY', 'es', 'UY', 'Latn', 'Spanish (Uruguay)',                'ltr', '00000000-0000-0000-0000-000000000000'),
  ('es-CR', 'es', 'CR', 'Latn', 'Spanish (Costa Rica)',             'ltr', '00000000-0000-0000-0000-000000000000')
on conflict (code) do update set
  name          = excluded.name,
  language_code = excluded.language_code,
  country_code  = excluded.country_code,
  script        = excluded.script,
  direction     = excluded.direction,
  updated_at    = now(),
  updated_by    = excluded.created_by;

-- French variants
insert into shared.locale (code, language_code, country_code, script, name, direction, created_by)
values
  ('fr-FR', 'fr', 'FR', 'Latn', 'French (France)',                  'ltr', '00000000-0000-0000-0000-000000000000'),
  ('fr-BE', 'fr', 'BE', 'Latn', 'French (Belgium)',                 'ltr', '00000000-0000-0000-0000-000000000000'),
  ('fr-CA', 'fr', 'CA', 'Latn', 'French (Canada)',                  'ltr', '00000000-0000-0000-0000-000000000000'),
  ('fr-CH', 'fr', 'CH', 'Latn', 'French (Switzerland)',             'ltr', '00000000-0000-0000-0000-000000000000'),
  ('fr-LU', 'fr', 'LU', 'Latn', 'French (Luxembourg)',              'ltr', '00000000-0000-0000-0000-000000000000'),
  ('fr-SN', 'fr', 'SN', 'Latn', 'French (Senegal)',                 'ltr', '00000000-0000-0000-0000-000000000000'),
  ('fr-CI', 'fr', 'CI', 'Latn', 'French (Côte d''Ivoire)',         'ltr', '00000000-0000-0000-0000-000000000000'),
  ('fr-CM', 'fr', 'CM', 'Latn', 'French (Cameroon)',                'ltr', '00000000-0000-0000-0000-000000000000'),
  ('fr-MA', 'fr', 'MA', 'Latn', 'French (Morocco)',                 'ltr', '00000000-0000-0000-0000-000000000000'),
  ('fr-TN', 'fr', 'TN', 'Latn', 'French (Tunisia)',                 'ltr', '00000000-0000-0000-0000-000000000000')
on conflict (code) do update set
  name          = excluded.name,
  language_code = excluded.language_code,
  country_code  = excluded.country_code,
  script        = excluded.script,
  direction     = excluded.direction,
  updated_at    = now(),
  updated_by    = excluded.created_by;

-- German variants
insert into shared.locale (code, language_code, country_code, script, name, direction, created_by)
values
  ('de-DE', 'de', 'DE', 'Latn', 'German (Germany)',                 'ltr', '00000000-0000-0000-0000-000000000000'),
  ('de-AT', 'de', 'AT', 'Latn', 'German (Austria)',                 'ltr', '00000000-0000-0000-0000-000000000000'),
  ('de-CH', 'de', 'CH', 'Latn', 'German (Switzerland)',             'ltr', '00000000-0000-0000-0000-000000000000'),
  ('de-LU', 'de', 'LU', 'Latn', 'German (Luxembourg)',              'ltr', '00000000-0000-0000-0000-000000000000'),
  ('de-LI', 'de', 'LI', 'Latn', 'German (Liechtenstein)',           'ltr', '00000000-0000-0000-0000-000000000000')
on conflict (code) do update set
  name          = excluded.name,
  language_code = excluded.language_code,
  country_code  = excluded.country_code,
  script        = excluded.script,
  direction     = excluded.direction,
  updated_at    = now(),
  updated_by    = excluded.created_by;

-- Portuguese variants
insert into shared.locale (code, language_code, country_code, script, name, direction, created_by)
values
  ('pt-BR', 'pt', 'BR', 'Latn', 'Portuguese (Brazil)',              'ltr', '00000000-0000-0000-0000-000000000000'),
  ('pt-PT', 'pt', 'PT', 'Latn', 'Portuguese (Portugal)',            'ltr', '00000000-0000-0000-0000-000000000000'),
  ('pt-AO', 'pt', 'AO', 'Latn', 'Portuguese (Angola)',              'ltr', '00000000-0000-0000-0000-000000000000'),
  ('pt-MZ', 'pt', 'MZ', 'Latn', 'Portuguese (Mozambique)',          'ltr', '00000000-0000-0000-0000-000000000000')
on conflict (code) do update set
  name          = excluded.name,
  language_code = excluded.language_code,
  country_code  = excluded.country_code,
  script        = excluded.script,
  direction     = excluded.direction,
  updated_at    = now(),
  updated_by    = excluded.created_by;

-- Chinese variants (simplified vs. traditional distinguished by script)
insert into shared.locale (code, language_code, country_code, script, name, direction, created_by)
values
  ('zh-CN', 'zh', 'CN', 'Hans', 'Chinese (Simplified, China)',      'ltr', '00000000-0000-0000-0000-000000000000'),
  ('zh-TW', 'zh', 'TW', 'Hant', 'Chinese (Traditional, Taiwan)',    'ltr', '00000000-0000-0000-0000-000000000000'),
  ('zh-HK', 'zh', 'HK', 'Hant', 'Chinese (Traditional, Hong Kong)', 'ltr', '00000000-0000-0000-0000-000000000000'),
  ('zh-SG', 'zh', 'SG', 'Hans', 'Chinese (Simplified, Singapore)',  'ltr', '00000000-0000-0000-0000-000000000000')
on conflict (code) do update set
  name          = excluded.name,
  language_code = excluded.language_code,
  country_code  = excluded.country_code,
  script        = excluded.script,
  direction     = excluded.direction,
  updated_at    = now(),
  updated_by    = excluded.created_by;

-- Other major country-qualified locales
insert into shared.locale (code, language_code, country_code, script, name, direction, created_by)
values
  -- South Asia
  ('hi-IN', 'hi', 'IN', 'Deva', 'Hindi (India)',                    'ltr', '00000000-0000-0000-0000-000000000000'),
  ('bn-BD', 'bn', 'BD', 'Beng', 'Bengali (Bangladesh)',             'ltr', '00000000-0000-0000-0000-000000000000'),
  ('bn-IN', 'bn', 'IN', 'Beng', 'Bengali (India)',                  'ltr', '00000000-0000-0000-0000-000000000000'),
  ('ta-IN', 'ta', 'IN', 'Taml', 'Tamil (India)',                    'ltr', '00000000-0000-0000-0000-000000000000'),
  ('ta-LK', 'ta', 'LK', 'Taml', 'Tamil (Sri Lanka)',               'ltr', '00000000-0000-0000-0000-000000000000'),
  ('te-IN', 'te', 'IN', 'Telu', 'Telugu (India)',                   'ltr', '00000000-0000-0000-0000-000000000000'),
  ('ml-IN', 'ml', 'IN', 'Mlym', 'Malayalam (India)',                'ltr', '00000000-0000-0000-0000-000000000000'),
  ('kn-IN', 'kn', 'IN', 'Knda', 'Kannada (India)',                 'ltr', '00000000-0000-0000-0000-000000000000'),
  ('gu-IN', 'gu', 'IN', 'Gujr', 'Gujarati (India)',                'ltr', '00000000-0000-0000-0000-000000000000'),
  ('mr-IN', 'mr', 'IN', 'Deva', 'Marathi (India)',                 'ltr', '00000000-0000-0000-0000-000000000000'),
  ('pa-IN', 'pa', 'IN', 'Guru', 'Punjabi (India)',                 'ltr', '00000000-0000-0000-0000-000000000000'),
  ('ur-PK', 'ur', 'PK', 'Arab', 'Urdu (Pakistan)',                  'rtl', '00000000-0000-0000-0000-000000000000'),
  ('ur-IN', 'ur', 'IN', 'Arab', 'Urdu (India)',                     'rtl', '00000000-0000-0000-0000-000000000000'),
  ('si-LK', 'si', 'LK', 'Sinh', 'Sinhala (Sri Lanka)',             'ltr', '00000000-0000-0000-0000-000000000000'),
  ('ne-NP', 'ne', 'NP', 'Deva', 'Nepali (Nepal)',                  'ltr', '00000000-0000-0000-0000-000000000000'),
  ('sd-PK', 'sd', 'PK', 'Arab', 'Sindhi (Pakistan)',               'rtl', '00000000-0000-0000-0000-000000000000'),
  ('sd-IN', 'sd', 'IN', 'Deva', 'Sindhi (India)',                  'ltr', '00000000-0000-0000-0000-000000000000'),

  -- East/Southeast Asia
  ('ja-JP', 'ja', 'JP', 'Jpan', 'Japanese (Japan)',                 'ltr', '00000000-0000-0000-0000-000000000000'),
  ('ko-KR', 'ko', 'KR', 'Kore', 'Korean (South Korea)',            'ltr', '00000000-0000-0000-0000-000000000000'),
  ('th-TH', 'th', 'TH', 'Thai', 'Thai (Thailand)',                 'ltr', '00000000-0000-0000-0000-000000000000'),
  ('vi-VN', 'vi', 'VN', 'Latn', 'Vietnamese (Vietnam)',            'ltr', '00000000-0000-0000-0000-000000000000'),
  ('id-ID', 'id', 'ID', 'Latn', 'Indonesian (Indonesia)',          'ltr', '00000000-0000-0000-0000-000000000000'),
  ('ms-MY', 'ms', 'MY', 'Latn', 'Malay (Malaysia)',                'ltr', '00000000-0000-0000-0000-000000000000'),
  ('ms-SG', 'ms', 'SG', 'Latn', 'Malay (Singapore)',               'ltr', '00000000-0000-0000-0000-000000000000'),
  ('tl-PH', 'tl', 'PH', 'Latn', 'Filipino (Philippines)',          'ltr', '00000000-0000-0000-0000-000000000000'),
  ('my-MM', 'my', 'MM', 'Mymr', 'Burmese (Myanmar)',               'ltr', '00000000-0000-0000-0000-000000000000'),
  ('km-KH', 'km', 'KH', 'Khmr', 'Khmer (Cambodia)',               'ltr', '00000000-0000-0000-0000-000000000000'),
  ('lo-LA', 'lo', 'LA', 'Laoo', 'Lao (Laos)',                     'ltr', '00000000-0000-0000-0000-000000000000'),
  ('mn-MN', 'mn', 'MN', 'Cyrl', 'Mongolian (Mongolia)',            'ltr', '00000000-0000-0000-0000-000000000000'),
  -- Uyghur in China uses Arabic Perso-Arabic script → RTL
  ('ug-CN', 'ug', 'CN', 'Arab', 'Uyghur (China)',                  'rtl', '00000000-0000-0000-0000-000000000000'),

  -- Europe (one main locale per language)
  ('nl-NL', 'nl', 'NL', 'Latn', 'Dutch (Netherlands)',             'ltr', '00000000-0000-0000-0000-000000000000'),
  ('nl-BE', 'nl', 'BE', 'Latn', 'Dutch (Belgium)',                 'ltr', '00000000-0000-0000-0000-000000000000'),
  ('it-IT', 'it', 'IT', 'Latn', 'Italian (Italy)',                 'ltr', '00000000-0000-0000-0000-000000000000'),
  ('it-CH', 'it', 'CH', 'Latn', 'Italian (Switzerland)',            'ltr', '00000000-0000-0000-0000-000000000000'),
  ('pl-PL', 'pl', 'PL', 'Latn', 'Polish (Poland)',                 'ltr', '00000000-0000-0000-0000-000000000000'),
  ('cs-CZ', 'cs', 'CZ', 'Latn', 'Czech (Czech Republic)',          'ltr', '00000000-0000-0000-0000-000000000000'),
  ('sk-SK', 'sk', 'SK', 'Latn', 'Slovak (Slovakia)',               'ltr', '00000000-0000-0000-0000-000000000000'),
  ('hu-HU', 'hu', 'HU', 'Latn', 'Hungarian (Hungary)',             'ltr', '00000000-0000-0000-0000-000000000000'),
  ('ro-RO', 'ro', 'RO', 'Latn', 'Romanian (Romania)',              'ltr', '00000000-0000-0000-0000-000000000000'),
  ('bg-BG', 'bg', 'BG', 'Cyrl', 'Bulgarian (Bulgaria)',            'ltr', '00000000-0000-0000-0000-000000000000'),
  ('hr-HR', 'hr', 'HR', 'Latn', 'Croatian (Croatia)',              'ltr', '00000000-0000-0000-0000-000000000000'),
  ('sr-RS', 'sr', 'RS', 'Cyrl', 'Serbian (Serbia)',                'ltr', '00000000-0000-0000-0000-000000000000'),
  ('sl-SI', 'sl', 'SI', 'Latn', 'Slovenian (Slovenia)',            'ltr', '00000000-0000-0000-0000-000000000000'),
  ('bs-BA', 'bs', 'BA', 'Latn', 'Bosnian (Bosnia and Herzegovina)', 'ltr', '00000000-0000-0000-0000-000000000000'),
  ('sq-AL', 'sq', 'AL', 'Latn', 'Albanian (Albania)',              'ltr', '00000000-0000-0000-0000-000000000000'),
  ('mk-MK', 'mk', 'MK', 'Cyrl', 'Macedonian (North Macedonia)',   'ltr', '00000000-0000-0000-0000-000000000000'),
  ('el-GR', 'el', 'GR', 'Grek', 'Greek (Greece)',                  'ltr', '00000000-0000-0000-0000-000000000000'),
  ('el-CY', 'el', 'CY', 'Grek', 'Greek (Cyprus)',                  'ltr', '00000000-0000-0000-0000-000000000000'),
  ('da-DK', 'da', 'DK', 'Latn', 'Danish (Denmark)',                'ltr', '00000000-0000-0000-0000-000000000000'),
  ('sv-SE', 'sv', 'SE', 'Latn', 'Swedish (Sweden)',                'ltr', '00000000-0000-0000-0000-000000000000'),
  ('sv-FI', 'sv', 'FI', 'Latn', 'Swedish (Finland)',               'ltr', '00000000-0000-0000-0000-000000000000'),
  ('nb-NO', 'nb', 'NO', 'Latn', 'Norwegian Bokmål (Norway)',      'ltr', '00000000-0000-0000-0000-000000000000'),
  ('nn-NO', 'nn', 'NO', 'Latn', 'Norwegian Nynorsk (Norway)',      'ltr', '00000000-0000-0000-0000-000000000000'),
  ('fi-FI', 'fi', 'FI', 'Latn', 'Finnish (Finland)',               'ltr', '00000000-0000-0000-0000-000000000000'),
  ('et-EE', 'et', 'EE', 'Latn', 'Estonian (Estonia)',              'ltr', '00000000-0000-0000-0000-000000000000'),
  ('lt-LT', 'lt', 'LT', 'Latn', 'Lithuanian (Lithuania)',          'ltr', '00000000-0000-0000-0000-000000000000'),
  ('lv-LV', 'lv', 'LV', 'Latn', 'Latvian (Latvia)',               'ltr', '00000000-0000-0000-0000-000000000000'),
  ('is-IS', 'is', 'IS', 'Latn', 'Icelandic (Iceland)',             'ltr', '00000000-0000-0000-0000-000000000000'),
  ('mt-MT', 'mt', 'MT', 'Latn', 'Maltese (Malta)',                 'ltr', '00000000-0000-0000-0000-000000000000'),
  ('ga-IE', 'ga', 'IE', 'Latn', 'Irish (Ireland)',                 'ltr', '00000000-0000-0000-0000-000000000000'),
  ('cy-GB', 'cy', 'GB', 'Latn', 'Welsh (United Kingdom)',          'ltr', '00000000-0000-0000-0000-000000000000'),
  ('eu-ES', 'eu', 'ES', 'Latn', 'Basque (Spain)',                  'ltr', '00000000-0000-0000-0000-000000000000'),
  ('ca-ES', 'ca', 'ES', 'Latn', 'Catalan (Spain)',                 'ltr', '00000000-0000-0000-0000-000000000000'),
  ('gl-ES', 'gl', 'ES', 'Latn', 'Galician (Spain)',                'ltr', '00000000-0000-0000-0000-000000000000'),
  ('ru-RU', 'ru', 'RU', 'Cyrl', 'Russian (Russia)',                'ltr', '00000000-0000-0000-0000-000000000000'),
  ('uk-UA', 'uk', 'UA', 'Cyrl', 'Ukrainian (Ukraine)',             'ltr', '00000000-0000-0000-0000-000000000000'),
  ('be-BY', 'be', 'BY', 'Cyrl', 'Belarusian (Belarus)',            'ltr', '00000000-0000-0000-0000-000000000000'),
  ('hy-AM', 'hy', 'AM', 'Armn', 'Armenian (Armenia)',              'ltr', '00000000-0000-0000-0000-000000000000'),
  ('ka-GE', 'ka', 'GE', 'Geor', 'Georgian (Georgia)',              'ltr', '00000000-0000-0000-0000-000000000000'),
  ('tr-TR', 'tr', 'TR', 'Latn', 'Turkish (Turkey)',                'ltr', '00000000-0000-0000-0000-000000000000'),
  ('az-AZ', 'az', 'AZ', 'Latn', 'Azerbaijani (Azerbaijan)',        'ltr', '00000000-0000-0000-0000-000000000000'),
  ('kk-KZ', 'kk', 'KZ', 'Cyrl', 'Kazakh (Kazakhstan)',            'ltr', '00000000-0000-0000-0000-000000000000'),
  ('uz-UZ', 'uz', 'UZ', 'Latn', 'Uzbek (Uzbekistan)',              'ltr', '00000000-0000-0000-0000-000000000000'),

  -- Middle East / Central Asia
  ('fa-IR', 'fa', 'IR', 'Arab', 'Persian (Iran)',                   'rtl', '00000000-0000-0000-0000-000000000000'),
  ('fa-AF', 'fa', 'AF', 'Arab', 'Dari (Afghanistan)',               'rtl', '00000000-0000-0000-0000-000000000000'),
  ('ps-AF', 'ps', 'AF', 'Arab', 'Pashto (Afghanistan)',             'rtl', '00000000-0000-0000-0000-000000000000'),
  ('he-IL', 'he', 'IL', 'Hebr', 'Hebrew (Israel)',                  'rtl', '00000000-0000-0000-0000-000000000000'),
  -- Kurdish: Sorani dialect uses Arabic script (RTL) in Iraq and Iran
  ('ku-IQ', 'ku', 'IQ', 'Arab', 'Kurdish Sorani (Iraq)',            'rtl', '00000000-0000-0000-0000-000000000000'),
  ('ku-IR', 'ku', 'IR', 'Arab', 'Kurdish Sorani (Iran)',            'rtl', '00000000-0000-0000-0000-000000000000'),
  -- Kurdish: Kurmanji dialect uses Latin script (LTR) in Turkey
  ('ku-TR', 'ku', 'TR', 'Latn', 'Kurdish Kurmanji (Turkey)',        'ltr', '00000000-0000-0000-0000-000000000000'),

  -- Africa
  ('sw-KE', 'sw', 'KE', 'Latn', 'Swahili (Kenya)',                 'ltr', '00000000-0000-0000-0000-000000000000'),
  ('sw-TZ', 'sw', 'TZ', 'Latn', 'Swahili (Tanzania)',              'ltr', '00000000-0000-0000-0000-000000000000'),
  ('am-ET', 'am', 'ET', 'Ethi', 'Amharic (Ethiopia)',              'ltr', '00000000-0000-0000-0000-000000000000'),
  ('so-SO', 'so', 'SO', 'Latn', 'Somali (Somalia)',                'ltr', '00000000-0000-0000-0000-000000000000'),
  ('af-ZA', 'af', 'ZA', 'Latn', 'Afrikaans (South Africa)',        'ltr', '00000000-0000-0000-0000-000000000000'),
  ('zu-ZA', 'zu', 'ZA', 'Latn', 'Zulu (South Africa)',             'ltr', '00000000-0000-0000-0000-000000000000')
on conflict (code) do update set
  name          = excluded.name,
  language_code = excluded.language_code,
  country_code  = excluded.country_code,
  script        = excluded.script,
  direction     = excluded.direction,
  updated_at    = now(),
  updated_by    = excluded.created_by;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/010_system/001_shared/006_timezone.sql
-- 900_seed_data/001_shared/006_timezone.sql
-- Seed: IANA tzdb time zones
-- Schema: shared | Table: timezone
--
-- Best-practice notes
-- ───────────────────
-- utc_offset_minutes  → standard (non-DST) offset. DST-observing zones should
--   use AT TIME ZONE at query time; the stored offset is for reference/display.
-- is_alias / canonical_code → alias entries point to their canonical IANA code.
--   Always insert canonicals before aliases so application code can resolve them.
-- on conflict do update → re-running propagates name fixes and offset corrections.
-- IANA 2020b: America/Godthab renamed → America/Nuuk (canonical). Godthab → alias.
-- IANA 2022b: Europe/Kiev renamed → Europe/Kyiv (canonical). Kiev → alias.
-- IANA 2022g: America/Ciudad_Juarez added (UTC-7 year-round, no DST).
-- US/Hawaii fix: correct canonical is Pacific/Honolulu, not America/Adak.

-- ============================================================================
-- Etc (must come first — referenced by GMT/UTC aliases)
-- ============================================================================
insert into shared.timezone (code, name, utc_offset_minutes, is_alias, created_by)
values
  ('Etc/GMT','GMT',0,false,'00000000-0000-0000-0000-000000000000'),
  ('Etc/UTC','UTC',0,false,'00000000-0000-0000-0000-000000000000')
on conflict (code) do update set
  name               = excluded.name,
  utc_offset_minutes = excluded.utc_offset_minutes,
  updated_at         = now(),
  updated_by         = excluded.created_by;

-- ============================================================================
-- Africa
-- ============================================================================
insert into shared.timezone (code, name, utc_offset_minutes, is_alias, created_by)
values
  ('Africa/Abidjan','Africa / Abidjan',0,false,'00000000-0000-0000-0000-000000000000'),
  ('Africa/Accra','Africa / Accra',0,false,'00000000-0000-0000-0000-000000000000'),
  ('Africa/Addis_Ababa','Africa / Addis Ababa',180,false,'00000000-0000-0000-0000-000000000000'),
  ('Africa/Algiers','Africa / Algiers',60,false,'00000000-0000-0000-0000-000000000000'),
  ('Africa/Asmara','Africa / Asmara',180,false,'00000000-0000-0000-0000-000000000000'),
  ('Africa/Bamako','Africa / Bamako',0,false,'00000000-0000-0000-0000-000000000000'),
  ('Africa/Bangui','Africa / Bangui',60,false,'00000000-0000-0000-0000-000000000000'),
  ('Africa/Banjul','Africa / Banjul',0,false,'00000000-0000-0000-0000-000000000000'),
  ('Africa/Bissau','Africa / Bissau',0,false,'00000000-0000-0000-0000-000000000000'),
  ('Africa/Blantyre','Africa / Blantyre',120,false,'00000000-0000-0000-0000-000000000000'),
  ('Africa/Brazzaville','Africa / Brazzaville',60,false,'00000000-0000-0000-0000-000000000000'),
  ('Africa/Bujumbura','Africa / Bujumbura',120,false,'00000000-0000-0000-0000-000000000000'),
  ('Africa/Cairo','Africa / Cairo',120,false,'00000000-0000-0000-0000-000000000000'),
  ('Africa/Casablanca','Africa / Casablanca',60,false,'00000000-0000-0000-0000-000000000000'),
  ('Africa/Ceuta','Africa / Ceuta',60,false,'00000000-0000-0000-0000-000000000000'),
  ('Africa/Conakry','Africa / Conakry',0,false,'00000000-0000-0000-0000-000000000000'),
  ('Africa/Dakar','Africa / Dakar',0,false,'00000000-0000-0000-0000-000000000000'),
  ('Africa/Dar_es_Salaam','Africa / Dar es Salaam',180,false,'00000000-0000-0000-0000-000000000000'),
  ('Africa/Djibouti','Africa / Djibouti',180,false,'00000000-0000-0000-0000-000000000000'),
  ('Africa/Douala','Africa / Douala',60,false,'00000000-0000-0000-0000-000000000000'),
  ('Africa/El_Aaiun','Africa / El Aaiun',60,false,'00000000-0000-0000-0000-000000000000'),
  ('Africa/Freetown','Africa / Freetown',0,false,'00000000-0000-0000-0000-000000000000'),
  ('Africa/Gaborone','Africa / Gaborone',120,false,'00000000-0000-0000-0000-000000000000'),
  ('Africa/Harare','Africa / Harare',120,false,'00000000-0000-0000-0000-000000000000'),
  ('Africa/Johannesburg','Africa / Johannesburg',120,false,'00000000-0000-0000-0000-000000000000'),
  ('Africa/Juba','Africa / Juba',120,false,'00000000-0000-0000-0000-000000000000'),
  ('Africa/Kampala','Africa / Kampala',180,false,'00000000-0000-0000-0000-000000000000'),
  ('Africa/Khartoum','Africa / Khartoum',120,false,'00000000-0000-0000-0000-000000000000'),
  ('Africa/Kigali','Africa / Kigali',120,false,'00000000-0000-0000-0000-000000000000'),
  ('Africa/Kinshasa','Africa / Kinshasa',60,false,'00000000-0000-0000-0000-000000000000'),
  ('Africa/Lagos','Africa / Lagos',60,false,'00000000-0000-0000-0000-000000000000'),
  ('Africa/Libreville','Africa / Libreville',60,false,'00000000-0000-0000-0000-000000000000'),
  ('Africa/Lome','Africa / Lome',0,false,'00000000-0000-0000-0000-000000000000'),
  ('Africa/Luanda','Africa / Luanda',60,false,'00000000-0000-0000-0000-000000000000'),
  ('Africa/Lubumbashi','Africa / Lubumbashi',120,false,'00000000-0000-0000-0000-000000000000'),
  ('Africa/Lusaka','Africa / Lusaka',120,false,'00000000-0000-0000-0000-000000000000'),
  ('Africa/Malabo','Africa / Malabo',60,false,'00000000-0000-0000-0000-000000000000'),
  ('Africa/Maputo','Africa / Maputo',120,false,'00000000-0000-0000-0000-000000000000'),
  ('Africa/Maseru','Africa / Maseru',120,false,'00000000-0000-0000-0000-000000000000'),
  ('Africa/Mbabane','Africa / Mbabane',120,false,'00000000-0000-0000-0000-000000000000'),
  ('Africa/Mogadishu','Africa / Mogadishu',180,false,'00000000-0000-0000-0000-000000000000'),
  ('Africa/Monrovia','Africa / Monrovia',0,false,'00000000-0000-0000-0000-000000000000'),
  ('Africa/Nairobi','Africa / Nairobi',180,false,'00000000-0000-0000-0000-000000000000'),
  ('Africa/Ndjamena','Africa / Ndjamena',60,false,'00000000-0000-0000-0000-000000000000'),
  ('Africa/Niamey','Africa / Niamey',60,false,'00000000-0000-0000-0000-000000000000'),
  ('Africa/Nouakchott','Africa / Nouakchott',0,false,'00000000-0000-0000-0000-000000000000'),
  ('Africa/Ouagadougou','Africa / Ouagadougou',0,false,'00000000-0000-0000-0000-000000000000'),
  ('Africa/Porto-Novo','Africa / Porto-Novo',60,false,'00000000-0000-0000-0000-000000000000'),
  ('Africa/Sao_Tome','Africa / Sao Tome',0,false,'00000000-0000-0000-0000-000000000000'),
  ('Africa/Tripoli','Africa / Tripoli',120,false,'00000000-0000-0000-0000-000000000000'),
  ('Africa/Tunis','Africa / Tunis',60,false,'00000000-0000-0000-0000-000000000000'),
  ('Africa/Windhoek','Africa / Windhoek',120,false,'00000000-0000-0000-0000-000000000000')
on conflict (code) do update set
  name               = excluded.name,
  utc_offset_minutes = excluded.utc_offset_minutes,
  updated_at         = now(),
  updated_by         = excluded.created_by;

-- ============================================================================
-- America
-- ============================================================================
insert into shared.timezone (code, name, utc_offset_minutes, is_alias, created_by)
values
  ('America/Adak','America / Adak',-600,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Anchorage','America / Anchorage',-540,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Anguilla','America / Anguilla',-240,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Antigua','America / Antigua',-240,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Araguaina','America / Araguaina',-180,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Argentina/Buenos_Aires','America / Buenos Aires',-180,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Argentina/Cordoba','America / Cordoba',-180,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Argentina/Salta','America / Salta',-180,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Aruba','America / Aruba',-240,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Asuncion','America / Asuncion',-240,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Atikokan','America / Atikokan',-300,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Bahia','America / Bahia',-180,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Barbados','America / Barbados',-240,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Belem','America / Belem',-180,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Belize','America / Belize',-360,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Bogota','America / Bogota',-300,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Boise','America / Boise',-420,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Cambridge_Bay','America / Cambridge Bay',-420,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Campo_Grande','America / Campo Grande',-240,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Cancun','America / Cancun',-300,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Caracas','America / Caracas',-240,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Cayenne','America / Cayenne',-180,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Cayman','America / Cayman',-300,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Chicago','America / Chicago',-360,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Chihuahua','America / Chihuahua',-360,false,'00000000-0000-0000-0000-000000000000'),
  -- Added IANA 2022g: Ciudad Juárez observes MST year-round (no DST) after 2022
  ('America/Ciudad_Juarez','America / Ciudad Juarez',-420,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Costa_Rica','America / Costa Rica',-360,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Cuiaba','America / Cuiaba',-240,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Curacao','America / Curacao',-240,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Dawson','America / Dawson',-420,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Dawson_Creek','America / Dawson Creek',-420,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Denver','America / Denver',-420,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Detroit','America / Detroit',-300,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Dominica','America / Dominica',-240,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Edmonton','America / Edmonton',-420,false,'00000000-0000-0000-0000-000000000000'),
  ('America/El_Salvador','America / El Salvador',-360,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Fortaleza','America / Fortaleza',-180,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Grand_Turk','America / Grand Turk',-300,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Grenada','America / Grenada',-240,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Guadeloupe','America / Guadeloupe',-240,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Guatemala','America / Guatemala',-360,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Guayaquil','America / Guayaquil',-300,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Guyana','America / Guyana',-240,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Halifax','America / Halifax',-240,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Havana','America / Havana',-300,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Hermosillo','America / Hermosillo',-420,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Indiana/Indianapolis','America / Indianapolis',-300,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Iqaluit','America / Iqaluit',-300,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Jamaica','America / Jamaica',-300,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Juneau','America / Juneau',-540,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Kentucky/Louisville','America / Louisville',-300,false,'00000000-0000-0000-0000-000000000000'),
  ('America/La_Paz','America / La Paz',-240,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Lima','America / Lima',-300,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Los_Angeles','America / Los Angeles',-480,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Managua','America / Managua',-360,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Manaus','America / Manaus',-240,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Martinique','America / Martinique',-240,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Mazatlan','America / Mazatlan',-420,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Mexico_City','America / Mexico City',-360,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Miquelon','America / Miquelon',-180,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Moncton','America / Moncton',-240,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Monterrey','America / Monterrey',-360,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Montevideo','America / Montevideo',-180,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Montserrat','America / Montserrat',-240,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Nassau','America / Nassau',-300,false,'00000000-0000-0000-0000-000000000000'),
  ('America/New_York','America / New York',-300,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Nipigon','America / Nipigon',-300,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Nome','America / Nome',-540,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Noronha','America / Noronha',-120,false,'00000000-0000-0000-0000-000000000000'),
  -- IANA 2020b canonical for Greenland; Godthab retained as alias below
  ('America/Nuuk','America / Nuuk',-180,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Panama','America / Panama',-300,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Paramaribo','America / Paramaribo',-180,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Phoenix','America / Phoenix',-420,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Port-au-Prince','America / Port-au-Prince',-300,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Port_of_Spain','America / Port of Spain',-240,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Puerto_Rico','America / Puerto Rico',-240,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Rankin_Inlet','America / Rankin Inlet',-360,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Recife','America / Recife',-180,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Regina','America / Regina',-360,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Rio_Branco','America / Rio Branco',-300,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Santiago','America / Santiago',-240,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Santo_Domingo','America / Santo Domingo',-240,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Sao_Paulo','America / Sao Paulo',-180,false,'00000000-0000-0000-0000-000000000000'),
  ('America/St_Johns','America / St. John''s',-210,false,'00000000-0000-0000-0000-000000000000'),
  ('America/St_Kitts','America / St. Kitts',-240,false,'00000000-0000-0000-0000-000000000000'),
  ('America/St_Lucia','America / St. Lucia',-240,false,'00000000-0000-0000-0000-000000000000'),
  ('America/St_Vincent','America / St. Vincent',-240,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Tegucigalpa','America / Tegucigalpa',-360,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Thule','America / Thule',-240,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Thunder_Bay','America / Thunder Bay',-300,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Tijuana','America / Tijuana',-480,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Toronto','America / Toronto',-300,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Tortola','America / Tortola',-240,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Vancouver','America / Vancouver',-480,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Whitehorse','America / Whitehorse',-420,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Winnipeg','America / Winnipeg',-360,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Yakutat','America / Yakutat',-540,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Yellowknife','America / Yellowknife',-420,false,'00000000-0000-0000-0000-000000000000')
on conflict (code) do update set
  name               = excluded.name,
  utc_offset_minutes = excluded.utc_offset_minutes,
  updated_at         = now(),
  updated_by         = excluded.created_by;

-- ============================================================================
-- Antarctica
-- ============================================================================
insert into shared.timezone (code, name, utc_offset_minutes, is_alias, created_by)
values
  ('Antarctica/Casey','Antarctica / Casey',660,false,'00000000-0000-0000-0000-000000000000'),
  ('Antarctica/Davis','Antarctica / Davis',420,false,'00000000-0000-0000-0000-000000000000'),
  ('Antarctica/DumontDUrville','Antarctica / Dumont d''Urville',600,false,'00000000-0000-0000-0000-000000000000'),
  ('Antarctica/Macquarie','Antarctica / Macquarie',660,false,'00000000-0000-0000-0000-000000000000'),
  ('Antarctica/Mawson','Antarctica / Mawson',300,false,'00000000-0000-0000-0000-000000000000'),
  ('Antarctica/McMurdo','Antarctica / McMurdo',720,false,'00000000-0000-0000-0000-000000000000'),
  ('Antarctica/Palmer','Antarctica / Palmer',-180,false,'00000000-0000-0000-0000-000000000000'),
  ('Antarctica/Rothera','Antarctica / Rothera',-180,false,'00000000-0000-0000-0000-000000000000'),
  ('Antarctica/Syowa','Antarctica / Syowa',180,false,'00000000-0000-0000-0000-000000000000'),
  ('Antarctica/Troll','Antarctica / Troll',0,false,'00000000-0000-0000-0000-000000000000'),
  ('Antarctica/Vostok','Antarctica / Vostok',360,false,'00000000-0000-0000-0000-000000000000')
on conflict (code) do update set
  name               = excluded.name,
  utc_offset_minutes = excluded.utc_offset_minutes,
  updated_at         = now(),
  updated_by         = excluded.created_by;

-- ============================================================================
-- Asia
-- ============================================================================
insert into shared.timezone (code, name, utc_offset_minutes, is_alias, created_by)
values
  ('Asia/Aden','Asia / Aden',180,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Almaty','Asia / Almaty',360,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Amman','Asia / Amman',180,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Anadyr','Asia / Anadyr',720,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Aqtau','Asia / Aqtau',300,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Aqtobe','Asia / Aqtobe',300,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Ashgabat','Asia / Ashgabat',300,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Atyrau','Asia / Atyrau',300,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Baghdad','Asia / Baghdad',180,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Bahrain','Asia / Bahrain',180,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Baku','Asia / Baku',240,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Bangkok','Asia / Bangkok',420,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Barnaul','Asia / Barnaul',420,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Beirut','Asia / Beirut',120,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Bishkek','Asia / Bishkek',360,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Brunei','Asia / Brunei',480,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Chita','Asia / Chita',540,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Choibalsan','Asia / Choibalsan',480,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Colombo','Asia / Colombo',330,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Damascus','Asia / Damascus',180,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Dhaka','Asia / Dhaka',360,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Dili','Asia / Dili',540,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Dubai','Asia / Dubai',240,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Dushanbe','Asia / Dushanbe',300,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Famagusta','Asia / Famagusta',120,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Gaza','Asia / Gaza',120,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Hebron','Asia / Hebron',120,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Ho_Chi_Minh','Asia / Ho Chi Minh',420,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Hong_Kong','Asia / Hong Kong',480,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Hovd','Asia / Hovd',420,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Irkutsk','Asia / Irkutsk',480,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Jakarta','Asia / Jakarta',420,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Jayapura','Asia / Jayapura',540,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Jerusalem','Asia / Jerusalem',120,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Kabul','Asia / Kabul',270,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Kamchatka','Asia / Kamchatka',720,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Karachi','Asia / Karachi',300,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Kathmandu','Asia / Kathmandu',345,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Khandyga','Asia / Khandyga',540,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Kolkata','Asia / Kolkata',330,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Krasnoyarsk','Asia / Krasnoyarsk',420,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Kuala_Lumpur','Asia / Kuala Lumpur',480,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Kuching','Asia / Kuching',480,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Kuwait','Asia / Kuwait',180,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Macau','Asia / Macau',480,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Magadan','Asia / Magadan',660,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Makassar','Asia / Makassar',480,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Manila','Asia / Manila',480,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Muscat','Asia / Muscat',240,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Nicosia','Asia / Nicosia',120,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Novokuznetsk','Asia / Novokuznetsk',420,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Novosibirsk','Asia / Novosibirsk',420,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Omsk','Asia / Omsk',360,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Oral','Asia / Oral',300,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Phnom_Penh','Asia / Phnom Penh',420,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Pontianak','Asia / Pontianak',420,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Pyongyang','Asia / Pyongyang',540,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Qatar','Asia / Qatar',180,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Qostanay','Asia / Qostanay',360,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Qyzylorda','Asia / Qyzylorda',300,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Riyadh','Asia / Riyadh',180,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Sakhalin','Asia / Sakhalin',660,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Samarkand','Asia / Samarkand',300,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Seoul','Asia / Seoul',540,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Shanghai','Asia / Shanghai',480,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Singapore','Asia / Singapore',480,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Srednekolymsk','Asia / Srednekolymsk',660,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Taipei','Asia / Taipei',480,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Tashkent','Asia / Tashkent',300,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Tbilisi','Asia / Tbilisi',240,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Tehran','Asia / Tehran',210,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Thimphu','Asia / Thimphu',360,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Tokyo','Asia / Tokyo',540,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Tomsk','Asia / Tomsk',420,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Ulaanbaatar','Asia / Ulaanbaatar',480,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Urumqi','Asia / Urumqi',360,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Ust-Nera','Asia / Ust-Nera',600,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Vientiane','Asia / Vientiane',420,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Vladivostok','Asia / Vladivostok',600,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Yakutsk','Asia / Yakutsk',540,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Yangon','Asia / Yangon',390,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Yekaterinburg','Asia / Yekaterinburg',300,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Yerevan','Asia / Yerevan',240,false,'00000000-0000-0000-0000-000000000000')
on conflict (code) do update set
  name               = excluded.name,
  utc_offset_minutes = excluded.utc_offset_minutes,
  updated_at         = now(),
  updated_by         = excluded.created_by;

-- ============================================================================
-- Atlantic
-- ============================================================================
insert into shared.timezone (code, name, utc_offset_minutes, is_alias, created_by)
values
  ('Atlantic/Azores','Atlantic / Azores',-60,false,'00000000-0000-0000-0000-000000000000'),
  ('Atlantic/Bermuda','Atlantic / Bermuda',-240,false,'00000000-0000-0000-0000-000000000000'),
  ('Atlantic/Canary','Atlantic / Canary',0,false,'00000000-0000-0000-0000-000000000000'),
  ('Atlantic/Cape_Verde','Atlantic / Cape Verde',-60,false,'00000000-0000-0000-0000-000000000000'),
  ('Atlantic/Faroe','Atlantic / Faroe',0,false,'00000000-0000-0000-0000-000000000000'),
  ('Atlantic/Madeira','Atlantic / Madeira',0,false,'00000000-0000-0000-0000-000000000000'),
  ('Atlantic/Reykjavik','Atlantic / Reykjavik',0,false,'00000000-0000-0000-0000-000000000000'),
  ('Atlantic/South_Georgia','Atlantic / South Georgia',-120,false,'00000000-0000-0000-0000-000000000000'),
  ('Atlantic/St_Helena','Atlantic / St. Helena',0,false,'00000000-0000-0000-0000-000000000000'),
  ('Atlantic/Stanley','Atlantic / Stanley',-180,false,'00000000-0000-0000-0000-000000000000')
on conflict (code) do update set
  name               = excluded.name,
  utc_offset_minutes = excluded.utc_offset_minutes,
  updated_at         = now(),
  updated_by         = excluded.created_by;

-- ============================================================================
-- Australia
-- ============================================================================
insert into shared.timezone (code, name, utc_offset_minutes, is_alias, created_by)
values
  ('Australia/Adelaide','Australia / Adelaide',570,false,'00000000-0000-0000-0000-000000000000'),
  ('Australia/Brisbane','Australia / Brisbane',600,false,'00000000-0000-0000-0000-000000000000'),
  ('Australia/Broken_Hill','Australia / Broken Hill',570,false,'00000000-0000-0000-0000-000000000000'),
  ('Australia/Darwin','Australia / Darwin',570,false,'00000000-0000-0000-0000-000000000000'),
  ('Australia/Eucla','Australia / Eucla',525,false,'00000000-0000-0000-0000-000000000000'),
  ('Australia/Hobart','Australia / Hobart',600,false,'00000000-0000-0000-0000-000000000000'),
  ('Australia/Lindeman','Australia / Lindeman',600,false,'00000000-0000-0000-0000-000000000000'),
  ('Australia/Lord_Howe','Australia / Lord Howe',630,false,'00000000-0000-0000-0000-000000000000'),
  ('Australia/Melbourne','Australia / Melbourne',600,false,'00000000-0000-0000-0000-000000000000'),
  ('Australia/Perth','Australia / Perth',480,false,'00000000-0000-0000-0000-000000000000'),
  ('Australia/Sydney','Australia / Sydney',600,false,'00000000-0000-0000-0000-000000000000')
on conflict (code) do update set
  name               = excluded.name,
  utc_offset_minutes = excluded.utc_offset_minutes,
  updated_at         = now(),
  updated_by         = excluded.created_by;

-- ============================================================================
-- Europe
-- ============================================================================
insert into shared.timezone (code, name, utc_offset_minutes, is_alias, created_by)
values
  ('Europe/Amsterdam','Europe / Amsterdam',60,false,'00000000-0000-0000-0000-000000000000'),
  ('Europe/Andorra','Europe / Andorra',60,false,'00000000-0000-0000-0000-000000000000'),
  ('Europe/Astrakhan','Europe / Astrakhan',240,false,'00000000-0000-0000-0000-000000000000'),
  ('Europe/Athens','Europe / Athens',120,false,'00000000-0000-0000-0000-000000000000'),
  ('Europe/Belgrade','Europe / Belgrade',60,false,'00000000-0000-0000-0000-000000000000'),
  ('Europe/Berlin','Europe / Berlin',60,false,'00000000-0000-0000-0000-000000000000'),
  ('Europe/Bratislava','Europe / Bratislava',60,false,'00000000-0000-0000-0000-000000000000'),
  ('Europe/Brussels','Europe / Brussels',60,false,'00000000-0000-0000-0000-000000000000'),
  ('Europe/Bucharest','Europe / Bucharest',120,false,'00000000-0000-0000-0000-000000000000'),
  ('Europe/Budapest','Europe / Budapest',60,false,'00000000-0000-0000-0000-000000000000'),
  ('Europe/Busingen','Europe / Busingen',60,false,'00000000-0000-0000-0000-000000000000'),
  ('Europe/Chisinau','Europe / Chisinau',120,false,'00000000-0000-0000-0000-000000000000'),
  ('Europe/Copenhagen','Europe / Copenhagen',60,false,'00000000-0000-0000-0000-000000000000'),
  ('Europe/Dublin','Europe / Dublin',60,false,'00000000-0000-0000-0000-000000000000'),
  ('Europe/Gibraltar','Europe / Gibraltar',60,false,'00000000-0000-0000-0000-000000000000'),
  ('Europe/Guernsey','Europe / Guernsey',0,false,'00000000-0000-0000-0000-000000000000'),
  ('Europe/Helsinki','Europe / Helsinki',120,false,'00000000-0000-0000-0000-000000000000'),
  ('Europe/Isle_of_Man','Europe / Isle of Man',0,false,'00000000-0000-0000-0000-000000000000'),
  ('Europe/Istanbul','Europe / Istanbul',180,false,'00000000-0000-0000-0000-000000000000'),
  ('Europe/Jersey','Europe / Jersey',0,false,'00000000-0000-0000-0000-000000000000'),
  ('Europe/Kaliningrad','Europe / Kaliningrad',120,false,'00000000-0000-0000-0000-000000000000'),
  ('Europe/Kirov','Europe / Kirov',180,false,'00000000-0000-0000-0000-000000000000'),
  -- IANA 2022b canonical for Ukraine; Kiev retained as alias below
  ('Europe/Kyiv','Europe / Kyiv',120,false,'00000000-0000-0000-0000-000000000000'),
  ('Europe/Lisbon','Europe / Lisbon',0,false,'00000000-0000-0000-0000-000000000000'),
  ('Europe/Ljubljana','Europe / Ljubljana',60,false,'00000000-0000-0000-0000-000000000000'),
  ('Europe/London','Europe / London',0,false,'00000000-0000-0000-0000-000000000000'),
  ('Europe/Luxembourg','Europe / Luxembourg',60,false,'00000000-0000-0000-0000-000000000000'),
  ('Europe/Madrid','Europe / Madrid',60,false,'00000000-0000-0000-0000-000000000000'),
  ('Europe/Malta','Europe / Malta',60,false,'00000000-0000-0000-0000-000000000000'),
  ('Europe/Mariehamn','Europe / Mariehamn',120,false,'00000000-0000-0000-0000-000000000000'),
  ('Europe/Minsk','Europe / Minsk',180,false,'00000000-0000-0000-0000-000000000000'),
  ('Europe/Monaco','Europe / Monaco',60,false,'00000000-0000-0000-0000-000000000000'),
  ('Europe/Moscow','Europe / Moscow',180,false,'00000000-0000-0000-0000-000000000000'),
  ('Europe/Oslo','Europe / Oslo',60,false,'00000000-0000-0000-0000-000000000000'),
  ('Europe/Paris','Europe / Paris',60,false,'00000000-0000-0000-0000-000000000000'),
  ('Europe/Podgorica','Europe / Podgorica',60,false,'00000000-0000-0000-0000-000000000000'),
  ('Europe/Prague','Europe / Prague',60,false,'00000000-0000-0000-0000-000000000000'),
  ('Europe/Riga','Europe / Riga',120,false,'00000000-0000-0000-0000-000000000000'),
  ('Europe/Rome','Europe / Rome',60,false,'00000000-0000-0000-0000-000000000000'),
  ('Europe/Samara','Europe / Samara',240,false,'00000000-0000-0000-0000-000000000000'),
  ('Europe/San_Marino','Europe / San Marino',60,false,'00000000-0000-0000-0000-000000000000'),
  ('Europe/Sarajevo','Europe / Sarajevo',60,false,'00000000-0000-0000-0000-000000000000'),
  ('Europe/Saratov','Europe / Saratov',240,false,'00000000-0000-0000-0000-000000000000'),
  ('Europe/Simferopol','Europe / Simferopol',180,false,'00000000-0000-0000-0000-000000000000'),
  ('Europe/Skopje','Europe / Skopje',60,false,'00000000-0000-0000-0000-000000000000'),
  ('Europe/Sofia','Europe / Sofia',120,false,'00000000-0000-0000-0000-000000000000'),
  ('Europe/Stockholm','Europe / Stockholm',60,false,'00000000-0000-0000-0000-000000000000'),
  ('Europe/Tallinn','Europe / Tallinn',120,false,'00000000-0000-0000-0000-000000000000'),
  ('Europe/Tirane','Europe / Tirane',60,false,'00000000-0000-0000-0000-000000000000'),
  ('Europe/Ulyanovsk','Europe / Ulyanovsk',240,false,'00000000-0000-0000-0000-000000000000'),
  ('Europe/Vaduz','Europe / Vaduz',60,false,'00000000-0000-0000-0000-000000000000'),
  ('Europe/Vatican','Europe / Vatican',60,false,'00000000-0000-0000-0000-000000000000'),
  ('Europe/Vienna','Europe / Vienna',60,false,'00000000-0000-0000-0000-000000000000'),
  ('Europe/Vilnius','Europe / Vilnius',120,false,'00000000-0000-0000-0000-000000000000'),
  ('Europe/Volgograd','Europe / Volgograd',180,false,'00000000-0000-0000-0000-000000000000'),
  ('Europe/Warsaw','Europe / Warsaw',60,false,'00000000-0000-0000-0000-000000000000'),
  ('Europe/Zagreb','Europe / Zagreb',60,false,'00000000-0000-0000-0000-000000000000'),
  ('Europe/Zurich','Europe / Zurich',60,false,'00000000-0000-0000-0000-000000000000')
on conflict (code) do update set
  name               = excluded.name,
  utc_offset_minutes = excluded.utc_offset_minutes,
  updated_at         = now(),
  updated_by         = excluded.created_by;

-- ============================================================================
-- Indian
-- ============================================================================
insert into shared.timezone (code, name, utc_offset_minutes, is_alias, created_by)
values
  ('Indian/Antananarivo','Indian / Antananarivo',180,false,'00000000-0000-0000-0000-000000000000'),
  ('Indian/Chagos','Indian / Chagos',360,false,'00000000-0000-0000-0000-000000000000'),
  ('Indian/Christmas','Indian / Christmas',420,false,'00000000-0000-0000-0000-000000000000'),
  ('Indian/Cocos','Indian / Cocos',390,false,'00000000-0000-0000-0000-000000000000'),
  ('Indian/Comoro','Indian / Comoro',180,false,'00000000-0000-0000-0000-000000000000'),
  ('Indian/Kerguelen','Indian / Kerguelen',300,false,'00000000-0000-0000-0000-000000000000'),
  ('Indian/Mahe','Indian / Mahe',240,false,'00000000-0000-0000-0000-000000000000'),
  ('Indian/Maldives','Indian / Maldives',300,false,'00000000-0000-0000-0000-000000000000'),
  ('Indian/Mauritius','Indian / Mauritius',240,false,'00000000-0000-0000-0000-000000000000'),
  ('Indian/Mayotte','Indian / Mayotte',180,false,'00000000-0000-0000-0000-000000000000'),
  ('Indian/Reunion','Indian / Reunion',240,false,'00000000-0000-0000-0000-000000000000')
on conflict (code) do update set
  name               = excluded.name,
  utc_offset_minutes = excluded.utc_offset_minutes,
  updated_at         = now(),
  updated_by         = excluded.created_by;

-- ============================================================================
-- Pacific
-- ============================================================================
insert into shared.timezone (code, name, utc_offset_minutes, is_alias, created_by)
values
  ('Pacific/Apia','Pacific / Apia',780,false,'00000000-0000-0000-0000-000000000000'),
  ('Pacific/Auckland','Pacific / Auckland',720,false,'00000000-0000-0000-0000-000000000000'),
  ('Pacific/Bougainville','Pacific / Bougainville',660,false,'00000000-0000-0000-0000-000000000000'),
  ('Pacific/Chatham','Pacific / Chatham',765,false,'00000000-0000-0000-0000-000000000000'),
  ('Pacific/Chuuk','Pacific / Chuuk',600,false,'00000000-0000-0000-0000-000000000000'),
  ('Pacific/Easter','Pacific / Easter',-360,false,'00000000-0000-0000-0000-000000000000'),
  ('Pacific/Efate','Pacific / Efate',660,false,'00000000-0000-0000-0000-000000000000'),
  ('Pacific/Fakaofo','Pacific / Fakaofo',780,false,'00000000-0000-0000-0000-000000000000'),
  ('Pacific/Fiji','Pacific / Fiji',720,false,'00000000-0000-0000-0000-000000000000'),
  ('Pacific/Funafuti','Pacific / Funafuti',720,false,'00000000-0000-0000-0000-000000000000'),
  ('Pacific/Galapagos','Pacific / Galapagos',-360,false,'00000000-0000-0000-0000-000000000000'),
  ('Pacific/Gambier','Pacific / Gambier',-540,false,'00000000-0000-0000-0000-000000000000'),
  ('Pacific/Guadalcanal','Pacific / Guadalcanal',660,false,'00000000-0000-0000-0000-000000000000'),
  ('Pacific/Guam','Pacific / Guam',600,false,'00000000-0000-0000-0000-000000000000'),
  ('Pacific/Honolulu','Pacific / Honolulu',-600,false,'00000000-0000-0000-0000-000000000000'),
  ('Pacific/Kanton','Pacific / Kanton',780,false,'00000000-0000-0000-0000-000000000000'),
  ('Pacific/Kiritimati','Pacific / Kiritimati',840,false,'00000000-0000-0000-0000-000000000000'),
  ('Pacific/Kosrae','Pacific / Kosrae',660,false,'00000000-0000-0000-0000-000000000000'),
  ('Pacific/Kwajalein','Pacific / Kwajalein',720,false,'00000000-0000-0000-0000-000000000000'),
  ('Pacific/Majuro','Pacific / Majuro',720,false,'00000000-0000-0000-0000-000000000000'),
  ('Pacific/Marquesas','Pacific / Marquesas',-570,false,'00000000-0000-0000-0000-000000000000'),
  ('Pacific/Midway','Pacific / Midway',-660,false,'00000000-0000-0000-0000-000000000000'),
  ('Pacific/Nauru','Pacific / Nauru',720,false,'00000000-0000-0000-0000-000000000000'),
  ('Pacific/Niue','Pacific / Niue',-660,false,'00000000-0000-0000-0000-000000000000'),
  ('Pacific/Norfolk','Pacific / Norfolk',660,false,'00000000-0000-0000-0000-000000000000'),
  ('Pacific/Noumea','Pacific / Noumea',660,false,'00000000-0000-0000-0000-000000000000'),
  ('Pacific/Pago_Pago','Pacific / Pago Pago',-660,false,'00000000-0000-0000-0000-000000000000'),
  ('Pacific/Palau','Pacific / Palau',540,false,'00000000-0000-0000-0000-000000000000'),
  ('Pacific/Pitcairn','Pacific / Pitcairn',-480,false,'00000000-0000-0000-0000-000000000000'),
  ('Pacific/Pohnpei','Pacific / Pohnpei',660,false,'00000000-0000-0000-0000-000000000000'),
  ('Pacific/Port_Moresby','Pacific / Port Moresby',600,false,'00000000-0000-0000-0000-000000000000'),
  ('Pacific/Rarotonga','Pacific / Rarotonga',-600,false,'00000000-0000-0000-0000-000000000000'),
  ('Pacific/Tahiti','Pacific / Tahiti',-600,false,'00000000-0000-0000-0000-000000000000'),
  ('Pacific/Tarawa','Pacific / Tarawa',720,false,'00000000-0000-0000-0000-000000000000'),
  ('Pacific/Tongatapu','Pacific / Tongatapu',780,false,'00000000-0000-0000-0000-000000000000'),
  ('Pacific/Wake','Pacific / Wake',720,false,'00000000-0000-0000-0000-000000000000'),
  ('Pacific/Wallis','Pacific / Wallis',720,false,'00000000-0000-0000-0000-000000000000')
on conflict (code) do update set
  name               = excluded.name,
  utc_offset_minutes = excluded.utc_offset_minutes,
  updated_at         = now(),
  updated_by         = excluded.created_by;

-- ============================================================================
-- Aliases (legacy / convenience names → canonical IANA code)
-- All canonical zones above must already exist before this block runs.
-- ============================================================================
insert into shared.timezone (code, name, utc_offset_minutes, is_alias, canonical_code, created_by)
values
  ('GMT',              'GMT',                    0,    true, 'Etc/GMT',                      '00000000-0000-0000-0000-000000000000'),
  ('UTC',              'UTC',                    0,    true, 'Etc/UTC',                      '00000000-0000-0000-0000-000000000000'),
  -- US convenience names
  ('US/Eastern',       'US / Eastern',         -300,   true, 'America/New_York',             '00000000-0000-0000-0000-000000000000'),
  ('US/Central',       'US / Central',         -360,   true, 'America/Chicago',              '00000000-0000-0000-0000-000000000000'),
  ('US/Mountain',      'US / Mountain',        -420,   true, 'America/Denver',               '00000000-0000-0000-0000-000000000000'),
  ('US/Pacific',       'US / Pacific',         -480,   true, 'America/Los_Angeles',          '00000000-0000-0000-0000-000000000000'),
  ('US/Alaska',        'US / Alaska',          -540,   true, 'America/Anchorage',            '00000000-0000-0000-0000-000000000000'),
  -- US/Hawaii → Pacific/Honolulu (Hawaii does not observe DST; correct canonical)
  ('US/Hawaii',        'US / Hawaii',          -600,   true, 'Pacific/Honolulu',             '00000000-0000-0000-0000-000000000000'),
  ('US/Arizona',       'US / Arizona',         -420,   true, 'America/Phoenix',              '00000000-0000-0000-0000-000000000000'),
  -- Canada convenience names
  ('Canada/Atlantic',  'Canada / Atlantic',    -240,   true, 'America/Halifax',              '00000000-0000-0000-0000-000000000000'),
  ('Canada/Central',   'Canada / Central',     -360,   true, 'America/Winnipeg',             '00000000-0000-0000-0000-000000000000'),
  ('Canada/Eastern',   'Canada / Eastern',     -300,   true, 'America/Toronto',              '00000000-0000-0000-0000-000000000000'),
  ('Canada/Mountain',  'Canada / Mountain',    -420,   true, 'America/Edmonton',             '00000000-0000-0000-0000-000000000000'),
  ('Canada/Newfoundland','Canada / Newfoundland',-210, true, 'America/St_Johns',             '00000000-0000-0000-0000-000000000000'),
  ('Canada/Pacific',   'Canada / Pacific',     -480,   true, 'America/Vancouver',            '00000000-0000-0000-0000-000000000000'),
  -- Australia state convenience names
  ('Australia/ACT',    'Australia / ACT',       600,   true, 'Australia/Sydney',             '00000000-0000-0000-0000-000000000000'),
  ('Australia/North',  'Australia / North',     570,   true, 'Australia/Darwin',             '00000000-0000-0000-0000-000000000000'),
  ('Australia/Queensland','Australia / Queensland',600, true,'Australia/Brisbane',           '00000000-0000-0000-0000-000000000000'),
  ('Australia/South',  'Australia / South',     570,   true, 'Australia/Adelaide',           '00000000-0000-0000-0000-000000000000'),
  ('Australia/West',   'Australia / West',      480,   true, 'Australia/Perth',              '00000000-0000-0000-0000-000000000000'),
  -- IANA renamed zones — old codes kept as aliases for backward compatibility
  -- IANA 2020b: America/Godthab → America/Nuuk
  ('America/Godthab',  'America / Nuuk',       -180,   true, 'America/Nuuk',                 '00000000-0000-0000-0000-000000000000'),
  -- IANA 2022b: Europe/Kiev → Europe/Kyiv
  ('Europe/Kiev',      'Europe / Kyiv',         120,   true, 'Europe/Kyiv',                  '00000000-0000-0000-0000-000000000000')
on conflict (code) do update set
  name               = excluded.name,
  utc_offset_minutes = excluded.utc_offset_minutes,
  is_alias           = excluded.is_alias,
  canonical_code     = excluded.canonical_code,
  updated_at         = now(),
  updated_by         = excluded.created_by;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/010_system/001_shared/007_uom.sql
-- 900_seed_data/001_shared/007_uom.sql
-- Seed: UN/ECE Rec 20 units of measure
-- Schema: shared | Table: uom
--
-- Best-practice notes
-- ───────────────────
-- quantity_type values must exist in control.lookup_value (domain: shared.uom_quantity_type).
-- on conflict do update → re-running propagates name/symbol/quantity_type corrections.
-- Codes follow UN/ECE Recommendation 20 where available; custom codes noted inline.
-- BA note: UN/ECE Rec 20 code BA = "Ball" (textile/sports), not "Barrel". The entry
--   below uses BA as a container/drum barrel (packaging context). Application code
--   should distinguish from BLL (Barrel, petroleum, volume). Consider migrating to
--   a custom code (e.g. DRM for drum) in a future revision.
-- YDQ removed: not a UN/ECE code and duplicates CYD (Cubic Yard, yd³).
-- TNK: classified as 'service' (transport KPI), not 'quantity'.
-- MYR: Man-year code collides with ISO 4217 MYR (Malaysian Ringgit) — different tables,
--   but application code that resolves UOM codes should be aware of this overlap.
-- NULL symbol policy
--   Some UOM codes carry a NULL symbol because no internationally standardised
--   abbreviation exists for that unit. Two categories apply here:
--   • Composite groupings (SET, KIT): their "size" is defined by their contents,
--     not by the grouping concept itself; no standard symbol is defined in UN/ECE
--     Rec 20 or any ISO standard.
--   • Variable-dimension containers (PK, BX, CT, CS, PL, RL, SH, BA): physical
--     dimensions vary by product and supplier, so a fixed symbol would be
--     misleading (e.g. a "box" can be 0.1 kg or 50 kg). Rendering code must
--     treat NULL symbol as "display name only" — show the UOM name instead.

-- ============================================================================
-- quantity — Count / Dimensionless
-- ============================================================================
insert into shared.uom (code, name, symbol, quantity_type, created_by)
values
  ('C62','One (unit)','1','quantity','00000000-0000-0000-0000-000000000000'),
  ('EA','Each','ea','quantity','00000000-0000-0000-0000-000000000000'),
  ('PR','Pair','pr','quantity','00000000-0000-0000-0000-000000000000'),
  ('DZN','Dozen','doz','quantity','00000000-0000-0000-0000-000000000000'),
  ('GRO','Gross','gr','quantity','00000000-0000-0000-0000-000000000000'),
  -- symbol NULL: composite groupings — contents define the unit, no standard abbreviation
  ('SET','Set',null,'quantity','00000000-0000-0000-0000-000000000000'),
  ('KIT','Kit',null,'quantity','00000000-0000-0000-0000-000000000000'),
  ('LOT','Lot','lot','quantity','00000000-0000-0000-0000-000000000000'),
  -- symbol NULL: variable-dimension containers — physical size varies by product/supplier
  ('PK','Pack',null,'quantity','00000000-0000-0000-0000-000000000000'),
  ('BX','Box',null,'quantity','00000000-0000-0000-0000-000000000000'),
  ('CT','Carton',null,'quantity','00000000-0000-0000-0000-000000000000'),
  ('CS','Case',null,'quantity','00000000-0000-0000-0000-000000000000'),
  ('PL','Pallet',null,'quantity','00000000-0000-0000-0000-000000000000'),
  ('RL','Roll',null,'quantity','00000000-0000-0000-0000-000000000000'),
  ('SH','Sheet',null,'quantity','00000000-0000-0000-0000-000000000000'),
  ('BA','Barrel',null,'quantity','00000000-0000-0000-0000-000000000000'),  -- see BA note above re: UN/ECE code collision
  ('AB','Container','cntr','quantity','00000000-0000-0000-0000-000000000000'),
  ('E30','Trailer','trlr','quantity','00000000-0000-0000-0000-000000000000'),
  ('NL','Load','load','quantity','00000000-0000-0000-0000-000000000000'),
  ('E85','TEU (Twenty-foot Equivalent Unit)','TEU','quantity','00000000-0000-0000-0000-000000000000'),
  ('TNK','Tonne-kilometre','t·km','service','00000000-0000-0000-0000-000000000000')
on conflict (code) do update set
  name          = excluded.name,
  symbol        = excluded.symbol,
  quantity_type = excluded.quantity_type,
  updated_at    = now(),
  updated_by    = excluded.created_by;

-- ============================================================================
-- mass — Weight
-- ============================================================================
insert into shared.uom (code, name, symbol, quantity_type, created_by)
values
  ('MC','Microgram','µg','mass','00000000-0000-0000-0000-000000000000'),
  ('CGM','Centigram','cg','mass','00000000-0000-0000-0000-000000000000'),
  ('MGM','Milligram','mg','mass','00000000-0000-0000-0000-000000000000'),
  ('GRM','Gram','g','mass','00000000-0000-0000-0000-000000000000'),
  ('KGM','Kilogram','kg','mass','00000000-0000-0000-0000-000000000000'),
  ('DTN','Decitonne','dt','mass','00000000-0000-0000-0000-000000000000'),
  ('TNE','Metric Ton (Tonne)','t','mass','00000000-0000-0000-0000-000000000000'),
  ('ONZ','Ounce','oz','mass','00000000-0000-0000-0000-000000000000'),
  ('APZ','Troy Ounce','oz t','mass','00000000-0000-0000-0000-000000000000'),
  ('LBR','Pound','lb','mass','00000000-0000-0000-0000-000000000000'),
  ('CWA','Hundredweight (US)','cwt','mass','00000000-0000-0000-0000-000000000000'),
  ('STN','Short Ton (US)','sh tn','mass','00000000-0000-0000-0000-000000000000'),
  ('LTN','Long Ton (UK)','l tn','mass','00000000-0000-0000-0000-000000000000')
on conflict (code) do update set
  name          = excluded.name,
  symbol        = excluded.symbol,
  quantity_type = excluded.quantity_type,
  updated_at    = now(),
  updated_by    = excluded.created_by;

-- ============================================================================
-- length — Distance
-- ============================================================================
insert into shared.uom (code, name, symbol, quantity_type, created_by)
values
  ('A11','Micrometre','µm','length','00000000-0000-0000-0000-000000000000'),
  ('MMT','Millimetre','mm','length','00000000-0000-0000-0000-000000000000'),
  ('CMT','Centimetre','cm','length','00000000-0000-0000-0000-000000000000'),
  ('DMT','Decimetre','dm','length','00000000-0000-0000-0000-000000000000'),
  ('MTR','Metre','m','length','00000000-0000-0000-0000-000000000000'),
  ('KMT','Kilometre','km','length','00000000-0000-0000-0000-000000000000'),
  ('INH','Inch','in','length','00000000-0000-0000-0000-000000000000'),
  ('FOT','Foot','ft','length','00000000-0000-0000-0000-000000000000'),
  ('LF','Linear Foot','lin ft','length','00000000-0000-0000-0000-000000000000'),
  ('LM','Linear Metre','lin m','length','00000000-0000-0000-0000-000000000000'),
  ('YRD','Yard','yd','length','00000000-0000-0000-0000-000000000000'),
  ('SMI','Statute Mile','mi','length','00000000-0000-0000-0000-000000000000'),
  ('NMI','Nautical Mile','nmi','length','00000000-0000-0000-0000-000000000000')
on conflict (code) do update set
  name          = excluded.name,
  symbol        = excluded.symbol,
  quantity_type = excluded.quantity_type,
  updated_at    = now(),
  updated_by    = excluded.created_by;

-- ============================================================================
-- area — Surface
-- ============================================================================
insert into shared.uom (code, name, symbol, quantity_type, created_by)
values
  ('INK','Square Inch','in²','area','00000000-0000-0000-0000-000000000000'),
  ('FTK','Square Foot','ft²','area','00000000-0000-0000-0000-000000000000'),
  ('YDK','Square Yard','yd²','area','00000000-0000-0000-0000-000000000000'),
  ('CMK','Square Centimetre','cm²','area','00000000-0000-0000-0000-000000000000'),
  ('MTK','Square Metre','m²','area','00000000-0000-0000-0000-000000000000'),
  ('KMK','Square Kilometre','km²','area','00000000-0000-0000-0000-000000000000'),
  ('HAR','Hectare','ha','area','00000000-0000-0000-0000-000000000000'),
  ('ACR','Acre','ac','area','00000000-0000-0000-0000-000000000000'),
  ('SQR','Square (roofing, 100 ft²)','sq','area','00000000-0000-0000-0000-000000000000')
on conflict (code) do update set
  name          = excluded.name,
  symbol        = excluded.symbol,
  quantity_type = excluded.quantity_type,
  updated_at    = now(),
  updated_by    = excluded.created_by;

-- ============================================================================
-- volume — Capacity
-- ============================================================================
insert into shared.uom (code, name, symbol, quantity_type, created_by)
values
  ('MLT','Millilitre','mL','volume','00000000-0000-0000-0000-000000000000'),
  ('CLT','Centilitre','cL','volume','00000000-0000-0000-0000-000000000000'),
  ('DLT','Decilitre','dL','volume','00000000-0000-0000-0000-000000000000'),
  ('LTR','Litre','L','volume','00000000-0000-0000-0000-000000000000'),
  ('HLT','Hectolitre','hL','volume','00000000-0000-0000-0000-000000000000'),
  ('CMQ','Cubic Centimetre','cm³','volume','00000000-0000-0000-0000-000000000000'),
  ('DMQ','Cubic Decimetre','dm³','volume','00000000-0000-0000-0000-000000000000'),
  ('MTQ','Cubic Metre','m³','volume','00000000-0000-0000-0000-000000000000'),
  ('INQ','Cubic Inch','in³','volume','00000000-0000-0000-0000-000000000000'),
  ('FTQ','Cubic Foot','ft³','volume','00000000-0000-0000-0000-000000000000'),
  ('GLL','Gallon (US)','gal','volume','00000000-0000-0000-0000-000000000000'),
  ('GLI','Gallon (UK)','gal','volume','00000000-0000-0000-0000-000000000000'),
  ('QTI','Quart (US)','qt','volume','00000000-0000-0000-0000-000000000000'),
  ('PTI','Pint (US)','pt','volume','00000000-0000-0000-0000-000000000000'),
  ('OZA','Fluid Ounce (US)','fl oz','volume','00000000-0000-0000-0000-000000000000'),
  ('BLL','Barrel (US petroleum)','bbl','volume','00000000-0000-0000-0000-000000000000'),
  -- CYD is the canonical UN/ECE code for cubic yard; YDQ was removed (not UN/ECE, duplicated CYD)
  ('CYD','Cubic Yard','yd³','volume','00000000-0000-0000-0000-000000000000'),
  ('BFT','Board Foot','bd ft','volume','00000000-0000-0000-0000-000000000000'),
  ('MBF','Thousand Board Feet','MBF','volume','00000000-0000-0000-0000-000000000000')
on conflict (code) do update set
  name          = excluded.name,
  symbol        = excluded.symbol,
  quantity_type = excluded.quantity_type,
  updated_at    = now(),
  updated_by    = excluded.created_by;

-- ============================================================================
-- time — Duration
-- ============================================================================
insert into shared.uom (code, name, symbol, quantity_type, created_by)
values
  ('SEC','Second','s','time','00000000-0000-0000-0000-000000000000'),
  ('MIN','Minute','min','time','00000000-0000-0000-0000-000000000000'),
  ('HUR','Hour','h','time','00000000-0000-0000-0000-000000000000'),
  ('DAY','Day','d','time','00000000-0000-0000-0000-000000000000'),
  ('WEE','Week','wk','time','00000000-0000-0000-0000-000000000000'),
  ('MON','Month','mo','time','00000000-0000-0000-0000-000000000000'),
  ('QAN','Quarter','qtr','time','00000000-0000-0000-0000-000000000000'),
  ('ANN','Year','yr','time','00000000-0000-0000-0000-000000000000')
on conflict (code) do update set
  name          = excluded.name,
  symbol        = excluded.symbol,
  quantity_type = excluded.quantity_type,
  updated_at    = now(),
  updated_by    = excluded.created_by;

-- ============================================================================
-- temperature
-- ============================================================================
insert into shared.uom (code, name, symbol, quantity_type, created_by)
values
  ('CEL','Degree Celsius','°C','temperature','00000000-0000-0000-0000-000000000000'),
  ('FAH','Degree Fahrenheit','°F','temperature','00000000-0000-0000-0000-000000000000'),
  ('KEL','Kelvin','K','temperature','00000000-0000-0000-0000-000000000000')
on conflict (code) do update set
  name          = excluded.name,
  symbol        = excluded.symbol,
  quantity_type = excluded.quantity_type,
  updated_at    = now(),
  updated_by    = excluded.created_by;

-- ============================================================================
-- speed — Velocity
-- ============================================================================
insert into shared.uom (code, name, symbol, quantity_type, created_by)
values
  ('MTS','Metre per Second','m/s','speed','00000000-0000-0000-0000-000000000000'),
  ('KMH','Kilometre per Hour','km/h','speed','00000000-0000-0000-0000-000000000000'),
  ('HM','Mile per Hour','mph','speed','00000000-0000-0000-0000-000000000000'),
  ('KNT','Knot','kn','speed','00000000-0000-0000-0000-000000000000')
on conflict (code) do update set
  name          = excluded.name,
  symbol        = excluded.symbol,
  quantity_type = excluded.quantity_type,
  updated_at    = now(),
  updated_by    = excluded.created_by;

-- ============================================================================
-- force
-- ============================================================================
insert into shared.uom (code, name, symbol, quantity_type, created_by)
values
  ('NEW','Newton','N','force','00000000-0000-0000-0000-000000000000'),
  ('KGF','Kilogram-force','kgf','force','00000000-0000-0000-0000-000000000000')
on conflict (code) do update set
  name          = excluded.name,
  symbol        = excluded.symbol,
  quantity_type = excluded.quantity_type,
  updated_at    = now(),
  updated_by    = excluded.created_by;

-- ============================================================================
-- pressure
-- ============================================================================
insert into shared.uom (code, name, symbol, quantity_type, created_by)
values
  ('PAL','Pascal','Pa','pressure','00000000-0000-0000-0000-000000000000'),
  ('KPA','Kilopascal','kPa','pressure','00000000-0000-0000-0000-000000000000'),
  ('MPA','Megapascal','MPa','pressure','00000000-0000-0000-0000-000000000000'),
  ('BAR','Bar','bar','pressure','00000000-0000-0000-0000-000000000000'),
  ('ATM','Standard Atmosphere','atm','pressure','00000000-0000-0000-0000-000000000000'),
  ('PS','Pound per Square Inch','psi','pressure','00000000-0000-0000-0000-000000000000')
on conflict (code) do update set
  name          = excluded.name,
  symbol        = excluded.symbol,
  quantity_type = excluded.quantity_type,
  updated_at    = now(),
  updated_by    = excluded.created_by;

-- ============================================================================
-- energy
-- ============================================================================
insert into shared.uom (code, name, symbol, quantity_type, created_by)
values
  ('JOU','Joule','J','energy','00000000-0000-0000-0000-000000000000'),
  ('KJO','Kilojoule','kJ','energy','00000000-0000-0000-0000-000000000000'),
  ('WHR','Watt-hour','Wh','energy','00000000-0000-0000-0000-000000000000'),
  ('KWH','Kilowatt-hour','kWh','energy','00000000-0000-0000-0000-000000000000'),
  ('MWH','Megawatt-hour','MWh','energy','00000000-0000-0000-0000-000000000000'),
  ('BTU','British Thermal Unit','BTU','energy','00000000-0000-0000-0000-000000000000'),
  ('A53','Electronvolt','eV','energy','00000000-0000-0000-0000-000000000000')
on conflict (code) do update set
  name          = excluded.name,
  symbol        = excluded.symbol,
  quantity_type = excluded.quantity_type,
  updated_at    = now(),
  updated_by    = excluded.created_by;

-- ============================================================================
-- power
-- ============================================================================
insert into shared.uom (code, name, symbol, quantity_type, created_by)
values
  ('WTT','Watt','W','power','00000000-0000-0000-0000-000000000000'),
  ('KWT','Kilowatt','kW','power','00000000-0000-0000-0000-000000000000'),
  ('MAW','Megawatt','MW','power','00000000-0000-0000-0000-000000000000')
on conflict (code) do update set
  name          = excluded.name,
  symbol        = excluded.symbol,
  quantity_type = excluded.quantity_type,
  updated_at    = now(),
  updated_by    = excluded.created_by;

-- ============================================================================
-- electrical
-- ============================================================================
insert into shared.uom (code, name, symbol, quantity_type, created_by)
values
  ('AMP','Ampere','A','electrical','00000000-0000-0000-0000-000000000000'),
  ('B22','Kiloampere','kA','electrical','00000000-0000-0000-0000-000000000000'),
  ('VLT','Volt','V','electrical','00000000-0000-0000-0000-000000000000'),
  ('KVT','Kilovolt','kV','electrical','00000000-0000-0000-0000-000000000000'),
  ('OHM','Ohm','Ω','electrical','00000000-0000-0000-0000-000000000000'),
  ('FAR','Farad','F','electrical','00000000-0000-0000-0000-000000000000'),
  ('B69','Microfarad','µF','electrical','00000000-0000-0000-0000-000000000000'),
  ('D10','Siemens','S','electrical','00000000-0000-0000-0000-000000000000')
on conflict (code) do update set
  name          = excluded.name,
  symbol        = excluded.symbol,
  quantity_type = excluded.quantity_type,
  updated_at    = now(),
  updated_by    = excluded.created_by;

-- ============================================================================
-- frequency
-- ============================================================================
insert into shared.uom (code, name, symbol, quantity_type, created_by)
values
  ('HTZ','Hertz','Hz','frequency','00000000-0000-0000-0000-000000000000'),
  ('KHZ','Kilohertz','kHz','frequency','00000000-0000-0000-0000-000000000000'),
  ('MHZ','Megahertz','MHz','frequency','00000000-0000-0000-0000-000000000000'),
  ('A86','Gigahertz','GHz','frequency','00000000-0000-0000-0000-000000000000')
on conflict (code) do update set
  name          = excluded.name,
  symbol        = excluded.symbol,
  quantity_type = excluded.quantity_type,
  updated_at    = now(),
  updated_by    = excluded.created_by;

-- ============================================================================
-- density
-- ============================================================================
insert into shared.uom (code, name, symbol, quantity_type, created_by)
values
  ('KMQ','Kilogram per Cubic Metre','kg/m³','density','00000000-0000-0000-0000-000000000000'),
  ('GL','Gram per Litre','g/L','density','00000000-0000-0000-0000-000000000000')
on conflict (code) do update set
  name          = excluded.name,
  symbol        = excluded.symbol,
  quantity_type = excluded.quantity_type,
  updated_at    = now(),
  updated_by    = excluded.created_by;

-- ============================================================================
-- digital — Data
-- ============================================================================
insert into shared.uom (code, name, symbol, quantity_type, created_by)
values
  ('E68','Bit','bit','digital','00000000-0000-0000-0000-000000000000'),
  ('AD','Byte','B','digital','00000000-0000-0000-0000-000000000000'),
  ('E36','Kilobyte','KB','digital','00000000-0000-0000-0000-000000000000'),
  ('4L','Megabyte','MB','digital','00000000-0000-0000-0000-000000000000'),
  ('E34','Gigabyte','GB','digital','00000000-0000-0000-0000-000000000000'),
  ('E35','Terabyte','TB','digital','00000000-0000-0000-0000-000000000000')
on conflict (code) do update set
  name          = excluded.name,
  symbol        = excluded.symbol,
  quantity_type = excluded.quantity_type,
  updated_at    = now(),
  updated_by    = excluded.created_by;

-- ============================================================================
-- angle
-- ============================================================================
insert into shared.uom (code, name, symbol, quantity_type, created_by)
values
  ('DD','Degree (angle)','°','angle','00000000-0000-0000-0000-000000000000'),
  ('RAD','Radian','rad','angle','00000000-0000-0000-0000-000000000000'),
  ('D61','Minute (angle)','''','angle','00000000-0000-0000-0000-000000000000')
on conflict (code) do update set
  name          = excluded.name,
  symbol        = excluded.symbol,
  quantity_type = excluded.quantity_type,
  updated_at    = now(),
  updated_by    = excluded.created_by;

-- ============================================================================
-- service — Labour, Manpower, IT, Logistics, Billing
-- ============================================================================
insert into shared.uom (code, name, symbol, quantity_type, created_by)
values
  -- Labour / Manpower
  ('MHR','Man-hour','man·h','service','00000000-0000-0000-0000-000000000000'),
  ('DAD','Man-day','man·d','service','00000000-0000-0000-0000-000000000000'),
  ('MMN','Man-month','man·mo','service','00000000-0000-0000-0000-000000000000'),
  ('MYR','Man-year','man·a','service','00000000-0000-0000-0000-000000000000'),
  ('FTE','Full-Time Equivalent','FTE','service','00000000-0000-0000-0000-000000000000'),
  ('E65','Resource-hour','res·h','service','00000000-0000-0000-0000-000000000000'),
  ('E66','Person-day','pd','service','00000000-0000-0000-0000-000000000000'),
  ('E67','Person-month','pm','service','00000000-0000-0000-0000-000000000000'),
  -- General service
  ('LS','Lump Sum','LS','service','00000000-0000-0000-0000-000000000000'),
  ('E09','Job','job','service','00000000-0000-0000-0000-000000000000'),
  ('ACT','Activity','act','service','00000000-0000-0000-0000-000000000000'),
  ('E27','Dose','dose','service','00000000-0000-0000-0000-000000000000'),
  -- Logistics / Transport
  ('E99','Trip','trip','service','00000000-0000-0000-0000-000000000000'),
  ('E91','Shipment','shpmt','service','00000000-0000-0000-0000-000000000000'),
  ('E92','Delivery','dlvy','service','00000000-0000-0000-0000-000000000000'),
  ('E86','Consignment','csgn','service','00000000-0000-0000-0000-000000000000'),
  -- Subscription / Rental / Billing
  ('E48','User','user','service','00000000-0000-0000-0000-000000000000'),
  ('E49','Seat','seat','service','00000000-0000-0000-0000-000000000000'),
  ('E50','Licence','lic','service','00000000-0000-0000-0000-000000000000'),
  ('E51','Transaction','txn','service','00000000-0000-0000-0000-000000000000'),
  ('E52','API Call','call','service','00000000-0000-0000-0000-000000000000'),
  ('E53','Message','msg','service','00000000-0000-0000-0000-000000000000'),
  ('E54','Request','req','service','00000000-0000-0000-0000-000000000000'),
  ('E55','Credit','cr','service','00000000-0000-0000-0000-000000000000'),
  ('E56','Token','tkn','service','00000000-0000-0000-0000-000000000000'),
  -- IT Services
  ('SPR','Sprint','sprint','service','00000000-0000-0000-0000-000000000000'),
  ('STP','Story Point','SP','service','00000000-0000-0000-0000-000000000000'),
  ('E57','Incident','inc','service','00000000-0000-0000-0000-000000000000'),
  ('E58','Ticket','tkt','service','00000000-0000-0000-0000-000000000000'),
  ('E59','Service Request','SR','service','00000000-0000-0000-0000-000000000000'),
  ('E60','Change Request','CR','service','00000000-0000-0000-0000-000000000000'),
  ('E61','Environment','env','service','00000000-0000-0000-0000-000000000000'),
  ('E62','Instance','inst','service','00000000-0000-0000-0000-000000000000'),
  ('E63','Deployment','dply','service','00000000-0000-0000-0000-000000000000'),
  ('E64','Build','bld','service','00000000-0000-0000-0000-000000000000')
on conflict (code) do update set
  name          = excluded.name,
  symbol        = excluded.symbol,
  quantity_type = excluded.quantity_type,
  updated_at    = now(),
  updated_by    = excluded.created_by;

-- ============================================================================
-- ratio — Dimensionless
-- Pure ratios with no physical dimension. P1 is the UN/ECE Rec 20 code for
-- percent and is the primary dimensionless ratio unit.
-- ============================================================================
insert into shared.uom (code, name, symbol, quantity_type, created_by)
values
  ('P1', 'Percent',             '%',     'ratio', '00000000-0000-0000-0000-000000000000'),
  ('GK', 'Gram per Kilogram',   'g/kg',  'ratio', '00000000-0000-0000-0000-000000000000'),
  ('GP', 'Gram per 100 Gram',   'g/100g','ratio', '00000000-0000-0000-0000-000000000000')
on conflict (code) do update set
  name          = excluded.name,
  symbol        = excluded.symbol,
  quantity_type = excluded.quantity_type,
  updated_at    = now(),
  updated_by    = excluded.created_by;

-- ============================================================================
-- concentration — Amount per unit volume or mass
-- Used in chemistry, pharmaceuticals, food safety, and environmental reporting.
-- UN/ECE Rec 20 codes where available; MGL/C37 are standard.
-- ============================================================================
insert into shared.uom (code, name, symbol, quantity_type, created_by)
values
  ('MRL', 'Milligram per Litre',        'mg/L',   'concentration', '00000000-0000-0000-0000-000000000000'),
  ('C37', 'Milligram per Gram',          'mg/g',   'concentration', '00000000-0000-0000-0000-000000000000'),
  ('M29', 'Microgram per Litre',         'µg/L',   'concentration', '00000000-0000-0000-0000-000000000000'),
  ('M30', 'Milligram per Cubic Metre',   'mg/m³',  'concentration', '00000000-0000-0000-0000-000000000000'),
  -- PPM / PPB: not in UN/ECE Rec 20; custom codes for parts-per notation
  ('PPM', 'Part per Million',            'ppm',    'concentration', '00000000-0000-0000-0000-000000000000'),
  ('PPB', 'Part per Billion',            'ppb',    'concentration', '00000000-0000-0000-0000-000000000000')
on conflict (code) do update set
  name          = excluded.name,
  symbol        = excluded.symbol,
  quantity_type = excluded.quantity_type,
  updated_at    = now(),
  updated_by    = excluded.created_by;

-- ============================================================================
-- luminosity — Light intensity and flux
-- UN/ECE Rec 20 codes: B52 (candela), B55 (lumen), B62 (lux).
-- ============================================================================
insert into shared.uom (code, name, symbol, quantity_type, created_by)
values
  ('B52', 'Candela',             'cd',   'luminosity', '00000000-0000-0000-0000-000000000000'),
  ('B55', 'Lumen',               'lm',   'luminosity', '00000000-0000-0000-0000-000000000000'),
  ('B62', 'Lux',                 'lx',   'luminosity', '00000000-0000-0000-0000-000000000000')
on conflict (code) do update set
  name          = excluded.name,
  symbol        = excluded.symbol,
  quantity_type = excluded.quantity_type,
  updated_at    = now(),
  updated_by    = excluded.created_by;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/010_system/001_shared/010_persona.sql
-- 900_seed_data/001_shared/010_persona.sql
-- Seed: System personas (role templates)
-- Schema: shared | Table: persona
-- Idempotent: on conflict (code) do nothing

insert into shared.persona (code, name, description, scope_mode, priority, is_system, created_by) values
  ('viewer',      'Viewer',       'Read-only access to records',         'tenant', 10,  true, '00000000-0000-0000-0000-000000000000'),
  ('reporter',    'Reporter',     'Viewer plus reporting capabilities',  'tenant', 20,  true, '00000000-0000-0000-0000-000000000000'),
  ('requester',   'Requester',    'Can create and manage own requests',  'tenant', 30,  true, '00000000-0000-0000-0000-000000000000'),
  ('agent',       'Agent',        'Process requests within assigned OU', 'tenant', 40,  true, '00000000-0000-0000-0000-000000000000'),
  ('manager',     'Manager',      'Manage and approve within OU scope',  'tenant', 50,  true, '00000000-0000-0000-0000-000000000000'),
  ('owner',       'Owner',        'Full operational control within scope','tenant', 55,  true, '00000000-0000-0000-0000-000000000000'),
  ('admin',       'Admin',        'Administrative operations, no workflow/finance', 'tenant', 70, true, '00000000-0000-0000-0000-000000000000')
on conflict (code) do nothing;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/010_system/001_shared/011_workspace.sql
-- 900_seed_data/001_shared/011_workspace.sql
-- Seed: Product workspaces
-- Schema: shared | Table: workspace
-- Idempotent: on conflict (code) do update

insert into shared.workspace (code, name, description, sort_order, created_by) values
  ('CORE', 'Core Platform',         'Cross-cutting platform infrastructure and shared services',              10, '00000000-0000-0000-0000-000000000000'),
  ('FIN',  'Finance',               'Financial accounting, payments, treasury, and budgeting',               20, '00000000-0000-0000-0000-000000000000'),
  ('SCM',  'Supply Chain',          'Procurement, inventory, warehousing, and logistics',                    30, '00000000-0000-0000-0000-000000000000'),
  ('COM',  'Commercial',            'Sales, customer relationship management, and commercial operations',    40, '00000000-0000-0000-0000-000000000000'),
  ('PPL',  'People',                'Human resources and payroll',                                           50, '00000000-0000-0000-0000-000000000000'),
  ('PRS',  'Projects & Services',   'Projects, tasks, and service management',                               60, '00000000-0000-0000-0000-000000000000'),
  ('OPS',  'Operations',            'Manufacturing, maintenance, and production operations',                 70, '00000000-0000-0000-0000-000000000000'),
  ('AST',  'Assets & Facilities',   'Fixed assets, real estate, and facility management',                   80, '00000000-0000-0000-0000-000000000000'),
  ('PTR',  'Partner Collaboration', 'Partner portals, collaborative ordering, invoicing, and logistics exchange', 90, '00000000-0000-0000-0000-000000000000')
on conflict (code) do update set
    name        = excluded.name,
    description = excluded.description,
    sort_order  = excluded.sort_order,
    updated_at  = now(),
    updated_by  = excluded.created_by;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/010_system/001_shared/012_module.sql
-- 900_seed_data/001_shared/012_module.sql
-- Seed: Product modules + workspace linkage
-- Schema: shared | Table: module
-- Depends on: 011_workspace.sql
-- Idempotent: on conflict (code) do update

-- ============================================================================
-- Core Platform modules  (workspace: CORE)
-- ============================================================================
insert into shared.module (code, name, description, config, created_by) values
  ('FND',  'Foundation Runtime',            'Meta-driven runtime engine',            '{"tier":"Core"}'::jsonb, '00000000-0000-0000-0000-000000000000'),
  ('META', 'Metadata Studio',              'Declarative configuration',             '{"tier":"Core"}'::jsonb, '00000000-0000-0000-0000-000000000000'),
  ('IAM',  'Identity & Access Management', 'Authentication and authorization',      '{"tier":"Core"}'::jsonb, '00000000-0000-0000-0000-000000000000'),
  ('AUD',  'Audit & Governance',           'Audit trails and compliance',           '{"tier":"Core"}'::jsonb, '00000000-0000-0000-0000-000000000000'),
  ('POL',  'Policy & Rules Engine',        'Business rules and validations',        '{"tier":"Core"}'::jsonb, '00000000-0000-0000-0000-000000000000'),
  ('WFL',  'Workflow Engine',              'State machines and approvals',          '{"tier":"Core"}'::jsonb, '00000000-0000-0000-0000-000000000000'),
  ('JOB',  'Automation & Jobs',            'Schedulers and background tasks',       '{"tier":"Core"}'::jsonb, '00000000-0000-0000-0000-000000000000'),
  ('DOC',  'Document Services',            'PDF/HTML generation',                   '{"tier":"Core"}'::jsonb, '00000000-0000-0000-0000-000000000000'),
  ('NTF',  'Notification Services',        'Email and alerts',                      '{"tier":"Core"}'::jsonb, '00000000-0000-0000-0000-000000000000'),
  ('INT',  'Integration Hub',              'API gateway and webhooks',              '{"tier":"Core"}'::jsonb, '00000000-0000-0000-0000-000000000000'),
  ('CMS',  'Content Services',             'Document storage',                      '{"tier":"Core"}'::jsonb, '00000000-0000-0000-0000-000000000000'),
  ('ACT',  'Activity & Commentary',        'Comments and timelines',               '{"tier":"Core"}'::jsonb, '00000000-0000-0000-0000-000000000000'),
  ('REL',  'Reference & Shared Data',      'Reference & Shared Data',               '{"tier":"Core"}'::jsonb, '00000000-0000-0000-0000-000000000000')
on conflict (code) do update set
    name        = excluded.name,
    description = excluded.description,
    config      = excluded.config,
    updated_at  = now(),
    updated_by  = excluded.created_by;

-- ============================================================================
-- Finance modules  (workspace: FIN)
-- ============================================================================
insert into shared.module (code, name, description, config, created_by) values
  ('ACC',      'Core Accounting',             'General Ledger, AP, AR, fiscal controls',                                                                      '{"tier":"Base","dependencies":["FND"]}'::jsonb,                       '00000000-0000-0000-0000-000000000000'),
  ('PAY',      'Payment Processing',          'Collections, disbursements, reconciliation',                                                                    '{"tier":"Base","dependencies":["ACC"]}'::jsonb,                       '00000000-0000-0000-0000-000000000000'),
  ('TREASURY', 'Treasury & Cash Management',  'Cash positioning, bank accounts, liquidity, FX exposure, bank reconciliation, funding',                         '{"tier":"Base","dependencies":["ACC","PAY"]}'::jsonb,                 '00000000-0000-0000-0000-000000000000'),
  ('BUDGET',   'Budget & Funds Control',      'Budget planning, allocation, commitment control, availability checks, and budget consumption tracking',          '{"tier":"Enterprise","dependencies":["ACC","WFL"]}'::jsonb,           '00000000-0000-0000-0000-000000000000'),
  ('PAYG',     'Payment Gateway',             'External payment providers (Stripe, etc.)',                                                                     '{"tier":"Professional","dependencies":["PAY"]}'::jsonb,              '00000000-0000-0000-0000-000000000000')
on conflict (code) do update set
    name        = excluded.name,
    description = excluded.description,
    config      = excluded.config,
    updated_at  = now(),
    updated_by  = excluded.created_by;

-- ============================================================================
-- Supply Chain modules  (workspace: SCM)
-- ============================================================================
insert into shared.module (code, name, description, config, created_by) values
  ('SRM',       'Supplier Relationship Management', 'Supplier Lifecycle and Performance Management',                             '{"tier":"Base","dependencies":["REL","WFL","AUD"]}'::jsonb,        '00000000-0000-0000-0000-000000000000'),
  ('SOURCE',    'Sourcing',                         'RFQs, bids, vendor selection',                                             '{"tier":"Base","dependencies":["REL","WFL","DOC","NTF"]}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
  ('CONTRACT',  'Contract Management',              'Commercial contracts, terms, obligations',                                  '{"tier":"Base","dependencies":["REL","WFL","DOC","NTF"]}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
  ('BUY',       'Procurement',                      'Purchasing, requisitions, POs',                                            '{"tier":"Base","dependencies":["FND","REL"]}'::jsonb,               '00000000-0000-0000-0000-000000000000'),
  ('INVENTORY', 'Inventory Management',             'Inventory, valuation, movements',                                          '{"tier":"Base","dependencies":["FND","REL","ACC"]}'::jsonb,         '00000000-0000-0000-0000-000000000000'),
  ('QMS',       'Quality Management',               'Inspections, QC processes',                                                '{"tier":"Base","dependencies":["INVENTORY"]}'::jsonb,               '00000000-0000-0000-0000-000000000000'),
  ('SUBCON',    'Subcontracting',                   'Job subcontract workflows',                                                 '{"tier":"Base","dependencies":["BUY","INVENTORY"]}'::jsonb,         '00000000-0000-0000-0000-000000000000'),
  ('DEMAND',    'Demand Planning & Forecasting',    'Statistical & AI-based demand forecasting, planning scenarios',            '{"tier":"Enterprise","dependencies":["INVENTORY","SALE"]}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
  ('WMS',       'Warehouse Management',             'Bin management, putaway, picking, packing, cycle counting, barcode/RFID',  '{"tier":"Enterprise","dependencies":["INVENTORY"]}'::jsonb,         '00000000-0000-0000-0000-000000000000'),
  ('LOGISTICS', 'Transportation & Logistics',       'Shipment planning, carriers, freight costs, delivery tracking',            '{"tier":"Enterprise","dependencies":["WMS","INVENTORY"]}'::jsonb,   '00000000-0000-0000-0000-000000000000')
on conflict (code) do update set
    name        = excluded.name,
    description = excluded.description,
    config      = excluded.config,
    updated_at  = now(),
    updated_by  = excluded.created_by;

-- ============================================================================
-- Commercial modules  (workspace: COM)
-- ============================================================================
insert into shared.module (code, name, description, config, created_by) values
  ('CRM',  'Customer Relationship Management', 'Leads, opportunities, pipeline management',  '{"tier":"Base","dependencies":["REL"]}'::jsonb,       '00000000-0000-0000-0000-000000000000'),
  ('SALE', 'Sales & Order Management',         'Sales cycle, orders, invoicing',             '{"tier":"Base","dependencies":["FND","REL"]}'::jsonb, '00000000-0000-0000-0000-000000000000')
on conflict (code) do update set
    name        = excluded.name,
    description = excluded.description,
    config      = excluded.config,
    updated_at  = now(),
    updated_by  = excluded.created_by;

-- ============================================================================
-- People modules  (workspace: PPL)
-- ============================================================================
insert into shared.module (code, name, description, config, created_by) values
  ('HR',      'Human Resources', 'Employee lifecycle, organization structure',  '{"tier":"Base","dependencies":["FND","REL"]}'::jsonb, '00000000-0000-0000-0000-000000000000'),
  ('PAYROLL', 'Payroll',         'Salaries, statutory compliance',              '{"tier":"Base","dependencies":["HR","ACC"]}'::jsonb,  '00000000-0000-0000-0000-000000000000')
on conflict (code) do update set
    name        = excluded.name,
    description = excluded.description,
    config      = excluded.config,
    updated_at  = now(),
    updated_by  = excluded.created_by;

-- ============================================================================
-- Projects & Services modules  (workspace: PRS)
-- ============================================================================
insert into shared.module (code, name, description, config, created_by) values
  ('PRJCOST', 'Project Management',  'Project, Task, Project budgets, WBS, cost tracking, revenue recognition',  '{"tier":"Base","dependencies":["ACC","BUDGET"]}'::jsonb,                   '00000000-0000-0000-0000-000000000000'),
  ('ITSM',    'Service Management',  'Tickets, SLAs, service workflows',                                         '{"tier":"Base","dependencies":["FND","WFL","ASSET","NTF","AUD"]}'::jsonb,  '00000000-0000-0000-0000-000000000000')
on conflict (code) do update set
    name        = excluded.name,
    description = excluded.description,
    config      = excluded.config,
    updated_at  = now(),
    updated_by  = excluded.created_by;

-- ============================================================================
-- Operations modules  (workspace: OPS)
-- ============================================================================
insert into shared.module (code, name, description, config, created_by) values
  ('MAINT', 'Maintenance Management', 'Preventive & corrective maintenance',  '{"tier":"Base","dependencies":["BUY","ASSET","INVENTORY"]}'::jsonb, '00000000-0000-0000-0000-000000000000'),
  ('MFG',   'Manufacturing',          'BOMs, work orders, MRP',               '{"tier":"Base","dependencies":["INVENTORY"]}'::jsonb,               '00000000-0000-0000-0000-000000000000')
on conflict (code) do update set
    name        = excluded.name,
    description = excluded.description,
    config      = excluded.config,
    updated_at  = now(),
    updated_by  = excluded.created_by;

-- ============================================================================
-- Assets & Facilities modules  (workspace: AST)
-- ============================================================================
insert into shared.module (code, name, description, config, created_by) values
  ('ASSET',     'Asset Management',             'Asset lifecycle, depreciation',                                              '{"tier":"Enterprise","dependencies":["FND","ACC","AUD"]}'::jsonb,        '00000000-0000-0000-0000-000000000000'),
  ('ASSETREMS', 'Real Estate Asset Management', 'Property, lease, tenancy, rental billing, CAM charges, asset depreciation',  '{"tier":"Enterprise","dependencies":["ASSET","ACC","CONTRACT"]}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
  ('ASSETFM',   'Facility Management',          'Buildings, utilities, space, maintenance cost centers',                      '{"tier":"Base","dependencies":["ASSET","MAINT"]}'::jsonb,                '00000000-0000-0000-0000-000000000000')
on conflict (code) do update set
    name        = excluded.name,
    description = excluded.description,
    config      = excluded.config,
    updated_at  = now(),
    updated_by  = excluded.created_by;

-- ============================================================================
-- Partner Collaboration modules  (workspace: PTR)
-- ============================================================================
insert into shared.module (code, name, description, config, created_by) values
  ('PCON',  'Proposal & Contract Collaboration', 'Partner-facing collaboration for proposals, commercial terms, and contract exchange',        '{"tier":"Base","dependencies":["CONTRACT","REL"]}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
  ('OMI',   'Order Intake',                      'Inbound partner orders and order acknowledgements received from external parties',            '{"tier":"Base","dependencies":["BUY","REL"]}'::jsonb,       '00000000-0000-0000-0000-000000000000'),
  ('IMO',   'Invoice Delivery',                  'Outbound invoices and invoice delivery to customers or partner channels',                     '{"tier":"Base","dependencies":["ACC","REL"]}'::jsonb,       '00000000-0000-0000-0000-000000000000'),
  ('CCON',  'Customer Contract Portal',          'Customer-visible contract access, commercial documents, and renewal interaction',             '{"tier":"Base","dependencies":["CONTRACT","CRM"]}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
  ('SOO',   'Sales Order Delivery',              'Outbound sales orders sent to fulfillment, distributors, or trading partners',                '{"tier":"Base","dependencies":["SALE","REL"]}'::jsonb,      '00000000-0000-0000-0000-000000000000'),
  ('SII',   'Sales Invoice Intake',              'Inbound customer-side sales invoice intake and validation from connected channels',           '{"tier":"Base","dependencies":["ACC","SALE"]}'::jsonb,      '00000000-0000-0000-0000-000000000000'),
  ('LOGX',  'Logistics Collaboration',           'Shipment visibility, transport milestone exchange, and logistics partner coordination',       '{"tier":"Base","dependencies":["LOGISTICS","REL"]}'::jsonb, '00000000-0000-0000-0000-000000000000')
on conflict (code) do update set
    name        = excluded.name,
    description = excluded.description,
    config      = excluded.config,
    updated_at  = now(),
    updated_by  = excluded.created_by;

-- ============================================================================
-- Link modules → workspaces
-- These UPDATEs always run; re-runs are idempotent (setting same value).
-- ============================================================================

-- CORE: cross-cutting platform modules
update shared.module
   set workspace_id = (select id from shared.workspace where code = 'CORE')
 where code in ('FND', 'META', 'IAM', 'AUD', 'POL', 'WFL', 'JOB', 'DOC', 'NTF', 'INT', 'CMS', 'ACT', 'REL')
   and exists (select 1 from shared.workspace where code = 'CORE');

-- FIN: finance modules
update shared.module
   set workspace_id = (select id from shared.workspace where code = 'FIN')
 where code in ('ACC', 'PAY', 'TREASURY', 'BUDGET', 'PAYG')
   and exists (select 1 from shared.workspace where code = 'FIN');

-- SCM: supply chain modules
update shared.module
   set workspace_id = (select id from shared.workspace where code = 'SCM')
 where code in ('SRM', 'SOURCE', 'CONTRACT', 'BUY', 'INVENTORY', 'QMS', 'SUBCON', 'DEMAND', 'WMS', 'LOGISTICS')
   and exists (select 1 from shared.workspace where code = 'SCM');

-- COM: commercial modules
update shared.module
   set workspace_id = (select id from shared.workspace where code = 'COM')
 where code in ('CRM', 'SALE')
   and exists (select 1 from shared.workspace where code = 'COM');

-- PPL: people modules
update shared.module
   set workspace_id = (select id from shared.workspace where code = 'PPL')
 where code in ('HR', 'PAYROLL')
   and exists (select 1 from shared.workspace where code = 'PPL');

-- PRS: projects & services modules
update shared.module
   set workspace_id = (select id from shared.workspace where code = 'PRS')
 where code in ('PRJCOST', 'ITSM')
   and exists (select 1 from shared.workspace where code = 'PRS');

-- OPS: operations modules
update shared.module
   set workspace_id = (select id from shared.workspace where code = 'OPS')
 where code in ('MAINT', 'MFG')
   and exists (select 1 from shared.workspace where code = 'OPS');

-- AST: assets & facilities modules
update shared.module
   set workspace_id = (select id from shared.workspace where code = 'AST')
 where code in ('ASSET', 'ASSETREMS', 'ASSETFM')
   and exists (select 1 from shared.workspace where code = 'AST');

-- PTR: partner collaboration modules
update shared.module
   set workspace_id = (select id from shared.workspace where code = 'PTR')
 where code in ('PCON', 'OMI', 'IMO', 'CCON', 'SOO', 'SII', 'LOGX')
   and exists (select 1 from shared.workspace where code = 'PTR');

-- ============================================================================
-- Cleanup: remove obsolete workspace records no longer in the product taxonomy.
-- Module FKs are already reassigned above so deletes will not violate constraints.
-- ============================================================================
delete from shared.workspace
 where code in ('CXP', 'PMO', 'MFO', 'ASM', 'PRM');

-- Report
DO $$ DECLARE w int; m int; BEGIN
  SELECT count(*) INTO w FROM shared.workspace;
  SELECT count(*) INTO m FROM shared.module;
  RAISE NOTICE 'shared.workspace: % rows | shared.module: % rows', w, m;
END $$;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/010_system/001_shared/013_enterprise_feature.sql
-- 900_seed_data/001_shared/013_enterprise_feature.sql
-- Seed: Enterprise feature registry (Special Ops toggles)
-- Schema: shared | Table: enterprise_feature
-- Idempotent: on conflict (code) do nothing

insert into shared.enterprise_feature (code, name, description, view_key, edit_key, sort_order, created_by) values
  ('THEME_CHANGE',       'Theme Change',             'Customisable UI theming',       'feature:theme:view',     'feature:theme:edit',     10, '00000000-0000-0000-0000-000000000000'),
  ('ADVANCED_ANALYTICS', 'Advanced Analytics',        'Extended dashboards and drill-down','feature:analytics:view','feature:analytics:edit', 20, '00000000-0000-0000-0000-000000000000'),
  ('CUSTOM_WORKFLOW',    'Custom Workflow Builder',   'Visual workflow designer',       'feature:workflow:view',  'feature:workflow:edit',  30, '00000000-0000-0000-0000-000000000000'),
  ('API_WEBHOOKS',       'API & Webhooks',            'External API and webhook access','feature:api:view',       'feature:api:edit',       40, '00000000-0000-0000-0000-000000000000'),
  ('AI_FORECASTING',     'AI Forecasting',            'ML-powered financial forecasts', 'feature:ai:view',        'feature:ai:edit',        50, '00000000-0000-0000-0000-000000000000'),
  ('DIAGNOSTIC_TOOL',    'Self Diagnostic Tool',      'System health and diagnostics',  'feature:diag:view',      'feature:diag:edit',      60, '00000000-0000-0000-0000-000000000000'),
  ('WHITE_LABEL',        'White Label Branding',      'Full brand customisation',       'feature:brand:view',     'feature:brand:edit',     70, '00000000-0000-0000-0000-000000000000')
on conflict (code) do nothing;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/010_system/001_shared/014_subscription_plan.sql
-- 900_seed_data/001_shared/014_subscription_plan.sql
-- Seed: Subscription plan tiers
-- Schema: shared | Table: subscription_plan
-- Idempotent: on conflict (code) do nothing

insert into shared.subscription_plan (code, name, max_users, sort_order, created_by) values
  ('trial',        'Trial',         5,    10, '00000000-0000-0000-0000-000000000000'),
  ('base',         'Base',          50,   20, '00000000-0000-0000-0000-000000000000'),
  ('starter',      'Starter',       200,  30, '00000000-0000-0000-0000-000000000000'),
  ('professional', 'Professional',  1000, 40, '00000000-0000-0000-0000-000000000000'),
  ('enterprise',   'Enterprise',    NULL, 50, '00000000-0000-0000-0000-000000000000')
on conflict (code) do nothing;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/010_system/001_shared/015_permission_category.sql
-- 900_seed_data/001_shared/015_permission_category.sql
-- Seed: Permission categories
-- Schema: shared | Table: permission_category
-- Idempotent: on conflict (code) do nothing

insert into shared.permission_category (code, name, sort_order, created_by) values
  ('entity',        'Entity Operations',        10, '00000000-0000-0000-0000-000000000000'),
  ('workflow',      'Workflow Operations',       20, '00000000-0000-0000-0000-000000000000'),
  ('finance',       'Finance Operations',        30, '00000000-0000-0000-0000-000000000000'),
  ('utility',       'Utility Operations',        40, '00000000-0000-0000-0000-000000000000'),
  ('bulk',          'Bulk Operations',           50, '00000000-0000-0000-0000-000000000000'),
  ('delegation',    'Delegation Operations',     60, '00000000-0000-0000-0000-000000000000'),
  ('collaboration', 'Collaboration Operations',  70, '00000000-0000-0000-0000-000000000000'),
  ('special',       'Special Operations',        80, '00000000-0000-0000-0000-000000000000')
on conflict (code) do nothing;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/010_system/001_shared/016_permission.sql
-- 900_seed_data/001_shared/016_permission.sql
-- Seed: 40 atomic permissions across 8 categories (36 operational + 4 special)
-- Schema: shared | Table: permission
-- Depends on: 015_permission_category.sql
-- Idempotent: on conflict (code) do nothing

-- Entity operations
INSERT INTO shared.permission (code, name, category_id, scope_type, risk_level, is_plan_restricted, sort_order, created_by)
SELECT v.code, v.name, c.id, v.st, v.rl, v.pr, v.so, '00000000-0000-0000-0000-000000000000'::uuid
FROM shared.permission_category c
JOIN (VALUES
    ('read',         'Read',         'entity', 'record', 'low',    false, 10),
    ('create',       'Create',       'entity', 'record', 'low',    false, 20),
    ('update',       'Update',       'entity', 'record', 'low',    false, 30),
    ('delete_draft', 'Delete draft', 'entity', 'record', 'low',    false, 40),
    ('delete',       'Delete',       'entity', 'record', 'high',   false, 50)
) AS v(code, name, cat, st, rl, pr, so) ON c.code = v.cat
ON CONFLICT (code) DO NOTHING;

-- Workflow operations
INSERT INTO shared.permission (code, name, category_id, scope_type, risk_level, is_plan_restricted, sort_order, created_by)
SELECT v.code, v.name, c.id, v.st, v.rl, v.pr, v.so, '00000000-0000-0000-0000-000000000000'::uuid
FROM shared.permission_category c
JOIN (VALUES
    ('submit',   'Submit',   'workflow', 'record', 'low',    false, 10),
    ('amend',    'Amend',    'workflow', 'record', 'low',    false, 20),
    ('cancel',   'Cancel',   'workflow', 'record', 'medium', false, 30),
    ('close',    'Close',    'workflow', 'record', 'medium', false, 40),
    ('reopen',   'Reopen',   'workflow', 'record', 'medium', false, 50),
    ('withdraw', 'Withdraw', 'workflow', 'record', 'low',    false, 60),
    ('escalate', 'Escalate', 'workflow', 'record', 'low',    false, 70),
    ('approve',  'Approve',  'workflow', 'record', 'medium', false, 80),
    ('deny',     'Deny',     'workflow', 'record', 'medium', false, 90),
    ('void',     'Void',     'workflow', 'record', 'high',   false, 95)
) AS v(code, name, cat, st, rl, pr, so) ON c.code = v.cat
ON CONFLICT (code) DO NOTHING;

-- Finance, Utility, Bulk, Delegation, Collaboration, Special
INSERT INTO shared.permission (code, name, category_id, scope_type, risk_level, is_plan_restricted, sort_order, created_by)
SELECT v.code, v.name, c.id, v.st, v.rl, v.pr, v.so, '00000000-0000-0000-0000-000000000000'::uuid
FROM shared.permission_category c
JOIN (VALUES
    ('post',               'Post',                    'finance',       'record',  'high',     false, 10),
    ('reverse',            'Reverse',                 'finance',       'record',  'critical', true,  20),
    ('reconcile',          'Reconcile',               'finance',       'record',  'high',     false, 30),
    ('copy',               'Copy',                    'utility',       'record',  'low',      false, 10),
    ('merge',              'Merge',                   'utility',       'record',  'critical', true,  20),
    ('report',             'Report',                  'utility',       'record',  'low',      false, 30),
    ('print',              'Print',                   'utility',       'record',  'low',      false, 40),
    ('import',             'Import',                  'utility',       'record',  'medium',   true,  50),
    ('export',             'Export',                   'utility',       'record',  'low',      false, 60),
    ('bulk_import',        'Bulk import',             'bulk',          'tenant',  'high',     true,  10),
    ('bulk_export',        'Bulk export',             'bulk',          'tenant',  'high',     true,  20),
    ('bulk_update',        'Bulk update',             'bulk',          'tenant',  'critical', true,  30),
    ('bulk_delete',        'Bulk delete',             'bulk',          'tenant',  'critical', true,  40),
    ('delegate',           'Delegate',                'delegation',    'record',  'medium',   false, 10),
    ('share_read',         'Share read-only',         'delegation',    'record',  'low',      false, 20),
    ('share_edit',         'Share editable',          'delegation',    'record',  'medium',   false, 30),
    ('add_comment',        'Add comment',             'collaboration', 'record',  'low',      false, 10),
    ('add_attachment',     'Add attachment',           'collaboration', 'record',  'low',      false, 20),
    ('del_others_comment', 'Delete others comment',   'collaboration', 'record',  'medium',   false, 30),
    ('del_others_attach',  'Delete others attachment', 'collaboration', 'record',  'medium',   false, 40),
    ('follow',             'Follow',                  'collaboration', 'record',  'low',      false, 50),
    ('tag',                'Tag',                     'collaboration', 'record',  'low',      false, 60),
    ('feature_diagnostic', 'Self Diagnostic Tool',    'special',       'special', 'critical', false, 10),
    ('feature_theme',      'Theme Change',            'special',       'special', 'low',      false, 20),
    ('feature_view',       'View Access Features',    'special',       'special', 'low',      false, 30),
    ('feature_edit',       'Create/Edit Features',    'special',       'special', 'medium',   false, 40)
) AS v(code, name, cat, st, rl, pr, so) ON c.code = v.cat
ON CONFLICT (code) DO NOTHING;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/010_system/001_shared/017_persona_permission.sql
-- 900_seed_data/001_shared/017_persona_permission.sql
-- Seed: Persona × Permission grant matrix
-- Schema: shared | Table: persona_permission
-- Depends on: 010_persona.sql, 016_permission.sql
-- Idempotent: on conflict (persona_id, permission_id) do update
--
-- Grant matrix:
--   viewer:    read, report, print, export, follow, tag
--   reporter:  viewer + add_comment, add_attachment
--   requester: read+create+update+delete_draft+submit+amend+cancel+withdraw+escalate
--              +copy+report+print+export+follow+tag+add_comment+add_attachment+delegate+share_read
--   agent:     requester + approve+deny+post+reconcile+close+reopen+import
--   manager:   agent + reverse+merge+share_edit+del_others_comment+del_others_attach
--   owner:     all 36 except special (those via feature path)
--   admin:     read+create+update+delete_draft+delete+copy+merge+import+report+print+export
--              +bulk_*+delegate+share_read+share_edit+add_comment+add_attachment
--              +del_others_comment+del_others_attach+follow+tag (NO workflow/finance)

WITH persona_grants AS (
  SELECT p.id AS pid, pm.id AS permid, v.is_granted
  FROM shared.persona p
  CROSS JOIN shared.permission pm
  JOIN (VALUES
    -- viewer (read-only: no workflow actions)
    ('viewer','read',true),
    ('viewer','report',true),('viewer','print',true),('viewer','export',true),
    ('viewer','follow',true),('viewer','tag',true),
    -- reporter (viewer + comments/attachments + passive workflow visibility)
    ('reporter','read',true),('reporter','approve',true),('reporter','deny',true),
    ('reporter','report',true),('reporter','print',true),('reporter','export',true),
    ('reporter','follow',true),('reporter','tag',true),
    ('reporter','add_comment',true),('reporter','add_attachment',true),
    -- requester
    ('requester','read',true),('requester','create',true),('requester','update',true),
    ('requester','delete_draft',true),('requester','submit',true),('requester','amend',true),
    ('requester','cancel',true),('requester','withdraw',true),('requester','escalate',true),
    ('requester','copy',true),('requester','report',true),('requester','print',true),
    ('requester','export',true),('requester','follow',true),('requester','tag',true),
    ('requester','add_comment',true),('requester','add_attachment',true),
    ('requester','delegate',true),('requester','share_read',true),
    -- agent
    ('agent','read',true),('agent','create',true),('agent','update',true),
    ('agent','delete_draft',true),('agent','submit',true),('agent','amend',true),
    ('agent','cancel',true),('agent','close',true),('agent','reopen',true),
    ('agent','withdraw',true),('agent','escalate',true),('agent','approve',true),
    ('agent','deny',true),('agent','post',true),('agent','reconcile',true),
    ('agent','copy',true),('agent','import',true),('agent','report',true),
    ('agent','print',true),('agent','export',true),('agent','follow',true),
    ('agent','tag',true),('agent','add_comment',true),('agent','add_attachment',true),
    ('agent','delegate',true),('agent','share_read',true),
    -- manager
    ('manager','read',true),('manager','create',true),('manager','update',true),
    ('manager','delete_draft',true),('manager','submit',true),('manager','amend',true),
    ('manager','cancel',true),('manager','close',true),('manager','reopen',true),
    ('manager','withdraw',true),('manager','escalate',true),('manager','approve',true),
    ('manager','deny',true),('manager','post',true),('manager','reconcile',true),
    ('manager','reverse',true),('manager','copy',true),('manager','merge',true),
    ('manager','import',true),('manager','report',true),('manager','print',true),
    ('manager','export',true),('manager','follow',true),('manager','tag',true),
    ('manager','add_comment',true),('manager','add_attachment',true),
    ('manager','del_others_comment',true),('manager','del_others_attach',true),
    ('manager','delegate',true),('manager','share_read',true),('manager','share_edit',true),
    -- owner (all 36 except special)
    ('owner','read',true),('owner','create',true),('owner','update',true),
    ('owner','delete_draft',true),('owner','delete',true),('owner','submit',true),
    ('owner','amend',true),('owner','cancel',true),('owner','close',true),
    ('owner','reopen',true),('owner','withdraw',true),('owner','escalate',true),
    ('owner','approve',true),('owner','deny',true),('owner','post',true),
    ('owner','reverse',true),('owner','reconcile',true),('owner','copy',true),
    ('owner','merge',true),('owner','import',true),('owner','report',true),
    ('owner','print',true),('owner','export',true),('owner','bulk_import',true),
    ('owner','bulk_export',true),('owner','bulk_update',true),('owner','bulk_delete',true),
    ('owner','delegate',true),('owner','share_read',true),('owner','share_edit',true),
    ('owner','add_comment',true),('owner','add_attachment',true),
    ('owner','del_others_comment',true),('owner','del_others_attach',true),
    ('owner','follow',true),('owner','tag',true),
    -- admin (BLOCKED from workflow and finance ops)
    ('admin','read',true),('admin','create',true),('admin','update',true),
    ('admin','delete_draft',true),('admin','delete',true),('admin','copy',true),
    ('admin','merge',true),('admin','import',true),('admin','report',true),
    ('admin','print',true),('admin','export',true),('admin','bulk_import',true),
    ('admin','bulk_export',true),('admin','bulk_update',true),('admin','bulk_delete',true),
    ('admin','delegate',true),('admin','share_read',true),('admin','share_edit',true),
    ('admin','add_comment',true),('admin','add_attachment',true),
    ('admin','del_others_comment',true),('admin','del_others_attach',true),
    ('admin','follow',true),('admin','tag',true)
  ) AS v(pc, pmc, is_granted) ON p.code = v.pc AND pm.code = v.pmc
)
INSERT INTO shared.persona_permission (persona_id, permission_id, is_granted, created_by)
SELECT pid, permid, is_granted, '00000000-0000-0000-0000-000000000000'::uuid
FROM persona_grants
ON CONFLICT (persona_id, permission_id) DO UPDATE
  SET is_granted = EXCLUDED.is_granted;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/010_system/001_shared/018_role.sql
-- 900_seed_data/010_system/001_shared/018_role.sql
-- Seed: shared.role — one role per (persona × module)
-- Schema: shared | Table: role
-- Scope lives on master.auth_group_role; roles are platform-level, not per-tenant.
-- code pattern: {PERSONA_CODE}-{MODULE_CODE}  e.g. 'manager-ACC'
-- Idempotent: ON CONFLICT (code) DO UPDATE

INSERT INTO shared.role (code, name, persona_id, module_id, created_by)
SELECT
  lower(ps.code) || '-' || m.code,
  ps.name || ' / ' || m.name,
  ps.id,
  m.id,
  '00000000-0000-0000-0000-000000000000'
FROM shared.persona ps
CROSS JOIN shared.module m
ON CONFLICT (code) DO UPDATE SET
  name       = excluded.name,
  persona_id = excluded.persona_id,
  module_id  = excluded.module_id,
  updated_at = now(),
  updated_by = excluded.created_by;

DO $$ DECLARE cnt int; BEGIN
  SELECT count(*) INTO cnt FROM shared.role;
  RAISE NOTICE 'shared.role: % rows (% persona × % module)',
    cnt,
    (SELECT count(*) FROM shared.persona),
    (SELECT count(*) FROM shared.module);
END $$;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/010_system/001_shared/019_permission_return.sql
-- 900_seed_data/001_shared/019_permission_return.sql
-- Purpose: shared.permission "return" + persona_permission grants (manager, owner, agent)
-- Idempotent: yes — ON CONFLICT throughout

-- ── 1. shared.permission — return ────────────────────────────────────────
INSERT INTO shared.permission
    (code, name, category_id, scope_type, risk_level, sort_order, created_by)
SELECT 'return', 'Return Document for Revision',
       id, 'record', 'low', 100, '00000000-0000-0000-0000-000000000000'
FROM   shared.permission_category
WHERE  code = 'workflow'
ON CONFLICT (code) DO NOTHING;

-- ── 2. shared.persona_permission — return grants ─────────────────────────
WITH grants AS (
    SELECT p.id AS pid, pm.id AS permid
    FROM   shared.persona p
    CROSS JOIN shared.permission pm
    WHERE  p.code IN ('manager','owner','agent')
    AND    pm.code = 'return'
)
INSERT INTO shared.persona_permission (persona_id, permission_id, is_granted, created_by)
SELECT pid, permid, true, '00000000-0000-0000-0000-000000000000'
FROM   grants
ON CONFLICT (persona_id, permission_id) DO UPDATE SET is_granted = true;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/010_system/002_control/001_entity_class_profile.sql
-- 002_control/001_entity_class_profile.sql
-- Seed: Platform-global entity class governance profiles
-- Schema: control | Table: entity_class_profile
-- These are immutable platform constants, seeded at install time.
-- Idempotent: ON CONFLICT (class_key) DO NOTHING

INSERT INTO control.entity_class_profile (
    class_key, label, description,
    valid_governance_levels, default_governance_level,
    valid_mutability, default_mutability, default_security_tier,
    expected_system_columns,
    field_flag_rules, security_tiers, compliance_profile
)
VALUES
    ('REFERENCE', 'Reference', 'Shared reference data: currencies, countries, UoM, codes.',
     ARRAY['full','standard'], 'standard',
     ARRAY['locked','controlled'], 'locked', 'config',
     ARRAY['id','tenant_id','created_at','created_by','status'],
     '[]'::jsonb,
     '{"platform_critical":{"min_governance":"full","is_created_by_required":true,"is_updated_by_required":true,"is_change_reason_required":false,"is_change_approval_required":false,"is_audit_on_read":false},"tenant_critical":{"min_governance":"full","is_created_by_required":true,"is_updated_by_required":true,"is_change_reason_required":false,"is_change_approval_required":false,"is_audit_on_read":false},"operational":{"min_governance":"standard","is_created_by_required":true,"is_updated_by_required":false,"is_change_reason_required":false,"is_change_approval_required":false,"is_audit_on_read":false},"config":{"min_governance":"standard","is_created_by_required":true,"is_updated_by_required":false,"is_change_reason_required":false,"is_change_approval_required":false,"is_audit_on_read":false}}'::jsonb,
     '{"linting_rules":[],"required_field_patterns":[],"audit_rules":{"default_disposition":"disabled","by_category":{}}}'::jsonb),

    ('MASTER', 'Master', 'Master data: organizations, tenants, users, core business entities.',
     ARRAY['full','standard','lite'], 'standard',
     ARRAY['locked','controlled','extensible'], 'controlled', 'operational',
     ARRAY['id','tenant_id','created_at','created_by','updated_at','updated_by','status'],
     '[]'::jsonb,
     '{"platform_critical":{"min_governance":"full","is_created_by_required":true,"is_updated_by_required":true,"is_change_reason_required":true,"is_change_approval_required":true,"is_audit_on_read":false},"tenant_critical":{"min_governance":"full","is_created_by_required":true,"is_updated_by_required":true,"is_change_reason_required":false,"is_change_approval_required":false,"is_audit_on_read":false},"operational":{"min_governance":"standard","is_created_by_required":true,"is_updated_by_required":true,"is_change_reason_required":false,"is_change_approval_required":false,"is_audit_on_read":false},"config":{"min_governance":"lite","is_created_by_required":true,"is_updated_by_required":false,"is_change_reason_required":false,"is_change_approval_required":false,"is_audit_on_read":false}}'::jsonb,
     '{"linting_rules":[],"required_field_patterns":[],"audit_rules":{"default_disposition":"sampled","by_category":{}}}'::jsonb),

    ('CONTROL', 'Control', 'Access control, permissions, metadata/lookup registry, policy rules.',
     ARRAY['full','standard'], 'full',
     ARRAY['locked','controlled'], 'controlled', 'config',
     ARRAY['id','tenant_id','created_at','created_by','status'],
     '[]'::jsonb,
     '{"platform_critical":{"min_governance":"full","is_created_by_required":true,"is_updated_by_required":true,"is_change_reason_required":true,"is_change_approval_required":true,"is_audit_on_read":true},"tenant_critical":{"min_governance":"full","is_created_by_required":true,"is_updated_by_required":true,"is_change_reason_required":false,"is_change_approval_required":false,"is_audit_on_read":false},"operational":{"min_governance":"standard","is_created_by_required":true,"is_updated_by_required":true,"is_change_reason_required":false,"is_change_approval_required":false,"is_audit_on_read":false},"config":{"min_governance":"standard","is_created_by_required":true,"is_updated_by_required":false,"is_change_reason_required":false,"is_change_approval_required":false,"is_audit_on_read":false}}'::jsonb,
     '{"linting_rules":[],"required_field_patterns":[],"audit_rules":{"default_disposition":"required","by_category":{}}}'::jsonb),

    ('DOCUMENT', 'Document', 'Transactional documents: invoices, credit notes, payments, journal entries.',
     ARRAY['full','standard'], 'full',
     ARRAY['locked','controlled'], 'controlled', 'operational',
     ARRAY['id','tenant_id','created_at','created_by','updated_at','updated_by','status'],
     '[]'::jsonb,
     '{"platform_critical":{"min_governance":"full","is_created_by_required":true,"is_updated_by_required":true,"is_change_reason_required":true,"is_change_approval_required":true,"is_audit_on_read":false},"tenant_critical":{"min_governance":"full","is_created_by_required":true,"is_updated_by_required":true,"is_change_reason_required":false,"is_change_approval_required":false,"is_audit_on_read":false},"operational":{"min_governance":"standard","is_created_by_required":true,"is_updated_by_required":true,"is_change_reason_required":false,"is_change_approval_required":false,"is_audit_on_read":false},"config":{"min_governance":"standard","is_created_by_required":true,"is_updated_by_required":false,"is_change_reason_required":false,"is_change_approval_required":false,"is_audit_on_read":false}}'::jsonb,
     '{"linting_rules":[],"required_field_patterns":[],"audit_rules":{"default_disposition":"sampled","by_category":{}}}'::jsonb),

    ('DOCUMENT_RELATION', 'Document Relation', 'Junction and line tables relating transactional documents.',
     ARRAY['full','standard'], 'standard',
     ARRAY['locked','controlled'], 'controlled', 'operational',
     ARRAY['id','tenant_id','created_at','created_by'],
     '[]'::jsonb,
     '{"platform_critical":{"min_governance":"full","is_created_by_required":true,"is_updated_by_required":true,"is_change_reason_required":false,"is_change_approval_required":false,"is_audit_on_read":false},"tenant_critical":{"min_governance":"full","is_created_by_required":true,"is_updated_by_required":false,"is_change_reason_required":false,"is_change_approval_required":false,"is_audit_on_read":false},"operational":{"min_governance":"standard","is_created_by_required":true,"is_updated_by_required":false,"is_change_reason_required":false,"is_change_approval_required":false,"is_audit_on_read":false},"config":{"min_governance":"lite","is_created_by_required":true,"is_updated_by_required":false,"is_change_reason_required":false,"is_change_approval_required":false,"is_audit_on_read":false}}'::jsonb,
     '{"linting_rules":[],"required_field_patterns":[],"audit_rules":{"default_disposition":"disabled","by_category":{}}}'::jsonb),

    ('LEDGER', 'Ledger', 'General ledger: chart of accounts, fiscal periods, and financial postings.',
     ARRAY['full'], 'full',
     ARRAY['locked'], 'locked', 'tenant_critical',
     ARRAY['id','tenant_id','created_at','created_by','updated_at','updated_by','status'],
     '[]'::jsonb,
     '{"platform_critical":{"min_governance":"full","is_created_by_required":true,"is_updated_by_required":true,"is_change_reason_required":true,"is_change_approval_required":true,"is_audit_on_read":true},"tenant_critical":{"min_governance":"full","is_created_by_required":true,"is_updated_by_required":true,"is_change_reason_required":true,"is_change_approval_required":false,"is_audit_on_read":false},"operational":{"min_governance":"full","is_created_by_required":true,"is_updated_by_required":true,"is_change_reason_required":false,"is_change_approval_required":false,"is_audit_on_read":false},"config":{"min_governance":"full","is_created_by_required":true,"is_updated_by_required":true,"is_change_reason_required":false,"is_change_approval_required":false,"is_audit_on_read":false}}'::jsonb,
     '{"linting_rules":[],"required_field_patterns":[],"audit_rules":{"default_disposition":"required","by_category":{}}}'::jsonb),

    ('LOG', 'Log', 'Audit trails, change logs, and activity history.',
     ARRAY['full','standard','lite'], 'lite',
     ARRAY['locked'], 'locked', 'operational',
     ARRAY['id','tenant_id','created_at','created_by'],
     '[]'::jsonb,
     '{"platform_critical":{"min_governance":"full","is_created_by_required":true,"is_updated_by_required":false,"is_change_reason_required":false,"is_change_approval_required":false,"is_audit_on_read":false},"tenant_critical":{"min_governance":"standard","is_created_by_required":true,"is_updated_by_required":false,"is_change_reason_required":false,"is_change_approval_required":false,"is_audit_on_read":false},"operational":{"min_governance":"lite","is_created_by_required":true,"is_updated_by_required":false,"is_change_reason_required":false,"is_change_approval_required":false,"is_audit_on_read":false},"config":{"min_governance":"lite","is_created_by_required":false,"is_updated_by_required":false,"is_change_reason_required":false,"is_change_approval_required":false,"is_audit_on_read":false}}'::jsonb,
     '{"linting_rules":[],"required_field_patterns":[],"audit_rules":{"default_disposition":"disabled","by_category":{}}}'::jsonb),

    ('AGGREGATE', 'Aggregate', 'Pre-computed aggregates, balances, KPIs, and materialized summaries.',
     ARRAY['full','standard','lite'], 'lite',
     ARRAY['locked'], 'locked', 'operational',
     ARRAY['id','tenant_id','created_at','created_by'],
     '[]'::jsonb,
     '{"platform_critical":{"min_governance":"full","is_created_by_required":true,"is_updated_by_required":false,"is_change_reason_required":false,"is_change_approval_required":false,"is_audit_on_read":false},"tenant_critical":{"min_governance":"standard","is_created_by_required":true,"is_updated_by_required":false,"is_change_reason_required":false,"is_change_approval_required":false,"is_audit_on_read":false},"operational":{"min_governance":"lite","is_created_by_required":false,"is_updated_by_required":false,"is_change_reason_required":false,"is_change_approval_required":false,"is_audit_on_read":false},"config":{"min_governance":"lite","is_created_by_required":false,"is_updated_by_required":false,"is_change_reason_required":false,"is_change_approval_required":false,"is_audit_on_read":false}}'::jsonb,
     '{"linting_rules":[],"required_field_patterns":[],"audit_rules":{"default_disposition":"disabled","by_category":{}}}'::jsonb),

    ('DIMENSION', 'Dimension', 'Configurable analytical dimensions: cost centres, profit centres, projects.',
     ARRAY['full','standard'], 'standard',
     ARRAY['locked','controlled','extensible'], 'controlled', 'config',
     ARRAY['id','tenant_id','created_at','created_by','updated_at','updated_by','status'],
     '[]'::jsonb,
     '{"platform_critical":{"min_governance":"full","is_created_by_required":true,"is_updated_by_required":true,"is_change_reason_required":false,"is_change_approval_required":false,"is_audit_on_read":false},"tenant_critical":{"min_governance":"standard","is_created_by_required":true,"is_updated_by_required":true,"is_change_reason_required":false,"is_change_approval_required":false,"is_audit_on_read":false},"operational":{"min_governance":"standard","is_created_by_required":true,"is_updated_by_required":false,"is_change_reason_required":false,"is_change_approval_required":false,"is_audit_on_read":false},"config":{"min_governance":"lite","is_created_by_required":true,"is_updated_by_required":false,"is_change_reason_required":false,"is_change_approval_required":false,"is_audit_on_read":false}}'::jsonb,
     '{"linting_rules":[],"required_field_patterns":[],"audit_rules":{"default_disposition":"disabled","by_category":{}}}'::jsonb),

    ('RELATION', 'Relation', 'Junction tables and many-to-many relationships between master/control entities.',
     ARRAY['full','standard','lite'], 'lite',
     ARRAY['locked','controlled'], 'controlled', 'config',
     ARRAY['id','tenant_id','created_at','created_by'],
     '[]'::jsonb,
     '{"platform_critical":{"min_governance":"full","is_created_by_required":true,"is_updated_by_required":false,"is_change_reason_required":false,"is_change_approval_required":false,"is_audit_on_read":false},"tenant_critical":{"min_governance":"standard","is_created_by_required":true,"is_updated_by_required":false,"is_change_reason_required":false,"is_change_approval_required":false,"is_audit_on_read":false},"operational":{"min_governance":"lite","is_created_by_required":true,"is_updated_by_required":false,"is_change_reason_required":false,"is_change_approval_required":false,"is_audit_on_read":false},"config":{"min_governance":"lite","is_created_by_required":false,"is_updated_by_required":false,"is_change_reason_required":false,"is_change_approval_required":false,"is_audit_on_read":false}}'::jsonb,
     '{"linting_rules":[],"required_field_patterns":[],"audit_rules":{"default_disposition":"disabled","by_category":{}}}'::jsonb),

    ('*', 'Wildcard', 'Default field flag rules applied to all entity classes (lowest priority).',
     ARRAY['full','standard','lite'], 'standard',
     ARRAY['locked','controlled','extensible'], 'controlled', 'config',
     ARRAY['id','tenant_id','created_at','created_by'],
     '[]'::jsonb,
     '{"platform_critical":{"min_governance":"full","is_created_by_required":true,"is_updated_by_required":true,"is_change_reason_required":false,"is_change_approval_required":false,"is_audit_on_read":false},"tenant_critical":{"min_governance":"full","is_created_by_required":true,"is_updated_by_required":true,"is_change_reason_required":false,"is_change_approval_required":false,"is_audit_on_read":false},"operational":{"min_governance":"standard","is_created_by_required":true,"is_updated_by_required":false,"is_change_reason_required":false,"is_change_approval_required":false,"is_audit_on_read":false},"config":{"min_governance":"lite","is_created_by_required":false,"is_updated_by_required":false,"is_change_reason_required":false,"is_change_approval_required":false,"is_audit_on_read":false}}'::jsonb,
     '{"linting_rules":[],"required_field_patterns":[],"audit_rules":{"default_disposition":"disabled","by_category":{}}}'::jsonb)

ON CONFLICT (class_key) DO NOTHING;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/010_system/002_control/002_hook_actions.sql
-- =============================================================================
-- 900_seed_data/014_lifecycle/001_hook_actions.sql
-- Platform system hook actions for the lifecycle engine
-- Depends on: 04_tables/014_lifecycle.sql (control.hook_action_registry)
-- =============================================================================
-- These are platform-global actions (tenant_id=NULL, origin='system').
-- Tenants can register additional custom actions (origin='tenant').
-- lifecycle_transition_hook.action references action_key here.

INSERT INTO control.hook_action_registry (
    tenant_id, action_key, label, description,
    handler_type, handler_config,
    default_contract_role, default_safety_level,
    origin, is_active,
    created_by
) VALUES
-- ─── Core platform actions ───────────────────────────────────────────────────
(NULL, 'send_notification',
    'Send Notification',
    'Dispatch notification via routing rules (event.notification_message).',
    'emit_event', '{"event_type": "notification.requested"}'::jsonb,
    'extension', 'replaceable',
    'system', true,
    '00000000-0000-0000-0000-000000000000'::uuid),

(NULL, 'emit_event',
    'Emit Domain Event',
    'Emit a domain event to event.outbox for async processing by consumers.',
    'emit_event', '{}'::jsonb,
    'extension', 'replaceable',
    'system', true,
    '00000000-0000-0000-0000-000000000000'::uuid),

(NULL, 'create_approval_request',
    'Create Approval Request',
    'Initiate an approval workflow (governance.approval_instance). '
    'Typically used as a BEFORE hook to gate transitions on approval.',
    'built_in', '{}'::jsonb,
    'contract', 'required',
    'system', true,
    '00000000-0000-0000-0000-000000000000'::uuid),

(NULL, 'schedule_timer',
    'Schedule Timer',
    'Create a delayed timer entry in event.lifecycle_timer_schedule. '
    'Used for auto-transition, auto-cancel, reminders, and escalations.',
    'built_in', '{}'::jsonb,
    'extension', 'replaceable',
    'system', true,
    '00000000-0000-0000-0000-000000000000'::uuid),

(NULL, 'cancel_timer',
    'Cancel Timer',
    'Cancel all pending timers for the entity in the departed state. '
    'Automatically used on state exit.',
    'built_in', '{}'::jsonb,
    'extension', 'replaceable',
    'system', true,
    '00000000-0000-0000-0000-000000000000'::uuid),

(NULL, 'update_entity_field',
    'Update Entity Field',
    'Set a field value on the entity record. Config: {field, value}. '
    'Used for automatic field updates on state entry (e.g. locked_at, approved_by).',
    'built_in', '{}'::jsonb,
    'extension', 'narrowable',
    'system', true,
    '00000000-0000-0000-0000-000000000000'::uuid),

(NULL, 'execute_webhook',
    'Execute Webhook',
    'Make an HTTP POST call to an external endpoint. '
    'handler_config.url is the target. Payload includes entity + transition context.',
    'webhook', '{}'::jsonb,
    'extension', 'replaceable',
    'system', true,
    '00000000-0000-0000-0000-000000000000'::uuid),

-- ─── Version lifecycle actions ───────────────────────────────────────────────
(NULL, 'freeze_version',
    'Freeze Version',
    'Lock the entity version for editing. Sets version status to frozen.',
    'built_in', '{}'::jsonb,
    'contract', 'required',
    'system', true,
    '00000000-0000-0000-0000-000000000000'::uuid),

(NULL, 'mark_version_approved',
    'Mark Version Approved',
    'Set version status to approved after approval workflow completes.',
    'built_in', '{}'::jsonb,
    'contract', 'required',
    'system', true,
    '00000000-0000-0000-0000-000000000000'::uuid),

(NULL, 'promote_to_effective',
    'Promote to Effective',
    'Make the version the currently effective version. '
    'Archives the previous effective version automatically.',
    'built_in', '{}'::jsonb,
    'contract', 'required',
    'system', true,
    '00000000-0000-0000-0000-000000000000'::uuid),

(NULL, 'archive_previous_effective',
    'Archive Previous Effective',
    'Archive the previously effective version when a new version is promoted.',
    'built_in', '{}'::jsonb,
    'extension', 'narrowable',
    'system', true,
    '00000000-0000-0000-0000-000000000000'::uuid),

(NULL, 'spawn_next_draft',
    'Spawn Next Draft',
    'Create a new draft version from the current effective version.',
    'built_in', '{}'::jsonb,
    'extension', 'narrowable',
    'system', true,
    '00000000-0000-0000-0000-000000000000'::uuid),

(NULL, 'update_version_status',
    'Update Version Status',
    'Set version status to a specific value. Config: {target_status}.',
    'built_in', '{}'::jsonb,
    'extension', 'narrowable',
    'system', true,
    '00000000-0000-0000-0000-000000000000'::uuid),

-- ─── Finance document actions ────────────────────────────────────────────────
(NULL, 'lock_document',
    'Lock Document',
    'Lock a financial document for editing. Emits document.locked event.',
    'emit_event', '{"event_type": "document.locked"}'::jsonb,
    'contract', 'required',
    'system', true,
    '00000000-0000-0000-0000-000000000000'::uuid),

(NULL, 'unlock_document',
    'Unlock Document',
    'Unlock a financial document. Emits document.unlocked event.',
    'emit_event', '{"event_type": "document.unlocked"}'::jsonb,
    'extension', 'narrowable',
    'system', true,
    '00000000-0000-0000-0000-000000000000'::uuid),

(NULL, 'sync_document_registry',
    'Sync Document Registry',
    'Update the financial document registry entry for the entity. '
    'Emits document.registry_sync_requested event.',
    'emit_event', '{"event_type": "document.registry_sync_requested"}'::jsonb,
    'extension', 'replaceable',
    'system', true,
    '00000000-0000-0000-0000-000000000000'::uuid),

(NULL, 'create_journal_entry',
    'Create Journal Entry',
    'Trigger journal entry creation for a posted financial document. '
    'Emits document.journal_entry_requested event.',
    'emit_event', '{"event_type": "document.journal_entry_requested"}'::jsonb,
    'contract', 'required',
    'system', true,
    '00000000-0000-0000-0000-000000000000'::uuid),

(NULL, 'create_reversal_entry',
    'Create Reversal Entry',
    'Trigger reversal journal entry for a reversed financial document. '
    'Emits document.reversal_entry_requested event.',
    'emit_event', '{"event_type": "document.reversal_entry_requested"}'::jsonb,
    'contract', 'required',
    'system', true,
    '00000000-0000-0000-0000-000000000000'::uuid),

(NULL, 'schedule_activation',
    'Schedule Activation',
    'Schedule future activation of an entity via the timer system. '
    'Used for deferred publishing, planned go-live dates.',
    'built_in', '{}'::jsonb,
    'extension', 'replaceable',
    'system', true,
    '00000000-0000-0000-0000-000000000000'::uuid)

ON CONFLICT ON CONSTRAINT har_key_uq DO NOTHING;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/010_system/002_control/007_upupr_entity_registration.sql
-- 900_seed_data/002_control/007_upupr_entity_registration.sql
-- Purpose: control.entity + control.entity_version + control.entity_field (2 rows)
-- Depends on: 006_upupr_lookups.sql
-- Idempotent: yes — WHERE NOT EXISTS / ON CONFLICT DO NOTHING

-- ── 1. control.entity ───────────────────────────────────────────────────
INSERT INTO control.entity (
    module_id, name, entity_short,
    entity_class, ownership_model, kind, backing_type,
    governance_level, security_tier, mutability,
    table_schema, table_name,
    label_singular, label_plural, icon_key, color_token,
    numbering_active, naming_policy, feature_flags,
    status, created_by)
SELECT
    (SELECT id FROM shared.module WHERE code = 'IAM'),
    'user_profile_update_request', 'UPUPR',
    'DOCUMENT', 'system', 'ent', 'table',
    'full', 'tenant_critical', 'controlled',
    'document', 'user_profile_update_request',
    'Profile Update Request', 'Profile Update Requests', 'user-pen', 'blue',
    true,
    '{"prefix":"UPUPR","prefix_configurable":true,"separator":"-","segments":[{"type":"year","format":"YYYY"},{"type":"sequence","padding":5}]}'::jsonb,
    '{"is_approvable":true,"document_category":"hr_request","allow_on_behalf_of":false,"requires_supervisor_approval":true}'::jsonb,
    'ACTIVE', '00000000-0000-0000-0000-000000000000'
WHERE NOT EXISTS (
    SELECT 1 FROM control.entity
    WHERE table_schema = 'document' AND table_name = 'user_profile_update_request'
      AND tenant_id IS NULL
);

-- ── 2. control.entity_version ───────────────────────────────────────────
INSERT INTO control.entity_version (
    entity_id, tenant_id, version_no, status, effective_from, created_by)
SELECT e.id, NULL, 1, 'EFFECTIVE', now(),
       '00000000-0000-0000-0000-000000000000'
FROM   control.entity e
WHERE  e.table_schema = 'document' AND e.table_name = 'user_profile_update_request'
  AND  e.tenant_id IS NULL
ON CONFLICT (entity_id, version_no) DO NOTHING;

-- ── 3. control.entity_field — request_scope ─────────────────────────────
INSERT INTO control.entity_field (
    entity_version_id, name, column_name, label, data_type,
    cardinality, origin, enum_domain_code, is_required, is_filterable,
    validation, sort_order, created_by)
SELECT ev.id,
    'request_scope', 'request_scope', 'Change Categories', 'enum',
    'many', 'system', 'document.upupr_request_scope', true, true,
    '{"min_items":1,"trigger":"on_submit"}'::jsonb,
    9, '00000000-0000-0000-0000-000000000000'
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
WHERE e.table_schema = 'document' AND e.table_name = 'user_profile_update_request'
  AND e.tenant_id IS NULL
  AND ev.version_no = 1
ON CONFLICT DO NOTHING;

-- ── 4. control.entity_field — change_reason ─────────────────────────────
INSERT INTO control.entity_field (
    entity_version_id, name, column_name, label, data_type,
    cardinality, origin, is_required,
    validation, sort_order, created_by)
SELECT ev.id,
    'change_reason', 'change_reason', 'Reason for Change', 'text',
    'zero_or_one', 'system', false,
    '{"required_when":{"field":"request_scope","operator":"contains_any","values":["iam_group","ou_assignment"]},"trigger":"on_submit"}'::jsonb,
    10, '00000000-0000-0000-0000-000000000000'
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
WHERE e.table_schema = 'document' AND e.table_name = 'user_profile_update_request'
  AND e.tenant_id IS NULL
  AND ev.version_no = 1
ON CONFLICT DO NOTHING;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/010_system/002_control/008_upupr_lifecycle.sql
-- 900_seed_data/002_control/008_upupr_lifecycle.sql
-- Purpose: control.lifecycle + 8 states + 10 transitions + entity_lifecycle binding
-- Depends on: 007_upupr_entity_registration.sql
-- Idempotent: yes — ON CONFLICT DO NOTHING throughout

DO $$ DECLARE
    v_lc_id  uuid;
    v_s      jsonb;  -- state id map
BEGIN

-- 1. control.lifecycle
INSERT INTO control.lifecycle (tenant_id, code, name, version_no, is_active, config, created_by)
VALUES (NULL, 'upupr', 'User Profile Update Request', 1, true,
    '{"initial_state_code":"draft","allow_parallel_instances":false,"icon_key":"user-pen","ui_color":"#0F6CBD","entity_types":["user_profile_update_request"]}'::jsonb,
    '00000000-0000-0000-0000-000000000000')
ON CONFLICT (tenant_id, code) DO NOTHING;

SELECT id INTO v_lc_id FROM control.lifecycle WHERE code = 'upupr';

-- 2. control.lifecycle_state (8 states)
INSERT INTO control.lifecycle_state
    (lifecycle_id, tenant_id, code, name, is_initial, is_terminal, sort_order, config, created_by)
VALUES
    (v_lc_id, NULL, 'draft',              'Draft',                        true,  false, 10, '{"ui_color":"#888888","icon_key":"pencil"}'::jsonb,                                                             '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'submitted',           'Submitted',                   false, false, 20, '{"ui_color":"#0F6CBD","icon_key":"send"}'::jsonb,                                                              '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'awaiting_approval',   'Awaiting Supervisor Approval', false, false, 30, '{"ui_color":"#7B61FF","icon_key":"clock","sla_minutes":2880,"timer_policy_code":"upupr_approval_sla"}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'revision_requested',  'Revision Requested',          false, false, 40, '{"ui_color":"#E8A020","icon_key":"refresh"}'::jsonb,                                                           '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'approved',            'Approved',                    false, false, 50, '{"ui_color":"#217346","icon_key":"check-circle"}'::jsonb,                                                      '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'provisioned',         'Provisioned',                 false, true,  60, '{"ui_color":"#217346","icon_key":"check-double"}'::jsonb,                                                      '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'rejected',            'Rejected',                    false, true,  70, '{"ui_color":"#C00000","icon_key":"x-circle"}'::jsonb,                                                          '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'cancelled',           'Cancelled',                   false, true,  80, '{"ui_color":"#666666","icon_key":"ban"}'::jsonb,                                                               '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, code) DO NOTHING;

-- Build state id map
SELECT jsonb_object_agg(code, id) INTO v_s
FROM control.lifecycle_state WHERE lifecycle_id = v_lc_id;

-- 3. control.lifecycle_transition (10 edges)
INSERT INTO control.lifecycle_transition
    (lifecycle_id, tenant_id, from_state_id, to_state_id, operation_code, is_active, config, created_by)
VALUES
    (v_lc_id, NULL, (v_s->>'draft')::uuid,              (v_s->>'submitted')::uuid,          'submit',    true, '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'submitted')::uuid,          (v_s->>'awaiting_approval')::uuid,  'assign',    true, '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'submitted')::uuid,          (v_s->>'cancelled')::uuid,          'cancel',    true, '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'awaiting_approval')::uuid,  (v_s->>'approved')::uuid,           'approve',   true, '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'awaiting_approval')::uuid,  (v_s->>'rejected')::uuid,           'deny',      true, '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'awaiting_approval')::uuid,  (v_s->>'revision_requested')::uuid, 'return',    true, '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'awaiting_approval')::uuid,  (v_s->>'cancelled')::uuid,          'cancel',    true, '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'revision_requested')::uuid, (v_s->>'submitted')::uuid,          'submit',    true, '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'revision_requested')::uuid, (v_s->>'cancelled')::uuid,          'cancel',    true, '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'approved')::uuid,           (v_s->>'provisioned')::uuid,        'provision', true, '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, from_state_id, to_state_id) DO NOTHING;

-- 4. control.entity_lifecycle binding
INSERT INTO control.entity_lifecycle
    (entity_name, lifecycle_id, tenant_id, conditions, priority, created_by)
VALUES
    ('user_profile_update_request', v_lc_id, NULL, NULL, 100,
     '00000000-0000-0000-0000-000000000000')
ON CONFLICT (tenant_id, entity_name, lifecycle_id) DO NOTHING;

END $$;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/010_system/002_control/009_upupr_workflow.sql
-- 900_seed_data/002_control/009_upupr_workflow.sql
-- Purpose: control.workflow_template + stage + rule + workflow_definition
-- Depends on: 007_upupr_entity_registration.sql
-- Idempotent: yes — ON CONFLICT DO NOTHING throughout

DO $$ DECLARE
    v_tpl_id uuid;
    v_ent_id uuid;
BEGIN
    SELECT id INTO v_ent_id FROM control.entity
    WHERE table_schema = 'document' AND table_name = 'user_profile_update_request'
      AND tenant_id IS NULL;

-- 1. control.workflow_template
INSERT INTO control.workflow_template
    (tenant_id, code, name, description,
     version_no, is_active, behaviors, created_by)
VALUES
    (NULL, 'upupr_single_stage_supervisor',
     'UPUPR — Single Stage Supervisor Approval',
     'Single-stage approval routed to the requestor supervisors supervisor.',
     1, true,
     '{"allow_self_approval":false,"require_all_stages":true,"allow_reassignment":true,"capture_entity_snapshot":true,"require_reason_on_reject":true,"notify_requester":true}'::jsonb,
     '00000000-0000-0000-0000-000000000000')
ON CONFLICT (tenant_id, code) DO NOTHING;

SELECT id INTO v_tpl_id FROM control.workflow_template
WHERE code = 'upupr_single_stage_supervisor' AND tenant_id IS NULL;

-- 2. control.workflow_template_stage
INSERT INTO control.workflow_template_stage
    (workflow_template_id, stage_no, name, mode, quorum, created_by)
VALUES
    (v_tpl_id, 1, 'Supervisor Approval', 'serial',
     '{"strategy":"unanimous"}'::jsonb,
     '00000000-0000-0000-0000-000000000000')
ON CONFLICT (workflow_template_id, stage_no) DO NOTHING;

-- 3. control.workflow_template_rule — dynamic assignee from principal_profile.supervisor_id
INSERT INTO control.workflow_template_rule
    (workflow_template_id, stage_no, priority, conditions, assign_to, created_by)
VALUES
    (v_tpl_id, 1, 10, NULL,
     '{"type":"requester_manager","resolve_from":"principal_profile.supervisor_id"}'::jsonb,
     '00000000-0000-0000-0000-000000000000')
ON CONFLICT (workflow_template_id, stage_no, priority) DO NOTHING;

-- 4. control.workflow_definition
INSERT INTO control.workflow_definition
    (tenant_id, code, name, entity_type, rules,
     effective_from, is_active, created_by)
VALUES
    ('00000000-0000-0000-0000-000000000000'::uuid, 'upupr_supervisor_approval',
     'UPUPR — Supervisor Approval',
     'user_profile_update_request',
     '[{"condition":null,"template_code":"upupr_single_stage_supervisor","workflow_type":"approval","priority":10}]'::jsonb,
     now(), true,
     '00000000-0000-0000-0000-000000000000')
ON CONFLICT (tenant_id, code) DO NOTHING;

END $$;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/010_system/002_control/010_transaction_flow_template.sql
-- ============================================================================
-- 900_seed_data/002_control/010_transaction_flow_template.sql
-- Engine 4.13: Platform-global transaction flow template seed
-- Depends on: 04_tables/002_control.sql (control.transaction_flow_template)
-- 15 flow codes, 61 event rows. tenant_id IS NULL = platform-global.
-- Idempotent: ON CONFLICT DO NOTHING (unique: tft_flow_event_uq covers
--   COALESCE(tenant_id,'00000000...'), flow_code, event_code).
-- ============================================================================

DO $$
DECLARE
    v_sys uuid := '00000000-0000-0000-0000-000000000000';
BEGIN

INSERT INTO control.transaction_flow_template
    (tenant_id, flow_code, direction, event_code, event_name,
     event_seq, is_mandatory, creates_je, reverses_prior, commitment_action, created_by)
VALUES
    -- ── INBOUND: PO_BASED ─────────────────────────────────────────────────
    (NULL,'PO_BASED',        'INBOUND',   'ORDER_CREATION',    'PR created',                10, false, true,  NULL,                 'CREATE',          v_sys),
    (NULL,'PO_BASED',        'INBOUND',   'ORDER_APPROVAL',    'PO approved',               20, true,  true,  'ORDER_CREATION',     'CREATE',          v_sys),
    (NULL,'PO_BASED',        'INBOUND',   'FULFILLMENT',       'Goods received',            30, true,  true,  NULL,                 'RELEASE_PARTIAL', v_sys),
    (NULL,'PO_BASED',        'INBOUND',   'INVOICE_MATCHED',   'Invoice 3-way matched',     40, true,  true,  'FULFILLMENT',        'NONE',            v_sys),
    (NULL,'PO_BASED',        'INBOUND',   'SETTLEMENT',        'Payment',                   50, true,  true,  NULL,                 'NONE',            v_sys),

    -- ── INBOUND: NON_PO ───────────────────────────────────────────────────
    (NULL,'NON_PO',          'INBOUND',   'INVOICE_RECEIVED',  'Invoice received',          10, true,  false, NULL,                 'NONE',            v_sys),
    (NULL,'NON_PO',          'INBOUND',   'ORDER_APPROVAL',    'Invoice approved',          20, true,  true,  NULL,                 'NONE',            v_sys),
    (NULL,'NON_PO',          'INBOUND',   'SETTLEMENT',        'Payment',                   30, true,  true,  NULL,                 'NONE',            v_sys),

    -- ── INBOUND: PURCHASE_CONTRACT ────────────────────────────────────────
    (NULL,'PURCHASE_CONTRACT','INBOUND',  'CONTRACT_EXECUTION','Contract signed',           10, true,  true,  NULL,                 'CREATE',          v_sys),
    (NULL,'PURCHASE_CONTRACT','INBOUND',  'ADVANCE_PAID',      'Advance payment',           15, false, true,  NULL,                 'NONE',            v_sys),
    (NULL,'PURCHASE_CONTRACT','INBOUND',  'OBLIGATION_SATISFIED','Milestone completed',     20, false, true,  NULL,                 'RELEASE_PARTIAL', v_sys),
    (NULL,'PURCHASE_CONTRACT','INBOUND',  'INVOICE_RECEIVED',  'Invoice received',          30, true,  true,  'OBLIGATION_SATISFIED','NONE',           v_sys),
    (NULL,'PURCHASE_CONTRACT','INBOUND',  'ADVANCE_RECOVERED', 'Advance recovery',          32, false, true,  NULL,                 'NONE',            v_sys),
    (NULL,'PURCHASE_CONTRACT','INBOUND',  'PENALTY_APPLIED',   'Penalty assessed',          34, false, true,  NULL,                 'NONE',            v_sys),
    (NULL,'PURCHASE_CONTRACT','INBOUND',  'REBATE_EARNED',     'Rebate earned',             36, false, true,  NULL,                 'NONE',            v_sys),
    (NULL,'PURCHASE_CONTRACT','INBOUND',  'DISCOUNT_ACCEPTED', 'Dynamic discount captured', 38, false, true,  NULL,                 'NONE',            v_sys),
    (NULL,'PURCHASE_CONTRACT','INBOUND',  'SETTLEMENT',        'Payment',                   40, true,  true,  NULL,                 'NONE',            v_sys),
    (NULL,'PURCHASE_CONTRACT','INBOUND',  'RETENTION_RELEASED','Retention released',        50, false, true,  NULL,                 'NONE',            v_sys),

    -- ── INBOUND: PURCHASE_SUB ─────────────────────────────────────────────
    (NULL,'PURCHASE_SUB',    'INBOUND',   'CONTRACT_EXECUTION','Subscription activated',    10, true,  true,  NULL,                 'CREATE',          v_sys),
    (NULL,'PURCHASE_SUB',    'INBOUND',   'PERIOD_RECOGNITION','Period expense',            20, true,  true,  NULL,                 'RELEASE_PARTIAL', v_sys),
    (NULL,'PURCHASE_SUB',    'INBOUND',   'INVOICE_RECEIVED',  'Periodic invoice',          30, true,  true,  'PERIOD_RECOGNITION', 'NONE',            v_sys),
    (NULL,'PURCHASE_SUB',    'INBOUND',   'SETTLEMENT',        'Payment',                   40, true,  true,  NULL,                 'NONE',            v_sys),

    -- ── INBOUND: LEASE ────────────────────────────────────────────────────
    (NULL,'LEASE',           'INBOUND',   'LEASE_COMMENCEMENT','Lease commenced (IFRS 16)', 10, true,  true,  NULL,                 'CREATE',          v_sys),
    (NULL,'LEASE',           'INBOUND',   'PERIOD_RECOGNITION','Depreciation + interest',   20, true,  true,  NULL,                 'RELEASE_PARTIAL', v_sys),
    (NULL,'LEASE',           'INBOUND',   'LEASE_PAYMENT',     'Lease payment',             30, true,  true,  NULL,                 'NONE',            v_sys),

    -- ── INBOUND: DIRECT_PURCHASE ──────────────────────────────────────────
    (NULL,'DIRECT_PURCHASE', 'INBOUND',   'ORDER_APPROVAL',    'Expense approved',          10, true,  true,  NULL,                 'NONE',            v_sys),
    (NULL,'DIRECT_PURCHASE', 'INBOUND',   'SETTLEMENT',        'Reimbursement / payment',   20, true,  true,  NULL,                 'NONE',            v_sys),

    -- ── INBOUND: PRODUCTION_ORDER ─────────────────────────────────────────
    (NULL,'PRODUCTION_ORDER','INBOUND',   'ORDER_CREATION',    'Work order released',       10, true,  false, NULL,                 'NONE',            v_sys),
    (NULL,'PRODUCTION_ORDER','INBOUND',   'MATERIAL_ISSUED',   'Material issued to WIP',    20, true,  true,  NULL,                 'NONE',            v_sys),
    (NULL,'PRODUCTION_ORDER','INBOUND',   'OBLIGATION_SATISFIED','Finished goods received', 30, true,  true,  NULL,                 'NONE',            v_sys),

    -- ── INBOUND: PREPAID_TOPUP ────────────────────────────────────────────
    (NULL,'PREPAID_TOPUP',   'INBOUND',   'CONTRACT_EXECUTION','Prepaid card loaded',       10, true,  true,  NULL,                 'NONE',            v_sys),
    (NULL,'PREPAID_TOPUP',   'INBOUND',   'ORDER_APPROVAL',    'Authorisation captured',    20, true,  true,  NULL,                 'NONE',            v_sys),
    (NULL,'PREPAID_TOPUP',   'INBOUND',   'FULFILLMENT',       'Goods/service delivered',   30, true,  true,  NULL,                 'NONE',            v_sys),
    (NULL,'PREPAID_TOPUP',   'INBOUND',   'SETTLEMENT',        'Settlement (prepaid no-op)',40, false, false, NULL,                 'NONE',            v_sys),

    -- ── OUTBOUND: SALES_ORDER ─────────────────────────────────────────────
    (NULL,'SALES_ORDER',     'OUTBOUND',  'ORDER_CREATION',    'SO booked',                 10, false, true,  NULL,                 'NONE',            v_sys),
    (NULL,'SALES_ORDER',     'OUTBOUND',  'ORDER_APPROVAL',    'SO confirmed',              20, true,  true,  NULL,                 'NONE',            v_sys),
    (NULL,'SALES_ORDER',     'OUTBOUND',  'INVENTORY_RESERVED','Stock soft-reserved',       25, false, false, NULL,                 'NONE',            v_sys),
    (NULL,'SALES_ORDER',     'OUTBOUND',  'INVENTORY_ALLOCATED','Stock picked / allocated', 27, false, false, NULL,                 'NONE',            v_sys),
    (NULL,'SALES_ORDER',     'OUTBOUND',  'FULFILLMENT',       'Goods shipped',             30, true,  true,  NULL,                 'NONE',            v_sys),
    (NULL,'SALES_ORDER',     'OUTBOUND',  'INVOICE_CREATED',   'Sales invoice issued',      40, true,  true,  'FULFILLMENT',        'NONE',            v_sys),
    (NULL,'SALES_ORDER',     'OUTBOUND',  'SETTLEMENT',        'Cash receipt',              50, true,  true,  NULL,                 'NONE',            v_sys),

    -- ── OUTBOUND: DIRECT_SALE ─────────────────────────────────────────────
    (NULL,'DIRECT_SALE',     'OUTBOUND',  'INVOICE_CREATED',   'Invoice issued',            10, true,  true,  NULL,                 'NONE',            v_sys),
    (NULL,'DIRECT_SALE',     'OUTBOUND',  'SETTLEMENT',        'Cash receipt',              20, true,  true,  NULL,                 'NONE',            v_sys),

    -- ── OUTBOUND: REVENUE_CONTRACT ────────────────────────────────────────
    (NULL,'REVENUE_CONTRACT','OUTBOUND',  'CONTRACT_EXECUTION','Contract executed',         10, true,  true,  NULL,                 'NONE',            v_sys),
    (NULL,'REVENUE_CONTRACT','OUTBOUND',  'OBLIGATION_SATISFIED','Performance obligation satisfied',20,false,true,NULL,            'NONE',            v_sys),
    (NULL,'REVENUE_CONTRACT','OUTBOUND',  'INVOICE_CREATED',   'Revenue invoice issued',    30, true,  true,  'OBLIGATION_SATISFIED','NONE',          v_sys),
    (NULL,'REVENUE_CONTRACT','OUTBOUND',  'SETTLEMENT',        'Cash receipt',              40, true,  true,  NULL,                 'NONE',            v_sys),

    -- ── OUTBOUND: REVENUE_SUB ─────────────────────────────────────────────
    (NULL,'REVENUE_SUB',     'OUTBOUND',  'CONTRACT_EXECUTION','Subscription activated',    10, true,  true,  NULL,                 'NONE',            v_sys),
    (NULL,'REVENUE_SUB',     'OUTBOUND',  'PERIOD_RECOGNITION','Period revenue recognised', 20, true,  true,  NULL,                 'NONE',            v_sys),
    (NULL,'REVENUE_SUB',     'OUTBOUND',  'INVOICE_CREATED',   'Periodic invoice issued',   30, true,  true,  'PERIOD_RECOGNITION', 'NONE',            v_sys),
    (NULL,'REVENUE_SUB',     'OUTBOUND',  'SETTLEMENT',        'Cash receipt',              40, true,  true,  NULL,                 'NONE',            v_sys),

    -- ── OUTBOUND: PROJECT_REVENUE ─────────────────────────────────────────
    (NULL,'PROJECT_REVENUE', 'OUTBOUND',  'CONTRACT_EXECUTION','Project commenced',         10, true,  true,  NULL,                 'NONE',            v_sys),
    (NULL,'PROJECT_REVENUE', 'OUTBOUND',  'PERIOD_RECOGNITION','% completion recognition',  20, true,  true,  NULL,                 'NONE',            v_sys),
    (NULL,'PROJECT_REVENUE', 'OUTBOUND',  'OBLIGATION_SATISFIED','Milestone billed',        30, false, true,  'PERIOD_RECOGNITION', 'NONE',            v_sys),
    (NULL,'PROJECT_REVENUE', 'OUTBOUND',  'SETTLEMENT',        'Cash receipt',              40, true,  true,  NULL,                 'NONE',            v_sys),

    -- ── BILATERAL: IC_TRANSFER ────────────────────────────────────────────
    (NULL,'IC_TRANSFER',     'BILATERAL', 'CONTRACT_EXECUTION','IC agreement activated',    10, true,  true,  NULL,                 'NONE',            v_sys),
    (NULL,'IC_TRANSFER',     'BILATERAL', 'SETTLEMENT',        'IC settlement / netting',   20, true,  true,  NULL,                 'NONE',            v_sys),

    -- ── BILATERAL: WAREHOUSE_TRANSFER ─────────────────────────────────────
    (NULL,'WAREHOUSE_TRANSFER','BILATERAL','ORDER_CREATION',   'Transfer requested',        10, true,  false, NULL,                 'NONE',            v_sys),
    (NULL,'WAREHOUSE_TRANSFER','BILATERAL','TRANSFER_SHIPPED', 'Shipped from source WH',    20, true,  true,  NULL,                 'NONE',            v_sys),
    (NULL,'WAREHOUSE_TRANSFER','BILATERAL','TRANSFER_RECEIVED','Received at destination WH',30, true,  true,  'TRANSFER_SHIPPED',   'NONE',            v_sys)

ON CONFLICT DO NOTHING;

END $$;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/010_system/002_control/011_notification_routing_collab.sql
-- control/011_notification_routing_collab.sql
-- Notification routing rules for collaboration events.
-- Platform global (tenant_id = NULL) — apply to all tenants.
-- Idempotent: ON CONFLICT DO NOTHING on the (tenant_id, code) unique key.

-- ── Routing rule: comment.mention → in_app + email ────────────────────────────

INSERT INTO control.notification_routing_rule
    (code, name, description,
     event_type, entity_type, template_key,
     channels, priority, recipient_rules,
     dedup_window_ms, is_enabled, sort_order, created_by)
SELECT
    'collab.comment_mention',
    'Comment Mention',
    'Notify a principal when they are @-mentioned in a comment.',
    'comment.mention',
    NULL,                        -- applies to all entity types
    'comment_mention',
    ARRAY['in_app', 'email'],
    'normal',
    '{"explicit_ids": []}',      -- recipient resolved by MentionService directly
    300000,                      -- 5-minute dedup window (same as MentionService)
    true,
    10,
    '00000000-0000-0000-0000-000000000000'
WHERE NOT EXISTS (
    SELECT 1 FROM control.notification_routing_rule
    WHERE  tenant_id IS NULL AND code = 'collab.comment_mention'
);

-- ── Template: comment_mention / in_app ───────────────────────────────────────

INSERT INTO control.notification_template
    (tenant_id, template_key, channel, locale, version,
     subject, body_text, variables_schema,
     status, created_by)
SELECT
    NULL,
    'comment_mention',
    'in_app',
    'en',
    1,
    '{{mentioner_name}} mentioned you',
    '{{mentioner_name}} mentioned you in a comment on {{entity_type}} {{entity_id}}: "{{excerpt}}"',
    '{"mentioner_name": "string", "excerpt": "string", "entity_type": "string", "entity_id": "string"}'::jsonb,
    'active',
    '00000000-0000-0000-0000-000000000000'
WHERE NOT EXISTS (
    SELECT 1 FROM control.notification_template
    WHERE  tenant_id IS NULL
      AND  template_key = 'comment_mention'
      AND  channel      = 'in_app'
      AND  locale       = 'en'
      AND  version      = 1
);

-- ── Template: comment_mention / email ────────────────────────────────────────

INSERT INTO control.notification_template
    (tenant_id, template_key, channel, locale, version,
     subject, body_text, variables_schema,
     status, created_by)
SELECT
    NULL,
    'comment_mention',
    'email',
    'en',
    1,
    'You were mentioned by {{mentioner_name}}',
    E'Hi,\n\n{{mentioner_name}} mentioned you in a comment:\n\n"{{excerpt}}"\n\nView it here: {{entity_url}}',
    '{"mentioner_name": "string", "excerpt": "string", "entity_type": "string", "entity_id": "string", "entity_url": "string"}'::jsonb,
    'active',
    '00000000-0000-0000-0000-000000000000'
WHERE NOT EXISTS (
    SELECT 1 FROM control.notification_template
    WHERE  tenant_id IS NULL
      AND  template_key = 'comment_mention'
      AND  channel      = 'email'
      AND  locale       = 'en'
      AND  version      = 1
);

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/010_system/003_master/001_owner_type.sql
-- 900_seed_data/003_master/001_owner_type.sql
-- Seed: System owner types for the polymorphic routing registry.
-- Schema: master | Table: owner_type
-- Depends on: 04_tables/003_master.sql (owner_type table)
-- Idempotent: yes — ON CONFLICT on owner_type_system_code_uq DO NOTHING throughout
--
-- System rows define which master.* tables can be referenced by
-- contact_link.owner_type and address_link.owner_type. Each row
-- encodes the schema/table routing contract and advisory purpose filters.
-- ============================================================================

-- Retire operating_unit owner_type (table dropped in company_code migration)
DELETE FROM master.owner_type WHERE code = 'operating_unit';

INSERT INTO master.owner_type
    (code, name, description, category, sort_order,
     schema_name, table_name, pk_column,
     supports_address, supports_contact,
     allowed_address_purposes, allowed_contact_purposes,
     is_system, is_extensible_by_tenant, status, created_by)
VALUES

-- ── Category: identity ───────────────────────────────────────────────────────

('principal', 'Principal',
 'User, service account, or bot. Core identity actor.',
 'identity', 10,
 'master', 'principal', 'id',
 true, true,
 ARRAY['home', 'work', 'mailing', 'default'],
 ARRAY['login', 'recovery', 'mfa', 'verification', 'notification', 'billing'],
 true, false, 'active',
 '00000000-0000-0000-0000-000000000000'),

-- ── Category: party ──────────────────────────────────────────────────────────

('customer', 'Customer',
 'External customer entity.',
 'party', 20,
 'master', 'customer', 'id',
 true, true,
 ARRAY['billing', 'shipping', 'legal', 'mailing', 'default'],
 ARRAY['billing', 'support', 'notification', 'marketing'],
 true, false, 'active',
 '00000000-0000-0000-0000-000000000000'),

('supplier', 'Supplier',
 'External supplier / vendor entity.',
 'party', 21,
 'master', 'supplier', 'id',
 true, true,
 ARRAY['billing', 'remittance', 'receiving', 'legal', 'mailing', 'default'],
 ARRAY['billing', 'notification'],
 true, false, 'active',
 '00000000-0000-0000-0000-000000000000'),

('employee', 'Employee',
 'Internal employee entity.',
 'party', 22,
 'master', 'employee', 'id',
 true, true,
 ARRAY['home', 'work', 'payroll', 'emergency', 'mailing', 'default'],
 ARRAY['notification', 'billing'],
 true, false, 'active',
 '00000000-0000-0000-0000-000000000000'),

-- ── Category: structure ──────────────────────────────────────────────────────

('legal_entity', 'Legal Entity',
 'Registered legal entity (company, subsidiary, branch).',
 'structure', 30,
 'master', 'legal_entity', 'id',
 true, true,
 ARRAY['legal', 'hq', 'billing', 'tax', 'regulatory', 'mailing', 'default'],
 ARRAY['billing', 'notification'],
 true, false, 'active',
 '00000000-0000-0000-0000-000000000000'),

-- ('operating_unit') removed — table dropped in company_code migration.

('warehouse', 'Warehouse',
 'Inventory warehouse or distribution centre.',
 'structure', 32,
 'master', 'warehouse', 'id',
 true, false,
 ARRAY['warehouse', 'shipping', 'receiving', 'default'],
 ARRAY[]::text[],
 true, false, 'active',
 '00000000-0000-0000-0000-000000000000'),

('company_code', 'Company Code',
 'Accounting / posting unit. Registered address for tax and regulatory filings.',
 'structure', 33,
 'master', 'company_code', 'id',
 true, true,
 ARRAY['registered', 'billing', 'tax', 'regulatory', 'mailing', 'default'],
 ARRAY['billing', 'tax', 'notification'],
 true, false, 'active',
 '00000000-0000-0000-0000-000000000000'),

('site', 'Site',
 'Physical location (plant, office, store, branch, yard, depot).',
 'structure', 34,
 'master', 'site', 'id',
 true, true,
 ARRAY['site', 'shipping', 'receiving', 'mailing', 'default'],
 ARRAY['notification'],
 true, false, 'active',
 '00000000-0000-0000-0000-000000000000'),

('project', 'Project',
 'Project with optional site-level address for field offices.',
 'structure', 35,
 'master', 'project', 'id',
 true, false,
 ARRAY['site', 'mailing', 'default'],
 ARRAY[]::text[],
 true, false, 'active',
 '00000000-0000-0000-0000-000000000000'),

('cost_center', 'Cost Center',
 'Responsibility center. Address inherited from linked site.',
 'structure', 36,
 'master', 'cost_center', 'id',
 false, true,
 ARRAY[]::text[],
 ARRAY['notification'],
 true, false, 'active',
 '00000000-0000-0000-0000-000000000000'),

('profit_center', 'Profit Center',
 'P&L responsibility center.',
 'structure', 37,
 'master', 'profit_center', 'id',
 false, true,
 ARRAY[]::text[],
 ARRAY['notification'],
 true, false, 'active',
 '00000000-0000-0000-0000-000000000000')

ON CONFLICT (code) WHERE tenant_id IS NULL DO NOTHING;


-- ── bank_party ───────────────────────────────────────────────────────────────

INSERT INTO master.owner_type (
    tenant_id, code, name, description,
    schema_name, table_name, pk_column,
    is_tenant_scoped, tenant_column,
    is_system, category,
    allowed_address_purposes, allowed_contact_purposes,
    status, created_by
) VALUES (
    NULL, 'bank_party', 'Bank Party',
    'Bank institution / branch. Address for branch location, contact for branch phone/email.',
    'master', 'bank_party', 'id',
    true, 'tenant_id',
    true, 'party',
    ARRAY['default', 'registered', 'branch'],
    ARRAY['default', 'operations', 'swift'],
    'active', '00000000-0000-0000-0000-000000000000'
)
ON CONFLICT (code) WHERE tenant_id IS NULL
DO UPDATE SET
    name = EXCLUDED.name, description = EXCLUDED.description,
    schema_name = EXCLUDED.schema_name, table_name = EXCLUDED.table_name,
    allowed_address_purposes = EXCLUDED.allowed_address_purposes,
    allowed_contact_purposes = EXCLUDED.allowed_contact_purposes,
    updated_at = now(), updated_by = EXCLUDED.created_by;


-- ── spend_category / item_category ──────────────────────────────────────────

INSERT INTO master.owner_type (
    tenant_id, code, name, description,
    schema_name, table_name, pk_column,
    is_tenant_scoped, tenant_column,
    supports_address, supports_contact,
    is_system, category,
    allowed_address_purposes, allowed_contact_purposes,
    status, created_by
) VALUES
(
    NULL, 'spend_category', 'Spend Category',
    'Procurement spend category. Target for commodity classification bridges.',
    'master', 'spend_category', 'id',
    true, 'tenant_id',
    false, false,
    true, 'custom',
    ARRAY[]::text[], ARRAY[]::text[],
    'active', '00000000-0000-0000-0000-000000000000'
),
(
    NULL, 'item_category', 'Item Category',
    'Inventory item category. Target for commodity classification bridges.',
    'master', 'item_category', 'id',
    true, 'tenant_id',
    false, false,
    true, 'custom',
    ARRAY[]::text[], ARRAY[]::text[],
    'active', '00000000-0000-0000-0000-000000000000'
)
ON CONFLICT (code) WHERE tenant_id IS NULL DO NOTHING;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/010_system/008_governance/001_finance_close_cycle.sql
-- 900_seed_data/008_governance/001_finance_close_cycle.sql
-- Finance month-end close cycle seed data.
-- Idempotent: ON CONFLICT DO NOTHING on all inserts.
-- Loaded by athyperadmin (bypasses RLS via admin_write policy).

DO $$
DECLARE
    v_t   uuid;    -- SEED tenant
    v_sys uuid;    -- system principal
    v_e   varchar := 'US01';

    v_ty uuid;  -- cycle_type
    v_pp uuid;  -- phase: PREPARATION
    v_ps uuid;  -- phase: SOFT_CLOSE
    v_ph uuid;  -- phase: HARD_CLOSE
    v_pc uuid;  -- phase: CERTIFICATION

    -- categories
    v_cs uuid;  v_cc uuid;  v_cv uuid;  v_cx uuid;  v_ck uuid;
    v_cr uuid;  v_ca uuid;  v_cp uuid;  v_crp uuid;  v_cn uuid;
BEGIN
    -- Resolve SEED tenant dynamically
    SELECT id INTO v_t FROM master.tenant WHERE code = 'SEED' LIMIT 1;
    IF v_t IS NULL THEN
        RAISE NOTICE 'SKIP: No SEED tenant found. Create master.tenant with code=SEED first.';
        RETURN;
    END IF;

    SELECT id INTO v_sys FROM master.principal WHERE tenant_id = v_t AND principal_type = 'SYSTEM' LIMIT 1;
    IF v_sys IS NULL THEN SELECT id INTO v_sys FROM master.principal WHERE tenant_id = v_t LIMIT 1; END IF;
    IF v_sys IS NULL THEN RAISE NOTICE 'SKIP: No principal found for SEED tenant.'; RETURN; END IF;

    -- ── Cycle type ──────────────────────────────────────────────────────────
    INSERT INTO governance.cycle_type (
        id, tenant_id, type_code, type_name, description, frequency, domain,
        clean_cycle_policy, run_data_schema, created_by)
    VALUES (
        shared.uuidv7(), v_t, 'FIN_CLOSE', 'Finance month-end close',
        'Monthly financial close cycle covering subledger close, consolidation, reconciliation, validation, tax, adjustments, and certification.',
        'MONTHLY', 'FINANCE',
        '{"max_overrides":0,"min_readiness":95.00,"max_impact":null}'::jsonb,
        '{"required":["book_statuses"],"properties":{"book_statuses":{"type":"array"},"is_clean_close":{"type":"boolean"}}}'::jsonb,
        v_sys)
    ON CONFLICT (tenant_id, type_code) DO NOTHING
    RETURNING id INTO v_ty;

    IF v_ty IS NULL THEN
        SELECT id INTO v_ty FROM governance.cycle_type
        WHERE tenant_id = v_t AND type_code = 'FIN_CLOSE';
    END IF;

    -- ── Phases ──────────────────────────────────────────────────────────────
    INSERT INTO governance.cycle_phase (id, tenant_id, cycle_type_id, phase_code, phase_name, sort_order, target_hours_from_start, min_readiness_pct, created_by) VALUES
        (shared.uuidv7(), v_t, v_ty, 'PREPARATION',   'Preparation',   10, NULL, NULL,   v_sys)
    ON CONFLICT (tenant_id, cycle_type_id, phase_code) DO NOTHING RETURNING id INTO v_pp;
    IF v_pp IS NULL THEN SELECT id INTO v_pp FROM governance.cycle_phase WHERE tenant_id = v_t AND cycle_type_id = v_ty AND phase_code = 'PREPARATION'; END IF;

    INSERT INTO governance.cycle_phase (id, tenant_id, cycle_type_id, phase_code, phase_name, sort_order, target_hours_from_start, min_readiness_pct, created_by) VALUES
        (shared.uuidv7(), v_t, v_ty, 'SOFT_CLOSE',    'Soft close',    20, 72,   80.00, v_sys)
    ON CONFLICT (tenant_id, cycle_type_id, phase_code) DO NOTHING RETURNING id INTO v_ps;
    IF v_ps IS NULL THEN SELECT id INTO v_ps FROM governance.cycle_phase WHERE tenant_id = v_t AND cycle_type_id = v_ty AND phase_code = 'SOFT_CLOSE'; END IF;

    INSERT INTO governance.cycle_phase (id, tenant_id, cycle_type_id, phase_code, phase_name, sort_order, target_hours_from_start, min_readiness_pct, created_by) VALUES
        (shared.uuidv7(), v_t, v_ty, 'HARD_CLOSE',    'Hard close',    30, 120,  95.00, v_sys)
    ON CONFLICT (tenant_id, cycle_type_id, phase_code) DO NOTHING RETURNING id INTO v_ph;
    IF v_ph IS NULL THEN SELECT id INTO v_ph FROM governance.cycle_phase WHERE tenant_id = v_t AND cycle_type_id = v_ty AND phase_code = 'HARD_CLOSE'; END IF;

    INSERT INTO governance.cycle_phase (id, tenant_id, cycle_type_id, phase_code, phase_name, sort_order, target_hours_from_start, min_readiness_pct, created_by) VALUES
        (shared.uuidv7(), v_t, v_ty, 'CERTIFICATION', 'Certification', 40, 144, 100.00, v_sys)
    ON CONFLICT (tenant_id, cycle_type_id, phase_code) DO NOTHING RETURNING id INTO v_pc;
    IF v_pc IS NULL THEN SELECT id INTO v_pc FROM governance.cycle_phase WHERE tenant_id = v_t AND cycle_type_id = v_ty AND phase_code = 'CERTIFICATION'; END IF;

    -- ── Categories ──────────────────────────────────────────────────────────
    INSERT INTO governance.cycle_task_category (id, tenant_id, cycle_type_id, category_code, category_name, sort_order, created_by) VALUES
        (shared.uuidv7(), v_t, v_ty, 'SUBLEDGER',      'Subledger close',       1,  v_sys)
    ON CONFLICT (tenant_id, cycle_type_id, category_code) DO NOTHING RETURNING id INTO v_cs;
    IF v_cs IS NULL THEN SELECT id INTO v_cs FROM governance.cycle_task_category WHERE tenant_id = v_t AND cycle_type_id = v_ty AND category_code = 'SUBLEDGER'; END IF;

    INSERT INTO governance.cycle_task_category (id, tenant_id, cycle_type_id, category_code, category_name, sort_order, created_by) VALUES
        (shared.uuidv7(), v_t, v_ty, 'CONSOLIDATION',  'Consolidation',         2,  v_sys)
    ON CONFLICT (tenant_id, cycle_type_id, category_code) DO NOTHING RETURNING id INTO v_cc;
    IF v_cc IS NULL THEN SELECT id INTO v_cc FROM governance.cycle_task_category WHERE tenant_id = v_t AND cycle_type_id = v_ty AND category_code = 'CONSOLIDATION'; END IF;

    INSERT INTO governance.cycle_task_category (id, tenant_id, cycle_type_id, category_code, category_name, sort_order, created_by) VALUES
        (shared.uuidv7(), v_t, v_ty, 'VALIDATION',     'Validation',            3,  v_sys)
    ON CONFLICT (tenant_id, cycle_type_id, category_code) DO NOTHING RETURNING id INTO v_cv;
    IF v_cv IS NULL THEN SELECT id INTO v_cv FROM governance.cycle_task_category WHERE tenant_id = v_t AND cycle_type_id = v_ty AND category_code = 'VALIDATION'; END IF;

    INSERT INTO governance.cycle_task_category (id, tenant_id, cycle_type_id, category_code, category_name, sort_order, created_by) VALUES
        (shared.uuidv7(), v_t, v_ty, 'TAX',            'Tax',                   4,  v_sys)
    ON CONFLICT (tenant_id, cycle_type_id, category_code) DO NOTHING RETURNING id INTO v_cx;
    IF v_cx IS NULL THEN SELECT id INTO v_cx FROM governance.cycle_task_category WHERE tenant_id = v_t AND cycle_type_id = v_ty AND category_code = 'TAX'; END IF;

    INSERT INTO governance.cycle_task_category (id, tenant_id, cycle_type_id, category_code, category_name, sort_order, created_by) VALUES
        (shared.uuidv7(), v_t, v_ty, 'CASH',           'Cash & treasury',       5,  v_sys)
    ON CONFLICT (tenant_id, cycle_type_id, category_code) DO NOTHING RETURNING id INTO v_ck;
    IF v_ck IS NULL THEN SELECT id INTO v_ck FROM governance.cycle_task_category WHERE tenant_id = v_t AND cycle_type_id = v_ty AND category_code = 'CASH'; END IF;

    INSERT INTO governance.cycle_task_category (id, tenant_id, cycle_type_id, category_code, category_name, sort_order, created_by) VALUES
        (shared.uuidv7(), v_t, v_ty, 'REVENUE',        'Revenue recognition',   6,  v_sys)
    ON CONFLICT (tenant_id, cycle_type_id, category_code) DO NOTHING RETURNING id INTO v_cr;
    IF v_cr IS NULL THEN SELECT id INTO v_cr FROM governance.cycle_task_category WHERE tenant_id = v_t AND cycle_type_id = v_ty AND category_code = 'REVENUE'; END IF;

    INSERT INTO governance.cycle_task_category (id, tenant_id, cycle_type_id, category_code, category_name, sort_order, created_by) VALUES
        (shared.uuidv7(), v_t, v_ty, 'ADJUSTMENTS',    'Adjustments',           7,  v_sys)
    ON CONFLICT (tenant_id, cycle_type_id, category_code) DO NOTHING RETURNING id INTO v_ca;
    IF v_ca IS NULL THEN SELECT id INTO v_ca FROM governance.cycle_task_category WHERE tenant_id = v_t AND cycle_type_id = v_ty AND category_code = 'ADJUSTMENTS'; END IF;

    INSERT INTO governance.cycle_task_category (id, tenant_id, cycle_type_id, category_code, category_name, sort_order, created_by) VALUES
        (shared.uuidv7(), v_t, v_ty, 'APPROVAL',       'Approval',              8,  v_sys)
    ON CONFLICT (tenant_id, cycle_type_id, category_code) DO NOTHING RETURNING id INTO v_cp;
    IF v_cp IS NULL THEN SELECT id INTO v_cp FROM governance.cycle_task_category WHERE tenant_id = v_t AND cycle_type_id = v_ty AND category_code = 'APPROVAL'; END IF;

    INSERT INTO governance.cycle_task_category (id, tenant_id, cycle_type_id, category_code, category_name, sort_order, created_by) VALUES
        (shared.uuidv7(), v_t, v_ty, 'REPORTING',      'Reporting',             9,  v_sys)
    ON CONFLICT (tenant_id, cycle_type_id, category_code) DO NOTHING RETURNING id INTO v_crp;
    IF v_crp IS NULL THEN SELECT id INTO v_crp FROM governance.cycle_task_category WHERE tenant_id = v_t AND cycle_type_id = v_ty AND category_code = 'REPORTING'; END IF;

    INSERT INTO governance.cycle_task_category (id, tenant_id, cycle_type_id, category_code, category_name, sort_order, created_by) VALUES
        (shared.uuidv7(), v_t, v_ty, 'RECONCILIATION', 'Reconciliation',        10, v_sys)
    ON CONFLICT (tenant_id, cycle_type_id, category_code) DO NOTHING RETURNING id INTO v_cn;
    IF v_cn IS NULL THEN SELECT id INTO v_cn FROM governance.cycle_task_category WHERE tenant_id = v_t AND cycle_type_id = v_ty AND category_code = 'RECONCILIATION'; END IF;

    -- ── Task templates (17 tasks across 4 phases) ───────────────────────────
    INSERT INTO governance.cycle_task_template (
        tenant_id, entity_code, cycle_type_id, phase_id, category_id,
        task_code, task_name, completion_mode, is_mandatory, sla_hours, sort_order, created_by
    ) VALUES
    -- PREPARATION
    (v_t, v_e, v_ty, v_pp, v_cs, 'CUTOFF_REVIEW',     'Review period cutoff dates',          'MANUAL', true,   8, 1,  v_sys),
    (v_t, v_e, v_ty, v_pp, v_cn, 'BANK_FEEDS',        'Verify bank statement feeds loaded',  'SYSTEM', true,   4, 2,  v_sys),
    -- SOFT_CLOSE
    (v_t, v_e, v_ty, v_ps, v_cs, 'SUB_AP',            'Subledger close — AP',                'HYBRID', true,  24, 10, v_sys),
    (v_t, v_e, v_ty, v_ps, v_cs, 'SUB_AR',            'Subledger close — AR',                'HYBRID', true,  24, 11, v_sys),
    (v_t, v_e, v_ty, v_ps, v_cs, 'SUB_FA',            'Subledger close — fixed assets',      'SYSTEM', true,  12, 12, v_sys),
    (v_t, v_e, v_ty, v_ps, v_cs, 'SUB_PAYROLL',       'Subledger close — payroll',           'HYBRID', true,  16, 13, v_sys),
    (v_t, v_e, v_ty, v_ps, v_cn, 'BANK_RECON',        'Bank reconciliation',                 'HYBRID', true,  24, 20, v_sys),
    (v_t, v_e, v_ty, v_ps, v_cr, 'REV_RECOGNITION',   'Revenue recognition review',          'MANUAL', true,  16, 25, v_sys),
    (v_t, v_e, v_ty, v_ps, v_ck, 'CASH_POSITION',     'Cash position reconciliation',        'MANUAL', true,  12, 30, v_sys),
    -- HARD_CLOSE
    (v_t, v_e, v_ty, v_ph, v_cc, 'IC_ELIMINATION',    'Intercompany elimination entries',    'SYSTEM', true,   8, 40, v_sys),
    (v_t, v_e, v_ty, v_ph, v_cc, 'FX_REVAL',          'FX revaluation run',                  'SYSTEM', true,   4, 41, v_sys),
    (v_t, v_e, v_ty, v_ph, v_cx, 'TAX_PROVISION',     'Tax provision calculation',           'HYBRID', true,  16, 45, v_sys),
    (v_t, v_e, v_ty, v_ph, v_ca, 'TOPSIDE_ADJ',       'Review & post topside adjustments',   'MANUAL', true,   8, 50, v_sys),
    (v_t, v_e, v_ty, v_ph, v_cv, 'TB_VALIDATION',     'Trial balance validation',            'HYBRID', true,   8, 55, v_sys),
    -- CERTIFICATION
    (v_t, v_e, v_ty, v_pc, v_crp, 'MGMT_PACK',         'Prepare management reporting pack',   'MANUAL', true,  16, 60, v_sys),
    (v_t, v_e, v_ty, v_pc, v_cp, 'CONTROLLER_SIGNOFF','Controller sign-off',                 'MANUAL', true,   8, 70, v_sys),
    (v_t, v_e, v_ty, v_pc, v_cp, 'CFO_ATTESTATION',   'CFO attestation',                     'MANUAL', true,   8, 80, v_sys)
    ON CONFLICT (tenant_id, entity_code, cycle_type_id, task_code) DO NOTHING;

    -- ── Carryforward rules (SOX-strict) ─────────────────────────────────────
    INSERT INTO governance.cycle_carryforward_rule (
        tenant_id, cycle_type_id, deviation_type, action, description, created_by
    ) VALUES
    (v_t, v_ty, 'EXCEPTION', 'FORCE_CLOSE', 'SOX: all exceptions must be resolved before certification', v_sys),
    (v_t, v_ty, 'OVERRIDE',  'EXPIRE',      'Overrides are time-bound to the period they apply to',      v_sys),
    (v_t, v_ty, 'WAIVER',    'FORCE_CLOSE', 'SOX: waivers must be formally accepted before certification', v_sys)
    ON CONFLICT (tenant_id, cycle_type_id, deviation_type) DO NOTHING;

    RAISE NOTICE 'Finance close seed complete: type=%, phases=4, categories=10, templates=17, cf_rules=3', v_ty;
END;
$$;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/010_system/100_finance/100_master/001_vendor.sql
-- 100_finance/100_master/001_vendor.sql
-- Purpose: control.entity + entity_version + entity_field for Vendor (master.supplier)
-- Module: BUY (Buying)
-- Depends on: LookupDomain/master/supplier_status.sql, supplier_type.sql,
--             party_payment_terms.sql, supplier_payment_method.sql
-- Idempotent: WHERE NOT EXISTS / ON CONFLICT DO NOTHING

-- ── 0. Idempotency fix: rename if previously inserted as 'supplier' ──────────
UPDATE control.entity
SET name = 'vendor'
WHERE table_schema = 'master' AND table_name = 'supplier'
  AND tenant_id IS NULL AND name = 'supplier';

-- ── 1. control.entity ────────────────────────────────────────────────────────
INSERT INTO control.entity (
    module_id, name, entity_short,
    entity_class, ownership_model, kind, backing_type,
    governance_level, security_tier, mutability,
    table_schema, table_name,
    label_singular, label_plural, icon_key, color_token,
    numbering_active, naming_policy, feature_flags,
    status, created_by)
SELECT
    (SELECT id FROM shared.module WHERE code = 'BUY'),
    'vendor', 'VND',
    'MASTER', 'system', 'ent', 'table',
    'standard', 'business', 'controlled',
    'master', 'supplier',
    'Vendor', 'Vendors', 'building-2', 'blue',
    true,
    '{"prefix":"VND","prefix_configurable":true,"separator":"-","segments":[{"type":"sequence","padding":5}]}'::jsonb,
    '{"is_approvable":false,"party_category":"supplier","allow_address":true,"allow_contact":true}'::jsonb,
    'ACTIVE', '00000000-0000-0000-0000-000000000000'
WHERE NOT EXISTS (
    SELECT 1 FROM control.entity
    WHERE table_schema = 'master' AND table_name = 'supplier'
      AND tenant_id IS NULL
);

-- ── 2. control.entity_version ────────────────────────────────────────────────
INSERT INTO control.entity_version (
    entity_id, tenant_id, version_no, status, effective_from, created_by)
SELECT e.id, NULL, 1, 'EFFECTIVE', now(),
       '00000000-0000-0000-0000-000000000000'
FROM   control.entity e
WHERE  e.table_schema = 'master' AND e.table_name = 'supplier'
  AND  e.tenant_id IS NULL
ON CONFLICT (entity_id, version_no) DO NOTHING;

-- ── 3. control.entity_field (12 fields) ──────────────────────────────────────
INSERT INTO control.entity_field (
    entity_version_id, name, column_name, label, data_type,
    cardinality, origin, enum_domain_code, is_required, is_filterable,
    validation, sort_order, created_by)
SELECT ev.id,
       f.name, f.column_name, f.label, f.data_type,
       f.cardinality, 'standard', f.enum_domain_code,
       f.is_required, f.is_filterable,
       f.validation, f.sort_order,
       '00000000-0000-0000-0000-000000000000'
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
CROSS JOIN (VALUES
    ('code',        'code',          'Vendor Code',  'text', 'one',         NULL::text,                             true,  true,  '{"max_length":20}'::jsonb,  10),
    ('name',        'name',          'Vendor Name',  'text', 'one',         NULL::text,                             true,  true,  '{"max_length":255}'::jsonb, 20),
    ('legal_name',  'legal_name',    'Legal Name',   'text', 'zero_or_one', NULL::text,                             false, false, '{"max_length":255}'::jsonb, 30),
    ('vendor_type', 'supplier_type', 'Vendor Type',  'enum', 'zero_or_one', 'master.supplier_type'::text,           false, true,  NULL::jsonb,                 40),
    ('status',      'status',        'Status',       'enum', 'one',         'master.supplier_status'::text,         true,  true,  NULL::jsonb,                 50),
    ('tax_number',  'tax_id',        'Tax Number',   'text', 'zero_or_one', NULL::text,                             false, false, '{"max_length":50}'::jsonb,  60),
    ('description', 'description',   'Description',  'text', 'zero_or_one', NULL::text,                             false, false, '{"max_length":500}'::jsonb, 70)
) AS f(name, column_name, label, data_type, cardinality, enum_domain_code,
       is_required, is_filterable, validation, sort_order)
WHERE e.table_schema = 'master' AND e.table_name = 'supplier'
  AND e.tenant_id IS NULL AND ev.version_no = 1
ON CONFLICT DO NOTHING;

-- ── 4. Fix origin for existing rows (idempotent) ─────────────────────────────
UPDATE control.entity_field ef
SET origin = 'standard'
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
WHERE ef.entity_version_id = ev.id
  AND e.table_schema = 'master' AND e.table_name = 'supplier'
  AND e.tenant_id IS NULL AND ev.version_no = 1
  AND ef.origin = 'system';

-- ── 5. Fix column_name mismatches and deactivate non-existent columns ─────────
-- vendor_type → supplier_type (actual column name in master.supplier)
UPDATE control.entity_field ef
SET column_name = 'supplier_type'
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
WHERE ef.entity_version_id = ev.id
  AND e.table_schema = 'master' AND e.table_name = 'supplier'
  AND e.tenant_id IS NULL AND ev.version_no = 1
  AND ef.name = 'vendor_type' AND ef.column_name = 'vendor_type';

-- tax_number → tax_id (actual column name in master.supplier)
UPDATE control.entity_field ef
SET column_name = 'tax_id'
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
WHERE ef.entity_version_id = ev.id
  AND e.table_schema = 'master' AND e.table_name = 'supplier'
  AND e.tenant_id IS NULL AND ev.version_no = 1
  AND ef.name = 'tax_number' AND ef.column_name = 'tax_number';

-- Deactivate fields whose column_names do not exist in master.supplier
UPDATE control.entity_field ef
SET is_active = false
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
WHERE ef.entity_version_id = ev.id
  AND e.table_schema = 'master' AND e.table_name = 'supplier'
  AND e.tenant_id IS NULL AND ev.version_no = 1
  AND ef.name IN ('payment_terms', 'payment_method', 'currency_code',
                  'credit_limit', 'contact_email', 'contact_phone');

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/010_system/100_finance/100_master/002_vendor_lifecycle.sql
-- 100_finance/100_master/002_vendor_lifecycle.sql
-- Purpose: control.lifecycle + 5 states + 7 transitions + entity_lifecycle binding
--          for the Vendor (master.supplier) entity
-- Depends on: 001_vendor.sql
-- Idempotent: ON CONFLICT DO NOTHING throughout

DO $$ DECLARE
    v_lc_id  uuid;
    v_s      jsonb;  -- state id map  { state_code: uuid }
BEGIN

-- ── 1. control.lifecycle ─────────────────────────────────────────────────────
INSERT INTO control.lifecycle (tenant_id, code, name, version_no, is_active, config, created_by)
VALUES (NULL, 'vendor', 'Vendor Lifecycle', 1, true,
    '{"initial_state_code":"draft","allow_parallel_instances":false,"icon_key":"building-2","ui_color":"#1D4ED8","entity_types":["vendor"]}'::jsonb,
    '00000000-0000-0000-0000-000000000000')
ON CONFLICT (tenant_id, code) DO NOTHING;

SELECT id INTO v_lc_id FROM control.lifecycle WHERE code = 'vendor' AND tenant_id IS NULL;

-- ── 2. control.lifecycle_state (5 states) ────────────────────────────────────
INSERT INTO control.lifecycle_state
    (lifecycle_id, tenant_id, code, name, is_initial, is_terminal, sort_order, config, created_by)
VALUES
    (v_lc_id, NULL, 'draft',    'Draft',    true,  false, 10, '{"ui_color":"#888888","icon_key":"pencil"}'::jsonb,       '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'active',   'Active',   false, false, 20, '{"ui_color":"#217346","icon_key":"check-circle"}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'inactive', 'Inactive', false, false, 30, '{"ui_color":"#888888","icon_key":"pause-circle"}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'blocked',  'Blocked',  false, false, 40, '{"ui_color":"#C00000","icon_key":"ban"}'::jsonb,          '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'archived', 'Archived', false, true,  50, '{"ui_color":"#666666","icon_key":"archive"}'::jsonb,      '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, code) DO NOTHING;

-- Build state id map
SELECT jsonb_object_agg(code, id) INTO v_s
FROM control.lifecycle_state WHERE lifecycle_id = v_lc_id;

-- ── 3. control.lifecycle_transition (7 edges) ────────────────────────────────
INSERT INTO control.lifecycle_transition
    (lifecycle_id, tenant_id, from_state_id, to_state_id, operation_code, is_active, config, created_by)
VALUES
    (v_lc_id, NULL, (v_s->>'draft')::uuid,    (v_s->>'active')::uuid,   'activate',   true, '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'active')::uuid,   (v_s->>'inactive')::uuid, 'deactivate', true, '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'inactive')::uuid, (v_s->>'active')::uuid,   'reactivate', true, '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'active')::uuid,   (v_s->>'blocked')::uuid,  'block',      true, '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'blocked')::uuid,  (v_s->>'active')::uuid,   'unblock',    true, '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'active')::uuid,   (v_s->>'archived')::uuid, 'archive',    true, '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'inactive')::uuid, (v_s->>'archived')::uuid, 'archive',    true, '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, from_state_id, to_state_id) DO NOTHING;

-- ── 4. control.entity_lifecycle binding ──────────────────────────────────────
-- Idempotency fix: migrate old binding if it was inserted as 'supplier'
UPDATE control.entity_lifecycle
SET entity_name = 'vendor'
WHERE entity_name = 'supplier' AND lifecycle_id = v_lc_id AND tenant_id IS NULL;

INSERT INTO control.entity_lifecycle
    (entity_name, lifecycle_id, tenant_id, conditions, priority, created_by)
VALUES
    ('vendor', v_lc_id, NULL, NULL, 100, '00000000-0000-0000-0000-000000000000')
ON CONFLICT (tenant_id, entity_name, lifecycle_id) DO NOTHING;

END $$;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/010_system/100_finance/100_master/003_customer.sql
-- 100_finance/100_master/003_customer.sql
-- Purpose: control.entity + entity_version + entity_field for Customer (master.customer)
-- Module: CRM (Customer Relationship Management)
-- Depends on: LookupDomain/master/customer_status.sql, customer_type.sql,
--             party_payment_terms.sql
-- Idempotent: WHERE NOT EXISTS / ON CONFLICT DO NOTHING

-- ── 1. control.entity ────────────────────────────────────────────────────────
INSERT INTO control.entity (
    module_id, name, entity_short,
    entity_class, ownership_model, kind, backing_type,
    governance_level, security_tier, mutability,
    table_schema, table_name,
    label_singular, label_plural, icon_key, color_token,
    numbering_active, naming_policy, feature_flags,
    status, created_by)
SELECT
    (SELECT id FROM shared.module WHERE code = 'CRM'),
    'customer', 'CUS',
    'MASTER', 'system', 'ent', 'table',
    'standard', 'business', 'controlled',
    'master', 'customer',
    'Customer', 'Customers', 'users', 'teal',
    true,
    '{"prefix":"CUS","prefix_configurable":true,"separator":"-","segments":[{"type":"sequence","padding":5}]}'::jsonb,
    '{"is_approvable":false,"party_category":"customer","allow_address":true,"allow_contact":true}'::jsonb,
    'ACTIVE', '00000000-0000-0000-0000-000000000000'
WHERE NOT EXISTS (
    SELECT 1 FROM control.entity
    WHERE table_schema = 'master' AND table_name = 'customer'
      AND tenant_id IS NULL
);

-- ── 2. control.entity_version ────────────────────────────────────────────────
INSERT INTO control.entity_version (
    entity_id, tenant_id, version_no, status, effective_from, created_by)
SELECT e.id, NULL, 1, 'EFFECTIVE', now(),
       '00000000-0000-0000-0000-000000000000'
FROM   control.entity e
WHERE  e.table_schema = 'master' AND e.table_name = 'customer'
  AND  e.tenant_id IS NULL
ON CONFLICT (entity_id, version_no) DO NOTHING;

-- ── 3. control.entity_field (11 fields) ──────────────────────────────────────
INSERT INTO control.entity_field (
    entity_version_id, name, column_name, label, data_type,
    cardinality, origin, enum_domain_code, is_required, is_filterable,
    validation, sort_order, created_by)
SELECT ev.id,
       f.name, f.column_name, f.label, f.data_type,
       f.cardinality, 'standard', f.enum_domain_code,
       f.is_required, f.is_filterable,
       f.validation, f.sort_order,
       '00000000-0000-0000-0000-000000000000'
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
CROSS JOIN (VALUES
    ('code',           'code',           'Customer Code',   'text',    'one',         NULL::text,                        true,  true,  '{"max_length":20}'::jsonb,  10),
    ('name',           'name',           'Customer Name',   'text',    'one',         NULL::text,                        true,  true,  '{"max_length":255}'::jsonb, 20),
    ('legal_name',     'legal_name',     'Legal Name',      'text',    'zero_or_one', NULL::text,                        false, false, '{"max_length":255}'::jsonb, 30),
    ('customer_type',  'customer_type',  'Customer Type',   'enum',    'zero_or_one', 'master.customer_type'::text,      false, true,  NULL::jsonb,                 40),
    ('status',         'status',         'Status',          'enum',    'one',         'master.customer_status'::text,    true,  true,  NULL::jsonb,                 50),
    ('payment_terms',  'payment_terms',  'Payment Terms',   'enum',    'zero_or_one', 'master.party_payment_terms'::text, false, true, NULL::jsonb,                 60),
    ('currency_code',  'currency_code',  'Currency',        'text',    'zero_or_one', NULL::text,                        false, true,  '{"max_length":3}'::jsonb,   70),
    ('tax_number',     'tax_number',     'Tax Number',      'text',    'zero_or_one', NULL::text,                        false, false, '{"max_length":50}'::jsonb,  80),
    ('credit_limit',   'credit_limit',   'Credit Limit',    'decimal', 'zero_or_one', NULL::text,                        false, false, '{"min":0}'::jsonb,          90),
    ('contact_email',  'contact_email',  'Contact Email',   'text',    'zero_or_one', NULL::text,                        false, false, '{"format":"email"}'::jsonb,100),
    ('contact_phone',  'contact_phone',  'Contact Phone',   'text',    'zero_or_one', NULL::text,                        false, false, '{"max_length":30}'::jsonb, 110)
) AS f(name, column_name, label, data_type, cardinality, enum_domain_code,
       is_required, is_filterable, validation, sort_order)
WHERE e.table_schema = 'master' AND e.table_name = 'customer'
  AND e.tenant_id IS NULL AND ev.version_no = 1
ON CONFLICT DO NOTHING;

-- ── Fix origin for existing rows (idempotent) ─────────────────────────────────
UPDATE control.entity_field ef
SET origin = 'standard'
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
WHERE ef.entity_version_id = ev.id
  AND e.table_schema = 'master' AND e.table_name = 'customer'
  AND e.tenant_id IS NULL AND ev.version_no = 1
  AND ef.origin = 'system';

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/010_system/100_finance/100_master/004_customer_lifecycle.sql
-- 100_finance/100_master/004_customer_lifecycle.sql
-- Purpose: control.lifecycle + 5 states + 7 transitions + entity_lifecycle binding
--          for the Customer (master.customer) entity
-- Depends on: 003_customer.sql
-- Idempotent: ON CONFLICT DO NOTHING throughout

DO $$ DECLARE
    v_lc_id  uuid;
    v_s      jsonb;  -- state id map  { state_code: uuid }
BEGIN

-- ── 1. control.lifecycle ─────────────────────────────────────────────────────
INSERT INTO control.lifecycle (tenant_id, code, name, version_no, is_active, config, created_by)
VALUES (NULL, 'customer', 'Customer Lifecycle', 1, true,
    '{"initial_state_code":"draft","allow_parallel_instances":false,"icon_key":"users","ui_color":"#0D9488","entity_types":["customer"]}'::jsonb,
    '00000000-0000-0000-0000-000000000000')
ON CONFLICT (tenant_id, code) DO NOTHING;

SELECT id INTO v_lc_id FROM control.lifecycle WHERE code = 'customer' AND tenant_id IS NULL;

-- ── 2. control.lifecycle_state (5 states) ────────────────────────────────────
INSERT INTO control.lifecycle_state
    (lifecycle_id, tenant_id, code, name, is_initial, is_terminal, sort_order, config, created_by)
VALUES
    (v_lc_id, NULL, 'draft',    'Draft',    true,  false, 10, '{"ui_color":"#888888","icon_key":"pencil"}'::jsonb,       '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'active',   'Active',   false, false, 20, '{"ui_color":"#217346","icon_key":"check-circle"}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'inactive', 'Inactive', false, false, 30, '{"ui_color":"#888888","icon_key":"pause-circle"}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'blocked',  'Blocked',  false, false, 40, '{"ui_color":"#C00000","icon_key":"ban"}'::jsonb,          '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'archived', 'Archived', false, true,  50, '{"ui_color":"#666666","icon_key":"archive"}'::jsonb,      '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, code) DO NOTHING;

-- Build state id map
SELECT jsonb_object_agg(code, id) INTO v_s
FROM control.lifecycle_state WHERE lifecycle_id = v_lc_id;

-- ── 3. control.lifecycle_transition (7 edges) ────────────────────────────────
INSERT INTO control.lifecycle_transition
    (lifecycle_id, tenant_id, from_state_id, to_state_id, operation_code, is_active, config, created_by)
VALUES
    (v_lc_id, NULL, (v_s->>'draft')::uuid,    (v_s->>'active')::uuid,   'activate',   true, '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'active')::uuid,   (v_s->>'inactive')::uuid, 'deactivate', true, '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'inactive')::uuid, (v_s->>'active')::uuid,   'reactivate', true, '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'active')::uuid,   (v_s->>'blocked')::uuid,  'block',      true, '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'blocked')::uuid,  (v_s->>'active')::uuid,   'unblock',    true, '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'active')::uuid,   (v_s->>'archived')::uuid, 'archive',    true, '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'inactive')::uuid, (v_s->>'archived')::uuid, 'archive',    true, '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, from_state_id, to_state_id) DO NOTHING;

-- ── 4. control.entity_lifecycle binding ──────────────────────────────────────
INSERT INTO control.entity_lifecycle
    (entity_name, lifecycle_id, tenant_id, conditions, priority, created_by)
VALUES
    ('customer', v_lc_id, NULL, NULL, 100, '00000000-0000-0000-0000-000000000000')
ON CONFLICT (tenant_id, entity_name, lifecycle_id) DO NOTHING;

END $$;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/010_system/100_finance/200_document/001_invoice.sql
-- 100_finance/200_document/001_invoice.sql
-- Purpose: control.entity + entity_version + entity_field for Purchase Invoice
--          (document.purchase_invoice)
-- Module: ACC (Finance Core Accounting)
-- Depends on: LookupDomain/document/p2p_lookup_values.sql
--             (domain: document.purchase_invoice_status, document.purchase_invoice_type)
-- Idempotent: WHERE NOT EXISTS / ON CONFLICT DO NOTHING

-- ── 1. control.entity ────────────────────────────────────────────────────────
INSERT INTO control.entity (
    module_id, name, entity_short,
    entity_class, ownership_model, kind, backing_type,
    governance_level, security_tier, mutability,
    table_schema, table_name,
    label_singular, label_plural, icon_key, color_token,
    numbering_active, naming_policy, feature_flags,
    status, created_by)
SELECT
    (SELECT id FROM shared.module WHERE code = 'ACC'),
    'purchase_invoice', 'INV',
    'DOCUMENT', 'system', 'ent', 'table',
    'full', 'tenant_critical', 'controlled',
    'document', 'purchase_invoice',
    'Invoice', 'Invoices', 'file-text', 'violet',
    true,
    '{"prefix":"INV","prefix_configurable":true,"separator":"-","segments":[{"type":"year","format":"YYYY"},{"type":"sequence","padding":6}]}'::jsonb,
    '{"is_approvable":true,"document_category":"payables","allow_on_behalf_of":false,"has_line_items":true,"auto_number":true}'::jsonb,
    'ACTIVE', '00000000-0000-0000-0000-000000000000'
WHERE NOT EXISTS (
    SELECT 1 FROM control.entity
    WHERE table_schema = 'document' AND table_name = 'purchase_invoice'
      AND tenant_id IS NULL
);

-- ── 2. control.entity_version ────────────────────────────────────────────────
INSERT INTO control.entity_version (
    entity_id, tenant_id, version_no, status, effective_from, created_by)
SELECT e.id, NULL, 1, 'EFFECTIVE', now(),
       '00000000-0000-0000-0000-000000000000'
FROM   control.entity e
WHERE  e.table_schema = 'document' AND e.table_name = 'purchase_invoice'
  AND  e.tenant_id IS NULL
ON CONFLICT (entity_id, version_no) DO NOTHING;

-- ── 3. control.entity_field (13 fields) ──────────────────────────────────────
INSERT INTO control.entity_field (
    entity_version_id, name, column_name, label, data_type,
    cardinality, origin, enum_domain_code, is_required, is_filterable,
    validation, sort_order, created_by)
SELECT ev.id,
       f.name, f.column_name, f.label, f.data_type,
       f.cardinality, 'standard', f.enum_domain_code,
       f.is_required, f.is_filterable,
       f.validation, f.sort_order,
       '00000000-0000-0000-0000-000000000000'
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
CROSS JOIN (VALUES
    ('document_no',       'invoice_number',         'Invoice No.',     'text',    'one',         NULL::text,                              true,  true,  '{"max_length":50}'::jsonb,    10),
    ('invoice_type',      'invoice_type',           'Invoice Type',    'enum',    'one',         'document.purchase_invoice_type'::text,  true,  true,  NULL::jsonb,                   20),
    ('status',            'status',                 'Status',          'enum',    'one',         'document.purchase_invoice_status'::text, true, true,  NULL::jsonb,                   30),
    ('supplier_id',       'supplier_id',            'Vendor',          'reference', 'one',       NULL::text,                              true,  true,  '{"ref_entity":"vendor"}'::jsonb, 40),
    ('invoice_date',      'document_date',          'Invoice Date',    'date',    'one',         NULL::text,                              true,  true,  NULL::jsonb,                   50),
    ('due_date',          'due_date',               'Due Date',        'date',    'zero_or_one', NULL::text,                              false, true,  NULL::jsonb,                   60),
    ('currency_code',     'currency_code',          'Currency',        'text',    'one',         NULL::text,                              true,  true,  '{"max_length":3}'::jsonb,     70),
    ('gross_amount',      'total_amount',           'Gross Amount',    'decimal', 'one',         NULL::text,                              true,  false, '{"min":0}'::jsonb,            80),
    ('tax_amount',        'tax_amount',             'Tax Amount',      'decimal', 'zero_or_one', NULL::text,                              false, false, '{"min":0}'::jsonb,            90),
    ('net_amount',        'subtotal_amount',        'Net Amount',      'decimal', 'one',         NULL::text,                              true,  false, '{"min":0}'::jsonb,           100),
    ('vendor_invoice_ref','supplier_invoice_number','Vendor Ref',      'text',    'zero_or_one', NULL::text,                              false, false, '{"max_length":100}'::jsonb,  120),
    ('description',       'description',            'Description',     'text',    'zero_or_one', NULL::text,                              false, false, '{"max_length":500}'::jsonb,  130)
) AS f(name, column_name, label, data_type, cardinality, enum_domain_code,
       is_required, is_filterable, validation, sort_order)
WHERE e.table_schema = 'document' AND e.table_name = 'purchase_invoice'
  AND e.tenant_id IS NULL AND ev.version_no = 1
ON CONFLICT DO NOTHING;

-- ── Fix ref_entity: "supplier" → "vendor" on already-seeded rows ─────────────
UPDATE control.entity_field ef
SET validation = '{"ref_entity":"vendor"}'::jsonb
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
WHERE ef.entity_version_id = ev.id
  AND e.table_schema = 'document' AND e.table_name = 'purchase_invoice'
  AND e.tenant_id IS NULL AND ev.version_no = 1
  AND ef.name = 'supplier_id'
  AND ef.validation->>'ref_entity' = 'supplier';

-- ── Fix origin for existing rows (idempotent) ─────────────────────────────────
UPDATE control.entity_field ef
SET origin = 'standard'
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
WHERE ef.entity_version_id = ev.id
  AND e.table_schema = 'document' AND e.table_name = 'purchase_invoice'
  AND e.tenant_id IS NULL AND ev.version_no = 1
  AND ef.origin = 'system';

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/010_system/100_finance/200_document/002_invoice_lifecycle.sql
-- 100_finance/200_document/002_invoice_lifecycle.sql
-- Purpose: control.lifecycle + 9 states + transitions + entity_lifecycle binding
--          for Purchase Invoice (document.purchase_invoice)
-- Depends on: 001_invoice.sql
-- Idempotent: ON CONFLICT DO NOTHING throughout

DO $$ DECLARE
    v_lc_id  uuid;
    v_s      jsonb;  -- state id map  { state_code: uuid }
BEGIN

-- ── 1. control.lifecycle ─────────────────────────────────────────────────────
INSERT INTO control.lifecycle (tenant_id, code, name, version_no, is_active, config, created_by)
VALUES (NULL, 'purchase_invoice', 'Purchase Invoice Lifecycle', 1, true,
    '{"initial_state_code":"draft","allow_parallel_instances":false,"icon_key":"file-text","ui_color":"#7C3AED","entity_types":["purchase_invoice"]}'::jsonb,
    '00000000-0000-0000-0000-000000000000')
ON CONFLICT (tenant_id, code) DO NOTHING;

SELECT id INTO v_lc_id FROM control.lifecycle WHERE code = 'purchase_invoice' AND tenant_id IS NULL;

-- ── 2. control.lifecycle_state (9 states) ────────────────────────────────────
INSERT INTO control.lifecycle_state
    (lifecycle_id, tenant_id, code, name, is_initial, is_terminal, sort_order, config, created_by)
VALUES
    (v_lc_id, NULL, 'draft',            'Draft',             true,  false, 10, '{"ui_color":"#888888","icon_key":"pencil"}'::jsonb,                                           '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'pending_approval', 'Pending Approval',  false, false, 20, '{"ui_color":"#7B61FF","icon_key":"clock","sla_minutes":2880}'::jsonb,                         '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'approved',         'Approved',          false, false, 30, '{"ui_color":"#0F6CBD","icon_key":"check-circle"}'::jsonb,                                     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'posted',           'Posted',            false, false, 40, '{"ui_color":"#217346","icon_key":"check-double"}'::jsonb,                                     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'partially_paid',   'Partially Paid',    false, false, 50, '{"ui_color":"#E8A020","icon_key":"banknote"}'::jsonb,                                         '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'fully_paid',       'Fully Paid',        false, true,  60, '{"ui_color":"#217346","icon_key":"circle-check"}'::jsonb,                                     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'rejected',         'Rejected',          false, true,  70, '{"ui_color":"#C00000","icon_key":"x-circle"}'::jsonb,                                         '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'cancelled',        'Cancelled',         false, true,  80, '{"ui_color":"#666666","icon_key":"ban"}'::jsonb,                                              '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'reversed',         'Reversed',          false, true,  90, '{"ui_color":"#E8A020","icon_key":"rotate-ccw"}'::jsonb,                                      '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, code) DO NOTHING;

-- Build state id map
SELECT jsonb_object_agg(code, id) INTO v_s
FROM control.lifecycle_state WHERE lifecycle_id = v_lc_id;

-- ── 3. control.lifecycle_transition ──────────────────────────────────────────
INSERT INTO control.lifecycle_transition
    (lifecycle_id, tenant_id, from_state_id, to_state_id, operation_code, is_active, config, created_by)
VALUES
    (v_lc_id, NULL, (v_s->>'draft')::uuid,            (v_s->>'pending_approval')::uuid, 'submit',   true, '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'draft')::uuid,            (v_s->>'cancelled')::uuid,        'cancel',   true, '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'pending_approval')::uuid, (v_s->>'approved')::uuid,         'approve',  true, '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'pending_approval')::uuid, (v_s->>'rejected')::uuid,         'deny',     true, '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'pending_approval')::uuid, (v_s->>'draft')::uuid,            'amend',    true, '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'approved')::uuid,         (v_s->>'posted')::uuid,           'post',     true, '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'approved')::uuid,         (v_s->>'cancelled')::uuid,        'cancel',   true, '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'posted')::uuid,           (v_s->>'partially_paid')::uuid,   'pay',      true, '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'posted')::uuid,           (v_s->>'reversed')::uuid,         'reverse',  true, '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'partially_paid')::uuid,   (v_s->>'fully_paid')::uuid,       'pay',      true, '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'rejected')::uuid,         (v_s->>'draft')::uuid,            'amend',    true, '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, from_state_id, to_state_id) DO NOTHING;

-- ── 4. control.entity_lifecycle binding ──────────────────────────────────────
INSERT INTO control.entity_lifecycle
    (entity_name, lifecycle_id, tenant_id, conditions, priority, created_by)
VALUES
    ('purchase_invoice', v_lc_id, NULL, NULL, 100, '00000000-0000-0000-0000-000000000000')
ON CONFLICT (tenant_id, entity_name, lifecycle_id) DO NOTHING;

END $$;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/010_system/100_finance/200_document/003_invoice_workflow.sql
-- 100_finance/200_document/003_invoice_workflow.sql
-- Purpose: workflow_template + stages + rules + workflow_definition for Purchase Invoice
-- Routing: amount-based — standard single-stage for amounts < 50,000; two-stage for >= 50,000
-- Depends on: 001_invoice.sql
-- Idempotent: ON CONFLICT DO NOTHING throughout

DO $$ DECLARE
    v_tpl_std_id  uuid;
    v_tpl_hv_id   uuid;
BEGIN

-- ═══════════════════════════════════════════════════════════════════════════════
-- Template 1: Standard Invoice Approval (single stage — Department Manager)
-- ═══════════════════════════════════════════════════════════════════════════════

INSERT INTO control.workflow_template
    (tenant_id, code, name, description, version_no, is_active, behaviors, created_by)
VALUES
    (NULL, 'inv_std_approval',
     'Invoice — Standard Approval',
     'Single-stage approval by the department manager for standard value invoices.',
     1, true,
     '{"allow_self_approval":false,"require_all_stages":true,"allow_reassignment":true,"capture_entity_snapshot":true,"require_reason_on_reject":true,"notify_requester":true}'::jsonb,
     '00000000-0000-0000-0000-000000000000')
ON CONFLICT (tenant_id, code) DO NOTHING;

SELECT id INTO v_tpl_std_id FROM control.workflow_template
WHERE code = 'inv_std_approval' AND tenant_id IS NULL;

INSERT INTO control.workflow_template_stage
    (workflow_template_id, stage_no, name, mode, quorum, created_by)
VALUES
    (v_tpl_std_id, 1, 'Department Manager Approval', 'serial',
     '{"strategy":"unanimous"}'::jsonb,
     '00000000-0000-0000-0000-000000000000')
ON CONFLICT (workflow_template_id, stage_no) DO NOTHING;

INSERT INTO control.workflow_template_rule
    (workflow_template_id, stage_no, priority, conditions, assign_to, created_by)
VALUES
    (v_tpl_std_id, 1, 10, NULL,
     '{"type":"requester_manager","resolve_from":"principal_profile.supervisor_id"}'::jsonb,
     '00000000-0000-0000-0000-000000000000')
ON CONFLICT (workflow_template_id, stage_no, priority) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════════
-- Template 2: High-Value Invoice Approval (two stages)
--   Stage 1: Department Manager
--   Stage 2: Finance Controller (role-based)
-- ═══════════════════════════════════════════════════════════════════════════════

INSERT INTO control.workflow_template
    (tenant_id, code, name, description, version_no, is_active, behaviors, created_by)
VALUES
    (NULL, 'inv_hv_approval',
     'Invoice — High-Value Approval',
     'Two-stage approval for high-value invoices: department manager then finance controller.',
     1, true,
     '{"allow_self_approval":false,"require_all_stages":true,"allow_reassignment":true,"capture_entity_snapshot":true,"require_reason_on_reject":true,"notify_requester":true}'::jsonb,
     '00000000-0000-0000-0000-000000000000')
ON CONFLICT (tenant_id, code) DO NOTHING;

SELECT id INTO v_tpl_hv_id FROM control.workflow_template
WHERE code = 'inv_hv_approval' AND tenant_id IS NULL;

INSERT INTO control.workflow_template_stage
    (workflow_template_id, stage_no, name, mode, quorum, created_by)
VALUES
    (v_tpl_hv_id, 1, 'Department Manager Approval', 'serial',
     '{"strategy":"unanimous"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_tpl_hv_id, 2, 'Finance Controller Approval', 'serial',
     '{"strategy":"unanimous"}'::jsonb,
     '00000000-0000-0000-0000-000000000000')
ON CONFLICT (workflow_template_id, stage_no) DO NOTHING;

INSERT INTO control.workflow_template_rule
    (workflow_template_id, stage_no, priority, conditions, assign_to, created_by)
VALUES
    (v_tpl_hv_id, 1, 10, NULL,
     '{"type":"requester_manager","resolve_from":"principal_profile.supervisor_id"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_tpl_hv_id, 2, 10, NULL,
     '{"type":"role","role_code":"finance_controller"}'::jsonb,
     '00000000-0000-0000-0000-000000000000')
ON CONFLICT (workflow_template_id, stage_no, priority) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════════
-- Workflow Definition — routes by net_amount
-- ═══════════════════════════════════════════════════════════════════════════════

INSERT INTO control.workflow_definition
    (tenant_id, code, name, entity_type, rules, effective_from, is_active, created_by)
VALUES
    ('00000000-0000-0000-0000-000000000000'::uuid,
     'purchase_invoice_approval',
     'Purchase Invoice Approval',
     'purchase_invoice',
     '[
       {"condition":{"field":"net_amount","operator":"gte","value":50000},"template_code":"inv_hv_approval","workflow_type":"approval","priority":10},
       {"condition":null,"template_code":"inv_std_approval","workflow_type":"approval","priority":20}
     ]'::jsonb,
     now(), true,
     '00000000-0000-0000-0000-000000000000')
ON CONFLICT (tenant_id, code) DO NOTHING;

END $$;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/010_system/100_finance/200_document/004_purchase_order.sql
-- 100_finance/200_document/004_purchase_order.sql
-- Purpose: control.entity + entity_version + entity_field for Purchase Order
--          (document.purchase_order)
-- Module: BUY (Buying)
-- Depends on: LookupDomain/document/purchase_order.sql
--             (domain: document.purchase_order_status, document.purchase_order_type)
-- Idempotent: WHERE NOT EXISTS / ON CONFLICT DO NOTHING

-- ── 1. control.entity ────────────────────────────────────────────────────────
INSERT INTO control.entity (
    module_id, name, entity_short,
    entity_class, ownership_model, kind, backing_type,
    governance_level, security_tier, mutability,
    table_schema, table_name,
    label_singular, label_plural, icon_key, color_token,
    numbering_active, naming_policy, feature_flags,
    status, created_by)
SELECT
    (SELECT id FROM shared.module WHERE code = 'BUY'),
    'purchase_order', 'PO',
    'DOCUMENT', 'system', 'ent', 'table',
    'full', 'tenant_critical', 'controlled',
    'document', 'purchase_order',
    'Purchase Order', 'Purchase Orders', 'shopping-cart', 'orange',
    true,
    '{"prefix":"PO","prefix_configurable":true,"separator":"-","segments":[{"type":"year","format":"YYYY"},{"type":"sequence","padding":6}]}'::jsonb,
    '{"is_approvable":true,"document_category":"purchasing","allow_on_behalf_of":false,"has_line_items":true,"auto_number":true}'::jsonb,
    'ACTIVE', '00000000-0000-0000-0000-000000000000'
WHERE NOT EXISTS (
    SELECT 1 FROM control.entity
    WHERE table_schema = 'document' AND table_name = 'purchase_order'
      AND tenant_id IS NULL
);

-- ── 2. control.entity_version ────────────────────────────────────────────────
INSERT INTO control.entity_version (
    entity_id, tenant_id, version_no, status, effective_from, created_by)
SELECT e.id, NULL, 1, 'EFFECTIVE', now(),
       '00000000-0000-0000-0000-000000000000'
FROM   control.entity e
WHERE  e.table_schema = 'document' AND e.table_name = 'purchase_order'
  AND  e.tenant_id IS NULL
ON CONFLICT (entity_id, version_no) DO NOTHING;

-- ── 3. control.entity_field (13 fields) ──────────────────────────────────────
INSERT INTO control.entity_field (
    entity_version_id, name, column_name, label, data_type,
    cardinality, origin, enum_domain_code, is_required, is_filterable,
    validation, sort_order, created_by)
SELECT ev.id,
       f.name, f.column_name, f.label, f.data_type,
       f.cardinality, 'standard', f.enum_domain_code,
       f.is_required, f.is_filterable,
       f.validation, f.sort_order,
       '00000000-0000-0000-0000-000000000000'
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
CROSS JOIN (VALUES
    ('document_no',    'document_no',    'PO Number',         'text',    'one',         NULL::text,                              true,  true,  '{"max_length":50}'::jsonb,    10),
    ('order_type',     'order_type',     'Order Type',        'enum',    'one',         'document.purchase_order_type'::text,    true,  true,  NULL::jsonb,                   20),
    ('status',         'status',         'Status',            'enum',    'one',         'document.purchase_order_status'::text,  true,  true,  NULL::jsonb,                   30),
    ('supplier_id',    'supplier_id',    'Vendor',            'reference', 'one',         NULL::text,                              true,  true,  '{"ref_entity":"supplier"}'::jsonb, 40),
    ('order_date',     'order_date',     'Order Date',        'date',    'one',         NULL::text,                              true,  true,  NULL::jsonb,                   50),
    ('delivery_date',  'delivery_date',  'Expected Delivery', 'date',    'zero_or_one', NULL::text,                              false, true,  NULL::jsonb,                   60),
    ('currency_code',  'currency_code',  'Currency',          'text',    'one',         NULL::text,                              true,  true,  '{"max_length":3}'::jsonb,     70),
    ('total_amount',   'total_amount',   'Total Amount',      'decimal', 'one',         NULL::text,                              true,  false, '{"min":0}'::jsonb,            80),
    ('tax_amount',     'tax_amount',     'Tax Amount',        'decimal', 'zero_or_one', NULL::text,                              false, false, '{"min":0}'::jsonb,            90),
    ('payment_terms',  'payment_terms',  'Payment Terms',     'enum',    'zero_or_one', 'master.party_payment_terms'::text,      false, false, NULL::jsonb,                  100),
    ('delivery_site',  'delivery_site',  'Delivery Site',     'ref',     'zero_or_one', NULL::text,                              false, false, '{"ref_entity":"site"}'::jsonb, 110),
    ('buyer_id',       'buyer_id',       'Buyer',             'reference', 'zero_or_one', NULL::text,                              false, true,  '{"ref_entity":"principal"}'::jsonb, 120),
    ('notes',          'notes',          'Notes',             'text',    'zero_or_one', NULL::text,                              false, false, '{"max_length":1000}'::jsonb, 130)
) AS f(name, column_name, label, data_type, cardinality, enum_domain_code,
       is_required, is_filterable, validation, sort_order)
WHERE e.table_schema = 'document' AND e.table_name = 'purchase_order'
  AND e.tenant_id IS NULL AND ev.version_no = 1
ON CONFLICT DO NOTHING;

-- ── Fix origin for existing rows (idempotent) ─────────────────────────────────
UPDATE control.entity_field ef
SET origin = 'standard'
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
WHERE ef.entity_version_id = ev.id
  AND e.table_schema = 'document' AND e.table_name = 'purchase_order'
  AND e.tenant_id IS NULL AND ev.version_no = 1
  AND ef.origin = 'system';

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/010_system/100_finance/200_document/005_purchase_order_lifecycle.sql
-- 100_finance/200_document/005_purchase_order_lifecycle.sql
-- Purpose: control.lifecycle + 9 states + transitions + entity_lifecycle binding
--          for Purchase Order (document.purchase_order)
-- Depends on: 004_purchase_order.sql
-- Idempotent: ON CONFLICT DO NOTHING throughout

DO $$ DECLARE
    v_lc_id  uuid;
    v_s      jsonb;  -- state id map  { state_code: uuid }
BEGIN

-- ── 1. control.lifecycle ─────────────────────────────────────────────────────
INSERT INTO control.lifecycle (tenant_id, code, name, version_no, is_active, config, created_by)
VALUES (NULL, 'purchase_order', 'Purchase Order Lifecycle', 1, true,
    '{"initial_state_code":"draft","allow_parallel_instances":false,"icon_key":"shopping-cart","ui_color":"#EA580C","entity_types":["purchase_order"]}'::jsonb,
    '00000000-0000-0000-0000-000000000000')
ON CONFLICT (tenant_id, code) DO NOTHING;

SELECT id INTO v_lc_id FROM control.lifecycle WHERE code = 'purchase_order' AND tenant_id IS NULL;

-- ── 2. control.lifecycle_state (9 states) ────────────────────────────────────
INSERT INTO control.lifecycle_state
    (lifecycle_id, tenant_id, code, name, is_initial, is_terminal, sort_order, config, created_by)
VALUES
    (v_lc_id, NULL, 'draft',              'Draft',              true,  false, 10, '{"ui_color":"#888888","icon_key":"pencil"}'::jsonb,        '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'pending_approval',   'Pending Approval',   false, false, 20, '{"ui_color":"#7B61FF","icon_key":"clock","sla_minutes":1440}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'approved',           'Approved',           false, false, 30, '{"ui_color":"#0F6CBD","icon_key":"check-circle"}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'sent_to_vendor',     'Sent to Vendor',     false, false, 40, '{"ui_color":"#0891B2","icon_key":"send"}'::jsonb,          '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'partially_received', 'Partially Received', false, false, 50, '{"ui_color":"#E8A020","icon_key":"package-open"}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'fully_received',     'Fully Received',     false, false, 60, '{"ui_color":"#217346","icon_key":"package-check"}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'closed',             'Closed',             false, true,  70, '{"ui_color":"#217346","icon_key":"lock"}'::jsonb,          '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'rejected',           'Rejected',           false, true,  80, '{"ui_color":"#C00000","icon_key":"x-circle"}'::jsonb,     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'cancelled',          'Cancelled',          false, true,  90, '{"ui_color":"#666666","icon_key":"ban"}'::jsonb,           '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, code) DO NOTHING;

-- Build state id map
SELECT jsonb_object_agg(code, id) INTO v_s
FROM control.lifecycle_state WHERE lifecycle_id = v_lc_id;

-- ── 3. control.lifecycle_transition ──────────────────────────────────────────
INSERT INTO control.lifecycle_transition
    (lifecycle_id, tenant_id, from_state_id, to_state_id, operation_code, is_active, config, created_by)
VALUES
    (v_lc_id, NULL, (v_s->>'draft')::uuid,              (v_s->>'pending_approval')::uuid,   'submit',       true, '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'draft')::uuid,              (v_s->>'cancelled')::uuid,          'cancel',       true, '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'pending_approval')::uuid,   (v_s->>'approved')::uuid,           'approve',      true, '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'pending_approval')::uuid,   (v_s->>'rejected')::uuid,           'deny',         true, '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'pending_approval')::uuid,   (v_s->>'draft')::uuid,              'amend',        true, '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'approved')::uuid,           (v_s->>'sent_to_vendor')::uuid,     'send',         true, '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'approved')::uuid,           (v_s->>'cancelled')::uuid,          'cancel',       true, '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'sent_to_vendor')::uuid,     (v_s->>'partially_received')::uuid, 'receive',      true, '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'partially_received')::uuid, (v_s->>'fully_received')::uuid,     'receive',      true, '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'fully_received')::uuid,     (v_s->>'closed')::uuid,             'close',        true, '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'partially_received')::uuid, (v_s->>'closed')::uuid,             'close',        true, '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'rejected')::uuid,           (v_s->>'draft')::uuid,              'amend',        true, '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, from_state_id, to_state_id) DO NOTHING;

-- ── 4. control.entity_lifecycle binding ──────────────────────────────────────
INSERT INTO control.entity_lifecycle
    (entity_name, lifecycle_id, tenant_id, conditions, priority, created_by)
VALUES
    ('purchase_order', v_lc_id, NULL, NULL, 100, '00000000-0000-0000-0000-000000000000')
ON CONFLICT (tenant_id, entity_name, lifecycle_id) DO NOTHING;

END $$;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/010_system/100_finance/200_document/006_purchase_order_workflow.sql
-- 100_finance/200_document/006_purchase_order_workflow.sql
-- Purpose: workflow_template + stages + rules + workflow_definition for Purchase Order
-- Routing: amount-based — standard single-stage (dept manager) for < 100,000;
--          two-stage (dept manager + procurement manager) for >= 100,000
-- Depends on: 004_purchase_order.sql
-- Idempotent: ON CONFLICT DO NOTHING throughout

DO $$ DECLARE
    v_tpl_std_id  uuid;
    v_tpl_hv_id   uuid;
BEGIN

-- ═══════════════════════════════════════════════════════════════════════════════
-- Template 1: Standard PO Approval (single stage — Department Manager)
-- ═══════════════════════════════════════════════════════════════════════════════

INSERT INTO control.workflow_template
    (tenant_id, code, name, description, version_no, is_active, behaviors, created_by)
VALUES
    (NULL, 'po_std_approval',
     'Purchase Order — Standard Approval',
     'Single-stage approval by the department manager for standard value purchase orders.',
     1, true,
     '{"allow_self_approval":false,"require_all_stages":true,"allow_reassignment":true,"capture_entity_snapshot":true,"require_reason_on_reject":true,"notify_requester":true}'::jsonb,
     '00000000-0000-0000-0000-000000000000')
ON CONFLICT (tenant_id, code) DO NOTHING;

SELECT id INTO v_tpl_std_id FROM control.workflow_template
WHERE code = 'po_std_approval' AND tenant_id IS NULL;

INSERT INTO control.workflow_template_stage
    (workflow_template_id, stage_no, name, mode, quorum, created_by)
VALUES
    (v_tpl_std_id, 1, 'Department Manager Approval', 'serial',
     '{"strategy":"unanimous"}'::jsonb,
     '00000000-0000-0000-0000-000000000000')
ON CONFLICT (workflow_template_id, stage_no) DO NOTHING;

INSERT INTO control.workflow_template_rule
    (workflow_template_id, stage_no, priority, conditions, assign_to, created_by)
VALUES
    (v_tpl_std_id, 1, 10, NULL,
     '{"type":"requester_manager","resolve_from":"principal_profile.supervisor_id"}'::jsonb,
     '00000000-0000-0000-0000-000000000000')
ON CONFLICT (workflow_template_id, stage_no, priority) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════════
-- Template 2: High-Value PO Approval (two stages)
--   Stage 1: Department Manager
--   Stage 2: Procurement Manager (role-based)
-- ═══════════════════════════════════════════════════════════════════════════════

INSERT INTO control.workflow_template
    (tenant_id, code, name, description, version_no, is_active, behaviors, created_by)
VALUES
    (NULL, 'po_hv_approval',
     'Purchase Order — High-Value Approval',
     'Two-stage approval for high-value POs: department manager then procurement manager.',
     1, true,
     '{"allow_self_approval":false,"require_all_stages":true,"allow_reassignment":true,"capture_entity_snapshot":true,"require_reason_on_reject":true,"notify_requester":true}'::jsonb,
     '00000000-0000-0000-0000-000000000000')
ON CONFLICT (tenant_id, code) DO NOTHING;

SELECT id INTO v_tpl_hv_id FROM control.workflow_template
WHERE code = 'po_hv_approval' AND tenant_id IS NULL;

INSERT INTO control.workflow_template_stage
    (workflow_template_id, stage_no, name, mode, quorum, created_by)
VALUES
    (v_tpl_hv_id, 1, 'Department Manager Approval', 'serial',
     '{"strategy":"unanimous"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_tpl_hv_id, 2, 'Procurement Manager Approval', 'serial',
     '{"strategy":"unanimous"}'::jsonb,
     '00000000-0000-0000-0000-000000000000')
ON CONFLICT (workflow_template_id, stage_no) DO NOTHING;

INSERT INTO control.workflow_template_rule
    (workflow_template_id, stage_no, priority, conditions, assign_to, created_by)
VALUES
    (v_tpl_hv_id, 1, 10, NULL,
     '{"type":"requester_manager","resolve_from":"principal_profile.supervisor_id"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_tpl_hv_id, 2, 10, NULL,
     '{"type":"role","role_code":"procurement_manager"}'::jsonb,
     '00000000-0000-0000-0000-000000000000')
ON CONFLICT (workflow_template_id, stage_no, priority) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════════
-- Workflow Definition — routes by total_amount
-- ═══════════════════════════════════════════════════════════════════════════════

INSERT INTO control.workflow_definition
    (tenant_id, code, name, entity_type, rules, effective_from, is_active, created_by)
VALUES
    ('00000000-0000-0000-0000-000000000000'::uuid,
     'purchase_order_approval',
     'Purchase Order Approval',
     'purchase_order',
     '[
       {"condition":{"field":"total_amount","operator":"gte","value":100000},"template_code":"po_hv_approval","workflow_type":"approval","priority":10},
       {"condition":null,"template_code":"po_std_approval","workflow_type":"approval","priority":20}
     ]'::jsonb,
     now(), true,
     '00000000-0000-0000-0000-000000000000')
ON CONFLICT (tenant_id, code) DO NOTHING;

END $$;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/010_system/100_finance/200_document/007_journal_entry.sql
-- 100_finance/200_document/007_journal_entry.sql
-- Purpose: control.entity + entity_version + entity_field for Journal Entry
--          (document.journal_entry)
-- Module: ACC (Finance Core Accounting)
-- Depends on: LookupDomain/document/journal_entry_status.sql,
--             LookupDomain/document/purchase_order.sql (je_status approval extensions)
-- Idempotent: WHERE NOT EXISTS / ON CONFLICT DO NOTHING

-- ── 1. control.entity ────────────────────────────────────────────────────────
INSERT INTO control.entity (
    module_id, name, entity_short,
    entity_class, ownership_model, kind, backing_type,
    governance_level, security_tier, mutability,
    table_schema, table_name,
    label_singular, label_plural, icon_key, color_token,
    numbering_active, naming_policy, feature_flags,
    status, created_by)
SELECT
    (SELECT id FROM shared.module WHERE code = 'ACC'),
    'journal_entry', 'JE',
    'DOCUMENT', 'system', 'ent', 'table',
    'full', 'tenant_critical', 'controlled',
    'document', 'journal_entry',
    'Journal Entry', 'Journal Entries', 'book-open', 'slate',
    true,
    '{"prefix":"JE","prefix_configurable":true,"separator":"-","segments":[{"type":"year","format":"YYYY"},{"type":"sequence","padding":6}]}'::jsonb,
    '{"is_approvable":true,"document_category":"general_ledger","allow_on_behalf_of":false,"has_line_items":true,"auto_number":true}'::jsonb,
    'ACTIVE', '00000000-0000-0000-0000-000000000000'
WHERE NOT EXISTS (
    SELECT 1 FROM control.entity
    WHERE table_schema = 'document' AND table_name = 'journal_entry'
      AND tenant_id IS NULL
);

-- ── 2. control.entity_version ────────────────────────────────────────────────
INSERT INTO control.entity_version (
    entity_id, tenant_id, version_no, status, effective_from, created_by)
SELECT e.id, NULL, 1, 'EFFECTIVE', now(),
       '00000000-0000-0000-0000-000000000000'
FROM   control.entity e
WHERE  e.table_schema = 'document' AND e.table_name = 'journal_entry'
  AND  e.tenant_id IS NULL
ON CONFLICT (entity_id, version_no) DO NOTHING;

-- ── 3. control.entity_field (9 fields) ───────────────────────────────────────
INSERT INTO control.entity_field (
    entity_version_id, name, column_name, label, data_type,
    cardinality, origin, enum_domain_code, is_required, is_filterable, is_searchable,
    validation, sort_order, created_by)
SELECT ev.id,
       f.name, f.column_name, f.label, f.data_type,
       f.cardinality, 'standard', f.enum_domain_code,
       f.is_required, f.is_filterable, f.is_searchable,
       f.validation, f.sort_order,
       '00000000-0000-0000-0000-000000000000'
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
CROSS JOIN (VALUES
    ('document_no',   'je_number',             'JE Number',       'text',    'one',         NULL::text,                                 true,  true,  true,  '{"max_length":50}'::jsonb,    10),
    ('status',        'status',                'Status',          'enum',    'one',         'document.journal_entry_status'::text,      true,  true,  false, NULL::jsonb,                   20),
    ('entry_date',    'posting_date',          'Entry Date',      'date',    'one',         NULL::text,                                 true,  true,  false, NULL::jsonb,                   30),
    ('fiscal_period', 'period_number',         'Fiscal Period',   'integer', 'zero_or_one', NULL::text,                                 false, true,  false, NULL::jsonb,                   40),
    ('currency_code', 'transaction_currency',  'Currency',        'text',    'one',         NULL::text,                                 true,  true,  false, '{"max_length":3}'::jsonb,     50),
    ('total_debit',   'total_debit',           'Total Debit',     'decimal', 'one',         NULL::text,                                 true,  false, false, '{"min":0}'::jsonb,            60),
    ('total_credit',  'total_credit',          'Total Credit',    'decimal', 'one',         NULL::text,                                 true,  false, false, '{"min":0}'::jsonb,            70),
    ('source_type',   'source_doc_type',       'Source Type',     'enum',    'zero_or_one', 'document.je_source_doc_type'::text,        false, true,  false, NULL::jsonb,                   80),
    ('description',   'description',           'Description',     'text',    'zero_or_one', NULL::text,                                 false, false, true,  '{"max_length":500}'::jsonb,   90)
) AS f(name, column_name, label, data_type, cardinality, enum_domain_code,
       is_required, is_filterable, is_searchable, validation, sort_order)
WHERE e.table_schema = 'document' AND e.table_name = 'journal_entry'
  AND e.tenant_id IS NULL AND ev.version_no = 1
ON CONFLICT DO NOTHING;

-- ── Fix origin for existing rows (idempotent) ─────────────────────────────────
UPDATE control.entity_field ef
SET origin = 'standard'
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
WHERE ef.entity_version_id = ev.id
  AND e.table_schema = 'document' AND e.table_name = 'journal_entry'
  AND e.tenant_id IS NULL AND ev.version_no = 1
  AND ef.origin = 'system';

-- ── Enable full-text search on key text fields (idempotent) ──────────────────
-- document_no (JE Number) and description are the natural free-text search
-- targets. Without is_searchable = true the records API ?q= param is silently
-- ignored because the ILIKE guard never fires.
UPDATE control.entity_field ef
SET is_searchable = true
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
WHERE ef.entity_version_id = ev.id
  AND e.table_schema = 'document' AND e.table_name = 'journal_entry'
  AND e.tenant_id IS NULL AND ev.version_no = 1
  AND ef.name IN ('document_no', 'description');

-- ── Fix column_name mismatches for existing rows (idempotent) ─────────────────
-- The INSERT above used wrong column names that don't exist in document.journal_entry.
-- This UPDATE corrects them so the records route can SELECT the actual table columns.
UPDATE control.entity_field ef
SET column_name = CASE ef.name
    WHEN 'document_no'   THEN 'je_number'
    WHEN 'entry_date'    THEN 'posting_date'
    WHEN 'fiscal_period' THEN 'period_number'
    WHEN 'currency_code' THEN 'transaction_currency'
    WHEN 'source_type'   THEN 'source_doc_type'
    ELSE ef.column_name
END,
    data_type = CASE ef.name
    WHEN 'fiscal_period' THEN 'integer'
    ELSE ef.data_type
END
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
WHERE ef.entity_version_id = ev.id
  AND e.table_schema = 'document' AND e.table_name = 'journal_entry'
  AND e.tenant_id IS NULL AND ev.version_no = 1
  AND ef.name IN ('document_no', 'entry_date', 'fiscal_period', 'currency_code', 'source_type');

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/010_system/100_finance/200_document/008_journal_entry_lifecycle.sql
-- 100_finance/200_document/008_journal_entry_lifecycle.sql
-- Purpose: control.lifecycle + 6 states + transitions + entity_lifecycle binding
--          for Journal Entry (document.journal_entry)
-- Depends on: 007_journal_entry.sql
-- Idempotent: ON CONFLICT DO NOTHING throughout

DO $$ DECLARE
    v_lc_id  uuid;
    v_s      jsonb;  -- state id map  { state_code: uuid }
BEGIN

-- ── 1. control.lifecycle ─────────────────────────────────────────────────────
INSERT INTO control.lifecycle (tenant_id, code, name, version_no, is_active, config, created_by)
VALUES (NULL, 'journal_entry', 'Journal Entry Lifecycle', 1, true,
    '{"initial_state_code":"draft","allow_parallel_instances":false,"icon_key":"book-open","ui_color":"#475569","entity_types":["journal_entry"]}'::jsonb,
    '00000000-0000-0000-0000-000000000000')
ON CONFLICT (tenant_id, code) DO NOTHING;

SELECT id INTO v_lc_id FROM control.lifecycle WHERE code = 'journal_entry' AND tenant_id IS NULL;

-- ── 2. control.lifecycle_state (6 states) ────────────────────────────────────
INSERT INTO control.lifecycle_state
    (lifecycle_id, tenant_id, code, name, is_initial, is_terminal, sort_order, config, created_by)
VALUES
    (v_lc_id, NULL, 'draft',          'Draft',          true,  false, 10, '{"ui_color":"#888888","icon_key":"pencil"}'::jsonb,                                      '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'pending_review', 'Pending Review', false, false, 20, '{"ui_color":"#7B61FF","icon_key":"clock","sla_minutes":1440}'::jsonb,                    '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'approved',       'Approved',       false, false, 30, '{"ui_color":"#0F6CBD","icon_key":"check-circle"}'::jsonb,                                '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'posted',         'Posted',         false, true,  40, '{"ui_color":"#217346","icon_key":"check-double"}'::jsonb,                                '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'reversed',       'Reversed',       false, true,  50, '{"ui_color":"#E8A020","icon_key":"rotate-ccw"}'::jsonb,                                 '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'rejected',       'Rejected',       false, true,  60, '{"ui_color":"#C00000","icon_key":"x-circle"}'::jsonb,                                   '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, code) DO NOTHING;

-- Build state id map
SELECT jsonb_object_agg(code, id) INTO v_s
FROM control.lifecycle_state WHERE lifecycle_id = v_lc_id;

-- ── 3. control.lifecycle_transition ──────────────────────────────────────────
INSERT INTO control.lifecycle_transition
    (lifecycle_id, tenant_id, from_state_id, to_state_id, operation_code, is_active, config, created_by)
VALUES
    (v_lc_id, NULL, (v_s->>'draft')::uuid,          (v_s->>'pending_review')::uuid, 'submit',  true, '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'pending_review')::uuid, (v_s->>'approved')::uuid,       'approve', true, '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'pending_review')::uuid, (v_s->>'rejected')::uuid,       'deny',    true, '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'pending_review')::uuid, (v_s->>'draft')::uuid,          'amend',   true, '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'approved')::uuid,       (v_s->>'posted')::uuid,         'post',    true, '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'posted')::uuid,         (v_s->>'reversed')::uuid,       'reverse', true, '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'rejected')::uuid,       (v_s->>'draft')::uuid,          'amend',   true, '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, from_state_id, to_state_id) DO NOTHING;

-- ── 4. control.entity_lifecycle binding ──────────────────────────────────────
INSERT INTO control.entity_lifecycle
    (entity_name, lifecycle_id, tenant_id, conditions, priority, created_by)
VALUES
    ('journal_entry', v_lc_id, NULL, NULL, 100, '00000000-0000-0000-0000-000000000000')
ON CONFLICT (tenant_id, entity_name, lifecycle_id) DO NOTHING;

END $$;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/010_system/100_finance/200_document/009_journal_entry_workflow.sql
-- 100_finance/200_document/009_journal_entry_workflow.sql
-- Purpose: workflow_template + stage + rule + workflow_definition for Journal Entry
-- Routing: single-stage Accounting Manager review for all entries
-- Depends on: 007_journal_entry.sql
-- Idempotent: ON CONFLICT DO NOTHING throughout

DO $$ DECLARE
    v_tpl_id  uuid;
BEGIN

-- ═══════════════════════════════════════════════════════════════════════════════
-- Template: Journal Entry Review (single stage — Accounting Manager)
-- ═══════════════════════════════════════════════════════════════════════════════

INSERT INTO control.workflow_template
    (tenant_id, code, name, description, version_no, is_active, behaviors, created_by)
VALUES
    (NULL, 'je_acct_review',
     'Journal Entry — Accounting Manager Review',
     'Single-stage review and approval by the accounting manager before posting.',
     1, true,
     '{"allow_self_approval":false,"require_all_stages":true,"allow_reassignment":true,"capture_entity_snapshot":true,"require_reason_on_reject":true,"notify_requester":true}'::jsonb,
     '00000000-0000-0000-0000-000000000000')
ON CONFLICT (tenant_id, code) DO NOTHING;

SELECT id INTO v_tpl_id FROM control.workflow_template
WHERE code = 'je_acct_review' AND tenant_id IS NULL;

INSERT INTO control.workflow_template_stage
    (workflow_template_id, stage_no, name, mode, quorum, created_by)
VALUES
    (v_tpl_id, 1, 'Accounting Manager Review', 'serial',
     '{"strategy":"unanimous"}'::jsonb,
     '00000000-0000-0000-0000-000000000000')
ON CONFLICT (workflow_template_id, stage_no) DO NOTHING;

INSERT INTO control.workflow_template_rule
    (workflow_template_id, stage_no, priority, conditions, assign_to, created_by)
VALUES
    (v_tpl_id, 1, 10, NULL,
     '{"type":"role","role_code":"accounting_manager"}'::jsonb,
     '00000000-0000-0000-0000-000000000000')
ON CONFLICT (workflow_template_id, stage_no, priority) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════════
-- Workflow Definition
-- ═══════════════════════════════════════════════════════════════════════════════

INSERT INTO control.workflow_definition
    (tenant_id, code, name, entity_type, rules, effective_from, is_active, created_by)
VALUES
    ('00000000-0000-0000-0000-000000000000'::uuid,
     'journal_entry_review',
     'Journal Entry Review',
     'journal_entry',
     '[{"condition":null,"template_code":"je_acct_review","workflow_type":"approval","priority":10}]'::jsonb,
     now(), true,
     '00000000-0000-0000-0000-000000000000')
ON CONFLICT (tenant_id, code) DO NOTHING;

END $$;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/010_system/100_finance/200_document/010_payment_entry.sql
-- 100_finance/200_document/010_payment_entry.sql
-- Purpose: control.entity + entity_version + entity_field for Payment Entry
--          (document.payment_entry)
-- Module: ACC (Finance Core Accounting)
-- Depends on: LookupDomain/document/payment_entry_status.sql
-- Idempotent: WHERE NOT EXISTS / ON CONFLICT DO NOTHING

-- ── 1. control.entity ────────────────────────────────────────────────────────
INSERT INTO control.entity (
    module_id, name, entity_short,
    entity_class, ownership_model, kind, backing_type,
    governance_level, security_tier, mutability,
    table_schema, table_name,
    label_singular, label_plural, icon_key, color_token,
    numbering_active, naming_policy, feature_flags,
    status, created_by)
SELECT
    (SELECT id FROM shared.module WHERE code = 'ACC'),
    'payment_entry', 'PAY',
    'DOCUMENT', 'system', 'ent', 'table',
    'full', 'tenant_critical', 'controlled',
    'document', 'payment_entry',
    'Payment Entry', 'Payment Entries', 'banknote', 'emerald',
    true,
    '{"prefix":"PAY","prefix_configurable":true,"separator":"-","segments":[{"type":"year","format":"YYYY"},{"type":"sequence","padding":6}]}'::jsonb,
    '{"is_approvable":true,"document_category":"payments","allow_on_behalf_of":false,"has_line_items":true,"auto_number":true}'::jsonb,
    'ACTIVE', '00000000-0000-0000-0000-000000000000'
WHERE NOT EXISTS (
    SELECT 1 FROM control.entity
    WHERE table_schema = 'document' AND table_name = 'payment_entry'
      AND tenant_id IS NULL
);

-- ── 2. control.entity_version ────────────────────────────────────────────────
INSERT INTO control.entity_version (
    entity_id, tenant_id, version_no, status, effective_from, created_by)
SELECT e.id, NULL, 1, 'EFFECTIVE', now(),
       '00000000-0000-0000-0000-000000000000'
FROM   control.entity e
WHERE  e.table_schema = 'document' AND e.table_name = 'payment_entry'
  AND  e.tenant_id IS NULL
ON CONFLICT (entity_id, version_no) DO NOTHING;

-- ── 3. control.entity_field (12 fields) ──────────────────────────────────────
INSERT INTO control.entity_field (
    entity_version_id, name, column_name, label, data_type,
    cardinality, origin, enum_domain_code, is_required, is_filterable,
    validation, sort_order, created_by)
SELECT ev.id,
       f.name, f.column_name, f.label, f.data_type,
       f.cardinality, 'standard', f.enum_domain_code,
       f.is_required, f.is_filterable,
       f.validation, f.sort_order,
       '00000000-0000-0000-0000-000000000000'
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
CROSS JOIN (VALUES
    ('document_no',       'payment_number',   'Payment No.',       'text',      'one',         NULL::text,                                true,  true,  '{"max_length":50}'::jsonb,                10),
    ('status',            'status',           'Status',            'enum',      'one',         'document.payment_entry_status'::text,     true,  true,  NULL::jsonb,                               20),
    ('payment_type',      'payment_type',     'Payment Type',      'text',      'one',         NULL::text,                                true,  true,  NULL::jsonb,                               30),
    ('payment_direction', 'payment_direction','Direction',         'text',      'one',         NULL::text,                                true,  true,  NULL::jsonb,                               40),
    ('supplier_id',       'supplier_id',      'Vendor',            'reference', 'zero_or_one', NULL::text,                                false, true,  '{"ref_entity":"vendor"}'::jsonb,          50),
    ('document_date',     'document_date',    'Payment Date',      'date',      'one',         NULL::text,                                true,  true,  NULL::jsonb,                               60),
    ('posting_date',      'posting_date',     'Posting Date',      'date',      'one',         NULL::text,                                true,  true,  NULL::jsonb,                               70),
    ('value_date',        'value_date',       'Value Date',        'date',      'one',         NULL::text,                                true,  false, NULL::jsonb,                               80),
    ('currency_code',     'currency_code',    'Currency',          'text',      'one',         NULL::text,                                true,  true,  '{"max_length":3}'::jsonb,                 90),
    ('payment_amount',    'payment_amount',   'Payment Amount',    'decimal',   'one',         NULL::text,                                true,  false, '{"min":0}'::jsonb,                       100),
    ('payment_reference', 'payment_reference','Payment Reference', 'text',      'zero_or_one', NULL::text,                                false, false, '{"max_length":200}'::jsonb,              110),
    ('notes',             'notes',            'Notes',             'text',      'zero_or_one', NULL::text,                                false, false, '{"max_length":1000}'::jsonb,             120)
) AS f(name, column_name, label, data_type, cardinality, enum_domain_code,
       is_required, is_filterable, validation, sort_order)
WHERE e.table_schema = 'document' AND e.table_name = 'payment_entry'
  AND e.tenant_id IS NULL AND ev.version_no = 1
ON CONFLICT DO NOTHING;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/010_system/100_finance/200_document/011_payment_entry_lifecycle.sql
-- 100_finance/200_document/011_payment_entry_lifecycle.sql
-- Purpose: control.lifecycle + states + transitions + entity_lifecycle binding
--          for Payment Entry (document.payment_entry)
-- Depends on: 010_payment_entry.sql
-- Idempotent: ON CONFLICT DO NOTHING throughout

DO $$ DECLARE
    v_lc_id  uuid;
    v_s      jsonb;  -- state id map  { state_code: uuid }
BEGIN

-- ── 1. control.lifecycle ─────────────────────────────────────────────────────
INSERT INTO control.lifecycle (tenant_id, code, name, version_no, is_active, config, created_by)
VALUES (NULL, 'payment_entry', 'Payment Entry Lifecycle', 1, true,
    '{"initial_state_code":"draft","allow_parallel_instances":false,"icon_key":"banknote","ui_color":"#059669","entity_types":["payment_entry"]}'::jsonb,
    '00000000-0000-0000-0000-000000000000')
ON CONFLICT (tenant_id, code) DO NOTHING;

SELECT id INTO v_lc_id FROM control.lifecycle WHERE code = 'payment_entry' AND tenant_id IS NULL;

-- ── 2. control.lifecycle_state (11 states) ───────────────────────────────────
INSERT INTO control.lifecycle_state
    (lifecycle_id, tenant_id, code, name, is_initial, is_terminal, sort_order, config, created_by)
VALUES
    (v_lc_id, NULL, 'draft',            'Draft',            true,  false,  10, '{"ui_color":"#888888","icon_key":"pencil"}'::jsonb,                              '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'pending_approval', 'Pending Approval', false, false,  20, '{"ui_color":"#7B61FF","icon_key":"clock","sla_minutes":1440}'::jsonb,            '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'approved',         'Approved',         false, false,  30, '{"ui_color":"#0F6CBD","icon_key":"check-circle"}'::jsonb,                        '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'posted',           'Posted',           false, false,  40, '{"ui_color":"#217346","icon_key":"check-double"}'::jsonb,                        '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'transmitted',      'Transmitted',      false, false,  50, '{"ui_color":"#0284C7","icon_key":"send"}'::jsonb,                                '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'printed',          'Printed',          false, false,  60, '{"ui_color":"#0284C7","icon_key":"printer"}'::jsonb,                             '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'cleared',          'Cleared',          false, true,   70, '{"ui_color":"#217346","icon_key":"circle-check"}'::jsonb,                        '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'reversed',         'Reversed',         false, true,   80, '{"ui_color":"#E8A020","icon_key":"rotate-ccw"}'::jsonb,                         '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'voided',           'Voided',           false, true,   90, '{"ui_color":"#6B7280","icon_key":"slash"}'::jsonb,                               '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'cancelled',        'Cancelled',        false, true,  100, '{"ui_color":"#666666","icon_key":"ban"}'::jsonb,                                 '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'rejected',         'Rejected',         false, true,  110, '{"ui_color":"#C00000","icon_key":"x-circle"}'::jsonb,                            '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, code) DO NOTHING;

-- Build state id map
SELECT jsonb_object_agg(code, id) INTO v_s
FROM control.lifecycle_state WHERE lifecycle_id = v_lc_id;

-- ── 3. control.lifecycle_transition ──────────────────────────────────────────
INSERT INTO control.lifecycle_transition
    (lifecycle_id, tenant_id, from_state_id, to_state_id, operation_code, is_active, config, created_by)
VALUES
    -- Submission flow
    (v_lc_id, NULL, (v_s->>'draft')::uuid,            (v_s->>'pending_approval')::uuid, 'submit',    true, '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'draft')::uuid,            (v_s->>'cancelled')::uuid,        'cancel',    true, '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    -- Approval flow
    (v_lc_id, NULL, (v_s->>'pending_approval')::uuid, (v_s->>'approved')::uuid,         'approve',   true, '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'pending_approval')::uuid, (v_s->>'rejected')::uuid,         'deny',      true, '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'pending_approval')::uuid, (v_s->>'draft')::uuid,            'amend',     true, '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'approved')::uuid,         (v_s->>'cancelled')::uuid,        'cancel',    true, '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    -- Posting
    (v_lc_id, NULL, (v_s->>'approved')::uuid,         (v_s->>'posted')::uuid,           'post',      true, '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    -- Post-posting
    (v_lc_id, NULL, (v_s->>'posted')::uuid,           (v_s->>'transmitted')::uuid,      'transmit',  true, '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'posted')::uuid,           (v_s->>'printed')::uuid,          'print',     true, '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'posted')::uuid,           (v_s->>'reversed')::uuid,         'reverse',   true, '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'posted')::uuid,           (v_s->>'voided')::uuid,           'void',      true, '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    -- Clearance
    (v_lc_id, NULL, (v_s->>'transmitted')::uuid,      (v_s->>'cleared')::uuid,          'clear',     true, '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'printed')::uuid,          (v_s->>'cleared')::uuid,          'clear',     true, '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    -- Re-draft from rejected
    (v_lc_id, NULL, (v_s->>'rejected')::uuid,         (v_s->>'draft')::uuid,            'amend',     true, '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, from_state_id, to_state_id) DO NOTHING;

-- ── 4. control.entity_lifecycle binding ──────────────────────────────────────
INSERT INTO control.entity_lifecycle
    (entity_name, lifecycle_id, tenant_id, conditions, priority, created_by)
VALUES
    ('payment_entry', v_lc_id, NULL, NULL, 100, '00000000-0000-0000-0000-000000000000')
ON CONFLICT (tenant_id, entity_name, lifecycle_id) DO NOTHING;

END $$;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/010_system/100_finance/900_operations/001_fin_operations.sql
-- 100_finance/900_operations/001_fin_operations.sql
-- Purpose: control.entity_operation registrations for all 6 finance entities
--          Vendor, Customer, Invoice, Purchase Order, Journal Entry, Payment Entry
-- Depends on: 100_master/001_vendor.sql, 003_customer.sql
--             200_document/001_invoice.sql, 004_purchase_order.sql, 007_journal_entry.sql,
--             200_document/010_payment_entry.sql
-- Idempotent: ON CONFLICT (tenant_id, entity_name, permission_code) DO NOTHING

-- ══════════════════════════════════════════════════════════════════════════════
-- Vendor operations
-- permission_codes must reference shared.permission.code
-- Master lifecycle actions map to: cancel (deactivate/block), close (archive)
-- ══════════════════════════════════════════════════════════════════════════════

-- Idempotency: migrate any rows previously inserted under 'supplier'
UPDATE control.entity_operation SET entity_name = 'vendor'
WHERE entity_name = 'supplier' AND tenant_id IS NULL;

INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
VALUES
    (NULL, 'vendor', 'create',  'LIST',   'PRIMARY',  'NAVIGATE', '/master/vendor/new',       false, 10, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'vendor', 'update',  'DETAIL', 'PRIMARY',  'NAVIGATE', '/master/vendor/{id}/edit', true,  20, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'vendor', 'cancel',  'DETAIL', 'OVERFLOW', 'MODAL',    'deactivate',               true,  30, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'vendor', 'close',   'DETAIL', 'OVERFLOW', 'MODAL',    'archive',                  true,  40, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'vendor', 'export',  'LIST',   'TOOLBAR',  'API',      'export',                   false, 50, '00000000-0000-0000-0000-000000000000')
ON CONFLICT (tenant_id, entity_name, permission_code) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- Customer operations
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
VALUES
    (NULL, 'customer', 'create',  'LIST',   'PRIMARY',  'NAVIGATE', '/master/customer/new',       false, 10, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'customer', 'update',  'DETAIL', 'PRIMARY',  'NAVIGATE', '/master/customer/{id}/edit', true,  20, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'customer', 'cancel',  'DETAIL', 'OVERFLOW', 'MODAL',    'deactivate',                 true,  30, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'customer', 'close',   'DETAIL', 'OVERFLOW', 'MODAL',    'archive',                    true,  40, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'customer', 'export',  'LIST',   'TOOLBAR',  'API',      'export',                     false, 50, '00000000-0000-0000-0000-000000000000')
ON CONFLICT (tenant_id, entity_name, permission_code) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- Purchase Invoice operations
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
VALUES
    (NULL, 'purchase_invoice', 'create',   'LIST',   'PRIMARY',  'NAVIGATE', '/document/purchase_invoice/new',       false, 10, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'purchase_invoice', 'update',   'DETAIL', 'PRIMARY',  'NAVIGATE', '/document/purchase_invoice/{id}/edit', true,  20, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'purchase_invoice', 'submit',   'DETAIL', 'PRIMARY',  'MODAL',    'submit',                               true,  30, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'purchase_invoice', 'approve',  'DETAIL', 'PRIMARY',  'MODAL',    'approve',                              true,  40, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'purchase_invoice', 'deny',     'DETAIL', 'TOOLBAR',  'MODAL',    'deny',                                 true,  50, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'purchase_invoice', 'post',     'DETAIL', 'TOOLBAR',  'MODAL',    'post',                                 true,  60, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'purchase_invoice', 'cancel',   'DETAIL', 'OVERFLOW', 'MODAL',    'cancel',                               true,  70, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'purchase_invoice', 'reverse',  'DETAIL', 'OVERFLOW', 'MODAL',    'reverse',                              true,  80, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'purchase_invoice', 'copy',     'DETAIL', 'OVERFLOW', 'API',      'copy',                                 true,  90, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'purchase_invoice', 'export',   'LIST',   'TOOLBAR',  'API',      'export',                               false, 100, '00000000-0000-0000-0000-000000000000')
ON CONFLICT (tenant_id, entity_name, permission_code) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- Purchase Order operations
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
VALUES
    (NULL, 'purchase_order', 'create',   'LIST',   'PRIMARY',  'NAVIGATE', '/document/purchase_order/new',       false, 10, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'purchase_order', 'update',   'DETAIL', 'PRIMARY',  'NAVIGATE', '/document/purchase_order/{id}/edit', true,  20, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'purchase_order', 'submit',   'DETAIL', 'PRIMARY',  'MODAL',    'submit',                             true,  30, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'purchase_order', 'approve',  'DETAIL', 'PRIMARY',  'MODAL',    'approve',                            true,  40, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'purchase_order', 'deny',     'DETAIL', 'TOOLBAR',  'MODAL',    'deny',                               true,  50, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'purchase_order', 'close',    'DETAIL', 'TOOLBAR',  'MODAL',    'close',                              true,  60, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'purchase_order', 'cancel',   'DETAIL', 'OVERFLOW', 'MODAL',    'cancel',                             true,  70, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'purchase_order', 'copy',     'DETAIL', 'OVERFLOW', 'API',      'copy',                               true,  80, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'purchase_order', 'export',   'LIST',   'TOOLBAR',  'API',      'export',                             false, 90, '00000000-0000-0000-0000-000000000000')
ON CONFLICT (tenant_id, entity_name, permission_code) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- Journal Entry operations
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
VALUES
    (NULL, 'journal_entry', 'create',   'LIST',   'PRIMARY',  'NAVIGATE', '/document/journal_entry/new',       false, 10, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'journal_entry', 'update',   'DETAIL', 'PRIMARY',  'NAVIGATE', '/document/journal_entry/{id}/edit', true,  20, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'journal_entry', 'submit',   'DETAIL', 'PRIMARY',  'MODAL',    'submit',                            true,  30, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'journal_entry', 'approve',  'DETAIL', 'PRIMARY',  'MODAL',    'approve',                           true,  40, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'journal_entry', 'deny',     'DETAIL', 'TOOLBAR',  'MODAL',    'deny',                              true,  50, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'journal_entry', 'post',     'DETAIL', 'TOOLBAR',  'MODAL',    'post',                              true,  60, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'journal_entry', 'reverse',  'DETAIL', 'OVERFLOW', 'MODAL',    'reverse',                           true,  70, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'journal_entry', 'copy',     'DETAIL', 'OVERFLOW', 'API',      'copy',                              true,  80, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'journal_entry', 'export',   'LIST',   'TOOLBAR',  'API',      'export',                            false, 90, '00000000-0000-0000-0000-000000000000')
ON CONFLICT (tenant_id, entity_name, permission_code) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- Payment Entry operations
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
VALUES
    (NULL, 'payment_entry', 'create',    'LIST',   'PRIMARY',  'NAVIGATE', '/document/payment_entry/new',        false, 10,  '00000000-0000-0000-0000-000000000000'),
    (NULL, 'payment_entry', 'update',    'DETAIL', 'PRIMARY',  'NAVIGATE', '/document/payment_entry/{id}/edit',  true,  20,  '00000000-0000-0000-0000-000000000000'),
    (NULL, 'payment_entry', 'submit',    'DETAIL', 'PRIMARY',  'MODAL',    'submit',                             true,  30,  '00000000-0000-0000-0000-000000000000'),
    (NULL, 'payment_entry', 'approve',   'DETAIL', 'PRIMARY',  'MODAL',    'approve',                            true,  40,  '00000000-0000-0000-0000-000000000000'),
    (NULL, 'payment_entry', 'deny',      'DETAIL', 'TOOLBAR',  'MODAL',    'deny',                               true,  50,  '00000000-0000-0000-0000-000000000000'),
    (NULL, 'payment_entry', 'post',      'DETAIL', 'TOOLBAR',  'MODAL',    'post',                               true,  60,  '00000000-0000-0000-0000-000000000000'),
    (NULL, 'payment_entry', 'void',      'DETAIL', 'OVERFLOW', 'MODAL',    'void',                               true,  70,  '00000000-0000-0000-0000-000000000000'),
    (NULL, 'payment_entry', 'reverse',   'DETAIL', 'OVERFLOW', 'MODAL',    'reverse',                            true,  80,  '00000000-0000-0000-0000-000000000000'),
    (NULL, 'payment_entry', 'cancel',    'DETAIL', 'OVERFLOW', 'MODAL',    'cancel',                             true,  90,  '00000000-0000-0000-0000-000000000000'),
    (NULL, 'payment_entry', 'copy',      'DETAIL', 'OVERFLOW', 'API',      'copy',                               true,  100, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'payment_entry', 'export',    'LIST',   'TOOLBAR',  'API',      'export',                             false, 110, '00000000-0000-0000-0000-000000000000')
ON CONFLICT (tenant_id, entity_name, permission_code) DO NOTHING;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/010_system/entity_engine/002_field_groups.sql
-- 900_seed_data/010_system/entity_engine/002_field_groups.sql
-- Seed: 11 standard field groups (UI section groupings for canonical fields)
-- Schema: control | Table: field_group
-- Phase 1 — Foundation. No FK dependencies.
-- Idempotent: PRIMARY KEY (group_key) — ON CONFLICT DO NOTHING

INSERT INTO control.field_group (group_key, label, description, applies_to_classes, sort_order)
VALUES
    -- §1  Core identity — id, code, name, tenant ownership
    ('identity',
     'Identity',
     'Primary identifier, business code, display name, and tenant ownership.',
     ARRAY['MASTER','CONTROL','DOCUMENT','DOCUMENT_RELATION','REFERENCE','RELATION','LOG','DIMENSION','AGGREGATE'],
     100),

    -- §2  Descriptive profile — description, type, category metadata
    ('profile',
     'Profile',
     'Descriptive fields: description, classification type, display overrides.',
     ARRAY['MASTER','CONTROL','REFERENCE','DIMENSION'],
     200),

    -- §3  Contact details — email, phone, address cross-links
    ('contact',
     'Contact',
     'Contact information: email addresses, phone numbers, linked addresses.',
     ARRAY['MASTER'],
     300),

    -- §4  FK reference fields — foreign-key lookups to related master records
    ('reference',
     'References',
     'Foreign-key references to related entities (parent org, owner, assignee).',
     ARRAY['MASTER','CONTROL','DOCUMENT','DOCUMENT_RELATION','DIMENSION'],
     400),

    -- §5  Business dates — effective_from/to, due dates, period bounds
    ('dates',
     'Dates',
     'Business-critical date fields: validity periods, due dates, effective dates.',
     ARRAY['MASTER','CONTROL','DOCUMENT','DIMENSION'],
     500),

    -- §6  Financial — amounts, currencies, exchange rates, monetary policy
    ('financial',
     'Financial',
     'Monetary values, currency codes, exchange rates, amount fields.',
     ARRAY['MASTER','DOCUMENT','LEDGER'],
     600),

    -- §7  Classification — category, segment, intent, taxonomy, spend class
    ('classification',
     'Classification',
     'Taxonomy fields: category, segment, intent, commodity, spend class.',
     ARRAY['MASTER','CONTROL','REFERENCE','DIMENSION'],
     700),

    -- §8  Configuration — policy, settings, JSONB config bags
    ('config',
     'Configuration',
     'Policy settings, JSONB configuration bags, system-controlled flags.',
     ARRAY['CONTROL'],
     800),

    -- §9  Status & metadata — lifecycle status, is_active, jsonb metadata, tags
    ('metadata',
     'Metadata',
     'Lifecycle status, active flag, extensible JSONB metadata bag, tag array.',
     ARRAY['MASTER','CONTROL','DOCUMENT','DOCUMENT_RELATION','REFERENCE','RELATION','LOG','DIMENSION','AGGREGATE'],
     900),

    -- §10 Audit trail — creation and last-update timestamps + actor references
    ('audit',
     'Audit',
     'Row-level audit trail: created/updated timestamps and actor identifiers.',
     ARRAY['MASTER','CONTROL','DOCUMENT','DOCUMENT_RELATION','REFERENCE','RELATION','LOG','DIMENSION','AGGREGATE'],
     950),

    -- §11 Workflow — lifecycle state, approval state, transition history
    ('workflow',
     'Workflow',
     'Lifecycle and workflow fields: current state, approval status, deadline.',
     ARRAY['MASTER','DOCUMENT'],
     990)

ON CONFLICT (group_key) DO NOTHING;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/010_system/entity_engine/010_lifecycles/001_lc_active_inactive.sql
-- 010_lifecycles/001_lc_active_inactive.sql
-- Lifecycle: lc_active_inactive — simple 2-state toggle
-- Used by: label, brand_profile, letterhead, template (active/deprecated),
--          ledger_book, holiday_calendar, payment_term, payment_method,
--          planning_model, item_category, spend_category, chart_of_account,
--          tax_jurisdiction, tax_type, auth_group, team, dimension_set,
--          asset_class, print_profile, and others.
-- Idempotent: ON CONFLICT DO NOTHING throughout

DO $$
DECLARE
    v_lc_id uuid;
    v_s     jsonb;
BEGIN

INSERT INTO control.lifecycle (tenant_id, code, name, version_no, is_active, config, created_by)
VALUES (NULL, 'lc_active_inactive', 'Active / Inactive', 1, true,
    '{"initial_state_code":"active","allow_parallel_instances":false,
      "icon_key":"toggle-right","ui_color":"#217346"}'::jsonb,
    '00000000-0000-0000-0000-000000000000')
ON CONFLICT (tenant_id, code) DO NOTHING;

SELECT id INTO v_lc_id FROM control.lifecycle WHERE code = 'lc_active_inactive' AND tenant_id IS NULL;

INSERT INTO control.lifecycle_state
    (lifecycle_id, tenant_id, code, name, is_initial, is_terminal, sort_order, config, created_by)
VALUES
    (v_lc_id, NULL, 'active',   'Active',   true,  false, 10,
     '{"ui_color":"#217346","icon_key":"check-circle","badge_variant":"success"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'inactive', 'Inactive', false, false, 20,
     '{"ui_color":"#888888","icon_key":"circle-off","badge_variant":"neutral"}'::jsonb,
     '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, code) DO NOTHING;

SELECT jsonb_object_agg(code, id) INTO v_s FROM control.lifecycle_state WHERE lifecycle_id = v_lc_id;

INSERT INTO control.lifecycle_transition
    (lifecycle_id, tenant_id, from_state_id, to_state_id, operation_code, is_active, config, created_by)
VALUES
    (v_lc_id, NULL, (v_s->>'active')::uuid,   (v_s->>'inactive')::uuid, 'deactivate', true,
     '{"require_comment":false,"label":"Deactivate"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'inactive')::uuid, (v_s->>'active')::uuid,   'reactivate', true,
     '{"require_comment":false,"label":"Reactivate"}'::jsonb,
     '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, from_state_id, to_state_id) DO NOTHING;

END $$;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/010_system/entity_engine/010_lifecycles/002_lc_active_inactive_archived.sql
-- 010_lifecycles/002_lc_active_inactive_archived.sql
-- Lifecycle: lc_active_inactive_archived — 3-state with soft-delete archive
-- Used by: dimension_type, dimension_value
-- Idempotent: ON CONFLICT DO NOTHING throughout

DO $$
DECLARE
    v_lc_id uuid;
    v_s     jsonb;
BEGIN

INSERT INTO control.lifecycle (tenant_id, code, name, version_no, is_active, config, created_by)
VALUES (NULL, 'lc_active_inactive_archived', 'Active / Inactive / Archived', 1, true,
    '{"initial_state_code":"active","allow_parallel_instances":false,
      "icon_key":"archive","ui_color":"#217346"}'::jsonb,
    '00000000-0000-0000-0000-000000000000')
ON CONFLICT (tenant_id, code) DO NOTHING;

SELECT id INTO v_lc_id FROM control.lifecycle
WHERE code = 'lc_active_inactive_archived' AND tenant_id IS NULL;

INSERT INTO control.lifecycle_state
    (lifecycle_id, tenant_id, code, name, is_initial, is_terminal, sort_order, config, created_by)
VALUES
    (v_lc_id, NULL, 'active',   'Active',   true,  false, 10,
     '{"ui_color":"#217346","icon_key":"check-circle","badge_variant":"success"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'inactive', 'Inactive', false, false, 20,
     '{"ui_color":"#888888","icon_key":"circle-off","badge_variant":"neutral"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'archived', 'Archived', false, true,  30,
     '{"ui_color":"#555555","icon_key":"archive","badge_variant":"secondary"}'::jsonb,
     '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, code) DO NOTHING;

SELECT jsonb_object_agg(code, id) INTO v_s FROM control.lifecycle_state WHERE lifecycle_id = v_lc_id;

INSERT INTO control.lifecycle_transition
    (lifecycle_id, tenant_id, from_state_id, to_state_id, operation_code, is_active, config, created_by)
VALUES
    (v_lc_id, NULL, (v_s->>'active')::uuid,   (v_s->>'inactive')::uuid, 'deactivate', true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'inactive')::uuid, (v_s->>'active')::uuid,   'reactivate', true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'inactive')::uuid, (v_s->>'archived')::uuid, 'archive',    true,
     '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, from_state_id, to_state_id) DO NOTHING;

END $$;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/010_system/entity_engine/010_lifecycles/003_lc_org_master.sql
-- 010_lifecycles/003_lc_org_master.sql
-- Lifecycle: lc_org_master — organisational master record lifecycle
-- Used by: legal_entity, company_code, cost_center, profit_center, site, warehouse
-- States: draft → active ⇌ suspended → closed
-- Idempotent: ON CONFLICT DO NOTHING throughout

DO $$
DECLARE
    v_lc_id uuid;
    v_s     jsonb;
BEGIN

INSERT INTO control.lifecycle (tenant_id, code, name, version_no, is_active, config, created_by)
VALUES (NULL, 'lc_org_master', 'Org Master Record', 1, true,
    '{"initial_state_code":"draft","allow_parallel_instances":false,
      "icon_key":"building-2","ui_color":"#0F6CBD"}'::jsonb,
    '00000000-0000-0000-0000-000000000000')
ON CONFLICT (tenant_id, code) DO NOTHING;

SELECT id INTO v_lc_id FROM control.lifecycle WHERE code = 'lc_org_master' AND tenant_id IS NULL;

INSERT INTO control.lifecycle_state
    (lifecycle_id, tenant_id, code, name, is_initial, is_terminal, sort_order, config, created_by)
VALUES
    (v_lc_id, NULL, 'draft',     'Draft',     true,  false, 10,
     '{"ui_color":"#888888","icon_key":"pencil","badge_variant":"secondary"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'active',    'Active',    false, false, 20,
     '{"ui_color":"#217346","icon_key":"check-circle","badge_variant":"success"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'suspended', 'Suspended', false, false, 30,
     '{"ui_color":"#E8A020","icon_key":"pause-circle","badge_variant":"warning"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'closed',    'Closed',    false, true,  40,
     '{"ui_color":"#C00000","icon_key":"x-circle","badge_variant":"danger"}'::jsonb,
     '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, code) DO NOTHING;

SELECT jsonb_object_agg(code, id) INTO v_s FROM control.lifecycle_state WHERE lifecycle_id = v_lc_id;

INSERT INTO control.lifecycle_transition
    (lifecycle_id, tenant_id, from_state_id, to_state_id, operation_code, is_active, config, created_by)
VALUES
    (v_lc_id, NULL, (v_s->>'draft')::uuid,     (v_s->>'active')::uuid,    'activate',   true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'active')::uuid,    (v_s->>'suspended')::uuid, 'suspend',    true,
     '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'suspended')::uuid, (v_s->>'active')::uuid,    'reactivate', true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'active')::uuid,    (v_s->>'closed')::uuid,    'close',      true,
     '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'suspended')::uuid, (v_s->>'closed')::uuid,    'close',      true,
     '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, from_state_id, to_state_id) DO NOTHING;

END $$;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/010_system/entity_engine/010_lifecycles/004_lc_bp_master.sql
-- 010_lifecycles/004_lc_bp_master.sql
-- Lifecycle: lc_bp_master — business partner master record
-- Used by: customer, supplier, bank_party, product, item
-- States: draft → active ⇌ credit_hold ⇌ suspended → inactive
-- Idempotent: ON CONFLICT DO NOTHING throughout

DO $$
DECLARE
    v_lc_id uuid;
    v_s     jsonb;
BEGIN

INSERT INTO control.lifecycle (tenant_id, code, name, version_no, is_active, config, created_by)
VALUES (NULL, 'lc_bp_master', 'Business Partner', 1, true,
    '{"initial_state_code":"draft","allow_parallel_instances":false,
      "icon_key":"users","ui_color":"#0F6CBD"}'::jsonb,
    '00000000-0000-0000-0000-000000000000')
ON CONFLICT (tenant_id, code) DO NOTHING;

SELECT id INTO v_lc_id FROM control.lifecycle WHERE code = 'lc_bp_master' AND tenant_id IS NULL;

INSERT INTO control.lifecycle_state
    (lifecycle_id, tenant_id, code, name, is_initial, is_terminal, sort_order, config, created_by)
VALUES
    (v_lc_id, NULL, 'draft',       'Draft',       true,  false, 10,
     '{"ui_color":"#888888","icon_key":"pencil","badge_variant":"secondary"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'active',      'Active',      false, false, 20,
     '{"ui_color":"#217346","icon_key":"check-circle","badge_variant":"success"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'credit_hold', 'Credit Hold', false, false, 30,
     '{"ui_color":"#E8A020","icon_key":"alert-triangle","badge_variant":"warning"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'suspended',   'Suspended',   false, false, 40,
     '{"ui_color":"#C00000","icon_key":"pause-circle","badge_variant":"danger"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'inactive',    'Inactive',    false, true,  50,
     '{"ui_color":"#555555","icon_key":"circle-off","badge_variant":"neutral"}'::jsonb,
     '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, code) DO NOTHING;

SELECT jsonb_object_agg(code, id) INTO v_s FROM control.lifecycle_state WHERE lifecycle_id = v_lc_id;

INSERT INTO control.lifecycle_transition
    (lifecycle_id, tenant_id, from_state_id, to_state_id, operation_code, is_active, config, created_by)
VALUES
    (v_lc_id, NULL, (v_s->>'draft')::uuid,       (v_s->>'active')::uuid,      'activate',  true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'active')::uuid,      (v_s->>'credit_hold')::uuid, 'place_hold', true,
     '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'credit_hold')::uuid, (v_s->>'active')::uuid,      'lift_hold',  true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'active')::uuid,      (v_s->>'suspended')::uuid,   'suspend',    true,
     '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'suspended')::uuid,   (v_s->>'active')::uuid,      'reactivate', true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'active')::uuid,      (v_s->>'inactive')::uuid,    'deactivate', true,
     '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'suspended')::uuid,   (v_s->>'inactive')::uuid,    'deactivate', true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, from_state_id, to_state_id) DO NOTHING;

END $$;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/010_system/entity_engine/010_lifecycles/005_lc_tenant.sql
-- 010_lifecycles/005_lc_tenant.sql
-- Lifecycle: lc_tenant — tenant provisioning and suspension
-- Used by: master.tenant
-- States: provisioning → active ⇌ suspended → terminated

DO $$
DECLARE
    v_lc_id uuid;
    v_s     jsonb;
BEGIN

INSERT INTO control.lifecycle (tenant_id, code, name, version_no, is_active, config, created_by)
VALUES (NULL, 'lc_tenant', 'Tenant', 1, true,
    '{"initial_state_code":"provisioning","allow_parallel_instances":false,
      "icon_key":"building-2","ui_color":"#7B61FF"}'::jsonb,
    '00000000-0000-0000-0000-000000000000')
ON CONFLICT (tenant_id, code) DO NOTHING;

SELECT id INTO v_lc_id FROM control.lifecycle WHERE code = 'lc_tenant' AND tenant_id IS NULL;

INSERT INTO control.lifecycle_state
    (lifecycle_id, tenant_id, code, name, is_initial, is_terminal, sort_order, config, created_by)
VALUES
    (v_lc_id, NULL, 'provisioning', 'Provisioning', true,  false, 10,
     '{"ui_color":"#0F6CBD","icon_key":"loader","badge_variant":"info","sla_minutes":1440}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'active',       'Active',       false, false, 20,
     '{"ui_color":"#217346","icon_key":"check-circle","badge_variant":"success"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'suspended',    'Suspended',    false, false, 30,
     '{"ui_color":"#E8A020","icon_key":"pause-circle","badge_variant":"warning"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'terminated',   'Terminated',   false, true,  40,
     '{"ui_color":"#C00000","icon_key":"x-octagon","badge_variant":"danger"}'::jsonb,
     '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, code) DO NOTHING;

SELECT jsonb_object_agg(code, id) INTO v_s FROM control.lifecycle_state WHERE lifecycle_id = v_lc_id;

INSERT INTO control.lifecycle_transition
    (lifecycle_id, tenant_id, from_state_id, to_state_id, operation_code, is_active, config, created_by)
VALUES
    (v_lc_id, NULL, (v_s->>'provisioning')::uuid, (v_s->>'active')::uuid,    'provision',  true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'active')::uuid,       (v_s->>'suspended')::uuid, 'suspend',    true,
     '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'suspended')::uuid,    (v_s->>'active')::uuid,    'reactivate', true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'active')::uuid,       (v_s->>'terminated')::uuid,'terminate',  true,
     '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'suspended')::uuid,    (v_s->>'terminated')::uuid,'terminate',  true,
     '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, from_state_id, to_state_id) DO NOTHING;

END $$;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/010_system/entity_engine/010_lifecycles/006_lc_principal.sql
-- 010_lifecycles/006_lc_principal.sql
-- Lifecycle: lc_principal — user/principal account states
-- Used by: master.principal
-- States: active(initial) ⇌ suspended ⇌ locked → deactivated

DO $$
DECLARE
    v_lc_id uuid;
    v_s     jsonb;
BEGIN

INSERT INTO control.lifecycle (tenant_id, code, name, version_no, is_active, config, created_by)
VALUES (NULL, 'lc_principal', 'Principal Account', 1, true,
    '{"initial_state_code":"active","allow_parallel_instances":false,
      "icon_key":"user","ui_color":"#0F6CBD"}'::jsonb,
    '00000000-0000-0000-0000-000000000000')
ON CONFLICT (tenant_id, code) DO NOTHING;

SELECT id INTO v_lc_id FROM control.lifecycle WHERE code = 'lc_principal' AND tenant_id IS NULL;

INSERT INTO control.lifecycle_state
    (lifecycle_id, tenant_id, code, name, is_initial, is_terminal, sort_order, config, created_by)
VALUES
    (v_lc_id, NULL, 'active',      'Active',      true,  false, 10,
     '{"ui_color":"#217346","icon_key":"check-circle","badge_variant":"success"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'suspended',   'Suspended',   false, false, 20,
     '{"ui_color":"#E8A020","icon_key":"pause-circle","badge_variant":"warning"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'locked',      'Locked',      false, false, 30,
     '{"ui_color":"#C00000","icon_key":"lock","badge_variant":"danger",
       "auto_trigger":"failed_login_threshold"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'deactivated', 'Deactivated', false, true,  40,
     '{"ui_color":"#555555","icon_key":"user-x","badge_variant":"neutral"}'::jsonb,
     '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, code) DO NOTHING;

SELECT jsonb_object_agg(code, id) INTO v_s FROM control.lifecycle_state WHERE lifecycle_id = v_lc_id;

INSERT INTO control.lifecycle_transition
    (lifecycle_id, tenant_id, from_state_id, to_state_id, operation_code, is_active, config, created_by)
VALUES
    (v_lc_id, NULL, (v_s->>'active')::uuid,    (v_s->>'suspended')::uuid,  'suspend',    true,
     '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'suspended')::uuid, (v_s->>'active')::uuid,     'reactivate', true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'active')::uuid,    (v_s->>'locked')::uuid,     'lock',       true,
     '{"require_comment":false,"system_trigger":true}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'locked')::uuid,    (v_s->>'active')::uuid,     'unlock',     true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'active')::uuid,    (v_s->>'deactivated')::uuid,'deactivate', true,
     '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'suspended')::uuid, (v_s->>'deactivated')::uuid,'deactivate', true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, from_state_id, to_state_id) DO NOTHING;

END $$;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/010_system/entity_engine/010_lifecycles/007_lc_employee.sql
-- 010_lifecycles/007_lc_employee.sql
-- Lifecycle: lc_employee — employee onboarding through termination
-- Used by: master.employee

DO $$
DECLARE
    v_lc_id uuid;
    v_s     jsonb;
BEGIN

INSERT INTO control.lifecycle (tenant_id, code, name, version_no, is_active, config, created_by)
VALUES (NULL, 'lc_employee', 'Employee', 1, true,
    '{"initial_state_code":"onboarding","allow_parallel_instances":false,
      "icon_key":"user-check","ui_color":"#0F6CBD"}'::jsonb,
    '00000000-0000-0000-0000-000000000000')
ON CONFLICT (tenant_id, code) DO NOTHING;

SELECT id INTO v_lc_id FROM control.lifecycle WHERE code = 'lc_employee' AND tenant_id IS NULL;

INSERT INTO control.lifecycle_state
    (lifecycle_id, tenant_id, code, name, is_initial, is_terminal, sort_order, config, created_by)
VALUES
    (v_lc_id, NULL, 'onboarding', 'Onboarding', true,  false, 10,
     '{"ui_color":"#0F6CBD","icon_key":"user-plus","badge_variant":"info"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'active',     'Active',     false, false, 20,
     '{"ui_color":"#217346","icon_key":"check-circle","badge_variant":"success"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'on_leave',   'On Leave',   false, false, 30,
     '{"ui_color":"#7B61FF","icon_key":"calendar-off","badge_variant":"secondary"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'suspended',  'Suspended',  false, false, 40,
     '{"ui_color":"#E8A020","icon_key":"pause-circle","badge_variant":"warning"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'terminated', 'Terminated', false, true,  50,
     '{"ui_color":"#C00000","icon_key":"user-x","badge_variant":"danger"}'::jsonb,
     '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, code) DO NOTHING;

SELECT jsonb_object_agg(code, id) INTO v_s FROM control.lifecycle_state WHERE lifecycle_id = v_lc_id;

INSERT INTO control.lifecycle_transition
    (lifecycle_id, tenant_id, from_state_id, to_state_id, operation_code, is_active, config, created_by)
VALUES
    (v_lc_id, NULL, (v_s->>'onboarding')::uuid, (v_s->>'active')::uuid,     'activate',         true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'active')::uuid,     (v_s->>'on_leave')::uuid,   'go_on_leave',      true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'on_leave')::uuid,   (v_s->>'active')::uuid,     'return_from_leave',true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'active')::uuid,     (v_s->>'suspended')::uuid,  'suspend',          true,
     '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'suspended')::uuid,  (v_s->>'active')::uuid,     'reactivate',       true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'active')::uuid,     (v_s->>'terminated')::uuid, 'terminate',        true,
     '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'suspended')::uuid,  (v_s->>'terminated')::uuid, 'terminate',        true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, from_state_id, to_state_id) DO NOTHING;

END $$;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/010_system/entity_engine/010_lifecycles/008_lc_gl_account.sql
-- 010_lifecycles/008_lc_gl_account.sql
-- Lifecycle: lc_gl_account — general ledger account
-- Used by: master.gl_account
-- States: draft → active ⇌ blocked → archived

DO $$
DECLARE
    v_lc_id uuid;
    v_s     jsonb;
BEGIN

INSERT INTO control.lifecycle (tenant_id, code, name, version_no, is_active, config, created_by)
VALUES (NULL, 'lc_gl_account', 'GL Account', 1, true,
    '{"initial_state_code":"draft","allow_parallel_instances":false,
      "icon_key":"book-open","ui_color":"#217346"}'::jsonb,
    '00000000-0000-0000-0000-000000000000')
ON CONFLICT (tenant_id, code) DO NOTHING;

SELECT id INTO v_lc_id FROM control.lifecycle WHERE code = 'lc_gl_account' AND tenant_id IS NULL;

INSERT INTO control.lifecycle_state
    (lifecycle_id, tenant_id, code, name, is_initial, is_terminal, sort_order, config, created_by)
VALUES
    (v_lc_id, NULL, 'draft',    'Draft',    true,  false, 10,
     '{"ui_color":"#888888","icon_key":"pencil","badge_variant":"secondary"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'active',   'Active',   false, false, 20,
     '{"ui_color":"#217346","icon_key":"check-circle","badge_variant":"success"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'blocked',  'Blocked',  false, false, 30,
     '{"ui_color":"#C00000","icon_key":"ban","badge_variant":"danger",
       "description":"Blocked from new postings"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'archived', 'Archived', false, true,  40,
     '{"ui_color":"#555555","icon_key":"archive","badge_variant":"neutral"}'::jsonb,
     '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, code) DO NOTHING;

SELECT jsonb_object_agg(code, id) INTO v_s FROM control.lifecycle_state WHERE lifecycle_id = v_lc_id;

INSERT INTO control.lifecycle_transition
    (lifecycle_id, tenant_id, from_state_id, to_state_id, operation_code, is_active, config, created_by)
VALUES
    (v_lc_id, NULL, (v_s->>'draft')::uuid,   (v_s->>'active')::uuid,   'activate', true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'active')::uuid,  (v_s->>'blocked')::uuid,  'block',    true,
     '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'blocked')::uuid, (v_s->>'active')::uuid,   'unblock',  true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'blocked')::uuid, (v_s->>'archived')::uuid, 'archive',  true,
     '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, from_state_id, to_state_id) DO NOTHING;

END $$;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/010_system/entity_engine/010_lifecycles/009_lc_fiscal_period.sql
-- 010_lifecycles/009_lc_fiscal_period.sql
-- Lifecycle: lc_fiscal_period — accounting period open/close cycle
-- Used by: master.fiscal_period
-- States: open → posting_closed ⇌ (reopen) → period_closed → archived

DO $$
DECLARE
    v_lc_id uuid;
    v_s     jsonb;
BEGIN

INSERT INTO control.lifecycle (tenant_id, code, name, version_no, is_active, config, created_by)
VALUES (NULL, 'lc_fiscal_period', 'Fiscal Period', 1, true,
    '{"initial_state_code":"open","allow_parallel_instances":false,
      "icon_key":"calendar","ui_color":"#217346"}'::jsonb,
    '00000000-0000-0000-0000-000000000000')
ON CONFLICT (tenant_id, code) DO NOTHING;

SELECT id INTO v_lc_id FROM control.lifecycle WHERE code = 'lc_fiscal_period' AND tenant_id IS NULL;

INSERT INTO control.lifecycle_state
    (lifecycle_id, tenant_id, code, name, is_initial, is_terminal, sort_order, config, created_by)
VALUES
    (v_lc_id, NULL, 'open',           'Open',           true,  false, 10,
     '{"ui_color":"#217346","icon_key":"calendar","badge_variant":"success",
       "description":"Period open for journal postings"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'posting_closed', 'Posting Closed', false, false, 20,
     '{"ui_color":"#E8A020","icon_key":"calendar-x","badge_variant":"warning",
       "description":"Journal postings closed; adjustment postings only"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'period_closed',  'Period Closed',  false, false, 30,
     '{"ui_color":"#C00000","icon_key":"lock","badge_variant":"danger",
       "description":"Period fully closed; no further postings"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'archived',       'Archived',       false, true,  40,
     '{"ui_color":"#555555","icon_key":"archive","badge_variant":"neutral"}'::jsonb,
     '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, code) DO NOTHING;

SELECT jsonb_object_agg(code, id) INTO v_s FROM control.lifecycle_state WHERE lifecycle_id = v_lc_id;

INSERT INTO control.lifecycle_transition
    (lifecycle_id, tenant_id, from_state_id, to_state_id, operation_code, is_active, config, created_by)
VALUES
    (v_lc_id, NULL, (v_s->>'open')::uuid,           (v_s->>'posting_closed')::uuid, 'close_postings',  true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'posting_closed')::uuid, (v_s->>'open')::uuid,           'reopen_postings', true,
     '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'posting_closed')::uuid, (v_s->>'period_closed')::uuid,  'close_period',    true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'period_closed')::uuid,  (v_s->>'archived')::uuid,       'archive',         true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, from_state_id, to_state_id) DO NOTHING;

END $$;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/010_system/entity_engine/010_lifecycles/010_lc_attachment.sql
-- 010_lifecycles/010_lc_attachment.sql
-- Lifecycle: lc_attachment — file/document attachment
-- Used by: master.attachment

DO $$
DECLARE
    v_lc_id uuid;
    v_s     jsonb;
BEGIN

INSERT INTO control.lifecycle (tenant_id, code, name, version_no, is_active, config, created_by)
VALUES (NULL, 'lc_attachment', 'Attachment', 1, true,
    '{"initial_state_code":"uploading","allow_parallel_instances":false,
      "icon_key":"paperclip","ui_color":"#0F6CBD"}'::jsonb,
    '00000000-0000-0000-0000-000000000000')
ON CONFLICT (tenant_id, code) DO NOTHING;

SELECT id INTO v_lc_id FROM control.lifecycle WHERE code = 'lc_attachment' AND tenant_id IS NULL;

INSERT INTO control.lifecycle_state
    (lifecycle_id, tenant_id, code, name, is_initial, is_terminal, sort_order, config, created_by)
VALUES
    (v_lc_id, NULL, 'uploading', 'Uploading', true,  false, 10,
     '{"ui_color":"#0F6CBD","icon_key":"upload","badge_variant":"info"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'active',    'Active',    false, false, 20,
     '{"ui_color":"#217346","icon_key":"check-circle","badge_variant":"success"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'flagged',   'Flagged',   false, false, 30,
     '{"ui_color":"#E8A020","icon_key":"flag","badge_variant":"warning"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'archived',  'Archived',  false, true,  40,
     '{"ui_color":"#555555","icon_key":"archive","badge_variant":"neutral"}'::jsonb,
     '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, code) DO NOTHING;

SELECT jsonb_object_agg(code, id) INTO v_s FROM control.lifecycle_state WHERE lifecycle_id = v_lc_id;

INSERT INTO control.lifecycle_transition
    (lifecycle_id, tenant_id, from_state_id, to_state_id, operation_code, is_active, config, created_by)
VALUES
    (v_lc_id, NULL, (v_s->>'uploading')::uuid, (v_s->>'active')::uuid,   'confirm', true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'active')::uuid,    (v_s->>'flagged')::uuid,  'flag',    true,
     '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'flagged')::uuid,   (v_s->>'active')::uuid,   'unflag',  true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'active')::uuid,    (v_s->>'archived')::uuid, 'archive', true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'flagged')::uuid,   (v_s->>'archived')::uuid, 'archive', true,
     '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, from_state_id, to_state_id) DO NOTHING;

END $$;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/010_system/entity_engine/010_lifecycles/011_lc_comment.sql
-- 010_lifecycles/011_lc_comment.sql
-- Lifecycle: lc_comment — comment moderation states
-- Used by: master.comment

DO $$
DECLARE
    v_lc_id uuid;
    v_s     jsonb;
BEGIN

INSERT INTO control.lifecycle (tenant_id, code, name, version_no, is_active, config, created_by)
VALUES (NULL, 'lc_comment', 'Comment', 1, true,
    '{"initial_state_code":"draft","allow_parallel_instances":false,
      "icon_key":"message-square","ui_color":"#7B61FF"}'::jsonb,
    '00000000-0000-0000-0000-000000000000')
ON CONFLICT (tenant_id, code) DO NOTHING;

SELECT id INTO v_lc_id FROM control.lifecycle WHERE code = 'lc_comment' AND tenant_id IS NULL;

INSERT INTO control.lifecycle_state
    (lifecycle_id, tenant_id, code, name, is_initial, is_terminal, sort_order, config, created_by)
VALUES
    (v_lc_id, NULL, 'draft',     'Draft',     true,  false, 10,
     '{"ui_color":"#888888","icon_key":"pencil","badge_variant":"secondary"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'published', 'Published', false, false, 20,
     '{"ui_color":"#217346","icon_key":"check-circle","badge_variant":"success"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'flagged',   'Flagged',   false, false, 30,
     '{"ui_color":"#E8A020","icon_key":"flag","badge_variant":"warning"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'hidden',    'Hidden',    false, false, 40,
     '{"ui_color":"#888888","icon_key":"eye-off","badge_variant":"neutral"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'deleted',   'Deleted',   false, true,  50,
     '{"ui_color":"#C00000","icon_key":"trash","badge_variant":"danger"}'::jsonb,
     '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, code) DO NOTHING;

SELECT jsonb_object_agg(code, id) INTO v_s FROM control.lifecycle_state WHERE lifecycle_id = v_lc_id;

INSERT INTO control.lifecycle_transition
    (lifecycle_id, tenant_id, from_state_id, to_state_id, operation_code, is_active, config, created_by)
VALUES
    (v_lc_id, NULL, (v_s->>'draft')::uuid,     (v_s->>'published')::uuid, 'publish', true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'published')::uuid, (v_s->>'flagged')::uuid,   'flag',    true,
     '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'flagged')::uuid,   (v_s->>'published')::uuid, 'unflag',  true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'flagged')::uuid,   (v_s->>'hidden')::uuid,    'hide',    true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'hidden')::uuid,    (v_s->>'published')::uuid, 'restore', true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'hidden')::uuid,    (v_s->>'deleted')::uuid,   'delete',  true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'published')::uuid, (v_s->>'deleted')::uuid,   'delete',  true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, from_state_id, to_state_id) DO NOTHING;

END $$;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/010_system/entity_engine/010_lifecycles/012_lc_conversation.sql
-- 010_lifecycles/012_lc_conversation.sql
-- Lifecycle: lc_conversation
-- Used by: master.conversation

DO $$
DECLARE
    v_lc_id uuid;
    v_s     jsonb;
BEGIN

INSERT INTO control.lifecycle (tenant_id, code, name, version_no, is_active, config, created_by)
VALUES (NULL, 'lc_conversation', 'Conversation', 1, true,
    '{"initial_state_code":"open","allow_parallel_instances":false,
      "icon_key":"messages-square","ui_color":"#7B61FF"}'::jsonb,
    '00000000-0000-0000-0000-000000000000')
ON CONFLICT (tenant_id, code) DO NOTHING;

SELECT id INTO v_lc_id FROM control.lifecycle WHERE code = 'lc_conversation' AND tenant_id IS NULL;

INSERT INTO control.lifecycle_state
    (lifecycle_id, tenant_id, code, name, is_initial, is_terminal, sort_order, config, created_by)
VALUES
    (v_lc_id, NULL, 'open',     'Open',     true,  false, 10,
     '{"ui_color":"#217346","icon_key":"message-circle","badge_variant":"success"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'resolved', 'Resolved', false, false, 20,
     '{"ui_color":"#0F6CBD","icon_key":"check","badge_variant":"info"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'archived', 'Archived', false, true,  30,
     '{"ui_color":"#555555","icon_key":"archive","badge_variant":"neutral"}'::jsonb,
     '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, code) DO NOTHING;

SELECT jsonb_object_agg(code, id) INTO v_s FROM control.lifecycle_state WHERE lifecycle_id = v_lc_id;

INSERT INTO control.lifecycle_transition
    (lifecycle_id, tenant_id, from_state_id, to_state_id, operation_code, is_active, config, created_by)
VALUES
    (v_lc_id, NULL, (v_s->>'open')::uuid,     (v_s->>'resolved')::uuid, 'resolve', true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'resolved')::uuid, (v_s->>'open')::uuid,     'reopen',  true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'resolved')::uuid, (v_s->>'archived')::uuid, 'archive', true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, from_state_id, to_state_id) DO NOTHING;

END $$;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/010_system/entity_engine/010_lifecycles/013_lc_template.sql
-- 010_lifecycles/013_lc_template.sql
-- Lifecycle: lc_template — document/notification template
-- Used by: master.template

DO $$
DECLARE
    v_lc_id uuid;
    v_s     jsonb;
BEGIN

INSERT INTO control.lifecycle (tenant_id, code, name, version_no, is_active, config, created_by)
VALUES (NULL, 'lc_template', 'Template', 1, true,
    '{"initial_state_code":"draft","allow_parallel_instances":false,
      "icon_key":"layout-template","ui_color":"#7B61FF"}'::jsonb,
    '00000000-0000-0000-0000-000000000000')
ON CONFLICT (tenant_id, code) DO NOTHING;

SELECT id INTO v_lc_id FROM control.lifecycle WHERE code = 'lc_template' AND tenant_id IS NULL;

INSERT INTO control.lifecycle_state
    (lifecycle_id, tenant_id, code, name, is_initial, is_terminal, sort_order, config, created_by)
VALUES
    (v_lc_id, NULL, 'draft',      'Draft',      true,  false, 10,
     '{"ui_color":"#888888","icon_key":"pencil","badge_variant":"secondary"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'active',     'Active',     false, false, 20,
     '{"ui_color":"#217346","icon_key":"check-circle","badge_variant":"success"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'deprecated', 'Deprecated', false, false, 30,
     '{"ui_color":"#E8A020","icon_key":"alert-triangle","badge_variant":"warning"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'archived',   'Archived',   false, true,  40,
     '{"ui_color":"#555555","icon_key":"archive","badge_variant":"neutral"}'::jsonb,
     '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, code) DO NOTHING;

SELECT jsonb_object_agg(code, id) INTO v_s FROM control.lifecycle_state WHERE lifecycle_id = v_lc_id;

INSERT INTO control.lifecycle_transition
    (lifecycle_id, tenant_id, from_state_id, to_state_id, operation_code, is_active, config, created_by)
VALUES
    (v_lc_id, NULL, (v_s->>'draft')::uuid,      (v_s->>'active')::uuid,     'publish',    true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'active')::uuid,     (v_s->>'deprecated')::uuid, 'deprecate',  true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'deprecated')::uuid, (v_s->>'active')::uuid,     'restore',    true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'deprecated')::uuid, (v_s->>'archived')::uuid,   'archive',    true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, from_state_id, to_state_id) DO NOTHING;

END $$;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/010_system/entity_engine/010_lifecycles/014_lc_master_doc.sql
-- 010_lifecycles/014_lc_master_doc.sql
-- Lifecycle: lc_master_doc — master document (brand profile, letterhead, print profile)
-- Used by: master.document, master.brand_profile, master.letterhead, master.print_profile

DO $$
DECLARE
    v_lc_id uuid;
    v_s     jsonb;
BEGIN

INSERT INTO control.lifecycle (tenant_id, code, name, version_no, is_active, config, created_by)
VALUES (NULL, 'lc_master_doc', 'Master Document', 1, true,
    '{"initial_state_code":"draft","allow_parallel_instances":false,
      "icon_key":"file-text","ui_color":"#7B61FF"}'::jsonb,
    '00000000-0000-0000-0000-000000000000')
ON CONFLICT (tenant_id, code) DO NOTHING;

SELECT id INTO v_lc_id FROM control.lifecycle WHERE code = 'lc_master_doc' AND tenant_id IS NULL;

INSERT INTO control.lifecycle_state
    (lifecycle_id, tenant_id, code, name, is_initial, is_terminal, sort_order, config, created_by)
VALUES
    (v_lc_id, NULL, 'draft',    'Draft',    true,  false, 10,
     '{"ui_color":"#888888","icon_key":"pencil","badge_variant":"secondary"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'active',   'Active',   false, false, 20,
     '{"ui_color":"#217346","icon_key":"check-circle","badge_variant":"success"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'void',     'Void',     false, true,  30,
     '{"ui_color":"#C00000","icon_key":"x-circle","badge_variant":"danger"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'archived', 'Archived', false, true,  40,
     '{"ui_color":"#555555","icon_key":"archive","badge_variant":"neutral"}'::jsonb,
     '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, code) DO NOTHING;

SELECT jsonb_object_agg(code, id) INTO v_s FROM control.lifecycle_state WHERE lifecycle_id = v_lc_id;

INSERT INTO control.lifecycle_transition
    (lifecycle_id, tenant_id, from_state_id, to_state_id, operation_code, is_active, config, created_by)
VALUES
    (v_lc_id, NULL, (v_s->>'draft')::uuid,  (v_s->>'active')::uuid,   'publish', true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'active')::uuid, (v_s->>'void')::uuid,     'void',    true,
     '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'active')::uuid, (v_s->>'archived')::uuid, 'archive', true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'draft')::uuid,  (v_s->>'archived')::uuid, 'archive', true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, from_state_id, to_state_id) DO NOTHING;

END $$;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/010_system/entity_engine/010_lifecycles/015_lc_project.sql
-- 010_lifecycles/015_lc_project.sql
-- Lifecycle: lc_project
-- Used by: master.project

DO $$
DECLARE
    v_lc_id uuid;
    v_s     jsonb;
BEGIN

INSERT INTO control.lifecycle (tenant_id, code, name, version_no, is_active, config, created_by)
VALUES (NULL, 'lc_project', 'Project', 1, true,
    '{"initial_state_code":"draft","allow_parallel_instances":false,
      "icon_key":"folder-kanban","ui_color":"#0F6CBD"}'::jsonb,
    '00000000-0000-0000-0000-000000000000')
ON CONFLICT (tenant_id, code) DO NOTHING;

SELECT id INTO v_lc_id FROM control.lifecycle WHERE code = 'lc_project' AND tenant_id IS NULL;

INSERT INTO control.lifecycle_state
    (lifecycle_id, tenant_id, code, name, is_initial, is_terminal, sort_order, config, created_by)
VALUES
    (v_lc_id, NULL, 'draft',     'Draft',     true,  false, 10,
     '{"ui_color":"#888888","icon_key":"pencil","badge_variant":"secondary"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'active',    'Active',    false, false, 20,
     '{"ui_color":"#217346","icon_key":"play-circle","badge_variant":"success"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'on_hold',   'On Hold',   false, false, 30,
     '{"ui_color":"#E8A020","icon_key":"pause-circle","badge_variant":"warning"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'completed', 'Completed', false, true,  40,
     '{"ui_color":"#0F6CBD","icon_key":"check-circle-2","badge_variant":"info"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'cancelled', 'Cancelled', false, true,  50,
     '{"ui_color":"#C00000","icon_key":"x-circle","badge_variant":"danger"}'::jsonb,
     '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, code) DO NOTHING;

SELECT jsonb_object_agg(code, id) INTO v_s FROM control.lifecycle_state WHERE lifecycle_id = v_lc_id;

INSERT INTO control.lifecycle_transition
    (lifecycle_id, tenant_id, from_state_id, to_state_id, operation_code, is_active, config, created_by)
VALUES
    (v_lc_id, NULL, (v_s->>'draft')::uuid,   (v_s->>'active')::uuid,    'activate',  true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'active')::uuid,  (v_s->>'on_hold')::uuid,   'pause',     true,
     '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'on_hold')::uuid, (v_s->>'active')::uuid,    'resume',    true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'active')::uuid,  (v_s->>'completed')::uuid, 'complete',  true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'active')::uuid,  (v_s->>'cancelled')::uuid, 'cancel',    true,
     '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'on_hold')::uuid, (v_s->>'cancelled')::uuid, 'cancel',    true,
     '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, from_state_id, to_state_id) DO NOTHING;

END $$;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/010_system/entity_engine/010_lifecycles/016_lc_asset.sql
-- 010_lifecycles/016_lc_asset.sql
-- Lifecycle: lc_asset — fixed asset
-- Used by: master.asset

DO $$
DECLARE
    v_lc_id uuid;
    v_s     jsonb;
BEGIN

INSERT INTO control.lifecycle (tenant_id, code, name, version_no, is_active, config, created_by)
VALUES (NULL, 'lc_asset', 'Fixed Asset', 1, true,
    '{"initial_state_code":"draft","allow_parallel_instances":false,
      "icon_key":"hard-drive","ui_color":"#217346"}'::jsonb,
    '00000000-0000-0000-0000-000000000000')
ON CONFLICT (tenant_id, code) DO NOTHING;

SELECT id INTO v_lc_id FROM control.lifecycle WHERE code = 'lc_asset' AND tenant_id IS NULL;

INSERT INTO control.lifecycle_state
    (lifecycle_id, tenant_id, code, name, is_initial, is_terminal, sort_order, config, created_by)
VALUES
    (v_lc_id, NULL, 'draft',             'Draft',               true,  false, 10,
     '{"ui_color":"#888888","icon_key":"pencil","badge_variant":"secondary"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'in_service',        'In Service',          false, false, 20,
     '{"ui_color":"#217346","icon_key":"check-circle","badge_variant":"success"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'under_maintenance', 'Under Maintenance',   false, false, 30,
     '{"ui_color":"#E8A020","icon_key":"wrench","badge_variant":"warning"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'disposed',          'Disposed',            false, true,  40,
     '{"ui_color":"#C00000","icon_key":"trash-2","badge_variant":"danger"}'::jsonb,
     '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, code) DO NOTHING;

SELECT jsonb_object_agg(code, id) INTO v_s FROM control.lifecycle_state WHERE lifecycle_id = v_lc_id;

INSERT INTO control.lifecycle_transition
    (lifecycle_id, tenant_id, from_state_id, to_state_id, operation_code, is_active, config, created_by)
VALUES
    (v_lc_id, NULL, (v_s->>'draft')::uuid,             (v_s->>'in_service')::uuid,        'commission',         true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'in_service')::uuid,        (v_s->>'under_maintenance')::uuid,  'put_in_maintenance', true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'under_maintenance')::uuid, (v_s->>'in_service')::uuid,         'return_to_service',  true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'in_service')::uuid,        (v_s->>'disposed')::uuid,           'dispose',            true,
     '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'under_maintenance')::uuid, (v_s->>'disposed')::uuid,           'dispose',            true,
     '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, from_state_id, to_state_id) DO NOTHING;

END $$;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/010_system/entity_engine/010_lifecycles/017_lc_budget_profile.sql
-- 010_lifecycles/017_lc_budget_profile.sql
-- Lifecycle: lc_budget_profile
-- Used by: master.budget_profile

DO $$
DECLARE
    v_lc_id uuid;
    v_s     jsonb;
BEGIN

INSERT INTO control.lifecycle (tenant_id, code, name, version_no, is_active, config, created_by)
VALUES (NULL, 'lc_budget_profile', 'Budget Profile', 1, true,
    '{"initial_state_code":"draft","allow_parallel_instances":false,
      "icon_key":"pie-chart","ui_color":"#217346"}'::jsonb,
    '00000000-0000-0000-0000-000000000000')
ON CONFLICT (tenant_id, code) DO NOTHING;

SELECT id INTO v_lc_id FROM control.lifecycle WHERE code = 'lc_budget_profile' AND tenant_id IS NULL;

INSERT INTO control.lifecycle_state
    (lifecycle_id, tenant_id, code, name, is_initial, is_terminal, sort_order, config, created_by)
VALUES
    (v_lc_id, NULL, 'draft',    'Draft',    true,  false, 10,
     '{"ui_color":"#888888","icon_key":"pencil","badge_variant":"secondary"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'approved', 'Approved', false, false, 20,
     '{"ui_color":"#0F6CBD","icon_key":"check","badge_variant":"info"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'active',   'Active',   false, false, 30,
     '{"ui_color":"#217346","icon_key":"check-circle","badge_variant":"success"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'closed',   'Closed',   false, false, 40,
     '{"ui_color":"#555555","icon_key":"lock","badge_variant":"neutral"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'archived', 'Archived', false, true,  50,
     '{"ui_color":"#333333","icon_key":"archive","badge_variant":"neutral"}'::jsonb,
     '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, code) DO NOTHING;

SELECT jsonb_object_agg(code, id) INTO v_s FROM control.lifecycle_state WHERE lifecycle_id = v_lc_id;

INSERT INTO control.lifecycle_transition
    (lifecycle_id, tenant_id, from_state_id, to_state_id, operation_code, is_active, config, created_by)
VALUES
    (v_lc_id, NULL, (v_s->>'draft')::uuid,    (v_s->>'approved')::uuid, 'approve',  true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'approved')::uuid, (v_s->>'active')::uuid,   'activate', true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'active')::uuid,   (v_s->>'closed')::uuid,   'close',    true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'closed')::uuid,   (v_s->>'active')::uuid,   'reopen',   true,
     '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'closed')::uuid,   (v_s->>'archived')::uuid, 'archive',  true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, from_state_id, to_state_id) DO NOTHING;

END $$;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/010_system/entity_engine/010_lifecycles/018_lc_budget_allocation.sql
-- 010_lifecycles/018_lc_budget_allocation.sql
-- Lifecycle: lc_budget_allocation — approval-gated budget allocation
-- Used by: master.budget_allocation

DO $$
DECLARE
    v_lc_id uuid;
    v_s     jsonb;
BEGIN

INSERT INTO control.lifecycle (tenant_id, code, name, version_no, is_active, config, created_by)
VALUES (NULL, 'lc_budget_allocation', 'Budget Allocation', 1, true,
    '{"initial_state_code":"draft","allow_parallel_instances":false,
      "icon_key":"bar-chart-3","ui_color":"#217346"}'::jsonb,
    '00000000-0000-0000-0000-000000000000')
ON CONFLICT (tenant_id, code) DO NOTHING;

SELECT id INTO v_lc_id FROM control.lifecycle WHERE code = 'lc_budget_allocation' AND tenant_id IS NULL;

INSERT INTO control.lifecycle_state
    (lifecycle_id, tenant_id, code, name, is_initial, is_terminal, sort_order, config, created_by)
VALUES
    (v_lc_id, NULL, 'draft',     'Draft',     true,  false, 10,
     '{"ui_color":"#888888","icon_key":"pencil","badge_variant":"secondary"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'submitted', 'Submitted', false, false, 20,
     '{"ui_color":"#0F6CBD","icon_key":"send","badge_variant":"info"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'approved',  'Approved',  false, true,  30,
     '{"ui_color":"#217346","icon_key":"check-circle","badge_variant":"success"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'rejected',  'Rejected',  false, true,  40,
     '{"ui_color":"#C00000","icon_key":"x-circle","badge_variant":"danger"}'::jsonb,
     '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, code) DO NOTHING;

SELECT jsonb_object_agg(code, id) INTO v_s FROM control.lifecycle_state WHERE lifecycle_id = v_lc_id;

INSERT INTO control.lifecycle_transition
    (lifecycle_id, tenant_id, from_state_id, to_state_id, operation_code, is_active, config, created_by)
VALUES
    (v_lc_id, NULL, (v_s->>'draft')::uuid,     (v_s->>'submitted')::uuid, 'submit',   true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'submitted')::uuid, (v_s->>'draft')::uuid,     'withdraw', true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'submitted')::uuid, (v_s->>'approved')::uuid,  'approve',  true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'submitted')::uuid, (v_s->>'rejected')::uuid,  'reject',   true,
     '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, from_state_id, to_state_id) DO NOTHING;

END $$;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/010_system/entity_engine/010_lifecycles/019_lc_bank_account.sql
-- 010_lifecycles/019_lc_bank_account.sql
-- Lifecycle: lc_bank_account
-- Used by: master.bank_account

DO $$
DECLARE
    v_lc_id uuid;
    v_s     jsonb;
BEGIN

INSERT INTO control.lifecycle (tenant_id, code, name, version_no, is_active, config, created_by)
VALUES (NULL, 'lc_bank_account', 'Bank Account', 1, true,
    '{"initial_state_code":"pending_verification","allow_parallel_instances":false,
      "icon_key":"landmark","ui_color":"#0F6CBD"}'::jsonb,
    '00000000-0000-0000-0000-000000000000')
ON CONFLICT (tenant_id, code) DO NOTHING;

SELECT id INTO v_lc_id FROM control.lifecycle WHERE code = 'lc_bank_account' AND tenant_id IS NULL;

INSERT INTO control.lifecycle_state
    (lifecycle_id, tenant_id, code, name, is_initial, is_terminal, sort_order, config, created_by)
VALUES
    (v_lc_id, NULL, 'pending_verification', 'Pending Verification', true,  false, 10,
     '{"ui_color":"#E8A020","icon_key":"clock","badge_variant":"warning"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'active',               'Active',               false, false, 20,
     '{"ui_color":"#217346","icon_key":"check-circle","badge_variant":"success"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'frozen',               'Frozen',               false, false, 30,
     '{"ui_color":"#7B61FF","icon_key":"snowflake","badge_variant":"secondary"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'closed',               'Closed',               false, true,  40,
     '{"ui_color":"#555555","icon_key":"x-circle","badge_variant":"neutral"}'::jsonb,
     '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, code) DO NOTHING;

SELECT jsonb_object_agg(code, id) INTO v_s FROM control.lifecycle_state WHERE lifecycle_id = v_lc_id;

INSERT INTO control.lifecycle_transition
    (lifecycle_id, tenant_id, from_state_id, to_state_id, operation_code, is_active, config, created_by)
VALUES
    (v_lc_id, NULL, (v_s->>'pending_verification')::uuid, (v_s->>'active')::uuid,  'verify',   true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'active')::uuid,               (v_s->>'frozen')::uuid,  'freeze',   true,
     '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'frozen')::uuid,               (v_s->>'active')::uuid,  'unfreeze', true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'active')::uuid,               (v_s->>'closed')::uuid,  'close',    true,
     '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'frozen')::uuid,               (v_s->>'closed')::uuid,  'close',    true,
     '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, from_state_id, to_state_id) DO NOTHING;

END $$;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/010_system/entity_engine/010_lifecycles/020_lc_content.sql
-- 010_lifecycles/020_lc_content.sql
-- Lifecycle: lc_content — CMS content item
-- Used by: master.content_item

DO $$
DECLARE
    v_lc_id uuid;
    v_s     jsonb;
BEGIN

INSERT INTO control.lifecycle (tenant_id, code, name, version_no, is_active, config, created_by)
VALUES (NULL, 'lc_content', 'Content Item', 1, true,
    '{"initial_state_code":"draft","allow_parallel_instances":false,
      "icon_key":"file-text","ui_color":"#7B61FF"}'::jsonb,
    '00000000-0000-0000-0000-000000000000')
ON CONFLICT (tenant_id, code) DO NOTHING;

SELECT id INTO v_lc_id FROM control.lifecycle WHERE code = 'lc_content' AND tenant_id IS NULL;

INSERT INTO control.lifecycle_state
    (lifecycle_id, tenant_id, code, name, is_initial, is_terminal, sort_order, config, created_by)
VALUES
    (v_lc_id, NULL, 'draft',       'Draft',       true,  false, 10,
     '{"ui_color":"#888888","icon_key":"pencil","badge_variant":"secondary"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'published',   'Published',   false, false, 20,
     '{"ui_color":"#217346","icon_key":"globe","badge_variant":"success"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'unpublished', 'Unpublished', false, false, 30,
     '{"ui_color":"#E8A020","icon_key":"eye-off","badge_variant":"warning"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'archived',    'Archived',    false, true,  40,
     '{"ui_color":"#555555","icon_key":"archive","badge_variant":"neutral"}'::jsonb,
     '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, code) DO NOTHING;

SELECT jsonb_object_agg(code, id) INTO v_s FROM control.lifecycle_state WHERE lifecycle_id = v_lc_id;

INSERT INTO control.lifecycle_transition
    (lifecycle_id, tenant_id, from_state_id, to_state_id, operation_code, is_active, config, created_by)
VALUES
    (v_lc_id, NULL, (v_s->>'draft')::uuid,       (v_s->>'published')::uuid,   'publish',   true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'published')::uuid,   (v_s->>'unpublished')::uuid, 'unpublish', true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'unpublished')::uuid, (v_s->>'published')::uuid,   'republish', true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'unpublished')::uuid, (v_s->>'archived')::uuid,    'archive',   true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'draft')::uuid,       (v_s->>'archived')::uuid,    'archive',   true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, from_state_id, to_state_id) DO NOTHING;

END $$;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/010_system/entity_engine/010_lifecycles/021_lc_delegation.sql
-- 010_lifecycles/021_lc_delegation.sql
-- Lifecycle: lc_delegation — authority delegation grant
-- Used by: master.delegation_grant

DO $$
DECLARE
    v_lc_id uuid;
    v_s     jsonb;
BEGIN

INSERT INTO control.lifecycle (tenant_id, code, name, version_no, is_active, config, created_by)
VALUES (NULL, 'lc_delegation', 'Delegation Grant', 1, true,
    '{"initial_state_code":"pending","allow_parallel_instances":false,
      "icon_key":"share-2","ui_color":"#7B61FF"}'::jsonb,
    '00000000-0000-0000-0000-000000000000')
ON CONFLICT (tenant_id, code) DO NOTHING;

SELECT id INTO v_lc_id FROM control.lifecycle WHERE code = 'lc_delegation' AND tenant_id IS NULL;

INSERT INTO control.lifecycle_state
    (lifecycle_id, tenant_id, code, name, is_initial, is_terminal, sort_order, config, created_by)
VALUES
    (v_lc_id, NULL, 'pending', 'Pending', true,  false, 10,
     '{"ui_color":"#E8A020","icon_key":"clock","badge_variant":"warning"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'active',  'Active',  false, false, 20,
     '{"ui_color":"#217346","icon_key":"check-circle","badge_variant":"success"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'expired', 'Expired', false, true,  30,
     '{"ui_color":"#888888","icon_key":"timer-off","badge_variant":"neutral",
       "auto_trigger":"effective_to_passed"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'revoked', 'Revoked', false, true,  40,
     '{"ui_color":"#C00000","icon_key":"shield-off","badge_variant":"danger"}'::jsonb,
     '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, code) DO NOTHING;

SELECT jsonb_object_agg(code, id) INTO v_s FROM control.lifecycle_state WHERE lifecycle_id = v_lc_id;

INSERT INTO control.lifecycle_transition
    (lifecycle_id, tenant_id, from_state_id, to_state_id, operation_code, is_active, config, created_by)
VALUES
    (v_lc_id, NULL, (v_s->>'pending')::uuid, (v_s->>'active')::uuid,  'activate', true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'active')::uuid,  (v_s->>'expired')::uuid, 'expire',   true,
     '{"require_comment":false,"system_trigger":true}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'pending')::uuid, (v_s->>'revoked')::uuid, 'revoke',   true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'active')::uuid,  (v_s->>'revoked')::uuid, 'revoke',   true,
     '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, from_state_id, to_state_id) DO NOTHING;

END $$;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/010_system/entity_engine/020_entities/001_master_identity.sql
-- 020_entities/001_master_identity.sql
-- Entities 1–26: IAM + Foundation (master schema)
-- Depends on: shared.module rows (IAM, FND) exist
-- Idempotent: UNIQUE (table_schema, table_name) → ON CONFLICT DO NOTHING
-- governance_level: 'full'|'standard'|'lite'  (spec 'light'→'standard', 'none'/'audit_only'→'lite')

DO $$
DECLARE
    v_su  uuid := '00000000-0000-0000-0000-000000000000';
    v_iam text;
    v_fnd text;
BEGIN
    SELECT id::text INTO v_iam FROM shared.module WHERE code = 'IAM';
    SELECT id::text INTO v_fnd FROM shared.module WHERE code = 'FND';

    -- ── 1. tenant ────────────────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_iam, 'tenant', 'TNT', 'tenant', 'MASTER', 'system', 'ent', 'table',
        'full', 'platform_critical', 'locked', 'master', 'tenant',
        'Tenant', 'Tenants', 'building-2', 'indigo',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 2. principal ─────────────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_iam, 'principal', 'PRIN', 'principal', 'MASTER', 'system', 'ent', 'table',
        'full', 'platform_critical', 'controlled', 'master', 'principal',
        'User', 'Users', 'user', 'blue',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 3. principal_profile ─────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_iam, 'principal_profile', 'PRINP', 'principal_profile', 'MASTER', 'system', 'ent', 'table',
        'full', 'tenant_critical', 'controlled', 'master', 'principal_profile',
        'User Profile', 'User Profiles', 'user-circle', 'blue',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 4. principal_identity_binding ────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_iam, 'principal_identity_binding', 'PIB', 'principal_identity_binding', 'CONTROL', 'system', 'ent', 'table',
        'full', 'platform_critical', 'locked', 'master', 'principal_identity_binding',
        'Identity Binding', 'Identity Bindings', 'link', 'gray',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 5. contact_link ──────────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_iam, 'contact_link', 'CLINK', 'contact_link', 'RELATION', 'system', 'ent', 'table',
        'standard', 'operational', 'controlled', 'master', 'contact_link',
        'Contact Link', 'Contact Links', 'contact', 'gray',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 6. contact_email ─────────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_iam, 'contact_email', 'CEMAIL', 'contact_email', 'RELATION', 'system', 'ent', 'table',
        'standard', 'operational', 'controlled', 'master', 'contact_email',
        'Contact Email', 'Contact Emails', 'mail', 'gray',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 7. contact_phone ─────────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_iam, 'contact_phone', 'CPHONE', 'contact_phone', 'RELATION', 'system', 'ent', 'table',
        'standard', 'operational', 'controlled', 'master', 'contact_phone',
        'Contact Phone', 'Contact Phones', 'phone', 'gray',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 8. label ─────────────────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_fnd, 'label', 'LBL', 'label', 'REFERENCE', 'system', 'ent', 'table',
        'standard', 'config', 'locked', 'master', 'label',
        'Label', 'Labels', 'tag', 'gray',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 9. label_entity_type ─────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_fnd, 'label_entity_type', 'LBENT', 'label_entity_type', 'RELATION', 'system', 'ent', 'table',
        'standard', 'config', 'controlled', 'master', 'label_entity_type',
        'Label Entity Type', 'Label Entity Types', 'tags', 'gray',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 10. owner_type ───────────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_fnd, 'owner_type', 'OWNTP', 'owner_type', 'REFERENCE', 'system', 'ent', 'table',
        'standard', 'config', 'locked', 'master', 'owner_type',
        'Owner Type', 'Owner Types', 'shield', 'gray',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 11. address ──────────────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_iam, 'address', 'ADDR', 'address', 'MASTER', 'system', 'ent', 'table',
        'full', 'operational', 'controlled', 'master', 'address',
        'Address', 'Addresses', 'map-pin', 'gray',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 12. address_link ─────────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_iam, 'address_link', 'ADDRL', 'address_link', 'RELATION', 'system', 'ent', 'table',
        'full', 'operational', 'controlled', 'master', 'address_link',
        'Address Link', 'Address Links', 'map-pin', 'gray',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 13. tenant_module_subscription ───────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_iam, 'tenant_module_subscription', 'TMS', 'tenant_module_subscription', 'CONTROL', 'system', 'ent', 'table',
        'full', 'tenant_critical', 'locked', 'master', 'tenant_module_subscription',
        'Module Subscription', 'Module Subscriptions', 'package-check', 'blue',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 14. tenant_feature_entitlement ───────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_iam, 'tenant_feature_entitlement', 'TFE', 'tenant_feature_entitlement', 'CONTROL', 'system', 'ent', 'table',
        'full', 'tenant_critical', 'locked', 'master', 'tenant_feature_entitlement',
        'Feature Entitlement', 'Feature Entitlements', 'unlock', 'blue',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 15. tenant_permission_override ───────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_iam, 'tenant_permission_override', 'TPO', 'tenant_permission_override', 'CONTROL', 'system', 'ent', 'table',
        'full', 'platform_critical', 'locked', 'master', 'tenant_permission_override',
        'Permission Override', 'Permission Overrides', 'shield-alert', 'red',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 16. company_code_access ──────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_iam, 'company_code_access', 'CCA', 'company_code_access', 'CONTROL', 'system', 'ent', 'table',
        'full', 'tenant_critical', 'controlled', 'master', 'company_code_access',
        'Company Code Access', 'Company Code Access', 'key-square', 'blue',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 17. auth_group ───────────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_iam, 'auth_group', 'AGRP', 'auth_group', 'MASTER', 'system', 'ent', 'table',
        'full', 'tenant_critical', 'controlled', 'master', 'auth_group',
        'Group', 'Groups', 'users', 'blue',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 18. auth_group_role ──────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_iam, 'auth_group_role', 'AGRL', 'auth_group_role', 'RELATION', 'system', 'ent', 'table',
        'full', 'tenant_critical', 'controlled', 'master', 'auth_group_role',
        'Group Role', 'Group Roles', 'shield-check', 'blue',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 19. auth_group_member ────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_iam, 'auth_group_member', 'AGMB', 'auth_group_member', 'RELATION', 'system', 'ent', 'table',
        'full', 'tenant_critical', 'controlled', 'master', 'auth_group_member',
        'Group Member', 'Group Members', 'user-plus', 'blue',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 20. principal_persona ────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_iam, 'principal_persona', 'PPRS', 'principal_persona', 'RELATION', 'system', 'ent', 'table',
        'full', 'tenant_critical', 'controlled', 'master', 'principal_persona',
        'User Persona', 'User Personas', 'badge', 'blue',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 21. team ─────────────────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_iam, 'team', 'TEAM', 'team', 'MASTER', 'system', 'ent', 'table',
        'full', 'operational', 'controlled', 'master', 'team',
        'Team', 'Teams', 'users-round', 'cyan',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 22. team_member ──────────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_iam, 'team_member', 'TMBR', 'team_member', 'RELATION', 'system', 'ent', 'table',
        'full', 'operational', 'controlled', 'master', 'team_member',
        'Team Member', 'Team Members', 'user-check', 'cyan',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 23. access_grant ─────────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_iam, 'access_grant', 'AGRANT', 'access_grant', 'CONTROL', 'system', 'ent', 'table',
        'full', 'platform_critical', 'controlled', 'master', 'access_grant',
        'Access Grant', 'Access Grants', 'key', 'red',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 24. group_feature_grant ──────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_iam, 'group_feature_grant', 'GFGR', 'group_feature_grant', 'CONTROL', 'system', 'ent', 'table',
        'full', 'tenant_critical', 'controlled', 'master', 'group_feature_grant',
        'Group Feature Grant', 'Group Feature Grants', 'award', 'blue',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 25. principal_feature_grant ──────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_iam, 'principal_feature_grant', 'PFGR', 'principal_feature_grant', 'CONTROL', 'system', 'ent', 'table',
        'full', 'tenant_critical', 'controlled', 'master', 'principal_feature_grant',
        'User Feature Grant', 'User Feature Grants', 'star', 'blue',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 26. delegation_grant ─────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_iam, 'delegation_grant', 'DLGR', 'delegation_grant', 'CONTROL', 'system', 'ent', 'table',
        'full', 'tenant_critical', 'controlled', 'master', 'delegation_grant',
        'Delegation Grant', 'Delegation Grants', 'share-2', 'purple',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

END $$;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/010_system/entity_engine/020_entities/002_master_notifications.sql
-- 020_entities/002_master_notifications.sql
-- Entities 27–29: Notifications & Tenant Config
-- Depends on: shared.module rows (NTF, IAM)

DO $$
DECLARE
    v_su  uuid := '00000000-0000-0000-0000-000000000000';
    v_ntf text;
    v_iam text;
BEGIN
    SELECT id::text INTO v_ntf FROM shared.module WHERE code = 'NTF';
    SELECT id::text INTO v_iam FROM shared.module WHERE code = 'IAM';

    -- ── 27. notification ─────────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_ntf, 'notification', 'NOTIF', 'notification', 'LOG', 'system', 'ent', 'table',
        'lite', 'operational', 'locked', 'master', 'notification',
        'Notification', 'Notifications', 'bell', 'amber',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 28. notification_default ─────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_ntf, 'notification_default', 'NOTIFD', 'notification_default', 'CONTROL', 'system', 'ent', 'table',
        'standard', 'config', 'controlled', 'master', 'notification_default',
        'Notification Default', 'Notification Defaults', 'bell-ring', 'amber',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 29. tenant_profile ───────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_iam, 'tenant_profile', 'TNTP', 'tenant_profile', 'MASTER', 'system', 'ent', 'table',
        'full', 'tenant_critical', 'controlled', 'master', 'tenant_profile',
        'Tenant Profile', 'Tenant Profiles', 'building', 'indigo',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

END $$;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/010_system/entity_engine/020_entities/003_master_content.sql
-- 020_entities/003_master_content.sql
-- Entities 30–40: Attachments & Comments (Content/Activity)
-- Depends on: shared.module rows (CMS, ACT)

DO $$
DECLARE
    v_su  uuid := '00000000-0000-0000-0000-000000000000';
    v_cms text;
    v_act text;
BEGIN
    SELECT id::text INTO v_cms FROM shared.module WHERE code = 'CMS';
    SELECT id::text INTO v_act FROM shared.module WHERE code = 'ACT';

    -- ── 30. attachment ───────────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_cms, 'attachment', 'ATTACH', 'attachment', 'MASTER', 'system', 'ent', 'table',
        'full', 'operational', 'controlled', 'master', 'attachment',
        'Attachment', 'Attachments', 'paperclip', 'amber',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 31. multipart_upload ─────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_cms, 'multipart_upload', 'MPU', 'multipart_upload', 'CONTROL', 'system', 'ent', 'table',
        'standard', 'operational', 'locked', 'master', 'multipart_upload',
        'Multipart Upload', 'Multipart Uploads', 'upload-cloud', 'amber',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 32. attachment_acl ───────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_cms, 'attachment_acl', 'AACL', 'attachment_acl', 'CONTROL', 'system', 'ent', 'table',
        'full', 'tenant_critical', 'controlled', 'master', 'attachment_acl',
        'Attachment Access', 'Attachment Access', 'shield', 'amber',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 33. comment ──────────────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_act, 'comment', 'CMT', 'comment', 'DOCUMENT', 'system', 'ent', 'table',
        'full', 'operational', 'controlled', 'master', 'comment',
        'Comment', 'Comments', 'message-square', 'purple',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 34. comment_draft ────────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_act, 'comment_draft', 'CMTD', 'comment_draft', 'DOCUMENT', 'system', 'ent', 'table',
        'standard', 'operational', 'controlled', 'master', 'comment_draft',
        'Comment Draft', 'Comment Drafts', 'pencil', 'purple',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 35. comment_mention ──────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_act, 'comment_mention', 'CMTM', 'comment_mention', 'RELATION', 'system', 'ent', 'table',
        'standard', 'operational', 'locked', 'master', 'comment_mention',
        'Comment Mention', 'Comment Mentions', 'at-sign', 'purple',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 36. comment_reaction ─────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_act, 'comment_reaction', 'CMTR', 'comment_reaction', 'RELATION', 'system', 'ent', 'table',
        'standard', 'operational', 'locked', 'master', 'comment_reaction',
        'Comment Reaction', 'Comment Reactions', 'smile', 'purple',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 37. conversation ─────────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_act, 'conversation', 'CONV', 'conversation', 'MASTER', 'system', 'ent', 'table',
        'full', 'operational', 'controlled', 'master', 'conversation',
        'Conversation', 'Conversations', 'messages-square', 'purple',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 38. conversation_participant ─────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_act, 'conversation_participant', 'CONVP', 'conversation_participant', 'RELATION', 'system', 'ent', 'table',
        'standard', 'operational', 'controlled', 'master', 'conversation_participant',
        'Conversation Participant', 'Conversation Participants', 'user-round', 'purple',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 39. attachment_comment ───────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_act, 'attachment_comment', 'ACMT', 'attachment_comment', 'RELATION', 'system', 'ent', 'table',
        'standard', 'operational', 'locked', 'master', 'attachment_comment',
        'Attachment Comment', 'Attachment Comments', 'file-text', 'purple',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 40. comment_feed_cursor ──────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_act, 'comment_feed_cursor', 'CFCRS', 'comment_feed_cursor', 'CONTROL', 'system', 'ent', 'table',
        'lite', 'config', 'locked', 'master', 'comment_feed_cursor',
        'Feed Cursor', 'Feed Cursors', 'mouse-pointer', 'gray',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

END $$;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/010_system/entity_engine/020_entities/004_master_doc_template.sql
-- 020_entities/004_master_doc_template.sql
-- Entities 41–48: Document & Template Framework
-- Depends on: shared.module rows (DOC, WFL)

DO $$
DECLARE
    v_su  uuid := '00000000-0000-0000-0000-000000000000';
    v_doc text;
    v_wfl text;
BEGIN
    SELECT id::text INTO v_doc FROM shared.module WHERE code = 'DOC';
    SELECT id::text INTO v_wfl FROM shared.module WHERE code = 'WFL';

    -- ── 41. document ─────────────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_doc, 'document', 'MDOC', 'document', 'MASTER', 'system', 'ent', 'table',
        'full', 'operational', 'controlled', 'master', 'document',
        'Document', 'Documents', 'file-text', 'violet',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 42. brand_profile ────────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_doc, 'brand_profile', 'BRAND', 'brand_profile', 'MASTER', 'system', 'ent', 'table',
        'standard', 'config', 'controlled', 'master', 'brand_profile',
        'Brand Profile', 'Brand Profiles', 'palette', 'violet',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 43. letterhead ───────────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_doc, 'letterhead', 'LHD', 'letterhead', 'MASTER', 'system', 'ent', 'table',
        'standard', 'config', 'controlled', 'master', 'letterhead',
        'Letterhead', 'Letterheads', 'scroll', 'violet',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 44. template ─────────────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_doc, 'template', 'TMPL', 'template', 'MASTER', 'system', 'ent', 'table',
        'standard', 'config', 'controlled', 'master', 'template',
        'Template', 'Templates', 'layout-template', 'violet',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 45. template_binding ─────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_doc, 'template_binding', 'TMPLB', 'template_binding', 'RELATION', 'system', 'ent', 'table',
        'standard', 'config', 'controlled', 'master', 'template_binding',
        'Template Binding', 'Template Bindings', 'link-2', 'violet',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 46. entity_document_link ─────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_doc, 'entity_document_link', 'EDOC', 'entity_document_link', 'RELATION', 'system', 'ent', 'table',
        'standard', 'operational', 'controlled', 'master', 'entity_document_link',
        'Entity Document Link', 'Entity Document Links', 'file-symlink', 'violet',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 47. lifecycle_instance ───────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_wfl, 'lifecycle_instance', 'LCINS', 'lifecycle_instance', 'CONTROL', 'system', 'ent', 'table',
        'full', 'operational', 'locked', 'master', 'lifecycle_instance',
        'Lifecycle Instance', 'Lifecycle Instances', 'git-commit', 'teal',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 48. print_profile ────────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_doc, 'print_profile', 'PRFIL', 'print_profile', 'MASTER', 'system', 'ent', 'table',
        'standard', 'config', 'controlled', 'master', 'print_profile',
        'Print Profile', 'Print Profiles', 'printer', 'violet',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

END $$;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/010_system/entity_engine/020_entities/005_master_finance_org.sql
-- 020_entities/005_master_finance_org.sql
-- Entities 49–54: Finance Master — Core Org
-- Depends on: shared.module rows (ACC)

DO $$
DECLARE
    v_su  uuid := '00000000-0000-0000-0000-000000000000';
    v_acc text;
BEGIN
    SELECT id::text INTO v_acc FROM shared.module WHERE code = 'ACC';

    -- ── 49. legal_entity ─────────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_acc, 'legal_entity', 'LE', 'legal_entity', 'MASTER', 'system', 'ent', 'table',
        'full', 'tenant_critical', 'controlled', 'master', 'legal_entity',
        'Legal Entity', 'Legal Entities', 'building-2', 'emerald',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 50. company_code ─────────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_acc, 'company_code', 'CC', 'company_code', 'MASTER', 'system', 'ent', 'table',
        'full', 'tenant_critical', 'controlled', 'master', 'company_code',
        'Company Code', 'Company Codes', 'briefcase', 'emerald',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 51. cost_center ──────────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_acc, 'cost_center', 'CCTR', 'cost_center', 'MASTER', 'system', 'ent', 'table',
        'full', 'operational', 'controlled', 'master', 'cost_center',
        'Cost Center', 'Cost Centers', 'target', 'emerald',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 52. profit_center ────────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_acc, 'profit_center', 'PCTR', 'profit_center', 'MASTER', 'system', 'ent', 'table',
        'full', 'operational', 'controlled', 'master', 'profit_center',
        'Profit Center', 'Profit Centers', 'trending-up', 'emerald',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 53. site ─────────────────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_acc, 'site', 'SITE', 'site', 'MASTER', 'system', 'ent', 'table',
        'full', 'operational', 'controlled', 'master', 'site',
        'Site', 'Sites', 'map-pin', 'emerald',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 54. warehouse ────────────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_acc, 'warehouse', 'WHS', 'warehouse', 'MASTER', 'system', 'ent', 'table',
        'full', 'operational', 'controlled', 'master', 'warehouse',
        'Warehouse', 'Warehouses', 'warehouse', 'emerald',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

END $$;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/010_system/entity_engine/020_entities/006_master_coa_gl.sql
-- 020_entities/006_master_coa_gl.sql
-- Entities 55–60: Finance Master — Chart of Accounts & GL
-- Depends on: shared.module rows (ACC)

DO $$
DECLARE
    v_su  uuid := '00000000-0000-0000-0000-000000000000';
    v_acc text;
BEGIN
    SELECT id::text INTO v_acc FROM shared.module WHERE code = 'ACC';

    -- ── 55. chart_of_account ─────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_acc, 'chart_of_account', 'COA', 'chart_of_account', 'MASTER', 'system', 'ent', 'table',
        'full', 'tenant_critical', 'controlled', 'master', 'chart_of_account',
        'Chart of Accounts', 'Charts of Accounts', 'list-tree', 'green',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 56. gl_account ───────────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_acc, 'gl_account', 'GLA', 'gl_account', 'MASTER', 'system', 'ent', 'table',
        'full', 'tenant_critical', 'controlled', 'master', 'gl_account',
        'GL Account', 'GL Accounts', 'book-open', 'green',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 57. company_code_chart_assignment ────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_acc, 'company_code_chart_assignment', 'CCCOA', 'company_code_chart_assignment', 'RELATION', 'system', 'ent', 'table',
        'full', 'tenant_critical', 'controlled', 'master', 'company_code_chart_assignment',
        'COA Assignment', 'COA Assignments', 'link', 'green',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 58. company_code_gl_account ──────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_acc, 'company_code_gl_account', 'CCGLA', 'company_code_gl_account', 'RELATION', 'system', 'ent', 'table',
        'full', 'tenant_critical', 'controlled', 'master', 'company_code_gl_account',
        'Company GL Account', 'Company GL Accounts', 'book-copy', 'green',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 59. ledger_book ──────────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_acc, 'ledger_book', 'LBK', 'ledger_book', 'MASTER', 'system', 'ent', 'table',
        'full', 'tenant_critical', 'controlled', 'master', 'ledger_book',
        'Ledger Book', 'Ledger Books', 'book', 'green',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 60. company_code_book_assignment ─────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_acc, 'company_code_book_assignment', 'CCBK', 'company_code_book_assignment', 'RELATION', 'system', 'ent', 'table',
        'full', 'tenant_critical', 'controlled', 'master', 'company_code_book_assignment',
        'Book Assignment', 'Book Assignments', 'link-2', 'green',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

END $$;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/010_system/entity_engine/020_entities/007_master_project_fiscal.sql
-- 020_entities/007_master_project_fiscal.sql
-- Entities 61–64: Finance Master — Projects & Fiscal
-- Depends on: shared.module rows (ACC)

DO $$
DECLARE
    v_su  uuid := '00000000-0000-0000-0000-000000000000';
    v_acc text;
BEGIN
    SELECT id::text INTO v_acc FROM shared.module WHERE code = 'ACC';

    -- ── 61. project ──────────────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_acc, 'project', 'PROJ', 'project', 'MASTER', 'system', 'ent', 'table',
        'full', 'operational', 'extensible', 'master', 'project',
        'Project', 'Projects', 'folder-kanban', 'teal',
        false, '{"is_approvable":false}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 62. project_item ─────────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_acc, 'project_item', 'PRJIT', 'project_item', 'DOCUMENT_RELATION', 'system', 'ent', 'table',
        'full', 'operational', 'extensible', 'master', 'project_item',
        'Project Item', 'Project Items', 'list-checks', 'teal',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 63. dimension_set ────────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_acc, 'dimension_set', 'DMSET', 'dimension_set', 'MASTER', 'system', 'ent', 'table',
        'full', 'operational', 'controlled', 'master', 'dimension_set',
        'Dimension Set', 'Dimension Sets', 'layers-3', 'teal',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 64. fiscal_period ────────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_acc, 'fiscal_period', 'FPER', 'fiscal_period', 'MASTER', 'system', 'ent', 'table',
        'full', 'tenant_critical', 'locked', 'master', 'fiscal_period',
        'Fiscal Period', 'Fiscal Periods', 'calendar', 'green',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

END $$;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/010_system/entity_engine/020_entities/008_master_partners.sql
-- 020_entities/008_master_partners.sql
-- Entities 65–69: Business Partners
-- Depends on: shared.module rows (ACC, IAM)

DO $$
DECLARE
    v_su  uuid := '00000000-0000-0000-0000-000000000000';
    v_acc text;
    v_iam text;
BEGIN
    SELECT id::text INTO v_acc FROM shared.module WHERE code = 'ACC';
    SELECT id::text INTO v_iam FROM shared.module WHERE code = 'IAM';

    -- ── 65. customer ─────────────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_acc, 'customer', 'CUST', 'customer', 'MASTER', 'system', 'ent', 'table',
        'full', 'operational', 'extensible', 'master', 'customer',
        'Customer', 'Customers', 'user-round', 'sky',
        false, '{"is_approvable":false}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 66. supplier ─────────────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_acc, 'supplier', 'SUPP', 'supplier', 'MASTER', 'system', 'ent', 'table',
        'full', 'operational', 'extensible', 'master', 'supplier',
        'Supplier', 'Suppliers', 'truck', 'orange',
        false, '{"is_approvable":false}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 67. employee ─────────────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_iam, 'employee', 'EMP', 'employee', 'MASTER', 'system', 'ent', 'table',
        'full', 'tenant_critical', 'controlled', 'master', 'employee',
        'Employee', 'Employees', 'user-tie', 'blue',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 68. company_code_customer_profile ────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_acc, 'company_code_customer_profile', 'CCCP', 'company_code_customer_profile', 'MASTER', 'system', 'ent', 'table',
        'full', 'operational', 'controlled', 'master', 'company_code_customer_profile',
        'Customer Company Profile', 'Customer Company Profiles', 'user-cog', 'sky',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 69. company_code_supplier_profile ────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_acc, 'company_code_supplier_profile', 'CCSUP', 'company_code_supplier_profile', 'MASTER', 'system', 'ent', 'table',
        'full', 'operational', 'controlled', 'master', 'company_code_supplier_profile',
        'Supplier Company Profile', 'Supplier Company Profiles', 'truck', 'orange',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

END $$;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/010_system/entity_engine/020_entities/009_master_assets.sql
-- 020_entities/009_master_assets.sql
-- Entities 70–74: Assets
-- Depends on: shared.module rows (ACC)

DO $$
DECLARE
    v_su  uuid := '00000000-0000-0000-0000-000000000000';
    v_acc text;
BEGIN
    SELECT id::text INTO v_acc FROM shared.module WHERE code = 'ACC';

    -- ── 70. asset_class ──────────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_acc, 'asset_class', 'ASCLS', 'asset_class', 'MASTER', 'system', 'ent', 'table',
        'full', 'config', 'controlled', 'master', 'asset_class',
        'Asset Class', 'Asset Classes', 'layers', 'yellow',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 71. asset ────────────────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_acc, 'asset', 'ASSET', 'asset', 'MASTER', 'system', 'ent', 'table',
        'full', 'operational', 'extensible', 'master', 'asset',
        'Asset', 'Assets', 'hard-drive', 'yellow',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 72. asset_book ───────────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_acc, 'asset_book', 'ASTBK', 'asset_book', 'DOCUMENT_RELATION', 'system', 'ent', 'table',
        'full', 'operational', 'controlled', 'master', 'asset_book',
        'Asset Book', 'Asset Books', 'book-marked', 'yellow',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 73. asset_component ──────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_acc, 'asset_component', 'ASTCMP', 'asset_component', 'DOCUMENT_RELATION', 'system', 'ent', 'table',
        'full', 'operational', 'controlled', 'master', 'asset_component',
        'Asset Component', 'Asset Components', 'cpu', 'yellow',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 74. asset_assignment_history ─────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_acc, 'asset_assignment_history', 'ASTASGN', 'asset_assignment_history', 'LOG', 'system', 'ent', 'table',
        'lite', 'operational', 'locked', 'master', 'asset_assignment_history',
        'Asset Assignment History', 'Asset Assignment History', 'history', 'yellow',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

END $$;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/010_system/entity_engine/020_entities/010_master_dimensions.sql
-- 020_entities/010_master_dimensions.sql
-- Entities 75–80: Dimensions & Analytics
-- Depends on: shared.module rows (ACC)

DO $$
DECLARE
    v_su  uuid := '00000000-0000-0000-0000-000000000000';
    v_acc text;
BEGIN
    SELECT id::text INTO v_acc FROM shared.module WHERE code = 'ACC';

    -- ── 75. dimension_type ───────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_acc, 'dimension_type', 'DMTP', 'dimension_type', 'DIMENSION', 'system', 'ent', 'table',
        'full', 'operational', 'extensible', 'master', 'dimension_type',
        'Dimension Type', 'Dimension Types', 'layout-grid', 'teal',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 76. dimension_value ──────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_acc, 'dimension_value', 'DMVAL', 'dimension_value', 'DIMENSION', 'system', 'ent', 'table',
        'full', 'operational', 'extensible', 'master', 'dimension_value',
        'Dimension Value', 'Dimension Values', 'tag', 'teal',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 77. dimension_set_item ───────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_acc, 'dimension_set_item', 'DMSIT', 'dimension_set_item', 'RELATION', 'system', 'ent', 'table',
        'standard', 'operational', 'controlled', 'master', 'dimension_set_item',
        'Dimension Set Item', 'Dimension Set Items', 'list-plus', 'teal',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 78. business_intent ──────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_acc, 'business_intent', 'BINT', 'business_intent', 'CONTROL', 'system', 'ent', 'table',
        'full', 'tenant_critical', 'controlled', 'master', 'business_intent',
        'Business Intent', 'Business Intents', 'lightbulb', 'teal',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 79. company_code_intent_policy ───────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_acc, 'company_code_intent_policy', 'CCIP', 'company_code_intent_policy', 'CONTROL', 'system', 'ent', 'table',
        'full', 'tenant_critical', 'controlled', 'master', 'company_code_intent_policy',
        'Company Intent Policy', 'Company Intent Policies', 'shield-check', 'teal',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 80. company_code_dimension_default ───────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_acc, 'company_code_dimension_default', 'CCDD', 'company_code_dimension_default', 'CONTROL', 'system', 'ent', 'table',
        'full', 'operational', 'controlled', 'master', 'company_code_dimension_default',
        'Dimension Default', 'Dimension Defaults', 'settings', 'teal',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

END $$;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/010_system/entity_engine/020_entities/011_master_tax_fx.sql
-- 020_entities/011_master_tax_fx.sql
-- Entities 81–83: Tax, FX & Treasury
-- Depends on: shared.module rows (ACC, TREASURY)

DO $$
DECLARE
    v_su      uuid := '00000000-0000-0000-0000-000000000000';
    v_acc     text;
    v_treasury text;
BEGIN
    SELECT id::text INTO v_acc     FROM shared.module WHERE code = 'ACC';
    SELECT id::text INTO v_treasury FROM shared.module WHERE code = 'TREASURY';

    -- ── 81. tax_jurisdiction ─────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_acc, 'tax_jurisdiction', 'TAXJ', 'tax_jurisdiction', 'MASTER', 'system', 'ent', 'table',
        'full', 'operational', 'controlled', 'master', 'tax_jurisdiction',
        'Tax Jurisdiction', 'Tax Jurisdictions', 'landmark', 'orange',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 82. tax_type ─────────────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_acc, 'tax_type', 'TAXTP', 'tax_type', 'MASTER', 'system', 'ent', 'table',
        'full', 'operational', 'controlled', 'master', 'tax_type',
        'Tax Type', 'Tax Types', 'percent', 'orange',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 83. fx_rate ──────────────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_treasury, 'fx_rate', 'FXR', 'fx_rate', 'MASTER', 'system', 'ent', 'table',
        'full', 'operational', 'locked', 'master', 'fx_rate',
        'FX Rate', 'FX Rates', 'arrow-right-left', 'orange',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

END $$;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/010_system/entity_engine/020_entities/012_master_budget.sql
-- 020_entities/012_master_budget.sql
-- Entities 84–86: Budget & Planning
-- Depends on: shared.module rows (BUDGET)

DO $$
DECLARE
    v_su     uuid := '00000000-0000-0000-0000-000000000000';
    v_budget text;
BEGIN
    SELECT id::text INTO v_budget FROM shared.module WHERE code = 'BUDGET';

    -- ── 84. budget_profile ───────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_budget, 'budget_profile', 'BUDGP', 'budget_profile', 'MASTER', 'system', 'ent', 'table',
        'full', 'operational', 'controlled', 'master', 'budget_profile',
        'Budget Profile', 'Budget Profiles', 'pie-chart', 'green',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 85. budget_allocation ────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_budget, 'budget_allocation', 'BUDGA', 'budget_allocation', 'DOCUMENT', 'system', 'ent', 'table',
        'full', 'operational', 'controlled', 'master', 'budget_allocation',
        'Budget Allocation', 'Budget Allocations', 'bar-chart-3', 'green',
        false, '{"is_approvable":true}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 86. planning_model ───────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_budget, 'planning_model', 'PLNM', 'planning_model', 'MASTER', 'system', 'ent', 'table',
        'full', 'operational', 'controlled', 'master', 'planning_model',
        'Planning Model', 'Planning Models', 'network', 'green',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

END $$;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/010_system/entity_engine/020_entities/013_master_banking.sql
-- 020_entities/013_master_banking.sql
-- Entities 87–91: Banking & Payments
-- Depends on: shared.module rows (PAY)

DO $$
DECLARE
    v_su  uuid := '00000000-0000-0000-0000-000000000000';
    v_pay text;
BEGIN
    SELECT id::text INTO v_pay FROM shared.module WHERE code = 'PAY';

    -- ── 87. bank_party ───────────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_pay, 'bank_party', 'BKPTY', 'bank_party', 'MASTER', 'system', 'ent', 'table',
        'full', 'operational', 'controlled', 'master', 'bank_party',
        'Bank', 'Banks', 'landmark', 'blue',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 88. bank_account ─────────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_pay, 'bank_account', 'BKACC', 'bank_account', 'MASTER', 'system', 'ent', 'table',
        'full', 'tenant_critical', 'controlled', 'master', 'bank_account',
        'Bank Account', 'Bank Accounts', 'credit-card', 'blue',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 89. bank_account_link ────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_pay, 'bank_account_link', 'BKACCL', 'bank_account_link', 'RELATION', 'system', 'ent', 'table',
        'full', 'tenant_critical', 'controlled', 'master', 'bank_account_link',
        'Bank Account Link', 'Bank Account Links', 'link', 'blue',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 90. bank_account_house_config ────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_pay, 'bank_account_house_config', 'BKHCFG', 'bank_account_house_config', 'CONTROL', 'system', 'ent', 'table',
        'full', 'tenant_critical', 'controlled', 'master', 'bank_account_house_config',
        'House Bank Config', 'House Bank Configs', 'settings', 'blue',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 91. payment_method ───────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_pay, 'payment_method', 'PMTM', 'payment_method', 'MASTER', 'system', 'ent', 'table',
        'full', 'operational', 'controlled', 'master', 'payment_method',
        'Payment Method', 'Payment Methods', 'wallet', 'blue',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

END $$;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/010_system/entity_engine/020_entities/014_master_payment_terms.sql
-- 020_entities/014_master_payment_terms.sql
-- Entities 92–96: Payment Terms & Calendar
-- Depends on: shared.module rows (PAY)

DO $$
DECLARE
    v_su  uuid := '00000000-0000-0000-0000-000000000000';
    v_pay text;
BEGIN
    SELECT id::text INTO v_pay FROM shared.module WHERE code = 'PAY';

    -- ── 92. holiday_calendar ─────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_pay, 'holiday_calendar', 'HOLCAL', 'holiday_calendar', 'MASTER', 'system', 'ent', 'table',
        'full', 'config', 'controlled', 'master', 'holiday_calendar',
        'Holiday Calendar', 'Holiday Calendars', 'calendar-days', 'slate',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 93. holiday_calendar_day ─────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_pay, 'holiday_calendar_day', 'HOLCALD', 'holiday_calendar_day', 'RELATION', 'system', 'ent', 'table',
        'standard', 'config', 'locked', 'master', 'holiday_calendar_day',
        'Holiday', 'Holidays', 'sun', 'slate',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 94. payment_term ─────────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_pay, 'payment_term', 'PMTT', 'payment_term', 'MASTER', 'system', 'ent', 'table',
        'full', 'operational', 'controlled', 'master', 'payment_term',
        'Payment Term', 'Payment Terms', 'clock', 'slate',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 95. payment_term_clause ──────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_pay, 'payment_term_clause', 'PMTTC', 'payment_term_clause', 'RELATION', 'system', 'ent', 'table',
        'full', 'operational', 'controlled', 'master', 'payment_term_clause',
        'Payment Term Clause', 'Payment Term Clauses', 'file-text', 'slate',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 96. payment_term_discount_tier ───────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_pay, 'payment_term_discount_tier', 'PMTTDT', 'payment_term_discount_tier', 'RELATION', 'system', 'ent', 'table',
        'full', 'operational', 'controlled', 'master', 'payment_term_discount_tier',
        'Discount Tier', 'Discount Tiers', 'percent', 'slate',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

END $$;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/010_system/entity_engine/020_entities/015_master_products.sql
-- 020_entities/015_master_products.sql
-- Entities 97–102: Products, Items & Classification
-- Depends on: shared.module rows (REL)

DO $$
DECLARE
    v_su  uuid := '00000000-0000-0000-0000-000000000000';
    v_rel text;
    v_acc text;
BEGIN
    SELECT id::text INTO v_rel FROM shared.module WHERE code = 'REL';
    SELECT id::text INTO v_acc FROM shared.module WHERE code = 'ACC';

    -- ── 97. product ──────────────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_rel, 'product', 'PROD', 'product', 'MASTER', 'system', 'ent', 'table',
        'full', 'operational', 'extensible', 'master', 'product',
        'Product', 'Products', 'package', 'rose',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 98. item ─────────────────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_rel, 'item', 'ITEM', 'item', 'MASTER', 'system', 'ent', 'table',
        'full', 'operational', 'extensible', 'master', 'item',
        'Item', 'Items', 'box', 'rose',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 99. item_category ────────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_rel, 'item_category', 'ITEMCAT', 'item_category', 'MASTER', 'system', 'ent', 'table',
        'full', 'operational', 'extensible', 'master', 'item_category',
        'Item Category', 'Item Categories', 'folder-tree', 'rose',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 100. commodity_classification ────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_rel, 'commodity_classification', 'COMCL', 'commodity_classification', 'RELATION', 'system', 'ent', 'table',
        'full', 'operational', 'controlled', 'master', 'commodity_classification',
        'Commodity Classification', 'Commodity Classifications', 'tags', 'rose',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 101. spend_category ──────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_rel, 'spend_category', 'SCAT', 'spend_category', 'MASTER', 'system', 'ent', 'table',
        'full', 'operational', 'extensible', 'master', 'spend_category',
        'Spend Category', 'Spend Categories', 'shopping-cart', 'rose',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 102. company_code_spend_policy ───────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_acc, 'company_code_spend_policy', 'CCSPP', 'company_code_spend_policy', 'CONTROL', 'system', 'ent', 'table',
        'full', 'operational', 'controlled', 'master', 'company_code_spend_policy',
        'Spend Policy', 'Spend Policies', 'shield', 'rose',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

END $$;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/010_system/entity_engine/020_entities/016_master_ui.sql
-- 020_entities/016_master_ui.sql
-- Entities 103–111: UI & Personalization + CMS Content
-- Depends on: shared.module rows (FND, NTF, CMS)

DO $$
DECLARE
    v_su  uuid := '00000000-0000-0000-0000-000000000000';
    v_fnd text;
    v_ntf text;
    v_cms text;
BEGIN
    SELECT id::text INTO v_fnd FROM shared.module WHERE code = 'FND';
    SELECT id::text INTO v_ntf FROM shared.module WHERE code = 'NTF';
    SELECT id::text INTO v_cms FROM shared.module WHERE code = 'CMS';

    -- ── 103. principal_ui_profile ────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_fnd, 'principal_ui_profile', 'PUIP', 'principal_ui_profile', 'CONTROL', 'system', 'ent', 'table',
        'lite', 'config', 'controlled', 'master', 'principal_ui_profile',
        'UI Profile', 'UI Profiles', 'monitor', 'gray',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 104. principal_ui_preference ─────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_fnd, 'principal_ui_preference', 'PUIPR', 'principal_ui_preference', 'CONTROL', 'system', 'ent', 'table',
        'lite', 'config', 'controlled', 'master', 'principal_ui_preference',
        'UI Preference', 'UI Preferences', 'sliders', 'gray',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 105. saved_view ──────────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_fnd, 'saved_view', 'SVEW', 'saved_view', 'CONTROL', 'system', 'ent', 'table',
        'standard', 'config', 'controlled', 'master', 'saved_view',
        'Saved View', 'Saved Views', 'bookmark', 'gray',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 106. dashboard ───────────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_fnd, 'dashboard', 'DASH', 'dashboard', 'MASTER', 'system', 'ent', 'table',
        'standard', 'config', 'controlled', 'master', 'dashboard',
        'Dashboard', 'Dashboards', 'layout-dashboard', 'gray',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 107. dashboard_widget ────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_fnd, 'dashboard_widget', 'DASHWG', 'dashboard_widget', 'RELATION', 'system', 'ent', 'table',
        'standard', 'config', 'controlled', 'master', 'dashboard_widget',
        'Dashboard Widget', 'Dashboard Widgets', 'square', 'gray',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 108. principal_notification_preference ───────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_ntf, 'principal_notification_preference', 'PNTFP', 'principal_notification_preference', 'CONTROL', 'system', 'ent', 'table',
        'lite', 'config', 'controlled', 'master', 'principal_notification_preference',
        'Notification Preference', 'Notification Preferences', 'bell-cog', 'amber',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 109. content_item ────────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_cms, 'content_item', 'CTNT', 'content_item', 'MASTER', 'system', 'ent', 'table',
        'full', 'operational', 'controlled', 'master', 'content_item',
        'Content Item', 'Content Items', 'file-text', 'cyan',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 110. content_item_link ───────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_cms, 'content_item_link', 'CTNTL', 'content_item_link', 'RELATION', 'system', 'ent', 'table',
        'standard', 'operational', 'controlled', 'master', 'content_item_link',
        'Content Link', 'Content Links', 'link', 'cyan',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 111. content_item_access_grant ───────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_cms, 'content_item_access_grant', 'CTNTAG', 'content_item_access_grant', 'CONTROL', 'system', 'ent', 'table',
        'full', 'operational', 'controlled', 'master', 'content_item_access_grant',
        'Content Access Grant', 'Content Access Grants', 'shield-check', 'cyan',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

END $$;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/010_system/entity_engine/025_entity_versions.sql
-- 900_seed_data/010_system/entity_engine/025_entity_versions.sql
-- Creates version 1 (EFFECTIVE) for every master.* system entity registered above.
-- Run AFTER all 020_entities/*.sql files.
-- The entity INSERT trigger auto-creates entity_publish_state — do NOT seed it manually.
-- Idempotent: ON CONFLICT (entity_id, version_no) DO NOTHING

DO $$
DECLARE
    v_su uuid := '00000000-0000-0000-0000-000000000000';
    r    record;
    cnt  int := 0;
BEGIN
    FOR r IN
        SELECT e.id, e.tenant_id
        FROM   control.entity e
        WHERE  e.table_schema = 'master'
          AND  e.ownership_model = 'system'
          AND  NOT EXISTS (
              SELECT 1 FROM control.entity_version ev
              WHERE  ev.entity_id = e.id AND ev.version_no = 1
          )
        ORDER BY e.name
    LOOP
        INSERT INTO control.entity_version (
            entity_id, tenant_id, version_no, status,
            label, change_type, effective_from, created_by
        ) VALUES (
            r.id, r.tenant_id, 1, 'EFFECTIVE',
            'Initial version', 'structural',
            now(),
            v_su
        );
        cnt := cnt + 1;
    END LOOP;

    RAISE NOTICE 'control.entity_version: % rows inserted (version 1 for master system entities)', cnt;
END $$;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/010_system/entity_engine/030_canonical_fields/000_canonical_dictionary.sql
-- 030_canonical_fields/000_canonical_dictionary.sql
-- Seed: ~15 canonical field dictionary rows
-- entity_version_id IS NULL = global canonical field (cross-entity)
-- CHECK constraint ef_canonical_tenant_chk: canonical fields must have tenant_id IS NULL
-- Partial UNIQUE index ef_canonical_name_uidx: UNIQUE(name) WHERE entity_version_id IS NULL
-- Idempotent: ON CONFLICT DO NOTHING (via index)

DO $$
DECLARE
    v_su uuid := '00000000-0000-0000-0000-000000000000';
BEGIN

INSERT INTO control.entity_field (
    tenant_id, entity_version_id,
    name, column_name, label, description,
    data_type, ui_type, cardinality, origin,
    is_required, is_unique, is_searchable, is_filterable, is_sortable,
    is_read_only, is_write_once,
    applies_to_classes, is_required_default, is_filterable_default,
    sort_order, created_by
) VALUES

    -- ── System identity ──────────────────────────────────────────────────────
    (NULL, NULL,
     'id', 'id', 'ID', 'Primary key (UUIDv7)',
     'uuid', 'hidden', 'one', 'system',
     true, true, false, false, false,
     true, false,
     '{MASTER,CONTROL,DOCUMENT,DOCUMENT_RELATION,REFERENCE,RELATION,LOG,DIMENSION,AGGREGATE}',
     true, false,
     10, v_su),

    (NULL, NULL,
     'tenant_id', 'tenant_id', 'Tenant', 'Owning tenant reference',
     'uuid', 'hidden', 'one', 'system',
     true, false, false, true, false,
     true, false,
     '{MASTER,CONTROL,DOCUMENT,DOCUMENT_RELATION,RELATION,LOG,DIMENSION}',
     true, true,
     20, v_su),

    -- ── Standard identity ────────────────────────────────────────────────────
    (NULL, NULL,
     'code', 'code', 'Code', 'Unique business code / slug',
     'string', 'text', 'one', 'standard',
     true, true, true, true, true,
     false, false,
     '{MASTER,REFERENCE,DIMENSION}',
     true, true,
     30, v_su),

    (NULL, NULL,
     'name', 'name', 'Name', 'Display name',
     'string', 'text', 'one', 'standard',
     true, false, true, true, true,
     false, false,
     '{MASTER,REFERENCE,DIMENSION}',
     true, true,
     40, v_su),

    (NULL, NULL,
     'description', 'description', 'Description', 'Detailed description',
     'text', 'textarea', 'one', 'standard',
     false, false, true, false, false,
     false, false,
     '{MASTER,CONTROL,REFERENCE,DIMENSION}',
     false, false,
     50, v_su),

    -- ── Lifecycle / Status ───────────────────────────────────────────────────
    (NULL, NULL,
     'status', 'status', 'Status', 'Lifecycle status code',
     'string', 'status', 'one', 'system',
     true, false, false, true, true,
     true, false,
     '{MASTER,CONTROL,DOCUMENT,REFERENCE,DIMENSION}',
     true, true,
     900, v_su),

    (NULL, NULL,
     'is_active', 'is_active', 'Active', 'Computed active flag (status = active or ACTIVE)',
     'boolean', 'hidden', 'one', 'system',
     true, false, false, true, false,
     true, false,
     '{MASTER,CONTROL,DOCUMENT,REFERENCE,DIMENSION}',
     true, true,
     910, v_su),

    (NULL, NULL,
     'status_changed_at', 'status_changed_at', 'Status Changed', 'Timestamp of last status change',
     'timestamp', 'datetime', 'one', 'system',
     false, false, false, true, true,
     true, false,
     '{MASTER,DOCUMENT}',
     false, false,
     920, v_su),

    (NULL, NULL,
     'status_changed_by', 'status_changed_by', 'Status Changed By', 'Actor who last changed status',
     'uuid', 'reference', 'one', 'system',
     false, false, false, false, false,
     true, false,
     '{MASTER,DOCUMENT}',
     false, false,
     925, v_su),

    -- ── Metadata ─────────────────────────────────────────────────────────────
    (NULL, NULL,
     'metadata', 'metadata', 'Metadata', 'Extensible JSONB metadata bag',
     'json', 'json-editor', 'one', 'system',
     false, false, false, false, false,
     false, false,
     '{MASTER,CONTROL,DOCUMENT,DIMENSION}',
     false, false,
     930, v_su),

    (NULL, NULL,
     'tags', 'tags', 'Tags', 'JSONB string-array of user-defined tags',
     'json', 'tag-input', 'many', 'system',
     false, false, true, true, false,
     false, false,
     '{MASTER,DOCUMENT}',
     false, false,
     935, v_su),

    -- ── Audit trail ──────────────────────────────────────────────────────────
    (NULL, NULL,
     'created_at', 'created_at', 'Created', 'Row creation timestamp',
     'timestamp', 'datetime', 'one', 'system',
     true, false, false, true, true,
     true, false,
     '{MASTER,CONTROL,DOCUMENT,DOCUMENT_RELATION,REFERENCE,RELATION,LOG,DIMENSION,AGGREGATE}',
     true, true,
     950, v_su),

    (NULL, NULL,
     'created_by', 'created_by', 'Created By', 'Actor UUID who created the row',
     'uuid', 'reference', 'one', 'system',
     true, false, false, true, false,
     true, false,
     '{MASTER,CONTROL,DOCUMENT,DOCUMENT_RELATION,REFERENCE,RELATION,LOG,DIMENSION}',
     true, false,
     960, v_su),

    (NULL, NULL,
     'updated_at', 'updated_at', 'Updated', 'Timestamp of last update',
     'timestamp', 'datetime', 'one', 'system',
     false, false, false, true, true,
     true, false,
     '{MASTER,CONTROL,DOCUMENT}',
     false, false,
     970, v_su),

    (NULL, NULL,
     'updated_by', 'updated_by', 'Updated By', 'Actor UUID who last updated',
     'uuid', 'reference', 'one', 'system',
     false, false, false, false, false,
     true, false,
     '{MASTER,CONTROL,DOCUMENT}',
     false, false,
     980, v_su)

ON CONFLICT DO NOTHING;

RAISE NOTICE 'control.entity_field: canonical dictionary seeded (% rows if first run)',
    (SELECT count(*) FROM control.entity_field WHERE entity_version_id IS NULL);

END $$;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/010_system/entity_engine/035_version_fields/000_common_fields.sql
-- 035_version_fields/000_common_fields.sql
-- Bulk-seeds common system/standard fields for ALL master.* system entity versions.
-- These match columns present on every (or nearly every) master table.
-- Each pass uses a CROSS JOIN to stamp the same field across all applicable entity versions.
--
-- IMPORTANT: The EntityCompilerService reads entity_field WHERE entity_version_id = <versionId>.
-- The canonical dictionary (entity_version_id IS NULL) is NOT merged by the compiler —
-- version-bound rows are the authoritative source for all rendered fields.
--
-- Idempotent: ON CONFLICT DO NOTHING (via ef_version_name_uidx: UNIQUE(entity_version_id, name)
--             WHERE entity_version_id IS NOT NULL)
-- Run AFTER: 025_entity_versions.sql

DO $$
DECLARE
    v_su   uuid := '00000000-0000-0000-0000-000000000000';
    cnt    int;
    total  int := 0;
BEGIN

    -- ── Pass 1: id — ALL 111 master system entities ───────────────────────────
    -- Hidden, write_once, read_only — present on every table
    INSERT INTO control.entity_field (
        entity_version_id, name, column_name, label, data_type, ui_type,
        cardinality, origin, is_required, is_filterable, is_sortable, is_searchable,
        is_read_only, is_write_once, sort_order, created_by)
    SELECT ev.id,
        'id','id','ID','uuid','hidden',
        'one','system', true, false, false, false,
        true, false, 10, v_su
    FROM control.entity e
    JOIN control.entity_version ev ON ev.entity_id = e.id AND ev.version_no = 1
    WHERE e.table_schema = 'master' AND e.ownership_model = 'system'
    ON CONFLICT DO NOTHING;

    GET DIAGNOSTICS cnt = ROW_COUNT;
    total := total + cnt;

    -- ── Pass 2: tenant_id — entities that ARE tenant-scoped ──────────────────
    -- Excludes: AGGREGATE (typically no tenant scoping)
    INSERT INTO control.entity_field (
        entity_version_id, name, column_name, label, data_type, ui_type,
        cardinality, origin, is_required, is_filterable, is_sortable, is_searchable,
        is_read_only, is_write_once, sort_order, created_by)
    SELECT ev.id,
        'tenant_id','tenant_id','Tenant','uuid','hidden',
        'one','system', true, true, false, false,
        true, false, 20, v_su
    FROM control.entity e
    JOIN control.entity_version ev ON ev.entity_id = e.id AND ev.version_no = 1
    WHERE e.table_schema = 'master'
      AND e.ownership_model = 'system'
      AND e.entity_class = ANY(ARRAY['MASTER','CONTROL','DOCUMENT','DOCUMENT_RELATION',
                                     'RELATION','LOG','DIMENSION'])
    ON CONFLICT DO NOTHING;

    GET DIAGNOSTICS cnt = ROW_COUNT;
    total := total + cnt;

    -- ── Pass 3a: code — MASTER + REFERENCE + DIMENSION entities ─────────────
    -- Business code / slug; unique per tenant
    INSERT INTO control.entity_field (
        entity_version_id, name, column_name, label, data_type, ui_type,
        cardinality, origin, is_required, is_unique, is_filterable, is_sortable,
        is_searchable, is_read_only, is_write_once, sort_order, created_by)
    SELECT ev.id,
        'code','code','Code','string','text',
        'one','standard', true, true, true, true,
        true, false, false, 30, v_su
    FROM control.entity e
    JOIN control.entity_version ev ON ev.entity_id = e.id AND ev.version_no = 1
    WHERE e.table_schema = 'master'
      AND e.ownership_model = 'system'
      AND e.entity_class = ANY(ARRAY['MASTER','REFERENCE','DIMENSION'])
    ON CONFLICT DO NOTHING;

    GET DIAGNOSTICS cnt = ROW_COUNT;
    total := total + cnt;

    -- ── Pass 3b: name — MASTER + REFERENCE + DIMENSION entities ─────────────
    INSERT INTO control.entity_field (
        entity_version_id, name, column_name, label, data_type, ui_type,
        cardinality, origin, is_required, is_filterable, is_sortable, is_searchable,
        is_read_only, is_write_once, sort_order, created_by)
    SELECT ev.id,
        'name','name','Name','string','text',
        'one','standard', true, true, true, true,
        false, false, 40, v_su
    FROM control.entity e
    JOIN control.entity_version ev ON ev.entity_id = e.id AND ev.version_no = 1
    WHERE e.table_schema = 'master'
      AND e.ownership_model = 'system'
      AND e.entity_class = ANY(ARRAY['MASTER','REFERENCE','DIMENSION'])
    ON CONFLICT DO NOTHING;

    GET DIAGNOSTICS cnt = ROW_COUNT;
    total := total + cnt;

    -- ── Pass 3c: description — MASTER + CONTROL + REFERENCE + DIMENSION ─────
    INSERT INTO control.entity_field (
        entity_version_id, name, column_name, label, data_type, ui_type,
        cardinality, origin, is_required, is_filterable, is_sortable, is_searchable,
        is_read_only, sort_order, created_by)
    SELECT ev.id,
        'description','description','Description','text','textarea',
        'one','standard', false, false, false, true,
        false, 50, v_su
    FROM control.entity e
    JOIN control.entity_version ev ON ev.entity_id = e.id AND ev.version_no = 1
    WHERE e.table_schema = 'master'
      AND e.ownership_model = 'system'
      AND e.entity_class = ANY(ARRAY['MASTER','CONTROL','REFERENCE','DIMENSION'])
    ON CONFLICT DO NOTHING;

    GET DIAGNOSTICS cnt = ROW_COUNT;
    total := total + cnt;

    -- ── Pass 4a: status — entities bound to a lifecycle ──────────────────────
    -- Lifecycle-managed entities have a status column
    INSERT INTO control.entity_field (
        entity_version_id, name, column_name, label, data_type, ui_type,
        cardinality, origin, is_required, is_filterable, is_sortable, is_searchable,
        is_read_only, sort_order, created_by)
    SELECT DISTINCT ev.id,
        'status','status','Status','string','status',
        'one','system', true, true, true, false,
        true, 60, v_su
    FROM control.entity e
    JOIN control.entity_version ev ON ev.entity_id = e.id AND ev.version_no = 1
    JOIN control.entity_lifecycle el ON el.entity_name = e.name AND el.tenant_id IS NULL
    WHERE e.table_schema = 'master' AND e.ownership_model = 'system'
    ON CONFLICT DO NOTHING;

    GET DIAGNOSTICS cnt = ROW_COUNT;
    total := total + cnt;

    -- ── Pass 4b: is_active — same set as status ───────────────────────────────
    INSERT INTO control.entity_field (
        entity_version_id, name, column_name, label, data_type, ui_type,
        cardinality, origin, is_required, is_filterable, is_sortable, is_searchable,
        is_read_only, sort_order, created_by)
    SELECT DISTINCT ev.id,
        'is_active','is_active','Active','boolean','hidden',
        'one','system', true, true, false, false,
        true, 70, v_su
    FROM control.entity e
    JOIN control.entity_version ev ON ev.entity_id = e.id AND ev.version_no = 1
    JOIN control.entity_lifecycle el ON el.entity_name = e.name AND el.tenant_id IS NULL
    WHERE e.table_schema = 'master' AND e.ownership_model = 'system'
    ON CONFLICT DO NOTHING;

    GET DIAGNOSTICS cnt = ROW_COUNT;
    total := total + cnt;

    -- ── Pass 5a: created_at — all entities (audit trail) ─────────────────────
    INSERT INTO control.entity_field (
        entity_version_id, name, column_name, label, data_type, ui_type,
        cardinality, origin, is_required, is_filterable, is_sortable, is_searchable,
        is_read_only, is_write_once, sort_order, created_by)
    SELECT ev.id,
        'created_at','created_at','Created','timestamp','datetime',
        'one','system', true, true, true, false,
        true, false, 950, v_su
    FROM control.entity e
    JOIN control.entity_version ev ON ev.entity_id = e.id AND ev.version_no = 1
    WHERE e.table_schema = 'master' AND e.ownership_model = 'system'
    ON CONFLICT DO NOTHING;

    GET DIAGNOSTICS cnt = ROW_COUNT;
    total := total + cnt;

    -- ── Pass 5b: created_by — all entities ───────────────────────────────────
    INSERT INTO control.entity_field (
        entity_version_id, name, column_name, label, data_type, ui_type,
        cardinality, origin, is_required, is_filterable, is_sortable, is_searchable,
        is_read_only, is_write_once, sort_order, created_by)
    SELECT ev.id,
        'created_by','created_by','Created By','uuid','reference',
        'one','system', true, false, false, false,
        false, true, 960, v_su
    FROM control.entity e
    JOIN control.entity_version ev ON ev.entity_id = e.id AND ev.version_no = 1
    WHERE e.table_schema = 'master' AND e.ownership_model = 'system'
    ON CONFLICT DO NOTHING;

    GET DIAGNOSTICS cnt = ROW_COUNT;
    total := total + cnt;

    -- ── Pass 5c: updated_at — MASTER + CONTROL + DOCUMENT entities ───────────
    INSERT INTO control.entity_field (
        entity_version_id, name, column_name, label, data_type, ui_type,
        cardinality, origin, is_required, is_filterable, is_sortable, is_searchable,
        is_read_only, sort_order, created_by)
    SELECT ev.id,
        'updated_at','updated_at','Updated','timestamp','datetime',
        'one','system', false, true, true, false,
        true, 970, v_su
    FROM control.entity e
    JOIN control.entity_version ev ON ev.entity_id = e.id AND ev.version_no = 1
    WHERE e.table_schema = 'master'
      AND e.ownership_model = 'system'
      AND e.entity_class = ANY(ARRAY['MASTER','CONTROL','DOCUMENT'])
    ON CONFLICT DO NOTHING;

    GET DIAGNOSTICS cnt = ROW_COUNT;
    total := total + cnt;

    -- ── Pass 5d: updated_by — MASTER + CONTROL + DOCUMENT entities ───────────
    INSERT INTO control.entity_field (
        entity_version_id, name, column_name, label, data_type, ui_type,
        cardinality, origin, is_required, is_filterable, is_sortable, is_searchable,
        is_read_only, sort_order, created_by)
    SELECT ev.id,
        'updated_by','updated_by','Updated By','uuid','reference',
        'one','system', false, false, false, false,
        true, 980, v_su
    FROM control.entity e
    JOIN control.entity_version ev ON ev.entity_id = e.id AND ev.version_no = 1
    WHERE e.table_schema = 'master'
      AND e.ownership_model = 'system'
      AND e.entity_class = ANY(ARRAY['MASTER','CONTROL','DOCUMENT'])
    ON CONFLICT DO NOTHING;

    GET DIAGNOSTICS cnt = ROW_COUNT;
    total := total + cnt;

    RAISE NOTICE '035_version_fields/000_common_fields: % rows inserted', total;
END $$;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/010_system/entity_engine/035_version_fields/001_fields_identity.sql
-- 035_version_fields/001_fields_identity.sql
-- Version-bound entity_field rows for IAM/Foundation entities (1–26)
-- Entities: tenant, principal, principal_profile, principal_identity_binding,
--           contact_link, contact_email, contact_phone, label, label_entity_type,
--           owner_type, address, address_link, tenant_module_subscription,
--           tenant_feature_entitlement, tenant_permission_override,
--           company_code_access, auth_group, auth_group_role, auth_group_member,
--           principal_persona, team, team_member, access_grant,
--           group_feature_grant, principal_feature_grant, delegation_grant
-- Idempotent: ON CONFLICT DO NOTHING

DO $$
DECLARE
    v_su uuid := '00000000-0000-0000-0000-000000000000';
    v_ev uuid;
BEGIN

    -- ── tenant ────────────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'tenant' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'display_name','display_name','Display Name','string','text',     'one','standard',true, true,  true,  true, 110,v_su),
            (v_ev,'realm_key',   'realm_key',   'Realm Key',  'string','text',     'one','system',  true, true,  true,  true, 120,v_su),
            (v_ev,'region',      'region',      'Region',     'string','text',     'one','standard',false,true,  true,  false,130,v_su),
            (v_ev,'subscription','subscription','Subscription','enum', 'select',   'one','standard',true, true,  true,  false,140,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── principal ─────────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'principal' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'principal_type',     'principal_type',     'Type',           'enum',   'select', 'one','standard',true, true,  true,  false,110,v_su),
            (v_ev,'is_locked',          'is_locked',          'Locked',         'boolean','hidden', 'one','standard',false,true,  false, false,120,v_su),
            (v_ev,'is_service_account', 'is_service_account', 'Service Account','boolean','hidden', 'one','standard',false,true,  false, false,130,v_su),
            (v_ev,'login_email',        'login_email',        'Login Email',    'string', 'text',   'one','system',  false,true,  true,  true, 140,v_su),
            (v_ev,'external_ref',       'external_ref',       'External Ref',   'string', 'text',   'one','standard',false,true,  false, true, 150,v_su),
            (v_ev,'principal_source',   'principal_source',   'Source',         'enum',   'select', 'one','standard',false,true,  true,  false,160,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── principal_profile ─────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'principal_profile' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'principal_id',         'principal_id',         'Principal',       'uuid','reference','one','system',  true, true,  false, false,110,v_su),
            (v_ev,'given_name',           'given_name',           'First Name',      'string','text',  'one','standard',false,true,  true,  true, 120,v_su),
            (v_ev,'family_name',          'family_name',          'Last Name',       'string','text',  'one','standard',false,true,  true,  true, 130,v_su),
            (v_ev,'preferred_name',       'preferred_name',       'Preferred Name',  'string','text',  'one','standard',false,true,  true,  true, 140,v_su),
            (v_ev,'display_name',         'display_name',         'Display Name',    'string','text',  'one','system',  false,true,  true,  true, 150,v_su),
            (v_ev,'locale',               'locale',               'Locale',          'string','text',  'one','standard',false,true,  false, false,160,v_su),
            (v_ev,'timezone',             'timezone',             'Timezone',        'string','text',  'one','standard',false,true,  false, false,170,v_su),
            (v_ev,'keycloak_sync_status', 'keycloak_sync_status', 'Sync Status',     'enum', 'status','one','system',  false,true,  true,  false,180,v_su),
            (v_ev,'default_company_code_id','default_company_code_id','Default Company','uuid','reference','one','standard',false,true,false,false,190,v_su),
            (v_ev,'employee_id',          'employee_id',          'Employee',        'uuid','reference','one','standard',false,true,  false, false,200,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── principal_identity_binding ────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'principal_identity_binding' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'principal_id',  'principal_id',  'Principal',     'uuid','reference','one','system',  true, true,  false, false,110,v_su),
            (v_ev,'provider_code', 'provider_code', 'Provider',      'enum','select',  'one','standard',true, true,  true,  false,120,v_su),
            (v_ev,'subject_ref',   'subject_id',    'Subject ID',    'string','text',  'one','system',  true, false, false, true, 130,v_su),
            (v_ev,'username',      'username',      'Username',      'string','text',  'one','standard',false,true,  true,  true, 140,v_su),
            (v_ev,'sync_status',   'sync_status',   'Sync Status',   'enum', 'status','one','system',  false,true,  true,  false,150,v_su),
            (v_ev,'synced_at',     'synced_at',     'Synced At',     'timestamp','datetime','one','system',false,true,true,false,160,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── contact_link ──────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'contact_link' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'owner_type',  'owner_type',  'Owner Type',  'string','text',     'one','standard',true, true,  true,  false,110,v_su),
            (v_ev,'owner_id',    'owner_id',    'Owner',       'uuid',  'reference','one','standard',true, true,  false, false,120,v_su),
            (v_ev,'channel_type','channel_type','Channel',     'enum',  'select',   'one','standard',true, true,  true,  false,130,v_su),
            (v_ev,'value',       'value',       'Value',       'string','text',     'one','standard',true, false, false, true, 140,v_su),
            (v_ev,'purpose',     'purpose',     'Purpose',     'enum',  'select',   'one','standard',false,true,  true,  false,150,v_su),
            (v_ev,'is_primary',  'is_primary',  'Primary',     'boolean','hidden',  'one','standard',false,true,  false, false,160,v_su),
            (v_ev,'is_verified', 'is_verified', 'Verified',    'boolean','hidden',  'one','standard',false,true,  false, false,170,v_su),
            (v_ev,'verified_at', 'verified_at', 'Verified At', 'timestamp','datetime','one','system',false,true,true,false,180,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── contact_email ─────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'contact_email' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'contact_link_id','contact_link_id','Contact Link','uuid',    'reference','one','system',  true, true,  false, false,110,v_su),
            (v_ev,'local_part',     'local_part',     'Local Part',  'string',  'text',     'one','system',  false,true,  true,  true, 120,v_su),
            (v_ev,'domain',         'domain',         'Domain',      'string',  'text',     'one','system',  false,true,  true,  true, 130,v_su),
            (v_ev,'is_disposable',  'is_disposable',  'Disposable',  'boolean', 'hidden',   'one','system',  false,true,  false, false,140,v_su),
            (v_ev,'bounce_count',   'bounce_count',   'Bounces',     'integer', 'number',   'one','system',  false,true,  true,  false,150,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── contact_phone ─────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'contact_phone' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'contact_link_id','contact_link_id','Contact Link',  'uuid',  'reference','one','system',  true, true,  false, false,110,v_su),
            (v_ev,'e164',           'e164',           'E.164 Number',  'string','text',     'one','system',  false,true,  true,  true, 120,v_su),
            (v_ev,'calling_code',   'calling_code',   'Calling Code',  'string','text',     'one','system',  false,true,  false, false,130,v_su),
            (v_ev,'national_number','national_number', 'National No.',  'string','text',     'one','system',  false,false, false, true, 140,v_su),
            (v_ev,'line_type',      'line_type',      'Line Type',     'enum',  'select',   'one','system',  false,true,  true,  false,150,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── label ─────────────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'label' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'entity',      'entity',      'Entity',      'string','text',  'one','standard',true, true,  true,  false,110,v_su),
            (v_ev,'locale_code', 'locale_code', 'Locale',      'string','text',  'one','standard',true, true,  true,  false,120,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── owner_type ────────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'owner_type' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'category',   'category',   'Category',    'enum',   'select','one','standard',false,true,  true,  false,110,v_su),
            (v_ev,'sort_order', 'sort_order', 'Sort Order',  'integer','number','one','standard',false,false, true,  false,120,v_su),
            (v_ev,'schema_name','schema_name','Schema',      'string', 'text',  'one','system',  false,false, false, false,130,v_su),
            (v_ev,'table_name', 'table_name', 'Table',       'string', 'text',  'one','system',  false,false, false, false,140,v_su),
            (v_ev,'is_system',  'is_system',  'System',      'boolean','hidden','one','system',  false,true,  false, false,150,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── address ───────────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'address' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'address_type',      'address_type',      'Address Type',    'enum',   'select','one','standard',false,true,  true,  false,110,v_su),
            (v_ev,'line1',             'line1',             'Address Line 1',  'string', 'text',  'one','standard',false,false, false, true, 120,v_su),
            (v_ev,'line2',             'line2',             'Address Line 2',  'string', 'text',  'one','standard',false,false, false, false,130,v_su),
            (v_ev,'city',              'city',              'City',            'string', 'text',  'one','standard',false,true,  true,  true, 140,v_su),
            (v_ev,'region',            'region',            'Region/State',    'string', 'text',  'one','standard',false,true,  true,  true, 150,v_su),
            (v_ev,'postal_code',       'postal_code',       'Postal Code',     'string', 'text',  'one','standard',false,true,  true,  true, 160,v_su),
            (v_ev,'country_code',      'country_code',      'Country',         'string', 'text',  'one','standard',false,true,  true,  false,170,v_su),
            (v_ev,'formatted_address', 'formatted_address', 'Full Address',    'string', 'text',  'one','system',  false,false, false, true, 180,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── address_link ──────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'address_link' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'owner_type',     'owner_type',     'Owner Type',     'string','text',     'one','standard',true, true,  true,  false,110,v_su),
            (v_ev,'owner_id',       'owner_id',       'Owner',          'uuid',  'reference','one','standard',true, true,  false, false,120,v_su),
            (v_ev,'address_id',     'address_id',     'Address',        'uuid',  'reference','one','standard',true, true,  false, false,130,v_su),
            (v_ev,'purpose',        'purpose',        'Purpose',        'enum',  'select',   'one','standard',true, true,  true,  false,140,v_su),
            (v_ev,'is_primary',     'is_primary',     'Primary',        'boolean','hidden',  'one','standard',false,true,  false, false,150,v_su),
            (v_ev,'effective_from', 'effective_from', 'Effective From', 'date',  'date',     'one','standard',false,true,  true,  false,160,v_su),
            (v_ev,'effective_until','effective_until','Effective Until','date',  'date',     'one','standard',false,true,  true,  false,170,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── tenant_module_subscription ────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'tenant_module_subscription' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'module_id',    'module_id',    'Module',       'uuid',     'reference','one','standard',true, true,  false, false,110,v_su),
            (v_ev,'status',       'status',       'Status',       'enum',     'status',   'one','standard',true, true,  true,  false,120,v_su),
            (v_ev,'subscribed_at','subscribed_at','Subscribed At','timestamp','datetime', 'one','system',  false,true,  true,  false,130,v_su),
            (v_ev,'expires_at',   'expires_at',   'Expires At',   'timestamp','datetime', 'one','standard',false,true,  true,  false,140,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── tenant_feature_entitlement ────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'tenant_feature_entitlement' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'feature_id',    'feature_id',    'Feature',      'uuid',     'reference','one','standard',true, true,  false, false,110,v_su),
            (v_ev,'status',        'status',        'Status',       'enum',     'status',   'one','standard',true, true,  true,  false,120,v_su),
            (v_ev,'activated_at',  'activated_at',  'Activated At', 'timestamp','datetime', 'one','system',  false,true,  true,  false,130,v_su),
            (v_ev,'expires_at',    'expires_at',    'Expires At',   'timestamp','datetime', 'one','standard',false,true,  true,  false,140,v_su),
            (v_ev,'activated_by',  'activated_by',  'Activated By', 'uuid',     'reference','one','standard',false,true,  false, false,150,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── tenant_permission_override ────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'tenant_permission_override' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'permission_id','permission_id','Permission','uuid',   'reference','one','standard',true, true,  false, false,110,v_su),
            (v_ev,'is_granted',   'is_granted',   'Granted',  'boolean','hidden',   'one','standard',true, true,  false, false,120,v_su),
            (v_ev,'reason',       'reason',       'Reason',   'text',   'textarea', 'one','standard',false,false, false, true, 130,v_su),
            (v_ev,'expires_at',   'expires_at',   'Expires',  'timestamp','datetime','one','standard',false,true,  true,  false,140,v_su),
            (v_ev,'granted_by',   'granted_by',   'Granted By','uuid',  'reference','one','standard',false,true,  false, false,150,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── company_code_access ───────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'company_code_access' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'entity_type',     'entity_type',     'Entity Type',    'string','text',     'one','standard',true, true,  true,  false,110,v_su),
            (v_ev,'entity_id',       'entity_id',       'Entity',         'uuid',  'reference','one','standard',true, true,  false, false,120,v_su),
            (v_ev,'company_code_id', 'company_code_id', 'Company Code',   'uuid',  'reference','one','standard',true, true,  false, false,130,v_su),
            (v_ev,'granted_by',      'granted_by',      'Granted By',     'uuid',  'reference','one','standard',false,true,  false, false,140,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── auth_group ────────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'auth_group' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'is_system',               'is_system',               'System Group',     'boolean','hidden','one','system',  false,true,  false, false,110,v_su),
            (v_ev,'is_self_service_eligible','is_self_service_eligible','Self-Service',     'boolean','hidden','one','standard',false,true,  false, false,120,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── auth_group_role ───────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'auth_group_role' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'group_id',              'group_id',              'Group',             'uuid','reference','one','standard',true, true,  false, false,110,v_su),
            (v_ev,'role_id',               'role_id',               'Role',              'uuid','reference','one','standard',true, true,  false, false,120,v_su),
            (v_ev,'visibility_scope',      'visibility_scope',      'Visibility Scope',  'enum','select',   'one','standard',true, true,  true,  false,130,v_su),
            (v_ev,'assignment_scope_type', 'assignment_scope_type', 'Assignment Scope',  'enum','select',   'one','standard',true, true,  true,  false,140,v_su),
            (v_ev,'expires_at',            'expires_at',            'Expires At',        'timestamp','datetime','one','standard',false,true,true,false,150,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── auth_group_member ─────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'auth_group_member' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'principal_id','principal_id','User',      'uuid',     'reference','one','standard',true, true,  false, false,110,v_su),
            (v_ev,'group_id',    'group_id',    'Group',     'uuid',     'reference','one','standard',true, true,  false, false,120,v_su),
            (v_ev,'joined_at',   'joined_at',   'Joined At', 'timestamp','datetime', 'one','system',  false,true,  true,  false,130,v_su),
            (v_ev,'added_by',    'added_by',    'Added By',  'uuid',     'reference','one','standard',false,true,  false, false,140,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── principal_persona ─────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'principal_persona' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'principal_id','principal_id','User',       'uuid',     'reference','one','standard',true, true,  false, false,110,v_su),
            (v_ev,'persona_id',  'persona_id',  'Persona',    'uuid',     'reference','one','standard',true, true,  false, false,120,v_su),
            (v_ev,'expires_at',  'expires_at',  'Expires At', 'timestamp','datetime', 'one','standard',false,true,  true,  false,130,v_su),
            (v_ev,'assigned_by', 'assigned_by', 'Assigned By','uuid',     'reference','one','standard',false,true,  false, false,140,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── team ──────────────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'team' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'leader_id',     'leader_id',     'Leader',         'uuid','reference','one','standard',true, true,  false, false,110,v_su),
            (v_ev,'team_type',     'team_type',     'Team Type',      'enum','select',   'one','standard',true, true,  true,  false,120,v_su),
            (v_ev,'effective_from','effective_from','Effective From', 'date','date',     'one','standard',false,true,  true,  false,130,v_su),
            (v_ev,'effective_to',  'effective_to',  'Effective To',   'date','date',     'one','standard',false,true,  true,  false,140,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── team_member ───────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'team_member' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'team_id',     'team_id',     'Team',        'uuid',     'reference','one','standard',true, true,  false, false,110,v_su),
            (v_ev,'principal_id','principal_id','User',        'uuid',     'reference','one','standard',true, true,  false, false,120,v_su),
            (v_ev,'role_in_team','role_in_team','Role in Team','string',   'text',     'one','standard',false,true,  true,  true, 130,v_su),
            (v_ev,'joined_at',   'joined_at',   'Joined At',   'timestamp','datetime', 'one','system',  false,true,  true,  false,140,v_su),
            (v_ev,'left_at',     'left_at',     'Left At',     'timestamp','datetime', 'one','standard',false,true,  true,  false,150,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── access_grant ──────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'access_grant' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'role_id',              'role_id',              'Role',             'uuid',     'reference','one','standard',false,true,  false, false,110,v_su),
            (v_ev,'group_id',             'group_id',             'Group',            'uuid',     'reference','one','standard',false,true,  false, false,120,v_su),
            (v_ev,'principal_id',         'principal_id',         'User',             'uuid',     'reference','one','standard',false,true,  false, false,130,v_su),
            (v_ev,'permission_id',        'permission_id',        'Permission',       'uuid',     'reference','one','standard',true, true,  false, false,140,v_su),
            (v_ev,'effect',               'effect',               'Effect',           'enum',     'select',   'one','standard',true, true,  true,  false,150,v_su),
            (v_ev,'visibility_scope',     'visibility_scope',     'Visibility',       'enum',     'select',   'one','standard',false,true,  true,  false,160,v_su),
            (v_ev,'assignment_scope_type','assignment_scope_type','Scope Type',       'enum',     'select',   'one','standard',false,true,  true,  false,170,v_su),
            (v_ev,'expires_at',           'expires_at',           'Expires At',       'timestamp','datetime', 'one','standard',false,true,  true,  false,180,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── group_feature_grant ───────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'group_feature_grant' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'group_id',   'group_id',   'Group',      'uuid',     'reference','one','standard',true, true,  false, false,110,v_su),
            (v_ev,'feature_id', 'feature_id', 'Feature',    'uuid',     'reference','one','standard',true, true,  false, false,120,v_su),
            (v_ev,'access_type','access_type','Access Type','enum',     'select',   'one','standard',true, true,  true,  false,130,v_su),
            (v_ev,'expires_at', 'expires_at', 'Expires At', 'timestamp','datetime', 'one','standard',false,true,  true,  false,140,v_su),
            (v_ev,'granted_by', 'granted_by', 'Granted By', 'uuid',     'reference','one','standard',false,true,  false, false,150,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── principal_feature_grant ───────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'principal_feature_grant' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'principal_id','principal_id','User',       'uuid',     'reference','one','standard',true, true,  false, false,110,v_su),
            (v_ev,'feature_id',  'feature_id',  'Feature',    'uuid',     'reference','one','standard',true, true,  false, false,120,v_su),
            (v_ev,'access_type', 'access_type', 'Access Type','enum',     'select',   'one','standard',true, true,  true,  false,130,v_su),
            (v_ev,'expires_at',  'expires_at',  'Expires At', 'timestamp','datetime', 'one','standard',false,true,  true,  false,140,v_su),
            (v_ev,'granted_by',  'granted_by',  'Granted By', 'uuid',     'reference','one','standard',false,true,  false, false,150,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── delegation_grant ──────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'delegation_grant' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'delegator_id','delegator_id','Delegator',  'uuid',     'reference','one','standard',true, true,  false, false,110,v_su),
            (v_ev,'delegate_id', 'delegate_id', 'Delegate',   'uuid',     'reference','one','standard',true, true,  false, false,120,v_su),
            (v_ev,'scope_type',  'scope_type',  'Scope Type', 'enum',     'select',   'one','standard',true, true,  true,  false,130,v_su),
            (v_ev,'scope_ref',   'scope_ref',   'Scope Ref',  'string',   'text',     'one','standard',false,true,  false, true, 140,v_su),
            (v_ev,'expires_at',  'expires_at',  'Expires At', 'timestamp','datetime', 'one','standard',true, true,  true,  false,150,v_su),
            (v_ev,'is_revoked',  'is_revoked',  'Revoked',    'boolean',  'hidden',   'one','standard',false,true,  false, false,160,v_su),
            (v_ev,'reason',      'reason',      'Reason',     'text',     'textarea', 'one','standard',false,false, false, true, 170,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    RAISE NOTICE '035_version_fields/001_fields_identity: done';
END $$;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/010_system/entity_engine/035_version_fields/002_fields_notifications.sql
-- 035_version_fields/002_fields_notifications.sql
-- Version-bound entity_field rows for Notification/Tenant-Config entities (27–29)
-- Entities: notification, notification_default (partition), tenant_profile
-- Idempotent: ON CONFLICT DO NOTHING

DO $$
DECLARE
    v_su uuid := '00000000-0000-0000-0000-000000000000';
    v_ev uuid;
BEGIN

    -- ── notification ──────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'notification' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'recipient_id',  'recipient_id',  'Recipient',   'uuid',     'reference','one','standard',true, true,  false, false,110,v_su),
            (v_ev,'sender_id',     'sender_id',     'Sender',      'uuid',     'reference','one','standard',false,true,  false, false,120,v_su),
            (v_ev,'channel',       'channel',       'Channel',     'enum',     'select',   'one','standard',true, true,  true,  false,130,v_su),
            (v_ev,'category',      'category',      'Category',    'enum',     'select',   'one','standard',false,true,  true,  false,140,v_su),
            (v_ev,'priority',      'priority',      'Priority',    'enum',     'select',   'one','standard',true, true,  true,  false,150,v_su),
            (v_ev,'title',         'title',         'Title',       'string',   'text',     'one','standard',true, false, false, true, 160,v_su),
            (v_ev,'body',          'body',          'Body',        'text',     'textarea', 'one','standard',false,false, false, true, 170,v_su),
            (v_ev,'entity_type',   'entity_type',   'Entity Type', 'string',   'text',     'one','standard',false,true,  true,  false,180,v_su),
            (v_ev,'entity_id',     'entity_id',     'Entity',      'uuid',     'reference','one','standard',false,true,  false, false,190,v_su),
            (v_ev,'is_read',       'is_read',       'Read',        'boolean',  'hidden',   'one','standard',false,true,  false, false,200,v_su),
            (v_ev,'is_dismissed',  'is_dismissed',  'Dismissed',   'boolean',  'hidden',   'one','standard',false,true,  false, false,210,v_su),
            (v_ev,'expires_at',    'expires_at',    'Expires At',  'timestamp','datetime', 'one','standard',false,true,  true,  false,220,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── tenant_profile ────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'tenant_profile' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'country_code',            'country_code',            'Country',            'string', 'text',  'one','standard',false,true,  true,  false,110,v_su),
            (v_ev,'currency_code',           'currency_code',           'Currency',           'string', 'text',  'one','standard',false,true,  true,  false,120,v_su),
            (v_ev,'locale_code',             'locale_code',             'Locale',             'string', 'text',  'one','standard',false,true,  false, false,130,v_su),
            (v_ev,'timezone_code',           'timezone_code',           'Timezone',           'string', 'text',  'one','standard',false,true,  false, false,140,v_su),
            (v_ev,'fiscal_year_start_month', 'fiscal_year_start_month', 'Fiscal Year Start',  'integer','number','one','standard',false,true,  false, false,150,v_su),
            (v_ev,'language_code',           'language_code',           'Language',           'string', 'text',  'one','standard',false,true,  false, false,160,v_su),
            (v_ev,'reporting_currency_code', 'reporting_currency_code', 'Reporting Currency', 'string', 'text',  'one','standard',false,true,  false, false,170,v_su),
            (v_ev,'default_brand_profile_id','default_brand_profile_id','Default Brand',      'uuid',   'reference','one','standard',false,true,false,false,180,v_su),
            (v_ev,'default_letterhead_id',   'default_letterhead_id',   'Default Letterhead', 'uuid',   'reference','one','standard',false,true,false,false,190,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    RAISE NOTICE '035_version_fields/002_fields_notifications: done';
END $$;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/010_system/entity_engine/035_version_fields/003_fields_content.sql
-- 035_version_fields/003_fields_content.sql
-- Version-bound entity_field rows for Content/Activity entities (30–40)
-- Entities: attachment, multipart_upload, attachment_acl,
--           comment, comment_draft, comment_mention, comment_reaction,
--           conversation, conversation_participant, attachment_comment,
--           comment_feed_cursor
-- Idempotent: ON CONFLICT DO NOTHING

DO $$
DECLARE
    v_su uuid := '00000000-0000-0000-0000-000000000000';
    v_ev uuid;
BEGIN

    -- ── attachment ────────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'attachment' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'owner_type',      'owner_type',      'Owner Type',   'string', 'text',     'one','standard',true, true,  true,  false,110,v_su),
            (v_ev,'owner_id',        'owner_id',        'Owner',        'uuid',   'reference','one','standard',true, true,  false, false,120,v_su),
            (v_ev,'file_name',       'file_name',       'File Name',    'string', 'text',     'one','standard',true, false, true,  true, 130,v_su),
            (v_ev,'file_size',       'file_size',       'File Size',    'integer','number',   'one','system',  false,false, true,  false,140,v_su),
            (v_ev,'mime_type',       'mime_type',       'MIME Type',    'string', 'text',     'one','system',  false,true,  true,  false,150,v_su),
            (v_ev,'storage_key',     'storage_key',     'Storage Key',  'string', 'text',     'one','system',  false,false, false, false,160,v_su),
            (v_ev,'is_public',       'is_public',       'Public',       'boolean','hidden',   'one','standard',false,true,  false, false,170,v_su),
            (v_ev,'checksum',        'checksum',        'Checksum',     'string', 'text',     'one','system',  false,false, false, false,180,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── multipart_upload ──────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'multipart_upload' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'upload_ref',  'upload_id',   'Upload ID',   'string', 'text',  'one','system',  true, false, false, false,110,v_su),
            (v_ev,'file_name',   'file_name',   'File Name',   'string', 'text',  'one','standard',true, false, true,  true, 120,v_su),
            (v_ev,'mime_type',   'mime_type',   'MIME Type',   'string', 'text',  'one','standard',false,true,  false, false,130,v_su),
            (v_ev,'total_parts', 'total_parts', 'Total Parts', 'integer','number','one','system',  false,false, false, false,140,v_su),
            (v_ev,'expires_at',  'expires_at',  'Expires At',  'timestamp','datetime','one','system',false,true,true,false,150,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── attachment_acl ────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'attachment_acl' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'attachment_id','attachment_id','Attachment',  'uuid','reference','one','standard',true, true,  false, false,110,v_su),
            (v_ev,'principal_id', 'principal_id', 'User',        'uuid','reference','one','standard',false,true,  false, false,120,v_su),
            (v_ev,'group_id',     'group_id',     'Group',       'uuid','reference','one','standard',false,true,  false, false,130,v_su),
            (v_ev,'access_level', 'access_level', 'Access Level','enum','select',   'one','standard',true, true,  true,  false,140,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── comment ───────────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'comment' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'entity_type',   'entity_type',   'Entity Type', 'string', 'text',     'one','standard',true, true,  true,  false,110,v_su),
            (v_ev,'entity_id',     'entity_id',     'Entity',      'uuid',   'reference','one','standard',true, true,  false, false,120,v_su),
            (v_ev,'parent_id',     'parent_id',     'Parent',      'uuid',   'reference','one','standard',false,true,  false, false,130,v_su),
            (v_ev,'body',          'body',          'Body',        'text',   'textarea', 'one','standard',true, false, false, true, 140,v_su),
            (v_ev,'body_format',   'body_format',   'Format',      'enum',   'select',   'one','standard',true, true,  false, false,150,v_su),
            (v_ev,'is_flagged',    'is_flagged',    'Flagged',     'boolean','hidden',   'one','standard',false,true,  false, false,160,v_su),
            (v_ev,'is_pinned',     'is_pinned',     'Pinned',      'boolean','hidden',   'one','standard',false,true,  false, false,170,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── comment_draft ─────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'comment_draft' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'entity_type', 'entity_type', 'Entity Type', 'string','text',     'one','standard',true, true,  false, false,110,v_su),
            (v_ev,'entity_id',   'entity_id',   'Entity',      'uuid',  'reference','one','standard',true, true,  false, false,120,v_su),
            (v_ev,'body',        'body',        'Draft Body',  'text',  'textarea', 'one','standard',false,false, false, false,130,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── comment_mention ───────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'comment_mention' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'comment_id',  'comment_id',  'Comment',     'uuid','reference','one','standard',true, true,  false, false,110,v_su),
            (v_ev,'principal_id','principal_id','Mentioned User','uuid','reference','one','standard',true,true, false, false,120,v_su),
            (v_ev,'is_notified', 'is_notified', 'Notified',    'boolean','hidden','one','system',  false,true,  false, false,130,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── comment_reaction ──────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'comment_reaction' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'comment_id',  'comment_id',  'Comment',    'uuid','reference','one','standard',true, true,  false, false,110,v_su),
            (v_ev,'principal_id','principal_id','User',       'uuid','reference','one','standard',true, true,  false, false,120,v_su),
            (v_ev,'emoji',       'emoji',       'Emoji',      'string','text',   'one','standard',true, true,  true,  false,130,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── conversation ──────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'conversation' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'entity_type',  'entity_type',  'Entity Type', 'string', 'text',     'one','standard',true, true,  true,  false,110,v_su),
            (v_ev,'entity_id',    'entity_id',    'Entity',      'uuid',   'reference','one','standard',true, true,  false, false,120,v_su),
            (v_ev,'subject',      'subject',      'Subject',     'string', 'text',     'one','standard',false,false, true,  true, 130,v_su),
            (v_ev,'is_resolved',  'is_resolved',  'Resolved',    'boolean','hidden',   'one','standard',false,true,  false, false,140,v_su),
            (v_ev,'resolved_at',  'resolved_at',  'Resolved At', 'timestamp','datetime','one','system', false,true,  true,  false,150,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── conversation_participant ───────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'conversation_participant' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'conversation_id','conversation_id','Conversation','uuid','reference','one','standard',true, true,  false, false,110,v_su),
            (v_ev,'principal_id',   'principal_id',   'User',        'uuid','reference','one','standard',true, true,  false, false,120,v_su),
            (v_ev,'joined_at',      'joined_at',      'Joined At',   'timestamp','datetime','one','system',false,true,true,false,130,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    RAISE NOTICE '035_version_fields/003_fields_content: done';
END $$;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/010_system/entity_engine/035_version_fields/004_fields_doc_template.sql
-- 035_version_fields/004_fields_doc_template.sql
-- Version-bound entity_field rows for Document/Template entities (41–48)
-- Entities: document, brand_profile, letterhead, template, template_binding,
--           entity_document_link, lifecycle_instance, print_profile
-- Idempotent: ON CONFLICT DO NOTHING

DO $$
DECLARE
    v_su uuid := '00000000-0000-0000-0000-000000000000';
    v_ev uuid;
BEGIN

    -- ── document ──────────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'document' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'tags','tags','Tags','string','text','one','standard',false,false,false,true,110,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── brand_profile ─────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'brand_profile' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'direction',       'direction',       'Direction',        'enum',   'select','one','standard',true, true,  true,  false,110,v_su),
            (v_ev,'default_locale',  'default_locale',  'Default Locale',   'string', 'text',  'one','standard',true, true,  true,  false,120,v_su),
            (v_ev,'is_default',      'is_default',      'Default',          'boolean','hidden','one','standard',false,true,  false, false,130,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── letterhead ────────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'letterhead' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'company_code_id',   'company_code_id',   'Company Code',    'uuid',   'reference','one','standard',false,true,  false, false,110,v_su),
            (v_ev,'watermark_text',    'watermark_text',    'Watermark',       'string', 'text',     'one','standard',false,false, false, true, 120,v_su),
            (v_ev,'is_default',        'is_default',        'Default',         'boolean','hidden',   'one','standard',false,true,  false, false,130,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── template ──────────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'template' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'kind',               'kind',               'Template Kind',     'enum',   'select',   'one','standard',true, true,  true,  false,110,v_su),
            (v_ev,'engine',             'engine',             'Engine',            'enum',   'select',   'one','standard',true, true,  true,  false,120,v_su),
            (v_ev,'current_version_id', 'current_version_id', 'Current Version',   'uuid',   'reference','one','system',  false,true,  false, false,130,v_su),
            (v_ev,'is_rtl_supported',   'is_rtl_supported',   'RTL Support',       'boolean','hidden',   'one','standard',false,true,  false, false,140,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── template_binding ──────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'template_binding' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'template_id', 'template_id', 'Template',   'uuid',   'reference','one','standard',true, true,  false, false,110,v_su),
            (v_ev,'entity_name', 'entity_name', 'Entity',     'string', 'text',     'one','standard',true, true,  true,  false,120,v_su),
            (v_ev,'operation',   'operation',   'Operation',  'string', 'text',     'one','standard',true, true,  true,  false,130,v_su),
            (v_ev,'variant',     'variant',     'Variant',    'string', 'text',     'one','standard',true, true,  true,  false,140,v_su),
            (v_ev,'priority',    'priority',    'Priority',   'integer','number',   'one','standard',false,true,  true,  false,150,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── entity_document_link ──────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'entity_document_link' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'entity_type', 'entity_type', 'Entity Type', 'string','text',     'one','standard',true, true,  true,  false,110,v_su),
            (v_ev,'entity_id',   'entity_id',   'Entity',      'uuid',  'reference','one','standard',true, true,  false, false,120,v_su),
            (v_ev,'document_id', 'document_id', 'Document',    'uuid',  'reference','one','standard',true, true,  false, false,130,v_su),
            (v_ev,'link_type',   'link_type',   'Link Type',   'enum',  'select',   'one','standard',true, true,  true,  false,140,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── lifecycle_instance ────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'lifecycle_instance' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'entity_name', 'entity_name', 'Entity Name', 'string','text',     'one','system',true, true,  true,  false,110,v_su),
            (v_ev,'entity_ref',  'entity_id',   'Entity ID',   'string','text',     'one','system',true, true,  false, true, 120,v_su),
            (v_ev,'lifecycle_id','lifecycle_id','Lifecycle',   'uuid',  'reference','one','system',true, true,  false, false,130,v_su),
            (v_ev,'state_id',    'state_id',    'State',       'uuid',  'reference','one','system',true, true,  false, false,140,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── print_profile ─────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'print_profile' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'paper_size',    'paper_size',    'Paper Size',    'enum',   'select','one','standard',true, true,  true,  false,110,v_su),
            (v_ev,'orientation',   'orientation',   'Orientation',   'enum',   'select','one','standard',true, true,  true,  false,120,v_su),
            (v_ev,'color_mode',    'color_mode',    'Color Mode',    'enum',   'select','one','standard',true, true,  true,  false,130,v_su),
            (v_ev,'output_format', 'output_format', 'Output Format', 'enum',   'select','one','standard',true, true,  true,  false,140,v_su),
            (v_ev,'quality_dpi',   'quality_dpi',   'DPI',           'integer','number','one','standard',false,false, true,  false,150,v_su),
            (v_ev,'is_default',    'is_default',    'Default',       'boolean','hidden','one','standard',false,true,  false, false,160,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    RAISE NOTICE '035_version_fields/004_fields_doc_template: done';
END $$;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/010_system/entity_engine/035_version_fields/005_fields_finance_org.sql
-- 035_version_fields/005_fields_finance_org.sql
-- Version-bound entity_field rows for Finance Org entities (49–54)
-- Entities: legal_entity, company_code, business_unit, cost_center,
--           profit_center, warehouse
-- EXCLUDES common fields (id, tenant_id, code, name, description, status,
--           is_active, created_at, created_by, updated_at, updated_by)
--           — those are seeded in 000_common_fields.sql
-- Idempotent: ON CONFLICT DO NOTHING (ef_version_name_uidx)
-- Run AFTER: 000_common_fields.sql

DO $$
DECLARE
    v_su uuid := '00000000-0000-0000-0000-000000000000';
    v_ev uuid;
BEGIN

    -- ── legal_entity ──────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'legal_entity' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'legal_name',       'legal_name',       'Legal Name',        'string','text',      'one','standard',true, true,  true,  true,  110,v_su),
            (v_ev,'registration_no',  'registration_no',  'Registration No.',  'string','text',      'one','standard',false,true,  false, true,  120,v_su),
            (v_ev,'tax_identifier',   'tax_id',           'Tax ID',            'string','text',      'one','standard',false,true,  false, true,  130,v_su),
            (v_ev,'country_code',     'country_code',     'Country',           'string','text',      'one','standard',true, true,  true,  false, 140,v_su),
            (v_ev,'currency_id',      'currency_id',      'Currency',          'uuid',  'reference', 'one','standard',true, true,  false, false, 150,v_su),
            (v_ev,'entity_type',      'entity_type',      'Entity Type',       'enum',  'select',    'one','standard',true, true,  true,  false, 160,v_su),
            (v_ev,'incorporation_date','incorporation_date','Incorporated',     'date',  'date',      'one','standard',false,true,  true,  false, 170,v_su),
            (v_ev,'is_publicly_listed','is_publicly_listed','Publicly Listed', 'boolean','hidden',   'one','standard',false,true,  false, false, 180,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── company_code ──────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'company_code' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'legal_entity_id',        'legal_entity_id',        'Legal Entity',      'uuid','reference','one','standard',true, true,  false, false,110,v_su),
            (v_ev,'local_currency_id',      'local_currency_id',      'Local Currency',    'uuid','reference','one','standard',true, true,  false, false,120,v_su),
            (v_ev,'accounting_currency_id', 'accounting_currency_id', 'Accounting Currency','uuid','reference','one','standard',false,true,  false, false,130,v_su),
            (v_ev,'chart_of_account_id',    'chart_of_account_id',    'Chart of Accounts', 'uuid','reference','one','standard',true, true,  false, false,140,v_su),
            (v_ev,'fiscal_year_variant',    'fiscal_year_variant',    'Fiscal Year',       'string','text',   'one','standard',true, true,  true,  false,150,v_su),
            (v_ev,'company_code_type',      'company_code_type',      'Type',              'enum', 'select',  'one','standard',true, true,  true,  false,160,v_su),
            (v_ev,'timezone',               'timezone',               'Timezone',          'string','text',   'one','standard',false,true,  false, false,170,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── business_unit ─────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'business_unit' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'company_code_id', 'company_code_id', 'Company Code',   'uuid','reference','one','standard',true, true,  false, false,110,v_su),
            (v_ev,'bu_type',         'bu_type',         'Unit Type',      'enum','select',   'one','standard',true, true,  true,  false,120,v_su),
            (v_ev,'bu_head_id',      'bu_head_id',      'Head',           'uuid','reference','one','standard',false,true,  false, false,130,v_su),
            (v_ev,'parent_id',       'parent_id',       'Parent Unit',    'uuid','reference','one','standard',false,true,  false, false,140,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── cost_center ───────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'cost_center' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'company_code_id',  'company_code_id',  'Company Code',  'uuid','reference','one','standard',true, true,  false, false,110,v_su),
            (v_ev,'cost_center_type', 'cost_center_type', 'Type',          'enum','select',   'one','standard',true, true,  true,  false,120,v_su),
            (v_ev,'manager_id',       'manager_id',       'Manager',       'uuid','reference','one','standard',false,true,  false, false,130,v_su),
            (v_ev,'parent_id',        'parent_id',        'Parent',        'uuid','reference','one','standard',false,true,  false, false,140,v_su),
            (v_ev,'business_unit_id', 'business_unit_id', 'Business Unit', 'uuid','reference','one','standard',false,true,  false, false,150,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── profit_center ─────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'profit_center' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'company_code_id', 'company_code_id', 'Company Code', 'uuid','reference','one','standard',true, true,  false, false,110,v_su),
            (v_ev,'pc_type',         'pc_type',         'Type',         'enum','select',   'one','standard',true, true,  true,  false,120,v_su),
            (v_ev,'manager_id',      'manager_id',      'Manager',      'uuid','reference','one','standard',false,true,  false, false,130,v_su),
            (v_ev,'parent_id',       'parent_id',       'Parent',       'uuid','reference','one','standard',false,true,  false, false,140,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── warehouse ─────────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'warehouse' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'company_code_id', 'company_code_id', 'Company Code',   'uuid','reference','one','standard',true, true,  false, false,110,v_su),
            (v_ev,'warehouse_type',  'warehouse_type',  'Type',           'enum','select',   'one','standard',true, true,  true,  false,120,v_su),
            (v_ev,'address_id',      'address_id',      'Address',        'uuid','reference','one','standard',false,true,  false, false,130,v_su),
            (v_ev,'capacity',        'capacity',        'Capacity',       'decimal','number','one','standard',false,false, true,  false,140,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    RAISE NOTICE '035_version_fields/005_fields_finance_org: done';
END $$;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/010_system/entity_engine/035_version_fields/006_fields_coa_gl.sql
-- 035_version_fields/006_fields_coa_gl.sql
-- Version-bound entity_field rows for COA/GL entities (55–60)
-- Entities: chart_of_account, gl_account_type, gl_account,
--           gl_account_hierarchy, company_code_gl_config, company_code_book_assignment
-- Idempotent: ON CONFLICT DO NOTHING

DO $$
DECLARE
    v_su uuid := '00000000-0000-0000-0000-000000000000';
    v_ev uuid;
BEGIN

    -- ── chart_of_account ──────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'chart_of_account' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'coa_type',            'coa_type',            'COA Type',          'enum',   'select', 'one','standard',true, true,  true,  false,110,v_su),
            (v_ev,'base_currency_id',    'base_currency_id',    'Base Currency',     'uuid',   'reference','one','standard',true, true,  false, false,120,v_su),
            (v_ev,'account_level_count', 'account_level_count', 'Hierarchy Levels',  'integer','number', 'one','standard',false,false, false, false,130,v_su),
            (v_ev,'is_default',          'is_default',          'Default COA',       'boolean','hidden', 'one','standard',true, true,  false, false,140,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── gl_account_type ───────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'gl_account_type' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'account_class',    'account_class',    'Account Class',    'enum',   'select', 'one','standard',true, true,  true,  false,110,v_su),
            (v_ev,'normal_balance',   'normal_balance',   'Normal Balance',   'enum',   'select', 'one','standard',true, true,  true,  false,120,v_su),
            (v_ev,'is_balance_sheet', 'is_balance_sheet', 'Balance Sheet',    'boolean','hidden', 'one','standard',true, true,  false, false,130,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── gl_account ────────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'gl_account' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'chart_of_account_id','chart_of_account_id','Chart of Accounts','uuid','reference','one','standard',true, true,  false, false,110,v_su),
            (v_ev,'account_type_id',    'account_type_id',    'Account Type',     'uuid','reference','one','standard',true, true,  true,  false,120,v_su),
            (v_ev,'parent_id',          'parent_id',          'Parent Account',   'uuid','reference','one','standard',false,true,  false, false,130,v_su),
            (v_ev,'account_nature',     'account_nature',     'Nature',           'enum','select',  'one','standard',true, true,  true,  false,140,v_su),
            (v_ev,'balance_type',       'balance_type',       'Balance Type',     'enum','select',  'one','standard',true, true,  true,  false,150,v_su),
            (v_ev,'normal_balance',     'normal_balance',     'Normal Balance',   'enum','select',  'one','standard',true, true,  true,  false,160,v_su),
            (v_ev,'currency_id',        'currency_id',        'Currency',         'uuid','reference','one','standard',false,true,  false, false,170,v_su),
            (v_ev,'is_reconciling',     'is_reconciling',     'Reconciling',      'boolean','hidden','one','standard',false,true,  false, false,180,v_su),
            (v_ev,'is_blocked',         'is_blocked',         'Blocked',          'boolean','hidden','one','standard',false,true,  false, false,190,v_su),
            (v_ev,'posting_level',      'posting_level',      'Posting Level',    'enum','select',  'one','standard',true, true,  true,  false,200,v_su),
            (v_ev,'account_level',      'account_level',      'Level',            'integer','number','one','standard',false,true,  true,  false,210,v_su),
            (v_ev,'account_path',       'account_path',       'Account Path',     'string','text',  'one','system',  false,false, false, true, 220,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── gl_account_hierarchy ──────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'gl_account_hierarchy' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'root_account_id', 'root_account_id', 'Root Account',  'uuid','reference','one','standard',true, true,  false, false,110,v_su),
            (v_ev,'company_code_id', 'company_code_id', 'Company Code',  'uuid','reference','one','standard',false,true,  false, false,120,v_su),
            (v_ev,'level',           'level',           'Level',         'integer','number','one','standard',false,true,  true,  false,130,v_su),
            (v_ev,'path',            'path',            'Path',          'string','text',   'one','system',  false,false, false, true, 140,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── company_code_gl_config ────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'company_code_gl_config' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'company_code_id', 'company_code_id', 'Company Code', 'uuid',  'reference','one','standard',true, true,  false, false,110,v_su),
            (v_ev,'config_key',      'config_key',      'Config Key',   'string','text',     'one','standard',true, true,  true,  true, 120,v_su),
            (v_ev,'config_value',    'config_value',    'Config Value', 'json',  'json-editor','one','standard',true,false, false, false,130,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── company_code_book_assignment ──────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'company_code_book_assignment' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'company_code_id', 'company_code_id', 'Company Code', 'uuid',  'reference','one','standard',true, true,  false, false,110,v_su),
            (v_ev,'book_code',       'book_code',       'Book Code',    'string','text',     'one','standard',true, true,  true,  true, 120,v_su),
            (v_ev,'is_leading',      'is_leading',      'Leading Book', 'boolean','hidden',  'one','standard',false,true,  false, false,130,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    RAISE NOTICE '035_version_fields/006_fields_coa_gl: done';
END $$;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/010_system/entity_engine/035_version_fields/007_fields_project_fiscal.sql
-- 035_version_fields/007_fields_project_fiscal.sql
-- Version-bound entity_field rows for Project/Fiscal entities (61–64)
-- Entities: project, project_item, dimension_set, fiscal_period
-- Idempotent: ON CONFLICT DO NOTHING

DO $$
DECLARE
    v_su uuid := '00000000-0000-0000-0000-000000000000';
    v_ev uuid;
BEGIN

    -- ── project ───────────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'project' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'project_type',      'project_type',      'Project Type',   'enum',   'select',   'one','standard',true, true,  true,  false,110,v_su),
            (v_ev,'company_code_id',   'company_code_id',   'Company Code',   'uuid',   'reference','one','standard',true, true,  false, false,120,v_su),
            (v_ev,'start_date',        'start_date',        'Start Date',     'date',   'date',     'one','standard',true, true,  true,  false,130,v_su),
            (v_ev,'end_date',          'end_date',          'End Date',       'date',   'date',     'one','standard',false,true,  true,  false,140,v_su),
            (v_ev,'budget_amount',     'budget_amount',     'Budget',         'money',  'money',    'one','standard',false,true,  true,  false,150,v_su),
            (v_ev,'currency_id',       'currency_id',       'Currency',       'uuid',   'reference','one','standard',false,true,  false, false,160,v_su),
            (v_ev,'project_manager_id','project_manager_id','Project Manager','uuid',   'reference','one','standard',false,true,  false, false,170,v_su),
            (v_ev,'parent_project_id', 'parent_project_id', 'Parent Project', 'uuid',   'reference','one','standard',false,true,  false, false,180,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── project_item ──────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'project_item' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'project_id',      'project_id',      'Project',       'uuid', 'reference','one','standard',true, true,  false, false,110,v_su),
            (v_ev,'item_type',       'item_type',       'Item Type',     'enum', 'select',   'one','standard',true, true,  true,  false,120,v_su),
            (v_ev,'planned_amount',  'planned_amount',  'Planned',       'money','money',    'one','standard',false,true,  true,  false,130,v_su),
            (v_ev,'currency_id',     'currency_id',     'Currency',      'uuid', 'reference','one','standard',false,true,  false, false,140,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── dimension_set ─────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'dimension_set' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'company_code_id', 'company_code_id', 'Company Code', 'uuid',   'reference','one','standard',true, true,  false, false,110,v_su),
            (v_ev,'is_mandatory',    'is_mandatory',    'Mandatory',    'boolean','hidden',   'one','standard',false,true,  false, false,120,v_su),
            (v_ev,'dimension_count', 'dimension_count', 'Dimensions',   'integer','number',   'one','system',  false,false, false, false,130,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── fiscal_period ─────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'fiscal_period' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'period_no',       'period_no',       'Period No.',   'integer','number',   'one','standard',true, true,  true,  false,110,v_su),
            (v_ev,'period_type',     'period_type',     'Period Type',  'enum',   'select',   'one','standard',true, true,  true,  false,120,v_su),
            (v_ev,'fiscal_year',     'fiscal_year',     'Fiscal Year',  'integer','number',   'one','standard',true, true,  true,  false,130,v_su),
            (v_ev,'start_date',      'start_date',      'Start Date',   'date',   'date',     'one','standard',true, true,  true,  false,140,v_su),
            (v_ev,'end_date',        'end_date',        'End Date',     'date',   'date',     'one','standard',true, true,  true,  false,150,v_su),
            (v_ev,'company_code_id', 'company_code_id', 'Company Code', 'uuid',   'reference','one','standard',true, true,  false, false,160,v_su),
            (v_ev,'posting_status',  'posting_status',  'Posting Status','enum',  'status',   'one','system',  true, true,  true,  false,170,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    RAISE NOTICE '035_version_fields/007_fields_project_fiscal: done';
END $$;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/010_system/entity_engine/035_version_fields/008_fields_partners.sql
-- 035_version_fields/008_fields_partners.sql
-- Version-bound entity_field rows for Business Partners (65–69)
-- Entities: customer, supplier, employee,
--           company_code_customer_profile, company_code_supplier_profile
-- Idempotent: ON CONFLICT DO NOTHING

DO $$
DECLARE
    v_su uuid := '00000000-0000-0000-0000-000000000000';
    v_ev uuid;
BEGIN

    -- ── customer ──────────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'customer' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'legal_name',       'legal_name',       'Legal Name',        'string', 'text',     'one','standard',true, true,  true,  true, 110,v_su),
            (v_ev,'customer_type',    'customer_type',    'Type',              'enum',   'select',   'one','standard',true, true,  true,  false,120,v_su),
            (v_ev,'tax_identifier',   'tax_id',           'Tax ID',            'string', 'text',     'one','standard',false,true,  false, true, 130,v_su),
            (v_ev,'credit_limit',     'credit_limit',     'Credit Limit',      'money',  'money',    'one','standard',false,true,  true,  false,140,v_su),
            (v_ev,'credit_currency_id','credit_currency_id','Credit Currency', 'uuid',   'reference','one','standard',false,true,  false, false,150,v_su),
            (v_ev,'payment_term_id',  'payment_term_id',  'Payment Terms',     'uuid',   'reference','one','standard',false,true,  false, false,160,v_su),
            (v_ev,'account_manager_id','account_manager_id','Account Manager', 'uuid',   'reference','one','standard',false,true,  false, false,170,v_su),
            (v_ev,'risk_rating',      'risk_rating',      'Risk Rating',       'enum',   'select',   'one','standard',false,true,  true,  false,180,v_su),
            (v_ev,'is_key_account',   'is_key_account',   'Key Account',       'boolean','hidden',   'one','standard',false,true,  false, false,190,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── supplier ──────────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'supplier' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'legal_name',       'legal_name',       'Legal Name',      'string','text',     'one','standard',true, true,  true,  true, 110,v_su),
            (v_ev,'supplier_type',    'supplier_type',    'Type',            'enum',  'select',   'one','standard',true, true,  true,  false,120,v_su),
            (v_ev,'tax_identifier',   'tax_id',           'Tax ID',          'string','text',     'one','standard',false,true,  false, true, 130,v_su),
            (v_ev,'payment_term_id',  'payment_term_id',  'Payment Terms',   'uuid',  'reference','one','standard',false,true,  false, false,140,v_su),
            (v_ev,'payment_method_id','payment_method_id','Payment Method',  'uuid',  'reference','one','standard',false,true,  false, false,150,v_su),
            (v_ev,'account_manager_id','account_manager_id','Account Manager','uuid', 'reference','one','standard',false,true,  false, false,160,v_su),
            (v_ev,'spend_category_id','spend_category_id','Spend Category',  'uuid',  'reference','one','standard',false,true,  false, false,170,v_su),
            (v_ev,'is_preferred',     'is_preferred',     'Preferred',       'boolean','hidden',  'one','standard',false,true,  false, false,180,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── employee ──────────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'employee' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'legal_name',     'legal_name',     'Legal Name',    'string', 'text',     'one','standard',true, true,  true,  true, 110,v_su),
            (v_ev,'date_of_birth',  'date_of_birth',  'Date of Birth', 'date',   'date',     'one','standard',false,false, false, false,120,v_su),
            (v_ev,'national_identifier','national_id',    'National ID',   'string', 'text',     'one','standard',false,false, false, false,130,v_su),
            (v_ev,'department_id',  'department_id',  'Department',    'uuid',   'reference','one','standard',false,true,  false, false,140,v_su),
            (v_ev,'position_title', 'position_title', 'Position',      'string', 'text',     'one','standard',false,true,  true,  true, 150,v_su),
            (v_ev,'hire_date',      'hire_date',      'Hire Date',     'date',   'date',     'one','standard',false,true,  true,  false,160,v_su),
            (v_ev,'salary',         'salary',         'Salary',        'money',  'money',    'one','standard',false,false, false, false,170,v_su),
            (v_ev,'salary_currency_id','salary_currency_id','Currency','uuid',   'reference','one','standard',false,false, false, false,180,v_su),
            (v_ev,'manager_id',     'manager_id',     'Manager',       'uuid',   'reference','one','standard',false,true,  false, false,190,v_su),
            (v_ev,'principal_id',   'principal_id',   'User Account',  'uuid',   'reference','one','standard',false,true,  false, false,200,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── company_code_customer_profile ─────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'company_code_customer_profile' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'customer_id',     'customer_id',     'Customer',     'uuid','reference','one','standard',true, true,  false, false,110,v_su),
            (v_ev,'company_code_id', 'company_code_id', 'Company Code', 'uuid','reference','one','standard',true, true,  false, false,120,v_su),
            (v_ev,'ar_account_id',   'ar_account_id',   'AR Account',   'uuid','reference','one','standard',false,true,  false, false,130,v_su),
            (v_ev,'credit_limit_local','credit_limit_local','Credit Limit (Local)','money','money','one','standard',false,true,true,false,140,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── company_code_supplier_profile ─────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'company_code_supplier_profile' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'supplier_id',     'supplier_id',     'Supplier',      'uuid','reference','one','standard',true, true,  false, false,110,v_su),
            (v_ev,'company_code_id', 'company_code_id', 'Company Code',  'uuid','reference','one','standard',true, true,  false, false,120,v_su),
            (v_ev,'ap_account_id',   'ap_account_id',   'AP Account',    'uuid','reference','one','standard',false,true,  false, false,130,v_su),
            (v_ev,'payment_method_id','payment_method_id','Payment Method','uuid','reference','one','standard',false,true, false, false,140,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    RAISE NOTICE '035_version_fields/008_fields_partners: done';
END $$;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/010_system/entity_engine/035_version_fields/009_fields_assets.sql
-- 035_version_fields/009_fields_assets.sql
-- Version-bound entity_field rows for Asset entities (70–74)
-- Entities: asset_class, asset, asset_book, asset_component, asset_assignment_history
-- Idempotent: ON CONFLICT DO NOTHING

DO $$
DECLARE
    v_su uuid := '00000000-0000-0000-0000-000000000000';
    v_ev uuid;
BEGIN

    -- ── asset_class ───────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'asset_class' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'company_code_id',   'company_code_id',   'Company Code',  'uuid',   'reference','one','standard',true, true,  false, false,110,v_su),
            (v_ev,'parent_id',         'parent_id',         'Parent Class',  'uuid',   'reference','one','standard',false,true,  false, false,120,v_su),
            (v_ev,'asset_nature',      'asset_nature',      'Nature',        'enum',   'select',   'one','standard',true, true,  true,  false,130,v_su),
            (v_ev,'is_depreciable',    'is_depreciable',    'Depreciable',   'boolean','hidden',   'one','standard',false,true,  false, false,140,v_su),
            (v_ev,'capitalization_threshold','capitalization_threshold','Cap Threshold','money','money','one','standard',false,true,true,false,150,v_su),
            (v_ev,'currency_code',     'currency_code',     'Currency',      'string', 'text',     'one','standard',true, true,  false, false,160,v_su),
            (v_ev,'sort_order',        'sort_order',        'Sort Order',    'integer','number',   'one','standard',false,false, true,  false,170,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── asset ─────────────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'asset' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'company_code_id',   'company_code_id',   'Company Code',    'uuid',   'reference','one','standard',true, true,  false, false,110,v_su),
            (v_ev,'asset_class_id',    'asset_class_id',    'Asset Class',     'uuid',   'reference','one','standard',true, true,  false, false,120,v_su),
            (v_ev,'acquisition_date',  'acquisition_date',  'Acquisition Date','date',   'date',     'one','standard',true, true,  true,  false,130,v_su),
            (v_ev,'in_service_date',   'in_service_date',   'In Service Date', 'date',   'date',     'one','standard',false,true,  true,  false,140,v_su),
            (v_ev,'acquisition_cost',  'acquisition_cost',  'Acquisition Cost','money',  'money',    'one','standard',true, true,  true,  false,150,v_su),
            (v_ev,'currency_code',     'currency_code',     'Currency',        'string', 'text',     'one','standard',true, true,  false, false,160,v_su),
            (v_ev,'useful_life_months','useful_life_months','Useful Life (mo)','integer','number',   'one','standard',true, true,  true,  false,170,v_su),
            (v_ev,'cost_center_id',    'cost_center_id',    'Cost Center',     'uuid',   'reference','one','standard',false,true,  false, false,180,v_su),
            (v_ev,'custodian_id',      'custodian_id',      'Custodian',       'uuid',   'reference','one','standard',false,true,  false, false,190,v_su),
            (v_ev,'barcode',           'barcode',           'Barcode',         'string', 'text',     'one','standard',false,true,  false, true, 200,v_su),
            (v_ev,'serial_number',     'serial_number',     'Serial No.',      'string', 'text',     'one','standard',false,true,  false, true, 210,v_su),
            (v_ev,'retirement_type',   'retirement_type',   'Retirement Type', 'enum',   'select',   'one','standard',false,true,  true,  false,220,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── asset_book ────────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'asset_book' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'asset_id',              'asset_id',              'Asset',            'uuid',   'reference','one','standard',true, true,  false, false,110,v_su),
            (v_ev,'book_type',             'book_type',             'Book Type',        'enum',   'select',   'one','standard',true, true,  true,  false,120,v_su),
            (v_ev,'depreciation_method',   'depreciation_method',   'Depr Method',      'enum',   'select',   'one','standard',true, true,  true,  false,130,v_su),
            (v_ev,'useful_life_months',    'useful_life_months',    'Useful Life (mo)', 'integer','number',   'one','standard',true, true,  true,  false,140,v_su),
            (v_ev,'cost_basis',            'cost_basis',            'Cost Basis',       'money',  'money',    'one','standard',true, true,  true,  false,150,v_su),
            (v_ev,'accumulated_depreciation','accumulated_depreciation','Accum Depr',   'money',  'money',    'one','system',  false,true,  true,  false,160,v_su),
            (v_ev,'carrying_amount',       'carrying_amount',       'Carrying Amount',  'money',  'money',    'one','system',  false,true,  true,  false,170,v_su),
            (v_ev,'currency_code',         'currency_code',         'Currency',         'string', 'text',     'one','standard',true, true,  false, false,180,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── asset_component ───────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'asset_component' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'company_code_id',   'company_code_id',   'Company Code',    'uuid',   'reference','one','standard',true, true,  false, false,110,v_su),
            (v_ev,'parent_asset_id',   'parent_asset_id',   'Parent Asset',    'uuid',   'reference','one','standard',true, true,  false, false,120,v_su),
            (v_ev,'component_asset_id','component_asset_id','Component Asset', 'uuid',   'reference','one','standard',true, true,  false, false,130,v_su),
            (v_ev,'component_type',    'component_type',    'Component Type',  'enum',   'select',   'one','standard',true, true,  true,  false,140,v_su),
            (v_ev,'pct_of_parent',     'pct_of_parent',     'Allocation %',    'decimal','number',   'one','standard',true, true,  true,  false,150,v_su),
            (v_ev,'allocated_cost',    'allocated_cost',    'Allocated Cost',  'money',  'money',    'one','standard',true, true,  true,  false,160,v_su),
            (v_ev,'useful_life_months','useful_life_months','Useful Life (mo)','integer','number',   'one','standard',true, true,  true,  false,170,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── asset_assignment_history ──────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'asset_assignment_history' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'asset_id',       'asset_id',       'Asset',          'uuid',     'reference','one','standard',true, true,  false, false,110,v_su),
            (v_ev,'assignment_type','assignment_type','Assignment Type','enum',     'select',   'one','standard',true, true,  true,  false,120,v_su),
            (v_ev,'to_value_id',    'to_value_id',    'To (New)',       'uuid',     'reference','one','standard',false,true,  false, false,130,v_su),
            (v_ev,'effective_from', 'effective_from', 'Effective From', 'date',     'date',     'one','standard',true, true,  true,  false,140,v_su),
            (v_ev,'effective_to',   'effective_to',   'Effective To',   'date',     'date',     'one','standard',false,true,  true,  false,150,v_su),
            (v_ev,'reason',         'reason',         'Reason',         'text',     'textarea', 'one','standard',false,false, false, true, 160,v_su),
            (v_ev,'assigned_by',    'assigned_by',    'Assigned By',    'uuid',     'reference','one','standard',true, true,  false, false,170,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    RAISE NOTICE '035_version_fields/009_fields_assets: done';
END $$;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/010_system/entity_engine/035_version_fields/010_fields_dimensions.sql
-- 035_version_fields/010_fields_dimensions.sql
-- Version-bound entity_field rows for Dimension/Intent entities (75–80)
-- Entities: dimension_type, dimension_value, dimension_set_item,
--           business_intent, company_code_intent_policy, company_code_dimension_default
-- Idempotent: ON CONFLICT DO NOTHING

DO $$
DECLARE
    v_su uuid := '00000000-0000-0000-0000-000000000000';
    v_ev uuid;
BEGIN

    -- ── dimension_type ────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'dimension_type' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'category',              'category',              'Category',          'enum',    'select', 'one','standard',true, true,  true,  false,110,v_su),
            (v_ev,'is_hierarchical',       'is_hierarchical',       'Hierarchical',      'boolean', 'hidden', 'one','standard',false,true,  false, false,120,v_su),
            (v_ev,'max_depth',             'max_depth',             'Max Depth',         'integer', 'number', 'one','standard',false,false, true,  false,130,v_su),
            (v_ev,'is_balanced',           'is_balanced',           'Balanced',          'boolean', 'hidden', 'one','standard',false,true,  false, false,140,v_su),
            (v_ev,'is_multi_allowed',      'is_multi_allowed',      'Multi-Value',       'boolean', 'hidden', 'one','standard',false,true,  false, false,150,v_su),
            (v_ev,'is_company_scoped_allowed','is_company_scoped_allowed','Company Scoped','boolean','hidden', 'one','standard',false,true,  false, false,160,v_su),
            (v_ev,'source_entity_name',    'source_entity_name',    'Source Entity',     'string',  'text',   'one','system',  false,true,  false, false,170,v_su),
            (v_ev,'icon',                  'icon',                  'Icon',              'string',  'text',   'one','standard',false,false, false, false,180,v_su),
            (v_ev,'sort_order',            'sort_order',            'Sort Order',        'integer', 'number', 'one','standard',false,false, true,  false,190,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── dimension_value ───────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'dimension_value' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'dimension_type_id',   'dimension_type_id',   'Dimension Type',    'uuid',    'reference','one','standard',true, true,  false, false,110,v_su),
            (v_ev,'company_code_id',     'company_code_id',     'Company Code',      'uuid',    'reference','one','standard',false,true,  false, false,120,v_su),
            (v_ev,'parent_id',           'parent_id',           'Parent',            'uuid',    'reference','one','standard',false,true,  false, false,130,v_su),
            (v_ev,'level_no',            'level_no',            'Level',             'integer', 'number',   'one','system',  false,true,  true,  false,140,v_su),
            (v_ev,'path_key',            'path_key',            'Path',              'string',  'text',     'one','system',  false,false, true,  false,150,v_su),
            (v_ev,'effective_from',      'effective_from',      'Effective From',    'date',    'date',     'one','standard',false,true,  true,  false,160,v_su),
            (v_ev,'effective_to',        'effective_to',        'Effective To',      'date',    'date',     'one','standard',false,true,  true,  false,170,v_su),
            (v_ev,'is_posting_allowed',  'is_posting_allowed',  'Posting Allowed',   'boolean', 'hidden',   'one','standard',false,true,  false, false,180,v_su),
            (v_ev,'is_budgeting_allowed','is_budgeting_allowed','Budgeting Allowed', 'boolean', 'hidden',   'one','standard',false,true,  false, false,190,v_su),
            (v_ev,'is_planning_allowed', 'is_planning_allowed', 'Planning Allowed',  'boolean', 'hidden',   'one','standard',false,true,  false, false,200,v_su),
            (v_ev,'sort_order',          'sort_order',          'Sort Order',        'integer', 'number',   'one','standard',false,false, true,  false,210,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── dimension_set_item ────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'dimension_set_item' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'dimension_set_id',   'dimension_set_id',   'Dimension Set',  'uuid',    'reference','one','standard',true, true,  false, false,110,v_su),
            (v_ev,'dimension_type_id',  'dimension_type_id',  'Dimension Type', 'uuid',    'reference','one','standard',true, true,  false, false,120,v_su),
            (v_ev,'dimension_value_id', 'dimension_value_id', 'Value',          'uuid',    'reference','one','standard',true, true,  false, false,130,v_su),
            (v_ev,'ordinal',            'ordinal',            'Order',          'integer', 'number',   'one','standard',true, false, true,  false,140,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── business_intent ───────────────────────────────────────────────────────
    -- CONTROL class: 000_common_fields inserts description/status/is_active but NOT code/name
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'business_intent' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'code',                   'code',                   'Code',              'string',  'text',     'one','standard',true, true,  true,  true, 100,v_su),
            (v_ev,'name',                   'name',                   'Name',              'string',  'text',     'one','standard',true, false, true,  true, 105,v_su),
            (v_ev,'domain',                 'domain',                 'Domain',            'enum',    'select',   'one','standard',true, true,  true,  false,110,v_su),
            (v_ev,'subtype',                'subtype',                'Subtype',           'string',  'text',     'one','standard',false,true,  true,  false,120,v_su),
            (v_ev,'parent_id',              'parent_id',              'Parent Intent',     'uuid',    'reference','one','standard',false,true,  false, false,130,v_su),
            (v_ev,'default_gl_account_id',  'default_gl_account_id',  'Default GL Account','uuid',   'reference','one','standard',false,true,  false, false,140,v_su),
            (v_ev,'default_tax_group_id',   'default_tax_group_id',   'Default Tax Group', 'uuid',   'reference','one','standard',false,true,  false, false,150,v_su),
            (v_ev,'is_approval_required',   'is_approval_required',   'Approval Required', 'boolean', 'hidden',   'one','standard',false,true,  false, false,160,v_su),
            (v_ev,'max_auto_approve_amount','max_auto_approve_amount','Max Auto-Approve',  'money',   'money',    'one','standard',false,true,  true,  false,170,v_su),
            (v_ev,'visibility',             'visibility',             'Visibility',        'enum',    'select',   'one','standard',true, true,  true,  false,180,v_su),
            (v_ev,'sort_order',             'sort_order',             'Sort Order',        'integer', 'number',   'one','standard',false,false, true,  false,190,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── company_code_intent_policy ────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'company_code_intent_policy' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'company_code_id',         'company_code_id',         'Company Code',     'uuid',  'reference','one','standard',true, true,  false, false,110,v_su),
            (v_ev,'intent_id',               'intent_id',               'Intent',           'uuid',  'reference','one','standard',true, true,  false, false,120,v_su),
            (v_ev,'mapping_mode',            'mapping_mode',            'Mode',             'enum',  'select',   'one','standard',true, true,  true,  false,130,v_su),
            (v_ev,'is_default',              'is_default',              'Default',          'boolean','hidden',  'one','standard',false,true,  false, false,140,v_su),
            (v_ev,'override_gl_account_id',  'override_gl_account_id',  'Override GL Acct', 'uuid',  'reference','one','standard',false,true,  false, false,150,v_su),
            (v_ev,'notes',                   'notes',                   'Notes',            'text',  'textarea', 'one','standard',false,false, false, true, 160,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── company_code_dimension_default ────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'company_code_dimension_default' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'company_code_id',    'company_code_id',    'Company Code',   'uuid',    'reference','one','standard',true, true,  false, false,110,v_su),
            (v_ev,'dimension_type_id',  'dimension_type_id',  'Dimension Type', 'uuid',    'reference','one','standard',true, true,  false, false,120,v_su),
            (v_ev,'dimension_value_id', 'dimension_value_id', 'Default Value',  'uuid',    'reference','one','standard',true, true,  false, false,130,v_su),
            (v_ev,'is_mandatory',       'is_mandatory',       'Mandatory',      'boolean', 'hidden',   'one','standard',false,true,  false, false,140,v_su),
            (v_ev,'allow_override',     'allow_override',     'Allow Override', 'boolean', 'hidden',   'one','standard',false,true,  false, false,150,v_su),
            (v_ev,'effective_from',     'effective_from',     'Effective From', 'date',    'date',     'one','standard',true, true,  true,  false,160,v_su),
            (v_ev,'effective_to',       'effective_to',       'Effective To',   'date',    'date',     'one','standard',false,true,  true,  false,170,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    RAISE NOTICE '035_version_fields/010_fields_dimensions: done';
END $$;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/010_system/entity_engine/035_version_fields/011_fields_tax_fx.sql
-- 035_version_fields/011_fields_tax_fx.sql
-- Version-bound entity_field rows for Tax/FX entities (81–83)
-- Entities: tax_jurisdiction, tax_type, fx_rate
-- Idempotent: ON CONFLICT DO NOTHING

DO $$
DECLARE
    v_su uuid := '00000000-0000-0000-0000-000000000000';
    v_ev uuid;
BEGIN

    -- ── tax_jurisdiction ──────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'tax_jurisdiction' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'country_code',       'country_code',       'Country',          'string',  'text',  'one','standard',true, true,  true,  false,110,v_su),
            (v_ev,'state_region_code',  'state_region_code',  'State/Region',     'string',  'text',  'one','standard',false,true,  true,  false,120,v_su),
            (v_ev,'jurisdiction_type',  'jurisdiction_type',  'Type',             'enum',    'select','one','standard',true, true,  true,  false,130,v_su),
            (v_ev,'parent_id',          'parent_id',          'Parent',           'uuid',    'reference','one','standard',false,true,false,false,140,v_su),
            (v_ev,'level_no',           'level_no',           'Level',            'integer', 'number','one','system',  false,true,  true,  false,150,v_su),
            (v_ev,'filing_frequency',   'filing_frequency',   'Filing Frequency', 'enum',    'select','one','standard',false,true,  true,  false,160,v_su),
            (v_ev,'currency_code',      'currency_code',      'Currency',         'string',  'text',  'one','standard',false,true,  false, false,170,v_su),
            (v_ev,'sort_order',         'sort_order',         'Sort Order',       'integer', 'number','one','standard',false,false, true,  false,180,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── tax_type ──────────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'tax_type' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'category',              'category',              'Category',         'enum',    'select','one','standard',true, true,  true,  false,110,v_su),
            (v_ev,'is_recoverable',        'is_recoverable',        'Recoverable',      'boolean', 'hidden','one','standard',false,true,  false, false,120,v_su),
            (v_ev,'is_deducted_at_source', 'is_deducted_at_source', 'Deducted at Source','boolean','hidden','one','standard',false,true,  false, false,130,v_su),
            (v_ev,'is_included_in_price',  'is_included_in_price',  'Included in Price','boolean', 'hidden','one','standard',false,true,  false, false,140,v_su),
            (v_ev,'is_compound_eligible',  'is_compound_eligible',  'Compound Eligible','boolean', 'hidden','one','standard',false,true,  false, false,150,v_su),
            (v_ev,'sort_order',            'sort_order',            'Sort Order',       'integer', 'number','one','standard',false,false, true,  false,160,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── fx_rate ───────────────────────────────────────────────────────────────
    -- NOTE: fx_rate has no code/name columns; 000_common_fields bulk-inserts them
    -- for all MASTER entities (harmless — ON CONFLICT DO NOTHING guards inserts).
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'fx_rate' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'from_currency',  'from_currency',  'From Currency', 'string',  'text',  'one','standard',true, true,  true,  false,110,v_su),
            (v_ev,'to_currency',    'to_currency',    'To Currency',   'string',  'text',  'one','standard',true, true,  true,  false,120,v_su),
            (v_ev,'rate',           'rate',           'Rate',          'decimal', 'number','one','standard',true, false, true,  false,130,v_su),
            (v_ev,'rate_type',      'rate_type',      'Rate Type',     'enum',    'select','one','standard',true, true,  true,  false,140,v_su),
            (v_ev,'effective_date', 'effective_date', 'Effective Date','date',    'date',  'one','standard',true, true,  true,  false,150,v_su),
            (v_ev,'source',         'source',         'Source',        'enum',    'select','one','standard',true, true,  true,  false,160,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    RAISE NOTICE '035_version_fields/011_fields_tax_fx: done';
END $$;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/010_system/entity_engine/035_version_fields/012_fields_budget.sql
-- 035_version_fields/012_fields_budget.sql
-- Version-bound entity_field rows for Budget/Planning entities (84–86)
-- Entities: budget_profile, budget_allocation, planning_model
-- Idempotent: ON CONFLICT DO NOTHING

DO $$
DECLARE
    v_su uuid := '00000000-0000-0000-0000-000000000000';
    v_ev uuid;
BEGIN

    -- ── budget_profile ────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'budget_profile' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'company_code_id',     'company_code_id',     'Company Code',     'uuid',    'reference','one','standard',true, true,  false, false,110,v_su),
            (v_ev,'fund_type',           'fund_type',           'Fund Type',        'enum',    'select',   'one','standard',true, true,  true,  false,120,v_su),
            (v_ev,'fund_source',         'fund_source',         'Fund Source',      'enum',    'select',   'one','standard',true, true,  true,  false,130,v_su),
            (v_ev,'currency_code',       'currency_code',       'Currency',         'string',  'text',     'one','standard',true, true,  false, false,140,v_su),
            (v_ev,'total_amount',        'total_amount',        'Total Amount',     'money',   'money',    'one','standard',true, true,  true,  false,150,v_su),
            (v_ev,'reserved_amount',     'reserved_amount',     'Reserved',         'money',   'money',    'one','system',  false,true,  true,  false,160,v_su),
            (v_ev,'consumed_amount',     'consumed_amount',     'Consumed',         'money',   'money',    'one','system',  false,true,  true,  false,170,v_su),
            (v_ev,'available_amount',    'available_amount',    'Available',        'money',   'money',    'one','system',  false,true,  true,  false,180,v_su),
            (v_ev,'fiscal_year',         'fiscal_year',         'Fiscal Year',      'integer', 'number',   'one','standard',true, true,  true,  false,190,v_su),
            (v_ev,'is_multi_year',       'is_multi_year',       'Multi-Year',       'boolean', 'hidden',   'one','standard',false,true,  false, false,200,v_su),
            (v_ev,'multi_year_strategy', 'multi_year_strategy', 'Multi-Yr Strategy','enum',    'select',   'one','standard',false,true,  true,  false,210,v_su),
            (v_ev,'overspend_policy',    'overspend_policy',    'Overspend Policy', 'enum',    'select',   'one','standard',true, true,  true,  false,220,v_su),
            (v_ev,'is_replenishable',    'is_replenishable',    'Replenishable',    'boolean', 'hidden',   'one','standard',false,true,  false, false,230,v_su),
            (v_ev,'responsible_person_id','responsible_person_id','Owner',          'uuid',    'reference','one','standard',false,true,  false, false,240,v_su),
            (v_ev,'parent_profile_id',   'parent_profile_id',   'Parent Profile',   'uuid',    'reference','one','standard',false,true,  false, false,250,v_su),
            (v_ev,'sort_order',          'sort_order',          'Sort Order',       'integer', 'number',   'one','standard',false,false, true,  false,260,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── budget_allocation ─────────────────────────────────────────────────────
    -- DOCUMENT class: code/name not bulk-inserted by 000_common_fields; add explicitly
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'budget_allocation' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'code',                'code',                'Code',             'string',  'text',     'one','standard',true, true,  true,  true, 100,v_su),
            (v_ev,'name',                'name',                'Name',             'string',  'text',     'one','standard',true, false, true,  true, 105,v_su),
            (v_ev,'budget_profile_id',   'budget_profile_id',   'Budget Profile',   'uuid',    'reference','one','standard',true, true,  false, false,110,v_su),
            (v_ev,'company_code_id',     'company_code_id',     'Company Code',     'uuid',    'reference','one','standard',true, true,  false, false,120,v_su),
            (v_ev,'fiscal_year',         'fiscal_year',         'Fiscal Year',      'integer', 'number',   'one','standard',true, true,  true,  false,130,v_su),
            (v_ev,'currency_code',       'currency_code',       'Currency',         'string',  'text',     'one','standard',true, true,  false, false,140,v_su),
            (v_ev,'cost_center_id',      'cost_center_id',      'Cost Center',      'uuid',    'reference','one','standard',false,true,  false, false,150,v_su),
            (v_ev,'project_id',          'project_id',          'Project',          'uuid',    'reference','one','standard',false,true,  false, false,160,v_su),
            (v_ev,'gl_account_id',       'gl_account_id',       'GL Account',       'uuid',    'reference','one','standard',false,true,  false, false,170,v_su),
            (v_ev,'allocated_amount',    'allocated_amount',    'Allocated',        'money',   'money',    'one','standard',true, true,  true,  false,180,v_su),
            (v_ev,'reserved_amount',     'reserved_amount',     'Reserved',         'money',   'money',    'one','system',  false,true,  true,  false,190,v_su),
            (v_ev,'consumed_amount',     'consumed_amount',     'Consumed',         'money',   'money',    'one','system',  false,true,  true,  false,200,v_su),
            (v_ev,'available_amount',    'available_amount',    'Available',        'money',   'money',    'one','system',  false,true,  true,  false,210,v_su),
            (v_ev,'overspend_policy',    'overspend_policy',    'Overspend Policy', 'enum',    'select',   'one','standard',true, true,  true,  false,220,v_su),
            (v_ev,'is_carry_forward',    'is_carry_forward',    'Carry Forward',    'boolean', 'hidden',   'one','standard',false,true,  false, false,230,v_su),
            (v_ev,'responsible_person_id','responsible_person_id','Owner',          'uuid',    'reference','one','standard',false,true,  false, false,240,v_su),
            (v_ev,'sort_order',          'sort_order',          'Sort Order',       'integer', 'number',   'one','standard',false,false, true,  false,250,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── planning_model ────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'planning_model' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'company_code_id',      'company_code_id',      'Company Code',    'uuid',    'reference','one','standard',true, true,  false, false,110,v_su),
            (v_ev,'model_type',           'model_type',           'Model Type',      'enum',    'select',   'one','standard',true, true,  true,  false,120,v_su),
            (v_ev,'planning_horizon',     'planning_horizon',     'Horizon',         'enum',    'select',   'one','standard',true, true,  true,  false,130,v_su),
            (v_ev,'granularity',          'granularity',          'Granularity',     'enum',    'select',   'one','standard',true, true,  true,  false,140,v_su),
            (v_ev,'base_currency_code',   'base_currency_code',   'Base Currency',   'string',  'text',     'one','standard',true, true,  false, false,150,v_su),
            (v_ev,'fiscal_year_from',     'fiscal_year_from',     'Fiscal Year From','integer', 'number',   'one','standard',true, true,  true,  false,160,v_su),
            (v_ev,'fiscal_year_to',       'fiscal_year_to',       'Fiscal Year To',  'integer', 'number',   'one','standard',true, true,  true,  false,170,v_su),
            (v_ev,'version',              'version',              'Version',         'integer', 'number',   'one','system',  false,true,  true,  false,180,v_su),
            (v_ev,'is_current',           'is_current',           'Current',         'boolean', 'hidden',   'one','standard',false,true,  false, false,190,v_su),
            (v_ev,'based_on_model_id',    'based_on_model_id',    'Based On',        'uuid',    'reference','one','standard',false,true,  false, false,200,v_su),
            (v_ev,'responsible_person_id','responsible_person_id','Owner',           'uuid',    'reference','one','standard',false,true,  false, false,210,v_su),
            (v_ev,'sort_order',           'sort_order',           'Sort Order',      'integer', 'number',   'one','standard',false,false, true,  false,220,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    RAISE NOTICE '035_version_fields/012_fields_budget: done';
END $$;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/010_system/entity_engine/035_version_fields/013_fields_banking.sql
-- 035_version_fields/013_fields_banking.sql
-- Version-bound entity_field rows for Banking/Payment entities (87–91)
-- Entities: bank_party, bank_account, bank_account_link,
--           bank_account_house_config, payment_method
-- NOTE: bank_party boolean cols supports_swift/sepa/ach (starts with supports_)
--       and payment_method capability flags (requires_*/supports_*) are omitted —
--       they violate the ef_bool_naming_chk constraint.
-- Idempotent: ON CONFLICT DO NOTHING

DO $$
DECLARE
    v_su uuid := '00000000-0000-0000-0000-000000000000';
    v_ev uuid;
BEGIN

    -- ── bank_party ────────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'bank_party' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'country_code',          'country_code',          'Country',              'string', 'text',  'one','standard',true, true,  true,  false,110,v_su),
            (v_ev,'institution_type',      'institution_type',      'Institution Type',     'enum',   'select','one','standard',true, true,  true,  false,120,v_su),
            (v_ev,'bic',                   'bic',                   'BIC / SWIFT',          'string', 'text',  'one','standard',false,true,  false, true, 130,v_su),
            (v_ev,'national_bank_code_type','national_bank_code_type','Bank Code Type',      'string', 'text',  'one','standard',false,true,  false, false,140,v_su),
            (v_ev,'national_bank_code',    'national_bank_code',    'Bank Code',            'string', 'text',  'one','standard',false,false, false, true, 150,v_su),
            (v_ev,'branch_name',           'branch_name',           'Branch Name',          'string', 'text',  'one','standard',false,false, false, true, 160,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── bank_account ──────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'bank_account' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'bank_party_id',       'bank_party_id',       'Bank',              'uuid',   'reference','one','standard',false,true,  false, false,110,v_su),
            (v_ev,'account_holder_name', 'account_holder_name', 'Account Holder',    'string', 'text',     'one','standard',true, false, true,  true, 120,v_su),
            (v_ev,'account_id_type',     'account_id_type',     'Account ID Type',   'enum',   'select',   'one','standard',true, true,  true,  false,130,v_su),
            (v_ev,'account_id_value',    'account_id_value',    'Account Number',    'string', 'text',     'one','standard',true, false, false, false,140,v_su),
            (v_ev,'account_last4',       'account_last4',       'Last 4',            'string', 'text',     'one','system',  false,false, false, false,150,v_su),
            (v_ev,'currency_code',       'currency_code',       'Currency',          'string', 'text',     'one','standard',true, true,  true,  false,160,v_su),
            (v_ev,'account_nature',      'account_nature',      'Account Nature',    'enum',   'select',   'one','standard',true, true,  true,  false,170,v_su),
            (v_ev,'is_verified',         'is_verified',         'Verified',          'boolean','hidden',   'one','standard',false,true,  false, false,180,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── bank_account_link ─────────────────────────────────────────────────────
    -- RELATION class: only id, tenant_id, created_at, created_by in common fields
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'bank_account_link' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'owner_type',      'owner_type',      'Owner Type',    'string',  'text',     'one','standard',true, true,  true,  false,110,v_su),
            (v_ev,'owner_id',        'owner_id',        'Owner',         'uuid',    'reference','one','standard',true, true,  false, false,120,v_su),
            (v_ev,'bank_account_id', 'bank_account_id', 'Bank Account',  'uuid',    'reference','one','standard',true, true,  false, false,130,v_su),
            (v_ev,'company_code_id', 'company_code_id', 'Company Code',  'uuid',    'reference','one','standard',false,true,  false, false,140,v_su),
            (v_ev,'purpose',         'purpose',         'Purpose',       'string',  'text',     'one','standard',true, true,  true,  false,150,v_su),
            (v_ev,'is_primary',      'is_primary',      'Primary',       'boolean', 'hidden',   'one','standard',false,true,  false, false,160,v_su),
            (v_ev,'effective_from',  'effective_from',  'Effective From','date',    'date',     'one','standard',true, true,  true,  false,170,v_su),
            (v_ev,'effective_until', 'effective_until', 'Effective To',  'date',    'date',     'one','standard',false,true,  true,  false,180,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── bank_account_house_config ─────────────────────────────────────────────
    -- CONTROL class: description seeded by 000_common_fields (no actual column — harmless)
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'bank_account_house_config' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'bank_account_link_id',  'bank_account_link_id',  'Bank Account Link', 'uuid',    'reference','one','standard',true, true,  false, false,110,v_su),
            (v_ev,'gl_account_id',         'gl_account_id',         'Cash GL Account',   'uuid',    'reference','one','standard',true, true,  false, false,120,v_su),
            (v_ev,'usage_type',            'usage_type',            'Usage Type',        'enum',    'select',   'one','standard',true, true,  true,  false,130,v_su),
            (v_ev,'is_disbursement_enabled','is_disbursement_enabled','Disbursement',     'boolean', 'hidden',   'one','standard',false,true,  false, false,140,v_su),
            (v_ev,'is_collection_enabled', 'is_collection_enabled', 'Collection',        'boolean', 'hidden',   'one','standard',false,true,  false, false,150,v_su),
            (v_ev,'is_default_disbursement','is_default_disbursement','Default Disbursement','boolean','hidden', 'one','standard',false,true,  false, false,160,v_su),
            (v_ev,'is_default_collection', 'is_default_collection', 'Default Collection','boolean', 'hidden',   'one','standard',false,true,  false, false,170,v_su),
            (v_ev,'reconciliation_mode',   'reconciliation_mode',   'Reconciliation',    'enum',    'select',   'one','standard',true, true,  true,  false,180,v_su),
            (v_ev,'priority',              'priority',              'Priority',          'integer', 'number',   'one','standard',false,false, true,  false,190,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── payment_method ────────────────────────────────────────────────────────
    -- NOTE: requires_*/supports_* capability flags omitted — violate ef_bool_naming_chk
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'payment_method' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'direction',       'direction',       'Direction',       'enum',    'select','one','standard',true, true,  true,  false,110,v_su),
            (v_ev,'instrument_mode', 'instrument_mode', 'Instrument Mode', 'enum',    'select','one','standard',true, true,  true,  false,120,v_su),
            (v_ev,'sort_order',      'sort_order',      'Sort Order',      'integer', 'number','one','standard',false,false, true,  false,130,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    RAISE NOTICE '035_version_fields/013_fields_banking: done';
END $$;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/010_system/entity_engine/035_version_fields/014_fields_payment_terms.sql
-- 035_version_fields/014_fields_payment_terms.sql
-- Version-bound entity_field rows for Payment Term entities (92–96)
-- Entities: holiday_calendar, holiday_calendar_day, payment_term,
--           payment_term_clause, payment_term_discount_tier
-- Idempotent: ON CONFLICT DO NOTHING

DO $$
DECLARE
    v_su uuid := '00000000-0000-0000-0000-000000000000';
    v_ev uuid;
BEGIN

    -- ── holiday_calendar ──────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'holiday_calendar' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'country_code',     'country_code',     'Country',          'string',  'text',  'one','standard',false,true,  true,  false,110,v_su),
            (v_ev,'company_code_id',  'company_code_id',  'Company Code',     'uuid',    'reference','one','standard',false,true,false,false,120,v_su),
            (v_ev,'weekend_pattern',  'weekend_pattern',  'Weekend Pattern',  'enum',    'select','one','standard',true, true,  true,  false,130,v_su),
            (v_ev,'is_default',       'is_default',       'Default',          'boolean', 'hidden','one','standard',false,true,  false, false,140,v_su),
            (v_ev,'sort_order',       'sort_order',       'Sort Order',       'integer', 'number','one','standard',false,false, true,  false,150,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── holiday_calendar_day ──────────────────────────────────────────────────
    -- RELATION class: only id, tenant_id, created_at, created_by in common fields
    -- name exists in DDL but not seeded by bulk pass — add explicitly
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'holiday_calendar_day' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'holiday_calendar_id','holiday_calendar_id','Calendar',      'uuid',    'reference','one','standard',true, true,  false, false,110,v_su),
            (v_ev,'calendar_year',      'calendar_year',      'Year',          'integer', 'number',   'one','standard',true, true,  true,  false,120,v_su),
            (v_ev,'holiday_date',       'holiday_date',       'Date',          'date',    'date',     'one','standard',true, true,  true,  false,130,v_su),
            (v_ev,'name',               'name',               'Name',          'string',  'text',     'one','standard',true, false, true,  true, 140,v_su),
            (v_ev,'day_type',           'day_type',           'Day Type',      'enum',    'select',   'one','standard',true, true,  true,  false,150,v_su),
            (v_ev,'observance_type',    'observance_type',    'Observance',    'enum',    'select',   'one','standard',true, true,  true,  false,160,v_su),
            (v_ev,'is_half_day',        'is_half_day',        'Half Day',      'boolean', 'hidden',   'one','standard',false,true,  false, false,170,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── payment_term ──────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'payment_term' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'applicable_to',          'applicable_to',          'Applicable To',    'enum',    'select','one','standard',true, true,  true,  false,110,v_su),
            (v_ev,'base_event',             'base_event',             'Base Event',       'enum',    'select','one','standard',true, true,  true,  false,120,v_su),
            (v_ev,'due_rule_type',          'due_rule_type',          'Due Rule',         'enum',    'select','one','standard',true, true,  true,  false,130,v_su),
            (v_ev,'due_days',               'due_days',               'Due Days',         'integer', 'number','one','standard',false,true,  true,  false,140,v_su),
            (v_ev,'grace_days',             'grace_days',             'Grace Days',       'integer', 'number','one','standard',true, true,  true,  false,150,v_su),
            (v_ev,'holiday_calendar_id',    'holiday_calendar_id',    'Holiday Calendar', 'uuid',    'reference','one','standard',false,true,false,false,160,v_su),
            (v_ev,'term_category',          'term_category',          'Category',         'enum',    'select','one','standard',true, true,  true,  false,170,v_su),
            (v_ev,'version',                'version',                'Version',          'integer', 'number','one','system',  false,true,  true,  false,180,v_su),
            (v_ev,'is_current_version',     'is_current_version',     'Current',          'boolean', 'hidden','one','system',  false,true,  false, false,190,v_su),
            (v_ev,'effective_from',         'effective_from',         'Effective From',   'date',    'date',  'one','standard',false,true,  true,  false,200,v_su),
            (v_ev,'effective_to',           'effective_to',           'Effective To',     'date',    'date',  'one','standard',false,true,  true,  false,210,v_su),
            (v_ev,'sort_order',             'sort_order',             'Sort Order',       'integer', 'number','one','standard',false,false, true,  false,220,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── payment_term_clause ───────────────────────────────────────────────────
    -- RELATION class: id, tenant_id, created_at, created_by in common fields
    -- is_active is standalone boolean (no status column) — add explicitly
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'payment_term_clause' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'payment_term_id', 'payment_term_id', 'Payment Term',    'uuid',    'reference','one','standard',true, true,  false, false,110,v_su),
            (v_ev,'clause_code',     'clause_code',     'Clause Code',     'string',  'text',     'one','standard',true, true,  true,  true, 120,v_su),
            (v_ev,'clause_type',     'clause_type',     'Clause Type',     'enum',    'select',   'one','standard',true, true,  true,  false,130,v_su),
            (v_ev,'sequence_no',     'sequence_no',     'Sequence',        'integer', 'number',   'one','standard',true, false, true,  false,140,v_su),
            (v_ev,'calc_mode',       'calc_mode',       'Calc Mode',       'enum',    'select',   'one','standard',true, true,  true,  false,150,v_su),
            (v_ev,'default_pct',     'default_pct',     'Default %',       'decimal', 'number',   'one','standard',false,false, true,  false,160,v_su),
            (v_ev,'default_amount',  'default_amount',  'Default Amount',  'money',   'money',    'one','standard',false,false, true,  false,170,v_su),
            (v_ev,'flexibility_mode','flexibility_mode','Flexibility',     'enum',    'select',   'one','standard',true, true,  true,  false,180,v_su),
            (v_ev,'is_active',       'is_active',       'Active',          'boolean', 'hidden',   'one','standard',false,true,  false, false,190,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── payment_term_discount_tier ────────────────────────────────────────────
    -- RELATION class
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'payment_term_discount_tier' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'payment_term_id',      'payment_term_id',      'Payment Term',  'uuid',    'reference','one','standard',true, true,  false, false,110,v_su),
            (v_ev,'tier_no',              'tier_no',              'Tier',          'integer', 'number',   'one','standard',true, true,  true,  false,120,v_su),
            (v_ev,'qualify_within_days',  'qualify_within_days',  'Qualify Days',  'integer', 'number',   'one','standard',true, true,  true,  false,130,v_su),
            (v_ev,'discount_pct',         'discount_pct',         'Discount %',    'decimal', 'number',   'one','standard',false,false, true,  false,140,v_su),
            (v_ev,'discount_basis_mode',  'discount_basis_mode',  'Basis Mode',    'enum',    'select',   'one','standard',true, true,  true,  false,150,v_su),
            (v_ev,'is_best_only',         'is_best_only',         'Best Only',     'boolean', 'hidden',   'one','standard',false,true,  false, false,160,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    RAISE NOTICE '035_version_fields/014_fields_payment_terms: done';
END $$;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/010_system/entity_engine/035_version_fields/015_fields_products.sql
-- 035_version_fields/015_fields_products.sql
-- Version-bound entity_field rows for Product/Procurement entities (97–102)
-- Entities: product, item, item_category, commodity_classification,
--           spend_category, company_code_spend_policy
-- Idempotent: ON CONFLICT DO NOTHING

DO $$
DECLARE
    v_su uuid := '00000000-0000-0000-0000-000000000000';
    v_ev uuid;
BEGIN

    -- ── product ───────────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'product' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'category_id',       'category_id',       'Category',         'uuid',    'reference','one','standard',false,true,  false, false,110,v_su),
            (v_ev,'spend_category_id', 'spend_category_id', 'Spend Category',   'uuid',    'reference','one','standard',false,true,  false, false,120,v_su),
            (v_ev,'product_type',      'product_type',      'Product Type',     'enum',    'select',   'one','standard',true, true,  true,  false,130,v_su),
            (v_ev,'unit_of_measure',   'unit_of_measure',   'UOM',              'string',  'text',     'one','standard',false,true,  false, false,140,v_su),
            (v_ev,'base_price',        'base_price',        'Base Price',       'money',   'money',    'one','standard',false,true,  true,  false,150,v_su),
            (v_ev,'currency_code',     'currency_code',     'Currency',         'string',  'text',     'one','standard',false,true,  false, false,160,v_su),
            (v_ev,'is_taxable',        'is_taxable',        'Taxable',          'boolean', 'hidden',   'one','standard',false,true,  false, false,170,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── item ──────────────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'item' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'company_code_id',    'company_code_id',    'Company Code',    'uuid',    'reference','one','standard',true, true,  false, false,110,v_su),
            (v_ev,'product_id',         'product_id',         'Product',         'uuid',    'reference','one','standard',false,true,  false, false,120,v_su),
            (v_ev,'category_id',        'category_id',        'Category',        'uuid',    'reference','one','standard',false,true,  false, false,130,v_su),
            (v_ev,'spend_category_id',  'spend_category_id',  'Spend Category',  'uuid',    'reference','one','standard',false,true,  false, false,140,v_su),
            (v_ev,'valuation_method',   'valuation_method',   'Valuation Method','enum',    'select',   'one','standard',true, true,  true,  false,150,v_su),
            (v_ev,'standard_cost',      'standard_cost',      'Standard Cost',   'money',   'money',    'one','standard',false,true,  true,  false,160,v_su),
            (v_ev,'uom_code',           'uom_code',           'UOM',             'string',  'text',     'one','standard',true, true,  false, false,170,v_su),
            (v_ev,'has_lot_tracking',   'has_lot_tracking',   'Lot Tracking',    'boolean', 'hidden',   'one','standard',false,true,  false, false,180,v_su),
            (v_ev,'has_serial_tracking','has_serial_tracking','Serial Tracking', 'boolean', 'hidden',   'one','standard',false,true,  false, false,190,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── item_category ─────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'item_category' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'parent_id',           'parent_id',           'Parent Category',   'uuid',    'reference','one','standard',false,true,  false, false,110,v_su),
            (v_ev,'level_no',            'level_no',            'Level',             'integer', 'number',   'one','system',  false,true,  true,  false,120,v_su),
            (v_ev,'default_tax_group_id','default_tax_group_id','Default Tax Group', 'uuid',    'reference','one','standard',false,true,  false, false,130,v_su),
            (v_ev,'sort_order',          'sort_order',          'Sort Order',        'integer', 'number',   'one','standard',false,false, true,  false,140,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── commodity_classification ──────────────────────────────────────────────
    -- RELATION class: only id, tenant_id, created_at, created_by in common fields
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'commodity_classification' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'owner_type',          'owner_type',          'Owner Type',        'string',  'text',  'one','standard',true, true,  true,  false,110,v_su),
            (v_ev,'owner_id',            'owner_id',            'Owner',             'uuid',    'reference','one','standard',true, true,false,false,120,v_su),
            (v_ev,'classification_type', 'classification_type', 'Classification',    'enum',    'select','one','standard',true, true,  true,  false,130,v_su),
            (v_ev,'domain_code',         'domain_code',         'Domain',            'string',  'text',  'one','standard',true, true,  true,  false,140,v_su),
            (v_ev,'mapping_type',        'mapping_type',        'Mapping Type',      'enum',    'select','one','standard',true, true,  true,  false,150,v_su),
            (v_ev,'is_primary',          'is_primary',          'Primary',           'boolean', 'hidden','one','standard',false,true,  false, false,160,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── spend_category ────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'spend_category' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'parent_id',                  'parent_id',                  'Parent',                  'uuid',    'reference','one','standard',false,true,  false, false,110,v_su),
            (v_ev,'procurement_type',           'procurement_type',           'Procurement Type',        'enum',    'select',   'one','standard',true, true,  true,  false,120,v_su),
            (v_ev,'visibility',                 'visibility',                 'Visibility',              'enum',    'select',   'one','standard',true, true,  true,  false,130,v_su),
            (v_ev,'is_classification_required', 'is_classification_required', 'Classification Required', 'boolean', 'hidden',   'one','standard',false,true,  false, false,140,v_su),
            (v_ev,'is_hs_required',             'is_hs_required',             'HS Code Required',        'boolean', 'hidden',   'one','standard',false,true,  false, false,150,v_su),
            (v_ev,'is_regulated',               'is_regulated',               'Regulated',               'boolean', 'hidden',   'one','standard',false,true,  false, false,160,v_su),
            (v_ev,'default_intent_id',          'default_intent_id',          'Default Intent',          'uuid',    'reference','one','standard',false,true,  false, false,170,v_su),
            (v_ev,'sort_order',                 'sort_order',                 'Sort Order',              'integer', 'number',   'one','standard',false,false, true,  false,180,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── company_code_spend_policy ─────────────────────────────────────────────
    -- CONTROL class: description seeded by 000_common_fields (no actual column — harmless)
    -- override_is_*/override_visibility omitted — prefix violates ef_bool_naming_chk
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'company_code_spend_policy' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'company_code_id',     'company_code_id',     'Company Code',    'uuid',    'reference','one','standard',true, true,  false, false,110,v_su),
            (v_ev,'spend_category_id',   'spend_category_id',   'Spend Category',  'uuid',    'reference','one','standard',true, true,  false, false,120,v_su),
            (v_ev,'mapping_mode',        'mapping_mode',        'Mode',            'enum',    'select',   'one','standard',true, true,  true,  false,130,v_su),
            (v_ev,'default_gl_account_id','default_gl_account_id','Default GL Acct','uuid',   'reference','one','standard',false,true,  false, false,140,v_su),
            (v_ev,'default_tax_group_id','default_tax_group_id','Default Tax Grp', 'uuid',    'reference','one','standard',false,true,  false, false,150,v_su),
            (v_ev,'default_intent_id',   'default_intent_id',   'Default Intent',  'uuid',    'reference','one','standard',false,true,  false, false,160,v_su),
            (v_ev,'is_default',          'is_default',          'Default',         'boolean', 'hidden',   'one','standard',false,true,  false, false,170,v_su),
            (v_ev,'priority',            'priority',            'Priority',        'integer', 'number',   'one','standard',false,false, true,  false,180,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    RAISE NOTICE '035_version_fields/015_fields_products: done';
END $$;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/010_system/entity_engine/035_version_fields/016_fields_ui.sql
-- 035_version_fields/016_fields_ui.sql
-- Version-bound entity_field rows for UI/CMS entities (103–111)
-- Entities: principal_ui_profile, principal_ui_preference, saved_view, dashboard,
--           dashboard_widget, principal_notification_preference, content_item,
--           content_item_link, content_item_access_grant
-- Idempotent: ON CONFLICT DO NOTHING

DO $$
DECLARE
    v_su uuid := '00000000-0000-0000-0000-000000000000';
    v_ev uuid;
BEGIN

    -- ── principal_ui_profile ──────────────────────────────────────────────────
    -- CONTROL class: 1:1 with principal; no status/is_active columns
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'principal_ui_profile' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'principal_id',           'principal_id',           'Principal',         'uuid',    'reference','one','standard',true, true,  false, false,110,v_su),
            (v_ev,'locale_code',            'locale_code',            'Locale',            'string',  'text',     'one','standard',false,true,  false, false,120,v_su),
            (v_ev,'language_code',          'language_code',          'Language',          'string',  'text',     'one','standard',false,true,  false, false,130,v_su),
            (v_ev,'timezone_code',          'timezone_code',          'Timezone',          'string',  'text',     'one','standard',false,true,  false, false,140,v_su),
            (v_ev,'appearance_mode',        'appearance_mode',        'Appearance',        'enum',    'select',   'one','standard',false,true,  false, false,150,v_su),
            (v_ev,'density_code',           'density_code',           'Density',           'enum',    'select',   'one','standard',false,true,  false, false,160,v_su),
            (v_ev,'home_workspace_code',    'home_workspace_code',    'Home Workspace',    'string',  'text',     'one','standard',false,true,  false, false,170,v_su),
            (v_ev,'default_company_code_id','default_company_code_id','Default Company',   'uuid',    'reference','one','standard',false,true,  false, false,180,v_su),
            (v_ev,'default_dashboard_id',   'default_dashboard_id',   'Default Dashboard', 'uuid',    'reference','one','standard',false,true,  false, false,190,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── principal_ui_preference ───────────────────────────────────────────────
    -- CONTROL class: key-value extension table
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'principal_ui_preference' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'principal_id',    'principal_id',    'Principal',       'uuid',   'reference','one','standard',true, true,  false, false,110,v_su),
            (v_ev,'preference_code', 'preference_code', 'Preference',      'string', 'text',     'one','standard',true, true,  true,  false,120,v_su),
            (v_ev,'surface_code',    'surface_code',    'Surface',         'string', 'text',     'one','standard',false,true,  true,  false,130,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── saved_view ────────────────────────────────────────────────────────────
    -- CONTROL class: code/name not bulk-inserted — add explicitly
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'saved_view' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'code',               'code',               'Code',           'string',  'text',     'one','standard',true, true,  true,  false,100,v_su),
            (v_ev,'name',               'name',               'Name',           'string',  'text',     'one','standard',true, false, true,  true, 105,v_su),
            (v_ev,'owner_principal_id', 'owner_principal_id', 'Owner',          'uuid',    'reference','one','standard',false,true,  false, false,110,v_su),
            (v_ev,'scope',              'scope',              'Scope',          'enum',    'select',   'one','standard',true, true,  true,  false,120,v_su),
            (v_ev,'surface_code',       'surface_code',       'Surface',        'string',  'text',     'one','standard',true, true,  true,  false,130,v_su),
            (v_ev,'entity_key',         'entity_key',         'Entity Key',     'string',  'text',     'one','standard',false,true,  false, false,140,v_su),
            (v_ev,'is_pinned',          'is_pinned',          'Pinned',         'boolean', 'hidden',   'one','standard',false,true,  false, false,150,v_su),
            (v_ev,'is_default',         'is_default',         'Default',        'boolean', 'hidden',   'one','standard',false,true,  false, false,160,v_su),
            (v_ev,'version',            'version',            'Version',        'integer', 'number',   'one','system',  false,false, true,  false,170,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── dashboard ─────────────────────────────────────────────────────────────
    -- MASTER class: code/name/description/status/is_active from 000_common_fields
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'dashboard' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'owner_principal_id','owner_principal_id','Owner',         'uuid',    'reference','one','standard',false,true,  false, false,110,v_su),
            (v_ev,'scope',            'scope',            'Scope',          'enum',    'select',   'one','standard',true, true,  true,  false,120,v_su),
            (v_ev,'surface_code',     'surface_code',     'Surface',        'string',  'text',     'one','standard',false,true,  true,  false,130,v_su),
            (v_ev,'is_default',       'is_default',       'Default',        'boolean', 'hidden',   'one','standard',false,true,  false, false,140,v_su),
            (v_ev,'is_home',          'is_home',          'Home Dashboard', 'boolean', 'hidden',   'one','standard',false,true,  false, false,150,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── dashboard_widget ──────────────────────────────────────────────────────
    -- RELATION class: id, tenant_id, created_at, created_by in common fields
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'dashboard_widget' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'dashboard_id',    'dashboard_id',    'Dashboard',      'uuid',    'reference','one','standard',true, true,  false, false,110,v_su),
            (v_ev,'widget_code',     'widget_code',     'Widget Code',    'string',  'text',     'one','standard',true, true,  true,  true, 120,v_su),
            (v_ev,'widget_type_code','widget_type_code','Widget Type',    'enum',    'select',   'one','standard',true, true,  true,  false,130,v_su),
            (v_ev,'title',           'title',           'Title',          'string',  'text',     'one','standard',false,false, false, true, 140,v_su),
            (v_ev,'x_pos',           'x_pos',           'X Position',     'integer', 'number',   'one','standard',true, false, true,  false,150,v_su),
            (v_ev,'y_pos',           'y_pos',           'Y Position',     'integer', 'number',   'one','standard',true, false, true,  false,160,v_su),
            (v_ev,'width_units',     'width_units',     'Width',          'integer', 'number',   'one','standard',true, false, true,  false,170,v_su),
            (v_ev,'height_units',    'height_units',    'Height',         'integer', 'number',   'one','standard',true, false, true,  false,180,v_su),
            (v_ev,'is_visible',      'is_visible',      'Visible',        'boolean', 'hidden',   'one','standard',false,true,  false, false,190,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── principal_notification_preference ─────────────────────────────────────
    -- CONTROL class
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'principal_notification_preference' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'principal_id',  'principal_id',  'Principal',     'uuid',    'reference','one','standard',true, true,  false, false,110,v_su),
            (v_ev,'event_code',    'event_code',    'Event',         'string',  'text',     'one','standard',true, true,  true,  false,120,v_su),
            (v_ev,'channel',       'channel',       'Channel',       'enum',    'select',   'one','standard',true, true,  true,  false,130,v_su),
            (v_ev,'is_enabled',    'is_enabled',    'Enabled',       'boolean', 'hidden',   'one','standard',false,true,  false, false,140,v_su),
            (v_ev,'frequency_code','frequency_code','Frequency',     'enum',    'select',   'one','standard',false,true,  true,  false,150,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── content_item ──────────────────────────────────────────────────────────
    -- MASTER class: uses 'title' (not 'name') and 'summary' (not 'description')
    -- NOTE: bulk pass inserts 'name'/'description'/'is_active' for MASTER —
    -- content_item uses 'title'/'summary' and has no is_active column (harmless metadata rows)
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'content_item' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'title',              'title',              'Title',          'string', 'text',     'one','standard',true, false, true,  true, 110,v_su),
            (v_ev,'kind',               'kind',               'Kind',           'enum',   'select',   'one','standard',true, true,  true,  false,120,v_su),
            (v_ev,'parent_id',          'parent_id',          'Parent',         'uuid',   'reference','one','standard',false,true,  false, false,130,v_su),
            (v_ev,'locale_code',        'locale_code',        'Locale',         'string', 'text',     'one','standard',true, true,  true,  false,140,v_su),
            (v_ev,'slug',               'slug',               'Slug',           'string', 'text',     'one','standard',true, false, true,  true, 150,v_su),
            (v_ev,'summary',            'summary',            'Summary',        'text',   'textarea', 'one','standard',false,false, false, true, 160,v_su),
            (v_ev,'current_version_id', 'current_version_id', 'Current Version','uuid',   'reference','one','system',  false,true,  false, false,170,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── content_item_link ─────────────────────────────────────────────────────
    -- RELATION class: only id, tenant_id, created_at, created_by in common fields
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'content_item_link' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'source_content_item_id','source_content_item_id','Source',        'uuid',    'reference','one','standard',true, true,  false, false,110,v_su),
            (v_ev,'target_content_item_id','target_content_item_id','Target',        'uuid',    'reference','one','standard',true, true,  false, false,120,v_su),
            (v_ev,'relation_type',         'relation_type',         'Relation Type', 'enum',    'select',   'one','standard',true, true,  true,  false,130,v_su),
            (v_ev,'display_order',         'display_order',         'Order',         'integer', 'number',   'one','standard',false,false, true,  false,140,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── content_item_access_grant ─────────────────────────────────────────────
    -- CONTROL class: no updated_at/updated_by columns in DDL (harmless if bulk inserts them)
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'content_item_access_grant' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'content_item_id','content_item_id','Content Item',   'uuid',      'reference','one','standard',true, true,  false, false,110,v_su),
            (v_ev,'subject_type',   'subject_type',   'Subject Type',   'enum',      'select',   'one','standard',true, true,  true,  false,120,v_su),
            (v_ev,'subject_id',     'subject_id',     'Subject',        'uuid',      'reference','one','standard',false,true,  false, false,130,v_su),
            (v_ev,'access_level',   'access_level',   'Access Level',   'enum',      'select',   'one','standard',true, true,  true,  false,140,v_su),
            (v_ev,'expires_at',     'expires_at',     'Expires At',     'timestamp', 'datetime', 'one','standard',false,true,  true,  false,150,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    RAISE NOTICE '035_version_fields/016_fields_ui: done';
END $$;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/010_system/entity_engine/040_field_group_members.sql
-- 040_field_group_members.sql
-- Links canonical entity_field rows (entity_version_id IS NULL) to field_group sections.
-- Only canonical fields (entity_version_id IS NULL) participate in field_group_member.
-- Idempotent: ON CONFLICT (group_key, entity_field_id) DO NOTHING
-- Run AFTER: 002_field_groups.sql + 030_canonical_fields/000_canonical_dictionary.sql

DO $$
DECLARE
    -- canonical field ids
    v_fid_id                 uuid;
    v_fid_tenant_id          uuid;
    v_fid_code               uuid;
    v_fid_name               uuid;
    v_fid_description        uuid;
    v_fid_status             uuid;
    v_fid_is_active          uuid;
    v_fid_status_changed_at  uuid;
    v_fid_status_changed_by  uuid;
    v_fid_metadata           uuid;
    v_fid_tags               uuid;
    v_fid_created_at         uuid;
    v_fid_created_by         uuid;
    v_fid_updated_at         uuid;
    v_fid_updated_by         uuid;
BEGIN
    -- Resolve canonical field ids (entity_version_id IS NULL guarantees canonical scope)
    SELECT id INTO v_fid_id                FROM control.entity_field WHERE name = 'id'                AND entity_version_id IS NULL;
    SELECT id INTO v_fid_tenant_id         FROM control.entity_field WHERE name = 'tenant_id'         AND entity_version_id IS NULL;
    SELECT id INTO v_fid_code              FROM control.entity_field WHERE name = 'code'              AND entity_version_id IS NULL;
    SELECT id INTO v_fid_name              FROM control.entity_field WHERE name = 'name'              AND entity_version_id IS NULL;
    SELECT id INTO v_fid_description       FROM control.entity_field WHERE name = 'description'       AND entity_version_id IS NULL;
    SELECT id INTO v_fid_status            FROM control.entity_field WHERE name = 'status'            AND entity_version_id IS NULL;
    SELECT id INTO v_fid_is_active         FROM control.entity_field WHERE name = 'is_active'         AND entity_version_id IS NULL;
    SELECT id INTO v_fid_status_changed_at FROM control.entity_field WHERE name = 'status_changed_at' AND entity_version_id IS NULL;
    SELECT id INTO v_fid_status_changed_by FROM control.entity_field WHERE name = 'status_changed_by' AND entity_version_id IS NULL;
    SELECT id INTO v_fid_metadata          FROM control.entity_field WHERE name = 'metadata'          AND entity_version_id IS NULL;
    SELECT id INTO v_fid_tags              FROM control.entity_field WHERE name = 'tags'              AND entity_version_id IS NULL;
    SELECT id INTO v_fid_created_at        FROM control.entity_field WHERE name = 'created_at'        AND entity_version_id IS NULL;
    SELECT id INTO v_fid_created_by        FROM control.entity_field WHERE name = 'created_by'        AND entity_version_id IS NULL;
    SELECT id INTO v_fid_updated_at        FROM control.entity_field WHERE name = 'updated_at'        AND entity_version_id IS NULL;
    SELECT id INTO v_fid_updated_by        FROM control.entity_field WHERE name = 'updated_by'        AND entity_version_id IS NULL;

    -- Guard: abort if canonical dictionary wasn't seeded yet
    IF v_fid_id IS NULL THEN
        RAISE EXCEPTION 'canonical_fields not found — run 030_canonical_fields/000_canonical_dictionary.sql first';
    END IF;

    -- ── §1  identity group ───────────────────────────────────────────────────
    -- id, tenant_id, code, name, description
    INSERT INTO control.field_group_member (group_key, entity_field_id, is_required, sort_order) VALUES
        ('identity', v_fid_id,          true,  10),
        ('identity', v_fid_tenant_id,   true,  20),
        ('identity', v_fid_code,        true,  30),
        ('identity', v_fid_name,        true,  40),
        ('identity', v_fid_description, false, 50)
    ON CONFLICT (group_key, entity_field_id) DO NOTHING;

    -- ── §9  metadata group ───────────────────────────────────────────────────
    -- status, is_active, status timestamps, metadata bag, tags
    INSERT INTO control.field_group_member (group_key, entity_field_id, is_required, sort_order) VALUES
        ('metadata', v_fid_status,             true,  10),
        ('metadata', v_fid_is_active,          true,  20),
        ('metadata', v_fid_status_changed_at,  false, 30),
        ('metadata', v_fid_status_changed_by,  false, 40),
        ('metadata', v_fid_metadata,           false, 50),
        ('metadata', v_fid_tags,               false, 60)
    ON CONFLICT (group_key, entity_field_id) DO NOTHING;

    -- ── §10 audit group ──────────────────────────────────────────────────────
    -- created_at, created_by, updated_at, updated_by
    INSERT INTO control.field_group_member (group_key, entity_field_id, is_required, sort_order) VALUES
        ('audit', v_fid_created_at, true,  10),
        ('audit', v_fid_created_by, true,  20),
        ('audit', v_fid_updated_at, false, 30),
        ('audit', v_fid_updated_by, false, 40)
    ON CONFLICT (group_key, entity_field_id) DO NOTHING;

    RAISE NOTICE 'control.field_group_member: canonical field→group bindings seeded (% total)',
        (SELECT count(*) FROM control.field_group_member);
END $$;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/010_system/entity_engine/050_entity_lifecycles.sql
-- 050_entity_lifecycles.sql
-- Binds lifecycle state machines to master.* entity names.
-- All bindings are system-global (tenant_id IS NULL).
-- Idempotent: ON CONFLICT NULLS NOT DISTINCT (tenant_id, entity_name, lifecycle_id) DO NOTHING
-- Run AFTER: 010_lifecycles/*.sql + 020_entities/*.sql

DO $$
DECLARE
    v_su uuid := '00000000-0000-0000-0000-000000000000';

    -- Lifecycle UUIDs (resolved by code)
    v_lc_active_inactive          uuid;
    v_lc_active_inactive_archived uuid;
    v_lc_org_master               uuid;
    v_lc_bp_master                uuid;
    v_lc_tenant                   uuid;
    v_lc_principal                uuid;
    v_lc_employee                 uuid;
    v_lc_gl_account               uuid;
    v_lc_fiscal_period            uuid;
    v_lc_attachment               uuid;
    v_lc_comment                  uuid;
    v_lc_conversation             uuid;
    v_lc_template                 uuid;
    v_lc_master_doc               uuid;
    v_lc_project                  uuid;
    v_lc_asset                    uuid;
    v_lc_budget_profile           uuid;
    v_lc_budget_allocation        uuid;
    v_lc_bank_account             uuid;
    v_lc_content                  uuid;
    v_lc_delegation               uuid;
BEGIN
    SELECT id INTO v_lc_active_inactive          FROM control.lifecycle WHERE code = 'lc_active_inactive'          AND tenant_id IS NULL;
    SELECT id INTO v_lc_active_inactive_archived FROM control.lifecycle WHERE code = 'lc_active_inactive_archived' AND tenant_id IS NULL;
    SELECT id INTO v_lc_org_master               FROM control.lifecycle WHERE code = 'lc_org_master'               AND tenant_id IS NULL;
    SELECT id INTO v_lc_bp_master                FROM control.lifecycle WHERE code = 'lc_bp_master'                AND tenant_id IS NULL;
    SELECT id INTO v_lc_tenant                   FROM control.lifecycle WHERE code = 'lc_tenant'                   AND tenant_id IS NULL;
    SELECT id INTO v_lc_principal                FROM control.lifecycle WHERE code = 'lc_principal'                AND tenant_id IS NULL;
    SELECT id INTO v_lc_employee                 FROM control.lifecycle WHERE code = 'lc_employee'                 AND tenant_id IS NULL;
    SELECT id INTO v_lc_gl_account               FROM control.lifecycle WHERE code = 'lc_gl_account'               AND tenant_id IS NULL;
    SELECT id INTO v_lc_fiscal_period            FROM control.lifecycle WHERE code = 'lc_fiscal_period'            AND tenant_id IS NULL;
    SELECT id INTO v_lc_attachment               FROM control.lifecycle WHERE code = 'lc_attachment'               AND tenant_id IS NULL;
    SELECT id INTO v_lc_comment                  FROM control.lifecycle WHERE code = 'lc_comment'                  AND tenant_id IS NULL;
    SELECT id INTO v_lc_conversation             FROM control.lifecycle WHERE code = 'lc_conversation'             AND tenant_id IS NULL;
    SELECT id INTO v_lc_template                 FROM control.lifecycle WHERE code = 'lc_template'                 AND tenant_id IS NULL;
    SELECT id INTO v_lc_master_doc               FROM control.lifecycle WHERE code = 'lc_master_doc'               AND tenant_id IS NULL;
    SELECT id INTO v_lc_project                  FROM control.lifecycle WHERE code = 'lc_project'                  AND tenant_id IS NULL;
    SELECT id INTO v_lc_asset                    FROM control.lifecycle WHERE code = 'lc_asset'                    AND tenant_id IS NULL;
    SELECT id INTO v_lc_budget_profile           FROM control.lifecycle WHERE code = 'lc_budget_profile'           AND tenant_id IS NULL;
    SELECT id INTO v_lc_budget_allocation        FROM control.lifecycle WHERE code = 'lc_budget_allocation'        AND tenant_id IS NULL;
    SELECT id INTO v_lc_bank_account             FROM control.lifecycle WHERE code = 'lc_bank_account'             AND tenant_id IS NULL;
    SELECT id INTO v_lc_content                  FROM control.lifecycle WHERE code = 'lc_content'                  AND tenant_id IS NULL;
    SELECT id INTO v_lc_delegation               FROM control.lifecycle WHERE code = 'lc_delegation'               AND tenant_id IS NULL;

    IF v_lc_active_inactive IS NULL THEN
        RAISE EXCEPTION 'lifecycle rows not found — run 010_lifecycles/*.sql first';
    END IF;

    -- ── IAM: Tenant ──────────────────────────────────────────────────────────
    INSERT INTO control.entity_lifecycle (tenant_id, entity_name, lifecycle_id, priority, created_by) VALUES
        (NULL, 'tenant', v_lc_tenant, 100, v_su)
    ON CONFLICT (tenant_id, entity_name, lifecycle_id) DO NOTHING;

    -- ── IAM: Principal identity ───────────────────────────────────────────────
    INSERT INTO control.entity_lifecycle (tenant_id, entity_name, lifecycle_id, priority, created_by) VALUES
        (NULL, 'principal',                   v_lc_principal, 100, v_su),
        (NULL, 'principal_profile',           v_lc_principal, 100, v_su),
        (NULL, 'principal_identity_binding',  v_lc_principal, 100, v_su)
    ON CONFLICT (tenant_id, entity_name, lifecycle_id) DO NOTHING;

    -- ── IAM: Groups, teams & grants ──────────────────────────────────────────
    INSERT INTO control.entity_lifecycle (tenant_id, entity_name, lifecycle_id, priority, created_by) VALUES
        (NULL, 'auth_group',               v_lc_active_inactive, 100, v_su),
        (NULL, 'principal_persona',        v_lc_active_inactive, 100, v_su),
        (NULL, 'team',                     v_lc_active_inactive, 100, v_su),
        (NULL, 'access_grant',             v_lc_delegation,      100, v_su),
        (NULL, 'delegation_grant',         v_lc_delegation,      100, v_su),
        (NULL, 'group_feature_grant',      v_lc_active_inactive, 100, v_su),
        (NULL, 'principal_feature_grant',  v_lc_active_inactive, 100, v_su)
    ON CONFLICT (tenant_id, entity_name, lifecycle_id) DO NOTHING;

    -- ── IAM: Reference/lookup masters ────────────────────────────────────────
    INSERT INTO control.entity_lifecycle (tenant_id, entity_name, lifecycle_id, priority, created_by) VALUES
        (NULL, 'label',      v_lc_active_inactive, 100, v_su),
        (NULL, 'owner_type', v_lc_active_inactive, 100, v_su),
        (NULL, 'address',    v_lc_active_inactive, 100, v_su)
    ON CONFLICT (tenant_id, entity_name, lifecycle_id) DO NOTHING;

    -- ── IAM: Tenant configuration ─────────────────────────────────────────────
    INSERT INTO control.entity_lifecycle (tenant_id, entity_name, lifecycle_id, priority, created_by) VALUES
        (NULL, 'tenant_module_subscription',   v_lc_active_inactive, 100, v_su),
        (NULL, 'tenant_feature_entitlement',   v_lc_active_inactive, 100, v_su)
    ON CONFLICT (tenant_id, entity_name, lifecycle_id) DO NOTHING;

    -- ── NTF: Notifications ───────────────────────────────────────────────────
    INSERT INTO control.entity_lifecycle (tenant_id, entity_name, lifecycle_id, priority, created_by) VALUES
        (NULL, 'notification',         v_lc_active_inactive_archived, 100, v_su),
        (NULL, 'notification_default', v_lc_active_inactive,          100, v_su)
    ON CONFLICT (tenant_id, entity_name, lifecycle_id) DO NOTHING;

    -- ── ACT/CMS: Collaborative objects ───────────────────────────────────────
    INSERT INTO control.entity_lifecycle (tenant_id, entity_name, lifecycle_id, priority, created_by) VALUES
        (NULL, 'attachment',   v_lc_attachment,   100, v_su),
        (NULL, 'comment',      v_lc_comment,      100, v_su),
        (NULL, 'conversation', v_lc_conversation, 100, v_su)
    ON CONFLICT (tenant_id, entity_name, lifecycle_id) DO NOTHING;

    -- ── DOC/WFL: Templates & definitions ─────────────────────────────────────
    INSERT INTO control.entity_lifecycle (tenant_id, entity_name, lifecycle_id, priority, created_by) VALUES
        (NULL, 'document_template',   v_lc_template,   100, v_su),
        (NULL, 'workflow_template',   v_lc_template,   100, v_su),
        (NULL, 'workflow_definition', v_lc_master_doc, 100, v_su)
    ON CONFLICT (tenant_id, entity_name, lifecycle_id) DO NOTHING;

    -- ── Finance: Org structure ────────────────────────────────────────────────
    INSERT INTO control.entity_lifecycle (tenant_id, entity_name, lifecycle_id, priority, created_by) VALUES
        (NULL, 'legal_entity',   v_lc_org_master,      100, v_su),
        (NULL, 'company_code',   v_lc_org_master,      100, v_su),
        (NULL, 'business_unit',  v_lc_org_master,      100, v_su),
        (NULL, 'cost_center',    v_lc_org_master,      100, v_su),
        (NULL, 'profit_center',  v_lc_org_master,      100, v_su),
        (NULL, 'warehouse',      v_lc_active_inactive, 100, v_su)
    ON CONFLICT (tenant_id, entity_name, lifecycle_id) DO NOTHING;

    -- ── Finance: Chart of Accounts / GL ──────────────────────────────────────
    INSERT INTO control.entity_lifecycle (tenant_id, entity_name, lifecycle_id, priority, created_by) VALUES
        (NULL, 'chart_of_account', v_lc_active_inactive, 100, v_su),
        (NULL, 'gl_account_type',  v_lc_active_inactive, 100, v_su),
        (NULL, 'gl_account',       v_lc_gl_account,      100, v_su)
    ON CONFLICT (tenant_id, entity_name, lifecycle_id) DO NOTHING;

    -- ── Finance: Project & Period ─────────────────────────────────────────────
    INSERT INTO control.entity_lifecycle (tenant_id, entity_name, lifecycle_id, priority, created_by) VALUES
        (NULL, 'project',       v_lc_project,      100, v_su),
        (NULL, 'fiscal_period', v_lc_fiscal_period, 100, v_su)
    ON CONFLICT (tenant_id, entity_name, lifecycle_id) DO NOTHING;

    -- ── Finance: Business Partners ────────────────────────────────────────────
    INSERT INTO control.entity_lifecycle (tenant_id, entity_name, lifecycle_id, priority, created_by) VALUES
        (NULL, 'customer', v_lc_bp_master, 100, v_su),
        (NULL, 'supplier', v_lc_bp_master, 100, v_su),
        (NULL, 'employee', v_lc_employee,  100, v_su)
    ON CONFLICT (tenant_id, entity_name, lifecycle_id) DO NOTHING;

    -- ── Finance: Assets ───────────────────────────────────────────────────────
    INSERT INTO control.entity_lifecycle (tenant_id, entity_name, lifecycle_id, priority, created_by) VALUES
        (NULL, 'asset_class', v_lc_active_inactive, 100, v_su),
        (NULL, 'asset',       v_lc_asset,           100, v_su)
    ON CONFLICT (tenant_id, entity_name, lifecycle_id) DO NOTHING;

    -- ── Finance: Dimensions ───────────────────────────────────────────────────
    INSERT INTO control.entity_lifecycle (tenant_id, entity_name, lifecycle_id, priority, created_by) VALUES
        (NULL, 'dimension_type',  v_lc_active_inactive, 100, v_su),
        (NULL, 'dimension_value', v_lc_active_inactive, 100, v_su),
        (NULL, 'dimension_set',   v_lc_active_inactive, 100, v_su)
    ON CONFLICT (tenant_id, entity_name, lifecycle_id) DO NOTHING;

    -- ── Finance: Tax & FX ────────────────────────────────────────────────────
    INSERT INTO control.entity_lifecycle (tenant_id, entity_name, lifecycle_id, priority, created_by) VALUES
        (NULL, 'tax_jurisdiction', v_lc_active_inactive, 100, v_su),
        (NULL, 'tax_type',         v_lc_active_inactive, 100, v_su)
    ON CONFLICT (tenant_id, entity_name, lifecycle_id) DO NOTHING;

    -- ── Finance: Budget ───────────────────────────────────────────────────────
    INSERT INTO control.entity_lifecycle (tenant_id, entity_name, lifecycle_id, priority, created_by) VALUES
        (NULL, 'budget_profile',    v_lc_budget_profile,    100, v_su),
        (NULL, 'budget_allocation', v_lc_budget_allocation, 100, v_su),
        (NULL, 'planning_model',    v_lc_active_inactive,   100, v_su)
    ON CONFLICT (tenant_id, entity_name, lifecycle_id) DO NOTHING;

    -- ── Finance: Banking & Payments ───────────────────────────────────────────
    INSERT INTO control.entity_lifecycle (tenant_id, entity_name, lifecycle_id, priority, created_by) VALUES
        (NULL, 'bank_party',      v_lc_active_inactive, 100, v_su),
        (NULL, 'bank_account',    v_lc_bank_account,    100, v_su),
        (NULL, 'bank_branch',     v_lc_active_inactive, 100, v_su),
        (NULL, 'payment_method',  v_lc_active_inactive, 100, v_su),
        (NULL, 'payment_term',    v_lc_active_inactive, 100, v_su),
        (NULL, 'holiday_calendar', v_lc_active_inactive, 100, v_su)
    ON CONFLICT (tenant_id, entity_name, lifecycle_id) DO NOTHING;

    -- ── REL: Products & Items ─────────────────────────────────────────────────
    INSERT INTO control.entity_lifecycle (tenant_id, entity_name, lifecycle_id, priority, created_by) VALUES
        (NULL, 'product',       v_lc_active_inactive_archived, 100, v_su),
        (NULL, 'item',          v_lc_active_inactive_archived, 100, v_su),
        (NULL, 'item_category', v_lc_active_inactive,          100, v_su),
        (NULL, 'spend_category', v_lc_active_inactive,         100, v_su)
    ON CONFLICT (tenant_id, entity_name, lifecycle_id) DO NOTHING;

    -- ── UI / CMS ─────────────────────────────────────────────────────────────
    INSERT INTO control.entity_lifecycle (tenant_id, entity_name, lifecycle_id, priority, created_by) VALUES
        (NULL, 'saved_view',               v_lc_active_inactive, 100, v_su),
        (NULL, 'dashboard',                v_lc_active_inactive, 100, v_su),
        (NULL, 'content_item',             v_lc_content,         100, v_su),
        (NULL, 'content_item_access_grant', v_lc_active_inactive, 100, v_su)
    ON CONFLICT (tenant_id, entity_name, lifecycle_id) DO NOTHING;

    RAISE NOTICE 'control.entity_lifecycle: % system-global bindings seeded',
        (SELECT count(*) FROM control.entity_lifecycle WHERE tenant_id IS NULL);
END $$;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/010_system/entity_engine/060_entity_operations/001_ops_iam.sql
-- 060_entity_operations/001_ops_iam.sql
-- Entity operation registrations for IAM entities (1–26)
-- Covers: tenant, principal, auth_group, team, label, owner_type, address,
--         access_grant, delegation_grant, principal_persona
-- Idempotent: ON CONFLICT (tenant_id, entity_name, permission_code) DO NOTHING
-- Run AFTER: 010_system/entity_engine/020_entities/001_master_identity.sql

DO $$
DECLARE v_su uuid := '00000000-0000-0000-0000-000000000000';
BEGIN

-- ══════════════════════════════════════════════════════════════════════════════
-- tenant  (Set C: create/update/delete/export/import/activate/deactivate/copy)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
VALUES
    (NULL,'tenant','create',  'LIST',  'PRIMARY', 'NAVIGATE','/app/tenant/new',       false,10,v_su),
    (NULL,'tenant','update',  'DETAIL','PRIMARY', 'NAVIGATE','/app/tenant/{id}/edit', true, 20,v_su),
    (NULL,'tenant','cancel',  'DETAIL','OVERFLOW','MODAL',   'deactivate',             true, 30,v_su),
    (NULL,'tenant','close',   'DETAIL','OVERFLOW','MODAL',   'close',                  true, 40,v_su),
    (NULL,'tenant','export',  'LIST',  'TOOLBAR', 'API',     'export',                 false,50,v_su)
ON CONFLICT (tenant_id, entity_name, permission_code) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- principal  (Set D: + import, bulk ops, share)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
VALUES
    (NULL,'principal','create',      'LIST',  'PRIMARY', 'NAVIGATE','/app/principal/new',       false,10,v_su),
    (NULL,'principal','update',      'DETAIL','PRIMARY', 'NAVIGATE','/app/principal/{id}/edit', true, 20,v_su),
    (NULL,'principal','cancel',      'DETAIL','OVERFLOW','MODAL',   'deactivate',               true, 30,v_su),
    (NULL,'principal','reopen',      'DETAIL','OVERFLOW','MODAL',   'reactivate',               true, 40,v_su),
    (NULL,'principal','close',       'DETAIL','OVERFLOW','MODAL',   'close',                    true, 50,v_su),
    (NULL,'principal','delete',      'DETAIL','OVERFLOW','MODAL',   'delete',                   true, 60,v_su),
    (NULL,'principal','export',      'LIST',  'TOOLBAR', 'API',     'export',                   false,70,v_su),
    (NULL,'principal','import',      'LIST',  'TOOLBAR', 'API',     'import',                   false,80,v_su),
    (NULL,'principal','bulk_update', 'LIST',  'TOOLBAR', 'API',     'bulk_update',              false,90,v_su),
    (NULL,'principal','delegate',    'DETAIL','OVERFLOW','MODAL',   'delegate',                 true,100,v_su)
ON CONFLICT (tenant_id, entity_name, permission_code) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- auth_group  (Set C: create/update/delete/export/import/activate/deactivate)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
VALUES
    (NULL,'auth_group','create',  'LIST',  'PRIMARY', 'NAVIGATE','/app/auth_group/new',       false,10,v_su),
    (NULL,'auth_group','update',  'DETAIL','PRIMARY', 'NAVIGATE','/app/auth_group/{id}/edit', true, 20,v_su),
    (NULL,'auth_group','cancel',  'DETAIL','OVERFLOW','MODAL',   'deactivate',                true, 30,v_su),
    (NULL,'auth_group','reopen',  'DETAIL','OVERFLOW','MODAL',   'reactivate',                true, 40,v_su),
    (NULL,'auth_group','delete',  'DETAIL','OVERFLOW','MODAL',   'delete',                    true, 50,v_su),
    (NULL,'auth_group','export',  'LIST',  'TOOLBAR', 'API',     'export',                    false,60,v_su)
ON CONFLICT (tenant_id, entity_name, permission_code) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- team  (Set C)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
VALUES
    (NULL,'team','create',  'LIST',  'PRIMARY', 'NAVIGATE','/app/team/new',       false,10,v_su),
    (NULL,'team','update',  'DETAIL','PRIMARY', 'NAVIGATE','/app/team/{id}/edit', true, 20,v_su),
    (NULL,'team','cancel',  'DETAIL','OVERFLOW','MODAL',   'deactivate',          true, 30,v_su),
    (NULL,'team','delete',  'DETAIL','OVERFLOW','MODAL',   'delete',              true, 40,v_su),
    (NULL,'team','export',  'LIST',  'TOOLBAR', 'API',     'export',              false,50,v_su)
ON CONFLICT (tenant_id, entity_name, permission_code) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- principal_persona  (Set A: create/update/delete/export)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
VALUES
    (NULL,'principal_persona','create','LIST',  'PRIMARY', 'NAVIGATE','/app/principal_persona/new',       false,10,v_su),
    (NULL,'principal_persona','update','DETAIL','PRIMARY', 'NAVIGATE','/app/principal_persona/{id}/edit', true, 20,v_su),
    (NULL,'principal_persona','delete','DETAIL','OVERFLOW','MODAL',   'delete',                           true, 30,v_su),
    (NULL,'principal_persona','export','LIST',  'TOOLBAR', 'API',     'export',                           false,40,v_su)
ON CONFLICT (tenant_id, entity_name, permission_code) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- access_grant  (Set A + delegate)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
VALUES
    (NULL,'access_grant','create',  'LIST',  'PRIMARY', 'NAVIGATE','/app/access_grant/new',       false,10,v_su),
    (NULL,'access_grant','update',  'DETAIL','PRIMARY', 'NAVIGATE','/app/access_grant/{id}/edit', true, 20,v_su),
    (NULL,'access_grant','cancel',  'DETAIL','OVERFLOW','MODAL',   'revoke',                      true, 30,v_su),
    (NULL,'access_grant','delete',  'DETAIL','OVERFLOW','MODAL',   'delete',                      true, 40,v_su),
    (NULL,'access_grant','export',  'LIST',  'TOOLBAR', 'API',     'export',                      false,50,v_su)
ON CONFLICT (tenant_id, entity_name, permission_code) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- delegation_grant  (Set A + revoke)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
VALUES
    (NULL,'delegation_grant','create',  'LIST',  'PRIMARY', 'NAVIGATE','/app/delegation_grant/new',       false,10,v_su),
    (NULL,'delegation_grant','cancel',  'DETAIL','PRIMARY', 'MODAL',   'revoke',                          true, 20,v_su),
    (NULL,'delegation_grant','delete',  'DETAIL','OVERFLOW','MODAL',   'delete',                          true, 30,v_su),
    (NULL,'delegation_grant','export',  'LIST',  'TOOLBAR', 'API',     'export',                          false,40,v_su)
ON CONFLICT (tenant_id, entity_name, permission_code) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- label  (Set B: create/update/delete/export/activate/deactivate)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
VALUES
    (NULL,'label','create', 'LIST',  'PRIMARY', 'NAVIGATE','/app/label/new',       false,10,v_su),
    (NULL,'label','update', 'DETAIL','PRIMARY', 'NAVIGATE','/app/label/{id}/edit', true, 20,v_su),
    (NULL,'label','cancel', 'DETAIL','OVERFLOW','MODAL',   'deactivate',           true, 30,v_su),
    (NULL,'label','reopen', 'DETAIL','OVERFLOW','MODAL',   'reactivate',           true, 40,v_su),
    (NULL,'label','delete', 'DETAIL','OVERFLOW','MODAL',   'delete',               true, 50,v_su),
    (NULL,'label','export', 'LIST',  'TOOLBAR', 'API',     'export',               false,60,v_su)
ON CONFLICT (tenant_id, entity_name, permission_code) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- owner_type  (Set A)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
VALUES
    (NULL,'owner_type','create','LIST',  'PRIMARY', 'NAVIGATE','/app/owner_type/new',       false,10,v_su),
    (NULL,'owner_type','update','DETAIL','PRIMARY', 'NAVIGATE','/app/owner_type/{id}/edit', true, 20,v_su),
    (NULL,'owner_type','delete','DETAIL','OVERFLOW','MODAL',   'delete',                    true, 30,v_su),
    (NULL,'owner_type','export','LIST',  'TOOLBAR', 'API',     'export',                    false,40,v_su)
ON CONFLICT (tenant_id, entity_name, permission_code) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- address  (Set A + import)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
VALUES
    (NULL,'address','create', 'LIST',  'PRIMARY', 'NAVIGATE','/app/address/new',       false,10,v_su),
    (NULL,'address','update', 'DETAIL','PRIMARY', 'NAVIGATE','/app/address/{id}/edit', true, 20,v_su),
    (NULL,'address','cancel', 'DETAIL','OVERFLOW','MODAL',   'deactivate',             true, 30,v_su),
    (NULL,'address','delete', 'DETAIL','OVERFLOW','MODAL',   'delete',                 true, 40,v_su),
    (NULL,'address','export', 'LIST',  'TOOLBAR', 'API',     'export',                 false,50,v_su),
    (NULL,'address','import', 'LIST',  'TOOLBAR', 'API',     'import',                 false,60,v_su)
ON CONFLICT (tenant_id, entity_name, permission_code) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- CONTROL entities (Set G: update only — managed via parent entity UI)
-- principal_profile, principal_identity_binding, contact_link, contact_email,
-- contact_phone, address_link, tenant_module_subscription,
-- tenant_feature_entitlement, tenant_permission_override, company_code_access,
-- auth_group_role, auth_group_member, team_member,
-- group_feature_grant, principal_feature_grant
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
VALUES
    (NULL,'principal_profile',          'update','DETAIL','PRIMARY','MODAL','edit',false,10,v_su),
    (NULL,'principal_profile',          'delete','DETAIL','OVERFLOW','MODAL','delete',true,20,v_su),
    (NULL,'principal_identity_binding', 'update','DETAIL','PRIMARY','MODAL','edit',true,10,v_su),
    (NULL,'principal_identity_binding', 'delete','DETAIL','OVERFLOW','MODAL','delete',true,20,v_su),
    (NULL,'contact_email',              'create','LIST',  'PRIMARY','MODAL','create',false,10,v_su),
    (NULL,'contact_email',              'delete','DETAIL','OVERFLOW','MODAL','delete',true,20,v_su),
    (NULL,'contact_phone',              'create','LIST',  'PRIMARY','MODAL','create',false,10,v_su),
    (NULL,'contact_phone',              'delete','DETAIL','OVERFLOW','MODAL','delete',true,20,v_su),
    (NULL,'auth_group_member',          'create','LIST',  'PRIMARY','MODAL','add_member',false,10,v_su),
    (NULL,'auth_group_member',          'delete','DETAIL','OVERFLOW','MODAL','remove_member',true,20,v_su),
    (NULL,'team_member',                'create','LIST',  'PRIMARY','MODAL','add_member',false,10,v_su),
    (NULL,'team_member',                'delete','DETAIL','OVERFLOW','MODAL','remove_member',true,20,v_su),
    (NULL,'tenant_module_subscription', 'update','DETAIL','PRIMARY','MODAL','edit',true,10,v_su),
    (NULL,'tenant_feature_entitlement', 'update','DETAIL','PRIMARY','MODAL','edit',true,10,v_su),
    (NULL,'tenant_feature_entitlement', 'delete','DETAIL','OVERFLOW','MODAL','delete',true,20,v_su)
ON CONFLICT (tenant_id, entity_name, permission_code) DO NOTHING;

RAISE NOTICE 'entity_operation: IAM entities seeded (% total so far)',
    (SELECT count(*) FROM control.entity_operation WHERE tenant_id IS NULL);
END $$;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/010_system/entity_engine/060_entity_operations/002_ops_finance_org.sql
-- 060_entity_operations/002_ops_finance_org.sql
-- Entity operation registrations for Finance Org entities (49–64)
-- Covers: legal_entity, company_code, business_unit, cost_center, profit_center,
--         warehouse, chart_of_account, gl_account, project, project_item,
--         dimension_set, fiscal_period
-- Idempotent: ON CONFLICT (tenant_id, entity_name, permission_code) DO NOTHING

DO $$
DECLARE v_su uuid := '00000000-0000-0000-0000-000000000000';
BEGIN

-- ══════════════════════════════════════════════════════════════════════════════
-- legal_entity  (Set C: full CRUD + import + activate/deactivate/close)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
VALUES
    (NULL,'legal_entity','create',  'LIST',  'PRIMARY', 'NAVIGATE','/app/legal_entity/new',       false,10,v_su),
    (NULL,'legal_entity','update',  'DETAIL','PRIMARY', 'NAVIGATE','/app/legal_entity/{id}/edit', true, 20,v_su),
    (NULL,'legal_entity','cancel',  'DETAIL','OVERFLOW','MODAL',   'deactivate',                  true, 30,v_su),
    (NULL,'legal_entity','reopen',  'DETAIL','OVERFLOW','MODAL',   'reactivate',                  true, 40,v_su),
    (NULL,'legal_entity','close',   'DETAIL','OVERFLOW','MODAL',   'close',                       true, 50,v_su),
    (NULL,'legal_entity','delete',  'DETAIL','OVERFLOW','MODAL',   'delete',                      true, 60,v_su),
    (NULL,'legal_entity','export',  'LIST',  'TOOLBAR', 'API',     'export',                      false,70,v_su),
    (NULL,'legal_entity','import',  'LIST',  'TOOLBAR', 'API',     'import',                      false,80,v_su)
ON CONFLICT (tenant_id, entity_name, permission_code) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- company_code  (Set C)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
VALUES
    (NULL,'company_code','create', 'LIST',  'PRIMARY', 'NAVIGATE','/app/company_code/new',       false,10,v_su),
    (NULL,'company_code','update', 'DETAIL','PRIMARY', 'NAVIGATE','/app/company_code/{id}/edit', true, 20,v_su),
    (NULL,'company_code','cancel', 'DETAIL','OVERFLOW','MODAL',   'deactivate',                  true, 30,v_su),
    (NULL,'company_code','reopen', 'DETAIL','OVERFLOW','MODAL',   'reactivate',                  true, 40,v_su),
    (NULL,'company_code','close',  'DETAIL','OVERFLOW','MODAL',   'close',                       true, 50,v_su),
    (NULL,'company_code','delete', 'DETAIL','OVERFLOW','MODAL',   'delete',                      true, 60,v_su),
    (NULL,'company_code','export', 'LIST',  'TOOLBAR', 'API',     'export',                      false,70,v_su)
ON CONFLICT (tenant_id, entity_name, permission_code) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- business_unit / cost_center / profit_center  (Set B)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
VALUES
    (NULL,'business_unit','create', 'LIST',  'PRIMARY', 'NAVIGATE','/app/business_unit/new',       false,10,v_su),
    (NULL,'business_unit','update', 'DETAIL','PRIMARY', 'NAVIGATE','/app/business_unit/{id}/edit', true, 20,v_su),
    (NULL,'business_unit','cancel', 'DETAIL','OVERFLOW','MODAL',   'deactivate',                   true, 30,v_su),
    (NULL,'business_unit','reopen', 'DETAIL','OVERFLOW','MODAL',   'reactivate',                   true, 40,v_su),
    (NULL,'business_unit','delete', 'DETAIL','OVERFLOW','MODAL',   'delete',                       true, 50,v_su),
    (NULL,'business_unit','export', 'LIST',  'TOOLBAR', 'API',     'export',                       false,60,v_su),

    (NULL,'cost_center','create', 'LIST',  'PRIMARY', 'NAVIGATE','/app/cost_center/new',       false,10,v_su),
    (NULL,'cost_center','update', 'DETAIL','PRIMARY', 'NAVIGATE','/app/cost_center/{id}/edit', true, 20,v_su),
    (NULL,'cost_center','cancel', 'DETAIL','OVERFLOW','MODAL',   'deactivate',                 true, 30,v_su),
    (NULL,'cost_center','reopen', 'DETAIL','OVERFLOW','MODAL',   'reactivate',                 true, 40,v_su),
    (NULL,'cost_center','delete', 'DETAIL','OVERFLOW','MODAL',   'delete',                     true, 50,v_su),
    (NULL,'cost_center','export', 'LIST',  'TOOLBAR', 'API',     'export',                     false,60,v_su),

    (NULL,'profit_center','create', 'LIST',  'PRIMARY', 'NAVIGATE','/app/profit_center/new',       false,10,v_su),
    (NULL,'profit_center','update', 'DETAIL','PRIMARY', 'NAVIGATE','/app/profit_center/{id}/edit', true, 20,v_su),
    (NULL,'profit_center','cancel', 'DETAIL','OVERFLOW','MODAL',   'deactivate',                   true, 30,v_su),
    (NULL,'profit_center','reopen', 'DETAIL','OVERFLOW','MODAL',   'reactivate',                   true, 40,v_su),
    (NULL,'profit_center','delete', 'DETAIL','OVERFLOW','MODAL',   'delete',                       true, 50,v_su),
    (NULL,'profit_center','export', 'LIST',  'TOOLBAR', 'API',     'export',                       false,60,v_su)
ON CONFLICT (tenant_id, entity_name, permission_code) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- warehouse  (Set B)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
VALUES
    (NULL,'warehouse','create', 'LIST',  'PRIMARY', 'NAVIGATE','/app/warehouse/new',       false,10,v_su),
    (NULL,'warehouse','update', 'DETAIL','PRIMARY', 'NAVIGATE','/app/warehouse/{id}/edit', true, 20,v_su),
    (NULL,'warehouse','cancel', 'DETAIL','OVERFLOW','MODAL',   'deactivate',               true, 30,v_su),
    (NULL,'warehouse','reopen', 'DETAIL','OVERFLOW','MODAL',   'reactivate',               true, 40,v_su),
    (NULL,'warehouse','delete', 'DETAIL','OVERFLOW','MODAL',   'delete',                   true, 50,v_su),
    (NULL,'warehouse','export', 'LIST',  'TOOLBAR', 'API',     'export',                   false,60,v_su)
ON CONFLICT (tenant_id, entity_name, permission_code) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- chart_of_account  (Set C: + import, copy)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
VALUES
    (NULL,'chart_of_account','create', 'LIST',  'PRIMARY', 'NAVIGATE','/app/chart_of_account/new',       false,10,v_su),
    (NULL,'chart_of_account','update', 'DETAIL','PRIMARY', 'NAVIGATE','/app/chart_of_account/{id}/edit', true, 20,v_su),
    (NULL,'chart_of_account','cancel', 'DETAIL','OVERFLOW','MODAL',   'deactivate',                      true, 30,v_su),
    (NULL,'chart_of_account','reopen', 'DETAIL','OVERFLOW','MODAL',   'reactivate',                      true, 40,v_su),
    (NULL,'chart_of_account','copy',   'DETAIL','OVERFLOW','API',     'copy',                            true, 50,v_su),
    (NULL,'chart_of_account','delete', 'DETAIL','OVERFLOW','MODAL',   'delete',                          true, 60,v_su),
    (NULL,'chart_of_account','export', 'LIST',  'TOOLBAR', 'API',     'export',                          false,70,v_su),
    (NULL,'chart_of_account','import', 'LIST',  'TOOLBAR', 'API',     'import',                          false,80,v_su)
ON CONFLICT (tenant_id, entity_name, permission_code) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- gl_account  (Set C + block/unblock via cancel/reopen)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
VALUES
    (NULL,'gl_account','create',  'LIST',  'PRIMARY', 'NAVIGATE','/app/gl_account/new',       false,10,v_su),
    (NULL,'gl_account','update',  'DETAIL','PRIMARY', 'NAVIGATE','/app/gl_account/{id}/edit', true, 20,v_su),
    (NULL,'gl_account','cancel',  'DETAIL','TOOLBAR', 'MODAL',   'block',                     true, 30,v_su),
    (NULL,'gl_account','reopen',  'DETAIL','TOOLBAR', 'MODAL',   'unblock',                   true, 40,v_su),
    (NULL,'gl_account','close',   'DETAIL','OVERFLOW','MODAL',   'close',                     true, 50,v_su),
    (NULL,'gl_account','delete',  'DETAIL','OVERFLOW','MODAL',   'delete',                    true, 60,v_su),
    (NULL,'gl_account','export',  'LIST',  'TOOLBAR', 'API',     'export',                    false,70,v_su),
    (NULL,'gl_account','import',  'LIST',  'TOOLBAR', 'API',     'import',                    false,80,v_su),
    (NULL,'gl_account','bulk_update','LIST','TOOLBAR','API',     'bulk_update',               false,90,v_su)
ON CONFLICT (tenant_id, entity_name, permission_code) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- project  (Set F: + submit/approve/close/reopen)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
VALUES
    (NULL,'project','create',  'LIST',  'PRIMARY', 'NAVIGATE','/app/project/new',       false,10,v_su),
    (NULL,'project','update',  'DETAIL','PRIMARY', 'NAVIGATE','/app/project/{id}/edit', true, 20,v_su),
    (NULL,'project','submit',  'DETAIL','PRIMARY', 'MODAL',   'submit',                 true, 30,v_su),
    (NULL,'project','approve', 'DETAIL','TOOLBAR', 'MODAL',   'approve',                true, 40,v_su),
    (NULL,'project','deny',    'DETAIL','TOOLBAR', 'MODAL',   'deny',                   true, 50,v_su),
    (NULL,'project','close',   'DETAIL','OVERFLOW','MODAL',   'close',                  true, 60,v_su),
    (NULL,'project','reopen',  'DETAIL','OVERFLOW','MODAL',   'reopen',                 true, 70,v_su),
    (NULL,'project','cancel',  'DETAIL','OVERFLOW','MODAL',   'cancel',                 true, 80,v_su),
    (NULL,'project','delete',  'DETAIL','OVERFLOW','MODAL',   'delete',                 true, 90,v_su),
    (NULL,'project','export',  'LIST',  'TOOLBAR', 'API',     'export',                 false,100,v_su)
ON CONFLICT (tenant_id, entity_name, permission_code) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- fiscal_period  (lifecycle: close/reopen + submit/approve)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
VALUES
    (NULL,'fiscal_period','create',  'LIST',  'PRIMARY', 'NAVIGATE','/app/fiscal_period/new',       false,10,v_su),
    (NULL,'fiscal_period','update',  'DETAIL','PRIMARY', 'NAVIGATE','/app/fiscal_period/{id}/edit', true, 20,v_su),
    (NULL,'fiscal_period','submit',  'DETAIL','PRIMARY', 'MODAL',   'submit_for_close',              true, 30,v_su),
    (NULL,'fiscal_period','approve', 'DETAIL','TOOLBAR', 'MODAL',   'approve_close',                 true, 40,v_su),
    (NULL,'fiscal_period','close',   'DETAIL','TOOLBAR', 'MODAL',   'close',                         true, 50,v_su),
    (NULL,'fiscal_period','reopen',  'DETAIL','OVERFLOW','MODAL',   'reopen',                        true, 60,v_su),
    (NULL,'fiscal_period','export',  'LIST',  'TOOLBAR', 'API',     'export',                        false,70,v_su)
ON CONFLICT (tenant_id, entity_name, permission_code) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- CONTROL entities under Finance Org (Set G)
-- gl_account_type, gl_account_hierarchy, company_code_gl_config,
-- company_code_book_assignment, dimension_set, project_item
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
VALUES
    (NULL,'gl_account_type',           'create','LIST',  'PRIMARY', 'NAVIGATE','/app/gl_account_type/new',       false,10,v_su),
    (NULL,'gl_account_type',           'update','DETAIL','PRIMARY', 'NAVIGATE','/app/gl_account_type/{id}/edit', true, 20,v_su),
    (NULL,'gl_account_type',           'delete','DETAIL','OVERFLOW','MODAL',   'delete',                         true, 30,v_su),
    (NULL,'gl_account_type',           'export','LIST',  'TOOLBAR', 'API',     'export',                         false,40,v_su),
    (NULL,'company_code_gl_config',    'update','DETAIL','PRIMARY', 'MODAL',   'edit',                           true, 10,v_su),
    (NULL,'company_code_book_assignment','update','DETAIL','PRIMARY','MODAL',  'edit',                           true, 10,v_su),
    (NULL,'company_code_book_assignment','delete','DETAIL','OVERFLOW','MODAL', 'delete',                         true, 20,v_su),
    (NULL,'project_item',              'create','LIST',  'PRIMARY', 'MODAL',   'create',                         false,10,v_su),
    (NULL,'project_item',              'update','DETAIL','PRIMARY', 'MODAL',   'edit',                           true, 20,v_su),
    (NULL,'project_item',              'delete','DETAIL','OVERFLOW','MODAL',   'delete',                         true, 30,v_su)
ON CONFLICT (tenant_id, entity_name, permission_code) DO NOTHING;

RAISE NOTICE 'entity_operation: Finance org entities seeded (% total so far)',
    (SELECT count(*) FROM control.entity_operation WHERE tenant_id IS NULL);
END $$;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/010_system/entity_engine/060_entity_operations/003_ops_coa_partners.sql
-- 060_entity_operations/003_ops_coa_partners.sql
-- Entity operation registrations for Business Partners + Assets (65–74)
-- Covers: customer, supplier, employee, company_code_customer_profile,
--         company_code_supplier_profile, asset_class, asset, asset_book,
--         asset_component, asset_assignment_history
-- Idempotent: ON CONFLICT (tenant_id, entity_name, permission_code) DO NOTHING

DO $$
DECLARE v_su uuid := '00000000-0000-0000-0000-000000000000';
BEGIN

-- ══════════════════════════════════════════════════════════════════════════════
-- customer  (Set D: + close/reopen for credit hold / suspend)
-- NOTE: existing 001_fin_operations.sql seeds customer with cancel+close.
--       This file adds the reopen + import + bulk_update ops.
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
VALUES
    (NULL,'customer','reopen',      'DETAIL','OVERFLOW','MODAL','reactivate',  true, 45,v_su),
    (NULL,'customer','import',      'LIST',  'TOOLBAR', 'API',  'import',      false,55,v_su),
    (NULL,'customer','bulk_update', 'LIST',  'TOOLBAR', 'API',  'bulk_update', false,65,v_su),
    (NULL,'customer','copy',        'DETAIL','OVERFLOW','API',  'copy',        true, 35,v_su)
ON CONFLICT (tenant_id, entity_name, permission_code) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- supplier  (same additions — 001_fin_operations uses 'vendor'; this covers supplier)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
VALUES
    (NULL,'supplier','create',     'LIST',  'PRIMARY', 'NAVIGATE','/app/supplier/new',       false,10,v_su),
    (NULL,'supplier','update',     'DETAIL','PRIMARY', 'NAVIGATE','/app/supplier/{id}/edit', true, 20,v_su),
    (NULL,'supplier','cancel',     'DETAIL','OVERFLOW','MODAL',   'deactivate',              true, 30,v_su),
    (NULL,'supplier','reopen',     'DETAIL','OVERFLOW','MODAL',   'reactivate',              true, 40,v_su),
    (NULL,'supplier','close',      'DETAIL','OVERFLOW','MODAL',   'close',                   true, 50,v_su),
    (NULL,'supplier','copy',       'DETAIL','OVERFLOW','API',     'copy',                    true, 60,v_su),
    (NULL,'supplier','delete',     'DETAIL','OVERFLOW','MODAL',   'delete',                  true, 70,v_su),
    (NULL,'supplier','export',     'LIST',  'TOOLBAR', 'API',     'export',                  false,80,v_su),
    (NULL,'supplier','import',     'LIST',  'TOOLBAR', 'API',     'import',                  false,90,v_su),
    (NULL,'supplier','bulk_update','LIST',  'TOOLBAR', 'API',     'bulk_update',             false,100,v_su)
ON CONFLICT (tenant_id, entity_name, permission_code) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- employee  (Set C + delegate)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
VALUES
    (NULL,'employee','create',     'LIST',  'PRIMARY', 'NAVIGATE','/app/employee/new',       false,10,v_su),
    (NULL,'employee','update',     'DETAIL','PRIMARY', 'NAVIGATE','/app/employee/{id}/edit', true, 20,v_su),
    (NULL,'employee','cancel',     'DETAIL','OVERFLOW','MODAL',   'deactivate',              true, 30,v_su),
    (NULL,'employee','reopen',     'DETAIL','OVERFLOW','MODAL',   'reactivate',              true, 40,v_su),
    (NULL,'employee','close',      'DETAIL','OVERFLOW','MODAL',   'terminate',               true, 50,v_su),
    (NULL,'employee','delete',     'DETAIL','OVERFLOW','MODAL',   'delete',                  true, 60,v_su),
    (NULL,'employee','export',     'LIST',  'TOOLBAR', 'API',     'export',                  false,70,v_su),
    (NULL,'employee','import',     'LIST',  'TOOLBAR', 'API',     'import',                  false,80,v_su),
    (NULL,'employee','bulk_update','LIST',  'TOOLBAR', 'API',     'bulk_update',             false,90,v_su),
    (NULL,'employee','delegate',   'DETAIL','OVERFLOW','MODAL',   'delegate',                true,100,v_su)
ON CONFLICT (tenant_id, entity_name, permission_code) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- CONTROL: company_code_customer_profile, company_code_supplier_profile (Set G)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
VALUES
    (NULL,'company_code_customer_profile','update','DETAIL','PRIMARY','MODAL','edit',true,10,v_su),
    (NULL,'company_code_supplier_profile','update','DETAIL','PRIMARY','MODAL','edit',true,10,v_su)
ON CONFLICT (tenant_id, entity_name, permission_code) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- asset_class  (Set B)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
VALUES
    (NULL,'asset_class','create','LIST',  'PRIMARY', 'NAVIGATE','/app/asset_class/new',       false,10,v_su),
    (NULL,'asset_class','update','DETAIL','PRIMARY', 'NAVIGATE','/app/asset_class/{id}/edit', true, 20,v_su),
    (NULL,'asset_class','cancel','DETAIL','OVERFLOW','MODAL',   'deactivate',                 true, 30,v_su),
    (NULL,'asset_class','reopen','DETAIL','OVERFLOW','MODAL',   'reactivate',                 true, 40,v_su),
    (NULL,'asset_class','delete','DETAIL','OVERFLOW','MODAL',   'delete',                     true, 50,v_su),
    (NULL,'asset_class','export','LIST',  'TOOLBAR', 'API',     'export',                     false,60,v_su)
ON CONFLICT (tenant_id, entity_name, permission_code) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- asset  (Set C + dispose workflow)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
VALUES
    (NULL,'asset','create',  'LIST',  'PRIMARY', 'NAVIGATE','/app/asset/new',       false,10,v_su),
    (NULL,'asset','update',  'DETAIL','PRIMARY', 'NAVIGATE','/app/asset/{id}/edit', true, 20,v_su),
    (NULL,'asset','submit',  'DETAIL','PRIMARY', 'MODAL',   'submit_disposal',      true, 30,v_su),
    (NULL,'asset','approve', 'DETAIL','TOOLBAR', 'MODAL',   'approve_disposal',     true, 40,v_su),
    (NULL,'asset','cancel',  'DETAIL','OVERFLOW','MODAL',   'deactivate',           true, 50,v_su),
    (NULL,'asset','close',   'DETAIL','OVERFLOW','MODAL',   'dispose',              true, 60,v_su),
    (NULL,'asset','delete',  'DETAIL','OVERFLOW','MODAL',   'delete',               true, 70,v_su),
    (NULL,'asset','export',  'LIST',  'TOOLBAR', 'API',     'export',               false,80,v_su),
    (NULL,'asset','import',  'LIST',  'TOOLBAR', 'API',     'import',               false,90,v_su)
ON CONFLICT (tenant_id, entity_name, permission_code) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- CONTROL / RELATION: asset_book, asset_component, asset_assignment_history
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
VALUES
    (NULL,'asset_book',               'create','LIST',  'PRIMARY', 'MODAL','create', false,10,v_su),
    (NULL,'asset_book',               'update','DETAIL','PRIMARY', 'MODAL','edit',   true, 20,v_su),
    (NULL,'asset_book',               'delete','DETAIL','OVERFLOW','MODAL','delete', true, 30,v_su),
    (NULL,'asset_component',          'create','LIST',  'PRIMARY', 'MODAL','create', false,10,v_su),
    (NULL,'asset_component',          'update','DETAIL','PRIMARY', 'MODAL','edit',   true, 20,v_su),
    (NULL,'asset_component',          'delete','DETAIL','OVERFLOW','MODAL','delete', true, 30,v_su),
    (NULL,'asset_assignment_history', 'create','LIST',  'PRIMARY', 'MODAL','assign', false,10,v_su),
    (NULL,'asset_assignment_history', 'export','LIST',  'TOOLBAR', 'API',  'export', false,20,v_su)
ON CONFLICT (tenant_id, entity_name, permission_code) DO NOTHING;

RAISE NOTICE 'entity_operation: Partners + Assets seeded (% total so far)',
    (SELECT count(*) FROM control.entity_operation WHERE tenant_id IS NULL);
END $$;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/010_system/entity_engine/060_entity_operations/004_ops_budget_banking.sql
-- 060_entity_operations/004_ops_budget_banking.sql
-- Entity operation registrations for Budget, Banking, Payment Terms, Products (84–102)
-- Covers: budget_profile, budget_allocation, planning_model,
--         bank_party, bank_account, bank_account_mandate, bank_branch, payment_method,
--         holiday_calendar, holiday_calendar_day, payment_term, payment_term_clause,
--         payment_term_discount_tier, product, item, item_category, spend_category,
--         commodity_classification, company_code_spend_policy
-- Idempotent: ON CONFLICT (tenant_id, entity_name, permission_code) DO NOTHING

DO $$
DECLARE v_su uuid := '00000000-0000-0000-0000-000000000000';
BEGIN

-- ══════════════════════════════════════════════════════════════════════════════
-- budget_profile  (Set F + lock)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
VALUES
    (NULL,'budget_profile','create',  'LIST',  'PRIMARY', 'NAVIGATE','/app/budget_profile/new',       false,10,v_su),
    (NULL,'budget_profile','update',  'DETAIL','PRIMARY', 'NAVIGATE','/app/budget_profile/{id}/edit', true, 20,v_su),
    (NULL,'budget_profile','submit',  'DETAIL','PRIMARY', 'MODAL',   'submit',                        true, 30,v_su),
    (NULL,'budget_profile','approve', 'DETAIL','TOOLBAR', 'MODAL',   'approve',                       true, 40,v_su),
    (NULL,'budget_profile','deny',    'DETAIL','TOOLBAR', 'MODAL',   'deny',                          true, 50,v_su),
    (NULL,'budget_profile','close',   'DETAIL','OVERFLOW','MODAL',   'lock',                          true, 60,v_su),
    (NULL,'budget_profile','reopen',  'DETAIL','OVERFLOW','MODAL',   'unlock',                        true, 70,v_su),
    (NULL,'budget_profile','cancel',  'DETAIL','OVERFLOW','MODAL',   'cancel',                        true, 80,v_su),
    (NULL,'budget_profile','copy',    'DETAIL','OVERFLOW','API',     'copy',                          true, 90,v_su),
    (NULL,'budget_profile','delete',  'DETAIL','OVERFLOW','MODAL',   'delete',                        true,100,v_su),
    (NULL,'budget_profile','export',  'LIST',  'TOOLBAR', 'API',     'export',                        false,110,v_su)
ON CONFLICT (tenant_id, entity_name, permission_code) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- budget_allocation  (Set B + bulk_update)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
VALUES
    (NULL,'budget_allocation','create',     'LIST',  'PRIMARY', 'NAVIGATE','/app/budget_allocation/new',       false,10,v_su),
    (NULL,'budget_allocation','update',     'DETAIL','PRIMARY', 'NAVIGATE','/app/budget_allocation/{id}/edit', true, 20,v_su),
    (NULL,'budget_allocation','cancel',     'DETAIL','OVERFLOW','MODAL',   'deactivate',                       true, 30,v_su),
    (NULL,'budget_allocation','delete',     'DETAIL','OVERFLOW','MODAL',   'delete',                           true, 40,v_su),
    (NULL,'budget_allocation','export',     'LIST',  'TOOLBAR', 'API',     'export',                           false,50,v_su),
    (NULL,'budget_allocation','import',     'LIST',  'TOOLBAR', 'API',     'import',                           false,60,v_su),
    (NULL,'budget_allocation','bulk_update','LIST',  'TOOLBAR', 'API',     'bulk_update',                      false,70,v_su)
ON CONFLICT (tenant_id, entity_name, permission_code) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- planning_model  (Set B)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
VALUES
    (NULL,'planning_model','create', 'LIST',  'PRIMARY', 'NAVIGATE','/app/planning_model/new',       false,10,v_su),
    (NULL,'planning_model','update', 'DETAIL','PRIMARY', 'NAVIGATE','/app/planning_model/{id}/edit', true, 20,v_su),
    (NULL,'planning_model','cancel', 'DETAIL','OVERFLOW','MODAL',   'deactivate',                    true, 30,v_su),
    (NULL,'planning_model','copy',   'DETAIL','OVERFLOW','API',     'copy',                          true, 40,v_su),
    (NULL,'planning_model','delete', 'DETAIL','OVERFLOW','MODAL',   'delete',                        true, 50,v_su),
    (NULL,'planning_model','export', 'LIST',  'TOOLBAR', 'API',     'export',                        false,60,v_su)
ON CONFLICT (tenant_id, entity_name, permission_code) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- bank_party  (Set B)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
VALUES
    (NULL,'bank_party','create', 'LIST',  'PRIMARY', 'NAVIGATE','/app/bank_party/new',       false,10,v_su),
    (NULL,'bank_party','update', 'DETAIL','PRIMARY', 'NAVIGATE','/app/bank_party/{id}/edit', true, 20,v_su),
    (NULL,'bank_party','cancel', 'DETAIL','OVERFLOW','MODAL',   'deactivate',                true, 30,v_su),
    (NULL,'bank_party','reopen', 'DETAIL','OVERFLOW','MODAL',   'reactivate',                true, 40,v_su),
    (NULL,'bank_party','delete', 'DETAIL','OVERFLOW','MODAL',   'delete',                    true, 50,v_su),
    (NULL,'bank_party','export', 'LIST',  'TOOLBAR', 'API',     'export',                    false,60,v_su)
ON CONFLICT (tenant_id, entity_name, permission_code) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- bank_account  (Set C + activate/deactivate)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
VALUES
    (NULL,'bank_account','create', 'LIST',  'PRIMARY', 'NAVIGATE','/app/bank_account/new',       false,10,v_su),
    (NULL,'bank_account','update', 'DETAIL','PRIMARY', 'NAVIGATE','/app/bank_account/{id}/edit', true, 20,v_su),
    (NULL,'bank_account','cancel', 'DETAIL','TOOLBAR', 'MODAL',   'deactivate',                  true, 30,v_su),
    (NULL,'bank_account','reopen', 'DETAIL','TOOLBAR', 'MODAL',   'reactivate',                  true, 40,v_su),
    (NULL,'bank_account','close',  'DETAIL','OVERFLOW','MODAL',   'close',                       true, 50,v_su),
    (NULL,'bank_account','delete', 'DETAIL','OVERFLOW','MODAL',   'delete',                      true, 60,v_su),
    (NULL,'bank_account','export', 'LIST',  'TOOLBAR', 'API',     'export',                      false,70,v_su)
ON CONFLICT (tenant_id, entity_name, permission_code) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- bank_branch / payment_method  (Set A)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
VALUES
    (NULL,'bank_branch',  'create','LIST',  'PRIMARY', 'NAVIGATE','/app/bank_branch/new',       false,10,v_su),
    (NULL,'bank_branch',  'update','DETAIL','PRIMARY', 'NAVIGATE','/app/bank_branch/{id}/edit', true, 20,v_su),
    (NULL,'bank_branch',  'delete','DETAIL','OVERFLOW','MODAL',   'delete',                     true, 30,v_su),
    (NULL,'bank_branch',  'export','LIST',  'TOOLBAR', 'API',     'export',                     false,40,v_su),
    (NULL,'payment_method','create','LIST', 'PRIMARY', 'NAVIGATE','/app/payment_method/new',       false,10,v_su),
    (NULL,'payment_method','update','DETAIL','PRIMARY','NAVIGATE','/app/payment_method/{id}/edit', true, 20,v_su),
    (NULL,'payment_method','cancel','DETAIL','OVERFLOW','MODAL',  'deactivate',                   true, 30,v_su),
    (NULL,'payment_method','delete','DETAIL','OVERFLOW','MODAL',  'delete',                       true, 40,v_su),
    (NULL,'payment_method','export','LIST',  'TOOLBAR','API',     'export',                       false,50,v_su)
ON CONFLICT (tenant_id, entity_name, permission_code) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- payment_term  (Set B + import)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
VALUES
    (NULL,'payment_term','create', 'LIST',  'PRIMARY', 'NAVIGATE','/app/payment_term/new',       false,10,v_su),
    (NULL,'payment_term','update', 'DETAIL','PRIMARY', 'NAVIGATE','/app/payment_term/{id}/edit', true, 20,v_su),
    (NULL,'payment_term','cancel', 'DETAIL','OVERFLOW','MODAL',   'deactivate',                  true, 30,v_su),
    (NULL,'payment_term','reopen', 'DETAIL','OVERFLOW','MODAL',   'reactivate',                  true, 40,v_su),
    (NULL,'payment_term','copy',   'DETAIL','OVERFLOW','API',     'copy',                        true, 50,v_su),
    (NULL,'payment_term','delete', 'DETAIL','OVERFLOW','MODAL',   'delete',                      true, 60,v_su),
    (NULL,'payment_term','export', 'LIST',  'TOOLBAR', 'API',     'export',                      false,70,v_su),
    (NULL,'payment_term','import', 'LIST',  'TOOLBAR', 'API',     'import',                      false,80,v_su)
ON CONFLICT (tenant_id, entity_name, permission_code) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- holiday_calendar  (Set B)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
VALUES
    (NULL,'holiday_calendar','create', 'LIST',  'PRIMARY', 'NAVIGATE','/app/holiday_calendar/new',       false,10,v_su),
    (NULL,'holiday_calendar','update', 'DETAIL','PRIMARY', 'NAVIGATE','/app/holiday_calendar/{id}/edit', true, 20,v_su),
    (NULL,'holiday_calendar','cancel', 'DETAIL','OVERFLOW','MODAL',   'deactivate',                      true, 30,v_su),
    (NULL,'holiday_calendar','copy',   'DETAIL','OVERFLOW','API',     'copy',                            true, 40,v_su),
    (NULL,'holiday_calendar','delete', 'DETAIL','OVERFLOW','MODAL',   'delete',                          true, 50,v_su),
    (NULL,'holiday_calendar','export', 'LIST',  'TOOLBAR', 'API',     'export',                          false,60,v_su)
ON CONFLICT (tenant_id, entity_name, permission_code) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- product / item  (Set C: + archived lifecycle)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
VALUES
    (NULL,'product','create',     'LIST',  'PRIMARY', 'NAVIGATE','/app/product/new',       false,10,v_su),
    (NULL,'product','update',     'DETAIL','PRIMARY', 'NAVIGATE','/app/product/{id}/edit', true, 20,v_su),
    (NULL,'product','cancel',     'DETAIL','OVERFLOW','MODAL',   'deactivate',             true, 30,v_su),
    (NULL,'product','reopen',     'DETAIL','OVERFLOW','MODAL',   'reactivate',             true, 40,v_su),
    (NULL,'product','close',      'DETAIL','OVERFLOW','MODAL',   'archive',                true, 50,v_su),
    (NULL,'product','copy',       'DETAIL','OVERFLOW','API',     'copy',                   true, 60,v_su),
    (NULL,'product','delete',     'DETAIL','OVERFLOW','MODAL',   'delete',                 true, 70,v_su),
    (NULL,'product','export',     'LIST',  'TOOLBAR', 'API',     'export',                 false,80,v_su),
    (NULL,'product','import',     'LIST',  'TOOLBAR', 'API',     'import',                 false,90,v_su),
    (NULL,'product','bulk_update','LIST',  'TOOLBAR', 'API',     'bulk_update',            false,100,v_su),

    (NULL,'item','create',     'LIST',  'PRIMARY', 'NAVIGATE','/app/item/new',       false,10,v_su),
    (NULL,'item','update',     'DETAIL','PRIMARY', 'NAVIGATE','/app/item/{id}/edit', true, 20,v_su),
    (NULL,'item','cancel',     'DETAIL','OVERFLOW','MODAL',   'deactivate',          true, 30,v_su),
    (NULL,'item','reopen',     'DETAIL','OVERFLOW','MODAL',   'reactivate',          true, 40,v_su),
    (NULL,'item','close',      'DETAIL','OVERFLOW','MODAL',   'archive',             true, 50,v_su),
    (NULL,'item','copy',       'DETAIL','OVERFLOW','API',     'copy',                true, 60,v_su),
    (NULL,'item','delete',     'DETAIL','OVERFLOW','MODAL',   'delete',              true, 70,v_su),
    (NULL,'item','export',     'LIST',  'TOOLBAR', 'API',     'export',              false,80,v_su),
    (NULL,'item','import',     'LIST',  'TOOLBAR', 'API',     'import',              false,90,v_su),
    (NULL,'item','bulk_update','LIST',  'TOOLBAR', 'API',     'bulk_update',         false,100,v_su)
ON CONFLICT (tenant_id, entity_name, permission_code) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- item_category / spend_category  (Set B)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
VALUES
    (NULL,'item_category','create','LIST',  'PRIMARY', 'NAVIGATE','/app/item_category/new',       false,10,v_su),
    (NULL,'item_category','update','DETAIL','PRIMARY', 'NAVIGATE','/app/item_category/{id}/edit', true, 20,v_su),
    (NULL,'item_category','cancel','DETAIL','OVERFLOW','MODAL',   'deactivate',                   true, 30,v_su),
    (NULL,'item_category','delete','DETAIL','OVERFLOW','MODAL',   'delete',                       true, 40,v_su),
    (NULL,'item_category','export','LIST',  'TOOLBAR', 'API',     'export',                       false,50,v_su),

    (NULL,'spend_category','create','LIST',  'PRIMARY', 'NAVIGATE','/app/spend_category/new',       false,10,v_su),
    (NULL,'spend_category','update','DETAIL','PRIMARY', 'NAVIGATE','/app/spend_category/{id}/edit', true, 20,v_su),
    (NULL,'spend_category','cancel','DETAIL','OVERFLOW','MODAL',   'deactivate',                    true, 30,v_su),
    (NULL,'spend_category','delete','DETAIL','OVERFLOW','MODAL',   'delete',                        true, 40,v_su),
    (NULL,'spend_category','export','LIST',  'TOOLBAR', 'API',     'export',                        false,50,v_su)
ON CONFLICT (tenant_id, entity_name, permission_code) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- CONTROL / RELATION: bank_account_mandate, payment_term_clause,
--                     payment_term_discount_tier, commodity_classification,
--                     company_code_spend_policy, holiday_calendar_day
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
VALUES
    (NULL,'bank_account_mandate',       'create','LIST',  'PRIMARY', 'MODAL','create',false,10,v_su),
    (NULL,'bank_account_mandate',       'delete','DETAIL','OVERFLOW','MODAL','delete',true, 20,v_su),
    (NULL,'payment_term_clause',        'create','LIST',  'PRIMARY', 'MODAL','create',false,10,v_su),
    (NULL,'payment_term_clause',        'update','DETAIL','PRIMARY', 'MODAL','edit',  true, 20,v_su),
    (NULL,'payment_term_clause',        'delete','DETAIL','OVERFLOW','MODAL','delete',true, 30,v_su),
    (NULL,'payment_term_discount_tier', 'create','LIST',  'PRIMARY', 'MODAL','create',false,10,v_su),
    (NULL,'payment_term_discount_tier', 'update','DETAIL','PRIMARY', 'MODAL','edit',  true, 20,v_su),
    (NULL,'payment_term_discount_tier', 'delete','DETAIL','OVERFLOW','MODAL','delete',true, 30,v_su),
    (NULL,'holiday_calendar_day',       'create','LIST',  'PRIMARY', 'MODAL','create',false,10,v_su),
    (NULL,'holiday_calendar_day',       'delete','DETAIL','OVERFLOW','MODAL','delete',true, 20,v_su),
    (NULL,'holiday_calendar_day',       'import','LIST',  'TOOLBAR', 'API',  'import',false,30,v_su),
    (NULL,'commodity_classification',   'create','LIST',  'PRIMARY', 'MODAL','create',false,10,v_su),
    (NULL,'commodity_classification',   'delete','DETAIL','OVERFLOW','MODAL','delete',true, 20,v_su),
    (NULL,'company_code_spend_policy',  'update','DETAIL','PRIMARY', 'MODAL','edit',  true, 10,v_su)
ON CONFLICT (tenant_id, entity_name, permission_code) DO NOTHING;

RAISE NOTICE 'entity_operation: Budget/Banking/Products seeded (% total so far)',
    (SELECT count(*) FROM control.entity_operation WHERE tenant_id IS NULL);
END $$;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/010_system/entity_engine/060_entity_operations/005_ops_templates_docs.sql
-- 060_entity_operations/005_ops_templates_docs.sql
-- Entity operation registrations for DOC/WFL entities (41–48)
-- Covers: document_template, document_template_clause, workflow_definition,
--         workflow_template, workflow_template_stage, workflow_template_rule,
--         trigger_rule, print_profile
-- Idempotent: ON CONFLICT (tenant_id, entity_name, permission_code) DO NOTHING

DO $$
DECLARE v_su uuid := '00000000-0000-0000-0000-000000000000';
BEGIN

-- ══════════════════════════════════════════════════════════════════════════════
-- document_template  (Set F: create/update/delete/export/submit/activate/copy)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
VALUES
    (NULL,'document_template','create',  'LIST',  'PRIMARY', 'NAVIGATE','/app/document_template/new',       false,10,v_su),
    (NULL,'document_template','update',  'DETAIL','PRIMARY', 'NAVIGATE','/app/document_template/{id}/edit', true, 20,v_su),
    (NULL,'document_template','submit',  'DETAIL','TOOLBAR', 'MODAL',   'submit',                           true, 30,v_su),
    (NULL,'document_template','approve', 'DETAIL','TOOLBAR', 'MODAL',   'approve',                          true, 40,v_su),
    (NULL,'document_template','cancel',  'DETAIL','OVERFLOW','MODAL',   'deactivate',                       true, 50,v_su),
    (NULL,'document_template','reopen',  'DETAIL','OVERFLOW','MODAL',   'reactivate',                       true, 60,v_su),
    (NULL,'document_template','copy',    'DETAIL','OVERFLOW','API',     'copy',                             true, 70,v_su),
    (NULL,'document_template','delete',  'DETAIL','OVERFLOW','MODAL',   'delete',                           true, 80,v_su),
    (NULL,'document_template','export',  'LIST',  'TOOLBAR', 'API',     'export',                           false,90,v_su),
    (NULL,'document_template','import',  'LIST',  'TOOLBAR', 'API',     'import',                           false,100,v_su)
ON CONFLICT (tenant_id, entity_name, permission_code) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- workflow_definition  (Set F: template-like workflow)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
VALUES
    (NULL,'workflow_definition','create',  'LIST',  'PRIMARY', 'NAVIGATE','/app/workflow_definition/new',       false,10,v_su),
    (NULL,'workflow_definition','update',  'DETAIL','PRIMARY', 'NAVIGATE','/app/workflow_definition/{id}/edit', true, 20,v_su),
    (NULL,'workflow_definition','submit',  'DETAIL','TOOLBAR', 'MODAL',   'submit',                             true, 30,v_su),
    (NULL,'workflow_definition','approve', 'DETAIL','TOOLBAR', 'MODAL',   'approve',                            true, 40,v_su),
    (NULL,'workflow_definition','cancel',  'DETAIL','OVERFLOW','MODAL',   'deactivate',                         true, 50,v_su),
    (NULL,'workflow_definition','reopen',  'DETAIL','OVERFLOW','MODAL',   'reactivate',                         true, 60,v_su),
    (NULL,'workflow_definition','copy',    'DETAIL','OVERFLOW','API',     'copy',                               true, 70,v_su),
    (NULL,'workflow_definition','delete',  'DETAIL','OVERFLOW','MODAL',   'delete',                             true, 80,v_su),
    (NULL,'workflow_definition','export',  'LIST',  'TOOLBAR', 'API',     'export',                             false,90,v_su)
ON CONFLICT (tenant_id, entity_name, permission_code) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- workflow_template  (Set F)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
VALUES
    (NULL,'workflow_template','create',  'LIST',  'PRIMARY', 'NAVIGATE','/app/workflow_template/new',       false,10,v_su),
    (NULL,'workflow_template','update',  'DETAIL','PRIMARY', 'NAVIGATE','/app/workflow_template/{id}/edit', true, 20,v_su),
    (NULL,'workflow_template','submit',  'DETAIL','TOOLBAR', 'MODAL',   'submit',                           true, 30,v_su),
    (NULL,'workflow_template','approve', 'DETAIL','TOOLBAR', 'MODAL',   'approve',                          true, 40,v_su),
    (NULL,'workflow_template','cancel',  'DETAIL','OVERFLOW','MODAL',   'deactivate',                       true, 50,v_su),
    (NULL,'workflow_template','reopen',  'DETAIL','OVERFLOW','MODAL',   'reactivate',                       true, 60,v_su),
    (NULL,'workflow_template','copy',    'DETAIL','OVERFLOW','API',     'copy',                             true, 70,v_su),
    (NULL,'workflow_template','delete',  'DETAIL','OVERFLOW','MODAL',   'delete',                           true, 80,v_su),
    (NULL,'workflow_template','export',  'LIST',  'TOOLBAR', 'API',     'export',                           false,90,v_su)
ON CONFLICT (tenant_id, entity_name, permission_code) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- trigger_rule  (Set B)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
VALUES
    (NULL,'trigger_rule','create', 'LIST',  'PRIMARY', 'NAVIGATE','/app/trigger_rule/new',       false,10,v_su),
    (NULL,'trigger_rule','update', 'DETAIL','PRIMARY', 'NAVIGATE','/app/trigger_rule/{id}/edit', true, 20,v_su),
    (NULL,'trigger_rule','cancel', 'DETAIL','OVERFLOW','MODAL',   'deactivate',                  true, 30,v_su),
    (NULL,'trigger_rule','reopen', 'DETAIL','OVERFLOW','MODAL',   'reactivate',                  true, 40,v_su),
    (NULL,'trigger_rule','delete', 'DETAIL','OVERFLOW','MODAL',   'delete',                      true, 50,v_su),
    (NULL,'trigger_rule','export', 'LIST',  'TOOLBAR', 'API',     'export',                      false,60,v_su)
ON CONFLICT (tenant_id, entity_name, permission_code) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- print_profile  (Set A)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
VALUES
    (NULL,'print_profile','create','LIST',  'PRIMARY', 'NAVIGATE','/app/print_profile/new',       false,10,v_su),
    (NULL,'print_profile','update','DETAIL','PRIMARY', 'NAVIGATE','/app/print_profile/{id}/edit', true, 20,v_su),
    (NULL,'print_profile','cancel','DETAIL','OVERFLOW','MODAL',   'deactivate',                   true, 30,v_su),
    (NULL,'print_profile','delete','DETAIL','OVERFLOW','MODAL',   'delete',                       true, 40,v_su),
    (NULL,'print_profile','export','LIST',  'TOOLBAR', 'API',     'export',                       false,50,v_su)
ON CONFLICT (tenant_id, entity_name, permission_code) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- CONTROL / RELATION: document_template_clause, workflow_template_stage,
--                     workflow_template_rule  (Set G)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
VALUES
    (NULL,'document_template_clause','create','LIST',  'PRIMARY', 'MODAL','create',false,10,v_su),
    (NULL,'document_template_clause','update','DETAIL','PRIMARY', 'MODAL','edit',  true, 20,v_su),
    (NULL,'document_template_clause','delete','DETAIL','OVERFLOW','MODAL','delete',true, 30,v_su),
    (NULL,'workflow_template_stage', 'create','LIST',  'PRIMARY', 'MODAL','create',false,10,v_su),
    (NULL,'workflow_template_stage', 'update','DETAIL','PRIMARY', 'MODAL','edit',  true, 20,v_su),
    (NULL,'workflow_template_stage', 'delete','DETAIL','OVERFLOW','MODAL','delete',true, 30,v_su),
    (NULL,'workflow_template_rule',  'create','LIST',  'PRIMARY', 'MODAL','create',false,10,v_su),
    (NULL,'workflow_template_rule',  'update','DETAIL','PRIMARY', 'MODAL','edit',  true, 20,v_su),
    (NULL,'workflow_template_rule',  'delete','DETAIL','OVERFLOW','MODAL','delete',true, 30,v_su)
ON CONFLICT (tenant_id, entity_name, permission_code) DO NOTHING;

RAISE NOTICE 'entity_operation: Templates/Docs/Workflow seeded (% total so far)',
    (SELECT count(*) FROM control.entity_operation WHERE tenant_id IS NULL);
END $$;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/010_system/entity_engine/060_entity_operations/006_ops_master_data.sql
-- 060_entity_operations/006_ops_master_data.sql
-- Entity operation registrations for Dimensions, Tax/FX, NTF, CMS/ACT (75–86 + 27–40)
-- Covers: dimension_type, dimension_value, cost_center_dimension_map,
--         profit_center_dimension_map, project_dimension_map,
--         company_code_dimension_default, tax_jurisdiction, tax_type, fx_rate,
--         notification, notification_default, attachment, comment, conversation,
--         reaction, draft, flag_submission, activity_event, comment_flag,
--         comment_draft, comment_feed_cursor
-- Idempotent: ON CONFLICT (tenant_id, entity_name, permission_code) DO NOTHING

DO $$
DECLARE v_su uuid := '00000000-0000-0000-0000-000000000000';
BEGIN

-- ══════════════════════════════════════════════════════════════════════════════
-- dimension_type / dimension_value  (Set B + import)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
VALUES
    (NULL,'dimension_type','create', 'LIST',  'PRIMARY', 'NAVIGATE','/app/dimension_type/new',       false,10,v_su),
    (NULL,'dimension_type','update', 'DETAIL','PRIMARY', 'NAVIGATE','/app/dimension_type/{id}/edit', true, 20,v_su),
    (NULL,'dimension_type','cancel', 'DETAIL','OVERFLOW','MODAL',   'deactivate',                    true, 30,v_su),
    (NULL,'dimension_type','reopen', 'DETAIL','OVERFLOW','MODAL',   'reactivate',                    true, 40,v_su),
    (NULL,'dimension_type','delete', 'DETAIL','OVERFLOW','MODAL',   'delete',                        true, 50,v_su),
    (NULL,'dimension_type','export', 'LIST',  'TOOLBAR', 'API',     'export',                        false,60,v_su),

    (NULL,'dimension_value','create',     'LIST',  'PRIMARY', 'NAVIGATE','/app/dimension_value/new',       false,10,v_su),
    (NULL,'dimension_value','update',     'DETAIL','PRIMARY', 'NAVIGATE','/app/dimension_value/{id}/edit', true, 20,v_su),
    (NULL,'dimension_value','cancel',     'DETAIL','OVERFLOW','MODAL',   'deactivate',                     true, 30,v_su),
    (NULL,'dimension_value','reopen',     'DETAIL','OVERFLOW','MODAL',   'reactivate',                     true, 40,v_su),
    (NULL,'dimension_value','delete',     'DETAIL','OVERFLOW','MODAL',   'delete',                         true, 50,v_su),
    (NULL,'dimension_value','export',     'LIST',  'TOOLBAR', 'API',     'export',                         false,60,v_su),
    (NULL,'dimension_value','import',     'LIST',  'TOOLBAR', 'API',     'import',                         false,70,v_su),
    (NULL,'dimension_value','bulk_update','LIST',  'TOOLBAR', 'API',     'bulk_update',                    false,80,v_su)
ON CONFLICT (tenant_id, entity_name, permission_code) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- tax_jurisdiction / tax_type  (Set B + import)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
VALUES
    (NULL,'tax_jurisdiction','create', 'LIST',  'PRIMARY', 'NAVIGATE','/app/tax_jurisdiction/new',       false,10,v_su),
    (NULL,'tax_jurisdiction','update', 'DETAIL','PRIMARY', 'NAVIGATE','/app/tax_jurisdiction/{id}/edit', true, 20,v_su),
    (NULL,'tax_jurisdiction','cancel', 'DETAIL','OVERFLOW','MODAL',   'deactivate',                      true, 30,v_su),
    (NULL,'tax_jurisdiction','reopen', 'DETAIL','OVERFLOW','MODAL',   'reactivate',                      true, 40,v_su),
    (NULL,'tax_jurisdiction','delete', 'DETAIL','OVERFLOW','MODAL',   'delete',                          true, 50,v_su),
    (NULL,'tax_jurisdiction','export', 'LIST',  'TOOLBAR', 'API',     'export',                          false,60,v_su),
    (NULL,'tax_jurisdiction','import', 'LIST',  'TOOLBAR', 'API',     'import',                          false,70,v_su),

    (NULL,'tax_type','create','LIST',  'PRIMARY', 'NAVIGATE','/app/tax_type/new',       false,10,v_su),
    (NULL,'tax_type','update','DETAIL','PRIMARY', 'NAVIGATE','/app/tax_type/{id}/edit', true, 20,v_su),
    (NULL,'tax_type','cancel','DETAIL','OVERFLOW','MODAL',   'deactivate',              true, 30,v_su),
    (NULL,'tax_type','reopen','DETAIL','OVERFLOW','MODAL',   'reactivate',              true, 40,v_su),
    (NULL,'tax_type','delete','DETAIL','OVERFLOW','MODAL',   'delete',                  true, 50,v_su),
    (NULL,'tax_type','export','LIST',  'TOOLBAR', 'API',     'export',                  false,60,v_su)
ON CONFLICT (tenant_id, entity_name, permission_code) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- fx_rate  (Set A + import + bulk_update)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
VALUES
    (NULL,'fx_rate','create',     'LIST',  'PRIMARY', 'NAVIGATE','/app/fx_rate/new',       false,10,v_su),
    (NULL,'fx_rate','update',     'DETAIL','PRIMARY', 'NAVIGATE','/app/fx_rate/{id}/edit', true, 20,v_su),
    (NULL,'fx_rate','delete',     'DETAIL','OVERFLOW','MODAL',   'delete',                 true, 30,v_su),
    (NULL,'fx_rate','export',     'LIST',  'TOOLBAR', 'API',     'export',                 false,40,v_su),
    (NULL,'fx_rate','import',     'LIST',  'TOOLBAR', 'API',     'import',                 false,50,v_su),
    (NULL,'fx_rate','bulk_update','LIST',  'TOOLBAR', 'API',     'bulk_update',            false,60,v_su)
ON CONFLICT (tenant_id, entity_name, permission_code) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- notification  (Set H: read + export)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
VALUES
    (NULL,'notification','read',   'LIST',  'TOOLBAR','NAVIGATE','/app/notification/{id}',false,10,v_su),
    (NULL,'notification','delete', 'DETAIL','OVERFLOW','MODAL',  'delete',                 true, 20,v_su),
    (NULL,'notification','export', 'LIST',  'TOOLBAR', 'API',    'export',                 false,30,v_su)
ON CONFLICT (tenant_id, entity_name, permission_code) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- attachment  (Set A + add_attachment)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
VALUES
    (NULL,'attachment','create',          'LIST',  'PRIMARY', 'MODAL','upload',              false,10,v_su),
    (NULL,'attachment','add_attachment',  'LIST',  'PRIMARY', 'MODAL','upload',              false,15,v_su),
    (NULL,'attachment','update',          'DETAIL','PRIMARY', 'MODAL','edit',                true, 20,v_su),
    (NULL,'attachment','delete',          'DETAIL','OVERFLOW','MODAL','delete',              true, 30,v_su),
    (NULL,'attachment','export',          'LIST',  'TOOLBAR', 'API',  'export',              false,40,v_su)
ON CONFLICT (tenant_id, entity_name, permission_code) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- comment  (add_comment, flag, delete own)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
VALUES
    (NULL,'comment','create',              'LIST',  'PRIMARY', 'MODAL','add_comment',         false,10,v_su),
    (NULL,'comment','add_comment',         'LIST',  'PRIMARY', 'MODAL','add_comment',         false,15,v_su),
    (NULL,'comment','update',              'DETAIL','PRIMARY', 'MODAL','edit_comment',        true, 20,v_su),
    (NULL,'comment','delete',              'DETAIL','OVERFLOW','MODAL','delete_comment',      true, 30,v_su),
    (NULL,'comment','del_others_comment',  'DETAIL','OVERFLOW','MODAL','delete_comment',      true, 35,v_su)
ON CONFLICT (tenant_id, entity_name, permission_code) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- conversation  (Set A)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
VALUES
    (NULL,'conversation','create','LIST',  'PRIMARY', 'MODAL','create',  false,10,v_su),
    (NULL,'conversation','update','DETAIL','PRIMARY', 'MODAL','edit',    true, 20,v_su),
    (NULL,'conversation','close', 'DETAIL','OVERFLOW','MODAL','close',   true, 30,v_su),
    (NULL,'conversation','delete','DETAIL','OVERFLOW','MODAL','delete',  true, 40,v_su)
ON CONFLICT (tenant_id, entity_name, permission_code) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- CONTROL / RELATION dimension maps  (Set G)
-- cost_center_dimension_map, profit_center_dimension_map,
-- project_dimension_map, company_code_dimension_default
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
VALUES
    (NULL,'cost_center_dimension_map',    'create','LIST',  'PRIMARY', 'MODAL','create',false,10,v_su),
    (NULL,'cost_center_dimension_map',    'delete','DETAIL','OVERFLOW','MODAL','delete',true, 20,v_su),
    (NULL,'profit_center_dimension_map',  'create','LIST',  'PRIMARY', 'MODAL','create',false,10,v_su),
    (NULL,'profit_center_dimension_map',  'delete','DETAIL','OVERFLOW','MODAL','delete',true, 20,v_su),
    (NULL,'project_dimension_map',        'create','LIST',  'PRIMARY', 'MODAL','create',false,10,v_su),
    (NULL,'project_dimension_map',        'delete','DETAIL','OVERFLOW','MODAL','delete',true, 20,v_su),
    (NULL,'company_code_dimension_default','update','DETAIL','PRIMARY','MODAL','edit',  true, 10,v_su)
ON CONFLICT (tenant_id, entity_name, permission_code) DO NOTHING;

RAISE NOTICE 'entity_operation: Dimensions/Tax/NTF/CMS/ACT seeded (% total so far)',
    (SELECT count(*) FROM control.entity_operation WHERE tenant_id IS NULL);
END $$;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/010_system/entity_engine/060_entity_operations/007_ops_ui_cms.sql
-- 060_entity_operations/007_ops_ui_cms.sql
-- Entity operation registrations for UI + CMS entities (103–111)
-- and remaining NTF / tenant_notification_profile CONTROL entities
-- Covers: principal_ui_profile, principal_ui_preference, saved_view, dashboard,
--         dashboard_widget, principal_notification_preference,
--         content_item, content_item_link, content_item_access_grant,
--         notification_default, tenant_notification_profile
-- Also seeds: dimension_set (75–80 group, missed in 006)
-- Idempotent: ON CONFLICT (tenant_id, entity_name, permission_code) DO NOTHING

DO $$
DECLARE v_su uuid := '00000000-0000-0000-0000-000000000000';
BEGIN

-- ══════════════════════════════════════════════════════════════════════════════
-- saved_view  (Set B)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
VALUES
    (NULL,'saved_view','create',     'LIST',  'PRIMARY', 'NAVIGATE','/app/saved_view/new',       false,10,v_su),
    (NULL,'saved_view','update',     'DETAIL','PRIMARY', 'NAVIGATE','/app/saved_view/{id}/edit', true, 20,v_su),
    (NULL,'saved_view','cancel',     'DETAIL','OVERFLOW','MODAL',   'archive',                   true, 30,v_su),
    (NULL,'saved_view','delete',     'DETAIL','OVERFLOW','MODAL',   'delete',                    true, 40,v_su),
    (NULL,'saved_view','share_read', 'DETAIL','OVERFLOW','MODAL',   'share',                     true, 50,v_su),
    (NULL,'saved_view','export',     'LIST',  'TOOLBAR', 'API',     'export',                    false,60,v_su)
ON CONFLICT (tenant_id, entity_name, permission_code) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- dashboard  (Set B + share)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
VALUES
    (NULL,'dashboard','create',     'LIST',  'PRIMARY', 'NAVIGATE','/app/dashboard/new',       false,10,v_su),
    (NULL,'dashboard','update',     'DETAIL','PRIMARY', 'NAVIGATE','/app/dashboard/{id}/edit', true, 20,v_su),
    (NULL,'dashboard','cancel',     'DETAIL','OVERFLOW','MODAL',   'deactivate',               true, 30,v_su),
    (NULL,'dashboard','delete',     'DETAIL','OVERFLOW','MODAL',   'delete',                   true, 40,v_su),
    (NULL,'dashboard','share_read', 'DETAIL','OVERFLOW','MODAL',   'share',                    true, 50,v_su),
    (NULL,'dashboard','copy',       'DETAIL','OVERFLOW','API',     'copy',                     true, 60,v_su),
    (NULL,'dashboard','export',     'LIST',  'TOOLBAR', 'API',     'export',                   false,70,v_su)
ON CONFLICT (tenant_id, entity_name, permission_code) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- content_item  (Set F + share + add_attachment)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
VALUES
    (NULL,'content_item','create',         'LIST',  'PRIMARY', 'NAVIGATE','/app/content_item/new',       false,10,v_su),
    (NULL,'content_item','update',         'DETAIL','PRIMARY', 'NAVIGATE','/app/content_item/{id}/edit', true, 20,v_su),
    (NULL,'content_item','submit',         'DETAIL','TOOLBAR', 'MODAL',   'submit',                      true, 30,v_su),
    (NULL,'content_item','approve',        'DETAIL','TOOLBAR', 'MODAL',   'approve',                     true, 40,v_su),
    (NULL,'content_item','cancel',         'DETAIL','OVERFLOW','MODAL',   'unpublish',                   true, 50,v_su),
    (NULL,'content_item','reopen',         'DETAIL','OVERFLOW','MODAL',   'republish',                   true, 60,v_su),
    (NULL,'content_item','close',          'DETAIL','OVERFLOW','MODAL',   'archive',                     true, 70,v_su),
    (NULL,'content_item','copy',           'DETAIL','OVERFLOW','API',     'copy',                        true, 80,v_su),
    (NULL,'content_item','delete',         'DETAIL','OVERFLOW','MODAL',   'delete',                      true, 90,v_su),
    (NULL,'content_item','share_read',     'DETAIL','OVERFLOW','MODAL',   'share',                       true,100,v_su),
    (NULL,'content_item','add_attachment', 'DETAIL','OVERFLOW','MODAL',   'attach',                      true,110,v_su),
    (NULL,'content_item','export',         'LIST',  'TOOLBAR', 'API',     'export',                      false,120,v_su)
ON CONFLICT (tenant_id, entity_name, permission_code) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- CONTROL: principal_ui_profile, principal_ui_preference,
--          principal_notification_preference, notification_default,
--          content_item_link, content_item_access_grant, dashboard_widget
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
VALUES
    (NULL,'principal_ui_profile',           'update','DETAIL','PRIMARY', 'MODAL','edit',  true, 10,v_su),
    (NULL,'principal_ui_preference',        'update','DETAIL','PRIMARY', 'MODAL','edit',  true, 10,v_su),
    (NULL,'principal_ui_preference',        'delete','DETAIL','OVERFLOW','MODAL','delete',true, 20,v_su),
    (NULL,'principal_notification_preference','update','DETAIL','PRIMARY','MODAL','edit', true, 10,v_su),
    (NULL,'notification_default',           'create','LIST',  'PRIMARY', 'MODAL','create',false,10,v_su),
    (NULL,'notification_default',           'update','DETAIL','PRIMARY', 'MODAL','edit',  true, 20,v_su),
    (NULL,'notification_default',           'delete','DETAIL','OVERFLOW','MODAL','delete',true, 30,v_su),
    (NULL,'content_item_access_grant',      'create','LIST',  'PRIMARY', 'MODAL','grant', false,10,v_su),
    (NULL,'content_item_access_grant',      'cancel','DETAIL','PRIMARY', 'MODAL','revoke',true, 20,v_su),
    (NULL,'content_item_access_grant',      'delete','DETAIL','OVERFLOW','MODAL','delete',true, 30,v_su),
    (NULL,'dashboard_widget',               'create','LIST',  'PRIMARY', 'MODAL','add_widget',false,10,v_su),
    (NULL,'dashboard_widget',               'update','DETAIL','PRIMARY', 'MODAL','edit',  true, 20,v_su),
    (NULL,'dashboard_widget',               'delete','DETAIL','OVERFLOW','MODAL','delete',true, 30,v_su)
ON CONFLICT (tenant_id, entity_name, permission_code) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- dimension_set  (missed in 006 — Set B)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
VALUES
    (NULL,'dimension_set','create','LIST',  'PRIMARY', 'NAVIGATE','/app/dimension_set/new',       false,10,v_su),
    (NULL,'dimension_set','update','DETAIL','PRIMARY', 'NAVIGATE','/app/dimension_set/{id}/edit', true, 20,v_su),
    (NULL,'dimension_set','cancel','DETAIL','OVERFLOW','MODAL',   'deactivate',                   true, 30,v_su),
    (NULL,'dimension_set','delete','DETAIL','OVERFLOW','MODAL',   'delete',                       true, 40,v_su),
    (NULL,'dimension_set','export','LIST',  'TOOLBAR', 'API',     'export',                       false,50,v_su)
ON CONFLICT (tenant_id, entity_name, permission_code) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- gl_account_hierarchy  (Set A)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
VALUES
    (NULL,'gl_account_hierarchy','create','LIST',  'PRIMARY', 'NAVIGATE','/app/gl_account_hierarchy/new',       false,10,v_su),
    (NULL,'gl_account_hierarchy','update','DETAIL','PRIMARY', 'NAVIGATE','/app/gl_account_hierarchy/{id}/edit', true, 20,v_su),
    (NULL,'gl_account_hierarchy','delete','DETAIL','OVERFLOW','MODAL',   'delete',                              true, 30,v_su),
    (NULL,'gl_account_hierarchy','export','LIST',  'TOOLBAR', 'API',     'export',                              false,40,v_su)
ON CONFLICT (tenant_id, entity_name, permission_code) DO NOTHING;

RAISE NOTICE 'entity_operation: UI/CMS + remaining entities seeded';
RAISE NOTICE 'entity_operation: TOTAL system-global operations = %',
    (SELECT count(*) FROM control.entity_operation WHERE tenant_id IS NULL);
END $$;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/010_system/entity_engine/070_entity_relations.sql
-- 070_entity_relations.sql
-- FK/join relationship declarations for master.* entity versions (version_no = 1).
-- Uses a set-based INSERT joining entity names to resolved entity_version_id values.
-- Idempotent: ON CONFLICT (entity_version_id, name) DO NOTHING
-- Run AFTER: 020_entities/*.sql + 025_entity_versions.sql

DO $$
DECLARE
    v_su uuid := '00000000-0000-0000-0000-000000000000';
    cnt  int;
BEGIN
    -- Guard: ensure entity versions exist
    IF NOT EXISTS (SELECT 1 FROM control.entity_version ev
                   JOIN control.entity e ON e.id = ev.entity_id
                   WHERE e.name = 'principal' AND ev.version_no = 1) THEN
        RAISE EXCEPTION 'entity_version rows missing — run 025_entity_versions.sql first';
    END IF;

    -- ─────────────────────────────────────────────────────────────────────────
    -- Bulk insert: resolve entity_version_id via JOIN on entity.name + version_no
    -- Columns: entity(source), rel_name, kind, target_entity, fk_field, on_del
    -- ─────────────────────────────────────────────────────────────────────────
    INSERT INTO control.entity_relation
        (entity_version_id, name, relation_kind, target_entity, fk_field, on_delete, created_by)
    SELECT
        ev.id,
        r.rel_name,
        r.kind,
        r.target_entity,
        r.fk_field,
        r.on_del,
        v_su
    FROM (VALUES

        -- ── IAM: principal ───────────────────────────────────────────────────
        ('principal', 'tenant',              'belongs_to', 'tenant',                'tenant_id',   'restrict'),
        ('principal', 'personas',            'has_many',   'principal_persona',      'principal_id', 'cascade'),
        ('principal', 'group_memberships',   'has_many',   'auth_group_member',      'principal_id', 'cascade'),
        ('principal', 'access_grants',       'has_many',   'access_grant',           'principal_id', 'cascade'),
        ('principal', 'delegation_grants',   'has_many',   'delegation_grant',       'grantee_id',  'cascade'),
        ('principal', 'feature_grants',      'has_many',   'principal_feature_grant','principal_id', 'cascade'),

        -- ── IAM: auth_group ──────────────────────────────────────────────────
        ('auth_group', 'tenant',             'belongs_to', 'tenant',                'tenant_id',    'restrict'),
        ('auth_group', 'members',            'has_many',   'auth_group_member',     'auth_group_id', 'cascade'),
        ('auth_group', 'role_assignments',   'has_many',   'auth_group_role',       'auth_group_id', 'cascade'),

        -- ── IAM: team ────────────────────────────────────────────────────────
        ('team', 'tenant',                   'belongs_to', 'tenant',                'tenant_id',   'restrict'),
        ('team', 'members',                  'has_many',   'team_member',           'team_id',     'cascade'),

        -- ── IAM: access_grant ────────────────────────────────────────────────
        ('access_grant', 'tenant',           'belongs_to', 'tenant',                'tenant_id',   'restrict'),

        -- ── IAM: delegation_grant ────────────────────────────────────────────
        ('delegation_grant', 'tenant',       'belongs_to', 'tenant',                'tenant_id',   'restrict'),
        ('delegation_grant', 'grantee',      'belongs_to', 'principal',             'grantee_id',  'restrict'),

        -- ── IAM: label ───────────────────────────────────────────────────────
        ('label', 'tenant',                  'belongs_to', 'tenant',                'tenant_id',   'restrict'),

        -- ── IAM: address ─────────────────────────────────────────────────────
        ('address', 'tenant',                'belongs_to', 'tenant',                'tenant_id',   'restrict'),

        -- ── Finance org: legal_entity ─────────────────────────────────────────
        ('legal_entity', 'tenant',           'belongs_to', 'tenant',                'tenant_id',   'restrict'),
        ('legal_entity', 'company_codes',    'has_many',   'company_code',          'legal_entity_id','restrict'),

        -- ── Finance org: company_code ─────────────────────────────────────────
        ('company_code', 'tenant',           'belongs_to', 'tenant',                'tenant_id',       'restrict'),
        ('company_code', 'legal_entity',     'belongs_to', 'legal_entity',          'legal_entity_id', 'restrict'),
        ('company_code', 'business_units',   'has_many',   'business_unit',         'company_code_id', 'restrict'),
        ('company_code', 'cost_centers',     'has_many',   'cost_center',           'company_code_id', 'restrict'),
        ('company_code', 'profit_centers',   'has_many',   'profit_center',         'company_code_id', 'restrict'),
        ('company_code', 'warehouses',       'has_many',   'warehouse',             'company_code_id', 'restrict'),

        -- ── Finance org: business_unit ────────────────────────────────────────
        ('business_unit', 'company_code',    'belongs_to', 'company_code',          'company_code_id', 'restrict'),
        ('business_unit', 'cost_centers',    'has_many',   'cost_center',           'business_unit_id','restrict'),

        -- ── Finance org: cost_center ──────────────────────────────────────────
        ('cost_center', 'company_code',      'belongs_to', 'company_code',          'company_code_id', 'restrict'),

        -- ── Finance org: profit_center ────────────────────────────────────────
        ('profit_center', 'company_code',    'belongs_to', 'company_code',          'company_code_id', 'restrict'),

        -- ── COA / GL: chart_of_account ────────────────────────────────────────
        ('chart_of_account', 'tenant',       'belongs_to', 'tenant',                'tenant_id',           'restrict'),
        ('chart_of_account', 'gl_accounts',  'has_many',   'gl_account',            'chart_of_account_id', 'restrict'),

        -- ── COA / GL: gl_account ──────────────────────────────────────────────
        ('gl_account', 'chart_of_account',   'belongs_to', 'chart_of_account',      'chart_of_account_id', 'restrict'),
        ('gl_account', 'account_type',       'belongs_to', 'gl_account_type',       'account_type_id',     'restrict'),
        ('gl_account', 'tenant',             'belongs_to', 'tenant',                'tenant_id',           'restrict'),
        ('gl_account', 'hierarchy',          'belongs_to', 'gl_account_hierarchy',  'parent_id',           'set_null'),

        -- ── Business partners: customer ───────────────────────────────────────
        ('customer', 'tenant',               'belongs_to', 'tenant',                'tenant_id',   'restrict'),
        ('customer', 'company_profiles',     'has_many',   'company_code_customer_profile','customer_id','cascade'),

        -- ── Business partners: supplier ───────────────────────────────────────
        ('supplier', 'tenant',               'belongs_to', 'tenant',                'tenant_id',   'restrict'),
        ('supplier', 'company_profiles',     'has_many',   'company_code_supplier_profile','supplier_id','cascade'),

        -- ── Business partners: employee ───────────────────────────────────────
        ('employee', 'tenant',               'belongs_to', 'tenant',                'tenant_id',   'restrict'),
        ('employee', 'principal',            'belongs_to', 'principal',             'principal_id','set_null'),

        -- ── Assets ────────────────────────────────────────────────────────────
        ('asset', 'asset_class',             'belongs_to', 'asset_class',           'asset_class_id', 'restrict'),
        ('asset', 'company_code',            'belongs_to', 'company_code',          'company_code_id','restrict'),
        ('asset', 'books',                   'has_many',   'asset_book',            'asset_id',       'cascade'),
        ('asset', 'components',              'has_many',   'asset_component',       'asset_id',       'cascade'),

        -- ── Dimensions ────────────────────────────────────────────────────────
        ('dimension_value', 'dimension_type','belongs_to', 'dimension_type',        'dimension_type_id','restrict'),
        ('dimension_value', 'parent',        'belongs_to', 'dimension_value',       'parent_id',        'set_null'),

        -- ── Tax ───────────────────────────────────────────────────────────────
        ('tax_type', 'tenant',               'belongs_to', 'tenant',                'tenant_id',   'restrict'),
        ('tax_jurisdiction', 'tenant',       'belongs_to', 'tenant',                'tenant_id',   'restrict'),

        -- ── Budget ────────────────────────────────────────────────────────────
        ('budget_profile', 'tenant',         'belongs_to', 'tenant',                'tenant_id',   'restrict'),
        ('budget_allocation', 'budget_profile', 'belongs_to','budget_profile',      'budget_profile_id', 'restrict'),
        ('budget_allocation', 'fiscal_period',  'belongs_to','fiscal_period',       'fiscal_period_id',  'restrict'),
        ('budget_allocation', 'company_code',   'belongs_to','company_code',        'company_code_id',   'restrict'),

        -- ── Project ───────────────────────────────────────────────────────────
        ('project', 'tenant',                'belongs_to', 'tenant',                'tenant_id',       'restrict'),
        ('project', 'company_code',          'belongs_to', 'company_code',          'company_code_id', 'restrict'),
        ('project', 'items',                 'has_many',   'project_item',          'project_id',      'cascade'),

        -- ── Fiscal period ─────────────────────────────────────────────────────
        ('fiscal_period', 'tenant',          'belongs_to', 'tenant',                'tenant_id',       'restrict'),
        ('fiscal_period', 'company_code',    'belongs_to', 'company_code',          'company_code_id', 'restrict'),

        -- ── Banking ───────────────────────────────────────────────────────────
        ('bank_account', 'bank_party',       'belongs_to', 'bank_party',            'bank_party_id',   'restrict'),
        ('bank_account', 'tenant',           'belongs_to', 'tenant',                'tenant_id',       'restrict'),
        ('bank_party', 'accounts',           'has_many',   'bank_account',          'bank_party_id',   'restrict'),

        -- ── Payment terms ─────────────────────────────────────────────────────
        ('payment_term', 'tenant',           'belongs_to', 'tenant',                'tenant_id',       'restrict'),
        ('payment_term', 'clauses',          'has_many',   'payment_term_clause',   'payment_term_id', 'cascade'),
        ('payment_term', 'discount_tiers',   'has_many',   'payment_term_discount_tier','payment_term_id','cascade'),

        -- ── Products ──────────────────────────────────────────────────────────
        ('product', 'tenant',                'belongs_to', 'tenant',                'tenant_id',   'restrict'),
        ('item', 'tenant',                   'belongs_to', 'tenant',                'tenant_id',   'restrict'),
        ('item', 'category',                 'belongs_to', 'item_category',         'category_id', 'set_null'),

        -- ── Templates & workflow ──────────────────────────────────────────────
        ('document_template', 'tenant',      'belongs_to', 'tenant',                'tenant_id',  'restrict'),
        ('document_template', 'clauses',     'has_many',   'document_template_clause','template_id','cascade'),
        ('workflow_template', 'tenant',      'belongs_to', 'tenant',                'tenant_id',  'restrict'),
        ('workflow_template', 'stages',      'has_many',   'workflow_template_stage','template_id','cascade'),

        -- ── CMS: content_item ─────────────────────────────────────────────────
        ('content_item', 'tenant',           'belongs_to', 'tenant',                'tenant_id',        'restrict'),
        ('content_item', 'links',            'has_many',   'content_item_link',     'content_item_id',  'cascade'),
        ('content_item', 'access_grants',    'has_many',   'content_item_access_grant','content_item_id','cascade'),

        -- ── UI: dashboard ─────────────────────────────────────────────────────
        ('dashboard', 'tenant',              'belongs_to', 'tenant',                'tenant_id',    'restrict'),
        ('dashboard', 'widgets',             'has_many',   'dashboard_widget',      'dashboard_id', 'cascade')

    ) AS r(entity, rel_name, kind, target_entity, fk_field, on_del)
    JOIN control.entity         e  ON e.name       = r.entity
    JOIN control.entity_version ev ON ev.entity_id = e.id AND ev.version_no = 1
    ON CONFLICT (entity_version_id, name) DO NOTHING;

    GET DIAGNOSTICS cnt = ROW_COUNT;
    RAISE NOTICE 'control.entity_relation: % rows inserted (% total)',
        cnt,
        (SELECT count(*) FROM control.entity_relation);
END $$;

