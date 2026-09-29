# Business Partner facts — DDL and MetaEntity implementation plan

> **Historical.** Written before commit `870f08f52` removed the bespoke Business Partner and workforce applications. Routes, packages and files named here may no longer exist, and de-linked paths were dead when this was cleaned up. New entity work goes through the shared Entity Framework ([onboarding guide](../../runbooks/meta-entity-onboarding.md)); do not treat this as current instruction.

Date: 2026-09-24. Status: detailed target plan for review; not an implementation or DEV acceptance receipt.

Audit clarification revision: existing deferred-trigger reuse, dated UI observations, mandatory P01 person-link cardinality decision and exact contact/person-link cardinality. These clarify implementation gates without changing storage or adding tables.

Scope: organization/person identity, shared partner collections and bank-account instruments. Qualification, restriction, operational setup and transaction eligibility remain separate work. No new request, evidence, revision or contact-assignment table family is introduced. Existing attachment/history services are reused. The plan itself does not execute changes; the authorized implementation checkpoint below records what was actually applied.

## Implementation checkpoint — 2026-09-25

- Same DEV rebuilt with `node tooling/scripts/local-dev/rebuild-main-dev.mjs --confirm-replace-dev-no-backup`. The three DEV application databases were replaced; IAM and Infisical were preserved. No backup or isolated instance was created. Clean-install foundation passed. The rebuild helper now restores each plane's database settings before building.
- Tenant access/runtime IAM bindings restored with `pnpm exec tsx tooling/scripts/local-dev/seed-main-dev.mts --confirm-main-dev`; existing scoped BP and CATL collaboration/archive seed scripts reapplied. No sensitive person/workforce permission was added.
- `node tooling/fixtures/business-partner-core/seed.mjs --apply --confirm=LOCAL-BP-CORE-SEED` creates independent organization and person demos for Athyper, Technostat and CATL, reusing the existing shared collections/instrument model. CATL direct-commodity examples were restored.
- P01 cardinality decision: one non-archived partner per `(tenant_id, person_id, representation_purpose_code)`. Duplicate default representation fails uniqueness; distinct explicit purposes remain possible. Person reference/category are immutable ordinary identity fields. People ownership remains unchanged; the partner projection reads only authorized names/code, not sensitive or workforce data.
- Person DDL shape/FK/uniqueness and organization zero-or-one subtype checks pass transactionally on the rebuilt schema. Existing category-only constraints were deliberately replaced. The separate person registration path does not reinterpret legacy organization payloads.
- Signed metadata activated: source release `d34cc020-c673-4bbb-a172-63749189069b`, applied release `01a0d434-c4db-7e4f-9893-23268a07565f`, 118 artifacts. CATL preview revision 6 is active. Overview/Identity bindings are separate, legal-form labels are resolved, and presentation category facets are evaluated from authorized values.
- `node tooling/scripts/verification/verify-partner-person.live.mjs` passed: nine section APIs for both categories, cross-tenant denial, signed-in organization/person Identity pages with the other category's fields absent. Banking capture/replay/masking and restriction action checks pass the existing rollback repository acceptance in all three demo tenants.
- One contact/two-address billing responsibilities are reseeded through existing `contact_person_role`; contacts expose authorized address associations and addresses expose reverse contact lists only with contact-read authority. This proves the read wiring, not completion of every capture form.
- After normal MFA refresh for both actors, signed-in organization case `02cf7222-6439-4e2c-9a60-32036d916acf` and person case `c2b9db50-f63c-48c0-a1d2-4c9bd8f21b97` both passed creation, validation, submission, independent owner approval, materialization and idempotent retry. Organization result: `01a0d446-3738-7cf5-9fe4-0ff0e710d55f` / `BP-DEMO-REG-001`; person result: `01a0d446-3b97-7b00-930e-83a2a38746d1` / `BP-DEMO-REG-PERSON-001`. Database checks confirm exactly one organization subtype versus no organization subtype plus the required person reference. No role/company/organization assignment was created. No session, approval or MFA evidence was fabricated.
- The registration form offers organization/person capture under the separate person permission; five component tests include person payload isolation and denial of the person option without that permission. API workflow acceptance uses the reusable script with `--run` and `--run --person`; this is distinct from manual browser interaction through every review stage.
- **Not a declaration that P01–P07 are all complete:** contact/address responsibility capture and remaining collection capture forms need completion/acceptance. In particular, `master-data-authority.ts` still requires a unique operating-organization assignment and a legacy header-bound update descriptor for the generic contact/address writer. That must be aligned with tenant-level fact capture and its published operation permissions before exposing the forms; do not grant blanket access or silently bypass the guard. Existing readable demos do not prove every write journey. No second rebuild is required solely for those UI/consumer follow-ups.

Related authorities: [table-set addendum](business-partner-data-model-cleanup-addendum.md), [identity writer contract](business-partner-identity-field-writer-contract.md), [access model](partner-access-model.md), [deployment checkpoints](business-partner-coordinated-implementation.md). This plan refines the partner-facts slice, not the commercial-decision model. Conflicting older identity proposals must be reconciled in implementation; they must not silently override this plan.

### View-mode label correction — 2026-09-25

