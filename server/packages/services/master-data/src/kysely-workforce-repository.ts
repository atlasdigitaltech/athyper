import type {
  PersonEvidenceView,
  WorkforceAssignmentView,
  WorkforceChecklistItem,
  WorkforceDetail,
  WorkforceEmploymentView,
  WorkforceLifecycleStatus,
  WorkforceReadinessReason,
  WorkforceRepository,
  WorkforceSummary,
  WorkforceSectionPage,
} from "@athyper/server-contract-master-data";
import { sql, type Transaction } from "kysely";
import { MasterDataError } from "./errors.js";

type Db = Record<string, never>;
type Tx = Transaction<Db>;
type Row = Record<string, unknown>;

export class KyselyWorkforceRepository implements WorkforceRepository<Tx> {
  async resolveScopes(tenantId: string, employeeId: string, transaction: Tx) {
    const rows = (await sql<Row>`SELECT DISTINCT employment.legal_entity_id,COALESCE(employment.company_code_id,employee.company_code_id) company_code_id
      FROM master.employee employee
      LEFT JOIN master.employment employment ON employment.tenant_id=employee.tenant_id AND employment.employee_id=employee.id AND employment.status<>'archived'
      WHERE employee.tenant_id=${tenantId}::uuid AND employee.id=${employeeId}::uuid`.execute(transaction)).rows;
    if (!rows.length) return null;
    return rows.map(row=>({
      ...(optional(row,"legal_entity_id")?{legalEntityId:optional(row,"legal_entity_id")}:{}),
      ...(optional(row,"company_code_id")?{companyCodeId:optional(row,"company_code_id")}:{})
    }));
  }

  async list(
    input: Parameters<WorkforceRepository<Tx>["list"]>[0],
    transaction: Tx,
  ): Promise<readonly WorkforceSummary[]> {
    const lifecycle=sql`COALESCE(employment.lifecycle_status,CASE WHEN employee.hire_date>current_date THEN 'future' WHEN employee.termination_date<=current_date THEN 'ended' ELSE 'unassigned' END)`;
    const order=input.sort==="number"?sql`employee.employee_number,employee.id`:input.sort==="status"?sql`${lifecycle},COALESCE(person.display_name,employee.display_name,employee.name),employee.id`:sql`COALESCE(person.display_name,employee.display_name,employee.name),employee.id`;
    const search=input.search?`%${input.search}%`:null;
    const result =
      await sql<Row>`SELECT person.id person_id,employee.id employee_id,employee.employee_number,
      COALESCE(person.display_name,employee.display_name,employee.name) display_name,
      COALESCE(employment.company_code_id,employee.company_code_id) company_code_id,company.code company_code,company.name company_name,
      COALESCE(organization.name,employee.department) department,COALESCE(position.name,job.name,employee.title) position_name,
      assignment.manager_employee_id,COALESCE(manager_person.display_name,manager_person.name,manager.name) manager_name,
      COALESCE(employment.lifecycle_status,CASE WHEN employee.hire_date>current_date THEN 'future' WHEN employee.termination_date<=current_date THEN 'ended' ELSE 'unassigned' END) employment_status,
      assignment.lifecycle_status assignment_status,COALESCE(employment.hire_date,employee.hire_date) hire_date,COALESCE(employment.termination_date,employee.termination_date) termination_date,
      current_date::text as_of_date,onboarding.status onboarding_status
      FROM master.employee employee JOIN master.person person ON person.tenant_id=employee.tenant_id AND person.id=employee.person_id
      LEFT JOIN LATERAL(SELECT value.*,CASE WHEN value.status='active' AND value.employment_status='suspended' AND value.hire_date<=current_date AND (value.termination_date IS NULL OR value.termination_date>current_date) THEN 'suspended' WHEN value.status='active' AND value.employment_status='active' AND value.hire_date<=current_date AND (value.termination_date IS NULL OR value.termination_date>current_date) THEN 'employed' WHEN value.status='active' AND value.hire_date>current_date THEN 'future' ELSE 'ended' END lifecycle_status FROM master.employment value WHERE value.tenant_id=employee.tenant_id AND value.employee_id=employee.id AND value.status<>'archived' ORDER BY CASE WHEN value.status='active' AND value.employment_status IN('active','suspended') AND value.hire_date<=current_date AND (value.termination_date IS NULL OR value.termination_date>current_date) THEN 0 WHEN value.status='active' AND value.hire_date>current_date THEN 1 ELSE 2 END,value.is_primary DESC,value.hire_date DESC,value.id DESC LIMIT 1) employment ON true
      LEFT JOIN LATERAL(SELECT value.*,CASE WHEN value.status='active' AND value.effective_from<=current_date AND (value.effective_until IS NULL OR value.effective_until>current_date) THEN 'current' WHEN value.status='active' AND value.effective_from>current_date THEN 'future' ELSE 'ended' END lifecycle_status FROM master.work_assignment value WHERE value.tenant_id=employee.tenant_id AND value.employment_id=employment.id ORDER BY CASE WHEN value.status='active' AND value.effective_from<=current_date AND (value.effective_until IS NULL OR value.effective_until>current_date) THEN 0 WHEN value.status='active' AND value.effective_from>current_date THEN 1 ELSE 2 END,(value.assignment_type='primary') DESC,value.effective_from DESC,value.id DESC LIMIT 1) assignment ON true
      LEFT JOIN master.company_code company ON company.tenant_id=employee.tenant_id AND company.id=COALESCE(employment.company_code_id,employee.company_code_id)
      LEFT JOIN master.org_unit organization ON organization.tenant_id=assignment.tenant_id AND organization.id=assignment.org_unit_id
      LEFT JOIN master.position position ON position.tenant_id=assignment.tenant_id AND position.id=assignment.position_id
      LEFT JOIN master.job job ON job.tenant_id=assignment.tenant_id AND job.id=assignment.job_id
      LEFT JOIN master.employee manager ON manager.tenant_id=assignment.tenant_id AND manager.id=assignment.manager_employee_id
      LEFT JOIN master.person manager_person ON manager_person.tenant_id=manager.tenant_id AND manager_person.id=manager.person_id
      LEFT JOIN LATERAL(SELECT value.status FROM document.onboarding_case value WHERE value.tenant_id=employee.tenant_id AND value.employee_id=employee.id ORDER BY value.created_at DESC,value.id DESC LIMIT 1) onboarding ON true
      WHERE employee.tenant_id=${input.tenantId}::uuid AND COALESCE(employment.company_code_id,employee.company_code_id)=${input.companyCodeId ?? null}::uuid
      AND (${input.status ?? null}::text IS NULL OR ${lifecycle}=${input.status ?? null})
      AND (${search}::text IS NULL OR concat_ws(' ',employee.employee_number,person.display_name,employee.display_name,employee.name,organization.name,employee.department,position.name,job.name,employee.title,manager_person.display_name,manager_person.name,manager.name) ILIKE ${search})
      ORDER BY ${order} LIMIT ${input.limit ?? 50} OFFSET ${input.offset ?? 0}`.execute(
        transaction,
      );
    return result.rows.map(summary);
  }

