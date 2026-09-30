# HR data model: SAP, Oracle, Athyper and Frappe

> **Historical.** Written before commit `870f08f52` removed the bespoke Business Partner and workforce applications. Routes, packages and files named here may no longer exist, and de-linked paths were dead when this was cleaned up. New entity work goes through the shared Entity Framework ([onboarding guide](../../../runbooks/meta-entity-onboarding.md)); do not treat this as current instruction.

Reviewed: 2026-09-21. Recommendation and design comparison, not an implemented migration or a certification of feature parity. SAP means SuccessFactors Employee Central; Oracle means Fusion Cloud HCM; Frappe means Frappe HR. Vendor public business objects, APIs and documented tables are compared with Athyper repository DDL. SAP API entities and Frappe DocTypes are not represented as equivalent physical SQL tables.

## Recommendation

Keep Athyper's person → employment → work assignment foundation. Use Oracle's explicit employment hierarchy as a reference, SAP's effective-change semantics as a reference, and Frappe's approachable employee workspace as a reference. Implement these within Athyper's existing tenant, authorization, workflow, document and finance infrastructure.

The current DDL has credible foundations, but proposed fields and tables do not establish delivered HR capability. Prioritize correct ownership, history, calculation and permissions over expanding the number of employee columns. Do not replace the model with one large Employee record or attempt to reproduce either enterprise suite's complete schema before the demo.

## Comparison at the model level

| Dimension | SAP SuccessFactors | Oracle Fusion HCM | Frappe HR | Athyper assessment and decision |
|---|---|---|---|---|
| Employment foundation | Employment and job information are separate entities, with different temporal behavior. | Explicit work relationship and assignment hierarchy; configurable single/multiple assignments and contracts. | Employee is the central documented employee file, with related transaction documents. | Already separates person, employee, employment and assignment. Retain this separation. |
| History | EmpJob supports dated records and multiple changes per day. EmpEmployment is not effective-dated. | Date-effective records preserve past/future versions; work relationships are date-enabled instead. | Promotion documents retain changes in employment history. | Assignment ranges exist, but full revision/correction behavior and reliable as-of reads need implementation. |
| Employee file | Separate personal and employment entities in the API. | Employment hierarchy gives distinct relationship and assignment responsibilities. | Convenient personal, joining, education, work-history and exit sections. | Good canonical core, incomplete detailed profile. Reuse the screenshot-to-DDL review for additions. |
| Employee user | Do not equate the SAP employment API's userId with an Athyper authentication principal. | Do not infer identity-provider mapping from a person or assignment identifier. | Employee can link to a User; user creation is a supported workflow. | Retain optional employee.principal_id; employment must work without an application login. |
| Payroll readiness | Employee Central job data is only one part of a payroll solution. | An employment model alone does not deliver payroll. | Salary Slip documents support attendance/leave-based calculation and assigned salary structures. | Tables exist for structures, runs and results. Working calculation services still need evidence; DDL is not a payroll engine. |

