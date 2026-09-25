# Athyper BP adoption: verified preflight

> Follow-up: [read-contract reconciliation](athyper-bp-read-contract-reconciliation-20260925.md)
> supersedes the initial diagnosis below. The cleaned domain read permissions and
> tenant-owned network facts are intentional; the old callable registration was
> stale. Do not restore retired target read permissions from this initial report.

## Outcome

**Not activated.** The requested end-to-end DEV deployment reached the real
host's signed-artifact runtime qualification and failed closed before artifact
storage, durable approval, release publication, dispatch or activation writes.
Additional read grants would not repair this failure.

Candidate: `5e4ab67e8501f56b5b7533822d1f06302e37e0377777444fd644210925e15c6f`.
Tenant: `11111111-1111-4111-8111-111111111111` (Athyper).

## Newly confirmed blocker

The candidate's native authorization profile is not compatible with the current
`createBusinessPartnerReadRuntimeRegistrations` contract. The host's verified
loader rejects these 18 operations:

`activity_read`, `addresses_read`, `attachments_read`, `bank_read`,
`certificate_read`, `comments_read`, `contacts_read`, `discover`, `enter`,
`identifier_read`, `identity_read`, `navigate_manage`, `navigate_overview`,
`network_read`, `qualification_read`, `read`, `requests_read`, `tax_read`.

Examples:

| Operation | Candidate | Registered host contract |
| --- | --- | --- |
| `read` | `neon.relationship.business_partner.read` | `neon.relationship.bp_target.read` |
| `enter` | `neon.relationship.business_partner.read` | `neon.relationship.bp_target.enter` |
| `comments_read` | `neon.collaboration.comment.read` | `neon.relationship.bp_target.comments_read` |
| `network_read` scope | `tenant.record.v1` | `organization-company.record.v1` |

This is a permission/scope contract mismatch, not missing signing credentials or
an expired browser session. Successful local-preview rendering is not evidence
that the same descriptor passes published-runtime qualification.

## Code prepared and exercised

- `tooling/scripts/local-dev/deploy-bp-adoption.mts`: owner-only inputs, pinned
  candidate hash, Athyper-only scope, DEV container checks, secret transport on stdin.
- `deploy-bp-adoption-worker.mts`: boots host registrations without starting queue
  consumers; freshly signs inner/outer artifacts; exercises the real verified
  loader. Its subsequent approval, immutable artifact storage, synchronous paired
  dispatch, acknowledgement and targeted invalidation stages remain **unverified**
  because qualification correctly stopped execution. This is not a completed
  general-purpose product-publication or durable background-job implementation.
- `start-runtime.sh`: allowlisted source-DEV adoption command reuses normal
  secret-file/environment loading; does not launch another queue consumer.
- Host composition exposes its verified publication loaders for paired adoption.
- Loader errors preserve the underlying runtime qualification cause while
  retaining the public `RUNTIME_INCOMPATIBLE` error code.

Validation command:

```sh
pnpm exec tsx tooling/scripts/local-dev/deploy-bp-adoption.mts --check
```

The command deliberately exits unsuccessfully for this incompatible candidate.
Fresh signatures were produced for preflight only, not persisted as published
artifacts. Do not bypass qualification or grant permissions to force activation.

## Evidence

- Publication authorization-compiler, adoption-plan and coordinated-adoption
  tests: **36 passed**, including rejection of a validly signed artifact whose
  runtime bindings cannot qualify, with its diagnostic cause preserved.
- Host source TypeScript check passed.
- Studio releases referencing this candidate hash after the check: **0**.
- Athyper native/compiled adoption heads: **absent**.
- Existing shared compiled BP head remains
  `0c37e4c13904b0586c4b591e906ee5e80753f3e57a99f4affd37a6c2e6e154fa`.
- No permission grants, schema changes, business-data changes or CATL preview
  changes were made by this deployment attempt.

## Required next decision

Reconcile the native candidate's authorization contract with the approved
MetaEntity read/scope design. Decide whether the published descriptor should use
the current target-permission contract, or the host should support the intended
canonical read contract explicitly. In particular, resolve the network scope;
do not silently substitute tenant-wide access for company-scoped access.

Then generate a new content-addressed candidate, qualify it against the host,
record approval for that exact new hash, and exercise paired deployment and
Athyper signed-in verification. The current candidate's approval must not be
silently transferred to changed authorization semantics.
