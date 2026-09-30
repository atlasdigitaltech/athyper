# Entity authorization adoption decisions

Status: implementation baseline; activation is gated by qualification evidence.

## Inventory and scope

The read-only [DEV inventory](../../../governance/policy/reports/entity-authorization-inventory.dev.json)
records active descriptor rows and aggregate role/scope grants across all three
planes. Rows marked active are not assumed to be effective activation heads.
This inventory does not enumerate effective principal decisions, record ACLs,
delegations, revocations or policy-gate outcomes. Those require persona evidence.

## Decisions before implementation

1. BP root ownership is tenant-local. Shared identity reads require explicit
   root authority in the target evaluator. The current directory fallback is
   retained only under legacy/shadow; no scoped grant is rewritten as tenant-wide.
2. Existing `entity_case.create` permits a proposal in its granted organization.
   `amend_partner` targets a proposed case in that organization, not a direct
   mutation of global BP identity. The case workflow retains approval/apply gates.
3. First assignment and first role evaluate a proposed target plus parent access.
   Their authorization does not depend on an assignment they are creating.
4. Company configuration resolves organization and company together. Existing
   domain compatibility, lifecycle and eligibility checks remain mandatory.
5. Root identity field groups inherit the published read operation. No generic
   update is inferred. System fields have no write operation. Sensitive provider
   fields need explicit separate profiles before provider enforcement is enabled.
6. Import/export sharing a read permission in legacy descriptors is inventory
   evidence, not approval of unrestricted data transfer. Target operation state
   requires preflight until a reviewed transfer adapter establishes its authority.
7. A company-owned transaction and independently owned child are qualification
   fixtures first. Neither is represented as a deployed business module unless
   its real owning-service adapters and publication are qualified.
8. Rollout is per plane/entity with legacy, shadow or enforce selection. Enforce
   requires compatible profile/descriptor/binding revisions and complete coverage
   evidence. Shadow errors never grant access or alter legacy outcomes.
9. Global read/steward grant changes are not automated. Existing global proposal,
   approval and apply permissions need persona-level review before activation.
10. Replacing compatibility paths is a post-parity change. No activation or
    retirement is permitted merely because parser and synthetic tests pass.

## Runtime integration obligations

Coverage evidence must distinguish application/workspace, collection, record,
sections, fields, commands, transfers/AI, independent relationships and revocation.
A shared evaluator library alone cannot satisfy those obligations. Incomplete
adapters keep enforce selection closed and are reported as migration work.

## Policy difference acceptance

Use the [policy difference review](../../runbooks/entity-authorization-policy-differences.md)
and its evidence-bound ledger for disposition status. The two raw synthetic
inequalities are reproduced regressions, not the entire observed live difference
set. The recorded authenticated attestation includes 27 differing live groups.
Unconfirmed causes and proposed dispositions remain unresolved; only explicit,
evidence-compatible acceptance can close the difference gate. No gate result
constitutes permission to change grants or activate enforcement.

## Named-role review

The [79-combination review packet](../../runbooks/business-partner-named-role-review.md)
uses actual role capabilities, named principals and exact scope targets. The user
nominated `catl.owner` for business and security review. This nomination is not
row-level approval; no approved assignments or grant changes are recorded.
