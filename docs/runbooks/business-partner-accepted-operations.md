# Accepted BP operation implementation

Run from the repository root:

```sh
pnpm exec tsx tooling/scripts/verification/prepare-business-partner-accepted-operations.mts
```

This DEV-only preparation command refreshes the activation-head/catalog snapshot
using repeatable-read, read-only queries. It rejects changed candidate contents,
heads, proposals, reviewer nominations, missing/conflicting/non-MFA approvals, or
an exported receipt set that differs from the authenticated workflow's durable
state. It does not change catalog rows, grants, deployments or activation.

The generated [selection](../../governance/policy/reports/business-partner-accepted-operations.dev.json)
contains 27 dedicated plane-seed permission definitions with empty assignments,
15 retained permission bindings, and nine explicit deferrals. Both native profile
and full descriptor parsers validate the output. Its selection hash binds the
exact descriptor, definitions, operation proposals and approval receipt hash.
These are preparation artifacts; existing release coordinates identify the base,
not a newly published release.

The authorization profile now supports `deferredOperations`. Deferred names are
unique and cannot also have executable bindings. Target evaluation returns
`unavailable`; the enforcing backend cannot replace it with a legacy allow.
The BP mapping recognizes dedicated target capabilities and preserves explicit
deferrals before field remapping. Legacy/shadow enforcement is unchanged.
Older strict parsers reject the new property, so this descriptor requires the
compatible parser/runtime deployment; it must not be sent to an older runtime.

The generated target descriptor removes deferred actions, generic writable fields,
and all legacy import mutation modes. List/header/section presentation references
use the same operation permission and scope. Direct create/patch regression tests
use the actual generated descriptor and an always-allow legacy authorizer, and
verify that no mutation, audit or outbox action occurs. These are service tests,
not authenticated deployment qualification.

## Concrete open dependencies

The [readiness report](../../governance/policy/reports/business-partner-accepted-operation-readiness.dev.json)
records the current missing catalog permissions and release gates.

- The 27 permission definitions are prepared, not installed. Native compilation
  needs real catalog IDs. Installation must create no permission assignments or
  widen existing scopes.
- The included `import` gateway still requires per-mutation authorization. Every
  current bulk mode depends on deferred create/update semantics and remains
  unavailable. A governed-request import adapter needs an explicit reviewed
  proposal; this generator does not infer that semantic change.
- Owning services must call the selected dedicated bindings, with actual callable
  handlers, stored ownership and workflow preflight. A source reference is not a
  runtime registration. The selection marks all bindings unqualified.
- Native compilation needs the complete authored release, installed catalog IDs,
  trusted runtime registrations, release-bound review evidence and the configured
  signer. No signed BP artifact is produced by this command.
- Authenticated reads, commands, providers, fields, exports, AI, revocation,
  company-owned records and independent children must qualify that exact signed
  release. Previous legacy command evidence cannot satisfy this gate.
- The separate 29 policy-difference groups still require regression evidence and
  accepted dispositions. Operation proposal approvals do not accept them.

After these gates pass, present the exact signed release, explicit grant diff,
entity/plane rollout and revocation-preserving rollback for enforcement approval.
Do not retire compatibility paths before activated-path parity is established.

## Catalog milestone update (2026-09-10)

The 27 definitions above are now installed in DEV, with no grants, via the
catalog-only transaction in `install-business-partner-target-catalog.mjs`.
The dry run and committed receipt prove the exact proposal-bound definitions and
unchanged non-catalog authorization tables. The readiness check now correctly
recognizes `published` catalog status (scope rows use `active`). The refreshed
report lists zero missing catalog permissions. This supersedes the earlier
catalog-installation prerequisite; runtime registration, signed compilation,
qualification and policy-difference acceptance are still open.
