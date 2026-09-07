# Neon finance API migration and HTTP review

All 29 finance route contracts now use `/api/neon/finance/*`: five foundation routes in the platform host and 24 descriptors in the Neon finance composition. HTTP methods, operation IDs, existing permission identifiers, service ownership, and feature flags are preserved. The five host handlers remain in the composition package.

## Compatibility and rollout

This is a breaking URL migration with no aliases or redirects. Repository searches found no active frontend finance callers. External consumers were not inspected; any such consumers must migrate in the same rollout. The old `/api/finance/*` paths return 404. Update externally maintained clients, gateway policies, and monitoring that match the old prefix before deploying.

The development URL catalogue and current route manifests are regenerated from source. Historical legacy route evidence and the captured deployed Swagger inventory are intentionally retained as historical evidence. Source declarations do not imply enabled or deployed routes.

`AUTH_REQUIRED_ACTIONS_MATRIX` is an allowlist of paths permitted while an identity action is pending. The former environment example described it as a blocking matrix and would exempt finance paths. The example now documents the actual semantics and keeps finance outside the allowlist; runtime IAM defaults already block finance while required actions are pending.

## Findings corrected

- **Authorization before side effects:** HTTP contract permission metadata did not itself enforce authorization. All finance handlers now check the immutable permission snapshot before invoking services or enqueueing work. This also protects rounding resolution, whose resolver does not authorize requests itself. Posting admission gains missing `finance.ledger.post` metadata and an explicit gate; its requested domain permission remains checked by the posting guard. Planning approval uses `finance.planning.approve`. Queue submissions carrying commitment or asset reversals additionally require the reversal permission.
- **Misrouted reversals:** budget, commitment, and tax reverse endpoints accepted ordinary command payloads. They now require linked reversal evidence. Close reversal previously dispatched ordinary FX/intercompany execution; those unsupported reversal kinds now return 400. Linked asset reversal remains supported. Invalid close recovery kinds are rejected before enqueue.
- **Version preconditions:** host error conversion overwrote existing `HttpError` statuses. Existing HTTP errors are now preserved. Period transition accepts positive bare or quoted versions, rejects malformed/unsafe values with 428, and documents the required header. Invalid versions in body evidence return 400 rather than 428.
- **Response contracts:** missing 400/404 declarations could convert expected finance failures into 500s when response enforcement was enabled. The relevant foundation contracts now declare those outcomes. A missing inventory balance returns 404 rather than an undefined success body.
- **Input validation:** command envelopes require their command ID/code, idempotency key, fingerprint, and object payload. Numeric query values must be positive safe integers. Inventory rebuild requires canonical coordinate fields and ignores extraneous fields when building job identity.
- **Planning side effects:** run identity, output array shape, and each output's run ownership are checked before creating or enqueueing the run.
- **Missing dependencies:** missing service methods consistently return 503, including dynamic inventory/planning dispatch. An unavailable durable queue returns 503 rather than 500.
- **Rounding evidence:** invalid rounding slots are rejected instead of silently falling back to currency defaults.
- **Generated inventories:** the catalogue's finance adapter recognition now tolerates formatted source. Current route manifests include descriptor-generated routes, with regression coverage for all 29 finance operations. Historical baseline extraction is unchanged.

## Validation and limits

HTTP tests use the real runtime, request validation, OpenAPI contract auditing, response enforcement, and local HTTP requests. Domain services and queues are mocked in these transport tests. Coverage includes all 29 successful route bindings, authentication failures, missing permissions, Neon context checks for both other planes, legacy URL rejection, disabled registration, trusted actor propagation, and regressions for the corrections above.

The complete Neon package suite, finance service suite, finance host HTTP/import-boundary tests, URL catalogue/manifest tests, and host/Neon typechecks are run for this change. The finance service suite includes a PostgreSQL integration test that is skipped without its database environment. No deployment or live finance mutations were performed.

This review covers route registration, HTTP dispatch, authorization boundaries, relevant service interfaces, error/response handling, configuration, and generated documentation. It is not certification of every accounting algorithm or database behavior. Domain payload schemas remain broadly described as objects, with domain validation owned by services. Planning and cross-book persistence followed by queue publication remains a two-step operation; transactional outbox redesign is outside this route migration.
