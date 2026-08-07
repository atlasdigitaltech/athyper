# HR and payroll DDL migration into the three-plane foundation

Date: 2026-07-31  
Status: Proposed implementation plan  
Source: existing Neon `master` DDL and the three-database desired-state foundation

## 1. Recommendation

Keep the listed HR, workforce, leave, and payroll tables canonical in the
**Neon database** (`athyper_neon`).

- Neon is the tenant ERP and workforce operating plane.
- Admin may administer a Neon tenant through Neon APIs and explicit Admin-plane
  authorization, but it must not own a second copy of the HR tables.
- Mesh must not contain tenant employee, employment, payroll, position, leave,
  or work-assignment authority.
- The Athyper platform database must not receive tenant HR data merely because
  the Admin application exists.
- Cross-plane consumers receive only purpose-specific projections through APIs
  or events. There are no cross-database foreign keys or runtime fallback reads.

`holiday_calendar` and `holiday_calendar_day` are the only capability-level
exception. Neon still owns the tenant ERP/HR calendars in this migration. Mesh
may keep its existing, independently owned network calendar implementation, and
Athyper may add its own local calendar later if platform scheduling requires it.
These are separate records with separate ownership, not replicas of Neon's
calendar tables.

The target for the 25 requested tables is therefore:

```text
Admin application
    |
    | Admin-plane authorization + target tenant
    v
Neon API/business services
    |
    v
athyper_neon.master HR/payroll tables  <-- canonical authority

athyper_platform  No tenant HR copy
athyper_mesh      No tenant HR/payroll copy
```

## 2. Table disposition

| Family | Tables | Canonical database/schema | Admin use | Mesh use |
|---|---|---|---|---|
| Workforce identity | `employee`, `employment` | `athyper_neon.master` | Operate through Neon service only | None |
| Employee enrollment | `employee_leave_enrollment`, `employee_statutory_enrollment` | `athyper_neon.master` | Exceptional support through Neon service | None |
| Job architecture | `career_band`, `career_level`, `designation`, `job`, `job_family`, `job_function`, `position` | `athyper_neon.master` | Read/support through Neon service | None |
| Payroll configuration | `pay_component`, `pay_grade`, `pay_group`, `pay_structure`, `pay_structure_line` | `athyper_neon.master` | Read/support through Neon service | None |
| Leave configuration | `leave_plan`, `leave_plan_rule`, `leave_type` | `athyper_neon.master` | Read/support through Neon service | None |
| Business calendar | `holiday_calendar`, `holiday_calendar_day` | Neon copy in `athyper_neon.master` | Read/support through Neon service | Separate Mesh-local calendar contract only |
| Work scheduling | `shift_type`, `work_assignment`, `work_pattern`, `work_pattern_day` | `athyper_neon.master` | Read/support through Neon service | None |

Do not add `plane_code` to these business rows. Physical database ownership
already establishes the data plane, while `tenant_id` establishes the tenant
boundary. `plane_code` belongs in authorization/admission/catalog contracts,
not in every Neon business table.

## 3. Important contract decisions before copying SQL

The legacy DDL is the source inventory, not an automatically accepted target
contract. Review these decisions before moving any table:

### 3.1 Employee, person, employment, and assignment authority

The current `employee` table duplicates data that also belongs to `person`,
`employment`, and `work_assignment`. The new foundation should establish one
writer for each fact:

| Fact | Canonical table |
|---|---|
| Name and personal/contact attributes | `person` and its sensitive/contact extensions |
| Login identity | `principal`, linked from `employee` |
| Employee number and workforce identity | `employee` |
| Employer, company, employment type/status, hire and termination dates | `employment` |
| Job, position, org unit, manager, site, cost/profit center, FTE and effective dates | `work_assignment` |

Legacy `employee.department`, `title`, `employment_type`, `company_code_id`,
`hire_date`, and `termination_date` must not remain competing write
authorities. Migrate their values into the canonical tables and provide a
compatibility view if existing readers still need the flattened shape.

Before implementation, decide whether `employee.manager_id` is retained as a
temporary compatibility field or removed in favor of the effective-dated
`work_assignment.manager_employee_id`. The preferred steady state is the latter.

### 3.2 Sensitive data

`employee_statutory_enrollment.member_number`, employee contact information,
leave opening balances, and future compensation values require more than
tenant-only RLS.

