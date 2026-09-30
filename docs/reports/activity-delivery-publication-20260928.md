# Activity deliveries — Country publication handoff

## Outcome

Delivery A root comparison, Delivery B reusable collections/capture contracts and Delivery C Timeline/audit UX are implemented and tested. Country's next source selects `platform.activity.standard` v2: Timeline, Audit log and Saved snapshots. It introduces no Country write operations, Versions, automatic capture, collection enrollment or permission grants.

**Publication completed: Country release 10 is active on Studio, Neon and Mesh.** Release `7de1fe58-8782-4674-933f-228c9ec5b849` was published through the approved workload on 2026-09-28. All three targets verified Ed25519 signatures and returned activation acknowledgements. Authenticated tenant UI acceptance remains pending.

## Prepared evidence

- [Current source/target baseline](activity-delivery-baseline-20260928.json)
- [Saved successor draft](activity-delivery-successor-20260928.json): draft `34d81ddc-cc14-4d36-87bc-8a416ca6496a`, revision 2, replay and stale-predecessor checks passed.
- [Validated publication-policy candidate](activity-delivery-policy-candidate-20260928.json): `entity.successor.b7e5b981-2227-4720-ba5d-040a48ab6842.10.activity-history`.
- [Runtime compiler checks](activity-delivery-runtime-20260928.json): API, worker and control API match the candidate compiler identity. All three restarted DEV services are healthy.

The saved Neon tenant browser session redirects to IAM sign-in. It does not establish authenticated live acceptance. Source DEV browser code reloads shared modules, and the signed successor binding is now installed. Tenant UI acceptance still requires a valid tenant application session.

## Governed publication evidence

The platform admin completed password + OTP authentication and proposed the exact candidate through the control API on 2026-09-28. Proposal `c7f75d49-9be5-4698-a2cc-678f0a929141` version 1 is `pending_approval`, with definition hash `a3c8f617e01262217e883b85091a70a88570a3089ef9b67076e0cf6bd1cff8f6`. See [proposal receipt](activity-delivery-policy-proposal-20260928.json). The independently authenticated owner subsequently activated this exact hash; workload execution dispatched release 10. See [owner approval](activity-delivery-policy-approval-20260928.json), [prepublication checks](activity-delivery-prepublication-20260928.json), [execution receipt](activity-delivery-publication-execution-20260928.json), and [three-plane verification](activity-delivery-publication-verification-20260928.json).

The existing control plane requires a fresh platform-control authenticated proposer and a different, independently authenticated MFA approver. This is enforced by `server/apps/platform-host/src/composition/shared/publication/policy-enrollment-routes.ts` and the policy enrollment authority, not an additional assistant confirmation rule. The old release-9 approval does not approve this new candidate.

1. Propose the exact candidate through `POST /api/studio/publication-policies`, using verified platform-control bearer context and `x-plane: studio`.
2. An independent elevated approver activates the returned policy UUID with its returned `expectedHash` through `POST /api/studio/publication-policies/:id/activate`.
3. Recheck compiler identity and source/target heads; execute the exact activated policy through the existing workload publication route. Regenerate the candidate if pins changed.
4. Confirm signed activation receipts on all three planes and inspect installed views/permissions. Only then mark publication complete.
5. Sign into the tenant application and run Country snapshot, Timeline, audit-filter, permission and side/full acceptance. Country's lack of a committed-version provider must keep Versions hidden.

Do not put tokens, passwords or OTPs in the report or chat. Future entity onboarding still requires its own provider, capture-scope, row/field authorization and live collection acceptance; synthetic fixtures do not enroll those entities.

## Installed runtime bindings

All three active payloads contain Activity profile v2 with `timeline`, `auditLog`, and `snapshots`, defaulting to Timeline. Both drawer and content layouts are enabled. Timeline/audit use `common.audit.event.query`; snapshot read/compare use `common.records.snapshot.read`; manual capture uses `common.records.snapshot.capture`. Existing grants were not changed. Country remains read-only with no Versions, automatic capture, or collection enrollment.

Publication gates 1–4 above are complete. Step 5, authenticated tenant UI acceptance, remains for manual verification.
