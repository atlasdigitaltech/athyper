# Business Partner invitation rollout

P5 replaces the supplier-owned write path with `document.business_partner_invitation`. The aggregate is tenant-bound and supports supplier, customer, and candidate journeys. Commercial and workforce coordinates are mutually exclusive database shapes; journey and requested role are immutable.

## Deployment sequence

1. Apply `20260829_neon_business_partner_invitation_generalization.sql`. It creates the generalized tables, copies existing invitations without changing IDs, moves the old table to `supplier_registration_invitation_legacy`, and exposes a security-invoker, read-only compatibility view at the old name.
2. Deploy the service. All new and compatibility HTTP routes controlled-write to the generalized repository. Reads may continue through the compatibility view during consumer cutover.
3. Verify counts and hashes by tenant, terminal-state parity, request foreign keys, RLS, permission scopes, resend/accept/cancel contention, and applicant recovery replay. Never export token or email hashes into application logs.
4. Cut consumers to `/api/neon/business-partner-invitations`, then monitor compatibility-view reads and legacy route use. Do not grant `INSERT`, `UPDATE`, or `DELETE` on the compatibility view.
5. Apply `20260830_neon_business_partner_table_streamlining.sql`. It aborts if any legacy invitation was not copied, migrates supplier-only recovery evidence to the generalized recovery authority, preserves applicant-access revocation on the invitation, and removes the three redundant backing tables.
6. Keep the read-only compatibility routes/view during the published consumer-retirement window. Remove them only after zero-use evidence; they no longer require a private legacy backing table.

Acceptance creates the draft request and terminal invitation transition in one transaction. Applicant ownership is checked directly against the accepted invitation and its one-way access-revocation fields; unused hard-coded field/action arrays are no longer persisted. A retry by the same applicant and request idempotency key returns the existing request. A different applicant/key, expired token, revoked access, or concurrent terminal transition fails deterministically. Recovery records immutable IAM orchestration intent and never rewrites historic ownership or creates a principal/request.

Live migration/RLS and authenticated browser verification remain environment-gated by `DATABASE_URL`, production Playwright session credentials, and seeded supplier/customer/workforce fixture IDs.
