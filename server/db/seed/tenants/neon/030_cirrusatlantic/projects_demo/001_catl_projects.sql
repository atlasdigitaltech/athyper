-- ============================================================================
-- FILE: 030_cirrusatlantic/projects_demo/001_catl_projects.sql
-- CirrusAtlantic project + WBS data — CATL (GBP)
-- ============================================================================
-- Creates master.project (2 rows) and master.project_item (~20 rows).
-- 2 projects for CATL; each project has 3 phases, 2 tasks, and milestones.
-- Idempotent: skips if metadata->'_seed'->>'pack' = '001_catl_projects' exists.
-- Depends: 100_org_structure/200_legal_entities.sql (company code CATL)
-- ============================================================================

DO $catl_projects$
DECLARE
    v_tid  uuid;
    v_su   uuid  := '00000000-0000-0000-0000-000000000000';
    v_meta jsonb;
    v_cc   uuid;
    v_p    uuid;
    v_ph1  uuid;
    v_ph2  uuid;
    v_ph3  uuid;
BEGIN

    SELECT id INTO v_tid FROM master.tenant WHERE realm_key = 'athyper' AND code = 'cirrusatlantic';
    IF v_tid IS NULL THEN
        RAISE EXCEPTION '[001_catl_projects] cirrusatlantic tenant not found';
    END IF;

    IF EXISTS (
        SELECT 1 FROM master.project
        WHERE  tenant_id = v_tid
          AND  (metadata -> '_seed') ->> 'pack' = '001_catl_projects'
    ) THEN
        RAISE NOTICE '[001_catl_projects] already seeded — skipping';
        RETURN;
    END IF;

    v_meta := jsonb_build_object('_seed', jsonb_build_object(
        'pack', '001_catl_projects', 'version', '1.0.0', 'seeded_at', now()::text
    ));

    -- ══════════════════════════════════════════════════════════════════════════
    -- CATL — CirrusAtlantic Ltd  (GB · GBP · April FY)
    -- ══════════════════════════════════════════════════════════════════════════
    SELECT id INTO v_cc FROM master.company_code WHERE tenant_id = v_tid AND code = 'CATL';

    -- CATL-P001 · Cloud Infrastructure Modernisation  [capex · GBP 1,800,000 · 2025-04-01→2026-03-31]
    v_p := shared.uuidv7();
    INSERT INTO master.project (id,tenant_id,code,name,company_code_id,project_type,description,currency_code,planned_cost,planned_start,planned_end,settlement_type,sort_order,status,created_by,metadata)
    VALUES (v_p,v_tid,'CATL-P001','Cloud Infrastructure Modernisation',v_cc,'capex','Full migration from on-premise data centre to hybrid cloud platform — Azure private peering + managed Kubernetes','GBP',1800000.00,'2025-04-01','2026-03-31','cost_center',10,'active',v_su,v_meta);
    v_ph1:=shared.uuidv7();
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,path,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (v_ph1,v_tid,v_p,v_cc,'PH-01','Discovery & Architecture','phase',1,'PH-01',360000.00,'GBP','2025-04-01','2025-06-30',1,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,allow_time_entry,allow_supplier_cost,capitalizable_default,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'T-01-01','Current State Assessment & Cloud Readiness Review','task',2,v_ph1,'PH-01/T-01-01',true,true,true,180000.00,'GBP','2025-04-01','2025-05-31',1,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,allow_time_entry,allow_supplier_cost,capitalizable_default,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'T-01-02','Target Architecture Design & Vendor Selection','task',2,v_ph1,'PH-01/T-01-02',true,true,true,180000.00,'GBP','2025-06-01','2025-06-30',2,'active',v_su,v_meta);
    v_ph2:=shared.uuidv7();
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,path,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (v_ph2,v_tid,v_p,v_cc,'PH-02','Build & Migration','phase',1,'PH-02',1170000.00,'GBP','2025-07-01','2025-12-31',2,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,allow_time_entry,allow_supplier_cost,capitalizable_default,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'T-02-01','Core Platform Build & Network Connectivity','task',2,v_ph2,'PH-02/T-02-01',true,true,true,630000.00,'GBP','2025-07-01','2025-09-30',1,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,allow_time_entry,allow_supplier_cost,capitalizable_default,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'T-02-02','Workload Migration & Data Replication','task',2,v_ph2,'PH-02/T-02-02',true,true,true,540000.00,'GBP','2025-10-01','2025-12-31',2,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,currency_code,milestone_date,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'MS-02','Platform Acceptance & Data Integrity Sign-off','milestone',2,v_ph2,'PH-02/MS-02','GBP','2025-12-19',3,'active',v_su,v_meta);
    v_ph3:=shared.uuidv7();
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,path,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (v_ph3,v_tid,v_p,v_cc,'PH-03','Go-Live & Stabilisation','phase',1,'PH-03',270000.00,'GBP','2026-01-01','2026-03-31',3,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,allow_time_entry,allow_supplier_cost,capitalizable_default,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'T-03-01','Cutover, Hypercare & Knowledge Transfer','task',2,v_ph3,'PH-03/T-03-01',true,true,true,270000.00,'GBP','2026-01-01','2026-03-31',1,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,currency_code,milestone_date,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'MS-03','Project Handover & Close-out','milestone',2,v_ph3,'PH-03/MS-03','GBP','2026-03-31',2,'active',v_su,v_meta);

    -- CATL-P002 · Digital Workplace & Security Uplift FY2026  [internal · GBP 480,000 · 2026-04-01→2027-03-31]
    v_p := shared.uuidv7();
    INSERT INTO master.project (id,tenant_id,code,name,company_code_id,project_type,description,currency_code,planned_cost,planned_start,planned_end,settlement_type,sort_order,status,created_by,metadata)
    VALUES (v_p,v_tid,'CATL-P002','Digital Workplace & Security Uplift FY2026',v_cc,'internal','Microsoft 365 full-suite rollout, Zero Trust network access, and endpoint security refresh for all staff','GBP',480000.00,'2026-04-01','2027-03-31','cost_center',20,'active',v_su,v_meta);
    v_ph1:=shared.uuidv7();
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,path,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (v_ph1,v_tid,v_p,v_cc,'PH-01','Assessment & Planning','phase',1,'PH-01',96000.00,'GBP','2026-04-01','2026-06-30',1,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,allow_time_entry,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'T-01-01','Current Tools Audit & Security Gap Analysis','task',2,v_ph1,'PH-01/T-01-01',true,48000.00,'GBP','2026-04-01','2026-05-15',1,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,allow_time_entry,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'T-01-02','Rollout Plan & Change Management Strategy','task',2,v_ph1,'PH-01/T-01-02',true,48000.00,'GBP','2026-05-16','2026-06-30',2,'active',v_su,v_meta);
    v_ph2:=shared.uuidv7();
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,path,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (v_ph2,v_tid,v_p,v_cc,'PH-02','Deployment & Training','phase',1,'PH-02',312000.00,'GBP','2026-07-01','2026-12-31',2,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,allow_time_entry,allow_supplier_cost,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'T-02-01','M365 & Zero Trust Deployment','task',2,v_ph2,'PH-02/T-02-01',true,true,180000.00,'GBP','2026-07-01','2026-09-30',1,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,allow_time_entry,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'T-02-02','End-user Training & Adoption Programme','task',2,v_ph2,'PH-02/T-02-02',true,132000.00,'GBP','2026-10-01','2026-12-31',2,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,currency_code,milestone_date,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'MS-02','Full Workforce On-boarded Checkpoint','milestone',2,v_ph2,'PH-02/MS-02','GBP','2026-12-31',3,'active',v_su,v_meta);
    v_ph3:=shared.uuidv7();
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,path,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (v_ph3,v_tid,v_p,v_cc,'PH-03','Benefits Measurement & Closure','phase',1,'PH-03',72000.00,'GBP','2027-01-01','2027-03-31',3,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,allow_time_entry,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'T-03-01','Post-implementation Review & Benefits Realisation','task',2,v_ph3,'PH-03/T-03-01',true,72000.00,'GBP','2027-01-01','2027-03-31',1,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,currency_code,milestone_date,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'MS-03','Benefits Realisation Sign-off','milestone',2,v_ph3,'PH-03/MS-03','GBP','2027-03-31',2,'active',v_su,v_meta);

    RAISE NOTICE '[001_catl_projects] Complete — CATL (2 projects, ~20 WBS items)';
END $catl_projects$;