- Keep tenant RLS on every table.
- Restrict write and unmasked read operations to HR/payroll service roles.
- Expose masked or purpose-specific views to general application roles.
- Audit reads and writes of statutory and payroll-sensitive fields.
- Do not send these fields to Mesh or general Admin session/bootstrap payloads.

### 3.3 Configuration versus master schema

For this migration, retain these tables in `master` to match the accepted Neon
catalogue and existing entity contracts. Do not mix a schema redesign with the
physical three-plane split.

A later ADR may introduce dedicated `hr` or `payroll` schemas. If that happens,
move the complete domain slice—including APIs, metadata, grants, audit, and
generated clients—in one versioned migration rather than partially relocating
tables now.

### 3.4 Calendar semantics

Neon's calendar supports tenant, country, company, legal-entity, and site
scope. Mesh's existing calendar is account/network-local. Do not force both
contracts into a shared mutable table.

Only universal immutable values such as country codes belong in `shared`.

## 4. Missing prerequisites and dependency gates

The new Neon foundation already contains `tenant`, `principal`,
`legal_entity`, `company_code`, `org_unit`, `cost_center`, and `profit_center`.
The HR slice must not be added until these additional dependencies are present
and locked:

| Prerequisite | Needed by | Required action |
|---|---|---|
| `master.person` | `employee`, `employment` | Move the reviewed Neon people/person contract first |
| `master.site` | calendar, position, work assignment | Move the Neon operating-location contract first |
| `master.statutory_scheme` | statutory enrollment | Include in the payroll prerequisite pack even though it was omitted from the requested list |
| `control.formula_expression` | pay component and structure line | Move and validate the formula definition contract |
| `control.formula_expression_version` | leave plan rule | Move and validate immutable formula versions |
| `master.holiday_calendar` | pay group and existing payment term compatibility FK | Install the calendar wave before pay groups; activate the deferred payment-term FK |
| Tenant-scoped alternate keys | every composite FK | Ensure every parent exposes validated `UNIQUE (tenant_id, id)` |
| System principal | non-null audit actors | Seed before reference and tenant HR data |

If any prerequisite is intentionally deferred, defer its dependent HR table as
well. Do not weaken a composite tenant FK to an unscoped UUID FK just to make a
wave compile.

## 5. Target desired-state files

Add Neon-only domain files under `server/db/ddl/planes/neon`; do not add
equivalent files to `planes/athyper` or `planes/mesh`.

Recommended file layout:

```text
planes/neon/master/
  02_hr_domains.sql
  03_hr_job_tables.sql
  03_hr_calendar_tables.sql
  03_hr_payroll_tables.sql
  03_hr_workforce_tables.sql
  05_hr_constraints.sql
  06_hr_indexes.sql
  07_hr_functions.sql
  08_hr_triggers.sql
  09_hr_views.sql
  10_hr_rls.sql
  11_hr_grants.sql
  12_hr_reference_seed.sql
```

The Neon `_manifest.txt` must list these in phase order, not merely in filename
order. The fresh-database build remains:

```text
domains
-> all tables
-> pre-constraints if required
-> constraints
-> indexes
-> functions
-> triggers
-> views
-> RLS
-> grants
-> reference seed
```

Use the existing legacy files only as extraction inputs:

- `master/01_tables.sql`
- `master/03_constraints.sql`
- `master/04_indexes.sql`
- `master/05_functions.sql`
- `master/06_triggers.sql`
- `master/07_views.sql`
- `master/08_rls.sql`

Move every table as an atomic object bundle. A table is not complete until its
checks, unique keys, tenant-safe FKs, indexes, functions, triggers, views, RLS,
grants, comments, metadata registration, and seed dependencies have moved.

## 6. Implementation waves and dependency order

### Wave 0: lock ownership and field contracts

1. Approve this Neon-only ownership decision.
2. Record the employee/person/employment/work-assignment single-writer rules.
3. Inventory all inbound and outbound FKs, generated clients, services, entity
   metadata, lookup domains, blueprints, and tenant seeds.
4. Classify every legacy column as keep, transform, deprecate, or reject.
5. Define masking and audit requirements for sensitive fields.

Exit gate: signed field contract and zero unresolved owner/FK decisions.

### Wave 1: prerequisites

Move and certify:

1. `person` and required sensitive/contact extensions.
2. `site`.
3. formula expression and formula version authority.
4. system principal/audit-actor seed.
5. tenant-safe keys on existing organization and finance parents.

Exit gate: an empty Neon foundation builds with all prerequisites, while
Athyper and Mesh manifests remain unchanged and independently buildable.

### Wave 2: job classification

