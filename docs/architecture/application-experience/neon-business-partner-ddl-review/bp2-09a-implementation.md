# BP2-09A — partner-level Banking implementation, 2026-09-23

Status: **complete for the recorded BP2-09A acceptance scope**. Release 19 remains active. BP2-09B is optional company-usage control, not a partner visibility prerequisite.

## Final refresh and resolution handoff — 2026-09-23

- Successful Banking commands now evict record resources across context/locale variants for the same tenant, principal and authorization epoch. Mounted compiled workspaces refetch bootstrap/header/summary and the active Banking section, preserving navigation and aborting stale requests. The legacy 360 summary also subscribes. Registration receipts and retry keys survive the local refresh; identity changes still discard them.
- `verify-bp209a-refresh.dev.mjs` passed using normal CATL admin login and the **existing registration idempotency key**: HTTP 200/replayed, the same account/link, refreshed Banking, retained receipt, and one correctly scoped summary-invalidation event. No additional account was created. Three hook tests separately prove actual bootstrap/summary refetch, active-section preservation, other-identity isolation and rejection of late pre-command responses. This is combined browser/automated evidence, not a claim that a new live bank write changed a mounted summary during this check.
- The user approved a new native command: `POST /api/neon/protected-bank-registrations/:bankAccountLinkId/provisional-resolution`. Body: `institutionId`, optional `branchId`, and a nonempty `evidenceReference` of at most 512 characters. Normal browser calls use the existing relay/CSRF contract. Use an independently reviewed existing directory institution; never manufacture a global entry to make this command succeed.
- Existing `neon.business_partner_bank.verify` authority and normal MFA remain mandatory. Maker/checker separation is enforced against the account creator. The command is tenant-local, requires an active/effective institution and compatible branch in the submitted jurisdiction, refuses shared-reference/multi-owner cases, and cannot replace a terminal resolution. Identical mapping retries return `replayed=true` without another write or audit.
- Only provisional `status`, `resolved_institution_id`, and `resolved_branch_id` change. The protected account, verification, ownership, company usage and global directory do not change. The atomic `business_partner.bank_provisional.resolved` audit retains target coordinates, checker identity, an evidence-reference digest and `accountUnchanged=true`; it does not log the raw evidence reference or protected identifier.
- `setup-bp209a-resolution.dev.mjs` rehearsed with rollback, then installed the exact audit contract and three-column application update grant. Forced tenant RLS remains enabled. Submitted-name update and global-institution insert privileges remain false. No human permissions were added.
- Disposable app-role acceptance passed **9 grouped checks**, including native independent verification followed by resolution, wrong-institution branch denial, transactional audit-failure rollback, same-mapping replay, terminal-map replacement denial, byte-for-byte unchanged verified account, masked projection refresh and cross-tenant hiding. All synthetic directory and account changes rolled back.
- Live native checks: CATL owner reaches directory validation (**400** for an intentionally nonexistent institution); CATL admin is denied (**403**); cross-tenant `athyper.admin` receives **404**. Both populated compiled browsers pass under release 19. The live synthetic provisional reference intentionally remains **unresolved**: no legitimate existing-directory match was established. A successful live mapping is **not claimed**; successful resolution is proven in the disposable fixture.
- Verification: **39 native unit tests**, **10 Banking UI tests**, **3 refresh tests**, and Neon source, Banking UI, form-detail and relay typechecks passed. Publication did not change: this follow-up adds a native command, scoped database prerequisites and runtime invalidation, not new metadata artifacts.

BP2-09A is closed for this recorded scope. BP2-09B remains optional and unstarted. Real unresolved references still require an independent directory review before the command is used; shared-reference cases deliberately require a separate multi-owner workflow.

## Approved authorization follow-up — 2026-09-23

Both separately approved grants are applied in local CATL:

| Principal | Sole new permission | Scope | Role ID |
| --- | --- | --- | --- |
| `catl.admin` | `neon.business_partner_bank.register` | CATL tenant, exact | `01a0cccc-f33f-7062-bbf0-a03d366fb767` |
| `catl.owner` | `neon.business_partner_bank.verify` | CATL tenant, exact | `01a0ccd2-b538-78a2-a837-879abe21afc9` |

Registration uses a dedicated permission, not `neon.relationship.entity_case.create`. The registration permission retains the former creation risk/MFA settings (medium; no MFA required for capture); verification remains critical with MFA and SoD required. No reveal, request-create, company-usage or remittance grants were added. Supplying a company on registration now additionally requires the existing company-scoped apply permission, so a registration-only grant cannot configure company usage.

