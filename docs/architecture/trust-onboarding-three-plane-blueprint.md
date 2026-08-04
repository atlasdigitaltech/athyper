# Athyper Trust & Onboarding Studio: three-plane implementation blueprint

Status: **proposed for implementation review**  
Architecture status: **frozen**  
DDL baseline: `server/db/ddl/planes/{athyper,neon,mesh}/_manifest.txt`  
Target Keycloak baseline: `26.6.1`

## 1. Decision and scope

Athyper Trust & Onboarding Studio is the Admin-plane control surface for
onboarding, expansion, subscription changes, reconciliation, and offboarding
across Admin, Neon, Mesh, and Keycloak.

The frozen architecture is:

> Flexible Keycloak identity organizations + explicit plane-local application
> projections + fail-closed plane-local authorization.

Keycloak authenticates and owns organization membership, domains, identity
providers, and identity lifecycle. It does not own application tenancy,
commercial subscription, Mesh participation, Neon organization structure, or
authorization grants.

Each application plane owns its physical database, tenant, application
resources, authorization, audit, outbox, and the local materialization of an
approved Keycloak-organization projection. Admin orchestrates the desired
state through APIs and events; it never writes another plane's database.

This document defines:

- the immutable contracts between Keycloak, Admin, Neon, and Mesh;
- Express, Governed, expansion, subscription, and offboarding workflows;
- the DDL to retain, amend, and add;
- service, worker, UI, migration, test, cutover, and rollback work;
- the acceptance gates required before runtime activation.

This document does not reopen the organization-projection architecture. Plan
names, approval assignments, verification thresholds, and commercial values
remain versioned configuration rather than architectural decisions.

## 2. Superseded assumption

The existing DDL comments and runtime rewiring plan say that a Keycloak
organization alias equals a plane tenant UUID. That assumption is superseded.

The replacement contract is:

- `(realm_key, keycloak_organization_id)` is the immutable identity-organization
  coordinate.
- In the pinned Keycloak release the organization alias is immutable after
  creation, while the display name may change. Both remain Keycloak-owned,
  non-authoritative application snapshots; only the organization ID is used as
  the integration coordinate.
- One Keycloak organization may project into zero, one, or several application
  planes.
- A plane projection selects exactly one plane-local tenant and one or more
  permitted scope ceilings.
- Several Keycloak organizations may project into one plane tenant with
  different ceilings.
- A projection is an admission ceiling. It is never a membership, role,
  permission, or subscription grant.

Consequently, all alias-to-tenant resolution must be removed after projection
cutover. There is no compatibility fallback.

## 3. Non-negotiable contracts

### C1. Database boundary

Admin, Neon, and Mesh use separate physical databases selected by the mandatory
plane database registry. A provisioner calls the target plane's authenticated
API. It cannot use a cross-plane connection or fall back to another plane.

### C2. Canonical party

Admin owns one platform canonical-party registry. A legal entity, buyer,
supplier, or customer is matched to a canonical party before a new network
identity is created. Plane-local records carry the canonical party UUID as an
opaque external coordinate; no cross-database foreign key is permitted.

A canonical party is not a tenant, Keycloak organization, Neon business
partner, or Mesh network account. Those are projections or representations of
the party in a bounded context.

### C3. Keycloak organization

A Keycloak organization is an identity administration boundary. It owns:

- organization members;
- verified login domains;
- organization-linked identity providers;
- invitations and identity lifecycle;
- the organization selected for the login.

The default is one organization for each legal entity that needs its own users,
domains, identity provider, or delegated identity administration. A legal party
may own multiple Keycloak organizations. An organization need not be created
for a supplier record that has no interactive users or collaboration identity.

### C4. Application projection

An approved projection is identified by an immutable `projection_id` and
contains:

- realm and Keycloak organization ID;
- target plane and plane-local tenant ID;
- one or more typed `authz.scope_target` ceilings;
- effective interval, state, source version, and content hash.

Neon ceilings may target tenant, legal entity, operating organization, company
code, workspace, or module. Mesh ceilings normally target a network account
and may additionally constrain the network role to `buyer`, `supplier`, or
`both`. Admin ceilings normally target a workspace or module such as Studio.

### C5. Identity admission

Login admission requires all of the following in the selected plane:

1. a valid token from the expected realm, issuer, and client;
2. one explicit Keycloak organization context;
3. one active and effective local organization projection;
4. an exact principal identity binding for
   `(tenant_id, provider_code, realm_key, subject_id)`;
5. an active and effective `authz.plane_membership`;
6. an explicitly selected scope within the projection ceiling;
7. evaluated authorization grants for the requested operations;
8. an effective subscription capability where the operation is commercially
   gated.

Missing, ambiguous, stale, suspended, or conflicting evidence fails closed.

### C6. Multi-organization users

A user may belong to multiple Keycloak organizations. One authorization
session carries exactly one selected organization, one plane, one tenant, one
projection version, and one selected root scope. Switching organization or
plane creates a new canonical authorization session; permissions from different
organizations are never unioned.

### C7. JIT

JIT may atomically create a previously unseen plane-local principal and an
immutable subject binding. It may not repair or reassign a subject, create a
plane membership, activate a projection, assign a role, or grant a scope. New
principals remain without access until onboarding/reconciliation has produced
all required plane-local evidence.

### C8. Authorization and entitlement

Keycloak membership, an application projection, a subscription, and an
authorization grant are four separate gates.

An upgrade may expose additional product capabilities, but it does not grant a
user a role. A downgrade removes commercial eligibility at the effective time,
invalidates affected authorization sessions, preserves business data, and does
not silently delete authorization records.

### C9. Mesh account semantics

A Mesh network account is the exchange boundary owned by one Mesh tenant. The
same primary account may operate as buyer, supplier, or both. A second account
for the same canonical party requires an explicit purpose such as `regional`
or `sandbox`; it is not created merely because a second buyer invites the same
supplier.

### C10. Provisioning consistency

Cross-system onboarding is a saga, not a distributed database transaction.
Every target-plane command is idempotent, carries a case correlation ID and
desired version, records `event.command_execution`, commits target state and an
`event.outbox` event together, and is reconciled against the Admin desired
state.

### C11. Evidence

Mutable case state is operational data. Every material decision and transition
is written to `audit.audit_log` or `audit.security_event`; immutable request,
policy, approval, and before/after payloads are retained through `snapshot`.
Secrets and complete identity-provider configuration remain outside application
tables.

### C12. Offboarding

Offboarding revokes admission and grants before destructive cleanup. It
terminates sessions, ends memberships and projections, disables target
resources according to retention policy, preserves business documents and
audit evidence, and never deletes a Keycloak subject as an incidental side
effect.

## 4. Ownership model

| Concern | Authoritative owner | Plane-local materialization |
|---|---|---|
| Organization members, domains, IdPs, invitations | Keycloak | Organization ID and safe display snapshots only |
| Canonical legal/business party and dedupe | Admin | Opaque `canonical_party_id` on relevant records |
| Desired application projections | Admin | Active projection header and typed scope ceilings |
| Tenant, legal entity, operating organization | Neon | None outside Neon except opaque resource coordinates |
| Network account, relationship, exchange envelope | Mesh | None outside Mesh except opaque resource coordinates |
| Platform workspace/module | Admin | Admin `master` and `authz` |
| Subscription plan and effective assignment | Each plane | Each plane only |
| Permissions, roles, memberships, scope grants | Each plane | Each plane only |
| Onboarding case and orchestration state | Admin | Command execution and result in target plane |
| Authentication token | Keycloak/BFF | Short-lived token store only |
| Authorization session | Selected plane/BFF | Redis plus plane-local evidence coordinates |
| Audit and outbox | Plane where action occurred | No cross-plane audit inserts |

## 5. Athyper Group operating and partner model

### 5.1 Neon legal and operating structure

Neon keeps the legal/posting axis and the operational coordination axis
separate. The agreed Athyper Group fixture is:

```text
Neon tenant: Athyper Group
|
+-- Legal entity: Athyper Malaysia
|   `-- Company code: ATH-MY01
|
+-- Legal entity: Athyper India
|   `-- Company code: ATH-IN01
|
+-- Legal entity: Athyper Saudi
|   `-- Company code: ATH-SA01
|
`-- Operating organizations
    +-- Procurement Asia
    |   +-- ATH-IN01 -- procurement.lead_buyer
    |   +-- ATH-MY01 -- procurement.participant
    |   `-- ATH-SA01 -- procurement.participant
    +-- Finance Shared Services Asia
    |   +-- ATH-IN01 -- finance.service_provider
    |   +-- ATH-MY01 -- finance.served_company
    |   `-- ATH-SA01 -- finance.served_company
    `-- Enterprise Sales Asia
        +-- ATH-IN01 -- sales.booking_company
        +-- ATH-MY01 -- sales.participant
        `-- ATH-SA01 -- sales.participant
```