- Section and collection fields resolve their own pinned `coreRef`; matching a field name on the partner header is not sufficient. Published `display.lookup.options` defines sealed enum labels, while `display.lookup.code` resolves existing tenant/platform catalogs. Classification scheme names come from `shared.classification_scheme`, not a component acronym map.
- Labels are carried through the section response, browser parser and generic field/collection renderer, including nested channels/responsibilities. Header status and declared summary fields are metadata-driven. Unknown non-null enum values produce an explicit label-resolution error, never automatic title casing or raw-code substitution. Null values remain empty; classification codes, source-system identifiers and source references remain their actual values.
- Contact/address display DTO keys now have explicit presentation bindings. Identifier and tax DTOs are grouped separately and retain masked values. Banking uses instrument lifecycle labels; catalog-backed certification types and resolved bank-directory references display names. Redundant owner/instrument UUID columns and raw certificate attachment/company UUID columns are not normal business-display fields.
- Applied to the existing DEV by signed successor publication, without a database reset, new instance, new table or grant change. Latest source release: `595b46bf-80d7-414f-b410-e183dc0e1634`; applied release: `01a0d467-03f4-75f4-8bcd-ae6b952989c2`.
- Acceptance entry point: `node tooling/scripts/verification/verify-partner-display-labels.live.mjs` (optional `--person` for the individual demo). It validates populated enum mappings and signed-in rendering in all nine existing 360 sections. This is view-mode acceptance, not capture-mode completion or a claim that every possible future catalog value has been exercised.
- Verification disposition: all nine section APIs for both demos pass the populated-label audit; 12 section-service tests, the enum-rendering/no-code-fallback component test and affected package type checks pass. Browser checks through Banking pass for both demos; fresh Certificates pages and the enabled desktop Summary view were inspected successfully. The complete repeated-navigation browser batch still intermittently times out before the header appears, so it is **not recorded as a clean end-to-end batch pass**. Inbox/notification descriptor errors also remain outside this field-label change; no unrelated permissions were broadened.

## 1. Current source versus target

| Area | Inspected source | Remaining work |
| --- | --- | --- |
| Organization identity | Table exists, organization fields are separated, deferred exactly-one constraint exists | Preserve; improve labels and presentation rather than recreate |
| Person partner | Domain and CHECK still restrict partners to organizations; no partner person_id | Deliberately lift organization-only rule, add reference, coordinate person ownership/privacy, writers and reads |
| Contact address responsibilities | Common contact_person_role already has address_link_id and same-owner validation | Verify all writers, readers, metadata and reverse address views; do not add assignment table |
| Payment instruments | payment_instrument and generic payment_instrument_link already exist; bank subtype shares instrument ID | Complete protected capture/read/UI coverage; preserve generic treasury owners |
| Provisional branch | submitted_branch_name already exists | Verify address-owner support, capture and display end to end |
| Commodity facts | 29 defines classifications; 31 adds direct commodity_code_id and category/code exclusivity | Use direct UNSPSC in new demos; retain explicitly labeled legacy category facts without fabricated declarations |
| UI | Screenshots show repeated Overview/Identity, raw UUIDs, generic field names, legacy commodity example | Replace presentation duplication with intentional field sets and typed projections |

The user's NEW/EXTEND labels describe the target design's origin, not necessarily outstanding physical DDL. Existing tables are not added again.

Current UI observations are confirmed by the user-supplied 2026-09-24 screenshots: Overview and Identity repeat the common/legal identity fields; Legal Form displays a UUID; Commodities shows blank declared commodity/UNSPSC fields alongside a populated legacy category; Relationships/Governance summary cards show “State: ready / Value: Available” rather than business detail. These establish presentation gaps, not proof that the underlying relationship/governance tables are empty. They are dated observations, not a fresh live acceptance run.

## 2. Complete in-scope table set

All master tables below retain their existing audit/lifecycle fields where present; the field lists identify business capture and linkage, not a replacement CREATE TABLE script that drops unlisted controls.

| Table | Decision | Business fields / linkage |
| --- | --- | --- |
| master.business_partner | Extend | Common identity, person_id, category, ownership/legal classification, lifecycle; see §3 |
| master.business_partner_organization_identity | Keep | Organization identity and profile; see §3 |
| master.person | Reuse | Authorized personal names; no new person subtype table |
| master.business_partner_alias | Keep | tenant_id, business_partner_id, alias_kind, alias_name, generated normalized_alias, language_code, country_code, is_primary, effective_from/until, source_system, status |
| master.business_partner_relationship | Keep | tenant_id, source_business_partner_id, target_business_partner_id, relationship_type_code, country_code, effective_from/until, notes, status, record_version |
| master.business_partner_governance_relation | Keep | business_partner_id, relation_type_code, member_name/type, optional member_business_partner_id, member_country_code, business_title, ownership_pct, voting_pct, beneficial_ownership_pct, appointed_date, end_of_term, notes, status |
| master.contact_person | Reuse common table | tenant_id, owner_type_id/owner_id, contact_name, business_title, department_name, is_primary, status |
| master.contact_person_role | Reuse existing extension | contact_person_id, nullable address_link_id, role_code, effective_from/until, is_primary |
| master.contact_person_identity_link | Reuse optional link | tenant_id, contact_person_id, person_id, link_type, effective_from/until; preserve PRIMARY KEY (tenant_id, contact_person_id): at most one identity-link row per contact in a tenant, not a many-to-many link keyed by person_id |
| master.contact_link | Reuse | tenant_id, owner_type_id/owner_id, channel_type, value, purpose, role_qualifier, is_primary, effective_from/until, status; retain existing channel verification controls |
| master.contact_email | Reuse subtype | contact_link_id, tenant_id, disposable/MX/bounce attributes; email value remains in contact_link |
| master.contact_phone | Reuse subtype | contact_link_id, tenant_id, carrier_hint, line_type; telephone value remains in contact_link |
| master.address_link | Reuse | tenant_id, owner_type_id/owner_id, address_id, purpose, role_qualifier, attention_line, is_primary, effective_from/until, existing usage status controls |
| master.address | Reuse | Structured street/building/unit components, line1/2/3, city/dependent locality, region/state, postal code, country and existing alternate address-kind/validation fields |
| master.business_partner_identifier | Keep protected | business_partner_id, scheme_code, identifier_value through protected writer, issuing_authority/country, issued_at, effective_until, is_primary, existing verification/lifecycle fields |
| master.business_partner_tax_registration | Keep protected | business_partner_id, jurisdiction_id, tax_type_id, registration_type_code, protected registration_number, effective_from/until, is_primary, existing verification/lifecycle fields |
| master.business_partner_industry_classification | Keep | business_partner_id, industry_domain_code, industry_code_id, assignment_kind, is_primary, confidence, effective_from/until, source_system/reference, verified_at/by, status |
| master.business_partner_commodity_classification | Keep | business_partner_id, commodity_code_id for direct UNSPSC OR legacy commodity_category_id, assignment_kind, dates, source_system/reference, notes, verified_at/by, status, record_version |
| master.certification | Reuse generic owner | tenant_id, owner_type/owner_id, certification_type_id or custom_name, certificate_number, certified_by/location, additional_info, document_attachment_id, effective_from/until, status; existing company/site columns are not required for partner facts |
| master.certification_type | Reuse reference | Existing certificate type catalog; render readable type rather than UUID |
| master.payment_instrument_link | Keep generic | tenant_id, owner_type_id/owner_type/owner_id, payment_instrument_id, relationship_role, purpose, is_primary, effective_from/until, optional company_code_id |
| master.payment_instrument | Keep | tenant_id, id, instrument_type_code, optional code/name, status, record_version, lifecycle/audit fields |
| master.bank_account | Keep subtype | id shared with instrument, tenant_id, institution/branch OR provisional reference, account_holder_name, account_id_type/value, account_last4, currency_code, bic_override, account_nature, provider_account_ref, correspondent institution |
| master.bank_provisional_reference | Keep | tenant_id, submitted_name/country/bic/branch_name, status, resolved_institution_id/resolved_branch_id |

