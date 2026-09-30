# Employee personal information — screenshot-to-DDL review

> **Historical.** Written before commit `870f08f52` removed the bespoke Business Partner and workforce applications. Routes, packages and files named here may no longer exist, and de-linked paths were dead when this was cleaned up. New entity work goes through the shared Entity Framework ([onboarding guide](../../../runbooks/meta-entity-onboarding.md)); do not treat this as current instruction.

Reviewed: 2026-09-21. Scope: visible fields in the supplied employee screens, checked against current repository DDL. This is an assessment and proposed extension design; no database migration was applied. Names, identifiers, account numbers and other sample personal values from the screenshots are intentionally not reproduced in this document.

Spreadsheet version: [screen-field coverage map](employee-personal-information-field-map.csv).

## Assessment

The current model is a sound core employee/workforce foundation, but it does not yet capture the complete detailed employee file shown in the screenshots as structured, governed records. Basic identity, organization, employment dates, compensation, contacts and bank references already exist. Joining milestones, rich identity documents, education, previous employment, health/insurance and exit feedback require extensions. Some display fields should be calculated rather than stored.

Employee 360 should assemble this information from canonical owners:

- `master.person`: personal identity and names.
- `master.person_sensitive_profile`: protected personal attributes.
- `master.employee`: workforce identity and employee number, optional user link.
- `master.employment`: a particular employer relationship and employment dates/type.
- `master.work_assignment`: effective job, manager, organization and costing placement.
- Shared contact/address/banking records: reusable linked data with HR-specific permissions.
- HR documents: approvals, onboarding, separation, compensation change, evidence and financial outcomes.

Do not add every screen field to `master.employee`. Its flattened name/contact/employment/organization fields are compatibility fields; the DDL explicitly identifies employment and assignment as canonical for new workforce writes.

**Legend:** Existing = dedicated current field or relationship; Derived = calculate from canonical records; Partial = related storage exists but the full business meaning/link/validation is incomplete; New = no dedicated matching model/field found. Existing does not mean its UI/API is already delivered.

## 1. Overview and company details

| Screen field | Current DDL mapping | Coverage | Recommended treatment |
|---|---|---|---|
| First name | person.first_name text NOT NULL | Existing | Canonical personal field; avoid independently editing employee.first_name. |
| Middle name | person.middle_name text | Existing | Preserve entered name components; do not infer family relationships from a name particle. |
| Last name | person.last_name text NOT NULL | Existing | Review mandatory last-name constraint for people with a single legal name. |
| Full name | person.name; display_name; preferred_name | Existing | Define legal/display/preferred name semantics. A display formatter may assist but must allow culturally appropriate ordering and a manual legal name. |
| Gender | person_sensitive_profile.gender text | Existing | Controlled optional values and restricted access; screenshot-required fields need not become globally mandatory DDL. |
| Salutation | No dedicated person field | New | Add nullable salutation_code referencing a governed lookup. Do not infer gender from salutation. |
| Nationality | person_sensitive_profile.nationality_country_code char(2) | Existing / partial | Single nationality exists; multiple citizenships need a child model. person.country_code is not a safe substitute. |
| Date of birth | person_sensitive_profile.date_of_birth date | Existing | Optional protected field with existing future-date check; expose only to permitted purposes. |
| Age | No stored age | Derived | Calculate completed years at explicit as_of_date from DOB. Do not persist a number that becomes stale. |
| Date of joining | employment.hire_date date NOT NULL | Existing | Use selected employment. Original hire/service date is a separate concept for rehires and multiple employment. |
| Status | person.status; employee.status; employment.status/employment_status; principal.status | Partial | Show separately named employment and access status; define which status drives the header. Do not update all statuses together. |
| User Details (collapsed) | employee.principal_id → principal/profile/identity_binding | Existing foundation | User link is optional. No additional hidden screen fields can be assessed from the collapsed panel. |
| Company | employment.company_code_id and legal_entity_id | Existing | Display employer/company names through references, not employee.company_code_id compatibility values. |
| Department | work_assignment.org_unit_id | Existing | Confirm org unit represents the selected department and is valid for the employment/company. |
| Employment type | employment.employment_type | Existing | Existing allowed values include full_time, part_time, contract, casual, intern, volunteer. Keep assignment/classification dimensions separate. |
| Employee number | employee.employee_number text, unique per tenant | Existing | Distinct from employment.employment_number, which is unique per tenant/company. Do not require numbers to be numeric. |
| Designation | work_assignment.job_id → job.designation_id → master.designation | Existing | Use designation name or job/position title according to explicit display precedence. |
| Reports to | work_assignment.manager_employee_id | Existing | As-of manager relation; additional HR/matrix managers need typed relationship rows. |
| Branch | work_assignment.site_id; company/org references | Partial | If branch means physical office, use site. If it means a business/legal organizational branch, use the appropriate organization hierarchy; do not equate them silently. |
| Grade | job.pay_grade_id → master.pay_grade | Existing / partial | Job default grade exists. A personal grade different from the job default needs an effective assignment/compensation override with defined ownership. |

