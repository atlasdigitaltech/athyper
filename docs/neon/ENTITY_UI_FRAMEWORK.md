# Neon Entity UI Framework — Technical Specification

> Single-page, capability-driven entity rendering for the Athyper platform.
> React is a renderer. Engines are authoritative.

**Status**: Locked Specification
**Owner**: Platform Engineering
**Last Updated**: 2026-02-11

---

## Table of Contents

1. [Core Principle](#1-core-principle)
2. [Architecture Overview](#2-architecture-overview)
3. [Descriptor Schema (Locked)](#3-descriptor-schema-locked)
4. [Reason Code Taxonomy (Locked)](#4-reason-code-taxonomy-locked)
5. [Action Groups (Locked)](#5-action-groups-locked)
6. [Backend: Entity Page Descriptor Engine](#6-backend-entity-page-descriptor-engine)
7. [API Surface](#7-api-surface)
8. [Frontend: Universal Entity Page Shell](#8-frontend-universal-entity-page-shell)
9. [Plugin System](#9-plugin-system)
10. [Plugin Specifications](#10-plugin-specifications)
11. [Unified Timeline](#11-unified-timeline)
12. [Master Change Request / Diff (Phase 2)](#12-master-change-request--diff-phase-2)
13. [Posting Plugin (Phase 2)](#13-posting-plugin-phase-2)
14. [Cross-Cutting Quality Gates](#14-cross-cutting-quality-gates)
15. [Canonical Page Layout](#15-canonical-page-layout)
16. [UX Patterns](#16-ux-patterns)
17. [Backend Alignment Matrix](#17-backend-alignment-matrix)
18. [Implementation Phases](#18-implementation-phases)
19. [Definition of Done](#19-definition-of-done)
20. [Appendix A: Existing Type Definitions](#appendix-a-existing-type-definitions)
21. [Appendix B: Existing Service Contracts](#appendix-b-existing-service-contracts)
22. [Appendix C: Database Tables](#appendix-c-database-tables)

---

## 1. Core Principle

### Everything is an Entity Page

One page skeleton renders all entities. Differences come only from:

| Input | Source | Purpose |
|-------|--------|---------|
| `entityClass` | `EntityClassificationService.getClassification()` | MASTER / DOCUMENT / CONTROL |
| `featureFlags` | `EntityFeatureFlags` from `meta.entity.feature_flags` JSONB | Toggles capabilities |
| `compiledModel` | `MetaCompiler.compile()` → `CompiledModel` | Field definitions, validation, SQL |
| `entityState` | `LifecycleManager.getCurrentState()` + `ApprovalService.getInstanceForEntity()` | Current lifecycle + approval status |
| `policyContext` | `PolicyGate.authorize()` | What the user can see and do |

**Result**: One UI framework, many behaviors. No entity-specific React pages.

### Entity Classes

Entity classification drives layout presets and system-generated columns:

| Kind (DB) | EntityClass | Layout Preset | System Columns |
|-----------|-------------|---------------|----------------|
| `ref`, `mdm` | `MASTER` | Stable attributes + related lists | `entity_type_code`, `status`, `source_system`, `metadata` |
| `ent` | `CONTROL` | Configuration forms | `entity_type_code`, `status`, `source_system`, `metadata` |
| `doc` | `DOCUMENT` | Header + Lines + Totals | All common + `document_number`, `posting_date` |

**Feature flags** (stored in `meta.entity.feature_flags` JSONB):

| Flag | Type | Default | Effect |
|------|------|---------|--------|
| `entity_class` | `EntityClass` | undefined | Drives layout preset |
| `approval_required` | boolean | false | Enables approval workflow for lifecycle transitions |
| `numbering_enabled` | boolean | false | Enables automatic document numbering (DOCUMENT class) |
| `effective_dating_enabled` | boolean | false | Adds `effective_from`/`effective_to` columns (any class) |
| `versioning_mode` | `"none"` \| `"sequential"` \| `"major_minor"` | `"none"` | Schema versioning strategy |
| `lifecycle_enabled` | boolean | false | Enables lifecycle state machine (*to be added*) |
| `attachments_enabled` | boolean | false | Enables file attachments (*to be added*) |
| `posting_enabled` | boolean | false | Enables posting/accounting (*future — Phase 2*) |

> **Note**: `lifecycle_enabled` and `attachments_enabled` are new flags to be added to `EntityFeatureFlags`. `posting_enabled` is reserved for Phase 2.

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Neon Web (Next.js)                        │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              EntityPageShell (single route)           │   │
│  │  /neon/entities/:entityName/new                       │   │
│  │  /neon/entities/:entityName/:id                       │   │
│  │                                                       │   │
│  │  ┌────────────┐  ┌──────────┐  ┌──────────────────┐  │   │
│  │  │   Header    │  │   Tabs   │  │  Context Drawer  │  │   │
│  │  │  (badges +  │  │ (plugin- │  │  (plugin-driven) │  │   │
│  │  │   actions)  │  │  driven) │  │                  │  │   │
│  │  └────────────┘  └──────────┘  └──────────────────┘  │   │
│  └──────────────────────────────────────────────────────┘   │
│                           │                                  │
│                    Descriptor JSON                           │
│                           │                                  │
└───────────────────────────┼──────────────────────────────────┘
                            │
                    ┌───────▼───────┐
                    │   BFF / API    │
                    │   Gateway      │
                    └───────┬───────┘
                            │
┌───────────────────────────┼──────────────────────────────────┐
│              Athyper Runtime (Express Kernel)                 │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐    │
│  │         EntityPageDescriptorService (NEW)             │    │
│  │                                                       │    │
│  │  Orchestrates:                                        │    │
│  │  ├── MetaCompiler.compile() ──────────► CompiledModel │    │
│  │  ├── ClassificationService ───────────► EntityClass   │    │
│  │  │                                      + FeatureFlags│    │
│  │  ├── LifecycleManager ────────────────► Transitions   │    │
│  │  │   .getAvailableTransitions()         + State       │    │
│  │  ├── ApprovalService ─────────────────► Status        │    │
│  │  │   .getInstanceForEntity()            + Tasks       │    │
│  │  │   .getTasksForUser()                               │    │
│  │  ├── PolicyGate ──────────────────────► Decisions     │    │
│  │  │   .authorizeMany() (batch)                         │    │
│  │  └── AuditLogger ────────────────────► Recent Events  │    │
│  │      .getResourceAudit()                              │    │
│  └──────────────────────────────────────────────────────┘    │
│                                                              │
│  Existing Services:                                          │
│  ├── MetaRegistry       (entity/version CRUD)                │
│  ├── MetaCompiler       (schema → compiled IR)               │
│  ├── PolicyGate         (explainable authorization)          │
│  ├── AuditLogger        (audit trail)                        │
│  ├── GenericDataAPI     (CRUD + bulk + soft delete)          │
│  ├── LifecycleManager   (state machine + gates)              │
│  ├── ApprovalService    (multi-stage workflows)              │
│  ├── ClassificationService (entity class + flags)            │
│  ├── NumberingEngine    (atomic document numbering)          │
│  └── DdlGenerator       (PostgreSQL DDL from meta)           │
└──────────────────────────────────────────────────────────────┘
```

---

## 3. Descriptor Schema (Locked)

The `EntityPageDescriptor` is the single JSON contract between backend and frontend. The backend computes it; the frontend renders it.

### 3.1 Full Schema

```typescript
/**
 * EntityPageDescriptor — the complete UI instruction set for one entity page.
 * Computed server-side. Frontend renders only what this says.
 */
type EntityPageDescriptor = {
  /** Entity metadata */
  entity: {
    name: string;
    label: string;
    description?: string;
    icon?: string;
    color?: string;
    entityClass: "MASTER" | "DOCUMENT" | "CONTROL" | undefined;
  };

  /** Layout preset derived from entityClass */
  layoutPreset: "master" | "document" | "control" | "default";

  /** View mode (server may downgrade edit → view based on policy) */
  resolvedViewMode: "view" | "edit" | "create";
  viewModeReason?: ReasonCode;

  /** Summarized capabilities — quick boolean check for frontend */
  capabilities: {
    lifecycle: boolean;
    approval: boolean;
    audit: boolean;
    attachments: boolean;
    effectiveDating: boolean;
    numbering: boolean;
    posting: boolean;        // future
  };

  /** Header badges (status pills) */
  headerBadges: HeaderBadge[];

  /** Tabs — only those marked visible should be rendered */
  tabs: TabDescriptor[];

  /** Actions — grouped, with explainable disabled states */
  actions: ActionDescriptor[];

  /** Drawer panels available from header/peek buttons */
  drawers: DrawerDescriptor[];

  /** Details tab layout: sections with field groups */
  sections: SectionDescriptor[];

  /** Compiled model hash — used as ETag/cache key for form schema */
  modelHash: string;

  /** Descriptor generation timestamp */
  generatedAt: string;  // ISO 8601
};
```

### 3.2 HeaderBadge

```typescript
type BadgeVariant = "default" | "info" | "success" | "warning" | "error" | "muted";

type HeaderBadge = {
  /** Badge category */
  type: "lifecycle" | "approval" | "posting" | "numbering" | "effective_period";

  /** Display value (e.g., "Draft", "Pending Approval", "Posted") */
  value: string;

  /** Visual variant for styling */
  variant: BadgeVariant;

  /** Optional: link to drawer for quick peek */
  drawerCode?: string;
};
```

### 3.3 TabDescriptor

```typescript
type TabDescriptor = {
  /** Stable tab identifier (maps to plugin component) */
  code: "details" | "lifecycle" | "approvals" | "accounting" | "audit" | "attachments" | "timeline" | "versions";

  /** Human-readable label */
  label: string;

  /** Whether to render this tab */
  visible: boolean;

  /** Why this tab is hidden (if not visible) */
  reasonCode?: ReasonCode;

  /** Badge count (e.g., pending approvals, attachments count) */
  badgeCount?: number;
};
```

### 3.4 ActionDescriptor

```typescript
type ActionGroup = "primary" | "secondary" | "danger" | "overflow";

type ActionDescriptor = {
  /** Stable action identifier */
  code: string;

  /** Human-readable label */
  label: string;

  /** Action grouping (max 2 primary, rest secondary/overflow) */
  group: ActionGroup;

  /** Whether action can be executed right now */
  enabled: boolean;

  /** What is blocking this action (when disabled) */
  blockedBy?: "policy" | "state" | "approval" | "validation" | "feature";

  /** Stable reason code */
  reasonCode?: ReasonCode;

  /** Human-readable explanation (optional, for tooltip) */
  reasonText?: string;

  /** Backend routing key for action dispatcher */
  handler: string;

  /** Whether action requires confirmation dialog */
  requiresConfirmation?: boolean;

  /** Confirmation prompt (if requiresConfirmation) */
  confirmationMessage?: string;

  /** Whether action requires a note/comment input */
  requiresNote?: boolean;

  /** Icon identifier */
  icon?: string;
};
```

### 3.5 DrawerDescriptor

```typescript
type DrawerDescriptor = {
  /** Stable drawer identifier */
  code: "approval" | "audit" | "accounting" | "attachments" | "timeline";

  /** Whether peek mode is available (quick summary) */
  peek: boolean;

  /** Label for drawer header */
  label: string;
};
```

### 3.6 SectionDescriptor

```typescript
type SectionDescriptor = {
  /** Section identifier */
  code: string;

  /** Section label */
  label: string;

  /** Section type */
  type: "header" | "lines" | "totals" | "related";

  /** Columns in this section (2-column default) */
  columns?: number;

  /** Fields in this section (references CompiledField.name) */
  fields: SectionField[];
};

type SectionField = {
  /** Field name (matches CompiledField.name) */
  name: string;

  /** Display label (from CompiledField or override) */
  label: string;

  /** Widget type override (default: inferred from field type) */
  widget?: "text" | "number" | "date" | "datetime" | "select" | "reference" | "textarea" | "checkbox" | "json";

  /** Column span (1 or 2) */
  span?: number;

  /** Read-only override (policy may restrict) */
  readOnly?: boolean;

  /** Hidden (policy may hide entirely) */
  hidden?: boolean;
};
```

---

## 4. Reason Code Taxonomy (Locked)

Stable reason codes for consistent UI messages across all entities.

| Reason Code | Meaning | Typical Message |
|-------------|---------|-----------------|
| `feature_disabled` | Feature flag is off for this entity | "This capability is not enabled for this entity" |
| `policy_denied` | PolicyGate denied the action | "You don't have permission to perform this action" |
| `state_blocked` | Current lifecycle state doesn't allow this | "Not available in current state: {state}" |
| `validation_failed` | Data validation prevents action | "Required fields are missing or invalid" |
| `no_pending_task` | User has no approval task for this entity | "No approval task assigned to you" |
| `terminal_state` | Entity is in a terminal lifecycle state | "This record is closed and cannot be modified" |
| `approval_pending` | An approval workflow is in-flight, blocking other actions | "Approval is in progress" |
| `missing_required_attachment` | Required attachment not yet uploaded | "Required attachment is missing" *(future)* |
| `not_in_effective_period` | Record is outside its effective date range | "Outside effective date range" *(future)* |
| `concurrent_modification` | Optimistic lock conflict | "This record was modified by another user" |

**Implementation rule**: Every disabled action MUST include a `reasonCode` and optionally a `reasonText`. The frontend uses `reasonCode` for i18n lookup and `reasonText` as fallback/override.

---

## 5. Action Groups (Locked)

| Group | Max Count | Rendering | Examples |
|-------|-----------|-----------|----------|
| `primary` | 1–2 | Prominent buttons, top-right | Save, Submit |
| `secondary` | 2–4 | Standard buttons or button group | Activate, Duplicate, Export |
| `danger` | 0–1 | Red/destructive styling | Delete, Cancel, Reverse |
| `overflow` | Unlimited | Dropdown/kebab menu | Print, Share, History, Debug |

**Rules**:
- `primary` group shows at most 2 actions. If more qualify, overflow the rest.
- `danger` actions always require confirmation (`requiresConfirmation: true`).
- Disabled actions render as disabled with tooltip showing `reasonText`.
- Actions with `requiresNote: true` open a dialog with a text input before executing.

---

## 6. Backend: Entity Page Descriptor Engine

### 6.1 EntityPageDescriptorService

**New service** that orchestrates existing platform services to produce the `EntityPageDescriptor`.

**Location**: `framework/runtime/src/services/platform/ui/entity-page/descriptor.service.ts`

**DI Token**: `ui.entityPageDescriptor`

#### Dependencies

| Service | Token | Purpose |
|---------|-------|---------|
| MetaCompiler | `meta.compiler` | Get `CompiledModel` (cached) |
| EntityClassificationService | `meta.classificationService` | Get `EntityClass` + `EntityFeatureFlags` |
| LifecycleManager | *(injected via factory)* | Get current state, available transitions |
| ApprovalService | `meta.approvalService` | Get approval instance, tasks for user |
| PolicyGate | `meta.policyGate` | Batch authorize all possible actions |
| AuditLogger | `meta.auditLogger` | Get recent audit events (for badge counts) |
| NumberingEngine | `meta.numberingEngine` | Preview next number (for create mode) |

#### Static Descriptor (cacheable)

Computed from entity metadata only (no record-specific state):

```typescript
async describeEntity(
  entityName: string,
  userCtx: RequestContext,
  viewMode: "create" | "view" | "edit"
): Promise<EntityPageDescriptor>
```

Computes:
1. `layoutPreset` from `entityClass`
2. `capabilities` from `featureFlags`
3. `tabs` — all possible tabs with visibility from feature flags
4. `sections` — default layout from `CompiledModel.fields`
5. `modelHash` from `CompiledModel.hash`

**Cache key**: `epd:static:{entityName}:{modelHash}`

#### Dynamic Descriptor (per-record, not cacheable)

Extends static descriptor with record-specific state:

```typescript
async describeEntityRecord(
  entityName: string,
  entityId: string,
  userCtx: RequestContext,
  viewMode: "view" | "edit"
): Promise<EntityPageDescriptor>
```

Computes (in addition to static):
1. `headerBadges` — lifecycle state, approval status, posting status
2. `actions` — all actions with enabled/disabled + reasons
3. `drawers` — available drawers based on capabilities
4. `resolvedViewMode` — may downgrade `edit` → `view` if policy denies write

#### Batch Policy Check

The descriptor must check policy for multiple actions in a single call. This requires a new `authorizeMany()` method on `PolicyGate`:

```typescript
// New method to add to PolicyGate interface (contracts.ts)
authorizeMany(
  checks: Array<{ action: string; resource: string }>,
  ctx: RequestContext,
  record?: unknown
): Promise<Map<string, PolicyDecision>>;
```

This avoids N sequential calls to `PolicyGate.authorize()` per page load.

### 6.2 Action Dispatcher

**New service** that routes action execution to the correct backend service.

**Location**: `framework/runtime/src/services/platform/ui/entity-page/action-dispatcher.service.ts`

**DI Token**: `ui.actionDispatcher`

#### Routing Table

| Handler Key | Service | Method |
|-------------|---------|--------|
| `entity.save` | GenericDataAPI | `create()` or `update()` |
| `entity.delete` | GenericDataAPI | `delete()` |
| `entity.restore` | GenericDataAPI | `restore()` |
| `entity.duplicate` | GenericDataAPI | `create()` (with cloned data) |
| `lifecycle.{operationCode}` | LifecycleManager | `transition()` |
| `approval.submit` | ApprovalService | `createApprovalInstance()` |
| `approval.withdraw` | ApprovalService | *(cancel instance)* |
| `approval.approve` | ApprovalService | `makeDecision({ decision: "approve" })` |
| `approval.reject` | ApprovalService | `makeDecision({ decision: "reject" })` |
| `posting.simulate` | PostingEngine | `simulate()` *(future)* |
| `posting.post` | PostingEngine | `post()` *(future)* |
| `posting.reverse` | PostingEngine | `reverse()` *(future)* |

#### Action Execution Response

```typescript
type ActionExecutionResult = {
  success: boolean;
  actionCode: string;

  /** Updated descriptor (partial — only changed sections) */
  updatedBadges?: HeaderBadge[];
  updatedActions?: ActionDescriptor[];

  /** Error details (if failed) */
  error?: {
    reasonCode: ReasonCode;
    blockedBy: "policy" | "state" | "approval" | "validation" | "feature";
    details?: Array<{ field: string; message: string }>;
  };

  /** Side effects (for optimistic UI updates) */
  sideEffects?: {
    newState?: string;
    newApprovalStatus?: string;
    refreshRequired?: boolean;
  };
};
```

---

## 7. API Surface

### 7.1 Endpoints

| Method | Path | Purpose | Cacheable |
|--------|------|---------|-----------|
| `GET` | `/api/ui/entity-page/:entityName` | Static descriptor (layout, tabs, sections, capabilities) | Yes — by `entityName` + `modelHash` |
| `GET` | `/api/ui/entity-page/:entityName/:id` | Dynamic descriptor (actions, badges, my tasks, transitions) | No |
| `POST` | `/api/ui/entity-page/:entityName/:id/actions/:actionCode` | Execute action (server-side) | No |
| `GET` | `/api/ui/entity-page/:entityName/:id/drawer/:drawerCode` | Load drawer content (approval peek, audit peek) | No |

### 7.2 Static Descriptor Endpoint

```
GET /api/ui/entity-page/:entityName
```

**Query Parameters**:
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `viewMode` | `create` \| `view` \| `edit` | `view` | Requested view mode |

**Response**: `EntityPageDescriptor` (without record-specific badges/actions)

**Cache Headers**: `ETag: {modelHash}`, `Cache-Control: max-age=300`

### 7.3 Dynamic Descriptor Endpoint

```
GET /api/ui/entity-page/:entityName/:id
```

**Query Parameters**:
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `viewMode` | `view` \| `edit` | `view` | Requested view mode |

**Response**: Full `EntityPageDescriptor` with record-specific state

**Cache Headers**: `Cache-Control: no-cache`

### 7.4 Action Execution Endpoint

```
POST /api/ui/entity-page/:entityName/:id/actions/:actionCode
```

**Request Body**:
```typescript
{
  /** Optional note (for approval decisions, lifecycle transitions) */
  note?: string;

  /** Optional payload (action-specific data) */
  payload?: Record<string, unknown>;
}
```

**Response**: `ActionExecutionResult`

### 7.5 Drawer Content Endpoint

```
GET /api/ui/entity-page/:entityName/:id/drawer/:drawerCode
```

**Query Parameters**:
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `mode` | `peek` \| `full` | `peek` | Level of detail |
| `limit` | number | 5 (peek) / 50 (full) | Max events |

**Response** (varies by drawer code):

**Approval Drawer**:
```typescript
{
  instance: ApprovalInstance | null;
  myTasks: ApprovalTask[];
  stages: Array<{ stageNo: number; mode: string; status: string }>;
  recentEvents: ApprovalEvent[];  // last 5 for peek
}
```

**Audit Drawer**:
```typescript
{
  recentEvents: AuditEvent[];     // last 5 for peek
  totalCount: number;
}
```

**Timeline Drawer** (Phase 5):
```typescript
{
  events: TimelineEvent[];        // merged + sorted
  totalCount: number;
}
```

---

## 8. Frontend: Universal Entity Page Shell

### 8.1 Route Structure

Replace all existing `[entity]` stub pages with a single universal route:

```
/app/entities/:entityName/new          → EntityPageShell (create mode)
/app/entities/:entityName/:id          → EntityPageShell (view/edit mode)
```

**Removed routes** (replaced by universal shell):
- `(shell)/app/[entity]/page.tsx`
- `(shell)/app/[entity]/[id]/page.tsx`
- `(shell)/app/[entity]/[id]/approvals/page.tsx`
- `(shell)/app/[entity]/[id]/workflow/page.tsx`
- `(shell)/app/[entity]/view/list/page.tsx`
- `(shell)/app/[entity]/view/dashboard/page.tsx`
- `(shell)/app/[entity]/view/kanban/page.tsx`

**Retained routes** (admin/config — not entity data pages):
- `(shell)/wb/[wb]/meta/entities/[entity]/**` — admin workbench for entity configuration

### 8.2 EntityPageShell Component

```typescript
// products/neon/apps/web/app/(shell)/app/entities/[entityName]/[id]/page.tsx

type EntityPageShellProps = {
  params: { entityName: string; id: string };
};

/**
 * Universal entity page component.
 *
 * 1. Fetches static descriptor (cached)
 * 2. Fetches dynamic descriptor (per-record)
 * 3. Renders header, tabs, and drawers from descriptor
 * 4. Delegates all actions to server via POST .../actions/:actionCode
 */
export default function EntityPageShell({ params }: EntityPageShellProps) {
  // Fetch descriptors
  // Render from descriptor — no business logic in React
}
```

### 8.3 Rendering Rules

| Component | Data Source | Behavior |
|-----------|------------|----------|
| **Header** | `descriptor.entity` + `descriptor.headerBadges` | Always visible. Badges clickable → open drawer |
| **Action Bar** | `descriptor.actions` | Groups into primary/secondary/danger/overflow. Disabled = tooltip with reason |
| **Tab Bar** | `descriptor.tabs` (filtered to `visible: true`) | Only visible tabs rendered. Badge counts on tab labels |
| **Details Tab** | `descriptor.sections` + record data from `GenericDataAPI` | Form fields rendered from section layout. Read-only respects `resolvedViewMode` |
| **Lifecycle Tab** | Drawer content endpoint (lifecycle) | Current state + transition history + available transitions |
| **Approvals Tab** | Drawer content endpoint (approval, mode=full) | Stage timeline + tasks + decisions |
| **Audit Tab** | Drawer content endpoint (audit, mode=full) | Full audit log with filters |
| **Attachments Tab** | Attachment API | Upload/download/delete with policy gates |
| **Context Drawer** | Drawer content endpoint (peek mode) | Quick summary; opened by clicking badges |

---

## 9. Plugin System

### 9.1 Plugin Contract (Frontend)

Frontend plugins are **pure renderers**. They don't decide logic — they provide React components that consume descriptor data.

```typescript
/**
 * Frontend entity page plugin contract.
 * Plugins register themselves in the PluginRegistry.
 */
interface EntityPagePlugin {
  /** Unique plugin identifier */
  id: string;

  /** Tab component (if this plugin provides a tab) */
  tab?: {
    code: string;
    component: React.ComponentType<TabProps>;
  };

  /** Drawer component (if this plugin provides a drawer) */
  drawer?: {
    code: string;
    component: React.ComponentType<DrawerProps>;
  };

  /** Badge formatter (custom rendering for header badges) */
  badgeFormatter?: (badge: HeaderBadge) => React.ReactNode;

  /** Pre-action hook (e.g., confirmation dialog, note input) */
  actionConfirm?: (action: ActionDescriptor) => Promise<{
    confirmed: boolean;
    note?: string;
    payload?: Record<string, unknown>;
  }>;
}

type TabProps = {
  entityName: string;
  entityId: string;
  descriptor: EntityPageDescriptor;
};

type DrawerProps = {
  entityName: string;
  entityId: string;
  mode: "peek" | "full";
  descriptor: EntityPageDescriptor;
};
```

### 9.2 Plugin Registry

```typescript
// products/neon/apps/web/lib/entity-page/plugin-registry.ts

class PluginRegistry {
  private plugins: Map<string, EntityPagePlugin> = new Map();

  register(plugin: EntityPagePlugin): void;
  getTab(code: string): React.ComponentType<TabProps> | undefined;
  getDrawer(code: string): React.ComponentType<DrawerProps> | undefined;
  getBadgeFormatter(type: string): ((badge: HeaderBadge) => React.ReactNode) | undefined;
  getActionConfirm(actionCode: string): EntityPagePlugin["actionConfirm"] | undefined;
}

// Default registration
const registry = new PluginRegistry();
registry.register(lifecyclePlugin);
registry.register(approvalPlugin);
registry.register(auditPlugin);
registry.register(attachmentsPlugin);
// registry.register(postingPlugin);  // future
```

### 9.3 Backend Plugin Contributions

On the backend, the descriptor service uses a contribution pattern. Each engine contributes to the descriptor:

```typescript
// Internal to EntityPageDescriptorService — not a public contract
interface DescriptorContributor {
  contributeBadges(ctx: DescriptorContext): HeaderBadge[];
  contributeTabs(ctx: DescriptorContext): TabDescriptor[];
  contributeActions(ctx: DescriptorContext): ActionDescriptor[];
  contributeDrawers(ctx: DescriptorContext): DrawerDescriptor[];
}
```

Built-in contributors:
- `LifecycleContributor` — lifecycle tab, transition actions, state badge
- `ApprovalContributor` — approval tab, approval actions, status badge
- `AuditContributor` — audit tab, audit drawer
- `AttachmentsContributor` — attachments tab, upload/delete actions
- `PostingContributor` — accounting tab, posting actions, posting badge *(future)*

---

## 10. Plugin Specifications

### 10.1 Lifecycle Plugin

**Backend source**: `LifecycleManager` (already implemented)

**Contributions**:

| Contribution | Details |
|---|---|
| **Tab** | `code: "lifecycle"`, visible when `capabilities.lifecycle` |
| **Badge** | `type: "lifecycle"`, value = current state name, variant = mapped from state code |
| **Actions** | One action per `AvailableTransition` from `LifecycleManager.getAvailableTransitions()` |
| **Drawer** | `code: "lifecycle"`, peek = current state + last 3 transitions |

**Action mapping**:

```typescript
// Each available transition becomes an action:
{
  code: `lifecycle.${transition.operationCode}`,
  label: transition.operationCode,  // e.g., "Submit", "Approve", "Cancel"
  handler: `lifecycle.${transition.operationCode}`,
  group: inferGroup(transition.operationCode),  // submit→primary, cancel→danger
  enabled: transition.authorized && !transition.requiresApproval,
  blockedBy: !transition.authorized ? "policy" : transition.requiresApproval ? "approval" : undefined,
  reasonCode: mapAuthorizationReason(transition),
}
```

**Tab content** (Lifecycle tab):

| Section | Content |
|---------|---------|
| Current State | State name + badge + time in state |
| Transition History | Chronological table: timestamp, from → to, operation, actor, notes |
| Available Transitions | Cards with operation name + target state + enabled/disabled + reason |

**Block reasons**:

| Condition | reasonCode | blockedBy |
|-----------|------------|-----------|
| `!transition.authorized` | `policy_denied` | `policy` |
| `transition.requiresApproval` | `approval_pending` | `approval` |
| Terminal state | `terminal_state` | `state` |
| No matching transition from current state | `state_blocked` | `state` |

### 10.2 Approval Plugin

**Backend source**: `ApprovalService` (already implemented)

**Contributions**:

| Contribution | Details |
|---|---|
| **Tab** | `code: "approvals"`, visible when `capabilities.approval` |
| **Badge** | `type: "approval"`, value = instance status, variant = status-dependent |
| **Actions** | `submit_for_approval`, `withdraw`, `approve`, `reject` |
| **Drawer** | `code: "approval"`, peek = status + my tasks + last 5 events |

**Action mapping**:

| Action | Condition | Handler |
|--------|-----------|---------|
| Submit for Approval | Lifecycle transition has approval gate AND no active instance | `approval.submit` |
| Withdraw | Active instance in `open` status AND user is submitter | `approval.withdraw` |
| Approve | User has pending task with `taskType: "approver"` | `approval.approve` |
| Reject | User has pending task with `taskType: "approver"` | `approval.reject` |
| Resubmit | Previous instance was rejected AND lifecycle allows resubmit | `approval.submit` |

**Approval actions always require notes** (`requiresNote: true` for approve/reject).

**Tab content** (Approvals tab):

| Section | Content |
|---------|---------|
| Stage Timeline | Visual stage progression: stage 1 → stage 2 → ... with status indicators |
| My Tasks | List of tasks assigned to current user for this entity |
| All Tasks | Table: stage, assignee, type, status, decided at, decision note |
| Decision History | Chronological events: created, submitted, approved, rejected, escalated |

**Badge mapping**:

| Instance Status | Badge Value | Variant |
|-----------------|-------------|---------|
| No instance | *(no badge)* | — |
| `open` | "Pending Approval" | `warning` |
| `completed` | "Approved" | `success` |
| `rejected` | "Rejected" | `error` |
| `canceled` | "Withdrawn" | `muted` |

### 10.3 Audit Plugin

**Backend source**: `AuditLogger` (already implemented)

**Contributions**:

| Contribution | Details |
|---|---|
| **Tab** | `code: "audit"`, visible always (recommended default-on for all entities) |
| **Drawer** | `code: "audit"`, peek = last 5 events |

No actions contributed (audit is read-only).

**Tab content** (Audit tab):

| Section | Content |
|---------|---------|
| Event List | Paginated table: timestamp, event type, actor, action, result, details |
| Filters | Event type, actor, date range, result (success/failure) |
| Export | Download audit log as CSV *(overflow action)* |

**Data source**: `AuditLogger.getResourceAudit(entityRef, options)`

### 10.4 Attachments Plugin

**Backend**: New service required (see [Appendix C: Database Tables](#appendix-c-database-tables))

**Feature flag**: `attachments_enabled` (new — to be added to `EntityFeatureFlags`)

**Contributions**:

| Contribution | Details |
|---|---|
| **Tab** | `code: "attachments"`, visible when `capabilities.attachments` |
| **Badge count** | Number of attachments on tab label |
| **Actions** | Upload (policy-gated), Delete (policy-gated, requires confirmation) |
| **Drawer** | `code: "attachments"`, peek = last 3 + count |

**API Endpoints** (new):

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/data/:entity/:id/attachments` | List attachments |
| `POST` | `/api/data/:entity/:id/attachments/presign` | Get pre-signed upload URL |
| `POST` | `/api/data/:entity/:id/attachments` | Register upload (after S3 upload) |
| `GET` | `/api/data/:entity/:id/attachments/:attachmentId/download` | Get pre-signed download URL |
| `DELETE` | `/api/data/:entity/:id/attachments/:attachmentId` | Soft-delete attachment |

**Upload flow**: Browser → pre-signed URL → S3/MinIO → register metadata via POST. No proxy — direct-to-storage upload.

---

## 11. Unified Timeline

### 11.1 ResourceTimelineService

**Phase 5 deliverable.**

Merges events from multiple sources into a single ordered stream.

```typescript
// framework/runtime/src/services/platform/ui/entity-page/timeline.service.ts

type TimelineEventSource = "audit" | "lifecycle" | "approval";

type TimelineEvent =
  | { source: "audit"; timestamp: Date; event: AuditEvent }
  | { source: "lifecycle"; timestamp: Date; event: EntityLifecycleEvent }
  | { source: "approval"; timestamp: Date; event: ApprovalEvent };

interface ResourceTimelineService {
  /**
   * Get merged timeline for an entity record.
   * Queries all event sources and merges by timestamp.
   */
  getTimeline(
    entityName: string,
    entityId: string,
    tenantId: string,
    options?: {
      sources?: TimelineEventSource[];
      limit?: number;
      offset?: number;
    }
  ): Promise<{
    events: TimelineEvent[];
    totalCount: number;
    sources: TimelineEventSource[];
  }>;

  /**
   * Peek: last N events (for drawer).
   */
  peek(
    entityName: string,
    entityId: string,
    tenantId: string,
    limit?: number
  ): Promise<TimelineEvent[]>;
}
```

**Data sources**:

| Source | Service Method | Timestamp Field |
|--------|---------------|-----------------|
| Audit | `AuditLogger.getResourceAudit()` | `event.timestamp` |
| Lifecycle | `LifecycleManager.getHistory()` | `event.occurredAt` |
| Approval | `ApprovalService.getEvents()` | `event.occurredAt` |

**Design decision**: Use union types, not a normalized common format. Each plugin renders its own event type with full fidelity.

---

## 12. Master Change Request / Diff (Phase 2)

### Problem

For Master entities with approval enabled, the flow should be:
1. Propose change → create draft version
2. Diff view: active version vs. draft version
3. Submit for approval → approvers see the diff
4. Approve → activate draft version
5. Reject → discard draft

### Backend Additions Required

| Component | Description |
|-----------|-------------|
| Draft version concept | `EntityVersion` with `status: "draft"` (new field or convention) |
| Diff engine | Compare active `EntitySchema` vs. draft `EntitySchema` → structured diff |
| Approval hook | On approval completion → `MetaRegistry.activateVersion()` |
| Version promotion | Atomic: deactivate current + activate draft |

### UI Additions

| Component | Description |
|-----------|-------------|
| "Propose Change" action | Creates draft version, opens edit mode |
| Diff viewer | Side-by-side comparison: current vs. proposed fields/policies |
| Approval tab enrichment | Shows diff alongside approval decisions |

**Note**: This requires `MetaRegistry.activateVersion()` to be extended with approval context. The current implementation exists but lacks the draft-promotion-on-approval hook.

---

## 13. Posting Plugin (Phase 2)

### Prerequisites

The posting plugin requires a posting engine that does not yet exist. Required backend:

| Component | Description |
|-----------|-------------|
| Posting run model | `meta.posting_run` table: entity_ref, period, status, journal entries |
| Journal entry model | `meta.journal_entry` table: debit/credit, account, amount, currency |
| Subledger/GL integration | Posting impact definition per entity |
| Reversal model | Linked reversal entries with reason tracking |

### Plugin Contributions (Future)

| Contribution | Details |
|---|---|
| **Tab** | `code: "accounting"`, visible when `capabilities.posting` |
| **Badge** | `type: "posting"`, value = posting status ("Not Posted", "Simulated", "Posted", "Reversed") |
| **Actions** | `posting.simulate`, `posting.post`, `posting.reverse` |
| **Drawer** | `code: "accounting"`, peek = journal summary + posting status |

### Feature Flag

`posting_enabled` (new — reserved in `EntityFeatureFlags`, not implemented until Phase 2)

---

## 14. Cross-Cutting Quality Gates

### A) Explainability Everywhere

Every disabled action MUST include:

```typescript
{
  enabled: false,
  blockedBy: "policy" | "state" | "approval" | "validation" | "feature",
  reasonCode: ReasonCode,     // stable, i18n-ready
  reasonText?: string          // optional human-readable override
}
```

**Backend implementation**: The `EntityPageDescriptorService` computes reasons from:

| `blockedBy` | Source |
|-------------|--------|
| `feature` | `EntityFeatureFlags` check |
| `policy` | `PolicyGate.authorize()` → `PolicyDecision.reason` |
| `state` | `LifecycleManager.canTransition()` → `LifecycleTransitionResult.reason` |
| `approval` | `ApprovalService.getInstanceForEntity()` → active instance exists |
| `validation` | `CompiledModel` validators (basic) or custom validation rules |

### B) Deterministic UI

**Non-negotiable rule**: The frontend NEVER computes "can I do this?"

| Frontend Does | Frontend Does NOT |
|---------------|-------------------|
| Render enabled/disabled from descriptor | Evaluate policy rules |
| Show reason text from descriptor | Check lifecycle state transitions |
| Group actions by `group` field | Determine action eligibility |
| Open drawer from badge click | Compute approval status |
| Submit action to server endpoint | Execute business logic |

### C) Performance

| Strategy | Implementation |
|----------|---------------|
| Static/dynamic descriptor split | Static cached by `entityName` + `modelHash`; dynamic per-request |
| Batch policy checks | `PolicyGate.authorizeMany()` — single pass through compiled policies |
| Parallel service calls | Descriptor service calls lifecycle + approval + policy concurrently |
| ETag-based caching | `modelHash` as ETag for static descriptor; 304 Not Modified |
| Drawer lazy loading | Drawer content loaded on-demand, not with page |

### D) Security

| Rule | Enforcement |
|------|-------------|
| All actions executed server-side | `POST .../actions/:actionCode` — no client-side execution |
| Policy checked per action | `PolicyGate.enforce()` before every action dispatch |
| Tenant isolation | `RequestContext.tenantId` enforced on every query |
| CSRF protection | Existing middleware: `__csrf` cookie + `x-csrf-token` header |
| Session validation | Existing middleware: `neon_sid` cookie, Redis-backed sessions |

### E) Error Contract

All action execution errors use a structured response:

```typescript
{
  success: false,
  actionCode: "approval.approve",
  error: {
    reasonCode: "validation_failed",
    blockedBy: "validation",
    details: [
      { field: "amount", message: "Amount must be greater than 0" },
      { field: "costCenter", message: "Required for documents exceeding threshold" }
    ]
  }
}
```

---

## 15. Canonical Page Layout

Fixed layout skeleton — never changes across entities. Only content varies.

```
┌─────────────────────────────────────────────────────────────────┐
│  A) ENTITY HEADER (always)                                      │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  Title + Identifier (Code / Doc No)                        │ │
│  │                                                            │ │
│  │  [Status Pills]  Lifecycle: Draft  │  Approval: Pending    │ │
│  │                                                            │ │
│  │  Context: Org Unit  │  Period  │  Currency  │  Owner       │ │
│  │                                                            │ │
│  │  [Actions]  [ Save ]  [ Submit ]  [ ··· ]                  │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  B) PRIMARY WORKSPACE                                            │
│  ┌────────────────────────────────────┬───────────────────────┐ │
│  │                                    │ C) CONTEXT DRAWER     │ │
│  │  ┌──────────────────────────────┐  │ (slides in from right)│ │
│  │  │ [ Details ] [ Lifecycle ]    │  │                       │ │
│  │  │ [ Approvals ] [ Audit ]     │  │  Approval Status      │ │
│  │  │ [ Attachments ]             │  │  ─────────────────    │ │
│  │  └──────────────────────────────┘  │  Stage: 2 of 3       │ │
│  │                                    │  My Tasks: 1 pending  │ │
│  │  TAB CONTENT                       │                       │ │
│  │  ────────────────────────────────  │  Recent Events        │ │
│  │                                    │  ─────────────────    │ │
│  │  [Header Fields - 2 col form]      │  • Submitted by John  │ │
│  │                                    │  • Approved by Jane   │ │
│  │  [Line Items - grid/table]         │  • Stage 2 started    │ │
│  │                                    │                       │ │
│  │  [Totals / Summary]                │                       │ │
│  │                                    │                       │ │
│  └────────────────────────────────────┴───────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

**Drawer usage rule**:
- **Drawer** = quick peek (approval status, last 5 audit events, attachment count)
- **Tab** = full exploration (approval history, complete audit log, all attachments)
- Badge click → opens drawer. Tab click → full view.

---

## 16. UX Patterns

### Enterprise-Grade Patterns

| Pattern | Implementation |
|---------|---------------|
| **Status-first UI** | Lifecycle + approval + posting badges always visible in header |
| **Drawer-based deep views** | Right drawer for quick checks without leaving current context |
| **Explainable disabled actions** | Disabled button + tooltip showing reason code + text |
| **Consistency rule** | Same Approval tab UI for invoices, purchase orders, master changes |
| **Side-by-side diff for masters** | Version comparison in Approvals tab when reviewing master changes |
| **Event timeline** | Unified timeline combining lifecycle + approval + audit events |
| **Contextual quick actions** | Header actions change based on state — never "random buttons" |
| **Progressive disclosure** | Drawer → Tab → Detail dialog, increasing depth |

### Master vs. Document UX Differences

Both use the same `EntityPageShell`. Layout preset drives the difference:

| Aspect | Master (`layoutPreset: "master"`) | Document (`layoutPreset: "document"`) |
|--------|-----------------------------------|---------------------------------------|
| Form layout | Stable attributes + related entity lists | Header section + line items grid + totals |
| Approval context | "Change Request" — diff view between versions | "Business Authorization" — approve the document |
| Lifecycle focus | Active/Inactive toggle | Full lifecycle: Draft → Submitted → Approved → Posted |
| Numbering | Code-based (manual or configured) | Auto-generated via NumberingEngine |
| Key fields | Code, Name, Category, Status | Document Number, Posting Date, Currency, Amount |

---

## 17. Backend Alignment Matrix

Current implementation status of all backend services required by this framework:

| Service | Token | Contract | Implementation | Status |
|---------|-------|----------|----------------|--------|
| MetaRegistry | `meta.registry` | `MetaRegistry` | `MetaRegistryService` | Built |
| MetaCompiler | `meta.compiler` | `MetaCompiler` | `MetaCompilerService` | Built |
| PolicyGate | `meta.policyGate` | `PolicyGate` | `PolicyGateService` | Built |
| AuditLogger | `meta.auditLogger` | `AuditLogger` | `AuditLoggerService` | Built |
| GenericDataAPI | `meta.dataAPI` | `GenericDataAPI` | `GenericDataAPIService` | Built |
| MetaStore | `meta.store` | `MetaStore` | `MetaStoreService` | Built |
| LifecycleRouteCompiler | — | `LifecycleRouteCompiler` | `LifecycleRouteCompilerService` | Built |
| LifecycleManager | — | `LifecycleManager` | `LifecycleManagerService` | Built |
| ApprovalService | `meta.approvalService` | `ApprovalService` | `ApprovalServiceImpl` | Built |
| ClassificationService | `meta.classificationService` | `EntityClassificationService` | `EntityClassificationServiceImpl` | Built |
| NumberingEngine | `meta.numberingEngine` | `NumberingEngine` | `NumberingEngineService` | Built |
| DdlGenerator | — | `DdlGenerator` | `DdlGeneratorService` | Built |
| **EntityPageDescriptorService** | `ui.entityPageDescriptor` | — | — | **New** |
| **ActionDispatcher** | `ui.actionDispatcher` | — | — | **New** |
| **ResourceTimelineService** | `ui.timeline` | — | — | **New (Phase 5)** |
| **AttachmentService** | `ui.attachments` | — | — | **New (Phase 4)** |
| **PolicyGate.authorizeMany()** | — | — | — | **New method** |

### Circular Dependency Note

`LifecycleManager` ↔ `ApprovalService` have a circular dependency resolved via setter injection in [factory.ts](framework/runtime/src/services/platform/meta/factory.ts):

```typescript
lifecycleManager.setApprovalService(approvalService);
approvalService.setLifecycleManager(lifecycleManager);
```

**Recommendation**: Introduce a `MetaEventBus` to decouple:

```
LifecycleManager → emits "transition.gated" → ApprovalService listens
ApprovalService → emits "approval.completed" → LifecycleManager listens
```

This also naturally feeds the Phase 5 unified timeline.

---

## 18. Implementation Phases

### Phase 0 — Lock Contracts (1–2 days)

| Deliverable | Description |
|-------------|-------------|
| Descriptor schema types | `EntityPageDescriptor` + all sub-types in `@athyper/core/meta` |
| Reason code enum | `ReasonCode` type with all stable codes |
| Action group rules | `ActionGroup` type and grouping rules |
| `PolicyGate.authorizeMany()` | Add batch policy check to contract |
| New feature flags | Add `lifecycle_enabled`, `attachments_enabled`, `posting_enabled` to `EntityFeatureFlags` |

**Outcome**: All contracts locked. No ambiguity for implementors.

### Phase 1 — Backend: Descriptor Engine (Week 1)

| Task | Description |
|------|-------------|
| `EntityPageDescriptorService` | Orchestrates all services → `EntityPageDescriptor` |
| `ActionDispatcher` | Routes action codes to correct backend service |
| Static descriptor endpoint | `GET /api/ui/entity-page/:entityName` |
| Dynamic descriptor endpoint | `GET /api/ui/entity-page/:entityName/:id` |
| Action execution endpoint | `POST /api/ui/entity-page/:entityName/:id/actions/:actionCode` |
| Drawer content endpoint | `GET /api/ui/entity-page/:entityName/:id/drawer/:drawerCode` |
| `PolicyGate.authorizeMany()` impl | Batch policy evaluation |

**Outcome**: React becomes a renderer. All business logic stays server-side.

### Phase 2 — Frontend: Entity Page Shell (Week 2)

| Task | Description |
|------|-------------|
| `EntityPageShell` component | Single-route universal entity page |
| Header component | Entity info + badges + action bar |
| Tab bar component | Dynamic tabs from descriptor |
| Context drawer component | Right-side drawer, opened from badges |
| Plugin registry | Frontend plugin registration and lookup |
| Details tab | Default form rendering from `CompiledModel` fields |
| Action execution hooks | `useActionExecutor` — calls server endpoint, handles response |

**Outcome**: One page renders all entities. No duplication.

### Phase 3 — Plugins: Lifecycle + Approval (Weeks 2–3)

| Task | Description |
|------|-------------|
| Lifecycle tab component | State visualization + history + transitions |
| Lifecycle drawer (peek) | Current state + last 3 events |
| Approval tab component | Stage timeline + tasks + decisions |
| Approval drawer (peek) | Status + my tasks + last 5 events |
| Action confirmation dialogs | Note input for approve/reject, confirm for danger actions |

**Outcome**: Approvable framework visible and consistent for end users.

### Phase 4 — Audit + Attachments (Weeks 3–4)

| Task | Description |
|------|-------------|
| Audit tab component | Full event list + filters |
| Audit drawer (peek) | Last 5 events |
| `meta.entity_attachment` table | New database table (see Appendix C) |
| Attachment service | CRUD + pre-signed URL generation |
| Attachment API endpoints | List, upload, download, delete |
| Attachments tab component | File list + upload + policy-gated delete |
| Attachments drawer (peek) | Last 3 + count |

**Outcome**: Enterprise document UX complete.

### Phase 5 — Unified Timeline (Week 4)

| Task | Description |
|------|-------------|
| `ResourceTimelineService` | Merge audit + lifecycle + approval events |
| Timeline drawer | Peek last 5 merged events |
| Timeline tab (optional) | Full merged timeline with source filters |

**Outcome**: Single source of truth for "what happened to this record."

### Phase 6 — Master Change Request / Diff (Phase 2 Epic)

| Task | Description |
|------|-------------|
| Draft version model | `EntityVersion.status: "draft"` |
| Diff computation engine | Active vs. draft schema comparison |
| Approval-to-activation hook | Promote draft → active on approval completion |
| Diff viewer component | Side-by-side field/policy comparison |

### Phase 7 — Posting Plugin (Phase 2 Epic)

| Task | Description |
|------|-------------|
| Posting engine (full epic) | Runs, journals, reversals |
| Accounting tab | Journal preview + posting history |
| Posting drawer | Status + journal summary |
| Posting actions | Simulate, Post, Reverse |

---

## 19. Definition of Done

The core Neon Entity UI is "done" when:

- [ ] Any entity can be rendered with Details + Lifecycle + Approvals + Audit + Attachments (when flags are enabled)
- [ ] All actions are explainable when disabled (blockedBy + reasonCode always present)
- [ ] One unified route handles all entities (no entity-specific React pages for lifecycle/approval/audit)
- [ ] Frontend never computes action eligibility — all decisions from backend descriptor
- [ ] Static descriptor is cacheable; dynamic descriptor is optimized (batch policy, parallel service calls)
- [ ] All actions execute server-side via `POST .../actions/:actionCode`
- [ ] Drawer peek mode works for approval, audit, and attachments
- [ ] Lifecycle transitions show in both Lifecycle tab and unified timeline
- [ ] Approval decisions show in both Approvals tab and unified timeline
- [ ] Existing test coverage maintained (all backend services already have tests)

---

## Appendix A: Existing Type Definitions

All types referenced in this spec are defined in `framework/core/src/meta/types.ts`.

### Entity Classification

```typescript
// framework/core/src/meta/types.ts:1830
type EntityClass = "MASTER" | "CONTROL" | "DOCUMENT";
```

```typescript
// framework/core/src/meta/types.ts:1836
type EntityFeatureFlags = {
  entity_class?: EntityClass;
  approval_required?: boolean;
  numbering_enabled?: boolean;
  effective_dating_enabled?: boolean;
  versioning_mode?: "none" | "sequential" | "major_minor";
  // To be added:
  // lifecycle_enabled?: boolean;
  // attachments_enabled?: boolean;
  // posting_enabled?: boolean;
};
```

### Compiled Model

```typescript
// framework/core/src/meta/types.ts:319
type CompiledModel = {
  entityName: string;
  version: string;
  tableName: string;
  fields: CompiledField[];
  policies: CompiledPolicy[];
  selectFragment: string;
  fromFragment: string;
  tenantFilterFragment: string;
  indexes: string[];
  compiledAt: Date;
  compiledBy: string;
  hash: string;
  inputHash?: string;
  outputHash?: string;
  diagnostics?: CompileDiagnostic[];
  entityClass?: EntityClass;
  featureFlags?: EntityFeatureFlags;
};
```

### Policy Decision

```typescript
// framework/core/src/meta/types.ts:1016
type PolicyDecision = {
  allowed: boolean;
  effect: "allow" | "deny";
  matchedRuleId?: string;
  matchedPolicyVersionId?: string;
  reason: string;
  evaluatedRules: Array<{
    ruleId: string;
    effect: "allow" | "deny";
    matched: boolean;
    reason?: string;
  }>;
  timestamp: Date;
};
```

### Lifecycle Types

```typescript
// framework/core/src/meta/types.ts:1407
type EntityLifecycleInstance = {
  id: string;
  tenantId: string;
  entityName: string;
  entityId: string;
  lifecycleId: string;
  stateId: string;
  updatedAt: Date;
  updatedBy: string;
};
```

```typescript
// framework/core/src/meta/types.ts:1439
type EntityLifecycleEvent = {
  id: string;
  tenantId: string;
  entityName: string;
  entityId: string;
  lifecycleId: string;
  fromStateId?: string;
  toStateId: string;
  operationCode: string;
  occurredAt: Date;
  actorId?: string;
  payload?: Record<string, unknown>;
  correlationId?: string;
};
```

### Available Transition

```typescript
// framework/core/src/meta/contracts.ts:714
type AvailableTransition = {
  transitionId: string;
  operationCode: string;
  toStateId: string;
  toStateCode: string;
  authorized: boolean;
  unauthorizedReason?: string;
  requiresApproval: boolean;
  approvalTemplateId?: string;
};
```

### Approval Types

```typescript
// framework/core/src/meta/types.ts:1534
type ApprovalInstance = {
  id: string;
  tenantId: string;
  entityName: string;
  entityId: string;
  transitionId?: string;
  approvalTemplateId?: string;
  status: ApprovalInstanceStatus;
  createdAt: Date;
  createdBy: string;
};

type ApprovalInstanceStatus = "open" | "completed" | "rejected" | "canceled";
```

```typescript
// framework/core/src/meta/types.ts:1595
type ApprovalTask = {
  id: string;
  tenantId: string;
  approvalInstanceId: string;
  approvalStageId: string;
  assigneePrincipalId?: string;
  assigneeGroupId?: string;
  taskType: "approver" | "reviewer" | "watcher";
  status: "pending" | "approved" | "rejected" | "canceled" | "expired";
  dueAt?: Date;
  decidedAt?: Date;
  decidedBy?: string;
  decisionNote?: string;
  createdAt: Date;
};
```

### Request Context

```typescript
// framework/core/src/meta/types.ts:441
type RequestContext = {
  userId: string;
  tenantId: string;
  realmId: string;
  roles: string[];
  orgKey?: string;
  requestId?: string;
  metadata?: Record<string, unknown>;
};
```

---

## Appendix B: Existing Service Contracts

All contracts defined in `framework/core/src/meta/contracts.ts`.

### Key Interfaces (Summary)

| Interface | Methods | Token |
|-----------|---------|-------|
| `MetaRegistry` | createEntity, getEntity, listEntities, updateEntity, deleteEntity, createVersion, getVersion, getActiveVersion, listVersions, activateVersion, deactivateVersion, updateVersion, deleteVersion | `meta.registry` |
| `MetaCompiler` | compile, recompile, validate, invalidateCache, getCached, precompileAll, healthCheck | `meta.compiler` |
| `PolicyGate` | can *(deprecated)*, authorize, enforce, getPolicies, evaluatePolicy, getAllowedFields, invalidatePolicyCache, healthCheck | `meta.policyGate` |
| `AuditLogger` | log, query, getEvent, getRecent, getResourceAudit, getUserAudit, getTenantAudit, healthCheck | `meta.auditLogger` |
| `GenericDataAPI` | list, get, count, create, update, delete, restore, permanentDelete, bulkCreate, bulkUpdate, bulkDelete, healthCheck | `meta.dataAPI` |
| `MetaStore` | getCompiledModel, getEntityWithCompiledModel, createEntityWithVersion, publishVersion, getSchema, healthCheck | `meta.store` |
| `LifecycleRouteCompiler` | compile, recompile, resolveLifecycle, getCached, invalidateCache, precompileAll, healthCheck | — |
| `LifecycleManager` | createInstance, getInstance, getInstanceOrFail, transition, canTransition, getAvailableTransitions, validateGates, requiresApproval, getHistory, getCurrentState, isTerminalState, enforceTerminalState, healthCheck | — |
| `ApprovalService` | createApprovalInstance, getInstance, getInstanceForEntity, getTask, getTasksForInstance, getTasksForUser, getAssignmentSnapshot, makeDecision, isInstanceComplete, isStageComplete, scheduleReminder, scheduleEscalation, processReminder, processEscalation, cancelTimers, getEvents, getEscalations, healthCheck | `meta.approvalService` |
| `EntityClassificationService` | resolveClass, resolveFeatureFlags, getClassification | `meta.classificationService` |
| `NumberingEngine` | generateNumber, previewNextNumber, getRule, healthCheck | `meta.numberingEngine` |
| `DdlGenerator` | generateDdl, generateBatch, generateMigrationScript | — |

### Existing HTTP Routes (meta module)

| Method | Path | Handler |
|--------|------|---------|
| `POST` | `/api/meta/entities` | CreateEntityHandler |
| `GET` | `/api/meta/entities` | ListEntitiesHandler |
| `GET` | `/api/meta/entities/:name` | GetEntityHandler |
| `PUT` | `/api/meta/entities/:name` | UpdateEntityHandler |
| `DELETE` | `/api/meta/entities/:name` | DeleteEntityHandler |
| `POST` | `/api/meta/entities/:name/versions` | CreateVersionHandler |
| `GET` | `/api/meta/entities/:name/versions` | ListVersionsHandler |
| `GET` | `/api/meta/entities/:name/versions/:version` | GetVersionHandler |
| `POST` | `/api/meta/entities/:name/versions/:version/activate` | ActivateVersionHandler |
| `DELETE` | `/api/meta/entities/:name/versions/:version` | DeleteVersionHandler |
| `GET` | `/api/data/:entity` | ListRecordsHandler |
| `GET` | `/api/data/:entity/:id` | GetRecordHandler |
| `GET` | `/api/data/:entity/count` | CountRecordsHandler |
| `POST` | `/api/data/:entity` | CreateRecordHandler |
| `PUT` | `/api/data/:entity/:id` | UpdateRecordHandler |
| `DELETE` | `/api/data/:entity/:id` | DeleteRecordHandler |
| `POST` | `/api/data/:entity/:id/restore` | RestoreRecordHandler |
| `DELETE` | `/api/data/:entity/:id/permanent` | PermanentDeleteRecordHandler |
| `POST` | `/api/data/:entity/bulk` | BulkCreateRecordsHandler |
| `PATCH` | `/api/data/:entity/bulk` | BulkUpdateRecordsHandler |
| `DELETE` | `/api/data/:entity/bulk` | BulkDeleteRecordsHandler |

### Existing HTTP Routes (UI module)

| Method | Path | Handler |
|--------|------|---------|
| `GET` | `/api/ui/dashboards` | ListDashboardsHandler |
| `GET` | `/api/ui/dashboards/:id` | GetDashboardHandler |
| `GET` | `/api/ui/dashboards/:id/draft` | GetDraftHandler |
| `POST` | `/api/ui/dashboards` | CreateDashboardHandler |
| `POST` | `/api/ui/dashboards/:id/duplicate` | DuplicateDashboardHandler |
| `PATCH` | `/api/ui/dashboards/:id` | UpdateDashboardHandler |
| `PUT` | `/api/ui/dashboards/:id/layout` | SaveDraftLayoutHandler |
| `POST` | `/api/ui/dashboards/:id/publish` | PublishDashboardHandler |
| `DELETE` | `/api/ui/dashboards/:id/draft` | DiscardDraftHandler |
| `DELETE` | `/api/ui/dashboards/:id` | DeleteDashboardHandler |
| `GET` | `/api/ui/dashboards/:id/acl` | ListAclHandler |
| `POST` | `/api/ui/dashboards/:id/acl` | AddAclHandler |
| `DELETE` | `/api/ui/dashboards/:id/acl/:aclId` | RemoveAclHandler |

---

## Appendix C: Database Tables

### New Tables Required

#### `meta.entity_attachment`

```sql
CREATE TABLE IF NOT EXISTS meta.entity_attachment (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL,
  realm_id        TEXT NOT NULL,
  entity_type     TEXT NOT NULL,       -- entity name (e.g., "PurchaseOrder")
  entity_id       UUID NOT NULL,       -- record id
  file_name       TEXT NOT NULL,
  content_type    TEXT NOT NULL,        -- MIME type
  size_bytes      BIGINT NOT NULL,
  storage_key     TEXT NOT NULL,        -- S3/MinIO object key
  uploaded_by     TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ,         -- soft delete

  -- Indexes
  CONSTRAINT fk_attachment_tenant FOREIGN KEY (tenant_id)
    REFERENCES core.tenant(id)
);

CREATE INDEX idx_attachment_entity
  ON meta.entity_attachment (tenant_id, entity_type, entity_id)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_attachment_uploaded_by
  ON meta.entity_attachment (tenant_id, uploaded_by);
```

### Existing Tables Referenced

| Table | Schema | Purpose |
|-------|--------|---------|
| `meta.entity` | `meta` | Entity definitions (kind, feature_flags, naming_policy) |
| `meta.entity_version` | `meta` | Schema versions (schema JSON, is_active) |
| `meta.lifecycle` | `meta` | Lifecycle definitions (code, name, version) |
| `meta.lifecycle_state` | `meta` | States within lifecycles (code, is_terminal, sort_order) |
| `meta.lifecycle_transition` | `meta` | Allowed transitions (from → to, operation_code) |
| `meta.lifecycle_transition_gate` | `meta` | Gate requirements (required_operations, approval_template_id) |
| `meta.entity_lifecycle` | `meta` | Entity-to-lifecycle mapping (conditions, priority) |
| `meta.entity_lifecycle_instance` | `meta` | Runtime lifecycle instances (entity_id → state_id) |
| `meta.entity_lifecycle_event` | `meta` | Transition audit trail |
| `meta.approval_template` | `meta` | Approval workflow templates |
| `meta.approval_template_stage` | `meta` | Stages within templates (mode: serial/parallel) |
| `meta.approval_template_rule` | `meta` | Assignee resolution rules (conditions → assignTo) |
| `meta.approval_instance` | `meta` | Runtime approval instances |
| `meta.approval_stage` | `meta` | Runtime approval stages |
| `meta.approval_task` | `meta` | Runtime approval tasks |
| `meta.approval_assignment_snapshot` | `meta` | Immutable assignment records |
| `meta.approval_event` | `meta` | Approval audit trail |
| `meta.approval_escalation` | `meta` | Escalation events |
| `meta.numbering_sequence` | `meta` | Atomic sequence counters (period_key → current_value) |

---

*End of specification.*
