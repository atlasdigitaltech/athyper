/* ============================================================================
   Athyper — STANDARD SEED DATA
   Reference data, operations, personas, modules, workspaces, i18n labels.
   This file contains data required for ALL deployments (standard + production).

   PostgreSQL 16+
   Depends on: 001_schemas.sql through 195_tax.sql (DDL)

   Execution order (dependency chain):
     §1  ref.country (ISO 3166-1)
     §2  ref.state_region (ISO 3166-2)
     §3  ref.currency (ISO 4217)
     §4  ref.language (ISO 639)
     §5  ref.locale (BCP 47)
     §6  ref.timezone (IANA tzdb)
     §7  ref.uom (UN/ECE Rec 20)
     §8  ref.commodity_domain + commodity_code (UNSPSC/HS)
     §9  ref.industry_domain + industry_code (ISIC/NAICS)
     §10 ref.label — i18n: persona labels (ar, ms, ta, hi, fr, de)
     §17 core.operation_category + operation (operations seed)
     §18 core.persona + persona_capability (personas seed)
     §19 core.module (modules seed)
     §20 core.workspace + module linkage (workspaces seed)
     §21 Notification channels
     §22 Persona i18n labels
   ============================================================================ */
begin;

-- ============================================================================
-- §1  COUNTRIES (ISO 3166-1)
-- ============================================================================

/* ============================================================================
   Athyper — REF Seed: Countries (ISO 3166-1)
   PostgreSQL 16+

   Complete list of ISO 3166-1 country codes with UN M49 regions.
   Depends on: 010_ref_master_tables.sql
   ============================================================================ */

-- ============================================================================
-- AFRICA
-- ============================================================================
insert into ref.country (code2, code3, numeric3, name, official_name, region, subregion, created_by)
values
  ('DZ','DZA','012','Algeria','People''s Democratic Republic of Algeria','Africa','Northern Africa','seed'),
  ('AO','AGO','024','Angola','Republic of Angola','Africa','Sub-Saharan Africa','seed'),
  ('BJ','BEN','204','Benin','Republic of Benin','Africa','Sub-Saharan Africa','seed'),
  ('BW','BWA','072','Botswana','Republic of Botswana','Africa','Sub-Saharan Africa','seed'),
  ('BF','BFA','854','Burkina Faso','Burkina Faso','Africa','Sub-Saharan Africa','seed'),
  ('BI','BDI','108','Burundi','Republic of Burundi','Africa','Sub-Saharan Africa','seed'),
  ('CV','CPV','132','Cabo Verde','Republic of Cabo Verde','Africa','Sub-Saharan Africa','seed'),
  ('CM','CMR','120','Cameroon','Republic of Cameroon','Africa','Sub-Saharan Africa','seed'),
  ('CF','CAF','140','Central African Republic','Central African Republic','Africa','Sub-Saharan Africa','seed'),
  ('TD','TCD','148','Chad','Republic of Chad','Africa','Sub-Saharan Africa','seed'),
  ('KM','COM','174','Comoros','Union of the Comoros','Africa','Sub-Saharan Africa','seed'),
  ('CG','COG','178','Congo','Republic of the Congo','Africa','Sub-Saharan Africa','seed'),
  ('CD','COD','180','Congo (Democratic Republic)','Democratic Republic of the Congo','Africa','Sub-Saharan Africa','seed'),
  ('CI','CIV','384','Côte d''Ivoire','Republic of Côte d''Ivoire','Africa','Sub-Saharan Africa','seed'),
  ('DJ','DJI','262','Djibouti','Republic of Djibouti','Africa','Sub-Saharan Africa','seed'),
  ('EG','EGY','818','Egypt','Arab Republic of Egypt','Africa','Northern Africa','seed'),
  ('GQ','GNQ','226','Equatorial Guinea','Republic of Equatorial Guinea','Africa','Sub-Saharan Africa','seed'),
  ('ER','ERI','232','Eritrea','State of Eritrea','Africa','Sub-Saharan Africa','seed'),
  ('SZ','SWZ','748','Eswatini','Kingdom of Eswatini','Africa','Sub-Saharan Africa','seed'),
  ('ET','ETH','231','Ethiopia','Federal Democratic Republic of Ethiopia','Africa','Sub-Saharan Africa','seed'),
  ('GA','GAB','266','Gabon','Gabonese Republic','Africa','Sub-Saharan Africa','seed'),
  ('GM','GMB','270','Gambia','Republic of the Gambia','Africa','Sub-Saharan Africa','seed'),
  ('GH','GHA','288','Ghana','Republic of Ghana','Africa','Sub-Saharan Africa','seed'),
  ('GN','GIN','324','Guinea','Republic of Guinea','Africa','Sub-Saharan Africa','seed'),
  ('GW','GNB','624','Guinea-Bissau','Republic of Guinea-Bissau','Africa','Sub-Saharan Africa','seed'),
  ('KE','KEN','404','Kenya','Republic of Kenya','Africa','Sub-Saharan Africa','seed'),
  ('LS','LSO','426','Lesotho','Kingdom of Lesotho','Africa','Sub-Saharan Africa','seed'),
  ('LR','LBR','430','Liberia','Republic of Liberia','Africa','Sub-Saharan Africa','seed'),
  ('LY','LBY','434','Libya','State of Libya','Africa','Northern Africa','seed'),
  ('MG','MDG','450','Madagascar','Republic of Madagascar','Africa','Sub-Saharan Africa','seed'),
  ('MW','MWI','454','Malawi','Republic of Malawi','Africa','Sub-Saharan Africa','seed'),
  ('ML','MLI','466','Mali','Republic of Mali','Africa','Sub-Saharan Africa','seed'),
  ('MR','MRT','478','Mauritania','Islamic Republic of Mauritania','Africa','Sub-Saharan Africa','seed'),
  ('MU','MUS','480','Mauritius','Republic of Mauritius','Africa','Sub-Saharan Africa','seed'),
  ('YT','MYT','175','Mayotte',null,'Africa','Sub-Saharan Africa','seed'),
  ('MA','MAR','504','Morocco','Kingdom of Morocco','Africa','Northern Africa','seed'),
  ('MZ','MOZ','508','Mozambique','Republic of Mozambique','Africa','Sub-Saharan Africa','seed'),
  ('NA','NAM','516','Namibia','Republic of Namibia','Africa','Sub-Saharan Africa','seed'),
  ('NE','NER','562','Niger','Republic of the Niger','Africa','Sub-Saharan Africa','seed'),
  ('NG','NGA','566','Nigeria','Federal Republic of Nigeria','Africa','Sub-Saharan Africa','seed'),
  ('RE','REU','638','Réunion',null,'Africa','Sub-Saharan Africa','seed'),
  ('RW','RWA','646','Rwanda','Republic of Rwanda','Africa','Sub-Saharan Africa','seed'),
  ('ST','STP','678','São Tomé and Príncipe','Democratic Republic of São Tomé and Príncipe','Africa','Sub-Saharan Africa','seed'),
  ('SN','SEN','686','Senegal','Republic of Senegal','Africa','Sub-Saharan Africa','seed'),
  ('SC','SYC','690','Seychelles','Republic of Seychelles','Africa','Sub-Saharan Africa','seed'),
  ('SL','SLE','694','Sierra Leone','Republic of Sierra Leone','Africa','Sub-Saharan Africa','seed'),
  ('SO','SOM','706','Somalia','Federal Republic of Somalia','Africa','Sub-Saharan Africa','seed'),
  ('ZA','ZAF','710','South Africa','Republic of South Africa','Africa','Sub-Saharan Africa','seed'),
  ('SS','SSD','728','South Sudan','Republic of South Sudan','Africa','Sub-Saharan Africa','seed'),
  ('SD','SDN','729','Sudan','Republic of the Sudan','Africa','Northern Africa','seed'),
  ('TZ','TZA','834','Tanzania','United Republic of Tanzania','Africa','Sub-Saharan Africa','seed'),
  ('TG','TGO','768','Togo','Togolese Republic','Africa','Sub-Saharan Africa','seed'),
  ('TN','TUN','788','Tunisia','Republic of Tunisia','Africa','Northern Africa','seed'),
  ('UG','UGA','800','Uganda','Republic of Uganda','Africa','Sub-Saharan Africa','seed'),
  ('EH','ESH','732','Western Sahara',null,'Africa','Northern Africa','seed'),
  ('ZM','ZMB','894','Zambia','Republic of Zambia','Africa','Sub-Saharan Africa','seed'),
  ('ZW','ZWE','716','Zimbabwe','Republic of Zimbabwe','Africa','Sub-Saharan Africa','seed')
on conflict (code2) do nothing;

-- ============================================================================
-- AMERICAS
-- ============================================================================
insert into ref.country (code2, code3, numeric3, name, official_name, region, subregion, created_by)
values
  -- Caribbean
  ('AI','AIA','660','Anguilla',null,'Americas','Caribbean','seed'),
  ('AG','ATG','028','Antigua and Barbuda',null,'Americas','Caribbean','seed'),
  ('AW','ABW','533','Aruba',null,'Americas','Caribbean','seed'),
  ('BS','BHS','044','Bahamas','Commonwealth of the Bahamas','Americas','Caribbean','seed'),
  ('BB','BRB','052','Barbados',null,'Americas','Caribbean','seed'),
  ('BQ','BES','535','Bonaire, Sint Eustatius and Saba',null,'Americas','Caribbean','seed'),
  ('VG','VGB','092','British Virgin Islands',null,'Americas','Caribbean','seed'),
  ('KY','CYM','136','Cayman Islands',null,'Americas','Caribbean','seed'),
  ('CU','CUB','192','Cuba','Republic of Cuba','Americas','Caribbean','seed'),
  ('CW','CUW','531','Curaçao',null,'Americas','Caribbean','seed'),
  ('DM','DMA','212','Dominica','Commonwealth of Dominica','Americas','Caribbean','seed'),
  ('DO','DOM','214','Dominican Republic',null,'Americas','Caribbean','seed'),
  ('GD','GRD','308','Grenada',null,'Americas','Caribbean','seed'),
  ('GP','GLP','312','Guadeloupe',null,'Americas','Caribbean','seed'),
  ('HT','HTI','332','Haiti','Republic of Haiti','Americas','Caribbean','seed'),
  ('JM','JAM','388','Jamaica',null,'Americas','Caribbean','seed'),
  ('MQ','MTQ','474','Martinique',null,'Americas','Caribbean','seed'),
  ('MS','MSR','500','Montserrat',null,'Americas','Caribbean','seed'),
  ('PR','PRI','630','Puerto Rico',null,'Americas','Caribbean','seed'),
  ('BL','BLM','652','Saint Barthélemy',null,'Americas','Caribbean','seed'),
  ('KN','KNA','659','Saint Kitts and Nevis',null,'Americas','Caribbean','seed'),
  ('LC','LCA','662','Saint Lucia',null,'Americas','Caribbean','seed'),
  ('MF','MAF','663','Saint Martin (French part)',null,'Americas','Caribbean','seed'),
  ('VC','VCT','670','Saint Vincent and the Grenadines',null,'Americas','Caribbean','seed'),
  ('SX','SXM','534','Sint Maarten (Dutch part)',null,'Americas','Caribbean','seed'),
  ('TT','TTO','780','Trinidad and Tobago','Republic of Trinidad and Tobago','Americas','Caribbean','seed'),
  ('TC','TCA','796','Turks and Caicos Islands',null,'Americas','Caribbean','seed'),
  ('VI','VIR','850','United States Virgin Islands',null,'Americas','Caribbean','seed'),

  -- Central America
  ('BZ','BLZ','084','Belize',null,'Americas','Central America','seed'),
  ('CR','CRI','188','Costa Rica','Republic of Costa Rica','Americas','Central America','seed'),
  ('SV','SLV','222','El Salvador','Republic of El Salvador','Americas','Central America','seed'),
  ('GT','GTM','320','Guatemala','Republic of Guatemala','Americas','Central America','seed'),
  ('HN','HND','340','Honduras','Republic of Honduras','Americas','Central America','seed'),
  ('MX','MEX','484','Mexico','United Mexican States','Americas','Central America','seed'),
  ('NI','NIC','558','Nicaragua','Republic of Nicaragua','Americas','Central America','seed'),
  ('PA','PAN','591','Panama','Republic of Panama','Americas','Central America','seed'),

  -- South America
  ('AR','ARG','032','Argentina','Argentine Republic','Americas','South America','seed'),
  ('BO','BOL','068','Bolivia','Plurinational State of Bolivia','Americas','South America','seed'),
  ('BR','BRA','076','Brazil','Federative Republic of Brazil','Americas','South America','seed'),
  ('CL','CHL','152','Chile','Republic of Chile','Americas','South America','seed'),
  ('CO','COL','170','Colombia','Republic of Colombia','Americas','South America','seed'),
  ('EC','ECU','218','Ecuador','Republic of Ecuador','Americas','South America','seed'),
  ('FK','FLK','238','Falkland Islands (Malvinas)',null,'Americas','South America','seed'),
  ('GF','GUF','254','French Guiana',null,'Americas','South America','seed'),
  ('GY','GUY','328','Guyana','Co-operative Republic of Guyana','Americas','South America','seed'),
  ('PY','PRY','600','Paraguay','Republic of Paraguay','Americas','South America','seed'),
  ('PE','PER','604','Peru','Republic of Peru','Americas','South America','seed'),
  ('SR','SUR','740','Suriname','Republic of Suriname','Americas','South America','seed'),
  ('UY','URY','858','Uruguay','Eastern Republic of Uruguay','Americas','South America','seed'),
  ('VE','VEN','862','Venezuela','Bolivarian Republic of Venezuela','Americas','South America','seed'),

  -- Northern America
  ('BM','BMU','060','Bermuda',null,'Americas','Northern America','seed'),
  ('CA','CAN','124','Canada',null,'Americas','Northern America','seed'),
  ('GL','GRL','304','Greenland',null,'Americas','Northern America','seed'),
  ('PM','SPM','666','Saint Pierre and Miquelon',null,'Americas','Northern America','seed'),
  ('US','USA','840','United States of America',null,'Americas','Northern America','seed')
on conflict (code2) do nothing;

-- ============================================================================
-- ASIA
-- ============================================================================
insert into ref.country (code2, code3, numeric3, name, official_name, region, subregion, created_by)
values
  -- Central Asia
  ('KZ','KAZ','398','Kazakhstan','Republic of Kazakhstan','Asia','Central Asia','seed'),
  ('KG','KGZ','417','Kyrgyzstan','Kyrgyz Republic','Asia','Central Asia','seed'),
  ('TJ','TJK','762','Tajikistan','Republic of Tajikistan','Asia','Central Asia','seed'),
  ('TM','TKM','795','Turkmenistan',null,'Asia','Central Asia','seed'),
  ('UZ','UZB','860','Uzbekistan','Republic of Uzbekistan','Asia','Central Asia','seed'),

  -- Eastern Asia
  ('CN','CHN','156','China','People''s Republic of China','Asia','Eastern Asia','seed'),
  ('HK','HKG','344','Hong Kong','Hong Kong Special Administrative Region of China','Asia','Eastern Asia','seed'),
  ('JP','JPN','392','Japan',null,'Asia','Eastern Asia','seed'),
  ('KP','PRK','408','Korea (Democratic People''s Republic)','Democratic People''s Republic of Korea','Asia','Eastern Asia','seed'),
  ('KR','KOR','410','Korea (Republic of)','Republic of Korea','Asia','Eastern Asia','seed'),
  ('MO','MAC','446','Macao','Macao Special Administrative Region of China','Asia','Eastern Asia','seed'),
  ('MN','MNG','496','Mongolia',null,'Asia','Eastern Asia','seed'),
  ('TW','TWN','158','Taiwan','Taiwan, Province of China','Asia','Eastern Asia','seed'),

  -- South-eastern Asia
  ('BN','BRN','096','Brunei Darussalam',null,'Asia','South-eastern Asia','seed'),
  ('KH','KHM','116','Cambodia','Kingdom of Cambodia','Asia','South-eastern Asia','seed'),
  ('ID','IDN','360','Indonesia','Republic of Indonesia','Asia','South-eastern Asia','seed'),
  ('LA','LAO','418','Lao People''s Democratic Republic',null,'Asia','South-eastern Asia','seed'),
  ('MY','MYS','458','Malaysia',null,'Asia','South-eastern Asia','seed'),
  ('MM','MMR','104','Myanmar','Republic of the Union of Myanmar','Asia','South-eastern Asia','seed'),
  ('PH','PHL','608','Philippines','Republic of the Philippines','Asia','South-eastern Asia','seed'),
  ('SG','SGP','702','Singapore','Republic of Singapore','Asia','South-eastern Asia','seed'),
  ('TH','THA','764','Thailand','Kingdom of Thailand','Asia','South-eastern Asia','seed'),
  ('TL','TLS','626','Timor-Leste','Democratic Republic of Timor-Leste','Asia','South-eastern Asia','seed'),
  ('VN','VNM','704','Viet Nam','Socialist Republic of Viet Nam','Asia','South-eastern Asia','seed'),

  -- Southern Asia
  ('AF','AFG','004','Afghanistan','Islamic Republic of Afghanistan','Asia','Southern Asia','seed'),
  ('BD','BGD','050','Bangladesh','People''s Republic of Bangladesh','Asia','Southern Asia','seed'),
  ('BT','BTN','064','Bhutan','Kingdom of Bhutan','Asia','Southern Asia','seed'),
  ('IN','IND','356','India','Republic of India','Asia','Southern Asia','seed'),
  ('IR','IRN','364','Iran','Islamic Republic of Iran','Asia','Southern Asia','seed'),
  ('MV','MDV','462','Maldives','Republic of Maldives','Asia','Southern Asia','seed'),
  ('NP','NPL','524','Nepal','Federal Democratic Republic of Nepal','Asia','Southern Asia','seed'),
  ('PK','PAK','586','Pakistan','Islamic Republic of Pakistan','Asia','Southern Asia','seed'),
  ('LK','LKA','144','Sri Lanka','Democratic Socialist Republic of Sri Lanka','Asia','Southern Asia','seed'),

  -- Western Asia
  ('AM','ARM','051','Armenia','Republic of Armenia','Asia','Western Asia','seed'),
  ('AZ','AZE','031','Azerbaijan','Republic of Azerbaijan','Asia','Western Asia','seed'),
  ('BH','BHR','048','Bahrain','Kingdom of Bahrain','Asia','Western Asia','seed'),
  ('CY','CYP','196','Cyprus','Republic of Cyprus','Asia','Western Asia','seed'),
  ('GE','GEO','268','Georgia',null,'Asia','Western Asia','seed'),
  ('IQ','IRQ','368','Iraq','Republic of Iraq','Asia','Western Asia','seed'),
  ('IL','ISR','376','Israel','State of Israel','Asia','Western Asia','seed'),
  ('JO','JOR','400','Jordan','Hashemite Kingdom of Jordan','Asia','Western Asia','seed'),
  ('KW','KWT','414','Kuwait','State of Kuwait','Asia','Western Asia','seed'),
  ('LB','LBN','422','Lebanon','Lebanese Republic','Asia','Western Asia','seed'),
  ('OM','OMN','512','Oman','Sultanate of Oman','Asia','Western Asia','seed'),
  ('PS','PSE','275','Palestine, State of',null,'Asia','Western Asia','seed'),
  ('QA','QAT','634','Qatar','State of Qatar','Asia','Western Asia','seed'),
  ('SA','SAU','682','Saudi Arabia','Kingdom of Saudi Arabia','Asia','Western Asia','seed'),
  ('SY','SYR','760','Syrian Arab Republic',null,'Asia','Western Asia','seed'),
  ('TR','TUR','792','Türkiye','Republic of Türkiye','Asia','Western Asia','seed'),
  ('AE','ARE','784','United Arab Emirates',null,'Asia','Western Asia','seed'),
  ('YE','YEM','887','Yemen','Republic of Yemen','Asia','Western Asia','seed')
on conflict (code2) do nothing;

-- ============================================================================
-- EUROPE
-- ============================================================================
insert into ref.country (code2, code3, numeric3, name, official_name, region, subregion, created_by)
values
  -- Eastern Europe
  ('BY','BLR','112','Belarus','Republic of Belarus','Europe','Eastern Europe','seed'),
  ('BG','BGR','100','Bulgaria','Republic of Bulgaria','Europe','Eastern Europe','seed'),
  ('CZ','CZE','203','Czechia','Czech Republic','Europe','Eastern Europe','seed'),
  ('HU','HUN','348','Hungary',null,'Europe','Eastern Europe','seed'),
  ('MD','MDA','498','Moldova','Republic of Moldova','Europe','Eastern Europe','seed'),
  ('PL','POL','616','Poland','Republic of Poland','Europe','Eastern Europe','seed'),
  ('RO','ROU','642','Romania',null,'Europe','Eastern Europe','seed'),
  ('RU','RUS','643','Russian Federation',null,'Europe','Eastern Europe','seed'),
  ('SK','SVK','703','Slovakia','Slovak Republic','Europe','Eastern Europe','seed'),
  ('UA','UKR','804','Ukraine',null,'Europe','Eastern Europe','seed'),

  -- Northern Europe
  ('AX','ALA','248','Åland Islands',null,'Europe','Northern Europe','seed'),
  ('DK','DNK','208','Denmark','Kingdom of Denmark','Europe','Northern Europe','seed'),
  ('EE','EST','233','Estonia','Republic of Estonia','Europe','Northern Europe','seed'),
  ('FO','FRO','234','Faroe Islands',null,'Europe','Northern Europe','seed'),
  ('FI','FIN','246','Finland','Republic of Finland','Europe','Northern Europe','seed'),
  ('GG','GGY','831','Guernsey',null,'Europe','Northern Europe','seed'),
  ('IS','ISL','352','Iceland','Republic of Iceland','Europe','Northern Europe','seed'),
  ('IE','IRL','372','Ireland',null,'Europe','Northern Europe','seed'),
  ('IM','IMN','833','Isle of Man',null,'Europe','Northern Europe','seed'),
  ('JE','JEY','832','Jersey',null,'Europe','Northern Europe','seed'),
  ('LV','LVA','428','Latvia','Republic of Latvia','Europe','Northern Europe','seed'),
  ('LT','LTU','440','Lithuania','Republic of Lithuania','Europe','Northern Europe','seed'),
  ('NO','NOR','578','Norway','Kingdom of Norway','Europe','Northern Europe','seed'),
  ('SJ','SJM','744','Svalbard and Jan Mayen',null,'Europe','Northern Europe','seed'),
  ('SE','SWE','752','Sweden','Kingdom of Sweden','Europe','Northern Europe','seed'),
  ('GB','GBR','826','United Kingdom','United Kingdom of Great Britain and Northern Ireland','Europe','Northern Europe','seed'),

  -- Southern Europe
  ('AL','ALB','008','Albania','Republic of Albania','Europe','Southern Europe','seed'),
  ('AD','AND','020','Andorra','Principality of Andorra','Europe','Southern Europe','seed'),
  ('BA','BIH','070','Bosnia and Herzegovina',null,'Europe','Southern Europe','seed'),
  ('HR','HRV','191','Croatia','Republic of Croatia','Europe','Southern Europe','seed'),
  ('GI','GIB','292','Gibraltar',null,'Europe','Southern Europe','seed'),
  ('GR','GRC','300','Greece','Hellenic Republic','Europe','Southern Europe','seed'),
  ('VA','VAT','336','Holy See',null,'Europe','Southern Europe','seed'),
  ('IT','ITA','380','Italy','Italian Republic','Europe','Southern Europe','seed'),
  ('XK','XKX','983','Kosovo','Republic of Kosovo','Europe','Southern Europe','seed'),
  ('MT','MLT','470','Malta','Republic of Malta','Europe','Southern Europe','seed'),
  ('ME','MNE','499','Montenegro',null,'Europe','Southern Europe','seed'),
  ('MK','MKD','807','North Macedonia','Republic of North Macedonia','Europe','Southern Europe','seed'),
  ('PT','PRT','620','Portugal','Portuguese Republic','Europe','Southern Europe','seed'),
  ('SM','SMR','674','San Marino','Republic of San Marino','Europe','Southern Europe','seed'),
  ('RS','SRB','688','Serbia','Republic of Serbia','Europe','Southern Europe','seed'),
  ('SI','SVN','705','Slovenia','Republic of Slovenia','Europe','Southern Europe','seed'),
  ('ES','ESP','724','Spain','Kingdom of Spain','Europe','Southern Europe','seed'),

  -- Western Europe
  ('AT','AUT','040','Austria','Republic of Austria','Europe','Western Europe','seed'),
  ('BE','BEL','056','Belgium','Kingdom of Belgium','Europe','Western Europe','seed'),
  ('FR','FRA','250','France','French Republic','Europe','Western Europe','seed'),
  ('DE','DEU','276','Germany','Federal Republic of Germany','Europe','Western Europe','seed'),
  ('LI','LIE','438','Liechtenstein','Principality of Liechtenstein','Europe','Western Europe','seed'),
  ('LU','LUX','442','Luxembourg','Grand Duchy of Luxembourg','Europe','Western Europe','seed'),
  ('MC','MCO','492','Monaco','Principality of Monaco','Europe','Western Europe','seed'),
  ('NL','NLD','528','Netherlands','Kingdom of the Netherlands','Europe','Western Europe','seed'),
  ('CH','CHE','756','Switzerland','Swiss Confederation','Europe','Western Europe','seed')
on conflict (code2) do nothing;

-- ============================================================================
-- OCEANIA
-- ============================================================================
insert into ref.country (code2, code3, numeric3, name, official_name, region, subregion, created_by)
values
  -- Australia and New Zealand
  ('AU','AUS','036','Australia','Commonwealth of Australia','Oceania','Australia and New Zealand','seed'),
  ('CX','CXR','162','Christmas Island',null,'Oceania','Australia and New Zealand','seed'),
  ('CC','CCK','166','Cocos (Keeling) Islands',null,'Oceania','Australia and New Zealand','seed'),
  ('HM','HMD','334','Heard Island and McDonald Islands',null,'Oceania','Australia and New Zealand','seed'),
  ('NF','NFK','574','Norfolk Island',null,'Oceania','Australia and New Zealand','seed'),
  ('NZ','NZL','554','New Zealand',null,'Oceania','Australia and New Zealand','seed'),

  -- Melanesia
  ('FJ','FJI','242','Fiji','Republic of Fiji','Oceania','Melanesia','seed'),
  ('NC','NCL','540','New Caledonia',null,'Oceania','Melanesia','seed'),
  ('PG','PNG','598','Papua New Guinea','Independent State of Papua New Guinea','Oceania','Melanesia','seed'),
  ('SB','SLB','090','Solomon Islands',null,'Oceania','Melanesia','seed'),
  ('VU','VUT','548','Vanuatu','Republic of Vanuatu','Oceania','Melanesia','seed'),

  -- Micronesia
  ('GU','GUM','316','Guam',null,'Oceania','Micronesia','seed'),
  ('KI','KIR','296','Kiribati','Republic of Kiribati','Oceania','Micronesia','seed'),
  ('MH','MHL','584','Marshall Islands','Republic of the Marshall Islands','Oceania','Micronesia','seed'),
  ('FM','FSM','583','Micronesia (Federated States of)',null,'Oceania','Micronesia','seed'),
  ('NR','NRU','520','Nauru','Republic of Nauru','Oceania','Micronesia','seed'),
  ('MP','MNP','580','Northern Mariana Islands','Commonwealth of the Northern Mariana Islands','Oceania','Micronesia','seed'),
  ('PW','PLW','585','Palau','Republic of Palau','Oceania','Micronesia','seed'),

  -- Polynesia
  ('AS','ASM','016','American Samoa',null,'Oceania','Polynesia','seed'),
  ('CK','COK','184','Cook Islands',null,'Oceania','Polynesia','seed'),
  ('PF','PYF','258','French Polynesia',null,'Oceania','Polynesia','seed'),
  ('NU','NIU','570','Niue',null,'Oceania','Polynesia','seed'),
  ('PN','PCN','612','Pitcairn',null,'Oceania','Polynesia','seed'),
  ('WS','WSM','882','Samoa','Independent State of Samoa','Oceania','Polynesia','seed'),
  ('TK','TKL','772','Tokelau',null,'Oceania','Polynesia','seed'),
  ('TO','TON','776','Tonga','Kingdom of Tonga','Oceania','Polynesia','seed'),
  ('TV','TUV','798','Tuvalu',null,'Oceania','Polynesia','seed'),
  ('WF','WLF','876','Wallis and Futuna',null,'Oceania','Polynesia','seed')
on conflict (code2) do nothing;

-- ============================================================================
-- ANTARCTICA
-- ============================================================================
insert into ref.country (code2, code3, numeric3, name, official_name, region, subregion, created_by)
values
  ('AQ','ATA','010','Antarctica',null,'Antarctica',null,'seed'),
  ('BV','BVT','074','Bouvet Island',null,'Antarctica',null,'seed'),
  ('TF','ATF','260','French Southern Territories',null,'Antarctica',null,'seed'),
  ('GS','SGS','239','South Georgia and the South Sandwich Islands',null,'Antarctica',null,'seed')
on conflict (code2) do nothing;

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
insert into ref.state_region (code, country_code2, name, category, created_by)
values
  ('SA-01','SA','Riyadh','region','seed'),
  ('SA-02','SA','Makkah','region','seed'),
  ('SA-03','SA','Al Madinah','region','seed'),
  ('SA-04','SA','Eastern','region','seed'),
  ('SA-05','SA','Al-Qassim','region','seed'),
  ('SA-06','SA','Ha''il','region','seed'),
  ('SA-07','SA','Tabuk','region','seed'),
  ('SA-08','SA','Northern Borders','region','seed'),
  ('SA-09','SA','Jazan','region','seed'),
  ('SA-10','SA','Najran','region','seed'),
  ('SA-11','SA','Al Bahah','region','seed'),
  ('SA-12','SA','Al Jawf','region','seed'),
  ('SA-14','SA','Asir','region','seed')
on conflict (code) do nothing;

-- ============================================================================
-- United Arab Emirates (AE) — 7 emirates
-- ============================================================================
insert into ref.state_region (code, country_code2, name, category, created_by)
values
  ('AE-AZ','AE','Abu Dhabi','emirate','seed'),
  ('AE-DU','AE','Dubai','emirate','seed'),
  ('AE-SH','AE','Sharjah','emirate','seed'),
  ('AE-AJ','AE','Ajman','emirate','seed'),
  ('AE-UQ','AE','Umm al-Quwain','emirate','seed'),
  ('AE-RK','AE','Ras al-Khaimah','emirate','seed'),
  ('AE-FU','AE','Fujairah','emirate','seed')
on conflict (code) do nothing;

-- ============================================================================
-- United States (US) — 50 states + DC
-- ============================================================================
insert into ref.state_region (code, country_code2, name, category, created_by)
values
  ('US-AL','US','Alabama','state','seed'),
  ('US-AK','US','Alaska','state','seed'),
  ('US-AZ','US','Arizona','state','seed'),
  ('US-AR','US','Arkansas','state','seed'),
  ('US-CA','US','California','state','seed'),
  ('US-CO','US','Colorado','state','seed'),
  ('US-CT','US','Connecticut','state','seed'),
  ('US-DE','US','Delaware','state','seed'),
  ('US-FL','US','Florida','state','seed'),
  ('US-GA','US','Georgia','state','seed'),
  ('US-HI','US','Hawaii','state','seed'),
  ('US-ID','US','Idaho','state','seed'),
  ('US-IL','US','Illinois','state','seed'),
  ('US-IN','US','Indiana','state','seed'),
  ('US-IA','US','Iowa','state','seed'),
  ('US-KS','US','Kansas','state','seed'),
  ('US-KY','US','Kentucky','state','seed'),
  ('US-LA','US','Louisiana','state','seed'),
  ('US-ME','US','Maine','state','seed'),
  ('US-MD','US','Maryland','state','seed'),
  ('US-MA','US','Massachusetts','state','seed'),
  ('US-MI','US','Michigan','state','seed'),
  ('US-MN','US','Minnesota','state','seed'),
  ('US-MS','US','Mississippi','state','seed'),
  ('US-MO','US','Missouri','state','seed'),
  ('US-MT','US','Montana','state','seed'),
  ('US-NE','US','Nebraska','state','seed'),
  ('US-NV','US','Nevada','state','seed'),
  ('US-NH','US','New Hampshire','state','seed'),
  ('US-NJ','US','New Jersey','state','seed'),
  ('US-NM','US','New Mexico','state','seed'),
  ('US-NY','US','New York','state','seed'),
  ('US-NC','US','North Carolina','state','seed'),
  ('US-ND','US','North Dakota','state','seed'),
  ('US-OH','US','Ohio','state','seed'),
  ('US-OK','US','Oklahoma','state','seed'),
  ('US-OR','US','Oregon','state','seed'),
  ('US-PA','US','Pennsylvania','state','seed'),
  ('US-RI','US','Rhode Island','state','seed'),
  ('US-SC','US','South Carolina','state','seed'),
  ('US-SD','US','South Dakota','state','seed'),
  ('US-TN','US','Tennessee','state','seed'),
  ('US-TX','US','Texas','state','seed'),
  ('US-UT','US','Utah','state','seed'),
  ('US-VT','US','Vermont','state','seed'),
  ('US-VA','US','Virginia','state','seed'),
  ('US-WA','US','Washington','state','seed'),
  ('US-WV','US','West Virginia','state','seed'),
  ('US-WI','US','Wisconsin','state','seed'),
  ('US-WY','US','Wyoming','state','seed'),
  ('US-DC','US','District of Columbia','district','seed')
on conflict (code) do nothing;

-- ============================================================================
-- United Kingdom (GB) — 4 countries
-- ============================================================================
insert into ref.state_region (code, country_code2, name, category, created_by)
values
  ('GB-ENG','GB','England','country','seed'),
  ('GB-SCT','GB','Scotland','country','seed'),
  ('GB-WLS','GB','Wales','country','seed'),
  ('GB-NIR','GB','Northern Ireland','country','seed')
on conflict (code) do nothing;

-- ============================================================================
-- India (IN) — 28 states + 8 union territories
-- ============================================================================
insert into ref.state_region (code, country_code2, name, category, created_by)
values
  ('IN-AP','IN','Andhra Pradesh','state','seed'),
  ('IN-AR','IN','Arunachal Pradesh','state','seed'),
  ('IN-AS','IN','Assam','state','seed'),
  ('IN-BR','IN','Bihar','state','seed'),
  ('IN-CT','IN','Chhattisgarh','state','seed'),
  ('IN-GA','IN','Goa','state','seed'),
  ('IN-GJ','IN','Gujarat','state','seed'),
  ('IN-HR','IN','Haryana','state','seed'),
  ('IN-HP','IN','Himachal Pradesh','state','seed'),
  ('IN-JH','IN','Jharkhand','state','seed'),
  ('IN-KA','IN','Karnataka','state','seed'),
  ('IN-KL','IN','Kerala','state','seed'),
  ('IN-MP','IN','Madhya Pradesh','state','seed'),
  ('IN-MH','IN','Maharashtra','state','seed'),
  ('IN-MN','IN','Manipur','state','seed'),
  ('IN-ML','IN','Meghalaya','state','seed'),
  ('IN-MZ','IN','Mizoram','state','seed'),
  ('IN-NL','IN','Nagaland','state','seed'),
  ('IN-OR','IN','Odisha','state','seed'),
  ('IN-PB','IN','Punjab','state','seed'),
  ('IN-RJ','IN','Rajasthan','state','seed'),
  ('IN-SK','IN','Sikkim','state','seed'),
  ('IN-TN','IN','Tamil Nadu','state','seed'),
  ('IN-TG','IN','Telangana','state','seed'),
  ('IN-TR','IN','Tripura','state','seed'),
  ('IN-UP','IN','Uttar Pradesh','state','seed'),
  ('IN-UT','IN','Uttarakhand','state','seed'),
  ('IN-WB','IN','West Bengal','state','seed'),
  -- Union Territories
  ('IN-AN','IN','Andaman and Nicobar Islands','union territory','seed'),
  ('IN-CH','IN','Chandigarh','union territory','seed'),
  ('IN-DH','IN','Dadra and Nagar Haveli and Daman and Diu','union territory','seed'),
  ('IN-DL','IN','Delhi','union territory','seed'),
  ('IN-JK','IN','Jammu and Kashmir','union territory','seed'),
  ('IN-LA','IN','Ladakh','union territory','seed'),
  ('IN-LD','IN','Lakshadweep','union territory','seed'),
  ('IN-PY','IN','Puducherry','union territory','seed')
on conflict (code) do nothing;

