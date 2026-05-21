-- ============================================================================
-- TECHNOSTAT GROUP — NAMED PRODUCT CATALOG (ICT + Construction)
-- ============================================================================
-- File:     400_catalog/002_technostat_named_catalog.sql
-- Schemas:  master.product, master.item
-- Purpose:  Industry-realistic named products for Technostat Group:
--             • 24 ICT products  (hardware, software, cloud, services, telecom)
--             • 13 construction products (structural, concrete, electrical, HVAC, PPE)
--           Items created for every product × every active company code
--           (TKSA, SSK, TEGY, SDTX — 4 codes → 37 × 4 = 148 items).
-- Codes:    Products: PRD-{CATEGORY}-{SEQ}
--           Items:    ITM-{CATEGORY}-{SEQ}  (per company code)
-- Depends:  020_universal/010_spend_taxonomy/020_spend_categories.sql
--           020_technostat/003_technostat_production_seed.sql (P03 company codes)
-- Idempotent: Yes — ON CONFLICT ... DO UPDATE throughout
-- ============================================================================

DO $tk_named_catalog$
DECLARE
    v_tid        uuid;
    v_su         uuid := '00000000-0000-0000-0000-000000000000';
    v_pack       text := 'technostat_named_catalog';
    v_version    text := '1.0.0';
    v_seed_meta  jsonb;
    v_prod_count int;
    v_item_count int;
