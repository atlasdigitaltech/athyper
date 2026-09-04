import type {
  PersonEvidenceView,
  WorkforceChecklistItem,
  WorkforceDetail,
  WorkforceReadinessReason,
  WorkforceRepository,
  WorkforceSummary,
} from "@athyper/server-contract-master-data";
import { sql, type Transaction } from "kysely";
import { MasterDataError } from "./errors.js";

type Db = Record<string, never>;
type Tx = Transaction<Db>;
type Row = Record<string, unknown>;

export class KyselyWorkforceRepository implements WorkforceRepository<Tx> {
  async list(
    input: Parameters<WorkforceRepository<Tx>["list"]>[0],
    transaction: Tx,
  ): Promise<readonly WorkforceSummary[]> {
    const result =
      await sql<Row>`SELECT person.id person_id,employee.id employee_id,employee.employee_number,
      COALESCE(person.display_name,employee.display_name,employee.name) display_name,employment.company_code_id,employment.employment_status,
      employment.hire_date,employment.termination_date,onboarding.status onboarding_status
      FROM master.employee employee JOIN master.person person ON person.tenant_id=employee.tenant_id AND person.id=employee.person_id
      LEFT JOIN LATERAL(SELECT value.* FROM master.employment value WHERE value.tenant_id=employee.tenant_id AND value.employee_id=employee.id ORDER BY value.hire_date DESC,value.id DESC LIMIT 1) employment ON true
      LEFT JOIN LATERAL(SELECT value.status FROM document.onboarding_case value WHERE value.tenant_id=employee.tenant_id AND value.employee_id=employee.id ORDER BY value.created_at DESC,value.id DESC LIMIT 1) onboarding ON true
      WHERE employee.tenant_id=${input.tenantId}::uuid AND (${input.companyCodeId ?? null}::uuid IS NULL OR employment.company_code_id=${input.companyCodeId ?? null}::uuid)
      AND (${input.status ?? null}::text IS NULL OR employee.status=${input.status ?? null}) ORDER BY employee.created_at DESC,employee.id DESC LIMIT ${input.limit ?? 50}`.execute(
        transaction,
      );
    return result.rows.map(summary);
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
      employment.id employment_id,employment.company_code_id,employment.legal_entity_id,employment.employment_number,employment.employment_type,
      employment.employment_status,employment.hire_date,employment.termination_date,
      assignment.id assignment_id,assignment.position_id,assignment.org_unit_id,assignment.manager_employee_id,assignment.fte,assignment.effective_from,assignment.effective_until,
      onboarding.id onboarding_id,onboarding_request.id onboarding_request_id,onboarding.status onboarding_status,onboarding.checklist,onboarding.row_version onboarding_version,
      offboarding.id offboarding_id,offboarding.status offboarding_status,offboarding.target_exit_date,offboarding.checklist offboarding_checklist,offboarding.employment_terminated_at,offboarding.resource_checklist_completed_at,offboarding.access_deprovision_status,offboarding.row_version offboarding_version
      FROM master.employee employee JOIN master.person person ON person.tenant_id=employee.tenant_id AND person.id=employee.person_id
      LEFT JOIN LATERAL(SELECT value.* FROM master.employment value WHERE value.tenant_id=employee.tenant_id AND value.employee_id=employee.id ORDER BY value.hire_date DESC,value.id DESC LIMIT 1) employment ON true
      LEFT JOIN LATERAL(SELECT value.* FROM master.work_assignment value WHERE value.tenant_id=employee.tenant_id AND value.employee_id=employee.id ORDER BY value.effective_from DESC,value.id DESC LIMIT 1) assignment ON true
      LEFT JOIN LATERAL(SELECT value.* FROM document.onboarding_case value WHERE value.tenant_id=employee.tenant_id AND value.employee_id=employee.id ORDER BY value.created_at DESC,value.id DESC LIMIT 1) onboarding ON true
      LEFT JOIN LATERAL(SELECT value.id FROM document.workforce_request value WHERE value.tenant_id=employee.tenant_id AND (value.materialized_onboarding_case_id=onboarding.id OR value.materialized_employee_id=employee.id) ORDER BY value.created_at DESC,value.id DESC LIMIT 1) onboarding_request ON true
      LEFT JOIN LATERAL(SELECT value.* FROM document.offboarding_case value WHERE value.tenant_id=employee.tenant_id AND value.employee_id=employee.id ORDER BY value.created_at DESC,value.id DESC LIMIT 1) offboarding ON true
      WHERE employee.tenant_id=${tenantId}::uuid AND employee.id=${employeeId}::uuid LIMIT 1`.execute(
        transaction,
      )
    ).rows[0];
    if (!row) return null;
    const returned = (
      await sql<Row>`SELECT id,request_no,status,row_version,requested_changes,updated_at FROM document.workforce_request WHERE tenant_id=${tenantId}::uuid AND (target_employee_id=${employeeId}::uuid OR materialized_employee_id=${employeeId}::uuid) AND status='returned' ORDER BY updated_at DESC NULLS LAST,created_at DESC LIMIT 1`.execute(
        transaction,
      )
    ).rows[0];
    return detail(row, returned);
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
      await sql<Row>`SELECT id,employee_id FROM document.offboarding_case WHERE tenant_id=${input.tenantId}::uuid AND idempotency_key=${input.idempotencyKey} LIMIT 1`.execute(
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
      await sql<Row>`SELECT employee.id employee_id,employee.name,employment.id employment_id,employment.hire_date,assignment.id assignment_id FROM master.employee employee JOIN master.employment employment ON employment.tenant_id=employee.tenant_id AND employment.employee_id=employee.id AND employment.status='active' LEFT JOIN master.work_assignment assignment ON assignment.tenant_id=employee.tenant_id AND assignment.employment_id=employment.id AND assignment.status='active' AND assignment.assignment_type='primary' WHERE employee.tenant_id=${input.tenantId}::uuid AND employee.id=${input.employeeId}::uuid FOR UPDATE OF employee,employment,assignment`.execute(
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
    await sql`UPDATE master.employee SET termination_date=${input.exitDate}::date,updated_by=${input.actorId}::uuid WHERE tenant_id=${input.tenantId}::uuid AND id=${input.employeeId}::uuid`.execute(
      transaction,
    );
    await sql`SELECT * FROM document.command_internal_workforce_identity_intent(${input.tenantId}::uuid,${text(current, "employment_id")}::uuid,'deprovisioned',false,${`offboard:${input.idempotencyKey}`},${input.actorId}::uuid,NULL::uuid)`.execute(
      transaction,
    );
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
      await sql<Row>`SELECT employment.id FROM master.employment employment WHERE employment.tenant_id=${input.tenantId}::uuid AND employment.employee_id=${input.employeeId}::uuid AND employment.legal_entity_id=${input.employerOrganizationId}::uuid ORDER BY employment.is_primary DESC,employment.hire_date DESC,employment.id DESC LIMIT 1`.execute(
        transaction,
      )
    ).rows[0];
    if (!employment) return null;
    const row = (
      await sql<Row>`SELECT employment_id,replayed FROM document.command_internal_workforce_identity_intent(${input.tenantId}::uuid,${text(employment, "id")}::uuid,'active',${input.createPrincipal},${input.idempotencyKey},${input.actorId}::uuid,NULL::uuid)`.execute(
        transaction,
      )
    ).rows[0];
    return row
      ? {
          projectionId: text(row, "employment_id"),
          replayed: Boolean(row["replayed"]),
        }
      : null;
  }

  async readPersonEvidence(
    input: Parameters<WorkforceRepository<Tx>["readPersonEvidence"]>[0],
    transaction: Tx,
  ): Promise<PersonEvidenceView | null> {
    const row = (
      await sql<Row>`SELECT date_of_birth,gender,marital_status,nationality_country_code,national_id_type,national_id_token,tax_identifier_token,passport_number_token,emergency_contact,protected_attributes FROM master.person_sensitive_profile WHERE tenant_id=${input.tenantId}::uuid AND person_id=${input.personId}::uuid LIMIT 1`.execute(
        transaction,
      )
    ).rows[0];
    if (!row) return null;
    const allowed: Record<string, readonly string[]> = {
      employment: ["dateOfBirth", "nationalityCountryCode", "emergencyContact"],
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
      ],
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
    const disclosed = input.fields.filter(
        (field) => allowed[input.purpose]!.includes(field) && field in columns,
      ),
      redacted = input.fields.filter((field) => !disclosed.includes(field));
    const fields: Record<string, unknown> = {};
    for (const field of disclosed)
      fields[field] = serialize(row[columns[field]!] ?? null);
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
    ...(optional(row, "employment_status")
      ? { employmentStatus: optional(row, "employment_status") }
      : {}),
    ...(row["hire_date"] ? { hireDate: dateOnly(row["hire_date"]) } : {}),
    ...(row["termination_date"]
      ? { terminationDate: dateOnly(row["termination_date"]) }
      : {}),
    ...(optional(row, "onboarding_status")
      ? { onboardingStatus: optional(row, "onboarding_status") }
      : {}),
  };
}
function detail(row: Row, returned?: Row): WorkforceDetail {
  const base = summary(row),
    reasons: WorkforceReadinessReason[] = [];
  if (row["person_status"] !== "active") reasons.push("PERSON_INACTIVE");
  if (row["employee_status"] !== "active") reasons.push("EMPLOYEE_INACTIVE");
  if (!row["employment_id"] || row["employment_status"] !== "active")
    reasons.push("EMPLOYMENT_NOT_EFFECTIVE");
  if (!row["assignment_id"]) reasons.push("PRIMARY_ASSIGNMENT_NOT_EFFECTIVE");
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
            employmentNumber: optional(row, "employment_number"),
            employmentType: optional(row, "employment_type"),
            status: optional(row, "employment_status"),
            hireDate: row["hire_date"] ? dateOnly(row["hire_date"]) : undefined,
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
            positionId: optional(row, "position_id"),
            orgUnitId: optional(row, "org_unit_id"),
            managerEmployeeId: optional(row, "manager_employee_id"),
            fte: Number(row["fte"]),
            effectiveFrom: dateOnly(row["effective_from"]),
            effectiveUntil: row["effective_until"]
              ? dateOnly(row["effective_until"])
              : undefined,
          },
        }
      : {}),
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
