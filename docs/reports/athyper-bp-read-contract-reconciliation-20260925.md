# BP adoption read-contract reconciliation

## Disposition

The 21 read-operation contracts have been reconciled with the cleaned domain
permissions, current section metadata and live Neon permission catalog. The
replacement passes the actual host's verified signed-artifact loader.
**It is not approved or activated.** Four unrelated non-read permission references
remain unresolved; the deployment preflight now explicitly reports them and
rejects an apply attempt with unresolved permission references.

Replacement candidate:
`f8fbe4ccbbae56efe7de7fe9dd7f930449722584b2b41e58eb0aef5670594b0e`.

Superseded source candidate:
`5e4ab67e8501f56b5b7533822d1f06302e37e0377777444fd644210925e15c6f`.

Both are retained under the owner's local DEV candidates directory. An intermediate
candidate `21a15077…` is also retained for provenance; it is not the final candidate
and is not allowlisted by the deployment check.

## Authority and correction of the previous diagnosis

The September 24 cleaned-baseline notes in
[the coordinated implementation record](../architecture/application-experience/business-partner-coordinated-implementation.md)
explicitly replace retired target read aliases with canonical domain permissions.
The older corrected-release fixture predates that cleanup and is not the current
permission authority. Live catalog inspection confirmed most target read aliases
are absent. Restoring them would be the wrong reconciliation.

The read runtime now uses the same `BUSINESS_PARTNER_360_PERMISSIONS` constants as
the owning providers. Callable registration and candidate reconciliation share
one read-operation contract; neither accepts arbitrary candidate handler names.

| Concern | Reconciled contract |
| --- | --- |
| Entry, discovery, directory and record read | `neon.relationship.business_partner.read`; tenant scope |
| Identity/contact/address/identifier/tax/bank/qualification/certificate facts | Existing domain read or masked-read permissions; tenant scope |
| Comments and attachments | Existing `neon.collaboration.*.read` permissions; tenant scope; downstream capability checks remain |
| Relationship/governance facts | Retained `neon.relationship.bp_target.network_read`; tenant scope, matching current tenant-owned provider and catalog |
| Requests and activity | Existing domain permissions; operating-organization scope, not tenant scope |
| Credit | `neon.relationship.business_partner_credit.read`; operating-organization authorization |
| Supplier/customer company profile reads | `neon.relationship.business_partner.read`; operating-organization authorization |

**Authorization scope is not data context.** Company/credit providers still receive
the organization and company coordinates and retain their scope/membership checks.
Changing the permission resolver to the catalog-supported operating-organization
scope does not remove the provider's company-context requirement. Network facts
are not Mesh exchange, payment release or transaction eligibility authorization.

## Candidate delta

The candidate has three permission replacements (credit and two company-profile
reads) and five scope corrections (credit, requests, activity and two company-profile
reads). Its compiled artifacts, write/reveal operations and other descriptor data
are preserved. Reconciliation checks handler identity, parent-read, effect, target,
discovery and preflight semantics and refuses unexpected drift. Re-running it is
idempotent. Approval is reset to required and never inherited from the source.

## Verification

```sh
pnpm exec tsx tooling/scripts/local-dev/reconcile-bp-adoption-candidate.mts --write
pnpm exec tsx tooling/scripts/local-dev/deploy-bp-adoption.mts --check --candidate=f8fbe4ccbbae56efe7de7fe9dd7f930449722584b2b41e58eb0aef5670594b0e
```

The second command returned `status: qualified`, `readCatalogVerified: 21`,
`activationChanged: false`, and `readyForApproval: false`.

- Host read-runtime, stored-scope and authorization-deployment tests: 17 passed.
- Publication authorization/compiler and paired-adoption tests: 36 passed.
- Host source typecheck and publication package source/test typechecks passed.
- Checks cover canonical metadata agreement, rejection of historical drift,
  handler/parent-read drift, copy-only/idempotent reconciliation, preserved
  company coordinates and propagated provider denials.
- No grants, permission-catalog writes, database schema/data changes, durable
  approval rows or activation-head changes were performed.

## Remaining full-candidate approval gates

Follow-up: the four catalog blockers below were resolved in DEV by the
[governed-operation catalog reconciliation](athyper-bp-governed-operation-catalog-20260925.md).
The original results below are retained as historical evidence. The new preflight
reports no unresolved operations and `readyForApproval: true`; approval and
activation have not been performed.

These preserved non-read operations reference permissions missing from the current
published catalog:

- `export`: `neon.relationship.bp_target.export`
- `import`: `neon.relationship.bp_target.import`
- `configure_company`: `neon.relationship.bp_target.configure_company`
- `qualification_company`: `neon.relationship.bp_target.qualification_company`

Do not approve the entire candidate solely because callable-runtime qualification
passes. Those operations need reconciliation with their owning command/transfer
contracts, or explicit deferral in a separately reviewed read-only candidate. This
change neither synthesizes permissions nor substitutes a broad read grant for a
write, transfer or qualification-management permission. End-to-end activation and
signed-in Athyper verification remain unperformed.