The invariant is that `company_code_id` identifies the legal/posting owner and
`operating_organization_id` identifies the team or operating boundary that
coordinates the process. An operating organization does not own a ledger, does
not become a legal entity, and does not automatically become a Keycloak
organization or Mesh network account.

The three existing Neon master tables remain the authority:

- `master.legal_entity` owns the registered legal identity;
- `master.company_code` supplies the legal/accounting execution coordinate and
  resolves to exactly one legal entity;
- `master.operating_organization_company_assignment` places a company code in
  an operating organization with one typed participation role and effective
  interval.

An operating-organization assignment is eligible scope, not user access. A
user still needs a Keycloak organization projection ceiling, active plane
membership, effective scope grant, selected company context, and the relevant
subscription capability. Where `member_companies` propagation is enabled, its
resolver must read only active, effective assignments; until that resolver is
certified, company-code grants remain explicit and fail closed.

For process records that need both coordinates, persist both. For example, a
PO processed by Procurement Asia for Athyper Malaysia carries Procurement Asia
as `operating_organization_id` and `ATH-MY01` as `company_code_id`. Mesh routing
uses the legal party derived from `ATH-MY01`, never the operating organization.

### 5.2 Identity and application projections

The identity/projection model for the agreed example is:

| Identity organization | Canonical party | Neon projection | Mesh projection | Admin projection |
|---|---|---|---|---|
| Athyper Malaysia | Athyper Malaysia legal party | Athyper Group tenant; Malaysia legal-entity ceiling | Athyper Mesh tenant; `BNA-ATH-MY` ceiling | Optional delegated customer-onboarding workspace ceiling |
| Athyper India | Athyper India legal party | Athyper Group tenant; India legal entity plus approved shared-service operating organizations | Athyper Mesh tenant; `BNA-ATH-IN` ceiling | Optional delegated customer-onboarding workspace ceiling |
| Athyper Saudi | Athyper Saudi legal party | Athyper Group tenant; Saudi legal-entity ceiling | Athyper Mesh tenant; `BNA-ATH-SA` ceiling | Optional delegated customer-onboarding workspace ceiling |
| Global Components | Global Components party | Optional business-partner projection in each customer tenant | Global Components tenant; one primary supplier BNA | Optional self-service onboarding workspace ceiling |
| Global Retail | Global Retail party | Optional customer business-partner projection | Global Retail tenant; one primary customer/buyer BNA | Optional self-service onboarding workspace ceiling |
| Cirrus India | Cirrus India party | Optional supplier business partner | Cirrus tenant; `BNA-SUP-CIRRUS` ceiling | Optional self-service onboarding workspace ceiling |
| Athyper Admin | Athyper Platform party | None | None | Athyper Platform tenant; Studio operator/admin workspace ceiling |

A customer Admin projection is restricted to its onboarding case/workspace
scope and requires an explicit invitation and local Admin-plane grant. It does
not confer Athyper platform administration, even when both scopes reside in the
Admin plane.

The cross-plane business link is explicit and does not depend on names:

```text
canonical party: Athyper Group
+-- Neon master.tenant: Athyper Group
`-- Mesh master.tenant: Athyper Group network tenancy

canonical relationship: Athyper Group --group_member--> Athyper India

canonical party: Athyper India legal party
+-- Neon master.legal_entity: Athyper India
|   `-- Neon master.company_code: ATH-IN01
`-- Mesh mesh.network_account: BNA-ATH-IN (buyer or both)

Neon operating organization: Procurement Asia
`-- no Mesh account; retained only as PO process/audit context
```

The opaque `canonical_party_id` values in each plane provide reconciliation and
routing coordinates. There are no cross-database foreign keys and no runtime
cross-plane joins; commands carry the coordinate to the target plane API, which
resolves it locally and fails on missing or ambiguous state.

Cirrus India must not project into the Athyper tenant or `BNA-ATH-IN` as a
supplier user. Mesh connects Cirrus's account and Athyper India's account with
an active network relationship. That separation is what prevents a partner
identity from acquiring the buyer's tenant context.

One common supplier invited by Malaysia, India, and Saudi resolves to one
canonical party and normally one primary supplier BNA. Mesh stores three
buyer-to-supplier relationships; it does not create three supplier accounts or
three Keycloak organizations.

### 5.3 Keycloak organization creation rule

Legal-entity registration in Neon does not mechanically create one Keycloak
organization. Studio creates or reuses a Keycloak organization when there is a
real identity boundary: separate domains, IdP ownership, delegated identity
administration, user membership lifecycle, or login policy. Therefore Malaysia,
India, and Saudi may each have an organization because their IT/IdP ownership
differs. A shared-services organization is added only if it has its own users or
identity administration; otherwise its users remain members of their legal
identity organization and receive explicit Neon operating-organization grants.

This rule avoids both duplication and accidental coupling: Neon legal entities
remain stable even when identity administration is reorganized, and Keycloak
organizations can be projected to more than one Neon scope or application
without becoming those business records.

## 6. Runtime login and context activation

1. The application starts login with a plane and optional organization/domain
   hint. Discovery returns Keycloak choices only.
2. Keycloak resolves the organization and applies its organization-linked IdP:
   for example Entra ID for Malaysia, Google Workspace for India, and the local
   IdP for Saudi.
3. Keycloak returns a token containing the immutable organization context. The
   BFF validates issuer, audience, client, realm, signature, time, and nonce.
4. The BFF resolves `(realm_key, keycloak_organization_id)` in the selected
   plane's `master.identity_organization_projection`.
5. The projection supplies the tenant and permitted scope ceilings. Alias,
   domain, email, and token display claims cannot select a tenant.
6. The exact identity-admission repository resolves or JIT-creates the local
   principal/binding and requires effective plane membership.
7. The caller selects one allowed scope. Mesh account selection comes from an
   evaluated grant on `authz.scope_target(scope_kind='network_account')`, not a
   membership column.
8. The authorization evaluator intersects projection ceiling, subscription
   capability, active grants, denials, delegation, overrides, and MFA/SoD rules.
9. The session records plane, tenant, realm, organization ID, projection ID and
   hash, binding ID, membership ID, selected scope, authorization epoch, and
   entitlement epoch.
10. A projection, subscription, membership, or grant change publishes an
    invalidation event. A stale session cannot be refreshed into access.

## 7. Onboarding workflows

### 7.1 Common case state machine

`draft -> submitted -> qualifying -> awaiting_approval -> approved ->
provisioning -> reconciling -> active`

Terminal/exception states are `rejected`, `cancelled`, `failed`, and
`offboarded`. A failed or partially provisioned case remains resumable from its
last desired version. `active` is allowed only when every mandatory target
resource has reconciled and all activation gates pass.

Every case follows these logical stages:

1. **Intake:** capture requester, organization, strong identifiers, target
   products, requested plan, expected identity administration, and invitation
   provenance.
2. **Party resolution:** normalize identifiers, lock the match coordinate,
   reuse an exact party, or create a provisional party. Conflicts create a
   manual work item; they never auto-merge.
3. **Trust qualification:** verify email/domain/invitation, business
   identifiers, sanctions/risk policy where applicable, and acceptance of
   terms.
4. **Design:** compile the versioned blueprint into desired Keycloak, Admin,
   Neon, Mesh, subscription, membership, and authorization resources.
5. **Approval:** execute policy gates. Express flows auto-approve only the
   low-risk baseline; exceptions and privileged scopes use human work items.
6. **Provision:** send idempotent commands in dependency order.
7. **Reconcile:** read target APIs, compare desired version/hash with target
   materialization, and retry safe differences.
8. **Activate:** enable projections, memberships, and baseline role assignments
   only after target resources and subscription capabilities are effective.
9. **Operate:** continuously reconcile drift and expose evidence in Studio.

### 7.2 Mesh partner Express flow — `MESH_SUPPLIER_FREE_V1`

1. Start with `entry_mode = self` or `buyer_invited`. Self-registration captures
   legal name, country, a strong business identifier, contact, and intended
   supplier/collaboration use. Buyer invitation additionally carries the exact
   buyer BNA and invitation coordinate.