Supporting reference authorities are reused, not copied per partner: control.lookup_value (legal form/business type), shared.country, existing identifier/tax catalogs, industry and commodity code/hierarchy/crosswalk catalogs, tenant commodity categories and mappings, contact role/owner registries, and shared.bank_institution, shared.bank_branch, shared.bank_identifier. They are reference dependencies, not partner declarations.

No bank_account_usage, bank_account_company_usage, bank_account_link or business_partner_bank_verification is reintroduced. Existing bank_account_house_config and bank_account_house_payment_method remain treasury-owned adjacent setup, not partner forms.

Future only: master.payment_card, master.payment_wallet and master.payment_crypto_address. Do not create empty tables or enable their instrument types in this slice. Cash is a tenant payment-method option with no partner instrument row. Future provider-backed types must retain type-specific protection and tenant enablement; this plan does not implement that configuration.

## 3. Identity field contract

### 3.1 Common header

| Fields | Storage / behavior |
| --- | --- |
| id, tenant_id, code | Existing keys and tenant-local code constraints |
| name | Partner display label; not a second editable legal name or set of personal names |
| partner_category | organization or person after cutover; retain category locking |
| person_id | NEW nullable UUID; required for person, forbidden for organization |
| ownership_class | Keep internal/external on header; not public/private organization ownership structure |
| legal_classification | Keep nullable on header; target UI/DDL combination: organization government/nonprofit/NULL, person sole_proprietor/NULL |
| website_url, description | Common optional fields, retaining current validation |
| status, is_active, status_changed_at/by | Existing partner lifecycle; is_active remains generated |
| record_version, category_locked_at/by | Existing aggregate concurrency and category controls |
| canonical_party_id, representation_purpose_code | Preserve existing linking/purpose authority and uniqueness; neither substitutes for person_id |
| metadata, created_at/by, updated_at/by | Existing technical fields; metadata is not a shadow identity store |

Legal classification is an application classification rule, not a universal legal assertion. The person-only sole_proprietor choice tightens the older writer contract, which allowed it for both categories. Inventory existing values and dependents before enabling this CHECK; do not silently recategorize partners. Reconcile that older contract as part of P01.

### 3.2 Organization identity

Retain business_partner_id (primary key), tenant_id, legal_name, legal_form_value_id, registration_country_code, incorporation_date, business_type_value_id, founded_year, employee_count, employee_count_as_of, employee_count_scope and existing audit fields. All are already in organization identity, not pending header moves. Employee count/date/scope must be all present or all absent; count scope stays organization/consolidated_group. Legal form and business type are lookup IDs in storage and labels in the UI.

### 3.3 Person reference and ownership

Reuse master.person: id, tenant_id, code, name, first_name, middle_name, last_name, display_name and preferred_name. Other existing person fields remain owned by the person subsystem. Partner Identity exposes only authorized names and a readable person reference; person_number, personal contact details and sensitive-profile data are not automatically included. Do not reinterpret person.country_code as nationality or organization registration country.

Person primary_email/primary_phone are not a new authority for partner business channels. No automatic copying or bidirectional synchronization. Person status remains separate from partner status. Linking a person creates no workforce employment or application principal.

Retain existing first/last-name constraints for this slice; do not fabricate a surname for a single-name individual. Supporting that case requires a separately agreed change to the shared person naming contract. Search/link only persons the operator is authorized to discover; absence of permission must not reveal their existence. If none exists, use the authorized person creation service followed by partner linkage, not unrestricted generic person inserts.

### 3.4 Integrity and deletion

Target row-level shape:

```sql
CHECK (
  (partner_category = 'organization' AND person_id IS NULL)
  OR (partner_category = 'person' AND person_id IS NOT NULL)
)
FOREIGN KEY (tenant_id, person_id)
  REFERENCES master.person (tenant_id, id) ON DELETE RESTRICT
```

