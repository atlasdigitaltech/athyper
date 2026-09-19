# Business Partner operation publication reviews

All 51 operations are listed; 36 need policy review. Every runtime binding still requires actual registration and qualification. No approvals, grants, publication or activation are performed.

Base: metadata.entity.business_partner.local-master-data.cirrusatlantic, release 17.

| Operation | Categories | Exact permission | Resolver | Handler / variant | Workflow | Proposal |
| --- | --- | --- | --- | --- | --- | --- |
| enter | missing_permission, unclear_semantics, runtime_registration_unqualified | neon.relationship.business_partner.enter | tenant.record.v1 | application / default | read | retain_pending_exact_review |
| discover | incompatible_scope, runtime_registration_unqualified | neon.relationship.business_partner.read | tenant.record.v1 | directory / default | read | retain_pending_exact_review |
| read | incompatible_scope, runtime_registration_unqualified | neon.relationship.business_partner.read | tenant.record.v1 | record / default | read | retain_pending_exact_review |
| navigate_manage | incompatible_scope, runtime_registration_unqualified | neon.relationship.business_partner.read | tenant.record.v1 | directory / default | read | retain_pending_exact_review |
| navigate_overview | incompatible_scope, runtime_registration_unqualified | neon.relationship.business_partner.read | tenant.record.v1 | directory / default | read | retain_pending_exact_review |
| export | incompatible_scope, runtime_registration_unqualified | neon.relationship.business_partner.read | tenant.record.v1 | export / default | transfer | retain_pending_exact_review |
| navigate_review | runtime_registration_unqualified | neon.relationship.entity_case.read | organization.record.v1 | case_read / default | read | retain_pending_exact_review |
| request_supplier | runtime_registration_unqualified | neon.relationship.entity_case.create | organization.record.v1 | case_create / new_partner (requestedRole=supplier) | case | retain_pending_exact_review |
| add_role | runtime_registration_unqualified | neon.relationship.entity_case.create | organization.record.v1 | case_create / add_supplier or add_customer (selected role) | case | retain_pending_exact_review |
| amend_partner | runtime_registration_unqualified | neon.relationship.entity_case.create | organization.record.v1 | case_create / amend_partner | case | retain_pending_exact_review |
| assign_organization | runtime_registration_unqualified | neon.relationship.entity_case.create | organization.record.v1 | case_create / assign_organization | case | retain_pending_exact_review |
| configure_company | incompatible_scope, runtime_registration_unqualified | neon.relationship.entity_case.create | organization-company.record.v1 | case_create / configure_company | case | retain_pending_exact_review |
| change_bank | runtime_registration_unqualified | neon.relationship.entity_case.create | organization.record.v1 | case_create / change_bank | case | retain_pending_exact_review |
| lifecycle | runtime_registration_unqualified | neon.relationship.entity_case.create | organization.record.v1 | case_create / activate_supplier or deactivate or reactivate or archive (selected transition) | case | retain_pending_exact_review |
| certification | unclear_semantics, runtime_registration_unqualified | neon.relationship.entity_case.create | organization.record.v1 | case_create / unresolved case kind | case | defer |
| import | incompatible_scope, runtime_registration_unqualified | neon.relationship.business_partner.read | tenant.record.v1 | import / default | transfer | retain_pending_exact_review |
| identity_read | incompatible_scope, runtime_registration_unqualified | neon.relationship.business_partner_identity.read | tenant.record.v1 | section / identity | read | retain_pending_exact_review |
| contacts_read | incompatible_scope, runtime_registration_unqualified | neon.relationship.business_partner_contact.read | tenant.record.v1 | section / contacts | read | retain_pending_exact_review |
| addresses_read | incompatible_scope, runtime_registration_unqualified | neon.relationship.business_partner_address.read | tenant.record.v1 | section / addresses | read | retain_pending_exact_review |
| identifier_read | incompatible_scope, runtime_registration_unqualified | neon.relationship.business_partner_identifier.read_masked | tenant.record.v1 | section / identifiers-tax | read | retain_pending_exact_review |
| tax_read | incompatible_scope, runtime_registration_unqualified | neon.relationship.business_partner_tax.read_masked | tenant.record.v1 | section / identifiers-tax | read | retain_pending_exact_review |
| bank_read | incompatible_scope, runtime_registration_unqualified | neon.relationship.business_partner_bank.read_masked | tenant.record.v1 | section / banking | read | retain_pending_exact_review |
| qualification_read | incompatible_scope, runtime_registration_unqualified | neon.relationship.business_partner_qualification.read | tenant.record.v1 | section / qualifications-certificates | read | retain_pending_exact_review |
| certificate_read | incompatible_scope, runtime_registration_unqualified | neon.relationship.business_partner_certificate.read | tenant.record.v1 | section / qualifications-certificates | read | retain_pending_exact_review |
| credit_read | incompatible_scope, runtime_registration_unqualified | neon.relationship.business_partner_credit.read | organization-company.record.v1 | section / credit | read | retain_pending_exact_review |
| requests_read | incompatible_scope, runtime_registration_unqualified | neon.relationship.entity_case.read | tenant.record.v1 | section / requests | read | retain_pending_exact_review |
| activity_read | incompatible_scope, runtime_registration_unqualified | neon.relationship.business_partner_activity.read | tenant.record.v1 | section / activity | read | retain_pending_exact_review |
| network_read | incompatible_scope, runtime_registration_unqualified | neon.relationship.business_partner_network.read | organization-company.record.v1 | section / network | read | retain_pending_exact_review |
| comments_read | missing_permission, runtime_registration_unqualified | collaboration.comment.read | tenant.record.v1 | section / comments | read | retain_pending_exact_review |
| attachments_read | missing_permission, runtime_registration_unqualified | document.attachment.read | tenant.record.v1 | section / attachments | read | retain_pending_exact_review |
| bank_reveal | incompatible_scope, runtime_registration_unqualified | neon.relationship.business_partner_bank.reveal | tenant.record.v1 | bank_reveal / default | reveal | retain_pending_exact_review |
| tax_reveal | incompatible_scope, runtime_registration_unqualified | neon.relationship.business_partner_tax.reveal | tenant.record.v1 | tax_reveal / default | reveal | retain_pending_exact_review |
| person_read | incompatible_scope, unclear_semantics, runtime_registration_unqualified | neon.relationship.business_partner_person.read | tenant.record.v1 | summary / person_read | read | retain_pending_exact_review |
| person_sensitive_read | incompatible_scope, unclear_semantics, runtime_registration_unqualified | neon.relationship.business_partner_person_sensitive.read | tenant.record.v1 | summary / person_sensitive_read | read | retain_pending_exact_review |
| workforce_read | incompatible_scope, unclear_semantics, runtime_registration_unqualified | neon.relationship.business_partner_workforce.read | tenant.record.v1 | summary / workforce_read | read | retain_pending_exact_review |
| contact_sensitive_read | incompatible_scope, unclear_semantics, runtime_registration_unqualified | neon.relationship.business_partner.read_contact_sensitive | tenant.record.v1 | summary / contact_sensitive_read | read | retain_pending_exact_review |
| address_sensitive_read | incompatible_scope, unclear_semantics, runtime_registration_unqualified | neon.relationship.business_partner.read_address_sensitive | tenant.record.v1 | summary / address_sensitive_read | read | retain_pending_exact_review |
| case_create | runtime_registration_unqualified | neon.relationship.entity_case.create | organization.record.v1 | case_create / default | case | retain_pending_exact_review |
| case_read | runtime_registration_unqualified | neon.relationship.entity_case.read | organization.record.v1 | case_read / default | read | retain_pending_exact_review |
| case_update | runtime_registration_unqualified | neon.relationship.entity_case.update | organization.record.v1 | case_update / default | case | retain_pending_exact_review |
| case_validate | runtime_registration_unqualified | neon.relationship.entity_case.validate | organization.record.v1 | case_validate / default | case | retain_pending_exact_review |
| case_submit | runtime_registration_unqualified | neon.relationship.entity_case.submit | organization.record.v1 | case_submit / default | case | retain_pending_exact_review |
| case_decide | runtime_registration_unqualified | neon.relationship.entity_case.decide | organization.record.v1 | case_decide / default | case | retain_pending_exact_review |
| case_materialize | runtime_registration_unqualified | neon.relationship.entity_case.materialize | organization.record.v1 | case_materialize / default | case | retain_pending_exact_review |
| section_propose_change | unclear_semantics, runtime_registration_unqualified | neon.relationship.business_partner_amend.create | organization.record.v1 | case_create / amend_partner | case | retain_pending_exact_review |
| create | unclear_semantics, runtime_registration_unqualified | neon.relationship.business_partner.create | tenant.record.v1 | create / default | direct_mutation | defer |
| update | unclear_semantics, runtime_registration_unqualified | neon.relationship.business_partner.update | tenant.record.v1 | update / default | direct_mutation | defer |
| qualification | runtime_registration_unqualified | neon.supplier.qualification.admin | organization.record.v1 | qualification / default | qualification | retain_pending_exact_review |
| qualification_company | incompatible_scope, runtime_registration_unqualified | neon.supplier.qualification.admin | organization-company.record.v1 | qualification / organization-company | qualification | retain_pending_exact_review |
| supplier_company_read | incompatible_scope, runtime_registration_unqualified | neon.relationship.business_partner.read | organization-company.record.v1 | section / supplier-company | read | retain_pending_exact_review |
| customer_company_read | incompatible_scope, runtime_registration_unqualified | neon.relationship.business_partner.read | organization-company.record.v1 | section / customer-company | read | retain_pending_exact_review |

The JSON packet records exact permission IDs, current catalog scopes, target scope bindings, handler source references, preflight/workflow requirements and revision hashes per operation. Source references do not establish callable deployment or authenticated qualification.

The three recommended deferrals (certification, direct create and direct update) are proposals, not applied runtime changes. Deferring core read operations would leave an unusable BP release, so scope conflicts remain explicit review blockers.

Reviewer nomination recorded: catl.owner and catl.admin may each review operation semantics and permission/scope proposals in both business and security domains for this BP publication coordinate. Individual operation decisions, proposed deferrals and exact catalog proposals remain pending. Neither nomination nor the prior 79 membership approvals accepts these changes.

Native signing requires a trusted review adapter. Its reader must load immutable authenticated evidence and revalidate reviewer authority; arbitrary packet JSON or a boolean is insufficient. All selected operations require accepted decisions and regression hashes, and deferred operations must be absent from the executable selection.
