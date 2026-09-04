# Business Partner implementation status

Status: point-in-time repository audit

Audit date: 2026-09-04
Base revision: `18dddb3f` plus the uncommitted Phase 0 baseline present in the working tree
Production qualification: blocked

## 1. Evidence rules

This status uses the vocabulary in [decision-register.md](decision-register.md). A capability is not reported as E2E-tested merely because a Playwright file exists: the test must execute the domain journey rather than check that a screen renders, and it must not be skipped for lack of fixtures.

Evidence levels used below:

- **Yes**: repository evidence directly implements that level and an applicable local check passed.
- **Partial**: some actions or paths exist, but the complete acceptance scenario is not covered.
- **No**: no applicable implementation was found.
- **Unverified**: artifacts exist, but an environment-backed check was not available in this audit.

## 2. Verification performed

| Check | Result |
| --- | --- |
| `pnpm policy:business-partner-phase0` | Passed: 6 accepted decisions, 4 contracts, 13 routes, 23 client operations, 4 catalog entries, 6 relay corrections and 6 owned threat actions |
| `pnpm test:plane-contracts` | Passed: 155 tests |
| `@athyper/server-service-master-data` tests | Passed: 82 tests in 13 files |
| `@athyper/server-plane-neon` tests | Passed: 27 tests in 8 files |
| `@athyper/server-plane-mesh` tests | Passed: 11 tests in 4 files; typecheck passed |
| `@athyper/server-platform-iam` tests | Passed: 78 tests in 13 files |
| `@athyper/product-neon-business-partner` tests | Passed: 25 tests in 6 files; typecheck passed |
| MESH and Studio Business Partner package typechecks | Passed |
| `pnpm policy:frontend-spine` | Passed |
| `pnpm policy:plane-boundaries` | Passed |
| `pnpm contracts:check` | Passed: 87 tasks |
| `pnpm release:business-partner:certify` | Expected failure: blocked by 2 missing runbooks and 7 missing target-environment evidence documents |

The full production E2E matrix was not run because it requires configured plane credentials, stored sessions and scenario fixtures. Existing tests explicitly skip under those conditions.

## 3. Capability status

### 3.1 Phase 0 and shared foundation

| Capability | Design | DDL/command/API | UI | Integration | E2E | Production | Evidence and gap |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Phase 0 authority/trust baseline | Yes | Yes | N/A | Yes | N/A | No | `business-partner-phase0.md`, machine baseline and policy verifier pass |
| Experience/case/evidence/notification contracts | Yes | Yes | Partial | Yes | No | No | Parser-backed v1 contracts exist; current NEON case UI still uses its older `PartnerRequest` view |
| Exact-plane relay and operation inventory | Yes | Yes | Yes | Yes | Partial | No | 23 operations inventoried; denial contracts pass, but full journey denial tests need production-like sessions |
| Protected-document policy | Yes | Partial | Partial | Partial | No | No | Platform attachment/storage code exists; BP target-environment qualification is absent |
| Business Partner notifications | Yes | Partial | Partial | Partial | No | No | Event contract and matrix exist; domain-to-recipient/template routes are not complete for all journeys |
| Existing Atlas workspace | Yes | Yes | Yes | Yes | Partial | No | Global cited answer/proposal contracts pass; BP recommendation-specific evaluation sets are not complete |

### 3.2 Governed organization and role case

