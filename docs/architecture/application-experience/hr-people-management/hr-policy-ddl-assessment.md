# HR policy DDL assessment

> **Historical.** Written before commit `870f08f52` removed the bespoke Business Partner and workforce applications. Routes, packages and files named here may no longer exist, and de-linked paths were dead when this was cleaned up. New entity work goes through the shared Entity Framework ([onboarding guide](../../../runbooks/meta-entity-onboarding.md)); do not treat this as current instruction.

Reviewed 2026-09-22. Source-level assessment; no migration, runtime qualification or country-law validation performed.

## Verdict

The shared policy foundation is strong. HR-specific policy assignment, calculation integration and several domain models are partial. Reuse the existing engine and add HR bindings and typed domain configuration; do not create another policy-definition/rule-version engine.

## Existing support

| Capability | Current evidence | Assessment |
|---|---|---|
| Policy identity, scope and history | control.policy_definition: tenant_id (nullable for global), module_id, entity_type, priority, evaluation_mode, effective dates, version_no, predecessor_id, definition_hash | Strong foundation; indexes provide scoped revision uniqueness. HR country/company/employee selection is a separate responsibility. |
| Conditions and decisions | control.policy_rule: ordered priorities, condition_expr, action_code/config, explanation, approver_rules, sla_hours | Strong generic structure. JSON object checks do not establish valid HR facts, units or operators. |
| Published revision protection | Published/active revision protection function; rules/tests owned by definition version | Existing mechanism to preserve published content. Reuse version ownership; no independent rule-version table. |
| Test and activation evidence | policy_test_case, policy_test_result, policy_activation | Stored inputs/expected outcomes, hash-bound results and active definition reference. This does not prove that HR scenarios have been authored or passed. |
| Decision evidence | policy_evaluation_history; policy service simulation and exact revision/hash/effective-date evaluation | Useful explainability and reproducibility foundations. Calculation input and result evidence still need domain integration. |
| Leave policy | leave_type, leave_plan, leave_plan_rule, employee_leave_enrollment | Country/legal entity/company scope, accrual frequency, eligibility conditions, entitlement quantity, formula-version reference and effective employee enrollment. Partial lifecycle/version model. |
| Calculation formulas | formula_expression_version; rate_table and rows; rounding configuration | Reusable arithmetic/rate infrastructure. Supported expression-language values in DDL are not proof that each HR evaluator is implemented. |
| Attendance | Shifts, work patterns, calendars, attendance documents | Schedule/result foundations. Dedicated grace, overtime, break, absence and exception policy bindings need definition. |
| Policy acknowledgment | document.policy_acknowledgment: employee, policy version, content hash, actor/time/channel/evidence | Good acknowledgment evidence shape; not a complete distribution/reminder/translation-content model. |
| Benefits, expense, travel, exit | Partial related compensation, generic requests/cases and lifecycle records | Dedicated eligibility, coverage, limits, settlement rules and bindings remain planned. |

Sources: [shared policy DDL](../../../../server/db/ddl/common/control/03_tables.sql), [constraints](../../../../server/db/ddl/common/control/05_constraints.sql), [indexes](../../../../server/db/ddl/common/control/06_indexes.sql), [protection function](../../../../server/db/ddl/common/control/07_functions.sql), [HR master tables](../../../../server/db/ddl/planes/neon/master/03_tables.sql), [formula/rate DDL](../../../../server/db/ddl/planes/neon/control/03_tables.sql), [acknowledgment DDL](../../../../server/db/ddl/planes/neon/document/03_tables.sql), [policy service](../../../../server/packages/platform/policy/src/policy-service.ts).

## Important boundaries

An authorization policy answers who may act. An HR eligibility policy answers which benefit or entitlement applies. A calculation formula computes a quantity or amount. A handbook acknowledgment records that someone received or accepted specified content. These capabilities may reference the same business policy, but one is not a substitute for the others.

The inspected policy service uses allow, deny, warn, escalate and require_workflow decisions. It is useful for validation and approval routing; it should not be described as an implemented accrual or payroll arithmetic engine.

