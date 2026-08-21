# Atlas Enterprise BYOK security and recovery evidence

Status: **not approved / production disabled**

Code completion is not Security approval. Promotion requires evidence from the
target environment.

## Required evidence

- SecretStore B3.2 configuration and credential path attestation.
- B3.3 forced-RLS cross-tenant tests using the production application role.
- B3.4 rotation and complete re-encryption reconciliation.
- Revocation observed by every replica and after process restart.
- Metadata-only audit reconciliation; no plaintext, suffix, or raw reference.
- Encrypted backup, restore into an isolated environment, and successful
  tenant-scoped decrypt using approved recovery keys.
- Revoked/retired key behavior and documented recovery failure mode.
- Security approver, decision, date, ticket and reviewed threat model.

## Promotion rule

BYOK remains default-off when any evidence field is missing. Enabling it also
requires an allowlisted tenant, provider, region/data-policy match and rollback
owner. No provider fallback may cross credential ownership.
