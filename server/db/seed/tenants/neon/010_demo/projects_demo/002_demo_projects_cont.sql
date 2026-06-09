-- ============================================================================
-- FILE: 010_demo/projects_demo/002_demo_projects_cont.sql
-- Demo project + WBS data — AUET, ASAH, AUIC, ASGF
-- Continuation of 001_demo_projects.sql
-- ============================================================================

DO $demo_projects_2$
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
    IF v_tid IS NULL THEN RAISE EXCEPTION '[002_demo_projects_cont] tenant not found'; END IF;

    IF EXISTS (
        SELECT 1 FROM master.project
        WHERE  tenant_id = v_tid
          AND  (metadata -> '_seed') ->> 'pack' = '002_demo_projects_cont'
    ) THEN
        RAISE NOTICE '[002_demo_projects_cont] already seeded — skipping';
        RETURN;
    END IF;

    v_meta := jsonb_build_object('_seed', jsonb_build_object(
        'pack', '002_demo_projects_cont', 'version', '1.0.0', 'seeded_at', now()::text
    ));

    -- ══════════════════════════════════════════════════════════════════════════
    -- AUET — UAE Trading  (AE · AED)
    -- ══════════════════════════════════════════════════════════════════════════
    SELECT id INTO v_cc FROM master.company_code WHERE tenant_id = v_tid AND code = 'AUET';

    -- AUET-P001 · MENA Market Expansion Initiative  [opex · AED 8,500,000 · 2026-01-01→2026-12-31]
    v_p := shared.uuidv7();
    INSERT INTO master.project (id,tenant_id,code,name,company_code_id,project_type,description,currency_code,planned_cost,planned_start,planned_end,settlement_type,sort_order,status,created_by,metadata)
    VALUES (v_p,v_tid,'AUET-P001','MENA Market Expansion Initiative',v_cc,'opex','Market entry and channel development programme across GCC and North Africa','AED',8500000.00,'2026-01-01','2026-12-31','cost_center',10,'active',v_su,v_meta);
    v_ph1:=shared.uuidv7();
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,path,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (v_ph1,v_tid,v_p,v_cc,'PH-01','Operational Planning','phase',1,'PH-01',1700000.00,'AED','2026-01-01','2026-03-31',1,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,allow_time_entry,allow_expense_claim,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'T-01-01','Market Assessment & Strategy','task',2,v_ph1,'PH-01/T-01-01',true,true,850000.00,'AED','2026-01-01','2026-02-28',1,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,allow_time_entry,allow_expense_claim,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'T-01-02','Resource Planning & Budget Allocation','task',2,v_ph1,'PH-01/T-01-02',true,false,850000.00,'AED','2026-03-01','2026-03-31',2,'active',v_su,v_meta);
    v_ph2:=shared.uuidv7();
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,path,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (v_ph2,v_tid,v_p,v_cc,'PH-02','Operations Execution','phase',1,'PH-02',5525000.00,'AED','2026-04-01','2026-09-30',2,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,allow_time_entry,allow_expense_claim,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'T-02-01','H1 Channel Development & Sales Push','task',2,v_ph2,'PH-02/T-02-01',true,true,3000000.00,'AED','2026-04-01','2026-06-30',1,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,allow_time_entry,allow_expense_claim,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'T-02-02','Mid-year Review & Course Correction','task',2,v_ph2,'PH-02/T-02-02',true,false,2525000.00,'AED','2026-07-01','2026-09-30',2,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,currency_code,milestone_date,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'MS-02','H1 Performance Review','milestone',2,v_ph2,'PH-02/MS-02','AED','2026-06-30',3,'active',v_su,v_meta);
    v_ph3:=shared.uuidv7();
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,path,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (v_ph3,v_tid,v_p,v_cc,'PH-03','Year-end Review','phase',1,'PH-03',1275000.00,'AED','2026-10-01','2026-12-31',3,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,allow_time_entry,allow_expense_claim,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'T-03-01','Year-end Performance Assessment','task',2,v_ph3,'PH-03/T-03-01',true,false,1275000.00,'AED','2026-10-01','2026-12-31',1,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,currency_code,milestone_date,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'MS-03','Annual Operations Closure','milestone',2,v_ph3,'PH-03/MS-03','AED','2026-12-31',2,'active',v_su,v_meta);

    -- AUET-P002 · Commodities Supply Contract FY2026  [customer · AED 35,000,000 · 2026-01-01→2026-12-31]
    v_p := shared.uuidv7();
    INSERT INTO master.project (id,tenant_id,code,name,company_code_id,project_type,description,currency_code,planned_cost,planned_start,planned_end,settlement_type,sort_order,status,created_by,metadata)
    VALUES (v_p,v_tid,'AUET-P002','Commodities Supply Contract FY2026',v_cc,'customer','Annual commodity supply fulfilment programme for key industrial clients','AED',35000000.00,'2026-01-01','2026-12-31','cost_center',20,'active',v_su,v_meta);
    v_ph1:=shared.uuidv7();
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,path,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (v_ph1,v_tid,v_p,v_cc,'PH-01','Discovery & Requirements','phase',1,'PH-01',7000000.00,'AED','2026-01-01','2026-03-31',1,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,allow_time_entry,allow_supplier_cost,allow_billable,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'T-01-01','Contract Scope & Client Requirements','task',2,v_ph1,'PH-01/T-01-01',true,true,true,3500000.00,'AED','2026-01-01','2026-02-28',1,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,allow_time_entry,allow_supplier_cost,allow_billable,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'T-01-02','Sourcing Strategy & Supplier Agreements','task',2,v_ph1,'PH-01/T-01-02',true,true,true,3500000.00,'AED','2026-03-01','2026-03-31',2,'active',v_su,v_meta);
    v_ph2:=shared.uuidv7();
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,path,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (v_ph2,v_tid,v_p,v_cc,'PH-02','Supply Execution','phase',1,'PH-02',22750000.00,'AED','2026-04-01','2026-09-30',2,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,allow_time_entry,allow_supplier_cost,allow_billable,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'T-02-01','H1 Procurement & Delivery','task',2,v_ph2,'PH-02/T-02-01',true,true,true,12500000.00,'AED','2026-04-01','2026-06-30',1,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,allow_time_entry,allow_supplier_cost,allow_billable,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'T-02-02','H2 Procurement & Delivery','task',2,v_ph2,'PH-02/T-02-02',true,true,true,10250000.00,'AED','2026-07-01','2026-09-30',2,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,currency_code,milestone_date,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'MS-02','Client Acceptance Sign-off','milestone',2,v_ph2,'PH-02/MS-02','AED','2026-09-30',3,'active',v_su,v_meta);
    v_ph3:=shared.uuidv7();
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,path,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (v_ph3,v_tid,v_p,v_cc,'PH-03','Contract Closure','phase',1,'PH-03',5250000.00,'AED','2026-10-01','2026-12-31',3,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,allow_time_entry,allow_supplier_cost,allow_billable,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'T-03-01','Final Delivery & Invoice Reconciliation','task',2,v_ph3,'PH-03/T-03-01',true,true,true,5250000.00,'AED','2026-10-01','2026-12-31',1,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,currency_code,milestone_date,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'MS-03','Warranty Commencement','milestone',2,v_ph3,'PH-03/MS-03','AED','2026-12-31',2,'active',v_su,v_meta);

    -- ══════════════════════════════════════════════════════════════════════════
    -- ASAH — Saudi Hospitality  (SA · SAR)
    -- ══════════════════════════════════════════════════════════════════════════
    SELECT id INTO v_cc FROM master.company_code WHERE tenant_id = v_tid AND code = 'ASAH';

    -- ASAH-P001 · Jeddah Grand Hotel Refurbishment  [capex · SAR 42,000,000 · 2026-01-01→2027-06-30]
    v_p := shared.uuidv7();
    INSERT INTO master.project (id,tenant_id,code,name,company_code_id,project_type,description,currency_code,planned_cost,planned_start,planned_end,settlement_type,sort_order,status,created_by,metadata)
    VALUES (v_p,v_tid,'ASAH-P001','Jeddah Grand Hotel Refurbishment',v_cc,'capex','Full refurbishment of guest rooms, F&B outlets and public areas at the Jeddah Grand Hotel','SAR',42000000.00,'2026-01-01','2027-06-30','cost_center',10,'active',v_su,v_meta);
    v_ph1:=shared.uuidv7();
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,path,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (v_ph1,v_tid,v_p,v_cc,'PH-01','Design & Planning','phase',1,'PH-01',8400000.00,'SAR','2026-01-01','2026-06-30',1,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,allow_time_entry,allow_supplier_cost,capitalizable_default,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'T-01-01','Interior Design & Engineering','task',2,v_ph1,'PH-01/T-01-01',true,true,true,4200000.00,'SAR','2026-01-01','2026-03-31',1,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,allow_time_entry,allow_supplier_cost,capitalizable_default,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'T-01-02','Procurement & Contract Awards','task',2,v_ph1,'PH-01/T-01-02',true,true,true,4200000.00,'SAR','2026-04-01','2026-06-30',2,'active',v_su,v_meta);
    v_ph2:=shared.uuidv7();
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,path,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (v_ph2,v_tid,v_p,v_cc,'PH-02','Refurbishment Works','phase',1,'PH-02',27300000.00,'SAR','2026-07-01','2026-12-31',2,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,allow_time_entry,allow_supplier_cost,capitalizable_default,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'T-02-01','Guest Rooms & Suites Refurbishment','task',2,v_ph2,'PH-02/T-02-01',true,true,true,15000000.00,'SAR','2026-07-01','2026-09-30',1,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,allow_time_entry,allow_supplier_cost,capitalizable_default,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'T-02-02','F&B Outlets & Public Areas Fit-out','task',2,v_ph2,'PH-02/T-02-02',true,true,true,12300000.00,'SAR','2026-10-01','2026-12-31',2,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,currency_code,milestone_date,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'MS-02','Practical Completion Certificate','milestone',2,v_ph2,'PH-02/MS-02','SAR','2026-12-31',3,'active',v_su,v_meta);
    v_ph3:=shared.uuidv7();
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,path,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (v_ph3,v_tid,v_p,v_cc,'PH-03','Commissioning & Reopening','phase',1,'PH-03',6300000.00,'SAR','2027-01-01','2027-06-30',3,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,allow_time_entry,allow_supplier_cost,capitalizable_default,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'T-03-01','Snagging, Certification & Staff Training','task',2,v_ph3,'PH-03/T-03-01',true,true,true,6300000.00,'SAR','2027-01-01','2027-06-30',1,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,currency_code,milestone_date,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'MS-03','Hotel Reopening','milestone',2,v_ph3,'PH-03/MS-03','SAR','2027-06-30',2,'active',v_su,v_meta);

    -- ASAH-P002 · F&B Operations Excellence FY2026  [opex · SAR 6,800,000 · 2026-01-01→2026-12-31]
    v_p := shared.uuidv7();
    INSERT INTO master.project (id,tenant_id,code,name,company_code_id,project_type,description,currency_code,planned_cost,planned_start,planned_end,settlement_type,sort_order,status,created_by,metadata)
    VALUES (v_p,v_tid,'ASAH-P002','F&B Operations Excellence FY2026',v_cc,'opex','Annual F&B service quality, cost control and guest satisfaction programme','SAR',6800000.00,'2026-01-01','2026-12-31','cost_center',20,'active',v_su,v_meta);
    v_ph1:=shared.uuidv7();
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,path,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (v_ph1,v_tid,v_p,v_cc,'PH-01','Operational Planning','phase',1,'PH-01',1360000.00,'SAR','2026-01-01','2026-03-31',1,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,allow_time_entry,allow_expense_claim,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'T-01-01','Operational Assessment & Strategy','task',2,v_ph1,'PH-01/T-01-01',true,true,680000.00,'SAR','2026-01-01','2026-02-28',1,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,allow_time_entry,allow_expense_claim,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'T-01-02','Menu Development & Supplier Agreements','task',2,v_ph1,'PH-01/T-01-02',true,false,680000.00,'SAR','2026-03-01','2026-03-31',2,'active',v_su,v_meta);
    v_ph2:=shared.uuidv7();
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,path,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (v_ph2,v_tid,v_p,v_cc,'PH-02','Operations Execution','phase',1,'PH-02',4420000.00,'SAR','2026-04-01','2026-09-30',2,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,allow_time_entry,allow_expense_claim,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'T-02-01','H1 F&B Service Delivery','task',2,v_ph2,'PH-02/T-02-01',true,true,2450000.00,'SAR','2026-04-01','2026-06-30',1,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,allow_time_entry,allow_expense_claim,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'T-02-02','Mid-year Review & Course Correction','task',2,v_ph2,'PH-02/T-02-02',true,false,1970000.00,'SAR','2026-07-01','2026-09-30',2,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,currency_code,milestone_date,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'MS-02','H1 Performance Review','milestone',2,v_ph2,'PH-02/MS-02','SAR','2026-06-30',3,'active',v_su,v_meta);
    v_ph3:=shared.uuidv7();
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,path,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (v_ph3,v_tid,v_p,v_cc,'PH-03','Year-end Review','phase',1,'PH-03',1020000.00,'SAR','2026-10-01','2026-12-31',3,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,allow_time_entry,allow_expense_claim,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'T-03-01','Year-end Performance Assessment','task',2,v_ph3,'PH-03/T-03-01',true,false,1020000.00,'SAR','2026-10-01','2026-12-31',1,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,currency_code,milestone_date,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'MS-03','Annual Operations Closure','milestone',2,v_ph3,'PH-03/MS-03','SAR','2026-12-31',2,'active',v_su,v_meta);

    -- ══════════════════════════════════════════════════════════════════════════
    -- AUIC — US InfoComm  (US · USD)
    -- ══════════════════════════════════════════════════════════════════════════
    SELECT id INTO v_cc FROM master.company_code WHERE tenant_id = v_tid AND code = 'AUIC';

    -- AUIC-P001 · Enterprise Platform Delivery — FinCorp  [customer · USD 4,200,000 · 2026-01-01→2026-12-31]
    v_p := shared.uuidv7();
    INSERT INTO master.project (id,tenant_id,code,name,company_code_id,project_type,description,currency_code,planned_cost,planned_start,planned_end,settlement_type,sort_order,status,created_by,metadata)
    VALUES (v_p,v_tid,'AUIC-P001','Enterprise Platform Delivery — FinCorp',v_cc,'customer','Full-stack enterprise software implementation for FinCorp Group, US East Coast','USD',4200000.00,'2026-01-01','2026-12-31','cost_center',10,'active',v_su,v_meta);
    v_ph1:=shared.uuidv7();
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,path,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (v_ph1,v_tid,v_p,v_cc,'PH-01','Discovery & Requirements','phase',1,'PH-01',840000.00,'USD','2026-01-01','2026-03-31',1,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,allow_time_entry,allow_supplier_cost,allow_billable,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'T-01-01','Stakeholder Workshops & Requirements Analysis','task',2,v_ph1,'PH-01/T-01-01',true,true,true,420000.00,'USD','2026-01-01','2026-02-28',1,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,allow_time_entry,allow_supplier_cost,allow_billable,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'T-01-02','Solution Design & Architecture','task',2,v_ph1,'PH-01/T-01-02',true,true,true,420000.00,'USD','2026-03-01','2026-03-31',2,'active',v_su,v_meta);
    v_ph2:=shared.uuidv7();
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,path,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (v_ph2,v_tid,v_p,v_cc,'PH-02','Delivery & Integration','phase',1,'PH-02',2730000.00,'USD','2026-04-01','2026-09-30',2,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,allow_time_entry,allow_supplier_cost,allow_billable,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'T-02-01','Build, Configure & Develop','task',2,v_ph2,'PH-02/T-02-01',true,true,true,1500000.00,'USD','2026-04-01','2026-06-30',1,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,allow_time_entry,allow_supplier_cost,allow_billable,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'T-02-02','Integration, Testing & UAT','task',2,v_ph2,'PH-02/T-02-02',true,true,true,1230000.00,'USD','2026-07-01','2026-09-30',2,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,currency_code,milestone_date,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'MS-02','Client Acceptance Sign-off','milestone',2,v_ph2,'PH-02/MS-02','USD','2026-09-30',3,'active',v_su,v_meta);
    v_ph3:=shared.uuidv7();
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,path,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (v_ph3,v_tid,v_p,v_cc,'PH-03','Go-Live & Support','phase',1,'PH-03',630000.00,'USD','2026-10-01','2026-12-31',3,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,allow_time_entry,allow_supplier_cost,allow_billable,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'T-03-01','Production Deployment & Hypercare','task',2,v_ph3,'PH-03/T-03-01',true,true,true,630000.00,'USD','2026-10-01','2026-12-31',1,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,currency_code,milestone_date,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'MS-03','Warranty Commencement','milestone',2,v_ph3,'PH-03/MS-03','USD','2026-12-31',2,'active',v_su,v_meta);

    -- AUIC-P002 · AI Analytics R&D Initiative  [r_and_d · USD 1,800,000 · 2026-01-01→2027-06-30]
    v_p := shared.uuidv7();
    INSERT INTO master.project (id,tenant_id,code,name,company_code_id,project_type,description,currency_code,planned_cost,planned_start,planned_end,settlement_type,sort_order,status,created_by,metadata)
    VALUES (v_p,v_tid,'AUIC-P002','AI Analytics R&D Initiative',v_cc,'r_and_d','Applied research programme for predictive analytics and LLM-powered enterprise automation','USD',1800000.00,'2026-01-01','2027-06-30','cost_center',20,'active',v_su,v_meta);
    v_ph1:=shared.uuidv7();
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,path,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (v_ph1,v_tid,v_p,v_cc,'PH-01','Research Initiation','phase',1,'PH-01',360000.00,'USD','2026-01-01','2026-06-30',1,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,allow_time_entry,allow_supplier_cost,allow_expense_claim,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'T-01-01','Literature Review & Hypothesis Formation','task',2,v_ph1,'PH-01/T-01-01',true,true,true,180000.00,'USD','2026-01-01','2026-03-31',1,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,allow_time_entry,allow_supplier_cost,allow_expense_claim,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'T-01-02','Dataset Curation & Experimental Design','task',2,v_ph1,'PH-01/T-01-02',true,true,true,180000.00,'USD','2026-04-01','2026-06-30',2,'active',v_su,v_meta);
    v_ph2:=shared.uuidv7();
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,path,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (v_ph2,v_tid,v_p,v_cc,'PH-02','Research Execution','phase',1,'PH-02',1170000.00,'USD','2026-07-01','2026-12-31',2,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,allow_time_entry,allow_supplier_cost,allow_expense_claim,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'T-02-01','Model Training & Experiments','task',2,v_ph2,'PH-02/T-02-01',true,true,true,650000.00,'USD','2026-07-01','2026-09-30',1,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,allow_time_entry,allow_supplier_cost,allow_expense_claim,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'T-02-02','Analysis, Benchmarking & Peer Review','task',2,v_ph2,'PH-02/T-02-02',true,true,true,520000.00,'USD','2026-10-01','2026-12-31',2,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,currency_code,milestone_date,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'MS-02','Interim Research Milestone','milestone',2,v_ph2,'PH-02/MS-02','USD','2026-12-15',3,'active',v_su,v_meta);
    v_ph3:=shared.uuidv7();
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,path,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (v_ph3,v_tid,v_p,v_cc,'PH-03','Dissemination & Closure','phase',1,'PH-03',270000.00,'USD','2027-01-01','2027-06-30',3,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,allow_time_entry,allow_expense_claim,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'T-03-01','Publications, Patents & IP Filing','task',2,v_ph3,'PH-03/T-03-01',true,true,270000.00,'USD','2027-01-01','2027-06-30',1,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,currency_code,milestone_date,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'MS-03','Research Programme Closure','milestone',2,v_ph3,'PH-03/MS-03','USD','2027-06-30',2,'active',v_su,v_meta);

    -- ══════════════════════════════════════════════════════════════════════════
    -- ASGF — Singapore Financial  (SG · SGD)
    -- ══════════════════════════════════════════════════════════════════════════
    SELECT id INTO v_cc FROM master.company_code WHERE tenant_id = v_tid AND code = 'ASGF';

    -- ASGF-P001 · RegTech Compliance Automation  [internal · SGD 2,100,000 · 2026-01-01→2026-12-31]
    v_p := shared.uuidv7();
    INSERT INTO master.project (id,tenant_id,code,name,company_code_id,project_type,description,currency_code,planned_cost,planned_start,planned_end,settlement_type,sort_order,status,created_by,metadata)
    VALUES (v_p,v_tid,'ASGF-P001','RegTech Compliance Automation',v_cc,'internal','MAS-aligned regulatory reporting automation and AML/KYC workflow modernisation','SGD',2100000.00,'2026-01-01','2026-12-31','cost_center',10,'active',v_su,v_meta);
    v_ph1:=shared.uuidv7();
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,path,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (v_ph1,v_tid,v_p,v_cc,'PH-01','Current State Analysis','phase',1,'PH-01',420000.00,'SGD','2026-01-01','2026-03-31',1,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,allow_time_entry,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'T-01-01','Regulatory Gap Assessment','task',2,v_ph1,'PH-01/T-01-01',true,210000.00,'SGD','2026-01-01','2026-02-28',1,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,allow_time_entry,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'T-01-02','Solution Design & Business Case','task',2,v_ph1,'PH-01/T-01-02',true,210000.00,'SGD','2026-03-01','2026-03-31',2,'active',v_su,v_meta);
    v_ph2:=shared.uuidv7();
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,path,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (v_ph2,v_tid,v_p,v_cc,'PH-02','Implementation','phase',1,'PH-02',1365000.00,'SGD','2026-04-01','2026-09-30',2,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,allow_time_entry,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'T-02-01','Platform Build & Configuration','task',2,v_ph2,'PH-02/T-02-01',true,750000.00,'SGD','2026-04-01','2026-06-30',1,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,allow_time_entry,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'T-02-02','Change Management & User Training','task',2,v_ph2,'PH-02/T-02-02',true,615000.00,'SGD','2026-07-01','2026-09-30',2,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,currency_code,milestone_date,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'MS-02','Rollout Checkpoint','milestone',2,v_ph2,'PH-02/MS-02','SGD','2026-09-30',3,'active',v_su,v_meta);
    v_ph3:=shared.uuidv7();
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,path,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (v_ph3,v_tid,v_p,v_cc,'PH-03','Adoption & Measurement','phase',1,'PH-03',315000.00,'SGD','2026-10-01','2026-12-31',3,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,allow_time_entry,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'T-03-01','Post-implementation Review','task',2,v_ph3,'PH-03/T-03-01',true,315000.00,'SGD','2026-10-01','2026-12-31',1,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,currency_code,milestone_date,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'MS-03','Benefits Realisation Sign-off','milestone',2,v_ph3,'PH-03/MS-03','SGD','2026-12-31',2,'active',v_su,v_meta);

    -- ASGF-P002 · FinTech Innovation Lab Phase 1  [r_and_d · SGD 3,500,000 · 2026-01-01→2027-06-30]
    v_p := shared.uuidv7();
    INSERT INTO master.project (id,tenant_id,code,name,company_code_id,project_type,description,currency_code,planned_cost,planned_start,planned_end,settlement_type,sort_order,status,created_by,metadata)
    VALUES (v_p,v_tid,'ASGF-P002','FinTech Innovation Lab Phase 1',v_cc,'r_and_d','Applied research into blockchain settlement, embedded finance and real-time payments','SGD',3500000.00,'2026-01-01','2027-06-30','cost_center',20,'active',v_su,v_meta);
    v_ph1:=shared.uuidv7();
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,path,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (v_ph1,v_tid,v_p,v_cc,'PH-01','Research Initiation','phase',1,'PH-01',700000.00,'SGD','2026-01-01','2026-06-30',1,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,allow_time_entry,allow_supplier_cost,allow_expense_claim,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'T-01-01','Literature Review & Hypothesis Formation','task',2,v_ph1,'PH-01/T-01-01',true,true,true,350000.00,'SGD','2026-01-01','2026-03-31',1,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,allow_time_entry,allow_supplier_cost,allow_expense_claim,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'T-01-02','Experimental Design & Ethics Clearance','task',2,v_ph1,'PH-01/T-01-02',true,true,true,350000.00,'SGD','2026-04-01','2026-06-30',2,'active',v_su,v_meta);
    v_ph2:=shared.uuidv7();
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,path,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (v_ph2,v_tid,v_p,v_cc,'PH-02','Research Execution','phase',1,'PH-02',2275000.00,'SGD','2026-07-01','2026-12-31',2,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,allow_time_entry,allow_supplier_cost,allow_expense_claim,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'T-02-01','Prototype Development & Testing','task',2,v_ph2,'PH-02/T-02-01',true,true,true,1250000.00,'SGD','2026-07-01','2026-09-30',1,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,allow_time_entry,allow_supplier_cost,allow_expense_claim,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'T-02-02','Analysis & Peer Review','task',2,v_ph2,'PH-02/T-02-02',true,true,true,1025000.00,'SGD','2026-10-01','2026-12-31',2,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,currency_code,milestone_date,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'MS-02','Interim Research Milestone','milestone',2,v_ph2,'PH-02/MS-02','SGD','2026-12-15',3,'active',v_su,v_meta);
    v_ph3:=shared.uuidv7();
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,path,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (v_ph3,v_tid,v_p,v_cc,'PH-03','Dissemination & Closure','phase',1,'PH-03',525000.00,'SGD','2027-01-01','2027-06-30',3,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,allow_time_entry,allow_expense_claim,planned_cost,currency_code,planned_start,planned_end,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'T-03-01','Publications, Patents & IP Filing','task',2,v_ph3,'PH-03/T-03-01',true,true,525000.00,'SGD','2027-01-01','2027-06-30',1,'active',v_su,v_meta);
    INSERT INTO master.project_item (id,tenant_id,project_id,company_code_id,code,name,item_type,level_no,parent_item_id,path,currency_code,milestone_date,sort_order,status,created_by,metadata)
    VALUES (shared.uuidv7(),v_tid,v_p,v_cc,'MS-03','Research Programme Closure','milestone',2,v_ph3,'PH-03/MS-03','SGD','2027-06-30',2,'active',v_su,v_meta);

    RAISE NOTICE '[002_demo_projects_cont] Part 2 complete (AUET, ASAH, AUIC, ASGF)';
END $demo_projects_2$;
