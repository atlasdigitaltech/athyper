# BP metadata migration inventory

Date: 2026-09-26. Read-only inventory before Phase 4; no artifacts migrated or deleted.

Follow-up: publication-export-audit.md classifies all 105 root-barrel symbols,
traces their consumer files and package subpaths, and assigns dispositions before
implementation. It additionally identifies the authenticated release-review
packet format as hybrid; preserve that security boundary during migration.

## Product files

Paths below are relative to metadata/products/mdg/entities/business_partner. Handler declarations are dependencies, not proof of callable registrations.

| File | Declared handler keys | Disposition |
| --- | --- | --- |
| core.json | neon.bp.relation.contact_person.v1, neon.bp.relation.business_partner_identifier.v1, neon.bp.relation.business_partner_tax_registration.v1, neon.bp.relation.supplier.v1, neon.bp.relation.customer.v1, neon.bp.relation.business_partner_operating_organization_assignment.v1, neon.bp.relation.supplier_company_profile.v1, neon.bp.relation.customer_company_profile.v1, neon.bp.relation.business_partner_qualification.v1, neon.bp.relation.certification.v1, neon.bp.relation.business_partner_governance_relation.v1, neon.bp.relation.business_partner_industry_classification.v1 | Replace bindings only after generic reader/command and authorization qualification. |
| flow.intake.json | None declared | Retain metadata; validate references against independently published entities and callable bindings. |
| operation.json | neon.bp.capability.supplier.v1, neon.bp.capability.customer.v1, neon.business_partner.read.v1, neon.bp.governed-request.create.v1, neon.bp.governed-request.organization-scope.v1, neon.bp.governed-request.company-scope.v1, neon.bp.governed-request.role-extension.v1, neon.business_partner.print_statement.v1, neon.business_partner.share_mesh.v1, platform.attachments.read.v1, platform.attachments.create.v1, platform.attachments.finalize.v1, platform.attachments.status.v1, platform.attachments.download.v1, platform.attachments.version.v1, platform.attachments.rename.v1, platform.attachments.category.v1, platform.attachments.folder.v1, platform.attachments.archive.v1, platform.attachments.unlink.v1, platform.attachments.preview.v1, platform.attachments.extract.v1, platform.attachments.search.v1, platform.comments.read.v1, platform.comments.create.v1, platform.comments.update_own.v1, platform.comments.archive_own.v1, platform.comments.reply.v1, platform.comments.react.v1, platform.comments.draft.v1, platform.comments.flag.v1, platform.comments.mention.v1, platform.comments.history.v1 | Replace bindings only after generic reader/command and authorization qualification. |
| presentation.detail.json | None declared | Retain metadata; validate references against independently published entities and callable bindings. |
| presentation.list.json | None declared | Retain metadata; validate references against independently published entities and callable bindings. |
| presentation.section.activity.json | neon.bp.section.activity.v1, neon.bp.activity.timeline.v1 | Replace bindings only after generic reader/command and authorization qualification. |
| presentation.section.addresses.json | neon.bp.section.addresses.v1 | Replace bindings only after generic reader/command and authorization qualification. |
| presentation.section.attachments.json | platform.attachments.create.v1, platform.attachments.finalize.v1, platform.attachments.download.v1, platform.attachments.version.v1, platform.attachments.rename.v1, platform.attachments.category.v1, platform.attachments.folder.v1, platform.attachments.archive.v1, platform.attachments.unlink.v1, platform.attachments.preview.v1, platform.attachments.extract.v1, platform.attachments.search.v1 | Retain metadata; validate references against independently published entities and callable bindings. |
| presentation.section.banking.json | neon.bp.section.banking.v1 | Replace bindings only after generic reader/command and authorization qualification. |
| presentation.section.business-activity.json | neon.bp.section.business-activity.v1 | Replace bindings only after generic reader/command and authorization qualification. |
| presentation.section.certificates.json | neon.bp.section.certificates.v1 | Replace bindings only after generic reader/command and authorization qualification. |
| presentation.section.comments.json | platform.comments.create.v1, platform.comments.update_own.v1, platform.comments.archive_own.v1, platform.comments.reply.v1, platform.comments.react.v1, platform.comments.draft.v1, platform.comments.flag.v1, platform.comments.mention.v1, platform.comments.history.v1 | Retain metadata; validate references against independently published entities and callable bindings. |
| presentation.section.commodities.json | neon.bp.section.commodities.v1 | Replace bindings only after generic reader/command and authorization qualification. |
| presentation.section.contacts.json | neon.bp.section.contacts.v1, neon.bp.contact.channels.v1 | Replace bindings only after generic reader/command and authorization qualification. |
| presentation.section.credit.json | neon.bp.section.credit.v1 | Replace bindings only after generic reader/command and authorization qualification. |
| presentation.section.customer-company.json | neon.bp.section.customer-company.v1 | Replace bindings only after generic reader/command and authorization qualification. |
| presentation.section.identifiers-tax.json | neon.bp.section.identifiers-tax.v1 | Replace bindings only after generic reader/command and authorization qualification. |
| presentation.section.identity.json | neon.bp.section.identity.v1 | Replace bindings only after generic reader/command and authorization qualification. |
| presentation.section.industries.json | neon.bp.section.industries.v1 | Replace bindings only after generic reader/command and authorization qualification. |
| presentation.section.network.json | neon.bp.section.network.v1 | Replace bindings only after generic reader/command and authorization qualification. |
| presentation.section.overview.json | neon.bp.section.overview.v1 | Replace bindings only after generic reader/command and authorization qualification. |
| presentation.section.qualifications-certificates.json | neon.bp.section.qualifications.v2 | Replace bindings only after generic reader/command and authorization qualification. |
| presentation.section.requests.json | neon.bp.section.requests.v1 | Replace bindings only after generic reader/command and authorization qualification. |
| presentation.section.restrictions.json | neon.bp.section.restrictions.v1 | Replace bindings only after generic reader/command and authorization qualification. |
| presentation.section.roles-scope.json | neon.bp.section.roles-scope.v1 | Replace bindings only after generic reader/command and authorization qualification. |
| presentation.section.supplier-company.json | neon.bp.section.supplier-company.v1 | Replace bindings only after generic reader/command and authorization qualification. |
| presentation.section.workforce.json | neon.bp.section.workforce.v1 | Replace bindings only after generic reader/command and authorization qualification. |
| release.json | None declared | Retain metadata; validate references against independently published entities and callable bindings. |

