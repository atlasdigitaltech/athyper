# Business Partner Governance Recommendation

## Executive Recommendation

Use `master.business_partner` as the canonical owner of governance for both suppliers and customers. Do not create separate supplier governance and customer governance tables unless a future product requirement proves that role-specific governance records must diverge.

Recommended target:

1. Keep governance records BP-owned through `master.party_governance_relation`.
2. Add role-aware UI behavior for supplier/customer and corporate/individual cases.
3. Add missing governance attributes for ownership, control, signatory authority, KYC, sanctions, PEP, evidence, and review cadence.
4. Add a summary/read model for the UI so the Governance tab can show posture metrics without calculating everything in React.

The current implementation has a solid BP-first foundation, but the visible Governance tab is still too flat for audit use. It stores only enough data for name, role, ownership percent, and status. The audit-style mockups need grouped rendering, summary metrics, compliance chips, role-aware drawers, and a richer governance schema.

## Attached JSX Review

The supplied JSX is a good direction and should be used as the target interaction model, but not copied as a one-off page. Build it as metadata-driven runtime behavior so suppliers, customers, corporate parties, and individual parties share the same governance foundation.

### Supplier / Corporate JSX

Strong ideas to adopt:

- Compliance strip above the list: disclosed ownership, UBO count, board count, last review.
- Ownership composition visualization: direct/beneficial ownership should be visible before the user reads rows.
- Grouped roster: ownership, leadership, advisory, inactive.
- Role-aware side drawer: ownership roles ask for ownership/voting/directness; leadership roles ask for designation, appointment date, authority limit, and term; all roles ask for KYC, sanctions, PEP, and evidence.

Current gap:

- The current production UI only shows four flat rows and a basic drawer. It does not answer the audit questions: who controls the party, who can bind the party, what has been screened, what evidence exists, and when review is due.

### Customer / Corporate JSX

Strong ideas to adopt:

- Same governance pattern as supplier corporate, but with role-specific facts for customer risk: regulator, license, rating, solvency/credit posture, reinsurance or industry counterparties where applicable.
- Corporate customers should still use the same BP governance table for owners, UBOs, directors, signatories, auditors, and advisors.
- Customer-specific risk facts belong in `customer_qualification`, risk assessment tables, or industry-specific extensions, not in a separate customer governance table.

Current gap:

- Current DDL supports customer qualification and BP governance separately, but the Governance tab does not merge them into one reviewer-facing posture.

### Customer / Individual JSX

Strong ideas to adopt:

- Do not force ownership charts for individuals.
- Replace ownership posture with identity/KYC posture: KYC tier, AML score, PEP, sanctions, documents, decision state.
- Show related parties: spouse, dependents, beneficiaries, employer, guardian, POA, authorized representative.
- Show source of wealth / source of funds and screening results.

Current gap:

- `party_governance_relation` can technically hold individuals, but individual related-party governance should not be overloaded into shareholder/UBO/director semantics. Add a general related-party model when individual customer/supplier workflows become first-class.

### Supplier / Individual Recommendation

Use the individual customer pattern with supplier-specific controls:

- Identity/KYC posture: ID, tax registration, sanctions, PEP, bank verification, payment readiness.
- Related parties: employer/company represented, introducer, authorized representative, POA, guarantor, beneficiary if relevant.
- Source of funds / source of wealth where payment, high-risk category, or AML policy requires it.
- Supplier qualification facts: onboarding status, approval status, blocked status, risk tier, review due date.

## Current Front-End State

Current UI behavior:

- The Governance tab renders a flat list of rows.
- Each row shows member name, relation type, ownership percent, and status.
- The detail drawer only shows the whitelisted display fields.
- The current tab metadata already has `group_by_field = relation_type`, but `ChildSummaryCardsPanel` still renders one flat card list.
- The Governance tab does not currently expose `add_href_template` / `add_label`, so the generic child panel treats the section as rule-managed rather than addable.

Relevant files:

- `packages/shared/runtime/entity-runtime/src/detail/ChildSummaryCardsPanel.tsx`
- `packages/shared/runtime/entity-runtime/src/detail/MasterDetailPage.tsx`
- `server/db/sql/900_seed_data/010_platform/005_domain_registrations/100_master/000_business_partner.sql`
- `server/db/sql/900_seed_data/010_platform/005_domain_registrations/100_master/008_supplier_governance.sql`

