# Repository instructions for coding agents

## Required architecture and scope

The project owner's standing instruction is: **Only new Entity onboarding and
fixes or improvements to the shared Entity Framework. Nothing else.**

- Onboard new tables and read models through the existing Entity Framework,
  using entity definitions, published metadata, and its standard UI/runtime.
- Use Country as the reference implementation. Trace its actual entity,
  publication, provider, authorization, routing, and list/detail integration
  before implementing another entity.
- Reuse the existing list and detail experience, including supported search,
  filters, sorting, pagination, views, controls, and design-system components.
- When a capability is missing, improve the shared Entity Framework so every
  eligible entity can use it. Keep entity-specific configuration in metadata.
- Implement read-only entities and record-scoped embedded lists through that
  same framework. Enforce locked record scope and authorization on the server.

## DDL-led Entity Studio authoring storage

- The sole active design is
  [Entity Studio blueprint](docs/blueprints/entity-studio/blueprint.md).
  Read it before implementing Entity metadata/composer changes and update it in
  place. Other dated Entity/BP reviews are historical evidence, not implementation
  authority. Do not create competing plans or companion design reports.
- Build the shared Studio composer from typed metadata DDL contracts plus explicit
  governed authoring presentation properties. DDL types alone do not define
  readable identity, navigation, supported controls or authorization intent.
- Save structural authoring into canonical typed columns and related metadata
  rows. Do not store whole presentation, authorization or AI declarations in
  `entity_surface.layout_config`, or move those blobs into another property bag.
- Compile the normalized authoring graph into the existing reviewed JSON runtime
  artifacts. Compiled JSON is derived output, not a second writable authoring
  source. Preserve immutable historical artifacts and applied migration hashes.
- Extend the existing shared authoring repository, contracts, compiler and UI
  together. Each composer property must have a database location, typed API,
  save/load mapping, validation and compiler mapping. No bespoke composer or
  parallel provider stack is authorized.
- Convert legacy JSON through an explicit, validated migration adapter. Report
  unsupported paths; never silently drop them or dual-write competing sources.
- This redesign remains Entity onboarding/shared framework work. It does not
  authorize workflow/case execution, new business handlers or MFA changes.

## Entity list identity and record navigation

- Define navigation groups, section behavior, visible columns and readable
  identity explicitly in Meta Entity properties and governed, published metadata.
  The shared Entity Framework must render those properties and report missing
  configuration instead of inventing tabs or choosing a display field.
- Do not synthesize an Overview tab, infer section behavior from section keys,
  or select the first available field as a display identity. The absence of
  entity-name branches does not make such presentation fallbacks metadata-driven.
- Never display UUIDs in Entity List Views, including default or saved-view
  columns, embedded lists, cards, search hints, or fallback record labels.
  Keep technical identities internal for routing, selection and API operations.
- Enforce the no-UUID presentation requirement through shared metadata validation.
  Reject invalid list presentation configuration with an actionable configuration
  error; silently hiding fields or substituting another field at runtime is not
  a replacement for valid Meta Entity properties.
- Use readable business codes, names and reference labels from published Meta
  Entity properties. Never synthesize a visible Record ID column when presentation
  metadata is missing. Missing display configuration requires a shared framework
  or governed metadata correction, not a UUID fallback.
- Country and Principal Profile define the reference record experience: reuse
  the existing Navigation Tabs and Section Tabs/menu components. Honor published
  navigation groups and section order for every entity.
- The full-width "Record sections" dropdown fallback on Entity detail pages is
  deprecated and must not be restored. Section-only metadata must declare its
  navigation configuration before using the shared navigation components; do not
  invent that configuration or add another entity-specific presentation.

## No hardcoded entities

- Do not hardcode entity names, entity allowlists, or entity-specific branches
  in runtime, UI, authorization, policy selection, routing, or host composition.
  Do not move such hardcoding into a domain package as a workaround.
- Keep entity-specific configuration in entity definitions and governed,
  published metadata. Resolve behavior through the shared Entity Framework and
  its registered capability/provider contracts. Onboarding an entity using
  existing capabilities must not require adding its name to application code.
- Resolve exact permission codes and policy bindings from published metadata.
  Do not construct permission codes from entity names, infer authorization from
  naming conventions, or introduce entity-specific authorization exceptions.
- Register reusable domain implementations by capability contract; select them
  through validated published bindings rather than hardcoded entity dispatch.
  Domain ownership does not authorize a parallel authorization path.
- Missing or unsupported metadata, required policy bindings, or capabilities
  must fail closed, except that an undefined permission in valid Meta Entity
  properties means access for everyone as specified below. Fix the shared
  framework or the governed metadata while preserving
  tenant scope, explicit denies, MFA, audit, publication and independent-review
  controls. Never replace missing evidence with an inferred allow.
- Before implementing an entity fix, verify that the same implementation works
  for every eligible entity through metadata. A successful request for a named
  entity does not establish framework correctness.

## No hardcoded business permissions or entity codes in SQL

- Do not hardcode business permission codes or entity codes in SQL scripts,
  routines, migrations, seeds, or SQL embedded in application code. Resolve
  these values through governed, published metadata and the existing shared
  Entity Framework; do not use fixed codes to select entity behavior or grant
  roles or permissions to users.
- The only exception is an explicit, finite list of permission codes or entity
  codes used to identify records for a scoped data correction. Document the
  correction's purpose, tenant and plane scope, and affected records. This
  exception does not authorize runtime dispatch, authorization exceptions,
  onboarding grants, or bypassing publication and independent-review controls.
