#!/usr/bin/env tsx

import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { Kysely, PostgresDialect, sql, type Transaction } from "kysely";
import { Pool } from "pg";
import { KyselyBusinessPartnerRequestRepository } from "@athyper/server-service-master-data";

const CONFIRMATION = "RUN-BS360-MATERIALIZATION-EVIDENCE";
const REQUEST_NO = "BS360-P0-MATERIALIZATION-001";
const LEGACY_REQUEST_NO = "BS360-P0-LEGACY-001";
const ZERO_COUNTS = Object.freeze({
  addresses: 0,
  contactPersons: 0,
  contactChannels: 0,
  identifiers: 0,
  taxRegistrations: 0,
  classifications: 0,
  certifications: 0,
});
type Database = Record<string, never>;
type Tx = Transaction<Database>;

export interface BusinessPartner360MaterializationEvidence {
  readonly capturedAt: string;
  readonly database: "athyper_neon";
  readonly repository: "KyselyBusinessPartnerRequestRepository";
  readonly rolledBack: true;
  readonly typedJourney: Readonly<{
    requestStatus: "applied";
    replayed: false;
    exactReplay: true;
    stableCoordinates: true;
    fingerprintConflictRejected: true;
    requestedCounts: Readonly<Record<string, number>>;
    materializedCounts: Readonly<Record<string, number>>;
    evidenceItems: number;
    targetTables: readonly string[];
    snapshotRows: number;
  }>;
  readonly legacyPolicy: Readonly<{
    mode: "legacy_untyped";
    requestStatus: "applied";
    materializedCounts: Readonly<Record<string, number>>;
    evidenceItems: 0;
    legacyJsonInterpreted: false;
  }>;
  readonly cleanup: Readonly<{
    typedRequestRows: 0;
    legacyRequestRows: 0;
    typedPartnerRows: 0;
    legacyPartnerRows: 0;
  }>;
  readonly restrictedSentinelSha256: string;
}

