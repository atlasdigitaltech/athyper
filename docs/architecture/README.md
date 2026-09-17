# Architecture documentation

This directory contains durable architecture decisions, current architecture guidance, and active architecture-governance plans. Generated evidence and completed delivery records belong in Git history, not in the live architecture tree.

## Canonical decisions

- `decisions/governed-entity-lifecycle.md` — target lifecycle for Business Partner, supplier, customer and workforce changes across Studio, Governance, MESH, snapshots, workflow and NEON.
- `business-partner/README.md` — canonical Business Partner authority, lifecycle, security boundary and source-of-truth summary.

## Current guidance

- [Shared Application Experience — System Design](application-experience/system-design.md) — shared Neon, Mesh and Studio UI architecture, component inventory, entity reuse and package boundaries; local-build scope with future deployment work deferred.
- [Shared Application Experience — Build Work Plan](application-experience/build-work-plan.md) — ordered local build and repository cleanup tasks with focused checks; no production rollout or formal decision gates.
- `system-architecture-overview.md` — engineer-facing system architecture: design principles, layer diagram, multi-tenancy (RLS) model, physical database architecture, infrastructure and Docker Compose service inventory.
- `frontend-first-business-module.md` — architectural boundary and readiness contract for the first frontend Business Partner module.
- [Entity authorization adoption](../runbooks/entity-authorization-adoption.md) — implemented contract foundation, inventory/dry-run commands, grant-review constraint and remaining activation gates.
- [Entity and record authorization](../contracts/entity-record-authorization.md) — proposed generic contract from application entry through record ownership, sections, fields and commands; includes migration and acceptance gates.
- [Business Partner authorization profile](../contracts/business-partner-authorization-profile.md) — proposed first use case of the generic contract, with ownership boundaries and adoption journeys.
- [Task authority, approval rules and escalation](business-partner/approval-task-rules-implementation-plan.md) — proposed implementation plan for to-do/review/approval scopes, edit and candidate-filter rules, correction, information requests, supervisor escalation and separate selective-reapproval extensions.

Generated inventories, test evidence, completion reports, and dated review narratives do not belong here. Versioned governance inventories and durable evidence belong under `governance/policy/reports/` when they must remain live; otherwise Git history is the archive.
