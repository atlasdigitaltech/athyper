-- seed-contract-version: 1
-- seed-pack: neon.blueprint.spend-categories
-- seed-pack-version: 2.0.0
-- seed-dataset: master.commodity-category
-- seed-data-class: production_reference
-- seed-provenance: {"source":"Wave 5 archived blueprint rewrite","publisher":"Athyper","source_version":"wave5-blueprints-v2","retrieved_at":"2026-08-03","license":"internal"}
-- seed-plane: neon
-- seed-tenant-scope: tenant
-- seed-cross-file-ids: true
-- seed-id-strategy: deterministic-uuid:athyper-wave5-spend-categories-v2
-- seed-assertions: expected-count,orphan,uniqueness,semantic
-- seed-demo-data: false
-- seed-assertion: expected-count
-- seed-assertion: orphan
-- seed-assertion: uniqueness
-- seed-assertion: semantic
-- seed-natural-key: master.commodity_category(tenant_id,code)
-- seed-expected-row-count: exact:125
DO $pack$ DECLARE v_tid uuid:=nullif(trim(current_setting('app.seed_tenant_id',true)),'')::uuid; v_actor uuid:=nullif(trim(current_setting('app.current_principal_id',true)),'')::uuid; BEGIN
 IF current_setting('app.database_plane',true)<>'neon' OR v_tid IS NULL THEN RAISE EXCEPTION 'Neon tenant scope required'; END IF;
 WITH seed_rows(code,name,description,parent_code,sort_order) AS (VALUES
 ('SC-IT','IT & Digital','Information technology hardware, software, cloud, and services',NULL,10),
 ('SC-TELCO','Telecom & Connectivity','Voice, data, mobile, and network connectivity services',NULL,20),
 ('SC-OFFICE','Office & Workplace','Office supplies, furniture, equipment, and printing',NULL,30),
 ('SC-HR','HR, Talent & Benefits','Recruitment, training, payroll services, and employee benefits',NULL,40),
 ('SC-TRAVEL','Travel, Events & Employee Welfare','Air travel, hotels, ground transport, events, and conferences',NULL,50),
 ('SC-PROF','Professional Services','Legal, audit, consulting, and engineering advisory services',NULL,60),
 ('SC-MKTG','Marketing, Media & CX','Digital and traditional marketing, PR, and customer experience',NULL,70),
 ('SC-FAC','Facilities & Occupancy','Rent, facility maintenance, cleaning, and on-site security',NULL,80),
 ('SC-UTIL','Utilities & Energy Services','Electricity, water, gas, and waste management consumption',NULL,90),
 ('SC-FLEET','Fleet & Mobility','Vehicle purchase/lease, fuel, and fleet maintenance',NULL,100),
 ('SC-INS','Insurance','Property, liability, and employee insurance',NULL,110),
 ('SC-BANK','Banking, Treasury & FX Services','Bank fees, foreign exchange, and treasury operations',NULL,120),
 ('SC-TAX','Taxes, Duties & Statutory Fees','Corporate taxes, import duties, and statutory levies',NULL,130),
 ('SC-SAFETY','Security, HSE & Compliance','Physical security, occupational health & safety, regulatory compliance',NULL,140),
 ('SC-ENV','ESG, Waste & Environmental Services','Carbon management, waste recycling, and environmental remediation',NULL,150),
 ('SC-OUTSRC','Outsourced & Shared Services','BPO, shared service centres, and temporary staffing',NULL,160),
 ('SC-SUBS','Subscriptions, Licenses & Memberships','Software licenses, memberships, and publication subscriptions',NULL,170),
 ('SC-RAW','Raw Materials & Feedstock','Metals, chemicals, polymers, and agricultural raw materials',NULL,200),
 ('SC-COMP','Components & Sub-assemblies','Mechanical, electrical, and structural components',NULL,210),
 ('SC-PKG','Packaging Materials','Primary, secondary, and transit packaging',NULL,220),
 ('SC-CONSUM','Consumables & Chemicals','Industrial chemicals, lab consumables, and cleaning agents',NULL,230),
 ('SC-MRO','MRO & Spare Parts','Maintenance spare parts, tools, and supplies',NULL,240),
 ('SC-CAPEQUIP','Capital Equipment & Tooling','Machinery, tooling, fixtures, and production lines',NULL,300),
 ('SC-PRODSVC','Production / Plant Services','Calibration, plant operations, and production support services',NULL,250),
 ('SC-CONTRACT','Contract Manufacturing / Subcontracting','Contract manufacturing and assembly subcontracting',NULL,260),
 ('SC-FREIGHT','Freight, Logistics & Customs','Road, sea, air freight, and customs brokerage',NULL,270),
 ('SC-WHSE','Warehousing & Cold Chain','Warehousing, storage, and temperature-controlled logistics',NULL,280),
 ('SC-QC','Quality, Lab & Testing','Testing, certification, and inspection services',NULL,290),
 ('SC-TEMPWK','Temporary Works / Site Services','Scaffolding, temporary site facilities, and access equipment',NULL,310),
 ('SC-PROCNRG','Process Energy / Utility Input','Steam, compressed air, and process gases used in production',NULL,320)
 ) INSERT INTO master.commodity_category(id,tenant_id,code,name,description,parent_id,sort_order,metadata,status,created_by)
 SELECT md5('wave5:commodity-category:'||v_tid::text||':'||s.code)::uuid,v_tid,s.code,s.name,s.description,NULL,s.sort_order,'{"_seed":{"pack":"spend-taxonomy-business-intents","version":"2.0.0"}}','active',v_actor FROM seed_rows s
 ON CONFLICT(tenant_id,code) DO UPDATE SET name=excluded.name,description=excluded.description,parent_id=NULL,sort_order=excluded.sort_order,metadata=excluded.metadata,status='active',updated_at=now(),updated_by=v_actor
 WHERE (master.commodity_category.name,master.commodity_category.description,master.commodity_category.parent_id,master.commodity_category.sort_order,master.commodity_category.metadata,master.commodity_category.status) IS DISTINCT FROM (excluded.name,excluded.description,NULL,excluded.sort_order,excluded.metadata,'active'::master.catalog_record_status_d);
 WITH seed_rows(code,name,description,parent_code,sort_order) AS (VALUES
 ('SC-IT-HW','Hardware & End-user Devices','Laptops, desktops, monitors, peripherals, and mobile devices','SC-IT',11),
 ('SC-IT-SW','Software & SaaS','Perpetual licenses, SaaS subscriptions, and custom development','SC-IT',12),
 ('SC-IT-CLOUD','Cloud & Hosting','IaaS, PaaS, data centre colocation, and managed hosting','SC-IT',13),
 ('SC-IT-SVC','IT Services & Support','Help desk, managed services, system integration, and consulting','SC-IT',14),
 ('SC-IT-SEC','Cybersecurity','Security software, penetration testing, SOC, and identity management','SC-IT',15),
 ('SC-TELCO-VOICE','Voice & Telephony','PBX, SIP trunking, call centre, and PSTN services','SC-TELCO',21),
 ('SC-TELCO-DATA','Data & Internet','MPLS, SD-WAN, broadband, and dedicated internet access','SC-TELCO',22),
 ('SC-TELCO-MOB','Mobile & Wireless','Mobile plans, SIM management, and wireless infrastructure','SC-TELCO',23),
 ('SC-OFFICE-SUP','Office Supplies & Stationery','Paper, pens, toner, and general stationery','SC-OFFICE',31),
 ('SC-OFFICE-FURN','Office Furniture','Desks, chairs, filing cabinets, and modular workstations','SC-OFFICE',32),
 ('SC-OFFICE-EQUIP','Office Equipment & Machines','Printers, copiers, shredders, and AV equipment','SC-OFFICE',33),
 ('SC-OFFICE-PRINT','Printing & Reprographics','Commercial printing, signage, and document services','SC-OFFICE',34),
 ('SC-HR-RECRUIT','Recruitment & Staffing','Job boards, recruitment agencies, and assessment tools','SC-HR',41),
 ('SC-HR-TRAIN','Training & Development','Instructor-led, e-learning, and certification programmes','SC-HR',42),
 ('SC-HR-BEN','Employee Benefits','Health plans, retirement, wellness, and perquisites','SC-HR',43),
 ('SC-HR-PAYROLL','Payroll Services','Payroll processing, WPS, and HR technology platforms','SC-HR',44),
 ('SC-TRAVEL-AIR','Air Travel','Business and economy class flights, charter, and private aviation','SC-TRAVEL',51),
 ('SC-TRAVEL-HOTEL','Accommodation & Hotels','Hotels, serviced apartments, and short-term rentals','SC-TRAVEL',52),
 ('SC-TRAVEL-GROUND','Ground Transportation','Car rentals, taxis, ride-share, and chauffeur services','SC-TRAVEL',53),
 ('SC-TRAVEL-EVENTS','Events & Conferences','Event management, venue hire, and conference sponsorship','SC-TRAVEL',54),
 ('SC-PROF-LEGAL','Legal Services','Corporate law, litigation, IP, and regulatory counsel','SC-PROF',61),
 ('SC-PROF-AUDIT','Audit & Accounting','External audit, tax advisory, and forensic accounting','SC-PROF',62),
 ('SC-PROF-CONSULT','Management Consulting','Strategy, transformation, and operational consulting','SC-PROF',63),
 ('SC-PROF-ENG','Engineering Consulting','Feasibility studies, design review, and technical advisory','SC-PROF',64),
 ('SC-MKTG-DIGITAL','Digital Marketing & Media','SEO, SEM, social media, programmatic, and influencer marketing','SC-MKTG',71),
 ('SC-MKTG-TRAD','Traditional Advertising','Print, TV, radio, outdoor, and experiential campaigns','SC-MKTG',72),
 ('SC-MKTG-PR','PR & Communications','Public relations, corporate communications, and crisis management','SC-MKTG',73),
 ('SC-MKTG-CX','Customer Experience & Research','Market research, CX design, mystery shopping, and NPS programmes','SC-MKTG',74),
 ('SC-FAC-RENT','Rent & Lease Payments','Office, retail, and warehouse lease and licence fees','SC-FAC',81),
 ('SC-FAC-MAINT','Facility Maintenance','HVAC, electrical, plumbing, and general building maintenance','SC-FAC',82),
 ('SC-FAC-CLEAN','Cleaning & Janitorial','Office cleaning, washroom supplies, and pest control','SC-FAC',83),
 ('SC-FAC-SECUR','Facility Security','Guards, CCTV, access control, and alarm monitoring','SC-FAC',84),
 ('SC-UTIL-ELEC','Electricity','Grid electricity consumption and renewable energy certificates','SC-UTIL',91),
 ('SC-UTIL-WATER','Water & Sewerage','Municipal water supply and wastewater discharge','SC-UTIL',92),
 ('SC-UTIL-GAS','Natural Gas','Piped natural gas for heating, cooling, and catering','SC-UTIL',93),
 ('SC-UTIL-WASTE','Waste Management','General waste collection, recycling, and hazardous waste disposal','SC-UTIL',94),
 ('SC-FLEET-VEH','Vehicle Purchase & Lease','Vehicle purchases default to CAPEX; leases may override to OPEX','SC-FLEET',101),
 ('SC-FLEET-FUEL','Fleet Fuel','Petrol, diesel, CNG, and EV charging for fleet vehicles','SC-FLEET',102),
 ('SC-FLEET-MAINT','Fleet Maintenance','Scheduled servicing, tyres, bodywork, and roadside assistance','SC-FLEET',103),
 ('SC-INS-PROP','Property & Asset Insurance','Fire, theft, all-risk, and machinery breakdown coverage','SC-INS',111),
 ('SC-INS-LIAB','Liability Insurance','Public, product, professional indemnity, and D&O liability','SC-INS',112),
 ('SC-INS-EMP','Employee Insurance','Group medical, life, personal accident, and workers compensation','SC-INS',113),
 ('SC-BANK-FEE','Bank Fees & Charges','Account fees, payment processing, and LC/BG charges','SC-BANK',121),
 ('SC-BANK-FX','Foreign Exchange','Spot, forward, and hedging FX transactions','SC-BANK',122),
 ('SC-BANK-TREAS','Treasury Services','Cash management, pooling, and investment advisory','SC-BANK',123),
 ('SC-TAX-CORP','Corporate Taxes','Income tax, withholding tax, and deferred tax provisions','SC-TAX',131),
 ('SC-TAX-DUTY','Import Duties & Customs','Customs duties, anti-dumping, and countervailing levies','SC-TAX',132),
 ('SC-TAX-STAT','Statutory Fees & Levies','Municipality fees, government licences, and regulatory levies','SC-TAX',133),
 ('SC-SAFETY-SEC','Physical Security','Manned guarding, K9, and executive protection services','SC-SAFETY',141),
 ('SC-SAFETY-HSE','Health, Safety & Environment','HSE consulting, PPE, fire safety, and incident investigation','SC-SAFETY',142),
 ('SC-SAFETY-COMP','Compliance & Regulatory','Third-party audits, certification, and compliance monitoring','SC-SAFETY',143),
 ('SC-ENV-WASTE','Waste & Recycling','Waste segregation, recycling programmes, and circular economy','SC-ENV',151),
 ('SC-ENV-CARBON','Carbon & Emissions','Carbon footprint measurement, offsets, and reporting','SC-ENV',152),
 ('SC-ENV-REMEDN','Environmental Remediation','Soil, water, and air remediation and decontamination','SC-ENV',153),
 ('SC-OUTSRC-BPO','Business Process Outsourcing','Finance, HR, and procurement process outsourcing','SC-OUTSRC',161),
 ('SC-OUTSRC-SHARED','Shared Service Centre','Centralised accounting, payroll, and IT help desk','SC-OUTSRC',162),
 ('SC-OUTSRC-TEMP','Temporary Staffing','Contingent workers, seasonal labour, and staff augmentation','SC-OUTSRC',163),
 ('SC-SUBS-LIC','Software Licenses','Named/concurrent licences, maintenance, and upgrade entitlements','SC-SUBS',171),
 ('SC-SUBS-MEMB','Memberships & Associations','Industry bodies, chambers of commerce, and professional memberships','SC-SUBS',172),
 ('SC-SUBS-PUB','Publications & Subscriptions','Journals, databases, news feeds, and research subscriptions','SC-SUBS',173),
 ('SC-RAW-METAL','Metals & Alloys','Steel, aluminium, copper, and specialty alloys','SC-RAW',201),
 ('SC-RAW-CHEM','Chemicals & Polymers','Base chemicals, resins, polymers, and solvents','SC-RAW',202),
 ('SC-RAW-AGRI','Agricultural Raw Materials','Cotton, jute, rubber, timber, and other agri commodities','SC-RAW',203),
 ('SC-COMP-MECH','Mechanical Components','Bearings, gears, fasteners, valves, and pumps','SC-COMP',211),
 ('SC-COMP-ELEC','Electrical & Electronic Comps','PCBs, connectors, relays, sensors, and semiconductors','SC-COMP',212),
 ('SC-COMP-STRUCT','Structural Components','Beams, columns, plates, and prefabricated sections','SC-COMP',213),
 ('SC-PKG-PRIMARY','Primary Packaging','Bottles, blister packs, pouches, and vials','SC-PKG',221),
 ('SC-PKG-SECONDARY','Secondary Packaging','Cartons, boxes, shrink wrap, and labels','SC-PKG',222),
 ('SC-PKG-TRANSIT','Transit Packaging','Pallets, stretch film, crates, and dunnage','SC-PKG',223),
 ('SC-CONSUM-CHEM','Industrial Chemicals','Process chemicals, catalysts, and reagents','SC-CONSUM',231),
 ('SC-CONSUM-LAB','Laboratory Consumables','Glassware, pipettes, filters, and test kits','SC-CONSUM',232),
 ('SC-CONSUM-CLEAN','Cleaning Consumables','Solvents, detergents, wipes, and cleanroom supplies','SC-CONSUM',233),
 ('SC-MRO-SPARE','Spare Parts','OEM and aftermarket replacement parts','SC-MRO',241),
 ('SC-MRO-TOOL','Maintenance Tools','Hand tools, power tools, and diagnostic equipment','SC-MRO',242),
 ('SC-MRO-SUPPLY','Maintenance Supplies','Lubricants, adhesives, tapes, and safety consumables','SC-MRO',243),
 ('SC-PRODSVC-CALIB','Calibration Services','Instrument calibration, metrology, and certification','SC-PRODSVC',251),
 ('SC-PRODSVC-PLANT','Plant Operations Services','Commissioning, shutdown, and turnaround support','SC-PRODSVC',252),
 ('SC-CONTRACT-MFG','Contract Manufacturing','Toll manufacturing, white-label, and private-label production','SC-CONTRACT',261),
 ('SC-CONTRACT-ASM','Assembly Subcontracting','Sub-assembly, kitting, and final assembly outsourcing','SC-CONTRACT',262),
 ('SC-FREIGHT-ROAD','Road Freight','FTL, LTL, and last-mile delivery','SC-FREIGHT',271),
 ('SC-FREIGHT-SEA','Sea Freight','FCL, LCL, breakbulk, and tanker shipping','SC-FREIGHT',272),
 ('SC-FREIGHT-AIR','Air Freight','Express air, charter, and consolidated airfreight','SC-FREIGHT',273),
 ('SC-FREIGHT-CUST','Customs & Brokerage','Customs clearance, brokerage, and trade compliance','SC-FREIGHT',274),
 ('SC-WHSE-STORE','Warehousing & Storage','Ambient, bonded, and free-zone warehouse space','SC-WHSE',281),
 ('SC-WHSE-COLD','Cold Chain Services','Refrigerated storage, reefer transport, and cold-room ops','SC-WHSE',282),
 ('SC-QC-TEST','Testing & Analysis','Chemical, physical, microbiological, and mechanical testing','SC-QC',291),
 ('SC-QC-CERT','Certification & Accreditation','ISO, HACCP, GMP, and product certification','SC-QC',292),
 ('SC-QC-INSPECT','Inspection Services','Pre-shipment, in-process, and third-party inspection','SC-QC',293),
 ('SC-CAPEQUIP-MACH','Machinery','Industrial machinery, CNC, and automated equipment','SC-CAPEQUIP',301),
 ('SC-CAPEQUIP-LINE','Production Lines','Assembly lines, conveyors, and process equipment trains','SC-CAPEQUIP',303),
 ('SC-CAPEQUIP-TOOL','Tooling & Fixtures','Dies, moulds, jigs, and special-purpose tooling','SC-CAPEQUIP',302),
 ('SC-TEMPWK-SCAF','Scaffolding & Access','Scaffolding erection, aerial platforms, and rope access','SC-TEMPWK',311),
 ('SC-TEMPWK-SITE','Site Services','Portable cabins, site welfare, and temporary utilities','SC-TEMPWK',312),
 ('SC-PROCNRG-STEAM','Steam & Thermal','Industrial steam generation and thermal energy supply','SC-PROCNRG',321),
 ('SC-PROCNRG-COMP','Compressed Air & Gases','Compressed air, nitrogen, oxygen, and specialty gases','SC-PROCNRG',322)
 ) INSERT INTO master.commodity_category(id,tenant_id,code,name,description,parent_id,sort_order,metadata,status,created_by)
 SELECT md5('wave5:commodity-category:'||v_tid::text||':'||s.code)::uuid,v_tid,s.code,s.name,s.description,p.id,s.sort_order,'{"_seed":{"pack":"spend-taxonomy-business-intents","version":"2.0.0"}}','active',v_actor FROM seed_rows s JOIN master.commodity_category p ON p.tenant_id=v_tid AND p.code=s.parent_code
 ON CONFLICT(tenant_id,code) DO UPDATE SET name=excluded.name,description=excluded.description,parent_id=excluded.parent_id,sort_order=excluded.sort_order,metadata=excluded.metadata,status='active',updated_at=now(),updated_by=v_actor
 WHERE (master.commodity_category.name,master.commodity_category.description,master.commodity_category.parent_id,master.commodity_category.sort_order,master.commodity_category.metadata,master.commodity_category.status) IS DISTINCT FROM (excluded.name,excluded.description,excluded.parent_id,excluded.sort_order,excluded.metadata,'active'::master.catalog_record_status_d);
 IF (SELECT count(*) FROM master.commodity_category WHERE tenant_id=v_tid AND metadata->'_seed'->>'pack'='spend-taxonomy-business-intents')<>125 THEN RAISE EXCEPTION 'commodity category count mismatch'; END IF;
 IF EXISTS(SELECT 1 FROM master.commodity_category c LEFT JOIN master.commodity_category p ON p.tenant_id=c.tenant_id AND p.id=c.parent_id WHERE c.tenant_id=v_tid AND c.parent_id IS NOT NULL AND p.id IS NULL) THEN RAISE EXCEPTION 'commodity category orphan'; END IF; END $pack$;
