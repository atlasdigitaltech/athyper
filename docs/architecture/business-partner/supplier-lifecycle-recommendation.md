# Supplier onboarding and lifecycle data recommendation

Prepared 13 September 2026. Recommendation only: no application, metadata, database or permission changes were made for this review.

Use one canonical organization partner, one governed intake workflow and three entry paths. Collect a small initial identity/address/contact set. Require additional information immediately before the business operation that needs it. A supplier can be suitable for quotation while still needing work before a purchase order or payment.

## Scope and evidence

The static scan covered all 435 SQL files under `server/db/ddl`: 749 CREATE TABLE definitions and 13,844 column declarations including explicit later additions. These are source-definition counts, not live deployed-table counts. Common, NEON, MESH and Studio DDL were included, with manifest membership recorded. Constraints, later additions/removals, key capability functions and references were inspected for the supplier lifecycle. Unrelated HR, platform, authentication, AI and ledger fields were inventoried and classified as domain-owned or system-owned; they are not supplier onboarding questions.

- [Complete DDL field inventory](supplier-lifecycle-ddl-field-inventory.csv): every extracted column, original SQL declaration, source location, manifest planes, build disposition, ownership and recommended timing.
- [Partner and transaction field matrix](supplier-lifecycle-partner-field-matrix.csv): filtered capability inventory for practical review, including system-managed columns and retired definitions explicitly marked as such.
- [Scan summary](supplier-lifecycle-ddl-scan-summary.json): counts and scope.

A NOT NULL constraint means a stored row needs a value. It does not mean an applicant must type it at initial registration. IDs, tenant scope, generated codes, status, hashes, audit identities, calculated amounts and approval evidence are supplied by authorized services. Optional child capabilities need no empty placeholder rows. The CSV provides recommended timing, not a new executable validation contract or proof that each field has an existing UI/API.

Important correction to the earlier recommendation: `document.business_partner_request` and its request-child tables appear in initial definitions but are removed in NEON `document/11_grants.sql:594–609`. Use `document.entity_case`, pinned immutable entity snapshots, command/materialization evidence and the current published entity contracts. Do not build a new intake around the retired request tables.

## Three entry paths, one internal acceptance model

| Entry path | Initial owner and scope | Completion | Acceptance |
|---|---|---|---|
| Maintain internally | Authorized employee creates the case in an authorized operating organization. Preselect only an unambiguous authorized scope. | Internal steward can maintain every applicable partner capability and evidence without MESH. | Authorized internal reviewer approves identity, role, qualification and company setup as separate decisions where required. |
| Invite partner | Employee initiates a scoped invitation with the intended organization and recipient email. Invitation must not require a completed address/profile first. | Recipient authenticates and completes the same minimal submission; optional enrichment can follow. Internal steward can take over if the invitation expires or collaboration stops. | Supplier-provided values are proposals; buyer checks duplicates, resolves differences and accepts the approved snapshot. |
| Supplier self-registration | Supplier initiates registration. A verified digital identity and authority to represent the organization must be established. Supplier selects a permitted buyer/program if applicable, not internal company permissions. | Supplier submits minimal profile and optional capabilities. Buyer intake owner routes it to an authorized operating organization and completes review. | Account creation, registration acceptance and buyer supplier activation are distinct. No automatic purchase/payment authority or buyer-company access. |

MESH already has `mesh.registration_exchange.intent_kind` values `buyer_request`, `supplier_self_registration` and `discovery_nomination`. Its participant account IDs are mandatory foreign keys: this is an exchange between existing network accounts, not by itself an anonymous public signup implementation. A supplier without an account needs an account-bootstrap/authentication path before that exchange. Confirm or implement that runtime path separately; DDL alone does not prove the UI exists.

Use existing invitation, account-link, publication, acceptance and entity-case capabilities. Entry method, profile-source preference and transaction eligibility must be separate concepts. A manually maintained external supplier remains `ownership_class = external`; an intercompany supplier derives from the legal-entity relationship, not from selecting “Maintain internally.” A supplier may switch to collaboration later without creating another partner.

## Minimal submission

