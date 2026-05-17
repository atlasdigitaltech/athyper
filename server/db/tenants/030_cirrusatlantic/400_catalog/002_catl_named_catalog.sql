-- ============================================================================
-- CIRRUSATLANTIC — NAMED PRODUCT CATALOG (InfoComm / ICT)
-- ============================================================================
-- File:     400_catalog/002_catl_named_catalog.sql
-- Schemas:  master.product, master.item
-- Purpose:  Industry-realistic named products for CirrusAtlantic Ltd (UK InfoComm):
--             •  5 data-centre products    (servers, storage, racks, UPS, cooling)
--             •  5 network products        (core switches, routers, firewalls, Wi-Fi, SD-WAN)
--             •  5 dev-tool subscriptions  (GitHub, Jira, Confluence, Datadog, Terraform)
--             •  4 cloud/managed services  (Azure reserve, CloudFront, SOC, pen-test)
--             •  3 content/media tools     (Adobe CC, Wistia, Canva)
--             •  4 cybersecurity products  (CrowdStrike, Splunk, Qualys, KnowBe4)
--             •  4 professional services   (IT Consultant, Architect, PM, DevOps)
--             •  5 office/workplace items  (MacBook, laptop, monitor, Teams room x2)
--           Items created for every product × 1 company code (CATL).
-- Codes:    Products: PRD-{CATEGORY}-{SEQ}
--           Items:    ITM-{CATEGORY}-{SEQ}
-- Depends:  020_universal/010_spend_taxonomy/020_spend_categories.sql
--           030_cirrusatlantic/100_org_structure/*.sql  (CATL company code)
--           pack_infocomm blueprint (SC-ICT-* spend categories)
-- Idempotent: Yes — ON CONFLICT ... DO UPDATE throughout
-- ============================================================================

DO $catl_named_catalog$
DECLARE
    v_tid        uuid;
    v_su         uuid := '00000000-0000-0000-0000-000000000000';
    v_pack       text := 'catl_named_catalog';
    v_version    text := '1.0.0';
    v_seed_meta  jsonb;
    v_prod_count int;
    v_item_count int;
BEGIN

    -- ── STAGE A: Resolve tenant ───────────────────────────────────────────
    SELECT id INTO v_tid FROM master.tenant WHERE code = 'cirrusatlantic';
    IF v_tid IS NULL THEN
        RAISE EXCEPTION '[catl_named_catalog] tenant "cirrusatlantic" not found — run 000_tenant.sql first';
    END IF;

    v_seed_meta := jsonb_build_object('_seed', jsonb_build_object(
        'pack',      v_pack,
        'version',   v_version,
        'seeded_at', now()::text
    ));

    -- ── STAGE B: Named Products ───────────────────────────────────────────
    --   SC-ICT-* codes are from the pack_infocomm blueprint applied to this tenant.
    --   SC-PROF-CONSULT and SC-OFFICE-EQUIP are from the universal taxonomy.
    --   currency_code = GBP (CirrusAtlantic functional currency).

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
        'GBP',
        true,
        v_seed_meta,
        'active',
        v_su
    FROM (VALUES
        -- ── Data Centre (SC-ICT-DC) ─────────────────────────────────────────
        ('PRD-DC-001', 'Dell PowerEdge R760 2U Rack Server',
            '2U rack, 2x Intel Xeon Gold 6438N, 256GB DDR5, 4x1.92TB NVMe SSD',
            'IC-IT-EQ', 'SC-ICT-DC', 'physical', 'EA',   4850.00::numeric),
        ('PRD-DC-002', 'NetApp AFF A250 All-Flash Storage',
            'NVMe all-flash, 76.8TB raw capacity, dual controller, 2x25GbE',
            'IC-IT-EQ', 'SC-ICT-DC', 'physical', 'EA',  28500.00),
        ('PRD-DC-003', 'APC NetShelter SX 42U Server Rack',
            '42U, 600x1070mm footprint, side panels, blanking plates included',
            'IC-IT-EQ', 'SC-ICT-DC', 'physical', 'EA',   1200.00),
        ('PRD-DC-004', 'APC Symmetra LX 16kVA Modular UPS',
            'Scalable to 16kVA, modular batteries, 3-phase input, SNMP/web card',
            'IC-IT-EQ', 'SC-ICT-DC', 'physical', 'EA',   4800.00),
        ('PRD-DC-005', 'Schneider InRow Cooling Unit 30kW',
            'Precision row cooling, 30kW capacity, rear-door, EC variable fans',
            'IC-IT-EQ', 'SC-ICT-DC', 'physical', 'EA',   6500.00),
        -- ── Network Infrastructure (SC-ICT-NET) ────────────────────────────
        ('PRD-NET-001', 'Cisco Catalyst 9500-40X Core Switch',
            '40x10GE + 2x40GE uplinks, StackWise Virtual, MACsec, IOS-XE',
            'IC-IT-EQ', 'SC-ICT-NET', 'physical', 'EA',  6200.00),
        ('PRD-NET-002', 'Cisco ISR 4451-X Integrated Router',
            '4x1GE WAN + 4x1GE LAN, MPLS, 2500Mbps aggregated throughput',
            'IC-IT-EQ', 'SC-ICT-NET', 'physical', 'EA',  4400.00),
        ('PRD-NET-003', 'Fortinet FortiGate 600E NGFW',
            '36Gbps firewall, 10Gbps threat prevention, SSL-VPN, 2x10GE SFP+',
            'IC-IT-EQ', 'SC-ICT-NET', 'physical', 'EA',  8900.00),
        ('PRD-NET-004', 'Aruba AP-635 Wi-Fi 6E Access Point',
            'Tri-band 6GHz+5GHz+2.4GHz, 6.9Gbps max rate, 802.3at PoE input',
            'IC-IT-EQ', 'SC-ICT-NET', 'physical', 'EA',   680.00),
        ('PRD-NET-005', 'Juniper SRX380 SD-WAN Gateway',
            'Integrated SD-WAN and SRX firewall, 10x1GE + 2x10GE, dual PSU',
            'IC-IT-EQ', 'SC-ICT-NET', 'physical', 'EA',  3200.00),
        -- ── Software Dev Tools (SC-ICT-DEV) ────────────────────────────────
        ('PRD-DEV-001', 'GitHub Enterprise Cloud Per Seat',
            'Unlimited private repos, Actions 50GB, Copilot integration, per seat/yr',
            'IC-SUBSVC', 'SC-ICT-DEV', 'digital', 'ANN',  180.00),
        ('PRD-DEV-002', 'Jira Software Cloud Per Seat',
            'Issue tracking, kanban/scrum boards, roadmaps, reporting, per seat/yr',
            'IC-SUBSVC', 'SC-ICT-DEV', 'digital', 'ANN',   96.00),
        ('PRD-DEV-003', 'Confluence Cloud Per Seat',
            'Team wiki, spaces, page templates, Jira integration, per seat/yr',
            'IC-SUBSVC', 'SC-ICT-DEV', 'digital', 'ANN',   60.00),
        ('PRD-DEV-004', 'Datadog APM Per Host Monthly',
            'APM, infra monitoring, log management, dashboards, per host/mo',
            'IC-SUBSVC', 'SC-ICT-DEV', 'digital', 'MON',   23.00),
        ('PRD-DEV-005', 'Terraform Enterprise Per Seat',
            'IaC at scale, private module registry, SSO, audit logs, per seat/yr',
            'IC-SUBSVC', 'SC-ICT-DEV', 'digital', 'ANN',  240.00),
        -- ── Cloud & Managed Services (SC-ICT-DC) ────────────────────────────
        ('PRD-CLD-001', 'Microsoft Azure Reserved Capacity 1yr',
            'Enterprise Dv5 compute reservation, flexible scope, pay-monthly billing',
            'IC-SUBSVC', 'SC-ICT-DC', 'digital', 'ANN',  12000.00),
        ('PRD-CLD-002', 'AWS CloudFront CDN Monthly',
            '50TB transfer, 10M HTTPS requests/mo, Lambda@Edge, per month',
            'IC-SUBSVC', 'SC-ICT-DC', 'digital', 'MON',    850.00),
        ('PRD-MSVC-001', 'Managed SOC Service Monthly Retainer',
            '24x7 threat monitoring, 500 EPS, SIEM, incident response, per month',
            'IC-ITSVC', 'SC-ICT-CYBER', 'service', 'MON',  4200.00),
        ('PRD-MSVC-002', 'Penetration Testing Full Scope',
            'Web app + infra + social engineering, CREST-certified team, lump sum',
            'IC-ITSVC', 'SC-ICT-CYBER', 'service', 'LS',   8500.00),
        -- ── Content & Media Tools (SC-ICT-CONTENT) ─────────────────────────
        ('PRD-CNT-001', 'Adobe Creative Cloud All Apps Per Seat',
            'Design, video, photography and web tools, 100GB cloud, per seat/yr',
            'IC-SUBSVC', 'SC-ICT-CONTENT', 'digital', 'ANN',  660.00),
        ('PRD-CNT-002', 'Wistia Video Hosting Business Plan',
            'Unlimited video uploads, analytics, custom player, per year',
            'IC-SUBSVC', 'SC-ICT-CONTENT', 'digital', 'ANN', 1800.00),
        ('PRD-CNT-003', 'Canva Teams Per Seat Annual',
            'Design templates, brand kit, content scheduler, approval flow, per seat/yr',
            'IC-SUBSVC', 'SC-ICT-CONTENT', 'digital', 'ANN',   95.00),
        -- ── Cybersecurity (SC-ICT-CYBER) ────────────────────────────────────
        ('PRD-CYB-001', 'CrowdStrike Falcon Endpoint Per Device',
            'Next-gen AV, EDR, threat intelligence, device firewall, per device/yr',
            'IC-SUBSVC', 'SC-ICT-CYBER', 'digital', 'ANN',  120.00),
        ('PRD-CYB-002', 'Splunk SIEM Per GB Per Day Ingested',
            'Indexing, ML-based SIEM, SOAR integration, per GB/day ingested',
            'IC-SUBSVC', 'SC-ICT-CYBER', 'digital', 'DAD',  150.00),
        ('PRD-CYB-003', 'Qualys VMDR Per IP Annual',
            'Vulnerability management, detection and remediation, per IP/yr',
            'IC-SUBSVC', 'SC-ICT-CYBER', 'digital', 'ANN',   48.00),
        ('PRD-CYB-004', 'KnowBe4 Security Awareness Per Seat',
            'Phishing simulations, training modules, risk scoring, per seat/yr',
            'IC-SUBSVC', 'SC-ICT-CYBER', 'digital', 'ANN',   30.00),
        -- ── Professional Services (SC-PROF-CONSULT / SC-ICT-DEV) ───────────
        ('PRD-PSVC-001', 'IT Consultant - Day Rate',
            'Senior technology consultant, on-site or remote, Mon-Fri, per day',
            'IC-PROFSVC', 'SC-PROF-CONSULT', 'service', 'DAD',  650.00),
        ('PRD-PSVC-002', 'Solution Architect - Day Rate',
            'Principal architect, cloud and enterprise design, stakeholder-facing, per day',
            'IC-PROFSVC', 'SC-PROF-CONSULT', 'service', 'DAD',  950.00),
        ('PRD-PSVC-003', 'Project Manager - Day Rate',
            'Senior PM, PMP certified, agile and waterfall delivery, per day',
            'IC-PROFSVC', 'SC-PROF-CONSULT', 'service', 'DAD',  700.00),
        ('PRD-PSVC-004', 'DevOps Engineer - Day Rate',
            'Senior DevOps, CI/CD pipelines, Kubernetes, IaC, per day',
            'IC-PROFSVC', 'SC-ICT-DEV', 'service', 'DAD',  750.00),
        -- ── Office & Workplace (SC-OFFICE-EQUIP) ────────────────────────────
        ('PRD-LAP-001', 'Apple MacBook Pro 14in M3',
            '8-core CPU, 10-core GPU, 16GB RAM, 512GB SSD, Liquid Retina, macOS',
            'IC-IT-EQ', 'SC-OFFICE-EQUIP', 'physical', 'EA',  1999.00),
        ('PRD-LAP-002', 'Dell Latitude 7440 Laptop',
            '14in FHD+ IPS, Intel Core i7-1365U, 16GB LPDDR5, 512GB PCIe SSD',
            'IC-IT-EQ', 'SC-OFFICE-EQUIP', 'physical', 'EA',  1450.00),
        ('PRD-DSP-001', 'LG 27in 4K UHD IPS Monitor',
            '3840x2160, USB-C 60W PD, AMD FreeSync, 99% sRGB, height-adjustable',
            'IC-OFF-EQ', 'SC-OFFICE-EQUIP', 'physical', 'EA',   380.00),
        ('PRD-CONF-001', 'Yealink MVC640 Teams Room System',
            'MS Teams certified, UVC80 4K PTZ camera, CP960 speakerphone, hub',
            'IC-IT-EQ', 'SC-OFFICE-EQUIP', 'physical', 'EA',  2800.00),
        ('PRD-CONF-002', 'Logitech Rally Bar All-in-One Video Bar',
            'Motorised PTZ 4K 60fps, beamforming mics, USB-C plug-and-play',
            'IC-IT-EQ', 'SC-OFFICE-EQUIP', 'physical', 'EA',  3200.00)
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

    -- ── STAGE C: Items (one per product × company code CATL) ─────────────
    --   valuation_method: standard_cost for service/subscription UoMs,
    --                     weighted_avg for physical/by-unit UoMs
    --   has_serial_tracking: true for servers, network appliances, laptops, AV gear

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
        'ITM-' || substring(p.code from 5),   -- PRD-DC-001 → ITM-DC-001
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
        false,   -- no lot tracking required for InfoComm products
        -- serial tracking for individually identified hardware assets
        p.code ~ '^PRD-(DC-00[1245]|NET|LAP|CONF)',
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
        name                = EXCLUDED.name,
        product_id          = EXCLUDED.product_id,
        commodity_category_id = EXCLUDED.commodity_category_id,
        valuation_method    = EXCLUDED.valuation_method,
        standard_cost       = EXCLUDED.standard_cost,
        uom_code            = EXCLUDED.uom_code,
        has_serial_tracking = EXCLUDED.has_serial_tracking,
        metadata            = master.item.metadata
                              || jsonb_build_object('_seed', jsonb_build_object(
                                     'pack',      v_pack,
                                     'version',   v_version,
                                     'seeded_at', now()::text
                                 )),
        updated_at          = now(),
        updated_by          = v_su;

    -- ── STAGE D: Report ───────────────────────────────────────────────────
    SELECT count(*) INTO v_prod_count
    FROM master.product
    WHERE tenant_id = v_tid
      AND metadata->'_seed'->>'pack' = v_pack;

    SELECT count(*) INTO v_item_count
    FROM master.item
    WHERE tenant_id = v_tid
      AND metadata->'_seed'->>'pack' = v_pack;

    RAISE NOTICE '[catl_named_catalog] seeded: % products, % items (35 products x 1 company code)',
        v_prod_count, v_item_count;

END $catl_named_catalog$;
