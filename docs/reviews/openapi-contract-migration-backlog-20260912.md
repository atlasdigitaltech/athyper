# OpenAPI contract migration backlog — 12 September 2026

Status: open; explicitly deferred from the mechanical cleanup by the user. `openapi:check` remains blocking. This document records migration work, not an exception or release approval.

## OpenAPI contract migration remaining

The scanner now identifies 152 undocumented operations across 19 source files, including 27 aliases previously hidden by unresolved helper calls. The exception baseline has not been expanded. This is a behavioral contract migration: inspect request parsing, response shapes, errors and authorization for each operation; register its contract and verify runtime behavior. Static documentation coverage alone does not qualify a deployed release.

| Source                                                                                  | Undocumented operations |
| --------------------------------------------------------------------------------------- | ----------------------: |
| `server/packages/planes/mesh/src/business-partner-bank-disclosure-routes.ts`            |                       4 |
| `server/packages/planes/mesh/src/business-partner-network-exchange-routes.ts`           |                       7 |
| `server/packages/planes/mesh/src/business-partner-profile-publication-routes.ts`        |                       4 |
| `server/packages/planes/neon/src/business-partner-account-bank-linkage-routes.ts`       |                      14 |
| `server/packages/planes/neon/src/business-partner-profile-match-routes.ts`              |                       5 |
| `server/packages/planes/neon/src/business-partner-profile-projection-routes.ts`         |                       5 |
| `server/packages/planes/studio/meta-entity-authoring/src/learning-routes.ts`            |                       7 |
| `server/packages/planes/studio/meta-entity-authoring/src/routes.ts`                     |                       3 |
| `server/packages/platform/preferences/src/entity-views-routes.ts`                       |                       2 |
| `server/packages/services/master-data/src/business-partner-eligibility-routes.ts`       |                      15 |
| `server/packages/services/master-data/src/business-partner-governed-import-routes.ts`   |                       1 |
| `server/packages/services/master-data/src/business-partner-invitation-routes.ts`        |                      28 |
| `server/packages/services/master-data/src/business-partner-request-routes.ts`           |                      28 |
| `server/packages/services/master-data/src/governed-internal-business-partner-routes.ts` |                       4 |
| `server/packages/services/master-data/src/local-contact-challenge-routes.ts`            |                       2 |
| `server/packages/services/master-data/src/supplier-workforce-requisition-routes.ts`     |                       3 |
| `server/packages/services/master-data/src/worker-engagement-iam-routes.ts`              |                       1 |
| `server/packages/services/master-data/src/worker-engagement-lifecycle-routes.ts`        |                       2 |
| `server/packages/services/master-data/src/workforce-routes.ts`                          |                      17 |

## Suggested migration sequence

1. Studio learning/authoring and saved entity views: identify current public request and response types and owner authorization requirements.
2. BP eligibility and request reads: document actual projections, filtering, permission metadata, errors and compatibility aliases.
3. BP commands, imports and invitations: include idempotency/replay status codes, validation failures, authorization and external invitation flows.
4. Mesh publication/disclosure/exchange and Neon account/profile integration: retain the separate plane and disclosure gates.
5. Workforce requests, lifecycle, IAM projections and restricted evidence: cover every finite route and its provider-owned response.

## Exit criteria for each batch

- Inspect the handler and service contracts; do not infer schemas from path names or use generic object schemas to silence coverage failures.
- Use `defineRouteContract` and `registerContractRoute` with unique operation IDs, request schemas, success/error responses and accurate permission metadata. Aliases need distinct method/path registrations.
- Verify valid/invalid requests, denied access, error responses and response-schema validation. Preserve existing behavior unless a separate change is explicitly reviewed.
- Remove only exceptions whose operations were actually migrated. Never expand the frozen baseline or extend expiry.
- Run the OpenAPI policy tests, affected runtime/service tests, `openapi:check` and `urls:check` after regenerating the catalogue.
- Validate the exact deployed specification separately before asserting deployment coverage. Keep runtime enforcement unchanged until complete coverage is established for supported capability configurations.

See [the contract migration runbook](../runbooks/openapi-contract-migration.md) for the existing policy and deployment verification requirements.