| Field | Submission rule | Later handling |
|---|---|---|
| Operating organization / requested role | Internal context; supplier role fixed for supplier self-registration. Buyer resolves self-registration routing. | Company scope granted internally when needed. |
| Registered name | Required; canonical `master.business_partner.name`, maximum 320 characters. | Alternate names through aliases. MESH legal-name proposals map explicitly to this field. |
| Registration country | Required by recommended intake contract; searchable country reference. | Drives applicable identifier schemes. Distinct from address country. |
| Address country | Required for one primary address. Provide an explicit “Same as registration country” option. | Country-only remains incomplete/unverified for uses requiring a complete address. |
| Address lines, city/locality, region, postal code | Optional at initial submission. | Required by country, address purpose and the next operation; no globally mandatory postcode. |
| Primary contact name | Exactly one primary contact required at submission. | Job title, department, additional contacts and roles optional. |
| Contact channel | At least one usable email or phone for internal maintenance. Digital invitation/self-registration requires a verified recipient/applicant email; if this differs from the business contact, keep the distinction. | Purpose-specific ordering, delivery, billing and remittance contacts when necessary. |
| Business registration number | Optional initially unless the selected program explicitly requires it. | Complete and verify before first binding contract/commitment when the applicable policy requires it. |
| Description | Optional. | Profile maintenance. |

Automatically mark the first address/contact as primary. Keep “Additional details” expandable so users with complete information can enter it once. A business contact does not automatically receive a principal/login or an invitation. Keep role defaults, ownership determination and qualification-policy selection out of the ordinary applicant form.

**Address compatibility gap:** common `master.address` allows nullable lines/city and a country-only row, but `mesh.network_account_profile_address` requires `address_line1` and `locality` and only supports active/inactive profile rows. The initial country-only proposal must remain in the governed draft and not materialize into that MESH table until complete. If a published MESH country-only address is desired, explicitly revise its schema, payload contract and validation together. Never use dummy street/city values. Address normalization must not merge unrelated suppliers merely because their incomplete addresses have the same country.

## Recommended stage gates

“Required” below always means applicable to the country, company, role, commodity, transaction type, value and risk policy. Configuration must distinguish unknown, not applicable, pending verification and approved exception. These are not equivalent to an empty string.

| Stage | Information needed before the gated action | Owner / DDL capabilities | What can wait |
|---|---|---|---|
| Registration / intake | Minimal submission, authenticated authority where digital, duplicate review and internal routing. | Entity case/snapshots, partner identity, address/contact capabilities, invitation or MESH exchange. | Bank, tax where not needed yet, governance detail, catalog, finance defaults. |
| Quotation | Accepted identity sufficient for sourcing; reachable contact; permitted operating organization/role; relevant commodity capability for category-specific events; applicable operation blocks and early qualification checks. Quote currency, quantities, prices, response validity and evidence belong to the response/event. | Buyer; `document.sourcing_event*`, supplier role, organization assignment, qualification/block controls and response snapshots. | Bank account and complete company finance profile. Full address unless necessary for quote/tax/shipping or binding terms. |
| Contract | Verified contracting identity and applicable registration identifiers; proper contracting/notice address and contact authority; required governance facts, risk review, certifications and qualification; approved scope, term, currency and commercial/payment terms. | Legal/procurement/compliance; identifiers, governance, risk, certifications, terms and attachments. SOW/work-order revisions have terms/evidence fields. | Routine bank details unless contract entails an advance or requires beneficiary validation now. |
| Commitment | Authorized supplier and operating-organization/company scope; qualification valid for the purchase; agreed currency/terms; applicable tax, buying policy, account/dimension setup where needed for encumbrance/posting; purpose-specific order addresses and delivery schedule. | Buyer and finance; `document.commitment*`, `master.company_code_supplier_profile`, organization assignment, classification, pricing and schedules. | Bank details for an ordinary later-pay purchase order, unless current activation policy requires them and is deliberately revised. |
| Fulfilment | Complete ship-from/ship-to or service-location details where used; delivery/operational contact; valid site/service certifications; confirmed quantities/dates, receipt/inspection or service acceptance evidence. | Logistics/service approver; confirmation, delivery, receipt, service-sheet and workforce tables. | Payment-specific data if no payment is due. Services need no invented warehouse or shipping address. |
| Invoice | Invoice identity/number/date/currency; required bill-from/bill-to address facts; tax registrations/jurisdictions/type and withholding treatment where applicable; company accounting profile/dimensions; purchase/receipt/service matching or authorized non-PO path; payment terms and calculated due/retention/advance balances. | Accounts payable/tax; purchase invoice/lines, tax tables, match cases, accounting distribution, term applications. | Missing beneficiary details can block payment while invoice receipt and, where otherwise valid, liability posting proceed. |
| Payment | Approved payable/advance, authorized payment method, resolved blocks, current beneficiary verification and company/purpose acceptance for bank-based methods, current required disclosure, remittance contact, payment execution and treasury approval. | Treasury; bank account/link/usage/company usage, verification, payment entry/allocation, execution profile and remittance output. | Nothing required for the chosen payment rail may be deferred beyond release. |

