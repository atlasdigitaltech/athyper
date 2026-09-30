# Combined Atlas and Business Partner authorization successor

The combined successor is independently approved by `catl.owner` through the authenticated Studio API. It preserves Atlas release 18 and adds the reviewed BP authorization selection. The graph approval is recorded; signing, publication and activation remain outstanding.

## Exact review coordinates

- Change set: `9f8b8fd7-cd6e-4af7-a08b-7a650d70437b`, revision **3**, status **approved**.
- Author/submitter: `catl.admin` (Studio principal `81cd1978-2df5-5c9a-938a-2f8c291aea13`).
- Independent Studio reviewer: `catl.owner` (Studio principal `5cd6cf93-3fe4-500c-8066-3ebf14a9eb5d`). Approval returned HTTP 200 and was verified in a subsequent read-only database transaction, including reviewer separation and the unchanged persisted contract hash. Login completed with issuer MFA; the application reported baseline assurance, so this receipt does not assert elevated release-signing authority.
- Proposal revision: `f89a3e8d172b456f739a3533b4fa92bb70d8f960a18d6cb729e744d950361dd3`.
- Persisted native contract hash: `b009c515ccb776a9b76999c77d06b81ab70127e42e9e15fc7637214ee1c10343`.
- Proposed combined descriptor hash: `6dc7baed8589b2d5ba9e1c8bad1f277f4d89613cbf156daf2d1bbe02dab03df1`.
- Native runtime binding hash: `c2198cad0df335116fe2a0631c848f2ec7f68ce05d323017e50cfdb376d24efe`.
- Predecessor: Atlas BP release **18**, `126721f6-a2e5-45e2-91bf-0d6a1b660c56`, under `metadata.entity.business_partner.local-master-data.cirrusatlantic`.

The latest read-only capture observes active head 18. It advanced during preparation; this workflow contains no activation call. Its descriptor matches the approved Atlas predecessor exactly. A successor release number and release ID have not been reserved or invented.

## Preserved Atlas behavior

Atlas AI enablement, aliases, description, search and summary fields, actions, all ten insight providers, relationship keys and presentation profiles are unchanged. Runtime storage, source metadata, directory scope, record presentation and detail routing are also preserved.
Preserved AI content hash: `c6d3ee5d421f1402a05fb88df4ee54ba0d7b2633983e1478ebc61213618555c0`.

## Authorization delta for review

- 42 executable operation definitions retain the selected permissions, ownership scopes, real handler references and required preflights.
- Nine selected deferrals remain unavailable; existing-child qualification decisions are not added through creation bindings.
- Direct field writability is removed as specified by the reviewed selection; governed commands remain separate.
- List actions and navigation use the selected bindings. Generic import modes and template download remain unavailable; governed import has its distinct API.
- Old release scope-binding identities are excluded from the proposed descriptor. Native compilation must generate new bindings from persisted operation IDs and the exact permission catalog.
- No permission grants or responsibility assignments are added. Existing grants cannot satisfy a different target permission by implication.

