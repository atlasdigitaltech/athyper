-- 900_seed_data/001_shared/009c_industry_code_naics_subsectors.sql
-- Seed: NAICS 2022 — Complete hierarchy (Sectors → Subsectors → Industry Groups)
-- Schema: shared | Table: industry_code
-- Self-contained: no external dependencies for NAICS data
-- Idempotent: ON CONFLICT (domain_code, code) DO UPDATE throughout

-- ============================================================================
-- NAICS 2022 — Sectors (Level 1)
-- ============================================================================
insert into shared.industry_code (domain_code, code, name, description, level_no, is_leaf, status, created_by)
values
  ('naics','11','Agriculture, Forestry, Fishing and Hunting','Crop production, animal production, forestry, fishing, hunting',1,false,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','21','Mining, Quarrying, and Oil and Gas Extraction','Oil/gas, mining, support activities for mining',1,false,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','22','Utilities','Electric power, natural gas, water, sewage',1,false,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','23','Construction','Building, heavy/civil engineering, specialty trade contractors',1,false,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','31','Manufacturing — Food, Beverage, Textile, Apparel','Food, beverage, tobacco, textile, apparel, leather manufacturing',1,false,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','32','Manufacturing — Wood, Paper, Petroleum, Chemical, Plastics','Wood, paper, petroleum, chemical, plastics, nonmetallic mineral manufacturing',1,false,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','33','Manufacturing — Metals, Machinery, Electronics, Transport','Primary metals, fabricated metals, machinery, computer, electrical, transport equipment',1,false,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','42','Wholesale Trade','Merchant wholesalers, electronic markets, agents and brokers',1,false,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','44','Retail Trade — Motor Vehicle, Furniture, Electronics, Building','Motor vehicle dealers, furniture, electronics, building material stores',1,false,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','45','Retail Trade — Food, Health, Clothing, General, Misc','Food/beverage, health/personal, clothing, general, miscellaneous stores',1,false,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','48','Transportation — Air, Rail, Water, Truck, Transit, Pipeline','Air, rail, water, truck, transit, pipeline transportation',1,false,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','49','Transportation — Postal, Courier, Warehousing','Postal service, couriers, warehousing and storage',1,false,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','51','Information','Publishing, motion picture, broadcasting, telecommunications, data processing',1,false,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','52','Finance and Insurance','Monetary authorities, credit intermediation, securities, insurance',1,false,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','53','Real Estate and Rental and Leasing','Real estate, rental and leasing services',1,false,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','54','Professional, Scientific, and Technical Services','Legal, accounting, architecture, engineering, computer, consulting, advertising, R&D',1,false,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','55','Management of Companies and Enterprises','Holding companies, head offices, management of companies',1,false,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','56','Administrative and Support and Waste Management','Office admin, employment, travel, security, cleaning, waste management',1,false,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','61','Educational Services','Elementary, secondary, colleges, universities, technical, educational support',1,false,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','62','Health Care and Social Assistance','Ambulatory, hospitals, nursing, residential care, social assistance',1,false,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','71','Arts, Entertainment, and Recreation','Performing arts, spectator sports, museums, amusement, gambling',1,false,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','72','Accommodation and Food Services','Accommodation, food services, and drinking places',1,false,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','81','Other Services (except Public Administration)','Repair, personal/laundry, religious, civic, professional organizations',1,false,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','92','Public Administration','Executive, legislative, judicial, administration, national security',1,false,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- ============================================================================
-- NAICS 2022 — Subsectors (Level 2, 3-digit codes)
-- ============================================================================

-- Sector 11: Agriculture, Forestry, Fishing and Hunting
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('naics','111','Crop Production','Oilseed, grain, vegetable, fruit, tree nut, greenhouse, and other crop farming','11',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','112','Animal Production and Aquaculture','Cattle, hog, poultry, sheep, goat, aquaculture, and other animal production','11',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','113','Forestry and Logging','Timber tract operations, forest nurseries, and logging','11',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','114','Fishing, Hunting and Trapping','Finfish, shellfish, and other marine fishing; hunting and trapping','11',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','115','Support Activities for Agriculture and Forestry','Soil preparation, crop harvesting, farm management, and forestry support','11',2,false,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- Sector 21: Mining, Quarrying, and Oil and Gas Extraction
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('naics','211','Oil and Gas Extraction','Crude petroleum and natural gas extraction, drilling, and support','21',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','212','Mining (except Oil and Gas)','Coal, metal ore, and nonmetallic mineral mining and quarrying','21',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','213','Support Activities for Mining','Drilling, exploration, and other support activities for mining','21',2,false,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- Sector 22: Utilities
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('naics','221','Utilities','Electric power generation/distribution, natural gas, water, and sewage systems','22',2,false,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- Sector 23: Construction
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('naics','236','Construction of Buildings','Residential and nonresidential building construction','23',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','237','Heavy and Civil Engineering Construction','Utility system, highway, bridge, and other heavy civil engineering construction','23',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','238','Specialty Trade Contractors','Foundation, structural, equipment, finishing, and other specialty trade contractors','23',2,false,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- Sector 31-33: Manufacturing
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('naics','311','Food Manufacturing','Animal food, grain milling, dairy, meat, seafood, bakery, and other food manufacturing','31',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','312','Beverage and Tobacco Product Manufacturing','Soft drink, brewery, winery, distillery, and tobacco product manufacturing','31',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','313','Textile Mills','Fiber, yarn, thread, fabric, and textile finishing mills','31',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','314','Textile Product Mills','Textile furnishings mills and other textile product mills','31',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','315','Apparel Manufacturing','Apparel knitting, cut-and-sew, and accessories manufacturing','31',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','316','Leather and Allied Product Manufacturing','Leather tanning, footwear, and allied product manufacturing','31',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','321','Wood Product Manufacturing','Sawmills, wood preservation, veneer, plywood, and other wood products','32',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','322','Paper Manufacturing','Pulp, paper, paperboard mills, and converted paper products','32',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','323','Printing and Related Support Activities','Commercial printing, support activities, and related services','32',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','324','Petroleum and Coal Products Manufacturing','Petroleum refining, asphalt, and coal product manufacturing','32',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','325','Chemical Manufacturing','Basic chemicals, resins, pharmaceuticals, paints, soaps, and other chemicals','32',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','326','Plastics and Rubber Products Manufacturing','Plastics product and rubber product manufacturing','32',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','327','Nonmetallic Mineral Product Manufacturing','Clay, glass, cement, concrete, lime, gypsum, and other mineral products','32',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','331','Primary Metal Manufacturing','Iron, steel, aluminum, nonferrous metals, and foundries','33',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','332','Fabricated Metal Product Manufacturing','Forging, cutlery, structural metals, hardware, springs, machine shops, coating','33',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','333','Machinery Manufacturing','Agricultural, industrial, commercial, HVAC, metalworking, and other machinery','33',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','334','Computer and Electronic Product Manufacturing','Computers, communications, audio/video, semiconductors, and instruments','33',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','335','Electrical Equipment, Appliance, and Component Manufacturing','Electric lighting, household appliances, and electrical equipment/components','33',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','336','Transportation Equipment Manufacturing','Motor vehicles, aerospace, railroad, ship, and other transportation equipment','33',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','337','Furniture and Related Product Manufacturing','Household, institutional, office furniture, and related products','33',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','339','Miscellaneous Manufacturing','Medical equipment and supplies, jewelry, sporting goods, and other manufacturing','33',2,false,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- Sector 42: Wholesale Trade
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('naics','423','Merchant Wholesalers, Durable Goods','Wholesale of motor vehicles, furniture, lumber, equipment, metals, electronics','42',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','424','Merchant Wholesalers, Nondurable Goods','Wholesale of paper, drugs, apparel, groceries, farm products, chemicals, petroleum','42',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','425','Wholesale Trade Agents and Brokers','Wholesale electronic markets, agents, and brokers','42',2,false,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- Sector 44-45: Retail Trade
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('naics','441','Motor Vehicle and Parts Dealers','New and used automobile dealers, other motor vehicle and parts retailers','44',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','444','Building Material and Garden Equipment and Supplies Dealers','Home centers, paint, hardware, building material, and garden supply retailers','44',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','445','Food and Beverage Retailers','Grocery stores, supermarkets, convenience stores, and specialty food retailers','44',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','449','Furniture, Home Furnishings, Electronics, and Appliance Retailers','Furniture, home furnishings, electronics, and appliance retailers','44',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','451','Sporting Goods, Hobby, Musical Instrument, Book, and Miscellaneous Retailers','Sporting goods, hobby, sewing, musical instrument, book, and miscellaneous retail','45',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','455','General Merchandise Retailers','Department stores, warehouse clubs, supercenters, and general merchandise','45',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','456','Health and Personal Care Retailers','Pharmacies, drug stores, optical, and health/personal care product retailers','45',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','457','Gasoline Stations and Fuel Dealers','Gasoline stations, fuel dealers, and other fuel retailers','45',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','458','Clothing, Clothing Accessories, Shoe, and Jewelry Retailers','Clothing, shoe, jewelry, luggage, and clothing accessories retailers','45',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','459','Other General Merchandise Retailers','Pet stores, art dealers, mobile home dealers, and all other retailers','45',2,false,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- Sector 48-49: Transportation and Warehousing
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('naics','481','Air Transportation','Scheduled and nonscheduled passenger and freight air transportation','48',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','482','Rail Transportation','Line-haul and short-line freight and passenger rail transportation','48',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','483','Water Transportation','Deep sea, coastal, Great Lakes, and inland water transportation','48',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','484','Truck Transportation','General freight and specialized freight trucking, local and long-distance','48',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','485','Transit and Ground Passenger Transportation','Urban transit, bus, taxi, ridesharing, school bus, charter, and other ground transit','48',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','486','Pipeline Transportation','Pipeline transportation of crude oil, natural gas, and refined products','48',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','487','Scenic and Sightseeing Transportation','Scenic and sightseeing transportation by land, water, and other means','48',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','488','Support Activities for Transportation','Air, rail, water, road transportation support and freight arrangement','48',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','491','Postal Service','United States Postal Service mail delivery and post office operations','49',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','492','Couriers and Messengers','Couriers, express delivery services, local messengers, and local delivery','49',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','493','Warehousing and Storage','General, refrigerated, farm, and other warehousing and storage facilities','49',2,false,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- Sector 51: Information
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('naics','512','Motion Picture and Sound Recording Industries','Motion picture and video production, distribution, exhibition, and sound recording','51',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','513','Publishing Industries','Newspaper, periodical, book, directory, and software publishers','51',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','516','Broadcasting and Content Providers','Radio, television broadcasting, media streaming, and content provider services','51',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','517','Telecommunications','Wired, wireless, satellite, and other telecommunications carriers','51',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','518','Computing Infrastructure Providers, Data Processing, Web Hosting, and Related Services','Data processing, web hosting, cloud infrastructure, and related services','51',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','519','Web Search Portals, Libraries, Archives, and Other Information Services','Web search portals, internet publishing, libraries, archives, and news syndicates','51',2,false,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- Sector 52: Finance and Insurance
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('naics','521','Monetary Authorities-Central Bank','Federal Reserve banks and other central banking monetary authorities','52',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','522','Credit Intermediation and Related Activities','Depository and nondepository credit intermediation and related activities','52',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','523','Securities, Commodity Contracts, and Other Financial Investments and Related Activities','Securities brokerage, commodity contracts, exchanges, and investment activities','52',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','524','Insurance Carriers and Related Activities','Insurance carriers, agencies, brokerages, and related activities','52',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','525','Funds, Trusts, and Other Financial Vehicles','Insurance funds, employee benefit funds, trusts, and other financial vehicles','52',2,false,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- Sector 53: Real Estate and Rental and Leasing
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('naics','531','Real Estate','Lessors, agents, brokers, property managers, and real estate appraisers','53',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','532','Rental and Leasing Services','Automotive, consumer goods, and general rental centers','53',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','533','Lessors of Nonfinancial Intangible Assets (except Copyrighted Works)','Lessors of patents, trademarks, franchises, and other nonfinancial intangibles','53',2,false,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- Sector 54: Professional, Scientific, and Technical Services
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('naics','541','Professional, Scientific, and Technical Services','Legal, accounting, architecture, engineering, IT, consulting, R&D, and advertising','54',2,false,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- Sector 55: Management of Companies and Enterprises
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('naics','551','Management of Companies and Enterprises','Offices of bank and other holding companies, corporate and regional management','55',2,false,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- Sector 56: Administrative and Support and Waste Management and Remediation Services
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('naics','561','Administrative and Support Services','Office admin, facilities, employment, travel, security, cleaning, and support','56',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','562','Waste Management and Remediation Services','Waste collection, treatment, disposal, remediation, and related services','56',2,false,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- Sector 61: Educational Services
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('naics','611','Educational Services','Elementary, secondary, colleges, universities, technical, trade, and other schools','61',2,false,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- Sector 62: Health Care and Social Assistance
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('naics','621','Ambulatory Health Care Services','Physicians, dentists, other practitioners, outpatient, labs, and home health','62',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','622','Hospitals','General medical/surgical, psychiatric, substance abuse, and specialty hospitals','62',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','623','Nursing and Residential Care Facilities','Skilled nursing, residential intellectual/developmental, assisted living facilities','62',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','624','Social Assistance','Individual/family services, food/housing relief, vocational rehab, child day care','62',2,false,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- Sector 71: Arts, Entertainment, and Recreation
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('naics','711','Performing Arts, Spectator Sports, and Related Industries','Theater, dance, music, sports teams, promoters, agents, independent artists','71',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','712','Museums, Historical Sites, and Similar Institutions','Museums, historical sites, zoos, botanical gardens, and nature parks','71',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','713','Amusement, Gambling, and Recreation Industries','Amusement parks, arcades, gambling, golf courses, and recreation industries','71',2,false,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- Sector 72: Accommodation and Food Services
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('naics','721','Accommodation','Hotels, motels, casino hotels, RV parks, recreational camps, and rooming houses','72',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','722','Food Services and Drinking Places','Restaurants, cafeterias, snack bars, caterers, bars, and drinking places','72',2,false,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- Sector 81: Other Services (except Public Administration)
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('naics','811','Repair and Maintenance','Automotive, electronic, commercial/industrial, and personal goods repair','81',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','812','Personal and Laundry Services','Personal care, death care, drycleaning, laundry, and other personal services','81',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','813','Religious, Grantmaking, Civic, Professional, and Similar Organizations','Religious, grantmaking, social advocacy, civic, professional organizations','81',2,false,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- Sector 92: Public Administration
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('naics','921','Executive, Legislative, and Other General Government Support','Executive offices, legislatures, and general government support programs','92',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','922','Justice, Public Order, and Safety Activities','Courts, law enforcement, fire protection, corrections, and public order/safety','92',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','923','Administration of Human Resource Programs','Education, public health, veterans affairs, and human resource program admin','92',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','924','Administration of Environmental Quality Programs','Air, water, solid waste, and environmental quality program administration','92',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','925','Administration of Housing Programs, Urban Planning, and Community Development','Housing, urban planning, and community development program administration','92',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','926','Administration of Economic Programs','Transportation, economic development, and regulation program administration','92',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','927','Space Research and Technology','Government space research, technology, and satellite operations','92',2,false,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','928','National Security and International Affairs','National defense, intelligence, international affairs, and security activities','92',2,false,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- ============================================================================
-- NAICS 2022 — Industry Groups (Level 3, 4-digit codes)
-- ============================================================================

-- Subsector 111: Crop Production
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('naics','1111','Oilseed and Grain Farming','Soybean, oilseed, dry pea, bean, wheat, corn, rice, and other grain farming','111',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','1112','Vegetable and Melon Farming','Vegetable and melon farming including potatoes and field crops','111',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','1113','Fruit and Tree Nut Farming','Orange, apple, grape, berry, tree nut, and other fruit farming','111',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','1114','Greenhouse Nursery and Floriculture Production','Greenhouse, nursery, floriculture, and mushroom production','111',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','1119','Other Crop Farming','Tobacco, cotton, sugarcane, hay, and all other crop farming','111',3,true,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- Subsector 112: Animal Production and Aquaculture
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('naics','1121','Cattle Ranching and Farming','Beef cattle ranching, dairy cattle, and dual-purpose cattle farming','112',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','1122','Hog and Pig Farming','Hog and pig farming including farrow-to-finish and feeder operations','112',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','1123','Poultry and Egg Production','Chicken, turkey, and other poultry and egg production','112',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','1124','Sheep and Goat Farming','Sheep, lamb, goat, and wool farming','112',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','1125','Aquaculture','Finfish, shellfish, and other aquaculture farming','112',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','1129','Other Animal Production','Horses, rabbits, fur-bearing animals, bees, and other animal production','112',3,true,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- Subsector 113: Forestry and Logging
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('naics','1131','Timber Tract Operations','Growing and harvesting timber on a long rotation basis','113',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','1132','Forest Nurseries and Gathering of Forest Products','Forest tree seedling nurseries, seed gathering, and forest product gathering','113',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','1133','Logging','Timber cutting, transporting logs, and producing wood chips in the field','113',3,true,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- Subsector 114: Fishing, Hunting and Trapping
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('naics','1141','Fishing','Finfish, shellfish, and other marine and freshwater fishing','114',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','1142','Hunting and Trapping','Hunting, trapping, and game propagation for commercial purposes','114',3,true,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- Subsector 115: Support Activities for Agriculture and Forestry
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('naics','1151','Support Activities for Crop Production','Soil preparation, planting, cultivating, harvesting, and crop management','115',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','1152','Support Activities for Animal Production','Breeding services, livestock spraying, and farm animal support activities','115',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','1153','Support Activities for Forestry','Forest fire prevention, timber cruising, reforestation, and forestry support','115',3,true,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- Subsector 211: Oil and Gas Extraction
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('naics','2111','Oil and Gas Extraction','Crude petroleum, natural gas, and liquid natural gas extraction','211',3,true,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- Subsector 212: Mining (except Oil and Gas)
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('naics','2121','Coal Mining','Bituminous coal, anthracite, lignite surface and underground mining','212',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','2122','Metal Ore Mining','Gold, silver, copper, iron, lead, zinc, uranium, and other metal ore mining','212',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','2123','Nonmetallic Mineral Mining and Quarrying','Stone, sand, gravel, clay, ceramic, phosphate, potash, and other mineral mining','212',3,true,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- Subsector 213: Support Activities for Mining
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('naics','2131','Support Activities for Mining','Drilling oil/gas wells, geophysical surveying, and mining support activities','213',3,true,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- Subsector 221: Utilities
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('naics','2211','Electric Power Generation Transmission and Distribution','Electric power generation, transmission, and distribution','221',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','2212','Natural Gas Distribution','Natural gas distribution to end consumers through mains systems','221',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','2213','Water Sewage and Other Systems','Water supply, sewage treatment, and steam/air-conditioning supply','221',3,true,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- Subsector 236: Construction of Buildings
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('naics','2361','Residential Building Construction','Single-family, multifamily, and residential building construction','236',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','2362','Nonresidential Building Construction','Commercial, institutional, and other nonresidential building construction','236',3,true,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- Subsector 237: Heavy and Civil Engineering Construction
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('naics','2371','Utility System Construction','Water, sewer, power line, oil/gas pipeline, and utility system construction','237',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','2372','Land Subdivision','Subdivision of land into lots for subsequent building construction','237',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','2373','Highway Street and Bridge Construction','Highway, road, street, bridge, tunnel, and overpass construction','237',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','2379','Other Heavy and Civil Engineering Construction','Dam, levee, dock, waterway, and other heavy construction','237',3,true,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- Subsector 238: Specialty Trade Contractors
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('naics','2381','Foundation Structure and Building Exterior Contractors','Poured concrete, structural steel, framing, masonry, and glass contractors','238',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','2382','Building Equipment Contractors','Electrical, plumbing, HVAC, and other building equipment contractors','238',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','2383','Building Finishing Contractors','Drywall, painting, flooring, tile, and other building finishing contractors','238',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','2389','Other Specialty Trade Contractors','Site preparation, demolition, and other specialty trade contractors','238',3,true,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- Subsector 311: Food Manufacturing
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('naics','3111','Animal Food Manufacturing','Dog, cat, livestock, poultry, and other animal food manufacturing','311',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','3112','Grain and Oilseed Milling','Flour, rice, malt, starch, vegetable oil, and breakfast cereal milling','311',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','3113','Sugar and Confectionery Product Manufacturing','Sugar, chocolate, candy, chewing gum, and confectionery manufacturing','311',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','3114','Fruit and Vegetable Preserving and Specialty Food Manufacturing','Frozen food, canned food, dehydrated food, and specialty food manufacturing','311',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','3115','Dairy Product Manufacturing','Fluid milk, butter, cheese, ice cream, and other dairy product manufacturing','311',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','3116','Animal Slaughtering and Processing','Animal slaughtering, meat processed from carcasses, and rendering','311',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','3117','Seafood Product Preparation and Packaging','Fresh, frozen, canned, smoked seafood product preparation and packaging','311',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','3118','Bakeries and Tortilla Manufacturing','Bread, cake, cookie, cracker, pasta, tortilla, and bakery manufacturing','311',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','3119','Other Food Manufacturing','Snack food, coffee, tea, spice, condiment, and other food manufacturing','311',3,true,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- Subsector 312: Beverage and Tobacco Product Manufacturing
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('naics','3121','Beverage Manufacturing','Soft drink, bottled water, brewery, winery, and distillery manufacturing','312',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','3122','Tobacco Manufacturing','Cigarette, cigar, smoking, and chewing tobacco product manufacturing','312',3,true,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- Subsector 313: Textile Mills
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('naics','3131','Fiber Yarn and Thread Mills','Fiber, yarn, and thread produced from natural and synthetic materials','313',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','3132','Fabric Mills','Broadwoven, narrow, knit, and nonwoven fabric mills','313',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','3133','Textile and Fabric Finishing and Fabric Coating Mills','Textile and fabric finishing, bleaching, dyeing, printing, and coating','313',3,true,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- Subsector 314: Textile Product Mills
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('naics','3141','Textile Furnishings Mills','Carpet, rug, curtain, drapery, and other textile furnishings mills','314',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','3149','Other Textile Product Mills','Rope, cordage, twine, tire cord, canvas, and other textile product mills','314',3,true,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- Subsector 315: Apparel Manufacturing
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('naics','3151','Apparel Knitting Mills','Hosiery, sock, and other apparel knitting mills','315',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','3152','Cut and Sew Apparel Manufacturing','Cut and sew apparel manufacturing for men, women, and children','315',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','3159','Apparel Accessories and Other Apparel Manufacturing','Apparel accessories, hats, gloves, and other apparel manufacturing','315',3,true,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- Subsector 316: Leather and Allied Product Manufacturing
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('naics','3161','Leather and Hide Tanning and Finishing','Leather and hide tanning, currying, and finishing','316',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','3162','Footwear Manufacturing','Rubber, plastics, and leather footwear manufacturing','316',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','3169','Other Leather and Allied Product Manufacturing','Luggage, handbag, and other leather and allied product manufacturing','316',3,true,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- Subsector 321: Wood Product Manufacturing
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('naics','3211','Sawmills and Wood Preservation','Sawmills, wood preservation, and treated wood product manufacturing','321',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','3212','Veneer Plywood and Engineered Wood Product Manufacturing','Veneer, plywood, laminated veneer, and engineered wood product manufacturing','321',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','3219','Other Wood Product Manufacturing','Millwork, wood containers, pallets, manufactured homes, and other wood products','321',3,true,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- Subsector 322: Paper Manufacturing
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('naics','3221','Pulp Paper and Paperboard Mills','Pulp, paper, and paperboard mills','322',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','3222','Converted Paper Product Manufacturing','Corrugated containers, paperboard, stationery, and other converted paper products','322',3,true,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- Subsector 323: Printing and Related Support Activities
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('naics','3231','Printing and Related Support Activities','Commercial lithographic, gravure, flexographic, screen, and digital printing','323',3,true,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- Subsector 324: Petroleum and Coal Products Manufacturing
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('naics','3241','Petroleum and Coal Products Manufacturing','Petroleum refining, asphalt paving mixtures, and petroleum lubricating products','324',3,true,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- Subsector 325: Chemical Manufacturing
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('naics','3251','Basic Chemical Manufacturing','Petrochemicals, industrial gases, dyes, pigments, and inorganic chemicals','325',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','3252','Resin Synthetic Rubber and Artificial Synthetic Fibers and Filaments Manufacturing','Plastics, synthetic rubber, and synthetic fibers and filaments manufacturing','325',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','3253','Pesticide Fertilizer and Other Agricultural Chemical Manufacturing','Pesticide, fertilizer, and other agricultural chemical manufacturing','325',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','3254','Pharmaceutical and Medicine Manufacturing','Pharmaceutical, diagnostic substance, and medicine manufacturing','325',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','3255','Paint Coating and Adhesive Manufacturing','Paint, coating, varnish, adhesive, and sealant manufacturing','325',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','3256','Soap Cleaning Compound and Toilet Preparation Manufacturing','Soap, detergent, toothpaste, cosmetics, and cleaning compound manufacturing','325',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','3259','Other Chemical Product and Preparation Manufacturing','Explosives, printing inks, and other chemical product manufacturing','325',3,true,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- Subsector 326: Plastics and Rubber Products Manufacturing
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('naics','3261','Plastics Product Manufacturing','Plastics pipe, film, sheet, foam, bottle, and other plastics product manufacturing','326',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','3262','Rubber Product Manufacturing','Tires, rubber hoses, belts, and other rubber product manufacturing','326',3,true,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- Subsector 327: Nonmetallic Mineral Product Manufacturing
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('naics','3271','Clay Product and Refractory Manufacturing','Pottery, ceramics, clay building materials, and refractory manufacturing','327',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','3272','Glass and Glass Product Manufacturing','Flat glass, glass containers, and glass product manufacturing','327',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','3273','Cement and Concrete Product Manufacturing','Cement, ready-mix concrete, concrete block, pipe, and precast manufacturing','327',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','3274','Lime and Gypsum Product Manufacturing','Lime, gypsum wallboard, and plaster product manufacturing','327',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','3279','Other Nonmetallic Mineral Product Manufacturing','Abrasive, cut stone, mineral wool, and other mineral product manufacturing','327',3,true,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- Subsector 331: Primary Metal Manufacturing
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('naics','3311','Iron and Steel Mills and Ferroalloy Manufacturing','Iron and steel mills, electrometallurgical, and ferroalloy manufacturing','331',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','3312','Steel Product Manufacturing from Purchased Steel','Steel pipe, tube, wire drawing, and cold-rolled product manufacturing','331',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','3313','Alumina and Aluminum Production and Processing','Alumina refining, primary and secondary aluminum production and processing','331',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','3314','Nonferrous Metal (except Aluminum) Production and Processing','Copper, lead, zinc, and other nonferrous metal smelting and refining','331',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','3315','Foundries','Ferrous and nonferrous metal foundries, casting, and molding','331',3,true,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- Subsector 332: Fabricated Metal Product Manufacturing
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('naics','3321','Forging and Stamping','Iron, steel, nonferrous forging, stamping, powder metallurgy, and custom roll forming','332',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','3322','Cutlery and Handtool Manufacturing','Cutlery, kitchen utensil, handtool, and general hardware manufacturing','332',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','3323','Architectural and Structural Metals Manufacturing','Plate work, structural steel, ornamental metal, and metal window manufacturing','332',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','3324','Boiler Tank and Shipping Container Manufacturing','Power boilers, heat exchangers, tanks, and shipping containers','332',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','3325','Hardware Manufacturing','Locks, hinges, hardware, and other builders hardware manufacturing','332',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','3326','Spring and Wire Product Manufacturing','Springs, wire rope, chain, and fabricated wire product manufacturing','332',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','3327','Machine Shops Turned Product and Screw Nut and Bolt Manufacturing','Machine shops, turned products, screws, nuts, bolts, and fasteners','332',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','3328','Coating Engraving Heat Treating and Allied Activities','Metal coating, engraving, heat treating, and allied metal finishing','332',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','3329','Other Fabricated Metal Product Manufacturing','Ball and roller bearings, ordnance, valves, and other metal products','332',3,true,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- Subsector 333: Machinery Manufacturing
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('naics','3331','Agriculture Construction and Mining Machinery Manufacturing','Farm, lawn, construction, and mining machinery manufacturing','333',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','3332','Industrial Machinery Manufacturing','Sawmill, woodworking, paper, textile, printing, and food machinery','333',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','3333','Commercial and Service Industry Machinery Manufacturing','Office, vending, commercial laundry, and other service industry machinery','333',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','3334','Ventilation Heating Air-Conditioning and Commercial Refrigeration Equipment Manufacturing','Ventilation, heating, air-conditioning, and commercial refrigeration equipment','333',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','3335','Metalworking Machinery Manufacturing','Metal cutting, metal forming, special die/tool, and metalworking machinery','333',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','3336','Engine Turbine and Power Transmission Equipment Manufacturing','Turbine, power transmission, and speed changer/gear manufacturing','333',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','3339','Other General Purpose Machinery Manufacturing','Pump, compressor, elevator, conveyor, and other general purpose machinery','333',3,true,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- Subsector 334: Computer and Electronic Product Manufacturing
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('naics','3341','Computer and Peripheral Equipment Manufacturing','Computer, terminal, storage device, and peripheral equipment manufacturing','334',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','3342','Communications Equipment Manufacturing','Telephone, radio, television, and other communications equipment manufacturing','334',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','3343','Audio and Video Equipment Manufacturing','Audio, video, and multimedia equipment manufacturing','334',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','3344','Semiconductor and Other Electronic Component Manufacturing','Semiconductor, capacitor, resistor, connector, and electronic component mfg','334',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','3345','Navigational Measuring Electromedical and Control Instruments Manufacturing','Navigation, measuring, medical, electromedical, and control instruments','334',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','3346','Manufacturing and Reproducing Magnetic and Optical Media','Blank magnetic and optical recording media manufacturing and reproducing','334',3,true,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- Subsector 335: Electrical Equipment Appliance and Component Manufacturing
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('naics','3351','Electric Lighting Equipment Manufacturing','Electric lamp, lighting fixture, and lighting equipment manufacturing','335',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','3352','Household Appliance Manufacturing','Household cooking, refrigeration, laundry, and other appliance manufacturing','335',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','3353','Electrical Equipment Manufacturing','Switchgear, transformer, motor, generator, and electrical equipment manufacturing','335',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','3359','Other Electrical Equipment and Component Manufacturing','Storage batteries, communication wire/cable, and other electrical equipment','335',3,true,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- Subsector 336: Transportation Equipment Manufacturing
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('naics','3361','Motor Vehicle Manufacturing','Automobile, light truck, and heavy-duty truck manufacturing','336',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','3362','Motor Vehicle Body and Trailer Manufacturing','Motor vehicle body, truck trailer, travel trailer, and camper manufacturing','336',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','3363','Motor Vehicle Parts Manufacturing','Engine, transmission, steering, brake, and other motor vehicle parts','336',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','3364','Aerospace Product and Parts Manufacturing','Aircraft, spacecraft, guided missile, and propulsion unit manufacturing','336',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','3365','Railroad Rolling Stock Manufacturing','Locomotives, freight cars, passenger rail cars, and railroad rolling stock','336',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','3366','Ship and Boat Building','Ship building and repairing, boat building, and marine manufacturing','336',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','3369','Other Transportation Equipment Manufacturing','Military armored vehicles, bicycles, motorcycles, and other transport equipment','336',3,true,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- Subsector 337: Furniture and Related Product Manufacturing
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('naics','3371','Household and Institutional Furniture and Kitchen Cabinet Manufacturing','Household, institutional furniture, and kitchen cabinet manufacturing','337',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','3372','Office Furniture (including Fixtures) Manufacturing','Office furniture, custom architectural woodwork, and fixture manufacturing','337',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','3379','Other Furniture Related Product Manufacturing','Mattresses, blinds, shades, and other furniture-related product manufacturing','337',3,true,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- Subsector 339: Miscellaneous Manufacturing
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('naics','3391','Medical Equipment and Supplies Manufacturing','Lab instruments, surgical devices, dental equipment, and medical supplies','339',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','3399','Other Miscellaneous Manufacturing','Jewelry, silverware, sporting goods, toys, pens, signs, and other manufacturing','339',3,true,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- Subsector 423: Merchant Wholesalers, Durable Goods
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('naics','4231','Motor Vehicle and Motor Vehicle Parts and Supplies Merchant Wholesalers','Motor vehicles, automotive parts, tires, and supplies wholesale','423',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','4232','Furniture and Home Furnishing Merchant Wholesalers','Furniture, home furnishing, and floor covering merchant wholesalers','423',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','4233','Lumber and Other Construction Materials Merchant Wholesalers','Lumber, plywood, millwork, brick, stone, and construction materials wholesale','423',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','4234','Professional and Commercial Equipment and Supplies Merchant Wholesalers','Photographic, office, computer, medical, and professional equipment wholesale','423',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','4235','Metals and Minerals (except Petroleum) Merchant Wholesalers','Metals service centers, coal, ore, and mineral merchant wholesalers','423',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','4236','Household Appliances and Electrical and Electronic Goods Merchant Wholesalers','Appliance, electrical, electronic parts, and household electronics wholesale','423',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','4237','Hardware and Plumbing and Heating Equipment and Supplies Merchant Wholesalers','Plumbing, heating, hardware, and construction equipment merchant wholesalers','423',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','4238','Machinery Equipment and Supplies Merchant Wholesalers','Construction, mining, farm, industrial, and commercial machinery wholesale','423',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','4239','Miscellaneous Durable Goods Merchant Wholesalers','Sporting goods, toys, recyclable, jewelry, and miscellaneous durables wholesale','423',3,true,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- Subsector 424: Merchant Wholesalers, Nondurable Goods
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('naics','4241','Paper and Paper Product Merchant Wholesalers','Paper, stationery, office supplies, and packaging product wholesalers','424',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','4242','Drugs and Druggists Sundries Merchant Wholesalers','Pharmaceutical, proprietary drugs, and druggist sundries wholesalers','424',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','4243','Apparel Piece Goods and Notions Merchant Wholesalers','Piece goods, apparel, notions, and clothing accessories wholesalers','424',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','4244','Grocery and Related Product Merchant Wholesalers','Grocery, packaged frozen food, confectionery, and related product wholesalers','424',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','4245','Farm Product Raw Material Merchant Wholesalers','Grain, livestock, farm raw material, and agricultural product wholesalers','424',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','4246','Chemical and Allied Products Merchant Wholesalers','Chemical, plastics, and allied products merchant wholesalers','424',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','4247','Petroleum and Petroleum Products Merchant Wholesalers','Petroleum bulk stations, terminals, and petroleum products wholesalers','424',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','4248','Beer Wine and Distilled Alcoholic Beverage Merchant Wholesalers','Beer, wine, distilled alcoholic beverage, and liquor merchant wholesalers','424',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','4249','Miscellaneous Nondurable Goods Merchant Wholesalers','Farm supplies, paints, nursery stock, tobacco, and nondurable goods wholesale','424',3,true,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- Subsector 425: Wholesale Electronic Markets and Agents and Brokers
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('naics','4251','Wholesale Electronic Markets and Agents and Brokers','Electronic commodity markets, wholesale trade agents, and brokers','425',3,true,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- Subsector 441: Motor Vehicle and Parts Dealers
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('naics','4411','Automobile Dealers','New car, used car, and franchised automobile dealers','441',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','4412','Other Motor Vehicle Dealers','Recreational vehicle, motorcycle, boat, and other motor vehicle dealers','441',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','4413','Automotive Parts Accessories and Tire Retailers','Automotive parts, accessories, and tire retailers','441',3,true,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- Subsector 444: Building Material and Garden Equipment and Supplies Dealers
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('naics','4441','Building Material and Supplies Dealers','Home centers, paint, hardware, and building material supply dealers','444',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','4442','Lawn and Garden Equipment and Supplies Retailers','Outdoor power equipment, nursery, garden center, and supplies retailers','444',3,true,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- Subsector 445: Food and Beverage Retailers
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('naics','4451','Grocery and Convenience Retailers','Supermarkets, grocery stores, and convenience retailers','445',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','4452','Specialty Food Retailers','Meat, fish, seafood, fruit, cheese, and other specialty food retailers','445',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','4453','Beer Wine and Liquor Retailers','Beer, wine, and liquor retailers','445',3,true,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- Subsector 449: Furniture, Home Furnishings, Electronics, and Appliance Retailers
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('naics','4491','Furniture and Home Furnishings Retailers','Furniture, floor covering, window treatment, and home furnishings retailers','449',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','4492','Electronics and Appliance Retailers','Consumer electronics, computer, camera, and appliance retailers','449',3,true,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- Subsector 451: Sporting Goods, Hobby, Musical Instrument, Book, and Miscellaneous Retailers
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('naics','4511','Sporting Goods Hobby and Musical Instrument Retailers','Sporting goods, hobby, sewing, needlework, and musical instrument retailers','451',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','4512','Book Retailers and News Dealers','Book, magazine, newspaper, and music retailers','451',3,true,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- Subsector 455: General Merchandise Retailers
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('naics','4551','Department Stores','Department stores with broad product lines sold in separate departments','455',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','4552','Warehouse Clubs Supercenters and Other General Merchandise Retailers','Warehouse clubs, supercenters, and other general merchandise retailers','455',3,true,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- Subsector 456: Health and Personal Care Retailers
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('naics','4561','Health and Personal Care Retailers','Pharmacies, drug stores, optical goods, and health/personal care retailers','456',3,true,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- Subsector 457: Gasoline Stations and Fuel Dealers
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('naics','4571','Gasoline Stations','Gasoline stations with or without convenience stores','457',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','4572','Fuel Dealers','Heating oil, LP gas, coal, and other fuel dealers','457',3,true,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- Subsector 458: Clothing, Clothing Accessories, Shoe, and Jewelry Retailers
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('naics','4581','Clothing and Clothing Accessories Retailers','Clothing stores and clothing accessories retailers','458',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','4582','Shoe Retailers','Shoe stores and footwear retailers','458',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','4583','Jewelry Luggage and Leather Goods Retailers','Jewelry, luggage, and leather goods retailers','458',3,true,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- Subsector 459: Other General Merchandise and Nonstore Retailers
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('naics','4591','Online and Mail-Order Retailers','Electronic shopping, internet, and mail-order retailers','459',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','4592','Vending Machine Operators','Vending machine operators selling merchandise through coin-operated machines','459',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','4599','All Other Retailers','Pet stores, art dealers, mobile home dealers, and all other retailers','459',3,true,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- Subsector 481: Air Transportation
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('naics','4811','Scheduled Air Transportation','Scheduled passenger and freight air transportation services','481',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','4812','Nonscheduled Air Transportation','Nonscheduled charter, air taxi, and other air transportation services','481',3,true,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- Subsector 482: Rail Transportation
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('naics','4821','Rail Transportation','Line-haul, short-line freight, and passenger rail transportation','482',3,true,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- Subsector 483: Water Transportation
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('naics','4831','Deep Sea Coastal and Great Lakes Water Transportation','Deep sea, coastal, and Great Lakes freight and passenger water transportation','483',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','4832','Inland Water Transportation','Inland water freight and passenger transportation on rivers and canals','483',3,true,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- Subsector 484: Truck Transportation
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('naics','4841','General Freight Trucking','General freight trucking, local and long-distance','484',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','4842','Specialized Freight Trucking','Specialized freight trucking including moving, log, and bulk materials','484',3,true,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- Subsector 485: Transit and Ground Passenger Transportation
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('naics','4851','Urban Transit Systems','Commuter rail, bus, light rail, subway, and other urban transit systems','485',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','4852','Interurban and Rural Bus Transportation','Interurban and rural scheduled bus transportation services','485',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','4853','Taxi and Ridesharing Services','Taxi services, ridesharing services, and limousine service','485',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','4854','School and Employee Bus Transportation','School bus, employee shuttle, and contract bus transportation','485',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','4855','Charter Bus Industry','Charter bus services for group excursions and special events','485',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','4859','Other Transit and Ground Passenger Transportation','Special needs, van pools, and other ground passenger transportation','485',3,true,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- Subsector 486: Pipeline Transportation
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('naics','4861','Pipeline Transportation of Crude Oil','Pipeline transportation of crude oil from production to refineries','486',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','4862','Pipeline Transportation of Natural Gas','Pipeline transportation of natural gas from processing to distribution','486',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','4869','Other Pipeline Transportation','Pipeline transportation of refined petroleum and other products','486',3,true,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- Subsector 487: Scenic and Sightseeing Transportation
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('naics','4871','Scenic and Sightseeing Transportation Land','Scenic and sightseeing transportation by land including horse-drawn carriages','487',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','4872','Scenic and Sightseeing Transportation Water','Scenic and sightseeing transportation on water including dinner cruises','487',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','4879','Scenic and Sightseeing Transportation Other','Scenic and sightseeing transportation by aerial tramway and helicopter','487',3,true,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- Subsector 488: Support Activities for Transportation
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('naics','4881','Support Activities for Air Transportation','Air traffic control, airport operations, and air transportation support','488',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','4882','Support Activities for Rail Transportation','Railroad switching, terminal operations, and rail transportation support','488',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','4883','Support Activities for Water Transportation','Port and harbor operations, marine cargo handling, and marine salvage','488',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','4884','Support Activities for Road Transportation','Motor vehicle towing, toll road operation, and road transportation support','488',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','4885','Freight Transportation Arrangement','Freight forwarding, customs brokerage, and shipping arrangement','488',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','4889','Other Support Activities for Transportation','Packing and crating, and other transportation support activities','488',3,true,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- Subsector 491: Postal Service
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('naics','4911','Postal Service','National postal mail delivery, post office, and mailbox rental services','491',3,true,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- Subsector 492: Couriers and Messengers
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('naics','4921','Couriers and Express Delivery Services','Intercity courier, express package, and parcel delivery services','492',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','4922','Local Messengers and Local Delivery','Local messenger, delivery, and same-day document/parcel services','492',3,true,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- Subsector 493: Warehousing and Storage
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('naics','4931','Warehousing and Storage','General, refrigerated, and specialized warehousing and storage facilities','493',3,true,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- Subsector 512: Motion Picture and Sound Recording Industries
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('naics','5121','Motion Picture and Video Industries','Motion picture/video production, distribution, exhibition, and postproduction','512',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','5122','Sound Recording Industries','Music publishing, sound recording studios, and record production','512',3,true,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- Subsector 513: Publishing Industries
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('naics','5131','Newspaper Periodical Book and Directory Publishers','Newspaper, periodical, book, directory, and greeting card publishers','513',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','5132','Software Publishers','Software publishers for systems, applications, and programming tools','513',3,true,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- Subsector 516: Broadcasting and Content Providers
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('naics','5161','Radio and Television Broadcasting','Radio station, television station, and network broadcasting','516',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','5162','Media Streaming Distribution Services Social Networks and Other Media Networks and Content Providers','Streaming services, social networks, and digital media content providers','516',3,true,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- Subsector 517: Telecommunications
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('naics','5171','Wired and Wireless Telecommunications Carriers','Wired and wireless telecommunications carriers including VoIP','517',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','5174','Satellite Telecommunications','Satellite telecommunications services and earth station operations','517',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','5179','Other Telecommunications','Resellers, agents, and other telecommunications services','517',3,true,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- Subsector 518: Computing Infrastructure Providers, Data Processing, Web Hosting, and Related Services
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('naics','5182','Computing Infrastructure Providers Data Processing Web Hosting and Related Services','Cloud computing, data centers, web hosting, and data processing services','518',3,true,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- Subsector 519: Web Search Portals, Libraries, Archives, and Other Information Services
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('naics','5191','Web Search Portals Libraries Archives and Other Information Services','Internet search portals, libraries, archives, and information services','519',3,true,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- Subsector 521: Monetary Authorities-Central Bank
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('naics','5211','Monetary Authorities-Central Bank','Federal Reserve banks and other central bank operations','521',3,true,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- Subsector 522: Credit Intermediation and Related Activities
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('naics','5221','Depository Credit Intermediation','Commercial banking, savings institutions, and credit union operations','522',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','5222','Nondepository Credit Intermediation','Sales financing, consumer lending, mortgage companies, and credit card issuing','522',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','5223','Activities Related to Credit Intermediation','Mortgage brokers, check cashing, money orders, and loan servicing','522',3,true,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- Subsector 523: Securities, Commodity Contracts, and Other Financial Investments and Related Activities
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('naics','5231','Securities and Commodity Contracts Intermediation and Brokerage','Investment banking, securities brokerage, and commodity contracts dealing','523',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','5232','Securities and Commodity Exchanges','Securities and commodity exchanges and electronic trading platforms','523',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','5239','Other Financial Investment Activities','Portfolio management, investment advice, and other financial investment','523',3,true,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- Subsector 524: Insurance Carriers and Related Activities
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('naics','5241','Insurance Carriers','Life, health, property, casualty, and other insurance carriers','524',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','5242','Agencies Brokerages and Other Insurance Related Activities','Insurance agencies, brokerages, claims adjusting, and third-party admin','524',3,true,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- Subsector 525: Funds, Trusts, and Other Financial Vehicles
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('naics','5251','Insurance and Employee Benefit Funds','Health and welfare funds, pension funds, and employee benefit funds','525',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','5259','Other Investment Pools and Funds','Open-end investment funds, trusts, estates, and other investment pools','525',3,true,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- Subsector 531: Real Estate
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('naics','5311','Lessors of Real Estate','Lessors of residential and nonresidential buildings and mini-warehouses','531',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','5312','Offices of Real Estate Agents and Brokers','Real estate agents and brokers facilitating property sales and leasing','531',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','5313','Activities Related to Real Estate','Property management, real estate appraisal, and related services','531',3,true,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- Subsector 532: Rental and Leasing Services
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('naics','5321','Automotive Equipment Rental and Leasing','Passenger car, truck, and utility trailer rental and leasing','532',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','5322','Consumer Goods Rental','Consumer electronics, formal wear, video, and other consumer goods rental','532',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','5323','General Rental Centers','General equipment rental centers serving consumers and businesses','532',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','5324','Commercial and Industrial Machinery and Equipment Rental and Leasing','Construction, industrial, transportation, and office equipment leasing','532',3,true,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- Subsector 533: Lessors of Nonfinancial Intangible Assets (except Copyrighted Works)
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('naics','5331','Lessors of Nonfinancial Intangible Assets (except Copyrighted Works)','Licensing of patents, trademarks, brand names, and franchise agreements','533',3,true,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- Subsector 541: Professional, Scientific, and Technical Services
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('naics','5411','Legal Services','Law offices, legal counsel, and other legal services','541',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','5412','Accounting Tax Preparation Bookkeeping and Payroll Services','Accounting, auditing, tax preparation, bookkeeping, and payroll services','541',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','5413','Architectural Engineering and Related Services','Architectural, landscape architecture, engineering, and surveying services','541',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','5414','Specialized Design Services','Interior, industrial, graphic, and other specialized design services','541',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','5415','Computer Systems Design and Related Services','Custom software, systems integration, IT consulting, and computer services','541',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','5416','Management Scientific and Technical Consulting Services','Management, environmental, and other scientific/technical consulting','541',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','5417','Scientific Research and Development Services','Physical, life science, social science, and humanities R&D services','541',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','5418','Advertising Public Relations and Related Services','Advertising agencies, public relations, media buying, and direct mail','541',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','5419','Other Professional Scientific and Technical Services','Market research, photography, translation, and other professional services','541',3,true,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- Subsector 551: Management of Companies and Enterprises
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('naics','5511','Management of Companies and Enterprises','Holding company offices and centralized corporate management activities','551',3,true,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- Subsector 561: Administrative and Support Services
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('naics','5611','Office Administrative Services','Office administrative services including financial and HR management','561',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','5612','Facilities Support Services','Janitorial, maintenance, and facilities support services','561',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','5613','Employment Services','Temporary staffing, professional employer organizations, and employment services','561',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','5614','Business Support Services','Document preparation, telephone answering, collection, and business support','561',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','5615','Travel Arrangement and Reservation Services','Travel agencies, tour operators, and convention/event planning services','561',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','5616','Investigation and Security Services','Investigation, guard, patrol, armored car, and security system services','561',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','5617','Services to Buildings and Dwellings','Exterminating, janitorial, landscaping, and building maintenance services','561',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','5619','Other Support Services','Packaging, labeling, convention management, and other support services','561',3,true,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- Subsector 562: Waste Management and Remediation Services
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('naics','5621','Waste Collection','Solid waste, hazardous waste, and recyclable material collection','562',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','5622','Waste Treatment and Disposal','Solid waste combustion, landfill, hazardous waste treatment and disposal','562',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','5629','Remediation and Other Waste Management Services','Site remediation, hazardous material abatement, and specialty cleanup','562',3,true,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- Subsector 611: Educational Services
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('naics','6111','Elementary and Secondary Schools','Elementary and secondary public and private school education','611',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','6112','Junior Colleges','Community colleges and junior college education programs','611',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','6113','Colleges Universities and Professional Schools','Colleges, universities, and professional schools offering degrees','611',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','6114','Business Schools and Computer and Management Training','Business, secretarial, computer, and management training schools','611',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','6115','Technical and Trade Schools','Cosmetology, flight, apprenticeship, and technical/trade schools','611',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','6116','Other Schools and Instruction','Fine arts, sports, language, exam preparation, and other instruction','611',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','6117','Educational Support Services','Curriculum development, testing, and other educational support services','611',3,true,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- Subsector 621: Ambulatory Health Care Services
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('naics','6211','Offices of Physicians','Offices of physicians including specialists and general practitioners','621',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','6212','Offices of Dentists','Offices of dentists including oral surgery and orthodontics','621',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','6213','Offices of Other Health Practitioners','Offices of chiropractors, optometrists, therapists, and other practitioners','621',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','6214','Outpatient Care Centers','Family planning, outpatient mental health, kidney dialysis, and surgical centers','621',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','6215','Medical and Diagnostic Laboratories','Medical, diagnostic, imaging, and clinical laboratory services','621',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','6216','Home Health Care Services','Skilled nursing and medical care provided in patient homes','621',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','6219','Other Ambulatory Health Care Services','Ambulance services, blood banks, and other ambulatory health care','621',3,true,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- Subsector 622: Hospitals
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('naics','6221','General Medical and Surgical Hospitals','General medical and surgical hospital inpatient and outpatient services','622',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','6222','Psychiatric and Substance Abuse Hospitals','Psychiatric and substance abuse treatment hospital services','622',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','6223','Specialty (except Psychiatric and Substance Abuse) Hospitals','Specialty hospitals including pediatric, rehabilitation, and long-term acute care','622',3,true,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- Subsector 623: Nursing and Residential Care Facilities
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('naics','6231','Nursing Care Facilities (Skilled Nursing Facilities)','Skilled nursing facilities providing inpatient nursing and rehabilitative care','623',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','6232','Residential Intellectual and Developmental Disability Mental Health and Substance Abuse Facilities','Residential care for intellectual, developmental, mental health, substance abuse','623',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','6233','Continuing Care Retirement Communities and Assisted Living Facilities for the Elderly','Continuing care retirement communities and assisted living for the elderly','623',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','6239','Other Residential Care Facilities','Group homes for the disabled, halfway houses, and other residential care','623',3,true,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- Subsector 624: Social Assistance
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('naics','6241','Individual and Family Services','Family counseling, crisis intervention, adoption, and individual services','624',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','6242','Community Food and Housing and Emergency and Other Relief Services','Food banks, homeless shelters, refugee assistance, and community relief','624',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','6243','Vocational Rehabilitation Services','Vocational rehabilitation services for disabled and disadvantaged persons','624',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','6244','Child Day Care Services','Child day care centers and family day care home services','624',3,true,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- Subsector 711: Performing Arts, Spectator Sports, and Related Industries
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('naics','7111','Performing Arts Companies','Theater companies, dance companies, musical groups, and other performers','711',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','7112','Spectator Sports','Professional and semi-professional sports teams and racetracks','711',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','7113','Promoters of Performing Arts Sports and Similar Events','Event promotion for performing arts, sports, and similar live events','711',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','7114','Agents and Managers for Artists Athletes Entertainers and Other Public Figures','Artist, athlete, and entertainer talent management and representation','711',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','7115','Independent Artists Writers and Performers','Independent actors, musicians, authors, and other performing artists','711',3,true,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- Subsector 712: Museums, Historical Sites, and Similar Institutions
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('naics','7121','Museums Historical Sites and Similar Institutions','Museums, art galleries, historical sites, zoos, gardens, and nature parks','712',3,true,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- Subsector 713: Amusement, Gambling, and Recreation Industries
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('naics','7131','Amusement Parks and Arcades','Theme parks, amusement parks, and arcade gaming centers','713',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','7132','Gambling Industries','Casinos, slot machine operators, and other gambling establishments','713',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','7139','Other Amusement and Recreation Industries','Golf courses, skiing, marinas, fitness centers, and other recreation','713',3,true,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- Subsector 721: Accommodation
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('naics','7211','Traveler Accommodation','Hotels, motels, resorts, casino hotels, and bed-and-breakfast inns','721',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','7212','RV (Recreational Vehicle) Parks and Recreational Camps','RV parks, campgrounds, and recreational and vacation camps','721',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','7213','Rooming and Boarding Houses Dormitories and Workers Camps','Rooming houses, boarding houses, dormitories, and workers camps','721',3,true,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- Subsector 722: Food Services and Drinking Places
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('naics','7223','Special Food Services','Caterers, mobile food services, and other special food services','722',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','7224','Drinking Places (Alcoholic Beverages)','Bars, taverns, nightclubs, and other drinking places','722',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','7225','Restaurants and Other Eating Places','Full-service restaurants, fast food, cafeterias, snack bars, and cafes','722',3,true,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- Subsector 811: Repair and Maintenance
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('naics','8111','Automotive Repair and Maintenance','General automotive, body, paint, oil change, and car wash services','811',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','8112','Electronic and Precision Equipment Repair and Maintenance','Computer, office machine, and precision instrument repair and maintenance','811',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','8113','Commercial and Industrial Machinery and Equipment (except Automotive and Electronic) Repair and Maintenance','Commercial and industrial machinery and equipment repair except auto/electronics','811',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','8114','Personal and Household Goods Repair and Maintenance','Home appliance, furniture, shoe, watch, and personal goods repair','811',3,true,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- Subsector 812: Personal and Laundry Services
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('naics','8121','Personal Care Services','Barber, beauty, nail salons, diet centers, and other personal care services','812',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','8122','Death Care Services','Funeral homes, cemeteries, crematories, and death care services','812',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','8123','Drycleaning and Laundry Services','Coin-operated laundromats, drycleaning plants, and linen supply services','812',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','8129','Other Personal Services','Pet care, photo finishing, parking lots, and other personal services','812',3,true,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- Subsector 813: Religious, Grantmaking, Civic, Professional, and Similar Organizations
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('naics','8131','Religious Organizations','Churches, temples, mosques, synagogues, and other religious organizations','813',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','8132','Grantmaking and Giving Services','Foundations, charitable trusts, and grantmaking organizations','813',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','8133','Social Advocacy Organizations','Human rights, environment, and other social advocacy organizations','813',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','8134','Civic and Social Organizations','Civic clubs, fraternal organizations, and social membership organizations','813',3,true,'active','00000000-0000-0000-0000-000000000000'),
  ('naics','8139','Business Professional Labor Political and Similar Organizations','Business associations, unions, political organizations, and similar groups','813',3,true,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- Subsector 921: Executive, Legislative, and Other General Government Support
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('naics','9211','Executive Legislative and Other General Government Support','Executive offices, legislative bodies, and general government administration','921',3,true,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- Subsector 922: Justice, Public Order, and Safety Activities
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('naics','9221','Justice Public Order and Safety Activities','Courts, police, fire departments, corrections, and parole offices','922',3,true,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- Subsector 923: Administration of Human Resource Programs
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('naics','9231','Administration of Human Resource Programs','Education, public health, veterans affairs, and human resource administration','923',3,true,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- Subsector 924: Administration of Environmental Quality Programs
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('naics','9241','Administration of Environmental Quality Programs','Air, water, radiation, solid waste, and environmental quality administration','924',3,true,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- Subsector 925: Administration of Housing Programs, Urban Planning, and Community Development
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('naics','9251','Administration of Housing Programs Urban Planning and Community Development','Housing, urban planning, and community development program administration','925',3,true,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- Subsector 926: Administration of Economic Programs
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('naics','9261','Administration of Economic Programs','Transportation, utilities regulation, and economic development administration','926',3,true,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- Subsector 927: Space Research and Technology
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('naics','9271','Space Research and Technology','Government-administered space research, exploration, and technology programs','927',3,true,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;

-- Subsector 928: National Security and International Affairs
insert into shared.industry_code (domain_code, code, name, description, parent_code, level_no, is_leaf, status, created_by)
values
  ('naics','9281','National Security and International Affairs','Army, navy, air force, intelligence, and international affairs administration','928',3,true,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (domain_code, code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    parent_code = excluded.parent_code,
    level_no = excluded.level_no,
    is_leaf = excluded.is_leaf,
    updated_at = now(),
    updated_by = excluded.created_by;
