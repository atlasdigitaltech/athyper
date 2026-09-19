# Business Partner supporting documents and role-aware requirements

Recommendation prepared from the repository DDL and selected runtime consumers on 2026-09-13. This is a design review, not an implementation or live-database verification. No schema, metadata publication, permissions, or business records were changed for this review. Qatar and Saudi examples below represent configurable tenant preferences, not assertions of legal requirements.


**Design revision — 2026-09-13:** The separate Bank-specific implementation design has been withdrawn at the user's request. The shared record-linked evidence requirements remain a recommendation. Bank-specific storage, capture/handoff and publication architecture require a new design; the archived Bank plan must not drive further implementation. This revision changes documentation only.

## Recommendation

Provide one reusable **Supporting documents** component on each profile row, a profile-level documents area for broadly applicable material, and a **Bank accounts** section with protected account capture and supporting documents. Bind the UI to a published, versioned Meta Entity requirement contract. Resolve applicability by tenant, authorized organization/company, requested or operational role, registration/tax/bank jurisdiction, and lifecycle operation. Use existing policy storage and attachment storage; do not add one file table or mandatory boolean per section, country, or role.

Keep four concepts distinct: the registration/account/classification fact; a document offered to support it; a reviewer’s acceptance of that exact document for that fact; and permission to perform the next business operation. Uploading a clean file satisfies none of the last two automatically.

## DDL review and reuse map

Source index: `attachment-policy-ddl-index.csv` enumerates CREATE TABLE declarations across the scanned SQL tree. `attachment-policy-ddl-detail.json` retains relevant table definitions and ALTER/DROP/COMMENT locations. `attachment-policy-ddl-scan-summary.json` records scope/counts. These are source inventories: deployment composition, later ALTER/DROP statements and dynamic SQL mean declaration counts are not counts of live tables. Relevant constraints, functions and runtime consumers were separately reviewed. The scan covered 435 SQL files, 754 CREATE TABLE declarations and 142 relevant table bodies. Regenerate the inventory with `python3 tooling/scripts/verification/scan-business-partner-evidence-ddl.py`.