## Gaps and recommended extensions

| Addition / correction | Proposed fields or behavior | Why |
|---|---|---|
| HR applicability binding | Policy-definition revision reference, policy family, country/jurisdiction, company/legal entity, optional site/grade/employment-type cohort, effective dates | Resolve the applicable policy using validated as-of employment facts. Prefer explicit scope references and validated cohort predicates over unrestricted owner IDs. |
| Employee/employment assignment | employment_id, policy family/binding reference, effective_from/until, source_request_id, assignment reason | Track individual enrollment or overrides; validate same tenant/employer and overlap rules. Extend existing leave enrollment rather than adding a competing leave assignment authority. |
| Conflict resolution | Family-specific selection/combination rule, priority, conflict error behavior | Country, company and employee rules cannot safely use a universal last-write-wins hierarchy. Some constraints combine; some benefits select one plan. Reject unresolved ties. |
| Approved exceptions | policy revision, employment/employee scope, affected rule, permitted override value/unit, reason, approver, workflow reference, validity | Bound exceptions to explicitly overridable rules. Retain original rule and decision evidence; never silently bypass protected constraints. |
| Leave plan revisions | Stable plan identity plus immutable effective configuration revision, rule/formula versions, enrollment binding behavior | Current plan/rules are not a full effective revision model. Enrollment dates alone cannot reproduce a plan later edited in place. Define whether enrollment follows effective revisions or pins a revision. |
| Structured calculation settings | Typed accrual/proration/carry-forward/expiry limits; schedule and overtime settings; benefit limits/contribution rules | Keep money/time units explicit. Version any JSON schema and validate it semantically. Avoid two authorities between typed settings and generic action_config. |
| Calculation evidence linkage | Selected policy revision IDs/hashes, formula/rate versions, as-of facts, source entries, rounding, result references | Explain leave/payroll results and rerun historical periods without selecting today's rules. Extend existing result traces and evaluation evidence. |
| Handbook publication / assignment | Versioned content reference, locale, content hash, employee audience, due date and delivery state | Distinguish not assigned, pending, acknowledged and superseded. Link acknowledgment to the exact rendered language/content version. |

The acknowledgment validation function currently checks active policy, tenant visibility and code/name/version snapshots. It does not compare policy_content_hash to an authoritative document/content version. Define and validate that content link; do not assume its hash must equal the executable definition hash because handbook text and executable rules may be different artifacts. The function also uses policy_definition.entity_type as the code snapshot source; clarify that identity before using many distinct HR handbooks under one entity type. [Validation function](../../../../server/db/ddl/planes/neon/document/07_functions.sql).

Use exclusive end dates consistently for new HR applicability records, with explicit adapters for existing inclusive/non-strict date contracts. Do not alter legacy boundary meanings silently. Tenant-global policies must remain visible only through the existing authorized global/tenant mechanism, not by bypassing scope checks.

## Example behavior to deliver

An illustrative company policy grants 18 annual-leave days, prorated for joiners, with up to 5 days carried forward. These are demo values, not country rules. A new policy version changes the entitlement from January 1. The system should show which version applied to each accrual, preserve the old balance entries, explain proration/rounding, and post approved corrections once. An approved individual exception should have its own reason, effective period and evidence.

For a multinational tenant, separate the employer/country applicability from language preference. Changing the UI to Arabic must not change the employee's leave entitlement or payroll policy. A transfer between employers must trigger explicit policy reassessment as of the transfer date.

## Delivery order

1. Implement reusable HR policy applicability and exact-version resolution through existing platform services.
2. Complete leave plan history and calculations; bind attendance schedules and one explicit attendance policy.
3. Integrate compensation/payroll and one benefit policy with reproducible inputs/results.
4. Add approved exceptions, handbook distribution, and remaining HR domains incrementally.

Keep local completion lightweight: correct persisted result, visible explanation, effective-date boundary, conflict/denial, retry safety and protected old results. Reuse the existing policy test-case facility. No additional production gate is introduced.