Create and constrain in this order:

1. `career_band`
2. `career_level`
3. `designation`
4. `job_family`
5. `job_function`
6. `pay_grade`
7. `job`

`job` is last because it references the other classification tables.

Seed the job-classification blueprint only into Neon. Validate that every
reference remains within the same `tenant_id`.

### Wave 3: calendar and work-pattern configuration

Create and constrain:

1. `holiday_calendar`
2. `holiday_calendar_day`
3. `shift_type`
4. `work_pattern`
5. `work_pattern_day`

After `holiday_calendar` is certified, add and validate the deferred
`payment_term(tenant_id, holiday_calendar_id)` FK already anticipated by the
new Neon DDL.

Do not use the existing Mesh calendar as a parent or seed source.

### Wave 4: payroll and leave configuration

Create and constrain:

1. `pay_component`
2. `pay_group`
3. `pay_structure`
4. `pay_structure_line`
5. `statutory_scheme`
6. `leave_type`
7. `leave_plan`
8. `leave_plan_rule`

The exact order between leave and payroll subfamilies may run in parallel after
formula/calendar prerequisites, but their seed order must follow their FKs.

Convert the current `blueprints/universal/070_people` HR/payroll blueprints into
a Neon-owned pack or explicitly allowlist them only in the Neon seed manifest.
The word `universal` must not cause the data to be installed into Mesh or
Athyper.

### Wave 5: position and workforce

Create and constrain:

1. `position`
2. `employee`
3. `employment`
4. `work_assignment`

Run the legacy employee transformation only after the target person,
employment, job, position, organization, and work-assignment contracts exist.

The existing `backfill_people_from_employee` function must be reviewed and
converted into a one-time migration utility. It should not remain an ordinary
runtime function after the migration is certified.

### Wave 6: enrollments

Create and constrain:

1. `employee_leave_enrollment`
2. `employee_statutory_enrollment`

These are last because they require certified employee, plan, scheme, and
payroll configuration data.

Exit gate: no enrollment references an inactive/missing employee, plan, or
scheme; effective-date overlap rules are validated.

### Wave 7: application and generated-contract cutover

1. Regenerate the Neon database client from the new Neon manifest.
2. Remove HR/payroll models from the Mesh generated schema. Their current
   presence is legacy schema leakage, not Mesh ownership.
3. Point Neon HR/Payroll entity metadata and services at the new desired-state
   tables.
4. Keep normal HR setup and operations in Neon.
5. If Admin support workflows are required, route them to Neon APIs with
   explicit target-tenant Admin authorization and audit evidence.
6. Add boundary tests proving Mesh and Athyper runtimes cannot query these
   tables.

## 7. Data migration and cutover

Treat desired-state DDL relocation and live-data movement as two separate
deliverables.

### 7.1 Rehearsal

1. Take schema-only and data backups of the current Neon source.
2. Build the complete new Neon manifest in a fresh database.
3. Capture per-table source counts, tenant counts, PK hashes, and FK orphan
   counts.
4. Export data in declared dependency order.
5. Transform duplicated employee facts into person, employment, and assignment
   authority.
6. Import parents before children.
7. Recalculate generated/derived fields rather than trusting exported values.
8. Compare counts, stable UUIDs, business keys, checksums, and effective dates.
9. Run application/API smoke tests with least-privilege Neon and Admin sessions.

Repeat until the migration is deterministic and produces no manual edits.

### 7.2 Production cutover

1. Announce an HR/payroll configuration write freeze.
2. Stop or drain jobs that write employee, leave, schedule, or payroll masters.
3. Capture a final watermark and backup.
4. Apply final delta changes after the last successful rehearsal snapshot.
5. Validate constraints and RLS before enabling application traffic.
6. Switch Neon services and generated client as one compatible release.
7. Keep Admin support disabled until Neon tenant traffic passes smoke checks.
8. Observe errors, authorization denials, audit volume, and migration
   reconciliation metrics.
9. End the write freeze only after the named go/no-go approvers accept evidence.

### 7.3 Rollback

Rollback is a release-and-data decision, not a DDL `DROP` script.

- Before the first post-cutover write, rollback may restore the source service
  version and database snapshot.
- After post-cutover writes begin, do not independently switch code back.
  Reconcile or replay writes to the old authority first, or restore the entire
  migration unit to the approved recovery point.
- Never delete the old source tables during the initial cutover. Make them
  read-only, retain them for the approved observation period, and remove them
  only in a later contraction release.

