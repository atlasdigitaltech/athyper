# Corrected summary counts and reveal UI qualification

Revision **bb769f8f806da7788ea26b6d6cc2fa1f4ed4a304486c8dc22dca5d63f47e8bd6**. Explicitly approved and deployed to the isolated NEON runtime. Authenticated qualification ran; all eight temporary groups are now revoked. Recovery and cleanup passed. Browser reveal and manifest count defects remain; see the 17:23 MYT checkpoint.

The prior authenticated run created two ordinary drafts, returned count 2 to admin, and omitted Requests-provider rows/counts for owner. Staged child revocation, final API/command/Atlas denial, compatible recovery and cleanup passed. It exposed an additional summary leak (owner received activeRequestCount 2), an overview query missing the organization, and current tax reads being marked historical. These are defects, not accepted intentional differences. The prior candidate is not fully qualified.

The corrected candidate filters summary counts and recent activity by independently authorized case IDs in SQL, rechecks authorization before return, and omits restricted counts. The overview preserves the selected company/organization pair. Current tax requests omit the historical date unless explicitly selected.

Validation: 42 service tests (including two new service-to-child-authorizer checks), 8 UI tests, SQL preview for authorized subsets 1/2 and unauthorized omission plus live-change rejection, backend build/typecheck, BP UI typecheck and NEON production build. Named backend/UI canaries return health 200. Authenticated qualification is incomplete: direct reveals and filtered Requests counts pass, but browser reveal coordinates and synthesized manifest zero counts require the next correction.

- Backend: sha256:eb1f026967f5636b4aa7cba622deee5704d07d8799b903a06d5225bff1748aa1
- UI: sha256:d678bff3a73f6bc5c353c9e467fd62eb4ebdb0ae6b26daa35f6d07b555a10978
- Release set: facbda5fee4b05d8144111e24de6d715dafec85c581fe4143ab5019fea1d6808
- Five existing Studio-signed artifacts unchanged.
- Window: **after explicit approval through 17:30 MYT today**; no extension.
- **43 permissions in eight NEW groups/memberships/assignments**, same scopes as the prior approved run, with case-create removed.
- Reuse the two existing drafts; do not create, submit, approve or apply cases.
- All previously revoked/expired access stays unchanged. Revoke the new access at completion or cutoff.

Approval covers the corrected pinned images and these fresh isolated grants. No secret writes, shared DEV publication, enforcement activation, compatibility retirement or Mesh qualification. The UI is a full current-workspace build (Next.js 16.3.3), not a narrow binary patch. The original 66-disposition acceptance remains on its accepted revision; fresh comparison evidence will not rewrite it.

[Exact proposal](../../governance/policy/reviews/business-partner-summary-context-execution-20260912.proposal.dev.json) · [Candidate manifest](../../governance/policy/reports/business-partner-summary-context-candidate-20260912.dev.json) · [SQL preview](../../governance/policy/reports/business-partner-summary-open-work-preview-20260912.dev.json) · [Access rehearsal](../../governance/policy/reports/business-partner-summary-context-access-rehearsal-20260912.dev.json)
