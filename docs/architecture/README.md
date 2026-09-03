# Architecture documentation

This directory contains only durable architecture decisions and active implementation plans.

## Canonical decision

- `decisions/governed-entity-lifecycle.md` — target lifecycle for Business Partner, supplier, customer and workforce changes across Studio, Governance, MESH, snapshots, workflow and NEON.

## Active plans

- `plans/governed-entity-lifecycle-backlog.md` — remaining work and closure gates.
- `plans/governed-entity-lifecycle-implementation-inventory.md` — temporary detailed DDL/UI implementation inventory; remove after its items are implemented, rejected by an ADR, or represented in the backlog.

Generated inventories, test evidence, completion reports and dated review narratives do not belong here. Versioned governance inventories live under `policy/reports/authorization/inventories/`; durable completion evidence lives under `policy/reports/`.