Widen business_partner_category_d and remove business_partner_organization_only_chk explicitly. Update the sealed-domain and People/Workforce comments: this deliberately changes organization-only partner support, not person-data ownership. Reuse master.trg_check_partner_organization_identity and its existing deferred trigger pair: business_partner_organization_identity_required on the partner header and business_partner_organization_identity_consistent on the organization identity table. No new person-side cross-table trigger is required: the existing `(category='organization') IS DISTINCT FROM present` predicate already rejects both a missing organization subtype and a subtype attached to a person. The subtype primary key enforces at most one row; the deferred existence check enforces the required one or zero. The new header CHECK and composite person FK separately enforce the person reference.

Retain commit-time checks and parent-row locking, and review the immediate organization guard/FK ordering with the writers. Deferred existence validation does not by itself make child-before-parent insertion valid: the supported creation path is parent then subtype in one transaction unless every relevant immediate guard/FK explicitly supports another order. Reject subtype reparenting/key changes, or validate both old and new parents if any existing authorized path supports them. Do not use row CHECKs for cross-table existence.

Retain existing canonical-party/representation uniqueness. Do not add UNIQUE(person_id) blindly: P01 must test whether multiple permitted representations of the same person already exist in the canonical-party contract and document the chosen deduplication boundary. Never merge persons by name alone. Category and person reference changes require explicit controlled handling, not a normal category dropdown or silent reassignment of historical collections.

P01 must deliver an explicit person-to-partner cardinality decision before P02 starts: either at most one partner per tenant/person, or multiple representations under a named representation-purpose rule. Record the permitted examples, duplicate examples, exact tenant-scoped unique/index key (if required), conflict handling, and interaction with canonical_party_id/representation_purpose_code. Inspect both existing constraints and intended writer semantics; the current organization-only database cannot prove the absence of future person-representation requirements. The composite FK is required in either option and does not itself choose one-to-one versus one-to-many. Test the selected uniqueness rule under concurrent creation, not just sequential fixture inserts.

## 4. Shared-collection integrity and capture

### 4.1 Names, relationships and ownership

Aliases belong to the partner, not separately to each subtype. The authoritative current organization legal name remains in organization identity; a legal alias must not become a competing editable current name. Reuse generated alias normalization and temporal/primary controls.

Relationships resolve both partner endpoints in the same tenant, reject forbidden self-relations, and retain type-specific cycle/cardinality rules. Do not restore a second editable parent_business_partner_id on the header. Governance relation percentages stay bounded 0–100; individual category does not imply that corporate board/shareholder fields apply. The same section can show applicable relationships or a meaningful not-applicable/empty state without creating an organization identity.

### 4.2 Contacts, channels and addresses

```text
Partner → named contact Alex (contact_person; owner = partner)
        → Headquarters (address_link → address)
        → Warehouse (address_link → address)

Alex → contact_link → email/phone subtype attributes
Alex → contact_person_role: billing, Headquarters address_link_id
Alex → contact_person_role: billing, Warehouse address_link_id
Partner → contact_link: general enquiries
Warehouse address_link → contact_link: warehouse telephone
```

Null role.address_link_id means owner-wide responsibility. Populated means a specific address association of the same owner, not merely any address in the same tenant. Reverse address contacts are a query over roles, not another table. Avoid duplicate contact cards when a contact has several responsibilities. Show one Alex with several role/address rows.

The common contact tables affect all planes. Preserve Mesh/common behavior and test Neon-specific owner validation rather than treating the extension as a Neon-only table. Resolve generic owner type through the existing registry. Changing an address/contact owner must not strand valid-looking responsibilities. Use existing temporal and primary-selection rules, ensuring null address scope participates correctly in duplicate checks. Authorize reverse readers through the partner and address association, not a supplied arbitrary address ID.

Channel value lives once in contact_link; contact_email and contact_phone contain channel-specific attributes. Validate subtype against channel_type and tenant. General, named-contact and address-specific channels must be labeled distinctly. Retain existing channel verification state; it is not commercial qualification and this plan adds no verification table.

Postal address belongs in address, purpose/attention/primary selection in address_link. Reuse existing structured/free-form address validation without maintaining incompatible second address strings. Shared physical addresses can have multiple associations; an association-specific channel is attached to address_link, not globally to the postal-address row.

### 4.3 Identifiers and tax

Maintain separate child collections even when grouped in one Identifiers & Tax section. Identifier columns (scheme, issuer, country, issued date) must not be reused as empty tax columns. Tax cards show jurisdiction, tax type, registration type, masked number and dates. Protected values are captured by existing protected writers, masked in general APIs, and revealed only through existing separately authorized operations. Do not seed real personal identifiers. A read grant alone must not grant reveal.

### 4.4 Industries and commodities

Industry declaration points to an actual allowed industry code and records assignment kind, dates, source and primary designation. Commodity declaration points directly to shared UNSPSC commodity_code_id for new native capture. Optional category matches are derived reference relationships, not prerequisites or stored approvals. Validate system/code compatibility and temporal/duplicate rules.

The final current commodity schema is the combined result of 29 and 31, not 29 alone: exactly one of commodity_code_id and legacy commodity_category_id is populated. Preserve existing legacy category rows as explicitly legacy; do not fill a guessed UNSPSC from a crosswalk. The screenshot's blank declared code with legacy category is not successful direct-UNSPSC demo acceptance. Add an actual declared code example.

Related mappings remain collapsed optional details: source/target systems and codes, relationship, confidence and provenance. Mapping verification never verifies the partner. Classification verification never means approval to transact. Crosswalk absence must not block valid capture.

### 4.5 Certificates