-- ============================================================================
-- Germany (DE) — 16 states
-- ============================================================================
insert into ref.state_region (code, country_code2, name, category, created_by)
values
  ('DE-BW','DE','Baden-Württemberg','state','seed'),
  ('DE-BY','DE','Bavaria','state','seed'),
  ('DE-BE','DE','Berlin','state','seed'),
  ('DE-BB','DE','Brandenburg','state','seed'),
  ('DE-HB','DE','Bremen','state','seed'),
  ('DE-HH','DE','Hamburg','state','seed'),
  ('DE-HE','DE','Hesse','state','seed'),
  ('DE-MV','DE','Mecklenburg-Vorpommern','state','seed'),
  ('DE-NI','DE','Lower Saxony','state','seed'),
  ('DE-NW','DE','North Rhine-Westphalia','state','seed'),
  ('DE-RP','DE','Rhineland-Palatinate','state','seed'),
  ('DE-SL','DE','Saarland','state','seed'),
  ('DE-SN','DE','Saxony','state','seed'),
  ('DE-ST','DE','Saxony-Anhalt','state','seed'),
  ('DE-SH','DE','Schleswig-Holstein','state','seed'),
  ('DE-TH','DE','Thuringia','state','seed')
on conflict (code) do nothing;

-- ============================================================================
-- France (FR) — 13 metropolitan + 5 overseas regions
-- ============================================================================
insert into ref.state_region (code, country_code2, name, category, created_by)
values
  ('FR-ARA','FR','Auvergne-Rhône-Alpes','region','seed'),
  ('FR-BFC','FR','Bourgogne-Franche-Comté','region','seed'),
  ('FR-BRE','FR','Bretagne','region','seed'),
  ('FR-CVL','FR','Centre-Val de Loire','region','seed'),
  ('FR-COR','FR','Corse','region','seed'),
  ('FR-GES','FR','Grand Est','region','seed'),
  ('FR-HDF','FR','Hauts-de-France','region','seed'),
  ('FR-IDF','FR','Île-de-France','region','seed'),
  ('FR-NOR','FR','Normandie','region','seed'),
  ('FR-NAQ','FR','Nouvelle-Aquitaine','region','seed'),
  ('FR-OCC','FR','Occitanie','region','seed'),
  ('FR-PDL','FR','Pays de la Loire','region','seed'),
  ('FR-PAC','FR','Provence-Alpes-Côte d''Azur','region','seed'),
  ('FR-GUA','FR','Guadeloupe','region','seed'),
  ('FR-GUF','FR','Guyane','region','seed'),
  ('FR-MTQ','FR','Martinique','region','seed'),
  ('FR-LRE','FR','La Réunion','region','seed'),
  ('FR-MAY','FR','Mayotte','region','seed')
on conflict (code) do nothing;

-- ============================================================================
-- Egypt (EG) — 27 governorates
-- ============================================================================
insert into ref.state_region (code, country_code2, name, category, created_by)
values
  ('EG-ALX','EG','Alexandria','governorate','seed'),
  ('EG-ASN','EG','Aswan','governorate','seed'),
  ('EG-AST','EG','Asyut','governorate','seed'),
  ('EG-BH','EG','Beheira','governorate','seed'),
  ('EG-BNS','EG','Beni Suef','governorate','seed'),
  ('EG-C','EG','Cairo','governorate','seed'),
  ('EG-DK','EG','Dakahlia','governorate','seed'),
  ('EG-DT','EG','Damietta','governorate','seed'),
  ('EG-FYM','EG','Faiyum','governorate','seed'),
  ('EG-GH','EG','Gharbia','governorate','seed'),
  ('EG-GZ','EG','Giza','governorate','seed'),
  ('EG-IS','EG','Ismailia','governorate','seed'),
  ('EG-KFS','EG','Kafr el-Sheikh','governorate','seed'),
  ('EG-LX','EG','Luxor','governorate','seed'),
  ('EG-MN','EG','Minya','governorate','seed'),
  ('EG-MNF','EG','Monufia','governorate','seed'),
  ('EG-MT','EG','Matrouh','governorate','seed'),
  ('EG-PTS','EG','Port Said','governorate','seed'),
  ('EG-KB','EG','Qalyubia','governorate','seed'),
  ('EG-KN','EG','Qena','governorate','seed'),
  ('EG-WAD','EG','New Valley','governorate','seed'),
  ('EG-SIN','EG','North Sinai','governorate','seed'),
  ('EG-SHR','EG','Red Sea','governorate','seed'),
  ('EG-SHG','EG','Sohag','governorate','seed'),
  ('EG-JS','EG','South Sinai','governorate','seed'),
  ('EG-SUZ','EG','Suez','governorate','seed'),
  ('EG-HU','EG','Helwan','governorate','seed')
on conflict (code) do nothing;

-- ============================================================================
-- Japan (JP) — 47 prefectures
-- ============================================================================
insert into ref.state_region (code, country_code2, name, category, created_by)
values
  ('JP-01','JP','Hokkaido','prefecture','seed'),
  ('JP-02','JP','Aomori','prefecture','seed'),
  ('JP-03','JP','Iwate','prefecture','seed'),
  ('JP-04','JP','Miyagi','prefecture','seed'),
  ('JP-05','JP','Akita','prefecture','seed'),
  ('JP-06','JP','Yamagata','prefecture','seed'),
  ('JP-07','JP','Fukushima','prefecture','seed'),
  ('JP-08','JP','Ibaraki','prefecture','seed'),
  ('JP-09','JP','Tochigi','prefecture','seed'),
  ('JP-10','JP','Gunma','prefecture','seed'),
  ('JP-11','JP','Saitama','prefecture','seed'),
  ('JP-12','JP','Chiba','prefecture','seed'),
  ('JP-13','JP','Tokyo','prefecture','seed'),
  ('JP-14','JP','Kanagawa','prefecture','seed'),
  ('JP-15','JP','Niigata','prefecture','seed'),
  ('JP-16','JP','Toyama','prefecture','seed'),
  ('JP-17','JP','Ishikawa','prefecture','seed'),
  ('JP-18','JP','Fukui','prefecture','seed'),
  ('JP-19','JP','Yamanashi','prefecture','seed'),
  ('JP-20','JP','Nagano','prefecture','seed'),
  ('JP-21','JP','Gifu','prefecture','seed'),
  ('JP-22','JP','Shizuoka','prefecture','seed'),
  ('JP-23','JP','Aichi','prefecture','seed'),
  ('JP-24','JP','Mie','prefecture','seed'),
  ('JP-25','JP','Shiga','prefecture','seed'),
  ('JP-26','JP','Kyoto','prefecture','seed'),
  ('JP-27','JP','Osaka','prefecture','seed'),
  ('JP-28','JP','Hyogo','prefecture','seed'),
  ('JP-29','JP','Nara','prefecture','seed'),
  ('JP-30','JP','Wakayama','prefecture','seed'),
  ('JP-31','JP','Tottori','prefecture','seed'),
  ('JP-32','JP','Shimane','prefecture','seed'),
  ('JP-33','JP','Okayama','prefecture','seed'),
  ('JP-34','JP','Hiroshima','prefecture','seed'),
  ('JP-35','JP','Yamaguchi','prefecture','seed'),
  ('JP-36','JP','Tokushima','prefecture','seed'),
  ('JP-37','JP','Kagawa','prefecture','seed'),
  ('JP-38','JP','Ehime','prefecture','seed'),
  ('JP-39','JP','Kochi','prefecture','seed'),
  ('JP-40','JP','Fukuoka','prefecture','seed'),
  ('JP-41','JP','Saga','prefecture','seed'),
  ('JP-42','JP','Nagasaki','prefecture','seed'),
  ('JP-43','JP','Kumamoto','prefecture','seed'),
  ('JP-44','JP','Oita','prefecture','seed'),
  ('JP-45','JP','Miyazaki','prefecture','seed'),
  ('JP-46','JP','Kagoshima','prefecture','seed'),
  ('JP-47','JP','Okinawa','prefecture','seed')
on conflict (code) do nothing;

-- ============================================================================
-- Canada (CA) — 10 provinces + 3 territories
-- ============================================================================
insert into ref.state_region (code, country_code2, name, category, created_by)
values
  ('CA-AB','CA','Alberta','province','seed'),
  ('CA-BC','CA','British Columbia','province','seed'),
  ('CA-MB','CA','Manitoba','province','seed'),
  ('CA-NB','CA','New Brunswick','province','seed'),
  ('CA-NL','CA','Newfoundland and Labrador','province','seed'),
  ('CA-NS','CA','Nova Scotia','province','seed'),
  ('CA-ON','CA','Ontario','province','seed'),
  ('CA-PE','CA','Prince Edward Island','province','seed'),
  ('CA-QC','CA','Quebec','province','seed'),
  ('CA-SK','CA','Saskatchewan','province','seed'),
  ('CA-NT','CA','Northwest Territories','territory','seed'),
  ('CA-NU','CA','Nunavut','territory','seed'),
  ('CA-YT','CA','Yukon','territory','seed')
on conflict (code) do nothing;

-- ============================================================================
-- Australia (AU) — 6 states + 2 territories
-- ============================================================================
insert into ref.state_region (code, country_code2, name, category, created_by)
values
  ('AU-NSW','AU','New South Wales','state','seed'),
  ('AU-QLD','AU','Queensland','state','seed'),
  ('AU-SA','AU','South Australia','state','seed'),
  ('AU-TAS','AU','Tasmania','state','seed'),
  ('AU-VIC','AU','Victoria','state','seed'),
  ('AU-WA','AU','Western Australia','state','seed'),
  ('AU-ACT','AU','Australian Capital Territory','territory','seed'),
  ('AU-NT','AU','Northern Territory','territory','seed')
on conflict (code) do nothing;

-- ============================================================================
-- China (CN) — 23 provinces + 4 municipalities + 5 autonomous regions + 2 SARs
-- ============================================================================
insert into ref.state_region (code, country_code2, name, category, created_by)
values
  -- Provinces
  ('CN-AH','CN','Anhui','province','seed'),
  ('CN-FJ','CN','Fujian','province','seed'),
  ('CN-GD','CN','Guangdong','province','seed'),
  ('CN-GS','CN','Gansu','province','seed'),
  ('CN-GZ','CN','Guizhou','province','seed'),
  ('CN-HA','CN','Henan','province','seed'),
  ('CN-HB','CN','Hubei','province','seed'),
  ('CN-HE','CN','Hebei','province','seed'),
  ('CN-HI','CN','Hainan','province','seed'),
  ('CN-HL','CN','Heilongjiang','province','seed'),
  ('CN-HN','CN','Hunan','province','seed'),
  ('CN-JL','CN','Jilin','province','seed'),
  ('CN-JS','CN','Jiangsu','province','seed'),
  ('CN-JX','CN','Jiangxi','province','seed'),
  ('CN-LN','CN','Liaoning','province','seed'),
  ('CN-QH','CN','Qinghai','province','seed'),
  ('CN-SC','CN','Sichuan','province','seed'),
  ('CN-SD','CN','Shandong','province','seed'),
  ('CN-SN','CN','Shaanxi','province','seed'),
  ('CN-SX','CN','Shanxi','province','seed'),
  ('CN-TW','CN','Taiwan','province','seed'),
  ('CN-YN','CN','Yunnan','province','seed'),
  ('CN-ZJ','CN','Zhejiang','province','seed'),
  -- Municipalities
  ('CN-BJ','CN','Beijing','municipality','seed'),
  ('CN-CQ','CN','Chongqing','municipality','seed'),
  ('CN-SH','CN','Shanghai','municipality','seed'),
  ('CN-TJ','CN','Tianjin','municipality','seed'),
  -- Autonomous regions
  ('CN-GX','CN','Guangxi','autonomous region','seed'),
  ('CN-NM','CN','Inner Mongolia','autonomous region','seed'),
  ('CN-NX','CN','Ningxia','autonomous region','seed'),
  ('CN-XJ','CN','Xinjiang','autonomous region','seed'),
  ('CN-XZ','CN','Tibet','autonomous region','seed'),
  -- SARs
  ('CN-HK','CN','Hong Kong','special administrative region','seed'),
  ('CN-MO','CN','Macao','special administrative region','seed')
on conflict (code) do nothing;

-- ============================================================================
-- Brazil (BR) — 26 states + 1 federal district
-- ============================================================================
insert into ref.state_region (code, country_code2, name, category, created_by)
values
  ('BR-AC','BR','Acre','state','seed'),
  ('BR-AL','BR','Alagoas','state','seed'),
  ('BR-AM','BR','Amazonas','state','seed'),
  ('BR-AP','BR','Amapá','state','seed'),
  ('BR-BA','BR','Bahia','state','seed'),
  ('BR-CE','BR','Ceará','state','seed'),
  ('BR-DF','BR','Distrito Federal','federal district','seed'),
  ('BR-ES','BR','Espírito Santo','state','seed'),
  ('BR-GO','BR','Goiás','state','seed'),
  ('BR-MA','BR','Maranhão','state','seed'),
  ('BR-MG','BR','Minas Gerais','state','seed'),
  ('BR-MS','BR','Mato Grosso do Sul','state','seed'),
  ('BR-MT','BR','Mato Grosso','state','seed'),
  ('BR-PA','BR','Pará','state','seed'),
  ('BR-PB','BR','Paraíba','state','seed'),
  ('BR-PE','BR','Pernambuco','state','seed'),
  ('BR-PI','BR','Piauí','state','seed'),
  ('BR-PR','BR','Paraná','state','seed'),
  ('BR-RJ','BR','Rio de Janeiro','state','seed'),
  ('BR-RN','BR','Rio Grande do Norte','state','seed'),
  ('BR-RO','BR','Rondônia','state','seed'),
  ('BR-RR','BR','Roraima','state','seed'),
  ('BR-RS','BR','Rio Grande do Sul','state','seed'),
  ('BR-SC','BR','Santa Catarina','state','seed'),
  ('BR-SE','BR','Sergipe','state','seed'),
  ('BR-SP','BR','São Paulo','state','seed'),
  ('BR-TO','BR','Tocantins','state','seed')
on conflict (code) do nothing;

-- ============================================================================
-- §3  CURRENCIES (ISO 4217)
-- ============================================================================

/* ============================================================================
   Athyper — REF Seed: Currencies (ISO 4217)
   PostgreSQL 16+

   Active ISO 4217 currency codes with symbols and minor units.
   Depends on: 010_ref_master_tables.sql
   ============================================================================ */

-- ============================================================================
-- Major World Currencies
-- ============================================================================
insert into ref.currency (code, name, symbol, minor_units, numeric3, created_by)
values
  ('USD','US Dollar','$',2,'840','seed'),
  ('EUR','Euro','€',2,'978','seed'),
  ('GBP','Pound Sterling','£',2,'826','seed'),
  ('JPY','Yen','¥',0,'392','seed'),
  ('CNY','Yuan Renminbi','¥',2,'156','seed'),
  ('CHF','Swiss Franc','CHF',2,'756','seed'),
  ('CAD','Canadian Dollar','CA$',2,'124','seed'),
  ('AUD','Australian Dollar','A$',2,'036','seed'),
  ('NZD','New Zealand Dollar','NZ$',2,'554','seed'),
  ('HKD','Hong Kong Dollar','HK$',2,'344','seed'),
  ('SGD','Singapore Dollar','S$',2,'702','seed')
on conflict (code) do nothing;

-- ============================================================================
-- Middle East & North Africa
-- ============================================================================
insert into ref.currency (code, name, symbol, minor_units, numeric3, created_by)
values
  ('SAR','Saudi Riyal','﷼',2,'682','seed'),
  ('AED','UAE Dirham','د.إ',2,'784','seed'),
  ('BHD','Bahraini Dinar','BD',3,'048','seed'),
  ('KWD','Kuwaiti Dinar','KD',3,'414','seed'),
  ('OMR','Rial Omani','﷼',3,'512','seed'),
  ('QAR','Qatari Rial','QR',2,'634','seed'),
  ('JOD','Jordanian Dinar','JD',3,'400','seed'),
  ('IQD','Iraqi Dinar','ع.د',3,'368','seed'),
  ('LBP','Lebanese Pound','ل.ل',2,'422','seed'),
  ('SYP','Syrian Pound','£S',2,'760','seed'),
  ('YER','Yemeni Rial','﷼',2,'886','seed'),
  ('EGP','Egyptian Pound','E£',2,'818','seed'),
  ('LYD','Libyan Dinar','LD',3,'434','seed'),
  ('TND','Tunisian Dinar','DT',3,'788','seed'),
  ('DZD','Algerian Dinar','د.ج',2,'012','seed'),
  ('MAD','Moroccan Dirham','MAD',2,'504','seed'),
  ('SDG','Sudanese Pound','SDG',2,'938','seed'),
  ('ILS','New Israeli Sheqel','₪',2,'376','seed'),
  ('IRR','Iranian Rial','﷼',2,'364','seed'),
  ('PSE','Palestine (no ISO currency)',null,2,null,'seed')
on conflict (code) do nothing;

-- ============================================================================
-- Europe (non-EUR)
-- ============================================================================
insert into ref.currency (code, name, symbol, minor_units, numeric3, created_by)
values
  ('ALL','Albanian Lek','L',2,'008','seed'),
  ('BAM','Convertible Mark','KM',2,'977','seed'),
  ('BGN','Bulgarian Lev','лв',2,'975','seed'),
  ('BYN','Belarusian Ruble','Br',2,'933','seed'),
  ('CZK','Czech Koruna','Kč',2,'203','seed'),
  ('DKK','Danish Krone','kr',2,'208','seed'),
  ('GEL','Georgian Lari','₾',2,'981','seed'),
  ('HRK','Croatian Kuna','kn',2,'191','seed'),
  ('HUF','Hungarian Forint','Ft',2,'348','seed'),
  ('ISK','Iceland Krona','kr',0,'352','seed'),
  ('MDL','Moldovan Leu','L',2,'498','seed'),
  ('MKD','Macedonian Denar','ден',2,'807','seed'),
  ('NOK','Norwegian Krone','kr',2,'578','seed'),
  ('PLN','Polish Zloty','zł',2,'985','seed'),
  ('RON','Romanian Leu','lei',2,'946','seed'),
  ('RSD','Serbian Dinar','din.',2,'941','seed'),
  ('RUB','Russian Ruble','₽',2,'643','seed'),
  ('SEK','Swedish Krona','kr',2,'752','seed'),
  ('TRY','Turkish Lira','₺',2,'949','seed'),
  ('UAH','Ukrainian Hryvnia','₴',2,'980','seed')
on conflict (code) do nothing;

-- ============================================================================
-- Asia & Pacific
-- ============================================================================
insert into ref.currency (code, name, symbol, minor_units, numeric3, created_by)
values
  ('AFN','Afghan Afghani','؋',2,'971','seed'),
  ('AMD','Armenian Dram','֏',2,'051','seed'),
  ('AZN','Azerbaijan Manat','₼',2,'944','seed'),
  ('BDT','Bangladeshi Taka','৳',2,'050','seed'),
  ('BND','Brunei Dollar','B$',2,'096','seed'),
  ('BTN','Bhutanese Ngultrum','Nu.',2,'064','seed'),
  ('FJD','Fiji Dollar','FJ$',2,'242','seed'),
  ('IDR','Indonesian Rupiah','Rp',2,'360','seed'),
  ('INR','Indian Rupee','₹',2,'356','seed'),
  ('KGS','Kyrgyzstani Som','сом',2,'417','seed'),
  ('KHR','Cambodian Riel','៛',2,'116','seed'),
  ('KPW','North Korean Won','₩',2,'408','seed'),
  ('KRW','South Korean Won','₩',0,'410','seed'),
  ('KZT','Kazakhstani Tenge','₸',2,'398','seed'),
  ('LAK','Lao Kip','₭',2,'418','seed'),
  ('LKR','Sri Lanka Rupee','Rs',2,'144','seed'),
  ('MMK','Myanmar Kyat','K',2,'104','seed'),
  ('MNT','Mongolian Tugrik','₮',2,'496','seed'),
  ('MOP','Macau Pataca','MOP$',2,'446','seed'),
  ('MVR','Maldivian Rufiyaa','Rf',2,'462','seed'),
  ('MYR','Malaysian Ringgit','RM',2,'458','seed'),
  ('NPR','Nepalese Rupee','Rs',2,'524','seed'),
  ('PGK','Papua New Guinean Kina','K',2,'598','seed'),
  ('PHP','Philippine Peso','₱',2,'608','seed'),
  ('PKR','Pakistan Rupee','Rs',2,'586','seed'),
  ('SBD','Solomon Islands Dollar','SI$',2,'090','seed'),
  ('THB','Thai Baht','฿',2,'764','seed'),
  ('TJS','Tajikistani Somoni','SM',2,'972','seed'),
  ('TMT','Turkmenistani Manat','T',2,'934','seed'),
  ('TOP','Tongan Paʻanga','T$',2,'776','seed'),
  ('TWD','New Taiwan Dollar','NT$',2,'901','seed'),
  ('UZS','Uzbekistani Som','сўм',2,'860','seed'),
  ('VND','Vietnamese Dong','₫',0,'704','seed'),
  ('VUV','Vanuatu Vatu','VT',0,'548','seed'),
  ('WST','Samoan Tala','WS$',2,'882','seed')
on conflict (code) do nothing;

-- ============================================================================
-- Africa
-- ============================================================================
insert into ref.currency (code, name, symbol, minor_units, numeric3, created_by)
values
  ('AOA','Angolan Kwanza','Kz',2,'973','seed'),
  ('BIF','Burundian Franc','FBu',0,'108','seed'),
  ('BWP','Botswana Pula','P',2,'072','seed'),
  ('CDF','Congolese Franc','FC',2,'976','seed'),
  ('CVE','Cabo Verde Escudo','$',2,'132','seed'),
  ('DJF','Djibouti Franc','Fdj',0,'262','seed'),
  ('ERN','Eritrean Nakfa','Nfk',2,'232','seed'),
  ('ETB','Ethiopian Birr','Br',2,'230','seed'),
  ('GHS','Ghana Cedi','GH₵',2,'936','seed'),
  ('GMD','Gambian Dalasi','D',2,'270','seed'),
  ('GNF','Guinean Franc','FG',0,'324','seed'),
  ('KES','Kenyan Shilling','KSh',2,'404','seed'),
  ('KMF','Comorian Franc','CF',0,'174','seed'),
  ('LRD','Liberian Dollar','L$',2,'430','seed'),
  ('LSL','Lesotho Loti','L',2,'426','seed'),
  ('MGA','Malagasy Ariary','Ar',2,'969','seed'),
  ('MRU','Mauritanian Ouguiya','UM',2,'929','seed'),
  ('MUR','Mauritian Rupee','Rs',2,'480','seed'),
  ('MWK','Malawian Kwacha','MK',2,'454','seed'),
  ('MZN','Mozambican Metical','MT',2,'943','seed'),
  ('NAD','Namibia Dollar','N$',2,'516','seed'),
  ('NGN','Nigerian Naira','₦',2,'566','seed'),
  ('RWF','Rwanda Franc','RF',0,'646','seed'),
  ('SCR','Seychelles Rupee','Rs',2,'690','seed'),
  ('SLE','Sierra Leonean Leone','Le',2,'925','seed'),
  ('SOS','Somali Shilling','Sh',2,'706','seed'),
  ('SSP','South Sudanese Pound','£',2,'728','seed'),
  ('STN','São Tomé and Príncipe Dobra','Db',2,'930','seed'),
  ('SZL','Eswatini Lilangeni','E',2,'748','seed'),
  ('TZS','Tanzanian Shilling','TSh',2,'834','seed'),
  ('UGX','Uganda Shilling','USh',0,'800','seed'),
  ('ZAR','South African Rand','R',2,'710','seed'),
  ('ZMW','Zambian Kwacha','ZK',2,'967','seed'),
  ('ZWL','Zimbabwe Dollar','Z$',2,'932','seed')
on conflict (code) do nothing;

-- ============================================================================
-- CFA Franc Zones & Supranational
-- ============================================================================
insert into ref.currency (code, name, symbol, minor_units, numeric3, created_by)
values
  ('XAF','CFA Franc BEAC','FCFA',0,'950','seed'),
  ('XOF','CFA Franc BCEAO','CFA',0,'952','seed'),
  ('XCD','East Caribbean Dollar','EC$',2,'951','seed'),
  ('XPF','CFP Franc','₣',0,'953','seed')
on conflict (code) do nothing;

-- ============================================================================
-- Americas (non-USD)
-- ============================================================================
insert into ref.currency (code, name, symbol, minor_units, numeric3, created_by)
values
  ('ARS','Argentine Peso','$',2,'032','seed'),
  ('BBD','Barbados Dollar','Bds$',2,'052','seed'),
  ('BMD','Bermudian Dollar','BD$',2,'060','seed'),
  ('BOB','Bolivian Boliviano','Bs.',2,'068','seed'),
  ('BRL','Brazilian Real','R$',2,'986','seed'),
  ('BSD','Bahamian Dollar','B$',2,'044','seed'),
  ('BZD','Belize Dollar','BZ$',2,'084','seed'),
  ('CLP','Chilean Peso','$',0,'152','seed'),
  ('COP','Colombian Peso','$',2,'170','seed'),
  ('CRC','Costa Rican Colon','₡',2,'188','seed'),
  ('CUP','Cuban Peso','$',2,'192','seed'),
  ('DOP','Dominican Peso','RD$',2,'214','seed'),
  ('GTQ','Guatemalan Quetzal','Q',2,'320','seed'),
  ('GYD','Guyana Dollar','GY$',2,'328','seed'),
  ('HNL','Honduran Lempira','L',2,'340','seed'),
  ('HTG','Haiti Gourde','G',2,'332','seed'),
  ('JMD','Jamaican Dollar','J$',2,'388','seed'),
  ('KYD','Cayman Islands Dollar','CI$',2,'136','seed'),
  ('MXN','Mexican Peso','Mex$',2,'484','seed'),
  ('NIO','Nicaraguan Cordoba Oro','C$',2,'558','seed'),
  ('PAB','Panamanian Balboa','B/.',2,'590','seed'),
  ('PEN','Peruvian Sol','S/.',2,'604','seed'),
  ('PYG','Paraguayan Guarani','₲',0,'600','seed'),
  ('SRD','Surinam Dollar','$',2,'968','seed'),
  ('TTD','Trinidad and Tobago Dollar','TT$',2,'780','seed'),
  ('UYU','Uruguayan Peso','$U',2,'858','seed'),
  ('VES','Venezuelan Bolívar Soberano','Bs.S',2,'928','seed'),
  ('AWG','Aruban Florin','ƒ',2,'533','seed'),
  ('ANG','Netherlands Antillean Guilder','ƒ',2,'532','seed')
on conflict (code) do nothing;

-- ============================================================================
-- Special / Precious Metals (valid ISO 4217)
-- ============================================================================
insert into ref.currency (code, name, symbol, minor_units, numeric3, status, created_by)
values
  ('XAU','Gold (troy ounce)',null,null,'959','active','seed'),
  ('XAG','Silver (troy ounce)',null,null,'961','active','seed'),
  ('XPT','Platinum (troy ounce)',null,null,'962','active','seed'),
  ('XPD','Palladium (troy ounce)',null,null,'964','active','seed'),
  ('XDR','Special Drawing Rights (SDR)',null,null,'960','active','seed')
on conflict (code) do nothing;

-- ============================================================================
-- §4  LANGUAGES (ISO 639)
-- ============================================================================

/* ============================================================================
   Athyper — REF Seed: Languages (ISO 639-1)
   PostgreSQL 16+

   ISO 639-1 two-letter language codes with native names and script direction.
   Depends on: 010_ref_master_tables.sql
   ============================================================================ */

insert into ref.language (code, name, native_name, iso639_2, direction, created_by)
values
  ('aa','Afar','Afaraf','aar','ltr','seed'),
  ('ab','Abkhazian','Аҧсуа','abk','ltr','seed'),
  ('af','Afrikaans','Afrikaans','afr','ltr','seed'),
  ('ak','Akan','Akan','aka','ltr','seed'),
  ('am','Amharic','አማርኛ','amh','ltr','seed'),
  ('an','Aragonese','Aragonés','arg','ltr','seed'),
  ('ar','Arabic','العربية','ara','rtl','seed'),
  ('as','Assamese','অসমীয়া','asm','ltr','seed'),
  ('av','Avaric','Авар','ava','ltr','seed'),
  ('ay','Aymara','Aymar aru','aym','ltr','seed'),
  ('az','Azerbaijani','Azərbaycan dili','aze','ltr','seed'),
  ('ba','Bashkir','Башҡорт теле','bak','ltr','seed'),
  ('be','Belarusian','Беларуская','bel','ltr','seed'),
  ('bg','Bulgarian','Български','bul','ltr','seed'),
  ('bh','Bihari languages','भोजपुरी','bih','ltr','seed'),
  ('bi','Bislama','Bislama','bis','ltr','seed'),
  ('bm','Bambara','Bamanankan','bam','ltr','seed'),
  ('bn','Bengali','বাংলা','ben','ltr','seed'),
  ('bo','Tibetan','བོད་ཡིག','bod','ltr','seed'),
  ('br','Breton','Brezhoneg','bre','ltr','seed'),
  ('bs','Bosnian','Bosanski','bos','ltr','seed'),
  ('ca','Catalan','Català','cat','ltr','seed'),
  ('ce','Chechen','Нохчийн мотт','che','ltr','seed'),
  ('ch','Chamorro','Chamoru','cha','ltr','seed'),
  ('co','Corsican','Corsu','cos','ltr','seed'),
  ('cr','Cree','ᓀᐦᐃᔭᐍᐏᐣ','cre','ltr','seed'),
  ('cs','Czech','Čeština','ces','ltr','seed'),
  ('cu','Church Slavic','Словѣньскъ','chu','ltr','seed'),
  ('cv','Chuvash','Чӑвашла','chv','ltr','seed'),
  ('cy','Welsh','Cymraeg','cym','ltr','seed'),
  ('da','Danish','Dansk','dan','ltr','seed'),
  ('de','German','Deutsch','deu','ltr','seed'),
  ('dv','Divehi','ދިވެހި','div','rtl','seed'),
  ('dz','Dzongkha','རྫོང་ཁ','dzo','ltr','seed'),
  ('ee','Ewe','Eʋegbe','ewe','ltr','seed'),
  ('el','Greek','Ελληνικά','ell','ltr','seed'),
  ('en','English','English','eng','ltr','seed'),
  ('eo','Esperanto','Esperanto','epo','ltr','seed'),
  ('es','Spanish','Español','spa','ltr','seed'),
  ('et','Estonian','Eesti','est','ltr','seed'),
  ('eu','Basque','Euskara','eus','ltr','seed'),
  ('fa','Persian','فارسی','fas','rtl','seed'),
  ('ff','Fulah','Fulfulde','ful','ltr','seed'),
  ('fi','Finnish','Suomi','fin','ltr','seed'),
  ('fj','Fijian','Vosa Vakaviti','fij','ltr','seed'),
  ('fo','Faroese','Føroyskt','fao','ltr','seed'),
  ('fr','French','Français','fra','ltr','seed'),
  ('fy','Western Frisian','Frysk','fry','ltr','seed'),
  ('ga','Irish','Gaeilge','gle','ltr','seed'),
  ('gd','Scottish Gaelic','Gàidhlig','gla','ltr','seed'),
  ('gl','Galician','Galego','glg','ltr','seed'),
  ('gn','Guarani','Avañe''ẽ','grn','ltr','seed'),
  ('gu','Gujarati','ગુજરાતી','guj','ltr','seed'),
  ('gv','Manx','Gaelg','glv','ltr','seed'),
  ('ha','Hausa','Hausa','hau','ltr','seed'),
  ('he','Hebrew','עברית','heb','rtl','seed'),
  ('hi','Hindi','हिन्दी','hin','ltr','seed'),
  ('ho','Hiri Motu','Hiri Motu','hmo','ltr','seed'),
  ('hr','Croatian','Hrvatski','hrv','ltr','seed'),
  ('ht','Haitian Creole','Kreyòl ayisyen','hat','ltr','seed'),
  ('hu','Hungarian','Magyar','hun','ltr','seed'),
  ('hy','Armenian','Հայերեն','hye','ltr','seed'),
  ('hz','Herero','Otjiherero','her','ltr','seed'),
  ('ia','Interlingua','Interlingua','ina','ltr','seed'),
  ('id','Indonesian','Bahasa Indonesia','ind','ltr','seed'),
  ('ie','Interlingue','Interlingue','ile','ltr','seed'),
  ('ig','Igbo','Igbo','ibo','ltr','seed'),
  ('ii','Sichuan Yi','ꆈꌠꉙ','iii','ltr','seed'),
  ('ik','Inupiaq','Iñupiaq','ipk','ltr','seed'),
  ('io','Ido','Ido','ido','ltr','seed'),
  ('is','Icelandic','Íslenska','isl','ltr','seed'),
  ('it','Italian','Italiano','ita','ltr','seed'),
  ('iu','Inuktitut','ᐃᓄᒃᑎᑐᑦ','iku','ltr','seed'),
  ('ja','Japanese','日本語','jpn','ltr','seed'),
  ('jv','Javanese','Basa Jawa','jav','ltr','seed'),
  ('ka','Georgian','ქართული','kat','ltr','seed'),
  ('kg','Kongo','KiKongo','kon','ltr','seed'),
  ('ki','Kikuyu','Gĩkũyũ','kik','ltr','seed'),
  ('kj','Kuanyama','Kuanyama','kua','ltr','seed'),
  ('kk','Kazakh','Қазақша','kaz','ltr','seed'),
  ('kl','Kalaallisut','Kalaallisut','kal','ltr','seed'),
  ('km','Khmer','ភាសាខ្មែរ','khm','ltr','seed'),
  ('kn','Kannada','ಕನ್ನಡ','kan','ltr','seed'),
  ('ko','Korean','한국어','kor','ltr','seed'),
  ('kr','Kanuri','Kanuri','kau','ltr','seed'),
  ('ks','Kashmiri','कश्मीरी','kas','rtl','seed'),
  ('ku','Kurdish','Kurdî','kur','rtl','seed'),
  ('kv','Komi','Коми кыв','kom','ltr','seed'),
  ('kw','Cornish','Kernewek','cor','ltr','seed'),
  ('ky','Kirghiz','Кыргызча','kir','ltr','seed'),
  ('la','Latin','Latina','lat','ltr','seed'),
  ('lb','Luxembourgish','Lëtzebuergesch','ltz','ltr','seed'),
  ('lg','Ganda','Luganda','lug','ltr','seed'),
  ('li','Limburgish','Limburgs','lim','ltr','seed'),
  ('ln','Lingala','Lingála','lin','ltr','seed'),
  ('lo','Lao','ພາສາລາວ','lao','ltr','seed'),
  ('lt','Lithuanian','Lietuvių','lit','ltr','seed'),
  ('lu','Luba-Katanga','Tshiluba','lub','ltr','seed'),
  ('lv','Latvian','Latviešu','lav','ltr','seed'),
  ('mg','Malagasy','Malagasy','mlg','ltr','seed'),
  ('mh','Marshallese','Kajin M̧ajeļ','mah','ltr','seed'),
  ('mi','Maori','Te Reo Māori','mri','ltr','seed'),
  ('mk','Macedonian','Македонски','mkd','ltr','seed'),
  ('ml','Malayalam','മലയാളം','mal','ltr','seed'),
  ('mn','Mongolian','Монгол','mon','ltr','seed'),
  ('mr','Marathi','मराठी','mar','ltr','seed'),
  ('ms','Malay','Bahasa Melayu','msa','ltr','seed'),
  ('mt','Maltese','Malti','mlt','ltr','seed'),
  ('my','Burmese','ဗမာစာ','mya','ltr','seed'),
  ('na','Nauru','Ekakairũ Naoero','nau','ltr','seed'),
  ('nb','Norwegian Bokmål','Norsk bokmål','nob','ltr','seed'),
  ('nd','North Ndebele','isiNdebele','nde','ltr','seed'),
  ('ne','Nepali','नेपाली','nep','ltr','seed'),
  ('ng','Ndonga','Owambo','ndo','ltr','seed'),
  ('nl','Dutch','Nederlands','nld','ltr','seed'),
  ('nn','Norwegian Nynorsk','Norsk nynorsk','nno','ltr','seed'),
  ('no','Norwegian','Norsk','nor','ltr','seed'),
  ('nr','South Ndebele','isiNdebele','nbl','ltr','seed'),
  ('nv','Navajo','Diné bizaad','nav','ltr','seed'),
  ('ny','Chichewa','ChiCheŵa','nya','ltr','seed'),
  ('oc','Occitan','Occitan','oci','ltr','seed'),
  ('oj','Ojibwa','ᐊᓂᔑᓈᐯᒧᐎᓐ','oji','ltr','seed'),
  ('om','Oromo','Afaan Oromoo','orm','ltr','seed'),
  ('or','Oriya','ଓଡ଼ିଆ','ori','ltr','seed'),
  ('os','Ossetian','Ирон æвзаг','oss','ltr','seed'),
  ('pa','Punjabi','ਪੰਜਾਬੀ','pan','ltr','seed'),
  ('pi','Pali','पालि','pli','ltr','seed'),
  ('pl','Polish','Polski','pol','ltr','seed'),
  ('ps','Pashto','پښتو','pus','rtl','seed'),
  ('pt','Portuguese','Português','por','ltr','seed'),
  ('qu','Quechua','Runa Simi','que','ltr','seed'),
  ('rm','Romansh','Rumantsch','roh','ltr','seed'),
  ('rn','Rundi','Ikirundi','run','ltr','seed'),
  ('ro','Romanian','Română','ron','ltr','seed'),
  ('ru','Russian','Русский','rus','ltr','seed'),
  ('rw','Kinyarwanda','Ikinyarwanda','kin','ltr','seed'),
  ('sa','Sanskrit','संस्कृतम्','san','ltr','seed'),
  ('sc','Sardinian','Sardu','srd','ltr','seed'),
  ('sd','Sindhi','سنڌي','snd','rtl','seed'),
  ('se','Northern Sami','Davvisámegiella','sme','ltr','seed'),
  ('sg','Sango','Yângâ tî sängö','sag','ltr','seed'),
  ('si','Sinhala','සිංහල','sin','ltr','seed'),
  ('sk','Slovak','Slovenčina','slk','ltr','seed'),
  ('sl','Slovenian','Slovenščina','slv','ltr','seed'),
  ('sm','Samoan','Gagana Samoa','smo','ltr','seed'),
  ('sn','Shona','chiShona','sna','ltr','seed'),
  ('so','Somali','Soomaali','som','ltr','seed'),
  ('sq','Albanian','Shqip','sqi','ltr','seed'),
  ('sr','Serbian','Српски','srp','ltr','seed'),
  ('ss','Swati','SiSwati','ssw','ltr','seed'),
  ('st','Southern Sotho','Sesotho','sot','ltr','seed'),
  ('su','Sundanese','Basa Sunda','sun','ltr','seed'),
  ('sv','Swedish','Svenska','swe','ltr','seed'),
  ('sw','Swahili','Kiswahili','swa','ltr','seed'),
  ('ta','Tamil','தமிழ்','tam','ltr','seed'),
  ('te','Telugu','తెలుగు','tel','ltr','seed'),
  ('tg','Tajik','Тоҷикӣ','tgk','ltr','seed'),
  ('th','Thai','ไทย','tha','ltr','seed'),
  ('ti','Tigrinya','ትግርኛ','tir','ltr','seed'),
  ('tk','Turkmen','Türkmen','tuk','ltr','seed'),
  ('tl','Tagalog','Wikang Tagalog','tgl','ltr','seed'),
  ('tn','Tswana','Setswana','tsn','ltr','seed'),
  ('to','Tonga','Faka Tonga','ton','ltr','seed'),
  ('tr','Turkish','Türkçe','tur','ltr','seed'),
  ('ts','Tsonga','Xitsonga','tso','ltr','seed'),
  ('tt','Tatar','Татарча','tat','ltr','seed'),
  ('tw','Twi','Twi','twi','ltr','seed'),
  ('ty','Tahitian','Reo Tahiti','tah','ltr','seed'),
  ('ug','Uyghur','ئۇيغۇرچە','uig','rtl','seed'),
  ('uk','Ukrainian','Українська','ukr','ltr','seed'),
  ('ur','Urdu','اردو','urd','rtl','seed'),
  ('uz','Uzbek','O''zbek','uzb','ltr','seed'),
  ('ve','Venda','Tshivenḓa','ven','ltr','seed'),
  ('vi','Vietnamese','Tiếng Việt','vie','ltr','seed'),
  ('vo','Volapük','Volapük','vol','ltr','seed'),
  ('wa','Walloon','Walon','wln','ltr','seed'),
  ('wo','Wolof','Wollof','wol','ltr','seed'),
  ('xh','Xhosa','isiXhosa','xho','ltr','seed'),
  ('yi','Yiddish','ייִדיש','yid','rtl','seed'),
  ('yo','Yoruba','Yorùbá','yor','ltr','seed'),
  ('za','Zhuang','Saɯ cueŋƅ','zha','ltr','seed'),
  ('zh','Chinese','中文','zho','ltr','seed'),
  ('zu','Zulu','isiZulu','zul','ltr','seed')
