import type { BusinessPartnerAggregate, BusinessPartnerRequest, BusinessPartnerRequestRepository } from "@athyper/server-contract-master-data";
import { sql, type Transaction } from "kysely";
import { MasterDataError } from "./errors.js";

type Database = Record<string, never>;
type Tx = Transaction<Database>;
type Row = Record<string, unknown>;

export class KyselyBusinessPartnerRequestRepository implements BusinessPartnerRequestRepository<Tx> {
  async findByIdempotencyKey(tenantId: string, idempotencyKey: string, transaction: Tx): Promise<BusinessPartnerRequest | null> {
    await sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${tenantId}:business_partner_request:${idempotencyKey}`},0))`.execute(transaction);
    const row = (await sql<Row>`SELECT * FROM document.business_partner_request WHERE tenant_id=${tenantId}::uuid AND idempotency_key=${idempotencyKey} LIMIT 1`.execute(transaction)).rows[0];
    return row ? map(row) : null;
  }

  async create(input: Parameters<BusinessPartnerRequestRepository<Tx>["create"]>[0], transaction: Tx): Promise<BusinessPartnerRequest> {
    const command = input.command, source = command.source;
    if(command.targetBusinessPartnerId&&(command.kind==="add_supplier"||command.kind==="add_customer"||command.kind==="add_workforce")){
      await sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${input.tenantId}:business_partner_role:${command.targetBusinessPartnerId}:${command.requestedRole}`},0))`.execute(transaction);
      const open=(await sql<{exists:boolean}>`SELECT EXISTS(SELECT 1 FROM document.business_partner_request WHERE tenant_id=${input.tenantId}::uuid AND target_business_partner_id=${command.targetBusinessPartnerId}::uuid AND requested_role=${command.requestedRole!}::document.business_partner_requested_role_d AND request_kind=${command.kind} AND status IN ('draft','validating','validation_failed','pending_approval','returned','approved','applying','failed')) AS exists`.execute(transaction)).rows[0]?.exists===true;
      if(open)throw new MasterDataError(409,"BUSINESS_PARTNER_ROLE_EXTENSION_ALREADY_OPEN","An open request already governs this Business Partner role");
    }
    if(command.targetBusinessPartnerId&&(command.kind==="assign_organization"||command.kind==="configure_company")){
      const coordinate=`${input.tenantId}:business_partner_scope_request:${command.kind}:${command.targetBusinessPartnerId}:${command.requestedRole}:${command.operatingOrganizationId}:${command.companyCodeId??"none"}`;
      await sql`SELECT pg_advisory_xact_lock(hashtextextended(${coordinate},0))`.execute(transaction);
      const open=(await sql<{exists:boolean}>`SELECT EXISTS(SELECT 1 FROM document.business_partner_request
        WHERE tenant_id=${input.tenantId}::uuid AND target_business_partner_id=${command.targetBusinessPartnerId}::uuid
          AND requested_role=${command.requestedRole!}::document.business_partner_requested_role_d AND request_kind=${command.kind}
          AND operating_organization_id=${command.operatingOrganizationId}::uuid
          AND (${command.kind} <> 'configure_company' OR company_code_id=${command.companyCodeId??null}::uuid)
          AND status IN ('draft','validating','validation_failed','pending_approval','returned','approved','applying','failed')) AS exists`.execute(transaction)).rows[0]?.exists===true;
      if(open)throw new MasterDataError(409,"BUSINESS_PARTNER_SCOPE_REQUEST_ALREADY_OPEN","An open request already governs this Business Partner scope");
    }
    const row = (await sql<Row>`INSERT INTO document.business_partner_request(
      tenant_id,request_no,request_kind,source_kind,registration_mode,invitation_id,applicant_principal_id,represented_party_name,representation_evidence_id,target_business_partner_id,
      source_system_code,source_entity_code,source_entity_id,source_entity_code_value,source_projection_id,source_version,source_payload_hash,
      requested_role,operating_organization_id,company_code_id,legal_entity_id,org_unit_id,position_id,payload_schema_code,payload_schema_version,payload_schema_hash,
      proposed_payload,idempotency_key,created_by
    ) VALUES (
      ${input.tenantId}::uuid,${input.requestNo},${command.kind},${source.kind},${command.registrationMode ?? defaultRegistrationMode(source.kind)},${command.invitationId ?? null}::uuid,${command.applicantPrincipalId ?? null}::uuid,${command.representedPartyName ?? null},${command.representationEvidenceId ?? null}::uuid,${command.targetBusinessPartnerId ?? null}::uuid,
      ${source.systemCode ?? null},${source.entityCode ?? null},${source.entityId ?? null},${source.entityCodeValue ?? null},${source.projectionId ?? null}::uuid,${source.version ?? null},${source.payloadHash ?? null},
      ${command.requestedRole ?? null}::document.business_partner_requested_role_d,${command.operatingOrganizationId??null}::uuid,${command.companyCodeId ?? null}::uuid,${command.legalEntityId??null}::uuid,${command.orgUnitId??null}::uuid,${command.positionId??null}::uuid,${input.schema.code},${input.schema.version},${input.schema.hash},
      ${JSON.stringify(command.proposedPayload)}::jsonb,${command.idempotencyKey},${input.createdBy}::uuid
    ) RETURNING *`.execute(transaction)).rows[0];
    if (!row) throw new Error("BUSINESS_PARTNER_REQUEST_CREATE_FAILED");
    return map(row);
  }

  async get(tenantId: string, requestId: string, transaction: Tx): Promise<BusinessPartnerRequest | null> {
    const row = (await sql<Row>`SELECT * FROM document.business_partner_request WHERE tenant_id=${tenantId}::uuid AND id=${requestId}::uuid LIMIT 1`.execute(transaction)).rows[0];
    return row ? map(row) : null;
  }

  async getView(tenantId:string,requestId:string,transaction:Tx){
    const row=(await sql<Row>`SELECT request.*,workflow.definition_code AS wf_code,workflow.definition_version AS wf_version,
      workflow.compiled_artifact_hash AS wf_hash,stage.id AS stage_id,item.id AS work_item_id,item.row_version AS work_item_version,item.status AS work_item_status
      FROM document.business_partner_request request
      LEFT JOIN document.workflow_request workflow ON workflow.tenant_id=request.tenant_id AND workflow.id=request.workflow_request_id
      LEFT JOIN LATERAL(SELECT value.id FROM document.workflow_stage value WHERE value.tenant_id=request.tenant_id AND value.workflow_request_id=workflow.id ORDER BY value.stage_no DESC,value.id DESC LIMIT 1)stage ON true
      LEFT JOIN LATERAL(SELECT value.id,value.row_version,value.status FROM document.work_item value WHERE value.tenant_id=request.tenant_id AND value.source_entity_code='business_partner_request' AND value.source_entity_id=request.id ORDER BY value.created_at DESC,value.id DESC LIMIT 1)item ON true
      WHERE request.tenant_id=${tenantId}::uuid AND request.id=${requestId}::uuid LIMIT 1`.execute(transaction)).rows[0];
    if(!row)return null;
    const findings=(await sql<Row>`SELECT rule_code,severity,field_path,outcome,message_code,evidence_reference FROM document.business_partner_request_validation
      WHERE tenant_id=${tenantId}::uuid AND request_id=${requestId}::uuid AND evaluation_id=(SELECT evaluation_id FROM document.business_partner_request_validation WHERE tenant_id=${tenantId}::uuid AND request_id=${requestId}::uuid ORDER BY evaluated_at DESC,id DESC LIMIT 1)
      ORDER BY CASE severity WHEN 'error' THEN 1 WHEN 'warning' THEN 2 ELSE 3 END,rule_code,field_path`.execute(transaction)).rows;
    const request=map(row),workflowRequestId=optional(row,"workflow_request_id"),stageId=optional(row,"stage_id"),workItemId=optional(row,"work_item_id");
    return{request,validationFindings:findings.map(value=>({ruleCode:text(value,"rule_code"),severity:text(value,"severity") as "info"|"warning"|"error",fieldPath:text(value,"field_path"),outcome:text(value,"outcome") as "passed"|"failed"|"skipped",messageCode:text(value,"message_code"),evidenceReference:object(value["evidence_reference"])})),...(workflowRequestId&&stageId&&workItemId?{workflow:{requestId:workflowRequestId,stageId,workItemId,workItemVersion:Number(row["work_item_version"]),workItemStatus:text(row,"work_item_status"),definition:{code:text(row,"wf_code"),version:Number(row["wf_version"]),hash:text(row,"wf_hash")}}}:{})};
  }

  async list(query: Parameters<BusinessPartnerRequestRepository<Tx>["list"]>[0], transaction: Tx): Promise<readonly BusinessPartnerRequest[]> {
    const result = await sql<Row>`SELECT * FROM document.business_partner_request
      WHERE tenant_id=${query.tenantId}::uuid
        AND (operating_organization_id=${query.operatingOrganizationId}::uuid OR (
          requested_role='workforce' AND EXISTS(
            SELECT 1 FROM master.operating_organization_company_assignment company_scope
            WHERE company_scope.tenant_id=document.business_partner_request.tenant_id
              AND company_scope.operating_organization_id=${query.operatingOrganizationId}::uuid
              AND company_scope.company_code_id=document.business_partner_request.company_code_id
              AND company_scope.status='active'
              AND company_scope.effective_from<=CURRENT_DATE
              AND (company_scope.effective_until IS NULL OR company_scope.effective_until>CURRENT_DATE))))
        AND (${query.status ?? null}::text IS NULL OR status=${query.status ?? null})
        AND (${query.beforeCreatedAt ?? null}::timestamptz IS NULL OR created_at<${query.beforeCreatedAt ?? null}::timestamptz)
      ORDER BY created_at DESC,id DESC LIMIT ${query.limit ?? 50}`.execute(transaction);
    return result.rows.map(map);
  }

