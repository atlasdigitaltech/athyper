# Business Partner 360 P1 production integration evidence

**Evidence date:** 2026-08-30  
**Status:** Implemented and repository-verified; release deployment is not configured and remains blocked

## Implemented integration boundaries

| Integration | Evidence | Failure behavior |
| --- | --- | --- |
| Protected tax/person values | Secret-store resolver namespaces every opaque token under `protected-values/{tenantId}/`; tax requires elevated assurance, one-time purpose grant and value-free audit; person reveal retains its elevated assurance plus domain/platform audits | Missing resolver or secret fails closed; invalid/path-traversal token is rejected; ordinary responses remain token/value-free |
| Attachments | Owning attachment lifecycle exposes `POST /api/attachments/:attachmentId/download`; attachment permission is checked before tenant-scoped lookup; only active, verified rows receive a 30–300 second signed URL; UI invokes the command rather than linking to status | Missing/inactive/quarantined attachment fails; expired attachment returns `ATTACHMENT_DOWNLOAD_EXPIRED`; command response is `private, no-store` |
| Business activity | The five owning domains are always represented. A documented injected reader replaces its entry; absent readers return `PROVIDER_NOT_CONFIGURED` | One unavailable provider cannot fail another provider or governance activity |
| MESH live summary | Optional HTTPS-only service transport uses a secret-store service credential, a configured 50–3000 ms timeout, relationship-only request coordinates and caller context. The returned independent MESH authorization/provenance is validated by the existing Network adapter | Denial, timeout, incompatible schema and malformed responses degrade Network to a safe local projection |
| STUDIO definition | A last-valid resolver caches only successfully parsed compatible BP360 definitions | Incompatible/absent projection uses the last valid definition; a cold process with no valid definition fails completeness closed while summary identity remains available |

## Deployment configuration

- `BP360_MESH_LIVE_BASE_URL` and `BP360_MESH_LIVE_CREDENTIAL_REFERENCE` must be set together.
- `BP360_MESH_TIMEOUT_MS` defaults to 1500 and cannot exceed 3000.
- The secret store must contain protected values at `protected-values/{tenantId}/{opaqueToken}` and the MESH service credential at the configured reference.
- Procurement, finance, sales, projects and contracts remain explicitly unavailable until their owners publish and configure the documented `BusinessPartner360BusinessActivityProvider` reader. No transaction table was inferred or queried.

## Verification recorded

- Master-data typecheck: pass.
- Master-data tests: 83 pass.
- BP360 client typecheck: pass; 30 tests pass.
- Attachment lifecycle/routes targeted tests: 7 pass.
- Platform host config tests: 32 pass.
- Full attachment/host typecheck is blocked by pre-existing tracked deletions of `server/packages/services/attachments/src/kysely-attachment-quota-ledger.ts` and `server/packages/services/content/src/kysely-content-quota.ts`; these unrelated user-owned deletions were not restored.

## Remaining environment evidence

1. Install real secret references and demonstrate tax/person reveal against the approved vault.
2. Exercise a real object-store signed URL after expiry.
3. Register each owning activity reader when its contract is approved; keep all others unavailable.
4. Exercise the deployed MESH endpoint for granted, denied, timeout and incompatible-schema cases.
5. Restart/fail over the host and prove the durable local STUDIO active projection is available before any in-memory fallback is needed.

## Release-environment audit

The running dev and QA API containers were inspected on 2026-08-30 without
printing secret values. Neither container contains the paired
`BP360_MESH_LIVE_BASE_URL` and `BP360_MESH_LIVE_CREDENTIAL_REFERENCE`
configuration, and neither supplies evidence of the release protected-value
secret references. The available healthy local object-storage, MESH and STUDIO
containers are development infrastructure and do not qualify the real signer,
independent MESH authorization or restart/failover gates.

The fail-closed [P1 qualification packet](./evidence/business-partner-360-p1-qualification.json)
therefore retains protected-value deployment, attachment expiry, live MESH and
durable STUDIO failover as pending. All five business-activity providers remain
explicitly `PROVIDER_NOT_CONFIGURED`; no undocumented integration was added.