## Front-End UI Recommendation

### 1. Build A Governance Workbench, Not A Flat Child List

For corporate suppliers and corporate customers, the Governance tab should show:

- Compliance posture strip: disclosed equity percent, UBO count, board/officer count, signatory count, KYC/sanctions status, last review, next review.
- Ownership/control visualization: direct equity, beneficial ownership, voting control, unresolved/undisclosed percentage.
- Grouped roster: Ownership, Beneficial Owners, Board & Leadership, Signatories, Advisory/Audit, Inactive.
- Role-aware side drawer: identity, role, ownership/control, appointment/authority, compliance/evidence, review history.

For individual suppliers and individual customers, the Governance tab should not force an ownership chart. It should show:

- Identity/KYC posture: KYC tier, sanctions/PEP status, screening date, documents complete, review decision.
- Related parties: spouse, dependent, beneficiary, guardian, POA, employer, introducer, authorized representative.
- Source of wealth / source of funds where relevant.
- Evidence and screening results.

### 2. Make the UI Context-Aware

The same BP can be supplier, customer, or both. The UI should derive context from role tables:

- `business_partner.partner_category` determines corporate vs individual base rendering.
- Existence of `master.supplier` enables supplier-specific governance facts.
- Existence of `master.customer` enables customer-specific governance facts.
- If both roles exist, show a segmented context control: Common, Supplier, Customer.

Do not duplicate governance rows per role unless the relationship itself is role-specific.

### 3. Runtime Work Needed

Short-term front-end/runtime changes:

- Implement `config.group_by_field`, `group_order`, and `group_labels` in `ChildSummaryCardsPanel`.
- Add optional toolbar support: search, group filters, inactive toggle, Add member.
- Add governance-specific fact and badge formatters:
  - `ownership_pct`, `voting_pct`, `beneficial_ownership_pct` as percentages.
  - `kyc_status`, `sanctions_status`, `pep_status`, `evidence_status`, `review_status` as chips.
- Use drawer groups from metadata or add a new `detail_groups` config so the drawer is not just a flat field grid.
- Add Governance tab `add_href_template` and `add_label` metadata.

Medium-term UI option:

- Add a specialized renderer, for example `business_partner_governance`, when summary metrics and role-aware forms become too specific for the generic child card renderer.

Recommended front-end build decision:

- Phase 1: extend `summary_cards_with_drawer` to support grouping, toolbar, richer badges, and drawer groups.
- Phase 2: add a `business_partner_governance` specialized renderer for posture strip, ownership/control visual, and corporate-vs-individual switching.
- Do not hardcode supplier/customer pages. Use BP data plus role existence to select the view.

## Current DDL Review

### What Is Good

The current model already has the right spine:

- `master.business_partner` is the canonical identity.
- `master.supplier` and `master.customer` are thin AP/AR roles.
- `master.party_governance_relation` is polymorphic and can be BP-owned.
- `master.supplier_qualification` and `master.customer_qualification` contain role-specific risk gates.
- `master.party_risk_*` tables provide a strong evidence-driven risk platform.
- `master.party_governance_role` already has core governance roles: shareholder, UBO, director, board member, signatory, company secretary, auditor, nominee director, proxy.

### Main Gaps Against Audit Mockups

| Area | Current DDL | Gap | Recommendation |
| --- | --- | --- | --- |
| Ownership | `ownership_pct` only | No voting percent, beneficial percent, direct/indirect chain, control basis | Add `voting_pct`, `beneficial_ownership_pct`, `directness`, `control_nature` |
| Member identity | Free text `member_name`, `company_name`, `member_type` | Cannot dedupe, link to BP, screen member, or build graph reliably | Add member identity reference or normalized member table |
| Corporate vs individual | `member_type` values are `individual`, `company`, `external` | Inconsistent with BP `partner_category=organization/individual` | Standardize to `individual`, `organization`, `trust`, `public_float`, `external` |
| Role validation | Minimal checks | Shareholders can miss ownership; non-owners can carry ownership; UBO can be company | Add role-specific checks |
| Compliance | No KYC, sanctions, PEP, evidence, review fields on governance relation | UI cannot show audit posture per member | Add status fields or link to risk evidence |
| Evidence | Generic attachments/risk evidence exist but no direct governance link | Cannot prove why a role/ownership value was accepted | Add relation evidence link or extend risk evidence subject type |
| Review cycle | No reviewed_at / next_review_at / reviewed_by | Audit cannot prove periodic governance review | Add review cadence fields |
| Add/edit UX | Entity metadata has only basic fields | Side drawer cannot be role-aware | Add metadata fields and runtime form sections |
| Aggregate guard | Sums ownership per `relation_type` | Shareholder and UBO totals are checked separately, which may be fine but ambiguous | Rename measures or split direct equity vs beneficial control explicitly |

