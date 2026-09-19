# Internal supplier onboarding — P1a implementation

Date: 2026-09-14
Status: Shared integration, ready live DEV previews and all three profile/document catalogs are implemented and qualified. P2 submission ownership and P3/P4 runtime execution remain separate packages.

## Existing policy owner

The [policy service](../../../server/packages/platform/policy/src/policy-service.ts) now exposes `evaluateExact`. It resolves a tenant-local definition by row ID, version, content hash, entity type and effective date. The repository accepts published/active revisions; it never substitutes a newer active row. It returns the existing evaluator's decision and trace, with evaluator identity. Stored and freshly calculated definition hashes must agree. Explicitly injected evaluators must provide their version before exact evaluation can produce evidence.

The [repository](../../../server/packages/platform/policy/src/kysely-policy-repository.ts) returns definition hashes and reads SQL dates as text, preventing a local time zone from shifting a date before hash verification. The [cache](../../../server/packages/platform/policy/src/cached-policy-repository.ts) delegates every exact lookup directly to the repository. Generic action precedence, first-match behavior, simulation and audit semantics remain unchanged. Exact evaluation is read-only; the governance owner persists accepted evidence.

## Scoped authoring and selection

The [publication owner](../../../server/packages/platform/control-admin/src/cycle/process-selection-publication.ts) builds one existing-policy definition: Enhanced at priority 10, Standard at 20 and Basic at 30. Every action is `require_workflow` with the P1 typed profile result. Profile coordinates are supplied by their publication owners, not invented by the builder. Existing policy authoring and activation must precede binding publication.

Publication compiles the complete binding through P1, checks every referenced revision using the supplied publication authority and saves an immutable scope-specific binding. A scope comprises tenant, plane, process family, operating organization and exact nullable company. SQL exclusions reject overlapping effective periods, including direct inserts and concurrent publishers; an advisory lock gives the normal publisher an early overlap error. Policy row ID and definition ID must match because this policy owner stores revisions on definition rows. Global definitions and cross-family bindings cannot compile for this adapter.

The [governance adapter](../../../server/packages/platform/governance/src/process-selection/process-selection-service.ts) accepts only a case identity and verified request context. Its case/domain port must authorize the operation and load the saved snapshot, requester assertion/reason and current domain-owned minimum-control authority under the caller's transaction. No browser preview result or client-provided minimum is accepted.

The adapter requires exactly one scoped publication, recompiles the binding against available owners, evaluates the exact policy, validates the typed winning action, and resolves the candidate manifest. It applies the strongest required floor and retains mandatory gates from both the publication and current domain authorities. Missing authorities, ambiguous scopes, unavailable revisions, unsafe results and `none` fail closed. The generic policy `permitted` flag cannot authorize work.

Basic maps to Simple, Standard to Standard and Enhanced to Enhanced. Basic with a Standard/Enhanced minimum keeps Basic as the assertion/candidate and records the raised effective profile. Supplier type and ownership are not routing facts; the Intercompany + Enhanced fixture still selects Enhanced.

## Preview and durable evidence

Preview returns `ready`, `incomplete` or `unavailable`; authorization failures propagate. It writes no evidence or work. The [HTTP registrar](../../../server/packages/platform/governance/src/routes/process-selection-routes.ts) exposes `GET /api/governance/process-selection/cases/:caseId/preview`, rejects query/body fact injection and marks responses `no-store`. The registrar is mounted in the DEV source API and allowed through the rebuilt NEON BFF relay. [Host composition](../../../server/apps/platform-host/src/composition/supplier-process-selection.ts) uses the existing scoped case-read authorizer and repository inside the preview transaction. Snapshot lookup requires the same case row version as the authorized proposal, preventing mixed-revision facts without asking for update privileges. Missing cases and denied access retain 404/403 HTTP semantics.

`select` re-resolves server facts and validates the case/snapshot/manifest against the caller's exact run/attempt/selection coordinates. The [evidence repository](../../../server/packages/platform/governance/src/process-selection/kysely-process-selection-evidence.ts) persists policy/evaluator/fact revisions, fact hash, authority as-of, candidate/effective profiles, controls, full manifest, actor/reason/time and idempotency identity. Trace distinguishes matched, evaluated-false and not-evaluated rules.

Evidence is insert-only. An identical append returns the original record and accepted time; altered evidence or conflicting case/attempt/idempotency identities fail. Database triggers prohibit update/delete, tenant RLS is defined, and deferred case/run foreign keys require P2's owner rows before transaction commit. P2 must retrieve accepted evidence before re-evaluating a submission replay and atomically commit selection, case, run, attempt and intents. This adapter has no cycle/workflow/document creation port. A storage failure cannot return an accepted selection.