| Operation | Permission | Scope / target | Handler | Preflight |
| --- | --- | --- | --- | --- |
| `enter` | `neon.relationship.bp_target.enter` | `tenant.record.v1` / collection | `business_partner.enter.v1` | `none` |
| `discover` | `neon.relationship.bp_target.discover` | `tenant.record.v1` / collection | `business_partner.discover.v1` | `none` |
| `read` | `neon.relationship.bp_target.read` | `tenant.record.v1` / existing | `business_partner.read.v1` | `none` |
| `navigate_manage` | `neon.relationship.bp_target.navigate_manage` | `tenant.record.v1` / collection | `business_partner.navigate_manage.v1` | `none` |
| `navigate_overview` | `neon.relationship.bp_target.navigate_overview` | `tenant.record.v1` / collection | `business_partner.navigate_overview.v1` | `none` |
| `export` | `neon.relationship.bp_target.export` | `tenant.record.v1` / collection | `business_partner.export.v1` | `business_partner.export.preflight.v1` |
| `navigate_review` | `neon.relationship.entity_case.read` | `organization.record.v1` / collection | `business_partner.navigate_review.v1` | `none` |
| `request_supplier` | `neon.relationship.entity_case.create` | `organization.record.v1` / proposed | `business_partner.request_supplier.v1` | `business_partner.request_supplier.preflight.v1` |
| `add_role` | `neon.relationship.entity_case.create` | `organization.record.v1` / proposed | `business_partner.add_role.v1` | `business_partner.add_role.preflight.v1` |
| `amend_partner` | `neon.relationship.entity_case.create` | `organization.record.v1` / proposed | `business_partner.amend_partner.v1` | `business_partner.amend_partner.preflight.v1` |
| `assign_organization` | `neon.relationship.entity_case.create` | `organization.record.v1` / proposed | `business_partner.assign_organization.v1` | `business_partner.assign_organization.preflight.v1` |
| `configure_company` | `neon.relationship.bp_target.configure_company` | `organization-company.record.v1` / proposed | `business_partner.configure_company.v1` | `business_partner.configure_company.preflight.v1` |
| `change_bank` | `neon.relationship.entity_case.create` | `organization.record.v1` / proposed | `business_partner.change_bank.v1` | `business_partner.change_bank.preflight.v1` |
| `lifecycle` | `neon.relationship.entity_case.create` | `organization.record.v1` / proposed | `business_partner.lifecycle.v1` | `business_partner.lifecycle.preflight.v1` |
| `import` | `neon.relationship.bp_target.import` | `tenant.record.v1` / proposed | `business_partner.import.governed_requests.v1` | `business_partner.import.preflight.v1` |
| `identity_read` | `neon.relationship.bp_target.identity_read` | `tenant.record.v1` / existing | `business_partner.identity_read.v1` | `none` |
| `contacts_read` | `neon.relationship.bp_target.contacts_read` | `tenant.record.v1` / existing | `business_partner.contacts_read.v1` | `none` |
| `addresses_read` | `neon.relationship.bp_target.addresses_read` | `tenant.record.v1` / existing | `business_partner.addresses_read.v1` | `none` |
| `identifier_read` | `neon.relationship.bp_target.identifier_read` | `tenant.record.v1` / existing | `business_partner.identifier_read.v1` | `none` |
| `tax_read` | `neon.relationship.bp_target.tax_read` | `tenant.record.v1` / existing | `business_partner.tax_read.v1` | `none` |
| `bank_read` | `neon.relationship.bp_target.bank_read` | `tenant.record.v1` / existing | `business_partner.bank_read.v1` | `none` |
| `qualification_read` | `neon.relationship.bp_target.qualification_read` | `tenant.record.v1` / existing | `business_partner.qualification_read.v1` | `none` |
| `certificate_read` | `neon.relationship.bp_target.certificate_read` | `tenant.record.v1` / existing | `business_partner.certificate_read.v1` | `none` |
| `credit_read` | `neon.relationship.bp_target.credit_read` | `organization-company.record.v1` / existing | `business_partner.credit_read.v1` | `none` |
| `requests_read` | `neon.relationship.bp_target.requests_read` | `tenant.record.v1` / existing | `business_partner.requests_read.v1` | `none` |
| `activity_read` | `neon.relationship.bp_target.activity_read` | `tenant.record.v1` / existing | `business_partner.activity_read.v1` | `none` |
| `network_read` | `neon.relationship.bp_target.network_read` | `organization-company.record.v1` / existing | `business_partner.network_read.v1` | `none` |
| `comments_read` | `neon.relationship.bp_target.comments_read` | `tenant.record.v1` / existing | `business_partner.comments_read.v1` | `none` |
| `attachments_read` | `neon.relationship.bp_target.attachments_read` | `tenant.record.v1` / existing | `business_partner.attachments_read.v1` | `none` |
| `bank_reveal` | `neon.relationship.bp_target.bank_reveal` | `tenant.record.v1` / existing | `business_partner.bank_reveal.v1` | `business_partner.bank_reveal.preflight.v1` |
| `tax_reveal` | `neon.relationship.bp_target.tax_reveal` | `tenant.record.v1` / existing | `business_partner.tax_reveal.v1` | `business_partner.tax_reveal.preflight.v1` |
| `case_create` | `neon.relationship.entity_case.create` | `organization.record.v1` / proposed | `business_partner.case_create.v1` | `business_partner.case_create.preflight.v1` |
| `case_read` | `neon.relationship.entity_case.read` | `organization.record.v1` / collection | `business_partner.case_read.v1` | `none` |
| `case_update` | `neon.relationship.entity_case.update` | `organization.record.v1` / existing | `business_partner.case_update.v1` | `business_partner.case_update.preflight.v1` |
| `case_validate` | `neon.relationship.entity_case.validate` | `organization.record.v1` / existing | `business_partner.case_validate.v1` | `business_partner.case_validate.preflight.v1` |
| `case_submit` | `neon.relationship.entity_case.submit` | `organization.record.v1` / existing | `business_partner.case_submit.v1` | `business_partner.case_submit.preflight.v1` |
| `case_decide` | `neon.relationship.entity_case.decide` | `organization.record.v1` / existing | `business_partner.case_decide.v1` | `business_partner.case_decide.preflight.v1` |
| `case_materialize` | `neon.relationship.entity_case.materialize` | `organization.record.v1` / existing | `business_partner.case_materialize.v1` | `business_partner.case_materialize.preflight.v1` |
| `qualification` | `neon.supplier.qualification.admin` | `organization.record.v1` / proposed | `business_partner.qualification.v1` | `business_partner.qualification.preflight.v1` |
| `qualification_company` | `neon.relationship.bp_target.qualification_company` | `organization-company.record.v1` / proposed | `business_partner.qualification_company.v1` | `business_partner.qualification_company.preflight.v1` |
| `supplier_company_read` | `neon.relationship.bp_target.supplier_company_read` | `organization-company.record.v1` / existing | `business_partner.supplier_company_read.v1` | `none` |
| `customer_company_read` | `neon.relationship.bp_target.customer_company_read` | `organization-company.record.v1` / existing | `business_partner.customer_company_read.v1` | `none` |

