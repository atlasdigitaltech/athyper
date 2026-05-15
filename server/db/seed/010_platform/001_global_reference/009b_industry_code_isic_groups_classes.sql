-- 900_seed_data/001_shared/009b_industry_code_isic_groups_classes.sql
-- Seed: ISIC Rev.4 — Complete hierarchy (Sections → Divisions → Groups → Classes)
-- Schema: shared | Table: industry_code
-- Self-contained: no external dependencies for ISIC data
-- Idempotent: ON CONFLICT (domain_code, code) DO UPDATE throughout

-- ============================================================================
-- ISIC Rev.4 — Sections (Level 1)
-- ============================================================================
insert into shared.industry_code (domain_code, code, name, description, level_no, is_leaf, status, created_by)
values
  ('isic','A','Agriculture, Forestry and Fishing','Crop and animal production, hunting, forestry, and fishing',1,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','B','Mining and Quarrying','Mining of coal, crude petroleum, metal ores, and other minerals',1,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','C','Manufacturing','Manufacture of food, textiles, chemicals, metals, machinery, and other goods',1,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','D','Electricity, Gas, Steam and Air Conditioning Supply','Generation, transmission, and distribution of electric power, gas, steam',1,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','E','Water Supply; Sewerage, Waste Management and Remediation','Water collection, treatment, supply; sewerage; waste management',1,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','F','Construction','Construction of buildings, civil engineering, and specialized construction',1,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','G','Wholesale and Retail Trade','Wholesale and retail trade; repair of motor vehicles and motorcycles',1,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','H','Transportation and Storage','Land, water, air transport; warehousing and support activities',1,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','I','Accommodation and Food Service Activities','Hotels, restaurants, catering, and other accommodation/food service',1,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','J','Information and Communication','Publishing, broadcasting, telecommunications, IT, and information services',1,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','K','Financial and Insurance Activities','Financial service, insurance, reinsurance, pension funding, and auxiliaries',1,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','L','Real Estate Activities','Buying, selling, renting, and operating real estate',1,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','M','Professional, Scientific and Technical Activities','Legal, accounting, management, architecture, engineering, R&D, advertising',1,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','N','Administrative and Support Service Activities','Rental, employment, travel, security, cleaning, and office support',1,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','O','Public Administration and Defence','Public administration, defence, and compulsory social security',1,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','P','Education','Pre-primary, primary, secondary, higher, and other education',1,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','Q','Human Health and Social Work Activities','Human health, residential care, and social work activities',1,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','R','Arts, Entertainment and Recreation','Creative arts, libraries, museums, gambling, sports, recreation',1,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','S','Other Service Activities','Membership organizations, repair of personal goods, other personal services',1,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','T','Activities of Households as Employers','Households employing domestic personnel; undifferentiated production',1,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','U','Activities of Extraterritorial Organizations and Bodies','International organizations and bodies',1,false,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- ============================================================================
-- ISIC Rev.4 — Divisions (Level 2)
-- ============================================================================

-- Section A: Agriculture, Forestry and Fishing
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('isic','01','Crop and Animal Production','Growing of crops, raising of animals, mixed farming, and support',  'A',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','02','Forestry and Logging','Silviculture, logging, gathering of non-wood forest products',           'A',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','03','Fishing and Aquaculture','Fishing and aquaculture',                                              'A',2,false,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- Section B: Mining and Quarrying
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('isic','05','Mining of Coal and Lignite','Mining of hard coal and lignite',                                    'B',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','06','Extraction of Crude Petroleum and Natural Gas','Extraction of crude petroleum and natural gas',  'B',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','07','Mining of Metal Ores','Mining of iron ores, non-ferrous metal ores',                             'B',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','08','Other Mining and Quarrying','Quarrying of stone, sand, clay, and other mining',                   'B',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','09','Mining Support Service Activities','Support activities for petroleum, gas, and other mining',     'B',2,false,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- Section C: Manufacturing
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('isic','10','Manufacture of Food Products','Processing and preserving of meat, fish, fruit, vegetables, fats','C',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','11','Manufacture of Beverages','Distilling, blending of spirits; manufacture of wines, beer',         'C',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','12','Manufacture of Tobacco Products','Manufacture of tobacco products',                               'C',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','13','Manufacture of Textiles','Spinning, weaving, finishing of textiles',                              'C',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','14','Manufacture of Wearing Apparel','Manufacture of wearing apparel, except fur apparel',             'C',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','15','Manufacture of Leather','Tanning and dressing of leather; luggage, handbags, footwear',          'C',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','16','Manufacture of Wood Products','Sawmilling, planing of wood; manufacture of wood products',       'C',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','17','Manufacture of Paper','Manufacture of paper and paper products',                                  'C',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','18','Printing and Reproduction','Printing and service activities related to printing',                 'C',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','19','Manufacture of Coke and Refined Petroleum','Manufacture of coke oven products and refined petroleum','C',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','20','Manufacture of Chemicals','Manufacture of chemicals and chemical products',                       'C',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','21','Manufacture of Pharmaceuticals','Manufacture of pharmaceuticals, medicinal chemicals',            'C',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','22','Manufacture of Rubber and Plastics','Manufacture of rubber and plastics products',                'C',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','23','Manufacture of Non-metallic Mineral Products','Manufacture of glass, ceramics, cement',           'C',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','24','Manufacture of Basic Metals','Manufacture of basic iron, steel, and non-ferrous metals',          'C',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','25','Manufacture of Fabricated Metal Products','Manufacture of structural metals, tanks, weapons',     'C',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','26','Manufacture of Computer, Electronic and Optical Products','Electronic components, computers, communication equipment','C',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','27','Manufacture of Electrical Equipment','Manufacture of electric motors, batteries, wiring, lighting','C',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','28','Manufacture of Machinery and Equipment','Manufacture of general-purpose and special-purpose machinery','C',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','29','Manufacture of Motor Vehicles','Manufacture of motor vehicles, trailers, and semi-trailers',     'C',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','30','Manufacture of Other Transport Equipment','Building of ships, railway, aircraft, spacecraft',     'C',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','31','Manufacture of Furniture','Manufacture of furniture',                                             'C',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','32','Other Manufacturing','Manufacture of jewelry, musical instruments, toys, medical devices',        'C',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','33','Repair and Installation of Machinery','Repair of fabricated metals, machinery, equipment',        'C',2,false,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- Section D: Electricity, Gas, Steam
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('isic','35','Electricity, Gas, Steam and Air Conditioning Supply','Generation, transmission, distribution of electricity, gas, steam','D',2,false,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- Section E: Water Supply, Sewerage, Waste
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('isic','36','Water Collection, Treatment and Supply','Water collection, treatment and supply',                 'E',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','37','Sewerage','Sewerage',                                                                             'E',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','38','Waste Collection, Treatment and Disposal','Waste collection, treatment, disposal, materials recovery','E',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','39','Remediation and Other Waste Management','Remediation activities and other waste management services','E',2,false,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- Section F: Construction
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('isic','41','Construction of Buildings','Construction of residential and non-residential buildings',           'F',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','42','Civil Engineering','Construction of roads, railways, utility projects, bridges',                  'F',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','43','Specialized Construction Activities','Demolition, site preparation, electrical, plumbing, finishing','F',2,false,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- Section G: Wholesale and Retail Trade
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('isic','45','Wholesale and Retail Trade of Motor Vehicles','Sale, maintenance, repair of motor vehicles','G',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','46','Wholesale Trade','Wholesale trade, except of motor vehicles and motorcycles',                     'G',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','47','Retail Trade','Retail trade, except of motor vehicles and motorcycles',                           'G',2,false,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- Section H: Transportation and Storage
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('isic','49','Land Transport and Transport via Pipelines','Railway, road, urban transit, freight, pipelines',   'H',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','50','Water Transport','Sea and coastal water transport; inland water transport',                       'H',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','51','Air Transport','Passenger and freight air transport',                                             'H',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','52','Warehousing and Support Activities','Warehousing and storage; support for transportation',        'H',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','53','Postal and Courier Activities','Postal and courier activities',                                   'H',2,false,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- Section I: Accommodation and Food Service
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('isic','55','Accommodation','Short-stay accommodation, camping, RV parks',                                    'I',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','56','Food and Beverage Service Activities','Restaurants, catering, bars, canteens',                    'I',2,false,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- Section J: Information and Communication
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('isic','58','Publishing Activities','Publishing of books, periodicals, directories, software',                'J',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','59','Motion Picture, Video and Television','Motion picture, video, television programme production',   'J',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','60','Programming and Broadcasting','Radio and television broadcasting',                                'J',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','61','Telecommunications','Wired, wireless, satellite, and other telecommunications',                  'J',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','62','Computer Programming and Consultancy','Computer programming, consultancy, and related activities','J',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','63','Information Service Activities','Data processing, hosting, web portals, news agencies',           'J',2,false,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- Section K: Financial and Insurance
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('isic','64','Financial Service Activities','Monetary intermediation, holding companies, trusts, funds',        'K',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','65','Insurance, Reinsurance and Pension Funding','Insurance, reinsurance, and pension funding',         'K',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','66','Activities Auxiliary to Financial Service','Securities dealing, fund management, brokerages',      'K',2,false,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- Section L: Real Estate
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('isic','68','Real Estate Activities','Buying, selling, renting, and managing real estate',                     'L',2,false,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- Section M: Professional, Scientific and Technical
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('isic','69','Legal and Accounting Activities','Legal, accounting, bookkeeping, auditing, tax consultancy',     'M',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','70','Activities of Head Offices; Management Consultancy','Head office activities, management consultancy','M',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','71','Architectural and Engineering Activities','Architecture, engineering, technical testing',          'M',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','72','Scientific Research and Development','R&D in natural sciences, engineering, social sciences',     'M',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','73','Advertising and Market Research','Advertising, market research and public opinion polling',       'M',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','74','Other Professional, Scientific and Technical','Specialized design, photography, translation',     'M',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','75','Veterinary Activities','Veterinary activities',                                                    'M',2,false,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- Section N: Administrative and Support
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('isic','77','Rental and Leasing Activities','Renting and leasing of motor vehicles, goods, IP',               'N',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','78','Employment Activities','Temporary employment, placement, HR provision',                           'N',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','79','Travel Agency and Tour Operator','Travel agency, tour operator, and reservation services',       'N',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','80','Security and Investigation Activities','Private security, investigation, security systems',       'N',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','81','Services to Buildings and Landscape Care','Cleaning, pest control, landscaping',                  'N',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','82','Office Administrative and Support','Office administration, call centres, conventions, packaging', 'N',2,false,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- Sections O–U: single-division sections
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('isic','84','Public Administration and Defence','Government administration, regulation, defence, social security','O',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','85','Education','Pre-primary through post-secondary education; sports and cultural education','P',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','86','Human Health Activities','Hospital, medical, dental practice activities',                         'Q',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','87','Residential Care Activities','Residential nursing, care for elderly, mental health',              'Q',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','88','Social Work Activities Without Accommodation','Social work for elderly, disabled; child day-care','Q',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','90','Creative, Arts and Entertainment','Performing arts, artistic creation, arts facilities',          'R',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','91','Libraries, Archives, Museums','Libraries, archives, museums, botanical/zoological gardens',      'R',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','92','Gambling and Betting Activities','Gambling and betting activities',                                'R',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','93','Sports and Recreation Activities','Sports, amusement and recreation activities',                  'R',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','94','Activities of Membership Organizations','Business, employer, professional, trade unions, religious','S',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','95','Repair of Computers and Personal Goods','Repair of computers, communication equipment, personal goods','S',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','96','Other Personal Service Activities','Laundry, hairdressing, funeral, physical well-being',         'S',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','97','Activities of Households as Employers','Households as employers of domestic personnel',           'T',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','98','Undifferentiated Goods and Services Production','Undifferentiated goods- and services-producing activities of households for own use','T',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','99','Activities of Extraterritorial Organizations','International organizations and bodies',           'U',2,false,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- ============================================================================
-- ISIC Rev.4 — Groups (Level 3) and Classes (Level 4)
-- ============================================================================

-- Section A — Agriculture, Forestry and Fishing (01-03)
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('isic','011','Growing of non-perennial crops','Cultivation of cereals, vegetables, sugar cane, tobacco, fibre crops and other non-perennial plants','01',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','0111','Growing of cereals (except rice), leguminous crops and oil seeds','Cultivation of wheat, maize, sorghum, barley, rye, oats, millet, other cereals, leguminous crops, and oil seeds','011',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','0112','Growing of rice','Growing of rice including paddy and cleaned rice production','011',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','0113','Growing of vegetables and melons, roots and tubers','Growing of leafy or stem vegetables, fruit-bearing vegetables, root and tuber vegetables, mushrooms and truffles','011',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','0114','Growing of sugar cane','Growing of sugar cane for sugar production or for use as animal feed or energy','011',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','0115','Growing of tobacco','Growing of tobacco in unmanufactured form','011',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','0116','Growing of fibre crops','Growing of cotton, jute, flax, hemp, sisal, and other textile fibre crops','011',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','0119','Growing of other non-perennial crops','Growing of buckwheat, millet, other non-perennial crops not elsewhere classified','011',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','012','Growing of perennial crops','Cultivation of grapes, tropical fruits, citrus, pome, stone, oleaginous, beverage and spice crops','01',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','0121','Growing of grapes','Growing of grapes for table use, wine making, and raisin production','012',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','0122','Growing of tropical and subtropical fruits','Growing of bananas, plantains, mangoes, papayas, pineapples, dates, figs, avocados and other tropical fruits','012',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','0123','Growing of citrus fruits','Growing of oranges, lemons, limes, tangerines, grapefruit and other citrus fruits','012',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','0124','Growing of pome fruits and stone fruits','Growing of apples, pears, quinces, cherries, peaches, plums, apricots and other pome/stone fruits','012',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','0125','Growing of other tree and bush fruits and nuts','Growing of berries, kiwifruit, tree nuts including almonds, cashews, walnuts, chestnuts and other fruits','012',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','0126','Growing of oleaginous fruits','Growing of oil palm fruit, olives, coconuts, and other oleaginous fruits','012',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','0127','Growing of beverage crops','Growing of coffee, tea, cocoa, and mate crops','012',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','0128','Growing of spices, aromatic, drug and pharmaceutical crops','Growing of pepper, chillies, nutmeg, ginger, vanilla, hops and other spice, aromatic and medicinal plants','012',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','0129','Growing of other perennial crops','Growing of natural rubber, Christmas trees and other perennial crops not elsewhere classified','012',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','013','Plant propagation','Propagation of plants through seeds, cuttings, grafting and similar vegetative techniques','01',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','0130','Plant propagation','Operation of plant nurseries, growing of plants for planting, transplanting, and ornamental purposes','013',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','014','Animal production','Raising of cattle, horses, camels, sheep, goats, swine, poultry and other livestock','01',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','0141','Raising of cattle and buffaloes','Raising and breeding of cattle, buffaloes and production of raw milk and semen','014',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','0142','Raising of horses and other equines','Raising and breeding of horses, asses, mules and hinnies','014',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','0143','Raising of camels and camelids','Raising and breeding of camels, dromedaries and camelids','014',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','0144','Raising of sheep and goats','Raising of sheep and goats and production of raw sheep/goat milk and wool','014',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','0145','Raising of swine/pigs','Raising and breeding of swine and pigs','014',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','0146','Raising of poultry','Raising of chickens, turkeys, ducks, geese, guinea fowl and other poultry; production of eggs','014',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','0149','Raising of other animals','Raising of bees, silkworms, rabbits, fur animals, reptiles, and other animals not elsewhere classified','014',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','015','Mixed farming','Combined crop and animal production without specialisation in either activity','01',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','0150','Mixed farming','Mixed farming combining crop cultivation and animal raising as joint principal activities','015',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','016','Support activities to agriculture and post-harvest crop activities','Support activities for crop and animal production and post-harvest crop handling','01',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','0161','Support activities for crop production','Agricultural service activities for crop production including soil preparation, planting, harvesting, pest control','016',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','0162','Support activities for animal production','Support activities for animal production including breeding services, herd testing, shearing, and drove services','016',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','0163','Post-harvest crop activities','Post-harvest crop activities including cleaning, trimming, grading, drying, shelling, and seed processing','016',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','0164','Seed processing for propagation','Processing of seeds for propagation including seed coating, pelleting, drying and storage','016',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','017','Hunting, trapping and related service activities','Hunting, trapping and gathering of wild animals for food, fur, skin, research or captive use','01',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','0170','Hunting, trapping and related service activities','Hunting, trapping of wild animals, gathering of wild animal products, and related service activities','017',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','021','Silviculture and other forestry activities','Growing of standing timber, nursery operations for forest trees and reforestation','02',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','0210','Silviculture and other forestry activities','Silviculture including planting, replanting, thinning of standing timber, forest nurseries','021',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','022','Logging','Production of roundwood and fuel wood in forests and tree stands','02',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','0220','Logging','Logging including felling, rough squaring, and transport of logs within the forest','022',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','023','Gathering of non-wood forest products','Gathering of wild-growing non-wood products from forests','02',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','0230','Gathering of non-wood forest products','Gathering of mushrooms, truffles, berries, nuts, gums, resins, cork, lac, balsams and other forest products','023',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','024','Support services to forestry','Technical support services for forestry operations','02',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','0240','Support services to forestry','Forestry service activities including timber evaluation, fire-fighting, pest control and forest management','024',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','031','Fishing','Catching of fish and other marine and freshwater organisms','03',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','0311','Marine fishing','Marine fishing on ocean and coastal waters using various gear and methods','031',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','0312','Freshwater fishing','Fishing in inland waters including rivers, lakes, reservoirs and other freshwater bodies','031',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','032','Aquaculture','Breeding and raising of fish, crustaceans, molluscs and aquatic plants','03',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','0321','Marine aquaculture','Growing of fish, crustaceans, molluscs, and other marine organisms in sea water environments','032',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','0322','Freshwater aquaculture','Growing of fish, crustaceans, and other freshwater organisms in ponds, tanks and other facilities','032',4,true,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- ============================================================================
-- Section B — Mining and Quarrying (05-09)
-- ============================================================================
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('isic','051','Mining of hard coal','Mining of hard coal from underground or surface mines','05',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','0510','Mining of hard coal','Mining of hard coal including anthracite, bituminous coal and sub-bituminous coal','051',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','052','Mining of lignite','Mining of lignite from underground or surface mines','05',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','0520','Mining of lignite','Mining and agglomeration of lignite (brown coal)','052',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','061','Extraction of crude petroleum','Extraction of crude petroleum from underground reservoirs','06',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','0610','Extraction of crude petroleum','Extraction of crude petroleum, mining of bituminous or oil shale and tar sands','061',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','062','Extraction of natural gas','Extraction of natural gas from underground reservoirs','06',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','0620','Extraction of natural gas','Production of crude gaseous hydrocarbons including methane, ethane, butane and propane','062',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','071','Mining of iron ores','Mining of iron ores from underground or surface mines','07',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','0710','Mining of iron ores','Mining and beneficiation of iron ores including magnetite, hematite and other ferrous ores','071',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','072','Mining of non-ferrous metal ores','Mining of non-ferrous metal ores except iron','07',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','0721','Mining of uranium and thorium ores','Mining and concentration of uranium and thorium ores','072',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','0729','Mining of other non-ferrous metal ores','Mining of copper, nickel, aluminium, precious metals, lead, zinc, tin and other non-ferrous metal ores','072',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','081','Quarrying of stone, sand and clay','Quarrying of stone, sand and clay for construction and industry','08',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','0810','Quarrying of stone, sand and clay','Quarrying of ornamental and building stone, limestone, gypsum, chalk, slate, sand, gravel and clay','081',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','089','Mining and quarrying n.e.c.','Mining and quarrying of minerals not elsewhere classified','08',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','0891','Mining of chemical and fertilizer minerals','Mining of chemical and fertilizer minerals including phosphates, potash, sulphur and barium','089',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','0892','Extraction of peat','Extraction of peat for agricultural, horticultural and fuel uses','089',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','0893','Extraction of salt','Extraction of salt from underground deposits or by evaporation of sea water and brines','089',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','0899','Other mining and quarrying n.e.c.','Other mining and quarrying including extraction of abrasives, asbestos, gemstones and other minerals','089',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','091','Support activities for petroleum and natural gas extraction','Service activities for petroleum and natural gas extraction','09',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','0910','Support activities for petroleum and natural gas extraction','Drilling, derrick erecting, casing, cementing and other support activities for oil and gas extraction','091',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','099','Support activities for other mining and quarrying','Support activities for other mining operations','09',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','0990','Support activities for other mining and quarrying','Support services for mining including exploration, draining, pumping, test drilling and geological surveys','099',4,true,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- ============================================================================
-- Section C — Manufacturing (10-33)
-- ============================================================================

-- Division 10: Manufacture of food products
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('isic','101','Processing and preserving of meat','Processing and preserving of meat products','10',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','1010','Processing and preserving of meat','Processing and preserving of meat from cattle, pigs, sheep, horses, poultry and other animals','101',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','102','Processing and preserving of fish, crustaceans and molluscs','Processing and preserving of fish and fish products','10',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','1020','Processing and preserving of fish, crustaceans and molluscs','Canning, smoking, salting, drying, cooking, freezing and other preservation of fish and fish products','102',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','103','Processing and preserving of fruit and vegetables','Processing and preserving of fruit and vegetables','10',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','1030','Processing and preserving of fruit and vegetables','Canning, drying, freezing, cooking and other processing and preserving of fruit and vegetables','103',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','104','Manufacture of vegetable and animal oils and fats','Manufacture of vegetable and animal oils and fats','10',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','1040','Manufacture of vegetable and animal oils and fats','Manufacture of crude and refined oils and fats from vegetable and animal materials including margarine','104',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','105','Manufacture of dairy products','Manufacture of dairy products','10',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','1050','Manufacture of dairy products','Manufacture of fresh or processed milk, cream, butter, cheese, ice cream and other dairy products','105',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','106','Manufacture of grain mill products, starches and starch products','Manufacture of grain mill products, starches and starch products','10',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','1061','Manufacture of grain mill products','Manufacture of grain mill products including flour, groats, meals and breakfast cereals from grains','106',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','1062','Manufacture of starches and starch products','Manufacture of starches, starch products, tapioca, glucose, fructose and similar products','106',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','107','Manufacture of other food products','Manufacture of other food products','10',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','1071','Manufacture of bakery products','Manufacture of bakery products including bread, pastry, cakes, pies, and fresh pasta','107',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','1072','Manufacture of sugar','Manufacture of sugar from cane, beet or other sources including refining','107',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','1073','Manufacture of cocoa, chocolate and sugar confectionery','Manufacture of cocoa, chocolate and sugar confectionery products','107',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','1074','Manufacture of macaroni, noodles, couscous and similar farinaceous products','Manufacture of macaroni, noodles, couscous, and similar farinaceous products','107',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','1075','Manufacture of prepared meals and dishes','Manufacture of prepared meals and dishes including frozen dinners and other prepared foods','107',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','1079','Manufacture of other food products n.e.c.','Manufacture of coffee, tea, condiments, spices, vinegar, yeast, egg products and other food products n.e.c.','107',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','108','Manufacture of prepared animal feeds','Manufacture of prepared animal feeds','10',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','1080','Manufacture of prepared animal feeds','Manufacture of prepared feeds for farm animals, domestic pets and other animals','108',4,true,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- Divisions 11-12: Beverages and Tobacco
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('isic','110','Manufacture of beverages','Manufacture of beverages','11',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','1101','Distilling, rectifying and blending of spirits','Distilling, rectifying and blending of spirits and manufacture of ethyl alcohol from fermentation','110',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','1102','Manufacture of wines','Manufacture of wines from grapes and other fruits including sparkling and fortified wines','110',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','1103','Manufacture of malt liquors and malt','Manufacture of malt liquors including beer, stout, porter and other malt beverages','110',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','1104','Manufacture of soft drinks; production of mineral waters and other bottled waters','Manufacture of soft drinks, mineral waters and other non-alcoholic beverages','110',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','120','Manufacture of tobacco products','Manufacture of tobacco products from leaf tobacco or tobacco substitutes','12',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','1200','Manufacture of tobacco products','Manufacture of cigarettes, cigars, pipe tobacco, chewing tobacco, snuff and other tobacco products','120',4,true,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- Divisions 13-15: Textiles, Apparel, Leather
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('isic','131','Spinning, weaving and finishing of textiles','Spinning, weaving and finishing of textile fibres and yarns','13',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','1311','Preparation and spinning of textile fibres','Preparation and spinning of textile fibres including cotton, wool, silk and man-made fibres','131',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','1312','Weaving of textiles','Weaving and finishing of textiles on looms from cotton, wool, silk and other fibres','131',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','1313','Finishing of textiles','Finishing of textiles including bleaching, dyeing, dressing, printing, shrinking and sanforizing','131',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','139','Manufacture of other textiles','Manufacture of other textiles including knitted fabrics, carpets, cordage and special textiles','13',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','1391','Manufacture of knitted and crocheted fabrics','Manufacture of knitted and crocheted fabrics including pile and terry fabrics','139',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','1392','Manufacture of made-up textile articles, except apparel','Manufacture of made-up textile articles including bedding, curtains, bags, tarpaulins and flags','139',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','1393','Manufacture of carpets and rugs','Manufacture of carpets, rugs and other textile floor coverings','139',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','1394','Manufacture of cordage, rope, twine and netting','Manufacture of cordage, rope, twine, netting and related products','139',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','1399','Manufacture of other textiles n.e.c.','Manufacture of narrow fabrics, lace, embroidery, felt, non-wovens and other textiles n.e.c.','139',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','141','Manufacture of wearing apparel, except fur apparel','Manufacture of wearing apparel except fur apparel','14',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','1410','Manufacture of wearing apparel, except fur apparel','Manufacture of clothing and accessories from woven, knitted or non-woven fabrics and various materials','141',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','142','Manufacture of articles of fur','Manufacture of articles of fur','14',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','1420','Manufacture of articles of fur','Manufacture of fur skins and articles of fur including coats, hats, and trimmings','142',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','143','Manufacture of knitted and crocheted apparel','Manufacture of knitted and crocheted apparel','14',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','1430','Manufacture of knitted and crocheted apparel','Manufacture of knitted and crocheted wearing apparel including pullovers, cardigans, hosiery','143',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','151','Tanning and dressing of leather; manufacture of luggage, handbags, saddlery and harness; dressing and dyeing of fur','Tanning and dressing of leather; manufacture of luggage and footwear','15',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','1511','Tanning and dressing of leather; dressing and dyeing of fur','Tanning, dyeing, and dressing of leather and fur skins; manufacture of chamois and patent leather','151',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','1512','Manufacture of luggage, handbags and the like, saddlery and harness','Manufacture of luggage, handbags, saddlery, harness and articles of leather or substitutes','151',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','152','Manufacture of footwear','Manufacture of footwear','15',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','1520','Manufacture of footwear','Manufacture of footwear of any material for all purposes including sports and protective footwear','152',4,true,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- Divisions 16-18: Wood, Paper, Printing
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('isic','161','Sawmilling and planing of wood','Sawmilling and planing of wood','16',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','1610','Sawmilling and planing of wood','Sawmilling, planing and impregnation of wood for production of lumber, plywood, veneer and boards','161',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','162','Manufacture of products of wood, cork, straw and plaiting materials','Manufacture of products of wood, cork, straw and plaiting materials','16',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','1621','Manufacture of veneer sheets and wood-based panels','Manufacture of veneer sheets, plywood, particle board, fibreboard and similar laminated wood products','162',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','1622','Manufacture of builders'' carpentry and joinery','Manufacture of wooden doors, windows, shutters, stairs, parquet flooring and other builders'' carpentry','162',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','1623','Manufacture of wooden containers','Manufacture of wooden containers including pallets, boxes, casks, barrels and cable drums','162',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','1629','Manufacture of other products of wood; manufacture of articles of cork, straw and plaiting materials','Manufacture of cork products, straw articles, and other wood products not elsewhere classified','162',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','170','Manufacture of paper and paper products','Manufacture of all forms of paper, paperboard and articles thereof','17',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','1701','Manufacture of pulp, paper and paperboard','Manufacture of pulp, paper and paperboard in bulk form','170',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','1702','Manufacture of corrugated paper and paperboard and of containers of paper and paperboard','Manufacture of corrugated paper and paperboard, paper containers, bags, envelopes and stationery','170',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','1709','Manufacture of other articles of paper and paperboard','Manufacture of wallpaper, carbon paper, filter paper and other articles of paper and paperboard n.e.c.','170',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','181','Printing and service activities related to printing','Printing and printing service activities','18',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','1811','Printing','Printing of newspapers, books, periodicals, maps, labels and other materials on various media','181',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','1812','Service activities related to printing','Service activities related to printing including bookbinding, plate-making, and data imaging','181',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','182','Reproduction of recorded media','Reproduction of recorded media','18',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','1820','Reproduction of recorded media','Reproduction of recorded media including music, video, software and data on discs and tapes','182',4,true,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- Divisions 19-21: Coke, Chemicals, Pharmaceuticals
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('isic','191','Manufacture of coke oven products','Manufacture of coke oven products','19',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','1910','Manufacture of coke oven products','Manufacture of coke and semi-coke from coal, lignite or peat; production of coal tar and coke oven gas','191',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','192','Manufacture of refined petroleum products','Manufacture of refined petroleum products','19',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','1920','Manufacture of refined petroleum products','Manufacture of motor fuel, lamp oil, kerosene, lubricating oils, paraffin wax, petroleum jelly and other refined products','192',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','201','Manufacture of basic chemicals, fertilizers and nitrogen compounds, plastics and synthetic rubber in primary forms','Manufacture of basic chemicals, fertilizers, plastics and synthetic rubber','20',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','2011','Manufacture of basic chemicals','Manufacture of basic industrial chemicals including gases, acids, alkalis and inorganic chemicals','201',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','2012','Manufacture of fertilizers and nitrogen compounds','Manufacture of fertilizers and nitrogen compounds including nitric acid, ammonia and phosphatic fertilizers','201',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','2013','Manufacture of plastics and synthetic rubber in primary forms','Manufacture of plastics and synthetic rubber in primary forms','201',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','202','Manufacture of other chemical products','Manufacture of other chemical products','20',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','2021','Manufacture of pesticides and other agrochemical products','Manufacture of pesticides, herbicides, fungicides, insecticides and other agrochemical products','202',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','2022','Manufacture of paints, varnishes and similar coatings, printing ink and mastics','Manufacture of paints, varnishes, lacquers, printing inks, mastics and sealants','202',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','2023','Manufacture of soap and detergents, cleaning and polishing preparations, perfumes and toilet preparations','Manufacture of soaps, detergents, cleaning preparations, perfumes, cosmetics and toiletries','202',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','2029','Manufacture of other chemical products n.e.c.','Manufacture of glues, essential oils, photographic chemicals, explosives, and chemical products n.e.c.','202',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','203','Manufacture of man-made fibres','Manufacture of man-made fibres','20',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','2030','Manufacture of man-made fibres','Manufacture of synthetic and artificial filaments, staple fibres and continuous filament tow','203',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','210','Manufacture of pharmaceuticals, medicinal chemical and botanical products','Manufacture of pharmaceuticals, medicinal chemicals and botanical products','21',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','2100','Manufacture of pharmaceuticals, medicinal chemical and botanical products','Manufacture of pharmaceutical preparations, vaccines, sera, medicinal substances, contraceptives and diagnostics','210',4,true,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- Divisions 22-23: Rubber, Plastics, Non-metallic minerals
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('isic','221','Manufacture of rubber products','Manufacture of rubber products','22',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','2211','Manufacture of rubber tyres and tubes; retreading and rebuilding of rubber tyres','Manufacture of new rubber tyres, tyre casings, inner tubes, tyre treads, and retreading of used tyres','221',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','2219','Manufacture of other rubber products','Manufacture of rubber plates, sheets, tubes, hoses, belting, floor coverings, and other rubber products','221',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','222','Manufacture of plastics products','Manufacture of plastics products','22',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','2220','Manufacture of plastics products','Manufacture of plastic plates, sheets, tubes, profiles, packaging, floor coverings and other plastic products','222',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','231','Manufacture of glass and glass products','Manufacture of glass and glass products','23',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','2310','Manufacture of glass and glass products','Manufacture of flat, hollow, and fibre glass; glass blocks, sheets, tableware, and other glass products','231',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','239','Manufacture of non-metallic mineral products n.e.c.','Manufacture of non-metallic mineral products not elsewhere classified','23',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','2391','Manufacture of refractory products','Manufacture of refractory bricks, blocks, tiles, and other refractory ceramic products','239',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','2392','Manufacture of clay building materials','Manufacture of clay building materials including bricks, tiles, pipes and chimney pots','239',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','2393','Manufacture of other porcelain and ceramic products','Manufacture of ceramic tableware, kitchenware, sanitary ware, household and ornamental articles','239',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','2394','Manufacture of cement, lime and plaster','Manufacture of cement, lime, plaster and articles thereof','239',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','2395','Manufacture of articles of concrete, cement and plaster','Manufacture of concrete, cement and plaster articles for construction and other uses','239',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','2396','Cutting, shaping and finishing of stone','Cutting, shaping and finishing of stone for construction, cemetery, road and other uses','239',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','2399','Manufacture of other non-metallic mineral products n.e.c.','Manufacture of asbestos products, friction materials, mineral insulation and non-metallic mineral products n.e.c.','239',4,true,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- Divisions 24-25: Basic metals, Fabricated metal products
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('isic','241','Manufacture of basic iron and steel','Manufacture of basic iron and steel','24',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','2410','Manufacture of basic iron and steel','Smelting and refining of iron and steel, production of pig iron, spiegeleisen, ingots and semi-finished products','241',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','242','Manufacture of basic precious and other non-ferrous metals','Manufacture of basic precious and other non-ferrous metals','24',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','2420','Manufacture of basic precious and other non-ferrous metals','Smelting and refining of copper, aluminium, lead, zinc, tin, precious and other non-ferrous metals','242',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','243','Casting of metals','Casting of metals','24',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','2431','Casting of iron and steel','Casting of iron and steel including semi-finished cast iron and steel products','243',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','2432','Casting of non-ferrous metals','Casting of non-ferrous metals including copper, aluminium, zinc and magnesium alloy castings','243',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','251','Manufacture of structural metal products, tanks, reservoirs and steam generators','Manufacture of structural metal products, tanks, reservoirs and steam generators','25',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','2511','Manufacture of structural metal products','Manufacture of metal frameworks, structures, parts for buildings, bridges and similar structures','251',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','2512','Manufacture of tanks, reservoirs and containers of metal','Manufacture of metal tanks, reservoirs, vats, containers and central heating radiators and boilers','251',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','2513','Manufacture of steam generators, except central heating hot water boilers','Manufacture of steam generators including boilers for marine and power applications','251',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','252','Manufacture of weapons and ammunition','Manufacture of weapons and ammunition','25',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','2520','Manufacture of weapons and ammunition','Manufacture of heavy weapons, small arms, air and gas guns, ammunition and ordnance','252',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','259','Manufacture of other fabricated metal products; metalworking service activities','Manufacture of other fabricated metal products and metalworking services','25',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','2591','Forging, pressing, stamping and roll-forming of metal; powder metallurgy','Forging, pressing, stamping, roll-forming and powder metallurgy of metals','259',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','2592','Treatment and coating of metals; machining','Treatment and coating of metals, and general mechanical engineering on a fee or contract basis','259',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','2593','Manufacture of cutlery, hand tools and general hardware','Manufacture of cutlery, hand tools, general hardware, locks, hinges and metal fittings','259',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','2599','Manufacture of other fabricated metal products n.e.c.','Manufacture of metal cans, wire products, springs, fasteners and other fabricated metal products n.e.c.','259',4,true,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- Division 26: Computer, electronic and optical products
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('isic','261','Manufacture of electronic components and boards','Manufacture of electronic components and boards','26',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','2610','Manufacture of electronic components and boards','Manufacture of semiconductors, printed circuits, capacitors, resistors and electronic assemblies','261',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','262','Manufacture of computers and peripheral equipment','Manufacture of computers and peripheral equipment','26',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','2620','Manufacture of computers and peripheral equipment','Manufacture of desktop, laptop, tablet computers, servers, terminals and peripheral equipment','262',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','263','Manufacture of communication equipment','Manufacture of communication equipment','26',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','2630','Manufacture of communication equipment','Manufacture of telephone, radio, television broadcasting and wireless communication equipment','263',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','264','Manufacture of consumer electronics','Manufacture of consumer electronics','26',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','2640','Manufacture of consumer electronics','Manufacture of televisions, audio equipment, video recorders and related consumer electronics','264',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','265','Manufacture of measuring, testing, navigating and control equipment; watches and clocks','Manufacture of measuring, testing, navigating and control equipment; watches and clocks','26',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','2651','Manufacture of measuring, testing, navigating and control equipment','Manufacture of instruments for measuring, testing, navigating including radar, GPS and industrial controls','265',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','2652','Manufacture of watches and clocks','Manufacture of watches, clocks, time-recording apparatus and similar timing devices','265',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','266','Manufacture of irradiation, electromedical and electrotherapeutic equipment','Manufacture of irradiation, electromedical and electrotherapeutic equipment','26',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','2660','Manufacture of irradiation, electromedical and electrotherapeutic equipment','Manufacture of irradiation apparatus, electromedical equipment, pacemakers and hearing aids','266',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','267','Manufacture of optical instruments and photographic equipment','Manufacture of optical instruments and photographic equipment','26',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','2670','Manufacture of optical instruments and photographic equipment','Manufacture of optical instruments, lenses, microscopes, binoculars, cameras and projectors','267',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','268','Manufacture of magnetic and optical media','Manufacture of magnetic and optical media','26',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','2680','Manufacture of magnetic and optical media','Manufacture of blank magnetic and optical recording media including tapes, diskettes, and optical discs','268',4,true,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- Division 27: Electrical equipment
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('isic','271','Manufacture of electric motors, generators, transformers and electricity distribution and control apparatus','Manufacture of electric motors, generators, transformers and electricity distribution apparatus','27',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','2710','Manufacture of electric motors, generators, transformers and electricity distribution and control apparatus','Manufacture of electric motors, generators, transformers, switchgear, switchboards and control apparatus','271',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','272','Manufacture of batteries and accumulators','Manufacture of batteries and accumulators','27',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','2720','Manufacture of batteries and accumulators','Manufacture of primary cells, batteries, storage batteries and accumulators for all applications','272',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','273','Manufacture of wiring and wiring devices','Manufacture of wiring and wiring devices','27',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','2731','Manufacture of fibre optic cables','Manufacture of fibre optic cables, insulated wire, cable and other electrical conductor products','273',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','2732','Manufacture of other electronic and electric wires and cables','Manufacture of wiring devices including switches, sockets, plugs, junction boxes and cable fittings','273',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','2733','Manufacture of wiring devices','Manufacture of wiring devices including switches, sockets, plugs, junction boxes and cable fittings','273',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','274','Manufacture of electric lighting equipment','Manufacture of electric lighting equipment','27',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','2740','Manufacture of electric lighting equipment','Manufacture of electric lamps, light fittings, chandeliers, flashlights and luminous signs','274',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','275','Manufacture of domestic appliances','Manufacture of domestic appliances','27',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','2750','Manufacture of domestic appliances','Manufacture of household electric and non-electric appliances including refrigerators, washers, heaters','275',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','279','Manufacture of other electrical equipment','Manufacture of other electrical equipment','27',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','2790','Manufacture of other electrical equipment','Manufacture of battery chargers, electrical signalling equipment, insulators and other electrical equipment n.e.c.','279',4,true,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- Division 28: Machinery and equipment n.e.c.
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('isic','281','Manufacture of general-purpose machinery','Manufacture of general-purpose machinery','28',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','2811','Manufacture of engines and turbines, except aircraft, vehicle and cycle engines','Manufacture of engines and turbines except aircraft, vehicle and cycle engines','281',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','2812','Manufacture of fluid power equipment','Manufacture of fluid power equipment including hydraulic and pneumatic pumps, motors, valves and actuators','281',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','2813','Manufacture of other pumps, compressors, taps and valves','Manufacture of pumps, compressors, taps, valves and similar components','281',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','2814','Manufacture of bearings, gears, gearing and driving elements','Manufacture of bearings, gears, gearing, driving elements and other general mechanical components','281',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','2815','Manufacture of ovens, furnaces and furnace burners','Manufacture of ovens, furnaces, burners, non-domestic cooling and ventilating equipment','281',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','2816','Manufacture of lifting and handling equipment','Manufacture of lifting and handling equipment including cranes, conveyors, lifts and escalators','281',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','2817','Manufacture of office machinery and equipment (except computers and peripheral equipment)','Manufacture of office machinery and equipment including calculators, typewriters, photocopiers','281',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','2818','Manufacture of power-driven hand tools','Manufacture of hand-held power driven tools with built-in electric or non-electric motors','281',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','2819','Manufacture of other general-purpose machinery','Manufacture of general-purpose machinery not elsewhere classified','281',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','282','Manufacture of special-purpose machinery','Manufacture of special-purpose machinery','28',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','2821','Manufacture of agricultural and forestry machinery','Manufacture of agricultural and forestry machinery including tractors, ploughs, harvesters','282',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','2822','Manufacture of metal-forming machinery and machine tools','Manufacture of metal-forming machinery and machine tools for cutting, shaping and finishing metals','282',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','2823','Manufacture of machinery for metallurgy','Manufacture of machinery for metallurgy including converters, ladles, casting machines and rolling mills','282',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','2824','Manufacture of machinery for mining, quarrying and construction','Manufacture of machinery for mining, quarrying, construction, and earthmoving equipment','282',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','2825','Manufacture of machinery for food, beverage and tobacco processing','Manufacture of machinery for food, beverage, and tobacco processing','282',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','2826','Manufacture of machinery for textile, apparel and leather production','Manufacture of machinery for textile, apparel, and leather production','282',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','2829','Manufacture of other special-purpose machinery','Manufacture of other special-purpose machinery not elsewhere classified','282',4,true,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- Divisions 29-30: Motor vehicles, Other transport equipment
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('isic','291','Manufacture of motor vehicles','Manufacture of motor vehicles including cars, trucks, buses and coaches','29',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','2910','Manufacture of motor vehicles','Manufacture of passenger motor cars, commercial vehicles, buses, trolley-buses and motor vehicle engines','291',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','292','Manufacture of bodies (coachwork) for motor vehicles; manufacture of trailers and semi-trailers','Manufacture of bodies for motor vehicles; manufacture of trailers and semi-trailers','29',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','2920','Manufacture of bodies (coachwork) for motor vehicles; manufacture of trailers and semi-trailers','Manufacture of bodies, coaches, trailers, semi-trailers, containers and caravans for motor vehicles','292',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','293','Manufacture of parts and accessories for motor vehicles','Manufacture of parts and accessories for motor vehicles','29',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','2930','Manufacture of parts and accessories for motor vehicles','Manufacture of parts and accessories for motor vehicles including brakes, gearboxes, axles, wheels','293',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','301','Building of ships and boats','Building of ships and boats','30',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','3011','Building of ships and floating structures','Building of ships including passenger, cargo, tanker, military, fishing, and other sea-going vessels','301',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','3012','Building of pleasure and sporting boats','Building of pleasure and sporting boats including sailboats, motorboats, canoes and dinghies','301',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','302','Manufacture of railway locomotives and rolling stock','Manufacture of railway locomotives and rolling stock','30',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','3020','Manufacture of railway locomotives and rolling stock','Manufacture of railway locomotives, tramway vehicles, railway coaches, wagons and parts thereof','302',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','303','Manufacture of air and spacecraft and related machinery','Manufacture of air and spacecraft and related machinery','30',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','3030','Manufacture of air and spacecraft and related machinery','Manufacture of aircraft, helicopters, gliders, dirigibles, spacecraft, satellites and launch vehicles','303',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','304','Manufacture of military fighting vehicles','Manufacture of military fighting vehicles','30',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','3040','Manufacture of military fighting vehicles','Manufacture of tanks, armoured amphibious vehicles and other military fighting vehicles','304',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','309','Manufacture of transport equipment n.e.c.','Manufacture of transport equipment not elsewhere classified','30',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','3091','Manufacture of motorcycles','Manufacture of motorcycles, mopeds, powered cycles, sidecars, engines and parts thereof','309',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','3092','Manufacture of bicycles and invalid carriages','Manufacture of bicycles, tricycles, invalid carriages, baby carriages and parts thereof','309',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','3099','Manufacture of other transport equipment n.e.c.','Manufacture of other transport equipment including animal drawn vehicles, wheelbarrows, shopping carts','309',4,true,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- Divisions 31-33: Furniture, Other manufacturing, Repair/Installation
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('isic','310','Manufacture of furniture','Manufacture of furniture for all purposes and materials','31',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','3100','Manufacture of furniture','Manufacture of household, office, kitchen, bedroom, shop, restaurant, garden and special furniture','310',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','321','Manufacture of jewellery, bijouterie and related articles','Manufacture of jewellery, bijouterie and related articles','32',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','3211','Manufacture of jewellery and related articles','Manufacture of jewellery and related articles of precious metals, precious stones and pearls','321',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','3212','Manufacture of imitation jewellery and related articles','Manufacture of imitation jewellery and related fashion accessories','321',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','322','Manufacture of musical instruments','Manufacture of musical instruments','32',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','3220','Manufacture of musical instruments','Manufacture of stringed, wind, keyboard, percussion, electronic and other musical instruments','322',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','323','Manufacture of sports goods','Manufacture of sports goods','32',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','3230','Manufacture of sports goods','Manufacture of articles and equipment for sports, outdoor and indoor games and athletics','323',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','324','Manufacture of games and toys','Manufacture of games and toys','32',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','3240','Manufacture of games and toys','Manufacture of dolls, toys, puzzles, playing cards, board games and electronic games','324',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','325','Manufacture of medical and dental instruments and supplies','Manufacture of medical and dental instruments and supplies','32',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','3250','Manufacture of medical and dental instruments and supplies','Manufacture of surgical, medical, dental instruments, orthopaedic appliances, prostheses and supplies','325',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','329','Other manufacturing n.e.c.','Other manufacturing not elsewhere classified','32',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','3290','Other manufacturing n.e.c.','Manufacture of brooms, brushes, pens, pencils, buttons, fasteners, umbrellas, lighters and other articles n.e.c.','329',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','331','Repair of fabricated metal products, machinery and equipment','Repair of fabricated metal products, machinery and equipment','33',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','3311','Repair of fabricated metal products','Repair of fabricated metal products including welding repair and reconditioning of metal containers','331',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','3312','Repair of machinery','Repair and maintenance of industrial machinery, engines, turbines, pumps and other equipment','331',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','3313','Repair of electronic and optical equipment','Repair and maintenance of electronic and optical equipment including measuring and testing equipment','331',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','3314','Repair of electrical equipment','Repair and maintenance of electrical equipment including generators, transformers and wiring devices','331',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','3315','Repair of transport equipment, except motor vehicles','Repair and maintenance of transport equipment except motor vehicles including ships, aircraft, rail','331',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','3319','Repair of other equipment','Repair of other equipment not elsewhere classified including musical instruments, sports goods','331',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','332','Installation of industrial machinery and equipment','Installation of industrial machinery and equipment','33',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','3320','Installation of industrial machinery and equipment','Installation of industrial machinery, equipment, control systems and assembly of prefabricated structures','332',4,true,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- ============================================================================
-- Section D — Electricity, Gas, Steam and Air Conditioning Supply (35)
-- ============================================================================
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('isic','351','Electric power generation, transmission and distribution','Electric power generation, transmission and distribution','35',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','3510','Electric power generation, transmission and distribution','Generation, transmission, distribution of electric power from fossil, nuclear, hydro, solar and other sources','351',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','352','Manufacture of gas; distribution of gaseous fuels through mains','Manufacture of gas; distribution of gaseous fuels through mains','35',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','3520','Manufacture of gas; distribution of gaseous fuels through mains','Manufacture and distribution of gaseous fuels including natural gas, synthetic gas and LPG through mains','352',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','353','Steam and air conditioning supply','Steam and air conditioning supply','35',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','3530','Steam and air conditioning supply','Production, collection and distribution of steam and hot water for heating, cooling and power','353',4,true,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- ============================================================================
-- Section E — Water Supply; Sewerage, Waste Management and Remediation (36-39)
-- ============================================================================
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('isic','360','Water collection, treatment and supply','Water collection, treatment and supply','36',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','3600','Water collection, treatment and supply','Collection, purification, treatment, desalination, and distribution of water for domestic and industrial use','360',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','370','Sewerage','Sewerage collection, treatment and disposal','37',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','3700','Sewerage','Operation of sewerage systems, collection, treatment and disposal of waste water and sewage sludge','370',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','381','Waste collection','Waste collection','38',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','3811','Collection of non-hazardous waste','Collection of non-hazardous recyclable and non-recyclable municipal and commercial waste','381',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','3812','Collection of hazardous waste','Collection of hazardous medical, biological, chemical, nuclear, and other dangerous waste','381',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','382','Waste treatment and disposal','Waste treatment and disposal','38',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','3821','Treatment and disposal of non-hazardous waste','Treatment and disposal of non-hazardous waste through landfill, incineration and other methods','382',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','3822','Treatment and disposal of hazardous waste','Treatment, disposal and storage of hazardous waste including contaminated soil and radioactive waste','382',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','383','Materials recovery','Materials recovery and recycling','38',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','3830','Materials recovery','Processing of metal and non-metal waste and scrap into secondary raw materials for recycling','383',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','390','Remediation activities and other waste management services','Remediation activities and other waste management services','39',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','3900','Remediation activities and other waste management services','Clean-up of contaminated buildings, sites, soil, ground and surface water; mine decommissioning','390',4,true,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- ============================================================================
-- Section F — Construction (41-43)
-- ============================================================================
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('isic','410','Construction of buildings','Construction of buildings','41',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','4100','Construction of buildings','Construction of all types of residential and non-residential buildings including extensions and repairs','410',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','421','Construction of roads and railways','Construction of roads and railways','42',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','4210','Construction of roads and railways','Construction of highways, streets, bridges, tunnels, railways, airfield runways and related facilities','421',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','422','Construction of utility projects','Construction of utility projects','42',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','4220','Construction of utility projects','Construction of utility projects for water, sewage, gas, oil, power, and telecommunications networks','422',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','429','Construction of other civil engineering projects','Construction of other civil engineering projects','42',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','4290','Construction of other civil engineering projects','Construction of waterways, harbours, dams, irrigation, and other civil engineering projects n.e.c.','429',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','431','Demolition and site preparation','Demolition and site preparation','43',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','4311','Demolition','Demolition and wrecking of buildings and other structures','431',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','4312','Site preparation','Site preparation including excavation, earthmoving, land drainage, and clearing activities','431',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','432','Electrical, plumbing and other construction installation activities','Electrical, plumbing and other construction installation','43',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','4321','Electrical installation','Electrical installation including wiring, telecommunications, fire alarm and security systems','432',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','4322','Plumbing, heat and air-conditioning installation','Plumbing, heat, air conditioning, gas fitting, sprinkler and ventilation installation','432',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','4329','Other construction installation','Other construction installation activities including insulation, fencing, lifts, and escalators','432',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','433','Building completion and finishing','Building completion and finishing','43',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','4330','Building completion and finishing','Interior and exterior plastering, painting, glazing, floor laying, tiling and other building finishing','433',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','439','Other specialized construction activities','Other specialized construction activities','43',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','4390','Other specialized construction activities','Specialized construction activities including roofing, foundation work, scaffolding, concrete work','439',4,true,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- ============================================================================
-- Section G — Wholesale and Retail Trade (45-47)
-- ============================================================================

-- Division 45: Motor vehicles
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('isic','451','Sale of motor vehicles','Sale of motor vehicles','45',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','4510','Sale of motor vehicles','Wholesale and retail sale of new and used motor vehicles including cars, trucks, buses','451',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','452','Maintenance and repair of motor vehicles','Maintenance and repair of motor vehicles','45',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','4520','Maintenance and repair of motor vehicles','Maintenance, repair, washing, polishing, painting, and towing of motor vehicles','452',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','453','Sale of motor vehicle parts and accessories','Sale of motor vehicle parts and accessories','45',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','4530','Sale of motor vehicle parts and accessories','Wholesale and retail sale of motor vehicle parts, accessories, tyres and inner tubes','453',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','454','Sale, maintenance and repair of motorcycles and related parts and accessories','Sale, maintenance and repair of motorcycles and related parts and accessories','45',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','4540','Sale, maintenance and repair of motorcycles and related parts and accessories','Sale, maintenance and repair of motorcycles, parts and accessories; sale of related accessories','454',4,true,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- Division 46: Wholesale trade
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('isic','461','Wholesale on a fee or contract basis','Wholesale on a fee or contract basis','46',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','4610','Wholesale on a fee or contract basis','Wholesale trade by commission agents, commodity brokers, auctioneers and other agents','461',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','462','Wholesale of agricultural raw materials and live animals','Wholesale of agricultural raw materials and live animals','46',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','4620','Wholesale of agricultural raw materials and live animals','Wholesale of grains, seeds, flowers, plants, live animals, hides, skins, and raw agricultural products','462',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','463','Wholesale of food, beverages and tobacco','Wholesale of food, beverages and tobacco','46',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','4630','Wholesale of food, beverages and tobacco','Wholesale of dairy, eggs, oils, fats, meat, fish, confectionery, beverages, tobacco and other foods','463',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','464','Wholesale of household goods','Wholesale of household goods','46',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','4641','Wholesale of textiles, clothing and footwear','Wholesale of textiles, clothing, footwear, haberdashery and related products','464',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','4649','Wholesale of other household goods','Wholesale of household furniture, lighting, appliances, cutlery, crockery and other household goods','464',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','465','Wholesale of machinery, equipment and supplies','Wholesale of machinery, equipment and supplies','46',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','4651','Wholesale of computers, computer peripheral equipment and software','Wholesale of computers, peripheral equipment, software, and electronic parts','465',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','4652','Wholesale of electronic and telecommunications equipment and parts','Wholesale of electronic and telecommunications parts and equipment','465',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','4653','Wholesale of agricultural machinery, equipment and supplies','Wholesale of agricultural machinery, equipment, and supplies','465',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','4659','Wholesale of other machinery and equipment','Wholesale of other machinery, equipment, and supplies not elsewhere classified','465',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','466','Other specialized wholesale','Other specialized wholesale trade','46',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','4661','Wholesale of solid, liquid and gaseous fuels and related products','Wholesale of solid, liquid and gaseous fuels and related products','466',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','4662','Wholesale of metals and metal ores','Wholesale of metals and metal ores','466',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','4663','Wholesale of construction materials, hardware, plumbing and heating equipment and supplies','Wholesale of construction materials, hardware, plumbing and heating equipment and supplies','466',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','4669','Wholesale of waste and scrap and other products n.e.c.','Wholesale of waste, scrap, chemical products, and other specialized goods n.e.c.','466',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','469','Non-specialized wholesale trade','Non-specialized wholesale trade','46',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','4690','Non-specialized wholesale trade','Wholesale of a variety of goods without particular specialization','469',4,true,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- Division 47: Retail trade
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('isic','471','Retail sale in non-specialized stores','Retail sale in non-specialized stores','47',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','4711','Retail sale in non-specialized stores with food, beverages or tobacco predominating','Retail sale with food, beverages or tobacco predominating in non-specialized stores','471',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','4719','Other retail sale in non-specialized stores','Other retail sale in non-specialized stores including department stores','471',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','472','Retail sale of food, beverages and tobacco in specialized stores','Retail sale of food, beverages and tobacco in specialized stores','47',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','4721','Retail sale of food in specialized stores','Retail sale of fresh and preserved fruit, vegetables, and potatoes in specialized stores','472',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','4722','Retail sale of beverages in specialized stores','Retail sale of meat, meat products, poultry, and game in specialized stores','472',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','4723','Retail sale of tobacco products in specialized stores','Retail sale of fish, crustaceans, molluscs and other seafood in specialized stores','472',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','473','Retail sale of automotive fuel in specialized stores','Retail sale of automotive fuel in specialized stores','47',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','4730','Retail sale of automotive fuel in specialized stores','Retail sale of fuel for motor vehicles and motorcycles including filling station activities','473',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','474','Retail sale of information and communications equipment in specialized stores','Retail sale of information and communications equipment in specialized stores','47',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','4741','Retail sale of computers, peripheral units, software and telecommunications equipment in specialized stores','Retail sale of computers, peripheral units, software, and related accessories','474',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','4742','Retail sale of audio and video equipment in specialized stores','Retail sale of audio and video equipment, recordings, tapes, CDs and DVDs','474',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','475','Retail sale of other household equipment in specialized stores','Retail sale of other household equipment in specialized stores','47',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','4751','Retail sale of textiles in specialized stores','Retail sale of textiles, curtains, bed covers, wall hangings and haberdashery in specialized stores','475',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','4752','Retail sale of hardware, paints and glass in specialized stores','Retail sale of hardware, paints, glass, tools, and building materials in specialized stores','475',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','4753','Retail sale of carpets, rugs, wall and floor coverings in specialized stores','Retail sale of carpets, rugs, wall and floor coverings in specialized stores','475',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','4759','Retail sale of electrical household appliances, furniture, lighting equipment and other household articles in specialized stores','Retail sale of furniture, lighting, kitchen appliances, tableware and other household articles','475',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','476','Retail sale of cultural and recreation goods in specialized stores','Retail sale of cultural and recreation goods in specialized stores','47',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','4761','Retail sale of books, newspapers and stationary in specialized stores','Retail sale of books, newspapers, magazines, and stationery in specialized stores','476',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','4762','Retail sale of music and video recordings in specialized stores','Retail sale of music and video recordings in specialized stores','476',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','4763','Retail sale of sporting equipment in specialized stores','Retail sale of sporting equipment, fishing gear, camping and outdoor goods in specialized stores','476',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','4764','Retail sale of games and toys in specialized stores','Retail sale of games, toys, hobby, and leisure articles in specialized stores','476',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','477','Retail sale of other goods in specialized stores','Retail sale of other goods in specialized stores','47',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','4771','Retail sale of clothing, footwear and leather articles in specialized stores','Retail sale of clothing, footwear, and leather articles in specialized stores','477',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','4772','Retail sale of pharmaceutical and medical goods, cosmetic and toilet articles in specialized stores','Retail sale of pharmaceutical products, medical goods, cosmetics and toilet articles','477',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','4773','Other retail sale of new goods in specialized stores','Other retail sale of new goods in specialized stores including watches, jewellery, flowers, pets','477',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','4774','Retail sale of second-hand goods','Retail sale of second-hand goods including antiques, used books, used clothing and flea markets','477',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','478','Retail sale via stalls and markets','Retail sale via stalls, markets and non-store channels','47',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','4781','Retail sale via stalls and markets of food, beverages and tobacco products','Retail sale of food, beverages and tobacco via stalls, markets, door-to-door and vending machines','478',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','4782','Retail sale via stalls and markets of textiles, clothing and footwear','Retail sale of textile, clothing and footwear via stalls, markets, and non-store channels','478',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','4789','Retail sale via stalls and markets of other goods','Retail sale of other goods via stalls, markets, mail order, internet, vending machines and direct sale','478',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','479','Retail trade not in stores, stalls or markets','Retail trade not in stores, stalls or markets','47',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','4791','Retail sale via mail order houses or via Internet','Retail sale via mail order houses, internet, television, radio, telephone and similar channels','479',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','4799','Other retail sale not in stores, stalls or markets','Other retail sale not in stores, stalls or markets including direct-selling agents and auctioneers','479',4,true,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- ============================================================================
-- Section H — Transportation and Storage (49-53)
-- ============================================================================
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('isic','491','Transport via railways','Transport via railways','49',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','4911','Passenger rail transport, interurban','Passenger rail transport via intercity, commuter, and suburban rail networks','491',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','4912','Freight rail transport','Freight rail transport including intermodal container transport on mainline networks','491',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','492','Other land transport','Other land transport','49',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','4921','Urban and suburban passenger land transport','Urban and suburban passenger land transport via bus, tramway, trolleybus, and metro systems','492',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','4922','Other passenger land transport','Other passenger land transport including taxi, charter bus, funicular, telpher operations','492',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','4923','Freight transport by road','Freight transport by road including removal services, logging haulage, and livestock transport','492',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','493','Transport via pipeline','Transport via pipeline','49',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','4930','Transport via pipeline','Transport of gases, liquids, slurry and other commodities via pipelines','493',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','501','Sea and coastal water transport','Sea and coastal water transport','50',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','5011','Sea and coastal passenger water transport','Sea and coastal passenger water transport on scheduled and non-scheduled services','501',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','5012','Sea and coastal freight water transport','Sea and coastal freight water transport including towing by tugboats','501',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','502','Inland water transport','Inland water transport','50',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','5021','Inland passenger water transport','Inland passenger water transport on rivers, canals, lakes and within port systems','502',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','5022','Inland freight water transport','Inland freight water transport on rivers, canals, and within port and harbour systems','502',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','511','Passenger air transport','Passenger air transport','51',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','5110','Passenger air transport','Passenger air transport on scheduled and non-scheduled routes for fare-paying passengers','511',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','512','Freight air transport','Freight air transport and space transport','51',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','5120','Freight air transport','Freight air transport on scheduled and non-scheduled services; space transport of cargo and passengers','512',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','521','Warehousing and storage','Warehousing and storage','52',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','5210','Warehousing and storage','Operation of warehousing, storage, cold storage, grain silos, and bonded warehouse facilities','521',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','522','Support activities for transportation','Support activities for transportation','52',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','5221','Service activities incidental to land transportation','Service activities related to land transportation including operation of terminals and parking facilities','522',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','5222','Service activities incidental to water transportation','Service activities related to water transportation including harbour operations, navigation and pilotage','522',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','5223','Service activities incidental to air transportation','Service activities related to air transportation including airport operation and air traffic control','522',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','5224','Cargo handling','Cargo handling including loading, unloading, and transfer of goods at terminals and docks','522',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','5229','Other transportation support activities','Other transportation support including freight forwarding, brokerage, ship surveying, and weighing','522',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','531','Postal activities','Postal activities under universal service obligation','53',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','5310','Postal activities','Pick-up, transport and delivery of letters, parcels under national or international postal service obligation','531',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','532','Courier activities','Courier activities outside universal postal service','53',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','5320','Courier activities','Pick-up, transport and delivery of letters, documents and parcels by firms not under universal service obligation','532',4,true,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- ============================================================================
-- Section I — Accommodation and Food Service Activities (55-56)
-- ============================================================================
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('isic','551','Short term accommodation activities','Short-stay accommodation','55',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','5510','Short term accommodation activities','Provision of short-stay accommodation in hotels, motels, resort hotels, boarding houses and similar','551',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','552','Camping grounds, recreational vehicle parks and trailer parks','Camping grounds, recreational vehicle parks and trailer parks','55',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','5520','Camping grounds, recreational vehicle parks and trailer parks','Provision of accommodation in camping grounds, recreational vehicle parks and trailer parks','552',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','559','Other accommodation','Other accommodation','55',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','5590','Other accommodation','Provision of accommodation in hostels, holiday camps, holiday centres, camping facilities and other lodging','559',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','561','Restaurants and mobile food service activities','Restaurants and mobile food service activities','56',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','5610','Restaurants and mobile food service activities','Provision of meals for immediate consumption in restaurants, cafeterias, fast-food outlets and take-away facilities','561',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','562','Event catering and other food service activities','Event catering and other food service activities','56',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','5621','Event catering','Event catering for parties, banquets, conventions, receptions and similar events','562',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','5629','Other food service activities','Other food service activities including canteens, cafeterias and catering within businesses and institutions','562',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','563','Beverage serving activities','Beverage serving activities','56',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','5630','Beverage serving activities','Serving of beverages for consumption on the premises in bars, pubs, nightclubs, and similar','563',4,true,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- ============================================================================
-- Section J — Information and Communication (58-63)
-- ============================================================================
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('isic','581','Publishing of books, periodicals and other publishing activities','Publishing of books, periodicals and other publishing activities','58',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','5811','Book publishing','Publishing of books, brochures, leaflets, encyclopaedias, atlases and maps in print or electronic form','581',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','5812','Publishing of directories and mailing lists','Publishing of directories, mailing lists, telephone books, and other compilations of facts and information','581',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','5813','Publishing of newspapers, journals and periodicals','Publishing of newspapers, journals, and periodicals in print or electronic form','581',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','5819','Other publishing activities','Other publishing including publishing of photos, postcards, greeting cards, timetables and calendars','581',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','582','Software publishing','Software publishing','58',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','5820','Software publishing','Publishing of ready-made software including operating systems, business applications, and games','582',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','591','Motion picture, video and television programme activities','Motion picture, video and television programme activities','59',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','5911','Motion picture, video and television programme production activities','Motion picture, video and television programme production for theatrical release, TV, and commercials','591',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','5912','Motion picture, video and television programme post-production activities','Motion picture, video and television programme post-production including editing, dubbing and subtitling','591',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','5913','Motion picture, video and television programme distribution activities','Motion picture, video and television programme distribution to cinemas, networks and exhibitors','591',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','5914','Motion picture projection activities','Motion picture projection activities in cinemas, drive-ins, outdoor theatres and cine-clubs','591',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','592','Sound recording and music publishing activities','Sound recording and music publishing','59',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','5920','Sound recording and music publishing activities','Sound recording, production of master recordings, and release of musical compositions and sound recordings','592',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','601','Radio broadcasting','Radio broadcasting','60',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','6010','Radio broadcasting','Broadcasting of audio signals through radio studios and facilities over-the-air, satellite or internet','601',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','602','Television programming and broadcasting activities','Television programming and broadcasting','60',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','6020','Television programming and broadcasting activities','Creation, production and broadcasting of television programmes over-the-air, satellite, cable or internet','602',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','611','Wired telecommunications activities','Wired telecommunications activities','61',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','6110','Wired telecommunications activities','Operating, maintaining and providing access to wired telecommunications networks and infrastructure','611',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','612','Wireless telecommunications activities','Wireless telecommunications activities','61',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','6120','Wireless telecommunications activities','Operating, maintaining and providing access to wireless telecommunications networks and infrastructure','612',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','613','Satellite telecommunications activities','Satellite telecommunications activities','61',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','6130','Satellite telecommunications activities','Operating, maintaining and providing access to satellite telecommunications networks and infrastructure','613',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','619','Other telecommunications activities','Other telecommunications activities','61',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','6190','Other telecommunications activities','Provision of telecommunications services over existing infrastructure including internet, VoIP and resale','619',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','620','Computer programming, consultancy and related activities','Computer programming, consultancy and related activities','62',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','6201','Computer programming activities','Writing, modifying, testing of computer programs and software to meet user needs','620',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','6202','Computer consultancy and computer facilities management activities','Planning and design of computer systems integrating hardware, software, and communication technologies','620',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','6209','Other information technology and computer service activities','Other information technology and computer service activities not elsewhere classified','620',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','631','Data processing, hosting and related activities; web portals','Data processing, hosting and related activities; web portals','63',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','6311','Data processing, hosting and related activities','Data processing, hosting, and related activities including application service provisioning and web hosting','631',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','6312','Web portals','Operation and maintenance of web search portals and internet-based information platforms','631',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','639','Other information service activities','Other information service activities','63',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','6391','News agency activities','Activities of news agencies and press clipping services; news syndication','639',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','6399','Other information service activities n.e.c.','Other information service activities including telephone-based information, computer search services n.e.c.','639',4,true,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- ============================================================================
-- Section K — Financial and Insurance Activities (64-66)
-- ============================================================================
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('isic','641','Monetary intermediation','Monetary intermediation','64',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','6411','Central banking','Central banking activities including issuing currency, managing reserves, and monetary policy','641',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','6419','Other monetary intermediation','Other monetary intermediation including accepting deposits and granting loans by banks and savings institutions','641',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','642','Activities of holding companies','Activities of holding companies','64',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','6420','Activities of holding companies','Activities of holding companies that hold assets of subsidiary companies for controlling purposes','642',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','643','Trusts, funds and similar financial entities','Trusts, funds and similar financial entities','64',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','6430','Trusts, funds and similar financial entities','Activities of trusts, funds and similar financial entities including investment trusts and pension funds','643',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','649','Other financial service activities, except insurance and pension funding activities','Other financial service activities except insurance and pension funding','64',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','6491','Financial leasing','Financial leasing including lease financing of equipment, vehicles, and machinery','649',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','6492','Other credit granting','Other credit granting including consumer finance, pawnbroking, and lending outside banking','649',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','6499','Other financial service activities, except insurance and pension funding activities, n.e.c.','Other financial service activities including securities dealing, venture capital, and own-account investment','649',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','651','Insurance','Insurance','65',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','6511','Life insurance','Life insurance and reinsurance with a predominant life insurance component','651',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','6512','Non-life insurance','Non-life insurance including health, motor, fire, marine, aviation and other property/casualty insurance','651',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','652','Reinsurance','Reinsurance','65',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','6520','Reinsurance','Assumption of all or part of risk from insurance companies or self-insured parties','652',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','653','Pension funding','Pension funding','65',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','6530','Pension funding','Operation of pension and retirement benefit plans providing income benefits for plan participants','653',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','661','Activities auxiliary to financial service activities, except insurance and pension funding','Activities auxiliary to financial service activities except insurance and pension funding','66',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','6611','Administration of financial markets','Administration of financial markets including stock, commodity, and derivatives exchanges','661',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','6612','Security and commodity contracts brokerage','Security and commodity contracts brokerage and dealing activities','661',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','6619','Other activities auxiliary to financial service activities','Other activities auxiliary to financial services including financial advisory, mortgage brokerage','661',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','662','Activities auxiliary to insurance and pension funding','Activities auxiliary to insurance and pension funding','66',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','6621','Risk and damage evaluation','Risk and damage evaluation, claims adjusting, loss assessment, and salvage administration','662',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','6622','Activities of insurance agents and brokers','Activities of insurance agents and brokers in selling and placing insurance policies','662',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','6629','Other activities auxiliary to insurance and pension funding','Other activities auxiliary to insurance and pension funding including actuarial and salvage services','662',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','663','Fund management activities','Fund management activities','66',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','6630','Fund management activities','Portfolio management, fund management, and other financial fund operating activities','663',4,true,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- ============================================================================
-- Section L — Real Estate Activities (68)
-- ============================================================================
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('isic','681','Real estate activities with own or leased property','Real estate activities with own or leased property','68',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','6810','Real estate activities with own or leased property','Buying, selling, renting and operating of own or leased real estate including apartments and offices','681',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','682','Real estate activities on a fee or contract basis','Real estate activities on a fee or contract basis','68',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','6820','Real estate activities on a fee or contract basis','Real estate agency, management of real estate on a fee or contract basis, and appraisal services','682',4,true,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- ============================================================================
-- Section M — Professional, Scientific and Technical Activities (69-75)
-- ============================================================================
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('isic','691','Legal activities','Legal activities','69',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','6910','Legal activities','Legal representation, advice, preparation of legal documents, arbitration, mediation, and patent activities','691',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','692','Accounting, bookkeeping and auditing activities; tax consultancy','Accounting, bookkeeping and auditing activities; tax consultancy','69',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','6920','Accounting, bookkeeping and auditing activities; tax consultancy','Recording, bookkeeping, auditing, tax consulting, and preparation of financial statements','692',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','701','Activities of head offices','Activities of head offices','70',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','7010','Activities of head offices','Overseeing, planning, and directing operations of a company or enterprise from head offices','701',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','702','Management consultancy activities','Management consultancy activities','70',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','7020','Management consultancy activities','Provision of advice, guidance and operational assistance on management issues and business strategy','702',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','711','Architectural and engineering activities and related technical consultancy','Architectural and engineering activities and related technical consultancy','71',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','7110','Architectural and engineering activities and related technical consultancy','Architectural, engineering, technical testing, surveying, cartographic and related design and consultancy','711',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','712','Technical testing and analysis','Technical testing and analysis','71',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','7120','Technical testing and analysis','Physical, chemical, biological testing and analysis of materials, products, processes and the environment','712',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','721','Research and experimental development on natural sciences and engineering','Research and experimental development on natural sciences and engineering','72',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','7210','Research and experimental development on natural sciences and engineering','Research and experimental development in natural sciences, mathematics, engineering, and medical sciences','721',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','722','Research and experimental development on social sciences and humanities','Research and experimental development on social sciences and humanities','72',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','7220','Research and experimental development on social sciences and humanities','Research and experimental development in social sciences, economics, psychology, language and arts','722',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','731','Advertising','Advertising','73',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','7310','Advertising','Creation and placement of advertising in media including campaigns, outdoor advertising and promotion','731',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','732','Market research and public opinion polling','Market research and public opinion polling','73',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','7320','Market research and public opinion polling','Investigation of market potential, awareness, opinions and buying habits of consumers','732',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','741','Specialized design activities','Specialized design activities','74',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','7410','Specialized design activities','Fashion, industrial, graphic, interior decoration and other specialized design activities','741',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','742','Photographic activities','Photographic activities','74',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','7420','Photographic activities','Commercial and consumer photography, film processing, aerial photography and videography services','742',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','749','Other professional, scientific and technical activities n.e.c.','Other professional, scientific and technical activities not elsewhere classified','74',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','7490','Other professional, scientific and technical activities n.e.c.','Translation, interpretation, environmental consulting, quantity surveying and other technical activities n.e.c.','749',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','750','Veterinary activities','Veterinary activities','75',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','7500','Veterinary activities','Medical and surgical treatment of animals, veterinary laboratory services, ambulance, and boarding','750',4,true,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- ============================================================================
-- Section N — Administrative and Support Service Activities (77-82)
-- ============================================================================
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('isic','771','Renting and leasing of motor vehicles','Renting and leasing of motor vehicles','77',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','7710','Renting and leasing of motor vehicles','Renting and leasing of cars, trucks, buses, and other motor vehicles without drivers','771',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','772','Renting and leasing of personal and household goods','Renting and leasing of personal and household goods','77',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','7721','Renting and leasing of recreational and sports goods','Renting and leasing of recreational and sports equipment including bicycles, beach chairs, and boats','772',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','7722','Renting of video tapes and disks','Renting of video tapes, records, CDs, DVDs, and related entertainment equipment','772',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','7729','Renting and leasing of other personal and household goods','Renting of personal and household goods n.e.c. including textiles, costumes, furniture, jewellery','772',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','773','Renting and leasing of other machinery, equipment and tangible goods','Renting and leasing of other machinery, equipment and tangible goods','77',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','7730','Renting and leasing of other machinery, equipment and tangible goods','Renting and leasing of agricultural, construction, office, computer, transport and other machinery','773',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','774','Leasing of intellectual property and similar products, except copyrighted works','Leasing of intellectual property and similar products','77',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','7740','Leasing of intellectual property and similar products, except copyrighted works','Licensing of rights to use intellectual property including patents, trademarks, franchises and copyrights','774',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','781','Activities of employment placement agencies','Activities of employment placement agencies','78',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','7810','Activities of employment placement agencies','Activities of employment placement agencies and executive search services','781',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','782','Temporary employment agency activities','Temporary employment agency activities','78',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','7820','Temporary employment agency activities','Temporary employment agency activities providing workers to client businesses','782',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','783','Other human resources provision','Other human resources provision','78',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','7830','Other human resources provision','Other human resources provision including long-term labour supply and co-employment services','783',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','791','Travel agency and tour operator activities','Travel agency and tour operator activities','79',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','7911','Travel agency activities','Travel agency activities including arranging transport, accommodation, and tours for travellers','791',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','7912','Tour operator activities','Tour operator activities including arranging and assembling package tours for sale','791',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','799','Other reservation service and related activities','Other reservation service and related activities','79',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','7990','Other reservation service and related activities','Other reservation services including booking of tickets, accommodation, restaurants, and car rental','799',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','801','Private security activities','Private security activities','80',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','8010','Private security activities','Private investigation, guard, patrol, armoured transport, lie detection and fingerprinting services','801',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','802','Security systems service activities','Security systems service activities','80',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','8020','Security systems service activities','Installation, repair, monitoring and remote control of electronic security and alarm systems','802',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','803','Investigation activities','Investigation activities','80',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','8030','Investigation activities','Private investigation and detective services including surveillance, background and credit checks','803',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','811','Combined facilities support activities','Combined facilities support activities','81',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','8110','Combined facilities support activities','Provision of combined support services within a client facility including cleaning, maintenance and security','811',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','812','Cleaning activities','Cleaning activities','81',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','8121','General cleaning of buildings','General cleaning of buildings including offices, factories, shops, and institutions','812',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','8129','Other building and industrial cleaning activities','Other cleaning activities including exterior building cleaning, chimney, furnace and swimming pool cleaning','812',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','813','Landscape care and maintenance service activities','Landscape care and maintenance service activities','81',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','8130','Landscape care and maintenance service activities','Planting, care and maintenance of parks, gardens, greenery for buildings, highways and sports grounds','813',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','821','Office administrative and support activities','Office administrative and support activities','82',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','8211','Combined office administrative service activities','Combined office administrative service activities including reception, planning, billing and record keeping','821',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','8219','Photocopying, document preparation and other specialized office support activities','Photocopying, document preparation, mailing, and other specialized office support activities','821',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','822','Activities of call centres','Activities of call centres','82',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','8220','Activities of call centres','Answering calls using automatic distribution, computer telephony integration and interactive voice systems','822',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','823','Organization of conventions and trade shows','Organization of conventions and trade shows','82',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','8230','Organization of conventions and trade shows','Organization, management and promotion of events such as conventions, conferences, and trade shows','823',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','829','Business support service activities n.e.c.','Business support service activities not elsewhere classified','82',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','8291','Activities of collection agencies and credit bureaus','Activities of collection agencies, credit bureaus, and credit rating agencies','829',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','8292','Packaging activities','Packaging and bottling activities on a fee or contract basis for third parties','829',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','8299','Other business support service activities n.e.c.','Other business support service activities including court reporting, stenographic, and billing services n.e.c.','829',4,true,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- ============================================================================
-- Section O — Public Administration and Defence (84)
-- ============================================================================
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('isic','841','Administration of the State and the economic and social policy of the community','Administration of the State and the economic and social policy of the community','84',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','8411','General public administration activities','General public administration activities of government including executive, legislative, taxation and budget','841',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','8412','Regulation of the activities of providing health care, education, cultural services and other social services, excluding social security','Regulation of health care, education, cultural, and other social services excluding social security','841',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','8413','Regulation of and contribution to more efficient operation of businesses','Regulation and contribution to efficient operation of businesses and the labour market','841',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','842','Provision of services to the community as a whole','Provision of services to the community as a whole','84',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','8421','Foreign affairs','Foreign affairs activities including diplomatic, consular, and international organization missions','842',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','8422','Defence activities','Military defence activities including land, sea, air and space defence forces','842',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','8423','Public order and safety activities','Public order and safety activities including police, fire, border guard, coast guard, and civil protection','842',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','843','Compulsory social security activities','Compulsory social security activities','84',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','8430','Compulsory social security activities','Compulsory social security including government-funded pension, health, unemployment and disability schemes','843',4,true,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- ============================================================================
-- Section P — Education (85)
-- ============================================================================
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('isic','851','Pre-primary and primary education','Pre-primary and primary education','85',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','8510','Pre-primary and primary education','Pre-primary, primary and elementary education providing basic academic instruction','851',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','852','Secondary education','Secondary education','85',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','8521','General secondary education','General secondary education providing lower and upper secondary instruction at the second level','852',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','8522','Technical and vocational secondary education','Technical and vocational secondary education at the second level combining general and specialized training','852',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','853','Higher education','Higher education','85',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','8530','Higher education','Post-secondary non-tertiary and tertiary education including bachelor, master and doctoral programmes','853',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','854','Other education','Other education','85',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','8541','Sports and recreation education','Sports and recreation education including sports instruction, camps, gymnastics, and martial arts','854',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','8542','Cultural education','Cultural education including fine arts, music, dance, drama, and photography instruction','854',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','8549','Other education n.e.c.','Other education not elsewhere classified including driving schools, language, IT and professional training','854',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','855','Educational support activities','Educational support activities','85',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','8550','Educational support activities','Non-instructional educational support including counselling, guidance, testing, and evaluation services','855',4,true,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- ============================================================================
-- Section Q — Human Health and Social Work Activities (86-88)
-- ============================================================================
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('isic','861','Hospital activities','Hospital activities','86',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','8610','Hospital activities','Hospital activities including short and long-term inpatient care, medical, diagnostic and treatment services','861',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','862','Medical and dental practice activities','Medical and dental practice activities','86',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','8620','Medical and dental practice activities','General and specialized medical and dental practice activities in private or outpatient settings','862',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','869','Other human health activities','Other human health activities','86',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','8690','Other human health activities','Paramedical, ambulance, nursing, physiotherapy, occupational therapy, and other health activities n.e.c.','869',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','871','Residential nursing care facilities','Residential nursing care facilities','87',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','8710','Residential nursing care facilities','Residential nursing care facilities providing inpatient nursing, rehabilitative, and health services','871',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','872','Residential care activities for mental retardation, mental health and substance abuse','Residential care activities for mental retardation, mental health and substance abuse','87',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','8720','Residential care activities for mental retardation, mental health and substance abuse','Residential care for persons with intellectual disabilities, mental illness, and substance dependence','872',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','873','Residential care activities for the elderly and disabled','Residential care activities for the elderly and disabled','87',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','8730','Residential care activities for the elderly and disabled','Residential care for the elderly and disabled providing lodging, food, supervision, and personal assistance','873',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','879','Other residential care activities','Other residential care activities','87',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','8790','Other residential care activities','Other residential care including orphanages, homeless shelters, halfway houses, and transitional housing','879',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','881','Social work activities without accommodation for the elderly and disabled','Social work activities without accommodation for the elderly and disabled','88',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','8810','Social work activities without accommodation for the elderly and disabled','Day care, home care, counselling, welfare, and other social work for elderly and disabled persons','881',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','889','Other social work activities without accommodation','Other social work activities without accommodation','88',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','8890','Other social work activities without accommodation','Child day care, adoption, disaster relief, vocational rehabilitation, and social work activities n.e.c.','889',4,true,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- ============================================================================
-- Section R — Arts, Entertainment and Recreation (90-93)
-- ============================================================================
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('isic','900','Creative, arts and entertainment activities','Creative, arts and entertainment activities','90',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','9000','Creative, arts and entertainment activities','Activities of performing artists, authors, composers, independent journalists, sculptors, and related creative activities','900',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','910','Libraries, archives, museums and other cultural activities','Libraries, archives, museums and other cultural activities','91',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','9101','Library and archives activities','Activities of libraries and archives including operation, cataloguing, lending and archive preservation','910',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','9102','Museums activities and operation of historical sites and buildings','Activities of museums including art galleries, and preservation of historical sites and buildings','910',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','9103','Botanical and zoological gardens and nature reserves activities','Activities of botanical and zoological gardens, nature reserves, and wildlife preservation','910',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','920','Gambling and betting activities','Gambling and betting activities','92',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','9200','Gambling and betting activities','Operation of gambling facilities and activities including casinos, lotteries, and off-track betting','920',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','931','Sports activities','Sports activities','93',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','9311','Operation of sports facilities','Operation of sports facilities including stadiums, arenas, swimming pools, golf courses, and rinks','931',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','9312','Activities of sports clubs','Activities of sports clubs and teams participating in live sporting events','931',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','9319','Other sports activities','Other sports activities including independent athletes, sports training, race course operation','931',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','932','Other amusement and recreation activities','Other amusement and recreation activities','93',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','9321','Activities of amusement parks and theme parks','Activities of amusement parks, theme parks, and other amusement attractions','932',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','9329','Other amusement and recreation activities n.e.c.','Other recreation including beach activities, recreation parks, pleasure cruises, dance halls, and games','932',4,true,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- ============================================================================
-- Section S — Other Service Activities (94-96)
-- ============================================================================
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('isic','941','Activities of business, employers and professional membership organizations','Activities of business, employers and professional membership organizations','94',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','9411','Activities of business and employers membership organizations','Activities of business and employers organizations including chambers of commerce and trade guilds','941',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','9412','Activities of professional membership organizations','Activities of professional organizations and associations promoting members professional interests','941',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','942','Activities of trade unions','Activities of trade unions','94',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','9420','Activities of trade unions','Activities of trade unions and associations of employees for collective bargaining and representation','942',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','949','Activities of other membership organizations','Activities of other membership organizations','94',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','9491','Activities of religious organizations','Activities of religious organizations including churches, mosques, synagogues, temples and monasteries','949',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','9492','Activities of political organizations','Activities of political parties and organizations for influencing government policy','949',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','9499','Activities of other membership organizations n.e.c.','Activities of other membership organizations including automobile, consumer and youth organizations','949',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','951','Repair of computers and communication equipment','Repair of computers and communication equipment','95',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','9511','Repair of computers and peripheral equipment','Repair and maintenance of computers, peripheral equipment, and personal digital assistants','951',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','9512','Repair of communication equipment','Repair and maintenance of communication equipment including mobile phones, modems and fax machines','951',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','952','Repair of personal and household goods','Repair of personal and household goods','95',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','9521','Repair of consumer electronics','Repair and maintenance of consumer electronic equipment including televisions, radios and CD players','952',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','9522','Repair of household appliances and home and garden equipment','Repair and maintenance of household appliances, garden and outdoor power equipment','952',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','9523','Repair of footwear and leather goods','Repair of footwear, leather goods, bags, luggage and similar items','952',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','9524','Repair of furniture and home furnishings','Repair and restoration of furniture and home furnishings','952',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','9529','Repair of other personal and household goods','Repair of bicycles, locks, musical instruments, and other personal and household goods n.e.c.','952',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','960','Other personal service activities','Other personal service activities','96',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','9601','Washing and (dry-) cleaning of textile and fur products','Washing, laundering, dry-cleaning, pressing and dyeing of textile and fur products','960',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','9602','Hairdressing and other beauty treatment','Hairdressing, barber activities, beauty treatment, manicure, pedicure, and spa services','960',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','9603','Funeral and related activities','Undertaking and funeral-related activities including burial, cremation and embalming services','960',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','9609','Other personal service activities n.e.c.','Other personal service activities including astrology, escort, matchmaking, pet care services n.e.c.','960',4,true,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- ============================================================================
-- Section T — Activities of Households as Employers (97-98)
-- ============================================================================
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('isic','970','Activities of households as employers of domestic personnel','Activities of households as employers of domestic personnel','97',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','9700','Activities of households as employers of domestic personnel','Employing domestic personnel such as maids, cooks, nannies, gardeners, secretaries and chauffeurs','970',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','981','Undifferentiated goods-producing activities of private households for own use','Undifferentiated goods-producing activities of private households for own use','98',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','9810','Undifferentiated goods-producing activities of private households for own use','Subsistence farming, weaving, dressmaking, food processing, and other goods production by households','981',4,true,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','982','Undifferentiated service-producing activities of private households for own use','Undifferentiated service-producing activities of private households for own use','98',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','9820','Undifferentiated service-producing activities of private households for own use','Cooking, teaching, childcare, and other domestic services by households for own consumption','982',4,true,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- ============================================================================
-- Section U — Activities of Extraterritorial Organizations and Bodies (99)
-- ============================================================================
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('isic','990','Activities of extraterritorial organizations and bodies','Activities of extraterritorial organizations and bodies','99',3,false,'active','00000000-0000-0000-0000-000000000000'),
  ('isic','9900','Activities of extraterritorial organizations and bodies','Activities of international organizations such as the United Nations, regional bodies and specialized agencies','990',4,true,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;