| Capability | DDL | Command | API | UI | Integration | E2E | Current finding |
| --- | --- | --- | --- | --- | --- | --- | --- |
| New Supplier case | Yes | Yes | Yes | Partial | Yes | No | Form, case list/detail/edit and materialization exist; UI calls compatibility `/business-partner-requests` paths |
| New Customer case | Yes | Yes | Yes | Partial | Yes | No | Form exists; current E2E checks fields only and also presents a `person` category that needs scope review |
| Add Supplier role to existing BP | Yes | Yes | Yes | Partial | Partial | No | Role-extension UI and command kind exist; dedicated end-to-end fixture/test absent |
| Add Customer role/dual-role | Yes | Yes | Yes | Partial | Yes | No | Unit test proves Customer extension reuses BP; no UI-driven complete journey |
| Organization/company scope request | Yes | Yes | Yes | Partial | Partial | No | Create surface exists; no dedicated decision/effective-date scenario evidence |
| Validation findings | Yes | Yes | Yes | Partial | Yes | No | Fixed validator and Validation tab exist; rules are not compiled from one published Studio release |
| Workflow approval | Yes | Yes | Yes | Partial | Yes | No | Embedded Workflow tab and buttons exist; no journey board/task inbox and decision reason uses `window.prompt()` |
| Materialization proof | Yes | Yes | Yes | Partial | Yes | No | Unit test proves exact replay and stable result coordinates; UI lacks a complete result/lineage view |
| Snapshot/evidence/lineage viewer | Yes | Partial | Partial | No | Partial | No | Storage and records exist; no complete proof viewer |

The server exposes both native `/api/neon/business-partner-cases/...` routes and compatibility `/api/neon/business-partner-requests/...` routes through the same service. The browser client currently uses only the compatibility family. Native-route adoption is therefore an API/client migration, not a new authority model.

### 3.3 Supplier controls

| Capability | Backend | UI | Test status | Current finding |
| --- | --- | --- | --- | --- |
| Supplier qualification | Yes | Read-only/partial | Integration partial | Decision commands and 360 projection exist; no complete scoped decision workspace |
| Supplier preference | Yes | Read-only/partial | Integration partial | Server authority exists; dedicated create/decide workspace absent |
| Bank disclosure/link/verification | Yes | Read/reveal partial | Integration yes | Protected receive/link/verify services exist; request/decision workflow is not fully exposed |
| Readiness and activation | Yes | Partial | Integration yes | Resolver and activation command exist; thin reason-code presentation, no complete path-to-activation flow |
| Continuous qualification | Partial | No | Partial | Nightly/deterministic reevaluation exists; event-driven requalification case and routing are not complete |
| Supplier lifecycle | Partial | Partial | Partial | Generic lifecycle authorities exist, but product-approved deactivate/archive semantics and full UI tests remain open |

### 3.4 Customer controls

| Capability | Backend | UI | Test status | Current finding |
| --- | --- | --- | --- | --- |
| Credit create/decide | Yes | Partial | Integration yes | Requested and approved values are distinct; current UI defaults approval to requested amount and lacks full scope/condition depth |
| Account designation | Yes | Read-only/partial | Partial | Authority exists; dedicated decision workspace is not complete |
| Customer readiness | Yes | Partial | Integration yes | Reason codes and scope are returned; action guidance is thin |
| Activate | Yes | Yes | Integration yes | Command, route, UI and service test exist |
| Suspend | Yes | Yes | Integration yes | Command, route, UI and service test exist |
| Reactivate | Yes | Yes | Integration yes | Command, route, UI and service test exist |
| Deactivate | Yes | No | DDL/route only | Contract, service, route and DDL support it; UI permission/action and direct service/E2E test are absent |
| Archive | Yes | No | DDL/route only | Contract, service, route and DDL support it; UI permission/action and direct service/E2E test are absent |

This resolves the earlier five-action inconsistency: all five backend commands are implemented. Customer lifecycle delivery is still partial because only three actions are presented and directly tested above the DDL layer.

### 3.5 MESH exchange

| Capability | Backend | UI | Test status | Current finding |
| --- | --- | --- | --- | --- |
| Network account and relationship list | Yes | Yes | Contract/integration yes | Real list uses selected acting-account scope |
| Relationship detail/capabilities | Yes | No | Integration partial | Backend relationship/capability authority exists; detail and management UI absent |
| Profile publication/projection | Yes | Partial | Integration yes | Publication and NEON receive/projection tests exist; MESH profile UI is read-only/basic |
| Invitation/registration exchange | Yes | No | Integration partial | Backend and jobs exist; compose/track and self-registration UI absent |
| Receive/quarantine/replay | Yes | No | Integration yes | NEON projection service proves quarantine, ordering and replay; no operator console |
| Account link approval | Yes | No | Integration yes | Request/read/decide service exists; no dedicated workspace |
| Bank disclosure | Yes | Partial | Integration yes | Protected backend and NEON read/reveal exist; disclosure request/track UI incomplete |
| Three-way change resolution | Partial | No | Partial | Projection and matching inputs exist; complete A/B/C resolution case UI absent |
| Exchange health/acknowledgement | Yes | No | Partial | Evidence/ack backend exists; operational console absent |

