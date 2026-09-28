# Deleted-export consumer decisions

Static audit after removing seven dead Neon barrel exports: **124 missing symbol
references in 25 import groups across 12 consumer files**. This includes inline
import types, ordinary type imports and tests. It is not a compiler result.
`deleted-export-consumers.json` records each symbol and its disposition.

All paths below are relative to `server/apps/platform-host/src/composition/`.

| Consumer | Disposition | Required preservation |
| --- | --- | --- |
| `register-services.ts` | Delete BP 360, projection, matching, disclosure, network and bespoke route registrations; replace reusable intake/case/verification/workforce mechanisms in owning capabilities | Generic entity HTTP routes, metadata readers, record scopes, IAM refresh, transaction actor stamping, job ownership and authorization |
| `create-container.ts` | Delete retired BP fields/types when registrations stop using them | Typed generic service ports; no untyped dictionary or replacement aliases |
| `entities/partner-capability-operations.ts` | Delete legacy registration | Published generic operation bindings and independently authorized handlers must replace any retained operation |
| `business-partner-bound-import.ts` | Replace retained import behavior with generic capability; delete BP version/parser registration | Version checks, validation, authorization, idempotency and transfer error handling |
| `business-partner-import-runtime.ts` | Replace with generic import capability | Scope admission, source validation, and owning-service errors |
| `business-partner-context-admission.ts` | Replace with metadata context hook | Catalog admission remains separate from organization-scoped action authorization |
| `business-partner-reference-admission.ts` | Replace with metadata reference hook | Active reference membership and field-path diagnostics; do not weaken validation |
| `entity-case-preflight.ts` | Removed unused BP adapter on 2026-09-27; no production caller. Historical BP harnesses are not generic-runtime acceptance tools. Future case behavior needs its own real generic capability, not a restored repository or stub | Validation freshness, decision ownership, separation of duties, assurance and version/workflow gates remain required for future workflow operations; Country read-only access does not depend on this adapter |
| `supplier-process-submission.ts` | Replace reusable submission logic in governed process/case service | Transaction locks, replay fingerprints, immutable snapshots and atomic submission |
| `business-partner-context-admission.test.ts` | Replace alongside generic hook | Keep context denial coverage |
| `__tests__/master-data-authority.test.ts` | Replace legacy authority fixture with generic security coverage before retiring it | Explicit deny, scope mismatch, missing bindings, MFA, entitlement, SoD and policy denial |
| `__tests__/master-data-vertical.test.ts` | Retire deleted endpoint coverage after retaining generic/contact-verification scenarios | Authentication and fail-closed unavailable behavior; no fake verification success |

## Applied changes

- Removed only the seven dead export statements from Neon; retained finance and
  generic record-scope exports.
- Onboarding returns before readiness registration for scheduler mode or absent
  transport. When selected with a transport but missing its database, its probe
  remains unhealthy; this is not converted into successful readiness.
- Extracted the exact-plane transaction coordinator into infrastructure, retaining
  the original actor stamping and unavailable-plane errors. Generic metadata and
  read HTTP composition remain in their shared modules.

## Work not yet completed

The classifications are an execution inventory, not a claim that their replacements
exist. Generic case service currently exposes repository ports, not a drop-in
replacement for `KyselyBusinessPartnerCaseRepository.getView`. Substituting its name
would discard workflow/validation evidence used by preflight. Legacy registration
blocks and container fields remain until their generic consumers are separated.

Phase A is incomplete. Phase B compilation/tests have not started. No deleted BP
implementation has been restored and no failing type has been hidden with `any`.