## Recommended DDL Direction

### Interactive DDL Contract

The UI needs an explicit contract from DDL and metadata. The contract should expose:

| UI surface | Data source | Required fields |
| --- | --- | --- |
| Corporate posture strip | `master.v_business_partner_governance_summary` | disclosed equity %, beneficial ownership %, UBO count, leadership count, signatory count, sanctions/PEP issue counts, next review |
| Ownership donut / bars | `master.party_governance_relation` | relation type, ownership %, voting %, beneficial ownership %, directness, share class |
| Governance roster | `master.party_governance_relation` + metadata | member name, member type, country, relation type, title, authority, KYC, PEP, sanctions, status |
| Role-aware drawer | `control.entity.display_config.drawer_groups` or renderer config | group definitions and conditional fields by relation type |
| Individual KYC posture | `customer_qualification` / `supplier_qualification` + risk tables | KYC status, AML/sanctions status, risk tier, screening date, review date |
| Individual related parties | proposed `master.party_relationship` | relationship type, related member, effective period, notes, evidence |

DDL should remain additive at first. Avoid dropping or replacing `party_governance_relation` until data migration and UI behavior are stable.

### Option A: Metadata/UI-Only Patch

Use this if the goal is quick demo alignment.

Changes:

- Implement grouped rendering in the existing UI.
- Add `add_href_template` and `add_label` for Governance.
- Expand Governance tab display fields to show current available facts:
  - `member_name`
  - `member_type`
  - `relation_type`
  - `business_title`
  - `ownership_pct`
  - `share_class`
  - `appointed_date`
  - `end_of_term`
  - `status`

Pros:

- Fastest.
- No migration risk.
- Improves current screenshot immediately.

Cons:

- Still not audit-complete.
- Cannot support KYC/PEP/sanctions/evidence posture per governance member.

### Option B: Additive Governance v2 Patch

This is the recommended near-term implementation.

Add columns to `master.party_governance_relation` without breaking existing rows:

```sql
ALTER TABLE master.party_governance_relation
  ADD COLUMN IF NOT EXISTS member_business_partner_id uuid,
  ADD COLUMN IF NOT EXISTS member_country_code char(2),
  ADD COLUMN IF NOT EXISTS directness text,
  ADD COLUMN IF NOT EXISTS control_nature text,
  ADD COLUMN IF NOT EXISTS voting_pct numeric(7,4),
  ADD COLUMN IF NOT EXISTS beneficial_ownership_pct numeric(7,4),
  ADD COLUMN IF NOT EXISTS authority_scope text,
  ADD COLUMN IF NOT EXISTS authority_limit_amount numeric(18,4),
  ADD COLUMN IF NOT EXISTS authority_limit_currency_code char(3),
  ADD COLUMN IF NOT EXISTS kyc_status text NOT NULL DEFAULT 'not_started',
  ADD COLUMN IF NOT EXISTS sanctions_status text NOT NULL DEFAULT 'not_checked',
  ADD COLUMN IF NOT EXISTS pep_status text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS last_screened_at timestamptz,
  ADD COLUMN IF NOT EXISTS evidence_status text NOT NULL DEFAULT 'missing',
  ADD COLUMN IF NOT EXISTS last_reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS next_review_at date,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid,
  ADD COLUMN IF NOT EXISTS source_of_wealth text;
```

Add role-specific constraints:

```sql
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pgr_pct_ranges_chk') THEN
    ALTER TABLE master.party_governance_relation
      ADD CONSTRAINT pgr_pct_ranges_chk CHECK (
        (voting_pct IS NULL OR (voting_pct >= 0 AND voting_pct <= 100))
        AND (beneficial_ownership_pct IS NULL OR (beneficial_ownership_pct >= 0 AND beneficial_ownership_pct <= 100))
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pgr_directness_chk') THEN
    ALTER TABLE master.party_governance_relation
      ADD CONSTRAINT pgr_directness_chk CHECK (
        directness IS NULL OR directness IN ('direct', 'indirect', 'both', 'unknown')
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pgr_role_ownership_chk') THEN
    ALTER TABLE master.party_governance_relation
      ADD CONSTRAINT pgr_role_ownership_chk CHECK (
        relation_type NOT IN ('shareholder', 'ubo')
        OR ownership_pct IS NOT NULL
        OR beneficial_ownership_pct IS NOT NULL
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pgr_authority_currency_chk') THEN
    ALTER TABLE master.party_governance_relation
      ADD CONSTRAINT pgr_authority_currency_chk CHECK (
        authority_limit_amount IS NULL OR authority_limit_currency_code IS NOT NULL
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pgr_country_fmt_chk') THEN
    ALTER TABLE master.party_governance_relation
      ADD CONSTRAINT pgr_country_fmt_chk CHECK (
        member_country_code IS NULL OR member_country_code ~ '^[A-Z]{2}$'
      );
  END IF;
END $$;
```

Add indexes:

```sql
CREATE INDEX IF NOT EXISTS pgr_member_bp_idx
  ON master.party_governance_relation (tenant_id, member_business_partner_id)
  WHERE member_business_partner_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS pgr_review_due_idx
  ON master.party_governance_relation (tenant_id, next_review_at)
  WHERE is_active = true AND next_review_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS pgr_compliance_idx
  ON master.party_governance_relation (tenant_id, kyc_status, sanctions_status, pep_status)
  WHERE is_active = true;
```

Pros:

- Strong improvement without major data-model churn.
- Supports audit UI and side-drawer detail.
- Preserves the current entity registration.

Cons:

- Member identity remains partially denormalized unless `member_business_partner_id` is populated.
- Related parties for individual customers may still need a separate relationship table.

### Option C: Normalized Governance v3

Use this when relationship graph, deduplication, and external screening become core workflows.

Create a member table:

```sql
CREATE TABLE IF NOT EXISTS master.party_governance_member (
  id uuid NOT NULL DEFAULT shared.uuidv7(),
  tenant_id uuid NOT NULL,
  member_kind text NOT NULL,
  display_name text NOT NULL,
  legal_name text,
  country_code char(2),
  linked_business_partner_id uuid,
  external_reference text,
  kyc_status text NOT NULL DEFAULT 'not_started',
  sanctions_status text NOT NULL DEFAULT 'not_checked',
  pep_status text NOT NULL DEFAULT 'unknown',
  last_screened_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL,
  updated_at timestamptz,
  updated_by uuid,
  CONSTRAINT pgm_pkey PRIMARY KEY (id),
  CONSTRAINT pgm_tenant_uq UNIQUE (tenant_id, id),
  CONSTRAINT pgm_name_nonempty CHECK (btrim(display_name) <> ''),
  CONSTRAINT pgm_kind_chk CHECK (member_kind IN (
    'individual', 'organization', 'trust', 'public_float', 'external'
  )),
  CONSTRAINT pgm_country_fmt_chk CHECK (
    country_code IS NULL OR country_code ~ '^[A-Z]{2}$'
  ),
  CONSTRAINT pgm_status_chk CHECK (status IN ('active', 'inactive', 'archived'))
);
```

Then add `member_id` to `master.party_governance_relation` and gradually backfill from current inline member fields.

For individual customers/suppliers, add a general related-party table instead of overloading governance roles:

```sql
CREATE TABLE IF NOT EXISTS master.party_relationship (
  id uuid NOT NULL DEFAULT shared.uuidv7(),
  tenant_id uuid NOT NULL,
  business_partner_id uuid NOT NULL,
  related_member_id uuid NOT NULL,
  relationship_type text NOT NULL,
  relationship_note text,
  effective_from date,
  effective_until date,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL,
  updated_at timestamptz,
  updated_by uuid,
  CONSTRAINT prel_pkey PRIMARY KEY (id),
  CONSTRAINT prel_tenant_uq UNIQUE (tenant_id, id),
  CONSTRAINT prel_dates_chk CHECK (
    effective_until IS NULL OR effective_from IS NULL OR effective_until >= effective_from
  ),
  CONSTRAINT prel_status_chk CHECK (status IN ('active', 'inactive', 'archived'))
);
```

Suggested `relationship_type` values:

- `spouse`
- `dependent`
- `beneficiary`
- `guardian`
- `power_of_attorney`
- `employer`
- `introducer`
- `authorized_representative`

Pros:

- Best long-term audit model.
- Supports reusable member screening.
- Supports corporate control graph and individual related-party graph.

Cons:

- Requires more migration, metadata, API, and UI work.
- Existing Governance entity registration must either move to a view or become a richer composite renderer.

## Recommended Implementation Plan

### Phase 1: UI and Metadata

1. Implement grouped rendering in `ChildSummaryCardsPanel`.
2. Add Governance tab add button metadata.
3. Expand governance display fields and drawer groups.
4. Add status chips for current fields.
5. Add a search/filter toolbar.

### Phase 2: Additive DDL

1. Add the Option B columns and constraints.
2. Add lookup values where needed:
   - `officer`
   - `authorized_representative`
   - `beneficial_controller`
   - `advisor`
3. Update entity field metadata in `008_supplier_governance.sql`.
4. Update Governance tab config in `000_business_partner.sql`.
5. Regenerate Prisma/Kysely types.

### Phase 3: Summary Views and Audit Posture

Create a BP governance summary view for the posture strip:

```sql
CREATE OR REPLACE VIEW master.v_business_partner_governance_summary AS
SELECT
  tenant_id,
  party_id AS business_partner_id,
  SUM(CASE WHEN relation_type = 'shareholder' AND is_active THEN COALESCE(ownership_pct, 0) ELSE 0 END) AS disclosed_equity_pct,
  COUNT(*) FILTER (WHERE relation_type = 'ubo' AND is_active) AS ubo_count,
  COUNT(*) FILTER (WHERE relation_type IN ('director', 'board_member', 'officer') AND is_active) AS leadership_count,
  COUNT(*) FILTER (WHERE relation_type IN ('signatory', 'authorized_representative') AND is_active) AS signatory_count,
  COUNT(*) FILTER (WHERE sanctions_status IN ('flagged', 'blocked') AND is_active) AS sanctions_issue_count,
  COUNT(*) FILTER (WHERE pep_status = 'pep' AND is_active) AS pep_count,
  MIN(next_review_at) FILTER (WHERE is_active) AS next_review_at
FROM master.party_governance_relation
WHERE party_type = 'business_partner'
GROUP BY tenant_id, party_id;
```

The runtime can consume this view through either:

- a registered read-only entity, or
- a small records API summary endpoint.

## UI Feedback From Latest Screenshots

Screenshot 1 is technically correct but weak for audit review because every row repeats the same pending chips and the user has to infer the answer. The stronger supplier/customer screenshots have a better hierarchy:

1. Top: posture summary answers "is this partner governable/trustworthy?"
2. Middle: ownership/control visualization answers "who controls this entity?"
3. Bottom: roster/details answer "who are the people/entities and what is missing?"

The BP 360 Governance tab should therefore be a governance workbench, not a generic child-list table.

Recommended layout:

| UI layer | Purpose | Existing table/view to use |
|---|---|---|
| Posture cards | disclosed ownership, UBO count, leadership count, compliance posture, next review | `master.v_business_partner_governance_summary`, computed from `master.party_governance_relation` |
| Ownership composition | shareholder/UBO bars and disclosure threshold | `master.party_governance_relation.ownership_pct`, `beneficial_ownership_pct`, `voting_pct` |
| Governance roster | members grouped by ownership, leadership, advisory, inactive | `master.party_governance_relation` |
| Detail drawer | role, control, authority, compliance, review, notes | `control.entity.display_config.drawer_groups` for `business_partner_governance` |
| Evidence/documents | KYC proof, ID docs, board resolution, authority letters | `master.attachment`, `master.entity_document_link`, `evidence_attachment_id` only as quick pointer |
| Screening results | sanctions, PEP, adverse media, AML score | `master.party_risk_evidence`, `master.party_risk_assessment`, denormalized summary on governance row |