Canonical common control/governance DDL contains the binding/evidence tables, constraints, immutability triggers, RLS and grants. No migration script was added.

## Qualification and handoff

[Machine-readable evidence](internal-supplier-onboarding-p1a-evidence.json) records real PostgreSQL qualification against canonical DDL inside a transaction that is deliberately rolled back. Tests exercise actual policy rows/rules, scoped publication resolution, all three selections, trace storage/readback, append replay/conflict handling, a newer active successor, wrong hash rejection and database immutability/overlap constraints. The existing policy owner's published-rule mutation guard also rejects an attempted change.

Profile/workflow/document/fact/minimum-control catalog references in these tests use an explicit controlled registry; they are not installed as live catalogs. The deferred acceptance foreign keys are installed in the test transaction, but synthetic case/run identities are not committed. This proves repository and transaction behavior, not a completed supplier journey or persistence across a runtime restart. P9 remains responsible for full real-catalog/rendering/storage qualification.

Verification: 81 policy tests, 116 governance tests and 27 publication-compiler tests passed. The final focused selection/HTTP run passed 19 tests. Policy, control-admin, governance and platform-host typechecks passed; the three affected platform packages build successfully.

Reproduce:

```sh
pnpm --filter @athyper/server-platform-policy test
pnpm --filter @athyper/server-platform-governance test
pnpm --filter @athyper/server-platform-control-admin exec vitest run src/cycle/process-selection-compiler.test.ts
pnpm exec tsx tooling/scripts/verification/qualify-supplier-onboarding-p1a.mts
```

The database script uses the existing local DEV database and secret file without printing credentials. Its tables, fixture policies, evidence and other test writes roll back. No live selection policy, placeholder catalog, accepted cycle or new grant is activated by qualification.

P1 remains accepted. P2 consumes the selection service and evidence repository with the real case/domain authorization and minimum-control owners. The authored live catalogs are documented below; P3/P4 still own task execution and document jobs/gate callbacks. P8 presents the mounted owning preview in NEON task/intake views. Post-submission profile changes (B), classification policy (C), cycle ownership, reviews, document generation and activation are not implemented by P1a.

## Live mounting and catalog wiring — completed 2026-09-14

The [catalog adapter](../../../server/packages/platform/control-admin/src/cycle/process-selection-catalog.ts) now supplies the real compiler reference resolver and current minimum-control reader. Existing policy definitions, cycle revisions and template versions/bindings retain their owning repositories. Task workflows are compiled by the existing workflow authoring service and embedded in immutable scoped reviewer-policy publications. Verification checks exact IDs, versions, hashes and relevant owner coordinates (including cycle type, template binding/locale/variant, and task workflow code/definition revision). It does not retarget a requested workflow revision to the current head.

A canonical immutable `control.process_selection_catalog_revision` table holds process-only profile, manifest, projection, reviewer-policy, recipient-policy, fact-schema and minimum-control publications. Reads validate content hashes, named identity and exact tenant/plane/process/organization/company scope. Ordinary runtime access is read-only. Domain owners must author actual definitions; no empty authority or synthetic profile is treated as published.

The storage installer reads the new definitions from canonical DDL and installs tenant RLS, normal runtime grants for the new objects, immutability guards and deferred acceptance foreign keys. Governance row auditing is installed through its existing owner function. Replaying installation created no additional tables or data. The publication resolver reads immutable rows without an update-requiring row lock; overlap constraints remain authoritative.

The source API and NEON images were rebuilt and deployed, with base-image rollback receipts retained. The initial NEON staging copy changed a dependency symlink and failed startup; the prior image was restored, symlink preservation was corrected, and the successful replacement passed dependency checks. Both final containers are healthy.

Live qualification uses five existing P1 cases without creating or editing cases. Four configured drafts return HTTP 200 with `ready`; Basic selects Simple, Standard selects Standard, and Enhanced selects Enhanced. Their manifests contain 2/3/10 tasks respectively and all three document purposes. The draft without a requirement remains `incomplete / PROCESS_REQUIREMENT_MISSING`. Caller-control query injection, missing cases and anonymous access return 400, 404 and 401. A real authenticated browser opens the existing form and obtains a ready preview through the NEON relay.

**Live policy and catalog authoring is complete in local DEV.** The exact tenant/NEON/organization/company publication now resolves real policy, profile, cycle, workflow, template, projection, recipient, fact-schema and minimum-control revisions. Preview performs no submission, case decision or cycle creation.

