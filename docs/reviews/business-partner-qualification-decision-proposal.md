# Existing qualification decision proposal

Status: proposed, not approved or selected. The 42-operation selection contains
qualification creation only. No grants, metadata heads or rollout modes change.
`catl.owner` and `catl.admin` are the nominated business/security reviewers.

## Exact proposed decision bindings

| Operation | Permission | Ownership | Handler |
| --- | --- | --- | --- |
| `qualification_decide` | `neon.supplier.qualification.admin` | Existing independently owned qualification, one stored organization | Eligibility owner `decideQualification` |
| `qualification_company_decide` | `neon.relationship.bp_target.qualification_company` | Existing independently owned qualification, one stored organization/company pair | Eligibility owner `decideQualification` |

These reuse existing catalog definitions; they propose no permission definitions
or grants. Reusing a permission for a separate decision operation still requires
explicit semantic approval. Neither binding may fall back to the proposed
creation operation, parent directory admission or organization-to-tenant grant
conversion. Until reviewed and implemented, target APIs deny these operations;
legacy/shadow behavior remains unchanged.

## Required resolver and execution behavior

1. The incoming record ID identifies the qualification, not its parent BP. Load
   the current qualification and decision-scope rows under the verified tenant.
   Obtain its parent ID and ownership from storage; ignore caller scope hints.
2. Initially support exactly one included organization, with zero or one included
   company. Global, multiple, exclusion and ambiguous ownership arrangements
   remain unavailable. An existing company scope must use the company operation;
   it cannot downgrade to the organization operation. Review broader ownership
   models separately.
3. Validate the stored organization, company and active compatibility link.
   Check parent BP admission separately with the stored parent ID, then authorize
   the decision at the child's stored scope. Generic parent-read evaluation must
   not accidentally use the qualification ID as the BP ID.
4. Refresh current identity/grants for execution. Require elevated assurance,
   creator/decider separation, expected version, a nonempty reason, valid decision,
   and stable idempotency. A readiness check cannot approve or consume a command.
5. Recheck the current child inside the mutation transaction. Keep optimistic
   version checks, audit/outbox effects and replay conflict handling in the actual
   eligibility owner. Changed ownership or revocation must deny or conflict.

## Review and release gates

The two reviewers must explicitly accept or defer each operation at this proposal
revision, including permission reuse, supported ownership cardinality, parent-read
requirement and MFA. Approval receipts must bind this content and regression
hashes through the authenticated workflow. A markdown status is not a receipt.

Required regression evidence: wrong tenant/child, forged parent/scope, organization
versus company dispatch, multiple/global/excluded scopes, stale ownership/version,
self-approval, missing MFA, revocation, replay conflict, and successful creation
and decision by separate authenticated principals against one exact release.

No effective assignment window is changed. The reviewed assignment window and
separate enforcement approval remain prerequisites for activation. Neither this
proposal nor approval of it restores revoked access.
