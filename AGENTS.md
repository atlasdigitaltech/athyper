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