BEGIN

    -- ── STAGE A: Resolve tenant ───────────────────────────────────────────
    SELECT id INTO v_tid FROM master.tenant WHERE code = 'technostat';
    IF v_tid IS NULL THEN
        RAISE EXCEPTION '[technostat_named_catalog] tenant "technostat" not found — run 003_technostat_production_seed.sql first';
    END IF;

    v_seed_meta := jsonb_build_object('_seed', jsonb_build_object(
        'pack',      v_pack,
        'version',   v_version,
        'seeded_at', now()::text
    ));

    -- ── STAGE B: Named Products ───────────────────────────────────────────
    --   commodity_category_id resolved via LEFT JOIN on master.commodity_category
    --   construction products have no universal commodity_category (sc_code = NULL)

    INSERT INTO master.product (
        tenant_id,
        code,
        name,
        description,
        commodity_category_id,
        product_type,
        unit_of_measure,
        base_price,
        currency_code,
        is_taxable,
        metadata,
        status,
        created_by
    )
    SELECT
        v_tid,
        p.code,
        p.name,
        p.description,
        (SELECT id FROM master.commodity_category WHERE tenant_id = v_tid AND code = p.ccat_code),
        p.product_type,
        p.uom,
        p.base_price,
        'SAR',
        true,
        v_seed_meta,
        'active',
        v_su
    FROM (VALUES
        -- ── IT Hardware ─────────────────────────────────────────────────────
        ('PRD-COMP-001', 'Dell PowerEdge R750 Rack Server',
            '2U rack, 2x Intel Xeon Gold 6326, 256GB DDR4, 4x960GB NVMe SSD',
            'IC-IT-EQ', 'SC-IT-HW', 'physical', 'EA',   28500.00::numeric),
        ('PRD-COMP-002', 'HPE ProLiant DL380 Gen10 Server',
            '2U rack, 2x Xeon Silver 4214R, 128GB DDR4, 6x900GB SAS 10K',
            'IC-IT-EQ', 'SC-IT-HW', 'physical', 'EA',   22800.00),
        ('PRD-NET-001', 'Cisco Catalyst 9300-48P PoE Switch',
            '48-port PoE+, 4x25GE SFP28 uplinks, stackable, DNA Center ready',
            'IC-IT-EQ', 'SC-IT-HW', 'physical', 'EA',   12400.00),
        ('PRD-NET-002', 'Fortinet FortiGate 200F NGFW',
            '20Gbps firewall, 5Gbps IPS, SSL-VPN gateway, SD-WAN, 18x1GE ports',
            'IC-IT-EQ', 'SC-IT-HW', 'physical', 'EA',    9750.00),
        ('PRD-NET-003', 'Cisco Meraki MX85 SD-WAN Appliance',
            'Cloud-managed, 500Mbps throughput, HA WAN, bundled 5yr license',
            'IC-IT-EQ', 'SC-IT-HW', 'physical', 'EA',    7200.00),
        ('PRD-PWR-001', 'APC Smart-UPS 3000VA Tower UPS',
            '2700W output, LCD display, hot-swap batteries, NMC3 card slot',
            'IC-IT-EQ', 'SC-IT-HW', 'physical', 'EA',    4200.00),
        ('PRD-LAP-001', 'HP EliteBook 840 G9 Laptop',
            '14in FHD IPS, Intel Core i7-1265U, 16GB DDR5, 512GB PCIe SSD',
            'IC-IT-EQ', 'SC-IT-HW', 'physical', 'EA',    5850.00),
        ('PRD-LAP-002', 'Apple MacBook Pro 16in M3 Pro',
            '12-core CPU, 18-core GPU, 18GB RAM, 512GB SSD, macOS Sonoma',
            'IC-IT-EQ', 'SC-IT-HW', 'physical', 'EA',    9600.00),
        ('PRD-DSP-001', 'Dell UltraSharp U2722D 27in Monitor',
            '4K UHD IPS, USB-C 90W PD, RJ45, daisy-chain DisplayPort out',
            'IC-IT-EQ', 'SC-IT-HW', 'physical', 'EA',    2100.00),
        -- ── IT Security Appliances ──────────────────────────────────────────
        ('PRD-SEC-001', 'Cisco ISE 3595 NAC Appliance',
            'Network access control, 25k concurrent endpoints, dual 10GbE',
            'IC-IT-EQ', 'SC-IT-SEC', 'physical', 'EA',  38500.00),
        ('PRD-SEC-002', 'Palo Alto PA-440 Next-Gen Firewall',
            '3.8Gbps threat prevention, ML-powered NGFW, 16x1GE ports',
            'IC-IT-EQ', 'SC-IT-SEC', 'physical', 'EA',  14800.00),
        -- ── Office Equipment ────────────────────────────────────────────────
        ('PRD-OFE-001', 'Canon imageRUNNER 4545i MFP',
            'A3 colour MFP, 45ppm, duplex ADF, scan-to-email, PCL/PS drivers',
            'IC-OFF-EQ', 'SC-OFFICE-EQUIP', 'physical', 'EA',  7400.00),
        ('PRD-OFE-002', 'Epson EB-L615U Laser Projector',
            'WUXGA 6000-lumen laser, 360-degree tilt, portrait mode capable',
            'IC-OFF-EQ', 'SC-OFFICE-EQUIP', 'physical', 'EA',  5200.00),
        -- ── Software & Subscriptions ────────────────────────────────────────
        ('PRD-SW-001', 'Microsoft 365 Business Premium',
            'Cloud productivity suite with Defender and Intune, per user/yr',
            'IC-SUBSVC', 'SC-IT-SW', 'digital', 'ANN',    1100.00),
        ('PRD-SW-002', 'AutoCAD LT 2025 Annual Subscription',
            '2D CAD drafting, cloud storage 5GB, Autodesk account, per seat/yr',
            'IC-SUBSVC', 'SC-IT-SW', 'digital', 'ANN',    2750.00),
        ('PRD-SW-003', 'Adobe Creative Cloud All Apps',
            'Design, video, photography and web tools, 100GB cloud, per seat/yr',
            'IC-SUBSVC', 'SC-IT-SW', 'digital', 'ANN',    3100.00),
        ('PRD-SUBS-001', 'Zoom Business Annual License',
            'HD video meetings, 300-participant limit, team chat, per seat/yr',
            'IC-SUBSVC', 'SC-SUBS-LIC', 'digital', 'ANN',  650.00),
        -- ── Cloud Services ──────────────────────────────────────────────────
        ('PRD-CLD-001', 'Microsoft Azure Reserved Capacity 1yr',
            'Dv5 series compute reservation, flexible scope, pay-monthly billing',
            'IC-SUBSVC', 'SC-IT-CLOUD', 'digital', 'ANN', 18000.00),
        ('PRD-CLD-002', 'AWS EC2 Reserved Instance c6i.2xlarge',
            '8 vCPU, 16GB RAM, Linux, 1yr term, us-east-1, pay-monthly',
            'IC-SUBSVC', 'SC-IT-CLOUD', 'digital', 'ANN', 14500.00),
        -- ── IT Services ─────────────────────────────────────────────────────
        ('PRD-ITSVC-001', 'Onsite IT Engineer - Day Rate',
            'Senior IT engineer, full working day on-site, Mon-Fri, per day',
            'IC-ITSVC', 'SC-IT-SVC', 'service', 'DAD',    1200.00),
        ('PRD-ITSVC-002', 'Network Configuration Service',
            'Switch, router and firewall config and commissioning, per hour',
            'IC-ITSVC', 'SC-IT-SVC', 'service', 'HUR',     350.00),
        ('PRD-ITSVC-003', 'IT Helpdesk Support Monthly Retainer',
            'Tier 1 and 2 remote support, 8x5 SLA, up to 50 users, per month',
            'IC-ITSVC', 'SC-IT-SVC', 'service', 'MON',    4500.00),
        -- ── Telecom ─────────────────────────────────────────────────────────
        ('PRD-TEL-001', 'STC Enterprise Mobile SIM Plan 12mo',
            'Unlimited local calls, 100GB data, international roaming, per SIM',
            'IC-SUBSVC', 'SC-TELCO-MOB', 'service', 'ANN',  1800.00),
        ('PRD-TEL-002', 'Metro Fibre Leased Line 1Gbps',
            'Dedicated symmetric fibre, 99.9% SLA, static IP, monthly charge',
            'IC-ITSVC', 'SC-TELCO-DATA', 'service', 'MON',  3500.00),
        -- ── Structural Materials (IC-STRUCT, no universal commodity category) ────
        ('PRD-STRL-001', 'Structural Steel Beam IPE 300',
            'Hot-rolled I-beam, S275JR grade, SABIC certified, per linear metre',
            'IC-STRUCT', NULL::text, 'physical', 'MTR',    485.00),
        ('PRD-STRL-002', 'Rebar Grade 60 12mm Deformed Bar',
            'Hot-rolled deformed steel bar, BS 4449, SABIC, per kg',
            'IC-STRUCT', NULL, 'physical', 'KGM',    3.80),
        ('PRD-STRL-003', 'GI Corrugated Roofing Sheet 0.5mm',
            'Galvanised steel sheet, AZ150 coating, 2.4m length, per sheet',
            'IC-STRUCT', NULL, 'physical', 'SH',    68.00),
        -- ── Concrete & Cement ───────────────────────────────────────────────
        ('PRD-CONC-001', 'Ready-Mix Concrete Grade C30',
            'Sulphate-resistant, pump-ready, per cubic metre delivered on-site',
            'IC-CONC', NULL, 'physical', 'MTQ',   380.00),
        ('PRD-CONC-002', 'Ordinary Portland Cement 50kg Bag',
            'ASTM C150 Type I/II, ARAMCO-approved plant, per bag',
            'IC-CONC', NULL, 'physical', 'BX',    24.00),
        -- ── Construction Electrical ─────────────────────────────────────────
        ('PRD-ELEC-001', 'XLPE Armoured Cable 3Cx16mm2',
            'IEC 60502-1, 0.6/1kV rating, SWA, PVC outer sheath, per metre',
            'IC-ELEC', NULL, 'physical', 'MTR',    42.00),
        ('PRD-ELEC-002', '3-Phase MCB 63A C-Curve',
            'IEC 60898-2, 6kA breaking capacity, DIN rail, Schneider or equiv.',
            'IC-ELEC', NULL, 'physical', 'EA',   185.00),
        ('PRD-ELEC-003', 'LED Industrial High-Bay Light 200W IP65',
            '28000 lumen, 5000K, IK10 impact rated, 50000h lifetime, per unit',
            'IC-ELEC', NULL, 'physical', 'EA',   420.00),
        -- ── Mechanical & HVAC ───────────────────────────────────────────────
        ('PRD-MECH-001', 'Air Handling Unit 10000 CFM',
            'Draw-through AHU, R-410A, AHRI 430 certified, 10000 CFM capacity',
            'IC-MECH', NULL, 'physical', 'EA', 28500.00),
        ('PRD-MECH-002', 'MS Pipe Schedule 40 1in x 6m',
            'ASTM A53 Grade B, galvanised, plain ends, 6m length per piece',
            'IC-MECH', NULL, 'physical', 'EA',   145.00),
        -- ── PPE & Safety ────────────────────────────────────────────────────
        ('PRD-PPE-001', 'MSA V-Gard Safety Helmet',
            'ANSI Z89.1 Type I Class E, 6-point Fas-Trac III suspension, white',
            'IC-PPE', 'SC-SAFETY-HSE', 'physical', 'EA',    45.00),
        ('PRD-PPE-002', 'Full-Body Safety Harness EN361',
            'Class T, dual-leg energy-absorbing lanyard, 150kg SWL, EN361',
            'IC-PPE', 'SC-SAFETY-HSE', 'physical', 'EA',   185.00),
        ('PRD-PPE-003', 'Safety Boots Steel Toe S3 Class',
            'EN ISO 20345 S3 rated, slip-resistant, water-resistant, per pair',
            'IC-PPE', 'SC-SAFETY-HSE', 'physical', 'PR',   220.00)
    ) AS p(code, name, description, ccat_code, sc_code, product_type, uom, base_price)
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name              = EXCLUDED.name,
        description       = EXCLUDED.description,
        commodity_category_id = EXCLUDED.commodity_category_id,
        product_type      = EXCLUDED.product_type,
        unit_of_measure   = EXCLUDED.unit_of_measure,
        base_price        = EXCLUDED.base_price,
        currency_code     = EXCLUDED.currency_code,
        metadata          = master.product.metadata
                            || jsonb_build_object('_seed', jsonb_build_object(
                                   'pack',      v_pack,
                                   'version',   v_version,
                                   'seeded_at', now()::text
                               )),
        updated_at        = now(),
        updated_by        = v_su;

    -- ── STAGE C: Items (one per product × company code) ───────────────────
    --   valuation_method: standard_cost for service/subscription UoMs,
    --                     weighted_avg for physical/by-unit UoMs
    --   has_serial_tracking: true for serialised hardware (servers, network, laptops)
    --   has_lot_tracking: true for bulk construction materials (rebar, concrete)

    INSERT INTO master.item (
        tenant_id,
        company_code_id,
        code,
        name,
        product_id,
        commodity_category_id,
        valuation_method,
        standard_cost,
        uom_code,
        has_lot_tracking,
        has_serial_tracking,
        metadata,
        status,
        created_by
    )
    SELECT
        v_tid,
        cc.id,
        'ITM-' || substring(p.code from 5),   -- PRD-COMP-001 → ITM-COMP-001
        p.name,
        p.id,
        p.commodity_category_id,
        CASE
            WHEN p.unit_of_measure IN ('ANN', 'MON', 'DAD', 'HUR', 'LS')
                THEN 'standard_cost'
            ELSE 'weighted_avg'
        END,
        CASE
            WHEN p.unit_of_measure IN ('ANN', 'MON', 'DAD', 'HUR', 'LS')
                THEN p.base_price
            ELSE NULL
        END,
        p.unit_of_measure,
        -- lot tracking: batched bulk materials (rebar by mill cert, concrete by pour)
        p.code ~ '^PRD-(STRL-002|CONC)',
        -- serial tracking: individually identified hardware assets
        p.code ~ '^PRD-(COMP|NET|LAP|PWR|SEC|OFE|MECH-001)',
        v_seed_meta,
        'active',
        v_su
    FROM master.product p
    CROSS JOIN master.company_code cc
    WHERE p.tenant_id  = v_tid
      AND p.metadata->'_seed'->>'pack' = v_pack
      AND cc.tenant_id = v_tid
      AND cc.status    = 'active'
    ON CONFLICT (tenant_id, company_code_id, code) DO UPDATE SET
        name              = EXCLUDED.name,
        product_id        = EXCLUDED.product_id,
        commodity_category_id = EXCLUDED.commodity_category_id,
        valuation_method  = EXCLUDED.valuation_method,
        standard_cost     = EXCLUDED.standard_cost,
        uom_code          = EXCLUDED.uom_code,
        has_lot_tracking  = EXCLUDED.has_lot_tracking,
        has_serial_tracking = EXCLUDED.has_serial_tracking,
        metadata          = master.item.metadata
                            || jsonb_build_object('_seed', jsonb_build_object(
                                   'pack',      v_pack,
                                   'version',   v_version,
                                   'seeded_at', now()::text
                               )),
        updated_at        = now(),
        updated_by        = v_su;

    -- ── STAGE D: Report ───────────────────────────────────────────────────
    SELECT count(*) INTO v_prod_count
    FROM master.product
    WHERE tenant_id = v_tid
      AND metadata->'_seed'->>'pack' = v_pack;

    SELECT count(*) INTO v_item_count
    FROM master.item
    WHERE tenant_id = v_tid
      AND metadata->'_seed'->>'pack' = v_pack;

    RAISE NOTICE '[technostat_named_catalog] seeded: % products, % items (37 products x 4 company codes)',
        v_prod_count, v_item_count;

END $tk_named_catalog$;