Vendor evidence: [SAP EmpJob](https://help.sap.com/docs/successfactors-platform/sap-successfactors-api-reference-guide-odata-v2/empjob), [SAP EmpEmployment](https://help.sap.com/docs/successfactors-platform/sap-successfactors-api-reference-guide-odata-v2/empemployment), [Oracle employment model](https://docs.oracle.com/en/cloud/saas/human-resources/faigh/employment-model.html), [Oracle date effectivity](https://docs.oracle.com/en/cloud/saas/human-resources/faucf/date-effectivity.html), [Frappe Employee](https://docs.frappe.io/hr/employee), [Frappe Promotion](https://docs.frappe.io/hr/employee-promotion), [Frappe Salary Slip](https://docs.frappe.io/hr/salary-slip).

These are architectural comparisons, not rankings of performance, cost, country coverage or implementation effort. Frappe having a simpler employee workspace does not mean it lacks history, permissions or separate payroll documents.

## Table and field decisions for Athyper

Existing means present in repository DDL, not necessarily exposed through a completed API/UI. Proposed names below are design candidates to reconcile with the existing change register, not a second independent schema plan.

| Area | Existing Athyper | Recommended fields / model | Reason and priority |
|---|---|---|---|
| Person identity | person; person_sensitive_profile | Define legal/display/preferred name ownership; optional salutation_code; fix optional person_number uniqueness; accommodate single-name people | Foundation now. Do not independently edit duplicated employee names. |
| Employer relationship | employment: person_id, employee_id, legal_entity_id, company_code_id, employment_number | confirmed_on, contract_end_date, notice_period_days, planned_retirement_date; source_offer_id when the offer model exists | Contract expiry, probation completion and actual confirmation are different facts. Add terms with their governing source/version. |
| Assignment | work_assignment: employment_id, job_id, position_id, manager_employee_id, effective_from/until | Require employment linkage for new writes; stable assignment identity with revision history; event_reason_code and source_request_id | Foundation now. Preserve identity across changes and ensure dates/company agree with employment. |
| Temporal revision | Effective ranges and normal audit fields | Define effective range, revision sequence where needed, recorded_at/by, supersedes reference and correction reason on revision records | Specify correction versus business change. Do not merely add sequence to every table or permit overlapping active snapshots. |
| Primary relationship | employment.is_primary; assignment_type='primary' | Define primary employment per person and primary assignment per employment, with overall primary derived | Current assignment exclusion is employee-scoped. Resolve concurrent-employment semantics before widening constraints. |
| Passport / national ID | Single token fields on sensitive_profile | person_identifier: type, value_token, issuing_country, issued_on, valid_from, expires_on, verification_status; restricted evidence links | Multiple documents, renewal and expiry cannot be represented fully by one passport token. |
| Contacts / addresses | Shared contact_link/address_link and person summaries | Qualify person ownership and HR access; typed emergency-contact children with relationship and priority | Reuse shared authorities. Avoid employee-specific duplicate email/address stores. |
| Personal history | Generic profile metadata; assignment history | person_education, person_prior_employment; versioned biography; protected health profile if required | Detailed profile later. Internal job history derives from canonical assignments; prior employment is not supplier workforce. |
| Organization and grade | job, designation, position, pay_grade, org_unit | Preserve historical references/labels; effective personal-grade override only if required | Existing catalogs are reusable. Avoid duplicating designation/grade as employee text. |
| Schedule | shift_type, work_pattern/day, holiday_calendar/day, shift_assignment | Effective employee/employment work-schedule assignment including calendar, timezone and default pattern | Immediate support for accurate attendance and leave. Daily roster overrides default schedule. |
| Leave | leave_plan/rule, employee_leave_enrollment, leave_request, leave_balance_entry | Versioned calculation policy, explicit balance scope/period, reservation semantics and idempotent ledger postings | Avoid double-counting opening balances and double debit on approval retries. |
| Compensation | compensation_assignment, pay_structure/line, pay_component | Employee component assignments/overrides with amount or rate, currency, frequency, effective dates and source change | Base pay, annualized pay, employer cost and take-home pay must remain distinct. |
| Payroll result | payroll_period/run/run_employee/result/result_line | Pin input and rule versions; resolve employment-level processing grain; preserve calculation trace and adjustment/reversal relationships | Immediate calculation priority. A later profile edit must not rewrite a completed payroll explanation. |
| Benefits | Statutory enrollment exists; dedicated benefit coverage model not found | Benefit plan/version, enrollment, coverage dates, dependant links, employee/employer contributions and payroll source references | Benefits are not interchangeable with statutory enrollment. Start with one explicit demo benefit. |
| Banking | bank_account and bank_account_link | Effective payment instruction/distribution referencing authorized account links | Do not add raw bank details to employee. Support one destination first; defer split payments if unnecessary. |
| Exit | employment termination fields; offboarding_case | employment-specific case, actual last-working date, restricted interview/feedback, settlement and encashment lines | Exiting one relationship must not automatically end another. Encashment is a financial outcome, not only a checkbox. |
| External workforce | external_worker, worker_engagement, placements, work orders, SOWs, external timesheets and service acceptance | Continue the separate commercial flow; share person and identity infrastructure | Stage 2. Do not turn supplier charges into employee payroll by adding worker_type to employee. |

Repository evidence: [master tables](../../../../server/db/ddl/planes/neon/master/03_tables.sql), [constraints](../../../../server/db/ddl/planes/neon/master/05_constraints.sql), [employee view](../../../../server/db/ddl/planes/neon/master/09_views.sql), [HR and external workforce documents](../../../../server/db/ddl/planes/neon/document/03_tables.sql), [shared contact and identity tables](../../../../server/db/ddl/common/master/03_platform_tables.sql). Detailed field coverage and constraints remain in the [personal-information review](employee-personal-information-ddl-review.md) and [workforce field analysis](hr-workforce-table-field-analysis.md).

## Effective dating: the most important enterprise behavior to adopt

SAP EmpJob identifies changes using userId, startDate and seqNumber. Oracle's PER_ALL_ASSIGNMENTS_M also documents EFFECTIVE_SEQUENCE for ordering changes within a day. These provide useful precedents for distinguishing assignment identity from successive states. [SAP EmpJob](https://help.sap.com/docs/successfactors-platform/sap-successfactors-api-reference-guide-odata-v2/empjob), [Oracle assignment table](https://docs.oracle.com/en/cloud/saas/human-resources/oedmh/perallassignmentsm-25478.html).

For Athyper, a promotion effective October 1 must leave September's manager, grade and pay unchanged. A correction entered October 5 to that promotion should retain who corrected it and why. A payroll result already calculated for September must retain the input versions it used. Business-effective history, recorded correction history and financial result history have different purposes.

Implement this first for assignment, compensation, work schedules and calculation policies. Use Athyper's existing exclusive end dates consistently. If multiple same-day changes are required, maintain ordered revisions and select the accepted latest state; a sequence column alone does not resolve range exclusions. Full bitemporal machinery on every lookup is unnecessary for the initial build.

Oracle explicitly distinguishes a new dated assignment change from correcting an existing record. This is a useful command/API distinction for Athyper, with authorization and retained audit evidence on both paths. [Oracle employment processes](https://docs.oracle.com/en/cloud/saas/human-resources/fawhr/employment-processes.html).

A concrete current defect is master.v_employee: it chooses employment and assignment independently, ordered by status/date without filtering the effective date or ensuring that the assignment belongs to the selected employment. Build a canonical as-of query and use it for Employee 360 and calculations. Future assignments must not silently become today's organization.

## Robustness that matters more than adding fields

1. Define one owner per fact. Employee 360 is an assembled read model; its save commands update the owning records transactionally.
2. Enforce tenant and employment/company reference consistency, valid ranges and allowed lifecycle states. An overlap exclusion enforces at most one matching primary, not the existence of a required primary.
3. Keep DOB/identifiers, health, compensation, banking and exit feedback independently permissioned. Tenant RLS and token-shaped column names alone do not establish complete protection.
4. Reuse shared bank, address, contact, attachment, consent, workflow and external-reference capabilities. Verify polymorphic owner validation and HR authorization when integrating them.
5. Use typed fields for facts that determine eligibility, amounts, identity or reporting. Use validated, versioned extension content for optional customer additions; unrestricted metadata is not a substitute for these rules.
6. Separate country-specific calculation rules from core person/employment storage. The comparison does not establish statutory payroll correctness for any country.

## Delivery recommendation

**Internal stage, immediate:** correct ownership and as-of reads; deliver Employee 360 basics; qualify shared contacts/banking; bind a schedule and holiday calendar; run persisted attendance → leave → one benefit → payroll calculations with traceable inputs. Show each working increment independently, as agreed in the [demo plan](customer-demo-pay-cycle-plan.md).

**Internal stage, following increments:** detailed identity documents, joining terms, education/prior experience, benefit dependants, correction/retroactive scenarios, lifecycle workflows and remaining module capabilities. Build only the profile extensions needed by the current increment; do not block calculation delivery on every screenshot field.

**External stage:** continue supplier-backed engagements, revision-pinned commercial terms, compliance, time/expense approval, service acceptance and P2P settlement. Preserve internal/external boundaries and shared person identity. Use the existing [two-stage delivery plan](hr-internal-external-implementation-plan.md) and its external-workforce benchmark rather than treating an employee profile as a vendor-management model.

Local completion remains lightweight: save/reload, correct result, relevant authorization denial, boundary/retry checks and a short gap note. The recommendation changes design priorities; it does not add a formal production release gate or promise the complete HR module in one day.