  async getSection(
    input: Parameters<WorkforceRepository<Tx>["getSection"]>[0],
    transaction: Tx,
  ): Promise<WorkforceSectionPage> {
    const limit=input.limit??26,offset=input.offset??0;
    let rows: readonly Row[]=[];
    if(input.section==="team") rows=(await sql<Row>`WITH RECURSIVE reporting AS (
      SELECT assignment.employee_id,assignment.id assignment_id,1 depth,ARRAY[${input.employeeId}::uuid,assignment.employee_id] path
      FROM master.work_assignment assignment
      JOIN master.employment employment ON employment.tenant_id=assignment.tenant_id AND employment.id=assignment.employment_id AND employment.employee_id=assignment.employee_id
      WHERE assignment.tenant_id=${input.tenantId}::uuid AND assignment.manager_employee_id=${input.employeeId}::uuid
        AND assignment.status='active' AND assignment.effective_from<=current_date AND (assignment.effective_until IS NULL OR assignment.effective_until>current_date)
        AND employment.status='active' AND employment.employment_status IN('active','suspended')
        AND employment.hire_date<=current_date AND (employment.termination_date IS NULL OR employment.termination_date>current_date)
        AND (${input.companyCodeId??null}::uuid IS NULL OR assignment.company_code_id=${input.companyCodeId??null}::uuid)
      UNION ALL
      SELECT assignment.employee_id,assignment.id,reporting.depth+1,reporting.path||assignment.employee_id
      FROM reporting
      JOIN master.work_assignment assignment ON assignment.tenant_id=${input.tenantId}::uuid AND assignment.manager_employee_id=reporting.employee_id
      JOIN master.employment employment ON employment.tenant_id=assignment.tenant_id AND employment.id=assignment.employment_id AND employment.employee_id=assignment.employee_id
      WHERE reporting.depth<16 AND NOT assignment.employee_id=ANY(reporting.path)
        AND assignment.status='active' AND assignment.effective_from<=current_date AND (assignment.effective_until IS NULL OR assignment.effective_until>current_date)
        AND employment.status='active' AND employment.employment_status IN('active','suspended')
        AND employment.hire_date<=current_date AND (employment.termination_date IS NULL OR employment.termination_date>current_date)
        AND (${input.companyCodeId??null}::uuid IS NULL OR assignment.company_code_id=${input.companyCodeId??null}::uuid)
    ), selected AS (SELECT DISTINCT ON(employee_id) employee_id,assignment_id,depth FROM reporting ORDER BY employee_id,depth,assignment_id)
      SELECT report.id,COALESCE(person.display_name,report.display_name,report.name) title,concat_ws(' · ',CASE WHEN selected.depth=1 THEN 'Direct report' ELSE 'Level '||selected.depth::text END,report.employee_number,COALESCE(position.name,job.name,report.title),organization.name) subtitle,employment.employment_status status
      FROM selected
      JOIN master.work_assignment assignment ON assignment.tenant_id=${input.tenantId}::uuid AND assignment.id=selected.assignment_id
      JOIN master.employee report ON report.tenant_id=assignment.tenant_id AND report.id=selected.employee_id
      JOIN master.person person ON person.tenant_id=report.tenant_id AND person.id=report.person_id
      JOIN master.employment employment ON employment.tenant_id=report.tenant_id AND employment.id=assignment.employment_id
      LEFT JOIN master.position position ON position.tenant_id=assignment.tenant_id AND position.id=assignment.position_id
      LEFT JOIN master.job job ON job.tenant_id=assignment.tenant_id AND job.id=assignment.job_id
      LEFT JOIN master.org_unit organization ON organization.tenant_id=assignment.tenant_id AND organization.id=assignment.org_unit_id
      ORDER BY selected.depth,title,report.id LIMIT ${limit} OFFSET ${offset}`.execute(transaction)).rows;
    else if(input.section==="requests") rows=(await sql<Row>`SELECT id,request_no title,concat_ws(' · ',replace(request_kind::text,'_',' '),source_kind::text) subtitle,status,created_at occurred_at FROM document.workforce_request WHERE tenant_id=${input.tenantId}::uuid AND (target_employee_id=${input.employeeId}::uuid OR materialized_employee_id=${input.employeeId}::uuid) ORDER BY created_at DESC,id DESC LIMIT ${limit} OFFSET ${offset}`.execute(transaction)).rows;
    else if(input.section==="documents") rows=(await sql<Row>`SELECT link.id,COALESCE(attachment.original_filename,attachment.file_name) title,concat_ws(' · ',attachment.kind,attachment.content_type,CASE WHEN attachment.size_bytes IS NULL THEN NULL ELSE attachment.size_bytes::text||' bytes' END) subtitle,attachment.status,link.created_at occurred_at,link.link_kind FROM document.attachment_link link JOIN LATERAL(SELECT value.* FROM document.attachment value WHERE value.tenant_id=link.tenant_id AND value.series_id=link.attachment_series_id AND value.is_active AND (link.pinned_attachment_id IS NULL OR value.id=link.pinned_attachment_id) ORDER BY value.version_no DESC LIMIT 1) attachment ON true WHERE link.tenant_id=${input.tenantId}::uuid AND link.entity_type IN('employee','workforce') AND link.entity_id=${input.employeeId} ORDER BY link.created_at DESC,link.id DESC LIMIT ${limit} OFFSET ${offset}`.execute(transaction)).rows;
    else if(input.section==="comments") rows=(await sql<Row>`SELECT id,left(comment_text,160) title,concat_ws(' · ',comment_intent,content_format::text) subtitle,status,created_at occurred_at,commenter_id FROM document.comment WHERE tenant_id=${input.tenantId}::uuid AND entity_type IN('employee','workforce') AND entity_id=${input.employeeId} AND context_type='entity' AND status<>'deleted' AND deleted_at IS NULL AND archived_at IS NULL AND (visibility='public' OR (visibility='private' AND commenter_id=${input.principalId??null}::uuid)) ORDER BY created_at DESC,id DESC LIMIT ${limit} OFFSET ${offset}`.execute(transaction)).rows;
    else if(input.section==="education") rows=(await sql<Row>`SELECT education.id,education.row_version,education.institution_name,education.qualification_name,education.level_code,education.field_of_study,education.started_on,education.completed_on,education.completion_year,education.qualification_name title,concat_ws(' · ',education.institution_name,education.level_code,education.field_of_study,COALESCE(education.completed_on::text,education.completion_year::text)) subtitle,education.verification_status status,education.created_at occurred_at
      FROM master.person_education education JOIN master.employee employee ON employee.tenant_id=education.tenant_id AND employee.person_id=education.person_id
      WHERE employee.tenant_id=${input.tenantId}::uuid AND employee.id=${input.employeeId}::uuid AND education.status='active'
      ORDER BY education.completed_on DESC NULLS LAST,education.completion_year DESC NULLS LAST,education.id DESC LIMIT ${limit} OFFSET ${offset}`.execute(transaction)).rows;
    else if(input.section==="priorEmployment") rows=(await sql<Row>`SELECT history.id,history.row_version,history.employer_name,history.role_title,history.started_on,history.ended_on,history.start_year,history.end_year,history.country_code,history.employer_name title,concat_ws(' · ',history.role_title,COALESCE(history.started_on::text,history.start_year::text),COALESCE(history.ended_on::text,history.end_year::text)) subtitle,history.verification_status status,history.created_at occurred_at
      FROM master.person_prior_employment history JOIN master.employee employee ON employee.tenant_id=history.tenant_id AND employee.person_id=history.person_id
      WHERE employee.tenant_id=${input.tenantId}::uuid AND employee.id=${input.employeeId}::uuid AND history.status='active'
      ORDER BY history.ended_on DESC NULLS LAST,history.end_year DESC NULLS LAST,history.id DESC LIMIT ${limit} OFFSET ${offset}`.execute(transaction)).rows;
    else rows=(await sql<Row>`SELECT id,event_code title,concat_ws(' · ',operation::text,outcome::text,actor_type::text) subtitle,outcome::text status,occurred_at,changed_fields FROM audit.audit_log WHERE tenant_id=${input.tenantId}::uuid AND entity_type IN('employee','workforce') AND entity_id=${input.employeeId}::uuid ORDER BY occurred_at DESC,id DESC LIMIT ${limit} OFFSET ${offset}`.execute(transaction)).rows;
    return {section:input.section,items:rows.map(row=>({id:text(row,"id"),kind:input.section,title:text(row,"title"),...(optional(row,"subtitle")?{subtitle:optional(row,"subtitle")}:{}),...(optional(row,"status")?{status:optional(row,"status")}:{}),...(row["occurred_at"]?{occurredAt:new Date(row["occurred_at"] as string|Date).toISOString()}:{}),...(input.section==="team"?{href:`/people/workforce/${text(row,"id")}`}:{}) ,...((input.section==="education"||input.section==="priorEmployment")?{metadata:Object.fromEntries(Object.entries(row).filter(([key])=>["row_version","institution_name","qualification_name","level_code","field_of_study","started_on","completed_on","completion_year","employer_name","role_title","ended_on","start_year","end_year","country_code"].includes(key)).map(([key,value])=>[key,value instanceof Date?value.toISOString().slice(0,10):value]))}:{})}))};
  }