Reuse generic certification with partner owner. Show type label or custom name, certificate number, issuer, validity/status and authorized attachment link. Company/site fields remain available to other existing owners but are not mandatory or prominent on this role-free partner capture form. Do not delete generic columns solely to hide them here. Validity and attachment access are independently checked; certificate presence does not grant qualification.

## 5. Payment-instrument facts

Partner → payment_instrument_link → payment_instrument → bank_account. bank_account.id shares the instrument primary key; require exactly one matching bank subtype for an instrument of this phase. Use the existing generic owner model: partner capture supplies the partner owner server-side and no company prerequisite, while treasury/company owners retain their existing company_code_id semantics. Retargeted treasury links must keep working.

Instrument status is one authority on payment_instrument; do not introduce another bank-account status. Current DDL default is active, but that is instrument lifecycle, not bank verification or payment eligibility. Fixtures can explicitly remain inactive. Capture does not authorize settlement.

Resolved-directory account: institution plus optional branch, validated against the institution/branch composite relationship. Unresolved-directory account: provisional_bank_reference_id, with submitted bank/branch facts owned by that reference. Preserve bank_account_bank_identity_chk's exclusive institution-versus-provisional shape. A miss never creates shared bank catalog rows.

Optional provisional address uses address_link(owner = provisional reference, purpose = bank_branch) → address. Verify owner registry, same-tenant integrity, purpose support, permissions and every writer/reader before claiming support. It is the submitted bank/branch address, not the partner's primary address. Resolution references an existing compatible institution/branch; changing resolution is not account verification or an automatic account-identity rewrite.

Bank UI should compose one readable card: holder, bank/branch or submitted names, masked account, currency, relationship, purpose, lifecycle and applicable dates. Hide raw owner/instrument UUIDs from ordinary cards. Provider account references and full account identifiers are protected. Current account_id_value may hold a fingerprint for protected registrations; consumers must not treat every value as clear account data. Retain protected storage/reveal behavior and audit.

## 6. MetaEntity wiring

```text
DDL tables + references + constraints/RLS
  → owning writer and authorized read projection
  → core.json field source/type/reference/privacy contract
  → operation.json existing command bindings
  → presentation.detail/list/section field and collection selection
  → compiled, signed and activated metadata
  → entity-runtime bootstrap/sections
  → generic field / related-collection / specialized protected renderer
```

One business_partner root entity; no separate organization-partner and person-partner app. Existing child entity contracts are reused. core.json sourceObjects/field bindings must describe the actual storage or registered projection contract, never imply that adding a sourceObject creates a join or write implementation. genericWriteEnabled remains false for the aggregate. Organization changes use organization writers; person changes use authorized person writers; collections use their owners' commands.

Update business_partner_identity_current carefully: its current inner join excludes persons. Use category-safe organization projection and an explicitly authorized minimal person read path. Do not add a broad person.* join to a generally readable directory view. Root partner listing must continue when personal-field access is denied, exposing only the independently authorized partner header. Ensure organization changes still participate in aggregate optimistic concurrency; person changes must invalidate affected identity projections without pretending partner record_version alone versions independently owned person data.

### 6.1 Field and collection placement

| UI | Data contract | Existing section / handler path |
| --- | --- | --- |
| Header | name, code, category, status; no raw UUID title | root core, list/detail presentations and bootstrap/header reader |
| Overview | description, website, ownership_class, applicable legal_classification; primary contact/address summaries | presentation.section.overview; neon.bp.section.overview.v1 |
| Identity | organization attributes OR authorized person names/reference; aliases below | presentation.section.identity; neon.bp.section.identity.v1; business_partner_alias child |
| Industries | code/system/description, primary, dates, assignment/verification status; optional mappings | presentation.section.industries; neon.bp.section.industries.v1 |
| Commodities | direct UNSPSC code/description, dates/source/status; optional category matches and mappings | presentation.section.commodities; neon.bp.section.commodities.v1 |
| Contacts | readable named contacts, responsibilities/address labels and channel groups; general channels separate | presentation.section.contacts; neon.bp.section.contacts.v1 |
| Addresses | formatted address, purpose/attention, primary, dates, channels and assigned contacts | presentation.section.addresses; neon.bp.section.addresses.v1 |
| Identifiers & Tax | two typed masked collections; explicit reveal action when authorized | presentation.section.identifiers-tax; neon.bp.section.identifiers-tax.v1 |
| Banking | composed instrument/account/link/provisional information, not three raw ID-heavy tables | presentation.section.banking; retain existing banking service binding |
| Certificates | labeled types, issuer, number, validity and attachment action | presentation.section.certificates; neon.bp.section.certificates.v1 |
| Relationships / Governance & ownership | partner relationships and applicable governance members | presentation.section.network; neon.bp.section.network.v1 |

Retain existing section IDs/bookmarks unless an explicit compatible route alias is included. MetaEntity child code business_partner_bank_account_link is presently a historical name under Banking; inspect its actual storage binding before renaming. Rename coordinated references if needed, without recreating the retired bank_account_link table or breaking stored previews.

### 6.2 Presentation quality and permission rules

- Overview and Identity must not repeat the same full field set. Category-specific fields are hidden when inapplicable, not displayed as empty organization facts for a person.
- Resolve lookup labels in authorized projections/renderers; keep stable IDs internally. Use normal labels rather than camelCase payload keys. Hide technical IDs/version fields from ordinary cards, keeping diagnostics available separately.
- Keep restricted, empty and not-applicable states distinct. Summary cards must not say merely “ready / Available” when useful authorized business information is expected, nor claim availability for a denied/broken detail section.
- Source/provenance and crosswalk detail are secondary disclosures; actual declared codes and descriptions remain prominent.
- Parent-read admission plus each collection/action permission remains mandatory. Tenant-owned facts need no supplier/customer/company assignment. Do not broaden access simply because category is person.
- Person field authorization is server-side; hidden UI fields alone are insufficient. Sensitive fields must be absent from bootstrap, summaries, search/list payloads, caches and exports unless specifically admitted.
- Keep comments/files controls and their independent grants intact; this slice does not redesign moderation.
- Both signed compiled metadata and the CATL local preview overlay must be reconciled. A working source JSON or standalone repository test does not prove the live preview selected it.