Source: [person, job, designation, position and workforce tables](../../../../server/db/ddl/planes/neon/master/03_tables.sql), [job/workforce foreign keys](../../../../server/db/ddl/planes/neon/master/05_constraints.sql), [current employee compatibility view](../../../../server/db/ddl/planes/neon/master/09_views.sql).

## 2. Joining

| Screen field | Current mapping | Coverage | Required extension/meaning |
|---|---|---|---|
| Job applicant | No internal job-application link on employment | New | Link to the eventual internal application/accepted offer; external_candidate_submission is supplier recruitment, not internal applicant history. |
| Offer date | No dedicated employment/offer field | New | Store issued_on on an employment-offer document; retain offer acceptance separately. |
| Confirmation date | employment.probation_end_date only | Partial | Add confirmed_on. Planned probation end does not prove actual confirmation. |
| Contract end date | employment.termination_date only | Partial | Add contract_end_date for planned fixed-term expiry. Actual employment termination is a separate field/event. |
| Notice (days) | No dedicated employment term | New | Add notice_period_days integer nullable with nonnegative check and policy/term version. Null means unknown; zero means an explicit zero-day term. |
| Date of retirement | No dedicated field | New | Optional planned_retirement_date plus policy-version/source or authorized override. Do not infer a statutory retirement age from the screenshot. |

The existing employment `service_date`, `probation_end_date`, `hire_date` and termination fields are useful; they do not replace these missing milestones. `onboarding_case.target_start_date` is a planned onboarding date, not the accepted employment-offer date.

## 3. Address, contacts and emergency contact

| Screen field | Current mapping | Coverage | Recommended treatment |
|---|---|---|---|
| Mobile | person.primary_phone; contact_link/contact_phone | Existing foundation | Reuse registered person-owned contact_link with phone/mobile purpose; primary_phone is a summary. |
| Personal email | contact_link.value/channel_type/purpose | Existing foundation | Use personal purpose and HR privacy; qualify person owner registration and allowed lookups. |
| Company email | Same shared contact model; person.primary_email summary | Existing foundation | Work purpose, employment association where concurrent employment needs separate company emails. |
| Preferred contact email choice | contact_link.is_primary is available | Partial | Define preference across personal/work email purpose; add a typed selected contact reference where per-purpose primary does not encode this choice. |
| Preferred email displayed value | Selected current authorized email | Derived | Resolve selected contact; do not store another editable email copy. |
| Unsubscribed | governance.channel_consent supports subject_type=person, channel_code, destination_hash, is_consented, effective/expiry; principal_notification_preference supports event/channel settings | Existing foundation / partial | Reuse consent/notification semantics; explicitly decide which communications the screen switch controls. A global boolean on employee would lose channel/destination/event context. |
| Address (collapsed) | master.address + address_link(owner_type_id,owner_id,purpose,effective dates) | Existing foundation | Home/current/permanent/mailing uses can be linked; exact hidden fields were not visible. Verify person ownership, HR access and any employment-specific host address. |
| Emergency contact name | sensitive_profile.emergency_contact JSON | Partial | Typed contact child with protected contact name and relationship instead of one unrestricted JSON object. |
| Emergency phone | Same JSON; shared contact model reusable | Partial | Link verified/normalized phone where useful; support more than one contact and priority. |
| Relation | Same JSON | Partial | Controlled relationship code plus optional explanation; maintain current/expired contact rows. |