export async function runBusinessPartner360MaterializationEvidence(options: {
  readonly neonDatabaseUrl: string;
  readonly confirmation?: string;
}): Promise<BusinessPartner360MaterializationEvidence> {
  assertLocal(options.neonDatabaseUrl);
  if (options.confirmation !== CONFIRMATION)
    throw new Error(`execution requires --confirm=${CONFIRMATION}`);

  const pool = new Pool({
    connectionString: options.neonDatabaseUrl,
    application_name: "bs360-materialization-evidence",
    max: 1,
  });
  const database = new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
  const repository = new KyselyBusinessPartnerRequestRepository();
  let retained: Omit<BusinessPartner360MaterializationEvidence, "capturedAt" | "database" | "repository" | "rolledBack" | "cleanup"> | undefined;

  try {
    try {
      await database.transaction().execute(async (transaction) => {
        const coordinates = await loadCoordinates(transaction);
        await setContext(transaction, coordinates.tenantId, coordinates.actorId);
        const prerequisites = await createPrerequisites(transaction, coordinates);
        const restrictedSentinel = "BS360-P0-OPAQUE-PROTECTED-991";
        const extensions = {
          addresses: [{
            clientItemKey: "registered-address",
            definitionFieldCode: "address.registered.primary",
            purpose: "default",
            addressKind: "street" as const,
            line1: "P0 evidence address",
            city: "Kuala Lumpur",
            postalCode: "50000",
            countryCode: "MY",
            isPrimary: true,
            normalizedHash: hash("p0-evidence-address"),
            sourceReference: "p0/materialization/address",
          }],
          contactPersons: [{
            clientItemKey: "primary-contact",
            definitionFieldCode: "contact.primary",
            contactName: "P0 Evidence Contact",
            businessTitle: "Evidence Contact",
            departmentName: "Assurance",
            roleCode: "primary",
            isPrimary: true,
            sourceReference: "p0/materialization/contact",
          }],
          contactChannels: [{
            clientItemKey: "primary-contact-email",
            definitionFieldCode: "contact.primary.email",
            contactClientItemKey: "primary-contact",
            channelType: "email" as const,
            value: "bp360-p0@example.invalid",
            purpose: "business",
            isPrimary: true,
            sourceReference: "p0/materialization/channel",
          }],
          identifiers: [{
            clientItemKey: "external-identifier",
            definitionFieldCode: "identity.identifier.external",
            schemeCode: "duns",
            protectedValueToken: `protected:p0:${hash(restrictedSentinel).slice(0, 24)}`,
            valueHash: hash(restrictedSentinel),
            maskedValue: "*********991",
            issuingAuthority: "P0 evidence authority",
            issuingCountryCode: "MY",
            isPrimary: true,
            sourceReference: "p0/materialization/identifier",
          }],
          taxRegistrations: [{
            clientItemKey: "primary-tax",
            definitionFieldCode: "tax.registration.primary",
            jurisdictionId: prerequisites.taxJurisdictionId,
            registrationTypeCode: "vat",
            protectedValueToken: `protected:p0:${hash(`${restrictedSentinel}:tax`).slice(0, 24)}`,
            valueHash: hash(`${restrictedSentinel}:tax`),
            maskedValue: "VAT-******991",
            isPrimary: true,
            sourceReference: "p0/materialization/tax",
          }],
          classifications: [{
            clientItemKey: "primary-commodity",
            definitionFieldCode: "classification.commodity.primary",
            classificationKind: "commodity" as const,
            referenceId: prerequisites.commodityCategoryId,
            partnerRole: "supplier" as const,
            assignmentKind: "verified" as const,
            isPrimary: true,
            confidence: 1,
            sourceReference: "p0/materialization/classification",
          }],
          certifications: [{
            clientItemKey: "quality-certificate",
            definitionFieldCode: "certification.quality.primary",
            certificationTypeId: prerequisites.certificationTypeId,
            certificateNumberToken: `protected:p0:${hash(`${restrictedSentinel}:certificate`).slice(0, 24)}`,
            maskedCertificateNumber: "CERT-******991",
            certifiedBy: "P0 evidence authority",
            certifiedLocation: "MY",
            sourceReference: "p0/materialization/certification",
          }],
        };
        const requestedCounts = Object.freeze({
          addresses: 1,
          contactPersons: 1,
          contactChannels: 1,
          identifiers: 1,
          taxRegistrations: 1,
          classifications: 1,
          certifications: 1,
        });
        const created = await repository.create({
          tenantId: coordinates.tenantId,
          requestNo: REQUEST_NO,
          command: {
            idempotencyKey: "bs360-p0-materialization-create-001",
            kind: "new_partner",
            source: { kind: "manual" },
            registrationMode: "direct",
            requestedRole: "supplier",
            operatingOrganizationId: coordinates.organizationId,
            proposedPayload: {
              legalName: "BS360 P0 Materialization Evidence Organization",
              name: "BS360 P0 Materialization Evidence",
              partnerCode: "BP.BS360.P0.EVIDENCE",
              supplierCode: "SUP.BS360.P0.EVIDENCE",
              partnerCategory: "organization",
              registrationCountryCode: "MY",
            },
            extensions,
          },
          schema: {
            code: "neon.business_partner_request",
            version: 1,
            hash: hash("bs360-p0-materialization-schema-v1"),
          },
          createdBy: coordinates.actorId,
        }, transaction);
        assert(equalCounts(created.extensionSummary.counts, requestedCounts), "production repository did not persist all typed request children");
        const approvedVersion = await approveThroughRepository(repository, transaction, coordinates, created, "typed");
        const applicationFingerprint = hash(`${created.extensionSummary.fingerprint}:approved:${approvedVersion}`);
        const applied = await repository.apply({
          tenantId: coordinates.tenantId,
          command: {
            requestId: created.id,
            expectedVersion: approvedVersion,
            idempotencyKey: "bs360-p0-materialization-apply-001",
          },
          appliedBy: coordinates.actorId,
          applicationFingerprint,
        }, transaction);
        assert(applied && !applied.replayed, "production repository did not apply the typed request");
        assert(equalCounts(applied.materialization.extensionMaterializationCounts, requestedCounts), "typed materialization counts differ from the approved request");
        const observation = await observeApplication(transaction, coordinates.tenantId, created.id, applied.materialization.businessPartnerId);
        assert(observation.evidenceItems === 7, "every typed child must have immutable application evidence");
        assert(observation.snapshotRows === 1, "typed application must capture one immutable snapshot");
        const replay = await repository.apply({
          tenantId: coordinates.tenantId,
          command: {
            requestId: created.id,
            expectedVersion: approvedVersion,
            idempotencyKey: "bs360-p0-materialization-apply-001",
          },
          appliedBy: coordinates.actorId,
          applicationFingerprint,
        }, transaction);
        assert(replay?.replayed === true, "exact application replay was not returned");
        const stableCoordinates = replay.materialization.businessPartnerId === applied.materialization.businessPartnerId
          && replay.materialization.snapshotId === applied.materialization.snapshotId;
        assert(stableCoordinates, "exact replay changed materialization coordinates");
        const conflict = await repository.apply({
          tenantId: coordinates.tenantId,
          command: {
            requestId: created.id,
            expectedVersion: approvedVersion,
            idempotencyKey: "bs360-p0-materialization-apply-001",
          },
          appliedBy: coordinates.actorId,
          applicationFingerprint: hash(`${applicationFingerprint}:conflict`),
        }, transaction);
        assert(conflict === null, "fingerprint conflict did not fail closed");

        const legacy = await createLegacyRequest(repository, transaction, coordinates);
        const legacyApplied = await repository.apply({
          tenantId: coordinates.tenantId,
          command: {
            requestId: legacy.requestId,
            expectedVersion: legacy.rowVersion,
            idempotencyKey: "bs360-p0-legacy-apply-001",
          },
          appliedBy: coordinates.actorId,
          applicationFingerprint: hash("bs360-p0-legacy-application-v1"),
        }, transaction);
        assert(legacyApplied && !legacyApplied.replayed, "legacy policy probe did not apply through the production repository");
        assert(equalCounts(legacyApplied.materialization.extensionMaterializationCounts, ZERO_COUNTS), "legacy JSON was reinterpreted as typed children");
        const legacyEvidence = await countMaterializationItems(transaction, coordinates.tenantId, legacy.requestId);
        assert(legacyEvidence === 0, "legacy JSON created typed materialization evidence");

        retained = {
          typedJourney: {
            requestStatus: "applied",
            replayed: false,
            exactReplay: true,
            stableCoordinates,
            fingerprintConflictRejected: true,
            requestedCounts,
            materializedCounts: applied.materialization.extensionMaterializationCounts,
            evidenceItems: observation.evidenceItems,
            targetTables: observation.targetTables,
            snapshotRows: observation.snapshotRows,
          },
          legacyPolicy: {
            mode: "legacy_untyped",
            requestStatus: "applied",
            materializedCounts: legacyApplied.materialization.extensionMaterializationCounts,
            evidenceItems: 0,
            legacyJsonInterpreted: false,
          },
          restrictedSentinelSha256: hash(restrictedSentinel),
        };
        throw new RollbackEvidence();
      });
      throw new Error("materialization evidence transaction unexpectedly committed");
    } catch (error) {
      if (!(error instanceof RollbackEvidence)) throw error;
    }
    assert(retained, "materialization evidence was not captured before rollback");
    const cleanup = await observeCleanup(database);
    assert(Object.values(cleanup).every((count) => count === 0), "materialization evidence rollback left persistent rows");
    return {
      capturedAt: new Date().toISOString(),
      database: "athyper_neon",
      repository: "KyselyBusinessPartnerRequestRepository",
      rolledBack: true,
      ...retained,
      cleanup,
    };
  } finally {
    await database.destroy();
  }
}