  async getAggregate(tenantId: string, businessPartnerId: string, operatingOrganizationId: string, transaction: Tx): Promise<BusinessPartnerAggregate | null> {
    const partner=(await sql<Row>`SELECT partner.* FROM master.business_partner partner
      WHERE partner.tenant_id=${tenantId}::uuid AND partner.id=${businessPartnerId}::uuid
        AND EXISTS(SELECT 1 FROM master.business_partner_operating_organization_assignment assignment
          WHERE assignment.tenant_id=partner.tenant_id AND assignment.business_partner_id=partner.id
            AND assignment.operating_organization_id=${operatingOrganizationId}::uuid AND assignment.status='active')
      LIMIT 1`.execute(transaction)).rows[0];
    if(!partner)return null;
    const suppliers=(await sql<Row>`SELECT id,supplier_code,supplier_type,status,created_at,updated_at FROM master.supplier
      WHERE tenant_id=${tenantId}::uuid AND business_partner_id=${businessPartnerId}::uuid ORDER BY created_at,id`.execute(transaction)).rows;
    const customers=(await sql<Row>`SELECT id,customer_code,customer_type,is_key_account,status,created_at,updated_at FROM master.customer
      WHERE tenant_id=${tenantId}::uuid AND business_partner_id=${businessPartnerId}::uuid ORDER BY created_at,id`.execute(transaction)).rows;
    const supplierProfiles=(await sql<Row>`SELECT profile.id,profile.supplier_id,profile.company_code_id,profile.currency_code,profile.payment_term_id,profile.status,profile.created_at,profile.updated_at FROM master.company_code_supplier_profile profile JOIN master.supplier role ON role.tenant_id=profile.tenant_id AND role.id=profile.supplier_id WHERE role.tenant_id=${tenantId}::uuid AND role.business_partner_id=${businessPartnerId}::uuid ORDER BY profile.company_code_id,profile.id`.execute(transaction)).rows;
    const customerProfiles=(await sql<Row>`SELECT profile.id,profile.customer_id,profile.company_code_id,profile.currency_code,profile.credit_limit,profile.credit_limit_currency_code,profile.payment_term_id,profile.statement_cycle_code,profile.status,profile.created_at,profile.updated_at FROM master.company_code_customer_profile profile JOIN master.customer role ON role.tenant_id=profile.tenant_id AND role.id=profile.customer_id WHERE role.tenant_id=${tenantId}::uuid AND role.business_partner_id=${businessPartnerId}::uuid ORDER BY profile.company_code_id,profile.id`.execute(transaction)).rows;
    const assignments=(await sql<Row>`SELECT assignment.id,assignment.operating_organization_id,organization.code AS operating_organization_code,
      COALESCE(organization.display_name,organization.name) AS operating_organization_name,assignment.partner_role,assignment.status,assignment.effective_from,assignment.effective_until
      FROM master.business_partner_operating_organization_assignment assignment
      JOIN master.operating_organization organization ON organization.tenant_id=assignment.tenant_id AND organization.id=assignment.operating_organization_id
      WHERE assignment.tenant_id=${tenantId}::uuid AND assignment.business_partner_id=${businessPartnerId}::uuid
        AND assignment.operating_organization_id=${operatingOrganizationId}::uuid ORDER BY assignment.effective_from DESC,assignment.id`.execute(transaction)).rows;
    const requests=(await sql<Row>`SELECT * FROM document.business_partner_request WHERE tenant_id=${tenantId}::uuid
      AND (target_business_partner_id=${businessPartnerId}::uuid OR materialized_business_partner_id=${businessPartnerId}::uuid)
      AND operating_organization_id=${operatingOrganizationId}::uuid ORDER BY created_at DESC,id DESC LIMIT 50`.execute(transaction)).rows;
    return {
      businessPartner:{id:text(partner,"id"),code:text(partner,"code"),name:text(partner,"name"),...(optional(partner,"display_name")?{displayName:optional(partner,"display_name")} : {}),...(optional(partner,"legal_name")?{legalName:optional(partner,"legal_name")} : {}),partnerCategory:text(partner,"partner_category"),...(optional(partner,"legal_form")?{legalForm:optional(partner,"legal_form")} : {}),...(optional(partner,"registration_country_code")?{registrationCountryCode:optional(partner,"registration_country_code")} : {}),...(partner["incorporation_date"]?{incorporationDate:dateOnly(partner["incorporation_date"])}:{}),...(optional(partner,"website_url")?{websiteUrl:optional(partner,"website_url")} : {}),...(optional(partner,"description")?{description:optional(partner,"description")} : {}),aliases:stringArray(partner["aliases"]),status:text(partner,"status"),createdAt:date(partner["created_at"]),...(partner["updated_at"]?{updatedAt:date(partner["updated_at"])}:{})},
      suppliers:suppliers.map(row=>({id:text(row,"id"),supplierCode:text(row,"supplier_code"),supplierType:text(row,"supplier_type"),status:text(row,"status"),createdAt:date(row["created_at"]),...(row["updated_at"]?{updatedAt:date(row["updated_at"])}:{})})),
      customers:customers.map(row=>({id:text(row,"id"),customerCode:text(row,"customer_code"),customerType:text(row,"customer_type"),isKeyAccount:Boolean(row["is_key_account"]),status:text(row,"status"),createdAt:date(row["created_at"]),...(row["updated_at"]?{updatedAt:date(row["updated_at"])}:{})})),
      supplierCompanyProfiles:supplierProfiles.map(row=>({id:text(row,"id"),supplierId:text(row,"supplier_id"),companyCodeId:text(row,"company_code_id"),...(optional(row,"currency_code")?{currencyCode:optional(row,"currency_code")} : {}),...(optional(row,"payment_term_id")?{paymentTermId:optional(row,"payment_term_id")} : {}),status:text(row,"status"),createdAt:date(row["created_at"]),...(row["updated_at"]?{updatedAt:date(row["updated_at"])}:{})})),
      customerCompanyProfiles:customerProfiles.map(row=>({id:text(row,"id"),customerId:text(row,"customer_id"),companyCodeId:text(row,"company_code_id"),...(optional(row,"currency_code")?{currencyCode:optional(row,"currency_code")} : {}),...(row["credit_limit"]!=null?{creditLimit:Number(row["credit_limit"])}:{}),...(optional(row,"credit_limit_currency_code")?{creditLimitCurrencyCode:optional(row,"credit_limit_currency_code")} : {}),...(optional(row,"payment_term_id")?{paymentTermId:optional(row,"payment_term_id")} : {}),...(optional(row,"statement_cycle_code")?{statementCycleCode:optional(row,"statement_cycle_code")} : {}),status:text(row,"status"),createdAt:date(row["created_at"]),...(row["updated_at"]?{updatedAt:date(row["updated_at"])}:{})})),
      organizationAssignments:assignments.map(row=>({id:text(row,"id"),operatingOrganizationId:text(row,"operating_organization_id"),operatingOrganizationCode:text(row,"operating_organization_code"),operatingOrganizationName:text(row,"operating_organization_name"),partnerRole:text(row,"partner_role"),status:text(row,"status"),effectiveFrom:dateOnly(row["effective_from"]),...(row["effective_until"]?{effectiveUntil:dateOnly(row["effective_until"])}:{})})),
      onboardingRequests:requests.map(map),
    };
  }

  async patch(input: Parameters<BusinessPartnerRequestRepository<Tx>["patch"]>[0], transaction: Tx): Promise<BusinessPartnerRequest | null> {
    const hasCompany = input.companyCodeId !== undefined,hasLegalEntity=input.legalEntityId!==undefined,hasOrgUnit=input.orgUnitId!==undefined,hasPosition=input.positionId!==undefined, hasRole = input.requestedRole !== undefined, hasRepresentationEvidence = input.representationEvidenceId !== undefined;
    const row = (await sql<Row>`UPDATE document.business_partner_request SET
      proposed_payload=${JSON.stringify(input.proposedPayload)}::jsonb,
      operating_organization_id=COALESCE(${input.operatingOrganizationId ?? null}::uuid,operating_organization_id),
      company_code_id=CASE WHEN ${hasCompany} THEN ${input.companyCodeId ?? null}::uuid ELSE company_code_id END,
      legal_entity_id=CASE WHEN ${hasLegalEntity} THEN ${input.legalEntityId??null}::uuid ELSE legal_entity_id END,
      org_unit_id=CASE WHEN ${hasOrgUnit} THEN ${input.orgUnitId??null}::uuid ELSE org_unit_id END,
      position_id=CASE WHEN ${hasPosition} THEN ${input.positionId??null}::uuid ELSE position_id END,
      requested_role=CASE WHEN ${hasRole} THEN ${input.requestedRole ?? null}::document.business_partner_requested_role_d ELSE requested_role END,
      representation_evidence_id=CASE WHEN ${hasRepresentationEvidence} THEN ${input.representationEvidenceId ?? null}::uuid ELSE representation_evidence_id END,
      validation_summary='{}'::jsonb,duplicate_summary='{}'::jsonb,change_impact='{}'::jsonb,
      status=CASE WHEN status='validation_failed' THEN 'draft' ELSE status END,
      updated_by=${input.updatedBy}::uuid
      WHERE tenant_id=${input.tenantId}::uuid AND id=${input.requestId}::uuid AND row_version=${input.expectedVersion}
        AND status IN ('draft','validation_failed','returned')
      RETURNING *`.execute(transaction)).rows[0];
    return row ? map(row) : null;
  }

  async recordValidation(input: Parameters<BusinessPartnerRequestRepository<Tx>["recordValidation"]>[0], transaction: Tx): Promise<BusinessPartnerRequest | null> {
    const locked = (await sql<Row>`UPDATE document.business_partner_request SET
      status='validating', updated_by=${input.evaluatedBy}::uuid
      WHERE tenant_id=${input.tenantId}::uuid AND id=${input.requestId}::uuid
        AND row_version=${input.expectedVersion} AND status IN ('draft','validation_failed','returned')
      RETURNING id`.execute(transaction)).rows[0];
    if (!locked) return null;
    for (const finding of input.result.findings) {
      await sql`INSERT INTO document.business_partner_request_validation(
        tenant_id,request_id,evaluation_id,rule_code,ruleset_code,ruleset_version,ruleset_hash,
        severity,field_path,outcome,message_code,evidence_reference,evaluated_at,evaluated_by,created_by
      ) VALUES (
        ${input.tenantId}::uuid,${input.requestId}::uuid,${input.result.evaluationId}::uuid,${finding.ruleCode},
        ${input.result.ruleset.code},${input.result.ruleset.version},${input.result.ruleset.hash},${finding.severity},
        ${finding.fieldPath},${finding.outcome},${finding.messageCode},${JSON.stringify(finding.evidenceReference)}::jsonb,
        ${input.result.evaluatedAt}::timestamptz,${input.evaluatedBy}::uuid,${input.evaluatedBy}::uuid
      )`.execute(transaction);
    }
    const row = (await sql<Row>`UPDATE document.business_partner_request SET
      status=${input.result.valid ? "draft" : "validation_failed"},
      validation_summary=${JSON.stringify(input.result.validationSummary)}::jsonb,
      duplicate_summary=${JSON.stringify(input.result.duplicateSummary)}::jsonb,
      change_impact=${JSON.stringify(input.result.changeImpact)}::jsonb,
      updated_by=${input.evaluatedBy}::uuid
      WHERE tenant_id=${input.tenantId}::uuid AND id=${input.requestId}::uuid AND status='validating'
      RETURNING *`.execute(transaction)).rows[0];
    if (!row) throw new Error("BUSINESS_PARTNER_REQUEST_VALIDATION_FINALIZE_FAILED");
    return map(row);
  }