on conflict (code) do nothing;

-- ============================================================================
-- §5  LOCALES (BCP 47)
-- ============================================================================

/* ============================================================================
   Athyper — REF Seed: Locales (BCP 47)
   PostgreSQL 16+

   Curated set of BCP 47 locale tags linking language + optional country.
   Covers major business locales worldwide.
   Depends on: 040_ref_seed_languages.sql, 020_ref_seed_countries.sql
   ============================================================================ */

-- ----------------------------------------------------------------------------
-- Language-only locales (no country qualifier)
-- ----------------------------------------------------------------------------
insert into ref.locale (code, language_code, country_code2, script, name, direction, created_by)
values
  -- Major world languages (base locales)
  ('af',    'af', null, 'Latn', 'Afrikaans',              null, 'seed'),
  ('am',    'am', null, 'Ethi', 'Amharic',                null, 'seed'),
  ('ar',    'ar', null, 'Arab', 'Arabic',                  'rtl', 'seed'),
  ('az',    'az', null, 'Latn', 'Azerbaijani',             null, 'seed'),
  ('be',    'be', null, 'Cyrl', 'Belarusian',              null, 'seed'),
  ('bg',    'bg', null, 'Cyrl', 'Bulgarian',               null, 'seed'),
  ('bn',    'bn', null, 'Beng', 'Bengali',                 null, 'seed'),
  ('bs',    'bs', null, 'Latn', 'Bosnian',                 null, 'seed'),
  ('ca',    'ca', null, 'Latn', 'Catalan',                 null, 'seed'),
  ('cs',    'cs', null, 'Latn', 'Czech',                   null, 'seed'),
  ('cy',    'cy', null, 'Latn', 'Welsh',                   null, 'seed'),
  ('da',    'da', null, 'Latn', 'Danish',                  null, 'seed'),
  ('de',    'de', null, 'Latn', 'German',                  null, 'seed'),
  ('el',    'el', null, 'Grek', 'Greek',                   null, 'seed'),
  ('en',    'en', null, 'Latn', 'English',                 null, 'seed'),
  ('es',    'es', null, 'Latn', 'Spanish',                 null, 'seed'),
  ('et',    'et', null, 'Latn', 'Estonian',                null, 'seed'),
  ('eu',    'eu', null, 'Latn', 'Basque',                  null, 'seed'),
  ('fa',    'fa', null, 'Arab', 'Persian',                 'rtl', 'seed'),
  ('fi',    'fi', null, 'Latn', 'Finnish',                 null, 'seed'),
  ('fr',    'fr', null, 'Latn', 'French',                  null, 'seed'),
  ('ga',    'ga', null, 'Latn', 'Irish',                   null, 'seed'),
  ('gl',    'gl', null, 'Latn', 'Galician',                null, 'seed'),
  ('gu',    'gu', null, 'Gujr', 'Gujarati',                null, 'seed'),
  ('he',    'he', null, 'Hebr', 'Hebrew',                  'rtl', 'seed'),
  ('hi',    'hi', null, 'Deva', 'Hindi',                   null, 'seed'),
  ('hr',    'hr', null, 'Latn', 'Croatian',                null, 'seed'),
  ('hu',    'hu', null, 'Latn', 'Hungarian',               null, 'seed'),
  ('hy',    'hy', null, 'Armn', 'Armenian',                null, 'seed'),
  ('id',    'id', null, 'Latn', 'Indonesian',              null, 'seed'),
  ('is',    'is', null, 'Latn', 'Icelandic',               null, 'seed'),
  ('it',    'it', null, 'Latn', 'Italian',                 null, 'seed'),
  ('ja',    'ja', null, 'Jpan', 'Japanese',                null, 'seed'),
  ('ka',    'ka', null, 'Geor', 'Georgian',                null, 'seed'),
  ('kk',    'kk', null, 'Cyrl', 'Kazakh',                  null, 'seed'),
  ('km',    'km', null, 'Khmr', 'Khmer',                   null, 'seed'),
  ('kn',    'kn', null, 'Knda', 'Kannada',                 null, 'seed'),
  ('ko',    'ko', null, 'Kore', 'Korean',                  null, 'seed'),
  ('lo',    'lo', null, 'Laoo', 'Lao',                     null, 'seed'),
  ('lt',    'lt', null, 'Latn', 'Lithuanian',              null, 'seed'),
  ('lv',    'lv', null, 'Latn', 'Latvian',                 null, 'seed'),
  ('mk',    'mk', null, 'Cyrl', 'Macedonian',              null, 'seed'),
  ('ml',    'ml', null, 'Mlym', 'Malayalam',               null, 'seed'),
  ('mn',    'mn', null, 'Cyrl', 'Mongolian',               null, 'seed'),
  ('mr',    'mr', null, 'Deva', 'Marathi',                 null, 'seed'),
  ('ms',    'ms', null, 'Latn', 'Malay',                   null, 'seed'),
  ('mt',    'mt', null, 'Latn', 'Maltese',                 null, 'seed'),
  ('my',    'my', null, 'Mymr', 'Burmese',                 null, 'seed'),
  ('nb',    'nb', null, 'Latn', 'Norwegian Bokmål',       null, 'seed'),
  ('ne',    'ne', null, 'Deva', 'Nepali',                  null, 'seed'),
  ('nl',    'nl', null, 'Latn', 'Dutch',                   null, 'seed'),
  ('nn',    'nn', null, 'Latn', 'Norwegian Nynorsk',       null, 'seed'),
  ('pa',    'pa', null, 'Guru', 'Punjabi',                 null, 'seed'),
  ('pl',    'pl', null, 'Latn', 'Polish',                  null, 'seed'),
  ('ps',    'ps', null, 'Arab', 'Pashto',                  'rtl', 'seed'),
  ('pt',    'pt', null, 'Latn', 'Portuguese',              null, 'seed'),
  ('ro',    'ro', null, 'Latn', 'Romanian',                null, 'seed'),
  ('ru',    'ru', null, 'Cyrl', 'Russian',                 null, 'seed'),
  ('si',    'si', null, 'Sinh', 'Sinhala',                 null, 'seed'),
  ('sk',    'sk', null, 'Latn', 'Slovak',                  null, 'seed'),
  ('sl',    'sl', null, 'Latn', 'Slovenian',               null, 'seed'),
  ('so',    'so', null, 'Latn', 'Somali',                  null, 'seed'),
  ('sq',    'sq', null, 'Latn', 'Albanian',                null, 'seed'),
  ('sr',    'sr', null, 'Cyrl', 'Serbian',                 null, 'seed'),
  ('sv',    'sv', null, 'Latn', 'Swedish',                 null, 'seed'),
  ('sw',    'sw', null, 'Latn', 'Swahili',                 null, 'seed'),
  ('ta',    'ta', null, 'Taml', 'Tamil',                   null, 'seed'),
  ('te',    'te', null, 'Telu', 'Telugu',                  null, 'seed'),
  ('th',    'th', null, 'Thai', 'Thai',                    null, 'seed'),
  ('tl',    'tl', null, 'Latn', 'Filipino',                null, 'seed'),
  ('tr',    'tr', null, 'Latn', 'Turkish',                 null, 'seed'),
  ('uk',    'uk', null, 'Cyrl', 'Ukrainian',               null, 'seed'),
  ('ur',    'ur', null, 'Arab', 'Urdu',                    'rtl', 'seed'),
  ('uz',    'uz', null, 'Latn', 'Uzbek',                   null, 'seed'),
  ('vi',    'vi', null, 'Latn', 'Vietnamese',              null, 'seed'),
  ('zh',    'zh', null, 'Hans', 'Chinese',                 null, 'seed'),
  ('zu',    'zu', null, 'Latn', 'Zulu',                    null, 'seed')
on conflict (code) do nothing;

-- ----------------------------------------------------------------------------
-- Country-qualified locales (language-COUNTRY)
-- ----------------------------------------------------------------------------

-- Arabic variants
insert into ref.locale (code, language_code, country_code2, script, name, direction, created_by)
values
  ('ar-SA', 'ar', 'SA', 'Arab', 'Arabic (Saudi Arabia)',            'rtl', 'seed'),
  ('ar-AE', 'ar', 'AE', 'Arab', 'Arabic (United Arab Emirates)',    'rtl', 'seed'),
  ('ar-BH', 'ar', 'BH', 'Arab', 'Arabic (Bahrain)',                 'rtl', 'seed'),
  ('ar-DZ', 'ar', 'DZ', 'Arab', 'Arabic (Algeria)',                 'rtl', 'seed'),
  ('ar-EG', 'ar', 'EG', 'Arab', 'Arabic (Egypt)',                   'rtl', 'seed'),
  ('ar-IQ', 'ar', 'IQ', 'Arab', 'Arabic (Iraq)',                    'rtl', 'seed'),
  ('ar-JO', 'ar', 'JO', 'Arab', 'Arabic (Jordan)',                  'rtl', 'seed'),
  ('ar-KW', 'ar', 'KW', 'Arab', 'Arabic (Kuwait)',                  'rtl', 'seed'),
  ('ar-LB', 'ar', 'LB', 'Arab', 'Arabic (Lebanon)',                 'rtl', 'seed'),
  ('ar-LY', 'ar', 'LY', 'Arab', 'Arabic (Libya)',                   'rtl', 'seed'),
  ('ar-MA', 'ar', 'MA', 'Arab', 'Arabic (Morocco)',                 'rtl', 'seed'),
  ('ar-OM', 'ar', 'OM', 'Arab', 'Arabic (Oman)',                    'rtl', 'seed'),
  ('ar-QA', 'ar', 'QA', 'Arab', 'Arabic (Qatar)',                   'rtl', 'seed'),
  ('ar-SD', 'ar', 'SD', 'Arab', 'Arabic (Sudan)',                   'rtl', 'seed'),
  ('ar-SY', 'ar', 'SY', 'Arab', 'Arabic (Syria)',                   'rtl', 'seed'),
  ('ar-TN', 'ar', 'TN', 'Arab', 'Arabic (Tunisia)',                 'rtl', 'seed'),
  ('ar-YE', 'ar', 'YE', 'Arab', 'Arabic (Yemen)',                   'rtl', 'seed')
on conflict (code) do nothing;

-- English variants
insert into ref.locale (code, language_code, country_code2, script, name, direction, created_by)
values
  ('en-US', 'en', 'US', 'Latn', 'English (United States)',          null, 'seed'),
  ('en-GB', 'en', 'GB', 'Latn', 'English (United Kingdom)',         null, 'seed'),
  ('en-AU', 'en', 'AU', 'Latn', 'English (Australia)',              null, 'seed'),
  ('en-CA', 'en', 'CA', 'Latn', 'English (Canada)',                 null, 'seed'),
  ('en-IE', 'en', 'IE', 'Latn', 'English (Ireland)',                null, 'seed'),
  ('en-IN', 'en', 'IN', 'Latn', 'English (India)',                  null, 'seed'),
  ('en-NZ', 'en', 'NZ', 'Latn', 'English (New Zealand)',            null, 'seed'),
  ('en-PH', 'en', 'PH', 'Latn', 'English (Philippines)',            null, 'seed'),
  ('en-SG', 'en', 'SG', 'Latn', 'English (Singapore)',              null, 'seed'),
  ('en-ZA', 'en', 'ZA', 'Latn', 'English (South Africa)',           null, 'seed'),
  ('en-HK', 'en', 'HK', 'Latn', 'English (Hong Kong)',              null, 'seed'),
  ('en-KE', 'en', 'KE', 'Latn', 'English (Kenya)',                  null, 'seed'),
  ('en-NG', 'en', 'NG', 'Latn', 'English (Nigeria)',                null, 'seed')
on conflict (code) do nothing;

-- Spanish variants
insert into ref.locale (code, language_code, country_code2, script, name, direction, created_by)
values
  ('es-ES', 'es', 'ES', 'Latn', 'Spanish (Spain)',                  null, 'seed'),
  ('es-MX', 'es', 'MX', 'Latn', 'Spanish (Mexico)',                 null, 'seed'),
  ('es-AR', 'es', 'AR', 'Latn', 'Spanish (Argentina)',              null, 'seed'),
  ('es-CL', 'es', 'CL', 'Latn', 'Spanish (Chile)',                  null, 'seed'),
  ('es-CO', 'es', 'CO', 'Latn', 'Spanish (Colombia)',               null, 'seed'),
  ('es-PE', 'es', 'PE', 'Latn', 'Spanish (Peru)',                   null, 'seed'),
  ('es-VE', 'es', 'VE', 'Latn', 'Spanish (Venezuela)',              null, 'seed'),
  ('es-EC', 'es', 'EC', 'Latn', 'Spanish (Ecuador)',                null, 'seed'),
  ('es-UY', 'es', 'UY', 'Latn', 'Spanish (Uruguay)',                null, 'seed'),
  ('es-CR', 'es', 'CR', 'Latn', 'Spanish (Costa Rica)',             null, 'seed')
on conflict (code) do nothing;

-- French variants
insert into ref.locale (code, language_code, country_code2, script, name, direction, created_by)
values
  ('fr-FR', 'fr', 'FR', 'Latn', 'French (France)',                  null, 'seed'),
  ('fr-BE', 'fr', 'BE', 'Latn', 'French (Belgium)',                 null, 'seed'),
  ('fr-CA', 'fr', 'CA', 'Latn', 'French (Canada)',                  null, 'seed'),
  ('fr-CH', 'fr', 'CH', 'Latn', 'French (Switzerland)',             null, 'seed'),
  ('fr-LU', 'fr', 'LU', 'Latn', 'French (Luxembourg)',              null, 'seed'),
  ('fr-SN', 'fr', 'SN', 'Latn', 'French (Senegal)',                 null, 'seed'),
  ('fr-CI', 'fr', 'CI', 'Latn', 'French (Côte d''Ivoire)',         null, 'seed'),
  ('fr-CM', 'fr', 'CM', 'Latn', 'French (Cameroon)',                null, 'seed'),
  ('fr-MA', 'fr', 'MA', 'Latn', 'French (Morocco)',                 null, 'seed'),
  ('fr-TN', 'fr', 'TN', 'Latn', 'French (Tunisia)',                 null, 'seed')
on conflict (code) do nothing;

-- German variants
insert into ref.locale (code, language_code, country_code2, script, name, direction, created_by)
values
  ('de-DE', 'de', 'DE', 'Latn', 'German (Germany)',                 null, 'seed'),
  ('de-AT', 'de', 'AT', 'Latn', 'German (Austria)',                 null, 'seed'),
  ('de-CH', 'de', 'CH', 'Latn', 'German (Switzerland)',             null, 'seed'),
  ('de-LU', 'de', 'LU', 'Latn', 'German (Luxembourg)',              null, 'seed'),
  ('de-LI', 'de', 'LI', 'Latn', 'German (Liechtenstein)',           null, 'seed')
on conflict (code) do nothing;

-- Portuguese variants
insert into ref.locale (code, language_code, country_code2, script, name, direction, created_by)
values
  ('pt-BR', 'pt', 'BR', 'Latn', 'Portuguese (Brazil)',              null, 'seed'),
  ('pt-PT', 'pt', 'PT', 'Latn', 'Portuguese (Portugal)',            null, 'seed'),
  ('pt-AO', 'pt', 'AO', 'Latn', 'Portuguese (Angola)',              null, 'seed'),
  ('pt-MZ', 'pt', 'MZ', 'Latn', 'Portuguese (Mozambique)',          null, 'seed')
on conflict (code) do nothing;

-- Chinese variants
insert into ref.locale (code, language_code, country_code2, script, name, direction, created_by)
values
  ('zh-CN', 'zh', 'CN', 'Hans', 'Chinese (Simplified, China)',      null, 'seed'),
  ('zh-TW', 'zh', 'TW', 'Hant', 'Chinese (Traditional, Taiwan)',    null, 'seed'),
  ('zh-HK', 'zh', 'HK', 'Hant', 'Chinese (Traditional, Hong Kong)', null, 'seed'),
  ('zh-SG', 'zh', 'SG', 'Hans', 'Chinese (Simplified, Singapore)',  null, 'seed')
on conflict (code) do nothing;

-- Other major country-qualified locales
insert into ref.locale (code, language_code, country_code2, script, name, direction, created_by)
values
  -- South Asia
  ('hi-IN', 'hi', 'IN', 'Deva', 'Hindi (India)',                    null, 'seed'),
  ('bn-BD', 'bn', 'BD', 'Beng', 'Bengali (Bangladesh)',             null, 'seed'),
  ('bn-IN', 'bn', 'IN', 'Beng', 'Bengali (India)',                  null, 'seed'),
  ('ta-IN', 'ta', 'IN', 'Taml', 'Tamil (India)',                    null, 'seed'),
  ('ta-LK', 'ta', 'LK', 'Taml', 'Tamil (Sri Lanka)',               null, 'seed'),
  ('te-IN', 'te', 'IN', 'Telu', 'Telugu (India)',                   null, 'seed'),
  ('ml-IN', 'ml', 'IN', 'Mlym', 'Malayalam (India)',                null, 'seed'),
  ('kn-IN', 'kn', 'IN', 'Knda', 'Kannada (India)',                 null, 'seed'),
  ('gu-IN', 'gu', 'IN', 'Gujr', 'Gujarati (India)',                null, 'seed'),
  ('mr-IN', 'mr', 'IN', 'Deva', 'Marathi (India)',                 null, 'seed'),
  ('pa-IN', 'pa', 'IN', 'Guru', 'Punjabi (India)',                 null, 'seed'),
  ('ur-PK', 'ur', 'PK', 'Arab', 'Urdu (Pakistan)',                  'rtl', 'seed'),
  ('ur-IN', 'ur', 'IN', 'Arab', 'Urdu (India)',                     'rtl', 'seed'),
  ('si-LK', 'si', 'LK', 'Sinh', 'Sinhala (Sri Lanka)',             null, 'seed'),
  ('ne-NP', 'ne', 'NP', 'Deva', 'Nepali (Nepal)',                  null, 'seed'),

  -- East/Southeast Asia
  ('ja-JP', 'ja', 'JP', 'Jpan', 'Japanese (Japan)',                 null, 'seed'),
  ('ko-KR', 'ko', 'KR', 'Kore', 'Korean (South Korea)',            null, 'seed'),
  ('th-TH', 'th', 'TH', 'Thai', 'Thai (Thailand)',                 null, 'seed'),
  ('vi-VN', 'vi', 'VN', 'Latn', 'Vietnamese (Vietnam)',            null, 'seed'),
  ('id-ID', 'id', 'ID', 'Latn', 'Indonesian (Indonesia)',          null, 'seed'),
  ('ms-MY', 'ms', 'MY', 'Latn', 'Malay (Malaysia)',                null, 'seed'),
  ('ms-SG', 'ms', 'SG', 'Latn', 'Malay (Singapore)',               null, 'seed'),
  ('tl-PH', 'tl', 'PH', 'Latn', 'Filipino (Philippines)',          null, 'seed'),
  ('my-MM', 'my', 'MM', 'Mymr', 'Burmese (Myanmar)',               null, 'seed'),
  ('km-KH', 'km', 'KH', 'Khmr', 'Khmer (Cambodia)',               null, 'seed'),
  ('lo-LA', 'lo', 'LA', 'Laoo', 'Lao (Laos)',                     null, 'seed'),
  ('mn-MN', 'mn', 'MN', 'Cyrl', 'Mongolian (Mongolia)',            null, 'seed'),

  -- Europe (one main locale per language)
  ('nl-NL', 'nl', 'NL', 'Latn', 'Dutch (Netherlands)',             null, 'seed'),
  ('nl-BE', 'nl', 'BE', 'Latn', 'Dutch (Belgium)',                 null, 'seed'),
  ('it-IT', 'it', 'IT', 'Latn', 'Italian (Italy)',                 null, 'seed'),
  ('it-CH', 'it', 'CH', 'Latn', 'Italian (Switzerland)',            null, 'seed'),
  ('pl-PL', 'pl', 'PL', 'Latn', 'Polish (Poland)',                 null, 'seed'),
  ('cs-CZ', 'cs', 'CZ', 'Latn', 'Czech (Czech Republic)',          null, 'seed'),
  ('sk-SK', 'sk', 'SK', 'Latn', 'Slovak (Slovakia)',               null, 'seed'),
  ('hu-HU', 'hu', 'HU', 'Latn', 'Hungarian (Hungary)',             null, 'seed'),
  ('ro-RO', 'ro', 'RO', 'Latn', 'Romanian (Romania)',              null, 'seed'),
  ('bg-BG', 'bg', 'BG', 'Cyrl', 'Bulgarian (Bulgaria)',            null, 'seed'),
  ('hr-HR', 'hr', 'HR', 'Latn', 'Croatian (Croatia)',              null, 'seed'),
  ('sr-RS', 'sr', 'RS', 'Cyrl', 'Serbian (Serbia)',                null, 'seed'),
  ('sl-SI', 'sl', 'SI', 'Latn', 'Slovenian (Slovenia)',            null, 'seed'),
  ('bs-BA', 'bs', 'BA', 'Latn', 'Bosnian (Bosnia and Herzegovina)', null, 'seed'),
  ('sq-AL', 'sq', 'AL', 'Latn', 'Albanian (Albania)',              null, 'seed'),
  ('mk-MK', 'mk', 'MK', 'Cyrl', 'Macedonian (North Macedonia)',   null, 'seed'),
  ('el-GR', 'el', 'GR', 'Grek', 'Greek (Greece)',                  null, 'seed'),
  ('el-CY', 'el', 'CY', 'Grek', 'Greek (Cyprus)',                  null, 'seed'),
  ('da-DK', 'da', 'DK', 'Latn', 'Danish (Denmark)',                null, 'seed'),
  ('sv-SE', 'sv', 'SE', 'Latn', 'Swedish (Sweden)',                null, 'seed'),
  ('sv-FI', 'sv', 'FI', 'Latn', 'Swedish (Finland)',               null, 'seed'),
  ('nb-NO', 'nb', 'NO', 'Latn', 'Norwegian Bokmål (Norway)',      null, 'seed'),
  ('nn-NO', 'nn', 'NO', 'Latn', 'Norwegian Nynorsk (Norway)',      null, 'seed'),
  ('fi-FI', 'fi', 'FI', 'Latn', 'Finnish (Finland)',               null, 'seed'),
  ('et-EE', 'et', 'EE', 'Latn', 'Estonian (Estonia)',              null, 'seed'),
  ('lt-LT', 'lt', 'LT', 'Latn', 'Lithuanian (Lithuania)',          null, 'seed'),
  ('lv-LV', 'lv', 'LV', 'Latn', 'Latvian (Latvia)',               null, 'seed'),
  ('is-IS', 'is', 'IS', 'Latn', 'Icelandic (Iceland)',             null, 'seed'),
  ('mt-MT', 'mt', 'MT', 'Latn', 'Maltese (Malta)',                 null, 'seed'),
  ('ga-IE', 'ga', 'IE', 'Latn', 'Irish (Ireland)',                 null, 'seed'),
  ('cy-GB', 'cy', 'GB', 'Latn', 'Welsh (United Kingdom)',          null, 'seed'),
  ('eu-ES', 'eu', 'ES', 'Latn', 'Basque (Spain)',                  null, 'seed'),
  ('ca-ES', 'ca', 'ES', 'Latn', 'Catalan (Spain)',                 null, 'seed'),
  ('gl-ES', 'gl', 'ES', 'Latn', 'Galician (Spain)',                null, 'seed'),
  ('ru-RU', 'ru', 'RU', 'Cyrl', 'Russian (Russia)',                null, 'seed'),
  ('uk-UA', 'uk', 'UA', 'Cyrl', 'Ukrainian (Ukraine)',             null, 'seed'),
  ('be-BY', 'be', 'BY', 'Cyrl', 'Belarusian (Belarus)',            null, 'seed'),
  ('hy-AM', 'hy', 'AM', 'Armn', 'Armenian (Armenia)',              null, 'seed'),
  ('ka-GE', 'ka', 'GE', 'Geor', 'Georgian (Georgia)',              null, 'seed'),
  ('tr-TR', 'tr', 'TR', 'Latn', 'Turkish (Turkey)',                null, 'seed'),
  ('az-AZ', 'az', 'AZ', 'Latn', 'Azerbaijani (Azerbaijan)',        null, 'seed'),
  ('kk-KZ', 'kk', 'KZ', 'Cyrl', 'Kazakh (Kazakhstan)',            null, 'seed'),
  ('uz-UZ', 'uz', 'UZ', 'Latn', 'Uzbek (Uzbekistan)',              null, 'seed'),

  -- Middle East / Central Asia
  ('fa-IR', 'fa', 'IR', 'Arab', 'Persian (Iran)',                   'rtl', 'seed'),
  ('fa-AF', 'fa', 'AF', 'Arab', 'Dari (Afghanistan)',               'rtl', 'seed'),
  ('ps-AF', 'ps', 'AF', 'Arab', 'Pashto (Afghanistan)',             'rtl', 'seed'),
  ('he-IL', 'he', 'IL', 'Hebr', 'Hebrew (Israel)',                  'rtl', 'seed'),

  -- Africa
  ('sw-KE', 'sw', 'KE', 'Latn', 'Swahili (Kenya)',                 null, 'seed'),
  ('sw-TZ', 'sw', 'TZ', 'Latn', 'Swahili (Tanzania)',              null, 'seed'),
  ('am-ET', 'am', 'ET', 'Ethi', 'Amharic (Ethiopia)',              null, 'seed'),
  ('so-SO', 'so', 'SO', 'Latn', 'Somali (Somalia)',                null, 'seed'),
  ('af-ZA', 'af', 'ZA', 'Latn', 'Afrikaans (South Africa)',        null, 'seed'),
  ('zu-ZA', 'zu', 'ZA', 'Latn', 'Zulu (South Africa)',             null, 'seed')
on conflict (code) do nothing;

-- ============================================================================
-- §6  TIME ZONES (IANA tzdb)
-- ============================================================================

/* ============================================================================
   Athyper — REF Seed: Time Zones (IANA tzdb)
   PostgreSQL 16+

   Comprehensive IANA time zone database entries.
   Canonical zones first, then aliases.
   Depends on: 010_ref_master_tables.sql
   ============================================================================ */

-- ============================================================================
-- Etc (must come first — referenced by aliases)
-- ============================================================================
insert into ref.timezone (tzid, display_name, utc_offset, is_alias, created_by)
values
  ('Etc/GMT','GMT','+00:00',false,'seed'),
  ('Etc/UTC','UTC','+00:00',false,'seed')
on conflict (tzid) do nothing;

-- ============================================================================
-- Africa
-- ============================================================================
insert into ref.timezone (tzid, display_name, utc_offset, is_alias, created_by)
values
  ('Africa/Abidjan','Africa / Abidjan','+00:00',false,'seed'),
  ('Africa/Accra','Africa / Accra','+00:00',false,'seed'),
  ('Africa/Addis_Ababa','Africa / Addis Ababa','+03:00',false,'seed'),
  ('Africa/Algiers','Africa / Algiers','+01:00',false,'seed'),
  ('Africa/Asmara','Africa / Asmara','+03:00',false,'seed'),
  ('Africa/Bamako','Africa / Bamako','+00:00',false,'seed'),
  ('Africa/Bangui','Africa / Bangui','+01:00',false,'seed'),
  ('Africa/Banjul','Africa / Banjul','+00:00',false,'seed'),
  ('Africa/Bissau','Africa / Bissau','+00:00',false,'seed'),
  ('Africa/Blantyre','Africa / Blantyre','+02:00',false,'seed'),
  ('Africa/Brazzaville','Africa / Brazzaville','+01:00',false,'seed'),
  ('Africa/Bujumbura','Africa / Bujumbura','+02:00',false,'seed'),
  ('Africa/Cairo','Africa / Cairo','+02:00',false,'seed'),
  ('Africa/Casablanca','Africa / Casablanca','+01:00',false,'seed'),
  ('Africa/Ceuta','Africa / Ceuta','+01:00',false,'seed'),
  ('Africa/Conakry','Africa / Conakry','+00:00',false,'seed'),
  ('Africa/Dakar','Africa / Dakar','+00:00',false,'seed'),
  ('Africa/Dar_es_Salaam','Africa / Dar es Salaam','+03:00',false,'seed'),
  ('Africa/Djibouti','Africa / Djibouti','+03:00',false,'seed'),
  ('Africa/Douala','Africa / Douala','+01:00',false,'seed'),
  ('Africa/El_Aaiun','Africa / El Aaiun','+01:00',false,'seed'),
  ('Africa/Freetown','Africa / Freetown','+00:00',false,'seed'),
  ('Africa/Gaborone','Africa / Gaborone','+02:00',false,'seed'),
  ('Africa/Harare','Africa / Harare','+02:00',false,'seed'),
  ('Africa/Johannesburg','Africa / Johannesburg','+02:00',false,'seed'),
  ('Africa/Juba','Africa / Juba','+02:00',false,'seed'),
  ('Africa/Kampala','Africa / Kampala','+03:00',false,'seed'),
  ('Africa/Khartoum','Africa / Khartoum','+02:00',false,'seed'),
  ('Africa/Kigali','Africa / Kigali','+02:00',false,'seed'),
  ('Africa/Kinshasa','Africa / Kinshasa','+01:00',false,'seed'),
  ('Africa/Lagos','Africa / Lagos','+01:00',false,'seed'),
  ('Africa/Libreville','Africa / Libreville','+01:00',false,'seed'),
  ('Africa/Lome','Africa / Lome','+00:00',false,'seed'),
  ('Africa/Luanda','Africa / Luanda','+01:00',false,'seed'),
  ('Africa/Lubumbashi','Africa / Lubumbashi','+02:00',false,'seed'),
  ('Africa/Lusaka','Africa / Lusaka','+02:00',false,'seed'),
  ('Africa/Malabo','Africa / Malabo','+01:00',false,'seed'),
  ('Africa/Maputo','Africa / Maputo','+02:00',false,'seed'),
  ('Africa/Maseru','Africa / Maseru','+02:00',false,'seed'),
  ('Africa/Mbabane','Africa / Mbabane','+02:00',false,'seed'),
  ('Africa/Mogadishu','Africa / Mogadishu','+03:00',false,'seed'),
  ('Africa/Monrovia','Africa / Monrovia','+00:00',false,'seed'),
  ('Africa/Nairobi','Africa / Nairobi','+03:00',false,'seed'),
  ('Africa/Ndjamena','Africa / Ndjamena','+01:00',false,'seed'),
  ('Africa/Niamey','Africa / Niamey','+01:00',false,'seed'),
  ('Africa/Nouakchott','Africa / Nouakchott','+00:00',false,'seed'),
  ('Africa/Ouagadougou','Africa / Ouagadougou','+00:00',false,'seed'),
  ('Africa/Porto-Novo','Africa / Porto-Novo','+01:00',false,'seed'),
  ('Africa/Sao_Tome','Africa / Sao Tome','+00:00',false,'seed'),
  ('Africa/Tripoli','Africa / Tripoli','+02:00',false,'seed'),
  ('Africa/Tunis','Africa / Tunis','+01:00',false,'seed'),
  ('Africa/Windhoek','Africa / Windhoek','+02:00',false,'seed')
on conflict (tzid) do nothing;