- Preserve immutable applied migration hashes. Correct historical behavior
  through a forward migration rather than rewriting an applied SQL migration.

## Permissions are defined in Meta Entity properties

- Define entity permissions in Meta Entity properties and resolve them through
  the shared Entity Framework from governed, published metadata. Do not define
  additional entity permission requirements in application code.
- If no permission is defined in the applicable Meta Entity property, everyone
  has access to that entity operation or surface without an entity permission
  grant. Do not invent a default permission, derive one from an entity name, or
  deny access solely because that permission property is absent.
- If a permission is defined, enforce that exact published permission through
  the existing shared authorization framework.
- An undefined permission in valid metadata is distinct from unavailable,
  invalid or unpublished metadata, or a broken reference to a defined permission.
  Do not treat those failures as an undefined permission and allow access.
- This rule governs entity permission checks. Existing authentication, tenant
  isolation, record scope, explicit denies and other independent platform
  controls remain applicable. MFA changes still require explicit owner approval.

## Studio publication ownership

- Product defaults are platform-owned Studio authoring releases. Platform Admin
  authors/proposes them and Platform Owner independently reviews/approves them.
  Publish them through the shared framework to their declared Neon, Mesh and
  Studio targets; do not require duplicate tenant-owned source releases.
- Tenant Admin authors/proposes tenant knowledge and supported extensions, and
  Tenant Owner independently reviews/approves them. Their publication is isolated
  to that tenant and its permitted target planes.
- Resolve published product defaults and approved tenant extensions with explicit
  source release identities and hashes. Tenant extensions must not mutate the
  product baseline, cross tenant boundaries, or weaken platform controls.
- This ownership standard applies to every Studio publication, including entity
  metadata, knowledge, fixtures and learning candidates. Service-account seed or
  deployment receipts do not attest human authorship, review or evaluation.

## Domain ownership

Place business-specific rules and handlers in the owning domain service package.
Keep shared Entity Framework packages domain-neutral and dependent on contracts
or registered ports, not concrete business implementations. Register domain
implementations through host/plane composition. All entity operations must
continue through the existing Entity Framework authorization, transaction, audit,
idempotency and publication controls. Colocate tests with their owning
implementation.

## Do not build bespoke applications

- Do not create separate entity-specific apps, custom explorer pages, parallel
  routes, duplicate list/detail components, or separate API/provider stacks that
  bypass the Entity Framework.
- Reusing a shared table inside a bespoke page does not satisfy this rule.
- In particular, do not recreate the removed custom history architecture:
  `/app/history` -> `HistoryExplorer` -> `HistoryList` -> shared table -> separate
  history API. Audit events and snapshots must follow Entity onboarding too.
- Do not expose placeholder filters or unsupported features merely to make a
  page appear complete. Controls must work with real metadata and API support.
- Complexity, deadlines, or a missing framework feature do not authorize an
  exception. A different architecture requires an explicit instruction from
  the project owner; otherwise stay within Entity onboarding/framework work.

## MFA changes require explicit owner approval

**SPECIAL OWNER INSTRUCTION: Do not introduce MFA for future entities as part
of Entity onboarding, permission setup, or access-error fixes. Viewing an entity
list or detail page must not acquire an MFA requirement from an agent's security
assumptions.**

- Do not add entity MFA requirements through permission catalog defaults,
  seeds, SQL migrations, generated metadata, risk-tier assignments, domain
  handlers, or UI prompts. In particular, do not set `requires_mfa = true` or
  elevate a permission's risk tier merely because an entity contains workforce,
  person, address, or other business data.
- Do not add verification buttons, step-up redirects, or session-elevation flows
  as a workaround for an Entity authorization failure. Trace the exact published
  Meta Entity permission and policy bindings first.
- Any future exception requires the project owner's explicit approval of the
  specific MFA requirement and its governed Meta Entity configuration before
  implementation. Approval to onboard, publish, deploy, grant permissions, or
  fix an entity does not constitute MFA approval.

- Do not write or change MFA-related code for any page or action without the
  project owner's explicit prior approval for that MFA change. This includes
  MFA requirements, enforcement, step-up flows, verification prompts, buttons,
  redirects, session-assurance handling and MFA-specific error behavior.
- A request to fix access, permissions, authorization or a page error is not
  approval to implement MFA changes. Diagnose and explain the issue and proposed
  MFA change first, then wait for explicit approval before implementation.
- Do not introduce unnecessary MFA requirements or flows. Preserve existing
  security controls while awaiting approval; this restriction does not authorize
  disabling, weakening or bypassing existing MFA enforcement.

## Working expectations

- Before changing code, identify the existing framework integration points and
  explain which entity definitions or shared framework components will change.
- Validate the actual entity integration and user flow. Distinguish completed
  implementation, publication, and verified runtime behavior in status reports.
- Preserve unrelated work and existing application behavior. This instruction
  does not authorize deleting or rewriting other existing applications.

## Naming and test conventions

- New server unit tests are colocated with the unit as `src/**/*.test.ts`.
  Existing `__tests__/` directories are grandfathered; move them only when the
  owning package is otherwise being changed.
- New exported boolean predicates use a plain adjective (`primary`, `enabled`,
  `loading`) unless an `is*` name is required to distinguish the predicate from
  a noun or value in the same public contract. Do not rename existing public
  contracts merely to conform.

These instructions are persistent repository guidance for future sessions.