async function loadCoordinates(transaction: Tx) {
  const row = (await sql<{ tenant_id: string; actor_id: string; approver_id: string; organization_id: string; certification_type_id: string }>`
    SELECT tenant.id::text AS tenant_id, principal.id::text AS actor_id, approver.id::text AS approver_id,
      organization.id::text AS organization_id, certification_type.id::text AS certification_type_id
    FROM master.tenant tenant
    JOIN LATERAL (
      SELECT id FROM master.principal WHERE tenant_id=tenant.id AND status='active' ORDER BY code LIMIT 1
    ) principal ON true
    JOIN LATERAL (
      SELECT candidate.id FROM master.principal candidate
      WHERE candidate.tenant_id=tenant.id AND candidate.status='active' AND candidate.id<>principal.id
      ORDER BY candidate.code LIMIT 1
    ) approver ON true
    JOIN LATERAL (
      SELECT id FROM master.operating_organization
      WHERE tenant_id=tenant.id AND status='active' AND domain IN ('procurement','both')
      ORDER BY code LIMIT 1
    ) organization ON true
    JOIN LATERAL (
      SELECT certification.id FROM master.certification_type certification
      WHERE certification.status='active' AND (certification.tenant_id IS NULL OR certification.tenant_id=tenant.id)
      ORDER BY certification.tenant_id NULLS LAST,certification.code LIMIT 1
    ) certification_type ON true
    WHERE tenant.code='athyper'
  `.execute(transaction)).rows[0];
  if (!row) throw new Error("the Athyper acceptance tenant lacks materialization prerequisites");
  return {
    tenantId: row.tenant_id,
    actorId: row.actor_id,
    approverId: row.approver_id,
    organizationId: row.organization_id,
    certificationTypeId: row.certification_type_id,
  };
}