  async submit(input: Parameters<BusinessPartnerRequestRepository<Tx>["submit"]>[0], transaction: Tx) {
    await sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${input.tenantId}:business_partner_request_submit:${input.requestId}`},0))`.execute(transaction);
    const replay = await submissionResult(input.tenantId, input.requestId, input.idempotencyKey, transaction);
    if (replay) return { ...replay, replayed: true as const };
    const claimed = (await sql<Row>`UPDATE document.business_partner_request SET status='validating',updated_by=${input.submittedBy}::uuid
      WHERE tenant_id=${input.tenantId}::uuid AND id=${input.requestId}::uuid AND row_version=${input.expectedVersion} AND status='draft'
        AND validation_summary->>'outcome'='passed' AND COALESCE((duplicate_summary->>'blocking')::boolean,false)=false
      RETURNING *`.execute(transaction)).rows[0];
    if (!claimed) return null;
    const existingWorkflowId=optional(claimed,"workflow_request_id");
    const priorStageCount=existingWorkflowId?Number((await sql<{count:number}>`SELECT count(*)::int AS count FROM document.workflow_stage WHERE tenant_id=${input.tenantId}::uuid AND workflow_request_id=${existingWorkflowId}::uuid`.execute(transaction)).rows[0]?.count??0):0;
    const stageNo=priorStageCount+1,stageCode=stageNo===1?input.definition.stageCode:`business_review_${stageNo}`;
    const workflow = existingWorkflowId ? (await sql<Row>`UPDATE document.workflow_request SET
      definition_code=${input.definition.code},definition_version=${input.definition.version},compiled_artifact_hash=${input.definition.hash},
      template_snapshot=${JSON.stringify({ stageCode:input.definition.stageCode,stageName:input.definition.stageName,mode:"any",quorum:1 })}::jsonb,
      entity_snapshot=${JSON.stringify(reviewSnapshot(map(claimed)))}::jsonb,requested_by=${input.submittedBy}::uuid,requested_at=now(),
      decision=NULL,decided_by=NULL,decided_at=NULL,reason=NULL,status='pending',
      metadata=metadata||${JSON.stringify({ submissionIdempotencyKey:input.idempotencyKey,submissionFingerprint:input.decisionFingerprint,approverPrincipalIds:[...input.definition.approverPrincipalIds].sort(),iteration:stageNo })}::jsonb,
      updated_by=${input.submittedBy}::uuid WHERE tenant_id=${input.tenantId}::uuid AND id=${existingWorkflowId}::uuid RETURNING id`.execute(transaction)).rows[0]
      : (await sql<Row>`INSERT INTO document.workflow_request(
      tenant_id,workflow_type,definition_code,definition_version,compiled_artifact_hash,template_snapshot,
      entity_type,entity_id,entity_snapshot,requested_by,correlation_id,metadata,created_by
    ) VALUES (
      ${input.tenantId}::uuid,'approval',${input.definition.code},${input.definition.version},${input.definition.hash},
      ${JSON.stringify({ stageCode:input.definition.stageCode,stageName:input.definition.stageName,mode:"any",quorum:1 })}::jsonb,
      'business_partner_request',${input.requestId},${JSON.stringify(reviewSnapshot(map(claimed)))}::jsonb,${input.submittedBy}::uuid,
      ${input.correlationId ?? null}::uuid,${JSON.stringify({ submissionIdempotencyKey:input.idempotencyKey,submissionFingerprint:input.decisionFingerprint,approverPrincipalIds:[...input.definition.approverPrincipalIds].sort(),iteration:stageNo })}::jsonb,${input.submittedBy}::uuid
    ) RETURNING id`.execute(transaction)).rows[0];
    if (!workflow) throw new Error("BUSINESS_PARTNER_WORKFLOW_CREATE_FAILED");
    const workflowRequestId=text(workflow,"id");
    const stage=(await sql<Row>`INSERT INTO document.workflow_stage(
      tenant_id,workflow_request_id,stage_no,stage_code,name,mode,quorum,started_at,status,created_by
    ) VALUES (${input.tenantId}::uuid,${workflowRequestId}::uuid,${stageNo},${stageCode},${input.definition.stageName},'parallel',
      ${JSON.stringify({ type:"any",required:1,eligibleCount:input.definition.approverPrincipalIds.length })}::jsonb,now(),'active',${input.submittedBy}::uuid) RETURNING id`.execute(transaction)).rows[0];
    if (!stage) throw new Error("BUSINESS_PARTNER_WORKFLOW_STAGE_CREATE_FAILED");
    const workItem=(await sql<Row>`INSERT INTO document.work_item(
      tenant_id,work_type_code,title,description,source_entity_code,source_entity_id,source_action_code,payload,status,created_by
    ) VALUES (${input.tenantId}::uuid,'business_partner_request.approval',${`Approve Business Partner request ${map(claimed).requestNo}`},
      'Review the validated Business Partner onboarding request','business_partner_request',${input.requestId}::uuid,'decide',
      ${JSON.stringify({ workflowRequestId,workflowStageId:text(stage,"id"),submissionFingerprint:input.decisionFingerprint,eligibilityEvidence:{permissionCode:"neon.relationship.business_partner_request.decide",approverPrincipalIds:[...input.definition.approverPrincipalIds].sort()} })}::jsonb,'open',${input.submittedBy}::uuid) RETURNING id,row_version`.execute(transaction)).rows[0];
    if (!workItem) throw new Error("BUSINESS_PARTNER_WORK_ITEM_CREATE_FAILED");
    const request=(await sql<Row>`UPDATE document.business_partner_request SET
      status='pending_approval',workflow_request_id=${workflowRequestId}::uuid,decision_fingerprint=${input.decisionFingerprint},
      submitted_at=now(),submitted_by=${input.submittedBy}::uuid,updated_by=${input.submittedBy}::uuid
      WHERE tenant_id=${input.tenantId}::uuid AND id=${input.requestId}::uuid AND status='validating'
      RETURNING *`.execute(transaction)).rows[0];
    if (!request) throw new Error("BUSINESS_PARTNER_SUBMISSION_FINALIZE_FAILED");
    return { request:map(request), workflow:{ requestId:workflowRequestId,stageId:text(stage,"id"),workItemId:text(workItem,"id"),definition:{code:input.definition.code,version:input.definition.version,hash:input.definition.hash},decisionFingerprint:input.decisionFingerprint },replayed:false as const };
  }

  async decide(input: Parameters<BusinessPartnerRequestRepository<Tx>["decide"]>[0], transaction: Tx) {
    await sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${input.tenantId}:business_partner_request_decide:${input.command.workflowRequestId}`},0))`.execute(transaction);
    const replay=await decisionReplay(input,transaction);
    if(replay)return replay;
    const workflow=(await sql<Row>`SELECT wr.id,wr.definition_code,wr.definition_version,wr.compiled_artifact_hash,ws.id AS stage_id
      FROM document.workflow_request wr JOIN document.workflow_stage ws ON ws.tenant_id=wr.tenant_id AND ws.workflow_request_id=wr.id AND ws.status='active'
      WHERE wr.tenant_id=${input.tenantId}::uuid AND wr.id=${input.command.workflowRequestId}::uuid AND wr.status='pending' FOR UPDATE OF wr,ws`.execute(transaction)).rows[0];
    if(!workflow)return null;
    const item=(await sql<Row>`UPDATE document.work_item SET status='completed',completed_at=now(),row_version=row_version+1,
      outcome=${JSON.stringify({decision:input.command.decision,reason:input.command.reason,idempotencyKey:input.command.idempotencyKey,decisionFingerprint:input.decisionFingerprint,decidedBy:input.decidedBy})}::jsonb,
      updated_by=${input.decidedBy}::uuid
      WHERE tenant_id=${input.tenantId}::uuid AND id=${input.command.workItemId}::uuid AND source_entity_id=${input.command.requestId}::uuid
        AND status IN ('open','claimed') AND row_version=${input.command.expectedWorkItemVersion}
        AND payload->'eligibilityEvidence'->'approverPrincipalIds' ? ${input.decidedBy}
        AND (claimant_principal_id IS NULL OR claimant_principal_id=${input.decidedBy}::uuid)
      RETURNING id,row_version`.execute(transaction)).rows[0];
    if(!item)return null;
    const targetStatus=input.command.decision==="approve"?"approved":input.command.decision==="reject"?"rejected":"returned";
    const request=(await sql<Row>`UPDATE document.business_partner_request SET status=${targetStatus},
      approved_at=CASE WHEN ${input.command.decision}='approve' THEN now() ELSE approved_at END,
      approved_by=CASE WHEN ${input.command.decision}='approve' THEN ${input.decidedBy}::uuid ELSE approved_by END,
      updated_by=${input.decidedBy}::uuid
      WHERE tenant_id=${input.tenantId}::uuid AND id=${input.command.requestId}::uuid AND workflow_request_id=${input.command.workflowRequestId}::uuid
        AND status='pending_approval' AND row_version=${input.command.expectedRequestVersion}
        AND (${input.command.decision}<>'approve' OR submitted_by IS DISTINCT FROM ${input.decidedBy}::uuid)
      RETURNING *`.execute(transaction)).rows[0];
    if(!request)return null;
    const workflowDecision=input.command.decision==="approve"?"approved":input.command.decision==="reject"?"rejected":"cancelled";
    const stageOutcome=input.command.decision==="approve"?"approved":input.command.decision==="reject"?"rejected":"cancelled";
    await sql`UPDATE document.workflow_stage SET status='completed',completed_at=now(),outcome=${stageOutcome},updated_by=${input.decidedBy}::uuid
      WHERE tenant_id=${input.tenantId}::uuid AND id=${text(workflow,"stage_id")}::uuid AND status='active'`.execute(transaction);
    await sql`UPDATE document.workflow_request SET status=${workflowDecision},decision=${workflowDecision}::document.workflow_decision_d,
      decided_at=now(),decided_by=${input.decidedBy}::uuid,reason=${input.command.reason},
      metadata=metadata||${JSON.stringify({decisionIdempotencyKey:input.command.idempotencyKey,decisionFingerprint:input.decisionFingerprint,decision:input.command.decision,workItemId:input.command.workItemId})}::jsonb,
      updated_by=${input.decidedBy}::uuid WHERE tenant_id=${input.tenantId}::uuid AND id=${input.command.workflowRequestId}::uuid AND status='pending'`.execute(transaction);
    return decisionResponse(input,map(request),workflow,false);
  }