| Area | Existing DDL | Relevant fields / capability | Recommended use and gap |
|---|---|---|---|
| Binary and file metadata | `document.attachment` | tenant, storage bucket/key, content type, byte size, SHA-256, uploaded actor, series/version/parent, scan flag, metadata, extraction/PII fields, status, retention and expiry | Reuse upload/finalize/retrieval services. Business evidence acceptance is separate from successful upload/scanning. |
| Versions | `document.attachment_series` | current attachment, retention, expiry, lifecycle | Working profile can follow the current version; approval pins the exact reviewed version and hash. |
| Record association | `document.attachment_link` | entity_type/entity_id, series, pinned_attachment_id, link_kind, folder, display order, metadata | Link to the exact profile row. NEON/Studio/MESH constraints include tenant-aware series and pinned-version FKs. Polymorphic subject identity still needs service-side existence and authorization checks. |
| Organization / navigation | `document.attachment_folder` | owner coordinate, parent folder, name, display order | Optional folder navigation; folders do not define requirements or security authority. |
| Retention | `document.attachment_legal_hold`, `document.attachment_legal_hold_event` | hold reason, actor, placement/release history | Preserve decision evidence when a registration expires or is replaced. Business expiry must not automatically delete the file. |
| Previews | `document.attachment_derivative` | source attachment/hash, rendition, generation/scan state | Reuse authorized rendition processing. A preview or extracted text has the original evidence’s access restrictions. |
| Partner identity and roles | `master.business_partner`, `master.supplier`, `master.customer`, `master.business_partner_operating_organization_assignment` | one canonical partner, separate role records, organization scope | Identity/evidence may be reused within authorized scope; supplier and customer readiness are separate decisions. |
| Commercial registration | `master.business_partner_identifier` | scheme_code, identifier_value, issuing authority/country, issued_at, effective_until, primary, verified_at/by, metadata, status | Keep CR/business registration as structured identifiers. There is no dedicated multi-document relation on this row; use attachment links. Restricted identifier capture must continue using protected storage. |
| Tax registration | `master.business_partner_tax_registration`; `master.tax_jurisdiction`, `master.tax_type` | jurisdiction, tax type, registration type/number, effective dates, primary, verification actor/date | Evidence belongs to a particular registration/jurisdiction. Reuse protected capture; do not copy plaintext into request JSON, audit or document metadata. |
| Commodity capability | `master.business_partner_commodity_capability`; `master.commodity_category` | category, partner_role, effective dates, notes, metadata, status | Brochures/specifications can support individual capabilities. This table has no uniform evidence-acceptance fields. |
| Industry classification | `master.business_partner_industry_classification`; `shared.industry_code` | domain/code, assignment_kind, confidence, effective dates, verified_at/by, source system/reference | An uploaded brochure does not make a declared classification verified. Review must identify which classification the evidence supports. |
| Governance | `master.business_partner_governance_relation` | role, member name/type/linked partner/country, title, ownership/voting/beneficial percentages, appointment/end dates, notes | Link evidence to a member or ownership assertion; allow an ownership chart to support several assertions through explicit links. No uniform per-document acceptance ledger exists here. |
| Certifications | `master.certification_type`, `master.certification` | registered type or custom name, issuer, number, certified location, additional_info, company/site, effective dates, document_attachment_id | The existing scalar attachment reference can identify a primary certificate. A collection is needed for annexes, renewals and translations. Prefer attachment links as the authoritative collection; make the scalar a consistent primary-document projection, not an independently editable second source. `status='active'` is not proof of verified evidence. |
| Bank identity | `master.bank_account`; bank institution/branch/reference catalogs | holder, account ID type/value/last4, currency, institution/branch/provisional reference, BIC/name/country overrides, account nature/provider/correspondent, verification and status | Provide protected input and masked review. Bank country, registration country and tax jurisdiction are distinct facts. Catalog-reference and format validation already have separate sources. |
| Bank ownership | `master.bank_account_link` | owner, relationship role, account, legacy company coordinate, purpose, primary, effective dates | Evidence may concern account identity or this partner’s right to use it. Link the requirement to the appropriate subject, not merely to the partner’s general file list. |
| Bank company use | `master.bank_account_usage`, `master.bank_account_company_usage` in `master/15_bank_account_company_usage.sql` | selected/all-authorized scope; company, purpose, dates, primary; accepted actor/date; source tenant/account and accepted disclosure/version/fingerprint | Reuse explicit company acceptance. Availability does not mean readiness. The DDL function `master.bank_account_company_ready` also checks account verification, active state and accepted source disclosure when applicable. |
| Finance profiles | `master.company_code_supplier_profile`, `master.company_code_customer_profile` | company-role configuration and remittance/accounting controls | Evidence cannot activate finance settings, change the payment destination, or confer company authorization. |
| Bank review | `document.business_partner_bank_verification` | non-null bank_projection_id and supplier_company_profile_id, company, account fingerprint, evidence JSON, decision/application fingerprints, prior/candidate link, verified/rejected/applied actors | This table specifically models a supplier/MESH verification path. Later DDL adds expected disclosure ID/version. Do not fabricate a projection to use it for an internally maintained bank or customer refund. |
| Qualification | `control.business_partner_qualification` | partner_role, role_id, organization/company, commodity, qualification type, decision, validity, reviewer/approver, risk assessment | Reuse scoped qualification decisions and maker/checker constraints. Document approval is an input to qualification, not the entire qualification. |
| Operational blocks | `control.business_partner_block`, `document.supplier_activation_evidence` | scoped blocks; recorded supplier readiness evidence | Evidence readiness supplements existing operation controls. A policy exception must not lift unrelated blocks or grant permissions. |
| Supporting risk evidence | `master.party_risk_evidence` and risk assessment tables | risk-domain evidence | Use for risk assessments where relevant, not as the universal commercial-registration/document store. |
| Governed request | `document.entity_case`, `document.entity_case_validation`, `document.entity_case_command_evidence`, `document.entity_case_materialization` | pinned contract and snapshots, validation paths/ruleset version, immutable command evidence, materialization history | Use these for draft requirements, review/exception decisions and resulting child-row lineage. Existing `document.command_entity_case_attachment` records draft-case attachment evidence, but its parameters do not identify a collection item or requirement; extend the typed contract and validation. |
| Snapshots | `snapshot.entity_snapshot*`, `snapshot.entity_case_snapshot_lineage` | source/result versions and lineage | Pin the policy, subject facts and evidence versions used for a decision. Map draft item keys to materialized child IDs explicitly. |
| Policy authoring | `control.policy_definition`, `control.policy_rule` | tenant/global scope, version/hash/predecessor, effective dates, evaluation mode; conditions, action/config, priority, approver rules/SLA | Reuse these tables. Rule versions belong to policy_definition; do not create a second rule-version table. |
| Policy tests and evaluation | `control.policy_test_case`, `control.policy_test_result`, `control.policy_activation`, `control.policy_evaluation_history` | expected results, tested hash, activated definition, recorded decisions | Publish only tested policy versions; retain explanation and decision evidence. |
| Meta Entity binding | `metadata.entity_field`, `metadata.entity_surface*`, `metadata.entity_flow*`, `metadata.entity_policy_binding`, `metadata.entity_field_policy_binding`, `runtime_meta.entity_contract` | fields, presentation, flow conditions; policy definition/operation/stage/enforcement/input mappings; published contract | Reuse native presentation and policy bindings. A typed requirement/document widget and lifecycle readiness adapter must still be implemented. A JSON column alone does not make those semantics executable. |
| Collaboration | `mesh.network_account_identifier`, `mesh.network_account_profile*`, `mesh.network_account_tax_registration`, `mesh.network_account_commodity_capability`, `mesh.network_account_industry_classification`, `mesh.certification`, MESH bank/disclosure tables and NEON inbox/projection/acceptance tables | source profile and publications, disclosed bank versions, recipient processing/acceptance | Reuse governed disclosure and recipient acceptance. Never copy a MESH file ID into a NEON attachment FK. Transfer or reference it through an authorized disclosure path with source lineage and recipient-scoped retrieval. |