Reproducible local administration scripts: `setup-bp209a-registration-access.dev.mjs` and `setup-bp209a-verification-access.dev.mjs` under `tooling/scripts/verification/`. Each rehearsed with rollback before applying and stops on an existing role rather than duplicating or broadening it. Canonical permission seeds include the new registration permission and permitted tenant verification scope for future builds, without automatic human grants.

### New live evidence

- Native registration: **201**, subsequent identical request **200 / replayed=true**; company ID is null, zero company-usage rows.
- Synthetic account: `2740c8e1-996d-4026-9b91-f3797eda10bc`; ownership link: `bed9956c-b66e-49ad-8454-8195a9d2fc1b`; provisional reference: `01a0cccf-0f15-7e5d-8f95-c98fcf570896` (`unresolved`). This is explicitly synthetic and not for payment.
- Missing native registration/reveal audit contracts were installed from exact canonical seed blocks. Unknown bank events still fail closed. Registration has a retained `business_partner.bank_registration.protected` audit receipt, with no raw identifier.
- The live normalizer was older than canonical source and initially derived display suffix from the stored fingerprint. `reconcile-bp209a-bank-normalizer.dev.mjs` installed only the canonical function and corrected only this unverified synthetic account's derived suffix to `3000`, after rollback rehearsal. Account identity, fingerprint, protected token, verification, ownership and usage were unchanged. The correction has a `record.row_updated` service-account audit receipt listing only `account_last4`, `updated_at`, `updated_by`.
- Repository registration now refuses a mismatched stored suffix, preventing the same deployment drift from silently succeeding again. Disposable acceptance deliberately installs the old behavior inside a savepoint and proves this failure.
- Normal CATL admin and owner: **200 masked reads**, suffix `3000`, no protected token/raw identifier, no company assignments. Both compiled browsers display **populated** account/link/provisional groups under release 19 without company context or an error boundary.
- Normal cross-tenant `athyper.admin`: **404** for both the partner Banking section and the protected-registration link. No additional permissions were granted to that actor.
- Admin verification remains denied (no checker grant). Owner verification now reports **403 `NEON_BANK_STEP_UP_REQUIRED`**; its grant does not bypass MFA. Admin reveal remains 403. Normal MFA step-up and refreshed saved states were requested; the saved BFF session's elevated label is not proof of elevated API token assurance.

**Refreshed-session follow-up:** CATL owner independent verification returned **200**. The account is now `active`, `is_verified=true`, method `manual_review`, with `verified_by=645b6a55-3355-526a-9643-3900425bde47`. The retained `business_partner.bank_registration.verified` audit receipt records the owner, distinct from the admin registration receipt. Both actors' masked reads return `verified=true`, suffix `3000`, and no company assignments. Both populated compiled browsers pass again. Registration replay remains 200 and returns the same account/link.

**Admin MFA follow-up — passed:** After the next normal session refresh, admin bank reveal returned **200** and matched the protected synthetic value. The same reveal claim returned **409 `BP_360_REVEAL_REPLAYED`**. Database reconciliation found exactly one `business_partner.bank_account.revealed` receipt for this link, attributed to CATL admin, and zero occurrences of the raw synthetic identifier in CATL audit payloads. CATL owner reveal remains **403** with no value returned. An admin ordinary Banking read after reveal remained masked (`3000`) and verified. The registration, independent verification and reveal audit receipts each occur once, with distinct maker/checker principals.

There is no remaining MFA blocker for the recorded reveal acceptance. The verified synthetic account has **zero company-usage assignments** and is **not applied as preferred remittance**; verification does not authorize payment. The provisional reference remains `unresolved`, with no global institution created. The final refresh/resolution checks are recorded above.

## Implemented boundary

