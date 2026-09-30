# Wednesday customer demo — live internal pay cycle

> **Historical.** Written before commit `870f08f52` removed the bespoke Business Partner and workforce applications. Routes, packages and files named here may no longer exist, and de-linked paths were dead when this was cleaned up. New entity work goes through the shared Entity Framework ([onboarding guide](../../../runbooks/meta-entity-onboarding.md)); do not treat this as current instruction.

Target: Wednesday, 23 September 2026; presentation time/timezone pending confirmation.

This demo scope supersedes the earlier Employee 360/onboarding-only estimate. The customer prioritizes live payroll, attendance processing, leave calculations and benefits. The full Internal Workforce capability scope remains, with simplified local completion checks in the HR build plan.

## Agreed demo approach

Show whatever is locally working by the meeting; the user will present the remaining capabilities. Completing all four processing areas is an implementation target, not a prerequisite for the demo. Keep the build robust: real persisted data and processing, explicit rules, scoped permissions, correct amounts/balances and safe retries. Use the [local build checks](hr-module-delivery-plan.md#working-mode--robust-local-build); defer formal pilot/production qualification to the [readiness checklist](hr-release-readiness-checklist.md).

## Delivery assessment

The repository has attendance, leave and payroll DDL with relevant database guards. The targeted TypeScript scan of server/packages, server/apps and packages/planes/neon found no direct references to attendance_day, leave_balance_entry, payroll_run_employee, payroll_result_line or benefit_enrollment. This does not exclude generic runtime mechanisms, but it does not establish working domain processors. A dedicated benefits model was not found in the earlier DDL review. Existing workforce onboarding services cannot be counted as attendance/payroll engines.

Planning estimate for a narrow, integrated live demo: **18–26 focused engineering hours**, approximately **2–4 working days for one engineer**, conditional on an operational environment and agreed simple calculation rules. This is an initial estimate with low confidence until runtime and calculation contracts are checked. Country statutory payroll, external payroll-provider integration, production hardening and actual bank execution are outside this estimate.

One working day is a high-risk prototype target. Do not promise all four reliable live flows in 8–10 hours based on table existence. A rehearsed subset can be offered if the full slice misses its checkpoint; disclose that reduced scope explicitly.

## Target scope, delivered incrementally

- One tenant, one company, one currency, one monthly period unless the customer specifies another frequency.
- Three to five synthetic employees, including one complete attendance case, one paid-leave case and one unpaid-absence/benefit case.
- One day shift and one attendance source: uploaded fixture or manual check-in/out through supported commands.
- One paid leave type, one unpaid leave type, opening entitlement and a simple agreed accrual/rounding policy.
- One benefit plan and an approved claim or allowance, with a defined cap and either payroll or reimbursement treatment.
- One pay structure: base pay, approved attendance/absence effect, approved benefit treatment and explicitly agreed deductions.
- Employee 360 provides navigation and summaries; full profile editing, recruitment and onboarding expansion do not compete with this demo's critical path.

Country/currency/frequency, leave policy, benefit policy, payroll treatment and expected results are unresolved inputs. Do not invent statutory rates or silently describe illustrative payroll as country-compliant payroll. An illustrative rule set requires explicit agreement and visible labelling. Payroll can calculate live and persist results without sending money to a bank.

## Target customer journey

1. Open an employee and the selected pay period.
2. Import or enter punches, process attendance and display calculated work/absence values with source evidence.
3. Submit and approve leave; show entitlement and consumption. Paid leave must not also become unpaid absence.
4. Apply or claim the selected benefit; show eligibility, cap, approval and remaining entitlement.
5. Calculate payroll from accepted attendance, leave and benefit inputs; display a component breakdown and payslip.
6. Make an allowed draft input change, recalculate and show the explained difference. Finalized results follow correction/version rules rather than silent overwrites.

Live means persisted inputs, server-side calculations and approvals, refresh-stable results and repeatable commands. Seed data is acceptable; hard-coded payroll totals or fake successful approval responses are not.

## Reference work budget for the complete target

| Work package | Estimate | Acceptance |
|---|---|---|
| Runtime preflight, demo rules and expected-result fixtures | 2 hours | Environment usable; independent arithmetic expectations agreed; decision on supported workflow path |
| Attendance ingestion and processing | 3–4 hours | Deterministic results, duplicate import safe, missing-punch exception visible |
| Leave request, calculation and ledger effect | 3–4 hours | Correct paid/unpaid treatment, no double balance consumption, approved cancellation/reversal behavior defined |
| One benefit plan/application and approved effect | 2–4 hours | Typed persisted contract, cap check and once-only financial/payroll consumption |
| Payroll orchestration and payslip | 4–6 hours | Accepted source inputs, exact decimal arithmetic, rule/input evidence, persisted breakdown and reproducible totals |
| Integration testing, access checks, fixes and rehearsal | 4–6 hours | Completed live steps reproduce expected results; employee scope and relevant retries checked; pending steps excluded from the live walkthrough |

These packages total 18–26 hours for the full target, not a minimum spend or completion requirement before demonstrating a working increment. Estimates assume minimal screens built from existing components and no broad schema redesign. Unexpected migration, publication, workflow, IAM or runtime failures consume additional time.

## Checkpoints and release discipline

- After preflight: select the next functional increment using available contracts/data; record unresolved rules without blocking independent work.
- During implementation: finish and check each increment before connecting it to the next. Payroll integration uses actual accepted inputs; unfinished steps remain presentation material.
- Before rehearsal: select the locally working flows for the live walkthrough and verify their relevant retries, recalculation, denied access and expected totals. No requirement to complete all four areas.
- Before the meeting: run a smoke test, reset synthetic data through a controlled process and verify accounts/environment. Keep a recorded run as an explicitly labelled backup, not a substitute misrepresented as live processing.

This document records the revised estimate and the customer's priorities. No implementation or migration was performed in this planning update; deployment/runtime acceptance remains to be verified during execution.