## 8. Seed migration

The repository currently contains HR seeds in both blueprint and tenant paths.
Reclassify them as follows:

| Seed type | Target |
|---|---|
| Job, leave, work schedule, and payroll blueprints | Neon seed pack only |
| Holiday calendars used by Neon finance/HR | Neon seed pack only |
| Tenant employees, employments, positions, assignments, and pay groups | Corresponding Neon tenant pack |
| Lookup values that describe Neon HR behavior | Neon control/reference seed unless demonstrably universal and immutable |
| Mesh calendar reference data | Mesh-local seed with Mesh ownership contract |
| Athyper platform staff identity | Platform principal/membership seed, not a copied tenant employee record |

Seed scripts must be idempotent, use stable IDs, verify their database plane,
and fail when a required parent is missing. Remove implicit `meshDb ?? db` or
cross-plane fallback behavior.

## 9. Security and authorization requirements

Every requested table must:

- have `tenant_id NOT NULL`;
- have `PRIMARY KEY (id)` and a tenant-safe alternate key such as
  `UNIQUE (tenant_id, id)`;
- use composite tenant FKs for tenant-owned parents;
- enable and force RLS;
- reject missing or mismatched tenant context;
- use UUID audit actors tied to the local principal contract;
- expose least-privilege grants rather than the legacy broad
  `athyperadmin`/`athyperapp` pattern;
- require exact HR or Payroll entity-operation permissions;
- distinguish Neon and Admin plane eligibility in authorization metadata;
- record Admin target-tenant writes with operator, shadow principal, reason,
  before/after values, correlation ID, and authorization decision evidence.

Admin-plane membership is not permission to edit all employee/payroll records.
It is only an admission gate; exact permissions, scope, MFA, deny policy, and
audit requirements still apply.

## 10. Validation matrix

### Database build

- Neon manifest builds from an empty `athyper_neon` database.
- Athyper and Mesh manifests build without any HR table.
- Neon build succeeds with Mesh unavailable.
- Mesh build succeeds with Neon unavailable.
- A wrong-database foundation run fails before DDL executes.

### Data integrity

- zero cross-tenant FK matches;
- zero orphan employees, employments, assignments, positions, enrollments, or
  structure lines;
- one active primary assignment per employee where policy requires it;
- one valid parent for every career level, job, position, plan, and structure
  line;
- no invalid effective-date ranges;
- no overlapping active enrollments where the business rule forbids overlap;
- source/target counts and stable-ID checksums reconcile by tenant.

### Security

- wrong-tenant reads and writes fail under least-privilege identities;
- Neon user without HR permission cannot read statutory/payroll-sensitive data;
- Admin user without target-tenant admission fails closed;
- Admin user with admission but without the exact operation still fails;
- Mesh credentials cannot connect to or query Neon HR authority;
- masked projections do not expose member numbers or compensation data.

### Application

- Neon entity lists, detail pages, mutations, lookups, and workflows pass;
- leave and payroll formula resolution passes;
- payment terms resolve the new Neon holiday-calendar FK;
- profile/session paths resolve employee context without reading deprecated
  duplicate columns;
- background payroll, attendance, leave, onboarding, and offboarding consumers
  use the same canonical IDs;
- Prisma/generated schemas contain HR models only for Neon consumers.

## 11. Completion criteria

The migration is complete only when:

1. all 25 requested tables and required prerequisites are present in the Neon
   desired-state manifest as reviewed object bundles;
2. no tenant HR/payroll table or generated model remains in the Athyper or Mesh
   desired state;
3. Admin operates Neon records through explicit Neon services and Admin-plane
   authorization, without a duplicate data store;
4. seed ownership is plane-specific and deterministic;
5. employee/person/employment/assignment facts have one canonical writer;
6. sensitive fields have tested least-privilege and masking controls;
7. empty-build, migration-rehearsal, boundary, RLS, and application tests pass;
8. rollback evidence and the old-source retention/contraction decision are
   approved.

## 12. Suggested implementation sequence

The practical first delivery should be a contract PR, not a bulk SQL copy:

1. approve Neon ownership and the four-table workforce authority split;
2. inventory missing prerequisites and inbound consumers;
3. add `person`, `site`, and formula prerequisites to the Neon foundation;
4. move the job-classification and calendar waves;
5. move payroll/leave configuration;
6. move position/workforce/enrollments;
7. cut over seeds, metadata, generated client, services, and Admin support;
8. certify the three-plane boundary and contract legacy DDL in a later release.

