# Acceptance scenarios

Status: canonical scenario catalogue; fixtures and owners to be assigned during build planning

## 1. Purpose

These stable identifiers replace positional scenario numbers from earlier working documents. A future workstream or release milestone is complete only when its applicable scenarios and cross-cutting controls pass against production-like dependencies.

## 2. Completion evidence

For each scenario record independent evidence for:

- approved design and contracts;
- clean and supported-upgrade database setup;
- exact-plane command/API integration;
- real UI journey where applicable;
- positive, denial, stale, replay, conflict, return and rollback branches;
- accessibility and responsive behavior;
- audit, snapshot, evidence, lineage and outbox integrity;
- notifications and operational telemetry;
- target-environment qualification where required.

An implemented database table or rendered UI does not by itself make a scenario green.

## 3. Supplier scenarios

| ID | Scenario | Required result |
| --- | --- | --- |
| BP-SUP-001 | Internal Supplier, new organization | Internal requester creates a case; independent approver materializes one BP and one Supplier role; readiness is explicit. |
| BP-SUP-002 | Internal Supplier, existing BP | Identity resolution reuses the BP and adds only the Supplier role/approved data. |
| BP-SUP-003 | Dual-role BP | Existing Customer gains Supplier role without duplicated organization identity or Customer authority. |
| BP-SUP-004 | Existing MESH account | Invitation/disclosure crosses MESH, remains a NEON proposal, is independently approved and linked. |
| BP-SUP-005 | New MESH account | Network identity and relationship are established without treating the account as the NEON BP. |
| BP-SUP-006 | Restricted supplier applicant | Applicant accepts invitation, resumes, uploads evidence, responds to correction and submits without internal or cross-invitation access. |
| BP-SUP-007 | Self-registration policy branches | Accept, internal-sponsor-required and reject paths create only permitted authority and evidence. |
| BP-SUP-008 | Duplicate resolution | Attributable candidates lead to governed link, merge, no-match or dispute; false merge is reversible without rewriting history. |
| BP-SUP-009 | Qualification and activation | Scoped qualification, bank verification and readiness produce activation only through the authorized command. |
| BP-SUP-010 | Supplier lifecycle | Profile/bank/qualification changes, suspension/reactivation and approved terminal transitions reconcile projections and retain history. |

## 4. Customer scenarios

| ID | Scenario | Required result |
| --- | --- | --- |
| BP-CUS-001 | New Customer organization | Governed application materializes one BP and one Customer role after identity and approval controls. |
| BP-CUS-002 | Existing BP gains Customer role | Existing organization is reused and only Customer-specific authority is added. |
| BP-CUS-003 | Supplier becomes dual-role | Customer role is added without changing Supplier qualification/status or duplicating the BP. |
| BP-CUS-004 | Credit review outcomes | Requested and approved values remain distinct; approved, conditional and rejected decisions are evidenced and scoped. |
| BP-CUS-005 | Designation and scope | Effective designation resolves correctly for organization/company/geography and rejects overlap or missing scope. |
| BP-CUS-006 | Readiness and activation | Stable reason codes identify blockers; only the Customer lifecycle command activates. |
| BP-CUS-007 | Five-action lifecycle | Activate, suspend, reactivate, deactivate and archive accept only valid source states and produce distinct failure outcomes. |
| BP-CUS-008 | Credit/designation change | Changed control decision is versioned and independently reconciled; it does not silently rewrite Customer status. |

## 5. Supplier-provided Workforce scenarios

| ID | Scenario | Required result |
| --- | --- | --- |
| BP-WRK-001 | Publish requisition | Approved requisition reaches only qualified suppliers with active capability; it creates no Person or access. |
| BP-WRK-002 | Candidate disclosure | Purpose-bound signed disclosure is received or quarantined atomically; general BP profile never carries candidate data. |
| BP-WRK-003 | Candidate isolation | Candidate consents, uploads evidence and resumes through a candidate-bound session with no Supplier admin, internal or cross-candidate access. |
| BP-WRK-004 | Evaluation and selection | Assigned evaluators use published criteria; governed selection retains evidence and no AI autonomous decision exists. |
| BP-WRK-005 | Commercial instrument and engagement | Work order/SOW and engagement are approved with scope/dates; neither directly creates IAM access. |
| BP-WRK-006 | Person identity resolution | Existing Person is reused or one new Person is created; Supplier organization and Person identities remain separate. |
| BP-WRK-007 | Placement and IAM | Approved engagement/placement provisions only bounded tenant/company/site/project/date access with observable saga state. |
| BP-WRK-008 | Extension and transfer | Effective-dated change updates placement/access without losing history or broadening authority accidentally. |
| BP-WRK-009 | Compliance suspension/reactivation | Expired requirement opens governed work and suspends only applicable access; reactivation requires satisfied policy. |
| BP-WRK-010 | Termination and deprovisioning | Normal/security end invalidates authorization, deprovisions access, retries/reconciles failure and cannot be undone by replay. |

