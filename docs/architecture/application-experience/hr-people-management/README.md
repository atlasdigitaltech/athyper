# HR People Management

> **Historical.** Written before commit `870f08f52` removed the bespoke Business Partner and workforce applications. Routes, packages and files named here may no longer exist, and de-linked paths were dead when this was cleaned up. New entity work goes through the shared Entity Framework ([onboarding guide](../../../runbooks/meta-entity-onboarding.md)); do not treat this as current instruction.

Plans and DDL analysis for Internal and External Workforce delivery.

Start with the [consolidated HR master plan](hr-module-delivery-plan.md), updated 2026-09-22 to include the complete discussion: delivery stages, employee information, vendor comparison, country localization, local/foreign employees and HR policies. Supporting documents below retain the detailed field analysis and implementation sequence.

Current working mode: complete robust local increments and show whichever are working in the demo. Use the [local completion checks](hr-module-delivery-plan.md#working-mode--robust-local-build); formal rollout qualification is tracked separately.

- [Wednesday customer demo: live attendance, leave, benefits and payroll](customer-demo-pay-cycle-plan.md)
- [Stage 0 Employee 360 readiness baseline](stage-0-employee-360-readiness.md)
- [Stage 0 comprehensive review, findings and closure work packages](stage-0-comprehensive-review.md)
- [Stage 1 Employee directory and Employee 360 build note](stage-1-employee-360-build-note.md)
- [Current implementation plan: Internal and External Workforce](hr-internal-external-implementation-plan.md)
- [SAP comparison and table/field analysis](hr-workforce-table-field-analysis.md)
- [SAP vs Oracle vs Athyper vs Frappe: model comparison and recommendation](hr-model-sap-oracle-athyper-frappe-comparison.md)
- [Country localization and local / foreign employee DDL coverage](hr-country-localization-and-foreign-employees.md)
- [HR policy capability and DDL assessment](hr-policy-ddl-assessment.md)
- [Employee personal information: screenshot-to-DDL review](employee-personal-information-ddl-review.md)
- [Employee screen-field coverage spreadsheet](employee-personal-information-field-map.csv)
- [Detailed HR module backlog and acceptance criteria](hr-module-delivery-plan.md)
- [Later release-readiness checklist](hr-release-readiness-checklist.md)
- [Existing DDL table inventory](hr-ddl-inventory.csv)
- [Current field inventory](hr-workforce-current-fields.csv)
- [Proposed field change register](hr-workforce-field-changes.csv)

Related business design: [People capabilities and workflows](../../../business-workflows/people.md).

CSV `ddl_path` values are repository-relative. The change register's `analysis_file` values refer to documents in this folder.