The former `document.business_partner_request` and its evidence/identifier/tax/classification/certification child tables are explicitly dropped in NEON `document/11_grants.sql:599–609`. They are not suitable targets for new work even though their original CREATE definitions remain in `03_tables.sql`.

## Supporting documents on each requested section

| Section | Recommended evidence types | Attachment subject | Sensible initial timing, configurable by tenant/role |
|---|---|---|---|
| Business registration identifiers | Business/commercial registration, registry extract, renewal | Exact identifier, including scheme, issuing country and authority | Collect at submission when tenant requires it; verify before applicable contract/commitment. |
| Tax registrations | Tax card, VAT registration certificate, exemption evidence | Exact tax registration; exemption evidence can support a separate applicability decision without inventing a tax number | Before the applicable tax/invoice operation, or earlier submission when required by customer policy. |
| Commodity and industry classifications | Brochure, product specification, company profile, category-specific capability evidence | Capability/classification row; company profile can also be partner-level and explicitly reused | Quotation/qualification for the relevant category. A company brochure is not automatically an authoritative industry-code confirmation. |
| Governance and ownership | Ownership chart, shareholder register, appointment/authorization document | Specific member/assertion, with explicit reuse of a chart across rows | Due diligence before the relevant contract/commitment, possibly submission for high-risk programs. |
| Certifications | Certificate, scope annex, renewal, translation | Exact certification, issuer/type, company/site scope and validity | Qualification/contract or before the certified activity starts; recheck at fulfilment. |
| Bank accounts | Bank-issued account confirmation, IBAN/account certificate, beneficiary authorization when applicable | Account identity and/or partner account link; acceptance further scoped by company/purpose | Before first outgoing payment/refund, or earlier if an advance/contract requires it. |

Use a section-level aggregate list for convenience, with **Supporting documents** under every row. Each item shows document type, file, issue/valid-until dates where meaningful, provided/scan/review status, requirement satisfied and reason if rejected. Offer Upload and Select existing authorized document. Required placeholders come from policy, so users do not have to guess which type to choose. File previews and downloads require the document’s own authorization, particularly for governance and banking.

A company profile can be optional partner-level evidence; linking it to a capability should not duplicate its binary. Reuse must be explicit and validated for type, subject, permitted scope and required version. One file may satisfy several requirements only if policy permits that reuse. Adding a file to a folder, or giving it the name “CR Card”, does not satisfy a requirement.

