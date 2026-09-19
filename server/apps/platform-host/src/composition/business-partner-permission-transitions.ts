import type { EntityAuthorizationProfileV1 } from "@athyper/server-contract-metadata";

/** Exact capability changes in the approved operation packet. This is an
 * intersection adapter: source domain gates remain required, and the target
 * evaluator independently checks current grants at the selected ownership scope.
 * Installation confers no capabilities and does not enable enforcement. */
const approvedTransitions = [
  {
    "operationKey": "enter",
    "sourcePermissionCode": "neon.relationship.business_partner.enter",
    "targetPermissionCode": "neon.relationship.bp_target.enter"
  },
  {
    "operationKey": "discover",
    "sourcePermissionCode": "neon.relationship.business_partner.read",
    "targetPermissionCode": "neon.relationship.bp_target.discover"
  },
  {
    "operationKey": "read",
    "sourcePermissionCode": "neon.relationship.business_partner.read",
    "targetPermissionCode": "neon.relationship.bp_target.read"
  },
  {
    "operationKey": "navigate_manage",
    "sourcePermissionCode": "neon.relationship.business_partner.read",
    "targetPermissionCode": "neon.relationship.bp_target.navigate_manage"
  },
  {
    "operationKey": "navigate_overview",
    "sourcePermissionCode": "neon.relationship.business_partner.read",
    "targetPermissionCode": "neon.relationship.bp_target.navigate_overview"
  },
  {
    "operationKey": "export",
    "sourcePermissionCode": "neon.relationship.business_partner.read",
    "targetPermissionCode": "neon.relationship.bp_target.export"
  },
  {
    "operationKey": "configure_company",
    "sourcePermissionCode": "neon.relationship.entity_case.create",
    "targetPermissionCode": "neon.relationship.bp_target.configure_company"
  },
  {
    "operationKey": "import",
    "sourcePermissionCode": "neon.relationship.business_partner.read",
    "targetPermissionCode": "neon.relationship.bp_target.import"
  },
  {
    "operationKey": "identity_read",
    "sourcePermissionCode": "neon.relationship.business_partner_identity.read",
    "targetPermissionCode": "neon.relationship.bp_target.identity_read"
  },
  {
    "operationKey": "contacts_read",
    "sourcePermissionCode": "neon.relationship.business_partner_contact.read",
    "targetPermissionCode": "neon.relationship.bp_target.contacts_read"
  },
  {
    "operationKey": "addresses_read",
    "sourcePermissionCode": "neon.relationship.business_partner_address.read",
    "targetPermissionCode": "neon.relationship.bp_target.addresses_read"
  },
  {
    "operationKey": "identifier_read",
    "sourcePermissionCode": "neon.relationship.business_partner_identifier.read_masked",
    "targetPermissionCode": "neon.relationship.bp_target.identifier_read"
  },
  {
    "operationKey": "tax_read",
    "sourcePermissionCode": "neon.relationship.business_partner_tax.read_masked",
    "targetPermissionCode": "neon.relationship.bp_target.tax_read"
  },
  {
    "operationKey": "bank_read",
    "sourcePermissionCode": "neon.relationship.business_partner_bank.read_masked",
    "targetPermissionCode": "neon.relationship.bp_target.bank_read"
  },
  {
    "operationKey": "qualification_read",
    "sourcePermissionCode": "neon.relationship.business_partner_qualification.read",
    "targetPermissionCode": "neon.relationship.bp_target.qualification_read"
  },
  {
    "operationKey": "certificate_read",
    "sourcePermissionCode": "neon.relationship.business_partner_certificate.read",
    "targetPermissionCode": "neon.relationship.bp_target.certificate_read"
  },
  {
    "operationKey": "credit_read",
    "sourcePermissionCode": "neon.relationship.business_partner_credit.read",
    "targetPermissionCode": "neon.relationship.bp_target.credit_read"
  },
  {
    "operationKey": "requests_read",
    "sourcePermissionCode": "neon.relationship.entity_case.read",
    "targetPermissionCode": "neon.relationship.bp_target.requests_read"
  },
  {
    "operationKey": "activity_read",
    "sourcePermissionCode": "neon.relationship.business_partner_activity.read",
    "targetPermissionCode": "neon.relationship.bp_target.activity_read"
  },
  {
    "operationKey": "network_read",
    "sourcePermissionCode": "neon.relationship.business_partner_network.read",
    "targetPermissionCode": "neon.relationship.bp_target.network_read"
  },
  {
    "operationKey": "comments_read",
    "sourcePermissionCode": "collaboration.comment.read",
    "targetPermissionCode": "neon.relationship.bp_target.comments_read"
  },
  {
    "operationKey": "attachments_read",
    "sourcePermissionCode": "document.attachment.read",
    "targetPermissionCode": "neon.relationship.bp_target.attachments_read"
  },
  {
    "operationKey": "bank_reveal",
    "sourcePermissionCode": "neon.relationship.business_partner_bank.reveal",
    "targetPermissionCode": "neon.relationship.bp_target.bank_reveal"
  },
  {
    "operationKey": "tax_reveal",
    "sourcePermissionCode": "neon.relationship.business_partner_tax.reveal",
    "targetPermissionCode": "neon.relationship.bp_target.tax_reveal"
  },
  {
    "operationKey": "qualification_company",
    "sourcePermissionCode": "neon.supplier.qualification.admin",
    "targetPermissionCode": "neon.relationship.bp_target.qualification_company"
  },
  {
    "operationKey": "supplier_company_read",
    "sourcePermissionCode": "neon.relationship.business_partner.read",
    "targetPermissionCode": "neon.relationship.bp_target.supplier_company_read"
  },
  {
    "operationKey": "customer_company_read",
    "sourcePermissionCode": "neon.relationship.business_partner.read",
    "targetPermissionCode": "neon.relationship.bp_target.customer_company_read"
  }
] as const;

export function businessPartnerPermissionTransitions(profile: EntityAuthorizationProfileV1) {
  if (profile.entityCode !== "business_partner" || profile.planeKey !== "neon")
    throw Error("BP_PERMISSION_TRANSITION_PROFILE_MISMATCH");
  return approvedTransitions.filter(transition =>
    !profile.deferredOperations?.includes(transition.operationKey) &&
    profile.operations.some(operation => operation.key === transition.operationKey &&
      operation.permissionCode === transition.targetPermissionCode));
}