2. Party resolution reuses the canonical supplier if it already exists. A
   collision pauses the flow; a second BNA is not created.
3. The applicant verifies email, authority, and terms; buyer-invited entry also
   verifies the exact invitation. A Keycloak organization is created or reused
   only when interactive partner users are required.
4. The Mesh provisioner creates or reuses the supplier tenant and primary
   network account with role `supplier` or `both`.
5. The Mesh subscription provisioner assigns `supplier_free` for a new partner
   or retains an already effective stronger superset plan. Limits use the
   existing usage-limit model.
6. For `buyer_invited`, the relationship provisioner creates a requested
   buyer/supplier relationship and supplier acceptance activates it. Self-entry
   creates no relationship; the partner is usable only after a later invitation
   and acceptance.
7. IAM creates the organization projection to the supplier's own BNA scope,
   then explicitly creates the principal binding, plane membership, minimal
   supplier group membership, and scoped role assignments.
8. Reconciliation proves the party, BNA, projection, subscription, membership,
   grants, and—where buyer-invited—the requested relationship before account
   access is activated. Document exchange still waits for relationship
   acceptance.

If the supplier already has an active account, self-entry returns the existing
organization/account after proof of authority; buyer entry adds only the new
network relationship and invitations. Neither path creates an account in the
buyer's tenant.

### 7.3 Neon Finance Free Express flow — `NEON_FINANCE_FREE_V1`

1. The owner supplies organization identifiers, country, base currency,
   fiscal settings, admin contact, and selected authentication method.
2. Party resolution creates/reuses the group/subscriber party and the first
   legal-entity party.
3. The Keycloak organization is created/reused for the identity boundary and
   its invitation or local IdP is configured.
4. The Neon provisioner creates one tenant, one legal entity, its initial
   company code/book/fiscal prerequisites, and only the Finance Accounting
   baseline declared by the blueprint.
5. The `finance_free` subscription is activated with
   `legal_entity_count = 1` and the configured user/storage limits.
6. Typed `authz.scope_target` rows are created for tenant, module, legal entity,
   and required company-code scope.
7. The organization projection, plane membership, and minimal Finance Admin
   role are created explicitly and reconciled.
8. The active legal entity emits an Admin onboarding intent for the child
   `MESH_BUYER_FROM_NEON_V1` case. That child creates or reuses the entity's
   primary BNA with role `buyer` or promotes an existing supplier account to
   `both`, and materializes the Mesh-local `neon_buyer_included` companion
   subscription. It does not create a network relationship. Neon activation is
   not rolled back by a retriable Mesh outage; Studio shows the child target as
   reconciling until it converges.

Free and Enterprise use the same isolation, authentication, authorization,
audit, backup, and data-retention controls. Free is a product limit, not a
weaker security mode.

### 7.4 Governed organization flow

The Governed flow adds verified domain ownership, enterprise IdP configuration,
security-owner approval, legal/commercial review, configurable SoD/MFA policy,
bulk membership preparation, data migration readiness, and a scheduled
activation window. The same desired-resource and provisioner contracts are
used; only checks, approvals, and blueprint content differ.

### 7.5 Add legal entity / operating organization

1. Start an `organization_expansion` case against an existing Neon tenant.
2. Check effective plan capacity before reserving a legal-entity slot.
3. Resolve the new legal entity to a canonical party.
4. Create the Neon legal entity, company code, book/fiscal prerequisites, and
   requested operating-organization assignments transactionally in Neon. Each
   assignment uses a typed role and effective interval.
5. Create a new Keycloak organization only when the new entity has a distinct
   identity boundary. Otherwise extend an existing organization's permitted
   ceilings after approval.
6. Create scope targets, projection-scope rows, and explicit role assignments.
7. If the effective Neon plan contains `mesh_buyer_base`, create the child
   `MESH_BUYER_FROM_NEON_V1` case. It creates/reuses the entity's BNA; it never
   creates partner relationships implicitly.
8. Before activating a new or changed operating assignment, compile the users
   and grants whose effective company scope may expand or contract. Require the
   configured approval, then invalidate affected authorization sessions.
9. Activate after reconciliation. The original tenant and legal entities remain
   unchanged.

For example, adding `ATH-TH01` to Procurement Asia and Finance Shared Services
Asia writes two independent, effective assignment rows with the approved typed
roles; leaving Enterprise Sales Asia unchecked writes no assignment. The change
does not duplicate the tenant, legal entity, Keycloak organization, or BNA.

### 7.6 Subscription change

1. Record the requested plan and effective time in an onboarding case target.
2. Compile a before/after capability and limit impact report.
3. Upgrades may be immediate or scheduled. New permissions still require
   explicit role/group changes.
4. Downgrades are rejected or scheduled when current usage exceeds hard limits,
   unless an approved override or remediation plan exists.
5. At the effective time, a plane-local transaction closes the previous
   subscription interval, activates the new interval, updates the compatibility
   plan pointer during migration, writes snapshot/audit evidence, and publishes
   entitlement and authorization invalidations.
6. Existing data remains readable according to policy; destructive cleanup is
   a separate retention workflow.
7. A Neon change that adds or removes `mesh_buyer_base` creates a child Mesh
   entitlement-impact case. It materializes the appropriate Mesh-local plan and
   account role after relationship/document impact review. Independent supplier
   capability is preserved; a buyer downgrade never silently retires a `both`
   account that still serves as a supplier.

### 7.7 Offboarding

The offboarding blueprint first disables organization projections and plane
memberships, revokes sessions, ends relationships/subscriptions, and suspends
target resources. Retention, export, and legal-hold checks then determine later
archival. Keycloak organizations are disabled or unlinked only after all plane
admission paths are closed.

Offboarding is projection- and product-aware. Ending Neon does not delete a
party's Mesh account when it still has an independently active supplier plan,
relationships, or retained exchange documents; it removes/suspends only the
Neon-caused buyer capability and its grants after impact approval.

### 7.8 Organization lifecycle catalog

All organization entry modes use the common case state machine and the same
provisioners. The entry mode changes checks and approvals, not database or
authorization invariants.

| Lifecycle | Required workflow and activation gate |
|---|---|
| Neon self-onboarding | A restricted Studio onboarding client registers/verifies the applicant, resolves the subscriber and first legal party, creates/reuses the identity organization, then provisions Neon tenant, legal entity, company code, subscription, projection, membership, and scoped initial administrator. Anonymous intake never creates a Keycloak organization or plane record before party qualification. |
| Mesh partner self-onboarding | Resolve the party, prove the applicant's authority, create/reuse its identity organization and its own Mesh tenant/primary supplier BNA, assign `supplier_free`, then activate minimal scoped access. No buyer relationship exists until invited and accepted. |
| Buyer-invited partner onboarding | Validate the inviting buyer BNA and permission; resolve/reuse the partner; issue an invitation bound to buyer, supplier candidate, realm, expiry, and nonce; provision the partner's own account if needed; create one requested relationship; activate the relationship only after an authorized partner accepts it. |
| Ops-governed Neon onboarding | An Admin Studio operator opens the same Neon blueprint with enhanced business, legal, security, domain/IdP, SoD, migration, and scheduled-activation approvals. Customer ownership confirmation is mandatory; Ops does not become the customer's identity owner. |
| Add legal entity | A child expansion case under the existing Neon subscriber checks plan capacity, resolves the new legal party, creates its legal entity/company code, applies approved operating-organization assignments, and conditionally creates an identity organization. It never creates a second Neon tenant. |
| Enable Mesh Buyer from Neon | An explicit child case consumes the active Neon legal entity and `mesh_buyer_base` entitlement. It creates/reuses one primary BNA for that legal party in the subscriber's Mesh tenant, materializes the Mesh-local `neon_buyer_included` companion/superset subscription, and creates a buyer scope target/projection. If the same primary account is already `supplier`, the approved transition is to `both`. It creates no relationship. |
| Subscription change | Compile capability, capacity, user, scope, and data-retention impact; approve/schedule; close and open non-overlapping subscription intervals atomically in the affected plane; invalidate entitlement/authorization epochs. A commercial upgrade never creates a role grant. |
| Organization offboarding | Freeze new invitations and provisioning, suspend projections/memberships and sessions, terminate or suspend Mesh relationships, close subscriptions, preserve/export data according to hold/retention policy, then retire resources. Keycloak cleanup is last and only when no other projection depends on the organization. |

