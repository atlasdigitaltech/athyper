-- ============================================================================
-- FILE: 020_technostat/projects_demo/001_technostat_projects.sql
-- Technostat project + WBS data — TKSA (SAR) and SSK (SAR)
-- ============================================================================
-- Creates master.project (4 rows) and master.project_item (~44 rows).
-- 2 projects for TKSA, 2 projects for SSK; each has 3 phases, 2 tasks, 1 milestone.
-- Idempotent: skips if metadata->'_seed'->>'pack' = '001_technostat_projects' exists.
-- Depends: 003_technostat_production_seed.sql (company codes TKSA, SSK)
-- ============================================================================

DO $technostat_projects_1$
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

    SELECT id INTO v_tid FROM master.tenant WHERE realm_key = 'athyper' AND code = 'technostat';
    IF v_tid IS NULL THEN
        RAISE EXCEPTION '[001_technostat_projects] technostat tenant not found';
    END IF;

    IF EXISTS (
        SELECT 1 FROM master.project
        WHERE  tenant_id = v_tid
          AND  (metadata -> '_seed') ->> 'pack' = '001_technostat_projects'
    ) THEN
        RAISE NOTICE '[001_technostat_projects] already seeded — skipping';
        RETURN;
    END IF;

    v_meta := jsonb_build_object('_seed', jsonb_build_object(
        'pack', '001_technostat_projects', 'version', '1.0.0', 'seeded_at', now()::text
    ));

    -- ══════════════════════════════════════════════════════════════════════════
    -- TKSA — Technostat Group HQ  (SA · SAR · Jan FY)
    -- ══════════════════════════════════════════════════════════════════════════
    SELECT id INTO v_cc FROM master.company_code WHERE tenant_id = v_tid AND code = 'TKSA';

    -- TKSA-P001 · Enterprise ERP Platform Consolidation  [capex · SAR 3,200,000 · 2025-01-01→2026-06-30]
    v_p := shared.uuidv7();
    INSERT INTO master.project (id,tenant_id,code,name,company_code_id,project_type,description,currency_code,planned_cost,planned_start,planned_end,settlement_type,sort_order,status,created_by,metadata)
    VALUES (v_p,v_tid,'TKSA-P001','Enterprise ERP Platform Consolidation',v_cc,'capex','Group-wide consolidation of legacy ERP instances onto a unified cloud platform — Oracle Fusion deployment across all HQ business units','SAR',3200000.00,'2025-01-01','2026-06-30','cost_center',10,'active',v_su,v_meta);
    v_ph1:=shared.uuidv7();
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,path,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (v_ph1,v_tid,v_p,v_cc,'PH-01','Blueprint & Vendor Selection','phase',1,'PH-01',640000.00,'SAR','2025-01-01','2025-03-31',1,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,allow_time_entry,allow_supplier_cost,capitalizable_default,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'T-01-01','Business Process Mapping & Requirements Consolidation','task',2,v_ph1,'PH-01/T-01-01',true,true,true,320000.00,'SAR','2025-01-01','2025-02-28',1,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,allow_time_entry,allow_supplier_cost,capitalizable_default,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'T-01-02','RFP, Vendor Evaluation & Contract Award','task',2,v_ph1,'PH-01/T-01-02',true,true,true,320000.00,'SAR','2025-03-01','2025-03-31',2,'active',v_su,v_meta);
    v_ph2:=shared.uuidv7();
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,path,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (v_ph2,v_tid,v_p,v_cc,'PH-02','Implementation & Data Migration','phase',1,'PH-02',2080000.00,'SAR','2025-04-01','2025-12-31',2,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,allow_time_entry,allow_supplier_cost,capitalizable_default,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'T-02-01','Core Modules Configuration & Pilot Run','task',2,v_ph2,'PH-02/T-02-01',true,true,true,1200000.00,'SAR','2025-04-01','2025-08-31',1,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,allow_time_entry,allow_supplier_cost,capitalizable_default,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'T-02-02','Data Migration, Integration Build & UAT','task',2,v_ph2,'PH-02/T-02-02',true,true,true,880000.00,'SAR','2025-09-01','2025-12-31',2,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,currency_code,milestone_date,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'MS-02','Data Migration & UAT Sign-off','milestone',2,v_ph2,'PH-02/MS-02','SAR','2025-12-15',3,'active',v_su,v_meta);
    v_ph3:=shared.uuidv7();
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,path,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (v_ph3,v_tid,v_p,v_cc,'PH-03','Go-Live & Stabilisation','phase',1,'PH-03',480000.00,'SAR','2026-01-01','2026-06-30',3,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,allow_time_entry,allow_supplier_cost,capitalizable_default,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'T-03-01','Cutover, Hypercare & User Enablement','task',2,v_ph3,'PH-03/T-03-01',true,true,true,480000.00,'SAR','2026-01-01','2026-06-30',1,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,currency_code,milestone_date,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'MS-03','ERP Group Go-Live & Project Close','milestone',2,v_ph3,'PH-03/MS-03','SAR','2026-06-30',2,'active',v_su,v_meta);

    -- TKSA-P002 · Cybersecurity Operations Centre Build-out  [capex · SAR 1,500,000 · 2026-01-01→2026-12-31]
    v_p := shared.uuidv7();
    INSERT INTO master.project (id,tenant_id,code,name,company_code_id,project_type,description,currency_code,planned_cost,planned_start,planned_end,settlement_type,sort_order,status,created_by,metadata)
    VALUES (v_p,v_tid,'TKSA-P002','Cybersecurity Operations Centre Build-out',v_cc,'capex','Establish a 24×7 SOC with SIEM and SOAR platforms to protect the group''s hybrid infrastructure and meet NCA ECC compliance requirements','SAR',1500000.00,'2026-01-01','2026-12-31','cost_center',20,'active',v_su,v_meta);
    v_ph1:=shared.uuidv7();
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,path,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (v_ph1,v_tid,v_p,v_cc,'PH-01','Assessment & SOC Design','phase',1,'PH-01',300000.00,'SAR','2026-01-01','2026-03-31',1,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,allow_time_entry,allow_supplier_cost,capitalizable_default,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'T-01-01','Threat Landscape Assessment & SIEM Platform Selection','task',2,v_ph1,'PH-01/T-01-01',true,true,true,150000.00,'SAR','2026-01-01','2026-02-28',1,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,allow_time_entry,allow_supplier_cost,capitalizable_default,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'T-01-02','SOC Architecture Design & Staffing Plan','task',2,v_ph1,'PH-01/T-01-02',true,true,true,150000.00,'SAR','2026-03-01','2026-03-31',2,'active',v_su,v_meta);
    v_ph2:=shared.uuidv7();
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,path,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (v_ph2,v_tid,v_p,v_cc,'PH-02','Platform Build & Integration','phase',1,'PH-02',900000.00,'SAR','2026-04-01','2026-09-30',2,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,allow_time_entry,allow_supplier_cost,capitalizable_default,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'T-02-01','SIEM & SOAR Platform Deployment','task',2,v_ph2,'PH-02/T-02-01',true,true,true,600000.00,'SAR','2026-04-01','2026-06-30',1,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,allow_time_entry,allow_supplier_cost,capitalizable_default,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'T-02-02','Log Source Integrations & Detection Use-case Development','task',2,v_ph2,'PH-02/T-02-02',true,true,true,300000.00,'SAR','2026-07-01','2026-09-30',2,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,currency_code,milestone_date,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'MS-02','SOC Platform Live & NCA Compliance Checkpoint','milestone',2,v_ph2,'PH-02/MS-02','SAR','2026-09-25',3,'active',v_su,v_meta);
    v_ph3:=shared.uuidv7();
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,path,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (v_ph3,v_tid,v_p,v_cc,'PH-03','Operations Handover & Runbook Finalisation','phase',1,'PH-03',300000.00,'SAR','2026-10-01','2026-12-31',3,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,allow_time_entry,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'T-03-01','SOC Team Training & Runbook Finalisation','task',2,v_ph3,'PH-03/T-03-01',true,300000.00,'SAR','2026-10-01','2026-12-31',1,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,currency_code,milestone_date,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'MS-03','SOC Fully Operational Sign-off','milestone',2,v_ph3,'PH-03/MS-03','SAR','2026-12-31',2,'active',v_su,v_meta);

    -- ══════════════════════════════════════════════════════════════════════════
    -- SSK — SSK Saudi Operations  (SA · SAR · Jan FY)
    -- ══════════════════════════════════════════════════════════════════════════
    SELECT id INTO v_cc FROM master.company_code WHERE tenant_id = v_tid AND code = 'SSK';

    -- SSK-P001 · Managed IT Services Client Onboarding Platform  [customer · SAR 800,000 · 2025-03-01→2025-12-31]
    v_p := shared.uuidv7();
    INSERT INTO master.project (id,tenant_id,code,name,company_code_id,project_type,description,currency_code,planned_cost,planned_start,planned_end,settlement_type,sort_order,status,created_by,metadata)
    VALUES (v_p,v_tid,'SSK-P001','Managed IT Services Client Onboarding Platform',v_cc,'customer','Design and deploy a self-service onboarding portal and monitoring stack for SSK managed-services clients — reducing onboarding cycle from 6 weeks to 5 days','SAR',800000.00,'2025-03-01','2025-12-31','cost_center',10,'active',v_su,v_meta);
    v_ph1:=shared.uuidv7();
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,path,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (v_ph1,v_tid,v_p,v_cc,'PH-01','Discovery & Scoping','phase',1,'PH-01',160000.00,'SAR','2025-03-01','2025-04-30',1,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,allow_time_entry,allow_billable,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'T-01-01','Client Environment Assessment & SLA Benchmarking','task',2,v_ph1,'PH-01/T-01-01',true,true,80000.00,'SAR','2025-03-01','2025-03-31',1,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,allow_time_entry,allow_billable,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'T-01-02','Portal Design & Contract Finalisation','task',2,v_ph1,'PH-01/T-01-02',true,true,80000.00,'SAR','2025-04-01','2025-04-30',2,'active',v_su,v_meta);
    v_ph2:=shared.uuidv7();
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,path,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (v_ph2,v_tid,v_p,v_cc,'PH-02','Platform Deployment & Integration','phase',1,'PH-02',480000.00,'SAR','2025-05-01','2025-09-30',2,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,allow_time_entry,allow_supplier_cost,allow_billable,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'T-02-01','Monitoring Stack Deployment & Automation Configuration','task',2,v_ph2,'PH-02/T-02-01',true,true,true,280000.00,'SAR','2025-05-01','2025-07-31',1,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,allow_time_entry,allow_billable,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'T-02-02','Client Handoff, Documentation & Runbook Delivery','task',2,v_ph2,'PH-02/T-02-02',true,true,200000.00,'SAR','2025-08-01','2025-09-30',2,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,currency_code,milestone_date,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'MS-02','Client Acceptance Sign-off','milestone',2,v_ph2,'PH-02/MS-02','SAR','2025-09-30',3,'active',v_su,v_meta);
    v_ph3:=shared.uuidv7();
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,path,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (v_ph3,v_tid,v_p,v_cc,'PH-03','Hypercare & SLA Measurement','phase',1,'PH-03',160000.00,'SAR','2025-10-01','2025-12-31',3,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,allow_time_entry,allow_billable,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'T-03-01','90-Day SLA Tracking, Reporting & Issue Resolution','task',2,v_ph3,'PH-03/T-03-01',true,true,160000.00,'SAR','2025-10-01','2025-12-31',1,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,currency_code,milestone_date,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'MS-03','SLA Baseline Confirmed & Contract Extended','milestone',2,v_ph3,'PH-03/MS-03','SAR','2025-12-31',2,'active',v_su,v_meta);

    -- SSK-P002 · Network Refresh & SD-WAN Rollout  [capex · SAR 1,100,000 · 2026-01-01→2026-09-30]
    v_p := shared.uuidv7();
    INSERT INTO master.project (id,tenant_id,code,name,company_code_id,project_type,description,currency_code,planned_cost,planned_start,planned_end,settlement_type,sort_order,status,created_by,metadata)
    VALUES (v_p,v_tid,'SSK-P002','Network Refresh & SD-WAN Rollout',v_cc,'capex','Replace ageing MPLS backbone with SD-WAN across 8 SSK sites — improving redundancy, reducing WAN cost by 35%, and enabling centrally-managed QoS policies','SAR',1100000.00,'2026-01-01','2026-09-30','cost_center',20,'active',v_su,v_meta);
    v_ph1:=shared.uuidv7();
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,path,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (v_ph1,v_tid,v_p,v_cc,'PH-01','Design & Procurement','phase',1,'PH-01',220000.00,'SAR','2026-01-01','2026-02-28',1,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,allow_time_entry,allow_supplier_cost,capitalizable_default,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'T-01-01','Network Audit & SD-WAN Solution Design','task',2,v_ph1,'PH-01/T-01-01',true,true,true,120000.00,'SAR','2026-01-01','2026-01-31',1,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,allow_time_entry,allow_supplier_cost,capitalizable_default,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'T-01-02','Hardware Procurement & ISP Circuit Coordination','task',2,v_ph1,'PH-01/T-01-02',true,true,true,100000.00,'SAR','2026-02-01','2026-02-28',2,'active',v_su,v_meta);
    v_ph2:=shared.uuidv7();
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,path,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (v_ph2,v_tid,v_p,v_cc,'PH-02','Site Deployment & Testing','phase',1,'PH-02',715000.00,'SAR','2026-03-01','2026-07-31',2,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,allow_time_entry,allow_supplier_cost,capitalizable_default,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'T-02-01','Core Site Deployment & Failover Testing','task',2,v_ph2,'PH-02/T-02-01',true,true,true,440000.00,'SAR','2026-03-01','2026-05-31',1,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,allow_time_entry,allow_supplier_cost,capitalizable_default,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'T-02-02','Branch Site Rollout & QoS Performance Tuning','task',2,v_ph2,'PH-02/T-02-02',true,true,true,275000.00,'SAR','2026-06-01','2026-07-31',2,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,currency_code,milestone_date,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'MS-02','All-Sites Network Acceptance Test Passed','milestone',2,v_ph2,'PH-02/MS-02','SAR','2026-07-25',3,'active',v_su,v_meta);
    v_ph3:=shared.uuidv7();
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,path,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (v_ph3,v_tid,v_p,v_cc,'PH-03','Optimisation & Handover','phase',1,'PH-03',165000.00,'SAR','2026-08-01','2026-09-30',3,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,allow_time_entry,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'T-03-01','Performance Monitoring, Documentation & Asset Register Update','task',2,v_ph3,'PH-03/T-03-01',true,165000.00,'SAR','2026-08-01','2026-09-30',1,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,currency_code,milestone_date,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'MS-03','Project Close & Asset Register Confirmed','milestone',2,v_ph3,'PH-03/MS-03','SAR','2026-09-30',2,'active',v_su,v_meta);

    RAISE NOTICE '[001_technostat_projects] Complete — TKSA (2 projects), SSK (2 projects), ~44 WBS items';
END $technostat_projects_1$;