  async apply(input: Parameters<BusinessPartnerRequestRepository<Tx>["apply"]>[0], transaction: Tx) {
    await sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${input.tenantId}:business_partner_request_apply:${input.command.requestId}`},0))`.execute(transaction);
    await sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${input.tenantId}:business_partner_request_application_key:${input.command.idempotencyKey}`},0))`.execute(transaction);
    const replay = await applicationResult(input.tenantId,input.command.requestId,input.command.idempotencyKey,input.applicationFingerprint,transaction);
    if(replay)return{...replay,replayed:true as const};
    const locked=(await sql<Row>`SELECT * FROM document.business_partner_request
      WHERE tenant_id=${input.tenantId}::uuid AND id=${input.command.requestId}::uuid FOR UPDATE`.execute(transaction)).rows[0];
    if(!locked||text(locked,"status")!=="approved"||Number(locked["row_version"])!==input.command.expectedVersion)return null;
    const request=map(locked),payload=request.proposedPayload;
    if(request.requestedRole==="workforce")return applyWorkforceOnboarding(input,request,transaction);
    if(request.kind==="assign_organization"||request.kind==="configure_company")
      return applyExistingRoleScope(input,request,transaction);
    const role=request.requestedRole;
    const isNew=request.kind==="new_partner";
    if(!role||!["supplier","customer"].includes(role)||!request.operatingOrganizationId||!request.approvedAt||!request.approvedBy||!request.decisionFingerprint)return null;
    if((isNew&&request.targetBusinessPartnerId)||(request.kind===`add_${role}`&&!request.targetBusinessPartnerId)||(!isNew&&request.kind!==`add_${role}`))return null;
    if(request.targetBusinessPartnerId)await sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${input.tenantId}:business_partner_role:${request.targetBusinessPartnerId}:${role}`},0))`.execute(transaction);
    const target=request.targetBusinessPartnerId?(await sql<Row>`SELECT * FROM master.business_partner WHERE tenant_id=${input.tenantId}::uuid AND id=${request.targetBusinessPartnerId}::uuid AND status<>'archived' FOR UPDATE`.execute(transaction)).rows[0]:undefined;
    if(!isNew&&!target)throw new MasterDataError(409,"BUSINESS_PARTNER_REQUEST_TARGET_UNAVAILABLE","The target Business Partner is missing or archived");
    const legalName=isNew?payloadText(payload,"legalName","legal_name","name"):optional(target!,"legal_name")??text(target!,"name");
    if(!legalName)throw new MasterDataError(409,"BUSINESS_PARTNER_REQUEST_PAYLOAD_INVALID","Approved request has no materializable legal name");
    const partnerCode=isNew?materializationCode(payloadText(payload,"partnerCode","partner_code"),`BP.${request.requestNo}`,"partnerCode"):text(target!,"code");
    const roleCode=materializationCode(payloadText(payload,role==="supplier"?"supplierCode":"customerCode",role==="supplier"?"supplier_code":"customer_code"),`${role==="supplier"?"SUP":"CUS"}.${request.requestNo}`,`${role}Code`);
    const name=payloadText(payload,"name","displayName","display_name")??legalName;
    const displayName=payloadText(payload,"displayName","display_name");
    const requestedCategory=isNew?payloadEnum(payload,"partnerCategory","partner_category",["organization","person","individual","government","nonprofit","internal"],"organization"):text(target!,"partner_category");
    const category=requestedCategory==="individual"?"person":["government","nonprofit","internal"].includes(requestedCategory)?"organization":requestedCategory;
    const ownershipClass=isNew?(requestedCategory==="internal"?"internal":payloadEnum(payload,"ownershipClass","ownership_class",["external","internal"],"external")):text(target!,"ownership_class");
    const legalClassification=isNew?(["government","nonprofit"].includes(requestedCategory)?requestedCategory:payloadOptionalEnum(payload,"legalClassification","legal_classification",["government","nonprofit","sole_proprietor"])):optional(target!,"legal_classification");
    const supplierType=role==="supplier"?payloadEnum(payload,"supplierType","supplier_type",["general","strategic","intercompany","service","carrier"],ownershipClass==="internal"?"intercompany":"general"):undefined;
    const customerType=role==="customer"?payloadEnum(payload,"customerType","customer_type",["corporate","individual","government","intercompany"],ownershipClass==="internal"?"intercompany":"corporate"):undefined;
    if(role==="supplier"&&(ownershipClass==="internal")!==(supplierType==="intercompany"))throw new MasterDataError(409,"BUSINESS_PARTNER_REQUEST_PAYLOAD_INVALID","Internal Business Partners and intercompany suppliers must be paired");
    if(role==="customer"&&(ownershipClass==="internal")!==(customerType==="intercompany"))throw new MasterDataError(409,"BUSINESS_PARTNER_REQUEST_PAYLOAD_INVALID","Internal Business Partners and intercompany customers must be paired");
    const registrationCountryCode=payloadText(payload,"registrationCountryCode","registration_country_code")?.toUpperCase();
    if(registrationCountryCode&&!/^[A-Z]{2}$/.test(registrationCountryCode))throw new MasterDataError(409,"BUSINESS_PARTNER_REQUEST_PAYLOAD_INVALID","Registration country must be an ISO alpha-2 code");
    await sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${input.tenantId}:business_partner_legal_name:${legalName.trim().toLocaleLowerCase("en-US")}`},0))`.execute(transaction);
    await sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${input.tenantId}:business_partner_code:${partnerCode}`},0))`.execute(transaction);
    const compatible=(await sql<{compatible:boolean}>`SELECT EXISTS(
      SELECT 1 FROM master.operating_organization organization
      WHERE organization.tenant_id=${input.tenantId}::uuid AND organization.id=${request.operatingOrganizationId}::uuid
        AND organization.status='active' AND organization.domain IN (${role==="supplier"?"procurement":"sales"},'both')
        AND (organization.effective_from IS NULL OR organization.effective_from<=CURRENT_DATE)
        AND (organization.effective_until IS NULL OR organization.effective_until>CURRENT_DATE)
        AND (${request.companyCodeId??null}::uuid IS NULL OR EXISTS(
          SELECT 1 FROM master.operating_organization_company_assignment company_assignment
          WHERE company_assignment.tenant_id=organization.tenant_id
            AND company_assignment.operating_organization_id=organization.id
            AND company_assignment.company_code_id=${request.companyCodeId??null}::uuid
            AND company_assignment.status='active' AND company_assignment.effective_from<=CURRENT_DATE
            AND (company_assignment.effective_until IS NULL OR company_assignment.effective_until>CURRENT_DATE)))) AS compatible`.execute(transaction)).rows[0]?.compatible===true;
    if(!compatible)throw new MasterDataError(409,"BUSINESS_PARTNER_REQUEST_SCOPE_INCOMPATIBLE",`The approved ${role} organization or company assignment is no longer effective`);
    const validationCurrent=(await sql<{valid:boolean}>`SELECT
      COALESCE(${JSON.stringify(request.validationSummary)}::jsonb->>'outcome','')='passed'
      AND COALESCE((${JSON.stringify(request.duplicateSummary)}::jsonb->>'blocking')::boolean,false)=false
      AND NOT EXISTS(
        SELECT 1 FROM document.business_partner_request_validation finding
        WHERE finding.tenant_id=${input.tenantId}::uuid AND finding.request_id=${request.id}::uuid
          AND finding.evaluation_id=(SELECT evaluation_id FROM document.business_partner_request_validation
            WHERE tenant_id=${input.tenantId}::uuid AND request_id=${request.id}::uuid ORDER BY evaluated_at DESC,created_at DESC LIMIT 1)
          AND finding.severity='error' AND finding.outcome='failed') AS valid`.execute(transaction)).rows[0]?.valid===true;
    if(!validationCurrent)return null;
    const collision=(await sql<{duplicate:boolean}>`SELECT EXISTS(
      SELECT 1 FROM master.business_partner partner WHERE partner.tenant_id=${input.tenantId}::uuid
        AND ${isNew} AND partner.status<>'archived' AND (lower(COALESCE(partner.legal_name,partner.name))=lower(${legalName}) OR lower(partner.code)=lower(${partnerCode}))
      UNION ALL SELECT 1 FROM master.supplier supplier WHERE supplier.tenant_id=${input.tenantId}::uuid AND ${role}='supplier'
        AND supplier.status<>'archived' AND (supplier.business_partner_id=${request.targetBusinessPartnerId??null}::uuid OR lower(supplier.supplier_code)=lower(${roleCode}))
      UNION ALL SELECT 1 FROM master.customer customer WHERE customer.tenant_id=${input.tenantId}::uuid AND ${role}='customer'
        AND customer.status<>'archived' AND (customer.business_partner_id=${request.targetBusinessPartnerId??null}::uuid OR lower(customer.customer_code)=lower(${roleCode}))
      UNION ALL SELECT 1 FROM document.business_partner_request prior WHERE prior.tenant_id=${input.tenantId}::uuid
        AND prior.id<>${request.id}::uuid AND prior.status='applied' AND ${request.source.systemCode??null}::text IS NOT NULL
        AND prior.source_system_code=${request.source.systemCode??null} AND prior.source_entity_code=${request.source.entityCode??null}
        AND prior.source_entity_id=${request.source.entityId??null} AND prior.source_version>=${request.source.version??null}) AS duplicate`.execute(transaction)).rows[0]?.duplicate===true;
    if(collision)throw new MasterDataError(409,"BUSINESS_PARTNER_REQUEST_ROLE_CONFLICT",`The Business Partner identity, ${role} role/code, or accepted source version now conflicts with this approved request`);
    const claimed=(await sql<Row>`UPDATE document.business_partner_request SET status='applying',updated_by=${input.appliedBy}::uuid
      WHERE tenant_id=${input.tenantId}::uuid AND id=${request.id}::uuid AND status='approved' AND row_version=${input.command.expectedVersion}
      RETURNING *`.execute(transaction)).rows[0];
    if(!claimed)return null;
    const createdPartner=isNew?(await sql<Row>`INSERT INTO master.business_partner(
      tenant_id,code,name,display_name,legal_name,partner_category,ownership_class,legal_classification,legal_form,registration_country_code,
      incorporation_date,website_url,description,aliases,metadata,status,status_changed_at,status_changed_by,created_by
    ) VALUES (${input.tenantId}::uuid,${partnerCode},${name},${displayName??null},${legalName},${category}::master.business_partner_category_d,${ownershipClass}::master.business_partner_ownership_d,${legalClassification??null}::master.business_partner_legal_classification_d,
      ${category==="person"?null:payloadText(payload,"legalForm","legal_form")??null},${category==="person"?null:registrationCountryCode??null},${category==="person"?null:payloadText(payload,"incorporationDate","incorporation_date")??null}::date,
      ${category==="person"?null:payloadText(payload,"websiteUrl","website_url")??null},${payloadText(payload,"description")??null},${payloadAliases(payload)}::text[],
      ${JSON.stringify({onboardingRequestId:request.id,sourceKind:request.source.kind,...(request.source.systemCode?{sourceSystemCode:request.source.systemCode}:{})})}::jsonb,
      'active',now(),${input.appliedBy}::uuid,${input.appliedBy}::uuid) RETURNING *`.execute(transaction)).rows[0]:undefined;
    const partner=createdPartner??target;
    if(!partner)throw new Error("BUSINESS_PARTNER_MATERIALIZATION_PARTNER_CREATE_FAILED");
    const roleRow=role==="supplier"
      ?(await sql<Row>`INSERT INTO master.supplier(tenant_id,business_partner_id,supplier_code,supplier_type,metadata,status,created_by) VALUES (${input.tenantId}::uuid,${text(partner,"id")}::uuid,${roleCode},${supplierType!}::master.supplier_type_d,${JSON.stringify({onboardingRequestId:request.id})}::jsonb,'onboarding',${input.appliedBy}::uuid) RETURNING *`.execute(transaction)).rows[0]
      :(await sql<Row>`INSERT INTO master.customer(tenant_id,business_partner_id,customer_code,customer_type,is_key_account,metadata,status,created_by) VALUES (${input.tenantId}::uuid,${text(partner,"id")}::uuid,${roleCode},${customerType!}::master.customer_type_d,${payloadBoolean(payload,"isKeyAccount","is_key_account")},${JSON.stringify({onboardingRequestId:request.id})}::jsonb,'prospect',${input.appliedBy}::uuid) RETURNING *`.execute(transaction)).rows[0];
    if(!roleRow)throw new Error("BUSINESS_PARTNER_MATERIALIZATION_ROLE_CREATE_FAILED");
    const assignment=(await sql<Row>`INSERT INTO master.business_partner_operating_organization_assignment(
      tenant_id,business_partner_id,operating_organization_id,partner_role,effective_from,metadata,status,status_changed_at,status_changed_by,created_by
    ) VALUES (${input.tenantId}::uuid,${text(partner,"id")}::uuid,${request.operatingOrganizationId}::uuid,${role}::master.partner_role_d,CURRENT_DATE,
      ${JSON.stringify({onboardingRequestId:request.id,roleId:text(roleRow,"id"),partnerRole:role})}::jsonb,'active',now(),${input.appliedBy}::uuid,${input.appliedBy}::uuid) RETURNING *`.execute(transaction)).rows[0];
    if(!assignment)throw new Error("BUSINESS_PARTNER_MATERIALIZATION_ASSIGNMENT_CREATE_FAILED");
    const aggregate={businessPartner:masterSnapshot(partner),partnerRole:role,roleExtension:masterSnapshot(roleRow),operatingOrganizationAssignment:masterSnapshot(assignment),onboarding:{requestId:request.id,requestNo:request.requestNo,requestKind:request.kind,workflowRequestId:request.workflowRequestId,decisionFingerprint:request.decisionFingerprint,approvedAt:request.approvedAt,approvedBy:request.approvedBy,source:request.source,schema:request.schema}};
    const snapshot=(await sql<{snapshot_id:string}>`SELECT snapshot.fn_capture_entity(
      'master.business_partner',${text(partner,"id")}::uuid,${partnerCode},1,${request.schema.hash},${input.command.expectedVersion}::bigint,
      'business_partner.request.applied','approval',${JSON.stringify(aggregate)}::jsonb,${input.correlationId??null}::uuid,NULL,NULL,NULL,'permanent',${`business_partner_request:${request.source.kind}`}
    )::text AS snapshot_id`.execute(transaction)).rows[0]?.snapshot_id;
    if(!snapshot)throw new Error("BUSINESS_PARTNER_MATERIALIZATION_SNAPSHOT_FAILED");
    const applied=(await sql<Row>`UPDATE document.business_partner_request SET status='applied',
      materialized_business_partner_id=${text(partner,"id")}::uuid,materialized_supplier_id=${role==="supplier"?text(roleRow,"id"):null}::uuid,
      materialized_customer_id=${role==="customer"?text(roleRow,"id"):null}::uuid,
      materialized_operating_organization_assignment_id=${text(assignment,"id")}::uuid,materialization_snapshot_id=${snapshot}::uuid,
      application_idempotency_key=${input.command.idempotencyKey},application_fingerprint=${input.applicationFingerprint},
      applied_at=now(),applied_by=${input.appliedBy}::uuid,updated_by=${input.appliedBy}::uuid
      WHERE tenant_id=${input.tenantId}::uuid AND id=${request.id}::uuid AND status='applying' RETURNING *`.execute(transaction)).rows[0];
    if(!applied)throw new Error("BUSINESS_PARTNER_MATERIALIZATION_FINALIZE_FAILED");
    return applicationResponse(map(applied),false);
  }
}