Seed immutable v1 blueprints for `NEON_SELF_FREE_V1`,
`MESH_SUPPLIER_FREE_V1`, `BUYER_PARTNER_INVITATION_V1`,
`NEON_GOVERNED_V1`, `NEON_LEGAL_ENTITY_ADD_V1`,
`MESH_BUYER_FROM_NEON_V1`, `SUBSCRIPTION_CHANGE_V1`, and
`ORGANIZATION_OFFBOARD_V1`. `entry_mode` distinguishes self and invited use of
shared provisioner steps without weakening their common gates.

Parent/child cases make cross-plane causation visible:

```text
NEON_SELF_OR_GOVERNED_V1
`-- legal_entity active
    `-- MESH_BUYER_FROM_NEON_V1
        `-- BNA active (buyer or both)

BUYER_PARTNER_INVITATION_V1
+-- reuse active partner BNA
`-- or MESH_SUPPLIER_FREE_V1
    `-- relationship requested -> partner accepted -> active
```

Every child has its own idempotency coordinate and can reconcile independently.
The parent records `root_case_id`, `parent_case_id`, and `causation_code`; a
technical Mesh retry cannot duplicate or undo an already active Neon legal
entity.

### 7.9 User lifecycle

The shared user state model is:

`invited -> identity_verified -> organization_member -> plane_pending -> active
-> suspended -> ended`

`suspended -> active` requires an explicit resume decision. `ended` is terminal
for the plane membership, although the same Keycloak subject can later receive a
new membership interval.

| Lifecycle | Required workflow |
|---|---|
| Neon user invitation/IdP onboarding | An authorized Neon administrator chooses the Keycloak organization, projection ceiling, Neon role template, and permitted legal/company/operating scopes. Keycloak performs invitation, domain/IdP login, verification, and MFA. The plane then resolves the exact subject binding and separately creates membership and scoped grants. |
| Mesh user invitation/IdP onboarding | The inviter selects the user's own identity organization and one or more BNAs owned by the user's Mesh tenant. Keycloak membership never puts a partner user in a buyer tenant. BNA grants and network role ceiling are explicit. |
| Admin Platform governed invitation | Invite-only, approved against an Admin workspace/module, requires configured MFA and SoD checks, and never derives Admin access from Neon or Mesh membership. |
| Role/scope change | Authorize the changer, prove the requested scope is inside the organization projection and subscription, run SoD/impact checks, write effective-dated grants or group membership, and invalidate the authorization epoch. Keycloak groups may be hints but are not plane grants. |
| Suspension | A plane suspension closes admission in that plane, revokes its sessions, and preserves evidence. Organization-wide suspension additionally disables the Keycloak membership or user only after impact across every projection is evaluated. |
| Removal | End memberships, grants, delegations, invitations, and sessions with effective time and reason. Retain the principal/binding and audit history. Delete a Keycloak subject only through the identity owner's separate retention policy, never as a plane-removal side effect. |

Use the shared blueprints `USER_INVITE_V1`, `USER_ACCESS_CHANGE_V1`,
`USER_SUSPEND_V1`, and `USER_REMOVE_V1` with target plane and scope types as
validated inputs. Do not fork separate authorization semantics for each UI.

JIT remains intentionally smaller than onboarding: it may create the exact
principal/binding pair after verified login, but cannot move the user from
`plane_pending` to `active` or create any scope grant.

### 7.10 Network lifecycle

Network-account state is `pending -> active -> suspended -> active`, with
`pending|active|suspended -> retired`; `retired` is terminal. Relationship state
is `requested -> active -> suspended -> active`, with
`requested -> rejected|expired|terminated` and `active|suspended -> terminated`;
terminal relationships are not reopened.

| Lifecycle | Required workflow |
|---|---|
| Buyer BNA creation | Only `MESH_BUYER_FROM_NEON_V1` or an approved governed Mesh case may create it. Resolve the active Neon legal party, enforce canonical-party/purpose dedupe, materialize/verify the Mesh-local companion subscription, create a buyer scope target, and activate after reconciliation. |
| Partner BNA creation | Resolve canonical party before Mesh creation, enforce one live primary account, create the account in the partner's own tenant with `supplier` role, and activate only with an effective subscription. |
| Relationship invitation | The buyer creates a nonce-bearing, expiring request to an exact supplier candidate/BNA. Duplicate live buyer/supplier/kind coordinates return the existing relationship. No document exchange is allowed in `requested`. |
| Relationship acceptance | An authorized principal of the supplier tenant accepts the exact request. Revalidate both accounts, roles, subscription, expiry, and replay nonce in one Mesh transaction; transition to `active` and append an acceptance event. |
| Relationship suspension | Either authorized participant or governed policy may suspend with reason and effective time. New envelopes are blocked; existing documents remain visible under retention and policy. Resume is a separate authorized event. |
| Relationship termination | Terminate with reason, actor, and effective time; revoke pending invitations and new exchange, retain the edge and event history, and never delete either BNA. A future relationship requires a new relationship row/version. |

Account creation and relationship creation are deliberately separate. This is
what lets one supplier serve Malaysia, India, and Saudi through one supplier BNA
and three independently governed relationships.

## 8. Purchase-order exchange: Neon to Mesh

For an Athyper India purchase order to Cirrus India:

1. Neon validates the PO under the Athyper Group tenant, Procurement Asia
   operating organization, and `ATH-IN01` company code. The company code derives
   the Athyper India legal/canonical party; the supplier business partner carries
   Cirrus's canonical party ID.
2. Posting the PO and a `neon.purchase_order.issued` outbox record occurs in one
   Neon transaction.
3. The integration worker sends an idempotent `mesh.exchange.submit` command to
   the Mesh API. It sends the buyer/supplier canonical party coordinates,
   company code, and operating organization as business/audit evidence, not a
   target database connection. The operating organization is not a routing key.
4. Mesh resolves `BNA-ATH-IN` from Athyper India's canonical party, the
   supplier account from Cirrus's canonical party, and one active relationship
   between those accounts.
5. Mesh rejects ambiguous accounts, absent relationships, wrong roles,
   suspended subscriptions, or mismatched tenant/account ownership.
6. Mesh creates the existing document envelope/payload/event records and writes
   a Mesh outbox acknowledgement in one transaction.
7. The acknowledgement updates Neon integration status through the Neon API.
   Neither side treats transport acknowledgement as business acceptance.
8. Cirrus users authenticate through the Cirrus Keycloak organization and see
   the envelope only through Cirrus's Mesh tenant, BNA projection ceiling, and
   evaluated relationship/account grants.

## 9. Existing DDL retained as authority

| Existing DDL | Use in this design |
|---|---|
| `master.tenant`, profile, relationship | Plane tenant and RLS root |
| `master.principal`, `principal_identity_binding` | Exact plane-local actor and immutable identity binding |
| Neon `legal_entity`, `company_code`, `operating_organization` | Neon organization and scope targets |
| Neon `business_partner` and identifier/role extensions | Tenant-local commercial representation of canonical parties |
| Mesh `network_account`, identifiers, references, relationships | Network participation and buyer/supplier connection |
| Mesh document envelope/payload/event/acknowledgement | Cross-party exchange record |
| `authz.plane_membership`, `scope_target`, roles, groups, grants, deny, delegation, override, ACL | All authorization authority |
| `control.subscription_plan` | Plane-local plan catalog |
| Usage metric, plan limit, tenant override, usage counter | Free/enterprise capacity enforcement |
| `event.command_execution` | Target-plane command idempotency and execution result |
| `event.outbox` | Transactional saga/invalidation delivery |
| `document.work_item` | Human approval, exception, and remediation tasks |
| Connector instance and integration endpoint | Keycloak/plane provisioner registration and health |
| Snapshot tables | Immutable request, policy, plan, and before/after evidence |
| Audit tables | Security and business transition evidence |
| Authorization epoch/invalidation | Session invalidation after projection, subscription, or grant changes |

`master.external_reference` remains available for non-authoritative integration
IDs. It is not used as the organization projection or canonical-party authority
because those require typed constraints, effective state, and reconciliation
versions.

## 10. Required DDL delta

No authoritative table or business column is removed in the first wave. New
tables/columns are additive; obsolete uniqueness/domain constraints may be
replaced transactionally only after backfill assertions pass, and compatibility
columns are removed in a later cleanup wave. The following is the minimum
complete delta.

### 10.1 Admin-only canonical registry

Add to the Athyper plane:

| Table | Required content and constraints |
|---|---|
| `master.canonical_party` | `id`, Admin authority tenant, party kind, legal/display names, incorporation country, verification and lifecycle states, optional `merged_into_party_id`, record version, audit columns. A merged row cannot be active. |
| `master.canonical_party_identifier` | Party, scheme, issuer country/authority, normalized value, value hash, masked display, claim/verification state and evidence snapshot. Unique active claim on `(scheme, issuer, value_hash)` prevents duplicate parties. |
| `master.canonical_party_relationship` | From/to canonical party, typed relationship kind (for example `group_member`, `subsidiary`, or `identity_admin_for`), direction, verification/evidence, status, and effective half-open interval. Tenant-safe FKs, no self-edge, non-overlap per typed coordinate, and a cycle guard for hierarchical kinds are required. This is the Admin authority for Athyper Group -> Malaysia/India/Saudi party membership; it is not an ownership percentage ledger. |
| `master.canonical_party_merge` | Losing party, surviving party, approved case, reason, before/after snapshots, effective time, approver. No self-merge; merge chain cycles are rejected. |
| `master.keycloak_organization` | Admin authority tenant, `realm_key`, immutable Keycloak organization ID, owning canonical party, alias/name snapshots, lifecycle state, observed source version and time. Unique `(realm_key, keycloak_organization_id)`; alias is not unique authority. |
| `master.application_projection` | Keycloak organization, target plane, opaque target tenant UUID, desired version/hash, effective interval, lifecycle/reconciliation state, source case. Non-overlap on `(organization, plane, effective interval)` permits history but only one effective target tenant in a plane. |
| `master.application_projection_scope` | Projection, typed scope kind, opaque target UUID, ceiling mode, optional Mesh network-role ceiling, desired version. Unique `(projection_id, scope_kind, target_id)`. |

The canonical registry is global within the Admin authority tenant. All tables
use forced RLS, explicit service grants, status/effective checks, audit-pair
checks, and deterministic case correlation.

### 10.2 Admin-only onboarding control and document state

| Table | Required content and constraints |
|---|---|
| `control.onboarding_blueprint` | Immutable published blueprint code/version, case kind, risk tier, input contract hash, compiler version, activation policy code, status. Only draft versions are mutable. |
| `control.onboarding_blueprint_step` | Blueprint version, ordered step code, provisioner/command code, dependency list, compensation code where safe, retry policy, mandatory flag. Dependencies must be acyclic at publish time. |
| `document.trust_onboarding_case` | Admin tenant, case number, case kind/track, blueprint/version, requester, canonical party, `root_case_id`, nullable `parent_case_id`, `causation_code`, correlation/idempotency coordinates, state, risk, timestamps, failure code, request snapshot. Parent/root must stay in one Admin tenant, a case cannot parent itself, and a cycle guard is required. |
| `document.trust_onboarding_case_target` | Case, target plane, requested action/plan/effective time, opaque tenant/resource coordinates, desired version/hash, target state, impact snapshot. |
| `document.trust_onboarding_check` | Case/target, check code, required flag, policy version, result, evidence snapshot, evaluator and completion time. Unique per case target/check/version. |
| `document.trust_onboarding_resource` | Case target, resource kind/key, desired and applied versions/hashes, command ID, reconciliation state, last attempt/error, remote resource ID. Unique per target/resource key. |

Approvals and remediation assignments reuse `document.work_item`. Immutable
approval payloads use snapshots and audit; a second approval table would create
competing task authority.

### 10.3 Common plane-local identity projection

Add the same tables to all three manifests from a common DDL pack:

| Table | Required content and constraints |
|---|---|
| `master.identity_organization_projection` | `tenant_id`, realm, immutable KC organization ID, alias/name snapshot, Admin source projection ID/version/hash, status, effective interval, reconciled time, audit. Non-overlap on `(realm_key, keycloak_organization_id, effective interval)` permits history but guarantees one effective tenant in the plane. |
| `master.identity_organization_projection_scope` | Tenant, projection, `authz.scope_target_id`, ceiling mode, optional Mesh role ceiling, status/effective interval. Tenant-safe composite FKs to projection and scope target. |

The activation function must lock the projection, require at least one active
scope, validate that every scope target belongs to the same tenant, and publish
an authorization invalidation when the projection hash or state changes.

### 10.4 Common plane-local product entitlement

Add to all three planes:

| Table | Required content and constraints |
|---|---|
| `control.product_capability` | Seed-owned code/name, optional module, risk and lifecycle status. A capability is product availability, not a grant. |
| `control.product_capability_permission` | Capability-to-`authz.permission` mapping. Unique pair; only active catalog permissions may be published. |
| `control.subscription_plan_capability` | Plan-to-capability mapping with availability state. Unique plan/capability pair. |
| `master.tenant_subscription` | Tenant, plan, subscription code, source case/reference, status, effective half-open interval, predecessor, audit and snapshot coordinates. Exclusion constraint prevents overlapping scheduled/active intervals for one tenant. |

During migration, `master.tenant.subscription_plan_id` is maintained as a
compatibility cache of the currently effective subscription. It is removed
from runtime reads after parity is proven and may then be dropped in a later
DDL cleanup. `master.tenant_subscription` is the long-term assignment authority;
snapshot remains the history of mutable plan definitions.

Add usage metrics at minimum for `active_user_count`, `legal_entity_count`,
`network_account_count`, `relationship_count`, `document_count`, and
`attachment_storage_bytes`. Existing tenant overrides remain the only approved
commercial exception mechanism.

The minimum v1 plan natural keys are `finance_free` and `erp_enterprise` in
Neon, and `supplier_free`, `neon_buyer_included`, and `network_enterprise` in
Mesh. `neon_buyer_included` is the companion plan materialized by an entitled
Neon child case; it retains the baseline supplier capability so an existing
supplier account can safely become `both`. Existing generic
`trial/base/starter/professional/enterprise` seed rows are not silently
repurposed: map subscribed fixtures explicitly, then retire or retain those
catalog rows through a separate commercial-catalog decision. Price, user, and
usage-limit values may change without changing these data contracts.

Both initial Neon plans include the `mesh_buyer_base` capability: one primary
buyer-capable BNA for each active, entitled Neon legal entity, subject to the
plan's `legal_entity_count` and Mesh network-account limits. The child case
creates or changes the Mesh tenant's effective plane-local subscription to the
approved companion/superset plan with source case/version evidence; it never
authorizes from a live cross-plane subscription read. This freezes the agreed
automatic buyer enablement as an entitlement-driven child case, not a database
trigger. The capability creates no partner relationship and grants no user
access by itself. If `network_enterprise` is already effective, the compiler
retains that stronger capability set rather than downgrading it.

### 10.5 Athyper/Admin record amendments

| Table | Required amendment |
|---|---|
| All `master.tenant` | Add nullable-then-required `canonical_party_id` for business tenants; allow NULL only for documented system tenants during migration. Replace the alias-equals-tenant comment. |
| `document.trust_onboarding_case` | Add the root/parent/causation coordinates described above so enabling a Mesh buyer, creating a partner account, or adding a legal entity is an independently retryable child case with an auditable business cause. Index `(tenant_id, root_case_id)` and `(tenant_id, parent_case_id, state)`. |
| `document.trust_onboarding_case_target` | Add `entry_mode`, `source_plane`, optional `source_resource_kind/id`, and activation criticality (`blocking` or `independent`). This distinguishes self, buyer-invited, Ops-governed, and Neon-caused flows without cloning case tables. |
| `master.application_projection` | Retain source case and desired version/hash; add a source resource coordinate for projections compiled from a Neon legal entity or Mesh BNA. It is opaque and reconciled, not a cross-plane FK. |

Do not duplicate Keycloak user, invitation, credential, domain, or IdP state in
Admin. The case/resource ledger stores only safe coordinates, desired hashes,
observed state, and evidence snapshots. Existing `document.work_item`,
`event.command_execution`, `event.outbox`, audit, and snapshot tables remain the
workflow/evidence mechanisms.

### 10.6 Neon required amendments

The current legal-entity, company-code, operating-organization, procurement
profile, sales profile, and company-assignment tables remain. Apply this
additive delta:

| Table/function | Required amendment |
|---|---|
| `master.legal_entity` | Add `canonical_party_id`; enforce one live representation of a canonical party per tenant. The first migration is nullable, followed by backfill/reconciliation and then the required constraint for non-system rows. |
| `master.business_partner` | Add `canonical_party_id` and optional representation-purpose code; enforce one live default representation per tenant/canonical party. This is the PO supplier/customer coordinate used to reach Mesh. |
| `master.operating_organization` | Publish `finance` as an allowed domain alongside procurement and sales. Prefer one domain per operating organization; retain legacy `both` only for compatible existing rows. Existing hierarchy cycle protection remains. |
| `control.operating_organization_participation_role` | Add a typed, seed-owned catalog with globally unique code, organization domain, label, lead/participant semantics, lifecycle state, and sort order. Initial codes are `procurement.lead_buyer`, `procurement.participant`, `finance.service_provider`, `finance.served_company`, `sales.booking_company`, and `sales.participant`. |
| `master.operating_organization_company_assignment` | Add catalog-backed `participation_role_code`, backfill it from free-text `participation_role`, switch validated readers/writers, and remove the compatibility column only in the later cleanup wave. Add a non-overlap exclusion for live rows on `(tenant_id, operating_organization_id, company_code_id, daterange(effective_from,effective_until))`; validate same tenant, active company/legal entity, role/domain compatibility, and effective interval. Keep history rather than updating the old interval in place. |
| `master.operating_organization_company_effective_v` | Add a tenant-safe effective view joining assignment -> company code -> legal entity and exposing canonical party and role/domain. The authorization resolver and Studio impact preview use this view; JSON metadata is never the resolver. |
| activation/transition functions | Require at least one active company assignment before an operating organization becomes active. Validate procurement lead and sales booking/invoicing company references against effective assignments. Publish authorization invalidation when assignments or projection ceilings change. |
| selected process headers | Add nullable-then-governed `operating_organization_id` to `document.purchase_requisition`, `document.commitment` (the PO/commitment header), and `document.purchase_invoice` where an operating processor must be recorded. Composite FKs remain tenant-safe. At submit/approve/post, validate that the record's `company_code_id` is effectively assigned to that organization with an allowed domain/role. |

Do **not** add `master.finance_organization_profile` for the stated shared
services use case. `Finance Shared Services Asia` is an operating organization
with `finance.service_provider` and `finance.served_company` assignments. A new
1:1 finance facet is justified only later if finance-specific organization-level
defaults emerge that do not belong to tenant, legal entity, company code, book,
or policy configuration.

Do not put `operating_organization_id` on every accounting row. Posting and
ledger ownership continue to derive from `company_code_id`; the operating
coordinate is persisted only on process roots where processor/coordination
ownership matters. PO-to-Mesh routing resolves the buyer canonical party from
the company code/legal entity, never from the operating organization.

### 10.7 Mesh required amendments

| Table/domain | Required amendment |
|---|---|
| `mesh.network_account` | Add `canonical_party_id`, `account_purpose_code` default `primary`, source case/version, and one live uniqueness rule for `(canonical_party_id, account_purpose_code)`. Guard account role transitions: `supplier -> both` or `buyer -> both` requires an approved idempotent Studio command; roles never silently narrow while active relationships depend on them. |
| `mesh.network_relationship_status_d` | Add `rejected` and `expired` so an unanswered or declined request is not misrepresented as terminated. Keep `requested`, `active`, `suspended`, and `terminated`. |
| `mesh.network_relationship` | Add immutable `request_id`, `relationship_generation`, hashed invitation nonce, request expiry, source case/version, accepted/terminated evidence pairs, and transition reason. Replace the current absolute coordinate uniqueness with unique `(buyer_account_id, supplier_account_id, relationship_kind, relationship_generation)` plus one partial live-coordinate rule; validate each account belongs to its stored tenant and has the required role. A later relationship after termination uses the next generation. |
| `mesh.network_relationship_event` | Add an append-only lifecycle ledger containing relationship and participant coordinates, event code (`requested`, `accepted`, `rejected`, `expired`, `suspended`, `resumed`, `terminated`), actor tenant/principal, occurred/effective time, reason, case/correlation, idempotency key, and evidence snapshot. Unique relationship/idempotency prevents replay. |
| transition functions/triggers | Enforce the state graph in section 7.10, supplier-side authority for acceptance, request freshness and nonce replay protection, and terminal immutability. Commit current state, event, audit, and outbox record atomically. |

BNA provisioning never creates a relationship as a trigger side effect. Neon
buyer enablement creates the account and scope; a buyer invitation is a later,
separately authorized relationship command.

### 10.8 Keycloak setup (configuration, not application DDL)

Keycloak's own schema is never modified. Configure the pinned release through
realm import/Admin API and record safe observed coordinates in Admin:

The current local realm already has Organizations enabled and unrestricted
registration disabled, which matches the recommended controlled mode. Its
`verifyEmail` and `resetPasswordAllowed` settings are currently disabled and
must be enabled for native local-account onboarding; `adminPermissionsEnabled`
is also currently disabled and must be reviewed/enabled when the least-privilege
organization provisioner is configured. Federated IdPs still enforce their own
upstream credential lifecycle, but Athyper must verify the brokered subject and
organization admission evidence.

| Concern | Required setup |
|---|---|
| Realm and clients | Keep Organizations enabled. Use a dedicated restricted Studio onboarding client with strict redirect URIs, PKCE, audience, nonce, and short pre-admission session; keep Neon, Mesh, and Admin clients distinct. Admin Platform remains invitation-only. |
| Applicant registration | Recommended controlled B2B mode keeps unrestricted realm registration off. Studio may hold a limited applicant identity, but creates no business organization until party qualification. After approval, Studio creates/reuses the KC organization and either sends the organization invitation or creates the user through Admin API with `VERIFY_EMAIL`, credential/passkey, and MFA required actions. Certify organization-invitation behavior against the pinned release. |
| Optional open user registration | If enabled for an isolated Express entry, require email verification, SMTP, reset-password policy, reCAPTCHA/bot defense, configured user-profile validation, privacy/identity terms, rate limiting, and abuse monitoring. KC self-registration creates a person, not a trusted Athyper canonical party, tenant, legal entity, BNA, subscription, or grant. |
| Organizations | Persist the returned immutable organization ID. Alias is unique and immutable after creation in the pinned release but remains a descriptor, not a tenant key. Map verified domains, members, invitations, and delegated identity administration to the appropriate legal identity boundary. |
| Organization IdPs | Link Malaysia to its Entra broker, India to Google Workspace, and Saudi to its local/approved provider. Use identity-first organization discovery, validate broker issuer/domain/claim rules, disable automatic cross-organization membership, and require explicit invitation or approved domain policy. |
| Multiple IdPs inside one organization | Link each approved broker to the same organization and route by verified domain, invitation/home-IdP hint, or an explicit identity-first choice. Record the chosen provider in the immutable plane binding. Never infer a provider-specific application role or merge subjects merely because email addresses match. |
| Token contract | Emit one selected organization ID and realm context to the application clients. Include only safe display claims. Plane, tenant, BNA, legal entity, operating organization, roles, permissions, and subscriptions are resolved plane-locally and are not trusted from KC claims. |
| Security | Configure SMTP, key rotation, brute-force protection, credential/password/passkey policy, MFA required actions, back-channel logout, admin event audit, and session lifetimes. Admin users require the strongest MFA/SoD policy. |
| Provisioning service | Use a least-privilege confidential service account for organization, invitation/member, user required-action, domain, and approved IdP operations. Enable fine-grained admin permissions where supported; store credentials in the connector/secret system, never DDL or case JSON. |

### 10.9 DDL and configuration file organization

Use the established numbered DDL convention:

- Admin-specific `02_*`, `03_*`, `05_*`, `06_*`, `07_*`, `08_*`, `10_*`, and
  `11_*` files under `planes/athyper/{master,control,document}`;
- common identity-projection and subscription files under `common/master`;
- common product-capability files under `common/control`;
- Neon operating-role catalog/seed, temporal constraint, resolver, process-root
  FK/validation, RLS, grant, and semantic assertion files in their existing
  numbered `control`, `master`, and `document` phases;
- Mesh relationship-event/transition DDL, RLS/grants, and replay/state semantic
  assertions in the existing `mesh` phases;
- explicit entries in all three `_manifest.txt` files at the matching phase;
- `12_*` reference seeds for blueprint, capability, plan, and usage catalogs;
- a versioned Keycloak realm export plus an idempotent Admin-API bootstrap for
  environment-specific organization/IdP coordinates; IdP secrets stay external;
- fresh-database assertions for expected counts, natural-key uniqueness,
  orphans, state semantics, and cross-file deterministic IDs.

Do not put authority in seed metadata JSON. Seeded codes, relationships, and
limits must use typed columns and deterministic UUIDs. Cross-plane UUIDs are
checked for format and lifecycle by reconciliation, not foreign keys.

## 11. Service and package design

### 11.1 Admin onboarding bounded context

Create `server/packages/services/onboarding` with these internal ports:

- `CaseRepository` — case, target, check, and resource desired state;
- `PartyRegistry` — exact identifier matching, claims, review, and merge;
- `BlueprintCatalog` and `BlueprintCompiler` — immutable blueprint to desired
  resource graph;
- `ApprovalPolicy` — existing policy engine plus work-item creation;
- `ProvisioningCoordinator` — dependency scheduling and outbox commands;
- `ReconciliationService` — target read model versus desired version/hash;
- `SubscriptionChangeService` — impact, schedule, and activation;
- `EvidenceSink` — snapshot and audit coordinates.

Expose command APIs for create/submit/approve/cancel/retry/reconcile/offboard
and query APIs for case timeline, resource state, duplicate candidates, impact,
and evidence. Mutating calls require idempotency keys and verified Admin-plane
authorization.

### 11.2 Provisioner contracts

Implement provisioners behind one contract:

```text
plan(desired) -> diff
apply(command, idempotency_key, desired_version, desired_hash) -> receipt
observe(resource_key) -> actual_version, actual_hash, state
compensate(receipt) -> result          # only where explicitly safe
```

Required provisioners are `keycloak-organization`, `admin-projection`,
`neon-tenant`, `neon-organization`, `mesh-network-account`,
`mesh-relationship`, `plane-subscription`, and `plane-authorization`.

Keycloak provisioning uses the Admin API of the pinned Keycloak version. It
persists returned organization IDs and never mutates Keycloak's database.
Credentials are secret references held by the existing connector model.

### 11.3 IAM changes

Modify the existing IAM discovery, context, bootstrap, JIT, session, logout,
and authorization-session components to consume the local organization
projection repository. Remove alias-to-tenant code and bind the projection ID
and hash into the canonical session. Keep exact identity admission and all
existing plane database checks.

### 11.4 Workers

Add workers in the existing jobs service for:

- onboarding outbox dispatch;
- provisioning reconciliation and drift detection;
- scheduled subscription activation;
- projection/entitlement invalidation;
- Keycloak organization observation;
- Mesh relationship-invitation expiry;
- failed audit/outbox retry;
- offboarding retention transitions.

Workers use bounded leases, exponential retry, dead-letter visibility, and
case correlation. Repeated observation of an unchanged external failure is
reported as blocked work, not silently marked successful.

### 11.5 API, command, and event envelope

The Admin API exposes case intent, not target-table CRUD:

- `POST /v1/onboarding/cases`;
- `POST /v1/onboarding/cases/{id}/submit`;
- `POST /v1/onboarding/cases/{id}/decisions`;
- `POST /v1/onboarding/cases/{id}/retry`;
- `POST /v1/onboarding/cases/{id}/reconcile`;
- `POST /v1/onboarding/cases/{id}/cancel`;
- `POST /v1/onboarding/cases/{id}/offboard`;
- `GET /v1/onboarding/cases/{id}` and evidence/resource subresources.

Each plane accepts an internal typed provisioning-command envelope containing
`schema_version`, `command_id`, `command_code`, `idempotency_key`,
`correlation_id`, `causation_id`, `case_id`, target plane/tenant coordinates,
`desired_version`, `desired_hash`, actor/service evidence, and a command-specific
body. The target recalculates the request fingerprint and rejects reuse of an
idempotency key with different content.

Initial event contracts are:

- `onboarding.case.state_changed`;
- `onboarding.resource.desired`;
- `provisioning.resource.applied` and `provisioning.resource.failed`;
- `reconciliation.drift_detected` and `reconciliation.resource_converged`;
- `identity.organization_projection.changed`;
- `identity.organization_membership.changed`;
- `subscription.assignment.changed`;
- `authorization.invalidate`;
- `neon.legal_entity.activated` and
  `neon.operating_organization_assignment.changed`;
- `mesh.network_account.changed`;
- `mesh.network_relationship.requested`, `.accepted`, `.rejected`, `.expired`,
  `.suspended`, `.resumed`, and `.terminated`;
- `neon.purchase_order.issued`;
- `mesh.exchange.accepted`, `mesh.exchange.rejected`, and
  `mesh.exchange.acknowledged`.

Contracts are versioned and additive. Event consumers ignore unknown optional
fields but reject unsupported major schema versions. Payloads contain resource
coordinates and evidence hashes, never IdP credentials, access tokens, or
unredacted secrets.

Internal commands use target-audience service credentials and are authorized
again by the target plane. Admin approval does not bypass target invariants.
Stable admission failures include `iam_projection_missing`,
`iam_projection_ambiguous`, `iam_projection_suspended`,
`iam_scope_outside_ceiling`, `subscription_not_effective`, and
`entitlement_capability_missing`.

### 11.6 Studio UI

Add a product package such as
`packages/products/admin/trust-onboarding-studio` and register it in the Admin
route manifest. The first release needs:

- Express and Governed start pages;
- organization/party match review;
- case timeline and target-resource graph;
- approval/work-item panel;
- projection editor with typed scope ceiling preview;
- subscription impact and effective-date panel;
- retry/reconcile controls with permission checks;
- audit/evidence and drift views;
- organization expansion and offboarding actions.

The UI never constructs provisioning commands directly. It submits typed case
intent and renders server-compiled desired state.

## 12. Build plan

### Phase 0 — contract approval and fixtures

Deliver this blueprint as an ADR-level contract, assign owners, freeze API event
names and status vocabularies, and create Athyper India/Cirrus/Global Components
golden fixtures. Record current Keycloak realm, organization, member, subject,
and domain inventories before mutation.

Exit gate: DDL/API review approves names and constraints; no open question can
change party, organization, projection, tenant, or authorization ownership.

### Phase 1 — additive DDL foundation

Implement domains, tables, constraints, indexes, triggers, functions, RLS,
grants, seeds, and manifest entries. Backfill current tenant plan pointers into
non-overlapping subscription rows. Add canonical-party columns nullable, backfill
fixtures, validate, and only then tighten required constraints. Include typed
Neon operating participation roles/non-overlap/effective resolver and Mesh
relationship generations/events/transition guards in this wave.

Exit gate: all three empty-database manifests build twice idempotently; RLS and
tenant-isolation tests pass; DDL semantic assertions pass; no runtime reader is
changed yet.

### Phase 2 — canonical registry and projection compiler

Build Party Registry, Keycloak Organization Registry, blueprint compiler, and
desired projection/resource APIs in Admin. Implement exact-match locks and
duplicate-review work items. Seed the two Express blueprints and the governed,
expansion, `MESH_BUYER_FROM_NEON_V1`, buyer-invitation, user-lifecycle,
subscription-change, and offboarding skeletons. Compile explicit parent/root
case causation.

Exit gate: deterministic compilation produces the same desired graph/hash;
duplicate and merge tests prove no automatic reassignment.

### Phase 3 — target provisioner and saga kernel

Implement the provisioner contract, target-plane authenticated command routes,
`event.command_execution` idempotency, outbox handlers, case resource ledger,
reconciliation, retry, and safe compensation. Add connector health/readiness.

Exit gate: crash/retry tests at every boundary converge to one target resource;
conflicting reuse of an idempotency key is rejected.

### Phase 4 — identity organization projection and IAM cutover

Materialize projections in every plane, build the local projection repository,
change discovery/context/session admission to immutable organization ID, and
bind projection/entitlement epochs to sessions. Run new logic in shadow compare
mode without authorizing from the old alias contract.

Exit gate: every active login fixture resolves one exact projection; missing,
ambiguous, cross-plane, cross-realm, stale, and out-of-ceiling cases fail closed.

### Phase 5 — Mesh partner and relationship release

Implement partner self-entry and buyer-invited entry, party resolution, BNA
dedupe, free subscription, supplier organization provisioning, invitation
freshness/replay protection, relationship acceptance/suspension/termination,
minimal scoped authorization, and the Express UI.

Exit gate: first invite creates one supplier; repeated/concurrent invitations
reuse it; three buyers create three relationships and still one primary supplier
BNA.

### Phase 6 — Neon Finance Free release

Implement the tenant/legal-entity baseline compiler and provisioner, Finance
Accounting capability catalog, `legal_entity_count = 1`, identity projection,
initial scoped Finance Admin authorization, and the independently reconciling
Mesh buyer child case supplied by `mesh_buyer_base`.

Exit gate: a fresh organization reaches usable Finance Accounting with exactly
one legal entity; a second entity is blocked until plan capacity or an approved
upgrade exists.

### Phase 7 — governed, expansion, and subscription lifecycle

Complete enterprise IdP/domain checks, configurable approval policies, add
legal entity/operating organization, enable-Mesh expansion, effective-dated
upgrade/downgrade, impact analysis, overrides, user lifecycle, and offboarding.
Seed and validate the Procurement Asia, Finance Shared Services Asia, and
Enterprise Sales Asia role patterns against the Athyper Group fixture.

Exit gate: scheduled changes activate once, invalidate sessions, preserve data,
and produce complete before/after evidence.

### Phase 8 — Neon-to-Mesh exchange routing

Publish PO issuance through Neon outbox, implement the Mesh submit API and
party/account/relationship resolver, and return technical/business
acknowledgements through APIs.

Exit gate: Athyper India routes only through `BNA-ATH-IN` to Cirrus's own BNA;
inactive or ambiguous relationship/account cases create no envelope.

### Phase 9 — migration, certification, and activation

Populate canonical parties, Keycloak organization IDs, desired and plane-local
projections, subscriptions, and record links for existing fixtures. Apply the
versioned realm configuration/bootstrap, certify organization-linked IdPs and
invitations, regenerate seeds and authorization groups, and remove
alias-to-tenant readers, retired seed identifiers, and temporary compatibility
reads.

Exit gate: the complete certification matrix passes and the activation review
approves the evidence bundle.

## 13. Test and certification matrix

### DDL and isolation

- fresh and repeat builds for Athyper, Neon, and Mesh manifests;
- orphan, uniqueness, temporal-overlap, state-transition, RLS, and grant tests;
- cross-tenant and cross-plane UUID attempts;
- deterministic seed IDs and catalog counts;
- no authority stored only in JSON metadata;
- typed operating-role/domain compatibility, assignment overlap, inactive
  company, and processor/company mismatch failures;
- relationship generation/live uniqueness, illegal transition, expired request,
  wrong-side acceptance, and replay failures.

### Keycloak configuration

- organization creation/reuse and immutable-ID observation through Admin API;
- controlled applicant path with unrestricted business-organization creation
  impossible;
- invitation for existing and new users in the pinned release, including the
  Admin-API required-action fallback;
- Malaysia Entra, India Google Workspace, Saudi local IdP, domain conflict, and
  broker-claim mismatch;
- one user in several organizations with exactly one selected organization in
  a plane session;
- email verification, MFA, brute-force defense, key/session policy,
  back-channel logout, and least-privilege provisioning service.

### Identity and authorization

- native and support realms in all three planes;
- one user in one, two, and many Keycloak organizations;
- two organizations projecting to one tenant with different ceilings;
- one organization projecting to Neon and Mesh;
- disabled/revoked binding, suspended principal, and pending/expired membership;
- missing/suspended/stale projection and scope outside ceiling;
- cross-plane, cross-realm, and same-subject/different-realm isolation;
- subscription allowed but role denied; role allowed but subscription denied;
- MFA, deny precedence, delegation bounds, and session invalidation;
- plane-local logout audit and outbox retry.

### Party and onboarding

- exact identifier reuse, normalized variants, concurrent claims, and collision;
- group/legal-party relationship direction, temporal overlap, and hierarchy
  cycle rejection;
- name/domain similarity never auto-merges;
- governed merge approval and reconciliation;
- Express crash/retry after every provisioner command;
- target drift detection and repair;
- cancellation before and after partial provisioning;
- no KC organization for a non-interactive supplier record;
- invitation later creates/reuses the correct organization without another BNA;
- Neon self, Mesh partner self, buyer-invited partner, Ops-governed Neon, add
  legal entity, enable Mesh buyer, subscription change, and offboarding cases;
- parent/child crash and retry prove an active Neon legal entity is neither
  duplicated nor rolled back by delayed Mesh provisioning.

### Subscription and expansion

- Neon Free creates one legal entity and Finance Accounting only;
- upgrade exposes capability but grants no role;
- immediate and future changes, retry at effective time, and no overlap;
- downgrade with usage below, at, and above limit;
- approved time-bounded override;
- add legal entity with new versus shared identity boundary;
- automatic one-BNA-per-entitled-legal-entity child case and supplier-to-both
  role promotion without a duplicate primary account;
- `neon_buyer_included` is effective in Mesh before buyer activation, an
  existing `network_enterprise` plan is not downgraded, and no runtime
  cross-plane subscription read is required;
- Neon buyer offboarding preserves an independently entitled supplier account,
  relationships, and retained exchange data;
- operating-assignment scope expansion/contraction impact, approval, and
  session invalidation;
- data/session behavior across upgrade, downgrade, suspension, and offboarding.

### Mesh and exchange

- supplier invited by three buyers produces one canonical party/BNA;
- one BNA changes from supplier to both without duplicate account;
- explicitly approved regional account remains distinct;
- PO route resolves buyer, supplier, and relationship exactly;
- inactive, reversed, ambiguous, cross-tenant, and role-mismatched relationship;
- envelope, payload, event, acknowledgement, and plane-local audit correctness;
- replayed PO command returns the original result and creates no duplicate;
- Athyper Group fixture proves Procurement Asia, Finance Shared Services Asia,
  and Enterprise Sales Asia process under the assigned company codes while PO
  routing remains legal-party/BNA based;
- requested/accepted/rejected/expired/suspended/resumed/terminated relationship
  transitions preserve append-only evidence and block exchange when inactive.

## 14. Cutover and rollback

For local development, the preferred cutover is a fresh build of all three
databases plus a regenerated Keycloak realm import after subject inventory and
mapping are captured. This avoids carrying retired seed authority into the new
model.

If preserving the current realm/database state is necessary:

1. inventory and hash Keycloak subjects, organizations, memberships, domains,
   and IdP links;
2. create canonical parties and register immutable organization IDs;
3. compile desired projections and materialize them inactive;
4. backfill canonical-party and subscription coordinates;
5. reconcile in shadow mode and compare login outcomes;
6. freeze organization/tenant mutations for the short activation window;
7. activate projections and switch runtime reads;
8. verify subject count/hash, sessions, memberships, scopes, and audit rows;
9. remove alias-to-tenant paths and temporary seed compatibility.

Rollback is a service/configuration rollback while the additive tables remain.
New projections can be suspended and sessions revoked. Rollback never enables
an Admin-to-Neon database fallback, alias-to-tenant authorization, or automatic
subject repair. Keycloak organizations and plane business data are retained for
forward recovery rather than deleted.

## 15. Operational readiness

Readiness must fail when a required plane database identity is wrong, an active
projection references a missing scope, current subscription intervals overlap,
the Keycloak organization observer is beyond its freshness limit, or a required
provisioner is unhealthy. A temporarily unavailable audit sink does not make
logout fail; it uses the existing outbox retry path.

Track at minimum:

- cases by state, age, blueprint, and target plane;
- provisioner latency, retry, conflict, and dead-letter counts;
- desired/applied version drift and reconciliation age;
- party duplicate-candidate and identifier-conflict queues;
- projection admission failures by stable reason code;
- subscription activation failures and over-limit tenants;
- session invalidations and stale-projection rejections;
- PO routing ambiguity and replay counts.

## 16. Review checklist

Implementation may start when reviewers confirm:

- immutable Keycloak organization ID replaces alias-to-tenant identity;
- Admin canonical party is the duplicate-control authority;
- plane-local projection is a ceiling, not a grant;
- Cirrus and other partners use their own Mesh tenants/accounts;
- target-plane APIs and outbox sagas preserve database boundaries;
- new DDL is limited to the registry, onboarding state, projections,
  entitlements/subscriptions, canonical-party links, Neon operating-assignment
  hardening/process context, and Mesh relationship lifecycle evidence described
  above;
- existing authz, work item, outbox, command, connector, audit, and snapshot
  mechanisms are reused;
- `company_code_id` remains Neon legal/posting authority and
  `operating_organization_id` remains operational context;
- automatic Mesh buyer provisioning is an entitlement-driven child case and
  never an account trigger or relationship grant;
- Keycloak owns identity organizations and IdPs but never business party,
  tenant, subscription, or plane authorization authority;
- Express and Governed flows share the same security gates;
- fresh-build and fail-closed certification gates are mandatory.

The remaining review inputs are catalog values: final plan codes and limits,
Express verification thresholds, approval role assignments, reconciliation
SLAs, and retention durations. They can be changed through versioned blueprint,
policy, and plan data without changing this architecture.
