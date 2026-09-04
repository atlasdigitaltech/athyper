# Architecture documentation

This directory contains durable architecture decisions, current architecture guidance, and active architecture-governance plans. Generated evidence and completed delivery records belong in Git history, not in the live architecture tree.

## Canonical decision

- `decisions/governed-entity-lifecycle.md` — target lifecycle for Business Partner, supplier, customer and workforce changes across Studio, Governance, MESH, snapshots, workflow and NEON.

## Current guidance

- `frontend-first-business-module.md` — architectural boundary and readiness contract for the first frontend Business Partner module.
- `business-partner-experience-plan.md` — review draft for the cross-plane Business Partner experience, authority boundaries, UI design, automation roadmap, delivery plan and qualification strategy.
- `business-partner/README.md` — canonical planning baseline for Business Partner organizations, Supplier and Customer roles, and supplier-provided Workforce journeys.

Generated inventories, test evidence, completion reports, and dated review narratives do not belong here. Versioned governance inventories and durable evidence belong under `governance/policy/reports/` when they must remain live; otherwise Git history is the archive.