-- ============================================================================
-- America
-- ============================================================================
insert into ref.timezone (tzid, display_name, utc_offset, is_alias, created_by)
values
  ('America/Adak','America / Adak','-10:00',false,'seed'),
  ('America/Anchorage','America / Anchorage','-09:00',false,'seed'),
  ('America/Anguilla','America / Anguilla','-04:00',false,'seed'),
  ('America/Antigua','America / Antigua','-04:00',false,'seed'),
  ('America/Araguaina','America / Araguaina','-03:00',false,'seed'),
  ('America/Argentina/Buenos_Aires','America / Buenos Aires','-03:00',false,'seed'),
  ('America/Argentina/Cordoba','America / Cordoba','-03:00',false,'seed'),
  ('America/Argentina/Salta','America / Salta','-03:00',false,'seed'),
  ('America/Aruba','America / Aruba','-04:00',false,'seed'),
  ('America/Asuncion','America / Asuncion','-04:00',false,'seed'),
  ('America/Atikokan','America / Atikokan','-05:00',false,'seed'),
  ('America/Bahia','America / Bahia','-03:00',false,'seed'),
  ('America/Barbados','America / Barbados','-04:00',false,'seed'),
  ('America/Belem','America / Belem','-03:00',false,'seed'),
  ('America/Belize','America / Belize','-06:00',false,'seed'),
  ('America/Bogota','America / Bogota','-05:00',false,'seed'),
  ('America/Boise','America / Boise','-07:00',false,'seed'),
  ('America/Cambridge_Bay','America / Cambridge Bay','-07:00',false,'seed'),
  ('America/Campo_Grande','America / Campo Grande','-04:00',false,'seed'),
  ('America/Cancun','America / Cancun','-05:00',false,'seed'),
  ('America/Caracas','America / Caracas','-04:00',false,'seed'),
  ('America/Cayenne','America / Cayenne','-03:00',false,'seed'),
  ('America/Cayman','America / Cayman','-05:00',false,'seed'),
  ('America/Chicago','America / Chicago','-06:00',false,'seed'),
  ('America/Chihuahua','America / Chihuahua','-06:00',false,'seed'),
  ('America/Costa_Rica','America / Costa Rica','-06:00',false,'seed'),
  ('America/Cuiaba','America / Cuiaba','-04:00',false,'seed'),
  ('America/Curacao','America / Curacao','-04:00',false,'seed'),
  ('America/Dawson','America / Dawson','-07:00',false,'seed'),
  ('America/Dawson_Creek','America / Dawson Creek','-07:00',false,'seed'),
  ('America/Denver','America / Denver','-07:00',false,'seed'),
  ('America/Detroit','America / Detroit','-05:00',false,'seed'),
  ('America/Dominica','America / Dominica','-04:00',false,'seed'),
  ('America/Edmonton','America / Edmonton','-07:00',false,'seed'),
  ('America/El_Salvador','America / El Salvador','-06:00',false,'seed'),
  ('America/Fortaleza','America / Fortaleza','-03:00',false,'seed'),
  ('America/Godthab','America / Nuuk','-03:00',false,'seed'),
  ('America/Grand_Turk','America / Grand Turk','-05:00',false,'seed'),
  ('America/Grenada','America / Grenada','-04:00',false,'seed'),
  ('America/Guadeloupe','America / Guadeloupe','-04:00',false,'seed'),
  ('America/Guatemala','America / Guatemala','-06:00',false,'seed'),
  ('America/Guayaquil','America / Guayaquil','-05:00',false,'seed'),
  ('America/Guyana','America / Guyana','-04:00',false,'seed'),
  ('America/Halifax','America / Halifax','-04:00',false,'seed'),
  ('America/Havana','America / Havana','-05:00',false,'seed'),
  ('America/Hermosillo','America / Hermosillo','-07:00',false,'seed'),
  ('America/Indiana/Indianapolis','America / Indianapolis','-05:00',false,'seed'),
  ('America/Iqaluit','America / Iqaluit','-05:00',false,'seed'),
  ('America/Jamaica','America / Jamaica','-05:00',false,'seed'),
  ('America/Juneau','America / Juneau','-09:00',false,'seed'),
  ('America/Kentucky/Louisville','America / Louisville','-05:00',false,'seed'),
  ('America/La_Paz','America / La Paz','-04:00',false,'seed'),
  ('America/Lima','America / Lima','-05:00',false,'seed'),
  ('America/Los_Angeles','America / Los Angeles','-08:00',false,'seed'),
  ('America/Managua','America / Managua','-06:00',false,'seed'),
  ('America/Manaus','America / Manaus','-04:00',false,'seed'),
  ('America/Martinique','America / Martinique','-04:00',false,'seed'),
  ('America/Mazatlan','America / Mazatlan','-07:00',false,'seed'),
  ('America/Mexico_City','America / Mexico City','-06:00',false,'seed'),
  ('America/Miquelon','America / Miquelon','-03:00',false,'seed'),
  ('America/Moncton','America / Moncton','-04:00',false,'seed'),
  ('America/Monterrey','America / Monterrey','-06:00',false,'seed'),
  ('America/Montevideo','America / Montevideo','-03:00',false,'seed'),
  ('America/Montserrat','America / Montserrat','-04:00',false,'seed'),
  ('America/Nassau','America / Nassau','-05:00',false,'seed'),
  ('America/New_York','America / New York','-05:00',false,'seed'),
  ('America/Nipigon','America / Nipigon','-05:00',false,'seed'),
  ('America/Nome','America / Nome','-09:00',false,'seed'),
  ('America/Noronha','America / Noronha','-02:00',false,'seed'),
  ('America/Panama','America / Panama','-05:00',false,'seed'),
  ('America/Paramaribo','America / Paramaribo','-03:00',false,'seed'),
  ('America/Phoenix','America / Phoenix','-07:00',false,'seed'),
  ('America/Port-au-Prince','America / Port-au-Prince','-05:00',false,'seed'),
  ('America/Port_of_Spain','America / Port of Spain','-04:00',false,'seed'),
  ('America/Puerto_Rico','America / Puerto Rico','-04:00',false,'seed'),
  ('America/Rankin_Inlet','America / Rankin Inlet','-06:00',false,'seed'),
  ('America/Recife','America / Recife','-03:00',false,'seed'),
  ('America/Regina','America / Regina','-06:00',false,'seed'),
  ('America/Rio_Branco','America / Rio Branco','-05:00',false,'seed'),
  ('America/Santiago','America / Santiago','-04:00',false,'seed'),
  ('America/Santo_Domingo','America / Santo Domingo','-04:00',false,'seed'),
  ('America/Sao_Paulo','America / Sao Paulo','-03:00',false,'seed'),
  ('America/St_Johns','America / St. John''s','-03:30',false,'seed'),
  ('America/St_Kitts','America / St. Kitts','-04:00',false,'seed'),
  ('America/St_Lucia','America / St. Lucia','-04:00',false,'seed'),
  ('America/St_Vincent','America / St. Vincent','-04:00',false,'seed'),
  ('America/Tegucigalpa','America / Tegucigalpa','-06:00',false,'seed'),
  ('America/Thule','America / Thule','-04:00',false,'seed'),
  ('America/Thunder_Bay','America / Thunder Bay','-05:00',false,'seed'),
  ('America/Tijuana','America / Tijuana','-08:00',false,'seed'),
  ('America/Toronto','America / Toronto','-05:00',false,'seed'),
  ('America/Tortola','America / Tortola','-04:00',false,'seed'),
  ('America/Vancouver','America / Vancouver','-08:00',false,'seed'),
  ('America/Whitehorse','America / Whitehorse','-07:00',false,'seed'),
  ('America/Winnipeg','America / Winnipeg','-06:00',false,'seed'),
  ('America/Yakutat','America / Yakutat','-09:00',false,'seed'),
  ('America/Yellowknife','America / Yellowknife','-07:00',false,'seed')
on conflict (tzid) do nothing;

-- ============================================================================
-- Antarctica
-- ============================================================================
insert into ref.timezone (tzid, display_name, utc_offset, is_alias, created_by)
values
  ('Antarctica/Casey','Antarctica / Casey','+11:00',false,'seed'),
  ('Antarctica/Davis','Antarctica / Davis','+07:00',false,'seed'),
  ('Antarctica/DumontDUrville','Antarctica / Dumont d''Urville','+10:00',false,'seed'),
  ('Antarctica/Macquarie','Antarctica / Macquarie','+11:00',false,'seed'),
  ('Antarctica/Mawson','Antarctica / Mawson','+05:00',false,'seed'),
  ('Antarctica/McMurdo','Antarctica / McMurdo','+12:00',false,'seed'),
  ('Antarctica/Palmer','Antarctica / Palmer','-03:00',false,'seed'),
  ('Antarctica/Rothera','Antarctica / Rothera','-03:00',false,'seed'),
  ('Antarctica/Syowa','Antarctica / Syowa','+03:00',false,'seed'),
  ('Antarctica/Troll','Antarctica / Troll','+00:00',false,'seed'),
  ('Antarctica/Vostok','Antarctica / Vostok','+06:00',false,'seed')
on conflict (tzid) do nothing;

-- ============================================================================
-- Asia
-- ============================================================================
insert into ref.timezone (tzid, display_name, utc_offset, is_alias, created_by)
values
  ('Asia/Aden','Asia / Aden','+03:00',false,'seed'),
  ('Asia/Almaty','Asia / Almaty','+06:00',false,'seed'),
  ('Asia/Amman','Asia / Amman','+03:00',false,'seed'),
  ('Asia/Anadyr','Asia / Anadyr','+12:00',false,'seed'),
  ('Asia/Aqtau','Asia / Aqtau','+05:00',false,'seed'),
  ('Asia/Aqtobe','Asia / Aqtobe','+05:00',false,'seed'),
  ('Asia/Ashgabat','Asia / Ashgabat','+05:00',false,'seed'),
  ('Asia/Atyrau','Asia / Atyrau','+05:00',false,'seed'),
  ('Asia/Baghdad','Asia / Baghdad','+03:00',false,'seed'),
  ('Asia/Bahrain','Asia / Bahrain','+03:00',false,'seed'),
  ('Asia/Baku','Asia / Baku','+04:00',false,'seed'),
  ('Asia/Bangkok','Asia / Bangkok','+07:00',false,'seed'),
  ('Asia/Barnaul','Asia / Barnaul','+07:00',false,'seed'),
  ('Asia/Beirut','Asia / Beirut','+02:00',false,'seed'),
  ('Asia/Bishkek','Asia / Bishkek','+06:00',false,'seed'),
  ('Asia/Brunei','Asia / Brunei','+08:00',false,'seed'),
  ('Asia/Chita','Asia / Chita','+09:00',false,'seed'),
  ('Asia/Choibalsan','Asia / Choibalsan','+08:00',false,'seed'),
  ('Asia/Colombo','Asia / Colombo','+05:30',false,'seed'),
  ('Asia/Damascus','Asia / Damascus','+03:00',false,'seed'),
  ('Asia/Dhaka','Asia / Dhaka','+06:00',false,'seed'),
  ('Asia/Dili','Asia / Dili','+09:00',false,'seed'),
  ('Asia/Dubai','Asia / Dubai','+04:00',false,'seed'),
  ('Asia/Dushanbe','Asia / Dushanbe','+05:00',false,'seed'),
  ('Asia/Famagusta','Asia / Famagusta','+02:00',false,'seed'),
  ('Asia/Gaza','Asia / Gaza','+02:00',false,'seed'),
  ('Asia/Hebron','Asia / Hebron','+02:00',false,'seed'),
  ('Asia/Ho_Chi_Minh','Asia / Ho Chi Minh','+07:00',false,'seed'),
  ('Asia/Hong_Kong','Asia / Hong Kong','+08:00',false,'seed'),
  ('Asia/Hovd','Asia / Hovd','+07:00',false,'seed'),
  ('Asia/Irkutsk','Asia / Irkutsk','+08:00',false,'seed'),
  ('Asia/Jakarta','Asia / Jakarta','+07:00',false,'seed'),
  ('Asia/Jayapura','Asia / Jayapura','+09:00',false,'seed'),
  ('Asia/Jerusalem','Asia / Jerusalem','+02:00',false,'seed'),
  ('Asia/Kabul','Asia / Kabul','+04:30',false,'seed'),
  ('Asia/Kamchatka','Asia / Kamchatka','+12:00',false,'seed'),
  ('Asia/Karachi','Asia / Karachi','+05:00',false,'seed'),
  ('Asia/Kathmandu','Asia / Kathmandu','+05:45',false,'seed'),
  ('Asia/Khandyga','Asia / Khandyga','+09:00',false,'seed'),
  ('Asia/Kolkata','Asia / Kolkata','+05:30',false,'seed'),
  ('Asia/Krasnoyarsk','Asia / Krasnoyarsk','+07:00',false,'seed'),
  ('Asia/Kuala_Lumpur','Asia / Kuala Lumpur','+08:00',false,'seed'),
  ('Asia/Kuching','Asia / Kuching','+08:00',false,'seed'),
  ('Asia/Kuwait','Asia / Kuwait','+03:00',false,'seed'),
  ('Asia/Macau','Asia / Macau','+08:00',false,'seed'),
  ('Asia/Magadan','Asia / Magadan','+11:00',false,'seed'),
  ('Asia/Makassar','Asia / Makassar','+08:00',false,'seed'),
  ('Asia/Manila','Asia / Manila','+08:00',false,'seed'),
  ('Asia/Muscat','Asia / Muscat','+04:00',false,'seed'),
  ('Asia/Nicosia','Asia / Nicosia','+02:00',false,'seed'),
  ('Asia/Novokuznetsk','Asia / Novokuznetsk','+07:00',false,'seed'),
  ('Asia/Novosibirsk','Asia / Novosibirsk','+07:00',false,'seed'),
  ('Asia/Omsk','Asia / Omsk','+06:00',false,'seed'),
  ('Asia/Oral','Asia / Oral','+05:00',false,'seed'),
  ('Asia/Phnom_Penh','Asia / Phnom Penh','+07:00',false,'seed'),
  ('Asia/Pontianak','Asia / Pontianak','+07:00',false,'seed'),
  ('Asia/Pyongyang','Asia / Pyongyang','+09:00',false,'seed'),
  ('Asia/Qatar','Asia / Qatar','+03:00',false,'seed'),
  ('Asia/Qostanay','Asia / Qostanay','+06:00',false,'seed'),
  ('Asia/Qyzylorda','Asia / Qyzylorda','+05:00',false,'seed'),
  ('Asia/Riyadh','Asia / Riyadh','+03:00',false,'seed'),
  ('Asia/Sakhalin','Asia / Sakhalin','+11:00',false,'seed'),
  ('Asia/Samarkand','Asia / Samarkand','+05:00',false,'seed'),
  ('Asia/Seoul','Asia / Seoul','+09:00',false,'seed'),
  ('Asia/Shanghai','Asia / Shanghai','+08:00',false,'seed'),
  ('Asia/Singapore','Asia / Singapore','+08:00',false,'seed'),
  ('Asia/Srednekolymsk','Asia / Srednekolymsk','+11:00',false,'seed'),
  ('Asia/Taipei','Asia / Taipei','+08:00',false,'seed'),
  ('Asia/Tashkent','Asia / Tashkent','+05:00',false,'seed'),
  ('Asia/Tbilisi','Asia / Tbilisi','+04:00',false,'seed'),
  ('Asia/Tehran','Asia / Tehran','+03:30',false,'seed'),
  ('Asia/Thimphu','Asia / Thimphu','+06:00',false,'seed'),
  ('Asia/Tokyo','Asia / Tokyo','+09:00',false,'seed'),
  ('Asia/Tomsk','Asia / Tomsk','+07:00',false,'seed'),
  ('Asia/Ulaanbaatar','Asia / Ulaanbaatar','+08:00',false,'seed'),
  ('Asia/Urumqi','Asia / Urumqi','+06:00',false,'seed'),
  ('Asia/Ust-Nera','Asia / Ust-Nera','+10:00',false,'seed'),
  ('Asia/Vientiane','Asia / Vientiane','+07:00',false,'seed'),
  ('Asia/Vladivostok','Asia / Vladivostok','+10:00',false,'seed'),
  ('Asia/Yakutsk','Asia / Yakutsk','+09:00',false,'seed'),
  ('Asia/Yangon','Asia / Yangon','+06:30',false,'seed'),
  ('Asia/Yekaterinburg','Asia / Yekaterinburg','+05:00',false,'seed'),
  ('Asia/Yerevan','Asia / Yerevan','+04:00',false,'seed')
on conflict (tzid) do nothing;

-- ============================================================================
-- Atlantic
-- ============================================================================
insert into ref.timezone (tzid, display_name, utc_offset, is_alias, created_by)
values
  ('Atlantic/Azores','Atlantic / Azores','-01:00',false,'seed'),
  ('Atlantic/Bermuda','Atlantic / Bermuda','-04:00',false,'seed'),
  ('Atlantic/Canary','Atlantic / Canary','+00:00',false,'seed'),
  ('Atlantic/Cape_Verde','Atlantic / Cape Verde','-01:00',false,'seed'),
  ('Atlantic/Faroe','Atlantic / Faroe','+00:00',false,'seed'),
  ('Atlantic/Madeira','Atlantic / Madeira','+00:00',false,'seed'),
  ('Atlantic/Reykjavik','Atlantic / Reykjavik','+00:00',false,'seed'),
  ('Atlantic/South_Georgia','Atlantic / South Georgia','-02:00',false,'seed'),
  ('Atlantic/St_Helena','Atlantic / St. Helena','+00:00',false,'seed'),
  ('Atlantic/Stanley','Atlantic / Stanley','-03:00',false,'seed')
on conflict (tzid) do nothing;

-- ============================================================================
-- Australia
-- ============================================================================
insert into ref.timezone (tzid, display_name, utc_offset, is_alias, created_by)
values
  ('Australia/Adelaide','Australia / Adelaide','+09:30',false,'seed'),
  ('Australia/Brisbane','Australia / Brisbane','+10:00',false,'seed'),
  ('Australia/Broken_Hill','Australia / Broken Hill','+09:30',false,'seed'),
  ('Australia/Darwin','Australia / Darwin','+09:30',false,'seed'),
  ('Australia/Eucla','Australia / Eucla','+08:45',false,'seed'),
  ('Australia/Hobart','Australia / Hobart','+10:00',false,'seed'),
  ('Australia/Lindeman','Australia / Lindeman','+10:00',false,'seed'),
  ('Australia/Lord_Howe','Australia / Lord Howe','+10:30',false,'seed'),
  ('Australia/Melbourne','Australia / Melbourne','+10:00',false,'seed'),
  ('Australia/Perth','Australia / Perth','+08:00',false,'seed'),
  ('Australia/Sydney','Australia / Sydney','+10:00',false,'seed')
on conflict (tzid) do nothing;

-- ============================================================================
-- Europe
-- ============================================================================
insert into ref.timezone (tzid, display_name, utc_offset, is_alias, created_by)
values
  ('Europe/Amsterdam','Europe / Amsterdam','+01:00',false,'seed'),
  ('Europe/Andorra','Europe / Andorra','+01:00',false,'seed'),
  ('Europe/Astrakhan','Europe / Astrakhan','+04:00',false,'seed'),
  ('Europe/Athens','Europe / Athens','+02:00',false,'seed'),
  ('Europe/Belgrade','Europe / Belgrade','+01:00',false,'seed'),
  ('Europe/Berlin','Europe / Berlin','+01:00',false,'seed'),
  ('Europe/Bratislava','Europe / Bratislava','+01:00',false,'seed'),
  ('Europe/Brussels','Europe / Brussels','+01:00',false,'seed'),
  ('Europe/Bucharest','Europe / Bucharest','+02:00',false,'seed'),
  ('Europe/Budapest','Europe / Budapest','+01:00',false,'seed'),
  ('Europe/Busingen','Europe / Busingen','+01:00',false,'seed'),
  ('Europe/Chisinau','Europe / Chisinau','+02:00',false,'seed'),
  ('Europe/Copenhagen','Europe / Copenhagen','+01:00',false,'seed'),
  ('Europe/Dublin','Europe / Dublin','+01:00',false,'seed'),
  ('Europe/Gibraltar','Europe / Gibraltar','+01:00',false,'seed'),
  ('Europe/Guernsey','Europe / Guernsey','+00:00',false,'seed'),
  ('Europe/Helsinki','Europe / Helsinki','+02:00',false,'seed'),
  ('Europe/Isle_of_Man','Europe / Isle of Man','+00:00',false,'seed'),
  ('Europe/Istanbul','Europe / Istanbul','+03:00',false,'seed'),
  ('Europe/Jersey','Europe / Jersey','+00:00',false,'seed'),
  ('Europe/Kaliningrad','Europe / Kaliningrad','+02:00',false,'seed'),
  ('Europe/Kiev','Europe / Kyiv','+02:00',false,'seed'),
  ('Europe/Kirov','Europe / Kirov','+03:00',false,'seed'),
  ('Europe/Lisbon','Europe / Lisbon','+00:00',false,'seed'),
  ('Europe/Ljubljana','Europe / Ljubljana','+01:00',false,'seed'),
  ('Europe/London','Europe / London','+00:00',false,'seed'),
  ('Europe/Luxembourg','Europe / Luxembourg','+01:00',false,'seed'),
  ('Europe/Madrid','Europe / Madrid','+01:00',false,'seed'),
  ('Europe/Malta','Europe / Malta','+01:00',false,'seed'),
  ('Europe/Mariehamn','Europe / Mariehamn','+02:00',false,'seed'),
  ('Europe/Minsk','Europe / Minsk','+03:00',false,'seed'),
  ('Europe/Monaco','Europe / Monaco','+01:00',false,'seed'),
  ('Europe/Moscow','Europe / Moscow','+03:00',false,'seed'),
  ('Europe/Oslo','Europe / Oslo','+01:00',false,'seed'),
  ('Europe/Paris','Europe / Paris','+01:00',false,'seed'),
  ('Europe/Podgorica','Europe / Podgorica','+01:00',false,'seed'),
  ('Europe/Prague','Europe / Prague','+01:00',false,'seed'),
  ('Europe/Riga','Europe / Riga','+02:00',false,'seed'),
  ('Europe/Rome','Europe / Rome','+01:00',false,'seed'),
  ('Europe/Samara','Europe / Samara','+04:00',false,'seed'),
  ('Europe/San_Marino','Europe / San Marino','+01:00',false,'seed'),
  ('Europe/Sarajevo','Europe / Sarajevo','+01:00',false,'seed'),
  ('Europe/Saratov','Europe / Saratov','+04:00',false,'seed'),
  ('Europe/Simferopol','Europe / Simferopol','+03:00',false,'seed'),
  ('Europe/Skopje','Europe / Skopje','+01:00',false,'seed'),
  ('Europe/Sofia','Europe / Sofia','+02:00',false,'seed'),
  ('Europe/Stockholm','Europe / Stockholm','+01:00',false,'seed'),
  ('Europe/Tallinn','Europe / Tallinn','+02:00',false,'seed'),
  ('Europe/Tirane','Europe / Tirane','+01:00',false,'seed'),
  ('Europe/Ulyanovsk','Europe / Ulyanovsk','+04:00',false,'seed'),
  ('Europe/Vaduz','Europe / Vaduz','+01:00',false,'seed'),
  ('Europe/Vatican','Europe / Vatican','+01:00',false,'seed'),
  ('Europe/Vienna','Europe / Vienna','+01:00',false,'seed'),
  ('Europe/Vilnius','Europe / Vilnius','+02:00',false,'seed'),
  ('Europe/Volgograd','Europe / Volgograd','+03:00',false,'seed'),
  ('Europe/Warsaw','Europe / Warsaw','+01:00',false,'seed'),
  ('Europe/Zagreb','Europe / Zagreb','+01:00',false,'seed'),
  ('Europe/Zurich','Europe / Zurich','+01:00',false,'seed')
on conflict (tzid) do nothing;

-- ============================================================================
-- Indian
-- ============================================================================
insert into ref.timezone (tzid, display_name, utc_offset, is_alias, created_by)
values
  ('Indian/Antananarivo','Indian / Antananarivo','+03:00',false,'seed'),
  ('Indian/Chagos','Indian / Chagos','+06:00',false,'seed'),
  ('Indian/Christmas','Indian / Christmas','+07:00',false,'seed'),
  ('Indian/Cocos','Indian / Cocos','+06:30',false,'seed'),
  ('Indian/Comoro','Indian / Comoro','+03:00',false,'seed'),
  ('Indian/Kerguelen','Indian / Kerguelen','+05:00',false,'seed'),
  ('Indian/Mahe','Indian / Mahe','+04:00',false,'seed'),
  ('Indian/Maldives','Indian / Maldives','+05:00',false,'seed'),
  ('Indian/Mauritius','Indian / Mauritius','+04:00',false,'seed'),
  ('Indian/Mayotte','Indian / Mayotte','+03:00',false,'seed'),
  ('Indian/Reunion','Indian / Reunion','+04:00',false,'seed')
on conflict (tzid) do nothing;

-- ============================================================================
-- Pacific
-- ============================================================================
insert into ref.timezone (tzid, display_name, utc_offset, is_alias, created_by)
values
  ('Pacific/Apia','Pacific / Apia','+13:00',false,'seed'),
  ('Pacific/Auckland','Pacific / Auckland','+12:00',false,'seed'),
  ('Pacific/Bougainville','Pacific / Bougainville','+11:00',false,'seed'),
  ('Pacific/Chatham','Pacific / Chatham','+12:45',false,'seed'),
  ('Pacific/Chuuk','Pacific / Chuuk','+10:00',false,'seed'),
  ('Pacific/Easter','Pacific / Easter','-06:00',false,'seed'),
  ('Pacific/Efate','Pacific / Efate','+11:00',false,'seed'),
  ('Pacific/Fakaofo','Pacific / Fakaofo','+13:00',false,'seed'),
  ('Pacific/Fiji','Pacific / Fiji','+12:00',false,'seed'),
  ('Pacific/Funafuti','Pacific / Funafuti','+12:00',false,'seed'),
  ('Pacific/Galapagos','Pacific / Galapagos','-06:00',false,'seed'),
  ('Pacific/Gambier','Pacific / Gambier','-09:00',false,'seed'),
  ('Pacific/Guadalcanal','Pacific / Guadalcanal','+11:00',false,'seed'),
  ('Pacific/Guam','Pacific / Guam','+10:00',false,'seed'),
  ('Pacific/Honolulu','Pacific / Honolulu','-10:00',false,'seed'),
  ('Pacific/Kanton','Pacific / Kanton','+13:00',false,'seed'),
  ('Pacific/Kiritimati','Pacific / Kiritimati','+14:00',false,'seed'),
  ('Pacific/Kosrae','Pacific / Kosrae','+11:00',false,'seed'),
  ('Pacific/Kwajalein','Pacific / Kwajalein','+12:00',false,'seed'),
  ('Pacific/Majuro','Pacific / Majuro','+12:00',false,'seed'),
  ('Pacific/Marquesas','Pacific / Marquesas','-09:30',false,'seed'),
  ('Pacific/Midway','Pacific / Midway','-11:00',false,'seed'),
  ('Pacific/Nauru','Pacific / Nauru','+12:00',false,'seed'),
  ('Pacific/Niue','Pacific / Niue','-11:00',false,'seed'),
  ('Pacific/Norfolk','Pacific / Norfolk','+11:00',false,'seed'),
  ('Pacific/Noumea','Pacific / Noumea','+11:00',false,'seed'),
  ('Pacific/Pago_Pago','Pacific / Pago Pago','-11:00',false,'seed'),
  ('Pacific/Palau','Pacific / Palau','+09:00',false,'seed'),
  ('Pacific/Pitcairn','Pacific / Pitcairn','-08:00',false,'seed'),
  ('Pacific/Pohnpei','Pacific / Pohnpei','+11:00',false,'seed'),
  ('Pacific/Port_Moresby','Pacific / Port Moresby','+10:00',false,'seed'),
  ('Pacific/Rarotonga','Pacific / Rarotonga','-10:00',false,'seed'),
  ('Pacific/Tahiti','Pacific / Tahiti','-10:00',false,'seed'),
  ('Pacific/Tarawa','Pacific / Tarawa','+12:00',false,'seed'),
  ('Pacific/Tongatapu','Pacific / Tongatapu','+13:00',false,'seed'),
  ('Pacific/Wake','Pacific / Wake','+12:00',false,'seed'),
  ('Pacific/Wallis','Pacific / Wallis','+12:00',false,'seed')
on conflict (tzid) do nothing;

-- ============================================================================
-- Aliases (legacy names → canonical)
-- ============================================================================
insert into ref.timezone (tzid, display_name, utc_offset, is_alias, canonical_tzid, created_by)
values
  ('GMT','GMT','+00:00',true,'Etc/GMT','seed'),
  ('UTC','UTC','+00:00',true,'Etc/UTC','seed'),
  ('US/Eastern','US / Eastern','-05:00',true,'America/New_York','seed'),
  ('US/Central','US / Central','-06:00',true,'America/Chicago','seed'),
  ('US/Mountain','US / Mountain','-07:00',true,'America/Denver','seed'),
  ('US/Pacific','US / Pacific','-08:00',true,'America/Los_Angeles','seed'),
  ('US/Alaska','US / Alaska','-09:00',true,'America/Anchorage','seed'),
  ('US/Hawaii','US / Hawaii','-10:00',true,'America/Adak','seed'),
  ('US/Arizona','US / Arizona','-07:00',true,'America/Phoenix','seed'),
  ('Canada/Atlantic','Canada / Atlantic','-04:00',true,'America/Halifax','seed'),
  ('Canada/Central','Canada / Central','-06:00',true,'America/Winnipeg','seed'),
  ('Canada/Eastern','Canada / Eastern','-05:00',true,'America/Toronto','seed'),
  ('Canada/Mountain','Canada / Mountain','-07:00',true,'America/Edmonton','seed'),
  ('Canada/Newfoundland','Canada / Newfoundland','-03:30',true,'America/St_Johns','seed'),
  ('Canada/Pacific','Canada / Pacific','-08:00',true,'America/Vancouver','seed'),
  ('Australia/ACT','Australia / ACT','+10:00',true,'Australia/Sydney','seed'),
  ('Australia/North','Australia / North','+09:30',true,'Australia/Darwin','seed'),
  ('Australia/Queensland','Australia / Queensland','+10:00',true,'Australia/Brisbane','seed'),
  ('Australia/South','Australia / South','+09:30',true,'Australia/Adelaide','seed'),
  ('Australia/West','Australia / West','+08:00',true,'Australia/Perth','seed')
on conflict (tzid) do nothing;

-- ============================================================================
-- §7  UNITS OF MEASURE (UN/ECE Rec 20)
-- ============================================================================

/* ============================================================================
   Athyper — REF Seed: Units of Measure (UN/ECE Rec 20)
   PostgreSQL 16+

   Curated set of commonly used UN/ECE Recommendation 20 units.
   Depends on: 010_ref_master_tables.sql
   ============================================================================ */

-- ============================================================================
-- Count / Quantity
-- ============================================================================
insert into ref.uom (code, name, symbol, quantity_type, created_by)
values
  ('C62','One (unit)','1','count','seed'),
  ('EA','Each','ea','count','seed'),
  ('PR','Pair','pr','count','seed'),
  ('DZN','Dozen','doz','count','seed'),
  ('GRO','Gross','gr','count','seed'),
  ('SET','Set',null,'count','seed'),
  ('PK','Pack',null,'count','seed'),
  ('BX','Box',null,'count','seed'),
  ('CT','Carton',null,'count','seed'),
  ('CS','Case',null,'count','seed'),
  ('PL','Pallet',null,'count','seed'),
  ('RL','Roll',null,'count','seed'),
  ('SH','Sheet',null,'count','seed'),
  ('BA','Barrel',null,'count','seed')
on conflict (code) do nothing;

-- ============================================================================
-- Mass / Weight
-- ============================================================================
insert into ref.uom (code, name, symbol, quantity_type, created_by)
values
  ('MGM','Milligram','mg','mass','seed'),
  ('GRM','Gram','g','mass','seed'),
  ('KGM','Kilogram','kg','mass','seed'),
  ('TNE','Metric Ton (Tonne)','t','mass','seed'),
  ('LBR','Pound','lb','mass','seed'),
  ('ONZ','Ounce','oz','mass','seed'),
  ('CWA','Hundredweight (US)','cwt','mass','seed'),
  ('STN','Short Ton (US)','ton','mass','seed'),
  ('LTN','Long Ton (UK)','long tn','mass','seed'),
  ('MC','Microgram','µg','mass','seed'),
  ('DTN','Decitonne','dt','mass','seed'),
  ('APZ','Troy Ounce','oz t','mass','seed'),
  ('CGM','Centigram','cg','mass','seed')
on conflict (code) do nothing;

-- ============================================================================
-- Length / Distance
-- ============================================================================
insert into ref.uom (code, name, symbol, quantity_type, created_by)
values
  ('MMT','Millimetre','mm','length','seed'),
  ('CMT','Centimetre','cm','length','seed'),
  ('MTR','Metre','m','length','seed'),
  ('KMT','Kilometre','km','length','seed'),
  ('INH','Inch','in','length','seed'),
  ('FOT','Foot','ft','length','seed'),
  ('YRD','Yard','yd','length','seed'),
  ('SMI','Statute Mile','mi','length','seed'),
  ('NMI','Nautical Mile','nmi','length','seed'),
  ('DMT','Decimetre','dm','length','seed'),
  ('A11','Micrometre','µm','length','seed')
on conflict (code) do nothing;

-- ============================================================================
-- Area
-- ============================================================================
insert into ref.uom (code, name, symbol, quantity_type, created_by)
values
  ('CMK','Square Centimetre','cm²','area','seed'),
  ('MTK','Square Metre','m²','area','seed'),
  ('KMK','Square Kilometre','km²','area','seed'),
  ('HAR','Hectare','ha','area','seed'),
  ('ACR','Acre','ac','area','seed'),
  ('FTK','Square Foot','ft²','area','seed'),
  ('INK','Square Inch','in²','area','seed'),
  ('YDK','Square Yard','yd²','area','seed')
on conflict (code) do nothing;

-- ============================================================================
-- Volume / Capacity
-- ============================================================================
insert into ref.uom (code, name, symbol, quantity_type, created_by)
values
  ('MLT','Millilitre','mL','volume','seed'),
  ('CLT','Centilitre','cL','volume','seed'),
  ('DLT','Decilitre','dL','volume','seed'),
  ('LTR','Litre','L','volume','seed'),
  ('HLT','Hectolitre','hL','volume','seed'),
  ('CMQ','Cubic Centimetre','cm³','volume','seed'),
  ('DMQ','Cubic Decimetre','dm³','volume','seed'),
  ('MTQ','Cubic Metre','m³','volume','seed'),
  ('INQ','Cubic Inch','in³','volume','seed'),
  ('FTQ','Cubic Foot','ft³','volume','seed'),
  ('YDQ','Cubic Yard','yd³','volume','seed'),
  ('GLL','Gallon (US)','gal','volume','seed'),
  ('GLI','Gallon (UK)','gal','volume','seed'),
  ('QTI','Quart (US)','qt','volume','seed'),
  ('PTI','Pint (US)','pt','volume','seed'),
  ('OZA','Fluid Ounce (US)','fl oz','volume','seed'),
  ('BLL','Barrel (US petroleum)','bbl','volume','seed')
on conflict (code) do nothing;

-- ============================================================================
-- Time
-- ============================================================================
insert into ref.uom (code, name, symbol, quantity_type, created_by)
values
  ('SEC','Second','s','time','seed'),
  ('MIN','Minute','min','time','seed'),
  ('HUR','Hour','h','time','seed'),
  ('DAY','Day','d','time','seed'),
  ('WEE','Week','wk','time','seed'),
  ('MON','Month','mo','time','seed'),
  ('ANN','Year','a','time','seed')
on conflict (code) do nothing;

-- ============================================================================
-- Temperature
-- ============================================================================
insert into ref.uom (code, name, symbol, quantity_type, created_by)
values
  ('CEL','Degree Celsius','°C','temperature','seed'),
  ('FAH','Degree Fahrenheit','°F','temperature','seed'),
  ('KEL','Kelvin','K','temperature','seed')
on conflict (code) do nothing;

-- ============================================================================
-- Speed / Velocity
-- ============================================================================
insert into ref.uom (code, name, symbol, quantity_type, created_by)
values
  ('KMH','Kilometre per Hour','km/h','speed','seed'),
  ('MTS','Metre per Second','m/s','speed','seed'),
  ('KNT','Knot','kn','speed','seed'),
  ('HM','Mile per Hour','mph','speed','seed')
on conflict (code) do nothing;

-- ============================================================================
-- Force / Pressure
-- ============================================================================
insert into ref.uom (code, name, symbol, quantity_type, created_by)
values
  ('NEW','Newton','N','force','seed'),
  ('KGF','Kilogram-force','kgf','force','seed'),
  ('PAL','Pascal','Pa','pressure','seed'),
  ('KPA','Kilopascal','kPa','pressure','seed'),
  ('MPA','Megapascal','MPa','pressure','seed'),
  ('BAR','Bar','bar','pressure','seed'),
  ('ATM','Standard Atmosphere','atm','pressure','seed'),
  ('PS','Pound per Square Inch','psi','pressure','seed')
on conflict (code) do nothing;

-- ============================================================================
-- Energy / Power
-- ============================================================================
insert into ref.uom (code, name, symbol, quantity_type, created_by)
values
  ('JOU','Joule','J','energy','seed'),
  ('KJO','Kilojoule','kJ','energy','seed'),
  ('WHR','Watt-hour','Wh','energy','seed'),
  ('KWH','Kilowatt-hour','kWh','energy','seed'),
  ('MWH','Megawatt-hour','MWh','energy','seed'),
  ('WTT','Watt','W','energy','seed'),
  ('KWT','Kilowatt','kW','energy','seed'),
  ('MAW','Megawatt','MW','energy','seed'),
  ('BTU','British Thermal Unit','BTU','energy','seed'),
  ('A53','Electronvolt','eV','energy','seed')
on conflict (code) do nothing;

-- ============================================================================
-- Electric
-- ============================================================================
insert into ref.uom (code, name, symbol, quantity_type, created_by)
values
  ('AMP','Ampere','A','electric','seed'),
  ('B22','Kiloampere','kA','electric','seed'),
  ('VLT','Volt','V','electric','seed'),
  ('KVT','Kilovolt','kV','electric','seed'),
  ('OHM','Ohm','Ω','electric','seed'),
  ('FAR','Farad','F','electric','seed'),
  ('B69','Microfarad','µF','electric','seed'),
  ('D10','Siemens','S','electric','seed')
on conflict (code) do nothing;

-- ============================================================================
-- Frequency
-- ============================================================================
insert into ref.uom (code, name, symbol, quantity_type, created_by)
values
  ('HTZ','Hertz','Hz','frequency','seed'),
  ('KHZ','Kilohertz','kHz','frequency','seed'),
  ('MHZ','Megahertz','MHz','frequency','seed'),
  ('A86','Gigahertz','GHz','frequency','seed')
on conflict (code) do nothing;

