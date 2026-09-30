import { sql, type RawBuilder } from "kysely";
import type { EntityRuntimeDescriptor } from "@athyper/server-contract-metadata";
import type { RecordCollectionScopeSqlCompiler } from "@athyper/server-service-records";

function assertBusinessPartner(
  descriptor: EntityRuntimeDescriptor,
  message: string,
): void {
  if (
    descriptor.planeKey !== "neon" ||
    descriptor.storage.schema !== "master" ||
    descriptor.storage.object !== "business_partner"
  )
    throw new Error(message);
}

function activeOrganizationAssignmentExists(
  tenantId: string,
  partnerId: RawBuilder<unknown>,
  organizationMatch: RawBuilder<unknown>,
): RawBuilder<unknown> {
  return sql`EXISTS (
    SELECT 1 FROM master.business_partner_operating_organization_assignment AS list_scope_assignment
    WHERE list_scope_assignment.tenant_id = ${tenantId}::uuid
      AND list_scope_assignment.business_partner_id = ${partnerId}
      AND ${organizationMatch}
      AND list_scope_assignment.status = 'active'
      AND list_scope_assignment.effective_from <= CURRENT_DATE
      AND (list_scope_assignment.effective_until IS NULL OR list_scope_assignment.effective_until > CURRENT_DATE)
  )`;
}

export const neonRecordScopeSqlCompilers: readonly RecordCollectionScopeSqlCompiler[] =
  [
    {
      kind: "neon.business_partner.directory.v1",
      compile(descriptor, tenantId, constraint) {
        if (constraint.kind !== "neon.business_partner.directory.v1")
          throw new Error("Directory scope kind mismatch");
        assertBusinessPartner(descriptor, "Directory scope storage mismatch");
        const root = sql.ref(`business_partner.${descriptor.storage.idField}`),
          conditions: RawBuilder<unknown>[] = [];
        if (constraint.partnerRole) {
          const column =
            constraint.partnerRole === "supplier"
              ? "supplier_enabled"
              : constraint.partnerRole === "customer"
                ? "customer_enabled"
                : undefined;
          if (!column) throw new Error("Unsupported partner capability");
          conditions.push(sql`${sql.ref(`business_partner.${column}`)} = TRUE`);
        }
        if (constraint.eligibleIds)
          conditions.push(
            constraint.eligibleIds.length
              ? sql`${root} IN (${sql.join(constraint.eligibleIds.map((id) => sql`${id}::uuid`))})`
              : sql`FALSE`,
          );
        if (constraint.organizationIds)
          conditions.push(
            constraint.organizationIds.length
              ? activeOrganizationAssignmentExists(
                  tenantId,
                  root,
                  sql`list_scope_assignment.operating_organization_id IN (${sql.join(constraint.organizationIds.map((id) => sql`${id}::uuid`))})`,
                )
              : sql`FALSE`,
          );
        if (constraint.companyIds)
          conditions.push(
            constraint.companyIds.length
              ? sql`(EXISTS(SELECT 1 FROM master.company_code_supplier_profile p WHERE p.tenant_id=${tenantId}::uuid AND p.business_partner_id=${root} AND p.company_code_id IN (${sql.join(constraint.companyIds.map((id) => sql`${id}::uuid`))})) OR EXISTS(SELECT 1 FROM master.company_code_customer_profile p WHERE p.tenant_id=${tenantId}::uuid AND p.business_partner_id=${root} AND p.company_code_id IN (${sql.join(constraint.companyIds.map((id) => sql`${id}::uuid`))})))`
              : sql`FALSE`,
          );
        return conditions.length
          ? sql`(${sql.join(conditions, sql` AND `)})`
          : sql`TRUE`;
      },
    },
    {
      kind: "neon.business_partner.operating_organization.v1",
      compile(descriptor, tenantId, constraint) {
        if (
          constraint.kind !== "neon.business_partner.operating_organization.v1"
        )
          throw new Error("Business-partner collection scope kind mismatch");
        assertBusinessPartner(
          descriptor,
          "Business-partner collection scope cannot be applied to this descriptor",
        );
        return activeOrganizationAssignmentExists(
          tenantId,
          sql.ref(`business_partner.${descriptor.storage.idField}`),
          sql`list_scope_assignment.operating_organization_id = ${constraint.operatingOrganizationId}::uuid`,
        );
      },
    },
  ];