## 7. Capture channels

NEON captures tenant-owned facts through the same field contracts and owning commands. Mesh intake is a separate source of submitted facts: map to the receiving tenant, resolve local references, validate and protect values before persistence. Do not copy Mesh person IDs or owner IDs as Neon foreign keys, and do not import Mesh verification as Neon instrument activation/eligibility. This plan does not create a new intake workflow or bypass existing command controls.

## 8. Demonstration records

| Record | Organization | Person |
| --- | --- | --- |
| Code | BP-DEMO-CORE-001 | BP-DEMO-PERSON-001 |
| Name | Aster Research Services (Demo) | Maya Example (Demo) |
| Category / person_id | organization / NULL | person / tenant-local synthetic person |
| Identity | Exactly one organization row with legal name, lookup labels, incorporation and profile values | Existing master.person with Maya/Example names; no organization row |
| Legal classification | NULL unless appropriate configured classification | NULL for ordinary person; separate explicit sole-proprietor test |
| Contacts/addresses | Alex, headquarters/warehouse, two address-specific responsibilities, general and site channels | Authorized personal partner contact/address example, no employee record |
| Classifications | Real catalog references for synthetic industry and direct UNSPSC declarations | Appropriate direct industry/UNSPSC examples, no role prerequisite |
| Banking | Inactive synthetic bank instrument, unresolved submitted-bank example | Separate inactive synthetic instrument linked to person partner |
| Other collections | Synthetic aliases, masked identifier/tax, certificate and authorized attachment | Same where applicable; no fabricated corporate ownership |

Prepare reusable tenant-parameterized seeds for CATL, Athyper and Technostat, with distinct tenant-local IDs and no cross-tenant person reuse. Start signed-in acceptance in CATL; repeat isolation/visibility checks in the other two. Select valid reference records rather than inventing catalog IDs or misrepresenting classification mappings. No supplier/customer or company assignment is introduced for these fixtures.

## 9. Coordinated execution order

| Phase | Deliverable | Exit check |
| --- | --- | --- |
| P01 — finalize fields | Confirm field ownership, person-link uniqueness and permitted person fields | One consistent field contract ready to build |
| P02 — DDL and writers | Update clean-install SQL, constraints, writers and readers together | Schema builds; organization and person records save/read correctly |
| P03 — metadata and UI | Align fields, permissions, Overview/Identity and lookup labels | Both partner types display correctly |
| P04 — contacts and addresses | Wire contacts, channels, address responsibilities and reverse views | Demo contacts and addresses work without duplicate records |
| P05 — shared collections | Align aliases, relationships, industries, commodities, identifiers/tax and certificates | All applicable collections load with readable demo data |
| P06 — instruments | Align bank instruments, links, provisional details and existing treasury consumers | Banking capture/read works with masking preserved |
| P07 — complete DEV build | Rebuild the same DEV instance, reseed, publish metadata and align preview | Signed-in organization/person journeys work; relevant automated checks pass |

Treat P01–P07 as one coordinated local-build worklist, not seven separate approval or deployment gates. Resolve the §3.4 person-link uniqueness decision before encoding its constraints, then complete DDL, consumers, metadata and UI as one compatible change set. Run relevant §10 checks during implementation; no separate sign-off round is required for each row. Local-build simplicity does not remove tenant isolation, person privacy, referential integrity or protected-value controls.

**Single completion check:** the existing DEV instance builds from cleaned DDL, both demo partner types are reseeded, metadata/preview are activated, applicable sections and capture/read actions work in the signed-in UI, and relevant automated checks pass. Report any remaining failure explicitly rather than calling a partial build complete. No new isolated instance and no historical migration solely to preserve the discarded local model.

This document update does not execute a rebuild. At execution, state the exact same-DEV reset/reseed command and data-loss scope before running the approved local-build procedure. Deploy the matching schema and consumers together, preserving unrelated work.

## 10. Required acceptance matrix

1. Organization header plus exactly one identity commits; missing/duplicate identity fails.
2. Person header with same-tenant person commits; null, missing and cross-tenant person fail.
3. Organization with person_id and person with organization identity fail; ordinary category edits remain locked.
4. Existing deferred trigger pair supports parent-then-subtype atomic creation and rejects missing/deleted subtypes and person/subtype mismatches at commit; immediate guard ordering is tested. Reparenting is rejected or both affected parents are validated.
5. Person deletion is restricted while referenced; unauthorized person lookup/read/update is denied without hidden-data leakage.
6. Category/legal-classification combinations are checked; prior conflicting rows are detected, never silently converted.
7. Both categories appear in list, detail and search; no organization inner join filters persons out.
8. Overview is concise; Identity is category-correct; legal form/business type render labels, not IDs.
9. Alternate names remain one collection; relationship/governance applicability and same-tenant endpoints are enforced.
10. Alex can hold billing responsibility at two partner addresses without duplicate contact rows; wrong-owner address selection fails. A second contact_person_identity_link row for the same tenant/contact fails even if person_id differs; effective dates do not make this a multi-row identity history table.
11. General, contact and address-specific channels resolve separately; subtype consistency and primary/effective rules hold.
12. Reverse address contact views enforce the same permissions as contact views; existing Mesh/common readers do not regress.
13. Identifier/tax payloads remain masked; denied reveal leaks nothing; authorized reveal follows existing controls.
14. Direct UNSPSC declaration works without category mapping; legacy category facts remain clearly labeled; crosswalks create no declarations.
15. Certificates show authorized attachment links; wrong-tenant access is denied independently of certificate visibility.
16. Both partner categories own instrument links without company selection; generic treasury/company ownership still works.
17. Bank institution/branch mismatch fails; provisional capture retains submitted names and address; a directory miss creates no global bank.
18. Bank account identifiers stay protected; instrument/account subtype cardinality is enforced; lifecycle is not payment approval.
19. Removed banking tables/columns have no executable reader/writer/metadata dependencies; no new evidence/assignment/person-copy tables appear.
20. Fresh publication and CATL preview select the intended fields/actions; signed-in browser confirms every intended section, not only repository tests.
21. Tenant revocation/context changes invalidate access; person and organization fixtures remain tenant-isolated across all three demos.
22. The P01-approved person-to-partner cardinality rule is enforced under concurrent creation: forbidden duplicates fail, explicitly permitted representations succeed, and cross-tenant references still fail independently.