  async get(
    tenantId: string,
    employeeId: string,
    transaction: Tx,
  ): Promise<WorkforceDetail | null> {
    const row = (
      await sql<Row>`SELECT person.id person_id,person.status person_status,person.first_name,person.last_name,
      person.preferred_name,person.primary_email,person.primary_phone,COALESCE(person.display_name,employee.display_name,employee.name) display_name,
      employee.id employee_id,employee.employee_number,employee.principal_id,employee.status employee_status,
      employment.id employment_id,employment.company_code_id,company.code company_code,company.name company_name,employment.legal_entity_id,employment.employment_number,employment.employment_type,employment.is_primary,
      employment.employment_status raw_employment_status,employment.lifecycle_status employment_status,employment.hire_date,employment.service_date,employment.probation_end_date,employment.termination_date,current_date::text as_of_date,
      assignment.id assignment_id,assignment.employment_id assignment_employment_id,assignment.assignment_type,assignment.lifecycle_status assignment_status,assignment.position_id,position.name position_name,assignment.org_unit_id,organization.name org_unit_name,assignment.manager_employee_id,COALESCE(manager_person.display_name,manager_person.name,manager.name) manager_name,assignment.fte,assignment.effective_from,assignment.effective_until,
      onboarding.id onboarding_id,onboarding_request.id onboarding_request_id,onboarding.status onboarding_status,onboarding.checklist
      FROM master.employee employee JOIN master.person person ON person.tenant_id=employee.tenant_id AND person.id=employee.person_id
      LEFT JOIN LATERAL(SELECT value.*,CASE WHEN value.status='active' AND value.employment_status='suspended' AND value.hire_date<=current_date AND (value.termination_date IS NULL OR value.termination_date>current_date) THEN 'suspended' WHEN value.status='active' AND value.employment_status='active' AND value.hire_date<=current_date AND (value.termination_date IS NULL OR value.termination_date>current_date) THEN 'employed' WHEN value.status='active' AND value.hire_date>current_date THEN 'future' ELSE 'ended' END lifecycle_status FROM master.employment value WHERE value.tenant_id=employee.tenant_id AND value.employee_id=employee.id AND value.status<>'archived' ORDER BY CASE WHEN value.status='active' AND value.employment_status IN('active','suspended') AND value.hire_date<=current_date AND (value.termination_date IS NULL OR value.termination_date>current_date) THEN 0 WHEN value.status='active' AND value.hire_date>current_date THEN 1 ELSE 2 END,value.is_primary DESC,value.hire_date DESC,value.id DESC LIMIT 1) employment ON true
      LEFT JOIN LATERAL(SELECT value.*,CASE WHEN value.status='active' AND value.effective_from<=current_date AND (value.effective_until IS NULL OR value.effective_until>current_date) THEN 'current' WHEN value.status='active' AND value.effective_from>current_date THEN 'future' ELSE 'ended' END lifecycle_status FROM master.work_assignment value WHERE value.tenant_id=employee.tenant_id AND value.employment_id=employment.id ORDER BY CASE WHEN value.status='active' AND value.effective_from<=current_date AND (value.effective_until IS NULL OR value.effective_until>current_date) THEN 0 WHEN value.status='active' AND value.effective_from>current_date THEN 1 ELSE 2 END,(value.assignment_type='primary') DESC,value.effective_from DESC,value.id DESC LIMIT 1) assignment ON true
      LEFT JOIN master.company_code company ON company.tenant_id=employment.tenant_id AND company.id=employment.company_code_id
      LEFT JOIN master.position position ON position.tenant_id=assignment.tenant_id AND position.id=assignment.position_id
      LEFT JOIN master.org_unit organization ON organization.tenant_id=assignment.tenant_id AND organization.id=assignment.org_unit_id
      LEFT JOIN master.employee manager ON manager.tenant_id=assignment.tenant_id AND manager.id=assignment.manager_employee_id
      LEFT JOIN master.person manager_person ON manager_person.tenant_id=manager.tenant_id AND manager_person.id=manager.person_id
      LEFT JOIN LATERAL(SELECT value.* FROM document.onboarding_case value WHERE value.tenant_id=employee.tenant_id AND value.employee_id=employee.id ORDER BY value.created_at DESC,value.id DESC LIMIT 1) onboarding ON true
      LEFT JOIN LATERAL(SELECT value.id FROM document.workforce_request value WHERE value.tenant_id=employee.tenant_id AND (value.materialized_onboarding_case_id=onboarding.id OR value.materialized_employee_id=employee.id) ORDER BY value.created_at DESC,value.id DESC LIMIT 1) onboarding_request ON true
      WHERE employee.tenant_id=${tenantId}::uuid AND employee.id=${employeeId}::uuid LIMIT 1`.execute(
        transaction,
      )
    ).rows[0];
    if (!row) return null;
    const employments=(await sql<Row>`SELECT value.id,value.legal_entity_id,value.company_code_id,company.code company_code,company.name company_name,value.employment_number,value.employment_type,value.employment_status,value.is_primary,value.hire_date,value.service_date,value.probation_end_date,value.termination_date,CASE WHEN value.status='active' AND value.employment_status='suspended' AND value.hire_date<=current_date AND (value.termination_date IS NULL OR value.termination_date>current_date) THEN 'suspended' WHEN value.status='active' AND value.employment_status='active' AND value.hire_date<=current_date AND (value.termination_date IS NULL OR value.termination_date>current_date) THEN 'employed' WHEN value.status='active' AND value.hire_date>current_date THEN 'future' ELSE 'ended' END lifecycle_status FROM master.employment value JOIN master.company_code company ON company.tenant_id=value.tenant_id AND company.id=value.company_code_id WHERE value.tenant_id=${tenantId}::uuid AND value.employee_id=${employeeId}::uuid AND value.status<>'archived' ORDER BY value.hire_date DESC,value.id DESC`.execute(transaction)).rows.map(employmentView);
    const assignments=(await sql<Row>`SELECT value.id,value.employment_id,value.assignment_type,value.position_id,position.name position_name,value.org_unit_id,organization.name org_unit_name,value.manager_employee_id,COALESCE(manager_person.display_name,manager_person.name,manager.name) manager_name,value.fte,value.effective_from,value.effective_until,CASE WHEN value.status='active' AND value.effective_from<=current_date AND (value.effective_until IS NULL OR value.effective_until>current_date) THEN 'current' WHEN value.status='active' AND value.effective_from>current_date THEN 'future' ELSE 'ended' END lifecycle_status FROM master.work_assignment value LEFT JOIN master.position position ON position.tenant_id=value.tenant_id AND position.id=value.position_id LEFT JOIN master.org_unit organization ON organization.tenant_id=value.tenant_id AND organization.id=value.org_unit_id LEFT JOIN master.employee manager ON manager.tenant_id=value.tenant_id AND manager.id=value.manager_employee_id LEFT JOIN master.person manager_person ON manager_person.tenant_id=manager.tenant_id AND manager_person.id=manager.person_id WHERE value.tenant_id=${tenantId}::uuid AND value.employee_id=${employeeId}::uuid ORDER BY value.effective_from DESC,value.id DESC`.execute(transaction)).rows.map(assignmentView);
    const returned = (
      await sql<Row>`SELECT id,request_no,status,row_version,requested_changes,updated_at FROM document.workforce_request WHERE tenant_id=${tenantId}::uuid AND (target_employee_id=${employeeId}::uuid OR materialized_employee_id=${employeeId}::uuid) AND status='returned' ORDER BY updated_at DESC NULLS LAST,created_at DESC LIMIT 1`.execute(
        transaction,
      )
    ).rows[0];
    return detail(row, returned,employments,assignments);
  }