async function applicationResult(tenantId:string,requestId:string,idempotencyKey:string,fingerprint:string,transaction:Tx){const row=(await sql<Row>`SELECT * FROM document.business_partner_request WHERE tenant_id=${tenantId}::uuid AND id=${requestId}::uuid AND status='applied' AND application_idempotency_key=${idempotencyKey} AND application_fingerprint=${fingerprint} LIMIT 1`.execute(transaction)).rows[0];return row?applicationResponse(map(row),true):null;}
async function applyWorkforceOnboarding(input:Parameters<BusinessPartnerRequestRepository<Tx>["apply"]>[0],request:BusinessPartnerRequest,transaction:Tx){
  const payload=request.proposedPayload,isNew=request.kind==="new_partner";
  if((!isNew&&request.kind!=="add_workforce")||(isNew&&request.targetBusinessPartnerId)||(!isNew&&!request.targetBusinessPartnerId)||!request.legalEntityId||!request.companyCodeId||!request.orgUnitId||!request.approvedAt||!request.approvedBy||!request.decisionFingerprint)return null;
  const firstName=requiredPayloadText(payload,"firstName","first_name"),lastName=requiredPayloadText(payload,"lastName","last_name"),displayName=payloadText(payload,"displayName","display_name")??`${firstName} ${lastName}`;
  const employeeNumber=requiredPayloadText(payload,"employeeNumber","employee_number"),hireDate=requiredPayloadText(payload,"hireDate","hire_date");
  if(!/^\d{4}-\d{2}-\d{2}$/.test(hireDate))throw new MasterDataError(409,"BUSINESS_PARTNER_REQUEST_PAYLOAD_INVALID","hireDate must be an ISO date");
  const partnerCode=isNew?materializationCode(payloadText(payload,"partnerCode","partner_code"),`PER.${request.requestNo}`,"partnerCode"):"";
  const personCode=materializationCode(payloadText(payload,"personCode","person_code"),`PER.${employeeNumber}`,"personCode");
  const employeeCode=materializationCode(payloadText(payload,"employeeCode","employee_code"),`EMP.${employeeNumber}`,"employeeCode");
  const employmentCode=materializationCode(payloadText(payload,"employmentCode","employment_code"),`EMT.${employeeNumber}`,"employmentCode");
  const assignmentCode=materializationCode(payloadText(payload,"assignmentCode","assignment_code"),`ASN.${employeeNumber}`,"assignmentCode");
  const compatible=(await sql<{compatible:boolean}>`SELECT EXISTS(SELECT 1 FROM master.company_code company JOIN master.legal_entity legal ON legal.tenant_id=company.tenant_id AND legal.id=company.legal_entity_id JOIN master.org_unit unit ON unit.tenant_id=company.tenant_id WHERE company.tenant_id=${input.tenantId}::uuid AND company.id=${request.companyCodeId}::uuid AND company.legal_entity_id=${request.legalEntityId}::uuid AND unit.id=${request.orgUnitId}::uuid AND company.status='active' AND legal.status='active' AND unit.status='active' AND (${request.positionId??null}::uuid IS NULL OR EXISTS(SELECT 1 FROM master.position position WHERE position.tenant_id=company.tenant_id AND position.id=${request.positionId??null}::uuid AND position.company_code_id=company.id AND (position.legal_entity_id IS NULL OR position.legal_entity_id=legal.id) AND (position.org_unit_id IS NULL OR position.org_unit_id=unit.id) AND position.status='active'))) AS compatible`.execute(transaction)).rows[0]?.compatible===true;
  if(!compatible)throw new MasterDataError(409,"BUSINESS_PARTNER_REQUEST_SCOPE_INCOMPATIBLE","Workforce legal entity, company, organization unit, or position is no longer compatible");
  const validationCurrent=(await sql<{valid:boolean}>`SELECT COALESCE(${JSON.stringify(request.validationSummary)}::jsonb->>'outcome','')='passed'
    AND COALESCE((${JSON.stringify(request.duplicateSummary)}::jsonb->>'blocking')::boolean,false)=false
    AND NOT EXISTS(SELECT 1 FROM document.business_partner_request_validation finding
      WHERE finding.tenant_id=${input.tenantId}::uuid AND finding.request_id=${request.id}::uuid
        AND finding.evaluation_id=(SELECT evaluation_id FROM document.business_partner_request_validation
          WHERE tenant_id=${input.tenantId}::uuid AND request_id=${request.id}::uuid ORDER BY evaluated_at DESC,created_at DESC LIMIT 1)
        AND finding.severity='error' AND finding.outcome='failed') AS valid`.execute(transaction)).rows[0]?.valid===true;
  if(!validationCurrent)return null;
  const target=request.targetBusinessPartnerId?(await sql<Row>`SELECT * FROM master.business_partner WHERE tenant_id=${input.tenantId}::uuid AND id=${request.targetBusinessPartnerId}::uuid AND partner_category='person' AND status<>'archived' FOR UPDATE`.execute(transaction)).rows[0]:undefined;
  if(!isNew&&!target)throw new MasterDataError(409,"BUSINESS_PARTNER_REQUEST_TARGET_UNAVAILABLE","Workforce target must be an available person-category Business Partner");
  const claimed=(await sql<Row>`UPDATE document.business_partner_request SET status='applying',updated_by=${input.appliedBy}::uuid WHERE tenant_id=${input.tenantId}::uuid AND id=${request.id}::uuid AND status='approved' AND row_version=${input.command.expectedVersion} RETURNING *`.execute(transaction)).rows[0];
  if(!claimed)return null;
  let partner=isNew?(await sql<Row>`INSERT INTO master.business_partner(tenant_id,code,name,display_name,partner_category,ownership_class,description,metadata,status,created_by) VALUES(${input.tenantId}::uuid,${partnerCode},${displayName},${displayName},'person','internal',${payloadText(payload,"description")??null},${JSON.stringify({onboardingRequestId:request.id,sourceKind:request.source.kind})}::jsonb,'draft',${input.appliedBy}::uuid) RETURNING *`.execute(transaction)).rows[0]:target;
  if(!partner)throw new Error("WORKFORCE_BUSINESS_PARTNER_CREATE_FAILED");
  const existingPerson=!isNew?(await sql<Row>`SELECT * FROM master.person WHERE tenant_id=${input.tenantId}::uuid AND business_partner_id=${text(partner,"id")}::uuid FOR UPDATE`.execute(transaction)).rows[0]:undefined;
  const person=existingPerson??(await sql<Row>`INSERT INTO master.person(tenant_id,business_partner_id,code,name,person_number,first_name,middle_name,last_name,display_name,preferred_name,primary_email,primary_phone,country_code,metadata,status,created_by) VALUES(${input.tenantId}::uuid,${text(partner,"id")}::uuid,${personCode},${displayName},${payloadText(payload,"personNumber","person_number")??employeeNumber},${firstName},${payloadText(payload,"middleName","middle_name")??null},${lastName},${displayName},${payloadText(payload,"preferredName","preferred_name")??null},${payloadText(payload,"email","primaryEmail","primary_email")??null},${payloadText(payload,"phone","primaryPhone","primary_phone")??null},${payloadText(payload,"countryCode","country_code")?.toUpperCase()??null},${JSON.stringify({onboardingRequestId:request.id})}::jsonb,'active',${input.appliedBy}::uuid) RETURNING *`.execute(transaction)).rows[0];
  if(!person)throw new Error("WORKFORCE_PERSON_CREATE_FAILED");
  if(isNew){const activated=(await sql<Row>`UPDATE master.business_partner SET status='active',status_changed_at=now(),status_changed_by=${input.appliedBy}::uuid,updated_by=${input.appliedBy}::uuid WHERE tenant_id=${input.tenantId}::uuid AND id=${text(partner,"id")}::uuid AND status='draft' RETURNING *`.execute(transaction)).rows[0];if(!activated)throw new Error("WORKFORCE_BUSINESS_PARTNER_ACTIVATION_FAILED");partner=activated;}
  const employmentType=payloadEnum(payload,"employmentType","employment_type",["full_time","part_time","contract","casual","intern","volunteer"],"full_time");
  const employee=(await sql<Row>`INSERT INTO master.employee(tenant_id,code,name,person_id,employee_number,first_name,last_name,display_name,email,phone,employment_type,company_code_id,hire_date,metadata,status,created_by) VALUES(${input.tenantId}::uuid,${employeeCode},${displayName},${text(person,"id")}::uuid,${employeeNumber},${firstName},${lastName},${displayName},${payloadText(payload,"email")??null},${payloadText(payload,"phone")??null},${employmentType},${request.companyCodeId}::uuid,${hireDate}::date,${JSON.stringify({onboardingRequestId:request.id})}::jsonb,'active',${input.appliedBy}::uuid) RETURNING *`.execute(transaction)).rows[0];
  if(!employee)throw new Error("WORKFORCE_EMPLOYEE_CREATE_FAILED");
  const employment=(await sql<Row>`INSERT INTO master.employment(tenant_id,code,name,person_id,employee_id,legal_entity_id,company_code_id,employment_number,employment_type,is_primary,employment_status,hire_date,service_date,probation_end_date,metadata,status,created_by) VALUES(${input.tenantId}::uuid,${employmentCode},${displayName},${text(person,"id")}::uuid,${text(employee,"id")}::uuid,${request.legalEntityId}::uuid,${request.companyCodeId}::uuid,${employeeNumber},${employmentType},true,'active',${hireDate}::date,${payloadDate(payload,"serviceDate","service_date")??null}::date,${payloadDate(payload,"probationEndDate","probation_end_date")??null}::date,${JSON.stringify({onboardingRequestId:request.id})}::jsonb,'active',${input.appliedBy}::uuid) RETURNING *`.execute(transaction)).rows[0];
  if(!employment)throw new Error("WORKFORCE_EMPLOYMENT_CREATE_FAILED");
  const assignment=(await sql<Row>`INSERT INTO master.work_assignment(tenant_id,code,name,employee_id,employment_id,position_id,org_unit_id,company_code_id,assignment_type,fte,effective_from,metadata,status,created_by) VALUES(${input.tenantId}::uuid,${assignmentCode},${displayName},${text(employee,"id")}::uuid,${text(employment,"id")}::uuid,${request.positionId??null}::uuid,${request.orgUnitId}::uuid,${request.companyCodeId}::uuid,'primary',${payloadNumber(payload,"fte")??1},${hireDate}::date,${JSON.stringify({onboardingRequestId:request.id})}::jsonb,'active',${input.appliedBy}::uuid) RETURNING *`.execute(transaction)).rows[0];
  if(!assignment)throw new Error("WORKFORCE_ASSIGNMENT_CREATE_FAILED");
  const aggregate={businessPartner:masterSnapshot(partner),person:masterSnapshot(person),employee:masterSnapshot(employee),employment:masterSnapshot(employment),workAssignment:masterSnapshot(assignment),onboarding:{requestId:request.id,requestNo:request.requestNo,workflowRequestId:request.workflowRequestId,decisionFingerprint:request.decisionFingerprint,approvedAt:request.approvedAt,approvedBy:request.approvedBy,source:request.source,schema:request.schema}};
  const snapshot=(await sql<{snapshot_id:string}>`SELECT snapshot.fn_capture_entity('master.business_partner',${text(partner,"id")}::uuid,${text(partner,"code")},1,${request.schema.hash},${input.command.expectedVersion}::bigint,'business_partner.request.applied','approval',${JSON.stringify(aggregate)}::jsonb,${input.correlationId??null}::uuid,NULL,NULL,NULL,'permanent',${`business_partner_request:${request.source.kind}`})::text AS snapshot_id`.execute(transaction)).rows[0]?.snapshot_id;
  if(!snapshot)throw new Error("WORKFORCE_SNAPSHOT_FAILED");
  const applied=(await sql<Row>`UPDATE document.business_partner_request SET status='applied',materialized_business_partner_id=${text(partner,"id")}::uuid,materialized_person_id=${text(person,"id")}::uuid,materialized_employee_id=${text(employee,"id")}::uuid,materialized_employment_id=${text(employment,"id")}::uuid,materialized_work_assignment_id=${text(assignment,"id")}::uuid,materialization_snapshot_id=${snapshot}::uuid,application_idempotency_key=${input.command.idempotencyKey},application_fingerprint=${input.applicationFingerprint},applied_at=now(),applied_by=${input.appliedBy}::uuid,updated_by=${input.appliedBy}::uuid WHERE tenant_id=${input.tenantId}::uuid AND id=${request.id}::uuid AND status='applying' RETURNING *`.execute(transaction)).rows[0];
  if(!applied)throw new Error("WORKFORCE_MATERIALIZATION_FINALIZE_FAILED");
  return applicationResponse(map(applied),false);
}
async function applyExistingRoleScope(input:Parameters<BusinessPartnerRequestRepository<Tx>["apply"]>[0],request:BusinessPartnerRequest,transaction:Tx){
  const role=request.requestedRole,payload=request.proposedPayload,isConfiguration=request.kind==="configure_company";
  if(!request.targetBusinessPartnerId||!role||!request.operatingOrganizationId||!request.approvedAt||!request.approvedBy||!request.decisionFingerprint||(isConfiguration&&!request.companyCodeId))return null;
  await sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${input.tenantId}:business_partner_scope:${request.targetBusinessPartnerId}:${role}:${request.operatingOrganizationId}:${request.companyCodeId??"none"}`},0))`.execute(transaction);
  const scope=(await sql<Row>`SELECT partner.*,role_record.id::text AS role_id,role_record.status::text AS role_status,
      assignment.id::text AS assignment_id,assignment.status::text AS assignment_status,
      organization.status::text AS organization_status,organization.domain::text AS organization_domain,
      CASE WHEN ${request.companyCodeId??null}::uuid IS NULL THEN true ELSE EXISTS(
        SELECT 1 FROM master.operating_organization_company_assignment edge
        WHERE edge.tenant_id=partner.tenant_id AND edge.operating_organization_id=${request.operatingOrganizationId}::uuid
          AND edge.company_code_id=${request.companyCodeId??null}::uuid AND edge.status='active'
          AND edge.effective_from<=CURRENT_DATE AND (edge.effective_until IS NULL OR edge.effective_until>CURRENT_DATE)) END AS company_compatible
    FROM master.business_partner partner
    JOIN LATERAL(
      SELECT supplier.id,supplier.status::text FROM master.supplier supplier
       WHERE ${role}='supplier' AND supplier.tenant_id=partner.tenant_id AND supplier.business_partner_id=partner.id
      UNION ALL
      SELECT customer.id,customer.status::text FROM master.customer customer
       WHERE ${role}='customer' AND customer.tenant_id=partner.tenant_id AND customer.business_partner_id=partner.id LIMIT 1
    )role_record ON true
    JOIN master.operating_organization organization ON organization.tenant_id=partner.tenant_id AND organization.id=${request.operatingOrganizationId}::uuid
    LEFT JOIN master.business_partner_operating_organization_assignment assignment
      ON assignment.tenant_id=partner.tenant_id AND assignment.business_partner_id=partner.id
      AND assignment.operating_organization_id=organization.id AND assignment.partner_role=${role}::master.partner_role_d
      AND assignment.effective_from<=CURRENT_DATE AND (assignment.effective_until IS NULL OR assignment.effective_until>CURRENT_DATE)
    WHERE partner.tenant_id=${input.tenantId}::uuid AND partner.id=${request.targetBusinessPartnerId}::uuid
      AND partner.status='active' FOR UPDATE OF partner`.execute(transaction)).rows[0];
  if(!scope)throw new MasterDataError(409,"BUSINESS_PARTNER_REQUEST_TARGET_UNAVAILABLE","The target Business Partner or requested role is unavailable");
  if(text(scope,"role_status")!=="active")throw new MasterDataError(409,"BUSINESS_PARTNER_ROLE_NOT_ACTIVE","The requested role must be active before organization or company configuration");
  const compatibleDomain=text(scope,"organization_domain");
  if(text(scope,"organization_status")!=="active"||![role==="supplier"?"procurement":"sales","both"].includes(compatibleDomain)||scope["company_compatible"]!==true)
    throw new MasterDataError(409,"BUSINESS_PARTNER_REQUEST_SCOPE_INCOMPATIBLE","The organization or company assignment is not effective for the requested role");
  const validationCurrent=(await sql<{valid:boolean}>`SELECT COALESCE(${JSON.stringify(request.validationSummary)}::jsonb->>'outcome','')='passed'
    AND COALESCE((${JSON.stringify(request.duplicateSummary)}::jsonb->>'blocking')::boolean,false)=false
    AND NOT EXISTS(SELECT 1 FROM document.business_partner_request_validation finding
      WHERE finding.tenant_id=${input.tenantId}::uuid AND finding.request_id=${request.id}::uuid
        AND finding.evaluation_id=(SELECT evaluation_id FROM document.business_partner_request_validation
          WHERE tenant_id=${input.tenantId}::uuid AND request_id=${request.id}::uuid ORDER BY evaluated_at DESC,created_at DESC LIMIT 1)
        AND finding.severity='error' AND finding.outcome='failed') AS valid`.execute(transaction)).rows[0]?.valid===true;
  if(!validationCurrent)return null;
  let assignmentId=optional(scope,"assignment_id");
  if(request.kind==="assign_organization"){
    if(assignmentId&&optional(scope,"assignment_status")!=="inactive")throw new MasterDataError(409,"BUSINESS_PARTNER_ORGANIZATION_ASSIGNMENT_EXISTS","An effective organization assignment already exists for this role");
  }else{
    if(!assignmentId||optional(scope,"assignment_status")!=="active")throw new MasterDataError(409,"BUSINESS_PARTNER_ORGANIZATION_ASSIGNMENT_REQUIRED","An active role assignment is required before company configuration");
    const qualified=(await sql<{qualified:boolean}>`SELECT EXISTS(SELECT 1 FROM control.business_partner_qualification qualification
      WHERE qualification.tenant_id=${input.tenantId}::uuid AND qualification.business_partner_id=${request.targetBusinessPartnerId}::uuid
        AND qualification.partner_role=${role}::master.partner_role_d AND qualification.decision IN ('approved','conditional')
        AND (qualification.operating_organization_id IS NULL OR qualification.operating_organization_id=${request.operatingOrganizationId}::uuid)
        AND (qualification.company_code_id IS NULL OR qualification.company_code_id=${request.companyCodeId!}::uuid)
        AND (qualification.effective_from IS NULL OR qualification.effective_from<=CURRENT_DATE)
        AND (qualification.effective_until IS NULL OR qualification.effective_until>CURRENT_DATE)) AS qualified`.execute(transaction)).rows[0]?.qualified===true;
    if(!qualified)throw new MasterDataError(409,"BUSINESS_PARTNER_QUALIFICATION_REQUIRED","An effective approved qualification is required before finance activation");
  }
  const claimed=(await sql<Row>`UPDATE document.business_partner_request SET status='applying',updated_by=${input.appliedBy}::uuid
    WHERE tenant_id=${input.tenantId}::uuid AND id=${request.id}::uuid AND status='approved' AND row_version=${input.command.expectedVersion} RETURNING *`.execute(transaction)).rows[0];
  if(!claimed)return null;
  const roleId=text(scope,"role_id");
  let profile:Row|undefined;
  if(request.kind==="assign_organization"){
    const assignment=(await sql<Row>`INSERT INTO master.business_partner_operating_organization_assignment(
      tenant_id,business_partner_id,operating_organization_id,partner_role,effective_from,effective_until,metadata,status,status_changed_at,status_changed_by,created_by)
      VALUES(${input.tenantId}::uuid,${request.targetBusinessPartnerId}::uuid,${request.operatingOrganizationId}::uuid,${role}::master.partner_role_d,
        ${payloadDate(payload,"effectiveFrom","effective_from")??new Date().toISOString().slice(0,10)}::date,${payloadDate(payload,"effectiveUntil","effective_until")??null}::date,
        ${JSON.stringify({onboardingRequestId:request.id,roleId,partnerRole:role})}::jsonb,'active',now(),${input.appliedBy}::uuid,${input.appliedBy}::uuid) RETURNING *`.execute(transaction)).rows[0];
    if(!assignment)throw new Error("BUSINESS_PARTNER_ORGANIZATION_ASSIGNMENT_CREATE_FAILED");
    assignmentId=text(assignment,"id");
  }else{
    const currency=payloadCurrency(payload,"currencyCode","currency_code"),paymentTermId=payloadUuid(payload,"paymentTermId","payment_term_id"),accountingProfileId=payloadUuid(payload,"defaultAccountingProfileId","default_accounting_profile_id");
    if(!currency||!paymentTermId||!accountingProfileId)throw new MasterDataError(409,"BUSINESS_PARTNER_FINANCE_CONFIGURATION_INCOMPLETE","Currency, payment term, and accounting profile are required for finance activation");
    if(role==="supplier"){
      const bankLinkId=payloadUuid(payload,"preferredRemittanceBankLinkId","preferred_remittance_bank_link_id");
      if(!bankLinkId)throw new MasterDataError(409,"BUSINESS_PARTNER_FINANCE_CONFIGURATION_INCOMPLETE","A preferred remittance bank link is required for supplier payment readiness");
      profile=(await sql<Row>`INSERT INTO master.company_code_supplier_profile(tenant_id,supplier_id,company_code_id,currency_code,payment_term_id,default_accounting_profile_id,preferred_remittance_bank_link_id,default_dimension_set_id,metadata,status,status_changed_at,status_changed_by,created_by)
        VALUES(${input.tenantId}::uuid,${roleId}::uuid,${request.companyCodeId!}::uuid,${currency},${paymentTermId}::uuid,${accountingProfileId}::uuid,${bankLinkId}::uuid,${payloadUuid(payload,"defaultDimensionSetId","default_dimension_set_id")??null}::uuid,${JSON.stringify({onboardingRequestId:request.id})}::jsonb,'active',now(),${input.appliedBy}::uuid,${input.appliedBy}::uuid) RETURNING *`.execute(transaction)).rows[0];
    }else{
      const creditLimit=payloadNumber(payload,"creditLimit","credit_limit"),creditCurrency=creditLimit===undefined?undefined:payloadCurrency(payload,"creditLimitCurrencyCode","credit_limit_currency_code");
      if(creditLimit!==undefined&&(!creditCurrency||creditLimit<0))throw new MasterDataError(409,"BUSINESS_PARTNER_FINANCE_CONFIGURATION_INCOMPLETE","A non-negative credit limit requires its currency");
      profile=(await sql<Row>`INSERT INTO master.company_code_customer_profile(tenant_id,customer_id,company_code_id,currency_code,credit_limit,credit_limit_currency_code,payment_term_id,default_accounting_profile_id,default_dimension_set_id,statement_cycle_code,metadata,status,status_changed_at,status_changed_by,created_by)
        VALUES(${input.tenantId}::uuid,${roleId}::uuid,${request.companyCodeId!}::uuid,${currency},${creditLimit??null},${creditCurrency??null},${paymentTermId}::uuid,${accountingProfileId}::uuid,${payloadUuid(payload,"defaultDimensionSetId","default_dimension_set_id")??null}::uuid,${payloadCode(payload,"statementCycleCode","statement_cycle_code")??null},${JSON.stringify({onboardingRequestId:request.id})}::jsonb,'active',now(),${input.appliedBy}::uuid,${input.appliedBy}::uuid) RETURNING *`.execute(transaction)).rows[0];
    }
    if(!profile)throw new Error("BUSINESS_PARTNER_COMPANY_PROFILE_CREATE_FAILED");
  }
  const aggregate={businessPartner:masterSnapshot(scope),partnerRole:role,roleId,operatingOrganizationAssignmentId:assignmentId,...(profile?{companyProfile:masterSnapshot(profile)}:{}),onboarding:{requestId:request.id,requestNo:request.requestNo,requestKind:request.kind,workflowRequestId:request.workflowRequestId,decisionFingerprint:request.decisionFingerprint,approvedAt:request.approvedAt,approvedBy:request.approvedBy,source:request.source,schema:request.schema}};
  const snapshot=(await sql<{snapshot_id:string}>`SELECT snapshot.fn_capture_entity('master.business_partner',${request.targetBusinessPartnerId}::uuid,${text(scope,"code")},1,${request.schema.hash},${input.command.expectedVersion}::bigint,'business_partner.request.applied','approval',${JSON.stringify(aggregate)}::jsonb,${input.correlationId??null}::uuid,NULL,NULL,NULL,'permanent',${`business_partner_request:${request.source.kind}`})::text AS snapshot_id`.execute(transaction)).rows[0]?.snapshot_id;
  if(!snapshot)throw new Error("BUSINESS_PARTNER_MATERIALIZATION_SNAPSHOT_FAILED");
  const applied=(await sql<Row>`UPDATE document.business_partner_request SET status='applied',materialized_business_partner_id=${request.targetBusinessPartnerId}::uuid,
    materialized_supplier_id=${role==="supplier"?roleId:null}::uuid,materialized_customer_id=${role==="customer"?roleId:null}::uuid,
    materialized_operating_organization_assignment_id=${assignmentId!}::uuid,
    materialized_supplier_company_profile_id=${role==="supplier"&&profile?text(profile,"id"):null}::uuid,
    materialized_customer_company_profile_id=${role==="customer"&&profile?text(profile,"id"):null}::uuid,
    materialization_snapshot_id=${snapshot}::uuid,application_idempotency_key=${input.command.idempotencyKey},application_fingerprint=${input.applicationFingerprint},
    applied_at=now(),applied_by=${input.appliedBy}::uuid,updated_by=${input.appliedBy}::uuid
    WHERE tenant_id=${input.tenantId}::uuid AND id=${request.id}::uuid AND status='applying' RETURNING *`.execute(transaction)).rows[0];
  if(!applied)throw new Error("BUSINESS_PARTNER_MATERIALIZATION_FINALIZE_FAILED");
  return applicationResponse(map(applied),false);
}
function applicationResponse(request:BusinessPartnerRequest,replayed:boolean){if(!request.materializedBusinessPartnerId||!request.materializationSnapshotId||!request.applicationFingerprint)throw new Error("BUSINESS_PARTNER_REQUEST_APPLICATION_ROW_INVALID");if(request.materializedPersonId){if(!request.materializedEmployeeId||!request.materializedEmploymentId||!request.materializedWorkAssignmentId)throw new Error("BUSINESS_PARTNER_REQUEST_WORKFORCE_APPLICATION_ROW_INVALID");return{request,materialization:{businessPartnerId:request.materializedBusinessPartnerId,partnerRole:"workforce" as const,roleId:request.materializedEmployeeId,personId:request.materializedPersonId,employeeId:request.materializedEmployeeId,employmentId:request.materializedEmploymentId,workAssignmentId:request.materializedWorkAssignmentId,...(request.materializedPrincipalId?{principalId:request.materializedPrincipalId}:{}),snapshotId:request.materializationSnapshotId,applicationFingerprint:request.applicationFingerprint},replayed};}const partnerRole=request.materializedSupplierId?"supplier" as const:request.materializedCustomerId?"customer" as const:undefined,roleId=request.materializedSupplierId??request.materializedCustomerId,companyProfileId=request.materializedSupplierCompanyProfileId??request.materializedCustomerCompanyProfileId;if(!partnerRole||!roleId||!request.materializedOperatingOrganizationAssignmentId)throw new Error("BUSINESS_PARTNER_REQUEST_APPLICATION_ROW_INVALID");return{request,materialization:{businessPartnerId:request.materializedBusinessPartnerId,partnerRole,roleId,...(request.materializedSupplierId?{supplierId:request.materializedSupplierId}:{}),...(request.materializedCustomerId?{customerId:request.materializedCustomerId}:{}),...(companyProfileId?{companyProfileId}:{}),operatingOrganizationAssignmentId:request.materializedOperatingOrganizationAssignmentId,snapshotId:request.materializationSnapshotId,applicationFingerprint:request.applicationFingerprint},replayed};}
function payloadText(payload:Readonly<Record<string,unknown>>,...keys:string[]):string|undefined{for(const key of keys){const value=payload[key];if(typeof value==="string"&&value.trim())return value.trim();}return undefined;}
function requiredPayloadText(payload:Readonly<Record<string,unknown>>,...keys:string[]):string{const value=payloadText(payload,...keys);if(!value)throw new MasterDataError(409,"BUSINESS_PARTNER_REQUEST_PAYLOAD_INVALID",`${keys[0]} is required for workforce materialization`);return value;}
function payloadEnum(payload:Readonly<Record<string,unknown>>,camel:string,snake:string,allowed:readonly string[],fallback:string):string{const value=payloadText(payload,camel,snake)??fallback;if(!allowed.includes(value))throw new MasterDataError(409,"BUSINESS_PARTNER_REQUEST_PAYLOAD_INVALID",`${camel} is not supported by Phase 1B materialization`);return value;}
function payloadOptionalEnum(payload:Readonly<Record<string,unknown>>,camel:string,snake:string,allowed:readonly string[]):string|undefined{const value=payloadText(payload,camel,snake);if(value!==undefined&&!allowed.includes(value))throw new MasterDataError(409,"BUSINESS_PARTNER_REQUEST_PAYLOAD_INVALID",`${camel} is not supported by Phase 1B materialization`);return value;}
function materializationCode(value:string|undefined,fallback:string,field:string):string{const code=(value??fallback).toUpperCase();if(!/^[A-Z][A-Z0-9_.-]{1,62}$/.test(code))throw new MasterDataError(409,"BUSINESS_PARTNER_REQUEST_PAYLOAD_INVALID",`${field} must be an uppercase master-data code`);return code;}
function payloadAliases(payload:Readonly<Record<string,unknown>>):readonly string[]{const value=payload["aliases"];if(value===undefined)return[];if(!Array.isArray(value)||value.length>50||value.some(item=>typeof item!=="string"||!item.trim()))throw new MasterDataError(409,"BUSINESS_PARTNER_REQUEST_PAYLOAD_INVALID","aliases must contain at most 50 non-empty strings");return value.map(item=>(item as string).trim());}
function payloadBoolean(payload:Readonly<Record<string,unknown>>,...keys:string[]):boolean{for(const key of keys){const value=payload[key];if(value!==undefined){if(typeof value!=="boolean")throw new MasterDataError(409,"BUSINESS_PARTNER_REQUEST_PAYLOAD_INVALID",`${key} must be boolean`);return value;}}return false;}
function payloadUuid(payload:Readonly<Record<string,unknown>>,...keys:string[]):string|undefined{const value=payloadText(payload,...keys);if(value&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))throw new MasterDataError(409,"BUSINESS_PARTNER_REQUEST_PAYLOAD_INVALID",`${keys[0]} must be a UUID`);return value;}
function payloadDate(payload:Readonly<Record<string,unknown>>,...keys:string[]):string|undefined{const value=payloadText(payload,...keys);if(value&&!/^\d{4}-\d{2}-\d{2}$/.test(value))throw new MasterDataError(409,"BUSINESS_PARTNER_REQUEST_PAYLOAD_INVALID",`${keys[0]} must be an ISO date`);return value;}
function payloadCurrency(payload:Readonly<Record<string,unknown>>,...keys:string[]):string|undefined{const value=payloadText(payload,...keys)?.toUpperCase();if(value&&!/^[A-Z]{3}$/.test(value))throw new MasterDataError(409,"BUSINESS_PARTNER_REQUEST_PAYLOAD_INVALID",`${keys[0]} must be an ISO currency code`);return value;}
function payloadNumber(payload:Readonly<Record<string,unknown>>,...keys:string[]):number|undefined{for(const key of keys){const value=payload[key];if(value!==undefined){if(typeof value!=="number"||!Number.isFinite(value))throw new MasterDataError(409,"BUSINESS_PARTNER_REQUEST_PAYLOAD_INVALID",`${key} must be a finite number`);return value;}}return undefined;}
function payloadCode(payload:Readonly<Record<string,unknown>>,...keys:string[]):string|undefined{const value=payloadText(payload,...keys);if(value&&!/^[a-z][a-z0-9_.-]{1,62}$/.test(value))throw new MasterDataError(409,"BUSINESS_PARTNER_REQUEST_PAYLOAD_INVALID",`${keys[0]} must be a lowercase reference code`);return value;}
function masterSnapshot(row:Row):Readonly<Record<string,unknown>>{return Object.fromEntries(Object.entries(row).filter(([key])=>!key.startsWith("updated_")));}

