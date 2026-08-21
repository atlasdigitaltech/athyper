# Atlas Admin support-session approval and soak evidence

Status: **not approved / not promoted**

This document is an evidence template. Completing code or tests does not grant
production approval.

## Required approvals

- Security owner, decision, date, ticket, and reviewed threat model.
- Privacy owner, decision, date, ticket, data-purpose and retention review.
- Operations owner for alerts, revocation, key rotation and emergency disable.
- Product owner for staff allowlist and approved read-only scopes.

## Staff-only soak

- Dedicated allowlist and default-off feature flag.
- Minimum approved soak interval recorded with start/end timestamps.
- Session starts, denials, expiries, revocations and ends reconciled to audit.
- Zero target-tenant selection from browser headers.
- Zero cross-tenant, cross-session, MFA-replay or stale-epoch successes.
- Zero prompt, response or customer values in operational logs/audit.
- Tenant read-only tools remain disabled until their separate certification.

## Promotion decision

Record `approved`, `rejected`, or `extended_soak`, approvers, evidence links,
rollback owner and the exact enabled scopes. Blank evidence means fail closed.
