# Business Partner architecture

Status: canonical architecture boundary

Business Partner is NEON's tenant-local representation of an external organization. Supplier and Customer are commercial roles of that organization; a dual-role organization remains one Business Partner. Supplier-provided workers are people governed through requisition, engagement, placement, and IAM lifecycles and are never modeled as Business Partners.

## Authority

| Concern | Authority |
| --- | --- |
| Definitions, forms, policies, and releases | Studio |
| Network accounts, relationships, capabilities, and disclosures | MESH |
| Business Partner records and commercial roles | NEON |
| Cases, decisions, evidence, and materialization | Owning plane |
| Authentication and access context | IAM and runtime authorization |
| Attachment metadata and bytes | Document service and Object Storage |
| Notification delivery | Notification service |
| Drafting and explanation | Atlas, without mutation authority |

Cross-plane data is a proposal until accepted by the receiving authority. Canonical-party, IAM-organization, MESH-account, Business Partner, role, Person, engagement, and placement identifiers are distinct coordinates and do not imply one another.

## Lifecycle

```text
published definition
  -> draft and evidence
  -> deterministic validation
  -> identity/conflict review
  -> human decision
  -> governed materialization
  -> readiness and activation
  -> controlled change
  -> suspension, termination, or archive
```

Every case is pinned to an immutable definition release. Every mutation validates tenant, actor, scope, expected version, idempotency key, and current policy; commits state, evidence, lineage, audit, and outbox records atomically; and returns explicit replay, conflict, denial, and invalid-transition outcomes.

## Security boundaries

- UI visibility is not authorization.
- MESH and Studio never write NEON master authority directly.
- Requested relationships or capabilities grant no access.
- Supplier profile exchange excludes Person and protected workforce data.
- Bank, identity, and protected-document access is purpose-bound and audited.
- Notifications and Atlas retain references, not protected payload copies.
- AI may explain or draft, but cannot approve, qualify, merge, activate, or grant access.

## Sources of truth

Executable contracts and canonical DDL define implemented behavior:

- `server/db/ddl/planes/{studio,neon,mesh}`
- `packages/contracts` and `server/packages/contracts`
- plane and service tests
- versioned governance configuration and retained evidence
- active operational runbooks under `docs/runbooks`

Completed plans, dated reviews, status reports, and qualification narratives belong in Git history or retained governance evidence rather than this architecture document.
