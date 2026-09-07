# Local Atlas tool qualification

Deployment: local DEV, 2026-09-07. Ollama remains private, pinned, and without cloud fallback. The existing governed Atlas backend owns authentication, policy, persistence, and domain-command execution.

## Capability boundaries

| Plane  | Generation and history        | `bp_read_summary`                                  | `bp_submit_case`                                                          |
| ------ | ----------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------- |
| Neon   | Available to authorized users | Requires `neon.relationship.business_partner.read` | Requires `neon.relationship.entity_case.submit` and explicit confirmation |
| Mesh   | Available to authorized users | Not registered for this plane                      | Not registered for this plane                                             |
| Studio | Available to authorized users | Not registered for this plane                      | Not registered for this plane                                             |

All tools also require the plane's Atlas permission and current policy admission. A model cannot expand its registered tools or infer authority from prompt text. These two tools do not count suppliers, approve cases, materialize records, activate partners, merge records, or establish supplier/customer readiness.

The read requires a record UUID and, for scoped Neon records, an explicitly selected operating-organization UUID. It uses the existing authorized Records service, enforces a one-record result limit and a 2,048-byte gateway response limit, and projects only `code`, `display_name`, `status`, and `partner_category` after field authorization. Invalid schemas, unexpected source coordinates, missing provenance, oversized fields, and mismatched authorization profiles fail closed. Source values are untrusted data.

The published Business Partner descriptor currently has no row-version field. This deployment explicitly enables a `content-sha256:` revision of the captured authorized projection, alongside the real record UUID and compiled descriptor hash. This is a content citation, not a database row version or a basis for mutation concurrency. Other gateway consumers retain the strict default requiring an actual published version field.

## Mutation contract

`bp_submit_case` accepts exactly:

```json
{
  "governance": {
    "affectedEntityType": "entity_case",
    "affectedEntityId": "<existing validated draft UUID>",
    "expectedRowVersion": 2
  }
}
```

The model produces a preview; it cannot confirm the action. Confirmation binds the argument hash, target, version, principal, tenant, plane, authorization epoch/profile, and policy revision. Tokens expire after five minutes and are stored hashed in the proposal ledger. Execution reauthorizes; completed replay also checks current permission and policy. The backend invokes the existing Business Partner request service with `atlas:<proposalId>` as its idempotency key. Domain authorization, validation, optimistic versioning, and independent-review workflow rules remain authoritative.

A completed retry returns content-free evidence referencing the same workflow and revision. An active duplicate receives `TOOL_IN_PROGRESS`. If dispatch may have committed but the Atlas completion receipt cannot be persisted, the proposal remains `executing`; retries do **not** issue the command again. This deliberately requires operator reconciliation with the owning service's immutable command evidence. Automatic reconciliation is not implemented. Do not clear the ledger or generate another proposal to retry an uncertain action without establishing its domain outcome.

## Verification evidence

- AI suite: 160 tests passed, including malformed arguments/results, field redaction, exact citations, injection, permission denial/revocation, tenant/plane/principal isolation, expired/missing/invalid confirmation, argument binding, policy/epoch changes, cancellation, timeout, concurrent execution, and interrupted receipt persistence.
- Business Partner domain service focused suite: 37 tests passed; the final broader master-data run passed 242 tests with 25 skipped. No test result is a substitute for authenticated browser evidence.
- Authenticated Neon read: actual local-model `tool.completed`, `source.cited`, and `run.completed` events; user and assistant messages recovered after API recreation.
- Authenticated Neon mutation: missing confirmation 400, invalid token 400, altered arguments 400; concurrent requests returned 200 and 409; subsequent retry returned 200 with the same workflow identity and no result content.
- Actual domain negative checks: stale version 409; `catl.owner` submission denied 403. Live Atlas execution also rejected the expired five-minute confirmation with 409, the same-tenant non-owner with 403, and the separate ATHYPER tenant principal with 403.
- Domain command evidence contains exactly one accepted `entity.case.submit` for synthetic case `131cc997-40ce-432b-a684-d70959846f3b`. The service reports `pending_approval`, version 3, workflow `01a07aa4-24bf-756d-8215-fbb7f0bd50fb`. The canonical entity-case lifecycle calls that state `submitted`. No approval or materialization was performed. Retain the case and its audit evidence as a qualification fixture.
- Authenticated Mesh: chat and persisted history available, tools not admitted, Neon proposal execution rejected.
- Studio's fresh browser check is pending MFA; deterministic plane-capability tests pass. Do not describe that check as a current live pass until fresh authentication completes.