  async completeChecklistItem(
    input: Parameters<WorkforceRepository<Tx>["completeChecklistItem"]>[0],
    transaction: Tx,
  ): Promise<WorkforceDetail | null> {
    const updated = (
      await sql<Row>`UPDATE document.onboarding_case target SET checklist=(SELECT jsonb_agg(CASE WHEN item->>'code'=${input.itemCode} THEN item||jsonb_build_object('status','completed','completedAt',now(),'completedBy',${input.completedBy}) ELSE item END ORDER BY ordinal) FROM jsonb_array_elements(target.checklist) WITH ORDINALITY AS source(item,ordinal)),row_version=row_version+1,updated_by=${input.completedBy}::uuid,
      status=CASE WHEN NOT EXISTS(SELECT 1 FROM jsonb_array_elements(target.checklist) item WHERE COALESCE((item->>'required')::boolean,false) AND item->>'code'<>${input.itemCode} AND item->>'status' NOT IN('completed','waived')) THEN 'completed'::document.people_case_status_d ELSE status END,
      completed_at=CASE WHEN NOT EXISTS(SELECT 1 FROM jsonb_array_elements(target.checklist) item WHERE COALESCE((item->>'required')::boolean,false) AND item->>'code'<>${input.itemCode} AND item->>'status' NOT IN('completed','waived')) THEN now() ELSE completed_at END
      WHERE tenant_id=${input.tenantId}::uuid AND employee_id=${input.employeeId}::uuid AND row_version=${input.expectedVersion} AND status IN('draft','active') AND EXISTS(SELECT 1 FROM jsonb_array_elements(checklist) item WHERE item->>'code'=${input.itemCode}) RETURNING employee_id`.execute(
        transaction,
      )
    ).rows[0];
    if (!updated) return null;
    return this.get(input.tenantId, input.employeeId, transaction);
  }