Evaluate **the operation**, not a fixed screen sequence. If there is no separate contract, perform its applicable identity/qualification checks at the first binding purchase order. An award that is binding must meet binding-transaction requirements. An advance payment triggers payment checks before fulfilment or invoice. Do not claim that procurement quotation is `document.sales_quotation`: that table belongs to the customer/sales path. Procurement has sourcing-event/award structures and response snapshots; a richer quote-response model must be explicitly designed if those are insufficient.

No dedicated general `document.contract` table was found in the scan. Generic commitments exist, plus SOW/work-order and intercompany agreement models. The commercial contract stage is a recommended business gate, not a claim that a full general contract-management schema already exists. Signed documents can use governed attachments/evidence; structured legal terms/signatory requirements beyond existing models need an explicit contract design rather than arbitrary BP metadata.

## All nine Business Partner tables

All columns, including audit/system fields, are in the matrix. This is the business-field disposition:

| Table | Business fields and meaning | Capture / require |
|---|---|---|
| `master.business_partner` | `name`, `registration_country_code`, `description`; optional `legal_classification`, `legal_form`, `incorporation_date`, `website_url`; `parent_business_partner_id`; internal identity coordinates `canonical_party_id`, `representation_purpose_code`, `code`, `partner_category`, `ownership_class`. `aliases` is a derived cache. | Name/countries at intake; optional enrichment later; legal details before binding transaction if needed. Identity correlation/ownership/parentage by internal governance. |
| `master.business_partner_alias` | `alias_kind`, `alias_name`, `language_code`, `country_code`, effective dates, `is_primary`, `source_system`; `normalized_alias` generated. | Optional intake/completion or when name changes. DDL kinds are legal/trading/former/search; translation uses name + language, not an invented translation enum. |
| `master.business_partner_identifier` | `scheme_code`, `identifier_value`, `issuing_authority`, `issuing_country_code`, `issued_at`, `effective_until`, `is_primary`, verification pair. | Capture early; require/verify for applicable contracting identity. Maintain multiple schemes/countries and effective history. |
| `master.business_partner_tax_registration` | `jurisdiction_id`, optional `tax_type_id`, `registration_type_code`, `registration_number`, effective dates, primary and verification. | Tax determination when used, no later than relevant invoice posting; earlier for tax-sensitive quotations/orders. |
| `master.business_partner_commodity_capability` | `commodity_category_id`, `partner_role`, effective dates, notes. | Quotation for category matching/qualification, otherwise profile completion. |
| `master.business_partner_industry_classification` | `industry_domain_code`, `industry_code_id`, `assignment_kind`, primary, confidence, effective dates, verification and source reference/system. | Optional enrichment or qualification/contract policy. Only ISIC/NAICS domains currently supported. |
| `master.business_partner_governance_relation` | `relation_type_code`, `member_name`, `member_type`, optional linked organization, country/title, ownership/voting/beneficial percentages, appointment/end dates, notes. | Due diligence before applicable contract/award; not universally mandatory. An individual governance member does not reintroduce person-type Business Partners. |
| `master.business_partner_relationship` | Source/target partners, `relationship_type_code`, country, effective dates, notes. | When a real relationship is needed; verify before relying on parent/group/related-party classification. |
| `master.business_partner_operating_organization_assignment` | Partner, operating organization, `partner_role`, effective dates. | Internal acceptance and scoped sourcing/commitment. Never self-granted by supplier. |

## Related field groups and ownership

