# Business Partner workbench — publication integration

Date: 2026-09-16

Status: Implementation and automated checks complete. The live exit condition (a Studio change confirmed active and visibly rendered in Neon) is pending authenticated DEV qualification and independent approval.

## Implemented flow

The shared workbench provides the following actions for the selected saved native graph:

1. Draft: validate, run contract tests, submit for independent review.
2. In review: acknowledge review of the selected saved revision, then approve through the existing server workflow.
3. Approved: select Neon and/or Mesh, then publish the approved revision.
4. Publication returns a source release ID: switch inspection to that immutable release.
5. Read target activation evidence with **Check target activation**.
6. Open a new Neon request and verify the changed visible text/layout.

Commands carry the saved `expectedRevision`. Unsaved local edits block lifecycle actions. Publication locks editing and workbench selection until the request completes. Failed or ambiguous commands require a reload; after a publish timeout the user is instructed to inspect existing releases before retrying. No auto-approval, role assignment, or implicit replay was introduced.

Submitted and approved change sets are included in the existing tenant change-set listing so a separate reviewer can discover them. Existing server checks remain authoritative, including reviewer separation and any permission/assurance requirements. The same actor cannot become an independent reviewer by ticking the UI checkbox.

## Activation read contract

`GET /api/meta-entity-authoring/inspection/releases/:id/activation`

- Requires Studio context and `publication.deployment.view` authorization.
- Resolves the requested Business Partner source release under the authenticated tenant before any target read.
- Returns no-store evidence for the source's declared target planes through the existing plane transaction coordinator.
- Resolves publication key through the source publication record with the existing native-entity fallback.
- Reads active release head, active applied release, published contract, and active entity-runtime descriptor for the same tenant/entity/plane.
- Requires a unique descriptor, the selected source release ID, and matching contract/source hashes before reporting `active`.
- Distinguishes `not_active`, `different_release`, `hash_mismatch`, and `unavailable`.
- Includes observation time, source release, applied-release ID, and descriptor hash. Target read failure never becomes a success or an empty green state.

This is activation inspection, not deployment queue discovery or retry. A compile/delivery failure may appear as `not_active` until its separate publication operations evidence is inspected. A source publication response alone does not prove target activation.

## Browser evidence

The panel deliberately distinguishes target activation from visible UI verification. A read-only browser verifier is provided:

```bash
node tooling/scripts/verification/verify-studio-workbench-neon.mjs \
  --studio-session /absolute/path/to/dev-studio-state.json \
  --neon-session /absolute/path/to/dev-neon-state.json \
  --release <published-native-release-uuid> \
  --expected-text 'Exact changed text visible on the new request page' \
  --output /absolute/path/to/local-evidence
```

The verifier checks authenticated plane/tenant context, confirms the expected release is active before opening Neon, waits for exact visible text on the new request page, checks that activation did not change during verification, and records JSON plus a screenshot. Choose a change visible on the initial new-request page; this script does not navigate conditional form sections or submit business data. It does not log in, elevate assurance, approve a release, or create grants. Session material is never copied into the evidence.

No DEV author/reviewer browser sessions were identified during this task; only QA sessions were found. They were not reused as DEV credentials. The requested live qualification needs the authorized DEV actors and a reviewed test change. No live tenant publication or browser-success claim has been made.

## Automated validation

- 15 component/model tests across workbench inspection, editing, and publication: saved revision payload, explicit approval acknowledgement, unsaved-edit guard, post-publish source selection, evidence matching and failed-refresh clearing, plus prior round-trip checks.
- 5 activation classification / host-wrapper / relay contract tests.
- 5 native-authoring route and publication-adapter tests, including deployment permission and source-tenant enforcement before target inspection.
- Business Partner UI package, Studio app, and platform-host typechecks passed during implementation.
- Browser verifier syntax checked; live execution is pending session availability and publication approval.

## Exit condition remaining

Use an authorized DEV author to save a small supported visible-text change, an independent reviewer to approve it, and an authorized publisher to publish to Neon. Refresh activation until the exact source release and hashes match, then execute the browser verifier. Retain the evidence before declaring the Stage 4 live exit condition met.