## Bank requirements — implementation design deferred

Bank supporting documents remain one of the six record-linked evidence requirements. Evidence must identify the account or partner-account relationship it supports; company/purpose acceptance remains distinct. Supplier payment and customer refund applicability must be resolved by the relevant role and operation.

The dedicated internal Bank review ledger, draft proposal/handoff and separate Bank policy-publication design is withdrawn. This recommendation no longer selects a new Bank table, capture section or release path. Preserve existing account, protected-value, MESH and company-use behavior while the replacement design is considered.

The [withdrawn audit and proposal](internal-bank-verification-updated-plan.md) remains available as history, not as the current implementation plan. The shared evidence contract should establish subject links, exact document versions and scoped assessment semantics before choosing any Bank-specific extensions.

## Flexible policy contract

The following are proposed requirement semantics, not existing property names claimed to be supported today.

| Property | Recommended behavior |
|---|---|
| Requirement identity | Stable key, localized label/help/message keys, schema version, policy definition/version/hash. |
| Scope | Tenant from session; authorized operating organization/company; optional program/category/risk scope. |
| Role | supplier, customer or explicitly both. Resolve from the server-validated request or business operation, not a UI toggle alone. |
| Geography | Independent partner registration country, issuing country/authority, tax jurisdiction, bank country and buyer legal-entity country where needed. Never infer these from language/timezone or a mailing address alone. |
| Entry mode | Maintain internally / Invite partner / Supplier self-registration controls collection actor and tasks. Equivalent acceptance requirements apply unless policy expressly differs. |
| Applicability | Bounded, typed predicates; match / no match / unknown. Unknown routes clarification or review, not an automatic waiver. |
| Subject selection | Identifier scheme, tax type/jurisdiction, commodity category, industry domain/code, governance role, certification type/site, bank purpose/company. |
| Cardinality | Distinguish “at least one applicable registration must exist” from “every applicable registration needs evidence.” Avoid vacuous success when no rows exist. |
| Evidence alternatives | All-of / any-of / minimum-count groups, accepted types and an explicit rule for original/translation or multiple-file bundles. |
| Data vs document | Require registration number, document, or both. Missing tax row and missing document are different findings. |
| Visibility | Hidden / optional / requested / required now, with future deadline hints. Detect and reject a published policy that hides a currently mandatory capture path. |
| Capture deadline | Named command/stage event such as request submission, quotation eligibility or contract approval. Save draft can remain incomplete. |
| Verification deadline | Independently configured point where submitted evidence must have an accepted review. |
| Validity | Optional/required issue and expiry dates; explicit no-expiry applicability; maximum document age; minimum remaining validity where relevant. Business validity is separate from file retention/cleanup expiry. |
| Verification | Authorized reviewer group, independence rules, required number/subject/country/scope checks, decision reason and exact file/subject versions. |
| Source and disclosure | Permitted internal/partner/external sources, recipient consent/scope, permissible cross-context reuse and revocation behavior. |
| File constraints | Permitted MIME types, number/size/page limits where supported, upload quotas and completed clean scan. Tenant options operate within platform limits. |
| Confidentiality | Document read/download roles, permitted previews/extraction, restricted original handling and retention class. Do not assume a masked number field masks a PDF. |
| Enforcement | Information / warning / block the named operation. Existing authorization, separation-of-duty and bank readiness controls remain independent. |
| Exceptions | Allowed reason codes, required justification/evidence, approving authority, scope, expiration and compensating requirements. Prohibit self-approval where configured or required. |
| Change handling | Re-evaluate on document replacement/expiry/revocation, subject changes, role addition, company-use change and policy activation. Policy rollout defines grandfathering/review tasks; no silent blanket grandfathering. |
| Messages | Message keys plus safe parameters, field/item targets, missing/expired/rejected/awaiting-review distinctions. |

Use named operations rather than treating stages as a single numeric sequence: invoice/payment/advance/refund paths may occur in different orders. Binding stage in Meta Entity is a policy execution hook, not by itself a procurement lifecycle stage. Map concrete commands to requirement evaluations explicitly.

