# Architecture documentation

This directory contains durable architecture decisions, current architecture guidance, and active architecture-governance plans. Generated evidence and completed delivery records belong in Git history, not in the live architecture tree.

## Canonical decisions

- `decisions/governed-entity-lifecycle.md` — target lifecycle for Business Partner, supplier, customer and workforce changes across Studio, Governance, MESH, snapshots, workflow and NEON.
- `business-partner/README.md` — canonical Business Partner authority, lifecycle, security boundary and source-of-truth summary.

## Current guidance

- `frontend-first-business-module.md` — architectural boundary and readiness contract for the first frontend Business Partner module.
- [Entity authorization adoption](../runbooks/entity-authorization-adoption.md) — implemented contract foundation, inventory/dry-run commands, grant-review constraint and remaining activation gates.
- [Entity and record authorization](../contracts/entity-record-authorization.md) — proposed generic contract from application entry through record ownership, sections, fields and commands; includes migration and acceptance gates.
- [Business Partner authorization profile](../contracts/business-partner-authorization-profile.md) — proposed first use case of the generic contract, with ownership boundaries and adoption journeys.

Generated inventories, test evidence, completion reports, and dated review narratives do not belong here. Versioned governance inventories and durable evidence belong under `governance/policy/reports/` when they must remain live; otherwise Git history is the archive.
