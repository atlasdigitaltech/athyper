# Final isolated NEON qualification closure

Explicitly approved and executed. All closure UI, comparison and staged-revocation checks passed; fresh access is revoked and cleanup complete. Final disposition acceptance was separately recorded and validated at 17:46 MYT; 66 accepted, zero pending. Revision **209dc2e06de6fbfddbe2837def200a9f176273b2199fb375a00f4f4568ed77ed**.

The deployed r4 candidate passes all eight populated API checks, browser bank/tax reveals, tax close clearing, bank expiry and live reveal revocation, compatible recovery and cleanup. No additional product build or deployment is proposed.

The following three evidence gaps were addressed by the closure run:

1. Owner tax UI must finish loading its progressive section and show no reveal affordance. Its API permission denial already passed; the browser wait timed out.
2. After independent case-read revocation, summary counts must remain omitted while the parent is still readable. The 17:30 expiry cut off the r4 summary/parent checks; both returned403. Requests-provider revocation passed.
3. Run the final comparison routes sequentially for each actor. Retained r4 traces cover 60/66 rows but have no per-actor attribution; they do not replace the accepted actor-specific baseline. Explicit acceptance of final intentional differences remains separate from execution approval.

Proposed access is the same 43 permission assignments and eight fresh groups/memberships/assignments, only after approval through **18:00 MYT on 12 September 2026**. All r4 and older groups remain revoked. The deadline is a proposed new window, not an extension already applied. Normal authenticated sessions and current MFA assurance must pass before insertion. Rehearsal passed and rolled back with authority unchanged.

Pinned deployed backend: `sha256:6f10821195bbb877b06d1fdf82a27d809cfd72fd9bb21eebb479a05681aa8932`; UI: `sha256:0336cce9a4eb5b19c12c3f49f3ed2d5bbbfd05f456ce2132b5756348a72a4461`; release set: `9ac642780c5554b1b219b9f99695e80bd90360bfb4a5e2c1a0d208510e879fc7`. Same five Studio-signed artifacts.

No new drafts, submissions, approvals, applications, secret writes, shared DEV deployment, Mesh, enforcement activation or compatibility retirement. Retained records and approval/audit history stay intact. New access is revoked at completion or cutoff.

Approval is required because the prior execution window ended at 17:30 MYT and all of its grants are revoked. This proposal does not authorize disposition acceptance.

[Exact proposal](../../governance/policy/reviews/business-partner-final-closure-execution-20260912.proposal.dev.json) · [Access rehearsal](../../governance/policy/reports/business-partner-final-closure-access-rehearsal-20260912.dev.json) · [Consolidated r4 evidence](../../governance/policy/reports/business-partner-r4-consolidated-qualification-20260912.dev.json)

[Completed closure evidence](../../governance/policy/reports/business-partner-final-closure-consolidated-20260912.dev.json) · [Final disposition acceptance packet](business-partner-final-binding-66-dispositions-20260912.md)