- **Addresses:** simple lines/city/region/postcode plus structured street/building/unit/floor/room, PO-box and delivery-service variants, country, timezone and geolocation. Capture only the applicable address variant. Links own purpose, role qualifier, primary/effective dates, attention line and usage restrictions. Formatting, hashes, validation/provider/confidence and events are service evidence. Shipping, registered, billing and remittance addresses need not be the same.
- **Contacts:** name/title/department and contact roles; channel value/type/purpose/role qualifier, primary/effective dates; email delivery/MX/bounce and phone carrier/type extensions. Verification is service-owned. Optional contact-to-person identity link does not create a worker, login or buyer authorization.
- **Supplier/customer roles:** role code/type and status are separate from organization identity. Supplier type is internally classified; qualification type resolves from policy. Customer company statements and credit reviews are customer-specific, not supplier questions.
- **Company finance:** currency and payment terms before commitment; default accounting profile/dimension set before the first posting that needs them; preferred remittance bank link only after company acceptance. Company setup is internal even in supplier self-service. Payment-term clauses cover advances, recoveries, retention/releases and discounts; capture commercial agreement before evaluating due amounts.
- **Banking:** holder, identifier/type, bank/branch or approved provisional reference, currency, BIC/country overrides and correspondent details as applicable. Protected capture and last-four display use the existing protection contract. Links own purpose, effective dates and beneficiary relationship. `bank_account_usage` controls permitted scope; `bank_account_company_usage` records company/purpose acceptance and pinned disclosure evidence. Buyer house-bank GL/usage/file/reconciliation fields are internal treasury setup. `bank_account_company_ready` explicitly checks verification, active state, effective usage and current MESH disclosure where applicable; availability alone is insufficient.
- **Qualification/risk:** scope, commodity, type, effective/review dates, conditions and evidence; review/approval decisions, risk model scores, overrides, mitigations, preferred-supplier status and blocks remain internal. Supplier can provide documents/facts, not set its own approval or risk score. Recheck scoped blocks and expiring evidence at the relevant operation.
- **Certifications:** type/custom name, certificate number, issuer/location, extra information, attachment, validity and company/site where applicable. Ask only for certificates relevant to the work/commodity/site. Related certification-type catalogs are configuration.
- **Transactions:** quantities, prices, delivery tolerance, dates, schedules, locations, address snapshots, tax bases/groups, match results, receipt/acceptance, invoice amounts, allocations, payment references and reconciliation are owned by their business documents. Do not copy them into partner metadata. Reuse approved defaults and snapshot the values applied to the document.
- **MESH:** network identity/profile, identifiers, address, classifications, capabilities, tax, certification and bank source records are supplier-managed assertions. Network relationship/capability approval, publication field sets/versions, recipient scope, disclosures, inboxes/projections, match/acceptance and change-resolution evidence determine what each buyer can use. MESH `legal_name`/`display_name` still exist independently; NEON remains single-name with explicit mapping and aliases. Profile completeness percentage is informational, not transaction authorization.
- **Platform fields:** IDs, tenant/owner coordinates, status/version, audit columns, tokens/hashes, publication/contract versions, deduplication keys, materialization IDs and lifecycle events are system-managed. Common country/industry/bank directories, tax policy, accounting dimensions, numbering, approval policy and metadata definitions are centrally administered and referenced.

## Country-based registration and metadata contract

Reference a governed scheme catalog using registration country, issuing country/authority and scheme. Resolve the sole applicable scheme automatically; show Registration type when more than one genuinely applies. Provide localized label/help/example and scheme-specific normalization/validation. Preserve leading zeros; validate format separately from verification. On country change, mark an entered identifier for review rather than silently assigning it a new meaning. Check duplicate country + scheme + normalized value, then review candidates; do not assume an identifier is globally unique without its authority/scheme context.

The DDL has country and lookup/reference capabilities and an identifier `scheme_code`, but this review did not establish a complete published country-to-registration-rule catalog. Treat that catalog, exact validation rules and fallback governance as implementation work. Do not invent local legal formats. Where a registration identifier is legitimately inapplicable, use an approved applicability decision/evidence; where it is merely unknown, retain a completion task. A missing country configuration should permit draft work and route review, not silently waive a binding-stage requirement.