## Host confirmation (Phase 3 boundary)

- No files named business-partner-definition-authorizer.ts or business-partner-case-authority.ts remain.
- No registerBusinessPartnerDefinition / registerBusinessPartnerCaseContract / createBusinessPartnerDefinition / createBusinessPartnerCaseContract matches remain in platform-host/src.
- register-services.ts still constructs the scoped authoring repository, MetaEntityAuthoringService and PublicationServiceMetaEntityAdapter, and registers MetaEntity authoring routes with the authoring authorizer.
- Generic registerPublication retains verified artifact loading, signing/apply/recovery jobs and publication routes.
- kernel/module-registry.ts still gates coordination.entity-release-review to a worker profile explicitly including that coordination capability. Its register.ts requires both Studio and Neon databases.
- This confirms host wiring, not end-to-end publication or isolated-profile readiness.

## Publication branches and consumers requiring migration

Paths below are under server/ unless stated otherwise. This is the first bounded inventory of BP product publication, not a claim that every historical BP reference in the repository is removable.

| Source / consumer | Existing dependency | Disposition / required boundary |
| --- | --- | --- |
| packages/services/publication/src/entity-definition-compiler.ts | BusinessPartnerDefinitionBundleV1, organization/person policy, MESH projection | Not generic despite filename. Move product declarations to graph data; preserve validation and plane exclusions in generic compilation. |
| packages/services/publication/src/entity-foundation-definition.ts | BP foundation definition generator | Treat as source product configuration; split independently publishable entities before retiring generator. |
| packages/services/publication/src/entity-definition-service.ts and entity-definition-routes.ts | BP revision/service contracts, Studio BP definition permissions and operations | Do not restore removed host routes. Migrate callers to generic authoring only after equivalent authorization/revision guarantees. |
| packages/services/publication/src/entity-definition-consumer.ts | BP definition projection consumption | Replace with verified active entity descriptor consumption, retaining release pins. |
| packages/services/publication/src/entity-case-contract-service.ts, entity-case-contract-routes.ts, entity-initial-case-schema.ts | BP case schema and compatibility rules | Extract declarative case schemas; governance evidence decisions remain blocked, not inferred. |
| packages/services/publication/src/entity-operation-binding-compiler.ts | BP company operation bindings | Compile explicit per-entity operation declarations; validate handler availability and scope before activation. |
| packages/services/publication/src/kysely-publication-authority-work.ts | BP definition/case-contract release-link tables and definition artifact fallback | Migrate source selection deliberately; never interpret an unknown artifact as a BP bundle. Preserve historical release handling until retention/rollback strategy is decided. |
| packages/services/publication/src/kysely-authority-repository.ts | Inserts publication.business_partner_definition_release_link | Replace publication source linkage together with producer, not independently. |
| packages/services/publication/src/kysely-local-projection-repository.ts | fn_active_business_partner_definition and BP envelope branch | Retain historical readability until dependent consumers are migrated; do not remove signature/hash checks. |
| packages/services/publication/src/publication-artifact-loader.ts | BP bundle parsing branch | Transition artifact-kind validation with compiler/projection consumers; reject unsupported kinds. |
| packages/services/publication/src/compiled-entity-collection-compiler.ts | Neon business_partner_request / master.business_partner special case | Replace with validated generic relationship semantics, not entity-name substitution. |
| packages/services/publication/src/local-definition-preview.ts and local-definition-preview-policy.ts | BP local preview behavior | Migrate preview through generic authoring with identical local/trust restrictions. |
| packages/services/publication/src/index.ts | Exports renamed but still BP implementations | Remove exports only after consumer migration; filenames do not establish generic behavior. |
| apps/platform-host/scripts/db-verification/provisioning/publish-development-business-partner-definition.ts | BP foundation/compiler, snapshot/release links, local-development signature mode | Retire only after generic product publication replaces this development path; never use its local signature mode as production trust. |
| apps/platform-host/scripts/db-verification/provisioning/publish-development-compiled-entity-runtime.ts | Product artifacts and BP overlays | Rework around independent product inputs and callable binding qualification. |
| Same provisioning directory: qualification-contract-overlay.ts, decision-view-overlay.ts, company-profile-overlay.ts, navigation-display-overlay.ts, status-tone-overlay.ts | BP-specific artifact transformation branches | Move product-specific declarations to metadata or retire after baseline migration; preserve schema/compatibility checks. |
| apps/platform-host/src/composition/entities/partner-section-contract.ts and its test | Qualification/certificate/restriction handler compatibility | Still consumed by provisioning. Retain checks until new metadata no longer depends on these contracts. |

## Migration order and blocking dependencies

1. Enumerate linked entity products referenced by core relations and section coreRef values; migrate small independent entities first.
2. Qualify generic list/detail/collection providers against each storage binding and persisted ownership model. Scalar test success does not qualify relationship or case-snapshot ownership.
3. Replace section handler declarations one product at a time. No blind neon.bp to entity string replacement; missing handlers keep the affected operation unavailable.
4. Separate supplier/customer, banking, contact, workforce and network capabilities from core identity. Preserve their permission/scope boundaries.
5. Governed request commands remain dependent on real generic case workflows and persisted evidence; preflight policy questions must be resolved first.
6. Preserve generic attachment/comment handler declarations, but prove their parent-scope bindings and operation grants before enabling access.
7. Migrate source links, signed artifact consumers and rollback compatibility together before deleting old publication implementations.
8. Rerun publication/security tests and live product-specific database checks at each activation boundary.

No BP metadata, application DDL, deployed release, or live service changed in this checkpoint.