## Reuse Strategy By Data Concept

| Audit concept | Best reuse now | Why |
|---|---|---|
| Corporate supplier/customer identity | `master.business_partner` plus `master.supplier` / `master.customer` role tables | BP is the canonical identity; supplier/customer are transaction roles. |
| Individual customer/supplier identity | `master.business_partner` with individual category/form, not `master.principal` | A person can be a counterparty without being an app user. |
| Internal reviewer/user | `master.principal` | Use for `reviewed_by`, `created_by`, approvals, and workflow ownership. |
| External portal login | `principal_identity_binding` or a BP/person identity binding extension | Only create/link a principal when the external person logs in. |
| Director/shareholder/UBO modeled as known party | `party_governance_relation.member_business_partner_id` | Reuses BP identity, addresses, identifiers, risk evidence, and attachments. |
| Director/shareholder/UBO not yet onboarded | `member_name`, `member_type`, `member_country_code` on `party_governance_relation` | Lightweight capture before creating a full BP. |
| Contact person | `party_contact_person` | Operational contacts; not enough by itself for screened governance members. |
| Related party for individual customer | Short term: `party_governance_relation`; long term: `party_relationship` | Spouse/dependent/beneficiary/employer are relationship graph facts, not corporate governance roles. |
| Employer/source of wealth | `party_risk_evidence` plus optional relation to employer BP | Source-of-wealth needs documents, recency, and screening traceability. |
| Identity documents | `attachment` + `entity_document_link` + evidence rows | Supports multiple docs, expiry, verification status, and audit trail. |
| AML/KYC score | `party_risk_assessment` and dimension scores | Avoid hardcoding one AML score column per screen. |
| Sanctions/PEP/adverse media hits | `party_risk_evidence` from configured `risk_source` providers | Keeps provider payload, source, timestamp, and trust level. |
| Insurance/reinsurance governance | `party_governance_relation` for holders/partners plus role-specific qualification metadata | Reinsurer/credit/solvency details are role/industry facts, not BP identity fields. |

Important boundary: `master.principal` is an application actor. It should not become the master record for a customer, supplier, director, spouse, or beneficiary unless that person actually has a login. For business meaning, use BP/person/relationship tables; for system access, use principal and identity bindings.

## UI Improvement Implemented In Runtime

The Governance renderer now detects `business_partner_governance` and renders:

- posture metrics using current child rows,
- ownership composition bars,
- searchable/filterable roster,
- sections for Ownership & Beneficial Interest, Board & Leadership, Advisory & Assurance, and Inactive,
- compact row storytelling: avatar, role, type, since date, title, country, ownership bar, and an aggregated compliance badge.

This preserves the existing `summary_cards_with_drawer` contract and reuses `party_governance_relation`; no new endpoint is required for the first improvement. The dedicated summary view can still be registered later for faster posture metrics and dashboards.

## DDL Gaps Still Worth Adding

Keep the current additive governance v2 table, then consider these targeted additions rather than a large replacement:

1. `member_contact_person_id` nullable FK to `party_contact_person` if the member is already an operational contact.
2. `relationship_context` or `role_cluster` generated/read-model value for ownership, leadership, advisory, related-party.
3. `screening_assessment_id` nullable FK to latest `party_risk_assessment` for traceable compliance.
4. A normalized `party_relationship` table when spouse/dependent/beneficiary/employer data becomes first-class.
5. A document requirement/read model over `entity_document_link` and `party_risk_evidence` for the identity-documents UI.

## Final Recommendation

Adopt Option B now and design Option C as the target model. Option B gives the audit-visible improvements with the lowest disruption. Option C should be used when the product needs reusable screening for governance members, ownership graph traversal, or individual related-party governance beyond a single BP record.

The highest-impact immediate fix is front-end/runtime: grouped rendering plus a posture strip. The current DDL can store basic governance, but the current UI hides too much and does not give the reviewer the audit answer: who controls the party, who can bind it, whether each person/entity has been screened, and when governance must be reviewed next.