## 11. Inspectable source anchors

- [Neon master tables](../../../server/db/ddl/planes/neon/master/03_tables.sql): partner/person, alias, relationship/governance, identifiers/tax/industry, certificates and instrument tables.
- [Organization storage and read view](../../../server/db/ddl/planes/neon/master/33_partner_organization_identity.sql).
- [Category domains](../../../server/db/ddl/planes/neon/master/02_domains.sql) and [constraints](../../../server/db/ddl/planes/neon/master/05_constraints.sql): current organization-only barriers.
- [Common named contacts/responsibilities](../../../server/db/ddl/common/master/03_tables.sql), [address/channel storage](../../../server/db/ddl/common/master/03_platform_tables.sql), [common ownership guards](../../../server/db/ddl/common/master/07_functions.sql).
- [Commodity classification base](../../../server/db/ddl/planes/neon/master/29_partner_commodity_classification.sql) and [direct UNSPSC extension](../../../server/db/ddl/planes/neon/master/31_partner_direct_commodity.sql).
- [BP core metadata](../../../metadata/products/mdg/entities/business_partner/core.json), [detail navigation](../../../metadata/products/mdg/entities/business_partner/presentation.detail.json), [Overview](../../../metadata/products/mdg/entities/business_partner/presentation.section.overview.json), [Identity](../../../metadata/products/mdg/entities/business_partner/presentation.section.identity.json), [operation bindings](../../../metadata/products/mdg/entities/business_partner/operation.json).
- [Runtime provider composition](../../../server/apps/platform-host/src/composition/register-services.ts): registered section handlers and authorization/capability boundaries.

Completion means the DDL, commands/readers, metadata, permissions, activated UI and signed-in acceptance agree. Table existence or a populated screenshot alone is not completion.

## 12. Identifier and tax reveal — DEV test implementation

Navigation regression correction: the reveal provider must not key/remount the record workspace by active section. It now passes a reset context that remounts only each protected-value leaf, clearing values and aborting pending reveals while preserving workspace state, scrolling and navigation locks. [Signed-in navigation regression](../../../tooling/scripts/verification/verify-catl-partner-navigation.live.mjs) verifies six consecutive section selections with Section/Summary views enabled, waits for viewport observations to settle, and asserts that the workspace DOM is preserved. Navigation and existing reveal live checks passed after the correction; component tests also verify clearing and stale-response cancellation without remounting the surrounding workspace.

Implemented the explicitly requested identifier reveal and CATL owner test access alongside the existing tax reveal. Ordinary section reads remain masked. The MetaEntity protected-field contract now supplies a reveal operation to the shared collection renderer; the BP adapter invokes the corresponding registered service. Revealed values are component-local, never placed in normal section caches, and clear on Hide, expiry, record/section/context changes, or failed retry.

- Identifier permission: `neon.relationship.business_partner_identifier.reveal`; target operation: `neon.relationship.bp_target.identifier_reveal`.
- Tax permission: `neon.relationship.business_partner_tax.reveal`; target operation: `neon.relationship.bp_target.tax_reveal`.
- Both enforce parent admission, separate reveal authorization, current elevated MFA, tenant/child ownership, a purpose-bound single-use claim, same-transaction success auditing, no-store responses, and a maximum 60-second display window. Authorization is rechecked before returning the result.
- Existing DEV only: no data reset, new instance, table, or masking relaxation. Clean-install permission and audit seeds include the new catalog entries without default user grants.
- Test grant is **CATL tenant scoped**, not limited to the demo record. Only `catl.owner` receives this new role; existing partner/read authorization still applies. The test membership and assignment expire at **2026-09-25 17:53:15 UTC (2026-09-26 01:53:15 MYT)**. Other tenants/principals are not granted access.
- Signed publication: applied release `01a0d48c-df6f-7a65-86a6-ba38b4d25ecd`, hash `9e55ddcfdff546ceb5629803d49411c9758fdf532092c06b1aec5b4e94b25b8b`; CATL preview revision 7 adds the identifier reveal operation without changing Mesh/Studio projections.
- Verification: 17 service authorization/revocation tests, 6 runtime/policy tests, and 2 protected-field UI tests passed; affected service, host, UI and relay type checks passed. Signed-in owner APIs and browser verified both reveals, masked normal reads, replay denial, wrong-parent denial, expired-claim denial, Hide and automatic expiry. Before MFA refresh both live APIs returned `BP_360_STEP_UP_REQUIRED`. Successful audit rows include purpose and omit raw values.

Reproducible scripts: [catalog-independent DEV owner grant](../../../tooling/scripts/local-dev/seed-catl-partner-reveal.sql), [signed preview extension](../../../tooling/scripts/local-dev/enable-catl-identifier-reveal.mts), [live acceptance](../../../tooling/scripts/verification/verify-catl-partner-reveal.live.mjs). Acceptance prints checks only, never protected values. Collection capture remains outside this change.