Deferred: `address_sensitive_read`, `certification`, `contact_sensitive_read`, `create`, `person_read`, `person_sensitive_read`, `section_propose_change`, `update`, `workforce_read`.

## Validation and deployment evidence

Four three-way merge regressions passed, covering preservation, conflicting predecessor edits, hidden AI/storage mutations and predecessor authority. The candidate container validated all 42 operations and nine deferrals and matched the local native contract hash.

The deployed Studio compiler initially rejected the newer authorization schema. A five-file compiler compatibility patch was built on the exact running Atlas API image, smoke-tested, and deployed. The API is healthy. Its prior image and compose configuration are retained for rollback; this did not change publication heads or grants.

Authenticated graph staging, validation, three contract assertions and submission succeeded. A subsequent read-only check of the persisted revision confirms both Atlas and authorization content. Database defaults account for the difference between the submitted draft graph hash and the persisted native contract hash; review and later signing must bind the persisted hash above.

The runtime parser canonicalizes operation bindings by operation key. The local native publication compiler now applies that same parser to authored bindings before comparison, retaining exact contract hashing and rejecting changed handler values. Twenty-one compiler regressions passed. This additional publication compiler fix is local; it was not included in the deployed authoring-only patch.

## Publication remains closed

The current baseline materializer only supports the original AI-only derivative. The new graph pins the combined descriptor hash, so that old materializer rejects it rather than discarding authorization changes. A compatible combined-successor materializer and exact release-bound governance receipt are required before publication. The review carrier is not a publishable artifact.

Following this graph approval, complete native materialization and authenticated release review, compile/sign one exact release, qualify reads/providers/fields/commands/exports/AI and revocation against it, and obtain explicit dispositions for the 29 policy differences. Grant migration and enforcement activation remain separately approved actions.

## Artifacts

- [Combined descriptor and proposal](../../governance/policy/reports/business-partner-combined-successor.dev.json)
- [Native authoring graph](../../governance/policy/reviews/business-partner-combined-native-graph.dev.json)
- [Authenticated authoring results](../../governance/policy/reports/business-partner-combined-authoring.dev.json)
- [Persisted review snapshot](../../governance/policy/reports/business-partner-combined-persisted-review.dev.json)
- [Authenticated approval receipt](../../governance/policy/reports/business-partner-combined-approval.dev.json)
- [Persisted approval verification](../../governance/policy/reports/business-partner-combined-persisted-approval.dev.json)
- [Compiler deployment and rollback references](../../governance/policy/reports/business-partner-authoring-compiler.dev.json)
- [Current activation-head evidence](../../governance/policy/reports/business-partner-combined-head.dev.json)
