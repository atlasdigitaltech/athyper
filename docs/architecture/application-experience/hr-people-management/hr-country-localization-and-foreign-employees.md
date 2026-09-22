# HR localization and local / foreign employees

Reviewed: 2026-09-21. Repository DDL assessment and proposed design; no migration applied. This document describes data responsibilities, not country-specific legal or tax rules. Country payroll qualification remains separate from the existence of country fields.

## Verdict

Athyper has a multi-country data foundation and can represent employees with a nationality different from their employer's country. It does not yet have a complete structured model for citizenship history, immigration permission, tax residency, cross-border assignments or country-qualified payroll processing.

Keep one shared employee model. A directly employed foreign national belongs in Stage 1 Internal Workforce. Stage 2 External Workforce covers supplier-backed engagements, irrespective of the worker's nationality. Do not create separate local_employee and foreign_employee tables or determine worker role from nationality.

## Current coverage

| Capability | Existing DDL evidence | Assessment |
|---|---|---|
| Country reference data | shared.country: two/three-letter codes, calling/postal metadata; shared state/region reference infrastructure | Foundation present. Country codes do not establish statutory support. |
| Currency reference data | shared.currency.code, symbol, minor_units; compensation, pay group, structure and result currency fields | Multiple currency storage present. Payroll FX conversion, settlement and rounding still need explicit behavior and snapshots. |
| Employer and work location | legal_entity.registration_country_code; company configuration; employment legal_entity_id/company_code_id; work_assignment.site_id; site.country_code/timezone_code | Can distinguish employer and work location through relationships. Cross-border rule selection is not automatic. |
| UI language and timezone | tenant_profile locale/timezone and enabled/default/fallback locales; principal_ui_profile locale/timezone; shared.locale | Foundation present. Current tenant policy permits en, ar, ms, zh-Hans, hi, ta, fr, de and requires English fallback. This does not prove every HR screen or document is translated. |
| Localized document templates | template_binding.locale_code; render_output.locale/timezone | Partial. Template locale regex accepts language plus optional two-letter region, so it does not accept zh-Hans even though tenant policy does. Reconcile locale validation across the platform. |
| Employee nationality | person_sensitive_profile.nationality_country_code | One nationality field; insufficient for multiple citizenships and history. person.country_code has different/unspecified semantics and should not substitute for citizenship. |
| Identity documents | national_id_type/token, tax_identifier_token, passport_number_token | Basic protected-value slots. Multiple countries/documents, issue/expiry and verification need structured child records. |
| Country payroll setup | pay_group.country_code/currency_code/company_code_id; statutory_scheme.country_code, employee/employer component and rate/formula references | Reusable foundations. A country-enabled calculation package and its qualified versions are not established by these columns. |
| Statutory membership | employee_statutory_enrollment: employee_id, scheme_id, effective dates, contribution_category, member_number | Partial. Employment/employer scope and eligibility need definition; member_number is plain text in this declaration. |
| Country tax declarations | employee_tax_declaration: employee_id, employment_id, country_code, tax_year, version_no; declaration lines | Present. Not a dedicated tax-residency record. Lines require an amount or quantity, so they are not a general categorical residency store. |
| Country calendars and leave | holiday_calendar.country_code; leave_plan.country_code; work patterns and dated shifts | Foundation present. Need effective employee schedule/calendar and policy assignment, including regional/company rules. |
| Work permits / visas / residency | No dedicated matching HR tables found in DDL scan | Proposed extension required. Generic protected JSON can hold content but does not establish validated lifecycle support. |

Evidence: [shared references](../../../../server/db/ddl/common/shared/03_tables.sql), [tenant, locale, address and identity configuration](../../../../server/db/ddl/common/master/03_platform_tables.sql), [HR master tables](../../../../server/db/ddl/planes/neon/master/03_tables.sql), [HR documents](../../../../server/db/ddl/planes/neon/document/03_tables.sql), [formula and rate infrastructure](../../../../server/db/ddl/planes/neon/control/03_tables.sql). This is source inspection, not verification of a deployed database or end-to-end calculation services.

## Separate the facts that determine applicability

Employee 360 should distinguish citizenship, residence, tax residency, work authorization, employment relationship, physical work location and payroll jurisdiction. These are different facts with potentially different validity periods. UI language is a user preference, not a payroll jurisdiction selector.

For example, a person with country A citizenship can work for an employer in country B. The record should capture the actual work location, documented authorization and approved tax profile independently. Never infer tax residency or contribution eligibility solely from passport nationality, a home address, or the tenant's default country.

Use “local/foreign” only as a contextual display classification relative to a named country and classification policy. Where eligibility decisions need that classification, retain the policy version, effective period and evidence; do not use one permanent is_foreign flag as the calculation authority. Permanent residence, citizenship and tax residence must not be collapsed into that flag.