The read → chat → history rollback sequence passed authenticated Neon/Mesh admission and persisted-history checks; the qualified mutation stage was restored. All 48 running containers retained their recorded health state. DEV API/web readiness returned 200; QA API/web readiness returned 200 over the Docker network (QA public hostnames do not resolve from this shell).

Deployed API image: `sha256:0b98bed057e5451487c2b2df932e598a8675bce6bf894e8f5a47eda6f9c7bd41`. API and AI typechecks passed.

Private runtime receipts are under `~/.athyper/instances/dev/receipts/atlas-tools/`. They must stay outside Git. Do not copy authentication state or confirmation tokens into published reports.

The model initially generated malformed submission arguments from a loosely worded request; validation rejected them before execution. An explicit argument structure succeeded. This 4,096-token configuration also rejects prompts that cannot fit the tool schemas, system instructions, history, and output reservation. Follow-up tool answers may reduce their output reservation, with a 128-token minimum and the existing 1,024-token maximum; quota reservation covers the allowed tool rounds. These are real local-model limits, not broader natural-language workflow qualification.

## Reproduce the authorized read

Use a fresh authenticated Neon Playwright state and explicit record coordinates the user is authorized to access:

```bash
ATLAS_TEST_RECORD_ID='<authorized Business Partner UUID>' \
ATLAS_TEST_ORGANIZATION_ID='<selected operating-organization UUID>' \
ATLAS_TOOL_RECEIPT_DIR='<existing private directory outside Git>' \
node tooling/scripts/verification/verify-atlas-tool-read.mjs
```

## Reproduce the confirmed submission check

Use a fresh, authenticated Neon Playwright state in `tests/e2e/.auth/neon.json`. Prepare a **new synthetic validated draft** through the domain API; do not reuse the submitted fixture above. The verifier executes the requested confirmation and submits that draft for review.

```bash
ATLAS_TEST_CASE_ID='<synthetic draft UUID>' \
ATLAS_TEST_CASE_VERSION=2 \
ATLAS_TOOL_RECEIPT_DIR='<existing private directory outside Git>' \
node tooling/scripts/verification/verify-atlas-tool-submission.mjs
```

Compare immutable domain command evidence before/after concurrent confirmation and replay: exactly one accepted submission and one workflow identity. Use existing authorized test accounts for isolation; do not change their permissions to make negative checks pass.

## Staged controls and rollback

The local API supports these independent controls:

| Stage    | `ATLAS_AGENT_GENERATION_ENABLED` | `ATLAS_AGENT_TOOLS_ENABLED` | `ATLAS_AGENT_MUTATIONS_ENABLED` |
| -------- | -------------------------------- | --------------------------- | ------------------------------- |
| Mutation | true                             | true                        | true                            |
| Read     | true                             | true                        | false                           |
| Chat     | true                             | false                       | false                           |
| History  | false                            | false                       | false                           |

Keep `ATLAS_AGENT_ENABLED` and `ATLAS_AGENT_PERSISTENCE_ENABLED` enabled throughout rollback. Their route/history flags are not generation switches.

From the repository root, the local-only helper backs up the existing Compose overlay privately, preserves the current pinned API image and unrelated environment, recreates **only DEV API**, waits for readiness, and restores its previous overlay on failure:

```bash
node tooling/scripts/atlas/set-local-stage.mjs read
node tooling/scripts/atlas/set-local-stage.mjs chat
node tooling/scripts/atlas/set-local-stage.mjs history
```

Validate history and service readiness after each step. Restore a qualified stage with `node tooling/scripts/atlas/set-local-stage.mjs mutation`. This helper never recreates the database or inference container, removes volumes, changes QA, or rolls back schema/data.

If version rollback is necessary, restore the recorded prior API image in the backed-up overlay, or restore the previous pinned inference image/model lock and verify its existing artifacts before generation is enabled. Keep conversation databases, immutable audit/command evidence, the model volume, and offline artifacts. Never use `docker compose down -v` or delete proposal evidence to recover an uncertain command.
