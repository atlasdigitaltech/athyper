# Business Partner P9 qualification

Status: prepared; target evidence collection and named review pending.
Production qualification remains blocked.

## Local and target preparation

1. Pin the actual source revision and built image digests. The historical release
   descriptor does not certify a dirty checkout or newly built images.
2. Run `pnpm policy:business-partner-phase0`, `pnpm policy:plane-boundaries` and
   the affected contract, service, UI and database checks. Retain their exact
   commands and outcomes separately from target evidence.
3. Run `pnpm preflight:e2e:bp-v1`, then `pnpm test:e2e:bp-v1-009` on a designated
   resettable target. Use three distinct authorized users. An admin login alone
   does not establish the required operating-organization permissions.
4. After V1 passes, provision fresh R2 targets and run `pnpm preflight:e2e:bp-r2`
   and `pnpm test:e2e:bp-r2`. Then prepare a fresh invitation, delivered MESH
   snapshot and fourth applicant actor; run `pnpm preflight:e2e:bp-r3` and
   `pnpm test:e2e:bp-r3`. Missing prerequisites and failed tests must remain visible.
5. Complete the broader Customer, Workforce, security, accessibility and
   operational journeys required by P9. Do not treat V1/R2/R3 alone as P9 coverage.

## Required receipts

For each gate in `deploy/releases/business-partner-p9.yaml`, collect every
`requiredChecks` result into a receipt conforming to
`deploy/instances/schemas/business-partner-release-gate-evidence.schema.json`.
Use the descriptor's environment: database, domain-service, cross-plane,
security-privacy and UX require staging; operations and ownership require
production. Keep credentials, authorization headers, tokens, database URLs,
candidate data and bank payloads out of committed evidence.

Retain exact source/image coordinates, real execution timestamps and evidence
hashes. The configured evidence root must be accessible on the qualification
host; the current descriptor resolves to a historical external path. Missing
receipts remain missing until the actual checks run successfully. Do not create
placeholder passing receipts or change the gate environment to make checks pass.

Collect R8 receipts as specified in
[business-partner-release-operations.md](business-partner-release-operations.md):
immutable retention, named assistive-technology review, distinct clean/upgrade
database parity, exact three-plane rollback, and named owner certifications.
`pnpm qualify:business-partner-r8` reports pending gates honestly.

## Certification and handoff

Run `pnpm release:business-partner:certify` and retain its read-only report.
Exit 2 means blocked; review every listed blocker. A successful local manifest
verifier is not production certification. Creating this runbook does not prove
that it has been rehearsed. The release owner records acceptance only after
receipts and rehearsals are complete, then follows
[business-partner-production-rollout.md](business-partner-production-rollout.md).