## Proposed table and field additions

These candidates extend the existing HR change plan; reuse its person_identifier, schedule and policy-version proposals rather than creating competing authorities. All tenant-owned rows need composite tenant references, audit, authorization and appropriate concurrency rules.

| Candidate | Core fields | Integrity and ownership |
|---|---|---|
| person_citizenship | person_id, country_code, citizenship_status_code, valid_from/until, evidence reference | Multiple citizenships permitted. Prevent duplicate overlapping records for the same scope; restricted evidence. |
| person_identifier (existing proposal) | person_id, identifier_type_code, issuing_country_code, value_token, issued_on, expires_on, verification_status | Multiple passports/national/tax IDs by country/type. No clear identifiers in general metadata or logs. |
| person_residency | person_id, country_code, residence_status_code, effective_from/until, evidence reference | Immigration/residence facts distinct from tax residency and addresses. Permit concurrent countries where the domain requires them. |
| person_tax_residency | person_id, jurisdiction reference, tax_year where applicable, effective_from/until, residency_status_code, determination_source, evidence reference | Approved tax facts; no global one-country-only constraint. Link employment payroll profiles to applicable determinations. |
| person_work_authorization | person_id, country_code, authorization_type_code, document identifier reference, sponsor legal entity where applicable, issued_on, valid_from/until, decision/status | Country/type-specific sponsor and work restrictions; renewal creates traceable records. A passport alone is not work authorization. |
| employment_work_authorization link | employment_id, authorization_id, effective range, verification outcome | Verify same person, correct scope and applicable dates. Do not assume every authorization requires sponsorship or belongs exclusively to one employment. |
| employment_payroll_profile / jurisdiction assignments | employment_id, payroll_jurisdiction_id, pay_group_id, tax-residency reference, social-security category, effective_from/until, policy version | Allow explicitly modeled multiple jurisdiction obligations where needed; no single global payroll-country field on person. Validate company, employee and pay-group agreement. |
| statutory enrollment extension | employment_id or explicit employer scope, protected member reference, eligibility/category source, policy version | Resolve current employee-level ambiguity without duplicating scheme definitions. Effective membership and eligibility are separate concepts. |
| Country HR rule package and version | country/jurisdiction, version, effective_from/until, supported capabilities, published state, source references, formula/rate/policy version bindings | Reuse control.formula_expression_version and rate infrastructure. Published inputs must remain reproducible; payroll results pin selected versions. |
| International assignment (later) | person_id, home/host employment references, home/host country, assignment type, start/end, payroll arrangement reference | Preserve home/host relationships and compensation ownership. Do not overwrite the person's nationality or original employment to represent a temporary move. |

Use lookup-controlled classifications with country applicability rather than hard-coded permit labels shared across every country. Where employer, site or occupation restrictions are multi-valued, use typed restriction children or a validated versioned schema. Do not allow arbitrary JSON to be the sole eligibility authority.

## Rule selection and calculations

Resolve the applicable employment and work location as of the processing date. Select the approved payroll jurisdiction/profile and effective country/region policy versions; evaluate the recorded tax, membership and authorization facts needed for that process. Snapshot the chosen inputs and rules into calculation evidence. Keep company benefits/policies distinct from statutory rules even when both contribute payroll lines.

Avoid one universal country-precedence list: attendance may follow the scheduled work location while a payroll obligation follows a separately assigned jurisdiction. Cross-border cases require explicit mappings. Missing or conflicting inputs should produce a visible exception rather than silently falling back to tenant country or zero deductions.

Authorization expiry should create a reviewable workforce exception under the selected policy. Do not blindly disable a user's login or erase an employment record when a date passes. Link verified decisions to existing workforce and IAM workflows.

## Build order and local checks

1. Retain the global core; qualify country/currency/locale references and fix conflicting locale validators. Deliver effective schedule/calendar and payroll-profile selection for one explicitly configured jurisdiction.
2. Add structured citizenship, identity, residency and authorization records needed for local and foreign direct employees. Reuse protected evidence and workflow capabilities.
3. Implement and test the selected country calculation rules, benefits and payslip templates; pin input versions. Add further countries as separate qualified packages.
4. Add home/host assignments, multiple-jurisdiction processing, split settlement and advanced cross-border scenarios when needed.

Local checks should cover two employees of different citizenships under the same employer, a change in residency/category mid-period, authorization expiry/renewal, a future assignment, multiple country pay groups, language changes that leave calculation outcomes unchanged, and retry-safe processing. Validate expected amounts against the explicitly selected rules; these scenarios are not claims about any country's legal requirements.

No extra production gate is introduced. For the demo, show the implemented country scope and working calculations; mark additional countries as planned until their services and rules are verified.

## Saudi Arabia, Malaysia and Singapore: tenant assessment

