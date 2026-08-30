# Business Partner 360 definition-driven completeness — BS360-09

Status: In progress  
Date: 2026-08-30

## Definition and evaluation boundary

The verified local STUDIO `neonPartner360` descriptor now carries seven versioned requirement packs: organization base, supplier organization scope and payable company scope, customer organization scope and credit company scope, person base, and active workforce. The NEON parser requires the complete compatible pack set and rejects prohibited capability fields before evaluation.

Completeness is guidance, not operational readiness. It consumes only allowlisted presence/verification facts selected for the caller, explicit role and scope coordinates, `asOf`, definition hash, and the policy-visible field set. A restricted verified identifier or bank fact is represented as `restricted_verified`; it can satisfy a requirement but carries no value. Required and recommended outcomes are returned separately.

The fingerprint is built from applicable pack versions, selected coordinates/date, definition and policy fingerprints, and evidence used by applicable requirements. Unrelated facts and unrelated Business Partner version changes do not perturb it; the evaluated response still carries the Business Partner version as its concurrency coordinate.

## Failure and action behavior

The definition consumer reads the last valid locally activated publication, so a STUDIO control-plane outage does not require a live call. If that local publication is absent, incomplete, incompatible, or prohibited, the summary returns `definition_unavailable` for completeness while retaining canonical identity, roles, manifest, and open-work data.

Missing-data links are emitted only after server authorization and point to governed request or owning-domain flows for amend, role addition, organization assignment, company configuration, bank change, employment change, lifecycle, qualification, and certification. Historical views are explicitly read-only and contain no action links. The UI only renders the capabilities returned by the server and owns no master-data mutation.

## Verification evidence

- Focused evaluator tests cover restricted presence, relevant-only fingerprints, historical action suppression, incompatible definitions, and prohibited-field rejection.
- Master-data, publication, contract, and NEON client typechecks pass.
- Master-data, publication, and NEON client test suites pass.
- The existing Phase 1 recursive response guard remains active over the composed summary.

Remaining exit evidence: disposable-database boundary fixtures for all seven packs, browser automation for permission loss and every governed destination, and integration validation against a rolled-back last-valid STUDIO publication.
