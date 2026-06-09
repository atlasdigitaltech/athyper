-- ============================================================================
-- FILE: 020_technostat/projects_demo/002_technostat_projects_cont.sql
-- Technostat project + WBS data — TEGY (EGP) and SDTX (EGP)
-- ============================================================================
-- Creates master.project (4 rows) and master.project_item (~44 rows).
-- 2 projects for TEGY, 2 projects for SDTX; each has 3 phases, 2 tasks, 1 milestone.
-- Idempotent: skips if metadata->'_seed'->>'pack' = '002_technostat_projects_cont' exists.
-- Depends: 003_technostat_production_seed.sql (company codes TEGY, SDTX)
-- ============================================================================

DO $technostat_projects_2$
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
        RAISE EXCEPTION '[002_technostat_projects_cont] technostat tenant not found';
    END IF;

    IF EXISTS (
        SELECT 1 FROM master.project
        WHERE  tenant_id = v_tid
          AND  (metadata -> '_seed') ->> 'pack' = '002_technostat_projects_cont'
    ) THEN
        RAISE NOTICE '[002_technostat_projects_cont] already seeded — skipping';
        RETURN;
    END IF;

    v_meta := jsonb_build_object('_seed', jsonb_build_object(
        'pack', '002_technostat_projects_cont', 'version', '1.0.0', 'seeded_at', now()::text
    ));

    -- ══════════════════════════════════════════════════════════════════════════
    -- TEGY — Technostat Egypt Operations  (EG · EGP · Jul–Jun FY)
    -- ══════════════════════════════════════════════════════════════════════════
    SELECT id INTO v_cc FROM master.company_code WHERE tenant_id = v_tid AND code = 'TEGY';

    -- TEGY-P001 · Regional ERP & Finance System Rollout  [internal · EGP 9,500,000 · 2025-07-01→2026-12-31]
    v_p := shared.uuidv7();
    INSERT INTO master.project (id,tenant_id,code,name,company_code_id,project_type,description,currency_code,planned_cost,planned_start,planned_end,settlement_type,sort_order,status,created_by,metadata)
    VALUES (v_p,v_tid,'TEGY-P001','Regional ERP & Finance System Rollout',v_cc,'internal','Deploy the group ERP and localise it for Egyptian tax, payroll and regulatory requirements — covering e-invoicing integration with ETA and GAFI compliance reporting','EGP',9500000.00,'2025-07-01','2026-12-31','cost_center',10,'active',v_su,v_meta);
    v_ph1:=shared.uuidv7();
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,path,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (v_ph1,v_tid,v_p,v_cc,'PH-01','Localisation & Configuration','phase',1,'PH-01',1900000.00,'EGP','2025-07-01','2025-12-31',1,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,allow_time_entry,allow_supplier_cost,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'T-01-01','Egyptian Tax, ETA e-Invoicing & Regulatory Configuration','task',2,v_ph1,'PH-01/T-01-01',true,true,950000.00,'EGP','2025-07-01','2025-09-30',1,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,allow_time_entry,allow_supplier_cost,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'T-01-02','Chart of Accounts & Payroll Localisation','task',2,v_ph1,'PH-01/T-01-02',true,true,950000.00,'EGP','2025-10-01','2025-12-31',2,'active',v_su,v_meta);
    v_ph2:=shared.uuidv7();
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,path,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (v_ph2,v_tid,v_p,v_cc,'PH-02','Deployment & User Enablement','phase',1,'PH-02',6175000.00,'EGP','2026-01-01','2026-09-30',2,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,allow_time_entry,allow_supplier_cost,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'T-02-01','Core System Go-Live & Historical Data Migration','task',2,v_ph2,'PH-02/T-02-01',true,true,3800000.00,'EGP','2026-01-01','2026-05-31',1,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,allow_time_entry,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'T-02-02','End-user Training & Change Management Programme','task',2,v_ph2,'PH-02/T-02-02',true,2375000.00,'EGP','2026-06-01','2026-09-30',2,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,currency_code,milestone_date,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'MS-02','Egypt ERP Go-Live & ETA e-Invoice Integration Verified','milestone',2,v_ph2,'PH-02/MS-02','EGP','2026-09-15',3,'active',v_su,v_meta);
    v_ph3:=shared.uuidv7();
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,path,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (v_ph3,v_tid,v_p,v_cc,'PH-03','Post-Launch Optimisation & Handover','phase',1,'PH-03',1425000.00,'EGP','2026-10-01','2026-12-31',3,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,allow_time_entry,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'T-03-01','Performance Tuning, Report Finalisation & Compliance Audit','task',2,v_ph3,'PH-03/T-03-01',true,1425000.00,'EGP','2026-10-01','2026-12-31',1,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,currency_code,milestone_date,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'MS-03','System Handover to Egypt Operations','milestone',2,v_ph3,'PH-03/MS-03','EGP','2026-12-31',2,'active',v_su,v_meta);

    -- TEGY-P002 · AI-Powered NOC Automation Platform  [r_and_d · EGP 5,400,000 · 2025-01-01→2026-06-30]
    v_p := shared.uuidv7();
    INSERT INTO master.project (id,tenant_id,code,name,company_code_id,project_type,description,currency_code,planned_cost,planned_start,planned_end,settlement_type,sort_order,status,created_by,metadata)
    VALUES (v_p,v_tid,'TEGY-P002','AI-Powered NOC Automation Platform',v_cc,'r_and_d','Research and build a machine-learning-driven network operations centre automation layer — real-time anomaly detection, auto-remediation playbooks, and predictive capacity alerts','EGP',5400000.00,'2025-01-01','2026-06-30','cost_center',20,'active',v_su,v_meta);
    v_ph1:=shared.uuidv7();
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,path,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (v_ph1,v_tid,v_p,v_cc,'PH-01','Research & Prototype','phase',1,'PH-01',1080000.00,'EGP','2025-01-01','2025-06-30',1,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,allow_time_entry,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'T-01-01','NOC Workflow Analysis & AI Use-case Mapping','task',2,v_ph1,'PH-01/T-01-01',true,540000.00,'EGP','2025-01-01','2025-03-31',1,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,allow_time_entry,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'T-01-02','ML Model Prototype & Validation on Synthetic Traffic','task',2,v_ph1,'PH-01/T-01-02',true,540000.00,'EGP','2025-04-01','2025-06-30',2,'active',v_su,v_meta);
    v_ph2:=shared.uuidv7();
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,path,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (v_ph2,v_tid,v_p,v_cc,'PH-02','Platform Build & NOC Integration','phase',1,'PH-02',3240000.00,'EGP','2025-07-01','2025-12-31',2,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,allow_time_entry,allow_supplier_cost,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'T-02-01','Anomaly Detection Engine Build & Model Training','task',2,v_ph2,'PH-02/T-02-01',true,true,1944000.00,'EGP','2025-07-01','2025-09-30',1,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,allow_time_entry,allow_supplier_cost,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'T-02-02','NOC Dashboard, Alert Routing & Auto-remediation Integration','task',2,v_ph2,'PH-02/T-02-02',true,true,1296000.00,'EGP','2025-10-01','2025-12-31',2,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,currency_code,milestone_date,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'MS-02','AI-NOC Pilot Acceptance & Precision Benchmark Met','milestone',2,v_ph2,'PH-02/MS-02','EGP','2025-12-20',3,'active',v_su,v_meta);
    v_ph3:=shared.uuidv7();
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,path,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (v_ph3,v_tid,v_p,v_cc,'PH-03','Production Rollout & Operations Handover','phase',1,'PH-03',1080000.00,'EGP','2026-01-01','2026-06-30',3,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,allow_time_entry,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'T-03-01','Production Deployment & Continuous Learning Pipeline Setup','task',2,v_ph3,'PH-03/T-03-01',true,1080000.00,'EGP','2026-01-01','2026-06-30',1,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,currency_code,milestone_date,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'MS-03','AI-NOC Platform Fully Operational','milestone',2,v_ph3,'PH-03/MS-03','EGP','2026-06-30',2,'active',v_su,v_meta);

    -- ══════════════════════════════════════════════════════════════════════════
    -- SDTX — Satellites Digital Transformation  (EG · EGP · Jan FY)
    -- ══════════════════════════════════════════════════════════════════════════
    SELECT id INTO v_cc FROM master.company_code WHERE tenant_id = v_tid AND code = 'SDTX';

    -- SDTX-P001 · Ground Station Data Integration Platform  [capex · EGP 18,000,000 · 2025-01-01→2026-12-31]
    v_p := shared.uuidv7();
    INSERT INTO master.project (id,tenant_id,code,name,company_code_id,project_type,description,currency_code,planned_cost,planned_start,planned_end,settlement_type,sort_order,status,created_by,metadata)
    VALUES (v_p,v_tid,'SDTX-P001','Ground Station Data Integration Platform',v_cc,'capex','Build and commission a real-time satellite telemetry ingestion and processing platform — RF front-end to cloud data pipeline with sub-5-second end-to-end latency for LEO tracking applications','EGP',18000000.00,'2025-01-01','2026-12-31','cost_center',10,'active',v_su,v_meta);
    v_ph1:=shared.uuidv7();
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,path,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (v_ph1,v_tid,v_p,v_cc,'PH-01','Systems Architecture & Procurement','phase',1,'PH-01',3600000.00,'EGP','2025-01-01','2025-06-30',1,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,allow_time_entry,allow_supplier_cost,capitalizable_default,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'T-01-01','RF Systems Analysis & Integration Architecture Design','task',2,v_ph1,'PH-01/T-01-01',true,true,true,1800000.00,'EGP','2025-01-01','2025-03-31',1,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,allow_time_entry,allow_supplier_cost,capitalizable_default,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'T-01-02','Hardware, Software & Antenna System Procurement','task',2,v_ph1,'PH-01/T-01-02',true,true,true,1800000.00,'EGP','2025-04-01','2025-06-30',2,'active',v_su,v_meta);
    v_ph2:=shared.uuidv7();
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,path,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (v_ph2,v_tid,v_p,v_cc,'PH-02','Build, Integration & Testing','phase',1,'PH-02',11700000.00,'EGP','2025-07-01','2026-06-30',2,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,allow_time_entry,allow_supplier_cost,capitalizable_default,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'T-02-01','Ground Station Hardware Installation & Antenna Commissioning','task',2,v_ph2,'PH-02/T-02-01',true,true,true,7200000.00,'EGP','2025-07-01','2025-12-31',1,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,allow_time_entry,allow_supplier_cost,capitalizable_default,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'T-02-02','Telemetry Data Pipeline & Cloud API Integration Build','task',2,v_ph2,'PH-02/T-02-02',true,true,true,4500000.00,'EGP','2026-01-01','2026-06-30',2,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,currency_code,milestone_date,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'MS-02','End-to-End Data Flow Test Passed — LEO Tracking Live','milestone',2,v_ph2,'PH-02/MS-02','EGP','2026-06-20',3,'active',v_su,v_meta);
    v_ph3:=shared.uuidv7();
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,path,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (v_ph3,v_tid,v_p,v_cc,'PH-03','Commission, Operate & Handover','phase',1,'PH-03',2700000.00,'EGP','2026-07-01','2026-12-31',3,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,allow_time_entry,allow_supplier_cost,capitalizable_default,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'T-03-01','Live Operations Monitoring, Stabilisation & SLA Verification','task',2,v_ph3,'PH-03/T-03-01',true,true,true,2700000.00,'EGP','2026-07-01','2026-12-31',1,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,currency_code,milestone_date,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'MS-03','Ground Station Commissioned & Handed to Operations','milestone',2,v_ph3,'PH-03/MS-03','EGP','2026-12-31',2,'active',v_su,v_meta);

    -- SDTX-P002 · IoT Fleet Management & Predictive Maintenance System  [r_and_d · EGP 4,500,000 · 2026-01-01→2027-06-30]
    v_p := shared.uuidv7();
    INSERT INTO master.project (id,tenant_id,code,name,company_code_id,project_type,description,currency_code,planned_cost,planned_start,planned_end,settlement_type,sort_order,status,created_by,metadata)
    VALUES (v_p,v_tid,'SDTX-P002','IoT Fleet Management & Predictive Maintenance System',v_cc,'r_and_d','Design and productise an IoT telemetry ingestion and predictive maintenance platform for satellite ground equipment fleets — ML-driven anomaly detection, alerting, and parts-demand forecasting','EGP',4500000.00,'2026-01-01','2027-06-30','cost_center',20,'active',v_su,v_meta);
    v_ph1:=shared.uuidv7();
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,path,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (v_ph1,v_tid,v_p,v_cc,'PH-01','Discovery & Proof of Concept','phase',1,'PH-01',900000.00,'EGP','2026-01-01','2026-03-31',1,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,allow_time_entry,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'T-01-01','Fleet Sensor Architecture & Connectivity Study','task',2,v_ph1,'PH-01/T-01-01',true,450000.00,'EGP','2026-01-01','2026-02-28',1,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,allow_time_entry,allow_supplier_cost,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'T-01-02','PoC Build & Field Equipment Trials','task',2,v_ph1,'PH-01/T-01-02',true,true,450000.00,'EGP','2026-03-01','2026-03-31',2,'active',v_su,v_meta);
    v_ph2:=shared.uuidv7();
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,path,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (v_ph2,v_tid,v_p,v_cc,'PH-02','Platform Development','phase',1,'PH-02',2700000.00,'EGP','2026-04-01','2026-12-31',2,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,allow_time_entry,allow_supplier_cost,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'T-02-01','IoT Telemetry Ingestion, Storage Layer & Real-time Dashboard','task',2,v_ph2,'PH-02/T-02-01',true,true,1500000.00,'EGP','2026-04-01','2026-07-31',1,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,allow_time_entry,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'T-02-02','Predictive ML Models, Alerting & Parts-demand Forecasting','task',2,v_ph2,'PH-02/T-02-02',true,1200000.00,'EGP','2026-08-01','2026-12-31',2,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,currency_code,milestone_date,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'MS-02','Predictive Analytics Module Live & Accuracy Baseline Met','milestone',2,v_ph2,'PH-02/MS-02','EGP','2026-12-15',3,'active',v_su,v_meta);
    v_ph3:=shared.uuidv7();
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,path,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (v_ph3,v_tid,v_p,v_cc,'PH-03','Pilot Fleet Rollout & Commercial Readiness','phase',1,'PH-03',900000.00,'EGP','2027-01-01','2027-06-30',3,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,allow_time_entry,allow_supplier_cost,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'T-03-01','Pilot Fleet Deployment, Performance Validation & SLA Sign-off','task',2,v_ph3,'PH-03/T-03-01',true,true,900000.00,'EGP','2027-01-01','2027-06-30',1,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,currency_code,milestone_date,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'MS-03','Fleet Management System Commercially Accepted','milestone',2,v_ph3,'PH-03/MS-03','EGP','2027-06-30',2,'active',v_su,v_meta);

    RAISE NOTICE '[002_technostat_projects_cont] Complete — TEGY (2 projects), SDTX (2 projects), ~44 WBS items';
END $technostat_projects_2$;
