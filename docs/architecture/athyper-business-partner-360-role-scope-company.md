# Business Partner 360 role, scope, AP and AR configuration — BS360-04

Status: In progress  
Build date: 2026-08-30

## Delivered boundary

BS360-04 adds distinct contracts and readers for Roles & Scope, Supplier Procurement/AP, and Customer Sales/AR. Supplier and customer company profiles are never combined into one convenience model. A dual-role Business Partner therefore retains separate role IDs, organization assignments, configuration tables, fields, permissions, cache keys, routes, and components.

The Roles & Scope reader returns role summaries plus effective operating-organization assignments, Business Partner legal-entity links, and person workforce assignments including company, legal entity, org unit, position, assignment type, FTE, and effective range.

Supplier company data joins only the supplier role, a supplier organization assignment, and `master.company_code_supplier_profile`. Customer company data independently joins the customer role, customer assignment, and `master.company_code_customer_profile`.

## Scope authority

- Selected operating organization must be an effective BP assignment for the requested role lens.
- Selected company must have an effective membership under that exact operating organization.
- A selected legal entity accompanying a company must be the company’s legal entity.
- A legal entity without company scope must be linked to the BP or an effective employment belonging to its person identity.
- Every predicate is tenant-bound and evaluated using the resolved `asOf` date.
- Explicit `asOf` requests are historical and read-only. Governed actions are not rendered.
- Missing scope, global identity, scoped, historical, invalid, empty, and locally unavailable states are distinct.

Governed actions deep-link to the existing add-role, assign-organization, and configure-company request routes. No direct master-data mutation was added.

## Client invalidation and shaping

Global identity section keys exclude organization, company, legal entity, and role lens. Scope changes preserve the loaded identity/header while refreshing the summary and invalidate only Roles & Scope/AP/AR keys. BP changes and permission-epoch changes clear the prior summary immediately.

The new 360 shell has no supplier eligibility dependency. Supplier readiness is not loaded for customer or person lenses.

## Remaining evidence

Focused unit/static tests cover dual-role AP/AR separation, historical read-only behavior, scope-key invalidation, effective predicates, legal/company membership checks, governed routes, and supplier-eligibility absence. Disposable-database tests are still required for cross-tenant authorization evidence, effective boundary dates, concurrent scope changes, and representative dual-role/workforce fixtures. Browser automation remains required for scope transitions and action suppression.