async function submissionResult(tenantId:string,requestId:string,idempotencyKey:string,transaction:Tx){const row=(await sql<Row>`SELECT b.*,wr.definition_code AS wf_code,wr.definition_version AS wf_version,wr.compiled_artifact_hash AS wf_hash,ws.id AS stage_id,wi.id AS work_item_id
  FROM document.business_partner_request b JOIN document.workflow_request wr ON wr.tenant_id=b.tenant_id AND wr.id=b.workflow_request_id
  JOIN LATERAL (SELECT stage.id FROM document.workflow_stage stage WHERE stage.tenant_id=wr.tenant_id AND stage.workflow_request_id=wr.id ORDER BY stage.stage_no DESC LIMIT 1) ws ON true
  JOIN LATERAL (SELECT item.id FROM document.work_item item WHERE item.tenant_id=b.tenant_id AND item.source_entity_code='business_partner_request' AND item.source_entity_id=b.id AND item.payload->>'submissionFingerprint'=b.decision_fingerprint ORDER BY item.created_at DESC,item.id DESC LIMIT 1) wi ON true
  WHERE b.tenant_id=${tenantId}::uuid AND b.id=${requestId}::uuid AND wr.metadata->>'submissionIdempotencyKey'=${idempotencyKey} LIMIT 1`.execute(transaction)).rows[0];if(!row)return null;return{request:map(row),workflow:{requestId:text(row,"workflow_request_id"),stageId:text(row,"stage_id"),workItemId:text(row,"work_item_id"),definition:{code:text(row,"wf_code"),version:Number(row["wf_version"]),hash:text(row,"wf_hash")},decisionFingerprint:text(row,"decision_fingerprint")}};}
