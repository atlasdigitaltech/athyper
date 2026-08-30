# Business Partner 360 person and workforce privacy — BS360-07

Status: In progress  
Date: 2026-08-30

## Delivered boundary

The workforce section is a person-only, independently authorized projection. It reads explicit safe columns from `master.person`, `master.employment`, `master.work_assignment`, onboarding/offboarding cases, external-worker engagements, and operational placements. All employment, assignment, engagement, and placement ranges use half-open effective dates at the requested `asOf` coordinate. An explicit historical coordinate makes the response and UI read-only.

The summary remains bounded and contains no restricted person profile. The 360 reader never joins `master.person_sensitive_profile`, evidence/checklist payloads, compensation, bill rates, or readiness projections. External workers now establish a workforce role without being shaped as suppliers. Supplier, customer, and network sections are applicable to a person only through a separate commercial role and their own permission.

## Restricted access

Restricted personal evidence continues through the workforce authority at `POST /api/neon/people/:personId/restricted-evidence/read`. The command requires:

- elevated authentication assurance before authorization or persistence;
- the dedicated workforce PII permission;
- an approved purpose and purpose-specific field allowlist;
- a value-free access audit plus the existing immutable disclosure audit row;
- private, no-store responses and a fifteen-minute maximum UI lifetime.

The client stores revealed values only in component memory. It aborts and clears them on close, expiry, unmount, Business Partner/scope/date/role changes, permission-epoch changes, and route navigation. No browser persistence API is used.

## Export and MESH boundary

Generic Business Partner export requests reject person/workforce field coordinates with `BUSINESS_PARTNER_EXPORT_WORKFORCE_FORBIDDEN`. Governed workforce-module exports remain a separate authority. MESH profile publication continues to prohibit `person.*` and `workforce.*` paths.

## Verification evidence

- HR, manager, ordinary-reader, and invisible/denied behavior is covered by policy/service tests.
- Default contracts and client parsers reject date of birth, national identifiers, compensation, rates, and protected evidence keys.
- Static database-contract tests prove half-open effective selection and sensitive-source exclusion.
- Workforce reveal tests prove step-up, purpose binding, expiry, permission use, and value-free audit behavior.
- Client tests prove scope/date/permission query isolation and restricted-key rejection.

Remaining release evidence: disposable-database tenant/RLS fixtures and full browser automation for permission loss/navigation cleanup.
