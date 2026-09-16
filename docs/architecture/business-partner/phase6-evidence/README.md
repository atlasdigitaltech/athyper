# Phase 6 — Qualified broader configuration

Implemented and verified on 16 September 2026.

## Available in Studio

| Location | Capability | Qualification boundary |
| --- | --- | --- |
| Data Model / Validation → field placement | Require a value | Active, flat intake forms with supported choice-card or entity-lookup controls; production intake compiler must accept the complete result |
| Workflows → intake flow | Title, description, linear/free navigation, draft resume | Existing uniquely identified flows accepted by the production flow compiler |
| Workflows → flow step | Title, description, optional step | Existing step with valid parent, surface and operation references |
| Operations & Proof | Plane-specific permission, surface, scope, MFA and conditional-rule inspection | Selected stored graph; not a live user authorization decision |
| Operations & Proof → observed API denial reason | Guidance for missing permission, explicit deny, MFA, entitlement, operation binding and scope errors | User-supplied response code from the existing PermissionAuthorizer; resets when operation or plane changes |

Flow and rule changes use the existing working-copy undo, identity-based differences, optimistic revision save, reread comparison, and publication guards. Validation and Workflows use the composition editor exclusively for native drafts, avoiding two competing save states. Published sources remain read-only.

The native flow compiler was moved unchanged into the shared entity-runtime contract package. The server metadata module re-exports it, so frontend qualification and backend projection use the same implementation. Existing condition objects, operation references, field definitions, and unknown graph properties are preserved.

The workflow tree exposes native intake flows and steps. Operation rules are inspectable under their operations. No new CSS or global styles were introduced; controls use the existing shared components and scoped structural panel layout.

## Explicit boundaries

- This delivery edits **intake presentation workflows**, not Business Partner approval workflows. Approval policies, lifecycle transitions, matching policies, operation authorization rules, and arbitrary validation expressions remain read-only.
- Field requiredness executes in the intake renderer. Server-side business validation remains authoritative and is not rewritten by this control.
- Permission inspection identifies incomplete/conflicting declarations and explains observed backend denial codes. It does not fetch another user's grants, grant permissions, or infer effective access from publication data. Live diagnosis still requires target-plane identity, tenant, active release, scope and session evidence.
- No live database save or Neon publication was performed for Phase 6. The existing live draft revision 60 remains untouched.

## Verification

| Check | Result |
| --- | --- |
| Frontend configuration, composition, save, review and publication regression tests | 44 passed across 11 files |
| Backend authoring validation / contract tests / compilation of rule and workflow changes | 1 qualification test passed |
| Existing server intake projection regression tests | 5 passed |
| TypeScript: Studio product, Studio app, shared entity-runtime contract, server metadata | Passed |
| Browser: required rule save, workflow save/reload, undo, unrelated-data preservation | Passed |
| Browser: target-plane selection, observed denial guidance, stale-reason clearing | Passed |
| Browser: 390px mobile overflow / page errors | None |
| Live mutations | Zero |

Browser evidence uses the development Studio shell with intercepted authoring responses and in-memory saves. It proves client interaction and round-trip handling, not persisted database changes or target activation.

## Evidence

- [Browser check](browser-check.cjs)
- [Results](browser-check.json)
- [Fixture](graph-fixture.json)
- [Workflow controls](workflow-desktop.png)
- [Mobile diagnosis](diagnosis-mobile.png)

Run the browser check from the repository root with the local Studio service and saved Studio development session available:

```sh
node docs/architecture/business-partner/phase6-evidence/browser-check.cjs
pnpm --filter @athyper/product-studio-business-partner exec vitest run src/composition-configuration.test.ts
pnpm --filter @athyper/server-plane-studio-meta-entity-authoring exec vitest run src/__tests__/configuration-editor-qualification.test.ts
pnpm --filter @athyper/server-platform-metadata exec vitest run src/__tests__/intake-projection.test.ts
```