async function decisionReplay(input:Parameters<BusinessPartnerRequestRepository<Tx>["decide"]>[0],transaction:Tx){const row=(await sql<Row>`SELECT b.*,wr.definition_code AS wf_code,wr.definition_version AS wf_version,wr.compiled_artifact_hash AS wf_hash,ws.id AS stage_id,wi.id AS work_item_id,wi.outcome
  FROM document.business_partner_request b JOIN document.workflow_request wr ON wr.tenant_id=b.tenant_id AND wr.id=b.workflow_request_id
  JOIN document.work_item wi ON wi.tenant_id=b.tenant_id AND wi.id=${input.command.workItemId}::uuid
  JOIN document.workflow_stage ws ON ws.tenant_id=wr.tenant_id AND ws.id=(wi.payload->>'workflowStageId')::uuid
  WHERE b.tenant_id=${input.tenantId}::uuid AND b.id=${input.command.requestId}::uuid AND wr.id=${input.command.workflowRequestId}::uuid
    AND wi.outcome->>'idempotencyKey'=${input.command.idempotencyKey} AND wi.outcome->>'decisionFingerprint'=${input.decisionFingerprint} LIMIT 1`.execute(transaction)).rows[0];return row?decisionResponse(input,map(row),row,true):null;}
function decisionResponse(input:Parameters<BusinessPartnerRequestRepository<Tx>["decide"]>[0],request:BusinessPartnerRequest,row:Row,replayed:boolean){return{request,workflow:{requestId:input.command.workflowRequestId,stageId:text(row,"stage_id"),workItemId:input.command.workItemId,definition:{code:String(row["wf_code"]??row["definition_code"]),version:Number(row["wf_version"]??row["definition_version"]),hash:String(row["wf_hash"]??row["compiled_artifact_hash"])},decisionFingerprint:request.decisionFingerprint!},decision:input.command.decision,decisionFingerprint:input.decisionFingerprint,replayed};}
function reviewSnapshot(request:BusinessPartnerRequest){return{requestId:request.id,requestNo:request.requestNo,kind:request.kind,source:request.source,registrationMode:request.registrationMode,invitationId:request.invitationId,applicantPrincipalId:request.applicantPrincipalId,representedPartyName:request.representedPartyName,representationEvidenceId:request.representationEvidenceId,targetBusinessPartnerId:request.targetBusinessPartnerId,requestedRole:request.requestedRole,operatingOrganizationId:request.operatingOrganizationId,companyCodeId:request.companyCodeId,legalEntityId:request.legalEntityId,orgUnitId:request.orgUnitId,positionId:request.positionId,schema:request.schema,proposedPayload:request.proposedPayload,validationSummary:request.validationSummary,duplicateSummary:request.duplicateSummary,changeImpact:request.changeImpact,rowVersion:request.rowVersion};}

