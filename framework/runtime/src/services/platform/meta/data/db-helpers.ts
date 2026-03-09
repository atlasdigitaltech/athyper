/**
 * Database Helper Utilities for META Services
 *
 * Provides Kysely helpers and type augmentations for lifecycle/approval tables
 */

import { sql } from "kysely";

import type { DB } from "@athyper/adapter-db";
import type { Kysely } from "kysely";

/**
 * Require a row to exist, throw error if undefined
 */
export function requireRow<T>(row: T | undefined, msg: string): T {
  if (!row) throw new Error(msg);
  return row;
}

/**
 * Get current timestamp for database inserts
 */
export function now() {
  return sql<Date>`now()`;
}

/**
 * Generate UUID for new records
 */
export function uuid() {
  return crypto.randomUUID();
}

/**
 * Lifecycle table types (augment DB when types are generated)
 */
export type LifecycleDB = DB & {
  "meta.lifecycle": {
    id: string;
    tenant_id: string;
    code: string;
    name: string;
    description: string | null;
    version_no: number;
    is_active: boolean;
    definition_hash: string | null;
    updated_at: Date | null;
    created_at: Date;
    created_by: string;
  };

  "meta.lifecycle_state": {
    id: string;
    tenant_id: string;
    lifecycle_id: string;
    code: string;
    name: string;
    is_terminal: boolean;
    sort_order: number;
    created_at: Date;
    created_by: string;
  };

  "meta.lifecycle_transition": {
    id: string;
    tenant_id: string;
    lifecycle_id: string;
    from_state_id: string;
    to_state_id: string;
    operation_code: string;
    is_active: boolean;
    created_at: Date;
    created_by: string;
  };

  "meta.lifecycle_transition_gate": {
    id: string;
    tenant_id: string;
    transition_id: string;
    required_operations: unknown | null; // jsonb
    approval_template_id: string | null;
    conditions: unknown | null; // jsonb
    threshold_rules: unknown | null; // jsonb
    created_at: Date;
    created_by: string;
  };

  "meta.entity_lifecycle": {
    id: string;
    tenant_id: string;
    entity_name: string;
    lifecycle_id: string;
    conditions: unknown | null; // jsonb
    priority: number;
    created_at: Date;
    created_by: string;
  };

  "meta.entity_lifecycle_route_compiled": {
    id: string;
    tenant_id: string;
    entity_name: string;
    compiled_json: unknown; // jsonb
    compiled_hash: string;
    generated_at: Date;
    created_at: Date;
    created_by: string;
  };

  "core.entity_lifecycle_instance": {
    id: string;
    tenant_id: string;
    entity_name: string;
    entity_id: string;
    lifecycle_id: string;
    state_id: string;
    updated_at: Date;
    updated_by: string;
  };

  "core.entity_lifecycle_event": {
    id: string;
    tenant_id: string;
    entity_name: string;
    entity_id: string;
    lifecycle_id: string;
    from_state_id: string | null;
    to_state_id: string;
    operation_code: string;
    occurred_at: Date;
    actor_id: string | null;
    payload: unknown | null; // jsonb
    correlation_id: string | null;
  };

  "audit.permission_decision_log": {
    id: string;
    tenant_id: string;
    occurred_at: Date;
    actor_principal_id: string | null;
    subject_snapshot: unknown | null; // jsonb
    entity_name: string | null;
    entity_id: string | null;
    entity_version_id: string | null;
    operation_code: string;
    effect: string; // 'allow' | 'deny'
    matched_rule_id: string | null;
    matched_policy_version_id: string | null;
    reason: string | null;
    correlation_id: string | null;
  };

  // ===== Entity Registry (Approvable Core Engine) =====

  "meta.entity": {
    id: string;
    tenant_id: string;
    module_id: string;
    name: string;
    kind: string; // 'ref' | 'mdm' | 'doc' | 'ent'
    table_schema: string;
    table_name: string;
    naming_policy: unknown | null; // jsonb (NumberingRule)
    feature_flags: unknown | null; // jsonb (EntityFeatureFlags)
    is_active: boolean;
    created_at: Date;
    created_by: string;
    updated_at: Date | null;
    updated_by: string | null;
  };

  "meta.entity_version": {
    id: string;
    tenant_id: string;
    entity_id: string;
    version_no: number;
    status: string; // VersionStatus
    label: string | null;
    behaviors: unknown | null; // jsonb
    published_at: Date | null;
    published_by: string | null;
    // Governance columns (068_governed_versioning)
    derived_from_version_id: string | null;
    supersedes_version_id: string | null;
    is_effective: boolean;
    effective_from: Date | null;
    effective_to: Date | null;
    approved_at: Date | null;
    approved_by: string | null;
    change_summary: string | null;
    change_type: string | null; // VersionChangeType
    is_working_copy: boolean;
    lock_version: number;
    lifecycle_instance_id: string | null;
    version_hash: string | null;
    created_at: Date;
    created_by: string;
    updated_at: Date | null;
    updated_by: string | null;
  };

  "meta.entity_publish_state": {
    entity_id: string;
    tenant_id: string;
    published_version_id: string | null;
    current_draft_version_id: string | null;
    latest_version_no: number;
    status_summary: string | null;
    last_compiled_at: Date | null;
    last_compiled_hash: string | null;
    last_schema_change_at: Date | null;
    provenance: unknown | null; // jsonb
    updated_at: Date;
  };

  // ===== Numbering Sequence (Approvable Core Engine) =====

  "meta.numbering_sequence": {
    id: string;
    tenant_id: string;
    entity_name: string;
    period_key: string;
    current_value: number;
    updated_at: Date;
  };

  // ===== Approval Templates (Approvable Core Engine) =====

  "meta.approval_template": {
    id: string;
    tenant_id: string;
    code: string;
    name: string;
    behaviors: unknown | null; // jsonb
    escalation_style: string | null;
    version_no: number;
    is_active: boolean;
    compiled_json: unknown | null; // jsonb
    compiled_hash: string | null;
    updated_at: Date | null;
    updated_by: string | null;
    created_at: Date;
    created_by: string;
  };

  "meta.approval_template_stage": {
    id: string;
    tenant_id: string;
    approval_template_id: string;
    stage_no: number;
    name: string | null;
    mode: string; // 'serial' | 'parallel'
    quorum: unknown | null; // jsonb
    created_at: Date;
    created_by: string;
  };

  "meta.approval_template_rule": {
    id: string;
    tenant_id: string;
    approval_template_id: string;
    priority: number;
    conditions: unknown; // jsonb
    assign_to: unknown; // jsonb
    created_at: Date;
    created_by: string;
  };

  // ===== Approval Runtime (Approvable Core Engine) =====

  "wf.approval_instance": {
    id: string;
    tenant_id: string;
    entity_name: string;
    entity_id: string;
    transition_id: string | null;
    approval_template_id: string | null;
    status: string; // DB: 'open' | 'completed' | 'canceled'
    context: unknown | null; // jsonb
    created_at: Date;
    created_by: string;
  };

  "wf.approval_stage": {
    id: string;
    tenant_id: string;
    approval_instance_id: string;
    stage_no: number;
    mode: string; // 'serial' | 'parallel'
    status: string; // 'open' | 'completed' | 'canceled'
    created_at: Date;
  };

  "wf.approval_task": {
    id: string;
    tenant_id: string;
    approval_instance_id: string;
    approval_stage_id: string;
    assignee_principal_id: string | null;
    assignee_group_id: string | null;
    task_type: string; // 'approver' | 'reviewer' | 'watcher'
    status: string; // 'pending' | 'approved' | 'rejected' | 'canceled' | 'expired'
    due_at: Date | null;
    metadata: unknown | null; // jsonb
    decided_at: Date | null;
    decided_by: string | null;
    decision_note: string | null;
    created_at: Date;
  };

  "wf.approval_assignment_snapshot": {
    id: string;
    tenant_id: string;
    approval_task_id: string;
    resolved_assignment: unknown; // jsonb
    resolved_from_rule_id: string | null;
    resolved_from_version_id: string | null;
    created_at: Date;
    created_by: string;
  };

  "wf.approval_escalation": {
    id: string;
    tenant_id: string;
    approval_instance_id: string;
    kind: string; // 'reminder' | 'escalation' | 'reassign'
    payload: unknown | null; // jsonb
    occurred_at: Date;
  };

  "wf.approval_event": {
    id: string;
    tenant_id: string;
    approval_instance_id: string | null;
    approval_task_id: string | null;
    event_type: string;
    payload: unknown | null; // jsonb
    occurred_at: Date;
    actor_id: string | null;
    correlation_id: string | null;
  };

  // ===== Lifecycle Timer (Timer Service) =====

  "meta.lifecycle_transition_hook": {
    id: string;
    tenant_id: string;
    transition_id: string;
    timing: string; // 'on_enter' | 'on_exit' | 'on_success' | 'on_failure'
    action: string; // HookAction
    config: unknown | null; // jsonb
    sort_order: number;
    is_active: boolean;
    // Governance columns (Phase 1: Hook Foundation)
    origin: string; // 'system' | 'tenant' | 'overlay'
    layer_rank: number; // 10=system, 20=tenant, 30=overlay
    contract_role: string; // 'contract' | 'extension'
    safety_level: string; // 'narrowable' | 'replaceable'
    overlay_id: string | null;
    created_at: Date;
    created_by: string;
  };

  "meta.hook_action_registry": {
    id: string;
    tenant_id: string | null;
    action_key: string;
    origin: string; // 'system' | 'tenant'
    label: string;
    description: string | null;
    handler_type: string; // 'built_in' | 'emit_event'
    handler_config: unknown | null; // jsonb
    default_contract_role: string; // 'contract' | 'extension'
    default_safety_level: string; // 'narrowable' | 'replaceable'
    is_active: boolean;
    created_at: Date;
    created_by: string;
  };

  "meta.lifecycle_hook_override": {
    id: string;
    tenant_id: string;
    target_hook_id: string;
    override_kind: string; // 'suppress' | 'replace' | 'add_before' | 'add_after'
    replacement_action: string | null;
    replacement_config: unknown | null; // jsonb
    sort_order: number;
    reason: string | null;
    is_active: boolean;
    created_at: Date;
    created_by: string;
  };

  "meta.lifecycle_timer_policy": {
    id: string;
    tenant_id: string;
    code: string;
    name: string;
    rules: unknown; // jsonb
    created_at: Date;
    created_by: string;
  };

  "wf.lifecycle_timer_schedule": {
    id: string;
    tenant_id: string;
    entity_name: string;
    entity_id: string;
    lifecycle_id: string;
    state_id: string;
    timer_type: string;
    transition_id: string | null;
    scheduled_at: Date;
    fire_at: Date;
    job_id: string;
    policy_id: string | null;
    policy_snapshot: unknown; // jsonb
    status: string;
    created_at: Date;
    created_by: string;
  };
};

/**
 * Type-safe Kysely instance with lifecycle tables
 */
export type LifecycleDB_Type = Kysely<LifecycleDB>;