async function setContext(transaction: Tx, tenantId: string, actorId: string) {
  await sql`SELECT set_config('app.database_plane','neon',true),
    set_config('app.current_tenant_id',${tenantId},true),
    set_config('app.current_principal_id',${actorId},true)`.execute(transaction);
}

async function createPrerequisites(transaction: Tx, coordinates: Awaited<ReturnType<typeof loadCoordinates>>) {
  const tax = (await sql<{ id: string }>`INSERT INTO master.tax_jurisdiction(
    tenant_id,code,name,jurisdiction_type,country_code,authority_name,status,created_by
  ) VALUES (${coordinates.tenantId}::uuid,'bs360-p0-my','BS360 P0 Malaysia','country','MY','P0 evidence authority','active',${coordinates.actorId}::uuid)
  RETURNING id::text`.execute(transaction)).rows[0];
  const commodity = (await sql<{ id: string }>`INSERT INTO master.commodity_category(
    tenant_id,code,name,status,created_by
  ) VALUES (${coordinates.tenantId}::uuid,'bs360-p0-services','BS360 P0 Services','active',${coordinates.actorId}::uuid)
  RETURNING id::text`.execute(transaction)).rows[0];
  if (!tax || !commodity) throw new Error("materialization prerequisites were not created");
  return {
    taxJurisdictionId: tax.id,
    commodityCategoryId: commodity.id,
    certificationTypeId: coordinates.certificationTypeId,
  };
}