Additional repository review: 2026-09-22. The assessment below concerns schema capability and seed coverage, not installed tenant settings or country-law qualification.

| Layer | Strength | Evidence / remaining work |
|---|---|---|
| Reference data | Strong foundation | SA/MY/SG, SAR/MYR/SGD and Asia/Riyadh, Asia/Kuala_Lumpur, Asia/Singapore are seeded. Regional locale examples include ar-SA, en-SA, en-MY, ms-MY and en-SG. |
| Tenant presentation policy | Strong foundation | Tenant date/number formats, week start, weekend days, locale enablement and fallback; shared.locale includes direction. UI catalog qualification and tenant activation are explicit tables. Actual HR translation and RTL layout coverage still need verification. |
| Multi-company organization | Strong foundation | Same-tenant legal entities and company codes have country/currency context; company codes also have timezone and locale. One tenant need not mean one operating country. |
| Banking capture | Useful country-specific foundation | Existing SA.CAPTURE, MY.CAPTURE and SG.CAPTURE definitions support country-specific account capture. These do not establish payroll payment-file generation, payment execution or reporting support. |
| HR policy applicability | Partial | Country-aware calendars, leave plans, pay groups and statutory schemes exist. Effective employee/employment policy bindings and deterministic process-specific selection need completion. |
| Country payroll / foreign employees | Incomplete | Need qualified country rules, version pinning, structured residency/authorization, eligibility, outputs and runtime calculation evidence. |

Sources: [country seeds](../../../../server/db/ddl/common/shared/reference-data/001_country.sql), [currency seeds](../../../../server/db/ddl/common/shared/reference-data/003_currency.sql), [locale seeds](../../../../server/db/ddl/common/shared/reference-data/005_locale.sql), [timezone seeds](../../../../server/db/ddl/common/shared/reference-data/006_timezone.sql), [bank capture definitions](../../../../server/db/ddl/common/control/12_banking_reference_seed.sql), [locale governance](../../../../server/db/ddl/common/control/03_tables.sql).

### Illustrative configuration

These are proposed starting configurations, not mandatory national language, calendar or working-week rules.

| Context | Saudi operation | Malaysian operation | Singapore operation |
|---|---|---|---|
| Country | SA | MY | SG |
| Example functional/pay currency | SAR | MYR | SGD |
| Example work timezone | Asia/Riyadh | Asia/Kuala_Lumpur | Asia/Singapore |
| UI catalogs to enable if qualified | ar, en | ms, en | en; other qualified languages as needed |
| Regional formatting examples | ar-SA or en-SA | ms-MY or en-MY | en-SG |
| HR processing configuration | Explicit SA employer/payroll policy versions | Explicit MY employer/payroll policy versions | Explicit SG employer/payroll policy versions |
| Holiday / working week | Applicable site/schedule calendar | Applicable site/schedule calendar | Applicable site/schedule calendar |

The platform deliberately distinguishes UI catalog identity from formatting locale: ar can use ar-SA formatting, and ms can use ms-MY. Do not simply expand tenant catalog enablement to every regional shared.locale entry or create duplicate translation catalogs for each country. The separate template validation concern above needs testing against the locale actually passed to that template; it is not evidence that catalog and formatting locale must be identical. Preserve the existing [localization architecture](../localization-guidance-and-build-plan.md).

For three independent customers, use separate tenants and tenant-scoped configuration. For one group operating in all three countries, use a tenant with appropriate legal entities/company codes, country payroll groups, local schedules and explicit employee employment assignments. The existing organizational shape supports both patterns; this review does not establish deployment-region or data-residency compliance.

### Configuration ownership and priorities

- Tenant: enabled UI languages, default presentation settings and fallback behavior.
- Legal entity/company: employer identity, functional currency, country and company-specific policy bindings.
- Site/schedule: operational timezone, holiday calendar, work pattern and roster overrides. Tenant weekend_days is not the attendance authority for every country/site.
- Employment/payroll profile: applicable payroll jurisdiction, pay group, tax/eligibility facts and effective policy versions.
- Principal preference: UI language and display preferences. These must not change payroll jurisdiction or calculation amounts.

First implement one reusable country-policy binding and version-selection mechanism, rather than separate country copies of employee tables. Reuse existing formulas, rate tables, calendars, localization and banking capture. Require sufficiently complete employer/pay-group configuration before processing; several country fields are currently nullable for drafts. Preserve nullable draft capture while preventing silent fallback during a financial calculation.

Then qualify each country's HR rules and outputs independently. Include regional calendar differences, currency rounding, effective rule changes, restricted local identifiers and country-specific document requirements in those country increments. Store canonical dates consistently; any alternative calendar display/input needs explicit conversion and precision semantics rather than localized date strings in SQL date fields.