- Banking resolves the partner and authorizes masked bank facts without company, organization or role selection. Legacy company-tagged ownership links are visible through the authorized partner reader. Company-usage details still require their own authorization.
- Protected registration accepts no company ID and resolves an active partner without requiring a supplier or supplier-company profile. It creates an account, ownership link and tenant-local provisional reference, but no company usage. Existing company-specific commands remain separate.
- Masks, opaque protected storage, tenant boundaries, bank authorization, independent verification, canonical composite constraints and the existing purpose-bound audited reveal path remain in force. Only the two separately approved single-permission roles above were granted; no blanket grants were made.
- Account, ownership-link and provisional-reference collections use the existing Banking handler and a closed field projection. Raw account identifiers, fingerprints and protected-storage tokens are not included. Multiple ownership links do not duplicate account-resource rows.
- Dependent bank-directory lookups retain institution filtering and now return namespace and effective dates alongside scheme and jurisdiction. A reference miss creates only a tenant-local unresolved provisional reference, not a global bank institution. Resolution remains a governed owning-domain operation; no generic resolution endpoint was added.
- Registration creates protected material only after source validation and the idempotency lock. Callback failures discard their new capture; an ambiguous transaction-commit failure does not delete potentially committed material. The form reuses its key after timeout until its inputs change. Operator reconciliation is still required if discard itself fails.
- Registration and verification refresh Banking and invalidate scoped compiled/legacy summaries. Tenant/principal/auth-epoch changes unmount the registration state. See the final-check evidence and its live replay versus automated-refetch distinction above.
- Browser relay explicitly allows the existing registration, read and decision endpoints, with tenant/CSRF controls, bounded bodies and required registration idempotency. It does not expose a generic account-write endpoint.
- Treasury house configuration and payment-method setup are unchanged.

## Activated release

Only three artifacts changed from active release 18: Banking presentation and two new read-only Core artifacts. Unrelated working-tree edits were not included.

| Evidence | Value |
| --- | --- |
| Source release | 19 |
| Studio release ID | `82d55f2f-99e2-5622-863b-55870eab9c8e` |
| Neon applied release ID | `01a0ccc1-1e65-74fa-91a2-982f409060e4` |
| Envelope hash | `202d9e22d322d64c2fb7a802db7d16705207ea7ac2ffa57fca2089d36235a96b` |
| Compiled release hash | `sha256:fd8199195121b8f69f1aef102f75be5438295e40bdc13a078abb4600cd64b0cb` |
| Artifact count | 105 |
| Signature | Ed25519, scoped DEVFULL author/publisher workloads |

The compiled Banking endpoint returned this hash and `bank_accounts`, `bank_account_links`, `bank_provisional_references` for normal CATL admin and owner sessions, without company parameters. Both browsers rendered all three groups without an error boundary. The initial empty-fixture check was followed by the populated and independently verified checks recorded above.

## Checks

- Native bank-linkage unit tests: 29 passed, including no-company creation, dedicated registration authority, company-usage denial, explicit MFA denial, failed-capture cleanup, maker/checker and prohibition on implicit company remittance.
- Banking workspace/verification UI tests: 10 passed, including dedicated-permission affordances, no-company request and retry-key reuse.
- Commercial-controls service tests: 11 passed, including company-independent partner admission.
- Reveal revocation, affordance and preflight tests: 15 passed.
- Shared-reference lookup tests: 4 passed.
- Source/type checks passed for Neon source, master-data, records, Banking UI and browser relay. The broader Neon **test** typecheck still fails in pre-existing bank integration imports (`pg`, relative linkage import) and profile-match `displayName` fixtures; no new BP2-09A diagnostics remain.
- `tooling/scripts/verification/verify-bp209a.disposable.mts`: app-role no-company creation with no supplier/company membership; no company usage created; tenant-local provisional submission; masked independent reads including legacy company-tagged links; inaccessible/cross-tenant link denial; institution/branch mismatch rejection. Runs only against the labelled disposable database and rolls back all fixture changes.
- `tooling/scripts/verification/verify-bp209a-surfaces.dev.mjs`: two normal actors, signed compiled groups and company-independent browser rendering. Read-only; does not forge sessions or grants.

## Initial authorization blocker (resolved) / remaining acceptance

The initial live registration attempt found a missing relay allowlist entry (404), now fixed. The subsequent attempt reached native authorization and returned **403 `FORBIDDEN`** for CATL admin's existing `neon.relationship.entity_case.create` authority. Both normal sessions are authenticated; this is **not** an MFA/session-expiry problem. No live bank registration was created by these attempts.

The user subsequently approved the dedicated CATL admin registration grant and, separately, CATL owner verification. Both were applied as recorded above; general request-create authority remains unchanged.

The remaining refresh/handoff checks are now completed for the scope described above. Independent verification, authorized audited reveal, replay denial, unauthorized reveal denial and post-reveal masking pass. Existing automated revocation checks remain separate from live permission-denial evidence; no live grants were revoked for this check. BP2-09B company-usage/acceptance restrictions have not been started.