async function approveThroughRepository(
  repository: KyselyBusinessPartnerRequestRepository,
  transaction: Tx,
  coordinates: Awaited<ReturnType<typeof loadCoordinates>>,
  request: Awaited<ReturnType<KyselyBusinessPartnerRequestRepository["create"]>>,
  suffix: string,
) {
  const validated = await repository.recordValidation({
    tenantId: coordinates.tenantId,
    requestId: request.id,
    expectedVersion: request.rowVersion,
    evaluatedBy: coordinates.actorId,
    result: {
      evaluationId: suffix === "typed" ? "94000000-0000-4000-8000-000000000001" : "94000000-0000-4000-8000-000000000002",
      evaluatedAt: new Date().toISOString(),
      ruleset: { code: "neon.business_partner_request.phase1", version: 1, hash: hash(`bs360-p0-${suffix}-ruleset`) },
      valid: true,
      findings: [{
        ruleCode: "p0.materialization.evidence",
        severity: "info",
        fieldPath: "request",
        outcome: "passed",
        messageCode: "P0_MATERIALIZATION_EVIDENCE_PASSED",
        evidenceReference: { evidence: "p0-production-repository-journey" },
      }],
      validationSummary: { outcome: "passed" },
      duplicateSummary: { blocking: false },
      changeImpact: { outcome: "reviewed" },
    },
  }, transaction);
  assert(validated, `${suffix} request validation failed`);
  const submitted = await repository.submit({
    tenantId: coordinates.tenantId,
    requestId: request.id,
    expectedVersion: validated.rowVersion,
    submittedBy: coordinates.actorId,
    idempotencyKey: `bs360-p0-${suffix}-submit-001`,
    definition: {
      code: "neon.business_partner.onboarding",
      version: 1,
      hash: hash(`bs360-p0-${suffix}-workflow`),
      stageCode: "business_review",
      stageName: "Business Partner Review",
      approverPrincipalIds: [coordinates.approverId],
    },
    decisionFingerprint: hash(`bs360-p0-${suffix}-submission`),
  }, transaction);
  assert(submitted, `${suffix} request submission failed`);
  const decided = await repository.decide({
    tenantId: coordinates.tenantId,
    command: {
      requestId: request.id,
      workflowRequestId: submitted.workflow.requestId,
      workItemId: submitted.workflow.workItemId,
      expectedRequestVersion: submitted.request.rowVersion,
      expectedWorkItemVersion: 1,
      decision: "approve",
      reason: "P0 production-repository materialization evidence",
      idempotencyKey: `bs360-p0-${suffix}-decision-001`,
    },
    decidedBy: coordinates.approverId,
    decisionFingerprint: hash(`bs360-p0-${suffix}-approval`),
  }, transaction);
  assert(decided, `${suffix} request approval failed`);
  return decided.request.rowVersion;
}

async function createLegacyRequest(repository: KyselyBusinessPartnerRequestRepository, transaction: Tx, coordinates: Awaited<ReturnType<typeof loadCoordinates>>) {
  const inserted = (await sql<{ id: string }>`INSERT INTO document.business_partner_request(
    tenant_id,request_no,request_kind,source_kind,registration_mode,requested_role,operating_organization_id,
    payload_schema_code,payload_schema_version,payload_schema_hash,proposed_payload,extension_mode,extension_counts,
    idempotency_key,created_by
  ) VALUES (
    ${coordinates.tenantId}::uuid,${LEGACY_REQUEST_NO},'new_partner','manual','direct','supplier',${coordinates.organizationId}::uuid,
    'neon.business_partner_request',1,${hash("bs360-p0-legacy-schema-v1")},
    ${JSON.stringify({
      legalName: "BS360 P0 Legacy Policy Organization",
      name: "BS360 P0 Legacy Policy",
      partnerCode: "BP.BS360.P0.LEGACY",
      supplierCode: "SUP.BS360.P0.LEGACY",
      legacyExtensionBlob: { addressLine: "must-not-be-materialized" },
    })}::jsonb,'legacy_untyped',${JSON.stringify(ZERO_COUNTS)}::jsonb,
    'bs360-p0-legacy-create-001',${coordinates.actorId}::uuid
  ) RETURNING id::text`.execute(transaction)).rows[0];
  if (!inserted) throw new Error("legacy policy request was not staged");
  const staged = await repository.get(coordinates.tenantId, inserted.id, transaction);
  assert(staged && staged.extensionSummary.mode === "legacy_untyped", "legacy request mode was not retained");
  const rowVersion = await approveThroughRepository(repository, transaction, coordinates, staged, "legacy");
  return { requestId: staged.id, rowVersion };
}

