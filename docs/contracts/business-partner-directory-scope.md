# Business Partner directory and transaction scope

Author one `layoutConfig.directoryScope` on the Meta Entity surface: `{ "schemaVersion": 1, "mode": "tenant" }`. Publication includes the rule in the deterministic compiled descriptor. Supported modes are `tenant`, `organization`, `company`, and `organization_company`. Organization/company modes restrict membership to the principal's current authorized catalog; empty catalogs produce no rows. Explicit filters further narrow those sets and are validated again by the server. The read operation must bind the tenant directory permission; the registered directory resolver supplies the additional row restrictions. Existing entities without a rule retain their prior behavior. Non-tenant rules on entities without a registered resolver fail closed.

Business Partner uses tenant mode initially. Tenant isolation, entity-read permission, record admission, sensitive-field permissions, and mutation authorization remain enforced. The same query executor applies the rule to lists, search, direct record reads and export jobs. BP360 also calls record admission before serving any section. Changing the rule requires publishing a new metadata release; it is not a browser preference.

Directory filters use `partnerRole`, `operatingOrganizationId`, and paired `companyCodeId`/`legalEntityId`. `eligibleOperation` accepts `order`, `invoice`, or `payment`, and requires an explicit role, organization and company. Eligibility is evaluated by the existing Business Partner eligibility service, before result pagination; eligible IDs become trusted, server-produced query constraints and part of cursor authority. Configuration does not imply eligibility. This initial implementation evaluates scoped candidates on demand and requires narrower scope if more than 10,000 candidates are encountered. Eligibility service permissions are required. A future materialized eligibility projection can improve large-directory performance without duplicating policy rules.

`BusinessPartnerTransactionSelector` provides eligible-only selection for transaction consumers. Consumers must still revalidate eligibility when committing a transaction because approval, blocks and configuration may change after selection. No existing transaction authorization is replaced by directory visibility.

Overview contains the access/transaction scope card with operation-specific eligibility and reasons. Technical identifiers are collapsed at the bottom with copy controls. The header retains identity, lifecycle, roles, governed actions, Role and As of. Full legal-entity and organization assignments remain in Roles & scope.

Discover partners opens `/api/business-partner/discover`, which redirects through Mesh's normal login flow into Buyer Discovery. Set `MESH_APP_ORIGIN` for deployments that do not use sibling `neon.*` and `mesh.*` origins. Mesh handles SSO, tenant selection and authorized buyer-account selection. This phase provides the session/account entry point only; network search, tenant-record linking and onboarding integration are deferred.

Directory admission also applies to application navigation. When a verified
entity-operation authorization fails only because scoped grant evidence has no
matching selected coordinate (`scope_not_contained`), a published directory
contract permits a second, permission-only admission check for directory reads
and navigation. Explicit denials, missing bindings, field permissions, and
mutation actions retain their existing checks. Required directory constraints
still run before repository access; a tenant rule permits an unfiltered directory
without requiring a tenant-wide grant scope. Record reads check record-specific
denials before applying directory membership constraints.

The optional `directoryScope.filters` array declares supported directory controls
(`organization`, `company`). It is published as `scope.filterKinds` on the browser
list descriptor. Missing or empty declarations omit the directory filter tab.
The NEON adapter supplies authorized catalogs; the shared runtime stages these
selections alongside field filters until Apply. Cancel discards them, and chips
remove applied selections. This selection never changes the shell work context.
Company groups use legal-entity initials when a distinct legal-entity logo is not
available. The same picker presentation serves the header's immediate selection
and the filter drawer's staged selection.

Directory filters now use separate Organization and Company tabs with up to 100
selected IDs per tab. Browser/API coordinates are `operatingOrganizationIds` and
`companyCodeIds` (comma-separated UUIDs in query strings, arrays internally).
Within each dimension membership is OR; the two dimension constraints are AND.
An empty selection means no additional filter, while the published visibility
rule still applies. All selected IDs must belong to authorized catalogs; a
partially unauthorized selection is rejected, never silently reduced. Selection
order and duplicate IDs do not change cursor scope. Export admission and jobs
preserve both arrays. Single work-context coordinates remain available for
transactions; transaction eligibility requires one organization and one company.
The header work-company picker remains single-select.