Recommend a versioned entity policy with field/component visibility, capture stage, required-before operation, applicability predicates, authoritative defaults, allowed source/actor, message keys, evidence and verification requirements, expiry/review rules and exception authority. `metadata.entity_field` already has default/computation/validation specifications, and entity contracts/cases carry pinned release/hash coordinates. The full lifecycle requirement model is a proposal; those exact new property names are not claimed to exist. Keep global DDL requirements for true storage invariants and publish stage-specific rules through the contract to both UI and API.

Readiness should return the requested operation and scope, eligible/not-ready/blocked outcome, missing fields/evidence, reason/message keys, responsible owner, expiry and evaluated policy/version/fingerprint. Show “Ready for quotation” and “Payment: bank acceptance pending” independently. Do not add seven mutable booleans or a single all-purpose completion percentage to BP. Assess current state at each sensitive operation and record the decision used, including source version. UI hints never substitute for server authorization or validation.

## Scenario coverage

| Scenario | Handling |
|---|---|
| No MESH or partner never responds | Internal maintainer completes all needed capabilities and evidence; no permanent dependency on an invitation. |
| New supplier self-registers but duplicates an existing partner | Review and link to existing identity/role; do not auto-merge by name/email or expose unrelated buyer data. |
| Existing supplier enters a second company or commodity | Reuse identity; approve new scoped assignment, qualification/company profile and beneficiary usage only where required. |
| Direct PO, no separate sourcing/contract | Run applicable identity/qualification/contract checks at first binding commitment. |
| Advance/deposit before invoice | Run payment gate now; record advance/term application and later recovery. |
| Non-PO invoice / emergency purchase | Capture invoice; use explicit exception/approval authority and matching path. Do not bypass tax/payment controls. |
| Services, digital goods or workforce supplier | Use service location and acceptance; require no fictitious goods shipment. Worker identity, access, rates and timesheets stay in workforce records. |
| Intercompany | Derive from governed legal entity/internal partner and trading-pair/agreement setup; no supplier portal requirement. |
| Multiple addresses, tax registrations, banks/currencies | Use purpose, jurisdiction, scheme, company, currency and effective dates; one primary only in the relevant scope. |
| Cash/card/other non-bank method | Require the selected method's settlement data, not universally a supplier bank account; still enforce approvals and holds. |
| Registration number unknown or inapplicable | Draft allowed according to program; distinguish pending completion from approved inapplicability before dependent operation. |
| Changed name, bank, tax status, address or expired certificate | Governed amendment; rerun affected gates. Bank change requires new/current verification and company acceptance, not silent publication overwrite. Preserve prior document snapshots. |
| Revoked MESH relationship/disclosure | Stop relying on revoked external authority/data for operations that require it. Internal maintenance may continue under its own authorized evidence; never treat a cached bank disclosure as current. |
| Closed/rejected/cancelled registration, withdrawn invitation, reapplication | Keep case evidence and explicit recovery/reapplication path; no activation from stale invitation tokens. |
| Customer or dual-role partner | Reuse identity/contacts/aliases; apply sales and credit rules to customer scope separately from supplier qualification and remittance. |

## Recommended implementation sequence

1. Publish the minimal shared intake for all three paths; maintain separate registration and address countries, one primary contact, optional address details and coherent internal routing.
2. Resolve the MESH partial-address mismatch, snapshot/source mappings and current entity-case materializers before relaxing UI validation. Confirm public-account bootstrap and supplier representation verification.
3. Define country identifier schemes and the operation/stage requirement catalog with procurement, compliance and finance. Record approved applicability and exception decisions through governed evidence.
4. Reuse and extend scoped eligibility/qualification/block/company-bank acceptance capabilities. Review current activation checks explicitly so changing quotation eligibility does not accidentally weaken commitment or payment checks.
5. Add the completion/readiness view in internal NEON and the permitted profile tasks in MESH. Keep internal completion available throughout; publish supplier changes as proposals with field-level acceptance/conflict review.
6. Validate three entry paths plus skip-stage, advance-payment, multi-company, non-PO, intercompany, services/workforce, expired evidence and changed-bank scenarios. Test API enforcement, scope isolation, duplicate handling, replay/concurrency, accessibility and pinned policy versions.

This recommendation establishes the target data-collection and decision model. Schema presence is evidence of storage capability, not proof of live end-to-end workflow support. No migration or activation is recommended until the specific contract, materializer and API gaps above have been resolved in a concrete implementation plan.