  async offboard(
    input: Parameters<WorkforceRepository<Tx>["offboard"]>[0],
    transaction: Tx,
  ) {
    const replay = (
      await sql<Row>`SELECT id,employee_id FROM document.offboarding_case WHERE tenant_id=${input.tenantId}::uuid AND employee_id=${input.employeeId}::uuid AND idempotency_key=${input.idempotencyKey} LIMIT 1`.execute(
        transaction,
      )
    ).rows[0];
    if (replay) {
      const workforce = await this.get(
        input.tenantId,
        input.employeeId,
        transaction,
      );
      return workforce
        ? { caseId: text(replay, "id"), replayed: true, workforce }
        : null;
    }
    const current = (
      await sql<Row>`SELECT employee.id employee_id,employee.name,employment.id employment_id,employment.hire_date,assignment.id assignment_id FROM master.employee employee JOIN master.employment employment ON employment.tenant_id=employee.tenant_id AND employment.employee_id=employee.id AND employment.status='active' AND employment.employment_status IN ('active','suspended') AND employment.hire_date<=current_date AND (employment.termination_date IS NULL OR employment.termination_date>current_date) LEFT JOIN master.work_assignment assignment ON assignment.tenant_id=employee.tenant_id AND assignment.employment_id=employment.id AND assignment.status='active' AND assignment.assignment_type='primary' AND assignment.effective_from<=current_date AND (assignment.effective_until IS NULL OR assignment.effective_until>current_date) WHERE employee.tenant_id=${input.tenantId}::uuid AND employee.id=${input.employeeId}::uuid ORDER BY employment.is_primary DESC,(employment.employment_status='active') DESC,employment.hire_date DESC,employment.id DESC,assignment.effective_from DESC,assignment.id DESC LIMIT 1 FOR UPDATE OF employee,employment`.execute(
        transaction,
      )
    ).rows[0];
    if (!current) return null;
    if (input.exitDate <= dateOnly(current["hire_date"]))
      throw new MasterDataError(
        409,
        "WORKFORCE_OFFBOARDING_DATE_INVALID",
        "Exit date must be after the employment start date",
      );
    const caseDraft = (
      await sql<Row>`INSERT INTO document.offboarding_case(tenant_id,code,name,employee_id,employment_id,target_exit_date,reason_code,checklist,employment_terminated_at,access_deprovision_status,idempotency_key,status,created_by) VALUES(${input.tenantId}::uuid,${`OFF.${input.idempotencyKey.slice(0, 40)}`},${`Offboarding ${text(current, "name")}`},${input.employeeId}::uuid,${text(current, "employment_id")}::uuid,${input.exitDate}::date,${input.reasonCode},${JSON.stringify(input.resourceChecklist)}::jsonb,now(),'requested',${input.idempotencyKey},'draft',${input.actorId}::uuid) RETURNING id`.execute(
        transaction,
      )
    ).rows[0];
    if (!caseDraft) throw new Error("WORKFORCE_OFFBOARDING_CASE_CREATE_FAILED");
    const caseRow = (
      await sql<Row>`UPDATE document.offboarding_case SET status='active',status_changed_at=now(),status_changed_by=${input.actorId}::uuid,updated_by=${input.actorId}::uuid WHERE tenant_id=${input.tenantId}::uuid AND id=${text(caseDraft, "id")}::uuid RETURNING id`.execute(
        transaction,
      )
    ).rows[0];
    if (!caseRow)
      throw new Error("WORKFORCE_OFFBOARDING_CASE_ACTIVATION_FAILED");
    await sql`UPDATE master.work_assignment SET effective_until=${input.exitDate}::date,updated_by=${input.actorId}::uuid WHERE tenant_id=${input.tenantId}::uuid AND id=${current["assignment_id"] ?? null}::uuid AND (effective_until IS NULL OR effective_until>${input.exitDate}::date)`.execute(
      transaction,
    );
    await sql`UPDATE master.employment SET termination_date=${input.exitDate}::date,termination_reason=${input.reasonCode},updated_by=${input.actorId}::uuid WHERE tenant_id=${input.tenantId}::uuid AND id=${text(current, "employment_id")}::uuid`.execute(
      transaction,
    );
    await sql`UPDATE master.employee SET termination_date=${input.exitDate}::date,updated_by=${input.actorId}::uuid WHERE tenant_id=${input.tenantId}::uuid AND id=${input.employeeId}::uuid AND NOT EXISTS(SELECT 1 FROM master.employment remaining WHERE remaining.tenant_id=${input.tenantId}::uuid AND remaining.employee_id=${input.employeeId}::uuid AND remaining.id<>${text(current, "employment_id")}::uuid AND remaining.status='active' AND remaining.employment_status IN('active','suspended') AND (remaining.termination_date IS NULL OR remaining.termination_date>${input.exitDate}::date))`.execute(
      transaction,
    );
    const otherEmployment=(await sql<Row>`SELECT id FROM master.employment WHERE tenant_id=${input.tenantId}::uuid AND employee_id=${input.employeeId}::uuid AND id<>${text(current,"employment_id")}::uuid AND status='active' AND employment_status IN('active','suspended') AND (termination_date IS NULL OR termination_date>${input.exitDate}::date) LIMIT 1`.execute(transaction)).rows[0];
    if(!otherEmployment) await sql`SELECT * FROM document.command_internal_workforce_identity_intent(${input.tenantId}::uuid,${text(current, "employment_id")}::uuid,'deprovisioned',false,${`offboard:${input.idempotencyKey}`},${input.actorId}::uuid,NULL::uuid)`.execute(transaction);
    const workforce = await this.get(
      input.tenantId,
      input.employeeId,
      transaction,
    );
    if (!workforce) throw new Error("WORKFORCE_OFFBOARDING_READBACK_FAILED");
    return { caseId: text(caseRow, "id"), replayed: false, workforce };
  }

  async completeOffboardingResource(
    input: Parameters<
      WorkforceRepository<Tx>["completeOffboardingResource"]
    >[0],
    transaction: Tx,
  ) {
    const row = (
      await sql<Row>`UPDATE document.offboarding_case target SET checklist=(SELECT jsonb_agg(CASE WHEN item->>'code'=${input.itemCode} THEN item||jsonb_build_object('status','completed','completedAt',now(),'completedBy',${input.completedBy}) ELSE item END ORDER BY ordinal) FROM jsonb_array_elements(target.checklist) WITH ORDINALITY source(item,ordinal)),resource_checklist_completed_at=CASE WHEN NOT EXISTS(SELECT 1 FROM jsonb_array_elements(target.checklist) item WHERE item->>'code'<>${input.itemCode} AND COALESCE((item->>'required')::boolean,true) AND item->>'status' NOT IN('completed','waived')) THEN now() ELSE resource_checklist_completed_at END,row_version=row_version+1,updated_by=${input.completedBy}::uuid WHERE tenant_id=${input.tenantId}::uuid AND id=${input.caseId}::uuid AND employee_id=${input.employeeId}::uuid AND row_version=${input.expectedVersion} AND status='active' AND EXISTS(SELECT 1 FROM jsonb_array_elements(checklist) item WHERE item->>'code'=${input.itemCode}) RETURNING id,resource_checklist_completed_at`.execute(
        transaction,
      )
    ).rows[0];
    return row
      ? {
          caseId: text(row, "id"),
          completed: Boolean(row["resource_checklist_completed_at"]),
        }
      : null;
  }

  async requestIamProjection(
    input: Parameters<WorkforceRepository<Tx>["requestIamProjection"]>[0],
    transaction: Tx,
  ) {
    const employment = (
      await sql<Row>`SELECT employment.id FROM master.employment employment JOIN master.employee employee ON employee.tenant_id=employment.tenant_id AND employee.id=employment.employee_id JOIN master.person person ON person.tenant_id=employee.tenant_id AND person.id=employee.person_id WHERE employment.tenant_id=${input.tenantId}::uuid AND employment.employee_id=${input.employeeId}::uuid AND employment.legal_entity_id=${input.employerOrganizationId}::uuid AND employment.status='active' AND employment.employment_status='active' AND employee.status='active' AND person.status='active' ORDER BY employment.is_primary DESC,employment.hire_date DESC,employment.id DESC LIMIT 1`.execute(
        transaction,
      )
    ).rows[0];
    if (!employment)
      throw new MasterDataError(
        409,
        "WORKFORCE_IAM_RETRY_NOT_ELIGIBLE",
        "IAM projection retry requires an active employee, person, and employment in the requested legal entity",
      );
    try {
      const row = (
        await sql<Row>`SELECT employment_id,replayed FROM document.command_internal_workforce_identity_intent(${input.tenantId}::uuid,${text(employment, "id")}::uuid,'active',${input.createPrincipal},${input.idempotencyKey},${input.actorId}::uuid,NULL::uuid)`.execute(
          transaction,
        )
      ).rows[0];
      if (!row)
        throw new MasterDataError(
          409,
          "WORKFORCE_IAM_RETRY_NOT_ACCEPTED",
          "IAM projection retry did not create an identity intent",
        );
      return {
        projectionId: text(row, "employment_id"),
        replayed: Boolean(row["replayed"]),
      };
    } catch (error) {
      if ((error as { code?: unknown })?.code === "23514")
        throw new MasterDataError(
          409,
          "WORKFORCE_IAM_RETRY_NOT_ELIGIBLE",
          "The current workforce lifecycle state is not eligible for IAM projection",
        );
      throw error;
    }
  }

