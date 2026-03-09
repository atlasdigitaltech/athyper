# Athyper v2.3 — Finance Module Functional Specification

> **Version**: 2.3
> **Date**: 2026-03-07
> **Status**: Living Document
> **Scope**: 14 financial engines, 6 runtime modules, 4 document services, bank reconciliation, period close governance, outbox pattern, HTTP API layer, 5 dashboard contributions, 15 UI components (8 detail + 3 list explorers + 4 shared renderers), list-page config system, and 69-test coverage

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Architecture Overview](#2-architecture-overview)
3. [Multi-Tenancy & Blueprint Model](#3-multi-tenancy--blueprint-model)
4. [Engine Catalogue](#4-engine-catalogue)
   - 4.1 [Event Store Engine](#41-event-store-engine)
   - 4.2 [OU + Intent Engine](#42-ou--intent-engine)
   - 4.3 [Decision Grid Engine](#43-decision-grid-engine)
   - 4.4 [Budget Engine](#44-budget-engine)
   - 4.5 [Commitment Engine](#45-commitment-engine)
   - 4.6 [Posting Engine (General Ledger)](#46-posting-engine-general-ledger)
   - 4.7 [Tax Engine](#47-tax-engine)
   - 4.8 [Asset Lifecycle Engine](#48-asset-lifecycle-engine)
   - 4.9 [Inventory Subledger Engine](#49-inventory-subledger-engine)
   - 4.10 [Commission Engine](#410-commission-engine)
   - 4.11 [Federation Engine](#411-federation-engine)
   - 4.12 [Production Engine](#412-production-engine)
   - 4.13 [Atlas AI Engine](#413-atlas-ai-engine)
   - 4.14 [Period Close Governance Engine](#414-period-close-governance-engine)
5. [Transaction Pipeline (13-Step Decision Grid)](#5-transaction-pipeline-13-step-decision-grid)
6. [Document Services](#6-document-services)
   - 6.1 [Purchase Invoice Service](#61-purchase-invoice-service)
   - 6.2 [Payment Entry Service](#62-payment-entry-service)
   - 6.3 [Manual Journal Entry Service](#63-manual-journal-entry-service)
   - 6.4 [GL Inquiry Service](#64-gl-inquiry-service)
7. [Bank Reconciliation](#7-bank-reconciliation)
8. [Outbox Pattern & Post-Action Handlers](#8-outbox-pattern--post-action-handlers)
9. [HTTP API Reference](#9-http-api-reference)
10. [Module Registry & Subscription Tiers](#10-module-registry--subscription-tiers)
11. [Dashboard Contributions](#11-dashboard-contributions)
12. [UI Components](#12-ui-components)
    - 12.1 [Detail Components](#121-detail-components)
    - 12.2 [List Explorer Components](#122-list-explorer-components)
    - 12.3 [Shared Cell Renderers](#123-shared-cell-renderers)
    - 12.4 [ListPageConfig System](#124-listpageconfig-system)
    - 12.5 [Tab Plugin Integration](#125-tab-plugin-integration)
13. [Shared Foundations](#13-shared-foundations)
14. [Data Model Summary](#14-data-model-summary)
15. [Blueprint Seed Data Specifications](#15-blueprint-seed-data-specifications)
16. [Configuration & Feature Flags](#16-configuration--feature-flags)
17. [Cross-Cutting Concerns](#17-cross-cutting-concerns)
18. [Appendices](#18-appendices)

---

## 1. Executive Summary

The Athyper v2.3 Finance Platform is a modular, event-sourced financial processing system designed for multi-tenant SaaS deployment. It supports business sizes ranging from solo freelancers to multi-country enterprises through a **blueprint-based architecture** that scales organizational complexity, chart of accounts depth, approval workflows, and regulatory compliance per tenant tier.

The platform comprises three layers: **14 financial engines** (core computation), **4 document services** (business document lifecycle orchestration), and a **presentation layer** (HTTP API + UI components).

### Key Capabilities

| Capability                       | Description                                                                                                            |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **Event Sourcing**               | Append-only event store with hash-chain integrity, monthly partitioning, and projection-based read models              |
| **13-Step Transaction Pipeline** | Deterministic intake → classification → resolution → scoring → approval → posting flow                                 |
| **Document Services**            | Purchase Invoice, Payment Entry, Manual JE, and GL Inquiry with full lifecycle orchestration                           |
| **Gross Settlement Payments**    | Transactional payment posting with per-invoice allocation, WHT, discounts, and overpay protection                      |
| **Bank Reconciliation**          | 3-pass auto-matching (exact/fuzzy/amount-only) with manual review and session-based workflow                           |
| **Hierarchical Budgets**         | 4-level funding profiles (Enterprise → Division → OU → Intent) with real-time health monitoring                        |
| **Multi-Book Assets**            | Statutory, tax, management, and insurance depreciation books with 5 depreciation methods                               |
| **Inventory Subledger**          | FIFO/LIFO/weighted-average/standard/specific valuation with lot and serial tracking                                    |
| **Multi-Entity Federation**      | Legal entity registry, intercompany agreements, transfer pricing, FX revaluation, and consolidation elimination        |
| **AI-Assisted Processing**       | Atlas AI engine with L1-L3 autonomy levels, drift monitoring, and reversible autonomous actions                        |
| **Outbox Pattern**               | Post-commit side effects (inventory, asset, commission, federation) via idempotent handlers with retry and dead-letter |
| **Blueprint Differentiation**    | 6 blueprints (A-F) scaling from 1 OU/15 accounts to 13 OUs/168 accounts per tenant                                     |
| **HTTP API**                     | 36 RESTful endpoints across 4 modules (accounting, payments, banking, GL inquiry)                                      |
| **Module Registry**              | 6 runtime modules (ACC, PAY, BUDGET, TREASURY, PAYG, plus planned modules) with dependency chains and subscription tiers |
| **Dashboard Contributions**      | 5 dashboard layouts with KPI widgets, trend charts, and recent-activity lists per module                               |
| **UI Components**                | 8 detail components + 3 list explorers + 4 shared cell renderers + 4 tab plugins with data-fetching hooks              |
| **List Explorer System**         | Filterable, searchable, paginated list pages with ListPageConfig factory, KPI summaries, view presets, and card/table modes |

### Design Mandates

- **MC-4**: All monetary amounts use `DECIMAL(18,4)` — no floating-point arithmetic anywhere
- **MC-5**: Immutable policy evaluation log — every policy decision is recorded and non-deletable
- **Double-Entry**: Every journal entry enforces `total_debit = total_credit` via CHECK constraint
- **Tenant Isolation**: Every table includes `tenant_id`; all unique constraints are tenant-scoped
- **Idempotency**: All write operations support `idempotencyKey` or `ON CONFLICT` upsert patterns

---

## 2. Architecture Overview

### 2.1 Engine Phases

The 14 engines are deployed in 4 phases reflecting their dependency chain (Period Close Governance engine runs cross-phase):

```
Phase 1 (Core)          Phase 2 (Extended)      Phase 3 (Enterprise)    Phase 4 (Autonomous)
┌──────────────┐        ┌──────────────┐        ┌──────────────┐        ┌──────────────┐
│ Event Store  │        │ Asset        │        │ Federation   │        │ Atlas AI     │
│ OU + Intent  │        │ Inventory    │        │ Production   │        │              │
│ Budget       │        │ Commission   │        │              │        │              │
│ Commitment   │        │              │        │              │        │              │
│ Tax          │        │              │        │              │        │              │
│ Posting      │        │              │        │              │        │              │
│ Decision Grid│        │              │        │              │        │              │
└──────────────┘        └──────────────┘        └──────────────┘        └──────────────┘
```

**Dependency flow**: Phase 4 → Phase 3 → Phase 2 → Phase 1 → Platform Adapters (DB, Cache, Auth)

### 2.2 Schema Layout

| Schema | Purpose                                             | Engine(s)                                     |
| ------ | --------------------------------------------------- | --------------------------------------------- |
| `evt`  | Immutable event store                               | Event Store                                   |
| `fin`  | All financial domain tables                         | All other engines                             |
| `meta` | Approval workflow templates                         | Decision Grid (approval routing)              |
| `core` | Tenants, organizational units                       | OU + Intent (org hierarchy)                   |
| `ref`  | Reference data (currencies, countries, UoM)         | Tax, Posting, Inventory                       |
| `ent`  | Entity master data (suppliers, customers, products) | Commitment, Inventory, Commission, Production |

### 2.3 RuntimeModule Pattern

Every engine exports a `RuntimeModule` with two lifecycle phases:

```typescript
export const engineModule: RuntimeModule = {
  name: "engine.<name>",
  register(container) {
    // Phase 1: Register repositories and services into DI container
  },
  contribute(container) {
    // Phase 2: Register health checks, event consumers, background jobs
  },
};
```

All 14 engines are composed in `framework/runtime/src/services/business/index.ts` and wired into the kernel via DI tokens defined in `framework/runtime/src/kernel/tokens.ts`.

### 2.4 Service Result Pattern

All service operations return a discriminated union:

```typescript
type ServiceResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: { code: string; message: string; details?: unknown } };
```

This eliminates exception-driven control flow and makes error handling explicit at every call site.

---

## 3. Multi-Tenancy & Blueprint Model

### 3.1 Tenant → Blueprint Mapping

| #   | Tenant    | Country | Currency | FY Start | Blueprint | Tier                      |
| --- | --------- | ------- | -------- | -------- | --------- | ------------------------- |
| 1   | `demo_my` | MY      | MYR      | Jan      | **A**     | Freelancer / Solo         |
| 2   | `demo_in` | IN      | INR      | Apr      | **A**     | Freelancer / Solo         |
| 3   | `demo_sa` | SA      | SAR      | Jan      | **B**     | Small (0-25 employees)    |
| 4   | `demo_qa` | QA      | QAR      | Jan      | **B**     | Small (0-25 employees)    |
| 5   | `demo_fr` | FR      | EUR      | Jan      | **C**     | SME (up to 200 employees) |
| 6   | `demo_de` | DE      | EUR      | Jan      | **C**     | SME (up to 200 employees) |
| 7   | `demo_ch` | CH      | CHF      | Jan      | **E**     | Multi-location            |
| 8   | `demo_us` | US      | USD      | Jan      | **D**     | Big single country        |
| 9   | `demo_ca` | CA      | CAD      | Apr      | **F**     | Multi-country enterprise  |

### 3.2 Entity Code Strategy

`entity_code` represents the **posting entity** = **legal/statutory boundary**:

| Blueprint     | entity_code(s)                             | Rationale                                                                               |
| ------------- | ------------------------------------------ | --------------------------------------------------------------------------------------- |
| A, B, C, D, E | `'HQ'` only                                | Single statutory entity. Branches and SSCs are OUs, not posting entities.               |
| F             | `'LE-CA'`, `'LE-MY'`, `'LE-SA'`, `'LE-IN'` | Holding company + 3 subsidiaries. Each has its own COA, fiscal periods, and tax regime. |

### 3.3 Blueprint Scaling Summary

| Dimension             | A   | B   | C   | D   | E   | F           |
| --------------------- | --- | --- | --- | --- | --- | ----------- |
| **Operating Units**   | 1   | 5   | 8   | 12  | 9   | 13          |
| **entity_codes**      | 1   | 1   | 1   | 1   | 1   | 4           |
| **COA Accounts**      | ~18 | ~26 | ~42 | ~52 | ~42 | ~168 (42×4) |
| **Fiscal Periods**    | 13  | 13  | 13  | 13  | 13  | 52 (13×4)   |
| **Cost Centers**      | 1   | 3   | 6   | 8   | 6   | 10          |
| **Profit Centers**    | 0   | 1   | 2   | 3   | 3   | 4           |
| **Dimension Types**   | 2   | 2   | 3   | 4   | 3   | 4           |
| **Dimension Values**  | 1   | 4   | 10  | 16  | 12  | 30          |
| **Tax Jurisdictions** | 1   | 1   | 1   | 4   | 4   | 5           |
| **Funding Profiles**  | 0   | 0   | 5   | 12  | 7   | 16          |
| **Approval Stages**   | 1   | 2   | 3   | 3   | 2   | 3           |
| **Legal Entities**    | 0   | 0   | 0   | 0   | 0   | 4           |

### 3.4 Definition Locks (Invariants)

These invariants are enforced across all blueprints:

1. **`entity_code` = posting entity = legal/statutory boundary.** Branch != legal entity unless explicitly configured.
2. **OU hierarchy = responsibility structure.** Branches, departments, SSCs are modeled as OUs + cost/profit centers, NOT separate entity_codes.
3. **Legal entity ↔ OU mapping**: Each `fin.legal_entity.code` has exactly one corresponding `fin.operating_unit` with `entity_code = legal_entity.code`.
4. **Projects are shareable** and never children of departments when shared across OUs.
5. **Seed keys are stable**: `(tenant_id, code)` or `(tenant_id, entity_code, code)` where applicable.
6. **All seed INSERTs are idempotent**: `ON CONFLICT DO UPDATE` with `RETURNING id` as the standard pattern.
7. **Funding is optional**: Blueprints A/B have zero funding profiles. All funding-dependent queries must be LEFT JOIN safe.
8. **Approvals resolve to role codes**, not user IDs. No HR org required for demo resolution.
9. **`fin.chart_of_accounts` IS the account master** — `is_group=true` marks grouping headers; `is_group=false` marks postable accounts.
10. **Tax tables are tenant-scoped** (no `entity_code` column). For multi-entity tenants (F), all country jurisdictions are seeded under one tenant.

---

## 4. Engine Catalogue

### 4.1 Event Store Engine

**Schema**: `evt` | **Tables**: 5 | **DDL**: `150_event_store.sql`
**Runtime**: `framework/runtime/src/services/business/engines/event-store/`

#### Purpose

The Event Store is the foundational persistence layer for all financial engines. Every significant state change across all engines is captured as an immutable event with cryptographic hash-chain integrity, enabling full audit trails, projection rebuilds, and temporal queries.

#### Core Concepts

**Universal Event Envelope** — Every event shares a common structure:

| Field              | Type         | Description                                                                                        |
| ------------------ | ------------ | -------------------------------------------------------------------------------------------------- |
| `event_type`       | VARCHAR(100) | e.g., `funding.reserved`, `commitment.created`, `posting.created`                                  |
| `source_engine`    | VARCHAR(50)  | Engine that emitted the event                                                                      |
| `txn_id`           | UUID         | Transaction identity (links related events)                                                        |
| `doc_id`           | UUID         | Source document (PO, Invoice, etc.)                                                                |
| `doc_type`         | VARCHAR(20)  | `PR`, `PO`, `INVOICE`, `PAYMENT`, `CREDIT`, `ACCRUAL`, `RECLASS`, `CONTRACT`, `GRN`, `JE`, `OTHER` |
| `correlation_id`   | UUID         | Causal chain root                                                                                  |
| `actor_type`       | VARCHAR(20)  | `USER`, `SYSTEM`, `AI_AGENT`, `SCHEDULER`                                                          |
| `payload`          | JSONB        | Domain-specific event data                                                                         |
| `payload_hash`     | VARCHAR(64)  | SHA-256 for tamper detection                                                                       |
| `partition_domain` | VARCHAR(30)  | Event ordering domain (e.g., `OU_FLOW`, `FUNDING_FLOW`)                                            |
| `sequence_no`      | BIGINT       | Monotonic per-partition sequence                                                                   |
| `idempotency_key`  | VARCHAR(200) | Prevents duplicate event emission                                                                  |

**Partition Domains** (deterministic ordering groups):

- `OU_FLOW`, `COMMITMENT_FLOW`, `FUNDING_FLOW`, `ENTITY_FLOW`, `INVENTORY_FLOW`, `WORKORDER_FLOW`, `ASSET_FLOW`, `COMMISSION_FLOW`, `IC_FLOW`

**Partition Key Format**: `{domain}:{tenantId}:{entityCode}:{primaryId}`

#### Tables

| Table                       | Purpose                                       | Key Constraint                                                       |
| --------------------------- | --------------------------------------------- | -------------------------------------------------------------------- |
| `evt.event`                 | Append-only event store (monthly partitioned) | UNIQUE `(tenant_id, partition_domain, partition_key, sequence_no)`   |
| `evt.event_snapshot`        | Projection state snapshots                    | Indexed by `(projection_id, partition_key)`                          |
| `evt.projection_registry`   | Formal projection registration                | UNIQUE `(tenant_id, projection_id)`                                  |
| `evt.projection_checkpoint` | Consumer resume points                        | UNIQUE `(tenant_id, projection_id, partition_domain, partition_key)` |
| `evt.sequence_counter`      | Atomic monotonic counter                      | PK `(tenant_id, partition_domain, partition_key)`                    |

#### Immutability Enforcement

- **Database trigger** (`trg_evt_event_immutable`): `BEFORE UPDATE OR DELETE` raises exception — events are strictly append-only
- **Hash chain**: `computeChainHash(previousHash, currentPayloadHash)` enables tamper detection across event sequences
- **Timing-safe verification**: `verifyPayloadHash()` prevents timing attacks on hash comparison

#### Projection System

Projections are materialized read models rebuilt from events:

| Projection              | Engine     | Source Events                                  | Domain            |
| ----------------------- | ---------- | ---------------------------------------------- | ----------------- |
| `gl-balance`            | Posting    | `posting.created`, `posting.reversed`          | `ENTITY_FLOW`     |
| `funding-profile-state` | Budget     | `funding.reserved/committed/consumed/released` | `FUNDING_FLOW`    |
| `commitment-lifecycle`  | Commitment | `commitment.created/fulfilled/cancelled`       | `COMMITMENT_FLOW` |
| `inventory-balance`     | Inventory  | `inventory.receipt/issue/transfer`             | `INVENTORY_FLOW`  |
| `asset-register`        | Asset      | `asset.capitalize/depreciate/dispose`          | `ASSET_FLOW`      |
| `commission-accrual`    | Commission | `commission.calculated/accrued/settled`        | `COMMISSION_FLOW` |
| `ic-netting`            | Federation | `ic.created/mirrored/netted`                   | `IC_FLOW`         |
| `wip-accumulation`      | Production | `workorder.material/labor/overhead`            | `WORKORDER_FLOW`  |

**Rebuild Strategies**: `SNAPSHOT_AND_CATCHUP` (default) or `FULL_REBUILD`

#### Services

| Service             | Responsibility                                                              |
| ------------------- | --------------------------------------------------------------------------- |
| `EventPublisher`    | Append events with idempotency check, hash computation, sequence assignment |
| `EventConsumer`     | Subscribe to event types, manage checkpoints, handle ordering               |
| `ProjectionManager` | Register projections, manage snapshots, trigger rebuilds                    |
| `TieringService`    | Archive old events to cold storage (hot/warm/cold tiers)                    |

---

### 4.2 OU + Intent Engine

**Schema**: `fin` + `core` + `ent` | **Tables**: 9 + 6 classification | **DDL**: `155_ou_intent.sql`, `157_spend_category.sql`, `071_ent_classification.sql`
**Runtime**: `framework/runtime/src/services/business/engines/ou-intent/`

#### Purpose

Maps organizational responsibility structure to financial defaults and classification resolution. The engine answers three questions:

- **WHERE** — Operating Units represent where costs originate
- **WHY** — Business Intents represent why money is spent
- **WHAT** — Classification (optional) determines what is being purchased, enabling automatic OPEX/CAPEX determination, intent suggestions, compliance enforcement, and spend analytics

The north star: "Business user fills OU + description/amount → system auto-fills GL, budget, tax, approvals."

#### Core Concepts

**Operating Unit Hierarchy** (3-level max):

```
Level 1: COMPANY (root)
Level 2: DIVISION / REGION / BRANCH / LEGAL-ENTITY
Level 3: DEPARTMENT / COST-CENTER
```

**OU Status Lifecycle**:

```
DRAFT → ACTIVE → UNDER_REVIEW → SUNSET → ARCHIVED
```

**Business Intent Domains**:

- `OPEX` — Operating expenses (travel, IT, facilities, professional services, marketing)
- `CAPEX` — Capital expenditures (equipment, IT infrastructure, vehicles, intangibles)
- `REVENUE` — Revenue recognition (sales, services, subscriptions)
- `TRANSFER` — Internal transfers (intercompany, fund transfers) — **RESTRICTED**
- `REGULATORY` — Tax and compliance obligations — **RESTRICTED**
- `ADMIN` — Adjustments and reclassifications — **RESTRICTED**

**Default Inheritance**: When `inheritFromParent = true`, an OU inherits GL account, cost center, profit center, funding profile, and currency from its parent OU. The inheritance resolver walks the parent chain until all defaults are resolved.

**Spend Categories** (20-60 per tenant): User-friendly groupings that bridge item classification to financial resolution. Each category defines:

- Primary domain (OPEX/CAPEX) and allowed domains
- Capitalization threshold for automatic OPEX/CAPEX determination
- Visibility level (STANDARD/RESTRICTED/CONFIDENTIAL)
- Compliance flags (classification_required, hs_required, is_regulated)

**Classification** (optional by default): Supports UNSPSC, HS, or custom codes. Made mandatory only by policy:

- Cross-border/import-export → HS required
- Regulated categories (chemicals, medical) → classification required
- Capital purchases above threshold → classification required
- Certain OUs (e.g., Procurement) → classification required

#### Tables

| Table                              | Purpose                                                     | Key Constraint                                                    |
| ---------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------- |
| `fin.operating_unit`               | Finance-scoped OU with defaults + classification policy     | UNIQUE `(tenant_id, entity_code, code)`                           |
| `fin.business_intent`              | Intent ontology with GL defaults + commodity affinities     | UNIQUE `(tenant_id, code)`                                        |
| `fin.ou_intent_mapping`            | OU↔Intent availability + approval/compliance overrides      | UNIQUE `(tenant_id, ou_id, intent_id)`                            |
| `fin.spend_category`               | Tenant spend groups with financial properties               | UNIQUE `(tenant_id, code)`                                        |
| `fin.spend_category_commodity_map` | Maps commodity code ranges to spend categories              | UNIQUE `(tenant_id, category_id, domain, code_from)`              |
| `fin.category_intent_rule`         | Context-driven intent resolution with explanation templates | UNIQUE `(tenant_id, category_id, condition_type, priority)`       |
| `ent.commodity_crosswalk`          | Cross-domain commodity code mappings (UNSPSC/HS)            | UNIQUE `(source_domain, source_code, target_domain, target_code)` |
| `ent.industry_crosswalk`           | Cross-domain industry code mappings (ISIC/NAICS)            | UNIQUE `(source_domain, source_code, target_domain, target_code)` |
| `ent.category_commodity_map`       | Maps tenant product categories to standard codes            | UNIQUE `(tenant_id, category_id, domain, code)`                   |
| `ent.classification_config`        | Per-tenant classification preferences + policies            | PK `(tenant_id)`                                                  |
| `ent.classification_suggestion`    | AI classification predictions with resolution tracking      | Indexed by `(tenant_id, source_type, source_id)`                  |
| `ent.classification_feedback`      | AI training feedback from user corrections                  | Indexed by `(scheme_type, domain, code)`                          |

#### Resolution Flow

```
User selects OU (auto-selected from profile, switchable if permitted)
  → System shows only allowed intents for that OU
  → User types description ("Dell laptop for QA lab") + enters amount ($2,400)
  → ClassificationService.suggest()
    → AI/text-match → Spend Category: "IT Hardware" (CAT-IT-HW)
    → CategoryIntentRuleService.evaluate()
      → IS_RECURRING? No
      → AMOUNT_ABOVE 1000? Yes → resolve CAPEX-IT
      → Explanation: "CAPEX because amount 2,400 > IT Hardware threshold 1,000"
  → CrossBorderService.evaluate()
    → supplier_country != entity_country? → is_cross_border = true → HS required
  → OUIntentMappingService.resolveDefaults()
    → Check direct OU-Intent mapping overrides
    → Fall back to OU defaults
    → Fall back to Intent defaults
    → Walk parent chain if inheritFromParent
    → Return: { resolvedGlAccount, resolvedFpId, resolvedCostCenterId, resolvedProfitCenterId }
  → Record all decisions in decision_explanations[]
  → If user overrides → record in user_overrides[] with reason
```

#### Acceptance Criteria

| #   | Scenario                                                 | Expected Behavior                                             |
| --- | -------------------------------------------------------- | ------------------------------------------------------------- |
| 1   | Simple domestic: OU + "office supplies" + $200           | Suggests CAT-OFFICE → OPEX-GENERAL; no HS needed; submittable |
| 2   | Below threshold: "Laptop" $800                           | Suggests CAT-IT-HW → OPEX-IT with explanation                 |
| 3   | Above threshold: "Laptop" $2,400                         | Suggests CAT-IT-HW → CAPEX-IT with explanation                |
| 4   | Subscription: "Laptop" $2,400/mo                         | IS_RECURRING → OPEX-IT regardless of amount                   |
| 5   | Restricted intent: HR user opens dropdown                | Transfer/Regulatory/Admin intents not visible                 |
| 6   | Restricted category: Non-authorized user                 | Cannot select "Legal Settlement"                              |
| 7   | Cross-border: Supplier DE, entity MY                     | is_cross_border=true → HS mandatory → blocked until provided  |
| 8   | Override tracking: User changes CAPEX→OPEX               | Logs original suggestion, user selection, reason              |
| 9   | Classification optional: OPEX-TRAVEL                     | No classification required; user picks intent directly        |
| 10  | Classification mandatory (policy): CAPEX above threshold | Category required (asset tagging depends on it)               |

#### Ownership Model

| Owner              | Manages                                                                                           |
| ------------------ | ------------------------------------------------------------------------------------------------- |
| Finance            | Intent library, spend categories, CAPEX thresholds, depreciation defaults, approval policies      |
| Procurement        | Catalogs, supplier item codes, vendor-to-classification mappings, default categories by commodity |
| Compliance/Tax     | Cross-border rules (when HS required), regulatory restrictions, sanctions                         |
| Business OU owners | OU structure, which intents/categories their OU is allowed to use (within finance policy)         |

---

### 4.3 Decision Grid Engine

**Schema**: `fin` | **Tables**: 5 | **DDL**: `160_decision_grid.sql`
**Runtime**: `framework/runtime/src/services/business/engines/decision-grid/`

#### Purpose

The Decision Grid orchestrates a 12-step transaction pipeline that takes raw financial submissions through validation, default resolution, funding checks, policy evaluation, risk scoring, and approval assembly. It is the central coordination point for all other engines.

See [Section 5](#5-transaction-pipeline-13-step-decision-grid) for the full pipeline specification.

#### Tables

| Table                       | Purpose                                             | Key Constraint                                  |
| --------------------------- | --------------------------------------------------- | ----------------------------------------------- |
| `fin.transaction_pipeline`  | Transaction processing state                        | UNIQUE `(txn_id)`                               |
| `fin.policy_module`         | Registered policy modules                           | UNIQUE `(tenant_id, module_id, module_version)` |
| `fin.policy_evaluation_log` | Immutable policy decision audit (MC-5)              | Indexed by `(txn_id)`                           |
| `fin.smart_default_rule`    | Configurable default resolution rules               | Indexed by `(tenant_id, field_name)`            |
| `fin.exception`             | Policy/funding overrides with time-bounded validity | UNIQUE `(exception_id)`                         |

#### Policy Modules (8 per tenant)

| Module         | Scope                   | Description                                  |
| -------------- | ----------------------- | -------------------------------------------- |
| `POL-SPEND`    | Spending limits         | Amount thresholds by role, OU, and intent    |
| `POL-VENDOR`   | Vendor compliance       | Preferred vendor lists, blacklists           |
| `POL-BUDGET`   | Budget adherence        | FP utilization thresholds                    |
| `POL-CATEGORY` | Category restrictions   | Allowed/blocked expense categories per OU    |
| `POL-SOD`      | Segregation of duties   | Requester != approver, submitter != receiver |
| `POL-TEMPORAL` | Time-based controls     | Blackout periods, fiscal close restrictions  |
| `POL-GEO`      | Geographic restrictions | Country/region compliance rules              |
| `POL-CONTRACT` | Contract compliance     | Contract term adherence                      |

#### Workflow Path Determination

Based on composite risk score (weighted: policy 40%, risk 40%, AI confidence 20%):

| Score Range    | Path            | Action                            |
| -------------- | --------------- | --------------------------------- |
| 0–19           | `ZERO_APPROVAL` | Auto-approve, no human review     |
| 20–59          | `STANDARD`      | Standard approval workflow        |
| 60–79          | `ENHANCED`      | Enhanced multi-level review       |
| 80–99          | `EXECUTIVE`     | Executive-level approval required |
| 100 or BLOCKED | `BLOCKED`       | Reject with remediation guidance  |

---

### 4.4 Budget Engine

**Schema**: `fin` | **Tables**: 3 | **DDL**: `170_budget.sql`
**Runtime**: `framework/runtime/src/services/business/engines/budget-engine/`

#### Purpose

Manages hierarchical funding profiles (budgets) with real-time health monitoring, four lifecycle actions (reserve → commit → consume → release), and predictive exhaustion tracking.

#### Core Concepts

**4-Level Funding Hierarchy**:

```
Level 1: Enterprise Budget (total organizational allocation)
Level 2: Division / Region / Entity (departmental breakdown)
Level 3: OU / Branch (operational unit allocation)
Level 4: Intent (purpose-specific — OPEX, CAPEX, etc.)
```

**Fund Lifecycle Actions**:

| Action    | Trigger                             | Effect on FP                        |
| --------- | ----------------------------------- | ----------------------------------- |
| `RESERVE` | Transaction submitted to pipeline   | +reserved_amount                    |
| `COMMIT`  | PO/Contract approved                | +committed_amount, −reserved_amount |
| `CONSUME` | GRN received or payment made        | +consumed_amount, −committed_amount |
| `RELEASE` | Cancel, partial delivery, or credit | +released_amount                    |

**Available Balance Formula**:

```
available = total_limit − (reserved + committed + consumed − released)
utilization% = (reserved + committed + consumed − released) / total_limit × 100
```

**Health Status** (real-time, configurable thresholds):

| Status   | Default Threshold | Meaning                         |
| -------- | ----------------- | ------------------------------- |
| `GREEN`  | < 75% utilization | Healthy                         |
| `YELLOW` | 75–89%            | Warning — approaching limit     |
| `RED`    | 90–99%            | Critical — near exhaustion      |
| `BLACK`  | ≥ 100%            | Overspent — all actions blocked |

**Trend Analysis**: Compares current vs. previous utilization with 2% significance threshold:

- `IMPROVING`: utilization dropped by > 2%
- `STABLE`: change within ±2%
- `DETERIORATING`: utilization increased by > 2%

#### Tables

| Table                     | Purpose                             | Key Constraint                                       |
| ------------------------- | ----------------------------------- | ---------------------------------------------------- |
| `fin.funding_profile`     | 4-level hierarchical budget master  | UNIQUE `(tenant_id, entity_code, code, fiscal_year)` |
| `fin.funding_transaction` | Immutable action audit trail        | UNIQUE `(idempotency_key)`                           |
| `fin.funding_transfer`    | Cross-FP fund reallocation requests | Indexed by `(from_fp_id, to_fp_id)`                  |

#### Boundary Rules

- **ONLY `FundLifecycleService`** may mutate funding profile amounts directly
- The Commitment Engine emits events; it never writes to `funding_profile`
- Hierarchy validation: a child FP action cannot breach its parent's available balance
- Parent blocked (RED/BLACK) cascades: children cannot accept new RESERVE/COMMIT actions

#### Blueprint-Specific Funding

| Blueprint | Levels Used             | Example Hierarchy                                                       |
| --------- | ----------------------- | ----------------------------------------------------------------------- |
| A, B      | None (funding disabled) | —                                                                       |
| C         | 3                       | Enterprise → Division (Products/Services) → Department                  |
| D         | 4                       | Enterprise → Region (East/West) → Branch (NYC/SF) → Intent (OPEX/CAPEX) |
| E         | 3                       | Enterprise → Branch (ZH/GVA/BSL) → Department                           |
| F         | 4                       | Group → Legal Entity (LE-CA/MY/SA/IN) → Department → Intent             |

---

### 4.5 Commitment Engine

**Schema**: `fin` | **Tables**: 3 | **DDL**: `180_commitment.sql`
**Runtime**: `framework/runtime/src/services/business/engines/commitment-engine/`

#### Purpose

Tracks financial obligations (purchase orders, contracts, subscriptions, leases) through their full lifecycle from draft to fulfillment, including scheduled payments, milestone tracking, and auto-renewal.

#### Core Concepts

**Document Types**: `PR` (Purchase Requisition), `PO` (Purchase Order), `CONTRACT`, `SUBSCRIPTION`, `LEASE`

**Commitment Types**:

- `ONE_TIME` — Single payment/delivery
- `FIXED_RECURRING` — Regular scheduled payments (monthly SaaS, rent)
- `MILESTONE` — Payment upon milestone completion
- `USAGE_BASED` — Variable based on consumption
- `ESCALATING` — Increasing amounts (CPI-linked, step-up)
- `RETENTION_RELEASE` — Holdback released on completion

**Status Lifecycle**:

```
DRAFT → PENDING → ACTIVE → PARTIALLY_FULFILLED → FULFILLED
                         ↘ CANCELLED
                         ↘ EXPIRED
```

**Fulfillment Tracking**:

- `remaining_amount` is a generated column: `total_amount − fulfilled_amount`
- Status auto-transitions: when `fulfilled_amount = total_amount`, status becomes `FULFILLED`

**Auto-Renewal**: Contracts with `auto_renew = true` extend automatically based on `renewal_terms` (interval, escalation formula, CPI linkage, max renewals).

#### Tables

| Table                        | Purpose                           | Key Constraint                                    |
| ---------------------------- | --------------------------------- | ------------------------------------------------- |
| `fin.commitment`             | Obligation master                 | UNIQUE `(tenant_id, entity_code, doc_number)`     |
| `fin.commitment_schedule`    | Payment/delivery schedule entries | UNIQUE `(tenant_id, commitment_id, schedule_seq)` |
| `fin.commitment_fulfillment` | GRN/receipt/payment match records | Indexed by `(commitment_id)`                      |

#### Cross-Engine Integration

- **Budget Engine**: Commitment links to `fp_id` — approval triggers `COMMIT` action on the funding profile
- **Tax Engine**: Tax is calculated on commitment line items
- **Posting Engine**: Fulfillment triggers journal entry creation
- **Event Store**: All lifecycle transitions emit events to `COMMITMENT_FLOW` partition

---

### 4.6 Posting Engine (General Ledger)

**Schema**: `fin` | **Tables**: 8 (GL Core) + 7 (Ledger Dimensions) | **DDL**: `190_posting.sql`, `191_ledger_dimensions.sql`
**Runtime**: `framework/runtime/src/services/business/engines/posting-engine/`

#### Purpose

Implements double-entry bookkeeping with chart of accounts management, fiscal period control, journal entry creation/reversal, and GL balance maintenance.

#### Core Concepts

**Chart of Accounts** — Hierarchical GL account master:

| Account Range | Type           | Normal Balance |
| ------------- | -------------- | -------------- |
| 1000–1999     | ASSET          | DEBIT          |
| 2000–2999     | LIABILITY      | CREDIT         |
| 3000–3999     | EQUITY         | CREDIT         |
| 4000–4999     | REVENUE        | CREDIT         |
| 5000–5999     | EXPENSE (COGS) | DEBIT          |
| 6000–6999     | EXPENSE (OPEX) | DEBIT          |
| 7000–7999     | OTHER INCOME   | CREDIT         |
| 8000–8999     | OTHER EXPENSE  | DEBIT          |
| 9000–9999     | TAX PROVISION  | DEBIT          |

- `is_group = true`: Summary/header account (no direct posting)
- `is_group = false`: Postable leaf account
- `subledger_type`: Links to AP, AR, ASSET, INVENTORY, WIP, or COMMISSION subledger

**Fiscal Period Control**:

```
FUTURE → OPEN → SOFT_CLOSE → HARD_CLOSE
```

- `OPEN`: All postings allowed
- `SOFT_CLOSE`: Only reversals allowed
- `HARD_CLOSE`: No modifications (final)

**Double-Entry Validation** (enforced at both application and database level):

- `CHECK (total_debit = total_credit)` on `journal_entry`
- `CHECK (NOT (debit_amount > 0 AND credit_amount > 0))` on `journal_line` — each line is single-sided
- Minimum 2 lines per journal entry

**Accounting Profiles** — Hidden posting intelligence:

- Maps business intents + categories to multi-line GL posting patterns
- Example: AP-OPEX profile → Dr 6100 (OpEx), Cr 2110 (Accounts Payable)
- 4 base profiles (all blueprints) + 2 extended (C/D/E/F): `AP-OPEX`, `AP-CAPEX`, `AP-TRAVEL`, `AP-VENDOR-PMT`, `AP-INTERCOMPANY`, `AP-DEPRECIATION`

#### Tables

| Table                    | Purpose                                   | Key Constraint                                                                                                        |
| ------------------------ | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `fin.chart_of_accounts`  | GL account master                         | UNIQUE `(tenant_id, entity_code, account_code)`                                                                       |
| `fin.cost_center`        | Cost allocation dimension (legacy)        | UNIQUE `(tenant_id, entity_code, code)` — superseded by `dimension_value`                                             |
| `fin.profit_center`      | Revenue/P&L reporting dimension (legacy)  | UNIQUE `(tenant_id, entity_code, code)` — superseded by `dimension_value`                                             |
| `fin.fiscal_period`      | Period open/close control                 | UNIQUE `(tenant_id, entity_code, fiscal_year, period_number)`                                                         |
| `fin.accounting_profile` | GL posting pattern templates              | UNIQUE `(tenant_id, entity_code, code)`                                                                               |
| `fin.journal_entry`      | Journal entry headers                     | UNIQUE `(tenant_id, entity_code, je_number)`                                                                          |
| `fin.journal_line`       | Journal entry line items                  | UNIQUE `(tenant_id, je_id, line_no)`                                                                                  |
| `fin.gl_balance`         | Denormalized period balances (projection) | UNIQUE composite on `(tenant_id, entity_code, account_id, fiscal_year, period_number, cost_center_id, currency_code)` |

#### Universal Ledger Dimension Tables (v2.3)

| Table                          | Purpose                                              | Key Constraint                                                |
| ------------------------------ | ---------------------------------------------------- | ------------------------------------------------------------- |
| `fin.dimension_type`           | Registry of dimension kinds per tenant (with `source_kind`) | UNIQUE `(tenant_id, entity_code, code)`                |
| `fin.dimension_value`          | Internal master data (lifecycle: ACTIVE/INACTIVE/BLOCKED/ARCHIVED) | UNIQUE `(tenant_id, entity_code, dimension_type_id, code)` |
| `fin.dimension_policy`         | Governance rules (policy module pattern, 6 behaviors) | UNIQUE `(tenant_id, entity_code, policy_code, policy_version)` |
| `fin.dimension_set`            | Hash-normalized dimension combinations (deduplication) | UNIQUE `(tenant_id, entity_code, set_hash)`              |
| `fin.dimension_set_item`       | Individual members of a dimension set (immutable)     | UNIQUE `(dimension_set_id, dimension_type_id)`                |
| `fin.ou_dimension_default`     | Default dimension values per OU                       | UNIQUE `(tenant_id, entity_code, ou_id, dimension_type_id)`  |
| `fin.document_line_dimension`  | Dimension capture at document entry (header vs line)  | UNIQUE `(tenant_id, doc_type, doc_line_id, dimension_type_id)` |

**Schema Extensions** (ALTER TABLE on existing tables):
- `fin.journal_line.dimension_set_id` — each JE line resolves to one canonical dimension set
- `fin.gl_balance.dimension_set_id` — balance grain keyed by dimension set (NULL = undimensioned)
- `fin.transaction_pipeline.resolved_dimension_set_id` — frozen dimension snapshot in `txn.finalized`
- `fin.transaction_pipeline.dimension_derivation_log` — JSONB audit trail of how each dimension was resolved

**Dimension Set Normalization** — The key scalability pattern:
- A journal line resolves to one canonical `dimension_set` via `fin.resolve_dimension_set()`
- The set is SHA-256 hash-normalized by sorted `(dimension_type_id, dimension_value_id)` pairs
- Identical combinations reuse the same `set_id` — no duplication
- `gl_balance` stores one row per `(account, period, dimension_set_id, currency)` — no row explosion
- Same principle used in SAP Universal Journal, Oracle GL Segments, NetSuite Custom Segments

**Source-Aware Dimension Types** (`dimension_type.source_kind`):
- `INTERNAL` — values mastered in `fin.dimension_value` (Cost Center, Profit Center, Project)
- `EXTERNAL_ENTITY` — values reference external master tables (Fund → `fin.funding_profile`)
- `DERIVED` — values computed from context (Region derived from OU geography)
- `SYSTEM` — values managed by platform (Intercompany Partner from Federation Engine)

**System-Seeded Dimension Types**: `COST_CENTER`, `PROFIT_CENTER` (migrate existing data)

**Blueprint-Specific Dimension Types**:

| Blueprint | Dimension Types                                  |
| --------- | ------------------------------------------------ |
| A         | Cost Center, Profit Center                       |
| B         | Cost Center, Profit Center                       |
| C         | Cost Center, Profit Center, **Project**          |
| D         | Cost Center, Profit Center, **Region** (DERIVED), **Function** |
| E         | Cost Center, Profit Center, **Location**         |
| F         | Cost Center, Profit Center, **Segment**, **Intercompany** (SYSTEM) |

**Dimension Policy Engine** — Governance module (not passive rule table):

| Behavior             | Description                                             |
| -------------------- | ------------------------------------------------------- |
| `REQUIRED`           | Must be provided on matching lines                      |
| `OPTIONAL`           | Can be provided                                         |
| `FORBIDDEN`          | Must NOT be provided (e.g., PC on balance sheet control)|
| `DERIVE_IF_MISSING`  | Auto-derive from context (`ou_default`, `intent_mapping`, `federation_context`) |
| `INHERIT_FROM_HEADER`| Inherit from document header default                    |
| `FIXED_VALUE`        | Always use a specific dimension value                   |

Policy scope supports: `scope_account_type`, `scope_account_code`, `scope_account_range_lo/hi`, `scope_subledger_type`, `scope_ou_id`, `scope_intent_code`, `scope_doc_type`, `scope_domain`. Also supports dependency (`depends_on_type_id`) and mutual exclusion (`mutually_exclusive_with`).

**Header Defaults, Line-Level Authority**:
- Document header/OU carries suggested/default dimension context
- Final posting authority is at line level
- Posting Engine resolves and freezes `dimension_set_id` at JE line creation

#### Posting Flow

```
Smart Default Engine (SMART_DEFAULTS step):
  OU + Intent + document context
    → ou_dimension_default lookup
    → dimension_policy evaluation (DERIVE_IF_MISSING, INHERIT_FROM_HEADER)
    → candidate dimension values attached to txn context

Finalization (FINALIZATION step):
  DimensionPolicyEngine.validate(lines, policies)
    → enforce REQUIRED/FORBIDDEN/dependency/combination constraints
    → resolve_dimension_set() → canonical dimension_set_id
    → txn.resolved_dimension_set_id frozen on transaction_pipeline

Posting Engine:
  AccountingProfileResolver.resolve(intent, category)
    → PostingService.createAndPost(lines)
      → DoubleEntryValidator.validate(lines) — must balance
      → PeriodControl.canPost(date) — must be OPEN
      → JournalEntryRepo.create(je + lines) — with dimension_set_id per line
      → GLBalanceService.updateBalances(lines) — by dimension_set_id grain
      → EventPublisher.publish("posting.created")
```

---

### 4.7 Tax Engine

**Schema**: `fin` | **Tables**: 4 | **DDL**: `195_tax.sql`
**Runtime**: `framework/runtime/src/services/business/engines/tax-engine/`

#### Purpose

Calculates taxes per transaction based on jurisdiction, effective date, and tax type. Supports VAT, GST, sales tax, withholding tax, excise, and customs with input credit tracking.

#### Core Concepts

**Tax Types**: `VAT`, `GST`, `SALES_TAX`, `WHT` (withholding), `EXCISE`, `CUSTOMS`

**Jurisdiction Hierarchy** (for nested tax regimes):

```
COUNTRY → STATE → CITY → SPECIAL_ZONE
```

Example: Switzerland has CH-FTA (country) → CH-ZH, CH-GVA, CH-BSL (cantonal/state)

**Tax Scoping Rule**: Tax tables are **tenant-scoped** (no `entity_code` column). For multi-entity tenants (Blueprint F), all country jurisdictions are seeded under the single tenant. Runtime resolution uses `legal_entity.country_code → tax_jurisdiction.country_code`.

**Tax Calculation**:

```
tax_amount = base_amount × (rate / 100)
```

Features: effective date ranges, reverse charge, treaty rates (for cross-border WHT), input credit eligibility, category-based filtering.

#### Tables

| Table                   | Purpose                                    | Key Constraint                                                                 |
| ----------------------- | ------------------------------------------ | ------------------------------------------------------------------------------ |
| `fin.tax_jurisdiction`  | Tax authority registry                     | UNIQUE `(tenant_id, code)`                                                     |
| `fin.tax_rate`          | Time-dependent tax rates                   | UNIQUE `(tenant_id, jurisdiction_id, tax_code, effective_from)`                |
| `fin.tax_calculation`   | Computed tax per transaction (audit trail) | Indexed by `(tenant_id, txn_id)`                                               |
| `fin.tax_credit_ledger` | Input tax credit tracking per period       | UNIQUE `(tenant_id, entity_code, jurisdiction_id, fiscal_year, period_number)` |

#### Country-Specific Tax Regimes (Seeded)

| Country | Regime                             | Key Rates                                                      |
| ------- | ---------------------------------- | -------------------------------------------------------------- |
| MY      | SST (Sales & Services Tax)         | Services 6%, Goods 10%                                         |
| IN      | GST (Central + State + Integrated) | 5%, 12%, 18%, 28% slabs                                        |
| SA      | ZATCA VAT                          | Standard 15%, Zero 0%                                          |
| QA      | No VAT                             | Demo placeholder 0%                                            |
| FR      | TVA (French VAT)                   | Normal 20%, Reduced 5.5%, Intermediate 10%, Super-reduced 2.1% |
| DE      | MwSt (German VAT)                  | Standard 19%, Reduced 7%                                       |
| CH      | MWST (Swiss VAT)                   | Standard 8.1%, Reduced 2.6%, Hotel 3.8%                        |
| US      | State Sales Tax only               | NY 8%, CA 7.25%, WA 6.5%, GA 4% (no federal)                   |
| CA      | GST/HST + subsidiary jurisdictions | Federal GST 5%, Ontario HST 13% + MY/SA/IN rates               |

---

### 4.8 Asset Lifecycle Engine

**Schema**: `fin` | **Tables**: 4 | **DDL**: `161_asset.sql`
**Runtime**: `framework/runtime/src/services/business/engines/asset-engine/`

#### Purpose

Manages the complete lifecycle of fixed assets from acquisition through depreciation to disposal, with multi-book support for different reporting purposes.

#### Core Concepts

**Asset Classes**: `LAND`, `BUILDING`, `MACHINERY`, `VEHICLE`, `FURNITURE`, `IT_EQUIPMENT`, `INTANGIBLE`, `LEASED`

**Asset Status Lifecycle**:

```
WIP → CAPITALIZED → ACTIVE → IMPAIRED → RETIRED → DISPOSED
```

**Multi-Book Depreciation** — Each asset maintains separate depreciation schedules:

| Book         | Purpose                                                        |
| ------------ | -------------------------------------------------------------- |
| `STATUTORY`  | Financial reporting (IFRS/local GAAP)                          |
| `TAX`        | Tax authority requirements (potentially different method/life) |
| `MANAGEMENT` | Internal management reporting                                  |
| `INSURANCE`  | Insurance valuation                                            |

**Depreciation Methods**:

| Method                | Formula                                        | Use Case                  |
| --------------------- | ---------------------------------------------- | ------------------------- |
| `STRAIGHT_LINE`       | (Cost − Residual) / Life                       | Most common               |
| `REDUCING_BALANCE`    | NBV × (1/Life) per period                      | Declining value assets    |
| `UNITS_OF_PRODUCTION` | (Cost − Residual) / Total Units × Period Units | Usage-based               |
| `ACCELERATED`         | Double declining balance                       | Front-loaded depreciation |
| `MACRS`               | IRS half-year convention tables                | US tax depreciation       |

**Generated Column**: `net_book_value = cost_basis − accumulated_depreciation`

#### Tables

| Table                   | Purpose                                                        | Key Constraint                                                    |
| ----------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------- |
| `fin.asset`             | Fixed asset register                                           | UNIQUE `(tenant_id, entity_code, asset_number)`                   |
| `fin.asset_book`        | Multi-book depreciation schedules                              | UNIQUE `(tenant_id, asset_id, book_type)`                         |
| `fin.asset_transaction` | Lifecycle event log (capitalize, depreciate, revalue, dispose) | Indexed by `(asset_id, book_type)`                                |
| `fin.depreciation_run`  | Batch depreciation execution records                           | Indexed by `(entity_code, book_type, fiscal_year, period_number)` |

---

### 4.9 Inventory Subledger Engine

**Schema**: `fin` | **Tables**: 7 | **DDL**: `162_inventory.sql`
**Runtime**: `framework/runtime/src/services/business/engines/inventory-engine/`

#### Purpose

Full inventory management with five valuation methods, lot/serial tracking, warehouse management, physical counts, and variance analysis.

#### Core Concepts

**Valuation Methods**:

| Method         | Description                                                |
| -------------- | ---------------------------------------------------------- |
| `FIFO`         | First In, First Out — oldest layers consumed first         |
| `LIFO`         | Last In, First Out — newest layers consumed first          |
| `WEIGHTED_AVG` | Average cost of all layers                                 |
| `STANDARD`     | Pre-determined standard cost; variances tracked separately |
| `SPECIFIC`     | Specific lot/serial identification                         |

**Movement Types**: `RECEIPT`, `ISSUE_SALES`, `ISSUE_PRODUCTION`, `TRANSFER_OUT`, `TRANSFER_IN`, `ADJUSTMENT`, `SCRAP`, `RETURN`

**Valuation Layers**: Each receipt creates a new layer; issues consume layers per the item's valuation method. Layer tracking enables accurate COGS calculation and inventory valuation.

**Generated Column**: `total_value = quantity_on_hand × unit_cost`

#### Tables

| Table                           | Purpose                                               | Key Constraint                                       |
| ------------------------------- | ----------------------------------------------------- | ---------------------------------------------------- |
| `fin.warehouse`                 | Warehouse/location master                             | UNIQUE `(tenant_id, entity_code, code)`              |
| `fin.item_master`               | Item configuration (valuation method, reorder points) | UNIQUE `(tenant_id, entity_code, product_id)`        |
| `fin.inventory_balance`         | Current stock by location/lot/serial                  | UNIQUE composite including lot/serial                |
| `fin.inventory_movement`        | Movement audit log                                    | Indexed by `(item_id, warehouse_id, movement_type)`  |
| `fin.inventory_valuation_layer` | FIFO/LIFO layer tracking                              | Indexed by `(item_id, warehouse_id, remaining_qty)`  |
| `fin.stocktake`                 | Physical count headers                                | Indexed by `(warehouse_id, status)`                  |
| `fin.stocktake_line`            | Physical count line items with variance               | Generated: `variance_qty = counted_qty − system_qty` |

---

### 4.10 Commission Engine

**Schema**: `fin` | **Tables**: 4 | **DDL**: `163_commission.sql`
**Runtime**: `framework/runtime/src/services/business/engines/commission-engine/`

#### Purpose

Manages commission plans, partner assignments, calculation, accrual, settlement, and clawback for employees, agents, resellers, and affiliates.

#### Core Concepts

**Plan Types**: `FLAT_RATE`, `TIERED`, `PERCENTAGE`, `FORMULA`

**Base Metrics**: `REVENUE`, `GROSS_MARGIN`, `NET_PROFIT`, `QUANTITY`

**Partner Types**: `EMPLOYEE`, `AGENT`, `RESELLER`, `AFFILIATE`

**Commission Lifecycle**:

```
CALCULATED → ACCRUED → APPROVED → SETTLED
                                    ↘ CLAWED_BACK (within clawback window)
```

**Clawback**: Configurable window (days) with triggers (churn, return, contract breach). Clawback creates a reversal journal entry.

**Split Commissions**: Multiple partners can share commission on a deal via `split_pct` (sum can exceed 100% for overlapping territories).

#### Tables

| Table                        | Purpose                                            | Key Constraint                                            |
| ---------------------------- | -------------------------------------------------- | --------------------------------------------------------- |
| `fin.commission_plan`        | Plan definitions (tiers, formulas, clawback rules) | UNIQUE `(tenant_id, entity_code, code)`                   |
| `fin.commission_assignment`  | Partner-to-plan assignments                        | UNIQUE `(tenant_id, partner_id, plan_id, effective_from)` |
| `fin.commission_calculation` | Individual calculation records with GL references  | Indexed by `(partner_id, status)`                         |
| `fin.commission_statement`   | Periodic partner statements                        | Indexed by `(partner_id, period_start, period_end)`       |

---

### 4.11 Federation Engine

**Schema**: `fin` | **Tables**: 7 | **DDL**: `164_federation.sql`
**Runtime**: `framework/runtime/src/services/business/engines/federation-engine/`

#### Purpose

Manages multi-entity corporate structures including legal entities, intercompany transactions, transfer pricing, FX management, consolidation, and netting.

#### Core Concepts

**Legal Entity Types**: `PARENT`, `SUBSIDIARY`, `ASSOCIATE`, `JOINT_VENTURE`, `BRANCH`

**Consolidation Methods**: `FULL` (100% line-by-line), `PROPORTIONAL` (ownership %), `EQUITY` (single-line), `NONE`

**Intercompany Agreement Types**: `GOODS`, `SERVICES`, `LOAN`, `ROYALTY`, `MANAGEMENT_FEE`

**Transfer Pricing Methods** (OECD-aligned):

- `CUP` — Comparable Uncontrolled Price
- `RESALE_MINUS` — Resale Price minus margin
- `COST_PLUS` — Cost plus markup
- `TNMM` — Transactional Net Margin Method
- `PROFIT_SPLIT` — Split profits by contribution

**IC Transaction Lifecycle**:

```
CREATED → MIRRORED → PRICED → POSTED → NETTED → SETTLED
```

**FX Rate Types**: `SPOT`, `PERIOD_AVG`, `PERIOD_END`, `BUDGET`

**Consolidation Eliminations**:

- `IC_REVENUE_EXPENSE` — Eliminate IC sales/COGS
- `IC_RECEIVABLE_PAYABLE` — Eliminate IC balances
- `IC_PROFIT` — Eliminate unrealized IC profit
- `MINORITY_INTEREST` — Calculate minority share
- `INVESTMENT` — Eliminate investment in subsidiaries

#### Tables

| Table                           | Purpose                  | Key Constraint                                            |
| ------------------------------- | ------------------------ | --------------------------------------------------------- |
| `fin.legal_entity`              | Legal entity registry    | UNIQUE `(tenant_id, code)`                                |
| `fin.intercompany_agreement`    | IC trading relationships | UNIQUE `(tenant_id, source, dest, agreement_type)`        |
| `fin.intercompany_transaction`  | IC transaction pairs     | Indexed by `(source_entity, dest_entity)`                 |
| `fin.fx_rate`                   | Exchange rate table      | UNIQUE `(tenant_id, from, to, rate_type, effective_date)` |
| `fin.fx_revaluation`            | Unrealized FX gain/loss  | Indexed by `(entity_code, fiscal_year, period)`           |
| `fin.consolidation_elimination` | IC elimination entries   | Indexed by `(fiscal_year, period_number)`                 |
| `fin.netting_batch`             | IC netting batches       | Indexed by `(status)`                                     |

#### Blueprint F Configuration (demo_ca)

| Entity | Country      | Functional | Reporting | Type       | Ownership |
| ------ | ------------ | ---------- | --------- | ---------- | --------- |
| LE-CA  | Canada       | CAD        | CAD       | PARENT     | —         |
| LE-MY  | Malaysia     | MYR        | CAD       | SUBSIDIARY | 100%      |
| LE-SA  | Saudi Arabia | SAR        | CAD       | SUBSIDIARY | 100%      |
| LE-IN  | India        | INR        | CAD       | SUBSIDIARY | 100%      |

**IC Agreements**: LE-MY→LE-SA (Services, Cost+10%), LE-SA→LE-IN (Goods, CUP), LE-MY→LE-IN (Management Fee, Cost+5%)

---

### 4.12 Production Engine

**Schema**: `fin` | **Tables**: 7 | **DDL**: `165_production.sql`
**Runtime**: `framework/runtime/src/services/business/engines/production-engine/`

#### Purpose

Manages manufacturing processes including bills of materials, routing operations, work orders, WIP cost accumulation, and production variance analysis.

#### Core Concepts

**BOM (Bill of Materials)** — Multi-level recursive structure:

- `phantom` components are exploded through (not separately inventoried)
- Scrap percentage allowances per component
- Version control with effective dates

**Routing Operations** — Manufacturing steps:

- Setup time + run time per operation
- Labor rate + overhead rate per work center
- Sequential operation ordering

**Work Order Status**:

```
PLANNED → RELEASED → IN_PROGRESS → COMPLETED → CLOSED
```

**WIP Cost Accumulation** (3 cost types):

- `MATERIAL` — Components consumed (from Inventory Engine)
- `LABOR` — Direct labor hours × rate
- `OVERHEAD` — Applied manufacturing overhead

**Variance Analysis** (at work order close):

| Variance     | Formula                                         | Description               |
| ------------ | ----------------------------------------------- | ------------------------- |
| `PRICE`      | (Actual Price − Standard Price) × Actual Qty    | Material price variance   |
| `USAGE`      | (Actual Qty − Standard Qty) × Standard Price    | Material usage variance   |
| `RATE`       | (Actual Rate − Standard Rate) × Actual Hours    | Labor rate variance       |
| `EFFICIENCY` | (Actual Hours − Standard Hours) × Standard Rate | Labor efficiency variance |
| `VOLUME`     | Planned − Applied overhead                      | Overhead volume variance  |

**Generated Column**: `variance = actual_amount − planned_amount` on `work_order_cost`

#### Tables

| Table                           | Purpose                      | Key Constraint                                               |
| ------------------------------- | ---------------------------- | ------------------------------------------------------------ |
| `fin.bill_of_materials`         | BOM headers (versioned)      | UNIQUE `(tenant_id, entity_code, product_id, version)`       |
| `fin.bom_line`                  | BOM components               | UNIQUE `(tenant_id, bom_id, line_no)`                        |
| `fin.routing`                   | Manufacturing operations     | UNIQUE `(tenant_id, entity_code, product_id, operation_seq)` |
| `fin.work_order`                | Production orders            | UNIQUE `(tenant_id, entity_code, wo_number)`                 |
| `fin.work_order_cost`           | WIP cost accumulation        | Indexed by `(work_order_id)`                                 |
| `fin.work_order_material_issue` | Material consumption records | Indexed by `(work_order_id)`                                 |
| `fin.production_variance`       | Variance analysis at close   | Indexed by `(work_order_id)`                                 |

---

### 4.13 Atlas AI Engine

**Schema**: `fin` | **Tables**: 4 | **DDL**: `166_atlas_ai.sql`
**Runtime**: `framework/runtime/src/services/business/engines/atlas-ai/`

#### Purpose

Provides AI/ML-powered predictions, recommendations, anomaly detection, and autonomous actions for all financial engines, with model lifecycle management and drift monitoring.

#### Core Concepts

**Autonomy Levels**:

| Level | Name            | Behavior                                                          |
| ----- | --------------- | ----------------------------------------------------------------- |
| `L1`  | Recommended     | Propose action; human decides                                     |
| `L2`  | Semi-Autonomous | Auto-execute with mandatory review within reversal window         |
| `L3`  | Full Autonomous | Execute immediately if confidence ≥ 95%; reversible within window |

**Model Types**: `CLASSIFICATION`, `REGRESSION`, `ANOMALY`, `RECOMMENDATION`, `NLP`

**Prediction Types**: `RECOMMENDATION`, `ANOMALY`, `CLASSIFICATION`, `FORECAST`

**Action Lifecycle**:

```
PROPOSED → EXECUTED → REVERSED (within reversal window)
                    → REJECTED (by human)
```

**Auto-execute threshold**: Confidence ≥ 0.95 (95%)
**Default reversal window**: 60 minutes

**Drift Monitoring** — Continuous model health tracking:

- Feature drift score (input distribution shift)
- Prediction drift score (output behavior change)
- Data quality score
- Automatic alert generation when thresholds breached
- Retraining recommendation triggers

#### Tables

| Table                   | Purpose                       | Key Constraint                                    |
| ----------------------- | ----------------------------- | ------------------------------------------------- |
| `fin.ai_model_registry` | Deployed ML model registry    | UNIQUE `(tenant_id, model_code, model_version)`   |
| `fin.ai_prediction`     | Prediction/recommendation log | Indexed by `(model_id, txn_id)`                   |
| `fin.ai_action`         | Autonomous action log (L2/L3) | Indexed by `(status, reversal_window_expires_at)` |
| `fin.ai_drift_monitor`  | Model bias/drift monitoring   | Indexed by `(model_id, monitoring_date)`          |

---

### 4.14 Period Close Governance Engine

**Schema**: `fin` | **Tables**: 2 | **DDL**: `191_period_close_governance.sql`
**Runtime**: `framework/runtime/src/services/business/engines/posting-engine/domain/period-close-governance.ts`

#### Purpose

Implements an orchestrated financial close process that prevents premature period closure and ensures audit compliance. Gates period transitions (`OPEN → SOFT_CLOSE → HARD_CLOSE`) on completion of mandatory close tasks, with waiver governance, evidence capture, and support for manual, system-validated, and hybrid task completion modes.

#### Core Concepts

**Close Task Catalogue** — Master task templates per (tenant, entity_code):

Each task declares:
- **Gate**: Which period transition it blocks (`SOFT_CLOSE` or `HARD_CLOSE`)
- **Mandatory/Waivable**: Whether the task can be waived and under what conditions
- **Completion Mode**: `MANUAL` (user-attested), `SYSTEM` (auto-validated by handler), or `HYBRID` (system-assisted, user-confirmed)
- **Blueprint Filter**: Which tenant tiers include this task (null = all)

**Checklist Materialization** — When a period transitions `FUTURE → OPEN`, the runtime calls `fin.materialize_close_checklist()` to stamp one checklist row per active task template. This gives the ops team immediate visibility into the full close plan. The function is idempotent (safe to call multiple times).

**Checklist Status Lifecycle**:

```
PENDING → IN_PROGRESS → COMPLETED
                      → WAIVED (with governance)
                      → FAILED (system validation failure)
                      → BLOCKED (upstream dependency)

BLOCKED → PENDING → IN_PROGRESS (unblocked, retried)
FAILED  → IN_PROGRESS → ... (retried after investigation)
```

**Status Semantics** (drives dashboard treatment and escalation):

| Status        | Meaning                                                                 |
| ------------- | ----------------------------------------------------------------------- |
| `PENDING`     | Task not yet started                                                    |
| `IN_PROGRESS` | Work underway (manual attestation or system check running)              |
| `COMPLETED`   | Task executed and passed; evidence captured                             |
| `WAIVED`      | Intentionally bypassed with governance (reason + optional approval ref) |
| `FAILED`      | Task **executed/validated and did NOT pass** (e.g., trial balance imbalanced, AR recon mismatch). Requires retry or investigation. |
| `BLOCKED`     | Task **cannot be attempted** — prerequisite or upstream dependency missing. Differs from FAILED: the task was never executed. |

**Transition Gating** — Period cannot advance past a gate until all mandatory checklist items for that gate are COMPLETED or WAIVED:

```
OPEN ──→ SOFT_CLOSE
         Gate: AR_RECON, AP_RECON, INV_VALUATION, ASSET_DEPRECIATION,
               BANK_RECON, TRIAL_BALANCE, TAX_PROVISION, ...

         SOFT_CLOSE ──→ HARD_CLOSE
                        Gate: MGMT_SIGNOFF
```

**Waiver Governance** — Controlled bypass for exceptional situations:

| Task Field                 | Purpose                                         |
| -------------------------- | ----------------------------------------------- |
| `is_waivable`              | Whether the task permits waivers at all          |
| `waiver_requires_approval` | Whether a waiver needs an approval reference     |
| `waiver_reason_required`   | Whether a textual justification is mandatory     |

Checklist waiver fields: `waived_by`, `waived_at`, `waiver_reason`, `waiver_approval_ref`

**Evidence Capture** — Audit-grade completion records:

| Checklist Field      | Purpose                                                   |
| -------------------- | --------------------------------------------------------- |
| `completion_notes`   | Free-text explanation of what was done                    |
| `evidence_payload`   | JSONB — batch IDs, JE refs, report hashes, recon numbers |
| `failure_reason`     | Why a system check failed                                 |

**Standard Close Tasks** (blueprint-scaled):

| Task Code            | Category       | Gate         | Mode   | Blueprints | Description                                          |
| -------------------- | -------------- | ------------ | ------ | ---------- | ---------------------------------------------------- |
| `AR_RECON`           | SUBLEDGER      | SOFT_CLOSE   | HYBRID | All        | AR subledger to GL reconciliation                    |
| `AP_RECON`           | SUBLEDGER      | SOFT_CLOSE   | HYBRID | All        | AP subledger to GL reconciliation                    |
| `INV_VALUATION`      | SUBLEDGER      | SOFT_CLOSE   | HYBRID | C+         | Inventory valuation check                            |
| `ASSET_DEPRECIATION` | SUBLEDGER      | SOFT_CLOSE   | SYSTEM | C+         | Period depreciation run                              |
| `WIP_CLEARANCE`      | SUBLEDGER      | SOFT_CLOSE   | HYBRID | D+         | WIP account clearance                                |
| `COMMISSION_ACCRUAL` | SUBLEDGER      | SOFT_CLOSE   | HYBRID | D+         | Commission accrual/settlement                        |
| `BANK_RECON`         | CASH           | SOFT_CLOSE   | HYBRID | All        | Bank reconciliation completion                       |
| `IC_ELIMINATION`     | CONSOLIDATION  | SOFT_CLOSE   | SYSTEM | E+         | Intercompany elimination entries                     |
| `FX_REVALUATION`     | CONSOLIDATION  | SOFT_CLOSE   | SYSTEM | D+         | FX revaluation at period-end rates                   |
| `TAX_PROVISION`      | TAX            | SOFT_CLOSE   | HYBRID | C+         | Tax provision calculation                            |
| `REVENUE_RECOGNITION`| REVENUE        | SOFT_CLOSE   | MANUAL | D+         | Revenue recognition cutoff (ASC 606 / IFRS 15)       |
| `ACCRUAL_REVERSAL`   | ADJUSTMENTS    | SOFT_CLOSE   | SYSTEM | C+         | Auto-reverse prior period accruals                   |
| `TRIAL_BALANCE`      | VALIDATION     | SOFT_CLOSE   | SYSTEM | All        | Trial balance validation (debits = credits)          |
| `CUTOFF_REVIEW`      | VALIDATION     | SOFT_CLOSE   | MANUAL | C+         | Revenue/expense cutoff verification                  |
| `MGMT_SIGNOFF`       | APPROVAL       | HARD_CLOSE   | MANUAL | All        | Controller/CFO sign-off                              |

#### Tables

| Table                        | Purpose                                  | Key Constraint                                                                 |
| ---------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------ |
| `fin.period_close_task`      | Master catalogue of close tasks          | UNIQUE `(tenant_id, entity_code, task_code)`                                   |
| `fin.period_close_checklist` | Per-period checklist instances            | UNIQUE `(tenant_id, entity_code, fiscal_year, period_number, task_code)`, FK to `fin.fiscal_period` |

#### Database Functions

| Function                           | Purpose                                                    |
| ---------------------------------- | ---------------------------------------------------------- |
| `fin.check_close_gate()`           | Returns gate pass/fail + blocking task list for a transition |
| `fin.get_close_progress()`         | Dashboard summary: counts by status + completion percentage |
| `fin.materialize_close_checklist()`| Populate checklist from task catalogue (idempotent)         |

#### Runtime Integration

The `canTransitionPeriod()` function in `period-control.ts` combines the basic state machine check with the checklist gate:

```
PeriodCloseChecklistRepo.checkGate(targetStatus)
  → canTransitionPeriod(current, target, gateResult)
    → isValidPeriodTransition(current, target)   — state machine
    → evaluateGate(gateResult, target)           — checklist gate
```

The `getTransitionSideEffects()` function signals the caller to materialize the checklist when a period opens:

```
getTransitionSideEffects("OPEN")
  → { materializeChecklist: true }
  → caller invokes PeriodCloseChecklistRepo.materialize()
```

Domain functions in `period-close-governance.ts`:

| Function                     | Purpose                                            |
| ---------------------------- | -------------------------------------------------- |
| `isValidChecklistTransition` | Validate checklist task status change               |
| `canWaiveTask`               | Check waiver eligibility against governance rules   |
| `canCompleteTask`            | Validate completion requirements                    |
| `canFailTask`                | Validate failure transition + reason required       |
| `canBlockTask`               | Validate block transition                           |
| `isGatedTransition`          | Whether a period target status requires gate check  |
| `evaluateGate`               | Evaluate gate result and produce descriptive error  |

#### Service Layer (Phase 2)

`DefaultPeriodCloseService` implements the full period close workflow:

| Method                  | Purpose                                                        |
| ----------------------- | -------------------------------------------------------------- |
| `materializeChecklist`  | Stamp checklist rows from task catalogue (idempotent)          |
| `getChecklist`          | List all checklist items for a period                          |
| `getProgress`           | Dashboard summary: counts by status + completion %             |
| `completeTask`          | Mark task COMPLETED with evidence capture                      |
| `waiveTask`             | Waive task with governance checks (reason, approval ref)       |
| `failTask`              | Mark task FAILED with failure reason                           |
| `blockTask`             | Mark task BLOCKED (upstream dependency missing)                |
| `executeSystemHandler`  | Dispatch SYSTEM/HYBRID task to registered handler              |
| `checkTransitionGate`   | Evaluate gate readiness for SOFT_CLOSE or HARD_CLOSE           |
| `transitionPeriod`      | Gate-enforced period transition with structured denial response |

**Structured Gate Denial** — When `transitionPeriod()` is blocked by incomplete tasks, the error includes a `GateDenialResponse`:

```typescript
interface GateDenialResponse {
  targetStatus: "SOFT_CLOSE" | "HARD_CLOSE";
  gatePassed: false;
  pendingCount: number;
  pendingTasks: GateDenialDetail[];
}
interface GateDenialDetail {
  taskCode: string;
  taskName: string;
  taskStatus: ChecklistTaskStatus;
  category: CloseTaskCategory;
  completionMode: CloseTaskCompletionMode;
  assignedTo: string | null;
}
```

**System Handler Registry** — `CloseHandlerRegistry` dispatches SYSTEM/HYBRID tasks to registered `CloseHandler` implementations:

```
CloseHandler.execute(ctx, { entityCode, fiscalYear, periodNumber })
  → { passed: boolean; message: string; evidence: Record<string, unknown> }
```

Handlers are registered in the accounting module's DI container and invoked via the `executeSystemHandler` endpoint.

#### API Endpoints (Phase 2)

| Method | Path                                                              | Handler                    | Purpose                      |
| ------ | ----------------------------------------------------------------- | -------------------------- | ---------------------------- |
| GET    | `/api/fin/period-close/:fy/:pn/checklist`                         | `GetCloseChecklist`        | List checklist items         |
| GET    | `/api/fin/period-close/:fy/:pn/progress`                          | `GetCloseProgress`         | Dashboard progress summary   |
| POST   | `/api/fin/period-close/:fy/:pn/materialize`                       | `MaterializeChecklist`     | Stamp checklist from catalogue |
| POST   | `/api/fin/period-close/:fy/:pn/tasks/:taskCode/complete`          | `CompleteTask`             | Complete a task              |
| POST   | `/api/fin/period-close/:fy/:pn/tasks/:taskCode/waive`             | `WaiveTask`                | Waive a task                 |
| POST   | `/api/fin/period-close/:fy/:pn/tasks/:taskCode/fail`              | `FailTask`                 | Fail a task                  |
| POST   | `/api/fin/period-close/:fy/:pn/tasks/:taskCode/block`             | `BlockTask`                | Block a task                 |
| POST   | `/api/fin/period-close/:fy/:pn/tasks/:taskCode/execute`           | `ExecuteSystemHandler`     | Run system handler           |
| GET    | `/api/fin/period-close/:fy/:pn/gate/:targetStatus`                | `CheckGate`                | Check gate readiness         |
| POST   | `/api/fin/period-close/:fy/:pn/transition`                        | `TransitionPeriod`         | Gate-enforced transition     |

**Error code → HTTP status mapping:**

| HTTP | Error Codes                                      | Semantics               |
| ---- | ------------------------------------------------ | ----------------------- |
| 400  | `MISSING_REASON`, `MISSING_TARGET`, `INVALID_TARGET` | Malformed input     |
| 403  | `WAIVER_DENIED`                                  | Authorization denied    |
| 404  | `*_NOT_FOUND`                                    | Resource not found      |
| 409  | `INVALID_TRANSITION`                             | State machine conflict  |
| 422  | `NOT_SYSTEM_TASK`, `NO_HANDLER`, `GATE_DENIED`   | Business rule violation |
| 501  | `HANDLER_NOT_REGISTERED`                         | Not implemented         |

**Structured gate denial** — When `GATE_DENIED`, the error `details.gateDenial` contains a `GateDenialResponse` with per-task `GateDenialDetail` entries. Each detail includes:

| Field            | Type                      | Purpose                                      |
| ---------------- | ------------------------- | -------------------------------------------- |
| `reasonCode`     | `GateDenialReasonCode`    | Machine-readable: `TASK_PENDING` / `TASK_IN_PROGRESS` / `TASK_FAILED` / `TASK_BLOCKED` |
| `taskCode`       | `string`                  | Task identifier                              |
| `taskName`       | `string`                  | Human-readable name                          |
| `taskStatus`     | `ChecklistTaskStatus`     | Current status (narrow union)                |
| `category`       | `CloseTaskCategory`       | Task category                                |
| `completionMode` | `CloseTaskCompletionMode` | MANUAL / SYSTEM / HYBRID                     |
| `assignedTo`     | `string \| null`          | Responsible party                            |
| `actionHint`     | `string \| null`          | UI-friendly resolution hint                  |

**Materialization idempotency** — The `materialize` endpoint returns `MaterializeResult { tasksCreated, alreadyMaterialized }`. On re-call, `tasksCreated: 0, alreadyMaterialized: true` (backed by `ON CONFLICT DO NOTHING` in SQL).

#### Database Integrity Constraints

| Constraint                  | Rule                                                                      |
| --------------------------- | ------------------------------------------------------------------------- |
| `chk_system_handler`        | SYSTEM/HYBRID tasks must declare a `system_check_handler`                 |
| `chk_waiver`                | WAIVED items must have `waived_by`, `waived_at`, and `waiver_reason`      |
| `chk_waiver_fields_clean`   | Waiver fields must NOT be populated unless status = WAIVED                |
| `chk_completion`            | COMPLETED items must have `completed_by` and `completed_at`               |
| `chk_completion_fields_clean`| Completion fields must NOT be populated unless status = COMPLETED        |
| `chk_failure`               | FAILED items must have `failure_reason` and `failed_at`                   |
| `chk_failure_fields_clean`  | Failure fields must NOT be populated unless status = FAILED               |

#### Phase 3: Operational Governance Extensions

**Schema additions** (`192_period_close_phase3.sql`):

| Table/Extension | Purpose |
| --- | --- |
| `fin.period_close_task` + 5 columns | Default ownership (`default_owner_role`, `default_owner_user_id`), SLA (`sla_hours`, `reminder_lead_hours`), `severity` |
| `fin.period_close_checklist` + 16 columns | Assignment, waiver approval linkage, handler telemetry, escalation markers |
| `fin.period_close_activity` (new) | Append-only close timeline / read model (immutable via trigger) |

**Waiver approval integration** — Uses the same `ApprovalOps` facade pattern as purchase invoices:

```
requestTaskWaiver()
  → canRequestWaiver() domain validation
  → if requiresWaiverApproval():
      CloseApprovalOps.createInstance(entityType: "fin_period_close_waiver")
      → waiverStatus = "pending_approval"
  → else:
      waiverStatus = "approved" → immediate WAIVED transition
```

Approval decisions arrive via event-driven callback (`approval.instance.approved/rejected`) and invoke `approveTaskWaiver()` / `rejectTaskWaiver()`.

**Task assignment** — Materialization populates `assigned_role`, `assigned_user_id`, and `due_at` from task template defaults. Runtime assignment via `assignTask()` / `bulkAssignTasks()`.

**Activity timeline** — `fin.period_close_activity` captures 17 event types (task state changes, waivers, handlers, transitions, reminders). Append-only table with trigger-enforced immutability. Complements `audit.workflow_event_log` for compliance.

**Handler execution hardening** — `executeSystemHandler()` and `recheckTransitionTasks()` now persist handler telemetry (`last_handler_run_at`, `last_handler_result`, `handler_run_count`) and log activity events.

**Phase 3 API endpoints** (9 new, 37 total):

| Method | Path | Purpose |
| ------ | ---- | ------- |
| POST | `/api/fin/period-close/:fy/:pn/tasks/:taskCode/waiver/request` | Request a waiver |
| POST | `/api/fin/period-close/waiver/:checklistId/approve` | Approve waiver |
| POST | `/api/fin/period-close/waiver/:checklistId/reject` | Reject waiver |
| GET | `/api/fin/period-close/waiver/:checklistId` | Get waiver status |
| POST | `/api/fin/period-close/:fy/:pn/tasks/:taskCode/assign` | Assign task |
| POST | `/api/fin/period-close/:fy/:pn/tasks/assign/bulk` | Bulk assign |
| GET | `/api/fin/period-close/:fy/:pn/timeline` | Period close timeline |
| GET | `/api/fin/period-close/tasks/:checklistId/timeline` | Task timeline |
| POST | `/api/fin/period-close/:fy/:pn/gate/:targetStatus/recheck` | Recheck gate readiness |

**Architecture alignment**:
- Approval: `wf.approval_instance` via `CloseApprovalOps` facade (same pattern as `ApprovalOps` in purchase invoices)
- Notifications: dispatched via `TOKENS.notificationOrchestrator` (no custom notification table)
- Reminders: BullMQ scheduler via `TOKENS.scheduler` (same as approval SLA timers)
- Audit: dual-write to `fin.period_close_activity` (read model) + `audit.workflow_event_log` (compliance)
- Assignment: `core.principal(id)` FKs for user/group (no custom team table)

#### Concrete System Check Handlers

Four first-class SYSTEM close handlers implemented in `posting-engine/handlers/close-system-handlers.ts`. Each implements the `CloseHandler` interface and resolves dependencies via DI container.

| Handler Code | Class | DB Tables | Check Logic | Severity |
| --- | --- | --- | --- | --- |
| `close.trial_balance_validation` | `TrialBalanceCloseHandler` | `fin.gl_balance` | Sum(closing_debit) === Sum(closing_credit) within 0.01 tolerance | critical |
| `close.asset_depreciation` | `DepreciationCheckHandler` | `fin.depreciation_run`, `fin.asset`, `fin.asset_book` | COMPLETED run exists for each book type with active assets; fails if any run FAILED or missing | critical |
| `close.fx_revaluation` | `FxRevaluationCheckHandler` | `fin.fx_revaluation`, `fin.gl_balance`, `fin.legal_entity`, `fin.chart_of_accounts` | Revaluation entries exist for all foreign-currency GL accounts; all have posted JE references | critical |
| `close.bank_reconciliation` | `BankReconCheckHandler` | `fin.bank_statement`, `fin.reconciliation_session`, `fin.fiscal_period` | All statements overlapping period have COMPLETED recon sessions with zero unmatched lines and discrepancy <= 0.01 | high |

**Handler behavior patterns**:
- **Trivial pass**: If no applicable data exists (no assets, no FC balances, no bank statements), handler passes with a "not applicable" message. This prevents blocking close for entities that don't use the feature.
- **Structured evidence**: Every result includes machine-readable `evidence` payload for dashboard display and audit trail (account codes, run IDs, amounts, discrepancies).
- **Tolerance**: Trial balance and bank recon use 0.01 (sub-cent) tolerance to avoid floating-point false positives.
- **Multi-book awareness**: Depreciation handler checks all book types (STATUTORY, TAX, MANAGEMENT, INSURANCE) that have active assets, not just the default book.

**Seed data** — `293b_seed_period_close_tasks.sql` defines all 15 close tasks with Phase 3 defaults:

| Field | System Handlers | Manual/Hybrid Tasks |
| --- | --- | --- |
| `default_owner_role` | `CONTROLLER` or null | `ACCOUNTANT`, `TAX_ACCOUNTANT`, `CFO` |
| `sla_hours` | 2–8 hours (fast automated checks) | 24–72 hours (human review) |
| `severity` | `critical` | `high` or `medium` |
| `reminder_lead_hours` | 1–2 hours | 4–24 hours |

---

## 5. Transaction Pipeline (13-Step Decision Grid)

The Decision Grid orchestrates every financial transaction through a deterministic 13-step pipeline:

```
Step  1: INTAKE              — Assign txn_id, correlation_id; validate basic inputs
Step  2: OU_VALIDATION       — Verify OU exists, is ACTIVE, user authorized
Step  3: CLASSIFICATION      — Resolve spend category, cross-border, HS code; record explanations
Step  4: INTENT_RESOLUTION   — Resolve business intent from category rules or OU-Intent mapping
Step  5: SMART_DEFAULTS      — Auto-populate GL account, cost center, profit center, FP, tax code
Step  6: FUNDING_CHECK       — Evaluate FP health, hierarchy limits; RESERVE funds
Step  7: COMMITMENT_CREATION — Create commitment record; emit commitment.created event
Step  8: POLICY_EVALUATION   — Execute all 8 policy modules; log decisions (MC-5 immutable)
Step  9: RISK_SCORING        — Multi-dimensional risk scoring (amount, vendor, pattern, temporal)
Step 10: WORKFLOW_ASSEMBLY   — Calculate composite score; determine workflow path; assemble approvers
Step 11: TAX_CALCULATION     — Invoke Tax Engine; calculate per-line taxes; record audit trail
Step 12: AI_ENHANCEMENT      — Atlas prediction/recommendation with confidence score
Step 13: FINALIZATION        — Build snapshot; emit txn.finalized; return COMPLETED
```

### Pipeline State Machine

```
INTAKE → OU_VALIDATION → CLASSIFICATION → INTENT_RESOLUTION → SMART_DEFAULTS
  → FUNDING_CHECK → COMMITMENT_CREATION → POLICY_EVALUATION → RISK_SCORING
  → WORKFLOW_ASSEMBLY → TAX_CALCULATION → AI_ENHANCEMENT → FINALIZATION → COMPLETED
                                                                         ↘ FAILED (at any step)
```

### Classification Step (Step 3)

The CLASSIFICATION step resolves the spend category, cross-border status, and HS code:

1. **Spend Category Resolution**: Match description/item to `fin.spend_category` via AI suggestion or commodity code lookup
2. **Cross-Border Determination**: Compare supplier country vs entity country; flag if mismatched
3. **HS Code Resolution**: If cross-border, resolve HS code via `ent.commodity_crosswalk`
4. **Classification Requirement Check**: Evaluate if classification is mandatory based on OU policy, category flags, CAPEX threshold, or cross-border status
5. **Explainability**: Every auto-decision recorded in `decision_explanations[]` with rule_id and explanation template

Classification is **optional by default** — the step populates what it can and marks `classification_required` only when policy demands it.

### Smart Default Resolution

Smart defaults auto-populate 10 fields using configurable rules:

| Field                     | Resolution Method                          | Source                                           |
| ------------------------- | ------------------------------------------ | ------------------------------------------------ |
| `intent`                  | Rules engine (category + context → intent) | `fin.category_intent_rule`, `fin.spend_category` |
| `domain`                  | Rules engine (capitalization threshold)    | `fin.spend_category` thresholds                  |
| `gl_account`              | Rules engine (OU + Intent → GL mapping)    | `fin.ou_intent_mapping`, `fin.business_intent`   |
| `cost_center`             | Dimension policy + OU default lookup       | `fin.ou_dimension_default` (type=COST_CENTER) + `fin.dimension_policy` |
| `profit_center`           | Dimension policy + OU default lookup       | `fin.ou_dimension_default` (type=PROFIT_CENTER) + `fin.dimension_policy` |
| `dimension_set`           | All dimension defaults → resolved set      | `fin.ou_dimension_default` + `fin.dimension_policy` → `fin.resolve_dimension_set()` |
| `fund_center`             | Direct lookup (OU default FP)              | `fin.operating_unit.default_fp_id`               |
| `tax_code`                | Rules engine (country + category)          | `fin.tax_jurisdiction`, `fin.business_intent`    |
| `currency_code`           | Direct lookup (OU default)                 | `fin.operating_unit.default_currency_code`       |
| `hs_code`                 | Rules engine (commodity crosswalk)         | `ent.commodity_crosswalk`                        |
| `classification_required` | Rules engine (policy + category)           | OU, category, config, cross-border               |

### Exception System

When a transaction is `BLOCKED`, the Exception system allows time-bounded overrides:

| Exception Scope      | Description                                    |
| -------------------- | ---------------------------------------------- |
| `txn_id`             | Override for a specific transaction            |
| `doc_id`             | Override for all transactions under a document |
| `ou_id`              | Override for all transactions in an OU         |
| `funding_profile_id` | Override funding limits temporarily            |
| `policy_module_id`   | Temporarily disable a specific policy          |
| `vendor_id`          | Override vendor restrictions                   |

Exceptions require approval, have explicit `valid_from` / `valid_to` dates, and are tracked in `fin.exception` with full audit trail.

---

## 6. Document Services

Document Services sit above the engine layer and orchestrate the full lifecycle of financial business documents. Each service coordinates multiple engines (posting, budget, tax, decision grid, approval) through a consistent pattern: create → add lines/allocations → submit → approve → post → cancel/reverse.

All document services share cross-cutting infrastructure via the `finance/shared/` module:

| Component               | Purpose                                                                                                     |
| ----------------------- | ----------------------------------------------------------------------------------------------------------- |
| `DocumentControl`       | Auto-numbering (`{prefix}-{year}-{seqNo}`), idempotency checking, optimistic concurrency (`assertVersion`)  |
| `OUIntentResolver`      | Resolves GL account, cost center, profit center, FP, tax code, currency from OU hierarchy + business intent |
| `DecisionGridEvaluator` | Thin facade over the 13-step pipeline for document submission scoring                                       |
| `OutboxEmitter`         | Writes post-commit events to `evt.event` within the caller's transaction                                    |

**RuntimeModules**: `business.finance.accounting` (22 DI registrations, 18 routes) and `business.finance.payments` (12 DI registrations, 9 routes).

---

### 6.1 Purchase Invoice Service

**Runtime**: `framework/runtime/src/services/business/finance/accounting/services/purchase-invoice-service.ts`
**DDL**: `196_purchase_invoice.sql` | **Tables**: `fin.document_sequence`, `fin.purchase_invoice`, `fin.purchase_invoice_line`

#### Purpose

Manages the complete lifecycle of non-PO purchase invoices, from draft creation through approval, posting (JE + GL balance), and cancellation with reversal. Orchestrates 14 dependencies across 8 engines.

#### Status Lifecycle

```
DRAFT → SUBMITTED → APPROVED → POSTED → PARTIALLY_PAID → PAID (terminal)
                  ↘ DRAFT (rejection — rework)
DRAFT / SUBMITTED / APPROVED / POSTED / PARTIALLY_PAID → CANCELLED (terminal)
```

#### Service API

| Method                | Signature                                                   | Key Behavior                                                                           |
| --------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `create`              | `(ctx, input) → PurchaseInvoice`                            | Idempotency check, generate INV number, create DRAFT                                   |
| `update`              | `(ctx, id, input) → PurchaseInvoice`                        | DRAFT only, optimistic concurrency via `assertVersion`                                 |
| `setLines`            | `(ctx, invoiceId, lines, version?) → PurchaseInvoiceLine[]` | DRAFT only, bulk upsert, recalculates header totals                                    |
| `resolveLineDefaults` | `(ctx, invoiceId) → ResolvedDefaults`                       | Returns GL/CC/PC/FP/tax defaults from OU + Intent                                      |
| `submit`              | `(ctx, invoiceId) → PurchaseInvoice`                        | Validates lines/totals/GL accounts, Decision Grid, budget RESERVE, approval routing    |
| `onApprovalComplete`  | `(ctx, invoiceId, outcome) → PurchaseInvoice`               | APPROVED: budget COMMIT. REJECTED: revert to DRAFT, budget RELEASE                     |
| `post`                | `(ctx, invoiceId) → PurchaseInvoice`                        | Tax calculation + JE creation + GL update + budget CONSUME + outbox emit               |
| `cancel`              | `(ctx, invoiceId) → PurchaseInvoice`                        | From any non-terminal status; reverses JE if POSTED, releases budget, cancels approval |

#### Posting Flow (12-Engine Orchestration)

```
1. Tax Engine: batchCalculate() → per-line tax amounts
2. Tax Posting Splits: generatePostingSplits() → debit/credit instructions
3. Build JE Lines:
   • Dr Expense per line (+ non-recoverable tax grossed up)
   • Dr Tax Input Credit per recoverable tax line (SEPARATE_LINE)
   • Cr AP Control for totalAmount (subledgerType: "AP")
4. Posting Engine: createAndPost() → JE + GL balance (atomic)
5. Budget Engine: CONSUME (with compensating RELEASE on failure)
6. Update invoice header: jeId, postedAt, postedBy, status=POSTED
7. Outbox: emit "finance.document.posted" for async side effects
```

#### Budget Integration

| Event                    | Budget Action | Trigger                |
| ------------------------ | ------------- | ---------------------- |
| Submit (with FP)         | `RESERVE`     | Pre-approval fund lock |
| Approval Complete        | `COMMIT`      | Reservation confirmed  |
| Post                     | `CONSUME`     | Budget spent           |
| Rejection / Cancellation | `RELEASE`     | Funds returned         |

#### Tax Posting Splits

| Tax Type                            | Account            | Side   | Mode               |
| ----------------------------------- | ------------------ | ------ | ------------------ |
| Recoverable (input credit eligible) | `TAX_INPUT_CREDIT` | DEBIT  | `SEPARATE_LINE`    |
| Non-recoverable                     | `TAX_EXPENSE`      | DEBIT  | `ADD_TO_BASE_LINE` |
| Withholding (WHT)                   | `WHT_PAYABLE`      | CREDIT | `SEPARATE_LINE`    |

#### Dependencies (14)

`invoiceRepo`, `lineRepo`, `postingService`, `documentControl`, `ouIntentResolver`, `decisionGrid`, `budgetOps`, `taxOps`, `assetOps`, `inventoryOps`, `commissionOps`, `federationOps`, `approvalOps`, `outboxEmitter` (optional)

---

### 6.2 Payment Entry Service

**Runtime**: `framework/runtime/src/services/business/finance/payments/services/payment-entry-service.ts`
**DDL**: `197_payment_entry.sql` | **Tables**: `fin.payment_entry`, `fin.payment_allocation`

#### Purpose

Manages supplier payments with gross settlement semantics. Each payment allocates against one or more purchase invoices, with per-allocation withholding tax and early payment discounts. The posting operation is fully transactional with row-level invoice locking to prevent concurrent overpayment.

#### Gross Settlement Model

```
allocated_amount = total AP reduction for this invoice
net_cash = allocated_amount − withholding_amount − discount_amount

JE Proof:
  Dr AP Control (allocated_amount per allocation)
  = Cr Bank/Cash (net_cash total)
  + Cr WHT Payable (withholding total)
  + Cr Discount Income (discount total)
```

#### Status Lifecycle

```
DRAFT → SUBMITTED → APPROVED → POSTED → RECONCILED (terminal)
                  ↘ DRAFT (rejection — rework)
POSTED → VOIDED (terminal)
DRAFT / SUBMITTED / APPROVED → CANCELLED (terminal)
```

#### Payment Methods

`CHECK`, `WIRE`, `ACH`, `CARD`, `CASH`, `NETTING`

#### Service API

| Method               | Signature                                                       | Key Behavior                                                                        |
| -------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `create`             | `(ctx, input) → PaymentEntry`                                   | Idempotency check, generate PAY number, create DRAFT                                |
| `update`             | `(ctx, id, input) → PaymentEntry`                               | DRAFT only, optimistic concurrency                                                  |
| `addAllocations`     | `(ctx, paymentId, allocations, version?) → PaymentAllocation[]` | DRAFT only, bulk upsert                                                             |
| `submit`             | `(ctx, paymentId) → PaymentEntry`                               | Validates allocations, cross-supplier check, sum match, Decision Grid               |
| `onApprovalComplete` | `(ctx, paymentId, outcome) → PaymentEntry`                      | APPROVED or revert to DRAFT                                                         |
| `post`               | `(ctx, paymentId) → PaymentEntry`                               | **Transactional**: lock invoices → validate → build JE → post → update paid amounts |
| `cancel`             | `(ctx, paymentId) → PaymentEntry`                               | Reverse JE if POSTED, transition to CANCELLED                                       |
| `reconcile`          | `(ctx, paymentId) → PaymentEntry`                               | POSTED → RECONCILED with timestamp/actor                                            |

#### Transactional Post Flow

```
BEGIN TRANSACTION
  1. SELECT ... FOR UPDATE on all referenced invoices (row-level lock)
  2. Cross-supplier validation (defensive: same supplier for all allocations)
  3. Per-allocation: verify discount + WHT ≤ allocated_amount
  4. Per-allocation: verify allocated_amount ≤ remaining (totalAmount − paidAmount)
     → 409 OVERPAYMENT if exceeded
  5. Build gross settlement JE:
     • Dr AP Control per allocation (allocated_amount, sourceDocLineId=allocationId)
     • Cr WHT Payable (summary of all withholding)
     • Cr Discount Income (summary of all discounts)
     • Cr Bank Account (net cash = totalAmount − totalWHT − totalDiscount)
  6. PostingService.createAndPost() within same TX
  7. Update payment: status=POSTED, jeId, postedAt
  8. Per invoice: paidAmount += allocatedAmount
     → PAID if fully paid, PARTIALLY_PAID otherwise
COMMIT
```

#### Validation Rules

| Rule                               | Error Code                     | HTTP |
| ---------------------------------- | ------------------------------ | ---- |
| Allocations must exist             | `NO_ALLOCATIONS`               | 400  |
| All amounts positive               | `INVALID_AMOUNT`               | 400  |
| Sum of allocations = payment total | `ALLOCATION_MISMATCH`          | 400  |
| All invoices same supplier         | `CROSS_SUPPLIER`               | 400  |
| Discount + WHT ≤ allocated         | `DEDUCTION_EXCEEDS_ALLOCATION` | 400  |
| Allocated ≤ remaining              | `OVERPAYMENT`                  | 409  |

---

### 6.3 Manual Journal Entry Service

**Runtime**: `framework/runtime/src/services/business/finance/accounting/services/manual-je-service.ts`

#### Purpose

Enables creation and posting of manual journal entries with double-entry validation, period control, and optional direct-post for low-risk entries.

#### Status Lifecycle

```
CREATED → POSTED → REVERSED
CREATED stays CREATED on rejection (re-editable)
```

Note: No explicit SUBMITTED status. The CREATED state serves as both draft and submitted, with the Decision Grid evaluation occurring within the `submit()` call.

#### Service API

| Method               | Signature                                      | Key Behavior                                                                                                                                                                |
| -------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `create`             | `(ctx, input) → JournalEntry`                  | Validates lines, double-entry balance, accounts (active/non-group/postable), fiscal period (OPEN). Generates MJE number. Persists as CREATED — GL balances NOT updated yet. |
| `submit`             | `(ctx, jeId, options?) → ManualJESubmitResult` | Decision Grid evaluation. BLOCKED → fail. ZERO_APPROVAL + `directPost=true` → auto-post. Otherwise returns evaluation for approval routing.                                 |
| `onApprovalComplete` | `(ctx, jeId, outcome) → JournalEntry`          | Approved → delegates to `post()`. Rejected → stays CREATED for revision.                                                                                                    |
| `post`               | `(ctx, jeId) → JournalEntry`                   | Re-validates everything (accounts, balance, period). Updates GL balances via `incrementPeriodAmounts`. Marks POSTED.                                                        |
| `reverse`            | `(ctx, jeId) → JournalEntry`                   | Validates `docType === "MANUAL_JE"`. Generates reversal JE. Delegates to `PostingService.reverse()`.                                                                        |

#### Direct Post Mode

When the Decision Grid returns `ZERO_APPROVAL` and the caller passes `directPost: true`, the JE is created and posted in a single operation. SOD is enforced at the Decision Grid level (the composite score incorporates `POL-SOD` policy module results).

#### Defensive Re-Validation

The `post()` method fully re-validates all inputs because accounts may be deactivated or fiscal periods may close between creation and posting:

- All accounts must still be active, non-group, and allow direct posting
- Fiscal period must still be OPEN
- Double-entry balance must still hold
- Minimum 2 lines required

---

### 6.4 GL Inquiry Service

**Runtime**: `framework/runtime/src/services/business/finance/accounting/services/gl-inquiry-service.ts`

#### Purpose

Read-only reporting service providing three views of general ledger data: summary balances, detailed journal lines, and trial balance.

#### Service API

| Method            | Filters                                                                                | Returns                                                                                                 |
| ----------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `getGLSummary`    | tenantId, entityCode, fiscalYear, [periodNumber, accountId, costCenterId, accountType] | Per-account opening/period/closing debit and credit balances                                            |
| `getGLDetail`     | tenantId, entityCode, accountId, fiscalYear, [periodNumber, reversalMode]              | Individual journal lines with JE number, posting date, doc type, running balance, and `sourceDocLineId` |
| `getTrialBalance` | tenantId, entityCode, fiscalYear, periodNumber, [reversalMode]                         | Aggregated debit/credit per account (cumulative through period). Excludes zero-balance accounts.        |

#### Reversal Handling Modes

| Mode               | Behavior                                                                   |
| ------------------ | -------------------------------------------------------------------------- |
| `NETTED` (default) | Only POSTED JEs. Reversals naturally cancel out in aggregation.            |
| `SEPARATE`         | Includes both POSTED and REVERSED JEs as separate rows.                    |
| `EXCLUDED`         | Only POSTED JEs where `reversed_by_id IS NULL` — excludes any reversed JE. |

#### GL Drill-Down Chain

```
GL Summary (account balance)
  → GL Detail (individual JE lines for that account)
    → sourceDocLineId → Purchase Invoice Line or Payment Allocation
      → Source Document (Invoice or Payment header)
```

This is enabled by `fin.journal_line.source_doc_line_id` (added in `196_purchase_invoice.sql`), which links each JE line back to the specific source document line that generated it.

---

## 7. Bank Reconciliation

**Runtime**: `framework/runtime/src/services/business/finance/banking/`
**DDL**: `199_bank_reconciliation.sql` | **Tables**: `fin.bank_statement`, `fin.bank_statement_line`, `fin.reconciliation_session`
**Module**: `business.finance.banking` (3 repos, 1 service, 9 handlers, 9 routes)

### Purpose

Matches imported bank statement lines against posted payments through a combination of automated 3-pass matching and manual review, culminating in payment reconciliation.

### Statement Sources

`MANUAL`, `CSV`, `OFX`, `MT940`, `API`

### Statement Status Lifecycle

```
IMPORTED → IN_PROGRESS → COMPLETED
                       ↘ CANCELLED
```

### Line Match Status

```
UNMATCHED → AUTO_MATCHED → CONFIRMED (on session complete)
          → MANUAL_MATCHED → CONFIRMED (on session complete)
          → EXCLUDED (manual exclusion)
```

### 3-Pass Auto-Matching Algorithm

| Pass | Match Type    | Criteria                                                                       | Confidence |
| ---- | ------------- | ------------------------------------------------------------------------------ | ---------- |
| 1    | `EXACT`       | Amount match + reference match (exact/substring) + date within 3 business days | 97         |
| 2    | `FUZZY_REF`   | Amount match + Levenshtein distance ≤ 3 on reference                           | 80–94      |
| 3    | `AMOUNT_ONLY` | Exact amount within 5-day window                                               | 60–79      |

- Auto-apply threshold: confidence ≥ 90 (only Pass 1 matches auto-apply)
- Below threshold → flagged for manual review
- Each payment and each line matched at most once (no double-matching)
- Only DEBIT lines (outgoing payments) are eligible for matching

### Service API

| Method                                   | Behavior                                                                                                                |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `importStatement(ctx, input)`            | Creates statement header + bulk-inserts lines with sequential `lineNo`                                                  |
| `startReconciliation(ctx, statementId)`  | Creates OPEN session, marks statement IN_PROGRESS. Idempotent (returns existing session).                               |
| `runAutoMatch(ctx, sessionId)`           | Executes 3-pass algorithm, auto-applies ≥90 confidence matches, refreshes session counts                                |
| `manualMatch(ctx, lineId, paymentId)`    | Sets line to MANUAL_MATCHED with confidence 100                                                                         |
| `unmatch(ctx, lineId)`                   | Reverts to UNMATCHED. Blocked for CONFIRMED lines.                                                                      |
| `completeReconciliation(ctx, sessionId)` | Confirms all matches, calls `PaymentEntryService.reconcile()` for each matched payment, completes session and statement |

### Session Counts

The reconciliation session tracks: `total_lines`, `auto_matched`, `manual_matched`, `unmatched`, `excluded`, and `discrepancy` (expected net vs matched net).

### Tables

| Table                        | Purpose                      | Key Constraint                                      |
| ---------------------------- | ---------------------------- | --------------------------------------------------- |
| `fin.bank_statement`         | Imported statement header    | UNIQUE `(tenant_id, entity_code, statement_number)` |
| `fin.bank_statement_line`    | Individual bank transactions | UNIQUE `(tenant_id, statement_id, line_no)`         |
| `fin.reconciliation_session` | Reconciliation work tracking | UNIQUE `(tenant_id, statement_id)`                  |

---

## 8. Outbox Pattern & Post-Action Handlers

**Runtime**: `framework/runtime/src/services/business/finance/shared/outbox.ts`, `post-action-handlers.ts`

### Problem

`PurchaseInvoiceService.post()` orchestrates multiple engine operations. The core posting (JE + GL + budget) must be atomic, but downstream operations (inventory receipt, asset WIP, commission calculation, federation IC) are independent and can tolerate brief delays.

### Solution: Atomic Core + Idempotent Post-Commit Handlers

```
ATOMIC TX (must succeed together):
  1. PostingService.createAndPost() → JE + GL balance
  2. Invoice status → POSTED, je_id, posted_at
  3. Budget Engine: CONSUME

POST-COMMIT (via outbox event: "finance.document.posted"):
  4. Inventory Engine: receiveStock()
  5. Asset Engine: createAsset()
  6. Commission Engine: calculateCommission()
  7. Federation Engine: createICTransaction()
```

### Event Shape

```typescript
interface PostActionEvent {
  type: "finance.document.posted";
  docId: string;
  docType: "PURCHASE_INVOICE" | "PAYMENT_ENTRY";
  tenantId: string;
  entityCode: string;
  jeId: string;
  supplierId: string;
  lines: Array<{
    lineId: string;
    intentDomain: string | null; // "CAPEX" triggers asset handler
    itemId: string | null; // non-null triggers inventory handler
    warehouseId: string | null;
  }>;
}
```

### OutboxEmitter

Writes events to `evt.event` within the caller's transaction scope. Uses `ON CONFLICT DO NOTHING` for idempotency — if the same event is emitted twice (e.g., during retry), the duplicate is silently ignored.

### OutboxConsumer

Polls `evt.event` for PENDING events using `FOR UPDATE SKIP LOCKED` for concurrent safety. Dispatches to registered handlers in sequence. Supports configurable max retries (default: 5) with `DEAD_LETTER` status after exhaustion.

### Post-Action Handlers (4)

| Handler                   | Trigger                             | Idempotency Key                      | Engine     |
| ------------------------- | ----------------------------------- | ------------------------------------ | ---------- |
| `InventoryReceiptHandler` | Line has `itemId`                   | `inventory:{docId}:{lineId}:RECEIPT` | Inventory  |
| `AssetWIPHandler`         | Line has `intentDomain === "CAPEX"` | `asset:{docId}:{lineId}:WIP`         | Asset      |
| `CommissionCalcHandler`   | Always (per document)               | `commission:{docId}:CALC`            | Commission |
| `FederationICHandler`     | Cross-entity posting                | `federation:{docId}:IC`              | Federation |

All handlers silently skip if they encounter an `IDEMPOTENT_DUPLICATE` error.

---

## 9. HTTP API Reference

All endpoints require authentication (`authRequired: true`). Error responses follow a consistent contract:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message",
    "details": {}
  }
}
```

### Error Code → HTTP Status Mapping

| Error Code                                             | HTTP | Description                                   |
| ------------------------------------------------------ | ---- | --------------------------------------------- |
| `NOT_FOUND`                                            | 404  | Resource does not exist                       |
| `VERSION_CONFLICT` / `ALREADY_POSTED`                  | 409  | Optimistic concurrency or duplicate operation |
| `OVERPAYMENT`                                          | 409  | Allocation exceeds invoice remaining          |
| `INVALID_STATUS` / `CROSS_SUPPLIER` / `NO_ALLOCATIONS` | 400  | Validation failure                            |
| `BLOCKED_BY_POLICY` / `SUBMISSION_BLOCKED`             | 403  | Decision Grid blocked                         |
| `PERIOD_CLOSED`                                        | 422  | Fiscal period not open                        |

### 9.1 Purchase Invoice Endpoints (9 routes)

| Method | Path                                            | Handler                         | Description                     |
| ------ | ----------------------------------------------- | ------------------------------- | ------------------------------- |
| POST   | `/api/fin/purchase-invoices`                    | `CreatePurchaseInvoiceHandler`  | Create DRAFT invoice            |
| GET    | `/api/fin/purchase-invoices`                    | `ListPurchaseInvoicesHandler`   | List with filters + pagination  |
| GET    | `/api/fin/purchase-invoices/:id`                | `GetPurchaseInvoiceHandler`     | Get single invoice              |
| PATCH  | `/api/fin/purchase-invoices/:id`                | `UpdatePurchaseInvoiceHandler`  | Update DRAFT (version required) |
| POST   | `/api/fin/purchase-invoices/:id/lines`          | `SetInvoiceLinesHandler`        | Upsert full line set            |
| GET    | `/api/fin/purchase-invoices/:id/lines/defaults` | `GetInvoiceLineDefaultsHandler` | Get OU+Intent defaults          |
| POST   | `/api/fin/purchase-invoices/:id/submit`         | `SubmitInvoiceHandler`          | Submit for approval             |
| POST   | `/api/fin/purchase-invoices/:id/post`           | `PostInvoiceHandler`            | Post approved invoice           |
| POST   | `/api/fin/purchase-invoices/:id/cancel`         | `CancelInvoiceHandler`          | Cancel with reversal cascade    |

**List Filters**: `entityCode`, `status`, `supplierId`, `search`, `dateFrom`, `dateTo`
**Pagination**: `limit` (max 200), `offset`, `sort`, `dir` (asc/desc)

### 9.2 Manual JE Endpoints (6 routes)

| Method | Path                                   | Handler                     | Description                    |
| ------ | -------------------------------------- | --------------------------- | ------------------------------ |
| POST   | `/api/fin/journal-entries`             | `CreateManualJEHandler`     | Create CREATED (draft) JE      |
| GET    | `/api/fin/journal-entries`             | `ListJournalEntriesHandler` | List with filters + pagination |
| GET    | `/api/fin/journal-entries/:id`         | `GetJournalEntryHandler`    | Get JE with lines              |
| POST   | `/api/fin/journal-entries/:id/submit`  | `SubmitManualJEHandler`     | Submit (supports `directPost`) |
| POST   | `/api/fin/journal-entries/:id/post`    | `PostManualJEHandler`       | Post approved JE               |
| POST   | `/api/fin/journal-entries/:id/reverse` | `ReverseManualJEHandler`    | Reverse posted JE              |

**List Filters**: `entityCode`, `fiscalYear`, `periodNumber`, `status`, `txnId`, `docId`, `search`, `dateFrom`, `dateTo`

### 9.3 GL Inquiry Endpoints (3 routes)

| Method | Path                        | Handler               | Description                      |
| ------ | --------------------------- | --------------------- | -------------------------------- |
| GET    | `/api/fin/gl/summary`       | `GLSummaryHandler`    | Period balances by account       |
| GET    | `/api/fin/gl/detail`        | `GLDetailHandler`     | Journal lines for an account     |
| GET    | `/api/fin/gl/trial-balance` | `TrialBalanceHandler` | Trial balance with balance check |

**Required**: `fiscalYear`. GL Detail also requires `accountId`. Trial Balance requires `periodNumber`.
**Optional**: `periodNumber`, `costCenterId`, `accountType`, `reversalMode`

### 9.4 Payment Endpoints (9 routes)

| Method | Path                                | Handler                   | Description                      |
| ------ | ----------------------------------- | ------------------------- | -------------------------------- |
| POST   | `/api/fin/payments`                 | `CreatePaymentHandler`    | Create DRAFT payment             |
| GET    | `/api/fin/payments`                 | `ListPaymentsHandler`     | List with filters + pagination   |
| GET    | `/api/fin/payments/:id`             | `GetPaymentHandler`       | Get single payment               |
| PATCH  | `/api/fin/payments/:id`             | `UpdatePaymentHandler`    | Update DRAFT (version required)  |
| POST   | `/api/fin/payments/:id/allocations` | `SetAllocationsHandler`   | Upsert allocation set            |
| POST   | `/api/fin/payments/:id/submit`      | `SubmitPaymentHandler`    | Submit for approval              |
| POST   | `/api/fin/payments/:id/post`        | `PostPaymentHandler`      | Transactional gross settlement   |
| POST   | `/api/fin/payments/:id/cancel`      | `CancelPaymentHandler`    | Cancel with optional JE reversal |
| POST   | `/api/fin/payments/:id/reconcile`   | `ReconcilePaymentHandler` | Mark as reconciled               |

**List Filters**: `entityCode`, `status`, `supplierId`, `search`, `dateFrom`, `dateTo`

### 9.5 Bank Reconciliation Endpoints (9 routes)

| Method | Path                                     | Handler                         | Description                      |
| ------ | ---------------------------------------- | ------------------------------- | -------------------------------- |
| POST   | `/api/fin/bank-statements`               | `ImportStatementHandler`        | Import statement + lines         |
| GET    | `/api/fin/bank-statements`               | `ListStatementsHandler`         | List with filters + pagination   |
| GET    | `/api/fin/bank-statements/:id`           | `GetStatementHandler`           | Get with embedded lines          |
| POST   | `/api/fin/bank-statements/:id/reconcile` | `StartReconciliationHandler`    | Start reconciliation session     |
| POST   | `/api/fin/reconciliation/:id/auto-match` | `AutoMatchHandler`              | Run 3-pass matching              |
| POST   | `/api/fin/reconciliation/:id/match`      | `ManualMatchHandler`            | Manual match (lineId, paymentId) |
| POST   | `/api/fin/reconciliation/:id/unmatch`    | `UnmatchHandler`                | Revert match                     |
| POST   | `/api/fin/reconciliation/:id/complete`   | `CompleteReconciliationHandler` | Finalize and reconcile payments  |
| GET    | `/api/fin/reconciliation/:id/report`     | `ReconciliationReportHandler`   | Session summary report           |

---

## 10. Module Registry & Subscription Tiers

Every finance sub-domain is declared as a **RuntimeModule** via a `module.json` manifest. These manifests drive DI registration, dependency ordering, feature-flag gating, and subscription-tier enforcement.

### 10.1 Module Definitions

| Code       | Name                          | Depends On              | Subscription    | Description                                                                                         |
| ---------- | ----------------------------- | ----------------------- | --------------- | --------------------------------------------------------------------------------------------------- |
| `ACC`      | Finance (Core Accounting)     | `CORE`                  | **Base**        | Chart of accounts, journal entries, GL balances, fiscal periods, purchase invoices, manual JEs       |
| `PAY`      | Payment Processing            | `ACC`                   | **Base**        | Payment entries, allocations, gross settlement, reconciliation marking                               |
| `BUDGET`   | Budget & Funds Control        | `ACC`, `WF`, `MDG`      | **Enterprise**  | Funding profiles, hierarchical budgets, reserve/commit/consume/release lifecycle                     |
| `TREASURY` | Treasury & Cash Management    | `ACC`, `PAY`            | **Base**        | Cash position monitoring, bank reconciliation, FX exposure tracking, liquidity management            |
| `PAYG`     | Payment Gateways              | `PAY`                   | **Professional** | External gateway integration, transaction routing, success rate monitoring, retry orchestration      |

### 10.2 Dependency Chain

```
CORE (platform)
  └─ ACC (Base)
       ├─ PAY (Base)
       │    └─ PAYG (Professional)
       ├─ BUDGET (Enterprise) ← also depends on WF + MDG
       └─ TREASURY (Base) ← also depends on PAY
```

### 10.3 Subscription Tier Model

| Tier             | Modules Included              | Target Segment                    |
| ---------------- | ----------------------------- | --------------------------------- |
| **Base**         | ACC, PAY, TREASURY            | All tenants (Blueprints A–F)      |
| **Professional** | Base + PAYG                   | Tenants needing gateway routing   |
| **Enterprise**   | Professional + BUDGET         | Tenants needing fund control (C+) |

### 10.4 Module Lifecycle (RuntimeModule Pattern)

Each module.json is loaded at boot and wired into the DI container:

```typescript
// Phase 1: register() — DI bindings (repos, services, factories)
// Phase 2: contribute() — health checks, event consumers, background jobs, HTTP routes
```

All finance modules are composed in `framework/runtime/src/services/business/index.ts` and resolved via DI tokens in `framework/runtime/src/kernel/tokens.ts`.

### 10.5 Planned Modules (Scaffolded)

The following modules have directory structure and `.gitkeep` placeholders but no implementation yet:

| Directory           | Purpose                                         |
| ------------------- | ----------------------------------------------- |
| `finance/budget-funds/`   | Extended budget features (fund transfers, reallocation) |
| `finance/payment-gateways/` | Gateway adapter implementations (Stripe, PayPal, etc.) |

---

## 11. Dashboard Contributions

Each finance module contributes a dashboard layout via `dashboard.contribution.json`. These declarations follow the `athyper://dashboard-contribution/v1` schema and are registered into the workbench dashboard system.

### 11.1 Dashboard Registry

| Module     | Dashboard Code      | Icon          | Chart Type | KPI Count | List Widget                |
| ---------- | ------------------- | ------------- | ---------- | --------- | -------------------------- |
| ACC        | `acc_overview`      | `calculator`  | Area       | 4         | Recent Journals            |
| PAY        | `pay_overview`      | `credit-card` | Bar        | 4         | Recent Payments            |
| BUDGET     | `budget_overview`   | `pie-chart`   | Bar        | 4         | Budget Exceptions          |
| TREASURY   | `treasury_overview` | `landmark`    | Line       | 4         | Recent Transfers           |
| PAYG       | `payg_overview`     | `zap`         | Area       | 4         | Recent Transactions        |

### 11.2 Common Layout Structure

All dashboards share a 12-column grid layout with `row_height: 80`:

```
Row 0:      [─────────── Heading (12 cols) ───────────]
Row 1–2:    [KPI 1 (3)] [KPI 2 (3)] [KPI 3 (3)] [KPI 4 (3)]
Row 3–6:    [──── Chart (8 cols) ────] [─ List (4 cols) ─]
```

### 11.3 KPI Widgets by Module

**ACC (Core Accounting)**:

| Widget       | Query Key                | Format     |
| ------------ | ------------------------ | ---------- |
| Total Revenue | `acc.total_revenue`     | `currency` |
| Accounts Receivable | `acc.accounts_receivable` | `currency` |
| Accounts Payable | `acc.accounts_payable` | `currency` |
| Net Income   | `acc.net_income`         | `currency` |

**PAY (Payment Processing)**:

| Widget             | Query Key               | Format     |
| ------------------ | ----------------------- | ---------- |
| Collections MTD    | `pay.collections_mtd`   | `currency` |
| Disbursements MTD  | `pay.disbursements_mtd` | `currency` |
| Pending Payments   | `pay.pending_payments`  | `number`   |
| Overdue Payments   | `pay.overdue_payments`  | `number`   |

**BUDGET (Budget & Funds Control)**:

| Widget        | Query Key              | Format    |
| ------------- | ---------------------- | --------- |
| Total Budget  | `budget.total_budget`  | `currency`|
| Committed     | `budget.committed`     | `currency`|
| Available     | `budget.available`     | `currency`|
| Utilization   | `budget.utilization`   | `percent` |

**TREASURY (Treasury & Cash Management)**:

| Widget          | Query Key                  | Format     |
| --------------- | -------------------------- | ---------- |
| Cash Position   | `treasury.cash_position`   | `currency` |
| FX Exposure     | `treasury.fx_exposure`     | `currency` |
| Liquidity Ratio | `treasury.liquidity_ratio` | `percent`  |
| Bank Balance    | `treasury.bank_balance`    | `currency` |

**PAYG (Payment Gateways)**:

| Widget          | Query Key              | Format    |
| --------------- | ---------------------- | --------- |
| Txn Volume      | `payg.txn_volume`      | `number`  |
| Success Rate    | `payg.success_rate`    | `percent` |
| Avg Processing  | `payg.avg_processing`  | `number`  |
| Failed Txns     | `payg.failed_txns`     | `number`  |

### 11.4 ACL Model

All dashboards share a consistent ACL pattern with 4 principal mappings:

| Principal Type | Principal Key   | Permission |
| -------------- | --------------- | ---------- |
| `persona`      | `agent`         | `view`     |
| `persona`      | `manager`       | `view`     |
| `persona`      | `module_admin`  | `edit`     |
| `persona`      | `tenant_admin`  | `edit`     |

### 11.5 Chart & List Widgets

| Module   | Chart Title           | Chart Type | List Title              | List Columns                                |
| -------- | --------------------- | ---------- | ----------------------- | ------------------------------------------- |
| ACC      | Revenue Trend         | `area`     | Recent Journals         | date, reference, description, amount        |
| PAY      | Payment Flow          | `bar`      | Recent Payments         | date, reference, type, amount               |
| BUDGET   | Budget vs Actual      | `bar`      | Budget Exceptions       | date, department, type, amount              |
| TREASURY | Cash Flow             | `line`     | Recent Transfers        | date, from_account, to_account, amount      |
| PAYG     | Volume Trend          | `area`     | Recent Transactions     | date, gateway, status, amount               |

---

## 12. UI Components

**Location**: `products/neon/apps/web/components/finance/`
**Plugin Integration**: `products/neon/apps/web/lib/entity-page/plugins/finance-plugin.tsx`
**List Explorers**: `products/neon/apps/web/components/finance/list/`

### 12.1 Detail Components

| Component                  | File                             | Purpose                                                   |
| -------------------------- | -------------------------------- | --------------------------------------------------------- |
| `InvoiceLineGrid`          | `InvoiceLineGrid.tsx`            | Editable table grid for purchase invoice lines            |
| `JournalLineGrid`          | `JournalLineGrid.tsx`            | Debit/credit grid for journal entry lines                 |
| `PaymentAllocationPicker`  | `PaymentAllocationPicker.tsx`    | Two-section gross settlement picker                       |
| `GLBalanceReport`          | `GLBalanceReport.tsx`            | Tabbed GL report (summary, detail, trial balance)         |
| `GLBalanceReportContainer` | `GLBalanceReportContainer.tsx`   | Data-fetching wrapper that hydrates `GLBalanceReport`     |
| `DecisionScorePanel`       | `DecisionScorePanel.tsx`         | Decision Grid evaluation audit panel                      |
| `BankReconciliation`       | `BankReconciliation.tsx`         | Interactive reconciliation workspace (match/unmatch/complete) |
| `ReconciliationReport`     | `ReconciliationReport.tsx`       | Read-only post-reconciliation summary with match statistics |

### 12.1.1 InvoiceLineGrid

**Props**: `lines`, `mode` (view/edit), `totalLineAmount`, `totalTaxAmount`, `currencyCode`, `onLineChange`, `onAddLine`, `onRemoveLine`

Displays: Line number, description, quantity, unit price, line amount, tax code, tax rate, tax amount, GL account, cost center, and asset/inventory flag badges. In edit mode, cells become inputs with per-row delete and "Add Line" button. Footer row shows totals with currency code.

### 12.1.2 JournalLineGrid

**Props**: `lines`, `mode` (view/edit), `totalDebits`, `totalCredits`, `balanceDifference`, `isBalanced`, `onLineChange`, `onAddLine`, `onRemoveLine`

Displays: Line number, account, description, debit amount, credit amount, subledger info. Footer shows debit/credit totals and a balance indicator badge (green "Balanced" or red "Out of Balance: {difference}").

### 12.1.3 PaymentAllocationPicker

**Props**: `availableInvoices`, `allocations`, `paymentTotal`, `totalAllocated`, `unallocatedAmount`, `isFullyAllocated`, `currencyCode`, `onAddInvoice`, `onRemoveAllocation`, `onAllocationChange`, `readOnly`

Two-section layout:

1. **Available Invoices** table (hidden in read-only): Unpaid invoices with "Add" button per row
2. **Allocations** table: Editable fields for allocated amount, discount, WHT. Net cash is computed.

Summary bar shows: Payment Total, Allocated, Unallocated, and a status badge ("Fully allocated" green / "Allocation mismatch" amber).

### 12.1.4 GLBalanceReport

**Props**: `summaryRows`, `detailRows`, `trialBalanceRows`, `summaryTotals`, `trialBalanceTotals`, `trialBalanceIsBalanced`, `reversalMode`, `onReversalModeChange`, `onAccountFilter`, `onDateRangeChange`, `currencyCode`, `loading`

Three tabs:

1. **GL Summary**: Per-account opening/period/closing balances with footer totals
2. **GL Detail**: Individual posting lines with JE number, date, doc type badge, running balance (red if negative), reversal mode toggle (NETTED/SEPARATE/EXCLUDED)
3. **Trial Balance**: Account-level debit/credit with balance check indicator (green/red)

### 12.1.5 GLBalanceReportContainer

**File**: `GLBalanceReportContainer.tsx`

Data-fetching container that hydrates the `GLBalanceReport` presentational component. Manages API calls for GL summary, GL detail, and trial balance endpoints, handles loading/error states, and passes formatted data into `GLBalanceReport`. Separates data orchestration from presentation per the container/presentational pattern.

### 12.1.6 BankReconciliation

**File**: `BankReconciliation.tsx`

Interactive reconciliation workspace for matching bank statement lines against posted payments. Provides:

- Statement line display with amount, reference, date, and direction (DEBIT/CREDIT)
- Match actions (auto-match trigger, manual match, unmatch)
- Session progress tracking (matched vs unmatched counts)
- Complete reconciliation action with confirmation

### 12.1.7 ReconciliationReport

**File**: `ReconciliationReport.tsx`

Read-only post-reconciliation summary. MC-4 compliant (all monetary values are opaque strings).

**Props**: `statement: StatementSummary`, `session: SessionSummary`, `matchedLines: MatchedLineRow[]`

**Sections**:

1. **Summary Card**: Statement number, bank name, period (start–end), opening/closing balance, currency, session timestamps, and status badge (COMPLETED/OPEN/CANCELLED — green/blue/gray)
2. **Match Statistics**: Stacked progress bar with 4 segments (auto=blue, manual=green, excluded=gray, unmatched=background), legend with counts, and discrepancy indicator (green "Balanced" badge when zero, red badge with amount when non-zero)
3. **Matched Lines Table**: 8-column table (line #, date, amount with red/green coloring by direction, direction badge, reference, match type badge, confidence percentage, linked payment ID)

**Status Configs**: `COMPLETED` (green), `OPEN` (blue), `CANCELLED` (gray)
**Match Status Badges**: `AUTO_MATCHED` (blue "Auto"), `MANUAL_MATCHED` (green "Manual"), `CONFIRMED` (emerald "Confirmed")

### 12.1.8 DecisionScorePanel

**Props**: `result: DecisionEvaluationResult | null`, `loading`

Displays: Circular score gauge (color-coded), approval route badge, per-module horizontal bar charts, exceptions warning panel, pipeline ID and evaluation timestamp. Shows skeleton loader when loading.

### 12.2 List Explorer Components

**Location**: `products/neon/apps/web/components/finance/list/`

List explorers provide filterable, searchable, paginated table views for finance document collections. Each explorer is a standalone `"use client"` component with built-in state management.

#### 12.2.1 PurchaseInvoiceExplorer

**File**: `list/PurchaseInvoiceExplorer.tsx`
**Hook**: `usePurchaseInvoiceList(filters)` from `@/lib/finance/use-finance-list`

| Feature         | Detail                                                                                    |
| --------------- | ----------------------------------------------------------------------------------------- |
| Page Size       | 25 items per page                                                                         |
| Search          | Full-text search across invoice numbers and supplier names                                |
| Status Filter   | Dropdown: All, Draft, Submitted, Approved, Posted, Partially Paid, Paid, Cancelled        |
| Default Sort    | `invoiceDate` descending                                                                  |
| Columns         | Invoice #, Supplier, Invoice Date, Due Date, Total (right-aligned mono), Paid, Status badge, Approval route badge |
| States          | Loading spinner, error with retry, empty state, data table + pagination                   |

#### 12.2.2 PaymentEntryExplorer

**File**: `list/PaymentEntryExplorer.tsx`
**Hook**: `usePaymentEntryList(filters)` from `@/lib/finance/use-finance-list`

| Feature         | Detail                                                                                    |
| --------------- | ----------------------------------------------------------------------------------------- |
| Page Size       | 25 items per page                                                                         |
| Search          | Full-text search across payment numbers and supplier names                                |
| Status Filter   | Dropdown: All, Draft, Submitted, Approved, Posted, Reconciled, Cancelled, Voided          |
| Default Sort    | `paymentDate` descending                                                                  |
| Columns         | Payment #, Supplier, Payment Date, Amount (right-aligned mono), Method badge, Status badge, Approval route badge |
| Payment Methods | CHECK, WIRE, ACH, CARD, CASH, NETTING — rendered as slate-colored badges                  |

#### 12.2.3 JournalEntryExplorer

**File**: `list/JournalEntryExplorer.tsx`
**Hook**: `useJournalEntryList(filters)` from `@/lib/finance/use-finance-list`

| Feature         | Detail                                                                                    |
| --------------- | ----------------------------------------------------------------------------------------- |
| Page Size       | 25 items per page                                                                         |
| Search          | Full-text search across JE numbers and descriptions                                       |
| Status Filter   | Dropdown: All, Created, Posted, Reversed                                                  |
| Default Sort    | `postingDate` descending                                                                  |
| Columns         | JE #, Doc Type badge, Posting Date, Fiscal Year, Period, Debit (right-aligned mono), Credit (right-aligned mono), Status badge, Description (truncated 250px) |

#### 12.2.4 Common Explorer Patterns

All three explorers share identical architectural patterns:

```
┌─ Header ─────────────────────────────────────────────────────┐
│  [Icon] Title (total count)                    [Refresh btn] │
├─ Filters ────────────────────────────────────────────────────┤
│  [🔍 Search input ............]  [Status dropdown ▾]         │
├─ Table ──────────────────────────────────────────────────────┤
│  Column headers with fixed widths                            │
│  Data rows with cell renderers from finance-shared           │
│  Empty state: "No {documents} found."                        │
├─ Pagination ─────────────────────────────────────────────────┤
│  Page X of Y                          [← Previous] [Next →] │
└──────────────────────────────────────────────────────────────┘
```

**State management**: `useState` for search, status, offset. `useMemo` for filter object construction. Offset resets to 0 on any filter change.

**Pagination**: Computed from `data.total` and `data.hasMore`. Previous disabled at offset 0, Next disabled when `!hasMore`.

### 12.3 Shared Cell Renderers

**File**: `list/finance-shared.tsx`

Reusable cell renderer components used across all list explorers and list configs:

| Renderer             | Props                        | Rendering                                                                                  |
| -------------------- | ---------------------------- | ------------------------------------------------------------------------------------------ |
| `StatusBadgeCell`    | `status: string`             | Colored pill badge. Replaces underscores with spaces. Color-mapped for 11 statuses.       |
| `MoneyCell`          | `amount: string`, `currency?`| Right-aligned, monospace, tabular-nums. Formats via `Intl.NumberFormat` (2dp). MC-4 safe. |
| `DateCell`           | `date: string \| null`        | Formatted via `Intl.DateTimeFormat` (short month). Shows `--` for null.                   |
| `ApprovalRouteBadge` | `route: string \| null`       | Small colored badge. Renders nothing for null. 5 route colors.                            |

**Status Color Map** (11 statuses):

| Status           | Background       | Text Color       |
| ---------------- | ---------------- | ---------------- |
| `DRAFT`          | `bg-gray-100`    | `text-gray-700`  |
| `CREATED`        | `bg-gray-100`    | `text-gray-700`  |
| `SUBMITTED`      | `bg-blue-100`    | `text-blue-700`  |
| `APPROVED`       | `bg-green-100`   | `text-green-700` |
| `POSTED`         | `bg-purple-100`  | `text-purple-700`|
| `PARTIALLY_PAID` | `bg-amber-100`   | `text-amber-700` |
| `PAID`           | `bg-emerald-100` | `text-emerald-700`|
| `CANCELLED`      | `bg-red-100`     | `text-red-700`   |
| `RECONCILED`     | `bg-teal-100`    | `text-teal-700`  |
| `VOIDED`         | `bg-red-100`     | `text-red-700`   |
| `REVERSED`       | `bg-orange-100`  | `text-orange-700`|

**Approval Route Colors**:

| Route            | Background       | Text Color       |
| ---------------- | ---------------- | ---------------- |
| `ZERO_APPROVAL`  | `bg-gray-100`    | `text-gray-600`  |
| `STANDARD`       | `bg-blue-100`    | `text-blue-700`  |
| `ENHANCED`       | `bg-amber-100`   | `text-amber-700` |
| `EXECUTIVE`      | `bg-red-100`     | `text-red-700`   |
| `BLOCKED`        | `bg-red-100`     | `text-red-700`   |

### 12.4 ListPageConfig System

**File**: `list/purchase-invoice-list-config.tsx` (and similar for payments, JEs)
**Type**: `ListPageConfig<T>` from `@/components/mesh/list`

The `ListPageConfig` factory pattern provides a declarative configuration for rendering finance list pages within the Mesh list framework. Each config defines the full page structure without custom component code.

#### Config Structure

```typescript
interface ListPageConfig<T> {
  // Identity
  pageTitle: string;
  entityLabel: string;
  entityLabelPlural: string;
  icon: LucideIcon;
  basePath: string;
  getId: (item: T) => string;
  getItemHref: (item: T) => string;

  // Zone 2 — KPI summary cards
  kpis: Array<{
    id: string;
    label: string;
    icon: LucideIcon;
    compute: (items: T[]) => number;
    format: "number" | "currency" | "percent";
    filterOnClick?: Record<string, string>;      // Click KPI → apply filter
    variantFn?: (value: number) => "default" | "warning" | "critical";
  }>;

  // Zone 3 — Command bar
  searchPlaceholder: string;
  searchFn: (item: T, query: string) => boolean;
  quickFilters: Array<{
    id: string;
    label: string;
    defaultValue: string;
    options: Array<{ value: string; label: string }>;
  }>;
  filterFn: (item: T, filters: Record<string, string>) => boolean;

  // Zone 4 — Columns + card renderer
  columns: Array<{
    id: string;
    header: string;
    sortKey?: string;
    width?: string;
    align?: "left" | "right";
    accessor: (item: T) => ReactNode;
    filterable?: boolean;
    filterType?: "text" | "select";
    filterOptions?: Array<{ value: string; label: string }>;
    sortFn?: (a: T, b: T) => number;
  }>;
  cardRenderer: (item: T) => ReactNode;

  // View configuration
  availableViews: Array<"table" | "table-columns" | "card-grid">;
  defaultViewMode: string;
  defaultViewModeDesktop: string;
  defaultDensity: "comfortable" | "compact";
  defaultDensityDesktop: "comfortable" | "compact";

  // Presets
  presets: Array<{
    id: string;
    label: string;
    isDefault?: boolean;
    filters?: Record<string, string>;
  }>;

  // Primary action
  primaryAction?: {
    label: string;
    icon: LucideIcon;
    onClick: () => void;
  };
}
```

#### Purchase Invoice ListPageConfig

| Zone    | Feature                   | Detail                                                                 |
| ------- | ------------------------- | ---------------------------------------------------------------------- |
| KPIs    | Total Invoices            | Count of all items                                                     |
| KPIs    | Drafts                    | Filtered count. Warning variant when > 10. Click → filter to DRAFT    |
| KPIs    | Pending Approval          | Filtered count. Critical when > 20, warning when > 5. Click → SUBMITTED |
| Search  | —                         | Matches `invoiceNumber` or `supplierName` (case-insensitive)           |
| Filters | Status                    | 8 options (All + 7 statuses)                                           |
| Columns | Invoice #                 | Monospace, 140px, sortable                                             |
| Columns | Supplier                  | Text filterable, sortable by `supplierName`                            |
| Columns | Date                      | `DateCell`, 120px, sortable                                            |
| Columns | Total                     | `MoneyCell` right-aligned, 130px, numeric sortFn                       |
| Columns | Status                    | `StatusBadgeCell`, 140px, select-filterable                            |
| Card    | —                         | Invoice #, status badge, supplier, date + amount row                   |
| Views   | Mobile default            | `card-grid` / comfortable density                                      |
| Views   | Desktop default           | `table` / compact density                                              |
| Presets | Default, My Drafts, Pending Approval | Pre-configured filter sets                                   |
| Action  | New Invoice               | `Plus` icon. Target: create form / dialog                              |

### 12.5 Tab Plugin Integration

Four `TabPlugin` objects in `finance-plugin.tsx` wire detail components into the entity page system:

| Plugin                     | Hook                              | Component                            |
| -------------------------- | --------------------------------- | ------------------------------------ |
| `invoiceLinesPlugin`       | `useInvoiceLines(entityId)`       | `InvoiceLineGrid` (view mode)        |
| `journalLinesPlugin`       | `useJournalEntry(entityId)`       | `JournalLineGrid` (view mode)        |
| `paymentAllocationsPlugin` | `usePaymentAllocations(entityId)` | `PaymentAllocationPicker` (readOnly) |
| `decisionScorePlugin`      | `useDecisionScore(entityId)`      | `DecisionScorePanel`                 |

Each plugin maps DTOs from `@/lib/finance/types` to component domain types and computes derived values (totals, balance checks) using string-based arithmetic helpers.

---

## 13. Shared Foundations

### 13.1 Money Type (MC-4 Compliance)

All monetary calculations use string-based decimal arithmetic via `engines/shared/money.ts`:

```typescript
interface Money {
  amount: string; // "1234.5678" — NEVER a float
  currencyCode: string; // ISO 4217
  precision: number; // Decimal places (default: 4)
}
```

Internal arithmetic uses `BigInt` scaling to eliminate floating-point errors:

- `addMoney(a, b)` — Addition (currency must match)
- `subtractMoney(a, b)` — Subtraction (currency must match)
- `multiplyMoney(m, scalar)` — Scalar multiplication
- `compareMoney(a, b)` — Returns −1 | 0 | 1
- `formatMoney(m, displayPrecision)` — Display formatting (default: 2 places)

### 13.2 Engine Base

All services share common interfaces from `engines/shared/engine-base.ts`:

- `OperationContext` — Audit trail: `{ tenantId, actorId, actorType, correlationId, entityCode }`
- `ServiceResult<T>` — Discriminated union for error handling
- `PaginatedResult<T>` — Standard pagination wrapper
- `EntityStatus` — Common lifecycle: `DRAFT | ACTIVE | INACTIVE | ARCHIVED`
- `validateTransition()` — Generic state machine validator

### 13.3 Event Helpers

Shared utilities in `engines/shared/event-helpers.ts`:

- `computePartitionKey(domain, tenantId, entityCode, primaryId)` — Deterministic partition key
- `computePayloadHash(payload)` — SHA-256 with canonical JSON (sorted keys)
- `verifyPayloadHash(payload, expectedHash)` — Timing-safe comparison
- `buildEventEnvelope(params)` — Construct UniversalEventEnvelope

---

## 14. Data Model Summary

### 14.1 Table Count by Engine/Module

| Engine/Module                | Schema        | Tables | Key Tables                                                                                             |
| ---------------------------- | ------------- | ------ | ------------------------------------------------------------------------------------------------------ |
| Event Store                  | `evt`         | 5      | `event` (partitioned), `projection_registry`                                                           |
| OU + Intent + Classification | `fin` + `ent` | 12     | `operating_unit`, `business_intent`, `spend_category`, `category_intent_rule`, `classification_config` |
| Decision Grid                | `fin`         | 5      | `transaction_pipeline`, `policy_module`, `exception`                                                   |
| Budget                       | `fin`         | 3      | `funding_profile`, `funding_transaction`                                                               |
| Commitment                   | `fin`         | 3      | `commitment`, `commitment_schedule`                                                                    |
| Posting (GL Core)            | `fin`         | 8      | `chart_of_accounts`, `journal_entry`, `journal_line`, `gl_balance`                                     |
| Ledger Dimensions            | `fin`         | 7      | `dimension_type`, `dimension_value`, `dimension_policy`, `dimension_set`, `dimension_set_item`         |
| Tax                          | `fin`         | 4      | `tax_jurisdiction`, `tax_rate`, `tax_calculation`                                                      |
| Asset                        | `fin`         | 4      | `asset`, `asset_book`, `depreciation_run`                                                              |
| Inventory                    | `fin`         | 7      | `item_master`, `inventory_balance`, `valuation_layer`                                                  |
| Commission                   | `fin`         | 4      | `commission_plan`, `commission_calculation`                                                            |
| Federation                   | `fin`         | 7      | `legal_entity`, `fx_rate`, `consolidation_elimination`                                                 |
| Production                   | `fin`         | 7      | `bill_of_materials`, `work_order`, `production_variance`                                               |
| Atlas AI                     | `fin`         | 4      | `ai_model_registry`, `ai_prediction`, `ai_action`                                                      |
| Period Close Governance      | `fin`         | 2      | `period_close_task`, `period_close_checklist`                                                           |
| Approval (meta)              | `meta`        | 4      | `approval_template`, `approval_template_stage`, `approval_template_rule`                               |
| **Purchase Invoice**         | `fin`         | **3**  | `document_sequence`, `purchase_invoice`, `purchase_invoice_line`                                       |
| **Payment Entry**            | `fin`         | **2**  | `payment_entry`, `payment_allocation`                                                                  |
| **Bank Reconciliation**      | `fin`         | **3**  | `bank_statement`, `bank_statement_line`, `reconciliation_session`                                      |
| **Reporting Analytics**      | `fin`         | **3+1mv** | `rpt_cube_definition`, `rpt_balance_cube`, `rpt_cube_refresh_run` + `dimension_set_flat` (materialized view) |
| **Total**                    |               | **89+1mv** |                                                                                                        |

### 14.2 New Tables (v2.2)

| Table                        | DDL File                      | Purpose                                   | Key Constraint                                      |
| ---------------------------- | ----------------------------- | ----------------------------------------- | --------------------------------------------------- |
| `fin.document_sequence`      | `196_purchase_invoice.sql`    | Auto-numbering for finance documents      | PK `(tenant_id, entity_code, prefix, fiscal_year)`  |
| `fin.purchase_invoice`       | `196_purchase_invoice.sql`    | Non-PO invoice header                     | UNIQUE `(tenant_id, entity_code, invoice_number)`   |
| `fin.purchase_invoice_line`  | `196_purchase_invoice.sql`    | Invoice line items                        | UNIQUE `(tenant_id, invoice_id, line_no)`           |
| `fin.payment_entry`          | `197_payment_entry.sql`       | Payment header                            | UNIQUE `(tenant_id, entity_code, payment_number)`   |
| `fin.payment_allocation`     | `197_payment_entry.sql`       | Per-invoice allocation (gross settlement) | UNIQUE `(tenant_id, payment_id, line_no)`           |
| `fin.bank_statement`         | `199_bank_reconciliation.sql` | Imported bank statement header            | UNIQUE `(tenant_id, entity_code, statement_number)` |
| `fin.bank_statement_line`    | `199_bank_reconciliation.sql` | Individual bank transactions              | UNIQUE `(tenant_id, statement_id, line_no)`         |
| `fin.reconciliation_session` | `199_bank_reconciliation.sql` | Reconciliation work tracking              | UNIQUE `(tenant_id, statement_id)`                  |

### 14.2b Period Close Governance (v2.3)

| Table                        | DDL File                           | Purpose                          | Key Constraint                                                          |
| ---------------------------- | ---------------------------------- | -------------------------------- | ----------------------------------------------------------------------- |
| `fin.period_close_task`      | `191_period_close_governance.sql`  | Master close task catalogue      | UNIQUE `(tenant_id, entity_code, task_code)`                            |
| `fin.period_close_checklist` | `191_period_close_governance.sql`  | Per-period checklist instances    | UNIQUE `(tenant_id, entity_code, fiscal_year, period_number, task_code)` |

### 14.2c Ledger Dimension Engine (v2.3)

**Core Registry and Master Data** (3 tables):

| Table                   | DDL File                    | Purpose                                              | Key Constraint                                                 |
| ----------------------- | --------------------------- | ---------------------------------------------------- | -------------------------------------------------------------- |
| `fin.dimension_type`    | `191_ledger_dimensions.sql` | Registry of dimension kinds (with `source_kind`)      | UNIQUE `(tenant_id, entity_code, code)`                        |
| `fin.dimension_value`   | `191_ledger_dimensions.sql` | Internal master data with lifecycle/effective dates    | UNIQUE `(tenant_id, entity_code, dimension_type_id, code)`     |
| `fin.dimension_policy`  | `191_ledger_dimensions.sql` | Governance rules (6 behaviors, multi-scope, versioned) | UNIQUE `(tenant_id, entity_code, policy_code, policy_version)` |

**Canonical Resolved Combinations** (2 tables):

| Table                     | DDL File                    | Purpose                                        | Key Constraint                                 |
| ------------------------- | --------------------------- | ---------------------------------------------- | ---------------------------------------------- |
| `fin.dimension_set`       | `191_ledger_dimensions.sql` | Hash-normalized dimension combinations. Stores `signature` (pre-hash canonical string for debugging/validation), `dimension_count` (analytics shortcut) | UNIQUE `(tenant_id, entity_code, set_hash)`    |
| `fin.dimension_set_item`  | `191_ledger_dimensions.sql` | Immutable members of a dimension set (1:type)   | UNIQUE `(dimension_set_id, dimension_type_id)` |

**Upstream Capture and Defaulting** (2 tables):

| Table                          | DDL File                    | Purpose                           | Key Constraint                                                 |
| ------------------------------ | --------------------------- | --------------------------------- | -------------------------------------------------------------- |
| `fin.ou_dimension_default`     | `191_ledger_dimensions.sql` | Default dimension values per OU    | UNIQUE `(tenant_id, entity_code, ou_id, dimension_type_id)`   |
| `fin.document_line_dimension`  | `191_ledger_dimensions.sql` | Dimension capture at document entry| UNIQUE `(tenant_id, doc_type, doc_line_id, dimension_type_id)` |

**Existing Tables Extended** (3 ALTER TABLEs):
- `fin.journal_line` + `dimension_set_id UUID` — FK to `fin.dimension_set`
- `fin.gl_balance` + `dimension_set_id UUID` — replaces `cost_center_id` as balance grain
- `fin.transaction_pipeline` + `resolved_dimension_set_id UUID` — `txn.finalized` contract
- `fin.transaction_pipeline` + `dimension_derivation_log JSONB` — audit trail of derivation decisions

**Helper Function**: `fin.resolve_dimension_set(tenant_id, entity_code, pairs JSONB) → UUID` — hash-normalizes sorted dimension pairs, deduplicates, returns existing or new set_id. Validates sort order, rejects duplicate type_ids, handles concurrent creation via `ON CONFLICT`.

#### Dimension Set Immutability Contract

- Once a `dimension_set` is created, it is **never modified or deleted**
- If a `dimension_value` becomes INACTIVE or ARCHIVED, existing sets referencing it remain valid for historical postings
- New postings that would produce the same combination minus the inactive value resolve to a different set with a different hash
- This guarantees ledger integrity and historical reporting accuracy

**Database-enforced immutability** (triggers in `191_ledger_dimensions.sql`):

| Trigger | Table | Scope | Behavior |
| ------- | ----- | ----- | -------- |
| `trg_dimension_set_immutable` | `fin.dimension_set` | `BEFORE UPDATE` | Rejects any change to `set_hash`, `signature`, or `dimension_count` — the three canonical identity columns. `display_label` remains updatable. |
| `trg_dimension_set_item_no_update` | `fin.dimension_set_item` | `BEFORE UPDATE` | Rejects all updates — items are write-once. |
| `trg_dimension_set_item_no_delete` | `fin.dimension_set_item` | `BEFORE DELETE` | Rejects all deletes — items are permanent. |

#### Hash Canonicalization Rules

1. Input pairs **MUST** be sorted ascending by `dimension_type_id::text`
2. NULL/empty values **MUST** be excluded before hashing
3. One value per `dimension_type` per set (enforced by `uq_fin_dim_set_item`)
4. Hash format: SHA-256 of `"type_id_1:value_id_1|type_id_2:value_id_2|..."`
5. Hash is tenant+entity scoped via the `uq_fin_dim_set` constraint
6. `resolve_dimension_set()` rejects unsorted input and duplicate type_ids with exceptions
7. The pre-hash canonical string is persisted in `signature` for debugging, validation (`sha256(signature) = set_hash`), and diagnostics
8. `dimension_count` stores the number of dimensions in the set for analytics queries without joining `dimension_set_item`

#### Policy Precedence (highest to lowest specificity)

| Rank | Scope Field               | Example                  |
| ---- | ------------------------- | ------------------------ |
| 1    | `scope_account_code`      | Exact GL account `6100`  |
| 2    | `scope_account_range`     | Range `6000`–`6999`      |
| 3    | `scope_subledger_type`    | AP, AR, ASSET            |
| 4    | `scope_account_type`      | EXPENSE, REVENUE         |
| 5    | `scope_intent_code`       | OPEX-TRAVEL              |
| 6    | `scope_doc_type`          | PURCHASE_INVOICE         |
| 7    | `scope_ou_id`             | Specific OU              |
| 8    | `scope_domain`            | CAPEX, OPEX              |
| 9    | (all NULL)                | Global default           |

Ties at same specificity: resolved by `priority` (higher wins), then newest `policy_version`.

**Behavior conflict resolution**: `FORBIDDEN` > `FIXED_VALUE` > `REQUIRED` > `DERIVE_IF_MISSING` > `INHERIT_FROM_HEADER` > `OPTIONAL`. More-specific scope always outranks less-specific. Unresolvable conflicts → validation error for human review.

#### Derivation Audit Trail

Stored as `dimension_derivation_log` JSONB array on `fin.transaction_pipeline`:

```json
[
  {
    "dimension_type_code": "COST_CENTER",
    "dimension_value_code": "CC-SALES",
    "source": "ou_default",
    "policy_code": "CC-EXPENSE-DERIVE",
    "policy_version": 1,
    "confidence": 1.0,
    "warnings": []
  },
  {
    "dimension_type_code": "PROJECT",
    "dimension_value_code": "PROJ-ALPHA",
    "source": "user_entered",
    "policy_code": null,
    "policy_version": null,
    "confidence": 1.0,
    "warnings": ["value overrode header default PROJ-BETA"]
  }
]
```

Source values: `user_entered`, `header_inherited`, `ou_default`, `policy_fixed`, `derived`, `federation_context`, `intent_mapping`.

#### Derived Dimension Materialization

Dimensions with `source_kind = 'DERIVED'` (e.g., Region from OU geography) are **always materialized** into `dimension_set_item` at posting/finalization time. Reporting never recalculates past finance dimensions from changing master data logic. This ensures historical ledger stability across reorgs and master data changes.

### 14.2d Reporting Analytics Engine (v2.3)

Two-layer read-optimized projection for multi-dimensional reporting, dashboards, and near-real-time finance analytics without hammering `gl_balance`.

**Layer 1 — Dimension Compression Projection** (1 materialized view):

| Object                       | DDL File                      | Purpose                                              | Key Constraint                    |
| ---------------------------- | ----------------------------- | ---------------------------------------------------- | --------------------------------- |
| `fin.dimension_set_flat` (MV) | `193_reporting_analytics.sql` | Pivots `dimension_set_item` into named columns (CC, PC, Project, Region, Segment, Location, Function, Intercompany) + JSONB overflow for custom types | UNIQUE on `dimension_set_id` (for `REFRESH CONCURRENTLY`) |

**Layer 2 — Reporting Cube Materialization** (3 tables):

| Table                          | DDL File                      | Purpose                                              | Key Constraint                                                          |
| ------------------------------ | ----------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------- |
| `fin.rpt_cube_definition`     | `193_reporting_analytics.sql` | Meta-driven cube family registry (type, grain, dimensions, refresh mode) | UNIQUE `(tenant_id, entity_code, cube_code)` |
| `fin.rpt_balance_cube`        | `193_reporting_analytics.sql` | Pre-aggregated monthly balance cube (wide analytic table) | UNIQUE `(tenant_id, entity_code, cube_code, book_code, fiscal_year, period_number, currency_code, account_id, dimension_set_id)` |
| `fin.rpt_cube_refresh_run`    | `193_reporting_analytics.sql` | Tracks incremental/batch/reconciliation refresh jobs | — |

**Helper Functions** (2):
- `fin.refresh_balance_cube(tenant_id, entity_code, cube_code, ...)` — Full rebuild from `gl_balance` + `dimension_set_flat`
- `fin.reconcile_cube(tenant_id, entity_code, cube_code, year, period)` — Verify cube vs. `gl_balance` integrity

#### Design Guardrails

1. **Cubes are projections only** — all corrections, reversals, and audit lineage stay in `journal_entry` / `gl_balance`
2. **Fully rebuildable** — every cube can be deleted and repopulated from `gl_balance` + `dimension_set` + masters at any time
3. **Book-aware** — cubes include `book_code` (from `192_ledger_book.sql`); multi-book tenants get separate cube rows per book
4. **Period-close aware** — frozen periods snapshot `period_status` and `close_snapshot_version`; reconciliation runs verify integrity at hard close
5. **Blueprint-selective** — cube families enabled per blueprint tier via `rpt_cube_definition`

#### Cube Families

| Cube Type | Code | Purpose | Typical Dimensions | Blueprint Fit |
| --------- | ---- | ------- | ------------------ | ------------- |
| `FS` | `FS_MONTHLY` | Financial Statement (P&L, BS, CF) | CC, PC | All (A→F) |
| `MGMT` | `MGMT_MONTHLY` | Management Analytics (internal) | CC, PC, Project/Region/Location/Segment | C, D, E, F |
| `OPS` | `OPS_MONTHLY` | Operational Cost (manufacturing, projects) | CC, Region/Function/Segment | D, F |
| `IC` | `IC_MONTHLY` | Intercompany / Consolidation | CC, Segment, Intercompany | F |

#### Refresh Modes

| Mode | Strategy | Best For |
| ---- | -------- | -------- |
| `EVENT` | Incremental via event-driven projection (subscribes to posting events) | Near-real-time dashboards (C, D, E, F) |
| `BATCH` | Nightly or on-demand full rebuild | Low-volume tenants (A, B) |
| `HYBRID` | Event-driven + periodic full reconciliation | Operational cubes needing eventual consistency guarantees (D, F) |

#### Query Pattern Improvement

**Without cube** (raw ledger query):
```
gl_balance → dimension_set → dimension_set_item (×N) → dimension_value → filter/group
```

**With dimension_set_flat only** (Layer 1):
```sql
SELECT b.fiscal_year, b.period_number, coa.account_code,
       f.cost_center_value_id, SUM(b.period_debit - b.period_credit)
FROM fin.gl_balance b
JOIN fin.chart_of_accounts coa ON coa.id = b.account_id
LEFT JOIN fin.dimension_set_flat f ON f.dimension_set_id = b.dimension_set_id
WHERE b.tenant_id = ? GROUP BY 1, 2, 3, 4;
```

**With cube** (Layer 2):
```sql
SELECT fiscal_year, period_number, account_code,
       cost_center_value_id, amount_net
FROM fin.rpt_balance_cube
WHERE tenant_id = ? AND cube_code = 'FS_MONTHLY';
```

### 14.3 Schema Delta: journal_line.source_doc_line_id

Added in `196_purchase_invoice.sql`:

```sql
ALTER TABLE fin.journal_line ADD COLUMN IF NOT EXISTS source_doc_line_id uuid;
```

Links each JE line back to the specific source document line that generated it, enabling GL drill-through: GL Balance → JE Line → Source Invoice/Payment Line.

### 14.4 Generated Columns (Computed at Database Level)

| Table                   | Column             | Formula                                 |
| ----------------------- | ------------------ | --------------------------------------- |
| `fin.commitment`        | `remaining_amount` | `total_amount − fulfilled_amount`       |
| `fin.asset_book`        | `net_book_value`   | `cost_basis − accumulated_depreciation` |
| `fin.inventory_balance` | `total_value`      | `quantity_on_hand × unit_cost`          |
| `fin.work_order_cost`   | `variance`         | `actual_amount − planned_amount`        |
| `fin.tax_credit_ledger` | `net_position`     | `input_credits − output_liability`      |
| `fin.stocktake_line`    | `variance_qty`     | `counted_qty − system_qty`              |

### 14.5 PostgreSQL Enum Types

| Type                   | Values                                                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------------------------ |
| `fin.valuation_method` | `FIFO`, `LIFO`, `WEIGHTED_AVG`, `STANDARD`, `SPECIFIC`                                                       |
| `fin.movement_type`    | `RECEIPT`, `ISSUE_SALES`, `ISSUE_PRODUCTION`, `TRANSFER_OUT`, `TRANSFER_IN`, `ADJUSTMENT`, `SCRAP`, `RETURN` |
| `fin.stocktake_status` | `PLANNED`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`                                                           |

### 14.6 Hierarchical Structures

| Entity                  | Max Depth                       | Parent Column       | Use                  |
| ----------------------- | ------------------------------- | ------------------- | -------------------- |
| `fin.operating_unit`    | 3                               | `parent_id`         | Org hierarchy        |
| `fin.business_intent`   | Unlimited                       | `parent_id`         | Intent taxonomy      |
| `fin.funding_profile`   | 4                               | `parent_id`         | Budget hierarchy     |
| `fin.chart_of_accounts` | Unlimited                       | `parent_id`         | GL account tree      |
| `fin.cost_center`       | Unlimited                       | `parent_id`         | Cost allocation tree (legacy) |
| `fin.dimension_value`   | Unlimited (per `dimension_type.max_depth`) | `parent_id` | Universal dimension hierarchy |
| `fin.tax_jurisdiction`  | Unlimited                       | `parent_id`         | Jurisdiction nesting |
| `fin.legal_entity`      | Unlimited                       | `parent_entity_id`  | Corporate structure  |
| `fin.asset`             | Unlimited                       | `parent_asset_id`   | Component assets     |
| `fin.bill_of_materials` | Multi-level (via BOM explosion) | BOM line references | Manufacturing BOM    |

---

## 15. Blueprint Seed Data Specifications

### 15.1 Seed File Inventory

| File                                | Domain                       | Tables Seeded                                                                                   |
| ----------------------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------- |
| `290_seed_demo_finance.sql`         | Base finance (demo tenants)  | `fin.business_intent`, `fin.policy_module`, `fin.smart_default_rule`, `evt.projection_registry` |
| `291_seed_demo_org_units.sql`       | Org hierarchy                | `core.organizational_unit`, `fin.operating_unit` (+ DDL patch)                                  |
| `292_seed_demo_coa.sql`             | Chart of accounts            | `fin.chart_of_accounts`                                                                         |
| `293_seed_demo_fiscal.sql`          | Fiscal periods               | `fin.fiscal_period`                                                                             |
| `293b_seed_period_close_tasks.sql`  | Period close task catalogue  | `fin.period_close_task` (15 tasks, blueprint-scaled)                                            |
| `294_seed_demo_cost_profit.sql`     | Cost/profit centers (legacy) | `fin.cost_center`, `fin.profit_center` (+ OU default updates)                                   |
| `294b_seed_demo_dimensions.sql`    | Universal ledger dimensions  | `fin.dimension_type`, `fin.dimension_value`, `fin.dimension_policy`, `fin.ou_dimension_default`  |
| `294c_seed_demo_cubes.sql`         | Reporting cube definitions   | `fin.rpt_cube_definition` (A:1, B:1, C:2, D:3, E:2, F:4 cubes per blueprint)                   |
| `295_seed_demo_tax.sql`             | Tax jurisdictions & rates    | `fin.tax_jurisdiction`, `fin.tax_rate`                                                          |
| `296_seed_demo_accounting.sql`      | Accounting profiles          | `fin.accounting_profile`                                                                        |
| `297_seed_demo_funding.sql`         | Funding profiles             | `fin.funding_profile`                                                                           |
| `298_seed_demo_approval.sql`        | Approval workflows           | `meta.approval_template`, `meta.approval_template_stage`, `meta.approval_template_rule`         |
| `299_seed_demo_legal_entity.sql`    | Federation (F only)          | `fin.legal_entity`, `fin.intercompany_agreement`, `fin.fx_rate`                                 |
| `301_seed_demo_classification.sql`  | Classification engine        | `ent.classification_config`, `fin.spend_category`, `fin.category_intent_rule`                   |
| `325_seed_approval_definitions.sql` | Finance approval definitions | `wf.approval_definition` (6 templates for PI/PAY/MJE)                                           |

### 15.2 Base Finance Data (290 — All Tenants)

Identical for all 9 tenants:

- **22 Business Intents**: 8 OPEX + 5 CAPEX + 3 REVENUE + 2 TRANSFER + 2 REGULATORY + 2 ADMIN
- **8 Policy Modules**: Spending, vendor, budget, category, SoD, temporal, geo, contract
- **6 Smart Default Rules**: GL account, cost center, profit center, fund center, tax code, currency
- **8 Event Projections**: GL balance, funding state, commitment lifecycle, inventory, assets, commission, IC netting, WIP

### 15.3 OU Hierarchy by Blueprint (291)

**Blueprint A** (Freelancer):

```
COMPANY (Level 1)
```

**Blueprint B** (Small):

```
COMPANY (Level 1)
  └─ BRANCH-HQ (Level 2)
       ├─ DEPT-SALES (Level 3)
       ├─ DEPT-OPS (Level 3)
       └─ DEPT-ADMIN (Level 3)
```

**Blueprint C** (SME):

```
COMPANY (Level 1)
  ├─ DIV-PRODUCTS (Level 2)
  │    ├─ BRANCH-MAIN (Level 2)
  │    └─ DEPT-SALES (Level 3)
  └─ DIV-SERVICES (Level 2)
       ├─ BRANCH-SERVICES (Level 2)
       └─ DEPT-DELIVERY (Level 3)
```

**Blueprint D** (Big single country):

```
COMPANY (Level 1)
  ├─ REGION-EAST (Level 2)
  │    ├─ BRANCH-NYC (Level 2)
  │    │    ├─ DEPT-NYC-SALES (Level 3)
  │    │    └─ DEPT-NYC-OPS (Level 3)
  │    └─ BRANCH-ATL (Level 2)
  │         ├─ DEPT-ATL-SALES (Level 3)
  │         └─ DEPT-ATL-OPS (Level 3)
  ├─ REGION-WEST (Level 2)
  │    ├─ BRANCH-SF (Level 2)
  │    │    ├─ DEPT-SF-SALES (Level 3)
  │    │    └─ DEPT-SF-OPS (Level 3)
  │    └─ BRANCH-SEA (Level 2)
  │         ├─ DEPT-SEA-SALES (Level 3)
  │         └─ DEPT-SEA-OPS (Level 3)
  └─ SSC (Level 2)  ← Shared Services Center (OU, NOT entity_code)
```

**Blueprint E** (Multi-location):

```
COMPANY (Level 1)
  ├─ BRANCH-ZH (Level 2, Zurich)
  │    ├─ DEPT-ZH-SALES (Level 3)
  │    └─ DEPT-ZH-OPS (Level 3)
  ├─ BRANCH-GVA (Level 2, Geneva)
  │    ├─ DEPT-GVA-SALES (Level 3)
  │    └─ DEPT-GVA-OPS (Level 3)
  └─ BRANCH-BSL (Level 2, Basel)
       ├─ DEPT-BSL-SALES (Level 3)
       └─ DEPT-BSL-OPS (Level 3)
```

**Blueprint F** (Multi-country):

```
COMPANY (Level 1, Group shell)
  ├─ LE-CA (Level 2, entity_code='LE-CA')
  │    ├─ DEPT-CA-FIN (Level 3)
  │    └─ DEPT-CA-ADMIN (Level 3)
  ├─ LE-MY (Level 2, entity_code='LE-MY')
  │    ├─ DEPT-MY-OPS (Level 3)
  │    └─ DEPT-MY-SALES (Level 3)
  ├─ LE-SA (Level 2, entity_code='LE-SA')
  │    ├─ DEPT-SA-OPS (Level 3)
  │    └─ DEPT-SA-SALES (Level 3)
  └─ LE-IN (Level 2, entity_code='LE-IN')
       ├─ DEPT-IN-OPS (Level 3)
       └─ DEPT-IN-SALES (Level 3)
```

### 15.4 Chart of Accounts Structure (292)

All blueprints use subsets of a common numbering scheme:

| Range     | Type           | Blueprint A |    B    |    C    |    D    |    E    |    F     |
| --------- | -------------- | :---------: | :-----: | :-----: | :-----: | :-----: | :------: |
| 1000–1160 | Current Assets |      4      |    5    |    7    |    9    |    7    |   7×4    |
| 1200–1260 | Fixed Assets   |      —      |    —    |    4    |    6    |    4    |   4×4    |
| 1900      | IC Receivables |      —      |    —    |    —    |    1    |    —    |   1×4    |
| 2000–2220 | Liabilities    |      3      |    4    |    6    |    8    |    6    |   6×4    |
| 2900      | IC Payables    |      —      |    —    |    —    |    1    |    —    |   1×4    |
| 3000–3200 | Equity         |      2      |    2    |    3    |    3    |    3    |   3×4    |
| 4000–4900 | Revenue        |      2      |    3    |    5    |    5    |    5    |   5×4    |
| 5000–5400 | COGS           |      —      |    2    |    3    |    5    |    3    |   3×4    |
| 6000–6900 | OPEX           |      4      |    8    |   10    |   12    |   10    |   10×4   |
| 7000–8200 | Other Inc/Exp  |      —      |    —    |    3    |    3    |    3    |   3×4    |
| 9000      | Tax Provision  |      —      |    —    |    1    |    1    |    1    |   1×4    |
| **Total** |                |   **~18**   | **~26** | **~42** | **~52** | **~42** | **~168** |

Blueprint F replicates the C-level COA per legal entity entity_code (LE-CA, LE-MY, LE-SA, LE-IN).

### 15.5 Approval Workflows by Blueprint (298)

| Blueprint | Template        | Stages | Flow                                  | Threshold        |
| --------- | --------------- | ------ | ------------------------------------- | ---------------- |
| A         | `APPR-SOLO-1`   | 1      | Owner self-approval                   | —                |
| B         | `APPR-SMALL-2`  | 2      | Dept Head → Owner                     | 1,000            |
| C         | `APPR-SME-3`    | 3      | Dept Head → Div Manager → CFO         | 5,000 / 10,000   |
| D         | `APPR-ENT-3`    | 3      | Dept Head → Controller → CFO          | 10,000 / 50,000  |
| E         | `APPR-BRANCH-2` | 2      | Branch Manager → Group CFO            | 25,000           |
| F         | `APPR-ENTITY-3` | 3      | Entity Controller → Group CFO → Board | 50,000 / 100,000 |

**Role Codes Used**: `OWNER`, `DEPT_HEAD`, `DIV_MANAGER`, `CFO`, `CONTROLLER`, `BRANCH_MANAGER`, `GROUP_CFO`, `ENTITY_CONTROLLER`, `BOARD`

Approvals resolve to role codes (not user IDs). No HR organization dependency.

### 15.6 Finance Approval Definitions (325)

The `325_seed_approval_definitions.sql` seeds 6 approval templates into `wf.approval_definition`:

**Purchase Invoice (3 templates)**:

| Template       | Score Range | Amount   | Levels | Flow                                                                         |
| -------------- | ----------- | -------- | ------ | ---------------------------------------------------------------------------- |
| `PI_STANDARD`  | 0.75–0.90   | < 50k    | 1      | Cost center manager → dept head (escalation). 48h SLA.                       |
| `PI_ENHANCED`  | 0.50–0.75   | 50k–500k | 2      | Cost center manager (48h) → finance director (72h)                           |
| `PI_EXECUTIVE` | 0.25–0.50   | > 500k   | 3      | Cost center manager (24h) → finance director (48h) → CFO (72h, notifies CEO) |

**Payment Entry (2 templates)**:

| Template         | Amount  | Levels | Flow                                                   |
| ---------------- | ------- | ------ | ------------------------------------------------------ |
| `PAY_STANDARD`   | < 100k  | 1      | Treasury analyst (24h) → treasury manager (escalation) |
| `PAY_HIGH_VALUE` | >= 100k | 2      | Treasury manager (24h) → CFO (48h, notifies CEO)       |

**Manual JE (1 template)**:

| Template       | Route                       | Levels | Flow                                                                                                                              |
| -------------- | --------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------- |
| `MJE_STANDARD` | STANDARD/ENHANCED/EXECUTIVE | 2      | GL controller (24h) → finance director. `directPostMode` allows auto-post for amounts ≤ 10k with `fin.je.direct_post` permission. |

All templates enforce SOD: submitter cannot approve. Seeds to all tenants via replication.

### 15.7 Seed Data Row Counts

| Seed File | Tables                  | Approx Rows |
| --------- | ----------------------- | ----------- |
| 290       | 4 tables                | ~396        |
| 291       | 2 tables                | ~124        |
| 292       | 1 table                 | ~434        |
| 293       | 1 table                 | ~156        |
| 294       | 2 tables (+ OU updates) | ~60         |
| 295       | 2 tables                | ~75         |
| 296       | 1 table                 | ~55         |
| 297       | 1 table                 | ~45         |
| 298       | 3 tables                | ~47         |
| 299       | 3 tables                | ~15         |
| **Total** | **20 tables**           | **~1,407**  |

---

## 16. Configuration & Feature Flags

### 16.1 Runtime Configuration

The finance engines are configured through `framework/runtime/src/kernel/config.schema.ts`:

```typescript
{
  db: {
    url: string,        // PgBouncer connection
    adminUrl: string,   // Direct Postgres (DDL operations)
    poolMax: number      // Connection pool size (default: 10)
  },
  // Engine-specific feature flags are runtime-evaluated
}
```

### 16.2 Key Feature Flags

| Flag                        | Default | Description                                                                                |
| --------------------------- | ------- | ------------------------------------------------------------------------------------------ |
| `financeEngines.budget`     | `true`  | Enable/disable budget engine. When `false`, funding profiles are ignored (LEFT JOIN safe). |
| `financeEngines.atlas`      | `false` | Enable Atlas AI engine. L1/L2/L3 autonomy levels.                                          |
| `financeEngines.federation` | `false` | Enable multi-entity federation. Required for Blueprint F.                                  |
| `financeEngines.production` | `false` | Enable production/WIP engine.                                                              |
| `financeEngines.inventory`  | `false` | Enable inventory subledger.                                                                |
| `financeEngines.commission` | `false` | Enable commission engine.                                                                  |

### 16.3 Database Provisioning

The seed system (`framework/adapters/db/src/seed/seed.ts`) manages all schema and data provisioning:

```bash
npx tsx src/seed/seed.ts                 # Run all (DDL + seed)
npx tsx src/seed/seed.ts --ddl-only      # DDL only (001–199)
npx tsx src/seed/seed.ts --seed-only     # Seed only (200+)
npx tsx src/seed/seed.ts --reset         # Drop all schemas + re-provision
npx tsx src/seed/seed.ts --status        # Show provision status
npx tsx src/seed/seed.ts --force         # Re-run even if checksum unchanged
```

Files are tracked via `public.schema_provisions` with checksum-based change detection (djb2 hash). Files with prefix ≥ 200 are classified as seed data.

---

## 17. Cross-Cutting Concerns

### 17.1 Multi-Tenancy

- Every table includes `tenant_id` as the primary isolation dimension
- All unique constraints are tenant-scoped
- All indexes include `tenant_id` for efficient tenant-specific queries
- Cross-tenant queries are never permitted

### 17.2 Audit Trail

Multiple audit mechanisms operate simultaneously:

| Mechanism                | Scope                          | Storage                                       |
| ------------------------ | ------------------------------ | --------------------------------------------- |
| Event Store              | All financial state changes    | `evt.event` (partitioned, immutable)          |
| Policy Evaluation Log    | Decision Grid policy decisions | `fin.policy_evaluation_log` (immutable, MC-5) |
| Funding Transactions     | Budget lifecycle actions       | `fin.funding_transaction`                     |
| Asset Transactions       | Asset lifecycle events         | `fin.asset_transaction`                       |
| Tax Calculations         | Per-transaction tax audit      | `fin.tax_calculation`                         |
| AI Predictions + Actions | AI decision trail              | `fin.ai_prediction`, `fin.ai_action`          |

### 17.3 Idempotency

All write operations support idempotency through one of:

- `idempotency_key` column with UNIQUE constraint (Event Store, Funding Transaction)
- `ON CONFLICT (unique_key) DO UPDATE SET updated_at = now()` (most tables)
- `ON CONFLICT DO NOTHING` (tables without `updated_at`)
- `IF NOT EXISTS` guard with `md5()` hash comparison (approval template rules)

### 17.4 Monetary Precision

**MC-4 Mandate**: All monetary amounts use `DECIMAL(18,4)` in the database and string-based `BigInt` arithmetic in the runtime. No floating-point operations exist anywhere in the financial processing chain.

**FX Rate Precision**: `DECIMAL(18,10)` for exchange rates to preserve sufficient precision across currency pairs.

### 17.5 Boundary Rules

| Engine      | Rule                                                              |
| ----------- | ----------------------------------------------------------------- |
| Event Store | All writes are append-only. No updates or deletes.                |
| Budget      | Only `FundLifecycleService` may mutate FP amounts.                |
| Commitment  | Never mutates FP directly — emits events for Budget Engine.       |
| Posting     | Double-entry invariant enforced at DB level. Period must be OPEN. |
| Tax         | No cross-currency calculations without explicit FX conversion.    |
| Atlas AI    | L3 actions auto-execute only at confidence ≥ 95%.                 |

---

## 18. Appendices

### A. Upsert Key Reference

| Table                          | Unique Key                                               | ON CONFLICT Pattern      |
| ------------------------------ | -------------------------------------------------------- | ------------------------ |
| `core.organizational_unit`     | `(tenant_id, code)`                                      | DO UPDATE SET updated_at |
| `fin.operating_unit`           | `(tenant_id, entity_code, code)`                         | DO UPDATE SET updated_at |
| `fin.business_intent`          | `(tenant_id, code)`                                      | DO UPDATE SET updated_at |
| `fin.chart_of_accounts`        | `(tenant_id, entity_code, account_code)`                 | DO UPDATE SET updated_at |
| `fin.fiscal_period`            | `(tenant_id, entity_code, fiscal_year, period_number)`   | DO NOTHING               |
| `fin.period_close_task`        | `(tenant_id, entity_code, task_code)`                    | DO NOTHING               |
| `fin.cost_center`              | `(tenant_id, entity_code, code)`                         | DO UPDATE SET name       |
| `fin.profit_center`            | `(tenant_id, entity_code, code)`                         | DO UPDATE SET name       |
| `fin.tax_jurisdiction`         | `(tenant_id, code)`                                      | DO UPDATE SET name       |
| `fin.tax_rate`                 | `(tenant_id, jurisdiction_id, tax_code, effective_from)` | DO UPDATE SET rate       |
| `fin.accounting_profile`       | `(tenant_id, entity_code, code)`                         | DO UPDATE SET updated_at |
| `fin.funding_profile`          | `(tenant_id, entity_code, code, fiscal_year)`            | DO UPDATE SET updated_at |
| `fin.policy_module`            | `(tenant_id, module_id, module_version)`                 | DO UPDATE SET updated_at |
| `evt.projection_registry`      | `(tenant_id, projection_id)`                             | DO UPDATE SET updated_at |
| `meta.approval_template`       | `(tenant_id, code, version_no)`                          | DO UPDATE SET updated_at |
| `meta.approval_template_stage` | `(tenant_id, approval_template_id, stage_no)`            | DO UPDATE SET name       |
| `meta.approval_template_rule`  | None (guarded)                                           | IF NOT EXISTS + md5()    |
| `fin.legal_entity`             | `(tenant_id, code)`                                      | DO UPDATE SET updated_at |
| `fin.intercompany_agreement`   | `(tenant_id, source, dest, agreement_type)`              | DO NOTHING               |
| `fin.fx_rate`                  | `(tenant_id, from, to, rate_type, effective_date)`       | DO UPDATE SET rate       |

### B. End-to-End Transaction Example

**Scenario**: Purchase Order submission in Blueprint D (demo_us)

1. **INTAKE**: User submits PO for $45,000 office equipment → Assign `txn_id`, `correlation_id`
2. **OU_VALIDATION**: Verify BRANCH-NYC is ACTIVE → Pass
3. **INTENT_RESOLUTION**: Category "equipment" → Resolve `CAPEX-EQUIPMENT` intent
4. **SMART_DEFAULTS**:
   - GL Account: `1210` (Machinery & Equipment) from intent default
   - Cost Center: `CC-NYC-OPS` from OU default
   - Profit Center: `PC-EAST` from region
   - Funding Profile: `FP-NYC` from OU default
   - Tax Code: `SALES-NY` from jurisdiction
5. **FUNDING_CHECK**: FP-NYC available $1.2M, requested $45K → GREEN, RESERVE $45K
6. **COMMITMENT_CREATION**: Create PO commitment → emit `commitment.created`
7. **POLICY_EVALUATION**: POL-SPEND (≤$50K limit for dept heads) → APPROVE (score 0.3)
8. **RISK_SCORING**: Amount pattern normal, vendor known → Low risk (score 25)
9. **WORKFLOW_ASSEMBLY**: Composite score = 28 → `STANDARD` path → Route to DEPT_HEAD
10. **TAX_CALCULATION**: NY Sales Tax 8% on $45,000 = $3,600
11. **AI_ENHANCEMENT**: Similar POs approved historically → Confidence 0.85
12. **FINALIZATION**: Snapshot pipeline state → COMPLETED

### C. File Locations

| Category                  | Path                                                                               |
| ------------------------- | ---------------------------------------------------------------------------------- |
| DDL (Event Store)         | `framework/adapters/db/src/sql/150_event_store.sql`                                |
| DDL (OU + Intent)         | `framework/adapters/db/src/sql/155_ou_intent.sql`                                  |
| DDL (Spend Category)      | `framework/adapters/db/src/sql/157_spend_category.sql`                             |
| DDL (Classification)      | `framework/adapters/db/src/sql/071_ent_classification.sql`                         |
| DDL (Decision Grid)       | `framework/adapters/db/src/sql/160_decision_grid.sql`                              |
| DDL (Budget)              | `framework/adapters/db/src/sql/170_budget.sql`                                     |
| DDL (Commitment)          | `framework/adapters/db/src/sql/180_commitment.sql`                                 |
| DDL (Posting)             | `framework/adapters/db/src/sql/190_posting.sql`                                    |
| DDL (Tax)                 | `framework/adapters/db/src/sql/195_tax.sql`                                        |
| DDL (Asset)               | `framework/adapters/db/src/sql/161_asset.sql`                                      |
| DDL (Inventory)           | `framework/adapters/db/src/sql/162_inventory.sql`                                  |
| DDL (Commission)          | `framework/adapters/db/src/sql/163_commission.sql`                                 |
| DDL (Federation)          | `framework/adapters/db/src/sql/164_federation.sql`                                 |
| DDL (Production)          | `framework/adapters/db/src/sql/165_production.sql`                                 |
| DDL (Atlas AI)            | `framework/adapters/db/src/sql/166_atlas_ai.sql`                                   |
| DDL (Approval)            | `framework/adapters/db/src/sql/040_meta.sql`                                       |
| DDL (Purchase Invoice)    | `framework/adapters/db/src/sql/07_finance/196_purchase_invoice.sql`                |
| DDL (Payment Entry)       | `framework/adapters/db/src/sql/07_finance/197_payment_entry.sql`                   |
| DDL (Bank Reconciliation) | `framework/adapters/db/src/sql/07_finance/199_bank_reconciliation.sql`             |
| Seed (290–301)            | `framework/adapters/db/src/sql/10_seed_standard/29x_seed_*.sql`, `30x_*.sql`       |
| Seed (Approval Defs)      | `framework/adapters/db/src/sql/10_seed_standard/325_seed_approval_definitions.sql` |
| Runtime Engines           | `framework/runtime/src/services/business/engines/`                                 |
| Shared Foundations        | `framework/runtime/src/services/business/engines/shared/`                          |
| Accounting Module         | `framework/runtime/src/services/business/finance/accounting/`                      |
| Payments Module           | `framework/runtime/src/services/business/finance/payments/`                        |
| Banking Module            | `framework/runtime/src/services/business/finance/banking/`                         |
| Finance Shared            | `framework/runtime/src/services/business/finance/shared/`                          |
| Finance Tests             | `framework/runtime/src/services/business/finance/__tests__/`                       |
| Budget Tests              | `framework/runtime/src/services/business/engines/budget-engine/__tests__/`         |
| UI Detail Components      | `products/neon/apps/web/components/finance/`                                       |
| UI List Explorers         | `products/neon/apps/web/components/finance/list/`                                  |
| List Config Factories     | `products/neon/apps/web/components/finance/list/*-list-config.tsx`                  |
| Shared Cell Renderers     | `products/neon/apps/web/components/finance/list/finance-shared.tsx`                 |
| Tab Plugins               | `products/neon/apps/web/lib/entity-page/plugins/finance-plugin.tsx`                |
| Finance Hooks             | `products/neon/apps/web/lib/finance/use-finance-list.ts`                           |
| Finance Types (Web)       | `products/neon/apps/web/lib/finance/types.ts`                                      |
| Module Definitions        | `framework/runtime/src/services/business/finance/*/module.json`                    |
| Dashboard Contributions   | `framework/runtime/src/services/business/finance/*/dashboard.contribution.json`    |
| DI Tokens                 | `framework/runtime/src/kernel/tokens.ts`                                           |
| Config Schema             | `framework/runtime/src/kernel/config.schema.ts`                                    |
| Seed CLI                  | `framework/adapters/db/src/seed/seed.ts`                                           |

### D. Verification Queries

```sql
-- Row counts across all financial tables
SELECT 'fin.business_intent' as tbl, COUNT(*) FROM fin.business_intent
UNION ALL SELECT 'fin.operating_unit', COUNT(*) FROM fin.operating_unit
UNION ALL SELECT 'fin.chart_of_accounts', COUNT(*) FROM fin.chart_of_accounts
UNION ALL SELECT 'fin.fiscal_period', COUNT(*) FROM fin.fiscal_period
UNION ALL SELECT 'fin.period_close_task', COUNT(*) FROM fin.period_close_task
UNION ALL SELECT 'fin.cost_center', COUNT(*) FROM fin.cost_center
UNION ALL SELECT 'fin.profit_center', COUNT(*) FROM fin.profit_center
UNION ALL SELECT 'fin.tax_jurisdiction', COUNT(*) FROM fin.tax_jurisdiction
UNION ALL SELECT 'fin.tax_rate', COUNT(*) FROM fin.tax_rate
UNION ALL SELECT 'fin.accounting_profile', COUNT(*) FROM fin.accounting_profile
UNION ALL SELECT 'fin.funding_profile', COUNT(*) FROM fin.funding_profile
UNION ALL SELECT 'meta.approval_template', COUNT(*) FROM meta.approval_template
UNION ALL SELECT 'fin.legal_entity', COUNT(*) FROM fin.legal_entity
UNION ALL SELECT 'fin.intercompany_agreement', COUNT(*) FROM fin.intercompany_agreement
UNION ALL SELECT 'fin.fx_rate', COUNT(*) FROM fin.fx_rate
ORDER BY 1;

-- Blueprint F spot-check: Legal entities
SELECT code, name, entity_type, functional_currency, ownership_pct
FROM fin.legal_entity
WHERE tenant_id = (SELECT id FROM core.tenant WHERE code = 'demo_ca')
ORDER BY entity_type, code;

-- Blueprint F spot-check: OU ↔ Legal Entity mapping
SELECT le.code AS legal_entity, ou.entity_code, ou.code AS ou_code, ou.name
FROM fin.legal_entity le
JOIN fin.operating_unit ou ON ou.tenant_id = le.tenant_id AND ou.entity_code = le.code
WHERE le.tenant_id = (SELECT id FROM core.tenant WHERE code = 'demo_ca')
ORDER BY le.code;

-- Blueprint A spot-check: Minimal configuration
SELECT
  (SELECT COUNT(*) FROM fin.operating_unit WHERE tenant_id = t.id) AS ous,
  (SELECT COUNT(*) FROM fin.chart_of_accounts WHERE tenant_id = t.id) AS accounts,
  (SELECT COUNT(*) FROM fin.funding_profile WHERE tenant_id = t.id) AS funding,
  (SELECT COUNT(*) FROM fin.legal_entity WHERE tenant_id = t.id) AS legal_entities
FROM core.tenant t WHERE t.code = 'demo_my';

-- v2.2: Document service tables
SELECT 'fin.document_sequence' as tbl, COUNT(*) FROM fin.document_sequence
UNION ALL SELECT 'fin.purchase_invoice', COUNT(*) FROM fin.purchase_invoice
UNION ALL SELECT 'fin.purchase_invoice_line', COUNT(*) FROM fin.purchase_invoice_line
UNION ALL SELECT 'fin.payment_entry', COUNT(*) FROM fin.payment_entry
UNION ALL SELECT 'fin.payment_allocation', COUNT(*) FROM fin.payment_allocation
UNION ALL SELECT 'fin.bank_statement', COUNT(*) FROM fin.bank_statement
UNION ALL SELECT 'fin.bank_statement_line', COUNT(*) FROM fin.bank_statement_line
UNION ALL SELECT 'fin.reconciliation_session', COUNT(*) FROM fin.reconciliation_session
ORDER BY 1;
```

### E. Test Coverage Matrix (69 tests)

**Run**: `npx vitest run --reporter=verbose` from project root

#### Test Suite Summary

| Test File                           | Tests | Domain                        | Key Validations                                               |
| ----------------------------------- | ----- | ----------------------------- | ------------------------------------------------------------- |
| `purchase-invoice-lifecycle.test.ts`| 16    | Invoice CRUD + Posting        | 12-step lifecycle, budget ops, tax splits, outbox events      |
| `payment-lifecycle.test.ts`         | 7     | Payment Posting               | Gross settlement JE, WHT, discounts, concurrent overpay lock  |
| `manual-je-lifecycle.test.ts`       | 2     | Journal Entries               | Fractional precision, period enforcement                      |
| `gl-inquiry.test.ts`               | 3     | GL Reporting                  | Trial balance, drill-down chain, reversal modes               |
| `money-library.test.ts`            | 12    | MC-4 Arithmetic               | No-float-drift, HALF_UP rounding, rate precision              |
| `handler-contracts.test.ts`        | 3     | HTTP Error Mapping             | INVALID_STATUS, CROSS_SUPPLIER, OVERPAYMENT codes             |
| `bank-reconciliation.test.ts`      | 13    | Bank Matching                  | 3-pass algorithm, confidence scoring, session lifecycle       |
| Budget lifecycle (engine tests)     | 6     | Budget Operations              | RESERVE/COMMIT/CONSUME/RELEASE, over-budget rejection         |
| **Total**                           | **69**|                               |                                                               |

#### Architectural Patterns Validated Across Tests

| Pattern                      | Tests Covering It                                                        |
| ---------------------------- | ------------------------------------------------------------------------ |
| Multi-engine orchestration   | Invoice lifecycle (budget + tax + approval + posting + outbox)            |
| Decimal-string arithmetic    | Money library (12 tests), JE balance validation, payment JE proof        |
| GL drill-down chain          | GL inquiry (sourceDocLineId → allocation → invoice)                      |
| Transaction boundaries       | Payment post (BEGIN/COMMIT/ROLLBACK), invoice post (atomic core)         |
| Outbox pattern               | Invoice lifecycle (inventory, asset, commission, federation handlers)     |
| Decision grid scoring        | Invoice submit (composite score → approval route determination)          |
| Idempotent operations        | Bank reconciliation (idempotent session start), document creation         |
| Optimistic concurrency       | Invoice update (assertVersion), line set (version parameter)             |

#### Purchase Invoice Lifecycle (16 tests)

| #   | Test                                  | Assertion                                                           |
| --- | ------------------------------------- | ------------------------------------------------------------------- |
| T1  | Create + add lines → defaults resolve | `OUIntentResolver.resolveDefaults` called, line defaults populated  |
| T2  | Submit → Decision Grid → approval     | `decisionGrid.evaluate` called, `approvalOps.createInstance` called |
| T3  | Low-amount → zero-approval bypass     | Status jumps to APPROVED, no approval created                       |
| T4  | Submit with fp_id → budget RESERVED   | `budgetOps.reserve` called with correct amount                      |
| T5  | Approve → budget COMMITTED            | `budgetOps.commit` called on approval event                         |
| T6  | Post → JE + GL updated                | `postingService.createAndPost` called with Dr/Cr lines              |
| T7  | Post with tax → Dr Tax Input Credit   | JE lines include TAX_INPUT_CREDIT debit                             |
| T8  | CAPEX → asset creation context        | Post succeeds with CAPEX intent domain in outbox event              |
| T9  | item_id → inventory receipt outbox    | Outbox event contains inventory line data                           |
| T10 | IC supplier → federation outbox       | Outbox event contains supplier info for IC handler                  |
| T11 | Commission → commission outbox        | Outbox event emitted for commission handler                         |
| T12 | Budget CONSUMED on post               | `budgetOps.consume` called                                          |
| T23 | Cancel POSTED → reversal + release    | `postingService.reverse` + `budgetOps.release`                      |
| T24 | Cancel SUBMITTED → approval cancel    | `approvalOps.cancelInstance` + `budgetOps.release`                  |
| T25 | Reject → back to DRAFT + release      | Status reverts, budget released                                     |
| T28 | Post twice → rejected                 | Returns ALREADY_POSTED                                              |

#### Payment Lifecycle (7 tests)

| #      | Test                               | Assertion                                             |
| ------ | ---------------------------------- | ----------------------------------------------------- |
| T13    | Post → Dr AP Cr Bank               | JE total debit = total credit = 1000                  |
| T14    | WHT → Cr WHT Payable               | JE includes WHT credit line (WHT 100, net 900)        |
| T15    | Concurrent overpay → 409           | Second allocation exceeds remaining → OVERPAYMENT     |
| T16    | Invoice status → PAID              | `updatePaidAmount` called, status transitions to PAID |
| T26    | Cross-supplier → 400               | Returns CROSS_SUPPLIER                                |
| T27    | Balanced JE proof                  | Dr AP 1000 = Cr Bank 850 + Cr WHT 100 + Cr Disc 50    |
| T17-18 | Commitment + commission settlement | Spec tests (todo markers)                             |

#### Manual JE Lifecycle (2 tests)

| #   | Test                              | Assertion                           |
| --- | --------------------------------- | ----------------------------------- |
| T19 | 3x "33.3333" = "99.9999" balanced | `validateDoubleEntry` returns valid |
| T20 | HARD_CLOSE period → rejected      | Returns PERIOD_CLOSED               |

#### GL Inquiry (3 tests)

| #   | Test                   | Assertion                                               |
| --- | ---------------------- | ------------------------------------------------------- |
| T21 | Trial balance balanced | Sum debits = sum credits                                |
| T22 | Drill-down chain       | Rows have sourceDocLineId linking to invoice/allocation |
| T30 | Reversed entry modes   | NETTED vs SEPARATE produce different result shapes      |

#### Money Library (12 tests)

| #   | Test                            | Assertion                                                       |
| --- | ------------------------------- | --------------------------------------------------------------- |
| T29 | multiplyByRate precision        | `money("100") * "0.185"` = `"18.5000"` (HALF_UP, not truncated) |
| —   | sumAmounts no float drift       | `"0.1000" + "0.2000"` = `"0.3000"`                              |
| —   | compareAmounts                  | Returns -1, 0, 1 correctly                                      |
| —   | isZero                          | Detects zero values                                             |
| —   | toRatio                         | Produces decimal string, not Money                              |
| —   | 3 equal fractions sum           | `"33.3333" + "33.3333" + "33.3334"` = `"100.0000"`              |
| —   | (6 additional arithmetic tests) | Addition, subtraction, formatting, inverse operations           |

#### Handler Contracts (3 tests)

| #    | Test                                | Assertion              |
| ---- | ----------------------------------- | ---------------------- |
| T31  | POST lines when status!=DRAFT → 400 | Returns INVALID_STATUS |
| T32a | Cross-supplier payment → 400        | Returns CROSS_SUPPLIER |
| T32b | Overpay payment → 409               | Returns OVERPAYMENT    |

#### Bank Reconciliation (13 tests)

| #   | Test                          | Assertion                                                   |
| --- | ----------------------------- | ----------------------------------------------------------- |
| —   | Pass 1 exact match            | Amount + reference + date → confidence 97 (EXACT)           |
| —   | Pass 2 fuzzy reference        | Amount + Levenshtein ≤ 3 → confidence 80-94 (FUZZY_REF)     |
| —   | Pass 3 amount only            | Exact amount within 5 days → confidence 60-79 (AMOUNT_ONLY) |
| —   | No match on amount mismatch   | Even 1 cent difference → no match                           |
| —   | No double-matching            | Each payment matched at most once                           |
| —   | Import statement              | Creates header + lines with sequential lineNo               |
| —   | Start reconciliation          | Creates OPEN session, marks IN_PROGRESS                     |
| —   | Idempotent start              | Returns existing OPEN session                               |
| —   | Auto-match dispatches         | Applies ≥90 confidence matches                              |
| —   | Manual match                  | MANUAL_MATCHED with confidence 100                          |
| —   | Unmatch reverts               | Line back to UNMATCHED                                      |
| —   | Unmatch blocked for CONFIRMED | Error code CONFIRMED                                        |
| —   | Complete reconciliation       | Calls reconcilePayment, confirms all, completes session     |

#### Budget Lifecycle Integration (6 tests)

| #   | Test                    | Assertion                        |
| --- | ----------------------- | -------------------------------- |
| —   | RESERVE → funds locked  | reserved=10k, health GREEN       |
| —   | COMMIT → confirmed      | reserved→0, committed→10k        |
| —   | CONSUME → spent         | committed→0, consumed→10k        |
| —   | RELEASE → returned      | released=10k                     |
| —   | Over-budget → rejection | FP_BREACH error                  |
| —   | Partial RELEASE         | released=3k, health recalculated |

### F. End-to-End Purchase Invoice Lifecycle Example

**Scenario**: Non-PO invoice for IT equipment, Blueprint D (demo_us), amount $2,400

```
1. CREATE (DRAFT)
   POST /api/fin/purchase-invoices
   → INV-2026-00042, supplier=DELL, ou=BRANCH-NYC, intent=CAPEX-IT

2. SET LINES
   POST /api/fin/purchase-invoices/:id/lines
   → Line 1: "Dell Latitude 5550" qty=1, unitPrice="2400.0000"
   → resolveLineDefaults → GL=1210, CC=CC-NYC-OPS, FP=FP-NYC

3. SUBMIT (DRAFT → SUBMITTED)
   POST /api/fin/purchase-invoices/:id/submit
   → Decision Grid: composite=0.45, route=STANDARD
   → Budget: RESERVE $2,400 on FP-NYC
   → Approval: create instance, route to DEPT_HEAD

4. APPROVE (SUBMITTED → APPROVED)
   onApprovalComplete(approved)
   → Budget: COMMIT (reserved→committed)

5. POST (APPROVED → POSTED)
   POST /api/fin/purchase-invoices/:id/post
   → Tax: NY Sales Tax 8% = $192 (non-recoverable → ADD_TO_BASE_LINE)
   → JE: Dr 1210 Equipment $2,592 | Cr 2110 AP $2,592
   → Budget: CONSUME
   → Outbox: "finance.document.posted" → AssetWIPHandler (CAPEX)

6. PAYMENT
   POST /api/fin/payments
   → PAY-2026-00001, method=WIRE, total=$2,592
   → Allocate: invoice INV-2026-00042, allocated=$2,592, WHT=$0, disc=$0
   → Post: Dr 2110 AP $2,592 | Cr 1010 Bank $2,592
   → Invoice status → PAID

7. RECONCILIATION
   Import bank statement → auto-match PAY-2026-00001 (EXACT, conf=97)
   → Complete → payment status → RECONCILED
```

### G. End-to-End Payment with WHT & Discount Example

**Scenario**: Payment for two invoices with WHT and early-payment discount, Blueprint C (demo_fr)

```
1. CREATE (DRAFT)
   POST /api/fin/payments
   → PAY-2026-00015, supplier=ACME-FR, method=WIRE, total=€10,000

2. ADD ALLOCATIONS
   POST /api/fin/payments/:id/allocations
   → Allocation 1: INV-2026-00081, allocated=€6,000, WHT=€300, discount=€120
   → Allocation 2: INV-2026-00085, allocated=€4,000, WHT=€200, discount=€0
   → Sum check: 6,000 + 4,000 = 10,000 ✓

3. SUBMIT (DRAFT → SUBMITTED)
   POST /api/fin/payments/:id/submit
   → Decision Grid: composite=0.32, route=STANDARD
   → Approval: route to TREASURY_ANALYST

4. APPROVE (SUBMITTED → APPROVED)
   onApprovalComplete(approved)

5. POST (APPROVED → POSTED) — Transactional
   POST /api/fin/payments/:id/post
   BEGIN TRANSACTION
     → SELECT ... FOR UPDATE on INV-2026-00081, INV-2026-00085
     → Validate: same supplier ✓, allocations ≤ remaining ✓
     → Build gross settlement JE:
       Dr 2110 AP Control  €6,000  (alloc 1)
       Dr 2110 AP Control  €4,000  (alloc 2)
       Cr 2200 WHT Payable   €500  (300 + 200)
       Cr 7100 Disc Income   €120  (120 + 0)
       Cr 1010 Bank Account €9,380 (10,000 − 500 − 120)
       Proof: Dr 10,000 = Cr 10,000 ✓
     → PostingService.createAndPost() within same TX
     → INV-2026-00081: paidAmount += 6,000 → PARTIALLY_PAID
     → INV-2026-00085: paidAmount += 4,000 → PAID
   COMMIT

6. RECONCILIATION
   Import statement → auto-match €9,380 wire (EXACT, conf=97)
   → Complete → PAY-2026-00015 status → RECONCILED
```

### H. Bank Reconciliation 3-Pass Algorithm Detail

**Scenario**: Statement with 5 lines matched against 4 posted payments

```
Input:
  Statement Lines:             Payments:
  L1: -€1,000  REF-001  Jan-15   P1: €1,000  REF-001  Jan-14 (1 day diff)
  L2: -€2,500  REF-X02  Jan-16   P2: €2,500  REF-002  Jan-16 (Levenshtein=2)
  L3: -€750    REF-003  Jan-18   P3: €750    ---      Jan-20 (no ref, 2 day)
  L4: +€500    (credit)          P4: €3,000  REF-004  Jan-22
  L5: -€3,100  REF-999  Jan-25

Pass 1 — EXACT:
  L1 ↔ P1: amount ✓, ref exact ✓, date ≤3 days ✓ → confidence=97 → AUTO_APPLIED
  Result: L1=AUTO_MATCHED

Pass 2 — FUZZY_REF:
  L2 ↔ P2: amount ✓, Levenshtein("REF-X02","REF-002")=1 ≤ 3 ✓ → confidence=87
  Result: L2=AUTO_MATCHED (≥90 threshold? 87 < 90 → flagged for review)

Pass 3 — AMOUNT_ONLY:
  L3 ↔ P3: amount ✓, date diff=2 days ≤ 5 ✓ → confidence=72
  Result: L3=flagged for review (72 < 90)

Skipped:
  L4: CREDIT line → not eligible (only DEBIT matched)
  L5: no payment match for €3,100

Session Counts:
  total=5, auto_matched=1, manual_matched=0, unmatched=3, excluded=1 (credit)
```

### I. Version History

| Version | Date       | Changes                                                                                             |
| ------- | ---------- | --------------------------------------------------------------------------------------------------- |
| 2.0     | 2026-02-01 | Initial specification: 13 engines, event store, decision grid, budget, commitment, posting, tax     |
| 2.1     | 2026-02-15 | Added document services (PI, Payment, Manual JE, GL Inquiry), bank reconciliation, outbox pattern   |
| 2.2     | 2026-03-03 | Added HTTP API reference (36 endpoints), UI components (5 detail + 4 tab plugins), test matrix (69) |
| 2.3     | 2026-03-07 | Added 14th engine (Period Close Governance), module registry (6 modules, subscription tiers), 5 dashboard contributions (KPIs, charts, ACL), list explorer system (3 explorers + shared renderers + ListPageConfig factory), ReconciliationReport component, enhanced test coverage matrix with architectural pattern validation, expanded file locations, end-to-end payment example with WHT/discount, bank reconciliation algorithm walkthrough |