### Role examples and merging

| Tenant / scope | Requested or operational role | Requirement |
|---|---|---|
| Tenant A / Qatar-registered partner | Supplier | CR Card and applicable Tax Card: required before submission, accepted before configured contract/commitment. |
| Tenant A / same partner | Customer | Optional at onboarding if configured; tax or refund operations can impose later requirements. |
| Tenant B / Saudi-registered partner | Supplier | CR Card and applicable VAT certificate: required before submission, accepted before the configured use. |
| Tenant B / same partner | Customer | Optional at onboarding if configured; later obligations remain operation-specific. |
| Any applicable company | Supplier payment or customer refund | Verified bank account and required accepted supporting evidence for that company/purpose. |

For partners with both roles, evaluate supplier operations against supplier requirements and customer operations against customer requirements. A customer-optional rule never cancels a supplier-mandatory rule. Reuse valid evidence across roles where permitted, but record separate acceptance/readiness for its operational scope. Foreign partners need explicit applicability handling; overseas registration does not prove that a local tax registration is inapplicable.

Resolve requirement sets deterministically. Keep non-overridable baseline controls; accumulate applicable requirements by stable key; allow narrower tenant/company/program overrides only for explicitly overridable requirements; reject ambiguous conflicts at publication. Collect all missing requirements rather than stopping after the first match. Existing policy evaluation supports first_match, accumulate and all, so select and test the appropriate mode.

Studio should provide a role/country/stage policy editor, a resolved-requirements preview and a test matrix for each tenant configuration. Policy-authoring permission is separate from ordinary onboarding permission. Shared certification types (`tenant_id IS NULL`) and tenant-specific types must both be resolved where authorized.

The current policy runtime accepts `allow`, `deny`, `warn`, `require_workflow`, `escalate`. It does not currently execute a `require_document` action. Recommended implementation: a typed requirement evaluator resolves requirements and derives readiness facts; existing policy actions enforce the relevant operation using those facts. New requirement vocabulary must be validated by authoring, compiler, API and UI together. Never publish unsupported action codes merely because action_config is JSON. Also, current policy evaluation can return permitted for no matching denial; the readiness adapter must explicitly handle missing/unknown requirement configuration at protected operations.

## Evidence associations, review and persistence

Use three explicit coordinates: **subject**, **file version**, **requirement/review context**.

1. Before canonical child rows exist, stage evidence against an authorized draft `document.entity_case` and a stable collection item key. Do not identify rows by array index or free-text section name. Upload should not force request submission.
2. Reuse `document.attachment` and `attachment_series` for bytes and versions. Persist association through `attachment_link`, with a validated evidence-link contract containing collection/item coordinate and document type. Generic JSON must be parsed and subject ownership checked, not trusted.
3. Record evidence assertions (type, issuer/issue/validity facts and source provenance) and each review against an exact attachment version/hash, subject facts hash/version, requirement key and policy version. Avoid a single global “verified document” boolean: the same file may be accepted for one use and rejected for another.
4. Reuse governed entity cases, snapshots and command evidence for review/exception decisions. A consistent typed evidence-assessment contract is needed; existing heterogeneous verified_at/by columns are not a complete reusable assessment model. If a normalized assessment table/projection is introduced for lifecycle querying, use one shared model for all sections with tenant-aware references, optimistic versions and append-only decision history. Its necessity should follow the typed contract and retrieval needs, not precede them.
5. At submission/decision, freeze an evidence manifest in the snapshot: subject item, requirement, file version/hash, accepted review and policy version. The current attachment command only records draft-case evidence; extending snapshot completeness and per-item coordinates is required.
6. On approval, materialize typed facts and link authorized evidence to the resulting canonical child IDs using existing case lineage. Preserve the original case links and pinned review versions. File-copy duplication is unnecessary within the same authorized tenant/storage context.
7. On replacement, preserve prior review; assess the new version. The current series pointer must not silently rewrite old approval evidence. Removing a child item removes that draft association and re-evaluates required records; it must not delete a file still referenced elsewhere.
8. At each protected operation, evaluate current facts, policy, expiry, revocation and acceptance; record a decision fingerprint and versions. Recheck within the command boundary so approval of stale evidence cannot authorize execution after a change.

