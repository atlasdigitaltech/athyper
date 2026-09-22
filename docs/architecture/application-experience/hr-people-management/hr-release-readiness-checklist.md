# HR People Management — later release readiness

These checks apply when preparing a wider tenant pilot or operational release. They do not block local feature development or showing completed increments in the Wednesday demo. The active local completion criteria are in the [HR build plan](hr-module-delivery-plan.md#working-mode--robust-local-build).

## Engineering checks retained during local development

Canonical data ownership, tenant/field authorization, transactional writes, correct calculations, applicable date boundaries, idempotent money/entitlement/access effects and approved-history integrity remain part of the implementation. Required repository checks still apply. A defect in these behaviors is fixed for the affected increment; it is not deferred under this checklist.

## Before a wider release

| Readiness work | When needed | Owner / evidence |
|---|---|---|
| Full selected-scope role and journey matrix, including uncommon employment/history combinations | Before enabling those capabilities for pilot users | Application/QA: reproducible browser/API scenarios and recorded limitations |
| Country-specific payroll and employment-rule qualification | Before operational payroll or jurisdiction-specific claims | Payroll/domain owners: independently checked cases, rule versions and business acceptance |
| Live IAM, device, payroll-provider, finance and banking integrations | Before enabling each external side effect | Integration owners: credentials/configuration, failure/retry and reconciliation evidence |
| Clean-install and supported historical upgrade matrix; representative data migration | Before distributing a release or migrating a tenant | Data/platform owners: migration results, backfill reconciliation and rollback/roll-forward procedure |
| Performance budgets, volume/concurrency load and representative dataset measurements | Before promising production capacity/service targets | Engineering: dataset, measured results, query review and remediation |
| Full accessibility, responsive experience and export/report coverage | Before broader user rollout | UI/QA: agreed coverage and resolved blockers |
| Backup/restore, queue recovery, monitoring, alerts and operational runbooks | Before operating an environment for users | Operations: recovery rehearsal and assigned support ownership |
| Tenant pilot configuration, staged enablement, user training and business acceptance | Before expanding rollout | Product/implementation owners: accepted scope, configuration and outstanding work |

Only the implemented release scope needs acceptance; unfinished capabilities remain disabled or explicitly unavailable. Completing this checklist for one scope does not imply every item in the full HR roadmap is delivered.