### 3.6 Studio

| Capability | Backend | UI | Test status | Current finding |
| --- | --- | --- | --- | --- |
| Metadata/releases | Yes | Explanatory | Contract/typecheck | Backend foundation is meaningful; BP model page is static description |
| Validation authoring | Partial | Explanatory | Partial | Fixed rules exist; BP author/compiler UI absent |
| Matching authoring | Partial | Explanatory | Partial | Current page describes scored matching not evidenced as a complete runtime |
| Journey/workflow authoring | Partial | Explanatory | Partial | Definitions exist; graph editor/test runner absent |
| Publication/compatibility | Yes | Explanatory | Partial | Immutable release foundation exists; release diff, approval and simulation UI absent |
| Atlas experience editor | Yes | Yes | Contract/typecheck | Real editor exists and should be extended rather than replaced |

### 3.7 Supplier-provided Workforce

| Capability | DDL | Command/API | UI | Test status | Current finding |
| --- | --- | --- | --- | --- | --- |
| Requisition and supplier distribution | Yes | No complete service | No | DDL only | Tables and constraints exist; no complete product command/API was found |
| Candidate submission/evaluation | Yes | No complete service | No | DDL only | Tables exist; supplier/candidate experience and governed selection service absent |
| Work order/SOW | Yes | No complete lifecycle API | No | DDL/finance fragments | Rich schema exists; end-to-end commercial approval/acceptance service absent |
| Worker engagement/placement | Yes | Partial | No | Partial | Schema and IAM intent inputs exist; no end-to-end UI and API suite |
| Person/external-worker materialization | Yes | Partial | No | Partial | Workforce service is focused mainly on internal employee request paths |
| External-worker IAM intent/delivery | Yes | Yes | No | Integration yes | IAM tests prove accepted/replayed/stale/retry/dead-letter paths; no status/reconciliation UI |
| External-worker termination/deprovision | Yes | Partial | No | Integration partial | Epoch and saga mechanisms exist; full supplier Workforce journey is not E2E-tested |

The existing `workforce-lifecycle.spec.ts` proves an internal employee surface and optional API fixtures. It is not evidence for the supplier-provided candidate → engagement → placement journey.

### 3.8 Operations and release

| Capability | Status | Evidence |
| --- | --- | --- |
| Local policy/contracts/typechecks | Passing | Verification table above |
| Production-style E2E fixtures | Partial/optional | Several specs skip when IDs, credentials or sessions are absent |
| Business Partner runbooks | Missing | `business-partner-production-rollout.md` and `business-partner-p9-qualification.md` absent |
| Staging qualification evidence | Missing | database, domain-service, cross-plane, security-privacy and UX documents absent |
| Production evidence | Missing | operations and ownership documents absent |
| Certification | Blocked | Read-only certification report exits with status 2 as designed |

## 4. Scenario roll-up

| Scenario group | Implemented foundation | Complete UI journey | E2E evidence | Production-qualified |
| --- | --- | --- | --- | --- |
| Supplier `BP-SUP-*` | Substantial | No | No complete scenario | No |
| Customer `BP-CUS-*` | Substantial | Partial | Surface/optional fixture checks only | No |
| Supplier Workforce `BP-WRK-*` | DDL substantial; IAM subset strong | No | No | No |
| Cross-cutting `BP-X-*` | Strong local contracts/integration | Partial | Partial | No |

## 5. Audit conclusion

The irreversible authority and evidence foundation is well advanced. The shortest path to demonstrable value is not more DDL: it is to complete one native governed case journey through the real UI, real task/decision boundary and real materialization result, then retain its automated evidence. `BP-SUP-001` is the closest scenario and is the recommended first vertical slice.
