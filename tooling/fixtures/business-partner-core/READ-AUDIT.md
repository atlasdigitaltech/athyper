# BP record read audit fixtures

Run `node tooling/fixtures/business-partner-core/read-audit-seed.mjs --dry-run`
to validate and roll back, or add `--apply --confirm=LOCAL-BP-READ-AUDIT` to commit.
The explicit target is `athyper-dev-db-1`, database `athyper_neon`, CATL tenant.

Both existing core demo partners receive 30 contacts, 30 industry declarations,
30 synthetic certificates, 30 relationships to separate synthetic counterpart
partners, and a comment thread at depths 0–5. All new values are demo data.
The seed requires the existing fixture-owned parent IDs, uses deterministic IDs,
rejects collisions/drift, and never overwrites an existing row or grants access.
Repeated execution validates the same rows.

Use industries and contacts to exercise page continuation and accumulation.
The relationship fixtures only appear where the caller's current descriptor and
counterpart permissions admit them; seeding a row does not grant visibility.
Reply availability follows the published entity binding, including its boundary.
Certificate readers currently return the entire applicable certificate collection.

Regression tests also cover denied counterpart rows, scope forwarding, one consumer
unmounting during a shared request, browser history and bounded authorization work.

## DEV verification

Applied additively to the existing CATL organization and person demo records; a
second dry run verified replay without drift. No reset, permission grant, or
protected bank-value change was performed.

Signed-in CATL owner checks verified industries and contacts across two API pages,
the industries **Load more** browser action, and controlled HTTP 409 responses
for invalid company scope on industries and certificates (instead of HTTP 500).
Follow-up with refreshed CATL admin session verified both organization and person
records: 32 industries and 31 contacts each across two pages without duplicates,
and successful industries **Load more** in both signed-in browser journeys.
The earlier person check used a mistyped UUID; the correct seeded person ID is
`13792b98-a65a-544f-8212-742ee48e74c6`.

Live comment reads verified reply permission at depths 1–4 and denial at the
published maximum depth of 5; the Comments popup also shows the maximum-depth
notice and no Reply action on the depth-5 comment. CATL admin access to a known other-tenant fixture
and a nonexistent record returns 404 without disclosure. Header/summary adapter
error translation was extended so domain denials do not become HTTP 500.

Network access was subsequently enabled by explicit user request for CATL admin.
The missing `neon.relationship.bp_target.network_read` catalog entry is now in
the clean-install seed. The signed CATL preview binds `network_read` to that
permission and uses tenant-record scope, matching partner-owned relationships
that exist without company/role assignments. Parent-read and counterpart checks
remain in force. The temporary exact-CATL read grant expires
**2026-10-02 03:05 UTC** (11:05 Kuala Lumpur); replay does not extend it.
No write or protected-value reveal permissions were added.

Setup/rehearsal commands (existing DEV only):

```sh
node tooling/scripts/local-dev/enable-catl-network-read.mjs --dry-run
node tooling/scripts/local-dev/enable-catl-network-read.mjs --apply
pnpm exec tsx tooling/scripts/local-dev/align-catl-network-read.mts --apply
```

Network continuation is normalized from the domain payload into the shared
collection cursor. Positive API/browser pagination is included in the live
verification script below; denied-counterpart pagination also has unit coverage.

Repeat the read-only checks from the repository root using a fresh saved session:

```sh
node tooling/fixtures/business-partner-core/verify-read-audit.live.mjs
```

## Progressive collection loading

Shared entity collections now request their next cursor page when the collection
footer approaches the scroll viewport. The verification script scrolls to that
footer without clicking and verifies automatic continuation for both demo types.
A styled, keyboard-accessible Load more button remains available. Loading disables
the button; transient failures retain loaded rows and offer an explicit retry,
without an automatic retry loop. Authorization failures remove the displayed data.
Comments and files keep deliberate manual pagination using the same styled control.
No pagination or authorization rule was moved into Business Partner-specific UI.
# Second record audit — 2026-09-25

Implemented in the shared runtime and the BP extension:

- Bank reveal now requires elevated assurance before a replay claim or restricted read. Identifier, tax, and bank reveal preserve legal-entity scope through client, route, command, and authorization.
- Capability actions are evaluated across the admitted parent scopes independently; admitting one action does not grant the others.
- Header catalog labels use the configured catalog resolver, without code-label fallbacks.
- Continuation errors preserve already-loaded comments and attachments; revoked access still removes protected content. Added explicit tests for both collaboration collections.
- Both legacy record aliases retain query parameters, including repeated parameters. Canonical entity URLs share a route helper; legacy workflow URLs are named separately.
- Certificate catalog names use `display_name`, not `custom_name`; issuing body is retained. Only certificate core/section metadata was replaced in the active release.
- Credit approval requires an explicit finite, non-negative limit and a three-letter currency; conditional approval also requires conditions. Customer and Supplier share required-field parsing and scope-panel presentation, not command authorities.
- Draft saves retain tenant fields absent from the current form; explicitly clearing a visible field removes that value.
- Identity uses one admitted overview projection instead of two section reads. The shadowed qualification handler mapping was removed.
- Eligibility checks run in ordered batches of at most eight, with one captured business date. This reduces serial latency but **does not eliminate per-partner eligibility queries**; no measured speedup is claimed.
- Data-request retries preserve list cursor/selection. Descriptor/authority changes still reload the descriptor. Filter editors share validation, and the extra divergent normalization check was removed.
- Record and collaboration preferences share guarded JSON storage. Reply availability uses the server's entity/tenant depth policy, not a client constant.

Verification: targeted service, provider, capability, header, client, and publication tests; affected TypeScript checks; signed-in CATL admin organization/person identity, certificate API/UI, alias redirects, pagination, reply boundary, and cross-tenant denial.

Certificate metadata publication: signed release **15**, compiled hash `sha256:57c6d400465e0f68817b24cfd27b394550ab901f12019e79918e5ec238d1be02`. Existing artifacts were carried forward. No reset, reseed, new instance, or permission grant was performed in this pass.

Re-run the read-only browser/API checks with:

```sh
node tooling/fixtures/business-partner-core/verify-read-audit.live.mjs
node tooling/fixtures/business-partner-core/verify-audit-fixes.live.mjs
```

The reveal assurance/scope regressions are automated service tests; this pass did not perform a new successful live reveal using a freshly elevated owner session. The full repository suite and a production deployment are not claimed.

## Manage/record recovery and isolation audit — 2026-09-25

- Bank capture masks account input and normalizes currency/country/BIC codes. Definite validation rejections (400/422) unlock correction with a new attempt; uncertain outcomes retain the same body/key for retry. Immediate duplicate submits are guarded, and record switches discard local account data and ignore late results.
- Record fetching depends on canonical context values, not object identity. Back/Forward section changes do not reload bootstrap. Leaving a section still clears revealed values.
- Bookmark mutations lock each pending record, roll back only their own records, and ignore obsolete scope/unmount completions. Unrelated successful toggles survive another mutation's failure.
- Normal Manage preferences are entity-and-surface scoped. In-place entity switches discard inherited filters/sort/columns; explicit destination deep links remain intact. Deliberately configured embedded lookup preference scopes are preserved.
- Identifier, tax and bank restricted readers share a storage contract. Malformed or conflicting protected flags/tokens cannot become plaintext. Normal banking availability uses the matching SQL contract, verified against DEV PostgreSQL with synthetic SELECT-only cases. Permission and assurance checks remain separate server gates.
- Combined relationship/governance scans allow at most 1,000 candidate authorization checks, with existing concurrency eight. Budget exhaustion fails explicitly rather than returning a truncated success page. A heavily denied graph may therefore return unavailable; this is a bounded-work failure, not proof that no more authorized rows exist.
- Both legacy redirects share validation/query preservation. Proxy and record authorization use the same canonical entity-path parser. Business title formatting and request/case status tones are shared. The completeness-outage comment now accurately describes unavailable completeness without denying identity reads.

`configureCompanyUsage` remains intentionally retired. The legacy authorization-path mapping is retained until the authorization catalog is migrated; changing it merely to match a UI route would alter security semantics. Domain-specific field allowlists remain closed rather than being replaced with permissive dynamic object projection.

Verification: 26 targeted frontend tests; 94 targeted service/database tests; Neon, BP product, platform-host and master-data TypeScript checks. Signed-in CATL admin checks cover both partner types, banking masked reads, Back/Forward without bootstrap reload, alias query preservation, paginated collections/network, reply-depth boundaries and cross-tenant denial. One initial browser heading timeout passed on rerun. A PostgreSQL regex repetition-limit error discovered during banking verification was corrected and covered by the SQL parity test.

Re-run the SELECT-only SQL parity test with `RUN_BP_DEV_SQL_CHECK=1 pnpm --filter @athyper/server-service-master-data exec vitest run src/__tests__/protected-storage-sql.test.ts`. Existing live scripts above remain read-only and now include Banking and history navigation checks.

No reset, reseed, metadata publication, permission grant, or retired-operation restoration was performed. New bank creation and successful live secret reveal were not exercised in this pass; their recovery/authorization behavior is covered by targeted automated tests. Full-repository verification is not claimed.
