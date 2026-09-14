# Reveal coordinates and section-count correction

Explicitly approved at 17:25 MYT and deployed to isolated NEON. All eight API checks, positive bank/tax browser reveals, bank expiry/live revocation, compatible recovery and cleanup passed. Owner tax UI, staged summary revocation and final actor-attributed comparisons remain open; all access is expired/revoked. Revision **cd56f2c9e9219ab7a6e5e689fd8055dae4e7fba3f0f3346df14137c32af6eb25**.

The r3 run proved positive ordinary-case count 2, owner Requests rows/count omission, populated reveal affordance authorization, and direct bank/tax reveal success. Browser reveals failed because the full summary scope included `asOf`; the backend correctly returned `BP_360_HISTORICAL_READ_ONLY`. A separate manifest policy synthesized count 0 when independently authorized case counts were omitted. Neither defect is an intentional policy disposition.

This candidate projects both reveal queries to organization/company coordinates only and preserves omitted Requests/activity section counts. Seven policy tests and the reveal-coordinate regression pass; backend build and NEON production build pass. Both preview canaries return 200. The eight-group access rehearsal passes and rolls back without changing authority.

- Backend: `sha256:6f10821195bbb877b06d1fdf82a27d809cfd72fd9bb21eebb479a05681aa8932`
- UI: `sha256:0336cce9a4eb5b19c12c3f49f3ed2d5bbbfd05f456ce2132b5756348a72a4461`
- Release set: `9ac642780c5554b1b219b9f99695e80bd90360bfb4a5e2c1a0d208510e879fc7`
- Same five Studio-signed artifacts; isolated NEON only.
- Proposed new access: 43 permissions in eight new groups/memberships/assignments, only after approval and through **17:30 MYT on 12 September 2026**. This proposal expires then; it does not authorize a later window.
- Reuse existing two drafts; no creation, submission, approval or application. No secret writes. All r3 and older access remains revoked.
- UI remains a full current-workspace production build, not a binary-only patch. No shared DEV publication, Mesh, enforcement activation or compatibility retirement.

Approval is required because the previous exact proposal pinned different backend/UI images and its temporary groups are now revoked. Approval of this proposal does not accept policy differences.

[Exact proposal](../../governance/policy/reviews/business-partner-reveal-coordinates-execution-20260912.proposal.dev.json) · [Candidate](../../governance/policy/reports/business-partner-reveal-coordinates-candidate-20260912.dev.json) · [Preview validation](../../governance/policy/reports/business-partner-reveal-coordinates-preview-20260912.dev.json) · [Access rehearsal](../../governance/policy/reports/business-partner-reveal-coordinates-access-rehearsal-20260912.dev.json)