-- ============================================================================
-- Data
-- ============================================================================
insert into ref.uom (code, name, symbol, quantity_type, created_by)
values
  ('AD','Byte','B','data','seed'),
  ('E36','Kilobyte','KB','data','seed'),
  ('4L','Megabyte','MB','data','seed'),
  ('E34','Gigabyte','GB','data','seed'),
  ('E35','Terabyte','TB','data','seed'),
  ('E68','Bit','bit','data','seed')
on conflict (code) do nothing;

-- ============================================================================
-- Angle
-- ============================================================================
insert into ref.uom (code, name, symbol, quantity_type, created_by)
values
  ('DD','Degree (angle)','°','angle','seed'),
  ('RAD','Radian','rad','angle','seed'),
  ('D61','Minute (angle)','''','angle','seed')
on conflict (code) do nothing;

-- ============================================================================
-- Density
-- ============================================================================
insert into ref.uom (code, name, symbol, quantity_type, created_by)
values
  ('KMQ','Kilogram per Cubic Metre','kg/m³','density','seed'),
  ('GL','Gram per Litre','g/L','density','seed')
on conflict (code) do nothing;

-- ============================================================================
-- §8  COMMODITY CLASSIFICATIONS (UNSPSC/HS)
-- ============================================================================

/* ============================================================================
   Athyper — REF Seed: Commodity Classifications
   PostgreSQL 16+

   Domains: UNSPSC (segments) + HS (chapters)
   Depends on: 010_ref_master_tables.sql
   ============================================================================ */

-- ============================================================================
-- Domains
-- ============================================================================
insert into ref.commodity_domain (code, name, standard, version, hierarchy_depth, code_pattern, created_by)
values
  ('unspsc', 'United Nations Standard Products and Services Code', 'UNSPSC', 'v26', 4, '^\d{2,8}$', 'seed'),
  ('hs',     'Harmonized Commodity Description and Coding System', 'HS',     '2022', 6, '^\d{2,10}$', 'seed')
on conflict (code) do update set
  hierarchy_depth = excluded.hierarchy_depth,
  code_pattern    = excluded.code_pattern,
  updated_at      = now();

-- ============================================================================
-- COMMODITY CODES: Full hierarchies seeded in dedicated files
--   201_seed_unspsc.sql — 77,337 UNSPSC codes (4 levels)
--   202_seed_hs.sql     —  6,939 HS codes (3 levels)
-- ============================================================================
-- Clean up old abbreviated 2-digit UNSPSC segment codes (replaced by proper 8-digit codes)
delete from ref.commodity_code
  where domain_code = 'unspsc'
    and length(code) = 2;

-- ============================================================================
-- §9  INDUSTRY CLASSIFICATIONS (ISIC/NAICS)
-- ============================================================================

/* ============================================================================
   Athyper — REF Seed: Industry Classifications
   PostgreSQL 16+

   Domains: ISIC Rev.4 (sections + divisions) + NAICS 2022 (sectors)
   Depends on: 010_ref_master_tables.sql
   ============================================================================ */

-- ============================================================================
-- Domains
-- ============================================================================
insert into ref.industry_domain (code, name, standard, version, hierarchy_depth, code_pattern, created_by)
values
  ('isic',  'International Standard Industrial Classification', 'ISIC', 'Rev.4', 4, '^[A-U]$|^\d{2,4}$', 'seed'),
  ('naics', 'North American Industry Classification System',    'NAICS', '2022',  5, '^\d{2,6}$', 'seed')
on conflict (code) do update set
  hierarchy_depth = excluded.hierarchy_depth,
  code_pattern    = excluded.code_pattern,
  updated_at      = now();

-- ============================================================================
-- ISIC Rev.4 — Sections (Level 1)
-- ============================================================================
insert into ref.industry_code (domain_code, code, name, description, level_no, created_by)
values
  ('isic','A','Agriculture, Forestry and Fishing','Crop and animal production, hunting, forestry, and fishing',1,'seed'),
  ('isic','B','Mining and Quarrying','Mining of coal, crude petroleum, metal ores, and other minerals',1,'seed'),
  ('isic','C','Manufacturing','Manufacture of food, textiles, chemicals, metals, machinery, and other goods',1,'seed'),
  ('isic','D','Electricity, Gas, Steam and Air Conditioning Supply','Generation, transmission, and distribution of electric power, gas, steam',1,'seed'),
  ('isic','E','Water Supply; Sewerage, Waste Management and Remediation','Water collection, treatment, supply; sewerage; waste management',1,'seed'),
  ('isic','F','Construction','Construction of buildings, civil engineering, and specialized construction',1,'seed'),
  ('isic','G','Wholesale and Retail Trade','Wholesale and retail trade; repair of motor vehicles and motorcycles',1,'seed'),
  ('isic','H','Transportation and Storage','Land, water, air transport; warehousing and support activities',1,'seed'),
  ('isic','I','Accommodation and Food Service Activities','Hotels, restaurants, catering, and other accommodation/food service',1,'seed'),
  ('isic','J','Information and Communication','Publishing, broadcasting, telecommunications, IT, and information services',1,'seed'),
  ('isic','K','Financial and Insurance Activities','Financial service, insurance, reinsurance, pension funding, and auxiliaries',1,'seed'),
  ('isic','L','Real Estate Activities','Buying, selling, renting, and operating real estate',1,'seed'),
  ('isic','M','Professional, Scientific and Technical Activities','Legal, accounting, management, architecture, engineering, R&D, advertising',1,'seed'),
  ('isic','N','Administrative and Support Service Activities','Rental, employment, travel, security, cleaning, and office support',1,'seed'),
  ('isic','O','Public Administration and Defence','Public administration, defence, and compulsory social security',1,'seed'),
  ('isic','P','Education','Pre-primary, primary, secondary, higher, and other education',1,'seed'),
  ('isic','Q','Human Health and Social Work Activities','Human health, residential care, and social work activities',1,'seed'),
  ('isic','R','Arts, Entertainment and Recreation','Creative arts, libraries, museums, gambling, sports, recreation',1,'seed'),
  ('isic','S','Other Service Activities','Membership organizations, repair of personal goods, other personal services',1,'seed'),
  ('isic','T','Activities of Households as Employers','Households employing domestic personnel; undifferentiated production',1,'seed'),
  ('isic','U','Activities of Extraterritorial Organizations and Bodies','International organizations and bodies',1,'seed')
on conflict (domain_code, code) do nothing;

-- ============================================================================
-- ISIC Rev.4 — Divisions (Level 2, with parent_code → section)
-- ============================================================================

-- Section A: Agriculture, Forestry and Fishing
insert into ref.industry_code (domain_code, code, name, description, parent_code, level_no, created_by)
values
  ('isic','01','Crop and Animal Production','Growing of crops, raising of animals, mixed farming, and support',  'A',2,'seed'),
  ('isic','02','Forestry and Logging','Silviculture, logging, gathering of non-wood forest products',           'A',2,'seed'),
  ('isic','03','Fishing and Aquaculture','Fishing and aquaculture',                                              'A',2,'seed')
on conflict (domain_code, code) do nothing;

-- Section B: Mining and Quarrying
insert into ref.industry_code (domain_code, code, name, description, parent_code, level_no, created_by)
values
  ('isic','05','Mining of Coal and Lignite','Mining of hard coal and lignite',                                    'B',2,'seed'),
  ('isic','06','Extraction of Crude Petroleum and Natural Gas','Extraction of crude petroleum and natural gas',  'B',2,'seed'),
  ('isic','07','Mining of Metal Ores','Mining of iron ores, non-ferrous metal ores',                             'B',2,'seed'),
  ('isic','08','Other Mining and Quarrying','Quarrying of stone, sand, clay, and other mining',                   'B',2,'seed'),
  ('isic','09','Mining Support Service Activities','Support activities for petroleum, gas, and other mining',     'B',2,'seed')
on conflict (domain_code, code) do nothing;

-- Section C: Manufacturing
insert into ref.industry_code (domain_code, code, name, description, parent_code, level_no, created_by)
values
  ('isic','10','Manufacture of Food Products','Processing and preserving of meat, fish, fruit, vegetables, fats','C',2,'seed'),
  ('isic','11','Manufacture of Beverages','Distilling, blending of spirits; manufacture of wines, beer',         'C',2,'seed'),
  ('isic','12','Manufacture of Tobacco Products','Manufacture of tobacco products',                               'C',2,'seed'),
  ('isic','13','Manufacture of Textiles','Spinning, weaving, finishing of textiles',                              'C',2,'seed'),
  ('isic','14','Manufacture of Wearing Apparel','Manufacture of wearing apparel, except fur apparel',             'C',2,'seed'),
  ('isic','15','Manufacture of Leather','Tanning and dressing of leather; luggage, handbags, footwear',          'C',2,'seed'),
  ('isic','16','Manufacture of Wood Products','Sawmilling, planing of wood; manufacture of wood products',       'C',2,'seed'),
  ('isic','17','Manufacture of Paper','Manufacture of paper and paper products',                                  'C',2,'seed'),
  ('isic','18','Printing and Reproduction','Printing and service activities related to printing',                 'C',2,'seed'),
  ('isic','19','Manufacture of Coke and Refined Petroleum','Manufacture of coke oven products and refined petroleum','C',2,'seed'),
  ('isic','20','Manufacture of Chemicals','Manufacture of chemicals and chemical products',                       'C',2,'seed'),
  ('isic','21','Manufacture of Pharmaceuticals','Manufacture of pharmaceuticals, medicinal chemicals',            'C',2,'seed'),
  ('isic','22','Manufacture of Rubber and Plastics','Manufacture of rubber and plastics products',                'C',2,'seed'),
  ('isic','23','Manufacture of Non-metallic Mineral Products','Manufacture of glass, ceramics, cement',           'C',2,'seed'),
  ('isic','24','Manufacture of Basic Metals','Manufacture of basic iron, steel, and non-ferrous metals',          'C',2,'seed'),
  ('isic','25','Manufacture of Fabricated Metal Products','Manufacture of structural metals, tanks, weapons',     'C',2,'seed'),
  ('isic','26','Manufacture of Computer, Electronic and Optical Products','Electronic components, computers, communication equipment','C',2,'seed'),
  ('isic','27','Manufacture of Electrical Equipment','Manufacture of electric motors, batteries, wiring, lighting','C',2,'seed'),
  ('isic','28','Manufacture of Machinery and Equipment','Manufacture of general-purpose and special-purpose machinery','C',2,'seed'),
  ('isic','29','Manufacture of Motor Vehicles','Manufacture of motor vehicles, trailers, and semi-trailers',     'C',2,'seed'),
  ('isic','30','Manufacture of Other Transport Equipment','Building of ships, railway, aircraft, spacecraft',     'C',2,'seed'),
  ('isic','31','Manufacture of Furniture','Manufacture of furniture',                                             'C',2,'seed'),
  ('isic','32','Other Manufacturing','Manufacture of jewelry, musical instruments, toys, medical devices',        'C',2,'seed'),
  ('isic','33','Repair and Installation of Machinery','Repair of fabricated metals, machinery, equipment',        'C',2,'seed')
on conflict (domain_code, code) do nothing;

-- Section D: Electricity, Gas, Steam
insert into ref.industry_code (domain_code, code, name, description, parent_code, level_no, created_by)
values
  ('isic','35','Electricity, Gas, Steam and Air Conditioning Supply','Generation, transmission, distribution of electricity, gas, steam','D',2,'seed')
on conflict (domain_code, code) do nothing;

-- Section E: Water Supply, Sewerage, Waste
insert into ref.industry_code (domain_code, code, name, description, parent_code, level_no, created_by)
values
  ('isic','36','Water Collection, Treatment and Supply','Water collection, treatment and supply',                 'E',2,'seed'),
  ('isic','37','Sewerage','Sewerage',                                                                             'E',2,'seed'),
  ('isic','38','Waste Collection, Treatment and Disposal','Waste collection, treatment, disposal, materials recovery','E',2,'seed'),
  ('isic','39','Remediation and Other Waste Management','Remediation activities and other waste management services','E',2,'seed')
on conflict (domain_code, code) do nothing;

-- Section F: Construction
insert into ref.industry_code (domain_code, code, name, description, parent_code, level_no, created_by)
values
  ('isic','41','Construction of Buildings','Construction of residential and non-residential buildings',           'F',2,'seed'),
  ('isic','42','Civil Engineering','Construction of roads, railways, utility projects, bridges',                  'F',2,'seed'),
  ('isic','43','Specialized Construction Activities','Demolition, site preparation, electrical, plumbing, finishing','F',2,'seed')
on conflict (domain_code, code) do nothing;

-- Section G: Wholesale and Retail Trade
insert into ref.industry_code (domain_code, code, name, description, parent_code, level_no, created_by)
values
  ('isic','45','Wholesale and Retail Trade of Motor Vehicles','Sale, maintenance, repair of motor vehicles','G',2,'seed'),
  ('isic','46','Wholesale Trade','Wholesale trade, except of motor vehicles and motorcycles',                     'G',2,'seed'),
  ('isic','47','Retail Trade','Retail trade, except of motor vehicles and motorcycles',                           'G',2,'seed')
on conflict (domain_code, code) do nothing;

-- Section H: Transportation and Storage
insert into ref.industry_code (domain_code, code, name, description, parent_code, level_no, created_by)
values
  ('isic','49','Land Transport and Transport via Pipelines','Railway, road, urban transit, freight, pipelines',   'H',2,'seed'),
  ('isic','50','Water Transport','Sea and coastal water transport; inland water transport',                       'H',2,'seed'),
  ('isic','51','Air Transport','Passenger and freight air transport',                                             'H',2,'seed'),
  ('isic','52','Warehousing and Support Activities','Warehousing and storage; support for transportation',        'H',2,'seed'),
  ('isic','53','Postal and Courier Activities','Postal and courier activities',                                   'H',2,'seed')
on conflict (domain_code, code) do nothing;

-- Section I: Accommodation and Food Service
insert into ref.industry_code (domain_code, code, name, description, parent_code, level_no, created_by)
values
  ('isic','55','Accommodation','Short-stay accommodation, camping, RV parks',                                    'I',2,'seed'),
  ('isic','56','Food and Beverage Service Activities','Restaurants, catering, bars, canteens',                    'I',2,'seed')
on conflict (domain_code, code) do nothing;

-- Section J: Information and Communication
insert into ref.industry_code (domain_code, code, name, description, parent_code, level_no, created_by)
values
  ('isic','58','Publishing Activities','Publishing of books, periodicals, directories, software',                'J',2,'seed'),
  ('isic','59','Motion Picture, Video and Television','Motion picture, video, television programme production',   'J',2,'seed'),
  ('isic','60','Programming and Broadcasting','Radio and television broadcasting',                                'J',2,'seed'),
  ('isic','61','Telecommunications','Wired, wireless, satellite, and other telecommunications',                  'J',2,'seed'),
  ('isic','62','Computer Programming and Consultancy','Computer programming, consultancy, and related activities','J',2,'seed'),
  ('isic','63','Information Service Activities','Data processing, hosting, web portals, news agencies',           'J',2,'seed')
on conflict (domain_code, code) do nothing;

-- Section K: Financial and Insurance
insert into ref.industry_code (domain_code, code, name, description, parent_code, level_no, created_by)
values
  ('isic','64','Financial Service Activities','Monetary intermediation, holding companies, trusts, funds',        'K',2,'seed'),
  ('isic','65','Insurance, Reinsurance and Pension Funding','Insurance, reinsurance, and pension funding',         'K',2,'seed'),
  ('isic','66','Activities Auxiliary to Financial Service','Securities dealing, fund management, brokerages',      'K',2,'seed')
on conflict (domain_code, code) do nothing;

-- Section L: Real Estate
insert into ref.industry_code (domain_code, code, name, description, parent_code, level_no, created_by)
values
  ('isic','68','Real Estate Activities','Buying, selling, renting, and managing real estate',                     'L',2,'seed')
on conflict (domain_code, code) do nothing;

-- Section M: Professional, Scientific and Technical
insert into ref.industry_code (domain_code, code, name, description, parent_code, level_no, created_by)
values
  ('isic','69','Legal and Accounting Activities','Legal, accounting, bookkeeping, auditing, tax consultancy',     'M',2,'seed'),
  ('isic','70','Activities of Head Offices; Management Consultancy','Head office activities, management consultancy','M',2,'seed'),
  ('isic','71','Architectural and Engineering Activities','Architecture, engineering, technical testing',          'M',2,'seed'),
  ('isic','72','Scientific Research and Development','R&D in natural sciences, engineering, social sciences',     'M',2,'seed'),
  ('isic','73','Advertising and Market Research','Advertising, market research and public opinion polling',       'M',2,'seed'),
  ('isic','74','Other Professional, Scientific and Technical','Specialized design, photography, translation',     'M',2,'seed'),
  ('isic','75','Veterinary Activities','Veterinary activities',                                                    'M',2,'seed')
on conflict (domain_code, code) do nothing;

-- Section N: Administrative and Support
insert into ref.industry_code (domain_code, code, name, description, parent_code, level_no, created_by)
values
  ('isic','77','Rental and Leasing Activities','Renting and leasing of motor vehicles, goods, IP',               'N',2,'seed'),
  ('isic','78','Employment Activities','Temporary employment, placement, HR provision',                           'N',2,'seed'),
  ('isic','79','Travel Agency and Tour Operator','Travel agency, tour operator, and reservation services',       'N',2,'seed'),
  ('isic','80','Security and Investigation Activities','Private security, investigation, security systems',       'N',2,'seed'),
  ('isic','81','Services to Buildings and Landscape Care','Cleaning, pest control, landscaping',                  'N',2,'seed'),
  ('isic','82','Office Administrative and Support','Office administration, call centres, conventions, packaging', 'N',2,'seed')
on conflict (domain_code, code) do nothing;

-- Section O: Public Administration
insert into ref.industry_code (domain_code, code, name, description, parent_code, level_no, created_by)
values
  ('isic','84','Public Administration and Defence','Government administration, regulation, defence, social security','O',2,'seed')
on conflict (domain_code, code) do nothing;

-- Section P: Education
insert into ref.industry_code (domain_code, code, name, description, parent_code, level_no, created_by)
values
  ('isic','85','Education','Pre-primary through post-secondary education; sports and cultural education','P',2,'seed')
on conflict (domain_code, code) do nothing;

-- Section Q: Human Health and Social Work
insert into ref.industry_code (domain_code, code, name, description, parent_code, level_no, created_by)
values
  ('isic','86','Human Health Activities','Hospital, medical, dental practice activities',                         'Q',2,'seed'),
  ('isic','87','Residential Care Activities','Residential nursing, care for elderly, mental health',              'Q',2,'seed'),
  ('isic','88','Social Work Activities Without Accommodation','Social work for elderly, disabled; child day-care','Q',2,'seed')
on conflict (domain_code, code) do nothing;

-- Section R: Arts, Entertainment and Recreation
insert into ref.industry_code (domain_code, code, name, description, parent_code, level_no, created_by)
values
  ('isic','90','Creative, Arts and Entertainment','Performing arts, artistic creation, arts facilities',          'R',2,'seed'),
  ('isic','91','Libraries, Archives, Museums','Libraries, archives, museums, botanical/zoological gardens',      'R',2,'seed'),
  ('isic','92','Gambling and Betting Activities','Gambling and betting activities',                                'R',2,'seed'),
  ('isic','93','Sports and Recreation Activities','Sports, amusement and recreation activities',                  'R',2,'seed')
on conflict (domain_code, code) do nothing;

-- Section S: Other Service Activities
insert into ref.industry_code (domain_code, code, name, description, parent_code, level_no, created_by)
values
  ('isic','94','Activities of Membership Organizations','Business, employer, professional, trade unions, religious','S',2,'seed'),
  ('isic','95','Repair of Computers and Personal Goods','Repair of computers, communication equipment, personal goods','S',2,'seed'),
  ('isic','96','Other Personal Service Activities','Laundry, hairdressing, funeral, physical well-being',         'S',2,'seed')
on conflict (domain_code, code) do nothing;

-- Section T: Activities of Households
insert into ref.industry_code (domain_code, code, name, description, parent_code, level_no, created_by)
values
  ('isic','97','Activities of Households as Employers','Households as employers of domestic personnel',           'T',2,'seed'),
  ('isic','98','Undifferentiated Goods and Services Production','Undifferentiated goods- and services-producing activities of households for own use','T',2,'seed')
on conflict (domain_code, code) do nothing;

-- Section U: Extraterritorial Organizations
insert into ref.industry_code (domain_code, code, name, description, parent_code, level_no, created_by)
values
  ('isic','99','Activities of Extraterritorial Organizations','International organizations and bodies',           'U',2,'seed')
on conflict (domain_code, code) do nothing;

-- ============================================================================
-- NAICS 2022 — Sectors (Level 1)
-- ============================================================================
insert into ref.industry_code (domain_code, code, name, description, level_no, created_by)
values
  ('naics','11','Agriculture, Forestry, Fishing and Hunting','Crop production, animal production, forestry, fishing, hunting',1,'seed'),
  ('naics','21','Mining, Quarrying, and Oil and Gas Extraction','Oil/gas, mining, support activities for mining',1,'seed'),
  ('naics','22','Utilities','Electric power, natural gas, water, sewage',1,'seed'),
  ('naics','23','Construction','Building, heavy/civil engineering, specialty trade contractors',1,'seed'),
  ('naics','31','Manufacturing — Food, Beverage, Textile, Apparel','Food, beverage, tobacco, textile, apparel, leather manufacturing',1,'seed'),
  ('naics','32','Manufacturing — Wood, Paper, Petroleum, Chemical, Plastics','Wood, paper, petroleum, chemical, plastics, nonmetallic mineral manufacturing',1,'seed'),
  ('naics','33','Manufacturing — Metals, Machinery, Electronics, Transport','Primary metals, fabricated metals, machinery, computer, electrical, transport equipment',1,'seed'),
  ('naics','42','Wholesale Trade','Merchant wholesalers, electronic markets, agents and brokers',1,'seed'),
  ('naics','44','Retail Trade — Motor Vehicle, Furniture, Electronics, Building','Motor vehicle dealers, furniture, electronics, building material stores',1,'seed'),
  ('naics','45','Retail Trade — Food, Health, Clothing, General, Misc','Food/beverage, health/personal, clothing, general, miscellaneous stores',1,'seed'),
  ('naics','48','Transportation — Air, Rail, Water, Truck, Transit, Pipeline','Air, rail, water, truck, transit, pipeline transportation',1,'seed'),
  ('naics','49','Transportation — Postal, Courier, Warehousing','Postal service, couriers, warehousing and storage',1,'seed'),
  ('naics','51','Information','Publishing, motion picture, broadcasting, telecommunications, data processing',1,'seed'),
  ('naics','52','Finance and Insurance','Monetary authorities, credit intermediation, securities, insurance',1,'seed'),
  ('naics','53','Real Estate and Rental and Leasing','Real estate, rental and leasing services',1,'seed'),
  ('naics','54','Professional, Scientific, and Technical Services','Legal, accounting, architecture, engineering, computer, consulting, advertising, R&D',1,'seed'),
  ('naics','55','Management of Companies and Enterprises','Holding companies, head offices, management of companies',1,'seed'),
  ('naics','56','Administrative and Support and Waste Management','Office admin, employment, travel, security, cleaning, waste management',1,'seed'),
  ('naics','61','Educational Services','Elementary, secondary, colleges, universities, technical, educational support',1,'seed'),
  ('naics','62','Health Care and Social Assistance','Ambulatory, hospitals, nursing, residential care, social assistance',1,'seed'),
  ('naics','71','Arts, Entertainment, and Recreation','Performing arts, spectator sports, museums, amusement, gambling',1,'seed'),
  ('naics','72','Accommodation and Food Services','Accommodation, food services, and drinking places',1,'seed'),
  ('naics','81','Other Services (except Public Administration)','Repair, personal/laundry, religious, civic, professional organizations',1,'seed'),
  ('naics','92','Public Administration','Executive, legislative, judicial, administration, national security',1,'seed')
on conflict (domain_code, code) do nothing;

-- ============================================================================
-- §10  PERSONA i18n LABELS (ar, ms, ta, hi, fr, de)
-- ============================================================================

/* ============================================================================
   Athyper — SEED: Persona i18n Labels
   Translations for core.persona names and descriptions.
   Covers: ar, ms, ta, hi, fr, de (English canonical is on core.persona).
   Idempotent (ON CONFLICT DO NOTHING).
   Depends on: 911_seed_personas.sql, 050_ref_seed_locales.sql
   ============================================================================ */

-- ============================================================================
-- Arabic (ar)
-- ============================================================================
insert into ref.label (entity, code, locale_code, name, description, created_by)
values
  ('persona', 'viewer',      'ar', 'مُشاهد',         'وصول للقراءة فقط إلى السجلات',                         'seed'),
  ('persona', 'reporter',    'ar', 'مُقرِّر',         'مشاهد مع إمكانيات إعداد التقارير',                      'seed'),
  ('persona', 'requester',   'ar', 'مُقدِّم طلب',     'يمكنه إنشاء وإدارة طلباته الخاصة',                      'seed'),
  ('persona', 'agent',       'ar', 'وكيل',           'معالجة الطلبات ضمن الوحدة التنظيمية المعيَّنة',           'seed'),
  ('persona', 'manager',     'ar', 'مدير',           'الإدارة والموافقة ضمن نطاق الوحدة التنظيمية',            'seed'),
  ('persona', 'moduleAdmin', 'ar', 'مسؤول الوحدة',   'إدارة كيانات الوحدة',                                   'seed'),
  ('persona', 'tenantAdmin', 'ar', 'مسؤول المستأجر', 'إدارة كاملة للمستأجر',                                  'seed')
on conflict (entity, code, locale_code) do nothing;

-- ============================================================================
-- Malay (ms)
-- ============================================================================
insert into ref.label (entity, code, locale_code, name, description, created_by)
values
  ('persona', 'viewer',      'ms', 'Pemerhati',        'Akses baca sahaja kepada rekod',                        'seed'),
  ('persona', 'reporter',    'ms', 'Pelapor',          'Pemerhati dengan keupayaan pelaporan',                   'seed'),
  ('persona', 'requester',   'ms', 'Pemohon',          'Boleh mencipta dan mengurus permohonan sendiri',         'seed'),
  ('persona', 'agent',       'ms', 'Agen',             'Memproses permohonan dalam unit organisasi ditugaskan',  'seed'),
  ('persona', 'manager',     'ms', 'Pengurus',         'Mengurus dan meluluskan dalam skop unit organisasi',     'seed'),
  ('persona', 'moduleAdmin', 'ms', 'Pentadbir Modul',  'Mentadbir entiti modul',                                'seed'),
  ('persona', 'tenantAdmin', 'ms', 'Pentadbir Penyewa','Pentadbiran penuh penyewa',                             'seed')
on conflict (entity, code, locale_code) do nothing;

-- ============================================================================
-- Tamil (ta)
-- ============================================================================
insert into ref.label (entity, code, locale_code, name, description, created_by)
values
  ('persona', 'viewer',      'ta', 'பார்வையாளர்',           'பதிவுகளுக்கான படிப்பு மட்டும் அணுகல்',                     'seed'),
  ('persona', 'reporter',    'ta', 'அறிக்கையாளர்',          'பார்வையாளர் மற்றும் அறிக்கை திறன்கள்',                     'seed'),
  ('persona', 'requester',   'ta', 'கோரிக்கையாளர்',         'சொந்த கோரிக்கைகளை உருவாக்கி நிர்வகிக்கலாம்',              'seed'),
  ('persona', 'agent',       'ta', 'முகவர்',                'ஒதுக்கப்பட்ட நிறுவன அலகில் கோரிக்கைகளை செயலாக்குதல்',     'seed'),
  ('persona', 'manager',     'ta', 'மேலாளர்',               'நிறுவன அலகு எல்லையில் நிர்வகித்தல் மற்றும் அங்கீகரித்தல்', 'seed'),
  ('persona', 'moduleAdmin', 'ta', 'தொகுதி நிர்வாகி',       'தொகுதி நிறுவனங்களை நிர்வகித்தல்',                          'seed'),
  ('persona', 'tenantAdmin', 'ta', 'குத்தகையாளர் நிர்வாகி', 'முழு குத்தகையாளர் நிர்வாகம்',                              'seed')
on conflict (entity, code, locale_code) do nothing;

-- ============================================================================
-- Hindi (hi)
-- ============================================================================
insert into ref.label (entity, code, locale_code, name, description, created_by)
values
  ('persona', 'viewer',      'hi', 'दर्शक',                'रिकॉर्ड तक केवल-पठन पहुँच',                          'seed'),
  ('persona', 'reporter',    'hi', 'रिपोर्टर',              'दर्शक और रिपोर्टिंग क्षमताएँ',                        'seed'),
  ('persona', 'requester',   'hi', 'अनुरोधकर्ता',           'अपने अनुरोध बना और प्रबंधित कर सकते हैं',             'seed'),
  ('persona', 'agent',       'hi', 'एजेंट',                'निर्धारित संगठनात्मक इकाई में अनुरोध संसाधित करें',     'seed'),
  ('persona', 'manager',     'hi', 'प्रबंधक',               'संगठनात्मक इकाई दायरे में प्रबंधन और अनुमोदन',        'seed'),
  ('persona', 'moduleAdmin', 'hi', 'मॉड्यूल व्यवस्थापक',    'मॉड्यूल इकाइयों का प्रशासन',                          'seed'),
  ('persona', 'tenantAdmin', 'hi', 'टेनेंट व्यवस्थापक',     'पूर्ण टेनेंट प्रशासन',                                'seed')
on conflict (entity, code, locale_code) do nothing;

-- ============================================================================
-- French (fr)
-- ============================================================================
insert into ref.label (entity, code, locale_code, name, description, created_by)
values
  ('persona', 'viewer',      'fr', 'Lecteur',              'Accès en lecture seule aux enregistrements',            'seed'),
  ('persona', 'reporter',    'fr', 'Rapporteur',           'Lecteur avec capacités de reporting',                   'seed'),
  ('persona', 'requester',   'fr', 'Demandeur',            'Peut créer et gérer ses propres demandes',              'seed'),
  ('persona', 'agent',       'fr', 'Agent',                'Traiter les demandes au sein de l''UO assignée',        'seed'),
  ('persona', 'manager',     'fr', 'Responsable',          'Gérer et approuver dans le périmètre de l''UO',         'seed'),
  ('persona', 'moduleAdmin', 'fr', 'Admin. module',        'Administrer les entités du module',                     'seed'),
  ('persona', 'tenantAdmin', 'fr', 'Admin. locataire',     'Administration complète du locataire',                  'seed')
on conflict (entity, code, locale_code) do nothing;

-- ============================================================================
-- German (de)
-- ============================================================================
insert into ref.label (entity, code, locale_code, name, description, created_by)
values
  ('persona', 'viewer',      'de', 'Betrachter',            'Lesezugriff auf Datensätze',                           'seed'),
  ('persona', 'reporter',    'de', 'Berichterstatter',      'Betrachter mit Berichtsfunktionen',                    'seed'),
  ('persona', 'requester',   'de', 'Antragsteller',         'Kann eigene Anträge erstellen und verwalten',           'seed'),
  ('persona', 'agent',       'de', 'Sachbearbeiter',        'Anträge innerhalb der zugewiesenen OE bearbeiten',      'seed'),
  ('persona', 'manager',     'de', 'Vorgesetzter',          'Verwalten und genehmigen im OE-Bereich',                'seed'),
  ('persona', 'moduleAdmin', 'de', 'Moduladministrator',    'Modulentitäten verwalten',                              'seed'),
  ('persona', 'tenantAdmin', 'de', 'Mandantenadministrator','Vollständige Mandantenverwaltung',                      'seed')
on conflict (entity, code, locale_code) do nothing;

-- ============================================================================
-- §11  i18n: Arabic Labels
-- ============================================================================

/* ============================================================================
   Athyper — REF Seed: Arabic Labels (i18n)
   PostgreSQL 16+

   Arabic translations for key reference data entities.
   Covers: countries (GCC + major), currencies, languages, UOM core units.
   Depends on: 010_ref_master_tables.sql, 040_ref_seed_languages.sql,
               050_ref_seed_locales.sql
   ============================================================================ */

-- ============================================================================
-- Countries — GCC + MENA + Major World
-- ============================================================================
insert into ref.label (entity, code, locale_code, name, created_by)
values
  -- GCC
  ('country','SA','ar','المملكة العربية السعودية','seed'),
  ('country','AE','ar','الإمارات العربية المتحدة','seed'),
  ('country','BH','ar','البحرين','seed'),
  ('country','KW','ar','الكويت','seed'),
  ('country','OM','ar','عُمان','seed'),
  ('country','QA','ar','قطر','seed'),

  -- MENA
  ('country','EG','ar','مصر','seed'),
  ('country','JO','ar','الأردن','seed'),
  ('country','LB','ar','لبنان','seed'),
  ('country','IQ','ar','العراق','seed'),
  ('country','SY','ar','سوريا','seed'),
  ('country','YE','ar','اليمن','seed'),
  ('country','PS','ar','فلسطين','seed'),
  ('country','SD','ar','السودان','seed'),
  ('country','LY','ar','ليبيا','seed'),
  ('country','TN','ar','تونس','seed'),
  ('country','DZ','ar','الجزائر','seed'),
  ('country','MA','ar','المغرب','seed'),
  ('country','MR','ar','موريتانيا','seed'),
  ('country','DJ','ar','جيبوتي','seed'),
  ('country','SO','ar','الصومال','seed'),
  ('country','KM','ar','جزر القمر','seed'),
  ('country','IR','ar','إيران','seed'),
  ('country','TR','ar','تركيا','seed'),
  ('country','IL','ar','إسرائيل','seed'),

  -- Major World
  ('country','US','ar','الولايات المتحدة','seed'),
  ('country','GB','ar','المملكة المتحدة','seed'),
  ('country','FR','ar','فرنسا','seed'),
  ('country','DE','ar','ألمانيا','seed'),
  ('country','IT','ar','إيطاليا','seed'),
  ('country','ES','ar','إسبانيا','seed'),
  ('country','PT','ar','البرتغال','seed'),
  ('country','NL','ar','هولندا','seed'),
  ('country','BE','ar','بلجيكا','seed'),
  ('country','CH','ar','سويسرا','seed'),
  ('country','AT','ar','النمسا','seed'),
  ('country','SE','ar','السويد','seed'),
  ('country','NO','ar','النرويج','seed'),
  ('country','DK','ar','الدنمارك','seed'),
  ('country','FI','ar','فنلندا','seed'),
  ('country','PL','ar','بولندا','seed'),
  ('country','GR','ar','اليونان','seed'),
  ('country','RU','ar','روسيا','seed'),
  ('country','UA','ar','أوكرانيا','seed'),
  ('country','CN','ar','الصين','seed'),
  ('country','JP','ar','اليابان','seed'),
  ('country','KR','ar','كوريا الجنوبية','seed'),
  ('country','IN','ar','الهند','seed'),
  ('country','PK','ar','باكستان','seed'),
  ('country','BD','ar','بنغلاديش','seed'),
  ('country','ID','ar','إندونيسيا','seed'),
  ('country','MY','ar','ماليزيا','seed'),
  ('country','SG','ar','سنغافورة','seed'),
  ('country','TH','ar','تايلاند','seed'),
  ('country','VN','ar','فيتنام','seed'),
  ('country','PH','ar','الفلبين','seed'),
  ('country','AU','ar','أستراليا','seed'),
  ('country','NZ','ar','نيوزيلندا','seed'),
  ('country','CA','ar','كندا','seed'),
  ('country','MX','ar','المكسيك','seed'),
  ('country','BR','ar','البرازيل','seed'),
  ('country','AR','ar','الأرجنتين','seed'),
  ('country','CL','ar','تشيلي','seed'),
  ('country','CO','ar','كولومبيا','seed'),
  ('country','ZA','ar','جنوب أفريقيا','seed'),
  ('country','NG','ar','نيجيريا','seed'),
  ('country','KE','ar','كينيا','seed'),
  ('country','ET','ar','إثيوبيا','seed'),
  ('country','GH','ar','غانا','seed'),
  ('country','TZ','ar','تنزانيا','seed'),
  ('country','SS','ar','جنوب السودان','seed'),
  ('country','HK','ar','هونغ كونغ','seed'),
  ('country','TW','ar','تايوان','seed'),
  ('country','AF','ar','أفغانستان','seed'),
  ('country','CY','ar','قبرص','seed'),
  ('country','LK','ar','سريلانكا','seed'),
  ('country','NP','ar','نيبال','seed'),
  ('country','MM','ar','ميانمار','seed'),
  ('country','KH','ar','كمبوديا','seed'),
  ('country','IE','ar','أيرلندا','seed')
on conflict (entity, code, locale_code) do nothing;

-- ============================================================================
-- Currencies — GCC + Major
-- ============================================================================
insert into ref.label (entity, code, locale_code, name, created_by)
values
  -- GCC
  ('currency','SAR','ar','ريال سعودي','seed'),
  ('currency','AED','ar','درهم إماراتي','seed'),
  ('currency','BHD','ar','دينار بحريني','seed'),
  ('currency','KWD','ar','دينار كويتي','seed'),
  ('currency','OMR','ar','ريال عُماني','seed'),
  ('currency','QAR','ar','ريال قطري','seed'),

  -- MENA
  ('currency','EGP','ar','جنيه مصري','seed'),
  ('currency','JOD','ar','دينار أردني','seed'),
  ('currency','LBP','ar','ليرة لبنانية','seed'),
  ('currency','IQD','ar','دينار عراقي','seed'),
  ('currency','SYP','ar','ليرة سورية','seed'),
  ('currency','YER','ar','ريال يمني','seed'),
  ('currency','SDG','ar','جنيه سوداني','seed'),
  ('currency','LYD','ar','دينار ليبي','seed'),
  ('currency','TND','ar','دينار تونسي','seed'),
  ('currency','DZD','ar','دينار جزائري','seed'),
  ('currency','MAD','ar','درهم مغربي','seed'),
  ('currency','ILS','ar','شيكل إسرائيلي','seed'),
  ('currency','IRR','ar','ريال إيراني','seed'),
  ('currency','TRY','ar','ليرة تركية','seed'),

  -- Major World
  ('currency','USD','ar','دولار أمريكي','seed'),
  ('currency','EUR','ar','يورو','seed'),
  ('currency','GBP','ar','جنيه إسترليني','seed'),
  ('currency','JPY','ar','ين ياباني','seed'),
  ('currency','CNY','ar','يوان صيني','seed'),
  ('currency','CHF','ar','فرنك سويسري','seed'),
  ('currency','CAD','ar','دولار كندي','seed'),
  ('currency','AUD','ar','دولار أسترالي','seed'),
  ('currency','INR','ar','روبية هندية','seed'),
  ('currency','PKR','ar','روبية باكستانية','seed'),
  ('currency','BRL','ar','ريال برازيلي','seed'),
  ('currency','MXN','ar','بيزو مكسيكي','seed'),
  ('currency','KRW','ar','وون كوري','seed'),
  ('currency','SGD','ar','دولار سنغافوري','seed'),
  ('currency','HKD','ar','دولار هونغ كونغ','seed'),
  ('currency','RUB','ar','روبل روسي','seed'),
  ('currency','ZAR','ar','راند جنوب أفريقي','seed'),
  ('currency','NZD','ar','دولار نيوزيلندي','seed'),
  ('currency','IDR','ar','روبية إندونيسية','seed'),
  ('currency','MYR','ar','رينغيت ماليزي','seed'),
  ('currency','THB','ar','بات تايلاندي','seed'),
  ('currency','NGN','ar','نيرة نيجيرية','seed'),
  ('currency','KES','ar','شلن كيني','seed'),

  -- Precious metals
  ('currency','XAU','ar','ذهب (أونصة تروي)','seed'),
  ('currency','XAG','ar','فضة (أونصة تروي)','seed')
on conflict (entity, code, locale_code) do nothing;

-- ============================================================================
-- Languages (ISO 639-1) — Major
-- ============================================================================
insert into ref.label (entity, code, locale_code, name, created_by)
values
  ('language','ar','ar','العربية','seed'),
  ('language','en','ar','الإنجليزية','seed'),
  ('language','fr','ar','الفرنسية','seed'),
  ('language','de','ar','الألمانية','seed'),
  ('language','es','ar','الإسبانية','seed'),
  ('language','pt','ar','البرتغالية','seed'),
  ('language','it','ar','الإيطالية','seed'),
  ('language','nl','ar','الهولندية','seed'),
  ('language','ru','ar','الروسية','seed'),
  ('language','zh','ar','الصينية','seed'),
  ('language','ja','ar','اليابانية','seed'),
  ('language','ko','ar','الكورية','seed'),
  ('language','hi','ar','الهندية','seed'),
  ('language','bn','ar','البنغالية','seed'),
  ('language','ur','ar','الأردية','seed'),
  ('language','fa','ar','الفارسية','seed'),
  ('language','tr','ar','التركية','seed'),
  ('language','ta','ar','التاميلية','seed'),
  ('language','te','ar','التيلوغوية','seed'),
  ('language','ml','ar','المالايالامية','seed'),
  ('language','id','ar','الإندونيسية','seed'),
  ('language','ms','ar','الملايوية','seed'),
  ('language','th','ar','التايلاندية','seed'),
  ('language','vi','ar','الفيتنامية','seed'),
  ('language','pl','ar','البولندية','seed'),
  ('language','uk','ar','الأوكرانية','seed'),
  ('language','sv','ar','السويدية','seed'),
  ('language','da','ar','الدنماركية','seed'),
  ('language','no','ar','النرويجية','seed'),
  ('language','fi','ar','الفنلندية','seed'),
  ('language','el','ar','اليونانية','seed'),
  ('language','he','ar','العبرية','seed'),
  ('language','sw','ar','السواحلية','seed'),
  ('language','am','ar','الأمهرية','seed'),
  ('language','ha','ar','الهوسا','seed'),
  ('language','yo','ar','اليوروبا','seed'),
  ('language','so','ar','الصومالية','seed'),
  ('language','ps','ar','البشتونية','seed'),
  ('language','ku','ar','الكردية','seed')
on conflict (entity, code, locale_code) do nothing;

-- ============================================================================
-- UOM — Core units
-- ============================================================================
insert into ref.label (entity, code, locale_code, name, created_by)
values
  -- Count
  ('uom','EA','ar','وحدة','seed'),
  ('uom','C62','ar','واحد','seed'),
  ('uom','PR','ar','زوج','seed'),
  ('uom','DZN','ar','دزينة','seed'),
  ('uom','SET','ar','طقم','seed'),
  ('uom','PK','ar','حزمة','seed'),
  ('uom','BX','ar','صندوق','seed'),
  ('uom','CT','ar','كرتون','seed'),
  ('uom','CS','ar','علبة','seed'),
  ('uom','PL','ar','منصة نقالة','seed'),

  -- Mass
  ('uom','MGM','ar','ميليغرام','seed'),
  ('uom','GRM','ar','غرام','seed'),
  ('uom','KGM','ar','كيلوغرام','seed'),
  ('uom','TNE','ar','طن متري','seed'),
  ('uom','LBR','ar','رطل','seed'),
  ('uom','ONZ','ar','أونصة','seed'),

  -- Length
  ('uom','MMT','ar','ميليمتر','seed'),
  ('uom','CMT','ar','سنتيمتر','seed'),
  ('uom','MTR','ar','متر','seed'),
  ('uom','KMT','ar','كيلومتر','seed'),
  ('uom','INH','ar','بوصة','seed'),
  ('uom','FOT','ar','قدم','seed'),
  ('uom','YRD','ar','ياردة','seed'),
  ('uom','SMI','ar','ميل','seed'),

  -- Area
  ('uom','MTK','ar','متر مربع','seed'),
  ('uom','KMK','ar','كيلومتر مربع','seed'),
  ('uom','HAR','ar','هكتار','seed'),
  ('uom','ACR','ar','فدان','seed'),
  ('uom','FTK','ar','قدم مربع','seed'),

  -- Volume
  ('uom','MLT','ar','ميليلتر','seed'),
  ('uom','LTR','ar','لتر','seed'),
  ('uom','MTQ','ar','متر مكعب','seed'),
  ('uom','GLL','ar','غالون','seed'),
  ('uom','BLL','ar','برميل','seed'),

  -- Time
  ('uom','SEC','ar','ثانية','seed'),
  ('uom','MIN','ar','دقيقة','seed'),
  ('uom','HUR','ar','ساعة','seed'),
  ('uom','DAY','ar','يوم','seed'),
  ('uom','WEE','ar','أسبوع','seed'),
  ('uom','MON','ar','شهر','seed'),
  ('uom','ANN','ar','سنة','seed'),

  -- Temperature
  ('uom','CEL','ar','درجة مئوية','seed'),
  ('uom','FAH','ar','درجة فهرنهايت','seed'),
  ('uom','KEL','ar','كلفن','seed'),

  -- Energy
  ('uom','KWH','ar','كيلوواط ساعة','seed'),
  ('uom','WTT','ar','واط','seed'),
  ('uom','KWT','ar','كيلوواط','seed'),
  ('uom','MAW','ar','ميغاواط','seed'),

  -- Data
  ('uom','AD','ar','بايت','seed'),
  ('uom','4L','ar','ميغابايت','seed'),
  ('uom','E34','ar','غيغابايت','seed'),
  ('uom','E35','ar','تيرابايت','seed')
on conflict (entity, code, locale_code) do nothing;

-- ============================================================================
-- Saudi Regions (state_region) — Arabic names
-- ============================================================================
insert into ref.label (entity, code, locale_code, name, created_by)
values
  ('state_region','SA-01','ar','منطقة الرياض','seed'),
  ('state_region','SA-02','ar','منطقة مكة المكرمة','seed'),
  ('state_region','SA-03','ar','منطقة المدينة المنورة','seed'),
  ('state_region','SA-04','ar','المنطقة الشرقية','seed'),
  ('state_region','SA-05','ar','منطقة القصيم','seed'),
  ('state_region','SA-06','ar','منطقة حائل','seed'),
  ('state_region','SA-07','ar','منطقة تبوك','seed'),
  ('state_region','SA-08','ar','منطقة الحدود الشمالية','seed'),
  ('state_region','SA-09','ar','منطقة جازان','seed'),
  ('state_region','SA-10','ar','منطقة نجران','seed'),
  ('state_region','SA-11','ar','منطقة الباحة','seed'),
  ('state_region','SA-12','ar','منطقة الجوف','seed'),
  ('state_region','SA-14','ar','منطقة عسير','seed'),

  -- UAE Emirates
  ('state_region','AE-AZ','ar','أبوظبي','seed'),
  ('state_region','AE-DU','ar','دبي','seed'),
  ('state_region','AE-SH','ar','الشارقة','seed'),
  ('state_region','AE-AJ','ar','عجمان','seed'),
  ('state_region','AE-UQ','ar','أم القيوين','seed'),
  ('state_region','AE-RK','ar','رأس الخيمة','seed'),
  ('state_region','AE-FU','ar','الفجيرة','seed')
on conflict (entity, code, locale_code) do nothing;

-- ============================================================================
-- §12  i18n: Malay Labels
-- ============================================================================

/* ============================================================================
   Athyper — REF Seed: Malay (Bahasa Melayu) Labels (i18n)
   PostgreSQL 16+

   Malay translations for key reference data entities.
   Depends on: 010_ref_master_tables.sql, 050_ref_seed_locales.sql
   ============================================================================ */

-- ============================================================================
-- Countries — GCC + MENA + Major World
-- ============================================================================
insert into ref.label (entity, code, locale_code, name, created_by)
values
  -- GCC
  ('country','SA','ms','Arab Saudi','seed'),
  ('country','AE','ms','Emiriah Arab Bersatu','seed'),
  ('country','BH','ms','Bahrain','seed'),
  ('country','KW','ms','Kuwait','seed'),
  ('country','OM','ms','Oman','seed'),
  ('country','QA','ms','Qatar','seed'),

  -- MENA
  ('country','EG','ms','Mesir','seed'),
  ('country','JO','ms','Jordan','seed'),
  ('country','LB','ms','Lubnan','seed'),
  ('country','IQ','ms','Iraq','seed'),
  ('country','SY','ms','Syria','seed'),
  ('country','YE','ms','Yaman','seed'),
  ('country','PS','ms','Palestin','seed'),
  ('country','SD','ms','Sudan','seed'),
  ('country','LY','ms','Libya','seed'),
  ('country','TN','ms','Tunisia','seed'),
  ('country','DZ','ms','Algeria','seed'),
  ('country','MA','ms','Maghribi','seed'),
  ('country','IR','ms','Iran','seed'),
  ('country','TR','ms','Turki','seed'),
  ('country','IL','ms','Israel','seed'),

  -- Major World
  ('country','US','ms','Amerika Syarikat','seed'),
  ('country','GB','ms','United Kingdom','seed'),
  ('country','FR','ms','Perancis','seed'),
  ('country','DE','ms','Jerman','seed'),
  ('country','IT','ms','Itali','seed'),
  ('country','ES','ms','Sepanyol','seed'),
  ('country','PT','ms','Portugal','seed'),
  ('country','NL','ms','Belanda','seed'),
  ('country','BE','ms','Belgium','seed'),
  ('country','CH','ms','Switzerland','seed'),
  ('country','AT','ms','Austria','seed'),
  ('country','SE','ms','Sweden','seed'),
  ('country','NO','ms','Norway','seed'),
  ('country','DK','ms','Denmark','seed'),
  ('country','FI','ms','Finland','seed'),
  ('country','PL','ms','Poland','seed'),
  ('country','GR','ms','Greece','seed'),
  ('country','RU','ms','Rusia','seed'),
  ('country','UA','ms','Ukraine','seed'),
  ('country','CN','ms','China','seed'),
  ('country','JP','ms','Jepun','seed'),
  ('country','KR','ms','Korea Selatan','seed'),
  ('country','IN','ms','India','seed'),
  ('country','PK','ms','Pakistan','seed'),
  ('country','BD','ms','Bangladesh','seed'),
  ('country','ID','ms','Indonesia','seed'),
  ('country','MY','ms','Malaysia','seed'),
  ('country','SG','ms','Singapura','seed'),
  ('country','TH','ms','Thailand','seed'),
  ('country','VN','ms','Vietnam','seed'),
  ('country','PH','ms','Filipina','seed'),
  ('country','AU','ms','Australia','seed'),
  ('country','NZ','ms','New Zealand','seed'),
  ('country','CA','ms','Kanada','seed'),
  ('country','MX','ms','Mexico','seed'),
  ('country','BR','ms','Brazil','seed'),
  ('country','AR','ms','Argentina','seed'),
  ('country','ZA','ms','Afrika Selatan','seed'),
  ('country','NG','ms','Nigeria','seed'),
  ('country','KE','ms','Kenya','seed'),
  ('country','ET','ms','Ethiopia','seed'),
  ('country','HK','ms','Hong Kong','seed'),
  ('country','TW','ms','Taiwan','seed'),
  ('country','AF','ms','Afghanistan','seed'),
  ('country','LK','ms','Sri Lanka','seed'),
  ('country','NP','ms','Nepal','seed'),
  ('country','MM','ms','Myanmar','seed'),
  ('country','KH','ms','Kemboja','seed'),
  ('country','IE','ms','Ireland','seed')
on conflict (entity, code, locale_code) do nothing;

-- ============================================================================
-- Currencies — GCC + Major
-- ============================================================================
insert into ref.label (entity, code, locale_code, name, created_by)
values
  ('currency','SAR','ms','Riyal Saudi','seed'),
  ('currency','AED','ms','Dirham UAE','seed'),
  ('currency','BHD','ms','Dinar Bahrain','seed'),
  ('currency','KWD','ms','Dinar Kuwait','seed'),
  ('currency','OMR','ms','Riyal Oman','seed'),
  ('currency','QAR','ms','Riyal Qatar','seed'),
  ('currency','EGP','ms','Paun Mesir','seed'),
  ('currency','JOD','ms','Dinar Jordan','seed'),
  ('currency','IQD','ms','Dinar Iraq','seed'),
  ('currency','TRY','ms','Lira Turki','seed'),
  ('currency','USD','ms','Dolar AS','seed'),
  ('currency','EUR','ms','Euro','seed'),
  ('currency','GBP','ms','Paun Sterling','seed'),
  ('currency','JPY','ms','Yen Jepun','seed'),
  ('currency','CNY','ms','Yuan Renminbi','seed'),
  ('currency','CHF','ms','Franc Swiss','seed'),
  ('currency','CAD','ms','Dolar Kanada','seed'),
  ('currency','AUD','ms','Dolar Australia','seed'),
  ('currency','INR','ms','Rupee India','seed'),
  ('currency','PKR','ms','Rupee Pakistan','seed'),
  ('currency','BRL','ms','Real Brazil','seed'),
  ('currency','MXN','ms','Peso Mexico','seed'),
  ('currency','KRW','ms','Won Korea','seed'),
  ('currency','SGD','ms','Dolar Singapura','seed'),
  ('currency','HKD','ms','Dolar Hong Kong','seed'),
  ('currency','MYR','ms','Ringgit Malaysia','seed'),
  ('currency','IDR','ms','Rupiah Indonesia','seed'),
  ('currency','THB','ms','Baht Thailand','seed'),
  ('currency','NZD','ms','Dolar New Zealand','seed'),
  ('currency','ZAR','ms','Rand Afrika Selatan','seed'),
  ('currency','RUB','ms','Ruble Rusia','seed'),
  ('currency','XAU','ms','Emas (auns troy)','seed'),
  ('currency','XAG','ms','Perak (auns troy)','seed')
on conflict (entity, code, locale_code) do nothing;

-- ============================================================================
-- Languages — Major
-- ============================================================================
insert into ref.label (entity, code, locale_code, name, created_by)
values
  ('language','ms','ms','Bahasa Melayu','seed'),
  ('language','en','ms','Bahasa Inggeris','seed'),
  ('language','ar','ms','Bahasa Arab','seed'),
  ('language','fr','ms','Bahasa Perancis','seed'),
  ('language','de','ms','Bahasa Jerman','seed'),
  ('language','es','ms','Bahasa Sepanyol','seed'),
  ('language','pt','ms','Bahasa Portugis','seed'),
  ('language','it','ms','Bahasa Itali','seed'),
  ('language','nl','ms','Bahasa Belanda','seed'),
  ('language','ru','ms','Bahasa Rusia','seed'),
  ('language','zh','ms','Bahasa Cina','seed'),
  ('language','ja','ms','Bahasa Jepun','seed'),
  ('language','ko','ms','Bahasa Korea','seed'),
  ('language','hi','ms','Bahasa Hindi','seed'),
  ('language','bn','ms','Bahasa Bengali','seed'),
  ('language','ur','ms','Bahasa Urdu','seed'),
  ('language','fa','ms','Bahasa Parsi','seed'),
  ('language','tr','ms','Bahasa Turki','seed'),
  ('language','ta','ms','Bahasa Tamil','seed'),
  ('language','te','ms','Bahasa Telugu','seed'),
  ('language','id','ms','Bahasa Indonesia','seed'),
  ('language','th','ms','Bahasa Thai','seed'),
  ('language','vi','ms','Bahasa Vietnam','seed'),
  ('language','pl','ms','Bahasa Poland','seed'),
  ('language','uk','ms','Bahasa Ukraine','seed'),
  ('language','sv','ms','Bahasa Sweden','seed'),
  ('language','el','ms','Bahasa Greek','seed'),
  ('language','he','ms','Bahasa Ibrani','seed'),
  ('language','sw','ms','Bahasa Swahili','seed'),
  ('language','fi','ms','Bahasa Finland','seed')
on conflict (entity, code, locale_code) do nothing;

-- ============================================================================
-- UOM — Core units
-- ============================================================================
insert into ref.label (entity, code, locale_code, name, created_by)
values
  ('uom','EA','ms','Unit','seed'),
  ('uom','C62','ms','Satu','seed'),
  ('uom','PR','ms','Pasang','seed'),
  ('uom','DZN','ms','Dozen','seed'),
  ('uom','SET','ms','Set','seed'),
  ('uom','PK','ms','Bungkus','seed'),
  ('uom','BX','ms','Kotak','seed'),
  ('uom','CT','ms','Karton','seed'),
  ('uom','PL','ms','Palet','seed'),
  ('uom','MGM','ms','Miligram','seed'),
  ('uom','GRM','ms','Gram','seed'),
  ('uom','KGM','ms','Kilogram','seed'),
  ('uom','TNE','ms','Tan Metrik','seed'),
  ('uom','LBR','ms','Paun','seed'),
  ('uom','ONZ','ms','Auns','seed'),
  ('uom','MMT','ms','Milimeter','seed'),
  ('uom','CMT','ms','Sentimeter','seed'),
  ('uom','MTR','ms','Meter','seed'),
  ('uom','KMT','ms','Kilometer','seed'),
  ('uom','INH','ms','Inci','seed'),
  ('uom','FOT','ms','Kaki','seed'),
  ('uom','YRD','ms','Ela','seed'),
  ('uom','SMI','ms','Batu','seed'),
  ('uom','MTK','ms','Meter Persegi','seed'),
  ('uom','KMK','ms','Kilometer Persegi','seed'),
  ('uom','HAR','ms','Hektar','seed'),
  ('uom','ACR','ms','Ekar','seed'),
  ('uom','MLT','ms','Mililiter','seed'),
  ('uom','LTR','ms','Liter','seed'),
  ('uom','MTQ','ms','Meter Padu','seed'),
  ('uom','GLL','ms','Gelen','seed'),
  ('uom','BLL','ms','Tong','seed'),
  ('uom','SEC','ms','Saat','seed'),
  ('uom','MIN','ms','Minit','seed'),
  ('uom','HUR','ms','Jam','seed'),
  ('uom','DAY','ms','Hari','seed'),
  ('uom','WEE','ms','Minggu','seed'),
  ('uom','MON','ms','Bulan','seed'),
  ('uom','ANN','ms','Tahun','seed'),
  ('uom','CEL','ms','Darjah Celsius','seed'),
  ('uom','FAH','ms','Darjah Fahrenheit','seed'),
  ('uom','KWH','ms','Kilowatt jam','seed'),
  ('uom','WTT','ms','Watt','seed'),
  ('uom','KWT','ms','Kilowatt','seed')
on conflict (entity, code, locale_code) do nothing;

-- ============================================================================
-- Saudi & UAE Regions
-- ============================================================================
insert into ref.label (entity, code, locale_code, name, created_by)
values
  ('state_region','SA-01','ms','Wilayah Riyadh','seed'),
  ('state_region','SA-02','ms','Wilayah Makkah','seed'),
  ('state_region','SA-03','ms','Wilayah Madinah','seed'),
  ('state_region','SA-04','ms','Wilayah Timur','seed'),
  ('state_region','SA-05','ms','Wilayah Al-Qassim','seed'),
  ('state_region','SA-06','ms','Wilayah Ha''il','seed'),
  ('state_region','SA-07','ms','Wilayah Tabuk','seed'),
  ('state_region','SA-08','ms','Wilayah Sempadan Utara','seed'),
  ('state_region','SA-09','ms','Wilayah Jazan','seed'),
  ('state_region','SA-10','ms','Wilayah Najran','seed'),
  ('state_region','SA-11','ms','Wilayah Al Bahah','seed'),
  ('state_region','SA-12','ms','Wilayah Al Jawf','seed'),
  ('state_region','SA-14','ms','Wilayah Asir','seed'),
  ('state_region','AE-AZ','ms','Abu Dhabi','seed'),
  ('state_region','AE-DU','ms','Dubai','seed'),
  ('state_region','AE-SH','ms','Sharjah','seed'),
  ('state_region','AE-AJ','ms','Ajman','seed'),
  ('state_region','AE-UQ','ms','Umm al-Quwain','seed'),
  ('state_region','AE-RK','ms','Ras al-Khaimah','seed'),
  ('state_region','AE-FU','ms','Fujairah','seed')
on conflict (entity, code, locale_code) do nothing;

-- ============================================================================
-- §13  i18n: Tamil Labels
-- ============================================================================

/* ============================================================================
   Athyper — REF Seed: Tamil (தமிழ்) Labels (i18n)
   PostgreSQL 16+

   Tamil translations for key reference data entities.
   Depends on: 010_ref_master_tables.sql, 050_ref_seed_locales.sql
   ============================================================================ */

-- ============================================================================
-- Countries — GCC + MENA + Major World
-- ============================================================================
insert into ref.label (entity, code, locale_code, name, created_by)
values
  -- GCC
  ('country','SA','ta','சவூதி அரேபியா','seed'),
  ('country','AE','ta','ஐக்கிய அரபு எமிரேட்ஸ்','seed'),
  ('country','BH','ta','பஹ்ரைன்','seed'),
  ('country','KW','ta','குவைத்','seed'),
  ('country','OM','ta','ஓமான்','seed'),
  ('country','QA','ta','கத்தார்','seed'),

  -- MENA
  ('country','EG','ta','எகிப்து','seed'),
  ('country','JO','ta','ஜோர்டான்','seed'),
  ('country','LB','ta','லெபனான்','seed'),
  ('country','IQ','ta','ஈராக்','seed'),
  ('country','SY','ta','சிரியா','seed'),
  ('country','YE','ta','யேமன்','seed'),
  ('country','PS','ta','பாலஸ்தீனம்','seed'),
  ('country','SD','ta','சூடான்','seed'),
  ('country','LY','ta','லிபியா','seed'),
  ('country','TN','ta','துனிசியா','seed'),
  ('country','DZ','ta','அல்ஜீரியா','seed'),
  ('country','MA','ta','மொராக்கோ','seed'),
  ('country','IR','ta','ஈரான்','seed'),
  ('country','TR','ta','துருக்கி','seed'),
  ('country','IL','ta','இஸ்ரேல்','seed'),

  -- Major World
  ('country','US','ta','அமெரிக்கா','seed'),
  ('country','GB','ta','ஐக்கிய இராச்சியம்','seed'),
  ('country','FR','ta','பிரான்ஸ்','seed'),
  ('country','DE','ta','ஜெர்மனி','seed'),
  ('country','IT','ta','இத்தாலி','seed'),
  ('country','ES','ta','ஸ்பெயின்','seed'),
  ('country','PT','ta','போர்ச்சுகல்','seed'),
  ('country','NL','ta','நெதர்லாந்து','seed'),
  ('country','BE','ta','பெல்ஜியம்','seed'),
  ('country','CH','ta','சுவிட்சர்லாந்து','seed'),
  ('country','AT','ta','ஆஸ்திரியா','seed'),
  ('country','SE','ta','சுவீடன்','seed'),
  ('country','NO','ta','நார்வே','seed'),
  ('country','DK','ta','டென்மார்க்','seed'),
  ('country','FI','ta','பின்லாந்து','seed'),
  ('country','PL','ta','போலந்து','seed'),
  ('country','GR','ta','கிரீஸ்','seed'),
  ('country','RU','ta','ரஷ்யா','seed'),
  ('country','UA','ta','உக்ரைன்','seed'),
  ('country','CN','ta','சீனா','seed'),
  ('country','JP','ta','ஜப்பான்','seed'),
  ('country','KR','ta','தென் கொரியா','seed'),
  ('country','IN','ta','இந்தியா','seed'),
  ('country','PK','ta','பாகிஸ்தான்','seed'),
  ('country','BD','ta','வங்கதேசம்','seed'),
  ('country','ID','ta','இந்தோனேசியா','seed'),
  ('country','MY','ta','மலேசியா','seed'),
  ('country','SG','ta','சிங்கப்பூர்','seed'),
  ('country','TH','ta','தாய்லாந்து','seed'),
  ('country','VN','ta','வியட்நாம்','seed'),
  ('country','PH','ta','பிலிப்பைன்ஸ்','seed'),
  ('country','AU','ta','ஆஸ்திரேலியா','seed'),
  ('country','NZ','ta','நியூசிலாந்து','seed'),
  ('country','CA','ta','கனடா','seed'),
  ('country','MX','ta','மெக்சிகோ','seed'),
  ('country','BR','ta','பிரேசில்','seed'),
  ('country','AR','ta','அர்ஜெண்டீனா','seed'),
  ('country','ZA','ta','தென் ஆப்பிரிக்கா','seed'),
  ('country','NG','ta','நைஜீரியா','seed'),
  ('country','KE','ta','கென்யா','seed'),
  ('country','ET','ta','எத்தியோப்பியா','seed'),
  ('country','HK','ta','ஹாங்காங்','seed'),
  ('country','TW','ta','தைவான்','seed'),
  ('country','AF','ta','ஆப்கானிஸ்தான்','seed'),
  ('country','LK','ta','இலங்கை','seed'),
  ('country','NP','ta','நேபாளம்','seed'),
  ('country','MM','ta','மியான்மர்','seed'),
  ('country','KH','ta','கம்போடியா','seed'),
  ('country','IE','ta','அயர்லாந்து','seed')
on conflict (entity, code, locale_code) do nothing;

-- ============================================================================
-- Currencies — GCC + Major
-- ============================================================================
insert into ref.label (entity, code, locale_code, name, created_by)
values
  ('currency','SAR','ta','சவூதி ரியால்','seed'),
  ('currency','AED','ta','யுஏஇ திர்ஹாம்','seed'),
  ('currency','BHD','ta','பஹ்ரைன் தினார்','seed'),
  ('currency','KWD','ta','குவைத் தினார்','seed'),
  ('currency','OMR','ta','ஓமான் ரியால்','seed'),
  ('currency','QAR','ta','கத்தார் ரியால்','seed'),
  ('currency','EGP','ta','எகிப்திய பவுண்டு','seed'),
  ('currency','JOD','ta','ஜோர்டானிய தினார்','seed'),
  ('currency','IQD','ta','ஈராக் தினார்','seed'),
  ('currency','TRY','ta','துருக்கிய லிரா','seed'),
  ('currency','USD','ta','அமெரிக்க டாலர்','seed'),
  ('currency','EUR','ta','யூரோ','seed'),
  ('currency','GBP','ta','பிரிட்டிஷ் பவுண்டு','seed'),
  ('currency','JPY','ta','ஜப்பானிய யென்','seed'),
  ('currency','CNY','ta','சீன யுவான்','seed'),
  ('currency','CHF','ta','சுவிஸ் பிராங்க்','seed'),
  ('currency','CAD','ta','கனேடிய டாலர்','seed'),
  ('currency','AUD','ta','ஆஸ்திரேலிய டாலர்','seed'),
  ('currency','INR','ta','இந்திய ரூபாய்','seed'),
  ('currency','PKR','ta','பாகிஸ்தான் ரூபாய்','seed'),
  ('currency','BRL','ta','பிரேசிலிய ரியால்','seed'),
  ('currency','KRW','ta','கொரிய வான்','seed'),
  ('currency','SGD','ta','சிங்கப்பூர் டாலர்','seed'),
  ('currency','HKD','ta','ஹாங்காங் டாலர்','seed'),
  ('currency','MYR','ta','மலேசிய ரிங்கிட்','seed'),
  ('currency','IDR','ta','இந்தோனேசிய ரூபியா','seed'),
  ('currency','THB','ta','தாய் பாட்','seed'),
  ('currency','LKR','ta','இலங்கை ரூபாய்','seed'),
  ('currency','NZD','ta','நியூசிலாந்து டாலர்','seed'),
  ('currency','ZAR','ta','தென் ஆப்பிரிக்க ராண்ட்','seed'),
  ('currency','RUB','ta','ரஷ்ய ரூபிள்','seed'),
  ('currency','XAU','ta','தங்கம் (ட்ராய் அவுன்ஸ்)','seed'),
  ('currency','XAG','ta','வெள்ளி (ட்ராய் அவுன்ஸ்)','seed')
on conflict (entity, code, locale_code) do nothing;

-- ============================================================================
-- Languages — Major
-- ============================================================================
insert into ref.label (entity, code, locale_code, name, created_by)
values
  ('language','ta','ta','தமிழ்','seed'),
  ('language','en','ta','ஆங்கிலம்','seed'),
  ('language','ar','ta','அரபு','seed'),
  ('language','fr','ta','பிரெஞ்சு','seed'),
  ('language','de','ta','ஜெர்மன்','seed'),
  ('language','es','ta','ஸ்பானிஷ்','seed'),
  ('language','pt','ta','போர்ச்சுகீசு','seed'),
  ('language','it','ta','இத்தாலியன்','seed'),
  ('language','nl','ta','டச்சு','seed'),
  ('language','ru','ta','ரஷ்யன்','seed'),
  ('language','zh','ta','சீனம்','seed'),
  ('language','ja','ta','ஜப்பானியம்','seed'),
  ('language','ko','ta','கொரியன்','seed'),
  ('language','hi','ta','ஹிந்தி','seed'),
  ('language','bn','ta','வங்காளம்','seed'),
  ('language','ur','ta','உருது','seed'),
  ('language','fa','ta','பாரசீகம்','seed'),
  ('language','tr','ta','துருக்கியம்','seed'),
  ('language','te','ta','தெலுங்கு','seed'),
  ('language','ml','ta','மலையாளம்','seed'),
  ('language','kn','ta','கன்னடம்','seed'),
  ('language','ms','ta','மலாய்','seed'),
  ('language','id','ta','இந்தோனேசியன்','seed'),
  ('language','th','ta','தாய்','seed'),
  ('language','vi','ta','வியட்நாமியம்','seed'),
  ('language','pl','ta','போலிஷ்','seed'),
  ('language','uk','ta','உக்ரேனியன்','seed'),
  ('language','sv','ta','ஸ்வீடிஷ்','seed'),
  ('language','el','ta','கிரேக்கம்','seed'),
  ('language','he','ta','ஹீப்ரு','seed'),
  ('language','sw','ta','சுவாஹிலி','seed')
on conflict (entity, code, locale_code) do nothing;

-- ============================================================================
-- UOM — Core units
-- ============================================================================
insert into ref.label (entity, code, locale_code, name, created_by)
values
  ('uom','EA','ta','அலகு','seed'),
  ('uom','C62','ta','ஒன்று','seed'),
  ('uom','PR','ta','இணை','seed'),
  ('uom','DZN','ta','டஜன்','seed'),
  ('uom','SET','ta','தொகுப்பு','seed'),
  ('uom','PK','ta','பொட்டலம்','seed'),
  ('uom','BX','ta','பெட்டி','seed'),
  ('uom','CT','ta','அட்டைப்பெட்டி','seed'),
  ('uom','PL','ta','தட்டு','seed'),
  ('uom','MGM','ta','மில்லிகிராம்','seed'),
  ('uom','GRM','ta','கிராம்','seed'),
  ('uom','KGM','ta','கிலோகிராம்','seed'),
  ('uom','TNE','ta','மெட்ரிக் டன்','seed'),
  ('uom','LBR','ta','பவுண்டு','seed'),
  ('uom','ONZ','ta','அவுன்ஸ்','seed'),
  ('uom','MMT','ta','மில்லிமீட்டர்','seed'),
  ('uom','CMT','ta','சென்டிமீட்டர்','seed'),
  ('uom','MTR','ta','மீட்டர்','seed'),
  ('uom','KMT','ta','கிலோமீட்டர்','seed'),
  ('uom','INH','ta','அங்குலம்','seed'),
  ('uom','FOT','ta','அடி','seed'),
  ('uom','YRD','ta','கெஜம்','seed'),
  ('uom','SMI','ta','மைல்','seed'),
  ('uom','MTK','ta','சதுர மீட்டர்','seed'),
  ('uom','KMK','ta','சதுர கிலோமீட்டர்','seed'),
  ('uom','HAR','ta','ஹெக்டேர்','seed'),
  ('uom','ACR','ta','ஏக்கர்','seed'),
  ('uom','MLT','ta','மில்லிலீட்டர்','seed'),
  ('uom','LTR','ta','லீட்டர்','seed'),
  ('uom','MTQ','ta','கன மீட்டர்','seed'),
  ('uom','GLL','ta','காலன்','seed'),
  ('uom','BLL','ta','பீப்பாய்','seed'),
  ('uom','SEC','ta','விநாடி','seed'),
  ('uom','MIN','ta','நிமிடம்','seed'),
  ('uom','HUR','ta','மணி','seed'),
  ('uom','DAY','ta','நாள்','seed'),
  ('uom','WEE','ta','வாரம்','seed'),
  ('uom','MON','ta','மாதம்','seed'),
  ('uom','ANN','ta','ஆண்டு','seed'),
  ('uom','CEL','ta','செல்சியஸ்','seed'),
  ('uom','FAH','ta','ஃபாரன்ஹீட்','seed'),
  ('uom','KWH','ta','கிலோவாட் மணி','seed'),
  ('uom','WTT','ta','வாட்','seed'),
  ('uom','KWT','ta','கிலோவாட்','seed')
on conflict (entity, code, locale_code) do nothing;

-- ============================================================================
-- Saudi & UAE Regions
-- ============================================================================
insert into ref.label (entity, code, locale_code, name, created_by)
values
  ('state_region','SA-01','ta','ரியாத் மாகாணம்','seed'),
  ('state_region','SA-02','ta','மக்கா மாகாணம்','seed'),
  ('state_region','SA-03','ta','மதீனா மாகாணம்','seed'),
  ('state_region','SA-04','ta','கிழக்கு மாகாணம்','seed'),
  ('state_region','SA-05','ta','அல்-கசீம் மாகாணம்','seed'),
  ('state_region','SA-06','ta','ஹாயில் மாகாணம்','seed'),
  ('state_region','SA-07','ta','தபூக் மாகாணம்','seed'),
  ('state_region','SA-08','ta','வட எல்லை மாகாணம்','seed'),
  ('state_region','SA-09','ta','ஜாசான் மாகாணம்','seed'),
  ('state_region','SA-10','ta','நஜ்ரான் மாகாணம்','seed'),
  ('state_region','SA-11','ta','அல் பாஹா மாகாணம்','seed'),
  ('state_region','SA-12','ta','அல் ஜவ்ஃப் மாகாணம்','seed'),
  ('state_region','SA-14','ta','அசீர் மாகாணம்','seed'),
  ('state_region','AE-AZ','ta','அபுதாபி','seed'),
  ('state_region','AE-DU','ta','துபாய்','seed'),
  ('state_region','AE-SH','ta','ஷார்ஜா','seed'),
  ('state_region','AE-AJ','ta','அஜ்மான்','seed'),
  ('state_region','AE-UQ','ta','உம் அல்-குவைன்','seed'),
  ('state_region','AE-RK','ta','ராஸ் அல்-கைமா','seed'),
  ('state_region','AE-FU','ta','ஃபுஜைரா','seed')
on conflict (entity, code, locale_code) do nothing;

-- ============================================================================
-- §14  i18n: Hindi Labels
-- ============================================================================

/* ============================================================================
   Athyper — REF Seed: Hindi (हिन्दी) Labels (i18n)
   PostgreSQL 16+

   Hindi translations for key reference data entities.
   Depends on: 010_ref_master_tables.sql, 050_ref_seed_locales.sql
   ============================================================================ */

-- ============================================================================
-- Countries — GCC + MENA + Major World
-- ============================================================================
insert into ref.label (entity, code, locale_code, name, created_by)
values
  -- GCC
  ('country','SA','hi','सऊदी अरब','seed'),
  ('country','AE','hi','संयुक्त अरब अमीरात','seed'),
  ('country','BH','hi','बहरीन','seed'),
  ('country','KW','hi','कुवैत','seed'),
  ('country','OM','hi','ओमान','seed'),
  ('country','QA','hi','क़तर','seed'),

  -- MENA
  ('country','EG','hi','मिस्र','seed'),
  ('country','JO','hi','जॉर्डन','seed'),
  ('country','LB','hi','लेबनान','seed'),
  ('country','IQ','hi','इराक','seed'),
  ('country','SY','hi','सीरिया','seed'),
  ('country','YE','hi','यमन','seed'),
  ('country','PS','hi','फ़िलिस्तीन','seed'),
  ('country','SD','hi','सूडान','seed'),
  ('country','LY','hi','लीबिया','seed'),
  ('country','TN','hi','ट्यूनीशिया','seed'),
  ('country','DZ','hi','अल्जीरिया','seed'),
  ('country','MA','hi','मोरक्को','seed'),
  ('country','IR','hi','ईरान','seed'),
  ('country','TR','hi','तुर्किये','seed'),
  ('country','IL','hi','इज़राइल','seed'),

  -- Major World
  ('country','US','hi','संयुक्त राज्य अमेरिका','seed'),
  ('country','GB','hi','यूनाइटेड किंगडम','seed'),
  ('country','FR','hi','फ़्रांस','seed'),
  ('country','DE','hi','जर्मनी','seed'),
  ('country','IT','hi','इटली','seed'),
  ('country','ES','hi','स्पेन','seed'),
  ('country','PT','hi','पुर्तगाल','seed'),
  ('country','NL','hi','नीदरलैंड','seed'),
  ('country','BE','hi','बेल्जियम','seed'),
  ('country','CH','hi','स्विट्ज़रलैंड','seed'),
  ('country','AT','hi','ऑस्ट्रिया','seed'),
  ('country','SE','hi','स्वीडन','seed'),
  ('country','NO','hi','नॉर्वे','seed'),
  ('country','DK','hi','डेनमार्क','seed'),
  ('country','FI','hi','फ़िनलैंड','seed'),
  ('country','PL','hi','पोलैंड','seed'),
  ('country','GR','hi','यूनान','seed'),
  ('country','RU','hi','रूस','seed'),
  ('country','UA','hi','यूक्रेन','seed'),
  ('country','CN','hi','चीन','seed'),
  ('country','JP','hi','जापान','seed'),
  ('country','KR','hi','दक्षिण कोरिया','seed'),
  ('country','IN','hi','भारत','seed'),
  ('country','PK','hi','पाकिस्तान','seed'),
  ('country','BD','hi','बांग्लादेश','seed'),
  ('country','ID','hi','इंडोनेशिया','seed'),
  ('country','MY','hi','मलेशिया','seed'),
  ('country','SG','hi','सिंगापुर','seed'),
  ('country','TH','hi','थाईलैंड','seed'),
  ('country','VN','hi','वियतनाम','seed'),
  ('country','PH','hi','फ़िलीपींस','seed'),
  ('country','AU','hi','ऑस्ट्रेलिया','seed'),
  ('country','NZ','hi','न्यूज़ीलैंड','seed'),
  ('country','CA','hi','कनाडा','seed'),
  ('country','MX','hi','मेक्सिको','seed'),
  ('country','BR','hi','ब्राज़ील','seed'),
  ('country','AR','hi','अर्जेंटीना','seed'),
  ('country','ZA','hi','दक्षिण अफ़्रीका','seed'),
  ('country','NG','hi','नाइजीरिया','seed'),
  ('country','KE','hi','केन्या','seed'),
  ('country','ET','hi','इथियोपिया','seed'),
  ('country','HK','hi','हॉन्ग कॉन्ग','seed'),
  ('country','TW','hi','ताइवान','seed'),
  ('country','AF','hi','अफ़गानिस्तान','seed'),
  ('country','LK','hi','श्रीलंका','seed'),
  ('country','NP','hi','नेपाल','seed'),
  ('country','MM','hi','म्यानमार','seed'),
  ('country','KH','hi','कंबोडिया','seed'),
  ('country','IE','hi','आयरलैंड','seed')
on conflict (entity, code, locale_code) do nothing;

-- ============================================================================
-- Currencies — GCC + Major
-- ============================================================================
insert into ref.label (entity, code, locale_code, name, created_by)
values
  ('currency','SAR','hi','सऊदी रियाल','seed'),
  ('currency','AED','hi','यूएई दिरहम','seed'),
  ('currency','BHD','hi','बहरीनी दीनार','seed'),
  ('currency','KWD','hi','कुवैती दीनार','seed'),
  ('currency','OMR','hi','ओमानी रियाल','seed'),
  ('currency','QAR','hi','क़तरी रियाल','seed'),
  ('currency','EGP','hi','मिस्री पाउंड','seed'),
  ('currency','JOD','hi','जॉर्डनियाई दीनार','seed'),
  ('currency','IQD','hi','इराकी दीनार','seed'),
  ('currency','TRY','hi','तुर्की लीरा','seed'),
  ('currency','USD','hi','अमेरिकी डॉलर','seed'),
  ('currency','EUR','hi','यूरो','seed'),
  ('currency','GBP','hi','ब्रिटिश पाउंड','seed'),
  ('currency','JPY','hi','जापानी येन','seed'),
  ('currency','CNY','hi','चीनी युआन','seed'),
  ('currency','CHF','hi','स्विस फ़्रैंक','seed'),
  ('currency','CAD','hi','कैनेडियन डॉलर','seed'),
  ('currency','AUD','hi','ऑस्ट्रेलियाई डॉलर','seed'),
  ('currency','INR','hi','भारतीय रुपया','seed'),
  ('currency','PKR','hi','पाकिस्तानी रुपया','seed'),
  ('currency','BRL','hi','ब्राज़ीलियन रियाल','seed'),
  ('currency','KRW','hi','दक्षिण कोरियाई वॉन','seed'),
  ('currency','SGD','hi','सिंगापुर डॉलर','seed'),
  ('currency','HKD','hi','हॉन्ग कॉन्ग डॉलर','seed'),
  ('currency','MYR','hi','मलेशियाई रिंगिट','seed'),
  ('currency','IDR','hi','इंडोनेशियाई रुपिया','seed'),
  ('currency','THB','hi','थाई बात','seed'),
  ('currency','LKR','hi','श्रीलंकाई रुपया','seed'),
  ('currency','NPR','hi','नेपाली रुपया','seed'),
  ('currency','NZD','hi','न्यूज़ीलैंड डॉलर','seed'),
  ('currency','ZAR','hi','दक्षिण अफ़्रीकी रैंड','seed'),
  ('currency','RUB','hi','रूसी रूबल','seed'),
  ('currency','XAU','hi','सोना (ट्रॉय औंस)','seed'),
  ('currency','XAG','hi','चाँदी (ट्रॉय औंस)','seed')
on conflict (entity, code, locale_code) do nothing;

-- ============================================================================
-- Languages — Major
-- ============================================================================
insert into ref.label (entity, code, locale_code, name, created_by)
values
  ('language','hi','hi','हिन्दी','seed'),
  ('language','en','hi','अंग्रेज़ी','seed'),
  ('language','ar','hi','अरबी','seed'),
  ('language','fr','hi','फ़्रेंच','seed'),
  ('language','de','hi','जर्मन','seed'),
  ('language','es','hi','स्पेनी','seed'),
  ('language','pt','hi','पुर्तगाली','seed'),
  ('language','it','hi','इतालवी','seed'),
  ('language','nl','hi','डच','seed'),
  ('language','ru','hi','रूसी','seed'),
  ('language','zh','hi','चीनी','seed'),
  ('language','ja','hi','जापानी','seed'),
  ('language','ko','hi','कोरियाई','seed'),
  ('language','bn','hi','बांग्ला','seed'),
  ('language','ur','hi','उर्दू','seed'),
  ('language','fa','hi','फ़ारसी','seed'),
  ('language','tr','hi','तुर्की','seed'),
  ('language','ta','hi','तमिल','seed'),
  ('language','te','hi','तेलुगु','seed'),
  ('language','ml','hi','मलयालम','seed'),
  ('language','kn','hi','कन्नड़','seed'),
  ('language','mr','hi','मराठी','seed'),
  ('language','gu','hi','गुजराती','seed'),
  ('language','pa','hi','पंजाबी','seed'),
  ('language','ms','hi','मलय','seed'),
  ('language','id','hi','इंडोनेशियाई','seed'),
  ('language','th','hi','थाई','seed'),
  ('language','vi','hi','वियतनामी','seed'),
  ('language','pl','hi','पोलिश','seed'),
  ('language','uk','hi','यूक्रेनी','seed'),
  ('language','sv','hi','स्वीडिश','seed'),
  ('language','el','hi','यूनानी','seed'),
  ('language','he','hi','हिब्रू','seed'),
  ('language','sw','hi','स्वाहिली','seed')
on conflict (entity, code, locale_code) do nothing;

-- ============================================================================
-- UOM — Core units
-- ============================================================================
insert into ref.label (entity, code, locale_code, name, created_by)
values
  ('uom','EA','hi','इकाई','seed'),
  ('uom','C62','hi','एक','seed'),
  ('uom','PR','hi','जोड़ा','seed'),
  ('uom','DZN','hi','दर्जन','seed'),
  ('uom','SET','hi','सेट','seed'),
  ('uom','PK','hi','पैक','seed'),
  ('uom','BX','hi','डिब्बा','seed'),
  ('uom','CT','hi','कार्टन','seed'),
  ('uom','PL','hi','पैलेट','seed'),
  ('uom','MGM','hi','मिलीग्राम','seed'),
  ('uom','GRM','hi','ग्राम','seed'),
  ('uom','KGM','hi','किलोग्राम','seed'),
  ('uom','TNE','hi','मीट्रिक टन','seed'),
  ('uom','LBR','hi','पाउंड','seed'),
  ('uom','ONZ','hi','औंस','seed'),
  ('uom','MMT','hi','मिलीमीटर','seed'),
  ('uom','CMT','hi','सेंटीमीटर','seed'),
  ('uom','MTR','hi','मीटर','seed'),
  ('uom','KMT','hi','किलोमीटर','seed'),
  ('uom','INH','hi','इंच','seed'),
  ('uom','FOT','hi','फ़ुट','seed'),
  ('uom','YRD','hi','गज','seed'),
  ('uom','SMI','hi','मील','seed'),
  ('uom','MTK','hi','वर्ग मीटर','seed'),
  ('uom','KMK','hi','वर्ग किलोमीटर','seed'),
  ('uom','HAR','hi','हेक्टेयर','seed'),
  ('uom','ACR','hi','एकड़','seed'),
  ('uom','MLT','hi','मिलीलीटर','seed'),
  ('uom','LTR','hi','लीटर','seed'),
  ('uom','MTQ','hi','घन मीटर','seed'),
  ('uom','GLL','hi','गैलन','seed'),
  ('uom','BLL','hi','बैरल','seed'),
  ('uom','SEC','hi','सेकंड','seed'),
  ('uom','MIN','hi','मिनट','seed'),
  ('uom','HUR','hi','घंटा','seed'),
  ('uom','DAY','hi','दिन','seed'),
  ('uom','WEE','hi','सप्ताह','seed'),
  ('uom','MON','hi','महीना','seed'),
  ('uom','ANN','hi','वर्ष','seed'),
  ('uom','CEL','hi','डिग्री सेल्सियस','seed'),
  ('uom','FAH','hi','डिग्री फ़ारेनहाइट','seed'),
  ('uom','KWH','hi','किलोवाट घंटा','seed'),
  ('uom','WTT','hi','वाट','seed'),
  ('uom','KWT','hi','किलोवाट','seed')
on conflict (entity, code, locale_code) do nothing;

-- ============================================================================
-- Saudi & UAE Regions
-- ============================================================================
insert into ref.label (entity, code, locale_code, name, created_by)
values
  ('state_region','SA-01','hi','रियाद क्षेत्र','seed'),
  ('state_region','SA-02','hi','मक्का क्षेत्र','seed'),
  ('state_region','SA-03','hi','मदीना क्षेत्र','seed'),
  ('state_region','SA-04','hi','पूर्वी क्षेत्र','seed'),
  ('state_region','SA-05','hi','अल-क़सीम क्षेत्र','seed'),
  ('state_region','SA-06','hi','हाइल क्षेत्र','seed'),
  ('state_region','SA-07','hi','तबूक क्षेत्र','seed'),
  ('state_region','SA-08','hi','उत्तरी सीमा क्षेत्र','seed'),
  ('state_region','SA-09','hi','जाज़ान क्षेत्र','seed'),
  ('state_region','SA-10','hi','नजरान क्षेत्र','seed'),
  ('state_region','SA-11','hi','अल बाहा क्षेत्र','seed'),
  ('state_region','SA-12','hi','अल जौफ़ क्षेत्र','seed'),
  ('state_region','SA-14','hi','असीर क्षेत्र','seed'),
  ('state_region','AE-AZ','hi','अबू धाबी','seed'),
  ('state_region','AE-DU','hi','दुबई','seed'),
  ('state_region','AE-SH','hi','शारजाह','seed'),
  ('state_region','AE-AJ','hi','अजमान','seed'),
  ('state_region','AE-UQ','hi','उम्म अल-क़ुवैन','seed'),
  ('state_region','AE-RK','hi','रास अल-ख़ैमा','seed'),
  ('state_region','AE-FU','hi','फ़ुजैरा','seed')
on conflict (entity, code, locale_code) do nothing;

-- ============================================================================
-- §15  i18n: French Labels
-- ============================================================================

/* ============================================================================
   Athyper — REF Seed: French (Français) Labels (i18n)
   PostgreSQL 16+

   French translations for key reference data entities.
   Depends on: 010_ref_master_tables.sql, 050_ref_seed_locales.sql
   ============================================================================ */

-- ============================================================================
-- Countries — GCC + MENA + Major World
-- ============================================================================
insert into ref.label (entity, code, locale_code, name, created_by)
values
  -- GCC
  ('country','SA','fr','Arabie saoudite','seed'),
  ('country','AE','fr','Émirats arabes unis','seed'),
  ('country','BH','fr','Bahreïn','seed'),
  ('country','KW','fr','Koweït','seed'),
  ('country','OM','fr','Oman','seed'),
  ('country','QA','fr','Qatar','seed'),

  -- MENA
  ('country','EG','fr','Égypte','seed'),
  ('country','JO','fr','Jordanie','seed'),
  ('country','LB','fr','Liban','seed'),
  ('country','IQ','fr','Irak','seed'),
  ('country','SY','fr','Syrie','seed'),
  ('country','YE','fr','Yémen','seed'),
  ('country','PS','fr','Palestine','seed'),
  ('country','SD','fr','Soudan','seed'),
  ('country','LY','fr','Libye','seed'),
  ('country','TN','fr','Tunisie','seed'),
  ('country','DZ','fr','Algérie','seed'),
  ('country','MA','fr','Maroc','seed'),
  ('country','IR','fr','Iran','seed'),
  ('country','TR','fr','Turquie','seed'),
  ('country','IL','fr','Israël','seed'),

  -- Major World
  ('country','US','fr','États-Unis','seed'),
  ('country','GB','fr','Royaume-Uni','seed'),
  ('country','FR','fr','France','seed'),
  ('country','DE','fr','Allemagne','seed'),
  ('country','IT','fr','Italie','seed'),
  ('country','ES','fr','Espagne','seed'),
  ('country','PT','fr','Portugal','seed'),
  ('country','NL','fr','Pays-Bas','seed'),
  ('country','BE','fr','Belgique','seed'),
  ('country','CH','fr','Suisse','seed'),
  ('country','AT','fr','Autriche','seed'),
  ('country','SE','fr','Suède','seed'),
  ('country','NO','fr','Norvège','seed'),
  ('country','DK','fr','Danemark','seed'),
  ('country','FI','fr','Finlande','seed'),
  ('country','PL','fr','Pologne','seed'),
  ('country','GR','fr','Grèce','seed'),
  ('country','RU','fr','Russie','seed'),
  ('country','UA','fr','Ukraine','seed'),
  ('country','CN','fr','Chine','seed'),
  ('country','JP','fr','Japon','seed'),
  ('country','KR','fr','Corée du Sud','seed'),
  ('country','IN','fr','Inde','seed'),
  ('country','PK','fr','Pakistan','seed'),
  ('country','BD','fr','Bangladesh','seed'),
  ('country','ID','fr','Indonésie','seed'),
  ('country','MY','fr','Malaisie','seed'),
  ('country','SG','fr','Singapour','seed'),
  ('country','TH','fr','Thaïlande','seed'),
  ('country','VN','fr','Viêt Nam','seed'),
  ('country','PH','fr','Philippines','seed'),
  ('country','AU','fr','Australie','seed'),
  ('country','NZ','fr','Nouvelle-Zélande','seed'),
  ('country','CA','fr','Canada','seed'),
  ('country','MX','fr','Mexique','seed'),
  ('country','BR','fr','Brésil','seed'),
  ('country','AR','fr','Argentine','seed'),
  ('country','CL','fr','Chili','seed'),
  ('country','CO','fr','Colombie','seed'),
  ('country','ZA','fr','Afrique du Sud','seed'),
  ('country','NG','fr','Nigéria','seed'),
  ('country','KE','fr','Kenya','seed'),
  ('country','ET','fr','Éthiopie','seed'),
  ('country','GH','fr','Ghana','seed'),
  ('country','TZ','fr','Tanzanie','seed'),
  ('country','SN','fr','Sénégal','seed'),
  ('country','CI','fr','Côte d''Ivoire','seed'),
  ('country','CM','fr','Cameroun','seed'),
  ('country','HK','fr','Hong Kong','seed'),
  ('country','TW','fr','Taïwan','seed'),
  ('country','AF','fr','Afghanistan','seed'),
  ('country','LK','fr','Sri Lanka','seed'),
  ('country','NP','fr','Népal','seed'),
  ('country','MM','fr','Myanmar','seed'),
  ('country','KH','fr','Cambodge','seed'),
  ('country','IE','fr','Irlande','seed')
on conflict (entity, code, locale_code) do nothing;

-- ============================================================================
-- Currencies — GCC + Major
-- ============================================================================
insert into ref.label (entity, code, locale_code, name, created_by)
values
  ('currency','SAR','fr','Riyal saoudien','seed'),
  ('currency','AED','fr','Dirham des Émirats','seed'),
  ('currency','BHD','fr','Dinar bahreïni','seed'),
  ('currency','KWD','fr','Dinar koweïtien','seed'),
  ('currency','OMR','fr','Riyal omanais','seed'),
  ('currency','QAR','fr','Riyal qatari','seed'),
  ('currency','EGP','fr','Livre égyptienne','seed'),
  ('currency','JOD','fr','Dinar jordanien','seed'),
  ('currency','IQD','fr','Dinar irakien','seed'),
  ('currency','LBP','fr','Livre libanaise','seed'),
  ('currency','TRY','fr','Livre turque','seed'),
  ('currency','MAD','fr','Dirham marocain','seed'),
  ('currency','TND','fr','Dinar tunisien','seed'),
  ('currency','DZD','fr','Dinar algérien','seed'),
  ('currency','USD','fr','Dollar américain','seed'),
  ('currency','EUR','fr','Euro','seed'),
  ('currency','GBP','fr','Livre sterling','seed'),
  ('currency','JPY','fr','Yen japonais','seed'),
  ('currency','CNY','fr','Yuan renminbi','seed'),
  ('currency','CHF','fr','Franc suisse','seed'),
  ('currency','CAD','fr','Dollar canadien','seed'),
  ('currency','AUD','fr','Dollar australien','seed'),
  ('currency','INR','fr','Roupie indienne','seed'),
  ('currency','PKR','fr','Roupie pakistanaise','seed'),
  ('currency','BRL','fr','Réal brésilien','seed'),
  ('currency','MXN','fr','Peso mexicain','seed'),
  ('currency','KRW','fr','Won sud-coréen','seed'),
  ('currency','SGD','fr','Dollar de Singapour','seed'),
  ('currency','HKD','fr','Dollar de Hong Kong','seed'),
  ('currency','MYR','fr','Ringgit malaisien','seed'),
  ('currency','IDR','fr','Roupie indonésienne','seed'),
  ('currency','THB','fr','Baht thaïlandais','seed'),
  ('currency','NZD','fr','Dollar néo-zélandais','seed'),
  ('currency','ZAR','fr','Rand sud-africain','seed'),
  ('currency','RUB','fr','Rouble russe','seed'),
  ('currency','XOF','fr','Franc CFA (BCEAO)','seed'),
  ('currency','XAF','fr','Franc CFA (BEAC)','seed'),
  ('currency','XAU','fr','Or (once troy)','seed'),
  ('currency','XAG','fr','Argent (once troy)','seed')
on conflict (entity, code, locale_code) do nothing;

-- ============================================================================
-- Languages — Major
-- ============================================================================
insert into ref.label (entity, code, locale_code, name, created_by)
values
  ('language','fr','fr','Français','seed'),
  ('language','en','fr','Anglais','seed'),
  ('language','ar','fr','Arabe','seed'),
  ('language','de','fr','Allemand','seed'),
  ('language','es','fr','Espagnol','seed'),
  ('language','pt','fr','Portugais','seed'),
  ('language','it','fr','Italien','seed'),
  ('language','nl','fr','Néerlandais','seed'),
  ('language','ru','fr','Russe','seed'),
  ('language','zh','fr','Chinois','seed'),
  ('language','ja','fr','Japonais','seed'),
  ('language','ko','fr','Coréen','seed'),
  ('language','hi','fr','Hindi','seed'),
  ('language','bn','fr','Bengali','seed'),
  ('language','ur','fr','Ourdou','seed'),
  ('language','fa','fr','Persan','seed'),
  ('language','tr','fr','Turc','seed'),
  ('language','ta','fr','Tamoul','seed'),
  ('language','te','fr','Télougou','seed'),
  ('language','ml','fr','Malayalam','seed'),
  ('language','ms','fr','Malais','seed'),
  ('language','id','fr','Indonésien','seed'),
  ('language','th','fr','Thaï','seed'),
  ('language','vi','fr','Vietnamien','seed'),
  ('language','pl','fr','Polonais','seed'),
  ('language','uk','fr','Ukrainien','seed'),
  ('language','sv','fr','Suédois','seed'),
  ('language','da','fr','Danois','seed'),
  ('language','no','fr','Norvégien','seed'),
  ('language','fi','fr','Finnois','seed'),
  ('language','el','fr','Grec','seed'),
  ('language','he','fr','Hébreu','seed'),
  ('language','sw','fr','Swahili','seed'),
  ('language','so','fr','Somali','seed')
on conflict (entity, code, locale_code) do nothing;

-- ============================================================================
-- UOM — Core units
-- ============================================================================
insert into ref.label (entity, code, locale_code, name, created_by)
values
  ('uom','EA','fr','Unité','seed'),
  ('uom','C62','fr','Un','seed'),
  ('uom','PR','fr','Paire','seed'),
  ('uom','DZN','fr','Douzaine','seed'),
  ('uom','SET','fr','Ensemble','seed'),
  ('uom','PK','fr','Paquet','seed'),
  ('uom','BX','fr','Boîte','seed'),
  ('uom','CT','fr','Carton','seed'),
  ('uom','PL','fr','Palette','seed'),
  ('uom','MGM','fr','Milligramme','seed'),
  ('uom','GRM','fr','Gramme','seed'),
  ('uom','KGM','fr','Kilogramme','seed'),
  ('uom','TNE','fr','Tonne métrique','seed'),
  ('uom','LBR','fr','Livre','seed'),
  ('uom','ONZ','fr','Once','seed'),
  ('uom','MMT','fr','Millimètre','seed'),
  ('uom','CMT','fr','Centimètre','seed'),
  ('uom','MTR','fr','Mètre','seed'),
  ('uom','KMT','fr','Kilomètre','seed'),
  ('uom','INH','fr','Pouce','seed'),
  ('uom','FOT','fr','Pied','seed'),
  ('uom','YRD','fr','Yard','seed'),
  ('uom','SMI','fr','Mile','seed'),
  ('uom','MTK','fr','Mètre carré','seed'),
  ('uom','KMK','fr','Kilomètre carré','seed'),
  ('uom','HAR','fr','Hectare','seed'),
  ('uom','ACR','fr','Acre','seed'),
  ('uom','MLT','fr','Millilitre','seed'),
  ('uom','LTR','fr','Litre','seed'),
  ('uom','MTQ','fr','Mètre cube','seed'),
  ('uom','GLL','fr','Gallon','seed'),
  ('uom','BLL','fr','Baril','seed'),
  ('uom','SEC','fr','Seconde','seed'),
  ('uom','MIN','fr','Minute','seed'),
  ('uom','HUR','fr','Heure','seed'),
  ('uom','DAY','fr','Jour','seed'),
  ('uom','WEE','fr','Semaine','seed'),
  ('uom','MON','fr','Mois','seed'),
  ('uom','ANN','fr','Année','seed'),
  ('uom','CEL','fr','Degré Celsius','seed'),
  ('uom','FAH','fr','Degré Fahrenheit','seed'),
  ('uom','KWH','fr','Kilowatt-heure','seed'),
  ('uom','WTT','fr','Watt','seed'),
  ('uom','KWT','fr','Kilowatt','seed')
on conflict (entity, code, locale_code) do nothing;

-- ============================================================================
-- Saudi & UAE Regions
-- ============================================================================
insert into ref.label (entity, code, locale_code, name, created_by)
values
  ('state_region','SA-01','fr','Région de Riyad','seed'),
  ('state_region','SA-02','fr','Région de La Mecque','seed'),
  ('state_region','SA-03','fr','Région de Médine','seed'),
  ('state_region','SA-04','fr','Région orientale','seed'),
  ('state_region','SA-05','fr','Région d''Al-Qassim','seed'),
  ('state_region','SA-06','fr','Région de Ha''il','seed'),
  ('state_region','SA-07','fr','Région de Tabuk','seed'),
  ('state_region','SA-08','fr','Région des frontières du Nord','seed'),
  ('state_region','SA-09','fr','Région de Jizan','seed'),
  ('state_region','SA-10','fr','Région de Najran','seed'),
  ('state_region','SA-11','fr','Région d''Al Bahah','seed'),
  ('state_region','SA-12','fr','Région d''Al Jawf','seed'),
  ('state_region','SA-14','fr','Région d''Asir','seed'),
  ('state_region','AE-AZ','fr','Abou Dabi','seed'),
  ('state_region','AE-DU','fr','Dubaï','seed'),
  ('state_region','AE-SH','fr','Charjah','seed'),
  ('state_region','AE-AJ','fr','Ajman','seed'),
  ('state_region','AE-UQ','fr','Oumm al Qaïwaïn','seed'),
  ('state_region','AE-RK','fr','Ras el Khaïmah','seed'),
  ('state_region','AE-FU','fr','Fujaïrah','seed')
on conflict (entity, code, locale_code) do nothing;

-- ============================================================================
-- §16  i18n: German Labels
-- ============================================================================

/* ============================================================================
   Athyper — REF Seed: German (Deutsch) Labels (i18n)
   PostgreSQL 16+

   German translations for key reference data entities.
   Depends on: 010_ref_master_tables.sql, 050_ref_seed_locales.sql
   ============================================================================ */

-- ============================================================================
-- Countries — GCC + MENA + Major World
-- ============================================================================
insert into ref.label (entity, code, locale_code, name, created_by)
values
  -- GCC
  ('country','SA','de','Saudi-Arabien','seed'),
  ('country','AE','de','Vereinigte Arabische Emirate','seed'),
  ('country','BH','de','Bahrain','seed'),
  ('country','KW','de','Kuwait','seed'),
  ('country','OM','de','Oman','seed'),
  ('country','QA','de','Katar','seed'),

  -- MENA
  ('country','EG','de','Ägypten','seed'),
  ('country','JO','de','Jordanien','seed'),
  ('country','LB','de','Libanon','seed'),
  ('country','IQ','de','Irak','seed'),
  ('country','SY','de','Syrien','seed'),
  ('country','YE','de','Jemen','seed'),
  ('country','PS','de','Palästina','seed'),
  ('country','SD','de','Sudan','seed'),
  ('country','LY','de','Libyen','seed'),
  ('country','TN','de','Tunesien','seed'),
  ('country','DZ','de','Algerien','seed'),
  ('country','MA','de','Marokko','seed'),
  ('country','IR','de','Iran','seed'),
  ('country','TR','de','Türkei','seed'),
  ('country','IL','de','Israel','seed'),

  -- Major World
  ('country','US','de','Vereinigte Staaten','seed'),
  ('country','GB','de','Vereinigtes Königreich','seed'),
  ('country','FR','de','Frankreich','seed'),
  ('country','DE','de','Deutschland','seed'),
  ('country','IT','de','Italien','seed'),
  ('country','ES','de','Spanien','seed'),
  ('country','PT','de','Portugal','seed'),
  ('country','NL','de','Niederlande','seed'),
  ('country','BE','de','Belgien','seed'),
  ('country','CH','de','Schweiz','seed'),
  ('country','AT','de','Österreich','seed'),
  ('country','SE','de','Schweden','seed'),
  ('country','NO','de','Norwegen','seed'),
  ('country','DK','de','Dänemark','seed'),
  ('country','FI','de','Finnland','seed'),
  ('country','PL','de','Polen','seed'),
  ('country','GR','de','Griechenland','seed'),
  ('country','RU','de','Russland','seed'),
  ('country','UA','de','Ukraine','seed'),
  ('country','CN','de','China','seed'),
  ('country','JP','de','Japan','seed'),
  ('country','KR','de','Südkorea','seed'),
  ('country','IN','de','Indien','seed'),
  ('country','PK','de','Pakistan','seed'),
  ('country','BD','de','Bangladesch','seed'),
  ('country','ID','de','Indonesien','seed'),
  ('country','MY','de','Malaysia','seed'),
  ('country','SG','de','Singapur','seed'),
  ('country','TH','de','Thailand','seed'),
  ('country','VN','de','Vietnam','seed'),
  ('country','PH','de','Philippinen','seed'),
  ('country','AU','de','Australien','seed'),
  ('country','NZ','de','Neuseeland','seed'),
  ('country','CA','de','Kanada','seed'),
  ('country','MX','de','Mexiko','seed'),
  ('country','BR','de','Brasilien','seed'),
  ('country','AR','de','Argentinien','seed'),
  ('country','CL','de','Chile','seed'),
  ('country','CO','de','Kolumbien','seed'),
  ('country','ZA','de','Südafrika','seed'),
  ('country','NG','de','Nigeria','seed'),
  ('country','KE','de','Kenia','seed'),
  ('country','ET','de','Äthiopien','seed'),
  ('country','HK','de','Hongkong','seed'),
  ('country','TW','de','Taiwan','seed'),
  ('country','AF','de','Afghanistan','seed'),
  ('country','LK','de','Sri Lanka','seed'),
  ('country','NP','de','Nepal','seed'),
  ('country','MM','de','Myanmar','seed'),
  ('country','KH','de','Kambodscha','seed'),
  ('country','IE','de','Irland','seed'),
  ('country','LI','de','Liechtenstein','seed'),
  ('country','LU','de','Luxemburg','seed')
on conflict (entity, code, locale_code) do nothing;

-- ============================================================================
-- Currencies — GCC + Major
-- ============================================================================
insert into ref.label (entity, code, locale_code, name, created_by)
values
  ('currency','SAR','de','Saudi-Riyal','seed'),
  ('currency','AED','de','VAE-Dirham','seed'),
  ('currency','BHD','de','Bahrain-Dinar','seed'),
  ('currency','KWD','de','Kuwait-Dinar','seed'),
  ('currency','OMR','de','Omanischer Rial','seed'),
  ('currency','QAR','de','Katar-Riyal','seed'),
  ('currency','EGP','de','Ägyptisches Pfund','seed'),
  ('currency','JOD','de','Jordanischer Dinar','seed'),
  ('currency','IQD','de','Irakischer Dinar','seed'),
  ('currency','LBP','de','Libanesisches Pfund','seed'),
  ('currency','TRY','de','Türkische Lira','seed'),
  ('currency','MAD','de','Marokkanischer Dirham','seed'),
  ('currency','USD','de','US-Dollar','seed'),
  ('currency','EUR','de','Euro','seed'),
  ('currency','GBP','de','Pfund Sterling','seed'),
  ('currency','JPY','de','Japanischer Yen','seed'),
  ('currency','CNY','de','Renminbi Yuan','seed'),
  ('currency','CHF','de','Schweizer Franken','seed'),
  ('currency','CAD','de','Kanadischer Dollar','seed'),
  ('currency','AUD','de','Australischer Dollar','seed'),
  ('currency','INR','de','Indische Rupie','seed'),
  ('currency','PKR','de','Pakistanische Rupie','seed'),
  ('currency','BRL','de','Brasilianischer Real','seed'),
  ('currency','MXN','de','Mexikanischer Peso','seed'),
  ('currency','KRW','de','Südkoreanischer Won','seed'),
  ('currency','SGD','de','Singapur-Dollar','seed'),
  ('currency','HKD','de','Hongkong-Dollar','seed'),
  ('currency','MYR','de','Malaysischer Ringgit','seed'),
  ('currency','IDR','de','Indonesische Rupiah','seed'),
  ('currency','THB','de','Thailändischer Baht','seed'),
  ('currency','NZD','de','Neuseeland-Dollar','seed'),
  ('currency','ZAR','de','Südafrikanischer Rand','seed'),
  ('currency','RUB','de','Russischer Rubel','seed'),
  ('currency','SEK','de','Schwedische Krone','seed'),
  ('currency','NOK','de','Norwegische Krone','seed'),
  ('currency','DKK','de','Dänische Krone','seed'),
  ('currency','PLN','de','Polnischer Zloty','seed'),
  ('currency','CZK','de','Tschechische Krone','seed'),
  ('currency','HUF','de','Ungarischer Forint','seed'),
  ('currency','XAU','de','Gold (Feinunze)','seed'),
  ('currency','XAG','de','Silber (Feinunze)','seed')
on conflict (entity, code, locale_code) do nothing;

-- ============================================================================
-- Languages — Major
-- ============================================================================
insert into ref.label (entity, code, locale_code, name, created_by)
values
  ('language','de','de','Deutsch','seed'),
  ('language','en','de','Englisch','seed'),
  ('language','ar','de','Arabisch','seed'),
  ('language','fr','de','Französisch','seed'),
  ('language','es','de','Spanisch','seed'),
  ('language','pt','de','Portugiesisch','seed'),
  ('language','it','de','Italienisch','seed'),
  ('language','nl','de','Niederländisch','seed'),
  ('language','ru','de','Russisch','seed'),
  ('language','zh','de','Chinesisch','seed'),
  ('language','ja','de','Japanisch','seed'),
  ('language','ko','de','Koreanisch','seed'),
  ('language','hi','de','Hindi','seed'),
  ('language','bn','de','Bengalisch','seed'),
  ('language','ur','de','Urdu','seed'),
  ('language','fa','de','Persisch','seed'),
  ('language','tr','de','Türkisch','seed'),
  ('language','ta','de','Tamil','seed'),
  ('language','te','de','Telugu','seed'),
  ('language','ml','de','Malayalam','seed'),
  ('language','ms','de','Malaiisch','seed'),
  ('language','id','de','Indonesisch','seed'),
  ('language','th','de','Thailändisch','seed'),
  ('language','vi','de','Vietnamesisch','seed'),
  ('language','pl','de','Polnisch','seed'),
  ('language','uk','de','Ukrainisch','seed'),
  ('language','sv','de','Schwedisch','seed'),
  ('language','da','de','Dänisch','seed'),
  ('language','no','de','Norwegisch','seed'),
  ('language','fi','de','Finnisch','seed'),
  ('language','el','de','Griechisch','seed'),
  ('language','he','de','Hebräisch','seed'),
  ('language','sw','de','Suaheli','seed'),
  ('language','cs','de','Tschechisch','seed'),
  ('language','hu','de','Ungarisch','seed'),
  ('language','ro','de','Rumänisch','seed')
on conflict (entity, code, locale_code) do nothing;

-- ============================================================================
-- UOM — Core units
-- ============================================================================
insert into ref.label (entity, code, locale_code, name, created_by)
values
  ('uom','EA','de','Stück','seed'),
  ('uom','C62','de','Eins','seed'),
  ('uom','PR','de','Paar','seed'),
  ('uom','DZN','de','Dutzend','seed'),
  ('uom','SET','de','Satz','seed'),
  ('uom','PK','de','Packung','seed'),
  ('uom','BX','de','Karton','seed'),
  ('uom','CT','de','Kartonage','seed'),
  ('uom','PL','de','Palette','seed'),
  ('uom','MGM','de','Milligramm','seed'),
  ('uom','GRM','de','Gramm','seed'),
  ('uom','KGM','de','Kilogramm','seed'),
  ('uom','TNE','de','Metrische Tonne','seed'),
  ('uom','LBR','de','Pfund','seed'),
  ('uom','ONZ','de','Unze','seed'),
  ('uom','MMT','de','Millimeter','seed'),
  ('uom','CMT','de','Zentimeter','seed'),
  ('uom','MTR','de','Meter','seed'),
  ('uom','KMT','de','Kilometer','seed'),
  ('uom','INH','de','Zoll','seed'),
  ('uom','FOT','de','Fuß','seed'),
  ('uom','YRD','de','Yard','seed'),
  ('uom','SMI','de','Meile','seed'),
  ('uom','MTK','de','Quadratmeter','seed'),
  ('uom','KMK','de','Quadratkilometer','seed'),
  ('uom','HAR','de','Hektar','seed'),
  ('uom','ACR','de','Morgen','seed'),
  ('uom','MLT','de','Milliliter','seed'),
  ('uom','LTR','de','Liter','seed'),
  ('uom','MTQ','de','Kubikmeter','seed'),
  ('uom','GLL','de','Gallone','seed'),
  ('uom','BLL','de','Barrel','seed'),
  ('uom','SEC','de','Sekunde','seed'),
  ('uom','MIN','de','Minute','seed'),
  ('uom','HUR','de','Stunde','seed'),
  ('uom','DAY','de','Tag','seed'),
  ('uom','WEE','de','Woche','seed'),
  ('uom','MON','de','Monat','seed'),
  ('uom','ANN','de','Jahr','seed'),
  ('uom','CEL','de','Grad Celsius','seed'),
  ('uom','FAH','de','Grad Fahrenheit','seed'),
  ('uom','KWH','de','Kilowattstunde','seed'),
  ('uom','WTT','de','Watt','seed'),
  ('uom','KWT','de','Kilowatt','seed')
on conflict (entity, code, locale_code) do nothing;

-- ============================================================================
-- Saudi & UAE Regions
-- ============================================================================
insert into ref.label (entity, code, locale_code, name, created_by)
values
  ('state_region','SA-01','de','Region Riad','seed'),
  ('state_region','SA-02','de','Region Mekka','seed'),
  ('state_region','SA-03','de','Region Medina','seed'),
  ('state_region','SA-04','de','Östliche Region','seed'),
  ('state_region','SA-05','de','Region al-Qasim','seed'),
  ('state_region','SA-06','de','Region Ha''il','seed'),
  ('state_region','SA-07','de','Region Tabuk','seed'),
  ('state_region','SA-08','de','Region Nordgrenze','seed'),
  ('state_region','SA-09','de','Region Dschasan','seed'),
  ('state_region','SA-10','de','Region Nadschran','seed'),
  ('state_region','SA-11','de','Region al-Baha','seed'),
  ('state_region','SA-12','de','Region al-Dschauf','seed'),
  ('state_region','SA-14','de','Region Asir','seed'),
  ('state_region','AE-AZ','de','Abu Dhabi','seed'),
  ('state_region','AE-DU','de','Dubai','seed'),
  ('state_region','AE-SH','de','Schardscha','seed'),
  ('state_region','AE-AJ','de','Adschman','seed'),
  ('state_region','AE-UQ','de','Umm al-Qaiwain','seed'),
  ('state_region','AE-RK','de','Ra''s al-Chaima','seed'),
  ('state_region','AE-FU','de','Fudschaira','seed')
on conflict (entity, code, locale_code) do nothing;


-- ============================================================================
-- §17  Operation Categories + Operations
-- ============================================================================

-- Operation Categories
insert into core.operation_category (code, name, description, sort_order) values
  ('entity',        'Entity Operations',        'CRUD operations on entities',          1),
  ('workflow',       'Workflow Operations',       'State transitions and approvals',      2),
  ('utilities',      'Utility Operations',        'Copy, merge, import/export',           3),
  ('delegation',     'Delegation Operations',     'Sharing and delegation',               4),
  ('collaboration',  'Collaboration Operations',  'Comments, attachments, following',      5)
on conflict (code) do nothing;

-- Entity Operations
insert into core.operation (category_id, code, name, description, requires_record, requires_ownership, sort_order)
select c.id, o.code, o.name, o.description, o.requires_record, o.requires_ownership, o.sort_order
from core.operation_category c
cross join (values
  ('read',         'Read',         'View entity records',    true,  false, 1),
  ('create',       'Create',       'Create new records',     false, false, 2),
  ('update',       'Update',       'Update existing records', true,  false, 3),
  ('delete_draft', 'Delete Draft', 'Delete draft records',   true,  true,  4),
  ('delete',       'Delete',       'Delete any records',     true,  false, 5)
) as o(code, name, description, requires_record, requires_ownership, sort_order)
where c.code = 'entity'
on conflict (category_id, code) do nothing;

-- Workflow Operations
insert into core.operation (category_id, code, name, description, requires_record, requires_ownership, sort_order)
select c.id, o.code, o.name, o.description, o.requires_record, o.requires_ownership, o.sort_order
from core.operation_category c
cross join (values
  ('submit',   'Submit',   'Submit for approval',          true, true,  1),
  ('amend',    'Amend',    'Amend submitted record',       true, true,  2),
  ('cancel',   'Cancel',   'Cancel record',                true, true,  3),
  ('close',    'Close',    'Close record',                 true, false, 4),
  ('reopen',   'Reopen',   'Reopen closed record',         true, false, 5),
  ('withdraw', 'Withdraw', 'Withdraw submission',          true, true,  6),
  ('escalate', 'Escalate', 'Escalate to higher authority', true, false, 7),
  ('approve',    'Approve',    'Approve record',               true, false, 8),
  ('deny',       'Deny',       'Deny/reject record',           true, false, 9),
  ('post',       'Post',       'Post financial document',      true, false, 10),
  ('reverse',    'Reverse',    'Reverse posted document',      true, false, 11),
  ('reconcile',  'Reconcile',  'Reconcile against statement',  true, false, 12)
) as o(code, name, description, requires_record, requires_ownership, sort_order)
where c.code = 'workflow'
on conflict (category_id, code) do nothing;

-- Utility Operations
insert into core.operation (category_id, code, name, description, requires_record, requires_ownership, sort_order)
select c.id, o.code, o.name, o.description, o.requires_record, o.requires_ownership, o.sort_order
from core.operation_category c
cross join (values
  ('copy',        'Copy',        'Copy record',         true,  false, 1),
  ('merge',       'Merge',       'Merge records',       true,  false, 2),
  ('report',      'Report',      'Generate reports',    false, false, 3),
  ('print',       'Print',       'Print records',       true,  false, 4),
  ('import',      'Import',      'Import data',         false, false, 5),
  ('export',      'Export',      'Export data',          false, false, 6),
  ('bulk_import', 'Bulk Import', 'Bulk import data',    false, false, 7),
  ('bulk_export', 'Bulk Export', 'Bulk export data',    false, false, 8),
  ('bulk_update', 'Bulk Update', 'Bulk update records', false, false, 9),
  ('bulk_delete', 'Bulk Delete', 'Bulk delete records', false, false, 10)
) as o(code, name, description, requires_record, requires_ownership, sort_order)
where c.code = 'utilities'
on conflict (category_id, code) do nothing;

-- Delegation Operations
insert into core.operation (category_id, code, name, description, requires_record, requires_ownership, sort_order)
select c.id, o.code, o.name, o.description, o.requires_record, o.requires_ownership, o.sort_order
from core.operation_category c
cross join (values
  ('delegate',       'Delegate',        'Delegate task to another user',       true, false, 1),
  ('share_readonly', 'Share Read-only', 'Share record with read-only access',  true, false, 2),
  ('share_editable', 'Share Editable',  'Share record with edit access',       true, false, 3)
) as o(code, name, description, requires_record, requires_ownership, sort_order)
where c.code = 'delegation'
on conflict (category_id, code) do nothing;

-- Collaboration Operations
insert into core.operation (category_id, code, name, description, requires_record, requires_ownership, sort_order)
select c.id, o.code, o.name, o.description, o.requires_record, o.requires_ownership, o.sort_order
from core.operation_category c
cross join (values
  ('comment_add',             'Add Comment',              'Add comment to record',         true, false, 1),
  ('attachment_add',          'Add Attachment',           'Add attachment to record',       true, false, 2),
  ('comment_delete_other',    'Delete Other Comments',    'Delete comments by others',     true, false, 3),
  ('attachment_delete_other', 'Delete Other Attachments', 'Delete attachments by others',  true, false, 4),
  ('follow',                  'Follow',                   'Follow record for updates',     true, false, 5),
  ('tag',                     'Tag',                      'Add tags to record',            true, false, 6)
) as o(code, name, description, requires_record, requires_ownership, sort_order)
where c.code = 'collaboration'
on conflict (category_id, code) do nothing;

-- ============================================================================
-- §18  Personas + Capability Matrix
-- ============================================================================

insert into core.persona (code, name, description, scope_mode, priority, is_system) values
  ('viewer',       'Viewer',       'Read-only access to records',          'tenant', 10,  true),
  ('reporter',     'Reporter',     'Viewer plus reporting capabilities',   'tenant', 20,  true),
  ('requester',    'Requester',    'Can create and manage own requests',   'tenant', 30,  true),
  ('agent',        'Agent',        'Process requests within assigned OU',  'ou',     40,  true),
  ('manager',      'Manager',      'Manage and approve within OU scope',   'ou',     50,  true),
  ('moduleAdmin',  'Module Admin', 'Administer module entities',           'module', 60,  true),
  ('tenantAdmin',  'Tenant Admin', 'Full tenant administration',           'tenant', 100, true)
on conflict (code) do nothing;

-- ----------------------------------------------------------------------------
-- Helper function for granting capabilities
-- ----------------------------------------------------------------------------
create or replace function core._seed_grant_capability(
  p_persona_code text,
  p_operation_code text,
  p_constraint_type text default 'none'
) returns void as $$
begin
  insert into core.persona_capability (persona_id, operation_id, is_granted, constraint_type)
  select p.id, o.id, true, p_constraint_type
  from core.persona p, core.operation o
  where p.code = p_persona_code and o.code = p_operation_code
  on conflict (persona_id, operation_id) do update set
    is_granted = true,
    constraint_type = p_constraint_type,
    updated_at = now();
end;
$$ language plpgsql;

-- ============================================================================
-- VIEWER capabilities
-- ============================================================================
select core._seed_grant_capability('viewer', 'read');
select core._seed_grant_capability('viewer', 'approve');
select core._seed_grant_capability('viewer', 'deny');
select core._seed_grant_capability('viewer', 'follow');
select core._seed_grant_capability('viewer', 'tag');

-- ============================================================================
-- REPORTER capabilities (viewer + reporting)
-- ============================================================================
select core._seed_grant_capability('reporter', 'read');
select core._seed_grant_capability('reporter', 'approve');
select core._seed_grant_capability('reporter', 'deny');
select core._seed_grant_capability('reporter', 'report');
select core._seed_grant_capability('reporter', 'print');
select core._seed_grant_capability('reporter', 'export');
select core._seed_grant_capability('reporter', 'follow');
select core._seed_grant_capability('reporter', 'tag');

-- ============================================================================
-- REQUESTER capabilities (create and manage own)
-- ============================================================================
select core._seed_grant_capability('requester', 'read');
select core._seed_grant_capability('requester', 'create');
select core._seed_grant_capability('requester', 'update',       'own');
select core._seed_grant_capability('requester', 'delete_draft', 'own');
select core._seed_grant_capability('requester', 'submit',       'own');
select core._seed_grant_capability('requester', 'amend',        'own');
select core._seed_grant_capability('requester', 'cancel',       'own');
select core._seed_grant_capability('requester', 'withdraw',     'own');
select core._seed_grant_capability('requester', 'escalate');
select core._seed_grant_capability('requester', 'copy');
select core._seed_grant_capability('requester', 'report');
select core._seed_grant_capability('requester', 'print');
select core._seed_grant_capability('requester', 'export');
select core._seed_grant_capability('requester', 'delegate');
select core._seed_grant_capability('requester', 'share_readonly');
select core._seed_grant_capability('requester', 'comment_add');
select core._seed_grant_capability('requester', 'attachment_add');
select core._seed_grant_capability('requester', 'follow');
select core._seed_grant_capability('requester', 'tag');

-- ============================================================================
-- AGENT capabilities (process within OU)
-- ============================================================================
select core._seed_grant_capability('agent', 'read',         'ou');
select core._seed_grant_capability('agent', 'create');
select core._seed_grant_capability('agent', 'update',       'ou');
select core._seed_grant_capability('agent', 'delete_draft', 'own');
select core._seed_grant_capability('agent', 'submit',       'own');
select core._seed_grant_capability('agent', 'amend',        'own');
select core._seed_grant_capability('agent', 'cancel',       'own');
select core._seed_grant_capability('agent', 'withdraw',     'own');
select core._seed_grant_capability('agent', 'escalate');
select core._seed_grant_capability('agent', 'approve',      'ou');
select core._seed_grant_capability('agent', 'deny',         'ou');
select core._seed_grant_capability('agent', 'post',         'own');
select core._seed_grant_capability('agent', 'reconcile',    'ou');
select core._seed_grant_capability('agent', 'copy');
select core._seed_grant_capability('agent', 'report');
select core._seed_grant_capability('agent', 'print');
select core._seed_grant_capability('agent', 'import');
select core._seed_grant_capability('agent', 'export');
select core._seed_grant_capability('agent', 'delegate');
select core._seed_grant_capability('agent', 'share_readonly');
select core._seed_grant_capability('agent', 'comment_add');
select core._seed_grant_capability('agent', 'attachment_add');
select core._seed_grant_capability('agent', 'follow');
select core._seed_grant_capability('agent', 'tag');

-- ============================================================================
-- MANAGER capabilities (manage and approve within OU)
-- ============================================================================
select core._seed_grant_capability('manager', 'read',                    'ou');
select core._seed_grant_capability('manager', 'close',                   'ou');
select core._seed_grant_capability('manager', 'reopen',                  'ou');
select core._seed_grant_capability('manager', 'escalate');
select core._seed_grant_capability('manager', 'approve',                 'ou');
select core._seed_grant_capability('manager', 'deny',                    'ou');
select core._seed_grant_capability('manager', 'post',                    'ou');
select core._seed_grant_capability('manager', 'reverse',                 'ou');
select core._seed_grant_capability('manager', 'reconcile',              'ou');
select core._seed_grant_capability('manager', 'report');
select core._seed_grant_capability('manager', 'print');
select core._seed_grant_capability('manager', 'export');
select core._seed_grant_capability('manager', 'delegate');
select core._seed_grant_capability('manager', 'share_readonly');
select core._seed_grant_capability('manager', 'share_editable');
select core._seed_grant_capability('manager', 'comment_add');
select core._seed_grant_capability('manager', 'attachment_add');
select core._seed_grant_capability('manager', 'comment_delete_other');
select core._seed_grant_capability('manager', 'attachment_delete_other');
select core._seed_grant_capability('manager', 'follow');
select core._seed_grant_capability('manager', 'tag');

-- ============================================================================
-- MODULE_ADMIN capabilities (module-scoped administration)
-- ============================================================================
select core._seed_grant_capability('moduleAdmin', 'read',                    'module');
select core._seed_grant_capability('moduleAdmin', 'delete',                  'module');
select core._seed_grant_capability('moduleAdmin', 'post',                    'module');
select core._seed_grant_capability('moduleAdmin', 'reverse',                 'module');
select core._seed_grant_capability('moduleAdmin', 'reconcile',              'module');
select core._seed_grant_capability('moduleAdmin', 'merge',                   'module');
select core._seed_grant_capability('moduleAdmin', 'report');
select core._seed_grant_capability('moduleAdmin', 'print');
select core._seed_grant_capability('moduleAdmin', 'import',                  'module');
select core._seed_grant_capability('moduleAdmin', 'export');
select core._seed_grant_capability('moduleAdmin', 'bulk_import',             'module');
select core._seed_grant_capability('moduleAdmin', 'bulk_export',             'module');
select core._seed_grant_capability('moduleAdmin', 'bulk_update',             'module');
select core._seed_grant_capability('moduleAdmin', 'bulk_delete',             'module');
select core._seed_grant_capability('moduleAdmin', 'delegate');
select core._seed_grant_capability('moduleAdmin', 'share_readonly');
select core._seed_grant_capability('moduleAdmin', 'share_editable');
select core._seed_grant_capability('moduleAdmin', 'comment_add');
select core._seed_grant_capability('moduleAdmin', 'attachment_add');
select core._seed_grant_capability('moduleAdmin', 'comment_delete_other');
select core._seed_grant_capability('moduleAdmin', 'attachment_delete_other');
select core._seed_grant_capability('moduleAdmin', 'follow');
select core._seed_grant_capability('moduleAdmin', 'tag');

-- ============================================================================
-- TENANT_ADMIN capabilities (full access, no constraints)
-- ============================================================================
select core._seed_grant_capability('tenantAdmin', 'read');
select core._seed_grant_capability('tenantAdmin', 'delete');
select core._seed_grant_capability('tenantAdmin', 'post');
select core._seed_grant_capability('tenantAdmin', 'reverse');
select core._seed_grant_capability('tenantAdmin', 'reconcile');
select core._seed_grant_capability('tenantAdmin', 'merge');
select core._seed_grant_capability('tenantAdmin', 'report');
select core._seed_grant_capability('tenantAdmin', 'print');
select core._seed_grant_capability('tenantAdmin', 'import');
select core._seed_grant_capability('tenantAdmin', 'export');
select core._seed_grant_capability('tenantAdmin', 'bulk_import');
select core._seed_grant_capability('tenantAdmin', 'bulk_export');
select core._seed_grant_capability('tenantAdmin', 'bulk_update');
select core._seed_grant_capability('tenantAdmin', 'bulk_delete');
select core._seed_grant_capability('tenantAdmin', 'delegate');
select core._seed_grant_capability('tenantAdmin', 'share_readonly');
select core._seed_grant_capability('tenantAdmin', 'share_editable');
select core._seed_grant_capability('tenantAdmin', 'comment_add');
select core._seed_grant_capability('tenantAdmin', 'attachment_add');
select core._seed_grant_capability('tenantAdmin', 'comment_delete_other');
select core._seed_grant_capability('tenantAdmin', 'attachment_delete_other');
select core._seed_grant_capability('tenantAdmin', 'follow');
select core._seed_grant_capability('tenantAdmin', 'tag');

-- ----------------------------------------------------------------------------
-- Drop helper function (cleanup)
-- ----------------------------------------------------------------------------
drop function if exists core._seed_grant_capability(text, text, text);

-- ============================================================================
-- §19  Core Modules
-- ============================================================================

insert into core.module (code, name, description, config) values
  -- Platform modules
  ('FND',       'Foundation Runtime',               'Meta-driven runtime engine',                                                                    '{"tier":"Platform"}'::jsonb),
  ('META',      'Metadata Studio',                  'Declarative configuration',                                                                     '{"tier":"Platform"}'::jsonb),
  ('IAM',       'Identity & Access Management',     'Authentication and authorization',                                                              '{"tier":"Platform"}'::jsonb),
  ('AUD',       'Audit & Governance',               'Audit trails and compliance',                                                                   '{"tier":"Platform"}'::jsonb),
  ('POL',       'Policy & Rules Engine',            'Business rules and validations',                                                                '{"tier":"Platform"}'::jsonb),
  ('WFL',       'Workflow Engine',                  'State machines and approvals',                                                                   '{"tier":"Platform"}'::jsonb),
  ('JOB',       'Automation & Jobs',                'Schedulers and background tasks',                                                               '{"tier":"Platform"}'::jsonb),
  ('DOC',       'Document Services',                'PDF/HTML generation',                                                                           '{"tier":"Platform"}'::jsonb),
  ('NTF',       'Notification Services',            'Email and alerts',                                                                              '{"tier":"Platform"}'::jsonb),
  ('INT',       'Integration Hub',                  'API gateway and webhooks',                                                                      '{"tier":"Platform"}'::jsonb),
  ('CMS',       'Content Services',                 'Document storage',                                                                              '{"tier":"Platform"}'::jsonb),
  ('ACT',       'Activity & Commentary',            'Comments and timelines',                                                                        '{"tier":"Platform"}'::jsonb),
  ('REL',       'Relationship Management',          'Address book',                                                                                  '{"tier":"Platform"}'::jsonb),

  -- Finance modules
  ('ACC',       'Finance (Core Accounting)',         'General Ledger, AP, AR, fiscal controls',                                                       '{"tier":"Base","dependencies":["CORE"]}'::jsonb),
  ('PAY',       'Payment Processing',               'Collections, disbursements, reconciliation',                                                    '{"tier":"Base","dependencies":["ACC"]}'::jsonb),
  ('TREASURY',  'Treasury & Cash Management',       'Cash positioning, bank accounts, liquidity, FX exposure, bank reconciliation, funding',          '{"tier":"Base","dependencies":["ACC","PAY"]}'::jsonb),
  ('BUDGET',    'Budget & Funds Control',           'Budget planning, allocation, commitment control, availability checks, and budget consumption tracking', '{"tier":"Enterprise","dependencies":["ACC","WFL","MDG"]}'::jsonb),
  ('PAYG',      'Payment Gateways',                 'External payment providers (Stripe, etc.)',                                                     '{"tier":"Professional","dependencies":["PAY"]}'::jsonb),

  -- Customer Experience modules
  ('CRM',       'Customer Relationship Management', 'Leads, opportunities, pipeline management',                                                     '{"tier":"Base","dependencies":["REL"]}'::jsonb),
  ('SALE',      'Selling',                          'Sales cycle, orders, invoicing',                                                                '{"tier":"Base","dependencies":["CORE","REL"]}'::jsonb),

  -- Supply Chain modules
  ('SRM',       'Supplier Relationship Management', 'Supplier Lifecycle and Performance Management',                                                 '{"tier":"Base","dependencies":["REL","WFL","AUD"]}'::jsonb),
  ('SOURCE',    'Sourcing Management',              'RFQs, bids, vendor selection',                                                                  '{"tier":"Base","dependencies":["REL","WFL","DOC","NTF"]}'::jsonb),
  ('CONTRACT',  'Contract Management',              'Commercial contracts, terms, obligations',                                                      '{"tier":"Base","dependencies":["REL","WFL","DOC","NTF"]}'::jsonb),
  ('BUY',       'Buying',                           'Purchasing, requisitions, POs',                                                                 '{"tier":"Base","dependencies":["CORE","REL"]}'::jsonb),
  ('INVENTORY', 'Inventory Management',             'Inventory, valuation, movements',                                                               '{"tier":"Base","dependencies":["CORE","REL","ACC"]}'::jsonb),
  ('QMS',       'Quality Management',               'Inspections, QC processes',                                                                     '{"tier":"Base","dependencies":["INVENTORY"]}'::jsonb),
  ('SUBCON',    'Subcontracting',                   'Job subcontract workflows',                                                                     '{"tier":"Base","dependencies":["BUY","INVENTORY"]}'::jsonb),
  ('DEMAND',    'Demand Forecast & Planning',       'Statistical & AI-based demand forecasting, planning scenarios',                                  '{"tier":"Enterprise","dependencies":["INVENTORY","SALE","AI"]}'::jsonb),
  ('WMS',       'Warehouse Management',             'Bin management, putaway, picking, packing, cycle counting, barcode/RFID',                       '{"tier":"Enterprise","dependencies":["INVENTORY"]}'::jsonb),
  ('LOGISTICS', 'Transportation & Logistics',       'Shipment planning, carriers, freight costs, delivery tracking',                                  '{"tier":"Enterprise","dependencies":["WMS","INVENTORY"]}'::jsonb),

  -- Manufacturing & Operations modules
  ('MAINT',     'Maintenance Management',           'Preventive & corrective maintenance',                                                           '{"tier":"Base","dependencies":["BUY","ASSET","INVENTORY"]}'::jsonb),
  ('MFG',       'Manufacturing',                    'BOMs, work orders, MRP',                                                                        '{"tier":"Base","dependencies":["INVENTORY","MDG"]}'::jsonb),

  -- Asset Management modules
  ('ASSET',     'Asset Management',                 'Asset lifecycle, depreciation',                                                                  '{"tier":"Enterprise","dependencies":["CORE","ACC","MDG","AUD"]}'::jsonb),
  ('ASSETREMS', 'Real Estate Asset Management',     'Property, lease, tenancy, rental billing, CAM charges, asset depreciation',                      '{"tier":"Enterprise","dependencies":["ASSET","ACC","CONTRACT"]}'::jsonb),
  ('ASSETFM',   'Facility Management',              'Buildings, utilities, space, maintenance cost centers',                                          '{"tier":"Base","dependencies":["ASSET","MAINT"]}'::jsonb),

  -- People Management modules
  ('HR',        'Human Resources',                  'Employee lifecycle, organization structure',                                                     '{"tier":"Base","dependencies":["CORE","REL"]}'::jsonb),
  ('PAYROLL',   'Payroll',                           'Salaries, statutory compliance',                                                                '{"tier":"Base","dependencies":["HR","ACC","REG"]}'::jsonb),

  -- Project & Service modules
  ('PRJCOST',   'Project Management',               'Project, Task, Project budgets, WBS, cost tracking, revenue recognition',                       '{"tier":"Base","dependencies":["ACC","BUDGET"]}'::jsonb),
  ('ITSM',      'Support & Service Management',     'Tickets, SLAs, service workflows',                                                             '{"tier":"Base","dependencies":["CORE","WFL","ASSET","NTF","AUD"]}'::jsonb)
on conflict (code) do nothing;

-- ============================================================================
-- §20  Workspaces + Module Linkage
-- ============================================================================

insert into core.workspace (code, name, description, sort_order) values
  ('FIN', 'Finance',                    'Financial accounting, payments, treasury, and budgeting',   10),
  ('SCM', 'Supply Chain',               'Procurement, inventory, warehousing, and logistics',        20),
  ('CXP', 'Customer Experience',        'Sales, sourcing, contracts, and commercial operations',     30),
  ('PPL', 'People Management',          'Human resources and payroll',                               40),
  ('PMO', 'Project Management',         'Projects, tasks, and service management',                   50),
  ('MFO', 'Manufacturing & Operations', 'Manufacturing, maintenance, and production operations',     60),
  ('ASM', 'Asset Management',           'Fixed assets, real estate, and facility management',        70)
on conflict (code) do nothing;

-- ----------------------------------------------------------------------------
-- Link Modules → Workspaces
-- Platform modules (FND, META, IAM, etc.) intentionally have no workspace.
-- ----------------------------------------------------------------------------

-- Finance workspace
update core.module set workspace_id = (select id from core.workspace where code = 'FIN')
where code in ('ACC', 'PAY', 'TREASURY', 'BUDGET', 'PAYG')
  and workspace_id is null;

-- Customer Experience workspace
update core.module set workspace_id = (select id from core.workspace where code = 'CXP')
where code in ('CRM', 'SALE')
  and workspace_id is null;

-- Supply Chain workspace
update core.module set workspace_id = (select id from core.workspace where code = 'SCM')
where code in ('SRM', 'SOURCE', 'CONTRACT', 'BUY', 'INVENTORY', 'QMS', 'SUBCON', 'DEMAND', 'WMS', 'LOGISTICS')
  and workspace_id is null;

-- People Management workspace
update core.module set workspace_id = (select id from core.workspace where code = 'PPL')
where code in ('HR', 'PAYROLL')
  and workspace_id is null;

-- Project Management workspace
update core.module set workspace_id = (select id from core.workspace where code = 'PMO')
where code in ('PRJCOST', 'ITSM')
  and workspace_id is null;

-- Manufacturing & Operations workspace
update core.module set workspace_id = (select id from core.workspace where code = 'MFO')
where code in ('MAINT', 'MFG')
  and workspace_id is null;

-- Asset Management workspace
update core.module set workspace_id = (select id from core.workspace where code = 'ASM')
where code in ('ASSET', 'ASSETREMS', 'ASSETFM')
  and workspace_id is null;

-- ============================================================================
-- §21  Notification Channels (default channels)
-- ============================================================================
insert into meta.notification_channel (id, code, name, sort_order, created_by)
values
  (gen_random_uuid(), 'IN_APP',   'In-App',           0, 'seed'),
  (gen_random_uuid(), 'EMAIL',    'Email',             1, 'seed'),
  (gen_random_uuid(), 'TEAMS',    'Microsoft Teams',   2, 'seed'),
  (gen_random_uuid(), 'WHATSAPP', 'WhatsApp',          3, 'seed'),
  (gen_random_uuid(), 'SMS',      'SMS',               4, 'seed'),
  (gen_random_uuid(), 'WEBHOOK',  'Webhook',           5, 'seed')
on conflict (code) do nothing;

-- ============================================================================
-- §22  Persona i18n Labels
-- ============================================================================

-- ============================================================================
-- Arabic (ar)
-- ============================================================================
insert into ref.label (entity, code, locale_code, name, description, created_by)
values
  ('persona', 'viewer',      'ar', 'مُشاهد',         'وصول للقراءة فقط إلى السجلات',                         'seed'),
  ('persona', 'reporter',    'ar', 'مُقرِّر',         'مشاهد مع إمكانيات إعداد التقارير',                      'seed'),
  ('persona', 'requester',   'ar', 'مُقدِّم طلب',     'يمكنه إنشاء وإدارة طلباته الخاصة',                      'seed'),
  ('persona', 'agent',       'ar', 'وكيل',           'معالجة الطلبات ضمن الوحدة التنظيمية المعيَّنة',           'seed'),
  ('persona', 'manager',     'ar', 'مدير',           'الإدارة والموافقة ضمن نطاق الوحدة التنظيمية',            'seed'),
  ('persona', 'moduleAdmin', 'ar', 'مسؤول الوحدة',   'إدارة كيانات الوحدة',                                   'seed'),
  ('persona', 'tenantAdmin', 'ar', 'مسؤول المستأجر', 'إدارة كاملة للمستأجر',                                  'seed')
on conflict (entity, code, locale_code) do nothing;

-- ============================================================================
-- Malay (ms)
-- ============================================================================
insert into ref.label (entity, code, locale_code, name, description, created_by)
values
  ('persona', 'viewer',      'ms', 'Pemerhati',        'Akses baca sahaja kepada rekod',                        'seed'),
  ('persona', 'reporter',    'ms', 'Pelapor',          'Pemerhati dengan keupayaan pelaporan',                   'seed'),
  ('persona', 'requester',   'ms', 'Pemohon',          'Boleh mencipta dan mengurus permohonan sendiri',         'seed'),
  ('persona', 'agent',       'ms', 'Agen',             'Memproses permohonan dalam unit organisasi ditugaskan',  'seed'),
  ('persona', 'manager',     'ms', 'Pengurus',         'Mengurus dan meluluskan dalam skop unit organisasi',     'seed'),
  ('persona', 'moduleAdmin', 'ms', 'Pentadbir Modul',  'Mentadbir entiti modul',                                'seed'),
  ('persona', 'tenantAdmin', 'ms', 'Pentadbir Penyewa','Pentadbiran penuh penyewa',                             'seed')
on conflict (entity, code, locale_code) do nothing;

-- ============================================================================
-- Tamil (ta)
-- ============================================================================
insert into ref.label (entity, code, locale_code, name, description, created_by)
values
  ('persona', 'viewer',      'ta', 'பார்வையாளர்',           'பதிவுகளுக்கான படிப்பு மட்டும் அணுகல்',                     'seed'),
  ('persona', 'reporter',    'ta', 'அறிக்கையாளர்',          'பார்வையாளர் மற்றும் அறிக்கை திறன்கள்',                     'seed'),
  ('persona', 'requester',   'ta', 'கோரிக்கையாளர்',         'சொந்த கோரிக்கைகளை உருவாக்கி நிர்வகிக்கலாம்',              'seed'),
  ('persona', 'agent',       'ta', 'முகவர்',                'ஒதுக்கப்பட்ட நிறுவன அலகில் கோரிக்கைகளை செயலாக்குதல்',     'seed'),
  ('persona', 'manager',     'ta', 'மேலாளர்',               'நிறுவன அலகு எல்லையில் நிர்வகித்தல் மற்றும் அங்கீகரித்தல்', 'seed'),
  ('persona', 'moduleAdmin', 'ta', 'தொகுதி நிர்வாகி',       'தொகுதி நிறுவனங்களை நிர்வகித்தல்',                          'seed'),
  ('persona', 'tenantAdmin', 'ta', 'குத்தகையாளர் நிர்வாகி', 'முழு குத்தகையாளர் நிர்வாகம்',                              'seed')
on conflict (entity, code, locale_code) do nothing;

-- ============================================================================
-- Hindi (hi)
-- ============================================================================
insert into ref.label (entity, code, locale_code, name, description, created_by)
values
  ('persona', 'viewer',      'hi', 'दर्शक',                'रिकॉर्ड तक केवल-पठन पहुँच',                          'seed'),
  ('persona', 'reporter',    'hi', 'रिपोर्टर',              'दर्शक और रिपोर्टिंग क्षमताएँ',                        'seed'),
  ('persona', 'requester',   'hi', 'अनुरोधकर्ता',           'अपने अनुरोध बना और प्रबंधित कर सकते हैं',             'seed'),
  ('persona', 'agent',       'hi', 'एजेंट',                'निर्धारित संगठनात्मक इकाई में अनुरोध संसाधित करें',     'seed'),
  ('persona', 'manager',     'hi', 'प्रबंधक',               'संगठनात्मक इकाई दायरे में प्रबंधन और अनुमोदन',        'seed'),
  ('persona', 'moduleAdmin', 'hi', 'मॉड्यूल व्यवस्थापक',    'मॉड्यूल इकाइयों का प्रशासन',                          'seed'),
  ('persona', 'tenantAdmin', 'hi', 'टेनेंट व्यवस्थापक',     'पूर्ण टेनेंट प्रशासन',                                'seed')
on conflict (entity, code, locale_code) do nothing;

-- ============================================================================
-- French (fr)
-- ============================================================================
insert into ref.label (entity, code, locale_code, name, description, created_by)
values
  ('persona', 'viewer',      'fr', 'Lecteur',              'Accès en lecture seule aux enregistrements',            'seed'),
  ('persona', 'reporter',    'fr', 'Rapporteur',           'Lecteur avec capacités de reporting',                   'seed'),
  ('persona', 'requester',   'fr', 'Demandeur',            'Peut créer et gérer ses propres demandes',              'seed'),
  ('persona', 'agent',       'fr', 'Agent',                'Traiter les demandes au sein de l''UO assignée',        'seed'),
  ('persona', 'manager',     'fr', 'Responsable',          'Gérer et approuver dans le périmètre de l''UO',         'seed'),
  ('persona', 'moduleAdmin', 'fr', 'Admin. module',        'Administrer les entités du module',                     'seed'),
  ('persona', 'tenantAdmin', 'fr', 'Admin. locataire',     'Administration complète du locataire',                  'seed')
on conflict (entity, code, locale_code) do nothing;

-- ============================================================================
-- German (de)
-- ============================================================================
insert into ref.label (entity, code, locale_code, name, description, created_by)
values
  ('persona', 'viewer',      'de', 'Betrachter',            'Lesezugriff auf Datensätze',                           'seed'),
  ('persona', 'reporter',    'de', 'Berichterstatter',      'Betrachter mit Berichtsfunktionen',                    'seed'),
  ('persona', 'requester',   'de', 'Antragsteller',         'Kann eigene Anträge erstellen und verwalten',           'seed'),
  ('persona', 'agent',       'de', 'Sachbearbeiter',        'Anträge innerhalb der zugewiesenen OE bearbeiten',      'seed'),
  ('persona', 'manager',     'de', 'Vorgesetzter',          'Verwalten und genehmigen im OE-Bereich',                'seed'),
  ('persona', 'moduleAdmin', 'de', 'Moduladministrator',    'Modulentitäten verwalten',                              'seed'),
  ('persona', 'tenantAdmin', 'de', 'Mandantenadministrator','Vollständige Mandantenverwaltung',                      'seed')
on conflict (entity, code, locale_code) do nothing;


-- ============================================================================
commit;