Checks for this mounting: 36 relay contract/security tests and 27 compiler tests passed; control-admin and platform-host typechecks passed; the affected server packages/contracts and NEON built. The real PostgreSQL qualification also passes against installed tables, including minimum-authority content/owner/scope checks and cycle-type/revision verification. Its synthetic rows roll back.

```sh
node tooling/scripts/verification/install-supplier-process-selection-storage.mjs
pnpm exec tsx tooling/scripts/verification/qualify-supplier-process-preview-live.mts
```

The deployment helper `deploy-supplier-process-selection.mjs` consumes completed builds and preserves local image/compose rollback receipts. Live and database qualification receipts are embedded in the P1a evidence JSON.

## Live catalog authoring — completed 2026-09-14

[Canonical authoring input](../../../server/apps/platform-host/src/provisioning/supplier-process-catalog.ts) supplies the planned Simple, Standard and Enhanced sequences. The [local publisher](../../../tooling/scripts/verification/publish-supplier-process-catalog-live.mts) validates cycles through the shared cycle owner, publishes immutable cycle revisions, and atomically publishes the remaining catalog artifacts and scoped policy binding. Replaying it checks the existing contents and reuses revisions. It creates no migration or authorization grant.

The live policy is revision 1, ID `3da19ca2-7809-5355-8505-788526996cf2`, hash `e81fe0c463c99346c7f836137a828e0d1861ea2a26b82f50540f8f8fe4d0b3ef`. It contains one first-match definition with the three requirement rules. The authored Business Partner minimum is Simple with readiness and activation gates retained; stronger-minimum behavior remains covered by isolated qualification fixtures.

Eight task-specific reviewer-policy artifacts contain compiled workflows. Simple and Standard tasks have one level; the five Enhanced review/approval tasks each have two, with all-reviewer then count quorum. Each policy pins a 48-hour due policy, reminders, escalation, submitter exclusion, scoped decision permission and blocking behavior for empty candidates or insufficient quorum. Local DEV maps selectors to its existing active `dev.bp.approvers.operating_organization` role. Role presence is checked; per-task eligibility resolution, actual votes, permission enforcement and outcome delivery are P3 execution acceptance, not inferred from a ready preview.

[Exact workflow lookup](../../../server/apps/platform-host/src/composition/supplier-process-workflow.ts) verifies the enclosing reviewer-policy hash and the workflow owner's compiled hash, code, definition identity, version and full scope. It returns the immutable task definition, without consulting the active case-wide workflow head.

The three published English/default templates are submitted review pack, decision document and activation confirmation. Their bindings pin submitted/decision/result snapshots, the review/materialization/completion gates, projection field allowlists and authenticated recipient policies. Content is escaped by the existing strict renderer and includes source snapshot provenance. Synthetic qualification data was rendered through real Gotenberg and scanned clean by real ClamAV for all three purposes; sample PDFs and checksums are retained in the qualification report. These samples are not case documents. Authorized snapshot projection execution, durable storage/jobs and callbacks remain P4 work.

Authoring found and fixed the policy owner's draft-update trigger: it previously returned `OLD` for updates and silently prevented activation. Canonical DDL now returns `NEW` for allowed draft updates and still rejects changes to published/active revisions. A real PostgreSQL regression proves draft activation persists and subsequent mutation is rejected; its test writes roll back.

Additional validation: 795 control-admin tests and 65 workflow tests passed; workflow, control-admin and host typechecks passed. The database-wide typecheck remains affected by existing cross-root source imports (`TS6059`); the new authoring module is covered by the passing host typecheck. Real published-catalog checks cover all eight workflows, wrong hash/definition/version/company rejection, the three template checksums and live rendering/scanning. The original P1a PostgreSQL qualification still passes with its fixture policy name isolated from the live policy.

```sh
node tooling/scripts/verification/install-supplier-process-selection-storage.mjs
pnpm exec tsx tooling/scripts/verification/publish-supplier-process-catalog-live.mts
pnpm exec tsx tooling/scripts/verification/qualify-supplier-process-catalog-live.mts
pnpm exec tsx tooling/scripts/verification/qualify-supplier-process-preview-live.mts
```

Receipts: [publication](../../../governance/policy/reports/supplier-process-catalog-publication.dev.json), [catalog/render qualification](../../../governance/policy/reports/supplier-process-catalog-qualification.dev.json), [live previews](../../../governance/policy/reports/supplier-process-preview-live.dev.json). P1a no longer has a missing live-configuration acceptance item. P2–P9 runtime acceptance and follow-ups B/C retain their separate scopes.
