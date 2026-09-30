# Approved isolated qualification access — 12 September 2026

Status: **applied to the isolated clone; authenticated business qualification remains open.**

The user explicitly approved the two exact proposals in this conversation. The [approval record](../../governance/policy/reviews/business-partner-enter-access-20260912.user-approval.json) records that decision; it is not an authenticated `catl.owner` or `catl.admin` review receipt. Proposal files and earlier evidence remain unchanged.

- Business revision: `2b7f0041ec7fd67b8bdc59d7c06ea950bf4c50cef6f315a61337584e9945621c`.
- Atlas revision: `e3fcb693492924eedee0d0b53053a2934aa9310df3a6bba6fbbc8cb6d29de16a`.
- Window: **12 September 2026, 05:15–09:15 MYT**. No renewal is scheduled or authorized.
- Destination: `athyper-bp-enter-db`, database `athyper_neon`, network `athyper-bp-enter-isolated`.
- Runtime artifact: `45ddc85ece1f453e84b1eccc0cea9ca141fe9847c68ab7d2500e7d347d7b75fc` on image `671d0d5abecbfc16790e2d8e643222171eed8d1b5ab485b3b4048b466439fc47`.

Both proposals were committed in one database transaction after fresh dry runs. The transaction created six new roles, groups, memberships and scoped assignments, totaling 45 permission assignments. Catalog flags, scope propagation, current principals, running image/network, exact artifact and current validity window were checked. Existing revoked assignments were not restored.

Post-application inventory confirms 26 active permission paths for `catl.admin` and 19 for `catl.owner`. Only admin received Atlas admission. All new assignment and membership windows end at 09:15 MYT. MFA, independent case approval, source constraints, record/field authorization and tool restrictions remain enforced.

Shared Studio/NEON/Mesh authorization and activation fingerprints matched before and after application. Protected isolated tables, including permission definitions, denials, overrides, ACLs, delegations and activation, also matched. No enforcement rollout was performed.

The first attempt rolled back before insertion: a newly added guard incorrectly compared the local applied-release ID to the source publication release ID. The corrected guard joins the activation head to `runtime_meta.applied_release` and checks its source release and artifact hash. Both fresh dry runs then passed before the successful commit.

Evidence:

- [Atomic application receipt](../../governance/policy/reports/business-partner-enter-access-20260912.application.dev.json).
- [Fresh access inventory](../../governance/policy/reports/business-partner-enter-qualification-access-20260912.after-application.dev.json).
- [Business pre-application dry run](../../governance/policy/reports/business-partner-enter-test-access-20260912.preapply.dry-run.dev.json).
- [Atlas pre-application dry run](../../governance/policy/reports/business-partner-enter-atlas-access-20260912.preapply.dry-run.dev.json).

These are grant-path checks, not authenticated API/UI/Atlas allow receipts. Normal sessions and any required MFA must still be used for business journeys. Child publication/runtime integration, isolated UI, ownership, recovery and policy-evidence acceptance remain separate engineering/qualification work. Cleanup must revoke only the six new memberships/assignments identified by these proposal revisions, retaining their audit history.
