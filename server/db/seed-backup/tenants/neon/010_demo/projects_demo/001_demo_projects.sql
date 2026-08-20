-- ============================================================================
-- FILE: 010_demo/projects_demo/001_demo_projects.sql
-- Demo project + WBS data — all Athyper Group companies
-- ============================================================================
-- Creates master.project (34 rows) and master.project_item (~340 rows).
-- 2 projects per company_code; each project has 3 phases, 2 tasks, 2 milestones.
-- Idempotent: skips if metadata->'_seed'->>'pack' = '001_demo_projects' exists.
-- Depends: 201_athyper_subsidiaries.sql (company codes)
-- ============================================================================

DO $demo_projects$
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

    SELECT id INTO v_tid FROM master.tenant WHERE realm_key = 'athyper' AND code = 'athyper';
    IF v_tid IS NULL THEN
        RAISE EXCEPTION '[001_demo_projects] athyper tenant not found';
    END IF;

    IF EXISTS (
        SELECT 1 FROM master.project
        WHERE  tenant_id = v_tid
          AND  (metadata -> '_seed') ->> 'pack' = '001_demo_projects'
    ) THEN
        RAISE NOTICE '[001_demo_projects] already seeded — skipping';
        RETURN;
    END IF;

    v_meta := jsonb_build_object('_seed', jsonb_build_object(
        'pack', '001_demo_projects', 'version', '1.0.0', 'seeded_at', now()::text
    ));

    -- ══════════════════════════════════════════════════════════════════════════
    -- ATHQ — Athyper Group Holdings  (AE · AED)
    -- ══════════════════════════════════════════════════════════════════════════
    SELECT id INTO v_cc FROM master.company_code WHERE tenant_id = v_tid AND code = 'ATHQ';

    -- ATHQ-P001 · Group ERP Implementation  [capex · AED 2,500,000 · 2025-07-01→2027-06-30]
    v_p := shared.uuidv7();
    INSERT INTO master.project (id,tenant_id,code,name,company_code_id,project_type,description,currency_code,planned_cost,planned_start,planned_end,settlement_type,sort_order,status,created_by,metadata)
    VALUES (v_p,v_tid,'ATHQ-P001','Group ERP Implementation',v_cc,'capex','Enterprise resource planning rollout across all Athyper group entities','AED',2500000.00,'2025-07-01','2027-06-30','cost_center',10,'active',v_su,v_meta);
    v_ph1:=shared.uuidv7();
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,path,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (v_ph1,v_tid,v_p,v_cc,'PH-01','Design & Planning','phase',1,'PH-01',500000.00,'AED','2025-07-01','2025-12-31',1,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,allow_time_entry,allow_supplier_cost,capitalizable_default,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'T-01-01','Feasibility Study & System Selection','task',2,v_ph1,'PH-01/T-01-01',true,true,true,250000.00,'AED','2025-07-01','2025-09-30',1,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,allow_time_entry,allow_supplier_cost,capitalizable_default,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'T-01-02','Architecture Design & Contract Awards','task',2,v_ph1,'PH-01/T-01-02',true,true,true,250000.00,'AED','2025-10-01','2025-12-31',2,'active',v_su,v_meta);
    v_ph2:=shared.uuidv7();
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,path,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (v_ph2,v_tid,v_p,v_cc,'PH-02','Build & Implementation','phase',1,'PH-02',1750000.00,'AED','2026-01-01','2026-12-31',2,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,allow_time_entry,allow_supplier_cost,capitalizable_default,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'T-02-01','Core Modules Build & Configuration','task',2,v_ph2,'PH-02/T-02-01',true,true,true,900000.00,'AED','2026-01-01','2026-06-30',1,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,allow_time_entry,allow_supplier_cost,capitalizable_default,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'T-02-02','Integration & Data Migration','task',2,v_ph2,'PH-02/T-02-02',true,true,true,850000.00,'AED','2026-07-01','2026-12-31',2,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,currency_code,milestone_date,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'MS-02','UAT & Parallel-run Sign-off','milestone',2,v_ph2,'PH-02/MS-02','AED','2026-12-15',3,'active',v_su,v_meta);
    v_ph3:=shared.uuidv7();
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,path,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (v_ph3,v_tid,v_p,v_cc,'PH-03','Go-Live & Stabilisation','phase',1,'PH-03',250000.00,'AED','2027-01-01','2027-06-30',3,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,allow_time_entry,allow_supplier_cost,capitalizable_default,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'T-03-01','Production Cutover & Hypercare Support','task',2,v_ph3,'PH-03/T-03-01',true,true,true,250000.00,'AED','2027-01-01','2027-06-30',1,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,currency_code,milestone_date,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'MS-03','Project Handover & Close-out','milestone',2,v_ph3,'PH-03/MS-03','AED','2027-06-30',2,'active',v_su,v_meta);

    -- ATHQ-P002 · ESG Reporting Framework  [internal · AED 450,000 · 2026-01-01→2026-12-31]
    v_p := shared.uuidv7();
    INSERT INTO master.project (id,tenant_id,code,name,company_code_id,project_type,description,currency_code,planned_cost,planned_start,planned_end,settlement_type,sort_order,status,created_by,metadata)
    VALUES (v_p,v_tid,'ATHQ-P002','ESG Reporting Framework',v_cc,'internal','Group-level ESG data collection, reporting and disclosure programme','AED',450000.00,'2026-01-01','2026-12-31','cost_center',20,'active',v_su,v_meta);
    v_ph1:=shared.uuidv7();
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,path,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (v_ph1,v_tid,v_p,v_cc,'PH-01','Current State Analysis','phase',1,'PH-01',90000.00,'AED','2026-01-01','2026-03-31',1,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,allow_time_entry,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'T-01-01','Stakeholder Workshops & Gap Assessment','task',2,v_ph1,'PH-01/T-01-01',true,45000.00,'AED','2026-01-01','2026-02-28',1,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,allow_time_entry,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'T-01-02','Solution Design & Business Case','task',2,v_ph1,'PH-01/T-01-02',true,45000.00,'AED','2026-03-01','2026-03-31',2,'active',v_su,v_meta);
    v_ph2:=shared.uuidv7();
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,path,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (v_ph2,v_tid,v_p,v_cc,'PH-02','Implementation','phase',1,'PH-02',292500.00,'AED','2026-04-01','2026-09-30',2,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,allow_time_entry,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'T-02-01','Solution Build & Configuration','task',2,v_ph2,'PH-02/T-02-01',true,160000.00,'AED','2026-04-01','2026-06-30',1,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,allow_time_entry,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'T-02-02','Change Management & Training','task',2,v_ph2,'PH-02/T-02-02',true,132500.00,'AED','2026-07-01','2026-09-30',2,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,currency_code,milestone_date,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'MS-02','Rollout Checkpoint','milestone',2,v_ph2,'PH-02/MS-02','AED','2026-09-30',3,'active',v_su,v_meta);
    v_ph3:=shared.uuidv7();
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,path,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (v_ph3,v_tid,v_p,v_cc,'PH-03','Adoption & Measurement','phase',1,'PH-03',67500.00,'AED','2026-10-01','2026-12-31',3,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,allow_time_entry,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'T-03-01','Post-implementation Review','task',2,v_ph3,'PH-03/T-03-01',true,67500.00,'AED','2026-10-01','2026-12-31',1,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,currency_code,milestone_date,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'MS-03','Benefits Realisation Sign-off','milestone',2,v_ph3,'PH-03/MS-03','AED','2026-12-31',2,'active',v_su,v_meta);

    -- ══════════════════════════════════════════════════════════════════════════
    -- AMRE — Malaysia Real Estate  (MY · MYR)
    -- ══════════════════════════════════════════════════════════════════════════
    SELECT id INTO v_cc FROM master.company_code WHERE tenant_id = v_tid AND code = 'AMRE';

    -- AMRE-P001 · KL Residential Tower Phase 2  [capex · MYR 85,000,000 · 2025-01-01→2027-12-31]
    v_p := shared.uuidv7();
    INSERT INTO master.project (id,tenant_id,code,name,company_code_id,project_type,description,currency_code,planned_cost,planned_start,planned_end,settlement_type,sort_order,status,created_by,metadata)
    VALUES (v_p,v_tid,'AMRE-P001','KL Residential Tower Phase 2',v_cc,'capex','Kuala Lumpur premium residential tower — Phase 2 superstructure and fit-out','MYR',85000000.00,'2025-01-01','2027-12-31','cost_center',10,'active',v_su,v_meta);
    v_ph1:=shared.uuidv7();
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,path,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (v_ph1,v_tid,v_p,v_cc,'PH-01','Design & Planning','phase',1,'PH-01',17000000.00,'MYR','2025-01-01','2025-06-30',1,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,allow_time_entry,allow_supplier_cost,capitalizable_default,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'T-01-01','Feasibility Study & Engineering Design','task',2,v_ph1,'PH-01/T-01-01',true,true,true,8500000.00,'MYR','2025-01-01','2025-03-31',1,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,allow_time_entry,allow_supplier_cost,capitalizable_default,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'T-01-02','Procurement & Contract Awards','task',2,v_ph1,'PH-01/T-01-02',true,true,true,8500000.00,'MYR','2025-04-01','2025-06-30',2,'active',v_su,v_meta);
    v_ph2:=shared.uuidv7();
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,path,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (v_ph2,v_tid,v_p,v_cc,'PH-02','Construction & Implementation','phase',1,'PH-02',55250000.00,'MYR','2025-07-01','2027-06-30',2,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,allow_time_entry,allow_supplier_cost,capitalizable_default,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'T-02-01','Civil Works & Core Construction','task',2,v_ph2,'PH-02/T-02-01',true,true,true,30000000.00,'MYR','2025-07-01','2026-06-30',1,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,allow_time_entry,allow_supplier_cost,capitalizable_default,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'T-02-02','M&E Installation & Fit-out','task',2,v_ph2,'PH-02/T-02-02',true,true,true,25250000.00,'MYR','2026-07-01','2027-06-30',2,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,currency_code,milestone_date,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'MS-02','Practical Completion Certificate','milestone',2,v_ph2,'PH-02/MS-02','MYR','2027-06-30',3,'active',v_su,v_meta);
    v_ph3:=shared.uuidv7();
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,path,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (v_ph3,v_tid,v_p,v_cc,'PH-03','Commissioning & Handover','phase',1,'PH-03',12750000.00,'MYR','2027-07-01','2027-12-31',3,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,allow_time_entry,allow_supplier_cost,capitalizable_default,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'T-03-01','Testing, Commissioning & Defects Rectification','task',2,v_ph3,'PH-03/T-03-01',true,true,true,12750000.00,'MYR','2027-07-01','2027-12-31',1,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,currency_code,milestone_date,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'MS-03','Project Handover & Close-out','milestone',2,v_ph3,'PH-03/MS-03','MYR','2027-12-31',2,'active',v_su,v_meta);

    -- AMRE-P002 · Property Portfolio Maintenance FY2026  [maintenance · MYR 3,200,000 · 2026-01-01→2026-12-31]
    v_p := shared.uuidv7();
    INSERT INTO master.project (id,tenant_id,code,name,company_code_id,project_type,description,currency_code,planned_cost,planned_start,planned_end,settlement_type,sort_order,status,created_by,metadata)
    VALUES (v_p,v_tid,'AMRE-P002','Property Portfolio Maintenance FY2026',v_cc,'maintenance','Annual planned maintenance programme across all managed properties','MYR',3200000.00,'2026-01-01','2026-12-31','cost_center',20,'active',v_su,v_meta);
    v_ph1:=shared.uuidv7();
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,path,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (v_ph1,v_tid,v_p,v_cc,'PH-01','Asset Assessment','phase',1,'PH-01',640000.00,'MYR','2026-01-01','2026-03-31',1,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,allow_time_entry,allow_supplier_cost,allow_material_usage,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'T-01-01','Condition Survey & Risk Assessment','task',2,v_ph1,'PH-01/T-01-01',true,true,false,320000.00,'MYR','2026-01-01','2026-02-28',1,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,allow_time_entry,allow_supplier_cost,allow_material_usage,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'T-01-02','Maintenance Schedule & Resource Plan','task',2,v_ph1,'PH-01/T-01-02',true,false,false,320000.00,'MYR','2026-03-01','2026-03-31',2,'active',v_su,v_meta);
    v_ph2:=shared.uuidv7();
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,path,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (v_ph2,v_tid,v_p,v_cc,'PH-02','Maintenance Execution','phase',1,'PH-02',2080000.00,'MYR','2026-04-01','2026-09-30',2,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,allow_time_entry,allow_supplier_cost,allow_material_usage,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'T-02-01','Planned Maintenance — H1','task',2,v_ph2,'PH-02/T-02-01',true,true,true,1150000.00,'MYR','2026-04-01','2026-06-30',1,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,allow_time_entry,allow_supplier_cost,allow_material_usage,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'T-02-02','Planned Maintenance — H2','task',2,v_ph2,'PH-02/T-02-02',true,true,true,930000.00,'MYR','2026-07-01','2026-09-30',2,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,currency_code,milestone_date,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'MS-02','Mid-year Safety Inspection','milestone',2,v_ph2,'PH-02/MS-02','MYR','2026-06-30',3,'active',v_su,v_meta);
    v_ph3:=shared.uuidv7();
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,path,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (v_ph3,v_tid,v_p,v_cc,'PH-03','Documentation & Closure','phase',1,'PH-03',480000.00,'MYR','2026-10-01','2026-12-31',3,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,allow_time_entry,allow_supplier_cost,allow_material_usage,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'T-03-01','Final Inspection & Certification','task',2,v_ph3,'PH-03/T-03-01',true,true,false,480000.00,'MYR','2026-10-01','2026-12-31',1,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,currency_code,milestone_date,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'MS-03','Maintenance Programme Close-out','milestone',2,v_ph3,'PH-03/MS-03','MYR','2026-12-31',2,'active',v_su,v_meta);

    -- ══════════════════════════════════════════════════════════════════════════
    -- AQTU — Qatar Utilities  (QA · QAR)
    -- ══════════════════════════════════════════════════════════════════════════
    SELECT id INTO v_cc FROM master.company_code WHERE tenant_id = v_tid AND code = 'AQTU';

    -- AQTU-P001 · Water Treatment Plant Upgrade  [capex · QAR 125,000,000 · 2025-07-01→2027-12-31]
    v_p := shared.uuidv7();
    INSERT INTO master.project (id,tenant_id,code,name,company_code_id,project_type,description,currency_code,planned_cost,planned_start,planned_end,settlement_type,sort_order,status,created_by,metadata)
    VALUES (v_p,v_tid,'AQTU-P001','Water Treatment Plant Upgrade',v_cc,'capex','Capacity expansion and modernisation of the Doha South water treatment facility','QAR',125000000.00,'2025-07-01','2027-12-31','cost_center',10,'active',v_su,v_meta);
    v_ph1:=shared.uuidv7();
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,path,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (v_ph1,v_tid,v_p,v_cc,'PH-01','Design & Planning','phase',1,'PH-01',25000000.00,'QAR','2025-07-01','2025-12-31',1,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,allow_time_entry,allow_supplier_cost,capitalizable_default,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'T-01-01','Feasibility Study & Engineering Design','task',2,v_ph1,'PH-01/T-01-01',true,true,true,12500000.00,'QAR','2025-07-01','2025-09-30',1,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,allow_time_entry,allow_supplier_cost,capitalizable_default,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'T-01-02','Procurement & Contract Awards','task',2,v_ph1,'PH-01/T-01-02',true,true,true,12500000.00,'QAR','2025-10-01','2025-12-31',2,'active',v_su,v_meta);
    v_ph2:=shared.uuidv7();
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,path,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (v_ph2,v_tid,v_p,v_cc,'PH-02','Construction & Implementation','phase',1,'PH-02',81250000.00,'QAR','2026-01-01','2027-06-30',2,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,allow_time_entry,allow_supplier_cost,capitalizable_default,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'T-02-01','Civil Works & Core Construction','task',2,v_ph2,'PH-02/T-02-01',true,true,true,44000000.00,'QAR','2026-01-01','2026-09-30',1,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,allow_time_entry,allow_supplier_cost,capitalizable_default,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'T-02-02','Equipment Installation & Integration','task',2,v_ph2,'PH-02/T-02-02',true,true,true,37250000.00,'QAR','2026-10-01','2027-06-30',2,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,currency_code,milestone_date,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'MS-02','Practical Completion Certificate','milestone',2,v_ph2,'PH-02/MS-02','QAR','2027-06-30',3,'active',v_su,v_meta);
    v_ph3:=shared.uuidv7();
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,path,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (v_ph3,v_tid,v_p,v_cc,'PH-03','Commissioning & Handover','phase',1,'PH-03',18750000.00,'QAR','2027-07-01','2027-12-31',3,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,allow_time_entry,allow_supplier_cost,capitalizable_default,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'T-03-01','Testing, Commissioning & Training','task',2,v_ph3,'PH-03/T-03-01',true,true,true,18750000.00,'QAR','2027-07-01','2027-12-31',1,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,currency_code,milestone_date,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'MS-03','Project Handover & Close-out','milestone',2,v_ph3,'PH-03/MS-03','QAR','2027-12-31',2,'active',v_su,v_meta);

    -- AQTU-P002 · Grid Asset Maintenance FY2026  [maintenance · QAR 18,500,000 · 2026-01-01→2026-12-31]
    v_p := shared.uuidv7();
    INSERT INTO master.project (id,tenant_id,code,name,company_code_id,project_type,description,currency_code,planned_cost,planned_start,planned_end,settlement_type,sort_order,status,created_by,metadata)
    VALUES (v_p,v_tid,'AQTU-P002','Grid Asset Maintenance FY2026',v_cc,'maintenance','Annual planned maintenance for electricity distribution grid assets','QAR',18500000.00,'2026-01-01','2026-12-31','cost_center',20,'active',v_su,v_meta);
    v_ph1:=shared.uuidv7();
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,path,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (v_ph1,v_tid,v_p,v_cc,'PH-01','Asset Assessment','phase',1,'PH-01',3700000.00,'QAR','2026-01-01','2026-03-31',1,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,allow_time_entry,allow_supplier_cost,allow_material_usage,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'T-01-01','Condition Survey & Risk Assessment','task',2,v_ph1,'PH-01/T-01-01',true,true,false,1850000.00,'QAR','2026-01-01','2026-02-28',1,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,allow_time_entry,allow_supplier_cost,allow_material_usage,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'T-01-02','Maintenance Schedule & Resource Plan','task',2,v_ph1,'PH-01/T-01-02',true,false,false,1850000.00,'QAR','2026-03-01','2026-03-31',2,'active',v_su,v_meta);
    v_ph2:=shared.uuidv7();
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,path,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (v_ph2,v_tid,v_p,v_cc,'PH-02','Maintenance Execution','phase',1,'PH-02',12025000.00,'QAR','2026-04-01','2026-09-30',2,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,allow_time_entry,allow_supplier_cost,allow_material_usage,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'T-02-01','Planned Maintenance — H1','task',2,v_ph2,'PH-02/T-02-01',true,true,true,6600000.00,'QAR','2026-04-01','2026-06-30',1,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,allow_time_entry,allow_supplier_cost,allow_material_usage,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'T-02-02','Planned Maintenance — H2','task',2,v_ph2,'PH-02/T-02-02',true,true,true,5425000.00,'QAR','2026-07-01','2026-09-30',2,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,currency_code,milestone_date,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'MS-02','Mid-year Safety Inspection','milestone',2,v_ph2,'PH-02/MS-02','QAR','2026-06-30',3,'active',v_su,v_meta);
    v_ph3:=shared.uuidv7();
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,path,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (v_ph3,v_tid,v_p,v_cc,'PH-03','Documentation & Closure','phase',1,'PH-03',2775000.00,'QAR','2026-10-01','2026-12-31',3,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,allow_time_entry,allow_supplier_cost,allow_material_usage,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'T-03-01','Final Inspection & Certification','task',2,v_ph3,'PH-03/T-03-01',true,true,false,2775000.00,'QAR','2026-10-01','2026-12-31',1,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,currency_code,milestone_date,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'MS-03','Maintenance Programme Close-out','milestone',2,v_ph3,'PH-03/MS-03','QAR','2026-12-31',2,'active',v_su,v_meta);

    -- ══════════════════════════════════════════════════════════════════════════
    -- ASAC — Saudi Construction  (SA · SAR)
    -- ══════════════════════════════════════════════════════════════════════════
    SELECT id INTO v_cc FROM master.company_code WHERE tenant_id = v_tid AND code = 'ASAC';

    -- ASAC-P001 · Riyadh Metro Station — Contract MC-07  [customer · SAR 220,000,000 · 2025-01-01→2027-06-30]
    v_p := shared.uuidv7();
    INSERT INTO master.project (id,tenant_id,code,name,company_code_id,project_type,description,currency_code,planned_cost,planned_start,planned_end,settlement_type,sort_order,status,created_by,metadata)
    VALUES (v_p,v_tid,'ASAC-P001','Riyadh Metro Station — Contract MC-07',v_cc,'customer','Design-and-build of Riyadh Metro Station MC-07 for the Royal Commission for Riyadh City','SAR',220000000.00,'2025-01-01','2027-06-30','cost_center',10,'active',v_su,v_meta);
    v_ph1:=shared.uuidv7();
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,path,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (v_ph1,v_tid,v_p,v_cc,'PH-01','Discovery & Requirements','phase',1,'PH-01',44000000.00,'SAR','2025-01-01','2025-06-30',1,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,allow_time_entry,allow_supplier_cost,allow_billable,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'T-01-01','Stakeholder Workshops & Requirements Analysis','task',2,v_ph1,'PH-01/T-01-01',true,true,true,22000000.00,'SAR','2025-01-01','2025-03-31',1,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,allow_time_entry,allow_supplier_cost,allow_billable,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'T-01-02','Solution Design & Architecture','task',2,v_ph1,'PH-01/T-01-02',true,true,true,22000000.00,'SAR','2025-04-01','2025-06-30',2,'active',v_su,v_meta);
    v_ph2:=shared.uuidv7();
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,path,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (v_ph2,v_tid,v_p,v_cc,'PH-02','Delivery & Integration','phase',1,'PH-02',143000000.00,'SAR','2025-07-01','2026-12-31',2,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,allow_time_entry,allow_supplier_cost,allow_billable,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'T-02-01','Structural Works & Core Construction','task',2,v_ph2,'PH-02/T-02-01',true,true,true,79000000.00,'SAR','2025-07-01','2026-03-31',1,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,allow_time_entry,allow_supplier_cost,allow_billable,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'T-02-02','Systems Integration & Testing','task',2,v_ph2,'PH-02/T-02-02',true,true,true,64000000.00,'SAR','2026-04-01','2026-12-31',2,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,currency_code,milestone_date,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'MS-02','Client Acceptance Sign-off','milestone',2,v_ph2,'PH-02/MS-02','SAR','2026-12-31',3,'active',v_su,v_meta);
    v_ph3:=shared.uuidv7();
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,path,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (v_ph3,v_tid,v_p,v_cc,'PH-03','Go-Live & Support','phase',1,'PH-03',33000000.00,'SAR','2027-01-01','2027-06-30',3,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,allow_time_entry,allow_supplier_cost,allow_billable,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'T-03-01','Commissioning & Defect Liability Period','task',2,v_ph3,'PH-03/T-03-01',true,true,true,33000000.00,'SAR','2027-01-01','2027-06-30',1,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,currency_code,milestone_date,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'MS-03','Warranty Commencement','milestone',2,v_ph3,'PH-03/MS-03','SAR','2027-06-30',2,'active',v_su,v_meta);

    -- ASAC-P002 · Heavy Equipment Fleet Expansion  [capex · SAR 45,000,000 · 2026-01-01→2027-06-30]
    v_p := shared.uuidv7();
    INSERT INTO master.project (id,tenant_id,code,name,company_code_id,project_type,description,currency_code,planned_cost,planned_start,planned_end,settlement_type,sort_order,status,created_by,metadata)
    VALUES (v_p,v_tid,'ASAC-P002','Heavy Equipment Fleet Expansion',v_cc,'capex','Acquisition of heavy construction equipment to support Vision 2030 project pipeline','SAR',45000000.00,'2026-01-01','2027-06-30','cost_center',20,'active',v_su,v_meta);
    v_ph1:=shared.uuidv7();
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,path,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (v_ph1,v_tid,v_p,v_cc,'PH-01','Design & Planning','phase',1,'PH-01',9000000.00,'SAR','2026-01-01','2026-06-30',1,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,allow_time_entry,allow_supplier_cost,capitalizable_default,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'T-01-01','Fleet Requirements & Market Survey','task',2,v_ph1,'PH-01/T-01-01',true,true,true,4500000.00,'SAR','2026-01-01','2026-03-31',1,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,allow_time_entry,allow_supplier_cost,capitalizable_default,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'T-01-02','Procurement & Contract Awards','task',2,v_ph1,'PH-01/T-01-02',true,true,true,4500000.00,'SAR','2026-04-01','2026-06-30',2,'active',v_su,v_meta);
    v_ph2:=shared.uuidv7();
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,path,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (v_ph2,v_tid,v_p,v_cc,'PH-02','Acquisition & Commissioning','phase',1,'PH-02',29250000.00,'SAR','2026-07-01','2026-12-31',2,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,allow_time_entry,allow_supplier_cost,capitalizable_default,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'T-02-01','Equipment Delivery & Acceptance','task',2,v_ph2,'PH-02/T-02-01',true,true,true,16000000.00,'SAR','2026-07-01','2026-09-30',1,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,allow_time_entry,allow_supplier_cost,capitalizable_default,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'T-02-02','Operator Training & Commissioning','task',2,v_ph2,'PH-02/T-02-02',true,true,true,13250000.00,'SAR','2026-10-01','2026-12-31',2,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,currency_code,milestone_date,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'MS-02','Fleet Ready for Deployment','milestone',2,v_ph2,'PH-02/MS-02','SAR','2026-12-31',3,'active',v_su,v_meta);
    v_ph3:=shared.uuidv7();
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,path,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (v_ph3,v_tid,v_p,v_cc,'PH-03','Asset Capitalisation & Closure','phase',1,'PH-03',6750000.00,'SAR','2027-01-01','2027-06-30',3,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,allow_time_entry,allow_supplier_cost,capitalizable_default,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'T-03-01','Asset Register Update & Warranty Activation','task',2,v_ph3,'PH-03/T-03-01',true,false,true,6750000.00,'SAR','2027-01-01','2027-06-30',1,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,currency_code,milestone_date,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'MS-03','Project Handover & Close-out','milestone',2,v_ph3,'PH-03/MS-03','SAR','2027-06-30',2,'active',v_su,v_meta);

    -- ══════════════════════════════════════════════════════════════════════════
    -- AQTS — Qatar Transport  (QA · QAR)
    -- ══════════════════════════════════════════════════════════════════════════
    SELECT id INTO v_cc FROM master.company_code WHERE tenant_id = v_tid AND code = 'AQTS';

    -- AQTS-P001 · Fleet Electrification Programme  [capex · QAR 95,000,000 · 2026-01-01→2028-12-31]
    v_p := shared.uuidv7();
    INSERT INTO master.project (id,tenant_id,code,name,company_code_id,project_type,description,currency_code,planned_cost,planned_start,planned_end,settlement_type,sort_order,status,created_by,metadata)
    VALUES (v_p,v_tid,'AQTS-P001','Fleet Electrification Programme',v_cc,'capex','Phased replacement of diesel fleet with electric vehicles and associated charging infrastructure','QAR',95000000.00,'2026-01-01','2028-12-31','cost_center',10,'active',v_su,v_meta);
    v_ph1:=shared.uuidv7();
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,path,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (v_ph1,v_tid,v_p,v_cc,'PH-01','Design & Planning','phase',1,'PH-01',19000000.00,'QAR','2026-01-01','2026-06-30',1,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,allow_time_entry,allow_supplier_cost,capitalizable_default,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'T-01-01','Feasibility Study & Engineering Design','task',2,v_ph1,'PH-01/T-01-01',true,true,true,9500000.00,'QAR','2026-01-01','2026-03-31',1,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,allow_time_entry,allow_supplier_cost,capitalizable_default,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'T-01-02','Procurement & Contract Awards','task',2,v_ph1,'PH-01/T-01-02',true,true,true,9500000.00,'QAR','2026-04-01','2026-06-30',2,'active',v_su,v_meta);
    v_ph2:=shared.uuidv7();
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,path,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (v_ph2,v_tid,v_p,v_cc,'PH-02','Vehicle Delivery & Infrastructure Build','phase',1,'PH-02',61750000.00,'QAR','2026-07-01','2028-06-30',2,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,allow_time_entry,allow_supplier_cost,capitalizable_default,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'T-02-01','Phase 1 — EV Delivery & Charging Infra','task',2,v_ph2,'PH-02/T-02-01',true,true,true,34000000.00,'QAR','2026-07-01','2027-06-30',1,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,allow_time_entry,allow_supplier_cost,capitalizable_default,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'T-02-02','Phase 2 — EV Delivery & Fleet Integration','task',2,v_ph2,'PH-02/T-02-02',true,true,true,27750000.00,'QAR','2027-07-01','2028-06-30',2,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,currency_code,milestone_date,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'MS-02','Phase 1 Fleet Ready for Service','milestone',2,v_ph2,'PH-02/MS-02','QAR','2027-06-30',3,'active',v_su,v_meta);
    v_ph3:=shared.uuidv7();
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,path,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (v_ph3,v_tid,v_p,v_cc,'PH-03','Commissioning & Handover','phase',1,'PH-03',14250000.00,'QAR','2028-07-01','2028-12-31',3,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,allow_time_entry,allow_supplier_cost,capitalizable_default,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'T-03-01','Asset Capitalisation & Operator Certification','task',2,v_ph3,'PH-03/T-03-01',true,false,true,14250000.00,'QAR','2028-07-01','2028-12-31',1,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,currency_code,milestone_date,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'MS-03','Full Fleet Electrification Achieved','milestone',2,v_ph3,'PH-03/MS-03','QAR','2028-12-31',2,'active',v_su,v_meta);

    -- AQTS-P002 · Logistics Hub Operations FY2026  [opex · QAR 12,000,000 · 2026-01-01→2026-12-31]
    v_p := shared.uuidv7();
    INSERT INTO master.project (id,tenant_id,code,name,company_code_id,project_type,description,currency_code,planned_cost,planned_start,planned_end,settlement_type,sort_order,status,created_by,metadata)
    VALUES (v_p,v_tid,'AQTS-P002','Logistics Hub Operations FY2026',v_cc,'opex','Annual operational budget and performance management for the Doha logistics hub','QAR',12000000.00,'2026-01-01','2026-12-31','cost_center',20,'active',v_su,v_meta);
    v_ph1:=shared.uuidv7();
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,path,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (v_ph1,v_tid,v_p,v_cc,'PH-01','Operational Planning','phase',1,'PH-01',2400000.00,'QAR','2026-01-01','2026-03-31',1,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,allow_time_entry,allow_expense_claim,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'T-01-01','Operational Assessment & Strategy','task',2,v_ph1,'PH-01/T-01-01',true,true,1200000.00,'QAR','2026-01-01','2026-02-28',1,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,allow_time_entry,allow_expense_claim,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'T-01-02','Resource Planning & Budget Allocation','task',2,v_ph1,'PH-01/T-01-02',true,false,1200000.00,'QAR','2026-03-01','2026-03-31',2,'active',v_su,v_meta);
    v_ph2:=shared.uuidv7();
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,path,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (v_ph2,v_tid,v_p,v_cc,'PH-02','Operations Execution','phase',1,'PH-02',7800000.00,'QAR','2026-04-01','2026-09-30',2,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,allow_time_entry,allow_expense_claim,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'T-02-01','H1 Operations Execution','task',2,v_ph2,'PH-02/T-02-01',true,true,4300000.00,'QAR','2026-04-01','2026-06-30',1,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,allow_time_entry,allow_expense_claim,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'T-02-02','Mid-year Review & Course Correction','task',2,v_ph2,'PH-02/T-02-02',true,false,3500000.00,'QAR','2026-07-01','2026-09-30',2,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,currency_code,milestone_date,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'MS-02','H1 Performance Review','milestone',2,v_ph2,'PH-02/MS-02','QAR','2026-06-30',3,'active',v_su,v_meta);
    v_ph3:=shared.uuidv7();
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,path,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (v_ph3,v_tid,v_p,v_cc,'PH-03','Year-end Review','phase',1,'PH-03',1800000.00,'QAR','2026-10-01','2026-12-31',3,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,allow_time_entry,allow_expense_claim,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'T-03-01','Year-end Performance Assessment','task',2,v_ph3,'PH-03/T-03-01',true,false,1800000.00,'QAR','2026-10-01','2026-12-31',1,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,currency_code,milestone_date,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'MS-03','Annual Operations Closure','milestone',2,v_ph3,'PH-03/MS-03','QAR','2026-12-31',2,'active',v_su,v_meta);

    RAISE NOTICE '[001_demo_projects] Part 1 complete (ATHQ, AMRE, AQTU, ASAC, AQTS)';
END $demo_projects$;