Shared contacts already include validity and verification fields. Reusing them is preferable to creating separate employee_email and employee_phone authorities. Employees without a principal must still be able to have communication consent and emergency contacts.

Sources: [contact/address and principal preferences](../../../../server/db/ddl/common/master/03_platform_tables.sql), [person channel consent](../../../../server/db/ddl/common/governance/03_tables.sql).

## 4. Attendance and leave setup

| Screen field | Current mapping | Coverage | Recommended treatment |
|---|---|---|---|
| Attendance device / RF tag identifier | time_punch.device_ref describes a punch source; external_reference can map upstream records | Partial | Add an effective employee/device-system identifier binding, or qualify external_reference for the same semantics. Device identifier is not the same as employee identifier inside a device. No raw biometric templates in HR profile. |
| Holiday list | holiday_calendar/day exist | Partial | Employee/employment-to-calendar effective assignment is needed; a calendar master alone does not identify the employee's applicable calendar. |
| Default shift | shift_type, work_pattern/day, dated shift_assignment exist | Partial | Add effective employee work-schedule assignment with work pattern/calendar/timezone and default shift where required. A dated roster row is not a permanent default. |
| Expense approver | Generic workflow/authorization foundation | Partial | Resolve policy-based approvers; add effective per-employment override only when needed. |
| Shift request approver | Same foundation | Partial | Route by request type/scope; validate approver eligibility and delegation. |
| Leave approver | Same foundation; direct manager available | Partial | Derive manager where policy says so. Do not add three unvalidated employee UUID columns that bypass workflow authorization. |

Proposed override shape: employment_id, request_type_code, approver_principal_id, effective_from/until, source_request_id. One applicable override per policy coordinate; permission still checked at decision time. Reuse an existing workflow assignment mechanism if it already supports the full coordinate.

## 5. Salary and banking

| Screen field | Current mapping | Coverage | Recommended treatment |
|---|---|---|---|
| Cost to company (CTC) | compensation_assignment.base_amount/annualized_amount; pay components/employer cost; payroll results | Partial | CTC is not automatically base or annualized salary. Define period, currency and included employer costs/benefits; derive from versioned terms, or store an approved contractual CTC with its calculation basis. |
| Salary currency | compensation_assignment.currency_code; pay_group/pay_structure.currency_code | Existing | Display selected effective compensation currency and validate consistency. |
| Salary mode | Bank relationship exists, no dedicated employee payment instruction | Partial | Add effective employment payment_method_code and instruction/distribution; bank/cash/other modes need defined allowed values and ownership. |
| Payroll cost center | work_assignment.cost_center_id; payroll_result_line.cost_center_id | Existing / partial | Default from applicable assignment. Split costing or a payroll-only override requires typed effective allocation rules. |
| Bank name | bank_account.bank_institution_id → shared.bank_institution.name; bank_name_override | Existing foundation | Reuse shared bank directory/provisional references; verify employee bank link ownership. |
| Bank account number | bank_account.account_id_type/account_id_value/account_last4; metadata protectedValueToken path | Existing foundation | Use protected-value service and masked default display. DDL also permits a non-token branch, so column existence alone is not an encryption guarantee. |
| SWIFT/BIC | bank_account.bic_override | Existing foundation | Validate using the shared banking contract and applicable bank reference data. |
| IBAN | bank_account typed account identifier, rather than a dedicated iban column | Partial / typed representation | Confirm allowed ID types. If both local account number and IBAN must be retained for one account, design alternate identifiers instead of assuming one account_id_value stores both. |

Sources: [bank account, links and compensation](../../../../server/db/ddl/planes/neon/master/03_tables.sql), [shared bank directory](../../../../server/db/ddl/common/shared/03_bank_master.sql).

## 6. Personal details and identity documents