async function observeApplication(transaction: Tx, tenantId: string, requestId: string, partnerId: string) {
  const rows = (await sql<{ target_table: string }>`SELECT target_table
    FROM document.business_partner_request_materialization_item
    WHERE tenant_id=${tenantId}::uuid AND request_id=${requestId}::uuid
    ORDER BY child_kind,target_table`.execute(transaction)).rows;
  const snapshotRows = Number((await sql<{ count: number }>`SELECT count(*)::int AS count
    FROM snapshot.entity_snapshot_identity
    WHERE tenant_id=${tenantId}::uuid AND entity_id=${partnerId}::uuid`.execute(transaction)).rows[0]?.count ?? 0);
  return {
    evidenceItems: rows.length,
    targetTables: Object.freeze([...new Set(rows.map((row) => row.target_table))].sort()),
    snapshotRows,
  };
}

async function countMaterializationItems(transaction: Tx, tenantId: string, requestId: string) {
  return Number((await sql<{ count: number }>`SELECT count(*)::int AS count
    FROM document.business_partner_request_materialization_item
    WHERE tenant_id=${tenantId}::uuid AND request_id=${requestId}::uuid`.execute(transaction)).rows[0]?.count ?? 0);
}

async function observeCleanup(database: Kysely<Database>) {
  const row = (await sql<{
    typed_request_rows: number;
    legacy_request_rows: number;
    typed_partner_rows: number;
    legacy_partner_rows: number;
  }>`SELECT
    (SELECT count(*)::int FROM document.business_partner_request WHERE request_no=${REQUEST_NO}) AS typed_request_rows,
    (SELECT count(*)::int FROM document.business_partner_request WHERE request_no=${LEGACY_REQUEST_NO}) AS legacy_request_rows,
    (SELECT count(*)::int FROM master.business_partner WHERE code='BP.BS360.P0.EVIDENCE') AS typed_partner_rows,
    (SELECT count(*)::int FROM master.business_partner WHERE code='BP.BS360.P0.LEGACY') AS legacy_partner_rows`.execute(database)).rows[0];
  if (!row) throw new Error("materialization cleanup observation failed");
  return {
    typedRequestRows: Number(row.typed_request_rows) as 0,
    legacyRequestRows: Number(row.legacy_request_rows) as 0,
    typedPartnerRows: Number(row.typed_partner_rows) as 0,
    legacyPartnerRows: Number(row.legacy_partner_rows) as 0,
  };
}

class RollbackEvidence extends Error {}
function hash(value: string) { return createHash("sha256").update(value).digest("hex"); }
function equalCounts(left: Readonly<Record<string, number>>, right: Readonly<Record<string, number>>) {
  return Object.keys(right).every((key) => left[key] === right[key]);
}
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
function assertLocal(value: string) {
  const url = new URL(value);
  if (!["127.0.0.1", "localhost", "::1"].includes(url.hostname) || url.pathname !== "/athyper_neon")
    throw new Error("materialization evidence requires local athyper_neon");
}
function option(args: readonly string[], name: string) {
  return args.find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const url = option(process.argv.slice(2), "--neon-database-url") ?? process.env["ATHYPER_NEON_DATABASE_ADMIN_URL"];
  if (!url) throw new Error("--neon-database-url or ATHYPER_NEON_DATABASE_ADMIN_URL is required");
  process.stdout.write(`${JSON.stringify(await runBusinessPartner360MaterializationEvidence({
    neonDatabaseUrl: url,
    confirmation: option(process.argv.slice(2), "--confirm"),
  }), null, 2)}\n`);
}