## 6. Cross-cutting scenarios

| ID | Scenario | Required result |
| --- | --- | --- |
| BP-X-001 | Exact replay | Same idempotency key and fingerprint returns the recorded result without duplicate effect; changed fingerprint is rejected. |
| BP-X-002 | Concurrent mutation | One valid version wins; stale operation returns conflict with no partial writes and an actionable compare/refresh path. |
| BP-X-003 | Transaction rollback | Failure at each injected point rolls back state, evidence, audit, lineage and outbox as one effect set. |
| BP-X-004 | Contract mismatch | Compatible input transforms losslessly with provenance; incompatible input quarantines without authority mutation. |
| BP-X-005 | Tenant/plane/scope denial | Tampered context and direct cross-plane calls are denied even when the UI displays an action. |
| BP-X-006 | Maker/checker | Maker cannot execute the checker action; task ownership, scope and elevation are verified server-side. |
| BP-X-007 | Sensitive reveal | Unauthorized fields are omitted; authorized purpose/elevation reveal is time-bound and audited. |
| BP-X-008 | Evidence lifecycle | Quota, malware, hash/size mismatch, quarantine, replacement, expiry, retention and legal hold work against compatible Object Storage. |
| BP-X-009 | Historical proof | Point-in-time view matches snapshot, lineage, decision, audit and result coordinates and is read-only. |
| BP-X-010 | Notification reliability | Committed events deliver deduplicated safe messages; retry/dead-letter never repeats the domain command. |
| BP-X-011 | Atlas safety | Cited read respects field authorization; proposal is schema/policy checked; stale, expired or revoked confirmation is denied. |
| BP-X-012 | Accessibility/responsive | Primary journey passes WCAG 2.2 AA review, keyboard/screen reader, 200% zoom and phone/tablet/desktop behavior. |
| BP-X-013 | Operational recovery | Dashboards detect stuck cases, outbox lag, quarantine age, provisioning failure and projection drift; approved runbook restores/reconciles. |
| BP-X-014 | Clean and upgrade parity | Supported clean and upgrade paths produce equivalent schema, authority, behavior and scenario results. |

## 7. Required non-functional thresholds

Numeric thresholds are build-planning decisions and must be recorded before implementation is marked ready. At minimum define:

- P50/P95/P99 API and primary-screen latency with representative volume;
- upload size, duration, interruption and concurrency limits;
- invitation, confirmation-token and signed-download expiry;
- outbox, quarantine, provisioning and notification alert thresholds;
- availability, recovery time and recovery point objectives;
- deprovisioning and security-termination SLA;
- match precision/recall and false-merge tolerance;
- extraction acceptance/correction thresholds by field class;
- accessibility browser/assistive-technology matrix;
- retention and legal-hold requirements by evidence class.

## 8. Release views

Scenarios may be grouped into release slices without changing their IDs:

- **Foundation:** `BP-X-001` through `BP-X-007`, plus the first domain slice.
- **Supplier onboarding:** `BP-SUP-001` through `BP-SUP-009` and applicable cross-cutting scenarios.
- **Supplier lifecycle:** `BP-SUP-010` plus monitoring and operational scenarios.
- **Customer:** `BP-CUS-001` through `BP-CUS-008` and applicable cross-cutting scenarios.
- **Supplier Workforce:** `BP-WRK-001` through `BP-WRK-010` and all privacy/IAM cross-cutting scenarios.
- **Production qualification:** all selected release scenarios plus `BP-X-008` through `BP-X-014` with retained target-environment evidence.