function map(row: Row): BusinessPartnerRequest {
  return {
    id: text(row, "id"), tenantId: text(row, "tenant_id"), requestNo: text(row, "request_no"),
    kind: text(row, "request_kind") as BusinessPartnerRequest["kind"],
    source: {
      kind: text(row, "source_kind") as BusinessPartnerRequest["source"]["kind"],
      ...(optional(row, "source_system_code") ? { systemCode: optional(row, "source_system_code") } : {}),
      ...(optional(row, "source_entity_code") ? { entityCode: optional(row, "source_entity_code") } : {}),
      ...(optional(row, "source_entity_id") ? { entityId: optional(row, "source_entity_id") } : {}),
      ...(optional(row, "source_entity_code_value") ? { entityCodeValue: optional(row, "source_entity_code_value") } : {}),
      ...(optional(row, "source_projection_id") ? { projectionId: optional(row, "source_projection_id") } : {}),
      ...(row["source_version"] != null ? { version: Number(row["source_version"]) } : {}),
      ...(optional(row, "source_payload_hash") ? { payloadHash: optional(row, "source_payload_hash") } : {}),
    },
    registrationMode: text(row, "registration_mode") as BusinessPartnerRequest["registrationMode"],
    ...(optional(row, "invitation_id") ? { invitationId: optional(row, "invitation_id") } : {}),
    ...(optional(row, "applicant_principal_id") ? { applicantPrincipalId: optional(row, "applicant_principal_id") } : {}),
    ...(optional(row, "represented_party_name") ? { representedPartyName: optional(row, "represented_party_name") } : {}),
    ...(optional(row, "representation_evidence_id") ? { representationEvidenceId: optional(row, "representation_evidence_id") } : {}),
    ...(optional(row, "target_business_partner_id") ? { targetBusinessPartnerId: optional(row, "target_business_partner_id") } : {}),
    ...(optional(row, "requested_role") ? { requestedRole: optional(row, "requested_role") as BusinessPartnerRequest["requestedRole"] } : {}),
    ...(optional(row, "operating_organization_id") ? { operatingOrganizationId: optional(row, "operating_organization_id") } : {}),
    ...(optional(row, "company_code_id") ? { companyCodeId: optional(row, "company_code_id") } : {}),
    ...(optional(row, "legal_entity_id") ? { legalEntityId: optional(row, "legal_entity_id") } : {}),
    ...(optional(row, "org_unit_id") ? { orgUnitId: optional(row, "org_unit_id") } : {}),
    ...(optional(row, "position_id") ? { positionId: optional(row, "position_id") } : {}),
    schema: { code: text(row, "payload_schema_code"), version: Number(row["payload_schema_version"]), hash: text(row, "payload_schema_hash") },
    proposedPayload: object(row["proposed_payload"]), validationSummary: object(row["validation_summary"]), duplicateSummary: object(row["duplicate_summary"]), changeImpact: object(row["change_impact"]),
    ...(optional(row, "workflow_request_id") ? { workflowRequestId: optional(row, "workflow_request_id") } : {}),
    ...(optional(row, "materialized_business_partner_id") ? { materializedBusinessPartnerId: optional(row, "materialized_business_partner_id") } : {}),
    ...(optional(row, "materialized_supplier_id") ? { materializedSupplierId: optional(row, "materialized_supplier_id") } : {}),
    ...(optional(row, "materialized_customer_id") ? { materializedCustomerId: optional(row, "materialized_customer_id") } : {}),
    ...(optional(row, "materialized_person_id") ? { materializedPersonId: optional(row, "materialized_person_id") } : {}),
    ...(optional(row, "materialized_employee_id") ? { materializedEmployeeId: optional(row, "materialized_employee_id") } : {}),
    ...(optional(row, "materialized_employment_id") ? { materializedEmploymentId: optional(row, "materialized_employment_id") } : {}),
    ...(optional(row, "materialized_work_assignment_id") ? { materializedWorkAssignmentId: optional(row, "materialized_work_assignment_id") } : {}),
    ...(optional(row, "materialized_principal_id") ? { materializedPrincipalId: optional(row, "materialized_principal_id") } : {}),
    ...(optional(row, "materialized_supplier_company_profile_id") ? { materializedSupplierCompanyProfileId: optional(row, "materialized_supplier_company_profile_id") } : {}),
    ...(optional(row, "materialized_customer_company_profile_id") ? { materializedCustomerCompanyProfileId: optional(row, "materialized_customer_company_profile_id") } : {}),
    ...(optional(row, "materialized_operating_organization_assignment_id") ? { materializedOperatingOrganizationAssignmentId: optional(row, "materialized_operating_organization_assignment_id") } : {}),
    ...(optional(row, "materialization_snapshot_id") ? { materializationSnapshotId: optional(row, "materialization_snapshot_id") } : {}),
    ...(optional(row, "application_idempotency_key") ? { applicationIdempotencyKey: optional(row, "application_idempotency_key") } : {}),
    ...(optional(row, "application_fingerprint") ? { applicationFingerprint: optional(row, "application_fingerprint") } : {}),
    ...(optional(row, "decision_fingerprint") ? { decisionFingerprint: optional(row, "decision_fingerprint") } : {}),
    ...(row["submitted_at"] ? { submittedAt:date(row["submitted_at"]) } : {}), ...(optional(row,"submitted_by") ? {submittedBy:optional(row,"submitted_by")} : {}),
    ...(row["approved_at"] ? { approvedAt:date(row["approved_at"]) } : {}), ...(optional(row,"approved_by") ? {approvedBy:optional(row,"approved_by")} : {}),
    ...(row["applied_at"] ? { appliedAt:date(row["applied_at"]) } : {}), ...(optional(row,"applied_by") ? {appliedBy:optional(row,"applied_by")} : {}),
    idempotencyKey: text(row, "idempotency_key"), status: text(row, "status") as BusinessPartnerRequest["status"], rowVersion: Number(row["row_version"]),
    createdAt: date(row["created_at"]), createdBy: text(row, "created_by"),
    ...(row["updated_at"] ? { updatedAt: date(row["updated_at"]) } : {}), ...(optional(row, "updated_by") ? { updatedBy: optional(row, "updated_by") } : {}),
  };
}

function defaultRegistrationMode(sourceKind: BusinessPartnerRequest["source"]["kind"]): BusinessPartnerRequest["registrationMode"] {
  return sourceKind === "manual" ? "direct" : sourceKind === "portal" ? "self_service" : "integration";
}
function text(row: Row, key: string): string { const value = row[key]; if (value == null) throw new Error(`BUSINESS_PARTNER_REQUEST_ROW_INVALID:${key}`); return String(value); }
function optional(row: Row, key: string): string | undefined { const value = row[key]; return value == null ? undefined : String(value); }
function object(value: unknown): Readonly<Record<string, unknown>> { if (typeof value === "string") return JSON.parse(value) as Record<string, unknown>; return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function date(value: unknown): string { const parsed = value instanceof Date ? value : new Date(String(value)); if (Number.isNaN(parsed.valueOf())) throw new Error("BUSINESS_PARTNER_REQUEST_ROW_INVALID:date"); return parsed.toISOString(); }
function dateOnly(value:unknown):string{const parsed=value instanceof Date?value:new Date(String(value));if(Number.isNaN(parsed.valueOf()))throw new Error("BUSINESS_PARTNER_REQUEST_ROW_INVALID:date");return parsed.toISOString().slice(0,10);}
function stringArray(value:unknown):readonly string[]{if(Array.isArray(value))return value.filter((item):item is string=>typeof item==="string");if(typeof value==="string"&&value.startsWith("{"))return value.slice(1,-1).split(",").filter(Boolean);return[];}