### Reveal step-up entry point

Identifier and tax projections now distinguish `revealable` from `revealVerificationRequired`. Baseline discovery remains a denial: only an admitted reveal discovery requiring verification advertises **Verify identity to reveal**. Missing grants do not become reveal permission. Historical views advertise neither action.

The shared protected-value renderer posts a CSRF-protected request to `/api/auth/step-up/start` with the exact current path/query as `returnTo`. The existing identity-provider flow owns authentication and authenticator enrollment; no local elevation, permission bypass or automatic reveal is introduced. After returning, the user must explicitly select Reveal and supply a purpose. Normal login requirements are unchanged.

Applied to the existing DEV source runtime without a database reset or grant changes. UI tests cover the return path, CSRF form and absence of automatic reveal; policy tests cover baseline discovery versus missing grants, alongside existing authorization/revocation tests. Form-detail, master-data and platform-host typechecks pass. The IAM production typecheck passes, but its test typecheck reports unrelated existing fixture errors in `shadow-authorizer.test.ts` (missing denial reason) and `source-permission-constraints.test.ts` (`normal` assurance).

Live owner page renders both Reveal actions with the existing elevated saved session. Baseline-to-IdP redirect and first-time authenticator enrollment still require a normal baseline owner session/human verification; they are not claimed as live-accepted yet.

The navigation regression script was also rerun, but timed out waiting for `aside[aria-label="360 sections"]`; this run does not establish navigation acceptance. The direct Identifiers Tax page check succeeded separately.

### Reveal modal UX

Banking metadata alignment: root `protections[]` is normalized via `protectedSource.maskedByFieldKey` into the same protected-field presentation as identifier/tax fields. `account_last4` displays as **Account number** with metadata-defined `••••` prefix, purpose choices and `targetField: reveal_link_id`. The server projects a deterministic effective partner link (primary-first) and server-derived reveal/verification flags; normal projections exclude full values. The registered banking command receives the link ID, never an assumed account ID. Reveal remains token-only: an attempted synthetic-value fallback was rejected by database column privileges and removed. No DDL or database privilege change.

Existing DEV signed publication applied: `01a0d4e0-9b4b-76c8-97f1-54a2f34d9cff`, hash `ecf4e59a9be26ecb2b0e94597b154b24489dfdfb3d33e9c700e70d09d91690a4`. The existing preview already contains `bank_reveal`. Thirteen presentation-service tests, 38 reveal/projection service tests and six protected-value UI tests pass. Live owner Banking popup requires verification with its current baseline session; successful live bank reveal/Hide/expiry remains pending fresh MFA. Reproducible check: `node tooling/scripts/verification/verify-catl-bank-reveal.live.mjs`.

Subsequent live test after owner refresh reached the restricted reader, but the two existing demo accounts have no protected-value tokens. Raw-account column access is intentionally denied, and linked account coordinates cannot be updated in place. The final reader preserves token-only access and the affordance now requires an available token. Successful live bank reveal remains blocked on replacement protected fixtures; no guard was disabled and no raw-column grant was added. The earlier baseline/MFA observation was not the final blocker.

Resolved by the approved protected demo-data setup: `tooling/scripts/local-dev/protect-catl-demo-banks.mts --apply` creates two inactive replacement instruments/accounts with tenant-local protected-value references and SHA-256 fingerprints. Existing effective links end on the replacement date, with new links preserving primary selection, purpose, partner and directory/provisional references. Old accounts remain intact; no identity guard or column privilege was relaxed. Repeat execution creates no duplicates. Signed-in CATL owner bank Reveal/Hide and expiry pass for both accounts; normal API responses contain neither plaintext nor protected-store references. CATL admin retains masked reads and has no reveal affordance. No new metadata publication was necessary for this data-only setup.

First-click failure follow-up: the exact reported failure was not reproduced (four consecutive live tax reveals returned 200). Fixed a separately reproducible client expiry defect: a server clock 500 ms ahead previously caused a valid response to be rejected because its remaining lifetime exceeded 60 seconds. The display now caps the timer at 60 seconds while still rejecting malformed/expired responses. Added regression coverage and safe transport-specific error messages with request references, without server-message/body leakage or automatic retries. The original incident still needs its failed request status/code/reference for a definitive root cause.

Replaced the inline purpose-code form with the shared Dialog/Button components used for file actions. Identifier and tax field metadata now defines the `partner_review` purpose with the readable label **Partner review**; the runtime descriptor carries these options to the shared renderer. Missing purpose configuration disables confirmation rather than falling back to a hard-coded purpose. This presentation list does not replace server authorization or purpose-claim validation.

The card retains only its masked value and Reveal action. The modal requires a reason selection and explicit **Reveal value**, or **Verify identity** for baseline sessions. Successful reveal closes the modal; Hide, 60-second expiry and navigation clearing remain. Cancel/Escape dismiss the modal. A short-lived, same-path session-storage intent can reopen confirmation after verification; it stores no protected value, purpose or authorization, and never automatically calls reveal.

Published and activated in existing DEV: applied release `01a0d4b7-c288-73b0-8a51-9468daeea402`, artifact hash `3b4c9e6a4066fdf941506e64fcaec923282387619ac1acd75aa034f40dd15639`. No database reset or grant changes. Five protected-field UI tests pass, as do form-detail and platform-host typechecks. Signed-in live identifier Reveal/Hide and tax Reveal/expiry pass; both API fixtures also pass masked-read, replay, wrong-parent and expired-claim checks. Human first-time MFA enrollment remains outside this acceptance run.