| Screen field | Current mapping | Coverage | Recommended treatment |
|---|---|---|---|
| Marital status | person_sensitive_profile.marital_status text | Existing | Controlled optional value; history when benefits/payroll needs an effective change. |
| Blood group | No dedicated field | New | Optional restricted health profile, governed values including unknown; not ordinary directory data. |
| Health details / allergies / concerns | protected_attributes JSON could hold arbitrary data | Partial | A versioned protected health-note content reference with purpose-specific access; ordinary person metadata is unsuitable. |
| Health insurance (collapsed) | Statutory schemes/enrollment exist, but no dedicated insurance coverage model identified | New | Insurer/plan, coverage dates, protected member/policy number and dependant links through benefits coverage. Exact hidden screen fields are unknown. |
| Passport number | person_sensitive_profile.passport_number_token | Existing / partial | One protected value is available; a multi-document identity model is needed for renewals/multiple passports. |
| Passport issue date | No dedicated field | New | issued_on date on identity document. |
| Valid from | No passport-specific validity field | New | valid_from date on identity document. |
| Valid up to | No passport-specific expiry field | New | expires_on date; define inclusive document expiry separately from exclusive assignment range semantics. |
| Place of issue | No dedicated field | New | issue_place text; avoid forcing every issuer to match a city lookup. |
| Place of issue country | No passport-specific field | New | issuing_country_code char(2) with country reference; nationality is not an equivalent. |
| Passport front page | Generic attachment/content infrastructure | Partial | Protected attachment bound to the identity-document row with front-page purpose and pinned version where evidence requires it. |
| Passport back page | Same infrastructure | Partial | Separate purpose from front page; flexible evidence slots for document types that have different layouts. |

An identity document can be expired while its historical record remains valid evidence. Renew by appending/linking a new document, not overwriting the old token and dates. Attachments inherit document-specific access and do not appear in the ordinary employee document list for unauthorized roles.

## 7. Profile, education and career history

| Screen field | Current mapping | Coverage | Recommended treatment |
|---|---|---|---|
| Bio / cover letter | No dedicated person profile narrative link | New / shared content reusable | Separate public/internal biography from restricted application cover letter; use versioned content and sanitized rich text. |
| Education school/university | No dedicated education record | New | institution_name text and optional verified institution reference. |
| Qualification | Shared certification is related, not a complete education history | New | qualification_code/name on education child; evidence attachment and verification status. |
| Education level | No dedicated education field | New | Governed qualification_level_code with country-specific mapping where needed. |
| Year of passing | No dedicated field | New | completion_year smallint nullable, optional completion_date; allow in-progress status and unknown dates without inventing a day/month. |
| Previous employer company | No prior-employment profile table | New | Employer name, optional organization reference; do not require every historic employer to be a Business Partner. |
| Previous designation | No prior-employment profile field | New | role_title text with actual dates/precision and verification where available. |
| Previous salary | No historical external-job salary field | New | Optional restricted amount/currency/frequency; collect only if required. Not current compensation authority. |
| Previous employer address | Shared address infrastructure only | Partial | Optional linked address or protected historical snapshot attached to previous-employment record. |
| Internal history: branch | work_assignment.site_id with effective range | Existing foundation | Derive from assignment history; define branch meaning as above. |
| Internal history: department | work_assignment.org_unit_id | Existing foundation | Preserve historical labels/reference revisions rather than showing renamed departments as if always named that way. |
| Internal history: designation | work_assignment.job_id → designation | Existing foundation | Historical job/designation reference or snapshot needed when masters change. |
| Internal history: from/to dates | work_assignment.effective_from/effective_until | Existing foundation | Build correct as-of/history query; current compatibility view is not the full history. No second manually maintained internal-history grid authority. |

Previous work experience is a person's career history. It is different from Stage 2 External Workforce, which describes current/past supplier-backed engagements with this buyer.

## 8. Exit, collaboration and connections