  async mutateProfile(
    input: Parameters<WorkforceRepository<Tx>["mutateProfile"]>[0],
    transaction: Tx,
  ) {
    const person=(await sql<Row>`SELECT person_id FROM master.employee WHERE tenant_id=${input.tenantId}::uuid AND id=${input.employeeId}::uuid AND status='active' FOR UPDATE`.execute(transaction)).rows[0];
    if(!person)return null;
    const personId=text(person,"person_id"),data=input.data??{};
    const string=(key:string)=>typeof data[key]==="string"?String(data[key]):null;
    const version=input.expectedVersion??null,id=input.recordId??null;
    let row:Row|undefined;
    if(input.kind==="education"){
      if(input.archive)row=(await sql<Row>`UPDATE master.person_education SET status='archived',row_version=row_version+1,updated_at=now(),updated_by=${input.actorId}::uuid WHERE tenant_id=${input.tenantId}::uuid AND person_id=${personId}::uuid AND id=${id}::uuid AND status='active' AND row_version=${version} RETURNING id,row_version`.execute(transaction)).rows[0];
      else if(id)row=(await sql<Row>`UPDATE master.person_education SET institution_name=${string("institutionName")},qualification_name=${string("qualificationName")},level_code=${string("levelCode")},field_of_study=${string("fieldOfStudy")},started_on=${string("startedOn")}::date,completed_on=${string("completedOn")}::date,completion_year=${data["completionYear"]??null}::smallint,row_version=row_version+1,updated_at=now(),updated_by=${input.actorId}::uuid WHERE tenant_id=${input.tenantId}::uuid AND person_id=${personId}::uuid AND id=${id}::uuid AND status='active' AND row_version=${version} RETURNING id,row_version`.execute(transaction)).rows[0];
      else row=(await sql<Row>`INSERT INTO master.person_education(tenant_id,person_id,institution_name,qualification_name,level_code,field_of_study,started_on,completed_on,completion_year,created_by) VALUES(${input.tenantId}::uuid,${personId}::uuid,${string("institutionName")},${string("qualificationName")},${string("levelCode")},${string("fieldOfStudy")},${string("startedOn")}::date,${string("completedOn")}::date,${data["completionYear"]??null}::smallint,${input.actorId}::uuid) RETURNING id,row_version`.execute(transaction)).rows[0];
    }else{
      if(input.archive)row=(await sql<Row>`UPDATE master.person_prior_employment SET status='archived',row_version=row_version+1,updated_at=now(),updated_by=${input.actorId}::uuid WHERE tenant_id=${input.tenantId}::uuid AND person_id=${personId}::uuid AND id=${id}::uuid AND status='active' AND row_version=${version} RETURNING id,row_version`.execute(transaction)).rows[0];
      else if(id)row=(await sql<Row>`UPDATE master.person_prior_employment SET employer_name=${string("employerName")},role_title=${string("roleTitle")},started_on=${string("startedOn")}::date,ended_on=${string("endedOn")}::date,start_year=${data["startYear"]??null}::smallint,end_year=${data["endYear"]??null}::smallint,country_code=${string("countryCode")}::char(2),row_version=row_version+1,updated_at=now(),updated_by=${input.actorId}::uuid WHERE tenant_id=${input.tenantId}::uuid AND person_id=${personId}::uuid AND id=${id}::uuid AND status='active' AND row_version=${version} RETURNING id,row_version`.execute(transaction)).rows[0];
      else row=(await sql<Row>`INSERT INTO master.person_prior_employment(tenant_id,person_id,employer_name,role_title,started_on,ended_on,start_year,end_year,country_code,created_by) VALUES(${input.tenantId}::uuid,${personId}::uuid,${string("employerName")},${string("roleTitle")},${string("startedOn")}::date,${string("endedOn")}::date,${data["startYear"]??null}::smallint,${data["endYear"]??null}::smallint,${string("countryCode")}::char(2),${input.actorId}::uuid) RETURNING id,row_version`.execute(transaction)).rows[0];
    }
    return row?{id:text(row,"id"),rowVersion:Number(row["row_version"]),archived:Boolean(input.archive)}:null;
  }

