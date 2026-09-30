# Atlas and platform CI remediation — 2026-09-30

The owner authorized a separate scope for Atlas and broader platform CI failures after Entity release PR #7. This branch is stacked on that PR so the Entity release remains independently reviewable. The exception applies to this CI remediation; it does not replace the standing Entity Framework architecture or authorize bespoke entity applications.

## First remediation batch

- Atlas: replace a removed Business Partner assessment-tool fixture with the current coordinator intent-resolution contract. Preserve assertions that missing scope completes with guidance, no provider invocation, no quota reservation, and no fabricated tool results or citations. No quota enforcement was disabled.
- Infrastructure: test each missing cloud-storage setting independently, including the AWS authentication mount. Docker interpolation order cannot determine the expected diagnostic. The fully provisioned render still checks separate workload profiles and read-only authentication mounts.
- BFF: trace the existing shared operation group and auth-session adapter in the architecture check. Keep IAM allowlisting, invalidation, server-only exports and bounded forwarding requirements.
- Toolchain: align the manually invoked metadata workflow with the repository's pinned Node version.
- Temporal: use shared parsing for thumbnail capability expiry and recovery cursor validation. PostgreSQL timestamp parsing is explicit; recovery retains the original microsecond-precision cursor string for database pagination.
- Authorization: register the four existing authorization helper identities and regenerate the source inventory. Authorization behavior and grants are unchanged.
- DDL coverage: regenerate coverage against the existing finance composition path; all 1,288 physical tables retain ownership coverage.
- Deployment: remove deleted bespoke Business Partner packages from required product lists and deleted packages from the frontend inventory. Regenerate package ownership from active workspaces. Existing dependency budgets are unchanged.
- Lint: correct stable hook dependencies, footer memoization and the search accessible label. Warnings drop from 240 to 230, below the unchanged 231 allowance; Entity server lint remains zero-warning.
- UI boundary: the generic searchable-select primitive owns its structural message interface instead of importing an Entity localization type.

## Validation

- Full workspace run: 201/201 tasks successful (includes cached results).
- Atlas: 238 tests passed; package typecheck passed.
- Publication: 392 tests passed, including multi-page recovery preserving timestamp precision.
- Cloud storage: eight render tests passed.
- BFF composition/security/common-operation contracts: 51 tests passed.
- Temporal: three tests passed, including explicit PostgreSQL offsets and ambiguous-input rejection.
- Form-detail, UI, temporal, publication and shell package typechecks passed.
- Thumbnail/reference browser checks: six passed. The initial expanded shell/footer/thumbnail run had 29 passes and four baseline failures. Follow-up repair aligned panel accessible names and connected the controlled query fixture; the complete shared-shell suite now passes 30/30, including all four former failures. See `atlas-meta-entity-rules-review-20260930.md`.
- Targeted checks passed: authorization inventory, temporal ratchet, Docker toolchain, BFF relay, DDL coverage, deployment profiles.

The full CI gate is still open. Targeted success is not release approval. No merge, deployment change, database mutation, policy-budget increase, undocumented-route exception expansion, or test disabling is part of this batch.

## Remaining work

1. Server boundaries: retire or relocate the orphan HR policy fixture that imports a deleted service; replace cross-package source imports with supported interfaces. Resolve the host bootstrap namespace and missing Entity governance contract ownership under the existing architecture rules.
2. Frontend boundaries: resolve actual shell dependency-budget excess, API-client localization/temporal layering, and foundation CSS/token ownership and size. Do not raise budgets to clear the gate.
3. OpenAPI: register request/response contracts for uncovered authoring, preference, attachment and host routes; do not expand the undocumented-route baseline.
4. Rerun full static policy, typechecks, root/browser tests, remote CI and infrastructure/service PostgreSQL workflows. Close the original release only when required checks pass.

DEV continues to use the original checkout. This isolated branch preserves concurrent UI/layout work there and does not claim that the new remediation commit is deployed.