| Screen field | Current mapping | Coverage | Recommended treatment |
|---|---|---|---|
| Resignation letter date | No dedicated field | New | document.offboarding_case.resignation_received_on date plus protected letter attachment; distinguish letter date from received date if both are needed. |
| Relieving date | employment.termination_date; offboarding_case.target_exit_date | Partial | Define actual last working date versus employment end versus planned exit; add last_working_date/relieved_on only for distinct facts. |
| Exit interview held on | No dedicated exit interview record | New | exit_interview.conducted_at timestamptz or conducted_on date, matching capture precision. |
| New workplace | No dedicated field | New | Optional restricted self-reported destination_employer_name on exit interview; never mandatory for exit completion. |
| Leave encashed? | Leave ledger and payroll components/results | Partial | Derive from approved encashment/settlement lines; store quantity/unit/rate/amount/currency and source references rather than only a boolean. |
| Reason for leaving | employment.termination_reason text; offboarding_case.reason_code | Existing / partial | Controlled reason and restricted narrative with clear canonical ownership. |
| Feedback | No dedicated exit-feedback field | New | Protected exit-interview response content, with template version and interviewer. |
| Comments | document.comment shared model | Existing foundation | Bind to employee/HR case with appropriate visibility; do not put health/identity details in a general comment stream. |
| Activity | Shared audit/workflow/event infrastructure | Existing foundation | Show authorized event summaries and actor/time; do not expose raw sensitive payloads. |
| New Email / New Event | Communication/calendar integration capability, not employee master columns | Separate capability | Capture associations through existing integration/document model when implemented; do not imply sending/invitation is available merely because the button exists. |
| Connections tab | Panel content not supplied | Not assessed | Build related-record links from authoritative relationships; exact coverage cannot be determined from the tab label alone. |

Sources: [onboarding/offboarding and payroll documents](../../../../server/db/ddl/planes/neon/document/03_tables.sql), [shared attachments/comments](../../../../server/db/ddl/common/document/03_foundation_tables.sql).

## 9. Proposed focused DDL extension package

These are design candidates to reconcile with the existing [field change register](hr-workforce-field-changes.csv), not additional competing authorities. Every new tenant-owned row needs UUID identity, tenant FK, audit actors/timestamps, suitable composite tenant FKs, required-field checks and scoped access. Mutable rows need concurrency control; accepted evidence needs immutable revisions. Nullable below means unknown/not applicable is allowed; it must not silently become zero or an empty string.