Do not revive the retired request-evidence table. Do not store file bytes/base64 in business-partner JSON. Do not treat policy_evaluation_history as a substitute for a human review decision: the evaluation should reference that decision. Business evidence expiry, signed-URL expiry, storage retention and legal hold are separate concepts.

## Three collection modes

**Maintain internally:** the authorized steward can provide registrations, evidence and protected bank proposals without MESH. Internal review and company acceptance still apply.

**Invite partner:** send the resolved requirement checklist through the existing invitation workflow when explicitly initiated by an authorized user. Partner access is limited to its request/records and permitted files. No requirement configuration should itself send invitations or grant access.

**Supplier self-registration:** use the common evidence contract where the MESH form supports it, then disclose an exact source version to a named recipient. A reusable profile avoids repeated upload; each buyer resolves its own requirement policy and records its own acceptance. MESH file IDs and storage rights do not automatically exist in NEON. This needs an evidence disclosure/mapping extension where current profile envelopes omit documents.

## Delivery sequence and acceptance checks

1. Define a typed document-kind/requirement catalog and bind it through native Meta Entity authoring to existing versioned policies. Document kinds can reuse governed lookup catalogs where sufficient; richer per-kind attributes need a validated descriptor, not loose labels.
2. Design the reusable documents component and typed per-record/draft evidence manifest across the six sections. Reuse upload scanning, versioning, retention and authorization services. Bank capture and handoff architecture remain deferred; this step does not select the withdrawn proposal.
3. Define shared evidence review and exceptions with consistent versioned decisions. Resolve the Bank integration design separately; the withdrawn internal review-attempt sibling is not a prerequisite or selected implementation.
4. Enforce request submission first, then wire readiness to quotation, contract, commitment, fulfilment, invoice and payment/refund operations. Initial collection need not make all later stages mandatory.
5. Extend partner invitation/MESH disclosure flows after NEON collection and acceptance are proven, keeping the same requirement semantics and source/recipient separation.

Required regression cases: supplier mandatory versus customer optional; dual-role partner; domestic/foreign/local-tax combinations; zero required rows; every-row versus any-row evidence; missing versus rejected versus expired versus no-expiry documents; bundle alternatives; clean scanning versus review acceptance; file/subject replacement after approval; unauthorized attachment reuse; tenant/company isolation; role change before execution; MESH revocation/version change; independent bank verification and company acceptance; customer refund eligibility; expired exception; policy-version change; no matching policy; incomplete draft resume; idempotent uploads/materialization and preserved historical manifests.

## Principal source locations

- Common attachment model: `server/db/ddl/common/document/03_foundation_tables.sql:4`, `:29`, `:131`, `:383`, `:431`.
- NEON attachment integrity: `server/db/ddl/planes/neon/document/05_constraints.sql:41` and `:1618`.
- Profile section rows: `server/db/ddl/planes/neon/master/03_tables.sql:4513`, `:4565`, `:4607`, `:4650`, `:4681`, `:4957`.
- Bank identity/ownership: same file `:1261`, `:1364`; company-use rollout: `server/db/ddl/planes/neon/master/15_bank_account_company_usage.sql:2`.
- Supplier/MESH bank review: `server/db/ddl/planes/neon/document/03_tables.sql:5090` and `05_constraints.sql:1910`.
- Policy storage: `server/db/ddl/common/control/03_tables.sql:1220–1355`.
- Meta Entity policy bindings: `server/db/ddl/planes/studio/metadata/03_tables.sql:1063`, `:1080`.
- Current policy semantics: `server/packages/platform/policy/src/policy-service.ts`, `kysely-policy-repository.ts`, `policy-authoring-service.ts`.
- Governed case evidence: `server/db/ddl/common/document/03_tables.sql:50`, `:83`, `:102`; NEON `document/07_functions.sql:5574`.
- Retired request tables: `server/db/ddl/planes/neon/document/11_grants.sql:599–609`.
- Attachment runtime: `server/packages/services/attachments/src/attachment-lifecycle.ts`, `attachment-routes.ts`; owner-sensitive retrieval also in `server/packages/services/documents/src/kysely-document-repositories.ts`.