  async readPersonEvidence(
    input: Parameters<WorkforceRepository<Tx>["readPersonEvidence"]>[0],
    transaction: Tx,
  ): Promise<PersonEvidenceView | null> {
    const row = (
      await sql<Row>`SELECT profile.date_of_birth,profile.gender,profile.marital_status,profile.nationality_country_code,profile.national_id_type,profile.national_id_token,profile.tax_identifier_token,profile.passport_number_token,profile.emergency_contact,profile.protected_attributes FROM master.person person LEFT JOIN master.person_sensitive_profile profile ON profile.tenant_id=person.tenant_id AND profile.person_id=person.id WHERE person.tenant_id=${input.tenantId}::uuid AND person.id=${input.personId}::uuid LIMIT 1`.execute(
        transaction,
      )
    ).rows[0];
    if (!row) return null;
    const allowed: Record<string, readonly string[]> = {
      employment: ["dateOfBirth", "nationalityCountryCode", "emergencyContact", "emergencyContacts", "addresses"],
      payroll: [
        "dateOfBirth",
        "nationalIdType",
        "nationalIdToken",
        "taxIdentifierToken",
      ],
      benefits: ["dateOfBirth", "gender", "maritalStatus", "emergencyContact"],
      compliance: [
        "dateOfBirth",
        "nationalityCountryCode",
        "nationalIdType",
        "nationalIdToken",
        "passportNumberToken",
        "identityDocuments",
      ],
      health: ["healthProfile"],
    };
    const columns: Record<string, string> = {
      dateOfBirth: "date_of_birth",
      gender: "gender",
      maritalStatus: "marital_status",
      nationalityCountryCode: "nationality_country_code",
      nationalIdType: "national_id_type",
      nationalIdToken: "national_id_token",
      taxIdentifierToken: "tax_identifier_token",
      passportNumberToken: "passport_number_token",
      emergencyContact: "emergency_contact",
      protectedAttributes: "protected_attributes",
    };
    const structured=new Set(["emergencyContacts","addresses","identityDocuments","healthProfile"]);
    const disclosed = input.fields.filter(
        (field) => allowed[input.purpose]!.includes(field) && (field in columns || structured.has(field)),
      ),
      redacted = input.fields.filter((field) => !disclosed.includes(field));
    const fields: Record<string, unknown> = {};
    for (const field of disclosed){
      if(field in columns){fields[field]=serialize(row[columns[field]!] ?? null);continue;}
      if(field==="emergencyContacts") fields[field]=(await sql<Row>`SELECT id,relationship_code,priority,effective_from,effective_until,name_token,phone_token,email_token FROM master.person_emergency_contact WHERE tenant_id=${input.tenantId}::uuid AND person_id=${input.personId}::uuid AND status='active' AND effective_from<=current_date AND (effective_until IS NULL OR effective_until>current_date) ORDER BY priority,id LIMIT 20`.execute(transaction)).rows.map(value=>({id:text(value,"id"),relationshipCode:optional(value,"relationship_code"),priority:Number(value["priority"]),nameToken:optional(value,"name_token"),phoneToken:optional(value,"phone_token"),emailToken:optional(value,"email_token")}));
      if(field==="identityDocuments") fields[field]=(await sql<Row>`SELECT id,document_type,issuing_country_code,issued_on,valid_from,expires_on,issue_place,verification_status,value_token,front_content_item_id,back_content_item_id FROM master.person_identity_document WHERE tenant_id=${input.tenantId}::uuid AND person_id=${input.personId}::uuid AND status='active' ORDER BY created_at DESC,id DESC LIMIT 20`.execute(transaction)).rows.map(value=>({id:text(value,"id"),documentType:text(value,"document_type"),issuingCountryCode:optional(value,"issuing_country_code"),issuedOn:value["issued_on"]?dateOnly(value["issued_on"]):null,validFrom:value["valid_from"]?dateOnly(value["valid_from"]):null,expiresOn:value["expires_on"]?dateOnly(value["expires_on"]):null,issuePlace:optional(value,"issue_place"),verificationStatus:text(value,"verification_status"),valueToken:text(value,"value_token"),hasFrontEvidence:Boolean(value["front_content_item_id"]),hasBackEvidence:Boolean(value["back_content_item_id"])}));
      if(field==="addresses") fields[field]=(await sql<Row>`SELECT use.id,use.purpose,use.is_primary,use.effective_from,use.effective_until,address.formatted_address,address.line1,address.line2,address.city,address.region,address.postal_code,address.country_code FROM master.person_address_use use JOIN master.address address ON address.tenant_id=use.tenant_id AND address.id=use.address_id WHERE use.tenant_id=${input.tenantId}::uuid AND use.person_id=${input.personId}::uuid AND use.status='active' AND use.effective_from<=current_date AND (use.effective_until IS NULL OR use.effective_until>current_date) AND address.status='active' ORDER BY use.is_primary DESC,use.effective_from DESC,use.id DESC LIMIT 20`.execute(transaction)).rows.map(value=>({id:text(value,"id"),purpose:text(value,"purpose"),isPrimary:Boolean(value["is_primary"]),formattedAddress:optional(value,"formatted_address")??[optional(value,"line1"),optional(value,"line2"),optional(value,"city"),optional(value,"region"),optional(value,"postal_code"),optional(value,"country_code")].filter(Boolean).join(", ")}));
      if(field==="healthProfile") fields[field]=(await sql<Row>`SELECT id,blood_group_code,recorded_at,protected_content_item_id FROM master.person_health_profile WHERE tenant_id=${input.tenantId}::uuid AND person_id=${input.personId}::uuid AND status='active' ORDER BY recorded_at DESC,id DESC LIMIT 1`.execute(transaction)).rows.map(value=>({id:text(value,"id"),bloodGroupCode:optional(value,"blood_group_code"),recordedAt:new Date(value["recorded_at"] as string|Date).toISOString(),hasProtectedNotes:Boolean(value["protected_content_item_id"])}))[0]??null;
    }
    await sql`INSERT INTO document.person_sensitive_access_audit(tenant_id,person_id,principal_id,purpose_code,requested_fields,disclosed_fields,redacted_fields,request_id,expires_at) VALUES(${input.tenantId}::uuid,${input.personId}::uuid,${input.principalId}::uuid,${input.purpose},ARRAY(SELECT jsonb_array_elements_text(${JSON.stringify(input.fields)}::jsonb)),ARRAY(SELECT jsonb_array_elements_text(${JSON.stringify(disclosed)}::jsonb)),ARRAY(SELECT jsonb_array_elements_text(${JSON.stringify(redacted)}::jsonb)),${input.requestId}::uuid,${input.expiresAt}::timestamptz)`.execute(
      transaction,
    );
    return {
      personId: input.personId,
      purpose: input.purpose,
      expiresAt: input.expiresAt,
      fields,
      redactedFields: redacted,
    };
  }
}