| Owner / candidate | Fields to add or define | Important constraints |
|---|---|---|
| person / planned person_profile_revision | salutation_code text nullable; legal/display name semantics; optional biography_content_id uuid | Reuse planned effective profile history; sanitize content and control publication. Support single legal names before enforcing a universal family-name requirement. |
| employment or its planned terms revision | confirmed_on date; contract_end_date date; notice_period_days integer; planned_retirement_date date; retirement_policy_version_id uuid; source_offer_id uuid; last_working_date date — nullable when unknown | Confirmed date is not probation end. Nonnegative notice; dates consistent with the declared employment event semantics. Offer FK added with internal offer model, not an orphan UUID column. |
| person_identifier (extend earlier proposal to cover document details) | person_id uuid; identifier_type_code text; value_token text; issuing_country_code char(2); issued_on date; valid_from date; expires_on date; issue_place text; supersedes_identifier_id uuid; verification_status text | Required person/type/protected identifier; validity order where dates known; multiple documents allowed. Map earlier generic country_code to explicit issuing country semantics rather than creating duplicate passport and identifier tables. |
| Identity-document evidence link | identifier_id uuid; attachment/content version reference; evidence_kind text (front/back/other) | Reuse attachment series/version infrastructure; enforce tenant, owner and restricted evidence access. |
| person_emergency_contact | person_id uuid; protected_contact_name token/reference; relationship_code text; contact_link_id uuid; priority smallint; effective dates | Required parent/name; positive priority and valid contact reference; multiple current contacts allowed, explicit primary/priority rules. |
| person_health_profile | person_id uuid; blood_group_code text nullable; protected_health_content_id uuid nullable; recorded_at/by | One current profile or defined revisions; strict independent permission group, purpose audit and minimal display. |
| benefits coverage, using planned benefit enrollment | employment/person scope; benefit_plan_version_id uuid; coverage_from/until date; member_identifier_token text; insurer reference; dependant child links | Reuse benefit domain; do not overload statutory enrollment with insurance policy details. Effective coverage and reference consistency. |
| person_education | person_id uuid; institution_name text; qualification_name/code; level_code text; field_of_study text nullable; start/completion date nullable; completion_year smallint nullable; status; evidence reference | Support partial date precision and in-progress education; sensible chronology; avoid overly strict uniqueness that prevents repeated qualifications. |
| person_prior_employment | person_id uuid; employer_name text; role_title text; start/end dates or year/month precision; employment_kind text; location/address reference; optional protected compensation reference; evidence | Preserve partial dates and optional overlap; salary record requires amount/currency/frequency together and separate access. Never force prior employers into supplier master. |
| employee_work_schedule_assignment (existing proposal) | employee_id/employment_id uuid; work_pattern_id uuid; holiday_calendar_id uuid; timezone_name text; optional default_shift_type_id uuid; effective_from/until date | Same employee/employment, valid references and one applicable default per scope; use dated roster overrides. |
| Attendance source identity binding | employment_id or employee_id uuid; source_system_code text; device_scope text; external_employee_id text; effective dates | Unique applicable source/device/external identity; external_reference reuse if it can represent the full validity and device coordinate. Raw biometric templates excluded. |
| Approval override, only if existing workflow assignment cannot represent it | employment_id uuid; request_type_code text; approver_principal_id uuid; effective dates; source_request_id uuid | No self-approval where prohibited; approver must still be authorized at decision time; delegation and company scope checked. |
| employee_payment_instruction / distribution (existing proposal) | employment_id uuid; method_code text; currency_code char(3); effective dates; bank_account_link_id on distribution; percent/fixed/remainder fields as needed | Protected bank references, valid owner/company; sum/mode consistency for split payments; no raw account number on employee. |
| offboarding / exit_interview / settlement (existing proposals) | employment_id; resignation/last-working/actual-exit dates; reason; conducted date; protected feedback/destination; settlement encashment lines | Employment-specific exit; known planned versus actual dates; once-only settlement effects; boolean encashment derived from approved financial evidence. |

## 10. Robustness corrections before detailed data capture

1. Fix optional person_number uniqueness: UNIQUE NULLS NOT DISTINCT currently allows only one null per tenant.
2. Make canonical source rules explicit for duplicated employee/person/employment fields; one save command must update the owning records consistently in a transaction.
3. Add controlled lifecycle/status and personal lookup values where missing. Do not turn every screenshot red asterisk into NOT NULL: drafts and incomplete profiles require valid partial capture.
4. Fix current/as-of employee reads and preserve effective/history semantics before displaying joining/current organization/history together.
5. Require employment linkage on new assignment writes and validate company/site/manager/date relationships.
6. Reuse contact/address/bank/consent infrastructure with verified HR owner registration, reference validation and scoped APIs. Generic polymorphic owner IDs alone do not prove referential integrity.
7. Keep name/DOB/identifier, medical, banking, salary and exit-feedback field groups separately permissioned. Existing token-named columns and tenant RLS alone do not establish complete protection.
8. Reference versioned content for passport/health/profile evidence; validate attachment type, ownership and access. Never place raw identity/health/bank values in unrestricted metadata, general audit payloads or general comments.
9. Use decimal money types with currency and period/frequency; CTC, base pay, annualized pay and take-home pay are different quantities.
10. Apply the lightweight local checks already agreed: persist/reload, validation/denial, relevant boundary/retry tests and a short note of gaps. No production qualification pack is required to build this profile.

## 11. Suggested build order

1. Employee 360 basic overview and employment/job/grade links using existing data; correct age/name/status derivation and as-of selection.
2. Shared contacts/addresses, structured emergency contacts, joining term additions and identity-document records/evidence.
3. Employee schedule/calendar, approver resolution, compensation and payment instruction — directly supporting attendance, leave, benefits and payroll.
4. Education, previous employment, biography, health/insurance and structured exit details as independent increments.

This preserves the current robust ownership model while making the detailed employee file complete incrementally. The screenshots are a field reference, not authority to copy their sample values into development fixtures or to assume their payroll/retirement policy.