function summary(row: Row): WorkforceSummary {
  return {
    personId: text(row, "person_id"),
    employeeId: text(row, "employee_id"),
    employeeNumber: text(row, "employee_number"),
    displayName: text(row, "display_name"),
    ...(optional(row, "company_code_id")
      ? { companyCodeId: optional(row, "company_code_id") }
      : {}),
    ...(optional(row,"company_code")?{companyCode:optional(row,"company_code")} : {}),
    ...(optional(row,"company_name")?{companyName:optional(row,"company_name")} : {}),
    ...(optional(row,"department")?{department:optional(row,"department")} : {}),
    ...(optional(row,"position_name")?{positionName:optional(row,"position_name")} : {}),
    ...(optional(row,"manager_employee_id")?{managerEmployeeId:optional(row,"manager_employee_id")} : {}),
    ...(optional(row,"manager_name")?{managerName:optional(row,"manager_name")} : {}),
    ...(optional(row, "employment_status")
      ? { employmentStatus: optional(row, "employment_status") as WorkforceLifecycleStatus }
      : {}),
    ...(optional(row,"assignment_status")?{assignmentStatus:optional(row,"assignment_status") as "current"|"future"|"ended"}:{}),
    asOfDate: text(row,"as_of_date"),
    ...(row["hire_date"] ? { hireDate: dateOnly(row["hire_date"]) } : {}),
    ...(row["termination_date"]
      ? { terminationDate: dateOnly(row["termination_date"]) }
      : {}),
    ...(optional(row, "onboarding_status")
      ? { onboardingStatus: optional(row, "onboarding_status") }
      : {}),
  };
}
function detail(row: Row, returned: Row|undefined, employments:readonly WorkforceEmploymentView[]=[], assignments:readonly WorkforceAssignmentView[]=[]): WorkforceDetail {
  const base = summary(row),
    reasons: WorkforceReadinessReason[] = [];
  if (row["person_status"] !== "active") reasons.push("PERSON_INACTIVE");
  if (row["employee_status"] !== "active") reasons.push("EMPLOYEE_INACTIVE");
  if (!row["employment_id"] || row["employment_status"] !== "employed")
    reasons.push("EMPLOYMENT_NOT_EFFECTIVE");
  if (!row["assignment_id"] || row["assignment_type"]!=="primary" || row["assignment_status"]!=="current") reasons.push("PRIMARY_ASSIGNMENT_NOT_EFFECTIVE");
  if (row["onboarding_status"] !== "completed")
    reasons.push("ONBOARDING_INCOMPLETE");
  const checklist = checklistItems(row["checklist"]);
  return {
    ...base,
    firstName: text(row, "first_name"),
    lastName: text(row, "last_name"),
    ...(optional(row, "preferred_name")
      ? { preferredName: optional(row, "preferred_name") }
      : {}),
    ...(optional(row, "primary_email")
      ? { email: optional(row, "primary_email") }
      : {}),
    ...(optional(row, "primary_phone")
      ? { phone: optional(row, "primary_phone") }
      : {}),
    ...(optional(row, "principal_id")
      ? { principalId: optional(row, "principal_id") }
      : {}),
    ...(row["employment_id"]
      ? {
          employment: {
            id: text(row, "employment_id"),
            legalEntityId: optional(row, "legal_entity_id"),
            companyCodeId: optional(row, "company_code_id"),
            companyCode: optional(row,"company_code"),
            companyName: optional(row,"company_name"),
            employmentNumber: optional(row, "employment_number"),
            employmentType: optional(row, "employment_type"),
            status: optional(row, "raw_employment_status"),
            lifecycleStatus: text(row,"employment_status") as WorkforceLifecycleStatus,
            primary: Boolean(row["is_primary"]),
            hireDate: row["hire_date"] ? dateOnly(row["hire_date"]) : undefined,
            serviceDate: row["service_date"] ? dateOnly(row["service_date"]) : undefined,
            probationEndDate: row["probation_end_date"] ? dateOnly(row["probation_end_date"]) : undefined,
            terminationDate: row["termination_date"]
              ? dateOnly(row["termination_date"])
              : undefined,
          },
        }
      : {}),
    ...(row["assignment_id"]
      ? {
          assignment: {
            id: text(row, "assignment_id"),
            employmentId: optional(row,"assignment_employment_id"),
            type: text(row,"assignment_type"),
            lifecycleStatus: text(row,"assignment_status") as "current"|"future"|"ended",
            positionId: optional(row, "position_id"),
            positionName: optional(row,"position_name"),
            orgUnitId: optional(row, "org_unit_id"),
            orgUnitName: optional(row,"org_unit_name"),
            managerEmployeeId: optional(row, "manager_employee_id"),
            managerName: optional(row,"manager_name"),
            fte: Number(row["fte"]),
            effectiveFrom: dateOnly(row["effective_from"]),
            effectiveUntil: row["effective_until"]
              ? dateOnly(row["effective_until"])
              : undefined,
          },
        }
      : {}),
    employments,
    assignments,
    ...(row["onboarding_id"] && row["onboarding_request_id"]
      ? {
          onboarding: {
            id: text(row, "onboarding_id"),
            requestId: text(row, "onboarding_request_id"),
            status: text(row, "onboarding_status"),
            checklist,
          },
        }
      : {}),
    ...(row["offboarding_id"]
      ? {
          offboarding: {
            id: text(row, "offboarding_id"),
            status: text(row, "offboarding_status"),
            targetExitDate: dateOnly(row["target_exit_date"]),
            checklist: checklistItems(row["offboarding_checklist"]),
            employmentTerminationRecorded: Boolean(
              row["employment_terminated_at"],
            ),
            resourceChecklistCompleted: Boolean(
              row["resource_checklist_completed_at"],
            ),
            accessDeprovisionStatus: text(row, "access_deprovision_status"),
            rowVersion: Number(row["offboarding_version"]),
          },
        }
      : {}),
    ...(returned
      ? {
          returnedRequest: {
            id: text(returned, "id"),
            requestNo: text(returned, "request_no"),
            status: text(returned, "status"),
            rowVersion: Number(returned["row_version"]),
            requestedChanges: returned["requested_changes"],
          },
        }
      : {}),
    readiness: {
      eligible: reasons.length === 0,
      reasons,
      evidenceVersion: Number(row["onboarding_version"] ?? 1),
    },
  };
}
function employmentView(row:Row):WorkforceEmploymentView{return{
  id:text(row,"id"),
  ...(optional(row,"legal_entity_id")?{legalEntityId:optional(row,"legal_entity_id")}:{}),
  ...(optional(row,"company_code_id")?{companyCodeId:optional(row,"company_code_id")}:{}),
  ...(optional(row,"company_code")?{companyCode:optional(row,"company_code")}:{}),
  ...(optional(row,"company_name")?{companyName:optional(row,"company_name")}:{}),
  ...(optional(row,"employment_number")?{employmentNumber:optional(row,"employment_number")}:{}),
  ...(optional(row,"employment_type")?{employmentType:optional(row,"employment_type")}:{}),
  ...(optional(row,"employment_status")?{status:optional(row,"employment_status")}:{}),
  lifecycleStatus:text(row,"lifecycle_status") as WorkforceLifecycleStatus,
  primary:Boolean(row["is_primary"]),
  ...(row["hire_date"]?{hireDate:dateOnly(row["hire_date"])}:{}),
  ...(row["service_date"]?{serviceDate:dateOnly(row["service_date"])}:{}),
  ...(row["probation_end_date"]?{probationEndDate:dateOnly(row["probation_end_date"])}:{}),
  ...(row["termination_date"]?{terminationDate:dateOnly(row["termination_date"])}:{})
};}
function assignmentView(row:Row):WorkforceAssignmentView{return{
  id:text(row,"id"),
  ...(optional(row,"employment_id")?{employmentId:optional(row,"employment_id")}:{}),
  type:text(row,"assignment_type"),
  lifecycleStatus:text(row,"lifecycle_status") as "current"|"future"|"ended",
  ...(optional(row,"position_id")?{positionId:optional(row,"position_id")}:{}),
  ...(optional(row,"position_name")?{positionName:optional(row,"position_name")}:{}),
  ...(optional(row,"org_unit_id")?{orgUnitId:optional(row,"org_unit_id")}:{}),
  ...(optional(row,"org_unit_name")?{orgUnitName:optional(row,"org_unit_name")}:{}),
  ...(optional(row,"manager_employee_id")?{managerEmployeeId:optional(row,"manager_employee_id")}:{}),
  ...(optional(row,"manager_name")?{managerName:optional(row,"manager_name")}:{}),
  fte:Number(row["fte"]),effectiveFrom:dateOnly(row["effective_from"]),
  ...(row["effective_until"]?{effectiveUntil:dateOnly(row["effective_until"])}:{})
};}
function checklistItems(value: unknown): readonly WorkforceChecklistItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => item && typeof item === "object")
    .map((item) => item as WorkforceChecklistItem);
}
function text(row: Row, key: string): string {
  const value = row[key];
  if (value === null || value === undefined)
    throw new Error(`WORKFORCE_ROW_MISSING_${key.toUpperCase()}`);
  return String(value);
}
function optional(row: Row, key: string): string | undefined {
  const value = row[key];
  return value === null || value === undefined ? undefined : String(value);
}
function dateOnly(value: unknown): string {
  return value instanceof Date
    ? value.toISOString().slice(0, 10)
    : String(value).slice(0, 10);
}
function serialize(value: unknown): unknown {
  return value instanceof Date ? value.toISOString().slice(0, 10) : value;
}
